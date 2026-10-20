// Skills that rise with use (Farming keeps its own copy in farming.js for
// older saves; new ones go through here). XP per stat lives on the character
// as ch.xp[stat]; the level is ch.stats[stat] (0..MAX_SKILL).
import { MAX_SKILL } from './character.js';

export const XP_TABLE = [0, 30, 80, 150, 250, 380, 540, 730, 950];
const NAMES = { guns: 'Guns' };

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
