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

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function buildWorld(scene) {
  const hash = new SpatialHash(6);
  const walls = [];       // {x,z,w,d,h,y,color}
  const containers = [];
  const buildings = [];
  const trees = [];
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
    house: { floor: 0x6b5a45, wall: [0xb8a68a, 0x9c8b77, 0xa7a29a, 0x8c7a6a], loot: ['fridge', 'cabinet', 'cabinet', 'pc'] },
    shop: { floor: 0x55585a, wall: [0x7a8a9a, 0x8a7a6a], loot: ['cabinet', 'cabinet', 'fridge', 'crate'] },
    clinic: { floor: 0xc8c8c0, wall: [0xd8d8d0], loot: ['medbox', 'medbox', 'cabinet', 'pc'] },
    warehouse: { floor: 0x4a4a48, wall: [0x6a6a5a, 0x5a6050], loot: ['crate', 'crate', 'cabinet', 'crate'] },
  };

  function building(cx, cz, w, d, kindName) {
    const kind = KINDS[kindName];
    const color = pick(kind.wall);
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doors = [];
    // Each side gets a door with some probability; guarantee two.
    const sides = ['n', 's', 'e', 'w'].sort(() => Math.random() - 0.5);
    const doorSides = new Set(sides.slice(0, 2 + (Math.random() < 0.4 ? 1 : 0)));
    const wallLine = (ax, a0, a1, fixed, side) => {
      // ax: 'x' wall runs along x at z=fixed, else along z at x=fixed
      const gaps = [];
      if (doorSides.has(side)) {
        const c = rnd(a0 + 2, a1 - 2);
        gaps.push(c);
        doors.push(ax === 'x' ? { x: c, z: fixed } : { x: fixed, z: c });
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
      doors.push({ x: px, z: dc });
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
        const side = Math.floor(Math.random() * 4);
        const [sw, , sd] = ct.size;
        let x, z, rot = 0;
        if (side === 0) { x = rnd(x0 + 1, x1 - 1); z = z0 + WALL_T / 2 + sd / 2 + 0.02; }
        else if (side === 1) { x = rnd(x0 + 1, x1 - 1); z = z1 - WALL_T / 2 - sd / 2 - 0.02; rot = Math.PI; }
        else if (side === 2) { z = rnd(z0 + 1, z1 - 1); x = x0 + WALL_T / 2 + sd / 2 + 0.02; rot = Math.PI / 2; }
        else { z = rnd(z0 + 1, z1 - 1); x = x1 - WALL_T / 2 - sd / 2 - 0.02; rot = -Math.PI / 2; }
        if (doors.some((dr) => Math.hypot(dr.x - x, dr.z - z) < 2.4)) continue;
        if (interiors.some((px) => Math.abs(px - x) < 1.2)) continue;
        if (containers.some((c) => Math.hypot(c.x - x, c.z - z) < 1.6)) continue;
        addContainer(type, x, z, rot);
        break;
      }
    }
    buildings.push({ x0, x1, z0, z1, kind: kindName, doors });
  }

  function addWall(minX, minZ, maxX, maxZ, color) {
    walls.push({ minX, maxX, minZ, maxZ, y0: 0, y1: WALL_H, color });
    addBox(minX, minZ, maxX, maxZ, {});
  }

  function addContainer(type, x, z, rot = 0) {
    const ct = CONTAINER_TYPES[type];
    const [sw, sh, sd] = ct.size;
    const grid = makeGrid(ct.w, ct.h);
    const [lo, hi] = ct.rolls;
    for (const it of rollLoot(type, Math.floor(rnd(lo, hi + 1)))) addItem(grid, it);
    const c = { type, name: ct.name, x, z, grid, searched: false };
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
      const r = Math.random();
      if (r < 0.12) { // park
        for (let i = 0; i < 6; i++) trees.push([rnd(lx0, lx1), rnd(lz0, lz1)]);
        continue;
      }
      if (r < 0.22) { // parking lot
        for (let i = 0; i < 4; i++) car(rnd(lx0 + 3, lx1 - 3), rnd(lz0 + 3, lz1 - 3), Math.random() < 0.5 ? 0 : Math.PI / 2);
        continue;
      }
      const kind = r < 0.55 ? 'house' : r < 0.72 ? 'shop' : r < 0.84 ? 'clinic' : 'warehouse';
      if (kind === 'house' && Math.random() < 0.6) {
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
    if (Math.random() < 0.6) {
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
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 3, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), trees.length);
  const leafMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 7), new THREE.MeshStandardMaterial({ color: 0x24361e, roughness: 1 }), trees.length);
  trees.forEach(([x, z], i) => {
    const s = rnd(0.8, 1.4);
    m4.makeScale(s, s, s); m4.setPosition(x, 1.5 * s, z); trunkMesh.setMatrixAt(i, m4);
    m4.makeScale(s, s, s); m4.setPosition(x, 4.5 * s, z); leafMesh.setMatrixAt(i, m4);
    addBox(x - 0.25, z - 0.25, x + 0.25, z + 0.25, { blocksSight: false, h: 6 });
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
    c.mesh = corpseMesh(group, x, z, 0x4a4a3a);
    c.y = 0.3;
  }

  // Extraction points near the edges
  const EXTRACTS = [
    { name: 'Road to Customs', x: 0, z: -112 },
    { name: 'Boat Dock', x: 112, z: 20 },
    { name: 'ZB-1011 Bunker', x: -112, z: -60 },
    { name: 'Crossroads', x: -40, z: 112 },
    { name: 'Railway Tunnel', x: 80, z: 112 },
  ].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const e of EXTRACTS) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.15, 24), new THREE.MeshBasicMaterial({ color: 0x33ff66, transparent: true, opacity: 0.25 }));
    beam.position.set(e.x, 0.1, e.z);
    group.add(beam);
    const flare = new THREE.PointLight(0x55ff77, 6, 18, 1.5);
    flare.position.set(e.x, 2, e.z);
    group.add(flare);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), new THREE.MeshBasicMaterial({ color: 0x55ff77 }));
    pole.position.set(e.x, 1.5, e.z);
    group.add(pole);
  }

  // Player spawn points: on road edges far from extracts
  const spawns = [[0, 100], [100, 0], [-100, 0], [0, -100], [-100, 100], [100, -100], [60, 60], [-60, -60]];

  return { group, hash, containers, buildings, roads, trees, extracts: EXTRACTS, spawns, addContainer, dispose: () => scene.remove(group) };
}

export function corpseMesh(parent, x, z, color) {
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
  g.rotation.y = Math.random() * Math.PI * 2;
  parent.add(g);
  return g;
}
