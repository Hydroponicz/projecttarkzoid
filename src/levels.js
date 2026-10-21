// Buildings with real upper floors: storey heights, switchback stairwells,
// elevators. Everything else in the game is flat; here is where heights come
// from. A mover asks floorAt() for the floor under it, given the height it's
// at now: on a staircase that's the flight it's on (the nearest of the
// stacked flights), in an elevator the car, elsewhere in the building the
// floor of its storey. A step to a floor too far up or down is refused, which
// is what keeps you from walking off the top of a stairwell or under a flight.
import * as THREE from 'three';
import { sfx } from './audio.js';

export const WALL_H = 3.0;
export const LH = WALL_H + 0.25; // storey height (wall + slab)
const MAX_STEP = 0.7;

export class Levels {
  constructor() {
    this.buildings = []; // { b, x0, x1, z0, z1, top, cores, lifts, sheets }
    this.lifts = [];
  }

  add(entry) { this.buildings.push(entry); for (const l of entry.lifts) this.lifts.push(l); return entry; }

  // The multi-storey building at (x, z), if any
  buildingAt(x, z) {
    for (const B of this.buildings) if (x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1) return B;
    return null;
  }

  // Floor height under a mover at (x, z) that was at height y; null when it
  // can't step there.
  floorAt(x, z, y = 0) {
    const B = this.buildingAt(x, z);
    if (!B) return Math.abs(y) < MAX_STEP ? 0 : null;
    for (const c of B.cores) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      const h = coreHeight(c, x, z, y);
      return h === null || Math.abs(h - y) > MAX_STEP ? null : h;
    }
    for (const l of B.lifts) {
      if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) continue;
      return Math.abs(l.y - y) < MAX_STEP ? l.y : null;
    }
    const L = Math.max(0, Math.min(B.top, Math.round(y / LH)));
    return Math.abs(L * LH - y) < MAX_STEP ? L * LH : null;
  }

  // The highest floor surface at or below height y at (x, z): a storey's
  // slab, a stair flight, the elevator car, or the ground (for bodies and
  // things falling, which can't step but can land anywhere)
  groundUnder(x, z, y) {
    const B = this.buildingAt(x, z);
    if (!B) return 0;
    for (const c of B.cores) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      // the nearest flight, else the one below it, else the ground floor
      const h = coreHeight(c, x, z, y);
      if (h === null) return 0;
      if (h <= y + 0.05) return h;
      const h2 = coreHeight(c, x, z, y - LH);
      return h2 !== null && h2 <= y + 0.05 ? h2 : 0;
    }
    for (const l of B.lifts) {
      if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) continue;
      return l.y <= y + 0.05 ? l.y : 0;
    }
    return Math.max(0, Math.min(B.top, Math.floor((y + 0.05) / LH))) * LH;
  }

  // Storey index for a height (stairs count as the storey below the landing)
  level(y) { return Math.max(0, Math.round(y / LH - 0.01)); }

  // Distance along a ray to the first floor or ceiling it hits: the ground,
  // or a slab inside a building with upper floors (not in a stairwell or
  // shaft, which are open).
  slabHit(o, d, maxD) {
    let best = d.y < 0 ? -o.y / d.y : Infinity;
    if (best < 0) best = Infinity;
    for (const B of this.buildings) {
      for (let L = 1; L <= B.top + 1; L++) {
        // top of slab L (a floor, from above) and its underside (a ceiling, from below)
        const top = L * LH, bot = top - 0.25;
        const yy = d.y < 0 ? top : bot;
        if ((d.y < 0 && o.y < yy) || (d.y > 0 && o.y > yy) || Math.abs(d.y) < 1e-6) continue;
        const t = (yy - o.y) / d.y;
        if (t <= 0 || t >= best || t > maxD) continue;
        const x = o.x + d.x * t, z = o.z + d.z * t;
        if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) continue;
        if (L <= B.top && B.holes.some((h) => x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1)) continue;
        best = t;
      }
    }
    return best;
  }

  // ---------- elevators ----------
  update(dt, game) {
    for (const l of this.lifts) updateLift(l, dt, game);
  }

  // Interaction points: a call panel by the doors on every floor, and the
  // panel inside the car.
  interactables() {
    const out = [];
    for (const l of this.lifts) out.push(...l.calls, l.inside);
    return out;
  }

  // ---------- zombie routes ----------
  // Where to stand to use a stairwell on storey L, and the walk up or down
  // one flight pair from there.
  entrance(c, L) { return { x: c.x0 - 0.75, z: (c.z0 + c.z1) / 2, y: L * LH }; }
  route(c, L, up) {
    const W = c.z1 - c.z0, zA = c.z0 + W * 0.25, zB = c.z1 - W * 0.25;
    const vN = c.x0 + 0.45, vR = c.x0 + c.near + c.run - 0.15, vL = c.x0 + c.near + c.run + c.land * 0.5;
    const lanes = up ? [zA, zB] : [zB, zA];
    return [
      { x: vN, z: lanes[0] }, { x: vR, z: lanes[0] }, { x: vL, z: lanes[0] }, { x: vL, z: lanes[1] },
      { x: vR, z: lanes[1] }, { x: vN, z: lanes[1] }, { x: c.x0 - 0.75, z: (c.z0 + c.z1) / 2 },
    ];
  }
}

// Height on a stairwell. Local frame: v runs in from the open (near) end,
// u across. The near strip is floor on every storey; lane A (u < W/2) climbs
// from a storey to the half landing at the far end, lane B climbs from the
// landing to the next storey. A spot is on several stacked flights at once:
// pick the one nearest the height the mover was at.
function coreHeight(c, x, z, y) {
  const v = x - c.x0, u = z - c.z0, W = c.z1 - c.z0;
  let f, lo = 0, hi = c.top - 1;
  if (v < c.near) { f = 0; hi = c.top; }
  else if (v < c.near + c.run) {
    const k = (v - c.near) / c.run;
    f = u < W / 2 ? k * LH / 2 : LH / 2 + (1 - k) * LH / 2;
  } else f = LH / 2;
  if (hi < lo) return null;
  const L = Math.max(lo, Math.min(hi, Math.round((y - f) / LH)));
  return L * LH + f;
}

// ---------- elevator ----------
// A car in a shaft with sliding doors on every floor. Call it from any floor;
// inside, pick a floor. It waits with the doors open, closes them, travels,
// opens them. The doors' colliders are solid unless the car is there with
// the doors open.
const LIFT_SPEED = 1.6;
function updateLift(l, dt, game) {
  const st = l.state;
  if (st === 'idle') {
    if (l.queue.length) {
      const next = l.queue[0];
      if (next === l.level) { l.queue.shift(); l.state = 'opening'; sfx.click(1800, 0.25); }
      else { l.state = 'closing'; }
    }
  } else if (st === 'opening') {
    l.open = Math.min(1, l.open + dt * 1.4);
    if (l.open >= 1) { l.state = 'open'; l.wait = 4; }
  } else if (st === 'open') {
    l.wait -= dt;
    if (l.wait <= 0 || (l.queue.length && l.queue[0] !== l.level)) l.state = 'closing';
  } else if (st === 'closing') {
    l.open = Math.max(0, l.open - dt * 1.4);
    if (l.open <= 0) { l.state = l.queue.length ? 'moving' : 'idle'; if (l.state === 'moving') sfx.click(400, 0.15); }
  } else if (st === 'moving') {
    const target = l.queue[0] * LH, dy = target - l.y;
    const step = Math.sign(dy) * Math.min(Math.abs(dy), LIFT_SPEED * dt);
    l.y += step;
    // whoever is inside rides along
    const p = game.player;
    if (p && inLift(l, p.pos.x, p.pos.z) && Math.abs(p.floorY - (l.y - step)) < 0.3) p.floorY = l.y;
    for (const zb of game.zombies?.list || []) if (inLift(l, zb.pos.x, zb.pos.z) && Math.abs(zb.pos.y - (l.y - step)) < 0.3) zb.pos.y = l.y;
    l.hum = (l.hum || 0) - dt;
    if (l.hum <= 0) { l.hum = 0.5; sfx.click(120, 0.05); }
    if (Math.abs(target - l.y) < 1e-3) { l.y = target; l.level = l.queue.shift(); l.state = 'opening'; sfx.click(1800, 0.25); }
  }
  // doors and car follow the state
  l.car.position.y = l.y;
  for (let L = 0; L < l.doors.length; L++) {
    const d = l.doors[L], k = L === l.level && l.state !== 'moving' ? l.open : 0;
    // (lift doors are always in a wall running along x: the leaves slide apart along it)
    d.left.position.x = d.lx - k * d.slide; d.right.position.x = d.rx + k * d.slide;
    d.box.noCollide = k > 0.85;
  }
}
const inLift = (l, x, z) => x > l.x0 && x < l.x1 && z > l.z0 && z < l.z1;

export function callLift(l, level) {
  if (!l.queue.includes(level) && !(l.level === level && (l.state === 'open' || l.state === 'opening'))) l.queue.push(level);
  if (l.level === level && l.state === 'open') l.wait = 4;
  sfx.click(1400, 0.15);
}

// Car and door meshes for a lift (the shaft walls are ordinary walls)
export function liftMeshes(group, l, mat) {
  const car = new THREE.Group();
  const w = l.x1 - l.x0, d = l.z1 - l.z0;
  const box = (bw, bh, bd, x, y, z, m = mat.car) => { const o = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), m); o.position.set(x, y, z); car.add(o); return o; };
  const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
  box(w - 0.04, 0.08, d - 0.04, 0, 0.0, 0, mat.floor);           // floor
  box(w - 0.04, 0.06, d - 0.04, 0, 2.6, 0, mat.car);             // ceiling
  box(w * 0.5, 0.02, d * 0.5, 0, 2.56, 0, mat.light);            // light panel
  // back and side walls (the door side is open)
  const open = l.doorSide;
  if (open !== 'n') box(w - 0.04, 2.6, 0.04, 0, 1.3, -d / 2 + 0.03);
  if (open !== 's') box(w - 0.04, 2.6, 0.04, 0, 1.3, d / 2 - 0.03);
  if (open !== 'w') box(0.04, 2.6, d - 0.04, -w / 2 + 0.03, 1.3, 0);
  if (open !== 'e') box(0.04, 2.6, d - 0.04, w / 2 - 0.03, 1.3, 0);
  box(0.6, 0.04, 0.06, 0, 0.95, (open === 's' ? -1 : 1) * (d / 2 - 0.07), mat.trim); // handrail
  // floor buttons by the door
  const px = open === 's' || open === 'n' ? w / 2 - 0.15 : 0, pz = open === 's' ? d / 2 - 0.15 : open === 'n' ? -d / 2 + 0.15 : 0;
  box(0.05, 0.5, 0.18, px, 1.25, pz, mat.trim);
  car.position.set(cx, 0, cz);
  group.add(car);
  l.car = car;
  return car;
}
