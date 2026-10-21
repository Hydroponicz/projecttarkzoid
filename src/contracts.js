// Contracts: the work you're flown into the zone for. Four handlers at the
// base (the hub) each offer a few contracts; you take one in on a
// deployment. A contract says what to do (bring a scientist out alive, find
// a sample case, put down a turned commander and bring back his tag, scout,
// cull, bring back supplies) and when the helicopter comes back for you:
// "Heli back at the LZ on day 14, 06:00". Whatever you've done by then,
// that's your ride. The last two hours before it the dead come for you in
// waves; the helicopter waits on the ground for a minute and a half, and
// anyone not aboard when it lifts is left behind (missing in action).
//
// Here: the handlers and their contracts (generated), the base's state
// (stash, reputation, the contracts on offer) and the Mission, which runs
// a contract in the zone: places its targets, tracks objectives, and flies
// the extraction.
import * as THREE from 'three';
import { ITEMS, makeItem } from './items.js';
import { makeGrid, addItem, countItem, takeItem } from './inventory.js';
import { ARCH, LL_REP } from './traders.js';
import { buildMi8, findLZ } from './intro.js';
import { HALF } from './world.js';
import { NAV_CELL, NAV_N } from './zombies.js';
import { sfx, heliSound } from './audio.js';

const $ = (id) => document.getElementById(id);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const DAY = 1440;
// Extraction timeline, in game minutes from the moment the helicopter is due
export const HORDE_AT = -120;   // the dead start coming
const WARN_AT = -360;           // the radio call
const HELI_IN = -25;            // the helicopter appears on its approach
export const WAIT = 90;         // on the ground this long, then it's gone

// ---------------------------------------------------------------------------
// The handlers at the base. Each barters like one of the zone's trader
// archetypes (their offers), and has their own kind of contract.
// ---------------------------------------------------------------------------
export const HANDLERS = {
  command: {
    name: 'Colonel Belov', title: 'Command', color: '#8a9a5a', offers: 'gunsmith',
    bio: 'Runs the base and what is left of the regiment. Wants the town held, the turned officers put down, and every street on his map.',
    greet: ['Report.', "You're still alive. Good. I have work."],
  },
  institute: {
    name: 'Dr. Irina Sokolova', title: 'Institute', color: '#5a9ac0', offers: 'medic',
    bio: 'Leads what is left of the research institute. Her people were in the town when it fell. She wants them back, and their work.',
    greet: ['Any word from the field team?', 'Sit down. You look like you need it.'],
  },
  logistics: {
    name: 'Quartermaster Hale', title: 'Logistics', color: '#c0a05a', offers: 'quartermaster',
    bio: 'Keeps the base fed, fuelled and armed. Everything that comes out of the zone goes through his ledger.',
    greet: ["Sign here. And here. What've you got?", 'Supplies are short. Always are.'],
  },
  broker: {
    name: 'The Broker', title: 'Broker', color: '#a07ac0', offers: 'fixer',
    bio: 'Nobody knows who the Broker works for. The pay is good and the questions are few.',
    greet: ['Close the flap behind you.', 'Ah. A professional.'],
  },
};
export const HANDLER_KEYS = Object.keys(HANDLERS);

// Building kinds contracts send you to
const LAB = ['hospital', 'clinic', 'office', 'skyscraper', 'pharmacy'];
const MIL = ['military', 'police', 'compound'];
const TALL = ['panel16', 'skyscraper', 'hotel', 'panel9', 'tvtower'];
const IND = ['factory', 'boiler', 'warehouse', 'tvtower', 'hardware'];
const PLACE = { hospital: 'the hospital', clinic: 'the clinic', office: 'an office block', skyscraper: 'the tower downtown', pharmacy: 'a pharmacy', military: 'the army post', police: 'the police station', compound: 'the military compound', panel16: 'a sixteen-storey tower', hotel: 'the Hotel Vostok', panel9: 'a nine-storey block', tvtower: 'the TV tower', factory: 'the factory', boiler: 'the boiler house', warehouse: 'a warehouse', hardware: 'the hardware store' };
const FIRST = ['Anton', 'Vera', 'Mikhail', 'Lena', 'Oleg', 'Sasha', 'Yuri', 'Katya', 'Pavel', 'Nina', 'Emil', 'Daria'];
const LAST = ['Petrov', 'Orlova', 'Zhukov', 'Kravets', 'Lebedev', 'Morozova', 'Sorokin', 'Belova', 'Gusev', 'Volkova', 'Kuznetsov', 'Fedorova'];
const RANKS = ['Major', 'Colonel', 'Captain', 'Lt. Colonel'];

// Contract templates, by handler: each makes one contract (type, objectives,
// how many days you'll be in, the base reward)
const TEMPLATES = {
  institute: [
    () => {
      const name = `Dr. ${pick(FIRST)} ${pick(LAST)}`, kinds = [pick(LAB), ...LAB];
      return { kind: 'escort', title: `Evacuate ${name}`, days: pick([3, 5, 7, 10, 14]), rep: 12,
        brief: `${name} was running the field lab in ${PLACE[kinds[0]]} when the evacuation failed. They're alive: we had a radio check two days ago. Find them, keep them alive, and get them on the helicopter.`,
        obj: [{ type: 'escort', name, kinds }] };
    },
    () => ({ kind: 'retrieve', title: 'Patient Zero Samples', days: pick([2, 3, 5]), rep: 7,
      brief: 'The first cases were treated at the hospital. Their samples were sealed in a transport case that never left the building. I need that case.',
      obj: [{ type: 'retrieve', item: 'q_samples', kinds: ['hospital', 'clinic', 'pharmacy'] }] }),
    () => ({ kind: 'retrieve', title: "The Professor's Notebook", days: pick([3, 5, 7]), rep: 8,
      brief: 'Professor Lebedev kept his notes by hand. He was last seen in an office block downtown. The notebook is worth more than the professor, frankly.',
      obj: [{ type: 'retrieve', item: 'q_notes', kinds: ['office', 'skyscraper', 'hotel'] }] }),
  ],
  command: [
    () => {
      const name = `${pick(RANKS)} ${pick(LAST)}`, kinds = [pick(MIL), ...MIL];
      return { kind: 'hvt', title: `Eliminate ${name}`, days: pick([3, 5, 7, 10]), rep: 12,
        brief: `${name} turned with the rest of his unit at ${PLACE[kinds[0]]}. He's bigger than the others and his men still follow him. Put him down and bring me his tag.`,
        obj: [{ type: 'hvt', name, kinds }] };
    },
    () => {
      const days = pick([2, 3, 5, 7]);
      return { kind: 'cull', title: 'Thin the Herd', days, rep: 6 + days,
        brief: 'The dead are massing faster than we can count them. Go in, and come back with fewer of them walking.',
        obj: [{ type: 'cull', n: 20 + days * 8 }] };
    },
    () => ({ kind: 'survey', title: 'Eyes on the High Ground', days: pick([1, 2, 3]), rep: 6,
      brief: 'I want to know what is in the tall buildings before I send a platoon in. Get inside three of them and look around.',
      obj: [{ type: 'survey', n: 3, kinds: TALL }] }),
  ],
  logistics: [
    () => {
      const [key, n] = pick([['water', 6], ['beans', 5], ['mre', 3], ['planks', 12], ['bandage', 6]]);
      return { kind: 'supply', title: `Resupply: ${ITEMS[key].name}`, days: pick([2, 3, 5]), rep: 6,
        brief: `Stores are running dry. Bring back ${n} × ${ITEMS[key].name}. Whatever else you find is yours.`,
        obj: [{ type: 'supply', key, n }] };
    },
    () => ({ kind: 'retrieve', title: 'The Flight Recorder', days: pick([3, 5, 7]), rep: 9,
      brief: 'A supply flight went down over the town in the first week. The recorder was carried off by the crew: last seen around the industrial district.',
      obj: [{ type: 'retrieve', item: 'q_blackbox', kinds: IND }] }),
    () => ({ kind: 'survey', title: 'Industrial Survey', days: pick([1, 2, 3]), rep: 6,
      brief: "Fuel, tools, generators. Before I can plan a salvage run I need someone to walk through the industrial buildings. Three of them.",
      obj: [{ type: 'survey', n: 3, kinds: IND }] }),
  ],
  broker: [
    () => ({ kind: 'retrieve', title: 'The Encrypted Drive', days: pick([2, 3, 5]), rep: 8,
      brief: "A client of mine left a drive in a hotel room safe, or an office, he wasn't sure. You'll know it when you see it. Don't plug it in.",
      obj: [{ type: 'retrieve', item: 'q_drive', kinds: ['hotel', 'office', 'skyscraper'] }] }),
    () => {
      const [key, n] = pick([['gpu', 2], ['folder', 1], ['flashdrive', 2], ['ledx', 1], ['laptop', 1]]);
      return { kind: 'supply', title: `Acquisition: ${ITEMS[key].name}`, days: pick([3, 5, 7]), rep: 9,
        brief: `I have a buyer for ${n} × ${ITEMS[key].name}. Where you find it is your business.`,
        obj: [{ type: 'supply', key, n }] };
    },
    () => {
      const name = `Dr. ${pick(FIRST)} ${pick(LAST)}`, kinds = [pick(['hotel', 'office', 'skyscraper']), ...LAB];
      return { kind: 'escort', title: `Exfiltrate ${name}`, days: pick([5, 7, 10, 14]), rep: 12,
        brief: `${name} knows things certain people want to know. Last heard from at ${PLACE[kinds[0]]}. Alive, please. Dead, they're no use to anyone.`,
        obj: [{ type: 'escort', name, kinds }] };
    },
  ],
};

// A new contract from a handler
export function makeContract(hub, hk) {
  const c = pick(TEMPLATES[hk])();
  c.id = Math.random().toString(36).slice(2, 9);
  c.handler = hk;
  c.hour = pick([6, 12, 18]);
  // Pay: reputation, and some of what the handler barters (better at higher
  // loyalty), more for longer contracts
  const ll = loyalty(hub, hk), long = 1 + c.days / 10;
  const pool = ARCH[HANDLERS[hk].offers].offers.filter((o) => o.ll <= Math.min(3, ll + 1)).map((o) => o.get);
  const items = [];
  for (let i = 0; i < 2 + (c.days >= 7 ? 1 : 0); i++) {
    const [key, n] = pick(pool);
    if (!items.some(([k]) => k === key)) items.push([key, ITEMS[key].stack ? Math.round(n * long) : n]);
  }
  c.reward = { rep: Math.round(c.rep * long), items };
  return c;
}

export const loyalty = (hub, hk) => LL_REP.filter((r) => (hub.rep[hk] || 0) >= r).length;

// The base: your stash, your standing with each handler, the contracts on
// offer and the ones you've taken, and what the handlers have left to trade
export function newHub() {
  const stash = makeGrid(10, 30);
  // something to start with
  for (const [k, o] of [['bandage', {}], ['bandage', {}], ['ai2', {}], ['water', {}], ['mre', {}], ['ammo_545', { count: 60 }], ['ammo_9x18', { count: 32 }], ['mag_ak30', { rounds: 0 }], ['grenade_rgd5', {}]]) addItem(stash, makeItem(k, o));
  const hub = { stash, rep: {}, contracts: [], stock: {}, history: [], raids: 0 };
  for (const k of HANDLER_KEYS) hub.rep[k] = 0;
  refillContracts(hub);
  return hub;
}

// Each handler keeps three contracts on the board (taken ones count)
export function refillContracts(hub) {
  for (const hk of HANDLER_KEYS) {
    let n = hub.contracts.filter((c) => c.handler === hk).length;
    for (let tries = 0; n < 3 && tries < 40; tries++) {
      // (no two alike on the board: the same title, or the same scientist)
      const c = makeContract(hub, hk), who = (x) => x.obj[0].name || x.title;
      if (hub.contracts.some((o) => o.title === c.title || who(o) === who(c))) continue;
      hub.contracts.push(c); n++;
    }
  }
}

// Into the stash, growing it if it's full
export function stashItem(hub, it) {
  if (addItem(hub.stash, it)) return;
  hub.stash.h += 6;
  addItem(hub.stash, it);
}
export function giveStash(hub, key, n) {
  const def = ITEMS[key];
  const items = def.stack ? [makeItem(key, { count: n })] : Array.from({ length: n }, () => makeItem(key, def.type === 'weapon' ? { loaded: 0 } : {}));
  for (const it of items) stashItem(hub, it);
}

// When a contract's helicopter comes back: day (1 + days) at its hour
export const extractTime = (days, hour) => days * DAY + hour * 60;
export const dayClock = (t) => `Day ${Math.floor(t / DAY) + 1}, ${String(Math.floor((t % DAY) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function objLabel(o) {
  return {
    escort: () => `Find ${o.name} and bring them out alive`,
    retrieve: () => `Find the ${ITEMS[o.item].name} and extract with it`,
    hvt: () => `Kill ${o.name} and extract with his tag`,
    cull: () => `Kill ${o.n} of the dead`,
    survey: () => `Get inside ${o.n} of the marked buildings`,
    supply: () => `Extract with ${o.n} × ${ITEMS[o.key].name}`,
  }[o.type]();
}

// ---------------------------------------------------------------------------
// A deployment in progress: the contract's targets, its objectives, and the
// helicopter at the end. raid: { contract | null, extractAt, lz, state }
// (all saved with the game)
// ---------------------------------------------------------------------------
export class Mission {
  constructor(game, raid) {
    this.game = game;
    this.raid = raid;
    this.c = raid.contract;
    this.st = raid.state ||= {};
    raid.lz ||= findLZ(game.world);
    const lz = raid.lz, out = new THREE.Vector3(lz.x, 0, lz.z);
    if (out.lengthSq() < 1) out.set(1, 0, 0.3);
    this.out = out.normalize();
    this.side = new THREE.Vector3(-this.out.z, 0, this.out.x);
    if (!this.st.setup) this.setup();
    this.checkT = 0; this.waveT = 0; this.callT = 0; this.retargetT = 0;
    this.el = $('mission'); this.banner = $('mission-banner');
    this.heli = null; this.sound = null;
    this.boarded = false;
  }

  get t() { return this.game.time - this.raid.extractAt; }

  // ---------- setting up the targets (once, on the first landing) ----------
  setup() {
    const st = this.st, g = this.game;
    st.setup = true;
    st.targets = [];
    st.kills0 = g.player.kills;
    for (const [i, o] of (this.c?.obj || []).entries()) {
      if (o.type === 'escort') {
        const b = this.pickBuildings(o.kinds, 1)[0], at = this.openSpotIn(b);
        const s = this.spawnScientist(o.name, at);
        st.targets[i] = { x: at.x, z: at.z, b: b.index, sid: s.id };
      } else if (o.type === 'retrieve') {
        st.targets[i] = this.placeItem(o.item, o.kinds);
      } else if (o.type === 'hvt') {
        const b = this.pickBuildings(o.kinds, 1)[0], at = this.openSpotIn(b);
        const zb = g.zombies.spawn(at.x, at.z, 'soldier');
        zb.hp = zb.maxHp = 900; zb.hvt = o.name;
        zb.mesh.scale.setScalar(1.18);
        // his unit, still around him
        for (let k = 0; k < 6; k++) { const p = this.openSpotIn(b); g.zombies.spawn(p.x, p.z, 'soldier'); }
        st.targets[i] = { x: at.x, z: at.z, b: b.index };
      } else if (o.type === 'survey') {
        st.targets[i] = { list: this.pickBuildings(o.kinds, o.n).map((b) => ({ b: b.index, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, seen: false })) };
      }
    }
  }

  // n different buildings of these kinds (the earlier kinds preferred), away from the LZ
  pickBuildings(kinds, n) {
    const W = this.game.world, lz = this.raid.lz, out = [];
    const far = (b) => Math.hypot((b.x0 + b.x1) / 2 - lz.x, (b.z0 + b.z1) / 2 - lz.z) > 50;
    for (const k of kinds) {
      const bs = W.buildings.filter((b) => b.kind === k && !b.area && !out.includes(b));
      const pool = bs.filter(far).length ? bs.filter(far) : bs;
      while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      if (out.length >= n) return out;
    }
    const rest = W.buildings.filter((b) => b.kind !== 'house' && !b.area && !out.includes(b));
    while (out.length < n && rest.length) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return out;
  }

  // An open spot on a building's ground floor (by the zombies' walking grid)
  openSpotIn(b) {
    const Z = this.game.zombies;
    const free = (x, z) => { const i = Math.floor((x + HALF) / NAV_CELL), j = Math.floor((z + HALF) / NAV_CELL); return i > 0 && j > 0 && i < NAV_N - 1 && j < NAV_N - 1 && !Z.blocked[i * NAV_N + j] && !Z.blocked[(i + 1) * NAV_N + j] && !Z.blocked[i * NAV_N + j + 1]; };
    for (let k = 0; k < 200; k++) {
      const x = b.x0 + 1.2 + Math.random() * Math.max(0.1, b.x1 - b.x0 - 2.4), z = b.z0 + 1.2 + Math.random() * Math.max(0.1, b.z1 - b.z0 - 2.4);
      if (free(x, z)) return { x, z };
    }
    return { x: (b.x0 + b.x1) / 2, z: b.z1 + 1.5 }; // (outside the front, then)
  }

  // The item in a cupboard of a target building (any floor), or on the floor
  placeItem(key, kinds) {
    const W = this.game.world;
    for (const b of this.pickBuildings(kinds, 4)) {
      const inside = (c) => c.x > b.x0 - 0.5 && c.x < b.x1 + 0.5 && c.z > b.z0 - 0.5 && c.z < b.z1 + 0.5;
      const cts = W.containers.slice(0, W.generatedContainers).filter((c) => c.mesh && !c.owner && inside(c));
      if (!cts.length) continue;
      const c = pick(cts), it = makeItem(key);
      if (!addItem(c.grid, it)) { c.grid.h += 2; addItem(c.grid, it); }
      return { x: c.x, z: c.z, b: b.index, base: c.base || 0 };
    }
    const b = this.pickBuildings(kinds, 1)[0], at = this.openSpotIn(b), grid = makeGrid(3, 3);
    addItem(grid, makeItem(key));
    this.game.addExtraContainer({ type: 'drop', name: ITEMS[key].name, x: at.x, z: at.z, grid });
    return { x: at.x, z: at.z, b: b.index };
  }

  spawnScientist(name, at) {
    const S = this.game.survivors, d = S.makeData({ x: at.x, z: at.z, disp: 'friendly' });
    Object.assign(d, { name, vip: true, persona: 'nervous', trust: 60, order: 'wait', melee: 'knife', reserve: 16, weapon: makeItem('pm', { loaded: 8 }) });
    d.look.shirt = 0xe4e4dc; d.look.pants = 0x3a3e48; d.look.hat = null; // a lab coat
    return S.addNPC(d);
  }

  scientist() { return this.game.survivors?.list.find((s) => s.vip && !s.dead) || null; }

  // ---------- objectives ----------
  // [have, need, failed] for each objective
  progress() {
    const g = this.game, st = this.st, grids = g.player.ammoGrids();
    return (this.c?.obj || []).map((o, i) => {
      const tg = st.targets?.[i];
      if (o.type === 'escort') { const s = this.scientist(); return s ? [s.order === 'follow' ? 1 : 0, 1, false, s] : [0, 1, true]; }
      if (o.type === 'retrieve') return [countItem(grids, o.item) > 0 ? 1 : 0, 1, false];
      if (o.type === 'hvt') return [countItem(grids, 'q_hvt') > 0 ? 1 : 0, 1, false];
      if (o.type === 'cull') return [Math.min(o.n, g.player.kills - (st.kills0 || 0)), o.n, false];
      if (o.type === 'survey') return [tg.list.filter((x) => x.seen).length, o.n, false];
      if (o.type === 'supply') return [Math.min(o.n, countItem(grids, o.key)), o.n, false];
      return [0, 1, false];
    });
  }

  onZombieKilled(zb) {
    if (!zb.hvt) return;
    this.st.hvtDown = true;
    this.game.hud.message(`${zb.hvt} is down. Take his tag off the body.`, 6);
    sfx.radio?.(3);
  }

  onSurvivorDied(s) {
    if (!s.vip) return;
    this.st.vipDead = true;
    this.game.hud.message(`${s.name} is dead. The contract can't be completed now.`, 7);
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game, t = this.t, p = g.player.pos;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      // scouting: being inside a marked building (any floor) counts
      for (const [i, o] of (this.c?.obj || []).entries()) {
        if (o.type !== 'survey') continue;
        for (const x of this.st.targets[i].list) {
          const b = g.world.buildings[x.b];
          if (!x.seen && p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) { x.seen = true; g.hud.message(`${this.c.title}: building surveyed.`, 4); sfx.extract(); }
        }
      }
      this.drawTracker();
    }
    // The radio
    const say = (k, text, words = 6) => { if (this.st[k]) return; this.st[k] = true; g.hud.message(`[Radio] ${text}`, 9); sfx.radio?.(words); };
    if (t >= -DAY && t < WARN_AT) say('r24', `Extraction tomorrow: ${dayClock(this.raid.extractAt).replace(/^Day \d+, /, '')} at the LZ. Don't be late.`);
    if (t >= WARN_AT && t < HORDE_AT) say('r6', 'Six hours to extraction. Start making your way to the LZ.');
    if (t >= HORDE_AT && t < 0) say('r2', 'Two hours out. Every dead thing in town heard that rotor test. They\'re coming for you. Hold the LZ.', 9);
    if (t >= 0 && t < WAIT) say('r0', 'Wheels down! Get aboard, we are not staying long!', 7);
    if (t >= WAIT - 30 && t < WAIT) say('r30', 'Thirty seconds! Move it!', 3);
    // The horde: waves out of the dark toward wherever you are
    if (t >= HORDE_AT && t < WAIT && !this.boarded) this.horde(dt, t);
    this.flyHeli(dt, t);
    if (t >= WAIT && !this.boarded && !this.gone) { this.gone = true; g.endRaid('mia'); }
    this.drawBanner(t);
  }

  horde(dt, t) {
    const g = this.game, Z = g.zombies, p = g.player.pos;
    this.waveT -= dt;
    if (this.waveT <= 0) {
      this.waveT = 9;
      const k = Math.min(1, (t - HORDE_AT) / (-HORDE_AT)); // 0 → 1 as the heli gets close
      const alive = Z.list.filter((z) => z.horde).length;
      const n = Math.min(160 - alive, Math.round(10 + k * 18));
      // from one or two directions at a time, so it reads as a wave
      const dirs = [Math.random() * Math.PI * 2, Math.random() * Math.PI * 2];
      for (let i = 0, made = 0; made < n && i < n * 5; i++) {
        const a = dirs[i % 2] + (Math.random() - 0.5) * 0.9, r = 45 + Math.random() * 30;
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const gi = Math.floor((x + HALF) / NAV_CELL), gj = Math.floor((z + HALF) / NAV_CELL);
        if (gi < 1 || gj < 1 || gi >= NAV_N - 1 || gj >= NAV_N - 1 || Z.blocked[gi * NAV_N + gj] || g.world.buildingAt(x, z)) continue;
        const type = Math.random() < 0.18 + k * 0.25 ? 'runner' : Math.random() < 0.06 ? 'brute' : 'walker';
        const zb = Z.spawn(x, z, type);
        zb.horde = true; zb.state = 'investigate'; zb.target = { x: p.x, z: p.z };
        made++;
      }
    }
    // they keep coming to where you are now
    this.retargetT -= dt;
    if (this.retargetT <= 0) {
      this.retargetT = 2.5;
      for (const zb of Z.list) if (zb.horde && zb.state !== 'chase' && zb.state !== 'attack') { zb.state = 'investigate'; zb.target = { x: p.x, z: p.z }; }
    }
    this.callT -= dt;
    if (this.callT <= 0) { this.callT = 25; Z.noise(p.x, p.z, 80, true, g.player.floorY); }
  }

  // ---------- the helicopter ----------
  // Its place at time t (minutes from when it's due): in from the far side,
  // flaring over the LZ, on the ground, and away
  heliPose(t) {
    const lz = this.raid.lz, g = this.game, out = this.out;
    const ground = g.world.groundAt?.(lz.x, lz.z) || 0;
    let pos, flare = 0;
    if (t < 0) {
      const s = 1 - Math.pow(Math.max(0, -t) / -HELI_IN, 1.4); // 0 → 1
      pos = new THREE.Vector3(lz.x, 0, lz.z).addScaledVector(out, 700 * (1 - s)).setY(ground + 1.4 + 55 * Math.pow(1 - s, 1.5));
      flare = s > 0.8 ? (s - 0.8) * 4 * (1 - s) * 5 : 0;
    } else if (t < WAIT) pos = new THREE.Vector3(lz.x, ground + 1.4, lz.z);
    else {
      const u = t - WAIT;
      pos = new THREE.Vector3(lz.x, ground + 1.4 + u * u * 1.6 + u * 2, lz.z).addScaledVector(out, -u * u * 3);
      flare = -0.15;
    }
    const h = this.heli;
    h.position.copy(pos);
    h.rotation.set(0, 0, 0);
    h.rotateY(Math.atan2(-out.x, -out.z));
    h.rotateX(-flare * 0.3);
    return pos;
  }

  flyHeli(dt, t) {
    const g = this.game;
    const show = t >= HELI_IN && (t < WAIT + 20) && !this.boarded;
    if (show && !this.heli) {
      this.heli = buildMi8();
      g.scene.add(this.heli);
      this.sound = heliSound();
    } else if (!show && this.heli && !this.boarded) { this.removeHeli(); return; }
    if (!this.heli) return;
    const pos = this.heliPose(t);
    this.heli.userData.main.rotation.y += dt * 22;
    this.heli.userData.tail.rotation.x += dt * 70;
    const cam = g.camera.position, d = cam.distanceTo(pos);
    const right = new THREE.Vector3(Math.cos(g.player.yaw), 0, -Math.sin(g.player.yaw));
    this.sound?.set(Math.min(0.9, 70 / (d + 20)), false, pos.clone().sub(cam).setY(0).normalize().dot(right));
    // green smoke on the LZ, and rotor wash while it's low
    const lz = this.raid.lz, ground = g.world.groundAt?.(lz.x, lz.z) || 0;
    if (t > -40 && Math.random() < 0.6) {
      const at = this.door().addScaledVector(this.side, 3);
      g.fx.particle(new THREE.Vector3(at.x, ground + 0.2, at.z), new THREE.Vector3((Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6), new THREE.Color(0x5ac05a).multiplyScalar(0.7 + Math.random() * 0.3), 0.18, 2.6, { drag: 0.6, grow: 0.5, grav: -0.2 });
    }
    if (pos.y - ground < 14 && Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9;
      g.fx.particle(new THREE.Vector3(pos.x + Math.cos(a) * r, ground + 0.1, pos.z + Math.sin(a) * r), new THREE.Vector3(Math.cos(a) * 7, 0.8 + Math.random() * 1.5, Math.sin(a) * 7), new THREE.Color(0x8a7c60), 0.06, 0.7, { drag: 1.8, grow: 0.12, grav: 1.5 });
    }
  }

  // Where you climb in: its open side door
  door() { const lz = this.raid.lz; return new THREE.Vector3(lz.x, 0, lz.z).addScaledVector(this.side, 3.2); }

  removeHeli() {
    if (this.heli) this.game.scene.remove(this.heli);
    this.heli = null;
    this.sound?.stop(); this.sound = null;
  }

  // The helicopter as something to use (while it's on the ground)
  interactables() {
    const t = this.t;
    if (t < 0 || t >= WAIT || this.boarded) return [];
    const d = this.door(), ground = this.game.world.groundAt?.(d.x, d.z) || 0;
    const s = this.c?.obj.some((o) => o.type === 'escort') ? this.scientist() : null;
    const missing = s && s.pos.distanceTo(this.game.player.pos) > 20 ? ` (${s.name} isn't with you!)` : '';
    return [{ kind: 'heli', name: 'Helicopter', x: d.x, z: d.z, reach: 1.2, base: ground > 0.3 ? ground : 0, prompt: () => `[F] Board the helicopter: extract${missing}` }];
  }

  // Aboard: the contract is settled on what you've got with you
  board() {
    if (this.boarded) return;
    this.boarded = true;
    const g = this.game, grids = g.player.ammoGrids();
    const pr = this.progress(), lines = [];
    let ok = !!this.c;
    (this.c?.obj || []).forEach((o, i) => {
      let done = pr[i][0] >= pr[i][1] && !pr[i][2];
      if (o.type === 'escort') {
        const s = pr[i][3];
        done = !!s && !s.dead && s.pos.distanceTo(g.player.pos) < 20;
        if (done) s.extracted = true;
      }
      if (done && o.type === 'retrieve') takeItem(grids, o.item, 1);
      if (done && o.type === 'hvt') takeItem(grids, 'q_hvt', 1);
      if (done && o.type === 'supply') takeItem(grids, o.key, o.n);
      if (!done) ok = false;
      lines.push([objLabel(o), done]);
    });
    sfx.extract();
    this.removeHeli();
    g.endRaid('extracted', { contract: this.c, ok, lines });
  }

  // ---------- HUD ----------
  drawTracker() {
    if (!this.el) return;
    const g = this.game, t = this.t, c = this.c;
    const rows = [];
    if (c) {
      rows.push(`<div class="ms-title">${c.title} <span class="dim">· ${HANDLERS[c.handler].title}</span></div>`);
      const pr = this.progress();
      c.obj.forEach((o, i) => {
        const [have, need, failed] = pr[i], done = have >= need && !failed;
        let extra = o.type === 'hvt' && this.st.hvtDown && !done ? ' <span class="dim">(down: take the tag)</span>' : '';
        if (o.type === 'escort' && !failed && !done) extra = ' <span class="dim">(talk to them)</span>';
        rows.push(`<div class="ms-obj ${done ? 'done' : failed ? 'failed' : ''}">${done ? '✓' : failed ? '✗' : '○'} ${objLabel(o)}${need > 1 ? ` <b>${have}/${need}</b>` : ''}${extra}</div>`);
      });
    } else rows.push('<div class="ms-title">Free run <span class="dim">· no contract</span></div>');
    const lz = this.raid.lz, p = g.player.pos;
    const dist = Math.round(Math.hypot(lz.x - p.x, lz.z - p.z) / 5) * 5;
    const bearing = ((Math.atan2(lz.x - p.x, -(lz.z - p.z)) * 180) / Math.PI + 360) % 360;
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8];
    const left = -t, d = Math.floor(left / DAY), h = Math.floor((left % DAY) / 60), m = Math.floor(left % 60);
    rows.push(`<div class="ms-ex">HELI · ${dayClock(this.raid.extractAt)} · ${left > 0 ? `in ${d ? `${d}d ` : ''}${h}h ${String(m).padStart(2, '0')}m` : 'ON THE GROUND'}<br><span class="dim">LZ ${dist} m ${dir}</span></div>`);
    const html = rows.join('');
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
  }

  drawBanner(t) {
    if (!this.banner) return;
    let text = '';
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    if (t >= HORDE_AT && t < 0) text = `HELI INBOUND · ${mmss(-t)} · HOLD THE LZ`;
    else if (t >= 0 && t < WAIT && !this.boarded) text = `HELI ON THE GROUND · LIFTING OFF IN ${mmss(WAIT - t)}`;
    this.banner.style.display = text ? 'block' : 'none';
    if (this.banner.textContent !== text) this.banner.textContent = text;
    this.banner.classList.toggle('urgent', t >= WAIT - 30 && t < WAIT);
  }

  // Map: the LZ, and where the objectives are
  mapMarkers() {
    const out = [{ kind: 'lz', x: this.raid.lz.x, z: this.raid.lz.z, name: 'LZ' }];
    const pr = this.progress(), st = this.st;
    (this.c?.obj || []).forEach((o, i) => {
      const tg = st.targets?.[i];
      if (!tg || pr[i][0] >= pr[i][1] || pr[i][2]) return;
      if (o.type === 'survey') { for (const x of tg.list) if (!x.seen) out.push({ kind: 'obj', x: x.x, z: x.z, name: 'Survey' }); return; }
      if (o.type === 'hvt' && st.hvtDown) return;
      const s = o.type === 'escort' ? this.scientist() : null;
      out.push({ kind: 'obj', x: s ? s.pos.x : tg.x, z: s ? s.pos.z : tg.z, name: o.type === 'escort' ? o.name : o.type === 'hvt' ? o.name : ITEMS[o.item].short });
    });
    return out;
  }

  // Sleeping can't take you past the two-hour warning
  sleepLimit() { return Math.floor((this.raid.extractAt + HORDE_AT - 10 - this.game.time) / 60); }

  dispose() {
    this.removeHeli();
    if (this.el) this.el.innerHTML = '';
    if (this.banner) this.banner.style.display = 'none';
  }
}
