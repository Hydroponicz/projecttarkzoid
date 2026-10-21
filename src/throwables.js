// Grenades and the hotbar. Things you keep in a pocket, vest or jacket (not
// a backpack: you can't reach into that in a hurry) can be put on the hotbar
// (keys 3-6) by dragging them onto a slot in the inventory. Pressing a slot's
// key uses what's there: a bandage or a medkit gets used, food eaten, a
// grenade comes up in your hand. With a grenade up, left click throws it
// overarm, right click lobs it underhand; 1 or 2 puts it away. It's armed
// when it leaves your hand, bounces off what it hits, and goes off when its
// fuse runs out.
import * as THREE from 'three';
import { vmFill } from './dynlights.js';
import { ITEMS } from './items.js';
import { removeItem } from './inventory.js';
import { sfx } from './audio.js';
import { explode } from './explosives.js';
import { VM_LAYER } from './weapons.js';

export const HOTBAR = 4;          // slots, on keys 3..6
const HOTBAR_TYPES = ['throwable', 'med', 'food', 'tool'];
const G = 9.8;

// A grenade's body: F-1 "pineapple", RGD-5 egg, M67 ball, with its fuse
function grenadeMesh(key, scale = 1) {
  const def = ITEMS[key], g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.4, metalness: 0.8 });
  const r = 0.03 * scale;
  const geo = def.shape === 'f1' ? new THREE.IcosahedronGeometry(r, 1) : new THREE.SphereGeometry(r, 12, 8);
  const m = new THREE.Mesh(geo, body);
  if (def.shape === 'f1') m.scale.set(1, 1.3, 1);
  else if (def.shape === 'rgd') m.scale.set(1, 1.15, 1);
  g.add(m);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.4, r * 0.8, 8), metal);
  fuse.position.y = r * 1.4; g.add(fuse);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 1.8, r * 0.15), metal);
  lever.position.set(r * 0.6, r * 0.7, 0); lever.rotation.z = 0.15; g.add(lever);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, r * 0.08, 6, 12), metal);
  ring.position.set(-r * 0.5, r * 1.6, 0); g.add(ring);
  g.userData.ring = ring;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Throwables {
  constructor(game) {
    this.game = game;
    this.held = null;    // { it, key, vm, t }
    this.live = [];      // grenades in flight
    this.el = document.createElement('div');
    this.el.id = 'hotbar';
    document.body.appendChild(this.el);
    this.hudT = 0;
  }

  get bar() {
    const pr = this.game.profile;
    if (!pr.hotbar) pr.hotbar = Array(HOTBAR).fill(null);
    return pr.hotbar;
  }
  // The grids you can reach without taking your pack off
  reach() {
    const p = this.game.player, g = [this.game.profile.pockets];
    for (const slot of ['rig', 'clothing']) if (p.equip[slot]?.grids) g.push(...p.equip[slot].grids);
    return g;
  }
  find(uid) {
    for (const grid of this.reach()) { const it = grid.items.find((i) => i.uid === uid); if (it) return { it, grid }; }
    return null;
  }
  // Another of the same kind within reach (the next grenade)
  findKey(key) {
    for (const grid of this.reach()) { const it = grid.items.find((i) => i.key === key); if (it) return { it, grid }; }
    return null;
  }
  count(key) { let n = 0; for (const grid of this.reach()) for (const i of grid.items) if (i.key === key) n += i.count || 1; return n; }

  canBind(item) { const t = ITEMS[item.key].type; return HOTBAR_TYPES.includes(t) && (t !== 'tool' || ['designator', 'drone'].includes(ITEMS[item.key].tool)); }
  bind(i, item, src) {
    const g = this.game;
    if (!this.canBind(item)) { g.hud.message('Only grenades, medical supplies, food, the designator and drones go on the hotbar.', 2.5); return false; }
    if (!src?.grid || !this.reach().includes(src.grid)) { g.hud.message("Keep it in a pocket, vest or jacket to use it from the hotbar (you can't reach into a backpack).", 3.5); return false; }
    const bar = this.bar;
    for (let k = 0; k < HOTBAR; k++) if (bar[k] === item.uid) bar[k] = null;
    bar[i] = item.uid;
    // (the slot remembers the kind too, for when this one is used up)
    pr(g).hotkeys ||= Array(HOTBAR).fill(null);
    pr(g).hotkeys[i] = item.key;
    this.hudT = 0;
    return true;
  }
  unbind(i) { this.bar[i] = null; if (pr(this.game).hotkeys) pr(this.game).hotkeys[i] = null; this.hudT = 0; }
  // What's in slot i now: the item itself, or another of its kind within reach
  slot(i) {
    const uid = this.bar[i];
    if (!uid) return null;
    const f = this.find(uid);
    if (f) return f;
    const key = pr(this.game).hotkeys?.[i];
    const next = key && this.findKey(key);
    if (next) { this.bar[i] = next.it.uid; return next; }
    return null;
  }

  press(i) {
    const g = this.game, p = g.player;
    if (p.dead || p.vehicle) return;
    const s = this.slot(i);
    if (!s) {
      const key = pr(g).hotkeys?.[i];
      g.hud.message(key ? `No ${ITEMS[key].name} within reach (not in your backpack?).` : `Hotbar ${i + 3} is empty: drag something from your pockets or vest onto it in the inventory.`, 2.5);
      return;
    }
    const def = ITEMS[s.it.key];
    if (def.type === 'throwable') return this.held?.it === s.it ? this.cancel() : this.ready(s.it);
    if (def.tool === 'designator') return g.air?.toggle();
    if (def.tool === 'drone') return g.drone?.launch(s.it, s.grid);
    // meds and food: used straight from the pocket
    if (p.use(s.it)) {
      if (def.uses) { s.it.uses -= 1; if (s.it.uses <= 0) removeItem(s.grid, s.it); }
      else if (def.stack && s.it.count > 1) s.it.count -= 1;
      else removeItem(s.grid, s.it);
      this.hudT = 0;
    }
  }

  // ---------- a grenade in the hand ----------
  ready(it) {
    const g = this.game, p = g.player;
    this.cancel(true);
    const vm = new THREE.Group();
    const glove = new THREE.MeshStandardMaterial({ color: 0x2c2c28, roughness: 0.95 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3a4230, roughness: 1 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.28), sleeve); arm.position.set(0, -0.04, 0.17); vm.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.08), glove); hand.position.set(0, 0, 0.02); vm.add(hand);
    const gr = grenadeMesh(it.key); gr.position.set(0, 0.045, -0.02); vm.add(gr);
    vm.userData.hip = new THREE.Vector3(0.2, -0.2, -0.42);
    vm.position.copy(vm.userData.hip);
    vm.traverse((o) => o.layers.set(VM_LAYER));
    vmFill(vm);
    p.camera.add(vm);
    this.held = { it, key: it.key, vm, gr, t: 0, throwT: 0 };
    p.gun.setVisible(false);
    if (p.vm) p.vm.visible = false;
    sfx.pin();
    this.hudT = 0;
  }

  cancel(silent = false) {
    const H = this.held;
    if (!H) return;
    this.game.player.camera.remove(H.vm);
    this.held = null;
    if (!silent) this.game.player.buildViewmodel();
    this.hudT = 0;
  }

  // Called by the player while a grenade is up (the gun's input goes here)
  updateHeld(dt, input, bob = 0) {
    const H = this.held, p = this.game.player;
    // put away, or gone from your pockets
    const where = this.find(H.it.uid);
    if (!where && H.throwT <= 0) return this.cancel();
    H.t += dt;
    const vm = H.vm;
    vm.position.copy(vm.userData.hip);
    vm.position.y += Math.sin(H.t * 2) * 0.004 + bob;
    if (H.throwT > 0) {
      // the throw: wind back, then the arm comes over
      H.throwT -= dt;
      const k = 1 - H.throwT / 0.35;
      vm.rotation.set(k < 0.4 ? -k * 2 : -0.8 + (k - 0.4) * 4, 0, 0);
      vm.position.z -= k > 0.4 ? (k - 0.4) * 0.6 : 0;
      H.gr.visible = k < 0.45;
      if (H.throwT <= 0) {
        // the next one comes up, if there is one
        const next = this.findKey(H.key);
        this.cancel(true);
        if (next) this.ready(next.it); else p.buildViewmodel();
      }
      return;
    }
    vm.rotation.set(0, 0, 0);
    if (input.firePressed) this.throw(where, 1);
    else if (input.aim && !this.aimWas) this.throw(where, 0.45);
    this.aimWas = input.aim;
  }

  throw(where, power) {
    const g = this.game, p = g.player, H = this.held, def = ITEMS[H.key];
    removeItem(where.grid, where.it);
    const cam = p.camera, q = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const pos = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.4).addScaledVector(right, 0.15);
    const vel = fwd.multiplyScalar(power > 0.5 ? 17 : 7.5).add(new THREE.Vector3(0, power > 0.5 ? 2.5 : 3.5, 0));
    if (p.vel) vel.add(new THREE.Vector3(p.vel.x || 0, 0, p.vel.z || 0));
    this.spawn(H.key, pos, vel, def.fuse);
    H.throwT = 0.35;
    sfx.throwWhoosh();
    g.zombies.noise(p.pos.x, p.pos.z, 4, false, p.floorY);
    this.hudT = 0;
  }

  // A live grenade loose in the world (thrown, or dropped from a drone)
  // (by: who threw it, if it wasn't you)
  spawn(key, pos, vel, fuse, by = null) {
    const mesh = grenadeMesh(key);
    mesh.userData.ring.visible = false;
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.live.push({ key, def: ITEMS[key], mesh, pos: pos.clone(), vel: vel.clone(), fuse, by, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12) });
  }

  // ---------- grenades in flight ----------
  update(dt) {
    const g = this.game, W = g.world, lv = W.levels;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i], pos = n.pos, v = n.vel;
      n.fuse -= dt;
      const steps = 3, h = dt / steps;
      for (let s = 0; s < steps; s++) {
        v.y -= G * h;
        const nx = pos.x + v.x * h, ny = pos.y + v.y * h, nz = pos.z + v.z * h;
        // walls and props at its height: bounce off the side it came through
        let hitWall = false;
        for (const b of W.hash.query(nx - 0.05, nz - 0.05, nx + 0.05, nz + 0.05, this.tmp || (this.tmp = []))) {
          if (b.noCollide || b.gate || ny > (b.h ?? 3) || ny < (b.y0 ?? 0)) continue;
          if (nx < b.minX || nx > b.maxX || nz < b.minZ || nz > b.maxZ) continue;
          // came down onto its top
          if (pos.y >= (b.h ?? 3) - 0.02 && (b.h ?? 3) - (b.y0 ?? 0) < 2.5) { pos.y = b.h ?? 3; if (Math.abs(v.y) > 2) sfx.clunk(Math.min(1, Math.abs(v.y) / 8)); v.y = -v.y * 0.3; v.x *= 0.6; v.z *= 0.6; hitWall = true; break; }
          const inX = pos.x >= b.minX && pos.x <= b.maxX;
          if (inX) v.z = -v.z * 0.35; else v.x = -v.x * 0.35;
          v.x *= 0.7; v.z *= 0.7;
          if (Math.hypot(v.x, v.z) > 1.5) sfx.clunk(0.6);
          hitWall = true;
          break;
        }
        if (!hitWall) { pos.x = nx; pos.z = nz; pos.y = ny; }
        // the floor under it (stairs, storeys, sidewalks)
        const floor = lv.buildingAt(pos.x, pos.z) ? lv.groundUnder(pos.x, pos.z, pos.y + 0.1) : W.groundAt(pos.x, pos.z);
        if (pos.y < floor + 0.04) {
          pos.y = floor + 0.04;
          if (v.y < -1.5) sfx.clunk(Math.min(1, -v.y / 8));
          v.y = -v.y * 0.28;
          if (Math.abs(v.y) < 0.6) v.y = 0;
          v.x *= 0.55; v.z *= 0.55;
          if (Math.hypot(v.x, v.z) < 0.15) { v.x = 0; v.z = 0; }
        }
        // through floors and ceilings in a tall building
        const ceil = lv.buildingAt(pos.x, pos.z) ? (Math.floor(floor / 3.25) + 1) * 3.25 - 0.25 : Infinity;
        if (pos.y > ceil) { pos.y = ceil - 0.02; v.y = -Math.abs(v.y) * 0.3; }
      }
      n.mesh.position.copy(pos);
      if (v.lengthSq() > 0.01) { n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.z += n.spin.z * dt; }
      if (n.fuse <= 0) {
        g.scene.remove(n.mesh);
        this.live.splice(i, 1);
        explode(g, pos.clone().setY(pos.y + 0.05), { radius: n.def.radius, damage: n.def.damage, frag: n.def.frag, big: n.def.big, by: n.by ? `${n.by.met ? n.by.name : 'a bandit'}'s grenade` : 'your own grenade', byPlayer: !n.by });
      }
    }
    if ((this.hudT -= dt) <= 0) { this.hudT = 0.3; this.drawHud(); }
  }

  drawHud() {
    const g = this.game;
    if (!g.profile || g.player?.dead) { this.el.style.display = 'none'; return; }
    const bar = this.bar, keys = pr(g).hotkeys || [];
    this.el.style.display = bar.some(Boolean) || this.held ? 'flex' : 'none';
    this.el.innerHTML = bar.map((uid, i) => {
      const s = uid ? this.slot(i) : null, key = s?.it.key || keys[i];
      const def = key && ITEMS[key];
      const n = key ? this.count(key) : 0;
      const on = this.held && this.held.key === key;
      return `<div class="hb${on ? ' on' : ''}${def && !n ? ' out' : ''}"><b>${i + 3}</b>${def ? `<span style="border-color:${def.color}">${def.short}</span><i>${n > 1 ? '×' + n : n ? '' : '0'}</i>` : ''}</div>`;
    }).join('');
  }

  dispose() {
    this.cancel(true);
    for (const n of this.live) this.game.scene.remove(n.mesh);
    this.live = [];
    this.el.remove();
  }
}

const pr = (g) => g.profile;
