// Character creation: name, profession and skill points (Project Zomboid style).
import { ITEMS, makeItem } from './items.js';
import { makeGrid, addItem } from './inventory.js';

export const STATS = {
  strength: { name: 'Strength', desc: 'Melee damage, less stamina per swing' },
  fitness: { name: 'Fitness', desc: 'Sprint speed, stamina drain and recovery' },
  agility: { name: 'Agility', desc: 'Faster on your feet: walking and sprinting speed, higher and cheaper jumps. Rises as you sprint, jump, vault and climb' },
  dexterity: { name: 'Dexterity', desc: 'Quicker to start, stop and turn; strafe and back off faster; nimble stance changes and vaults. Rises as you dodge, strafe and move crouched' },
  aiming: { name: 'Aiming', desc: 'Steadier aim, less recoil, faster reloads' },
  guns: { name: 'Guns', desc: 'Hip-fire accuracy: at 8, hip fire is as accurate as aiming. Rises as you shoot' },
  carpentry: { name: 'Carpentry', desc: 'Unlocks doors and beds (2), sturdier builds' },
  stealth: { name: 'Stealth', desc: 'Quieter footsteps, harder for zombies to spot' },
  firstaid: { name: 'First Aid', desc: 'Medkits heal more' },
  farming: { name: 'Farming', desc: 'Faster, hardier crops and bigger harvests. Rises as you farm' },
};
export const MAX_SKILL = 8;
const MAX_BUY = 5;
const BASE_POINTS = 6;

export const PROFESSIONS = {
  unemployed: { name: 'Unemployed', desc: 'No training, but plenty of free points.', points: 8, bonus: {}, kit: ['knife'] },
  police: { name: 'Police Officer', desc: 'Sidearm and steady hands.', points: 0, bonus: { aiming: 2, fitness: 1, guns: 1 }, kit: [['pm', { loaded: 8 }], ['mag_pm', { rounds: 8 }], ['ammo_9x18', { count: 16 }], 'bandage'] },
  fire: { name: 'Fire Officer', desc: 'Strong, fit, carries an axe.', points: 0, bonus: { strength: 1, fitness: 2, agility: 1 }, kit: ['axe'] },
  carpenter: { name: 'Carpenter', desc: 'Builds from day one. Toolbag included.', points: 1, bonus: { carpentry: 3 }, kit: ['hammer', 'bp_scav', ['planks', { count: 8 }], ['nails', { count: 40 }], 'saw'] },
  nurse: { name: 'Nurse', desc: 'Patches people up. Brought supplies.', points: 1, bonus: { firstaid: 3 }, kit: ['knife', 'ai2', 'bandage', 'bandage', 'painkillers'] },
  burglar: { name: 'Burglar', desc: 'Quiet on their feet. Crowbar in hand.', points: 0, bonus: { stealth: 3, dexterity: 1 }, kit: ['crowbar'] },
  farmer: { name: 'Farmer', desc: 'Grows food from dirt. Seeds, a shovel and a can.', points: 0, bonus: { farming: 3, strength: 1 }, kit: ['shovel', 'bp_scav', ['watering_can', { water: 10 }], ['seeds_potato', { count: 4 }], ['seeds_carrot', { count: 4 }], 'apple'] },
  veteran: { name: 'Veteran', desc: 'Seen worse. Brought a shotgun.', points: -2, bonus: { aiming: 3, strength: 1, guns: 2 }, kit: [['mp133', { loaded: 6 }], ['ammo_12g', { count: 8 }], 'knife'] },
};

// The gun you bring in on the helicopter (loaded, two spare magazines and a
// little loose ammo), or nothing
export const INSERT_GUNS = {
  ak74: { kit: [['ak74', { loaded: 30 }], ['mag_ak30', { rounds: 30 }], ['mag_ak30', { rounds: 30 }], ['ammo_545', { count: 30 }]] },
  m4a1: { kit: [['m4a1', { loaded: 30 }], ['mag_stanag', { rounds: 30 }], ['mag_stanag', { rounds: 30 }], ['ammo_556', { count: 30 }]] },
  sks: { kit: [['sks', { loaded: 10 }], ['mag_sks', { rounds: 10 }], ['mag_sks', { rounds: 10 }], ['ammo_762', { count: 20 }]] },
  mp5: { kit: [['mp5', { loaded: 30 }], ['mag_mp5', { rounds: 30 }], ['ammo_9x19', { count: 30 }]] },
  mp133: { kit: [['mp133', { loaded: 6 }], ['ammo_12g', { count: 16 }]] },
  pm: { kit: [['pm', { loaded: 8 }], ['mag_pm', { rounds: 8 }], ['mag_pm', { rounds: 8 }], ['ammo_9x18', { count: 16 }]] },
  none: { kit: [], name: 'Nothing', desc: 'Travel light: just your profession\'s kit' },
};

const FIRST = ['Kate', 'Bob', 'Marcus', 'Elena', 'Dmitri', 'Jo', 'Sam', 'Alex', 'Nadia', 'Victor', 'Ruth', 'Leon', 'Ivy', 'Pavel', 'Grace', 'Theo'];
const LAST = ['Smith', 'Petrov', 'Hale', 'Moreno', 'Kowalski', 'Reyes', 'Novak', 'Grant', 'Volkov', 'Baker', 'Lindqvist', 'Okafor', 'Price', 'Doyle'];
export const randomName = () => `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`;

const SLOT_FOR_TYPE = { weapon: 'weapon', melee: 'melee', armor: 'armor', helmet: 'helmet', backpack: 'backpack', clothing: 'clothing', rig: 'rig' };

export function makeCharacter(name, profKey, bought, gun = 'none') {
  const prof = PROFESSIONS[profKey];
  const stats = {};
  for (const k in STATS) stats[k] = Math.min(MAX_SKILL, (prof.bonus[k] || 0) + (bought[k] || 0));
  const ch = {
    name, profession: profKey, professionName: prof.name, stats,
    equip: { weapon: null, melee: null, armor: null, helmet: null, backpack: null, clothing: null, rig: null },
    pockets: makeGrid(4, 2),
    daysSurvived: 0, kills: 0,
  };
  // (the chosen gun first, so it takes the weapon slot)
  const kit = [...(INSERT_GUNS[gun]?.kit || []), ...prof.kit, 'water', 'crackers', 'hoodie'];
  // Backpacks and clothing with pockets first so later items have room.
  kit.sort((a, b) => (b === 'bp_scav' || b === 'hoodie') - (a === 'bp_scav' || a === 'hoodie'));
  for (const entry of kit) {
    const [key, opts] = Array.isArray(entry) ? entry : [entry, {}];
    const it = makeItem(key, opts);
    const slot = SLOT_FOR_TYPE[ITEMS[key].type];
    if (slot && !ch.equip[slot]) { ch.equip[slot] = it; continue; }
    if (addItem(ch.pockets, it)) continue;
    if ([ch.equip.rig, ch.equip.clothing].some((c) => c?.grids?.some((g) => addItem(g, it)))) continue;
    if (ch.equip.backpack) addItem(ch.equip.backpack.grid, it);
  }
  return ch;
}

// Wires up the creation screen. Calls onDone(character) when the player spawns.
export function setupCreation(onDone) {
  const $ = (id) => document.getElementById(id);
  let prof = 'unemployed', gun = 'ak74';
  const bought = Object.fromEntries(Object.keys(STATS).map((k) => [k, 0]));
  $('cc-name').value = randomName();
  $('cc-random').onclick = () => { $('cc-name').value = randomName(); };

  const pool = () => BASE_POINTS + PROFESSIONS[prof].points;
  const spent = () => Object.values(bought).reduce((a, b) => a + b, 0);

  function render() {
    $('cc-profs').innerHTML = '';
    for (const [k, p] of Object.entries(PROFESSIONS)) {
      const b = document.createElement('button');
      b.className = 'prof' + (k === prof ? ' sel' : '');
      const bonus = Object.entries(p.bonus).map(([s, n]) => `${STATS[s].name} +${n}`).join(', ');
      const pts = p.points ? ` · ${p.points > 0 ? '+' : ''}${p.points} points` : '';
      b.innerHTML = `${p.name}<small>${p.desc}${bonus ? ' · ' + bonus : ''}${pts}</small>`;
      b.onclick = () => {
        prof = k;
        // Refund points if the new profession has a smaller pool.
        for (const s in bought) while (spent() > pool() && bought[s] > 0) bought[s]--;
        render();
      };
      $('cc-profs').appendChild(b);
    }
    const left = pool() - spent();
    $('cc-points').textContent = `— ${left} point${left === 1 ? '' : 's'} left`;
    $('cc-stats').innerHTML = '';
    for (const [k, st] of Object.entries(STATS)) {
      const base = PROFESSIONS[prof].bonus[k] || 0;
      const row = document.createElement('div');
      row.className = 'stat';
      let pips = '';
      for (let i = 0; i < MAX_SKILL; i++) pips += `<i class="${i < base ? 'b' : i < base + bought[k] ? 'on' : ''}"></i>`;
      row.innerHTML = `<span>${st.name}</span><button data-d="-1">−</button><span class="pips">${pips}</span><button data-d="1">+</button><span class="stat-desc">${st.desc}</span>`;
      row.querySelectorAll('button').forEach((btn) => {
        btn.onclick = () => {
          const d = +btn.dataset.d;
          if (d > 0 && (left <= 0 || bought[k] >= MAX_BUY || base + bought[k] >= MAX_SKILL)) return;
          if (d < 0 && bought[k] <= 0) return;
          bought[k] += d;
          render();
        };
      });
      $('cc-stats').appendChild(row);
    }
    $('cc-guns').innerHTML = '';
    for (const [k, gdef] of Object.entries(INSERT_GUNS)) {
      const b = document.createElement('button');
      b.className = 'prof gun' + (k === gun ? ' sel' : '');
      const it = ITEMS[gdef.kit[0]?.[0]];
      b.innerHTML = `${gdef.name || it.name}<small>${gdef.desc || gdef.kit.slice(1).map(([key, o]) => ITEMS[key].short + (o.count ? ' ×' + o.count : '')).join(', ')}</small>`;
      b.onclick = () => { gun = k; render(); };
      $('cc-guns').appendChild(b);
    }
    const kit = [...(INSERT_GUNS[gun]?.kit || []), ...PROFESSIONS[prof].kit, 'water', 'crackers', 'hoodie'].map((e) => {
      const [key, opts] = Array.isArray(e) ? e : [e, {}];
      return ITEMS[key].name + (opts.count ? ` ×${opts.count}` : '');
    });
    $('cc-kit').textContent = kit.join(', ');
  }
  render();

  $('cc-start').onclick = () => {
    const name = $('cc-name').value.trim() || randomName();
    onDone(makeCharacter(name, prof, bought, gun));
  };
  return { reset() { prof = 'unemployed'; gun = 'ak74'; for (const k in bought) bought[k] = 0; $('cc-name').value = randomName(); render(); } };
}
