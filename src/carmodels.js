// Vehicle models. A parked car is one merged mesh (one draw call); a car
// that's being driven or worked on is built in pieces so its wheels turn,
// its body rides on the suspension, and its driver's door, hood and trunk
// lid (or tailgate) swing on their hinges.
//
// Local space: +z is forward, +x is the driver's side, y up, ground at 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { worldTextures, worldUV } from './worldtex.js';

const _c = new THREE.Color();
function colorize(g, color) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function keep(g) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); return g; }
// Box piece
export function part(list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  list.push(keep(colorize(g, color)));
}
// Cylinder piece along the x axis (wheels) or another axis
function cyl(list, r, len, x, y, z, color, axis = 'x', seg = 16, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg).toNonIndexed();
  if (axis === 'x') g.rotateZ(Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  list.push(keep(colorize(g, color)));
}
// Side-profile extrusion: pts [z, y], `width` across x centred on x
function profile(list, pts, width, x, color, bevel = 0.02) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.01, width - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2 + x, 0, 0);
  g.computeVertexNormals();
  list.push(keep(colorize(g.index ? g.toNonIndexed() : g, color)));
}
// A beam from a to b (pillars)
function beam(list, a, b, t, x, color) {
  const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
  part(list, t, len, t, x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2, color, Math.atan2(dz, dy));
}

// A wheel: tyre with tread blocks, rim with spokes and a hub cap
function wheel(list, r, w, x, y, z, side) {
  cyl(list, r, w, x, y, z, 0x161616, 'x', 20);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; part(list, w * 0.9, 0.035, 0.05, x, y + Math.cos(a) * r, z + Math.sin(a) * r, 0x101010, a); }
  const face = x + side * (w / 2 + 0.003);
  cyl(list, r * 0.62, 0.02, face, y, z, 0x8a8c8e, 'x', 16);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(list, 0.02, r * 0.5, 0.05, face + side * 0.008, y + Math.cos(a) * r * 0.3, z + Math.sin(a) * r * 0.3, 0x6a6c6e, a); }
  cyl(list, r * 0.18, 0.03, face + side * 0.012, y, z, 0xb8babc, 'x', 12);
}

// Body shape per type: profile points, cabin glass, the hinged panels, lights
function bodyParams(type, L, W) {
  const F = L / 2;
  if (type === 'pickup') {
    const ax = F - 0.85;
    return {
      F, ax, r: 0.38, top: 1.02,
      lower: [[F - 0.08, 0.32], [F, 0.45], [F + 0.02, 0.7], [F - 0.06, 0.88], [F - 0.25, 0.97], [1.1, 1.02], [-0.38, 1.02], [-0.38, 0.72], [-(F - 0.05), 0.72], [-F, 0.62], [-(F + 0.01), 0.45], [-(F - 0.06), 0.32]],
      glass: [[1.1, 1.02], [0.38, 1.6], [-0.3, 1.6], [-0.38, 1.02]], roof: [0.4, -0.32, 1.6],
      door: { z0: 1.05, z1: -0.33, y0: 0.38, y1: 1.0 }, hood: { z0: 1.1, z1: F - 0.25, y: 1.0 }, trunk: { tailgate: true, z: -(F - 0.03), y: 0.72, h: 0.3 },
      lights: { y: 0.82, rear: 0.86 }, bed: { z0: -0.42, z1: -(F - 0.05), y0: 0.72, y1: 1.02 },
    };
  }
  // sedan / police
  const s = L / 4.3, ax = F - 0.85, cowl = 0.95 * s;
  return {
    F, ax, r: 0.36, top: 0.94,
    lower: [[F - 0.08, 0.3], [F, 0.42], [F + 0.02, 0.62], [F - 0.04, 0.76], [F - 0.22, 0.85], [cowl, 0.92], [-1.35 * s, 0.95], [-(F - 0.15), 0.9], [-F, 0.78], [-(F + 0.02), 0.5], [-(F - 0.06), 0.3]],
    glass: [[cowl, 0.92], [0.25 * s, 1.38], [-0.85 * s, 1.38], [-1.35 * s, 0.95]], roof: [0.28 * s, -0.88 * s, 1.38],
    door: { z0: cowl - 0.04, z1: -0.33 * s, y0: 0.36, y1: 0.93 }, hood: { z0: cowl, z1: F - 0.22, y: 0.9 }, trunk: { z0: -1.35 * s, z1: -(F - 0.15), y: 0.93 },
    lights: { y: 0.66, rear: 0.74 }, pillarB: -0.35 * s,
  };
}
let PAINT = null, LIGHT_MAT = null, BRAKE_MAT = null, BAR_MATS = null, GLASS_MAT = null;
function mats() {
  if (PAINT) return;
  const grime = worldTextures().grime;
  PAINT = new THREE.MeshStandardMaterial({ vertexColors: true, map: grime, roughness: 0.5, metalness: 0.3 });
  LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 2 });
  BRAKE_MAT = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2.5 });
  BAR_MATS = [new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0 }), new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0030ff, emissiveIntensity: 0 })];
  GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.82 });
}
export { BRAKE_MAT, BAR_MATS };

function meshOf(list, mat = PAINT) {
  if (!list.length) return null;
  const g = mergeGeometries(list);
  for (const x of list) x.dispose();
  worldUV(g, 0.9);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// mode: 'parked' (one merged mesh), 'anim' (hinged panels and wheels as
// pieces), 'drive' (as anim, from the driver's seat: no tinted glass, a
// dashboard, seats and a steering wheel).
// Parked cars that look the same (type, paint, which lights and tyres are
// missing) share one geometry: built once, not once per car
const PARKED = new Map();
export function buildCarModel(v, mode) {
  mats();
  const { L, W } = v.def, t = v.type, col = v.color, P = v.parts;
  const split = mode !== 'parked', inside = mode === 'drive';
  const key = split ? null : [t, col, P.headlights == null, ...v.wheelPositions().map((w) => P[w[2]] == null)].join('|');
  if (key && PARKED.has(key)) {
    const hit = PARKED.get(key), root = new THREE.Group(), bodyG = new THREE.Group();
    root.add(bodyG);
    const m = new THREE.Mesh(hit.geo, PAINT);
    m.castShadow = m.receiveShadow = true;
    bodyG.add(m);
    return { ...JSON.parse(hit.out), root, body: bodyG, wheels: [], lightMeshes: [], brakeMeshes: [], bar: [], steeringWheel: null };
  }
  const body = [], glass = [], door = [], hood = [], trunk = [], wheels = [];
  const dark = 0x1a1a1a, trim = 0x2a2a2a, chrome = 0x9a9c9e;
  const out = { pivots: {}, wheels: [], lightMeshes: [], brakeMeshes: [], bar: [], steeringWheel: null };
  const root = new THREE.Group();
  const bodyG = new THREE.Group(); // rides on the suspension
  root.add(bodyG);
  out.root = root; out.body = bodyG;
  const hl = P.headlights == null ? dark : 0xe8e8d0;
  if (t === 'military') {
    const F = L / 2, ax = F - 1.0;
    // chassis, cab-over cab, short bonnet, cargo bed with a canvas cover
    part(body, W - 0.2, 0.3, L - 0.4, 0, 0.75, 0, 0x2a2e22);
    part(body, W, 0.12, L - 0.2, 0, 1.0, 0, col);
    const cab = [[F - 0.05, 1.05], [F - 0.05, 1.6], [F - 0.35, 2.4], [F - 1.9, 2.4], [F - 1.9, 1.05]];
    profile(body, cab, W - 0.1, 0, col, 0.04);
    if (!inside) profile(glass, [[F - 0.07, 1.7], [F - 0.36, 2.3], [F - 0.9, 2.3], [F - 0.9, 1.7]], W - 0.06, 0, 0x1a2228, 0.01);
    else for (const sx of [-1, 1]) beam(body, [F - 0.07, 1.6], [F - 0.36, 2.38], 0.08, sx * (W / 2 - 0.15), col);
    part(body, W - 0.4, 0.28, 0.08, 0, 1.3, F + 0.0, dark); // grille
    for (let i = 0; i < 6; i++) part(body, 0.04, 0.24, 0.04, -0.55 + i * 0.22, 1.3, F + 0.04, 0x3a3a3a);
    part(body, W + 0.1, 0.22, 0.2, 0, 0.62, F + 0.02, dark); // bumper
    for (const sx of [-0.85, 0.85]) part(body, 0.3, 0.16, 0.05, sx, 1.05, F + 0.03, hl);
    for (const z of [ax, -ax]) for (const sx of [-1, 1]) part(body, 0.36, 0.08, 1.15, sx * (W / 2 - 0.05), 1.12, z, col); // fenders
    part(body, W, 0.08, L - 2.1, 0, 1.12, -1.05, 0x4a5236); // bed floor
    for (const sx of [-1, 1]) part(body, 0.06, 0.45, L - 2.1, sx * (W / 2 - 0.03), 1.38, -1.05, 0x4a5236);
    // canvas tilt over hoops
    const canvas = new THREE.CylinderGeometry(W / 2, W / 2, L - 2.2, 14, 1, true, -Math.PI / 2, Math.PI).toNonIndexed();
    canvas.rotateX(-Math.PI / 2); canvas.translate(0, 1.6, -1.05);
    body.push(keep(colorize(canvas, 0x5a6440)));
    part(body, W, 0.9, 0.04, 0, 2.0, F - 2.05, 0x5a6440);
    part(trunk, W - 0.1, 1.0, 0.04, 0, -0.5, 0, 0x4e5838); // rear canvas flap (hangs from the top)
    out.pivots.trunk = { at: [0, 2.6, -(F - 0.05)], axis: 'x', open: 1.3 };
    part(door, 0.05, 0.9, 1.3, 0, 0.45, -0.65, col); // driver's cab door
    if (!inside) part(door, 0.052, 0.4, 0.9, 0, 1.0, -0.7, 0x1a2228);
    out.pivots.door = { at: [W / 2 - 0.02, 1.15, F - 0.25], axis: 'y', open: -1.0 };
    for (const sx of [-0.8, 0.8]) part(body, 0.3, 0.14, 0.05, sx, 0.75, -(F + 0.02), 0x9a1a1a);
    out.exhaust = [-(W / 2 - 0.1), 2.6, F - 2.0];
    out.wheelR = 0.5;
  } else {
    const p = bodyParams(t, L, W), F = p.F;
    // lower body with wheel arches
    const lower = [...p.lower];
    const rearBottom = lower.pop();
    const arch = (cz) => { const pts = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([cz - Math.cos(a) * (p.r + 0.08), 0.36 + Math.sin(a) * (p.r + 0.08)]); } return pts; };
    // bottom edge: from the rear bumper forward over both wheels
    const bottom = [rearBottom, [-p.ax - p.r - 0.08, 0.3], ...arch(-p.ax), [-p.ax + p.r + 0.08, 0.3], [p.ax - p.r - 0.08, 0.3], ...arch(p.ax), [p.ax + p.r + 0.08, 0.3]];
    profile(body, [...lower, ...bottom], W, 0, col, 0.05);
    // cabin glass, roof and pillars
    const [rz0, rz1, ry] = p.roof;
    if (!inside) profile(glass, p.glass, W - 0.16, 0, 0x1a2228, 0.02);
    part(body, W - 0.16, 0.05, rz0 - rz1 + 0.1, 0, ry + 0.02, (rz0 + rz1) / 2, col);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.1);
      beam(body, p.glass[0], p.glass[1], 0.07, x, col);
      beam(body, p.glass[2], p.glass[3], 0.09, x, col);
      if (p.pillarB) part(body, 0.07, p.glass[1][1] - p.top, 0.08, x, (p.glass[1][1] + p.top) / 2, p.pillarB, col);
    }
    // seams, handles, trim, mirrors
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.002);
      for (const z of [p.door.z0, p.door.z1, ...(t === 'pickup' ? [] : [-1.25 * (L / 4.3)])]) part(body, 0.01, p.door.y1 - p.door.y0, 0.012, x, (p.door.y0 + p.door.y1) / 2, z, dark);
      part(body, 0.015, 0.035, 0.12, x + sx * 0.005, 0.8, p.door.z1 + 0.18, chrome);
      part(body, 0.015, 0.06, L - 0.9, x, 0.52, 0, trim);
      part(body, 0.12, 0.09, 0.15, sx * (W / 2 + 0.06), 1.0, p.door.z0 - 0.1, col);
    }
    // nose and tail
    part(body, W + 0.04, 0.18, 0.16, 0, 0.4, F - 0.02, dark);
    part(body, W + 0.04, 0.18, 0.16, 0, 0.4, -(F - 0.02), dark);
    part(body, 0.9, 0.16, 0.04, 0, 0.6, F + 0.01, 0x111111);
    for (let i = 0; i < 5; i++) part(body, 0.86, 0.012, 0.05, 0, 0.54 + i * 0.03, F + 0.025, 0x3a3a3a);
    part(body, 0.32, 0.1, 0.02, 0, 0.42, F + 0.09, 0xe8e8e0); // plates
    part(body, 0.32, 0.1, 0.02, 0, 0.5, -(F + 0.09), 0xe8e8e0);
    for (const sx of [-0.62, 0.62]) {
      part(body, 0.34, 0.12, 0.06, sx, p.lights.y, F + 0.0, hl);
      part(body, 0.3, 0.1, 0.05, sx, p.lights.rear, -(F + 0.0), 0x8a1a1a);
    }
    cyl(body, 0.035, 0.18, -0.5, 0.26, -(F - 0.04), 0x4a4a4a, 'z', 8); // exhaust
    out.exhaust = [-0.5, 0.26, -(F + 0.06)];
    cyl(body, 0.006, 0.7, -(W / 2 - 0.15), p.top + 0.35, -(F - 0.45), 0x222222, 'y', 5); // antenna
    // driver's door (a panel on the side that swings out), hood, trunk lid
    const d = p.door;
    part(door, 0.05, d.y1 - d.y0, d.z0 - d.z1, 0, (d.y0 + d.y1) / 2, -(d.z0 - d.z1) / 2, col);
    if (!inside) profile(door, [[0, d.y1], [-(d.z0 - d.z1) * 0.35, p.glass[1][1] - 0.05], [-(d.z0 - d.z1), p.glass[1][1] - 0.05], [-(d.z0 - d.z1), d.y1]].map(([z, y]) => [z, y]), 0.03, 0, 0x1a2228, 0.005);
    part(door, 0.02, 0.035, 0.12, 0.03, 0.8, -(d.z0 - d.z1) + 0.18, chrome);
    out.pivots.door = { at: [W / 2 + 0.01, 0, d.z0], axis: 'y', open: -1.05 }; // swings out
    part(hood, W - 0.12, 0.04, p.hood.z1 - p.hood.z0, 0, 0, (p.hood.z1 - p.hood.z0) / 2, col);
    out.pivots.hood = { at: [0, p.hood.y + 0.02, p.hood.z0], axis: 'x', open: -1.0 };
    if (p.trunk.tailgate) {
      part(trunk, W - 0.08, p.trunk.h, 0.06, 0, p.trunk.h / 2, 0, col);
      out.pivots.trunk = { at: [0, p.trunk.y, p.trunk.z], axis: 'x', open: -Math.PI / 2 };
    } else {
      part(trunk, W - 0.12, 0.04, p.trunk.z0 - p.trunk.z1, 0, 0, -(p.trunk.z0 - p.trunk.z1) / 2, col);
      out.pivots.trunk = { at: [0, p.trunk.y + 0.01, p.trunk.z0], axis: 'x', open: 1.1 };
    }
    if (p.bed) {
      for (const sx of [-1, 1]) part(body, 0.07, p.bed.y1 - p.bed.y0, p.bed.z0 - p.bed.z1, sx * (W / 2 - 0.04), (p.bed.y0 + p.bed.y1) / 2, (p.bed.z0 + p.bed.z1) / 2, col);
      part(body, W, p.bed.y1 - p.bed.y0, 0.07, 0, (p.bed.y0 + p.bed.y1) / 2, p.bed.z0, col);
      part(body, W - 0.14, 0.02, p.bed.z0 - p.bed.z1, 0, p.bed.y0 + 0.01, (p.bed.z0 + p.bed.z1) / 2, 0x2a2a2a);
    }
    if (t === 'police') {
      for (const sx of [-1, 1]) part(body, 0.012, 0.12, L - 1.0, sx * (W / 2 + 0.004), 0.68, 0, 0x1a3a8a); // stripe
      part(body, 1.1, 0.1, 0.3, 0, 0.42, F + 0.18, 0x1a1a1a); // push bar
      part(body, 1.2, 0.06, 0.28, 0, ry + 0.07, (rz0 + rz1) / 2, 0x222222); // lightbar base
      if (split) {
        for (const [i, sx] of [[0, -0.3], [1, 0.3]]) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.24), BAR_MATS[i]);
          m.position.set(sx, ry + 0.15, (rz0 + rz1) / 2); bodyG.add(m); out.bar.push(m);
        }
      } else { part(body, 0.5, 0.1, 0.24, -0.3, ry + 0.15, (rz0 + rz1) / 2, 0xaa2222); part(body, 0.5, 0.1, 0.24, 0.3, ry + 0.15, (rz0 + rz1) / 2, 0x2244aa); }
    }
    out.wheelR = 0.36;
    out.lightY = p.lights.y; out.rearY = p.lights.rear; out.F = F;
  }
  // Wheels: merged when parked, separate pieces to spin and steer otherwise
  const wr = out.wheelR;
  for (const [x, z, tire] of v.wheelPositions()) {
    if (P[tire] == null) { part(wheels, 0.12, 0.3, 0.3, x, wr - 0.02, z, 0x3a3a3a); continue; } // bare hub
    if (!split) { wheel(wheels, wr, 0.26, x, wr, z, Math.sign(x)); continue; }
    const wl = [];
    wheel(wl, wr, 0.26, 0, 0, 0, Math.sign(x));
    const m = meshOf(wl);
    m.position.set(x, wr, z);
    m.userData.front = z > 0;
    root.add(m);
    out.wheels.push(m);
  }
  if (!split) {
    // everything in one mesh; glass included with the paint
    const m = meshOf([...body, ...glass, ...door.map((g) => g.translate(...out.pivots.door.at) && g), ...hood.map((g) => g.translate(...out.pivots.hood?.at || [0, 0, 0]) && g), ...trunk.map((g) => g.translate(...out.pivots.trunk?.at || [0, 0, 0]) && g), ...wheels]);
    bodyG.add(m);
    m.geometry.userData.shared = true; // (other cars use it: never disposed)
    const { root: _r, body: _b, wheels: _w, lightMeshes: _l, brakeMeshes: _br, bar: _ba, steeringWheel: _s, ...rest } = out;
    PARKED.set(key, { geo: m.geometry, out: JSON.stringify(rest) });
    return out;
  }
  bodyG.add(meshOf([...body, ...wheels]));
  if (glass.length) bodyG.add(meshOf(glass, GLASS_MAT));
  for (const [name, list] of [['door', door], ['hood', hood], ['trunk', trunk]]) {
    const pv = out.pivots[name];
    if (!pv || !list.length) continue;
    const g = new THREE.Group();
    g.position.set(...pv.at);
    // door glass goes in with the paint (it's a thin slab)
    g.add(meshOf(list));
    bodyG.add(g);
    pv.node = g;
  }
  // brake lights and headlight glow (shown when lit)
  if (t !== 'military') {
    for (const sx of [-0.62, 0.62]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.02), BRAKE_MAT);
      b.position.set(sx, out.rearY, -(out.F + 0.04)); b.visible = false; bodyG.add(b); out.brakeMeshes.push(b);
    }
  }
  if (inside) {
    // the cab from the driver's seat: dashboard, seats, wheel, mirror
    const mil = t === 'military';
    const dashZ = mil ? L / 2 - 0.45 : t === 'pickup' ? 1.15 : 0.75, dashY = mil ? 1.55 : 0.82;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(W - 0.25, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.8 }));
    dash.position.set(0, dashY, dashZ); bodyG.add(dash);
    const gauges = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x2a3a20, emissiveIntensity: 0.6 }));
    gauges.position.set(mil ? 0.5 : 0.38, dashY + 0.06, dashZ - 0.19); bodyG.add(gauges);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 18), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    sw.position.set(mil ? 0.5 : 0.38, dashY + 0.1, dashZ - 0.28); sw.rotation.x = -0.35;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.02), sw.material); sw.add(spoke);
    bodyG.add(sw); out.steeringWheel = sw;
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.95 });
    for (const sx of [0.38, -0.38]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatMat); seat.position.set(mil ? sx * 1.3 : sx, mil ? 1.45 : 0.6, dashZ - 1.05); bodyG.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.1), seatMat); back.position.set(seat.position.x, seat.position.y + 0.35, seat.position.z - 0.3); back.rotation.x = -0.15; bodyG.add(back);
    }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.9, roughness: 0.1 }));
    mirror.position.set(0, mil ? 2.2 : 1.27, dashZ - 0.15); bodyG.add(mirror);
    if (P.headlights) for (const sx of [-0.62, 0.62]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.02), LIGHT_MAT);
      l.position.set(sx, mil ? 1.05 : out.lightY, L / 2 + 0.05); l.visible = false; bodyG.add(l); out.lightMeshes.push(l);
    }
  }
  return out;
}
