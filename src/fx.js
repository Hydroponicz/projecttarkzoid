// Particle and decal effects: blood sprays and mist, dust and sparks from
// bullet impacts, ejected brass, and persistent decals (bullet holes, blood
// splatter on walls and floors, pools spreading under bodies). Particles and
// decals are instanced so a firefight costs a handful of draw calls.
import * as THREE from 'three';
import { sfx } from './audio.js';

const casingGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6).rotateX(Math.PI / 2);
const shellGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.065, 8).rotateX(Math.PI / 2);
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 });
const shellMat = new THREE.MeshStandardMaterial({ color: 0xaa2a2a, roughness: 0.6 });

const MAX_PARTS = 900;
const GROUND_Y = 0.07; // just above building floors
const BLOOD = new THREE.Color(0x5a0606), BLOOD_DARK = new THREE.Color(0x3a0303), MIST = new THREE.Color(0x7a1010);
const DUST = new THREE.Color(0x9a9080), SPARK = new THREE.Color(0xffcc66), BONE = new THREE.Color(0xd8ccb0);

// Procedural decal textures (no image assets).
function canvasTex(draw, size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const splatTex = canvasTex((g, S) => {
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(110,8,8,${a})`); gr.addColorStop(0.7, `rgba(80,4,4,${a * 0.9})`); gr.addColorStop(1, 'rgba(60,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  blob(S / 2, S / 2, S * 0.24, 0.95);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, d = S * (0.1 + Math.random() * 0.36);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.015 + Math.random() * 0.05), 0.9);
  }
  // streaks
  g.strokeStyle = 'rgba(90,5,5,0.85)'; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, d = S * (0.2 + Math.random() * 0.25);
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.12, S / 2 + Math.sin(a) * S * 0.12); g.lineTo(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d); g.stroke();
  }
});
const poolTex = canvasTex((g, S) => {
  for (let i = 0; i < 9; i++) {
    const x = S / 2 + (Math.random() - 0.5) * S * 0.3, y = S / 2 + (Math.random() - 0.5) * S * 0.3, r = S * (0.18 + Math.random() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(70,2,2,0.95)'); gr.addColorStop(0.85, 'rgba(55,0,0,0.9)'); gr.addColorStop(1, 'rgba(40,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
const holeTex = canvasTex((g, S) => {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.18, 'rgba(10,10,10,1)'); gr.addColorStop(0.3, 'rgba(40,36,30,0.8)'); gr.addColorStop(1, 'rgba(60,55,45,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}, 64);

// A ring buffer of flat quads in one InstancedMesh.
class DecalLayer {
  constructor(scene, tex, max, opacity = 1) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.max = max;
    this.next = 0;
    this.items = []; // per-slot { pos, quat, size, grow, target }
    scene.add(this.mesh);
  }
  add(pos, normal, size, grow = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2));
    const it = { pos: pos.clone().addScaledVector(normal, 0.004 + i * 0.000004), quat, size: grow ? size * 0.15 : size, target: size, grow };
    this.items[i] = it;
    this.write(i);
    return it;
  }
  write(i) {
    const it = this.items[i];
    _m4.compose(it.pos, it.quat, _s.set(it.size, it.size, 1));
    this.mesh.setMatrixAt(i, _m4);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.mesh.count; i++) {
      const it = this.items[i];
      if (!it?.grow || it.size >= it.target) continue;
      it.size = Math.min(it.target, it.size + it.grow * dt * (1.2 - it.size / it.target));
      this.write(i);
    }
  }
  clear() { this.mesh.count = 0; this.next = 0; this.items = []; }
  dispose(scene) { scene.remove(this.mesh); this.mesh.dispose(); }
}
const _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();
const quadGeo = new THREE.PlaneGeometry(1, 1);
const traceDotGeo = new THREE.SphereGeometry(0.05, 10, 8);
const decalMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const UP = new THREE.Vector3(0, 1, 0);

export class FX {
  // Height of the floor under a point (the game points this at the world's
  // storeys; until then everything lands on the ground)
  floorUnder() { return 0; }

  constructor(scene) {
    this.scene = scene;
    this.casings = [];
    // Particles: one instanced mesh, per-instance color.
    this.pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX_PARTS);
    this.pmesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3), 3);
    this.pmesh.frustumCulled = false;
    this.pmesh.count = 0;
    scene.add(this.pmesh);
    this.parts = [];
    this.splats = new DecalLayer(scene, splatTex, 260);
    this.pools = new DecalLayer(scene, poolTex, 60, 0.92);
    this.holes = new DecalLayer(scene, holeTex, 200);
    // Decals on things that move (doors swing, built walls get torn down)
    // are child meshes of that object instead of instances.
    this.attached = [];
    this.attachMats = { hole: decalMat(holeTex), splat: decalMat(splatTex) };
  }

  attach(parent, kind, pos, normal, size, inset = 0) {
    const m = new THREE.Mesh(quadGeo, this.attachMats[kind]);
    parent.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * 6.28));
    const pq = new THREE.Quaternion(); parent.getWorldQuaternion(pq);
    m.quaternion.copy(pq.invert().multiply(wq));
    m.position.copy(pos).addScaledVector(normal, 0.014 - inset).applyMatrix4(inv);
    m.scale.set(size, size, 1);
    m.renderOrder = 1;
    parent.add(m);
    this.attached.push(m);
    if (this.attached.length > 120) { const o = this.attached.shift(); o.parent?.remove(o); }
  }

  // Debug: a bullet's path and where it stopped, bright purple, for 7 s.
  debugTrace(from, to, hit) {
    this.traces = this.traces || [];
    const mat = new THREE.LineBasicMaterial({ color: 0xff30ff, transparent: true, opacity: 0.9, depthTest: false });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), mat);
    line.renderOrder = 10;
    const dot = new THREE.Mesh(traceDotGeo, new THREE.MeshBasicMaterial({ color: hit === 'flesh' ? 0xff60ff : 0xc000ff, transparent: true, depthTest: false }));
    dot.position.copy(to);
    dot.renderOrder = 10;
    this.scene.add(line, dot);
    this.traces.push({ line, dot, t: 7 });
    if (this.traces.length > 200) this.dropTrace(this.traces.shift());
  }

  dropTrace(tr) { this.scene.remove(tr.line, tr.dot); tr.line.geometry.dispose(); tr.line.material.dispose(); tr.dot.material.dispose(); }

  // Ejected brass / shotgun shells that tumble and bounce on the ground.
  casing(pos, vel, shell) {
    const m = new THREE.Mesh(shell ? shellGeo : casingGeo, shell ? shellMat : brassMat);
    m.position.copy(pos);
    m.castShadow = true;
    this.scene.add(m);
    this.casings.push({ m, v: vel, spin: new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30), life: 5, bounced: false, shell: !!shell, floor: this.floorUnder(pos.x, pos.z, pos.y) });
    if (this.casings.length > 60) this.scene.remove(this.casings.shift().m);
  }

  particle(pos, vel, color, size, life, opts = {}) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    this.parts.push({ p: pos.clone(), v: vel, color, size, life, max: life, drag: opts.drag ?? 0.2, grav: opts.grav ?? 9, splat: opts.splat || 0, grow: opts.grow || 0, floor: opts.splat ? this.floorUnder(pos.x, pos.z, pos.y) : 0 });
  }

  // Generic burst (kept for other callers).
  burst(point, color, n, speed, life, size = 0.05) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(speed);
      this.particle(point, v, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6));
    }
  }

  // A bullet or blade wound. dir is the direction of the blow; exit sprays
  // continue through the body, a finer mist puffs back toward the shooter.
  // opts: { head, power (0..2), exit (bool), wall: {point, normal} for splatter }
  blood(p, dir, opts = {}) {
    const power = opts.power ?? 1;
    const d = dir ? dir.clone().normalize() : new THREE.Vector3(0, 0, 0);
    const n = Math.round((opts.head ? 22 : 14) * Math.min(2, 0.6 + power * 0.6));
    const jitter = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5);
    // Back-spatter mist toward the shooter
    for (let i = 0; i < n * 0.6; i++) {
      const v = d.clone().multiplyScalar(-(0.6 + Math.random() * 1.4)).add(jitter().multiplyScalar(1.6));
      this.particle(p, v, MIST, 0.02 + Math.random() * 0.03, 0.2 + Math.random() * 0.25, { drag: 3, grav: 2, grow: 0.08 });
    }
    // Exit spray: heavy droplets thrown along the bullet's path
    if (opts.exit !== false && dir) {
      for (let i = 0; i < n; i++) {
        const v = d.clone().multiplyScalar(2 + Math.random() * 4 * power).add(jitter().multiplyScalar(1.4));
        this.particle(p, v, Math.random() < 0.5 ? BLOOD : BLOOD_DARK, 0.025 + Math.random() * 0.04, 0.7 + Math.random() * 0.5, { splat: Math.random() < 0.35 ? 0.12 + Math.random() * 0.18 : 0 });
      }
      if (opts.head && power > 0.8) for (let i = 0; i < 5; i++) this.particle(p, d.clone().multiplyScalar(3 + Math.random() * 3).add(jitter()), BONE, 0.02 + Math.random() * 0.02, 0.8);
    } else {
      for (let i = 0; i < n * 0.7; i++) this.particle(p, jitter().multiplyScalar(2.6), BLOOD, 0.03 + Math.random() * 0.03, 0.6, { splat: Math.random() < 0.25 ? 0.15 : 0 });
    }
    // Splatter on the wall behind the target
    if (opts.wall) {
      const size = 0.5 + Math.random() * 0.5 * power + (opts.head ? 0.35 : 0);
      if (opts.wall.parent) this.attach(opts.wall.parent, 'splat', opts.wall.point, opts.wall.normal, size, opts.wall.inset);
      else this.splats.add(opts.wall.point, opts.wall.normal, size);
    }
    // Drips under the wound
    if (Math.random() < 0.7) this.splats.add(_p.set(p.x + d.x * 0.4 + (Math.random() - 0.5) * 0.3, this.floorUnder(p.x, p.z, p.y) + GROUND_Y, p.z + d.z * 0.4 + (Math.random() - 0.5) * 0.3), UP, 0.25 + Math.random() * 0.35);
  }

  // A pool of blood slowly spreading under a body.
  pool(x, z, size = 1.2, floor = 0) {
    this.pools.add(new THREE.Vector3(x, floor + GROUND_Y - 0.003, z), UP, size, 0.12);
  }

  impact(p, normal, parent, inset) {
    const n = normal || UP;
    for (let i = 0; i < 7; i++) this.particle(p, n.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(1.6)), DUST, 0.03 + Math.random() * 0.04, 0.35 + Math.random() * 0.3, { drag: 2, grow: 0.15 });
    for (let i = 0; i < 3; i++) this.particle(p, n.clone().multiplyScalar(2).add(new THREE.Vector3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).multiplyScalar(4)), SPARK, 0.015, 0.12);
    if (parent) this.attach(parent, 'hole', p, n, 0.07 + Math.random() * 0.03, inset);
    else this.holes.add(p, n, 0.07 + Math.random() * 0.03);
  }

  update(dt) {
    if (this.traces) {
      for (let i = this.traces.length - 1; i >= 0; i--) {
        const tr = this.traces[i];
        tr.t -= dt;
        const o = Math.min(1, tr.t); // fade over the last second
        tr.line.material.opacity = 0.9 * o; tr.dot.material.opacity = o;
        if (tr.t <= 0) { this.dropTrace(tr); this.traces.splice(i, 1); }
      }
    }
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) { this.scene.remove(c.m); this.casings.splice(i, 1); continue; }
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      if (c.m.position.y < c.floor + 0.01) {
        c.m.position.y = c.floor + 0.01;
        if (!c.bounced) { sfx.casing(c.shell); c.bounced = true; }
        c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5);
        if (Math.abs(c.v.y) < 0.3) { c.rest = true; c.m.rotation.set(0, c.m.rotation.y, 0); }
      }
    }
    let n = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.life -= dt;
      p.v.y -= p.grav * dt;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < p.floor + GROUND_Y && p.splat) { this.splats.add(_p.set(p.p.x, p.floor + GROUND_Y, p.p.z), UP, p.splat); p.life = 0; }
      if (p.life <= 0 || p.p.y < 0) continue;
      this.parts[n++] = p;
      const s = p.size * (1 + p.grow * (1 - p.life / p.max) * 10);
      _q.set(0, 0, 0, 1);
      _m4.compose(p.p, _q, _s.set(s, s, s));
      this.pmesh.setMatrixAt(n - 1, _m4);
      this.pmesh.setColorAt(n - 1, p.color);
    }
    this.parts.length = n;
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    if (this.pmesh.instanceColor) this.pmesh.instanceColor.needsUpdate = true;
    this.pools.update(dt);
  }

  clear() {
    for (const c of this.casings) this.scene.remove(c.m);
    for (const m of this.attached) m.parent?.remove(m);
    for (const tr of this.traces || []) this.dropTrace(tr);
    this.traces = [];
    this.attached = [];
    this.casings = []; this.parts = []; this.pmesh.count = 0;
    this.splats.clear(); this.pools.clear(); this.holes.clear();
  }
}
