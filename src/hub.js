// The base: the main menu is a forward operating base at dusk, a helipad
// with the Mi-8 that flies you in, the handlers' tents, your stash in a
// shipping container, the town's towers on the horizon. Tabs along the top:
// your operative, the stash, the handlers (contracts and barter), ENTER THE
// ZONE in the middle (pick a contract and an insertion, check your kit, go),
// the memorial, the survival guide and settings. Each tab moves the camera
// to its part of the base.
import * as THREE from 'three';
import { buildMi8 } from './intro.js';
import { buildFigure } from './paperdoll.js';
import { ITEMS, makeItem } from './items.js';
import { countItem, takeItem } from './inventory.js';
import { ARCH, LL_REP } from './traders.js';
import { HANDLERS, HANDLER_KEYS, loyalty, objLabel, dayClock, extractTime, giveStash } from './contracts.js';
import { rollInsertions, insertionLabel } from './character.js';
import { skillSheet } from './skills.js';
import { sfx } from './audio.js';

const TABS = [['character', 'Operative'], ['stash', 'Stash'], ['traders', 'Handlers'], ['deploy', 'Enter the Zone'], ['memorial', 'Memorial'], ['guide', 'Guide'], ['settings', 'Settings']];
const MAX_TAKEN = 3;
const FREE_DAYS = [1, 3, 7];
// Where the camera looks from on each tab: [position, target]
const CAM = {
  deploy: [[27, 6, 25], [0, 2.4, 0]],
  character: [[8.2, 1.8, 10.8], [4.6, 1.15, 6.2]],
  stash: [[16, 3.4, -1], [9, 1.3, -10]],
  traders: [[-1, 3.4, 12], [-14, 1.3, 0]],
  memorial: [[18.5, 2.4, 6], [25, 1, -2]],
};
// Which side of the screen the subject sits on (the panel takes the other):
// 1 right, -1 left
const SIDE = { deploy: 1, character: -1, stash: 0, traders: -1, memorial: -1, settings: 1 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const itemTile = (key, n) => { const d = ITEMS[key]; return `<span class="hb-item" style="--c:${d.color}" title="${esc(d.name)}"><b>${esc(d.short)}</b>${n > 1 ? `<i>×${n}</i>` : ''}</span>`; };

export class Hub {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('menu');
    this.tab = 'deploy';
    this.trader = 'institute';
    this.traderTab = 'contracts';
    this.pick = null; // the deployment chosen: a contract id, or 'free'
    this.freeDays = 3;
    this.inserts = rollInsertions(); this.insertPick = 0;
    this.scene = null;
    this.t = 0;
    this.root.innerHTML = `<div class="hub-top">
        <div class="hub-logo">TARKZOID<small>FORWARD OPERATING BASE · SECTOR 7</small></div>
        <nav class="hub-tabs">${TABS.map(([k, label]) => `<button data-tab="${k}" class="${k === 'deploy' ? 'zone' : ''}">${label}</button>`).join('')}</nav>
        <div class="hub-who"></div>
      </div>
      <div class="hub-panel"></div>
      <div class="hub-result"></div>`;
    this.panel = this.root.querySelector('.hub-panel');
    this.root.querySelector('.hub-tabs').addEventListener('click', (e) => { const k = e.target.closest('button')?.dataset.tab; if (k) this.select(k); });
    this.panel.addEventListener('click', (e) => this.onClick(e));
    this.root.querySelector('.hub-result').addEventListener('click', (e) => { if (e.target.dataset.a === 'dismiss') { this.result = null; this.draw(); } });
    addEventListener('keydown', (e) => {
      if (this.game.state !== 'menu') return;
      if (e.code === 'Escape' && this.game.invOpen) { this.game.closeInventory(); e.preventDefault(); }
    });
  }

  get save() { return this.game.save; }
  get hub() { return this.game.save.hub; }

  open() {
    this.build();
    this.camAt = null;
    if (this.tab === 'stash' || this.tab === 'guide' || this.tab === 'settings') this.tab = 'deploy';
    this.dress();
    this.draw();
  }

  select(k) {
    sfx.click?.(1400, 0.15);
    if (k === 'guide') { this.game.guide.open(); return; }
    if (k === 'stash') { if (!this.save.character) { this.tab = 'character'; this.draw(); return; } this.tab = 'stash'; this.draw(); this.openStash(); return; }
    this.tab = k;
    this.draw();
  }

  // ---------- the 3D base ----------
  build() {
    if (this.scene) return;
    const S = this.scene = new THREE.Scene();
    const sky = new THREE.Color(0x2a3040);
    S.background = sky;
    S.fog = new THREE.FogExp2(0x2a3040, 0.011);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
    S.add(new THREE.HemisphereLight(0x8090b8, 0x2a2418, 1.1));
    const moon = new THREE.DirectionalLight(0xb8c4e8, 1.3);
    moon.position.set(-30, 40, 25); moon.target.position.set(0, 0, 0);
    moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -35, right: 35, top: 35, bottom: -35, near: 1, far: 120 });
    moon.shadow.normalBias = 0.03;
    S.add(moon, moon.target);
    const M = (c, r = 0.9, m = 0, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e ? c : 0, emissiveIntensity: e });
    const box = (w, h, d, mat, x, y, z, ry = 0, parent = S) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
    // ground, the pad and its markings
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M(0x3a3a2c, 1)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
    const gravel = new THREE.Mesh(new THREE.CircleGeometry(30, 48), M(0x55524a, 1)); gravel.rotation.x = -Math.PI / 2; gravel.position.y = 0.01; gravel.receiveShadow = true; S.add(gravel);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 48), M(0x6a6a64, 0.95)); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; pad.receiveShadow = true; S.add(pad);
    const hc = document.createElement('canvas'); hc.width = hc.height = 256;
    const cx = hc.getContext('2d'); cx.strokeStyle = '#e8d870'; cx.lineWidth = 10; cx.beginPath(); cx.arc(128, 128, 112, 0, 7); cx.stroke();
    cx.fillStyle = '#e8d870'; cx.font = 'bold 150px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('H', 128, 136);
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, roughness: 1, depthWrite: false }));
    mark.rotation.x = -Math.PI / 2; mark.position.y = 0.03; mark.receiveShadow = true; S.add(mark);
    // the helicopter on the pad
    const heli = this.heli = buildMi8();
    heli.position.set(0, 1.4, 0); heli.rotation.y = -0.95;
    S.add(heli);
    // HESCO walls round the base, with gaps
    const hesco = M(0x8a7a5a, 1), mesh = M(0x5a5a50, 0.6, 0.6);
    for (let a = 0; a < Math.PI * 2; a += 0.075) {
      if (Math.abs(a - 1.2) < 0.25 || Math.abs(a - 4.4) < 0.2) continue; // gates
      const r = 31, x = Math.cos(a) * r, z = Math.sin(a) * r;
      box(1.4, 1.5, 1.4, hesco, x, 0.75, z, -a);
      box(1.44, 0.06, 1.44, mesh, x, 1.52, z, -a);
    }
    // the handlers' tents: command, the institute's field hospital
    const tent = (x, z, w, d, c, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
      box(w, 2.2, d, M(c, 1), 0, 1.1, 0, 0, g);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.62, 1.3, 4, 1), M(c, 1)); roof.rotation.y = Math.PI / 4; roof.scale.z = d / w; roof.position.y = 2.85; roof.castShadow = true; g.add(roof);
      box(1.4, 1.9, 0.05, M(0x1a1a14, 1), 0, 0.95, d / 2 + 0.01, 0, g); // the open flap
      return g;
    };
    tent(-15, 6.5, 6, 4.5, 0x5a6040, 0.25);
    tent(-15.5, -2.5, 5, 4, 0xd8d8cc, -0.1);
    // red cross on the hospital tent
    box(0.9, 0.25, 0.04, M(0xc02a2a, 1), -14.6, 1.7, -0.45, -0.1); box(0.25, 0.9, 0.04, M(0xc02a2a, 1), -14.6, 1.7, -0.45, -0.1);
    // the map table in front of command
    box(2.2, 0.08, 1.2, M(0x4a3a28, 0.8), -11.5, 0.95, 6.8, 0.25);
    for (const [dx, dz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]]) box(0.06, 0.92, 0.06, M(0x2a2a20), -11.5 + dx * Math.cos(0.25) + dz * Math.sin(0.25), 0.46, 6.8 - dx * Math.sin(0.25) + dz * Math.cos(0.25), 0.25);
    box(1.8, 0.01, 0.9, M(0xc8b890, 1, 0, 0.15), -11.5, 1.0, 6.8, 0.25);
    box(0.4, 0.25, 0.25, M(0x2a3020, 0.7), -10.8, 1.12, 6.6, 0.4); // radio
    // logistics: shipping containers (your stash is in the open one), crates, fuel drums
    const container = (x, z, ry, c, open) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.add(g);
      box(6, 2.6, 2.45, M(c, 0.85, 0.3), 0, 1.3, 0, 0, g);
      for (let i = -2.7; i <= 2.7; i += 0.45) box(0.06, 2.5, 2.5, M(c, 0.85, 0.3), i, 1.3, 0, 0, g); // corrugation
      if (open) { box(0.06, 2.4, 1.2, M(c, 0.85, 0.3), 3.05, 1.25, 1.85, 0.0, g); box(5.8, 2.4, 0.05, M(0x14140f, 1), 0.05, 1.3, 1.21, 0, g); }
      return g;
    };
    container(9, -11, 0.1, 0x8a4a2a, true);
    container(9.5, -14, 0.08, 0x3a5a4a, false);
    container(-6.5, -12, -0.2, 0x4a5a6a, false);
    for (const [x, z, s] of [[5.5, -9, 0.9], [6.4, -9.2, 0.7], [5.9, -8.2, 0.6], [12.6, -8.7, 0.8], [-4, -9.5, 1], [-3.2, -9.8, 0.7]]) box(s, s * 0.8, s, M(0x6a5a3a, 1), x, s * 0.4, z, Math.random());
    for (const [x, z] of [[-8.5, -8.5], [-9.2, -8.1], [-8.9, -9.3]]) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), M(0x3a5a2a, 0.6, 0.3)); d.position.set(x, 0.45, z); d.castShadow = true; S.add(d); }
    // the Broker's car
    const car = new THREE.Group(); car.position.set(-21, 0, -7); car.rotation.y = 0.7; S.add(car);
    box(4.2, 0.8, 1.8, M(0x15151a, 0.4, 0.6), 0, 0.65, 0, 0, car); box(2.2, 0.7, 1.6, M(0x15151a, 0.3, 0.6), -0.3, 1.4, 0, 0, car);
    for (const [x, z] of [[1.3, 0.9], [1.3, -0.9], [-1.3, 0.9], [-1.3, -0.9]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), M(0x111111)); w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z); car.add(w); }
    // floodlights on poles (the base's only real lights)
    for (const [x, z, aim] of [[17, 3, [2, 2]], [-19, 12, [-12, 3]], [12, -17, [8, -10]], [-10, -16, [-8, -8]]]) {
      box(0.18, 7, 0.18, M(0x3a3a34, 0.6, 0.5), x, 3.5, z);
      const head = box(0.8, 0.5, 0.3, M(0xfff0c8, 0.3, 0, 2.2), x, 7, z);
      head.lookAt(aim[0], 0, aim[1]);
      const L = new THREE.SpotLight(0xffe2b0, 160, 45, 0.75, 0.6, 1.6);
      L.position.set(x, 6.9, z); L.target.position.set(aim[0], 0, aim[1]);
      S.add(L, L.target);
    }
    // a lamp in the command tent, a fire barrel by the containers
    const lamp = new THREE.PointLight(0xffb060, 10, 9, 1.6); lamp.position.set(-12.5, 2.0, 6.0); S.add(lamp);
    const fire = this.fire = new THREE.PointLight(0xff7a2a, 14, 10, 1.6); fire.position.set(3.5, 1.4, -8); S.add(fire);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.3, 0.9, 12, 1, true), M(0x3a2a20, 0.8, 0.4)); barrel.position.set(3.5, 0.45, -8); S.add(barrel);
    box(0.5, 0.05, 0.5, M(0xff8a3a, 1, 0, 3), 3.5, 0.88, -8);
    // the memorial: a wall of names, tags hanging off it, candles
    const mem = new THREE.Group(); mem.position.set(25, 0, -2); mem.rotation.y = -1.2; S.add(mem);
    box(5, 2.2, 0.35, M(0x5a5a54, 1), 0, 1.1, 0, 0, mem);
    box(0.12, 2.8, 0.12, M(0x4a3a28), 0, 1.4, 0.4, 0, mem); box(1.4, 0.12, 0.12, M(0x4a3a28), 0, 2.2, 0.4, 0, mem);
    this.tags = new THREE.Group(); mem.add(this.tags);
    for (let i = 0; i < 6; i++) { const c = box(0.08, 0.16, 0.08, M(0xf0e0b0, 1), -1.6 + i * 0.6, 0.08, 0.7, 0, mem); c.castShadow = false; box(0.05, 0.05, 0.05, M(0xffc060, 1, 0, 4), -1.6 + i * 0.6, 0.2, 0.7, 0, mem); }
    const candle = new THREE.PointLight(0xffb050, 3, 6, 1.8); candle.position.set(0, 0.6, 1.2); mem.add(candle);
    // the treeline and the town on the horizon (where you're going)
    const pine = new THREE.ConeGeometry(2.2, 9, 7); pine.translate(0, 4.5, 0);
    const trees = new THREE.InstancedMesh(pine, M(0x1a2418, 1), 260), m4 = new THREE.Matrix4();
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 60, s = 0.7 + Math.random() * 0.8;
      if (Math.cos(a) < -0.55 && Math.abs(Math.sin(a)) < 0.6 && r < 80) continue; // a gap toward the town
      trees.setMatrixAt(i, m4.makeScale(s, s * (0.8 + Math.random() * 0.5), s).setPosition(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    S.add(trees);
    const town = M(0x20242c, 1), win = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    for (let i = 0; i < 26; i++) {
      const x = -170 - Math.random() * 80, z = (Math.random() - 0.5) * 220, h = 12 + Math.random() * (i % 5 === 0 ? 50 : 22), w = 10 + Math.random() * 14;
      box(w, h, 10, town, x, h / 2, z).castShadow = false;
      for (let k = 0; k < 4; k++) if (Math.random() < 0.6) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), win); l.position.set(x + 5.1, 2 + Math.random() * (h - 4), z + (Math.random() - 0.5) * 8); l.rotation.y = Math.PI / 2; S.add(l); }
    }
    // a column of smoke over the town
    this.smoke = [];
    const puff = new THREE.MeshBasicMaterial({ color: 0x3a3a40, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 18; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 6), puff); S.add(p); this.smoke.push({ p, k: i / 18 }); }
    // the handlers, at their posts
    const who = {
      command: [[-12.2, 4.6], 0.4, { weapon: 'ak74', helmet: 'helmet_6b47', armor: 'armor_6b13', clothing: 'parka' }],
      institute: [[-12.2, -0.8], 0.9, { clothing: 'raincoat' }],
      logistics: [[-4.6, -8.8], 0.2, { clothing: 'work_jacket', rig: 'vest_hunting' }],
      broker: [[-18.4, -5.2], 0.9, { clothing: 'winter_coat' }],
    };
    this.handlerFigs = {};
    for (const hk of HANDLER_KEYS) {
      const [[x, z], ry, kit] = who[hk], eq = { weapon: null, melee: null, armor: null, helmet: null, backpack: null, clothing: null, rig: null };
      for (const k in kit) eq[k] = makeItem(kit[k], ITEMS[kit[k]].type === 'weapon' ? { loaded: 0 } : {});
      const f = buildFigure({ name: HANDLERS[hk].name, equip: eq });
      f.position.set(x, 0, z); f.rotation.y = ry;
      f.traverse((o) => { o.castShadow = true; });
      S.add(f);
      this.handlerFigs[hk] = f;
    }
  }

  // Your operative by the helicopter, in what they're wearing
  dress() {
    if (this.merc) { this.scene.remove(this.merc); this.merc = null; }
    const ch = this.save?.character;
    if (!ch) return;
    this.merc = buildFigure(ch);
    this.merc.position.set(4.6, 0, 6.2); this.merc.rotation.y = 0.5;
    this.merc.traverse((o) => { o.castShadow = true; });
    this.scene.add(this.merc);
  }

  frame(dt) {
    if (!this.scene) return;
    this.t += dt;
    const R = this.game.renderer, cam = this.cam;
    cam.aspect = innerWidth / innerHeight;
    // the camera eases to the tab's view and drifts a little
    const [p, tg] = CAM[this.tab] || CAM.deploy;
    const want = new THREE.Vector3(...p).add(new THREE.Vector3(Math.sin(this.t * 0.17) * 0.6, Math.sin(this.t * 0.23) * 0.2, Math.cos(this.t * 0.13) * 0.5));
    const look = new THREE.Vector3(...tg);
    if (!this.camAt) { this.camAt = want.clone(); this.lookAt = look.clone(); }
    const k = 1 - Math.exp(-dt * 2.2);
    this.camAt.lerp(want, k); this.lookAt.lerp(look, k);
    cam.position.copy(this.camAt); cam.lookAt(this.lookAt);
    // off-centre: a wider view, cropped so the subject sits beside the panel
    this.side = (this.side ?? 0) + ((SIDE[this.tab] ?? 0) - (this.side ?? 0)) * k;
    const W = innerWidth, Hh = innerHeight;
    cam.setViewOffset(W * 1.4, Hh, (0.2 - 0.2 * this.side) * W, 0, W, Hh);
    cam.updateProjectionMatrix();
    // rotors turning over slowly; spun up when you're about to go
    const spin = this.tab === 'deploy' && this.save?.character ? 9 : 1.2;
    this.rotor = (this.rotor || 0) + (spin - (this.rotor || 0)) * Math.min(1, dt * 0.6);
    this.heli.userData.main.rotation.y += dt * this.rotor;
    this.heli.userData.tail.rotation.x += dt * this.rotor * 3;
    this.fire.intensity = 12 + Math.sin(this.t * 13) * 2 + Math.random() * 2;
    if (this.merc) this.merc.userData.torso.rotation.x = Math.sin(this.t * 1.6) * 0.012;
    for (const s of this.smoke) {
      const u = (s.k + this.t * 0.01) % 1;
      s.p.position.set(-190 + u * 30, 20 + u * 90, -30 + u * 12);
      s.p.scale.setScalar(0.6 + u * 2.2);
    }
    R.render(this.scene, cam);
    if (this.game.invOpen) this.game.doll?.render(dt);
  }

  // ---------- UI ----------
  draw() {
    const ch = this.save?.character;
    for (const b of this.root.querySelectorAll('.hub-tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const raid = this.save?.raid;
    this.root.querySelector('.hub-tabs .zone').textContent = raid ? 'Return to the Zone' : 'Enter the Zone';
    this.root.querySelector('.hub-who').innerHTML = ch
      ? `<b>${esc(ch.name)}</b><span>${esc(ch.professionName)} · ${ch.raids || 0} extraction${ch.raids === 1 ? '' : 's'}</span>`
      : '<b class="dim">No operative</b><span>Recruit one to deploy</span>';
    const html = { character: () => this.characterHtml(), traders: () => this.tradersHtml(), deploy: () => this.deployHtml(), memorial: () => this.memorialHtml(), settings: () => this.settingsHtml(), stash: () => this.stashHtml() }[this.tab]?.() || '';
    this.panel.className = `hub-panel ${this.tab}`;
    this.panel.innerHTML = html;
    const res = this.root.querySelector('.hub-result');
    res.style.display = this.result ? 'flex' : 'none';
    res.innerHTML = this.result ? this.resultHtml(this.result) : '';
  }

  characterHtml() {
    const ch = this.save?.character;
    if (!ch) {
      return `<h2>No operative</h2><p class="dim">The base has work and no one to send. Recruit a mercenary: pick a background, spend skill points, choose the gun they bring.</p>
        <p class="dim">If an operative dies or is left behind in the zone, everything they carried is lost with them. Your stash, your standing with the handlers and your contracts stay at the base.</p>
        <button class="go" data-a="recruit">RECRUIT AN OPERATIVE ▶</button>`;
    }
    return `<h2>${esc(ch.name)} <small class="dim">${esc(ch.professionName)}</small></h2>
      <div class="hb-stats"><span><b>${ch.raids || 0}</b> extractions</span><span><b>${ch.kills || 0}</b> kills</span><span><b>${ch.zoneDays || 0}</b> days in the zone</span></div>
      <div class="skills">${skillSheet({ profile: ch, day: undefined })}</div>`;
  }

  stashHtml() {
    return `<h2>Stash</h2><p class="dim">Your container at the base. Drag kit between your operative and the stash; what's on your operative goes in with them.</p><button class="go" data-a="stash">OPEN THE STASH</button>`;
  }

  memorialHtml() {
    const g = (this.save?.graveyard || []).slice().reverse();
    return `<h2>Memorial</h2>${g.length ? `<div class="hb-graves">${g.map((x) => `<div><b>✝ ${esc(x.name)}</b> <span class="dim">${esc(x.profession || '')}</span><br>${esc(x.reason)} · ${x.days} day${x.days === 1 ? '' : 's'} · ${x.kills} kills</div>`).join('')}</div>` : '<p class="dim">No names on the wall. Yet.</p>'}`;
  }

  settingsHtml() {
    return `<h2>Settings</h2><div class="hb-col">
      <button data-a="gfx">Graphics</button><button data-a="sound">Sound</button><button data-a="fullscreen">Toggle fullscreen</button>
      <button class="danger" data-a="wipe">Wipe the profile (stash, handlers, operative)</button></div>`;
  }

  // ---------- handlers ----------
  tradersHtml() {
    const hub = this.hub, hk = this.trader, H = HANDLERS[hk], ll = loyalty(hub, hk);
    const cards = HANDLER_KEYS.map((k) => {
      const h = HANDLERS[k], l = loyalty(hub, k), next = LL_REP[l];
      return `<button class="hb-handler ${k === hk ? 'sel' : ''}" data-h="${k}" style="--hc:${h.color}"><b>${h.name}</b><span>${h.title} · LL${l}</span><i style="width:${next ? Math.min(100, (hub.rep[k] / next) * 100) : 100}%"></i></button>`;
    }).join('');
    const taken = hub.contracts.filter((c) => c.taken).length;
    let body = '';
    if (this.traderTab === 'contracts') {
      body = hub.contracts.filter((c) => c.handler === hk).map((c) => this.contractCard(c, taken)).join('');
    } else {
      const offers = ARCH[H.offers].offers;
      body = `<p class="dim">Barter from your stash. Stock refills after each deployment.</p>` + offers.map((o) => {
        const left = hub.stock[o.id] ?? o.stock, locked = o.ll > ll;
        const can = !locked && left > 0 && o.give.every(([k, n]) => countItem([hub.stash], k) >= n);
        return `<div class="hb-offer ${locked ? 'locked' : ''}">${o.give.map(([k, n]) => itemTile(k, n)).join('')}<span class="arrow">→</span>${itemTile(o.get[0], o.get[1])}
          <span class="sp"></span>${locked ? `<span class="dim">LL${o.ll}</span>` : `<span class="dim">${left} left</span><button data-a="barter" data-o="${o.id}" ${can ? '' : 'disabled'}>Trade</button>`}</div>`;
      }).join('');
    }
    return `<div class="hb-handlers">${cards}</div>
      <div class="hb-hpanel"><h2 style="color:${H.color}">${H.name} <small class="dim">${H.title}</small></h2><p class="dim">${H.bio}</p>
      <div class="hb-sub"><button data-st="contracts" class="${this.traderTab === 'contracts' ? 'on' : ''}">Contracts</button><button data-st="barter" class="${this.traderTab === 'barter' ? 'on' : ''}">Barter</button><span class="dim">Reputation ${(+hub.rep[hk]).toFixed(1)} · loyalty level ${ll}</span></div>
      <div class="hb-list">${body}</div></div>`;
  }

  contractCard(c, taken) {
    return `<div class="hb-contract ${c.taken ? 'taken' : ''}">
      <div class="hb-ct"><b>${esc(c.title)}</b><span class="hb-days">${c.days} day${c.days === 1 ? '' : 's'}</span></div>
      <p>${esc(c.brief)}</p>
      <ul>${c.obj.map((o) => `<li>${esc(objLabel(o))}</li>`).join('')}</ul>
      <div class="hb-heli">Helicopter back: <b>${dayClock(extractTime(c.days, c.hour))}</b></div>
      <div class="hb-reward">Reward: <span class="rep">+${c.reward.rep} rep</span> ${c.reward.items.map(([k, n]) => itemTile(k, n)).join('')}</div>
      ${c.taken ? `<button data-a="drop" data-c="${c.id}">Hand it back</button> <span class="ok">Accepted: choose it under ENTER THE ZONE</span>` : `<button class="go small" data-a="take" data-c="${c.id}" ${taken >= MAX_TAKEN ? 'disabled title="You can hold three contracts at once"' : ''}>Accept</button>`}
    </div>`;
  }

  // ---------- deployment ----------
  deployHtml() {
    const s = this.save, ch = s?.character, raid = s?.raid;
    if (raid) {
      const c = raid.contract;
      return `<h2>Deployment in progress</h2><p>${esc(ch?.name || '')} is in the zone${c ? ` on <b>${esc(c.title)}</b>` : ' on a free run'}.</p>
        <p class="hb-heli">Helicopter back: <b>${dayClock(raid.extractAt)}</b></p>
        <button class="go big" data-a="continue">RETURN TO THE ZONE ▶</button>`;
    }
    if (!ch) return `<h2>Enter the Zone</h2><p class="dim">You need an operative first.</p><button class="go" data-a="recruit">RECRUIT AN OPERATIVE ▶</button>`;
    const taken = this.hub.contracts.filter((c) => c.taken);
    if (this.pick !== 'free' && !taken.some((c) => c.id === this.pick)) this.pick = taken[0]?.id || 'free';
    const opts = taken.map((c) => `<button class="hb-opt ${this.pick === c.id ? 'sel' : ''}" data-pick="${c.id}"><b>${esc(c.title)}</b><small>${HANDLERS[c.handler].title} · heli ${dayClock(extractTime(c.days, c.hour))}</small></button>`).join('')
      + `<button class="hb-opt ${this.pick === 'free' ? 'sel' : ''}" data-pick="free"><b>Free run</b><small>No contract: loot, survive, extract. ${FREE_DAYS.map((d) => `<span class="hb-chip ${this.freeDays === d ? 'on' : ''}" data-days="${d}">${d} day${d > 1 ? 's' : ''}</span>`).join('')}</small></button>`;
    const when = this.inserts.map((o, i) => `<button class="hb-opt ${i === this.insertPick ? 'sel' : ''}" data-ins="${i}"><b>${insertionLabel(o)}</b><small>${o.when}</small></button>`).join('');
    const e = ch.equip, ammo = this.carriedAmmo(ch);
    const kit = [['Primary', e.weapon], ['Melee', e.melee], ['Helmet', e.helmet], ['Armor', e.armor], ['Rig', e.rig], ['Clothing', e.clothing], ['Backpack', e.backpack]]
      .map(([k, it]) => `<span class="${it ? '' : 'dim'}">${k}: ${it ? esc(ITEMS[it.key].name) : '—'}</span>`).join('');
    const warn = [!e.weapon && 'No primary weapon', e.weapon && ammo < 30 && 'Low on ammunition', !this.hasMeds(ch) && 'No medical supplies'].filter(Boolean);
    const c = taken.find((x) => x.id === this.pick);
    return `<h2>Enter the Zone</h2>
      <h3>1 · Contract ${taken.length ? '' : '<small class="dim">(take contracts from the handlers)</small>'}</h3><div class="hb-opts">${opts}</div>
      <h3>2 · Insertion <button class="small" data-a="reroll">Other windows</button></h3><div class="hb-opts three">${when}</div>
      <h3>3 · Loadout <button class="small" data-a="stash">Stash</button></h3><div class="hb-kit">${kit}<span>Ammo carried: ${ammo}</span></div>
      ${warn.length ? `<div class="hb-warn">⚠ ${warn.join(' · ')}</div>` : ''}
      <div class="hb-go"><div>${c ? `<b>${esc(c.title)}</b><br><span class="dim">Extraction ${dayClock(extractTime(c.days, c.hour))}. Miss it and you're on your own.</span>` : `<b>Free run</b><br><span class="dim">Extraction ${dayClock(extractTime(this.freeDays, 12))}.</span>`}</div>
      <button class="go big" data-a="deploy">DEPLOY ▶</button></div>`;
  }

  carriedAmmo(ch) {
    const grids = [ch.pockets, ch.equip.backpack?.grid, ...(ch.equip.rig?.grids || []), ...(ch.equip.clothing?.grids || [])].filter(Boolean);
    let n = 0;
    for (const g of grids) for (const it of g.items) { const d = ITEMS[it.key]; if (d.type === 'ammo') n += it.count || 0; if (d.type === 'mag') n += it.rounds?.length ?? it.rounds ?? 0; }
    if (ch.equip.weapon?.mag) n += ch.equip.weapon.mag.rounds?.length ?? ch.equip.weapon.mag.rounds ?? 0;
    return n;
  }
  hasMeds(ch) {
    const grids = [ch.pockets, ch.equip.backpack?.grid, ...(ch.equip.rig?.grids || []), ...(ch.equip.clothing?.grids || [])].filter(Boolean);
    return grids.some((g) => g.items.some((it) => ITEMS[it.key].type === 'med'));
  }

  resultHtml(r) {
    const head = { extracted: ['EXTRACTED', 'green'], kia: ['KILLED IN ACTION', 'red'], mia: ['MISSING IN ACTION', 'red'] }[r.kind];
    return `<div class="panel hb-res"><h1 class="${head[1]}">${head[0]}</h1><p>${esc(r.name)} · ${r.days} day${r.days === 1 ? '' : 's'} in the zone · ${r.kills} kills</p>
      ${r.contract ? `<h3>${esc(r.contract.title)}: ${r.ok ? '<span class="green">COMPLETE</span>' : '<span class="red">FAILED</span>'}</h3>
      <ul>${(r.lines || r.contract.obj.map((o) => [objLabel(o), false])).map(([t, ok]) => `<li class="${ok ? 'green' : 'red'}">${ok ? '✓' : '✗'} ${esc(t)}</li>`).join('')}</ul>` : '<h3>Free run</h3>'}
      ${r.rewards?.length ? `<p>Delivered to your stash: ${r.rewards.map(([k, n]) => itemTile(k, n)).join('')} <span class="rep">+${r.rep} rep</span></p>` : ''}
      ${r.kind === 'extracted' ? '<p class="dim">Everything you carried out is still on your operative. Move it to the stash, or take it back in.</p>' : '<p class="dim">Everything they carried is gone. Recruit another operative.</p>'}
      <button class="go" data-a="dismiss">CONTINUE</button></div>`;
  }

  // ---------- clicks ----------
  onClick(e) {
    const t = e.target.closest('[data-a],[data-h],[data-st],[data-pick],[data-ins],[data-days]');
    if (!t) return;
    const g = this.game, hub = this.hub, d = t.dataset;
    if (d.days) { this.freeDays = +d.days; this.pick = 'free'; }
    else if (d.pick) this.pick = d.pick;
    else if (d.ins) this.insertPick = +d.ins;
    else if (d.h) this.trader = d.h;
    else if (d.st) this.traderTab = d.st;
    else switch (d.a) {
      case 'recruit': g.creation.reset(); g.showScreen('create'); return;
      case 'stash': this.openStash(); return;
      case 'continue': g.loadWorld(); return;
      case 'deploy': g.deploy(this.pick === 'free' ? null : hub.contracts.find((c) => c.id === this.pick), this.inserts[this.insertPick], this.freeDays); this.inserts = rollInsertions(); this.insertPick = 0; return;
      case 'reroll': this.inserts = rollInsertions(); this.insertPick = 0; break;
      case 'take': { const c = hub.contracts.find((x) => x.id === d.c); if (c && hub.contracts.filter((x) => x.taken).length < MAX_TAKEN) { c.taken = true; this.pick = c.id; sfx.pickup?.(); } break; }
      case 'drop': { const c = hub.contracts.find((x) => x.id === d.c); if (c) c.taken = false; break; }
      case 'barter': this.barter(d.o); break;
      case 'gfx': g.gfxPanel.open(); return;
      case 'sound': g.soundPanel.open(); return;
      case 'fullscreen': if (document.fullscreenElement) g.exitFullscreen(); else g.enterFullscreen(); return;
      case 'wipe': if (confirm('Wipe everything: your operative, stash, reputation and contracts?')) g.wipeProfile(); return;
    }
    g.persist();
    this.draw();
  }

  barter(id) {
    const hub = this.hub, hk = this.trader, o = ARCH[HANDLERS[hk].offers].offers.find((x) => x.id === id);
    if (!o || o.ll > loyalty(hub, hk) || (hub.stock[o.id] ?? o.stock) <= 0) return;
    if (!o.give.every(([k, n]) => countItem([hub.stash], k) >= n)) return;
    for (const [k, n] of o.give) takeItem([hub.stash], k, n);
    giveStash(hub, o.get[0], o.get[1]);
    hub.stock[o.id] = (hub.stock[o.id] ?? o.stock) - 1;
    hub.rep[hk] = +(hub.rep[hk] + 0.4).toFixed(1);
    sfx.pickup?.();
  }

  // ---------- stash ----------
  openStash() {
    const g = this.game, ch = this.save.character;
    if (!ch) return;
    g.openStash();
  }

  onStashClosed() {
    if (this.tab === 'stash') this.tab = 'deploy';
    this.dress();
    this.draw();
  }

  showResult(r) { this.result = r; }
}
