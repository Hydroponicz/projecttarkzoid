// Zombie AI: wander, hear noises, see the player, chase via a BFS flow
// field (so they find doors), attack, die, and leave lootable corpses.
import * as THREE from 'three';
import { moveCircle, hasLOS, atHeight } from './collision.js';
import { LH } from './levels.js';
import { makeItem } from './items.js';
import { addItem } from './inventory.js';

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
import { HALF, TOWN } from './world.js';
import { sfx, zombieVoice } from './audio.js';
import { lookMats, JOINT } from './ragdoll.js';
import { zombieParts, crowdMaterial, bodyMaterial, legProp, vestGeometry, eyeGeo as zEyeGeo, EYE_POS, ELBOW, KNEE } from './zombiemodel.js';

export const NAV_CELL = 0.6;
export const NAV_N = Math.ceil((HALF * 2) / NAV_CELL);
const TOWN_R = TOWN + 4; // half-size of the town (zombies are densest there)
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

// The horde is drawn as one instanced mesh per body part (a few draw calls
// for every zombie in view, instead of dozens each), the sculpted model up
// close and a lighter one further off. Each zombie keeps its own group of
// part meshes, never drawn: it carries the pose (animation, hit reactions,
// elbows and knees) and is what bullets are tested against.
const helmetGeo = new THREE.SphereGeometry(0.128, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.08);
const vestGeo = new THREE.BoxGeometry(0.52, 0.42, 0.32);
const LOD_NEAR = 24, LOD_FAR = 60; // (metres: the full model this close; the lightest past here)
const BODY = ['torso', 'head', 'uarm', 'farm', 'thigh', 'shin'];
const _frustum = new THREE.Frustum(), _pv = new THREE.Matrix4(), _sph = new THREE.Sphere();
const TAN_VIEW = Math.tan((75 / 2) * Math.PI / 180); // (the usual field of view: detail is judged against it)
class Crowd {
  constructor(scene) {
    this.scene = scene;
    const P = zombieParts(), body = crowdMaterial();
    this.kinds = {};
    const per = { torso: 1, head: 1, uarm: 2, farm: 2, thigh: 2, shin: 2 };
    for (const k of BODY) for (const L of [0, 1, 2]) this.kinds[k + L] = [P[L][k], body, per[k], true];
    Object.assign(this.kinds, {
      eye: [zEyeGeo, eyeMat, 2], helmet: [helmetGeo, new THREE.MeshStandardMaterial({ color: 0x3e4a30, roughness: 0.8 }), 1],
      vest: [vestGeometry(), new THREE.MeshStandardMaterial({ color: 0x3a4430, roughness: 0.9 }), 1],
    });
    this.meshes = {};
    this.near = LOD_NEAR; this.far = LOD_FAR; // (adjustable from the console)
    this.grow(256);
  }

  grow(cap) {
    this.cap = cap;
    for (const [k, [g, m, per, colored]] of Object.entries(this.kinds)) {
      if (this.meshes[k]) { this.scene.remove(this.meshes[k]); if (colored) this.meshes[k].geometry.dispose(); this.meshes[k].dispose(); }
      // (each its own copy of the shape: the colours ride on it per instance)
      const geo = colored ? g.clone() : g;
      if (colored) for (const a of ['iSkin', 'iTop', 'iBot']) geo.setAttribute(a, new THREE.InstancedBufferAttribute(new Float32Array(cap * per * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const im = new THREE.InstancedMesh(geo, m, cap * per);
      im.frustumCulled = false; // the horde moves; a box test per part is cheaper done by the GPU
      im.castShadow = k !== 'eye' && !k.endsWith('2'); im.receiveShadow = true; // (far off, no shadows: they'd hardly show)
      im.count = 0;
      this.scene.add(im);
      this.meshes[k] = im;
    }
  }

  draw(list, cam) {
    if (this.hold) return; // (a second pass over the same frame: keep what's drawn)
    let n = 0;
    for (const zb of list) if (zb.mesh.visible) n++;
    if (n > this.cap) this.grow(Math.ceil(n / 256) * 256);
    const M = this.meshes, c = {};
    for (const k in M) c[k] = 0;
    // Only what this camera can see: the main view keeps a margin so zombies
    // just out of sight still cast their shadows in; a scope's narrow view
    // (or the thermal one) draws only what's in it. Detail by how big a
    // zombie looks, so one far off through a scope gets the full model
    const cx = cam?.position.x ?? 0, cz = cam?.position.z ?? 0, far2 = this.far * this.far;
    const narrow = !!cam && cam.fov < 40, margin = narrow ? 0.4 : 3;
    const zoom = cam?.isPerspectiveCamera ? Math.tan((cam.fov / 2) * Math.PI / 180) / TAN_VIEW : 1, zoom2 = zoom * zoom;
    if (cam) _frustum.setFromProjectionMatrix(_pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    // (a horde on top of you: the full model for the nearest forty or so, not all of them)
    this.nearNow = Math.min(this.near, this.nearNow ?? this.near);
    const near2 = this.nearNow * this.nearNow;
    let close = 0;
    let sk, tp, bt;
    const put = (k, obj) => {
      const im = M[k], i = c[k]++;
      im.setMatrixAt(i, obj.matrixWorld);
      if (sk) { const g = im.geometry.attributes; g.iSkin.setXYZ(i, sk.r, sk.g, sk.b); g.iTop.setXYZ(i, tp.r, tp.g, tp.b); g.iBot.setXYZ(i, bt.r, bt.g, bt.b); }
    };
    for (const zb of list) {
      if (!zb.mesh.visible) continue;
      if (cam) { _sph.center.set(zb.pos.x, zb.pos.y + 0.9, zb.pos.z); _sph.radius = 1.1 * zb.def.scale + margin; if (!_frustum.intersectsSphere(_sph)) continue; }
      const p = zb.parts, d2 = ((zb.pos.x - cx) ** 2 + (zb.pos.z - cz) ** 2) * zoom2, L = d2 < near2 ? 0 : d2 < far2 ? 1 : 2;
      if (!L) close++;
      sk = p.head.material.color; tp = p.torso.material.color; bt = p.legL.material.color;
      put('torso' + L, p.torso); put('head' + L, p.head);
      put('uarm' + L, p.armL); put('uarm' + L, p.armR);
      put('farm' + L, p.foreL); put('farm' + L, p.foreR);
      if (!p.legL.userData.gone) { put('thigh' + L, p.legL); put('shin' + L, p.shinL); }
      if (!p.legR.userData.gone) { put('thigh' + L, p.legR); put('shin' + L, p.shinR); }
      sk = null;
      put('eye', p.eyes[0]); put('eye', p.eyes[1]);
      if (p.helmet) { put('helmet', p.helmet); put('vest', p.vest); }
    }
    if (!narrow) this.nearNow = close > 40 ? Math.max(6, this.nearNow * 0.9) : Math.min(this.near, this.nearNow * 1.02 + 0.05);
    for (const k in M) {
      const im = M[k];
      im.count = c[k];
      im.instanceMatrix.needsUpdate = true;
      const g = im.geometry.attributes;
      if (g.iSkin) g.iSkin.needsUpdate = g.iTop.needsUpdate = g.iBot.needsUpdate = true;
    }
  }
}

export class Zombies {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.list = [];
    this.crowd = new Crowd(scene);
    // (posed every time the scene is drawn, after its matrices are updated)
    this.drawHook = (r, sc, cam) => { this.crowd.draw(this.list, cam); this.world.cullDoors?.(cam); }; // (and the town's doors, for this view)
    scene.onBeforeRender = this.drawHook;
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
        const boxes = this.world.hash.query(x - r, z - r, x + r, z + r, tmp, 0, 1.6);
        let b = 0, win = false, door = false;
        for (const box of boxes) {
          if (box.noCollide || !atHeight(box, 0)) continue;
          if (!(x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r)) continue;
          // Shut doors count as walkable (3): zombies head for them and bash
          // them down, but would rather go round if that's not much further
          if (box.door) { door = true; continue; }
          // Low windows too (2 = zombies only: they smash and climb through)
          if (box.window && box.window.sill < 1.2) { win = true; continue; }
          b = 1; break;
        }
        this.blocked[i * NAV_N + j] = b ? 1 : win ? 2 : door ? 3 : 0;
      }
    }
    this.fieldTimer = 0;
    // upper floors in the area are mapped again when next needed
    for (const B of this.world.levels?.buildings || []) if (B.x0 < maxX + 1 && B.x1 > minX - 1 && B.z0 < maxZ + 1 && B.z1 > minZ - 1) B.sheets = null;
  }

  // ---------- upper floors ----------
  // Each upper storey of a building has its own small walking grid. The
  // stairwell isn't on it: zombies walk to its entrance and climb the
  // flights by the route (see climbDir).
  sheetFor(B, L) {
    B.sheets ??= [];
    if (B.sheets[L]) return B.sheets[L];
    const ni = Math.ceil((B.x1 - B.x0) / NAV_CELL), nj = Math.ceil((B.z1 - B.z0) / NAV_CELL);
    const blocked = new Uint8Array(ni * nj), y = L * LH, r = 0.32;
    // Mark the cells each obstacle (grown by a zombie's radius) covers: the
    // stairwell and lift holes, and every box at this storey's height
    const mark = (x0, z0, x1, z1) => {
      const i0 = Math.max(0, Math.ceil((x0 - B.x0) / NAV_CELL - 0.5)), i1 = Math.min(ni - 1, Math.floor((x1 - B.x0) / NAV_CELL - 0.5));
      const j0 = Math.max(0, Math.ceil((z0 - B.z0) / NAV_CELL - 0.5)), j1 = Math.min(nj - 1, Math.floor((z1 - B.z0) / NAV_CELL - 0.5));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) blocked[i * nj + j] = 1;
    };
    for (const h of [...B.holes, ...B.cores]) mark(h.x0 - r, h.z0 - r, h.x1 + r, h.z1 + r);
    for (const box of this.world.hash.query(B.x0 - 1, B.z0 - 1, B.x1 + 1, B.z1 + 1, [], y, y + 1.6)) {
      if (box.noCollide || box.door || !atHeight(box, y)) continue;
      mark(box.minX - r + 1e-6, box.minZ - r + 1e-6, box.maxX + r - 1e-6, box.maxZ + r - 1e-6);
    }
    return (B.sheets[L] = { ni, nj, blocked });
  }

  // A* on an upper storey's grid; waypoints, or null
  sheetPath(B, L, sx, sz, tx, tz) {
    const S = this.sheetFor(B, L), { ni, nj, blocked } = S;
    const cell = (v, v0, n) => Math.max(0, Math.min(n - 1, Math.floor((v - v0) / NAV_CELL)));
    const si = cell(sx, B.x0, ni), sj = cell(sz, B.z0, nj);
    let ti = cell(tx, B.x0, ni), tj = cell(tz, B.z0, nj);
    if (blocked[ti * nj + tj]) {
      let best = -1, bd = Infinity;
      for (let di = -5; di <= 5; di++) for (let dj = -5; dj <= 5; dj++) {
        const i = ti + di, j = tj + dj;
        if (i < 0 || j < 0 || i >= ni || j >= nj || blocked[i * nj + j]) continue;
        if (di * di + dj * dj < bd) { bd = di * di + dj * dj; best = i * nj + j; }
      }
      if (best < 0) return null;
      ti = Math.floor(best / nj); tj = best % nj;
    }
    const N = ni * nj, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = new Heap(N), start = si * nj + sj, goal = ti * nj + tj;
    const h = (i, j) => { const a = Math.abs(i - ti), b = Math.abs(j - tj); return Math.max(a, b) + 0.414 * Math.min(a, b); };
    g[start] = 0; heap.push(start, h(si, sj));
    let found = false;
    while (heap.n) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) { found = true; break; }
      const ci = Math.floor(cur / nj), cj = cur % nj;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni2 = ci + di, nj2 = cj + dj;
        if (ni2 < 0 || nj2 < 0 || ni2 >= ni || nj2 >= nj) continue;
        const n = ni2 * nj + nj2;
        if (closed[n] || (blocked[n] && n !== start)) continue;
        if (di && dj && (blocked[ci * nj + nj2] || blocked[ni2 * nj + cj])) continue;
        const ng = g[cur] + (di && dj ? 1.414 : 1);
        if (ng >= g[n]) continue;
        g[n] = ng; came[n] = cur; heap.push(n, ng + h(ni2, nj2));
      }
    }
    if (!found) return null;
    const out = [];
    for (let n = goal; n !== -1 && n !== start; n = came[n]) out.push({ x: B.x0 + (Math.floor(n / nj) + 0.5) * NAV_CELL, z: B.z0 + ((n % nj) + 0.5) * NAV_CELL });
    return out.reverse();
  }

  // Steer along an upper-storey path to (tx, tz)
  sheetDir(zb, tx, tz, dt) {
    const lv = this.world.levels, B = lv.buildingAt(zb.pos.x, zb.pos.z);
    if (!B) return null;
    const L = lv.level(zb.pos.y);
    zb.spathT = (zb.spathT ?? 0) - dt;
    const moved = zb.spathGoal ? Math.hypot(zb.spathGoal.x - tx, zb.spathGoal.z - tz) : Infinity;
    if (zb.spathT <= 0 || moved > 1.5 || !zb.spath) {
      zb.spath = this.sheetPath(B, L, zb.pos.x, zb.pos.z, tx, tz);
      zb.spathGoal = { x: tx, z: tz }; zb.spathT = 1 + Math.random() * 0.5;
    }
    const path = zb.spath;
    if (!path?.length) return null;
    while (path.length > 1 && Math.hypot(path[0].x - zb.pos.x, path[0].z - zb.pos.z) < 0.45) path.shift();
    const dx = path[0].x - zb.pos.x, dz = path[0].z - zb.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.2) { path.shift(); return null; }
    return [dx / l, dz / l];
  }

  // Get to another floor: walk to the stairwell on this one, then up or down
  // the flights to the next, as many times as it takes.
  climbDir(zb, tx, tz, ty, dt) {
    if (zb.climb) return this.followClimb(zb, dt);
    const lv = this.world.levels;
    const own = lv.buildingAt(zb.pos.x, zb.pos.z), theirs = ty > 0.5 ? lv.buildingAt(tx, tz) : null;
    // upstairs somewhere else: down first; otherwise into their building
    const B = zb.pos.y > 0.5 ? own : theirs;
    if (!B) return null;
    const up = B === theirs && ty > zb.pos.y;
    const core = B.cores[0], L = lv.level(zb.pos.y);
    const E = lv.entrance(core, L);
    if (Math.hypot(E.x - zb.pos.x, E.z - zb.pos.z) < 0.6) {
      zb.climb = { pts: lv.route(core, L, up), i: 0, t: 0 };
      return this.followClimb(zb, dt);
    }
    return L === 0 ? this.pathDir(zb, E.x, E.z, dt) : this.sheetDir(zb, E.x, E.z, dt);
  }

  followClimb(zb, dt) {
    const c = zb.climb;
    c.t += dt;
    let p = c.pts[c.i];
    while (p && Math.hypot(p.x - zb.pos.x, p.z - zb.pos.z) < 0.35) p = c.pts[++c.i];
    if (!p || c.t > 20) { zb.climb = null; zb.path = zb.spath = null; return null; }
    const dx = p.x - zb.pos.x, dz = p.z - zb.pos.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  // Distance field over a window centred on the target: how far it is to
  // walk from each cell (a step costs 10 straight, 14 on the diagonal; a shut
  // door or a window to smash through costs more). A bucket queue (Dial's
  // algorithm): steps never cost more than the number of buckets.
  updateField(tx, tz) {
    const ci = Math.floor((tx + HALF) / NAV_CELL), cj = Math.floor((tz + HALF) / NAV_CELL);
    const W = FIELD_R * 2 + 1, NB = 64;
    const f = this.field, B = this.blocked;
    f.fill(65535);
    this.fieldOrigin = [ci - FIELD_R, cj - FIELD_R];
    const [oi, oj] = this.fieldOrigin;
    // the window's cells, with a border of walls so the edges need no checks
    // (what each costs to step into: 0 = can't)
    const P = W + 2, cost = this.fieldCost || (this.fieldCost = new Uint8Array(P * P));
    cost.fill(0);
    for (let li = 0; li < W; li++) {
      const gi = oi + li;
      if (gi < 0 || gi >= NAV_N) continue;
      for (let lj = 0; lj < W; lj++) {
        const gj = oj + lj;
        if (gj < 0 || gj >= NAV_N) continue;
        const k = B[gi * NAV_N + gj];
        cost[(li + 1) * P + lj + 1] = k === 1 ? 0 : k === 3 ? 26 : k === 2 ? 41 : 1;
      }
    }
    const dist = this.fieldDist || (this.fieldDist = new Uint16Array(P * P));
    dist.fill(65535);
    const bk = this.buckets || (this.buckets = Array.from({ length: NB }, () => []));
    for (const b of bk) b.length = 0;
    const start = (FIELD_R + 1) * P + FIELD_R + 1;
    dist[start] = 0; bk[0].push(start);
    const STEP = [1, -1, P, -P, P + 1, P - 1, -P + 1, -P - 1];
    let pending = 1;
    for (let cur = 0; pending > 0; cur++) {
      const b = bk[cur % NB];
      while (b.length) {
        const idx = b.pop(); pending--;
        if (dist[idx] !== cur) continue; // (a cheaper way here was found)
        for (let s = 0; s < 8; s++) {
          const n = idx + STEP[s], c = cost[n];
          if (!c) continue;
          let nd;
          if (s < 4) nd = cur + 9 + c;
          else {
            // diagonal: no cutting the corner of a wall
            if (!cost[idx + STEP[s] - (s & 1 ? -1 : 1)] || !cost[idx + (s & 1 ? -1 : 1)]) continue;
            nd = cur + 13 + c;
          }
          if (nd < dist[n]) { dist[n] = nd; bk[nd % NB].push(n); pending++; }
        }
      }
    }
    for (let li = 0; li < W; li++) f.set(dist.subarray((li + 1) * P + 1, (li + 1) * P + 1 + W), li * W);
  }

  // Which way to go from (x, z) down the field: the slope over all the
  // neighbouring cells that are nearer, not just the one best step (which
  // runs everybody along the same row of cells), or null outside it.
  flowDir(x, z) {
    const W = FIELD_R * 2 + 1, f = this.field;
    const [oi, oj] = this.fieldOrigin;
    const li = Math.floor((x + HALF) / NAV_CELL) - oi, lj = Math.floor((z + HALF) / NAV_CELL) - oj;
    if (li < 1 || lj < 1 || li >= W - 1 || lj >= W - 1) return null;
    const here = f[li * W + lj];
    let gx = 0, gz = 0, best = 65535, bi = 0, bj = 0;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const diag = di && dj;
        if (diag && (f[(li + di) * W + lj] === 65535 || f[li * W + lj + dj] === 65535)) continue;
        const v = f[(li + di) * W + lj + dj];
        if (v === 65535) continue;
        if (v < best) { best = v; bi = di; bj = dj; }
        if (here === 65535 || v >= here) continue;
        const w = (here - v) / (diag ? 14 * 1.414 : 10); // (slope, along a unit step)
        gx += di * w; gz += dj * w;
      }
    }
    // standing in a blocked cell (hugging a wall): just step to the best neighbour
    if (here === 65535 || (!gx && !gz)) { gx = bi; gz = bj; }
    if (!gx && !gz) return null;
    const l = Math.hypot(gx, gz);
    return [gx / l, gz / l];
  }

  // Can it walk straight from one point to the other (no wall, shut door or
  // window on the way)? Checked along the nav grid
  navClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.ceil(L / 0.3);
    for (let k = 1; k <= n; k++) {
      const x = x0 + (dx * k) / n, z = z0 + (dz * k) / n;
      const i = Math.floor((x + HALF) / NAV_CELL), j = Math.floor((z + HALF) / NAV_CELL);
      if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N || this.blocked[i * NAV_N + j]) return false;
    }
    return true;
  }
  cellOpen(x, z) {
    const i = Math.floor((x + HALF) / NAV_CELL), j = Math.floor((z + HALF) / NAV_CELL);
    return i >= 0 && j >= 0 && i < NAV_N && j < NAV_N && !this.blocked[i * NAV_N + j];
  }

  // Closing in over open ground: not in a file behind the one in front, but
  // each from its own side, swinging out wide at first and in at the end, so
  // a crowd comes at you as a crowd and wraps around you
  closeIn(zb, tx, tz, dist) {
    const swing = zb.lane * 0.85 * Math.min(1, Math.max(0, (dist - 1.2) / 5));
    if (!swing) return [(tx - zb.pos.x) / dist, (tz - zb.pos.z) / dist];
    const a = Math.atan2(zb.pos.x - tx, zb.pos.z - tz) + swing, r = dist * 0.55;
    let gx = tx + Math.sin(a) * r, gz = tz + Math.cos(a) * r;
    if (!this.cellOpen(gx, gz) || !this.navClear(zb.pos.x, zb.pos.z, gx, gz)) { gx = tx; gz = tz; }
    const dx = gx - zb.pos.x, dz = gz - zb.pos.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  }

  // Following a route: each keeps a little to its own side of it where
  // there's room, so a crowd fills the street instead of walking its middle
  spread(zb, dir, dist) {
    if (dist < 5) return dir;
    const s = zb.lane * 0.4, px = -dir[1], pz = dir[0], side = Math.sign(s) || 1;
    if (!this.cellOpen(zb.pos.x + px * side * 1.2, zb.pos.z + pz * side * 1.2) || !this.cellOpen(zb.pos.x + px * side * 1.2 + dir[0], zb.pos.z + pz * side * 1.2 + dir[1])) return dir;
    const x = dir[0] + px * s, z = dir[1] + pz * s, l = Math.hypot(x, z);
    return [x / l, z / l];
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
          const ng = gc + (di && dj ? 1.414 : 1) + (B[nIdx] === 2 ? 4 : B[nIdx] === 3 ? 2.5 : 0); // round, if it's not far, rather than through a shut door; a door rather than a window
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
    // a waypoint further on in plain view: head straight for it (no
    // zig-zagging from cell to cell round every corner)
    zb.cutT = (zb.cutT ?? 0) - dt;
    if (zb.cutT <= 0) { zb.cutT = 0.3; for (let k = 0; k < 3 && path.length > 1 && this.navClear(zb.pos.x, zb.pos.z, path[1].x, path[1].z); k++) path.shift(); }
    const w = path[0];
    const dx = w.x - zb.pos.x, dz = w.z - zb.pos.z, l = Math.hypot(dx, dz);
    if (l < 0.2) { path.shift(); return null; }
    return [dx / l, dz / l];
  }

  // Something happened near (x, z) that zombies close by would notice (a
  // bullet smacking into a wall, a zombie dropping): they turn and come to
  // look where it came from.
  alertNear(x, z, r, srcX, srcZ, y = this.game?.player?.floorY ?? 0) {
    for (const zb of this.list) {
      if (zb.dead || zb.down || zb.state === 'chase') continue;
      if (Math.hypot(zb.pos.x - x, zb.pos.z - z) > r || Math.abs(zb.pos.y - y) > 4) continue;
      zb.state = 'investigate';
      zb.target = { x: srcX + (Math.random() - 0.5) * (y > 0.5 ? 1 : 4), z: srcZ + (Math.random() - 0.5) * (y > 0.5 ? 1 : 4), y };
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

  spawn(x, z, typeName, y = 0) {
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
    const e1 = new THREE.Mesh(eyeGeo, eyeMat); e1.position.set(...EYE_POS[0]);
    const e2 = e1.clone(); e2.position.set(...EYE_POS[1]);
    head.add(e1, e2);
    let helmet = null, vest = null;
    const armL = new THREE.Mesh(geo.arm, skin); armL.position.set(-0.255, 1.4, 0);
    const armR = new THREE.Mesh(geo.arm, skin); armR.position.set(0.255, 1.4, 0);
    const legL = new THREE.Mesh(geo.leg, pants); legL.position.set(-0.13, 0.82, 0);
    const legR = new THREE.Mesh(geo.leg, pants); legR.position.set(0.13, 0.82, 0);
    g.add(torso, head, armL, armR, legL, legR);
    // elbows and knees: the forearm and shin hang off the end of the upper limb
    const foreL = new THREE.Object3D(), foreR = new THREE.Object3D(), shinL = new THREE.Object3D(), shinR = new THREE.Object3D();
    foreL.position.z = foreR.position.z = ELBOW; armL.add(foreL); armR.add(foreR);
    shinL.position.y = shinR.position.y = -KNEE; legL.add(shinL); legR.add(shinR);
    if (t.helmet) {
      helmet = new THREE.Mesh(helmetGeo, eyeMat);
      helmet.position.set(0, 0.07, -0.004); head.add(helmet);
      vest = new THREE.Mesh(vestGeo, eyeMat);
      vest.position.y = 0.04; torso.add(vest); // (worn: it goes where the torso goes)
    }
    // (the crowd draws it: these meshes only hold the pose and take the hits)
    g.traverse((o) => { if (o.isMesh) o.visible = false; });
    g.scale.setScalar(t.scale);
    g.rotation.order = 'YXZ'; // lean (x, z) is applied in the body's own frame
    g.position.set(x, y, z);
    this.scene.add(g);
    const zb = {
      mesh: g, parts: { head, torso, armL, armR, legL, legR, foreL, foreR, shinL, shinR, eyes: [e1, e2], helmet, vest }, type: typeName, def: t,
      pos: g.position, hp: t.hp, maxHp: t.hp, state: 'wander', target: null, lastSeen: 0,
      phase: Math.random() * 10, voice: zombieVoice(typeName), attackCd: 0, losTimer: Math.random() * 0.3, canSee: false,
      groanTimer: 3 + Math.random() * 10, wanderTimer: 0, dir: Math.random() * Math.PI * 2,
      radius: 0.32 * t.scale, height: 1.85 * t.scale, stagger: 0, dead: false, stuck: 0,
      // Hit reactions: body lean and head snap springs, current velocity,
      // knocked-down ragdoll and the get-up animation.
      lean: { x: 0, z: 0, vx: 0, vz: 0 }, headKick: { x: 0, v: 0 }, vx: 0, vz: 0, down: null, rise: 0, riseSide: 1,
      look: { kind: 'zombie', skin: skin.color.getHex(), top: cloth.color.getHex(), bottom: pants.color.getHex(), ...(t.helmet ? { helmet: 0x3e4a30, vest: 0x3a4430 } : {}) },
      // How it moves: its stride, where it carries its arms, how much it
      // lurches from side to side, and what it does standing still
      gait: { stride: 0.45 + Math.random() * 0.3, arms: Math.random() < 0.35 ? 1.3 + Math.random() * 0.2 : 0.25 + Math.random() * 0.4, lurch: Math.random() * 0.12, drag: Math.random() < 0.15 ? (Math.random() < 0.5 ? 1 : -1) : 0, seed: Math.random() * 100 },
      idleKind: pickArr(['sway', 'sway', 'hunch', 'twitch', 'scratch', 'look']),
      // Legs: wounds (a limp), and gone altogether (it crawls)
      legDmg: { L: 0, R: 0 }, legBurst: 0, lost: null, crawl: false, fall: 0,
      suppress: 0, stumble: 0, dodge: null, funnel: null,
      lane: Math.random() * 2 - 1, // (which side of the crowd it keeps to)
    };
    for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) zb.parts[k].userData.base = zb.parts[k].position.clone();
    this.list.push(zb);
    return zb;
  }

  serialize() {
    return this.list.map((z) => ({ x: +z.pos.x.toFixed(2), z: +z.pos.z.toFixed(2), y: z.pos.y > 0.01 ? +z.pos.y.toFixed(3) : undefined, type: z.type, hp: Math.round(z.hp), hvt: z.hvt, lost: z.lost || undefined, ld: z.legDmg.L + z.legDmg.R > 0 ? [Math.round(z.legDmg.L), Math.round(z.legDmg.R)] : undefined }));
  }

  restore(saved) {
    for (const s of saved) {
      const z = this.spawn(s.x, s.z, s.type, s.y || 0); z.hp = s.hp;
      if (s.hvt) { z.hvt = s.hvt; z.maxHp = 900; z.mesh.scale.setScalar(1.18); }
      if (s.ld) { z.legDmg.L = s.ld[0]; z.legDmg.R = s.ld[1]; }
      if (s.lost) for (const side of ['L', 'R']) if (s.lost[side]) this.sever(z, side, null, true);
    }
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
      const B = sp.y ? this.world.levels.buildingAt(sp.x, sp.z) : null;
      for (let k = 0; k < sp.n; k++) {
        for (let tries = 0; tries < 8; tries++) {
          const x = sp.x + (Math.random() * 2 - 1) * sp.r, z = sp.z + (Math.random() * 2 - 1) * sp.r;
          if (B) {
            // upstairs: an open spot on that storey's grid
            const S = this.sheetFor(B, this.world.levels.level(sp.y)), i = Math.floor((x - B.x0) / NAV_CELL), j = Math.floor((z - B.z0) / NAV_CELL);
            if (i < 0 || j < 0 || i >= S.ni || j >= S.nj || S.blocked[i * S.nj + j]) continue;
          } else {
            const gi = Math.floor((x + HALF) / NAV_CELL), gj = Math.floor((z + HALF) / NAV_CELL);
            if (this.blocked[gi * NAV_N + gj]) continue;
          }
          this.spawn(x, z, sp.type || undefined, sp.y || 0);
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
  noise(x, z, r, loud = false, y = 0) {
    if (r >= 35) this.game?.survivors?.heard(x, z, r); // gangs hear the shooting too
    // Rain and wind drown out ordinary noises (not thunder or gunfire-loud ones)
    const W = this.game?.weather;
    if (W && !loud) r *= W.hearMul;
    for (const zb of this.list) {
      if (zb.dead || zb.down || zb.state === 'chase') continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z) + Math.abs(zb.pos.y - y) * 2; // floors muffle
      const j = y > 0.5 ? 1 : 3; // (indoors upstairs: aim for the room, not a random spot)
      if (d < r) { zb.state = 'investigate'; zb.target = { x: x + (Math.random() - 0.5) * j, z: z + (Math.random() - 0.5) * j, y }; zb.path = null; zb.hurry = d < r * 0.5 ? 1 : 0; }
    }
  }

  // hit: { point, dir, force } from the bullet or blow (for reactions and ragdolls)
  // Its voice, quieter with distance and panned to where it stands
  vocal(zb, kind, range, loud) {
    const p = this.game?.player;
    if (!p) return;
    const dx = zb.pos.x - p.pos.x, dz = zb.pos.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d >= range) return;
    const pan = d > 0.01 ? (dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / d : 0;
    // Another floor muffles it
    const floors = Math.abs((zb.pos.y || 0) - (p.floorY || 0)) > 2 ? 0.4 : 1;
    sfx.zombie(kind, (1 - d / range) * loud * floors, zb.voice, pan);
  }

  damage(zb, amount, fromX, fromZ, head = false, hit = null) {
    if (zb.dead) return false;
    // Armored zombies (soldiers) shrug off body shots; headshots go through.
    if (zb.def.armor && !head) amount *= 1 - zb.def.armor;
    zb.hp -= amount;
    zb.stagger = 0.35;
    if (zb.hp > 0 && Math.random() < 0.6) this.vocal(zb, 'hurt', 35, 0.9);
    // Shot from anywhere: it knows where you are now and comes for you.
    zb.state = 'chase';
    zb.prey = null;
    zb.lastSeen = 6;
    zb.flail = 0.6;
    if (hit && !head) this.legHit(zb, amount, hit);
    if (zb.hp <= 0) {
      this.kill(zb, hit, head);
      this.alertNear(zb.pos.x, zb.pos.z, 9, fromX, fromZ);
      return true;
    }
    if (zb.down) { if (hit) zb.down.impulse(hit.point, hit.dir, hit.force); return false; }
    // knockback
    const dx = zb.pos.x - fromX, dz = zb.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.step(zb, (dx / l) * 0.25, (dz / l) * 0.25);
    if (hit) this.react(zb, hit, head);
    return false;
  }

  // A hit low down: wounds that leg (a limp), and a heavy round, a burst or
  // a shotgun blast up close can take it off
  legHit(zb, amount, hit) {
    if (zb.crawl && zb.lost?.L && zb.lost?.R) return;
    const y = hit.point.y - zb.pos.y;
    if (zb.crawl || y > 0.85 * zb.def.scale) return;
    const rx = Math.cos(zb.dir), rz = -Math.sin(zb.dir);
    const side = (hit.point.x - zb.pos.x) * rx + (hit.point.z - zb.pos.z) * rz > 0 ? 'L' : 'R';
    if (zb.lost?.[side]) return;
    zb.legDmg[side] += amount;
    const now = performance.now();
    zb.legBurst = now - (zb.legBurstAt || 0) < 160 ? zb.legBurst + amount : amount;
    zb.legBurstAt = now;
    const heavy = zb.legBurst >= 65 ? Math.min(0.85, (zb.legBurst - 45) / 70) : 0;
    if (Math.random() < heavy || zb.legDmg[side] > zb.maxHp * 1.1) this.sever(zb, side, hit.dir);
  }

  // A leg gone: it flies off, the stump bleeds, and the zombie goes down to crawl
  sever(zb, side, dir, quiet = false) {
    zb.lost ||= {};
    if (zb.lost[side]) return;
    zb.lost[side] = true;
    const part = side === 'L' ? zb.parts.legL : zb.parts.legR;
    part.userData.gone = true;
    const g = this.game;
    if (!quiet && g?.ragdolls) {
      zb.mesh.updateMatrixWorld(true);
      const hip = new THREE.Vector3(), foot = new THREE.Vector3(0, -0.8, 0);
      part.getWorldPosition(hip); part.localToWorld(foot);
      const gib = new THREE.Mesh(legProp(), bodyMaterial(zb.parts.head.material.color, zb.parts.torso.material.color, part.material.color)); gib.castShadow = true;
      const v = (dir ? dir.clone().setY(0).normalize().multiplyScalar(2 + Math.random() * 2) : new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2));
      g.ragdolls.dropProp(gib, hip, foot, v);
      g.fx.blood(hip, dir || new THREE.Vector3(0, 1, 0), { power: 1.5, exit: true });
      g.fx.pool(hip.x, hip.z, 0.7 + Math.random() * 0.4, zb.pos.y);
      this.vocal(zb, 'hurt', 35, 1);
    }
    if (!zb.crawl) { zb.crawl = true; zb.fall = quiet ? 0 : 1; zb.rise = 0; zb.stumble = 0; }
  }

  // An explosion close by can take the legs off
  blastLegs(zb, k, dir) {
    if (zb.dead) return;
    for (const side of ['L', 'R']) if (Math.random() < 0.6 * k) this.sever(zb, side, dir);
  }

  // A bullet cracking past close by: it flinches, may stumble, may lurch aside
  nearMiss(origin, dir, dist, except) {
    const hd = Math.hypot(dir.x, dir.z) || 1e-6;
    for (const zb of this.list) {
      if (zb === except || zb.down || zb.dead) continue;
      const ox = zb.pos.x - origin.x, oz = zb.pos.z - origin.z;
      if (Math.abs(ox) > dist + 2 || Math.abs(oz) > dist + 2) continue;
      const t = (ox * dir.x + oz * dir.z) / (hd * hd);
      if (t < 1 || t > dist) continue;
      const cx = origin.x + dir.x * t - zb.pos.x, cz = origin.z + dir.z * t - zb.pos.z, d = Math.hypot(cx, cz);
      const by = origin.y + dir.y * t - zb.pos.y;
      if (d > 1.5 || by < -0.2 || by > 2.4) continue;
      const k = 1 - d / 1.5, tough = zb.type === 'brute' ? 0.3 : 1;
      zb.suppress = Math.min(2, zb.suppress + 0.6 * k * tough);
      zb.headKick.v += (Math.random() - 0.5) * 4 * k * tough;
      const away = (cx * Math.cos(zb.dir) - cz * Math.sin(zb.dir)) > 0 ? -1 : 1;
      zb.lean.vz += away * 2 * k * tough;
      if (zb.crawl) continue;
      if (zb.suppress > 0.9 && Math.random() < 0.35 * tough) this.stumbleZ(zb);
      else if (zb.state === 'chase' && !zb.dodge && Math.random() < 0.3 * tough) zb.dodge = { side: away, t: 0.35 + Math.random() * 0.25 };
    }
  }

  stumbleZ(zb) {
    if (zb.stumble > 0 || zb.crawl || zb.rise > 0) return;
    zb.stumble = 0.8;
    zb.lean.vx += 3 + Math.random() * 2;
    zb.lean.vz += (Math.random() - 0.5) * 3;
    zb.flail = 0.5;
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
    if (zb.rise > 0 || zb.crawl) return;
    const legHit = hit.point.y < 0.85 * zb.def.scale;
    let chance = (legHit ? 0.3 : 0) + Math.max(0, (f - 3.5) * 0.12) + (hit.knock || 0);
    if (zb.type === 'brute') chance *= 0.3;
    if (Math.random() < chance) this.knockDown(zb, hit);
  }

  ragdollSpec(zb, extra) {
    const look = zb.look;
    const mats = lookMats(look);
    mats.skin = zb.parts.head.material; mats.top = zb.parts.torso.material; mats.bottom = zb.parts.legL.material;
    mats.extra.push({ size: [0.022, 0.022, 0.022], off: EYE_POS[0], on: 'head', mat: extra.dead ? deadEyeMat : eyeMat },
      { size: [0.022, 0.022, 0.022], off: EYE_POS[1], on: 'head', mat: extra.dead ? deadEyeMat : eyeMat });
    zb.mesh.updateMatrixWorld(true);
    return {
      matrix: zb.mesh.matrixWorld, kind: 'zombie', scale: zb.def.scale, mats, look, lost: zb.lost,
      vel: new THREE.Vector3(zb.vx, 0, zb.vz), owner: zb, floor: zb.pos.y, ...extra,
    };
  }

  knockDown(zb, hit) {
    const rd = this.game?.ragdolls;
    if (!rd || zb.crawl) return;
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
    zb.pos.set(fx, r.floor > 0.2 ? r.floor : 0, fz); // (a storey or a stair flight; not the kerb)
    moveCircle(this.world.hash, zb.pos, zb.radius, 0, 0, zb.pos.y);
    // Lying along the body, then pivoting up on the feet.
    zb.dir = faceDown ? yaw : yaw + Math.PI;
    zb.riseSide = faceDown ? 1 : -1;
    zb.rise = zb.crawl ? 0 : 1; // (no legs to get up on: straight to crawling)
    zb.mesh.visible = true;
    zb.vx = zb.vz = 0;
  }

  kill(zb, hit, head) {
    zb.dead = true;
    if (!head || Math.random() < 0.3) this.vocal(zb, 'die', 40, 1);
    const game = this.game;
    this.scene.remove(zb.mesh);
    const c = this.world.addContainer(zb.def.loot || 'body', zb.pos.x, zb.pos.z);
    if (zb.pos.y > 0.01) { c.base = zb.pos.y; c.y = (c.y || 0) + zb.pos.y; }
    c.type = 'body';
    c.name = zb.def.loot === 'soldier' ? 'Dead Soldier' : 'Zombie';
    c.color = zb.look.top;
    c.look = zb.look;
    if (!zb.def.loot && Math.random() < 0.65) c.grid.items.length = 0; // most zombies carry nothing
    if (zb.hvt) { c.name = zb.hvt; const tag = makeItem('q_hvt'); if (!addItem(c.grid, tag)) { c.grid.h += 1; addItem(c.grid, tag); } }
    game?.mission?.onZombieKilled(zb);
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
      // where it came to rest (it may have slid down a flight of stairs)
      if (rr.floor > 0.01 || c.base) c.base = rr.floor || undefined;
      if (!rr.pooled) { rr.pooled = true; game.fx.pool((rr.pelvis.x + rr.p[JOINT.CHE].x) / 2, (rr.pelvis.z + rr.p[JOINT.CHE].z) / 2, 0.9 + Math.random() * 0.7, rr.floor || 0); }
    };
    if (r.sleeping) { r.onSettle(r); r.freeze(); }
  }

  update(frameDt, player, game) {
    const dt = frameDt;
    const hash = this.world.hash;
    const px = player.pos.x, pz = player.pos.z;

    this.fieldTimer -= dt;
    if (this.fieldTimer <= 0) { this.fieldTimer = 0.35; this.updateField(px, pz); }

    // Trickle spawns keep the town alive; more over time.
    this.spawnTimer -= dt;
    const cap = 230 + Math.min(160, game.day * 16);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = game.isNight ? 5 : 10;
      if (this.list.length < cap) {
        const p = this.randomOpenPoint(player.pos, 45, game.safehouse);
        if (p) { const z = this.spawn(p.x, p.z); if (Math.random() < 0.5) { z.state = 'investigate'; z.target = { x: px, z: pz }; } }
      }
    }

    let nearest = Infinity;
    this.pathBudget = 3; // A* searches allowed this frame
    // Who's near whom, by 1 m cell (for keeping out of each other's way)
    const sep = this.sepGrid || (this.sepGrid = new Map());
    sep.clear();
    const cellKey = (x, z) => (Math.floor(x) + 2048) * 4096 + Math.floor(z) + 2048;
    for (const o of this.list) { if (o.down) continue; const k = cellKey(o.pos.x, o.pos.z); let c = sep.get(k); if (!c) sep.set(k, c = []); c.push(o); }
    this.frame = (this.frame || 0) + 1;
    const night = game.isNight; // (a getter that works it out: once a frame is plenty)
    for (const zb of this.list) {
      if (zb.down) { this.updateDown(zb, frameDt); continue; }
      if (zb.vault) { this.updateVault(zb, frameDt); continue; }
      // Level of detail: the further from you, the less often a zombie thinks
      // and moves (in bigger steps): every frame close in, every other
      // frame past 35 m, every fourth past 80 m
      const pd0 = Math.hypot(px - zb.pos.x, pz - zb.pos.z);
      nearest = Math.min(nearest, pd0);
      const every = pd0 < 35 ? 1 : pd0 < 80 ? 2 : 4;
      zb.lodAcc = (zb.lodAcc || 0) + frameDt;
      zb.lodSlot ??= Math.floor(Math.random() * 4);
      if (every > 1 && (this.frame + zb.lodSlot) % every) continue;
      const dt = Math.min(0.15, zb.lodAcc); zb.lodAcc = 0;
      // A zombie hunts either the player or an AI survivor ("prey").
      if (zb.prey && zb.prey.dead) { zb.prey = null; if (zb.state === 'chase') zb.state = 'wander'; }
      const prey = zb.prey;
      const pdist = Math.hypot(px - zb.pos.x, pz - zb.pos.z);
      const tx0 = prey ? prey.pos.x : px, tz0 = prey ? prey.pos.z : pz;
      // Floors: a target on another storey is reached by the stairs
      const zy = zb.pos.y, ty0 = prey ? 0 : player.floorY, sameFloor = Math.abs(ty0 - zy) < 1.0;
      const dx = tx0 - zb.pos.x, dz = tz0 - zb.pos.z;
      const dist = Math.hypot(dx, dz);

      // Hidden beyond what the fog lets you see (saves draw calls); in clear
      // daylight that's far enough to pick them off through a scope.
      zb.mesh.visible = pdist < Math.min(game.camera.far, night ? 80 : 200);
      // Too far away: cheap sleep update.
      if (pdist > 70 && !prey && zb.state === 'wander') continue;

      // Perception (staggered)
      zb.losTimer -= dt;
      if (zb.losTimer <= 0) {
        zb.losTimer = 0.25;
        let range = (player.flashlight ? 30 : 18) * (night ? 0.8 : 1.3) * player.stealthMul * (game.dev?.invisible || player.aboard ? 0 : 1) * (game.weather?.sightMul ?? 1);
        if (player.prone) range *= 0.4;
        else if (player.crouch) range *= 0.6;
        const seesPlayer = pdist < range && Math.abs(player.floorY - zy) < 1.2 && hasLOS(hash, zb.pos.x, zb.pos.z, px, pz, zy);
        const facing = (x, z, d) => {
          // Zombies need roughly to face their target unless it's very close.
          const ang = Math.atan2(x - zb.pos.x, z - zb.pos.z);
          const da = Math.abs(((ang - zb.dir + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
          return d < 4 || da < 1.4 || zb.state === 'chase';
        };
        const surv = zy < 0.5 ? game.survivors?.nearestVisible(zb.pos, night ? 14 : 20) : null;
        if (seesPlayer && (!surv || pdist <= surv.d) && facing(px, pz, pdist)) {
          zb.prey = null; zb.state = 'chase'; zb.lastSeen = 4;
        } else if (surv && facing(surv.s.pos.x, surv.s.pos.z, surv.d)) {
          zb.prey = surv.s; zb.state = 'chase'; zb.lastSeen = 4;
        }
        zb.canSee = zb.prey ? !!surv && surv.s === zb.prey : seesPlayer;
        zb.clear = zb.state === 'chase' && sameFloor && zy < 0.5 && dist < 22 && this.navClear(zb.pos.x, zb.pos.z, tx0, tz0);
      }

      let mx = 0, mz = 0, speed = 0;
      if (zb.state === 'chase') {
        zb.lastSeen -= dt;
        if (zb.lastSeen <= 0 && !zb.canSee) { zb.state = 'investigate'; zb.target = { x: tx0, z: tz0 }; zb.prey = null; }
        speed = zb.def.chase * (night ? 1.15 : 1) * (game.weather?.zombieSpeedMul ?? 1);
        // The flow field leads to the player (through doors, which get
        // bashed); beyond it, or after survivors out of sight, A* paths.
        const direct = !zb.climb && sameFloor && zb.canSee && dist < 6 && hasLOS(hash, zb.pos.x, zb.pos.z, tx0, tz0, zy);
        let dir = null;
        if (zb.climb || !sameFloor) dir = this.climbDir(zb, tx0, tz0, ty0, dt);
        else if (zy > 0.5) dir = direct ? null : this.sheetDir(zb, tx0, tz0, dt);
        else if (zb.clear && dist > 0.05) dir = this.closeIn(zb, tx0, tz0, dist);
        else if (!direct) {
          dir = (!prey && player.floorY < 0.5 && this.flowDir(zb.pos.x, zb.pos.z)) || this.pathDir(zb, tx0, tz0, dt);
          if (dir) dir = this.spread(zb, dir, dist);
        }
        if (dir) { mx = dir[0]; mz = dir[1]; }
        else if (sameFloor) { mx = dx / (dist || 1); mz = dz / (dist || 1); }
      } else if (zb.state === 'investigate') {
        const tx = zb.target.x - zb.pos.x, tz = zb.target.z - zb.pos.z;
        const td = Math.hypot(tx, tz), ty = zb.target.y || 0, tSame = Math.abs(ty - zy) < 1.0;
        if (tSame && !zb.climb && (td < 1.2 || (zb.path && !zb.path.length && td < 3))) { zb.state = 'wander'; zb.wanderTimer = 4; zb.path = null; zb.hurry = 0; }
        else {
          // Walk (or hurry, if it was close) to the noise, finding a way round
          // walls, and up or down the stairs if it came from another floor.
          const dir = zb.climb || !tSame ? this.climbDir(zb, zb.target.x, zb.target.z, ty, dt)
            : td < 12 && hasLOS(hash, zb.pos.x, zb.pos.z, zb.target.x, zb.target.z, zy) ? null
              : zy > 0.5 ? this.sheetDir(zb, zb.target.x, zb.target.z, dt) : this.pathDir(zb, zb.target.x, zb.target.z, dt);
          if (dir) { mx = dir[0]; mz = dir[1]; } else if (tSame) { mx = tx / td; mz = tz / td; } else if (!zb.climb) { zb.state = 'wander'; zb.wanderTimer = 4; }
          speed = zb.hurry ? Math.max(zb.def.speed * 1.5, zb.def.chase * 0.75) : zb.def.speed * 1.3;
        }
      } else {
        zb.wanderTimer -= dt;
        if (zb.wanderTimer <= 0) { zb.wanderTimer = 3 + Math.random() * 6; zb.dir += (Math.random() - 0.5) * 2.5; zb.idle = Math.random() < 0.4; }
        if (!zb.idle) { mx = Math.sin(zb.dir); mz = Math.cos(zb.dir); speed = zb.def.speed * 0.6; }
      }

      if (zb.stagger > 0) { zb.stagger -= dt; speed *= 0.2; }
      // Legs: crawling on its hands with none, a limp on a bad one; a
      // stumble (near misses, bad legs, bad luck) nearly stops it
      if (zb.crawl) speed = Math.min(speed, zb.state === 'chase' ? (zb.type === 'runner' ? 0.85 : 0.55) : 0.3) * (zb.fall > 0 ? 0 : 1);
      else {
        const bad = Math.max(zb.legDmg.L, zb.legDmg.R) / zb.maxHp;
        if (bad > 0.3) speed *= 0.65;
        if (speed > 0.5 && Math.random() < dt * (0.012 + (bad > 0.3 ? 0.08 : 0) + (zb.type === 'runner' ? 0.02 : 0))) this.stumbleZ(zb);
      }
      if (zb.stumble > 0) { zb.stumble -= dt; if (zb.stumble > 0.3) speed *= 0.3; }
      zb.suppress = Math.max(0, zb.suppress - dt * 0.5);
      // lurching aside from the shots
      if (zb.dodge) { zb.dodge.t -= dt; const ox = mx; mx = mx * 0.5 - mz * zb.dodge.side * 1.2; mz = mz * 0.5 + ox * zb.dodge.side * 1.2; if (zb.dodge.t <= 0) zb.dodge = null; }
      // lined up on a doorway it was grinding against the frame of
      if (zb.funnel) { zb.funnel.t -= dt; const fx = zb.funnel.x - zb.pos.x, fz = zb.funnel.z - zb.pos.z, fl = Math.hypot(fx, fz); if (fl < 0.35 || zb.funnel.t <= 0) zb.funnel = null; else { mx = mx * 0.3 + (fx / fl) * 0.7; mz = mz * 0.3 + (fz / fl) * 0.7; } }
      // Stuck against something it can't bash: sidestep for a moment.
      if (zb.detour > 0 && speed > 0) { zb.detour -= dt; const ds = zb.detourSide; const ox = mx; mx = mx * 0.3 - mz * ds; mz = mz * 0.3 + ox * ds; }
      if (zb.rise > 0) { zb.rise -= dt / 1.4; speed = 0; }

      // Separation from other zombies (only nearby ones matter)
      // and from the one in front: it goes round them, to the side they're
      // not on (or its own side of the crowd), instead of falling in behind
      if (speed > 0) {
        const hl = Math.hypot(mx, mz), hx = hl > 0.01 ? mx / hl : 0, hz = hl > 0.01 ? mz / hl : 0;
        const ci = Math.floor(zb.pos.x), cj = Math.floor(zb.pos.z);
        let sx = 0, sz = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const cell = sep.get((ci + a + 2048) * 4096 + cj + b + 2048);
          if (cell) for (const o of cell) {
            if (o === zb || Math.abs(o.pos.y - zy) > 1) continue;
            const ox = zb.pos.x - o.pos.x, oz = zb.pos.z - o.pos.z;
            const d2 = ox * ox + oz * oz;
            if (d2 < 1e-6 || d2 > 2) continue;
            const d = Math.sqrt(d2);
            if (d2 < 0.5) { sx += (ox / d) * 0.8; sz += (oz / d) * 0.8; continue; }
            if (!hl || dist < 1.8) continue;
            const fx = -ox / d, fz = -oz / d, ahead = fx * hx + fz * hz;
            if (ahead < 0.75) continue;
            let qx = -(fx - ahead * hx), qz = -(fz - ahead * hz), ql = Math.hypot(qx, qz);
            if (ql < 0.05) { qx = -hz * (zb.lane < 0 ? -1 : 1); qz = hx * (zb.lane < 0 ? -1 : 1); ql = 1; }
            const k = 0.7 * Math.min(1, (1.42 - d) / 0.7);
            sx += (qx / ql) * k; sz += (qz / ql) * k;
          }
        }
        mx += sx; mz += sz;
      }

      // Attack
      zb.attackCd -= dt;
      const reach = (zb.crawl ? 1.9 : 1.0) * zb.def.scale; // (a crawler grabs at you from the floor)
      // Only with nothing in between (no clawing through closed doors or walls).
      if (dist < reach + 0.1 && sameFloor && zb.state === 'chase' && !(zb.rise > 0) && hasLOS(hash, zb.pos.x, zb.pos.z, tx0, tz0, zy)) {
        speed = 0;
        if (zb.attackCd <= 0) {
          zb.attackCd = 1.3;
          this.vocal(zb, 'snarl', 25, 0.9);
          const [a, b] = zb.def.dmg;
          const dmg = a + Math.random() * (b - a);
          if (prey) prey.hurt(dmg, 'zombie', zb);
          else player.takeZombieHit(dmg, zb);
        }
      }

      // A closed door or window between it and what it's after: beat on it
      // (or climb through, if the window's already open or smashed).
      // (looked for a few times a second, not every frame by every zombie)
      zb.snT = (zb.snT || 0) - dt;
      if (zb.state !== 'wander' && !(zb.rise > 0) && (zb.attackCd <= 0 || zb.stuck > 0.2) && (zb.snT <= 0 || zb.stuck > 0.2)) {
        zb.snT = 0.25;
        const s = this.structureNear(zb);
        const gx = zb.state === 'chase' ? tx0 : zb.target.x, gz = zb.state === 'chase' ? tz0 : zb.target.z;
        if (s && (s.kind === 'door' || s.kind === 'window') && this.across(s, zb.pos.x, zb.pos.z, gx, gz)) {
          if (s.kind === 'window' && s.state !== 'closed' && s.sill < 1.2 && !s.base) { this.startVault(zb, s); continue; }
          if (s.kind === 'door' && (s.ang || 0) >= 0.03 && !s.broken) { game.swingDoor?.(s, 1, 0.9); }
          else if (zb.attackCd <= 0 && (s.kind === 'door' || s.state === 'closed')) {
            zb.attackCd = 1.5;
            zb.dir = Math.atan2(s.x - zb.pos.x, s.z - zb.pos.z);
            game.damageStructure(s, zb.def.dmg[1] * (zb.type === 'brute' ? 3 : 1) * (s.kind === 'door' ? 1.5 : 1), zb.pos);
          }
        }
      }

      const ml = Math.hypot(mx, mz);
      if (ml > 0.01 && speed > 0) {
        const before = { x: zb.pos.x, z: zb.pos.z };
        this.step(zb, (mx / ml) * speed * dt, (mz / ml) * speed * dt);
        // Don't walk into the player
        const pdx = zb.pos.x - px, pdz = zb.pos.z - pz, pd = Math.hypot(pdx, pdz);
        const minD = zb.radius + player.radius;
        if (pd < minD && pd > 1e-4 && Math.abs(player.floorY - zb.pos.y) < 1) { zb.pos.x = px + (pdx / pd) * minD; zb.pos.z = pz + (pdz / pd) * minD; }
        const moved = Math.hypot(zb.pos.x - before.x, zb.pos.z - before.z);
        zb.vx = (zb.pos.x - before.x) / dt; zb.vz = (zb.pos.z - before.z) / dt;
        // Blocked while chasing or following a noise: bash the door or
        // barricade in the way; if it's a plain wall, sidestep and repath.
        if (zb.state !== 'wander' && moved < speed * dt * 0.3) {
          zb.stuck += dt;
          const s = zb.stuck > 0.3 ? this.structureNear(zb) : null;
          const climbable = s?.kind === 'window' && s.state !== 'closed';
          if (climbable && s.sill < 1.2 && !s.base) this.startVault(zb, s);
          else if (s?.kind === 'door' && (s.ang || 0) >= 0.03 && !s.broken) game.swingDoor?.(s, 1, 0.9); // (ajar: shoved open)
          else if (zb.stuck > 0.6 && zb.attackCd <= 0) {
            const dw = !s && this.doorwayNear(zb);
            if (s && !climbable) { zb.attackCd = 1.5; game.damageStructure(s, zb.def.dmg[1] * (zb.type === 'brute' ? 3 : 1) * (s.kind === 'door' ? 1.5 : 1), zb.pos); }
            else if (dw) { zb.funnel = { x: dw.x, z: dw.z, t: 1 }; zb.stuck = 0; }
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
      const L = zb.lean, K = zb.headKick, sdt = Math.min(dt, 0.033); // (stiff springs: small steps)
      L.vx += (-70 * L.x - 10 * L.vx) * sdt; L.vz += (-70 * L.z - 10 * L.vz) * sdt;
      L.x += L.vx * sdt; L.z += L.vz * sdt;
      K.v += (-90 * K.x - 9 * K.v) * sdt; K.x += K.v * sdt;
      if (zb.fall > 0) zb.fall = Math.max(0, zb.fall - dt / 0.7);
      const crawlK = zb.crawl ? 1 - smooth(zb.fall) : 0;
      zb.mesh.rotation.x = L.x + (zb.rise > 0 ? zb.riseSide * (Math.PI / 2) * smooth(Math.min(1, zb.rise)) : 0) + crawlK * (Math.PI / 2 - 0.1);
      zb.mesh.rotation.z = L.z;
      const moving = Math.hypot(zb.vx, zb.vz) > 0.15;
      this.pose(zb, dt, moving, crawlK);

      // Groans
      zb.groanTimer -= dt;
      if (zb.groanTimer <= 0) {
        zb.groanTimer = (zb.state === 'chase' ? 2.5 : 8) + Math.random() * 8;
        if (dist < 30) this.vocal(zb, zb.state === 'chase' ? 'growl' : 'groan', 30, 0.8);
      }
    }
    this.nearest = nearest;
  }

  // The body's pose this frame: crawling, walking or running (its own gait,
  // a limp), standing about (its own idle habit), and what's been done to it
  pose(zb, dt, moving, crawlK) {
    const p = zb.parts, G = zb.gait, K = zb.headKick, t = zb.phase, T = performance.now() / 1000 + G.seed;
    for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) {
      const part = p[k], b = part.userData.base;
      part.position.set(b.x, b.y, b.z - 0.17 * crawlK); // (lying down, lifted off the floor)
      part.rotation.set(0, 0, 0);
    }
    // elbows (negative: the hand comes up and forward) and knees (positive:
    // the foot goes back)
    for (const j of [p.foreL, p.foreR, p.shinL, p.shinR]) j.rotation.set(0, 0, 0);
    p.foreL.rotation.x = p.foreR.rotation.x = -0.28;
    // (the arms hang a little out from the body, not glued to its sides)
    p.armL.rotation.y = -0.1; p.armR.rotation.y = 0.1;
    p.head.rotation.x = K.x;
    if (crawlK > 0) {
      // Dragging itself along on its hands; the head up, looking for you
      const pull = moving ? Math.sin(t * 1.6) : Math.sin(T * 0.8) * 0.2;
      p.armL.rotation.x = -Math.PI / 2 * crawlK + (1 - crawlK) * 0.5 + pull * 0.7;
      p.armR.rotation.x = -Math.PI / 2 * crawlK + (1 - crawlK) * 0.5 - pull * 0.7;
      p.armL.rotation.z = 0.3 * crawlK; p.armR.rotation.z = -0.3 * crawlK;
      p.head.rotation.x = K.x - 0.9 * crawlK;
      p.torso.rotation.z = pull * 0.08;
      const drag = moving ? Math.sin(t * 1.6 + 1) * 0.15 : 0;
      p.legL.rotation.x = drag; p.legR.rotation.x = -drag;
      // hauling itself along: an elbow bends as that hand pulls, the other
      // reaches out straight; the legs trail, knees loose
      p.foreL.rotation.x = -0.15 - Math.max(0, -pull) * 1.1 * crawlK; p.foreR.rotation.x = -0.15 - Math.max(0, pull) * 1.1 * crawlK;
      p.shinL.rotation.x = 0.25 + Math.max(0, drag) * 0.6; p.shinR.rotation.x = 0.25 + Math.max(0, -drag) * 0.6;
      if (zb.attackCd > 1.0) { p.armL.rotation.x = p.armR.rotation.x = -Math.PI / 2 - 0.4; p.foreL.rotation.x = p.foreR.rotation.x = -0.05; }
      return;
    }
    const chase = zb.state === 'chase';
    const bad = Math.max(zb.legDmg.L, zb.legDmg.R) / zb.maxHp > 0.3 ? (zb.legDmg.L > zb.legDmg.R ? 'L' : 'R') : null;
    if (moving) {
      // Walking (or running): its own stride and arms; a dragging foot; a limp
      const st = G.stride * (chase ? 1.25 : 1), sw = Math.sin(t) * st;
      p.legL.rotation.x = sw * (bad === 'L' ? 0.35 : 1) + (G.drag === 1 ? 0.15 : 0);
      p.legR.rotation.x = -sw * (bad === 'R' ? 0.35 : 1) + (G.drag === -1 ? 0.15 : 0);
      // the knee folds as the leg swings through, straightens to take the weight
      // (a bad leg barely bends; a dragged foot scuffs along)
      const kn = (chase ? 1.1 : 0.75) * st;
      p.shinL.rotation.x = 0.08 + kn * Math.max(0, -Math.cos(t)) * (bad === 'L' ? 0.25 : 1) + (G.drag === 1 ? 0.25 : 0);
      p.shinR.rotation.x = 0.08 + kn * Math.max(0, Math.cos(t)) * (bad === 'R' ? 0.25 : 1) + (G.drag === -1 ? 0.25 : 0);
      const arms = chase ? -0.15 : G.arms;
      p.armL.rotation.x = arms + Math.sin(t * 0.5) * 0.15;
      p.armR.rotation.x = arms + Math.cos(t * 0.5) * 0.15;
      // reaching for you, the hands open and close; hanging, they swing loose
      if (chase || arms < 1) { p.foreL.rotation.x = -0.12 - 0.25 * Math.max(0, Math.sin(t * 0.9)); p.foreR.rotation.x = -0.12 - 0.25 * Math.max(0, Math.cos(t * 0.9 + 0.5)); }
      else { p.foreL.rotation.x = -0.2 - 0.18 * Math.sin(t + 0.6); p.foreR.rotation.x = -0.2 + 0.18 * Math.sin(t + 0.6); }
      p.torso.rotation.x = chase ? 0.22 : 0.08 + (G.arms > 1 ? 0.12 : 0);
      // lurching side to side with each step, worse on a bad leg
      const roll = Math.sin(t) * (G.lurch + (bad ? 0.14 : 0)) * (bad === 'R' ? -1 : 1);
      p.torso.rotation.z = roll; p.head.rotation.z = -roll * 0.6 + Math.sin(t * 0.3 + zb.groanTimer) * 0.15;
    } else {
      // Standing about: each has its habit
      p.legL.rotation.x = p.legR.rotation.x = 0;
      const hang = 1.35 + Math.sin(T * 0.9) * 0.08;
      p.armL.rotation.x = chase ? -0.15 : hang; p.armR.rotation.x = chase ? -0.15 : hang + 0.05;
      p.torso.rotation.x = 0.08;
      switch (chase ? 'sway' : zb.idleKind) {
        case 'sway': p.torso.rotation.z = Math.sin(T * 0.7) * 0.1; p.head.rotation.z = Math.sin(T * 0.5) * 0.3; break;
        case 'hunch': p.torso.rotation.x = 0.5; p.head.rotation.x = K.x + 0.45; p.armL.rotation.x = p.armR.rotation.x = 1.5 + Math.sin(T) * 0.06; p.torso.rotation.z = Math.sin(T * 0.4) * 0.05; p.foreL.rotation.x = p.foreR.rotation.x = -0.45; p.shinL.rotation.x = p.shinR.rotation.x = 0.22; break;
        case 'twitch': {
          if (Math.random() < dt * 0.7) K.v += (Math.random() - 0.5) * 9;
          if (Math.random() < dt * 0.3) zb.flail = 0.25;
          p.head.rotation.z = Math.sin(T * 0.4) * 0.2; break;
        }
        case 'scratch': { const c = Math.max(0, Math.sin(T * 0.5)); p.armR.rotation.x = hang - c * 1.9; p.armR.rotation.z = -c * 0.4; p.foreR.rotation.x = -0.3 - c * 1.7 + Math.sin(T * 9) * 0.12 * c; p.head.rotation.z = c * 0.3; break; }
        case 'look': p.head.rotation.y = Math.sin(T * 0.35) * 0.7; p.torso.rotation.y = Math.sin(T * 0.35) * 0.15; break;
      }
    }
    // standing: the knees never quite straight
    if (!moving) { p.shinL.rotation.x = Math.max(p.shinL.rotation.x, 0.06); p.shinR.rotation.x = Math.max(p.shinR.rotation.x, 0.1); }
    // the lunge: arms thrown out straight, then the hands clawing in
    if (zb.attackCd > 1.0) { const c = Math.min(1, (zb.attackCd - 1.0) / 0.3); p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6; p.foreL.rotation.x = p.foreR.rotation.x = -0.05 - (1 - c) * 0.9; }
    // a stumble: pitched forward, arms out to catch itself
    if (zb.stumble > 0.2) { const k = Math.min(1, zb.stumble / 0.5); p.torso.rotation.x += 0.35 * k; p.armL.rotation.x = p.armR.rotation.x = -0.7 * k + p.armL.rotation.x * (1 - k); }
    if (zb.flail > 0) {
      // Arms thrown out by the hit
      zb.flail -= dt;
      const k = Math.max(0, zb.flail / 0.6);
      p.armL.rotation.x -= k * 0.9; p.armR.rotation.x -= k * 0.7;
      p.armL.rotation.z = k * 0.6; p.armR.rotation.z = -k * 0.5;
      p.foreL.rotation.x -= k * 0.5; p.foreR.rotation.x -= k * 0.3;
    }
    if (zb.rise > 0.3) { p.armL.rotation.x = p.armR.rotation.x = 1.2; p.legL.rotation.x = p.legR.rotation.x = 0; p.foreL.rotation.x = p.foreR.rotation.x = -0.9; p.shinL.rotation.x = p.shinR.rotation.x = 0.6; }
  }

  // An open doorway close by (to line up on, rather than grind on its frame)
  doorwayNear(zb) {
    let best = null, bd = 2.2;
    for (const b of this.world.hash.query(zb.pos.x - 2.2, zb.pos.z - 2.2, zb.pos.x + 2.2, zb.pos.z + 2.2, this._dw || (this._dw = []), zb.pos.y, zb.pos.y + 1.6)) {
      const d = b.door && b.structure;
      if (!d || !(d.broken || d.ang > 0.62) || Math.abs((d.base || 0) - zb.pos.y) > 1) continue;
      const dd = Math.hypot(d.x - zb.pos.x, d.z - zb.pos.z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // Move on whatever floor it's on (stairs, storeys); refused where there's
  // no floor to step to
  step(zb, dx, dz) {
    const bx = zb.pos.x, bz = zb.pos.z;
    moveCircle(this.world.hash, zb.pos, zb.radius, dx, dz, zb.pos.y);
    const fy = this.world.levels.floorAt(zb.pos.x, zb.pos.z, zb.pos.y);
    if (fy === null) { zb.pos.x = bx; zb.pos.z = bz; } else zb.pos.y = fy;
  }

  structureNear(zb) {
    const r = zb.radius + 0.5;
    let best = null, bd = r;
    for (const b of this.world.hash.query(zb.pos.x - r, zb.pos.z - r, zb.pos.x + r, zb.pos.z + r, this._sn || (this._sn = []), zb.pos.y, zb.pos.y + 1.6)) {
      if (!b.structure || b.noCollide || !atHeight(b, zb.pos.y)) continue;
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
      // (a crawler's body lies out ahead of where its feet are)
      const fwd = zb.crawl ? 0.9 * zb.def.scale : 0;
      const bx = zb.pos.x + Math.sin(zb.dir) * fwd, bz = zb.pos.z + Math.cos(zb.dir) * fwd;
      const ox = bx - origin.x, oz = bz - origin.z;
      const hd = Math.hypot(dir.x, dir.z) || 1e-6;
      // closest approach in XZ
      const tAlong = (ox * dir.x + oz * dir.z) / (hd * hd);
      if (tAlong < -1 || tAlong > maxDist + 1) continue;
      const cx = origin.x + dir.x * tAlong - bx, cz = origin.z + dir.z * tAlong - bz;
      if (Math.hypot(cx, cz) > (zb.crawl ? 1.3 : 1.1) * zb.def.scale) continue;
      zb.mesh.updateMatrixWorld(true);
      _hits.length = 0;
      _ray.intersectObject(zb.mesh, true, _hits);
      const h = _hits.find((x) => !x.object.userData.gone);
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
    for (const im of Object.values(this.crowd.meshes)) { this.scene.remove(im); im.dispose(); }
    if (this.scene.onBeforeRender === this.drawHook) this.scene.onBeforeRender = () => {};
  }
}
