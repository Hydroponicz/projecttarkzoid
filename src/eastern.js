// The things that make it look like a post-Soviet town rather than any town:
// courtyards between the blocks (a playground, benches, bins, washing),
// rows of lock-up garages, the boiler house chimney and the heating mains on
// stilts, factory stacks, street lamps, bus shelters and kiosks.
// Everything here goes through the world's own helpers (c), so it batches,
// collides and saves like the rest of the town.

// A courtyard (dvor) in the rectangle r
export function courtyard(c, r) {
  const { rnd, rand, fur, addBox, addContainer } = c;
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, w = r.x1 - r.x0, d = r.z1 - r.z0;
  const along = w >= d; // the long way
  const spots = [];
  const put = (type, x, z, rot, coll = true) => {
    const [fw, fd, fh] = c.FOOT[type];
    const swap = Math.abs(Math.sin(rot)) > 0.5, hw = (swap ? fd : fw) / 2, hd = (swap ? fw : fd) / 2;
    if (x - hw < r.x0 || x + hw > r.x1 || z - hd < r.z0 || z + hd > r.z1) return false;
    if (spots.some((s) => x - hw < s.x1 + 0.6 && x + hw > s.x0 - 0.6 && z - hd < s.z1 + 0.6 && z + hd > s.z0 - 0.6)) return false;
    if (c.inClear(x - hw, z - hd, x + hw, z + hd)) return false;
    spots.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
    fur.model(type, x, z, rot, {}, rand);
    if (coll && fh > 0.2) addBox(x - hw + 0.05, z - hd + 0.05, x + hw - 0.05, z + hd - 0.05, { blocksSight: false, blocksShot: fh > 1.2, h: Math.min(fh, 1.2) });
    return true;
  };
  const at = (u, v) => (along ? [cx + u * w / 2, cz + v * d / 2] : [cx + v * w / 2, cz + u * d / 2]);
  const rot0 = along ? 0 : Math.PI / 2;
  // the playground in the middle
  const kit = c.shuffle(['swing', 'slide', 'climber', 'sandbox']);
  kit.forEach((t, i) => { const [x, z] = at(-0.35 + i * 0.24, rnd(-0.25, 0.25)); put(t, x, z, rot0 + (rand() < 0.5 ? 0 : Math.PI)); });
  // benches facing it, bins at one end, washing at the other
  for (let i = 0; i < 3; i++) { const [x, z] = at(rnd(-0.6, 0.6), i % 2 ? 0.72 : -0.72); put('lavochka', x, z, rot0 + (i % 2 ? Math.PI : 0)); }
  for (let i = 0; i < 2; i++) {
    const [x, z] = at(0.82, -0.3 + i * 0.45);
    if (!c.inClear(x - 1, z - 0.6, x + 1, z + 0.6) && !spots.some((s) => x > s.x0 - 1.2 && x < s.x1 + 1.2 && z > s.z0 - 0.8 && z < s.z1 + 0.8)) {
      spots.push({ x0: x - 0.95, x1: x + 0.95, z0: z - 0.6, z1: z + 0.6 });
      addContainer('dumpster', x, z, rot0 + Math.PI / 2);
    }
  }
  { const [x, z] = at(-0.8, 0); put('laundry_poles', x, z, rot0 + Math.PI / 2, false); }
  for (let i = 0; i < 3; i++) { const [x, z] = at(rnd(-0.9, 0.9), rand() < 0.5 ? -0.9 : 0.9); if (!spots.some((s) => x > s.x0 - 1 && x < s.x1 + 1 && z > s.z0 - 1 && z < s.z1 + 1)) c.trees.push([x, z]); }
  c.zombieSpawns.push({ x: cx, z: cz, r: Math.min(w, d) / 2, n: 2, type: null });
}

// Lock-up garages in a row along x (doors facing `face`: 1 = +z, -1 = -z),
// starting at x0, back wall at z. Some stand open with a car or junk inside.
export function garageRow(c, x0, z, n, face) {
  const { rnd, rand, pick, prop, addBox, addContainer } = c;
  const U = 3.2, D = 6.0, H = 2.5;
  const cols = [0x5a6a7a, 0x6a5a4a, 0x4a5a4a, 0x8a3a2a, 0x3a4a6a, 0x7a7a74];
  const zb = z, zf = z + face * D, zm = z + face * D / 2;
  // the back wall, the roof slab and a strip of tar paper on top
  prop(n * U + 0.3, H, 0.25, 0x8a8478, x0 + n * U / 2, H / 2, zb);
  addBox(x0 - 0.15, Math.min(zb, zb) - 0.13, x0 + n * U + 0.15, zb + 0.13, { h: H });
  prop(n * U + 0.5, 0.18, D + 0.4, 0x4a4a48, x0 + n * U / 2, H + 0.09, zm);
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * U;
    prop(0.2, H, D, 0x8a8478, x, H / 2, zm);
    addBox(x - 0.1, Math.min(zb, zf), x + 0.1, Math.max(zb, zf), { h: H });
  }
  for (let i = 0; i < n; i++) {
    const x = x0 + (i + 0.5) * U, col = pick(cols);
    const open = rand() < 0.35;
    if (!open) {
      // closed doors, a bit rusty, a number painted on
      prop(U - 0.25, H - 0.15, 0.06, col, x, (H - 0.15) / 2, zf);
      prop(0.04, H - 0.3, 0.07, 0x3a3a3a, x, (H - 0.15) / 2, zf);
      prop(0.4, 0.25, 0.07, 0xe8e8e0, x - 0.6, 1.9, zf + face * 0.01);
      addBox(x - U / 2 + 0.1, zf - 0.05, x + U / 2 - 0.1, zf + 0.05, { h: H });
    } else {
      // swung-open leaves, shelves at the back, whatever was left in it
      for (const s of [-1, 1]) { const l = prop(U / 2 - 0.15, H - 0.15, 0.06, col, x + s * (U / 2 + 0.05), (H - 0.15) / 2, zf + face * (U / 4)); l.rotation.y = Math.PI / 2; }
      addContainer('garage_shelf', x, zb + face * 0.45, face > 0 ? 0 : Math.PI);
      if (rand() < 0.4) addContainer('toolbox', x + rnd(-0.8, 0.8), zb + face * 1.4);
      if (rand() < 0.45) c.car(x, zm + face * 0.4, face > 0 ? 0 : Math.PI, null, { project: rand() < 0.5 });
      else { prop(0.6, 0.9, 0.6, pick([0x2a4a8a, 0xa82a1a]), x + rnd(-0.7, 0.7), 0.45, zm, 0, true); prop(0.8, 0.5, 0.6, 0x8a6a4a, x - 0.6, 0.25, zm + face, 0, true); }
    }
  }
}

// A brick factory stack or boiler-house chimney
export function smokestack(c, x, z, h, r) {
  const { fur, group, addBox, THREE } = c;
  const brick = c.mergeableMaterial('brick', 0x8a4a3a, 1, 0.9);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.65, r, h, 14), brick);
  m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; group.add(m);
  // red and white bands near the top (for the aircraft), a black lip
  for (let i = 0; i < 3; i++) {
    const t = 1 - (i + 1) * 0.06, rr = r * (0.65 + 0.35 * (1 - t)) + 0.04;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, h * 0.05, 14), fur.M(i % 2 ? 0xe8e8e0 : 0xb8302a));
    band.position.set(x, h * t, z); group.add(band);
  }
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.4, 14), fur.M(0x1a1a1a));
  lip.position.set(x, h, z); group.add(lip);
  addBox(x - r, z - r, x + r, z + r, { h });
}

// Heating mains on stilts from a to b (straight along x or z): two lagged
// pipes, lifted into an arch over the middle so there's a way under
export function heatPipe(c, ax, az, bx, bz) {
  const { prop, addBox } = c;
  const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
  const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az), s0 = alongX ? Math.min(ax, bx) : Math.min(az, bz), k = alongX ? az : ax;
  const mid = s0 + len / 2, archW = 4;
  const pipe = (a0, a1, y, off) => {
    if (a1 - a0 < 0.05) return;
    const m = (a0 + a1) / 2;
    if (alongX) prop(a1 - a0, 0.32, 0.32, 0xb8b8b0, m, y, k + off); else prop(0.32, 0.32, a1 - a0, 0xb8b8b0, k + off, y, m);
  };
  for (const off of [-0.22, 0.22]) {
    pipe(s0, mid - archW / 2, 0.75, off); pipe(mid + archW / 2, s0 + len, 0.75, off);
    pipe(mid - archW / 2 + 0.16, mid + archW / 2 - 0.16, 3.2, off);
    for (const e of [mid - archW / 2, mid + archW / 2]) { if (alongX) prop(0.32, 2.77, 0.32, 0xb8b8b0, e, 1.97, k + off); else prop(0.32, 2.77, 0.32, 0xb8b8b0, k + off, 1.97, e); }
  }
  for (let a = s0 + 1; a < s0 + len - 0.5; a += 3) {
    if (Math.abs(a - mid) < archW / 2 + 0.3) continue;
    if (alongX) prop(0.12, 0.6, 0.7, 0x6a6a64, a, 0.3, k); else prop(0.7, 0.6, 0.12, 0x6a6a64, k, 0.3, a);
  }
  // you can't walk through it, but it's low enough to see over
  const box = (a0, a1) => (alongX ? addBox(a0, k - 0.42, a1, k + 0.42, { blocksSight: false, blocksShot: false, h: 0.95 }) : addBox(k - 0.42, a0, k + 0.42, a1, { blocksSight: false, blocksShot: false, h: 0.95 }));
  box(s0, mid - archW / 2 + 0.2); box(mid + archW / 2 - 0.2, s0 + len);
}

// A street kiosk facing `rot`, its counter lootable from the front
export function kiosk(c, x, z, rot) {
  const { fur, rand, addBox } = c;
  if (c.inClear(x - 1.4, z - 1.4, x + 1.4, z + 1.4)) return false;
  fur.model('kiosk_booth', x, z, rot, {}, rand);
  for (let i = c.trees.length - 1; i >= 0; i--) if (Math.hypot(c.trees[i][0] - x, c.trees[i][1] - z) < 2.6) c.trees.splice(i, 1);
  addBox(x - 1.25, z - 1.25, x + 1.25, z + 1.25, { h: 2.4 });
  c.lootSpot('kiosk', x + Math.sin(rot) * 1.5, z + Math.cos(rot) * 1.5, 1.0);
  return true;
}

// Fences round a rectangle, with gaps: 'picket' (dachas), 'profile'
// (corrugated sheet), 'slab' (the concrete panels round industry)
export function fence(c, r, style, gaps = []) {
  const { prop, addBox } = c;
  const spec = { picket: [1.1, 0x8a6a3a, 0.05], profile: [1.9, 0x4a6a5a, 0.06], slab: [2.2, 0xb8b4a8, 0.15] }[style];
  const [h, col, t] = spec;
  const sides = [['x', r.x0, r.x1, r.z0], ['x', r.x0, r.x1, r.z1], ['z', r.z0, r.z1, r.x0], ['z', r.z0, r.z1, r.x1]];
  for (const [ax, a0, a1, k] of sides) {
    // cut the gaps out of this side
    const cuts = gaps.filter((g) => (ax === 'x' ? Math.abs(g.z - k) < 0.5 && g.x > a0 && g.x < a1 : Math.abs(g.x - k) < 0.5 && g.z > a0 && g.z < a1)).map((g) => [(ax === 'x' ? g.x : g.z) - g.w / 2, (ax === 'x' ? g.x : g.z) + g.w / 2]).sort((p, q) => p[0] - q[0]);
    let s = a0;
    for (const [g0, g1] of [...cuts, [a1, a1]]) {
      if (g0 - s > 0.2) {
        const m = (s + g0) / 2, L = g0 - s;
        if (style === 'picket') {
          // rails, and the pickets as one strip of boards with a gap pattern
          for (const y of [0.3, 0.85]) { if (ax === 'x') prop(L, 0.06, 0.03, col, m, y, k); else prop(0.03, 0.06, L, col, k, y, m); }
          for (let a = s + 0.1; a < g0; a += 0.16) { if (ax === 'x') prop(0.09, h, 0.02, col, a, h / 2, k + 0.03); else prop(0.02, h, 0.09, col, k + 0.03, h / 2, a); }
        } else {
          // sheet or concrete panels (textured like the walls), posts between
          const pat = style === 'slab' ? 'panel' : 'siding';
          if (ax === 'x') c.wall(s, k - t / 2, g0, k + t / 2, h, col, pat); else c.wall(k - t / 2, s, k + t / 2, g0, h, col, pat);
          const step = style === 'slab' ? 3.2 : 2.5;
          for (let a = s; a <= g0 + 0.01; a += step) { if (ax === 'x') prop(0.16, h + 0.15, t + 0.1, 0x7a7670, Math.min(a, g0), (h + 0.15) / 2, k); else prop(t + 0.1, h + 0.15, 0.16, 0x7a7670, k, (h + 0.15) / 2, Math.min(a, g0)); }
        }
        if (ax === 'x') addBox(s, k - 0.08, g0, k + 0.08, { blocksSight: style !== 'picket', blocksShot: style === 'slab', h }); else addBox(k - 0.08, s, k + 0.08, g0, { blocksSight: style !== 'picket', blocksShot: style === 'slab', h });
      }
      s = g1;
    }
  }
}

// Lamps along the town's sidewalks and a few bus shelters
export function streetLights(c, BLOCK, ROAD, TOWN) {
  const { fur, rand, addBox } = c;
  for (let k = -TOWN; k <= TOWN; k += BLOCK) for (const axis of ['x', 'z']) for (const side of [-1, 1]) {
    for (let a = -TOWN + ROAD / 2 + 6; a < TOWN; a += 20) {
      if (((a + TOWN) % BLOCK) < ROAD / 2 + 2 || ((a + TOWN) % BLOCK) > BLOCK - ROAD / 2 - 2) continue; // not in a junction
      if ((Math.round(a / 20) + (side > 0 ? 1 : 0)) % 2) continue; // staggered
      const off = k + side * (ROAD / 2 + 1.4);
      const [x, z] = axis === 'x' ? [off, a] : [a, off];
      if (Math.abs(x) > TOWN || Math.abs(z) > TOWN) continue;
      // the arm reaches out over the road
      const rot = axis === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
      fur.model('street_lamp', x, z, rot, {}, rand);
      addBox(x - 0.1, z - 0.1, x + 0.1, z + 0.1, { blocksSight: false, h: 6 });
    }
  }
}

export function busStop(c, x, z, rot) {
  const { fur, rand, addBox } = c;
  if (c.inClear(x - 2, z - 2, x + 2, z + 2)) return;
  fur.model('bus_stop', x, z, rot, {}, rand);
  // the back and the sides block; the front is open
  const s = Math.sin(rot), co = Math.cos(rot);
  const pt = (u, v) => [x + u * co + v * s, z - u * s + v * co];
  for (const [u0, v0, u1, v1] of [[-1.7, -1.25, 1.7, -1.15], [-1.75, -1.2, -1.65, 1.2], [1.65, -1.2, 1.75, 1.2]]) {
    const [ax, az] = pt(u0, v0), [bx, bz] = pt(u1, v1);
    addBox(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), { blocksSight: false, blocksShot: false, h: 2.4 });
  }
}

// A factory's roof line: a clerestory band above the walls and saw-tooth
// north lights along the hall
export function factoryRoof(c, b) {
  const { prop, fur } = c;
  const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, H = c.WALL_H + 0.25;
  const brick = b.color;
  // the walls carry on up 2 m (rows of high windows), a cornice on top
  prop(w + 0.3, 2.0, 0.3, brick, cx, H + 1.0, b.z0); prop(w + 0.3, 2.0, 0.3, brick, cx, H + 1.0, b.z1);
  prop(0.3, 2.0, d, brick, b.x0, H + 1.0, cz); prop(0.3, 2.0, d, brick, b.x1, H + 1.0, cz);
  for (let x = b.x0 + 1.5; x < b.x1 - 1.2; x += 2.4) for (const z of [b.z0, b.z1]) prop(1.6, 1.1, 0.32, 0x2a3238, x, H + 1.0, z);
  for (const z of [b.z0, b.z1]) prop(w + 0.5, 0.25, 0.45, 0x6a6a64, cx, H + 2.1, z);
  // saw-tooth: a sloped roof plane and a glazed upright, again and again
  const n = Math.max(2, Math.floor(w / 4)), step = w / n, top = H + 2.0;
  for (let i = 0; i < n; i++) {
    const x0 = b.x0 + i * step;
    const slope = prop(Math.hypot(step, 1.4), 0.12, d - 0.2, 0x5a5a58, x0 + step / 2, top + 0.7, cz);
    slope.rotation.z = Math.atan2(1.4, step);
    const g = prop(0.06, 1.4, d - 0.4, 0x6a8090, x0 + step - 0.03, top + 0.7, cz);
    g.material = fur.M(0x6a8090, 0.15, 0.4);
  }
}

// The television tower: a square steel lattice tapering up to a platform
// and an antenna mast, painted in red and white bands, warning lights on top
export function tvTower(c, x, z, h) {
  const { prop, addBox, fur } = c;
  const steel = [0xc83a2a, 0xe8e8e0];
  const base = 4.5, top = 1.4, seg = 12, sh = h * 0.8 / seg;
  const half = (y) => base + (top - base) * (y / (h * 0.8));
  for (let i = 0; i < seg; i++) {
    const y0 = i * sh, y1 = y0 + sh, a0 = half(y0), a1 = half(y1), col = steel[Math.floor(i / 2) % 2];
    // four corner legs (leaning in), a ring and a cross brace on each face
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = prop(0.22, Math.hypot(sh, a0 - a1) + 0.05, 0.22, col, x + sx * (a0 + a1) / 2, (y0 + y1) / 2, z + sz * (a0 + a1) / 2);
      leg.rotation.set(-sz * Math.atan2(a0 - a1, sh), 0, sx * Math.atan2(a0 - a1, sh), 'XYZ');
    }
    for (const s of [-1, 1]) { prop(a1 * 2, 0.14, 0.14, col, x, y1, z + s * a1); prop(0.14, 0.14, a1 * 2, col, x + s * a1, y1, z); }
    const L = Math.hypot(a0 + a1, sh);
    for (const s of [-1, 1]) {
      const b1 = prop(L, 0.08, 0.08, col, x, (y0 + y1) / 2, z + s * (a0 + a1) / 2); b1.rotation.z = Math.atan2(sh, a0 + a1) * (i % 2 ? 1 : -1);
      const b2 = prop(0.08, 0.08, L, col, x + s * (a0 + a1) / 2, (y0 + y1) / 2, z); b2.rotation.x = Math.atan2(sh, a0 + a1) * (i % 2 ? 1 : -1);
    }
  }
  // the platform with its dishes, then the mast
  const py = h * 0.8;
  prop(top * 2 + 2, 0.4, top * 2 + 2, 0x8a8a84, x, py + 0.2, z);
  for (let i = 0; i < 4; i++) { const d = prop(1.2, 1.2, 0.2, 0xd8d8d0, x + Math.cos(i * 1.57) * (top + 0.8), py + 1.2, z + Math.sin(i * 1.57) * (top + 0.8)); d.rotation.y = -i * 1.57 + Math.PI / 2; }
  for (let i = 0; i < 4; i++) prop(0.3 - i * 0.05, h * 0.05, 0.3 - i * 0.05, steel[i % 2], x, py + 0.4 + h * 0.05 * (i + 0.5), z);
  const lamp = prop(0.4, 0.4, 0.4, 0xff3020, x, h + 0.6, z);
  lamp.material = fur.M(0xff3020, 0.5, 0, 0xff2010);
  addBox(x - base, z - base, x + base, z + base, { blocksSight: false, blocksShot: false, h: 3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(x + sx * base - 0.3, z + sz * base - 0.3, x + sx * base + 0.3, z + sz * base + 0.3, { h });
}
