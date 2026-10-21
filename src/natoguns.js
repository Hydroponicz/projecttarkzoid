// NATO and Western firearms: M4A1, HK MP5, Glock 17, M1911A1, M14,
// Remington 870 and the M249 SAW, with their magazines. Built like the
// others in gunmodels.js (same model space: the sight line is -Z at y = 0
// with the rear sight at the origin; iron sights are exact), and registered
// into its BUILDERS and magazine table when this module loads.
import * as THREE from 'three';
import { MAT, B, RB, C, P, EX, hand, hands, BUILDERS, MAG_BUILDERS, boxMag, rivets } from './gunmodels.js';

// ---------------------------------------------------------------------------
// Shared details
// ---------------------------------------------------------------------------
// Rear notch / aperture at the origin: two ears whose tops are on the sight line
function rearNotch(g, mat = MAT.dark, base = -0.016) {
  B(g, 0.03, -0.006 - base, 0.012, mat, 0, (base - 0.006) / 2, 0);
  B(g, 0.008, 0.012, 0.006, mat, -0.008, -0.006, 0);
  B(g, 0.008, 0.012, 0.006, mat, 0.008, -0.006, 0);
}
// Front post with its tip on the sight line, protective ears either side
function frontPost(g, z, baseY, mat = MAT.dark, ears = true) {
  B(g, 0.0035, -baseY, 0.004, mat, 0, baseY / 2, z);
  if (ears) for (const sx of [-1, 1]) B(g, 0.003, -baseY + 0.004, 0.014, mat, sx * 0.011, baseY / 2 + 0.002, z);
}
// Picatinny rail: base with cross slots, from z0 to z1, top at y
function rail(g, z0, z1, y, w = 0.022) {
  RB(g, w, 0.008, z1 - z0, 0.0015, MAT.dark, 0, y - 0.004, (z0 + z1) / 2);
  for (let z = z0 + 0.006; z < z1 - 0.004; z += 0.01) B(g, w + 0.002, 0.004, 0.005, MAT.black, 0, y - 0.0015, z);
}
// Straight (slightly curved) double-stack magazine: origin at the top centre
function stanagMag(len, w, d, curve, mat, ribs = true) {
  const g = new THREE.Group(), front = [], back = [], n = 8;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * len, cz = -curve * s * s, cy = -s;
    front.push([cz - d / 2, cy]); back.push([cz + d / 2, cy]);
  }
  EX(g, [...front, ...back.reverse()], w, mat, 0, 0.002);
  if (ribs) for (const sx of [-1, 1]) B(g, 0.002, len * 0.7, 0.012, mat, sx * (w / 2 + 0.001), -len * 0.5, -curve * len * len * 0.25 + d * 0.25);
  RB(g, w + 0.006, 0.01, d + 0.01, 0.003, MAT.dark, 0, -len - 0.004, -curve * len * len); // floor plate
  B(g, w * 0.6, 0.004, d * 0.5, MAT.brass, 0, 0.002, -0.004); // top round
  return g;
}
function birdcage(g, y, z) {
  C(g, 0.0105, 0.055, MAT.dark, 0, y, z);
  for (let i = 0; i < 3; i++) B(g, 0.022, 0.003, 0.03, MAT.black, 0, y + 0.004 - i * 0.004, z - 0.006);
}

// ---------------------------------------------------------------------------
// Magazines
// ---------------------------------------------------------------------------
Object.assign(MAG_BUILDERS, {
  mag_stanag: () => stanagMag(0.19, 0.024, 0.062, 0.6, MAT.dark),
  mag_mp5: () => stanagMag(0.2, 0.022, 0.038, 1.4, MAT.dark),
  mag_glock: () => { const g = boxMag(0.11, 0.022, 0.03, MAT.polymer); B(g, 0.023, 0.06, 0.008, MAT.black, 0, -0.05, 0.012); return g; },
  mag_1911: () => { const g = boxMag(0.1, 0.018, 0.03, MAT.blued); B(g, 0.019, 0.05, 0.006, MAT.black, 0, -0.05, 0.013); return g; },
  mag_m14: () => { const g = stanagMag(0.12, 0.028, 0.072, 0.2, MAT.metal); return g; },
  // 100-round belt box: a squat case with the belt running up into the gun
  box_m249: () => {
    const g = new THREE.Group();
    RB(g, 0.075, 0.11, 0.12, 0.008, MAT.polymer, 0, -0.07, 0);
    B(g, 0.077, 0.012, 0.122, MAT.dark, 0, -0.03, 0);
    B(g, 0.03, 0.03, 0.03, MAT.dark, 0.02, -0.008, 0);
    for (let i = 0; i < 4; i++) { C(g, 0.0035, 0.032, MAT.brass, 0.012, 0.004, -0.015 + i * 0.01, 8).rotation.set(0, Math.PI / 2, 0); }
    B(g, 0.012, 0.02, 0.14, MAT.polymer, 0, -0.13, 0); // carry strap
    return g;
  },
});

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
Object.assign(BUILDERS, {
  // M4A1 carbine: flat-top upper with a rail, flip-up rear sight, A2 front
  // sight tower, ribbed handguard, birdcage, collapsible stock.
  m4a1(g, w) {
    const parts = {}, yb = -0.066;
    // Upper receiver with forward assist and dust cover
    EX(g, [[0.105, -0.028], [0.105, -0.085], [-0.165, -0.085], [-0.165, -0.028]], 0.032, MAT.dark, 0, 0.003);
    rail(g, -0.165, 0.105, -0.02);
    RB(g, 0.012, 0.016, 0.022, 0.004, MAT.dark, 0.02, -0.045, 0.06); // forward assist
    B(g, 0.002, 0.018, 0.06, MAT.black, 0.0165, -0.058, -0.005);    // ejection port
    B(g, 0.0015, 0.016, 0.058, MAT.dark, 0.0175, -0.058, -0.005);   // dust cover
    rearNotch(g, MAT.dark, -0.02);
    // Charging handle (the T at the back of the upper)
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.03, 0.006, 0.012, MAT.dark, 0, -0.026, 0.112);
    B(parts.bolt, 0.016, 0.012, 0.03, MAT.steel, 0.012, -0.058, -0.005); // bolt carrier in the port
    g.add(parts.bolt);
    parts.boltHandle = [0.016, -0.026, 0.112];
    // Barrel, gas block with the A2 front sight tower, handguard
    C(g, 0.0085, 0.38, MAT.blued, 0, yb, -0.35);
    EX(g, [[-0.315, yb - 0.012], [-0.315, -0.018], [-0.33, -0.012], [-0.345, -0.012], [-0.355, -0.018], [-0.355, yb - 0.012]], 0.02, MAT.dark, 0, 0.002);
    frontPost(g, -0.34, -0.012, MAT.dark);
    C(g, 0.0225, 0.15, MAT.polymer, 0, yb, -0.24, 16);
    for (let i = 0; i < 6; i++) C(g, 0.0235, 0.004, MAT.black, 0, yb, -0.18 - i * 0.022, 16);
    C(g, 0.026, 0.012, MAT.dark, 0, yb, -0.164, 16); // delta ring
    C(g, 0.016, 0.01, MAT.dark, 0, yb, -0.318, 16);
    // Lower: magazine well, trigger guard, pistol grip, buffer tube, stock
    RB(g, 0.034, 0.03, 0.22, 0.004, MAT.dark, 0, -0.1, 0.0);
    EX(g, [[-0.07, -0.085], [-0.07, -0.13], [-0.075, -0.15], [0.005, -0.15], [0.01, -0.13], [0.01, -0.085]], 0.036, MAT.dark, 0, 0.003);
    B(g, 0.006, 0.005, 0.07, MAT.dark, 0, -0.128, 0.05);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.118, 0.035, 0.3);
    EX(g, [[0.065, -0.112], [0.1, -0.112], [0.14, -0.2], [0.135, -0.208], [0.105, -0.208], [0.095, -0.2], [0.07, -0.125]], 0.03, MAT.polymer, 0, 0.004);
    // (buffer tube and stock run low, under the cheek: the eye looks over them)
    C(g, 0.015, 0.25, MAT.dark, 0, -0.074, 0.23);
    EX(g, [[0.25, -0.062], [0.37, -0.066], [0.375, -0.072], [0.375, -0.175], [0.36, -0.18], [0.3, -0.125], [0.25, -0.1]], 0.04, MAT.polymer, 0, 0.004);
    RB(g, 0.042, 0.11, 0.014, 0.004, MAT.rubber, 0, -0.122, 0.382);
    B(g, 0.004, 0.012, 0.03, MAT.steel, 0.018, -0.084, 0.2); // stock latch
    rivets(g, 0.018, [[-0.01, -0.105], [0.04, -0.105]], 0.0028);
    rivets(g, -0.018, [[-0.01, -0.105], [0.04, -0.105]], 0.0028);
    if (!w.mods.muzzle) birdcage(g, yb, -0.565);
    parts.magRoot = P(g, 0, -0.105, -0.032);
    parts.magKey = w.mag?.key; parts.magStyle = 'box';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.02, -0.058, -0.005);
    parts.muzzleMount = [0, yb, -0.54];
    parts.gripMount = [0, -0.09, -0.25];
    Object.assign(parts, hands(g, { pos: [0, -0.15, 0.1], rx: -0.4 }, { pos: [-0.004, -0.088, -0.25] }));
    return parts;
  },

  // HK MP5: stamped receiver, cocking tube over the barrel with the handle
  // on the left, drum rear sight, hooded front post, curved magazine.
  mp5(g, w) {
    const parts = {}, yb = -0.05;
    RB(g, 0.036, 0.05, 0.29, 0.006, MAT.dark, 0, -0.045, -0.08);
    for (const sx of [-1, 1]) B(g, 0.002, 0.012, 0.25, MAT.black, sx * 0.0185, -0.035, -0.07); // pressed ribs
    C(g, 0.0115, 0.16, MAT.dark, 0, -0.024, -0.3);       // cocking tube
    RB(g, 0.026, 0.026, 0.03, 0.005, MAT.dark, 0, -0.016, 0.02); // rear sight drum housing
    rearNotch(g, MAT.dark, -0.012);
    C(g, 0.014, 0.022, MAT.dark, 0, -0.006, -0.335, 16, true); // front sight hood
    frontPost(g, -0.335, -0.02, MAT.dark, false);
    C(g, 0.009, 0.2, MAT.blued, 0, yb, -0.32);
    if (!w.mods.muzzle) { C(g, 0.012, 0.03, MAT.dark, 0, yb, -0.43); for (let i = 0; i < 3; i++) B(g, 0.006, 0.006, 0.01, MAT.dark, Math.cos(i * 2.1) * 0.012, yb + Math.sin(i * 2.1) * 0.012, -0.41); }
    // Cocking handle (left) moves with the bolt
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.022, 0.008, 0.008, MAT.dark, -0.022, -0.024, -0.29);
    B(parts.bolt, 0.012, 0.014, 0.03, MAT.steel, 0.012, -0.044, -0.06);
    g.add(parts.bolt);
    parts.boltHandle = [-0.034, -0.024, -0.29];
    // Handguard (slim polymer), magazine well, trigger group, grip, stock
    RB(g, 0.044, 0.046, 0.17, 0.012, MAT.polymer, 0, -0.068, -0.27);
    for (let i = 0; i < 5; i++) B(g, 0.046, 0.003, 0.008, MAT.black, 0, -0.08, -0.21 - i * 0.025);
    RB(g, 0.03, 0.04, 0.06, 0.004, MAT.dark, 0, -0.085, -0.1);
    EX(g, [[-0.04, -0.07], [0.06, -0.07], [0.06, -0.11], [-0.03, -0.11]], 0.034, MAT.polymer, 0, 0.003);
    EX(g, [[0.03, -0.1], [0.065, -0.1], [0.1, -0.185], [0.095, -0.193], [0.068, -0.193], [0.06, -0.185], [0.035, -0.11]], 0.03, MAT.polymer, 0, 0.004);
    B(g, 0.006, 0.005, 0.06, MAT.dark, 0, -0.118, 0.02);
    RB(g, 0.005, 0.018, 0.006, 0.002, MAT.steel, 0, -0.108, 0.01, 0.3);
    EX(g, [[0.065, -0.04], [0.2, -0.058], [0.36, -0.064], [0.365, -0.07], [0.365, -0.16], [0.35, -0.165], [0.22, -0.12], [0.065, -0.09]], 0.04, MAT.polymer, 0, 0.004);
    RB(g, 0.042, 0.1, 0.012, 0.004, MAT.rubber, 0, -0.115, 0.37);
    parts.magRoot = P(g, 0, -0.072, -0.1);
    parts.magKey = w.mag?.key; parts.magStyle = 'box';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.02, -0.04, -0.06);
    parts.muzzleMount = [0, yb, -0.42];
    parts.gripMount = [0, -0.092, -0.27];
    Object.assign(parts, hands(g, { pos: [0, -0.135, 0.05], rx: -0.4 }, { pos: [-0.004, -0.09, -0.26] }));
    return parts;
  },

  // Glock 17: squared polymer frame and slide, 17-round magazine
  glock17(g, w) {
    const parts = {};
    parts.slide = new THREE.Group();
    RB(parts.slide, 0.025, 0.028, 0.19, 0.004, MAT.dark, 0, -0.018, -0.088);
    B(parts.slide, 0.007, 0.007, 0.006, MAT.dark, -0.0065, -0.0035, 0.0);
    B(parts.slide, 0.007, 0.007, 0.006, MAT.dark, 0.0065, -0.0035, 0.0);
    B(parts.slide, 0.003, 0.007, 0.006, MAT.white, 0, -0.0035, -0.172);
    for (let i = 0; i < 6; i++) B(parts.slide, 0.026, 0.02, 0.0025, MAT.black, 0, -0.019, -0.006 - i * 0.005);
    B(parts.slide, 0.002, 0.01, 0.022, MAT.black, 0.013, -0.012, -0.06);
    g.add(parts.slide);
    RB(g, 0.024, 0.02, 0.17, 0.004, MAT.polymer, 0, -0.042, -0.078);
    C(g, 0.0055, 0.004, MAT.black, 0, -0.018, -0.182, 10);
    EX(g, [[-0.035, -0.052], [0.002, -0.052], [0.006, -0.075], [-0.006, -0.082], [-0.042, -0.082], [-0.045, -0.06]], 0.006, MAT.polymer, 0, 0.001);
    RB(g, 0.004, 0.016, 0.006, 0.002, MAT.black, 0, -0.064, -0.022, 0.2);
    EX(g, [[-0.008, -0.05], [0.028, -0.05], [0.052, -0.14], [0.046, -0.148], [0.012, -0.15], [0.0, -0.14], [0.004, -0.11], [-0.004, -0.095], [-0.012, -0.06]], 0.03, MAT.polymer, 0, 0.003);
    for (let i = 0; i < 4; i++) B(g, 0.032, 0.012, 0.003, MAT.black, 0, -0.07 - i * 0.018, 0.03 + i * 0.006, 0.4);
    parts.magRoot = P(g, 0, -0.046, 0.022); parts.magRoot.rotation.x = -0.28;
    parts.magKey = w.mag?.key; parts.magStyle = 'heel';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.016, -0.012, -0.05);
    parts.muzzleMount = [0, -0.018, -0.184];
    pistolHands(g, parts, -0.28);
    return parts;
  },

  // M1911A1: blued slide with rear serrations, exposed hammer, grip safety,
  // checkered wood grips
  m1911(g, w) {
    const parts = {};
    parts.slide = new THREE.Group();
    RB(parts.slide, 0.022, 0.026, 0.21, 0.003, MAT.blued, 0, -0.017, -0.098);
    B(parts.slide, 0.007, 0.006, 0.006, MAT.blued, -0.0062, -0.003, 0.0);
    B(parts.slide, 0.007, 0.006, 0.006, MAT.blued, 0.0062, -0.003, 0.0);
    B(parts.slide, 0.003, 0.006, 0.008, MAT.blued, 0, -0.003, -0.192);
    for (let i = 0; i < 7; i++) B(parts.slide, 0.023, 0.018, 0.0025, MAT.dark, 0, -0.018, -0.006 - i * 0.005);
    B(parts.slide, 0.002, 0.009, 0.02, MAT.black, 0.0118, -0.012, -0.07);
    g.add(parts.slide);
    RB(g, 0.022, 0.018, 0.19, 0.003, MAT.blued, 0, -0.038, -0.09);
    C(g, 0.0062, 0.006, MAT.black, 0, -0.017, -0.205, 10);
    EX(g, [[-0.035, -0.046], [0.0, -0.046], [0.004, -0.07], [-0.008, -0.076], [-0.04, -0.076], [-0.044, -0.055]], 0.004, MAT.blued, 0, 0.001);
    RB(g, 0.004, 0.015, 0.006, 0.002, MAT.steel, 0, -0.058, -0.022, 0.15);
    RB(g, 0.008, 0.016, 0.012, 0.003, MAT.blued, 0, -0.009, 0.012); // hammer
    EX(g, [[-0.006, -0.046], [0.026, -0.046], [0.05, -0.135], [0.046, -0.142], [0.012, -0.144], [0.0, -0.134], [-0.012, -0.056]], 0.024, MAT.blued, 0, 0.002);
    for (const sx of [-1, 1]) {
      const pnl = RB(g, 0.004, 0.07, 0.03, 0.002, MAT.woodRed, sx * 0.0135, -0.09, 0.022); pnl.rotation.x = 0.27;
      C(g, 0.003, 0.002, MAT.steel, sx * 0.0158, -0.07, 0.016, 8).rotation.set(0, Math.PI / 2, 0);
    }
    B(g, 0.016, 0.03, 0.008, MAT.blued, 0, -0.06, 0.035, 0.3); // grip safety
    parts.magRoot = P(g, 0, -0.044, 0.024); parts.magRoot.rotation.x = -0.27;
    parts.magKey = w.mag?.key; parts.magStyle = 'heel';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.014, -0.012, -0.06);
    parts.muzzleMount = [0, -0.017, -0.208];
    pistolHands(g, parts, -0.27);
    return parts;
  },

  // M14: walnut stock, operating rod handle on the right, aperture rear
  // sight, winged front post, flash suppressor, 20-round box magazine
  m14(g, w) {
    const parts = {}, yb = -0.052;
    EX(g, [[0.15, -0.072], [0.3, -0.088], [0.5, -0.094], [0.505, -0.1], [0.505, -0.2], [0.49, -0.206], [0.32, -0.15], [0.2, -0.134], [0.15, -0.114]], 0.046, MAT.wood, 0, 0.004);
    EX(g, [[0.15, -0.062], [0.15, -0.115], [0.08, -0.118], [-0.02, -0.1], [-0.4, -0.086], [-0.415, -0.074], [-0.405, -0.058], [-0.02, -0.066]], 0.05, MAT.wood, 0, 0.004);
    RB(g, 0.048, 0.11, 0.01, 0.003, MAT.metal, 0, -0.152, 0.51); // butt plate
    RB(g, 0.042, 0.03, 0.24, 0.006, MAT.blued, 0, -0.046, 0.04); // receiver
    RB(g, 0.032, 0.012, 0.18, 0.006, MAT.blued, 0, -0.029, 0.05);
    B(g, 0.03, 0.026, 0.026, MAT.blued, 0, -0.03, 0.005);
    rearNotch(g, MAT.blued, -0.018);
    RB(g, 0.036, 0.022, 0.2, 0.007, MAT.woodDark, 0, -0.03, -0.18); // upper handguard
    C(g, 0.009, 0.62, MAT.blued, 0, yb, -0.42);
    C(g, 0.01, 0.3, MAT.metal, 0, -0.072, -0.32); // gas cylinder
    B(g, 0.026, 0.04, 0.02, MAT.metal, 0, -0.06, -0.47);
    frontPost(g, -0.7, -0.014, MAT.blued);
    B(g, 0.024, 0.014, 0.03, MAT.blued, 0, yb + 0.012, -0.7);
    if (!w.mods.muzzle) { C(g, 0.012, 0.06, MAT.blued, 0, yb, -0.76); for (let i = 0; i < 4; i++) B(g, 0.025, 0.003, 0.03, MAT.black, 0, yb, -0.765 + 0.0001 * i, 0, 0, i * 0.8); }
    B(g, 0.006, 0.006, 0.07, MAT.metal, 0, -0.123, 0.09);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.112, 0.1, 0.3);
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.008, 0.012, 0.3, MAT.blued, 0.024, -0.052, -0.1);    // operating rod
    B(parts.bolt, 0.018, 0.014, 0.016, MAT.blued, 0.03, -0.044, 0.06);  // its handle
    g.add(parts.bolt);
    parts.boltHandle = [0.04, -0.044, 0.06];
    parts.magRoot = P(g, 0, -0.11, 0.0);
    parts.magKey = w.mag?.key; parts.magStyle = 'rock';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.025, -0.04, 0.04);
    parts.muzzleMount = [0, yb, -0.73];
    Object.assign(parts, hands(g, { pos: [0, -0.135, 0.17], rx: -0.4 }, { pos: [-0.004, -0.098, -0.25] }));
    return parts;
  },

  // Remington 870: matte receiver, plain barrel with a bead, synthetic
  // stock and ribbed pump, 7-shell tube
  m870(g, w) {
    const parts = {};
    EX(g, [[0.13, -0.01], [0.13, -0.084], [-0.1, -0.084], [-0.1, -0.012], [0.0, -0.008]], 0.046, MAT.dark, 0, 0.004);
    B(g, 0.002, 0.03, 0.07, MAT.black, 0.0232, -0.05, 0.0);
    C(g, 0.012, 0.56, MAT.dark, 0, -0.024, -0.38);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 10, 8), MAT.white);
    bead.position.set(0, -0.0045, -0.655); g.add(bead);
    B(g, 0.004, 0.006, 0.006, MAT.dark, 0, -0.008, -0.655);
    C(g, 0.011, 0.5, MAT.dark, 0, -0.052, -0.34);
    C(g, 0.013, 0.024, MAT.metal, 0, -0.052, -0.59);
    EX(g, [[0.12, -0.03], [0.12, -0.085], [0.2, -0.098], [0.46, -0.125], [0.465, -0.13], [0.465, -0.21], [0.45, -0.215], [0.3, -0.16], [0.17, -0.14], [0.13, -0.11]], 0.042, MAT.polymer, 0, 0.004);
    RB(g, 0.044, 0.085, 0.014, 0.004, MAT.rubber, 0, -0.172, 0.47);
    B(g, 0.006, 0.006, 0.07, MAT.dark, 0, -0.096, 0.06);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.088, 0.07, 0.3);
    B(g, 0.004, 0.012, 0.03, MAT.steel, 0.0245, -0.05, 0.06); // safety
    parts.pump = new THREE.Group();
    RB(parts.pump, 0.052, 0.044, 0.19, 0.012, MAT.polymer, 0, -0.052, -0.27);
    for (let i = 0; i < 9; i++) B(parts.pump, 0.054, 0.004, 0.005, MAT.black, 0, -0.072, -0.19 - i * 0.018);
    g.add(parts.pump);
    parts.port = P(g, 0, -0.085, 0.0);
    parts.eject = P(g, 0.026, -0.04, 0.0);
    parts.muzzleMount = null;
    parts.gripMount = [0, -0.086, -0.27];
    parts.gripParent = parts.pump;
    const h = hands(g, { pos: [0, -0.11, 0.13], rx: -0.3 }, { pos: [-0.004, -0.072, -0.27] });
    g.remove(h.handL); parts.pump.add(h.handL);
    Object.assign(parts, h);
    return parts;
  },

  // M249 SAW: boxy receiver, feed tray cover with a rail, heavy barrel with a
  // heat shield and carry handle, folded bipod, 100-round belt box
  m249(g, w) {
    const parts = {}, yb = -0.075;
    RB(g, 0.07, 0.085, 0.36, 0.008, MAT.dark, 0, -0.07, 0.04);
    RB(g, 0.064, 0.022, 0.22, 0.006, MAT.dark, 0, -0.021, 0.03); // feed tray cover
    rail(g, -0.07, 0.12, -0.01, 0.024);
    rearNotch(g, MAT.dark, -0.01);
    B(g, 0.03, 0.03, 0.04, MAT.black, -0.045, -0.05, -0.02); // feed port (left)
    C(g, 0.013, 0.44, MAT.blued, 0, yb, -0.36);
    EX(g, [[-0.16, yb + 0.012], [-0.16, yb + 0.03], [-0.5, yb + 0.03], [-0.5, yb + 0.012]], 0.04, MAT.dark, 0, 0.004); // heat shield
    for (let i = 0; i < 6; i++) B(g, 0.042, 0.004, 0.012, MAT.black, 0, yb + 0.03, -0.2 - i * 0.05);
    B(g, 0.01, 0.06, 0.012, MAT.dark, 0, yb + 0.06, -0.2); // carry handle
    B(g, 0.01, 0.012, 0.12, MAT.dark, 0, yb + 0.09, -0.25);
    B(g, 0.01, 0.06, 0.012, MAT.dark, 0, yb + 0.06, -0.3);
    frontPost(g, -0.56, yb + 0.01, MAT.dark);
    B(g, 0.022, 0.03, 0.03, MAT.dark, 0, yb + 0.005, -0.56);
    C(g, 0.009, 0.32, MAT.dark, 0, yb - 0.032, -0.3); // gas tube
    for (const sx of [-1, 1]) B(g, 0.01, 0.01, 0.28, MAT.metal, sx * 0.012, yb - 0.048, -0.36); // folded bipod legs
    if (!w.mods.muzzle) birdcage(g, yb, -0.6);
    RB(g, 0.05, 0.05, 0.16, 0.01, MAT.polymer, 0, -0.118, -0.22); // forward handguard
    EX(g, [[0.12, -0.11], [0.16, -0.11], [0.2, -0.2], [0.195, -0.208], [0.165, -0.208], [0.155, -0.2], [0.125, -0.12]], 0.032, MAT.polymer, 0, 0.004);
    B(g, 0.006, 0.005, 0.07, MAT.dark, 0, -0.132, 0.1);
    RB(g, 0.005, 0.02, 0.006, 0.002, MAT.steel, 0, -0.122, 0.11, 0.3);
    EX(g, [[0.22, -0.04], [0.52, -0.06], [0.525, -0.066], [0.525, -0.17], [0.51, -0.176], [0.38, -0.13], [0.22, -0.105]], 0.044, MAT.polymer, 0, 0.004);
    RB(g, 0.046, 0.11, 0.014, 0.004, MAT.rubber, 0, -0.118, 0.531);
    parts.bolt = new THREE.Group();
    B(parts.bolt, 0.012, 0.016, 0.03, MAT.steel, 0.042, -0.07, -0.05); // charging handle (right)
    g.add(parts.bolt);
    parts.boltHandle = [0.05, -0.07, -0.05];
    parts.magRoot = P(g, -0.02, -0.112, 0.0);
    parts.magKey = w.mag?.key; parts.magStyle = 'box';
    if (w.mag) { parts.mag = MAG_BUILDERS[w.mag.key](); parts.magRoot.add(parts.mag); }
    parts.eject = P(g, 0.0, -0.11, 0.06);
    parts.muzzleMount = [0, yb, -0.575];
    parts.gripMount = [0, -0.14, -0.22];
    Object.assign(parts, hands(g, { pos: [0, -0.15, 0.16], rx: -0.4 }, { pos: [-0.004, -0.14, -0.22] }));
    return parts;
  },
});

// Two-handed pistol grip (as on the PM)
function pistolHands(g, parts, rx) {
  const R = hand('grip', [0.25, -0.9, 0.35], 1);
  R.position.set(0, -0.088, 0.02); R.rotation.x = rx;
  g.add(R);
  const L = hand('grip', [-0.3, -0.9, 0.3], -1);
  L.position.set(-0.014, -0.098, 0.008); L.rotation.set(rx, 0, -0.15);
  g.add(L);
  parts.handR = R; parts.handL = L;
}
