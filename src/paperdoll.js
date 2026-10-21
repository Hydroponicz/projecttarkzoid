// The character in the inventory: a small 3D figure wearing what you have
// equipped (garment, armor, vest or rig, helmet, backpack, the gun slung on
// the back and the melee weapon on the hip). It turns slowly on its own; drag
// to turn it. Drawn by its own little renderer, only while it's on screen.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { buildWeaponModel, VM_LAYER } from './weapons.js';

const SKINS = [0xe0b090, 0xc89070, 0xa87050, 0x8a5a3a, 0x6a4028, 0xf0c8a8];
const SHIRTS = [0x5a6a7a, 0x7a3a3a, 0x3a5a4a, 0x8a8a7a, 0x2a2a30, 0x6a5a3a];
const JEANS = [0x2a3a5a, 0x3a3a3a, 0x4a4030, 0x30384a];
const HAIR = [0x2a1a10, 0x4a3020, 0x8a6a3a, 0x1a1a1a, 0x6a6a6a];

// A stable look for a character (from their name): skin, shirt, jeans, hair
export function playerLook(profile) {
  let h = 2166136261;
  for (const ch of profile.name || '') h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const at = (arr, k) => arr[(h >>> k) % arr.length];
  return { skin: at(SKINS, 0), shirt: at(SHIRTS, 5), jeans: at(JEANS, 10), hair: at(HAIR, 15) };
}

const hex = (c) => new THREE.Color(c).getHex();
const mats = new Map();
const mat = (c, rough = 0.9, metal = 0) => {
  const k = `${c}|${rough}|${metal}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return mats.get(k);
};
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.userData.own = true;
  parent.add(m);
  return m;
}
// A limb hanging from a joint: a group at the joint, the box below it
function limb(parent, w, h, d, color, x, y, z) {
  const j = new THREE.Group();
  j.position.set(x, y, z);
  parent.add(j);
  const m = box(j, w, h, d, color, 0, -h / 2, 0);
  return { j, m };
}

// How a garment looks: length (how far down the body), bulk, hood
const GARMENTS = {
  hoodie: { len: 0.0, bulk: 0.02, hood: true, pocket: true },
  work_jacket: { len: 0.06, bulk: 0.025, collar: true },
  raincoat: { len: 0.42, bulk: 0.03, hood: true },
  winter_coat: { len: 0.36, bulk: 0.06, collar: true, fur: false },
  parka: { len: 0.4, bulk: 0.06, hood: true, fur: true },
};
const PACKS = { bp_scav: [0.34, 0.4, 0.16], bp_tri: [0.38, 0.5, 0.2], bp_mil: [0.44, 0.62, 0.26], radio_pack: [0.34, 0.44, 0.2] };

function buildFigure(profile) {
  const look = playerLook(profile), eq = profile.equip;
  const fig = new THREE.Group();
  const top = eq.clothing ? hex(ITEMS[eq.clothing.key].color) : look.shirt;
  const g = (eq.clothing && GARMENTS[eq.clothing.key]) || (eq.clothing ? { len: 0.05, bulk: 0.025 } : null);
  const bulk = g ? g.bulk : 0;

  // legs and boots
  const legs = [-1, 1].map((s) => {
    const L = limb(fig, 0.15, 0.82, 0.16, look.jeans, s * 0.11, 0.92, 0);
    box(L.j, 0.16, 0.1, 0.26, 0x2a2420, 0, -0.86, 0.04); // boot
    return L;
  });
  // torso, hips, neck, head
  const torso = new THREE.Group();
  torso.position.y = 0.92;
  fig.add(torso);
  box(torso, 0.36, 0.14, 0.2, look.jeans, 0, 0.05, 0); // hips
  box(torso, 0.4 + bulk * 2, 0.5, 0.22 + bulk * 2, top, 0, 0.36, 0);
  box(torso, 0.1, 0.08, 0.1, look.skin, 0, 0.64, 0);
  const head = new THREE.Group();
  head.position.y = 0.8;
  torso.add(head);
  box(head, 0.22, 0.26, 0.24, look.skin, 0, 0, 0);
  box(head, 0.235, 0.07, 0.25, look.hair, 0, 0.11, -0.005);
  box(head, 0.235, 0.12, 0.05, look.hair, 0, 0.04, -0.11);
  for (const s of [-1, 1]) box(head, 0.035, 0.02, 0.01, 0x1a1a1a, s * 0.05, 0.02, 0.121); // eyes
  // arms (sleeves in the garment's colour, hands in skin)
  const arms = [-1, 1].map((s) => {
    const A = limb(torso, 0.12 + bulk, 0.62, 0.12 + bulk, top, s * (0.26 + bulk), 0.6, 0);
    box(A.j, 0.1, 0.1, 0.1, look.skin, 0, -0.66, 0);
    A.j.rotation.z = s * 0.08;
    return A;
  });

  // Garment details: a coat's skirt, hood, collar, pocket
  if (g) {
    if (g.len > 0.02) box(torso, 0.42 + bulk * 2, g.len, 0.24 + bulk * 2, top, 0, 0.12 - g.len / 2, 0);
    if (g.hood) box(torso, 0.3, 0.16, 0.12, shade(top, 0.85), 0, 0.62, -0.15);
    if (g.fur) box(torso, 0.3, 0.05, 0.14, 0xb8a888, 0, 0.7, -0.13);
    if (g.collar) box(torso, 0.24, 0.08, 0.26, shade(top, 0.9), 0, 0.63, 0);
    if (g.pocket) box(torso, 0.24, 0.12, 0.02, shade(top, 0.85), 0, 0.2, 0.12 + bulk);
    box(torso, 0.012, 0.48, 0.01, shade(top, 0.6), 0, 0.36, 0.115 + bulk * 2); // zip
  }
  const front = 0.11 + bulk * 2;
  // Body armor: soft armor wraps; a plate carrier has plates and side plates
  if (eq.armor) {
    const c = hex(ITEMS[eq.armor.key].color), heavy = eq.armor.key === 'armor_6b13';
    box(torso, 0.44 + bulk * 2, 0.44, 0.27 + bulk * 2 + (heavy ? 0.05 : 0), c, 0, 0.38, 0);
    if (heavy) {
      box(torso, 0.3, 0.3, 0.03, shade(c, 0.8), 0, 0.42, front + 0.04);
      for (const s of [-1, 1]) box(torso, 0.03, 0.2, 0.16, shade(c, 0.8), s * (0.23 + bulk), 0.36, 0);
      box(torso, 0.34, 0.08, 0.1, shade(c, 0.9), 0, 0.66, 0); // collar
    }
  }
  // Vest or chest rig: pouches across the front
  if (eq.rig) {
    const key = eq.rig.key, c = hex(ITEMS[key].color), armorD = eq.armor ? 0.035 : 0;
    const z = front + 0.02 + armorD;
    if (key.startsWith('vest_')) {
      box(torso, 0.44 + bulk * 2, 0.46, 0.25 + bulk * 2 + armorD * 2, c, 0, 0.36, 0);
      for (const s of [-1, 1]) for (const y of [0.2, 0.38]) box(torso, 0.13, 0.12, 0.05, shade(c, 0.85), s * 0.11, y, z + 0.02);
    } else {
      box(torso, 0.38, 0.2, 0.06, c, 0, 0.32, z);
      const n = key === 'rig_tactical' ? 4 : 3;
      for (let i = 0; i < n; i++) box(torso, 0.08, 0.16, 0.06, shade(c, 0.85), (i - (n - 1) / 2) * 0.09, 0.3, z + 0.05);
      for (const s of [-1, 1]) box(torso, 0.05, 0.36, 0.02, shade(c, 0.8), s * 0.12, 0.5, z - 0.01); // straps
    }
  }
  // Helmet
  if (eq.helmet) {
    const c = hex(ITEMS[eq.helmet.key].color);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(c, 0.8));
    dome.scale.set(1, 0.85, 1.08);
    dome.position.y = 0.05;
    dome.castShadow = true;
    head.add(dome);
    if (eq.helmet.key === 'helmet_ssh') box(head, 0.34, 0.015, 0.36, c, 0, 0.05, 0); // brim
    else { for (const s of [-1, 1]) box(head, 0.02, 0.04, 0.12, 0x2a2a2a, s * 0.155, 0.08, 0); box(head, 0.29, 0.07, 0.04, shade(c, 0.8), 0, 0.03, -0.14); }
  }
  // Backpack
  let backZ = -0.11 - bulk * 2 - (eq.armor ? 0.03 : 0);
  if (eq.backpack) {
    const [w, h, d] = PACKS[eq.backpack.key] || [0.36, 0.44, 0.18], c = hex(ITEMS[eq.backpack.key].color);
    box(torso, w, h, d, c, 0, 0.62 - h / 2, backZ - d / 2);
    box(torso, w * 0.8, h * 0.3, 0.05, shade(c, 0.85), 0, 0.62 - h * 0.7, backZ - d - 0.02); // front pocket
    if (eq.backpack.key === 'bp_mil') box(torso, w * 0.9, 0.1, 0.1, 0x5a5a48, 0, 0.66, backZ - d / 2); // bedroll
    if (eq.backpack.key === 'radio_pack') {
      box(torso, w * 0.7, 0.12, 0.03, 0x2a2e24, 0, 0.5, backZ - d - 0.03); // front panel, knobs
      for (const x of [-0.08, 0, 0.08]) box(torso, 0.03, 0.03, 0.03, 0x1a1a1a, x, 0.5, backZ - d - 0.06);
      box(torso, 0.012, 0.9, 0.012, 0x2a2a2a, w / 2 - 0.05, 0.62 + 0.45, backZ - d / 2); // whip antenna
      box(torso, 0.05, 0.06, 0.05, 0x1a1a1a, w / 2 - 0.05, 0.64, backZ - d / 2);
    }
    for (const s of [-1, 1]) box(torso, 0.05, 0.5, 0.02, shade(c, 0.7), s * 0.12, 0.4, front + 0.01); // straps
    backZ -= d;
  }
  // Primary slung across the back, muzzle up over the left shoulder
  if (eq.weapon) {
    try {
      const { model } = buildWeaponModel(eq.weapon);
      model.traverse((o) => { o.layers.set(0); if (o.isMesh) o.castShadow = true; });
      const sling = new THREE.Group();
      sling.add(model);
      model.rotation.y = Math.PI / 2; // barrel (-z) along the sling
      sling.rotation.set(0, Math.PI, -0.8);
      sling.position.set(0, 0.35, backZ - 0.06);
      torso.add(sling);
    } catch { /* a weapon without a model */ }
  }
  // Melee weapon on the right hip
  if (eq.melee) {
    const k = eq.melee.key, hip = new THREE.Group();
    hip.position.set(0.24, 0.05, 0.02);
    hip.rotation.z = 0.12;
    torso.add(hip);
    if (k === 'knife') { box(hip, 0.04, 0.12, 0.05, 0x2a2a2a, 0, 0.02, 0); box(hip, 0.02, 0.2, 0.04, 0x3a3020, 0, -0.14, 0); }
    else if (k === 'axe') { box(hip, 0.035, 0.7, 0.035, 0x6b4423, 0, -0.1, 0); box(hip, 0.03, 0.12, 0.18, 0xaa2222, 0, 0.22, 0.06); }
    else if (k === 'crowbar') box(hip, 0.03, 0.7, 0.03, 0x8a1a1a, 0, -0.1, 0);
    else if (k === 'hammer') { box(hip, 0.03, 0.36, 0.03, 0x6b4423, 0, -0.08, 0); box(hip, 0.05, 0.05, 0.14, 0x3a3a3a, 0, 0.1, 0); }
    else if (k === 'shovel') { box(hip, 0.035, 0.8, 0.035, 0x6b4423, 0, -0.1, -0.1); box(hip, 0.02, 0.24, 0.18, 0x5a5a5a, 0, -0.56, -0.1); }
    else box(hip, 0.04, 0.4, 0.04, hex(ITEMS[k]?.color || '#555'), 0, -0.1, 0);
  }
  fig.userData = { torso, head, arms, legs };
  return fig;
}

export class PaperDoll {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'paperdoll';
    this.renderer = null;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
    this.camera.position.set(0, 1.15, 4.3);
    this.camera.lookAt(0, 0.95, 0);
    this.camera.layers.enable(VM_LAYER);
    const hemi = new THREE.HemisphereLight(0xdde4ff, 0x3a3428, 1.6);
    const key = new THREE.DirectionalLight(0xfff0dc, 2.2);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.2, bottom: -0.2, near: 0.5, far: 10 });
    const rim = new THREE.DirectionalLight(0x9ab0ff, 0.9);
    rim.position.set(-3, 2, -3);
    this.scene.add(hemi, key, rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshStandardMaterial({ color: 0x24261e, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.turn = 0.5; this.spin = 0.25; this.t = 0;
    this.fig = null;
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
    this.canvas.addEventListener('pointermove', (e) => { if (drag === null) return; this.turn += (e.clientX - drag) * 0.012; drag = e.clientX; this.spin = 0; });
    this.canvas.addEventListener('pointerup', () => { drag = null; this.spin = 0.25; });
  }

  // Dress it in what the character has on now
  update(profile) {
    if (this.fig) {
      this.scene.remove(this.fig);
      this.fig.traverse((o) => { if (o.userData.own) o.geometry.dispose(); });
    }
    this.fig = buildFigure(profile);
    this.scene.add(this.fig);
  }

  // Idle: slow turn, breathing, a little sway
  render(dt) {
    if (!this.fig || !this.canvas.isConnected) return;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.shadowMap.enabled = true;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr)) {
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.t += dt;
    this.turn += this.spin * dt;
    const { torso, head, arms } = this.fig.userData, b = Math.sin(this.t * 1.7);
    this.fig.rotation.y = this.turn;
    torso.scale.set(1 + b * 0.008, 1, 1 + b * 0.012);
    head.rotation.y = Math.sin(this.t * 0.4) * 0.25;
    arms.forEach((A, i) => { A.j.rotation.x = Math.sin(this.t * 1.1 + i) * 0.04; });
    this.renderer.render(this.scene, this.camera);
  }
}
