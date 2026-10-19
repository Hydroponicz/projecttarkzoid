// Grid inventory logic (Tarkov-style). A grid is { w, h, items: [] } where
// each item has integer x/y and the footprint of its definition.
import { ITEMS } from './items.js';

export function makeGrid(w, h) { return { w, h, items: [] }; }

function size(it) { const d = ITEMS[it.key]; return it.rot ? [d.h, d.w] : [d.w, d.h]; }
export { size as itemSize };

export function canPlace(grid, it, x, y, ignore = it) {
  const [w, h] = size(it);
  if (x < 0 || y < 0 || x + w > grid.w || y + h > grid.h) return false;
  for (const o of grid.items) {
    if (o === ignore) continue;
    const [ow, oh] = size(o);
    if (x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y) return false;
  }
  return true;
}

export function findSpot(grid, it) {
  for (const rot of [it.rot || false, !it.rot]) {
    const prev = it.rot;
    it.rot = rot;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (canPlace(grid, it, x, y, null)) return { x, y, rot };
      }
    }
    it.rot = prev;
  }
  return null;
}

// Try to merge ammo stacks first, then place anywhere. Returns true if fully stored.
export function addItem(grid, it) {
  const def = ITEMS[it.key];
  if (def.type === 'ammo') {
    for (const o of grid.items) {
      if (o.key === it.key && o.count < def.stack) {
        const n = Math.min(def.stack - o.count, it.count);
        o.count += n; it.count -= n;
        if (it.count <= 0) return true;
      }
    }
  }
  const spot = findSpot(grid, it);
  if (!spot) return false;
  it.x = spot.x; it.y = spot.y; it.rot = spot.rot;
  grid.items.push(it);
  return true;
}

export function removeItem(grid, it) {
  const i = grid.items.indexOf(it);
  if (i >= 0) grid.items.splice(i, 1);
}

// Count/take ammo of a given key across several grids.
export function countAmmo(grids, key) {
  let n = 0;
  for (const g of grids) for (const it of g.items) if (it.key === key) n += it.count;
  return n;
}

export function takeAmmo(grids, key, want) {
  let got = 0;
  for (const g of grids) {
    for (const it of [...g.items]) {
      if (it.key !== key) continue;
      const n = Math.min(it.count, want - got);
      it.count -= n; got += n;
      if (it.count <= 0) removeItem(g, it);
      if (got >= want) return got;
    }
  }
  return got;
}
