// Procedural town: districts of themed buildings (homes, shops, pharmacy,
// hospital, offices, skyscrapers, police, military sites), roads, trees,
// cars and lootable containers whose contents fit where they are.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SpatialHash } from './collision.js';
import { CONTAINER_TYPES, rollLoot } from './items.js';
import { makeGrid, addItem } from './inventory.js';
import { createFurnisher, FOOT, footRect } from './furniture.js';
import { buildCountryside, plantTrees } from './countryside.js';
import { worldTextures, wallMaterial, WALL, worldUV, mergeableMaterial } from './worldtex.js';
import { Levels } from './levels.js';
import { buildStoreys, STOREYS } from './storeys.js';

export const HALF = 220;      // map half-size (town in the middle, countryside around it)
// Bump when generation changes so old saves don't map loot onto new layouts.
export const WORLD_VERSION = 5;
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
  // (the sequence can be swapped: buildings rebuilt with upper floors use their own)
  let RNG = mulberry32(seed);
  const rand = () => RNG();
  const rnd = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  // Purely cosmetic choices (wall finishes, roof clutter, floor tiles) draw
  // from their own sequence, so adding or changing them never moves a
  // building: saves store where things are by the layout.
  const drand = mulberry32((seed ^ 0x2d3c0de) >>> 0);
  const drnd = (a, b) => a + drand() * (b - a);
  const dpick = (arr) => arr[Math.floor(drand() * arr.length)];
  const hash = new SpatialHash(6);
  const walls = [];       // {x,z,w,d,h,y,color}
  const containers = [];
  const buildings = [];
  const trees = [];
  const doors = [];
  const beds = [];
  const windows = [];
  const vehicleSpawns = []; // cars and trucks (built and driven by vehicles.js)
  const pumps = [];          // gas station pumps (fuel)
  const group = new THREE.Group();
  scene.add(group);
  const fur = createFurnisher(group);

  // Garage and barn openings: nothing stands in them. Pieces placed there are
  // still rolled (the random sequence, and so the town, stays the same) but
  // left out.
  const clearZones = [];
  const inClear = (x0, z0, x1, z1) => clearZones.some((r) => x0 < r.x1 && x1 > r.x0 && z0 < r.z1 && z1 > r.z0);

  const ctAssets = {}; // shared geometry/material per container type
  const allBoxes = [];  // every collider, in order (so a building's can be found again)
  const addBox = (minX, minZ, maxX, maxZ, props) => {
    const b = { minX, minZ, maxX, maxZ, blocksShot: true, blocksSight: true, h: WALL_H, ...props };
    hash.insert(b);
    allBoxes.push(b);
    return b;
  };

  // --- ground & roads ---
  const WT = worldTextures();
  const gsize = HALF * 2 + 80;
  const grassTex = WT.grass.clone(); grassTex.needsUpdate = true; grassTex.repeat.set(gsize / 6, gsize / 6); // a tile every 6 m
  // Flat things lie a centimetre or two above the ground, closer than the
  // depth buffer can tell apart at a distance (the near plane is very close
  // for the viewmodel), so the ground and roads are pushed back in depth.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Asphalt: one texture tile per 8 m (a material for each road direction)
  const asph = (rx, ry) => { const t = WT.asphalt.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }); };
  const roadMats = { x: asph(ROAD / 8, (200 + ROAD) / 8), z: asph((200 + ROAD) / 8, ROAD / 8) };
  const walkMat = mergeableMaterial('slab', 0xb0aca4, 0.5, 0.9), curbMat = mergeableMaterial('concrete', 0x9a9890, 1, 0.9);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x8a8460 });
  const roads = [];
  for (let k = -100; k <= 100; k += BLOCK) {
    for (const axis of ['x', 'z']) {
      const len = 200 + ROAD;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? ROAD : len, axis === 'x' ? len : ROAD), roadMats[axis]);
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

  // Sidewalks with curbs along every town street, broken at the junctions
  // (also kept as a grid of rectangles: bodies lie on them, not in them)
  const walks = new Map();
  const addWalk = (r) => { for (let gx = Math.floor(r.x0 / 8); gx <= Math.floor(r.x1 / 8); gx++) for (let gz = Math.floor(r.z0 / 8); gz <= Math.floor(r.z1 / 8); gz++) { const k = gx * 1000 + gz; if (!walks.has(k)) walks.set(k, []); walks.get(k).push(r); } };
  for (const k of [-100, -60, -20, 20, 60, 100]) for (const axis of ['x', 'z']) for (const side of [-1, 1]) {
    for (let c = -100; c < 100; c += BLOCK) {
      const a0 = c + ROAD / 2 + 0.2, a1 = c + BLOCK - ROAD / 2 - 0.2, len = a1 - a0, mid = (a0 + a1) / 2;
      const off = k + side * (ROAD / 2 + 0.85);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 1.6 : len, 0.1, axis === 'x' ? len : 1.6), walkMat);
      walk.position.set(axis === 'x' ? off : mid, 0.05, axis === 'x' ? mid : off);
      walk.receiveShadow = true;
      group.add(walk);
      const coff = k + side * (ROAD / 2 + 0.05);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? 0.14 : len, 0.14, axis === 'x' ? len : 0.14), curbMat);
      curb.position.set(axis === 'x' ? coff : mid, 0.07, axis === 'x' ? mid : coff);
      group.add(curb);
      const w0 = Math.min(coff, off) - (side < 0 ? 0.8 : 0.07), w1 = Math.max(coff, off) + (side < 0 ? 0.07 : 0.8);
      addWalk(axis === 'x' ? { x0: w0, x1: w1, z0: a0, z1: a1 } : { x0: a0, x1: a1, z0: w0, z1: w1 });
    }
  }

  function addDoor(x, z, ax, closed, width = DOOR) {
    const pivot = new THREE.Group();
    const half = width / 2;
    // Hinge at one end of the gap; the panel swings 90 degrees when opened.
    pivot.position.set(ax === 'x' ? x - half : x, 0, ax === 'x' ? z : z - half);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, 2.15, 0.07), new THREE.MeshStandardMaterial({ map: WT.planks, color: width < 1.6 ? 0x9a7048 : 0x7a4e2c, roughness: 0.8 }));
    panel.position.set(half, 1.08, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: 0xccaa55, metalness: 0.8 }));
    knob.position.set(width - 0.15, 1.0, 0.06);
    panel.castShadow = true;
    pivot.add(panel, knob);
    if (ax === 'z') pivot.rotation.y = -Math.PI / 2;
    pivot.userData.dynamic = true; // swings open: never merged
    group.add(pivot);
    const t = 0.08;
    const box = addBox(ax === 'x' ? x - half : x - t, ax === 'x' ? z - t : z - half, ax === 'x' ? x + half : x + t, ax === 'x' ? z + t : z + half, { h: 2.2 });
    // The open door panel is solid too: you (and zombies) go around it.
    const r = pivot.rotation.y + Math.PI / 2, ex = Math.cos(r) * (width - 0.1), ez = -Math.sin(r) * (width - 0.1);
    const hx = pivot.position.x + Math.cos(r) * 0.1, hz = pivot.position.z - Math.sin(r) * 0.1;
    const leaf = addBox(Math.min(hx, hx + ex) - 0.05, Math.min(hz, hz + ez) - 0.05, Math.max(hx, hx + ex) + 0.05, Math.max(hz, hz + ez) + 0.05, { h: 2.2, blocksSight: false });
    const d = { kind: 'door', name: 'Door', x, z, ax, w: width, open: false, hp: 300, maxHp: 300, box, leaf, mesh: pivot, baseRot: pivot.rotation.y, index: doors.length };
    box.structure = d;
    box.door = true;
    box.decalParent = leaf.decalParent = pivot;
    box.decalInset = 0.064; leaf.decalInset = 0.034; // collider is thicker than the panel
    doors.push(d);
    setDoor(d, !closed);
    return d;
  }

  function addBed(x, z, rot, sheetColor) {
    fur.model('bed_single', x, z, rot, { sheet: sheetColor ?? pick([0x6a7a9a, 0x9a6a6a, 0x7a8a6a]) }, rand);
    addBox(x - 0.5, z - 1.0, x + 0.5, z + 1.0, { blocksSight: false, h: 0.6 });
    beds.push({ kind: 'bed', name: 'Bed', x, z });
  }

  // Finish for walls being built (set per building: outside vs inside)
  let curPattern = WALL.concrete;
  function addWall(minX, minZ, maxX, maxZ, color) {
    walls.push({ minX, maxX, minZ, maxZ, y0: 0, y1: WALL_H, color, pattern: curPattern });
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
      if (fur.has(type)) c.mesh = fur.model(type, x, z, rot, opts.model, rng);
      else {
        if (!ctAssets[type]) ctAssets[type] = [new THREE.BoxGeometry(sw, sh, sd), new THREE.MeshStandardMaterial({ color: ct.color, roughness: 0.7 })];
        const m = new THREE.Mesh(...ctAssets[type]);
        m.position.set(x, sh / 2, z);
        m.rotation.y = rot;
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
        c.mesh = m;
      }
      c.y = ct.wall ? 1.2 : sh;
      const rw = Math.abs(Math.cos(rot)) > 0.5 ? sw : sd, rd = Math.abs(Math.cos(rot)) > 0.5 ? sd : sw;
      // (keeps its mesh reference: later placement still steers around it)
      if (inClear(x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2)) { c.retired = true; c.mesh.removeFromParent(); containers.push(c); return c; }
      if (!ct.wall) addBox(x - rw / 2, z - rd / 2, x + rw / 2, z + rd / 2, { blocksSight: false, h: sh });
    }
    containers.push(c);
    return c;
  }

  // --- buildings ---
  // Archetypes: look, signage, interior layout and which containers go where.
  // Loot follows a building's purpose (pills in pharmacies, paperwork in
  // offices, rifles only at military sites).
  // Windows: width, spacing, sill and head height; shops get a big storefront
  // on the side with the front door; corridor buildings only on the room sides.
  const STORE_WIN = { w: 1.3, gap: 3.4, sill: 0.9, top: 2.1, skip: 0.35, front: { w: 2.6, gap: 3.3, sill: 0.45, top: 2.25 } };
  const CORRIDOR_WIN = { w: 1.4, gap: 2.75, sill: 0.9, top: 2.1, sides: ['n', 's'], skip: 0.05 };
  const KINDS = {
    house: { roof: { type: 'gable', color: [0x4a3a32, 0x3a3a3c, 0x5a2a22, 0x2a3a4a] }, floor: 0x6b5a45, wall: [0xb8a68a, 0x9c8b77, 0xa7a29a, 0x8c7a6a], interior: [0xd8d0c0, 0xc8d0c8, 0xd8c8b8, 0xe0dcd0, 0xc0c8d0] },
    shop: { floor: 0x55585a, wall: [0x7a8a9a, 0x8a7a6a], sign: { text: 'GENERAL STORE', bg: '#6a5a3a' }, windows: STORE_WIN, checkout: true, wallLoot: ['cabinet', 'foodshelf', 'fridge', 'crate', 'toolbox'] },
    clinic: { floor: 0xc8c8c0, wall: [0xd8d8d0], sign: { text: 'CLINIC', bg: '#2a6a9a', cross: true }, wallLoot: ['medbox', 'medbox', 'medcab', 'pc', 'pillshelf'], zombies: { type: 'patient', n: 3 } },
    warehouse: { floor: 0x4a4a48, wall: [0x6a6a5a, 0x5a6050], windows: { w: 1.6, gap: 4.5, sill: 1.9, top: 2.6, skip: 0.3 }, open: true, wallLoot: ['crate', 'toolbox', 'cabinet', 'lumber', 'lumber', 'toolshelf', 'parts_shelf', 'toolbench'] },
    pharmacy: { floor: 0xd8dcd8, wall: [0xe0e4e0, 0xcfd8d0], sign: { text: 'PHARMACY', bg: '#1f7a3a', cross: true }, windows: STORE_WIN, checkout: true, wallLoot: ['pillshelf', 'pillshelf', 'medcab', 'fridge'], aisles: { type: 'pillshelf', rows: 2 }, zombies: { n: 3 } },
    hospital: { floor: 0xd0d4d0, wall: [0xe4e4dc], sign: { text: 'HOSPITAL', bg: '#a02020', cross: true }, corridor: true, windows: CORRIDOR_WIN, roomRoles: ['exam', 'exam', 'supply', 'generic'], roomLoot: ['medcab', 'surgical', 'medbox', 'pillshelf', 'medcab'], wardBeds: true, storeys: 3, zombies: { type: 'patient', n: 16 } },
    office: { floor: 0x5a5e62, wall: [0x8a9098, 0x9a8a7a], sign: { company: true, bg: '#2a3a5a' }, windows: { w: 1.6, gap: 2.6, sill: 0.8, top: 2.3 }, desks: true, wallLoot: ['filing', 'filing', 'filing', 'pc', 'server', 'fridge'], storeys: 2, zombies: { n: 5 } },
    skyscraper: { floor: 0x4a4e52, wall: [0x6a7a8a, 0x5a6470], sign: { company: true, bg: '#14141e' }, corridor: true, windows: CORRIDOR_WIN, roomRoles: ['generic', 'generic', 'exec', 'server'], roomLoot: ['desk', 'desk', 'filing', 'pc', 'server', 'safe'], roomDesks: true, tower: true, zombies: { n: 9 } },
    police: { floor: 0x5a5a60, wall: [0x7a8aa0], sign: { text: 'POLICE', bg: '#1a3a8a' }, corridor: true, cells: true, roomRoles: ['office', 'office', 'lockers', 'evidence', 'generic'], windows: { ...CORRIDOR_WIN, sill: 1.2, w: 1.0 }, roomLoot: ['policelocker', 'policelocker', 'evidence', 'desk', 'filing'], storeys: 2, zombies: { n: 5 } },
    grocery: { floor: 0xb0aca0, wall: [0xa89878, 0x9a8a6a], sign: { text: 'GROCERY', bg: '#8a5a1a' }, windows: STORE_WIN, checkout: true, aisles: { type: 'foodshelf', rows: 3 }, wallLoot: ['fridge', 'fridge', 'fridge', 'foodshelf'], zombies: { n: 5 } },
    hardware: { floor: 0x7a7468, wall: [0x9a6a3a, 0x8a7a5a], sign: { text: 'HARDWARE', bg: '#8a3a1a' }, windows: STORE_WIN, checkout: true, aisles: { type: 'toolshelf', rows: 2 }, wallLoot: ['lumber', 'lumber', 'toolbox', 'toolshelf'], zombies: { n: 3 } },
    gas: { floor: 0x8a8a84, wall: [0xd8d0c0], sign: { text: 'FUEL & SNACKS', bg: '#b03a1a' }, windows: STORE_WIN, checkout: true, wallLoot: ['foodshelf', 'fridge', 'cabinet', 'foodshelf'] },
    mechanic: { floor: 0x5a5a58, wall: [0x8a8478, 0x6a7a8a], sign: { text: 'AUTO REPAIR', bg: '#2a4a7a' }, garage: true, open: true, windows: { w: 1.4, gap: 3.4, sill: 1.1, top: 2.2, skip: 0.3 }, wallLoot: ['parts_shelf', 'toolbench', 'tire_rack', 'toolbox'] },
    military: { floor: 0x5a5a4a, wall: [0x5a6a4a], sign: { text: 'COMMAND POST', bg: '#3a4a2a' }, windows: { w: 1.0, gap: 3.0, sill: 1.1, top: 1.9 }, wallLoot: ['milcrate', 'duffel', 'ammobox', 'milcrate', 'surgical'] },
    // Countryside
    farmhouse: { home: true, farm: true, roof: { type: 'gable', color: [0x4a3a32, 0x3a3a3c, 0x5a2a22] }, floor: 0x6b5a45, wall: [0xe8e2d4, 0xd8c8a0, 0xb8c4c8, 0xc8b89a], interior: [0xe0d8c0, 0xd8d0b8, 0xc8d0c0, 0xe8e0d0] },
    barn: { barnDoor: true, open: true, roof: { type: 'gambrel', color: [0x3a3a3c, 0x5a5048] }, floor: 0x5a4a34, wall: [0x8a2a1e, 0x7a2a20, 0x9a3424, 0x6a6058], windows: { w: 0.9, gap: 4.2, sill: 1.9, top: 2.6, skip: 0.35 } },
    cabin: { open: true, roof: { type: 'gable', color: [0x3a3a32, 0x2a3a2a] }, floor: 0x5a4a34, wall: [0x6a4a2a, 0x5a4026], windows: { w: 0.9, gap: 3.0, sill: 1.0, top: 1.9, skip: 0.3 } },
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

  // A straight wall with openings: doors ({c, w, type: 'door'}) and windows
  // ({c, w, type: 'window', sill, top}). Returns the doors and windows made.
  function wallWithOpenings(ax, a0, a1, fixed, openings, color) {
    const out = { doors: [], windows: [] };
    const seg = (s0, s1, y0 = 0, y1 = WALL_H, box) => {
      if (s1 - s0 < 0.02) return;
      const r = ax === 'x' ? { minX: s0, maxX: s1, minZ: fixed - WALL_T / 2, maxZ: fixed + WALL_T / 2 } : { minX: fixed - WALL_T / 2, maxX: fixed + WALL_T / 2, minZ: s0, maxZ: s1 };
      walls.push({ ...r, y0, y1, color, pattern: curPattern });
      if (box) addBox(r.minX, r.minZ, r.maxX, r.maxZ, box);
    };
    let cur = a0;
    for (const o of [...openings].sort((p, q) => p.c - q.c)) {
      const g0 = o.c - o.w / 2, g1 = o.c + o.w / 2;
      seg(cur, g0, 0, WALL_H, {});
      cur = g1;
      const pos = ax === 'x' ? { x: o.c, z: fixed } : { x: fixed, z: o.c };
      if (o.type === 'door') {
        seg(g0, g1, o.top ?? 2.2, WALL_H); // lintel
        out.doors.push({ ...pos, ax, w: o.w });
      } else if (o.type === 'gap') {
        seg(g0, g1, o.top ?? 2.4, WALL_H); // an opening with no door of its own (elevator doors)
      } else if (o.type === 'garage') {
        seg(g0, g1, 2.7, WALL_H); // a wide opening with the shutter rolled up
        if (o.out) {
          // Barn: two plank doors slid open along the outside of the wall
          const off = o.out * (WALL_T / 2 + 0.06);
          for (const s of [-1, 1]) {
            const c = o.c + s * o.w * 0.75;
            prop(ax === 'x' ? o.w / 2 : 0.08, 2.6, ax === 'x' ? 0.08 : o.w / 2, color, ax === 'x' ? c : fixed + off, 1.3, ax === 'x' ? fixed + off : c);
            prop(ax === 'x' ? o.w / 2 * 1.08 : 0.04, 0.12, ax === 'x' ? 0.04 : o.w / 2 * 1.08, 0xe8e4dc, ax === 'x' ? c : fixed + off * 1.5, 1.3, ax === 'x' ? fixed + off * 1.5 : c).rotation[ax === 'x' ? 'z' : 'x'] = 0.75; // cross brace
          }
          prop(ax === 'x' ? o.w * 2.2 : 0.1, 0.1, ax === 'x' ? 0.1 : o.w * 2.2, 0x3a3a3a, ax === 'x' ? o.c : fixed + off, 2.68, ax === 'x' ? fixed + off : o.c); // track
        } else prop(ax === 'x' ? o.w : 0.35, 0.3, ax === 'x' ? 0.35 : o.w, 0x8a8a84, pos.x, 2.55, pos.z);
        out.garages = [...(out.garages || []), { ...pos, ax, w: o.w }];
      } else {
        // Sill and lintel stop bullets but not sight; the opening itself is
        // the window (glass, open, or broken: you climb through).
        seg(g0, g1, 0, o.sill, { noCollide: true, blocksSight: false, h: o.sill });
        seg(g0, g1, o.top, WALL_H, { noCollide: true, blocksSight: false, y0: o.top, h: WALL_H });
        out.windows.push(addWindow(pos.x, pos.z, ax, o.w, o.sill, o.top));
      }
    }
    seg(cur, a1, 0, WALL_H, {});
    return out;
  }

  // A window in a wall opening: frame, glass (instanced, see below) and the
  // collider you vault over once it's open or smashed.
  function addWindow(x, z, ax, w, sill, top) {
    const along = ax === 'x' ? [1, 0] : [0, 1];
    const half = w / 2, t = WALL_T / 2 + 0.01;
    const r = ax === 'x' ? [x - half, z - t, x + half, z + t] : [x - t, z - half, x + t, z + half];
    const win = { kind: 'window', name: 'Window', x, z, ax, w, sill, top, state: 'closed', hp: 30, maxHp: 30, index: windows.length };
    win.box = addBox(r[0], r[1], r[2], r[3], { blocksShot: false, blocksSight: false, h: sill, window: win });
    win.box.structure = win;
    // Frame: jambs, head, sill ledge and a mullion
    const fc = 0xe8e4dc, rot = ax === 'x' ? 0 : Math.PI / 2;
    const fb = (lw, lh, ld, ox, oy) => prop(lw, lh, ld, fc, x + along[0] * ox, oy, z + along[1] * ox, rot);
    fb(0.06, top - sill, WALL_T + 0.04, -half + 0.03, (sill + top) / 2);
    fb(0.06, top - sill, WALL_T + 0.04, half - 0.03, (sill + top) / 2);
    fb(w, 0.06, WALL_T + 0.04, 0, top - 0.03);
    fb(w + 0.1, 0.05, WALL_T + 0.16, 0, sill + 0.025);
    fb(w - 0.1, 0.04, 0.06, 0, (sill + top) / 2);
    windows.push(win);
    return win;
  }

  // Try to place a container against one of a room's walls.
  function placeAlong(rect, type, bDoors, keepOut, wins = []) {
    const ct = CONTAINER_TYPES[type];
    const [sw, sh, sd] = ct.size;
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
      // Tall furniture doesn't go in front of windows
      if (sh > 1.1 && wins.some((wn) => Math.hypot(wn.x - x, wn.z - z) < wn.w / 2 + sw / 2 + 0.1)) continue;
      return addContainer(type, x, z, rot);
    }
    return null;
  }

  function prop(w, h, d, color, x, y, z, rot = 0, collide = false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fur.M(color));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    if (collide) addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, { blocksSight: false, h: y + h / 2 });
    return m;
  }

  // ---------- furnishing rooms ----------
  // Places furniture against walls or in the open, keeping doorways, door
  // swings and (for tall pieces) windows clear, never overlapping.
  function roomPlacer(room, bDoors, wins, keepOut = []) {
    const inner = { x0: room.x0 + WALL_T / 2, x1: room.x1 - WALL_T / 2, z0: room.z0 + WALL_T / 2, z1: room.z1 - WALL_T / 2 };
    const occ = [];
    const dims = (type) => (CONTAINER_TYPES[type] ? [CONTAINER_TYPES[type].size[0], CONTAINER_TYPES[type].size[2], CONTAINER_TYPES[type].size[1]] : FOOT[type]);
    const rectDist = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    const ok = (r, tall, free = false) => {
      if (r.x0 < inner.x0 - 1e-3 || r.x1 > inner.x1 + 1e-3 || r.z0 < inner.z0 - 1e-3 || r.z1 > inner.z1 + 1e-3) return false;
      if (!free && occ.some((o) => r.x0 < o.x1 + 0.06 && r.x1 > o.x0 - 0.06 && r.z0 < o.z1 + 0.06 && r.z1 > o.z0 - 0.06)) return false;
      if (bDoors.some((d) => rectDist(r, d.x, d.z) < (d.w ?? DOOR) / 2 + 0.75)) return false;
      if (tall && wins.some((wn) => rectDist(r, wn.x, wn.z) < wn.w / 2 + 0.15)) return false;
      if (!free && containers.some((c) => c.mesh && rectDist(r, c.x, c.z) < 0.45)) return false;
      if (keepOut.some((k) => rectDist(r, k.x, k.z) < k.r * 0.6)) return false;
      return true;
    };
    // Position of a piece standing against wall `side` (0 = z0, 1 = z1, 2 = x0, 3 = x1) at `t` along it.
    const onWall = (type, side, along) => {
      const [, d] = dims(type);
      const off = d / 2 + 0.02;
      if (side === 0) return { x: along, z: inner.z0 + off, rot: 0 };
      if (side === 1) return { x: along, z: inner.z1 - off, rot: Math.PI };
      if (side === 2) return { x: inner.x0 + off, z: along, rot: Math.PI / 2 };
      return { x: inner.x1 - off, z: along, rot: -Math.PI / 2 };
    };
    const span = (side) => (side < 2 ? [inner.x0, inner.x1] : [inner.z0, inner.z1]);
    const P = {
      room, inner, occ,
      // Put a piece down (container or furniture) and claim its footprint.
      put(type, x, z, rot, opt = {}) {
        const [w, d, h] = dims(type);
        const r = footRect(x, z, w, d, rot);
        if (!opt.noOcc) occ.push(r);
        if (CONTAINER_TYPES[type]) return { c: addContainer(type, x, z, rot, { rng: true, model: opt }), x, z, rot, r, type };
        const m = fur.model(type, x, z, rot, opt, rand);
        if (inClear(r.x0, r.z0, r.x1, r.z1)) { m?.removeFromParent(); return { x, z, rot, r, type }; }
        if (h > 0) addBox(r.x0 + 0.03, r.z0 + 0.03, r.x1 - 0.03, r.z1 - 0.03, { blocksSight: false, blocksShot: h > 0.8, h });
        return { x, z, rot, r, type };
      },
      fits(type, x, z, rot) { const [w, d, h] = dims(type); return ok(footRect(x, z, w, d, rot), h > 1.05); },
      // Against a wall, trying the given sides (default: all, shuffled).
      wall(type, opt = {}) {
        const [w, , h] = dims(type);
        for (const side of opt.sides ?? shuffle([0, 1, 2, 3])) {
          const [s0, s1] = span(side);
          if (s1 - s0 < w + 0.05) continue;
          const n = 10, k0 = Math.floor(rand() * n);
          for (let k = 0; k < n; k++) {
            const t = ((k0 + k) % n + 0.5) / n;
            const pos = onWall(type, side, s0 + w / 2 + 0.03 + t * (s1 - s0 - w - 0.06));
            const [ww, dd] = dims(type);
            if (!ok(footRect(pos.x, pos.z, ww, dd, pos.rot), h > 1.05)) continue;
            return { ...P.put(type, pos.x, pos.z, pos.rot, opt), side };
          }
        }
        return null;
      },
      // Next to a placed piece along the same wall (dir -1 / 1).
      beside(base, type, dir, opt = {}) {
        const [w] = dims(type), [bw] = dims(base.type);
        const ax = Math.abs(Math.sin(base.rot)) > 0.5 ? 'z' : 'x';
        const off = dir * (bw / 2 + w / 2 + 0.05);
        const pos = onWall(type, base.side, (ax === 'x' ? base.x : base.z) + off);
        if (!P.fits(type, pos.x, pos.z, pos.rot)) return null;
        return { ...P.put(type, pos.x, pos.z, pos.rot, opt), side: base.side };
      },
      // A contiguous run of pieces along one wall (kitchen counters).
      run(types, opt = {}) {
        for (const side of opt.sides ?? shuffle([0, 1, 2, 3])) {
          const [s0, s1] = span(side);
          const widths = types.map((t) => dims(t)[0]);
          const total = widths.reduce((a, b) => a + b, 0);
          if (s1 - s0 < total + 0.05) continue;
          for (const fromEnd of rand() < 0.5 ? [0, 1] : [1, 0]) {
            const spots = [];
            let a = fromEnd ? s1 - 0.02 : s0 + 0.02;
            for (let i = 0; i < types.length; i++) {
              const wdt = widths[i];
              const c = fromEnd ? a - wdt / 2 : a + wdt / 2;
              a += fromEnd ? -wdt : wdt;
              spots.push(onWall(types[i], side, c));
            }
            if (!spots.every((s, i) => P.fits(types[i], s.x, s.z, s.rot))) continue;
            return spots.map((s, i) => ({ ...P.put(types[i], s.x, s.z, s.rot, opt), side }));
          }
        }
        return null;
      },
      // In the open, near a point (rugs, tables).
      open(type, x, z, rot = 0, opt = {}) {
        for (let k = 0; k < (opt.exact ? 1 : 8); k++) {
          const jx = x + (k ? (rand() - 0.5) * k * 0.4 : 0), jz = z + (k ? (rand() - 0.5) * k * 0.4 : 0);
          const [w, d, h] = dims(type);
          const r = footRect(jx, jz, w + (opt.pad || 0), d + (opt.pad || 0), rot);
          if (!ok(r, h > 1.05, opt.free)) continue;
          return P.put(type, jx, jz, rot, { ...opt, noOcc: opt.free });
        }
        return null;
      },
      centre() { return { x: (inner.x0 + inner.x1) / 2, z: (inner.z0 + inner.z1) / 2 }; },
      size() { return [inner.x1 - inner.x0, inner.z1 - inner.z0]; },
    };
    return P;
  }

  // Front direction of a wall-standing piece (into the room)
  const frontOf = (p) => ({ x: Math.sin(p.rot), z: Math.cos(p.rot) });
  const opposite = (side) => [1, 0, 3, 2][side];
  const KITCHEN_STYLES = [
    { body: 0xe8e4dc, front: 0xd8d2c4, top: 0x3a3a38 }, { body: 0x6a4a30, front: 0x7a5a3a, top: 0xc8c0b0 },
    { body: 0x3a4a5a, front: 0x4a5a6a, top: 0xd8d4cc }, { body: 0xb8c8b0, front: 0xc8d8c0, top: 0x5a5a58 },
  ];

  function furnishLiving(P, withKitchen) {
    const sofa = P.wall('sofa');
    if (sofa) {
      const tv = P.wall('tv_stand', { sides: [opposite(sofa.side)] });
      const f = frontOf(sofa);
      P.open('rug', sofa.x + f.x * 1.25, sofa.z + f.z * 1.25, sofa.rot, { free: true });
      P.open('coffee_table', sofa.x + f.x * 1.05, sofa.z + f.z * 1.05, sofa.rot);
      if (!tv) P.wall('tv_stand');
      if (rand() < 0.7) P.beside(sofa, rand() < 0.5 ? 'plant' : 'floor_lamp', rand() < 0.5 ? -1 : 1);
    }
    else { P.wall('armchair'); P.wall('armchair'); P.wall('tv_stand'); }
    if (rand() < 0.7) P.wall('armchair');
    if (rand() < 0.75) P.wall('bookshelf');
    if (rand() < 0.5) P.wall('cabinet');
    if (withKitchen) furnishKitchen(P, true);
    else if (rand() < 0.5) P.wall('plant');
  }

  function furnishKitchen(P, small) {
    const style = pick(KITCHEN_STYLES);
    const run = ['fridge', 'kitchen', 'sink_counter', 'stove', 'kitchen'];
    const r = P.run(small ? run.slice(0, 4) : run, style) || P.run(run.slice(0, 3), style);
    if (!r) { P.wall('fridge'); P.wall('kitchen', style); }
    const [w, d] = P.size();
    if (w > 3.2 && d > 3.2) {
      const c = P.centre();
      const rot = w >= d ? 0 : Math.PI / 2;
      const t = P.open('dining_table', c.x, c.z, rot, { pad: 1.0 });
      if (t) {
        const ax = Math.abs(Math.sin(rot)) > 0.5;
        for (const s of [-1, 1]) for (const o of [-0.4, 0.4]) {
          const cx = t.x + (ax ? s * 0.68 : o), cz = t.z + (ax ? o : s * 0.68);
          P.put('chair', cx, cz, ax ? (s > 0 ? -Math.PI / 2 : Math.PI / 2) : (s > 0 ? Math.PI : 0), { noOcc: true });
        }
      }
    }
    if (!small && rand() < 0.5) P.wall('washer');
  }

  function furnishBedroom(P, single) {
    const bed = P.wall(single ? 'bed_single' : 'bed_double');
    if (bed) {
      beds.push({ kind: 'bed', name: 'Bed', x: bed.x, z: bed.z });
      P.beside(bed, 'nightstand', -1);
      if (!single) P.beside(bed, 'nightstand', 1);
      const f = frontOf(bed);
      if (rand() < 0.6) P.open('rug', bed.x + f.x * 0.6, bed.z + f.z * 0.6, bed.rot, { free: true });
    }
    P.wall('wardrobe');
    if (rand() < 0.6) P.wall('dresser');
    if (single || rand() < 0.35) P.wall(rand() < 0.6 ? 'pc' : 'desk');
    if (rand() < 0.4) P.wall('bookshelf');
  }

  function furnishBathroom(P) {
    const [w, d] = P.size();
    if (Math.max(w, d) > 2.0 && Math.min(w, d) > 1.0) P.wall('bathtub', { sides: w > d ? [2, 3] : [0, 1] }) || P.wall('bathtub');
    P.wall('toilet');
    const sink = P.wall('bath_sink');
    if (sink) P.put('bathroom', sink.x, sink.z, sink.rot, { noOcc: true });
    if (rand() < 0.4) P.wall('washer');
  }

  // Split a house into rooms with interior walls and doorways (BSP), then
  // decide what each room is and furnish it.
  function layoutHouse(b, ext, junc, bDoors, interiorColor) {
    const { x0, x1, z0, z1 } = b;
    const area = (r) => (r.x1 - r.x0) * (r.z1 - r.z0);
    const total = area(b);
    const target = total < 110 ? 3 : total < 170 ? 4 : 5;
    let rs = [{ x0, x1, z0, z1 }];
    const iDoors = [];
    // Wall across room r at s (alongX: the wall runs along z at x = s), with a doorway.
    const canSplit = (r, alongX, cand) => {
      const [b0, b1] = alongX ? [r.z0, r.z1] : [r.x0, r.x1];
      const hitsDoor = (alongX ? [['n', b0 === z0], ['s', b1 === z1]] : [['w', b0 === x0], ['e', b1 === x1]])
        .some(([side, touches]) => touches && ext[side].some((o) => Math.abs(o.c - cand) < o.w / 2 + 0.45));
      const hitsInner = iDoors.some((d) => (alongX ? Math.abs(d.x - cand) < 1.1 && (Math.abs(d.z - b0) < 0.2 || Math.abs(d.z - b1) < 0.2) : Math.abs(d.z - cand) < 1.1 && (Math.abs(d.x - b0) < 0.2 || Math.abs(d.x - b1) < 0.2)));
      return !hitsDoor && !hitsInner && b1 - b0 > 2.5;
    };
    const split = (r, alongX, sv) => {
      const [b0, b1] = alongX ? [r.z0, r.z1] : [r.x0, r.x1];
      const gc = rnd(b0 + 1.2, b1 - 1.2);
      const made = wallWithOpenings(alongX ? 'z' : 'x', b0, b1, sv, [{ c: gc, w: 1.3, type: 'door' }], interiorColor);
      for (const dr of made.doors) { iDoors.push(dr); bDoors.push(dr); }
      if (alongX) { if (b0 === z0) junc.n.push(sv); if (b1 === z1) junc.s.push(sv); }
      else { if (b0 === x0) junc.w.push(sv); if (b1 === x1) junc.e.push(sv); }
      rs.splice(rs.indexOf(r), 1);
      const A = alongX ? { ...r, x1: sv } : { ...r, z1: sv }, B = alongX ? { ...r, x0: sv } : { ...r, z0: sv };
      rs.push(A, B);
      return [A, B];
    };
    for (let guard = 0; rs.length < target && guard < 12; guard++) {
      rs.sort((a, c) => area(c) - area(a));
      const r = rs.find((q) => Math.max(q.x1 - q.x0, q.z1 - q.z0) >= 5.0);
      if (!r) break;
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0; // split the long side (wall runs along z)
      const [c0, c1] = alongX ? [r.x0, r.x1] : [r.z0, r.z1];
      let sv = null;
      for (let tries = 0; tries < 12 && sv == null; tries++) {
        const cand = c0 + (c1 - c0) * rnd(0.36, 0.64);
        if (canSplit(r, alongX, cand)) sv = cand;
      }
      if (sv == null) break;
      split(r, alongX, sv);
    }
    // Bathrooms are small: carve one out of the smallest room, the rest of
    // it becomes a laundry / utility room.
    rs.sort((a, c) => area(c) - area(a));
    const sm = rs[rs.length - 1];
    if (rs.length >= 3 && area(sm) > 10) {
      const alongX = sm.x1 - sm.x0 >= sm.z1 - sm.z0;
      const [c0, c1] = alongX ? [sm.x0, sm.x1] : [sm.z0, sm.z1];
      for (const cand of rand() < 0.5 ? [c0 + 2.4, c1 - 2.4] : [c1 - 2.4, c0 + 2.4]) {
        if (c1 - c0 < 4.6 || !canSplit(sm, alongX, cand)) continue;
        const [A, B] = split(sm, alongX, cand);
        const bath = area(A) < area(B) ? A : B;
        bath.force = 'bathroom';
        (bath === A ? B : A).force = 'laundry';
        break;
      }
    }
    // Room types: biggest is the living room, smallest the bathroom.
    const forced = rs.filter((r) => r.force);
    rs = rs.filter((r) => !r.force).sort((a, c) => area(c) - area(a));
    const hasBath = forced.some((r) => r.force === 'bathroom');
    const types = hasBath ? ['living_kitchen', 'bedroom', 'kitchen', 'bedroom_single'].slice(0, rs.length)
      : rs.length === 1 ? ['studio'] : rs.length === 2 ? ['living_kitchen', 'bedroom']
      : rs.length === 3 ? ['living_kitchen', 'bedroom', 'bathroom']
        : rs.length === 4 ? ['living', 'bedroom', 'kitchen', 'bathroom'] : ['living', 'bedroom', 'kitchen', 'bedroom_single', 'bathroom'];
    if (hasBath && rs.length >= 3) types[0] = 'living';
    rs.forEach((r, i) => { r.type = types[i]; if (r.type === 'bathroom' && Math.min(r.x1 - r.x0, r.z1 - r.z0) < 1.9) r.type = 'storage'; });
    for (const r of forced) r.type = r.force;
    return [...rs, ...forced];
  }

  // Keep placing pieces from `types` against walls until n are down or it stops fitting.
  function fill(P, types, n, opt) {
    let placed = 0, fails = 0;
    while (placed < n && fails < 5) { if (P.wall(pick(types), opt)) placed++; else fails++; }
    return placed;
  }

  // Shops, clinics, offices, warehouses, the command post: furnished by what
  // the business does. Lootable pieces are mixed in with decorative ones.
  const STORES = {
    shop: { loot: 'foodshelf', deco: 'store_shelf', extra: ['drinkfridge', 'freezer'] },
    grocery: { loot: 'foodshelf', deco: 'store_shelf', extra: ['drinkfridge', 'freezer', 'freezer'] },
    hardware: { loot: 'toolshelf', deco: 'tool_rack', extra: ['lumber', 'lumber'] },
    pharmacy: { loot: 'pillshelf', deco: 'pharma_shelf', extra: ['medcab'] },
    gas: { loot: 'foodshelf', deco: 'store_shelf', extra: ['drinkfridge', 'drinkfridge', 'vending'] },
  };
  function furnishBusiness(kindName, kind, rooms, outerDoors, bDoors, wins, keepOut, w, d) {
    const dr = outerDoors[0];
    const front = (dr && rooms.find((r) => dr.x >= r.x0 - 0.3 && dr.x <= r.x1 + 0.3 && dr.z >= r.z0 - 0.3 && dr.z <= r.z1 + 0.3)) || rooms[0];
    const back = rooms.filter((r) => r !== front);
    const P = roomPlacer(front, bDoors, wins, keepOut);
    const st = STORES[kindName];
    if (st) {
      fill(P, st.extra, st.extra.length);
      if (!kind.aisles) {
        // A gondola row down the middle of the sales floor
        const c = P.centre(), [rw] = P.size();
        for (let x = c.x - rw / 2 + 2.4; x < c.x + rw / 2 - 2.4; x += 1.75) {
          if (rand() < 0.15) continue;
          P.open('store_shelf', x, c.z - 0.26, Math.PI, { exact: true }); P.open('store_shelf', x, c.z + 0.26, 0, { exact: true });
        }
      }
      const n = fill(P, [st.loot, st.deco, st.deco], 14);
      void n;
      for (const r of back) {
        const Q = roomPlacer(r, bDoors, wins, keepOut);
        fill(Q, ['crate', 'tool_rack', 'cabinet', st.loot, 'toolbox'], 6);
        const cc = Q.centre();
        Q.open('pallet', cc.x, cc.z, 0); Q.open('pallet', cc.x + 1.5, cc.z, Math.PI / 2);
      }
      return;
    }
    if (kindName === 'clinic') {
      P.wall('reception'); P.wall('waiting_chairs'); P.wall('waiting_chairs'); P.wall('plant'); P.wall('water_cooler'); P.wall('medbox');
      const c = P.centre();
      for (const dz of [-1.2, 1.2]) { P.open('waiting_chairs', c.x, c.z + dz, dz < 0 ? 0 : Math.PI, { exact: true }); }
      P.open('plant', c.x + 1.6, c.z, 0, { exact: true }); P.wall('vending');
      for (const r of back.length ? back : [front]) {
        const Q = r === front ? P : roomPlacer(r, bDoors, wins, keepOut);
        Q.wall('exam_bed'); Q.wall('exam_bed'); Q.wall('curtain');
        fill(Q, ['medcab', 'medbox', 'surgical', 'pillshelf'], 3); Q.wall('bath_sink'); Q.wall('desk');
      }
      return;
    }
    if (kindName === 'office') {
      fill(P, ['filing', 'filing', 'plant', 'water_cooler', 'whiteboard'], 7); P.wall('vending'); P.wall('pc'); P.wall('server');
      return;
    }
    if (kindName === 'mechanic') {
      // Workshop: a lift with a project car on it, benches, parts and tires
      fill(P, ['parts_shelf', 'parts_shelf', 'toolbench', 'tire_rack', 'toolbox', 'tool_rack'], 7);
      P.wall('compressor'); P.wall('drum'); P.wall('drum');
      const c = P.centre(), [rw, rd] = P.size();
      const rot = rw >= rd ? Math.PI / 2 : 0;
      const ok = P.fits('car_lift', c.x, c.z, rot);
      if (ok) {
        P.put('car_lift', c.x, c.z, rot);
        const ax = Math.abs(Math.sin(rot)) > 0.5;
        for (const sx of [-1, 1]) addBox(c.x + (ax ? 0 : sx * 1.45) - 0.12, c.z + (ax ? sx * 1.45 : 0) - 0.12, c.x + (ax ? 0 : sx * 1.45) + 0.12, c.z + (ax ? sx * 1.45 : 0) + 0.12, { blocksSight: false, h: 2.4 });
        car(c.x, c.z, rot + (rand() < 0.5 ? Math.PI : 0), null, { project: true });
      }
      return;
    }
    if (kindName === 'warehouse') {
      // Racking in rows with aisles between, loot shelving round the walls
      fill(P, ['crate', 'toolshelf', 'lumber', 'toolbox', 'cabinet'], 7);
      const c = P.centre(), [rw, rd] = P.size();
      for (let z = c.z - rd / 2 + 3.2; z < c.z + rd / 2 - 2.6; z += 3.4) {
        for (let x = c.x - rw / 2 + 3.0; x < c.x + rw / 2 - 2.8; x += 2.5) if (rand() < 0.85) P.open('rack', x, z, 0, { exact: true });
      }
      for (let i = 0; i < 3; i++) P.open('pallet', c.x + rnd(-rw / 3, rw / 3), c.z + rnd(-rd / 3, rd / 3), rand() < 0.5 ? 0 : Math.PI / 2);
      P.open('forklift', c.x + rnd(-3, 3), c.z + rnd(-3, 3), rand() < 0.5 ? 0 : Math.PI / 2);
      return;
    }
    if (kindName === 'barn') {
      // Stalls down one side, hay, farm supplies, a tractor in the middle
      const [rw, rd] = P.size(), c = P.centre();
      const along = rw >= rd ? 'x' : 'z';
      fill(P, ['farm_shelf', 'farm_shelf', 'seed_rack', 'hay', 'produce_crate', 'toolbench', 'hay_stack', 'hay_stack'], 9);
      const side = rand() < 0.5 ? -1 : 1;
      for (let t = -0.32; t <= 0.33; t += 0.32) {
        const x = along === 'x' ? c.x + t * rw : c.x + side * (rw / 2 - 1.6), z = along === 'x' ? c.z + side * (rd / 2 - 1.6) : c.z + t * rd;
        P.open('stall', x, z, along === 'x' ? Math.PI / 2 : 0, { exact: true });
      }
      if (rand() < 0.6) P.open('tractor', c.x, c.z, along === 'x' ? Math.PI / 2 : 0);
      else P.open('hay_stack', c.x, c.z, rand() < 0.5 ? 0 : Math.PI / 2);
      return;
    }
    if (kindName === 'cabin') {
      P.wall('bed_single', { sheet: 0x6a4a3a }); P.wall('hunting'); P.wall('stove'); P.wall('pantry'); P.wall('cabinet');
      const c = P.centre(); P.open('dining_table', c.x, c.z, 0); P.open('rug', c.x, c.z, 0, { free: true });
      return;
    }
    if (kindName === 'military') {
      for (const r of rooms) {
        const Q = r === front ? P : roomPlacer(r, bDoors, wins, keepOut);
        Q.wall('bed_single', { sheet: 0x4a5a3a }); Q.wall('bed_single', { sheet: 0x4a5a3a });
        fill(Q, ['milcrate', 'duffel', 'ammobox', 'lockers', 'desk', 'surgical'], 5);
      }
      return;
    }
    const n = Math.floor(rnd(2, 4 + (w * d) / 120));
    for (let i = 0; i < n; i++) placeAlong(rooms[Math.floor(rand() * rooms.length)], pick(kind.wallLoot), bDoors, keepOut, wins);
  }

  // Pitched roof along the long side: gable (farmhouse, cabin) or the
  // two-slope gambrel of a barn. The gable ends are in the wall colour.
  function roof(cx, cz, w, d, type, roofColor, wallColor) {
    const alongX = w >= d, span = alongX ? d : w, len = alongX ? w : d;
    const hs = span / 2 + 0.35, rise = type === 'gambrel' ? span * 0.5 : span * 0.32;
    const pts = type === 'gambrel'
      ? [[-hs, 0], [-hs * 0.72, rise * 0.62], [0, rise], [hs * 0.72, rise * 0.62], [hs, 0]]
      : [[-hs, 0], [0, rise], [hs, 0]];
    const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len - 0.1, bevelEnabled: false });
    geo.translate(0, 0, -(len - 0.1) / 2);
    const gable = new THREE.Mesh(geo, fur.M(wallColor, 0.95));
    gable.position.set(cx, WALL_H + 0.24, cz);
    if (alongX) gable.rotation.y = Math.PI / 2;
    gable.castShadow = gable.receiveShadow = true;
    group.add(gable);
    // Roof panels on each sloped edge, overhanging the ends
    for (let i = 0; i < pts.length - 1; i++) {
      const [a0, b0] = pts[i], [a1, b1] = pts[i + 1];
      const el = Math.hypot(a1 - a0, b1 - b0), ang = Math.atan2(b1 - b0, a1 - a0);
      const nx = -Math.sin(ang) * 0.07, ny = Math.cos(ang) * 0.07;
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(el + 0.12, 0.12, len + 0.5), fur.M(roofColor, 0.9));
      const ma = (a0 + a1) / 2 + nx, mb = (b0 + b1) / 2 + ny;
      pnl.rotation.order = 'YXZ';
      pnl.rotation.set(0, alongX ? Math.PI / 2 : 0, ang);
      pnl.position.set(cx + (alongX ? 0 : ma), WALL_H + 0.24 + mb, cz + (alongX ? -ma : 0));
      pnl.castShadow = pnl.receiveShadow = true;
      group.add(pnl);
    }
  }

  // Kitchen and bathroom tiles; carpet (plain) elsewhere
  function floorPatch(r, color, tiled = false) {
    const m = prop(r.x1 - r.x0 - WALL_T, 0.012, r.z1 - r.z0 - WALL_T, color, (r.x0 + r.x1) / 2, 0.066, (r.z0 + r.z1) / 2);
    if (tiled) m.material = mergeableMaterial('tiles', color, 3, 0.4);
  }

  function building(cx, cz, w, d, kindName) {
    const kind = KINDS[kindName];
    curPattern = WALL.plaster; // inside walls
    const color = pick(kind.wall);
    const interiorColor = kind.interior ? pick(kind.interior) : color;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const zc = cz + rnd(-1, 1); // corridor centre line
    const b = { x0, x1, z0, z1, kind: kindName, name: null, doors: [], windows: [], index: buildings.length, color, interiorColor, zc };
    const bDoors = b.doors;
    // Buildings that get real upper floors are rebuilt later: note everything
    // this first version makes, so it can be taken away again.
    const rec = STOREYS[kindName] ? { ch: group.children.length, walls: walls.length, boxes: allBoxes.length, cont: containers.length, doors: doors.length, wins: windows.length, beds: beds.length, zs: zombieSpawns.length } : null;
    const keepOut = [];
    let rooms = [];
    const ext = { n: [], s: [], w: [], e: [] };   // openings in each outside wall
    const junc = { n: [], s: [], w: [], e: [] };  // where inside walls meet it

    // Exterior doors: corridor buildings get doors at both corridor ends.
    const sides = shuffle(['n', 's', 'e', 'w']);
    const doorSides = kind.corridor ? ['e', 'w'] : sides.slice(0, 2 + (rand() < 0.4 ? 1 : 0));
    for (const side of doorSides) {
      const [a0, a1] = side === 'n' || side === 's' ? [x0, x1] : [z0, z1];
      ext[side].push({ c: kind.corridor && (side === 'e' || side === 'w') ? zc : rnd(a0 + 2, a1 - 2), w: DOOR, type: 'door' });
    }
    const frontSide = doorSides[0];
    // Garages: the front door is a wide roll-up opening cars can drive through
    if (kind.garage || kind.barnDoor) { const o = ext[frontSide][0]; o.type = 'garage'; o.w = 3.8; if (kind.barnDoor) o.out = { n: -1, s: 1, w: -1, e: 1 }[frontSide]; const [a0, a1] = frontSide === 'n' || frontSide === 's' ? [x0, x1] : [z0, z1]; o.c = Math.max(a0 + 2.6, Math.min(a1 - 2.6, o.c)); }

    // Interior layout
    if (kind.corridor) {
      const cw = 1.6;
      const roomW = 5.5;
      const nRooms = Math.max(2, Math.floor((w - 1) / roomW));
      const step = w / nRooms;
      const northGaps = [], southGaps = [];
      for (let i = 0; i < nRooms; i++) {
        const rx0 = x0 + i * step, rx1 = x0 + (i + 1) * step;
        const mid = (rx0 + rx1) / 2;
        northGaps.push({ c: mid, w: 1.4, type: 'door' }); southGaps.push({ c: mid + rnd(-0.6, 0.6), w: 1.4, type: 'door' });
        if (i > 0) {
          wallWithOpenings('z', z0, zc - cw, rx0, [], interiorColor);
          wallWithOpenings('z', zc + cw, z1, rx0, [], interiorColor);
          junc.n.push(rx0); junc.s.push(rx0);
        }
        rooms.push({ x0: rx0, x1: rx1, z0, z1: zc - cw, side: 'n' }, { x0: rx0, x1: rx1, z0: zc + cw, z1, side: 's' });
      }
      bDoors.push(...wallWithOpenings('x', x0, x1, zc - cw, northGaps, interiorColor).doors);
      bDoors.push(...wallWithOpenings('x', x0, x1, zc + cw, southGaps, interiorColor).doors);
      junc.e.push(zc - cw, zc + cw); junc.w.push(zc - cw, zc + cw);
    } else if (kind.home || kindName === 'house') {
      rooms = layoutHouse(b, ext, junc, bDoors, interiorColor);
    } else if (w > 12 && !kind.aisles && !kind.desks && !kind.open) {
      // Interior partition with a doorway
      const px = rnd(x0 + 5, x1 - 5);
      const dc = rnd(z0 + 2, z1 - 2);
      bDoors.push(...wallWithOpenings('z', z0, z1, px, [{ c: dc, w: 1.4, type: 'door' }], interiorColor).doors);
      junc.n.push(px); junc.s.push(px);
      keepOut.push(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: px, z: z0 + (i + 0.5) * (d / 8), r: 1.0 })));
      rooms.push({ x0, x1: px, z0, z1 }, { x0: px, x1, z0, z1 });
    } else rooms.push({ x0, x1, z0, z1 });

    // Windows along the outside walls, clear of doors, corners and inside walls
    const win = kind.windows || { w: 1.3, gap: 3.2, sill: 0.9, top: 2.1 };
    for (const side of ['n', 's', 'w', 'e']) {
      if (win.sides && !win.sides.includes(side)) continue;
      const big = win.front && side === frontSide;
      const ww = big ? win.front.w : win.w, gap = big ? win.front.gap : win.gap;
      const [a0, a1] = side === 'n' || side === 's' ? [x0, x1] : [z0, z1];
      const len = a1 - a0 - 2.4;
      const n = Math.max(0, Math.floor(len / gap));
      for (let i = 0; i < n; i++) {
        const c = a0 + 1.2 + (len - (n - 1) * gap) / 2 + i * gap + rnd(-0.25, 0.25);
        if (ext[side].some((o) => Math.abs(o.c - c) < o.w / 2 + ww / 2 + 0.35)) continue;
        if (junc[side].some((j) => Math.abs(j - c) < ww / 2 + 0.4)) continue;
        if (rand() < (win.skip ?? 0.12)) continue;
        ext[side].push({ c, w: ww, type: 'window', sill: big ? win.front.sill : win.sill, top: big ? win.front.top : win.top });
      }
    }
    // Build the outside walls (brick, clapboard or concrete by building type)
    const finish = { house: drand() < 0.5 ? 'brick' : 'siding', farmhouse: 'siding', barn: 'siding', cabin: 'siding', shop: 'brick', grocery: 'brick', hardware: 'brick', pharmacy: drand() < 0.5 ? 'brick' : 'concrete', gas: 'concrete' }[kindName] || 'concrete';
    curPattern = WALL[finish];
    const outerDoors = [];
    for (const [side, ax, a0, a1, fixed] of [['n', 'x', x0, x1, z0], ['s', 'x', x0, x1, z1], ['w', 'z', z0, z1, x0], ['e', 'z', z0, z1, x1]]) {
      const made = wallWithOpenings(ax, a0, a1, fixed, ext[side], color);
      if (made.garages) {
        b.garages = made.garages;
        // a clear lane 3 m into the building, a little wider than the opening
        for (const g of made.garages) {
          const ins = g.ax === 'x' ? Math.sign(cz - g.z) : Math.sign(cx - g.x), hw = g.w / 2 + 0.3;
          clearZones.push(g.ax === 'x' ? { x0: g.x - hw, x1: g.x + hw, z0: Math.min(g.z, g.z + ins * 3), z1: Math.max(g.z, g.z + ins * 3) }
            : { x0: Math.min(g.x, g.x + ins * 3), x1: Math.max(g.x, g.x + ins * 3), z0: g.z - hw, z1: g.z + hw });
        }
      }
      outerDoors.push(...made.doors);
      bDoors.push(...made.doors);
      b.windows.push(...made.windows);
    }
    const wins = b.windows;
    curPattern = WALL.concrete;

    // Floor, ceiling/roof, upper storeys, tower
    const floorKind = kind.home || kindName === 'house' || kindName === 'cabin' ? 'planks' : ['warehouse', 'mechanic', 'barn', 'military'].includes(kindName) ? 'slab' : 'tiles';
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mergeableMaterial(floorKind, kind.floor, floorKind === 'tiles' ? 2 : 1, 0.85));
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    group.add(floor);
    const storeys = kind.storeys || 1;
    const roofY = WALL_H * storeys;
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), fur.M(0x3a3330, 1));
    ceil.position.set(cx, WALL_H + 0.12, cz);
    ceil.castShadow = ceil.receiveShadow = true;
    group.add(ceil);
    if (storeys > 1) facade(cx, cz, w, d, WALL_H + 0.25, roofY, new THREE.Color(color));
    if (kind.tower) {
      const h = rnd(30, 52);
      facade(cx, cz, w - 2, d - 2, roofY + 0.25, h, new THREE.Color(0x8a9aaa));
      prop(1.2, 4, 1.2, 0x555555, cx + w / 4, h + 2, cz); // rooftop antenna mast
    }
    // (house roofs came later than the others: their colour is cosmetic-only)
    if (kind.roof) roof(cx, cz, w, d, kind.roof.type, (kindName === 'house' ? dpick : pick)(kind.roof.color), color);
    else if (!kind.tower) {
      // Flat roof: a parapet round the edge, AC units and vent pipes
      const ry = roofY + 0.25;
      prop(w + 0.6, 0.4, 0.2, 0x5a5a58, cx, ry + 0.2, z0 - 0.2); prop(w + 0.6, 0.4, 0.2, 0x5a5a58, cx, ry + 0.2, z1 + 0.2);
      prop(0.2, 0.4, d + 0.2, 0x5a5a58, x0 - 0.2, ry + 0.2, cz); prop(0.2, 0.4, d + 0.2, 0x5a5a58, x1 + 0.2, ry + 0.2, cz);
      const n = 1 + Math.floor(drand() * Math.min(3, (w * d) / 80));
      for (let i = 0; i < n; i++) {
        const ax = cx + drnd(-w / 3, w / 3), az = cz + drnd(-d / 3, d / 3);
        prop(1.1, 0.8, 0.9, 0x9a9c9e, ax, ry + 0.4, az);
        const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), fur.M(0x3a3a3a));
        fan.position.set(ax, ry + 0.82, az); group.add(fan);
      }
      for (let i = 0; i < 2; i++) { const v = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), fur.M(0x7a7a78)); v.position.set(cx + drnd(-w / 2.5, w / 2.5), ry + 0.35, cz + drnd(-d / 2.5, d / 2.5)); group.add(v); }
    }
    for (const r of rooms) {
      prop(0.5, 0.05, 0.5, 0xd8d8c8, (r.x0 + r.x1) / 2, WALL_H - 0.03, (r.z0 + r.z1) / 2); // ceiling light
    }

    // --- furnishing ---
    if (kind.home || kindName === 'house') {
      for (const r of rooms) {
        const P = roomPlacer(r, bDoors, wins);
        if (r.type === 'kitchen' || r.type === 'bathroom') floorPatch(r, r.type === 'kitchen' ? pick([0xb8b4a8, 0x8a8478, 0xc8c0b0]) : pick([0xd8dcd8, 0xa8b8c0, 0xe0d8d0]), true); // (layout sequence, as before)
        else if (r.type.startsWith('bedroom')) floorPatch(r, pick([0x6a5a4a, 0x5a4a5a, 0x7a6a5a, 0x4a5a6a]));
        if (r.type === 'living' || r.type === 'living_kitchen' || r.type === 'studio') furnishLiving(P, r.type !== 'living');
        else if (r.type === 'kitchen') furnishKitchen(P, false);
        else if (r.type === 'bedroom' || r.type === 'bedroom_single') furnishBedroom(P, r.type === 'bedroom_single');
        else if (r.type === 'bathroom') furnishBathroom(P);
        else if (r.type === 'laundry') { P.wall('washer'); P.wall('washer'); P.wall('tool_rack'); P.wall('cabinet'); P.wall('toolbox'); }
        else { P.wall('toolshelf'); P.wall('toolbox'); }
        if (r.type === 'studio') furnishBedroom(P, true);
        if (kind.farm && r.type.includes('kitchen')) P.wall('pantry');
      }
    } else if (kind.aisles) {
      // Store aisles: rows of shelving through the middle of the floor.
      const rows = kind.aisles.rows;
      for (let r = 0; r < rows; r++) {
        const z = z0 + ((r + 1) * d) / (rows + 1);
        for (let x = x0 + 2.6; x < x1 - 2.6; x += 1.75) {
          if (Math.abs(x - cx) < 1.1) continue; // cross-aisle
          if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.4)) continue;
          addContainer(kind.aisles.type, x, z, r % 2 ? Math.PI : 0);
        }
        keepOut.push({ x: cx, z, r: w / 2 });
      }
    }
    // Checkout counter with a register by the front door of shops
    if (kind.checkout) {
      const dr = outerDoors[0];
      if (dr) {
        const nx = Math.abs(dr.x - x0) < 0.2 ? 1 : Math.abs(dr.x - x1) < 0.2 ? -1 : 0, nz = nx ? 0 : Math.abs(dr.z - z0) < 0.2 ? 1 : -1;
        const ux = -nz, uz = nx; // along the wall
        for (const side of [1, -1]) {
          const px = dr.x + nx * 2.2 + ux * side * 2.4, pz = dr.z + nz * 2.2 + uz * side * 2.4;
          if (px < x0 + 1.4 || px > x1 - 1.4 || pz < z0 + 1.4 || pz > z1 - 1.4) continue;
          if (containers.some((c) => Math.hypot(c.x - px, c.z - pz) < 1.6)) continue;
          const rot = Math.atan2(-uz, ux); // long side along the wall
          const r = footRect(px, pz, FOOT.checkout[0], FOOT.checkout[1], rot);
          fur.model('checkout', px, pz, rot, {}, rand);
          addBox(r.x0, r.z0, r.x1, r.z1, { blocksSight: false, h: 1.0 });
          addContainer('register', px + ux * side * 0.5, pz + uz * side * 0.5, rot);
          keepOut.push({ x: px, z: pz, r: 1.6 });
          break;
        }
      }
    }

    // Open-plan office: a grid of desks (each with its monitor and chair).
    const deskGrid = (r) => {
      for (let z = r.z0 + 1.8; z < r.z1 - 1.6; z += 2.8) {
        for (let x = r.x0 + 1.9; x < r.x1 - 1.6; x += 2.4) {
          if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.2)) continue;
          if (containers.some((c) => Math.hypot(c.x - x, c.z - z) < 1.4)) continue;
          addContainer('desk', x, z, 0);
        }
      }
    };
    if (kind.desks) for (const r of rooms) deskGrid(r);

    // Containers against the walls of each room
    if (kind.corridor) {
      let cellDone = !kind.cells;
      for (const r of rooms) {
        if (kind.wardBeds && r.side === 'n') {
          // Hospital wards: beds against the outer wall
          for (let bx = r.x0 + 1.2; bx < r.x1 - 1.0; bx += 1.8) {
            if (bDoors.some((dr) => Math.hypot(dr.x - bx, dr.z - (r.z0 + 1.1)) < 2.0)) continue;
            addBed(bx, r.z0 + WALL_T / 2 + 1.05, 0, 0xe8ecec);
          }
          if (rand() < 0.6) placeAlong(r, 'medcab', bDoors, keepOut, wins);
          continue;
        }
        if (!cellDone && r.side === 'n' && r.x1 - r.x0 > 3.4) {
          // Holding cell: bars across the room, a bunk and a toilet behind them
          cellDone = true;
          const cz2 = r.z0 + (r.z1 - r.z0) * 0.55, bw = r.x1 - r.x0 - WALL_T;
          const g = fur.model('cell_bars', (r.x0 + r.x1) / 2, cz2, 0, {}, rand);
          g.scale.x = bw / 3.0;
          const gapX = (r.x0 + r.x1) / 2 + (-1.45 + 13.5 * 0.152) * (bw / 3.0);
          addBox(r.x0, cz2 - 0.06, gapX - 0.35 * (bw / 3), cz2 + 0.06, { blocksSight: false, blocksShot: false, h: 2.6 });
          addBox(gapX + 0.35 * (bw / 3), cz2 - 0.06, r.x1, cz2 + 0.06, { blocksSight: false, blocksShot: false, h: 2.6 });
          const P = roomPlacer({ x0: r.x0, x1: r.x1, z0: r.z0, z1: cz2 }, bDoors, wins);
          P.wall('bed_single', { sides: [0] }); P.wall('toilet', { sides: [0, 2, 3] });
          continue;
        }
        if (kind.roomDesks && rand() < 0.6) { deskGrid({ x0: r.x0 + 0.3, x1: r.x1, z0: r.z0, z1: r.z1 }); }
        const P = roomPlacer(r, bDoors, wins, keepOut);
        const role = pick(kind.roomRoles || ['generic']);
        if (role === 'office') { P.wall('desk'); P.wall('desk'); P.wall('filing'); P.wall('whiteboard'); P.wall('plant'); }
        else if (role === 'lockers') { fill(P, ['policelocker', 'lockers', 'lockers'], 4); P.open('bench', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0); }
        else if (role === 'evidence') { fill(P, ['evidence', 'tool_rack', 'evidence'], 4); }
        else if (role === 'exam') { P.wall('hospital_bed'); P.wall('hospital_bed'); P.wall('medcab'); P.wall('surgical'); P.wall('bath_sink'); }
        else if (role === 'supply') { fill(P, ['pillshelf', 'pharma_shelf', 'medcab', 'medbox'], 5); }
        else if (role === 'exec') { P.wall('desk'); P.wall('safe'); P.wall('bookshelf'); P.wall('armchair'); P.wall('plant'); }
        else if (role === 'server') { fill(P, ['server', 'server', 'filing'], 4); }
        else {
          const n = 1 + Math.floor(rand() * 2.5);
          for (let i = 0; i < n; i++) placeAlong(r, pick(kind.roomLoot), bDoors, keepOut, wins);
          if (rand() < 0.5) P.wall('plant');
        }
      }
    } else if (!kind.home && kindName !== 'house') {
      furnishBusiness(kindName, kind, rooms, outerDoors, bDoors, wins, keepOut, w, d);
    }
    for (const dr of bDoors) addDoor(dr.x, dr.z, dr.ax, rand() < 0.75, dr.w);

    // Sign over the first outside door
    let name = null;
    if (kind.sign) {
      name = kind.sign.company ? companies.pop() || pick(COMPANIES) : kind.sign.text;
      const dr = outerDoors[0];
      if (dr) {
        const side = dr.ax === 'x' ? (Math.abs(dr.z - z0) < 0.01 ? 'n' : 's') : (Math.abs(dr.x - x0) < 0.01 ? 'w' : 'e');
        sign(name, kind.sign.bg, kind.sign.cross, dr.x, dr.z, side);
        // A canvas awning over the shop door
        if (kind.checkout) {
          const out = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[side];
          const aw = prop(dr.ax === 'x' ? 3.2 : 1.1, 0.06, dr.ax === 'x' ? 1.1 : 3.2, new THREE.Color(kind.sign.bg).getHex(), dr.x + out[0] * 0.65, 2.32, dr.z + out[1] * 0.65);
          if (dr.ax === 'x') aw.rotation.x = 0.35 * out[1]; else aw.rotation.z = -0.35 * out[0];
        }
      }
      const labels = { shop: 'General Store', police: 'Police Station', grocery: 'Grocery Store', hardware: 'Hardware Store', gas: 'Gas Station', military: 'Command Post', mechanic: 'Auto Repair' };
      landmarks.push({ x: cx, z: cz, name: kind.sign.company ? name : labels[kindName] || name[0] + name.slice(1).toLowerCase(), kind: kindName });
    }
    if (kind.zombies) zombieSpawns.push({ x: cx, z: cz, r: Math.min(w, d) / 2 - 1, n: kind.zombies.n, type: kind.zombies.type || null });
    b.name = name;
    if (rec) {
      b.legacy = {
        children: group.children.slice(rec.ch), walls: walls.slice(rec.walls), boxes: allBoxes.slice(rec.boxes), containers: containers.slice(rec.cont),
        doors: doors.slice(rec.doors), windows: windows.slice(rec.wins), beds: beds.slice(rec.beds), spawns: zombieSpawns.slice(rec.zs),
      };
    }
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
  const outerKinds = shuffle(['pharmacy', 'hardware', 'gas', 'warehouse', 'mechanic', 'mechanic', 'clinic', 'park', 'parking', 'shop']);
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
        for (const dx of [-7, -3]) { prop(0.6, 1.4, 0.9, 0x8a2a1a, mx + dx, 0.7, mz - 6, 0, true); pumps.push({ kind: 'pump', name: 'Fuel Pump', x: mx + dx, z: mz - 6 + 0.75, fuel: Math.round(rnd(120, 300)) }); }
        car(mx - 5, mz - 1.5, Math.PI / 2);
        continue;
      }
      if (kind === 'mechanic') {
        // A garage with a forecourt of cars waiting for work
        const b = building(mx + rnd(-1, 1), mz - 3, rnd(15, 18), rnd(11, 13), 'mechanic');
        const yz = b.z1 + 3.4;
        for (let i = 0; i < 3; i++) if (rand() < 0.8) car(lx0 + 3 + i * 5.5 + rnd(-0.5, 0.5), Math.min(lz1 - 2.5, yz), Math.PI / 2 + rnd(-0.1, 0.1), null, { project: true });
        for (let i = 0; i < 2; i++) prop(0.7, 0.9, 0.7, pick([0x2a4a8a, 0xa82a1a]), lx1 - 1.5 - i * 0.9, 0.45, lz1 - 1.2, 0, true); // oil drums
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

  // Farmland, woods and meadows around the town
  const country = buildCountryside({ rand, rnd, pick, shuffle, group, fur, addBox, prop, building, car, addContainer, trees, zombieSpawns, landmarks, corpseMesh, HALF });

  // Abandoned cars on roads
  for (let i = 0; i < 26; i++) {
    const road = pick(roads);
    const along = rnd(-95, 95);
    const off = rnd(-2, 2);
    const rot = road.axis === 'x' ? Math.PI / 2 + rnd(-0.3, 0.3) : rnd(-0.3, 0.3);
    if (road.axis === 'x') car(road.k + off, along, rot); else car(along, road.k + off, rot);
  }

  // style: undefined (civilian), 'police' or 'military' (canvas-backed truck)
  // A vehicle where it was abandoned. vehicles.js builds and drives it; the
  // trunk / cargo container rides along with it.
  function car(x, z, rot, style, opts = {}) {
    const mil = style === 'military';
    const color = opts.color ?? (mil ? 0x4a5a3a : style === 'police' ? 0xe8e8e8 : pick([0x6a2222, 0x22446a, 0x555555, 0x887744, 0x2a4a2a, 0xcccccc, 0x7a6a50, 0x303438]));
    const type = mil ? 'military' : style === 'police' ? 'police' : opts.type || (rand() < 0.25 ? 'pickup' : 'sedan');
    const L = mil ? 6.2 : type === 'pickup' ? 4.8 : 4.3;
    const spec = { x, z, rot, type, color, rng: rand(), project: !!opts.project };
    if (mil) {
      // Cargo bed: military supplies at the back of the truck
      spec.trunk = addContainer(rand() < 0.6 ? 'milcrate' : 'duffel', x - Math.sin(rot) * (L / 2 + 0.6), z - Math.cos(rot) * (L / 2 + 0.6));
      spec.trunk.name = 'Truck Cargo';
    } else if (style === 'police') {
      spec.trunk = addContainer('policelocker', x - Math.sin(rot) * (L / 2 + 0.4), z - Math.cos(rot) * (L / 2 + 0.4));
      spec.trunk.name = 'Patrol Car Trunk';
    } else if (rand() < 0.7) {
      spec.trunk = addContainer('trunk', x - Math.sin(rot) * (L / 2 + 0.4), z - Math.cos(rot) * (L / 2 + 0.4));
    }
    if (spec.trunk) { spec.trunk.y = 0.9; spec.trunk.vehicleTrunk = true; }
    vehicleSpawns.push(spec);
    return spec;
  }


  // The single-storey stand-ins for buildings that get real upper floors
  // come out again (their slots in the saved lists stay, empty)
  const multi = buildings.filter((b) => b.legacy);
  for (const b of multi) {
    const L = b.legacy;
    for (const o of L.children) group.remove(o);
    for (const w of L.walls) w.retired = true;
    for (const x of L.boxes) hash.remove(x);
    for (const k of [...L.containers, ...L.doors, ...L.windows]) k.retired = true;
    for (const bd of L.beds) beds.splice(beds.indexOf(bd), 1);
    for (const sp of L.spawns) zombieSpawns.splice(zombieSpawns.indexOf(sp), 1);
  }

  // Walls → instanced meshes (the town, and one per countryside chunk)
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMat = wallMaterial(); // brick / clapboard / concrete / plaster in world space
  const m4 = new THREE.Matrix4();
  const colr = new THREE.Color();
  function instanceWalls(list0, shade, far) {
    // (every wall draws its shade, retired ones too, so the sequence is as it was)
    const shades = list0.map(() => shade());
    const list = list0.filter((w) => !w.retired), sh = shades.filter((_, i) => !list0[i].retired);
    if (!list.length) return;
    const geo = wallGeo.clone();
    geo.setAttribute('pattern', new THREE.InstancedBufferAttribute(new Float32Array(list.map((w) => w.pattern ?? WALL.concrete)), 1));
    const wallMesh = new THREE.InstancedMesh(geo, wallMat, list.length);
    list.forEach((w, i) => {
      const y0 = w.y0 ?? 0, y1 = w.y1 ?? WALL_H;
      m4.makeScale(w.maxX - w.minX, y1 - y0, w.maxZ - w.minZ);
      m4.setPosition((w.minX + w.maxX) / 2, (y0 + y1) / 2, (w.minZ + w.maxZ) / 2);
      wallMesh.setMatrixAt(i, m4);
      wallMesh.setColorAt(i, colr.set(w.color).multiplyScalar(sh[i]));
    });
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.computeBoundingSphere();
    wallMesh.userData.far = far;
    group.add(wallMesh);
  }
  const wallRegions = new Map();
  for (const w of walls) {
    const k = regionOf((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2);
    if (!wallRegions.has(k)) wallRegions.set(k, []);
    wallRegions.get(k).push(w);
  }
  for (const [k, list] of wallRegions) instanceWalls(list, () => rnd(0.92, 1.05), k !== 'town');
  const legacyWalls = walls.length;

  // Trees: one instanced mesh per species (pine, oak, birch, apple)
  const felled = new Set();
  const forest = plantTrees({ group, trees, addBox, rnd });
  const treeBoxes = forest.boxes;

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

  // Fingerprint of the layout saves were made on (before anything below)
  const legacy = { containers: containers.length, doors: doors.length, windows: windows.length };
  const legacyPrint = printOf(buildings, doors, containers);

  // Offices, police stations, hospitals and skyscrapers with real floors
  const levels = new Levels();
  const storeyCtx = {
    rand, rnd, pick, shuffle, WALL_H, WALL_T, DOOR, KINDS, group, fur, walls, allBoxes, containers, doors, windows, beds, zombieSpawns,
    addBox, addWall, wallWithOpenings, addDoor, addContainer, addBed, placeAlong, roomPlacer, fill, prop, sign, facade, mergeableMaterial,
    setPattern: (n) => { curPattern = WALL[n]; }, pattern: (n) => WALL[n],
  };
  for (const b of multi) {
    RNG = mulberry32((seed ^ Math.imul(b.index + 1, 0x9e3779b1)) >>> 0);
    levels.add(buildStoreys(storeyCtx, b));
  }
  RNG = mulberry32((seed ^ 0x51ab) >>> 0);
  instanceWalls(walls.slice(legacyWalls), () => rnd(0.92, 1.05), false);

  // Window glass: one instanced mesh (panes move when opened, vanish when smashed)
  const liveWindows = windows.filter((wn) => !wn.retired);
  const glassMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x9ab8c8, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.3, depthWrite: false }), Math.max(1, liveWindows.length));
  glassMesh.frustumCulled = false;
  glassMesh.renderOrder = 2;
  group.add(glassMesh);
  liveWindows.forEach((wn, i) => { wn.glass = glassMesh; wn.gi = i; setWindow(wn, 'closed'); });

  mergeStatic(group);

  // Countryside pieces: hidden past view range (fog hides them anyway), so
  // the town doesn't draw the farms and woods behind the haze.
  const far = [];
  for (const o of group.children) {
    if (!o.userData.far) continue;
    const bs = o.isInstancedMesh ? o.boundingSphere : (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere);
    if (bs) far.push({ o, c: bs.center.clone().applyMatrix4(o.matrixWorld), r: bs.radius });
  }

  // Saves keep containers, doors and windows by position in these lists:
  // the first part as the town was first laid out (retired ones left empty),
  // then the multi-storey buildings' own.
  const slots = {
    containers: containers.map((k) => (k.retired ? null : k)), doors: doors.map((k) => (k.retired ? null : k)), windows: windows.map((k) => (k.retired ? null : k)), legacy,
  };
  for (const arr of [containers, doors, windows]) { let j = 0; for (const k of arr) if (!k.retired) arr[j++] = k; arr.length = j; }
  const layout = { legacy: legacyPrint, extra: printOf([], slots.doors.slice(legacy.doors).filter(Boolean), slots.containers.slice(legacy.containers).filter(Boolean)) };

  const generatedContainers = containers.length;
  const houses = buildings.filter((b) => b.kind === 'house');

  return {
    group, hash, containers, generatedContainers, buildings, houses, roads, trees, doors, beds, windows, zombieSpawns, landmarks, vehicleSpawns, pumps, levels, slots, layout,
    dirtRoads: country.dirtRoads, features: country.features, gardens: country.gardens, forage: country.forage, waterSources: country.water,
    setFruit: forest.setFruit, setBerries: country.setBerries, foliage: forest.foliage, size: HALF * 2 + 80,
    addBox, addContainer: (type, x, z) => addContainer(type, x, z, 0, {}), felled,
    // Cut down a tree: hide its instances and remove its collider.
    fellTree(i) {
      if (felled.has(i)) return;
      felled.add(i);
      forest.fell(i);
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
    cull(x, z, range) {
      for (const f of far) f.o.visible = Math.hypot(f.c.x - x, f.c.z - z) - f.r < range;
    },
    // Height of the ground at (x, z): a sidewalk is 10 cm up
    groundAt(x, z) {
      const list = walks.get(Math.floor(x / 8) * 1000 + Math.floor(z / 8));
      if (list) for (const r of list) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return 0.1;
      return 0;
    },
    buildingAt(x, z) { return buildings.find((b) => !b.area && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) || null; },
    dispose: () => scene.remove(group),
  };
}

// A fingerprint of a layout: where every building, door and generated
// container is. Saves store these things by index, so if an update moves
// them, the saved world state no longer lines up with the town.
function printOf(buildings, doors, containers) {
  let h = 2166136261;
  const add = (v) => { h = Math.imul(h ^ Math.round(v * 10), 16777619) >>> 0; };
  for (const b of buildings) { add(b.x0); add(b.z0); add(b.x1); add(b.z1); }
  for (const d of doors) { add(d.x); add(d.z); if (d.base) add(d.base); }
  for (const c of containers) { add(c.x); add(c.z); if (c.base) add(c.base); }
  return `${buildings.length}.${doors.length}.${containers.length}.${h.toString(36)}`;
}

// Window states: closed (glass), open (pane slid up), broken (no glass).
// Open and broken windows can be climbed through.
const _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wp = new THREE.Vector3(), _ws = new THREE.Vector3();
export function setWindow(w, state) {
  w.state = state;
  if (!w.glass) return;
  const h = w.top - w.sill - 0.08;
  _wq.setFromAxisAngle(_wp.set(0, 1, 0), w.ax === 'x' ? 0 : Math.PI / 2);
  if (state === 'broken') _ws.set(0, 0, 0);
  else _ws.set(w.w - 0.1, state === 'open' ? h / 2 : h, 1);
  _wp.set(w.x, (w.base || 0) + (state === 'open' ? w.top - 0.04 - h / 4 : (w.sill + w.top) / 2), w.z);
  w.glass.setMatrixAt(w.gi, _wm.compose(_wp, _wq, _ws));
  w.glass.instanceMatrix.needsUpdate = true;
}

export function setDoor(d, open) {
  d.open = open;
  d.box.noCollide = open;
  d.box.blocksShot = d.box.blocksSight = !open;
  if (d.leaf) { d.leaf.noCollide = !open; d.leaf.blocksShot = open; }
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

// Town scenery batches as one region; the countryside in chunks, so farms
// and woods off-screen (or outside the sun's shadow box) aren't drawn.
const REGION = 60;
const regionOf = (x, z) => (Math.abs(x) < 110 && Math.abs(z) < 110 ? 'town' : `${Math.floor(x / REGION)},${Math.floor(z / REGION)}`);

// Batch all static, untextured, opaque scenery (furniture, props, vehicles,
// sandbags, fences...) into one mesh per material to keep draw calls low.
const _mp = new THREE.Vector3();
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material;
    const texMerge = m.map && m.userData.mergeUV; // shared textured material (sidewalks, floors)
    if ((m.map && !texMerge) || m.transparent || m.emissiveMap) return;
    for (let p = o; p && p !== group; p = p.parent) if (p.userData.dynamic) return;
    // Plain materials merge regardless of colour (it goes into vertex
    // colours), so all the furniture of one finish is a single draw call.
    const plain = !m.emissive || m.emissive.getHex() === 0;
    const rough = Math.round(m.roughness * 10) / 10, metal = Math.round(m.metalness * 10) / 10;
    o.getWorldPosition(_mp);
    const key = regionOf(_mp.x, _mp.z) + (o.castShadow ? '|' : '|ns|') + (texMerge ? 'tex|' + m.uuid : plain ? ['vc', rough, metal, m.side].join('|') : [m.type, m.color.getHex(), m.roughness, m.metalness, m.emissive.getHex(), m.side].join('|'));
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv || !geo.attributes.normal) return;
    geo.applyMatrix4(o.matrixWorld);
    if (texMerge) worldUV(geo, m.userData.mergeUV);
    else if (plain) {
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    if (!buckets.has(key)) buckets.set(key, { mat: plain && !texMerge ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: m.side }) : m, geos: [], shadow: o.castShadow });
    // (ground patches and furrows don't cast shadows: they'd only shade themselves)
    buckets.get(key).geos.push(geo);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [key, { mat, geos, shadow }] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.userData.far = !key.startsWith('town');
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}
