// First-person animations for using consumables: the weapon goes down and
// the hands bring the item into view. Drinking tips a bottle or can up,
// eating spoons from a can, produce gets bitten, a bandage is wound round the
// forearm, a medkit is opened and used, an injector is jabbed into the
// thigh, pills are shaken out, and surgery is a longer job with tools. The
// item's effect lands when the animation finishes.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { MAT, B, C, RB, hand, metricUV } from './gunmodels.js';
import { sfx } from './audio.js';
import { VM_LAYER } from './weapons.js';

const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));

// Which animation an item uses, and how long it takes (seconds)
const DRINKS = new Set(['water', 'soda', 'milk', 'coffee']);
const PRODUCE = new Set(['apple', 'carrot', 'tomato', 'cabbage', 'corn', 'potato', 'berries', 'eggs']);
export function useKind(key) {
  const def = ITEMS[key];
  if (def.type === 'food') return DRINKS.has(key) ? 'drink' : PRODUCE.has(key) ? 'bite' : 'eat';
  if (def.surgery) return 'surgery';
  if (key === 'bandage') return 'bandage';
  if (key === 'morphine' || key === 'antiviral') return 'inject';
  if (key === 'painkillers' || key === 'vitamins' || key === 'antibiotics') return 'pills';
  return 'medkit';
}
const DUR = { drink: 2.0, eat: 2.6, bite: 1.7, bandage: 2.8, medkit: 2.8, inject: 1.4, pills: 1.6, surgery: 4.8 };

// A simple model of the item in the hand (origin at the grip)
function itemModel(key, kind) {
  const def = ITEMS[key], g = new THREE.Group();
  const col = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6 });
  // upright cylinder (C builds them along z)
  const up = (m, y = 0) => { m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
  if (kind === 'drink') {
    if (key === 'water') { up(C(g, 0.032, 0.2, new THREE.MeshStandardMaterial({ color: 0x8ac0e8, roughness: 0.1, transparent: true, opacity: 0.7 }), 0, 0, 0)); up(C(g, 0.014, 0.025, MAT.white, 0, 0, 0), 0.11); }
    else if (key === 'milk') { B(g, 0.06, 0.16, 0.06, MAT.white, 0, 0, 0); B(g, 0.061, 0.06, 0.03, col, 0, 0.02, 0); }
    else { up(C(g, 0.03, 0.11, MAT.steel, 0, 0, 0)); up(C(g, 0.0305, 0.07, col, 0, 0, 0)); }
  } else if (kind === 'eat') {
    const can = new THREE.Group();
    const c = C(can, 0.038, 0.11, MAT.steel, 0, 0, 0); c.rotation.x = Math.PI / 2;
    const l = C(can, 0.0385, 0.07, col, 0, 0, 0); l.rotation.x = Math.PI / 2;
    g.add(can);
    g.userData.spoon = new THREE.Group();
    B(g.userData.spoon, 0.012, 0.004, 0.13, MAT.steel, 0, 0, -0.04);
    RB(g.userData.spoon, 0.03, 0.008, 0.04, 0.004, MAT.steel, 0, 0, -0.11);
  } else if (kind === 'bite') {
    if (key === 'carrot' || key === 'corn') { C(g, 0.02, 0.15, col, 0, 0, 0, 10, false, 0.006); B(g, 0.02, 0.02, 0.05, new THREE.MeshStandardMaterial({ color: 0x4a8a2a }), 0, 0, 0.09); }
    else { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(key === 'cabbage' ? 0.07 : 0.042, 1), col); g.add(s); }
  } else if (kind === 'bandage') {
    C(g, 0.03, 0.06, MAT.white, 0, 0, 0, 16).rotation.y = Math.PI / 2;
  } else if (kind === 'inject') {
    C(g, 0.012, 0.13, col, 0, 0, 0, 10); C(g, 0.002, 0.03, MAT.steel, 0, 0, -0.08, 6); B(g, 0.03, 0.01, 0.01, MAT.dark, 0, 0, 0.065);
  } else if (kind === 'pills') {
    const b = C(g, 0.022, 0.07, new THREE.MeshStandardMaterial({ color: 0xd8902a, roughness: 0.3 }), 0, 0, 0); b.rotation.x = Math.PI / 2;
    const cap = C(g, 0.024, 0.02, MAT.white, 0, 0.044, 0); cap.rotation.x = Math.PI / 2;
  } else {
    // medkit / surgical kit: a case with a white cross and a lid
    const surg = kind === 'surgery';
    RB(g, surg ? 0.22 : 0.16, 0.05, surg ? 0.14 : 0.11, 0.008, surg ? new THREE.MeshStandardMaterial({ color: 0x7ab0a0, roughness: 0.5 }) : col, 0, 0, 0);
    B(g, 0.05, 0.002, 0.014, MAT.white, 0, 0.026, 0); B(g, 0.014, 0.002, 0.05, MAT.white, 0, 0.026, 0);
    const lid = new THREE.Group(); lid.position.set(0, 0.025, -0.055);
    RB(lid, surg ? 0.22 : 0.16, 0.012, surg ? 0.14 : 0.11, 0.004, MAT.dark, 0, 0.006, 0.055);
    g.add(lid); g.userData.lid = lid;
    g.userData.tool = new THREE.Group();
    B(g.userData.tool, 0.006, 0.006, 0.12, surg ? MAT.steel : MAT.white, 0, 0, -0.03);
  }
  return g;
}

export class UseAnimator {
  constructor(player) {
    this.p = player;
    this.root = new THREE.Group();
    this.root.visible = false;
    player.camera.add(this.root);
    this.cur = null;
  }

  get busy() { return !!this.cur; }

  // Start using an item; onDone applies its effect at the end.
  play(item, onDone) {
    if (this.cur) return false;
    const kind = useKind(item.key);
    const root = this.root;
    root.clear();
    const R = hand('grip', [0.35, -0.85, 0.5], 1), L = hand('support', [-0.45, -0.8, 0.45], -1);
    const model = itemModel(item.key, kind);
    (kind === 'eat' || kind === 'medkit' || kind === 'surgery' ? L : R).add(model);
    model.position.set(kind === 'eat' || kind === 'medkit' || kind === 'surgery' ? 0.03 : -0.005, kind === 'medkit' || kind === 'surgery' ? 0.04 : 0.02, -0.035);
    if (model.userData.spoon) { R.add(model.userData.spoon); model.userData.spoon.position.set(0, 0.03, -0.04); }
    if (model.userData.tool) { R.add(model.userData.tool); model.userData.tool.position.set(0, 0.03, -0.04); }
    // a bandage wrapped round the left forearm, growing as it's wound
    let wrap = null;
    if (kind === 'bandage') { wrap = C(L.userData.arm, 0.04, 0.07, MAT.white, 0, 0, 0.1, 16); wrap.scale.set(0.01, 0.01, 1); }
    root.add(R, L);
    root.traverse((o) => { o.layers.set(VM_LAYER); if (o.isMesh && o.material.isMeshStandardMaterial && !o.geometry.userData.uvDone) { metricUV(o.geometry); o.geometry.userData.uvDone = true; } });
    const c = this.p.gun.cond || { tired: 0, hurt: 0 };
    const k = 1 + 0.3 * c.tired + 0.5 * c.hurt; // tired and hurt hands are slower
    this.cur = { kind, t: 0, dur: DUR[kind] * k, R, L, model, wrap, onDone, sounds: new Set(), cond: c };
    root.visible = true;
    this.p.game.hud.message(`${{ drink: 'Drinking', eat: 'Eating', bite: 'Eating', bandage: 'Bandaging', medkit: 'Treating wounds', inject: 'Injecting', pills: 'Taking', surgery: 'Operating' }[kind]}: ${ITEMS[item.key].name}`, DUR[kind] * k);
    return true;
  }

  sound(name, at, fn) { const c = this.cur; if (c.t >= at && !c.sounds.has(name)) { c.sounds.add(name); fn(); } }

  update(dt) {
    const c = this.cur;
    if (!c) return;
    c.t += dt / c.dur;
    const t = Math.min(1, c.t), { R, L, model, kind } = c;
    // in from below, out again at the end
    const vis = sstep(0, 0.14, t) * (1 - sstep(0.88, 1, t));
    const hide = (1 - vis) * 0.35;
    const shake = (0.002 + 0.004 * c.cond.tired + 0.006 * c.cond.hurt);
    const tr = (f) => shake * Math.sin(c.t * c.dur * f);
    // rest poses: right hand front-right, left hand front-left
    R.position.set(0.11, -0.19 - hide, -0.36); R.rotation.set(0, 0, 0);
    L.position.set(-0.1, -0.2 - hide, -0.36); L.rotation.set(0, 0, 0);
    L.visible = R.visible = true;
    model.rotation.set(0, 0, 0); model.scale.setScalar(1);
    const mouth = new THREE.Vector3(0.015, -0.07, -0.2);
    if (kind === 'drink') {
      L.visible = false;
      const up = sstep(0.15, 0.35, t) * (1 - sstep(0.75, 0.88, t));
      R.position.lerp(mouth, up);
      R.rotation.x = 1.0 * up; // tip it up
      R.position.y += Math.sin(t * 60) * 0.003 * up; // gulps
      this.sound('g1', 0.4, () => sfx.gulp()); this.sound('g2', 0.55, () => sfx.gulp()); this.sound('g3', 0.7, () => sfx.gulp());
    } else if (kind === 'eat') {
      L.position.set(-0.04, -0.17 - hide, -0.32); L.rotation.x = 0.3;
      // spoon: can → mouth, three times
      const ph = (t - 0.15) / 0.7 * 3, s = ph >= 0 && ph < 3 ? Math.sin((ph % 1) * Math.PI) : 0;
      R.position.set(-0.02 + 0.03 * s, -0.15 + 0.07 * s - hide, -0.3 + 0.09 * s);
      R.rotation.x = 0.6 * s;
      for (const [i, at] of [[1, 0.3], [2, 0.53], [3, 0.76]]) this.sound('e' + i, at, () => sfx.eat());
    } else if (kind === 'bite') {
      L.visible = false;
      const b = bump(0.15, 0.3, 0.42, 0.52, t) + bump(0.55, 0.65, 0.76, 0.86, t);
      R.position.lerp(mouth, b);
      model.scale.setScalar(1 - 0.2 * sstep(0.35, 0.4, t) - 0.25 * sstep(0.7, 0.75, t));
      this.sound('b1', 0.38, () => sfx.eat()); this.sound('b2', 0.72, () => sfx.eat());
    } else if (kind === 'bandage') {
      // left forearm across the view, the right hand winds the roll round it
      L.position.set(0.02, -0.14 - hide, -0.34); L.rotation.set(0.15, 1.3, -0.1);
      const wind = sstep(0.18, 0.82, t);
      const a = wind * Math.PI * 7;
      R.position.set(-0.07 + Math.cos(a) * 0.05, -0.15 + Math.sin(a) * 0.045 - hide, -0.3 - Math.sin(a) * 0.02);
      model.scale.setScalar(1 - 0.5 * wind);
      if (c.wrap) c.wrap.scale.set(wind, wind, 1);
      this.sound('rip', 0.16, () => sfx.rip());
      this.sound('rip2', 0.8, () => sfx.rip());
    } else if (kind === 'medkit' || kind === 'surgery') {
      L.position.set(-0.05, -0.2 - hide, -0.33); L.rotation.x = 0.5;
      if (model.userData.lid) model.userData.lid.rotation.x = -1.6 * sstep(0.15, 0.3, t) * (1 - sstep(0.82, 0.9, t));
      if (kind === 'surgery') {
        // careful work over the open kit
        const w = sstep(0.25, 0.3, t) * (1 - sstep(0.8, 0.86, t));
        R.position.set(0.02 + Math.sin(c.t * c.dur * 3.1) * 0.04 * w, -0.15 + Math.sin(c.t * c.dur * 5.3) * 0.02 * w - hide, -0.32);
        R.rotation.x = 0.5 * w;
        this.sound('s1', 0.3, () => sfx.zip()); this.sound('s2', 0.6, () => sfx.rip());
      } else {
        // into the kit and onto the wound, twice
        const d = bump(0.25, 0.32, 0.4, 0.48, t) + bump(0.52, 0.6, 0.7, 0.78, t);
        R.position.set(0.04 - 0.06 * d, -0.17 - 0.12 * d - hide, -0.34 + 0.08 * d);
        this.sound('z', 0.18, () => sfx.zip()); this.sound('r1', 0.42, () => sfx.rip());
      }
    } else if (kind === 'inject') {
      L.visible = false;
      const up = sstep(0.12, 0.3, t), stab = sstep(0.5, 0.58, t) * (1 - sstep(0.75, 0.9, t));
      R.position.set(0.08, -0.13 - hide - 0.3 * stab, -0.32 + 0.1 * stab);
      R.rotation.x = -0.4 * up + 1.2 * stab;
      this.sound('cap', 0.3, () => sfx.click(2000, 0.2)); this.sound('jab', 0.58, () => sfx.inject());
    } else if (kind === 'pills') {
      L.visible = false;
      const shake2 = bump(0.15, 0.2, 0.45, 0.5, t);
      R.rotation.z = Math.sin(c.t * c.dur * 40) * 0.3 * shake2;
      const up = bump(0.55, 0.68, 0.78, 0.88, t);
      R.position.lerp(mouth, up);
      this.sound('rattle', 0.2, () => sfx.pills());
    }
    R.position.x += tr(17); R.position.y += tr(23); L.position.x += tr(19); L.position.y += tr(13);
    if (c.t >= 1) {
      this.cur = null;
      this.root.visible = false;
      this.root.clear();
      c.onDone?.();
    }
  }

  cancel() { this.cur = null; this.root.visible = false; this.root.clear(); }
}
