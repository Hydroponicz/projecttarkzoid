// Procedural town: roads, buildings with doors and roofs, trees, cars,
// lootable containers and extraction points.
import * as THREE from 'three';
import { SpatialHash } from './collision.js';
import { CONTAINER_TYPES, rollLoot } from './items.js';
import { makeGrid, addItem } from './inventory.js';

export const HALF = 120;      // map half-size
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

  // --- buildings ---
  const KINDS = {
    house: { floor: 0x6b5a45, wall: [0xb8a68a, 0x9c8b77, 0xa7a29a, 0x8c7a6a], loot: ['fridge', 'cabinet', 'cabinet', 'pc', 'toolbox'] },
    shop: { floor: 0x55585a, wall: [0x7a8a9a, 0x8a7a6a], loot: ['cabinet', 'cabinet', 'fridge', 'crate', 'toolbox'] },
    clinic: { floor: 0xc8c8c0, wall: [0xd8d8d0], loot: ['medbox', 'medbox', 'cabinet', 'pc'] },
    warehouse: { floor: 0x4a4a48, wall: [0x6a6a5a, 0x5a6050], loot: ['crate', 'toolbox', 'cabinet', 'lumber', 'lumber'] },
  };

  function building(cx, cz, w, d, kindName) {
    const kind = KINDS[kindName];
    const color = pick(kind.wall);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const bDoors = [];
    // Each side gets a door with some probability; guarantee two.
    const sides = shuffle(['n', 's', 'e', 'w']);
    const doorSides = new Set(sides.slice(0, 2 + (rand() < 0.4 ? 1 : 0)));
    const wallLine = (ax, a0, a1, fixed, side) => {
      // ax: 'x' wall runs along x at z=fixed, else along z at x=fixed
      const gaps = [];
      if (doorSides.has(side)) {
        const c = rnd(a0 + 2, a1 - 2);
        gaps.push(c);
        bDoors.push(ax === 'x' ? { x: c, z: fixed, ax } : { x: fixed, z: c, ax });
      }
      // windows are short gaps above a sill; modelled as low wall + header
      let cur = a0;
      const segs = [];
      for (const g of gaps) { segs.push([cur, g - DOOR / 2, 'door']); cur = g + DOOR / 2; }
      segs.push([cur, a1, null]);
      segs.forEach(([s0, s1], i) => {
        if (s1 - s0 < 0.05) return;
        if (ax === 'x') addWall(s0, fixed - WALL_T / 2, s1, fixed + WALL_T / 2, color);
        else addWall(fixed - WALL_T / 2, s0, fixed + WALL_T / 2, s1, color);
        if (i < segs.length - 1) {
          // lintel above the door gap
          const g0 = s1, g1 = s1 + DOOR;
          if (ax === 'x') walls.push({ minX: g0, maxX: g1, minZ: fixed - WALL_T / 2, maxZ: fixed + WALL_T / 2, y0: 2.2, y1: WALL_H, color });
          else walls.push({ minX: fixed - WALL_T / 2, maxX: fixed + WALL_T / 2, minZ: g0, maxZ: g1, y0: 2.2, y1: WALL_H, color });
        }
      });
    };
    wallLine('x', x0, x1, z0, 'n');
    wallLine('x', x0, x1, z1, 's');
    wallLine('z', z0, z1, x0, 'w');
    wallLine('z', z0, z1, x1, 'e');

    // Interior partition with a doorway
    const interiors = [];
    if (w > 12) {
      const px = rnd(x0 + 5, x1 - 5);
      const dc = rnd(z0 + 2, z1 - 2);
      addWall(px - WALL_T / 2, z0, px + WALL_T / 2, dc - DOOR / 2, color);
      addWall(px - WALL_T / 2, dc + DOOR / 2, px + WALL_T / 2, z1, color);
      walls.push({ minX: px - WALL_T / 2, maxX: px + WALL_T / 2, minZ: dc - DOOR / 2, maxZ: dc + DOOR / 2, y0: 2.2, y1: WALL_H, color });
      bDoors.push({ x: px, z: dc, ax: 'z' });
      interiors.push(px);
    }

    // Floor & roof
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), new THREE.MeshStandardMaterial({ color: kind.floor, roughness: 0.9 }));
    floor.position.set(cx, 0.03, cz);
    floor.receiveShadow = true;
    group.add(floor);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), new THREE.MeshStandardMaterial({ color: 0x3a3330, roughness: 1 }));
    roof.position.set(cx, WALL_H + 0.12, cz);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    // Ceiling light fixture (dim, decorative)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.6), new THREE.MeshBasicMaterial({ color: 0x777766 }));
    lamp.position.set(cx, WALL_H - 0.03, cz);
    group.add(lamp);

    // Containers along the walls, away from doors
    const n = Math.floor(rnd(2, 4 + w * d / 120));
    for (let i = 0; i < n; i++) {
      const type = pick(kind.loot);
      const ct = CONTAINER_TYPES[type];
      for (let tries = 0; tries < 12; tries++) {
        const side = Math.floor(rand() * 4);
        const [sw, , sd] = ct.size;
        let x, z, rot = 0;
        if (side === 0) { x = rnd(x0 + 1, x1 - 1); z = z0 + WALL_T / 2 + sd / 2 + 0.02; }
        else if (side === 1) { x = rnd(x0 + 1, x1 - 1); z = z1 - WALL_T / 2 - sd / 2 - 0.02; rot = Math.PI; }
        else if (side === 2) { z = rnd(z0 + 1, z1 - 1); x = x0 + WALL_T / 2 + sd / 2 + 0.02; rot = Math.PI / 2; }
        else { z = rnd(z0 + 1, z1 - 1); x = x1 - WALL_T / 2 - sd / 2 - 0.02; rot = -Math.PI / 2; }
        if (bDoors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.4)) continue;
        if (interiors.some((px) => Math.abs(px - x) < 1.2)) continue;
        if (containers.some((c) => Math.hypot(c.x - x, c.z - z) < 1.6)) continue;
        addContainer(type, x, z, rot);
        break;
      }
    }
    // Houses get a bed you can sleep in.
    if (kindName === 'house') {
      for (let tries = 0; tries < 10; tries++) {
        const bx = rnd(x0 + 1.2, x1 - 1.2), bz = z0 + WALL_T / 2 + 1.05;
        if (bDoors.some((dr) => Math.hypot(dr.x - bx, dr.z - bz) < 2.4)) continue;
        if (interiors.some((px) => Math.abs(px - bx) < 1.2)) continue;
        if (containers.some((c) => Math.hypot(c.x - bx, c.z - bz) < 1.8)) continue;
        addBed(bx, bz, 0);
        break;
      }
    }
    for (const dr of bDoors) addDoor(dr.x, dr.z, dr.ax, rand() < 0.75);
    buildings.push({ x0, x1, z0, z1, kind: kindName, doors: bDoors, index: buildings.length });
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
    group.add(pivot);
    const t = 0.08;
    const box = addBox(ax === 'x' ? x - half : x - t, ax === 'x' ? z - t : z - half, ax === 'x' ? x + half : x + t, ax === 'x' ? z + t : z + half, { h: 2.2 });
    const d = { kind: 'door', name: 'Door', x, z, ax, open: false, hp: 400, maxHp: 400, box, mesh: pivot, baseRot: pivot.rotation.y, index: doors.length };
    box.structure = d;
    doors.push(d);
    setDoor(d, !closed);
    return d;
  }

  function addBed(x, z, rot) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.0), new THREE.MeshStandardMaterial({ color: 0x5a4030 }));
    frame.position.y = 0.22;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 1.7), new THREE.MeshStandardMaterial({ color: pick([0x6a7a9a, 0x9a6a6a, 0x7a8a6a]) }));
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
      const m = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), new THREE.MeshStandardMaterial({ color: ct.color, roughness: 0.7 }));
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

  // Lay out lots between roads
  for (let bx = -100; bx < 100; bx += BLOCK) {
    for (let bz = -100; bz < 100; bz += BLOCK) {
      const lx0 = bx + ROAD / 2 + 2, lx1 = bx + BLOCK - ROAD / 2 - 2;
      const lz0 = bz + ROAD / 2 + 2, lz1 = bz + BLOCK - ROAD / 2 - 2;
      const r = rand();
      if (r < 0.1) { // park
        for (let i = 0; i < 6; i++) trees.push([rnd(lx0, lx1), rnd(lz0, lz1)]);
        continue;
      }
      if (r < 0.17) { // parking lot
        for (let i = 0; i < 4; i++) car(rnd(lx0 + 3, lx1 - 3), rnd(lz0 + 3, lz1 - 3), rand() < 0.5 ? 0 : Math.PI / 2);
        continue;
      }
      const kind = r < 0.6 ? 'house' : r < 0.74 ? 'shop' : r < 0.85 ? 'clinic' : 'warehouse';
      if (kind === 'house' && rand() < 0.6) {
        // two small houses side by side
        const mid = (lx0 + lx1) / 2;
        building((lx0 + mid) / 2, (lz0 + lz1) / 2 + rnd(-3, 3), rnd(9, 12), rnd(9, 14), 'house');
        building((mid + lx1) / 2, (lz0 + lz1) / 2 + rnd(-3, 3), rnd(9, 12), rnd(9, 14), 'house');
      } else {
        const w = kind === 'warehouse' ? rnd(20, 26) : rnd(13, 22);
        const d = kind === 'warehouse' ? rnd(16, 22) : rnd(10, 18);
        building((lx0 + lx1) / 2 + rnd(-2, 2), (lz0 + lz1) / 2 + rnd(-2, 2), w, d, kind);
      }
    }
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

  function car(x, z, rot) {
    const g = new THREE.Group();
    const col = pick([0x6a2222, 0x22446a, 0x555555, 0x887744, 0x2a4a2a, 0xcccccc]);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.3 }));
    body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x223, roughness: 0.2, metalness: 0.5 }));
    cab.position.set(0, 1.3, -0.2);
    g.add(body, cab);
    for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
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
    const hw = (1.9 * c + 4.2 * s) / 2, hd = (1.9 * s + 4.2 * c) / 2;
    addBox(x - hw * 0.9, z - hd * 0.9, x + hw * 0.9, z + hd * 0.9, { blocksSight: false, h: 1.6 });
    if (rand() < 0.6) {
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

  const generatedContainers = containers.length;
  const houses = buildings.filter((b) => b.kind === 'house');

  return {
    group, hash, containers, generatedContainers, buildings, houses, roads, trees, doors, beds,
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
    buildingAt(x, z) { return buildings.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) || null; },
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
