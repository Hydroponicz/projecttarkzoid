import { makeItem } from './items.js';
import { makeGrid, addItem } from './inventory.js';

const KEY = 'tarkzoid-profile-v1';

export function newProfile() {
  const p = {
    money: 60000,
    stash: makeGrid(10, 14),
    pockets: makeGrid(4, 2),
    secure: makeGrid(2, 2),
    equip: { weapon: null, melee: null, armor: null, helmet: null, backpack: null },
    stats: { raids: 0, survived: 0, kills: 0, deaths: 0 },
  };
  p.equip.weapon = makeItem('pm', { loaded: 8 });
  p.equip.melee = makeItem('knife');
  p.equip.backpack = makeItem('bp_scav');
  addItem(p.pockets, makeItem('ammo_9x18', { count: 30 }));
  addItem(p.pockets, makeItem('bandage'));
  addItem(p.pockets, makeItem('water'));
  for (const k of ['beans', 'ai2', 'bandage', 'crackers']) addItem(p.stash, makeItem(k));
  addItem(p.stash, makeItem('ammo_9x18', { count: 50 }));
  return p;
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable or corrupt */ }
  return newProfile();
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

export function wipeProfile() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return newProfile();
}
