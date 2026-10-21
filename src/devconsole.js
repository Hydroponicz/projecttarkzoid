// In-game developer console: tabs of cheats, sliders and debug overlays plus
// a command line. Toggle with ` (backquote) or F1. Settings persist in
// localStorage so toggles survive a reload.
import { STATES, SEASONS, SEASON_DAYS } from './weather.js';
import * as THREE from 'three';
import { ITEMS, makeItem, LOOT_TABLES, rollLoot } from './items.js';
import { addItem, makeGrid } from './inventory.js';
import { PARTS } from './player.js';
import { STATS, MAX_SKILL } from './character.js';
import { moveCircle, raycast } from './collision.js';
import { HALF, setDoor } from './world.js';
import { NAV_CELL, NAV_N, FIELD_R } from './zombies.js';
import { fillWeapon, weaponRounds } from './weapons.js';
import { loadSave, writeSave, deleteSave } from './save.js';

const PREFS_KEY = 'tarkzoid-dev';
const FLAGS = {
  god: 'God mode (no damage, no death)',
  noclip: 'Noclip (walk through walls, 2x speed)',
  infStamina: 'Infinite stamina',
  infAmmo: 'Infinite ammo',
  noNeeds: 'Freeze hunger / thirst / fatigue',
  invisible: 'Invisible to zombies',
  freeze: 'Freeze zombies',
  freeBuild: 'Free build (no tools, materials or skill)',
  fullbright: 'Fullbright (always daylight)',
  noFog: 'Disable fog',
  colliders: 'Show collision boxes',
  labels: 'Show zombie AI labels',
  tracers: 'Show bullet trails and impacts (purple, 7 s)',
  pauseWhileOpen: 'Pause game while console is open',
};
const TABS = ['Player', 'World', 'Items', 'Debug', 'Save'];
const KITS = {
  'Rifleman': ['bp_tri', 'ak74', 'mag_ak30', 'mag_ak30', 'mag_ak45', ['ammo_545', { count: 60 }], 'scope_pso', 'sight_reddot', 'supp_rifle', 'grip_vert', 'armor_6b13', 'helmet_ssh', 'salewa'],
  'Marksman': ['bp_scav', 'sks', 'mag_sks', 'mag_sks', 'mag_sks', ['ammo_762', { count: 40 }], 'scope_6x', 'brake_ak'],
  'Shotgunner': ['bp_scav', 'mp133', ['ammo_12g', { count: 20 }], ['ammo_12g', { count: 20 }], 'sight_holo', 'grip_vert'],
  'Pistolero': ['bp_scav', 'pm', 'mag_pm', 'mag_pm', 'mag_pm', ['ammo_9x18', { count: 50 }], 'supp_pm'],
  'Builder': ['bp_tri', 'hammer', 'saw', ['planks', { count: 10 }], ['planks', { count: 10 }], ['planks', { count: 10 }], ['nails', { count: 100 }], ['nails', { count: 100 }]],
  'Mechanic': ['bp_tri', 'wrench', 'jack', 'tire', 'battery', ['spark_plugs', { count: 4 }], 'engine_parts', 'gas_can', 'brakes', ['scrap', { count: 3 }], 'tape'],
  'Medic': ['salewa', 'salewa', 'ai2', 'ai2', 'bandage', 'bandage', 'painkillers', 'antiviral'],
  'Lumberjack': ['axe', 'saw', 'bp_scav'],
  'Farmer': ['bp_tri', 'shovel', 'watering_can', 'fertilizer', ['seeds_carrot', { count: 6 }], ['seeds_potato', { count: 6 }], ['seeds_tomato', { count: 6 }], ['seeds_cabbage', { count: 6 }], ['seeds_corn', { count: 6 }]],
  'Survivor': ['water', 'water', 'beans', 'beans', 'crackers', 'soda'],
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class DevConsole {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'Player';
    this.timeScale = 1;
    this.history = [];
    this.histIdx = -1;
    this.labelEls = [];
    this.collTimer = 0;
    this.refreshTimer = 0;
    this.fps = 0; this.frames = 0; this.fpsTimer = 0;
    for (const k in FLAGS) this[k] = false;
    this.pauseWhileOpen = true;
    this.loadPrefs();
    this.buildDom();
    this.captureErrors();
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' || e.code === 'F1') { e.preventDefault(); this.toggle(); }
      else if (this.open && e.code === 'Escape' && document.activeElement !== this.cmd) this.toggle(false);
    }, true);
    this.log('Dev console ready. Type <b>help</b> for commands.', 'sys');
  }

  // ---------- persistence ----------
  loadPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      for (const k in FLAGS) if (k in p) this[k] = p[k];
      if (p.timeScale) this.timeScale = p.timeScale;
      if (p.tab) this.tab = p.tab;
    } catch (e) { /* ignore */ }
  }

  savePrefs() {
    const p = { timeScale: this.timeScale, tab: this.tab };
    for (const k in FLAGS) p[k] = this[k];
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  // ---------- DOM ----------
  buildDom() {
    const root = document.createElement('div');
    root.id = 'dev';
    root.innerHTML = `
      <div class="dev-head"><b>DEV CONSOLE</b><span class="dim">\` or F1 to toggle</span><button class="dev-x">✕</button></div>
      <div class="dev-tabs">${TABS.map((t) => `<button data-tab="${t}">${t}</button>`).join('')}</div>
      <div class="dev-body"></div>
      <div class="dev-log"></div>
      <div class="dev-cmdrow"><span>&gt;</span><input class="dev-cmd" spellcheck="false" autocomplete="off" placeholder="command (Tab completes, ↑↓ history)"></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.body = root.querySelector('.dev-body');
    this.logEl = root.querySelector('.dev-log');
    this.cmd = root.querySelector('.dev-cmd');
    root.querySelector('.dev-x').onclick = () => this.toggle(false);
    root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.tab; this.savePrefs(); this.render(); }; });
    this.cmd.addEventListener('keydown', (e) => this.onCmdKey(e));
    // Stop clicks inside the console from reaching the game canvas.
    root.addEventListener('mousedown', (e) => e.stopPropagation());

    this.labelLayer = document.createElement('div');
    this.labelLayer.id = 'dev-labels';
    document.body.appendChild(this.labelLayer);
  }

  toggle(v = !this.open) {
    this.open = v;
    this.root.style.display = v ? 'flex' : 'none';
    if (v) {
      this.game.input.unlock();
      this.render();
      setTimeout(() => this.cmd.focus(), 0);
    } else {
      this.cmd.blur();
      if (this.game.state === 'play' && !this.game.invOpen && !this.game.hud.mapOpen) this.game.resume();
    }
    this.game.updatePause();
  }

  get inGame() { return this.game.state === 'play' && this.game.player; }

  render() {
    this.root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    this.body.innerHTML = '';
    this.syncers = [];
    this.perfEl = this.navCanvas = this.tpCanvas = this.zstats = null;
    this['tab' + this.tab]();
    this.refreshTimer = 0; // draw maps/stats on the next frame
  }

  // Small builders for controls
  section(title) {
    const s = document.createElement('div');
    s.className = 'dev-sec';
    if (title) s.innerHTML = `<div class="dev-sec-t">${title}</div>`;
    this.body.appendChild(s);
    return s;
  }

  button(parent, label, fn, cls = '') {
    const b = document.createElement('button');
    b.className = 'dev-btn ' + cls;
    b.textContent = label;
    b.onclick = () => { try { fn(); } catch (e) { this.log(esc(e.message), 'err'); } };
    parent.appendChild(b);
    return b;
  }

  row(parent) { const r = document.createElement('div'); r.className = 'dev-row'; parent.appendChild(r); return r; }

  flag(parent, key) {
    const l = document.createElement('label');
    l.className = 'dev-flag';
    l.innerHTML = `<input type="checkbox" ${this[key] ? 'checked' : ''}> ${FLAGS[key]}`;
    l.querySelector('input').onchange = (e) => this.setFlag(key, e.target.checked);
    parent.appendChild(l);
  }

  setFlag(key, v) {
    this[key] = v;
    this.savePrefs();
    if (key === 'invisible' && v && this.game.zombies) for (const z of this.game.zombies.list) if (z.state === 'chase') { z.state = 'wander'; z.lastSeen = 0; }
    if (key === 'colliders' && !v) this.clearColliders();
    if (key === 'labels' && !v) this.labelLayer.innerHTML = '';
    if (this.game.state === 'play') this.game.updateLighting();
    this.log(`${key} ${v ? 'ON' : 'off'}`);
  }

  // slider: get() returns current value, set(v) applies it
  slider(parent, label, min, max, step, get, set) {
    const r = document.createElement('div');
    r.className = 'dev-slider';
    r.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = r.querySelector('input'), out = r.querySelector('output');
    const sync = () => { if (document.activeElement !== inp) { const v = get(); inp.value = v; out.textContent = Math.round(v * 10) / 10; } };
    inp.oninput = () => { set(+inp.value); out.textContent = inp.value; };
    sync();
    r.sync = sync;
    parent.appendChild(r);
    this.syncers.push(sync);
    return r;
  }

  notInGame() {
    const s = this.section();
    s.innerHTML = '<p class="dim">Start or continue a game to use this tab.</p>';
  }

  // ---------- tabs ----------
  tabPlayer() {
    const s0 = this.section('Cheats');
    for (const k of ['god', 'noclip', 'infStamina', 'infAmmo', 'noNeeds', 'invisible']) this.flag(s0, k);
    if (!this.inGame) return this.notInGame();
    const g = this.game, p = g.player;
    const s1 = this.section('Quick actions');
    const r1 = this.row(s1);
    this.button(r1, 'Heal all', () => this.run('heal'));
    this.button(r1, 'Stop bleeding', () => { p.bleeding.clear(); this.log('Bleeding stopped'); });
    this.button(r1, 'Cure infection', () => this.run('cure'));
    this.button(r1, 'Fill needs', () => { p.food = p.water = 100; p.fatigue = 0; p.stamina = 100; this.log('Needs filled'); });
    const r2 = this.row(s1);
    this.button(r2, 'Bleed', () => { p.bleeding.add('thorax'); this.log('Thorax bleeding'); });
    this.button(r2, 'Infect', () => { p.infected = true; this.log('Infected'); });
    this.button(r2, 'Break legs', () => { p.hp.legL = p.hp.legR = 0; this.log('Legs destroyed'); });
    this.button(r2, 'Kill player', () => this.run('kill'), 'danger');

    const s2 = this.section('Body parts');
    for (const k in PARTS) this.slider(s2, PARTS[k].name, 0, PARTS[k].max, 1, () => p.hp[k], (v) => { p.hp[k] = v; });
    const s3 = this.section('Needs & status');
    this.slider(s3, 'Food', 0, 100, 1, () => p.food, (v) => { p.food = v; });
    this.slider(s3, 'Water', 0, 100, 1, () => p.water, (v) => { p.water = v; });
    this.slider(s3, 'Fatigue', 0, 100, 1, () => p.fatigue, (v) => { p.fatigue = v; });
    this.slider(s3, 'Stamina', 0, 100, 1, () => p.stamina, (v) => { p.stamina = v; });
    this.slider(s3, 'Infection', 0, 99, 1, () => (p.infected ? p.infection : 0), (v) => { p.infected = v > 0; p.infection = v; });
    const s4 = this.section('Skills');
    for (const k in STATS) this.slider(s4, STATS[k].name, 0, MAX_SKILL, 1, () => p.skill[k], (v) => this.setSkill(k, v));
    const s5 = this.section('Loadouts (added to inventory)');
    const r5 = this.row(s5);
    for (const name in KITS) this.button(r5, name, () => this.run(`kit ${name}`));
  }

  tabWorld() {
    const s0 = this.section('Toggles');
    for (const k of ['freeze', 'freeBuild', 'fullbright', 'noFog']) this.flag(s0, k);
    if (!this.inGame) return this.notInGame();
    const g = this.game;
    const s1 = this.section('Time');
    this.slider(s1, 'Hour', 0, 23.99, 0.25, () => g.hour, (v) => { g.time = (g.day - 1) * 1440 + v * 60; g.updateLighting(); });
    this.slider(s1, 'Day', 1, 60, 1, () => g.day, (v) => { g.time = (v - 1) * 1440 + g.hour * 60; });
    const r1 = this.row(s1);
    r1.insertAdjacentHTML('beforeend', '<span class="dim">Speed:</span>');
    for (const sp of [0, 1, 5, 20, 60]) {
      const b = this.button(r1, sp + 'x', () => { this.timeScale = sp; this.savePrefs(); this.render(); this.log(`Time speed ${sp}x`); });
      if (this.timeScale === sp) b.classList.add('on');
    }
    const r1b = this.row(s1);
    this.button(r1b, 'Dawn (06:00)', () => this.run('time 6:00'));
    this.button(r1b, 'Noon', () => this.run('time 12:00'));
    this.button(r1b, 'Dusk (20:00)', () => this.run('time 20:00'));
    this.button(r1b, 'Midnight', () => this.run('time 0:00'));

    const s4 = this.section('Teleport — click the map');
    this.tpCanvas = document.createElement('canvas');
    this.tpCanvas.width = this.tpCanvas.height = 400;
    this.tpCanvas.className = 'dev-map';
    this.tpCanvas.onclick = (e) => {
      const r = this.tpCanvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * HALF * 2 - HALF, z = ((e.clientY - r.top) / r.height) * HALF * 2 - HALF;
      this.teleport(x, z);
    };
    s4.appendChild(this.tpCanvas);


    const s2 = this.section('Zombies');
    const r2 = this.row(s2);
    r2.innerHTML = `<select class="dev-ztype"><option>walker</option><option>runner</option><option>brute</option><option value="">random</option></select>
      <input class="dev-zn" type="number" value="5" min="1" max="200" style="width:56px">
      <select class="dev-zwhere"><option value="look">at crosshair</option><option value="near">around me</option><option value="random">random on map</option></select>`;
    this.button(r2, 'Spawn', () => {
      const t = r2.querySelector('.dev-ztype').value, n = +r2.querySelector('.dev-zn').value, w = r2.querySelector('.dev-zwhere').value;
      this.spawnZombies(t || null, n, w);
    });
    const r3 = this.row(s2);
    this.button(r3, 'Kill within 20m', () => this.run('killall 20'));
    this.button(r3, 'Kill all', () => this.run('killall'), 'danger');
    this.button(r3, 'All chase me', () => { for (const z of g.zombies.list) { z.state = 'chase'; z.lastSeen = 30; } this.log('Every zombie is coming'); });
    this.button(r3, 'All calm', () => { for (const z of g.zombies.list) { z.state = 'wander'; z.lastSeen = 0; } this.log('Zombies calmed'); });
    this.zstats = document.createElement('div');
    this.zstats.className = 'dev-stats';
    s2.appendChild(this.zstats);

    const sv = this.section('Survivors');
    const rs = this.row(sv);
    this.button(rs, 'Spawn friendly', () => this.run('survivor friendly'));
    this.button(rs, 'Spawn wary', () => this.run('survivor neutral'));
    this.button(rs, 'Spawn hostile', () => this.run('survivor hostile'), 'danger');
    this.button(rs, 'List', () => this.run('survivors'));
    this.button(rs, 'Kill all survivors', () => { const n = g.survivors.list.length; for (const s of [...g.survivors.list]) s.die('dev'); this.log(`Killed ${n} survivors`); }, 'danger');

    const s3 = this.section('Doors, base & loot');
    const r4 = this.row(s3);
    this.button(r4, 'Open all doors', () => this.setAllDoors(true));
    this.button(r4, 'Close all doors', () => this.setAllDoors(false));
    this.button(r4, 'Repair everything', () => this.run('repair'));
    const r5 = this.row(s3);
    this.button(r5, 'Claim safehouse here', () => g.claimSafehouse());
    this.button(r5, 'Clear safehouse', () => { g.safehouse = null; this.log('Safehouse cleared'); });
    this.button(r5, 'Destroy my structures', () => { for (const s of [...g.builder.structures]) g.builder.remove(s); this.log('All structures removed'); }, 'danger');
    const r6 = this.row(s3);
    this.button(r6, 'Restock all loot', () => this.run('restock'));
    this.button(r6, 'Empty nearby containers', () => {
      let n = 0;
      for (const c of g.world.containers) if (Math.hypot(c.x - g.player.pos.x, c.z - g.player.pos.z) < 15) { c.grid.items.length = 0; n++; }
      this.log(`Emptied ${n} containers`);
    });

  }

  tabItems() {
    const s0 = this.section('Spawn items');
    s0.innerHTML += `<div class="dev-row"><input class="dev-filter" placeholder="filter…">
      <select class="dev-itype"><option value="">all types</option>${[...new Set(Object.values(ITEMS).map((d) => d.type))].map((t) => `<option>${t}</option>`).join('')}</select>
      <span class="dim">count</span><input class="dev-icount" type="number" value="1" min="1" style="width:56px">
      <select class="dev-itarget"><option value="inv">pockets/backpack</option><option value="look">looked-at container</option><option value="drop">drop at feet</option></select></div>
      <div class="dev-items"></div>`;
    const list = s0.querySelector('.dev-items');
    const draw = () => {
      const f = s0.querySelector('.dev-filter').value.toLowerCase(), t = s0.querySelector('.dev-itype').value;
      list.innerHTML = '';
      for (const [k, d] of Object.entries(ITEMS)) {
        if (t && d.type !== t) continue;
        if (f && !k.includes(f) && !d.name.toLowerCase().includes(f)) continue;
        const b = document.createElement('button');
        b.className = 'dev-item';
        b.innerHTML = `<i style="background:${d.color}"></i>${esc(d.name)}<small>${k} · ${d.w}×${d.h}${d.stack ? ' · stack ' + d.stack : ''}</small>`;
        b.onclick = () => this.give(k, +s0.querySelector('.dev-icount').value || 1, s0.querySelector('.dev-itarget').value);
        list.appendChild(b);
      }
    };
    s0.querySelector('.dev-filter').oninput = draw;
    s0.querySelector('.dev-itype').onchange = draw;
    draw();
    if (this.inGame) {
      const s1 = this.section('Inventory');
      const r = this.row(s1);
      this.button(r, 'Clear pockets', () => { this.game.profile.pockets.items.length = 0; this.log('Pockets cleared'); });
      this.button(r, 'Clear backpack', () => { const b = this.game.profile.equip.backpack; if (b) b.grid.items.length = 0; this.log('Backpack cleared'); });
      this.button(r, 'Refill weapon', () => { const w = this.game.player.weapon; if (w) fillWeapon(w); this.log('Weapon loaded and chambered'); });
    }
  }

  tabDebug() {
    const s0 = this.section('Overlays');
    for (const k of ['colliders', 'labels', 'tracers', 'fullbright', 'noFog']) this.flag(s0, k);
    const s1 = this.section('Performance & state');
    this.perfEl = document.createElement('div');
    this.perfEl.className = 'dev-stats';
    s1.appendChild(this.perfEl);
    if (!this.inGame) return;
    const s2 = this.section('Zombie flow field (60m around you) — dark = blocked, colour = distance to you');
    this.navCanvas = document.createElement('canvas');
    this.navCanvas.width = this.navCanvas.height = FIELD_R * 2 + 1;
    this.navCanvas.className = 'dev-map pix';
    s2.appendChild(this.navCanvas);
    const s3 = this.section('Raw state');
    const r = this.row(s3);
    this.button(r, 'Log player', () => this.log(esc(JSON.stringify(this.game.player.serialize()))));
    this.button(r, 'Log profile', () => this.log(esc(JSON.stringify({ name: this.game.profile.name, stats: this.game.profile.stats, prof: this.game.profile.profession }))));
    this.button(r, 'Log look target', () => {
      const t = this.game.lookTarget;
      this.log(t ? esc(JSON.stringify({ kind: t.kind, type: t.type, name: t.name, x: t.x, z: t.z, hp: t.hp, open: t.open, items: t.grid?.items.length })) : 'Nothing targeted');
    });
  }

  tabSave() {
    const g = this.game;
    const s0 = this.section('Save data');
    const info = document.createElement('div');
    info.className = 'dev-stats';
    const raw = (() => { try { return localStorage.getItem('tarkzoid-save-v2') || ''; } catch (e) { return ''; } })();
    const sv = loadSave();
    info.innerHTML = sv
      ? `Seed <b>${sv.seed}</b> · day ${Math.floor(sv.time / 1440) + 1} · ${(raw.length / 1024).toFixed(1)} KB<br>Character: ${sv.character ? esc(sv.character.name) : '<i>none</i>'} · graveyard: ${(sv.graveyard || []).length}<br>Structures: ${sv.world?.structures.length ?? 0} · zombies: ${sv.world?.zombies.length ?? 0}`
      : 'No save yet.';
    s0.appendChild(info);
    const r = this.row(s0);
    this.button(r, 'Save now', () => this.run('save'));
    this.button(r, 'Export JSON', () => {
      g.saveGame();
      const blob = new Blob([localStorage.getItem('tarkzoid-save-v2') || '{}'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tarkzoid-save-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      this.log('Save exported');
    });
    this.button(r, 'Copy to clipboard', () => { g.saveGame(); navigator.clipboard?.writeText(localStorage.getItem('tarkzoid-save-v2') || ''); this.log('Save copied'); });
    const s1 = this.section('Import (replaces the current save)');
    s1.innerHTML += '<textarea class="dev-import" placeholder="Paste save JSON here, or choose a file"></textarea><input type="file" accept=".json,application/json" class="dev-file">';
    const r1 = this.row(s1);
    this.button(r1, 'Import', () => this.importSave(s1.querySelector('.dev-import').value));
    s1.querySelector('.dev-file').onchange = async (e) => { const f = e.target.files[0]; if (f) this.importSave(await f.text()); };
    const s2 = this.section('Danger zone');
    const r2 = this.row(s2);
    this.button(r2, 'Reroll world seed (new world, keep character)', () => {
      const sv2 = loadSave();
      if (!sv2) return;
      if (g.state === 'play') { g.saveGame(); g.teardown(); }
      sv2.seed = Math.floor(Math.random() * 2 ** 31);
      sv2.world = null; sv2.safehouse = null;
      if (sv2.character) sv2.character.player = null;
      writeSave(sv2);
      g.save = sv2;
      this.log(`New seed ${sv2.seed}`);
      if (sv2.character) g.loadWorld(); else g.showMenu();
    }, 'danger');
    this.button(r2, 'Wipe save', () => {
      if (!confirm('Delete the save?')) return;
      if (g.state === 'play') g.teardown();
      deleteSave(); g.save = null; g.showMenu(); this.log('Save wiped');
    }, 'danger');
  }

  importSave(text) {
    try {
      const data = JSON.parse(text);
      if (typeof data.seed !== 'number') throw new Error('Not a Tarkzoid save (missing seed)');
      const g = this.game;
      if (g.state === 'play') g.teardown();
      writeSave(data);
      g.save = data;
      g.showMenu();
      this.log('Save imported — continue from the menu');
      this.render();
    } catch (e) { this.log('Import failed: ' + esc(e.message), 'err'); }
  }

  // ---------- actions ----------
  setSkill(k, v) {
    const p = this.game.player;
    p.skill[k] = v;
    if (k === 'stealth') p.stealthMul = 1 - 0.07 * v;
  }

  teleport(x, z) {
    if (!this.inGame) return;
    const p = this.game.player;
    x = Math.max(-HALF + 1, Math.min(HALF - 1, x)); z = Math.max(-HALF + 1, Math.min(HALF - 1, z));
    p.pos.set(x, 0, z);
    p.floorY = 0; // (onto the ground floor)
    moveCircle(this.game.world.hash, p.pos, p.radius, 0, 0);
    this.log(`Teleported to ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }

  crosshairPoint(max = 25) {
    const p = this.game.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const r = raycast(this.game.world.hash, p.pos.x, p.pos.z, p.pos.x + fx * max, p.pos.z + fz * max, 'blocksShot');
    const d = Math.max(1.5, r.t * max - 0.6);
    return { x: p.pos.x + fx * d, z: p.pos.z + fz * d };
  }

  spawnZombies(type, n, where) {
    if (!this.inGame) return;
    const g = this.game, p = g.player.pos;
    let made = 0;
    for (let i = 0; i < n; i++) {
      let pt;
      if (where === 'look') { pt = this.crosshairPoint(); pt.x += (Math.random() - 0.5) * 1.5; pt.z += (Math.random() - 0.5) * 1.5; }
      else if (where === 'near') { const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 8; pt = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d }; }
      else pt = g.zombies.randomOpenPoint(p, 20);
      if (!pt) continue;
      const z = g.zombies.spawn(pt.x, pt.z, type);
      moveCircle(g.world.hash, z.pos, z.radius, 0, 0);
      made++;
    }
    this.log(`Spawned ${made} ${type || 'random'} zombie${made === 1 ? '' : 's'}`);
  }

  give(key, count = 1, target = 'inv') {
    if (!ITEMS[key]) return this.log(`Unknown item "${esc(key)}"`, 'err');
    if (!this.inGame) return this.log('Not in game', 'err');
    const g = this.game, def = ITEMS[key];
    const items = [];
    if (def.stack) {
      for (let left = count; left > 0; left -= def.stack) items.push(makeItem(key, { count: Math.min(def.stack, left) }));
    } else {
      for (let i = 0; i < count; i++) {
        const it = makeItem(key, def.type === 'mag' ? { rounds: def.cap } : def.type === 'weapon' ? { loaded: 0 } : def.part ? { cond: 100 } : def.type === 'fuel' ? { fuel: def.cap } : def.waterCap ? { water: def.waterCap } : {});
        if (def.type === 'weapon') fillWeapon(it);
        items.push(it);
      }
    }
    let dest = target;
    const look = g.lookTarget?.grid;
    if (target === 'look' && !look) { this.log('Not looking at a container — dropping instead', 'warn'); dest = 'drop'; }
    let dropped = 0;
    const slots = { weapon: 'weapon', melee: 'melee', armor: 'armor', helmet: 'helmet', backpack: 'backpack', clothing: 'clothing', rig: 'rig' };
    for (const it of items) {
      // Fill an empty equipment slot first (weapon, armor, backpack...).
      const slot = slots[def.type];
      if (dest === 'inv' && slot && !g.profile.equip[slot]) { g.profile.equip[slot] = it; continue; }
      if (dest === 'look' && addItem(look, it)) continue;
      if (dest === 'inv' && g.player.ammoGrids().some((gr) => addItem(gr, it))) continue;
      g.dropItem(it); dropped++;
    }
    g.player.buildViewmodel();
    this.log(`Gave ${count} × ${def.name}${dropped ? ` (${dropped} dropped at feet — no room)` : ''}`);
  }

  setAllDoors(open) {
    const g = this.game;
    for (const d of g.world.doors) if (!d.broken) setDoor(d, open);
    for (const s of g.builder.structures) if (s.door && s.open !== open) g.builder.toggleDoor(s);
    g.zombies.buildNav();
    this.log(`All doors ${open ? 'opened' : 'closed'}`);
  }

  // Called every frame from the game loop (after the simulation step).
  applyCheats() {
    const p = this.game.player;
    if (this.infStamina) p.stamina = 100;
    if (this.infAmmo && p.weapon && weaponRounds(p.weapon) < 2) fillWeapon(p.weapon);
    if (this.noNeeds) { p.food = Math.max(p.food, 100); p.water = Math.max(p.water, 100); p.fatigue = 0; }
    if (this.god) { p.bleeding.clear(); if (p.infection > 90) p.infection = 90; }
  }

  update(dt) {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) { this.fps = this.frames / this.fpsTimer; this.frames = 0; this.fpsTimer = 0; }
    const playing = this.inGame && this.game.world;
    if (playing && this.colliders) {
      this.collTimer -= dt;
      if (this.collTimer <= 0) { this.collTimer = 0.4; this.drawColliders(); }
    }
    if (playing && this.labels) this.drawLabels(); else if (this.labelLayer.childElementCount) this.labelLayer.innerHTML = '';
    if (!this.open) return;
    this.refreshTimer -= dt;
    if (this.refreshTimer > 0) return;
    this.refreshTimer = 0.25;
    for (const s of this.syncers || []) s();
    if (this.tab === 'Debug') this.drawPerf();
    if (playing && this.tab === 'Debug' && this.navCanvas) this.drawNav();
    if (playing && this.tab === 'World') { this.drawTpMap(); this.drawZStats(); }
  }

  drawPerf() {
    if (!this.perfEl) return;
    const g = this.game, info = g.renderer.info;
    const lines = [`FPS <b>${this.fps.toFixed(0)}</b> · draw calls ${info.render.calls} · triangles ${(info.render.triangles / 1000).toFixed(1)}k · geometries ${info.memory.geometries}`];
    if (this.inGame && g.world) {
      const p = g.player.pos;
      lines.push(`Pos ${p.x.toFixed(1)}, ${p.z.toFixed(1)} · yaw ${Math.round((((-g.player.yaw * 180) / Math.PI) % 360 + 360) % 360)}° · state ${g.state}`);
      lines.push(`Day ${g.day} ${g.clockText()} · ${g.isNight ? 'night' : 'day'} · time ${this.timeScale}x · daylight ${(g.daylight ?? 0).toFixed(2)}`);
      lines.push(`Zombies ${g.zombies.list.length} · structures ${g.builder.structures.length} · containers ${g.world.containers.length} (${g.world.generatedContainers} generated) · doors ${g.world.doors.length} (${g.world.doors.filter((d) => d.broken).length} broken)`);
      lines.push(`Safehouse ${g.safehouse ? `${g.safehouse.name} (inside: ${g.inSafehouse(p.x, p.z)})` : 'none'} · build mode ${g.builder.active} · look ${g.lookTarget ? esc(g.lookTarget.name) : '—'}`);
    }
    this.perfEl.innerHTML = lines.join('<br>');
  }

  drawZStats() {
    if (!this.zstats) return;
    const by = {};
    for (const z of this.game.zombies.list) { const k = `${z.type}/${z.state}`; by[k] = (by[k] || 0) + 1; }
    this.zstats.innerHTML = `Total <b>${this.game.zombies.list.length}</b> · nearest ${this.game.zombies.nearest?.toFixed(1) ?? '—'}m<br>` +
      Object.entries(by).sort().map(([k, n]) => `${k}: ${n}`).join(' · ');
  }

  drawTpMap() {
    const c = this.tpCanvas;
    if (!c || !c.isConnected) return;
    const g = this.game, ctx = c.getContext('2d');
    const S = c.width / (HALF * 2), tx = (v) => (v + HALF) * S;
    ctx.fillStyle = '#26301f'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#3a3a3a';
    for (let k = -100; k <= 100; k += 40) { ctx.fillRect(tx(k) - 4 * S, tx(-104), 8 * S, 208 * S); ctx.fillRect(tx(-104), tx(k) - 4 * S, 208 * S, 8 * S); }
    ctx.fillStyle = '#7a6a52';
    for (const b of g.world.buildings) ctx.fillRect(tx(b.x0), tx(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    ctx.fillStyle = '#c8a050';
    for (const s of g.builder.structures) ctx.fillRect(tx(s.box.minX), tx(s.box.minZ), 3, 3);
    const col = { chase: '#f44', investigate: '#fa4', wander: '#7a7' };
    for (const z of g.zombies.list) { ctx.fillStyle = col[z.state] || '#aaa'; ctx.fillRect(tx(z.pos.x) - 1, tx(z.pos.z) - 1, 3, 3); }
    if (g.safehouse) { const s = g.safehouse; ctx.strokeStyle = '#e5c84a'; ctx.strokeRect(tx(s.x0), tx(s.z0), (s.x1 - s.x0) * S, (s.z1 - s.z0) * S); }
    const p = g.player.pos;
    ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(tx(p.x), tx(p.z), 4, 0, 7); ctx.fill();
  }

  drawNav() {
    const c = this.navCanvas;
    if (!c.isConnected) return;
    const z = this.game.zombies, ctx = c.getContext('2d');
    const W = FIELD_R * 2 + 1;
    const img = ctx.createImageData(W, W);
    const [oi, oj] = z.fieldOrigin;
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < W; j++) {
        const gi = oi + i, gj = oj + j;
        const o = (j * W + i) * 4;
        const blocked = gi < 0 || gj < 0 || gi >= NAV_N || gj >= NAV_N || z.blocked[gi * NAV_N + gj];
        const d = z.field[i * W + j];
        if (blocked) { img.data[o] = img.data[o + 1] = img.data[o + 2] = 20; }
        else if (d === 65535) { img.data[o] = 90; img.data[o + 1] = 30; img.data[o + 2] = 30; }
        else { const t = Math.min(1, d / 120); img.data[o] = 40 + 200 * t; img.data[o + 1] = 200 - 140 * t; img.data[o + 2] = 80; }
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    for (const zb of z.list) {
      const i = Math.floor((zb.pos.x + HALF) / NAV_CELL) - oi, j = Math.floor((zb.pos.z + HALF) / NAV_CELL) - oj;
      if (i < 0 || j < 0 || i >= W || j >= W) continue;
      ctx.fillStyle = zb.state === 'chase' ? '#f0f' : '#fff';
      ctx.fillRect(i - 1, j - 1, 3, 3);
    }
    ctx.fillStyle = '#ff0'; ctx.fillRect(FIELD_R - 1, FIELD_R - 1, 3, 3);
  }

  clearColliders() {
    if (this.collMesh) { this.collMesh.parent?.remove(this.collMesh); this.collMesh.geometry.dispose(); this.collMesh = null; }
  }

  drawColliders() {
    this.clearColliders();
    const g = this.game, p = g.player.pos, R = 30;
    const pos = [], col = [];
    const color = new THREE.Color();
    for (const b of g.world.hash.query(p.x - R, p.z - R, p.x + R, p.z + R, [])) {
      if (b.structure?.kind === 'door') color.set(b.noCollide ? 0x44ff44 : 0xff4444);
      else if (b.built) color.set(0xffaa33);
      else if (b.tree != null) color.set(0x44aa44);
      else if (!b.blocksSight) color.set(0x44aaff);
      else color.set(0xffffff);
      const h = Math.min(b.h ?? 3, 3), y0 = 0.02;
      const c = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
        pos.push(ax, y0, az, bx, y0, bz, ax, h, az, bx, h, bz, ax, y0, az, ax, h, az);
        for (let k = 0; k < 6; k++) col.push(color.r, color.g, color.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.collMesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.8 }));
    this.collMesh.renderOrder = 999;
    g.world.group.add(this.collMesh);
  }

  drawLabels() {
    const g = this.game, cam = g.camera, p = g.player.pos;
    const v = new THREE.Vector3();
    const near = g.zombies.list.filter((z) => Math.hypot(z.pos.x - p.x, z.pos.z - p.z) < 30);
    while (this.labelEls.length < near.length) { const d = document.createElement('div'); d.className = 'dev-label'; this.labelLayer.appendChild(d); this.labelEls.push(d); }
    this.labelEls.forEach((el, i) => {
      const z = near[i];
      if (!z) { el.style.display = 'none'; return; }
      v.set(z.pos.x, z.height + 0.3, z.pos.z).project(cam);
      if (v.z > 1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
      el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
      el.className = 'dev-label ' + z.state;
      el.textContent = `${z.type} ${z.state} ${Math.ceil(z.hp)}hp ${Math.hypot(z.pos.x - p.x, z.pos.z - p.z).toFixed(0)}m${z.canSee ? ' 👁' : ''}${z.stuck > 0.6 ? ' BASH' : ''}`;
    });
  }

  // ---------- log ----------
  log(html, cls = '') {
    const d = document.createElement('div');
    d.className = 'dev-line ' + cls;
    d.innerHTML = html;
    this.logEl.appendChild(d);
    while (this.logEl.childElementCount > 300) this.logEl.firstChild.remove();
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  captureErrors() {
    window.addEventListener('error', (e) => this.log(`⚠ ${esc(e.message)} <span class="dim">${esc((e.filename || '').split('/').pop())}:${e.lineno}</span>`, 'err'));
    window.addEventListener('unhandledrejection', (e) => this.log(`⚠ ${esc(e.reason?.message || e.reason)}`, 'err'));
    const orig = console.error.bind(console);
    console.error = (...a) => { this.log('console.error: ' + esc(a.map(String).join(' ')), 'err'); orig(...a); };
  }

  // ---------- command line ----------
  onCmdKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const v = this.cmd.value.trim();
      if (!v) return;
      this.history.unshift(v);
      this.histIdx = -1;
      this.cmd.value = '';
      this.log(`<span class="dim">&gt; ${esc(v)}</span>`);
      this.run(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.histIdx < this.history.length - 1) this.cmd.value = this.history[++this.histIdx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.histIdx = Math.max(-1, this.histIdx - 1);
      this.cmd.value = this.histIdx >= 0 ? this.history[this.histIdx] : '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    } else if (e.key === 'Escape') {
      this.toggle(false);
    } else if (e.key === '`') {
      e.preventDefault();
    }
  }

  complete() {
    const parts = this.cmd.value.split(' ');
    const last = parts[parts.length - 1].toLowerCase();
    let pool;
    if (parts.length === 1) pool = Object.keys(this.commands());
    else if (['give', 'drop'].includes(parts[0])) pool = Object.keys(ITEMS);
    else if (parts[0] === 'spawn') pool = ['walker', 'runner', 'brute', 'random'];
    else if (parts[0] === 'kit') pool = Object.keys(KITS);
    else if (parts[0] === 'skill') pool = Object.keys(STATS);
    else if (parts[0] === 'flag') pool = Object.keys(FLAGS);
    else if (parts[0] === 'tp') pool = ['safehouse', 'spawn', 'hospital', 'pharmacy', 'police', 'office', 'skyscraper', 'grocery', 'hardware', 'gas', 'military', 'checkpoint', 'clinic'];
    else return;
    const hits = pool.filter((k) => k.toLowerCase().startsWith(last));
    if (hits.length === 1) { parts[parts.length - 1] = hits[0]; this.cmd.value = parts.join(' ') + ' '; }
    else if (hits.length > 1) {
      this.log(hits.join('  '), 'dim');
      let pre = hits[0];
      for (const h of hits) while (!h.startsWith(pre)) pre = pre.slice(0, -1);
      parts[parts.length - 1] = pre; this.cmd.value = parts.join(' ');
    }
  }

  commands() {
    const g = this.game;
    const need = () => { if (!this.inGame) throw new Error('Not in game'); };
    const flagCmd = (k) => (a) => this.setFlag(k, a[0] ? a[0] === 'on' || a[0] === '1' : !this[k]);
    return {
      help: { d: 'List commands', f: () => {
        for (const [k, c] of Object.entries(this.commands())) this.log(`<b>${k}</b> ${c.u ? `<span class="dim">${esc(c.u)}</span>` : ''} — ${c.d}`);
      } },
      give: { u: '<item> [count]', d: 'Give an item (Tab completes keys)', f: (a) => this.give(a[0], +a[1] || 1, 'inv') },
      drop: { u: '<item> [count]', d: 'Spawn an item at your feet', f: (a) => this.give(a[0], +a[1] || 1, 'drop') },
      kit: { u: '<name>', d: `Give a loadout: ${Object.keys(KITS).join(', ')}`, f: (a) => {
        need();
        const kit = KITS[Object.keys(KITS).find((k) => k.toLowerCase() === (a[0] || '').toLowerCase())];
        if (!kit) throw new Error('Unknown kit');
        for (const e of kit) { const [k, o] = Array.isArray(e) ? e : [e, {}]; this.give(k, o.count || 1, 'inv'); }
      } },
      spawn: { u: '<walker|runner|brute|random> [count]', d: 'Spawn zombies at your crosshair', f: (a) => { need(); this.spawnZombies(a[0] === 'random' ? null : a[0] || 'walker', +a[1] || 1, 'look'); } },
      killall: { u: '[radius]', d: 'Kill zombies (optionally within radius)', f: (a) => {
        need();
        const r = +a[0] || Infinity, p = g.player.pos;
        const victims = g.zombies.list.filter((z) => Math.hypot(z.pos.x - p.x, z.pos.z - p.z) <= r);
        for (const z of victims) g.zombies.kill(z);
        this.log(`Killed ${victims.length} zombies`);
      } },
      tp: { u: '<x> <z> | safehouse | spawn | trader [name] | <place>', d: 'Teleport (places: hospital, pharmacy, police, office, military, checkpoint...)', f: (a) => {
        need();
        if (a[0] === 'safehouse') { const s = g.safehouse; if (!s) throw new Error('No safehouse'); return this.teleport((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2); }
        if (a[0] === 'trader') {
          const ts = (g.traders?.list || []).filter((t) => t.building && (!a[1] || t.name.toLowerCase().startsWith(a[1].toLowerCase()) || t.arch.startsWith(a[1])));
          if (!ts.length) throw new Error('No such trader');
          const t = ts[0]; t.discovered = true;
          this.log(`→ ${esc(t.title)}`);
          return this.teleport(t.spot.x - t.spot.nx * 2, t.spot.z - t.spot.nz * 2);
        }
        if (a[0] === 'spawn') { const h = g.world.houses[Math.floor(Math.random() * g.world.houses.length)]; return this.teleport((h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2); }
        // tp hospital / pharmacy / police / military / checkpoint / office...
        const lm = (g.world.landmarks || []).filter((l) => l.kind.startsWith(a[0]) || l.name.toLowerCase().includes(a[0].toLowerCase()));
        if (lm.length) { const l = lm[Math.floor(Math.random() * lm.length)]; this.log(`→ ${esc(l.name)}`); return this.teleport(l.x + 3, l.z + 3); }
        if (a.length < 2) throw new Error('Usage: tp <x> <z>');
        this.teleport(+a[0], +a[1]);
      } },
      car: { u: '[sedan|police|pickup|military]', d: 'Spawn a working vehicle in front of you', f: (a) => {
        need();
        const p = g.player, type = ['sedan', 'police', 'pickup', 'military'].includes(a[0]) ? a[0] : 'sedan';
        const x = p.pos.x - Math.sin(p.yaw) * 5, z = p.pos.z - Math.cos(p.yaw) * 5;
        const v = g.vehicles.spawnExtra({ x, z, rot: p.yaw + Math.PI / 2, type, color: [0x6a2222, 0x22446a, 0x2a4a2a][Math.floor(Math.random() * 3)], rng: Math.random() }, null);
        for (const k in v.parts) v.parts[k] = 100;
        v.fuel = v.def.tank;
        this.log(`Spawned a ${v.name}`);
      } },
      weather: { u: '[clear|cloudy|overcast|fog|rain|storm|snow|blizzard] [hours]', d: 'Show or set the weather (blends in over a minute; add "now" to snap)', f: (a) => {
        need();
        const W = g.weather;
        if (a[0]) {
          if (!STATES[a[0]]) throw new Error('Unknown weather: ' + Object.keys(STATES).join(', '));
          W.setState(a[0], +a[1] || undefined);
          if (a.includes('now')) { const st = STATES[a[0]]; Object.assign(W.mix, { cloud: st.cloud, fog: st.fog, rain: st.rain, snow: st.snow }); W.mix.wind = W.windTarget; }
        }
        this.log(`${esc(W.hudText())} · next ${W.next} in ${Math.round(W.left)} min · snow ${W.snowCover.toFixed(2)} · wet ground ${W.wetGround.toFixed(2)} · body ${(g.player.bodyTemp ?? 37).toFixed(1)}°C wet ${Math.round(g.player.wet || 0)}`);
      } },
      season: { u: '<spring|summer|autumn|winter>', d: 'Jump to the start of a season (shifts the calendar, not the clock)', f: (a) => {
        need();
        const i = SEASONS.findIndex((s) => s.id === a[0]);
        if (i < 0) throw new Error('Unknown season');
        const W = g.weather, Y = SEASON_DAYS * 4;
        W.offset = ((i * SEASON_DAYS - (g.day - 1)) % Y + Y) % Y;
        W.pickNext();
        this.log(`Now ${W.season.name}, day ${W.seasonDay}`);
      } },
      lightning: { d: 'Strike lightning at your crosshair', f: () => { need(); const p = g.player; const r = g.weather.strike({ x: p.pos.x - Math.sin(p.yaw) * 30, z: p.pos.z - Math.cos(p.yaw) * 30 }); this.log(`Strike ${r.d.toFixed(0)} m away`); } },
      grow: { u: '[hours]', d: 'Advance every garden plot (default: until ripe)', f: (a) => {
        need();
        const F = g.farming;
        if (a[0]) { F.tick(+a[0]); F.last = g.time; }
        else for (const p of F.plots) if (p.crop && !p.dead) { p.growth = 1; p.ripeFor = 0; p.health = Math.max(p.health, 60); }
        for (const p of F.plots) F.redraw(p);
        F.renderPanel();
        this.log(`${F.plots.filter((p) => F.ripe(p)).length} of ${F.plots.length} plots ripe`);
      } },
      farmxp: { u: '<xp>', d: 'Add Farming experience', f: (a) => { need(); g.farming.gainXp(+a[0] || 50); this.log(`Farming ${g.profile.stats.farming} (${Math.round(g.profile.farmXp)} xp)`); } },
      fixcar: { d: 'Fully repair and refuel the nearest vehicle', f: () => {
        need();
        const v = g.vehicles.nearest(g.player.pos, 12);
        if (!v) throw new Error('No vehicle within 12 m');
        for (const k in v.parts) v.parts[k] = 100;
        v.fuel = v.def.tank; v.buildMesh(v === g.vehicles.active);
        this.log(`${v.name} repaired and refuelled`);
      } },
      traders: { d: 'List trading posts (reveals them on the map)', f: () => {
        need();
        for (const t of g.traders.list) {
          t.discovered = true;
          const active = t.def.quests.filter((q) => t.quests[q.id]?.st === 'active').length, done = t.def.quests.filter((q) => t.quests[q.id]?.st === 'done').length;
          this.log(`${esc(t.title)} (${t.arch}) at ${t.spot?.x.toFixed(0)}, ${t.spot?.z.toFixed(0)} · LL${g.traders.ll(t)} rep ${t.rep} · quests ${done} done, ${active} active${t.dead ? ' · DEAD' : ''}`);
        }
      } },
      rep: { u: '<amount> [trader]', d: "Set reputation with a trader (default: the nearest)", f: (a) => {
        need();
        const p = g.player.pos;
        const ts = g.traders.list.filter((t) => t.spot && (!a[1] || t.name.toLowerCase().startsWith(a[1].toLowerCase())));
        const t = ts.sort((x, y) => Math.hypot(x.spot.x - p.x, x.spot.z - p.z) - Math.hypot(y.spot.x - p.x, y.spot.z - p.z))[0];
        if (!t) throw new Error('No trader');
        t.rep = +a[0] || 0;
        this.log(`${esc(t.name)}: rep ${t.rep}, LL${g.traders.ll(t)}`);
      } },
      pos: { d: 'Print your position', f: () => { need(); const p = g.player.pos; this.log(`${p.x.toFixed(2)}, ${p.z.toFixed(2)}`); } },
      time: { u: '<hh:mm> | +<hours>', d: 'Set or advance the clock', f: (a) => {
        need();
        if (!a[0]) return this.log(`Day ${g.day} ${g.clockText()}`);
        if (a[0].startsWith('+')) g.time += parseFloat(a[0].slice(1)) * 60;
        else { const [h, m = 0] = a[0].split(':').map(Number); g.time = (g.day - 1) * 1440 + h * 60 + m; }
        g.updateLighting();
        this.log(`Day ${g.day} ${g.clockText()}`);
      } },
      speed: { u: '<multiplier>', d: 'Time speed (1 = 1 game min/sec)', f: (a) => { this.timeScale = Math.max(0, +a[0] || 1); this.savePrefs(); this.log(`Time speed ${this.timeScale}x`); } },
      heal: { d: 'Fully heal all body parts and stop bleeding', f: () => {
        need();
        const p = g.player;
        for (const k in PARTS) p.hp[k] = PARTS[k].max;
        p.bleeding.clear();
        this.log('Healed');
      } },
      cure: { d: 'Cure infection', f: () => { need(); g.player.infected = false; g.player.infection = 0; this.log('Cured'); } },
      kill: { d: 'Kill your character', f: () => { need(); const god = this.god; this.god = false; g.player.die('Killed by the dev console'); this.god = god; } },
      skill: { u: '<name> <0-8>', d: 'Set a skill level', f: (a) => {
        need();
        if (!(a[0] in STATS)) throw new Error(`Skills: ${Object.keys(STATS).join(', ')}`);
        this.setSkill(a[0], Math.max(0, Math.min(MAX_SKILL, +a[1] || 0)));
        this.log(`${a[0]} = ${g.player.skill[a[0]]}`);
      } },
      set: { u: '<food|water|fatigue|stamina|infection> <value>', d: 'Set a need', f: (a) => {
        need();
        const p = g.player;
        if (!['food', 'water', 'fatigue', 'stamina', 'infection'].includes(a[0])) throw new Error('Unknown stat');
        p[a[0]] = +a[1];
        if (a[0] === 'infection') p.infected = +a[1] > 0;
        this.log(`${a[0]} = ${a[1]}`);
      } },
      flag: { u: '<name> [on|off]', d: 'Toggle any console flag', f: (a) => { if (!(a[0] in FLAGS)) throw new Error(`Flags: ${Object.keys(FLAGS).join(', ')}`); flagCmd(a[0])(a.slice(1)); } },
      god: { d: 'Toggle god mode', f: flagCmd('god') },
      tracers: { d: 'Toggle bullet trails and impact markers', f: flagCmd('tracers') },
      noclip: { d: 'Toggle noclip', f: flagCmd('noclip') },
      invis: { d: 'Toggle invisibility to zombies', f: flagCmd('invisible') },
      freeze: { d: 'Toggle frozen zombies', f: flagCmd('freeze') },
      freebuild: { d: 'Toggle free building', f: flagCmd('freeBuild') },
      repair: { d: 'Repair all doors and structures', f: () => {
        need();
        for (const d of g.world.doors) { d.hp = d.maxHp; d.mesh.children[0]?.material?.color.setHex(d.w < 1.6 ? 0x7a5a3a : 0x5a3a22); }
        for (const s of g.builder.structures) s.hp = s.maxHp;
        for (const w of g.world.windows) { w.hp = w.maxHp; if (w.state === 'broken') g.setWindow(w, 'closed'); }
        this.log('Everything repaired and reglazed (broken doors stay broken)');
      } },
      restock: { d: 'Re-roll loot in every generated container', f: () => {
        need();
        const W = g.world;
        for (const c of W.containers.slice(0, W.generatedContainers)) {
          if (!LOOT_TABLES[c.type]) continue;
          const grid = makeGrid(c.grid.w, c.grid.h);
          for (const it of rollLoot(c.type, 1 + Math.floor(Math.random() * 3))) addItem(grid, it);
          c.grid = grid;
        }
        this.log('All containers restocked');
      } },
      save: { d: 'Save now', f: () => { need(); g.saveGame(); this.log('Saved'); } },
      survivor: { u: '<friendly|neutral|hostile> [count]', d: 'Spawn AI survivors at your crosshair', f: (a) => {
        need();
        const disp = { friendly: 'friendly', neutral: 'neutral', wary: 'neutral', hostile: 'hostile' }[a[0]];
        if (!disp) throw new Error('Usage: survivor friendly|neutral|hostile [count]');
        for (let i = 0; i < (+a[1] || 1); i++) {
          const pt = this.crosshairPoint(12);
          const sv = g.survivors.spawn({ disp, x: pt.x + (Math.random() - 0.5) * 2, z: pt.z + (Math.random() - 0.5) * 2 });
          moveCircle(g.world.hash, sv.pos, 0.3, 0, 0);
          this.log(`Spawned ${sv.name} (${disp}, ${sv.weapon ? ITEMS[sv.weapon.key].name : ITEMS[sv.melee].name})`);
        }
      } },
      survivors: { d: 'List AI survivors', f: () => {
        need();
        if (!g.survivors.list.length) return this.log('No survivors alive');
        for (const s of g.survivors.list) this.log(`${esc(s.name)} — ${s.disp}, trust ${Math.round(s.trust)}, ${s.state}${s.order ? ' (' + s.order + ')' : ''}, ${Math.round(s.hp)} hp, ${s.weapon ? ITEMS[s.weapon.key].short + ' ' + s.roundsLoaded() + '+' + s.reserve : ITEMS[s.melee].short}, ${s.pos.distanceTo(g.player.pos).toFixed(0)} m`);
      } },
      trust: { u: '<amount>', d: 'Change trust of the nearest survivor', f: (a) => {
        need();
        const s = [...g.survivors.list].sort((x, y) => x.pos.distanceTo(g.player.pos) - y.pos.distanceTo(g.player.pos))[0];
        if (!s) throw new Error('No survivors');
        s.changeTrust(+a[0] || 0); s.met = true;
        this.log(`${esc(s.name)}: trust ${Math.round(s.trust)}, ${s.disp}`);
      } },
      seed: { d: 'Print the world seed', f: () => this.log(`Seed: ${g.save?.seed ?? '—'}`) },
      clear: { d: 'Clear the log', f: () => { this.logEl.innerHTML = ''; } },
      js: { u: '<code>', d: 'Evaluate JavaScript (game, player, world, zombies in scope)', f: (a, raw) => {
        const code = raw.slice(raw.indexOf(' ') + 1);
        // eslint-disable-next-line no-new-func
        const fn = new Function('game', 'player', 'world', 'zombies', 'THREE', `return (${code})`);
        const r = fn(g, g.player, g.world, g.zombies, THREE);
        let out;
        try { out = JSON.stringify(r, (k, v) => (v instanceof THREE.Object3D ? `[${v.type}]` : v), 1); } catch (e) { out = String(r); }
        this.log(esc(out ?? 'undefined').slice(0, 4000));
      } },
    };
  }

  run(line) {
    const [name, ...args] = line.trim().split(/\s+/);
    const c = this.commands()[name.toLowerCase()];
    if (!c) return this.log(`Unknown command "${esc(name)}" — try <b>help</b>`, 'err');
    try { c.f(args, line); } catch (e) { this.log(esc(e.message), 'err'); }
    if (this.open && !['help', 'clear', 'js', 'pos', 'seed'].includes(name)) this.render();
  }
}
