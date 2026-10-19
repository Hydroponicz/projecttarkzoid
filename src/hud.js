// In-raid HUD: health doll, stamina, hunger/thirst, ammo, compass,
// extracts, messages, hitmarker and a fold-out map.
import { PARTS } from './player.js';
import { ITEMS } from './items.js';
import { countAmmo } from './inventory.js';
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
    $('food').style.width = p.food + '%';
    $('water').style.width = p.water + '%';

    const status = [];
    if (p.bleeding.size) status.push('<b class="red">BLEEDING</b>');
    if (p.infected) status.push(`<b class="green">INFECTED ${Math.floor(p.infection)}%</b>`);
    if (p.painkiller > 0) status.push('<b>PAINKILLERS</b>');
    if ((p.hp.legL <= 0 || p.hp.legR <= 0) && p.painkiller <= 0) status.push('<b class="red">LEG DESTROYED</b>');
    if (p.food <= 10) status.push('<b class="red">STARVING</b>');
    if (p.water <= 10) status.push('<b class="red">DEHYDRATED</b>');
    $('status').innerHTML = status.join(' ');

    // Weapon
    const w = p.active === 'gun' ? p.weapon : p.melee;
    if (p.active === 'gun' && w) {
      const def = ITEMS[w.key];
      const spare = countAmmo(p.ammoGrids(), def.ammo);
      $('weapon').innerHTML = `${def.name}<br><span class="big">${w.loaded}</span> / ${def.mag} <span class="dim">[${spare}]</span>${p.reloading > 0 ? ' <span class="dim">RELOADING</span>' : ''}`;
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

    // Timer + extracts
    const left = Math.max(0, game.raidTime - game.raidElapsed);
    $('timer').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    $('extracts').innerHTML = game.world.extracts.map((e) => {
      const dx = e.x - p.pos.x, dz = e.z - p.pos.z;
      const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
      const dir = DIRS[Math.round(bearing / 45) % 8];
      return `<div>EXFIL ${e.name} <span class="dim">— ${dir}, ~${Math.round(Math.hypot(dx, dz) / 10) * 10}m</span></div>`;
    }).join('');

    const ex = $('extracting');
    if (game.extractTimer != null) { ex.style.display = 'block'; ex.textContent = `EXTRACTING IN ${game.extractTimer.toFixed(1)}`; }
    else ex.style.display = 'none';

    const prompt = $('prompt');
    if (game.lookTarget) { prompt.style.display = 'block'; prompt.textContent = `[F] Search ${game.lookTarget.name}`; }
    else prompt.style.display = 'none';

    $('vignette').style.opacity = Math.max(p.hurtFlash, (1 - Math.min(p.hp.thorax / 85, p.hp.head / 35)) * 0.6);
    $('crosshair').style.opacity = p.ads > 0.5 || p.active !== 'gun' ? 0 : 0.7;

    this.hitTimer -= dt;
    if (this.hitTimer <= 0) $('hitmarker').className = '';

    if (this.mapOpen) this.drawMap(game);
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
    ctx.font = '12px monospace';
    for (const e of game.world.extracts) {
      ctx.fillStyle = '#4f4'; ctx.beginPath(); ctx.arc(tx(e.x), tx(e.z), 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#cfc'; ctx.fillText(e.name, Math.min(c.width - 120, Math.max(4, tx(e.x) - 40)), tx(e.z) + (e.z > 0 ? -10 : 20));
    }
    const p = game.player;
    ctx.save();
    ctx.translate(tx(p.pos.x), tx(p.pos.z));
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ff0';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
