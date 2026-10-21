// The Sound settings panel: a volume slider for every sound in the game,
// grouped, each with a button to hear it. Opened from the title menu and the
// pause screen; settings are saved in the browser.
import { initAudio, sfx, soundVol, setSoundVol, zombieVoice } from './audio.js';

const zv = zombieVoice('walker');
// [key, label, test]
const GROUPS = [
  ['Overall', [
    ['master', 'Master volume', () => sfx.shot('ak74', false)],
  ]],
  ['Gunshots', [
    ['shot_pistol9', '9 mm pistols (PM, Glock)', () => sfx.shot('glock17', false)],
    ['shot_pistol45', '.45 pistol (M1911)', () => sfx.shot('m1911', false)],
    ['shot_smg9', 'Submachine gun (MP5)', () => sfx.shot('mp5', false)],
    ['shot_rifle545', '5.45 rifle (AK-74)', () => sfx.shot('ak74', false)],
    ['shot_rifle556', '5.56 rifle (M4A1)', () => sfx.shot('m4a1', false)],
    ['shot_lmg', 'Machine gun (M249)', () => sfx.shot('m249', false)],
    ['shot_rifle762', '7.62×39 rifle (SKS)', () => sfx.shot('sks', false)],
    ['shot_rifle308', '7.62×51 rifle (M14)', () => sfx.shot('m14', false)],
    ['shot_shotgun', 'Shotguns', () => sfx.shot('mp133', false)],
    ['impact', 'Bullets hitting walls', () => sfx.impact(1)],
  ]],
  ['Gun handling', [
    ['casing', 'Brass and shells hitting the ground', () => sfx.casing(Math.random() < 0.3)],
    ['magOut', 'Magazine out', () => sfx.magOut()],
    ['magIn', 'Magazine in', () => sfx.magIn()],
    ['bolt', 'Bolt and slide', () => sfx.bolt()],
    ['pump', 'Shotgun pump', () => sfx.pump()],
    ['shell', 'Loading a shell', () => sfx.shell()],
    ['round', 'Loading a round', () => sfx.round()],
    ['dry', 'Dry fire', () => sfx.dry()],
    ['click', 'Clicks (fire mode, switches, buttons)', () => sfx.click()],
  ]],
  ['Zombies', [
    ['zombie_groan', 'Groaning', () => sfx.zombie('groan', 0.8, zv)],
    ['zombie_growl', 'Growling (chasing)', () => sfx.zombie('growl', 0.8, zv)],
    ['zombie_snarl', 'Snarling (attacking)', () => sfx.zombie('snarl', 0.8, zv)],
    ['zombie_hurt', 'Hurt', () => sfx.zombie('hurt', 0.8, zv)],
    ['zombie_die', 'Dying', () => sfx.zombie('die', 0.8, zv)],
  ]],
  ['Combat', [
    ['swing', 'Melee swing', () => sfx.swing()],
    ['meleeHit', 'Melee hit', () => sfx.meleeHit()],
    ['hitFlesh', 'Hits (flesh)', () => sfx.hitFlesh()],
    ['hitBody', 'Body hits', () => sfx.hitBody()],
    ['hitHead', 'Headshots', () => sfx.hitHead()],
    ['hitArmor', 'Hits on armor', () => sfx.hitArmor()],
    ['kill', 'Kill confirm', () => sfx.kill()],
    ['bodyFall', 'Bodies falling', () => sfx.bodyFall()],
    ['bash', 'Bashing doors and windows', () => sfx.bash()],
    ['doorBreak', 'Doors breaking', () => sfx.doorBreak()],
    ['hurt', 'You getting hurt', () => sfx.hurt()],
  ]],
  ['You', [
    ['step', 'Footsteps', () => sfx.step(0.3)],
    ['breath', 'Breathing', () => sfx.breath()],
    ['inhale', 'Holding your breath', () => sfx.inhale()],
    ['exhale', 'Letting it out', () => sfx.exhale()],
    ['heartbeat', 'Heartbeat', () => sfx.heartbeat()],
    ['eat', 'Eating', () => sfx.eat()],
    ['gulp', 'Drinking', () => sfx.gulp()],
    ['pills', 'Pills', () => sfx.pills()],
    ['inject', 'Injections', () => sfx.inject()],
    ['rip', 'Bandages', () => sfx.rip()],
    ['zip', 'Zips and bags', () => sfx.zip()],
    ['pickup', 'Picking things up', () => sfx.pickup()],
    ['voice', 'Survivors talking', () => sfx.voice(0.8)],
  ]],
  ['World', [
    ['door', 'Doors', () => sfx.door()],
    ['windowSlide', 'Windows', () => sfx.windowSlide()],
    ['glass', 'Breaking glass', () => sfx.glass()],
    ['glassHit', 'Glass hits', () => sfx.glassHit()],
    ['hammer', 'Hammering', () => sfx.hammer()],
    ['chop', 'Chopping', () => sfx.chop()],
    ['dig', 'Digging', () => sfx.dig()],
    ['pour', 'Pouring', () => sfx.pour()],
    ['extract', 'Extraction', () => sfx.extract()],
    ['thunder', 'Thunder', () => sfx.thunder(0.8, true)],
    ['ambient_rain', 'Rain', null],
    ['ambient_wind', 'Wind', null],
  ]],
  ['Air support', [
    ['radio', 'Radio chatter', () => sfx.radio(4)],
    ['brrrt', 'A-10 cannon', () => sfx.brrrt(0.8, 0, 0, 2)],
    ['cannonHit', '30 mm rounds landing', () => sfx.cannonHit(0.8)],
    ['jet', 'A-10 engines', null],
  ]],
  ['Vehicles', [
    ['engine', 'Engine', null],
    ['horn', 'Horn', () => sfx.horn()],
    ['crank', 'Starter', () => sfx.crank(1)],
    ['crash', 'Crashes', () => sfx.crash()],
  ]],
];

export function setupSoundPanel() {
  const el = document.createElement('div');
  el.id = 'soundpanel';
  el.className = 'overlay';
  const pct = (v) => `${Math.round(v * 100)}%`;
  el.innerHTML = `<div class="panel snd-panel"><div class="snd-head"><h2>SOUND</h2><button class="snd-reset small">Reset all</button><button class="snd-close">✕ Close</button></div>
    <div class="snd-body">${GROUPS.map(([g, rows]) => `<div class="snd-group"><h3>${g}</h3>${rows.map(([k, label, test]) => `
      <div class="snd-row"><span class="snd-label">${label}</span>
        <input type="range" min="0" max="2" step="0.05" value="${soundVol(k)}" data-k="${k}">
        <span class="snd-val">${pct(soundVol(k))}</span>
        ${test ? `<button class="snd-test" data-k="${k}" title="Play it">▶</button>` : '<span class="snd-test"></span>'}</div>`).join('')}</div>`).join('')}</div></div>`;
  document.body.appendChild(el);
  const tests = Object.fromEntries(GROUPS.flatMap(([, rows]) => rows.map(([k, , t]) => [k, t])));
  el.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    setSoundVol(k, +e.target.value);
    e.target.nextElementSibling.textContent = pct(+e.target.value);
  });
  el.addEventListener('click', (e) => {
    if (e.target.classList.contains('snd-test')) { initAudio(); tests[e.target.dataset.k]?.(); }
    else if (e.target.classList.contains('snd-close') || e.target === el) close();
    else if (e.target.classList.contains('snd-reset')) {
      for (const inp of el.querySelectorAll('input[type=range]')) { inp.value = 1; setSoundVol(inp.dataset.k, 1); inp.nextElementSibling.textContent = '100%'; }
    }
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && el.style.display === 'flex') { e.stopPropagation(); close(); } }, true);
  function close() { el.style.display = 'none'; }
  return { open() { initAudio(); el.style.display = 'flex'; }, close, get isOpen() { return el.style.display === 'flex'; } };
}
