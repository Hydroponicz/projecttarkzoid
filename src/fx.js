// Short-lived particle effects: blood puffs and bullet impacts.
import * as THREE from 'three';

const particleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0x6a0a0a });
const dustMat = new THREE.MeshBasicMaterial({ color: 0x9a9080 });
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
const holeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.holes = [];
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
    this.parts = []; this.holes = [];
  }
}
