// Procedural town: districts of themed buildings (homes, shops, pharmacy,
// hospital, offices, skyscrapers, police, military sites), roads, trees,
// cars and lootable containers whose contents fit where they are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SpatialHash } from './collision.js';
import { CONTAINER_TYPES, rollLoot } from './items.js';
import { makeGrid, addItem } from './inventory.js';

export const HALF = 120;      // map half-size
// Bump when generation changes so old saves don't map loot onto new layouts.
export const WORLD_VERSION = 2;
const BLOCK = 40;             // road grid spacing
const ROAD = 8;
const WALL_H = 3.0;
const WALL_T = 0.3;
const DOOR = 1.8;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The world is generated deterministically from a seed so a saved game only
// needs to store what changed (container contents, doors, structures).
export function buildWorld(scene, seed) {
  const rand = mulberry32(seed);
  const rnd = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const hash = new SpatialHash(6);
  const walls = [];       // {x,z,w,d,h,y,color}
  const containers = [];
  const buildings = [];
  const trees = [];
  const doors = [];
  const beds = [];
  const group = new THREE.Group();
  scene.add(group);

  const ctAssets = {}; // shared geometry/material per container type
  const addBox = (minX, minZ, maxX, maxZ, props) => {
    const b = { minX, minZ, maxX, maxZ, blocksShot: true, blocksSight: true, h: WALL_H, ...props };
    hash.insert(b);
    return b;
  };

  // --- ground & roads ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 80, HALF * 2 + 80),
    new THREE.MeshStandardMaterial({ color: 0x3d4a2c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2d, roughness: 0.95 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a8460 });
  const roads = [];
  for (let k = -100; k <= 100; k += BLOCK) {
    for (const axis of ['x', 'z']) {
      const len = 200 + ROAD;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? ROAD : len, axis === 'x' ? len : ROAD), roadMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(axis === 'x' ? k : 0, 0.01, axis === 'x' ? 0 : k);
      m.receiveShadow = true;
      group.add(m);
      roads.push({ axis, k });
      for (let s = -100; s < 100; s += 6) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? 0.15 : 2.5, axis === 'x' ? 2.5 : 0.15), lineMat);
        l.rotation.x = -Math.PI / 2;
        l.position.set(axis === 'x' ? k : s, 0.02, axis === 'x' ? s : k);
        group.add(l);
      }
    }
  }

  function addDoor(x, z, ax, closed) {
    const pivot = new THREE.Group();
    const half = DOOR / 2;
    // Hinge at one end of the gap; the panel swings 90 degrees when opened.
    pivot.position.set(ax === 'x' ? x - half : x, 0, ax === 'x' ? z : z - half);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DOOR - 0.04, 2.15, 0.07), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }));
    panel.position.set(half, 1.08, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: 0xccaa55, metalness: 0.8 }));
    knob.position.set(DOOR - 0.2, 1.0, 0.06);
    panel.castShadow = true;
    pivot.add(panel, knob);
    if (ax === 'z') pivot.rotation.y = -Math.PI / 2;
    pivot.userData.dynamic = true; // swings open: never merged
    group.add(pivot);
    const t = 0.08;
    const box = addBox(ax === 'x' ? x - half : x - t, ax === 'x' ? z - t : z - half, ax === 'x' ? x + half : x + t, ax === 'x' ? z + t : z + half, { h: 2.2 });
    const d = { kind: 'door', name: 'Door', x, z, ax, open: false, hp: 400, maxHp: 400, box, mesh: pivot, baseRot: pivot.rotation.y, index: doors.length };
    box.structure = d;
    doors.push(d);
    setDoor(d, !closed);
    return d;
  }

  function addBed(x, z, rot, sheetColor) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.0), new THREE.MeshStandardMaterial({ color: 0x5a4030 }));
    frame.position.y = 0.22;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 1.7), new THREE.MeshStandardMaterial({ color: sheetColor ?? pick([0x6a7a9a, 0x9a6a6a, 0x7a8a6a]) }));
    sheet.position.set(0, 0.5, 0.12);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pillow.position.set(0, 0.52, -0.8);
    g.add(frame, sheet, pillow);
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    group.add(g);
    addBox(x - 0.5, z - 1.0, x + 0.5, z + 1.0, { blocksSight: false, h: 0.55 });
    beds.push({ kind: 'bed', name: 'Bed', x, z, mesh: g });
  }

  function addWall(minX, minZ, maxX, maxZ, color) {
    walls.push({ minX, maxX, minZ, maxZ, y0: 0, y1: WALL_H, color });
    addBox(minX, minZ, maxX, maxZ, {});
  }

  // Containers created during generation roll seeded loot; ones added later
  // (zombie corpses, drops) use Math.random and are saved explicitly.
  function addContainer(type, x, z, rot = 0, opts = { rng: true }) {
    const ct = CONTAINER_TYPES[type];
    const [sw, sh, sd] = ct.size;
    const grid = makeGrid(ct.w, ct.h);
    const [lo, hi] = ct.rolls;
    const rng = opts.rng ? rand : Math.random;
    for (const it of rollLoot(type, Math.floor(lo + rng() * (hi + 1 - lo)), rng)) addItem(grid, it);
    const c = { kind: 'container', type, name: ct.name, x, z, grid };
    if (sw > 0) {
      if (!ctAssets[type]) ctAssets[type] = [new THREE.BoxGeometry(sw, sh, sd), new THREE.MeshStandardMaterial({ color: ct.color, roughness: 0.7 })];
      const m = new THREE.Mesh(...ctAssets[type]);
      m.position.set(x, sh / 2, z);
      m.rotation.y = rot;
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      c.mesh = m;
      c.y = sh;
      const rw = Math.abs(Math.cos(rot)) > 0.5 ? sw : sd, rd = Math.abs(Math.cos(rot)) > 0.5 ? sd : sw;
      addBox(x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2, { blocksSight: false, h: sh });
    }
    containers.push(c);
    return c;
  }

  // --- buildings ---
  // Archetypes: look, signage, interior layout and which containers go where.
  // Loot follows a building's purpose (pills in pharmacies, paperwork in
  // offices, rifles only at military sites).
  const KINDS = {
    house: { floor: 0x6b5a45, wall: [0xb8a68a, 0x9c8b77, 0xa7a29a, 0x8c7a6a], wallLoot: ['fridge', 'cabinet', 'cabinet', 'pc', 'toolbox'], beds: 1 },
    shop: { floor: 0x55585a, wall: [0x7a8a9a, 0x8a7a6a], sign: { text: 'GENERAL STORE', bg: '#6a5a3a' }, wallLoot: ['cabinet', 'foodshelf', 'fridge', 'crate', 'toolbox'] },
    clinic: { floor: 0xc8c8c0, wall: [0xd8d8d0], sign: { text: 'CLINIC', bg: '#2a6a9a', cross: true }, wallLoot: ['medbox', 'medbox', 'medcab', 'pc', 'pillshelf'], zombies: { type: 'patient', n: 3 } },
    warehouse: { floor: 0x4a4a48, wall: [0x6a6a5a, 0x5a6050], wallLoot: ['crate', 'toolbox', 'cabinet', 'lumber', 'lumber', 'toolshelf'] },
    pharmacy: { floor: 0xd8dcd8, wall: [0xe0e4e0, 0xcfd8d0], sign: { text: 'PHARMACY', bg: '#1f7a3a', cross: true }, wallLoot: ['pillshelf', 'pillshelf', 'medcab', 'fridge'], aisles: { type: 'pillshelf', rows: 2 }, zombies: { n: 3 } },
    hospital: { floor: 0xd0d4d0, wall: [0xe4e4dc], sign: { text: 'HOSPITAL', bg: '#a02020', cross: true }, corridor: true, roomLoot: ['medcab', 'surgical', 'medbox', 'pillshelf', 'medcab'], wardBeds: true, storeys: 3, zombies: { type: 'patient', n: 16 } },
    office: { floor: 0x5a5e62, wall: [0x8a9098, 0x9a8a7a], sign: { company: true, bg: '#2a3a5a' }, desks: true, wallLoot: ['filing', 'filing', 'filing', 'pc', 'server', 'fridge'], storeys: 2, zombies: { n: 5 } },
    skyscraper: { floor: 0x4a4e52, wall: [0x6a7a8a, 0x5a6470], sign: { company: true, bg: '#14141e' }, corridor: true, roomLoot: ['desk', 'desk', 'filing', 'pc', 'server', 'safe'], roomDesks: true, tower: true, zombies: { n: 9 } },
    police: { floor: 0x5a5a60, wall: [0x7a8aa0], sign: { text: 'POLICE', bg: '#1a3a8a' }, corridor: true, roomLoot: ['policelocker', 'policelocker', 'evidence', 'desk', 'filing'], storeys: 2, zombies: { n: 5 } },
    grocery: { floor: 0xb0aca0, wall: [0xa89878, 0x9a8a6a], sign: { text: 'GROCERY', bg: '#8a5a1a' }, aisles: { type: 'foodshelf', rows: 3 }, wallLoot: ['fridge', 'fridge', 'fridge', 'foodshelf'], zombies: { n: 5 } },
    hardware: { floor: 0x7a7468, wall: [0x9a6a3a, 0x8a7a5a], sign: { text: 'HARDWARE', bg: '#8a3a1a' }, aisles: { type: 'toolshelf', rows: 2 }, wallLoot: ['lumber', 'lumber', 'toolbox', 'toolshelf'], zombies: { n: 3 } },
    gas: { floor: 0x8a8a84, wall: [0xd8d0c0], sign: { text: 'FUEL & SNACKS', bg: '#b03a1a' }, wallLoot: ['foodshelf', 'fridge', 'cabinet', 'foodshelf'] },
    military: { floor: 0x5a5a4a, wall: [0x5a6a4a], sign: { text: 'COMMAND POST', bg: '#3a4a2a' }, wallLoot: ['milcrate', 'duffel', 'ammobox', 'milcrate', 'surgical'] },
  };
  const COMPANIES = ['VERTEX CAPITAL', 'NORDLINE LOGISTICS', 'HALVERSEN & KLINE', 'OKAFOR DYNAMICS', 'MERIDIAN INSURANCE', 'GREYSTONE PARTNERS', 'ARKWELL ENERGY', 'LUMEN BIOTECH'];
  const companies = shuffle([...COMPANIES]); // each firm appears once
  const zombieSpawns = [];
  const landmarks = [];

  // Canvas-texture sign mounted on the outside of a wall.
  function sign(text, bg, cross, x, z, side) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 112);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 102);
    let tx = 256;
    if (cross) {
      g.fillStyle = '#fff';
      g.fillRect(34, 40, 52, 32); g.fillRect(44, 30, 32, 52);
      tx = 290;
    }
    g.fillStyle = '#fff'; g.font = `bold ${text.length > 13 ? 38 : 48}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, tx, 58);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.75), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 }));
    const out = 0.2;
    if (side === 'n') { m.position.set(x, 2.62, z - out); m.rotation.y = Math.PI; }
    else if (side === 's') { m.position.set(x, 2.62, z + out); }
    else if (side === 'w') { m.position.set(x - out, 2.62, z); m.rotation.y = -Math.PI / 2; }
    else { m.position.set(x + out, 2.62, z); m.rotation.y = Math.PI / 2; }
    group.add(m);
  }

  // Shared window textures for upper storeys and towers (some windows lit).
  const windowTex = [0, 1, 2].map((v) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const e = document.createElement('canvas'); e.width = e.height = 128;
    const g = c.getContext('2d'), ge = e.getContext('2d');
    g.fillStyle = '#5a5e64'; g.fillRect(0, 0, 128, 128);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const lit = rand() < 0.18 + v * 0.06;
      g.fillStyle = lit ? '#c8b070' : '#1e2630';
      g.fillRect(i * 32 + 5, j * 32 + 8, 22, 18);
      if (lit) { ge.fillStyle = '#ffd890'; ge.fillRect(i * 32 + 5, j * 32 + 8, 22, 18); }
    }
    const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
    for (const x of [t, te]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.colorSpace = THREE.SRGBColorSpace; }
    return [t, te];
  });

  function facade(cx, cz, w, d, y0, y1, tint) {
    const [t, te] = pick(windowTex);
    const mat = (rw) => {
      const a = t.clone(), b = te.clone();
      a.repeat.set(rw / 4, (y1 - y0) / 3); b.repeat.copy(a.repeat);
      a.needsUpdate = b.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: a, emissiveMap: b, emissive: 0xffe0a0, emissiveIntensity: 0.55, color: tint, roughness: 0.8 });
    };
    const top = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 1 });
    const mx = mat(w), mz = mat(d);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, y1 - y0, d), [mz, mz, top, top, mx, mx]);
    m.position.set(cx, (y0 + y1) / 2, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // A straight wall with door gaps (centres along its length). Returns the
  // door positions so doors can be hung in them.
  function wallWithGaps(ax, a0, a1, fixed, gaps, color) {
    const out = [];
    let cur = a0;
    const segs = [];
    for (const g of [...gaps].sort((p, q) => p - q)) { segs.push([cur, g - DOOR / 2]); cur = g + DOOR / 2; out.push(ax === 'x' ? { x: g, z: fixed, ax } : { x: fixed, z: g, ax }); }
    segs.push([cur, a1]);
    segs.forEach(([s0, s1], i) => {
      if (s1 - s0 > 0.05) {
        if (ax === 'x') addWall(s0, fixed - WALL_T / 2, s1, fixed + WALL_T / 2, color);
        else addWall(fixed - WALL_T / 2, s0, fixed + WALL_T / 2, s1, color);
      }
      if (i < segs.length - 1) {
        const g0 = s1, g1 = s1 + DOOR; // lintel above the doorway
        if (ax === 'x') walls.push({ minX: g0, maxX: g1, minZ: fixed - WALL_T / 2, maxZ: fixed + WALL_T / 2, y0: 2.2, y1: WALL_H, color });
        else walls.push({ minX: fixed - WALL_T / 2, maxX: fixed + WALL_T / 2, minZ: g0, maxZ: g1, y0: 2.2, y1: WALL_H, color });
      }
    });
    return out;
  }

  // Try to place a container against one of a room's walls.
  function placeAlong(rect, type, bDoors, keepOut) {
    const ct = CONTAINER_TYPES[type];
    const [sw, , sd] = ct.size;
    const { x0, x1, z0, z1 } = rect;
    for (let tries = 0; tries < 14; tries++) {
      const side = Math.floor(rand() * 4);
      let x, z, rot = 0;
      const off = WALL_T / 2 + sd / 2 + 0.03;
      if (side === 0) { x = rnd(x0 + 0.9, x1 - 0.9); z = z0 + off; }
      else if (side === 1) { x = rnd(x0 + 0.9, x1 - 0.9); z = z1 - off; rot = Math.PI; }
      else if (side === 2) { z = rnd(z0 + 0.9, z1 - 0.9); x = x0 + off; rot = Math.PI / 2; }
      else { z = rnd(z0 + 0.9, z1 - 0.9); x = x1 - off; rot = -Math.PI / 2; }
      if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.2)) continue;
      if (containers.some((c) => Math.hypot(c.x - x, c.z - z) < 1.5)) continue;
      if (keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
      return addContainer(type, x, z, rot);
    }
    return null;
  }

  function prop(w, h, d, color, x, y, z, rot = 0, collide = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (collide) addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, { blocksSight: false, h: y + h / 2 });
    return m;
  }

  function building(cx, cz, w, d, kindName) {
    const kind = KINDS[kindName];
    const color = pick(kind.wall);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const zc = cz + rnd(-1, 1); // corridor centre line
    const bDoors = [];
    const keepOut = [];
    const rooms = [];

    // Exterior doors: corridor buildings get doors at both corridor ends.
    const sides = shuffle(['n', 's', 'e', 'w']);
    const doorSides = kind.corridor ? new Set(['e', 'w']) : new Set(sides.slice(0, 2 + (rand() < 0.4 ? 1 : 0)));
    const gapOn = (side, a0, a1) => (doorSides.has(side) ? [kind.corridor && (side === 'e' || side === 'w') ? zc : rnd(a0 + 2, a1 - 2)] : []);
    bDoors.push(...wallWithGaps('x', x0, x1, z0, gapOn('n', x0, x1), color));
    bDoors.push(...wallWithGaps('x', x0, x1, z1, gapOn('s', x0, x1), color));
    bDoors.push(...wallWithGaps('z', z0, z1, x0, gapOn('w', z0, z1), color));
    bDoors.push(...wallWithGaps('z', z0, z1, x1, gapOn('e', z0, z1), color));
    const outerDoors = [...bDoors];

    if (kind.corridor) {
      // A corridor runs east-west; rooms open off it on both sides.
      const cw = 1.6;
      const roomW = 5.5;
      const nRooms = Math.max(2, Math.floor((w - 1) / roomW));
      const step = w / nRooms;
      const northGaps = [], southGaps = [];
      for (let i = 0; i < nRooms; i++) {
        const rx0 = x0 + i * step, rx1 = x0 + (i + 1) * step;
        const mid = (rx0 + rx1) / 2;
        northGaps.push(mid); southGaps.push(mid + rnd(-0.6, 0.6));
        if (i > 0) {
          addWall(rx0 - WALL_T / 2, z0, rx0 + WALL_T / 2, zc - cw, color);
          addWall(rx0 - WALL_T / 2, zc + cw, rx0 + WALL_T / 2, z1, color);
        }
        rooms.push({ x0: rx0, x1: rx1, z0, z1: zc - cw, side: 'n' }, { x0: rx0, x1: rx1, z0: zc + cw, z1, side: 's' });
      }
      bDoors.push(...wallWithGaps('x', x0, x1, zc - cw, northGaps, color));
      bDoors.push(...wallWithGaps('x', x0, x1, zc + cw, southGaps, color));
    } else if (w > 12 && !kind.aisles && !kind.desks) {
      // Interior partition with a doorway
      const px = rnd(x0 + 5, x1 - 5);
      const dc = rnd(z0 + 2, z1 - 2);
      bDoors.push(...wallWithGaps('z', z0, z1, px, [dc], color));
      keepOut.push(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: px, z: z0 + (i + 0.5) * (d / 8), r: 1.0 })));
      rooms.push({ x0, x1: px, z0, z1 }, { x0: px, x1, z0, z1 });
    } else rooms.push({ x0, x1, z0, z1 });

    // Floor, ceiling/roof, upper storeys, tower
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), new THREE.MeshStandardMaterial({ color: kind.floor, roughness: 0.9 }));
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    group.add(floor);
    const storeys = kind.storeys || 1;
    const roofY = WALL_H * storeys;
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 1 }));
    ceil.position.set(cx, WALL_H + 0.12, cz);
    ceil.castShadow = ceil.receiveShadow = true;
    group.add(ceil);
    if (storeys > 1) facade(cx, cz, w, d, WALL_H + 0.25, roofY, new THREE.Color(color));
    if (kind.tower) {
      const h = rnd(30, 52);
      facade(cx, cz, w - 2, d - 2, roofY + 0.25, h, new THREE.Color(0x8a9aaa));
      prop(1.2, 4, 1.2, 0x555555, cx + w / 4, h + 2, cz); // rooftop antenna mast
    }
    for (const r of rooms) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: 0x777766 }));
      lamp.position.set((r.x0 + r.x1) / 2, WALL_H - 0.03, (r.z0 + r.z1) / 2);
      group.add(lamp);
    }

    // Store aisles: rows of shelving through the middle of the floor.
    if (kind.aisles) {
      const rows = kind.aisles.rows;
      for (let r = 0; r < rows; r++) {
        const z = z0 + ((r + 1) * d) / (rows + 1);
        for (let x = x0 + 2.6; x < x1 - 2.6; x += 1.75) {
          if (Math.abs(x - cx) < 1.1) continue; // cross-aisle
          if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.4)) continue;
          addContainer(kind.aisles.type, x, z, 0);
        }
        keepOut.push({ x: cx, z, r: w / 2 });
      }
      // Checkout counter near a door
      const dr = outerDoors[0];
      if (dr) {
        const inX = Math.max(x0 + 2, Math.min(x1 - 2, dr.x + (dr.x <= x0 + 0.2 ? 2 : dr.x >= x1 - 0.2 ? -2 : 1.8)));
        const inZ = Math.max(z0 + 1.2, Math.min(z1 - 1.2, dr.z + (dr.z <= z0 + 0.2 ? 1.6 : dr.z >= z1 - 0.2 ? -1.6 : 0)));
        if (!containers.some((c) => Math.hypot(c.x - inX, c.z - inZ) < 1.6)) addContainer('cabinet', inX, inZ, 0);
      }
    }

    // Open-plan office: a grid of desks with chairs and monitors.
    const deskGrid = (r) => {
      for (let z = r.z0 + 1.8; z < r.z1 - 1.4; z += 2.6) {
        for (let x = r.x0 + 1.9; x < r.x1 - 1.6; x += 2.4) {
          if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.2)) continue;
          if (containers.some((c) => Math.hypot(c.x - x, c.z - z) < 1.4)) continue;
          addContainer('desk', x, z, 0);
          prop(0.5, 0.32, 0.05, 0x111111, x, 0.92, z - 0.15); // monitor
          prop(0.45, 0.45, 0.45, 0x2a2a2a, x, 0.23, z + 0.62); // chair
        }
      }
    };
    if (kind.desks) for (const r of rooms) deskGrid(r);

    // Containers against the walls of each room
    if (kind.corridor) {
      for (const r of rooms) {
        if (kind.wardBeds && r.side === 'n') {
          // Hospital wards: beds against the outer wall
          for (let bx = r.x0 + 1.2; bx < r.x1 - 1.0; bx += 1.8) {
            if (bDoors.some((dr) => Math.hypot(dr.x - bx, dr.z - (r.z0 + 1.1)) < 2.0)) continue;
            addBed(bx, r.z0 + WALL_T / 2 + 1.05, 0, 0xe8ecec);
          }
          if (rand() < 0.6) placeAlong(r, 'medcab', bDoors, keepOut);
          continue;
        }
        if (kind.roomDesks && rand() < 0.6) { deskGrid({ x0: r.x0 + 0.3, x1: r.x1, z0: r.z0, z1: r.z1 }); }
        const n = 1 + Math.floor(rand() * 2.5);
        for (let i = 0; i < n; i++) placeAlong(r, pick(kind.roomLoot), bDoors, keepOut);
      }
    } else {
      const n = Math.floor(rnd(2, 4 + (w * d) / 120));
      for (let i = 0; i < n; i++) placeAlong(rooms[Math.floor(rand() * rooms.length)], pick(kind.wallLoot), bDoors, keepOut);
    }
    // Houses get a bed you can sleep in.
    if (kind.beds) {
      for (let tries = 0; tries < 10; tries++) {
        const bx = rnd(x0 + 1.2, x1 - 1.2), bz = z0 + WALL_T / 2 + 1.05;
        if (bDoors.some((dr) => Math.hypot(dr.x - bx, dr.z - bz) < 2.4)) continue;
        if (keepOut.some((k) => Math.hypot(k.x - bx, k.z - bz) < k.r + 0.4)) continue;
        if (containers.some((c) => Math.hypot(c.x - bx, c.z - bz) < 1.8)) continue;
        addBed(bx, bz, 0);
        break;
      }
    }
    for (const dr of bDoors) addDoor(dr.x, dr.z, dr.ax, rand() < 0.75);

    // Sign over the first outside door
    let name = null;
    if (kind.sign) {
      name = kind.sign.company ? companies.pop() || pick(COMPANIES) : kind.sign.text;
      const dr = outerDoors[0];
      if (dr) {
        const side = dr.ax === 'x' ? (Math.abs(dr.z - z0) < 0.01 ? 'n' : 's') : (Math.abs(dr.x - x0) < 0.01 ? 'w' : 'e');
        sign(name, kind.sign.bg, kind.sign.cross, dr.x, dr.z, side);
      }
      const labels = { shop: 'General Store', police: 'Police Station', grocery: 'Grocery Store', hardware: 'Hardware Store', gas: 'Gas Station', military: 'Command Post' };
      landmarks.push({ x: cx, z: cz, name: kind.sign.company ? name : labels[kindName] || name[0] + name.slice(1).toLowerCase(), kind: kindName });
    }
    if (kind.zombies) zombieSpawns.push({ x: cx, z: cz, r: Math.min(w, d) / 2 - 1, n: kind.zombies.n, type: kind.zombies.type || null });
    const b = { x0, x1, z0, z1, kind: kindName, name, doors: bDoors, index: buildings.length };
    buildings.push(b);
    return b;
  }

  // ---------- military ----------
  function sandbags(x, z, len, rot) {
    // A low wall of sandbags (stops bullets below ~1.1 m)
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a58, roughness: 1 });
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < Math.round(len / 0.6); i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.32, 0.42), mat);
        b.position.set(-len / 2 + 0.3 + i * 0.6 + (row % 2) * 0.15, 0.17 + row * 0.33, 0);
        b.rotation.y = rnd(-0.05, 0.05);
        b.castShadow = b.receiveShadow = true;
        g.add(b);
      }
    }
    g.position.set(x, 0, z); g.rotation.y = rot;
    group.add(g);
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hw = (len * c + 0.45 * s) / 2, hd = (len * s + 0.45 * c) / 2;
    addBox(x - hw, z - hd, x + hw, z + hd, { blocksSight: false, h: 1.05 });
  }

  function barrier(x, z, rot) {
    // Concrete jersey barrier
    prop(2.0, 0.85, 0.5, 0x9a9a92, x, 0.42, z, rot);
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    addBox(x - (2 * c + 0.5 * s) / 2, z - (2 * s + 0.5 * c) / 2, x + (2 * c + 0.5 * s) / 2, z + (2 * s + 0.5 * c) / 2, { blocksSight: false, h: 0.85 });
  }

  function tent(x, z, rot) {
    // Enterable army tent: three canvas walls, open front, crates inside.
    const g = new THREE.Group();
    const canvas = new THREE.MeshStandardMaterial({ color: 0x4e5a3a, roughness: 1, side: THREE.DoubleSide });
    const W = 4, D = 5.5, H = 2.2;
    const wall = (w, d, px, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), canvas); m.position.set(px, H / 2, pz); g.add(m); };
    wall(W, 0.08, 0, -D / 2); wall(0.08, D, -W / 2, 0); wall(0.08, D, W / 2, 0);
    for (const sgn of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.06, D + 0.3), canvas);
      r.position.set(sgn * W * 0.26, H + 0.45, 0); r.rotation.z = -sgn * 0.42;
      g.add(r);
    }
    g.position.set(x, 0, z); g.rotation.y = rot;
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    group.add(g);
    // Colliders for the three walls (rotation in 90° steps)
    const pts = [[0, -D / 2, W, 0.1], [-W / 2, 0, 0.1, D], [W / 2, 0, 0.1, D]];
    const cs = Math.round(Math.cos(rot)), sn = Math.round(Math.sin(rot));
    for (const [px, pz, w, d] of pts) {
      const wx = x + px * cs + pz * sn, wz = z - px * sn + pz * cs;
      const ww = Math.abs(cs) ? w : d, dd = Math.abs(cs) ? d : w;
      addBox(wx - ww / 2, wz - dd / 2, wx + ww / 2, wz + dd / 2, { h: H });
    }
    for (const [px, pz, type] of [[-1.2, -1.6, 'milcrate'], [1.2, -1.8, pick(['duffel', 'ammobox', 'milcrate'])], [1.2, 0.6, pick(['duffel', 'surgical', 'ammobox'])]]) {
      addContainer(type, x + px * cs + pz * sn, z - px * sn + pz * cs, rot);
    }
  }

  function watchtower(x, z) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      prop(0.18, 4.4, 0.18, 0x5a4a32, x + dx, 2.2, z + dz);
      addBox(x + dx - 0.1, z + dz - 0.1, x + dx + 0.1, z + dz + 0.1, { blocksSight: false, h: 4.4 });
    }
    prop(2.6, 0.15, 2.6, 0x5a4a32, x, 4.4, z);
    prop(2.6, 0.9, 0.08, 0x4e5a3a, x, 4.9, z - 1.3);
    prop(2.6, 0.9, 0.08, 0x4e5a3a, x, 4.9, z + 1.3);
    prop(0.08, 0.9, 2.6, 0x4e5a3a, x - 1.3, 4.9, z);
    prop(2.9, 0.1, 2.9, 0x3a3a2a, x, 6.2, z);
  }

  function militaryCompound(lx0, lx1, lz0, lz1) {
    const cx = (lx0 + lx1) / 2, cz = (lz0 + lz1) / 2;
    // Chain-link fence with a gate facing the town centre
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x8a8e90, transparent: true, opacity: 0.45, roughness: 0.6, side: THREE.DoubleSide });
    const gx = cx > 0 ? lx0 : lx1; // gate side (towards x = 0)
    const fence = (ax, a0, a1, fixed, gate) => {
      const segs = gate ? [[a0, (a0 + a1) / 2 - 2.5], [(a0 + a1) / 2 + 2.5, a1]] : [[a0, a1]];
      for (const [s0, s1] of segs) {
        const len = s1 - s0, mid = (s0 + s1) / 2;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.4), fenceMat);
        if (ax === 'x') { m.position.set(mid, 1.2, fixed); addBox(s0, fixed - 0.05, s1, fixed + 0.05, { blocksSight: false, blocksShot: false, h: 2.4 }); }
        else { m.position.set(fixed, 1.2, mid); m.rotation.y = Math.PI / 2; addBox(fixed - 0.05, s0, fixed + 0.05, s1, { blocksSight: false, blocksShot: false, h: 2.4 }); }
        group.add(m);
        for (let p = s0; p <= s1 + 0.01; p += 3) prop(0.08, 2.5, 0.08, 0x666a6c, ax === 'x' ? p : fixed, 1.25, ax === 'x' ? fixed : p);
      }
    };
    fence('x', lx0, lx1, lz0, false);
    fence('x', lx0, lx1, lz1, false);
    fence('z', lz0, lz1, lx0, gx === lx0);
    fence('z', lz0, lz1, lx1, gx === lx1);
    barrier(gx + (cx > 0 ? -1.5 : 1.5), cz - 3.2, Math.PI / 2);
    barrier(gx + (cx > 0 ? -1.5 : 1.5), cz + 3.2, Math.PI / 2);
    // Command post, tents, watchtowers, sandbag nests, vehicles, helipad
    const far = cx > 0 ? lx1 - 7 : lx0 + 7; // back of the compound
    building(far, cz, 10, 9, 'military');
    tent(cx + (cx > 0 ? -2 : 2), lz0 + 4.5, 0);
    tent(cx + (cx > 0 ? -2 : 2), lz1 - 4.5, Math.PI);
    watchtower(lx0 + 2, lz0 + 2);
    watchtower(lx1 - 2, lz1 - 2);
    sandbags(gx + (cx > 0 ? 3 : -3), cz - 5, 3, Math.PI / 2);
    sandbags(gx + (cx > 0 ? 3 : -3), cz + 5, 3, Math.PI / 2);
    car(cx, cz + 1, Math.PI / 2 + rnd(-0.2, 0.2), 'military');
    const pad = new THREE.Mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshStandardMaterial({ color: 0x5a5a52 }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.02, cz - 1); group.add(pad);
    const hMark = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8), new THREE.MeshBasicMaterial({ color: 0xd8d0b0 }));
    hMark.rotation.x = -Math.PI / 2; hMark.position.set(cx, 0.03, cz - 1); group.add(hMark);
    for (let i = 0; i < 3; i++) { const c = addContainer('soldier', cx + rnd(-6, 6), cz + rnd(-8, 8)); c.mesh = corpseMesh(group, c.x, c.z, 0x4a5a3a, rand() * 6.3); }
    zombieSpawns.push({ x: cx, z: cz, r: 10, n: 12, type: 'soldier' });
    landmarks.push({ x: cx, z: cz, name: 'Military Outpost', kind: 'military' });
    buildings.push({ x0: lx0, x1: lx1, z0: lz0, z1: lz1, kind: 'compound', name: 'Military Outpost', doors: [], index: buildings.length, area: true });
  }

  // A roadblock on a street: barriers, sandbag nests, a guard booth,
  // a military truck and supplies — guarded by dead soldiers.
  function checkpoint(road, along) {
    const onX = road.axis === 'x'; // road runs along z at x = road.k
    const P = (across, al) => (onX ? [road.k + across, al] : [al, road.k + across]);
    const rotAcross = onX ? 0 : Math.PI / 2;
    for (const a of [-2.6, 2.6]) { const [x, z] = P(a, along); barrier(x, z, rotAcross); }
    for (const a of [-3.3, 3.3]) { const [x, z] = P(a, along - 3); sandbags(x, z, 1.8, rotAcross); }
    const [bx, bz] = P(3.0, along + 3.5);
    prop(2, 2.4, 2, 0x5a6a4a, bx, 1.2, bz, 0, true); // guard booth
    prop(2.2, 0.12, 2.2, 0x3a3a2a, bx, 2.46, bz);
    const crates = [['milcrate', -3.0, along + 1.2], ['ammobox', -3.2, along + 3], ['duffel', 3.1, along + 6]];
    for (const [t, a, al] of crates) { const [x, z] = P(a, al); addContainer(t, x, z, rotAcross); }
    const [tx, tz] = P(-2.2, along + 9);
    car(tx, tz, onX ? rnd(-0.15, 0.15) : Math.PI / 2 + rnd(-0.15, 0.15), 'military');
    for (let i = 0; i < 2; i++) { const [x, z] = P(rnd(-3, 3), along + rnd(-4, 4)); const c = addContainer('soldier', x, z); c.mesh = corpseMesh(group, x, z, 0x4a5a3a, rand() * 6.3); }
    const [cx, cz] = P(0, along);
    zombieSpawns.push({ x: cx, z: cz, r: 7, n: 5, type: 'soldier' });
    landmarks.push({ x: cx, z: cz, name: 'Checkpoint', kind: 'checkpoint' });
  }

  // ---------- districts ----------
  // The centre block is downtown (skyscraper), the ring around it is the
  // commercial/civic district, and the outer ring is residential with
  // industry, a gas station and a military outpost in one corner.
  const lotKinds = new Map();
  const ring1 = shuffle(['hospital', 'office', 'office', 'police', 'pharmacy', 'grocery', rand() < 0.6 ? 'skyscraper' : 'office', 'shop']);
  const outer = [];
  const corners = [];
  for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 5; iz++) {
    const ring = Math.max(Math.abs(ix - 2), Math.abs(iz - 2));
    if (ring === 0) lotKinds.set(`${ix},${iz}`, 'skyscraper');
    else if (ring === 1) lotKinds.set(`${ix},${iz}`, ring1.pop());
    else { outer.push(`${ix},${iz}`); if ((ix === 0 || ix === 4) && (iz === 0 || iz === 4)) corners.push(`${ix},${iz}`); }
  }
  lotKinds.set(pick(corners), 'militaryBase');
  const outerKinds = shuffle(['pharmacy', 'hardware', 'gas', 'warehouse', 'warehouse', 'clinic', 'park', 'parking', 'shop']);
  for (const k of shuffle(outer)) if (!lotKinds.has(k)) lotKinds.set(k, outerKinds.pop() || 'houses');

  for (let ix = 0; ix < 5; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      const bx = -100 + ix * BLOCK, bz = -100 + iz * BLOCK;
      const lx0 = bx + ROAD / 2 + 2, lx1 = bx + BLOCK - ROAD / 2 - 2;
      const lz0 = bz + ROAD / 2 + 2, lz1 = bz + BLOCK - ROAD / 2 - 2;
      const mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2;
      const kind = lotKinds.get(`${ix},${iz}`);
      if (kind === 'park') { for (let i = 0; i < 6; i++) trees.push([rnd(lx0, lx1), rnd(lz0, lz1)]); continue; }
      if (kind === 'parking') { for (let i = 0; i < 4; i++) car(rnd(lx0 + 3, lx1 - 3), rnd(lz0 + 3, lz1 - 3), rand() < 0.5 ? 0 : Math.PI / 2); continue; }
      if (kind === 'militaryBase') { militaryCompound(lx0, lx1, lz0, lz1); continue; }
      if (kind === 'houses') {
        if (rand() < 0.6) {
          building((lx0 + mx) / 2, mz + rnd(-3, 3), rnd(9, 12), rnd(9, 14), 'house');
          building((mx + lx1) / 2, mz + rnd(-3, 3), rnd(9, 12), rnd(9, 14), 'house');
        } else building(mx + rnd(-2, 2), mz + rnd(-2, 2), rnd(13, 18), rnd(10, 15), 'house');
        continue;
      }
      if (kind === 'hospital') { building(mx, mz, rnd(25, 27), rnd(22, 25), 'hospital'); car(lx0 + 2, lz1 - 1, 0); continue; }
      if (kind === 'skyscraper') { building(mx, mz, rnd(21, 25), rnd(20, 24), 'skyscraper'); continue; }
      if (kind === 'office') { building(mx + rnd(-1, 1), mz - 2, rnd(18, 23), rnd(13, 16), 'office'); car(mx - 4, lz1 - 1.5, Math.PI / 2); car(mx + 3, lz1 - 1.5, Math.PI / 2); continue; }
      if (kind === 'police') { building(mx, mz - 2, rnd(18, 22), rnd(14, 16), 'police'); car(mx - 3, lz1 - 1.5, Math.PI / 2, 'police'); car(mx + 3, lz1 - 1.5, Math.PI / 2, 'police'); continue; }
      if (kind === 'pharmacy') {
        // A pharmacy next to a house or small shop
        building((lx0 + mx) / 2, mz + rnd(-2, 2), rnd(11, 13), rnd(10, 12), 'pharmacy');
        building((mx + lx1) / 2, mz + rnd(-2, 2), rnd(9, 12), rnd(9, 12), rand() < 0.5 ? 'house' : 'shop');
        continue;
      }
      if (kind === 'gas') {
        building(mx + 6, mz + 6, 10, 8, 'gas');
        // Fuel canopy with pumps
        for (const [dx, dz] of [[-5, -3], [3, -3], [-5, -9], [3, -9]]) { prop(0.3, 4.5, 0.3, 0xd8d8d8, mx + dx - 4, 2.25, mz + dz); addBox(mx + dx - 4.15, mz + dz - 0.15, mx + dx - 3.85, mz + dz + 0.15, { blocksSight: false, h: 4.5 }); }
        prop(10, 0.4, 8, 0xb03a1a, mx - 5, 4.6, mz - 6);
        for (const dx of [-7, -3]) { prop(0.6, 1.4, 0.9, 0x8a2a1a, mx + dx, 0.7, mz - 6, 0, true); }
        car(mx - 5, mz - 1.5, Math.PI / 2);
        continue;
      }
      const big = kind === 'warehouse' || kind === 'grocery' || kind === 'hardware';
      building(mx + rnd(-2, 2), mz + rnd(-2, 2), big ? rnd(20, 25) : rnd(13, 20), big ? rnd(16, 21) : rnd(10, 16), kind);
    }
  }

  // Military checkpoints on the streets (not at intersections)
  const xRoads = roads.filter((r) => Math.abs(r.k) < 100);
  for (let i = 0; i < 3; i++) {
    const road = pick(xRoads);
    const seg = Math.floor(rand() * 5);
    checkpoint(road, -100 + seg * BLOCK + 20 + rnd(-4, 4));
  }

  // Forest ring outside the town
  for (let i = 0; i < 420; i++) {
    const x = rnd(-HALF, HALF), z = rnd(-HALF, HALF);
    if (Math.abs(x) < 106 && Math.abs(z) < 106) continue;
    trees.push([x, z]);
  }

  // Abandoned cars on roads
  for (let i = 0; i < 26; i++) {
    const road = pick(roads);
    const along = rnd(-95, 95);
    const off = rnd(-2, 2);
    const rot = road.axis === 'x' ? Math.PI / 2 + rnd(-0.3, 0.3) : rnd(-0.3, 0.3);
    if (road.axis === 'x') car(road.k + off, along, rot); else car(along, road.k + off, rot);
  }

  // style: undefined (civilian), 'police' or 'military' (canvas-backed truck)
  function car(x, z, rot, style) {
    const g = new THREE.Group();
    const mil = style === 'military';
    const col = mil ? 0x4a5a3a : style === 'police' ? 0xe8e8e8 : pick([0x6a2222, 0x22446a, 0x555555, 0x887744, 0x2a4a2a, 0xcccccc]);
    const L = mil ? 6.2 : 4.2, W = mil ? 2.3 : 1.9;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, mil ? 1.1 : 0.8, L), new THREE.MeshStandardMaterial({ color: col, roughness: mil ? 0.9 : 0.5, metalness: mil ? 0.1 : 0.3 }));
    body.position.y = mil ? 0.95 : 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, mil ? 1.0 : 0.6, mil ? 1.8 : 2.2), new THREE.MeshStandardMaterial({ color: mil ? 0x3e4c30 : 0x223, roughness: 0.4, metalness: 0.4 }));
    cab.position.set(0, mil ? 2.0 : 1.3, mil ? L / 2 - 1.1 : -0.2);
    g.add(body, cab);
    if (mil) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(W, 1.4, L - 2.2), new THREE.MeshStandardMaterial({ color: 0x5a6440, roughness: 1 }));
      cover.position.set(0, 2.2, -1.0);
      g.add(cover);
    }
    if (style === 'police') {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.18, L - 0.4), new THREE.MeshStandardMaterial({ color: 0x1a3a8a }));
      stripe.position.y = 0.7; g.add(stripe);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0x3355ff, emissive: 0x2233aa, emissiveIntensity: 0.6 }));
      bar.position.set(0, 1.66, -0.2); g.add(bar);
    }
    for (const [wx, wz] of (mil ? [[-1.1, 2.1], [1.1, 2.1], [-1.1, -1.4], [1.1, -1.4], [-1.1, -2.4], [1.1, -2.4]] : [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]])) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x111 }));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.35, wz);
      g.add(wh);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    group.add(g);
    // collision approximated by AABB of rotated footprint
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hw = (W * c + L * s) / 2, hd = (W * s + L * c) / 2;
    addBox(x - hw * 0.9, z - hd * 0.9, x + hw * 0.9, z + hd * 0.9, { blocksSight: mil, h: mil ? 2.9 : 1.6 });
    if (mil) {
      // Cargo bed: military supplies at the back of the truck
      const tc = addContainer(rand() < 0.6 ? 'milcrate' : 'duffel', x - Math.sin(rot) * (L / 2 + 0.6), z - Math.cos(rot) * (L / 2 + 0.6));
      tc.name = 'Truck Cargo';
    } else if (style === 'police') {
      addContainer('policelocker', x - Math.sin(rot) * 2.5, z - Math.cos(rot) * 2.5).name = 'Patrol Car Trunk';
    } else if (rand() < 0.6) {
      const tc = addContainer('trunk', x - Math.sin(rot) * 2.3, z - Math.cos(rot) * 2.3);
      tc.y = 0.9;
    }
  }

  // Walls → one instanced mesh
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
  const m4 = new THREE.Matrix4();
  const colr = new THREE.Color();
  walls.forEach((w, i) => {
    const y0 = w.y0 ?? 0, y1 = w.y1 ?? WALL_H;
    m4.makeScale(w.maxX - w.minX, y1 - y0, w.maxZ - w.minZ);
    m4.setPosition((w.minX + w.maxX) / 2, (y0 + y1) / 2, (w.minZ + w.maxZ) / 2);
    wallMesh.setMatrixAt(i, m4);
    wallMesh.setColorAt(i, colr.set(w.color).multiplyScalar(rnd(0.92, 1.05)));
  });
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // Trees → instanced trunks + foliage
  const treeBoxes = [];
  const felled = new Set();
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), trees.length);
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 7), new THREE.MeshStandardMaterial({ color: 0x24361e, roughness: 1 }), trees.length);
  trees.forEach(([x, z], i) => {
    const s = rnd(0.8, 1.4);
    m4.makeScale(s, s, s); m4.setPosition(x, 1.5 * s, z); trunkMesh.setMatrixAt(i, m4);
    m4.makeScale(s, s, s); m4.setPosition(x, 4.5 * s, z); leafMesh.setMatrixAt(i, m4);
    treeBoxes.push(addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25, { blocksSight: false, h: 6, tree: i }));
  });
  trunkMesh.castShadow = leafMesh.castShadow = true;
  group.add(trunkMesh, leafMesh);

  // Map boundary
  for (const [a, b, c, d] of [[-HALF - 1, -HALF - 1, HALF + 1, -HALF], [-HALF - 1, HALF, HALF + 1, HALF + 1], [-HALF - 1, -HALF, -HALF, HALF], [HALF, -HALF, HALF + 1, HALF]]) {
    addBox(a, b, c, d, { h: 10 });
  }

  // Scav corpses scattered in the streets
  for (let i = 0; i < 10; i++) {
    const road = pick(roads);
    const along = rnd(-95, 95);
    const x = road.axis === 'x' ? road.k + rnd(-3, 3) : along;
    const z = road.axis === 'x' ? along : road.k + rnd(-3, 3);
    const c = addContainer('body', x, z);
    c.mesh = corpseMesh(group, x, z, 0x4a4a3a, rand() * Math.PI * 2);
  }

  mergeStatic(group);

  const generatedContainers = containers.length;
  const houses = buildings.filter((b) => b.kind === 'house');

  return {
    group, hash, containers, generatedContainers, buildings, houses, roads, trees, doors, beds, zombieSpawns, landmarks,
    addBox, addContainer: (type, x, z) => addContainer(type, x, z, 0, {}), felled,
    // Cut down a tree: hide its instances and remove its collider.
    fellTree(i) {
      if (felled.has(i)) return;
      felled.add(i);
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      trunkMesh.setMatrixAt(i, zero); leafMesh.setMatrixAt(i, zero);
      trunkMesh.instanceMatrix.needsUpdate = leafMesh.instanceMatrix.needsUpdate = true;
      hash.remove(treeBoxes[i]);
      return treeBoxes[i];
    },
    nearestTree(x, z, r) {
      let best = -1, bd = r;
      for (const b of hash.query(x - r, z - r, x + r, z + r, [])) {
        if (b.tree == null || felled.has(b.tree)) continue;
        const d = Math.hypot((b.minX + b.maxX) / 2 - x, (b.minZ + b.maxZ) / 2 - z);
        if (d < bd) { bd = d; best = b.tree; }
      }
      return best;
    },
    buildingAt(x, z) { return buildings.find((b) => !b.area && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) || null; },
    dispose: () => scene.remove(group),
  };
}

export function setDoor(d, open) {
  d.open = open;
  d.box.noCollide = open;
  d.box.blocksShot = d.box.blocksSight = !open;
  d.mesh.rotation.y = d.baseRot + (open ? Math.PI / 2 : 0);
}

export function corpseMesh(parent, x, z, color, rot = Math.random() * Math.PI * 2) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 1.4), new THREE.MeshStandardMaterial({ color }));
  body.position.y = 0.13;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0x8a7a6a }));
  head.position.set(0, 0.15, 0.85);
  const blood = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0x3a0505, transparent: true, opacity: 0.8 }));
  blood.rotation.x = -Math.PI / 2;
  blood.position.y = 0.03;
  g.add(blood, body, head);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  parent.add(g);
  return g;
}

// Batch all static, untextured, opaque scenery (furniture, props, vehicles,
// sandbags, fences...) into one mesh per material to keep draw calls low.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    if (m.map || m.transparent || m.emissiveMap) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.dynamic) return;
    const key = [m.type, m.color.getHex(), m.roughness, m.metalness, m.emissive ? m.emissive.getHex() : 0, m.side].join('|');
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv || !geo.attributes.normal) return;
    geo.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [], shadow: o.castShadow });
    buckets.get(key).geos.push(geo);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const { mat, geos, shadow } of buckets.values()) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
