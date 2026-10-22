import * as THREE from 'three';
import { buildWorld, setDoor, setDoorAng, setWindow, WORLD_VERSION } from './world.js';
import { callLift } from './levels.js';
import { Zombies } from './zombies.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { FX } from './fx.js';
import { RagdollSystem, lookMats } from './ragdoll.js';
import { PaperDoll, playerLook } from './paperdoll.js';
import { skillSheet } from './skills.js';
import { setupSoundPanel } from './soundui.js';
import { AirSupport } from './airstrike.js';
import { Throwables } from './throwables.js';
import { Drones } from './drones.js';
import { Intro, findLZ } from './intro.js';
import { DynLights, VM_FILL, INTERIOR_LAYER } from './dynlights.js';
import { loadGfx, applyGfx, setupGfxPanel } from './gfx.js';
import { setupGuide } from './guide.js';
import { Traders } from './traders.js';
import { Progress } from './progress.js';
import { Vehicles } from './vehicles.js';
import { InventoryUI } from './invui.js';
import { ITEMS, makeItem, migrateItem, itemValue } from './items.js';
import { combineItems, weaponActions, loadStep } from './weapons.js';
import { makeGrid, addItem, removeItem } from './inventory.js';
import { loadSave, writeSave, deleteSave } from './save.js';
import { initAudio, sfx, setAudioEnv, audioStats } from './audio.js';
import { explode } from './explosives.js';
import { Builder, BUILDABLES, buildCostText } from './build.js';
import { setupCreation } from './character.js';
import { DevConsole } from './devconsole.js';
import { Survivors } from './survivors.js';
import { Farming } from './farming.js';
import { Weather, SEASON_DAYS } from './weather.js';
import { Hub } from './hub.js';
import { Mission, newHub, refillContracts, extractTime, giveStash, stashItem, dayClock } from './contracts.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'create', 'death'];
const START_TIME = 9 * 60;      // day 1, 09:00
const AUTOSAVE = 30;            // seconds
const NIGHT = new THREE.Color(0x10141c), DAY = new THREE.Color(0x7d8a96);
// what a door's colliders are doing: shut, passable, swung wide
const doorState = (d) => (d.ang < 0.03 ? -1 : Math.round((d.ang || 0) * 5)); // (shut, or which fifth of the swing)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

class Game {
  constructor() {
    this.canvas = $('game');
    // Stencil is needed for reflex-sight reticles.
    const gfx = loadGfx();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: gfx.aa, stencil: true, powerPreference: 'high-performance' });
    // (checking each shader's log makes the driver finish compiling it then
    // and there; without it they compile in parallel)
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.background = NIGHT.clone();
    this.scene.fog = new THREE.FogExp2(NIGHT.getHex(), 0.026);
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.03, 300);
    this.camera.layers.enable(INTERIOR_LAYER); // (furniture: seen, but kept out of the sun's shadows)
    this.scene.add(this.camera);
    // three.js draws every shadow map in one go and picks what casts by the
    // main camera's layers, so the sun's map is drawn on its own with the
    // interior layer switched off: furniture under a roof casts nothing in
    // sunlight, and in a tower block that's most of a shadow map's draws.
    // The flashlight's map still has it.
    const sm = this.renderer.shadowMap, drawShadows = sm.render.bind(sm);
    const sunOnly = [], rest = [];
    sm.render = (lights, scene, camera) => {
      sunOnly.length = rest.length = 0;
      for (const l of lights) (l === this.sun ? sunOnly : rest).push(l);
      if (sunOnly.length) {
        const had = camera.layers.isEnabled(INTERIOR_LAYER);
        camera.layers.disable(INTERIOR_LAYER);
        drawShadows(sunOnly, scene, camera);
        if (had) camera.layers.enable(INTERIOR_LAYER);
      }
      if (rest.length) drawShadows(rest, scene, camera);
    };

    this.hemi = new THREE.HemisphereLight(0x7a8aaa, 0x2a2a1a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0x9aaad8, 0.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.normalBias = 0.02; // no acne on big flat ground pieces
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
    this.scene.add(this.sun, this.sun.target);
    this.lights = new DynLights(this.scene);
    applyGfx(this, gfx);

    this.input = new Input(this.canvas);
    this.hud = new HUD();
    this.fx = new FX(this.scene);
    this.inv = new InventoryUI($('inv'));
    this.builder = new Builder(this);
    this.buildables = BUILDABLES;
    this.buildCost = buildCostText;
    this.creation = setupCreation((ch) => this.recruit(ch), () => false);
    this.dev = new DevConsole(this);
    this.audioStats = audioStats; // (for the console: voices playing, output level)
    this.sfx = sfx; // (and the sounds themselves, to try one: game.sfx.shot('ak74', false, 0.1, 0, 200))
    this.state = 'menu';
    this.invOpen = false;
    this.save = loadSave();
    this.migrateProfile();
    this.hub = new Hub(this);
    this.chopHits = new Map();
    this.shaking = new Set(); // doors being beaten
    this.swinging = new Set(); // doors on the move
    this.charges = []; // breaching charges counting down

    this.watchFullscreen();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.canvas.addEventListener('click', () => {
      this.escCloseAt = 0; // a click starts fresh: a later Esc may pause again
      // Only when the mouse isn't already captured: re-requesting the lock on
      // every shot made Chrome re-lock (and drop mouse movement) each click.
      if (this.state === 'play' && !this.invOpen && !this.hud.mapOpen && !this.input.locked) this.input.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked) { this.awaitingRelock = false; this.input.softLive = false; }
      // Lost right after Esc closed a menu: the browser's own Esc handling,
      // not a request to pause. Keep playing; a click takes the mouse back.
      else if (this.state === 'play' && performance.now() - (this.escCloseAt || -1e9) < 700) { this.awaitingRelock = true; this.input.softLive = true; }
      this.updatePause();
    });
    this.input.onLockFail = () => this.updatePause();
    $('pause').addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') this.input.lock(); });
    $('btn-save-quit').onclick = () => this.quitToMenu();
    this.soundPanel = setupSoundPanel();
    $('btn-sound').onclick = () => this.soundPanel.open();
    this.gfxPanel = setupGfxPanel(this);
    this.guide = setupGuide(this); // F2
    $('btn-guide').onclick = () => this.guide.open();
    $('btn-gfx').onclick = () => this.gfxPanel.open();
    $('btn-fullscreen').onclick = () => { if (document.fullscreenElement) this.exitFullscreen(); else this.enterFullscreen(); };
    $('btn-inv-close').onclick = () => this.closeInventory();
    // Clicking the dim background (not a panel) closes the inventory.
    $('invwrap').addEventListener('pointerdown', (e) => {
      if (e.button === 0 && (e.target.id === 'invwrap' || e.target.id === 'inv' || e.target.classList.contains('inv-col'))) this.closeInventory();
    });
    $('btn-create-back').onclick = () => this.showMenu();
    $('btn-death-next').onclick = () => this.showMenu();
    $('btn-inv-stashall').onclick = () => this.stashAll();
    addEventListener('beforeunload', (e) => {
      this.saveGame();
      // Ctrl+W (or a stray close) while playing asks first; where the
      // browser lets a page keep the key (fullscreen) it never gets here
      if (this.state === 'play' && !navigator.webdriver) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveGame(); });

    this.last = performance.now();
    this.showMenu();
    requestAnimationFrame((t) => this.loop(t));
  }

  onResize() { this.resize(); }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- time ----------
  get day() { return Math.floor(this.time / 1440) + 1; }
  get hour() { return (this.time % 1440) / 60; }
  get isNight() { const h = this.hour; return this.weather ? this.weather.isNight(h) : h >= 21 || h < 5.5; }
  clockText() {
    const m = Math.floor(this.time % 1440);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  updateLighting() {
    const h = this.hour;
    // Sunrise and sunset move with the seasons
    const W = this.weather;
    const d = this.dev.fullbright ? 1 : W ? W.daylight(h) : smooth(5, 7.5, h) - smooth(19, 21.5, h); // 0 = night, 1 = day
    this.daylight = d;
    this.scene.background.copy(NIGHT).lerp(DAY, d);
    if (W && !this.dev.fullbright) W.applySky(this.scene.background, d);
    this.scene.fog.color.copy(this.scene.background);
    // (a shorter view distance brings the fog in to hide where drawing stops)
    this.scene.fog.density = this.dev.noFog ? 0 : (0.026 - 0.014 * d + (W && !this.dev.fullbright ? W.fogAdd : 0)) / (this.gfx?.view || 1);
    // Nothing past the point where fog is ~opaque gets drawn
    const far = this.dev.noFog ? 300 : Math.min(300 * (this.gfx?.view || 1), Math.round(2.0 / this.scene.fog.density));
    if (far !== this.camera.far) { this.camera.far = far; this.camera.updateProjectionMatrix(); }
    // Countryside chunks a little short of that (the fog is near-opaque there)
    if (this.world && this.camera) this.world.cull(this.camera.position.x, this.camera.position.z, Math.min(far, this.dev.noFog ? 300 : Math.round(1.6 / this.scene.fog.density)), this.player?.floorY || 0);
    const cloud = W && !this.dev.fullbright ? W.sunMul : 1, flash = W ? W.flashLight : 0;
    this.hemi.intensity = (1.1 + 1.3 * d) * (0.75 + 0.25 * cloud) + flash;
    this.sun.intensity = (0.9 + 1.6 * d) * cloud;
    VM_FILL.value = 0.03 + 0.09 * (1 - d); // (your hands and gun never go black)
    this.sun.color.setHex(0x9aaad8).lerp(new THREE.Color(0xfff0d8), d);
  }

  // ---------- fullscreen ----------
  // Must run inside a click/key handler (browsers require a user gesture).
  enterFullscreen() {
    const el = document.documentElement;
    if (document.fullscreenElement || !el.requestFullscreen) return;
    this.wantFullscreen = true;
    el.requestFullscreen({ navigationUI: 'hide' })
      // Capture Esc (Chrome/Edge) so closing menus doesn't also exit fullscreen.
      // Holding Esc still leaves fullscreen.
      // and the Ctrl shortcuts that would close or reopen the tab mid-fight
      // (Ctrl+W, Ctrl+T, Ctrl+N): in fullscreen the page can keep them
      .then(() => navigator.keyboard?.lock?.(['Escape', 'KeyW', 'KeyT', 'KeyN', 'KeyQ']))
      .catch(() => { this.wantFullscreen = !!document.fullscreenElement; });
  }

  // Esc that closes a menu shouldn't drop fullscreen. Where the browser can't
  // capture Esc (Firefox, Safari, non-https pages) it leaves fullscreen anyway;
  // then the next click or key puts it back (browsers don't count Esc itself
  // as a gesture that may enter fullscreen).
  watchFullscreen() {
    const uiOpen = () => this.state === 'play' && (this.invOpen || this.hud.mapOpen || this.dialogOpen || this.traderOpen || this.vehicleOpen || this.farmOpen || this.progress?.panelOpen || this.builder.active);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { this.escAt = performance.now(); this.escUi = uiOpen() || this.awaitingRelock; return; }
      this.restoreFullscreenNow();
    }, true);
    document.addEventListener('pointerdown', () => this.restoreFullscreenNow(), true);
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) { navigator.keyboard?.lock?.(['Escape']).catch(() => {}); this.restoreFullscreen = false; return; }
      // Left fullscreen right after Esc closed a menu: not on purpose
      if (this.wantFullscreen && this.state === 'play' && this.escUi && performance.now() - (this.escAt || 0) < 1500) this.restoreFullscreen = true;
      else this.wantFullscreen = false;
    });
  }

  restoreFullscreenNow() {
    if (!this.restoreFullscreen || this.state !== 'play' || document.fullscreenElement) return;
    this.restoreFullscreen = false;
    this.enterFullscreen();
  }

  exitFullscreen() {
    this.wantFullscreen = false;
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
    this.hub.open();
  }

  // ---------- the base: profile, operative, deployments ----------
  // The save holds the base (stash, handlers, contracts), the operative and
  // the memorial; while deployed, also the zone's world and the raid (its
  // contract, when the helicopter comes back, the mission's state).
  migrateProfile() {
    let s = this.save;
    if (!s) { this.save = s = { hub: newHub(), graveyard: [], character: null, raid: null }; writeSave(s); return; }
    if (s.hub) return;
    s.hub = newHub();
    s.graveyard ||= [];
    // A save from before the base: an operative already in the world carries
    // on there as a free run, with the helicopter coming in three days
    if (s.character?.player && s.world) s.raid = { contract: null, extractAt: (Math.floor(s.time / 1440) + 3) * 1440 + 12 * 60, state: {}, lz: null, start: s.time };
    else { s.world = null; s.raid = null; if (s.character) s.character.player = null; }
    writeSave(s);
  }

  persist() { if (this.save) writeSave(this.save); }

  wipeProfile() {
    deleteSave();
    this.save = null;
    this.migrateProfile();
    this.hub.result = null;
    this.hub.open();
  }

  // A new operative: to the base, ready to deploy
  recruit(ch) {
    delete ch.insert;
    ch.raids = 0; ch.zoneDays = 0;
    this.save.character = ch;
    this.persist();
    this.hub.tab = 'deploy';
    this.showMenu();
  }

  // Off to the zone: a new town, the insertion you picked, the contract's clock
  deploy(contract, ins, freeDays) {
    const s = this.save, hub = s.hub, ch = s.character;
    if (!ch || s.raid) return;
    if (contract) hub.contracts.splice(hub.contracts.indexOf(contract), 1);
    s.seed = Math.floor(Math.random() * 2 ** 31);
    s.worldVersion = WORLD_VERSION;
    s.world = null; s.safehouse = null; delete s.layout;
    // (automated test runs keep a fixed start unless asked)
    if (ins && (!navigator.webdriver || localStorage.getItem('tarkzoid-insert'))) { s.time = ins.minute; s.startOffset = ins.season * SEASON_DAYS + ins.day - 1; }
    else { s.time = START_TIME; delete s.startOffset; }
    const days = contract ? contract.days : freeDays, hour = contract ? contract.hour : 12;
    s.raid = { contract: contract || null, extractAt: extractTime(days, hour), state: {}, lz: null, start: s.time };
    ch.player = null;
    ch.spawnTime = s.time;
    writeSave(s);
    this.loadWorld();
  }

  // The raid is over (extracted, killed, left behind): settle the contract,
  // back to the base. The zone's world is gone with it.
  settleRaid(kind, info = {}) {
    const s = this.save, hub = s.hub, raid = s.raid, ch = this.profile, p = this.player;
    const c = raid?.contract || null;
    const days = Math.max(0, Math.floor((this.time - (raid?.start ?? ch.spawnTime ?? this.time)) / 1440));
    const r = { kind, name: ch.name, days, kills: p.kills - (raid?.state?.kills0 ?? ch.kills ?? 0), contract: c, ok: false, lines: info.lines, rewards: [], rep: 0 };
    if (kind === 'extracted') {
      ch.kills = p.kills; ch.raids = (ch.raids || 0) + 1; ch.zoneDays = (ch.zoneDays || 0) + days;
      ch.player = null; // patched up at the base
      // contract items and the zone traders' quest items stay behind
      const grids = [ch.pockets, ch.equip.backpack?.grid, ...(ch.equip.rig?.grids || []), ...(ch.equip.clothing?.grids || [])].filter(Boolean);
      for (const g of grids) g.items = g.items.filter((it) => ITEMS[it.key].type !== 'quest');
      if (c && info.ok) {
        r.ok = true; r.rewards = c.reward.items; r.rep = c.reward.rep;
        hub.rep[c.handler] = +((hub.rep[c.handler] || 0) + c.reward.rep).toFixed(1);
        for (const [k, n] of c.reward.items) giveStash(hub, k, n);
      }
    } else {
      s.character = null;
      if (kind === 'mia') s.graveyard.push({ name: ch.name, profession: ch.professionName, days, kills: p.kills, reason: 'Missing in action: the helicopter left without them' });
    }
    if (c && !r.ok) hub.rep[c.handler] = Math.max(0, +((hub.rep[c.handler] || 0) - 1).toFixed(1));
    if (c) hub.history.push({ title: c.title, ok: r.ok, kind });
    hub.raids = (hub.raids || 0) + 1;
    hub.stock = {}; // the handlers restock
    refillContracts(hub);
    s.raid = null; s.world = null; s.safehouse = null; delete s.layout;
    writeSave(s);
    this.hub.showResult(r);
  }

  // Called by the mission: aboard the helicopter, or left behind
  endRaid(kind, info) {
    if (this.state !== 'play') return;
    this.settleRaid(kind, info);
    // (the world comes down once this frame is over)
    this.deathTeardown = true;
    this.hub.tab = 'deploy';
    this.showMenu();
  }

  // The stash: the operative's kit on the left, the base's container on the right
  openStash() {
    const ch = this.save.character, hub = this.save.hub;
    if (!ch) return;
    this.profile = ch;
    this.invOpen = true;
    this.openContainer = null;
    $('invwrap').style.display = 'block';
    $('btn-inv-stashall').style.display = '';
    $('invtitle').textContent = `Stash · ${ch.name}`;
    this.doll ||= new PaperDoll();
    this.doll.update(ch);
    this.inv.open(() => this.playerSections(), () => [{ kind: 'grid', title: 'Stash', grid: hub.stash }], {
      doll: this.doll,
      onChange: () => { this.doll.update(ch); },
      combine: (a, b, ctx) => combineItems(a, b, { ...ctx, game: this }),
      loading: () => this.loader?.target,
      onDrop: (it) => stashItem(hub, it),
      onUse: () => false,
      actions: () => [],
    });
  }

  // Everything carried (not worn) into the stash
  stashAll() {
    const ch = this.save?.character, hub = this.save?.hub;
    if (!ch || this.state !== 'menu') return;
    const grids = [ch.pockets, ch.equip.backpack?.grid, ...(ch.equip.rig?.grids || []), ...(ch.equip.clothing?.grids || [])].filter(Boolean);
    for (const g of grids) { for (const it of g.items) stashItem(hub, it); g.items = []; }
    this.inv.render();
    this.persist();
  }

  // ---------- world lifecycle ----------
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
    this.fx.floorUnder = (x, z, y) => (this.world.levels.buildingAt(x, z) ? this.world.levels.groundUnder(x, z, y) : this.world.groundAt(x, z));
    // The same check by fingerprint, for layout changes that came without a
    // WORLD_VERSION bump (saves from before the fingerprint: their traders
    // must still stand in their buildings, and the counts must match).
    // The fingerprint has two parts: the town as first laid out, and the
    // buildings with upper floors (saves from before those have just the first).
    const lay = this.world.layout;
    const savedLegacy = typeof s.layout === 'string' ? s.layout : s.layout?.legacy;
    if (s.world && (savedLegacy ? savedLegacy !== lay.legacy : !this.savedWorldFits(s.world))) {
      this.worldRegenerated = true;
      s.world = null;
      s.safehouse = this.safehouse = null;
    } else if (s.world && s.layout?.extra !== lay.extra) {
      // Upper floors laid out differently (or new): their loot, doors and windows start fresh
      const L = this.world.slots.legacy;
      s.world.containers.length = Math.min(s.world.containers.length, L.containers);
      s.world.doors.length = Math.min(s.world.doors.length, L.doors);
      if (s.world.windows) s.world.windows.length = Math.min(s.world.windows.length, L.windows);
    }
    s.layout = lay;
    this.ragdolls = new RagdollSystem(this);
    const w = s.world;
    this.weather = new Weather(this, w?.weather || null);
    if (w) {
      const slots = this.world.slots;
      w.containers.forEach((grid, i) => { const c = slots.containers[i]; if (c && grid) c.grid = grid; });
      for (const c of w.extra) this.addExtraContainer(c);
      w.doors.forEach((d, i) => {
        const door = slots.doors[i];
        if (!door || !d) return;
        door.hp = d.hp;
        if (d.swing === -1) door.swing = -1;
        if (d.broken) this.breakDoor(door, true); else { if (d.ang != null) setDoorAng(door, d.ang); else setDoor(door, d.open); door.target = door.ang; this.doorTint(door); }
      });
      for (const i of w.felled) this.world.fellTree(i);
      (w.windows || []).forEach((st, i) => { const wn = slots.windows[i]; if (wn && st) setWindow(wn, st === 1 ? 'open' : 'broken'); });
    }
    this.builder.structures = [];
    this.zombies = this.player = null;
    if (w) this.builder.restore(w.structures);
    this.zombies = new Zombies(this.scene, this.world);
    this.zombies.game = this;
    this.player = new Player(this.camera, this.scene, this);
    this.air = new AirSupport(this);
    this.thr = new Throwables(this);
    this.drone = new Drones(this);
    const ch = this.profile;
    if (ch.player) this.player.restore(ch.player);
    // New characters (and anyone whose town was rebuilt, since their old spot
    // may be inside a new building) wake up in a random house.
    // New characters are flown in to a landing zone on the edge of town
    // (automated test runs skip the cinematic unless asked for it)
    const flyIn = !ch.player && !this.worldRegenerated && (!navigator.webdriver || localStorage.getItem('tarkzoid-intro'));
    let lz = null;
    if (flyIn) { lz = findLZ(this.world, w?.zombies || []); this.player.pos.set(lz.x, 0, lz.z); }
    if (!ch.player) this.player.kills = ch.kills || 0;
    else if (this.worldRegenerated) this.placeNewCharacter(false);
    else if (!ch.player) this.placeNewCharacter(!!w);
    // the helicopter comes back to where it put you down
    if (s.raid && !s.raid.lz) s.raid.lz = lz || findLZ(this.world, w?.zombies || []);
    if (w) this.zombies.restore(w.zombies);
    else this.zombies.populate(150, this.player.pos);
    this.survivors = new Survivors(this);
    if (w?.survivors) { this.survivors.restore(w.survivors); this.survivors.factions.restore(w.survivorGroups); }
    this.traders = new Traders(this, w?.traders || null);
    this.traders.spawnNPCs();
    if (!w?.survivors) this.survivors.populate(); // (after the trading posts: gangs don't move in on them)
    this.progress = new Progress(this, this.profile, !ch.player);
    this.vehicles = new Vehicles(this, w?.vehicles || null);
    // (parked cars go on the zombies' map too: they're placed after it's drawn up)
    for (const v of this.vehicles.list) if (v.boxes?.length) this.zombies.updateNavRegion(v.x - v.def.L, v.z - v.def.L, v.x + v.def.L, v.z + v.def.L);
    if (ch.player?.vehicle != null && this.vehicles.list[ch.player.vehicle]) this.vehicles.enter(this.vehicles.list[ch.player.vehicle]);
    this.farming = new Farming(this, w?.farming || null);
    this.mission = s.raid ? new Mission(this, s.raid) : null;

    this.updateLighting();
    this.autosave = AUTOSAVE;
    this.lookTarget = null;
    this.intro = lz ? new Intro(this, lz) : null;
    this.state = 'play';
    $('loading').style.display = 'none';
    this.hud.show(true);
    const c = s.raid?.contract;
    this.hud.message(ch.player ? `Welcome back, ${ch.name}.` : c ? `${ch.name}. Contract: ${c.title}. The helicopter is back at this LZ on ${dayClock(s.raid.extractAt)}. Be here.` : `${ch.name}. Free run. The helicopter is back at this LZ on ${dayClock(s.raid.extractAt)}. Be here.`, 9);
    if (this.worldRegenerated) { this.worldRegenerated = false; this.hud.message('The town has been rebuilt by a game update. Your gear is safe; your old base and loot are gone.', 8); }
    this.input.lock();
    this.updatePause();
  }

  // Bring items from older saves up to date (e.g. weapons gain magazines).
  migrateSave(s) {
    const ch = s.character;
    if (ch) {
      if (!('clothing' in ch.equip)) ch.equip.clothing = null; // slot added with the weather
      if (!('rig' in ch.equip)) ch.equip.rig = null;
      for (const k in ch.equip) if (ch.equip[k]) migrateItem(ch.equip[k]);
      ch.pockets.items.forEach(migrateItem);
    }
    const w = s.world;
    if (!w) return;
    for (const g of w.containers) g?.items.forEach(migrateItem);
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
    if (c.base) { ct.base = c.base; ct.y = (ct.y || 0) + c.base; } // on an upper floor
    if (c.type === 'drop') { ct.mesh = this.dropMesh(c.x, c.z, c.base || 0); return ct; }
    // a gang's or a band's stash: a crate like any other
    if (c.gid) { ct.gid = c.gid; return ct; }
    // Bodies are ragdolls: a fresh one handed over by whoever died, or one
    // rebuilt from its saved pose (older saves: dropped and settled in place).
    ct.look = c.look || { kind: 'survivor', skin: 0x8a7a6a, top: c.color ?? 0x4a4a3a, bottom: 0x2a2a2a };
    if (c.ragdoll) ct.ragdoll = c.ragdoll;
    else {
      const look = ct.look, spec = { kind: look.kind, look, mats: lookMats(look), floor: c.base || 0 };
      if (c.pose) spec.pose = c.pose;
      else {
        spec.matrix = new THREE.Matrix4().makeRotationY(Math.random() * Math.PI * 2).setPosition(c.x, c.base || 0, c.z);
        spec.vel = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
        spec.tone = 0.6;
        spec.settleNow = true;
      }
      ct.ragdoll = this.ragdolls.create(spec);
    }
    return ct;
  }

  dropMesh(x, z, y = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a5a3a }));
    m.position.set(x, y + 0.1, z);
    this.world.group.add(m);
    return m;
  }

  savedWorldFits(w) {
    const W = this.world;
    if (w.containers.length !== W.slots.legacy.containers || w.doors.length !== W.slots.legacy.doors) return false;
    return (w.traders || []).every((t) => {
      const b = W.buildings[t.b];
      return b && t.spot && t.spot.x > b.x0 && t.spot.x < b.x1 && t.spot.z > b.z0 && t.spot.z < b.z1;
    });
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
      containers: W.slots.containers.map((c) => (c ? c.grid : null)),
      extra: W.containers.slice(W.generatedContainers).map((c) => ({
        type: c.type, gid: c.gid, name: c.name, x: +c.x.toFixed(2), z: +c.z.toFixed(2), base: c.base || undefined, grid: c.grid, color: c.color, look: c.look,
        pose: c.ragdoll && !c.ragdoll.dead && c.ragdoll.sleeping ? c.ragdoll.pose() : undefined,
      })),
      doors: W.slots.doors.map((d) => (d ? { open: d.open, hp: d.hp, broken: d.broken || undefined, ang: d.ang > 0.01 && d.ang < 0.99 ? +d.ang.toFixed(2) : undefined, swing: d.swing === -1 ? -1 : undefined } : null)),
      felled: [...W.felled],
      windows: W.slots.windows.map((wn) => (wn && wn.state === 'open' ? 1 : wn && wn.state === 'broken' ? 2 : 0)),
      structures: this.builder.serialize(),
      zombies: this.zombies.serialize(),
      survivors: this.survivors.serialize(),
      survivorGroups: this.survivors.factions.serialize(),
      traders: this.traders?.serialize(),
      vehicles: this.vehicles?.serialize(),
      farming: this.farming?.serialize(),
      weather: this.weather?.serialize(),
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
    this.air?.dispose(); this.air = null;
    this.thr?.dispose(); this.thr = null;
    this.drone?.dispose(); this.drone = null;
    this.intro?.dispose(); this.intro = null; this.heliOut?.dispose(); this.heliOut = null;
    this.zombies?.dispose();
    this.survivors?.dispose();
    this.survivors = null;
    this.vehicles?.dispose();
    this.vehicles = null;
    this.farming?.dispose();
    this.farming = null;
    this.weather?.dispose();
    this.weather = null;
    this.traders?.dispose();
    this.traders = null;
    this.progress?.togglePanel(false);
    this.progress = null;
    $('guide').innerHTML = '';
    this.ragdolls?.dispose();
    this.ragdolls = null;
    this.world?.dispose();
    this.fx.clear();
    for (const c of [...this.camera.children]) this.camera.remove(c);
    this.mission?.dispose(); this.mission = null;
    this.world = this.zombies = this.player = null;
    $('pause').style.display = 'none';
  }

  quitToMenu() {
    this.saveGame();
    this.teardown();
    this.showMenu();
  }

  onDeath(reason) {
    if (this.state !== 'play') return;
    // (never under a cinematic: it would hide the death screen)
    if (this.intro) { this.intro.dispose(); this.intro = null; }
    document.body.classList.remove('cinematic');
    const ch = this.profile, p = this.player;
    const days = Math.floor((this.time - ch.spawnTime) / 1440);
    this.save.graveyard = this.save.graveyard || [];
    this.save.graveyard.push({ name: ch.name, profession: ch.professionName, days, kills: p.kills, reason });
    // The operative and everything they carried are lost; the base keeps
    // the stash, the handlers and the contracts
    this.settleRaid('kia');
    // (the world comes down once this frame is over: whatever is mid-way
    // through its turn, the zombie that landed the blow, the bleed that
    // finished you, still has a world to finish it in)
    this.deathTeardown = true;
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
    if (this.input.keys.has('Escape')) {
      // Closed with Esc: re-taking the mouse while Esc is still down makes
      // the browser release it again on the key-up (and that looked like a
      // pause), so wait for the key-up.
      this.escCloseAt = performance.now();
      const up = (e) => {
        if (e.code !== 'Escape') return;
        removeEventListener('keyup', up, true);
        this.escCloseAt = performance.now();
        if (this.awaitingRelock && this.state === 'play') this.input.lock();
      };
      addEventListener('keyup', up, true);
    } else this.input.lock();
    this.updatePause();
  }

  updatePause() {
    const ui = this.invOpen || this.hud.mapOpen || this.dev.open || this.dialogOpen || this.traderOpen || this.vehicleOpen || this.farmOpen || this.guideOpen;
    const show = this.state === 'play' && !this.input.locked && !ui && !this.awaitingRelock;
    $('pause').style.display = show ? 'flex' : 'none';
    $('relock').style.display = this.state === 'play' && this.awaitingRelock && !this.input.locked && !ui ? 'block' : 'none';
  }

  // What the character's body looks like when they die (as in the inventory)
  corpseLook() {
    const L = playerLook(this.profile), e = this.profile.equip, col = (it) => (it ? new THREE.Color(ITEMS[it.key].color).getHex() : null);
    const look = { kind: 'survivor', skin: L.skin, top: col(e.clothing) ?? L.shirt, bottom: L.jeans, hair: L.hair };
    if (e.backpack) look.pack = col(e.backpack);
    if (e.armor || e.rig) look.vest = col(e.armor || e.rig);
    if (e.helmet) look.helmet = col(e.helmet);
    return look;
  }

  // ---------- inventory ----------
  playerSections() {
    const p = this.profile;
    const s = [
      { kind: 'equip', title: `${p.name} — Equipment`, equip: p.equip, doll: true },
      ...(this.thr ? [{ kind: 'hotbar', title: 'Hotbar (keys 3–6) — drag grenades, meds or food from your pockets or vest here' }] : []),
      { kind: 'grid', title: 'Pockets', grid: p.pockets },
    ];
    // Pockets of what you're wearing: vest / rig first, then the jacket
    for (const slot of ['rig', 'clothing']) {
      const it = p.equip[slot];
      if (it?.grids?.length) s.push({ kind: 'grids', title: `${ITEMS[it.key].name} — pockets`, grids: it.grids, owner: it });
    }
    if (p.equip.backpack) s.push({ kind: 'grid', title: ITEMS[p.equip.backpack.key].name, grid: p.equip.backpack.grid, noNest: true });
    s.push({ kind: 'html', title: 'Skills', col: 2, cls: 'skills', html: () => skillSheet(this) });
    return s;
  }

  openInventory(container) {
    if (container?.grid && !container.survivor) this.progress?.event('search', container);
    if (container?.gid) this.survivors?.factions.onStashOpened(container);
    else if (!container) this.progress?.event('inv');
    this.invOpen = true;
    this.openContainer = container || null;
    if (container?.vehicleTrunk) this.vehicles?.setTrunk(container, true);
    this.input.unlock();
    const right = container ? () => [{ kind: 'grid', title: container.name, grid: container.grid }] : () => [];
    const title = () => { $('invtitle').textContent = `${container ? container.name : 'Inventory'} — carrying ${this.player.carryWeight().toFixed(1)} kg`; };
    title();
    $('invwrap').style.display = 'block';
    $('btn-inv-stashall').style.display = 'none';
    this.doll ||= new PaperDoll();
    this.doll.update(this.profile);
    this.inv.open(() => this.playerSections(), right, {
      doll: this.doll,
      hotbar: this.thr,
      onChange: () => { this.player.buildViewmodel(); this.player.weightTimer = 0; title(); this.doll.update(this.profile); },
      onUse: (it) => {
        if (ITEMS[it.key].tool === 'designator') { this.closeInventory(); this.air?.toggle(true); return false; }
        return this.player.use(it);
      },
      combine: (a, b, ctx) => this.drone?.combine(a, b, ctx) || combineItems(a, b, { ...ctx, game: this }),
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
    const da = this.drone?.actions(it, src) || [];
    if (da.length) return da;
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
    if (this.openContainer?.vehicleTrunk) this.vehicles?.setTrunk(this.openContainer, false);
    this.openContainer = null;
    this.loader = null;
    this.inv.cancelDrag();
    this.inv.closeMenu();
    $('invwrap').style.display = 'none';
    if (this.state === 'menu') { this.hub.onStashClosed(); this.persist(); }
    this.resume();
  }

  // Trade with a survivor: their backpack opens next to yours. What you take
  // versus what you give decides how they feel about it afterwards.
  openTrade(s) {
    this.tradeBefore = s.inv.items.reduce((n, it) => n + itemValue(it), 0);
    this.openInventory({ name: `Trade with ${s.name} — take what you need, give something back`, grid: s.inv, survivor: s, get x() { return s.pos.x; }, get z() { return s.pos.z; } });
  }

  dropItem(it) {
    if (!this.world) { stashItem(this.save.hub, it); return; } // (at the base: into the stash)
    const pp = this.player.pos;
    const fy = this.player.floorY;
    let c = this.world.containers.find((k) => k.type === 'drop' && Math.hypot(k.x - pp.x, k.z - pp.z) < 1.5 && Math.abs((k.base || 0) - fy) < 1);
    if (!c) c = this.addExtraContainer({ type: 'drop', name: 'Dropped items', x: pp.x, z: pp.z, base: fy > 0.01 ? fy : undefined, grid: makeGrid(8, 8) });
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
  // Things you can use; near (x, z) only, if given
  interactables(x, z) {
    const near = x === undefined ? () => true : (c) => Math.abs(c.x - x) < 8 && Math.abs(c.z - z) < 8;
    const W = this.world, out = [];
    if (x === undefined) {
      out.push(...W.containers, ...W.beds);
      for (const w of W.windows) if (w.sill < 1.2) out.push(w);
    } else {
      // The town's containers, beds, windows and doors stay put: they're
      // kept by 8 m cell (rebuilt when containers come or go). What moves
      // or was added since (dropped bags, bodies, car trunks) is checked
      // one by one.
      const sig = W.containers.length * 7 + W.beds.length;
      if (!this.iGrid || this.iGrid.W !== W || this.iGrid.sig !== sig) {
        const cells = new Map(), add = (o) => { const k = Math.floor(o.x / 8) * 4096 + Math.floor(o.z / 8); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(o); };
        for (const c of W.containers.slice(0, W.generatedContainers)) if (!c.vehicleTrunk) add(c);
        for (const b of W.beds) add(b);
        for (const w of W.windows) if (w.sill < 1.2) add(w);
        for (const d of W.doors) add(d);
        this.iGrid = { W, sig, cells, trunks: W.containers.filter((c) => c.vehicleTrunk) };
      }
      const ci = Math.floor(x / 8), cj = Math.floor(z / 8);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of this.iGrid.cells.get((ci + a) * 4096 + cj + b) || []) if (!o.broken) out.push(o);
      for (const c of this.iGrid.trunks) if (near(c)) out.push(c);
      for (let i = W.generatedContainers; i < W.containers.length; i++) if (near(W.containers[i])) out.push(W.containers[i]);
    }
    if (this.vehicles) out.push(...this.vehicles.interactables(x, z), ...this.world.pumps);
    if (this.farming) for (const f of this.farming.interactables()) if (near(f) || f.reach) out.push(f);
    if (x === undefined) for (const d of W.doors) if (!d.broken) out.push(d);
    for (const s of this.builder.structures) if (s.grid || s.door || s.type === 'bed' || s.type === 'rain_barrel') out.push(s);
    for (const s of this.survivors.list) if (!s.dead && s.disp !== 'hostile') out.push(s);
    out.push(...this.world.levels.interactables()); // elevators
    if (this.mission) out.push(...this.mission.interactables()); // the helicopter
    // A breaching charge for a shut door, if you carry one
    if (x !== undefined && this.chargeItem()) {
      for (const d of out) {
        if (d.kind !== 'door' || d.broken || d.ang > 0.5 || d.charge || Math.abs(d.x - x) > 3 || Math.abs(d.z - z) > 3) continue;
        d.breach ||= { kind: 'breach', door: d, x: d.x, z: d.z, base: d.base, name: 'Breach', prompt: () => `[F] Plant a breaching charge (${ITEMS[this.chargeItem()?.key || 'c4'].name})` };
        out.push(d.breach);
        break;
      }
    }
    return out;
  }

  findLookTarget() {
    const p = this.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bestScore = Infinity;
    const cands = [];
    // (thousands of containers: skip the far ones before anything else)
    const px = p.pos.x, pz = p.pos.z;
    for (const c of this.interactables(px, pz)) {
      const dx = c.x - p.pos.x, dz = c.z - p.pos.z;
      const dist = Math.hypot(dx, dz), d = Math.max(0, dist - (c.reach || 0)); // reach: big things (ponds)
      if (d > 2.3) continue;
      if (Math.abs((c.base || 0) - p.floorY) > 1.2) continue; // things on other floors
      const dot = dist > 0.6 + (c.reach || 0) * 0.5 ? (dx * fx + dz * fz) / dist : 1;
      if (dot < (c.kind === 'door' || c.kind === 'breach' ? 0.25 : 0.7)) continue;
      const score = d * (2 - dot);
      cands.push(c);
      if (score < bestScore) { bestScore = score; best = c; }
    }
    // Several things in reach (a body in a doorway, a shelf by a door): list
    // them all and let the mouse wheel pick. The list keeps its order while
    // you look around, and what you picked stays picked while it's in reach.
    if (cands.length < 2) { this.lookChoices = null; this.lookPick = null; return best; }
    const prev = this.lookChoices || [];
    const list = [...prev.filter((c) => cands.includes(c)), ...cands.filter((c) => !prev.includes(c))].slice(0, 6);
    this.lookChoices = list;
    if (!list.includes(this.lookPick)) this.lookPick = list.includes(best) ? best : list[0];
    return this.lookPick;
  }
  // Mouse wheel over the list of things in reach
  scrollLook(dir) {
    const L = this.lookChoices;
    if (!L) return false;
    const i = L.indexOf(this.lookPick);
    this.lookPick = L[(i + dir + L.length) % L.length];
    this.lookTarget = this.lookPick;
    sfx.click?.();
    return true;
  }

  interact(t) {
    if (t.kind === 'door') {
      this.doorHold = { d: t, t: 0, dir: t.ang < 0.97 ? 1 : -1 };
    } else if (t.kind === 'breach') {
      this.plantCharge(t.door);
    } else if (t.kind === 'lift') {
      callLift(t.lift, t.level);
      this.hud.message(t.lift.level === t.level && t.lift.state !== 'moving' ? 'The doors slide open.' : 'You press the call button. The elevator is on its way.', 2);
    } else if (t.kind === 'liftcar') {
      const l = t.lift, name = (L) => (L === 0 ? 'Ground floor' : `Floor ${L + 1}`);
      this.survivors.openMenu('Elevator', `${name(l.level)}. Which floor?`, Array.from({ length: l.top + 1 }, (_, L) => [name(L) + (L === l.level ? ' (here)' : ''), () => callLift(l, L)]));
    } else if (t.kind === 'heli') {
      this.mission.board();
    } else if (t.kind === 'vehicle') {
      this.vehicles.openPanel(t.v);
    } else if (t.kind === 'pump') {
      this.vehicles.usePump(t);
    } else if (t.type === 'rain_barrel') {
      this.weather.useBarrel(t);
    } else if (t.kind === 'plot' || t.kind === 'forage' || t.kind === 'water') {
      this.farming.interact(t);
    } else if (t.kind === 'window') {
      if (t.state === 'broken') return this.hud.message('The glass is smashed. Space to climb through.', 2);
      setWindow(t, t.state === 'open' ? 'closed' : 'open');
      sfx.windowSlide();
      this.zombies.noise(t.x, t.z, 2);
    } else if (t.door) {
      this.builder.toggleDoor(t);
      sfx.door();
    } else if (t.kind === 'survivor' && t.trader) {
      this.player.gun.lower(true); // weapon down when you walk up to talk
      t.met = true;
      this.traders.openFor(t);
    } else if (t.kind === 'survivor') {
      this.player.gun.lower(true);
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

  // ---------- doors ----------
  // Swing a door to open (1) or shut (0), smoothly; speed in full swings a second
  swingDoor(d, target, speed = 2.4) {
    if (d.broken || !d.sync) { setDoor(d, target > 0.5); return; }
    d.target = target; d.speed = speed;
    d.ang ??= d.open ? 1 : 0;
    this.swinging.add(d);
  }

  updateDoors(dt) {
    // Holding F on a door eases it open (or, wide open, shut) a little at a
    // time: open a crack to look through. A tap swings it all the way.
    const H = this.doorHold;
    if (H) {
      const d = H.d, held = this.input.keys.has('KeyF') && !d.broken && Math.hypot(d.x - this.player.pos.x, d.z - this.player.pos.z) < 3;
      H.t += dt;
      if (held && H.t > 0.22) {
        if (!H.creep) { H.creep = true; sfx.creak(); }
        this.swinging.delete(d);
        const was = doorState(d);
        setDoorAng(d, Math.max(0, Math.min(1, d.ang + H.dir * 0.42 * dt)));
        d.target = d.ang;
        if (was !== doorState(d)) this.doorNav(d);
      } else if (!held) {
        if (!H.creep && !d.broken) {
          this.swingDoor(d, d.ang > 0.5 ? 0 : 1);
          sfx.door();
          this.zombies.noise(d.x, d.z, 3, false, d.base || 0);
        }
        this.doorHold = null;
      }
    }
    for (const d of this.swinging) {
      if (d.broken) { this.swinging.delete(d); continue; }
      const step = d.speed * dt, gap = d.target - d.ang;
      // eases in and out: quick through the middle, settling at the ends
      const k = Math.abs(gap) < 0.15 ? 0.45 + Math.abs(gap) * 3.6 : 1;
      const was = doorState(d);
      setDoorAng(d, Math.abs(gap) <= step * k ? d.target : d.ang + Math.sign(gap) * step * k);
      if (was !== doorState(d)) this.doorNav(d);
      if (d.ang === d.target) this.swinging.delete(d);
    }
    // Breaching charges: beeping faster, then the door comes in
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      c.t -= dt; c.beep -= dt;
      if (c.beep <= 0) { c.beep = Math.max(0.12, c.t / 5); sfx.click?.(2400, 0.25); c.led.visible = true; }
      else if (c.beep < 0.06 || c.led.visible && c.beep > 0.08) c.led.visible = c.beep < 0.06;
      if (c.t > 0) continue;
      this.charges.splice(i, 1);
      this.world.group.remove(c.mesh);
      c.door.charge = null;
      const def = ITEMS[c.key], from = c.mesh.position.clone();
      if (!c.door.broken) this.breakDoor(c.door, false, from.clone().addScaledVector(c.n, -2));
      explode(this, from, { radius: def.radius * (c.key === 'c4' ? 1 : 1), damage: def.damage, frag: def.frag, big: def.big, by: 'your breaching charge' });
    }
  }

  // The walking grids round a door whose colliders changed (the doorway,
  // and the swung panel inside)
  doorNav(d) {
    // (the doorway and everywhere the panel swings through)
    const R = d.w + 0.2;
    this.zombies.updateNavRegion((d.mesh?.position.x ?? d.x) - R, (d.mesh?.position.z ?? d.z) - R, (d.mesh?.position.x ?? d.x) + R, (d.mesh?.position.z ?? d.z) + R);
  }

  // The charge you'd use: a breaching charge, else C4
  chargeItem() {
    if (!this.player) return null;
    const grids = this.player.ammoGrids();
    for (const key of ['breach_charge', 'c4']) for (const g of grids) { const it = g.items.find((i) => i.key === key); if (it) return it; }
    return null;
  }

  plantCharge(d) {
    const it = this.chargeItem();
    if (!it || d.broken || d.charge) return;
    for (const g of this.player.ammoGrids()) { const i = g.items.indexOf(it); if (i >= 0) { if (it.count > 1) it.count--; else g.items.splice(i, 1); break; } }
    // on the face of the door you're standing at
    const p = this.player.pos, n = d.ax === 'x' ? new THREE.Vector3(0, 0, Math.sign(p.z - d.z) || 1) : new THREE.Vector3(Math.sign(p.x - d.x) || 1, 0, 0);
    const g = new THREE.Group();
    const block = new THREE.Mesh(new THREE.BoxGeometry(d.ax === 'x' ? 0.22 : 0.06, 0.14, d.ax === 'x' ? 0.06 : 0.22), new THREE.MeshStandardMaterial({ color: 0xc8c0a0, roughness: 0.9 }));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    led.position.set(n.x * 0.035, 0.05, n.z * 0.035);
    g.add(block, led);
    g.position.set(d.x + n.x * 0.08, (d.base || 0) + 1.05, d.z + n.z * 0.08);
    this.world.group.add(g);
    d.charge = { door: d, mesh: g, led, n, key: it.key, t: 5, beep: 0 };
    this.charges.push(d.charge);
    sfx.click?.(900, 0.4);
    this.hud.message('Charge set: five seconds. Get clear!', 3);
  }

  // A kick at whatever's in front: a door bursts open (or off its hinges),
  // a zombie is shoved back and may go down
  kick() {
    const p = this.player;
    if (p.kickCd > 0 || p.stamina < 10 || p.prone) return;
    p.kickCd = 0.9; p.kickT = 0.45;
    p.stamina -= 14 * (1 - 0.06 * p.skill.strength);
    sfx.swing();
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ahead = (o, r) => { const dx = o.x - p.pos.x, dz = o.z - p.pos.z, dd = Math.hypot(dx, dz); return dd < r && (dx * fx + dz * fz) / (dd || 1) > 0.55 && Math.abs((o.base || 0) - p.floorY) < 1.2; };
    const door = (this.lookTarget?.kind === 'door' && ahead(this.lookTarget, 1.9) ? this.lookTarget : null) || this.world.doors.find((d) => !d.broken && d.ang < 0.6 && ahead(d, 1.7));
    if (door && !door.broken && door.ang < 0.6) {
      setTimeout(() => this.kickDoor(door), 160); // (the boot lands a moment after you lift it)
      return;
    }
    const str = p.skill.strength;
    for (const zb of this.zombies.list) {
      if (zb.down || Math.abs(zb.pos.y - p.floorY) > 1) continue;
      if (!ahead({ x: zb.pos.x, z: zb.pos.z, base: zb.pos.y }, 1.5 + zb.radius)) continue;
      const dir = new THREE.Vector3(zb.pos.x - p.pos.x, 0.15, zb.pos.z - p.pos.z).normalize();
      const killed = this.zombies.damage(zb, 6 + 2 * str, p.pos.x, p.pos.z, false, { point: zb.pos.clone().setY(zb.pos.y + 0.9), dir, force: 5 + str, knock: 0.45 + 0.05 * str });
      sfx.meleeHit(false);
      if (killed) { sfx.kill(); p.onKill(zb); }
      break;
    }
  }

  kickDoor(d) {
    if (this.state !== 'play' || d.broken) return;
    const p = this.player, str = p.skill.strength;
    this.zombies.noise(d.x, d.z, 22, false, d.base || 0);
    this.damageStructure(d, 70 + 18 * str + Math.random() * 40, p.pos);
    if (d.broken) return;
    // not off its hinges: it slams open, away from you (whichever way it
    // usually opens), and anyone behind it takes the edge
    if ((d.ang || 0) < 0.1) {
      const tx = d.x - p.pos.x, tz = d.z - p.pos.z;
      // the open leaf lies along (cos r, -sin r) from the hinge: pick the way that points it away
      const away = (sg) => Math.cos(d.baseRot + sg * Math.PI / 2) * tx - Math.sin(d.baseRot + sg * Math.PI / 2) * tz;
      const was = d.swing || 1;
      d.swing = away(1) >= away(-1) ? 1 : -1;
      if (d.swing !== was && d.ang) setDoorAng(d, d.ang);
    }
    this.swingDoor(d, 1, 7);
    sfx.doorBreak?.(0.35);
    for (const zb of this.zombies.list) {
      if (zb.down || Math.hypot(zb.pos.x - d.x, zb.pos.z - d.z) > d.w + 0.3) continue;
      const side = d.ax === 'x' ? Math.sign(zb.pos.z - d.z) !== Math.sign(p.pos.z - d.z) : Math.sign(zb.pos.x - d.x) !== Math.sign(p.pos.x - d.x);
      if (!side) continue;
      const dir = new THREE.Vector3(zb.pos.x - p.pos.x, 0.2, zb.pos.z - p.pos.z).normalize();
      this.zombies.damage(zb, 10, p.pos.x, p.pos.z, false, { point: zb.pos.clone().setY(zb.pos.y + 1.2), dir, force: 8, knock: 0.85 });
    }
  }

  sleep() {
    const p = this.player;
    if (p.fatigue < 30) return this.hud.message("You're not tired enough to sleep.");
    if (this.zombies.list.some((z) => z.state === 'chase' || Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z) < 12)) {
      return this.hud.message("You can't sleep with zombies nearby.");
    }
    let hours = Math.min(9, Math.ceil(p.fatigue / 14));
    // never through the helicopter: you wake for the two-hour warning
    if (this.mission) {
      const lim = this.mission.sleepLimit();
      if (lim < 1) return this.hud.message("No time to sleep: the helicopter's coming.");
      hours = Math.min(hours, lim);
    }
    const fade = $('sleepfade');
    fade.style.opacity = 1;
    this.sleeping = true;
    this.progress?.event('sleep');
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
    const p = this.player;
    // Smash a window or hack at a door in front of you
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const ahead = (o, r) => { const dx = o.x - p.pos.x, dz = o.z - p.pos.z, d = Math.hypot(dx, dz); return d < r && (dx * fx + dz * fz) / (d || 1) > 0.6 && Math.abs((o.base || 0) - p.floorY) < 1.2; };
    const win = this.world.windows.find((w) => w.state === 'closed' && ahead(w, 1.7));
    if (win) { this.breakWindow(win, new THREE.Vector3(win.x, (win.base || 0) + (win.sill + win.top) / 2, win.z), new THREE.Vector3(fx, 0, fz)); return; }
    const dmg = key ? ITEMS[key].damage : 0;
    const door = (key === 'axe' || key === 'crowbar') && this.world.doors.find((d) => !d.broken && !d.open && ahead(d, 1.8));
    if (door) { this.damageStructure(door, dmg * 0.6, p.pos); return; }
    if (key !== 'axe') return;
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

  // How loud a knock or crash at (x, z) is where you stand: fading with
  // distance and gone past R metres, quieter through a floor
  heardAt(x, z, R, y = 0) {
    const p = this.player, d = Math.hypot(x - p.pos.x, z - p.pos.z);
    if (d >= R) return 0;
    return (1 - d / R) ** 1.6 * (Math.abs(y - (p.floorY || 0)) > 1.2 ? 0.45 : 1);
  }

  // from: who's hitting it (for which way splinters and planks fly)
  damageStructure(s, dmg, from) {
    if (s.kind === 'window') {
      if (s.state !== 'closed') return;
      s.hp -= dmg;
      const v = this.heardAt(s.x, s.z, 22, s.base || 0);
      if (v > 0.02) sfx.glassHit(v);
      if (s.hp <= 0) this.breakWindow(s, new THREE.Vector3(s.x, (s.sill + s.top) / 2, s.z), from ? new THREE.Vector3(s.x - from.x, 0, s.z - from.z).normalize() : null);
      return;
    }
    s.hp -= dmg;
    const p = this.player.pos;
    const near = Math.hypot(s.x - p.x, s.z - p.z) < 30, v = this.heardAt(s.x, s.z, 26, s.base || 0);
    if (v > 0.02) sfx.bash(v);
    if (s.kind === 'door') {
      // The door shakes, splinters and darkens as it's beaten
      s.shake = 0.3;
      this.shaking.add(s);
      this.doorTint(s);
      const dir = from ? new THREE.Vector3(s.x - from.x, 0, s.z - from.z).normalize() : new THREE.Vector3(0, 0, 0);
      this.fx.burst(new THREE.Vector3(s.x, 0.8 + Math.random() * 1.0, s.z).addScaledVector(dir, -0.15), new THREE.Color(0x8a6a42), 6, 2.5, 0.6, 0.04);
    }
    if (s.hp > 0) return;
    if (s.kind === 'door') this.breakDoor(s, false, from);
    else this.builder.remove(s);
    if (near) this.hud.message(`A ${s.name.toLowerCase()} was smashed!`);
  }

  setWindow(w, state) { setWindow(w, state); }

  // Beaten doors darken and splinter as they lose hit points.
  doorTint(d) {
    d.tint?.(new THREE.Color(d.w < 1.6 ? 0x9a7048 : 0x7a4e2c).lerp(new THREE.Color(0x1e140c), 1 - Math.max(0, d.hp) / d.maxHp));
  }

  // Glass gone: shards, noise, and the window can be climbed through.
  breakWindow(w, point, dir) {
    if (w.state === 'broken') return;
    setWindow(w, 'broken');
    const v = this.heardAt(w.x, w.z, 40, w.base || 0);
    if (v > 0.02) sfx.glass(v);
    const p = point || new THREE.Vector3(w.x, (w.sill + w.top) / 2, w.z);
    const glass = new THREE.Color(0xc8e0e8);
    for (let i = 0; i < 26; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).multiplyScalar(2.5);
      if (dir) v.addScaledVector(dir, 1.5 + Math.random() * 2);
      const at = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * (w.ax === 'x' ? w.w : 0.1), (Math.random() - 0.5) * (w.top - w.sill), (Math.random() - 0.5) * (w.ax === 'z' ? w.w : 0.1)));
      this.fx.particle(at, v, glass, 0.02 + Math.random() * 0.04, 0.9 + Math.random() * 0.5, { drag: 0.5 });
    }
    this.zombies.noise(w.x, w.z, 20);
  }

  breakDoor(d, silent, from) {
    d.broken = true;
    this.shaking.delete(d);
    if (!silent && this.ragdolls) {
      // It bursts: planks fly away from whoever broke it
      const v = this.heardAt(d.x, d.z, 40, d.base || 0);
      if (v > 0.02) sfx.doorBreak(v);
      const dir = from ? new THREE.Vector3(d.x - from.x, 0, d.z - from.z).normalize() : new THREE.Vector3();
      const along = d.ax === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
      for (let i = 0; i < 4; i++) {
        const y = 0.3 + i * 0.5, off = (Math.random() - 0.5) * 0.6;
        const a = new THREE.Vector3(d.x, y, d.z).addScaledVector(along, off - 0.4), b = new THREE.Vector3(d.x, y + (Math.random() - 0.5) * 0.3, d.z).addScaledVector(along, off + 0.4);
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.8), mat);
        plank.castShadow = true;
        this.ragdolls.dropProp(plank, a, b, dir.clone().multiplyScalar(2 + Math.random() * 2.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5)));
      }
      this.fx.burst(new THREE.Vector3(d.x, 1.1, d.z), new THREE.Color(0x8a6a42), 18, 3.5, 0.8, 0.05);
    }
    d.box.noCollide = true;
    d.box.blocksShot = d.box.blocksSight = false;
    d.box.structure = null;
    d.box.decalParent = null;
    for (const s of d.segs || []) { s.noCollide = true; s.blocksShot = false; s.decalParent = null; s.structure = null; }
    this.world.group.remove(d.mesh);
    d.sync?.();
    if (!silent) this.zombies.updateNavRegion(d.box.minX, d.box.minZ, d.box.maxX, d.box.maxZ);
  }

  // ---------- main loop ----------
  loop(t) {
    // (next frame first: one frame going wrong must never stop the game)
    requestAnimationFrame((tt) => this.loop(tt));
    try { this.frame(t); } catch (e) { console.error(e); }
  }
  frame(t) {
    const dt = Math.min(0.05, (t - this.last) / 1000);
    // frame rate, averaged over half a second (shown in the graphics panel)
    this.fpsN = (this.fpsN || 0) + 1; this.fpsT = (this.fpsT || 0) + (t - this.last) / 1000;
    if (this.fpsT > 0.5) { this.fps = Math.round(this.fpsN / this.fpsT); this.fpsN = 0; this.fpsT = 0; }
    this.last = t;
    if (this.state === 'play') this.update(dt, t / 1000);
    this.dev.update(dt);
    this.input.endFrame();
    if (this.state === 'menu') { this.tickLoader(dt); this.hub.frame(dt); }
    if (this.state === 'play') {
      this.player?.gun.renderScope(this.renderer, this.scene);
      this.renderer.render(this.scene, this.camera);
      if (this.invOpen) this.doll?.render(dt);
    }
    if (this.deathTeardown) { this.deathTeardown = false; this.teardown(); }
  }

  update(dt, now) {
    const inp = this.input.state();
    const pressed = (c) => this.input.pressed.has(c);
    // The insertion cinematic: it has the camera until you're on the ground
    if (this.intro && !this.intro.done) {
      if (pressed('Space') || pressed('Escape') || pressed('Enter')) this.intro.finish();
      else this.intro.update(dt);
      this.time += dt * this.dev.timeScale;
      this.updateLighting();
      this.weather.update(dt);
      if (!this.dev.freeze) this.zombies.update(dt, this.player, this);
      if (!this.intro.done) return;
      this.heliOut = this.intro; this.intro = null;
      // Off the helicopter for the first time: the survival guide (paused)
      let seen = true;
      try { seen = !!localStorage.getItem('tarkzoid-guide-seen') || (navigator.webdriver && !localStorage.getItem('tarkzoid-intro-guide')); localStorage.setItem('tarkzoid-guide-seen', '1'); } catch {}
      if (!seen) { this.guide.open('how'); this.hud.message('The survival guide: F2 opens it any time.', 6); } else this.input.lock();
      return;
    }
    if (this.heliOut && !this.heliOut.depart(dt)) this.heliOut = null;
    if (this.dialogOpen) {
      // Talking: number keys pick an option; Esc, walking or distance ends it.
      const s = this.survivors.dialogFor;
      for (const c of this.input.pressed) if (c.startsWith('Digit') || c === 'Escape') this.survivors.dialogKey(c);
      // A plain menu (the elevator) has no one to walk away from
      const gone = s ? s.dead || s.pos.distanceTo(this.player.pos) > 4 : !this.survivors.menuOpen;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed) || gone) this.survivors.closeDialog();
      inp.interact = inp.inventory = inp.slot1 = inp.slot2 = inp.reload = inp.jump = false;
    } else if (this.vehicleOpen) {
      // Looking over a vehicle: Esc, Tab or walking off closes it
      if (pressed('Escape') || inp.inventory || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed)) this.vehicles.closePanel();
      inp.interact = inp.inventory = inp.slot1 = inp.slot2 = inp.reload = inp.jump = inp.fire = inp.firePressed = false;
    } else if (this.farmOpen) {
      // Tending a garden plot: Esc, Tab or walking off closes it
      if (pressed('Escape') || inp.inventory || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(pressed)) this.farming.closePanel();
      inp.interact = inp.inventory = inp.slot1 = inp.slot2 = inp.reload = inp.jump = inp.fire = inp.firePressed = false;
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
    const paused = this.guideOpen || !this.input.locked && !this.invOpen && !this.hud.mapOpen && !this.dev.open && !this.dialogOpen && !this.traderOpen && !this.vehicleOpen && !this.farmOpen && !this.awaitingRelock;
    if (paused || this.sleeping) return;
    if (this.dev.open && this.dev.pauseWhileOpen) {
      // Simulation paused, but keep the view in sync with console edits.
      this.updateLighting();
      this.hud.update(0, this);
      return;
    }

    if (this.invOpen) inp.reload = inp.slot1 = inp.slot2 = inp.flashlight = inp.interact = inp.check = inp.fireMode = inp.jump = inp.crouchToggle = inp.prone = false;
    this.tickLoader(dt);
    // Goals panel: J toggles it, K (while it's open) skips the tutorial
    if (pressed('KeyJ') && !this.invOpen) this.progress.togglePanel();
    if (this.progress.panelOpen && (pressed('Escape') || this.invOpen)) this.progress.togglePanel(false);
    if (this.progress.panelOpen && pressed('KeyK') && this.progress.tutorialActive) { this.progress.skipTutorial(); this.progress.drawPanel(); }
    const driving = !!this.player.vehicle;
    if (pressed('KeyB') && !this.invOpen && !driving && this.player.floorY > 0.1 && !this.builder.active) this.hud.message('You can only build on the ground floor.', 2);
    else if (pressed('KeyB') && !this.invOpen && !driving) {
      this.builder.toggle();
      this.hud.message(this.builder.active ? 'Build mode: 1–8 select, R rotate, LMB build, X dismantle, B exit' : 'Build mode off');
    }
    if (pressed('KeyV') && !this.invOpen && !driving) this.claimSafehouse();
    // With more than one thing in reach the wheel picks between them (not
    // your walking pace)
    if (inp.wheel && !this.invOpen && !this.builder.active && !this.player.vehicle && this.lookChoices && this.scrollLook(Math.sign(inp.wheel))) inp.wheel = 0;
    if (inp.interact && !this.invOpen && this.lookTarget) this.interact(this.lookTarget);
    if (pressed('KeyK') && !this.invOpen && !driving && !this.progress.panelOpen && !this.builder.active) this.kick();
    if (inp.heal && !driving) this.quickHeal(); // (H is the horn in a car)

    if (this.builder.active && !this.invOpen) {
      this.builder.update(inp);
      inp.fire = inp.firePressed = inp.reload = inp.slot1 = inp.slot2 = inp.aim = inp.prone = false;
    }

    // Flying a drone: it has the controls
    if (this.drone.flying || this.drone.after) this.drone.input(inp);
    // The laser designator: N raises and lowers it; while it's up it has the mouse
    if (inp.designate && !this.invOpen && !this.dialogOpen) this.air.toggle();
    if (this.air.active) this.air.input(inp);
    // The hotbar (3-6): use what's there, or bring up a grenade
    if (!this.invOpen && !this.dialogOpen && !this.builder.active) inp.hot.forEach((on, i) => { if (on) this.thr.press(i); });

    this.time += dt * this.dev.timeScale; // one in-game minute per real second at 1x
    this.updateLighting();
    this.weather.update(dt);
    this.player.update(dt, inp);
    this.air.update(dt);
    this.thr.update(dt);
    this.drone.update(dt);
    this.shake = Math.max(0, (this.shake || 0) - dt * 2.2);
    setAudioEnv(this.world.buildingAt(this.player.pos.x, this.player.pos.z) ? 'in' : 'out');
    if (this.state !== 'play') return;
    if (!this.dev.god) this.weather.updatePlayer(dt);
    if (this.state !== 'play') return;
    this.dev.applyCheats();
    if (!this.dev.freeze) this.zombies.update(dt, this.player, this);
    this.progress.update(dt);
    if (this.state !== 'play') return;
    if (!this.dev.freeze) this.survivors.update(dt);
    if (this.state !== 'play') return;
    this.ragdolls.update(dt);
    this.traders.update(dt);
    this.vehicles.update(dt);
    this.world.levels.update(dt, this); // elevators
    this.farming.update(dt);
    this.mission?.update(dt);
    if (this.state !== 'play') return;
    this.updateDoors(dt);
    for (const d of this.shaking) {
      d.shake -= dt;
      const base = d.baseRot + (d.ang ?? (d.open ? 1 : 0)) * (Math.PI / 2) * (d.swing || 1);
      d.mesh.rotation.y = base + (d.shake > 0 ? Math.sin(d.shake * 70) * 0.025 * (d.shake / 0.3) : 0);
      d.sync?.();
      if (d.shake <= 0) this.shaking.delete(d);
    }
    this.fx.update(dt);
    this.builder.flicker(now);
    this.lights.update(dt, this.player.pos, this.builder.fires());

    const pp = this.player.pos;
    this.sun.position.set(pp.x + 30, 60, pp.z + 20);
    this.sun.target.position.set(pp.x, 0, pp.z);
    // The sun's shadow map: redrawn every frame or every other (settings)
    this.sun.shadow.autoUpdate = false;
    this.sunTick = (this.sunTick || 0) + 1;
    if (this.sunTick % (this.gfx?.shadowEvery || 1) === 0) this.sun.shadow.needsUpdate = true;
    this.lookTarget = this.invOpen || this.builder.active || this.player.vehicle ? null : this.findLookTarget();

    this.beat = (this.beat || 0) - dt;
    if (this.beat <= 0 && (this.player.hp.thorax < 30 || this.player.hp.head < 12)) { this.beat = 1; sfx.heartbeat(); }

    this.autosave -= dt;
    if (this.autosave <= 0) { this.autosave = AUTOSAVE; this.saveGame(); }

    this.hud.update(dt, this);
  }
}

// Exposed for debugging from the browser console.
window.game = new Game();
