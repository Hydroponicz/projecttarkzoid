// Zombie AI: wander, hear noises, see the player, chase via a BFS flow
// field (so they find doors), attack, die, and leave lootable corpses.
import * as THREE from 'three';
import { moveCircle, hasLOS } from './collision.js';
import { HALF, corpseMesh } from './world.js';
import { sfx } from './audio.js';

export const NAV_CELL = 0.6;
export const NAV_N = Math.ceil((HALF * 2) / NAV_CELL);
export const FIELD_R = 60; // cells around the player covered by the flow field

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
const eyeGeo = new THREE.BoxGeometry(0.05, 0.03, 0.02);
const pickArr = (a) => a[Math.floor(Math.random() * a.length)];

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
        let b = 0;
        for (const box of boxes) {
          if (box.noCollide) continue;
          if (x > box.minX - r && x < box.maxX + r && z > box.minZ - r && z < box.maxZ + r) { b = 1; break; }
        }
        this.blocked[i * NAV_N + j] = b;
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
        if (gi < 0 || gj < 0 || gi >= NAV_N || gj >= NAV_N || this.blocked[gi * NAV_N + gj]) continue;
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

  randomOpenPoint(awayFrom, minDist, avoid) {
    for (let i = 0; i < 50; i++) {
      const x = (Math.random() * 2 - 1) * (HALF - 4), z = (Math.random() * 2 - 1) * (HALF - 4);
      const gi = Math.floor((x + HALF) / NAV_CELL), gj = Math.floor((z + HALF) / NAV_CELL);
      if (this.blocked[gi * NAV_N + gj]) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDist) continue;
      // Never spawn in or right next to the player's safehouse.
      if (avoid && x > avoid.x0 - 15 && x < avoid.x1 + 15 && z > avoid.z0 - 15 && z < avoid.z1 + 15) continue;
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
    g.position.set(x, 0, z);
    this.scene.add(g);
    const zb = {
      mesh: g, parts: { head, torso, armL, armR, legL, legR }, type: typeName, def: t,
      pos: g.position, hp: t.hp, maxHp: t.hp, state: 'wander', target: null, lastSeen: 0,
      phase: Math.random() * 10, attackCd: 0, losTimer: Math.random() * 0.3, canSee: false,
      groanTimer: 3 + Math.random() * 10, wanderTimer: 0, dir: Math.random() * Math.PI * 2,
      radius: 0.32 * t.scale, height: 1.85 * t.scale, stagger: 0, dead: false, stuck: 0,
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
  noise(x, z, r) {
    for (const zb of this.list) {
      if (zb.dead || zb.state === 'chase') continue;
      const d = Math.hypot(zb.pos.x - x, zb.pos.z - z);
      if (d < r) { zb.state = 'investigate'; zb.target = { x: x + (Math.random() - 0.5) * 3, z: z + (Math.random() - 0.5) * 3 }; }
    }
  }

  damage(zb, amount, fromX, fromZ, head = false) {
    if (zb.dead) return false;
    // Armored zombies (soldiers) shrug off body shots; headshots go through.
    if (zb.def.armor && !head) amount *= 1 - zb.def.armor;
    zb.hp -= amount;
    zb.stagger = 0.25;
    zb.state = 'chase';
    zb.lastSeen = 3;
    // knockback
    const dx = zb.pos.x - fromX, dz = zb.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    moveCircle(this.world.hash, zb.pos, zb.radius, (dx / l) * 0.15, (dz / l) * 0.15);
    if (zb.hp <= 0) { this.kill(zb); return true; }
    return false;
  }

  kill(zb) {
    zb.dead = true;
    this.scene.remove(zb.mesh);
    const cloth = zb.parts.torso.material.color.getHex();
    const c = this.world.addContainer(zb.def.loot || 'body', zb.pos.x, zb.pos.z);
    c.type = 'body';
    c.name = zb.def.loot === 'soldier' ? 'Dead Soldier' : 'Zombie';
    if (!zb.def.loot && Math.random() < 0.65) c.grid.items.length = 0; // most zombies carry nothing
    c.mesh = corpseMesh(this.world.group, zb.pos.x, zb.pos.z, cloth);
    this.list.splice(this.list.indexOf(zb), 1);
  }

  update(dt, player, game) {
    const hash = this.world.hash;
    const px = player.pos.x, pz = player.pos.z;

    this.fieldTimer -= dt;
    if (this.fieldTimer <= 0) { this.fieldTimer = 0.35; this.updateField(px, pz); }

    // Trickle spawns keep the town alive; more over time.
    this.spawnTimer -= dt;
    const cap = 90 + Math.min(80, game.day * 8);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = game.isNight ? 5 : 10;
      if (this.list.length < cap) {
        const p = this.randomOpenPoint(player.pos, 45, game.safehouse);
        if (p) { const z = this.spawn(p.x, p.z); if (Math.random() < 0.5) { z.state = 'investigate'; z.target = { x: px, z: pz }; } }
      }
    }

    let nearest = Infinity;
    for (const zb of this.list) {
      // A zombie hunts either the player or an AI survivor ("prey").
      if (zb.prey && zb.prey.dead) { zb.prey = null; if (zb.state === 'chase') zb.state = 'wander'; }
      const prey = zb.prey;
      const pdist = Math.hypot(px - zb.pos.x, pz - zb.pos.z);
      const tx0 = prey ? prey.pos.x : px, tz0 = prey ? prey.pos.z : pz;
      const dx = tx0 - zb.pos.x, dz = tz0 - zb.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, pdist);

      // Hidden beyond what the fog lets you see (saves draw calls).
      zb.mesh.visible = pdist < (game.isNight ? 70 : 110);
      // Too far away: cheap sleep update.
      if (pdist > 90 && !prey) continue;

      // Perception (staggered)
      zb.losTimer -= dt;
      if (zb.losTimer <= 0) {
        zb.losTimer = 0.25;
        let range = (player.flashlight ? 30 : 18) * (game.isNight ? 0.8 : 1.3) * player.stealthMul * (game.dev?.invisible ? 0 : 1);
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
        speed = zb.def.chase * (game.isNight ? 1.15 : 1);
        // The flow field leads to the player; survivors are chased directly.
        const flow = !prey && (!zb.canSee || dist > 6) ? this.flowDir(zb.pos.x, zb.pos.z) : null;
        if (flow) { mx = flow[0]; mz = flow[1]; }
        else { mx = dx / (dist || 1); mz = dz / (dist || 1); }
      } else if (zb.state === 'investigate') {
        const tx = zb.target.x - zb.pos.x, tz = zb.target.z - zb.pos.z;
        const td = Math.hypot(tx, tz);
        if (td < 1.2) { zb.state = 'wander'; zb.wanderTimer = 4; }
        else { mx = tx / td; mz = tz / td; speed = zb.def.speed * 1.3; }
      } else {
        zb.wanderTimer -= dt;
        if (zb.wanderTimer <= 0) { zb.wanderTimer = 3 + Math.random() * 6; zb.dir += (Math.random() - 0.5) * 2.5; zb.idle = Math.random() < 0.4; }
        if (!zb.idle) { mx = Math.sin(zb.dir); mz = Math.cos(zb.dir); speed = zb.def.speed * 0.6; }
      }

      if (zb.stagger > 0) { zb.stagger -= dt; speed *= 0.2; }

      // Separation from other zombies (only nearby ones matter)
      if (speed > 0) {
        for (const o of this.list) {
          if (o === zb) continue;
          const ox = zb.pos.x - o.pos.x, oz = zb.pos.z - o.pos.z;
          const d2 = ox * ox + oz * oz;
          if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); mx += (ox / d) * 0.8; mz += (oz / d) * 0.8; }
        }
      }

      // Attack
      zb.attackCd -= dt;
      const reach = 1.0 * zb.def.scale;
      if (dist < reach + 0.1 && zb.state === 'chase') {
        speed = 0;
        if (zb.attackCd <= 0) {
          zb.attackCd = 1.3;
          const [a, b] = zb.def.dmg;
          const dmg = a + Math.random() * (b - a);
          if (prey) prey.hurt(dmg, 'zombie', zb);
          else player.takeZombieHit(dmg, zb);
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
        // Blocked while chasing → bash whatever player-made obstacle is in the way.
        if (zb.state === 'chase' && moved < speed * dt * 0.3) {
          zb.stuck += dt;
          if (zb.stuck > 0.6 && zb.attackCd <= 0) {
            const s = this.structureNear(zb);
            if (s) { zb.attackCd = 1.5; game.damageStructure(s, zb.def.dmg[1] * (zb.type === 'brute' ? 3 : 1)); }
          }
        } else zb.stuck = 0;
        // stuck while wandering → turn around
        if (zb.state === 'wander' && moved < speed * dt * 0.3) zb.dir += Math.PI * (0.5 + Math.random());
        const targetDir = Math.atan2(mx, mz);
        let dd = targetDir - zb.dir;
        dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        zb.dir += dd * Math.min(1, dt * 6);
        zb.phase += moved * 3.2;
      } else if (zb.state === 'chase') {
        zb.dir = Math.atan2(dx, dz);
      }

      // Animate
      const p = zb.parts;
      zb.mesh.rotation.y = zb.dir;
      const swing = Math.sin(zb.phase) * 0.6;
      p.legL.rotation.x = swing; p.legR.rotation.x = -swing;
      const reachUp = zb.state === 'chase' ? -0.15 : 0.5;
      p.armL.rotation.x = reachUp + Math.sin(zb.phase * 0.5) * 0.15;
      p.armR.rotation.x = reachUp + Math.cos(zb.phase * 0.5) * 0.15;
      if (zb.attackCd > 1.0) { p.armL.rotation.x = -0.6; p.armR.rotation.x = -0.6; }
      p.torso.rotation.x = zb.state === 'chase' ? 0.18 : 0.08;
      p.head.rotation.z = Math.sin(zb.phase * 0.3 + zb.groanTimer) * 0.25;

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
    for (const b of this.world.hash.query(zb.pos.x - r, zb.pos.z - r, zb.pos.x + r, zb.pos.z + r, [])) {
      if (!b.structure || b.noCollide) continue;
      const cx = Math.max(b.minX, Math.min(zb.pos.x, b.maxX)), cz = Math.max(b.minZ, Math.min(zb.pos.z, b.maxZ));
      if (Math.hypot(zb.pos.x - cx, zb.pos.z - cz) < r) return b.structure;
    }
    return null;
  }

  // 3D ray test against zombies. Returns { zb, t, head } for the closest hit.
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const zb of this.list) {
      const ox = zb.pos.x - origin.x, oz = zb.pos.z - origin.z;
      const hd = Math.hypot(dir.x, dir.z) || 1e-6;
      // closest approach in XZ
      const tAlong = (ox * dir.x + oz * dir.z) / (hd * hd);
      if (tAlong < 0 || tAlong > maxDist) continue;
      const cx = origin.x + dir.x * tAlong - zb.pos.x, cz = origin.z + dir.z * tAlong - zb.pos.z;
      const off = Math.hypot(cx, cz);
      const r = zb.radius * 1.05;
      if (off > r) continue;
      const tHit = tAlong - Math.sqrt(r * r - off * off) / hd;
      const y = origin.y + dir.y * tAlong;
      const s = zb.def.scale;
      if (y < 0 || y > zb.height) continue;
      if (!best || tHit < best.t) best = { zb, t: Math.max(0, tHit), head: y > 1.5 * s };
    }
    return best;
  }

  dispose() {
    for (const zb of this.list) this.scene.remove(zb.mesh);
    this.list = [];
  }
}
