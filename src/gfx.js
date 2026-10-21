// Graphics settings: how sharp, how far and how shadowed, traded against
// frame rate. Presets, or each setting on its own; saved in the browser.
//  - render scale: the resolution drawn at (pixels are most of the cost)
//  - shadows: off, low (1024, hard edges) or high (2048, soft)
//  - shadow updates: the sun's shadows redrawn every frame or every other
//  - view distance: how far you see (the fog closes in to match)
//  - anti-aliasing: smooth edges (takes effect when the page is reloaded)
import * as THREE from 'three';

const KEY = 'tarkzoid-gfx';
export const PRESETS = {
  low: { scale: 0.7, shadows: 'off', shadowEvery: 2, view: 0.7, aa: false },
  medium: { scale: 0.85, shadows: 'low', shadowEvery: 2, view: 0.85, aa: false },
  high: { scale: 1, shadows: 'high', shadowEvery: 2, view: 1, aa: true },
  ultra: { scale: 1.33, shadows: 'high', shadowEvery: 1, view: 1.15, aa: true },
};
export function loadGfx() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch {}
  return { preset: 'high', ...PRESETS.high, ...(s || {}) };
}
function saveGfx(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

// Apply settings to the running game
export function applyGfx(game, s) {
  const R = game.renderer;
  // render scale on top of the screen's own density (capped: a 3x phone
  // screen doesn't need 3x the pixels)
  R.setPixelRatio(Math.min(devicePixelRatio, 1.5) * s.scale);
  game.onResize?.();
  const shadows = s.shadows !== 'off';
  const size = s.shadows === 'low' ? 1024 : 2048;
  const type = s.shadows === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (game.sun.castShadow !== shadows || R.shadowMap.type !== type) {
    // (a change in which lights cast shadows rebuilds the shaders, once)
    game.sun.castShadow = shadows;
    if (game.player) game.player.light.castShadow = shadows;
    R.shadowMap.type = type;
    game.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
  }
  if (game.sun.shadow.mapSize.x !== size) {
    game.sun.shadow.mapSize.set(size, size);
    game.sun.shadow.map?.dispose(); game.sun.shadow.map = null;
  }
  game.gfx = s;
}

// The settings panel (title menu and pause screen)
export function setupGfxPanel(game) {
  const el = document.createElement('div');
  el.id = 'gfxpanel';
  el.className = 'overlay';
  document.body.appendChild(el);
  const row = (label, ctl, note = '') => `<div class="gfx-row"><span class="snd-label">${label}</span>${ctl}<span class="snd-val">${note}</span></div>`;
  const sel = (k, opts) => `<select data-k="${k}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
  function render() {
    const s = game.gfx;
    el.innerHTML = `<div class="panel snd-panel gfx-panel"><div class="snd-head"><h2>GRAPHICS</h2><button class="snd-close">✕ Close</button></div>
      <div class="gfx-presets">${Object.keys(PRESETS).map((p) => `<button data-p="${p}" class="${s.preset === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>
      <div class="snd-body">
        ${row('Render scale', `<input type="range" min="0.5" max="1.5" step="0.05" data-k="scale" value="${s.scale}">`, `${Math.round(s.scale * 100)}%`)}
        ${row('Shadows', sel('shadows', [['off', 'Off'], ['low', 'Low'], ['high', 'High']]))}
        ${row('Sun shadow updates', sel('shadowEvery', [['1', 'Every frame'], ['2', 'Every other frame']]))}
        ${row('View distance', `<input type="range" min="0.5" max="1.3" step="0.05" data-k="view" value="${s.view}">`, `${Math.round(s.view * 100)}%`)}
        ${row('Anti-aliasing', sel('aa', [['true', 'On'], ['false', 'Off']]), 'after reload')}
        <p class="dim gfx-fps">${game.fps ? `${game.fps} fps` : ''}</p>
      </div></div>`;
    for (const sl of el.querySelectorAll('select')) sl.value = String(s[sl.dataset.k]);
  }
  const set = (patch) => {
    const s = { ...game.gfx, ...patch };
    saveGfx(s); applyGfx(game, s); render();
  };
  el.addEventListener('change', (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    const v = e.target.value;
    set({ preset: 'custom', [k]: k === 'aa' ? v === 'true' : k === 'shadowEvery' ? +v : e.target.type === 'range' ? +v : v });
  });
  el.addEventListener('input', (e) => { if (e.target.type === 'range') e.target.parentElement.querySelector('.snd-val').textContent = `${Math.round(e.target.value * 100)}%`; });
  el.addEventListener('click', (e) => {
    if (e.target.dataset?.p) set({ preset: e.target.dataset.p, ...PRESETS[e.target.dataset.p] });
    else if (e.target.classList.contains('snd-close') || e.target === el) close();
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && el.style.display === 'flex') { e.stopPropagation(); close(); } }, true);
  function close() { el.style.display = 'none'; }
  return { open() { render(); el.style.display = 'flex'; }, close, get isOpen() { return el.style.display === 'flex'; } };
}
