// Synthesized sound effects via WebAudio (no asset files needed).
let ctx = null;
let master = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(dur, freq, q, vol, type = 'lowpass', decay = dur) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5, dur);
}

function tone(freq, dur, vol, type = 'sine', slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  // vol < 1 for distant shots (other survivors); distance also muffles them.
  shot(kind, suppressed, vol = 1) {
    if (vol < 0.02) return;
    const big = kind === 'mp133' || kind === 'sks';
    if (suppressed) {
      // A suppressed shot is a sharp, muffled crack rather than a boom.
      noise(0.15, 900, 0.8, 0.45 * vol, 'lowpass', 0.12);
      noise(0.05, 3500, 2, 0.2 * vol, 'bandpass', 0.05);
      return;
    }
    noise(0.5, (big ? 1400 : 2200) * (0.4 + 0.6 * vol), 0.7, 1.0 * vol, 'lowpass', big ? 0.45 : 0.3);
    tone(big ? 90 : 140, 0.18, 0.6 * vol, 'sine', -60);
  },
  voice(vol = 0.3) {
    // A short murmur so speech has a presence (text appears on screen).
    if (!ctx) return;
    for (let i = 0; i < 3; i++) setTimeout(() => tone(140 + Math.random() * 80, 0.09, 0.05 * vol, 'triangle', 30), i * 110);
  },
  click(f = 2400, v = 0.12) { noise(0.03, f, 4, v, 'bandpass', 0.03); },
  magOut() { this.click(1500, 0.2); setTimeout(() => noise(0.08, 700, 2, 0.15, 'bandpass', 0.08), 60); },
  magIn() { noise(0.06, 1100, 3, 0.3, 'bandpass', 0.06); setTimeout(() => this.click(2600, 0.25), 70); },
  bolt() { noise(0.07, 1800, 3, 0.3, 'bandpass', 0.07); setTimeout(() => noise(0.06, 2400, 3, 0.35, 'bandpass', 0.06), 140); },
  pump() { noise(0.09, 900, 2, 0.35, 'bandpass', 0.09); setTimeout(() => noise(0.08, 1300, 2, 0.35, 'bandpass', 0.08), 180); },
  shell() { noise(0.05, 1600, 3, 0.2, 'bandpass', 0.05); },
  round() { this.click(3200, 0.08); },
  casing() { tone(3000 + Math.random() * 1500, 0.08, 0.03, 'triangle'); },
  dry() { tone(1800, 0.03, 0.2, 'square'); },
  reload() { tone(900, 0.05, 0.15, 'square'); setTimeout(() => tone(600, 0.06, 0.15, 'square'), 180); },
  swing() { noise(0.15, 900, 1, 0.25, 'bandpass', 0.15); },
  hitFlesh() { noise(0.12, 400, 1, 0.5, 'lowpass', 0.12); tone(80, 0.1, 0.3); },
  hurt() { tone(220, 0.25, 0.3, 'sawtooth', -120); noise(0.2, 500, 1, 0.3); },
  step(vol = 0.08) { noise(0.06, 300 + Math.random() * 200, 1, vol, 'lowpass', 0.06); },
  pickup() { tone(500, 0.06, 0.12, 'triangle'); },
  groan(vol) {
    if (!ctx || vol < 0.01) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = 70 + Math.random() * 40;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400 + Math.random() * 300; f.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol * 0.5, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(t); o.stop(t + 1.4);
  },
  hammer() { for (let i = 0; i < 3; i++) setTimeout(() => { noise(0.08, 1800, 2, 0.5, 'bandpass', 0.08); tone(300, 0.05, 0.2, 'square'); }, i * 160); },
  bash() { noise(0.25, 250, 1, 0.7, 'lowpass', 0.25); tone(60, 0.2, 0.4); },
  door() { tone(180, 0.15, 0.15, 'triangle', -60); noise(0.1, 600, 1, 0.15); },
  chop() { noise(0.12, 700, 2, 0.6, 'bandpass', 0.12); tone(120, 0.08, 0.3); },
  breath() { noise(0.55, 900, 0.6, 0.12, 'bandpass', 0.5); setTimeout(() => noise(0.45, 600, 0.6, 0.09, 'bandpass', 0.4), 520); },
  heartbeat() { tone(55, 0.15, 0.4); setTimeout(() => tone(50, 0.15, 0.3), 220); },
  extract() { tone(440, 0.3, 0.2, 'triangle'); setTimeout(() => tone(660, 0.4, 0.2, 'triangle'), 250); },
};
