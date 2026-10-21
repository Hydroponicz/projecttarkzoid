// Skills that rise with use (Farming keeps its own copy in farming.js for
// older saves; new ones go through here). XP per stat lives on the character
// as ch.xp[stat]; the level is ch.stats[stat] (0..MAX_SKILL).
import { MAX_SKILL, STATS } from './character.js';

export const XP_TABLE = [0, 30, 80, 150, 250, 380, 540, 730, 950];
const NAMES = { guns: 'Guns', agility: 'Agility', dexterity: 'Dexterity' };

export function gainXp(game, stat, n) {
  const ch = game.profile;
  if (!ch) return;
  ch.xp = ch.xp || {};
  const lvl0 = ch.stats[stat] || 0;
  // Never below the current level's threshold (levels can come from
  // character creation or the dev console)
  ch.xp[stat] = Math.max(ch.xp[stat] ?? 0, XP_TABLE[Math.min(XP_TABLE.length - 1, lvl0)]) + n;
  while ((ch.stats[stat] || 0) < MAX_SKILL && ch.xp[stat] >= XP_TABLE[(ch.stats[stat] || 0) + 1]) {
    ch.stats[stat] = (ch.stats[stat] || 0) + 1;
    game.hud.message(`${NAMES[stat] || stat} skill increased to ${ch.stats[stat]}.`, 4);
  }
}

// How each skill rises (the rest are set when the character is made)
const TRAINS = {
  guns: 'Hitting things with firearms (hip-fire hits and kills count most)',
  agility: 'Sprinting, jumping, vaulting and climbing',
  dexterity: 'Strafing, backing off, quick turns and moving crouched',
  farming: 'Planting, watering, weeding and harvesting',
};

// The skills page in the inventory: every skill's level, the way to the
// next one for those that train with use, and what each does.
export function skillSheet(game) {
  const ch = game.profile, P = game.player;
  const rows = Object.entries(STATS).map(([k, st]) => {
    const lvl = ch.stats[k] || 0;
    let xp = null;
    if (k === 'farming') {
      const f = game.farming?.xpInfo();
      if (f) xp = lvl >= MAX_SKILL ? { frac: 1, text: 'Mastered' } : { frac: f.frac, text: f.text };
    } else if (TRAINS[k]) {
      const have = (ch.xp?.[k] ?? XP_TABLE[lvl]) + (P?.moveXp?.[k] || 0);
      const a = XP_TABLE[lvl], b = XP_TABLE[lvl + 1];
      xp = lvl >= MAX_SKILL ? { frac: 1, text: 'Mastered' } : { frac: Math.max(0, Math.min(1, (have - a) / (b - a))), text: `${Math.floor(have - a)}/${b - a} xp` };
    }
    const pips = Array.from({ length: MAX_SKILL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const how = TRAINS[k] ? `Trains by: ${TRAINS[k]}` : 'Set when the character was made';
    return `<div class="sk-row" title="${st.desc}">
      <div class="sk-head"><span class="sk-name">${st.name}</span><span class="sk-pips">${pips}</span><span class="sk-lvl">${lvl}</span></div>
      ${xp ? `<div class="sk-bar"><i style="width:${(xp.frac * 100).toFixed(1)}%"></i><b>${xp.text}</b></div>` : ''}
      <div class="sk-desc">${st.desc}</div><div class="sk-how">${how}</div></div>`;
  }).join('');
  const days = game.day ?? 1;
  return `<div class="sk-who">${ch.name} · ${ch.professionName || ''} · day ${days} · ${P?.kills ?? ch.kills ?? 0} kills</div>${rows}`;
}
