// Traders: survivors who moved into a small house or shop and turned it into
// a trading post (counter, shelves of goods, sandbags, a hand-painted sign).
// Each trades by barter (items for items, restocked daily) and gives quests
// that raise your reputation; reputation unlocks loyalty levels with better
// deals. The traders themselves are survivors (see survivors.js): they defend
// their post, can be hurt, and can die, which abandons the post.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, makeItem } from './items.js';
import { makeGrid, addItem, countItem, takeItem } from './inventory.js';
import { mulberry32, setDoor } from './world.js';
import { hasLOS } from './collision.js';
import { sfx } from './audio.js';

export const LL_REP = [0, 10, 25]; // reputation needed for loyalty levels 1-3
const DAY = 1440;
const $ = (id) => document.getElementById(id);
const FIRST = ['Rosa', 'Viktor', 'Mags', 'Dmitri', 'Hollis', 'June', 'Abe', 'Nadia', 'Cole', 'Ines', 'Big Lou', 'Petra', 'Sol', 'Marta'];

// ---------------------------------------------------------------------------
// Trader archetypes: what they barter and the quests they give.
// Offers: give (items you hand over) → get; ll = loyalty level required;
// stock = how many times a day. Quests unlock in order.
// ---------------------------------------------------------------------------
export const ARCH = {
  gunsmith: {
    title: 'Gunsmith', post: "{name}'s Gunworks", sign: '#5a2a1a', gun: 'ak74', shirt: 0x3a3a30, hat: 0x2a2a2a,
    bio: ['I fixed rifles for hunters before all this. Now I fix them for anyone who can pay in parts.', "Bring me bolts, tape and wire and I'll keep your gun alive."],
    greet: ['Mind the muzzle. What do you need?', "Parts for parts. That's how this works."],
    offers: [
      { id: 'g1', ll: 1, give: [['bolts', 2], ['tape', 1]], get: ['mag_ak30', 1], stock: 3 },
      { id: 'g2', ll: 1, give: [['wires', 1], ['bolts', 1]], get: ['ammo_545', 60], stock: 4 },
      { id: 'g3', ll: 1, give: [['beans', 2]], get: ['ammo_9x18', 40], stock: 4 },
      { id: 'g4', ll: 1, give: [['tape', 1], ['paper', 2]], get: ['ammo_12g', 20], stock: 3 },
      { id: 'g5', ll: 1, give: [['chain', 1]], get: ['mag_pm', 2], stock: 2 },
      { id: 'g6', ll: 2, give: [['roler', 1]], get: ['sight_reddot', 1], stock: 1 },
      { id: 'g7', ll: 2, give: [['bolts', 3], ['wires', 2]], get: ['grip_vert', 1], stock: 2 },
      { id: 'g8', ll: 2, give: [['battery', 1], ['tape', 2]], get: ['supp_pm', 1], stock: 1 },
      { id: 'g9', ll: 2, give: [['hdd', 2]], get: ['mag_sks', 2], stock: 2 },
      { id: 'g10', ll: 2, give: [['gpu', 1]], get: ['sight_holo', 1], stock: 1 },
      { id: 'g11', ll: 3, give: [['mil_battery', 1]], get: ['ak74', 1], stock: 1 },
      { id: 'g12', ll: 3, give: [['roler', 2], ['gpu', 1]], get: ['scope_pso', 1], stock: 1 },
      { id: 'g13', ll: 3, give: [['laptop', 1], ['flashdrive', 1]], get: ['supp_rifle', 1], stock: 1 },
      { id: 'g14', ll: 3, give: [['ledx', 1]], get: ['mag_ak45', 2], stock: 1 },
      // NATO hardware
      { id: 'g15', ll: 1, give: [['chain', 1], ['beans', 1]], get: ['ammo_9x19', 50], stock: 3 },
      { id: 'g16', ll: 1, give: [['bolts', 1], ['tape', 1]], get: ['mag_glock', 2], stock: 2 },
      { id: 'g17', ll: 2, give: [['wires', 2], ['bolts', 1]], get: ['ammo_556', 60], stock: 3 },
      { id: 'g18', ll: 2, give: [['bolts', 2], ['wires', 1]], get: ['mag_stanag', 2], stock: 2 },
      { id: 'g19', ll: 2, give: [['gpu', 1], ['tape', 2]], get: ['glock17', 1], stock: 1 },
      { id: 'g20', ll: 2, give: [['roler', 1], ['chain', 2]], get: ['m1911', 1], stock: 1 },
      { id: 'g21', ll: 2, give: [['tape', 1], ['paper', 1]], get: ['ammo_45', 40], stock: 2 },
      { id: 'g22', ll: 2, give: [['hdd', 2], ['wires', 2]], get: ['m870', 1], stock: 1 },
      { id: 'g23', ll: 3, give: [['laptop', 1], ['gpu', 1]], get: ['mp5', 1], stock: 1 },
      { id: 'g24', ll: 3, give: [['mil_battery', 1], ['mil_cable', 1]], get: ['m4a1', 1], stock: 1 },
      { id: 'g25', ll: 3, give: [['ledx', 1], ['roler', 1]], get: ['scope_acog', 1], stock: 1 },
      { id: 'g26', ll: 3, give: [['ledx', 1], ['mil_battery', 1]], get: ['m14', 1], stock: 1 },
      { id: 'g27', ll: 3, give: [['bolts', 3], ['gpu', 1]], get: ['ammo_762x51', 40], stock: 2 },
      { id: 'g28', ll: 3, give: [['laptop', 1], ['tape', 2]], get: ['supp_pistol', 1], stock: 1 },
      { id: 'g31', ll: 2, give: [['bolts', 2], ['tape', 1]], get: ['grenade_rgd5', 2], stock: 2 },
      { id: 'g32', ll: 2, give: [['wires', 2], ['gpu', 1]], get: ['grenade_f1', 2], stock: 2 },
      { id: 'g33', ll: 3, give: [['mil_cable', 1], ['tape', 2]], get: ['grenade_m67', 2], stock: 2 },
      { id: 'g34', ll: 2, give: [['gpu', 1], ['wires', 1]], get: ['laser_klesch', 1], stock: 1 },
      { id: 'g35', ll: 3, give: [['ledx', 1], ['mil_cable', 1]], get: ['laser_peq', 1], stock: 1 },
      { id: 'g36', ll: 3, give: [['ledx', 2], ['laptop', 1], ['mil_battery', 1]], get: ['scope_thermal', 1], stock: 1 },
      { id: 'g37', ll: 2, give: [['gpu', 2], ['wires', 2]], get: ['fpv_drone', 1], stock: 1 },
      { id: 'g38', ll: 3, give: [['mil_battery', 1], ['tape', 2]], get: ['c4', 1], stock: 2 },
      { id: 'g40', ll: 2, give: [['wires', 2], ['tape', 1]], get: ['breach_charge', 1], stock: 2 },
      { id: 'g39', ll: 3, give: [['mil_cable', 2], ['bolts', 2]], get: ['pg7v', 1], stock: 2 },
      { id: 'g29', ll: 3, give: [['ledx', 2], ['mil_battery', 2]], get: ['designator', 1], stock: 1 },
      { id: 'g30', ll: 3, give: [['laptop', 2], ['mil_cable', 3]], get: ['radio_pack', 1], stock: 1 },
    ],
    quests: [
      { id: 'gq1', title: 'Proof of Work', text: "Before I trust you with my good stock, show me you can handle yourself. Put down ten of those things.", done: 'Not bad. Come back when you need something that shoots straight.',
        obj: [{ type: 'kill', what: 'zombie', n: 10 }], reward: { rep: 6, items: [['ammo_545', 60], ['bolts', 1]] } },
      { id: 'gq2', title: 'Spare Parts', text: "I'm out of the basics. Bring me three bolts and two rolls of duct tape.", done: 'Good. That keeps the lathe turning another week.',
        obj: [{ type: 'fetch', key: 'bolts', n: 3 }, { type: 'fetch', key: 'tape', n: 2 }], reward: { rep: 5, items: [['mag_ak30', 1], ['brake_ak', 1]] } },
      { id: 'gq3', title: 'The Armory Crate', text: 'The cops boxed up a set of rifle parts before they ran. Last I heard it was still in the police station. Get it.', done: 'These are mint. You just earned yourself the good shelf.',
        obj: [{ type: 'stash', item: 'q_parts', kinds: ['police', 'military', 'warehouse'] }], reward: { rep: 8, items: [['sight_reddot', 1], ['ammo_545', 60]] } },
      { id: 'gq4', title: 'Bandit Problem', text: "Bandits have been hitting the roads and scaring off my customers. Take out three of them.", done: "Roads are quieter already. Here, you've earned this.",
        obj: [{ type: 'kill', what: 'bandit', n: 3 }], reward: { rep: 10, items: [['supp_rifle', 1]] } },
      { id: 'gq5', title: 'Dead Men in Uniform', text: "The soldiers out at the outpost turned. Their rifles are still good. Put down five of them so we can salvage the place.", done: "You're a real piece of work. Pick anything off the top shelf.",
        obj: [{ type: 'kill', what: 'soldier', n: 5 }], reward: { rep: 10, items: [['scope_pso', 1], ['mag_ak45', 1]] } },
    ],
  },
  medic: {
    title: 'Medic', post: "Doc {name}'s Clinic", sign: '#2a5a8a', gun: 'pm', shirt: 0xd8d8d0, hat: null,
    bio: ['I was a nurse at the county hospital. I stayed until there was no one left to treat.', "I'll patch you up, or sell you what you need to do it yourself."],
    greet: ['Are you bitten? No? Then come in.', "Let's see what you've brought me."],
    offers: [
      { id: 'm1', ll: 1, give: [['water', 2]], get: ['bandage', 3], stock: 4 },
      { id: 'm2', ll: 1, give: [['crackers', 2]], get: ['ai2', 1], stock: 3 },
      { id: 'm3', ll: 1, give: [['paper', 2], ['office', 1]], get: ['vitamins', 1], stock: 3 },
      { id: 'm4', ll: 1, give: [['soda', 2]], get: ['painkillers', 1], stock: 3 },
      { id: 'm5', ll: 2, give: [['tape', 1], ['bolts', 2]], get: ['salewa', 1], stock: 2 },
      { id: 'm6', ll: 2, give: [['painkillers', 3]], get: ['antibiotics', 1], stock: 2 },
      { id: 'm7', ll: 2, give: [['flashdrive', 1]], get: ['morphine', 2], stock: 1 },
      { id: 'm8', ll: 2, give: [['mre', 2]], get: ['salewa', 1], stock: 2 },
      { id: 'm9', ll: 3, give: [['ledx', 1]], get: ['antiviral', 2], stock: 1 },
      { id: 'm10', ll: 3, give: [['laptop', 1]], get: ['surgical', 1], stock: 1 },
      { id: 'm11', ll: 3, give: [['gpu', 1]], get: ['antiviral', 1], stock: 1 },
    ],
    quests: [
      { id: 'mq1', title: 'Supply Run', text: "I'm almost out of everything. Bring me two bottles of water and a pack of painkillers.", done: "You're a lifesaver. Literally, for someone.",
        obj: [{ type: 'fetch', key: 'water', n: 2 }, { type: 'fetch', key: 'painkillers', n: 1 }], reward: { rep: 5, items: [['ai2', 2], ['bandage', 2]] } },
      { id: 'mq2', title: 'Sealed Case', text: 'The hospital kept a sealed case of medicine for emergencies. If it is still there, I need it. The place is crawling, so be careful.', done: 'Still sealed. You have no idea how many people this will save.',
        obj: [{ type: 'stash', item: 'q_case', kinds: ['hospital', 'clinic', 'pharmacy'] }], reward: { rep: 8, items: [['salewa', 1], ['antibiotics', 1]] } },
      { id: 'mq3', title: 'Patient Zero', text: 'The patients who turned in the wards are spreading it. Put fifteen of them down. Any of them, really.', done: "It's grim work. Thank you for doing it.",
        obj: [{ type: 'kill', what: 'zombie', n: 15 }], reward: { rep: 6, items: [['morphine', 1], ['vitamins', 2]] } },
      { id: 'mq4', title: 'Know the Ground', text: 'I want to know if the pharmacy on the other side of town has been looted. Go and look.', done: "Good to know. I'll send people there.",
        obj: [{ type: 'scout', kinds: ['pharmacy', 'clinic'] }], reward: { rep: 5, items: [['painkillers', 2], ['coffee', 2]] } },
      { id: 'mq5', title: 'Cure', text: "The infection doesn't have to be a death sentence. Bring me a LEDX and I'll make it worth your while.", done: "With this I can test for it. Here, keep one of these on you always.",
        obj: [{ type: 'fetch', key: 'ledx', n: 1 }], reward: { rep: 12, items: [['antiviral', 2], ['surgical', 1]] } },
    ],
  },
  quartermaster: {
    title: 'Quartermaster', post: "{name}'s Trading Post", sign: '#6a5a2a', gun: 'mp133', shirt: 0x5a4a30, hat: 0x5a3a20,
    bio: ['Ran a hardware store. Now I run the only store left.', 'Food, tools, timber. Everything you need to hole up and outlast this.'],
    greet: ['Come in, come in. Wipe your boots.', 'Open for business. Always open.'],
    offers: [
      { id: 'q1', ll: 1, give: [['paper', 2]], get: ['nails', 50], stock: 4 },
      { id: 'q2', ll: 1, give: [['office', 2]], get: ['planks', 5], stock: 4 },
      { id: 'q3', ll: 1, give: [['wires', 1]], get: ['beans', 2], stock: 4 },
      { id: 'q4', ll: 1, give: [['chips', 3]], get: ['water', 1], stock: 4 },
      { id: 'q5', ll: 1, give: [['hdd', 1]], get: ['saw', 1], stock: 1 },
      { id: 'q6', ll: 1, give: [['bolts', 1]], get: ['hammer', 1], stock: 2 },
      { id: 'q7', ll: 2, give: [['chain', 1]], get: ['bp_scav', 1], stock: 1 },
      { id: 'q8', ll: 2, give: [['roler', 1]], get: ['mre', 3], stock: 2 },
      { id: 'q9', ll: 2, give: [['battery', 1]], get: ['crowbar', 1], stock: 1 },
      { id: 'q10', ll: 2, give: [['roler', 2]], get: ['helmet_ssh', 1], stock: 1 },
      { id: 'q11', ll: 3, give: [['gpu', 1], ['laptop', 1]], get: ['bp_tri', 1], stock: 1 },
      { id: 'q12', ll: 3, give: [['mil_cable', 2]], get: ['armor_paca', 1], stock: 1 },
      { id: 'q13', ll: 3, give: [['chain', 2]], get: ['axe', 1], stock: 1 },
    ],
    quests: [
      { id: 'qq1', title: 'Shelf Stocking', text: 'My shelves look sad. Two cans of beans and a bag of rice, if you can find them.', done: 'Much better. Here, take some timber for your trouble.',
        obj: [{ type: 'fetch', key: 'beans', n: 2 }, { type: 'fetch', key: 'rice', n: 1 }], reward: { rep: 5, items: [['planks', 6], ['nails', 60]] } },
      { id: 'qq2', title: 'Hardware Run', text: 'The hardware store still had a crate of my keys in the back. Long story. I want them back.', done: "My keys! Now I can open the back room again.",
        obj: [{ type: 'stash', item: 'q_keys', kinds: ['hardware', 'warehouse', 'grocery', 'shop'] }], reward: { rep: 7, items: [['saw', 1], ['bp_scav', 1]] } },
      { id: 'qq3', title: 'Clear the Streets', text: 'Customers stop coming when the street is full of the dead. Clear twenty of them out.', done: 'Business is already picking up.',
        obj: [{ type: 'kill', what: 'zombie', n: 20 }], reward: { rep: 7, items: [['mre', 2], ['water', 2]] } },
      { id: 'qq4', title: 'Fast Feet', text: "The runners scare me. They're fast and they don't stop. Kill five runners.", done: "I'll sleep a little better tonight.",
        obj: [{ type: 'kill', what: 'runner', n: 5 }], reward: { rep: 8, items: [['helmet_ssh', 1]] } },
      { id: 'qq5', title: 'Lay of the Land', text: "I need to know if the gas station's kiosk still has stock. Go take a look.", done: "Good. That's my next supply run sorted.",
        obj: [{ type: 'scout', kinds: ['gas', 'grocery'] }], reward: { rep: 5, items: [['chips', 3], ['soda', 2]] } },
    ],
  },
  fixer: {
    title: 'Fixer', post: "{name}'s Exchange", sign: '#3a3a5a', gun: 'sks', shirt: 0x2a2a3a, hat: 0x111111,
    bio: ['I know people. Well, I knew people. Now I know where their things ended up.', "Intel, electronics, gear that doesn't come cheap. If it's valuable, I deal in it."],
    greet: ['Close the door behind you.', "Ah. You look like someone with something to sell."],
    offers: [
      { id: 'f1', ll: 1, give: [['dogtag', 2]], get: ['chain', 1], stock: 2 },
      { id: 'f2', ll: 1, give: [['paper', 4], ['office', 2]], get: ['hdd', 1], stock: 2 },
      { id: 'f3', ll: 1, give: [['hdd', 2]], get: ['flashdrive', 1], stock: 2 },
      { id: 'f4', ll: 1, give: [['coffee', 3]], get: ['wires', 1], stock: 3 },
      { id: 'f5', ll: 2, give: [['folder', 1]], get: ['armor_6b13', 1], stock: 1 },
      { id: 'f6', ll: 2, give: [['flashdrive', 2]], get: ['helmet_6b47', 1], stock: 1 },
      { id: 'f7', ll: 2, give: [['laptop', 1]], get: ['roler', 1], stock: 2 },
      { id: 'f8', ll: 2, give: [['chain', 2]], get: ['gpu', 1], stock: 1 },
      { id: 'f9', ll: 3, give: [['mil_battery', 2]], get: ['bp_mil', 1], stock: 1 },
      { id: 'f10', ll: 3, give: [['folder', 2]], get: ['scope_6x', 1], stock: 1 },
      { id: 'f11', ll: 3, give: [['gpu', 2]], get: ['ledx', 1], stock: 1 },
    ],
    quests: [
      { id: 'fq1', title: 'The Ledger', text: "A smuggler I worked with kept a ledger of who owes what. He died in one of the office blocks. Bring it to me, unread.", done: 'Unread? Good. I believe you. Mostly.',
        obj: [{ type: 'stash', item: 'q_ledger', kinds: ['office', 'skyscraper'] }], reward: { rep: 7, items: [['roler', 1], ['flashdrive', 1]] } },
      { id: 'fq2', title: 'Data Harvest', text: 'Drives are worth more than gold now. Bring me two hard drives and a flash drive.', done: "There's a lot of secrets on these. Pleasure doing business.",
        obj: [{ type: 'fetch', key: 'hdd', n: 2 }, { type: 'fetch', key: 'flashdrive', n: 1 }], reward: { rep: 6, items: [['laptop', 1]] } },
      { id: 'fq3', title: 'Debt Collection', text: "Some of the bandits out there owe me. They won't be paying, so I'll settle for them not breathing. Two of them.", done: 'Accounts settled.',
        obj: [{ type: 'kill', what: 'bandit', n: 2 }], reward: { rep: 8, items: [['chain', 2], ['dogtag', 2]] } },
      { id: 'fq4', title: 'Lost Signal', text: "The army left a field radio at one of their posts. With it I can listen to what's left of the world. Go get it.", done: "Static, mostly. But not only static. That's something.",
        obj: [{ type: 'stash', item: 'q_radio', kinds: ['military', 'police'] }], reward: { rep: 10, items: [['armor_6b13', 1]] } },
      { id: 'fq5', title: 'Recon', text: 'Go look at the tower downtown. I want to know if anyone has been up there.', done: "Interesting. Very interesting.",
        obj: [{ type: 'scout', kinds: ['skyscraper', 'office'] }], reward: { rep: 5, items: [['folder', 1]] } },
    ],
  },
};
const ARCH_KEYS = Object.keys(ARCH);

const objLabel = (o) => ({
  kill: () => `Kill ${o.n} ${{ zombie: 'zombies', soldier: 'soldier zombies', runner: 'runners', bandit: 'hostile survivors' }[o.what]}`,
  fetch: () => `Hand over ${o.n}× ${ITEMS[o.key].name}`,
  stash: () => `Find the ${ITEMS[o.item].name}`,
  scout: () => 'Scout the marked building',
}[o.type]());

const tile = (key, n, cls = '') => {
  const d = ITEMS[key];
  return `<div class="tr-item ${cls}" style="--c:${d.color}" title="${d.name}"><b>${d.short}</b>${n > 1 ? `<i>×${n}</i>` : ''}</div>`;
};

export class Traders {
  // saved: the traders' saved state, or null to set up new trading posts
  constructor(game, saved) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.list = saved ? saved.map((t) => ({ ...t })) : this.choosePosts();
    for (const t of this.list) this.buildPost(t);
    this.open = null;
    this.tab = 'barter';
    this.checkT = 0;
    this.trackerT = 0;
  }

  // ---------- generation ----------
  // Small houses, shops and gas stations near the middle of town, spread apart,
  // never the player's safehouse or the house they woke up in.
  choosePosts() {
    const g = this.game, W = this.world;
    const rng = mulberry32((g.save.seed ^ 0x7ad3e1) >>> 0);
    const sh = g.safehouse, pp = g.player.pos;
    const cands = W.buildings.filter((b) => {
      if (b.area || !['house', 'shop', 'gas'].includes(b.kind)) return false;
      if ((b.x1 - b.x0) * (b.z1 - b.z0) > 210) return false;
      if (sh && b.x0 < sh.x1 && b.x1 > sh.x0 && b.z0 < sh.z1 && b.z1 > sh.z0) return false;
      return !(pp.x > b.x0 - 2 && pp.x < b.x1 + 2 && pp.z > b.z0 - 2 && pp.z < b.z1 + 2);
    });
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const n = 4 + (rng() < 0.5 ? 1 : 0);
    const picked = [];
    for (const b of cands) {
      if (picked.length >= n) break;
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      if (picked.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < 55)) continue;
      const spot = this.findSpot(b);
      if (spot) picked.push({ b, cx, cz, spot });
    }
    const archs = [...ARCH_KEYS];
    return picked.map(({ b, spot }, i) => {
      const arch = archs[i] || ARCH_KEYS[Math.floor(rng() * ARCH_KEYS.length)];
      const first = FIRST[Math.floor(rng() * FIRST.length)];
      return {
        id: `t${i}`, b: b.index, arch, name: first, rep: 0, dead: false, discovered: false,
        spot, quests: {}, stock: {},
        hp: 250, skin: [0xd8b090, 0xc09070, 0x8a6040, 0x6a4a30][Math.floor(rng() * 4)],
      };
    });
  }

  // Where the counter goes: open floor a few metres in from the front door,
  // in sight of it, clear of furniture. Returns { x, z, nx, nz, door }.
  findSpot(b) {
    const W = this.world;
    const outer = b.doors.filter((d) => Math.abs(d.x - b.x0) < 0.3 || Math.abs(d.x - b.x1) < 0.3 || Math.abs(d.z - b.z0) < 0.3 || Math.abs(d.z - b.z1) < 0.3);
    const tmp = [];
    const clear = (x, z, r) => {
      if (x - r < b.x0 + 0.2 || x + r > b.x1 - 0.2 || z - r < b.z0 + 0.2 || z + r > b.z1 - 0.2) return false;
      for (const box of W.hash.query(x - r, z - r, x + r, z + r, tmp)) {
        if (box.minX < x + r && box.maxX > x - r && box.minZ < z + r && box.maxZ > z - r) return false;
      }
      if (b.doors.some((d) => Math.hypot(d.x - x, d.z - z) < r + 1.3)) return false;
      if (W.containers.some((c) => Math.hypot(c.x - x, c.z - z) < r + 0.7)) return false;
      if (W.beds.some((c) => Math.hypot(c.x - x, c.z - z) < r + 1.2)) return false;
      return true;
    };
    for (const door of outer) {
      // Inward normal of the wall the door is in
      const nx = Math.abs(door.x - b.x0) < 0.3 ? 1 : Math.abs(door.x - b.x1) < 0.3 ? -1 : 0;
      const nz = nx ? 0 : Math.abs(door.z - b.z0) < 0.3 ? 1 : -1;
      const fx = door.x + nx * 3.4, fz = door.z + nz * 3.4;
      let best = null, bd = Infinity;
      for (let x = b.x0 + 1; x < b.x1 - 1; x += 0.4) {
        for (let z = b.z0 + 1; z < b.z1 - 1; z += 0.4) {
          const d = Math.hypot(x - fx, z - fz);
          if (d > bd || d > 5) continue;
          // Trader's spot, the counter in front of it, the customer's spot
          if (!clear(x, z, 0.5) || !clear(x - nx * 0.9, z - nz * 0.9, 0.55) || !clear(x - nx * 1.9, z - nz * 1.9, 0.4)) continue;
          if (!hasLOS(W.hash, x, z, door.x + nx * 0.6, door.z + nz * 0.6)) continue;
          bd = d; best = { x: +x.toFixed(2), z: +z.toFixed(2), nx, nz, door: { x: door.x, z: door.z } };
        }
      }
      if (best) return best;
    }
    return null;
  }

  // The renovation: counter and stock, shelves, crates, a rug, sandbags and a
  // generator outside, and a hand-painted sign over the door.
  buildPost(t) {
    const W = this.world, A = ARCH[t.arch], b = W.buildings[t.b], s = t.spot;
    t.def = A;
    t.title = A.post.replace('{name}', t.name);
    if (!b || !s) return;
    t.building = b;
    const g = new THREE.Group();
    const mats = new Map();
    const mat = (c, emissive) => {
      const k = c + (emissive ? 'e' : '');
      if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...(emissive ? { emissive: c, emissiveIntensity: 1.4 } : {}) }));
      return mats.get(k);
    };
    // Box in post-local axes: u = along the counter, v = toward the back (into the building)
    const ux = -s.nz, uz = s.nx, vx = s.nx, vz = s.nz;
    const rotY = Math.atan2(-uz, ux); // local +x along u
    const box = (w, h, d, c, u, y, v, ox = s.x, oz = s.z, emissive = false) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, emissive));
      m.position.set(ox + ux * u + vx * v, y, oz + uz * u + vz * v);
      m.rotation.y = rotY;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const collide = (u, v, hw, hd, h, ox = s.x, oz = s.z) => {
      const cx = ox + ux * u + vx * v, cz = oz + uz * u + vz * v;
      const ex = Math.abs(ux) * hw + Math.abs(vx) * hd, ez = Math.abs(uz) * hw + Math.abs(vz) * hd;
      W.addBox(cx - ex, cz - ez, cx + ex, cz + ez, { blocksSight: false, h });
    };
    const free = (x, z, r) => {
      for (const bx of W.hash.query(x - r, z - r, x + r, z + r, [])) if (bx.minX < x + r && bx.maxX > x - r && bx.minZ < z + r && bx.maxZ > z - r) return false;
      return !W.containers.some((c) => Math.hypot(c.x - x, c.z - z) < r + 0.5);
    };
    // Counter (between the trader and the door)
    box(2.2, 0.95, 0.55, 0x6a4a2a, 0, 0.5, -0.9);
    box(2.35, 0.06, 0.68, 0x8a6a40, 0, 1.0, -0.9);
    collide(0, -0.9, 1.15, 0.32, 1.0);
    // Goods on the counter: cans, an ammo box, a lantern
    const goods = [0x9a6a3a, 0xaa3a3a, 0x3a7aaa, 0xb09a5a, 0x5a6a3a];
    for (let i = 0; i < 5; i++) box(0.09, 0.13, 0.09, goods[i], -0.9 + i * 0.16, 1.1, -0.95);
    box(0.32, 0.16, 0.18, 0x4a5a3a, 0.35, 1.11, -0.88);
    box(0.13, 0.22, 0.13, 0x222222, 0.9, 1.14, -0.95);
    box(0.08, 0.12, 0.08, 0xffc860, 0.9, 1.14, -0.95, s.x, s.z, true);
    // Hanging bulb over the counter
    box(0.02, 0.5, 0.02, 0x111111, 0, 2.6, -0.6);
    box(0.12, 0.14, 0.12, 0xffe0a0, 0, 2.3, -0.6, s.x, s.z, true);
    // Rug where customers stand
    box(1.8, 0.02, 1.3, [0x6a2a2a, 0x2a3a5a, 0x5a4a2a][t.id.charCodeAt(1) % 3], 0, 0.075, -2.0);
    // Shelves of stock behind the trader, if there is room
    const shx = s.x + vx * 1.15, shz = s.z + vz * 1.15;
    if (free(shx, shz, 0.5)) {
      box(1.8, 0.05, 0.42, 0x5a4030, 0, 0.04, 1.15);
      for (const y of [0.45, 1.0, 1.55]) box(1.8, 0.04, 0.42, 0x6a4a30, 0, y, 1.15);
      for (const u of [-0.88, 0.88]) box(0.05, 1.9, 0.42, 0x4a3020, u, 0.95, 1.15);
      let k = 0;
      for (const y of [0.45, 1.0, 1.55]) for (let u = -0.7; u <= 0.7; u += 0.28) { k++; if ((k * 7 + t.b) % 5 === 0) continue; const c = goods[(k + t.b) % goods.length]; box(0.18, 0.2 + ((k * 13) % 3) * 0.05, 0.22, c, u, y + 0.13, 1.15); }
      collide(0, 1.15, 0.92, 0.22, 1.9);
    }
    // Crates at the ends of the counter
    for (const side of [-1, 1]) {
      const u = side * 1.75, cx = s.x + ux * u - vx * 0.4, cz = s.z + uz * u - vz * 0.4;
      if (!free(cx, cz, 0.4)) continue;
      box(0.65, 0.6, 0.65, 0x7a5a30, u, 0.3, -0.4);
      box(0.5, 0.45, 0.5, 0x6a5028, u + side * 0.04, 0.83, -0.4);
      collide(u, -0.4, 0.33, 0.33, 1.05);
    }
    // Outside the front door
    const d = s.door;
    const ox = d.x - s.nx * 0.55, oz = d.z - s.nz * 0.55;
    for (const side of [-1, 1]) {
      const u = side * 1.75, cx = ox + ux * u - vx * 0.7, cz = oz + uz * u - vz * 0.7;
      if (!free(cx, cz, 0.6)) continue;
      for (let i = 0; i < 3; i++) box(1.3, 0.28, 0.5, 0x8a7a50, u, 0.14 + i * 0.27, -0.7, ox, oz);
      collide(u, -0.7, 0.65, 0.25, 0.85, ox, oz);
    }
    const gx = ox + ux * 2.9 - vx * 1.6, gz = oz + uz * 2.9 - vz * 1.6;
    if (free(gx, gz, 0.6)) {
      box(0.9, 0.65, 0.6, 0x3a4a2a, 2.9, 0.33, -1.6, ox, oz);
      box(0.08, 0.08, 0.02, 0xff3a2a, 2.65, 0.55, -1.9, ox, oz, true);
      box(0.12, 0.4, 0.12, 0x222222, 3.2, 0.85, -1.6, ox, oz); // exhaust
      collide(2.9, -1.6, 0.45, 0.3, 0.7, ox, oz);
    }
    // Merge everything into a few meshes
    const byMat = new Map();
    g.updateMatrixWorld(true);
    g.traverse((o) => { if (!o.isMesh) return; if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld)); o.geometry.dispose(); });
    for (const [m, geos] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(geos), m); mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh); }
    // Hand-painted sign above the door, outside
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const x = c.getContext('2d');
    x.fillStyle = '#b8a888'; x.fillRect(0, 0, 512, 112);
    for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#a89878' : '#c0b090'; x.fillRect(0, i * 28, 512, 27); }
    x.fillStyle = A.sign; x.font = 'bold 44px Georgia, serif'; x.textAlign = 'center';
    x.fillText(t.title.toUpperCase(), 256, 54, 490);
    x.font = 'bold 22px monospace'; x.fillStyle = '#3a2a1a';
    x.fillText(`${A.title.toUpperCase()} · BARTER · WORK`, 256, 92);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.62), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    sign.position.set(d.x - s.nx * 0.2, 2.62, d.z - s.nz * 0.2);
    sign.lookAt(d.x - s.nx * 5, 2.62, d.z - s.nz * 5);
    this.group.add(sign);
    // Open for business: the front door stays open.
    const door = W.doors.find((dr) => Math.hypot(dr.x - d.x, dr.z - d.z) < 0.05);
    if (door && !door.broken) setDoor(door, true);
    this.game.zombies?.updateNavRegion(b.x0, b.z0, b.x1, b.z1);
    // The building's own cupboards are the trader's now.
    for (const ct of W.containers) if (ct.x > b.x0 && ct.x < b.x1 && ct.z > b.z0 && ct.z < b.z1) ct.owner = t;
  }

  // Trader NPCs (survivors that hold their post) and zombie clean-up.
  spawnNPCs() {
    const g = this.game;
    for (const t of this.list) {
      if (!t.building) continue;
      const b = t.building;
      g.zombies.noSpawn.push({ x0: b.x0 - 8, x1: b.x1 + 8, z0: b.z0 - 8, z1: b.z1 + 8 });
      for (const zb of [...g.zombies.list]) if (zb.pos.x > b.x0 && zb.pos.x < b.x1 && zb.pos.z > b.z0 && zb.pos.z < b.z1) { g.scene.remove(zb.mesh); g.zombies.list.splice(g.zombies.list.indexOf(zb), 1); }
      if (t.dead) continue;
      const A = t.def;
      const inv = makeGrid(6, 5);
      for (const o of A.offers.slice(0, 3)) addItem(inv, makeItem(o.get[0], ITEMS[o.get[0]].stack ? { count: o.get[1] } : {}));
      const gun = ITEMS[A.gun];
      t.npc = g.survivors.addNPC({
        id: t.id, name: t.name, persona: 'gruff', disp: 'friendly', trust: 40, met: t.discovered, hp: t.hp, maxHp: 250,
        x: t.spot.x, z: t.spot.z, dir: Math.atan2(-t.spot.nx, -t.spot.nz),
        weapon: makeItem(A.gun, { loaded: gun.tube || ITEMS[gun.magKey].cap }), reserve: 300, melee: 'knife', inv,
        look: { shirt: A.shirt, pants: 0x2a2a2a, skin: t.skin, hair: 0x2a1a10, hat: A.hat, pack: 0x3a3a2a },
        order: null, skill: 0.95,
      });
      t.npc.trader = t;
      t.npc.home = { x: t.spot.x, z: t.spot.z, dir: Math.atan2(-t.spot.nx, -t.spot.nz) };
    }
  }

  // ---------- state ----------
  ll(t) { return t.rep >= LL_REP[2] ? 3 : t.rep >= LL_REP[1] ? 2 : 1; }
  grids() { return this.game.player.ammoGrids(); }
  day() { return Math.floor(this.game.time / DAY); }
  stockLeft(t, o) { const st = t.stock[o.id]; return st && st.day === this.day() ? st.left : o.stock; }
  bio(s) { const A = s.trader.def; return A.bio[Math.floor(Math.random() * A.bio.length)]; }
  greet(s) { const A = s.trader.def; return A.greet[Math.floor(Math.random() * A.greet.length)]; }
  // Containers in a trader's post are theirs while they're alive.
  isPrivate(c) { return c.owner && !c.owner.dead; }

  questState(t, q) {
    const st = t.quests[q.id];
    if (st) return st.st;
    const i = t.def.quests.indexOf(q);
    if (i > 0 && t.quests[t.def.quests[i - 1].id]?.st !== 'done') return 'locked';
    return 'available';
  }

  // Progress of each objective: [have, need]
  progress(t, q) {
    const st = t.quests[q.id];
    return q.obj.map((o, i) => {
      if (o.type === 'kill') return [Math.min(o.n, st?.prog?.[i] || 0), o.n];
      if (o.type === 'fetch') return [Math.min(o.n, countItem(this.grids(), o.key)), o.n];
      if (o.type === 'stash') return [countItem(this.grids(), o.item) > 0 ? 1 : 0, 1];
      if (o.type === 'scout') return [st?.prog?.[i] ? 1 : 0, 1];
      return [0, 1];
    });
  }

  accept(t, q) {
    const st = { st: 'active', prog: q.obj.map(() => 0), targets: [] };
    q.obj.forEach((o, i) => {
      if (o.type === 'stash') st.targets[i] = this.placeStash(o, t);
      if (o.type === 'scout') st.targets[i] = this.pickBuilding(o.kinds, t, 60);
    });
    t.quests[q.id] = st;
    this.game.progress?.event('trade');
    sfx.pickup();
    this.game.hud.message(`Quest accepted: ${q.title}`, 4);
  }

  // A building of one of these kinds, preferring ones far enough to be a trip.
  pickBuilding(kinds, t, minDist = 0) {
    const W = this.world, b0 = t.building;
    const cx0 = (b0.x0 + b0.x1) / 2, cz0 = (b0.z0 + b0.z1) / 2;
    for (const k of kinds) {
      const bs = W.buildings.filter((b) => b.kind === k && b !== b0);
      if (!bs.length) continue;
      const far = bs.filter((b) => Math.hypot((b.x0 + b.x1) / 2 - cx0, (b.z0 + b.z1) / 2 - cz0) >= minDist);
      const pool = far.length ? far : bs;
      const b = pool[Math.floor(Math.random() * pool.length)];
      return { b: b.index, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, name: b.name || k };
    }
    const b = W.buildings.find((x) => x.kind !== 'house' && x !== b0) || W.buildings[0];
    return { b: b.index, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
  }

  // Put the quest item in a cupboard inside a target building (marked on the map).
  placeStash(o, t) {
    const W = this.world;
    for (let tries = 0; tries < 6; tries++) {
      const tgt = this.pickBuilding(o.kinds, t, 40);
      const b = W.buildings[tgt.b];
      const inside = (c) => c.x > b.x0 - 0.5 && c.x < b.x1 + 0.5 && c.z > b.z0 - 0.5 && c.z < b.z1 + 0.5;
      const cts = W.containers.slice(0, W.generatedContainers).map((c, i) => [c, i]).filter(([c]) => c.mesh && !c.owner && inside(c));
      if (!cts.length) continue;
      const [c, ci] = cts[Math.floor(Math.random() * cts.length)];
      const it = makeItem(o.item);
      if (!addItem(c.grid, it)) { c.grid.h += 2; addItem(c.grid, it); }
      return { ci, x: c.x, z: c.z };
    }
    // No cupboards anywhere suitable: leave it on the floor of any building.
    const tgt = this.pickBuilding(o.kinds, t, 40);
    this.game.addExtraContainer({ type: 'drop', name: ITEMS[o.item].name, x: tgt.x, z: tgt.z, grid: (() => { const gr = makeGrid(3, 3); addItem(gr, makeItem(o.item)); return gr; })() });
    return { x: tgt.x, z: tgt.z };
  }

  turnIn(t, q) {
    const pr = this.progress(t, q);
    if (!pr.every(([h, n]) => h >= n)) return;
    const grids = this.grids();
    for (const o of q.obj) {
      if (o.type === 'fetch') takeItem(grids, o.key, o.n);
      if (o.type === 'stash') takeItem(grids, o.item, 1);
    }
    t.quests[q.id].st = 'done';
    t.rep += q.reward.rep;
    for (const [key, n] of q.reward.items) this.give(key, n);
    sfx.extract();
    this.game.hud.message(`Quest complete: ${q.title}. +${q.reward.rep} reputation with ${t.name}.`, 5);
    t.npc?.say(q.done);
    this.lastSay = q.done;
  }

  abandon(t, q) { delete t.quests[q.id]; this.game.hud.message(`Quest abandoned: ${q.title}`, 3); }

  // Hand an item to the player (into pockets/backpack, or at their feet).
  give(key, n) {
    const def = ITEMS[key];
    const items = def.stack ? [makeItem(key, { count: n })] : Array.from({ length: n }, () => makeItem(key, def.type === 'weapon' ? { loaded: 0 } : {}));
    for (const it of items) if (!this.grids().some((gr) => addItem(gr, it))) this.game.dropItem(it);
  }

  barter(t, o) {
    if (this.ll(t) < o.ll || this.stockLeft(t, o) <= 0) return;
    const grids = this.grids();
    if (!o.give.every(([k, n]) => countItem(grids, k) >= n)) return;
    for (const [k, n] of o.give) takeItem(grids, k, n);
    this.give(o.get[0], o.get[1]);
    t.stock[o.id] = { day: this.day(), left: this.stockLeft(t, o) - 1 };
    t.rep = +(t.rep + 0.4).toFixed(1);
    this.game.progress?.event('trade');
    sfx.pickup();
    this.lastSay = ['Pleasure doing business.', 'Fair trade.', 'Deal.', 'Take care of it.'][Math.floor(Math.random() * 4)];
  }

  // ---------- events ----------
  onKill(target) {
    const what = target?.kind === 'survivor' ? (target.disp === 'hostile' && !target.betrayed && !target.trader ? 'bandit' : null) : target?.def ? 'zombie' : null;
    if (!what) return;
    for (const t of this.list) {
      if (t.dead) continue;
      for (const q of t.def.quests) {
        const st = t.quests[q.id];
        if (st?.st !== 'active') continue;
        q.obj.forEach((o, i) => {
          if (o.type !== 'kill' || st.prog[i] >= o.n) return;
          const match = o.what === what || (what === 'zombie' && o.what === target.type);
          if (!match) return;
          st.prog[i]++;
          this.game.hud.message(`${q.title}: ${st.prog[i]}/${o.n}`, 2.5);
        });
      }
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      for (const t of this.list) {
        if (!t.building) continue;
        const cx = (t.building.x0 + t.building.x1) / 2, cz = (t.building.z0 + t.building.z1) / 2;
        if (!t.discovered && Math.hypot(p.pos.x - cx, p.pos.z - cz) < 22) {
          t.discovered = true;
          g.hud.message(`You found ${t.title}.`, 4);
        }
        if (t.npc) {
          t.hp = Math.round(t.npc.hp);
          if (t.npc.dead) {
            t.dead = true; t.npc = null;
            if (this.open === t) this.close();
            g.hud.message(`${t.name} the ${t.def.title.toLowerCase()} is dead. The post is abandoned.`, 5);
          }
        }
        // Scouting objectives: standing inside the target building
        for (const q of t.def.quests) {
          const st = t.quests[q.id];
          if (st?.st !== 'active') continue;
          q.obj.forEach((o, i) => {
            if (o.type !== 'scout' || st.prog[i]) return;
            const b = this.world.buildings[st.targets[i]?.b];
            if (b && p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1) { st.prog[i] = 1; g.hud.message(`${q.title}: area scouted. Report back to ${t.name}.`, 4); }
          });
        }
      }
    }
    this.trackerT -= dt;
    if (this.trackerT <= 0) { this.trackerT = 0.5; this.drawTracker(); }
    if (this.open && this.dirty) { this.dirty = false; this.render(); }
  }

  // Active quests listed on the HUD
  drawTracker() {
    const el = $('questlog');
    const rows = [];
    for (const t of this.list) {
      if (t.dead) continue;
      for (const q of t.def.quests) {
        if (t.quests[q.id]?.st !== 'active') continue;
        const pr = this.progress(t, q);
        const done = pr.every(([h, n]) => h >= n);
        rows.push(`<div class="ql ${done ? 'done' : ''}"><b>${q.title}</b> <span class="dim">· ${t.name}</span>${done ? '<div>Return to ' + t.name + '</div>' : q.obj.map((o, i) => `<div>${objLabel(o)} <span>${pr[i][0]}/${pr[i][1]}</span></div>`).join('')}</div>`);
      }
    }
    const html = rows.join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // Map: known trading posts and quest targets
  mapMarkers() {
    const out = [];
    for (const t of this.list) {
      if (!t.building) continue;
      if (t.discovered) out.push({ kind: 'trader', x: t.spot.x, z: t.spot.z, name: t.title, dead: t.dead });
      for (const q of t.def.quests) {
        const st = t.quests[q.id];
        if (st?.st !== 'active') continue;
        q.obj.forEach((o, i) => {
          const tg = st.targets?.[i];
          if (!tg) return;
          if (o.type === 'stash' && countItem(this.grids(), o.item) > 0) return;
          if (o.type === 'scout' && st.prog[i]) return;
          out.push({ kind: 'quest', x: tg.x, z: tg.z, name: q.title });
        });
      }
    }
    return out;
  }

  // A survivor's rumor can point you at a trading post you haven't found.
  rumor() {
    const t = this.list.find((x) => !x.discovered && !x.dead && x.building);
    if (!t) return null;
    t.discovered = true;
    return `There's a ${t.def.title.toLowerCase()} called ${t.name} who set up shop in a ${t.building.kind}. Barters fair. I'll mark it on your map.`;
  }

  // ---------- UI ----------
  openFor(s, tab = 'barter') {
    const g = this.game;
    this.open = s.trader;
    this.tab = tab;
    this.lastSay = this.greet(s);
    g.traderOpen = true;
    g.input.unlock();
    $('trader').style.display = 'flex';
    this.render();
    g.updatePause();
  }

  close() {
    const g = this.game;
    if (!g.traderOpen) return;
    g.traderOpen = false;
    this.open = null;
    $('trader').style.display = 'none';
    g.resume();
    g.updatePause();
  }

  render() {
    const t = this.open;
    if (!t) return;
    const el = $('trader'), A = t.def, ll = this.ll(t), grids = this.grids();
    const next = LL_REP[ll] ?? null;
    const repBar = next != null ? `${t.rep.toFixed(1)} / ${next} to LL${ll + 1}` : `${t.rep.toFixed(1)} · max loyalty`;
    let body = '';
    if (this.tab === 'barter') {
      body = A.offers.map((o) => {
        const locked = ll < o.ll, left = this.stockLeft(t, o);
        const have = o.give.map(([k, n]) => countItem(grids, k) >= n);
        const ok = !locked && left > 0 && have.every(Boolean);
        return `<div class="tr-row ${locked ? 'locked' : ''}">
          <div class="tr-give">${o.give.map(([k, n], i) => tile(k, n, have[i] ? 'have' : 'miss') + `<small class="${have[i] ? 'ok' : 'no'}">${countItem(grids, k)}/${n}</small>`).join('')}</div>
          <div class="tr-arrow">→</div>
          <div class="tr-get">${tile(o.get[0], o.get[1])}<span class="tr-name">${ITEMS[o.get[0]].name}${o.get[1] > 1 ? ` ×${o.get[1]}` : ''}</span></div>
          <div class="tr-act">${locked ? `<span class="tr-ll">LL${o.ll}</span>` : left <= 0 ? '<span class="dim">Sold out today</span>' : `<button data-o="${o.id}" ${ok ? '' : 'disabled'}>Trade</button><small class="dim">${left} left</small>`}</div>
        </div>`;
      }).join('');
    } else {
      body = A.quests.map((q) => {
        const st = this.questState(t, q);
        if (st === 'locked') return `<div class="tr-quest locked"><b>???</b><div class="dim">Finish ${t.name}'s earlier jobs first.</div></div>`;
        const pr = this.progress(t, q);
        const ready = st === 'active' && pr.every(([h, n]) => h >= n);
        const objs = q.obj.map((o, i) => `<div class="obj ${pr[i][0] >= pr[i][1] || st === 'done' ? 'ok' : ''}">${objLabel(o)} <span>${st === 'done' ? '✔' : st === 'active' ? `${pr[i][0]}/${pr[i][1]}` : ''}</span></div>`).join('');
        const reward = `<div class="tr-reward"><span class="dim">Reward:</span> +${q.reward.rep} rep ${q.reward.items.map(([k, n]) => tile(k, n)).join('')}</div>`;
        const btn = st === 'available' ? `<button data-q="${q.id}" data-a="accept">Accept</button>`
          : st === 'active' ? `<button data-q="${q.id}" data-a="turnin" ${ready ? '' : 'disabled'}>${q.obj.some((o) => o.type === 'fetch' || o.type === 'stash') ? 'Hand over' : 'Complete'}</button><button class="ghost" data-q="${q.id}" data-a="abandon">Abandon</button>` : '<span class="ok">Completed</span>';
        return `<div class="tr-quest ${st}"><div class="tr-qhead"><b>${q.title}</b><span class="tr-qst">${st === 'active' ? 'Active' : st === 'done' ? 'Done' : 'New'}</span></div>
          <div class="tr-qtext">"${st === 'done' ? q.done : q.text}"</div>${objs}${reward}<div class="tr-qbtn">${btn}</div></div>`;
      }).join('');
    }
    el.innerHTML = `<div class="tr-panel">
      <div class="tr-head"><div><div class="tr-title">${t.title}</div><div class="dim">${t.name} · ${A.title} · Loyalty level <b>${ll}</b> · ${repBar}</div>
        <div class="tr-repbar"><div style="width:${next != null ? Math.min(100, (t.rep / next) * 100) : 100}%"></div></div></div>
        <button class="tr-close" title="Close (Esc)">✕</button></div>
      <div class="tr-say">"${this.lastSay || ''}"</div>
      <div class="tr-tabs"><button data-tab="barter" class="${this.tab === 'barter' ? 'on' : ''}">Barter</button><button data-tab="quests" class="${this.tab === 'quests' ? 'on' : ''}">Work${this.questsReady(t) ? ' •' : ''}</button></div>
      <div class="tr-body">${body}</div>
      <div class="hint">Items come from your pockets and backpack · Esc / Tab to leave</div></div>`;
    el.querySelector('.tr-close').onclick = () => this.close();
    el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.tab; this.render(); }; });
    el.querySelectorAll('[data-o]').forEach((b) => { b.onclick = () => { this.barter(t, A.offers.find((o) => o.id === b.dataset.o)); this.render(); }; });
    el.querySelectorAll('[data-q]').forEach((b) => {
      b.onclick = () => {
        const q = A.quests.find((x) => x.id === b.dataset.q);
        if (b.dataset.a === 'accept') { this.accept(t, q); this.lastSay = q.text; }
        else if (b.dataset.a === 'turnin') this.turnIn(t, q);
        else this.abandon(t, q);
        this.render();
      };
    });
  }

  questsReady(t) { return t.def.quests.some((q) => { const st = this.questState(t, q); return st === 'available' || (st === 'active' && this.progress(t, q).every(([h, n]) => h >= n)); }); }

  serialize() {
    return this.list.map((t) => ({ id: t.id, b: t.b, arch: t.arch, name: t.name, rep: t.rep, dead: t.dead, discovered: t.discovered, spot: t.spot, quests: t.quests, stock: t.stock, hp: t.hp, skin: t.skin }));
  }

  dispose() {
    this.close();
    this.game.scene.remove(this.group);
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); } });
    $('questlog').innerHTML = '';
  }
}
