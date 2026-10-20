import * as THREE from 'three';
import { buildWorld, setDoor, WORLD_VERSION } from './world.js';
import { Zombies } from './zombies.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { RagdollSystem, lookMats } from './ragdoll.js';
import { Traders } from './traders.js';
import { InventoryUI } from './invui.js';
import { ITEMS, makeItem, migrateItem, itemValue } from './items.js';
import { combineItems, weaponActions, loadStep } from './weapons.js';
import { makeGrid, addItem, removeItem } from './inventory.js';
import { loadSave, writeSave, deleteSave } from './save.js';
import { initAudio, sfx } from './audio.js';
import { Builder, BUILDABLES, buildCostText } from './build.js';
import { setupCreation } from './character.js';
import { DevConsole } from './devconsole.js';
import { Survivors } from './survivors.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'create', 'death'];
const START_TIME = 9 * 60;      // day 1, 09:00
const AUTOSAVE = 30;            // seconds
const NIGHT = new THREE.Color(0x10141c), DAY = new THREE.Color(0x7d8a96);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class Game {
  constructor() {
    this.canvas = $('game');
    // Stencil is needed for reflex-sight reticles.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, stencil: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = NIGHT.clone();
    this.scene.fog = new THREE.FogExp2(NIGHT.getHex(), 0.026);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 300);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0x7a8aaa, 0x2a2a1a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0x9aaad8, 0.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
    this.scene.add(this.sun, this.sun.target);

    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.fx = new FX(this.scene);
    this.inv = new InventoryUI($('inv'));
    this.builder = new Builder(this);
    this.buildables = BUILDABLES;
    this.buildCost = buildCostText;
    this.creation = setupCreation((ch) => this.spawnCharacter(ch));
    this.dev = new DevConsole(this);
    this.state = 'menu';
    this.invOpen = false;
    this.save = loadSave();
    this.chopHits = new Map();

    addEventListener('resize', () => this.resize());
    this.resize();
    this.canvas.addEventListener('click', () => {
      if (this.state === 'play' && !this.invOpen && !this.hud.mapOpen) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked) { this.awaitingRelock = false; this.input.softLive = false; }
      this.updatePause();
    });
    this.input.onLockFail = () => this.updatePause();
    $('pause').addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') this.input.lock(); });
    $('btn-save-quit').onclick = () => this.quitToMenu();
    $('btn-fullscreen').onclick = () => { if (document.fullscreenElement) this.exitFullscreen(); else this.enterFullscreen(); };
    $('btn-inv-close').onclick = () => this.closeInventory();
    // Clicking the dim background (not a panel) closes the inventory.
    $('invwrap').addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target.id === 'invwrap' || e.target.id === 'inv' || e.target.classList.contains('inv-col'))) this.closeInventory();
    });
    $('btn-continue').onclick = () => this.loadWorld();
    $('btn-newchar').onclick = () => this.showScreen('create');
    $('btn-create-back').onclick = () => this.showMenu();
    $('btn-death-next').onclick = () => { this.creation.reset(); this.showScreen('create'); };
    $('btn-newworld').onclick = () => {
      if (this.save && !confirm('Start a fresh world? Your current world, base and character are deleted.')) return;
      deleteSave();
      this.save = null;
      this.creation.reset();
      this.showScreen('create');
    };
    addEventListener('beforeunload', () => this.saveGame());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveGame(); });

    this.last = performance.now();
    this.showMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- time ----------
  get day() { return Math.floor(this.time / 1440) + 1; }
  get hour() { return (this.time % 1440) / 60; }
  get isNight() { const h = this.hour; return h >= 21 || h < 5.5; }
  clockText() {
    const m = Math.floor(this.time % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  updateLighting() {
    const h = this.hour;
    const d = this.dev.fullbright ? 1 : smooth(5, 7.5, h) - smooth(19, 21.5, h); // 0 = night, 1 = day
    this.daylight = d;
    this.scene.background.copy(NIGHT).lerp(DAY, d);
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density = this.dev.noFog ? 0 : 0.026 - 0.014 * d;
    this.hemi.intensity = 1.1 + 1.3 * d;
    this.sun.intensity = 0.9 + 1.6 * d;
    this.sun.color.setHex(0x9aaad8).lerp(new THREE.Color(0xfff0d8), d);
  }

  // ---------- fullscreen ----------
  // Must run inside a click/key handler (browsers require a user gesture).
  enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    el.requestFullscreen({ navigationUI: 'hide' })
      // Capture Esc (Chrome/Edge) so closing menus doesn't also exit fullscreen.
      // Holding Esc still leaves fullscreen.
      .then(() => navigator.keyboard?.lock?.(['Escape']))
      .catch(() => {});
  }

  exitFullscreen() {
    navigator.keyboard?.unlock?.();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  // ---------- screens ----------
  showScreen(name) {
    this.exitFullscreen();
    for (const s of SCREENS) $(s).style.display = s === name ? 'block' : 'none';
    this.state = name;
    this.hud.show(false);
  }

  showMenu() {
    this.showScreen('menu');
    const s = this.save;
    const alive = s?.character;
    $('btn-continue').style.display = alive ? 'block' : 'none';
    $('btn-newchar').style.display = alive ? 'none' : 'block';
    $('btn-newchar').textContent = s ? 'NEW CHARACTER (same world)' : 'NEW GAME';
    $('btn-newworld').style.display = s ? 'block' : 'none';
    if (s) {
      const day = Math.floor(s.time / 1440) + 1;
      $('menu-save').innerHTML = alive
        ? `${alive.name} — ${alive.professionName}<br><span class="dim">World day ${day}${s.safehouse ? ' · safehouse claimed' : ''}</span>`
        : `<span class="dim">World day ${day} · no living survivor</span>`;
    } else $('menu-save').textContent = '';
    $('graveyard').innerHTML = (s?.graveyard || []).length
      ? '<b>Graveyard</b><br>' + s.graveyard.slice().reverse().map((g) => `✝ ${g.name} (${g.profession}) — survived ${g.days} day${g.days === 1 ? '' : 's'}, ${g.kills} kills. ${g.reason}.`).join('<br>')
      : '';
  }

  // ---------- world lifecycle ----------
  spawnCharacter(ch) {
    if (!this.save) this.save = { seed: Math.floor(Math.random() * 2 ** 31), worldVersion: WORLD_VERSION, time: START_TIME, safehouse: null, world: null, graveyard: [] };
    ch.spawnTime = this.save.time;
    this.save.character = ch;
    writeSave(this.save);
    this.loadWorld();
  }

  loadWorld() {
    initAudio();
    this.enterFullscreen();
    for (const s of SCREENS) $(s).style.display = 'none';
    $('loading').style.display = 'flex';
    this.state = 'loading';
    setTimeout(() => this.buildFromSave(), 30);
  }

  buildFromSave() {
    const s = this.save;
    this.time = s.time;
    this.safehouse = s.safehouse;
    this.profile = s.character;
    this.migrateSave(s);
    if ((s.worldVersion || 1) !== WORLD_VERSION) {
      // The town layout changed: keep the character and their gear, but start
      // the world state (loot, doors, base, zombies) fresh on the new layout.
      if (s.world) this.worldRegenerated = true;
      s.world = null;
      s.safehouse = this.safehouse = null;
      s.worldVersion = WORLD_VERSION;
    }
    this.world = buildWorld(this.scene, s.seed);
    this.ragdolls = new RagdollSystem(this);
    const w = s.world;
    if (w) {
      w.containers.forEach((grid, i) => { if (this.world.containers[i]) this.world.containers[i].grid = grid; });
      for (const c of w.extra) this.addExtraContainer(c);
      w.doors.forEach((d, i) => {
        const door = this.world.doors[i];
        if (!door) return;
        door.hp = d.hp;
        if (d.broken) this.breakDoor(door, true); else setDoor(door, d.open);
      });
      for (const i of w.felled) this.world.fellTree(i);
    }
    this.builder.structures = [];
    this.zombies = this.player = null;
    if (w) this.builder.restore(w.structures);
    this.zombies = new Zombies(this.scene, this.world);
    this.zombies.game = this;
    this.player = new Player(this.camera, this.scene, this);
    const ch = this.profile;
    if (ch.player) this.player.restore(ch.player);
    // New characters (and anyone whose town was rebuilt, since their old spot
    // may be inside a new building) wake up in a random house.
    if (this.worldRegenerated) this.placeNewCharacter(false);
    else if (!ch.player) this.placeNewCharacter(!!w);
    if (w) this.zombies.restore(w.zombies);
    else this.zombies.populate(85, this.player.pos);
    this.survivors = new Survivors(this);
    if (w?.survivors) this.survivors.restore(w.survivors);
    else this.survivors.populate(8);
    this.traders = new Traders(this, w?.traders || null);
    this.traders.spawnNPCs();

    this.updateLighting();
    this.autosave = AUTOSAVE;
    this.lookTarget = null;
    this.state = 'play';
    $('loading').style.display = 'none';
    this.hud.show(true);
    this.hud.message(ch.player ? `Welcome back, ${ch.name}.` : `${ch.name}. Day ${this.day}. Find supplies, find shelter. Press V inside a building to claim it.`, 6);
    if (this.worldRegenerated) { this.worldRegenerated = false; this.hud.message('The town has been rebuilt by a game update. Your gear is safe; your old base and loot are gone.', 8); }
    this.input.lock();
    this.updatePause();
  }

  // Bring items from older saves up to date (e.g. weapons gain magazines).
  migrateSave(s) {
    const ch = s.character;
    if (ch) {
      for (const k in ch.equip) if (ch.equip[k]) migrateItem(ch.equip[k]);
      ch.pockets.items.forEach(migrateItem);
    }
    const w = s.world;
    if (!w) return;
    for (const g of w.containers) g.items.forEach(migrateItem);
    for (const c of w.extra) c.grid.items.forEach(migrateItem);
    for (const st of w.structures) st.grid?.items.forEach(migrateItem);
  }

  // New characters wake up in a random house, away from known zombies.
  placeNewCharacter(hasZombies) {
    const houses = this.world.houses;
    let pick = houses[Math.floor(Math.random() * houses.length)];
    if (hasZombies) {
      const zs = this.save.world.zombies;
      for (let i = 0; i < 20; i++) {
        const h = houses[Math.floor(Math.random() * houses.length)];
        const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
        if (!zs.some((z) => Math.hypot(z.x - cx, z.z - cz) < 15)) { pick = h; break; }
      }
    }
    const cx = (pick.x0 + pick.x1) / 2, cz = (pick.z0 + pick.z1) / 2;
    this.player.pos.set(cx, 0, cz);
    this.player.yaw = Math.random() * Math.PI * 2;
  }

  addExtraContainer(c) {
    const ct = this.world.addContainer(c.type === 'drop' ? 'body' : c.type, c.x, c.z);
    ct.type = c.type;
    ct.name = c.name;
    ct.grid = c.grid;
    ct.color = c.color;
    if (c.type === 'drop') { ct.mesh = this.dropMesh(c.x, c.z); return ct; }
    // Bodies are ragdolls: a fresh one handed over by whoever died, or one
    // rebuilt from its saved pose (older saves: dropped and settled in place).
    ct.look = c.look || { kind: 'survivor', skin: 0x8a7a6a, top: c.color ?? 0x4a4a3a, bottom: 0x2a2a2a };
    if (c.ragdoll) ct.ragdoll = c.ragdoll;
    else {
      const look = ct.look, spec = { kind: look.kind, look, mats: lookMats(look) };
      if (c.pose) spec.pose = c.pose;
      else {
        spec.matrix = new THREE.Matrix4().makeRotationY(Math.random() * Math.PI * 2).setPosition(c.x, 0, c.z);
        spec.vel = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
        spec.tone = 0.6;
        spec.settleNow = true;
      }
      ct.ragdoll = this.ragdolls.create(spec);
    }
    return ct;
  }

  dropMesh(x, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a5a3a }));
    m.position.set(x, 0.1, z);
    this.world.group.add(m);
    return m;
  }

  saveGame() {
    if (this.state !== 'play' || !this.world) return;
    const W = this.world;
    this.profile.player = this.player.serialize();
    this.profile.kills = this.player.kills;
    this.save.time = this.time;
    this.save.safehouse = this.safehouse;
    this.save.character = this.profile;
    this.save.world = {
      containers: W.containers.slice(0, W.generatedContainers).map((c) => c.grid),
      extra: W.containers.slice(W.generatedContainers).map((c) => ({
        type: c.type, name: c.name, x: +c.x.toFixed(2), z: +c.z.toFixed(2), grid: c.grid, color: c.color, look: c.look,
        pose: c.ragdoll && !c.ragdoll.dead && c.ragdoll.sleeping ? c.ragdoll.pose() : undefined,
      })),
      doors: W.doors.map((d) => ({ open: d.open, hp: d.hp, broken: d.broken || undefined })),
      felled: [...W.felled],
      structures: this.builder.serialize(),
      zombies: this.zombies.serialize(),
      survivors: this.survivors.serialize(),
      traders: this.traders?.serialize(),
    };
    writeSave(this.save);
  }

  teardown() {
    this.survivors?.closeDialog();
    this.closeInventory();
    this.hud.toggleMap(false);
    this.builder.toggle(false);
    this.input.unlock();
    this.awaitingRelock = false;
    this.input.softLive = false;
    this.zombies?.dispose();
    this.survivors?.dispose();
    this.survivors = null;
    this.traders?.dispose();
    this.traders = null;
    this.ragdolls?.dispose();
    this.ragdolls = null;
    this.world?.dispose();
    this.fx.clear();
    for (const c of [...this.camera.children]) this.camera.remove(c);
    this.world = this.zombies = null;
    $('pause').style.display = 'none';
  }

  quitToMenu() {
    this.saveGame();
    this.teardown();
    this.showMenu();
  }

  onDeath(reason) {
    if (this.state !== 'play') return;
    const ch = this.profile;
    const p = this.player;
    // Leave a corpse with everything the character carried.
    const grid = makeGrid(10, 10);
    for (const k in ch.equip) if (ch.equip[k]) addItem(grid, ch.equip[k]) || (grid.h += 4, addItem(grid, ch.equip[k]));
    for (const it of ch.pockets.items) addItem(grid, it);
    const corpse = this.addExtraContainer({ type: 'body', name: `${ch.name}'s corpse`, x: p.pos.x, z: p.pos.z, grid, color: 0x2a3020, look: { kind: 'survivor', skin: 0xc09070, top: 0x2a3020, bottom: 0x2a3a4a, pack: 0x3a3a2a } });
    corpse.grid = grid;
    const days = Math.floor((this.time - ch.spawnTime) / 1440);
    this.save.graveyard = this.save.graveyard || [];
    this.save.graveyard.push({ name: ch.name, profession: ch.professionName, days, kills: p.kills, reason });
    // Companions don't follow the next character around.
    for (const s of this.survivors.list) if (s.order) s.order = null;
    // Save the world without a living character.
    this.profile.player = p.serialize();
    this.saveGame();
    this.save.character = null;
    writeSave(this.save);
    this.teardown();
    this.showScreen('death');
    $('death-title').textContent = `${ch.name.toUpperCase()} IS DEAD`;
    $('death-reason').textContent = reason;
    $('death-stats').innerHTML = `Survived ${days} day${days === 1 ? '' : 's'}<br>Zombies killed: ${p.kills}<br>Profession: ${ch.professionName}`;
  }

  // Return control to the game after closing a menu. If the browser won't
  // give the mouse back (e.g. the menu was closed with Esc), keep playing
  // with keyboard control and a "click to look around" hint instead of pausing.
  resume() {
    if (this.state !== 'play') return;
    this.awaitingRelock = true;
    this.input.softLive = true;
    this.input.lock();
    this.updatePause();
  }

  updatePause() {
    const ui = this.invOpen || this.hud.mapOpen || this.dev.open || this.dialogOpen || this.traderOpen;
    const show = this.state === 'play' && !this.input.locked && !ui && !this.awaitingRelock;
    $('pause').style.display = show ? 'flex' : 'none';
    $('relock').style.display = this.state === 'play' && this.awaitingRelock && !this.input.locked && !ui ? 'block' : 'none';
  }

  // ---------- inventory ----------
  playerSections() {
    const p = this.profile;
    const s = [
      { kind: 'equip', title: `${p.name} — Equipment`, equip: p.equip },
      { kind: 'grid', title: 'Pockets', grid: p.pockets },
    ];
    if (p.equip.backpack) s.push({ kind: 'grid', title: ITEMS[p.equip.backpack.key].name, grid: p.equip.backpack.grid, noNest: true });
    return s;
  }

  openInventory(container) {
    this.invOpen = true;
    this.openContainer = container || null;
    this.input.unlock();
    const right = container ? () => [{ kind: 'grid', title: container.name, grid: container.grid }] : () => [];
    const title = () => { $('invtitle').textContent = `${container ? container.name : 'Inventory'} — carrying ${this.player.carryWeight().toFixed(1)} kg`; };
    title();
    $('invwrap').style.display = 'block';
    this.inv.open(() => this.playerSections(), right, {
      onChange: () => { this.player.buildViewmodel(); this.player.weightTimer = 0; title(); },
      onUse: (it) => this.player.use(it),
      combine: (a, b, ctx) => combineItems(a, b, { ...ctx, game: this }),
      loading: () => this.loader?.target,
      onDrop: (it) => this.dropItem(it),
      actions: (it, src) => this.itemActions(it, src),
    });
    this.updatePause();
  }

  // Grids visible in the inventory besides the player's own (e.g. a container).
  openGrids() {
    return this.openContainer ? [this.openContainer.grid] : [];
  }

  // Load / unload a magazine or tube one round at a time while the
  // inventory stays open (like Tarkov). `source` = the dragged ammo stack.
  startLoading(target, unload, source) {
    this.loader = { target, unload, source, t: 0.15 };
  }

  tickLoader(dt) {
    const L = this.loader;
    if (!L) return;
    if (!this.invOpen) { this.loader = null; return; }
    L.t -= dt;
    if (L.t > 0) return;
    L.t = L.unload ? 0.18 : 0.42 * (1 - 0.06 * this.player.skill.aiming);
    if (!loadStep(L, this)) this.loader = null;
    this.inv.render();
  }

  itemActions(it, src) {
    const wa = weaponActions(it, src, this);
    if (wa.length) return wa;
    if (it.key !== 'log' || !src.grid) return [];
    const grids = this.player.ammoGrids();
    if (!grids.some((g) => g.items.some((i) => i.key === 'saw'))) return [['Saw into planks (needs a saw)', () => this.hud.message('You need a saw')]];
    return [['Saw into 4 planks', () => {
      removeItem(src.grid, it);
      const planks = makeItem('planks', { count: 4 });
      if (!addItem(src.grid, planks)) this.dropItem(planks);
      this.zombies.noise(this.player.pos.x, this.player.pos.z, 10);
      sfx.chop();
    }]];
  }

  closeInventory() {
    if (!this.invOpen) return;
    this.invOpen = false;
    const trader = this.openContainer?.survivor;
    if (trader && this.survivors) this.survivors.endTrade(trader, this.tradeBefore);
    this.openContainer = null;
    this.loader = null;
    this.inv.cancelDrag();
    this.inv.closeMenu();
    $('invwrap').style.display = 'none';
    this.resume();
  }

  // Trade with a survivor: their backpack opens next to yours. What you take
  // versus what you give decides how they feel about it afterwards.
  openTrade(s) {
    this.tradeBefore = s.inv.items.reduce((n, it) => n + itemValue(it), 0);
    this.openInventory({ name: `Trade with ${s.name} — take what you need, give something back`, grid: s.inv, survivor: s, get x() { return s.pos.x; }, get z() { return s.pos.z; } });
  }

  dropItem(it) {
    const pp = this.player.pos;
    let c = this.world.containers.find((k) => k.type === 'drop' && Math.hypot(k.x - pp.x, k.z - pp.z) < 1.5);
    if (!c) c = this.addExtraContainer({ type: 'drop', name: 'Dropped items', x: pp.x, z: pp.z, grid: makeGrid(8, 8) });
    if (!addItem(c.grid, it)) { c.grid.w += 2; c.grid.h += 2; addItem(c.grid, it); }
  }

  quickHeal() {
    const pl = this.player;
    const want = pl.bleeding.size ? (k) => ITEMS[k].stopBleed : (k) => ITEMS[k].heal;
    for (const g of pl.ammoGrids()) {
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

  // ---------- world interaction ----------
  interactables() {
    const out = [...this.world.containers, ...this.world.beds];
    for (const d of this.world.doors) if (!d.broken) out.push(d);
    for (const s of this.builder.structures) if (s.grid || s.door || s.type === 'bed') out.push(s);
    for (const s of this.survivors.list) if (!s.dead && s.disp !== 'hostile') out.push(s);
    return out;
  }

  findLookTarget() {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bestScore = Infinity;
    for (const c of this.interactables()) {
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.3) continue;
      const dot = d > 0.6 ? (dx * fx + dz * fz) / d : 1;
      if (dot < 0.7) continue;
      const score = d * (2 - dot);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  interact(t) {
    if (t.kind === 'door') {
      setDoor(t, !t.open);
      this.zombies.updateNavRegion(t.box.minX, t.box.minZ, t.box.maxX, t.box.maxZ);
      sfx.door();
      this.zombies.noise(t.x, t.z, 3);
    } else if (t.door) {
      this.builder.toggleDoor(t);
      sfx.door();
    } else if (t.kind === 'survivor' && t.trader) {
      t.met = true;
      this.traders.openFor(t);
    } else if (t.kind === 'survivor') {
      this.survivors.openDialog(t);
    } else if (t.kind === 'bed' || t.type === 'bed') {
      this.sleep();
    } else if (t.grid && this.traders?.isPrivate(t)) {
      this.hud.message(`That's ${t.owner.name}'s. Trade for it instead.`, 3);
    } else if (t.grid) {
      this.openInventory(t);
      sfx.pickup();
    }
  }

  sleep() {
    const p = this.player;
    if (p.fatigue < 30) return this.hud.message("You're not tired enough to sleep.");
    if (this.zombies.list.some((z) => z.state === 'chase' || Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 12)) {
      return this.hud.message("You can't sleep with zombies nearby.");
    }
    const hours = Math.min(9, Math.ceil(p.fatigue / 14));
    const fade = $('sleepfade');
    fade.style.opacity = 1;
    this.sleeping = true;
    setTimeout(() => {
      this.time += hours * 60;
      p.sleep(hours);
      this.updateLighting();
      let woke = `You slept ${hours} hours.`;
      // Sleeping outside a safehouse is risky: the dead come looking.
      if (!this.inSafehouse(p.pos.x, p.pos.z) && Math.random() < 0.6) {
        for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const z = this.zombies.spawn(p.pos.x + Math.cos(a) * 22, p.pos.z + Math.sin(a) * 22);
          z.state = 'investigate'; z.target = { x: p.pos.x, z: p.pos.z };
        }
        woke += ' You wake to groaning outside...';
      }
      this.hud.message(woke, 5);
      fade.style.opacity = 0;
      this.sleeping = false;
      this.saveGame();
    }, 1200);
  }

  inSafehouse(x, z) {
    const s = this.safehouse;
    return !!s && x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1;
  }

  claimSafehouse() {
    const p = this.player.pos;
    const b = this.world.buildingAt(p.x, p.z);
    let area;
    if (b) {
      if (this.zombies.list.some((z) => z.pos.x > b.x0 && z.pos.x < b.x1 && z.pos.z > b.z0 && z.pos.z < b.z1)) {
        return this.hud.message('Clear the zombies out of this building first.');
      }
      area = { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, name: `this ${b.kind}` };
    } else {
      // Outdoors: claim a camp area around you for your own construction.
      area = { x0: p.x - 10, x1: p.x + 10, z0: p.z - 10, z1: p.z + 10, name: 'a camp' };
    }
    this.safehouse = area;
    this.hud.message(`You claimed ${area.name} as your safehouse. Zombies won't respawn here.`, 5);
    this.saveGame();
  }

  // Melee swing that hit no zombie: an axe chops the tree in front of you.
  meleeWorld(key) {
    if (key !== 'axe') return;
    const p = this.player;
    const x = p.pos.x - Math.sin(p.yaw) * 1.0, z = p.pos.z - Math.cos(p.yaw) * 1.0;
    const tree = this.world.nearestTree(x, z, 1.2);
    if (tree < 0) return;
    sfx.chop();
    this.zombies.noise(p.pos.x, p.pos.z, 12);
    const hits = (this.chopHits.get(tree) || 0) + 1;
    this.chopHits.set(tree, hits);
    if (hits < 5) return this.hud.message(`Chopping... (${hits}/5)`, 1);
    this.world.fellTree(tree);
    this.zombies.updateNavRegion(x - 1, z - 1, x + 1, z + 1);
    for (let i = 0; i < 2; i++) this.dropItem(makeItem('log'));
    this.hud.message('Timber! Two logs dropped at your feet. Saw them into planks.', 4);
  }

  damageStructure(s, dmg) {
    s.hp -= dmg;
    const p = this.player.pos;
    const near = Math.hypot(s.x - p.x, s.z - p.z) < 30;
    if (near) sfx.bash();
    if (s.hp > 0) return;
    if (s.kind === 'door') this.breakDoor(s);
    else this.builder.remove(s);
    if (near) this.hud.message(`A ${s.name.toLowerCase()} was smashed!`);
  }

  breakDoor(d, silent) {
    d.broken = true;
    d.box.noCollide = true;
    d.box.blocksShot = d.box.blocksSight = false;
    d.box.structure = null;
    this.world.group.remove(d.mesh);
    if (!silent) this.zombies.updateNavRegion(d.box.minX, d.box.minZ, d.box.maxX, d.box.maxZ);
  }

  // ---------- main loop ----------
  loop(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.state === 'play') this.update(dt, t / 1000);
    this.dev.update(dt);
    this.input.endFrame();
    if (this.state === 'play') {
      this.player?.gun.renderScope(this.renderer, this.scene);
      this.renderer.render(this.scene, this.camera);
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }

  update(dt, now) {
    const inp = this.input.state();
    const pressed = (c) => this.input.pressed.has(c);
    if (this.dialogOpen) {
      // Talking: number keys pick an option; Esc, walking or distance ends it.
      const s = this.survivors.dialogFor;
      for (const c of this.input.pressed) if (c.startsWith('Digit') || c === 'Escape') this.survivors.dialogKey(c);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed) || !s || s.dead || s.pos.distanceTo(this.player.pos) > 4) this.survivors.closeDialog();
      inp.interact = inp.inventory = inp.slot1 = inp.slot2 = inp.reload = inp.jump = false;
    } else if (this.traderOpen) {
      // At a trader's counter: Esc, Tab, walking off or the trader dying closes it.
      const npc = this.traders.open?.npc;
      if (pressed('Escape') || inp.inventory || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed) || !npc || npc.dead || npc.disp === 'hostile' || npc.pos.distanceTo(this.player.pos) > 4.5) this.traders.close();
      inp.interact = inp.inventory = inp.slot1 = inp.slot2 = inp.reload = inp.jump = inp.fire = inp.firePressed = false;
    } else if (this.invOpen) {
      // Many ways out: Esc, Tab/I, the interact key, or simply starting to walk.
      const walk = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed);
      const c = this.openContainer;
      const tooFar = c && Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z) > 3;
      if (inp.inventory || pressed('Escape') || inp.interact || walk || tooFar) {
        this.closeInventory();
        inp.interact = inp.inventory = false;
      }
    } else if (inp.inventory) {
      this.openInventory(this.lookTarget?.grid ? this.lookTarget : null);
    } else if (pressed('Escape') && this.input.locked && !this.hud.mapOpen) {
      // With Esc captured in fullscreen the browser won't release the mouse,
      // so Esc pauses explicitly.
      this.input.unlock();
    } else if (pressed('Escape') && this.awaitingRelock && !this.hud.mapOpen) {
      // Esc again (after closing a menu with Esc) really pauses.
      this.awaitingRelock = false;
      this.input.softLive = false;
      this.updatePause();
    }
    if (inp.map) { this.hud.toggleMap(); if (this.hud.mapOpen) this.input.unlock(); else this.resume(); this.updatePause(); }
    if (this.hud.mapOpen && pressed('Escape')) { this.hud.toggleMap(false); this.resume(); }
    const paused = !this.input.locked && !this.invOpen && !this.hud.mapOpen && !this.dev.open && !this.dialogOpen && !this.traderOpen && !this.awaitingRelock;
    if (paused || this.sleeping) return;
    if (this.dev.open && this.dev.pauseWhileOpen) {
      // Simulation paused, but keep the view in sync with console edits.
      this.updateLighting();
      this.hud.update(0, this);
      return;
    }

    if (this.invOpen) inp.reload = inp.slot1 = inp.slot2 = inp.flashlight = inp.interact = inp.check = inp.fireMode = inp.jump = inp.crouchToggle = inp.prone = false;
    this.tickLoader(dt);
    if (pressed('KeyB') && !this.invOpen) {
      this.builder.toggle();
      this.hud.message(this.builder.active ? 'Build mode: 1–6 select, R rotate, LMB build, X dismantle, B exit' : 'Build mode off');
    }
    if (pressed('KeyV') && !this.invOpen) this.claimSafehouse();
    if (inp.interact && !this.invOpen && this.lookTarget) this.interact(this.lookTarget);
    if (inp.heal) this.quickHeal();

    if (this.builder.active && !this.invOpen) {
      this.builder.update(inp);
      inp.fire = inp.firePressed = inp.reload = inp.slot1 = inp.slot2 = inp.aim = inp.prone = false;
    }

    this.time += dt * this.dev.timeScale; // one in-game minute per real second at 1x
    this.updateLighting();
    this.player.update(dt, inp);
    if (this.state !== 'play') return;
    this.dev.applyCheats();
    if (!this.dev.freeze) this.zombies.update(dt, this.player, this);
    if (this.state !== 'play') return;
    if (!this.dev.freeze) this.survivors.update(dt);
    if (this.state !== 'play') return;
    this.ragdolls.update(dt);
    this.traders.update(dt);
    this.fx.update(dt);
    this.builder.flicker(now);

    const pp = this.player.pos;
    this.sun.position.set(pp.x + 30, 60, pp.z + 20);
    this.sun.target.position.set(pp.x, 0, pp.z);
    this.lookTarget = this.invOpen || this.builder.active ? null : this.findLookTarget();

    this.beat = (this.beat || 0) - dt;
    if (this.beat <= 0 && (this.player.hp.thorax < 30 || this.player.hp.head < 12)) { this.beat = 1; sfx.heartbeat(); }

    this.autosave -= dt;
    if (this.autosave <= 0) { this.autosave = AUTOSAVE; this.saveGame(); }

    this.hud.update(dt, this);
  }
}

// Exposed for debugging from the browser console.
window.game = new Game();
