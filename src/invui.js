// HTML drag-and-drop inventory UI. Renders "sections" (grids or equipment
// slot groups) into two columns and handles moving items between them.
import { ITEMS, itemValue, makeItem } from './items.js';
import { canPlace, removeItem, addItem, itemSize } from './inventory.js';

const CELL = 42;
const SLOT_TYPES = { weapon: 'weapon', melee: 'melee', armor: 'armor', helmet: 'helmet', backpack: 'backpack', clothing: 'clothing' };
const SLOT_LABELS = { weapon: 'Primary', melee: 'Melee', helmet: 'Helmet', armor: 'Body Armor', backpack: 'Backpack', clothing: 'Clothing' };

export class InventoryUI {
  constructor(root) {
    this.root = root;
    this.left = [];
    this.right = [];
    this.opts = {};
    this.drag = null;
    this.menu = null;
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => {
      if (this.drag && e.code === 'KeyR') { this.drag.item.rot = !this.drag.item.rot; this.styleGhost(); }
    });
    window.addEventListener('pointerdown', (e) => {
      if (this.menu && !this.menu.contains(e.target)) this.closeMenu();
    });
  }

  // sections: [{ kind: 'grid', title, grid, noNest } | { kind: 'equip', title, equip }]
  open(left, right, opts = {}) {
    this.left = left; this.right = right; this.opts = opts;
    this.render();
  }

  render() {
    this.closeMenu();
    this.grids = new Map();
    this.root.innerHTML = '';
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
    const cols = [mk('inv-col'), mk('inv-col'), mk('inv-col')];
    // Sections may be given as functions so they reflect equipment changes.
    this.curLeft = typeof this.left === 'function' ? this.left() : this.left;
    this.curRight = typeof this.right === 'function' ? this.right() : this.right;
    this.equipSection = null;
    [this.curLeft, this.curRight].forEach((secs, ci) => {
      for (const s of secs) cols[s.col ?? ci].appendChild(this.renderSection(s));
    });
    this.root.append(...cols);
  }

  renderSection(s) {
    const box = document.createElement('div');
    box.className = 'inv-section';
    const h = document.createElement('div');
    h.className = 'inv-title';
    h.textContent = s.title;
    box.appendChild(h);
    if (s.kind === 'grid') box.appendChild(this.renderGrid(s));
    else if (s.kind === 'equip') box.appendChild(this.renderEquip(s));
    else if (s.kind === 'shop') box.appendChild(this.renderShop(s));
    else if (s.kind === 'sell') {
      const z = document.createElement('div');
      z.className = 'sell-zone';
      z.dataset.sell = '1';
      z.textContent = 'Drop items here to sell (70% value)';
      box.appendChild(z);
    }
    return box;
  }

  renderGrid(s) {
    const id = 'g' + this.grids.size;
    this.grids.set(id, s);
    const g = document.createElement('div');
    g.className = 'grid';
    g.dataset.grid = id;
    g.style.width = s.grid.w * CELL + 'px';
    g.style.height = s.grid.h * CELL + 'px';
    g.style.backgroundSize = `${CELL}px ${CELL}px`;
    for (const it of s.grid.items) {
      g.appendChild(this.renderItem(it, { grid: s.grid, section: s }));
    }
    return g;
  }

  renderEquip(s) {
    const wrap = document.createElement('div');
    wrap.className = 'equip';
    for (const slot of Object.keys(SLOT_TYPES)) {
      const el = document.createElement('div');
      el.className = 'slot slot-' + slot;
      el.dataset.slot = slot;
      const lab = document.createElement('span');
      lab.className = 'slot-label';
      lab.textContent = SLOT_LABELS[slot];
      el.appendChild(lab);
      const it = s.equip[slot];
      if (it) {
        const ie = this.renderItem(it, { equip: s.equip, slot });
        ie.style.left = '0'; ie.style.top = '0';
        ie.style.width = '100%'; ie.style.height = '100%';
        el.appendChild(ie);
      }
      wrap.appendChild(el);
    }
    this.equipSection = s;
    return wrap;
  }

  renderShop(s) {
    const wrap = document.createElement('div');
    wrap.className = 'shop';
    for (const [key, price] of s.stock) {
      const def = ITEMS[key];
      const row = document.createElement('button');
      row.className = 'shop-row';
      row.innerHTML = `<span class="sw" style="background:${def.color}"></span><span>${def.name}</span><span class="price">₽${price.toLocaleString()}</span>`;
      row.onclick = () => s.onBuy(key, price);
      wrap.appendChild(row);
    }
    return wrap;
  }

  renderItem(it, src) {
    const def = ITEMS[it.key];
    const [w, h] = itemSize(it);
    const el = document.createElement('div');
    el.className = 'item';
    el.style.left = it.x * CELL + 'px';
    el.style.top = it.y * CELL + 'px';
    el.style.width = w * CELL - 2 + 'px';
    el.style.height = h * CELL - 2 + 'px';
    el.style.background = def.color;
    let badge = '';
    const loading = this.opts.loading?.() === it;
    if (def.stack) badge = it.count;
    else if (def.type === 'weapon') badge = def.tube ? `${it.tube || 0}+${it.chamber || 0}` : it.mag ? `${it.mag.rounds}+${it.chamber || 0}` : `no mag${it.chamber ? '+1' : ''}`;
    else if (def.type === 'mag') badge = `${it.rounds}/${def.cap}`;
    else if (def.uses > 1) badge = `${it.uses}/${def.uses}`;
    else if (def.durability) badge = `${Math.round(it.dur)}/${def.durability}`;
    else if (def.part) badge = `${Math.round(it.cond ?? 100)}%`;
    else if (def.type === 'fuel') badge = `${(it.fuel || 0).toFixed(1)} L`;
    else if (def.waterCap) badge = `${(it.water || 0).toFixed(1)} L`;
    else if (it.grid) badge = `${it.grid.items.length}`;
    if (loading) { badge = '⟳ ' + badge; el.classList.add('loading'); }
    const mods = it.mods ? Object.values(it.mods).filter(Boolean).map((m) => ITEMS[m.key].short) : [];
    const modTag = mods.length ? `<span class="imods">${mods.join(' · ')}</span>` : '';
    el.innerHTML = `<span class="iname">${def.short}</span>${modTag}<span class="ibadge">${badge}</span>`;
    let tip = `${def.name}\n₽${itemValue(it).toLocaleString()}`;
    if (def.type === 'weapon') tip += `\n${it.mag ? ITEMS[it.mag.key].name : def.tube ? 'Internal tube' : 'No magazine'}${mods.length ? '\nMods: ' + mods.join(', ') : ''}`;
    if (def.fits) tip += `\nFits: ${def.fits.map((k) => ITEMS[k].short).join(', ')}`;
    el.title = tip;
    el.itemRef = it;
    el.srcRef = src;
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      e.preventDefault();
      if (e.shiftKey) { this.quickMove(it, src); return; }
      this.startDrag(it, src, e);
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); this.openMenu(it, src, e); });
    return el;
  }

  detach(it, src) {
    if (src.grid) removeItem(src.grid, it);
    else if (src.equip) src.equip[src.slot] = null;
  }

  // Shift+click: move to the first grid in the opposite column that has room.
  quickMove(it, src) {
    const fromLeft = this.curLeft.some((s) => (src.grid && s.grid === src.grid) || (src.equip && s.equip === src.equip));
    const targets = (fromLeft ? this.curRight : this.curLeft).filter((s) => s.kind === 'grid');
    const prevRot = it.rot;
    for (const t of targets) {
      if (t.noNest && ITEMS[it.key].type === 'backpack') continue;
      if (t.grid === src.grid) continue;
      this.detach(it, src);
      if (addItem(t.grid, it)) { this.changed(); return; }
      it.rot = prevRot;
      this.reattach(it, src);
    }
  }

  reattach(it, src) {
    if (src.grid) src.grid.items.push(it);
    else if (src.equip) src.equip[src.slot] = it;
  }

  startDrag(it, src, e) {
    const ghost = document.createElement('div');
    ghost.className = 'item ghost';
    ghost.style.background = ITEMS[it.key].color;
    ghost.innerHTML = `<span class="iname">${ITEMS[it.key].short}</span>`;
    document.body.appendChild(ghost);
    this.drag = { it, item: it, src, ghost, origRot: it.rot, origX: it.x, origY: it.y };
    this.styleGhost();
    this.onMove(e);
  }

  styleGhost() {
    const { ghost, item } = this.drag;
    const [w, h] = itemSize(item);
    ghost.style.width = w * CELL - 2 + 'px';
    ghost.style.height = h * CELL - 2 + 'px';
  }

  onMove(e) {
    if (!this.drag) return;
    this.drag.mx = e.clientX; this.drag.my = e.clientY;
    this.drag.ghost.style.left = e.clientX - CELL / 2 + 'px';
    this.drag.ghost.style.top = e.clientY - CELL / 2 + 'px';
  }

  onUp(e) {
    if (!this.drag) return;
    const { item, src, ghost } = this.drag;
    ghost.remove();
    const drag = this.drag;
    this.drag = null;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const def = ITEMS[item.key];
    const revert = () => { item.rot = drag.origRot; item.x = drag.origX; item.y = drag.origY; this.render(); };
    if (!target) return revert();

    const sell = target.closest('[data-sell]');
    if (sell && this.opts.onSell) {
      this.detach(item, src);
      this.opts.onSell(item);
      return this.changed();
    }

    // Dropping onto another item (also the equipped weapon): load ammo into
    // a magazine, insert a magazine, attach a mod... Checked before slots.
    const onEl = target.closest('.item');
    if (onEl && onEl.itemRef && onEl.itemRef !== item && onEl.itemRef.key !== item.key && this.opts.combine) {
      if (this.opts.combine(item, onEl.itemRef, { detach: () => this.detach(item, src), src, targetSrc: onEl.srcRef })) {
        item.rot = drag.origRot;
        return this.changed();
      }
    }

    const slotEl = target.closest('[data-slot]');
    if (slotEl && this.equipSection) {
      const slot = slotEl.dataset.slot;
      const eq = this.equipSection.equip;
      if (SLOT_TYPES[slot] !== def.type || (eq[slot] && eq[slot] !== item)) return revert();
      this.detach(item, src);
      item.rot = false;
      eq[slot] = item;
      return this.changed();
    }

    const gridEl = target.closest('[data-grid]');
    if (gridEl) {
      const sec = this.grids.get(gridEl.dataset.grid);
      if (sec.noNest && def.type === 'backpack') return revert();
      if (item.grid && item.grid === sec.grid) return revert();
      const r = gridEl.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left - CELL / 2) / CELL + 0.5);
      const y = Math.floor((e.clientY - r.top - CELL / 2) / CELL + 0.5);
      // Ammo merge onto an existing stack
      const onItem = target.closest('.item');
      if (def.stack && onItem) {
        const other = sec.grid.items.find((o) => o !== item && o.key === item.key && o.count < def.stack &&
          x >= o.x && y >= o.y && x < o.x + itemSize(o)[0] && y < o.y + itemSize(o)[1]);
        if (other) {
          const n = Math.min(def.stack - other.count, item.count);
          other.count += n; item.count -= n;
          if (item.count <= 0) this.detach(item, src);
          return this.changed();
        }
      }
      if (!canPlace(sec.grid, item, x, y)) return revert();
      this.detach(item, src);
      item.x = x; item.y = y;
      sec.grid.items.push(item);
      return this.changed();
    }
    revert();
  }

  openMenu(it, src, e) {
    this.closeMenu();
    const def = ITEMS[it.key];
    const m = document.createElement('div');
    m.className = 'ctx';
    const add = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { this.closeMenu(); fn(); };
      m.appendChild(b);
    };
    const h = document.createElement('div');
    h.className = 'ctx-h';
    h.textContent = `${def.name} — ₽${itemValue(it).toLocaleString()}`;
    m.appendChild(h);
    if ((def.type === 'food' || def.type === 'med') && this.opts.onUse) {
      add('Use', () => {
        const consumed = this.opts.onUse(it);
        if (consumed) {
          if (def.uses) { it.uses -= 1; if (it.uses <= 0) this.detach(it, src); }
          else this.detach(it, src);
        }
        this.changed();
      });
    }
    if (def.stack && it.count > 1) {
      add('Split stack', () => {
        const grid = src.grid;
        if (!grid) return;
        const half = Math.floor(it.count / 2);
        const n = makeItem(it.key, { count: half });
        const spot = canPlaceAny(grid, n);
        if (spot) { it.count -= half; addItem(grid, n); }
        this.changed();
      });
    }
    for (const [label, fn] of this.opts.actions?.(it, src) ?? []) add(label, () => { fn(); this.changed(); });
    if (this.opts.onSell) add(`Sell (₽${Math.round(itemValue(it) * 0.7).toLocaleString()})`, () => {
      this.detach(it, src); this.opts.onSell(it); this.changed();
    });
    if (this.opts.onDrop) add('Drop', () => { this.detach(it, src); this.opts.onDrop(it); this.changed(); });
    m.style.left = e.clientX + 'px';
    m.style.top = e.clientY + 'px';
    document.body.appendChild(m);
    this.menu = m;
  }

  firstGrid() {
    for (const s of [...this.curLeft, ...this.curRight]) if (s.kind === 'grid') return s.grid;
    return null;
  }

  closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }

  // Abort an in-progress drag (e.g. the window was closed mid-drag).
  cancelDrag() {
    if (!this.drag) return;
    const { item, ghost, origRot, origX, origY } = this.drag;
    ghost.remove();
    item.rot = origRot; item.x = origX; item.y = origY;
    this.drag = null;
  }

  changed() {
    this.opts.onChange?.();
    this.render();
  }
}

function canPlaceAny(grid, it) {
  for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.w; x++) if (canPlace(grid, it, x, y, null)) return true;
  return false;
}
