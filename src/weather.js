// Weather and seasons. A year is four 7-day seasons that set temperature,
// day length, which weather is likely and how crops grow. Weather moves in
// fronts (clear, cloudy, overcast, fog, rain, thunderstorm, snow, blizzard):
// storms build through overcast skies with the wind rising, then ease off
// into rain. Everything blends over in-game time.
//
// Gameplay: rain and snow soak you, cold and wet bring your body temperature
// down (shelter, a campfire, a running car's heater and warm clothes help),
// summer heat makes you thirsty; rain and wind mask noise and fog, rain and
// snow shorten how far zombies see; the cold makes zombies sluggish; rain
// waters crops, frost and winter stop them; wet and snowy roads are slippery;
// lightning strikes draw the dead. Rain barrels collect drinking water.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { sfx, ambientLoop } from './audio.js';

export const SEASON_DAYS = 7;
const START_OFFSET = 4; // a new world starts on day 5 of spring

export const SEASONS = [
  { id: 'spring', name: 'Spring', temp: 12, swing: 7, sunrise: 6, sunset: 20, crops: 1, forage: 1, leaf: [0.95, 1.15, 0.9],
    w: { clear: 3, cloudy: 3, overcast: 2, fog: 1.5, rain: 3, storm: 1 } },
  { id: 'summer', name: 'Summer', temp: 24, swing: 8, sunrise: 5, sunset: 21.5, crops: 1.15, forage: 1.2, leaf: [1, 1, 1],
    w: { clear: 5, cloudy: 3, overcast: 1.5, fog: 0.3, rain: 1.2, storm: 2.4 } },
  { id: 'autumn', name: 'Autumn', temp: 10, swing: 6, sunrise: 6.5, sunset: 19, crops: 0.8, forage: 0.8, leaf: [2.6, 1.0, 0.4],
    w: { clear: 2, cloudy: 3, overcast: 3, fog: 3, rain: 5, storm: 1.2 } },
  { id: 'winter', name: 'Winter', temp: -4, swing: 5, sunrise: 7.5, sunset: 17.5, crops: 0, forage: 0.1, leaf: [1.9, 0.95, 0.9],
    w: { clear: 2, cloudy: 2, overcast: 3, fog: 1.5, rain: 0.4, snow: 4, blizzard: 1.2 } },
];

// cloud: sky cover (dims the sun), fog: extra fog density, rain/snow:
// precipitation, wind: m/s, sight/hear: zombie perception multipliers.
export const STATES = {
  clear: { name: 'Clear', icon: '☀', cloud: 0, fog: 0, rain: 0, snow: 0, wind: [0, 4], hours: [4, 12] },
  cloudy: { name: 'Cloudy', icon: '⛅', cloud: 0.35, fog: 0, rain: 0, snow: 0, wind: [2, 6], hours: [3, 9] },
  overcast: { name: 'Overcast', icon: '☁', cloud: 0.7, fog: 0.004, rain: 0, snow: 0, wind: [3, 8], hours: [2, 7] },
  fog: { name: 'Fog', icon: '🌫', cloud: 0.55, fog: 0.035, rain: 0, snow: 0, wind: [0, 2], hours: [2, 6] },
  rain: { name: 'Rain', icon: '🌧', cloud: 0.8, fog: 0.01, rain: 0.6, snow: 0, wind: [3, 9], hours: [2, 8] },
  storm: { name: 'Thunderstorm', icon: '⛈', cloud: 1, fog: 0.016, rain: 1, snow: 0, wind: [9, 17], hours: [1.5, 3.5], lightning: true },
  snow: { name: 'Snow', icon: '🌨', cloud: 0.8, fog: 0.012, rain: 0, snow: 0.6, wind: [1, 6], hours: [3, 8] },
  blizzard: { name: 'Blizzard', icon: '❄', cloud: 1, fog: 0.045, rain: 0, snow: 1, wind: [12, 20], hours: [1, 4] },
};
// How fronts follow each other: weights for the next state given the current
// one (multiplied by the season's own weights). Storms come out of overcast
// skies and leave as rain; blizzards come out of snow.
const AFTER = {
  clear: { clear: 1, cloudy: 3, overcast: 0.6, fog: 0.8, rain: 0.2, storm: 0.05, snow: 0.2, blizzard: 0 },
  cloudy: { clear: 2, cloudy: 0.5, overcast: 2.5, fog: 0.5, rain: 1, storm: 0.5, snow: 1, blizzard: 0 },
  overcast: { clear: 0.3, cloudy: 1.5, overcast: 0.4, fog: 0.8, rain: 2.5, storm: 2, snow: 2.5, blizzard: 0.6 },
  fog: { clear: 1.5, cloudy: 2, overcast: 1, fog: 0.2, rain: 0.6, storm: 0.1, snow: 0.6, blizzard: 0 },
  rain: { clear: 0.3, cloudy: 2, overcast: 2, fog: 1, rain: 0.5, storm: 0.6, snow: 0.3, blizzard: 0 },
  storm: { clear: 0, cloudy: 0.3, overcast: 1, fog: 0, rain: 4, storm: 0.2, snow: 0, blizzard: 0 },
  snow: { clear: 0.6, cloudy: 1.5, overcast: 2, fog: 0.5, rain: 0.2, storm: 0, snow: 0.6, blizzard: 1.5 },
  blizzard: { clear: 0, cloudy: 0.5, overcast: 1, fog: 0, rain: 0, storm: 0, snow: 4, blizzard: 0.2 },
};
// Warm clothes: clothing items carry warmth (°C of insulation) and rain
// (how much of a downpour they keep off)
const BASE_WARMTH = 4;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// Seeded noise per day so a day's temperature quirk is stable
const dayNoise = (d, k = 0) => { const x = Math.sin(d * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

export class Weather {
  constructor(game, saved) {
    this.game = game;
    const s = saved || {};
    this.offset = s.offset ?? START_OFFSET;
    this.state = s.state || 'cloudy';
    this.next = s.next || null;
    this.left = s.left ?? 4 * 60;       // game minutes until the front changes
    this.snowCover = s.snowCover ?? 0;  // 0..1 snow on the ground
    this.wetGround = s.wetGround ?? 0;  // 0..1 puddles and mud
    this.windDir = s.windDir ?? Math.random() * Math.PI * 2;
    // Blended values (start at the state's own values)
    const st = STATES[this.state];
    this.mix = s.mix || { cloud: st.cloud, fog: st.fog, rain: st.rain, snow: st.snow, wind: (st.wind[0] + st.wind[1]) / 2 };
    this.windTarget = this.mix.wind;
    this.last = game.time;
    if (!this.next) this.pickNext();
    this.flash = 0;
    this.lightningT = 8 + Math.random() * 10;
    this.thunders = [];
    this.bolt = null;
    this.buildVisuals();
    this.rainLoop = ambientLoop('rain');
    this.windLoop = ambientLoop('wind');
    this.applySeasonLook();
  }

  // ---------- calendar ----------
  get dayOfYear() { return (this.game.day - 1 + this.offset) % (SEASON_DAYS * 4); }
  get seasonIndex() { return Math.floor(this.dayOfYear / SEASON_DAYS); }
  get season() { return SEASONS[this.seasonIndex]; }
  get seasonDay() { return (this.dayOfYear % SEASON_DAYS) + 1; }
  // Season values eased across the boundary (first two days blend in)
  seasonBlend() {
    const i = this.seasonIndex, prev = SEASONS[(i + 3) % 4], cur = SEASONS[i];
    const t = smooth(0, 2, this.dayOfYear % SEASON_DAYS + this.game.hour / 24);
    return { prev, cur, t };
  }
  get sunrise() { const { prev, cur, t } = this.seasonBlend(); return lerp(prev.sunrise, cur.sunrise, t); }
  get sunset() { const { prev, cur, t } = this.seasonBlend(); return lerp(prev.sunset, cur.sunset, t); }
  isNight(h) { return h >= this.sunset + 0.75 || h < this.sunrise - 0.5; }
  daylight(h) { const sr = this.sunrise, ss = this.sunset; return smooth(sr - 1.25, sr + 1.25, h) - smooth(ss - 1.25, ss + 1.25, h); }

  // Air temperature (°C): season, time of day (warmest mid-afternoon), the
  // day's own quirk, cloud cover, rain/snow and wind.
  get temp() {
    const { prev, cur, t } = this.seasonBlend();
    const base = lerp(prev.temp, cur.temp, t), swing = lerp(prev.swing, cur.swing, t);
    const h = this.game.hour;
    const daily = Math.cos(((h - 15) / 24) * Math.PI * 2); // 1 at 15:00, -1 at 03:00
    const m = this.mix;
    return base + swing * daily * (1 - 0.5 * m.cloud) + (dayNoise(this.game.day) - 0.5) * 6 - m.rain * 2.5 - m.snow * 2 - m.cloud * 1.5;
  }
  get windChill() { return this.mix.wind * 0.45; }

  // ---------- perception and handling ----------
  // How far zombies see (fog, rain, snow) and hear (rain and wind mask noise)
  get sightMul() { const m = this.mix; return Math.max(0.4, 1 - m.fog * 10 - m.rain * 0.25 - m.snow * 0.3); }
  get hearMul() { const m = this.mix; return Math.max(0.5, 1 - m.rain * 0.35 - Math.max(0, m.wind - 6) * 0.02); }
  // The cold makes them sluggish
  get zombieSpeedMul() { const t = this.temp; return t < -2 ? Math.max(0.75, 1 + (t + 2) * 0.025) : 1; }
  // Tire grip on wet or snowy roads
  get grip() { return Math.max(0.4, 1 - 0.3 * Math.max(this.wetGround, this.mix.rain) - 0.5 * this.snowCover); }
  get cropMul() { const { prev, cur, t } = this.seasonBlend(); return lerp(prev.crops, cur.crops, t) * (this.temp < 2 ? 0 : 1); }
  get forageMul() { const { prev, cur, t } = this.seasonBlend(); return lerp(prev.forage, cur.forage, t); }
  get precip() { return Math.max(this.mix.rain, this.mix.snow); }
  get stormy() { return STATES[this.state].lightning ? 1 : 0; }

  // ---------- fronts ----------
  pickNext() {
    const sw = this.season.w, after = AFTER[this.state];
    const cold = this.temp < 1, entries = [];
    for (const k of Object.keys(STATES)) {
      let w = (sw[k] || 0) * (after[k] ?? 1);
      // Precipitation falls as snow when it's freezing and as rain when not
      if (cold && (k === 'rain' || k === 'storm')) w *= 0.15;
      if (!cold && this.season.id !== 'winter' && (k === 'snow' || k === 'blizzard')) w = 0;
      if (w > 0) entries.push([k, w]);
    }
    const total = entries.reduce((n, e) => n + e[1], 0);
    let r = Math.random() * total;
    this.next = entries.find((e) => (r -= e[1]) <= 0)?.[0] || 'cloudy';
  }

  setState(k, hours) {
    this.state = k;
    const st = STATES[k];
    this.left = (hours ?? st.hours[0] + Math.random() * (st.hours[1] - st.hours[0])) * 60;
    this.windTarget = st.wind[0] + Math.random() * (st.wind[1] - st.wind[0]);
    this.windDir += (Math.random() - 0.5) * 1.2;
    this.pickNext();
  }

  // A storm or blizzard is due within the hour: the wind picks up first
  get approaching() { return (this.next === 'storm' || this.next === 'blizzard') && this.left < 60 ? this.next : null; }

  // ---------- update ----------
  update(dt) {
    const g = this.game;
    let dm = g.time - this.last;
    this.last = g.time;
    // Long jumps (sleep): step the fronts an hour at a time
    while (dm > 0) {
      const step = Math.min(dm, 60);
      dm -= step;
      this.advance(step);
    }
    this.updateLightning(dt);
    this.updateParticles(dt);
    this.updateAudio();
    this.applySeasonLook();
  }

  // Advance the weather by `min` game minutes
  advance(min) {
    this.left -= min;
    if (this.left <= 0) this.setState(this.next);
    const st = STATES[this.state], m = this.mix;
    // Blend toward the current front: about an hour to settle in
    const k = 1 - Math.exp(-min / 40);
    let target = { cloud: st.cloud, fog: st.fog, rain: st.rain, snow: st.snow };
    // Cold rain turns to snow, warm snow to rain
    const t = this.temp;
    if (t < 0 && target.rain) target = { ...target, snow: target.rain * 0.8, rain: 0 };
    if (t > 3 && target.snow) target = { ...target, rain: target.snow * 0.7, snow: 0 };
    const ap = this.approaching;
    if (ap) target.cloud = Math.max(target.cloud, 0.8);
    for (const key of ['cloud', 'fog', 'rain', 'snow']) m[key] += (target[key] - m[key]) * k;
    const windT = ap ? Math.max(this.windTarget, 8) : this.windTarget;
    m.wind += (windT + Math.sin(this.game.time * 0.05) * 1.2 - m.wind) * k;
    // Snow builds up below freezing and melts above it (rain melts it fast)
    const h = min / 60;
    this.fillBarrels(h);
    if (m.snow > 0.05 && t < 1) this.snowCover = Math.min(1, this.snowCover + h * m.snow * 0.25);
    else if (t > 1) this.snowCover = Math.max(0, this.snowCover - h * (0.02 + Math.max(0, t) * 0.01 + m.rain * 0.15));
    this.wetGround = Math.max(0, Math.min(1, this.wetGround + h * (m.rain * 0.8 - 0.06 - Math.max(0, t) * 0.004 * (1 - m.cloud))));
  }

  // ---------- body: wet and cold ----------
  shelter(x, z) {
    const g = this.game;
    if (g.player.vehicle) return 'car';
    return g.world.buildingAt(x, z) ? 'inside' : null;
  }
  nearFire(x, z) {
    let best = 0;
    for (const s of this.game.builder.structures) {
      if (s.type !== 'campfire') continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < 5) best = Math.max(best, 1 - d / 5);
    }
    return best;
  }
  clothing() {
    const e = this.game.profile.equip, c = e.clothing && ITEMS[e.clothing.key];
    return { warmth: BASE_WARMTH + (c?.warmth || 0) + (e.armor ? 1 : 0) + (e.helmet ? 0.5 : 0), rain: c?.rainproof || 0 };
  }

  updatePlayer(dt) {
    const g = this.game, p = g.player;
    if (p.bodyTemp == null) p.bodyTemp = 37;
    if (p.wet == null) p.wet = 0;
    const where = this.shelter(p.pos.x, p.pos.z), fire = this.nearFire(p.pos.x, p.pos.z);
    const air = this.temp, cl = this.clothing(), m = this.mix;
    // Getting wet outdoors; drying off everywhere (fast by a fire)
    if (!where) p.wet = Math.min(100, p.wet + dt * (m.rain * 1.6 + m.snow * 0.5) * (1 - cl.rain));
    const dry = 0.12 + Math.max(0, air) * 0.02 + fire * 2.5 + (where ? 0.25 : 0) + (where === 'car' && p.vehicle?.running ? 0.6 : 0);
    if (where || m.rain + m.snow < 0.05) p.wet = Math.max(0, p.wet - dt * dry);
    // What the body feels: shelter, a heater, a fire, wind and wet clothes
    let env = air;
    if (where === 'inside') env = air * 0.45 + 11;
    else if (where === 'car') env = p.vehicle?.running ? 20 : air * 0.6 + 6;
    else env -= this.windChill;
    env += fire * 22;
    env -= p.wet * 0.09;
    const thermal = env + cl.warmth * 2.2 + (p.sprinting ? 6 : 0);
    let target = 37;
    if (thermal < 16) target = Math.max(32.5, 37 - (16 - thermal) * 0.12);
    else if (thermal > 38) target = Math.min(40.5, 37 + (thermal - 38) * 0.08);
    p.bodyTemp += (target - p.bodyTemp) * Math.min(1, dt * 0.02);
    const bt = p.bodyTemp;
    // Shivering throws your aim off; hypothermia and heatstroke hurt
    p.shiver = bt < 36 ? Math.min(1, (36 - bt) / 1.5) : 0;
    p.coldMul = bt < 36 ? 1 - 0.25 * Math.min(1, (36 - bt) / 1.5) : 1;
    if (bt < 35) { p.damagePart('thorax', dt * (bt < 33.8 ? 0.4 : 0.12)); p.fatigue = Math.min(100, p.fatigue + dt * 0.08); }
    if (bt > 39.2) p.damagePart('head', dt * 0.12);
    // Heat makes you thirsty
    p.thirstMul = 1 + Math.max(0, air - 24) * 0.05 * (where === 'inside' ? 0.4 : 1) + (bt > 38 ? 0.8 : 0);
    // A few words when it changes
    const lvl = bt < 33.8 ? 3 : bt < 35 ? 2 : bt < 36 ? 1 : bt > 39.2 ? -2 : bt > 38 ? -1 : 0;
    if (lvl !== this.lastLvl) {
      const msg = { 1: "You're getting cold.", 2: "You're freezing. Get inside, by a fire, or into warmer clothes.", 3: 'Hypothermia is setting in.', '-1': "You're overheating. Drink and rest in the shade.", '-2': 'Heatstroke!' }[lvl];
      if (msg && (this.lastLvl == null || Math.abs(lvl) > Math.abs(this.lastLvl))) g.hud.message(msg, 4);
      this.lastLvl = lvl;
    }
    if (this.lastState !== this.state) {
      if (this.lastState) g.hud.message(this.state === 'storm' ? 'A thunderstorm rolls in.' : this.state === 'blizzard' ? 'A blizzard is blowing in.' : `The weather turns: ${STATES[this.state].name.toLowerCase()}.`, 3);
      this.lastState = this.state;
    }
    if (this.approaching && !this.warned) { this.warned = true; g.hud.message(this.approaching === 'storm' ? 'The wind is picking up. A storm is coming.' : 'The sky turns grey and the wind howls. A blizzard is coming.', 4); }
    if (!this.approaching) this.warned = false;
  }

  // ---------- rain barrels ----------
  fillBarrels(hours) {
    const r = this.mix.rain + this.mix.snow * 0.3;
    if (r < 0.02) return;
    for (const s of this.game.builder.structures) if (s.type === 'rain_barrel') s.water = Math.min(40, (s.water || 0) + hours * r * 10);
  }
  useBarrel(s) {
    const g = this.game, p = g.player;
    if ((s.water || 0) < 0.2) return g.hud.message('The barrel is empty. It fills when it rains.', 2.5);
    // Drink first (1 L quenches about a third), then top up watering cans
    const drinkL = Math.min(s.water, Math.max(0, 100 - p.water) / 33);
    p.water = Math.min(100, p.water + drinkL * 33);
    s.water -= drinkL;
    let filled = 0;
    for (const gr of p.ammoGrids()) for (const it of gr.items) {
      const cap = ITEMS[it.key].waterCap;
      if (!cap) continue;
      const n = Math.min(cap - it.water, s.water);
      it.water = +(it.water + n).toFixed(1); s.water -= n; filled += n;
    }
    sfx.pour();
    const parts = [];
    if (drinkL > 0.05) parts.push('You drink');
    if (filled > 0.05) parts.push(`fill your watering can (+${filled.toFixed(1)} L)`);
    g.hud.message(parts.length ? `${parts.join(' and ')}. ${s.water.toFixed(1)} L left in the barrel.`.replace(/^./, (c) => c.toUpperCase()) : `You're not thirsty. ${s.water.toFixed(1)} L in the barrel.`, 3);
  }

  // ---------- sky and light (called from Game.updateLighting) ----------
  // Darken and grey the sky with cloud; lightning flashes it white.
  applySky(bg, d) {
    const m = this.mix;
    const storm = new THREE.Color(d > 0.5 ? 0x5a6066 : 0x0c0e12);
    bg.lerp(storm, m.cloud * 0.6);
    if (m.snow > 0.3) bg.lerp(new THREE.Color(d > 0.5 ? 0x9aa0a8 : 0x1a1e26), (m.snow - 0.3) * 0.6);
    if (this.flash > 0) bg.lerp(new THREE.Color(0xc8d0ff), Math.min(1, this.flash) * 0.7);
  }
  get fogAdd() { return this.mix.fog; }
  get sunMul() { return 1 - 0.75 * this.mix.cloud; }
  get flashLight() { return this.flash * 6; }

  // ---------- lightning and thunder ----------
  updateLightning(dt) {
    const g = this.game;
    this.flash = Math.max(0, this.flash - dt * 6);
    if (this.bolt) { this.bolt.t -= dt; if (this.bolt.t <= 0) { g.scene.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); this.bolt = null; } }
    for (const th of this.thunders) { th.t -= dt; if (th.t <= 0) sfx.thunder(th.vol, th.close); }
    this.thunders = this.thunders.filter((th) => th.t > 0);
    if (this.mix.rain < 0.75 || !STATES[this.state].lightning) return;
    this.lightningT -= dt;
    if (this.lightningT > 0) return;
    this.lightningT = 5 + Math.random() * 18;
    this.strike();
  }

  strike(at) {
    const g = this.game, p = g.player.pos;
    const a = Math.random() * Math.PI * 2, d = at ? Math.hypot(at.x - p.x, at.z - p.z) : 40 + Math.random() * 260;
    const x = at?.x ?? p.x + Math.cos(a) * d, z = at?.z ?? p.z + Math.sin(a) * d;
    this.flash = 1.2 * Math.max(0.35, 1 - d / 400);
    // A jagged bolt from the clouds
    if (d < 260) {
      const pts = [];
      let bx = x + (Math.random() - 0.5) * 20, bz = z + (Math.random() - 0.5) * 20;
      for (let y = 110; y > 0; y -= 8 + Math.random() * 8) { pts.push(new THREE.Vector3(bx, y, bz)); bx += (Math.random() - 0.5) * 8; bz += (Math.random() - 0.5) * 8; bx += (x - bx) * 0.15; bz += (z - bz) * 0.15; }
      pts.push(new THREE.Vector3(x, 0, z));
      const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xeef0ff, fog: false }));
      if (this.bolt) { g.scene.remove(this.bolt.mesh); this.bolt.mesh.geometry.dispose(); }
      g.scene.add(mesh);
      this.bolt = { mesh, t: 0.18 };
    }
    // Thunder arrives at the speed of sound; close strikes crack first
    this.thunders.push({ t: d / 343, vol: Math.max(0.15, 1 - d / 350), close: d < 90 });
    // The dead go to look
    if (d < 200) g.zombies.noise(x, z, 45, true);
    return { x, z, d };
  }

  // ---------- particles: rain streaks and snowflakes round the camera ----------
  buildVisuals() {
    const g = this.game;
    const R = 22, H = 16;
    this.R = R; this.H = H;
    // Rain: line segments (top and bottom of each streak)
    const NR = 1600;
    const rp = new Float32Array(NR * 6);
    this.rainDrops = new Float32Array(NR * 3);
    for (let i = 0; i < NR; i++) { this.rainDrops[i * 3] = (Math.random() * 2 - 1) * R; this.rainDrops[i * 3 + 1] = Math.random() * H; this.rainDrops[i * 3 + 2] = (Math.random() * 2 - 1) * R; }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa8b8c8, transparent: true, opacity: 0.38, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 3;
    // Snow: soft round points
    const NS = 2400;
    this.flakes = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { this.flakes[i * 3] = (Math.random() * 2 - 1) * R; this.flakes[i * 3 + 1] = Math.random() * H; this.flakes[i * 3 + 2] = (Math.random() * 2 - 1) * R; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const cx = c.getContext('2d'), grad = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = grad; cx.fillRect(0, 0, 32, 32);
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.9 }));
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 3;
    g.scene.add(this.rain, this.snow);
    // Ground overlay: whitens with snow cover, darkens when soaked
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(g.world.size || 520, g.world.size || 520),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    ov.rotation.x = -Math.PI / 2;
    ov.position.y = 0.004;
    ov.receiveShadow = true;
    ov.renderOrder = 1;
    this.overlay = ov;
    g.scene.add(ov);
    this.roofTimer = 0;
    this.roofs = [];
  }

  updateParticles(dt) {
    const g = this.game, cam = g.camera.position, m = this.mix, R = this.R, H = this.H;
    // Roofs near the camera (no rain falls indoors)
    this.roofTimer -= dt;
    if (this.roofTimer <= 0) {
      this.roofTimer = 0.5;
      this.roofs = g.world.buildings.filter((b) => !b.area && b.x1 > cam.x - R && b.x0 < cam.x + R && b.z1 > cam.z - R && b.z0 < cam.z + R);
    }
    const underRoof = (x, z) => this.roofs.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    const wx = Math.sin(this.windDir) * m.wind, wz = Math.cos(this.windDir) * m.wind;
    // Rain
    const nr = Math.floor((this.rainDrops.length / 3) * Math.min(1, m.rain * 1.2));
    this.rain.visible = nr > 0;
    if (nr > 0) {
      const pos = this.rain.geometry.attributes.position.array, d = this.rainDrops;
      const fall = 18, sx = wx * 0.06, sz = wz * 0.06, len = 0.55;
      for (let i = 0; i < nr; i++) {
        const k = i * 3;
        d[k + 1] -= fall * dt; d[k] += wx * 0.6 * dt; d[k + 2] += wz * 0.6 * dt;
        if (d[k + 1] < 0) { d[k + 1] += H; d[k] = (Math.random() * 2 - 1) * R; d[k + 2] = (Math.random() * 2 - 1) * R; }
        // Keep the drops in a box that follows the camera
        let x = cam.x + d[k], z = cam.z + d[k + 2];
        if (d[k] > R) d[k] -= 2 * R; else if (d[k] < -R) d[k] += 2 * R;
        if (d[k + 2] > R) d[k + 2] -= 2 * R; else if (d[k + 2] < -R) d[k + 2] += 2 * R;
        const y = cam.y - 4 + d[k + 1];
        const hide = y < 0 || underRoof(x, z);
        const o = i * 6;
        if (hide) { pos[o] = pos[o + 3] = x; pos[o + 1] = pos[o + 4] = -50; pos[o + 2] = pos[o + 5] = z; continue; }
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x + sx; pos[o + 4] = y - len; pos[o + 5] = z + sz;
      }
      this.rain.geometry.setDrawRange(0, nr * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.22 + 0.25 * m.rain;
    }
    // Snow
    const ns = Math.floor((this.flakes.length / 3) * Math.min(1, m.snow * 1.2));
    this.snow.visible = ns > 0;
    if (ns > 0) {
      const pos = this.snow.geometry.attributes.position.array, f = this.flakes, t = g.time;
      for (let i = 0; i < ns; i++) {
        const k = i * 3;
        f[k + 1] -= (1.1 + (i % 5) * 0.12) * dt;
        f[k] += (wx * 0.5 + Math.sin(t * 0.7 + i) * 0.4) * dt; f[k + 2] += (wz * 0.5 + Math.cos(t * 0.6 + i * 1.3) * 0.4) * dt;
        if (f[k + 1] < 0) { f[k + 1] += H; f[k] = (Math.random() * 2 - 1) * R; f[k + 2] = (Math.random() * 2 - 1) * R; }
        if (f[k] > R) f[k] -= 2 * R; else if (f[k] < -R) f[k] += 2 * R;
        if (f[k + 2] > R) f[k + 2] -= 2 * R; else if (f[k + 2] < -R) f[k + 2] += 2 * R;
        const x = cam.x + f[k], z = cam.z + f[k + 2], y = cam.y - 4 + f[k + 1];
        const hide = y < 0 || underRoof(x, z);
        pos[k] = x; pos[k + 1] = hide ? -50 : y; pos[k + 2] = z;
      }
      this.snow.geometry.setDrawRange(0, ns);
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // Ground: snow cover, or a dark wet sheen
    const ov = this.overlay;
    if (this.snowCover > 0.02) { ov.material.color.setHex(0xeef2f8); ov.material.opacity = Math.min(0.88, this.snowCover * 1.1); }
    else { ov.material.color.setHex(0x0e1214); ov.material.opacity = this.wetGround * 0.28; }
    ov.visible = ov.material.opacity > 0.01;
  }

  updateAudio() {
    const g = this.game, m = this.mix;
    const where = this.shelter(g.player.pos.x, g.player.pos.z);
    // Indoors it's a muffled drumming on the roof
    this.rainLoop.set(Math.min(1, m.rain * 1.2) * (where ? 0.5 : 1) * 0.35, where ? 900 : 4000);
    this.windLoop.set(Math.min(1, Math.max(0, m.wind - 2) / 14) * (where ? 0.3 : 1) * 0.28, 300 + m.wind * 25);
  }

  // ---------- seasons on the landscape ----------
  // Leaves: fresh in spring, turning in autumn, bare and brown in winter;
  // snow settles on everything as it builds up.
  applySeasonLook() {
    const w = this.game.world;
    if (!w.foliage) return;
    const { prev, cur, t } = this.seasonBlend();
    const L = w.foliage.deciduous.uLeafTint.value, P = w.foliage.pine.uLeafTint.value;
    L.set(lerp(prev.leaf[0], cur.leaf[0], t), lerp(prev.leaf[1], cur.leaf[1], t), lerp(prev.leaf[2], cur.leaf[2], t));
    P.set(1, 1, 1);
    w.foliage.deciduous.uSnow.value = w.foliage.pine.uSnow.value = this.snowCover * 0.6;
  }

  // ---------- HUD ----------
  hudText() {
    const st = STATES[this.state], t = Math.round(this.temp);
    const m = this.mix;
    let label = st.name;
    if (m.snow > 0.2 && st.rain) label = 'Snow';
    if (m.rain > 0.2 && st.snow) label = 'Sleet';
    const wind = m.wind > 12 ? ' · gale' : m.wind > 7 ? ' · windy' : '';
    const ap = this.approaching ? ' · storm coming' : '';
    return `${st.icon} ${label} · ${t}°C${wind}${ap} · ${this.season.name} ${this.seasonDay}/${SEASON_DAYS}`;
  }

  serialize() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return {
      offset: this.offset, state: this.state, next: this.next, left: Math.round(this.left), snowCover: r(this.snowCover), wetGround: r(this.wetGround), windDir: r(this.windDir),
      mix: Object.fromEntries(Object.entries(this.mix).map(([k, v]) => [k, r(v)])),
    };
  }

  dispose() {
    const g = this.game;
    g.scene.remove(this.rain, this.snow, this.overlay);
    if (this.bolt) g.scene.remove(this.bolt.mesh);
    this.rainLoop.set(0); this.windLoop.set(0);
    this.rainLoop.stop?.(); this.windLoop.stop?.();
  }
}
