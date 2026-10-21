// FPV drones. Fly (right-click > Fly, or from the hotbar) and you see through
// the drone's camera: WASD to fly, the mouse to turn and tilt the camera,
// Space / C to climb and drop, Shift for speed. Your body stays where you
// stood (and if anything hurts it, you snap back). A payload hangs under it:
// a grenade is let go with the left mouse button (a short fuse, for drops);
// C4 or an RPG warhead makes it a kamikaze that goes off when it hits
// something or when you click. Right-click sets it down where it is, to be
// picked up again. The battery runs for about six minutes; past 300 m the
// signal breaks up and it falls out of the sky.
import * as THREE from 'three';
import { ITEMS, makeItem } from './items.js';
import { addItem, removeItem, makeGrid } from './inventory.js';
import { explode } from './explosives.js';
import { droneSound } from './audio.js';
import { LH, WALL_H } from './levels.js';

const BATTERY = 360;   // seconds of flight on a charge
const RANGE = 300;     // m before the link is lost
const SPEED = 16, BOOST = 26, CLIMB = 6;

function droneMesh() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc83a2a, roughness: 0.5 });
  const prop = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.35, depthWrite: false });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(0.09, 0.03, 0.14, frame, 0, 0, 0);
  box(0.07, 0.035, 0.09, red, 0, 0.032, -0.01); // battery
  box(0.03, 0.03, 0.03, frame, 0, 0.005, 0.075); // camera pod
  const props = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const arm = box(0.16, 0.012, 0.018, frame, x * 0.055, 0, z * 0.05); arm.rotation.y = x * z * 0.75;
    box(0.022, 0.025, 0.022, frame, x * 0.11, 0.012, z * 0.1);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.065, 16), prop); p.rotation.x = -Math.PI / 2; p.position.set(x * 0.11, 0.028, z * 0.1); g.add(p); props.push(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.props = props;
  return g;
}

function payloadMesh(key) {
  const def = ITEMS[key], m = new THREE.Mesh(def.type === 'throwable' ? new THREE.SphereGeometry(0.03, 8, 6) : key === 'pg7v' ? new THREE.CylinderGeometry(0.04, 0.02, 0.3, 10) : new THREE.BoxGeometry(0.1, 0.04, 0.06), new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 }));
  if (key === 'pg7v') { m.rotation.x = Math.PI / 2; m.position.set(0, -0.04, 0.12); } else m.position.y = -0.045;
  return m;
}

export class Drones {
  constructor(game) {
    this.game = game;
    this.flying = null; // { it, mesh, pos, vel, yaw, tilt, ... }
    this.el = document.createElement('div');
    this.el.id = 'fpv';
    this.el.innerHTML = `<canvas class="fpv-noise"></canvas><div class="fpv-cross"></div>
      <div class="fpv-tl"></div><div class="fpv-tr"></div><div class="fpv-bl"></div><div class="fpv-br"></div><div class="fpv-mid"></div>`;
    document.body.appendChild(this.el);
    this.noise = this.el.querySelector('canvas');
    this.noise.width = 160; this.noise.height = 90;
  }

  // ---------- the item ----------
  charge(it) { return it.charge ?? BATTERY; }
  actions(it, src) {
    const out = [];
    if (ITEMS[it.key].tool !== 'drone') return out;
    out.push(['Fly', () => this.launch(it, src.grid)]);
    if (it.payload) out.push([`Remove ${ITEMS[it.payload.key].name}`, () => { const pl = it.payload; it.payload = null; if (!this.game.player.ammoGrids().some((g) => addItem(g, pl))) this.game.dropItem(pl); }]);
    if (this.charge(it) < BATTERY - 1) {
      const grids = this.game.player.ammoGrids(), has = grids.find((g) => g.items.some((i) => i.key === 'mil_battery'));
      out.push([has ? 'Recharge (uses a military battery)' : 'Recharge (needs a military battery)', () => {
        if (!has) return this.game.hud.message('You need a military battery to recharge it.', 2);
        removeItem(has, has.items.find((i) => i.key === 'mil_battery'));
        it.charge = BATTERY;
        this.game.hud.message('Drone battery charged.', 2);
      }]);
    }
    out.push({ info: `Battery ${Math.round((this.charge(it) / BATTERY) * 100)}% · ${it.payload ? 'Payload: ' + ITEMS[it.payload.key].name : 'No payload (drag a grenade, C4 or an RPG warhead onto it)'}` });
    return out;
  }
  // A payload dragged onto the drone
  combine(drag, target, ctx) {
    const dd = ITEMS[drag.key];
    if (ITEMS[target.key].tool !== 'drone' || !['throwable', 'explosive'].includes(dd.type)) return false;
    ctx.detach();
    const old = target.payload;
    target.payload = drag.count > 1 ? (drag.count--, makeItem(drag.key)) : drag;
    if (old && !this.game.player.ammoGrids().some((g) => addItem(g, old))) this.game.dropItem(old);
    this.game.hud.message(`${dd.name} strapped under the drone.`, 2);
    return true;
  }

  // ---------- taking off ----------
  launch(it, grid) {
    const g = this.game, p = g.player;
    if (this.flying || p.vehicle || p.dead) return;
    if (this.charge(it) <= 1) { g.hud.message('The drone\'s battery is flat.', 2); return; }
    if (grid) removeItem(grid, it);
    if (g.invOpen) g.closeInventory();
    g.air?.active && g.air.toggle(false);
    g.thr?.held && g.thr.cancel(true);
    const mesh = droneMesh();
    if (it.payload) mesh.add(payloadMesh(it.payload.key));
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const pos = new THREE.Vector3(p.pos.x, p.floorY + 1.4, p.pos.z).addScaledVector(fwd, 0.8);
    mesh.position.copy(pos);
    mesh.visible = false; // (you're looking out of it)
    g.scene.add(mesh);
    this.flying = { it, mesh, pos, vel: new THREE.Vector3(0, 1.5, 0), yaw: p.yaw, tilt: -0.15, t: 0, noiseT: 0, hudT: 0 };
    this.el.style.display = 'block';
    document.body.classList.add('fpv-on');
    g.hud.message('Drone up. WASD fly · mouse steer · Space/C climb/drop · Shift fast · LMB drop/detonate · RMB set down', 5);
    this.buzz = droneSound();
    p.hurtFlash = 0;
  }

  // Takes the frame's input (your body stands still meanwhile)
  input(inp) {
    const D = this.flying, keys = this.game.input.keys;
    D.ctl = {
      f: inp.f - inp.b, s: inp.r - inp.l,
      up: (keys.has('Space') ? 1 : 0) - (keys.has('KeyC') || keys.has('ControlLeft') ? 1 : 0) + (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0),
      fast: inp.sprint, mdx: inp.mdx, mdy: inp.mdy, fire: inp.firePressed, back: inp.aim && !D.aimWas,
    };
    D.aimWas = inp.aim;
    for (const k of Object.keys(inp)) if (typeof inp[k] === 'boolean') inp[k] = false; else if (typeof inp[k] === 'number') inp[k] = 0;
    inp.hot = [false, false, false, false];
  }

  // The surface under the drone: a roof if it's above one, else the floor or ground
  floorBelow(x, z, y) {
    const W = this.game.world, lv = W.levels, B = lv.buildingAt(x, z);
    if (B) { const roof = (B.top + 1) * LH; return y >= roof - 0.2 ? roof : lv.groundUnder(x, z, y); }
    const b = W.buildingAt(x, z);
    if (b && !b.area) return y >= WALL_H + 0.05 ? WALL_H + 0.25 : 0;
    return W.groundAt(x, z);
  }

  update(dt) {
    const D = this.flying;
    if (!D) return;
    const g = this.game, p = g.player, c = D.ctl || { f: 0, s: 0, up: 0, mdx: 0, mdy: 0 };
    D.t += dt;
    // hurt at home: you drop the controller
    if (p.hurtFlash > 0.9 || p.dead) { g.hud.message("You're hit! You let go of the controls.", 3); return this.setDown(true); }
    D.it.charge = Math.max(0, this.charge(D.it) - dt);
    const dist = Math.hypot(D.pos.x - p.pos.x, D.pos.z - p.pos.z);
    const signal = Math.max(0, 1 - Math.max(0, dist - RANGE * 0.6) / (RANGE * 0.4));
    const dead = D.it.charge <= 0 || signal <= 0;
    // steering: the mouse turns it and tilts the camera
    D.yaw -= c.mdx * 0.0022;
    D.tilt = Math.max(-1.3, Math.min(0.6, D.tilt - c.mdy * 0.0022));
    const fwd = new THREE.Vector3(-Math.sin(D.yaw), 0, -Math.cos(D.yaw)), right = new THREE.Vector3(Math.cos(D.yaw), 0, -Math.sin(D.yaw));
    const sp = c.fast ? BOOST : SPEED;
    const want = dead ? new THREE.Vector3(0, -9, 0) : fwd.clone().multiplyScalar(c.f * sp).addScaledVector(right, c.s * sp * 0.7).setY(c.up * CLIMB);
    const k = Math.min(1, dt * (dead ? 0.8 : 2.6));
    D.vel.lerp(want, k);
    if (dead && !D.toldDead) { D.toldDead = true; g.hud.message(D.it.charge <= 0 ? 'Battery dead. The drone drops.' : 'Signal lost. The drone drops.', 3); }
    // move, a few small steps (walls, roofs, the ground)
    const steps = 3, h = dt / steps;
    for (let i = 0; i < steps && this.flying; i++) {
      const next = D.pos.clone().addScaledVector(D.vel, h);
      const speed = D.vel.length();
      // walls and props at its height
      let hit = null;
      for (const b of g.world.hash.query(next.x - 0.15, next.z - 0.15, next.x + 0.15, next.z + 0.15, this.tmp || (this.tmp = []))) {
        if (b.noCollide || b.gate || next.y > (b.h ?? 3) || next.y < (b.y0 ?? 0)) continue;
        if (next.x < b.minX - 0.12 || next.x > b.maxX + 0.12 || next.z < b.minZ - 0.12 || next.z > b.maxZ + 0.12) continue;
        hit = b; break;
      }
      // zombies: a kamikaze goes off on them
      if (D.it.payload && ITEMS[D.it.payload.key].type === 'explosive') {
        for (const zb of g.zombies.list) if (Math.hypot(zb.pos.x - next.x, zb.pos.z - next.z) < 0.6 && next.y > zb.pos.y && next.y < zb.pos.y + zb.height) { hit = zb; break; }
      }
      const floor = this.floorBelow(next.x, next.z, D.pos.y);
      const ground = next.y < floor + 0.08;
      if (hit || ground) {
        const hard = speed > 8 || (ground && -D.vel.y > 6);
        if (D.it.payload && ITEMS[D.it.payload.key].type === 'explosive' && speed > 3) return this.detonate();
        if (hard) return this.crash();
        if (hit) { D.vel.multiplyScalar(-0.3); continue; }
        next.y = floor + 0.08; if (D.vel.y < 0) D.vel.y = 0; D.vel.x *= 0.6; D.vel.z *= 0.6;
        if (dead) return this.setDown(false);
      }
      // the ceiling of a storey it's flying inside
      const B = g.world.levels.buildingAt(next.x, next.z);
      if (B && next.y < (B.top + 1) * LH - 0.2) { const ceil = (Math.floor((floor + 0.1) / LH) + 1) * LH - 0.3; if (next.y > ceil) { next.y = ceil; D.vel.y = Math.min(0, D.vel.y); } }
      D.pos.copy(next);
    }
    if (!this.flying) return;
    // the model: leaning into its motion, props spinning
    const lean = D.vel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -D.yaw);
    D.mesh.position.copy(D.pos);
    D.mesh.rotation.set(Math.max(-0.5, Math.min(0.5, lean.z * 0.03)), D.yaw, Math.max(-0.5, Math.min(0.5, -lean.x * 0.03)), 'YXZ');
    for (const pr of D.mesh.userData.props) pr.rotation.z += dt * 60;
    // its camera is the view
    const cam = g.camera;
    cam.position.copy(D.pos).add(new THREE.Vector3(0, 0.02, 0));
    cam.rotation.set(D.tilt, D.yaw, Math.max(-0.4, Math.min(0.4, -lean.x * 0.02)), 'YXZ');
    if (Math.abs(cam.fov - 100) > 0.1) { cam.fov = 100; cam.updateProjectionMatrix(); }
    // payload: drop a grenade, or set off a charge
    if (c.fire && D.it.payload) {
      const def = ITEMS[D.it.payload.key];
      if (def.type === 'throwable') {
        g.thr.spawn(D.it.payload.key, D.pos.clone().add(new THREE.Vector3(0, -0.08, 0)), D.vel.clone().setY(Math.min(0, D.vel.y)), 1.6);
        D.mesh.children[D.mesh.children.length - 1].visible = false;
        D.it.payload = null;
        g.hud.message('Payload away.', 1.5);
      } else return this.detonate();
    } else if (c.fire) g.hud.message('No payload. Drag a grenade, C4 or an RPG warhead onto the drone in your inventory.', 2.5);
    if (c.back) return this.setDown(false);
    // its whine carries a little
    if ((D.noiseT -= dt) <= 0) { D.noiseT = 1; g.zombies.noise(D.pos.x, D.pos.z, 9, false, D.pos.y > 2 ? this.floorBelow(D.pos.x, D.pos.z, D.pos.y) : 0); }
    this.buzz?.set(Math.min(0.5, 0.25 + 0.25 * D.vel.length() / BOOST), Math.min(1, 0.3 + D.vel.length() / BOOST + Math.max(0, c.up) * 0.3));
    this.hud(dt, dist, signal);
  }

  hud(dt, dist, signal) {
    const D = this.flying;
    if ((D.hudT -= dt) > 0) return;
    D.hudT = 0.1;
    const q = (s) => this.el.querySelector(s);
    const pct = Math.round((this.charge(D.it) / BATTERY) * 100), alt = D.pos.y - this.floorBelow(D.pos.x, D.pos.z, D.pos.y);
    q('.fpv-tl').innerHTML = `BAT ${pct}%<br>${Math.floor(this.charge(D.it) / 60)}:${String(Math.floor(this.charge(D.it) % 60)).padStart(2, '0')}`;
    q('.fpv-tr').innerHTML = `RSSI ${Math.round(signal * 99)}<br>DST ${Math.round(dist)} m`;
    q('.fpv-bl').innerHTML = `ALT ${alt.toFixed(1)} m<br>SPD ${Math.round(D.vel.length() * 3.6)} km/h`;
    const pl = D.it.payload && ITEMS[D.it.payload.key];
    q('.fpv-br').innerHTML = pl ? (pl.type === 'throwable' ? `${pl.short} READY<br>LMB DROP` : `${pl.short} ARMED<br>LMB / IMPACT`) : 'NO PAYLOAD';
    q('.fpv-mid').textContent = signal < 0.35 ? 'SIGNAL WEAK' : pct < 15 ? 'LOW BATTERY' : '';
    // the picture breaks up with range
    const n = this.noise, ctx = n.getContext('2d'), img = ctx.createImageData(n.width, n.height);
    const amt = 0.04 + (1 - signal) * 0.6;
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = Math.random() < amt ? 120 : 0; }
    ctx.putImageData(img, 0, 0);
  }

  detonate() {
    const D = this.flying, g = this.game, def = ITEMS[D.it.payload.key];
    const at = D.pos.clone();
    this.end();
    explode(g, at, { radius: def.radius, damage: def.damage, frag: def.frag, big: def.big, by: 'your own drone' });
    g.hud.message('Detonation. Signal lost.', 2.5);
  }

  crash() {
    const D = this.flying, g = this.game;
    const at = D.pos.clone();
    g.fx.burst(at, new THREE.Color(0xffd080), 8, 4, 0.3, 0.03);
    // a grenade it was carrying falls free and goes off
    if (D.it.payload && ITEMS[D.it.payload.key].type === 'throwable') g.thr.spawn(D.it.payload.key, at, new THREE.Vector3(), 2.5);
    this.end();
    g.hud.message('The drone smashes into something. Signal lost.', 3);
  }

  // Land where it is (or fall there): it becomes something to pick up
  setDown(falling) {
    const D = this.flying, g = this.game, p = g.player;
    const at = D.pos.clone();
    const near = Math.hypot(at.x - p.pos.x, at.z - p.pos.z) < 3 && Math.abs(at.y - p.floorY - 1) < 2;
    const it = D.it;
    this.end();
    if (near && p.ammoGrids().some((gr) => addItem(gr, it))) { g.hud.message('Drone back in hand.', 2); return; }
    const floor = this.floorBelow(at.x, at.z, at.y);
    const ct = g.addExtraContainer({ type: 'drop', name: 'FPV Drone', x: at.x, z: at.z, base: floor > 0.01 ? floor : undefined, grid: makeGrid(4, 4) });
    addItem(ct.grid, it);
    // show the drone itself where it came down
    if (ct.mesh) ct.mesh.visible = false;
    const m = droneMesh(); m.position.set(at.x, floor + 0.02, at.z); m.rotation.y = D.yaw;
    g.world.group.add(m);
    ct.mesh = m;
    g.hud.message(falling ? 'The drone comes down where it was. Go and get it.' : 'Drone set down. Walk over to pick it up.', 3);
  }

  end() {
    const D = this.flying, g = this.game;
    if (!D) return;
    g.scene.remove(D.mesh);
    this.flying = null;
    this.buzz?.stop(); this.buzz = null;
    this.el.style.display = 'none';
    document.body.classList.remove('fpv-on');
    g.player.buildViewmodel();
  }

  dispose() { this.end(); this.el.remove(); }
}
