// Farming: dig a plot with a shovel (build mode), plant seeds, keep it
// watered (watering can, water bottles; wells and ponds refill the can),
// fertilize for speed, and harvest when it's ripe before it rots. Crops grow
// on game time, so sleeping counts. Farm gardens start out half-grown.
// Apple trees, berry bushes and the farm fields can be picked and grow back.
// Everything you do with plants trains the Farming skill (0-8): faster and
// hardier crops, bigger harvests, more seeds back, and a better read on how
// a crop is doing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, makeItem } from './items.js';
import { addItem, countItem, takeItem } from './inventory.js';
import { MAX_SKILL } from './character.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);

// days: game days from seed to ripe with steady water
export const CROPS = {
  carrot: { name: 'Carrots', seed: 'seeds_carrot', item: 'carrot', days: 2, yield: [3, 5], style: 'leafy', leaf: 0x5a9a2a, fruit: 0xe8822a },
  cabbage: { name: 'Cabbages', seed: 'seeds_cabbage', item: 'cabbage', days: 2.5, yield: [1, 3], style: 'head', leaf: 0x7aaa4a, fruit: 0x9ac86a },
  potato: { name: 'Potatoes', seed: 'seeds_potato', item: 'potato', days: 3, yield: [3, 6], style: 'bush', leaf: 0x3e6a26, fruit: 0xe8e0f0 },
  tomato: { name: 'Tomatoes', seed: 'seeds_tomato', item: 'tomato', days: 3.5, yield: [3, 6], style: 'vine', leaf: 0x4a7a2a, fruit: 0xd8302a },
  corn: { name: 'Corn', seed: 'seeds_corn', item: 'corn', days: 4, yield: [2, 4], style: 'stalk', leaf: 0x6a8a32, fruit: 0xe8c840 },
};
const SEED_CROP = Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [c.seed, k]));
// XP needed for each Farming level
export const FARM_XP = [0, 30, 80, 150, 250, 380, 540, 730, 950];
const DRY_HOURS = 30;    // a full soak lasts this long
const THIRST_HOURS = 36; // a dry crop dies after this long
const ROT_HOURS = 48;    // a ripe crop left this long rots
const CAN_USE = 2;       // litres per watering

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1), cone: new THREE.ConeGeometry(1, 1, 4), ico: new THREE.IcosahedronGeometry(1, 0),
  blade: new THREE.ConeGeometry(0.03, 1, 3), cyl: new THREE.CylinderGeometry(1, 1, 1, 5),
};
const part = (geo, hex, x, y, z, sx, sy = sx, sz = sx, ry = 0) => {
  const g = colored(GEO[geo].clone(), hex);
  g.scale(sx, sy, sz); if (ry) g.rotateY(ry); g.translate(x, y, z);
  return g;
};
const plotMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });

export class Farming {
  constructor(game, saved) {
    this.game = game;
    this.plots = [];
    this.panel = null;
    const W = game.world;
    this.last = game.time;
    this.forage = W.forage;
    this.water = W.waterSources;
    if (saved) {
      for (const p of saved.plots || []) this.addPlot(p.x, p.z, p);
      (saved.forage || []).forEach((n, i) => { if (this.forage[i]) this.forage[i].n = n; });
      if (saved.last != null) this.last = saved.last;
    } else {
      // A new world: the farms' kitchen gardens, overgrown or half-grown
      for (const gd of W.gardens) {
        const c = gd.crop && CROPS[gd.crop];
        const p = { crop: gd.crop, growth: Math.min(1, gd.growth), water: gd.water, health: c ? 70 + Math.random() * 30 : 100 };
        if (c && gd.growth > 1) p.ripeFor = (gd.growth - 1) * c.days * 24;
        this.addPlot(gd.x, gd.z, p);
      }
    }
    for (const f of this.forage) this.showForage(f);
  }

  // ---------- skill ----------
  get skill() { return this.game.profile.stats.farming || 0; }
  // XP never sits below the current level's threshold (the level can also
  // be set at character creation or from the dev console)
  syncXp() {
    const ch = this.game.profile;
    ch.farmXp = Math.max(ch.farmXp ?? 0, FARM_XP[Math.min(FARM_XP.length - 1, ch.stats.farming || 0)]);
    return ch;
  }
  gainXp(n) {
    const ch = this.syncXp();
    ch.farmXp += n;
    while ((ch.stats.farming || 0) < MAX_SKILL && ch.farmXp >= FARM_XP[(ch.stats.farming || 0) + 1]) {
      ch.stats.farming = (ch.stats.farming || 0) + 1;
      this.game.hud.message(`Farming skill increased to ${ch.stats.farming}.`, 4);
      sfx.pickup();
    }
  }
  xpInfo() {
    const ch = this.syncXp(), lvl = ch.stats.farming || 0;
    const xp = ch.farmXp;
    if (lvl >= MAX_SKILL) return { lvl, frac: 1, text: 'max' };
    const a = FARM_XP[lvl], b = FARM_XP[lvl + 1];
    return { lvl, frac: (xp - a) / (b - a), text: `${Math.floor(xp - a)}/${b - a} xp` };
  }

  // ---------- plots ----------
  // Plots are 2x2 m. `s` restores a saved / generated state.
  addPlot(x, z, s = {}) {
    const p = {
      kind: 'plot', name: 'Garden Plot', x, z, reach: 0.5,
      crop: s.crop || null, growth: s.growth ?? 0, water: s.water ?? 0, health: s.health ?? 100, fert: !!s.fert, ripeFor: s.ripeFor ?? 0, dead: !!s.dead,
      mine: !!s.mine, // planted by you (the goal wants a crop you grew)
      mesh: null, look: '',
    };
    p.prompt = () => `[F] ${this.describe(p)}`;
    this.plots.push(p);
    this.redraw(p);
    return p;
  }

  plotAt(x, z, r = 1.9) { return this.plots.find((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r); }

  removePlot(p) {
    this.game.world.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    this.plots.splice(this.plots.indexOf(p), 1);
  }

  ripe(p) { return !!p.crop && !p.dead && p.growth >= 1; }

  // How the crop looks to you: at low skill you only get a rough idea
  describe(p) {
    if (!p.crop) return 'Garden plot (empty)';
    const c = CROPS[p.crop];
    if (p.dead) return `${c.name} (dead)`;
    if (this.ripe(p)) return `${c.name} (ready to harvest)`;
    const lvl = this.skill;
    let stage = p.growth < 0.2 ? 'seedlings' : p.growth < 0.5 ? 'growing' : p.growth < 0.8 ? 'well along' : 'almost ready';
    if (lvl >= 3) stage += ` ${Math.floor(p.growth * 100)}%`;
    const thirst = p.water <= 0 ? ', parched' : p.water < 25 ? ', dry' : '';
    return `${c.name} (${stage}${thirst})`;
  }

  // Rebuild a plot's mesh when what it looks like changes.
  redraw(p) {
    const c = p.crop && CROPS[p.crop];
    const g = Math.max(0.12, Math.min(1, p.growth));
    const stage = !c ? 'e' : p.dead ? 'd' : this.ripe(p) ? 'r' : Math.floor(g * 6);
    const look = `${p.crop}|${stage}|${p.water > 15 ? 1 : 0}`;
    if (look === p.look && p.mesh) return;
    p.look = look;
    const parts = [part('box', p.water > 15 ? 0x3a2a1c : 0x6a5238, 0, 0.05, 0, 1.9, 0.1, 1.9)];
    for (const dz of [-0.55, 0, 0.55]) parts.push(part('box', p.water > 15 ? 0x32241a : 0x5a4630, 0, 0.11, dz, 1.75, 0.06, 0.22));
    if (c) {
      const ripe = this.ripe(p), dead = p.dead;
      const leaf = dead ? 0x6a5a3a : c.leaf;
      for (let i = 0; i < 9; i++) {
        const x = -0.55 + (i % 3) * 0.55 + ((i * 37) % 7 - 3) * 0.012, z = -0.55 + Math.floor(i / 3) * 0.55, y = 0.12, ry = i * 1.3;
        if (dead) { parts.push(part('cone', leaf, x, y + 0.06, z, 0.08, 0.14, 0.08, ry)); continue; }
        if (c.style === 'leafy') {
          for (let k = 0; k < 3; k++) parts.push(part('blade', leaf, x + (k - 1) * 0.04, y + 0.2 * g, z, 1, 0.4 * g, 1, ry + k));
          if (ripe) parts.push(part('cone', c.fruit, x, y + 0.03, z, 0.05, 0.08, 0.05, ry));
        } else if (c.style === 'head') {
          parts.push(part('ico', leaf, x, y + 0.12 * g, z, 0.2 * g, 0.14 * g, 0.2 * g, ry));
          if (g > 0.4) parts.push(part('ico', ripe ? c.fruit : 0x8ab85a, x, y + 0.18 * g, z, 0.12 * g, 0.11 * g, 0.12 * g, ry));
        } else if (c.style === 'bush') {
          parts.push(part('ico', leaf, x, y + 0.14 * g, z, 0.2 * g, 0.16 * g, 0.2 * g, ry));
          if (ripe) parts.push(part('ico', c.fruit, x + 0.08, y + 0.3, z, 0.03));
        } else if (c.style === 'vine') {
          parts.push(part('box', 0x6a5030, x + 0.1, y + 0.45, z, 0.025, 0.9, 0.025));
          parts.push(part('ico', leaf, x, y + 0.25 * g + 0.05, z, 0.16 * g, 0.24 * g, 0.16 * g, ry));
          if (ripe) for (let k = 0; k < 3; k++) parts.push(part('ico', c.fruit, x + Math.cos(k * 2.1 + ry) * 0.12, y + 0.18 + k * 0.1, z + Math.sin(k * 2.1 + ry) * 0.12, 0.045));
        } else {
          parts.push(part('box', leaf, x, y + 0.9 * g, z, 0.04, 1.8 * g, 0.04, ry));
          parts.push(part('blade', leaf, x + 0.12 * g, y + 0.8 * g, z, 1.2, 0.6 * g, 1.2, ry).rotateZ(0));
          if (ripe) parts.push(part('cyl', c.fruit, x + 0.06, y + 1.0, z, 0.04, 0.22, 0.04));
        }
      }
    }
    const geo = mergeGeometries(parts);
    if (p.mesh) { p.mesh.geometry.dispose(); p.mesh.geometry = geo; return; }
    p.mesh = new THREE.Mesh(geo, plotMat);
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.castShadow = p.mesh.receiveShadow = true;
    this.game.world.group.add(p.mesh);
  }

  // ---------- time ----------
  update(dt) {
    const now = this.game.time;
    let dm = now - this.last;
    if (dm < 1) { this.panelTick(); return; }
    this.last = now;
    // Long jumps (sleep) step an hour at a time
    while (dm > 0) {
      const step = Math.min(60, dm);
      dm -= step;
      this.tick(step / 60);
    }
    for (const p of this.plots) this.redraw(p);
    this.panelTick(true);
  }

  tick(hours) {
    const lvl = this.skill;
    for (const p of this.plots) {
      if (!p.crop || p.dead) { p.water = Math.max(0, p.water - (hours * 100) / DRY_HOURS); continue; }
      const c = CROPS[p.crop];
      const wet = p.water > 0;
      p.water = Math.max(0, p.water - (hours * 100) / DRY_HOURS);
      if (p.growth < 1) {
        const speed = (p.fert ? 1.35 : 1) * (1 + 0.06 * lvl) * (wet ? 1 : 0.2);
        p.growth = Math.min(1, p.growth + (hours / (c.days * 24)) * speed);
      } else p.ripeFor += hours;
      if (!wet) p.health -= ((hours * 100) / THIRST_HOURS) * (1 - 0.06 * lvl);
      else p.health = Math.min(100, p.health + hours * 2);
      if (p.health <= 0 || p.ripeFor > ROT_HOURS + 6 * lvl) { p.dead = true; p.health = 0; }
    }
    for (const f of this.forage) {
      if (f.n >= f.max) continue;
      f.acc = (f.acc || 0) + (hours / 24) * f.regen;
      while (f.acc >= 1 && f.n < f.max) { f.acc -= 1; f.n++; this.showForage(f); }
    }
  }

  // ---------- player actions ----------
  grids() { return this.game.player.ammoGrids(); }
  give(key, n) {
    const def = ITEMS[key];
    let left = n;
    while (left > 0) {
      const it = makeItem(key, def.stack ? { count: Math.min(left, def.stack) } : {});
      left -= def.stack ? it.count : 1;
      if (!this.grids().some((g) => addItem(g, it))) this.game.dropItem(it);
    }
  }
  cans() {
    const out = [];
    for (const g of this.grids()) for (const it of g.items) if (ITEMS[it.key].waterCap) out.push(it);
    return out;
  }
  seedsHeld() {
    return Object.keys(SEED_CROP).map((k) => [k, countItem(this.grids(), k)]).filter(([, n]) => n > 0);
  }

  plant(p, seed) {
    const g = this.game;
    if (p.crop) return;
    if (!takeItem(this.grids(), seed, 1)) return g.hud.message('You have no seeds of that kind.', 2);
    Object.assign(p, { crop: SEED_CROP[seed], growth: 0, health: 100, fert: false, ripeFor: 0, dead: false, mine: true });
    this.gainXp(3);
    sfx.dig();
    g.hud.message(`Planted ${CROPS[p.crop].name.toLowerCase()}. Keep them watered.`, 2.5);
    this.after(p);
  }

  waterPlot(p) {
    const g = this.game;
    if (p.water >= 95) return g.hud.message('The soil is already soaked.', 2);
    const can = this.cans().filter((c) => c.water >= 0.5).sort((a, b) => b.water - a.water)[0];
    if (can) {
      const use = Math.min(can.water, CAN_USE);
      can.water = +(can.water - use).toFixed(1);
      p.water = Math.min(100, p.water + (use / CAN_USE) * 100);
    } else if (takeItem(this.grids(), 'water', 1)) {
      p.water = Math.min(100, p.water + 60);
    } else return g.hud.message('You need water: a watering can (fill it at a well or pond) or a water bottle.', 3);
    if (p.crop && !p.dead) this.gainXp(1);
    sfx.pour();
    this.after(p);
  }

  fertilize(p) {
    const g = this.game;
    if (!p.crop || p.dead || p.fert) return;
    const bag = this.grids().flatMap((gr) => gr.items.map((it) => [gr, it])).find(([, it]) => it.key === 'fertilizer');
    if (!bag) return g.hud.message('You need a bag of fertilizer.', 2);
    const [gr, it] = bag;
    it.uses -= 1;
    if (it.uses <= 0) gr.items.splice(gr.items.indexOf(it), 1);
    p.fert = true;
    this.gainXp(2);
    g.hud.message('Fertilized. It will grow faster.', 2);
    this.after(p);
  }

  harvest(p) {
    const g = this.game;
    if (!p.crop) return;
    const c = CROPS[p.crop];
    if (!this.ripe(p)) {
      // Pulling up a dead or unripe crop clears the plot
      g.hud.message(p.dead ? `You clear away the dead ${c.name.toLowerCase()}.` : `You pull up the unripe ${c.name.toLowerCase()}.`, 2.5);
      Object.assign(p, { crop: null, growth: 0, fert: false, ripeFor: 0, dead: false, health: 100, mine: false });
      this.after(p);
      return;
    }
    const lvl = this.skill;
    let n = c.yield[0] + Math.floor(Math.random() * (c.yield[1] - c.yield[0] + 1)) + Math.floor(lvl / 3) + (p.fert ? 1 : 0);
    if (p.health < 50) n = Math.max(1, n - 1);
    this.give(c.item, n);
    let seeds = 0;
    if (Math.random() < 0.35 + 0.07 * lvl) { seeds = 1 + (Math.random() < 0.15 * lvl ? 1 : 0); this.give(c.seed, seeds); }
    this.gainXp(10 + n * 2);
    if (p.mine) g.progress?.event('harvest');
    sfx.pickup();
    g.hud.message(`Harvested ${n} ${ITEMS[c.item].name.toLowerCase()}${n > 1 ? 's' : ''}${seeds ? ` and saved ${seeds} seed${seeds > 1 ? 's' : ''}` : ''}.`, 3);
    Object.assign(p, { crop: null, growth: 0, fert: false, ripeFor: 0, dead: false, health: 100, mine: false });
    this.after(p);
  }

  fillIn(p) {
    if (p.crop && !p.dead) return;
    this.removePlot(p);
    this.closePanel();
    this.game.hud.message('You fill in the plot.', 2);
  }

  after(p) { this.redraw(p); this.renderPanel(); }

  // Wells and ponds: drink your fill and top up your watering cans
  drinkAt(w) {
    const g = this.game, pl = g.player;
    const drank = Math.max(0, 100 - pl.water);
    pl.water = 100;
    let filled = 0;
    for (const can of this.cans()) { filled += ITEMS[can.key].waterCap - can.water; can.water = ITEMS[can.key].waterCap; }
    sfx.pour();
    const parts = [];
    if (drank > 1) parts.push('You drink your fill');
    if (filled > 0.05) parts.push(`fill your watering can${this.cans().length > 1 ? 's' : ''} (+${filled.toFixed(1)} L)`);
    g.hud.message(parts.length ? `${parts.join(' and ')} at the ${w.name.toLowerCase()}.`.replace(/^./, (m) => m.toUpperCase()) : `You're not thirsty and have nothing to fill.`, 3);
  }

  // Apple trees, berry bushes, crop rows: take what's there
  pick(f) {
    const g = this.game;
    if (f.n <= 0) return g.hud.message(`Nothing left to pick. It'll grow back in a day or two.`, 2.5);
    const n = f.n;
    f.n = 0;
    this.give(f.item, n);
    this.gainXp(n);
    this.showForage(f);
    sfx.pickup();
    g.hud.message(`Picked ${n} ${ITEMS[f.item].name.toLowerCase()}.`, 2);
  }

  showForage(f) {
    if (!f.prompt) f.prompt = () => (f.n > 0 ? `[F] Pick from ${f.name} (${f.n})` : `${f.name} (picked clean)`);
    if (f.tree != null) this.game.world.setFruit(f.tree, f.n > 0);
    if (f.berry != null) this.game.world.setBerries(f.berry, f.n > 0);
  }

  interactables() {
    const felled = this.game.world.felled;
    return [...this.plots, ...this.forage.filter((f) => f.tree == null || !felled.has(f.tree)), ...this.water];
  }

  interact(t) {
    if (t.kind === 'plot') this.openPanel(t);
    else if (t.kind === 'forage') this.pick(t);
    else if (t.kind === 'water') this.drinkAt(t);
  }

  // ---------- panel ----------
  openPanel(p) {
    const g = this.game;
    this.panel = p;
    g.farmOpen = true;
    g.input.unlock();
    $('farm').style.display = 'flex';
    this.renderPanel();
    g.updatePause();
  }

  closePanel() {
    const g = this.game;
    if (!this.panel) return;
    this.panel = null;
    g.farmOpen = false;
    $('farm').style.display = 'none';
    g.resume();
    g.updatePause();
  }

  panelTick(changed) {
    const p = this.panel;
    if (!p) return;
    const pp = this.game.player.pos;
    if (!this.plots.includes(p) || Math.hypot(p.x - pp.x, p.z - pp.z) > 4) this.closePanel();
    else if (changed) this.renderPanel();
  }

  renderPanel() {
    const p = this.panel;
    if (!p) return;
    const c = p.crop && CROPS[p.crop];
    const bar = (v, color) => `<div class="vh-bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i><b>${Math.round(v)}%</b></div>`;
    const lvl = this.skill, xp = this.xpInfo();
    const cans = this.cans(), canL = cans.reduce((n, it) => n + it.water, 0);
    const btn = (a, label, on = true, extra = '') => `<button data-a="${a}" ${extra} ${on ? '' : 'disabled'}>${label}</button>`;
    const rows = [];
    if (c) {
      const growth = lvl >= 3 || this.ripe(p) ? bar(p.growth * 100, this.ripe(p) ? '#e8c840' : '#7ab04a') : `<div class="dim">${this.describe(p).replace(/^.*\(|\)$/g, '')}</div>`;
      rows.push(`<div class="vh-row"><span class="vh-name">Growth</span>${growth}<div></div></div>`);
      if (lvl >= 1 || p.dead) rows.push(`<div class="vh-row"><span class="vh-name">Health</span>${bar(p.health, p.health > 60 ? '#6c6' : p.health > 25 ? '#d8b040' : '#e55')}<div></div></div>`);
    }
    rows.push(`<div class="vh-row"><span class="vh-name">Soil moisture</span>${bar(p.water, '#3a8ac9')}<div class="vh-act">${btn('water', cans.length ? `Water (can: ${canL.toFixed(1)} L)` : 'Water (bottle)', canL >= 0.5 || countItem(this.grids(), 'water') > 0)}</div></div>`);
    if (c && !p.dead && !this.ripe(p)) rows.push(`<div class="vh-row"><span class="vh-name">Fertilizer</span><div class="dim">${p.fert ? 'Fertilized' : 'None'}</div><div class="vh-act">${p.fert ? '' : btn('fert', 'Fertilize', countItem(this.grids(), 'fertilizer') > 0)}</div></div>`);
    let actions = '';
    if (!c) {
      const seeds = this.seedsHeld();
      actions = seeds.length ? seeds.map(([k, n]) => btn('plant', `Plant ${CROPS[SEED_CROP[k]].name.toLowerCase()} (${n})`, true, `data-s="${k}"`)).join('') : '<span class="dim">No seeds. Farms, barns and hardware stores have them.</span>';
      actions += btn('fill', 'Fill in plot');
    } else if (this.ripe(p)) actions = btn('harvest', `Harvest ${c.name.toLowerCase()}`, true, 'class="go"');
    else actions = btn('harvest', p.dead ? 'Clear dead plants' : 'Pull up (no harvest)');
    const el = $('farm');
    el.innerHTML = `<div class="vh-panel">
      <div class="vh-head"><div><div class="vh-title">${c ? c.name : 'Garden Plot'}</div><div class="dim">${this.describe(p)}</div></div><button class="tr-close">✕</button></div>
      <div class="vh-parts">${rows.join('')}</div>
      <div class="vh-foot">${actions}</div>
      <div class="fm-skill">Farming ${lvl} <div class="vh-bar"><i style="width:${xp.frac * 100}%;background:#a8c86a"></i><b>${xp.text}</b></div></div>
      <div class="hint">${c ? `Ripens in about ${c.days} days with steady water; ripe crops rot after two days.` : 'Dig more plots in build mode (B) with a shovel.'} Esc or walk away to close.</div></div>`;
    el.querySelector('.tr-close').onclick = () => this.closePanel();
    el.querySelectorAll('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'water') this.waterPlot(p);
        else if (a === 'fert') this.fertilize(p);
        else if (a === 'plant') this.plant(p, b.dataset.s);
        else if (a === 'harvest') this.harvest(p);
        else if (a === 'fill') this.fillIn(p);
      };
    });
  }

  // ---------- persistence ----------
  serialize() {
    return {
      last: Math.round(this.last),
      plots: this.plots.map((p) => ({ x: p.x, z: p.z, crop: p.crop, growth: +p.growth.toFixed(4), water: Math.round(p.water), health: Math.round(p.health), fert: p.fert || undefined, ripeFor: +p.ripeFor.toFixed(1), dead: p.dead || undefined, mine: p.mine || undefined })),
      forage: this.forage.map((f) => f.n),
    };
  }

  dispose() {
    this.closePanel();
    for (const p of [...this.plots]) this.removePlot(p);
  }
}
