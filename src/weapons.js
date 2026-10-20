// Tarkov-style firearms: detailed procedural weapon models with aligned
// iron sights, attachments (reflex sights, PIP scopes, muzzle devices,
// foregrips), detachable magazines + chambered rounds, procedural
// animations, and aiming physics (inertia, breathing sway, arm stamina,
// hold breath, spring recoil with camera climb and recovery).
import * as THREE from 'three';
import { ITEMS, makeItem } from './items.js';
import { addItem, removeItem, takeItem } from './inventory.js';
import { sfx } from './audio.js';
import { segBox } from './collision.js';
import { MAT, B, C, P, BUILDERS, buildMag, shellModel, metricUV } from './gunmodels.js';

export const VM_LAYER = 1; // viewmodel layer: drawn by the main camera, hidden from scope cameras

// ---------------------------------------------------------------------------
// Weapon configs. Model space: sight line is the -Z axis at y = 0, with the
// rear sight at the origin, so iron-sight ADS just puts the eye on that line.
// ---------------------------------------------------------------------------
const CFG = {
  ak74: {
    relief: 0.31, hip: [0.125, -0.12, -0.3], adsFov: 62, length: 0.72, ergo: 1.0, weight: 1.0,
    recoil: { v: 0.95, h: 0.38, cam: 0.42 }, accuracy: 0.0012, hipSpread: 0.045,
    reload: 2.5, charge: 0.6, adsSpeed: 7,
    optic: [0, -0.024, 0.12], muzzleZ: -0.58, boltTravel: 0.08, boltLock: false,
  },
  pm: {
    relief: 0.42, hip: [0.12, -0.12, -0.42], adsFov: 66, length: 0.45, ergo: 0.85, weight: 0.55,
    recoil: { v: 0.75, h: 0.32, cam: 0.3 }, accuracy: 0.004, hipSpread: 0.035,
    reload: 2.0, charge: 0.35, adsSpeed: 10,
    muzzleZ: -0.16, boltTravel: 0.035, boltLock: true,
  },
  mp133: {
    relief: 0.3, hip: [0.125, -0.12, -0.32], adsFov: 64, length: 0.82, ergo: 1.05, weight: 1.15,
    recoil: { v: 2.3, h: 0.6, cam: 0.95 }, accuracy: 0.012, hipSpread: 0.06, pelletSpread: 0.045,
    shellTime: 0.55, pumpTime: 0.45, adsSpeed: 6.5,
    optic: [0, -0.008, 0.08], muzzleZ: -0.68,
  },
  sks: {
    relief: 0.33, hip: [0.125, -0.12, -0.3], adsFov: 62, length: 0.8, ergo: 1.05, weight: 1.1,
    recoil: { v: 1.25, h: 0.3, cam: 0.5 }, accuracy: 0.0009, hipSpread: 0.045,
    reload: 2.3, charge: 0.55, adsSpeed: 6.5,
    optic: [0, -0.022, 0.12], muzzleZ: -0.62, boltTravel: 0.09, boltLock: true,
  },
};

// Optic geometry: axis height above its rail mount, eye relief, lens radius.
const OPTIC = {
  sight_reddot: { height: 0.042, relief: 0.2 },
  sight_holo: { height: 0.045, relief: 0.2 },
  scope_pso: { height: 0.058, relief: 0.075, lens: 0.017 },
  scope_6x: { height: 0.052, relief: 0.085, lens: 0.017 },
};

// ---------------------------------------------------------------------------
// Reticle textures
// ---------------------------------------------------------------------------
const reticleCache = {};
function reticleTexture(kind) {
  if (reticleCache[kind]) return reticleCache[kind];
  const S = kind === 'pso' || kind === 'duplex' ? 512 : 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const m = S / 2;
  if (kind === 'dot') {
    // Bright core with a soft glow around it.
    const grd = g.createRadialGradient(m, m, m * 0.12, m, m, m * 0.4);
    grd.addColorStop(0, 'rgba(255,40,30,0.8)'); grd.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(m, m, m * 0.4, 0, 7); g.fill();
    g.fillStyle = 'rgb(255,70,50)'; g.beginPath(); g.arc(m, m, m * 0.14, 0, 7); g.fill();
  } else if (kind === 'holo') {
    g.strokeStyle = 'rgba(255,40,30,0.95)'; g.lineWidth = S * 0.025;
    g.shadowColor = 'red'; g.shadowBlur = 6;
    g.beginPath(); g.arc(m, m, S * 0.4, 0, 7); g.stroke();
    g.fillStyle = 'rgba(255,70,50,1)'; g.beginPath(); g.arc(m, m, S * 0.025, 0, 7); g.fill();
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      g.beginPath(); g.moveTo(m + Math.cos(a) * S * 0.4, m + Math.sin(a) * S * 0.4); g.lineTo(m + Math.cos(a) * S * 0.46, m + Math.sin(a) * S * 0.46); g.stroke();
    }
  } else if (kind === 'pso') {
    g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = 3;
    const chev = (y, s) => { g.beginPath(); g.moveTo(m - s, y + s * 1.4); g.lineTo(m, y); g.lineTo(m + s, y + s * 1.4); g.stroke(); };
    chev(m, 14);
    for (let i = 1; i <= 3; i++) chev(m + i * 34, 9);
    g.beginPath(); g.moveTo(m - 230, m); g.lineTo(m - 40, m); g.moveTo(m + 40, m); g.lineTo(m + 230, m); g.stroke();
    for (let i = 1; i <= 10; i++) { const x = 18 * i; g.beginPath(); g.moveTo(m - 40 - x, m - (i % 5 ? 5 : 10)); g.lineTo(m - 40 - x, m); g.moveTo(m + 40 + x, m - (i % 5 ? 5 : 10)); g.lineTo(m + 40 + x, m); g.stroke(); }
    // stadiametric rangefinder curve (bottom left)
    g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 30; i++) { const x = m - 200 + i * 5; const y = m + 150 - 3000 / (x - (m - 260)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.beginPath(); g.moveTo(m - 200, m + 150); g.lineTo(m - 50, m + 150); g.stroke();
    g.font = 'bold 16px monospace'; for (const [t, x] of [['2', -190], ['4', -140], ['6', -100], ['10', -60]]) g.fillText(t, m + x, m + 175);
  } else if (kind === 'duplex') {
    g.fillStyle = '#000';
    const t = 10, gap = 70;
    g.fillRect(0, m - t / 2, m - gap, t); g.fillRect(m + gap, m - t / 2, m - gap, t);
    g.fillRect(m - t / 2, 0, t, m - gap); g.fillRect(m - t / 2, m + gap, t, m - gap);
    g.fillRect(m - gap, m - 1, gap * 2, 2); g.fillRect(m - 1, m - gap, 2, gap * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  reticleCache[kind] = tex;
  return tex;
}

let flashTex = null;
function muzzleFlashTexture() {
  if (flashTex) return flashTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.25, 'rgba(255,190,90,0.9)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 62; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.fill();
  flashTex = new THREE.CanvasTexture(c);
  flashTex.colorSpace = THREE.SRGBColorSpace;
  return flashTex;
}

// Optics (origin = rear glass / eyepiece on the sight axis).
function buildOptic(key, gunCfg) {
  const def = ITEMS[key], o = OPTIC[key];
  const g = new THREE.Group();
  const res = { group: g, def, o };
  if (def.optic === 'reflex') {
    // Rail mount below the axis
    B(g, 0.024, o.height - 0.012, 0.045, MAT.dark, 0, -(o.height) / 2 - 0.006, -0.025);
    const glassMat = new THREE.MeshBasicMaterial({
      color: 0x88aaff, transparent: true, opacity: 0.1, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    });
    let glass;
    if (def.reticle === 'dot') {
      C(g, 0.017, 0.045, MAT.dark, 0, 0, -0.025, 20, true); // hollow tube
      glass = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 24), glassMat);
      glass.position.z = -0.03;
    } else {
      B(g, 0.004, 0.034, 0.05, MAT.dark, -0.021, 0.0, -0.03); // window frame sides
      B(g, 0.004, 0.034, 0.05, MAT.dark, 0.021, 0.0, -0.03);
      B(g, 0.046, 0.004, 0.05, MAT.dark, 0, 0.018, -0.03);
      B(g, 0.046, 0.01, 0.07, MAT.dark, 0, -0.02, -0.035);
      glass = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.032), glassMat);
      glass.position.z = -0.05;
    }
    glass.renderOrder = 50;
    g.add(glass);
    // Reticle projected "at infinity": a plane far ahead along the sight's
    // axis, only drawn where the glass wrote the stencil.
    const size = def.reticle === 'dot' ? 0.7 : 1.6;
    const ret = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map: reticleTexture(def.reticle), transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
    }));
    ret.position.z = -30;
    ret.renderOrder = 51;
    ret.frustumCulled = false;
    g.add(ret);
  } else {
    // Telescopic sight: tube, bells, turrets, mount, PIP eyepiece lens.
    const len = key === 'scope_6x' ? 0.3 : 0.24;
    C(g, 0.015, len, MAT.dark, 0, 0, -len / 2 - 0.02);
    C(g, 0.021, 0.05, MAT.dark, 0, 0, -0.025); // eyepiece bell
    C(g, 0.024, 0.06, MAT.dark, 0, 0, -len - 0.02); // objective bell
    B(g, 0.016, 0.022, 0.018, MAT.dark, 0, 0.022, -len / 2 - 0.02); // elevation turret
    B(g, 0.022, 0.016, 0.018, MAT.dark, 0.022, 0, -len / 2 - 0.02); // windage turret
    B(g, 0.022, o.height - 0.012, 0.09, MAT.metal, 0, -o.height / 2 - 0.006, -len / 2 - 0.02); // mount
    const lensMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null }, reticle: { value: reticleTexture(def.reticle) },
        eyeOff: { value: new THREE.Vector2() }, bright: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D map; uniform sampler2D reticle; uniform vec2 eyeOff; uniform float bright;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - 0.5 - eyeOff;
          float vig = smoothstep(0.5, 0.36, length(d));
          vec3 col = texture2D(map, vUv).rgb;
          vec4 ret = texture2D(reticle, vUv);
          col = mix(col, ret.rgb, ret.a);
          col *= vig * bright;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(o.lens, 32), lensMat);
    lens.position.z = 0.002;
    g.add(lens);
    res.lens = lens;
    // Field of view inside the scope: the lens's apparent size divided by zoom.
    res.fov = THREE.MathUtils.radToDeg(2 * Math.atan(o.lens / o.relief)) / def.zoom;
  }
  return res;
}

function buildMuzzle(key, parent, at) {
  const g = new THREE.Group();
  g.position.set(...at);
  let len;
  if (key === 'brake_ak') { len = 0.07; C(g, 0.013, len, MAT.metal, 0, 0, -len / 2); B(g, 0.03, 0.006, 0.02, MAT.dark, 0, 0.01, -0.03); }
  else { len = key === 'supp_pm' ? 0.12 : 0.18; C(g, key === 'supp_pm' ? 0.014 : 0.02, len, MAT.dark, 0, 0, -len / 2, 18); }
  parent.add(g);
  return -len;
}

// Build the full weapon model for a weapon item (with mods and magazine).
export function buildWeaponModel(w) {
  const cfg = CFG[w.key];
  const model = new THREE.Group();
  const parts = BUILDERS[w.key](model, w);
  // Muzzle device
  let muzzleZ = cfg.muzzleZ;
  let muzzleY = parts.muzzleMount ? parts.muzzleMount[1] : -0.025;
  if (w.mods.muzzle && parts.muzzleMount) muzzleZ = parts.muzzleMount[2] + buildMuzzle(w.mods.muzzle.key, model, parts.muzzleMount);
  parts.muzzle = P(model, 0, muzzleY, muzzleZ - 0.01);
  // Muzzle flash (two crossed additive planes)
  const flashMat = new THREE.MeshBasicMaterial({ map: muzzleFlashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flash = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), flashMat); flash.add(f1);
  const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.24), flashMat); f2.rotation.y = Math.PI / 2; f2.position.z = -0.08; flash.add(f2);
  flash.visible = false;
  parts.muzzle.add(flash);
  parts.flash = flash;
  // Foregrip
  if (w.mods.grip && parts.gripMount) {
    const gp = parts.gripParent || model;
    const [x, y, z] = parts.gripMount;
    B(gp, 0.026, 0.012, 0.06, MAT.dark, x, y + 0.008, z);
    B(gp, 0.024, 0.075, 0.028, MAT.polymer, x, y - 0.035, z, 0.1);
    if (parts.handL) parts.handL.position.set(x, y - 0.03, z + 0.01);
  }
  // Optic: sight axis moves up to the optic, so ADS aligns with it.
  let sight = { y: 0, z: 0, relief: cfg.relief };
  if (w.mods.optic && cfg.optic) {
    const op = buildOptic(w.mods.optic.key, cfg);
    const [ox, oy, oz] = cfg.optic;
    op.group.position.set(ox, oy + op.o.height, oz);
    model.add(op.group);
    parts.optic = op;
    sight = { y: oy + op.o.height, z: oz, relief: op.o.relief };
  }
  parts.sight = sight;
  model.traverse((o) => {
    o.layers.set(VM_LAYER);
    if (!o.isMesh) return;
    o.castShadow = false; o.receiveShadow = false;
    if (o.material.isMeshStandardMaterial && !o.geometry.userData.uvDone) { metricUV(o.geometry); o.geometry.userData.uvDone = true; }
  });
  return { model, parts, cfg };
}

// ---------------------------------------------------------------------------
// Item helpers (used by inventory / player)
// ---------------------------------------------------------------------------
export function weaponCapacity(w) {
  const def = ITEMS[w.key];
  return def.tube || (w.mag ? ITEMS[w.mag.key].cap : 0);
}

export function weaponRounds(w) {
  return (w.chamber || 0) + (ITEMS[w.key].tube ? w.tube || 0 : w.mag?.rounds || 0);
}

function modMul(w, prop) {
  let m = 1;
  for (const it of [...Object.values(w.mods), w.mag]) if (it && ITEMS[it.key][prop]) m *= ITEMS[it.key][prop];
  return m;
}

export function isSuppressed(w) { return !!(w.mods.muzzle && ITEMS[w.mods.muzzle.key].suppress); }

export function fillWeapon(w) {
  const def = ITEMS[w.key];
  if (def.tube) w.tube = def.tube;
  else { if (!w.mag) w.mag = makeItem(def.magKey, { rounds: 0 }); w.mag.rounds = ITEMS[w.mag.key].cap; }
  w.chamber = 1;
}

export function approxText(n, cap) {
  if (cap <= 0) return 'No magazine';
  const f = n / cap;
  if (n <= 0) return 'Empty';
  if (f >= 1) return 'Full';
  if (f > 0.8) return 'Nearly full';
  if (f > 0.55) return 'More than half';
  if (f > 0.4) return 'About half';
  if (f > 0.15) return 'Less than half';
  return 'Almost empty';
}

// Drag-and-drop combinations in the inventory. Returns true if consumed.
export function combineItems(drag, target, ctx) {
  const dd = ITEMS[drag.key], td = ITEMS[target.key];
  const game = ctx.game;
  // Ammo onto a magazine / tube-fed weapon: start loading round by round.
  if (dd.type === 'ammo' && td.type === 'mag' && td.ammo === drag.key) {
    game.startLoading(target, false, drag);
    return true;
  }
  if (dd.type === 'ammo' && td.type === 'weapon' && td.tube && td.ammo === drag.key) {
    game.startLoading(target, false, drag);
    return true;
  }
  // Magazine into a weapon (swaps out the current one).
  if (dd.type === 'mag' && td.type === 'weapon' && dd.fits.includes(target.key)) {
    ctx.detach();
    const old = target.mag;
    target.mag = drag;
    sfx.magIn();
    if (old) stash(old, ctx.src.grid, game, drag);
    return true;
  }
  // Attachment onto a weapon.
  if (['optic', 'muzzle', 'grip'].includes(dd.type) && td.type === 'weapon') {
    if (!dd.fits.includes(target.key)) { game.hud.message(`${dd.name} doesn't fit the ${td.name}`); return true; }
    ctx.detach();
    const old = target.mods[dd.type];
    target.mods[dd.type] = drag;
    sfx.click(1800, 0.2);
    if (old) stash(old, ctx.src.grid, game, drag);
    return true;
  }
  return false;
}

// Put an item back into a grid (preferably where `near` came from), the
// player's inventory, or drop it.
function stash(it, grid, game, near) {
  if (grid && near) { it.x = near.x; it.y = near.y; }
  if (grid && addItem(grid, it)) return;
  if (game.player.ammoGrids().some((g) => addItem(g, it))) return;
  game.dropItem(it);
}

// Context-menu actions for weapons and magazines.
export function weaponActions(it, src, game) {
  const def = ITEMS[it.key];
  const out = [];
  const grid = src.grid;
  // Attachments and magazines: fit them straight onto the weapon in your hands.
  const held = game.profile.equip.weapon;
  if (held && held !== it && ['optic', 'muzzle', 'grip', 'mag'].includes(def.type) && def.fits.includes(held.key)) {
    const verb = def.type === 'mag' ? 'Insert into' : 'Attach to';
    out.push([`${verb} ${ITEMS[held.key].name}`, () => combineItems(it, held, {
      game, src, detach: () => { if (src.grid) removeItem(src.grid, it); else if (src.equip) src.equip[src.slot] = null; },
    })]);
  }
  if (def.type === 'mag') {
    const ammoName = ITEMS[def.ammo].name;
    if (it.rounds < def.cap) out.push([`Load ${ammoName}`, () => game.startLoading(it, false)]);
    if (it.rounds > 0) out.push(['Unload ammo', () => game.startLoading(it, true)]);
  }
  if (def.type === 'weapon') {
    if (def.tube) {
      if ((it.tube || 0) < def.tube) out.push([`Load ${ITEMS[def.ammo].name}`, () => game.startLoading(it, false)]);
      if (it.tube > 0) out.push(['Unload shells', () => game.startLoading(it, true)]);
    }
    if (it.mag) out.push(['Remove magazine', () => { const m = it.mag; it.mag = null; sfx.magOut(); stash(m, grid, game); }]);
    if (it.chamber) out.push(['Unload chamber', () => { it.chamber = 0; stash(makeItem(def.ammo, { count: 1 }), grid, game); sfx.bolt(); }]);
    if (def.auto) out.push([`Fire mode: ${it.mode === 'auto' ? 'switch to semi' : 'switch to auto'}`, () => { it.mode = it.mode === 'auto' ? 'semi' : 'auto'; sfx.click(); }]);
    for (const [slot, m] of Object.entries(it.mods)) {
      if (m) out.push([`Detach ${ITEMS[m.key].name}`, () => { it.mods[slot] = null; stash(m, grid, game); sfx.click(1800, 0.2); }]);
    }
  }
  return out;
}

// One round of a loading / unloading job. Returns false when finished.
export function loadStep(job, game) {
  const it = job.target, def = ITEMS[it.key];
  const ammoKey = def.ammo;
  const cap = def.cap || def.tube;
  const field = def.type === 'mag' ? 'rounds' : 'tube';
  const grids = game.player.ammoGrids();
  if (job.unload) {
    if ((it[field] || 0) <= 0) return false;
    it[field]--;
    const round = makeItem(ammoKey, { count: 1 });
    if (!grids.some((g) => addItem(g, round))) game.dropItem(round);
    sfx.round();
    return it[field] > 0;
  }
  if ((it[field] || 0) >= cap) return false;
  // Prefer the stack that was dragged onto the magazine, then any carried ammo.
  let got = 0;
  const src = job.source;
  if (src && src.count > 0) {
    src.count--; got = 1;
    if (src.count <= 0) for (const g of [...grids, ...game.openGrids()]) removeItem(g, src);
  } else got = takeItem(grids, ammoKey, 1);
  if (!got) { game.hud.message(`Out of ${ITEMS[ammoKey].name}`); return false; }
  it[field] = (it[field] || 0) + 1;
  sfx.round();
  return it[field] < cap;
}

// ---------------------------------------------------------------------------
// Gun controller: aiming physics, animation, firing, reloading, PIP.
// ---------------------------------------------------------------------------
const _scopeEuler = new THREE.Euler();

class Spring {
  constructor() { this.x = 0; this.v = 0; }
  step(dt, k, c, target = 0) { this.v += ((target - this.x) * k - this.v * c) * dt; this.x += this.v * dt; return this.x; }
}

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ARM_MAX = 60;

// Reload phases (seconds when rested). A reload is: reach for the old
// magazine, get it out, stow it (or drop it on a quick reload), fetch the new
// one, maybe fumble it, seat it, slap it home, rack the bolt if the gun was
// empty, and return to the grip. Tired and injured hands are slower.
const RELOAD_STEPS = {
  rifle: { reach: 0.24, out: 0.22, stow: 0.3, drop: 0.12, fetch: 0.32, miss: 0.32, seat: 0.2, slap: 0.1, charge: 0.5, ret: 0.24 },
  pistol: { reach: 0.16, out: 0.14, stow: 0.22, drop: 0.08, fetch: 0.24, miss: 0.26, seat: 0.14, slap: 0.08, charge: 0.24, ret: 0.18 },
};
function reloadTimeline({ pistol, hasOld, quick, fumble, charge, swap = true, k }) {
  const S = RELOAD_STEPS[pistol ? 'pistol' : 'rifle'];
  const ph = {};
  let t = 0;
  const add = (name, d) => { ph[name] = [t, t + d * k]; t += d * k; };
  if (swap) {
    if (hasOld) { add('reach', S.reach); add('out', S.out); }
    add('stow', hasOld && quick ? S.drop : S.stow);
    add('fetch', S.fetch);
    if (fumble) add('miss', S.miss);
    add('seat', S.seat);
    add('slap', S.slap);
  }
  if (charge) add('charge', S.charge);
  add('ret', S.ret);
  return { ph, dur: t };
}
// Where the support hand holds a magazine (relative to the magazine's top)
const HOLD = { rock: new THREE.Vector3(-0.024, -0.08, -0.014), box: new THREE.Vector3(-0.022, -0.05, 0), heel: new THREE.Vector3(-0.004, -0.1, 0.006) };
// Below and behind the gun: the pouch (off screen)
const POUCH = { y: -0.32, x: -0.13, z: 0.14, rx: 0.9 };
const _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);

export class GunController {
  constructor(player) {
    this.p = player;
    this.cond = { tired: 0, hurt: 0, broken: false };
    this.camera = player.camera;
    this.camera.layers.enable(VM_LAYER);
    this.root = new THREE.Group();   // rotated by sway / recoil around the eye
    this.pose = new THREE.Group();   // hip <-> ADS position + animation offsets
    this.root.add(this.pose);
    this.camera.add(this.root);
    this.lagX = new Spring(); this.lagY = new Spring();
    this.momX = new Spring(); this.momZ = new Spring(); // body momentum sway
    this.holdK = 0; // eased hold-breath amount
    this.lastVel = null;
    this.recP = new Spring(); this.recY = new Spring(); this.kick = new Spring();
    this.camDebt = 0;
    this.ads = 0;
    this.armStamina = 100;
    this.holding = false;
    this.time = 0;
    this.anim = null;
    this.fireCd = 0;
    this.boltT = 0;
    this.flashT = 0;
    this.retract = 0;
    this.lastR = -10;
    this.check = { text: '', t: 0 };
    this.sig = '';
    this.offPitch = 0; this.offYaw = 0;
    this.rt = new THREE.WebGLRenderTarget(512, 512);
    this.scopeCam = new THREE.PerspectiveCamera(6, 1, 0.05, 400);
  }

  get w() { return this.p.weapon; }
  get busy() { return !!this.anim && this.anim.type !== 'fire'; }

  signature(w) {
    if (!w) return '';
    return [w.uid, w.mag?.key || '-', ...Object.values(w.mods).map((m) => m?.key || '-')].join('|');
  }

  setVisible(v) { this.root.visible = v; }
  // Lower / raise without the key (e.g. when you start talking to someone)
  lower(v = true) { this.lowered = v; if (v) this.ads = 0; }

  // Rebuild the model if the weapon or its configuration changed.
  rebuild(force) {
    const w = this.w;
    const sig = this.signature(w);
    if (!force && sig === this.sig) return;
    if (this.anim && this.anim.type !== 'draw' && !force && this.sig.split('|')[0] === sig.split('|')[0]) {
      this.pendingRebuild = true; // finish the current animation first
      return;
    }
    const firstDraw = this.sig.split('|')[0] !== sig.split('|')[0];
    this.sig = sig;
    this.pendingRebuild = false;
    if (this.built) this.pose.remove(this.built.model);
    this.built = null;
    if (!w) return;
    this.built = buildWeaponModel(w);
    this.pose.add(this.built.model);
    const s = this.built.parts.sight;
    this.adsPos = new THREE.Vector3(0, -s.y, -(s.z + s.relief));
    this.hipPos = new THREE.Vector3(...this.built.cfg.hip);
    if (firstDraw) { const c = this.cond || { tired: 0, hurt: 0 }; this.play('draw', 0.45 * (1 + 0.4 * c.tired + 0.6 * c.hurt)); }
  }

  play(type, dur, extra = {}) { this.anim = { type, t: 0, dur, events: extra.events || [], ...extra }; }

  // ---------- per-frame update ----------
  update(dt, input, ctx) {
    const w = this.w;
    this.rebuild();
    if (!w || !this.built) return;
    if (this.pendingRebuild && !this.anim) this.rebuild(true);
    const { cfg, parts } = this.built;
    const def = ITEMS[w.key];
    const p = this.p;
    this.time += dt;
    this.fireCd -= dt;

    // --- ergonomics ---
    const ergo = cfg.ergo * modMul(w, 'ergo');
    const weight = cfg.weight / ergo;
    const aimSkill = p.skill.aiming;
    // How tired the body is and how hurt the arms are: drives animation variants
    const armFrac = Math.max(0, Math.min(p.hp.armL, p.hp.armR)) / ARM_MAX;
    this.cond = {
      tired: clamp01(clamp01((40 - p.stamina) / 40) * 0.7 + clamp01((p.fatigue - 65) / 35) * 0.5 + (p.exhausted ? 0.3 : 0) + (p.shiver || 0) * 0.3),
      hurt: clamp01(1 - armFrac) * (p.painkiller > 0 ? 0.4 : 1),
      broken: (p.hp.armL <= 0 || p.hp.armR <= 0) && p.painkiller <= 0,
    };

    // --- weapon collision: pull the gun back when facing a wall ---
    const cam = this.camera.position;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let near = cfg.length;
    for (const b of p.game.world.hash.query(cam.x - 1, cam.z - 1, cam.x + 1, cam.z + 1, [])) {
      if (b.noCollide || (b.h ?? 3) < cam.y - 0.3) continue;
      const t = segBox(cam.x, cam.z, cam.x + fx * cfg.length, cam.z + fz * cfg.length, b);
      if (t >= 0) near = Math.min(near, t * cfg.length);
    }
    const retractTarget = Math.max(0, Math.min(1, (cfg.length - near) / (cfg.length * 0.6)));
    this.retract += (retractTarget - this.retract) * Math.min(1, dt * 10);
    const blocked = this.retract > 0.55;

    // --- lowered weapon (G): pointed at the ground, nobody feels threatened.
    // Aiming or pulling the trigger brings it back up (that click doesn't fire).
    let raising = false;
    if (input.lower && !this.busy) { this.lowered = !this.lowered; if (this.lowered) this.ads = Math.min(this.ads, 0.3); }
    if (this.lowered && (input.firePressed || input.aim)) { this.lowered = false; raising = true; }
    this.lowerK = (this.lowerK || 0) + ((this.lowered ? 1 : 0) - (this.lowerK || 0)) * Math.min(1, dt * 7);
    const down = this.lowerK > 0.15;

    // --- ADS ---
    const canAim = input.aim && !ctx.sprinting && !this.busy && !blocked && !down;
    const adsSpeed = cfg.adsSpeed * (0.8 + 0.2 * ergo) * (1 + 0.04 * aimSkill);
    this.ads += ((canAim ? 1 : 0) - this.ads) * Math.min(1, dt * adsSpeed);

    // --- arm stamina & hold breath ---
    this.holding = canAim && input.sprint && this.armStamina > 1 && this.ads > 0.8;
    if (this.ads > 0.5) this.armStamina -= (this.holding ? 16 : 3.5 * weight) * dt;
    else this.armStamina += 12 * dt;
    this.armStamina = Math.max(0, Math.min(100, this.armStamina));

    // --- sway: inertia from mouse movement (looser at a run) ---
    const sbPrev = this.sprintBlend || 0;
    const loose = 1 + sbPrev * 1.4 + Math.min(1, (ctx.speed || 0) / 4.6) * 0.5 * (1 - this.ads);
    const lagK = 140 / weight, lagC = 16;
    this.lagX.v += -input.mdx * 0.00035 * weight * loose;
    this.lagY.v += -input.mdy * 0.00035 * weight * loose;
    this.lagX.step(dt, lagK, lagC);
    this.lagY.step(dt, lagK, lagC);
    const lagMax = 0.06 + 0.07 * sbPrev;
    this.lagX.x = THREE.MathUtils.clamp(this.lagX.x, -lagMax, lagMax);
    this.lagY.x = THREE.MathUtils.clamp(this.lagY.x, -lagMax, lagMax);

    // --- sway: body momentum. Speeding up, stopping and cutting sideways
    // throw the gun the other way, harder the sharper the change.
    const pv = p.vel;
    if (!this.lastVel) this.lastVel = { x: pv.x, z: pv.z };
    const idt = 1 / Math.max(dt, 1 / 240);
    const axw = (pv.x - this.lastVel.x) * idt, azw = (pv.z - this.lastVel.z) * idt;
    this.lastVel.x = pv.x; this.lastVel.z = pv.z;
    const aR = axw * Math.cos(p.yaw) - azw * Math.sin(p.yaw), aF = -axw * Math.sin(p.yaw) - azw * Math.cos(p.yaw);
    const momGain = 0.0012 * weight * (1 + sbPrev * 1.5) * (1 - this.ads * 0.7);
    this.momX.v += -aR * momGain * 60 * dt;
    this.momZ.v += -aF * momGain * 60 * dt;
    this.momX.step(dt, 70, 9); this.momZ.step(dt, 70, 9);
    this.momX.x = THREE.MathUtils.clamp(this.momX.x, -0.1, 0.1);
    this.momZ.x = THREE.MathUtils.clamp(this.momZ.x, -0.08, 0.08);

    // --- sway: breathing figure-8, worse when tired / moving ---
    let amp = 0.0035 / ergo;
    amp *= 1 + (1 - p.stamina / 100) * 1.6;
    if (this.armStamina < 25) amp *= 1 + (25 - this.armStamina) / 10;
    if (ctx.moving) amp *= 2.2;
    if (p.prone) amp *= 0.45;
    else if (p.crouch) amp *= 0.7;
    if (p.fatigue > 80) amp *= 1.4;
    if (p.shiver) amp *= 1 + p.shiver * 1.6; // shivering with cold
    amp *= 1 + this.cond.hurt * 1.2; // injured arms shake
    amp *= 1 - 0.05 * aimSkill;
    amp *= 1 + (1 - this.ads) * 1.8;
    // Holding breath steadies the gun gradually, and lets go gradually.
    this.holdK += ((this.holding ? 1 : 0) - this.holdK) * Math.min(1, dt * (this.holding ? 4 : 2.5));
    if (this.holding && !this.wasHolding) sfx.inhale();
    if (!this.holding && this.wasHolding) sfx.exhale(this.armStamina < 5);
    this.wasHolding = this.holding;
    amp *= 1 - 0.88 * this.holdK;
    const bt = this.time;
    const breathYaw = amp * Math.sin(bt * 0.9);
    const breathPitch = amp * 0.65 * Math.sin(bt * 1.8 + 0.6);

    // --- recoil springs ---
    this.recP.step(dt, 170, 15);
    this.recY.step(dt, 170, 15);
    this.kick.step(dt, 260, 22);
    // Camera recoil recovers partially (auto-compensation).
    if (this.camDebt > 0) {
      const back = Math.min(this.camDebt, this.camDebt * dt * 5 + 0.0002);
      p.pitch -= back * 0.75;
      this.camDebt -= back;
    }

    // --- final weapon offset relative to the camera ---
    // (bullets follow these: momentum sway pulls your aim too)
    this.offYaw = this.lagX.x + breathYaw + this.recY.x - this.momX.x * 0.5;
    this.offPitch = this.lagY.x + breathPitch + this.recP.x - this.momZ.x * 0.35;

    // Walk bob on the weapon
    const bob = ctx.moving ? (ctx.sprinting ? 1 : 0.5) * (1 - this.ads * 0.85) : 0;
    const bx = Math.sin(p.bob * 0.5) * 0.012 * bob, by = Math.abs(Math.cos(p.bob * 0.5)) * 0.01 * bob;

    this.root.rotation.set(this.offPitch, this.offYaw, -this.lagX.x * 0.6, 'YXZ');

    // --- pose: hip/ADS blend + sprint + retract + animation ---
    const pose = this.pose;
    pose.position.lerpVectors(this.hipPos, this.adsPos, this.ads);
    pose.rotation.set(0, (1 - this.ads) * 0.04, 0);
    pose.position.x += bx; pose.position.y += by;
    const sprintPose = ctx.sprinting ? 1 : 0;
    this.sprintBlend = (this.sprintBlend || 0) + (sprintPose - (this.sprintBlend || 0)) * Math.min(1, dt * 8);
    const sb = this.sprintBlend;
    pose.position.x -= 0.05 * sb; pose.position.y -= 0.06 * sb; pose.position.z += 0.05 * sb;
    pose.rotation.x -= 0.45 * sb; pose.rotation.y += 0.65 * sb; pose.rotation.z += 0.25 * sb;
    pose.position.z += this.retract * 0.18; pose.rotation.x += this.retract * 0.7; pose.position.y -= this.retract * 0.04;
    const lk = this.lowerK || 0;
    pose.position.y -= 0.02 * lk; pose.position.z += 0.02 * lk; pose.position.x -= 0.02 * lk;
    pose.rotation.x -= 0.42 * lk; pose.rotation.y += 0.22 * lk; pose.rotation.z += 0.15 * lk;
    pose.position.z += this.kick.x;
    pose.rotation.x += this.kick.x * 2.2;
    // Momentum: the gun swings out to the side and rolls, lurches forward or back
    pose.position.x += this.momX.x * 0.35; pose.rotation.z += this.momX.x * 2.2; pose.rotation.y -= this.momX.x * 0.6;
    pose.position.z -= this.momZ.x * 0.45; pose.position.y -= Math.abs(this.momZ.x) * 0.2;
    // Tired: the gun sags at the hip and heaves with heavy breathing. Hurt
    // arms: held lower, with a tremor. (Not while aiming: the sights stay true;
    // the extra sway is in the aim itself.)
    const cond = this.cond, hipK = 1 - this.ads;
    if (cond.tired > 0.02) {
      const heave = Math.sin(this.time * (2.2 + 1.6 * cond.tired)) * (0.004 + 0.009 * cond.tired) * cond.tired * hipK;
      pose.position.y += heave - 0.022 * cond.tired * hipK; pose.rotation.x += heave * 0.8 - 0.05 * cond.tired * hipK;
    }
    if (cond.hurt > 0.02) {
      const tremor = (Math.sin(this.time * 31) + Math.sin(this.time * 47 + 1.3)) * 0.5 * 0.007 * cond.hurt * hipK;
      pose.rotation.z += tremor; pose.rotation.x += tremor * 0.6; pose.position.y -= 0.015 * cond.hurt * hipK;
    }

    // Reset animated parts to their rest positions
    if (parts.magRoot) { parts.magRoot.position.y = parts.magRoot.userData.y0 ??= parts.magRoot.position.y; parts.magRoot.position.z = parts.magRoot.userData.z0 ??= parts.magRoot.position.z; parts.magRoot.rotation.x = parts.magRoot.userData.rx0 ??= parts.magRoot.rotation.x; parts.magRoot.visible = true; }
    if (parts.handL) {
      parts.handL.userData.p0 ??= parts.handL.position.clone(); parts.handL.position.copy(parts.handL.userData.p0);
      parts.handL.userData.r0 ??= parts.handL.rotation.clone(); parts.handL.rotation.copy(parts.handL.userData.r0);
    }
    if (parts.bolt) parts.bolt.position.z = cfg.boltLock && !w.chamber && (!w.mag || w.mag.rounds === 0) ? cfg.boltTravel : 0;
    if (parts.slide) parts.slide.position.z = (cfg.boltLock && !w.chamber && w.mag && w.mag.rounds === 0) || (cfg.boltLock && !w.chamber && !w.mag) ? cfg.boltTravel : 0;
    if (parts.pump) parts.pump.position.z = 0;

    // Bolt/slide cycling after each shot
    if (this.boltT > 0) {
      this.boltT = Math.max(0, this.boltT - dt * 14);
      const travel = Math.sin(this.boltT * Math.PI) * (cfg.boltTravel || 0);
      if (parts.bolt) parts.bolt.position.z = travel;
      if (parts.slide) parts.slide.position.z = Math.max(parts.slide.position.z, travel);
    }

    this.updateAnim(dt, w, def, cfg, parts, input);
    for (const H of [parts.handL, parts.handR]) if (H) this.aimArm(H);

    // Muzzle flash
    this.flashT -= dt;
    parts.flash.visible = this.flashT > 0;
    if (parts.flash.visible) { parts.flash.rotation.z = Math.random() * 6; parts.flash.scale.setScalar(0.7 + Math.random() * 0.6); }

    // --- input: fire mode, mag check, reload, trigger ---
    if (input.fireMode && def.auto && !this.busy) {
      w.mode = w.mode === 'auto' ? 'semi' : 'auto';
      sfx.click(); this.play('mode', 0.25);
      p.game.hud.message(`Fire mode: ${w.mode.toUpperCase()}`, 1.5);
    }
    if (input.check && !this.busy) this.play('check', 1.1, { events: [{ at: 0.55, fn: () => this.showCheck() }] });
    if (input.reload && !ctx.sprinting) {
      const quick = this.time - this.lastR < 0.35;
      this.lastR = this.time;
      if (def.tube) this.startShellReload();
      else if (quick && this.anim?.type === 'reload' && !this.anim.quick) { if (this.quickReload()) p.game.hud.message('Quick reload — dropping the magazine', 1.5); }
      else if (!this.busy) this.startMagReload();
    }
    // Firing interrupts shell loading
    if (input.firePressed && this.anim?.type === 'shell') this.shellStop = true;
    // Buffer a semi-auto press made just before the gun is ready again.
    if (input.firePressed && this.fireCd > 0 && this.fireCd < 0.15) this.queuedShot = true;
    let trigger = w.mode === 'auto' ? input.fire : input.firePressed;
    if (this.queuedShot && this.fireCd <= 0) { trigger = true; this.queuedShot = false; }
    if (trigger && !this.busy && !blocked && !down && !raising && sb < 0.3 && this.fireCd <= 0) this.fire(w, def, cfg, ctx);
    if (this.check.t > 0) this.check.t -= dt;
  }

  // ---------- animation ----------
  updateAnim(dt, w, def, cfg, parts, input) {
    const a = this.anim;
    if (!a) return;
    if (a.type === 'reload') return this.updateReload(dt, a, w, cfg, parts);
    a.t += dt / a.dur;
    const t = Math.min(1, a.t);
    for (const e of a.events) if (!e.done && t >= e.at) { e.done = true; e.fn(); }
    const pose = this.pose;
    const L = parts.handL, L0 = L?.userData.p0;
    if (a.type === 'draw') {
      const k = 1 - sstep(0, 1, t);
      pose.position.y -= 0.25 * k; pose.rotation.x -= 0.9 * k; pose.rotation.z += 0.3 * k;
    } else if (a.type === 'mode') {
      pose.rotation.z += Math.sin(t * Math.PI) * 0.12;
    } else if (a.type === 'check') {
      const k = bump(0, 0.25, 0.75, 1, t);
      pose.rotation.z -= 0.55 * k; pose.rotation.x += 0.25 * k; pose.position.x -= 0.05 * k; pose.position.y += 0.02 * k;
      if (parts.magRoot && w.mag) parts.magRoot.position.y -= 0.03 * bump(0.25, 0.4, 0.6, 0.75, t);
      if (def.tube && parts.pump) parts.pump.position.z += 0.03 * bump(0.25, 0.4, 0.6, 0.75, t);
      if (L && w.mag) L.position.lerpVectors(L0, parts.magRoot.position.clone().add(new THREE.Vector3(-0.02, -0.06, 0)), bump(0.1, 0.25, 0.75, 0.9, t));
    } else if (a.type === 'shell') {
      // A shell in the fingers, pushed up into the loading port
      if (L && !a.shellMesh) { a.shellMesh = shellModel(); a.shellMesh.position.set(0.012, 0.022, -0.03); a.shellMesh.rotation.x = -0.4; a.shellMesh.traverse((o) => o.layers.set(VM_LAYER)); L.add(a.shellMesh); }
      if (a.shellMesh) a.shellMesh.visible = t > 0.08 && t < 0.7;
      const tilt = Math.min(1, a.loops > 0 ? 1 : sstep(0, 0.25, t));
      // up and canted so the loading port under the receiver faces you
      pose.position.y += 0.08 * tilt; pose.position.x -= 0.04 * tilt; pose.position.z += 0.02 * tilt;
      pose.rotation.z -= 0.85 * tilt; pose.rotation.x += 0.05 * tilt; pose.rotation.y -= 0.25 * tilt;
      if (L) {
        // left hand leaves the pump, pushes a shell into the port
        const port = parts.port.position.clone().sub(parts.pump.position).add(new THREE.Vector3(-0.01, -0.03, 0.02));
        L.position.lerpVectors(L0, port, bump(0.1, 0.4, 0.75, 0.95, t));
        L.position.y -= 0.06 * bump(0.0, 0.15, 0.3, 0.45, t);
      }
    } else if (a.type === 'pump') {
      if (parts.pump) parts.pump.position.z = 0.085 * bump(0, 0.4, 0.55, 1, t);
      pose.rotation.x += 0.05 * bump(0, 0.4, 0.55, 1, t);
    }
    if (a.t >= 1) {
      const done = this.anim;
      this.anim = null;
      done.shellMesh?.parent?.remove(done.shellMesh);
      done.onDone?.();
    }
  }

  // Forearms always run down and back out of the bottom of the screen, even
  // when the gun is canted or the hand is off working the magazine.
  aimArm(H) {
    const arm = H.userData.arm;
    if (!arm) return;
    _q.identity();
    for (let o = H; o && o !== this.camera; o = o.parent) _q.premultiply(o.quaternion);
    _a.copy(H.userData.armDir).applyQuaternion(_q.invert());
    arm.quaternion.setFromUnitVectors(_Z, _a.normalize());
  }

  // ---------- magazine reload (timeline in seconds) ----------
  updateReload(dt, a, w, cfg, parts) {
    a.time += dt;
    const tl = a.tl, ph = tl.ph, T = a.time;
    a.t = T / tl.dur;
    for (const e of a.events) if (!e.done && T >= e.at()) { e.done = true; e.fn(); }
    // progress through a phase (0 before it starts, 1 once it's over)
    const k = (n) => (ph[n] ? sstep(ph[n][0], ph[n][1], T) : (n === 'reach' || n === 'out' ? 1 : 0));
    const inP = (n) => !!ph[n] && T >= ph[n][0] && T < ph[n][1];
    const after = (n) => !!ph[n] && T >= ph[n][1];
    const pose = this.pose, L = parts.handL, L0 = L?.userData.p0, style = parts.magStyle || 'box', pistol = style === 'heel';
    const c = a.cond;
    // Shaky hands: a tremor on everything the hand holds, stronger when tired or hurt
    const shake = (0.0015 + 0.004 * c.tired + 0.008 * c.hurt) * (inP('fetch') || inP('seat') || inP('miss') ? 1 : 0.4);
    const tr = (f) => shake * (Math.sin(T * f) + Math.sin(T * f * 1.73 + 2)) * 0.5;

    // --- the gun: tilted to show the magazine well, back for the bolt, level again
    const swapEnd = ph.slap ? ph.slap[1] : 0;
    const tilt = ph.reach || ph.stow ? sstep(0, 0.18 * a.k, T) * (1 - sstep(swapEnd - 0.05, swapEnd + 0.12, T)) : 0;
    const chg = ph.charge ? bump(ph.charge[0] - 0.08, ph.charge[0] + 0.1, ph.charge[1] - 0.05, ph.charge[1] + 0.12, T) : 0;
    // The gun comes up and in toward the middle of the view so you can watch
    // your hands work the magazine well (at the hip it's below the screen)
    const up = Math.max(tilt, chg * 0.8);
    if (pistol) { pose.position.y += 0.07 * up; pose.position.x -= 0.05 * up; pose.position.z += 0.06 * up; pose.rotation.x += 0.3 * tilt; pose.rotation.z -= 0.25 * tilt; }
    else {
      // canted hard so the magazine well faces you, muzzle off to the right
      pose.position.y += 0.1 * up; pose.position.x -= 0.035 * up; pose.position.z += (cfg.length > 0.75 ? -0.03 : 0.02) * up; // long rifles stay further out
      pose.rotation.z -= 0.95 * tilt; pose.rotation.x += 0.06 * tilt; pose.rotation.y -= 0.3 * up;
    }
    pose.rotation.z += pistol ? 0 : 0.3 * chg; pose.rotation.x += 0.1 * chg;
    const busy = 1 - sstep(tl.dur - 0.2, tl.dur, T);
    pose.position.y -= (0.03 * c.tired + 0.025 * c.hurt) * busy; // arms sag under the weight
    pose.position.y += Math.sin(T * 4.2) * 0.006 * c.tired * busy;  // heavy breathing
    if (ph.slap) pose.position.y += 0.008 * bump(ph.slap[0], ph.slap[0] + 0.03, ph.slap[0] + 0.04, ph.slap[1], T);

    // --- magazines: offsets from the magazine's seat (y, z, rotation x)
    const old = { x: 0, y: 0, z: 0, rx: 0, vis: !!parts.mag };
    if (ph.out) {
      const ko = k('out');
      if (style === 'rock') { const r = sstep(0, 0.5, ko), d = sstep(0.4, 1, ko); old.rx = 0.38 * r; old.z = -0.012 * r; old.y = -0.012 * r - 0.07 * d; }
      else old.y = -(pistol ? 0.085 : 0.075) * ko;
      if (after('out')) {
        if (a.quick) {
          // dropped: it falls away
          const f = T - ph.out[1];
          old.y -= 4.9 * f * f * 0.7; old.rx += f * 5; old.x -= f * 0.15;
          old.vis = f < 0.45;
        } else {
          const ks = k('stow');
          old.x = POUCH.x * ks; old.y += (POUCH.y - old.y) * ks; old.z += (POUCH.z - old.z) * ks; old.rx += (POUCH.rx - old.rx) * ks;
          old.vis = ks < 0.98;
        }
      }
    }
    const nw = { x: POUCH.x, y: POUCH.y, z: POUCH.z, rx: POUCH.rx, vis: !!a.newRoot && T >= (ph.fetch?.[0] ?? 1e9) };
    if (ph.fetch) {
      const pre = style === 'rock' ? { y: -0.065, z: -0.014, rx: 0.36 } : { y: pistol ? -0.08 : -0.07, z: 0, rx: 0 };
      const kf = k('fetch');
      const lerpTo = (o, to, t2) => { o.x += (to.x - o.x) * t2; o.y += (to.y - o.y) * t2; o.z += (to.z - o.z) * t2; o.rx += (to.rx - o.rx) * t2; };
      lerpTo(nw, { x: 0, ...pre }, kf);
      if (ph.miss) {
        // first try misses the well: knocks the edge, backs off, lines up again
        const km = (T - ph.miss[0]) / (ph.miss[1] - ph.miss[0]);
        if (km > 0 && km < 1) {
          const miss = style === 'rock' ? { x: 0, y: -0.014, z: 0.016, rx: 0.12 } : { x: 0.012, y: -0.012, z: 0.006, rx: 0.1 };
          const go = sstep(0, 0.35, km), back = sstep(0.45, 1, km);
          lerpTo(nw, miss, go * (1 - back));
          nw.y -= 0.004 * Math.sin(km * 40) * bump(0.3, 0.35, 0.45, 0.55, km); // the clack
        }
      }
      const ks = k('seat');
      if (style === 'rock') {
        const hook = sstep(0, 0.5, ks), rock = sstep(0.45, 1, ks);
        lerpTo(nw, { x: 0, y: -0.004, z: -0.004, rx: 0.3 }, hook);
        lerpTo(nw, { x: 0, y: 0, z: 0, rx: 0 }, rock);
      } else lerpTo(nw, { x: 0, y: 0, z: 0, rx: 0 }, ks);
      nw.x += tr(41); nw.y += tr(37); nw.z += tr(29);
    }
    // apply
    const rest = a.rest;
    if (parts.magRoot) {
      parts.magRoot.position.set(rest.x + old.x, rest.y + old.y, rest.z + old.z);
      parts.magRoot.rotation.x = rest.rx + old.rx;
      parts.magRoot.visible = old.vis && !(ph.fetch && T >= ph.fetch[0] && !ph.out); // no old mag to show
    }
    if (a.newRoot) {
      a.newRoot.visible = nw.vis;
      a.newRoot.position.set(rest.x + nw.x, rest.y + nw.y, rest.z + nw.z);
      a.newRoot.rotation.x = rest.rx + nw.rx;
    }

    // --- the support hand
    if (L) {
      const hold = (m) => _v.copy(HOLD[style]).applyEuler(_e.set(rest.rx + m.rx, 0, 0)).add(new THREE.Vector3(rest.x + m.x, rest.y + m.y, rest.z + m.z));
      let pos = L0.clone(), rx = 0, rz = 0;
      const grip = 0.45, roll = pistol ? 0 : -0.5;
      if (ph.reach && T < ph.reach[1]) { const kr = k('reach'); pos.lerp(hold(old), kr); rx = grip * kr; rz = roll * kr; }
      else if (ph.out && T < ph.out[1]) { pos.copy(hold(old)); rx = grip; rz = roll; }
      else if (ph.stow && T < ph.stow[1]) {
        if (a.quick || !ph.out) {
          // let go of the dropped magazine (or start empty-handed) and go to the pouch
          const outEnd = style === 'rock' ? { x: 0, y: -0.082, z: -0.012, rx: 0.38 } : { x: 0, y: -(pistol ? 0.085 : 0.075), z: 0, rx: 0 };
          pos.copy(ph.out ? hold(outEnd) : L0).lerp(hold(POUCH), k('stow'));
        } else pos.copy(hold(old));
        rx = grip; rz = roll;
      } else if (ph.fetch && T < (ph.slap ? ph.slap[1] : 0)) { pos.copy(hold(nw)); rx = grip; rz = roll; if (inP('slap')) pos.y += 0.012 * bump(0, 0.3, 0.5, 1, (T - ph.slap[0]) / (ph.slap[1] - ph.slap[0])); }
      else if (ph.charge && T < ph.charge[1] && parts.boltHandle && !pistol) {
        // over to the charging handle, rack it, let it fly
        const h = new THREE.Vector3(...parts.boltHandle).add(new THREE.Vector3(0.014, -0.014, -0.012));
        const base = ph.slap ? hold({ x: 0, y: 0, z: 0, rx: 0 }) : L0;
        const kc = (T - ph.charge[0]) / (ph.charge[1] - ph.charge[0]);
        const reachH = sstep(0, 0.36, kc), pull = sstep(0.36, 0.56, kc) * (1 - sstep(0.62, 0.68, kc)), leave = sstep(0.7, 1, kc);
        pos.copy(base).lerp(h, reachH);
        pos.z += 0.08 * sstep(0.36, 0.56, kc) * (1 - sstep(0.7, 0.8, kc));
        pos.lerp(L0, leave);
        if (parts.bolt) parts.bolt.position.z = (cfg.boltTravel || 0.08) * pull;
        rx = 0.2 * (1 - leave); rz = -0.9 * reachH * (1 - leave);
      } else {
        // back to the grip
        const fromPos = ph.slap ? hold({ x: 0, y: 0, z: 0, rx: 0 }) : L0;
        const kr = k('ret');
        pos.copy(fromPos).lerp(L0, kr);
        rx = grip * (1 - kr) * (ph.slap && !ph.charge ? 1 : 0); rz = roll * (1 - kr) * (ph.slap && !ph.charge ? 1 : 0);
      }
      pos.x += tr(23); pos.y += tr(19);
      L.position.copy(pos);
      const r0 = L.userData.r0;
      L.rotation.set(r0.x + rx, r0.y, r0.z + rz);
    }
    // Pistol: the slide drops home when the slide stop is pressed
    if (pistol && ph.charge && parts.slide) {
      const kc = k('charge');
      parts.slide.position.z = (cfg.boltTravel || 0.035) * (1 - sstep(0.4, 0.55, kc));
    }
    if (T >= tl.dur) {
      const done = this.anim;
      this.anim = null;
      if (L) L.rotation.copy(L.userData.r0);
      done.newRoot?.parent?.remove(done.newRoot);
      done.onDone?.();
    }
  }

  showCheck() {
    const w = this.w;
    if (!w) return;
    const def = ITEMS[w.key];
    const n = def.tube ? w.tube : w.mag?.rounds ?? 0;
    const cap = def.tube || (w.mag ? ITEMS[w.mag.key].cap : 0);
    this.check = { text: (def.tube ? 'Tube: ' : 'Mag: ') + approxText(n, cap), t: 3 };
    sfx.click(1600, 0.1);
  }

  // ---------- reloading ----------
  startMagReload() {
    const w = this.w, p = this.p, def = ITEMS[w.key], cfg = this.built.cfg;
    const grids = p.ammoGrids();
    // Fullest compatible magazine carried in pockets / vest / backpack.
    let best = null, bestGrid = null;
    for (const g of grids) for (const it of g.items) {
      if (ITEMS[it.key].type === 'mag' && ITEMS[it.key].fits.includes(w.key) && it.rounds > 0 && (!best || it.rounds > best.rounds)) { best = it; bestGrid = g; }
    }
    if (!best) {
      if (!w.chamber && w.mag && w.mag.rounds > 0) return this.startCharge();
      p.game.hud.message(`No loaded ${ITEMS[def.magKey].name.replace(/^.*?\d+-round /, '')}s — load one in your inventory`, 3);
      sfx.dry();
      return;
    }
    if (w.mag && w.mag.rounds >= ITEMS[w.mag.key].cap && w.chamber) return;
    const old = w.mag;
    const parts = this.built.parts;
    // Condition decides the variant: rested is crisp; tired is slower, sags
    // and breathes hard; hurt arms are slow and shaky; both fumble more.
    const c = { ...this.cond };
    const fumble = Math.random() < 0.08 * c.tired + 0.35 * c.hurt + 0.15 * (p.shiver || 0) + (c.broken ? 0.3 : 0);
    const kSpeed = (1 - 0.06 * p.skill.aiming) * (1 + 0.45 * c.tired + 0.7 * c.hurt) * (c.broken ? 1.5 : 1);
    const opts = { pistol: parts.magStyle === 'heel', hasOld: !!old, quick: false, fumble, charge: !w.chamber, k: kSpeed };
    const tl = reloadTimeline(opts);
    // The new magazine, in the hand from the pouch until it's seated
    const rest = { x: parts.magRoot.position.x, y: parts.magRoot.userData.y0 ?? parts.magRoot.position.y, z: parts.magRoot.userData.z0 ?? parts.magRoot.position.z, rx: parts.magRoot.userData.rx0 ??= parts.magRoot.rotation.x };
    const newRoot = new THREE.Group();
    newRoot.add(buildMag(best.key));
    newRoot.traverse((o) => { o.layers.set(VM_LAYER); if (o.isMesh && o.material.isMeshStandardMaterial && !o.geometry.userData.uvDone) { metricUV(o.geometry); o.geometry.userData.uvDone = true; } });
    newRoot.visible = false;
    this.built.model.add(newRoot);
    const ph = () => this.anim?.tl?.ph || tl.ph;
    const at = (name, f = 1) => () => { const q = ph()[name]; return q ? q[0] + (q[1] - q[0]) * f : Infinity; };
    this.play('reload', tl.dur, {
      tl, opts, cond: c, k: kSpeed, rest, newRoot, time: 0,
      events: [
        { at: at('out', 0.3), fn: () => { if (old) sfx.magOut(); } },
        { at: at('out', 1), fn: () => {
          // Old magazine goes to your inventory, or the ground on a quick reload.
          if (old) { w.mag = null; if (this.anim?.quick || !grids.some((g) => addItem(g, old))) p.game.dropItem(old); }
        } },
        { at: at('fetch', 0), fn: () => { removeItem(bestGrid, best); if (!old) w.mag = null; } },
        { at: at('miss', 0.35), fn: () => { sfx.click(700, 0.25); p.game.hud.message(c.hurt > c.tired ? 'Your injured arm fumbles the magazine' : 'Your hands are shaking: you fumble the magazine', 2); } },
        { at: at('seat', 0.9), fn: () => { w.mag = best; sfx.magIn(); } },
        { at: at('charge', 0.56), fn: () => { if (!opts.charge) return; sfx.bolt(); if (w.mag?.rounds > 0) { w.mag.rounds--; w.chamber = 1; } } },
      ],
      onDone: () => { this.rebuild(true); },
    });
    p.game.zombies.noise(p.pos.x, p.pos.z, 4);
  }

  // Double-tap R during a reload: drop the old magazine instead of stowing it
  quickReload() {
    const a = this.anim;
    if (a?.type !== 'reload' || a.quick || !a.opts.hasOld || a.time > (a.tl.ph.out?.[1] ?? 0)) return false;
    a.quick = true;
    a.opts = { ...a.opts, quick: true };
    a.tl = reloadTimeline(a.opts);
    a.dur = a.tl.dur;
    return true;
  }

  startCharge() {
    const w = this.w, parts = this.built.parts, c = { ...this.cond };
    const kSpeed = (1 - 0.06 * this.p.skill.aiming) * (1 + 0.45 * c.tired + 0.7 * c.hurt);
    const opts = { pistol: parts.magStyle === 'heel', swap: false, charge: true, k: kSpeed };
    const tl = reloadTimeline(opts);
    const rest = { x: parts.magRoot.position.x, y: parts.magRoot.userData.y0 ?? parts.magRoot.position.y, z: parts.magRoot.userData.z0 ?? parts.magRoot.position.z, rx: parts.magRoot.userData.rx0 ??= parts.magRoot.rotation.x };
    this.play('reload', tl.dur, {
      tl, opts, cond: c, k: kSpeed, rest, time: 0,
      events: [{ at: () => tl.ph.charge[0] + (tl.ph.charge[1] - tl.ph.charge[0]) * 0.56, fn: () => { sfx.bolt(); if (w.mag?.rounds > 0) { w.mag.rounds--; w.chamber = 1; } } }],
    });
  }

  startShellReload() {
    const w = this.w, p = this.p, def = ITEMS[w.key], cfg = this.built.cfg;
    if (this.anim?.type === 'shell') { this.shellStop = true; return; }
    if (this.busy) return;
    if ((w.tube || 0) >= def.tube) {
      if (!w.chamber && w.tube > 0) this.pumpAction();
      return;
    }
    const grids = p.ammoGrids();
    // Load shells one at a time until full, out of shells, or interrupted.
    this.shellStop = false;
    const loop = (loops) => {
      if (!grids.some((g) => g.items.some((i) => i.key === def.ammo))) { p.game.hud.message(`No ${ITEMS[def.ammo].name}`, 2); return; }
      this.play('shell', cfg.shellTime * (1 - 0.05 * p.skill.aiming), {
        loops,
        events: [{ at: 0.7, fn: () => { if (takeItem(grids, def.ammo, 1)) { w.tube = (w.tube || 0) + 1; sfx.shell(); } } }],
        onDone: () => {
          if (!this.shellStop && w.tube < def.tube && grids.some((g) => g.items.some((i) => i.key === def.ammo))) loop(loops + 1);
          else if (!w.chamber && w.tube > 0) this.pumpAction();
        },
      });
    };
    loop(0);
  }

  pumpAction() {
    const w = this.w, cfg = this.built.cfg;
    this.play('pump', cfg.pumpTime, {
      events: [
        { at: 0.35, fn: () => { sfx.pump(); if (this.spent) { this.ejectCasing(true); this.spent = false; } } },
        { at: 0.55, fn: () => { if (w.tube > 0) { w.tube--; w.chamber = 1; } } },
      ],
    });
  }

  // ---------- firing ----------
  fire(w, def, cfg, ctx) {
    const p = this.p;
    if (!w.chamber) {
      if (!this.dryClicked) { sfx.dry(); this.dryClicked = true; }
      if (def.tube && w.tube > 0) this.pumpAction();
      return;
    }
    this.dryClicked = false;
    w.chamber = 0;
    this.fireCd = 60 / def.rpm;
    const suppressed = isSuppressed(w);
    sfx.shot(w.key, suppressed);
    if (!suppressed) { this.flashT = 0.045; p.flash.intensity = 30; }
    else p.flash.intensity = 4;

    // Bullets travel along the barrel (camera direction + weapon offset), from
    // where you were aiming when the shot broke: the recoil comes after.
    const armsBroken = (p.hp.armL <= 0 || p.hp.armR <= 0) && p.painkiller <= 0;
    // Hip fire is as accurate as aiming once your Guns skill is maxed
    const gunsK = Math.min(1, (p.skill.guns || 0) / 8), steady = Math.max(this.ads, gunsK);
    let spread = cfg.accuracy + (1 - this.ads) * cfg.hipSpread * (1 - gunsK);
    if (ctx.moving) spread += 0.012 * (1 - steady * 0.6);
    if (armsBroken) spread += 0.05;
    const origin = this.camera.position.clone();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch + this.offPitch, p.yaw + this.offYaw, 0, 'YXZ'));
    const dmgDef = { damage: def.damage, range: def.range, pellets: def.pellets };
    for (let i = 0; i < def.pellets; i++) {
      const sp = def.pellets > 1 ? cfg.pelletSpread + spread : spread;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * sp;
      const dir = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, -1).normalize().applyQuaternion(q);
      p.fireRay(origin, dir, dmgDef);
    }
    // Recoil: weapon springs + camera climb
    const rm = modMul(w, 'recoil') * (1 - 0.05 * p.skill.aiming) * (1 - this.ads * 0.25) * (p.prone ? 0.7 : p.crouch ? 0.85 : 1);
    const r = cfg.recoil;
    this.recP.v += r.v * 0.55 * rm;
    this.recY.v += (Math.random() - 0.5) * r.h * 0.9 * rm;
    this.kick.v += 0.5 * r.v * rm;
    const climb = r.v * r.cam * 0.02 * rm;
    p.pitch += climb;
    p.yaw += (Math.random() - 0.5) * r.h * 0.006 * rm;
    this.camDebt += climb;

    p.game.zombies.noise(p.pos.x, p.pos.z, def.noise * (suppressed ? 0.22 : 1));

    // Cycle the action
    if (def.tube) {
      this.spent = true; // ejected when pumped
      if (w.tube > 0) setTimeout(() => { if (this.w === w && !this.anim) this.pumpAction(); }, 120);
    } else {
      this.ejectCasing(false);
      this.boltT = 1;
      if (w.mag && w.mag.rounds > 0) { w.mag.rounds--; w.chamber = 1; }
    }
  }

  ejectCasing(shell) {
    const parts = this.built?.parts;
    if (!parts?.eject) return;
    const pos = new THREE.Vector3();
    parts.eject.getWorldPosition(pos);
    const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const vel = new THREE.Vector3(1.6 + Math.random(), 1.2 + Math.random() * 0.8, 0.3 + Math.random() * 0.4).applyQuaternion(q);
    this.p.game.fx.casing(pos, vel, shell);
  }

  // ---------- PIP scope rendering (called before the main render) ----------
  renderScope(renderer, scene) {
    const op = this.built?.parts.optic;
    if (!op?.lens || !this.root.visible) return;
    const u = op.lens.material.uniforms;
    u.bright.value = sstep(0.25, 0.85, this.ads);
    // Eye-box: misalignment between the eye and the scope axis darkens the edge.
    u.eyeOff.value.set(-this.offYaw * 7, this.offPitch * 7 - (1 - this.ads) * 0.6);
    if (this.ads < 0.2) return;
    const cam = this.scopeCam;
    op.lens.getWorldPosition(cam.position);
    // The scope looks exactly where the bullets go (aim + sway + recoil),
    // not along the cosmetic kick of the model, so the reticle stays true.
    cam.quaternion.setFromEuler(_scopeEuler.set(this.p.pitch + this.offPitch, this.p.yaw + this.offYaw, 0, 'YXZ'));
    cam.fov = op.fov;
    cam.updateProjectionMatrix();
    cam.layers.set(0);
    const prevTarget = renderer.getRenderTarget();
    const autoShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // reuse this frame's shadow maps
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = autoShadow;
    u.map.value = this.rt.texture;
  }

  // Main camera FOV while aiming with this setup.
  get adsFov() {
    const cfg = this.built?.cfg;
    if (!cfg) return 75;
    return this.built.parts.optic?.lens ? 55 : this.built.parts.optic ? cfg.adsFov - 4 : cfg.adsFov;
  }

  hudInfo() {
    const w = this.w;
    if (!w) return null;
    const def = ITEMS[w.key];
    const p = this.p;
    const spare = p.ammoGrids().reduce((n, g) => n + g.items.filter((i) => ITEMS[i.key].type === 'mag' && ITEMS[i.key].fits.includes(w.key)).length, 0);
    return {
      name: def.name,
      mode: def.auto ? w.mode.toUpperCase() : def.tube ? 'PUMP' : 'SEMI',
      check: this.check.t > 0 ? this.check.text : '',
      mag: def.tube ? '' : w.mag ? ITEMS[w.mag.key].short : 'NO MAG',
      spare: def.tube ? null : spare,
      mods: Object.values(w.mods).filter(Boolean).map((m) => ITEMS[m.key].short),
      state: this.anim?.type === 'reload' ? 'RELOADING' : this.anim?.type === 'shell' ? 'LOADING' : this.retract > 0.55 ? 'BLOCKED' : this.lowered ? 'LOWERED (G to raise)' : this.holding ? 'HOLDING BREATH' : '',
    };
  }
}
