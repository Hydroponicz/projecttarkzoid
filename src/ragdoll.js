// Verlet-integrated ragdolls for zombies and survivors: 15-joint skeletons
// with bone constraints, torso struts and joint limits, colliding with the
// ground and the world's boxes. Bodies take impulses from the bullet or
// blow that hit them (where it hit), can be knocked down while alive and
// get back up, and settle into merged static corpses.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from './audio.js';

// Joint indices
const PEL = 0, CHE = 1, HEAD = 2, SHL = 3, ELL = 4, HAL = 5, SHR = 6, ELR = 7, HAR = 8,
  HIL = 9, KNL = 10, FTL = 11, HIR = 12, KNR = 13, FTR = 14;
const N = 15;
const RADII = [0.15, 0.16, 0.13, 0.08, 0.065, 0.06, 0.08, 0.065, 0.06, 0.09, 0.075, 0.07, 0.09, 0.075, 0.07];
// Inverse masses: the trunk is heavy, hands and feet are light.
const INV_MASS = [0.45, 0.5, 1.1, 0.9, 1.4, 2.0, 0.9, 1.4, 2.0, 0.8, 1.1, 1.5, 0.8, 1.1, 1.5];
const BONES = [[PEL, CHE], [CHE, HEAD], [CHE, SHL], [CHE, SHR], [SHL, SHR], [SHL, ELL], [ELL, HAL], [SHR, ELR], [ELR, HAR],
  [PEL, HIL], [PEL, HIR], [HIL, HIR], [HIL, KNL], [KNL, FTL], [HIR, KNR], [KNR, FTR]];
// Struts keep the torso box-shaped and the neck from folding.
const STRUTS = [[SHL, PEL], [SHR, PEL], [HIL, CHE], [HIR, CHE], [SHL, HIL], [SHR, HIR], [HEAD, SHL], [HEAD, SHR], [HEAD, PEL]];
// Joint limits as minimum distances, as a fraction of the fully extended
// length through the middle joint (no knees/elbows folding flat, no hands
// inside the chest, no feet through the hips).
const LIMITS = [[SHL, ELL, HAL, 0.5], [SHR, ELR, HAR, 0.5], [HIL, KNL, FTL, 0.66], [HIR, KNR, FTR, 0.66], [CHE, SHL, HAL, 0.4], [CHE, SHR, HAR, 0.4]];
// Knees are hinges: they only bend forward (hip, knee, foot).
const KNEES = [[HIL, KNL, FTL], [HIR, KNR, FTR]];
// Hips: knees can't come up through the chest or cross far under the
// other leg; [a, b, fraction of the standing distance]
const MINS = [[KNL, CHE, 0.78], [KNR, CHE, 0.78], [FTL, CHE, 0.72], [FTR, CHE, 0.72], [KNL, HIR, 0.8], [KNR, HIL, 0.8], [KNL, HEAD, 0.75], [KNR, HEAD, 0.75]];
// Points along limbs that collide with the trunk (as a box): joints, and bone
// midpoints given as [a, b].
const ALL_PTS = [PEL, CHE, HEAD, SHL, SHR, ELL, HAL, ELR, HAR, HIL, HIR, KNL, FTL, KNR, FTR];
const LIMB_PTS = [ELL, HAL, ELR, HAR, KNL, FTL, KNR, FTR, HEAD, [HIL, KNL], [HIR, KNR], [KNL, FTL], [KNR, FTR], [SHL, ELL], [SHR, ELR]];
// Limbs can't pass through the trunk or each other.
const SELF = [[KNL, KNR], [FTL, FTR], [KNL, CHE], [KNR, CHE], [FTL, CHE], [FTR, CHE], [FTL, HEAD], [FTR, HEAD], [KNL, HEAD], [KNR, HEAD], [FTL, PEL], [FTR, PEL], [FTL, KNR], [FTR, KNL]];
// Legs are capsules too: a thigh or shin can't pass through the other leg's
// (one comes to rest on top of the other).
const LEG_PAIRS = [[HIL, KNL, HIR, KNR], [HIL, KNL, KNR, FTR], [KNL, FTL, HIR, KNR], [KNL, FTL, KNR, FTR]];
// Spans the muscles hold while the body still has tone (dying, stumbling):
// shrinking the leg spans buckles the knees so the body crumples.
const TONE = [[HIL, FTL, 1], [HIR, FTR, 1], [PEL, HEAD, 0], [SHL, HAL, 0], [SHR, HAR, 0], [PEL, KNL, 0], [PEL, KNR, 0]];

// Rest pose in model space (y up, +z forward). Zombies reach forward,
// survivors hold a weapon.
function restPose(kind) {
  const p = [];
  p[PEL] = [0, 0.88, 0]; p[CHE] = [0, 1.44, 0]; p[HEAD] = [0, 1.66, 0.02];
  p[SHL] = [-0.27, 1.4, 0]; p[SHR] = [0.27, 1.4, 0];
  if (kind === 'zombie') { p[ELL] = [-0.3, 1.38, 0.28]; p[HAL] = [-0.3, 1.36, 0.55]; p[ELR] = [0.3, 1.38, 0.28]; p[HAR] = [0.3, 1.36, 0.55]; }
  else { p[ELL] = [-0.24, 1.17, 0.18]; p[HAL] = [-0.05, 1.22, 0.42]; p[ELR] = [0.27, 1.12, 0.12]; p[HAR] = [0.1, 1.2, 0.36]; }
  p[HIL] = [-0.12, 0.84, 0]; p[KNL] = [-0.13, 0.45, 0.02]; p[FTL] = [-0.13, 0.06, 0];
  p[HIR] = [0.12, 0.84, 0]; p[KNR] = [0.13, 0.45, 0.02]; p[FTR] = [0.13, 0.06, 0];
  return p;
}

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _f = new THREE.Vector3(), _d = new THREE.Vector3(), _m2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

// Closest points of segments p1-q1 and p2-q2, as fractions [s, t] along each.
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
function closestOnSegments(p1, q1, p2, q2) {
  _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  if (a < 1e-9 || e < 1e-9) return [0, 0];
  const c = _d1.dot(_r), b = _d1.dot(_d2), den = a * e - b * b;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
  return [s, t];
}
const _m = new THREE.Matrix4();

// Materials for bodies rebuilt from saved colors, shared so that settled
// corpses merge into few draw calls.
const matCache = new Map();
export function bodyMat(hex) {
  if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 }));
  return matCache.get(hex);
}

// Body materials and gear from a look: { skin, top, bottom, pack?, hair?, hat?, helmet?, vest? }
export function lookMats(look) {
  const extra = [];
  if (look.pack != null) extra.push({ size: [0.36, 0.42, 0.16], off: [0, 0.03, -0.2], on: 'torso', mat: bodyMat(look.pack) });
  if (look.vest != null) extra.push({ size: [0.52, 0.42, 0.32], off: [0, 0.04, 0], on: 'torso', mat: bodyMat(look.vest) });
  if (look.helmet != null) extra.push({ size: [0.31, 0.12, 0.31], off: [0, 0.15, 0], on: 'head', mat: bodyMat(look.helmet) });
  else if (look.hat != null) extra.push({ size: [0.28, 0.08, 0.3], off: [0, 0.15, 0.02], on: 'head', mat: bodyMat(look.hat) });
  else if (look.hair != null) extra.push({ size: [0.25, 0.06, 0.25], off: [0, 0.14, -0.01], on: 'head', mat: bodyMat(look.hair) });
  return { skin: bodyMat(look.skin), top: bodyMat(look.top), bottom: bodyMat(look.bottom), extra };
}

class Ragdoll {
  // spec: { matrix (model world matrix, including its scale), kind, scale,
  //         mats: {skin, top, bottom, extra[]}, look (saved colors), vel (initial
  //         velocity), tone (0..1 muscle tone left), alive, owner, onSettle(ragdoll),
  //         pose (saved joint positions: settles instantly) }
  constructor(sys, spec) {
    this.sys = sys;
    this.owner = spec.owner;
    this.onSettle = spec.onSettle;
    this.look = spec.look;
    this.alive = !!spec.alive;
    this.floor = spec.floor || 0; // height of the floor it lies on (upper storeys)
    this.sleeping = false;
    this.still = 0;
    this.age = 0;
    this.landed = false;
    this.tone = spec.tone ?? 0;
    this.toneDecay = spec.toneDecay ?? 1.6;
    this.spasms = spec.spasms ?? 0;
    this.spasmT = 0.25 + Math.random() * 0.3;
    const s = spec.scale || 1;
    const rest = restPose(spec.kind);
    const mtx = spec.matrix || new THREE.Matrix4();
    this.p = []; this.q = []; // current and previous positions
    const h = sys.h;
    for (let i = 0; i < N; i++) {
      // Rest lengths come from the standing pose even when restoring a saved one.
      this.p.push(new THREE.Vector3(...rest[i]).applyMatrix4(mtx));
    }
    this.r = RADII.map((r) => r * s);
    const len = (a, b) => this.p[a].distanceTo(this.p[b]);
    this.cons = [
      ...BONES.map(([a, b]) => [a, b, len(a, b), 1]),
      ...STRUTS.map(([a, b]) => [a, b, len(a, b), 0.6]),
    ];
    this.limits = LIMITS.map(([a, m, b, f]) => [a, b, (len(a, m) + len(m, b)) * f]);
    this.toneCons = TONE.map(([a, b, buckle]) => [a, b, len(a, b), buckle]);
    this.mins = MINS.map(([a, b, f]) => [a, b, len(a, b) * f]);
    this.box = [0.25 * s, 0.31 * s, 0.14 * s]; // torso half extents
    this.neighbors = [];
    if (spec.pose) for (let i = 0; i < N; i++) this.p[i].fromArray(spec.pose, i * 3);
    for (let i = 0; i < N; i++) {
      const prev = this.p[i].clone();
      if (spec.vel) prev.addScaledVector(spec.vel, -h);
      this.q.push(prev);
    }
    this.buildMeshes(spec, s);
    this.updateMeshes();
    if (spec.pose) { this.sleeping = true; this.landed = true; this.freeze(); }
  }

  // Joint positions for saving a settled body.
  pose() { const a = []; for (const v of this.p) a.push(+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)); return a; }

  // Run the simulation forward until the body comes to rest (for bodies that
  // appear already dead, e.g. from old saves).
  settleNow() {
    this.landed = true;
    for (let i = 0; i < 400; i++) {
      this.step(this.sys.h);
      let maxV = 0;
      for (let j = 0; j < N; j++) maxV = Math.max(maxV, this.p[j].distanceToSquared(this.q[j]));
      this.slow = i > 90 && maxV < 2e-5;
      if (i > 60 && maxV < 4e-7) break;
    }
    this.updateMeshes();
    this.sleeping = true;
    this.onSettle?.(this);
    this.freeze();
  }

  buildMeshes(spec, s) {
    const g = new THREE.Group();
    const { skin, top, bottom } = spec.mats;
    const seg = (w, d, a, b, mat) => {
      const L = this.p[a].distanceTo(this.p[b]);
      const geo = new THREE.BoxGeometry(w * s, L + (w * s) * 0.4, d * s);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      g.add(m);
      return { m, a, b };
    };
    this.segs = [
      seg(0.13, 0.13, SHL, ELL, top), seg(0.11, 0.11, ELL, HAL, skin),
      seg(0.13, 0.13, SHR, ELR, top), seg(0.11, 0.11, ELR, HAR, skin),
      seg(0.17, 0.17, HIL, KNL, bottom), seg(0.15, 0.15, KNL, FTL, bottom),
      seg(0.17, 0.17, HIR, KNR, bottom), seg(0.15, 0.15, KNR, FTR, bottom),
    ];
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.66 * s, 0.27 * s), top);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.25 * s, 0.28 * s, 0.25 * s), skin);
    this.torso.castShadow = this.head.castShadow = true;
    g.add(this.torso, this.head);
    // Extras ride on the torso or head (backpack, vest, helmet, hair, eyes)
    this.extras = [];
    for (const e of spec.mats.extra || []) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(e.size[0] * s, e.size[1] * s, e.size[2] * s), e.mat);
      m.castShadow = true;
      g.add(m);
      this.extras.push({ m, on: e.on, off: new THREE.Vector3(e.off[0] * s, e.off[1] * s, e.off[2] * s) });
    }
    this.group = g;
    this.sys.scene.add(g);
  }

  // Orientation basis for the torso: up along the spine, right along the shoulders.
  basis(up, right) {
    up.normalize();
    right.addScaledVector(up, -right.dot(up)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, up);
    return _m.makeBasis(right, up, fwd);
  }

  updateMeshes() {
    const p = this.p;
    for (const s of this.segs) {
      const a = p[s.a], b = p[s.b];
      s.m.position.addVectors(a, b).multiplyScalar(0.5);
      _v.subVectors(b, a).normalize();
      s.m.quaternion.setFromUnitVectors(Y, _v);
    }
    _a.subVectors(p[CHE], p[PEL]); _b.subVectors(p[SHR], p[SHL]);
    this.torso.quaternion.setFromRotationMatrix(this.basis(_a, _b));
    this.torso.position.addVectors(p[PEL], p[CHE]).multiplyScalar(0.5);
    _a.subVectors(p[HEAD], p[CHE]); _b.subVectors(p[SHR], p[SHL]);
    this.head.quaternion.setFromRotationMatrix(this.basis(_a, _b));
    this.head.position.copy(p[HEAD]);
    for (const e of this.extras) {
      const ref = e.on === 'head' ? this.head : this.torso;
      e.m.quaternion.copy(ref.quaternion);
      e.m.position.copy(e.off).applyQuaternion(ref.quaternion).add(ref.position);
    }
  }

  // Push the body: a velocity change applied at the joint nearest the point,
  // spreading some of it to the rest of the body.
  impulse(point, dir, speed) {
    this.wake();
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = this.p[i].distanceToSquared(point); if (d < bd) { bd = d; best = i; } }
    const h = this.sys.h;
    for (let i = 0; i < N; i++) {
      const k = i === best ? 1 : Math.max(0, 0.35 - this.p[i].distanceTo(this.p[best]) * 0.25);
      if (k <= 0) continue;
      this.q[i].addScaledVector(dir, -speed * k * h * INV_MASS[i]);
    }
    return best;
  }

  wake() { if (this.sleeping) { this.sleeping = false; this.still = 0; if (this.frozen) this.unfreeze(); } }

  step(h) {
    const p = this.p, q = this.q, g = 9.8 * h * h;
    if (this.tone > 0) this.tone = Math.max(0, this.tone - this.toneDecay * h);
    // Death spasms: small random kicks in the limbs right after death.
    if (this.spasms > 0 && (this.spasmT -= h) <= 0) {
      this.spasms--; this.spasmT = 0.2 + Math.random() * 0.45;
      const j = [HAL, HAR, FTL, FTR, KNL, KNR, HEAD][Math.floor(Math.random() * 7)];
      q[j].x -= (Math.random() - 0.5) * 0.02; q[j].y -= Math.random() * 0.012; q[j].z -= (Math.random() - 0.5) * 0.02;
    }
    // A body that has nearly stopped loses energy fast (stops it rocking
    // on its back forever).
    const damp = this.slow ? 0.93 : 0.995;
    for (let i = 0; i < N; i++) {
      const vx = (p[i].x - q[i].x) * damp, vy = (p[i].y - q[i].y) * damp, vz = (p[i].z - q[i].z) * damp;
      q[i].copy(p[i]);
      p[i].x += vx; p[i].y += vy - g; p[i].z += vz;
    }
    for (let it = 0; it < 6; it++) {
      for (const [a, b, rest, k] of this.cons) {
        _v.subVectors(p[b], p[a]);
        const d = _v.length() || 1e-6;
        const wa = INV_MASS[a], wb = INV_MASS[b];
        const diff = ((d - rest) / (d * (wa + wb))) * k;
        p[a].addScaledVector(_v, diff * wa);
        p[b].addScaledVector(_v, -diff * wb);
      }
      // Muscle tone: hold the pose while it lasts, legs buckling as it fades.
      if (this.tone > 0) {
        const t = this.tone;
        for (const [a, b, rest, buckle] of this.toneCons) {
          const target = buckle ? rest * (0.72 + 0.28 * t) : rest;
          _v.subVectors(p[b], p[a]);
          const d = _v.length() || 1e-6;
          const wa = INV_MASS[a], wb = INV_MASS[b];
          const diff = ((d - target) / (d * (wa + wb))) * 0.35 * t;
          p[a].addScaledVector(_v, diff * wa);
          p[b].addScaledVector(_v, -diff * wb);
        }
      }
      for (const [a, b, min] of this.limits) {
        _v.subVectors(p[b], p[a]);
        const d = _v.length() || 1e-6;
        if (d >= min) continue;
        const wa = INV_MASS[a], wb = INV_MASS[b];
        const diff = (d - min) / (d * (wa + wb));
        p[a].addScaledVector(_v, diff * wa);
        p[b].addScaledVector(_v, -diff * wb);
      }
      for (const [a, b, min] of this.mins) {
        _v.subVectors(p[b], p[a]);
        const d = _v.length() || 1e-6;
        if (d >= min) continue;
        const wa = INV_MASS[a], wb = INV_MASS[b];
        const diff = (d - min) / (d * (wa + wb));
        p[a].addScaledVector(_v, diff * wa);
        p[b].addScaledVector(_v, -diff * wb);
      }
      this.hinges();
      this.selfCollide();
      this.torsoCollide(this);
      for (const o of this.neighbors) { this.torsoCollide(o); o.torsoCollide(this); this.jointCollide(o); }
      this.collide(it === 5);
    }
  }

  // Keep each knee in front of the line from hip to foot, so legs fold the
  // way legs fold instead of bending backwards and bunching up.
  hinges() {
    const p = this.p;
    _a.subVectors(p[HIR], p[HIL]);
    _b.subVectors(p[CHE], p[PEL]);
    const f = _f.crossVectors(_a, _b);
    const fl = f.length();
    if (fl < 1e-6) return;
    f.multiplyScalar(1 / fl);
    for (const [hp, kn, ft] of KNEES) {
      _v.addVectors(p[hp], p[ft]).multiplyScalar(0.5);
      const off = _v.subVectors(p[kn], _v).dot(f);
      if (off >= 0.01) continue;
      const fix = 0.01 - off;
      p[kn].addScaledVector(f, fix * 0.7);
      p[hp].addScaledVector(f, -fix * 0.15);
      p[ft].addScaledVector(f, -fix * 0.15);
    }
  }

  selfCollide() {
    const p = this.p, r = this.r;
    for (const [a, b] of SELF) {
      _v.subVectors(p[b], p[a]);
      const d = _v.length(), min = r[a] + r[b];
      if (d >= min || d < 1e-6) continue;
      const wa = INV_MASS[a], wb = INV_MASS[b];
      const diff = (d - min) / (d * (wa + wb));
      p[a].addScaledVector(_v, diff * wa);
      p[b].addScaledVector(_v, -diff * wb);
    }
    // Leg bone against leg bone: closest points of the two segments, pushed
    // apart, the correction shared between the four joints by where the
    // contact is along each bone (and how heavy they are).
    const min = (r[KNL] + r[KNR]) * 0.95;
    for (const [a0, a1, b0, b1] of LEG_PAIRS) {
      const [s, t] = closestOnSegments(p[a0], p[a1], p[b0], p[b1]);
      _a.lerpVectors(p[a0], p[a1], s); _b.lerpVectors(p[b0], p[b1], t);
      _v.subVectors(_a, _b);
      let d = _v.length();
      if (d >= min) continue;
      // crossing dead centre: the higher leg goes on top
      if (d < 1e-5) { _v.set(0, _a.y >= _b.y ? 1 : -1, 0); d = 0; } else _v.multiplyScalar(1 / d);
      const w = [INV_MASS[a0] * (1 - s), INV_MASS[a1] * s, INV_MASS[b0] * (1 - t), INV_MASS[b1] * t];
      const den = w[0] * (1 - s) + w[1] * s + w[2] * (1 - t) + w[3] * t;
      if (den < 1e-6) continue;
      const lam = (min - d) / den;
      p[a0].addScaledVector(_v, lam * w[0]); p[a1].addScaledVector(_v, lam * w[1]);
      p[b0].addScaledVector(_v, -lam * w[2]); p[b1].addScaledVector(_v, -lam * w[3]);
    }
  }

  // Frame of the trunk: centre, axes (right, up, forward) and half extents.
  torsoFrame() {
    const p = this.p, f = this._tf || (this._tf = { c: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3() });
    f.c.addVectors(p[PEL], p[CHE]).multiplyScalar(0.5);
    f.u.subVectors(p[CHE], p[PEL]).normalize();
    f.r.subVectors(p[SHR], p[SHL]).add(_a.subVectors(p[HIR], p[HIL])).addScaledVector(f.u, 0);
    f.r.addScaledVector(f.u, -f.r.dot(f.u)).normalize();
    f.f.crossVectors(f.r, f.u);
    return f;
  }

  // Keep `body`'s limbs out of this ragdoll's trunk (a box). For our own
  // body only the limbs count; for another body, every joint does.
  torsoCollide(body) {
    const own = body === this;
    const F = this.torsoFrame(), [hx, hy, hz] = this.box;
    const bp = body.p, br = body.r;
    const pts = own ? LIMB_PTS : ALL_PTS;
    for (const pt of pts) {
      let P, rad, a = -1, b = -1;
      if (Array.isArray(pt)) { [a, b] = pt; P = _m2.addVectors(bp[a], bp[b]).multiplyScalar(0.5); rad = (br[a] + br[b]) * 0.5; }
      else { P = bp[pt]; rad = br[pt] * 0.85; }
      _d.subVectors(P, F.c);
      const lx = _d.dot(F.r), ly = _d.dot(F.u), lz = _d.dot(F.f);
      const px = hx + rad - Math.abs(lx), py = hy + rad - Math.abs(ly), pz = hz + rad - Math.abs(lz);
      if (px <= 0 || py <= 0 || pz <= 0) continue;
      // Push out the shallowest way
      let axis, pen, sgn;
      if (pz <= px && pz <= py) { axis = F.f; pen = pz; sgn = Math.sign(lz) || 1; }
      else if (px <= py) { axis = F.r; pen = px; sgn = Math.sign(lx) || 1; }
      else { axis = F.u; pen = py; sgn = Math.sign(ly) || 1; }
      const limb = own ? 0.75 : 0.5;
      if (a >= 0) { bp[a].addScaledVector(axis, sgn * pen * limb); bp[b].addScaledVector(axis, sgn * pen * limb); }
      else bp[pt].addScaledVector(axis, sgn * pen * limb);
      if (!this.sleeping) { this.p[PEL].addScaledVector(axis, -sgn * pen * (1 - limb) * 0.5); this.p[CHE].addScaledVector(axis, -sgn * pen * (1 - limb) * 0.5); }
    }
  }

  // Joint spheres against another body's joint spheres (bodies pile up).
  jointCollide(o) {
    const p = this.p, q = o.p;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        _v.subVectors(p[i], q[j]);
        const d2 = _v.lengthSq(), min = this.r[i] + o.r[j];
        if (d2 >= min * min || d2 < 1e-10) continue;
        const d = Math.sqrt(d2), pen = min - d;
        const share = o.sleeping ? 1 : 0.5;
        p[i].addScaledVector(_v, (pen / d) * share);
        if (!o.sleeping) q[j].addScaledVector(_v, -(pen / d) * (1 - share));
      }
    }
  }

  // Shot or hit in the legs: the feet are swept out the way the blow went
  // and the upper body pitches the other way, so the body goes down hard.
  sweepLegs(dir, speed) {
    this.wake();
    const h = this.sys.h;
    this.tone *= 0.3; // the legs give out
    for (const j of [FTL, FTR, KNL, KNR]) {
      const k = j === FTL || j === FTR ? 1 : 0.6;
      this.q[j].addScaledVector(dir, -speed * k * h);
      this.q[j].y -= speed * 0.8 * k * h; // off the ground, or friction eats the kick
    }
    for (const j of [CHE, HEAD, SHL, SHR]) this.q[j].addScaledVector(dir, speed * 0.3 * h);
  }

  collide(friction) {
    const p = this.p, q = this.q, hash = this.sys.hash;
    for (let i = 0; i < N; i++) {
      const r = this.r[i], pt = p[i];
      // Ground (or the storey's floor)
      if (pt.y < this.floor + r) {
        const impact = q[i].y - pt.y;
        pt.y = this.floor + r;
        q[i].y = pt.y; // inelastic: kill the downward velocity on contact
        if (friction) { q[i].x += (pt.x - q[i].x) * 0.35; q[i].z += (pt.z - q[i].z) * 0.35; }
        if ((i === PEL || i === CHE) && !this.landed && impact > 0.02) { this.landed = true; this.sys.thud(pt, impact); }
      }
      // World boxes (walls, cars, furniture) below the joint's height
      for (const b of hash.query(pt.x - r, pt.z - r, pt.x + r, pt.z + r, this.sys.tmp)) {
        if (b.noCollide) continue;
        // Windows: glass stops a body; an open or smashed one only has its sill.
        const wb = b.window?.base || 0;
        const top = b.window ? wb + (b.window.state === 'closed' ? 3 : b.window.sill) : (b.h ?? 3);
        if (pt.y - r > top || pt.y + r < (b.y0 ?? 0)) continue;
        const cx = Math.max(b.minX, Math.min(pt.x, b.maxX)), cz = Math.max(b.minZ, Math.min(pt.z, b.maxZ));
        const dx = pt.x - cx, dz = pt.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        // Only a limb coming down onto a low object rests on it; one that
        // meets it from the side is pushed aside (no popping up onto sills).
        if (top - (b.y0 ?? 0) < 1.2 && q[i].y - r >= top - 0.04) { pt.y = top + r; if (q[i].y < pt.y) q[i].y = pt.y; continue; }
        const ox = pt.x, oz = pt.z;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); pt.x += (dx / d) * (r - d); pt.z += (dz / d) * (r - d); }
        else {
          // Inside the box: out the way it came in (from the previous position), else the shallowest side
          const px = q[i].x, pz = q[i].z;
          const l = pt.x - b.minX, rr = b.maxX - pt.x, t = pt.z - b.minZ, bt = b.maxZ - pt.z;
          const m = px <= b.minX ? l : px >= b.maxX ? rr : pz <= b.minZ ? t : pz >= b.maxZ ? bt : Math.min(l, rr, t, bt);
          if (m === l) pt.x = b.minX - r; else if (m === rr) pt.x = b.maxX + r; else if (m === t) pt.z = b.minZ - r; else pt.z = b.maxZ + r;
        }
        // The push-out mustn't become velocity (that's what flung bodies off
        // walls and window glass): an inelastic hit.
        const cx2 = pt.x - ox, cz2 = pt.z - oz, cl = Math.hypot(cx2, cz2);
        if (cl > 1e-6) {
          const nx = cx2 / cl, nz = cz2 / cl;
          const vn = (pt.x - q[i].x) * nx + (pt.z - q[i].z) * nz;
          if (vn > 0) { q[i].x += nx * vn; q[i].z += nz * vn; }
        }
        if (friction) { q[i].x += (pt.x - q[i].x) * 0.2; q[i].z += (pt.z - q[i].z) * 0.2; }
      }
    }
  }

  // After settling, dead bodies become a single static mesh per material.
  freeze() {
    if (this.frozen || this.alive) return;
    this.updateMeshes();
    this.group.updateMatrixWorld(true);
    const byMat = new Map();
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(geo);
    });
    this.liveGroup = this.group;
    this.sys.scene.remove(this.group);
    const g = new THREE.Group();
    for (const [mat, geos] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
    this.group = g;
    this.sys.scene.add(g);
    this.frozen = true;
  }

  unfreeze() {
    if (!this.frozen) return;
    this.sys.scene.remove(this.group);
    for (const m of this.group.children) m.geometry.dispose();
    this.group = this.liveGroup;
    this.sys.scene.add(this.group);
    this.frozen = false;
  }

  get pelvis() { return this.p[PEL]; }
  get headPos() { return this.p[HEAD]; }
  // Facing direction of the body (for getting back up)
  get yaw() { const d = _v.subVectors(this.p[HEAD], this.p[PEL]); return Math.atan2(d.x, d.z); }
  get faceDown() { _a.subVectors(this.p[CHE], this.p[PEL]); _b.subVectors(this.p[SHR], this.p[SHL]); return new THREE.Vector3().crossVectors(_b, _a).y < 0; }

  dispose() {
    this.sys.scene.remove(this.group);
    if (this.liveGroup) this.sys.scene.remove(this.liveGroup);
    for (const g of [this.group, this.liveGroup]) g?.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.dead = true;
  }

  // Ray test against the joints (as spheres), for shooting bodies on the ground.
  raycast(origin, dir, maxDist) {
    let best = null;
    for (let i = 0; i < N; i++) {
      const c = this.p[i], r = this.r[i] * 1.4;
      _v.subVectors(c, origin);
      const t = _v.dot(dir);
      if (t < 0 || t > maxDist) continue;
      const d2 = _v.lengthSq() - t * t;
      if (d2 > r * r) continue;
      const th = t - Math.sqrt(r * r - d2);
      if (!best || th < best.t) best = { t: th, joint: i, head: i === HEAD };
    }
    return best;
  }
}

// A loose rigid stick (a dropped gun) built from two joints.
class Prop {
  constructor(sys, mesh, a, b, vel) {
    this.sys = sys; this.mesh = mesh;
    this.p = [a.clone(), b.clone()];
    this.q = [a.clone().addScaledVector(vel, -sys.h), b.clone().addScaledVector(vel, -sys.h).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02))];
    this.len = a.distanceTo(b);
    this.age = 0;
    sys.scene.add(mesh);
  }
  step(h) {
    for (let i = 0; i < 2; i++) {
      const p = this.p[i], q = this.q[i];
      const vx = p.x - q.x, vy = p.y - q.y, vz = p.z - q.z;
      q.copy(p); p.x += vx * 0.99; p.y += vy - 9.8 * h * h; p.z += vz * 0.99;
      if (p.y < 0.03) { p.y = 0.03; q.x += (p.x - q.x) * 0.4; q.z += (p.z - q.z) * 0.4; }
    }
    _v.subVectors(this.p[1], this.p[0]);
    const d = _v.length() || 1e-6, diff = (d - this.len) / d / 2;
    this.p[0].addScaledVector(_v, diff); this.p[1].addScaledVector(_v, -diff);
    this.mesh.position.addVectors(this.p[0], this.p[1]).multiplyScalar(0.5);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _v.normalize());
  }
}

export class RagdollSystem {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.hash = game.world.hash;
    this.list = [];
    this.props = [];
    this.h = 1 / 90;
    this.acc = 0;
    this.tmp = [];
    this.maxBodies = 45;
  }

  create(spec) {
    const r = new Ragdoll(this, spec);
    if (spec.settleNow) r.settleNow();
    this.list.push(r);
    // Too many bodies: drop the oldest settled corpse's mesh (its loot stays).
    const corpses = this.list.filter((x) => !x.alive);
    if (corpses.length > this.maxBodies) { const old = corpses[0]; old.dispose(); this.list.splice(this.list.indexOf(old), 1); }
    return r;
  }

  dropProp(mesh, a, b, vel) {
    this.props.push(new Prop(this, mesh, a, b, vel));
    if (this.props.length > 20) { const p = this.props.shift(); this.scene.remove(p.mesh); }
  }

  remove(r) { r.dispose(); const i = this.list.indexOf(r); if (i >= 0) this.list.splice(i, 1); }

  thud(pos, impact) {
    const pl = this.game.player;
    if (!pl) return;
    const d = pos.distanceTo(pl.pos);
    if (d < 30) sfx.bodyFall(Math.min(1, impact * 12) * (1 - d / 30));
  }

  update(dt) {
    this.acc = Math.min(this.acc + dt, this.h * 6);
    let steps = 0;
    while (this.acc >= this.h) { this.acc -= this.h; steps++; }
    const p = this.game.player?.pos;
    if (!p) return;
    for (const r of this.list) {
      r.age += dt;
      if (r.sleeping) continue;
      // Other bodies close enough to touch this one
      r.neighbors.length = 0;
      for (const o of this.list) if (o !== r && !o.dead && o.pelvis.distanceToSquared(r.pelvis) < 4.4) r.neighbors.push(o);
      for (let i = 0; i < steps; i++) r.step(this.h);
      r.updateMeshes();
      // Settling: motion has died down for a moment
      let maxV = 0;
      for (let i = 0; i < N; i++) maxV = Math.max(maxV, r.p[i].distanceToSquared(r.q[i]));
      r.slow = r.age > 1 && maxV < 2e-5 && r.tone <= 0;
      if (maxV < 4e-7 && r.age > 0.6) r.still += dt; else r.still = 0;
      if (r.still > 0.4 || (r.age > 12 && !r.alive)) {
        r.sleeping = true;
        r.onSettle?.(r);
        if (!r.alive) r.freeze();
      }
    }
    for (const pr of this.props) { pr.age += dt; if (pr.age < 6) for (let i = 0; i < steps; i++) pr.step(this.h); }
    // Hide bodies the fog swallows anyway
    const vis = this.game.isNight ? 70 : 110;
    for (const r of this.list) r.group.visible = r.pelvis.distanceTo(p) < vis;
  }

  // Closest body joint along a ray (dead or knocked-down bodies).
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const r of this.list) {
      if (r.pelvis.distanceTo(origin) > maxDist + 2) continue;
      const h = r.raycast(origin, dir, maxDist);
      if (h && (!best || h.t < best.t)) best = { ...h, ragdoll: r };
    }
    return best;
  }

  dispose() {
    for (const r of this.list) r.dispose();
    for (const p of this.props) this.scene.remove(p.mesh);
    this.list = []; this.props = [];
  }
}

export const JOINT = { PEL, CHE, HEAD, FTL, FTR };
