// Procedural furniture and container models built from boxes. Every model is
// built in local space: origin at the centre of its footprint on the floor,
// front facing +z (away from the wall it stands against). Materials are
// shared by colour so the town's static scenery merges into few draw calls.
import * as THREE from 'three';

// Footprints of furniture that isn't a loot container: [width, depth, collider height]
export const FOOT = {
  bed_double: [1.6, 2.1, 0.6], bed_single: [1.0, 2.0, 0.6], sofa: [2.0, 0.9, 0.85], armchair: [0.9, 0.85, 0.85],
  coffee_table: [1.1, 0.6, 0.45], tv_stand: [1.5, 0.45, 0.5], bookshelf: [1.0, 0.35, 1.9], dining_table: [1.5, 0.9, 0.76],
  chair: [0.45, 0.45, 0.5], stove: [0.6, 0.6, 0.92], sink_counter: [1.0, 0.6, 0.92], toilet: [0.42, 0.68, 0.45],
  bathtub: [0.75, 1.7, 0.55], bath_sink: [0.6, 0.45, 0.9], plant: [0.45, 0.45, 1.1], floor_lamp: [0.35, 0.35, 1.6],
  rug: [2.0, 1.4, 0], checkout: [1.8, 0.7, 1.0], waiting_chairs: [2.0, 0.55, 0.5], exam_bed: [0.8, 1.9, 0.75],
  reception: [2.2, 0.75, 1.1], pallet: [1.2, 1.0, 0.9], cell_bars: [3.0, 0.12, 2.6], washer: [0.6, 0.6, 0.9],
  meeting_table: [2.6, 1.2, 0.76], vending: [0.9, 0.8, 1.9], counter: [1.2, 0.6, 0.92], forklift: [1.2, 2.4, 2.2],
  // Decorative shelving and fittings (not lootable)
  store_shelf: [1.6, 0.5, 1.5], pharma_shelf: [1.6, 0.45, 1.6], tool_rack: [1.6, 0.5, 1.8], rack: [2.4, 1.0, 2.4],
  bench: [1.6, 0.45, 0.45], lockers: [1.8, 0.5, 1.9], water_cooler: [0.35, 0.35, 1.3], freezer: [1.6, 0.8, 0.9],
  hospital_bed: [1.0, 2.1, 0.7], curtain: [0.05, 2.0, 1.9], whiteboard: [1.6, 0.05, 1.9],
  // Garage
  car_lift: [3.2, 4.6, 0], drum: [0.6, 0.6, 0.9], compressor: [0.8, 0.5, 0.8],
  // Farm
  tractor: [1.9, 3.4, 2.3], hay_stack: [2.4, 1.2, 1.4], stall: [3.0, 0.14, 1.4], trough: [2.0, 0.6, 0.6], plow: [1.8, 1.4, 0.7],
};

export function createFurnisher(group) {
  const mats = new Map();
  const M = (c, rough = 0.8, metal = 0, emissive = 0) => {
    const k = `${c}|${rough}|${metal}|${emissive}`;
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, ...(emissive ? { emissive, emissiveIntensity: 0.8 } : {}) }));
    return mats.get(k);
  };
  const geoCache = new Map();
  const boxGeo = (w, h, d) => {
    const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
    return geoCache.get(k);
  };
  // Box by its min corner y (bottom) for readability: B(g, w, h, d, mat, x, y0, z)
  const B = (g, w, h, d, mat, x, y0, z, rx = 0) => {
    const m = new THREE.Mesh(boxGeo(w, h, d), typeof mat === 'number' ? M(mat) : mat);
    m.position.set(x, y0 + h / 2, z);
    if (rx) m.rotation.x = rx;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cyl = (g, r, h, mat, x, y0, z, seg = 10) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof mat === 'number' ? M(mat) : mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const legs = (g, w, d, h, t, mat, inset = 0.04) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, t, h, t, mat, sx * (w / 2 - t / 2 - inset), 0, sz * (d / 2 - t / 2 - inset));
  };
  // Cabinet front: carcass with door/drawer lines and handles
  const cabinet = (g, w, h, d, body, opts = {}) => {
    B(g, w, h - 0.06, d, body, 0, 0.06, 0);
    B(g, w - 0.04, 0.06, d - 0.06, 0x222222, 0, 0, -0.03); // plinth
    const doors = opts.doors ?? Math.max(1, Math.round(w / 0.5));
    const dw = (w - 0.04) / doors;
    for (let i = 0; i < doors; i++) {
      const x = -w / 2 + 0.02 + dw * (i + 0.5);
      if (opts.drawers) {
        const n = opts.drawers;
        for (let j = 0; j < n; j++) {
          const y = 0.1 + ((h - 0.14) / n) * j;
          B(g, dw - 0.03, (h - 0.14) / n - 0.03, 0.02, opts.front ?? body, x, y, d / 2 + 0.005);
          B(g, Math.min(0.18, dw * 0.4), 0.025, 0.025, opts.handle ?? 0xb0b0b0, x, y + (h - 0.14) / n / 2 - 0.02, d / 2 + 0.025);
        }
      } else {
        B(g, dw - 0.03, h - 0.16, 0.02, opts.front ?? body, x, 0.1, d / 2 + 0.005);
        B(g, 0.025, 0.14, 0.025, opts.handle ?? 0xb0b0b0, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.07), h * 0.5, d / 2 + 0.025);
      }
    }
  };
  // Open shelving unit with stock on it
  const shelving = (g, w, h, d, frame, rnd, stock, levels = 4) => {
    for (const sx of [-1, 1]) B(g, 0.04, h, d, frame, sx * (w / 2 - 0.02), 0, 0);
    B(g, w, 0.03, 0.02, frame, 0, h - 0.03, -d / 2 + 0.01);
    for (let i = 0; i < levels; i++) {
      const y = 0.08 + i * ((h - 0.15) / (levels - 0.6));
      B(g, w - 0.08, 0.03, d, frame, 0, y, 0);
      if (!stock) continue;
      let x = -w / 2 + 0.08;
      while (x < w / 2 - 0.12) {
        const bw = 0.08 + rnd() * 0.16, bh = 0.08 + rnd() * 0.18;
        if (rnd() < 0.82 && x + bw < w / 2 - 0.06) B(g, bw, bh, d * (0.5 + rnd() * 0.35), stock[Math.floor(rnd() * stock.length)], x + bw / 2, y + 0.03, 0);
        x += bw + 0.02;
      }
    }
  };
  const BOOKS = [0x7a2a2a, 0x2a4a6a, 0x4a6a3a, 0x8a7a4a, 0x3a3a3a, 0x6a4a7a, 0xa8905a];
  const GOODS = [0xc84a3a, 0x3a7aaa, 0xd8b030, 0x6a9a4a, 0xe8e0c8, 0x9a6a3a, 0xaa3a6a, 0xdddddd];

  // ---------------------------------------------------------------------------
  // Models: (g, rnd, opt) → builds into g. Container models fit CONTAINER_TYPES sizes.
  // ---------------------------------------------------------------------------
  const MODELS = {
    // --- containers ---
    fridge: (g) => {
      B(g, 0.8, 1.82, 0.68, 0xe4e4e0, 0, 0, 0);
      B(g, 0.78, 0.01, 0.02, 0x888888, 0, 1.18, 0.345); // freezer seam
      B(g, 0.03, 0.4, 0.04, 0x9a9a9a, 0.33, 1.3, 0.36);
      B(g, 0.03, 0.5, 0.04, 0x9a9a9a, 0.33, 0.55, 0.36);
    },
    drinkfridge: (g, rnd) => {
      B(g, 0.85, 1.95, 0.7, 0xb02a2a, 0, 0, 0);
      B(g, 0.72, 1.6, 0.02, M(0x9ab8c8, 0.1, 0.3), 0, 0.2, 0.345);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) if (rnd() < 0.8) B(g, 0.1, 0.22, 0.1, GOODS[(i + j) % GOODS.length], -0.27 + j * 0.135, 0.28 + i * 0.4, 0.2);
      B(g, 0.85, 0.22, 0.02, M(0xffffff, 0.6, 0, 0x664444), 0, 1.72, 0.36); // lit header
    },
    cabinet: (g) => { cabinet(g, 1.2, 1.0, 0.5, 0x7a5a3a, { doors: 2, front: 0x8a6a48 }); B(g, 1.24, 0.03, 0.54, 0x5a4028, 0, 1.0, 0); },
    kitchen: (g, rnd, opt) => {
      cabinet(g, 0.9, 0.88, 0.6, opt?.body ?? 0xe8e4dc, { doors: 2, front: opt?.front ?? 0xd8d2c4, handle: 0x777777 });
      B(g, 0.92, 0.04, 0.62, opt?.top ?? 0x3a3a38, 0, 0.88, 0);
      B(g, 0.9, 0.7, 0.35, opt?.body ?? 0xe8e4dc, 0, 1.45, -0.125); // wall cupboard
      B(g, 0.86, 0.66, 0.02, opt?.front ?? 0xd8d2c4, 0, 1.47, 0.06);
      if (rnd() < 0.5) cyl(g, 0.06, 0.18, GOODS[Math.floor(rnd() * GOODS.length)], -0.25 + rnd() * 0.5, 0.92, 0.05);
    },
    wardrobe: (g) => {
      cabinet(g, 1.2, 2.0, 0.6, 0x6a4a30, { doors: 2, front: 0x7a5a3a, handle: 0xc0a060 });
      B(g, 1.24, 0.04, 0.64, 0x5a3a22, 0, 2.0, 0);
    },
    nightstand: (g, rnd) => {
      cabinet(g, 0.48, 0.55, 0.42, 0x6a4a30, { doors: 1, drawers: 2, front: 0x7a5a3a });
      B(g, 0.5, 0.03, 0.44, 0x5a3a22, 0, 0.55, 0);
      cyl(g, 0.07, 0.04, 0x333333, 0.08, 0.58, -0.04);
      cyl(g, 0.012, 0.25, 0x888888, 0.08, 0.62, -0.04, 6);
      cyl(g, 0.11, 0.14, M(0xf0e0b0, 0.9, 0, 0x332a10), 0.08, 0.84, -0.04);
      if (rnd() < 0.6) B(g, 0.15, 0.03, 0.2, BOOKS[Math.floor(rnd() * BOOKS.length)], -0.1, 0.58, 0.05);
    },
    dresser: (g) => { cabinet(g, 1.2, 0.9, 0.5, 0x6a4a30, { doors: 2, drawers: 3, front: 0x7a5a3a, handle: 0xc0a060 }); B(g, 1.22, 0.03, 0.52, 0x5a3a22, 0, 0.9, 0); B(g, 0.8, 0.6, 0.03, M(0xb8c8d0, 0.1, 0.6), 0, 1.1, -0.22); },
    bathroom: (g) => {
      // Mirrored cabinet over a little shelf (mounted on the wall)
      B(g, 0.6, 0.6, 0.15, 0xe8e8e4, 0, 1.25, -0.08);
      B(g, 0.56, 0.56, 0.02, M(0xc8d8e0, 0.05, 0.7), 0, 1.27, 0.0);
    },
    register: (g) => {
      B(g, 0.4, 0.12, 0.35, 0x2a2a2a, 0, 1.0, 0); B(g, 0.32, 0.18, 0.04, 0x3a3a3a, 0, 1.12, -0.1, -0.3);
      B(g, 0.28, 0.1, 0.02, M(0x2a3a2a, 0.3, 0, 0x0a2a0a), 0, 1.16, -0.08);
    },
    pc: (g) => {
      B(g, 1.2, 0.04, 0.6, 0x5a4636, 0, 0.72, 0); legs(g, 1.2, 0.6, 0.72, 0.05, 0x3a3a3a);
      B(g, 0.2, 0.42, 0.42, 0x1e1e22, 0.42, 0, 0.02); // tower
      B(g, 0.02, 0.05, 0.02, M(0x30ff60, 0.5, 0, 0x30ff60), 0.42, 0.36, 0.235);
      B(g, 0.55, 0.34, 0.04, 0x111111, 0, 0.85, -0.15); B(g, 0.06, 0.12, 0.06, 0x222222, 0, 0.76, -0.15);
      B(g, 0.5, 0.31, 0.01, M(0x18222a, 0.2, 0, 0x060c10), 0, 0.865, -0.125);
      B(g, 0.42, 0.02, 0.14, 0x2a2a2a, 0, 0.76, 0.1);
      B(g, 0.46, 0.48, 0.46, 0x2a2a2e, 0, 0, 0.55); // chair
      B(g, 0.46, 0.5, 0.06, 0x2a2a2e, 0, 0.48, 0.76);
    },
    desk: (g, rnd) => {
      B(g, 1.4, 0.04, 0.7, 0x6a5240, 0, 0.72, 0);
      const ped = new THREE.Group(); ped.position.x = 0.47; g.add(ped);
      cabinet(ped, 0.42, 0.72, 0.66, 0x5a4434, { doors: 1, drawers: 3 });
      B(g, 0.04, 0.72, 0.66, 0x5a4434, -0.66, 0, 0);
      B(g, 0.55, 0.34, 0.04, 0x111111, -0.1, 0.85, -0.2); B(g, 0.06, 0.12, 0.06, 0x222222, -0.1, 0.76, -0.2);
      B(g, 0.5, 0.3, 0.01, M(0x1a2430, 0.2, 0, 0x08101a), -0.1, 0.87, -0.175);
      B(g, 0.42, 0.02, 0.14, 0x2a2a2a, -0.1, 0.76, 0.08);
      if (rnd() < 0.7) B(g, 0.22, 0.03, 0.3, 0xf0f0f0, 0.35, 0.76, 0.05);
      if (rnd() < 0.5) cyl(g, 0.04, 0.1, GOODS[Math.floor(rnd() * GOODS.length)], 0.5, 0.76, -0.2, 8);
      B(g, 0.46, 0.46, 0.46, 0x2a2a2e, -0.1, 0, 0.6); B(g, 0.46, 0.5, 0.06, 0x2a2a2e, -0.1, 0.46, 0.82); // chair
    },
    filing: (g) => cabinet(g, 0.5, 1.3, 0.6, 0x7a7e82, { doors: 1, drawers: 4, handle: 0xc8c8c8 }),
    server: (g, rnd) => {
      B(g, 0.7, 2.0, 0.9, 0x1e1e24, 0, 0, 0);
      for (let i = 0; i < 12; i++) {
        B(g, 0.6, 0.11, 0.02, 0x2a2a32, 0, 0.12 + i * 0.15, 0.455);
        B(g, 0.02, 0.02, 0.01, M(0x30ff60, 0.5, 0, rnd() < 0.7 ? 0x30ff60 : 0xff6020), -0.25 + rnd() * 0.1, 0.17 + i * 0.15, 0.47);
      }
    },
    safe: (g) => { B(g, 0.7, 0.8, 0.7, M(0x3a3e3a, 0.5, 0.6), 0, 0, 0); B(g, 0.6, 0.7, 0.02, M(0x454a45, 0.5, 0.6), 0, 0.05, 0.355); cyl(g, 0.08, 0.04, M(0xb0b0a0, 0.3, 0.8), 0.12, 0.4, 0.37).rotation.x = Math.PI / 2; B(g, 0.04, 0.18, 0.04, M(0xb0b0a0, 0.3, 0.8), -0.18, 0.31, 0.38); },
    pillshelf: (g, rnd) => shelving(g, 1.6, 1.6, 0.45, 0xe8ece8, rnd, [0xffffff, 0xe8f0ff, 0x3a8a5a, 0xd84a3a, 0x5a9ad8, 0xe8a030]),
    foodshelf: (g, rnd) => shelving(g, 1.6, 1.5, 0.5, 0xb8b0a0, rnd, GOODS),
    toolshelf: (g, rnd) => shelving(g, 1.6, 1.8, 0.5, 0x8a6a3a, rnd, [0xaa3322, 0x9a9aa0, 0x3a5a8a, 0xd8a030, 0x555555], 4),
    medcab: (g, rnd) => {
      B(g, 0.9, 1.8, 0.45, 0xdde4e8, 0, 0, 0);
      B(g, 0.84, 1.1, 0.02, M(0xb8d0d8, 0.1, 0.2), 0, 0.62, 0.225);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) if (rnd() < 0.7) B(g, 0.1, 0.16, 0.12, [0xffffff, 0xd84a3a, 0x5a9ad8][(i + j) % 3], -0.3 + j * 0.15, 0.68 + i * 0.36, 0.05);
      cabinet(g, 0.9, 0.58, 0.45, 0xdde4e8, { doors: 2, front: 0xe8eef0 });
    },
    medbox: (g) => { B(g, 0.6, 0.4, 0.4, 0xcc3333, 0, 0, 0); B(g, 0.2, 0.06, 0.02, 0xffffff, 0, 0.17, 0.205); B(g, 0.06, 0.2, 0.02, 0xffffff, 0, 0.1, 0.205); B(g, 0.2, 0.03, 0.04, 0x222222, 0, 0.4, 0); },
    surgical: (g) => {
      for (const y of [0.15, 0.55, 0.9]) B(g, 0.8, 0.04, 0.5, M(0xc8d0d0, 0.3, 0.6), 0, y, 0);
      legs(g, 0.8, 0.5, 0.95, 0.03, M(0x9aa0a0, 0.3, 0.7), 0.01);
      B(g, 0.5, 0.1, 0.3, 0x8ab0a8, 0, 0.94, 0); B(g, 0.2, 0.08, 0.15, 0xffffff, 0.15, 0.59, 0);
    },
    toolbox: (g) => { B(g, 0.7, 0.3, 0.35, 0xaa3322, 0, 0, 0); B(g, 0.66, 0.02, 0.36, 0x881a12, 0, 0.18, 0); B(g, 0.3, 0.06, 0.04, 0x222222, 0, 0.3, 0); },
    lumber: (g, rnd) => { for (let i = 0; i < 9; i++) B(g, 1.6, 0.08, 0.24, [0xa8834a, 0x9a7a40, 0xb08a52][i % 3], (rnd() - 0.5) * 0.08, Math.floor(i / 3) * 0.085, -0.27 + (i % 3) * 0.27); },
    crate: (g) => { B(g, 1.4, 0.6, 0.7, 0x4a5a2a, 0, 0, 0); for (const x of [-0.6, 0, 0.6]) B(g, 0.06, 0.62, 0.72, 0x3a4a20, x, 0, 0); B(g, 0.3, 0.12, 0.01, 0xd8d8a0, 0.3, 0.3, 0.355); },
    milcrate: (g) => { B(g, 1.3, 0.6, 0.7, 0x3a4a2a, 0, 0, 0); for (const x of [-0.55, 0.55]) B(g, 0.06, 0.62, 0.72, 0x2a3a1e, x, 0, 0); B(g, 0.3, 0.1, 0.01, 0xd8d8a0, 0, 0.35, 0.355); for (const x of [-0.62, 0.62]) B(g, 0.03, 0.08, 0.2, 0x222222, x + Math.sign(x) * 0.03, 0.4, 0); },
    ammobox: (g) => { B(g, 0.6, 0.32, 0.35, 0x4a5a30, 0, 0, 0); B(g, 0.6, 0.04, 0.37, 0x3a4a22, 0, 0.32, 0); B(g, 0.18, 0.05, 0.03, 0x222222, 0, 0.36, 0); B(g, 0.25, 0.08, 0.01, 0xd8c860, 0, 0.12, 0.176); },
    duffel: (g) => { const m = cyl(g, 0.2, 0.9, 0x4a5a3a, 0, 0, 0, 10); m.rotation.z = Math.PI / 2; m.position.y = 0.2; B(g, 0.5, 0.04, 0.05, 0x2a3a22, 0, 0.38, 0); },
    policelocker: (g) => {
      B(g, 0.6, 1.8, 0.5, 0x3a4a6a, 0, 0, 0);
      B(g, 0.54, 1.7, 0.02, 0x45567a, 0, 0.05, 0.25);
      for (let i = 0; i < 5; i++) B(g, 0.3, 0.015, 0.01, 0x1a2a4a, 0, 1.45 + i * 0.05, 0.262);
      B(g, 0.03, 0.12, 0.03, 0xb0b0b0, 0.2, 0.9, 0.27);
    },
    evidence: (g) => { cabinet(g, 0.9, 1.6, 0.5, 0x5a5a6a, { doors: 2, front: 0x6a6a7a }); B(g, 0.4, 0.08, 0.01, 0xd8d8a0, 0, 1.35, 0.27); },
    // --- furniture ---
    bed_double: (g, rnd, opt) => {
      const w = opt?.w ?? 1.6, sheet = opt?.sheet ?? [0x6a7a9a, 0x9a6a6a, 0x7a8a6a, 0xb0a890][Math.floor(rnd() * 4)];
      B(g, w, 0.3, 2.0, 0x5a4030, 0, 0.1, 0.05);
      legs(g, w, 2.0, 0.1, 0.08, 0x3a2a1a, 0.02);
      B(g, w - 0.06, 0.2, 1.94, 0xe8e4dc, 0, 0.4, 0.05); // mattress
      B(g, w - 0.02, 0.06, 1.4, sheet, 0, 0.58, 0.32); // blanket
      B(g, w + 0.02, 0.24, 0.02, sheet, 0, 0.36, 1.03); // blanket overhang at the foot
      for (const sx of w > 1.2 ? [-0.38, 0.38] : [0]) B(g, 0.6, 0.12, 0.34, 0xf0f0ea, sx * w / 1.6, 0.6, -0.72);
      B(g, w + 0.04, 1.0, 0.08, 0x5a3a24, 0, 0, -1.0); // headboard
    },
    bed_single: (g, rnd, opt) => MODELS.bed_double(g, rnd, { ...opt, w: 1.0 }),
    sofa: (g, rnd, opt) => {
      const c = opt?.color ?? [0x5a4a3a, 0x3a4a5a, 0x6a3a3a, 0x4a5a4a, 0x7a6a5a][Math.floor(rnd() * 5)];
      const dark = M(new THREE.Color(c).multiplyScalar(0.8).getHex());
      B(g, 2.0, 0.42, 0.9, dark, 0, 0.05, 0);
      for (const x of [-0.6, 0, 0.6]) B(g, 0.58, 0.14, 0.62, c, x, 0.47, 0.1);
      B(g, 1.84, 0.5, 0.2, c, 0, 0.45, -0.34);
      for (const x of [-0.93, 0.93]) B(g, 0.16, 0.62, 0.9, dark, x, 0.05, 0);
      legs(g, 1.9, 0.8, 0.05, 0.05, 0x222222);
    },
    armchair: (g, rnd) => {
      const c = [0x6a4a3a, 0x3a4a5a, 0x5a5a3a][Math.floor(rnd() * 3)];
      B(g, 0.9, 0.42, 0.85, c, 0, 0.05, 0); B(g, 0.6, 0.14, 0.6, c, 0, 0.47, 0.08);
      B(g, 0.9, 0.5, 0.18, c, 0, 0.45, -0.33); for (const x of [-0.38, 0.38]) B(g, 0.14, 0.3, 0.85, c, x, 0.45, 0);
    },
    coffee_table: (g, rnd) => {
      B(g, 1.1, 0.04, 0.6, 0x6a4a2a, 0, 0.4, 0); legs(g, 1.1, 0.6, 0.4, 0.05, 0x5a3a20);
      B(g, 1.0, 0.02, 0.5, 0x5a3a20, 0, 0.12, 0);
      if (rnd() < 0.6) B(g, 0.22, 0.01, 0.3, BOOKS[Math.floor(rnd() * BOOKS.length)], 0.2, 0.44, 0);
      if (rnd() < 0.5) cyl(g, 0.04, 0.1, 0xffffff, -0.3, 0.44, 0.1, 8);
    },
    tv_stand: (g) => {
      cabinet(g, 1.5, 0.5, 0.45, 0x3a3a3a, { doors: 3, front: 0x444444 });
      B(g, 1.2, 0.68, 0.06, 0x111111, 0, 0.58, -0.08);
      B(g, 1.14, 0.62, 0.01, M(0x0c1014, 0.15, 0.2), 0, 0.61, -0.045);
      B(g, 0.3, 0.06, 0.2, 0x111111, 0, 0.5, -0.08);
    },
    bookshelf: (g, rnd) => {
      for (const sx of [-1, 1]) B(g, 0.04, 1.9, 0.35, 0x6a4a2a, sx * 0.48, 0, 0);
      B(g, 1.0, 1.9, 0.02, 0x5a3a20, 0, 0, -0.165);
      for (let i = 0; i < 5; i++) {
        const y = 0.04 + i * 0.37;
        B(g, 0.92, 0.03, 0.33, 0x6a4a2a, 0, y, 0);
        if (i === 4) continue;
        let x = -0.44;
        while (x < 0.38) {
          const n = 3 + Math.floor(rnd() * 5), bw = n * 0.035;
          if (rnd() < 0.85) B(g, bw, 0.2 + rnd() * 0.08, 0.24, BOOKS[Math.floor(rnd() * BOOKS.length)], x + bw / 2, y + 0.03, 0.02);
          x += bw + 0.02;
        }
      }
    },
    dining_table: (g) => { B(g, 1.5, 0.05, 0.9, 0x7a5a3a, 0, 0.72, 0); legs(g, 1.5, 0.9, 0.72, 0.07, 0x6a4a2a); },
    chair: (g) => { B(g, 0.45, 0.05, 0.45, 0x7a5a3a, 0, 0.44, 0); legs(g, 0.45, 0.45, 0.44, 0.04, 0x6a4a2a, 0.01); B(g, 0.45, 0.5, 0.04, 0x7a5a3a, 0, 0.48, -0.2); },
    stove: (g) => {
      B(g, 0.6, 0.88, 0.6, 0xe8e8e4, 0, 0, 0); B(g, 0.6, 0.04, 0.6, 0x1a1a1a, 0, 0.88, 0);
      for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) cyl(g, 0.09, 0.015, 0x333333, x, 0.92, z, 12);
      B(g, 0.5, 0.42, 0.02, M(0x1a1a1a, 0.2, 0.3), 0, 0.2, 0.3); B(g, 0.4, 0.025, 0.03, 0xb0b0b0, 0, 0.66, 0.32);
      for (let i = 0; i < 4; i++) cyl(g, 0.02, 0.03, 0x222222, -0.21 + i * 0.14, 0.76, 0.31, 8).rotation.x = Math.PI / 2;
      B(g, 0.6, 0.12, 0.45, 0xb0b0b0, 0, 1.75, -0.08); // hood
    },
    sink_counter: (g, rnd, opt) => {
      cabinet(g, 1.0, 0.88, 0.6, opt?.body ?? 0xe8e4dc, { doors: 2, front: opt?.front ?? 0xd8d2c4, handle: 0x777777 });
      B(g, 1.02, 0.04, 0.62, opt?.top ?? 0x3a3a38, 0, 0.88, 0);
      B(g, 0.55, 0.02, 0.38, M(0x9a9a9a, 0.2, 0.7), 0, 0.905, 0.02);
      B(g, 0.03, 0.25, 0.03, M(0xb8b8b8, 0.2, 0.8), 0, 0.92, -0.22); B(g, 0.03, 0.03, 0.15, M(0xb8b8b8, 0.2, 0.8), 0, 1.14, -0.16);
      B(g, 1.0, 0.7, 0.35, opt?.body ?? 0xe8e4dc, 0, 1.45, -0.125); B(g, 0.96, 0.66, 0.02, opt?.front ?? 0xd8d2c4, 0, 1.47, 0.06);
    },
    counter: (g, rnd, opt) => { cabinet(g, 1.2, 0.88, 0.6, opt?.body ?? 0xe8e4dc, { doors: 2, front: opt?.front ?? 0xd8d2c4 }); B(g, 1.22, 0.04, 0.62, opt?.top ?? 0x3a3a38, 0, 0.88, 0); },
    toilet: (g) => {
      B(g, 0.38, 0.38, 0.45, 0xf4f4f0, 0, 0, 0.08); B(g, 0.4, 0.05, 0.47, 0xe8e8e4, 0, 0.38, 0.08);
      B(g, 0.42, 0.4, 0.18, 0xf4f4f0, 0, 0.4, -0.24); B(g, 0.44, 0.03, 0.2, 0xe8e8e4, 0, 0.8, -0.24);
    },
    bathtub: (g) => {
      B(g, 0.75, 0.08, 1.7, 0xf4f4f0, 0, 0, 0);
      for (const x of [-0.33, 0.33]) B(g, 0.09, 0.55, 1.7, 0xf4f4f0, x, 0, 0);
      for (const z of [-0.8, 0.8]) B(g, 0.75, 0.55, 0.1, 0xf4f4f0, 0, 0, z);
      B(g, 0.57, 0.02, 1.5, 0xc8d4d8, 0, 0.08, 0);
      B(g, 0.04, 0.2, 0.04, M(0xb8b8b8, 0.2, 0.8), 0, 0.55, -0.82);
    },
    bath_sink: (g) => {
      cyl(g, 0.09, 0.78, 0xf4f4f0, 0, 0, 0);
      B(g, 0.6, 0.14, 0.45, 0xf4f4f0, 0, 0.76, 0); B(g, 0.44, 0.02, 0.3, 0xc8d4d8, 0, 0.885, 0.03);
      B(g, 0.03, 0.18, 0.03, M(0xb8b8b8, 0.2, 0.8), 0, 0.9, -0.17);
    },
    washer: (g) => { B(g, 0.6, 0.88, 0.6, 0xf0f0ec, 0, 0, 0); cyl(g, 0.2, 0.02, M(0x8a9aa8, 0.1, 0.4), 0, 0.42, 0.3, 16).rotation.x = Math.PI / 2; B(g, 0.5, 0.08, 0.02, 0xcccccc, 0, 0.76, 0.3); },
    plant: (g, rnd) => {
      cyl(g, 0.16, 0.32, 0x8a4a2a, 0, 0, 0, 8);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + rnd(); B(g, 0.12, 0.5 + rnd() * 0.3, 0.06, 0x3a6a2a, Math.sin(a) * 0.09, 0.3, Math.cos(a) * 0.09).rotation.set(Math.cos(a) * 0.4, a, Math.sin(a) * 0.4); }
    },
    floor_lamp: (g) => { cyl(g, 0.15, 0.03, 0x333333, 0, 0, 0); cyl(g, 0.015, 1.4, 0x555555, 0, 0, 0, 6); cyl(g, 0.17, 0.25, M(0xf0e0b0, 0.9, 0, 0x332a10), 0, 1.35, 0); },
    rug: (g, rnd, opt) => {
      const c = [0x7a2a2a, 0x2a3a5a, 0x5a4a2a, 0x4a5a4a, 0x6a5a7a][Math.floor(rnd() * 5)];
      const w = opt?.w ?? 2.0, d = opt?.d ?? 1.4;
      B(g, w, 0.012, d, c, 0, 0.06, 0); B(g, w - 0.3, 0.013, d - 0.3, M(new THREE.Color(c).multiplyScalar(1.3).getHex()), 0, 0.061, 0);
    },
    checkout: (g, rnd) => {
      B(g, 1.8, 0.95, 0.7, 0xb8b0a0, 0, 0, 0); B(g, 1.84, 0.04, 0.74, 0x3a3a3a, 0, 0.95, 0);
      B(g, 0.9, 0.02, 0.5, 0x222222, -0.4, 0.99, 0); // belt
      for (let i = 0; i < 3; i++) if (rnd() < 0.7) B(g, 0.1, 0.12, 0.1, GOODS[Math.floor(rnd() * GOODS.length)], -0.7 + i * 0.25, 1.0, 0);
    },
    reception: (g) => {
      B(g, 2.2, 1.05, 0.12, 0xd8d8d0, 0, 0, 0.3); B(g, 2.3, 0.04, 0.3, 0x7a5a3a, 0, 1.05, 0.28);
      B(g, 2.2, 0.04, 0.6, 0xc8c8c0, 0, 0.72, -0.05); for (const x of [-1.05, 1.05]) B(g, 0.1, 0.72, 0.6, 0xc8c8c0, x, 0, -0.05);
      B(g, 0.5, 0.32, 0.04, 0x111111, 0.4, 0.76, -0.2); B(g, 0.46, 0.46, 0.46, 0x2a2a2e, 0.3, 0, -0.65);
    },
    waiting_chairs: (g) => {
      B(g, 2.0, 0.05, 0.08, 0x555555, 0, 0.38, 0); for (const x of [-0.9, 0.9]) B(g, 0.06, 0.38, 0.4, 0x555555, x, 0, 0);
      for (let i = 0; i < 4; i++) { B(g, 0.44, 0.05, 0.44, 0x2a5a8a, -0.72 + i * 0.48, 0.42, 0.02); B(g, 0.44, 0.45, 0.04, 0x2a5a8a, -0.72 + i * 0.48, 0.47, -0.2); }
    },
    exam_bed: (g) => {
      B(g, 0.8, 0.12, 1.9, 0x3a5a6a, 0, 0.6, 0); B(g, 0.7, 0.6, 1.7, 0xd8d8d0, 0, 0, 0);
      B(g, 0.62, 0.02, 1.6, 0xf0f0ea, 0, 0.72, 0.05); B(g, 0.8, 0.12, 0.5, 0x3a5a6a, 0, 0.75, -0.75, -0.4);
    },
    pallet: (g, rnd) => {
      for (const z of [-0.45, 0, 0.45]) B(g, 1.2, 0.1, 0.1, 0x9a7a4a, 0, 0, z);
      for (let i = 0; i < 6; i++) B(g, 0.15, 0.03, 1.0, 0xa8884e, -0.5 + i * 0.2, 0.1, 0);
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) B(g, 0.55, 0.3, 0.45, 0xb89a68, -0.29 + j * 0.58, 0.13 + i * 0.3, 0);
    },
    cell_bars: (g) => {
      B(g, 3.0, 0.08, 0.1, 0x555a60, 0, 2.5, 0); B(g, 3.0, 0.08, 0.1, 0x555a60, 0, 0.05, 0);
      for (let i = 0; i < 20; i++) if (i < 12 || i > 15) cyl(g, 0.018, 2.5, M(0x555a60, 0.4, 0.7), -1.45 + i * 0.152, 0.05, 0, 6);
    },
    meeting_table: (g) => {
      B(g, 2.6, 0.05, 1.2, 0x4a3a2a, 0, 0.72, 0); for (const x of [-0.9, 0.9]) B(g, 0.2, 0.72, 0.6, 0x3a2a1e, x, 0, 0);
      for (const sz of [-1, 1]) for (const x of [-0.8, 0, 0.8]) { B(g, 0.46, 0.46, 0.46, 0x2a2a2e, x, 0, sz * 0.85); B(g, 0.46, 0.5, 0.06, 0x2a2a2e, x, 0.46, sz * 1.06); }
    },
    vending: (g, rnd) => {
      B(g, 0.9, 1.9, 0.8, 0x2a4a8a, 0, 0, 0);
      B(g, 0.6, 1.3, 0.02, M(0x9ab8c8, 0.1, 0.3), -0.1, 0.45, 0.4);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) if (rnd() < 0.8) B(g, 0.1, 0.15, 0.08, GOODS[(i * 4 + j) % GOODS.length], -0.32 + j * 0.15, 0.55 + i * 0.25, 0.3);
      B(g, 0.18, 0.5, 0.02, 0x1a1a1a, 0.32, 0.9, 0.41); B(g, 0.6, 0.15, 0.02, 0x1a1a1a, -0.1, 0.18, 0.41);
    },
    store_shelf: (g, rnd) => shelving(g, 1.6, 1.5, 0.5, 0xb8b0a0, rnd, GOODS),
    pharma_shelf: (g, rnd) => shelving(g, 1.6, 1.6, 0.45, 0xe8ece8, rnd, [0xffffff, 0xe8f0ff, 0x3a8a5a, 0xd84a3a, 0x5a9ad8, 0xe8a030]),
    tool_rack: (g, rnd) => shelving(g, 1.6, 1.8, 0.5, 0x8a6a3a, rnd, [0xaa3322, 0x9a9aa0, 0x3a5a8a, 0xd8a030, 0x555555]),
    rack: (g, rnd) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(g, 0.08, 2.4, 0.08, 0x2a5aa0, sx * 1.16, 0, sz * 0.46);
      for (const y of [0.15, 1.15, 2.1]) {
        for (const sz of [-1, 1]) B(g, 2.4, 0.1, 0.06, 0xd86a1a, 0, y, sz * 0.47);
        B(g, 2.3, 0.03, 0.9, 0x8a8a84, 0, y + 0.08, 0);
        let x = -1.05;
        while (x < 1.0) { const bw = 0.35 + rnd() * 0.3; if (rnd() < 0.8 && x + bw < 1.12) B(g, bw, 0.25 + rnd() * 0.45, 0.6 + rnd() * 0.25, [0xb89a68, 0xa88a58, 0xc8aa78][Math.floor(rnd() * 3)], x + bw / 2, y + 0.11, 0); x += bw + 0.04; }
      }
    },
    bench: (g) => { B(g, 1.6, 0.06, 0.42, 0x6a4a2a, 0, 0.42, 0); for (const x of [-0.7, 0.7]) B(g, 0.06, 0.42, 0.38, 0x333333, x, 0, 0); },
    lockers: (g) => { for (let i = 0; i < 4; i++) { B(g, 0.44, 1.9, 0.5, 0x5a6a7a, -0.66 + i * 0.44, 0, 0); B(g, 0.38, 1.8, 0.02, 0x6a7a8a, -0.66 + i * 0.44, 0.05, 0.25); for (let j = 0; j < 4; j++) B(g, 0.2, 0.012, 0.01, 0x3a4a5a, -0.66 + i * 0.44, 1.5 + j * 0.05, 0.262); } },
    water_cooler: (g) => { B(g, 0.32, 0.95, 0.32, 0xe8e8e4, 0, 0, 0); cyl(g, 0.14, 0.38, M(0x8ab8d8, 0.1, 0.1), 0, 0.95, 0); },
    freezer: (g, rnd) => {
      B(g, 1.6, 0.8, 0.8, 0xe8e8e4, 0, 0, 0); B(g, 1.5, 0.02, 0.7, M(0x9ab8c8, 0.1, 0.3), 0, 0.81, 0);
      for (let i = 0; i < 6; i++) if (rnd() < 0.8) B(g, 0.22, 0.08, 0.3, GOODS[i % GOODS.length], -0.6 + i * 0.24, 0.72, -0.1 + rnd() * 0.2);
    },
    hospital_bed: (g) => {
      B(g, 0.95, 0.14, 2.0, 0xc8d0d0, 0, 0.42, 0); legs(g, 0.95, 2.0, 0.42, 0.05, M(0x9aa0a0, 0.3, 0.7));
      B(g, 0.9, 0.12, 1.9, 0xf0f0ea, 0, 0.56, 0); B(g, 0.92, 0.04, 1.3, 0x9ab8c8, 0, 0.68, 0.3);
      B(g, 0.5, 0.1, 0.3, 0xffffff, 0, 0.68, -0.75); B(g, 0.95, 0.5, 0.04, 0xc8d0d0, 0, 0.42, -1.0);
      for (const x of [-0.47, 0.47]) B(g, 0.03, 0.22, 1.0, M(0x9aa0a0, 0.3, 0.7), x, 0.6, 0.1);
    },
    curtain: (g) => { B(g, 0.03, 0.03, 1.9, 0x888888, 0, 2.2, 0); B(g, 0.02, 1.7, 1.9, 0x8ab0c0, 0, 0.35, 0); },
    whiteboard: (g) => { B(g, 1.6, 1.0, 0.03, 0xf4f4f0, 0, 1.0, 0); B(g, 1.64, 0.04, 0.06, 0xaaaaaa, 0, 0.98, 0.02); },
    parts_shelf: (g, rnd) => shelving(g, 1.6, 1.9, 0.55, 0x3a4a6a, rnd, [0x2a2a2a, 0x334455, 0xd8d8c0, 0x6a6a70, 0xc8c8c8, 0xa83a2a]),
    toolbench: (g, rnd) => {
      B(g, 1.8, 0.06, 0.7, 0x6a5a3a, 0, 0.88, 0); legs(g, 1.8, 0.7, 0.88, 0.07, 0x3a3a3a);
      B(g, 1.7, 0.03, 0.6, 0x5a4a2a, 0, 0.25, 0);
      B(g, 1.8, 0.9, 0.04, 0x9a8a6a, 0, 0.94, -0.33); // pegboard
      for (let i = 0; i < 6; i++) B(g, 0.04, 0.2 + rnd() * 0.15, 0.03, [0x8a8a90, 0xc83a2a, 0x3a5a8a][i % 3], -0.7 + i * 0.28, 1.25, -0.3);
      B(g, 0.25, 0.15, 0.2, 0x3a5a8a, 0.55, 0.94, 0.05); B(g, 0.12, 0.1, 0.35, 0x555555, -0.6, 0.94, 0);
    },
    tire_rack: (g) => {
      for (const sx of [-1, 1]) B(g, 0.05, 1.2, 0.6, 0x555555, sx * 0.68, 0, 0);
      for (let i = 0; i < 4; i++) { const t = cyl(g, 0.3, 0.2, 0x1e1e1e, -0.45 + i * 0.3, 0.3, 0, 14); t.rotation.z = Math.PI / 2; t.position.y = 0.32; }
      for (let i = 0; i < 4; i++) { const t = cyl(g, 0.3, 0.2, 0x1e1e1e, -0.45 + i * 0.3, 0.3, 0, 14); t.rotation.z = Math.PI / 2; t.position.y = 0.9; }
      B(g, 1.4, 0.04, 0.6, 0x555555, 0, 0.6, 0);
    },
    car_lift: (g) => {
      for (const sx of [-1, 1]) {
        B(g, 0.24, 2.4, 0.24, 0x2a5aa0, sx * 1.45, 0, 0);
        B(g, 0.1, 0.08, 1.8, 0xd8a020, sx * 1.1, 0.12, 0);
      }
      B(g, 3.1, 0.1, 0.2, 0x2a5aa0, 0, 2.4, 0);
    },
    drum: (g) => { cyl(g, 0.3, 0.88, [0x2a4a8a, 0xa82a1a, 0x3a5a2a][Math.floor(Math.random() * 3)], 0, 0, 0, 12); },
    compressor: (g) => { cyl(g, 0.2, 0.7, 0xc83a2a, 0, 0.1, 0, 12).rotation.z = Math.PI / 2; B(g, 0.8, 0.12, 0.45, 0x333333, 0, 0, 0); B(g, 0.3, 0.25, 0.25, 0x222222, 0.1, 0.5, 0); },
    // --- farm ---
    farm_shelf: (g, rnd) => shelving(g, 1.6, 1.8, 0.55, 0x6a5a3a, rnd, [0x6a5a3a, 0x3a7a5a, 0xc8a850, 0xd88a3a, 0x7aaa4a, 0x8a8a90]),
    seed_rack: (g, rnd) => {
      B(g, 1.0, 1.4, 0.06, 0x8a6a3a, 0, 0, -0.17);
      for (const sx of [-1, 1]) B(g, 0.04, 1.4, 0.4, 0x6a4a2a, sx * 0.48, 0, 0);
      for (let r = 0; r < 4; r++) {
        B(g, 0.92, 0.03, 0.34, 0x6a4a2a, 0, 0.2 + r * 0.32, 0);
        for (let i = 0; i < 6; i++) B(g, 0.11, 0.16, 0.02, [0xd88a3a, 0xc83a2a, 0x7aaa4a, 0xe8c840, 0xa88a5a][Math.floor(rnd() * 5)], -0.38 + i * 0.15, 0.23 + r * 0.32, 0.05, -0.25);
      }
    },
    produce_crate: (g, rnd) => {
      B(g, 0.8, 0.05, 0.6, 0x9a7a4a, 0, 0, 0);
      for (const sz of [-1, 1]) for (let i = 0; i < 3; i++) B(g, 0.8, 0.1, 0.03, 0x9a7a4a, 0, 0.06 + i * 0.15, sz * 0.285);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) B(g, 0.03, 0.1, 0.6, 0x9a7a4a, sx * 0.385, 0.06 + i * 0.15, 0);
      const c = [0xb8986a, 0xe8822a, 0xc8302a, 0x8ac85a][Math.floor(rnd() * 4)];
      for (let i = 0; i < 12; i++) B(g, 0.12, 0.1, 0.12, c, -0.28 + (i % 4) * 0.18 + rnd() * 0.03, 0.3 + rnd() * 0.08, -0.17 + Math.floor(i / 4) * 0.17);
    },
    chicken_coop: (g) => {
      B(g, 1.4, 0.75, 1.0, 0x8a5a3a, 0, 0.3, 0); legs(g, 1.4, 1.0, 0.3, 0.08, 0x5a3a22);
      const r1 = B(g, 1.55, 0.04, 0.62, 0x5a4a3a, 0, 1.12, -0.22); r1.rotation.x = -0.5;
      const r2 = B(g, 1.55, 0.04, 0.62, 0x5a4a3a, 0, 1.12, 0.22); r2.rotation.x = 0.5;
      B(g, 0.3, 0.3, 0.02, 0x1e140c, 0.35, 0.42, 0.51); B(g, 0.1, 0.5, 0.3, 0x7a5a3a, 0.35, 0, 0.62, 0.6);
    },
    pantry: (g, rnd) => shelving(g, 1.0, 1.8, 0.4, 0x7a5a3a, rnd, [0xa83a5a, 0xe0a020, 0xd8c8a0, 0x7a3a5a, 0xc8a050], 5),
    hay: (g, rnd) => { for (let i = 0; i < 3; i++) B(g, 1.3 - i * 0.3, 0.25, 0.9 - i * 0.2, i % 2 ? 0xb89848 : 0xc8a850, (rnd() - 0.5) * 0.1, i * 0.22, 0); },
    hunting: (g) => { cabinet(g, 0.7, 1.8, 0.5, 0x4a5a3a, { doors: 1, handle: 0x222222 }); },
    hay_stack: (g, rnd) => {
      // Square bales stacked two high
      for (let y = 0; y < 2; y++) for (let i = 0; i < 2; i++) for (let j = 0; j < (y ? 1 : 2); j++) {
        const b = B(g, 1.1, 0.55, 0.55, (i + j + y) % 2 ? 0xc8a850 : 0xb89a4a, -0.6 + i * 1.2 + (rnd() - 0.5) * 0.08, y * 0.6, -0.3 + j * 0.6 + (y ? 0.3 : 0));
        B(g, 1.12, 0.02, 0.02, 0x6a5a3a, b.position.x, b.position.y + 0.08, b.position.z + 0.28);
      }
    },
    stall: (g) => {
      for (let i = 0; i < 4; i++) B(g, 3.0, 0.14, 0.06, 0x6a4a2a, 0, 0.1 + i * 0.32, 0);
      for (const x of [-1.45, 0, 1.45]) B(g, 0.1, 1.4, 0.1, 0x4a3a22, x, 0, 0);
    },
    trough: (g) => {
      B(g, 2.0, 0.08, 0.6, 0x7a7a7a, 0, 0.1, 0); for (const sz of [-1, 1]) B(g, 2.0, 0.5, 0.05, 0x7a7a7a, 0, 0.1, sz * 0.28);
      for (const sx of [-1, 1]) B(g, 0.05, 0.5, 0.6, 0x7a7a7a, sx * 0.98, 0.1, 0);
      B(g, 1.9, 0.02, 0.5, M(0x3a5a6a, 0.1, 0.2), 0, 0.45, 0); legs(g, 2.0, 0.6, 0.1, 0.08, 0x5a5a5a);
    },
    plow: (g) => {
      B(g, 1.7, 0.1, 0.12, 0x8a2a1a, 0, 0.5, -0.5); B(g, 0.12, 0.1, 1.3, 0x8a2a1a, 0, 0.5, 0.05);
      for (let i = 0; i < 3; i++) { const s = B(g, 0.06, 0.45, 0.35, 0x5a5a5a, -0.6 + i * 0.6, 0.05, -0.45 + i * 0.25); s.rotation.y = 0.5; }
    },
    tractor: (g) => {
      const red = 0xa82a1a, tire = 0x1a1a1a;
      B(g, 0.9, 0.7, 1.6, red, 0, 0.75, 0.75); B(g, 0.95, 0.12, 1.7, 0x2a2a2a, 0, 0.62, 0.7); // hood + chassis
      B(g, 0.08, 0.6, 0.08, 0x333333, 0.25, 1.45, 1.2); // exhaust stack
      B(g, 1.2, 0.6, 1.1, red, 0, 0.7, -0.8); // body under the seat
      B(g, 0.5, 0.1, 0.45, 0x222222, 0, 1.35, -0.8); B(g, 0.5, 0.45, 0.08, 0x222222, 0, 1.4, -1.05); // seat
      for (const sx of [-1, 1]) for (const z of [-1.05, -0.45]) B(g, 0.05, 1.0, 0.05, 0x333333, sx * 0.6, 1.3, z);
      B(g, 1.3, 0.05, 0.8, red, 0, 2.28, -0.75); // canopy
      for (const sx of [-1, 1]) {
        const w1 = cyl(g, 0.72, 0.42, tire, sx * 0.82, 0, -0.85, 14); w1.rotation.z = Math.PI / 2; w1.position.y = 0.72;
        const h1 = cyl(g, 0.4, 0.44, 0xd8a020, sx * 0.82, 0, -0.85, 10); h1.rotation.z = Math.PI / 2; h1.position.y = 0.72;
        const w2 = cyl(g, 0.42, 0.28, tire, sx * 0.62, 0, 1.15, 12); w2.rotation.z = Math.PI / 2; w2.position.y = 0.42;
      }
    },
    forklift: (g) => {
      B(g, 1.1, 0.8, 1.6, 0xd8a020, 0, 0.25, -0.2); B(g, 1.1, 0.06, 1.3, 0x222222, 0, 2.1, -0.35);
      for (const x of [-0.5, 0.5]) for (const z of [-0.95, 0.25]) B(g, 0.06, 1.85, 0.06, 0x222222, x, 0.25, z);
      for (const x of [-0.55, 0.55]) for (const z of [-0.7, 0.4]) { const w = cyl(g, 0.25, 0.2, 0x111111, x, 0, z); w.rotation.z = Math.PI / 2; w.position.y = 0.25; }
      for (const x of [-0.35, 0.35]) B(g, 0.12, 0.05, 1.0, 0x333333, x, 0.08, 1.1); B(g, 1.0, 1.9, 0.08, 0x333333, 0, 0.1, 0.62);
    },
  };

  // Build a model and place it; rot is in quarter turns' worth of radians.
  function model(type, x, z, rot = 0, opt, rnd = Math.random, y = 0) {
    const g = new THREE.Group();
    (MODELS[type] || ((gg) => B(gg, 0.5, 0.5, 0.5, 0x777777, 0, 0, 0)))(g, rnd, opt);
    g.position.set(x, y, z);
    g.rotation.y = rot;
    group.add(g);
    return g;
  }

  return { model, has: (t) => !!MODELS[t], M };
}

// Axis-aligned footprint of a w×d rectangle rotated by rot (multiples of 90°).
export function footRect(x, z, w, d, rot) {
  const swap = Math.abs(Math.sin(rot)) > 0.5;
  const hw = (swap ? d : w) / 2, hd = (swap ? w : d) / 2;
  return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
}
