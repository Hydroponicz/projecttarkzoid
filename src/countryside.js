// Farmland and wilderness around the town: dirt roads, farms with a
// farmhouse, a red barn, silo, coop, well and a vegetable garden; fenced
// fields of wheat, corn, vegetables and pasture; apple orchards; forests with
// clearings, hunting cabins and campsites; meadows with ponds, rocks and
// berry bushes. Farm loot is seeds, tools and food.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeableMaterial } from './worldtex.js';

const CELL = 40;
const TOWN = 100;   // town lots end here (the outer town road runs along it)
const DIRT = 6;     // dirt road width
const FARM_NAMES = ['Miller', 'Hollow Creek', 'Kessler', 'Sunny Acres', 'Old Mill', 'Brandt', 'Pine Ridge', 'Whitfield', 'Cedar Hill', 'Novak'];

// Geometry with a flat vertex colour so many parts merge into one mesh.
function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// parts: [geometry, colour, x, y, z, scaleX?, scaleY?, scaleZ?]
function compound(parts) {
  const geos = parts.map(([geo, hex, x, y, z, sx = 1, sy = sx, sz = sx]) => {
    const g = colored(geo.clone(), hex);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    return g;
  });
  const m = mergeGeometries(geos);
  m.computeVertexNormals();
  return m;
}

const vcMat = (rough = 0.95) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, flatShading: true });

// Instanced meshes split into map chunks so the camera (and the sun's shadow
// camera) only draw the ones near the player. items: [{x, z, matrix, color?}]
// Returns, per item, where its instance lives: {mesh, k}.
const CHUNK = 60;
function chunked(group, geo, mat, items, { shadow = true, receive = false } = {}) {
  const buckets = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(it);
  }
  const where = new Map();
  for (const list of buckets.values()) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, k) => {
      m.setMatrixAt(k, it.matrix);
      if (it.color) m.setColorAt(k, it.color);
      where.set(it, { mesh: m, k });
    });
    m.castShadow = shadow; m.receiveShadow = receive;
    m.computeBoundingSphere();
    m.userData.cull = { kind: 'chunk' }; // culled by distance (World.cull)
    group.add(m);
  }
  return where;
}

// Tree species. Each is one instanced mesh (trunk and foliage merged).
function speciesGeometry(sp) {
  const C = (r0, r1, h, s = 6) => new THREE.CylinderGeometry(r0, r1, h, s);
  const K = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
  const I = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
  if (sp === 'pine') return compound([[C(0.12, 0.22, 2.4), 0x4a3222, 0, 1.2, 0], [K(1.7, 2.8), 0x22341c, 0, 2.6, 0], [K(1.3, 2.4), 0x283c20, 0, 3.8, 0], [K(0.85, 2.0), 0x2e4426, 0, 5.0, 0]]);
  if (sp === 'oak') return compound([[C(0.18, 0.3, 2.8), 0x4a3a28, 0, 1.4, 0], [I(1.7), 0x34502a, 0, 3.7, 0], [I(1.2), 0x3a5a2e, 0.95, 3.2, 0.45], [I(1.3), 0x2e4a26, -0.85, 3.4, -0.5], [I(1.1), 0x40602e, 0.1, 4.5, -0.2]]);
  if (sp === 'birch') return compound([[C(0.09, 0.14, 4.2), 0xd8d4c8, 0, 2.1, 0], [C(0.095, 0.095, 0.12), 0x2a2a2a, 0, 1.5, 0], [C(0.093, 0.093, 0.1), 0x2a2a2a, 0, 2.6, 0], [I(0.95), 0x6a8a3a, 0, 4.4, 0], [I(0.8), 0x5a7a32, 0.35, 3.6, 0.2], [I(0.7), 0x74943e, -0.3, 3.9, -0.25]]);
  if (sp === 'apple') return compound([[C(0.12, 0.18, 1.5), 0x5a4030, 0, 0.75, 0], [I(1.45, 1), 0x4a6a2a, 0, 2.35, 0, 1, 0.8, 1], [I(1.0), 0x52742e, 0.6, 2.0, 0.35]]);
  return null;
}
const SPECIES = ['pine', 'oak', 'birch', 'apple'];

// Instanced trees (town park trees, forests, orchards). Returns handles to
// fell a tree and to show or hide the fruit on an apple tree.
// Foliage colour hooks for the seasons (weather.js drives the uniforms):
// leaf tint multiplies greenish vertex colours only (not trunks), snow
// lightens them.
function seasonal(mat, u) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLeafTint = u.uLeafTint; sh.uniforms.uSnow = u.uSnow;
    sh.fragmentShader = 'uniform vec3 uLeafTint;\nuniform float uSnow;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float leafy = step(vColor.r + 0.02, vColor.g);
      diffuseColor.rgb = mix(diffuseColor.rgb, clamp(diffuseColor.rgb * uLeafTint, 0.0, 1.0), leafy);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * leafy);`);
  };
  mat.customProgramCacheKey = () => 'seasonal';
  return mat;
}

export function plantTrees({ group, trees, addBox, rnd }) {
  const foliage = {
    deciduous: { uLeafTint: { value: new THREE.Vector3(1, 1, 1) }, uSnow: { value: 0 } },
    pine: { uLeafTint: { value: new THREE.Vector3(1, 1, 1) }, uSnow: { value: 0 } },
  };
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const boxes = [];
  const items = Object.fromEntries(SPECIES.map((sp) => [sp, []]));
  const fruitItems = [];
  const ref = trees.map((t, i) => {
    const [x, z] = t, sp = t[2] || 'oak';
    const s = sp === 'pine' ? rnd(0.85, 1.45) : sp === 'apple' ? rnd(0.85, 1.05) : rnd(0.8, 1.3);
    q.setFromAxisAngle(up, rnd(0, Math.PI * 2));
    const matrix = new THREE.Matrix4().compose(pos.set(x, 0, z), q, scl.set(s, s * rnd(0.9, 1.1), s));
    const it = { x, z, matrix, color: new THREE.Color().setHSL(0, 0, rnd(0.82, 1.08)) };
    items[sp].push(it);
    const r = { it, sp };
    if (sp === 'apple') { r.fruit = { x, z, matrix }; fruitItems.push(r.fruit); }
    const tr = 0.25 * Math.max(1, s);
    boxes.push(addBox(x - tr, z - tr, x + tr, z + tr, { blocksSight: false, h: 6 * s, tree: i }));
    return r;
  });
  const where = new Map();
  for (const sp of SPECIES) {
    if (!items[sp].length) continue;
    const mat = seasonal(vcMat(), sp === 'pine' ? foliage.pine : foliage.deciduous);
    for (const [k, v] of chunked(group, speciesGeometry(sp), mat, items[sp], { receive: true })) where.set(k, v);
  }
  // Apples: a cluster of fruit on each apple tree, hidden once picked.
  if (fruitItems.length) {
    const parts = [];
    // On the surface of the canopy (an ellipsoid 1.45 wide, 1.16 tall at 2.35)
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, y = 1.75 + ((i * 7) % 6) * 0.2, k = (y - 2.35) / 1.16;
      const r = 1.45 * Math.sqrt(Math.max(0, 1 - k * k)) + 0.06;
      parts.push([new THREE.IcosahedronGeometry(0.11, 0), i % 3 ? 0xc8302a : 0xd84a2a, Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    for (const [k, v] of chunked(group, compound(parts), vcMat(0.6), fruitItems, { shadow: false })) where.set(k, v);
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const set = (it, m) => { const w = where.get(it); w.mesh.setMatrixAt(w.k, m); w.mesh.instanceMatrix.needsUpdate = true; };
  return {
    boxes, foliage,
    fell(i) {
      const r = ref[i];
      set(r.it, zero);
      if (r.fruit) { set(r.fruit, zero); r.felled = true; }
    },
    setFruit(i, on) {
      const r = ref[i];
      if (!r?.fruit || r.felled) return;
      set(r.fruit, on ? r.fruit.matrix : zero);
    },
  };
}

// ---------------------------------------------------------------------------
// ctx: helpers from buildWorld (seeded rand, scene group, colliders, building
// and container factories, the shared tree list and spawn/landmark lists).
export function buildCountryside(ctx) {
  const { rand, rnd, pick, shuffle, group, fur, addBox, prop, building, car, addContainer, trees, zombieSpawns, landmarks, HALF } = ctx;
  const dirtRoads = [];
  const features = [];   // for the map: {x0, z0, x1, z1, color} or {x, z, r, color}
  const gardens = [];    // pre-dug farm garden plots: {x, z, crop, growth, water}
  const forage = [];     // apple trees, berry bushes, crop rows
  const water = [];      // wells and ponds
  const rocks = [], bushes = [], berryBushes = [];
  const M = fur.M;

  // --- dirt roads: town streets continue out as farm tracks, plus a ring ---
  const dirtMat = mergeableMaterial('dirt', 0xffffff, 0.3, 1);
  const rutMat = mergeableMaterial('dirt', 0x8a7a68, 0.3, 1);
  Object.assign(dirtMat, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 8 }); // under the ruts (see the ground in world.js)
  function dirtRoad(axis, k, a0, a1) {
    const len = a1 - a0, mid = (a0 + a1) / 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? DIRT : len, axis === 'x' ? len : DIRT), dirtMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(axis === 'x' ? k : mid, 0.012, axis === 'x' ? mid : k);
    m.receiveShadow = true;
    group.add(m);
    for (const o of [-1.1, 1.1]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? 0.5 : len, axis === 'x' ? len : 0.5), rutMat);
      r.rotation.x = -Math.PI / 2;
      r.position.set(axis === 'x' ? k + o : mid, 0.016, axis === 'x' ? mid : k + o);
      group.add(r);
    }
    dirtRoads.push({ axis, k, a0, a1 });
  }
  const E = HALF - 3;
  for (const k of [-20, 60]) { dirtRoad('x', k, -E, -TOWN - 4); dirtRoad('x', k, TOWN + 4, E); }
  for (const k of [-60, 20]) { dirtRoad('z', k, -E, -TOWN - 4); dirtRoad('z', k, TOWN + 4, E); }
  const RING = 140;
  for (const s of [-1, 1]) { dirtRoad('x', s * RING, -RING - DIRT / 2, RING + DIRT / 2); dirtRoad('z', s * RING, -RING + DIRT / 2, RING - DIRT / 2); }
  const onRoad = (x, z, pad = 1) => dirtRoads.some((r) => {
    const [u, v] = r.axis === 'x' ? [x, z] : [z, x];
    return Math.abs(u - r.k) < DIRT / 2 + pad && v > r.a0 - pad && v < r.a1 + pad;
  });

  // --- cells ---
  const cells = [];
  const N = Math.round((HALF * 2) / CELL);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = -HALF + (i + 0.5) * CELL, cz = -HALF + (j + 0.5) * CELL;
    if (Math.abs(cx) < TOWN && Math.abs(cz) < TOWN) continue;
    const band = Math.max(Math.abs(cx), Math.abs(cz)) < 130 ? 1 : Math.max(Math.abs(cx), Math.abs(cz)) < 170 ? 2 : 3;
    cells.push({ i, j, cx, cz, band, type: null });
  }
  const cellAt = (i, j) => cells.find((c) => c.i === i && c.j === j);
  const neigh = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => cellAt(c.i + a, c.j + b)).filter(Boolean);
  // Usable interior of a cell: clear of the roads that run along its edges
  const inner = (c, m = 4) => ({ x0: c.cx - CELL / 2 + m, x1: c.cx + CELL / 2 - m, z0: c.cz - CELL / 2 + m, z1: c.cz + CELL / 2 - m });

  // Farms in the nearer bands, fields around them, orchards, then forests
  // grown out from a few seeds; whatever is left is open meadow.
  const free = () => cells.filter((c) => !c.type);
  const farms = [];
  for (const c of shuffle(free().filter((f) => f.band < 3))) {
    if (farms.length < 8 && farms.every((o) => Math.abs(o.i - c.i) + Math.abs(o.j - c.j) > 2)) farms.push(c);
  }
  for (const f of farms) f.type = 'farm';
  for (const f of farms) {
    const ns = shuffle(neigh(f).filter((n) => !n.type));
    const k = 2 + (rand() < 0.5 ? 1 : 0);
    for (const n of ns.slice(0, k)) { n.type = 'field'; n.farm = f; }
  }
  for (const c of shuffle(free()).slice(0, 4)) c.type = 'orchard';
  const seeds = shuffle(free().filter((c) => c.band >= 2)).slice(0, 7);
  const forest = [...seeds];
  for (const s of seeds) s.type = 'forest';
  while (forest.length < 36) {
    const from = pick(forest), n = neigh(from).filter((c) => !c.type);
    if (!n.length) { if (forest.every((f) => !neigh(f).some((c) => !c.type))) break; continue; }
    const c = pick(n);
    c.type = 'forest';
    forest.push(c);
  }
  for (const c of free()) c.type = 'meadow';

  // --- small pieces ---
  const cylMesh = (r0, r1, h, color, x, y, z, seg = 10) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), M(color));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const solid = (x, z, hw, hd, h, opts = {}) => addBox(x - hw, z - hd, x + hw, z + hd, { blocksSight: false, h, ...opts });
  // Round hay bale lying on its side
  const roundBale = (x, z, rot) => {
    const m = cylMesh(0.75, 0.75, 1.3, rand() < 0.5 ? 0xc8a850 : 0xb8984a, x, 0.75, z, 12);
    m.rotation.set(0, rot, Math.PI / 2, 'YXZ');
    const ax = Math.abs(Math.cos(rot)) > 0.7;
    solid(x, z, ax ? 0.65 : 0.75, ax ? 0.75 : 0.65, 1.5, { blocksShot: true });
  };
  const deadCorpse = (x, z, type = 'body') => { const c = addContainer(type, x, z); c.mesh = ctx.corpseMesh(group, x, z, pick([0x4a4a3a, 0x5a4a3a, 0x3a4a5a]), rand() * 6.3); return c; };

  // Post-and-rail fence round a rectangle with gate gaps in the middle of
  // the given sides. Rails stop you and zombies but not bullets or sight.
  function fence(r, gates = ['n', 's', 'e', 'w'], color = 0x6a5238) {
    const runs = [['n', 'x', r.x0, r.x1, r.z0], ['s', 'x', r.x0, r.x1, r.z1], ['w', 'z', r.z0, r.z1, r.x0], ['e', 'z', r.z0, r.z1, r.x1]];
    for (const [side, ax, a0, a1, f] of runs) {
      const segs = gates.includes(side) ? [[a0, (a0 + a1) / 2 - 2], [(a0 + a1) / 2 + 2, a1]] : [[a0, a1]];
      for (const [s0, s1] of segs) {
        const len = s1 - s0, mid = (s0 + s1) / 2;
        const px = ax === 'x' ? mid : f, pz = ax === 'x' ? f : mid;
        for (const y of [0.45, 0.9]) prop(ax === 'x' ? len : 0.06, 0.1, ax === 'x' ? 0.06 : len, color, px, y, pz);
        const n = Math.max(1, Math.round(len / 2.5));
        for (let i = 0; i <= n; i++) {
          const a = s0 + (len * i) / n;
          prop(0.12, 1.15, 0.12, 0x4a3a28, ax === 'x' ? a : f, 0.575, ax === 'x' ? f : a);
        }
        addBox(ax === 'x' ? s0 : f - 0.06, ax === 'x' ? f - 0.06 : s0, ax === 'x' ? s1 : f + 0.06, ax === 'x' ? f + 0.06 : s1, { blocksSight: false, blocksShot: false, h: 1.1 });
      }
    }
  }

  // Rows of a crop across a rectangle (along x or z), merged into scenery.
  function rows(r, axis, gap, w, h, color, alt) {
    const [a0, a1, b0, b1] = axis === 'x' ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
    let i = 0;
    for (let b = b0 + gap / 2; b < b1; b += gap, i++) {
      const len = a1 - a0, mid = (a0 + a1) / 2, c = alt && i % 2 ? alt : color;
      const m = axis === 'x' ? prop(len, h, w, c, mid, h / 2, b) : prop(w, h, len, c, b, h / 2, mid);
      if (h < 0.3) m.castShadow = false;
    }
  }
  const groundPatch = (r, color, y = 0.02) => { prop(r.x1 - r.x0, 0.02, r.z1 - r.z0, color, (r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2).castShadow = false; };

  // Instanced corn stalks (one mesh for every corn field)
  const cornStalks = [];
  // Forage points: something you can pick from that grows back over days.
  const addForage = (f) => { f.kind = 'forage'; f.n = f.n ?? f.max; forage.push(f); return f; };

  // --- farm ---
  function farm(c, idx) {
    const name = `${FARM_NAMES[idx % FARM_NAMES.length]} Farm`;
    const sx = rand() < 0.5 ? 1 : -1, sz = rand() < 0.5 ? 1 : -1, tr = rand() < 0.5;
    const P = (u, v) => { const [a, b] = tr ? [v, u] : [u, v]; return [c.cx + a * sx, c.cz + b * sz]; };
    const dims = (w, d) => (tr ? [d, w] : [w, d]);
    // Farmhouse and barn
    const [hx, hz] = P(-9, -9), [hw, hd] = dims(rnd(10, 11.5), rnd(9, 10.5));
    building(hx, hz, hw, hd, 'farmhouse');
    const [bx, bz] = P(8, 6), [bw, bd] = dims(12, rnd(14, 15.5));
    const barn = building(bx, bz, bw, bd, 'barn');
    // Silo
    const [ox, oz] = P(13.5, -9.5);
    cylMesh(2.1, 2.1, 9, 0xb8b8b0, ox, 4.5, oz, 16);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(0x8a8a88, 0.6, 0.4));
    dome.position.set(ox, 9, oz); dome.castShadow = true; group.add(dome);
    for (let y = 1.5; y < 9; y += 1.5) cylMesh(2.14, 2.14, 0.08, 0x8a8a84, ox, y, oz, 16);
    solid(ox, oz, 1.9, 1.9, 9, { blocksSight: true, blocksShot: true });
    // Chicken coop with a little run, produce crates by the barn
    const [cx2, cz2] = P(-1, -14);
    addContainer('chicken_coop', cx2, cz2, tr ? Math.PI / 2 : 0);
    const [px, pz] = P(2.6, -3.4);
    addContainer('produce_crate', px, pz, rand() * 0.4);
    if (rand() < 0.7) { const [qx, qz] = P(3.7, -3.2); addContainer('produce_crate', qx, qz, rand() * 0.4); }
    // Tractor, plow, hay and a farm truck
    const [tx, tz] = P(3, -9);
    const trot = rand() < 0.5 ? 0 : Math.PI / 2;
    fur.model('tractor', tx, tz, trot, {}, rand);
    const tax = Math.abs(Math.sin(trot)) > 0.5;
    solid(tx, tz, tax ? 1.7 : 0.95, tax ? 0.95 : 1.7, 2.2, { blocksShot: true });
    const [lx, lz] = P(-2, -6.5);
    fur.model('plow', lx, lz, rand() * 6.3, {}, rand);
    for (let i = 0; i < 3; i++) { const [rx, rz] = P(9 - i * 1.9, -14.2); roundBale(rx, rz, tr ? 0 : Math.PI / 2); }
    const [vx, vz] = P(-1.5, 11);
    car(vx, vz, (tr ? 0 : Math.PI / 2) + rnd(-0.2, 0.2), null, { type: 'pickup' });
    // Well (water for drinking and for your watering can)
    const [wx, wz] = P(-1.5, 3.5);
    cylMesh(0.75, 0.8, 0.8, 0x8a8478, wx, 0.4, wz, 12);
    cylMesh(0.6, 0.6, 0.05, 0x1a2a30, wx, 0.76, wz, 12);
    for (const s of [-1, 1]) prop(0.1, 1.7, 0.1, 0x5a4028, wx + s * 0.7, 0.85, wz);
    const roof = prop(1.8, 0.06, 1.1, 0x6a3a2a, wx, 1.75, wz); roof.rotation.x = 0.1;
    prop(1.4, 0.06, 0.06, 0x5a4028, wx, 1.45, wz);
    solid(wx, wz, 0.8, 0.8, 0.85, { blocksShot: true });
    water.push({ kind: 'water', name: 'Well', x: wx, z: wz, reach: 0.9, well: true });
    // Kitchen garden: dug plots with whatever was growing when it all began
    const crops = ['carrot', 'potato', 'tomato', 'cabbage', 'corn'];
    for (const u of [-12.5, -10, -7.5]) for (const v of [3.5, 6.5]) {
      if (rand() < 0.15) continue;
      const [gx, gz] = P(u, v);
      gardens.push({ x: gx, z: gz, crop: rand() < 0.85 ? pick(crops) : null, growth: rnd(0.2, 1.25), water: rnd(0, 40) });
    }
    const gr = (() => { const [a, b] = P(-14, 2), [e, f] = P(-6, 8); return { x0: Math.min(a, e), x1: Math.max(a, e), z0: Math.min(b, f), z1: Math.max(b, f) }; })();
    // Low picket fence round the garden (decorative)
    for (const [x0, z0, x1, z1] of [[gr.x0, gr.z0, gr.x1, gr.z0], [gr.x0, gr.z1, gr.x1, gr.z1], [gr.x0, gr.z0, gr.x0, gr.z1], [gr.x1, gr.z0, gr.x1, (gr.z0 + gr.z1) / 2 - 1]]) {
      const ax = x1 - x0 > z1 - z0, len = ax ? x1 - x0 : z1 - z0;
      for (const y of [0.22, 0.5]) prop(ax ? len : 0.03, 0.05, ax ? 0.03 : len, 0xe8e4dc, (x0 + x1) / 2, y, (z0 + z1) / 2);
      for (let t = 0.05; t < len; t += 0.28) prop(ax ? 0.07 : 0.025, 0.7, ax ? 0.025 : 0.07, 0xf0ece4, ax ? x0 + t : x0, 0.35, ax ? z0 : z0 + t);
    }
    zombieSpawns.push({ x: c.cx, z: c.cz, r: 12, n: 1 + Math.floor(rand() * 2), type: null });
    landmarks.push({ x: c.cx, z: c.cz, name, kind: 'farm' });
    features.push({ ...inner(c, 3), color: '#4a4a30' });
    c.barn = barn;
  }

  // --- fields ---
  function field(c) {
    const r = inner(c, 5);
    const kind = pick(['wheat', 'wheat', 'corn', 'corn', 'veg', 'veg', 'plowed', 'pasture', 'hay']);
    const axis = rand() < 0.5 ? 'x' : 'z';
    if (kind === 'wheat') {
      groundPatch(r, 0x8a7a3a);
      rows(r, axis, 0.75, 0.55, rnd(0.7, 0.9), 0xc8b05a, 0xb8a04a);
      for (let i = 0; i < 3; i++) if (rand() < 0.5) roundBale(rnd(r.x0 + 2, r.x1 - 2), rnd(r.z0 + 2, r.z1 - 2), rand() * 3);
      features.push({ ...r, color: '#9a8a40' });
    } else if (kind === 'corn') {
      groundPatch(r, 0x5a4a30);
      const [a0, a1, b0, b1] = axis === 'x' ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
      for (let b = b0 + 0.6; b < b1; b += 1.1) for (let a = a0 + 0.4; a < a1; a += 0.75) {
        if (rand() < 0.08) continue;
        const [x, z] = axis === 'x' ? [a + rnd(-0.1, 0.1), b] : [b, a + rnd(-0.1, 0.1)];
        cornStalks.push([x, z, rnd(0.85, 1.15), rand() * 6.3]);
      }
      // Ears of corn to pick along the rows
      for (let i = 0; i < 4; i++) addForage({ name: 'Corn Rows', item: 'corn', max: 4, regen: 1.5, x: rnd(r.x0 + 1, r.x1 - 1), z: rnd(r.z0 + 1, r.z1 - 1), reach: 1.2 });
      features.push({ ...r, color: '#6a7a2a' });
    } else if (kind === 'veg') {
      fence({ x0: r.x0 - 1, x1: r.x1 + 1, z0: r.z0 - 1, z1: r.z1 + 1 });
      groundPatch(r, 0x4a3a28);
      const crop = pick(['cabbage', 'potato', 'carrot']);
      const leaf = { cabbage: 0x7aaa4a, potato: 0x4a7a2a, carrot: 0x5a8a2a }[crop];
      rows(r, axis, 1.2, 0.5, 0.12, 0x5a4630); // ridges
      const [a0, a1, b0, b1] = axis === 'x' ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
      for (let b = b0 + 0.6; b < b1; b += 1.2) for (let a = a0 + 0.5; a < a1; a += crop === 'cabbage' ? 0.9 : 0.6) {
        if (rand() < 0.15) continue;
        const [x, z] = axis === 'x' ? [a, b] : [b, a];
        bushes.push([x, z, crop === 'cabbage' ? rnd(0.32, 0.42) : rnd(0.22, 0.3), leaf, 0.12]);
      }
      const label = { cabbage: 'Cabbage Rows', potato: 'Potato Rows', carrot: 'Carrot Rows' }[crop];
      for (let i = 0; i < 4; i++) addForage({ name: label, item: crop, max: 3, regen: 1, x: rnd(r.x0 + 1, r.x1 - 1), z: rnd(r.z0 + 1, r.z1 - 1), reach: 1.2 });
      features.push({ ...r, color: '#5a6a30' });
    } else if (kind === 'plowed') {
      groundPatch(r, 0x4a3a28);
      rows(r, axis, 0.9, 0.4, 0.15, 0x5a4630);
      if (rand() < 0.6) fur.model('plow', rnd(r.x0 + 2, r.x1 - 2), rnd(r.z0 + 2, r.z1 - 2), rand() * 6.3, {}, rand);
      features.push({ ...r, color: '#5a4a30' });
    } else if (kind === 'pasture') {
      fence({ x0: r.x0 - 1, x1: r.x1 + 1, z0: r.z0 - 1, z1: r.z1 + 1 });
      groundPatch(r, 0x4a5a2a);
      const t = { x: rnd(r.x0 + 3, r.x1 - 3), z: rnd(r.z0 + 3, r.z1 - 3) };
      fur.model('trough', t.x, t.z, 0, {}, rand);
      solid(t.x, t.z, 1, 0.3, 0.6, { blocksShot: true });
      for (let i = 0; i < 5; i++) bushes.push([rnd(r.x0, r.x1), rnd(r.z0, r.z1), rnd(0.3, 0.6), 0x4a6a2a, 0.2]);
      if (rand() < 0.6) deadCorpse(rnd(r.x0 + 2, r.x1 - 2), rnd(r.z0 + 2, r.z1 - 2));
      features.push({ ...r, color: '#4a6a30' });
    } else {
      groundPatch(r, 0x8a8a4a);
      for (let i = 0; i < 7; i++) roundBale(rnd(r.x0 + 2, r.x1 - 2), rnd(r.z0 + 2, r.z1 - 2), rand() * 3);
      features.push({ ...r, color: '#8a8a50' });
    }
  }

  // --- orchard: rows of apple trees, a shed and crates of windfall ---
  function orchard(c) {
    const r = inner(c, 5);
    groundPatch(r, 0x4a5a2a);
    for (let x = r.x0 + 3; x < r.x1 - 1; x += 6) for (let z = r.z0 + 3; z < r.z1 - 1; z += 6) {
      if (rand() < 0.1) continue;
      const tx = x + rnd(-0.4, 0.4), tz = z + rnd(-0.4, 0.4);
      trees.push([tx, tz, 'apple']);
      const n = rand() < 0.75 ? 2 + Math.floor(rand() * 3) : 0;
      addForage({ name: 'Apple Tree', item: 'apple', max: 4, n, regen: 1.5, x: tx, z: tz, reach: 1.3, tree: trees.length - 1 });
    }
    for (let i = 0; i < 2; i++) addContainer('produce_crate', rnd(r.x0 + 1, r.x1 - 1), r.z0 + 0.6 + i * 0.9, 0);
    landmarks.push({ x: c.cx, z: c.cz, name: 'Orchard', kind: 'orchard' });
    features.push({ ...r, color: '#3a5a2a' });
  }

  // --- forest: dense mixed woods, maybe a clearing with a cabin or camp ---
  function woods(c) {
    const r = inner(c, 1.5);
    let clearing = null;
    const special = c.special;
    if (special || rand() < 0.3) clearing = { x: rnd(r.x0 + 10, r.x1 - 10), z: rnd(r.z0 + 10, r.z1 - 10), r: special === 'cabin' ? 10 : rnd(6, 9) };
    for (let x = r.x0 + 1; x < r.x1; x += 3.1) for (let z = r.z0 + 1; z < r.z1; z += 3.1) {
      if (rand() < 0.18) continue;
      const tx = x + rnd(-1.1, 1.1), tz = z + rnd(-1.1, 1.1);
      if (clearing && Math.hypot(tx - clearing.x, tz - clearing.z) < clearing.r) continue;
      if (onRoad(tx, tz, 1.5)) continue;
      const v = rand();
      trees.push([tx, tz, v < 0.6 ? 'pine' : v < 0.85 ? 'oak' : 'birch']);
    }
    for (let i = 0; i < 6; i++) bushes.push([rnd(r.x0, r.x1), rnd(r.z0, r.z1), rnd(0.5, 1.0), pick([0x2e4a26, 0x3a5a2a]), 0.25]);
    for (let i = 0; i < 3; i++) rocks.push([rnd(r.x0 + 1, r.x1 - 1), rnd(r.z0 + 1, r.z1 - 1), rnd(0.4, 1.6)]);
    // Fallen logs you can hop over
    for (let i = 0; i < 2; i++) {
      const x = rnd(r.x0 + 3, r.x1 - 3), z = rnd(r.z0 + 3, r.z1 - 3), ax = rand() < 0.5, len = rnd(3, 5);
      if (clearing && Math.hypot(x - clearing.x, z - clearing.z) < clearing.r + 2) continue;
      const m = cylMesh(0.2, 0.24, len, 0x4a3a28, x, 0.2, z, 7);
      m.rotation.set(ax ? 0 : Math.PI / 2, 0, ax ? Math.PI / 2 : 0);
      solid(x, z, ax ? len / 2 : 0.22, ax ? 0.22 : len / 2, 0.4, { blocksShot: true });
    }
    features.push({ ...r, color: '#1e2a18' });
    if (!clearing) return;
    features.push({ x: clearing.x, z: clearing.z, r: clearing.r, color: '#3a4a2a' });
    for (let i = 0; i < 2; i++) { const a = rand() * 6.3; berryBush(clearing.x + Math.cos(a) * (clearing.r - 1.2), clearing.z + Math.sin(a) * (clearing.r - 1.2)); }
    if (special === 'cabin') {
      building(clearing.x, clearing.z, rnd(7, 8), rnd(6.5, 7.5), 'cabin');
      landmarks.push({ x: clearing.x, z: clearing.z, name: 'Hunting Cabin', kind: 'cabin' });
      zombieSpawns.push({ x: clearing.x, z: clearing.z, r: 8, n: 1, type: null });
    } else if (special === 'camp') {
      // Abandoned campsite: tents, a cold fire ring, the campers' gear
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; prop(0.2, 0.15, 0.2, 0x666660, clearing.x + Math.cos(a) * 0.45, 0.075, clearing.z + Math.sin(a) * 0.45); }
      prop(0.6, 0.06, 0.08, 0x2a2018, clearing.x, 0.06, clearing.z, 0.7);
      for (let i = 0; i < 2; i++) {
        const a = rand() * 6.3, x = clearing.x + Math.cos(a) * 4, z = clearing.z + Math.sin(a) * 4;
        const tent = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 4), M(pick([0x3a6a8a, 0x8a5a2a, 0x4a6a3a]), 0.9));
        tent.position.set(x, 0.8, z); tent.rotation.y = Math.PI / 4; tent.castShadow = true; group.add(tent);
        solid(x, z, 0.95, 0.95, 1.4);
      }
      addContainer('duffel', clearing.x + 2, clearing.z - 1.5).name = 'Camping Bag';
      deadCorpse(clearing.x - 1.8, clearing.z + 1.2);
      landmarks.push({ x: clearing.x, z: clearing.z, name: 'Campsite', kind: 'camp' });
      zombieSpawns.push({ x: clearing.x, z: clearing.z, r: 7, n: 2, type: null });
    }
  }

  function berryBush(x, z) {
    const i = berryBushes.length;
    berryBushes.push([x, z]);
    addForage({ name: 'Berry Bush', item: 'berries', max: 5, n: rand() < 0.8 ? 3 + Math.floor(rand() * 3) : 0, regen: 2, x, z, reach: 1.0, berry: i });
  }

  // --- meadow: open grass, a few trees, rocks, bushes, maybe a pond ---
  function meadow(c) {
    const r = inner(c, 3);
    // Pond first, so nothing else ends up in the water
    const pd = c.pond ? { x: c.cx + rnd(-5, 5), z: c.cz + rnd(-5, 5), r: rnd(5, 8) } : null;
    const dry = (x, z) => !pd || Math.hypot(x - pd.x, z - pd.z) > pd.r + 2.5;
    const n0 = { trees: trees.length, bushes: bushes.length, rocks: rocks.length };
    const n = 3 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) { const x = rnd(r.x0, r.x1), z = rnd(r.z0, r.z1); if (!onRoad(x, z, 1.5)) trees.push([x, z, rand() < 0.5 ? 'oak' : rand() < 0.5 ? 'birch' : 'pine']); }
    for (let i = 0; i < 8; i++) bushes.push([rnd(r.x0, r.x1), rnd(r.z0, r.z1), rnd(0.4, 0.9), pick([0x3a5a2a, 0x4a6a2a, 0x2e4a26]), 0.25]);
    for (let i = 0; i < 3; i++) rocks.push([rnd(r.x0, r.x1), rnd(r.z0, r.z1), rnd(0.3, 1.8)]);
    if (rand() < 0.4) { const x = rnd(r.x0 + 2, r.x1 - 2), z = rnd(r.z0 + 2, r.z1 - 2); if (dry(x, z)) berryBush(x, z); }
    if (pd) {
      for (const [list, from] of [[trees, n0.trees], [bushes, n0.bushes], [rocks, n0.rocks]]) for (let i = list.length - 1; i >= from; i--) if (!dry(list[i][0], list[i][1])) list.splice(i, 1);
      pond(pd.x, pd.z, pd.r);
    }
  }

  function pond(x, z, rad) {
    const mud = new THREE.Mesh(new THREE.CircleGeometry(rad + 1.2, 24), M(0x4a3e2a, 1));
    mud.rotation.x = -Math.PI / 2; mud.position.set(x, 0.018, z); group.add(mud);
    const w = new THREE.Mesh(new THREE.CircleGeometry(rad, 24), M(0x2a4a58, 0.08, 0.3));
    w.rotation.x = -Math.PI / 2; w.position.set(x, 0.03, z); group.add(w);
    // Reeds round the edge
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, d = rad + rnd(-0.6, 0.5), h = rnd(0.6, 1.3);
      prop(0.04, h, 0.04, pick([0x5a6a2a, 0x6a7a3a, 0x4a5a22]), x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d);
    }
    // You can't walk on the water: horizontal slices make a rough disc
    const n = 6;
    for (let i = 0; i < n; i++) {
      const z0 = z - rad + (2 * rad * i) / n, z1 = z - rad + (2 * rad * (i + 1)) / n;
      const zc = Math.abs((z0 + z1) / 2 - z), hw = Math.sqrt(Math.max(0, rad * rad - zc * zc)) - 0.4;
      if (hw > 0.3) addBox(x - hw, z0, x + hw, z1, { blocksSight: false, blocksShot: false, h: 0.6 });
    }
    water.push({ kind: 'water', name: 'Pond', x, z, reach: rad + 0.6 });
    features.push({ x, z, r: rad, color: '#2a4a68' });
  }

  // Assign forest specials and ponds, then build every cell
  const fcells = shuffle(cells.filter((c) => c.type === 'forest'));
  fcells.slice(0, 3).forEach((c) => { c.special = 'cabin'; });
  fcells.slice(3, 5).forEach((c) => { c.special = 'camp'; });
  shuffle(cells.filter((c) => c.type === 'meadow')).slice(0, 5).forEach((c) => { c.pond = true; });
  farms.forEach((c, i) => farm(c, i));
  for (const c of cells) {
    if (c.type === 'field') field(c);
    else if (c.type === 'orchard') orchard(c);
    else if (c.type === 'forest') woods(c);
    else if (c.type === 'meadow') meadow(c);
  }
  // A tree line along the edge of the map closes the world in
  for (let a = -HALF + 2; a < HALF - 2; a += 3.2) {
    for (const [x, z] of [[a, -HALF + rnd(1.5, 4)], [a, HALF - rnd(1.5, 4)], [-HALF + rnd(1.5, 4), a], [HALF - rnd(1.5, 4), a]]) {
      if (!onRoad(x, z, 0.5)) trees.push([x, z, rand() < 0.7 ? 'pine' : 'oak']);
    }
  }
  // A few cars left on the farm tracks
  for (let i = 0; i < 7; i++) {
    const r = pick(dirtRoads), along = rnd(r.a0 + 4, r.a1 - 4), off = rnd(-1.2, 1.2);
    // forward is (sin rot, cos rot): along the track, give or take
    const rot = (r.axis === 'x' ? 0 : Math.PI / 2) + rnd(-0.3, 0.3) + (rand() < 0.5 ? Math.PI : 0);
    if (r.axis === 'x') car(r.k + off, along, rot); else car(along, r.k + off, rot);
  }

  // --- instanced scenery: corn, rocks, bushes, berry bushes ---
  // Nothing big sitting on a road
  for (const list of [rocks, bushes]) for (let i = list.length - 1; i >= 0; i--) if (onRoad(list[i][0], list[i][1], list[i][2])) list.splice(i, 1);
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), scl = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mtx = (x, y, z, quat, sx, sy, sz) => new THREE.Matrix4().compose(pos.set(x, y, z), quat, scl.set(sx, sy, sz));
  if (cornStalks.length) {
    // Low-poly stalk: a three-sided stem, two leaf blades, an ear and a tassel
    const blade = (w, h) => { const g = new THREE.PlaneGeometry(w, h); return g; };
    const geo = compound([
      [new THREE.CylinderGeometry(0.025, 0.04, 2.1, 3, 1, true), 0x7a8a3a, 0, 1.05, 0],
      [blade(0.9, 0.12).rotateX(-Math.PI / 2).rotateZ(-0.35), 0x6a8a2a, 0.35, 1.2, 0],
      [blade(0.12, 0.8).rotateX(-Math.PI / 2 + 0.4), 0x5a7a2a, 0, 1.6, 0.3],
      [new THREE.CylinderGeometry(0.045, 0.035, 0.26, 3), 0xd8b84a, 0.06, 1.3, 0.04],
      [new THREE.ConeGeometry(0.08, 0.35, 3), 0xc8a85a, 0, 2.25, 0],
    ]);
    const mat = vcMat(); mat.side = THREE.DoubleSide;
    chunked(group, geo, mat, cornStalks.map(([x, z, s, r]) => {
      e.set(rnd(-0.06, 0.06), r, rnd(-0.06, 0.06));
      return { x, z, matrix: mtx(x, 0, z, q.setFromEuler(e), 1, s, 1), color: new THREE.Color().setHSL(0, 0, rnd(0.85, 1.1)) };
    }));
  }
  if (rocks.length) {
    const items = rocks.map(([x, z, s]) => {
      const sx = s * rnd(0.8, 1.3), sy = s * rnd(0.5, 0.8), sz = s * rnd(0.8, 1.3);
      e.set(rnd(-0.3, 0.3), rand() * 6.3, rnd(-0.3, 0.3));
      if (s > 0.7) solid(x, z, Math.min(sx, sz) * 0.75, Math.min(sx, sz) * 0.75, sy * 1.35, { blocksShot: true, blocksSight: sy * 1.35 > 1.4 });
      return { x, z, matrix: mtx(x, sy * 0.45, z, q.setFromEuler(e), sx, sy, sz), color: new THREE.Color().setHSL(0.1, 0.06, rnd(0.17, 0.3)) };
    });
    chunked(group, colored(new THREE.DodecahedronGeometry(1, 0), 0xffffff), vcMat(1), items, { receive: true });
  }
  const allBushes = [...bushes, ...berryBushes.map(([x, z]) => [x, z, 0.7, 0x2e4a26])];
  if (allBushes.length) {
    const geo = compound([[new THREE.IcosahedronGeometry(0.75, 0), 0xffffff, 0, 0.55, 0, 1, 0.75, 1], [new THREE.IcosahedronGeometry(0.55, 0), 0xe0e0e0, 0.4, 0.45, 0.2]]);
    chunked(group, geo, vcMat(), allBushes.map(([x, z, s, c]) => ({
      x, z, matrix: mtx(x, 0, z, q.setFromAxisAngle(up, rand() * 6.3), s, s * rnd(0.8, 1.1), s), color: new THREE.Color(c).multiplyScalar(rnd(0.85, 1.15)),
    })));
  }
  let berryWhere = null, berryItems = [];
  if (berryBushes.length) {
    const parts = [];
    for (let i = 0; i < 16; i++) { const a = i * 2.2, y = 0.3 + (i % 4) * 0.15; parts.push([new THREE.IcosahedronGeometry(0.05, 0), i % 2 ? 0x3a2a7a : 0x5a2a6a, Math.cos(a) * 0.62, y, Math.sin(a) * 0.55]); }
    berryItems = berryBushes.map(([x, z]) => ({ x, z, matrix: new THREE.Matrix4().makeTranslation(x, 0, z) }));
    berryWhere = chunked(group, compound(parts), vcMat(0.5), berryItems, { shadow: false });
  }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const setBerries = (i, on) => {
    const it = berryItems[i], w = it && berryWhere.get(it);
    if (!w) return;
    w.mesh.setMatrixAt(w.k, on ? it.matrix : zero);
    w.mesh.instanceMatrix.needsUpdate = true;
  };

  return { dirtRoads, features, gardens, forage, water, setBerries };
}
