// HUD: health doll, stamina, hunger/thirst/fatigue, ammo, compass, clock,
// interaction prompts, build bar, messages, hitmarker and a fold-out map.
import { PARTS } from './player.js';
import { ITEMS } from './items.js';
import { HALF } from './world.js';

const $ = (id) => document.getElementById(id);
const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class HUD {
  constructor() {
    this.el = $('hud');
    this.msgs = $('messages');
    this.ammoChanged = true;
    this.hitTimer = 0;
    this.mapOpen = false;
    const doll = $('doll');
    doll.innerHTML = '';
    this.partEls = {};
    for (const k in PARTS) {
      const row = document.createElement('div');
      row.className = 'part';
      row.innerHTML = `<span class="pn">${PARTS[k].name}</span><span class="pbar"><i></i></span><span class="pv"></span><span class="pb">🩸</span>`;
      doll.appendChild(row);
      this.partEls[k] = row;
    }
  }

  show(v) { this.el.style.display = v ? 'block' : 'none'; }

  message(text, secs = 3) {
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    this.msgs.appendChild(d);
    setTimeout(() => d.classList.add('fade'), secs * 1000);
    setTimeout(() => d.remove(), secs * 1000 + 600);
    while (this.msgs.children.length > 5) this.msgs.firstChild.remove();
  }

  hitmarker(head) {
    const h = $('hitmarker');
    h.className = head ? 'show head' : 'show';
    this.hitTimer = 0.15;
  }

  update(dt, game) {
    const p = game.player;
    for (const k in PARTS) {
      const row = this.partEls[k];
      const frac = p.hp[k] / PARTS[k].max;
      const bar = row.children[1].firstChild;
      bar.style.width = frac * 100 + '%';
      bar.style.background = frac <= 0 ? '#222' : frac < 0.35 ? '#c33' : frac < 0.7 ? '#cc9a33' : '#7ab04a';
      row.children[2].textContent = Math.ceil(p.hp[k]);
      row.classList.toggle('blacked', p.hp[k] <= 0);
      row.children[3].style.visibility = p.bleeding.has(k) ? 'visible' : 'hidden';
    }
    $('stam').style.width = p.stamina + '%';
    $('stam').style.background = p.exhausted ? '#c55' : '';
    // Stance, pace, speed and carried weight
    const kg = p.weight || 0;
    const wcls = kg > 60 ? 'red' : kg > 45 ? 'red' : kg > 25 ? 'warn' : '';
    $('move').innerHTML = `${p.stance === 'stand' ? (p.sprinting ? 'SPRINTING' : 'STANDING') : p.stance.toUpperCase()} · pace ${Math.round(p.pace * 100)}% · ${(p.speed || 0).toFixed(1)} m/s<br>` +
      `<span class="${wcls}">${kg.toFixed(1)} kg${kg > 60 ? ' — CRITICALLY OVERWEIGHT' : kg > 45 ? ' — OVERWEIGHT, can\'t sprint' : kg > 25 ? ' — overweight' : ''}</span>`;
    $('arms').style.width = p.gun.armStamina + '%';
    $('food').style.width = p.food + '%';
    $('water').style.width = p.water + '%';

    const status = [];
    if (p.bleeding.size) status.push('<b class="red">BLEEDING</b>');
    if (p.infected) status.push(`<b class="green">INFECTED ${Math.floor(p.infection)}%</b>`);
    if (p.painkiller > 0) status.push('<b>PAINKILLERS</b>');
    if ((p.hp.legL <= 0 || p.hp.legR <= 0) && p.painkiller <= 0) status.push('<b class="red">LEG DESTROYED</b>');
    if (p.exhausted) status.push('<b class="red">WINDED</b>');
    if (p.food <= 10) status.push('<b class="red">STARVING</b>');
    if (p.water <= 10) status.push('<b class="red">DEHYDRATED</b>');

    // Weapon
    // Weapon panel: like Tarkov there's no exact ammo counter — press T to check.
    const w = p.active === 'gun' ? p.weapon : p.melee;
    const gi = p.active === 'gun' && w ? p.gun.hudInfo() : null;
    if (gi) {
      $('weapon').innerHTML = `${gi.name}<span class="mode">${gi.mode}</span><br>` +
        (gi.check ? `<span class="check">${gi.check}</span><br>` : '') +
        `<span class="dim">${gi.mag}${gi.spare != null ? ` · ${gi.spare} spare mag${gi.spare === 1 ? '' : 's'}` : ''}</span>` +
        (gi.mods.length ? `<br><span class="mods">${gi.mods.join(' · ')}</span>` : '') +
        (gi.state ? `<br><span class="dim">${gi.state}</span>` : '');
    } else {
      $('weapon').innerHTML = w ? ITEMS[w.key].name : p.active === 'gun' ? 'No firearm' : 'Fists';
    }

    // Compass
    const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const strip = $('compass');
    let html = '';
    for (let d = Math.ceil((deg - 60) / 15) * 15; d <= deg + 60; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const label = n % 45 === 0 ? DIRS[n / 45] : '·';
      html += `<span style="left:${50 + (d - deg) / 1.2}%">${label}</span>`;
    }
    strip.innerHTML = html + `<span class="deg">${Math.round(deg)}°</span>`;

    // Clock + character info
    $('clock').textContent = `Day ${game.day} · ${game.clockText()}${game.isNight ? ' · NIGHT' : ''}`;
    const ch = game.profile;
    const inSafe = game.inSafehouse(p.pos.x, p.pos.z);
    $('info').innerHTML = `${ch.name} <span class="dim">— ${ch.professionName}</span>` +
      (inSafe ? '<br><span class="safe">SAFEHOUSE</span>' : '') +
      (game.builder.active ? '<br><span class="dim">BUILD MODE</span>' : '');
    $('rest').style.width = (100 - p.fatigue) + '%';
    if (p.fatigue > 80) status.push('<b class="red">EXHAUSTED</b>');
    else if (p.fatigue > 60) status.push('<b>TIRED</b>');
    $('status').innerHTML = status.join(' ');

    const prompt = $('prompt');
    const b = game.builder;
    let text = '';
    if (b.active) {
      text = b.valid ? '[LMB] Build · [R] Rotate' : b.reason;
      if (b.target) text += ` · [X] Dismantle ${b.target.name} (${Math.ceil(b.target.hp)}/${b.target.maxHp})`;
    } else if (game.lookTarget) {
      const t = game.lookTarget;
      const hp = t.hp != null && t.hp < t.maxHp ? ` (${Math.ceil(t.hp)}/${t.maxHp})` : '';
      if (t.door || t.kind === 'door') text = `[F] ${t.open ? 'Close' : 'Open'} ${t.name}${hp}`;
      else if (t.kind === 'bed' || t.type === 'bed') text = '[F] Sleep';
      else text = `[F] Search ${t.name}`;
    }
    prompt.style.display = text ? 'block' : 'none';
    prompt.textContent = text;
    this.updateBuildBar(game);

    $('vignette').style.opacity = Math.max(p.hurtFlash, (1 - Math.min(p.hp.thorax / 85, p.hp.head / 35)) * 0.6);
    // No crosshair with a firearm (Tarkov-style); a small dot for melee and building.
    $('crosshair').style.opacity = p.active === 'gun' && p.weapon && !game.builder.active ? 0 : 0.6;

    this.hitTimer -= dt;
    if (this.hitTimer <= 0) $('hitmarker').className = '';

    if (this.mapOpen) this.drawMap(game);
  }

  updateBuildBar(game) {
    const bar = $('buildbar');
    const b = game.builder;
    bar.style.display = b.active ? 'flex' : 'none';
    if (!b.active) return;
    // Refresh a few times a second; affordability changes as you loot.
    if (this.barSel === b.sel && (this.barT = (this.barT || 0) - 1) > 0) return;
    this.barSel = b.sel;
    this.barT = 15;
    bar.innerHTML = game.buildables.map((d, i) => {
      const na = d.skill > game.player.skill.carpentry || !b.canAfford(d);
      return `<div class="b ${i === b.sel ? 'sel' : ''} ${na ? 'na' : ''}">${i + 1}. ${d.name}<small>${game.buildCost(d)}${d.skill ? ` · Carp ${d.skill}` : ''}</small></div>`;
    }).join('');
  }

  toggleMap(v) {
    this.mapOpen = v ?? !this.mapOpen;
    $('map').style.display = this.mapOpen ? 'flex' : 'none';
  }

  drawMap(game) {
    const c = $('mapcanvas');
    const ctx = c.getContext('2d');
    const S = c.width / (HALF * 2);
    const tx = (x) => (x + HALF) * S;
    ctx.fillStyle = '#2b3322'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#26301f';
    for (const [x, z] of game.world.trees) ctx.fillRect(tx(x) - 1, tx(z) - 1, 3, 3);
    ctx.fillStyle = '#3a3a3a';
    for (let k = -100; k <= 100; k += 40) { ctx.fillRect(tx(k) - 4 * S, tx(-104), 8 * S, 208 * S); ctx.fillRect(tx(-104), tx(k) - 4 * S, 208 * S, 8 * S); }
    const colors = { house: '#8a7a62', shop: '#6a7a8a', clinic: '#c8c8c0', warehouse: '#5a5a4a' };
    for (const b of game.world.buildings) {
      ctx.fillStyle = colors[b.kind];
      ctx.fillRect(tx(b.x0), tx(b.z0), (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    }
    ctx.fillStyle = '#a8834a';
    for (const st of game.builder.structures) ctx.fillRect(tx(st.box.minX), tx(st.box.minZ), Math.max(2, (st.box.maxX - st.box.minX) * S), Math.max(2, (st.box.maxZ - st.box.minZ) * S));
    const sh = game.safehouse;
    if (sh) { ctx.strokeStyle = '#e5c84a'; ctx.lineWidth = 2; ctx.strokeRect(tx(sh.x0), tx(sh.z0), (sh.x1 - sh.x0) * S, (sh.z1 - sh.z0) * S); }
    const p = game.player;
    ctx.save();
    ctx.translate(tx(p.pos.x), tx(p.pos.z));
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ff0';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
