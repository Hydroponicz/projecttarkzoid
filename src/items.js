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
  helmet_6b47: { name: '6B47 Ratnik Helmet', short: '6B47', type: 'helmet', w: 2, h: 2, color: '#3a4a2a', value: 32000, protection: 0.7, durability: 60 },
  bp_mil: { name: 'Military Rucksack', short: 'Rucksack', type: 'backpack', w: 4, h: 4, color: '#3a4a2a', value: 38000, gw: 6, gh: 7 },
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
  vitamins: { name: 'Vitamins', short: 'Vitamins', type: 'med', w: 1, h: 1, color: '#e8a030', value: 2500, heal: 8, uses: 5 },
  antibiotics: { name: 'Antibiotics', short: 'Antibio', type: 'med', w: 1, h: 1, color: '#5a9ad8', value: 11000, slowInfection: 35, uses: 2 },
  morphine: { name: 'Morphine Injector', short: 'Morphine', type: 'med', w: 1, h: 1, color: '#d85a5a', value: 14000, painkiller: 180, heal: 15, uses: 1 },
  surgical: { name: 'Surgical Kit', short: 'Surgery', type: 'med', w: 2, h: 1, color: '#7ab0a0', value: 32000, surgery: true, uses: 2 },
  coffee: { name: 'Instant Coffee', short: 'Coffee', type: 'food', w: 1, h: 1, color: '#5a3a20', value: 1800, food: 0, water: 10, fatigue: 25 },
  chips: { name: 'Bag of Chips', short: 'Chips', type: 'food', w: 1, h: 1, color: '#d8b030', value: 1200, food: 15, water: -8 },
  rice: { name: 'Bag of Rice', short: 'Rice', type: 'food', w: 1, h: 1, color: '#e8e0c8', value: 2600, food: 40, water: -12 },
  mre: { name: 'MRE Ration', short: 'MRE', type: 'food', w: 1, h: 2, color: '#6a6a40', value: 8000, food: 65, water: 15 },
  painkillers: { name: 'Painkillers', short: 'Pills', type: 'med', w: 1, h: 1, color: '#eee', value: 3000, painkiller: 60, uses: 4 },

  // --- valuables / barter ---
  bolts: { name: 'Bolts', short: 'Bolts', type: 'loot', w: 1, h: 1, color: '#666', value: 4000 },
  tape: { name: 'Duct Tape', short: 'Tape', type: 'loot', w: 1, h: 1, color: '#888', value: 6000 },
  wires: { name: 'Wires', short: 'Wires', type: 'loot', w: 1, h: 1, color: '#a63', value: 7000 },
  battery: { name: 'Car Battery', short: 'Battery', type: 'part', part: 'battery', w: 2, h: 2, color: '#334', value: 22000 },
  chain: { name: 'Gold Chain', short: 'Chain', type: 'loot', w: 1, h: 1, color: '#d4af37', value: 25000 },
  roler: { name: 'Roler Watch', short: 'Roler', type: 'loot', w: 1, h: 1, color: '#e5c84a', value: 38000 },
  gpu: { name: 'Graphics Card', short: 'GPU', type: 'loot', w: 2, h: 1, color: '#2a6a3a', value: 110000 },
  paper: { name: 'Printer Paper', short: 'Paper', type: 'loot', w: 1, h: 1, color: '#f0f0f0', value: 900 },
  office: { name: 'Office Supplies', short: 'Supplies', type: 'loot', w: 1, h: 1, color: '#4a7ac8', value: 1600 },
  folder: { name: 'Intelligence Folder', short: 'Intel', type: 'loot', w: 1, h: 1, color: '#c8a050', value: 95000 },
  flashdrive: { name: 'Secure Flash Drive', short: 'Flash', type: 'loot', w: 1, h: 1, color: '#3a8a6a', value: 55000 },
  hdd: { name: 'Hard Drive', short: 'HDD', type: 'loot', w: 1, h: 1, color: '#555560', value: 16000 },
  laptop: { name: 'Laptop', short: 'Laptop', type: 'loot', w: 2, h: 1, color: '#2a2a30', value: 48000 },
  mil_battery: { name: 'Military Battery', short: 'Mil batt', type: 'loot', w: 2, h: 1, color: '#4a5a3a', value: 160000 },
  mil_cable: { name: 'Military Cable', short: 'Mil cable', type: 'loot', w: 1, h: 1, color: '#3a4a2a', value: 28000 },
  dogtag: { name: 'Dog Tag', short: 'Dogtag', type: 'loot', w: 1, h: 1, color: '#9aa0a8', value: 6000 },
  ledx: { name: 'LEDX Transilluminator', short: 'LEDX', type: 'loot', w: 1, h: 1, color: '#6ad', value: 280000 },

  // --- vehicle parts, tools and fuel ---
  tire: { name: 'Car Tire', short: 'Tire', type: 'part', part: 'tire', w: 3, h: 3, color: '#2a2a2a', value: 9000 },
  brakes: { name: 'Brake Pads', short: 'Brakes', type: 'part', part: 'brakes', w: 2, h: 1, color: '#6a6a70', value: 7000 },
  headlight: { name: 'Headlight', short: 'Headlight', type: 'part', part: 'headlights', w: 2, h: 1, color: '#d8d8c0', value: 5000 },
  spark_plugs: { name: 'Spark Plugs', short: 'Plugs', type: 'loot', w: 1, h: 1, color: '#c8c8c8', value: 3500, stack: 4 },
  engine_parts: { name: 'Engine Parts', short: 'Eng parts', type: 'loot', w: 2, h: 2, color: '#5a4a3a', value: 18000 },
  scrap: { name: 'Scrap Metal', short: 'Scrap', type: 'loot', w: 1, h: 1, color: '#7a7a7a', value: 800, stack: 10 },
  wrench: { name: 'Wrench', short: 'Wrench', type: 'tool', tool: 'wrench', w: 1, h: 2, color: '#8a8a90', value: 3000 },
  jack: { name: 'Car Jack', short: 'Jack', type: 'tool', tool: 'jack', w: 3, h: 1, color: '#c83a2a', value: 4500 },
  gas_can: { name: 'Gas Can', short: 'Gas can', type: 'fuel', w: 2, h: 3, color: '#b02a1a', value: 2500, cap: 20 },

  // --- quest items (placed in the world when a trader's quest is accepted) ---
  q_case: { name: 'Sealed Medical Case', short: 'Med case', type: 'quest', w: 2, h: 1, color: '#d8d8d0', value: 0 },
  q_parts: { name: 'Box of Rifle Parts', short: 'Parts', type: 'quest', w: 2, h: 1, color: '#5a5040', value: 0 },
  q_ledger: { name: "Smuggler's Ledger", short: 'Ledger', type: 'quest', w: 1, h: 1, color: '#7a2a2a', value: 0 },
  q_radio: { name: 'Field Radio', short: 'Radio', type: 'quest', w: 2, h: 2, color: '#3a4a2a', value: 0 },
  q_keys: { name: 'Ring of Keys', short: 'Keys', type: 'quest', w: 1, h: 1, color: '#c8a050', value: 0 },
};

// Weights in kg (per round / per unit for stackables). Carried weight slows
// you down and drains stamina, like Tarkov's overweight system.
const KG = {
  pm: 0.73, mp133: 3.4, ak74: 3.3, sks: 3.85,
  ammo_9x18: 0.01, ammo_12g: 0.045, ammo_545: 0.011, ammo_762: 0.016,
  mag_pm: 0.09, mag_ak30: 0.23, mag_ak45: 0.33, mag_sks: 0.15,
  knife: 0.2, crowbar: 1.4, axe: 1.7, hammer: 0.6, saw: 0.6,
  armor_paca: 3.5, armor_6b13: 10.5, helmet_ssh: 1.6, bp_scav: 0.6, bp_tri: 1.2,
  beans: 0.4, crackers: 0.2, water: 0.6, soda: 0.35,
  bandage: 0.05, ai2: 0.1, salewa: 0.6, antiviral: 0.05, painkillers: 0.05,
  bolts: 0.3, tape: 0.2, wires: 0.2, battery: 12, chain: 0.05, roler: 0.1, gpu: 0.6, ledx: 0.3,
  planks: 1.2, nails: 0.01, log: 8,
  helmet_6b47: 1.3, bp_mil: 2.0, vitamins: 0.1, antibiotics: 0.05, morphine: 0.05, surgical: 0.8, coffee: 0.2, chips: 0.15, rice: 1.0, mre: 0.7,
  paper: 0.5, office: 0.3, folder: 0.3, flashdrive: 0.02, hdd: 0.4, laptop: 2.2, mil_battery: 5, mil_cable: 0.4, dogtag: 0.02,
  sight_reddot: 0.2, sight_holo: 0.35, scope_pso: 0.6, scope_6x: 0.7,
  supp_pm: 0.2, supp_rifle: 0.5, brake_ak: 0.15, grip_vert: 0.15,
  tire: 9, brakes: 2, headlight: 1, spark_plugs: 0.2, engine_parts: 4, scrap: 1, wrench: 0.6, jack: 4, gas_can: 1.5,
};
for (const k in ITEMS) ITEMS[k].kg = KG[k] ?? 0.3;

export function itemWeight(it) {
  const def = ITEMS[it.key];
  let w = def.kg * (it.count ?? 1);
  if (def.type === 'mag') w += (it.rounds || 0) * ITEMS[def.ammo].kg;
  if (def.tube) w += (it.tube || 0) * ITEMS[def.ammo].kg;
  if (it.mag) w += itemWeight(it.mag);
  if (it.mods) for (const m of Object.values(it.mods)) if (m) w += itemWeight(m);
  if (it.grid) for (const c of it.grid.items) w += itemWeight(c);
  if (def.type === 'fuel') w += (it.fuel || 0) * 0.75;
  return w;
}

let uidCounter = Date.now();
export function uid() { return (uidCounter++).toString(36); }

export function makeItem(key, opts = {}) {
  const def = ITEMS[key];
  if (!def) throw new Error('unknown item ' + key);
  const it = { uid: uid(), key, x: 0, y: 0 };
  const rng = opts.rng || Math.random;
  // Vehicle parts have a condition; gas cans hold fuel.
  if (def.part) it.cond = opts.cond ?? Math.round(25 + rng() * 75);
  if (def.type === 'fuel') it.fuel = opts.fuel ?? Math.round(rng() * 12);
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
  if (def.part) v *= 0.2 + 0.8 * (it.cond ?? 100) / 100;
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
  if (def.part && it.cond == null) it.cond = 70;
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
  toolbox: [['hammer', 4], ['saw', 3], ['nails', 6], ['tape', 3], ['bolts', 3], ['crowbar', 1], ['wires', 2], ['wrench', 1.5], ['spark_plugs', 0.6]],
  parts_shelf: [['tire', 1.5], ['battery', 1.2], ['brakes', 2], ['headlight', 2], ['spark_plugs', 3], ['engine_parts', 1.2], ['wrench', 0.6], ['gas_can', 0.8], ['scrap', 1.2]],
  toolbench: [['wrench', 3], ['jack', 2], ['tape', 2], ['scrap', 3], ['spark_plugs', 1.5], ['gas_can', 1], ['bolts', 2], ['wires', 1], ['engine_parts', 0.4]],
  tire_rack: [['tire', 6]],
  lumber: [['planks', 8], ['log', 2], ['nails', 3]],
  // Civilian storage crates: hunting and work gear, no military hardware.
  crate: [['mag_sks', 1], ['ammo_12g', 4], ['ammo_762', 2], ['ammo_9x18', 2], ['mp133', 1], ['sks', 0.4], ['scope_6x', 0.2], ['sight_reddot', 0.3],
    ['crowbar', 1.5], ['axe', 1], ['bp_scav', 1], ['bolts', 3], ['tape', 2], ['wires', 2], ['battery', 0.6], ['planks', 1], ['nails', 2]],
  // --- medical ---
  pillshelf: [['painkillers', 5], ['vitamins', 5], ['bandage', 4], ['antibiotics', 2.5], ['ai2', 2], ['salewa', 0.4], ['morphine', 0.3], ['antiviral', 0.25]],
  medcab: [['antibiotics', 3], ['morphine', 2], ['salewa', 1.5], ['surgical', 0.8], ['bandage', 3], ['ai2', 3], ['antiviral', 0.6], ['ledx', 0.15]],
  surgical: [['surgical', 3], ['salewa', 2], ['morphine', 2], ['bandage', 2], ['ledx', 0.3]],
  // --- office ---
  desk: [['paper', 5], ['office', 4], ['coffee', 3], ['flashdrive', 0.7], ['folder', 0.4], ['laptop', 0.4], ['crackers', 1.5], ['wires', 1], ['painkillers', 0.6]],
  filing: [['paper', 6], ['office', 3], ['folder', 1], ['flashdrive', 0.4], ['tape', 1]],
  server: [['hdd', 4], ['wires', 3], ['gpu', 1], ['flashdrive', 1], ['mil_cable', 0.2]],
  safe: [['chain', 3], ['roler', 2], ['folder', 2.5], ['flashdrive', 2], ['ledx', 0.3], ['gpu', 0.6]],
  // --- stores ---
  foodshelf: [['beans', 5], ['crackers', 4], ['chips', 5], ['rice', 3], ['soda', 4], ['water', 4], ['coffee', 2]],
  toolshelf: [['hammer', 3], ['saw', 2.5], ['nails', 6], ['tape', 4], ['bolts', 4], ['wires', 3], ['planks', 2], ['axe', 0.8], ['crowbar', 1]],
  // --- police ---
  policelocker: [['pm', 1.5], ['mag_pm', 3], ['ammo_9x18', 4], ['ammo_12g', 1.5], ['mp133', 0.5], ['armor_paca', 0.6], ['helmet_ssh', 0.4], ['bandage', 2], ['supp_pm', 0.25]],
  evidence: [['chain', 2], ['roler', 1], ['flashdrive', 1], ['gpu', 0.5], ['knife', 2], ['ammo_9x18', 2], ['pm', 0.6]],
  // --- military ---
  milcrate: [['ak74', 0.9], ['sks', 0.5], ['mag_ak30', 4], ['mag_ak45', 0.7], ['ammo_545', 4], ['ammo_762', 1.5], ['scope_pso', 0.5], ['sight_reddot', 0.6], ['sight_holo', 0.4],
    ['supp_rifle', 0.3], ['brake_ak', 0.6], ['grip_vert', 0.6], ['armor_6b13', 0.35], ['helmet_6b47', 0.35]],
  ammobox: [['ammo_545', 6], ['ammo_762', 3], ['ammo_12g', 2], ['ammo_9x18', 2], ['mag_ak30', 1.5]],
  duffel: [['mre', 4], ['water', 2], ['bandage', 2], ['ai2', 2], ['morphine', 0.6], ['mil_battery', 0.25], ['mil_cable', 0.8], ['bp_mil', 0.3], ['armor_6b13', 0.15], ['helmet_6b47', 0.2]],
  soldier: [['dogtag', 6], ['ammo_545', 3], ['mag_ak30', 2], ['mre', 1.5], ['bandage', 1.5], ['morphine', 0.4], ['mil_cable', 0.3]],
  kitchen: [['beans', 4], ['rice', 3], ['crackers', 3], ['coffee', 3], ['chips', 2], ['knife', 1.5], ['water', 1.5], ['soda', 1], ['tape', 0.6], ['painkillers', 0.4]],
  wardrobe: [['bp_scav', 1.2], ['bp_tri', 0.25], ['tape', 1], ['bandage', 1], ['chain', 0.6], ['roler', 0.25], ['helmet_ssh', 0.15], ['armor_paca', 0.08], ['wires', 0.6], ['crowbar', 0.3]],
  nightstand: [['painkillers', 3], ['vitamins', 2], ['coffee', 1], ['chain', 1], ['roler', 0.4], ['ammo_9x18', 1], ['pm', 0.25], ['bandage', 1], ['flashdrive', 0.3]],
  dresser: [['tape', 1], ['bandage', 1.5], ['chain', 0.8], ['roler', 0.3], ['wires', 1], ['paper', 1], ['hdd', 0.3]],
  bathroom: [['painkillers', 4], ['bandage', 4], ['vitamins', 3], ['antibiotics', 1], ['ai2', 1], ['morphine', 0.15]],
  register: [['chain', 0.6], ['roler', 0.2], ['flashdrive', 0.3], ['paper', 2], ['office', 1]],
  drinkfridge: [['soda', 6], ['water', 6], ['coffee', 2]],
  medbox: [['bandage', 5], ['ai2', 5], ['salewa', 2], ['painkillers', 3], ['antiviral', 0.8], ['ledx', 0.25]],
  pc: [['gpu', 0.8], ['wires', 4], ['battery', 0.5], ['chain', 0.8]],
  trunk: [['jack', 1.5], ['tire', 1], ['gas_can', 1.5], ['bolts', 2], ['tape', 3], ['water', 2], ['ammo_12g', 2], ['bp_tri', 0.3], ['armor_6b13', 0.15], ['crowbar', 1], ['wrench', 0.8]],
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
  pc: { name: 'Computer Desk', w: 4, h: 3, rolls: [0, 2], color: 0x222222, size: [1.2, 0.78, 0.6] },
  toolbox: { name: 'Toolbox', w: 4, h: 3, rolls: [1, 3], color: 0xaa3322, size: [0.7, 0.35, 0.35] },
  lumber: { name: 'Lumber Pile', w: 6, h: 4, rolls: [2, 4], color: 0x9a7a4a, size: [1.6, 0.5, 0.8] },
  trunk: { name: 'Car Trunk', w: 6, h: 4, rolls: [0, 3], color: 0x000000, size: [0, 0, 0] },
  body: { name: 'Corpse', w: 5, h: 4, rolls: [1, 3], color: 0x000000, size: [0, 0, 0] },
  soldier: { name: 'Dead Soldier', w: 5, h: 4, rolls: [1, 3], color: 0x000000, size: [0, 0, 0] },
  pillshelf: { name: 'Pharmacy Shelf', w: 5, h: 4, rolls: [2, 5], color: 0xe8ece8, size: [1.6, 1.6, 0.45] },
  medcab: { name: 'Medicine Cabinet', w: 4, h: 4, rolls: [1, 3], color: 0xdde4e8, size: [0.9, 1.8, 0.45] },
  surgical: { name: 'Surgical Cart', w: 4, h: 3, rolls: [1, 2], color: 0x8ab0a8, size: [0.8, 0.95, 0.5] },
  desk: { name: 'Desk', w: 4, h: 3, rolls: [0, 3], color: 0x6a5240, size: [1.4, 0.75, 0.7] },
  filing: { name: 'Filing Cabinet', w: 3, h: 4, rolls: [0, 3], color: 0x7a7e82, size: [0.5, 1.3, 0.6] },
  server: { name: 'Server Rack', w: 4, h: 5, rolls: [1, 3], color: 0x1e1e24, size: [0.7, 2.0, 0.9] },
  safe: { name: 'Safe', w: 3, h: 3, rolls: [1, 3], color: 0x3a3e3a, size: [0.7, 0.8, 0.7] },
  foodshelf: { name: 'Store Shelf', w: 5, h: 4, rolls: [2, 5], color: 0xb8b0a0, size: [1.6, 1.5, 0.5] },
  toolshelf: { name: 'Tool Rack', w: 5, h: 4, rolls: [2, 4], color: 0x8a6a3a, size: [1.6, 1.8, 0.5] },
  policelocker: { name: 'Police Locker', w: 4, h: 5, rolls: [1, 3], color: 0x3a4a6a, size: [0.6, 1.8, 0.5] },
  evidence: { name: 'Evidence Locker', w: 4, h: 4, rolls: [1, 3], color: 0x5a5a6a, size: [0.9, 1.6, 0.5] },
  milcrate: { name: 'Military Crate', w: 6, h: 4, rolls: [2, 4], color: 0x3a4a2a, size: [1.3, 0.6, 0.7] },
  ammobox: { name: 'Ammo Box', w: 4, h: 3, rolls: [1, 3], color: 0x4a5a30, size: [0.6, 0.35, 0.35] },
  duffel: { name: 'Military Duffel Bag', w: 5, h: 4, rolls: [1, 3], color: 0x4a5a3a, size: [0.9, 0.4, 0.4] },
  // Home furniture
  kitchen: { name: 'Kitchen Cupboard', w: 4, h: 3, rolls: [0, 3], color: 0xe8e4dc, size: [0.9, 0.92, 0.6] },
  wardrobe: { name: 'Wardrobe', w: 5, h: 5, rolls: [0, 3], color: 0x6a4a30, size: [1.2, 2.0, 0.6] },
  nightstand: { name: 'Nightstand', w: 3, h: 2, rolls: [0, 2], color: 0x6a4a30, size: [0.48, 0.6, 0.42] },
  dresser: { name: 'Dresser', w: 4, h: 3, rolls: [0, 3], color: 0x6a4a30, size: [1.2, 0.92, 0.5] },
  bathroom: { name: 'Bathroom Cabinet', w: 3, h: 3, rolls: [1, 3], color: 0xe8e8e4, size: [0.6, 0.6, 0.16], wall: true },
  // Shops
  register: { name: 'Cash Register', w: 3, h: 2, rolls: [0, 2], color: 0x2a2a2a, size: [0.4, 0.3, 0.35], wall: true },
  parts_shelf: { name: 'Parts Shelf', w: 5, h: 5, rolls: [2, 4], color: 0x3a4a6a, size: [1.6, 1.9, 0.55] },
  toolbench: { name: 'Workbench', w: 5, h: 4, rolls: [2, 4], color: 0x6a5a3a, size: [1.8, 0.95, 0.7] },
  tire_rack: { name: 'Tire Rack', w: 6, h: 6, rolls: [1, 3], color: 0x2a2a2a, size: [1.4, 1.2, 0.6] },
  drinkfridge: { name: 'Drinks Fridge', w: 4, h: 4, rolls: [2, 5], color: 0xb02a2a, size: [0.85, 1.95, 0.7] },
};
