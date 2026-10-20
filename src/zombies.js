// Zombie AI: wander, hear noises, see the player, chase via a BFS flow
// field (so they find doors), attack, die, and leave lootable corpses.
import * as THREE from 'three';
import { moveCircle, hasLOS } from './collision.js';

// Binary min-heap of grid indices keyed by f-score (for A*).
class Heap {
  constructor(n) { this.idx = new Int32Array(n); this.key = new Float32Array(n); this.n = 0; }
  push(i, k) {
    let c = this.n++;
    while (c > 0) { const p = (c - 1) >> 1; if (this.key[p] <= k) break; this.idx[c] = this.idx[p]; this.key[c] = this.key[p]; c = p; }
    this.idx[c] = i; this.key[c] = k;
  }
  pop() {
    const top = this.idx[0], li = this.idx[--this.n], lk = this.key[this.n];
    let c = 0;
    for (;;) {
      let m = c * 2 + 1;
      if (m >= this.n) break;
      if (m + 1 < this.n && this.key[m + 1] < this.key[m]) m++;
      if (this.key[m] >= lk) break;
      this.idx[c] = this.idx[m]; this.key[c] = this.key[m]; c = m;
    }
    this.idx[c] = li; this.key[c] = lk;
    return top;
  }
}
import { HALF } from './world.js';
import { sfx } from './audio.js';
import { lookMats, JOINT } from './ragdoll.js';

export const NAV_CELL = 0.6;
export const NAV_N = Math.ceil((HALF * 2) / NAV_CELL);
const TOWN_R = 104; // half-size of the town (zombies are densest there)
export const FIELD_R = 100; // cells around the player covered by the flow field (60 m)

const TYPES = {
  walker: { hp: 100, speed: 1.3, chase: 2.1, dmg: [7, 13], scale: 1, weight: 70 },
  runner: { hp: 70, speed: 1.6, chase: 4.6, dmg: [6, 10], scale: 0.95, weight: 22 },
  brute: { hp: 320, speed: 1.0, chase: 2.6, dmg: [16, 26], scale: 1.3, weight: 8 },
  // Themed variants placed at specific locations (never random spawns)
  patient: { hp: 90, speed: 1.2, chase: 2.2, dmg: [6, 12], scale: 0.97, weight: 0, cloth: [0xc8d8e0, 0xd8dcd8, 0xa8c0c8] },
  soldier: { hp: 170, speed: 1.25, chase: 2.6, dmg: [9, 15], scale: 1.02, weight: 0, armor: 0.4, helmet: true, cloth: [0x4a5a3a, 0x55603e, 0x3e4a30], loot: 'soldier' },
};

const geo = {
  torso: new THREE.BoxGeometry(0.5, 0.65, 0.28),
  head: new THREE.BoxGeometry(0.26, 0.3, 0.26),
  arm: new THREE.BoxGeometry(0.13, 0.13, 0.6),
  leg: new THREE.BoxGeometry(0.17, 0.8, 0.17),
};
geo.arm.translate(0, 0, 0.3);
geo.leg.translate(0, -0.4, 0);
const skinMats = [0x7d8a6a, 0x8a8a70, 0x6f7a62, 0x998a7a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
const clothMats = [0x3a3f4a, 0x5a3a2a, 0x4a4a3a, 0x6a6a6a, 0x2a3a4a, 0x5a2a2a, 0x3a4a2a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });
const deadEyeMat = new THREE.MeshStandardMaterial({ color: 0x2a2010, roughness: 0.4 });
const smooth = (t) => t * t * (3 - 2 * t);
const eyeGeo = new THREE.BoxGeometry(0.05, 0.03, 0.02);
const pickArr = (a) => a[Math.floor(Math.random() * a.length)];

const _ray = new THREE.Raycaster(), _hits = [];

export class Zombies {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.buildNav();
    this.field = new Uint16Array((FIELD_R * 2 + 1) ** 2);
    this.fieldOrigin = [0, 0];
    this.fieldTimer = 0;
    this.spawnTimer = 0;
    this.game = null; // set by the game (ragdolls, effects)
    this.noSpawn = []; // areas zombies never spawn in (trading posts)
    // A* buffers (paths to noises and to targets the flow field doesn't reach)
    const NN = NAV_N * NAV_N;
    this.gScore = new Float32Array(NN); this.came = new Int32Array(NN); this.stamp = new Int32Array(NN);
    this.heap = new Heap(NN); this.searchId = 0; this.pathBudget = 0;
  }

  buildNav() {
    this.blocked = new Uint8Array(NAV_N * NAV_N);
    this.updateNavRegion(-HALF, -HALF, HALF, HALF);
  }

  // Recompute walkable cells in a region, e.g. after a door opens or a wall
  // is built or destroyed.
  updateNavRegion(minX, minZ, maxX, maxZ) {
    const tmp = [];
    const r = 0.32;
    const i0 = Math.max(0, Math.floor((minX - 1 + HALF) / NAV_CELL)), i1 = Math.min(NAV_N - 1, Math.floor((maxX + 1 + HALF) / NAV_CELL));
    const j0 = Math.max(0, Math.floor((minZ - 1 + HALF) / NAV_CELL)), j1 = Math.min(NAV_N - 1, Math.floor((maxZ + 1 + HALF) / NAV_CELL));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const x = -HALF + (i + 0.5) * NAV_CELL, z = -HALF + (j + 0.5) * NAV_CELL;
        const boxes = this.world.hash.query(x - r, z - r, x + r, z + r, tmp);
        let b = 0, win = false;
        for (const box of boxes) {
          // Doors count as walkable: zombies head for them and bash them down.
          if (box.noCollide || box.door) continue;
          if (!(x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r)) continue;
          // Low windows too (2 = zombies only: they smash and climb through)
          if (box.window && box.window.sill < 1.2) { win = true; continue; }
          b = 1; break;
        }
        this.blocked[i * NAV_N + j] = b ? 1 : win ? 2 : 0;
      }
    }
    this.fieldTimer = 0;
  }

  // BFS distance field over a window centered on the target.
  updateField(tx, tz) {
    const ci = Math.floor((tx + HALF) / NAV_CELL), cj = Math.floor((tz + HALF) / NAV_CELL);
    const W = FIELD_R * 2 + 1;
    const f = this.field;
    f.fill(65535);
    this.fieldOrigin = [ci - FIELD_R, cj - FIELD_R];
    const q = new Int32Array(W * W);
    let qh = 0, qt = 0;
    const start = FIELD_R * W + FIELD_R;
    f[start] = 0; q[qt++] = start;
    const [oi, oj] = this.fieldOrigin;
    while (qh < qt) {
      const cur = q[qh++];
      const li = Math.floor(cur / W), lj = cur % W;
      const d = f[cur] + 1;
      for (let k = 0; k < 4; k++) {
        const ni = li + (k === 0 ? 1 : k === 1 ? -1 : 0), nj = lj + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
        const idx = ni * W + nj;
        if (f[idx] !== 65535) continue;
        const gi = oi + ni, gj = oj + nj;
        if (gi < 0 || gj < 0 || gi >= NAV_N || gj >= NAV_N || this.blocked[gi * NAV_N + gj] === 1) continue;
        f[idx] = d;
        q[qt++] = idx;
      }
    }
  }

  // Direction to step along the flow field, or null if outside it.
  flowDir(x, z) {
    const W = FIELD_R * 2 + 1;
    const [oi, oj] = this.fieldOrigin;
    const li = Math.floor((x + HALF) / NAV_CELL) - oi, lj = Math.floor((z + HALF) / NAV_CELL) - oj;
    if (li < 1 || lj < 1 || li >= W - 1 || lj >= W - 1) return null;
    let best = this.field[li * W + lj], bi = 0, bj = 0;
    if (best === 65535) {
      // Standing in a "blocked" cell (hugging a wall) — use neighbors anyway.
      best = 65534;
    }
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        // no corner cutting
        if (di && dj && (this.field[(li + di) * W + lj] === 65535 || this.field[li * W + lj + dj] === 65535)) continue;
        const v = this.field[(li + di) * W + lj + dj];
        if (v < best) { best = v; bi = di; bj = dj; }
      }
    }
    if (!bi && !bj) return null;
    const tx = -HALF + (oi + li + bi + 0.5) * NAV_CELL, tz = -HALF + (oj + lj + bj + 0.5) * NAV_CELL;
    const dx = tx - x, dz = tz - z;
    const l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  // A* over the nav grid (8-way, no corner cutting). Returns waypoints, or a
  // partial path toward the target if the search budget runs out.
  findPath(sx, sz, tx, tz, budget = 4000) {
    const N = NAV_N, cell = (x) => Math.max(0, Math.min(N - 1, Math.floor((x + HALF) / NAV_CELL)));
    let si = cell(sx), sj = cell(sz), ti = cell(tx), tj = cell(tz);
    const B = this.blocked;
    if (B[ti * N + tj] === 1) {
      // Target inside an obstacle: use the nearest open cell.
      let best = -1, bd = Infinity;
      for (let di = -4; di <= 4; di++) for (let dj = -4; dj <= 4; dj++) {
        const i = ti + di, j = tj + dj;
        if (i < 0 || j < 0 || i >= N || j >= N || B[i * N + j] === 1) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = i * N + j; }
      }
      if (best < 0) return null;
      ti = Math.floor(best / N); tj = best % N;
    }
    const id = ++this.searchId, g = this.gScore, came = this.came, st = this.stamp, heap = this.heap;
    const start = si * N + sj, goal = ti * N + tj;
    const h = (i, j) => { const a = Math.abs(i - ti), b = Math.abs(j - tj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
    heap.n = 0;
    g[start] = 0; st[start] = id; came[start] = -1;
    heap.push(start, h(si, sj));
    let bestNode = start, bestH = h(si, sj), found = false;
    while (heap.n && budget-- > 0) {
      const cur = heap.pop();
      if (cur === goal) { found = true; break; }
      const ci = Math.floor(cur / N), cj = cur % N, gc = g[cur];
      const hc = h(ci, cj);
      if (hc < bestH) { bestH = hc; bestNode = cur; }
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
          const nIdx = ni * N + nj;
          if (B[nIdx] === 1 && nIdx !== start) continue;
          if (di && dj && (B[ci * N + nj] === 1 || B[ni * N + cj] === 1)) continue;
          const ng = gc + (di && dj ? 1.414 : 1) + (B[nIdx] === 2 ? 4 : 0); // prefer doors to windows
          if (st[nIdx] === id && g[nIdx] <= ng) continue;
          st[nIdx] = id; g[nIdx] = ng; came[nIdx] = cur;
          heap.push(nIdx, ng + h(ni, nj));
        }
      }
    }
    let n = found ? goal : bestNode;
    if (n === start) return null;
    const out = [];
    while (n !== -1 && n !== start) { out.push({ x: -HALF + (Math.floor(n / N) + 0.5) * NAV_CELL, z: -HALF + ((n % N) + 0.5) * NAV_CELL }); n = came[n]; }
    out.reverse();
    // Drop waypoints on straight runs
    const thin = [];
    for (let i = 0; i < out.length; i++) {
      if (i > 0 && i < out.length - 1) {
        const a = out[i - 1], b = out[i], c = out[i + 1];
        if (Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) < 1e-6) continue;
      }
      thin.push(out[i]);
    }
    return thin;
  }

  // Steer along a cached A* path to (tx, tz); repaths when the target moves
  // or the path goes stale. Returns a unit direction, or null.
  pathDir(zb, tx, tz, dt) {
    zb.pathT = (zb.pathT ?? 0) - dt;
    const moved = zb.pathGoal ? Math.hypot(zb.pathGoal.x - tx, zb.pathGoal.z - tz) : Infinity;
    if ((zb.pathT <= 0 || moved > 3 || !zb.path) && this.pathBudget > 0) {
      this.pathBudget--;
      zb.path = this.findPath(zb.pos.x, zb.pos.z, tx, tz);
      zb.pathGoal = { x: tx, z: tz };
      zb.pathT = 2.5 + Math.random();
    }
    const path = zb.path;
    if (!path?.length) return null;
    while (path.length > 1 && Math.hypot(path[0].x - zb.pos.x, path[0].z - zb.pos.z) < 0.45) path.shift();
    const w = path[0];
    const dx = w.x - zb.pos.x, dz = w.z - zb.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.2) { path.shift(); return null; }
    return [dx / l, dz / l];
  }

  // Something happened near (x, z) that zombies close by would notice (a
  // bullet smacking into a wall, a zombie dropping): they turn and come to
  // look where it came from.
  alertNear(x, z, r, srcX, srcZ) {
    for (const zb of this.list) {
      if (zb.dead || zb.down || zb.state === 'chase') continue;
      if (Math.hypot(zb.pos.x - x, zb.pos.z - z) > r) continue;
      zb.state = 'investigate';
      zb.target = { x: srcX + (Math.random() - 0.5) * 4, z: srcZ + (Math.random() - 0.5) * 4 };
      zb.path = null;
      zb.hurry = 1;
    }
  }

  randomOpenPoint(awayFrom, minDist, avoid) {
    for (let i = 0; i < 50; i++) {
      // Most of the dead are in town; the countryside is thinner.
      const R = Math.random() < 0.72 ? TOWN_R : HALF - 4;
      const x = (Math.random() * 2 - 1) * R, z = (Math.random() * 2 - 1) * R;
      const gi = Math.floor((x + HALF) / NAV_CELL), gj = Math.floor((z + HALF) / NAV_CELL);
      if (this.blocked[gi * NAV_N + gj]) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDist) continue;
      // Never spawn in or right next to the player's safehouse.
      if (avoid && x > avoid.x0 - 15 && x < avoid.x1 + 15 && z > avoid.z0 - 15 && z < avoid.z1 + 15) continue;
      if (this.noSpawn.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1)) continue;
      return { x, z };
    }
    return null;
  }

  spawn(x, z, typeName) {
    if (!typeName) {
      const r = Math.random() * 100;
      typeName = r < TYPES.walker.weight ? 'walker' : r < TYPES.walker.weight + TYPES.runner.weight ? 'runner' : 'brute';
    }
    const t = TYPES[typeName];
    const g = new THREE.Group();
    const skin = pickArr(skinMats);
    const cloth = t.cloth ? new THREE.MeshStandardMaterial({ color: pickArr(t.cloth), roughness: 1 }) : pickArr(clothMats);
    const pants = t.cloth ? cloth : pickArr(clothMats);
    const torso = new THREE.Mesh(geo.torso, cloth); torso.position.y = 1.15;
    const head = new THREE.Mesh(geo.head, skin); head.position.y = 1.65;
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(-0.06, 0.03, 0.135);
    const e2 = e1.clone(); e2.position.x = 0.06;
    head.add(e1, e2);
    const armL = new THREE.Mesh(geo.arm, skin); armL.position.set(-0.32, 1.38, 0);
    const armR = new THREE.Mesh(geo.arm, skin); armR.position.set(0.32, 1.38, 0);
    const legL = new THREE.Mesh(geo.leg, pants); legL.position.set(-0.13, 0.82, 0);
    const legR = new THREE.Mesh(geo.leg, pants); legR.position.set(0.13, 0.82, 0);
    g.add(torso, head, armL, armR, legL, legR);
    if (t.helmet) {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3e4a30, roughness: 0.8 }));
      helmet.position.y = 0.08; head.add(helmet);
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.32), new THREE.MeshStandardMaterial({ color: 0x3a4430, roughness: 0.9 }));
      vest.position.y = 1.2; g.add(vest);
    }
    g.traverse((o) => { o.castShadow = true; });
    g.scale.setScalar(t.scale);
    g.rotation.order = 'YXZ'; // lean (x, z) is applied in the body's own frame
    g.position.set(x, 0, z);
    this.scene.add(g);
    const zb = {
      mesh: g, parts: { head, torso, armL, armR, legL, legR }, type: typeName, def: t,
      pos: g.position, hp: t.hp, maxHp: t.hp, state: 'wander', target: null, lastSeen: 0,
      phase: Math.random() * 10, attackCd: 0, losTimer: Math.random() * 0.3, canSee: false,
      groanTimer: 3 + Math.random() * 10, wanderTimer: 0, dir: Math.random() * Math.PI * 2,
      radius: 0.32 * t.scale, height: 1.85 * t.scale, stagger: 0, dead: false, stuck: 0,
      // Hit reactions: body lean and head snap springs, current velocity,
      // knocked-down ragdoll and the get-up animation.
      lean: { x: 0, z: 0, vx: 0, vz: 0 }, headKick: { x: 0, v: 0 }, vx: 0, vz: 0, down: null, rise: 0, riseSide: 1,
      look: { kind: 'zombie', skin: skin.color.getHex(), top: cloth.color.getHex(), bottom: pants.color.getHex(), ...(t.helmet ? { helmet: 0x3e4a30, vest: 0x3a4430 } : {}) },
    };
    this.list.push(zb);
    return zb;
  }

  serialize() {
    return this.list.map((z) => ({ x: +z.pos.x.toFixed(2), z: +z.pos.z.toFixed(2), type: z.type, hp: Math.round(z.hp) }));
  }

  restore(saved) {
    for (const s of saved) { const z = this.spawn(s.x, s.z, s.type); z.hp = s.hp; }
  }

  populate(count, player) {
    for (let i = 0; i < count; i++) {
      const p = this.randomOpenPoint(player, 30);
      if (p) this.spawn(p.x, p.z);
    }
    // Themed groups at landmarks: patients in the hospital, soldiers at
    // military sites, staff and customers in shops and offices.
    for (const sp of this.world.zombieSpawns || []) {
      if (Math.hypot(sp.x - player.x, sp.z - player.z) < 30) continue;
      for (let k = 0; k < sp.n; k++) {
        for (let tries = 0; tries < 8; tries++) {
          const x = sp.x + (Math.random() * 2 - 1) * sp.r, z = sp.z + (Math.random() * 2 - 1) * sp.r;
          const gi = Math.floor((x + HALF) / NAV_CELL), gj = Math.floor((z + HALF) / NAV_CELL);
          if (this.blocked[gi * NAV_N + gj]) continue;
          this.spawn(x, z, sp.type || undefined);
          break;
        }
      }
    }
    // Small hordes around a few buildings
    for (let i = 0; i < 4; i++) {
      const b = this.world.buildings[Math.floor(Math.random() * this.world.buildings.length)];
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (Math.hypot(cx - player.x, cz - player.z) < 35) continue;
      for (let k = 0; k < 6; k++) this.spawn(cx + (Math.random() - 0.5) * 4, cz + (Math.random() - 0.5) * 4);
    }
  }

  // A noise at (x,z) with radius r draws zombies that hear it.
  noise(x, z, r, loud = false) {
    // Rain and wind drown out ordinary noises (not thunder or gunfire-loud ones)
    const W = this.game?.weather;
    if (W && !loud) r *= W.hearMul;
    for (const zb of this.list) {
      if (zb.dead || zb.down || zb.state === 'chase') continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
      if (d < r) { zb.state = 'investigate'; zb.target = { x: x + (Math.random() - 0.5) * 3, z: z + (Math.random() - 0.5) * 3 }; zb.path = null; zb.hurry = d < r * 0.5 ? 1 : 0; }
    }
  }

  // hit: { point, dir, force } from the bullet or blow (for reactions and ragdolls)
  damage(zb, amount, fromX, fromZ, head = false, hit = null) {
    if (zb.dead) return false;
    // Armored zombies (soldiers) shrug off body shots; headshots go through.
    if (zb.def.armor && !head) amount *= 1 - zb.def.armor;
    zb.hp -= amount;
    zb.stagger = 0.35;
    // Shot from anywhere: it knows where you are now and comes for you.
    zb.state = 'chase';
    zb.prey = null;
    zb.lastSeen = 6;
    zb.flail = 0.6;
    if (zb.hp <= 0) {
      this.kill(zb, hit, head);
      this.alertNear(zb.pos.x, zb.pos.z, 9, fromX, fromZ);
      return true;
    }
    if (zb.down) { if (hit) zb.down.impulse(hit.point, hit.dir, hit.force); return false; }
    // knockback
    const dx = zb.pos.x - fromX, dz = zb.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    moveCircle(this.world.hash, zb.pos, zb.radius, (dx / l) * 0.25, (dz / l) * 0.25);
    if (hit) this.react(zb, hit, head);
    return false;
  }

  // Flinch: the body rocks away from the hit, the head snaps on headshots.
  // Leg hits and heavy blows can take a zombie off its feet.
  react(zb, hit, head) {
    const s = Math.sin(zb.dir), c = Math.cos(zb.dir);
    const lz = hit.dir.x * s + hit.dir.z * c, lx = hit.dir.x * c - hit.dir.z * s;
    const f = hit.force * (zb.type === 'brute' ? 0.4 : 1);
    zb.lean.vx += lz * f * 1.4;
    zb.lean.vz -= lx * f * 1.4 + (Math.random() - 0.5) * f * 0.6;
    if (head) zb.headKick.v += lz * f * 3 + (Math.random() - 0.5) * f;
    if (zb.rise > 0) return;
    const legHit = hit.point.y < 0.85 * zb.def.scale;
    let chance = (legHit ? 0.3 : 0) + Math.max(0, (f - 3.5) * 0.12) + (hit.knock || 0);
    if (zb.type === 'brute') chance *= 0.3;
    if (Math.random() < chance) this.knockDown(zb, hit);
  }

  ragdollSpec(zb, extra) {
    const look = zb.look;
    const mats = lookMats(look);
    mats.skin = zb.parts.head.material; mats.top = zb.parts.torso.material; mats.bottom = zb.parts.legL.material;
    mats.extra.push({ size: [0.05, 0.03, 0.02], off: [-0.06, 0.03, 0.13], on: 'head', mat: extra.dead ? deadEyeMat : eyeMat },
      { size: [0.05, 0.03, 0.02], off: [0.06, 0.03, 0.13], on: 'head', mat: extra.dead ? deadEyeMat : eyeMat });
    zb.mesh.updateMatrixWorld(true);
    return {
      matrix: zb.mesh.matrixWorld, kind: 'zombie', scale: zb.def.scale, mats, look,
      vel: new THREE.Vector3(zb.vx, 0, zb.vz), owner: zb, ...extra,
    };
  }

  knockDown(zb, hit) {
    const rd = this.game?.ragdolls;
    if (!rd) return;
    const r = rd.create(this.ragdollSpec(zb, { alive: true, tone: 0.7, toneDecay: 1.4 }));
    r.impulse(hit.point, hit.dir, hit.force * 1.3);
    if (hit.point.y < 0.9 * zb.def.scale) r.sweepLegs(hit.dir, 1.2 + hit.force * 0.5);
    zb.down = r;
    zb.downT = 0.8 + Math.random() * 1.6;
    zb.mesh.visible = false;
    zb.lean.x = zb.lean.z = zb.lean.vx = zb.lean.vz = 0;
  }

  // Knocked down: the body follows its ragdoll until it has settled, then
  // the zombie climbs back to its feet.
  updateDown(zb, dt) {
    const r = zb.down;
    zb.pos.x = r.pelvis.x; zb.pos.z = r.pelvis.z;
    if (r.sleeping || r.age > 5) { zb.downT -= dt; if (zb.downT <= 0) this.getUp(zb); }
  }

  getUp(zb) {
    const r = zb.down, P = r.p;
    const fx = (P[JOINT.FTL].x + P[JOINT.FTR].x) / 2, fz = (P[JOINT.FTL].z + P[JOINT.FTR].z) / 2;
    const yaw = r.yaw, faceDown = r.faceDown;
    this.game.ragdolls.remove(r);
    zb.down = null;
    zb.pos.set(fx, 0, fz);
    moveCircle(this.world.hash, zb.pos, zb.radius, 0, 0);
    // Lying along the body, then pivoting up on the feet.
    zb.dir = faceDown ? yaw : yaw + Math.PI;
    zb.riseSide = faceDown ? 1 : -1;
    zb.rise = 1;
    zb.mesh.visible = true;
    zb.vx = zb.vz = 0;
  }

  kill(zb, hit, head) {
    zb.dead = true;
    const game = this.game;
    this.scene.remove(zb.mesh);
    const c = this.world.addContainer(zb.def.loot || 'body', zb.pos.x, zb.pos.z);
    c.type = 'body';
    c.name = zb.def.loot === 'soldier' ? 'Dead Soldier' : 'Zombie';
    c.color = zb.look.top;
    c.look = zb.look;
    if (!zb.def.loot && Math.random() < 0.65) c.grid.items.length = 0; // most zombies carry nothing
    this.list.splice(this.list.indexOf(zb), 1);
    if (!game?.ragdolls) return;
    // The body keeps its momentum, takes the killing blow, and crumples:
    // headshots drop it limp on the spot, body shots buckle the knees first.
    let r = zb.down;
    if (r) { r.alive = false; r.tone = 0; r.owner = null; }
    else r = game.ragdolls.create(this.ragdollSpec(zb, { dead: true, tone: head ? 0 : 0.85, toneDecay: 1.3 + Math.random(), spasms: head ? 0 : 2 + Math.floor(Math.random() * 3) }));
    r.owner = null;
    if (hit) r.impulse(hit.point, hit.dir, hit.force * (head ? 0.8 : 1.2));
    if (hit && hit.point.y < 0.9 * zb.def.scale) r.sweepLegs(hit.dir, 1 + hit.force * 0.4);
    c.ragdoll = r;
    r.onSettle = (rr) => {
      c.x = rr.pelvis.x; c.z = rr.pelvis.z;
      if (!rr.pooled) { rr.pooled = true; game.fx.pool((rr.pelvis.x + rr.p[JOINT.CHE].x) / 2, (rr.pelvis.z + rr.p[JOINT.CHE].z) / 2, 0.9 + Math.random() * 0.7); }
    };
    if (r.sleeping) { r.onSettle(r); r.freeze(); }
  }

  update(dt, player, game) {
    const hash = this.world.hash;
    const px = player.pos.x, pz = player.pos.z;

    this.fieldTimer -= dt;
    if (this.fieldTimer <= 0) { this.fieldTimer = 0.35; this.updateField(px, pz); }

    // Trickle spawns keep the town alive; more over time.
    this.spawnTimer -= dt;
    const cap = 115 + Math.min(80, game.day * 8);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = game.isNight ? 5 : 10;
      if (this.list.length < cap) {
        const p = this.randomOpenPoint(player.pos, 45, game.safehouse);
        if (p) { const z = this.spawn(p.x, p.z); if (Math.random() < 0.5) { z.state = 'investigate'; z.target = { x: px, z: pz }; } }
      }
    }

    let nearest = Infinity;
    this.pathBudget = 3; // A* searches allowed this frame
    for (const zb of this.list) {
      if (zb.down) { this.updateDown(zb, dt); continue; }
      if (zb.vault) { this.updateVault(zb, dt); continue; }
      // A zombie hunts either the player or an AI survivor ("prey").
      if (zb.prey && zb.prey.dead) { zb.prey = null; if (zb.state === 'chase') zb.state = 'wander'; }
      const prey = zb.prey;
      const pdist = Math.hypot(px - zb.pos.x, pz - zb.pos.z);
      const tx0 = prey ? prey.pos.x : px, tz0 = prey ? prey.pos.z : pz;
      const dx = tx0 - zb.pos.x, dz = tz0 - zb.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, pdist);

      // Hidden beyond what the fog lets you see (saves draw calls); in clear
      // daylight that's far enough to pick them off through a scope.
      zb.mesh.visible = pdist < Math.min(game.camera.far, game.isNight ? 80 : 200);
      // Too far away: cheap sleep update.
      if (pdist > 90 && !prey && zb.state === 'wander') continue;

      // Perception (staggered)
      zb.losTimer -= dt;
      if (zb.losTimer <= 0) {
        zb.losTimer = 0.25;
        let range = (player.flashlight ? 30 : 18) * (game.isNight ? 0.8 : 1.3) * player.stealthMul * (game.dev?.invisible ? 0 : 1) * (game.weather?.sightMul ?? 1);
        if (player.prone) range *= 0.4;
        else if (player.crouch) range *= 0.6;
        const seesPlayer = pdist < range && hasLOS(hash, zb.pos.x, zb.pos.z, px, pz);
        const facing = (x, z, d) => {
          // Zombies need roughly to face their target unless it's very close.
          const ang = Math.atan2(x - zb.pos.x, z - zb.pos.z);
          const da = Math.abs(((ang - zb.dir + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
          return d < 4 || da < 1.4 || zb.state === 'chase';
        };
        const surv = game.survivors?.nearestVisible(zb.pos, game.isNight ? 14 : 20);
        if (seesPlayer && (!surv || pdist <= surv.d) && facing(px, pz, pdist)) {
          zb.prey = null; zb.state = 'chase'; zb.lastSeen = 4;
        } else if (surv && facing(surv.s.pos.x, surv.s.pos.z, surv.d)) {
          zb.prey = surv.s; zb.state = 'chase'; zb.lastSeen = 4;
        }
        zb.canSee = zb.prey ? !!surv && surv.s === zb.prey : seesPlayer;
      }

      let mx = 0, mz = 0, speed = 0;
      if (zb.state === 'chase') {
        zb.lastSeen -= dt;
        if (zb.lastSeen <= 0 && !zb.canSee) { zb.state = 'investigate'; zb.target = { x: tx0, z: tz0 }; zb.prey = null; }
        speed = zb.def.chase * (game.isNight ? 1.15 : 1) * (game.weather?.zombieSpeedMul ?? 1);
        // The flow field leads to the player (through doors, which get
        // bashed); beyond it, or after survivors out of sight, A* paths.
        const direct = zb.canSee && dist < 6 && hasLOS(hash, zb.pos.x, zb.pos.z, tx0, tz0);
        let dir = null;
        if (!direct) dir = (!prey && this.flowDir(zb.pos.x, zb.pos.z)) || this.pathDir(zb, tx0, tz0, dt);
        if (dir) { mx = dir[0]; mz = dir[1]; }
        else { mx = dx / (dist || 1); mz = dz / (dist || 1); }
      } else if (zb.state === 'investigate') {
        const tx = zb.target.x - zb.pos.x, tz = zb.target.z - zb.pos.z;
        const td = Math.hypot(tx, tz);
        if (td < 1.2 || (zb.path && !zb.path.length && td < 3)) { zb.state = 'wander'; zb.wanderTimer = 4; zb.path = null; zb.hurry = 0; }
        else {
          // Walk (or hurry, if it was close) to the noise, finding a way round walls.
          const dir = td < 12 && hasLOS(hash, zb.pos.x, zb.pos.z, zb.target.x, zb.target.z) ? null : this.pathDir(zb, zb.target.x, zb.target.z, dt);
          if (dir) { mx = dir[0]; mz = dir[1]; } else { mx = tx / td; mz = tz / td; }
          speed = zb.hurry ? Math.max(zb.def.speed * 1.5, zb.def.chase * 0.75) : zb.def.speed * 1.3;
        }
      } else {
        zb.wanderTimer -= dt;
        if (zb.wanderTimer <= 0) { zb.wanderTimer = 3 + Math.random() * 6; zb.dir += (Math.random() - 0.5) * 2.5; zb.idle = Math.random() < 0.4; }
        if (!zb.idle) { mx = Math.sin(zb.dir); mz = Math.cos(zb.dir); speed = zb.def.speed * 0.6; }
      }

      if (zb.stagger > 0) { zb.stagger -= dt; speed *= 0.2; }
      // Stuck against something it can't bash: sidestep for a moment.
      if (zb.detour > 0 && speed > 0) { zb.detour -= dt; const ds = zb.detourSide; const ox = mx; mx = mx * 0.3 - mz * ds; mz = mz * 0.3 + ox * ds; }
      if (zb.rise > 0) { zb.rise -= dt / 1.4; speed = 0; }

      // Separation from other zombies (only nearby ones matter)
      if (speed > 0) {
        for (const o of this.list) {
          if (o === zb || o.down) continue;
          const ox = zb.pos.x - o.pos.x, oz = zb.pos.z - o.pos.z;
          const d2 = ox * ox + oz * oz;
          if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); mx += (ox / d) * 0.8; mz += (oz / d) * 0.8; }
        }
      }

      // Attack
      zb.attackCd -= dt;
      const reach = 1.0 * zb.def.scale;
      // Only with nothing in between (no clawing through closed doors or walls).
      if (dist < reach + 0.1 && zb.state === 'chase' && !(zb.rise > 0) && hasLOS(hash, zb.pos.x, zb.pos.z, tx0, tz0)) {
        speed = 0;
        if (zb.attackCd <= 0) {
          zb.attackCd = 1.3;
          const [a, b] = zb.def.dmg;
          const dmg = a + Math.random() * (b - a);
          if (prey) prey.hurt(dmg, 'zombie', zb);
          else player.takeZombieHit(dmg, zb);
        }
      }

      // A closed door or window between it and what it's after: beat on it
      // (or climb through, if the window's already open or smashed).
      if (zb.state !== 'wander' && !(zb.rise > 0) && (zb.attackCd <= 0 || zb.stuck > 0.2)) {
        const s = this.structureNear(zb);
        const gx = zb.state === 'chase' ? tx0 : zb.target.x, gz = zb.state === 'chase' ? tz0 : zb.target.z;
        if (s && (s.kind === 'door' || s.kind === 'window') && this.across(s, zb.pos.x, zb.pos.z, gx, gz)) {
          if (s.kind === 'window' && s.state !== 'closed' && s.sill < 1.2) { this.startVault(zb, s); continue; }
          if (zb.attackCd <= 0 && (s.kind === 'door' || s.state === 'closed')) {
            zb.attackCd = 1.5;
            zb.dir = Math.atan2(s.x - zb.pos.x, s.z - zb.pos.z);
            game.damageStructure(s, zb.def.dmg[1] * (zb.type === 'brute' ? 3 : 1) * (s.kind === 'door' ? 1.5 : 1), zb.pos);
          }
        }
      }

      const ml = Math.hypot(mx, mz);
      if (ml > 0.01 && speed > 0) {
        const before = { x: zb.pos.x, z: zb.pos.z };
        moveCircle(hash, zb.pos, zb.radius, (mx / ml) * speed * dt, (mz / ml) * speed * dt);
        // Don't walk into the player
        const pdx = zb.pos.x - px, pdz = zb.pos.z - pz, pd = Math.hypot(pdx, pdz);
        const minD = zb.radius + player.radius;
        if (pd < minD && pd > 1e-4) { zb.pos.x = px + (pdx / pd) * minD; zb.pos.z = pz + (pdz / pd) * minD; }
        const moved = Math.hypot(zb.pos.x - before.x, zb.pos.z - before.z);
        zb.vx = (zb.pos.x - before.x) / dt; zb.vz = (zb.pos.z - before.z) / dt;
        // Blocked while chasing or following a noise: bash the door or
        // barricade in the way; if it's a plain wall, sidestep and repath.
        if (zb.state !== 'wander' && moved < speed * dt * 0.3) {
          zb.stuck += dt;
          const s = zb.stuck > 0.3 ? this.structureNear(zb) : null;
          const climbable = s?.kind === 'window' && s.state !== 'closed';
          if (climbable && s.sill < 1.2) this.startVault(zb, s);
          else if (zb.stuck > 0.6 && zb.attackCd <= 0) {
            if (s && !climbable) { zb.attackCd = 1.5; game.damageStructure(s, zb.def.dmg[1] * (zb.type === 'brute' ? 3 : 1) * (s.kind === 'door' ? 1.5 : 1), zb.pos); }
            else if (!(zb.detour > 0)) { zb.detour = 0.5 + Math.random() * 0.5; zb.detourSide = Math.random() < 0.5 ? 1 : -1; zb.pathT = 0; zb.stuck = 0; }
          }
        } else zb.stuck = 0;
        // stuck while wandering → turn around
        if (zb.state === 'wander' && moved < speed * dt * 0.3) zb.dir += Math.PI * (0.5 + Math.random());
        const targetDir = Math.atan2(mx, mz);
        let dd = targetDir - zb.dir;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        zb.dir += dd * Math.min(1, dt * 6);
        zb.phase += moved * 3.2;
      } else {
        zb.vx = zb.vz = 0;
        if (zb.state === 'chase' && !(zb.rise > 0)) zb.dir = Math.atan2(dx, dz);
      }

      // Animate
      const p = zb.parts;
      zb.mesh.rotation.y = zb.dir;
      // Hit reaction springs; while getting up the body pivots up from the ground.
      const L = zb.lean, K = zb.headKick;
      L.vx += (-70 * L.x - 10 * L.vx) * dt; L.vz += (-70 * L.z - 10 * L.vz) * dt;
      L.x += L.vx * dt; L.z += L.vz * dt;
      K.v += (-90 * K.x - 9 * K.v) * dt; K.x += K.v * dt;
      zb.mesh.rotation.x = L.x + (zb.rise > 0 ? zb.riseSide * (Math.PI / 2) * smooth(Math.min(1, zb.rise)) : 0);
      zb.mesh.rotation.z = L.z;
      const swing = Math.sin(zb.phase) * 0.6;
      p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
      const reachUp = zb.state === 'chase' ? -0.15 : 0.5;
      p.armL.rotation.x = reachUp + Math.sin(zb.phase * 0.5) * 0.15;
      p.armR.rotation.x = reachUp + Math.cos(zb.phase * 0.5) * 0.15;
      if (zb.attackCd > 1.0) { p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6; }
      p.torso.rotation.x = zb.state === 'chase' ? 0.18 : 0.08;
      p.head.rotation.z = Math.sin(zb.phase * 0.3 + zb.groanTimer) * 0.25;
      p.head.rotation.x = K.x;
      if (zb.flail > 0) {
        // Arms thrown out by the hit
        zb.flail -= dt;
        const k = Math.max(0, zb.flail / 0.6);
        p.armL.rotation.x -= k * 0.9; p.armR.rotation.x -= k * 0.7;
        p.armL.rotation.z = k * 0.6; p.armR.rotation.z = -k * 0.5;
      } else { p.armL.rotation.z = 0; p.armR.rotation.z = 0; }
      if (zb.rise > 0.3) { p.armL.rotation.x = p.armR.rotation.x = 1.2; p.legL.rotation.x = p.legR.rotation.x = 0; }

      // Groans
      zb.groanTimer -= dt;
      if (zb.groanTimer <= 0) {
        zb.groanTimer = (zb.state === 'chase' ? 2.5 : 8) + Math.random() * 8;
        if (dist < 30) sfx.groan((1 - dist / 30) * 0.8);
      }
    }
    this.nearest = nearest;
  }

  structureNear(zb) {
    const r = zb.radius + 0.5;
    let best = null, bd = r;
    for (const b of this.world.hash.query(zb.pos.x - r, zb.pos.z - r, zb.pos.x + r, zb.pos.z + r, [])) {
      if (!b.structure || b.noCollide) continue;
      const cx = Math.max(b.minX, Math.min(zb.pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(zb.pos.z, b.maxZ));
      const d = Math.hypot(zb.pos.x - cx, zb.pos.z - cz);
      if (d < bd) { bd = d; best = b.structure; }
    }
    return best;
  }

  // Are (ax, az) and (bx, bz) on opposite sides of this door or window?
  across(s, ax, az, bx, bz) {
    const nx = s.ax === 'x' ? 0 : 1, nz = s.ax === 'x' ? 1 : 0;
    return Math.sign((ax - s.x) * nx + (az - s.z) * nz) * Math.sign((bx - s.x) * nx + (bz - s.z) * nz) < 0;
  }

  // Climb through an open or smashed window: over the sill and down the
  // other side, sometimes tumbling through in a heap.
  startVault(zb, w) {
    const nx = w.ax === 'x' ? 0 : 1, nz = w.ax === 'x' ? 1 : 0;
    const side = Math.sign((zb.pos.x - w.x) * nx + (zb.pos.z - w.z) * nz) || 1;
    const along = Math.max(-w.w / 2 + 0.35, Math.min(w.w / 2 - 0.35, w.ax === 'x' ? zb.pos.x - w.x : zb.pos.z - w.z));
    const ux = w.ax === 'x' ? 1 : 0, uz = w.ax === 'x' ? 0 : 1;
    zb.vault = {
      t: 0, dur: 1.2 + Math.random() * 0.6, w, dirX: -nx * side, dirZ: -nz * side,
      from: { x: zb.pos.x, z: zb.pos.z },
      to: { x: w.x + ux * along - nx * side * 0.8, z: w.z + uz * along - nz * side * 0.8 },
    };
    zb.dir = Math.atan2(-nx * side, -nz * side);
    zb.stuck = 0;
    zb.path = null;
  }

  updateVault(zb, dt) {
    const v = zb.vault;
    v.t = Math.min(1, v.t + dt / v.dur);
    const k = v.t;
    zb.pos.x = v.from.x + (v.to.x - v.from.x) * k;
    zb.pos.z = v.from.z + (v.to.z - v.from.z) * k;
    zb.pos.y = Math.sin(k * Math.PI) * (v.w.sill * 0.7);
    zb.mesh.rotation.y = zb.dir;
    zb.mesh.rotation.x = Math.sin(k * Math.PI) * 0.9; // folded over the sill
    const p = zb.parts;
    p.armL.rotation.x = p.armR.rotation.x = 0.4 + Math.sin(k * Math.PI) * 0.8;
    p.legL.rotation.x = -Math.sin(k * Math.PI) * 0.9; p.legR.rotation.x = -Math.sin(k * Math.PI) * 0.6;
    if (k < 1) return;
    zb.vault = null;
    zb.pos.y = 0;
    zb.mesh.rotation.x = 0;
    moveCircle(this.world.hash, zb.pos, zb.radius, 0, 0);
    // Zombies are clumsy: a fair share fall in head first
    if (Math.random() < 0.35 && this.game?.ragdolls) {
      const dir = new THREE.Vector3(v.dirX, -0.2, v.dirZ).normalize();
      this.knockDown(zb, { point: new THREE.Vector3(zb.pos.x, 1.3 * zb.def.scale, zb.pos.z), dir, force: 2.5 });
    }
  }

  // 3D ray test against zombies. Returns { zb, t, head } for the closest hit.
  // Bullets hit the body you see (leaning, lunging, staggering), not an
  // upright cylinder: a generous cylinder rejects most zombies cheaply, then
  // the ray is tested against the actual body-part meshes.
  raycast(origin, dir, maxDist) {
    let best = null;
    _ray.set(origin, dir); _ray.near = 0; _ray.far = maxDist;
    for (const zb of this.list) {
      if (zb.down) continue; // knocked-down bodies are hit through their ragdoll
      const ox = zb.pos.x - origin.x, oz = zb.pos.z - origin.z;
      const hd = Math.hypot(dir.x, dir.z) || 1e-6;
      // closest approach in XZ
      const tAlong = (ox * dir.x + oz * dir.z) / (hd * hd);
      if (tAlong < -1 || tAlong > maxDist + 1) continue;
      const cx = origin.x + dir.x * tAlong - zb.pos.x, cz = origin.z + dir.z * tAlong - zb.pos.z;
      if (Math.hypot(cx, cz) > 1.1 * zb.def.scale) continue;
      zb.mesh.updateMatrixWorld(true);
      _hits.length = 0;
      _ray.intersectObject(zb.mesh, true, _hits);
      const h = _hits[0];
      if (!h || (best && h.distance >= best.t)) continue;
      let head = false;
      for (let o = h.object; o && o !== zb.mesh; o = o.parent) if (o === zb.parts.head) head = true;
      best = { zb, t: h.distance, head, point: h.point };
    }
    return best;
  }

  dispose() {
    for (const zb of this.list) this.scene.remove(zb.mesh);
    this.list = [];
  }
}
