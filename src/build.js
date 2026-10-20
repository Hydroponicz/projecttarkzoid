// Project Zomboid-style carpentry: place walls, doors, barricades, crates,
// beds and campfires with planks + nails and a hammer. Built pieces are
// solid, block zombie pathing and can be bashed down by zombies.
import * as THREE from 'three';
import { segBox } from './collision.js';
import { setDoor } from './world.js';
import { makeGrid, countItem, takeItem, addItem } from './inventory.js';
import { ITEMS, makeItem } from './items.js';
import { sfx } from './audio.js';

export const BUILDABLES = [
  { type: 'wall', name: 'Wooden Wall', w: 2.0, d: 0.2, h: 2.6, cost: { planks: 3, nails: 4 }, hp: 500, skill: 0, bashable: true },
  { type: 'barricade', name: 'Barricade', w: 1.9, d: 0.25, h: 1.4, cost: { planks: 2, nails: 3 }, hp: 320, skill: 0, bashable: true },
  { type: 'door', name: 'Wooden Door', w: 2.0, d: 0.15, h: 2.3, cost: { planks: 4, nails: 4 }, hp: 380, skill: 2, bashable: true },
  { type: 'crate', name: 'Storage Crate', w: 1.0, d: 0.8, h: 0.8, cost: { planks: 3, nails: 2 }, hp: 200, skill: 0 },
  { type: 'bed', name: 'Bed', w: 1.0, d: 2.0, h: 0.55, cost: { planks: 4, nails: 4 }, hp: 200, skill: 2 },
  { type: 'campfire', name: 'Campfire', w: 0.8, d: 0.8, h: 0.3, cost: { planks: 2, nails: 0 }, hp: 100, skill: 0 },
  { type: 'rain_barrel', name: 'Rain Barrel', w: 0.9, d: 0.9, h: 1.1, cost: { planks: 3, nails: 4 }, hp: 150, skill: 1 },
  // Dug with a shovel, outdoors; farming.js owns plots once they exist
  { type: 'plot', name: 'Garden Plot', w: 2.0, d: 2.0, h: 0.15, cost: {}, hp: 0, skill: 0, tool: 'shovel' },
];
const BY_TYPE = Object.fromEntries(BUILDABLES.map((b) => [b.type, b]));

const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 });
const stone = new THREE.MeshStandardMaterial({ color: 0x666660, roughness: 1 });

function footprint(def, rot) {
  return rot ? [def.d, def.w] : [def.w, def.d];
}

export class Builder {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.sel = 0;
    this.rot = 0;
    this.structures = [];
    this.ghost = null;
    this.valid = false;
  }

  get world() { return this.game.world; }

  toggle(v = !this.active) {
    this.active = v;
    if (!v) this.clearGhost();
    else this.makeGhost();
  }

  clearGhost() {
    if (this.ghost) { this.game.scene.remove(this.ghost); this.ghost = null; }
  }

  makeGhost() {
    this.clearGhost();
    const def = BUILDABLES[this.sel];
    const m = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d),
      new THREE.MeshBasicMaterial({ color: 0x55ff55, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost = m;
    this.game.scene.add(m);
  }

  hasHammer() { return this.hasTool('hammer'); }

  hasTool(tool) {
    const p = this.game.profile;
    if (p.equip.melee && ITEMS[p.equip.melee.key].tool === tool) return true;
    return this.game.player.ammoGrids().some((g) => g.items.some((i) => ITEMS[i.key].tool === tool));
  }

  canAfford(def) {
    const grids = this.game.player.ammoGrids();
    return Object.entries(def.cost).every(([k, n]) => countItem(grids, k) >= n);
  }

  // Per-frame: position the ghost and handle place / rotate / dismantle.
  update(inp) {
    const p = this.game.player;
    for (let i = 0; i < BUILDABLES.length; i++) {
      if (this.game.input.pressed.has('Digit' + (i + 1))) { this.sel = i; this.makeGhost(); }
    }
    if (inp.reload) this.rot = this.rot ? 0 : 1;
    const def = BUILDABLES[this.sel];
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const dist = 2.2 + Math.max(def.w, def.d) / 2;
    const x = Math.round((p.pos.x + fx * dist) * 2) / 2;
    const z = Math.round((p.pos.z + fz * dist) * 2) / 2;
    this.ghost.position.set(x, def.h / 2, z);
    this.ghost.rotation.y = this.rot ? Math.PI / 2 : 0;
    const why = this.blockReason(def, x, z);
    this.valid = !why;
    this.reason = why;
    this.ghost.material.color.set(this.valid ? 0x55ff55 : 0xff4444);

    this.target = this.lookStructure();
    if (inp.firePressed) {
      if (this.valid) this.place(def, x, z, this.rot);
      else this.game.hud.message(why);
    }
    if (this.game.input.pressed.has('KeyX') && this.target) this.dismantle(this.target);
  }

  blockReason(def, x, z) {
    const free = this.game.dev?.freeBuild;
    if (!free && def.skill > this.game.player.skill.carpentry) return `Needs Carpentry ${def.skill}`;
    if (!free && !this.hasTool(def.tool || 'hammer')) return `You need a ${def.tool || 'hammer'}`;
    if (def.type === 'plot') {
      if (this.world.buildingAt(x, z)) return 'Dig plots outdoors';
      if (this.game.farming?.plotAt(x, z, 1.95)) return 'Too close to another plot';
    }
    if (!free && !this.canAfford(def)) return 'Not enough materials';
    const [w, d] = footprint(def, this.rot);
    const minX = x - w / 2 + 0.02, maxX = x + w / 2 - 0.02, minZ = z - d / 2 + 0.02, maxZ = z + d / 2 - 0.02;
    for (const b of this.world.hash.query(minX, minZ, maxX, maxZ, [])) {
      // Barricades may overlap a building's door so you can board it up.
      if (b.noCollide || b.structure?.kind === 'door') continue;
      if (minX < b.maxX && maxX > b.minX && minZ < b.maxZ && maxZ > b.minZ) return 'Blocked';
    }
    const hit = (px, pz, r) => px + r > minX && px - r < maxX && pz + r > minZ && pz - r < maxZ;
    if (hit(this.game.player.pos.x, this.game.player.pos.z, 0.35)) return 'Blocked';
    if (this.game.zombies.list.some((zb) => hit(zb.pos.x, zb.pos.z, zb.radius))) return 'Blocked';
    return null;
  }

  place(def, x, z, rot) {
    if (def.type === 'plot') {
      this.game.farming.addPlot(x, z);
      this.game.farming.gainXp(1);
      this.game.zombies.noise(x, z, 6);
      sfx.dig();
      this.game.hud.message('Dug a garden plot. Look at it and press F to plant.', 3);
      return null;
    }
    const grids = this.game.player.ammoGrids();
    if (!this.game.dev?.freeBuild) for (const [k, n] of Object.entries(def.cost)) takeItem(grids, k, n);
    const s = this.create(def.type, x, z, rot);
    this.game.progress?.event('build');
    // Hammering is loud.
    this.game.zombies.noise(x, z, 22);
    sfx.hammer();
    this.game.hud.message(`Built ${def.name}`);
    return s;
  }

  // Build the mesh + collider for a structure (also used when loading).
  create(type, x, z, rot, saved = {}) {
    const def = BY_TYPE[type];
    const [w, d] = footprint(def, rot);
    const g = new THREE.Group();
    const box = (bw, bh, bd, mat, bx, by, bz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(bx, by, bz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const s = { kind: 'built', type, name: def.name, x, z, rot, hp: saved.hp ?? def.hp, maxHp: def.hp, mesh: g };
    s.maxHp = saved.maxHp ?? Math.round(def.hp * (1 + 0.15 * (this.game.player?.skill.carpentry ?? 0)));
    if (saved.hp == null) s.hp = s.maxHp;

    if (type === 'wall') {
      for (let i = 0; i < 5; i++) box(def.w, 0.5, def.d, i % 2 ? darkWood : wood, 0, 0.27 + i * 0.52, 0);
    } else if (type === 'barricade') {
      box(0.12, def.h, 0.12, darkWood, -def.w / 2 + 0.1, def.h / 2, 0);
      box(0.12, def.h, 0.12, darkWood, def.w / 2 - 0.1, def.h / 2, 0);
      for (let i = 0; i < 3; i++) box(def.w, 0.22, 0.06, wood, 0, 0.3 + i * 0.45, 0.06).rotation.z = (i - 1) * 0.08;
    } else if (type === 'door') {
      box(0.1, def.h, def.d, darkWood, -def.w / 2 + 0.05, def.h / 2, 0);
      box(0.1, def.h, def.d, darkWood, def.w / 2 - 0.05, def.h / 2, 0);
    } else if (type === 'crate') {
      box(def.w, def.h, def.d, wood, 0, def.h / 2, 0);
      box(def.w + 0.04, 0.06, def.d + 0.04, darkWood, 0, def.h, 0);
      s.grid = saved.grid || makeGrid(6, 6);
      s.name = 'Storage Crate';
    } else if (type === 'bed') {
      box(def.w, 0.4, def.d, darkWood, 0, 0.2, 0);
      box(def.w - 0.05, 0.1, def.d - 0.3, new THREE.MeshStandardMaterial({ color: 0x7a7a6a }), 0, 0.45, 0.12);
    } else if (type === 'rain_barrel') {
      // A barrel under a funnel; fills when it rains (weather.js)
      const staves = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.95, 12), darkWood);
      staves.position.y = 0.48; staves.castShadow = true; g.add(staves);
      for (const y of [0.18, 0.78]) { const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.05, 12), stone); hoop.position.y = y; g.add(hoop); }
      const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.2, 0.2, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9, side: THREE.DoubleSide }));
      funnel.position.y = 1.02; g.add(funnel);
      s.water = saved.water ?? 0;
      s.prompt = () => `[F] Rain barrel (${s.water.toFixed(1)} / 40 L): drink, fill watering cans`;
    } else if (type === 'campfire') {
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; box(0.18, 0.14, 0.18, stone, Math.cos(a) * 0.35, 0.07, Math.sin(a) * 0.35); }
      box(0.5, 0.08, 0.08, darkWood, 0, 0.1, 0).rotation.y = 0.6;
      box(0.5, 0.08, 0.08, darkWood, 0, 0.14, 0).rotation.y = -0.6;
      const flame = box(0.2, 0.3, 0.2, new THREE.MeshBasicMaterial({ color: 0xff8833 }), 0, 0.3, 0);
      const light = new THREE.PointLight(0xff8a3a, 12, 14, 1.6);
      light.position.set(0, 0.8, 0);
      g.add(light);
      s.flame = flame; s.light = light;
    }
    g.position.set(x, 0, z);
    g.rotation.y = rot ? Math.PI / 2 : 0;
    this.world.group.add(g);

    const solid = type !== 'campfire';
    s.box = this.world.addBox(x - w / 2, z - d / 2, x + w / 2, z + d / 2, {
      h: def.h, blocksSight: type === 'wall' || type === 'door', blocksShot: type !== 'bed' && type !== 'crate', noCollide: !solid, built: s,
    });
    if (def.bashable) s.box.structure = s;
    s.box.decalParent = g;

    if (type === 'door') {
      // Panel hinged at one end, reusing the world door logic.
      const pivot = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(def.w - 0.2, def.h - 0.1, 0.07), wood);
      panel.position.set((def.w - 0.2) / 2, (def.h - 0.1) / 2, 0);
      panel.castShadow = true;
      pivot.add(panel);
      pivot.position.set(-def.w / 2 + 0.1, 0, 0);
      g.add(pivot);
      s.mesh = g; s.panel = pivot; s.baseRot = 0;
      s.door = { box: s.box, mesh: pivot, baseRot: 0 };
      s.box.door = true;
      s.box.decalParent = pivot;
      setDoor(s.door, !!saved.open);
      s.open = !!saved.open;
    }
    this.structures.push(s);
    this.game.zombies?.updateNavRegion(s.box.minX, s.box.minZ, s.box.maxX, s.box.maxZ);
    return s;
  }

  toggleDoor(s) {
    setDoor(s.door, !s.open);
    s.open = !s.open;
    this.game.zombies.updateNavRegion(s.box.minX, s.box.minZ, s.box.maxX, s.box.maxZ);
  }

  remove(s) {
    this.world.hash.remove(s.box);
    this.world.group.remove(s.mesh);
    this.structures.splice(this.structures.indexOf(s), 1);
    this.game.zombies.updateNavRegion(s.box.minX, s.box.minZ, s.box.maxX, s.box.maxZ);
  }

  dismantle(s) {
    if (s.grid && s.grid.items.length) return this.game.hud.message('Empty the crate first');
    const def = BY_TYPE[s.type];
    const refund = Math.floor(def.cost.planks / 2);
    this.remove(s);
    if (refund > 0) {
      const it = makeItem('planks', { count: refund });
      const grids = this.game.player.ammoGrids();
      if (!grids.some((g) => addItem(g, it))) this.game.dropItem(it);
    }
    this.game.zombies.noise(s.x, s.z, 15);
    sfx.hammer();
    this.game.hud.message(`Dismantled ${def.name} (+${refund} planks)`);
  }

  // Built structure the player is looking at (within 3m).
  lookStructure() {
    const cam = this.game.camera.position;
    const p = this.game.player;
    const ex = cam.x - Math.sin(p.yaw) * 3, ez = cam.z - Math.cos(p.yaw) * 3;
    let best = null, bt = 2;
    for (const s of this.structures) {
      const t = segBox(cam.x, cam.z, ex, ez, s.box);
      if (t >= 0 && t < bt) { bt = t; best = s; }
    }
    return best;
  }

  flicker(t) {
    for (const s of this.structures) {
      if (!s.light) continue;
      s.light.intensity = 10 + Math.sin(t * 13 + s.x) * 2 + Math.random() * 2;
      s.flame.scale.y = 0.8 + Math.random() * 0.5;
    }
  }

  serialize() {
    return this.structures.map((s) => ({ type: s.type, x: s.x, z: s.z, rot: s.rot, hp: Math.round(s.hp), maxHp: s.maxHp, open: s.open || undefined, grid: s.grid, water: s.water != null ? +s.water.toFixed(1) : undefined }));
  }

  restore(list) {
    for (const s of list) this.create(s.type, s.x, s.z, s.rot, s);
  }
}

export function buildCostText(def) {
  return Object.entries(def.cost).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ');
}
