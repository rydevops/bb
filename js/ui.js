// Menus: style / mode / fun settings, settings, trophies. Pure DOM, driven by the save data.
import { $ } from './state.js';
import { Save, ACHIEVEMENTS } from './save.js';
import * as Snd from './audio.js';

export const M = { style: 'classic', run: 'story', fun: { hard: false, lights: false, mirror: false } };
let hooks = {};

const STYLE_INFO = {
  classic: 'Classic: one schoolhouse, 7 notebooks, JD chasing.',
  party: 'Party: wrapped presents shuffle around, and the finale is a candle scene.',
  demo: 'Demo: Math Machines and random events like Fog and Flood.',
  null: 'Null Style: something is wrong with the school…',
  glitch: 'Glitch Style: the corrupted school, now with a red JDloon.',
};
const RUN_INFO = { story: 'Story: collect 7 notebooks, then escape. 10 to 20 minutes.', endless: 'Endless: collect as many notebooks as you can before JD catches you.', free: 'Free Run: explore with no JD. Nothing can be unlocked.' };
const FUN = [
  ['hard', 'Hard Mode', 'hard', 'Beat Demo Style to unlock Hard Mode: characters act faster and the Principal never loses you.'],
  ['lights', 'Lights Out', 'lights', 'Beat Party Style to unlock Lights Out: the school goes dark.'],
  ['mirror', 'Mirror Mode', 'mirror', 'Beat Classic Style to unlock Mirror Mode: the school is flipped.'],
];
const hint = (t) => { $('menuHint').textContent = t; };

export function renderMenu() {
  const p = Save.progress, nullish = M.style === 'null' || M.style === 'glitch';
  const sb = $('styleBtns'); sb.innerHTML = '';
  const addStyle = (id, label, locked, lockHint, cls) => {
    const b = document.createElement('button'); b.textContent = (locked ? '🔒 ' : '') + label; if (M.style === id) b.classList.add('sel'); if (locked) b.classList.add('locked'); if (cls) b.style.background = cls;
    b.onclick = () => { Snd.sfx.click(); if (locked) { hint(lockHint); return; } M.style = id; if (id === 'null' || id === 'glitch') { M.run = 'story'; M.fun = { hard: false, lights: false, mirror: false }; } hint(STYLE_INFO[id]); renderMenu(); };
    sb.appendChild(b);
  };
  addStyle('classic', 'Classic'); addStyle('party', 'Party'); addStyle('demo', 'Demo');
  if (p.nullDefeated) { if (p.nullStyleUnlocked || p.glitchBeaten || true) addStyle('glitch', 'Glitch', false, '', '#8a1c1c'); }
  else if (p.nullStyleUnlocked) addStyle('null', 'Null', !(p.met.classic && p.met.party && p.met.demo), 'Meet Null in Classic, Party and Demo Style first…');
  if (!['classic', 'party', 'demo', 'null', 'glitch'].includes(M.style) || (M.style === 'null' && p.nullDefeated) || (M.style === 'glitch' && !p.nullDefeated)) M.style = 'classic';
  const mb = $('modeBtns'); mb.innerHTML = '';
  [['story', 'Story'], ['endless', 'Endless'], ['free', 'Free Run']].forEach(([id, label]) => {
    const dis = nullish && id !== 'story'; const b = document.createElement('button'); b.textContent = label; if (M.run === id) b.classList.add('sel'); if (dis) b.classList.add('locked');
    b.onclick = () => { Snd.sfx.click(); if (dis) return; M.run = id; hint(RUN_INFO[id]); renderMenu(); }; mb.appendChild(b);
  });
  const fb = $('funBtns'); fb.innerHTML = '';
  FUN.forEach(([key, label, flag, lockHint]) => {
    const locked = !p.unlockedFun[flag], dis = locked || nullish || M.run === 'free'; const b = document.createElement('button');
    b.textContent = (locked ? '🔒 ' : M.fun[key] ? '✔ ' : '') + label; if (M.fun[key] && !dis) b.classList.add('sel'); if (dis) b.classList.add('locked');
    b.onclick = () => { Snd.sfx.click(); if (locked) { hint(lockHint); return; } if (dis) return; M.fun[key] = !M.fun[key]; renderMenu(); }; fb.appendChild(b);
  });
}

export function renderTrophies() {
  const a = Save.data.achievements, got = ACHIEVEMENTS.filter(([id]) => a[id]).length;
  $('trophyList').innerHTML = ACHIEVEMENTS.map(([id, name, desc]) => `<div class="${a[id] ? 'got' : ''}">${a[id] ? '🏆' : '🔒'} ${name}<small>${desc}</small></div>`).join('');
  const s = Save.data.scores, bt = (v) => v == null ? '–' : `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  $('scoreList').innerHTML = `${got}/${ACHIEVEMENTS.length} trophies · Endless best: Classic ${s.endless.classic}, Party ${s.endless.party}, Demo ${s.endless.demo} · Best times: Classic ${bt(s.bestTime.classic)}, Party ${bt(s.bestTime.party)}, Demo ${bt(s.bestTime.demo)}`;
}

function bindSettings() {
  const st = Save.settings;
  const sl = [['sMusic', 'musicVol'], ['sSfx', 'sfxVol'], ['sVoice', 'voiceVol'], ['sSens', 'sens']], ck = [['sLefty', 'lefty'], ['sReduce', 'reduceFlashing'], ['sSubs', 'subtitles'], ['sHaptics', 'haptics'], ['sContrast', 'hiContrast']];
  sl.forEach(([id, k]) => { const el = $(id); el.value = st[k]; el.oninput = () => { st[k] = parseFloat(el.value); Save.save('settings'); hooks.applySettings(); }; });
  ck.forEach(([id, k]) => { const el = $(id); el.checked = !!st[k]; el.onchange = () => { st[k] = el.checked; Save.save('settings'); hooks.applySettings(); }; });
  const q = $('sQuality'); q.value = st.quality; q.onchange = () => { st.quality = q.value; Save.save('settings'); hooks.applySettings(); };
  $('storageNote').textContent = Save.persistent ? 'Saved on this device (persistent storage granted). Nothing is ever sent over the network.' : 'Saved on this device. Nothing is ever sent over the network.';
}

export function initUI(h) {
  hooks = h;
  const show = (id) => { ['gate', 'warning', 'menu', 'settings', 'trophies', 'help', 'pause', 'over', 'iosCard'].forEach((x) => $(x).classList.add('hidden')); if (id) $(id).classList.remove('hidden'); };
  hooks.show = show;
  $('startBtn').onclick = () => { Snd.sfx.click(); hooks.start(M.style, M.run, M.fun); };
  $('settingsBtn').onclick = () => { Snd.sfx.click(); bindSettings(); show('settings'); };
  $('settingsClose').onclick = () => { Snd.sfx.click(); show('menu'); };
  $('trophyBtn').onclick = () => { Snd.sfx.click(); renderTrophies(); show('trophies'); };
  $('trophyClose').onclick = () => { Snd.sfx.click(); show('menu'); };
  $('helpBtn').onclick = () => { Snd.sfx.click(); show('help'); };
  $('helpClose').onclick = () => { Snd.sfx.click(); show('menu'); };
  $('sExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([Save.exportJSON()], { type: 'application/json' })); a.download = 'jd-basics-progress.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('sImport').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { Save.importJSON(await f.text()); bindSettings(); hooks.applySettings(); renderMenu(); alert('Progress imported.'); } catch (err) { alert('Could not import: ' + err.message); } e.target.value = ''; };
  $('sReset').onclick = () => { if (confirm('Reset ALL progress, trophies and high scores? Settings are kept.')) { Save.resetProgress(); renderMenu(); alert('Progress reset.'); } };
  renderMenu(); hint(STYLE_INFO.classic);
}
