// The zombies' bodies: sculpted, not boxes. Each part (torso, head, upper
// arm, forearm and hand, thigh, shin and foot) is built here from rings of
// points pushed and pulled into shape (ribs and a spine showing through a
// starved torso, sunken eye sockets, cheekbones, a slack jaw and teeth,
// knuckles and clawed fingers), marked by region (skin, shirt, trousers,
// flesh, bone, hair, shoes) and tinted (bruises, grime, blood, veins). The
// colours of skin and clothes come per zombie; a shader adds the fine detail
// (pores and wrinkles, cloth weave, wet blood). Two levels of detail: the
// full model close up, a lighter one further off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Regions (what colour a vertex takes)
export const R = { SKIN: 0, TOP: 1, BOT: 2, DARK: 3, BONE: 4, FLESH: 5, HAIR: 6, SHOE: 7, NAIL: 8 };

// ---------- noise (deterministic, so every build is the same) ----------
function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi, s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), L(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
    L(L(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), L(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.03, y * 2.03, z * 2.03) * 0.3 + vnoise(x * 4.1, y * 4.1, z * 4.1) * 0.15;
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));
const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
// piecewise-smooth profile through keyframes [[v, value], ...]
const prof = (keys) => (v) => {
  if (v <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (v <= keys[i][0]) { const [v0, a] = keys[i - 1], [v1, b] = keys[i], t = (v - v0) / (v1 - v0), s = t * t * (3 - 2 * t); return a + (b - a) * s; }
  }
  return keys[keys.length - 1][1];
};

// ---------- the building block: a ring-by-ring shape round an axis ----------
// axis 'y' (rings round y, angle 0 facing +z) or 'z' (round z, angle 0 facing
// +y); from..to along it, n rings of seg points. f(v, a) gives the ring there:
// { rx, rr (the radius across, and along the facing), ox, oy/oz (centre
// offset), and per point: d (pushed out along its radius), reg, tint, keep }
function lathe(axis, from, to, n, seg, f) {
  const pos = [], col = [], reg = [], idx = [];
  const keep = [];
  for (let i = 0; i <= n; i++) {
    const v = i / n, t = from + (to - from) * v;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2 - Math.PI; // -pi..pi, 0 at the front
      const r = f(v, a);
      const s = Math.sin(a), c = Math.cos(a), d = r.d || 0;
      const ex = s * (r.rx + d), ec = c * (r.rr + d);
      if (axis === 'y') pos.push((r.ox || 0) + ex, t, (r.oz || 0) + ec);
      else pos.push((r.ox || 0) + ex, (r.oy || 0) + ec, t);
      const tint = r.tint || [1, 1, 1];
      col.push(tint[0], tint[1], tint[2]);
      reg.push(r.reg ?? R.SKIN);
      keep.push(r.keep !== false);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      if (!(keep[a] && keep[b] && keep[c] && keep[d])) continue;
      // (wound the right way round for each axis, so the outside faces out)
      if (axis === 'y' ? to > from : to < from) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  return build(pos, col, reg, idx);
}
function build(pos, col, reg, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('region', new THREE.Float32BufferAttribute(reg, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a rounded lump (an ear, a knuckle, a tooth, a shoe): a squashed sphere
function blob(cx, cy, cz, rx, ry, rz, seg, reg, tint, flatBelow) {
  const g = lathe('y', cy - ry, cy + ry, Math.max(3, seg >> 1), seg, (v) => {
    const k = Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2));
    return { rx: rx * k + 1e-4, rr: rz * k + 1e-4, ox: cx, oz: cz, reg, tint };
  });
  if (flatBelow != null) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < flatBelow) p.setY(i, flatBelow); g.computeVertexNormals(); }
  return g;
}
// a small tube along +z, then placed: (a finger joint, a tendon)
function stick(len, r0, r1, seg, reg, tint, m) {
  const g = lathe('z', 0, len, 3, seg, (v) => { const cap = Math.sqrt(Math.min(1, v * 6, (1 - v) * 6) || 0); const r = (r0 + (r1 - r0) * v) * (0.35 + 0.65 * cap); return { rx: r, rr: r, reg: typeof reg === 'function' ? reg(v) : reg, tint }; });
  return m ? g.applyMatrix4(m) : g;
}
const M4 = () => new THREE.Matrix4();
const lv = (L, a, b, c) => (L === 2 ? c : L ? b : a); // (by level of detail)
// a rag: a thin strip of cloth hanging from (x, y, z), swung out a little
function rag(x, y, z, w, len, out, reg, seed) {
  const g = new THREE.BoxGeometry(w, len, 0.004, 1, 3, 1).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = -p.getY(i) / len; p.setX(i, p.getX(i) * (1 - 0.5 * t) + Math.sin(t * 3 + seed) * 0.006); } // (tapering, a twist)
  g.applyMatrix4(M4().makeTranslation(x, y, z).multiply(M4().makeRotationY(Math.atan2(x, z))).multiply(M4().makeRotationX(-out)));
  const n = p.count, col = [], rg = [], d = 0.55 + hash(seed, 2, 3) * 0.35;
  for (let i = 0; i < n; i++) { col.push(d, d * 0.97, d * 0.93); rg.push(reg); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('region', new THREE.Float32BufferAttribute(rg, 1));
  const idx = []; for (let i = 0; i < n; i++) idx.push(i);
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const merge = (gs) => { const m = mergeGeometries(gs.filter(Boolean)); m.computeBoundingSphere(); return m; };

// Skin tint: blotchy, bruised, veined, grimy
function skinTint(x, y, z, k = 1) {
  const n = fbm(x * 9, y * 9, z * 9), b = fbm(x * 3.1 + 7, y * 3.1, z * 3.1 + 2);
  let r = 0.86 + n * 0.28, g = 0.86 + n * 0.26, bl = 0.84 + n * 0.3;
  if (b > 0.58) { const s = Math.min(1, (b - 0.58) * 4) * k; r *= 1 - 0.35 * s; g *= 1 - 0.45 * s; bl *= 1 - 0.15 * s; } // bruising, purple-grey
  const vein = Math.abs(vnoise(x * 26, y * 14, z * 26) - 0.5) < 0.025 ? 0.82 : 1;
  return [r * vein, g * vein, bl * (vein < 1 ? 0.95 : 1)];
}
// Cloth tint: dirt, sweat, blood soaked in
function clothTint(x, y, z) {
  const n = fbm(x * 6 + 3, y * 6, z * 6), blood = fbm(x * 2.2 + 11, y * 2.2, z * 2.2 + 5);
  const d = 0.82 + n * 0.32;
  if (blood > 0.6) { const s = Math.min(1, (blood - 0.6) * 3.5); return [d * (1 - 0.35 * s) + 0.25 * s, d * (1 - 0.75 * s), d * (1 - 0.72 * s)]; }
  return [d, d * 0.98, d * 0.95];
}

// ---------- the parts ----------
// Torso: hips to shoulders, centred on its middle (as the old box was): a
// starved body in a torn shirt over the top of a pair of trousers
function torso(L) {
  const seg = lv(L, 26, 12, 7), n = lv(L, 26, 9, 5);
  const RX = prof([[0, 0.05], [0.05, 0.16], [0.08, 0.165], [0.18, 0.168], [0.36, 0.148], [0.58, 0.178], [0.76, 0.19], [0.84, 0.232], [0.9, 0.205], [0.95, 0.12], [0.985, 0.07], [1, 0.06]]);
  const RZ = prof([[0, 0.04], [0.05, 0.112], [0.08, 0.118], [0.2, 0.118], [0.36, 0.1], [0.58, 0.122], [0.76, 0.128], [0.84, 0.112], [0.9, 0.1], [0.95, 0.08], [0.985, 0.068], [1, 0.062]]);
  const g = lathe('y', -0.36, 0.35, n, seg, (v, a) => {
    const y = -0.36 + v * 0.71, s = Math.sin(a), c = Math.cos(a);
    let rx = RX(v), rr = RZ(v) * (c > 0 ? 0.94 : 1.06);
    const oz = 0.02 * v * v; // (hunched: the shoulders come forward)
    let d = 0, reg = R.TOP;
    const px = s * rx, pz = c * rr + oz;
    // the shirt: ragged at the hem, torn through in places
    const hem = 0.13 + 0.07 * fbm(a * 2.2 + 3, 1, 2), tear = fbm(px * 7 + 5, y * 7, pz * 7);
    const skin = v < hem ? false : tear > 0.66 || v > 0.95 || (v > 0.86 && Math.abs(angD(a, 0)) < 0.45); // (and open at the neck)
    if (v < hem) reg = R.BOT;                     // trousers at the waist
    else if (skin) { reg = R.SKIN; d -= 0.006; }  // through the holes: skin, sunk below the cloth
    else d += 0.004 + 0.004 * fbm(px * 14, y * 14, pz * 14); // (cloth: rumpled)
    if (reg === R.SKIN || L) {
      // ribs on the sides and front, the spine down the back, collarbones
      if (v > 0.42 && v < 0.78 && Math.abs(s) > 0.25) d += 0.007 * Math.max(0, Math.sin((v - 0.42) * 62)) * Math.abs(s);
      d += 0.012 * gauss(angD(a, Math.PI), 0.16) * (v > 0.25 && v < 0.9 ? 1 : 0);
      if (v > 0.83 && v < 0.91 && c > 0.3) d += 0.008 * Math.abs(s);
      if (v > 0.25 && v < 0.45 && c > 0.4) d -= 0.012; // a sunken belly
    }
    // a bite: torn open low on the left side
    const bite = gauss(angD(a, 0.9), 0.22) * gauss(v - 0.5, 0.06);
    if (bite > 0.45 && reg !== R.BOT) { reg = R.FLESH; d -= 0.01 * bite; }
    const tint = reg === R.TOP || reg === R.BOT ? clothTint(px, y, pz) : skinTint(px, y, pz);
    if (reg === R.TOP && v > hem && v < hem + 0.025) { tint[0] *= 0.6; tint[1] *= 0.6; tint[2] *= 0.6; } // (a frayed, dirty edge)
    return { rx, rr, oz, d, reg, tint };
  });
  if (L) return g;
  const parts = [g];
  for (let i = 0; i < 8; i++) {
    const a = -2.6 + i * 0.72 + hash(i, 5, 1) * 0.3, v = 0.15 + 0.06 * hash(i, 1, 9), y = -0.36 + v * 0.73;
    const rx = RX(v) + 0.006, rr = RZ(v) * (Math.cos(a) > 0 ? 0.94 : 1.06) + 0.006;
    parts.push(rag(Math.sin(a) * rx, y, Math.cos(a) * rr + 0.02 * v * v, 0.025 + hash(i, 3, 3) * 0.025, 0.05 + hash(i, 7, 2) * 0.09, 0.12, R.TOP, i));
  }
  return merge(parts);
}

// Head: neck to crown, centred where the old box was
function head(L) {
  const seg = lv(L, 30, 12, 7), n = lv(L, 30, 9, 5);
  const Y0 = -0.21, Y1 = 0.172;
  const RX = prof([[0, 0.052], [0.18, 0.055], [0.26, 0.07], [0.36, 0.085], [0.46, 0.098], [0.6, 0.104], [0.72, 0.108], [0.84, 0.098], [0.94, 0.066], [1, 0.001]]);
  const RZ = prof([[0, 0.058], [0.18, 0.06], [0.26, 0.085], [0.36, 0.104], [0.46, 0.112], [0.6, 0.118], [0.72, 0.122], [0.84, 0.11], [0.94, 0.072], [1, 0.001]]);
  const OZ = prof([[0, -0.012], [0.22, -0.01], [0.32, 0.008], [0.5, 0.004], [1, -0.006]]);
  const skull = lathe('y', Y0, Y1, n, seg, (v, a) => {
    const y = Y0 + v * (Y1 - Y0), s = Math.sin(a), c = Math.cos(a);
    const rx = RX(v), rr = RZ(v) * (c > 0 ? 0.93 : 1.08), oz = OZ(v);
    let d = 0, reg = R.SKIN;
    const front = c > 0;
    if (front && !L) {
      // eye sockets, sunk deep
      const eye = gauss(Math.abs(a) - 0.42, 0.15) * gauss(y - 0.043, 0.017);
      d -= 0.024 * eye;
      if (eye > 0.6) reg = R.DARK;
      // brow ridge; cheekbones; hollow cheeks
      d += 0.009 * gauss(y - 0.072, 0.009) * (Math.abs(a) < 0.75 ? 1 : 0);
      d += 0.011 * gauss(Math.abs(a) - 0.72, 0.14) * gauss(y - 0.018, 0.014);
      d -= 0.013 * gauss(Math.abs(a) - 0.62, 0.16) * gauss(y + 0.022, 0.016);
      // the nose (half rotted away), nostrils
      d += 0.026 * gauss(a, 0.075) * gauss(y - 0.012, 0.022) * (y > -0.012 ? 1 : 0.3);
      if (gauss(a, 0.1) * gauss(y - 0.0, 0.006) > 0.55) reg = R.DARK;
      if (gauss(a - 0.06, 0.05) * gauss(y - 0.02, 0.012) > 0.6) reg = R.FLESH;
      // the mouth, hanging open: lips torn back from the teeth
      const mouth = gauss(a, 0.3) * gauss(y + 0.04, 0.016);
      d -= 0.022 * mouth;
      if (mouth > 0.55) reg = R.DARK; else if (mouth > 0.32) reg = R.FLESH;
      // chin, jaw line
      d += 0.006 * gauss(a, 0.25) * gauss(y + 0.085, 0.012);
    }
    if (L && front) {
      // (lighter: just the sockets, deep enough for the eyes to show, and the mouth)
      const eye = gauss(Math.abs(a) - 0.42, 0.25) * gauss(y - 0.043, 0.022);
      d -= 0.03 * eye;
      if (eye > 0.45) reg = R.DARK;
      if (gauss(a, 0.3) * gauss(y + 0.04, 0.02) > 0.5) { reg = R.DARK; d -= 0.01; }
    }
    // a wound on the scalp; hair, patchy and matted
    const px = s * rx, pz = c * rr + oz;
    if (y > 0.06 && (c < 0.55 || y > 0.12)) {
      const h = fbm(px * 22 + 4, y * 22, pz * 22);
      if (h > 0.53) { reg = R.HAIR; d += 0.004; }
    }
    if (gauss(angD(a, -2.3), 0.25) * gauss(y - 0.11, 0.025) > 0.5) { reg = R.FLESH; d -= 0.004; }
    // neck: a bite out of the side, tendons standing out
    if (y < -0.11) {
      if (gauss(angD(a, 1.15), 0.3) * gauss(y + 0.16, 0.03) > 0.5) { reg = R.FLESH; d -= 0.008; }
      d += 0.005 * (gauss(angD(a, 0.55), 0.1) + gauss(angD(a, -0.55), 0.1));
    }
    const tint = reg === R.SKIN ? skinTint(px, y, pz, 1.2) : reg === R.HAIR ? [0.8 + fbm(px * 40, y * 40, pz * 40) * 0.4, 0.8, 0.8] : [1, 1, 1];
    return { rx, rr, oz, d, reg, tint };
  });
  if (L) return skull;
  const parts = [skull];
  // ears
  for (const sx of [-1, 1]) parts.push(blob(sx * 0.103, 0.03, -0.012, 0.013, 0.032, 0.024, 8, R.SKIN, [0.85, 0.82, 0.82]));
  // teeth: yellowed, uneven, two rows behind the torn lips
  for (const [ty, row] of [[-0.031, 0], [-0.05, 1]]) {
    for (let i = -4; i <= 4; i++) {
      if (hash(i, row, 3) < 0.18) continue; // (some gone)
      const a = i * 0.075, rad = 0.093 - Math.abs(i) * 0.002;
      const h = 0.011 + hash(i, row, 7) * 0.006;
      parts.push(blob(Math.sin(a) * rad, ty + (row ? 0.003 : -0.003), Math.cos(a) * rad + 0.002, 0.0055, h, 0.004, 6, R.BONE, [0.95 - hash(i, row, 9) * 0.25, 0.9 - hash(i, row, 9) * 0.25, 0.7]));
    }
  }
  // a tongue, dark, down in the mouth
  parts.push(blob(0, -0.052, 0.06, 0.03, 0.008, 0.035, 8, R.FLESH, [0.6, 0.55, 0.55]));
  return merge(parts);
}

// Upper arm: shoulder to elbow along +z (as the old arm box ran), in a torn sleeve
export const ELBOW = 0.28;
function upperArm(L) {
  const seg = lv(L, 16, 8, 5), n = lv(L, 16, 6, 3);
  const RA = prof([[0, 0.022], [0.07, 0.056], [0.12, 0.06], [0.3, 0.056], [0.55, 0.05], [0.88, 0.042], [1, 0.034]]);
  const arm = lathe('z', -0.03, ELBOW + 0.02, n, seg, (v, a) => {
    const z = -0.03 + v * (ELBOW + 0.05), s = Math.sin(a), c = Math.cos(a);
    let r = RA(v);
    if (!L) r += 0.006 * gauss(v - 0.35, 0.12) * Math.max(0, c); // (biceps, what's left of it)
    const sleeve = 0.45 + 0.2 * fbm(a * 1.6 + 2, 5, 1);
    const cloth = v < sleeve && fbm(s * 4 + 9, z * 9, c * 4) < 0.68;
    const reg = cloth ? R.TOP : R.SKIN;
    const d = cloth ? 0.006 : 0;
    const tint = cloth ? clothTint(s * r, z, c * r) : skinTint(s * r + 1, z, c * r);
    return { rx: r * 0.95, rr: r, d, reg, tint };
  });
  if (L) return arm;
  const parts = [arm];
  for (let i = 0; i < 3; i++) {
    const a = -1 + i * 1.3, z = ELBOW * 0.5;
    const m = M4().makeTranslation(Math.sin(a) * 0.058, Math.cos(a) * 0.06, z).multiply(M4().makeRotationX(-Math.PI / 2));
    const r = rag(0, 0, 0, 0.02, 0.04 + hash(i, 4, 4) * 0.05, 0, R.TOP, i + 20);
    parts.push(r.applyMatrix4(m));
  }
  return merge(parts);
}
// Forearm and hand: elbow to fingertips along +z. The hand's a claw: four
// crooked fingers and a thumb under them, black nails
export const HAND = 0.235;
function forearm(L) {
  const seg = lv(L, 14, 8, 5), n = lv(L, 14, 6, 3);
  const RF = prof([[0, 0.02], [0.08, 0.042], [0.14, 0.045], [0.35, 0.042], [0.8, 0.032], [1, 0.03]]);
  const arm = lathe('z', -0.02, HAND, n, seg, (v, a) => {
    const z = -0.02 + v * (HAND + 0.02), s = Math.sin(a), c = Math.cos(a);
    const r = RF(v);
    let d = 0, reg = R.SKIN;
    // scratches and a gash; veins standing out along the inside
    if (gauss(angD(a, 2.2), 0.3) * gauss(v - 0.45, 0.08) > 0.5) { reg = R.FLESH; d -= 0.004; }
    if (!L) d += 0.0025 * Math.max(0, 1 - Math.abs(vnoise(s * 3, z * 18, c * 3) - 0.5) * 30);
    return { rx: r, rr: r * 0.85, d, reg, tint: skinTint(s * r + 2, z, c * r) };
  });
  if (L === 2) return arm; // (far off: no hand to speak of)
  const parts = [arm];
  // the hand: a flattened palm, knuckles
  parts.push(lathe('z', HAND - 0.01, HAND + 0.075, lv(L, 6, 3, 2), lv(L, 12, 8, 5), (v) => {
    const k = Math.sqrt(Math.max(0.05, 1 - (2 * v - 1) ** 4));
    return { rx: (0.03 + 0.012 * v) * k, rr: 0.014 * k + 0.002, reg: R.SKIN, tint: skinTint(v, 2, 3) };
  }));
  if (L) {
    parts.push(blob(0, -0.01, HAND + 0.1, 0.034, 0.012, 0.03, lv(L, 8, 8, 5), R.SKIN, [0.9, 0.88, 0.88]));
    return merge(parts);
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.027 + i * 0.018, len = [0.032, 0.036, 0.034, 0.028][i], curl = 0.5 + hash(i, 1, 1) * 0.5;
    const m1 = M4().makeTranslation(x, 0, HAND + 0.07).multiply(M4().makeRotationX(curl * 0.6));
    parts.push(stick(len, 0.0075, 0.0068, 6, R.SKIN, [0.88, 0.85, 0.86], m1));
    const tip = new THREE.Vector3(0, 0, len).applyMatrix4(m1);
    const m2 = M4().makeTranslation(tip.x, tip.y, tip.z).multiply(M4().makeRotationX(curl * 0.6 + 0.7));
    parts.push(stick(len * 0.85, 0.0066, 0.004, 6, (v) => (v > 0.7 ? R.NAIL : R.SKIN), [0.85, 0.8, 0.8], m2));
    parts.push(blob(x, 0.006, HAND + 0.07, 0.008, 0.006, 0.008, 6, R.SKIN, [0.8, 0.76, 0.76])); // knuckle
  }
  const mt = M4().makeTranslation(0.0, -0.012, HAND + 0.02).multiply(M4().makeRotationX(0.55));
  parts.push(stick(0.045, 0.009, 0.006, 6, (v) => (v > 0.75 ? R.NAIL : R.SKIN), [0.88, 0.85, 0.85], mt));
  return merge(parts);
}
// Thigh: hip to knee, down -y; trousers, torn
export const KNEE = 0.42;
function thigh(L) {
  const seg = lv(L, 16, 8, 5), n = lv(L, 16, 6, 3);
  const RT = prof([[0, 0.04], [0.06, 0.08], [0.12, 0.084], [0.4, 0.078], [0.85, 0.06], [1, 0.054]]);
  return lathe('y', 0.03, -KNEE - 0.02, n, seg, (v, a) => {
    const y = 0.03 - v * (KNEE + 0.05), s = Math.sin(a), c = Math.cos(a);
    const r = RT(v);
    const tear = fbm(s * 5 + 3, y * 8, c * 5) > 0.7;
    const reg = tear ? R.SKIN : R.BOT;
    const d = tear ? -0.004 : 0.003 + (L ? 0 : 0.004 * fbm(s * 9, y * 16, c * 9));
    return { rx: r, rr: r * (c > 0 ? 1.05 : 0.98), d, reg, tint: tear ? skinTint(s, y, c) : clothTint(s * r, y, c * r) };
  });
}
// Shin and foot: knee to the ground, down -y, ending in a worn shoe
export const SHIN = 0.36;
function shin(L) {
  const seg = lv(L, 16, 8, 5), n = lv(L, 16, 6, 3);
  const RS = prof([[0, 0.03], [0.06, 0.052], [0.14, 0.056], [0.3, 0.058], [0.75, 0.042], [1, 0.036]]);
  const leg = lathe('y', 0.02, -SHIN, n, seg, (v, a) => {
    const y = 0.02 - v * (SHIN + 0.02), s = Math.sin(a), c = Math.cos(a);
    const calf = 0.012 * gauss(v - 0.3, 0.12) * Math.max(0, -c); // (the calf, at the back)
    const hem = 0.78 + 0.12 * fbm(a * 2 + 5, 1, 1);
    const reg = v > hem ? R.SKIN : R.BOT;
    const d = reg === R.BOT ? 0.004 : 0;
    const r = RS(v);
    return { rx: r, rr: r + calf, d, reg, tint: reg === R.BOT ? clothTint(s, y + 1, c) : skinTint(s, y, c) };
  });
  // the shoe: toe forward, flat sole on the ground
  const shoe = blob(0, -SHIN - 0.022, 0.045, 0.048, 0.04, 0.115, lv(L, 14, 8, 6), R.SHOE, [0.9, 0.88, 0.86], -SHIN - 0.04);
  return merge([leg, shoe]);
}

// A plate carrier: front and back plates, a cummerbund, three mag pouches
export function vestGeometry() {
  const RX = prof([[0, 0.17], [0.4, 0.18], [0.8, 0.2], [1, 0.19]]), RZ = prof([[0, 0.125], [0.5, 0.135], [1, 0.13]]);
  const parts = [lathe('y', -0.17, 0.22, 6, 20, (v, a) => ({ rx: RX(v) + 0.025, rr: RZ(v) * (Math.cos(a) > 0 ? 0.96 : 1.04) + 0.03 + (Math.abs(Math.sin(a)) < 0.7 ? 0.012 : 0), oz: 0.012 })),];
  for (let i = -1; i <= 1; i++) parts.push(blob(i * 0.06, -0.09, 0.185, 0.026, 0.05, 0.022, 8, 0, null, -0.13));
  const g = merge(parts.map((p) => { p.deleteAttribute('color'); p.deleteAttribute('region'); return p; }));
  return g;
}

// ---------- materials ----------
// Instanced (the horde): each zombie's skin, shirt and trouser colours come in
// three instance attributes. Otherwise (a body on the ground) as uniforms.
function patch(mat, instanced) {
  mat.onBeforeCompile = (sh) => {
    if (!instanced) { sh.uniforms.zSkin = mat.userData.zSkin; sh.uniforms.zTop = mat.userData.zTop; sh.uniforms.zBot = mat.userData.zBot; }
    sh.vertexShader = (instanced ? 'attribute vec3 iSkin; attribute vec3 iTop; attribute vec3 iBot;\n' : 'uniform vec3 zSkin; uniform vec3 zTop; uniform vec3 zBot;\n')
      + 'attribute float region; varying vec3 zCol; varying float zReg; varying vec3 zOP;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  zOP = position; zReg = region;
  ${instanced ? 'vec3 sk = iSkin, tp = iTop, bt = iBot;' : 'vec3 sk = zSkin, tp = zTop, bt = zBot;'}
  int r = int(region + 0.5);
  zCol = r == 0 ? sk : r == 1 ? tp : r == 2 ? bt : r == 3 ? vec3(0.035, 0.012, 0.01) : r == 4 ? vec3(0.62, 0.55, 0.38)
    : r == 5 ? vec3(0.34, 0.05, 0.04) : r == 6 ? sk * 0.22 + vec3(0.03, 0.02, 0.01) : r == 7 ? vec3(0.085, 0.075, 0.065) : vec3(0.06, 0.05, 0.04);`);
    sh.fragmentShader = 'varying vec3 zCol; varying float zReg; varying vec3 zOP;\n' + `
float zh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); } // (no sin: cheaper)
float zn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(zh(i), zh(i + vec3(1,0,0)), f.x), mix(zh(i + vec3(0,1,0)), zh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(zh(i + vec3(0,0,1)), zh(i + vec3(1,0,1)), f.x), mix(zh(i + vec3(0,1,1)), zh(i + vec3(1,1,1)), f.x), f.y), f.z); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb *= zCol;
  // fine mottling of the skin, grime ground into cloth
  // (the finer octave only close up, where it shows)
  float zclose = clamp(1.6 - length(fwidth(zOP)) * 300.0, 0.0, 1.0);
  float zm = zn(zOP * 60.0);
  if (zclose > 0.0) zm = mix(zm, zm * 0.5 + zn(zOP * 150.0) * 0.5, zclose);
  diffuseColor.rgb *= 0.86 + 0.28 * zm;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  // wet: blood and raw flesh, the mouth; dry: skin and cloth
  roughnessFactor = (zReg > 2.5 && zReg < 5.5) ? 0.32 + 0.2 * zm : zReg > 0.5 && zReg < 2.5 ? 0.97 : 0.78 - 0.18 * zm;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  float fade = clamp(1.5 - length(fwidth(zOP)) * 900.0, 0.0, 1.0); // (gone before it would shimmer)
  if (fade > 0.0) {
    // fine relief: pores and wrinkles in the skin, the weave of the cloth (close up only)
    float k = (zReg > 0.5 && zReg < 2.5) ? 1.0 : 0.0;
    float hgt = mix(zn(zOP * 140.0) * 0.6 + zn(zOP * 340.0) * 0.4, abs(sin(zOP.y * 700.0)) * 0.5 + abs(sin((zOP.x + zOP.z) * 700.0)) * 0.5, k) * 0.0009 * fade;
    vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
    normal = normalize(abs(det) * normal - grad);
  }`);
  };
  mat.customProgramCacheKey = () => (instanced ? 'zombie-i' : 'zombie-u');
  return mat;
}
export function crowdMaterial() {
  return patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), true);
}
// for one body (a corpse, a severed leg): its own colours
export function bodyMaterial(skin, top, bottom) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  m.userData.zSkin = { value: new THREE.Color(skin) }; m.userData.zTop = { value: new THREE.Color(top) }; m.userData.zBot = { value: new THREE.Color(bottom) };
  return patch(m, false);
}

// ---------- the sets ----------
let cache = null;
// { torso, head, uarm, farm, thigh, shin } for LOD 0 (close), 1 (further) and 2 (far)
export function zombieParts() {
  if (cache) return cache;
  cache = [0, 1, 2].map((L) => ({ torso: torso(L), head: head(L), uarm: upperArm(L), farm: forearm(L), thigh: thigh(L), shin: shin(L) }));
  return cache;
}
// Eyes: where they sit in the head (left, right), and their glint
export const EYE_POS = [[-0.043, 0.044, 0.084], [0.043, 0.044, 0.084]];
export const eyeGeo = new THREE.OctahedronGeometry(0.0125, 0); // (a glint: eight triangles are plenty)

// The parts laid along +y and centred, as a body on the ground (the ragdoll)
// draws its limbs: upper arm, forearm, thigh, shin; and the torso, head
let rcache = null;
export function ragdollParts() {
  if (rcache) return rcache;
  const P = zombieParts()[0];
  const alongY = (g, axis, len) => {
    const c = g.clone();
    if (axis === 'z') c.applyMatrix4(M4().makeRotationX(-Math.PI / 2)); // +z down the limb becomes +y
    else c.applyMatrix4(M4().makeRotationZ(Math.PI)); // -y down the limb becomes +y
    c.translate(0, -len / 2, 0);
    return c;
  };
  rcache = {
    uarm: alongY(P.uarm, 'z', ELBOW), farm: alongY(P.farm, 'z', HAND + 0.03),
    thigh: alongY(P.thigh, 'y', KNEE), shin: alongY(P.shin, 'y', SHIN),
    torso: P.torso, head: P.head,
  };
  for (const g of Object.values(rcache)) g.userData.shared = true; // (bodies share them: never disposed)
  return rcache;
}
// A leg, thigh and shin together, lying along +z (a severed one)
let lcache = null;
export function legProp() {
  if (lcache) return lcache;
  const P = zombieParts()[0];
  const sh = P.shin.clone().translate(0, -KNEE, 0);
  const g = mergeGeometries([P.thigh.clone(), sh]);
  g.applyMatrix4(M4().makeRotationX(-Math.PI / 2));
  g.translate(0, 0, -(KNEE + SHIN) / 2);
  g.computeBoundingSphere();
  g.userData.shared = true;
  return (lcache = g);
}
