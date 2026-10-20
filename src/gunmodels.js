// Weapon, magazine and hand models for the first-person view. Parts are
// shaped (extruded side profiles, rounded boxes) and textured with
// procedural canvas textures: wood grain, worn and parkerized metal,
// stippled polymer, Bakelite, glove fabric and camo sleeves. Texture
// coordinates are projected in metres, so grain and wear stay the same
// scale on every part.
//
// Model space: the sight line is the -Z axis at y = 0 with the rear sight at
// the origin (iron-sight ADS puts the eye on that line). The sights, mounts,
// magazine root and hand positions are what the aiming and animation code
// relies on; keep them where they are.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------------------------
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Per-pixel fill: f(x, y) -> [r, g, b] (0..255)
function pixels(g, S, f) {
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const [r, gg, b] = f(x, y), i = (y * S + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
// Smooth value noise for grain and blotches (tileable)
function noise2(S, cells, s0) {
  seed = s0;
  const n = cells, v = Array.from({ length: n * n }, () => rnd());
  const at = (i, j) => v[((j % n + n) % n) * n + ((i % n + n) % n)];
  return (x, y) => {
    const fx = (x / S) * n, fy = (y / S) * n, i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
}

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const S = 256;
  // Wood: long wavy grain running along u (the length of the part)
  const wood = (base, dark, s0) => canvasTex(S, (g) => {
    const n1 = noise2(S, 4, s0), n2 = noise2(S, 16, s0 + 7);
    pixels(g, S, (x, y) => {
      const warp = n1(x, y) * 26 + n2(x, y) * 4;
      const ring = 0.5 + 0.5 * Math.sin((y + warp) * 0.42);
      const k = Math.pow(ring, 3) * 0.55 + n2(x, y) * 0.25;
      return base.map((c, i) => Math.round(c + (dark[i] - c) * Math.min(1, k)));
    });
  });
  // Worn metal: fine grain, light scratches and pale wear (grey: tinted by colour)
  const metal = canvasTex(S, (g) => {
    const n = noise2(S, 32, 11), m = noise2(S, 6, 23);
    pixels(g, S, (x, y) => { const v = 150 + n(x, y) * 60 + m(x, y) * 30 + (rnd() - 0.5) * 22; return [v, v, v]; });
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = rnd() * S, y = rnd() * S, a = (rnd() - 0.5) * 0.5, l = 8 + rnd() * 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 160; i++) g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 2);
  }, false);
  // Stippled polymer: dense speckle
  const poly = canvasTex(S, (g) => {
    const n = noise2(S, 64, 37);
    pixels(g, S, (x, y) => { const v = 165 + n(x, y) * 50 + (rnd() - 0.5) * 50; return [v, v, v]; });
  }, false);
  // Bakelite: dark red-brown with swirls
  const bakelite = canvasTex(S, (g) => {
    const n = noise2(S, 5, 41), f = noise2(S, 24, 43);
    pixels(g, S, (x, y) => { const k = 0.5 + 0.5 * Math.sin(n(x, y) * 14 + f(x, y) * 3); return [Math.round(70 + 40 * k), Math.round(32 + 16 * k), Math.round(22 + 10 * k)]; });
  });
  // Glove fabric: woven
  const fabric = canvasTex(S, (g) => {
    const n = noise2(S, 32, 53);
    pixels(g, S, (x, y) => { const w = ((x >> 1) + (y >> 1)) % 2 ? 1 : 0.84; const v = (150 + n(x, y) * 60) * w; return [v, v, v]; });
  }, false);
  // Woodland-ish camo for the sleeves
  const camo = canvasTex(S, (g) => {
    const a = noise2(S, 5, 61), b = noise2(S, 7, 67), c = noise2(S, 9, 71), f = noise2(S, 64, 73);
    pixels(g, S, (x, y) => {
      let col = [72, 82, 52];
      if (a(x, y) > 0.6) col = [48, 58, 36];
      if (b(x, y) > 0.66) col = [92, 82, 58];
      if (c(x, y) > 0.72) col = [34, 34, 28];
      const k = 0.9 + f(x, y) * 0.2;
      return col.map((v) => Math.round(v * k));
    });
  });
  TEX = {
    wood: wood([112, 70, 40], [52, 30, 14], 3), woodDark: wood([84, 50, 28], [36, 20, 10], 5), woodRed: wood([104, 54, 30], [50, 24, 12], 9),
    metal, poly, bakelite, fabric, camo,
  };
  return TEX;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function makeMats() {
  const T = textures();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    metal: std({ color: 0x585a5c, map: T.metal, bumpMap: T.metal, bumpScale: 0.6, metalness: 0.65, roughness: 0.42 }),
    dark: std({ color: 0x3a3b3d, map: T.metal, bumpMap: T.metal, bumpScale: 0.6, metalness: 0.5, roughness: 0.55 }),
    blued: std({ color: 0x3a4048, map: T.metal, bumpMap: T.metal, bumpScale: 0.4, metalness: 0.75, roughness: 0.32 }),
    steel: std({ color: 0x9a9c9e, map: T.metal, metalness: 0.85, roughness: 0.28 }),
    wood: std({ map: T.wood, bumpMap: T.wood, bumpScale: 0.8, roughness: 0.62 }),
    woodDark: std({ map: T.woodDark, bumpMap: T.woodDark, bumpScale: 0.8, roughness: 0.66 }),
    woodRed: std({ map: T.woodRed, bumpMap: T.woodRed, bumpScale: 0.8, roughness: 0.55 }),
    polymer: std({ color: 0x2e2e2e, map: T.poly, bumpMap: T.poly, bumpScale: 1, roughness: 0.88 }),
    plum: std({ color: 0x5e2a1c, map: T.poly, bumpMap: T.poly, bumpScale: 0.8, roughness: 0.78 }),
    rubber: std({ color: 0x1e1e1e, map: T.poly, bumpMap: T.poly, bumpScale: 1.4, roughness: 0.95 }),
    bakelite: std({ map: T.bakelite, roughness: 0.5 }),
    glove: std({ color: 0x4a4a42, map: T.fabric, bumpMap: T.fabric, bumpScale: 1, roughness: 0.95 }),
    leather: std({ color: 0x3a2a1e, map: T.fabric, bumpMap: T.fabric, bumpScale: 0.6, roughness: 0.75 }),
    sleeve: std({ map: T.camo, bumpMap: T.fabric, bumpScale: 0.6, roughness: 1 }),
    brass: std({ color: 0xc8a050, metalness: 0.85, roughness: 0.3 }),
    white: std({ color: 0xdddddd, roughness: 0.4 }),
    shell: std({ color: 0xaa2a2a, map: T.poly, roughness: 0.6 }),
    black: std({ color: 0x111111, roughness: 0.8 }),
    watch: std({ color: 0xc8d0c0, metalness: 0.3, roughness: 0.2, emissive: 0x334433, emissiveIntensity: 0.3 }),
  };
}
let MATS = null;
export const MAT = new Proxy({}, { get: (_, k) => (MATS ||= makeMats())[k] });

// Texture coordinates in metres (×4: one texture tile per 25 cm), projected
// along the face normal so wood grain runs along the length of each part.
export function metricUV(geo, scale = 4) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!pos || !nor) return geo;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = z; v = x; } else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------
const mesh = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
};
// Box
export function B(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
}
// Rounded box (soft edges)
export function RB(parent, w, h, d, r, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  return mesh(parent, new RoundedBoxGeometry(w, h, d, 2, r), mat, x, y, z, rx, ry, rz);
}
// Cylinder along the Z axis
export function C(parent, r, len, mat, x, y, z, seg = 14, open = false, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, open);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, open ? mat.clone() : mat);
  if (open) m.material.side = THREE.DoubleSide;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
export function P(parent, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
// Side-profile extrusion: pts are [z, y] in model space; extruded `width`
// along X (centred on x) with softly bevelled edges.
export function EX(parent, pts, width, mat, x = 0, bevel = 0.002) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.001, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: 8 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  geo.computeVertexNormals();
  return mesh(parent, geo, mat, x, 0, 0);
}
// A line of small screws/rivets on a side face
function rivets(parent, side, pts, r = 0.0032) {
  for (const [z, y] of pts) {
    const g = new THREE.CylinderGeometry(r, r, 0.003, 10);
    g.rotateZ(Math.PI / 2);
    mesh(parent, g, MAT.steel, side, y, z);
  }
}

// ---------------------------------------------------------------------------
// Magazines (origin: top centre where the magazine seats)
// ---------------------------------------------------------------------------
// Curved AK magazine: an extruded banana with ribs, feed lips and base plate.
function akMag(len, mat) {
  const g = new THREE.Group();
  const steps = 10, front = [], back = [];
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * len, a = 0.08 + s * 1.7;
    // centreline: integrate the curve (down and gently forward)
    const cz = -(0.5 * 1.7 * s * s + 0.08 * s) * 0.55 - 0.002, cy = -s;
    const d = 0.07 - (i / steps) * 0.008;
    const nz = -Math.cos(a) * d / 2, ny = Math.sin(a) * d / 2;
    front.push([cz + nz, cy + ny]); back.push([cz - nz, cy - ny]);
  }
  EX(g, [...front, ...back.reverse()], 0.026, mat, 0, 0.0025);
  // reinforcing ribs on both sides along the curve
  for (const sx of [-1, 1]) for (let i = 1; i < 4; i++) {
    const s = (i / 4) * len, a = 0.08 + s * 1.7;
    const cz = -(0.5 * 1.7 * s * s + 0.08 * s) * 0.55;
    B(g, 0.003, 0.006, 0.052, mat, sx * 0.0135, -s, cz, a);
  }
  B(g, 0.022, 0.008, 0.06, MAT.dark, 0, -0.002, -0.004); // feed lips
  B(g, 0.012, 0.004, 0.03, MAT.brass, 0, 0.002, -0.006); // top round
  const sb = len, ab = 0.08 + sb * 1.7, bz = -(0.5 * 1.7 * sb * sb + 0.08 * sb) * 0.55;
  RB(g, 0.03, 0.01, 0.068, 0.003, MAT.dark, 0, -sb - 0.004, bz, ab); // base plate
  return g;
}
function boxMag(h, w, d, mat, ribs = 0) {
  const g = new THREE.Group();
  RB(g, w, h, d, 0.003, mat, 0, -h / 2, 0);
  for (let i = 0; i < ribs; i++) B(g, w + 0.002, 0.004, d * 0.6, MAT.dark, 0, -0.015 - i * (h - 0.03) / Math.max(1, ribs - 1), 0);
  RB(g, w + 0.006, 0.008, d + 0.008, 0.003, MAT.dark, 0, -h - 0.002, 0); // base
  B(g, w * 0.7, 0.004, d * 0.6, MAT.brass, 0, 0.001, 0);
  return g;
}
// Builds the magazine model for a magazine item key.
export function buildMag(key) {
  if (key === 'mag_ak30') return akMag(0.18, MAT.plum);
  if (key === 'mag_ak45') return akMag(0.25, MAT.plum);
  if (key === 'mag_pm') { const g = boxMag(0.09, 0.019, 0.03, MAT.blued); B(g, 0.004, 0.06, 0.012, MAT.black, 0.0105, -0.045, 0.004); return g; }
  if (key === 'mag_sks') return boxMag(0.07, 0.026, 0.065, MAT.metal, 3);
  return boxMag(0.08, 0.025, 0.05, MAT.dark);
}

// ---------------------------------------------------------------------------
// Hands and forearms
// ---------------------------------------------------------------------------
// A gloved hand: palm, four curled fingers, thumb, and a camo sleeve running
// back down out of view. `grip`: fingers wrap round a handle in front (the
// trigger hand); `support`: fingers wrap over the left side of a handguard.
export function hand(kind, sleeveDir, mirror = 1) {
  const H = new THREE.Group();
  const gl = MAT.glove;
  if (kind === 'grip') {
    RB(H, 0.04, 0.072, 0.052, 0.012, gl, 0, 0, 0.004); // palm behind the grip
    for (let i = 0; i < 4; i++) {
      const y = 0.022 - i * 0.017;
      RB(H, 0.036, 0.015, 0.02, 0.006, gl, -0.002, y, -0.03); // fingers round the front
      RB(H, 0.012, 0.014, 0.018, 0.005, gl, -0.02, y, -0.022);
    }
    RB(H, 0.016, 0.042, 0.016, 0.006, gl, -0.022, 0.03, 0.002, 0.2); // thumb along the side
    B(H, 0.012, 0.012, 0.03, gl, 0.018, 0.034, -0.022, 0.4); // trigger finger
  } else {
    RB(H, 0.056, 0.036, 0.08, 0.012, gl, 0, -0.006, 0);
    for (let i = 0; i < 4; i++) RB(H, 0.016, 0.044, 0.017, 0.006, gl, 0.026, 0.012, -0.03 + i * 0.019); // fingers over the top
    RB(H, 0.016, 0.03, 0.026, 0.006, gl, -0.03, 0.01, -0.01); // thumb
  }
  // Forearm: sleeve with a glove cuff and (left hand) a wristwatch
  const d = new THREE.Vector3(...sleeveDir).normalize();
  const arm = new THREE.Group();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  H.add(arm);
  // The view code keeps the forearm pointing this way in camera space (down
  // and back out of the screen), however the hand and gun are turned
  H.userData.arm = arm; H.userData.armDir = d.clone();
  RB(arm, 0.05, 0.05, 0.045, 0.012, MAT.glove, 0, 0, 0.04); // cuff
  RB(arm, 0.066, 0.066, 0.5, 0.02, MAT.sleeve, 0, 0, 0.31); // long enough to always run off screen
  if (mirror < 0) { RB(arm, 0.054, 0.012, 0.022, 0.004, MAT.leather, 0, 0.026, 0.075); C(arm, 0.011, 0.006, MAT.watch, 0, 0.034, 0.075, 16).rotation.x = Math.PI / 2; } // watch face up
  return H;
}

export function hands(g, right, left) {
  const R = hand('grip', [0.35, -0.85, 0.5], 1);
  R.position.set(...right.pos);
  R.rotation.x = right.rx || 0;
  g.add(R);
  const L = hand('support', [-0.45, -0.8, 0.45], -1);
  L.position.set(...left.pos);
  g.add(L);
  return { handR: R, handL: L };
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
export const BUILDERS = {
  ak74(g, w) {
    const parts = {};
    // Receiver: stamped steel with the trunnion step, rivets and the
    // magazine-well dimple
    EX(g, [[0.222, -0.04], [0.222, -0.098], [0.212, -0.104], [-0.02, -0.104], [-0.03, -0.1], [-0.085, -0.098], [-0.085, -0.042], [-0.075, -0.038], [0.215, -0.038]], 0.044, MAT.metal);
    for (const sx of [-1, 1]) {
      rivets(g, sx * 0.0225, [[0.17, -0.094], [0.13, -0.094], [-0.045, -0.092], [-0.065, -0.092], [0.19, -0.05]]);
      B(g, 0.002, 0.03, 0.05, MAT.dark, sx * 0.0222, -0.074, 0.02); // dimple
    }
    B(g, 0.002, 0.016, 0.07, MAT.black, 0.0225, -0.047, 0.07); // ejection port
    // Dust cover with ribs and the release button
    RB(g, 0.043, 0.017, 0.265, 0.007, MAT.metal, 0, -0.0305, 0.088);
    for (const z of [0.13, 0.16, 0.19]) B(g, 0.036, 0.002, 0.004, MAT.metal, 0, -0.0215, z);
    B(g, 0.012, 0.012, 0.01, MAT.dark, 0, -0.034, 0.226);
    // Rear sight (exact: the notch is the aiming reference)
    B(g, 0.03, 0.03, 0.05, MAT.metal, 0, -0.035, -0.005);
    B(g, 0.028, 0.006, 0.05, MAT.metal, 0, -0.017, -0.01);
    B(g, 0.008, 0.012, 0.006, MAT.metal, -0.008, -0.006, 0.0);
    B(g, 0.008, 0.012, 0.006, MAT.metal, 0.008, -0.006, 0.0);
    B(g, 0.004, 0.004, 0.012, MAT.steel, 0.016, -0.02, -0.02); // range slider
    // Front sight (exact)
    B(g, 0.026, 0.034, 0.03, MAT.metal, 0, -0.042, -0.4);
    B(g, 0.0035, 0.022, 0.004, MAT.metal, 0, -0.011, -0.4);
    B(g, 0.003, 0.028, 0.02, MAT.metal, -0.012, -0.012, -0.4);
    B(g, 0.003, 0.028, 0.02, MAT.metal, 0.012, -0.012, -0.4);
    C(g, 0.016, 0.034, MAT.metal, 0, -0.056, -0.4, 16);
    B(g, 0.012, 0.016, 0.02, MAT.dark, 0, -0.078, -0.39); // bayonet lug
    // Barrel, gas block and tube, cleaning rod
    C(g, 0.0095, 0.48, MAT.blued, 0, -0.056, -0.34);
    RB(g, 0.03, 0.034, 0.03, 0.006, MAT.metal, 0, -0.042, -0.33);
    C(g, 0.011, 0.22, MAT.metal, 0, -0.03, -0.2);
    C(g, 0.003, 0.27, MAT.steel, 0, -0.075, -0.43, 8);
    // Handguards (plum polymer) with vents and retaining bands
    RB(g, 0.042, 0.026, 0.17, 0.008, MAT.plum, 0, -0.03, -0.185);
    for (const z of [-0.14, -0.18, -0.22]) B(g, 0.03, 0.002, 0.014, MAT.black, 0, -0.0168, z);
    EX(g, [[-0.098, -0.058], [-0.288, -0.058], [-0.288, -0.096], [-0.278, -0.102], [-0.112, -0.106], [-0.098, -0.1]], 0.054, MAT.plum, 0, 0.004);
    for (const sx of [-1, 1]) for (const y of [-0.074, -0.086]) B(g, 0.002, 0.003, 0.15, MAT.black, sx * 0.0275, y, -0.193);
    B(g, 0.058, 0.052, 0.008, MAT.metal, 0, -0.08, -0.095);
    B(g, 0.058, 0.05, 0.008, MAT.metal, 0, -0.078, -0.292);
    // Pistol grip, trigger and guard
    EX(g, [[0.112, -0.104], [0.158, -0.104], [0.2, -0.188], [0.198, -0.197], [0.162, -0.2], [0.152, -0.194], [0.124, -0.132], [0.115, -0.118]], 0.03, MAT.plum, 0, 0.004);
    for (let i = 0; i < 4; i++) B(g, 0.031, 0.002, 0.012, MAT.black, 0, -0.13 - i * 0.016, 0.132 + i * 0.008, -0.35);
    B(g, 0.006, 0.005, 0.07, MAT.metal, 0, -0.124, 0.085);
    B(g, 0.006, 0.022, 0.005, MAT.metal, 0, -0.114, 0.05);
    RB(g, 0.005, 0.022, 0.006, 0.002, MAT.steel, 0, -0.113, 0.093, 0.3);
    // Polymer stock with a rubber butt pad
    EX(g, [[0.222, -0.045], [0.525, -0.06], [0.53, -0.064], [0.53, -0.162], [0.515, -0.166], [0.36, -0.112], [0.24, -0.1], [0.222, -0.098]], 0.042, MAT.polymer, 0, 0.004);
    RB(g, 0.044, 0.108, 0.014, 0.004, MAT.rubber, 0, -0.113, 0.536);
    for (let i = 0; i < 5; i++) B(g, 0.046, 0.003, 0.004, MAT.black, 0, -0.072 - i * 0.02, 0.543);
    B(g, 0.004, 0.02, 0.02, MAT.steel, -0.022, -0.115, 0.48); // sling swivel
    // Safety lever (right) and side rail (left)
    B(g, 0.003, 0.014, 0.1, MAT.metal, 0.0245, -0.052, 0.07);
    B(g, 0.003, 0.02, 0.012, MAT.metal, 0.0245, -0.064, 0.015, -0.4);
    B(g, 0.004, 0.018, 0.11, MAT.dark, -0.0245, -0.07, 0.085);
    if (!w.mods.muzzle) {
      C(g, 0.012, 0.085, MAT.metal, 0, -0.056, -0.615);
      for (const z of [-0.6, -0.625]) B(g, 0.026, 0.006, 0.01, MAT.black, 0, -0.056, z); // brake ports
    }
    // Bolt carrier and charging handle (right side)
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.03, 0.011, 0.012, MAT.steel, 0.035, -0.052, 0.1);
    C(parts.bolt, 0.008, 0.016, MAT.steel, 0.052, -0.052, 0.1, 12).rotation.set(0, Math.PI / 2, 0);
    B(parts.bolt, 0.006, 0.012, 0.06, MAT.steel, 0.022, -0.048, 0.07);
    g.add(parts.bolt);
    parts.boltHandle = [0.055, -0.052, 0.1];
    parts.magRoot = P(g, 0, -0.105, 0.02);
    parts.magKey = w.mag?.key;
    parts.magStyle = 'rock';
    parts.mag = w.mag ? buildMag(w.mag.key) : null;
    if (parts.mag) parts.magRoot.add(parts.mag);
    parts.eject = P(g, 0.03, -0.045, 0.06);
    parts.muzzleMount = [0, -0.056, -0.575];
    parts.gripMount = [0, -0.1, -0.22];
    Object.assign(parts, hands(g, { pos: [0, -0.14, 0.14], rx: -0.35 }, { pos: [-0.004, -0.095, -0.21] }));
    return parts;
  },

  pm(g, w) {
    const parts = {};
    // Slide with serrations and sights (the notch and blade are exact)
    parts.slide = new THREE.Group();
    RB(parts.slide, 0.026, 0.028, 0.16, 0.005, MAT.blued, 0, -0.017, -0.075);
    B(parts.slide, 0.007, 0.006, 0.006, MAT.blued, -0.0065, -0.003, 0.0);
    B(parts.slide, 0.007, 0.006, 0.006, MAT.blued, 0.0065, -0.003, 0.0);
    B(parts.slide, 0.003, 0.006, 0.008, MAT.blued, 0, -0.003, -0.148);
    for (let i = 0; i < 6; i++) B(parts.slide, 0.027, 0.02, 0.003, MAT.dark, 0, -0.018, -0.005 - i * 0.006);
    B(parts.slide, 0.002, 0.008, 0.016, MAT.black, 0.0132, -0.016, -0.06); // ejection port
    B(parts.slide, 0.004, 0.008, 0.012, MAT.steel, -0.014, -0.012, -0.012); // safety lever
    g.add(parts.slide);
    // Frame, barrel muzzle, trigger, guard and hammer
    RB(g, 0.024, 0.02, 0.13, 0.004, MAT.blued, 0, -0.04, -0.07);
    C(g, 0.0055, 0.006, MAT.black, 0, -0.018, -0.155, 10);
    EX(g, [[-0.03, -0.05], [0.0, -0.05], [0.004, -0.07], [-0.008, -0.078], [-0.04, -0.078], [-0.05, -0.068], [-0.048, -0.05]], 0.004, MAT.blued, 0, 0.001);
    RB(g, 0.004, 0.016, 0.006, 0.002, MAT.steel, 0, -0.06, -0.02, 0.25);
    RB(g, 0.009, 0.016, 0.012, 0.003, MAT.blued, 0, -0.011, 0.013);
    // Grip with Bakelite panels (star emblem)
    EX(g, [[-0.008, -0.05], [0.026, -0.05], [0.05, -0.134], [0.044, -0.142], [0.012, -0.144], [0.0, -0.134], [-0.012, -0.06]], 0.028, MAT.bakelite, 0, 0.003);
    for (const sx of [-1, 1]) C(g, 0.006, 0.002, MAT.dark, sx * 0.0145, -0.09, 0.022, 5).rotation.set(0, Math.PI / 2, 0);
    B(g, 0.01, 0.006, 0.012, MAT.steel, 0, -0.142, 0.04); // lanyard loop
    parts.magRoot = P(g, 0, -0.045, 0.022);
    parts.magKey = w.mag?.key;
    parts.magStyle = 'heel';
    parts.magRoot.rotation.x = -0.22;
    if (w.mag) { parts.mag = buildMag(w.mag.key); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.016, -0.012, -0.04);
    parts.muzzleMount = [0, -0.018, -0.155];
    // Two-handed pistol grip
    const R = hand('grip', [0.25, -0.9, 0.35], 1);
    R.position.set(0, -0.085, 0.02); R.rotation.x = -0.22;
    g.add(R);
    const L = hand('grip', [-0.3, -0.9, 0.3], -1);
    L.position.set(-0.014, -0.095, 0.008); L.rotation.set(-0.22, 0, -0.15);
    g.add(L);
    parts.handR = R; parts.handL = L;
    return parts;
  },

  mp133(g, w) {
    const parts = {};
    // Receiver, barrel with vent rib and bead, magazine tube
    EX(g, [[0.13, -0.012], [0.13, -0.082], [-0.09, -0.082], [-0.09, -0.012]], 0.046, MAT.blued, 0, 0.004);
    B(g, 0.002, 0.03, 0.07, MAT.black, 0.0232, -0.05, 0.0); // loading/ejection port
    C(g, 0.012, 0.58, MAT.blued, 0, -0.025, -0.38);
    B(g, 0.008, 0.004, 0.58, MAT.blued, 0, -0.011, -0.38);
    for (let i = 0; i < 18; i++) B(g, 0.004, 0.006, 0.004, MAT.blued, 0, -0.016, -0.12 - i * 0.03);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), MAT.white);
    bead.position.set(0, -0.0045, -0.665); g.add(bead);
    C(g, 0.011, 0.48, MAT.blued, 0, -0.052, -0.33);
    C(g, 0.013, 0.02, MAT.metal, 0, -0.052, -0.575); // tube cap
    // Walnut stock and wrist, trigger and guard
    EX(g, [[0.12, -0.03], [0.12, -0.085], [0.2, -0.1], [0.47, -0.13], [0.475, -0.135], [0.475, -0.21], [0.462, -0.215], [0.3, -0.16], [0.17, -0.14], [0.13, -0.11]], 0.042, MAT.woodRed, 0, 0.004);
    RB(g, 0.044, 0.08, 0.012, 0.004, MAT.rubber, 0, -0.175, 0.48);
    B(g, 0.006, 0.006, 0.07, MAT.metal, 0, -0.096, 0.06);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.088, 0.07, 0.3);
    // Pump with grip grooves (left hand rides it)
    parts.pump = new THREE.Group();
    RB(parts.pump, 0.05, 0.046, 0.2, 0.012, MAT.woodDark, 0, -0.05, -0.27);
    for (let i = 0; i < 7; i++) B(parts.pump, 0.052, 0.004, 0.006, MAT.black, 0, -0.07, -0.2 - i * 0.022);
    g.add(parts.pump);
    parts.port = P(g, 0, -0.085, 0.0);
    parts.eject = P(g, 0.026, -0.04, 0.0);
    parts.muzzleMount = null;
    parts.gripMount = [0, -0.085, -0.27];
    parts.gripParent = parts.pump;
    const h = hands(g, { pos: [0, -0.11, 0.13], rx: -0.3 }, { pos: [-0.004, -0.07, -0.27] });
    g.remove(h.handL); parts.pump.add(h.handL);
    Object.assign(parts, h);
    return parts;
  },

  sks(g, w) {
    const parts = {};
    // One-piece wooden stock: butt, wrist and fore-end
    EX(g, [[0.17, -0.072], [0.48, -0.08], [0.485, -0.086], [0.485, -0.19], [0.47, -0.196], [0.3, -0.142], [0.2, -0.132], [0.17, -0.112]], 0.046, MAT.wood, 0, 0.004);
    EX(g, [[0.17, -0.07], [0.17, -0.12], [0.1, -0.122], [0.0, -0.118], [-0.33, -0.102], [-0.345, -0.088], [-0.335, -0.066], [0.0, -0.074]], 0.05, MAT.wood, 0, 0.004);
    RB(g, 0.046, 0.108, 0.01, 0.003, MAT.metal, 0, -0.138, 0.489); // butt plate
    // Receiver and bolt cover
    RB(g, 0.04, 0.058, 0.22, 0.006, MAT.blued, 0, -0.064, 0.06);
    RB(g, 0.034, 0.018, 0.16, 0.007, MAT.blued, 0, -0.034, 0.1);
    B(g, 0.002, 0.016, 0.06, MAT.black, 0.0202, -0.052, 0.08);
    // Upper handguard, gas tube, barrel
    RB(g, 0.04, 0.024, 0.2, 0.008, MAT.wood, 0, -0.034, -0.2);
    C(g, 0.009, 0.5, MAT.blued, 0, -0.054, -0.37);
    for (const z of [-0.1, -0.31]) B(g, 0.054, 0.05, 0.008, MAT.metal, 0, -0.08, z); // bands
    // Sights (exact)
    B(g, 0.03, 0.03, 0.05, MAT.metal, 0, -0.035, -0.005);
    B(g, 0.028, 0.006, 0.05, MAT.metal, 0, -0.017, -0.01);
    B(g, 0.008, 0.012, 0.006, MAT.metal, -0.008, -0.006, 0.0);
    B(g, 0.008, 0.012, 0.006, MAT.metal, 0.008, -0.006, 0.0);
    B(g, 0.02, 0.03, 0.03, MAT.metal, 0, -0.045, -0.56);
    B(g, 0.0035, 0.02, 0.004, MAT.metal, 0, -0.01, -0.56);
    B(g, 0.003, 0.026, 0.016, MAT.metal, -0.011, -0.012, -0.56);
    B(g, 0.003, 0.026, 0.016, MAT.metal, 0.011, -0.012, -0.56);
    // Folded bayonet under the barrel
    B(g, 0.008, 0.016, 0.2, MAT.steel, 0, -0.075, -0.45);
    RB(g, 0.016, 0.022, 0.04, 0.004, MAT.metal, 0, -0.075, -0.33);
    // Trigger and guard, sling swivels
    B(g, 0.006, 0.006, 0.07, MAT.metal, 0, -0.125, 0.09);
    B(g, 0.006, 0.02, 0.005, MAT.metal, 0, -0.115, 0.055);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.112, 0.1, 0.3);
    B(g, 0.004, 0.02, 0.02, MAT.steel, -0.024, -0.17, 0.4);
    // Bolt carrier with its handle (right side)
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.032, 0.011, 0.014, MAT.steel, 0.034, -0.05, 0.12);
    C(parts.bolt, 0.009, 0.016, MAT.steel, 0.052, -0.05, 0.12, 12).rotation.set(0, Math.PI / 2, 0);
    g.add(parts.bolt);
    parts.boltHandle = [0.056, -0.05, 0.12];
    parts.magRoot = P(g, 0, -0.12, 0.05);
    parts.magKey = w.mag?.key;
    parts.magStyle = 'box';
    if (w.mag) { parts.mag = buildMag(w.mag.key); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.025, -0.04, 0.07);
    parts.muzzleMount = [0, -0.054, -0.62];
    Object.assign(parts, hands(g, { pos: [0, -0.13, 0.15], rx: -0.4 }, { pos: [-0.004, -0.1, -0.22] }));
    return parts;
  },
};

// Shotgun shell held in the hand while loading
export function shellModel() {
  const g = new THREE.Group();
  C(g, 0.0095, 0.05, MAT.shell, 0, 0, -0.005, 12);
  C(g, 0.0102, 0.014, MAT.brass, 0, 0, 0.022, 12);
  return g;
}
