// First-person player: movement, mouselook, weapons (hitscan + melee),
// Tarkov-style body-part health, hunger/thirst, bleeding and infection.
import * as THREE from 'three';
import { moveCircle, segBox } from './collision.js';
import { ITEMS } from './items.js';
import { countAmmo, takeAmmo } from './inventory.js';
import { sfx } from './audio.js';

export const PARTS = {
  head: { name: 'Head', max: 35, vital: true },
  thorax: { name: 'Thorax', max: 85, vital: true },
  stomach: { name: 'Stomach', max: 70 },
  armL: { name: 'L. Arm', max: 60 },
  armR: { name: 'R. Arm', max: 60 },
  legL: { name: 'L. Leg', max: 65 },
  legR: { name: 'R. Leg', max: 65 },
};
const HIT_WEIGHTS = [['head', 0.08], ['thorax', 0.3], ['stomach', 0.15], ['armL', 0.14], ['armR', 0.14], ['legL', 0.095], ['legR', 0.095]];

export class Player {
  constructor(camera, scene, game) {
    this.camera = camera;
    this.scene = scene;
    this.game = game;
    this.pos = new THREE.Vector3();
    this.radius = 0.3;
    this.yaw = 0; this.pitch = 0;
    this.eye = 1.65;
    this.vy = 0; this.y = 0;
    this.stamina = 100;
    this.fatigue = 10;
    // Character skills (0..8) from character creation.
    const st = game.profile.stats;
    this.skill = st;
    this.stealthMul = 1 - 0.07 * st.stealth;
    this.hp = {};
    for (const k in PARTS) this.hp[k] = PARTS[k].max;
    this.bleeding = new Set();
    this.food = 85; this.water = 85;
    this.infection = 0; this.infected = false;
    this.painkiller = 0;
    this.active = 'gun';
    this.fireCd = 0;
    this.reloading = 0;
    this.meleeCd = 0; this.swing = 0;
    this.recoil = 0;
    this.ads = 0;
    this.flashlight = game.isNight;
    this.crouch = false;
    this.stepDist = 0;
    this.noiseTimer = 0;
    this.dead = false;
    this.hurtFlash = 0;
    this.kills = 0;
    this.bob = 0;

    camera.rotation.order = 'YXZ';
    if (!this.weapon) this.active = 'melee';
    this.buildViewmodel();

    this.light = new THREE.SpotLight(0xfff2d8, 40, 38, 0.42, 0.45, 1.4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.3;
    // Placed past the muzzle so the cone doesn't blow out the viewmodel.
    this.light.position.set(0.15, -0.1, -0.9);
    this.light.target.position.set(0, 0, -6);
    camera.add(this.light, this.light.target);
    this.handLight = new THREE.PointLight(0xc8c0b0, 1.2, 1.5, 1);
    this.handLight.position.set(0.1, 0.2, 0);
    camera.add(this.handLight);

    this.flash = new THREE.PointLight(0xffaa55, 0, 12, 2);
    camera.add(this.flash);
    this.flash.position.set(0.2, -0.15, -1.2);
  }

  get equip() { return this.game.profile.equip; }
  get weapon() { return this.equip.weapon; }
  get melee() { return this.equip.melee; }
  ammoGrids() {
    const g = [this.game.profile.pockets];
    if (this.equip.backpack) g.push(this.equip.backpack.grid);
    return g;
  }

  // ---------- viewmodel ----------
  buildViewmodel() {
    if (this.vm) this.camera.remove(this.vm);
    const vm = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a50, roughness: 0.9 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a3020, roughness: 1 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); vm.add(b); return b; };
    const w = this.weapon, mel = this.melee;
    this.muzzle = new THREE.Vector3(0, 0, -0.6);
    if (this.active === 'gun' && w) {
      const k = w.key;
      if (k === 'pm') {
        box(0.04, 0.05, 0.2, dark, 0, 0, -0.1);
        box(0.035, 0.1, 0.05, dark, 0, -0.06, -0.02).rotation.x = 0.2;
        this.muzzle.set(0, 0, -0.22);
      } else if (k === 'mp133') {
        box(0.05, 0.05, 0.75, dark, 0, 0.01, -0.35);
        box(0.05, 0.04, 0.6, dark, 0, -0.035, -0.32);
        box(0.06, 0.06, 0.18, wood, 0, -0.035, -0.4);
        box(0.05, 0.1, 0.3, wood, 0, -0.04, 0.12);
        this.muzzle.set(0, 0.01, -0.75);
      } else if (k === 'sks') {
        box(0.04, 0.04, 0.6, dark, 0, 0.02, -0.4);
        box(0.06, 0.07, 0.75, wood, 0, -0.02, -0.08);
        this.muzzle.set(0, 0.02, -0.72);
      } else {
        box(0.05, 0.07, 0.45, dark, 0, 0, -0.2);
        box(0.03, 0.03, 0.3, dark, 0, 0.015, -0.55);
        box(0.06, 0.06, 0.2, wood, 0, -0.01, -0.35);
        const mag = box(0.04, 0.16, 0.07, dark, 0, -0.1, -0.15); mag.rotation.x = 0.35;
        box(0.05, 0.08, 0.28, wood, 0, -0.03, 0.17);
        box(0.01, 0.03, 0.01, dark, 0, 0.05, -0.62);
        this.muzzle.set(0, 0.015, -0.7);
      }
      box(0.06, 0.06, 0.16, sleeve, 0.02, -0.12, 0.1);
      box(0.045, 0.05, 0.06, skin, 0, -0.07, -0.02);
      if (k !== 'pm') box(0.045, 0.045, 0.07, skin, -0.01, -0.05, -0.33);
      vm.userData.hip = new THREE.Vector3(0.17, -0.16, -0.48);
      vm.userData.ads = new THREE.Vector3(0, -0.03, k === 'pm' ? -0.42 : -0.3);
    } else {
      const mk = mel ? mel.key : null;
      if (mk === 'knife') { box(0.02, 0.03, 0.22, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }), 0, 0, -0.18); box(0.03, 0.04, 0.1, dark, 0, 0, -0.03); }
      else if (mk === 'crowbar') { box(0.03, 0.03, 0.7, new THREE.MeshStandardMaterial({ color: 0x8a1a1a, metalness: 0.5 }), 0, 0, -0.3); }
      else if (mk === 'hammer') { box(0.03, 0.03, 0.4, wood, 0, 0, -0.15); box(0.05, 0.05, 0.14, dark, 0, 0.02, -0.36).rotation.y = Math.PI / 2; }
      else if (mk === 'axe') { box(0.035, 0.035, 0.7, wood, 0, 0, -0.3); box(0.02, 0.18, 0.12, new THREE.MeshStandardMaterial({ color: 0xaa2222, metalness: 0.4 }), 0, 0.06, -0.62); }
      box(0.06, 0.06, 0.16, sleeve, 0, -0.03, 0.14);
      box(0.045, 0.05, 0.06, skin, 0, 0, 0.03);
      vm.userData.hip = new THREE.Vector3(0.22, -0.22, -0.5);
      vm.userData.ads = vm.userData.hip;
    }
    vm.position.copy(vm.userData.hip);
    vm.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; } });
    this.vm = vm;
    this.camera.add(vm);
  }

  // ---------- input-driven update ----------
  update(dt, input) {
    if (this.dead) return;
    const g = this.game;
    const hash = g.world.hash;

    // Look
    this.yaw -= input.mdx * 0.0022 * (this.ads > 0.5 ? 0.6 : 1);
    this.pitch -= input.mdy * 0.0022 * (this.ads > 0.5 ? 0.6 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // Movement state
    const legsBroken = (this.hp.legL <= 0 || this.hp.legR <= 0) && this.painkiller <= 0;
    this.crouch = input.crouch;
    const wantSprint = input.sprint && input.f && !this.crouch && this.stamina > 1 && !legsBroken;
    const aiming = input.aim && this.active === 'gun' && !wantSprint;
    this.ads += ((aiming ? 1 : 0) - this.ads) * Math.min(1, dt * 12);
    let speed = this.crouch ? 1.5 : wantSprint ? 6.2 * (1 + 0.03 * this.skill.fitness) : 3.4;
    if (this.fatigue > 80) speed *= 0.88;
    if (this.ads > 0.5) speed *= 0.55;
    if (legsBroken) speed *= 0.55;
    if (this.reloading > 0) speed *= 0.8;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let mx = (input.f - input.b) * fx + (input.r - input.l) * rx;
    let mz = (input.f - input.b) * fz + (input.r - input.l) * rz;
    const ml = Math.hypot(mx, mz);
    const moving = ml > 0.01;
    if (moving) {
      mx /= ml; mz /= ml;
      const bx = this.pos.x, bz = this.pos.z;
      moveCircle(hash, this.pos, this.radius, mx * speed * dt, mz * speed * dt);
      const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
      this.stepDist += moved;
      this.bob += moved * (wantSprint ? 2.2 : 2.6);
      const stride = wantSprint ? 1.6 : 1.3;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        if (!this.crouch) sfx.step(wantSprint ? 0.14 : 0.08);
      }
    }
    const fit = this.skill.fitness;
    if (wantSprint && moving) this.stamina = Math.max(0, this.stamina - 14 * (1 - 0.08 * fit) * dt);
    else this.stamina = Math.min(100, this.stamina + (moving ? 7 : 14) * (1 + 0.1 * fit) * (this.fatigue >= 100 ? 0.5 : 1) * dt);

    // Footstep noise draws zombies
    this.noiseTimer -= dt;
    if (moving && this.noiseTimer <= 0) {
      this.noiseTimer = 0.5;
      const r = (this.crouch ? 1.5 : wantSprint ? 13 : 5) * (1 - 0.1 * this.skill.stealth);
      g.zombies.noise(this.pos.x, this.pos.z, r);
    }

    // Camera
    const targetEye = this.crouch ? 1.05 : 1.65;
    this.eye += (targetEye - this.eye) * Math.min(1, dt * 10);
    const bobAmt = moving ? (wantSprint ? 0.06 : 0.035) * (1 - this.ads * 0.8) : 0;
    this.camera.position.set(this.pos.x, this.eye + Math.abs(Math.sin(this.bob)) * bobAmt, this.pos.z);
    this.recoil *= Math.exp(-dt * 10);
    this.camera.rotation.set(this.pitch + this.recoil * 0.05, this.yaw, Math.sin(this.bob * 0.5) * bobAmt * 0.3);
    const zoom = this.weapon?.key === 'sks' ? 38 : 50;
    this.camera.fov = 75 + (zoom - 75) * this.ads;
    this.camera.updateProjectionMatrix();

    // Viewmodel sway / ADS / recoil / swing
    const vm = this.vm;
    const hip = vm.userData.hip, adsP = vm.userData.ads;
    vm.position.lerpVectors(hip, adsP, this.ads);
    vm.position.x += Math.sin(this.bob * 0.5) * bobAmt * 0.4;
    vm.position.y += Math.abs(Math.cos(this.bob * 0.5)) * bobAmt * 0.3 - (wantSprint && moving ? 0.08 : 0);
    vm.position.z += this.recoil * 0.06;
    vm.rotation.set(this.recoil * 0.12 + (wantSprint && moving ? -0.3 : 0), wantSprint && moving ? 0.5 : 0, 0);
    if (this.reloading > 0) { vm.rotation.x -= 0.5; vm.position.y -= 0.08; }
    if (this.swing > 0) {
      const s = this.swing;
      vm.rotation.set(-0.6 + (1 - s) * 1.6, 0.6 - (1 - s) * 1.2, -0.4);
      this.swing = Math.max(0, this.swing - dt * 4);
    }

    // Weapons
    this.fireCd -= dt; this.meleeCd -= dt;
    if (input.swap) { this.active = this.active === 'gun' ? 'melee' : 'gun'; this.buildViewmodel(); }
    if (input.slot1 && this.active !== 'gun') { this.active = 'gun'; this.buildViewmodel(); }
    if (input.slot2 && this.active !== 'melee') { this.active = 'melee'; this.buildViewmodel(); }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }
    if (input.reload && this.active === 'gun') this.startReload();
    if (this.active === 'gun' && this.weapon) {
      const def = ITEMS[this.weapon.key];
      const trig = def.auto ? input.fire : input.firePressed;
      if (trig && this.fireCd <= 0 && this.reloading <= 0 && !(wantSprint && moving)) this.shoot(def, moving);
    } else if (input.firePressed && this.meleeCd <= 0) {
      this.meleeAttack();
    }
    if (input.flashlight) this.flashlight = !this.flashlight;
    this.light.intensity = this.flashlight ? 40 : 0;
    this.flash.intensity *= Math.exp(-dt * 40);

    this.updateBody(dt);
  }

  // ---------- combat ----------
  aimDir(spread) {
    const d = new THREE.Vector3(0, 0, -1);
    const e = new THREE.Euler(this.pitch + (Math.random() - 0.5) * spread, this.yaw + (Math.random() - 0.5) * spread, 0, 'YXZ');
    return d.applyEuler(e);
  }

  shoot(def, moving) {
    const w = this.weapon;
    if (w.loaded <= 0) { sfx.dry(); this.fireCd = 0.25; return; }
    w.loaded -= 1;
    this.fireCd = 60 / def.rpm;
    sfx.shot(w.key);
    this.flash.intensity = 30;
    this.recoil += def.pellets > 1 ? 1.6 : def.auto ? 0.45 : 0.9;
    this.pitch += (def.pellets > 1 ? 0.035 : def.auto ? 0.012 : 0.02) * (1 - this.ads * 0.4) * (1 - 0.06 * this.skill.aiming);
    this.yaw += (Math.random() - 0.5) * 0.01;
    const armsBroken = (this.hp.armL <= 0 || this.hp.armR <= 0) && this.painkiller <= 0;
    let spread = def.spread * (1 - this.ads * 0.85) * (1 - 0.08 * this.skill.aiming) + (moving ? 0.03 : 0) + (armsBroken ? 0.06 : 0) + (this.fatigue > 80 ? 0.02 : 0);
    if (def.pellets > 1) spread = Math.max(spread, def.spread * 0.6);
    const origin = this.camera.position.clone();
    for (let p = 0; p < def.pellets; p++) {
      const dir = this.aimDir(spread);
      this.fireRay(origin, dir, def);
    }
    this.game.zombies.noise(this.pos.x, this.pos.z, def.noise);
    this.game.hud.ammoChanged = true;
  }

  fireRay(origin, dir, def) {
    const maxD = 120;
    const end = origin.clone().addScaledVector(dir, maxD);
    // World hit: walls (full height) or low obstacles if the ray is low enough.
    const hash = this.game.world.hash;
    const boxes = hash.query(Math.min(origin.x, end.x), Math.min(origin.z, end.z), Math.max(origin.x, end.x), Math.max(origin.z, end.z), []);
    let tw = 1;
    for (const b of boxes) {
      if (!b.blocksShot) continue;
      const t = segBox(origin.x, origin.z, end.x, end.z, b);
      if (t < 0 || t >= tw) continue;
      const y = origin.y + dir.y * t * maxD;
      if (y > (b.h ?? 3)) continue;
      tw = t;
    }
    let wallD = tw * maxD;
    if (dir.y < 0) wallD = Math.min(wallD, -origin.y / dir.y);
    const z = this.game.zombies.raycast(origin, dir, wallD);
    if (z) {
      const falloff = z.t > def.range ? Math.max(0.3, 1 - (z.t - def.range) / def.range) : 1;
      const dmg = def.damage * falloff * (z.head ? 3 : 1);
      const point = origin.clone().addScaledVector(dir, z.t);
      this.game.fx.blood(point);
      sfx.hitFlesh();
      this.game.hud.hitmarker(z.head);
      if (this.game.zombies.damage(z.zb, dmg, this.pos.x, this.pos.z)) this.onKill();
    } else if (wallD < maxD) {
      this.game.fx.impact(origin.clone().addScaledVector(dir, wallD - 0.02));
    }
  }

  meleeAttack() {
    const def = this.melee ? ITEMS[this.melee.key] : { damage: 12, range: 1.2, rate: 0.5 };
    if (this.stamina < 5) return;
    this.stamina -= 8 * (1 - 0.08 * this.skill.strength);
    this.meleeCd = def.rate;
    this.swing = 1;
    sfx.swing();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let hit = false;
    for (const zb of [...this.game.zombies.list]) {
      const dx = zb.pos.x - this.pos.x, dz = zb.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.range + zb.radius) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.6) continue;
      const head = this.pitch > -0.15 && Math.random() < 0.35;
      const dmg = def.damage * (head ? 1.8 : 1) * (1 + 0.12 * this.skill.strength);
      this.game.fx.blood(new THREE.Vector3(zb.pos.x, head ? 1.6 : 1.2, zb.pos.z));
      if (this.game.zombies.damage(zb, dmg, this.pos.x, this.pos.z)) this.onKill();
      hit = true;
      if (!this.melee || this.melee.key !== 'axe') break; // axes cleave
    }
    if (hit) sfx.hitFlesh();
    else this.game.meleeWorld?.(this.melee?.key);
    this.game.zombies.noise(this.pos.x, this.pos.z, 3);
  }

  onKill() { this.kills++; this.game.hud.message('Kill confirmed'); }

  startReload() {
    const w = this.weapon;
    if (!w || this.reloading > 0) return;
    const def = ITEMS[w.key];
    if (w.loaded >= def.mag) return;
    if (countAmmo(this.ammoGrids(), def.ammo) <= 0) { this.game.hud.message(`No ${ITEMS[def.ammo].name} ammo`); return; }
    this.reloading = def.reload * (1 - 0.07 * this.skill.aiming);
    sfx.reload();
    this.game.zombies.noise(this.pos.x, this.pos.z, 4);
  }

  finishReload() {
    const w = this.weapon;
    if (!w) return;
    const def = ITEMS[w.key];
    w.loaded += takeAmmo(this.ammoGrids(), def.ammo, def.mag - w.loaded);
    this.game.hud.ammoChanged = true;
  }

  // ---------- health ----------
  takeZombieHit(amount, zb) {
    if (this.dead) return;
    let r = Math.random(), part = 'thorax';
    for (const [k, wgt] of HIT_WEIGHTS) { r -= wgt; if (r <= 0) { part = k; break; } }
    // Armor
    const armor = part === 'head' ? this.equip.helmet : (part === 'thorax' || part === 'stomach') ? this.equip.armor : null;
    let bleedChance = 0.3, biteChance = 0.08;
    if (armor && armor.dur > 0) {
      const def = ITEMS[armor.key];
      amount *= 1 - def.protection * Math.min(1, armor.dur / def.durability + 0.3);
      armor.dur = Math.max(0, armor.dur - amount * 0.5);
      bleedChance *= 0.3; biteChance *= 0.2;
    }
    this.damagePart(part, amount);
    if (Math.random() < bleedChance) { this.bleeding.add(part); this.game.hud.message(`${PARTS[part].name} is bleeding`); }
    if (!this.infected && Math.random() < biteChance) {
      this.infected = true;
      this.game.hud.message('You were bitten. Find an antiviral injector.', 6);
    }
    this.hurtFlash = 1;
    sfx.hurt();
    // Shove
    const dx = this.pos.x - zb.pos.x, dz = this.pos.z - zb.pos.z, l = Math.hypot(dx, dz) || 1;
    moveCircle(this.game.world.hash, this.pos, this.radius, (dx / l) * 0.25, (dz / l) * 0.25);
  }

  damagePart(part, amount) {
    const before = this.hp[part];
    this.hp[part] = Math.max(0, before - amount);
    let overflow = amount - before;
    if (before <= 0) overflow = amount;
    if (PARTS[part].vital && this.hp[part] <= 0) return this.die(`${PARTS[part].name} destroyed`);
    if (overflow > 0) {
      // Damage to a destroyed limb spreads to the rest of the body (like Tarkov).
      const alive = Object.keys(PARTS).filter((k) => this.hp[k] > 0);
      for (const k of alive) {
        this.hp[k] = Math.max(0, this.hp[k] - (overflow * 0.7) / alive.length);
        if (PARTS[k].vital && this.hp[k] <= 0) return this.die('Blood loss');
      }
    }
  }

  updateBody(dt) {
    this.fatigue = Math.min(100, this.fatigue + dt * 0.09);
    this.food = Math.max(0, this.food - dt * 0.09);
    this.water = Math.max(0, this.water - dt * 0.13);
    if (this.food <= 0) this.damagePart('stomach', dt * 0.4);
    if (this.water <= 0) this.damagePart('thorax', dt * 0.3);
    for (const part of this.bleeding) this.damagePart(part, dt * 0.7);
    if (this.painkiller > 0) this.painkiller -= dt;
    if (this.infected) {
      this.infection += dt / 3.6; // ~6 minutes to turn
      if (this.infection >= 100) this.die('Turned into one of them');
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
  }

  use(item) {
    const def = ITEMS[item.key];
    if (def.type === 'food') {
      this.food = Math.min(100, this.food + def.food);
      this.water = Math.max(0, Math.min(100, this.water + def.water));
      return true;
    }
    if (def.type === 'med') {
      if (def.cure) {
        if (!this.infected) { this.game.hud.message('Not infected.'); return false; }
        this.infected = false; this.infection = 0;
        this.game.hud.message('Infection cured.');
        return true;
      }
      if (def.painkiller) { this.painkiller = def.painkiller; this.game.hud.message('Painkillers active'); return true; }
      let used = false;
      if (def.stopBleed && this.bleeding.size) {
        const p = this.bleeding.values().next().value;
        this.bleeding.delete(p);
        this.game.hud.message(`Stopped bleeding: ${PARTS[p].name}`);
        used = true;
      }
      if (def.heal) {
        // Heal the most damaged non-destroyed parts first.
        let pool = def.heal * (1 + 0.15 * this.skill.firstaid);
        const parts = Object.keys(PARTS).filter((k) => this.hp[k] > 0 && this.hp[k] < PARTS[k].max)
          .sort((a, b) => this.hp[a] / PARTS[a].max - this.hp[b] / PARTS[b].max);
        for (const k of parts) {
          const n = Math.min(pool, PARTS[k].max - this.hp[k]);
          this.hp[k] += n; pool -= n;
          if (pool <= 0) break;
        }
        if (pool < def.heal * (1 + 0.15 * this.skill.firstaid)) used = true;
        // Salewa-class kits also restore a destroyed limb to 1 HP.
        if (def.stopBleed) for (const k in PARTS) if (this.hp[k] <= 0 && !PARTS[k].vital) { this.hp[k] = 1; used = true; }
      }
      if (!used) this.game.hud.message('Nothing to treat.');
      return used;
    }
    return false;
  }

  // Sleeping fast-forwards needs and lets the body recover.
  sleep(hours) {
    this.fatigue = Math.max(0, this.fatigue - hours * 14);
    this.food = Math.max(0, this.food - hours * 2.5);
    this.water = Math.max(0, this.water - hours * 3.5);
    for (const k in PARTS) if (this.hp[k] > 0) this.hp[k] = Math.min(PARTS[k].max, this.hp[k] + hours * 4);
    if (this.infected) this.infection = Math.min(99, this.infection + hours * 6);
  }

  serialize() {
    return {
      x: this.pos.x, z: this.pos.z, yaw: this.yaw, hp: this.hp, bleeding: [...this.bleeding],
      food: this.food, water: this.water, fatigue: this.fatigue, stamina: this.stamina,
      infected: this.infected, infection: this.infection, painkiller: this.painkiller, kills: this.kills,
      flashlight: this.flashlight, active: this.active,
    };
  }

  restore(s) {
    this.pos.set(s.x, 0, s.z);
    this.yaw = s.yaw;
    Object.assign(this.hp, s.hp);
    this.bleeding = new Set(s.bleeding);
    for (const k of ['food', 'water', 'fatigue', 'stamina', 'infected', 'infection', 'painkiller', 'kills', 'flashlight', 'active']) if (s[k] !== undefined) this[k] = s[k];
    this.buildViewmodel();
  }

  die(reason) {
    if (this.dead) return;
    this.dead = true;
    this.deathReason = reason;
    this.game.onDeath(reason);
  }
}
