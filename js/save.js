// Local save data (spec section 7): IndexedDB with a schema version + migrations, mirrored in memory so
// the game can read it synchronously. Falls back to localStorage. Nothing is ever sent over the network.
export const SCHEMA = 1;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaults = () => ({
  settings: { musicVol: 0.8, sfxVol: 0.9, voiceVol: 1, sens: 1, lefty: false, quality: '240', reduceFlashing: reduceMotion, subtitles: true, haptics: true, hiContrast: false, seenWarning: false, seenIosCard: false },
  progress: {
    schema: SCHEMA,
    beaten: { classic: false, party: false, demo: false },
    unlockedFun: { mirror: false, lights: false, hard: false },
    met: { classic: false, party: false, demo: false },
    secrets: { allWrong: false, partySong: false, glitchedSchool: false },
    nullStyleUnlocked: false, nullDefeated: false, glitchBeaten: false, debugUnlocked: false,
  },
  scores: { endless: { classic: 0, party: 0, demo: 0 }, bestTime: { classic: null, party: null, demo: null } },
  achievements: {},
});
const STORES = ['settings', 'progress', 'scores', 'achievements'];
const DB = 'jd-basics';
let db = null;

function deepFill(dst, def) {   // add keys introduced by newer versions without losing saved values
  for (const k in def) {
    if (!(k in dst)) dst[k] = structuredClone(def[k]);
    else if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && dst[k] && typeof dst[k] === 'object') deepFill(dst[k], def[k]);
  }
  return dst;
}
// migrations[n] upgrades data saved with schema n to n+1
const migrations = {};
function migrate(data) {
  let v = data.progress?.schema || 1;
  while (v < SCHEMA) { migrations[v]?.(data); v++; }
  data.progress.schema = SCHEMA;
  return data;
}

export const Save = {
  data: defaults(), persistent: false,
  async load() {
    let loaded = null;
    try {
      db = await new Promise((res, rej) => {
        const r = indexedDB.open(DB, SCHEMA);
        r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      loaded = {};
      for (const s of STORES) loaded[s] = await new Promise((res) => { const q = db.transaction(s).objectStore(s).get('data'); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
    } catch (e) { db = null; try { loaded = JSON.parse(localStorage.getItem('jd-basics-save')); } catch (_) { loaded = null; } }
    const d = defaults();
    if (loaded) for (const s of STORES) if (loaded[s]) d[s] = loaded[s];
    this.data = migrate(deepFill(d, defaults()));
    try { this.persistent = !!(await navigator.storage?.persist?.()); } catch (_) {}
    return this.data;
  },
  save(...stores) {
    const list = stores.length ? stores : STORES;
    if (db) {
      try { const tx = db.transaction(list, 'readwrite'); for (const s of list) tx.objectStore(s).put(this.data[s], 'data'); return; } catch (e) {}
    }
    try { localStorage.setItem('jd-basics-save', JSON.stringify(this.data)); } catch (e) {}
  },
  exportJSON() { return JSON.stringify({ app: 'jd-basics', schema: SCHEMA, data: this.data }, null, 2); },
  importJSON(text) {
    const o = JSON.parse(text);
    if (o.app !== 'jd-basics' || !o.data) throw new Error('Not a JD\'s Basics save file');
    this.data = migrate(deepFill(o.data, defaults())); this.save();
  },
  resetProgress() { const d = defaults(); this.data.progress = d.progress; this.data.scores = d.scores; this.data.achievements = d.achievements; this.save(); },
  get settings() { return this.data.settings; },
  get progress() { return this.data.progress; },
};

export const ACHIEVEMENTS = [
  ['beat_classic', 'Straight A', 'Beat Classic Style story mode'],
  ['beat_party', 'Party Pooper', 'Beat Party Style story mode'],
  ['beat_demo', 'Demo Day', 'Beat Demo Style story mode'],
  ['all_fun', 'Overachiever', 'Beat story mode with every Fun Setting on'],
  ['speedrun', 'Speed Reader', 'Beat story mode in under six minutes'],
  ['endless10', 'Study Hall', 'Reach 10 notebooks in Endless Mode'],
  ['endless15', 'Honor Roll', 'Reach 15 notebooks in Endless Mode'],
  ['endless20', 'Valedictorian', 'Reach 20 notebooks in Endless Mode'],
  ['bully_detention', 'Tattle Tale', 'Get the Principal to send the Bully to detention'],
  ['bsoda4', 'Soda Spray', 'Catch four or more characters in one BSODA spray'],
  ['ride_sweep', 'Hang On!', 'Ride Gotta Sweep for 30 seconds straight'],
  ['secret_allwrong', 'Always Wrong', 'Find the all-wrong secret ending'],
  ['secret_party', 'Happy Birthday', 'See the candle scene and the glitched school'],
  ['met_null', 'Is Someone There?', 'Meet Null in all three styles'],
  ['beat_null', 'Null and Void', 'Defeat Null'],
  ['beat_glitch', 'Glitch in the System', 'Beat Glitch Style'],
];
export function unlockAchievement(id) {
  if (Save.data.achievements[id]) return false;
  Save.data.achievements[id] = Date.now(); Save.save('achievements'); return true;
}
