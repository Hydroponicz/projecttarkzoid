// The insertion: a new character is flown in by helicopter. A Mi-8 comes in
// low over the countryside, over the town, flares and puts down at a landing
// zone on the edge of town; you jump out of the door and it's gone. Shots:
// chasing it, from the cabin out of the open door, from the ground as it
// comes in, and from the door as it touches down. Space or Esc skips.
import * as THREE from 'three';
import { heliSound } from './audio.js';

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const LANDED = 17.5, JUMP = 19.6, END = 21.2;

// A Mi-8 "Hip": a long cabin with an open side door (and an interior you can
// see from inside), the glazed nose, engines on top, tail boom and rotors
export function buildMi8() {
  const g = new THREE.Group();
  const olive = new THREE.MeshStandardMaterial({ color: 0x4f5a3c, roughness: 0.8, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e24, roughness: 0.9 });
  const inside = new THREE.MeshStandardMaterial({ color: 0x5a5e54, roughness: 0.95, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a30, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.75 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x6a3a2a, roughness: 0.9 });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); parent.add(o); return o; };
  const cyl = (r, len, m, x, y, z, r2 = r, rot = 'x') => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 14), m); o.rotation[rot] = Math.PI / 2; o.position.set(x, y, z); g.add(o); return o; };
  // cabin shell (nose toward +z), built from panels so the door is a real gap
  const L = 9, W = 2.4, H = 2.3;
  box(W, 0.12, L, olive, 0, 0, 0);                     // floor
  box(W, 0.14, L, olive, 0, H, 0);                     // roof
  box(0.1, H, L, olive, -W / 2, H / 2, 0);             // left side
  box(0.1, H, 3.2, olive, W / 2, H / 2, 2.9);          // right side, ahead of the door
  box(0.1, H, 3.6, olive, W / 2, H / 2, -2.7);         // right side, behind it
  box(0.1, 0.4, 2.2, olive, W / 2, H - 0.2, 0.2);      // over the door
  box(W, H, 0.1, olive, 0, H / 2, -L / 2);             // rear clamshell doors
  // the inside: lining, benches down both sides, three squadmates
  box(W - 0.25, 0.02, L - 0.3, inside, 0, 0.07, 0);
  box(W - 0.25, 0.02, L - 0.3, inside, 0, H - 0.08, 0);
  for (const s of [-1, 1]) for (let z = -3.4; z < 3.6; z += 0.75) if (s < 0 || z < -1.2 || z > 1.6) box(0.5, 0.08, 0.6, seat, s * (W / 2 - 0.35), 0.5, z);
  const people = [];
  for (const [x, z] of [[-0.85, 2.4], [-0.85, 0.6], [0.85, -1.6]]) {
    const p = new THREE.Group(); p.position.set(x, 0.55, z); g.add(p);
    box(0.4, 0.55, 0.3, new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 1 }), 0, 0.3, 0, p);
    box(0.24, 0.26, 0.24, new THREE.MeshStandardMaterial({ color: 0xc09070, roughness: 0.9 }), 0, 0.72, 0, p);
    box(0.28, 0.1, 0.28, olive, 0, 0.86, 0, p);
    box(0.36, 0.14, 0.5, new THREE.MeshStandardMaterial({ color: 0x3a4430 }), 0, -0.05, 0.25 * (x < 0 ? 1 : -1), p);
    p.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    people.push(p);
  }
  // nose and cockpit glazing
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), olive);
  nose.rotation.x = Math.PI / 2; nose.scale.set(0.96, 1.2, 0.95); nose.position.set(0, 1.1, L / 2); g.add(nose);
  box(W, H, 0.12, olive, 0, H / 2, L / 2 - 0.05);       // cockpit bulkhead
  box(1.9, 0.9, 1.1, glass, 0, 1.75, L / 2 + 0.55);
  // engines and gearbox on the roof, exhausts, the rotor mast
  box(1.9, 0.85, 5.2, olive, 0, H + 0.45, 1.4);
  for (const s of [-1, 1]) { cyl(0.42, 2.8, olive, s * 0.55, H + 0.5, 3.0); cyl(0.3, 0.6, dark, s * 1.05, H + 0.55, 0.2); }
  cyl(0.18, 0.8, dark, 0, H + 1.1, 0.9, 0.18, 'y');
  // tail boom, fin, stabilisers
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.32, 8.5, 12), olive);
  boom.rotation.x = -Math.PI / 2; boom.position.set(0, 1.5, -L / 2 - 4.1); g.add(boom);
  box(0.18, 2.4, 1.2, olive, 0, 2.6, -L / 2 - 8.2);
  box(2.6, 0.1, 0.8, olive, 0, 1.5, -L / 2 - 7.2);
  // external fuel tanks and the gear
  for (const s of [-1, 1]) {
    cyl(0.45, 2.2, olive, s * (W / 2 + 0.45), 0.55, 2.7); // ahead of the door
    box(0.12, 0.7, 0.12, dark, s * 1.55, -0.35, -0.6);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), dark); wh.rotation.z = Math.PI / 2; wh.position.set(s * 1.55, -0.65, -0.6); g.add(wh);
  }
  const nw = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 12), dark); nw.rotation.z = Math.PI / 2; nw.position.set(0, -0.6, 3.8); g.add(nw);
  // rotors: blades plus a faint disc for the blur
  const main = new THREE.Group(); main.position.set(0, H + 1.5, 0.9); g.add(main);
  for (let i = 0; i < 5; i++) { const b = box(0.45, 0.05, 10.5, dark, 0, 0, 5.25, new THREE.Group()); const arm = b.parent; arm.rotation.y = (i / 5) * Math.PI * 2; main.add(arm); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(10.6, 32), new THREE.MeshBasicMaterial({ color: 0x202020, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  disc.rotation.x = -Math.PI / 2; main.add(disc);
  const tail = new THREE.Group(); tail.position.set(-0.25, 2.9, -L / 2 - 8.3); g.add(tail);
  for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.x = (i / 3) * Math.PI * 2; box(0.05, 1.8, 0.25, dark, 0, 0.9, 0, arm); tail.add(arm); }
  // tactical number on the boom
  const tag = document.createElement('canvas'); tag.width = 128; tag.height = 64;
  const cx = tag.getContext('2d'); cx.fillStyle = '#e8d060'; cx.font = 'bold 54px sans-serif'; cx.fillText('22', 30, 54);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tag), transparent: true }));
  num.position.set(0.78, 1.55, -L / 2 - 1.5); num.rotation.y = Math.PI / 2; g.add(num);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { main, tail, people, doorLocal: new THREE.Vector3(W / 2 - 0.2, 1.55, 0.2), seatLocal: new THREE.Vector3(-0.6, 1.45, -0.6) };
  return g;
}

export class Intro {
  // lz: where it puts down ({x, z}); out: the direction it comes in from
  constructor(game, lz) {
    this.game = game;
    this.t = 0;
    this.lz = new THREE.Vector3(lz.x, 0, lz.z);
    const out = new THREE.Vector3(lz.x, 0, lz.z);
    if (out.lengthSq() < 1) out.set(1, 0, 0.3);
    out.normalize();
    this.out = out;
    this.side = new THREE.Vector3(-out.z, 0, out.x); // its right as it comes in is this way
    this.heli = buildMi8();
    game.scene.add(this.heli);
    // the flight in: a long low approach, over the town's edge, a flare
    this.p0 = this.lz.clone().addScaledVector(out, 900).setY(42);
    this.p1 = this.lz.clone().addScaledVector(out, 160).setY(30);
    this.p2 = this.lz.clone().setY(9);
    this.sound = heliSound();
    this.el = document.createElement('div');
    this.el.id = 'intro';
    this.el.innerHTML = `<div class="bar t"></div><div class="bar b"></div>
      <div class="title"><h1>TARKZOID</h1><p>${game.profile.name.toUpperCase()} · ${(game.profile.professionName || '').toUpperCase()}</p><p>INSERTION · LZ ${Math.round(lz.x)}/${Math.round(lz.z)} · DAY ${game.day}</p>${game.save?.raid?.contract ? `<p>CONTRACT · ${game.save.raid.contract.title.toUpperCase()}</p>` : ''}</div>
      <div class="sub"></div><div class="skip">Space / Esc to skip</div>`;
    this.el.style.display = 'block';
    document.body.appendChild(this.el);
    document.body.classList.add('cinematic');
    this.lines = [
      [0.8, 'Two minutes out. Hold on back there.'],
      [5.6, "That's the town. Nothing moving down there… nothing alive, anyway."],
      [10.8, 'LZ in sight. Going in.'],
      [16.4, 'Wheels down! Go, go, go!'],
      [JUMP + 0.3, "Good luck down there. We're gone."],
    ];
    const p = game.player;
    p.gun.setVisible(false);
    if (p.vm) p.vm.visible = false;
    // (the lights you carry stay off: they'd light the cabin from the camera)
    p.setLight(0);
    this.cam = game.camera;
    this.fov0 = this.cam.fov;
    this.done = false;
  }

  // The helicopter's place and attitude at time t
  pose(t) {
    const h = this.heli;
    let pos, flare = 0;
    if (t < LANDED - 3) {
      const s = 1 - Math.pow(1 - Math.min(1, t / (LANDED - 3)), 1.6);
      const a = this.p0, b = this.p1, c = this.p2;
      pos = a.clone().multiplyScalar((1 - s) * (1 - s)).addScaledVector(b, 2 * s * (1 - s)).addScaledVector(c, s * s);
      flare = ease((t - 9) / 4) * (1 - ease((t - 13.5) / 1.5));
    } else if (t < JUMP + 1.5) {
      // settle onto the ground, hold while you get out
      pos = this.p2.clone().setY(9 - 7.6 * ease((t - (LANDED - 3)) / 3));
    } else {
      // and away: climbing out over the town
      const u = t - (JUMP + 1.5);
      pos = this.p2.clone().setY(1.4 + u * u * 1.6 + u * 2).addScaledVector(this.side, -u * u * 2.2).addScaledVector(this.out, -u * 6);
      flare = -0.15 * ease(u / 2);
    }
    pos.y += this.game.world.groundAt?.(pos.x, pos.z) || 0;
    h.position.copy(pos);
    const yaw = Math.atan2(-this.out.x, -this.out.z); // nose toward the landing zone
    h.rotation.set(0, 0, 0);
    h.rotateY(yaw);
    h.rotateX(-flare * 0.32 + (t < 9 ? 0.06 : 0));
    h.rotateZ(Math.sin(t * 0.6) * 0.03);
    return pos;
  }

  update(dt) {
    const g = this.game, h = this.heli, t = (this.t += dt);
    const pos = this.pose(t);
    h.userData.main.rotation.y += dt * 22;
    h.userData.tail.rotation.x += dt * 70;
    // the camera
    const cam = this.cam, shake = new THREE.Vector3((Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.03, 0);
    const local = (v) => h.localToWorld(v.clone());
    let inside = false;
    cam.fov = 58;
    if (t < 5.2) {
      // chasing it over the fields, slowly swinging round
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(h.quaternion);
      const a = t * 0.18;
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      cam.position.copy(pos).addScaledVector(fwd, -22 + t * 1.5).addScaledVector(right, 13 - t * 1.2).add(new THREE.Vector3(0, 4 + Math.sin(a) * 1.5, 0));
      cam.lookAt(pos.clone().addScaledVector(fwd, 8).add(new THREE.Vector3(0, -3, 0)));
    } else if (t < 10.8) {
      // from a bench, out of the open door at the town going by
      inside = true;
      cam.position.copy(local(h.userData.seatLocal)).add(shake);
      cam.lookAt(local(h.userData.seatLocal.clone().add(new THREE.Vector3(3, -1.1, 0.8))));
    } else if (t < 16.2) {
      // on the ground at the LZ as it comes in
      cam.position.copy(this.lz).addScaledVector(this.side, -22).addScaledVector(this.out, -10).setY((g.world.groundAt?.(this.lz.x, this.lz.z) || 0) + 1.5);
      cam.lookAt(pos.clone().setY(pos.y + 1));
      cam.fov = 50;
    } else if (t < JUMP) {
      // in the door as it touches down
      inside = true;
      cam.position.copy(local(h.userData.doorLocal.clone().add(new THREE.Vector3(-0.6, 0, 0)))).add(shake);
      cam.lookAt(local(h.userData.doorLocal.clone().add(new THREE.Vector3(3, -1.2, 0.6))));
    } else {
      // out of the door and down onto the ground, then you're on your own
      const k = ease((t - JUMP) / (END - JUMP));
      const from = local(h.userData.doorLocal), to = this.exitPoint();
      cam.position.lerpVectors(from, to.clone().setY(to.y + 1.65), k).add(shake.multiplyScalar(1 - k));
      const look = to.clone().addScaledVector(this.side, 6).setY(to.y + 1.4);
      cam.lookAt(look);
    }
    cam.updateProjectionMatrix();
    // rotor wash: dust kicked up under it near the ground
    const alt = pos.y - (g.world.groundAt?.(pos.x, pos.z) || 0);
    if (alt < 14 && Math.random() < 0.8) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
        const at = new THREE.Vector3(pos.x + Math.cos(a) * r, (g.world.groundAt?.(pos.x, pos.z) || 0) + 0.1, pos.z + Math.sin(a) * r);
        g.fx.particle(at, new THREE.Vector3(Math.cos(a) * 7, 0.8 + Math.random() * 1.5, Math.sin(a) * 7), new THREE.Color(0x8a7c60).multiplyScalar(0.8 + Math.random() * 0.3), 0.05 + Math.random() * 0.07, 0.5 + Math.random() * 0.6, { drag: 1.8, grow: 0.12, grav: 1.5 });
      }
    }
    // its sound: loud, muffled from inside, fading as it leaves
    const d = cam.position.distanceTo(pos);
    this.sound.set(inside ? 0.75 : Math.min(0.9, 60 / (d + 20)), inside);
    // titles and radio lines
    this.el.querySelector('.title').style.opacity = t < 4.5 ? 1 : 0;
    const line = [...this.lines].reverse().find(([at]) => t >= at);
    const sub = this.el.querySelector('.sub');
    sub.innerHTML = line && t - line[0] < 4.6 ? `<b>[Pilot]</b> ${line[1]}` : '';
    if (t >= END) this.finish();
    return this.done;
  }

  // Where you land when you jump out: beside the door
  exitPoint() {
    const p = this.lz.clone().addScaledVector(this.side, 3.4);
    p.y = this.game.world.groundAt?.(p.x, p.z) || 0;
    return p;
  }

  // Control to the player (and the helicopter carries on out of sight)
  finish() {
    if (this.done) return;
    this.done = true;
    const g = this.game, p = g.player, at = this.exitPoint();
    p.pos.set(at.x, 0, at.z);
    p.floorY = 0;
    const look = this.side.clone();
    p.yaw = Math.atan2(-look.x, -look.z);
    p.pitch = 0;
    this.cam.fov = this.fov0; this.cam.updateProjectionMatrix();
    this.el.remove();
    document.body.classList.remove('cinematic');
    p.buildViewmodel();
    if (this.t < JUMP) this.t = JUMP + 1.5; // skipped: it's already lifting off
    g.zombies.noise(this.lz.x, this.lz.z, 70, true, 0);
  }

  // After you're out: it climbs away, then it's gone. False when finished.
  depart(dt) {
    this.t += dt;
    const pos = this.pose(this.t);
    this.heli.userData.main.rotation.y += dt * 22;
    this.heli.userData.tail.rotation.x += dt * 70;
    const d = this.game.camera.position.distanceTo(pos);
    const p = this.game.player, right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.sound.set(Math.min(0.9, 60 / (d + 20)), false, pos.clone().sub(this.game.camera.position).setY(0).normalize().dot(right));
    if (this.t > JUMP + 16) { this.dispose(); return false; }
    return true;
  }

  dispose() {
    this.game.scene.remove(this.heli);
    this.sound?.stop(); this.sound = null;
    this.el.remove();
    document.body.classList.remove('cinematic');
  }
}

// A landing zone: open ground on the edge of town, clear of buildings and
// cars (and the zombies a saved world already has there)
export function findLZ(world, zombies = []) {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = 55 + Math.random() * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (world.buildingAt(x, z)) continue;
    const boxes = world.hash.query(x - 8, z - 8, x + 8, z + 8, []).filter((b) => !b.noCollide && b.maxX > x - 8 && b.minX < x + 8 && b.maxZ > z - 8 && b.minZ < z + 8);
    if (boxes.length) continue;
    const near = zombies.filter((zz) => Math.hypot(zz.x - x, zz.z - z) < 25).length;
    const score = -near * 5 - Math.abs(r - 90) * 0.05 + Math.random();
    if (score > bestScore) { bestScore = score; best = { x, z }; }
  }
  return best || { x: 0, z: 100 };
}
