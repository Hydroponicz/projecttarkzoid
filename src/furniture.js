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
  // Convenience store / supermarket fittings (stock packed on them)
  gondola: [2.4, 1.1, 1.7], wallshelf: [2.0, 0.5, 2.0], cooler: [1.7, 0.75, 2.1], icecream: [1.5, 0.8, 0.9],
  kassa: [2.0, 0.75, 1.05], cig_wall: [1.8, 0.35, 2.0], promo: [0.8, 0.5, 1.6], baskets: [0.45, 0.35, 0.6], bread_rack: [1.4, 0.55, 1.7],
  ceiling_led: [0, 0, 0], wall_band: [0, 0, 0], stenka: [2.6, 0.5, 2.1], wall_carpet: [0, 0, 0], crt_tv: [0.7, 0.5, 1.0],
  gas_stove: [0.55, 0.6, 0.9], fridge_old: [0.6, 0.6, 1.5], kitchen_table: [1.0, 0.7, 0.75], tabouret: [0.35, 0.35, 0.45],
  // Factory floor, boiler house, yards and streets
  lathe: [2.4, 0.9, 1.4], press: [1.6, 1.4, 2.6], conveyor: [4.0, 0.9, 1.0], machine: [1.6, 1.2, 1.8], boiler: [2.2, 1.8, 2.6],
  lavochka: [1.8, 0.6, 0.9], swing: [2.6, 1.6, 2.2], slide: [3.0, 0.8, 1.8], climber: [2.2, 2.2, 1.6], sandbox: [2.0, 2.0, 0.3],
  laundry_poles: [4.0, 0.2, 2.0], bus_stop: [3.6, 1.6, 2.6], street_lamp: [0.3, 0.3, 6.5], kiosk_booth: [2.6, 2.0, 2.6],
  greenhouse: [3.0, 2.0, 2.0], well: [1.0, 1.0, 1.6],
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
  // ---------- packed stock ----------
  // Many small products as one vertex-coloured mesh: a shelf's worth of
  // stock is one object (it merges into the town's batches as it is).
  const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 6).toNonIndexed();
  const stockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const _c = new THREE.Color();
  // items: [shape ('b' box | 'c' cylinder), w, h, d, x, y0, z, colour]
  const packed = (g, items) => {
    if (!items.length) return;
    let n = 0;
    for (const it of items) n += (it[0] === 'c' ? unitCyl : unitBox).attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    for (const [shape, w, h, d, x, y0, z, c] of items) {
      const t = shape === 'c' ? unitCyl : unitBox, tp = t.attributes.position.array, tn = t.attributes.normal.array, tu = t.attributes.uv.array;
      _c.set(c);
      for (let i = 0; i < t.attributes.position.count; i++) {
        pos[(o + i) * 3] = tp[i * 3] * w + x; pos[(o + i) * 3 + 1] = tp[i * 3 + 1] * h + y0 + h / 2; pos[(o + i) * 3 + 2] = tp[i * 3 + 2] * d + z;
        nor[(o + i) * 3] = tn[i * 3]; nor[(o + i) * 3 + 1] = tn[i * 3 + 1]; nor[(o + i) * 3 + 2] = tn[i * 3 + 2];
        uv[(o + i) * 2] = tu[i * 2]; uv[(o + i) * 2 + 1] = tu[i * 2 + 1];
        // tops a touch lighter, so rows read as rows
        const k = tn[i * 3 + 1] > 0.5 ? 1.12 : 1;
        col[(o + i) * 3] = Math.min(1, _c.r * k); col[(o + i) * 3 + 1] = Math.min(1, _c.g * k); col[(o + i) * 3 + 2] = Math.min(1, _c.b * k);
      }
      o += t.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, stockMat);
    m.castShadow = false; m.receiveShadow = true;
    m.userData.stock = true; // (small stuff: drawn from closer in than the furniture)
    g.add(m);
    return m;
  };
  // What's on the shelves: product families, each a shape with its own
  // packaging colours, stocked in facings (the same thing side by side)
  const PACKS = {
    chips: { s: 'b', w: [0.15, 0.2], h: [0.24, 0.3], d: 0.07, cols: [0xd8302a, 0xf0b020, 0x2a7ad8, 0x30a050, 0xe86a20, 0x8a3ad0], label: 0xf8f0d0 },
    noodles: { s: 'c', w: [0.1, 0.11], h: [0.1, 0.12], d: 1, cols: [0xd8302a, 0xe8a020, 0x202020, 0xf0f0e8], label: 0xffffff },
    bottles: { s: 'c', w: [0.07, 0.08], h: [0.26, 0.32], d: 1, cols: [0x2a8a3a, 0xd83a2a, 0xe8c040, 0x8ac8e8, 0x6a3a2a, 0xe87a20], label: 0xf0f0f0 },
    cans: { s: 'c', w: [0.065, 0.065], h: [0.12, 0.12], d: 1, cols: [0xd02020, 0x2050c8, 0x20a050, 0xe8d020, 0x202020, 0xc0c0c8], label: 0xffffff },
    cereal: { s: 'b', w: [0.19, 0.22], h: [0.28, 0.32], d: 0.07, cols: [0xe8c030, 0x3a8ad8, 0xd84a2a, 0x50a840, 0xa83a8a], label: 0xffffff },
    juice: { s: 'b', w: [0.07, 0.08], h: [0.2, 0.22], d: 0.07, cols: [0xf0a020, 0xe84a3a, 0x40b040, 0xf0e070], label: 0xffffff },
    candy: { s: 'b', w: [0.08, 0.12], h: [0.1, 0.16], d: 0.04, cols: [0xe83a8a, 0xf0c020, 0x8a4ad8, 0x2ab0d8, 0xe85a2a], label: 0xffffff },
    jars: { s: 'c', w: [0.08, 0.09], h: [0.12, 0.15], d: 1, cols: [0xa82a2a, 0xd8a040, 0x6a8a3a, 0x8a3a5a], label: 0xe8e0c8 },
    pasta: { s: 'b', w: [0.12, 0.14], h: [0.2, 0.24], d: 0.06, cols: [0x2a4aa8, 0xe8c050, 0xd83a2a, 0x2a8a4a], label: 0xf0e8c8 },
    pills: { s: 'b', w: [0.06, 0.1], h: [0.08, 0.14], d: 0.04, cols: [0xffffff, 0xe8f0ff, 0x3a8a5a, 0xd84a3a, 0x5a9ad8, 0xe8a030], label: 0xd84a3a },
    tools: { s: 'b', w: [0.1, 0.2], h: [0.12, 0.25], d: 0.1, cols: [0xaa3322, 0x9a9aa0, 0x3a5a8a, 0xd8a030, 0x555555], label: 0x222222 },
  };
  const THEMES = {
    grocery: ['chips', 'noodles', 'bottles', 'cans', 'cereal', 'juice', 'candy', 'jars', 'pasta'],
    drinks: ['bottles', 'cans', 'juice'],
    pharmacy: ['pills'],
    tools: ['tools'],
  };
  // One shelf level: facings of products from x0 to x1, standing at y on a
  // shelf `depth` deep, fronts at z = front (facing +z)
  const stockLevel = (items, rnd, x0, x1, y, front, depth, maxH, theme) => {
    const fams = THEMES[theme] || THEMES.grocery;
    let x = x0;
    let fam = PACKS[fams[Math.floor(rnd() * fams.length)]];
    while (x < x1 - 0.06) {
      if (rnd() < 0.3) fam = PACKS[fams[Math.floor(rnd() * fams.length)]];
      const w = fam.w[0] + rnd() * (fam.w[1] - fam.w[0]), h = Math.min(maxH, fam.h[0] + rnd() * (fam.h[1] - fam.h[0]));
      const col = fam.cols[Math.floor(rnd() * fam.cols.length)], n = 2 + Math.floor(rnd() * 4);
      const dd = fam.s === 'c' ? w : fam.d;
      for (let i = 0; i < n && x + w < x1; i++) {
        if (rnd() < 0.08) { x += w + 0.01; continue; } // sold out
        // the front one with a label band; the rest of the row behind it is
        // one block (you only ever see the front of a shelf)
        items.push([fam.s, w, h, dd, x + w / 2, y, front - dd / 2, col]);
        if (fam.s === 'b') items.push(['b', w * 0.86, h * 0.3, 0.005, x + w / 2, y + h * 0.35, front + 0.003, fam.label]);
        const back = Math.min(depth, 3 * (dd + 0.015)) - dd - 0.015;
        if (back > 0.03) items.push(['b', w * 0.92, h * 0.94, back, x + w / 2, y, front - dd - 0.015 - back / 2, col]);
        x += w + 0.008;
      }
      x += 0.02;
    }
  };
  // Shelving with stock: uprights, shelves with price strips, products
  const stockedShelves = (g, rnd, w, h, d, levels, frame, theme, twoSided = false) => {
    const items = [];
    for (const sx of [-1, 1]) B(g, 0.04, h, d, frame, sx * (w / 2 - 0.02), 0, 0);
    B(g, w - 0.08, 0.1, d, 0x3a3a3a, 0, 0, 0); // kick plate
    if (twoSided) B(g, w - 0.08, h - 0.1, 0.03, frame, 0, 0.1, 0); else B(g, w - 0.08, h - 0.1, 0.02, frame, 0, 0.1, -d / 2 + 0.01);
    const sides = twoSided ? [1, -1] : [1];
    for (let i = 0; i < levels; i++) {
      const y = 0.1 + i * ((h - 0.2) / levels);
      const gap = (h - 0.2) / levels - 0.06;
      B(g, w - 0.08, 0.025, d, frame, 0, y, 0);
      for (const side of sides) {
        // the price-tag strip on the shelf edge, a few tags on it
        B(g, w - 0.08, 0.035, 0.01, 0xf4f4f0, 0, y - 0.01, side * (d / 2 + 0.005));
        for (let k = 0; k < 4; k++) if (rnd() < 0.6) B(g, 0.06, 0.03, 0.006, rnd() < 0.4 ? 0xf0d020 : 0xe83a2a, -w / 2 + 0.2 + rnd() * (w - 0.4), y - 0.008, side * (d / 2 + 0.012));
        const sub = [];
        stockLevel(sub, rnd, -w / 2 + 0.06, w / 2 - 0.06, y + 0.025, twoSided ? d / 2 : d / 2, twoSided ? d / 2 - 0.03 : d - 0.04, gap, theme);
        if (side < 0) for (const it of sub) { it[4] = -it[4]; it[6] = -it[6]; }
        items.push(...sub);
      }
    }
    // the top: cartons of stock
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.2; x += 0.45) if (rnd() < 0.5) items.push(['b', 0.38, 0.25, d * 0.7, x, h, 0, [0xb89a68, 0xc8aa78, 0xa88a58][Math.floor(rnd() * 3)]]);
    packed(g, items);
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
    pillshelf: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.6, 0.45, 5, 0xeef0ee, 'pharmacy'),
    foodshelf: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.5, 0.5, 4, 0xd8d8d4, 'grocery'),
    toolshelf: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.8, 0.5, 4, 0x8a6a3a, 'tools'),
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
    store_shelf: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.5, 0.5, 4, 0xd8d8d4, 'grocery'),
    // --- the convenience store ---
    gondola: (g, rnd, opt) => {
      stockedShelves(g, rnd, 2.4, 1.6, 1.0, 4, 0xe4e4e0, opt?.theme || 'grocery', true);
      // an end cap: a stack of cartons and a header card
      const items = [];
      const c = [0xd8302a, 0xf0b020, 0x2a7ad8, 0x30a050][Math.floor(rnd() * 4)];
      for (let i = 0; i < 3; i++) items.push(['b', 0.28, 0.22, 0.5, 1.36, i * 0.23, 0, i % 2 ? c : 0xe8d8b0]);
      packed(g, items);
      B(g, 0.03, 0.32, 0.03, 0x9a9a9a, 1.0, 1.6, 0); B(g, 0.9, 0.26, 0.02, M(c, 0.7), 1.0, 1.92, 0); // the aisle header on its post
    },
    wallshelf: (g, rnd, opt) => stockedShelves(g, rnd, 2.0, 2.0, 0.5, 5, 0xe0e0dc, opt?.theme || 'grocery'),
    cooler: (g, rnd) => {
      // An upright drinks cooler: lit shelves of bottles behind glass doors
      B(g, 1.7, 2.1, 0.75, 0xe8e8e4, 0, 0, 0);
      B(g, 1.58, 1.7, 0.02, M(0xf8fbff, 0.4, 0, 0xc8d8e8), 0, 0.2, -0.33); // lit back panel
      const items = [];
      for (let i = 0; i < 5; i++) {
        const y = 0.24 + i * 0.34;
        B(g, 1.58, 0.02, 0.6, 0xd0d4d8, 0, y - 0.02, 0);
        stockLevel(items, rnd, -0.76, 0.76, y, 0.3, 0.55, 0.3, 'drinks');
      }
      packed(g, items);
      for (const x of [-0.42, 0.42]) {
        B(g, 0.8, 1.86, 0.02, M(0xb8d8e8, 0.05, 0.3), x, 0.16, 0.37);
        B(g, 0.03, 0.4, 0.03, 0x9a9a9a, x + (x < 0 ? 0.34 : -0.34), 0.9, 0.39);
      }
      B(g, 1.7, 0.18, 0.02, M(0xffffff, 0.5, 0, 0x406080), 0, 1.92, 0.38); // lit header
    },
    icecream: (g, rnd) => {
      B(g, 1.5, 0.8, 0.8, 0xf0f0ec, 0, 0, 0);
      B(g, 1.4, 0.02, 0.7, M(0xb8d8e8, 0.05, 0.3), 0, 0.82, 0);
      const items = [];
      for (let i = 0; i < 14; i++) items.push([rnd() < 0.5 ? 'b' : 'c', 0.12 + rnd() * 0.06, 0.06 + rnd() * 0.04, 0.12, -0.62 + (i % 7) * 0.2, 0.68, -0.18 + Math.floor(i / 7) * 0.32, [0xe83a8a, 0x3a8ad8, 0xf0e070, 0xffffff, 0x8a4a2a][Math.floor(rnd() * 5)]]);
      packed(g, items);
      B(g, 1.5, 0.1, 0.02, M(0x2a6ad8, 0.5), 0, 0.6, 0.41);
    },
    kassa: (g, rnd) => {
      // The till: a counter with the register, a card reader, sweets and a bag rack
      B(g, 2.0, 0.95, 0.75, 0xd8d0c0, 0, 0, 0); B(g, 2.04, 0.04, 0.8, 0x4a4a48, 0, 0.95, 0);
      B(g, 0.42, 0.12, 0.36, 0x2a2a2a, 0.55, 0.99, -0.1); B(g, 0.34, 0.22, 0.04, 0x1a1a1a, 0.55, 1.11, -0.25, -0.3);
      B(g, 0.3, 0.17, 0.01, M(0x203040, 0.2, 0, 0x102030), 0.55, 1.15, -0.23);
      B(g, 0.09, 0.16, 0.05, 0x222222, 0.1, 0.99, 0.2); // card reader
      const items = [];
      stockLevel(items, rnd, -0.95, -0.05, 0.99, 0.32, 0.25, 0.14, 'grocery'); // impulse buys on the counter
      packed(g, items);
      B(g, 2.0, 0.6, 0.02, 0xc8302a, 0, 0.15, 0.38); // front panel with a stripe
      B(g, 2.0, 0.08, 0.025, 0xf0d020, 0, 0.55, 0.385);
    },
    cig_wall: (g, rnd) => {
      B(g, 1.8, 2.0, 0.3, 0x2a2a2e, 0, 0, 0);
      const items = [];
      const brands = [0xffffff, 0xd8302a, 0x2a4aa8, 0xd8b030, 0x30a050, 0x202020, 0xe8e8e8, 0x8a3a2a];
      for (let r = 0; r < 9; r++) for (let i = 0; i < 16; i++) items.push(['b', 0.085, 0.13, 0.06, -0.8 + i * 0.106, 0.35 + r * 0.17, 0.12, brands[(r * 3 + i + Math.floor(rnd() * 2)) % brands.length]]);
      packed(g, items);
      B(g, 1.8, 0.14, 0.02, M(0xffffff, 0.5, 0, 0x403020), 0, 1.92, 0.16);
    },
    promo: (g, rnd) => {
      const c = [0x2ab0d8, 0xe83a8a, 0xf0b020, 0x30a050][Math.floor(rnd() * 4)];
      B(g, 0.8, 1.3, 0.04, M(c, 0.8), 0, 0.3, 0); B(g, 0.6, 0.5, 0.045, M(0xf8f0e0, 0.8), 0, 0.85, 0.002);
      B(g, 0.12, 0.1, 0.05, 0xd8302a, 0.22, 1.42, 0.01); // the "sale" burst
      const items = [];
      for (let i = 0; i < 6; i++) items.push(['b', 0.24, 0.1, 0.3, -0.27 + (i % 3) * 0.27, Math.floor(i / 3) * 0.12, 0.2, c]);
      packed(g, items);
    },
    baskets: (g) => { for (let i = 0; i < 6; i++) B(g, 0.42, 0.04, 0.32, 0xd83a2a, 0, 0.1 + i * 0.05, 0); B(g, 0.44, 0.1, 0.34, 0x9a9a9a, 0, 0, 0); },
    bread_rack: (g, rnd) => {
      for (const sx of [-1, 1]) B(g, 0.04, 1.7, 0.55, 0x8a6a3a, sx * 0.68, 0, 0);
      const items = [];
      for (let i = 0; i < 4; i++) {
        const y = 0.2 + i * 0.4;
        B(g, 1.32, 0.025, 0.5, 0x8a6a3a, 0, y, 0, i < 2 ? 0 : 0.2);
        for (let k = 0; k < 6; k++) if (rnd() < 0.85) items.push(['b', 0.18, 0.09, 0.3 + rnd() * 0.08, -0.55 + k * 0.22, y + 0.025, 0, [0xb8783a, 0xc8904a, 0x8a5a2a, 0xe0c890][Math.floor(rnd() * 4)]]);
      }
      packed(g, items);
    },
    // Ceiling light panels in a lattice (placed at the ceiling: opt.w, opt.d)
    ceiling_led: (g, rnd, opt) => {
      const w = opt?.w ?? 6, d = opt?.d ?? 6, lit = M(0xffffff, 0.4, 0, 0xf4f4ec);
      // suspended ceiling tiles above the lattice
      B(g, w, 0.01, d, M(0xe8e8e0, 0.9, 0, 0x8a8a84), 0, 0.022, 0).castShadow = false;
      for (let x = -w / 2 + 1.5; x <= w / 2 - 1.4; x += 2.6) B(g, 0.14, 0.03, d - 1.2, lit, x, 0, 0);
      for (let z = -d / 2 + 1.4; z <= d / 2 - 1.3; z += 2.4) B(g, w - 1.2, 0.03, 0.12, lit, 0, 0, z);
    },
    // A band of coloured tile round the walls of a shop (opt.w, opt.d, opt.c)
    wall_band: (g, rnd, opt) => {
      const w = opt?.w ?? 6, d = opt?.d ?? 6, c = M(opt?.c ?? 0xa8c83a, 0.5);
      for (const sz of [-1, 1]) B(g, w, 0.3, 0.02, c, 0, 0, sz * (d / 2 - 0.01));
      for (const sx of [-1, 1]) B(g, 0.02, 0.3, d, c, sx * (w / 2 - 0.01), 0, 0);
    },
    // --- a Soviet flat ---
    stenka: (g, rnd) => {
      // The wall unit: dark veneer, glass doors over crockery and books
      const veneer = 0x4a2e1c;
      B(g, 2.6, 2.1, 0.5, veneer, 0, 0, 0);
      B(g, 2.5, 0.06, 0.02, 0x2a1a10, 0, 0.75, 0.25);
      for (let i = 0; i < 4; i++) B(g, 0.6, 0.66, 0.02, 0x5a3a24, -0.95 + i * 0.63, 0.06, 0.255);
      B(g, 1.24, 1.1, 0.02, M(0xb8c8d0, 0.05, 0.3), -0.62, 0.86, 0.255);
      const items = [];
      for (const y of [0.9, 1.3, 1.65]) for (let i = 0; i < 7; i++) if (rnd() < 0.8) items.push([rnd() < 0.5 ? 'c' : 'b', 0.09, 0.12 + rnd() * 0.12, 0.09, -1.15 + i * 0.16, y, 0.1, [0xf0f0e8, 0xd8c8a0, 0x8ab0c8, 0xc8a050, 0xa83a2a][Math.floor(rnd() * 5)]]);
      for (const y of [0.9, 1.3, 1.65]) { let x = 0.1; while (x < 1.15) { const bw = 0.03 + rnd() * 0.03; items.push(['b', bw, 0.2 + rnd() * 0.08, 0.2, x, y, 0.1, BOOKS[Math.floor(rnd() * BOOKS.length)]]); x += bw + 0.004; } }
      packed(g, items);
      for (const y of [0.88, 1.28, 1.63]) B(g, 2.5, 0.02, 0.45, veneer, 0, y - 0.02, 0);
    },
    wall_carpet: (g, rnd, opt) => {
      // The patterned rug hung on the wall
      const w = opt?.w ?? 2.0, h = opt?.h ?? 1.4, base = [0x8a1a1a, 0x6a1a2a, 0x2a2a5a][Math.floor(rnd() * 3)];
      B(g, w, h, 0.02, base, 0, 0.9, 0);
      B(g, w - 0.2, h - 0.2, 0.025, 0xc8a050, 0, 1.0, 0);
      B(g, w - 0.3, h - 0.3, 0.03, base, 0, 1.05, 0);
      for (let i = 0; i < 5; i++) B(g, 0.2, 0.2, 0.035, [0xe8d8a0, 0x2a4a3a, 0xc8a050][i % 3], -w / 2 + 0.35 + i * (w - 0.7) / 4, 0.9 + h / 2 - 0.1, 0);
    },
    crt_tv: (g) => {
      B(g, 0.7, 0.5, 0.5, 0x5a3a24, 0, 0, 0); // stand
      B(g, 0.6, 0.48, 0.5, 0x2a2a2a, 0, 0.5, -0.02);
      B(g, 0.48, 0.36, 0.02, M(0x1a2228, 0.2, 0.1), -0.03, 0.56, 0.24);
      B(g, 0.06, 0.3, 0.02, 0x555555, 0.24, 0.56, 0.24);
      cyl(g, 0.006, 0.4, 0x888888, 0.1, 0.98, -0.1, 4).rotation.z = 0.5;
    },
    gas_stove: (g) => {
      B(g, 0.55, 0.85, 0.6, 0xf0ece4, 0, 0, 0); B(g, 0.55, 0.03, 0.6, 0x2a2a2a, 0, 0.85, 0);
      for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) cyl(g, 0.06, 0.02, 0x3a3a3a, x, 0.88, z, 8);
      B(g, 0.45, 0.4, 0.02, 0x2a2a2a, 0, 0.18, 0.3); for (let i = 0; i < 4; i++) B(g, 0.04, 0.04, 0.03, 0x1a1a1a, -0.18 + i * 0.12, 0.72, 0.31);
      cyl(g, 0.1, 0.22, 0x3a6a8a, 0.13, 0.9, -0.13, 10); // the kettle
    },
    fridge_old: (g) => { B(g, 0.6, 1.5, 0.6, 0xf0ece0, 0, 0, 0); B(g, 0.03, 0.3, 0.04, 0xb8b8b0, 0.24, 0.9, 0.31); B(g, 0.5, 0.06, 0.02, 0xc8c0a8, 0, 1.3, 0.305); },
    kitchen_table: (g, rnd) => {
      B(g, 1.0, 0.04, 0.7, 0xd8d0b8, 0, 0.72, 0); legs(g, 1.0, 0.7, 0.72, 0.04, 0x8a8a8a);
      B(g, 0.9, 0.005, 0.6, [0xc84a3a, 0x3a6aa8, 0x6a8a3a][Math.floor(rnd() * 3)], 0, 0.765, 0); // oilcloth
      if (rnd() < 0.7) cyl(g, 0.05, 0.08, 0xffffff, 0.2, 0.77, 0.1, 8);
      if (rnd() < 0.5) cyl(g, 0.11, 0.03, 0xe8e8e0, -0.2, 0.77, -0.1, 12);
    },
    tabouret: (g) => { B(g, 0.32, 0.04, 0.32, 0xc8b898, 0, 0.42, 0); legs(g, 0.32, 0.32, 0.42, 0.03, 0x8a7a5a, 0.01); },
    pharma_shelf: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.6, 0.45, 5, 0xeef0ee, 'pharmacy'),
    tool_rack: (g, rnd) => stockedShelves(g, rnd, 1.6, 1.8, 0.5, 4, 0x8a6a3a, 'tools'),
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
    // --- eastern town ---
    dumpster: (g, rnd) => {
      const c = [0x2a5a3a, 0x3a4a6a, 0x5a5a58][Math.floor(rnd() * 3)];
      B(g, 1.7, 1.0, 1.0, c, 0, 0.15, 0); B(g, 1.74, 0.05, 1.06, M(0x2a2a2a, 0.6), 0, 1.15, 0, -0.08);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.07, 0.12, 0x1a1a1a, sx * 0.7, 0, sz * 0.38, 8);
      B(g, 1.5, 0.12, 0.02, 0xd8d8d0, 0, 0.75, 0.51);
    },
    worklocker: (g, rnd) => { B(g, 0.6, 1.8, 0.5, 0x5a6a7a, 0, 0, 0); B(g, 0.52, 1.7, 0.02, 0x6a7a8a, 0, 0.05, 0.25); for (let j = 0; j < 4; j++) B(g, 0.3, 0.012, 0.01, 0x3a4a5a, 0, 1.45 + j * 0.06, 0.262); },
    garage_shelf: (g, rnd) => {
      for (const sx of [-1, 1]) B(g, 0.05, 1.8, 0.5, 0x5a5a5a, sx * 0.78, 0, 0);
      const items = [];
      for (let i = 0; i < 4; i++) {
        const y = 0.1 + i * 0.45;
        B(g, 1.56, 0.03, 0.5, 0x7a6a4a, 0, y, 0);
        for (let x = -0.62; x < 0.65; x += 0.2 + rnd() * 0.2) if (rnd() < 0.7) items.push([rnd() < 0.4 ? 'c' : 'b', 0.12 + rnd() * 0.12, 0.1 + rnd() * 0.22, 0.14 + rnd() * 0.15, x, y + 0.03, 0, [0x9a4a2a, 0x3a5a3a, 0x8a8a84, 0xc8a050, 0x2a2a2a, 0xe0d8c0][Math.floor(rnd() * 6)]]);
      }
      packed(g, items);
    },
    lathe: (g, rnd) => {
      const c = M(0x4a6a5a, 0.5, 0.3);
      B(g, 2.2, 0.75, 0.6, c, 0, 0, 0); B(g, 0.6, 0.55, 0.7, c, -0.75, 0.75, 0); B(g, 0.3, 0.35, 0.5, c, 0.8, 0.75, 0);
      cyl(g, 0.12, 0.9, M(0xa8a8a8, 0.3, 0.8), -0.05, 1.0, 0, 10).rotation.z = Math.PI / 2;
      B(g, 2.0, 0.05, 0.08, M(0xb8b8b8, 0.3, 0.8), 0, 0.75, 0.2); B(g, 0.2, 0.15, 0.2, 0xd8a020, -0.75, 1.1, 0.36);
    },
    press: (g, rnd) => {
      const c = M(0x3a5a8a, 0.5, 0.3);
      B(g, 1.4, 0.5, 1.2, c, 0, 0, 0); for (const sx of [-1, 1]) B(g, 0.25, 2.1, 0.5, c, sx * 0.58, 0.5, -0.3);
      B(g, 1.4, 0.4, 0.8, c, 0, 2.2, -0.15); B(g, 0.8, 0.5, 0.6, M(0x8a8a8a, 0.4, 0.6), 0, 1.5, 0);
      B(g, 1.0, 0.08, 0.08, 0xd8c020, 0, 0.9, 0.62); B(g, 1.0, 0.08, 0.08, 0x1a1a1a, 0.1, 0.9, 0.62);
    },
    conveyor: (g, rnd) => {
      for (const x of [-1.8, -0.6, 0.6, 1.8]) for (const sz of [-1, 1]) B(g, 0.06, 0.8, 0.06, 0x5a5a5a, x, 0, sz * 0.4);
      B(g, 4.0, 0.1, 0.9, 0x6a6a6a, 0, 0.8, 0); B(g, 3.9, 0.02, 0.7, 0x1a1a1a, 0, 0.9, 0);
      for (let i = 0; i < 3; i++) if (rnd() < 0.7) B(g, 0.45, 0.3, 0.4, 0xb89a68, -1.3 + i * 1.2, 0.92, 0);
    },
    machine: (g, rnd) => {
      B(g, 1.5, 1.2, 1.1, M(0x5a7a6a, 0.5, 0.3), 0, 0, 0); B(g, 0.5, 0.4, 0.04, M(0x203028, 0.3, 0, 0x103018), -0.3, 0.7, 0.56);
      for (let i = 0; i < 3; i++) B(g, 0.06, 0.06, 0.05, [0xd82a2a, 0x2ad82a, 0xd8d82a][i], 0.25 + i * 0.12, 0.85, 0.56);
      cyl(g, 0.04, 1.0, 0x8a8a8a, 0.6, 1.2, -0.4, 6);
    },
    boiler: (g, rnd) => {
      // A coal/gas boiler: a riveted drum on a brick base, a flue up through the roof
      B(g, 2.0, 0.6, 1.6, 0x8a4a3a, 0, 0, 0);
      cyl(g, 0.75, 2.2, M(0x5a5a58, 0.5, 0.5), 0, 0.6, 0, 14).rotation.z = Math.PI / 2;
      cyl(g, 0.25, 1.6, M(0x4a4a48, 0.6, 0.4), -0.7, 1.6, 0, 10);
      B(g, 0.4, 0.4, 0.05, 0x2a2a2a, 0.9, 0.7, 0.8); cyl(g, 0.1, 0.05, 0xe8e8e0, 0.4, 1.5, 0.78, 12).rotation.x = Math.PI / 2;
      cyl(g, 0.06, 2.2, 0x7a7a74, 0.6, 1.4, 0.5, 8).rotation.z = Math.PI / 2;
    },
    lavochka: (g, rnd) => {
      // The bench by every entrance: concrete feet, painted slats
      const c = [0x3a6a3a, 0x3a5a8a, 0x8a3a2a][Math.floor(rnd() * 3)];
      for (const x of [-0.7, 0.7]) B(g, 0.12, 0.42, 0.5, 0x8a8a84, x, 0, 0);
      for (let i = 0; i < 3; i++) B(g, 1.8, 0.04, 0.1, c, 0, 0.42, -0.15 + i * 0.13);
      for (let i = 0; i < 2; i++) B(g, 1.8, 0.1, 0.03, c, 0, 0.6 + i * 0.15, -0.26);
    },
    swing: (g, rnd) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = B(g, 0.06, 2.2, 0.06, 0x3a5aa8, sx * 1.2, 0, sz * 0.5); p.rotation.x = -sz * 0.2; p.position.z *= 0.6; }
      B(g, 2.5, 0.07, 0.07, 0x3a5aa8, 0, 2.1, 0);
      for (const x of [-0.5, 0.5]) { for (const dx of [-0.2, 0.2]) B(g, 0.01, 1.6, 0.01, 0x888888, x + dx, 0.5, 0); B(g, 0.5, 0.04, 0.2, 0xd83a2a, x, 0.48, 0); }
    },
    slide: (g, rnd) => {
      B(g, 0.9, 1.2, 0.9, 0xd8a020, -1.0, 0, 0); B(g, 0.9, 0.05, 0.9, 0xd83a2a, -1.0, 1.2, 0);
      const s = B(g, 2.3, 0.05, 0.6, M(0xb8b8c0, 0.3, 0.7), 0.25, 0.6, 0); s.rotation.z = -0.5;
      for (let i = 0; i < 4; i++) B(g, 0.06, 0.04, 0.6, 0x3a5aa8, -1.55, 0.2 + i * 0.3, 0);
    },
    climber: (g, rnd) => {
      // the "rocket" climbing frame made of pipe
      const c = [0xd83a2a, 0x3a8a3a, 0x3a5aa8][Math.floor(rnd() * 3)];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.03, 2.1, c, sx * 0.9, 0, sz * 0.9, 6);
      for (let i = 0; i < 4; i++) { const y = 0.4 + i * 0.5; for (const sz of [-1, 1]) { B(g, 1.8, 0.04, 0.04, c, 0, y, sz * 0.9); B(g, 0.04, 0.04, 1.8, c, sz * 0.9, y, 0); } }
    },
    sandbox: (g, rnd) => { for (const sz of [-1, 1]) { B(g, 2.0, 0.3, 0.1, 0x8a6a3a, 0, 0, sz * 0.95); B(g, 0.1, 0.3, 2.0, 0x8a6a3a, sz * 0.95, 0, 0); } B(g, 1.8, 0.15, 1.8, 0xc8b080, 0, 0, 0); },
    laundry_poles: (g, rnd) => {
      for (const sx of [-1, 1]) { B(g, 0.08, 2.0, 0.08, 0x5a5a5a, sx * 1.9, 0, 0); B(g, 0.06, 0.06, 1.2, 0x5a5a5a, sx * 1.9, 1.95, 0); }
      for (const z of [-0.5, 0, 0.5]) {
        B(g, 3.8, 0.01, 0.01, 0xdddddd, 0, 1.95, z);
        for (let i = 0; i < 5; i++) if (rnd() < 0.55) B(g, 0.3 + rnd() * 0.4, 0.4 + rnd() * 0.4, 0.01, [0xe8e8f0, 0x3a5a8a, 0xa83a3a, 0xe0d0a0, 0x6a8a5a][Math.floor(rnd() * 5)], -1.5 + i * 0.75, 1.3, z);
      }
    },
    bus_stop: (g, rnd) => {
      // A concrete-and-glass shelter with a bench and a route board
      B(g, 3.4, 2.4, 0.08, M(0x9ab0c0, 0.1, 0.3), 0, 0, -1.2);
      for (const sx of [-1, 1]) { B(g, 0.08, 2.4, 2.4, M(0x9ab0c0, 0.1, 0.3), sx * 1.7, 0, 0); B(g, 0.1, 2.5, 0.1, 0x5a5a58, sx * 1.7, 0, 1.2); }
      B(g, 3.6, 0.12, 2.6, 0x7a7a74, 0, 2.45, 0); B(g, 3.6, 0.3, 0.05, 0x2a5aa8, 0, 2.3, 1.3);
      B(g, 2.6, 0.06, 0.4, 0x6a4a2a, 0, 0.45, -0.9); for (const x of [-1.1, 1.1]) B(g, 0.06, 0.45, 0.35, 0x3a3a3a, x, 0, -0.9);
      B(g, 0.5, 0.7, 0.04, 0xe8e8e0, 1.3, 1.2, -1.14);
    },
    street_lamp: (g, rnd) => {
      cyl(g, 0.09, 6.2, 0x5a5a58, 0, 0, 0, 8);
      B(g, 0.08, 0.08, 1.4, 0x5a5a58, 0, 6.1, 0.6); B(g, 0.3, 0.12, 0.5, 0x3a3a3a, 0, 5.95, 1.2); B(g, 0.24, 0.02, 0.4, M(0xfff0c0, 0.4, 0, 0x8a7a50), 0, 5.93, 1.2);
    },
    kiosk_booth: (g, rnd) => {
      // The street kiosk: a steel box with a shutter, plastered in adverts
      const c = [0x2a6a3a, 0x2a4a8a, 0xd8a020, 0xa82a2a][Math.floor(rnd() * 4)];
      B(g, 2.4, 2.3, 2.4, c, 0, 0, 0); B(g, 2.6, 0.1, 2.6, 0x3a3a3a, 0, 2.3, 0);
      B(g, 1.6, 0.8, 0.03, M(0x8aa0b0, 0.1, 0.3), 0, 1.0, 1.21); B(g, 1.8, 0.06, 0.4, 0x8a8a84, 0, 0.95, 1.4);
      B(g, 2.2, 0.35, 0.03, M(0xf0f0e0, 0.6, 0, 0x404030), 0, 1.95, 1.22);
      for (let i = 0; i < 3; i++) B(g, 0.5, 0.7, 0.01, [0xe83a8a, 0xf0c020, 0x2ab0d8, 0xffffff][Math.floor(rnd() * 4)], -0.8 + i * 0.8, 0.9, -1.21);
    },
    greenhouse: (g, rnd) => {
      const f = 0xd8d8d0, glass = M(0xc8e0d0, 0.1, 0.1);
      B(g, 2.8, 1.6, 0.03, glass, 0, 0, -0.95); B(g, 2.8, 1.6, 0.03, glass, 0, 0, 0.95); B(g, 0.03, 1.6, 1.9, glass, -1.4, 0, 0); B(g, 0.03, 1.6, 1.9, glass, 1.4, 0, 0);
      for (const sz of [-1, 1]) { const r = B(g, 2.9, 0.03, 1.1, glass, 0, 1.85, sz * 0.48); r.rotation.x = sz * 0.5; }
      for (let x = -1.4; x <= 1.41; x += 0.7) B(g, 0.04, 1.6, 1.96, f, x, 0, 0);
      for (let i = 0; i < 6; i++) B(g, 0.25, 0.4 + rnd() * 0.4, 0.25, 0x3a7a2a, -1.0 + (i % 3) * 1.0, 0, i < 3 ? -0.5 : 0.5);
    },
    well: (g, rnd) => {
      B(g, 0.9, 0.7, 0.9, 0x8a6a4a, 0, 0, 0); for (const sx of [-1, 1]) B(g, 0.08, 1.5, 0.08, 0x6a4a2a, sx * 0.4, 0.7, 0);
      const r = B(g, 1.1, 0.04, 0.8, 0x5a3a24, 0, 2.15, 0); r.rotation.z = 0; cyl(g, 0.08, 0.8, 0x6a4a2a, 0, 1.6, 0, 8).rotation.z = Math.PI / 2;
    },
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
