// Vehicles: every car and truck in town can be driven if its parts are in
// working order. Parts (engine, battery, fuel tank, brakes, headlights,
// four tires) each have a condition; they wear, take damage in crashes and
// when running zombies down, and can be repaired, or pulled off one vehicle
// and fitted to another with a wrench (and a jack for tires). Fuel comes from
// gas cans, siphoning, and the pumps at the gas station.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, makeItem } from './items.js';
import { addItem, countItem, takeItem } from './inventory.js';
import { mulberry32 } from './world.js';
import { moveCircle } from './collision.js';
import { sfx, engineSound } from './audio.js';
import { buildCarModel } from './carmodels.js';

const $ = (id) => document.getElementById(id);
const TYPES = {
  sedan: { name: 'Sedan', L: 4.3, W: 1.9, tank: 50, power: 5.5, top: 30, wheelbase: 2.6 },
  police: { name: 'Police Cruiser', L: 4.4, W: 1.9, tank: 60, power: 6.5, top: 36, wheelbase: 2.7 },
  pickup: { name: 'Pickup Truck', L: 4.8, W: 2.0, tank: 70, power: 5.2, top: 28, wheelbase: 3.0 },
  military: { name: 'Military Truck', L: 6.2, W: 2.3, tank: 120, power: 4.2, top: 24, wheelbase: 3.8 },
};
// Parts: item = what it comes off as / goes on from; tools needed to swap it;
// repair = [item, condition restored] options.
export const PARTS = [
  { id: 'engine', name: 'Engine', repair: [['spark_plugs', 15], ['engine_parts', 35]], tools: ['wrench'] },
  { id: 'battery', name: 'Battery', item: 'battery', tools: ['wrench'] },
  { id: 'fuel_tank', name: 'Fuel Tank', repair: [['scrap', 25, 'tape']], tools: [] },
  { id: 'brakes', name: 'Brakes', item: 'brakes', tools: ['wrench'] },
  { id: 'headlights', name: 'Headlights', item: 'headlight', tools: [] },
  { id: 'tire_fl', name: 'Tire (front left)', item: 'tire', tools: ['wrench', 'jack'], repair: [['tape', 15]], repairCap: 60 },
  { id: 'tire_fr', name: 'Tire (front right)', item: 'tire', tools: ['wrench', 'jack'], repair: [['tape', 15]], repairCap: 60 },
  { id: 'tire_rl', name: 'Tire (rear left)', item: 'tire', tools: ['wrench', 'jack'], repair: [['tape', 15]], repairCap: 60 },
  { id: 'tire_rr', name: 'Tire (rear right)', item: 'tire', tools: ['wrench', 'jack'], repair: [['tape', 15]], repairCap: 60 },
];
const TIRES = ['tire_fl', 'tire_fr', 'tire_rl', 'tire_rr'];
const PART = Object.fromEntries(PARTS.map((p) => [p.id, p]));

class Vehicle {
  constructor(sys, spec, i, saved) {
    this.sys = sys;
    this.kind = 'vehicle';
    this.index = i;
    this.type = spec.type;
    this.def = TYPES[spec.type];
    this.name = this.def.name;
    this.color = spec.color;
    this.trunk = spec.trunk || null;
    this.x = spec.x; this.z = spec.z; this.rot = spec.rot;
    this.speed = 0; this.steer = 0; this.wheelSpin = 0;
    // Hinged panels: how open each is (0..1), where it's heading, and the
    // body's ride on the suspension (pitch, roll, bounce springs)
    this.anim = { door: 0, hood: 0, trunk: 0 }; this.animTo = { door: 0, hood: 0, trunk: 0 }; this.doorT = 0;
    this.susp = { p: 0, vp: 0, r: 0, vr: 0, y: 0, vy: 0 };
    this.running = false; this.lights = false;
    if (saved) {
      Object.assign(this, { x: saved.x, z: saved.z, rot: saved.rot, fuel: saved.fuel, lights: !!saved.lights });
      this.parts = { ...saved.parts };
    } else this.rollCondition(spec);
    this.group = new THREE.Group();
    this.group.userData.dynamic = true;
    sys.scene.add(this.group);
    this.boxes = [];
    this.buildMesh(false);
    this.place();
    this.setColliders(true);
  }

  // A fresh world: every vehicle is in a different state (project cars at
  // the garage are mostly stripped).
  rollCondition(spec) {
    const r = mulberry32(Math.floor(spec.rng * 4294967296) ^ 0x5eed);
    const roll = (lo, hi) => Math.round(lo + r() * (hi - lo));
    const p = {};
    const good = !spec.project && r() < 0.35; // some just need fuel and a battery
    p.engine = spec.project ? roll(5, 45) : good ? roll(55, 95) : roll(10, 80);
    p.battery = r() < (spec.project ? 0.6 : 0.3) ? null : good ? roll(30, 90) : roll(0, 60);
    p.fuel_tank = roll(spec.project ? 20 : 40, 100);
    p.brakes = r() < (spec.project ? 0.5 : 0.15) ? null : roll(20, 100);
    p.headlights = r() < 0.2 ? null : roll(0, 100);
    for (const t of TIRES) p[t] = r() < (spec.project ? 0.45 : 0.12) ? null : roll(good ? 50 : 5, 100);
    this.parts = p;
    this.fuel = r() < 0.4 ? 0 : Math.round(r() * this.def.tank * (good ? 0.5 : 0.25) * 10) / 10;
  }

  get fwdX() { return Math.sin(this.rot); }
  get fwdZ() { return Math.cos(this.rot); }
  // local (x right-of-driver = +x is the car's left, z forward) → world
  toWorld(lx, lz) { const s = Math.sin(this.rot), c = Math.cos(this.rot); return { x: this.x + c * lx + s * lz, z: this.z - s * lx + c * lz }; }

  // mode: 'parked' (one merged mesh), 'anim' (panels and wheels in pieces),
  // 'drive' (anim, seen from the driver's seat). true/false = drive/parked.
  buildMesh(mode) {
    if (mode === true) mode = 'drive'; else if (mode === false || mode == null) mode = 'parked';
    for (const o of [...this.group.children]) { this.group.remove(o); o.traverse((c) => c.geometry?.dispose()); }
    const m = buildCarModel(this, mode);
    this.mode = mode;
    this.group.add(m.root);
    this.bodyG = m.body; this.wheels = m.wheels; this.steeringWheel = m.steeringWheel;
    this.lightMeshes = m.lightMeshes; this.brakeMeshes = m.brakeMeshes; this.bar = m.bar;
    this.pivots = m.pivots; this.exhaust = m.exhaust;
    this.applyAnim();
  }

  // Swing the hinged panels to their current openness
  applyAnim() {
    for (const [name, pv] of Object.entries(this.pivots || {})) {
      if (!pv.node) continue;
      const k = this.anim[name], e = k * k * (3 - 2 * k);
      pv.node.rotation.set(0, 0, 0);
      pv.node.rotation[pv.axis] = pv.open * e;
    }
  }

  // Make sure the panels exist as separate pieces before animating them
  ensureSplit() { if (this.mode === 'parked') this.buildMesh('anim'); }

  wheelPositions() {
    const { L, W } = this.def;
    const ax = L / 2 - (this.type === 'military' ? 1.0 : 0.85);
    const x = W / 2 - 0.12;
    return [[x, ax, 'tire_fl'], [-x, ax, 'tire_fr'], [x, -ax, 'tire_rl'], [-x, -ax, 'tire_rr']];
  }

  place() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.rot;
    if (this.trunk) {
      const p = this.toWorld(0, -(this.def.L / 2 + 0.4));
      this.trunk.x = p.x; this.trunk.z = p.z;
    }
  }

  // Colliders: slices along the length, each an AABB of the rotated
  // footprint, as tall as the car is there.
  setColliders(on) {
    const hash = this.sys.world.hash;
    for (const b of this.boxes) hash.remove(b);
    this.boxes = [];
    if (!on) return;
    const { L, W } = this.def, mil = this.type === 'military';
    const SL = mil ? 5 : 4, c = Math.abs(Math.cos(this.rot)), sn = Math.abs(Math.sin(this.rot));
    for (let i = 0; i < SL; i++) {
      const a = -L / 2 + (i + 0.5) * (L / SL);
      const p = this.toWorld(0, a);
      const hw = (W * 0.95 * c + (L / SL) * sn) / 2, hd = (W * 0.95 * sn + (L / SL) * c) / 2;
      const b = { minX: p.x - hw, minZ: p.z - hd, maxX: p.x + hw, maxZ: p.z + hd, blocksShot: true, blocksSight: mil, h: mil ? 2.6 : a > -1.3 && a < 0.9 ? 1.6 : 1.0, vehicle: this };
      hash.insert(b);
      this.boxes.push(b);
    }
  }

  // Interaction points (sides, nose, tail) for "look at and press F"
  points() {
    const { L, W } = this.def;
    return [[W / 2 + 0.1, 0.3], [-(W / 2 + 0.1), 0.3], [0, L / 2 + 0.2], [0, -L / 2 - 0.2]].map(([lx, lz]) => ({ ...this.toWorld(lx, lz), kind: 'vehicle', name: this.name, v: this }));
  }

  // What stops it starting / driving, if anything
  problems() {
    const p = this.parts, out = [];
    if (p.battery == null) out.push('No battery');
    else if (p.battery < 8) out.push('Battery is dead');
    if (p.engine < 8) out.push('Engine is wrecked');
    if (p.fuel_tank == null || p.fuel_tank <= 0) out.push('Fuel tank is ruined');
    else if (this.fuel <= 0.05) out.push('Out of fuel');
    return out;
  }
  flats() { return TIRES.filter((t) => this.parts[t] == null || this.parts[t] < 3); }

  dispose() { this.setColliders(false); this.sys.scene.remove(this.group); for (const o of this.group.children) o.geometry?.dispose(); }
}

export class Vehicles {
  constructor(game, saved) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;
    const W = this.world;
    this.list = W.vehicleSpawns.map((spec, i) => new Vehicle(this, spec, i, saved?.cars?.[i]));
    // Vehicles spawned later (dev console) are saved with their spec
    for (const extra of saved?.extra || []) this.spawnExtra(extra.spec, extra.state);
    if (saved?.pumps) saved.pumps.forEach((f, i) => { if (W.pumps[i]) W.pumps[i].fuel = f; });
    this.active = null; // the vehicle you're driving
    this.panel = null;  // vehicle whose parts screen is open
    this.cullT = 0;
    this.noiseT = 0;
  }

  spawnExtra(spec, state) {
    const v = new Vehicle(this, spec, this.list.length, state);
    v.extraSpec = spec;
    this.list.push(v);
    return v;
  }

  interactables() { return this.active ? [] : this.list.flatMap((v) => v.points()); }

  nearest(pos, r = 6) {
    let best = null, bd = r;
    for (const v of this.list) { const d = Math.hypot(v.x - pos.x, v.z - pos.z); if (d < bd) { bd = d; best = v; } }
    return best;
  }

  // ---------- getting in and out ----------
  enter(v) {
    const g = this.game, p = g.player;
    if (v.speed && Math.abs(v.speed) > 1) return;
    this.closePanel();
    this.active = v;
    p.vehicle = v;
    p.lookYaw = 0; p.pitch = -0.05;
    v.buildMesh('drive');
    v.anim.door = 1; v.animTo.door = 0; v.doorT = 0; // you swing in and pull the door shut
    sfx.door();
    if (!this.engine) this.engine = engineSound();
    g.hud.message(`${v.name}: W to start and drive, S brake/reverse, A/D steer, Space handbrake, L lights, H horn, F to get out.`, 6);
    $('dash').style.display = 'block';
  }

  exit() {
    const g = this.game, p = g.player, v = this.active;
    if (!v) return;
    if (Math.abs(v.speed) > 2) return g.hud.message('Slow down first.', 1.5);
    v.speed = 0;
    v.running = false;
    this.engine?.set(0, 0);
    this.active = null;
    p.vehicle = null;
    v.buildMesh('anim');
    v.animTo.door = 1; v.doorT = 0.7; // door open, out you get, then it's shut
    sfx.door();
    v.setColliders(true);
    p.headlights(null);
    // Out the driver's side if there's room, else the other side
    for (const lx of [v.def.W / 2 + 0.6, -(v.def.W / 2 + 0.6)]) {
      const at = v.toWorld(lx, 0.3);
      const t = { x: at.x, z: at.z };
      moveCircle(this.world.hash, t, p.radius, 0, 0);
      if (Math.hypot(t.x - at.x, t.z - at.z) < 0.05) { p.pos.set(at.x, 0, at.z); break; }
      p.pos.set(t.x, 0, t.z);
    }
    p.yaw = v.rot + Math.PI + (p.lookYaw || 0);
    g.zombies.updateNavRegion(v.x - v.def.L, v.z - v.def.L, v.x + v.def.L, v.z + v.def.L);
    $('dash').style.display = 'none';
  }

  // ---------- driving (called from the player's update) ----------
  drive(dt, input) {
    const g = this.game, p = g.player, v = this.active, D = v.def, P = v.parts;
    // Look around inside the car
    p.lookYaw = Math.max(-2.2, Math.min(2.2, (p.lookYaw || 0) - input.mdx * 0.0022));
    p.pitch = Math.max(-1.1, Math.min(0.9, p.pitch - input.mdy * 0.0022));
    if (input.interact) return this.exit();
    if (input.flashlight) { v.lights = !v.lights; sfx.click(1400, 0.15); }
    if (this.horn && !input.heal) this.horn = false;
    if (input.heal && !this.horn) { this.horn = true; sfx.horn(); g.zombies.noise(v.x, v.z, 45); }

    // Starting: the first throttle press cranks the engine
    const throttleKey = input.f, brakeKey = input.b;
    if (!v.running && throttleKey && !(this.crank > 0)) {
      const probs = v.problems();
      if (probs.length) {
        if (!this.failT || this.failT <= 0) { sfx.click(900, 0.2); g.hud.message(`Won't start: ${probs.join(', ').toLowerCase()}.`, 2.5); this.failT = 1.5; }
      } else { this.crank = 0.9 + (100 - P.engine) / 100; sfx.crank(this.crank); }
    }
    if (this.failT > 0) this.failT -= dt;
    if (this.crank > 0) {
      this.crank -= dt;
      if (this.crank <= 0) {
        // Bad engines and weak batteries sometimes don't catch
        if (Math.random() < 0.03 + Math.max(0, (35 - P.engine) / 60) + Math.max(0, (25 - P.battery) / 50)) { g.hud.message('The engine coughs and dies. Try again.', 2); P.battery = Math.max(0, P.battery - 2); }
        else { v.running = true; g.hud.message('Engine running.', 1.5); }
      }
    }

    // --- physics: bicycle model with momentum ---
    const eng = P.engine / 100;
    const flats = v.flats();
    const grip = g.weather?.grip ?? 1; // wet or snowy roads (weather.js)
    let top = D.top * (0.35 + 0.65 * eng);
    if (flats.length) top = Math.min(top, 4.5);
    const fwd = v.running ? throttleKey : 0;
    if (fwd) v.speed += D.power * (0.45 + 0.55 * eng) * dt * (v.speed < 0 ? 2 : 1);
    if (brakeKey) {
      // Wet and snowy roads: longer stops
      if (v.speed > 0.4) v.speed = Math.max(0, v.speed - (P.brakes == null ? 1.5 : 2 + 8 * (P.brakes / 100)) * (0.35 + 0.65 * grip) * dt);
      else if (v.running) v.speed = Math.max(-5, v.speed - D.power * 0.6 * dt); // reverse
    }
    if (input.jump) v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), 6 * dt); // handbrake
    // rolling resistance and drag
    v.speed -= Math.sign(v.speed) * Math.min(Math.abs(v.speed), (0.35 + 0.012 * v.speed * v.speed + (flats.length ? 1.5 : 0)) * dt);
    v.speed = Math.max(-5, Math.min(top, v.speed));
    // steering: softer at speed; flats pull to their side
    // ...and the car washes out wide in corners at speed
    const steerIn = (input.l - input.r) * 0.55 / (1 + Math.abs(v.speed) * 0.05 * (2 - grip));
    v.steer += (steerIn - v.steer) * Math.min(1, dt * 4);
    let pull = 0;
    for (const t of flats) pull += t.endsWith('l') ? 0.06 : -0.06;
    const yawRate = (v.speed / D.wheelbase) * Math.tan(v.steer + pull) * (input.jump ? 1.35 : 1);
    const prev = { x: v.x, z: v.z, rot: v.rot };
    v.rot += yawRate * dt;
    v.x += Math.sin(v.rot) * v.speed * dt;
    v.z += Math.cos(v.rot) * v.speed * dt;

    // --- collisions with the world (three circles along the car) ---
    const hit = this.collide(v);
    if (hit) {
      const impact = Math.abs(v.speed);
      v.x = prev.x; v.z = prev.z; v.rot = prev.rot;
      v.speed = -v.speed * 0.2;
      if (impact > 3) {
        const dmg = (impact - 3) * 3.5;
        if (hit.front) { P.engine = Math.max(0, P.engine - dmg * 0.8); if (P.headlights != null) P.headlights = Math.max(0, P.headlights - dmg * 1.5); }
        else if (P.fuel_tank != null) P.fuel_tank = Math.max(0, P.fuel_tank - dmg);
        const t = TIRES[Math.floor(Math.random() * 4)]; if (P[t] != null) P[t] = Math.max(0, P[t] - dmg * 0.4);
        sfx.crash(Math.min(1, impact / 15));
        g.zombies.noise(v.x, v.z, 25);
        p.landDip = Math.min(0.15, impact * 0.012);
        if (impact > 12) { p.damagePart(Math.random() < 0.5 ? 'head' : 'thorax', (impact - 12) * 2.5); g.hud.message('You slam into the wheel', 2); }
      }
    }
    this.runOver(v);

    // --- wear, fuel, battery ---
    const dist = Math.abs(v.speed) * dt;
    for (const t of TIRES) if (P[t] != null) P[t] = Math.max(0, P[t] - dist * 0.004 * (input.jump ? 5 : 1));
    if (v.running) {
      v.fuel = Math.max(0, v.fuel - (0.004 + 0.05 * (fwd ? 1 : 0) * (0.4 + Math.abs(v.speed) / D.top)) * dt);
      if (P.battery != null) P.battery = Math.min(100, P.battery + 0.3 * dt);
      if (v.fuel <= 0) { v.running = false; g.hud.message('Out of fuel. The engine dies.', 3); }
      if (P.engine < 20 && fwd && Math.random() < dt * 0.05) { v.running = false; g.hud.message('The engine stalls.', 2); }
    } else if (v.lights && P.battery != null) P.battery = Math.max(0, P.battery - 0.06 * dt);
    if (P.fuel_tank != null && P.fuel_tank < 30) v.fuel = Math.max(0, v.fuel - (30 - P.fuel_tank) * 0.0006 * dt); // leaking
    if (g.progress) g.progress.s.c.drove = (g.progress.s.c.drove || 0) + dist;
    this.noiseT -= dt;
    if (v.running && this.noiseT <= 0) { this.noiseT = 1; g.zombies.noise(v.x, v.z, 14 + Math.abs(v.speed) * 1.2); }

    // --- visuals, camera, sound ---
    v.place();
    if (dist > 0 || v.rot !== prev.rot) v.setColliders(true); // they move with it
    // Body on its springs: squats under power, dives under braking, leans in corners
    const accel = (v.speed - (v.lastSpeed ?? v.speed)) / Math.max(dt, 1e-3);
    v.lastSpeed = v.speed;
    const lat = v.speed * ((v.rot - prev.rot) / Math.max(dt, 1e-3));
    const S = v.susp, kSpring = 60, damp = 9;
    const tp = THREE.MathUtils.clamp(-accel * 0.006, -0.05, 0.05), tr = THREE.MathUtils.clamp(lat * 0.006, -0.07, 0.07);
    S.vp += ((tp - S.p) * kSpring - S.vp * damp) * dt; S.p += S.vp * dt;
    S.vr += ((tr - S.r) * kSpring - S.vr * damp) * dt; S.r += S.vr * dt;
    S.vy += ((0 - S.y) * 90 - S.vy * 10) * dt; S.y += S.vy * dt;
    if (hit && Math.abs(v.speed) > 1) S.vy -= 0.6; // jolt on impact
    const idle = v.running ? (Math.random() - 0.5) * 0.004 : 0; // engine shake
    if (v.bodyG) { v.bodyG.rotation.set(S.p + idle * 0.3, 0, S.r + idle); v.bodyG.position.y = S.y; }
    // Brake lights; police lightbar flashing with the lights on
    const braking = (brakeKey && v.speed > 0.4) || (input.jump && Math.abs(v.speed) > 0.4);
    for (const b of v.brakeMeshes || []) b.visible = braking && P.battery > 0;
    if (v.bar?.length) { const on = v.lights && P.battery > 0, ph = Math.floor(performance.now() / 180) % 2; v.bar[0].material.emissiveIntensity = on && ph ? 3 : 0; v.bar[1].material.emissiveIntensity = on && !ph ? 3 : 0; }
    // Exhaust smoke: a thin trail at idle, puffs when you put your foot down
    this.smokeT = (this.smokeT || 0) - dt;
    if (v.running && v.exhaust && this.smokeT <= 0) {
      this.smokeT = fwd ? 0.05 : 0.14;
      const e = v.toWorld(v.exhaust[0], v.exhaust[2]);
      const back = v.toWorld(v.exhaust[0], v.exhaust[2] - 1);
      const vel = new THREE.Vector3((back.x - e.x) * 0.6 + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.3, (back.z - e.z) * 0.6 + (Math.random() - 0.5) * 0.3);
      const g2 = 0.35 + Math.random() * 0.15;
      g.fx.particle(new THREE.Vector3(e.x, v.exhaust[1], e.z), vel, new THREE.Color(g2, g2, g2), fwd ? 0.09 : 0.06, fwd ? 1.2 : 0.8, { drag: 1.5, grav: -0.4, grow: 0.25 });
    }
    v.wheelSpin += v.speed * dt / (v.type === 'military' ? 0.5 : 0.36);
    for (const w of v.wheels) { w.rotation.set(v.wheelSpin, w.userData.front ? v.steer : 0, 0, 'YXZ'); }
    if (v.steeringWheel) v.steeringWheel.rotation.z = -v.steer * 3;
    const lightsOn = v.lights && P.headlights > 0 && P.battery > 0;
    for (const l of v.lightMeshes) l.visible = lightsOn;
    // (the headlights are the flashlight's spotlight, moved to the nose)
    if (lightsOn) {
      const a = v.toWorld(0, D.L / 2), b = v.toWorld(0, D.L / 2 + 20);
      g.player.headlights(new THREE.Vector3(a.x, 0.9, a.z), new THREE.Vector3(b.x, 0, b.z), 60 * (P.headlights / 100));
    } else g.player.headlights(null);
    const seat = v.toWorld(v.type === 'military' ? 0.5 : 0.38, v.type === 'military' ? D.L / 2 - 1.3 : v.type === 'pickup' ? 0.35 : -0.25);
    p.pos.set(seat.x, 0, seat.z);
    p.yaw = v.rot + Math.PI + p.lookYaw;
    const eyeY = v.type === 'military' ? 2.05 : 1.16;
    p.camera.position.set(seat.x, eyeY + Math.sin(performance.now() / 70) * (v.running ? 0.002 : 0) - (p.landDip || 0), seat.z);
    p.camera.rotation.set(p.pitch, p.yaw, -v.steer * Math.min(1, Math.abs(v.speed) / 15) * 0.05);
    p.landDip = (p.landDip || 0) * Math.exp(-dt * 6);
    this.engine?.set(v.running ? 1 : 0, Math.abs(v.speed) / D.top + (fwd ? 0.15 : 0));
    this.drawDash(v);
  }

  // Returns {front} if a circle along the car overlaps something solid.
  collide(v) {
    const { L, W } = v.def, r = W / 2 * 0.95;
    const tmp = [];
    for (const lz of [L / 2 - r, 0, -(L / 2 - r)]) {
      const c = v.toWorld(0, lz);
      for (const b of this.world.hash.query(c.x - r, c.z - r, c.x + r, c.z + r, tmp)) {
        if (b.noCollide || (b.h ?? 3) < 0.25 || b.vehicle === v) continue;
        const cx = Math.max(b.minX, Math.min(c.x, b.maxX)), cz = Math.max(b.minZ, Math.min(c.z, b.maxZ));
        if (Math.hypot(c.x - cx, c.z - cz) < r) return { front: lz > 0 === v.speed > 0 };
      }
    }
    return null;
  }

  // Zombies and people in the way: at speed they go flying, slowly they get shoved aside.
  runOver(v) {
    const g = this.game, { L, W } = v.def;
    const s = Math.sin(v.rot), c = Math.cos(v.rot), spd = Math.abs(v.speed);
    const test = (pos, r) => {
      const dx = pos.x - v.x, dz = pos.z - v.z;
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      return Math.abs(lx) < W / 2 + r && Math.abs(lz) < L / 2 + r ? { lx, lz } : null;
    };
    for (const zb of [...g.zombies.list]) {
      if (zb.down || zb.vault) continue;
      const h = test(zb.pos, zb.radius);
      if (!h) continue;
      if (spd > 2.2) {
        const dir = new THREE.Vector3(Math.sign(v.speed) * s + (Math.random() - 0.5) * 0.4, 0.35, Math.sign(v.speed) * c + (Math.random() - 0.5) * 0.4).normalize();
        const hit = { point: new THREE.Vector3(zb.pos.x, 0.9, zb.pos.z), dir, force: Math.min(10, spd * 0.85), knock: 1 };
        g.fx.blood(hit.point, dir, { power: Math.min(2, spd / 6) });
        sfx.hitBody(Math.min(1, spd / 10)); sfx.crash(Math.min(0.6, spd / 20));
        const killed = g.zombies.damage(zb, spd * spd * 1.6, v.x, v.z, false, hit);
        if (killed) g.player.onKill(zb);
        if (v.parts.headlights != null && h.lz * Math.sign(v.speed) > 0) v.parts.headlights = Math.max(0, v.parts.headlights - spd * 0.4);
        v.parts.engine = Math.max(0, v.parts.engine - spd * 0.12);
        v.speed *= zb.type === 'brute' ? 0.45 : 0.82;
      } else {
        const push = Math.sign(h.lx || 1) * 0.12;
        moveCircle(this.world.hash, zb.pos, zb.radius, c * push, -s * push);
      }
    }
    for (const sv of g.survivors?.list || []) {
      if (sv.dead || sv.down) continue;
      if (!test(sv.pos, 0.3) || spd < 2.2) continue;
      const dir = new THREE.Vector3(Math.sign(v.speed) * s, 0.35, Math.sign(v.speed) * c).normalize();
      sv.hurt(spd * spd * 1.4, 'player', null, { point: new THREE.Vector3(sv.pos.x, 0.9, sv.pos.z), dir, force: Math.min(10, spd * 0.85), knock: 1 });
      v.speed *= 0.8;
    }
  }

  drawDash(v) {
    const P = v.parts, kmh = Math.round(Math.abs(v.speed) * 3.6);
    const warn = [];
    if (!v.running) warn.push(this.crank > 0 ? 'STARTING…' : 'ENGINE OFF');
    if (P.engine < 30) warn.push(`ENGINE ${Math.round(P.engine)}%`);
    if (v.flats().length) warn.push('FLAT TIRE');
    if (P.battery != null && P.battery < 20) warn.push('BATTERY LOW');
    if (P.fuel_tank != null && P.fuel_tank < 30) warn.push('FUEL LEAK');
    const fuelPct = Math.max(0, Math.min(100, (v.fuel / v.def.tank) * 100));
    $('dash').innerHTML = `<div class="ds-speed">${kmh}<small> km/h</small>${v.speed < -0.2 ? ' <b>R</b>' : ''}</div>
      <div class="ds-fuel"><span>FUEL</span><div><i style="width:${fuelPct}%;background:${fuelPct < 15 ? '#e44' : '#d8b040'}"></i></div><small>${v.fuel.toFixed(1)} L</small></div>
      <div class="ds-warn">${warn.join(' · ')}${v.lights ? ' · LIGHTS' : ''}</div>`;
  }

  // ---------- per frame (parked vehicles, culling) ----------
  update(dt) {
    const g = this.game, p = g.player.pos;
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.5;
      const vis = g.isNight ? 75 : 115;
      for (const v of this.list) v.group.visible = v === this.active || Math.hypot(v.x - p.x, v.z - p.z) < vis;
    }
    if (this.panel) {
      if (Math.hypot(this.panel.x - p.x, this.panel.z - p.z) > 5.5) this.closePanel();
      else if (this.dirty) { this.dirty = false; this.renderPanel(); }
    }
    if (!this.active) this.engine?.set(0, 0);
    // Doors, hoods and trunk lids swinging; cars go back to one mesh when shut
    for (const v of this.list) {
      if (v.mode === 'parked') continue;
      if (v.doorT > 0) { v.doorT -= dt; if (v.doorT <= 0) { v.animTo.door = 0; sfx.door(); } }
      let moving = false;
      for (const k of ['door', 'hood', 'trunk']) {
        const to = v.animTo[k], cur = v.anim[k];
        if (Math.abs(to - cur) > 1e-3) { v.anim[k] = cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), dt * (k === 'door' ? 2.6 : 1.4)); moving = true; }
      }
      v.applyAnim();
      const shut = !moving && v.anim.door + v.anim.hood + v.anim.trunk < 1e-3 && v.doorT <= 0;
      if (v.mode === 'anim' && shut && v !== this.active && v !== this.panel) v.buildMesh('parked');
    }
  }

  // The trunk lid lifts while you're rummaging in it
  setTrunk(container, open) {
    const v = this.list.find((x) => x.trunk === container);
    if (!v) return;
    v.ensureSplit();
    v.animTo.trunk = open ? 1 : 0;
    if (open) sfx.door();
  }

  // ---------- the parts screen ----------
  grids() { return this.game.player.ammoGrids(); }
  hasTool(t) { return this.grids().some((gr) => gr.items.some((it) => ITEMS[it.key].tool === t)) || this.game.player.melee?.key === t; }
  missingTools(part) { return (part.tools || []).filter((t) => !this.hasTool(t)); }
  bestItem(key) {
    let best = null, bg = null;
    for (const gr of this.grids()) for (const it of gr.items) if (it.key === key && (!best || (it.cond ?? 0) > (best.cond ?? 0))) { best = it; bg = gr; }
    return best ? { it: best, grid: bg } : null;
  }
  gasCans() { return this.grids().flatMap((gr) => gr.items.filter((it) => it.key === 'gas_can')); }

  openPanel(v) {
    const g = this.game;
    this.panel = v;
    // Pop the hood to look the car over
    v.ensureSplit();
    v.animTo.hood = 1;
    g.vehicleOpen = true;
    g.input.unlock();
    $('vehicle').style.display = 'flex';
    this.renderPanel();
    g.updatePause();
  }

  closePanel() {
    const g = this.game;
    if (!this.panel) return;
    this.panel.animTo.hood = 0;
    this.panel = null;
    g.vehicleOpen = false;
    $('vehicle').style.display = 'none';
    g.resume();
    g.updatePause();
  }

  act(v, partId, action) {
    const g = this.game, part = PART[partId], P = v.parts;
    const miss = this.missingTools(part);
    if (action !== 'repair' && miss.length) return g.hud.message(`You need a ${miss.map((t) => ITEMS[t].name.toLowerCase()).join(' and a ')}.`, 2.5);
    if (action === 'remove') {
      const it = makeItem(part.item, { cond: Math.round(P[partId]) });
      P[partId] = null;
      if (!this.grids().some((gr) => addItem(gr, it))) g.dropItem(it);
      sfx.bolt();
      g.hud.message(`Removed ${part.name.toLowerCase()} (${it.cond}%).`, 2);
    } else if (action === 'install') {
      const b = this.bestItem(part.item);
      if (!b) return;
      b.grid.items.splice(b.grid.items.indexOf(b.it), 1);
      P[partId] = b.it.cond ?? 70;
      sfx.magIn();
      g.hud.message(`Installed ${part.name.toLowerCase()} (${P[partId]}%).`, 2);
    } else if (action === 'repair') {
      const opt = (part.repair || []).find(([k, , extra]) => countItem(this.grids(), k) > 0 && (!extra || countItem(this.grids(), extra) > 0));
      if (!opt) return;
      if (partId === 'engine' && !this.hasTool('wrench')) return g.hud.message('You need a wrench.', 2);
      const [k, amt, extra] = opt;
      takeItem(this.grids(), k, 1);
      if (extra) takeItem(this.grids(), extra, 1);
      const skill = g.player.skill.carpentry || 0;
      P[partId] = Math.min(part.repairCap ?? 100, P[partId] + amt * (1 + skill * 0.06));
      sfx.hammer();
      g.hud.message(`Repaired ${part.name.toLowerCase()} → ${Math.round(P[partId])}%.`, 2);
    }
    if (partId.startsWith('tire') || partId === 'headlights') { v.buildMesh(v === this.active ? 'drive' : 'anim'); }
    this.renderPanel();
  }

  fuelAction(v, action) {
    const g = this.game;
    const cans = this.gasCans();
    if (!cans.length) return g.hud.message('You need a gas can.', 2);
    if (action === 'pour') {
      const can = cans.sort((a, b) => b.fuel - a.fuel)[0];
      const n = Math.min(can.fuel, v.def.tank - v.fuel);
      if (n <= 0) return g.hud.message(can.fuel <= 0 ? 'The gas can is empty.' : 'The tank is full.', 2);
      can.fuel = +(can.fuel - n).toFixed(1); v.fuel = +(v.fuel + n).toFixed(1);
      g.hud.message(`Poured ${n.toFixed(1)} L into the tank.`, 2);
    } else {
      const can = cans.sort((a, b) => a.fuel - b.fuel)[0];
      const n = Math.min(v.fuel, ITEMS.gas_can.cap - can.fuel);
      if (n <= 0) return g.hud.message(v.fuel <= 0 ? 'The tank is dry.' : 'The gas can is full.', 2);
      can.fuel = +(can.fuel + n).toFixed(1); v.fuel = +(v.fuel - n).toFixed(1);
      g.hud.message(`Siphoned ${n.toFixed(1)} L.`, 2);
    }
    sfx.windowSlide();
    this.renderPanel();
  }

  // Gas station pump: fills a car parked beside it, or your gas cans.
  usePump(pump) {
    const g = this.game;
    if (pump.fuel <= 0) return g.hud.message('The pump is dry.', 2);
    const v = this.nearest(pump, 6);
    if (v && v.fuel < v.def.tank - 0.1 && v.parts.fuel_tank != null) {
      const n = Math.min(pump.fuel, v.def.tank - v.fuel);
      pump.fuel -= n; v.fuel = +(v.fuel + n).toFixed(1);
      sfx.windowSlide();
      return g.hud.message(`Filled the ${v.name.toLowerCase()} with ${n.toFixed(1)} L. (${Math.round(pump.fuel)} L left in the pump)`, 3);
    }
    let total = 0;
    for (const can of this.gasCans()) {
      const n = Math.min(pump.fuel, ITEMS.gas_can.cap - can.fuel);
      can.fuel = +(can.fuel + n).toFixed(1); pump.fuel -= n; total += n;
    }
    if (total <= 0) return g.hud.message(this.gasCans().length ? 'Your gas cans are full.' : 'Bring a gas can, or park a car next to the pump.', 3);
    sfx.windowSlide();
    g.hud.message(`Filled your gas cans with ${total.toFixed(1)} L. (${Math.round(pump.fuel)} L left in the pump)`, 3);
  }

  renderPanel() {
    const v = this.panel;
    if (!v) return;
    const el = $('vehicle'), P = v.parts;
    const probs = v.problems(), flats = v.flats();
    const status = probs.length ? `Won't run: ${probs.join(', ').toLowerCase()}` : flats.length ? 'Runs, but has a flat' : 'Runs';
    const rows = PARTS.map((part) => {
      const c = P[part.id];
      const missing = c == null;
      const tools = this.missingTools(part);
      const btns = [];
      if (!missing && part.item) btns.push(`<button data-p="${part.id}" data-a="remove" title="${tools.length ? 'Needs ' + tools.join(', ') : ''}" ${tools.length ? 'class="need"' : ''}>Remove</button>`);
      if (missing && part.item) { const b = this.bestItem(part.item); btns.push(`<button data-p="${part.id}" data-a="install" ${b ? '' : 'disabled'} ${tools.length ? 'class="need"' : ''}>${b ? `Install (${b.it.cond}%)` : `Needs a ${ITEMS[part.item].name.toLowerCase()}`}</button>`); }
      if (!missing && part.repair) {
        const opt = part.repair.find(([k, , extra]) => countItem(this.grids(), k) > 0 && (!extra || countItem(this.grids(), extra) > 0));
        const label = part.repair.map(([k, , extra]) => ITEMS[k].short + (extra ? ' + ' + ITEMS[extra].short : '')).join(' / ');
        if (c < (part.repairCap ?? 100)) btns.push(`<button data-p="${part.id}" data-a="repair" ${opt ? '' : 'disabled'} title="Uses ${label}">Repair (${label})</button>`);
      }
      const pct = missing ? 0 : Math.round(c);
      return `<div class="vh-row"><span class="vh-name">${part.name}</span>
        <div class="vh-bar">${missing ? '<em>Missing</em>' : `<i style="width:${pct}%;background:${pct > 60 ? '#6c6' : pct > 25 ? '#d8b040' : '#e55'}"></i><b>${pct}%</b>`}</div>
        <div class="vh-act">${btns.join('')}</div></div>`;
    }).join('');
    const cans = this.gasCans(), canFuel = cans.reduce((n, c) => n + c.fuel, 0);
    el.innerHTML = `<div class="vh-panel">
      <div class="vh-head"><div><div class="vh-title">${v.name}</div><div class="dim">${status}</div></div><button class="tr-close">✕</button></div>
      <div class="vh-fuel">Fuel <div class="vh-bar"><i style="width:${(v.fuel / v.def.tank) * 100}%;background:#d8b040"></i><b>${v.fuel.toFixed(1)} / ${v.def.tank} L</b></div></div>
      <div class="vh-parts">${rows}</div>
      <div class="vh-foot">
        <button data-x="drive" class="go">Get in</button>
        ${v.trunk ? '<button data-x="trunk">Open trunk</button>' : ''}
        <button data-x="pour" ${canFuel > 0 ? '' : 'disabled'}>Pour gas can (${canFuel.toFixed(1)} L)</button>
        <button data-x="siphon" ${cans.length && v.fuel > 0 ? '' : 'disabled'}>Siphon into gas can</button>
      </div>
      <div class="hint">Swapping parts needs a wrench (tires: a wrench and a jack). Esc or walk away to close.</div></div>`;
    el.querySelector('.tr-close').onclick = () => this.closePanel();
    el.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => this.act(v, b.dataset.p, b.dataset.a); });
    el.querySelectorAll('[data-x]').forEach((b) => {
      b.onclick = () => {
        const x = b.dataset.x;
        if (x === 'drive') { this.closePanel(); this.enter(v); }
        else if (x === 'trunk') { this.closePanel(); this.game.openInventory(v.trunk); }
        else this.fuelAction(v, x);
      };
    });
  }

  // ---------- persistence ----------
  serialize() {
    const state = (v) => ({ x: +v.x.toFixed(2), z: +v.z.toFixed(2), rot: +v.rot.toFixed(3), fuel: +v.fuel.toFixed(1), lights: v.lights, parts: v.parts });
    return {
      cars: this.list.filter((v) => !v.extraSpec).map(state),
      extra: this.list.filter((v) => v.extraSpec).map((v) => ({ spec: { ...v.extraSpec, trunk: undefined }, state: state(v) })),
      pumps: this.world.pumps.map((p) => Math.round(p.fuel)),
    };
  }

  dispose() {
    this.closePanel();
    if (this.active) { this.game.player.vehicle = null; this.active = null; }
    this.engine?.set(0, 0);
    for (const v of this.list) v.dispose();
    $('dash').style.display = 'none';
  }
}
