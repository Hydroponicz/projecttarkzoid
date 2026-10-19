// Persistent sandbox save: the world seed plus everything that changed in it
// (loot, doors, structures, zombies, time) and the current character.
const KEY = 'tarkzoid-save-v2';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage unavailable or corrupt */ }
  return null;
}

export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function deleteSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}
