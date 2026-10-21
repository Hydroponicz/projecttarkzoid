// Offices, police stations, hospitals and skyscrapers with real upper floors.
// The town is generated as before (so nothing else moves), then these are
// rebuilt here, each from its own random sequence:
//   - every storey has its own rooms, doors, windows, furniture and loot
//   - a switchback stairwell at the end of the corridor links them: a flight
//     up to a half landing, a flight on up to the next floor
//   - hospitals and skyscrapers also have an elevator beside it
// A storey is laid out at ground level with the usual helpers, then
// everything it made is lifted to its height.
import * as THREE from 'three';
import { LH, liftMeshes } from './levels.js';

export const STOREYS = {
  office: { levels: 2, perLevel: 3 },
  police: { levels: 2, perLevel: 3 },
  hospital: { levels: 3, lift: true, perLevel: 5 },
  skyscraper: { levels: [14, 20], lift: true, perLevel: 2 }, // real floors all the way up
  hotel: { levels: [11, 14], lift: true, perLevel: 2 },      // Hotel Vostok: a lobby, then rooms
  // Housing: a flat off each side of the landing corridor on every floor
  panel5: { levels: 5, perLevel: 2 },             // Khrushchyovka
  panel9: { levels: 9, lift: true, perLevel: 2 }, // the nine-storey panel block
  panel16: { levels: 16, lift: true, perLevel: 2 }, // the sixteen-storey tower block
  stalinka: { levels: 4, perLevel: 2 },           // the grand 50s block
};
// Stairwell: open strip at the near end, the flights, the far landing
const NEAR = 1.4, RUN = 3.0, LAND = 1.4;
const STEPS = 10;

export function buildStoreys(c, b) {
  const { rand, rnd, pick, WALL_H, WALL_T: T, DOOR, KINDS } = c;
  const kindName = b.kind, kind = KINDS[kindName], spec = STOREYS[kindName];
  const nL = Array.isArray(spec.levels) ? spec.levels[0] + Math.floor(rand() * (spec.levels[1] + 1 - spec.levels[0])) : spec.levels, top = nL - 1;
  const { x0, x1, z0, z1 } = b;
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const corridor = !!kind.corridor, cw = 1.6;
  const zc = corridor ? b.zc : cz;
  const color = b.color, inner = b.interiorColor;

  // Stairwell at the east end, as wide as the corridor, opening west
  const coreW = 2 * cw - T;
  const core = { x0: x1 - T / 2 - (NEAR + RUN + LAND), x1: x1 - T / 2, z0: zc - coreW / 2, z1: zc + coreW / 2, near: NEAR, run: RUN, land: LAND, top };
  // Elevator shaft north of the corridor, just short of the stairwell
  const LW = 2.0;
  const lift = spec.lift ? { x0: core.x0 - 0.6 - LW, x1: core.x0 - 0.6, z0: zc - cw - T / 2 - LW, z1: zc - cw - T / 2 } : null;
  const holes = [{ x0: core.x0 + NEAR, x1: core.x1, z0: core.z0, z1: core.z1 }];
  if (lift) holes.push({ x0: lift.x0, x1: lift.x1, z0: lift.z0, z1: lift.z1 });
  const keepOut = [{ x: core.x0 - 0.8, z: zc, r: 2.6 }];
  if (lift) keepOut.push({ x: (lift.x0 + lift.x1) / 2, z: lift.z1 + 0.9, r: 2.0 }, { x: (lift.x0 + lift.x1) / 2, z: (lift.z0 + lift.z1) / 2, r: 2.8 });
  const sideOf = (dr) => (dr.ax === 'x' ? (Math.abs(dr.z - z0) < 0.01 ? 'n' : 's') : (Math.abs(dr.x - x0) < 0.01 ? 'w' : 'e'));
  b.doors = []; b.windows = [];
  let signDoor = null;

  // ---------- storeys ----------
  const firstNew = c.containers.length;
  for (let L = 0; L < nL; L++) {
    // Placement checks look at every container: hide the floors below while
    // this one is furnished (they're at the same x, z), then put them back.
    const stash = c.containers.splice(firstNew);
    const m = mark();
    if (corridor) corridorStorey(L); else openStorey(L);
    c.zombieSpawns.push({ x: (x0 + core.x0) / 2, z: zc, r: Math.max(2, Math.min(core.x0 - x0, d) / 2 - 1.2), n: spec.perLevel + (L ? 0 : 1), type: kind.zombies?.type || null });
    lift_(m, L * LH);
    c.containers.splice(firstNew, 0, ...stash);
  }

  // ---------- slabs, stairs, roof ----------
  const slabMat = c.mergeableMaterial('tiles', kind.floor, 2, 0.85);
  const ground = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), slabMat);
  ground.position.set(cx, 0.03, cz); ground.receiveShadow = true; c.group.add(ground);
  for (let L = 1; L <= nL; L++) {
    const roof = L === nL;
    for (const r of rectMinus({ x0: x0 - 0.3, x1: x1 + 0.3, z0: z0 - 0.3, z1: z1 + 0.3 }, roof ? [] : holes)) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, 0.25, r.z1 - r.z0), roof ? c.fur.M(0x3a3330, 1) : slabMat);
      s.position.set((r.x0 + r.x1) / 2, L * LH - 0.125, (r.z0 + r.z1) / 2);
      s.castShadow = s.receiveShadow = true;
      c.group.add(s);
    }
  }
  for (let L = 0; L < top; L++) stairs(L * LH);
  const roofY = nL * LH;
  // Roof: a parapet and plant (a tower also gets its antenna mast)
  c.prop(w + 0.6, 0.4, 0.2, 0x5a5a58, cx, roofY + 0.2, z0 - 0.2); c.prop(w + 0.6, 0.4, 0.2, 0x5a5a58, cx, roofY + 0.2, z1 + 0.2);
  c.prop(0.2, 0.4, d + 0.2, 0x5a5a58, x0 - 0.2, roofY + 0.2, cz); c.prop(0.2, 0.4, d + 0.2, 0x5a5a58, x1 + 0.2, roofY + 0.2, cz);
  for (let i = 0; i < 2; i++) c.prop(1.1, 0.8, 0.9, 0x9a9c9e, cx + rnd(-w / 3, w / 3), roofY + 0.4, cz + rnd(-d / 3, d / 3));
  if (kind.tower) c.prop(1.2, 4, 1.2, 0x555555, cx + w / 4, roofY + 2, cz);
  // Sign over the ground-floor entrance
  if (kind.sign && signDoor) c.sign(b.name, kind.sign.bg, kind.sign.cross, signDoor.x, signDoor.z, signDoor.side);

  const lifts = lift ? [makeLift()] : [];
  return { b, x0, x1, z0, z1, top, cores: [core], lifts, holes };

  // ---------- one storey of a corridor building ----------
  function corridorStorey(L) {
    const ground = L === 0, lobby = ground && (kindName === 'skyscraper' || kindName === 'hotel');
    const ext = { n: [], s: [], w: [], e: [] }, junc = { n: [], s: [], w: [], e: [] };
    const bDoors = [], rooms = [];
    c.setPattern('plaster');
    const span = core.x0 - x0, n = Math.max(2, Math.floor(span / 5.5)), step = span / n;
    const north = [], south = [];
    if (!lobby) {
      for (let i = 0; i < n; i++) {
        const rx0 = x0 + i * step, rx1 = i === n - 1 ? x1 : x0 + (i + 1) * step;
        let nd = x0 + (i + 0.5) * step;
        if (lift && nd > lift.x0 - 1.5 && nd < lift.x1 + 1.5) nd = Math.max(rx0 + 1.0, (rx0 + lift.x0 - T) / 2);
        north.push({ c: nd, w: 1.4, type: 'door' });
        south.push({ c: Math.min(core.x0 - 1.0, x0 + (i + 0.5) * step + rnd(-0.5, 0.5)), w: 1.4, type: 'door' });
        if (i > 0) {
          c.wallWithOpenings('z', z0, zc - cw, rx0, [], inner);
          c.wallWithOpenings('z', zc + cw, z1, rx0, [], inner);
          junc.n.push(rx0); junc.s.push(rx0);
        }
        rooms.push({ x0: rx0, x1: rx1, z0, z1: zc - cw, side: 'n' }, { x0: rx0, x1: rx1, z0: zc + cw, z1, side: 's' });
      }
    }
    if (lift) north.push({ c: (lift.x0 + lift.x1) / 2, w: 1.2, type: 'gap' });
    if (lobby) {
      // An open lobby: only the stairwell's walls and the lift shaft's front
      c.wallWithOpenings('x', lift ? lift.x0 - T : core.x0, x1, zc - cw, north, inner);
      c.wallWithOpenings('x', core.x0, x1, zc + cw, [], inner);
    } else {
      bDoors.push(...c.wallWithOpenings('x', x0, x1, zc - cw, north, inner).doors);
      bDoors.push(...c.wallWithOpenings('x', x0, x1, zc + cw, south, inner).doors);
    }
    junc.e.push(zc - cw, zc + cw); junc.w.push(zc - cw, zc + cw);
    stairwellWalls(ground);
    // Outside: the door at the corridor's west end (a window above), windows along the sides
    ext.w.push(ground ? { c: zc, w: DOOR, type: 'door' } : { c: zc, w: 1.4, type: 'window', sill: 0.9, top: 2.1 });
    if (lobby) ext.s.push({ c: (x0 + core.x0) / 2, w: DOOR, type: 'door' });
    windowsAlong(ext, junc, ['n', 's']);
    const outer = exterior(ext, bDoors, ground);
    if (kind.balconies && !ground) balconies();
    // Furnishing
    const wins = b.windows;
    if (lobby) furnishLobby(bDoors, wins);
    else for (const r of rooms) furnishRoom(r, L, bDoors, wins);
    for (const r of rooms) c.prop(0.5, 0.05, 0.5, 0xd8d8c8, (r.x0 + r.x1) / 2, WALL_H - 0.03, (r.z0 + r.z1) / 2); // ceiling lights
    for (let x = x0 + 2; x < core.x0; x += 4) c.prop(0.5, 0.05, 0.5, 0xd8d8c8, x, WALL_H - 0.03, zc);
    for (const dr of bDoors) c.addDoor(dr.x, dr.z, dr.ax, rand() < 0.7, dr.w);
    if (ground && outer.length) signDoor = { ...outer[0], side: sideOf(outer[0]) };
  }

  // ---------- one storey of an open-plan office ----------
  function openStorey(L) {
    const ground = L === 0;
    const ext = { n: [], s: [], w: [], e: [] }, junc = { n: [], s: [], w: [], e: [] };
    const bDoors = [];
    c.setPattern('plaster');
    // the stairwell's side walls (there's no corridor to borrow)
    c.wallWithOpenings('x', core.x0 - T / 2, x1, zc - cw, [], inner);
    c.wallWithOpenings('x', core.x0 - T / 2, x1, zc + cw, [], inner);
    junc.e.push(zc - cw, zc + cw);
    stairwellWalls(ground);
    if (ground) { ext.w.push({ c: zc + rnd(-2, 2), w: DOOR, type: 'door' }); ext.s.push({ c: (x0 + core.x0) / 2 + rnd(-2, 2), w: DOOR, type: 'door' }); }
    windowsAlong(ext, junc, ['n', 's', 'w']);
    const outer = exterior(ext, bDoors, ground);
    const wins = b.windows;
    const room = { x0, x1: core.x0 - T / 2, z0, z1 };
    // A grid of desks and wall-side storage
    for (let z = z0 + 1.8; z < z1 - 1.6; z += 2.8) {
      for (let x = x0 + 1.9; x < core.x0 - 1.8; x += 2.4) {
        if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.2)) continue;
        if (keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
        if (c.containers.some((k) => Math.hypot(k.x - x, k.z - z) < 1.4)) continue;
        c.addContainer('desk', x, z, 0);
      }
    }
    const P = c.roomPlacer(room, bDoors, wins, keepOut);
    c.fill(P, ['filing', 'filing', 'plant', 'water_cooler', 'whiteboard', 'server'], 6);
    if (ground) { P.wall('vending'); P.wall('pc'); }
    for (let x = x0 + 3; x < core.x0 - 1; x += 4.5) for (let z = z0 + 3; z < z1 - 2; z += 4.5) c.prop(0.5, 0.05, 0.5, 0xd8d8c8, x, WALL_H - 0.03, z);
    for (const dr of bDoors) c.addDoor(dr.x, dr.z, dr.ax, rand() < 0.7, dr.w);
    if (ground && outer.length) signDoor = { ...outer[0], side: sideOf(outer[0]) };
  }

  // The stairwell's middle wall (between the flights), a gate on the ground
  // floor that only things that can climb pass, and the lift shaft
  function stairwellWalls(ground) {
    // walls that run the full storey height (no slab between them and the next)
    const tall = (minX, minZ, maxX, maxZ, box = true) => {
      c.walls.push({ minX, maxX, minZ, maxZ, y0: 0, y1: LH, color: inner, pattern: c.pattern('plaster') });
      if (box) c.addBox(minX, minZ, maxX, maxZ, { h: LH });
    };
    tall(core.x0 + NEAR, zc - 0.1, core.x0 + NEAR + RUN, zc + 0.1);
    // over the flights there's no slab: close the gap above the side walls
    const hx = core.x0 + NEAR;
    c.walls.push({ minX: hx, maxX: x1, minZ: zc - cw - T / 2, maxZ: zc - cw + T / 2, y0: WALL_H, y1: LH, color: inner, pattern: c.pattern('plaster') });
    c.walls.push({ minX: hx, maxX: x1, minZ: zc + cw - T / 2, maxZ: zc + cw + T / 2, y0: WALL_H, y1: LH, color: inner, pattern: c.pattern('plaster') });
    c.walls.push({ minX: x1 - T / 2, maxX: x1 + T / 2, minZ: zc - cw, maxZ: zc + cw, y0: WALL_H, y1: LH, color, pattern: c.pattern('concrete') });
    if (ground) c.addBox(core.x0 - 0.05, core.z0, core.x0 + 0.05, core.z1, { gate: true, blocksShot: false, blocksSight: false });
    if (lift) {
      tall(lift.x0 - T, lift.z0 - T, lift.x0, lift.z1 + T / 2);
      tall(lift.x1, lift.z0 - T, lift.x1 + T, lift.z1 + T / 2);
      tall(lift.x0 - T, lift.z0 - T, lift.x1 + T, lift.z0);
      // above the doors, up to the next floor
      c.walls.push({ minX: lift.x0, maxX: lift.x1, minZ: lift.z1, maxZ: lift.z1 + T, y0: WALL_H, y1: LH, color: inner, pattern: c.pattern('plaster') });
    }
  }

  // Windows along the given outside walls, clear of doors, corners and inside walls
  function windowsAlong(ext, junc, sides) {
    const win = kind.windows || { w: 1.4, gap: 2.75, sill: 0.9, top: 2.1 };
    for (const side of sides) {
      const [a0, a1] = side === 'n' || side === 's' ? [x0, x1] : [z0, z1];
      const len = a1 - a0 - 2.4, n = Math.max(0, Math.floor(len / win.gap));
      for (let i = 0; i < n; i++) {
        const cc = a0 + 1.2 + (len - (n - 1) * win.gap) / 2 + i * win.gap + rnd(-0.2, 0.2);
        if (ext[side].some((o) => Math.abs(o.c - cc) < o.w / 2 + win.w / 2 + 0.35)) continue;
        if (junc[side].some((j) => Math.abs(j - cc) < win.w / 2 + 0.4)) continue;
        if ((side === 'n' || side === 's') && cc > core.x0 - 0.3) continue; // the stairwell end stays solid
        ext[side].push({ c: cc, w: win.w, type: 'window', sill: win.sill, top: win.top });
      }
    }
  }

  function exterior(ext, bDoors, ground) {
    c.setPattern(kind.finish || 'concrete');
    const outer = [];
    for (const [side, ax, a0, a1, fixed] of [['n', 'x', x0, x1, z0], ['s', 'x', x0, x1, z1], ['w', 'z', z0, z1, x0], ['e', 'z', z0, z1, x1]]) {
      const made = c.wallWithOpenings(ax, a0, a1, fixed, ext[side], color);
      bDoors.push(...made.doors);
      if (ground) { outer.push(...made.doors); b.doors.push(...made.doors); }
      b.windows.push(...made.windows);
    }
    c.setPattern('plaster');
    return outer;
  }

  function furnishLobby(bDoors, wins) {
    const P = c.roomPlacer({ x0, x1: core.x0 - T / 2, z0, z1 }, bDoors, wins, keepOut);
    P.open('reception', (x0 + core.x0) / 2, zc + 2.2, Math.PI);
    for (const dz of [-3, 3]) P.open('waiting_chairs', x0 + 3, zc + dz, dz < 0 ? 0 : Math.PI);
    c.fill(P, ['plant', 'plant', 'water_cooler', 'vending', 'filing'], 6);
  }

  // A room off the corridor, by what the building is for
  function furnishRoom(r, L, bDoors, wins) {
    if (kindName === 'hospital' && L > 0 && r.side === 'n') {
      // Wards upstairs: beds along the outside wall
      for (let bx = r.x0 + 1.2; bx < Math.min(r.x1, core.x0) - 1.0; bx += 1.8) {
        if (bDoors.some((dr) => Math.hypot(dr.x - bx, dr.z - (r.z0 + 1.1)) < 2.0)) continue;
        if (lift && bx > lift.x0 - 1.4 && bx < lift.x1 + 1.4) continue;
        c.addBed(bx, r.z0 + T / 2 + 1.05, 0, 0xe8ecec);
      }
      if (rand() < 0.6) c.placeAlong(r, 'medcab', bDoors, keepOut, wins);
      return;
    }
    if (kindName === 'police' && L === 0 && r.side === 'n' && !b.cellDone && r.x1 - r.x0 > 3.4 && r.x1 < core.x0) {
      // Holding cell: bars across the room, a bunk and a toilet behind them
      b.cellDone = true;
      const cz2 = r.z0 + (r.z1 - r.z0) * 0.55, bw = r.x1 - r.x0 - T;
      const g = c.fur.model('cell_bars', (r.x0 + r.x1) / 2, cz2, 0, {}, rand);
      g.scale.x = bw / 3.0;
      const gapX = (r.x0 + r.x1) / 2 + (-1.45 + 13.5 * 0.152) * (bw / 3.0);
      c.addBox(r.x0, cz2 - 0.06, gapX - 0.35 * (bw / 3), cz2 + 0.06, { blocksSight: false, blocksShot: false, h: 2.6 });
      c.addBox(gapX + 0.35 * (bw / 3), cz2 - 0.06, r.x1, cz2 + 0.06, { blocksSight: false, blocksShot: false, h: 2.6 });
      const P = c.roomPlacer({ x0: r.x0, x1: r.x1, z0: r.z0, z1: cz2 }, bDoors, wins);
      P.wall('bed_single', { sides: [0] }); P.wall('toilet', { sides: [0, 2, 3] });
      return;
    }
    const role = pick(kind.roomRoles || ['generic']);
    if (role === 'flat') { flat(r, bDoors, wins); return; }
    if (role === 'hotel') {
      // A hotel room: the bed, a wardrobe, a desk with a telly, a chair
      const P = c.roomPlacer(r, bDoors, wins, keepOut);
      c.floorPatch(r, pick([0x6a2a2a, 0x2a3a5a, 0x5a4a2a]));
      c.ceilingPlane(r);
      c.furnishBedroom(P, rand() < 0.3);
      P.wall('crt_tv'); if (rand() < 0.6) P.wall('armchair');
      return;
    }
    const P = c.roomPlacer(r, bDoors, wins, keepOut);
    if (kind.roomDesks && rand() < 0.5) {
      for (let z = r.z0 + 1.8; z < r.z1 - 1.6; z += 2.8) for (let x = r.x0 + 1.9; x < r.x1 - 1.6; x += 2.4) {
        if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.2) || keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
        if (c.containers.some((k) => Math.hypot(k.x - x, k.z - z) < 1.4)) continue;
        c.addContainer('desk', x, z, 0);
      }
    }
    if (role === 'office') { P.wall('desk'); P.wall('desk'); P.wall('filing'); P.wall('whiteboard'); P.wall('plant'); }
    else if (role === 'lockers') { c.fill(P, ['policelocker', 'lockers', 'lockers'], 4); P.open('bench', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0); }
    else if (role === 'evidence') { c.fill(P, ['evidence', 'tool_rack', 'evidence'], 4); }
    else if (role === 'exam') { P.wall('hospital_bed'); P.wall('hospital_bed'); P.wall('medcab'); P.wall('surgical'); P.wall('bath_sink'); }
    else if (role === 'supply') { c.fill(P, ['pillshelf', 'pharma_shelf', 'medcab', 'medbox'], 5); }
    else if (role === 'exec') { P.wall('desk'); P.wall('safe'); P.wall('bookshelf'); P.wall('armchair'); P.wall('plant'); }
    else if (role === 'server') { c.fill(P, ['server', 'server', 'filing'], 4); }
    else {
      const n = 1 + Math.floor(rand() * 2.5);
      for (let i = 0; i < n; i++) c.placeAlong(r, pick(kind.roomLoot || kind.wallLoot), bDoors, keepOut, wins);
      if (rand() < 0.5) P.wall('plant');
    }
  }

  // A flat: the room off the corridor split into a living room / bedroom
  // and a narrow kitchen, through a doorway in the partition
  function flat(r, bDoors, wins) {
    const W = r.x1 - r.x0, out = r.side === 'n' ? r.z0 : r.z1;
    const door = bDoors.find((dr) => dr.x > r.x0 && dr.x < r.x1 && Math.abs(dr.z - (r.side === 'n' ? r.z1 : r.z0)) < 0.3);
    const clear = (px) => !(door && Math.abs(door.x - px) < (door.w ?? 1.4) / 2 + 0.4)
      && !wins.some((wn) => Math.abs(wn.z - out) < 0.3 && Math.abs(wn.x - px) < wn.w / 2 + 0.25)
      && px > r.x0 + 2.8 && px < r.x1 - 1.9;
    const tries = [r.x1 - 2.2, r.x1 - 2.5, r.x0 + 2.4, r.x0 + 2.8, r.x1 - 2.8, r.x0 + 3.2];
    const px = W > 5 ? tries.find(clear) : undefined;
    c.floorPatch(r, pick([0x6a4a34, 0x7a5a3a, 0x5a4030, 0x8a6a48]));
    c.ceilingPlane(r);
    if (px === undefined) { const P = c.roomPlacer(r, bDoors, wins, keepOut); c.furnishLiving(P, true); c.furnishBedroom(P, true); return; }
    const kitchenRight = px > (r.x0 + r.x1) / 2;
    const gap = { x: px, z: (r.z0 + r.z1) / 2 + (r.side === 'n' ? -0.6 : 0.6), w: 0.9, ax: 'z' };
    c.wallWithOpenings('z', r.z0, r.z1, px, [{ c: gap.z, w: 0.9, type: 'gap' }], inner);
    const doors2 = [...bDoors, gap];
    const main = kitchenRight ? { ...r, x1: px } : { ...r, x0: px };
    const kit = kitchenRight ? { ...r, x0: px } : { ...r, x1: px };
    const P = c.roomPlacer(main, doors2, wins, keepOut);
    c.furnishLiving(P, false);
    c.furnishBedroom(P, rand() < 0.6);
    c.furnishKitchen(c.roomPlacer(kit, doors2, wins, keepOut), true);
  }

  // Balconies under the windows of the long sides: a slab, a parapet of
  // panel or railing, some glazed in, washing lines and junk on others
  function balconies() {
    for (const wn of b.windows) {
      if (wn.base !== undefined || wn.ax !== 'x' || rand() < 0.35) continue;
      const s = Math.abs(wn.z - z0) < 0.3 ? -1 : 1, bw = wn.w + 1.0, bd = 1.0, zf = wn.z + s * (T / 2 + bd / 2);
      c.prop(bw, 0.14, bd, 0x8a8884, wn.x, 0.07, zf);
      const glazed = rand() < 0.3, wall = glazed ? 0x9a9690 : pick([0xb8b4a8, 0x9aa0a8, 0xc8b8a0, 0x7a8a7a]);
      c.prop(bw, 1.0, 0.06, wall, wn.x, 0.64, zf + s * bd / 2);
      for (const sx of [-1, 1]) c.prop(0.06, 1.0, bd, wall, wn.x + sx * bw / 2, 0.64, zf);
      if (glazed) {
        c.prop(bw, 1.1, 0.04, 0x8aa0b0, wn.x, 1.7, zf + s * bd / 2).material = c.fur.M(0x8aa0b0, 0.1, 0.3);
        c.prop(bw + 0.1, 0.06, bd + 0.06, 0x7a7670, wn.x, 2.3, zf);
      } else if (rand() < 0.5) {
        // washing on a line, a box or a bike
        c.prop(bw - 0.2, 0.01, 0.01, 0xdddddd, wn.x, 1.6, zf);
        for (let i = 0; i < 3; i++) c.prop(0.3, 0.45, 0.01, pick([0xd8d8e0, 0x3a5a8a, 0xa83a3a, 0xe0d0a0]), wn.x - bw / 2 + 0.4 + i * 0.4 + rnd(-0.05, 0.05), 1.35, zf);
      } else if (rand() < 0.5) c.prop(0.5, 0.4, 0.4, 0x8a6a4a, wn.x + rnd(-0.4, 0.4), 0.34, zf);
    }
  }

  // ---------- stairs between storey base and base + LH ----------
  function stairs(base) {
    // Everything stops 1 cm short of the walls: faces in the same plane as a
    // wall flicker through it.
    const E = 0.012, laneW = (coreW - 0.2) / 2 - 2 * E, zA = core.z0 + E + laneW / 2, zB = core.z1 - E - laneW / 2;
    const rise = LH / 2 / STEPS, tread = RUN / STEPS, col = 0x8a8a86;
    for (let i = 0; i < STEPS; i++) {
      // lane A climbs eastward from the storey to the landing
      const hA = rise * (i + 1);
      c.prop(tread + 0.01, rise + 0.025, laneW, col, core.x0 + NEAR + (i + 0.5) * tread, base + hA - (rise + 0.025) / 2, zA);
      // lane B climbs westward from the landing to the next storey
      const hB = LH / 2 + rise * (i + 1);
      c.prop(tread + 0.01, rise + 0.025, laneW, col, core.x0 + NEAR + RUN - (i + 0.5) * tread, base + hB - (rise + 0.025) / 2, zB);
    }
    // sloped undersides
    const len = Math.hypot(RUN, LH / 2), ang = Math.atan2(LH / 2, RUN);
    const sA = c.prop(len, 0.12, laneW - 0.01, col, core.x0 + NEAR + RUN / 2, base + LH / 4 - 0.12, zA); sA.rotation.z = ang;
    const sB = c.prop(len, 0.12, laneW - 0.01, col, core.x0 + NEAR + RUN / 2, base + LH * 0.75 - 0.12, zB); sB.rotation.z = -ang;
    // the half landing, and handrails on the middle wall
    c.prop(LAND - E, 0.2, coreW - 2 * E, col, core.x0 + NEAR + RUN + (LAND - E) / 2, base + LH / 2 - 0.1, zc);
    for (const [z, h0, h1] of [[zc - 0.13, 0, LH / 2], [zc + 0.13, LH / 2, LH]]) {
      const r = c.prop(len, 0.05, 0.05, 0x3a3a3c, core.x0 + NEAR + RUN / 2, base + (h0 + h1) / 2 + 0.9, z);
      r.rotation.z = h1 > h0 && z < zc ? ang : -ang;
    }
  }

  // ---------- the elevator ----------
  function makeLift() {
    const dz = lift.z1 + T / 2, dxc = (lift.x0 + lift.x1) / 2, gapW = 1.2;
    const l = { x0: lift.x0, x1: lift.x1, z0: lift.z0, z1: lift.z1 + T / 2 + 0.1, doorSide: 's', y: 0, level: 0, top, queue: [], state: 'idle', open: 0, wait: 0, doors: [], calls: [] };
    const mats = {
      car: new THREE.MeshStandardMaterial({ color: 0x9a9ea2, roughness: 0.35, metalness: 0.6 }),
      floor: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9 }),
      light: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 1.2 }),
      trim: new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.7 }),
      door: new THREE.MeshStandardMaterial({ color: 0xa8acb0, roughness: 0.3, metalness: 0.7 }),
    };
    const car = liftMeshes(c.group, l, mats);
    car.userData.dynamic = true;
    for (let L = 0; L <= top; L++) {
      const y = L * LH;
      const leaf = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(gapW / 2, 2.2, 0.06), mats.door); m.position.set(x, y + 1.1, dz); m.userData.dynamic = true; c.group.add(m); return m; };
      const left = leaf(dxc - gapW / 4), right = leaf(dxc + gapW / 4);
      const box = c.addBox(dxc - gapW / 2, dz - 0.1, dxc + gapW / 2, dz + 0.1, { y0: y, h: y + 2.4, blocksSight: true });
      l.doors.push({ left, right, lx: dxc - gapW / 4, rx: dxc + gapW / 4, slide: gapW / 2 - 0.05, box });
      // call button beside the doors, on the corridor side
      c.prop(0.12, 0.2, 0.04, 0x2a2a2c, dxc + gapW / 2 + 0.3, y + 1.2, dz + T / 2 + 0.02);
      l.calls.push({ kind: 'lift', name: 'Elevator', x: dxc + gapW / 2 + 0.3, z: dz + 0.6, base: y, lift: l, level: L, prompt: () => '[F] Call the elevator' });
    }
    l.inside = { kind: 'liftcar', name: 'Elevator', x: dxc, z: (lift.z0 + lift.z1) / 2, lift: l, get base() { return l.y; }, prompt: () => (l.state === 'moving' ? 'Elevator moving…' : '[F] Elevator: choose a floor') };
    return l;
  }

  // ---------- helpers ----------
  // Everything a storey adds, so it can be lifted into place
  function mark() {
    return { ch: c.group.children.length, walls: c.walls.length, boxes: c.allBoxes.length, cont: c.containers.length, doors: c.doors.length, wins: c.windows.length, beds: c.beds.length, zs: c.zombieSpawns.length };
  }
  function lift_(m, base) {
    for (const o of c.group.children.slice(m.ch)) o.position.y += base;
    for (const wl of c.walls.slice(m.walls)) { wl.y0 = (wl.y0 ?? 0) + base; wl.y1 = (wl.y1 ?? WALL_H) + base; }
    for (const x of c.allBoxes.slice(m.boxes)) { x.y0 = (x.y0 ?? 0) + base; x.h = (x.h ?? WALL_H) + base; }
    for (const k of c.containers.slice(m.cont)) { k.y = (k.y ?? 0) + base; k.base = base; }
    for (const dr of c.doors.slice(m.doors)) dr.base = base;
    for (const wn of c.windows.slice(m.wins)) wn.base = base;
    for (const bd of c.beds.slice(m.beds)) bd.base = base;
    for (const sp of c.zombieSpawns.slice(m.zs)) sp.y = base;
  }
}

// A rectangle with rectangular holes cut out, as a list of rectangles
export function rectMinus(r, holes) {
  const xs = [...new Set([r.x0, r.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= r.x0 && x <= r.x1).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], bb = xs[i + 1], mid = (a + bb) / 2;
    const cuts = holes.filter((h) => mid > h.x0 && mid < h.x1).map((h) => [Math.max(r.z0, h.z0), Math.min(r.z1, h.z1)]).sort((p, q) => p[0] - q[0]);
    let z = r.z0;
    for (const [h0, h1] of cuts) { if (h0 > z) out.push({ x0: a, x1: bb, z0: z, z1: h0 }); z = Math.max(z, h1); }
    if (z < r.z1) out.push({ x0: a, x1: bb, z0: z, z1: r.z1 });
  }
  return out;
}
