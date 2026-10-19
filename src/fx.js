// Short-lived particle effects: blood puffs and bullet impacts.
import * as THREE from 'three';
import { sfx } from './audio.js';

const particleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x6a0a0a });
const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a9080 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
const holeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
const casingGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6).rotateX(Math.PI / 2);
const shellGeo = new THREE.CylinderGeometry(0.0095, 0.0095, 0.065, 8).rotateX(Math.PI / 2);
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 0.8, roughness: 0.3 });
const shellMat = new THREE.MeshStandardMaterial({ color: 0xaa2a2a, roughness: 0.6 });

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.holes = [];
    this.casings = [];
  }

  // Ejected brass / shotgun shells that tumble and bounce on the ground.
  casing(pos, vel, shell) {
    const m = new THREE.Mesh(shell ? shellGeo : casingGeo, shell ? shellMat : brassMat);
    m.position.copy(pos);
    m.castShadow = true;
    this.scene.add(m);
    this.casings.push({ m, v: vel, spin: new THREE.Vector3(Math.random() * 30, Math.random() * 30, Math.random() * 30), life: 5, bounced: false });
    if (this.casings.length > 60) this.scene.remove(this.casings.shift().m);
  }

  burst(point, mat, n, speed, life) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(particleGeo, mat);
      m.position.copy(point);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(speed);
      this.scene.add(m);
      this.parts.push({ m, v, life: life * (0.6 + Math.random() * 0.6) });
    }
  }

  blood(p) { this.burst(p, bloodMat, 10, 3, 0.5); }

  impact(p) {
    this.burst(p, dustMat, 6, 2, 0.4);
    this.burst(p, sparkMat, 2, 4, 0.15);
    const h = new THREE.Mesh(holeGeo, holeMat);
    h.position.copy(p);
    this.scene.add(h);
    this.holes.push(h);
    if (this.holes.length > 120) this.scene.remove(this.holes.shift());
  }

  update(dt) {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) { this.scene.remove(c.m); this.casings.splice(i, 1); continue; }
      if (c.rest) continue;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      if (c.m.position.y < 0.01) {
        c.m.position.y = 0.01;
        if (!c.bounced) { sfx.casing(); c.bounced = true; }
        c.v.y = -c.v.y * 0.35; c.v.x *= 0.5; c.v.z *= 0.5; c.spin.multiplyScalar(0.5);
        if (Math.abs(c.v.y) < 0.3) { c.rest = true; c.m.rotation.set(0, c.m.rotation.y, 0); }
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.v.y -= 9 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.life <= 0 || p.m.position.y < 0) { this.scene.remove(p.m); this.parts.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.parts) this.scene.remove(p.m);
    for (const h of this.holes) this.scene.remove(h);
    for (const c of this.casings) this.scene.remove(c.m);
    this.parts = []; this.holes = []; this.casings = [];
  }
}
