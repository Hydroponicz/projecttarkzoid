// Explosions (grenades, drone payloads): a fireball, smoke and debris, a
// scorch mark, the boom, and damage falling off with distance. Walls between
// the blast and a target shield it; windows shatter and doors splinter in
// range, bodies are thrown, and every zombie for a long way hears it.
import * as THREE from 'three';
import { sfx } from './audio.js';
import { raycast } from './collision.js';

const FIRE = [0xfff0a0, 0xffb040, 0xff7020].map((c) => new THREE.Color(c));
const SMOKE = new THREE.Color(0x3a3834), DIRT = new THREE.Color(0x5a4a38);
const UP = new THREE.Vector3(0, 1, 0);

// opts: { radius (m), damage (at the centre), frag (shrapnel reach, m), big
// (0.5 .. 1.5: how loud and large it looks), by (a name for messages) }
export function explode(game, pos, opts = {}) {
  const R = opts.radius ?? 6, D = opts.damage ?? 200, F = opts.frag ?? R * 2, big = opts.big ?? 1;
  const fx = game.fx, p = game.player, y = pos.y;
  // fireball, smoke rising, dirt and fragments flung out
  for (let i = 0; i < 18 * big; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 6 * big);
    fx.particle(pos, v, FIRE[i % 3], 0.12 + Math.random() * 0.18 * big, 0.25 + Math.random() * 0.2, { drag: 4, grow: 1.2, grav: -1 });
  }
  for (let i = 0; i < 16 * big; i++) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3);
    fx.particle(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * R * 0.3, Math.random() * 0.8, (Math.random() - 0.5) * R * 0.3)), v, SMOKE.clone().multiplyScalar(0.7 + Math.random() * 0.6), 0.2 + Math.random() * 0.25, 2 + Math.random() * 2, { drag: 1.2, grow: 0.45, grav: -0.6 });
  }
  for (let i = 0; i < 14 * big; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 12);
    fx.particle(pos, v, DIRT, 0.04 + Math.random() * 0.05, 1 + Math.random(), { drag: 0.4, grav: 9.8 });
  }
  fx.holes.add(pos.clone().setY(y + 0.02), UP, R * 0.45);
  // the flash
  game.lights.burst(pos.clone().setY(y + 1.2), 120 * big, { color: 0xffa050, distance: 12 + 14 * big, decay: 1.6, linear: 400 * big });
  // the boom, heard and felt
  const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, d = Math.hypot(dx, dz);
  const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const pan = d > 0.5 ? (dx * right.x + dz * right.z) / d : 0;
  sfx.explosion(Math.min(1, (35 * big) / (d + 12)), pan, d / 343, big);
  game.shake = Math.max(game.shake || 0, Math.min(1.2, (16 * big) / (d + 4)));
  game.zombies.noise(pos.x, pos.z, 70 + 50 * big, true, y);

  // Damage, falling off with distance; a wall in between shields you
  const hash = game.world.hash;
  // Cover: a wall stops it; something low (a car, a counter) takes half
  const cover = (x, z, ty) => {
    if (Math.hypot(x - pos.x, z - pos.z) < 1) return 1;
    const lo = Math.min(y, ty);
    if (raycast(hash, pos.x, pos.z, x, z, 'blocksShot', lo + 1.9).t < 1) return 0;
    return raycast(hash, pos.x, pos.z, x, z, 'blocksShot', lo + 0.3).t < 1 ? 0.5 : 1;
  };
  const sameLevel = (ty) => ty > y - 2.2 && ty < y + 2.2;
  const hurt = (dd) => (dd < R ? D * Math.pow(1 - dd / R, 0.7) : dd < F && Math.random() < 0.35 * (1 - (dd - R) / (F - R)) ? 25 + Math.random() * 30 : 0);
  for (const zb of [...game.zombies.list]) {
    const dd = Math.hypot(zb.pos.x - pos.x, zb.pos.z - pos.z);
    if (dd > F || !sameLevel(zb.pos.y)) continue;
    const dmg = hurt(dd) * cover(zb.pos.x, zb.pos.z, zb.pos.y);
    if (!dmg) continue;
    const dir = new THREE.Vector3(zb.pos.x - pos.x, 1.4, zb.pos.z - pos.z).normalize();
    if (dd < R * 0.65) game.zombies.blastLegs(zb, (1 - dd / (R * 0.65)) * cover(zb.pos.x, zb.pos.z, zb.pos.y), dir); // (legs blown off)
    const killed = game.zombies.damage(zb, dmg, pos.x, pos.z, false, { point: zb.pos.clone().setY(zb.pos.y + 0.9), dir, force: Math.min(16, (dmg / D) * 18 * big) });
    if (killed && opts.byPlayer !== false) { p.kills++; game.traders?.onKill(zb); game.progress?.onKill(zb); }
  }
  for (const s of game.survivors?.list || []) {
    if (s.dead) continue;
    const dd = Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z);
    if (dd > F) continue;
    const dmg = hurt(dd) * cover(s.pos.x, s.pos.z, 0);
    if (dmg) s.hurt(dmg, opts.byPlayer === false ? 'explosion' : 'player', null);
  }
  const pd = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
  if (!p.dead && pd < F && sameLevel(p.floorY)) {
    const dmg = hurt(pd) * cover(p.pos.x, p.pos.z, p.floorY);
    if (dmg) { p.takeBulletHit(dmg * 0.6, opts.by || 'the blast'); if (dmg > 60) p.takeBulletHit(dmg * 0.3, null); }
  }
  // bodies on the ground are thrown
  for (const r of game.ragdolls.list) {
    if (r.frozen || r.pelvis.distanceTo(pos) > R) continue;
    r.impulse(r.pelvis.clone(), r.pelvis.clone().sub(pos).setY(1).normalize(), 6 * big);
  }
  // windows, doors and what you've built
  const W = game.world;
  for (const w of W.windows) {
    if (w.state === 'broken' || Math.hypot(w.x - pos.x, w.z - pos.z) > R * 1.4 || !sameLevel((w.base || 0) + 1)) continue;
    game.breakWindow(w, new THREE.Vector3(w.x, (w.base || 0) + (w.sill + w.top) / 2, w.z), new THREE.Vector3(w.x - pos.x, 0, w.z - pos.z).normalize());
  }
  for (const dr of W.doors) {
    const dd = Math.hypot(dr.x - pos.x, dr.z - pos.z);
    if (dr.hp <= 0 || dd > R || !sameLevel((dr.base || 0) + 1)) continue;
    game.damageStructure(dr, D * (1 - dd / R) * 1.5, pos);
  }
  for (const s of game.builder?.structures || []) {
    const dd = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (dd < R && s.hp > 0) game.damageStructure(s, D * (1 - dd / R), pos);
  }
}
