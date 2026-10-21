// First-person player: movement, mouselook, weapons (hitscan + melee),
// Tarkov-style body-part health, hunger/thirst, bleeding and infection.
import { UseAnimator } from './useanim.js';
import { gainXp } from './skills.js';
import * as THREE from 'three';
import { moveCircle, segBox, raycast } from './collision.js';
import { ITEMS, itemWeight } from './items.js';
import { sfx } from './audio.js';
import { GunController, VM_LAYER } from './weapons.js';
import { vmFill, INTERIOR_LAYER } from './dynlights.js';

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

const _flashAt = new THREE.Vector3();
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
    if (st.farming == null) st.farming = 0; // characters from before farming
    if (st.guns == null) st.guns = Math.min(4, st.aiming || 0); // from before the Guns skill
    if (st.agility == null) st.agility = 0;     // from before the movement skills
    if (st.dexterity == null) st.dexterity = 0;
    this.moveXp = { agility: 0, dexterity: 0 }; // practice not yet handed to the skill
    this.dodgeCd = 0; this.stanceCd = 0;
    this.skill = st;
    this.stealthMul = 1 - 0.07 * st.stealth;
    this.hp = {};
    for (const k in PARTS) this.hp[k] = PARTS[k].max;
    this.bleeding = new Set();
    this.food = 85; this.water = 85;
    this.infection = 0; this.infected = false;
    this.painkiller = 0;
    this.active = 'gun';
    this.meleeCd = 0; this.swing = 0;
    this.ads = 0;
    this.lean = 0;
    // Movement: Tarkov-style momentum, stances and pace control.
    this.vel = new THREE.Vector3();   // horizontal velocity, m/s
    this.vy = 0; this.y = 0;          // vertical (jumping)
    this.floorY = 0;                  // height of the floor you're on (upper storeys, stairs, elevators)
    this.stance = 'stand';            // stand | crouch | prone
    this.pace = 1;                    // walk pace set with the mouse wheel (0.2..1)
    this.exhausted = false;           // sprint locked until stamina recovers
    this.weight = 0; this.weightTimer = 0;
    this.landDip = 0;
    this.breathTimer = 0;
    this.flashlight = game.isNight;
    this.crouch = false;
    this.stepDist = 0;
    this.noiseTimer = 0;
    this.dead = false;
    this.hurtFlash = 0;
    this.kills = 0;
    this.bob = 0;

    camera.rotation.order = 'YXZ';
    this.gun = new GunController(this);
    this.useAnim = new UseAnimator(this); // eating, drinking, bandaging...
    if (!this.weapon) this.active = 'melee';
    this.buildViewmodel();

    this.light = new THREE.SpotLight(0xfff2d8, 40, 38, 0.42, 0.45, 1.4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(1024, 1024);
    this.light.shadow.camera.near = 0.3;
    this.light.shadow.camera.layers.enable(INTERIOR_LAYER); // (furniture casts in the flashlight)
    this.light.castShadow = game.sun.castShadow; // (graphics setting)
    // Placed past the muzzle so the cone doesn't blow out the viewmodel.
    this.light.position.set(0.15, -0.1, -0.9);
    this.light.target.position.set(0, 0, -6);
    camera.add(this.light, this.light.target);
  }

  // The muzzle flash lights up the room (the shared flash light)
  muzzleFlash(intensity) {
    this.camera.updateMatrixWorld();
    this.game.lights.burst(this.camera.localToWorld(_flashAt.set(0.2, -0.15, -1.2)), intensity, { exp: 40 });
  }
  // The flashlight's shadow map is only drawn while it's on
  setLight(intensity) {
    this.light.intensity = intensity;
    this.light.shadow.autoUpdate = intensity > 0;
  }
  // Driving with the lights on, the flashlight is the headlights (from the
  // car's nose toward `to`); with from = null it's the flashlight again
  headlights(from, to, intensity) {
    const L = this.light;
    if (!from) {
      if (L.userData.car) { L.userData.car = false; L.position.set(0.15, -0.1, -0.9); L.target.position.set(0, 0, -6); L.angle = 0.42; L.distance = 38; }
      this.setLight(this.flashlight ? 40 : 0);
      return;
    }
    this.camera.updateMatrixWorld();
    L.userData.car = true; L.angle = 0.55; L.distance = 45;
    L.position.copy(this.camera.worldToLocal(_flashAt.copy(from)));
    L.target.position.copy(this.camera.worldToLocal(_flashAt.copy(to)));
    this.setLight(intensity);
  }

  get equip() { return this.game.profile.equip; }
  get weapon() { return this.equip.weapon; }
  get melee() { return this.equip.melee; }
  ammoGrids() {
    // Pockets, then vest pouches and jacket pockets, then the backpack
    const g = [this.game.profile.pockets];
    for (const slot of ['rig', 'clothing']) if (this.equip[slot]?.grids) g.push(...this.equip[slot].grids);
    if (this.equip.backpack) g.push(this.equip.backpack.grid);
    return g;
  }

  // ---------- viewmodel ----------
  // Firearms are handled by GunController; this builds the melee/fists view.
  buildViewmodel() {
    const gunActive = this.active === 'gun' && this.weapon;
    this.gun.setVisible(!!gunActive);
    if (gunActive) this.gun.rebuild();
    if (this.vm) this.camera.remove(this.vm);
    const vm = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 });
    const glove = new THREE.MeshStandardMaterial({ color: 0x2c2c28, roughness: 0.95 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x3a4230, roughness: 1 });
    const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); vm.add(b); return b; };
    const mk = this.melee ? this.melee.key : null;
    if (mk === 'knife') { box(0.02, 0.03, 0.22, new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 }), 0, 0, -0.18); box(0.03, 0.04, 0.1, dark, 0, 0, -0.03); }
    else if (mk === 'crowbar') { box(0.03, 0.03, 0.7, new THREE.MeshStandardMaterial({ color: 0x8a1a1a, metalness: 0.5 }), 0, 0, -0.3); }
    else if (mk === 'hammer') { box(0.03, 0.03, 0.4, wood, 0, 0, -0.15); box(0.05, 0.05, 0.14, dark, 0, 0.02, -0.36).rotation.y = Math.PI / 2; }
    else if (mk === 'axe') { box(0.035, 0.035, 0.7, wood, 0, 0, -0.3); box(0.02, 0.18, 0.12, new THREE.MeshStandardMaterial({ color: 0xaa2222, metalness: 0.4 }), 0, 0.06, -0.62); }
    box(0.07, 0.07, 0.25, sleeve, 0, -0.03, 0.17);
    box(0.045, 0.06, 0.07, glove, 0, 0, 0.03);
    vm.userData.hip = new THREE.Vector3(0.22, -0.22, -0.5);
    vm.position.copy(vm.userData.hip);
    vm.visible = !gunActive;
    vm.traverse((o) => o.layers.set(VM_LAYER));
    vmFill(vm);
    this.vm = vm;
    this.camera.add(vm);
  }

  setActive(slot) {
    if (this.game.thr?.held) { this.game.thr.cancel(true); this.active = slot; this.buildViewmodel(); return; }
    if (this.active === slot) return;
    this.active = slot;
    this.buildViewmodel();
    if (slot === 'gun' && this.weapon) this.gun.play('draw', 0.45);
  }

  // ---------- input-driven update ----------
  update(dt, input) {
    if (this.dead) return;
    const g = this.game;
    const hash = g.world.hash;
    if (this.vehicle) {
      // Driving: the vehicle moves you and the camera; no weapons in hand.
      g.vehicles.drive(dt, input);
      this.useAnim.update(dt);
      this.gun.setVisible(false);
      this.vm.visible = false;
      this.speed = 0;
      this.updateBody(dt);
      return;
    }

    // Look (slower while aiming, slower still through a magnified scope)
    const gunActive = this.active === 'gun' && this.weapon;
    this.ads = gunActive ? this.gun.ads : 0;
    const scoped = gunActive && this.gun.built?.parts.optic?.lens;
    const sens = 0.0022 * (1 - this.ads * (scoped ? 0.75 : 0.4)) * (this.sprinting ? 0.6 : 1);
    this.yaw -= input.mdx * sens;
    this.pitch -= input.mdy * sens;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));

    // ---------- movement ----------
    const legsBroken = (this.hp.legL <= 0 || this.hp.legR <= 0) && this.painkiller <= 0;
    const fit = this.skill.fitness;
    // Agility: how fast you are; Dexterity: how quickly you change what you're doing
    const kA = (this.skill.agility || 0) / 8, kD = (this.skill.dexterity || 0) / 8;
    const grounded = this.y <= 0;

    // Carried weight (refreshed a few times a second)
    this.weightTimer -= dt;
    if (this.weightTimer <= 0) { this.weightTimer = 0.5; this.weight = this.carryWeight(); }
    const kg = this.weight;
    const over = kg > 25 ? Math.min(1, (kg - 25) / 35) : 0; // 0 at 25 kg, 1 at 60 kg
    const canSprintWeight = kg < 45;

    // Stance: C toggles crouch, X toggles prone. Getting up from prone takes a moment.
    if (input.crouchToggle) this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
    if (input.prone) this.stance = this.stance === 'prone' ? 'crouch' : 'prone';
    this.stanceCd -= dt;
    if ((input.crouchToggle || input.prone) && this.stanceCd <= 0) { this.stanceCd = 2; this.practice('dexterity', 0.4); }
    // Pace (mouse wheel), like Tarkov's walk speed
    if (input.wheel) {
      this.pace = Math.max(0.2, Math.min(1, Math.round((this.pace - input.wheel * 0.1) * 10) / 10));
      g.hud.message(`Pace ${Math.round(this.pace * 100)}%`, 0.8);
    }
    this.crouch = this.stance !== 'stand';
    this.prone = this.stance === 'prone';

    const aimHeld = input.aim && gunActive;
    const fwd = input.f - input.b, side = input.r - input.l;
    if (this.stamina <= 0.5) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    const wantSprint = input.sprint && fwd > 0 && !aimHeld && !legsBroken && !this.exhausted && canSprintWeight && grounded && !this.useAnim.busy;
    if (wantSprint && this.stance !== 'stand') this.stance = 'stand', this.crouch = this.prone = false;
    this.sprinting = wantSprint;

    // Target speed (m/s) for an average person
    let maxSpeed;
    if (this.prone) maxSpeed = 0.4 * (1 + 0.15 * kA);
    else if (this.crouch) maxSpeed = 1.0 * Math.max(0.35, this.pace) * (1 + 0.18 * kA);
    else if (wantSprint) maxSpeed = 4.6 * (1 + 0.03 * fit) * (1 + 0.14 * kA);
    else maxSpeed = 1.6 * this.pace * (1 + 0.12 * kA);
    if (fwd < 0) maxSpeed *= 0.65 + 0.15 * kD;     // walking backwards
    else if (side && !fwd) maxSpeed *= 0.8 + 0.12 * kD; // strafing
    if (this.ads > 0.3) maxSpeed *= 1 - 0.4 * this.ads;
    if (legsBroken) maxSpeed *= 0.5;
    if (this.fatigue > 80) maxSpeed *= 0.88;
    if (gunActive && this.gun.busy) maxSpeed *= 0.85;
    if (this.useAnim?.busy) maxSpeed *= 0.6; // eating, bandaging...
    if (Math.abs(this.lean) > 0.3) maxSpeed *= 0.7;
    maxSpeed *= 1 - 0.35 * over;
    if (kg > 60) maxSpeed = Math.min(maxSpeed, 0.8);
    // Wading through snow; stiff with cold
    const W = g.weather;
    if (W && W.snowCover > 0.2 && !g.world.buildingAt(this.pos.x, this.pos.z)) maxSpeed *= 1 - 0.2 * (W.snowCover - 0.2) / 0.8;
    if (this.bodyTemp < 35) maxSpeed *= 0.85;

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = -fz, rz = fx;
    let mx = fwd * fx + side * rx, mz = fwd * fz + side * rz;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const tvx = mx * maxSpeed, tvz = mz * maxSpeed;

    // Momentum: accelerate toward the target velocity; heavier = slower to
    // get going and to stop. Barely any control in the air.
    const inertia = 1 + kg / 30;
    const speedingUp = Math.hypot(tvx, tvz) > Math.hypot(this.vel.x, this.vel.z);
    let accel = (speedingUp ? (wantSprint ? 4.0 : 6.5) : 7.5) / inertia * (1 + 0.6 * kD); // dexterity: snappier starts and stops
    if (!grounded) accel = 0.8 * (1 + 0.8 * kD);
    const dvx = tvx - this.vel.x, dvz = tvz - this.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const step = Math.min(dl, accel * dt);
    if (dl > 1e-5) { this.vel.x += (dvx / dl) * step; this.vel.z += (dvz / dl) * step; }

    const bx = this.pos.x, bz = this.pos.z;
    if (this.vault) {
      // Climbing through a window: over the sill and down the other side.
      const v = this.vault;
      v.t = Math.min(1, v.t + dt / v.dur);
      const k = v.t < 0.5 ? 2 * v.t * v.t : 1 - (-2 * v.t + 2) ** 2 / 2;
      this.pos.x = v.from.x + (v.to.x - v.from.x) * k;
      this.pos.z = v.from.z + (v.to.z - v.from.z) * k;
      this.vel.set(0, 0, 0);
      if (v.t >= 1) { this.vault = null; this.y = 0; moveCircle(hash, this.pos, this.radius, 0, 0, this.floorY); sfx.step(0.2); }
    } else if (g.dev?.noclip) { this.pos.x += mx * 8 * dt; this.pos.z += mz * 8 * dt; this.vel.set(0, 0, 0); }
    else {
      moveCircle(hash, this.pos, this.radius, this.vel.x * dt, this.vel.z * dt, this.floorY);
      // Stairs and storeys: the floor under the new spot (refused if it's a
      // drop or a climb no step could make)
      const fy = g.world.levels.floorAt(this.pos.x, this.pos.z, this.floorY);
      if (fy === null) { this.pos.x = bx; this.pos.z = bz; } else this.floorY = fy;
      // Running into a wall kills the momentum in that direction.
      if (dt > 0) {
        const ax = (this.pos.x - bx) / dt, az = (this.pos.z - bz) / dt;
        this.vel.x = Math.abs(ax) < Math.abs(this.vel.x) ? ax : this.vel.x;
        this.vel.z = Math.abs(az) < Math.abs(this.vel.z) ? az : this.vel.z;
      }
    }
    const moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
    const speed = dt > 0 ? moved / dt : 0;
    this.speed = speed;
    const moving = speed > 0.15;

    // Jumping (Space): costs stamina, not while prone or exhausted.
    if (input.jump && grounded && !this.vault && this.stance !== 'prone' && this.stamina > 12 && kg < 60 && !legsBroken && this.tryVault(over)) {
      // vaulting through a window instead of jumping
    } else if (input.jump && grounded && !this.vault && this.stance !== 'prone' && this.stamina > 12 && kg < 60 && !legsBroken) {
      this.stance = 'stand'; this.crouch = false;
      this.vy = 3.1 * (1 - 0.4 * over) * (1 + 0.1 * kA);
      this.stamina -= 12 * (1 + over) * (1 - 0.3 * kA);
      this.practice('agility', 1.5);
      sfx.step(0.1);
    }
    if (this.vault) {
      this.vy = 0;
      this.y = Math.sin(this.vault.t * Math.PI) * (this.vault.w.sill * 0.55 + 0.15);
    } else if (!grounded || this.vy > 0) {
      this.vy -= 9.81 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.landDip = Math.min(0.12, -this.vy * 0.03);
        this.vy = 0;
        sfx.step(0.18);
        g.zombies.noise(this.pos.x, this.pos.z, 6, false, this.floorY);
      }
    }

    // Footsteps follow the distance actually covered
    if (grounded) {
      this.stepDist += moved;
      this.bob += moved * (wantSprint ? 2.0 : this.crouch ? 3.4 : 3.0);
      const stride = wantSprint ? 1.5 : this.prone ? 0.6 : this.crouch ? 0.6 : 0.75;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const loud = Math.min(1, speed / 4.6) * (this.crouch ? 0.4 : 1) * (1 + over * 0.5);
        if (loud > 0.12) sfx.step(0.03 + 0.12 * loud);
      }
    }

    // Stamina: sprinting drains it (more when overweight); recovers slowly.
    if (wantSprint && moving) this.stamina = Math.max(0, this.stamina - 8.5 * (1 + over * 1.5) * (1 - 0.08 * fit) * (1 - 0.25 * kA) * dt);
    else {
      let regen = moving ? 3.5 : this.crouch ? 8 : 6.5;
      regen *= (1 + 0.1 * fit) * (1 - 0.5 * over) * (this.fatigue >= 100 ? 0.5 : 1) * (this.exhausted ? 0.6 : 1) * (this.coldMul || 1);
      this.stamina = Math.min(100, this.stamina + regen * dt);
    }
    this.trainMovement(dt, moved, { wantSprint, fwd, side, bx, bz });
    // Heavy breathing when winded
    this.breathTimer -= dt;
    if ((this.exhausted || this.stamina < 15) && this.breathTimer <= 0) { this.breathTimer = 1.1; sfx.breath(); }

    // Footstep noise scales with speed (slow walking is nearly silent)
    this.noiseTimer -= dt;
    if (moving && grounded && this.noiseTimer <= 0) {
      this.noiseTimer = 0.5;
      let r = speed * 3 * (this.prone ? 0.3 : this.crouch ? 0.5 : 1) * (1 + over * 0.4) * (1 - 0.1 * this.skill.stealth);
      if (r > 0.8) g.zombies.noise(this.pos.x, this.pos.z, r, false, this.floorY);
    }

    // Lean (Q/E): shift the eye sideways unless a wall is in the way.
    const leanTarget = this.prone || wantSprint ? 0 : (input.leanR ? 1 : 0) - (input.leanL ? 1 : 0);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 9);
    const rxv = Math.cos(this.yaw), rzv = -Math.sin(this.yaw);
    let leanDist = 0.38 * this.lean;
    if (Math.abs(leanDist) > 0.01) {
      const ex = this.pos.x + rxv * (leanDist + Math.sign(leanDist) * 0.15), ez = this.pos.z + rzv * (leanDist + Math.sign(leanDist) * 0.15);
      const hit = raycast(hash, this.pos.x, this.pos.z, ex, ez, 'blocksSight', this.floorY);
      if (hit.box) leanDist *= Math.max(0, hit.t - 0.3);
    }

    // Camera
    const targetEye = this.prone ? 0.32 : this.crouch ? 1.1 : 1.65;
    // Stance changes take time (prone especially)
    this.eye += (targetEye - this.eye) * Math.min(1, dt * (this.prone || this.eye < 0.6 ? 3 : 8) * (1 + 0.8 * kD));
    this.landDip *= Math.exp(-dt * 8);
    const sp = Math.min(1, speed / 4.6);
    const bobAmt = grounded && moving ? (0.012 + 0.04 * sp) * (1 - this.ads * 0.85) * (this.prone ? 0.3 : 1) : 0;
    this.camera.position.set(
      this.pos.x + rxv * leanDist,
      this.floorY + this.eye + this.y + Math.abs(Math.sin(this.bob)) * bobAmt - Math.abs(this.lean) * 0.05 - this.landDip,
      this.pos.z + rzv * leanDist);
    this.camera.rotation.set(this.pitch - this.landDip * 0.4, this.yaw, Math.sin(this.bob * 0.5) * bobAmt * 0.35 - this.lean * 0.16);
    // shaken by cannon fire close by
    const shake = Math.max(this.game.shake || 0, this.game.air?.shake || 0);
    if (shake > 0.01) { this.camera.rotation.x += (Math.random() - 0.5) * 0.03 * shake; this.camera.rotation.y += (Math.random() - 0.5) * 0.03 * shake; }
    // A slight, slow widening at a full sprint; everything eases.
    this.sprintFovK = (this.sprintFovK || 0) + ((wantSprint && moving ? 1 : 0) - (this.sprintFovK || 0)) * Math.min(1, dt * 1.8);
    const air = this.game.air;
    const targetFov = air?.active ? air.fov : (gunActive ? 75 + (this.gun.adsFov - 75) * this.ads : 75) + 2.5 * this.sprintFovK * (1 - this.ads);
    const nf = this.camera.fov + (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    if (Math.abs(this.camera.fov - nf) > 0.001) { this.camera.fov = nf; this.camera.updateProjectionMatrix(); }

    // Weapon switching (1 / 2 / mouse wheel)
    this.meleeCd -= dt;
    if (input.slot1) this.setActive('gun');
    if (input.slot2) this.setActive('melee');

    if (g.drone?.flying) {
      // Flying a drone: the controller in your hands, the view is the drone's
      this.gun.setVisible(false);
      this.vm.visible = false;
    } else if (this.useAnim.busy) {
      // Hands are busy with an item: the weapon is put away meanwhile
      this.gun.setVisible(false);
      this.vm.visible = false;
      this.useAnim.update(dt);
    } else if (g.thr?.held) {
      // A grenade in the hand (the hotbar): it takes the mouse buttons
      this.gun.setVisible(false);
      this.vm.visible = false;
      g.thr.updateHeld(dt, input, Math.abs(Math.cos(this.bob * 0.5)) * bobAmt * 0.3);
    } else if (this.active === 'gun' && this.weapon) {
      this.vm.visible = false;
      this.gun.setVisible(true);
      this.gun.update(dt, input, { moving, sprinting: wantSprint && moving, speed });
    } else {
      this.gun.setVisible(false);
      // Melee / fists viewmodel: sway, sprint pose and swing
      const vm = this.vm;
      vm.visible = true;
      vm.position.copy(vm.userData.hip);
      vm.position.x += Math.sin(this.bob * 0.5) * bobAmt * 0.4;
      vm.position.y += Math.abs(Math.cos(this.bob * 0.5)) * bobAmt * 0.3 - (wantSprint && moving ? 0.08 : 0);
      vm.rotation.set(wantSprint && moving ? -0.3 : 0, wantSprint && moving ? 0.5 : 0, 0);
      // Lowered (G): the blade or fists held down at your side
      if (input.lower) this.gun.lowered = !this.gun.lowered;
      if (this.gun.lowered && input.firePressed) { this.gun.lowered = false; input.firePressed = false; }
      this.meleeLowK = (this.meleeLowK || 0) + ((this.gun.lowered ? 1 : 0) - (this.meleeLowK || 0)) * Math.min(1, dt * 7);
      vm.position.y -= 0.16 * this.meleeLowK; vm.rotation.x -= 0.6 * this.meleeLowK;
      if (this.swing > 0) {
        const s = this.swing;
        vm.rotation.set(-0.6 + (1 - s) * 1.6, 0.6 - (1 - s) * 1.2, -0.4);
        this.swing = Math.max(0, this.swing - dt * 4);
      }
      if (input.firePressed && this.meleeCd <= 0) this.meleeAttack();
    }
    if (input.flashlight) this.flashlight = !this.flashlight;
    this.setLight(this.flashlight ? 40 : 0);

    this.updateBody(dt);
  }

  // ---------- combat ----------
  fireRay(origin, dir, def) {
    const maxD = 300; // scoped shots across the countryside
    const end = origin.clone().addScaledVector(dir, maxD);
    // World hit: walls (full height) or low obstacles if the ray is low enough.
    const hash = this.game.world.hash;
    const boxes = hash.query(Math.min(origin.x, end.x), Math.min(origin.z, end.z), Math.max(origin.x, end.x), Math.max(origin.z, end.z), []);
    let tw = 1, wallBox = null;
    const glass = [];
    for (const b of boxes) {
      if (b.window?.state === 'closed') {
        // Window glass doesn't stop a bullet, it shatters
        const t = segBox(origin.x, origin.z, end.x, end.z, b);
        const y = origin.y + dir.y * t * maxD;
        if (t >= 0 && y > b.window.sill && y < b.window.top) glass.push([t * maxD, b.window]);
        continue;
      }
      if (!b.blocksShot) continue;
      const t = segBox(origin.x, origin.z, end.x, end.z, b);
      if (t < 0 || t >= tw) continue;
      const y = origin.y + dir.y * t * maxD;
      if (y > (b.h ?? 3) || y < (b.y0 ?? 0)) continue;
      tw = t; wallBox = b;
    }
    const breakGlass = (stopD) => { for (const [d, w] of glass) if (d < stopD) this.game.breakWindow(w, origin.clone().addScaledVector(dir, d), dir); };
    let wallD = tw * maxD;
    // The ground, or a floor or ceiling slab in a building with upper storeys
    const slab = this.game.world.levels.slabHit(origin, dir, wallD);
    if (slab < wallD) { wallD = slab; wallBox = null; }
    const wallPoint = origin.clone().addScaledVector(dir, wallD - 0.01);
    // Surface normal of what the bullet stops in (for holes and splatter).
    let normal = new THREE.Vector3(0, dir.y < 0 ? 1 : -1, 0);
    if (wallBox) {
      const b = wallBox, p = wallPoint;
      const d = [[p.x - b.minX, -1, 0], [b.maxX - p.x, 1, 0], [p.z - b.minZ, 0, -1], [b.maxZ - p.z, 0, 1]].sort((a, c) => Math.abs(a[0]) - Math.abs(c[0]))[0];
      normal = new THREE.Vector3(d[1], 0, d[2]);
      if (Math.abs(p.y - (b.h ?? 3)) < 0.03) normal.set(0, 1, 0);
    }
    const g = this.game;
    const z = g.zombies.raycast(origin, dir, wallD);
    // AI survivors and bodies on the ground can be shot too (closest hit wins).
    const sv = g.survivors?.raycast(origin, dir, z ? z.t : wallD);
    const rd = g.ragdolls?.raycast(origin, dir, sv ? sv.t : z ? z.t : wallD);
    const tHit = rd ? rd.t : sv ? sv.t : z ? z.t : null;
    breakGlass(tHit ?? wallD);
    if (g.dev?.tracers) g.fx.debugTrace(origin, origin.clone().addScaledVector(dir, Math.min(tHit ?? wallD, maxD)), tHit != null ? 'flesh' : 'wall');
    if (tHit == null) {
      if (wallD < maxD) {
        g.fx.impact(wallPoint, normal, wallBox?.decalParent, wallBox?.decalInset);
        if (wallD < 40) sfx.impact(1 - wallD / 40);
        // Zombies near where it smacked in turn to look where it came from.
        g.zombies.alertNear(wallPoint.x, wallPoint.z, 5, this.pos.x, this.pos.z, this.floorY);
      }
      return;
    }
    const range = rd ? rd.t : tHit;
    const falloff = range > def.range ? Math.max(0.3, 1 - (range - def.range) / def.range) : 1;
    const point = origin.clone().addScaledVector(dir, tHit);
    // Impulse the bullet gives a body (game-feel, not physics): heavier
    // rounds shove harder; buckshot pellets each push a little.
    const force = Math.min(7, def.damage * 0.075 * (def.pellets > 1 ? 0.55 : 1)) * (0.6 + 0.4 * falloff);
    const hit = { point, dir: dir.clone(), force };
    const head = rd ? rd.head : sv ? sv.head : z.head;
    // Blood on the wall behind the target if it's close enough
    const behind = wallD - tHit;
    const bloodOpts = { head, power: force / 3, wall: behind < 2.6 && wallD < maxD ? { point: wallPoint, normal, parent: wallBox?.decalParent, inset: wallBox?.decalInset } : null };
    g.fx.blood(point, dir, bloodOpts);
    const dmgMul = falloff * (head ? 3 : 1);
    if (rd) {
      // A body on the ground: knocked-down (still alive) or dead.
      rd.ragdoll.impulse(point, dir, force * 1.3);
      const o = rd.ragdoll.alive ? rd.ragdoll.owner : null;
      if (o?.def) { this.hitFeedback(head, g.zombies.damage(o, def.damage * dmgMul, this.pos.x, this.pos.z, head, hit), o); }
      else if (o?.kind === 'survivor') { o.hurt(def.damage * dmgMul, 'player', null, hit); this.hitFeedback(head, o.dead, o); }
      else if (performance.now() - (this.lastHitSfx || 0) > 40) { this.lastHitSfx = performance.now(); sfx.hitBody(0.6); }
    } else if (sv) {
      sv.s.hurt(def.damage * dmgMul, 'player', null, hit);
      this.hitFeedback(head, sv.s.dead, sv.s);
    } else {
      const armored = z.zb.def.armor && !head;
      if (armored) sfx.hitArmor();
      this.hitFeedback(head, g.zombies.damage(z.zb, def.damage * dmgMul, this.pos.x, this.pos.z, head, hit), z.zb);
    }
  }

  // Sound and hit marker for a confirmed hit; kills get a heavier marker.
  hitFeedback(head, killed, target) {
    // Shooting trains the Guns skill: hits count, hip-fire hits and kills more
    if (this.active === 'gun') gainXp(this.game, 'guns', (this.gun.ads < 0.5 ? 1.5 : 0.6) + (killed ? 1.5 : 0));
    // Buckshot lands several pellets at once: one sound for the volley.
    const now = performance.now();
    if (now - (this.lastHitSfx || 0) > 40 || killed) { this.lastHitSfx = now; if (head) sfx.hitHead(); else sfx.hitBody(); }
    this.game.hud.hitmarker(head, killed);
    if (killed) { sfx.kill(); this.onKill(target); }
  }

  meleeAttack() {
    const def = this.melee ? ITEMS[this.melee.key] : { damage: 12, range: 1.2, rate: 0.5 };
    if (this.stamina < 5) return;
    this.stamina -= 8 * (1 - 0.08 * this.skill.strength);
    this.meleeCd = def.rate;
    this.swing = 1;
    sfx.swing();
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const heavy = def.damage >= 60;
    // A blow pushes along the swing (forward and across).
    const blowDir = (tx, tz) => new THREE.Vector3(tx - this.pos.x, 0, tz - this.pos.z).normalize().multiplyScalar(0.8).add(new THREE.Vector3(fz, 0, -fx).multiplyScalar(0.5)).normalize();
    const force = 1.5 + def.damage * 0.03 * (1 + 0.1 * this.skill.strength);
    let hit = false;
    for (const zb of [...this.game.zombies.list]) {
      if (zb.down) continue;
      if (Math.abs(zb.pos.y - this.floorY) > 1) continue;
      const dx = zb.pos.x - this.pos.x, dz = zb.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.range + zb.radius) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.6) continue;
      const head = this.pitch > -0.15 && Math.random() < 0.35;
      const dmg = def.damage * (head ? 1.8 : 1) * (1 + 0.12 * this.skill.strength);
      const point = new THREE.Vector3(zb.pos.x, zb.pos.y + (head ? 1.6 : 1.2) * zb.def.scale, zb.pos.z);
      const dir = blowDir(zb.pos.x, zb.pos.z);
      this.game.fx.blood(point, dir, { head, power: heavy ? 1 : 0.5, exit: false });
      const killed = this.game.zombies.damage(zb, dmg, this.pos.x, this.pos.z, head, { point, dir, force, knock: heavy ? 0.25 : 0.05 });
      sfx.meleeHit(heavy);
      this.game.hud.hitmarker(head, killed);
      if (killed) { sfx.kill(); this.onKill(zb); }
      hit = true;
      if (!this.melee || this.melee.key !== 'axe') break; // axes cleave
    }
    if (!hit) {
      // Bodies on the ground (knocked down or dead) can be hit too.
      const look = new THREE.Vector3(fx * Math.cos(this.pitch), Math.sin(this.pitch), fz * Math.cos(this.pitch));
      const eye = this.camera.getWorldPosition(new THREE.Vector3());
      const rd = this.game.ragdolls?.raycast(eye, look, def.range + 0.4);
      const sv = this.game.survivors?.meleeTarget(this.pos, fx, fz, def.range);
      if (sv) {
        const point = new THREE.Vector3(sv.pos.x, 1.3, sv.pos.z), dir = blowDir(sv.pos.x, sv.pos.z);
        sv.hurt(def.damage * (1 + 0.12 * this.skill.strength), 'player', null, { point, dir, force, knock: heavy ? 0.3 : 0.08 });
        this.game.fx.blood(point, dir, { power: heavy ? 1 : 0.5, exit: false });
        sfx.meleeHit(heavy);
        this.game.hud.hitmarker(false, sv.dead);
        if (sv.dead) { sfx.kill(); this.onKill(sv); }
        hit = true;
      } else if (rd) {
        const point = eye.clone().addScaledVector(look, rd.t), dir = look.clone().add(new THREE.Vector3(0, -0.5, 0)).normalize();
        rd.ragdoll.impulse(point, dir, force);
        this.game.fx.blood(point, dir, { power: 0.5, exit: false });
        const o = rd.ragdoll.alive ? rd.ragdoll.owner : null;
        const dmg = def.damage * (rd.head ? 1.8 : 1) * (1 + 0.12 * this.skill.strength);
        let killed = false;
        if (o?.def) killed = this.game.zombies.damage(o, dmg, this.pos.x, this.pos.z, rd.head, { point, dir, force });
        else if (o?.kind === 'survivor') { o.hurt(dmg, 'player', null, { point, dir, force }); killed = o.dead; }
        sfx.meleeHit(heavy);
        if (o) { this.game.hud.hitmarker(rd.head, killed); if (killed) { sfx.kill(); this.onKill(o); } }
        hit = true;
      }
    }
    if (!hit) this.game.meleeWorld?.(this.melee?.key);
    this.game.zombies.noise(this.pos.x, this.pos.z, 3, false, this.floorY);
  }

  // Space at an open or smashed window you're facing: climb through it.
  // Movement skills improve with use. Agility: covering ground fast
  // (sprinting, climbing stairs), jumping and vaulting. Dexterity: footwork
  // (strafing, backing off, moving crouched, cutting sharply at speed),
  // stance changes and vaulting.
  trainMovement(dt, moved, m) {
    const climb = Math.max(0, this.floorY - (this.prevFloorY ?? this.floorY));
    this.prevFloorY = this.floorY;
    if (moved < 1e-4 || this.vehicle || this.game.dev?.noclip) return;
    if (climb > 0 && climb < 0.5) this.practice('agility', climb * 0.6); // (stairs, not elevators)
    if (m.wantSprint) this.practice('agility', moved * 0.1);
    if (!m.wantSprint && (m.side || m.fwd < 0)) this.practice('dexterity', moved * 0.08);
    if (this.crouch && !this.prone) this.practice('dexterity', moved * 0.06);
    // A sharp change of direction at speed (sampled, so a slow curve doesn't count)
    this.dirT = (this.dirT ?? 0) - dt;
    this.dodgeCd -= dt;
    if (this.dirT <= 0 && moved / dt > 0.5) {
      this.dirT = 0.35;
      const dx = (this.pos.x - m.bx) / moved, dz = (this.pos.z - m.bz) / moved, pd = this.prevDir;
      if (pd && this.speed > 2.2 && this.dodgeCd <= 0 && dx * pd[0] + dz * pd[1] < 0.5) { this.dodgeCd = 1.2; this.practice('dexterity', 1); }
      this.prevDir = [dx, dz];
    }
  }

  // Bank practice; whole points go to the skill
  practice(stat, n) {
    this.moveXp[stat] += n;
    if (this.moveXp[stat] >= 1) {
      const k = Math.floor(this.moveXp[stat]);
      this.moveXp[stat] -= k;
      gainXp(this.game, stat, k);
    }
  }

  tryVault(over = 0) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let best = null, bd = 1.3;
    for (const w of this.game.world.windows) {
      if (w.state === 'closed' || w.sill >= 1.2 || w.base || this.floorY > 0.1) continue; // (not out of upstairs windows)
      const d = Math.hypot(w.x - this.pos.x, w.z - this.pos.z);
      if (d > bd) continue;
      const nx = w.ax === 'x' ? 0 : 1, nz = w.ax === 'x' ? 1 : 0;
      const side = Math.sign((this.pos.x - w.x) * nx + (this.pos.z - w.z) * nz) || 1;
      if (-(fx * nx + fz * nz) * side < 0.45) continue; // must face through it
      const along = w.ax === 'x' ? this.pos.x - w.x : this.pos.z - w.z;
      if (Math.abs(along) > w.w / 2 + 0.1) continue;
      bd = d; best = { w, nx, nz, side, along: Math.max(-w.w / 2 + 0.35, Math.min(w.w / 2 - 0.35, along)) };
    }
    if (!best) return false;
    const { w, nx, nz, side, along } = best;
    const ux = w.ax === 'x' ? 1 : 0, uz = w.ax === 'x' ? 0 : 1;
    this.practice('agility', 1.5); this.practice('dexterity', 1.5);
    this.vault = {
      t: 0, dur: (0.85 + over * 0.7) / (1 + 0.4 * (this.skill.dexterity || 0) / 8), w,
      from: { x: this.pos.x, z: this.pos.z },
      to: { x: w.x + ux * along - nx * side * 0.75, z: w.z + uz * along - nz * side * 0.75 },
    };
    this.stance = 'stand'; this.crouch = this.prone = false;
    this.stamina -= 10 * (1 + over);
    sfx.step(0.2);
    this.game.zombies.noise(this.pos.x, this.pos.z, 5);
    if (w.state === 'broken' && Math.random() < 0.3) {
      const part = ['armL', 'armR', 'legL', 'legR'][Math.floor(Math.random() * 4)];
      this.damagePart(part, 4);
      this.bleeding.add(part);
      this.game.hud.message('You cut yourself on the broken glass', 3);
      sfx.hurt();
    }
    return true;
  }

  onKill(target) { this.kills++; this.game.hud.message('Kill confirmed'); this.game.traders?.onKill(target); this.game.progress?.onKill(target); }

  // ---------- health ----------
  // (in the helicopter you're not really standing at the landing zone yet)
  get aboard() { return !!this.game.intro; }
  takeZombieHit(amount, zb) {
    if (this.dead || this.aboard) return;
    if (this.vehicle) amount *= 0.4; // reaching in through the window
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
    if (this.dead) return; // (that killed you: the world is already gone)
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

  // Shot by an AI survivor: like a zombie hit, but no bite/infection.
  takeBulletHit(amount, from) {
    if (this.dead || this.aboard) return;
    let r = Math.random(), part = 'thorax';
    for (const [k, wgt] of HIT_WEIGHTS) { r -= wgt; if (r <= 0) { part = k; break; } }
    const armor = part === 'head' ? this.equip.helmet : (part === 'thorax' || part === 'stomach') ? this.equip.armor : null;
    let bleedChance = 0.45;
    if (armor && armor.dur > 0) {
      const def = ITEMS[armor.key];
      amount *= 1 - def.protection * Math.min(1, armor.dur / def.durability + 0.3);
      armor.dur = Math.max(0, armor.dur - amount * 0.8);
      bleedChance *= 0.3;
    }
    this.damagePart(part, amount);
    if (this.dead) return; // (that killed you: the world is already gone)
    if (Math.random() < bleedChance) this.bleeding.add(part);
    this.hurtFlash = 1;
    sfx.hurt();
    this.game.hud.message(`Hit in the ${PARTS[part].name.toLowerCase()}${from ? ` by ${from}` : ''}!`, 2);
  }

  damagePart(part, amount) {
    if (this.game.dev?.god || this.aboard) return;
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
    this.water = Math.max(0, this.water - dt * 0.13 * (this.thirstMul || 1)); // heat (weather.js)
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

  // Using an item plays its animation; the effect lands when it's done.
  // Returns true if the item is used up (so the inventory can take it).
  use(item) {
    const why = this.cantUse(item);
    if (why) { this.game.hud.message(why); return false; }
    if (this.useAnim.busy) { this.game.hud.message('Your hands are busy.', 1.5); return false; }
    return this.useAnim.play(item, () => { if (!this.dead) this.applyUse(item); });
  }

  // Why an item can't be used right now (or null)
  cantUse(item) {
    const def = ITEMS[item.key];
    if (def.type === 'food') return null;
    if (def.type !== 'med') return "You can't use that.";
    if (def.cure) return this.infected ? null : 'Not infected.';
    if (def.slowInfection) return this.infected ? null : "You're not infected.";
    if (def.surgery) return Object.keys(PARTS).some((p) => this.hp[p] <= 0 && !PARTS[p].vital) ? null : 'No destroyed limbs to operate on.';
    if (def.painkiller) return null;
    if (def.stopBleed && this.bleeding.size) return null;
    if (def.heal && Object.keys(PARTS).some((k) => this.hp[k] > 0 && this.hp[k] < PARTS[k].max)) return null;
    if (def.stopBleed && def.heal && Object.keys(PARTS).some((k) => this.hp[k] <= 0 && !PARTS[k].vital)) return null;
    return 'Nothing to treat.';
  }

  applyUse(item) {
    const def = ITEMS[item.key];
    if (def.type === 'food') {
      this.game.progress?.event('use', item);
      this.food = Math.min(100, this.food + def.food);
      this.water = Math.max(0, Math.min(100, this.water + def.water));
      if (def.fatigue) this.fatigue = Math.max(0, this.fatigue - def.fatigue);
      return true;
    }
    if (def.type === 'med') {
      if (def.cure) {
        if (!this.infected) { this.game.hud.message('Not infected.'); return false; }
        this.infected = false; this.infection = 0;
        this.game.hud.message('Infection cured.');
        return true;
      }
      if (def.slowInfection) {
        if (!this.infected) { this.game.hud.message("You're not infected."); return false; }
        this.infection = Math.max(0, this.infection - def.slowInfection);
        this.game.hud.message('The antibiotics slow the infection — but they won\'t cure it.', 4);
        return true;
      }
      if (def.surgery) {
        // Restore one destroyed limb and close its wound.
        const k = Object.keys(PARTS).find((p) => this.hp[p] <= 0 && !PARTS[p].vital);
        if (!k) { this.game.hud.message('No destroyed limbs to operate on.'); return false; }
        this.hp[k] = PARTS[k].max * 0.4;
        this.bleeding.delete(k);
        this.game.hud.message(`Surgery on your ${PARTS[k].name.toLowerCase()} succeeded.`, 3);
        return true;
      }
      if (def.painkiller) {
        this.painkiller = def.painkiller;
        if (def.heal) for (const k in PARTS) if (this.hp[k] > 0) this.hp[k] = Math.min(PARTS[k].max, this.hp[k] + def.heal / 7);
        this.game.hud.message(def.heal ? 'Morphine kicks in.' : 'Painkillers active');
        return true;
      }
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

  carryWeight() {
    const p = this.game.profile;
    let kg = 0;
    for (const k in p.equip) if (p.equip[k]) kg += itemWeight(p.equip[k]);
    for (const it of p.pockets.items) kg += itemWeight(it);
    return kg;
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
      flashlight: this.flashlight, active: this.active, stance: this.stance, pace: this.pace, vehicle: this.vehicle ? this.vehicle.index : undefined,
      wet: Math.round(this.wet || 0), bodyTemp: +(this.bodyTemp ?? 37).toFixed(2), floorY: this.floorY ? +this.floorY.toFixed(3) : undefined,
    };
  }

  restore(s) {
    this.pos.set(s.x, 0, s.z);
    this.yaw = s.yaw;
    Object.assign(this.hp, s.hp);
    this.bleeding = new Set(s.bleeding);
    for (const k of ['food', 'water', 'fatigue', 'stamina', 'infected', 'infection', 'painkiller', 'kills', 'flashlight', 'active', 'stance', 'pace', 'wet', 'bodyTemp', 'floorY']) if (s[k] !== undefined) this[k] = s[k];
    this.buildViewmodel();
  }

  die(reason) {
    if (this.game.dev?.god) return;
    if (this.dead) return;
    this.dead = true;
    this.deathReason = reason;
    this.game.onDeath(reason);
  }
}
