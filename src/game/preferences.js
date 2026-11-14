import { normalizeRules } from './rules.js';
const KEY = 'mahjong.preferences.v2';
export function loadPreferences(storage) {
  let value = {};
  try {
    storage ??= globalThis.localStorage;
    const saved = storage.getItem(KEY);
    if (saved) value = JSON.parse(saved);
    else {
      const old = new URLSearchParams(storage.getItem('mahjong') || '');
      if (/^[0-4]$/.test(old.get('speed') || '')) value.speed = +old.get('speed');
      if (['0', '1'].includes(old.get('sound'))) value.sound = old.get('sound') === '1';
    }
  } catch { /* Defaults also support browsers with storage disabled. */ }
  return { music: typeof value.music === 'boolean' ? value.music : value.sound !== false, musicVolume: Number.isFinite(value.musicVolume) ? Math.max(0, Math.min(1, value.musicVolume)) : .25, speed: Number.isInteger(value.speed) && value.speed >= 0 && value.speed <= 4 ? value.speed : 3, sound: typeof value.sound === 'boolean' ? value.sound : true, rules: normalizeRules(value.rules) };
}
export function savePreferences(value, storage) {
  try { (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(value)); } catch { /* Keep session settings usable. */ }
}
