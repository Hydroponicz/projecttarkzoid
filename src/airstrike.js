// Close air support. With a laser designator in your kit, N raises it: a
// zoomed view with a rangefinder. Hold the left mouse button on a target to
// lase it (or sweep the beam along a street to paint a line). With a military
// radio on your back, letting go calls in an A-10: it makes two gun runs along
// the painted line, one each way, and the 30 mm rounds tear up everything in a
// strip a few metres wide (zombies, people, windows, doors, and you, if you're
// standing in it). Then the radio needs a few minutes before the next one.
import * as THREE from 'three';
import { sfx, jetSound } from './audio.js';
import { ITEMS } from './items.js';
import { LH, WALL_H } from './levels.js';

const LASE_TIME = 1.2;   // seconds of steady lasing to fix a target
const COOLDOWN = 180;    // seconds before the radio can call another
const INBOUND = 15;      // seconds from the call to the first run
const SPEED = 170;       // m/s
const FIRE_FROM = 760, FIRE_TO = 420; // the run's firing window (distance before the target)
const START = 1500;      // where a run begins (distance before the target)
const RPS = 55;          // rounds per second that we simulate

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const UP = new THREE.Vector3(0, 1, 0);
const DUST = new THREE.Color(0x7a6a52), FIRE = new THREE.Color(0xffc070), DEBRIS = new THREE.Color(0x3a3228);

// ---------- the aircraft ----------
function buildA10() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: 0x5f666b, roughness: 0.7, metalness: 0.2, fog: false });
  const dark = new THREE.MeshStandardMaterial({ color: 0x40464a, roughness: 0.8, fog: false });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.1, metalness: 0.6, fog: false });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r, len, m, x, y, z, r2 = r) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 12), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); g.add(o); return o; };
  // fuselage (nose toward +z), cockpit, the gun under the nose
  box(1.6, 1.8, 11, grey, 0, 0, 0);
  box(1.3, 1.4, 2.4, grey, 0, -0.1, 6.6);
  box(0.9, 0.9, 1.4, grey, 0, -0.2, 8.4);
  box(0.95, 0.65, 2, glass, 0, 1.15, 4.6);
  cyl(0.17, 1.4, dark, 0, -0.55, 9.3);
  // straight wings with pylons and stores, a fairing at the root
  box(17.5, 0.32, 2.6, grey, 0, -0.45, 0.6);
  box(5, 0.5, 3.2, grey, 0, -0.5, 0.4);
  for (const x of [-6.5, -4.5, 4.5, 6.5]) { box(0.15, 0.35, 1.4, dark, x, -0.8, 0.8); cyl(0.17, 2.2, dark, x, -1.1, 0.8); }
  // the two engines high on the rear fuselage
  for (const s of [-1, 1]) {
    cyl(0.68, 3.4, grey, s * 1.55, 1.35, -3.2);
    box(0.5, 0.6, 1.6, grey, s * 0.95, 1.0, -3.2);
    const inlet = new THREE.Mesh(new THREE.CircleGeometry(0.6, 12), dark); inlet.position.set(s * 1.55, 1.35, -1.49); g.add(inlet);
  }
  // tail: the stabilizer and twin fins at its tips
  box(5.8, 0.22, 1.7, grey, 0, 0.45, -6.4);
  for (const s of [-1, 1]) box(0.22, 3, 1.9, grey, s * 2.9, 1.3, -6.5);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // muzzle flash (shown while firing)
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, fog: false }));
  flash.rotation.x = -Math.PI / 2; flash.position.set(0, -0.55, 11);
  flash.visible = false;
  g.add(flash);
  g.userData.flash = flash;
  return g;
}

// ---------- the designator's view ----------
function overlay() {
  const el = document.createElement('div');
  el.id = 'lase';
  el.innerHTML = `<div class="lase-mask"></div><div class="lase-ret"><i class="h"></i><i class="v"></i><b></b></div>
    <div class="lase-top"><span class="lase-rng">RNG ----</span><span class="lase-az">AZ ---</span><span class="lase-zoom">4.0×</span></div>
    <div class="lase-bar"><i></i></div>
    <div class="lase-status"></div>
    <div class="lase-help">Hold LMB: lase · sweep to paint a line · wheel: zoom · N / RMB: lower</div>`;
  document.body.appendChild(el);
  return el;
}

export class AirSupport {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.zoom = 4;
    this.lasing = 0;
    this.paint = [];
    this.target = null;
    this.strike = null;
    this.shake = 0;
    this.el = overlay();
    // the spot on the target, and the beam to it
    this.spot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false, transparent: true, opacity: 0.9, depthTest: false }));
    this.spot.renderOrder = 5;
    this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.35, fog: false }));
    this.spot.visible = this.beam.visible = false;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 40, 1.5);
    game.scene.add(this.spot, this.beam, this.flashLight);
    this.hudT = 0;
  }

  get fov() { return 75 / this.zoom; }
  get player() { return this.game.player; }
  carries() { return this.player.ammoGrids().some((g) => g.items.some((i) => ITEMS[i.key].tool === 'designator')); }
  radio() { const b = this.player.equip.backpack; return b && ITEMS[b.key].radio ? b : null; }

  toggle(on = !this.active) {
    if (on && !this.carries()) { this.game.hud.message('You need a laser designator.', 2); return; }
    if (on && (this.player.vehicle || this.player.dead)) return;
    this.active = on;
    this.lasing = 0; this.paint = [];
    this.el.style.display = on ? 'block' : 'none';
    this.spot.visible = this.beam.visible = false;
    const p = this.player;
    if (on) { p.gun.setVisible(false); if (p.vm) p.vm.visible = false; sfx.click(1800, 0.1); }
    else p.buildViewmodel();
  }

  // Takes the frame's input while the designator is up (the gun doesn't see it)
  input(inp) {
    if (inp.aim || this.player.vehicle || this.player.dead) { this.toggle(false); inp.aim = false; }
    if (inp.wheel) this.zoom = Math.max(2, Math.min(10, this.zoom * (inp.wheel > 0 ? 1 / 1.25 : 1.25)));
    const k = 1 / Math.pow(this.zoom / 1.5, 0.85);
    inp.mdx *= k; inp.mdy *= k;
    this.held = inp.fire;
    inp.fire = inp.firePressed = inp.aim = inp.reload = inp.slot1 = inp.slot2 = inp.fireMode = inp.check = false;
    inp.wheel = 0;
  }

  // ---------- what the beam hits ----------
  // A ray from o along d: zombies, slabs and roofs, walls and props, the ground
  cast(o, d, maxD = 900) {
    const g = this.game, W = g.world, lv = W.levels;
    let best = maxD;
    const z = g.zombies.raycast(o, d, best); if (z) best = z.t;
    const sl = lv.slabHit(o, d, best); if (sl < best) best = sl;
    const tmp = this.tmp || (this.tmp = []);
    let prevY = o.y;
    for (let t = 0.4; t < best; t += 0.5) {
      const x = o.x + d.x * t, y = o.y + d.y * t, zz = o.z + d.z * t;
      if (y < W.groundAt(x, zz)) { best = t; break; }
      // a one-storey roof, from above
      if (y < WALL_H + 0.25 && prevY >= WALL_H + 0.25 && !lv.buildingAt(x, zz) && W.buildingAt(x, zz)) { best = t; break; }
      prevY = y;
      let hit = false;
      tmp.length = 0;
      for (const b of W.hash.query(x, zz, x, zz, tmp)) {
        if (b.noCollide || b.gate || x < b.minX || x > b.maxX || zz < b.minZ || zz > b.maxZ) continue;
        if (y >= (b.y0 ?? 0) && y <= (b.h ?? 3)) { hit = true; break; }
      }
      if (hit) { best = t; break; }
    }
    return best < maxD ? o.clone().addScaledVector(d, best) : null;
  }

  // The top surface at (x, z): a roof, a sidewalk or the ground
  surfaceAt(x, z) {
    const W = this.game.world, B = W.levels.buildingAt(x, z);
    if (B) return (B.top + 1) * LH;
    const b = W.buildingAt(x, z);
    if (b && !b.area) return WALL_H + 0.25;
    return W.groundAt(x, z);
  }

  update(dt) {
    const g = this.game, p = this.player;
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const radio = this.radio();
    if (radio?.cool > 0) radio.cool = Math.max(0, radio.cool - dt);
    if (this.active && !this.carries()) this.toggle(false);
    if (this.active) this.updateLase(dt, radio);
    if (this.strike) this.updateStrike(dt);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);
  }

  updateLase(dt, radio) {
    const g = this.game, cam = g.camera;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = cam.position.clone();
    const hit = this.cast(o, d);
    this.target = hit;
    const on = this.held && hit;
    if (on) {
      this.lasing += dt;
      const last = this.paint[this.paint.length - 1];
      if (!last || last.distanceTo(hit) > 1.5) this.paint.push(hit.clone());
      if (this.paint.length > 60) this.paint.shift();
      const r = o.distanceTo(hit);
      this.spot.position.copy(hit); this.spot.scale.setScalar(Math.max(0.05, r * 0.0035));
      this.spot.visible = true;
      const a = o.clone().add(new THREE.Vector3(0.12, -0.15, 0).applyQuaternion(cam.quaternion));
      this.beam.geometry.setFromPoints([a, hit]);
      this.beam.visible = true;
    } else {
      this.spot.visible = this.beam.visible = false;
      if (this.lasing >= LASE_TIME && this.paint.length) this.call(radio);
      this.lasing = 0; this.paint = [];
    }
    // readouts
    if ((this.hudT -= dt) <= 0) {
      this.hudT = 0.1;
      const q = (c) => this.el.querySelector(c);
      const r = hit ? Math.round(cam.position.distanceTo(hit)) : null;
      q('.lase-rng').textContent = r ? `RNG ${String(r).padStart(4, '0')} m` : 'RNG ----';
      q('.lase-az').textContent = `AZ ${String(Math.round(((-this.player.yaw * 180) / Math.PI + 360) % 360)).padStart(3, '0')}°`;
      q('.lase-zoom').textContent = `${this.zoom.toFixed(1)}×`;
      q('.lase-bar i').style.width = `${Math.min(1, this.lasing / LASE_TIME) * 100}%`;
      q('.lase-bar').classList.toggle('locked', this.lasing >= LASE_TIME);
      let st;
      if (this.strike) st = this.strike.status;
      else if (!radio) st = 'NO RADIO — wear a military radio pack to call it in';
      else if (radio.cool > 0) st = `HOG REARMING ${Math.floor(radio.cool / 60)}:${String(Math.floor(radio.cool % 60)).padStart(2, '0')}`;
      else st = this.lasing >= LASE_TIME ? 'TARGET FIXED — release to call it in' : this.lasing > 0 ? 'LASING…' : 'HOG 1-1 AVAILABLE — hold LMB on a target';
      q('.lase-status').textContent = st;
    }
  }

  // ---------- calling it in ----------
  call(radio) {
    const g = this.game, p = this.player;
    if (!radio) { g.hud.message('You need a military radio on your back to call it in.', 3); return; }
    if (this.strike) { g.hud.message('A strike is already on its way.', 2); return; }
    if (radio.cool > 0) { g.hud.message(`The radio's dead air. Hog 1-1 is rearming (${Math.ceil(radio.cool)} s).`, 3); return; }
    // The run: along the painted line, or (one spot) across your line of sight
    const P = this.paint, a = P[0], b = P[P.length - 1];
    const center = a.clone().add(b).multiplyScalar(0.5);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    let dir;
    if (len > 6) dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    else {
      dir = new THREE.Vector3(center.x - p.pos.x, 0, center.z - p.pos.z).normalize();
      dir.set(-dir.z, 0, dir.x).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    }
    const L = Math.max(45, Math.min(130, len + 30));
    radio.cool = COOLDOWN;
    const close = Math.hypot(center.x - p.pos.x, center.z - p.pos.z);
    this.strike = { center, dir, L, t: -INBOUND, pass: 0, plane: null, rounds: [], status: `HOG 1-1 INBOUND` };
    g.hud.message(`"Hog 1-1, copy your laser. Two gun runs${close < 50 ? ', danger close' : ''}. Inbound, ${INBOUND} seconds."`, 5);
    sfx.radio(5);
    this.toggle(false);
  }

  startPass() {
    const S = this.strike, g = this.game;
    if (!S.plane) { S.plane = buildA10(); g.scene.add(S.plane); S.jet = jetSound(); }
    S.runDir = S.pass === 0 ? S.dir.clone() : S.dir.clone().negate();
    S.tau = 0; S.fired = 0; S.firing = false; S.toldOff = false;
    S.plane.visible = true;
    S.status = S.pass === 0 ? 'HOG 1-1 RUNNING IN' : 'HOG 1-1 RUNNING IN AGAIN';
  }

  // Where the plane is on its run: distance before the target, and height
  planeAt(S, tau) {
    const dist = START - SPEED * tau;
    const alt = dist >= FIRE_TO ? 80 + 250 * smooth(FIRE_TO, START, dist) : 80 + (FIRE_TO - dist) * 0.16;
    return { dist, pos: S.center.clone().addScaledVector(S.runDir, -dist).setY(S.center.y + alt) };
  }

  updateStrike(dt) {
    const S = this.strike, g = this.game, p = this.player;
    S.t += dt;
    if (S.t < 0) { S.status = `HOG 1-1 INBOUND ${Math.ceil(-S.t)} s`; return; }
    if (S.tau === undefined || S.done) {
      if (S.pass === 0 && S.tau === undefined) this.startPass();
      else if (S.done && S.t >= S.next) { S.pass = 1; S.done = false; this.startPass(); }
      else { S.status = 'HOG 1-1 COMING AROUND'; this.tickRounds(dt); return; }
    }
    S.tau += dt;
    const now = this.planeAt(S, S.tau), ahead = this.planeAt(S, S.tau + 0.1);
    S.plane.position.copy(now.pos);
    S.plane.lookAt(ahead.pos);
    S.plane.rotateZ(Math.sin(S.tau * 0.7) * 0.06);
    // its engines, louder as it comes, pitched by its closing speed
    const ear = g.camera.position, d = now.pos.distanceTo(ear);
    const dPrev = this.planeAt(S, S.tau - 0.05).pos.distanceTo(ear);
    const closing = (dPrev - d) / 0.05;
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const pan = now.pos.clone().sub(ear).setY(0).normalize().dot(right);
    S.jet.set(Math.min(1.2, 260 / (d + 60)) * 0.9, Math.max(0.75, Math.min(1.35, 343 / (343 - closing * 0.5))), pan);
    // the gun
    const firing = now.dist <= FIRE_FROM && now.dist >= FIRE_TO;
    S.plane.userData.flash.visible = firing && Math.random() < 0.7;
    if (firing && !S.firing) {
      S.firing = true;
      S.status = 'HOG 1-1 IN HOT';
      g.hud.message('"Hog 1-1, in hot."', 3);
      const delay = d / 343, dur = (FIRE_FROM - FIRE_TO) / SPEED;
      sfx.brrrt(Math.min(1, 900 / (d + 200)), pan, delay, dur);
      g.zombies.noise(S.center.x, S.center.z, 140, true, S.center.y);
    }
    if (firing) {
      // rounds leave the gun and walk along the strip
      const due = Math.floor(S.tau * RPS) - Math.floor((S.tau - dt) * RPS);
      for (let i = 0; i < due; i++) {
        const u = (FIRE_FROM - now.dist) / (FIRE_FROM - FIRE_TO);
        const along = -S.L / 2 + u * S.L, side = (Math.random() - 0.5) * 5;
        const x = S.center.x + S.runDir.x * along - S.runDir.z * side, z = S.center.z + S.runDir.z * along + S.runDir.x * side;
        const y = this.surfaceAt(x, z);
        const at = new THREE.Vector3(x, y, z);
        S.rounds.push({ at, t: now.pos.distanceTo(at) / 1000, n: S.fired++ });
      }
    } else if (S.firing && now.dist < FIRE_TO && !S.toldOff) {
      S.toldOff = true; S.status = 'HOG 1-1 OFF';
      setTimeout(() => { if (this.strike === S) { g.hud.message(S.pass === 0 ? '"Hog 1-1, off. Coming around for a second run."' : '"Hog 1-1, off. Winchester. Good hunting."', 4); sfx.radio(4); } }, 1500);
    }
    this.tickRounds(dt);
    // the run is over: around again, or home
    if (now.dist < -900) {
      S.plane.visible = false; S.done = true;
      S.jet.set(0);
      if (S.pass === 0) { S.next = S.t + 9; S.tau = 0; }
      else if (!S.rounds.length) this.endStrike();
    }
  }

  endStrike() {
    const S = this.strike;
    if (!S) return;
    if (S.plane) this.game.scene.remove(S.plane);
    S.jet?.stop();
    this.strike = null;
  }

  tickRounds(dt) {
    const S = this.strike;
    for (let i = S.rounds.length - 1; i >= 0; i--) {
      const r = S.rounds[i];
      r.t -= dt;
      if (r.t > 0) continue;
      S.rounds.splice(i, 1);
      this.impact(r.at, r.n);
    }
    if (S.pass === 1 && S.done && !S.rounds.length) this.endStrike();
  }

  // ---------- a 30 mm round lands ----------
  impact(at, n) {
    const g = this.game, p = this.player, fx = g.fx;
    // dust, a flash, sparks, a scorch
    // (many small puffs, not a few big ones: the particles are little cubes)
    for (let i = 0; i < 12; i++) {
      const c = DUST.clone().multiplyScalar(0.75 + Math.random() * 0.45);
      fx.particle(at, new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 7, (Math.random() - 0.5) * 6), c, 0.08 + Math.random() * 0.12, 0.8 + Math.random() * 0.8, { drag: 2.2, grow: 0.25, grav: 3 });
    }
    fx.burst(at, FIRE, 4, 10, 0.25, 0.06);
    if (n % 3 === 0) fx.burst(at, DEBRIS, 5, 7, 0.9, 0.08);
    fx.holes.add(at.clone().setY(at.y + 0.02), UP, 0.7 + Math.random() * 0.5);
    if (n % 4 === 0) { this.flashLight.position.copy(at).setY(at.y + 1.5); this.flashLight.intensity = 60; }
    // what you hear and feel of it
    const d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z);
    if (n % 2 === 0 && d < 260) {
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      sfx.cannonHit(Math.min(1, 25 / (d + 10)), new THREE.Vector3(at.x - p.pos.x, 0, at.z - p.pos.z).normalize().dot(right), d / 343);
    }
    this.shake = Math.max(this.shake, Math.min(1, 14 / (d + 6)));
    // Within a few metres of a burst: zombies and people are torn up (a round
    // into a roof goes through to the storey under it)
    const R = 3.2, below = (y) => y <= at.y + 0.6 && y >= at.y - LH - 0.6;
    for (const zb of [...g.zombies.list]) {
      const dx = zb.pos.x - at.x, dz = zb.pos.z - at.z, dd = Math.hypot(dx, dz);
      if (dd > R || !below(zb.pos.y)) continue;
      const dir = new THREE.Vector3(dx, 1.2, dz).normalize();
      const killed = g.zombies.damage(zb, 260 + Math.random() * 120, at.x, at.z, false, { point: zb.pos.clone().setY(zb.pos.y + 1), dir, force: 12 + Math.random() * 6 });
      if (killed) { p.kills++; g.traders?.onKill(zb); g.progress?.onKill(zb); }
    }
    for (const s of g.survivors?.list || []) {
      if (s.dead || Math.hypot(s.pos.x - at.x, s.pos.z - at.z) > R) continue;
      s.hurt(220, 'airstrike', null);
    }
    if (d < R + 0.5 && below(p.floorY)) p.takeBulletHit(55 + Math.random() * 40, 'the A-10');
    // windows and doors nearby
    const W = g.world;
    for (const w of W.windows) {
      if (w.state === 'broken' || Math.hypot(w.x - at.x, w.z - at.z) > 4.5 || Math.abs((w.base || 0) - at.y) > LH + 1) continue;
      g.breakWindow(w, new THREE.Vector3(w.x, (w.base || 0) + (w.sill + w.top) / 2, w.z), new THREE.Vector3(w.x - at.x, 0, w.z - at.z).normalize());
    }
    for (const dr of W.doors) {
      if (dr.hp <= 0 || Math.hypot(dr.x - at.x, dr.z - at.z) > 3.5 || Math.abs((dr.base || 0) - at.y) > LH + 1) continue;
      g.damageStructure(dr, 140, at);
    }
  }

  dispose() {
    this.endStrike();
    this.game.scene.remove(this.spot, this.beam, this.flashLight);
    this.el.remove();
  }
}
