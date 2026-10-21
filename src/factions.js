// Survivors with a purpose. Groups and what they do all day:
//  - Bandit gangs claim a hideout (a warehouse, a garage block, a shop) and
//    keep a stash there. They go out raiding the places guns are (police,
//    the army post, hardware stores, sometimes your safehouse), carry home
//    the guns, ammo, grenades and meds they find, re-arm from the stash, and
//    take in new members while there are spare guns to hand out. Out in the
//    town they move as a pack. One of them spotting you, or the sound of
//    gunfire, brings the rest, and they come at you from different sides.
//  - Friendly survivors scavenge food, water, meds and ammo, claim a house
//    for themselves and band together, three at most. A band can be
//    recruited as a whole.
//  - Neutral survivors just wander, as they always have.
// Lone hostiles and lone friendlies find each other and group up over time.
import { ITEMS, makeItem } from './items.js';
import { addItem, removeItem } from './inventory.js';
import { hasLOS } from './collision.js';
import { HALF } from './world.js';
import { NAV_CELL, NAV_N } from './zombies.js';

// How much a gun is worth to the AI (to swap up to a better one)
export const GUN_RANK = { pm: 1, glock17: 1.2, m1911: 1.3, mp133: 2, m870: 2.2, sks: 2.6, mp5: 2.5, ak74: 3.2, m4a1: 3.3, m14: 3.4, m249: 3.8 };
const GANG_HOME = ['warehouse', 'boiler', 'factory', 'gas', 'hardware', 'shop', 'grocery', 'police'];
const BAND_HOME = ['house', 'dacha', 'farmhouse', 'cabin'];
// Where they go looking (weights)
const GANG_RAID = { police: 5, military: 5, hardware: 2.5, warehouse: 2, gas: 1.2, pharmacy: 1.5, shop: 1, grocery: 1, clinic: 1, hospital: 1.2, office: 0.6, house: 0.4, panel5: 0.5 };
const BAND_LOOT = { grocery: 3, pharmacy: 2.5, house: 2, shop: 1.5, clinic: 1.5, gas: 1, dacha: 1.2, farmhouse: 1.2, hardware: 0.8, panel5: 0.8 };
const GANG_NAMES = ['the Black Dogs', 'the Rust Crew', 'the Tracksuits', 'the Wolves', 'the Kolkhoz Boys', 'the Butchers', 'the Ninth Block', 'the Red Hand'];
const MAX_GANG = 6, MAX_BAND = 3;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const wpick = (pairs) => { let s = 0; for (const [, w] of pairs) s += w; let r = Math.random() * s; for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[pairs.length - 1]?.[0]; };

export class Factions {
  constructor(mgr) {
    this.mgr = mgr;
    this.groups = [];
    this.tick = 0;
  }
  get game() { return this.mgr.game; }
  get world() { return this.mgr.world; }

  groupOf(s) { return s.gid ? this.groups.find((G) => G.id === s.gid) || null : null; }
  members(G) { return this.mgr.list.filter((s) => s.gid === G.id && !s.dead); }

  // ---------- setting up a new town ----------
  populate() {
    const M = this.mgr, g = this.game;
    // two gangs, three or four strong, in their hideouts
    for (let k = 0; k < 2; k++) {
      const G = this.newGroup('gang', 'hostile');
      if (!this.claimBase(G)) { this.groups.splice(this.groups.indexOf(G), 1); continue; }
      const n = 3 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) { const at = this.spotIn(G.b); const s = M.spawn({ x: at.x, z: at.z, disp: 'hostile' }); if (s) this.join(s, G); }
      // something in the stash already
      for (const [key, o] of [['ammo_545', { count: 60 }], ['bandage', {}], [pick(['pm', 'sks', 'mp133', 'ak74']), { loaded: 0 }]]) addItem(G.stash.grid, makeItem(key, o));
    }
    // two friendly bands in their houses
    for (let k = 0; k < 2; k++) {
      const G = this.newGroup('band', 'friendly');
      if (!this.claimBase(G)) { this.groups.splice(this.groups.indexOf(G), 1); continue; }
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) { const at = this.spotIn(G.b); const s = M.spawn({ x: at.x, z: at.z, disp: 'friendly' }); if (s) this.join(s, G); }
    }
    // and some on their own: wanderers, a lone bandit or two, a straggler
    for (const disp of ['neutral', 'neutral', 'neutral', 'hostile', 'friendly']) M.spawn({ disp });
    void g;
  }

  newGroup(kind, disp) {
    const G = { id: 'g' + Math.random().toString(36).slice(2, 8), kind, disp, name: kind === 'gang' ? pick(GANG_NAMES.filter((n) => !this.groups.some((o) => o.name === n))) || 'a gang' : null, b: null, base: null, known: false, recruitT: 0, alert: null, target: null, guard: null };
    this.groups.push(G);
    return G;
  }

  join(s, G) {
    s.gid = G.id; s.job = null;
    if (G.kind === 'gang') {
      // hardened: tougher, better shots, never unarmed for long
      s.skill = Math.max(s.skill, 0.85 + Math.random() * 0.35);
      s.maxHp = Math.max(s.maxHp, 180); s.hp = Math.max(s.hp, 180);
      if (!s.nades && Math.random() < 0.45) s.nades = 1;
      if (!s.weapon) { const key = pick(['pm', 'pm', 'mp133', 'sks', 'glock17']), def = ITEMS[key]; s.weapon = makeItem(key, { loaded: def.tube || ITEMS[def.magKey].cap }); s.reserve = (def.tube || ITEMS[def.magKey].cap) * 2; s.buildGun?.(); }
    }
  }

  // A hideout (gangs) or a house (bands): a ground-floor building nobody
  // else has, with a stash crate in it
  claimBase(G) {
    const W = this.world, g = this.game, kinds = G.kind === 'gang' ? GANG_HOME : BAND_HOME;
    const taken = new Set([...this.groups.map((o) => o.b), ...(g.traders?.list || []).map((t) => t.building?.index)]);
    const sh = g.safehouse, lz = g.save?.raid?.lz;
    const ok = (b) => kinds.includes(b.kind) && !b.area && !taken.has(b.index) && !W.levels.buildingAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)
      && !(sh && b.x0 < sh.x1 && b.x1 > sh.x0 && b.z0 < sh.z1 && b.z1 > sh.z0)
      && !(lz && Math.hypot((b.x0 + b.x1) / 2 - lz.x, (b.z0 + b.z1) / 2 - lz.z) < 45)
      && !this.groups.some((o) => o.base && Math.hypot((b.x0 + b.x1) / 2 - o.base.x, (b.z0 + b.z1) / 2 - o.base.z) < 50);
    const pool = W.buildings.filter(ok);
    if (!pool.length) return false;
    const b = pick(pool);
    G.b = b.index;
    this.noSpawnAt(b);
    // cleared out first: no dead left in the place
    const Z = g.zombies;
    for (let i = Z.list.length - 1; i >= 0; i--) {
      const zb = Z.list[i];
      if (zb.pos.x > b.x0 - 6 && zb.pos.x < b.x1 + 6 && zb.pos.z > b.z0 - 6 && zb.pos.z < b.z1 + 6 && Math.hypot(zb.pos.x - g.player.pos.x, zb.pos.z - g.player.pos.z) > 60) { g.scene.remove(zb.mesh); Z.list.splice(i, 1); }
    }
    G.base = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
    const at = this.spotIn(b.index);
    const c = g.addExtraContainer({ type: 'crate', name: G.kind === 'gang' ? `${cap(G.name)}' stash` : 'Survivors\' stash', x: at.x, z: at.z, grid: { w: 8, h: 6, items: [] }, gid: G.id });
    G.stash = c;
    return true;
  }

  // An open spot on a building's ground floor (the zombies' walking grid)
  spotIn(bi) {
    const b = this.world.buildings[bi], Z = this.game.zombies;
    for (let k = 0; k < 120; k++) {
      const x = b.x0 + 1 + Math.random() * Math.max(0.1, b.x1 - b.x0 - 2), z = b.z0 + 1 + Math.random() * Math.max(0.1, b.z1 - b.z0 - 2);
      const i = Math.floor((x + HALF) / NAV_CELL), j = Math.floor((z + HALF) / NAV_CELL);
      if (!Z.blocked[i * NAV_N + j] && !Z.blocked[(i + 1) * NAV_N + j] && !Z.blocked[i * NAV_N + j + 1]) return { x, z };
    }
    return { x: (b.x0 + b.x1) / 2, z: b.z1 + 1.5 };
  }

  inBase(G, x, z) { const b = G.b != null && this.world.buildings[G.b]; return !!b && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; }

  // ---------- every few seconds: grouping up, recruits, discovery ----------
  update(dt) {
    const g = this.game, p = g.player;
    if ((this.tick -= dt) > 0) return;
    this.tick = 2;
    const list = this.mgr.list;
    for (const G of [...this.groups]) {
      const mem = this.members(G);
      // the player finds the place
      if (G.base && !G.known && Math.hypot(p.pos.x - G.base.x, p.pos.z - G.base.z) < 28 && (this.inBase(G, p.pos.x, p.pos.z) || hasLOS(this.world.hash, p.pos.x, p.pos.z, G.base.x, G.base.z))) {
        G.known = true;
        g.hud.message(G.kind === 'gang' ? `A bandit hideout: ${G.name}. Marked on your map.` : 'A survivors\' safehouse. Marked on your map.', 5);
      }
      if (!mem.length) { if (!G.base) this.groups.splice(this.groups.indexOf(G), 1); continue; } // (an abandoned hideout keeps its stash)
      if (!G.base) this.claimBase(G);
      if (G.guard && !mem.some((s) => s.id === G.guard)) G.guard = null;
      // Gangs grow while they've guns to hand out
      G.recruitT += 2;
      if (G.kind === 'gang' && G.base && mem.length < MAX_GANG && G.recruitT > 600 && Math.hypot(p.pos.x - G.base.x, p.pos.z - G.base.z) > 40) {
        const gun = G.stash?.grid.items.find((it) => GUN_RANK[it.key]);
        if (gun) {
          G.recruitT = 0;
          const at = this.spotIn(G.b), s = this.mgr.spawn({ x: at.x, z: at.z, disp: 'hostile' });
          if (s) { this.join(s, G); this.arm(s, G); }
        }
      }
    }
    // Loners find each other
    for (const s of list) {
      if (s.dead || s.gid || s.trader || s.vip || s.order || s.disp === 'neutral') continue;
      const kind = s.disp === 'hostile' ? 'gang' : 'band', max = kind === 'gang' ? MAX_GANG : MAX_BAND;
      let best = null, bd = kind === 'gang' ? 40 : 25;
      for (const G of this.groups) {
        if (G.kind !== kind) continue;
        const mem = this.members(G);
        if (mem.length >= max || G.joined) continue;
        for (const o of mem) { const d = o.pos.distanceTo(s.pos); if (d < bd) { bd = d; best = G; } }
        if (G.base) { const d = Math.hypot(G.base.x - s.pos.x, G.base.z - s.pos.z); if (d < bd) { bd = d; best = G; } }
      }
      if (best) { this.join(s, best); continue; }
      const mate = list.find((o) => o !== s && !o.dead && !o.gid && !o.trader && !o.vip && !o.order && o.disp === s.disp && o.pos.distanceTo(s.pos) < 22);
      if (mate) { const G = this.newGroup(kind, s.disp); this.join(s, G); this.join(mate, G); if (s.disp === 'hostile' && this.mgr.distToPlayer(s) < 30) s.say('Stick with me. We take this town together.'); }
    }
  }

  // ---------- what a group member does when there's no fight ----------
  // Returns { moveTo, run, face }, or travels along s.path (moveTo null)
  drive(s, dt, game) {
    const G = this.groupOf(s), out = { moveTo: null, run: false, face: null };
    s.state = 'job';
    // The gang's alarm: everyone converges, each from their own side
    if (G?.alert && game.time - G.alert.t < 25 && s.disp === 'hostile' && (!G.guard || G.guard !== s.id || this.mgr.distToPlayer(s) < 40)) {
      const A = G.alert, mem = this.members(G), k = mem.indexOf(s);
      const a0 = Math.atan2(s.pos.z - A.z, s.pos.x - A.x) + (k - (mem.length - 1) / 2) * 0.9;
      const fx = A.x + Math.cos(a0) * 7, fz = A.z + Math.sin(a0) * 7;
      if (Math.hypot(fx - s.pos.x, fz - s.pos.z) > 2.5) { this.travel(s, fx, fz, out); out.run = true; }
      else out.face = { x: A.x, z: A.z };
      return out;
    }
    if (!s.job) s.job = this.nextJob(s, G, game);
    const J = s.job;
    if (!J) return out;
    const W = this.world;
    switch (J.kind) {
      case 'goto': {
        const b = W.buildings[J.b];
        const inside = b && s.pos.x > b.x0 && s.pos.x < b.x1 && s.pos.z > b.z0 && s.pos.z < b.z1;
        if (inside || Math.hypot(J.x - s.pos.x, J.z - s.pos.z) < 2.5) { s.job = { kind: 'loot', b: J.b, list: this.containersIn(J.b), t: 90 }; break; }
        if (!this.travel(s, J.x, J.z, out)) s.job = null;
        break;
      }
      case 'loot': {
        J.t -= dt;
        // the next cupboard nobody has been through lately
        if (!J.c) {
          J.c = J.list.find((c) => !(c.npcT > game.time - 1440) && c.grid?.items.length);
          if (!J.c || J.t <= 0 || s.inv.items.length > 18) { s.job = G?.base ? { kind: 'home' } : null; if (G && G.target?.b === J.b) G.target = null; break; }
          J.st = 0;
        }
        const c = J.c, d = Math.hypot(c.x - s.pos.x, c.z - s.pos.z);
        if (d > 1.3) { if (this.mgr.clearLine(s.pos.x, s.pos.z, c.x, c.z) || d < 3) out.moveTo = { x: c.x, z: c.z }; else if (!this.travel(s, c.x, c.z, out)) { c.npcT = game.time; J.c = null; } J.st += dt; if (J.st > 12) { c.npcT = game.time; J.c = null; } break; }
        out.face = { x: c.x, z: c.z };
        s.searchT = (s.searchT || 0) + dt;
        if (s.searchT > 2.5) { s.searchT = 0; this.take(s, c); c.npcT = game.time; J.c = null; }
        break;
      }
      case 'home': {
        if (!G?.base) { s.job = null; break; }
        // (at the stash, or inside and as near as they can get)
        if (this.inBase(G, s.pos.x, s.pos.z) && (Math.hypot(G.stash.x - s.pos.x, G.stash.z - s.pos.z) < 3 || (J.inT = (J.inT || 0) + dt) > 10)) {
          this.deposit(s, G);
          s.job = { kind: 'idle', t: game.isNight ? 600 : 40 + Math.random() * 80 };
          break;
        }
        if (!this.travel(s, G.stash.x, G.stash.z, out)) out.moveTo = { x: G.stash.x, z: G.stash.z };
        break;
      }
      case 'idle':
      case 'guard': {
        J.t -= dt;
        if (J.t <= 0 || (J.kind === 'idle' && !game.isNight && J.t > 200)) { s.job = null; if (J.kind === 'guard' && G) G.guard = null; break; }
        // pace about the place now and then
        J.w = (J.w ?? 0) - dt;
        if (J.w <= 0 && G?.b != null) { J.w = 6 + Math.random() * 10; J.at = this.spotIn(G.b); }
        if (J.at && Math.hypot(J.at.x - s.pos.x, J.at.z - s.pos.z) > 0.8) { if (this.mgr.clearLine(s.pos.x, s.pos.z, J.at.x, J.at.z)) out.moveTo = J.at; else J.at = null; }
        else if (game.player && this.mgr.distToPlayer(s) < 12) out.face = game.player.pos;
        break;
      }
    }
    return out;
  }

  // Along a path to (x, z), worked out once (and not again for a moment
  // when the goal moves); false if there's no way there
  travel(s, x, z, out) {
    const now = this.game.time, far = Math.hypot(x - s.pos.x, z - s.pos.z);
    const moved = !s.goal || Math.hypot(s.goal.x - x, s.goal.z - z) > 3;
    if ((moved || (!s.path.length && far > 3)) && now - (s.pathAt ?? -1e9) > 1.5) {
      let P = this.mgr.findPath(s.pos.x, s.pos.z, x, z);
      // too far to plan in one go: a stretch of the way at a time
      for (const h of [40, 22]) {
        if (P === undefined || P?.length || far <= h + 5) break;
        P = this.mgr.findPath(s.pos.x, s.pos.z, s.pos.x + ((x - s.pos.x) / far) * h, s.pos.z + ((z - s.pos.z) / far) * h);
      }
      if (P === undefined) { if (!s.path.length) out.moveTo = { x, z }; return true; } // (no searches left this frame)
      s.goal = { x, z }; s.path = P || []; s.pathAt = now;
      if (!s.path.length && far > 8) return false;
    }
    if (!s.path.length) out.moveTo = { x, z };
    return true;
  }

  nextJob(s, G, game) {
    const W = this.world;
    // nights at home, if there is one
    if (G?.base && game.isNight) return this.inBase(G, s.pos.x, s.pos.z) ? { kind: 'idle', t: 300 } : { kind: 'home' };
    // a gang always leaves someone minding the stash
    if (G?.kind === 'gang' && G.base && !G.guard && this.members(G).length >= 3) { G.guard = s.id; return { kind: 'guard', t: 240 + Math.random() * 240 }; }
    // where to look: the group's target, shared, or a new one
    if (G && G.target && game.time - G.target.t < 300) return { kind: 'goto', ...G.target };
    const from = s.pos, weights = s.disp === 'hostile' ? GANG_RAID : BAND_LOOT;
    const cands = [];
    for (const b of W.buildings) {
      const w = weights[b.kind];
      if (!w || b.area || (G && b.index === G.b) || W.levels.buildingAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2)) continue;
      const d = Math.hypot((b.x0 + b.x1) / 2 - from.x, (b.z0 + b.z1) / 2 - from.z);
      if (d > 90) continue;
      cands.push([b, w / (1 + d / 50)]);
    }
    // gangs sometimes come for what you've stored
    const sh = game.safehouse;
    if (s.disp === 'hostile' && sh && G && this.members(G).length >= 3 && game.day >= 2 && Math.random() < 0.12) {
      const b = W.buildingAt?.((sh.x0 + sh.x1) / 2, (sh.z0 + sh.z1) / 2);
      if (b) cands.push([b, 1e6]);
    }
    if (!cands.length) return G?.b != null ? { kind: 'idle', t: 60 } : null;
    const b = wpick(cands);
    const at = this.spotIn(b.index);
    const T = { b: b.index, x: at.x, z: at.z, t: game.time };
    if (G) G.target = T;
    return { kind: 'goto', ...T };
  }

  containersIn(bi) {
    const b = this.world.buildings[bi], W = this.world;
    return W.containers.filter((c) => !c.retired && !c.owner && !c.gid && !c.base && !c.vehicleTrunk && c.type !== 'body' && c.x > b.x0 - 0.3 && c.x < b.x1 + 0.3 && c.z > b.z0 - 0.3 && c.z < b.z1 + 0.3)
      .sort(() => Math.random() - 0.5);
  }

  // What a survivor takes from a cupboard
  wants(s, it) {
    const d = ITEMS[it.key];
    if (s.disp === 'hostile') return (d.type === 'weapon' && GUN_RANK[it.key]) || d.type === 'ammo' || d.type === 'mag' || d.type === 'med' || d.type === 'throwable' || d.type === 'armor' || d.type === 'helmet' || (d.value || 0) >= 15000;
    return d.type === 'food' || d.type === 'med' || (d.type === 'ammo' && s.weapon && ITEMS[s.weapon.key].ammo === it.key) || (d.type === 'weapon' && !s.weapon && GUN_RANK[it.key]);
  }

  take(s, c) {
    let n = 0;
    for (const it of [...c.grid.items]) {
      if (!this.wants(s, it)) continue;
      const d = ITEMS[it.key];
      if (d.type === 'ammo' && s.weapon && ITEMS[s.weapon.key].ammo === it.key) { s.reserve += it.count || 1; removeItem(c.grid, it); n++; continue; }
      if (d.type === 'throwable') { s.nades = (s.nades || 0) + (it.count || 1); removeItem(c.grid, it); n++; continue; }
      if (d.type === 'weapon' && this.better(s, it.key)) { removeItem(c.grid, it); this.equip(s, it); n++; continue; }
      removeItem(c.grid, it);
      if (addItem(s.inv, it)) n++; else { addItem(c.grid, it); break; }
    }
    if (n && this.mgr.distToPlayer(s) < 25 && Math.random() < 0.4) s.say(s.disp === 'hostile' ? pick(['Jackpot.', 'Bag it.', 'Grab the ammo.']) : pick(['Found something.', 'This will help.']), 0.5);
  }

  better(s, key) { return GUN_RANK[key] && (!s.weapon || GUN_RANK[key] > (GUN_RANK[s.weapon.key] || 0) + 0.2); }

  // A new gun in hand: the old one in the bag, ammo for the new one out of it
  equip(s, gun) {
    if (s.weapon) { const old = s.weapon; if (s.reserve > 0) { addItem(s.inv, makeItem(ITEMS[old.key].ammo, { count: s.reserve })); } addItem(s.inv, old); }
    s.weapon = gun; s.reserve = 0;
    const ammo = ITEMS[gun.key].ammo;
    for (const it of [...s.inv.items]) if (it.key === ammo) { s.reserve += it.count || 1; removeItem(s.inv, it); }
    s.buildGun?.();
  }

  // Home: the haul goes in the stash, and anyone short of a gun or rounds re-arms
  deposit(s, G) {
    const st = G.stash?.grid;
    if (!st) return;
    for (const it of [...s.inv.items]) {
      if (ITEMS[it.key].type === 'med' && !s.inv.items.some((o) => o !== it && ITEMS[o.key].type === 'med' && !o.dep)) { it.dep = true; continue; } // (keeps one)
      removeItem(s.inv, it);
      if (!addItem(st, it)) { st.h += 2; addItem(st, it); }
    }
    for (const it of s.inv.items) delete it.dep;
    if (G.kind === 'gang') this.arm(s, G);
  }

  arm(s, G) {
    const st = G.stash?.grid;
    if (!st) return;
    const best = st.items.filter((it) => this.better(s, it.key)).sort((a, b) => GUN_RANK[b.key] - GUN_RANK[a.key])[0];
    if (best) { removeItem(st, best); this.equip(s, best); }
    if (s.weapon) {
      const ammo = ITEMS[s.weapon.key].ammo;
      for (const it of [...st.items]) if (it.key === ammo && s.reserve < 90) { s.reserve += it.count || 1; removeItem(st, it); }
    }
    for (const it of [...st.items]) if (ITEMS[it.key].type === 'throwable' && (s.nades || 0) < 2) { s.nades = (s.nades || 0) + 1; if (it.count > 1) it.count--; else removeItem(st, it); }
  }

  // ---------- trouble ----------
  // One of them has you in sight: the rest come
  onEngage(s, target) {
    const G = this.groupOf(s);
    if (!G || G.kind !== 'gang') return;
    const was = G.alert && this.game.time - G.alert.t < 25;
    G.alert = { x: target.pos.x, z: target.pos.z, t: this.game.time };
    if (!was && this.mgr.distToPlayer(s) < 40) s.say(pick(['Over here! Get over here!', 'Contact! Spread out!', 'Flank them!']), 0.9);
  }

  // A loud noise (gunfire, an explosion): gangs nearby go to see
  heard(x, z, r) {
    for (const G of this.groups) {
      if (G.kind !== 'gang' || (G.alert && this.game.time - G.alert.t < 25)) continue;
      if (this.members(G).some((s) => Math.hypot(s.pos.x - x, s.pos.z - z) < r * 0.8)) G.alert = { x, z, t: this.game.time };
    }
  }

  // Someone's been at a band's stash
  onStashOpened(c) {
    const G = this.groups.find((o) => o.id === c.gid);
    if (!G || G.kind !== 'band') return;
    for (const s of this.members(G)) if (s.pos.distanceTo(this.game.player.pos) < 25) { s.changeTrust(-12); if (!s.warnedStash) { s.warnedStash = true; s.say("Hey! That's our stash!"); } }
  }

  // Recruit a whole band
  recruitBand(s) {
    const G = this.groupOf(s);
    if (!G) return [];
    const mem = this.members(G);
    for (const o of mem) { o.order = 'follow'; o.job = null; o.trust = Math.max(o.trust, 25); }
    G.joined = true;
    return mem;
  }

  // ---------- map and saving ----------
  mapMarkers() {
    return this.groups.filter((G) => G.known && G.base).map((G) => ({ kind: G.kind, x: G.base.x, z: G.base.z, name: G.kind === 'gang' ? cap(G.name) : 'Survivors' }));
  }

  serialize() { return this.groups.map((G) => ({ id: G.id, kind: G.kind, disp: G.disp, name: G.name, b: G.b, base: G.base, known: G.known || undefined, recruitT: Math.round(G.recruitT), joined: G.joined || undefined })); }

  noSpawnAt(b) { this.game.zombies?.noSpawn.push({ x0: b.x0 - 10, x1: b.x1 + 10, z0: b.z0 - 10, z1: b.z1 + 10 }); }

  restore(saved) {
    this.groups = (saved || []).map((G) => ({ ...G, alert: null, target: null, guard: null }));
    for (const G of this.groups) if (G.b != null) this.noSpawnAt(this.world.buildings[G.b]);
    for (const G of this.groups) G.stash = this.world.containers.find((c) => c.gid === G.id) || null;
  }
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
