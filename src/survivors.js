// AI survivors: other people living in the town. Each has a disposition
// (friendly / neutral / hostile), a trust score toward the player, a
// weapon with real ammo, a backpack of loot, and a simple state machine:
// roam between buildings, fight zombies, engage or flee from enemies,
// follow the player. Friendly and neutral survivors can be talked to and
// traded with. Built to be extended (factions, jobs, quests...).
import * as THREE from 'three';
import { ITEMS, makeItem, rollLoot, itemValue } from './items.js';
import { makeGrid, addItem } from './inventory.js';
import { moveCircle, hasLOS } from './collision.js';
import { HALF, setDoor } from './world.js';
import { NAV_CELL, NAV_N } from './zombies.js';
import { randomName } from './character.js';
import { sfx } from './audio.js';
import { lookMats, JOINT } from './ragdoll.js';
const smooth = (t) => t * t * (3 - 2 * t);

const MAX_SURVIVORS = 9;
const DISP_LABEL = { friendly: 'Friendly', neutral: 'Wary', hostile: 'Hostile' };

// How the AI uses each weapon (simplified ballistics; real ammo is tracked).
const AI_GUNS = {
  pm: { dmg: 28, rate: 0.6, range: 28, acc: 0.55 },
  mp133: { dmg: 55, rate: 1.1, range: 18, acc: 0.75 },
  sks: { dmg: 62, rate: 0.95, range: 55, acc: 0.6 },
  ak74: { dmg: 36, rate: 0.16, range: 50, acc: 0.42, burst: 4 },
};
const AI_MELEE = { knife: 28, crowbar: 40, axe: 60, hammer: 26 };

// Personalities drive what survivors say.
const PERSONAS = {
  gruff: {
    bio: ["Name's {name}. Used to haul freight. Now I haul whatever keeps me breathing.", "{name}. Don't expect small talk."],
    greet: ["You're alive. Huh.", "Keep your hands where I can see 'em and we'll get along."],
    warn: ["That's close enough.", "Back off, friend. I mean it."],
    thanks: ["...Appreciated.", "Fair."],
  },
  kind: {
    bio: ["I'm {name}. I was a teacher, back when there were kids to teach.", "{name}. I help where I can. Someone has to."],
    greet: ["Oh thank god, a real person!", "Hey! You're not one of them. Are you hurt?"],
    warn: ["Please, just... keep your distance for now.", "I don't want any trouble."],
    thanks: ["Thank you, really.", "That's kind of you."],
  },
  nervous: {
    bio: ["I-I'm {name}. I've been hiding in attics mostly.", "{name}. I don't sleep much anymore."],
    greet: ["Don't shoot! I'm not bitten!", "Are they following you? Tell me they're not following you."],
    warn: ["S-stay back!", "I'm warning you, I'm armed!"],
    thanks: ["Oh. Oh wow. Thanks.", "I won't forget this."],
  },
};
const BANDIT_LINES = ["Drop the bag and walk away!", "Your gear's mine now!", "Should've stayed indoors!", "Light 'em up!"];
const HURT_LINES = ["Agh!", "I'm hit!", "Damn it!"];
const BETRAYED_LINES = ["You son of a—!", "Traitor!", "So that's how it is!"];
const FLEE_LINES = ["I'm out!", "Not worth dying for!", "Fall back!"];
const SHIRTS = [0x3a4a5a, 0x5a3a2a, 0x2f4a2f, 0x6a5a3a, 0x4a3a5a, 0x2a2a2a, 0x7a2a2a];
const PANTS = [0x2a3a4a, 0x3a3a2a, 0x222222, 0x4a3a2a];
const SKINS = [0xd8b090, 0xc09070, 0x8a6040, 0x6a4a30, 0xe8c8a8];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------------------
// One survivor
// ---------------------------------------------------------------------------
class Survivor {
  constructor(mgr, d) {
    this.mgr = mgr;
    this.kind = 'survivor';
    this.id = d.id;
    this.name = d.name;
    this.persona = d.persona;
    this.disp = d.disp;
    this.trust = d.trust;
    this.met = d.met;
    this.hp = d.hp; this.maxHp = d.maxHp || 100;
    this.weapon = d.weapon;   // weapon item (or null)
    this.melee = d.melee;     // melee item key
    this.reserve = d.reserve; // spare rounds for the weapon
    this.inv = d.inv;         // backpack grid (looted on death / traded)
    this.look = d.look;
    this.order = d.order || null; // 'follow' | 'wait' | null
    this.skill = d.skill ?? 0.5 + Math.random() * 0.5;
    this.pos = new THREE.Vector3(d.x, 0, d.z);
    this.dir = d.dir ?? Math.random() * Math.PI * 2;
    this.radius = 0.3;
    this.dead = false;
    this.state = 'roam';
    this.path = []; this.goal = null; this.linger = 0; this.stuckT = 0;
    this.target = null; this.aimT = 0; this.fireCd = 0; this.reloadT = 0; this.burst = 0;
    this.percT = Math.random() * 0.3; this.aggroPlayer = 0; this.aimWatch = 0; this.warned = false;
    this.say_ = null; this.sayT = 0; this.speechCd = 0;
    this.phase = 0; this.hitFlash = 0; this.regen = 0;
    // Hit reactions, knockdowns and getting back up (see Zombies)
    this.lean = { x: 0, z: 0, vx: 0, vz: 0 }; this.headKick = { x: 0, v: 0 };
    this.vx = 0; this.vz = 0; this.down = null; this.rise = 0; this.riseSide = 1;
    this.buildMesh();
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  buildMesh() {
    const L = this.look;
    const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
    const shirt = mat(L.shirt), pants = mat(L.pants), skin = mat(L.skin), dark = mat(0x222222);
    const g = new THREE.Group();
    const box = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
    const leg = (x) => { const p = new THREE.Group(); p.position.set(x, 0.86, 0); box(0.16, 0.84, 0.17, pants, 0, -0.42, 0, p); box(0.17, 0.08, 0.24, dark, 0, -0.82, 0.03, p); g.add(p); return p; };
    this.legL = leg(-0.11); this.legR = leg(0.11);
    this.torso = box(0.46, 0.62, 0.26, shirt, 0, 1.17, 0);
    box(0.36, 0.42, 0.16, mat(L.pack), 0, 1.2, -0.2); // backpack
    this.head = box(0.24, 0.27, 0.24, skin, 0, 1.64, 0);
    if (L.hat) box(0.28, 0.08, 0.3, mat(L.hat), 0, 1.79, 0.02);
    else box(0.25, 0.06, 0.25, mat(L.hair), 0, 1.78, -0.01);
    // Arms hold the weapon in front of the chest
    const arm = (x) => { const p = new THREE.Group(); p.position.set(x, 1.42, 0); box(0.12, 0.12, 0.5, shirt, 0, 0, 0.22, p); box(0.1, 0.1, 0.09, skin, 0, 0, 0.5, p); g.add(p); return p; };
    this.armL = arm(-0.27); this.armR = arm(0.27);
    // Weapon prop
    this.gunMesh = new THREE.Group();
    const key = this.weapon?.key || this.melee;
    const len = { pm: 0.2, mp133: 0.85, sks: 0.95, ak74: 0.8, knife: 0.25, crowbar: 0.6, axe: 0.7, hammer: 0.35 }[key] || 0.3;
    box(0.05, 0.07, len, key === 'sks' || key === 'mp133' ? mat(0x5a3a20) : dark, 0, 0, len / 2, this.gunMesh);
    this.gunMesh.position.set(0.1, 1.3, 0.35);
    g.add(this.gunMesh);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, len);
    this.gunMesh.add(this.muzzle);
    g.position.copy(this.pos);
    g.rotation.order = 'YXZ';
    g.rotation.y = this.dir;
    this.mesh = g;
    this.gunLen = len;
    this.lookMats = { skin, top: shirt, bottom: pants };
    this.mats = [shirt, pants];
    this.mgr.scene.add(g);
  }

  say(text, vol = 1) {
    this.say_ = text;
    this.sayT = 3.5;
    const d = this.mgr.distToPlayer(this);
    if (d < 30) {
      sfx.voice(vol * (1 - d / 30));
      if (d < 20) this.mgr.game.hud.message(`${this.met || this.trader || this.disp === 'hostile' ? this.name : 'Stranger'}: "${text}"`, 3.5);
    }
  }

  line(kind) { return pick(PERSONAS[this.persona][kind]).replace('{name}', this.name); }

  setDisp(d) {
    if (this.disp === d) return;
    this.disp = d;
    if (d === 'hostile') { this.order = null; this.met = true; }
  }

  changeTrust(n) {
    this.trust = Math.max(-100, Math.min(100, this.trust + n));
    if (this.disp !== 'hostile') {
      if (this.trust <= -25) { this.setDisp('hostile'); this.say(pick(BETRAYED_LINES)); }
      else if (this.disp === 'neutral' && this.trust >= 25) { this.setDisp('friendly'); }
      else if (this.disp === 'friendly' && this.trust < 0) { this.setDisp('neutral'); this.order = null; }
    }
  }

  // hit: { point, dir, force } of the bullet or blow, for reactions and the ragdoll
  hurt(dmg, source, attacker, hit = null) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.15;
    if (Math.random() < 0.5) this.say(pick(HURT_LINES), 0.6);
    if (source === 'player') {
      this.aggroPlayer = 20;
      if (this.disp !== 'hostile') {
        this.betrayed = true; // turned on by the player: not a bandit kill
        this.changeTrust(-60);
        this.setDisp('hostile');
        this.say(pick(BETRAYED_LINES));
      }
      // Witnesses lose trust too
      for (const o of this.mgr.list) {
        if (o === this || o.dead || o.disp === 'hostile') continue;
        if (o.pos.distanceTo(this.pos) < 25 && hasLOS(this.mgr.world.hash, o.pos.x, o.pos.z, this.pos.x, this.pos.z)) o.changeTrust(-30);
      }
    } else if (source === 'survivor' && attacker) {
      this.target = attacker;
    } else if (source === 'zombie' && attacker) {
      this.target = attacker;
    }
    if (this.hp <= 0) this.die(source, hit);
    else if (hit) this.react(hit);
  }

  // Flinch away from the hit; leg hits and heavy blows can knock them down.
  react(hit) {
    if (this.down) { this.down.impulse(hit.point, hit.dir, hit.force); return; }
    const s = Math.sin(this.dir), c = Math.cos(this.dir);
    const lz = hit.dir.x * s + hit.dir.z * c, lx = hit.dir.x * c - hit.dir.z * s;
    this.lean.vx += lz * hit.force * 0.9;
    this.lean.vz -= lx * hit.force * 0.9;
    if (hit.point.y > 1.5) this.headKick.v += lz * hit.force * 3;
    if (this.rise > 0) return;
    const chance = (hit.point.y < 0.85 ? 0.3 : 0.04) + Math.max(0, (hit.force - 3.5) * 0.12) + (hit.knock || 0);
    if (Math.random() < chance) this.knockDown(hit);
  }

  ragdollSpec(extra) {
    const L = this.look;
    const look = { kind: 'survivor', skin: L.skin, top: L.shirt, bottom: L.pants, pack: L.pack, ...(L.hat ? { hat: L.hat } : { hair: L.hair }) };
    const mats = lookMats(look);
    Object.assign(mats, this.lookMats);
    this.mesh.updateMatrixWorld(true);
    return { matrix: this.mesh.matrixWorld, kind: 'survivor', mats, look, vel: new THREE.Vector3(this.vx, 0, this.vz), owner: this, ...extra };
  }

  knockDown(hit) {
    const rd = this.mgr.game.ragdolls;
    if (!rd) return;
    const r = rd.create(this.ragdollSpec({ alive: true, tone: 0.7, toneDecay: 1.4 }));
    r.impulse(hit.point, hit.dir, hit.force * 1.3);
    if (hit.point.y < 0.85) r.sweepLegs(hit.dir, 1.2 + hit.force * 0.5);
    this.down = r;
    this.downT = 1 + Math.random() * 2;
    this.mesh.visible = false;
    this.path = [];
    this.lean.x = this.lean.z = this.lean.vx = this.lean.vz = 0;
    if (Math.random() < 0.6) this.say(pick(HURT_LINES), 0.7);
  }

  getUp() {
    const r = this.down, P = r.p;
    const yaw = r.yaw, faceDown = r.faceDown;
    this.pos.set((P[JOINT.FTL].x + P[JOINT.FTR].x) / 2, 0, (P[JOINT.FTL].z + P[JOINT.FTR].z) / 2);
    moveCircle(this.mgr.world.hash, this.pos, this.radius, 0, 0);
    this.mgr.game.ragdolls.remove(r);
    this.down = null;
    this.dir = faceDown ? yaw : yaw + Math.PI;
    this.riseSide = faceDown ? 1 : -1;
    this.rise = 1;
    this.mesh.visible = true;
  }

  // Body lean, head snap and the get-up pivot applied to the model.
  applyPose(dt) {
    const L = this.lean, K = this.headKick;
    L.vx += (-70 * L.x - 10 * L.vx) * dt; L.vz += (-70 * L.z - 10 * L.vz) * dt;
    L.x += L.vx * dt; L.z += L.vz * dt;
    K.v += (-90 * K.x - 9 * K.v) * dt; K.x += K.v * dt;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.dir;
    this.mesh.rotation.x = L.x + (this.rise > 0 ? this.riseSide * (Math.PI / 2) * smooth(Math.min(1, this.rise)) : 0);
    this.mesh.rotation.z = L.z;
    this.head.rotation.x = K.x;
  }

  die(source, hit) {
    this.dead = true;
    const game = this.mgr.game;
    // The body goes limp (or buckles, if not shot in the head) and keeps
    // whatever momentum it had; the gun falls out of their hands.
    const head = hit && hit.point.y > 1.5;
    let r = this.down;
    const wasDown = !!r;
    if (r) { r.alive = false; r.tone = 0; }
    else if (game.ragdolls) r = game.ragdolls.create(this.ragdollSpec({ tone: head ? 0 : 0.85, toneDecay: 1.2 + Math.random(), spasms: head ? 0 : 1 + Math.floor(Math.random() * 3) }));
    if (r) {
      r.owner = null;
      if (hit) r.impulse(hit.point, hit.dir, hit.force * (head ? 0.8 : 1.2));
      if (hit && hit.point.y < 0.85) r.sweepLegs(hit.dir, 1 + hit.force * 0.4);
      if (!wasDown && this.mesh.visible) this.dropGun(r);
    }
    this.mgr.scene.remove(this.mesh);
    // Drop everything they carried as a lootable body.
    const grid = makeGrid(8, 8);
    for (const it of this.inv.items) addItem(grid, it);
    if (this.weapon) addItem(grid, this.weapon);
    if (this.melee) addItem(grid, makeItem(this.melee));
    if (this.weapon && this.reserve > 0) addItem(grid, makeItem(ITEMS[this.weapon.key].ammo, { count: this.reserve }));
    const body = game.addExtraContainer({ type: 'body', name: `${this.name}'s body`, x: this.pos.x, z: this.pos.z, grid, color: this.look.shirt, look: r?.look, ragdoll: r });
    if (r) {
      r.onSettle = (rr) => {
        body.x = rr.pelvis.x; body.z = rr.pelvis.z;
        if (!rr.pooled) { rr.pooled = true; game.fx.pool((rr.pelvis.x + rr.p[JOINT.CHE].x) / 2, (rr.pelvis.z + rr.p[JOINT.CHE].z) / 2, 1 + Math.random() * 0.6); }
      };
      if (r.sleeping) { r.onSettle(r); r.freeze(); }
    }
    const near = this.mgr.distToPlayer(this) < 40;
    if (source === 'player') game.hud.message(`You killed ${this.met ? this.name : 'a survivor'}.`, 3);
    else if (near && this.met) game.hud.message(`${this.name} is dead.`, 3);
    // Bitten survivors can come back as one of them.
    if (source === 'zombie' && Math.random() < 0.45) {
      setTimeout(() => {
        if (r && !r.dead) { game.ragdolls?.remove(r); body.ragdoll = null; }
        if (!game.zombies) return;
        const z = game.zombies.spawn(this.pos.x, this.pos.z, 'walker');
        z.state = 'wander';
        if (this.mgr.distToPlayer(this) < 30) game.hud.message(`${this.met ? this.name : 'The body'} gets back up...`, 4);
      }, 6000);
    }
  }

  dropGun(r) {
    const rd = this.mgr.game.ragdolls;
    const src = this.gunMesh.children[0];
    if (!src) return;
    this.mesh.updateMatrixWorld(true);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.gunMesh.getWorldPosition(a);
    this.muzzle.getWorldPosition(b);
    const m = src.clone();
    m.castShadow = true;
    const vel = new THREE.Vector3(this.vx, 1 + Math.random(), this.vz).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(2));
    rd.dropProp(m, a, b, vel);
  }

  // ---------------------------------------------------------------------
  update(dt, game) {
    const p = game.player;
    const hash = this.mgr.world.hash;
    if (this.down) {
      // On the ground: follow the ragdoll, get up once it has settled.
      const r = this.down;
      this.pos.x = r.pelvis.x; this.pos.z = r.pelvis.z;
      if (r.sleeping || r.age > 6) { this.downT -= dt; if (this.downT <= 0) this.getUp(); }
      return;
    }
    if (this.rise > 0) { this.rise -= dt / 1.5; this.vx = this.vz = 0; this.applyPose(dt); return; }
    const dP = this.pos.distanceTo(p.pos);
    if (this.sayT > 0) this.sayT -= dt;
    this.speechCd -= dt; this.fireCd -= dt; this.aggroPlayer -= dt;
    if (this.hitFlash > 0) { this.hitFlash -= dt; for (const m of this.mats) m.emissive.setHex(this.hitFlash > 0 ? 0x550000 : 0); }

    // Far away and calm: cheap update, just drift toward the goal.
    const far = dP > 110 && !this.target;

    // --- perception ---
    this.percT -= dt;
    if (this.percT <= 0 && !far) {
      this.percT = 0.3;
      this.perceive(game, dP);
    }
    if (this.target && (this.target.dead || (this.target !== p && this.target.pos.distanceTo(this.pos) > 45))) this.target = null;
    if (this.target === p && (p.dead || this.disp !== 'hostile' && this.aggroPlayer <= 0)) this.target = null;

    // Slowly heal when nothing is going on
    if (!this.target) { this.regen += dt; if (this.regen > 4) { this.regen = 0; this.hp = Math.min(this.maxHp, this.hp + 2); } }

    // --- watch the player's gun ---
    if (this.disp !== 'hostile' && dP < 25 && p.ads > 0.6 && p.active === 'gun') {
      const ang = Math.atan2(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
      const aimAng = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
      const da = Math.abs(Math.atan2(Math.sin(ang - aimAng), Math.cos(ang - aimAng)));
      if (da < 0.08) {
        this.aimWatch += dt;
        if (this.aimWatch > 1.2) {
          if (!this.warned) { this.warned = true; this.say(this.disp === 'friendly' ? "Hey! Lower your weapon!" : this.line('warn')); }
          this.changeTrust(-12 * dt);
        }
      } else this.aimWatch = Math.max(0, this.aimWatch - dt);
    }

    // --- decide what to do ---
    let moveTo = null, run = false, face = null;
    const t = this.target;
    const gunStats = this.weapon ? AI_GUNS[this.weapon.key] : null;
    const hasAmmo = this.weapon && (this.roundsLoaded() > 0 || this.reserve > 0);
    if (!t) this.fleeing = false;
    if (t) {
      this.state = 'combat';
      const tp = t.pos;
      const dT = this.pos.distanceTo(tp);
      const fleeHp = this.order === 'follow' ? 15 : 30;
      if (this.hp < fleeHp && this.disp !== 'friendly') {
        // Run away from the threat
        if (!this.fleeing) { this.fleeing = true; this.say(pick(FLEE_LINES)); }
        this.state = 'flee';
        const ax = this.pos.x - tp.x, az = this.pos.z - tp.z, al = Math.hypot(ax, az) || 1;
        moveTo = { x: this.pos.x + (ax / al) * 10, z: this.pos.z + (az / al) * 10 };
        run = true;
      } else if (hasAmmo && gunStats) {
        face = tp;
        const isZombie = !!t.def;
        const want = isZombie ? 7 : Math.min(gunStats.range * 0.5, 14);
        if (dT > gunStats.range * 0.8) { moveTo = tp; run = dT > 20; }
        else if (isZombie && dT < 3.5) { // back-pedal from close zombies
          const ax = this.pos.x - tp.x, az = this.pos.z - tp.z, al = Math.hypot(ax, az) || 1;
          moveTo = { x: this.pos.x + (ax / al) * 3, z: this.pos.z + (az / al) * 3 };
        } else if (!isZombie && dT < want * 0.6) {
          const ax = this.pos.x - tp.x, az = this.pos.z - tp.z, al = Math.hypot(ax, az) || 1;
          moveTo = { x: this.pos.x + (ax / al) * 3 + az / al * 2, z: this.pos.z + (az / al) * 3 - ax / al * 2 };
        }
        this.combatShoot(dt, game, t, dT, gunStats);
      } else {
        // Melee: close in and swing
        face = tp;
        if (dT > 1.4) { moveTo = tp; run = true; }
        else if (this.fireCd <= 0) {
          this.fireCd = 1.1;
          const dmg = AI_MELEE[this.melee] || 15;
          this.mgr.hitTarget(this, t, dmg * (0.7 + Math.random() * 0.6), true);
          sfx.swing();
        }
      }
    } else if (this.order === 'follow' && !p.dead) {
      this.state = 'follow';
      if (dP > 3.5) { moveTo = p.pos; run = dP > 9; }
      else face = p.pos;
    } else if (this.order === 'wait') {
      this.state = 'wait';
      if (dP < 6) face = p.pos;
    } else if (this.home) {
      // Traders mind their counter: back to it, facing the door or a customer.
      this.state = 'post';
      const hd = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      if (hd > 0.35) moveTo = this.home;
      else if (dP < 9 && this.mgr.canSeePlayer(this)) {
        face = p.pos;
        if (!this.greeted && dP < 6) { this.greeted = true; this.say(this.mgr.game.traders?.greet(this) || this.line('greet')); }
      } else face = { x: this.pos.x + Math.sin(this.home.dir), z: this.pos.z + Math.cos(this.home.dir) };
      if (dP > 14) this.greeted = false;
    } else {
      this.state = 'roam';
      // Stop and face a nearby player
      if (dP < 9 && this.mgr.canSeePlayer(this)) {
        face = p.pos;
        if (!this.greeted && this.disp !== 'hostile' && dP < 7) {
          this.greeted = true;
          this.say(this.disp === 'friendly' ? this.line('greet') : this.line('warn'));
        }
        if (this.disp === 'neutral' && dP < 3) { // step back from strangers
          const ax = this.pos.x - p.pos.x, az = this.pos.z - p.pos.z, al = Math.hypot(ax, az) || 1;
          moveTo = { x: this.pos.x + (ax / al) * 2, z: this.pos.z + (az / al) * 2 };
        }
      } else {
        if (dP > 14) this.greeted = false;
        if (!this.goal || (this.path.length === 0 && this.linger <= 0)) this.pickGoal(game);
        if (this.path.length === 0) this.linger -= dt;
        else moveTo = null; // follow path below
      }
    }

    // Traders fight from their post instead of chasing zombies across town.
    if (this.home && t && this.disp !== 'hostile') {
      const hd = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      if (t.def || hd > 12) { moveTo = hd > 0.5 ? this.home : null; run = false; if (!moveTo) this.path = []; }
    }
    // Talking or trading with the player: stand still and face them.
    if (this.mgr.dialogFor === this || game.openContainer?.survivor === this || (this.trader && game.traders?.open === this.trader)) { moveTo = null; this.path = []; face = p.pos; }

    // --- movement ---
    const speed = run ? 3.6 : 1.45;
    let mx = 0, mz = 0;
    if (moveTo) {
      // Direct if there's a clear line, otherwise pathfind there.
      const clear = this.mgr.clearLine(this.pos.x, this.pos.z, moveTo.x, moveTo.z);
      if (clear) { this.path = []; mx = moveTo.x - this.pos.x; mz = moveTo.z - this.pos.z; }
      else {
        this.repathT = (this.repathT || 0) - dt;
        if (this.repathT <= 0 || this.path.length === 0) { this.repathT = 1.2; this.path = this.mgr.findPath(this.pos.x, this.pos.z, moveTo.x, moveTo.z) || []; }
      }
    }
    if (this.path.length) {
      const wp = this.path[0];
      mx = wp.x - this.pos.x; mz = wp.z - this.pos.z;
      if (Math.hypot(mx, mz) < 0.5) { this.path.shift(); if (!this.path.length && this.state === 'roam') this.linger = 8 + Math.random() * 20; }
      this.mgr.openDoorsAhead(this);
    }
    const ml = Math.hypot(mx, mz);
    let moved = 0;
    if (ml > 0.3 && !(this.state === 'follow' && !this.path.length && ml < 3.5)) {
      const bx = this.pos.x, bz = this.pos.z;
      const sp = Math.min(speed, ml / Math.max(dt, 1e-3));
      moveCircle(hash, this.pos, this.radius, (mx / ml) * sp * dt, (mz / ml) * sp * dt);
      // Don't walk through the player
      const ox = this.pos.x - p.pos.x, oz = this.pos.z - p.pos.z, od = Math.hypot(ox, oz);
      if (od < 0.65 && od > 1e-4) { this.pos.x = p.pos.x + (ox / od) * 0.65; this.pos.z = p.pos.z + (oz / od) * 0.65; }
      moved = Math.hypot(this.pos.x - bx, this.pos.z - bz);
      if (moved < sp * dt * 0.25) { this.stuckT += dt; if (this.stuckT > 2) { this.stuckT = 0; this.path = []; this.goal = null; } }
      else this.stuckT = 0;
      if (!face) face = { x: this.pos.x + mx, z: this.pos.z + mz };
    }
    if (face) {
      const td = Math.atan2(face.x - this.pos.x, face.z - this.pos.z);
      const dd = Math.atan2(Math.sin(td - this.dir), Math.cos(td - this.dir));
      this.dir += dd * Math.min(1, dt * 7);
    }

    // --- animation ---
    this.phase += moved * 3;
    const sw = Math.sin(this.phase) * 0.55;
    this.legL.rotation.x = sw; this.legR.rotation.x = -sw;
    // Arms point along +z from the shoulder: 0 = straight ahead (aiming),
    // positive = lowered. Guns are carried at low ready, melee weapons at the side.
    const aiming = this.state === 'combat' && this.weapon;
    let armX;
    if (aiming) armX = 0.05;
    else if (this.weapon) armX = 0.75;
    else armX = 1.25 + Math.sin(this.phase) * 0.35 * (this.state === 'combat' ? 0 : 1);
    if (!this.weapon && this.state === 'combat' && this.fireCd > 0.8) armX = -0.4; // mid-swing
    this.armL.rotation.x = this.weapon ? armX : 1.25 - Math.sin(this.phase) * 0.35;
    this.armR.rotation.x = armX;
    this.armL.rotation.y = this.weapon ? 0.4 : 0;
    // The weapon prop rides in the right hand.
    const reach = 0.5;
    this.gunMesh.position.set(0.12, 1.42 - Math.sin(armX) * reach, Math.cos(armX) * reach * 0.8 + 0.05);
    this.gunMesh.rotation.x = this.weapon ? armX * 0.9 : armX - 1.2;
    this.vx = moved / dt * Math.sin(this.dir); this.vz = moved / dt * Math.cos(this.dir);
    this.applyPose(dt);
    this.mesh.visible = dP < (game.isNight ? 70 : 110);
  }

  roundsLoaded() {
    const w = this.weapon;
    if (!w) return 0;
    return (w.chamber || 0) + (ITEMS[w.key].tube ? w.tube || 0 : w.mag?.rounds || 0);
  }

  takeRound() {
    const w = this.weapon;
    if (w.chamber) { w.chamber = 0; }
    else if (ITEMS[w.key].tube) w.tube--;
    else w.mag.rounds--;
    // cycle
    if (ITEMS[w.key].tube) { if (w.tube > 0) { w.tube--; w.chamber = 1; } }
    else if (w.mag && w.mag.rounds > 0) { w.mag.rounds--; w.chamber = 1; }
  }

  reload() {
    const w = this.weapon, def = ITEMS[w.key];
    const cap = def.tube || ITEMS[def.magKey].cap;
    if (!def.tube && !w.mag) w.mag = makeItem(def.magKey, { rounds: 0 });
    const cur = def.tube ? w.tube || 0 : w.mag.rounds;
    const n = Math.min(cap - cur, this.reserve);
    this.reserve -= n;
    if (def.tube) w.tube = cur + n; else w.mag.rounds = cur + n;
    if (!w.chamber) { if (def.tube) { if (w.tube > 0) { w.tube--; w.chamber = 1; } } else if (w.mag.rounds > 0) { w.mag.rounds--; w.chamber = 1; } }
  }

  combatShoot(dt, game, t, dT, st) {
    const p = game.player;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.reload();
      return;
    }
    if (this.roundsLoaded() <= 0) {
      if (this.reserve > 0) { this.reloadT = 2.6; if (this.mgr.distToPlayer(this) < 25) sfx.magOut(); if (Math.random() < 0.4) this.say('Reloading!', 0.5); }
      return;
    }
    // Need line of sight, a moment to aim, and to be roughly facing the target.
    const tx = t.pos.x, tz = t.pos.z;
    if (!hasLOS(this.mgr.world.hash, this.pos.x, this.pos.z, tx, tz) || dT > st.range) { this.aimT = 0; return; }
    const ang = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    if (Math.abs(Math.atan2(Math.sin(ang - this.dir), Math.cos(ang - this.dir))) > 0.25) return;
    this.aimT += dt;
    if (this.aimT < 0.6 / this.skill || this.fireCd > 0) return;
    if (st.burst) {
      if (this.burst <= 0) this.burst = 2 + Math.floor(Math.random() * st.burst);
      this.burst--;
      this.fireCd = this.burst > 0 ? st.rate : 0.6 + Math.random() * 0.5;
    } else this.fireCd = st.rate * (0.9 + Math.random() * 0.5);
    this.takeRound();
    this.mgr.fireFx(this, tx, tz);
    if (!this.trader) game.zombies.noise(this.pos.x, this.pos.z, ITEMS[this.weapon.key].noise); // traders' guns don't draw crowds
    // Hit chance: skill, range, target movement / stance, darkness
    let chance = st.acc * this.skill * (1 - (dT / st.range) * 0.55);
    if (t === p) {
      if (p.speed > 2.5) chance *= 0.6; else if (p.speed > 0.5) chance *= 0.8;
      if (p.prone) chance *= 0.5; else if (p.crouch) chance *= 0.75;
    }
    if (game.isNight && !(t === p && p.flashlight)) chance *= 0.7;
    if (Math.random() < chance) this.mgr.hitTarget(this, t, st.dmg * (0.75 + Math.random() * 0.5));
    else game.fx.impact(new THREE.Vector3(tx + (Math.random() - 0.5) * 1.5, 0.3 + Math.random() * 1.6, tz + (Math.random() - 0.5) * 1.5));
  }

  perceive(game, dP) {
    const p = game.player;
    const mgr = this.mgr;
    const range = game.isNight ? 18 : 32;
    // Zombies
    let bestZ = null, bz = this.disp === 'hostile' ? 9 : 16;
    for (const z of game.zombies.list) {
      const d = this.pos.distanceTo(z.pos);
      if (d < bz && (d < 4 || hasLOS(mgr.world.hash, this.pos.x, this.pos.z, z.pos.x, z.pos.z))) { bz = d; bestZ = z; }
    }
    // The player
    const seesP = dP < range && mgr.canSeePlayer(this);
    if (seesP && this.disp === 'hostile' && !game.dev?.invisible) {
      if (!this.met) { this.met = true; }
      if (this.target !== p && this.speechCd <= 0) { this.speechCd = 12; this.say(pick(BANDIT_LINES)); }
      // Fight the player unless a zombie is right on top of us
      this.target = bestZ && bz < 4 ? bestZ : p;
      return;
    }
    if (this.aggroPlayer > 0 && seesP) { this.target = p; return; }
    // Other survivors: friendlies help the player against bandits shooting at them
    let enemy = null, be = 30;
    for (const o of mgr.list) {
      if (o === this || o.dead) continue;
      const hostileToUs = (o.disp === 'hostile' && this.disp !== 'hostile' && (o.target === p || o.target === this || o.target?.kind === 'survivor'))
        || (this.disp === 'hostile' && o.order === 'follow');
      if (!hostileToUs) continue;
      const d = this.pos.distanceTo(o.pos);
      if (d < be && hasLOS(mgr.world.hash, this.pos.x, this.pos.z, o.pos.x, o.pos.z)) { be = d; enemy = o; }
    }
    if (enemy && (this.disp === 'friendly' || this.order === 'follow' || enemy.target === this)) { this.target = enemy; return; }
    if (bestZ) { this.target = bestZ; return; }
    if (this.target && this.target.def && this.pos.distanceTo(this.target.pos) > 20) this.target = null;
  }

  pickGoal(game) {
    // Wander to a random building (scavenging) or a random street spot.
    const W = this.mgr.world;
    let tx, tz;
    if (Math.random() < 0.75 && W.buildings.length) {
      const b = pick(W.buildings);
      tx = (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * (b.x1 - b.x0) * 0.5;
      tz = (b.z0 + b.z1) / 2 + (Math.random() - 0.5) * (b.z1 - b.z0) * 0.5;
    } else {
      tx = this.pos.x + (Math.random() - 0.5) * 60; tz = this.pos.z + (Math.random() - 0.5) * 60;
    }
    // Hostiles keep away from the player's safehouse less; others avoid wandering into it.
    const sh = game.safehouse;
    if (sh && this.disp !== 'hostile' && tx > sh.x0 && tx < sh.x1 && tz > sh.z0 && tz < sh.z1) { this.goal = null; return; }
    this.goal = { x: tx, z: tz };
    this.path = this.mgr.findPath(this.pos.x, this.pos.z, tx, tz) || [];
    if (!this.path.length) this.goal = null;
  }

  serialize() {
    return {
      id: this.id, name: this.name, persona: this.persona, disp: this.disp, trust: Math.round(this.trust), met: this.met,
      hp: Math.round(this.hp), x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), dir: this.dir,
      weapon: this.weapon, melee: this.melee, reserve: this.reserve, inv: this.inv, look: this.look, order: this.order, skill: this.skill,
    };
  }
}

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------
const _ray = new THREE.Raycaster(), _hits = [];

export class Survivors {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;
    this.list = [];
    this.tracers = [];
    this.spawnTimer = 120;
    this.flash = new THREE.PointLight(0xffaa55, 0, 10, 2);
    this.scene.add(this.flash);
    this.tagLayer = document.getElementById('npc-tags');
    this.tagEls = new Map();
    this.buildDoorCells();
    // A* buffers
    const N = NAV_N * NAV_N;
    this.gScore = new Float32Array(N);
    this.came = new Int32Array(N);
    this.stamp = new Int32Array(N);
    this.closed = new Int32Array(N);
    this.searchId = 0;
  }

  // Cells covered by building doors: walkable for survivors (they open doors).
  buildDoorCells() {
    this.doorCell = new Uint8Array(NAV_N * NAV_N);
    for (const d of this.world.doors) {
      const b = d.box, r = 0.5;
      for (let x = b.minX - r; x <= b.maxX + r; x += NAV_CELL / 2) {
        for (let z = b.minZ - r; z <= b.maxZ + r; z += NAV_CELL / 2) {
          const i = Math.floor((x + HALF) / NAV_CELL), j = Math.floor((z + HALF) / NAV_CELL);
          if (i >= 0 && j >= 0 && i < NAV_N && j < NAV_N) this.doorCell[i * NAV_N + j] = 1;
        }
      }
    }
  }

  get nav() { return this.game.zombies.blocked; }
  passable(i, j) {
    if (i < 0 || j < 0 || i >= NAV_N || j >= NAV_N) return false;
    const k = i * NAV_N + j;
    return !this.nav[k] || this.doorCell[k] === 1;
  }

  // Straight walkable line on the nav grid (doors count as walkable).
  clearLine(x1, z1, x2, z2) {
    const d = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.ceil(d / 0.3);
    for (let s = 1; s <= n; s++) {
      const x = x1 + ((x2 - x1) * s) / n, z = z1 + ((z2 - z1) * s) / n;
      if (!this.passable(Math.floor((x + HALF) / NAV_CELL), Math.floor((z + HALF) / NAV_CELL))) return false;
    }
    return true;
  }

  // A* on the zombie nav grid with path smoothing.
  findPath(sx, sz, tx, tz) {
    const cell = (v) => Math.floor((v + HALF) / NAV_CELL);
    let si = cell(sx), sj = cell(sz), ti = cell(tx), tj = cell(tz);
    if (!this.passable(ti, tj)) {
      let found = false;
      for (let r = 1; r <= 5 && !found; r++) for (let a = -r; a <= r && !found; a++) for (let b = -r; b <= r; b++) {
        if (this.passable(ti + a, tj + b)) { ti += a; tj += b; found = true; break; }
      }
      if (!found) return null;
    }
    const N = NAV_N;
    const id = ++this.searchId;
    const start = si * N + sj, goal = ti * N + tj;
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const h = (i, j) => { const dx = Math.abs(i - ti), dj = Math.abs(j - tj); return dx + dj - 0.586 * Math.min(dx, dj); };
    this.stamp[start] = id; this.gScore[start] = 0; this.came[start] = -1;
    push(start, h(si, sj));
    let expanded = 0, found = false;
    while (heap.length && expanded < 30000) {
      const cur = pop();
      if (this.closed[cur] === id) continue;
      this.closed[cur] = id;
      if (cur === goal) { found = true; break; }
      expanded++;
      const ci = Math.floor(cur / N), cj = cur % N;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (!this.passable(ni, nj)) continue;
        if (di && dj && (!this.passable(ci + di, cj) || !this.passable(ci, cj + dj))) continue;
        const k = ni * N + nj;
        if (this.closed[k] === id) continue;
        const g = this.gScore[cur] + (di && dj ? 1.414 : 1);
        if (this.stamp[k] !== id || g < this.gScore[k]) {
          this.stamp[k] = id; this.gScore[k] = g; this.came[k] = cur;
          push(k, g + h(ni, nj));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = this.came[k]) cells.push(k);
    cells.reverse();
    const pts = cells.map((k) => ({ x: -HALF + (Math.floor(k / N) + 0.5) * NAV_CELL, z: -HALF + ((k % N) + 0.5) * NAV_CELL }));
    // Smooth: skip waypoints while the straight line stays walkable.
    const out = [];
    let a = { x: sx, z: sz };
    let i = 0;
    while (i < pts.length - 1) {
      let j = Math.min(pts.length - 1, i + 40);
      while (j > i + 1 && !this.clearLine(a.x, a.z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); a = pts[j]; i = j;
    }
    if (!out.length && pts.length) out.push(pts[pts.length - 1]);
    return out;
  }

  // Open closed building doors in the survivor's way.
  openDoorsAhead(s) {
    for (const d of this.world.doors) {
      if (d.open || d.broken) continue;
      if (Math.hypot(d.x - s.pos.x, d.z - s.pos.z) < 1.4) {
        setDoor(d, true);
        this.game.zombies.updateNavRegion(d.box.minX, d.box.minZ, d.box.maxX, d.box.maxZ);
        if (this.distToPlayer(s) < 20) sfx.door();
      }
    }
  }

  distToPlayer(s) { return s.pos.distanceTo(this.game.player.pos); }

  canSeePlayer(s) {
    const p = this.game.player;
    if (this.game.dev?.invisible) return false;
    const d = s.pos.distanceTo(p.pos);
    let range = this.game.isNight ? (p.flashlight ? 30 : 16) : 35;
    if (p.prone) range *= 0.45; else if (p.crouch) range *= 0.7;
    return d < range && hasLOS(this.world.hash, s.pos.x, s.pos.z, p.pos.x, p.pos.z);
  }

  // Closest survivor visible from a point (used by zombies to pick prey).
  nearestVisible(pos, range) {
    let best = null, bd = range;
    for (const s of this.list) {
      if (s.dead || s.trader) continue; // traders are left alone
      const d = s.pos.distanceTo(pos);
      if (d < bd && hasLOS(this.world.hash, pos.x, pos.z, s.pos.x, s.pos.z)) { bd = d; best = s; }
    }
    return best ? { s: best, d: bd } : null;
  }

  hitTarget(from, t, dmg, melee = false) {
    const g = this.game;
    if (t === g.player) { g.player.takeBulletHit(dmg, from.met ? from.name : 'a survivor'); return; }
    const head = !melee && Math.random() < 0.12;
    const point = new THREE.Vector3(t.pos.x, head ? 1.62 : 0.6 + Math.random() * 0.8, t.pos.z);
    const dir = new THREE.Vector3(t.pos.x - from.pos.x, (point.y - 1.35) * 0.2, t.pos.z - from.pos.z).normalize();
    const hit = { point, dir, force: Math.min(6, dmg * 0.075) };
    g.fx.blood(point, dir, { head, power: hit.force / 3, exit: !melee });
    if (t.kind === 'survivor') t.hurt(dmg * (head ? 2.5 : 1), 'survivor', from, hit);
    else if (t.def) g.zombies.damage(t, dmg * (head ? 3 : 1), from.pos.x, from.pos.z, head, hit);
  }

  fireFx(s, tx, tz) {
    const m = new THREE.Vector3();
    s.muzzle.getWorldPosition(m);
    const d = this.distToPlayer(s);
    sfx.shot(s.weapon.key, false, Math.max(0, 1 - d / 140) ** 1.5);
    this.flash.position.copy(m);
    this.flash.intensity = 25;
    const end = new THREE.Vector3(tx, 1.2, tz);
    const geo = new THREE.BufferGeometry().setFromPoints([m, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.7 }));
    this.scene.add(line);
    this.tracers.push({ line, t: 0.06 });
  }

  raycast(origin, dir, maxDist) {
    let best = null;
    for (const s of this.list) {
      if (s.dead || s.down) continue;
      const ox = s.pos.x - origin.x, oz = s.pos.z - origin.z;
      const hd = Math.hypot(dir.x, dir.z) || 1e-6;
      const tA = (ox * dir.x + oz * dir.z) / (hd * hd);
      if (tA < -1 || tA > maxDist + 1) continue;
      const cx = origin.x + dir.x * tA - s.pos.x, cz = origin.z + dir.z * tA - s.pos.z;
      // Rough reject, then the ray against the body you actually see
      if (Math.hypot(cx, cz) > 1.1) continue;
      s.mesh.updateMatrixWorld(true);
      _hits.length = 0;
      _ray.set(origin, dir); _ray.near = 0; _ray.far = maxDist;
      _ray.intersectObject(s.mesh, true, _hits);
      const h = _hits.find((x) => x.object.isMesh && !x.object.userData.noHit);
      if (!h || (best && h.distance >= best.t)) continue;
      let head = false;
      for (let o = h.object; o && o !== s.mesh; o = o.parent) if (o === s.head) head = true;
      best = { s, t: h.distance, head };
    }
    return best;
  }

  meleeTarget(pos, fx, fz, range) {
    let best = null, bd = range + 0.35;
    for (const s of this.list) {
      if (s.dead || s.down) continue;
      const dx = s.pos.x - pos.x, dz = s.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.6) { bd = d; best = s; }
    }
    return best;
  }

  // ---------- spawning & persistence ----------
  makeData(opts = {}) {
    const r = Math.random();
    const disp = opts.disp || (r < 0.45 ? 'friendly' : r < 0.75 ? 'neutral' : 'hostile');
    const gunChance = disp === 'hostile' ? 0.75 : 0.5;
    let weapon = null, reserve = 0;
    if (Math.random() < gunChance) {
      const key = pick(disp === 'hostile' ? ['pm', 'pm', 'mp133', 'sks', 'ak74'] : ['pm', 'pm', 'mp133', 'sks']);
      const def = ITEMS[key];
      weapon = makeItem(key, { loaded: def.tube || ITEMS[def.magKey].cap });
      reserve = Math.floor((def.tube || ITEMS[def.magKey].cap) * (1 + Math.random() * 2));
    }
    const inv = makeGrid(6, 5);
    for (const it of rollLoot(Math.random() < 0.5 ? 'body' : 'cabinet', 2 + Math.floor(Math.random() * 3))) addItem(inv, it);
    if (Math.random() < 0.6) addItem(inv, makeItem(pick(['beans', 'water', 'crackers', 'soda'])));
    if (Math.random() < 0.5) addItem(inv, makeItem('bandage'));
    return {
      id: Math.random().toString(36).slice(2, 9),
      name: randomName(),
      persona: pick(Object.keys(PERSONAS)),
      disp,
      trust: disp === 'friendly' ? 30 : disp === 'neutral' ? 5 : -50,
      met: false,
      hp: 100,
      x: opts.x, z: opts.z,
      weapon, reserve,
      melee: pick(['knife', 'crowbar', 'hammer', 'axe', 'knife']),
      inv,
      look: { shirt: pick(SHIRTS), pants: pick(PANTS), skin: pick(SKINS), hair: pick([0x2a1a10, 0x5a3a20, 0x111111, 0x8a6a40, 0x888888]), hat: Math.random() < 0.35 ? pick([0x3a4a2a, 0x222222, 0x5a2a2a]) : null, pack: pick([0x3a3a2a, 0x2a3a2a, 0x4a3a2a]) },
    };
  }

  spawn(opts = {}) {
    if (opts.x == null) {
      const p = this.game.zombies.randomOpenPoint(this.game.player.pos, 45, this.game.safehouse);
      if (!p) return null;
      opts.x = p.x; opts.z = p.z;
    }
    const s = new Survivor(this, this.makeData(opts));
    this.list.push(s);
    return s;
  }

  populate(n) { for (let i = 0; i < n; i++) this.spawn(); }

  // A survivor with fixed data (e.g. a trader); not saved with the others.
  addNPC(d) {
    const s = new Survivor(this, d);
    this.list.push(s);
    return s;
  }

  restore(saved) { for (const d of saved) this.list.push(new Survivor(this, d)); }

  serialize() { return this.list.filter((s) => !s.dead && !s.trader).map((s) => s.serialize()); }

  dispose() {
    for (const s of this.list) this.scene.remove(s.mesh);
    for (const t of this.tracers) this.scene.remove(t.line);
    this.scene.remove(this.flash);
    this.list = [];
    this.tagLayer.innerHTML = '';
    this.tagEls.clear();
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    for (const s of this.list) if (!s.dead) s.update(dt, g);
    this.list = this.list.filter((s) => !s.dead);
    this.flash.intensity *= Math.exp(-dt * 40);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      if (t.t <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    // New survivors drift into town over time.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 180 + Math.random() * 180;
      if (this.list.filter((s) => !s.trader).length < MAX_SURVIVORS) this.spawn();
    }
    this.drawTags();
  }

  // Name tags + speech above survivors near the player.
  drawTags() {
    const g = this.game, cam = g.camera, p = g.player;
    const v = new THREE.Vector3();
    const seen = new Set();
    for (const s of this.list) {
      const d = s.pos.distanceTo(p.pos);
      if (d > 25) continue;
      s.tagVisT = (s.tagVisT || 0) - 1;
      if (s.tagVisT <= 0) { s.tagVisT = 10; s.tagVis = hasLOS(this.world.hash, p.pos.x, p.pos.z, s.pos.x, s.pos.z); }
      if (!s.tagVis) continue;
      v.set(s.pos.x, 2.05, s.pos.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      seen.add(s);
      let el = this.tagEls.get(s);
      if (!el) { el = document.createElement('div'); el.className = 'npc-tag'; this.tagLayer.appendChild(el); this.tagEls.set(s, el); }
      const known = s.met || s.disp === 'hostile' && s.target;
      const label = s.trader && s.disp !== 'hostile' ? `${s.name} <span class="trader">${s.trader.def.title}</span>`
        : known ? `${s.name} <span class="${s.disp}">${DISP_LABEL[s.disp]}${s.order === 'follow' ? ' · following' : s.order === 'wait' ? ' · waiting' : ''}</span>` : '<span class="unknown">Stranger</span>';
      el.innerHTML = (s.sayT > 0 ? `<div class="say">${s.say_}</div>` : '') + label;
      el.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
      el.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
      el.style.opacity = Math.max(0.3, 1 - d / 25);
    }
    for (const [s, el] of this.tagEls) if (!seen.has(s)) { el.remove(); this.tagEls.delete(s); }
  }

  // ---------- dialogue ----------
  openDialog(s) {
    const g = this.game;
    s.met = true;
    s.say_ = null;
    s.sayT = 0;
    this.dialogFor = s;
    g.dialogOpen = true;
    g.input.unlock();
    this.renderDialog(s, s.disp === 'friendly' ? s.line('greet') : s.line('warn'));
    document.getElementById('dialog').style.display = 'flex';
    g.updatePause();
  }

  closeDialog() {
    const g = this.game;
    if (!g.dialogOpen) return;
    g.dialogOpen = false;
    this.dialogFor = null;
    document.getElementById('dialog').style.display = 'none';
    if (!g.invOpen) g.resume();
    g.updatePause();
  }

  renderDialog(s, text) {
    const el = document.getElementById('dialog');
    const opts = [];
    const add = (label, fn) => opts.push([label, fn]);
    add('Who are you?', () => this.renderDialog(s, s.line('bio')));
    add('Heard anything useful?', () => this.renderDialog(s, this.rumor(s)));
    add('Want to trade?', () => { this.closeDialog(); this.game.openTrade(s); });
    if (s.disp === 'friendly') {
      if (s.order !== 'follow') add('Come with me.', () => {
        if (s.trust >= 20) { s.order = 'follow'; this.renderDialog(s, "Alright. Lead the way — I've got your back."); }
        else this.renderDialog(s, "I don't know you well enough for that yet.");
      });
      if (s.order === 'follow') add('Wait here.', () => { s.order = 'wait'; this.renderDialog(s, "I'll hold here."); });
      if (s.order) add('Go your own way.', () => { s.order = null; this.renderDialog(s, 'Take care out there.'); });
    } else {
      add('I mean you no harm.', () => {
        if (!s.reassured) { s.reassured = true; s.changeTrust(6); }
        this.renderDialog(s, s.trust >= 25 ? "...Alright. I believe you." : "Words are cheap. We'll see.");
      });
    }
    add('Goodbye.', () => this.closeDialog());
    const trust = s.trust >= 50 ? 'trusts you' : s.trust >= 20 ? 'friendly' : s.trust >= 0 ? 'cautious' : 'distrustful';
    el.innerHTML = `<div class="dlg-panel"><div class="dlg-name">${s.name} <span class="${s.disp}">${DISP_LABEL[s.disp]}</span> <span class="dim">· ${trust} (${Math.round(s.trust)})</span></div>
      <div class="dlg-text">"${text}"</div><div class="dlg-opts"></div><div class="hint">1–${opts.length} to choose · Esc to leave</div></div>`;
    const box = el.querySelector('.dlg-opts');
    opts.forEach(([label, fn], i) => { const b = document.createElement('button'); b.textContent = `${i + 1}. ${label}`; b.onclick = fn; box.appendChild(b); });
    this.dialogOpts = opts;
    sfx.voice(0.6);
  }

  dialogKey(code) {
    if (code === 'Escape') return this.closeDialog();
    const n = parseInt(code.replace('Digit', ''), 10);
    if (n >= 1 && this.dialogOpts?.[n - 1]) this.dialogOpts[n - 1][1]();
  }

  rumor(s) {
    const W = this.world, p = this.game.player.pos;
    const interesting = W.buildings.filter((b) => b.kind !== 'house');
    const b = pick(interesting.length ? interesting : W.buildings);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const bearing = ((Math.atan2(cx - p.x, -(cz - p.z)) * 180) / Math.PI + 360) % 360;
    const dir = dirs[Math.round(bearing / 45) % 8];
    const dist = Math.round(Math.hypot(cx - p.x, cz - p.z) / 10) * 10;
    const what = {
      clinic: 'a clinic — there might still be meds inside', warehouse: 'a warehouse with lumber and tools', shop: "a shop that wasn't fully picked clean",
      pharmacy: 'a pharmacy — the shelves might still have pills', hospital: "the hospital. Full of them, but the medicine's worth it",
      office: 'an office block — people say there are drives and documents worth a fortune', skyscraper: 'the tower downtown. Executives kept safes up there',
      police: "the police station. Lockers full of sidearms, if you can get in", grocery: 'a grocery store with food left on the shelves',
      hardware: 'a hardware store — tools, nails, planks', gas: 'a gas station with snacks in the kiosk',
      compound: "a military outpost. Soldiers turned, but their gear's still there", military: 'the army command post',
    }[b.kind] || 'a house that looked untouched';
    if (s.trust < 10 && Math.random() < 0.5) return "Why would I tell you anything?";
    if (Math.random() < 0.4) { const t = this.game.traders?.rumor(); if (t) return t; }
    return `There's ${what}, about ${dist} metres ${dir} of here.`;
  }

  // Trading: value moved between the player and the survivor decides trust.
  endTrade(s, before) {
    const after = s.inv.items.reduce((n, it) => n + itemValue(it), 0);
    const delta = after - before; // > 0: the player gave more than they took
    if (delta < -300) {
      s.changeTrust(Math.max(-60, delta / 150));
      s.say(s.disp === 'hostile' ? pick(BETRAYED_LINES) : "Hey! That's not yours!");
      if (s.disp === 'hostile') { s.aggroPlayer = 20; }
    } else if (delta > 300) {
      s.changeTrust(Math.min(20, delta / 700));
      s.say(s.line('thanks'));
    } else if (before !== after) s.say('Fair deal.');
  }
}
