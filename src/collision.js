// 2D (XZ plane) collision: axis-aligned boxes in a spatial hash, circle
// movement with sliding, and segment raycasts for bullets / line of sight.
// Boxes also have a vertical extent (y0 to h, default 0 to 3: a wall), so
// in buildings with upper floors only what's on your own floor gets in the
// way. Movers and rays say what height they're at (0: the ground).

import { LH } from './levels.js';

const BODY_H = 1.6;
// Does a box reach into a body standing at height y?
export function atHeight(b, y = 0) { return (b.h ?? 3) > y + 0.02 && (b.y0 ?? 0) < y + BODY_H; }

// Boxes are filed by cell and by storey: in a tower block every cell holds
// the walls and furniture of every floor, and a query at one height (a
// zombie on the 9th floor, a shot along a corridor) only looks through its
// own storey's. Queries that don't give a height look through all of them.
export class SpatialHash {
  constructor(cell = 6) {
    this.cell = cell;
    this.map = new Map();
    this.stamp = 0;
    this.maxL = 0;
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  insert(box) {
    box._s = 0;
    box._keys = [];
    const L0 = box._L0 = Math.max(0, Math.floor((box.y0 ?? 0) / LH));
    const L1 = box._L1 = Math.max(L0, Math.floor(((box.h ?? 3) - 0.01) / LH));
    if (L1 > this.maxL) this.maxL = L1;
    const c = this.cell;
    for (let cx = Math.floor(box.minX / c); cx <= Math.floor(box.maxX / c); cx++) {
      for (let cz = Math.floor(box.minZ / c); cz <= Math.floor(box.maxZ / c); cz++) {
        const k = this.key(cx, cz);
        let cell = this.map.get(k);
        if (!cell) this.map.set(k, (cell = []));
        for (let L = L0; L <= L1; L++) (cell[L] ||= []).push(box);
        box._keys.push(k);
      }
    }
  }
  remove(box) {
    // Only the cells it was put in (cheap enough to move boxes around)
    const L0 = box._L0 ?? 0, L1 = box._L1 ?? this.maxL;
    for (const k of box._keys || [...this.map.keys()]) {
      const cell = this.map.get(k);
      if (!cell) continue;
      for (let L = L0; L <= L1; L++) {
        const arr = cell[L], i = arr ? arr.indexOf(box) : -1;
        if (i >= 0) arr.splice(i, 1);
      }
    }
    box._keys = null;
  }
  // Boxes in a rectangle; with y0/y1, only from the storeys that height
  // range passes through (a box spanning several storeys can still come
  // back, so callers keep their own height test)
  query(minX, minZ, maxX, maxZ, out = [], y0, y1 = y0) {
    const c = this.cell;
    const s = ++this.stamp;
    out.length = 0;
    const L0 = y0 === undefined ? 0 : Math.max(0, Math.floor(y0 / LH));
    const L1 = y0 === undefined ? this.maxL : Math.min(this.maxL, Math.floor(y1 / LH));
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cz = Math.floor(minZ / c); cz <= Math.floor(maxZ / c); cz++) {
        const cell = this.map.get(this.key(cx, cz));
        if (!cell) continue;
        for (let L = L0; L <= L1; L++) {
          const arr = cell[L];
          if (arr) for (const b of arr) if (b._s !== s) { b._s = s; out.push(b); }
        }
      }
    }
    return out;
  }
}

const tmp = [];

// Move a circle at pos by (dx, dz), resolving penetration against boxes.
// y: the mover's height. Movers that know about floors (pass y) can walk
// through stair gates; the rest (y left out: on the ground) can't.
export function moveCircle(hash, pos, r, dx, dz, y) {
  pos.x += dx;
  pos.z += dz;
  const levels = y !== undefined, yy = y ?? 0;
  for (let iter = 0; iter < 2; iter++) {
    const boxes = hash.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, tmp, yy, yy + BODY_H);
    for (const b of boxes) {
      if (b.noCollide || (b.gate && levels) || !atHeight(b, yy)) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let ox = pos.x - cx, oz = pos.z - cz;
      const d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (ox / d) * (r - d);
        pos.z += (oz / d) * (r - d);
      } else {
        // Center inside the box: push out along the shallowest axis.
        const l = pos.x - b.minX, rr = b.maxX - pos.x, t = pos.z - b.minZ, bt = b.maxZ - pos.z;
        const m = Math.min(l, rr, t, bt);
        if (m === l) pos.x = b.minX - r; else if (m === rr) pos.x = b.maxX + r;
        else if (m === t) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
      }
    }
  }
}

// Returns entry t in [0,1] where segment hits box, or -1.
export function segBox(x1, z1, x2, z2, b) {
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) { if (x1 < b.minX || x1 > b.maxX) return -1; }
  else {
    let a = (b.minX - x1) / dx, c = (b.maxX - x1) / dx;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (z1 < b.minZ || z1 > b.maxZ) return -1; }
  else {
    let a = (b.minZ - z1) / dz, c = (b.maxZ - z1) / dz;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c);
    if (t0 > t1) return -1;
  }
  return t0;
}

// Nearest blocking hit along a segment. `flag` selects which boxes block
// (e.g. 'blocksShot' or 'blocksSight'); y is the floor height it runs at.
export function raycast(hash, x1, z1, x2, z2, flag, y = 0) {
  const boxes = hash.query(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2), tmp, y, y + BODY_H);
  let best = 1;
  let hit = null;
  for (const b of boxes) {
    if (flag && !b[flag]) continue;
    if (!atHeight(b, y)) continue;
    const t = segBox(x1, z1, x2, z2, b);
    if (t >= 0 && t < best) { best = t; hit = b; }
  }
  return { t: best, box: hit };
}

export function hasLOS(hash, x1, z1, x2, z2, y = 0) {
  return raycast(hash, x1, z1, x2, z2, 'blocksSight', y).box === null;
}

// Segment vs circle: returns t of first intersection or -1.
export function segCircle(x1, z1, x2, z2, cx, cz, r) {
  const dx = x2 - x1, dz = z2 - z1;
  const fx = x1 - cx, fz = z1 - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = (-b - s) / (2 * a);
  if (t >= 0 && t <= 1) return t;
  if (c < 0) return 0;
  return -1;
}
