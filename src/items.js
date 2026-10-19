// Item definitions. w/h are grid cells. Everything else is type-specific.
export const ITEMS = {
  // --- weapons ---
  // Weapons are fed either by a detachable magazine (magKey) or an internal tube.
  pm: { name: 'PM Pistol', short: 'PM', type: 'weapon', w: 2, h: 1, color: '#555', value: 6000,
    ammo: 'ammo_9x18', magKey: 'mag_pm', damage: 34, pellets: 1, rpm: 320, auto: false, noise: 32, range: 40 },
  mp133: { name: 'MP-133 Shotgun', short: 'MP-133', type: 'weapon', w: 4, h: 1, color: '#5a4636', value: 18000,
    ammo: 'ammo_12g', tube: 6, damage: 16, pellets: 8, rpm: 70, auto: false, noise: 55, range: 25 },
  ak74: { name: 'AK-74N', short: 'AK-74', type: 'weapon', w: 4, h: 2, color: '#3b3b2e', value: 42000,
    ammo: 'ammo_545', magKey: 'mag_ak30', damage: 42, pellets: 1, rpm: 620, auto: true, noise: 60, range: 60 },
  sks: { name: 'SKS', short: 'SKS', type: 'weapon', w: 5, h: 1, color: '#6b4a2a', value: 28000,
    ammo: 'ammo_762', magKey: 'mag_sks', damage: 70, pellets: 1, rpm: 300, auto: false, noise: 65, range: 70 },

  // --- magazines (load them by dragging ammo onto them) ---
  mag_pm: { name: 'PM 8-round magazine', short: 'PM mag', type: 'mag', w: 1, h: 1, color: '#4a4a4a', value: 900, ammo: 'ammo_9x18', cap: 8, fits: ['pm'] },
  mag_ak30: { name: 'AK-74 30-round magazine', short: 'AK 30', type: 'mag', w: 1, h: 2, color: '#6a4a2a', value: 2500, ammo: 'ammo_545', cap: 30, fits: ['ak74'] },
  mag_ak45: { name: 'RPK-74 45-round magazine', short: 'AK 45', type: 'mag', w: 1, h: 3, color: '#5a3a2a', value: 6500, ammo: 'ammo_545', cap: 45, fits: ['ak74'], ergo: 0.9 },
  mag_sks: { name: 'SKS 10-round magazine', short: 'SKS 10', type: 'mag', w: 1, h: 1, color: '#555', value: 1800, ammo: 'ammo_762', cap: 10, fits: ['sks'] },

  // --- attachments (drag onto a weapon) ---
  sight_reddot: { name: 'Red Dot Sight', short: 'Red dot', type: 'optic', w: 1, h: 1, color: '#2a2a2a', value: 9000, optic: 'reflex', reticle: 'dot', fits: ['ak74', 'sks', 'mp133'] },
  sight_holo: { name: 'Holographic Sight', short: 'Holo', type: 'optic', w: 2, h: 1, color: '#333', value: 16000, optic: 'reflex', reticle: 'holo', fits: ['ak74', 'sks', 'mp133'] },
  scope_pso: { name: 'PSO-1 4x Scope', short: 'PSO-1', type: 'optic', w: 2, h: 1, color: '#2a3020', value: 24000, optic: 'scope', zoom: 4, reticle: 'pso', fits: ['ak74', 'sks'], ergo: 0.85 },
  scope_6x: { name: 'Hunting 6x Scope', short: '6x', type: 'optic', w: 3, h: 1, color: '#222', value: 30000, optic: 'scope', zoom: 6, reticle: 'duplex', fits: ['ak74', 'sks'], ergo: 0.8 },
  supp_pm: { name: 'PM Suppressor', short: 'PM supp', type: 'muzzle', w: 2, h: 1, color: '#2a2a2a', value: 14000, suppress: true, recoil: 0.95, fits: ['pm'] },
  supp_rifle: { name: 'Rifle Suppressor', short: 'Supp', type: 'muzzle', w: 2, h: 1, color: '#2a2a2a', value: 28000, suppress: true, recoil: 0.85, ergo: 0.9, fits: ['ak74', 'sks'] },
  brake_ak: { name: 'Muzzle Brake', short: 'Brake', type: 'muzzle', w: 1, h: 1, color: '#444', value: 7000, recoil: 0.75, fits: ['ak74', 'sks'] },
  grip_vert: { name: 'Vertical Foregrip', short: 'Grip', type: 'grip', w: 1, h: 1, color: '#222', value: 6000, recoil: 0.9, ergo: 1.15, fits: ['ak74', 'mp133'] },

  // --- ammo ---
  ammo_9x18: { name: '9x18mm PM', short: '9x18', type: 'ammo', w: 1, h: 1, color: '#8a7a3a', value: 40, stack: 50 },
  ammo_12g: { name: '12/70 Buckshot', short: '12g', type: 'ammo', w: 1, h: 1, color: '#8a3a3a', value: 90, stack: 20 },
  ammo_545: { name: '5.45x39mm', short: '5.45', type: 'ammo', w: 1, h: 1, color: '#7a8a3a', value: 120, stack: 60 },
  ammo_762: { name: '7.62x39mm', short: '7.62', type: 'ammo', w: 1, h: 1, color: '#9a6a2a', value: 150, stack: 40 },

  // --- melee ---
  knife: { name: 'Kitchen Knife', short: 'Knife', type: 'melee', w: 1, h: 2, color: '#777', value: 1500, damage: 38, range: 1.5, rate: 0.45 },
  crowbar: { name: 'Crowbar', short: 'Crowbar', type: 'melee', w: 1, h: 3, color: '#7a2a2a', value: 4000, damage: 62, range: 1.8, rate: 0.75 },
  axe: { name: 'Fire Axe', short: 'Axe', type: 'melee', w: 1, h: 3, color: '#a33', value: 9000, damage: 110, range: 1.9, rate: 1.0 },

  hammer: { name: 'Hammer', short: 'Hammer', type: 'melee', w: 1, h: 2, color: '#8a6a4a', value: 3000, damage: 28, range: 1.4, rate: 0.5, tool: 'hammer' },

  // --- carpentry ---
  planks: { name: 'Planks', short: 'Planks', type: 'material', w: 3, h: 1, color: '#a8834a', value: 600, stack: 10 },
  nails: { name: 'Nails', short: 'Nails', type: 'material', w: 1, h: 1, color: '#9a9aa0', value: 40, stack: 100 },
  log: { name: 'Log', short: 'Log', type: 'material', w: 4, h: 1, color: '#6a4a2a', value: 1500 },
  saw: { name: 'Saw', short: 'Saw', type: 'tool', w: 1, h: 2, color: '#aab', value: 2500, tool: 'saw' },

  // --- gear ---
  armor_paca: { name: 'PACA Body Armor', short: 'PACA', type: 'armor', w: 3, h: 3, color: '#3a4a5a', value: 15000, protection: 0.45, durability: 60 },
  armor_6b13: { name: '6B13 Assault Armor', short: '6B13', type: 'armor', w: 3, h: 3, color: '#4a5a3a', value: 48000, protection: 0.7, durability: 90 },
  helmet_ssh: { name: 'SSh-68 Helmet', short: 'SSh-68', type: 'helmet', w: 2, h: 2, color: '#4a5a3a', value: 9000, protection: 0.5, durability: 40 },
  bp_scav: { name: 'Scav Backpack', short: 'Scav BP', type: 'backpack', w: 3, h: 3, color: '#5a5a3a', value: 6000, gw: 4, gh: 4 },
  bp_tri: { name: 'Tri-Zip Backpack', short: 'Tri-Zip', type: 'backpack', w: 3, h: 4, color: '#3a5a4a', value: 22000, gw: 6, gh: 6 },

  // --- consumables ---
  beans: { name: 'Can of Beans', short: 'Beans', type: 'food', w: 1, h: 1, color: '#9a6a3a', value: 3000, food: 35, water: -5 },
  crackers: { name: 'Army Crackers', short: 'Crackers', type: 'food', w: 1, h: 1, color: '#b09a5a', value: 1800, food: 20, water: -10 },
  water: { name: 'Water Bottle', short: 'Water', type: 'food', w: 1, h: 2, color: '#3a7aaa', value: 3500, food: 0, water: 55 },
  soda: { name: 'Can of Soda', short: 'Soda', type: 'food', w: 1, h: 1, color: '#aa3a3a', value: 2000, food: 5, water: 30 },
  bandage: { name: 'Bandage', short: 'Bandage', type: 'med', w: 1, h: 1, color: '#ddd', value: 1500, stopBleed: true, uses: 1 },
  ai2: { name: 'AI-2 Medkit', short: 'AI-2', type: 'med', w: 1, h: 1, color: '#c33', value: 4000, heal: 40, uses: 2 },
  salewa: { name: 'Salewa Kit', short: 'Salewa', type: 'med', w: 1, h: 2, color: '#c55', value: 14000, heal: 60, stopBleed: true, uses: 4 },
  antiviral: { name: 'Antiviral Injector', short: 'AV-1', type: 'med', w: 1, h: 1, color: '#3aaa6a', value: 45000, cure: true, uses: 1 },
  painkillers: { name: 'Painkillers', short: 'Pills', type: 'med', w: 1, h: 1, color: '#eee', value: 3000, painkiller: 60, uses: 4 },

  // --- valuables / barter ---
  bolts: { name: 'Bolts', short: 'Bolts', type: 'loot', w: 1, h: 1, color: '#666', value: 4000 },
  tape: { name: 'Duct Tape', short: 'Tape', type: 'loot', w: 1, h: 1, color: '#888', value: 6000 },
  wires: { name: 'Wires', short: 'Wires', type: 'loot', w: 1, h: 1, color: '#a63', value: 7000 },
  battery: { name: 'Car Battery', short: 'Battery', type: 'loot', w: 2, h: 2, color: '#334', value: 22000 },
  chain: { name: 'Gold Chain', short: 'Chain', type: 'loot', w: 1, h: 1, color: '#d4af37', value: 25000 },
  roler: { name: 'Roler Watch', short: 'Roler', type: 'loot', w: 1, h: 1, color: '#e5c84a', value: 38000 },
  gpu: { name: 'Graphics Card', short: 'GPU', type: 'loot', w: 2, h: 1, color: '#2a6a3a', value: 110000 },
  ledx: { name: 'LEDX Transilluminator', short: 'LEDX', type: 'loot', w: 1, h: 1, color: '#6ad', value: 280000 },
};

let uidCounter = Date.now();
export function uid() { return (uidCounter++).toString(36); }

export function makeItem(key, opts = {}) {
  const def = ITEMS[key];
  if (!def) throw new Error('unknown item ' + key);
  const it = { uid: uid(), key, x: 0, y: 0 };
  const rng = opts.rng || Math.random;
  if (def.stack) it.count = opts.count ?? Math.ceil(def.stack * (0.3 + rng() * 0.5));
  if (def.type === 'weapon') {
    // opts.loaded = rounds to put in the magazine / tube (a round is also chambered).
    it.mods = { optic: null, muzzle: null, grip: null };
    it.mode = def.auto ? 'auto' : 'semi';
    const loaded = opts.loaded ?? (rng() < 0.5 ? Math.floor(rng() * ((def.tube || ITEMS[def.magKey].cap) + 1)) : null);
    if (def.tube) it.tube = loaded ?? 0;
    else it.mag = loaded == null ? null : makeItem(def.magKey, { rounds: loaded });
    it.chamber = loaded > 0 ? 1 : 0;
  }
  if (def.type === 'mag') it.rounds = opts.rounds ?? Math.floor(rng() * (def.cap + 1));
  if (def.uses) it.uses = def.uses;
  if (def.durability) it.dur = def.durability;
  if (def.type === 'backpack') it.grid = { w: def.gw, h: def.gh, items: [] };
  return it;
}

export function itemValue(it) {
  const def = ITEMS[it.key];
  let v = def.value;
  if (def.stack) v *= it.count;
  if (def.uses) v *= it.uses / def.uses;
  if (def.durability) v *= 0.3 + 0.7 * it.dur / def.durability;
  if (it.grid) v += it.grid.items.reduce((s, c) => s + itemValue(c), 0);
  if (it.mag) v += itemValue(it.mag);
  if (it.mods) for (const m of Object.values(it.mods)) if (m) v += itemValue(m);
  if (def.type === 'mag') v += it.rounds * ITEMS[def.ammo].value;
  return Math.round(v);
}

// Upgrade items from older saves (weapons used to store a plain round count).
export function migrateItem(it) {
  const def = ITEMS[it.key];
  if (!def) return;
  if (def.type === 'weapon' && !it.mods) {
    const loaded = it.loaded ?? 0;
    delete it.loaded;
    it.mods = { optic: null, muzzle: null, grip: null };
    it.mode = def.auto ? 'auto' : 'semi';
    it.chamber = 0;
    if (def.tube) it.tube = Math.min(loaded, def.tube);
    else it.mag = makeItem(def.magKey, { rounds: Math.min(loaded, ITEMS[def.magKey].cap) });
  }
  if (it.grid) it.grid.items.forEach(migrateItem);
}

// Weighted loot tables per container type
export const LOOT_TABLES = {
  fridge: [['beans', 5], ['water', 6], ['soda', 6], ['crackers', 4]],
  cabinet: [['mag_pm', 1.5], ['sight_reddot', 0.3], ['bandage', 5], ['ai2', 3], ['painkillers', 3], ['bolts', 4], ['tape', 4], ['wires', 3], ['knife', 2], ['ammo_9x18', 3], ['chain', 1], ['roler', 0.4], ['nails', 2], ['hammer', 0.8], ['bp_scav', 0.8], ['beans', 2]],
  toolbox: [['hammer', 4], ['saw', 3], ['nails', 6], ['tape', 3], ['bolts', 3], ['crowbar', 1], ['wires', 2]],
  lumber: [['planks', 8], ['log', 2], ['nails', 3]],
  crate: [['mag_ak30', 3], ['mag_ak45', 0.6], ['mag_sks', 2], ['mag_pm', 1.5], ['sight_reddot', 1], ['sight_holo', 0.6], ['scope_pso', 0.5], ['scope_6x', 0.3],
    ['supp_rifle', 0.35], ['supp_pm', 0.4], ['brake_ak', 0.8], ['grip_vert', 0.8], ['ammo_545', 4], ['ammo_12g', 4], ['ammo_9x18', 4], ['ammo_762', 3], ['pm', 2], ['mp133', 1.2], ['sks', 0.6], ['ak74', 0.35], ['crowbar', 1.5], ['axe', 0.6], ['bp_scav', 1], ['helmet_ssh', 0.8], ['armor_paca', 0.6], ['bandage', 2]],
  medbox: [['bandage', 5], ['ai2', 5], ['salewa', 2], ['painkillers', 3], ['antiviral', 0.8], ['ledx', 0.25]],
  pc: [['gpu', 0.8], ['wires', 4], ['battery', 0.5], ['chain', 0.8]],
  trunk: [['battery', 2], ['bolts', 3], ['tape', 3], ['water', 2], ['ammo_12g', 2], ['bp_tri', 0.3], ['armor_6b13', 0.15], ['crowbar', 1]],
  body: [['mag_pm', 1], ['mag_ak30', 0.6], ['ammo_9x18', 3], ['ammo_545', 2], ['bandage', 3], ['beans', 2], ['pm', 1], ['chain', 1], ['roler', 0.5], ['antiviral', 0.3]],
};

export function rollLoot(table, count, rng = Math.random) {
  const t = LOOT_TABLES[table];
  const total = t.reduce((s, e) => s + e[1], 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    let r = rng() * total;
    for (const [k, wgt] of t) { r -= wgt; if (r <= 0) { out.push(makeItem(k, { rng })); break; } }
  }
  return out;
}

export const CONTAINER_TYPES = {
  fridge: { name: 'Fridge', w: 4, h: 4, rolls: [1, 4], color: 0xdddddd, size: [0.9, 1.8, 0.7] },
  cabinet: { name: 'Cabinet', w: 4, h: 3, rolls: [0, 3], color: 0x7a5a3a, size: [1.2, 1.0, 0.5] },
  crate: { name: 'Weapon Crate', w: 6, h: 3, rolls: [1, 3], color: 0x4a5a2a, size: [1.4, 0.6, 0.7] },
  medbox: { name: 'Medcase', w: 4, h: 3, rolls: [1, 3], color: 0xcc3333, size: [0.6, 0.4, 0.4] },
  pc: { name: 'PC', w: 4, h: 3, rolls: [0, 2], color: 0x222222, size: [0.5, 0.9, 0.9] },
  toolbox: { name: 'Toolbox', w: 4, h: 3, rolls: [1, 3], color: 0xaa3322, size: [0.7, 0.35, 0.35] },
  lumber: { name: 'Lumber Pile', w: 6, h: 4, rolls: [2, 4], color: 0x9a7a4a, size: [1.6, 0.5, 0.8] },
  trunk: { name: 'Car Trunk', w: 6, h: 4, rolls: [0, 3], color: 0x000000, size: [0, 0, 0] },
  body: { name: 'Corpse', w: 5, h: 4, rolls: [1, 3], color: 0x000000, size: [0, 0, 0] },
};
