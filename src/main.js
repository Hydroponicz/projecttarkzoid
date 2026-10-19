import * as THREE from 'three';
import { buildWorld, HALF } from './world.js';
import { Zombies } from './zombies.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { InventoryUI } from './invui.js';
import { ITEMS, makeItem, itemValue } from './items.js';
import { makeGrid, addItem } from './inventory.js';
import { loadProfile, saveProfile, wipeProfile } from './save.js';
import { initAudio, sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

const TRADER = [
  ['pm', 9000], ['mp133', 26000], ['sks', 42000], ['ak74', 68000],
  ['ammo_9x18', 1200], ['ammo_12g', 2400], ['ammo_762', 4200], ['ammo_545', 5000],
  ['knife', 2500], ['crowbar', 6500], ['axe', 15000],
  ['bp_scav', 9000], ['bp_tri', 34000], ['helmet_ssh', 14000], ['armor_paca', 24000], ['armor_6b13', 72000],
  ['bandage', 2500], ['ai2', 6000], ['salewa', 21000], ['painkillers', 5000], ['antiviral', 90000],
  ['water', 5000], ['beans', 4500],
];

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10141c);
    this.scene.fog = new THREE.FogExp2(0x10141c, 0.026);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 300);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0x7a8aaa, 0x2a2a1a, 1.1));
    this.moon = new THREE.DirectionalLight(0x9aaad8, 0.9);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    Object.assign(this.moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
    this.scene.add(this.moon, this.moon.target);

    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.fx = new FX(this.scene);
    this.raidInv = new InventoryUI($('inv'));
    this.hideoutInv = new InventoryUI($('hideout-inv'));
    this.profile = loadProfile();
    if (!this.profile.secure) this.profile.secure = makeGrid(2, 2);
    this.state = 'hideout';
    this.invOpen = false;

    addEventListener('resize', () => this.resize());
    this.resize();
    this.canvas.addEventListener('click', () => {
      if (this.state === 'raid' && !this.invOpen && !this.hud.mapOpen) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => this.updatePause());
    $('pause').addEventListener('click', (e) => { if (e.target.id !== 'btn-abandon') this.input.lock(); });
    $('btn-abandon').onclick = () => this.endRaid('died', 'Abandoned the raid');
    $('btn-raid').onclick = () => this.startRaid();
    $('btn-back').onclick = () => this.showHideout();
    $('btn-wipe').onclick = () => {
      if (confirm('Wipe your profile and start over?')) { this.profile = wipeProfile(); this.showHideout(); }
    };

    this.last = performance.now();
    this.showHideout();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- hideout ----------
  playerSections() {
    const p = this.profile;
    const s = [
      { kind: 'equip', title: 'Equipment', equip: p.equip },
      { kind: 'grid', title: 'Pockets', grid: p.pockets },
    ];
    if (p.equip.backpack) s.push({ kind: 'grid', title: ITEMS[p.equip.backpack.key].name, grid: p.equip.backpack.grid, noNest: true });
    s.push({ kind: 'grid', title: 'Secure container (kept on death)', grid: p.secure, noNest: true });
    return s;
  }

  showHideout() {
    this.state = 'hideout';
    $('hideout').style.display = 'block';
    $('result').style.display = 'none';
    this.hud.show(false);
    const p = this.profile;
    const refreshHeader = () => {
      $('money').textContent = `₽ ${p.money.toLocaleString()}`;
      $('stats').textContent = `Raids ${p.stats.raids} · Survived ${p.stats.survived} · Deaths ${p.stats.deaths} · Kills ${p.stats.kills}`;
    };
    refreshHeader();
    this.hideoutInv.open(() => this.playerSections(), () => [
      { kind: 'grid', title: 'Stash', grid: p.stash },
      { kind: 'shop', col: 2, title: 'Trader — Jaeger', stock: TRADER, onBuy: (key, price) => {
        if (p.money < price) return this.toast('Not enough roubles');
        const it = makeItem(key, key.startsWith('ammo') ? { count: ITEMS[key].stack } : {});
        if (!addItem(p.stash, it)) return this.toast('Stash is full');
        p.money -= price;
        sfx.pickup();
        saveProfile(p); refreshHeader(); this.hideoutInv.render();
      } },
      { kind: 'sell', col: 2, title: 'Sell' },
    ], {
      onChange: () => { saveProfile(p); refreshHeader(); },
      onSell: (it) => { p.money += Math.round(itemValue(it) * 0.7); },
    });
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'msg';
    t.style.cssText = 'position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:300';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------- raid lifecycle ----------
  startRaid() {
    initAudio();
    const p = this.profile;
    $('hideout').style.display = 'none';
    $('loading').style.display = 'flex';
    // Let the loading panel paint before generating.
    setTimeout(() => {
      p.stats.raids++;
      // Save a copy as if we died: closing the tab mid-raid forfeits the gear.
      const forfeit = JSON.parse(JSON.stringify(p));
      forfeit.equip = { weapon: null, melee: null, armor: null, helmet: null, backpack: null };
      forfeit.pockets = makeGrid(4, 2);
      forfeit.stats.deaths++;
      saveProfile(forfeit);

      this.startValue = this.gearValue();
      this.world = buildWorld(this.scene);
      this.zombies = new Zombies(this.scene, this.world);
      this.player = new Player(this.camera, this.scene, this);
      const sp = this.world.spawns[Math.floor(Math.random() * this.world.spawns.length)];
      this.player.pos.set(sp[0], 0, sp[1]);
      this.player.yaw = Math.atan2(sp[0], sp[1]); // face the town center
      this.zombies.populate(85, this.player.pos);
      this.raidTime = 25 * 60;
      this.raidElapsed = 0;
      this.extractTimer = null;
      this.lookTarget = null;
      this.state = 'raid';
      $('loading').style.display = 'none';
      this.hud.show(true);
      this.hud.message('Find loot. Reach an extraction point. Stay quiet.', 5);
      this.input.lock();
      this.updatePause();
    }, 30);
  }

  gearValue() {
    const p = this.profile;
    let v = 0;
    for (const k in p.equip) if (p.equip[k]) v += itemValue(p.equip[k]);
    for (const g of [p.pockets, p.secure]) for (const it of g.items) v += itemValue(it);
    return v;
  }

  endRaid(outcome, reason) {
    if (this.state !== 'raid') return;
    this.state = 'result';
    this.closeInventory();
    this.hud.toggleMap(false);
    this.input.unlock();
    const p = this.profile;
    const kills = this.player.kills;
    p.stats.kills += kills;
    const survived = outcome === 'extracted';
    const endValue = this.gearValue();
    if (survived) {
      p.stats.survived++;
    } else {
      p.stats.deaths++;
      p.equip = { weapon: null, melee: null, armor: null, helmet: null, backpack: null };
      p.pockets = makeGrid(4, 2);
    }
    // Never leave a player completely unarmed: the trader gives a knife.
    if (!p.equip.melee && !p.equip.weapon && p.money < 9000) p.equip.melee = makeItem('knife');
    saveProfile(p);

    const mins = Math.floor(this.raidElapsed / 60), secs = Math.floor(this.raidElapsed % 60);
    $('res-title').textContent = survived ? 'SURVIVED' : outcome === 'mia' ? 'MISSING IN ACTION' : 'KILLED IN ACTION';
    $('res-title').style.color = survived ? '#8f8' : '#e55';
    $('res-reason').textContent = reason || '';
    $('res-stats').innerHTML = `Time in raid: ${mins}m ${secs}s<br>Zombies killed: ${kills}<br>` +
      (survived ? `Gear value: ₽${this.startValue.toLocaleString()} → ₽${endValue.toLocaleString()} (<span class="${endValue >= this.startValue ? 'green' : 'red'}">${endValue >= this.startValue ? '+' : ''}${(endValue - this.startValue).toLocaleString()}</span>)`
        : `Lost gear worth ₽${endValue.toLocaleString()} (secure container kept)`);
    $('result').style.display = 'block';
    this.hud.show(false);
    $('pause').style.display = 'none';

    // Tear down the world
    this.zombies.dispose();
    this.world.dispose();
    this.fx.clear();
    for (const c of [...this.camera.children]) this.camera.remove(c);
    this.world = this.zombies = null;
  }

  updatePause() {
    const show = this.state === 'raid' && !this.input.locked && !this.invOpen && !this.hud.mapOpen;
    $('pause').style.display = show ? 'flex' : 'none';
  }

  // ---------- raid inventory ----------
  openInventory(container) {
    this.invOpen = true;
    this.input.unlock();
    const right = container ? () => [{ kind: 'grid', title: container.name, grid: container.grid }] : () => [];
    $('invtitle').textContent = container ? `Searching: ${container.name}` : 'Inventory';
    $('invwrap').style.display = 'block';
    this.raidInv.open(() => this.playerSections(), right, {
      onChange: () => { this.player.buildViewmodel(); this.hud.ammoChanged = true; },
      onUse: (it) => this.player.use(it),
      onDrop: (it) => this.dropItem(it),
    });
    this.updatePause();
  }

  closeInventory() {
    if (!this.invOpen) return;
    this.invOpen = false;
    this.raidInv.closeMenu();
    $('invwrap').style.display = 'none';
    if (this.state === 'raid') { this.input.lock(); this.updatePause(); }
  }

  dropItem(it) {
    const pp = this.player.pos;
    let c = this.world.containers.find((k) => k.type === 'drop' && Math.hypot(k.x - pp.x, k.z - pp.z) < 1.5);
    if (!c) {
      c = { type: 'drop', name: 'Dropped items', x: pp.x, z: pp.z, grid: makeGrid(8, 8) };
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a5a3a }));
      m.position.set(pp.x, 0.1, pp.z);
      this.world.group.add(m);
      c.mesh = m;
      this.world.containers.push(c);
    }
    if (!addItem(c.grid, it)) { c.grid.w += 2; c.grid.h += 2; addItem(c.grid, it); }
  }

  quickHeal() {
    const pl = this.player;
    const grids = pl.ammoGrids().concat([this.profile.secure]);
    const want = pl.bleeding.size ? (k) => ITEMS[k].stopBleed : (k) => ITEMS[k].heal;
    for (const g of grids) {
      for (const it of g.items) {
        if (ITEMS[it.key].type !== 'med' || !want(it.key)) continue;
        if (pl.use(it)) {
          it.uses -= 1;
          if (it.uses <= 0) g.items.splice(g.items.indexOf(it), 1);
          return;
        }
      }
    }
    this.hud.message('No suitable meds');
  }

  // ---------- main loop ----------
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.state === 'raid') this.updateRaid(dt);
    this.input.endFrame();
    if (this.state === 'raid') this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  updateRaid(dt) {
    const inp = this.input.state();
    // UI toggles
    if (inp.inventory || (this.invOpen && this.input.pressed.has('Escape'))) {
      if (this.invOpen) this.closeInventory(); else this.openInventory(this.lookTarget && Math.hypot(this.lookTarget.x - this.player.pos.x, this.lookTarget.z - this.player.pos.z) < 2.5 ? this.lookTarget : null);
    }
    if (inp.map) { this.hud.toggleMap(); if (this.hud.mapOpen) this.input.unlock(); else this.input.lock(); this.updatePause(); }
    if (this.hud.mapOpen && this.input.pressed.has('Escape')) { this.hud.toggleMap(false); this.input.lock(); }
    // Pause when the pointer is released without a UI open.
    const paused = !this.input.locked && !this.invOpen && !this.hud.mapOpen;
    if (paused) return;

    if (inp.interact && !this.invOpen && this.lookTarget) { this.openInventory(this.lookTarget); sfx.pickup(); }
    if (inp.heal) this.quickHeal();
    if (this.invOpen) inp.reload = inp.swap = inp.slot1 = inp.slot2 = inp.flashlight = false;

    this.raidElapsed += dt;
    this.player.update(dt, inp);
    if (this.state !== 'raid') return;
    this.zombies.update(dt, this.player, this);
    if (this.state !== 'raid') return;
    this.fx.update(dt);

    // Moon shadow follows the player
    const pp = this.player.pos;
    this.moon.position.set(pp.x + 30, 60, pp.z + 20);
    this.moon.target.position.set(pp.x, 0, pp.z);

    // What container are we looking at?
    this.lookTarget = null;
    if (!this.invOpen) {
      const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
      let best = 2.3;
      for (const c of this.world.containers) {
        const dx = c.x - pp.x, dz = c.z - pp.z;
        const d = Math.hypot(dx, dz);
        if (d > best) continue;
        if (d > 0.6 && (dx * fx + dz * fz) / d < 0.75) continue;
        best = d; this.lookTarget = c;
      }
    }

    // Extraction
    const ex = this.world.extracts.find((e) => Math.hypot(e.x - pp.x, e.z - pp.z) < 3.5);
    if (ex) {
      if (this.extractTimer == null) { this.extractTimer = 7; this.hud.message(`Extracting at ${ex.name}…`); }
      this.extractTimer -= dt;
      if (this.extractTimer <= 0) { sfx.extract(); return this.endRaid('extracted', `Extracted at ${ex.name}`); }
    } else this.extractTimer = null;

    if (this.raidElapsed >= this.raidTime) return this.endRaid('mia', 'Raid time ran out');

    // Heartbeat when badly hurt
    this.beat = (this.beat || 0) - dt;
    if (this.beat <= 0 && (this.player.hp.thorax < 30 || this.player.hp.head < 12)) { this.beat = 1; sfx.heartbeat(); }

    this.hud.update(dt, this);
  }
}

// Exposed for debugging from the browser console.
window.game = new Game();
