// Tutorial and progression: a guided first day that starts with every new
// character, then chapters of goals that lead from scavenging to taking on
// the military outpost. Progress is saved with the character; completing a
// step or chapter hands out a reward. Shown in the HUD tracker and on the
// goals panel (J).
import { ITEMS, makeItem } from './items.js';
import { addItem } from './inventory.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const count = (grids, pred) => grids.reduce((n, g) => n + g.items.filter(pred).reduce((a, it) => a + (it.count ?? 1), 0), 0);

// Tutorial steps: objective, a hint on how to do it, how to tell it's done
// (from counters `c` and the game), and a small reward.
const TUTORIAL = [
  { id: 'move', title: 'Get your bearings', hint: 'Walk with WASD and look with the mouse. Shift sprints, C crouches, the mouse wheel sets your pace.',
    done: (c) => c.walked >= 8, prog: (c) => [Math.min(8, Math.floor(c.walked)), 8, 'm'] },
  { id: 'search', title: 'Scavenge', hint: 'Search cupboards, fridges and shelves with F. Drag what you need into your pockets or backpack.',
    done: (c) => c.searched >= 3, prog: (c) => [Math.min(3, c.searched), 3], reward: [['bandage', 1]] },
  { id: 'inv', title: 'Check your gear', hint: 'Open your inventory with Tab. Your health, hunger, thirst and stamina are bottom-left.',
    done: (c) => c.invOpened > 0 },
  { id: 'eat', title: 'Keep your strength up', hint: 'Eat or drink something: right-click it in your inventory and choose Use.',
    done: (c) => c.ate > 0, reward: [['beans', 1]] },
  { id: 'arm', title: 'Arm yourself', hint: 'Equip a melee weapon or a gun. Kitchens have knives; toolboxes, garages and hardware stores have hammers and crowbars.',
    done: (c, g) => !!(g.player.melee || g.player.weapon) },
  { id: 'kill', title: 'First blood', hint: 'Kill a zombie. Swing at the head with the left mouse button. Keep quiet so you don\'t draw a crowd.',
    done: (c) => c.kills > 0, reward: [['painkillers', 1]] },
  { id: 'claim', title: 'A place to call home', hint: 'Pick a house and press V inside it to claim it as your safehouse. Zombies won\'t spawn near it.',
    done: (c, g) => !!g.safehouse },
  { id: 'trader', title: 'Find a trader', hint: 'A trader has set up shop nearby. It\'s marked on your map (M) with a gold diamond.',
    start: (g) => g.progress.revealTrader(), done: (c, g) => !!g.traders?.list.some((t) => t.discovered && !t.dead && t.visited), reward: [['water', 1]] },
  { id: 'deal', title: 'Make a deal', hint: 'Press F at the counter: barter items for gear, or take a job for reputation and rewards.',
    done: (c) => c.trades > 0 },
  { id: 'build', title: 'Fortify', hint: 'In your safehouse press B for build mode. Barricades need planks and nails (lumber piles, toolboxes, hardware stores, the quartermaster). Board up a door or window.',
    done: (c) => c.built > 0, reward: [['planks', 4], ['nails', 20]] },
];
const TUTORIAL_REWARD = [['salewa', 1], ['mre', 1], ['ammo_9x18', 30]];

// Chapters after the tutorial. Goals: id, text, check(c, g) → [have, need].
const CHAPTERS = [
  { title: 'Dig In', blurb: 'Make your safehouse somewhere you can last.', reward: [['bp_scav', 1], ['tape', 2]], goals: [
    { id: 'build5', text: 'Build 5 things', check: (c) => [c.built, 5] },
    { id: 'sleep', text: 'Sleep in a bed', check: (c) => [c.slept, 1] },
    { id: 'stock', text: 'Store 10 food or water in your safehouse', check: (c, g) => [g.progress.stockpile(), 10] },
    { id: 'day3', text: 'Survive until day 3', check: (c, g) => [Math.min(3, g.day), 3] },
  ] },
  { title: 'Trade Routes', blurb: 'The traders are the closest thing to a town left. Earn their trust.', reward: [['ai2', 2], ['roler', 1]], goals: [
    { id: 'alltraders', text: 'Find every trader', check: (c, g) => { const ts = g.traders?.list.filter((t) => t.building) || []; return [ts.filter((t) => t.discovered).length, ts.length || 1]; } },
    { id: 'jobs5', text: 'Finish 5 trader jobs', check: (c, g) => [g.progress.jobsDone(), 5] },
    { id: 'll2', text: 'Reach loyalty 2 with a trader', check: (c, g) => [g.traders?.list.some((t) => g.traders.ll(t) >= 2) ? 1 : 0, 1] },
  ] },
  { title: 'Armed and Dangerous', blurb: 'Knives won\'t cut it forever.', reward: [['mag_ak30', 1], ['ammo_545', 60]], goals: [
    { id: 'rifle', text: 'Own a rifle (SKS or AK-74)', check: (c, g) => [g.progress.hasItem((it) => it.key === 'sks' || it.key === 'ak74') ? 1 : 0, 1] },
    { id: 'optic', text: 'Mount an optic on a gun', check: (c, g) => [g.progress.hasItem((it) => !!it.mods?.optic) ? 1 : 0, 1] },
    { id: 'armor', text: 'Wear body armor', check: (c, g) => [g.player.equip.armor ? 1 : 0, 1] },
    { id: 'kills50', text: 'Kill 50 zombies', check: (c) => [c.kills, 50] },
  ] },
  { title: 'The Outpost', blurb: 'The army left its gear behind, and its soldiers. Take it back.', reward: [['armor_6b13', 1], ['helmet_6b47', 1]], goals: [
    { id: 'soldiers', text: 'Kill 10 soldier zombies', check: (c) => [c.soldiers, 10] },
    { id: 'milloot', text: 'Loot a military crate', check: (c) => [c.milLoot, 1] },
    { id: 'll3', text: 'Reach loyalty 3 with a trader', check: (c, g) => [g.traders?.list.some((t) => g.traders.ll(t) >= 3) ? 1 : 0, 1] },
  ] },
  { title: 'Long Haul', blurb: 'Survival isn\'t a sprint.', reward: [['ledx', 1]], goals: [
    { id: 'day14', text: 'Survive until day 14', check: (c, g) => [Math.min(14, g.day), 14] },
    { id: 'kills250', text: 'Kill 250 zombies', check: (c) => [c.kills, 250] },
    { id: 'jobs15', text: 'Finish 15 trader jobs', check: (c, g) => [g.progress.jobsDone(), 15] },
  ] },
];

export class Progress {
  // state lives on the character (saved with it)
  constructor(game, ch, isNew) {
    this.game = game;
    if (!ch.progress) {
      ch.progress = {
        tut: isNew ? 0 : TUTORIAL.length, chapter: 0, done: {},
        c: { walked: 0, searched: 0, invOpened: 0, ate: 0, kills: 0, soldiers: 0, built: 0, slept: 0, trades: 0, milLoot: 0 },
      };
      if (isNew) this.pendingStart = true;
    }
    this.s = ch.progress;
    this.seen = new Set();
    this.last = null;
    this.timer = 0;
    this.panelOpen = false;
  }

  get tutorialActive() { return this.s.tut < TUTORIAL.length; }
  get step() { return TUTORIAL[this.s.tut]; }
  get chapter() { return CHAPTERS[this.s.chapter]; }

  // ---------- events from the game ----------
  event(kind, data) {
    const c = this.s.c;
    if (kind === 'search' && data && !this.seen.has(data)) {
      this.seen.add(data);
      c.searched++;
      const b = this.game.world.buildingAt(data.x, data.z);
      if (['milcrate', 'ammobox', 'duffel'].includes(data.type) || b?.kind === 'military') c.milLoot++;
    } else if (kind === 'inv') c.invOpened++;
    else if (kind === 'use' && ['food'].includes(ITEMS[data?.key]?.type)) c.ate++;
    else if (kind === 'build') c.built++;
    else if (kind === 'sleep') c.slept++;
    else if (kind === 'trade') c.trades++;
    this.timer = 0; // re-check right away
  }

  onKill(target) {
    if (!target?.def) return;
    this.s.c.kills++;
    if (target.type === 'soldier') this.s.c.soldiers++;
  }

  // ---------- helpers for goals ----------
  hasItem(pred) {
    const p = this.game.player;
    const all = [...Object.values(p.equip).filter(Boolean), ...p.ammoGrids().flatMap((g) => g.items)];
    return all.some(pred);
  }
  jobsDone() { return (this.game.traders?.list || []).reduce((n, t) => n + Object.values(t.quests).filter((q) => q.st === 'done').length, 0); }
  stockpile() {
    const sh = this.game.safehouse;
    if (!sh) return 0;
    const grids = this.game.world.containers.filter((c) => c.x > sh.x0 && c.x < sh.x1 && c.z > sh.z0 && c.z < sh.z1).map((c) => c.grid);
    for (const s of this.game.builder.structures) if (s.grid && s.x > sh.x0 && s.x < sh.x1 && s.z > sh.z0 && s.z < sh.z1) grids.push(s.grid);
    return Math.min(10, count(grids, (it) => ITEMS[it.key].type === 'food'));
  }
  // Point the player at the nearest living trader.
  revealTrader() {
    const g = this.game, p = g.player.pos;
    const ts = (g.traders?.list || []).filter((t) => t.building && !t.dead);
    ts.sort((a, b) => Math.hypot(a.spot.x - p.x, a.spot.z - p.z) - Math.hypot(b.spot.x - p.x, b.spot.z - p.z));
    if (ts[0]) { ts[0].discovered = true; g.hud.message(`${ts[0].title} is marked on your map (M).`, 5); }
  }

  give(list) {
    const p = this.game.player;
    for (const [key, n] of list) {
      const def = ITEMS[key];
      const items = def.stack ? [makeItem(key, { count: n })] : Array.from({ length: n }, () => makeItem(key, def.type === 'weapon' ? { loaded: 0 } : {}));
      for (const it of items) if (!p.ammoGrids().some((g) => addItem(g, it))) this.game.dropItem(it);
    }
  }
  rewardText(list) { return list.map(([k, n]) => `${n > 1 && !ITEMS[k].stack ? n + '× ' : ''}${ITEMS[k].name}${ITEMS[k].stack ? ' ×' + n : ''}`).join(', '); }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game, s = this.s;
    // walking distance for the first step
    const pos = g.player.pos;
    if (this.last) s.c.walked += Math.min(1, Math.hypot(pos.x - this.last.x, pos.z - this.last.z));
    this.last = { x: pos.x, z: pos.z };
    // having stood at a trader's counter counts as finding them
    for (const t of g.traders?.list || []) if (t.npc && !t.visited && t.npc.pos.distanceTo(pos) < 4) t.visited = true;
    if (this.pendingStart) {
      this.pendingStart = false;
      g.hud.message('Welcome. Follow the guide (top right) to get through your first day. Press J for your goals.', 7);
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    if (this.tutorialActive) {
      const st = this.step;
      if (!s.started?.[st.id]) { s.started = { ...(s.started || {}), [st.id]: true }; st.start?.(g); }
      if (st.done(s.c, g)) {
        s.tut++;
        sfx.extract();
        g.hud.message(`✔ ${st.title}${st.reward ? ` — got ${this.rewardText(st.reward)}` : ''}`, 4);
        if (st.reward) this.give(st.reward);
        if (!this.tutorialActive) {
          this.give(TUTORIAL_REWARD);
          g.hud.message(`First day done. Got ${this.rewardText(TUTORIAL_REWARD)}. Next: chapter 1, ${CHAPTERS[0].title}. Press J for your goals.`, 8);
        } else this.announce();
      }
    } else if (this.chapter) {
      const ch = this.chapter;
      for (const goal of ch.goals) {
        if (s.done[goal.id]) continue;
        const [have, need] = goal.check(s.c, g);
        if (have >= need) { s.done[goal.id] = true; sfx.pickup(); g.hud.message(`Goal complete: ${goal.text}`, 4); }
      }
      if (ch.goals.every((goal) => s.done[goal.id])) {
        s.chapter++;
        this.give(ch.reward);
        sfx.extract();
        g.hud.message(`Chapter complete: ${ch.title}! Got ${this.rewardText(ch.reward)}.${this.chapter ? ` Next: ${this.chapter.title}.` : ' You\'ve done it all. Keep surviving.'}`, 8);
      }
    }
    this.draw();
  }

  announce() {
    const st = this.step;
    if (st) this.game.hud.message(`Next: ${st.title}`, 3);
  }

  skipTutorial() {
    this.s.tut = TUTORIAL.length;
    this.game.hud.message('Tutorial skipped. Press J for your goals.', 4);
    this.draw();
  }

  // ---------- UI ----------
  draw() {
    const el = $('guide');
    if (!el) return;
    const s = this.s;
    let html = '';
    if (this.tutorialActive) {
      const st = this.step, pr = st.prog?.(s.c, this.game);
      html = `<div class="gd"><div class="gd-h">First day · ${s.tut + 1}/${TUTORIAL.length}</div><b>${st.title}</b>${pr ? ` <span>${pr[0]}/${pr[1]}${pr[2] ? ' ' + pr[2] : ''}</span>` : ''}<div class="gd-hint">${st.hint}</div></div>`;
    } else if (this.chapter) {
      const ch = this.chapter;
      const open = ch.goals.filter((gl) => !s.done[gl.id]).slice(0, 3);
      html = `<div class="gd"><div class="gd-h">Chapter ${s.chapter + 1} · ${ch.title}</div>${open.map((gl) => { const [h, n] = gl.check(s.c, this.game); return `<div>${gl.text} <span>${Math.min(h, n)}/${n}</span></div>`; }).join('')}<div class="gd-hint">J: all goals</div></div>`;
    }
    if (el.innerHTML !== html) el.innerHTML = html;
    if (this.panelOpen) this.drawPanel();
  }

  togglePanel(v) {
    this.panelOpen = v ?? !this.panelOpen;
    $('goals').style.display = this.panelOpen ? 'flex' : 'none';
    if (this.panelOpen) this.drawPanel();
  }

  drawPanel() {
    const s = this.s, g = this.game;
    const tut = TUTORIAL.map((st, i) => `<div class="gl ${i < s.tut ? 'ok' : i === s.tut ? 'cur' : ''}">${i < s.tut ? '✔' : i === s.tut ? '▶' : '·'} ${st.title}</div>`).join('');
    const chs = CHAPTERS.map((ch, i) => {
      const state = i < s.chapter ? 'ok' : i === s.chapter && !this.tutorialActive ? 'cur' : 'lock';
      const goals = ch.goals.map((gl) => {
        const [h, n] = gl.check(s.c, g);
        const ok = s.done[gl.id];
        return `<div class="gl ${ok ? 'ok' : ''}">${ok ? '✔' : '·'} ${gl.text} ${state === 'cur' && !ok ? `<span>${Math.min(h, n)}/${n}</span>` : ''}</div>`;
      }).join('');
      return `<div class="gch ${state}"><div class="gch-h">${i + 1}. ${ch.title} ${state === 'ok' ? '✔' : state === 'lock' ? '🔒' : ''}</div><div class="dim">${ch.blurb}</div>${state === 'lock' ? '' : goals}<div class="gch-r">Reward: ${this.rewardText(ch.reward)}</div></div>`;
    }).join('');
    $('goals').innerHTML = `<div class="g-panel"><div class="g-title">Goals</div>
      <div class="gch ${this.tutorialActive ? 'cur' : 'ok'}"><div class="gch-h">First day ${this.tutorialActive ? '' : '✔'}</div>${tut}${this.tutorialActive ? '<div class="dim">K: skip the tutorial</div>' : ''}</div>
      ${chs}<div class="hint">J or Esc to close</div></div>`;
  }
}
