// Sound, synthesized live with WebAudio (no asset files needed), through a
// compressor and convolution reverb that changes indoors and out:
//   - gunshots by calibre: the supersonic crack, a distorted muzzle blast
//     sweeping down, a falling low thump, the action cycling, echoes off the
//     buildings; distance muffles them, suppressors kill the blast (not the
//     crack of a supersonic round)
//   - zombie voices: formant synthesis (a buzzing vocal source through three
//     vowel filters, with vibrato, jitter, a growling subharmonic and rasp),
//     each zombie with its own pitch and throat
//   - mechanical detail: magazines, bolts, pumps, brass, footsteps
// Real recordings can replace any of it: list them in public/sounds/manifest.json
// ({ "shot_m4a1": ["m4a1_1.ogg", ...], "zombie_groan": [...], ... }) and they play
// instead of the synthesized version (names: shot_<weapon> or shot_<calibre
// class>, zombie_<groan|growl|snarl|hurt|die>, and any sfx name).
let ctx = null;
let master = null, verbBus = null, sendOut = null, sendIn = null;
let white = null, pink = null, brown = null;
let env = 'out';
const samples = {};

// ---------- volumes ----------
// Every sound has its own volume (0..2, saved in the browser), on top of the
// master. While a sound is being built, `cur` is its volume: everything it
// routes to the mix goes through a gain of that much.
const VOL_KEY = 'tarkzoid-sound';
const VOL = (() => { try { return JSON.parse(localStorage.getItem(VOL_KEY)) || {}; } catch { return {}; } })();
export const soundVol = (k) => VOL[k] ?? 1;
export function setSoundVol(k, v) {
  VOL[k] = v;
  try { localStorage.setItem(VOL_KEY, JSON.stringify(VOL)); } catch { /* storage blocked */ }
  if (k === 'master' && master) master.gain.setTargetAtTime(0.55 * v, ctx.currentTime, 0.05);
  for (const l of loops) l.refresh();
}
let cur = 1, inSound = false;
// (a sound made of others plays them at its own volume)
const withVol = (k, fn) => {
  if (inSound) return fn();
  inSound = true; cur = soundVol(k);
  try { return fn(); } finally { inSound = false; cur = 1; }
};
const loops = []; // engine and weather loops (their level follows the sliders)

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.18;
  master = ctx.createGain();
  master.gain.value = 0.55 * soundVol('master');
  master.connect(comp); comp.connect(ctx.destination);
  // Reverb: an open-air tail with slapback off buildings, and a small room
  const vOut = ctx.createConvolver(), vIn = ctx.createConvolver();
  vOut.buffer = impulse(2.4, 'out'); vIn.buffer = impulse(0.8, 'in');
  verbBus = ctx.createGain();
  sendOut = ctx.createGain(); sendIn = ctx.createGain(); sendIn.gain.value = 0;
  verbBus.connect(vOut); verbBus.connect(vIn); vOut.connect(sendOut); vIn.connect(sendIn);
  sendOut.connect(master); sendIn.connect(master);
  // Noise colours
  const mk = (fn) => { const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0); fn(d); return b; };
  white = mk((d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  pink = mk((d) => { let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 2.2; } });
  brown = mk((d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
  loadSamples();
}

// Indoors or out: which reverb you hear (eased)
export function setAudioEnv(e) {
  if (!ctx || e === env) return;
  env = e;
  const t = ctx.currentTime;
  sendOut.gain.setTargetAtTime(e === 'out' ? 1 : 0, t, 0.25);
  sendIn.gain.setTargetAtTime(e === 'in' ? 1 : 0, t, 0.25);
}

// Synthetic impulse response: early reflections, then a decaying tail
function impulse(dur, kind) {
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    const tau = kind === 'out' ? 0.55 : 0.16, cut = kind === 'out' ? 0.18 : 0.45;
    for (let i = 0; i < n; i++) {
      const t = i / ctx.sampleRate;
      lp += (Math.random() * 2 - 1 - lp) * cut; // darker tail outdoors
      d[i] = lp * Math.exp(-t / tau) * (kind === 'out' ? 0.6 : 0.8);
    }
    // discrete early reflections (walls, buildings across the street)
    const refl = kind === 'out' ? [[0.09, 0.5], [0.17, 0.35], [0.28, 0.3], [0.41, 0.18], [0.62, 0.1]] : [[0.007, 0.6], [0.013, 0.5], [0.021, 0.4], [0.034, 0.3]];
    for (const [rt, ra] of refl) { const i = Math.floor((rt + (Math.random() - 0.5) * rt * 0.3) * ctx.sampleRate); for (let k = 0; k < 200 && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * ra * Math.exp(-k / 40); }
  }
  return b;
}

// ---------- plumbing ----------
const now = () => ctx.currentTime;
// Route a voice to the mix: panned, with some of it into the reverb
function out(node, pan = 0, wet = 0.15) {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  if (cur !== 1) { const v = ctx.createGain(); v.gain.value = cur; node.connect(v); v.connect(p); } else node.connect(p);
  p.connect(master);
  if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; p.connect(s); s.connect(verbBus); }
  return p;
}
function noiseSrc(buf = white, t = now(), dur = 1) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  return s;
}
function filter(type, f, q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function gainEnv(t, attack, peak, decay, hold = 0) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0.0001, t + attack + hold, decay);
  return g;
}
const shapers = {};
function shaper(k) {
  const key = Math.round(k * 10);
  if (shapers[key]) return shapers[key];
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return (shapers[key] = c);
}
function ws(k) { const w = ctx.createWaveShaper(); w.curve = shaper(k); w.oversample = '2x'; return w; }

// Simple building blocks (filtered noise burst, pitched tone) for the small stuff
function noise(dur, freq, q, vol, type = 'lowpass', decay = dur, opts = {}) {
  if (!ctx) return;
  const t = now() + (opts.delay || 0);
  const src = noiseSrc(opts.buf || white, t, dur);
  const f = filter(type, freq, q);
  const g = gainEnv(t, 0.002, vol, decay / 3);
  src.connect(f); f.connect(g); out(g, opts.pan || 0, opts.wet ?? 0.1);
}
function tone(freq, dur, vol, type = 'sine', slide = 0, opts = {}) {
  if (!ctx) return;
  const t = now() + (opts.delay || 0);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = gainEnv(t, 0.002, vol, dur / 3);
  o.connect(g); out(g, opts.pan || 0, opts.wet ?? 0.1);
  o.start(t); o.stop(t + dur + 0.1);
}
// A small metallic click (bandpassed noise tick)
function tick(at, f, vol, q = 5, pan = 0, decay = 0.006) {
  const t = now() + at;
  const s = noiseSrc(white, t, 0.03 + decay * 4), b = filter('bandpass', f, q), g = gainEnv(t, 0.0005, vol, decay);
  s.connect(b); b.connect(g); out(g, pan, 0.08);
}
// A struck metal part ringing: a few inharmonic partials
function ring(at, f, vol, decay = 0.08, pan = 0) {
  const t = now() + at;
  for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) {
    if (f * m > 18000) break; // past hearing (and past what the context can play)
    const o = ctx.createOscillator(); o.frequency.value = f * m * (0.98 + Math.random() * 0.04);
    const g = gainEnv(t, 0.0005, vol * a, decay / m);
    o.connect(g); out(g, pan, 0.1); o.start(t); o.stop(t + decay * 4);
  }
}
// A scrape: noise swept through a bandpass
function scrape(at, f0, f1, dur, vol) {
  const t = now() + at, s = noiseSrc(white, t, dur), b = filter('bandpass', f0, 2.5), g = gainEnv(t, 0.01, vol, dur / 3);
  b.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(b); b.connect(g); out(g, 0, 0.08);
}

// ---------- recorded samples (optional) ----------
async function loadSamples() {
  try {
    const res = await fetch('sounds/manifest.json');
    if (!res.ok) return;
    const man = await res.json();
    for (const [name, files] of Object.entries(man)) {
      samples[name] = [];
      for (const f of files) {
        try { const buf = await (await fetch(`sounds/${f}`)).arrayBuffer(); samples[name].push(await ctx.decodeAudioData(buf)); } catch { /* skip a bad file */ }
      }
    }
  } catch { /* no samples: synthesized sound only */ }
}
function playSample(name, vol = 1, pan = 0, wet = 0.2) {
  const list = samples[name];
  if (!list?.length || !ctx) return false;
  const s = ctx.createBufferSource();
  s.buffer = list[Math.floor(Math.random() * list.length)];
  s.playbackRate.value = 0.96 + Math.random() * 0.08;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(g); out(g, pan, wet);
  s.start();
  return true;
}

// ---------- gunshots ----------
// crack: supersonic bullet (rifles); blast: [start Hz, end Hz, decay s];
// body: [start Hz, end Hz, length s, level]; mech: the action cycling
const GUN = {
  pistol9: { crack: 0.15, blast: [5200, 1600, 0.05], body: [190, 80, 0.07, 0.9], mech: 'slide', gain: 0.85 },
  pistol45: { crack: 0, blast: [4200, 1200, 0.06], body: [150, 60, 0.09, 1.1], mech: 'slide', gain: 0.95 },
  smg9: { crack: 0.12, blast: [5600, 1800, 0.04], body: [200, 90, 0.06, 0.8], mech: 'smg', gain: 0.8 },
  rifle545: { crack: 0.55, blast: [7000, 2200, 0.06], body: [140, 60, 0.08, 1.0], mech: 'rifle', gain: 1.0 },
  rifle556: { crack: 0.6, blast: [7600, 2400, 0.055], body: [150, 62, 0.075, 0.95], mech: 'ar', gain: 1.0 },
  lmg: { crack: 0.6, blast: [7000, 2200, 0.06], body: [130, 55, 0.08, 1.1], mech: 'lmg', gain: 1.0 },
  rifle762: { crack: 0.5, blast: [6000, 1700, 0.07], body: [120, 50, 0.1, 1.15], mech: 'rifle', gain: 1.05 },
  rifle308: { crack: 0.75, blast: [6200, 1500, 0.08], body: [105, 42, 0.12, 1.35], mech: 'rifle', gain: 1.15 },
  shotgun: { crack: 0, blast: [4000, 900, 0.09], body: [95, 38, 0.14, 1.5], mech: null, gain: 1.15 },
};
const CALIBRE = { pm: 'pistol9', glock17: 'pistol9', m1911: 'pistol45', mp5: 'smg9', ak74: 'rifle545', m4a1: 'rifle556', m249: 'lmg', sks: 'rifle762', m14: 'rifle308', mp133: 'shotgun', m870: 'shotgun' };

// vol < 1 for distant shots (other survivors): quieter, duller, more reverb
function gunshot(kind, suppressed, vol, pan = 0) {
  const cls = CALIBRE[kind] || 'rifle545', P = GUN[cls];
  if (playSample(`shot_${kind}${suppressed ? '_supp' : ''}`, vol, pan, 0.3) || playSample(`shot_${cls}${suppressed ? '_supp' : ''}`, vol, pan, 0.3)) return;
  const t = now() + 0.003, far = 1 - vol;
  const bus = ctx.createGain(); bus.gain.value = vol * P.gain;
  const air = filter('lowpass', 700 + 17000 * vol * vol, 0.5); // air soaks up the highs with distance
  bus.connect(air);
  out(air, pan, (env === 'in' ? 0.55 : 0.32) + far * 0.6);
  // 1. The supersonic crack: a 1.5 ms N-wave (still there through a suppressor)
  if (P.crack > 0) {
    const n = Math.floor(ctx.sampleRate * 0.0016), b = ctx.createBuffer(1, n + 64, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = 1 - (2 * i) / n;
    const s = ctx.createBufferSource(); s.buffer = b;
    const hp = filter('highpass', 1800, 0.7), g = ctx.createGain(); g.gain.value = P.crack * (suppressed ? 0.9 : 1.2);
    s.connect(hp); hp.connect(g); g.connect(bus); s.start(t);
  }
  // 2. Muzzle blast: noise driven hard, its brightness falling away fast
  {
    const s = noiseSrc(white, t, 0.6), drive = ws(suppressed ? 1.5 : 4);
    const lp = filter('lowpass', suppressed ? 2200 : P.blast[0], 0.8);
    lp.frequency.setTargetAtTime(suppressed ? 500 : P.blast[1], t + 0.004, 0.025);
    const g = gainEnv(t, 0.0006, suppressed ? 0.28 : 1.1, suppressed ? 0.025 : P.blast[2]);
    s.connect(drive); drive.connect(lp); lp.connect(g); g.connect(bus);
  }
  // 3. The thump in your chest: a falling sine and low rumble
  {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(P.body[0], t); o.frequency.exponentialRampToValueAtTime(P.body[1], t + P.body[2]);
    const g = gainEnv(t, 0.002, P.body[3] * (suppressed ? 0.35 : 1), P.body[2] * 0.6);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + P.body[2] * 5);
    const r = noiseSrc(brown, t, 0.5), lp = filter('lowpass', 180, 0.7), rg = gainEnv(t, 0.004, 0.7 * P.body[3] * (suppressed ? 0.4 : 1), 0.09);
    r.connect(lp); lp.connect(rg); rg.connect(bus);
  }
  // 4. The action cycling (only heard up close; louder through a suppressor)
  if (vol > 0.6 && P.mech) {
    const m = (suppressed ? 1.5 : 0.8) * vol, d = P.mech;
    const at = (x) => x + 0.004;
    if (d === 'slide') { tick(at(0.012), 3800, 0.22 * m); tick(at(0.026), 2600, 0.18 * m); ring(at(0.028), 3100, 0.03 * m, 0.04); }
    else if (d === 'smg') { tick(at(0.01), 3400, 0.18 * m); tick(at(0.03), 2400, 0.15 * m); }
    else if (d === 'ar') { tick(at(0.014), 3000, 0.2 * m); ring(at(0.016), 2700, 0.035 * m, 0.05); tick(at(0.038), 2100, 0.17 * m); }
    else if (d === 'lmg') { tick(at(0.012), 2300, 0.22 * m); tick(at(0.03), 1700, 0.2 * m); ring(at(0.03), 1900, 0.03 * m, 0.06); }
    else { tick(at(0.016), 2600, 0.22 * m); ring(at(0.02), 2200, 0.04 * m, 0.07); tick(at(0.045), 1900, 0.18 * m); }
  }
  // 5. Echoes off the buildings outdoors (a rolling report at a distance)
  if (env === 'out' && !suppressed) {
    for (const [dt, a, f] of [[0.12 + Math.random() * 0.22, 0.22, 1600], [0.42 + Math.random() * 0.4, 0.12, 800], [0.9 + Math.random() * 0.5, 0.06 + far * 0.08, 500]]) {
      const s = noiseSrc(pink, t + dt, 0.6), lp = filter('lowpass', f, 0.6), g = gainEnv(t + dt, 0.004, a * P.gain, 0.08 + far * 0.1);
      s.connect(lp); lp.connect(g); g.connect(bus);
    }
  }
}

// ---------- voices ----------
// Vowel formants (F1, F2, F3)
const VOWELS = { uu: [300, 870, 2240], oh: [570, 840, 2410], uh: [640, 1190, 2390], ah: [730, 1090, 2440], ae: [660, 1720, 2410], eh: [530, 1840, 2480] };
// A voice through the vocal tract: f0 (Hz), dur (s), pitch contour (multipliers
// over the length), vowels (morphed through), size (throat: <1 bigger and
// deeper), rasp (0..1 grit and growl), breath (noise), level, pan, wet
function vocal(o) {
  const t = now(), dur = o.dur, f0 = o.f0, size = o.size || 1;
  const src = ctx.createOscillator(); src.type = 'sawtooth';
  const cont = o.contour || [1, 1];
  src.frequency.setValueAtTime(f0 * cont[0], t);
  cont.forEach((c, i) => { if (i) src.frequency.linearRampToValueAtTime(f0 * c, t + (dur * i) / (cont.length - 1)); });
  // vibrato and slow jitter
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 4.5 + Math.random() * 2.5; lg.gain.value = f0 * (0.02 + 0.04 * (o.rasp || 0));
  lfo.connect(lg); lg.connect(src.frequency);
  const jit = ctx.createOscillator(), jg = ctx.createGain(); jit.frequency.value = 0.8 + Math.random() * 1.5; jg.gain.value = f0 * 0.06;
  jit.connect(jg); jg.connect(src.frequency);
  // growl: a subharmonic underneath
  const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = f0 * cont[0] / 2;
  cont.forEach((c, i) => { if (i) sub.frequency.linearRampToValueAtTime(f0 * c / 2, t + (dur * i) / (cont.length - 1)); });
  const sg = ctx.createGain(); sg.gain.value = 0.35 * (o.rasp || 0);
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  src.connect(mix); sub.connect(sg); sg.connect(mix);
  // breath: rough air through the throat
  const br = noiseSrc(white, t, dur + 0.2), bf = filter('bandpass', 1600 / size, 0.8), bgn = ctx.createGain(); bgn.gain.value = o.breath ?? 0.3;
  br.connect(bf); bf.connect(bgn); bgn.connect(mix);
  // rasp: the cords pushed too hard
  const grit = ws(1.5 + 7 * (o.rasp || 0));
  mix.connect(grit);
  // vocal tract: three formants, morphing through the vowels
  const sum = ctx.createGain(); sum.gain.value = 1;
  const vs = (o.vowels || ['uh']).map((v) => VOWELS[v]);
  [[0, 7, 1], [1, 9, 0.55], [2, 11, 0.28]].forEach(([fi, q, a]) => {
    const f = filter('bandpass', vs[0][fi] / size, q);
    vs.forEach((v, i) => { if (i) f.frequency.linearRampToValueAtTime(v[fi] / size, t + (dur * i) / (vs.length - 1)); });
    const g = ctx.createGain(); g.gain.value = a * 2.4;
    grit.connect(f); f.connect(g); g.connect(sum);
  });
  // loudness: swell in, wobble, fade; a gurgling tremolo for the dying
  const env = gainEnv(t, o.attack ?? dur * 0.2, o.gain, dur * 0.28, dur * 0.45);
  if (o.tremolo) { const tr = ctx.createOscillator(), tg = ctx.createGain(); tr.frequency.value = o.tremolo; tg.gain.value = o.gain * 0.6; tr.connect(tg); tg.connect(env.gain); tr.start(t); tr.stop(t + dur + 0.5); }
  sum.connect(env);
  // distance, or a radio's narrow band
  const lp = o.radio ? filter('bandpass', 1700, 1.2) : filter('lowpass', 900 + 7000 * Math.min(1, o.gain * 3), 0.5);
  env.connect(lp);
  out(lp, o.pan || 0, o.wet ?? 0.25);
  for (const n of [src, lfo, jit, sub]) { n.start(t); n.stop(t + dur + 0.6); }
}

// Zombie vocal kinds
const ZKIND = {
  groan: (v) => ({ dur: 1.3 + Math.random() * 0.9, contour: [1, 1.08, 0.92, 0.78], vowels: pick([['uu', 'oh', 'ah', 'uh'], ['uh', 'ah', 'oh'], ['oh', 'uu', 'uh']]), rasp: 0.45, breath: 0.35, mul: 1 }),
  growl: (v) => ({ dur: 0.7 + Math.random() * 0.5, contour: [1.1, 1.3, 1.15, 0.95], vowels: ['ah', 'ae', 'ah'], rasp: 0.85, breath: 0.45, mul: 1.15 }),
  snarl: (v) => ({ dur: 0.38, contour: [1.4, 1.75, 1.2], vowels: ['ae', 'ah'], rasp: 1, breath: 0.6, mul: 1.3, attack: 0.03 }),
  hurt: (v) => ({ dur: 0.32, contour: [1.5, 1.8, 1.1], vowels: ['ah', 'uh'], rasp: 0.7, breath: 0.5, mul: 1.1, attack: 0.02 }),
  die: (v) => ({ dur: 0.75 + Math.random() * 0.3, contour: [1.15, 0.95, 0.7, 0.5], vowels: pick([['ah', 'uh', 'oh'], ['ae', 'ah', 'uh']]), rasp: 0.7, breath: 0.75, mul: 0.95, attack: 0.04 }),
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// After a dying moan: the throat fills (a few irregular wet bubbles), then
// the last air goes out of the lungs
function deathRattle(dur, voice, vol, pan, wet) {
  const t0 = dur * 0.55, lvl = vol * 0.32;
  let t = t0;
  for (let i = 0, n = 4 + Math.floor(Math.random() * 5); i < n; i++) {
    const f = (260 + Math.random() * 420) / voice.size;
    noise(0.03 + Math.random() * 0.04, f, 5 + Math.random() * 4, lvl * (0.5 + Math.random() * 0.5) * (1 - i / (n + 2)), 'bandpass', 0.025, { delay: t, buf: pink, pan, wet });
    t += 0.035 + Math.random() * 0.09;
  }
  noise(0.9, 700 / voice.size, 0.6, lvl * 0.35, 'lowpass', 0.6, { delay: t + 0.05, buf: pink, pan, wet: wet + 0.1 });
}

// A zombie's voice: its own pitch (f0) and throat (size)
export function zombieVoice(type) {
  const base = type === 'brute' ? 55 : type === 'runner' ? 95 : type === 'patient' ? 85 : 72;
  return { f0: base * (0.85 + Math.random() * 0.3), size: (type === 'brute' ? 0.82 : 0.95) * (0.92 + Math.random() * 0.16) };
}

export const sfx = {
  // Thunder: a crack when close, then a long low rumble
  thunder(vol = 1, close = false) {
    if (!ctx) return;
    if (close) { noise(0.3, 2500, 0.7, 0.6 * vol, 'highpass', 0.25, { wet: 0.5 }); tone(45, 0.6, 0.4 * vol, 'sawtooth', -15, { wet: 0.5 }); }
    noise(1.8, 140, 0.8, 0.9 * vol, 'lowpass', 1.6, { buf: brown, wet: 0.6 });
    noise(1.8, 90, 0.8, 0.7 * vol, 'lowpass', 1.7, { buf: brown, wet: 0.6, delay: 0.3 + Math.random() * 0.5 });
    noise(1.5, 70, 0.8, 0.45 * vol, 'lowpass', 1.4, { buf: brown, wet: 0.6, delay: 1.1 + Math.random() * 0.7 });
  },
  shot(kind, suppressed, vol = 1, pan = 0) {
    if (!ctx || vol < 0.02) return;
    withVol('shot_' + (CALIBRE[kind] || 'rifle545'), () => gunshot(kind, suppressed, vol, pan));
  },
  // A bullet smacking into something nearby: a chip of concrete, sometimes a whine
  impact(vol = 1) {
    if (!ctx || vol < 0.03 || playSample('impact', vol)) return;
    noise(0.05, 3200, 0.9, 0.35 * vol, 'highpass', 0.04, { wet: 0.2 });
    noise(0.08, 700, 1, 0.25 * vol, 'lowpass', 0.07, { buf: pink });
    if (Math.random() < 0.18) tone(2600 + Math.random() * 1600, 0.35, 0.05 * vol, 'sine', -1400, { wet: 0.3 });
  },
  voice(vol = 0.3) {
    // Speech: a few murmured syllables (the words appear on screen)
    if (!ctx) return;
    const f0 = 120 + Math.random() * 80, v = cur;
    for (let i = 0; i < 3; i++) setTimeout(() => { if (!ctx) return; const prev = cur; cur = v; vocal({ f0, dur: 0.12 + Math.random() * 0.08, contour: [1, 1.1, 0.95], vowels: [pick(Object.keys(VOWELS)), pick(Object.keys(VOWELS))], rasp: 0.05, breath: 0.15, gain: 0.06 * vol, attack: 0.02, wet: 0.1 }); cur = prev; }, i * 150);
  },
  zombie(kind, vol, voice = { f0: 72, size: 1 }, pan = 0) {
    if (!ctx || vol < 0.01) return;
    withVol('zombie_' + kind, () => {
      if (playSample(`zombie_${kind}`, vol * 0.8, pan, 0.25)) return;
      const k = ZKIND[kind](voice), wet = 0.2 + (1 - vol) * 0.4;
      vocal({ ...k, f0: voice.f0 * (0.95 + Math.random() * 0.1), size: voice.size, gain: vol * 0.32 * k.mul, pan, wet });
      if (kind === 'die') deathRattle(k.dur, voice, vol, pan, wet);
    });
  },
  // (older callers)
  groan(vol) { this.zombie('groan', vol); },
  // The radio: a squelch, a few clipped words over the air, a squelch
  radio(words = 4) {
    if (!ctx) return;
    noise(0.12, 2500, 0.5, 0.12, 'highpass', 0.1);
    tone(1150, 0.08, 0.05, 'square', 0, { delay: 0.1 });
    const f0 = 110 + Math.random() * 30, v = cur;
    for (let i = 0; i < words; i++) {
      setTimeout(() => { if (!ctx) return; const prev = cur; cur = v; vocal({ f0: f0 * (0.9 + Math.random() * 0.25), dur: 0.14 + Math.random() * 0.12, contour: [1, 1.15, 0.9], vowels: [pick(Object.keys(VOWELS)), pick(Object.keys(VOWELS))], rasp: 0.2, breath: 0.3, gain: 0.2, attack: 0.01, wet: 0, radio: true }); noise(0.2, 1800, 1, 0.025, 'bandpass', 0.2); cur = prev; }, 260 + i * 210);
    }
    setTimeout(() => { if (!ctx) return; const prev = cur; cur = v; noise(0.15, 2500, 0.5, 0.1, 'highpass', 0.12); cur = prev; }, 300 + words * 210);
  },
  // The A-10's 30 mm cannon heard from afar: a tearing buzz (the rounds come
  // too fast to tell apart) with a long rolling echo. delay: the sound's
  // flight time from the plane
  brrrt(vol = 1, pan = 0, delay = 0, dur = 2) {
    if (!ctx || vol < 0.01) return;
    const t = now() + delay;
    const n = noiseSrc(pink, t, dur + 0.5), bp = filter('bandpass', 380, 0.7);
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 65;
    const depth = ctx.createGain(); depth.gain.value = 0.45; lfo.connect(depth); depth.connect(am.gain);
    const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = 65;
    const sg = ctx.createGain(); sg.gain.value = 0.35;
    const lp = filter('lowpass', 500 + 2500 * vol, 0.6);
    const env = gainEnv(t, 0.06, vol * 0.9, 0.35, dur);
    n.connect(bp); bp.connect(am); saw.connect(sg); sg.connect(am);
    const grit = ws(3); am.connect(grit); grit.connect(lp); lp.connect(env);
    out(env, pan, 0.55);
    for (const o of [lfo, saw]) { o.start(t); o.stop(t + dur + 1); }
    // the rumble under it
    noise(dur + 1.5, 120, 0.7, vol * 0.5, 'lowpass', dur + 1, { delay, buf: brown, pan, wet: 0.6 });
  },
  // An explosion: the crack of the blast, a deep thump, and the boom rolling
  // off the buildings. big: 0.5 (a grenade) .. 1.5 (an RPG warhead or C4)
  explosion(vol = 1, pan = 0, delay = 0, big = 1) {
    if (!ctx || vol < 0.01) return;
    noise(0.08, 1800, 0.7, 0.7 * vol, 'highpass', 0.06, { delay, pan, wet: 0.35 });
    noise(0.6 * big, 180, 0.8, 1.0 * vol, 'lowpass', 0.45 * big, { delay, buf: brown, pan, wet: 0.5 });
    tone(55 / big, 0.5 * big, 0.5 * vol, 'sine', -30, { delay, pan, wet: 0.3 });
    noise(2.2 * big, 90, 0.7, 0.45 * vol, 'lowpass', 1.6 * big, { delay: delay + 0.08, buf: brown, pan, wet: 0.8 });
    // debris pattering down
    for (let i = 0; i < 5; i++) tick(delay + 0.4 + Math.random() * 0.9, 1200 + Math.random() * 2500, 0.04 * vol, 3, pan, 0.01);
  },
  // Pulling the pin: the ring, the spoon pinging off
  pin() { if (!ctx) return; tick(0, 3200, 0.2, 8); ring(0.18, 3600, 0.03, 0.06); },
  throwWhoosh() { if (!ctx) return; noise(0.25, 900, 0.8, 0.08, 'bandpass', 0.18); },
  // A grenade bouncing on the ground
  clunk(vol = 1) { if (!ctx) return; noise(0.05, 500, 1.5, 0.15 * vol, 'bandpass', 0.04, { buf: pink }); tick(0, 1400, 0.06 * vol, 4); },
  // A 30 mm round bursting: a sharp crack and a thump
  cannonHit(vol = 1, pan = 0, delay = 0) {
    if (!ctx || vol < 0.02) return;
    noise(0.05, 2200, 0.8, 0.35 * vol, 'highpass', 0.04, { delay, pan, wet: 0.3 });
    noise(0.35, 260, 0.8, 0.6 * vol, 'lowpass', 0.3, { delay, buf: brown, pan, wet: 0.4 });
  },
  click(f = 2400, v = 0.12) { if (ctx) tick(0, f, v * 1.4, 4); },
  magOut() { if (!ctx || playSample('mag_out', 0.6)) return; tick(0, 2800, 0.3); tick(0.012, 1900, 0.2); scrape(0.03, 1400, 900, 0.09, 0.12); },
  magIn() { if (!ctx || playSample('mag_in', 0.6)) return; scrape(0, 900, 1500, 0.06, 0.12); tick(0.065, 2400, 0.42); ring(0.066, 1800, 0.05, 0.05); tone(180, 0.05, 0.12, 'sine', -60, { delay: 0.065 }); },
  bolt() {
    if (!ctx || playSample('bolt', 0.7)) return;
    scrape(0, 1200, 2600, 0.07, 0.16); tick(0.07, 2200, 0.3); // back
    tick(0.15, 3000, 0.5); ring(0.152, 2100, 0.07, 0.08); tone(140, 0.06, 0.15, 'sine', -50, { delay: 0.15 }); // home
  },
  pump() {
    if (!ctx || playSample('pump', 0.7)) return;
    scrape(0, 800, 1600, 0.08, 0.22); tick(0.08, 1800, 0.35); tone(150, 0.05, 0.15, 'sine', -50, { delay: 0.08 });
    scrape(0.17, 1600, 900, 0.07, 0.2); tick(0.24, 2400, 0.42); ring(0.24, 1500, 0.05, 0.06);
  },
  shell() { if (!ctx) return; scrape(0, 700, 1100, 0.05, 0.12); tick(0.05, 1600, 0.3); },
  round() { this.click(3200, 0.08); },
  // Spent brass hitting the ground: a few small, dull tinks as it bounces and
  // rolls (a shotgun hull: hollow plastic taps). Noise through a resonance,
  // not a tone, so it reads as a bit of metal, not a chime.
  casing(shell = false) {
    if (!ctx) return;
    let t = 0, v = 1;
    const n = 2 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0), pan = (Math.random() - 0.5) * 0.6;
    const f = 4200 + Math.random() * 2600;
    for (let i = 0; i < n; i++) {
      if (shell) { tick(t, 700 + Math.random() * 300, 0.05 * v, 2.5, pan, 0.012); tick(t, 1900 + Math.random() * 500, 0.02 * v, 3, pan, 0.006); }
      else { tick(t, f * (0.97 + Math.random() * 0.06), 0.07 * v, 18, pan, 0.016); tick(t, 1500 + Math.random() * 600, 0.02 * v, 2, pan, 0.004); }
      t += Math.max(0.03, 0.09 + Math.random() * 0.08 - i * 0.025); v *= 0.45 + Math.random() * 0.15;
    }
    // (brass) a last short roll on the ground
    if (!shell && Math.random() < 0.5) scrape(t, f * 0.6, f * 0.5, 0.12, 0.006);
  },
  dry() { if (ctx) { tick(0, 3400, 0.3, 6); ring(0.001, 2600, 0.02, 0.03); } },
  reload() { this.magOut(); setTimeout(() => this.magIn(), 400); },
  swing() { if (ctx) scrape(0, 500, 1400, 0.16, 0.2); },
  hitFlesh() { noise(0.12, 400, 1, 0.5, 'lowpass', 0.12); tone(80, 0.1, 0.3); },
  // Bullet hits (the shooter's confirmation): a wet, meaty thwack; a skull crack
  hitBody(vol = 1) { if (!ctx) return; noise(0.1, 650, 1.2, 0.55 * vol, 'lowpass', 0.08, { buf: pink }); noise(0.05, 2400, 2, 0.16 * vol, 'bandpass', 0.04); tone(70, 0.12, 0.35 * vol, 'sine', -30); },
  hitHead(vol = 1) { if (!ctx) return; tick(0, 3600, 0.5 * vol, 3); noise(0.14, 500, 1, 0.55 * vol, 'lowpass', 0.12, { buf: pink }); tone(160, 0.06, 0.22 * vol, 'square', -100); },
  hitArmor(vol = 1) { if (!ctx) return; ring(0, 1900 + Math.random() * 600, 0.1 * vol, 0.12); tick(0, 3000, 0.25 * vol); },
  kill() { tone(55, 0.28, 0.4, 'sine', -25); noise(0.2, 220, 0.8, 0.3, 'lowpass', 0.2, { buf: brown }); },
  // A body hitting the ground: heavy thump plus gear rattle.
  bodyFall(vol = 1) {
    if (!ctx || vol < 0.03) return;
    tone(48 + Math.random() * 12, 0.25, 0.55 * vol, 'sine', -18);
    noise(0.22, 300, 0.8, 0.6 * vol, 'lowpass', 0.2, { buf: brown });
    noise(0.08, 1200, 1.5, 0.15 * vol, 'bandpass', 0.07, { delay: 0.07 + Math.random() * 0.06 });
  },
  // Glass: a sharp crash with tinkling shards falling after it
  glass(vol = 1) {
    if (!ctx) return;
    noise(0.25, 4200, 1.2, 0.7 * vol, 'highpass', 0.22, { wet: 0.3 });
    noise(0.12, 1800, 2, 0.4 * vol, 'bandpass', 0.1);
    for (let i = 0; i < 9; i++) ring(0.06 + i * (0.04 + Math.random() * 0.06), 2800 + Math.random() * 3500, 0.03 * vol, 0.06);
  },
  glassHit(vol = 1) { if (ctx) { tick(0, 2600, 0.35 * vol, 3); ring(0, 1400, 0.04 * vol, 0.05); } },
  doorBreak(vol = 1) { noise(0.4, 600, 0.8, 0.9 * vol, 'lowpass', 0.35, { buf: brown, wet: 0.3 }); noise(0.15, 2400, 2, 0.4 * vol, 'bandpass', 0.12); tone(70, 0.3, 0.5 * vol, 'sine', -30); },
  // Holding breath: a short inhale; letting go, an exhale (a gasp if you ran out)
  inhale() { noise(0.35, 700, 0.8, 0.07, 'bandpass', 0.3, { buf: pink }); },
  exhale(gasp) { noise(gasp ? 0.6 : 0.45, gasp ? 900 : 600, 0.7, gasp ? 0.14 : 0.06, 'bandpass', gasp ? 0.5 : 0.4, { buf: pink }); },
  horn() { tone(392, 0.45, 0.18, 'square'); tone(494, 0.45, 0.14, 'square'); },
  crank(dur = 1) { const n = Math.max(2, Math.round(dur / 0.14)); for (let i = 0; i < n; i++) { noise(0.09, 260, 1.5, 0.3, 'lowpass', 0.08, { delay: i * 0.14, buf: brown }); tone(55, 0.06, 0.12, 'square', 0, { delay: i * 0.14 }); } },
  crash(vol = 1) { noise(0.35, 500, 0.8, 0.9 * vol, 'lowpass', 0.3, { buf: brown, wet: 0.3 }); noise(0.2, 2800, 1, 0.35 * vol, 'bandpass', 0.18); ring(0.02, 900, 0.1 * vol, 0.2); tone(60, 0.25, 0.5 * vol, 'sine', -25); },
  // Using items
  eat() { noise(0.12, 900, 1.5, 0.25, 'bandpass', 0.1); noise(0.08, 1300, 2, 0.18, 'bandpass', 0.07, { delay: 0.09 }); },
  gulp() { tone(180, 0.09, 0.2, 'sine', -60); noise(0.06, 400, 2, 0.12, 'lowpass', 0.06); },
  rip() { noise(0.35, 2600, 1, 0.22, 'bandpass', 0.3); },
  zip() { for (let i = 0; i < 6; i++) tick(i * 0.035, 3200, 0.14, 4); },
  inject() { this.click(2400, 0.2); noise(0.4, 4000, 1, 0.08, 'highpass', 0.35, { delay: 0.06 }); },
  pills() { for (let i = 0; i < 8; i++) tick(i * 0.045 + Math.random() * 0.02, 4200, 0.12, 5); },
  dig() { noise(0.18, 350, 1, 0.45, 'lowpass', 0.16, { buf: brown }); noise(0.12, 500, 1, 0.3, 'lowpass', 0.1, { delay: 0.22, buf: brown }); },
  pour() { noise(0.8, 1800, 0.6, 0.09, 'bandpass', 0.7); },
  windowSlide() { if (ctx) scrape(0, 900, 1500, 0.3, 0.12); },
  // Meaty melee impact (blunt or blade)
  meleeHit(heavy) { noise(0.14, heavy ? 300 : 600, 1, 0.65, 'lowpass', 0.13, { buf: pink }); tone(heavy ? 60 : 90, 0.14, 0.45, 'sine', -30); if (heavy) tick(0, 2200, 0.3, 2); },
  // You, hurt: a grunt
  hurt() { if (ctx) vocal({ f0: 115 + Math.random() * 25, dur: 0.28, contour: [1.2, 1.05, 0.85], vowels: ['uh', 'ah'], rasp: 0.35, breath: 0.4, gain: 0.25, attack: 0.02, wet: 0.08 }); },
  // Footsteps: heel, then the roll of the foot (gritty)
  step(vol = 0.08) {
    if (!ctx) return;
    const f = 260 + Math.random() * 160;
    noise(0.05, f, 1, vol * 1.2, 'lowpass', 0.04, { buf: pink, wet: 0.12 });
    noise(0.04, 1400 + Math.random() * 900, 1.2, vol * 0.45, 'bandpass', 0.03, { delay: 0.035 + Math.random() * 0.02, wet: 0.12 });
  },
  pickup() { tone(500, 0.06, 0.12, 'triangle'); },
  hammer() { for (let i = 0; i < 3; i++) { tick(i * 0.16, 1800, 0.55, 2); ring(i * 0.16, 900, 0.06, 0.1); } },
  bash() { noise(0.25, 250, 1, 0.7, 'lowpass', 0.25, { buf: brown, wet: 0.25 }); tone(60, 0.2, 0.4); },
  door() { if (!ctx) return; scrape(0, 300, 180, 0.25, 0.1); tick(0.2, 1500, 0.15, 2); },
  chop() { noise(0.12, 700, 2, 0.6, 'bandpass', 0.12); tone(120, 0.08, 0.3); },
  breath() { noise(0.55, 900, 0.6, 0.12, 'bandpass', 0.5, { buf: pink }); noise(0.45, 600, 0.6, 0.09, 'bandpass', 0.4, { delay: 0.52, buf: pink }); },
  heartbeat() { tone(55, 0.15, 0.4); tone(50, 0.15, 0.3, 'sine', 0, { delay: 0.22 }); },
  extract() { tone(440, 0.3, 0.2, 'triangle'); tone(660, 0.4, 0.2, 'triangle', 0, { delay: 0.25 }); },
};

// A running engine: two detuned oscillators through a filter whose pitch and
// brightness follow the revs. set(on, rpm 0..1+)
// Each sound plays at its own slider's volume (gunshots and zombie voices
// pick theirs by calibre and by kind, above; combos use their parts')
for (const k of Object.keys(sfx)) {
  if (['shot', 'zombie', 'groan', 'reload'].includes(k)) continue;
  const f = sfx[k];
  sfx[k] = function (...a) { return withVol(k, () => f.apply(this, a)); };
}

export function engineSound() {
  if (!ctx) return { set() {} };
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'square';
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
  const g = ctx.createGain(); g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o1.start(); o2.start();
  let level = 0;
  const loop = {
    set(on, rpm) {
      const t = ctx.currentTime, r = Math.min(1.3, rpm);
      o1.frequency.setTargetAtTime(30 + r * 95, t, 0.12);
      o2.frequency.setTargetAtTime(15 + r * 47, t, 0.12);
      f.frequency.setTargetAtTime(260 + r * 1000, t, 0.12);
      level = on ? 0.05 + r * 0.06 : 0;
      g.gain.setTargetAtTime(level * soundVol('engine'), t, 0.2);
    },
    refresh() { g.gain.setTargetAtTime(level * soundVol('engine'), ctx.currentTime, 0.05); },
  };
  loops.push(loop);
  return loop;
}

// A jet going over: the turbofans' whine and roar. set(level 0..1, pitch
// (doppler, ~0.8..1.25), pan)
export function jetSound() {
  if (!ctx) return { set() {}, stop() {} };
  const src = ctx.createBufferSource(); src.buffer = white; src.loop = true;
  const deep = ctx.createBufferSource(); deep.buffer = brown; deep.loop = true;
  const whine = filter('bandpass', 2600, 2.5), roar = filter('bandpass', 700, 0.8), rumble = filter('lowpass', 160, 0.7);
  const g = ctx.createGain(); g.gain.value = 0;
  const wg = ctx.createGain(); wg.gain.value = 0.35;
  const pan = ctx.createStereoPanner();
  src.connect(whine); whine.connect(wg); wg.connect(g); src.connect(roar); roar.connect(g); deep.connect(rumble); rumble.connect(g);
  g.connect(pan); pan.connect(master);
  const send = ctx.createGain(); send.gain.value = 0.4; pan.connect(send); send.connect(verbBus);
  src.start(); deep.start();
  let level = 0;
  const loop = {
    set(lvl, pitch = 1, p = 0) {
      const t = ctx.currentTime;
      level = lvl;
      g.gain.setTargetAtTime(lvl * soundVol('jet'), t, 0.08);
      whine.frequency.setTargetAtTime(2600 * pitch, t, 0.08);
      roar.frequency.setTargetAtTime(700 * pitch, t, 0.08);
      pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), t, 0.08);
    },
    refresh() { g.gain.setTargetAtTime(level * soundVol('jet'), ctx.currentTime, 0.05); },
    stop() { try { src.stop(); deep.stop(); } catch { /* stopped */ } loops.splice(loops.indexOf(loop), 1); },
  };
  loops.push(loop);
  return loop;
}

// Looping weather ambience: filtered noise. set(volume 0..1, filter Hz)
let loopBuf = null;
export function ambientLoop(kind) {
  if (!ctx) return { set() {}, stop() {} };
  if (!loopBuf) {
    // 4 s of brown-ish noise for wind, white for rain (two channels)
    loopBuf = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    const w = loopBuf.getChannelData(0), b = loopBuf.getChannelData(1);
    let last = 0;
    for (let i = 0; i < w.length; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  }
  const src = ctx.createBufferSource();
  src.buffer = loopBuf; src.loop = true;
  const split = ctx.createChannelSplitter(2);
  const f = ctx.createBiquadFilter();
  f.type = kind === 'rain' ? 'lowpass' : 'bandpass';
  f.frequency.value = kind === 'rain' ? 4000 : 400; f.Q.value = kind === 'rain' ? 0.3 : 0.6;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(split); split.connect(f, kind === 'rain' ? 0 : 1); f.connect(g); g.connect(master);
  src.start();
  let level = 0;
  const key = 'ambient_' + kind;
  const loop = {
    set(vol, freq) {
      const t = ctx.currentTime;
      level = vol;
      g.gain.setTargetAtTime(vol * soundVol(key), t, 0.6);
      if (freq) f.frequency.setTargetAtTime(freq, t, 0.6);
    },
    refresh() { g.gain.setTargetAtTime(level * soundVol(key), ctx.currentTime, 0.05); },
    stop() { try { src.stop(); } catch { /* already stopped */ } loops.splice(loops.indexOf(loop), 1); },
  };
  loops.push(loop);
  return loop;
}
