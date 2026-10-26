// Core game: run setup, HUD, items, doors, notebooks + You Can Think Pad, per-frame update, win / lose flow.
import * as THREE from '../vendor/three.module.js';
import { G, S, P, input, $, rnd, ri, pick, clamp, dist, isTouch, ITEMS, TOTAL_NB } from './state.js';
import { cfg } from './config.js';
import * as A from './art.js';
import * as AI from './ai.js';
import { buildWorld, CELL, cellCenter, toCell, W, H } from './world.js';
import { Save, unlockAchievement } from './save.js';
import * as Snd from './audio.js';

const ai = () => cfg.ai;
const nm = (t) => (S.style === 'lessonb' && G.lb.names[t]) || ITEMS[t];
const settings = () => Save.settings;
const hud = {};
let subTimer = 0, musicT = 0;
export const notebooksList = [], pickups = [], puffs = [];
G.notebooksList = notebooksList; G.pickups = pickups; G.puffs = puffs;

// ------------------------------------------------------------------ setup
export function initGame(R) {
  G.R = R; G.scene = R.scene; G.camera = R.camera; G.Snd = Snd; G.Save = Save;
  Object.assign(hud, { prompt: $('prompt'), sub: $('subtitle'), nb: $('nbCount'), sta: $('staBar'), slots: $('slots'), flash: $('flash'), carry: $('carry'), ev: $('eventBanner') });
  R.scene.background = new THREE.Color(0x86c5ee);
  R.scene.fog = new THREE.Fog(0x1a2224, 50, 230);
  G.initActors(); G.initModes();
}
export const haptic = (ms) => { if (settings().haptics && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };
G.haptic = haptic;

export function say(html, ms = 3200, voice, o = {}) {
  const isVoice = !!voice;
  if (!isVoice || settings().subtitles || o.force) { hud.sub.innerHTML = html; hud.sub.style.display = 'block'; subTimer = ms / 1000; }
  if (voice) { if (o.nullVoice) Snd.nullVoice(voice); else Snd.speak(voice, o.pitch); }
}
G.say = say;
export const setPrompt = (t) => { if (t) { hud.prompt.textContent = t; hud.prompt.style.display = 'block'; } else hud.prompt.style.display = 'none'; };
G.setPrompt = setPrompt;
export function flash(color = '#fff', a = 0.8) {
  if (settings().reduceFlashing) a = Math.min(a, 0.25);
  hud.flash.style.background = color; hud.flash.style.transition = 'none'; hud.flash.style.opacity = a;
  requestAnimationFrame(() => { hud.flash.style.transition = 'opacity .6s'; hud.flash.style.opacity = 0; });
}
G.flash = flash;
export function renderSlots() {
  hud.slots.innerHTML = '';
  S.items.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'slot' + (i === S.sel ? ' sel' : '');
    if (it) { d.appendChild(A.itemIcon(it)); const t = document.createElement('span'); t.textContent = nm(it); d.appendChild(t); }
    d.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (S.sel !== i) { S.sel = i; Snd.sfx.select(); renderSlots(); } });
    hud.slots.appendChild(d);
  });
}
export function updateNb() {
  hud.nb.innerHTML = S.run === 'endless' ? `Notebooks <b>${S.endlessScore}</b>` : `Notebooks <b>${S.notebooks}/${S.style === 'lessonb' && G.lb.target ? G.lb.target() : TOTAL_NB}</b>`;
}
G.updateNb = updateNb;
export function giveItem(type) {
  const i = S.items.findIndex((x) => !x); if (i < 0) return false;
  S.items[i] = type; if (!S.items[S.sel]) S.sel = i; renderSlots(); return true;
}
G.giveItem = giveItem; G.renderSlots = renderSlots;
export function banner(t) { hud.ev.textContent = t; hud.ev.style.display = t ? 'block' : 'none'; }
G.banner = banner;

// ------------------------------------------------------------------ noise (JD hears everything)
// pri: detention > alarm > exit > wrong > door > footstep. radius Infinity = heard everywhere.
export function noise(x, z, kind, radius = Infinity, dur = 6) {
  if (S.style === 'lessonb') { if (S.mode === 'play' || S.mode === 'playtime') G.lb.noise(x, z, kind); return; }
  if (S.mode !== 'play' && S.mode !== 'playtime' && S.mode !== 'pad') return;
  const n = { x, z, pri: ai().noisePriority[kind] ?? 0, dur, kind };
  G.hearNoise?.(n, radius);
}
G.noise = noise;
export function spatial(x, z, range = 140) {
  const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1, v = Math.pow(clamp(1 - d / range, 0, 1), 1.4);
  return [v, clamp((dx * Math.cos(P.yaw) + dz * -Math.sin(P.yaw)) / d, -1, 1) * 0.9];
}
G.spatial = spatial;

// ------------------------------------------------------------------ doors
export function openDoor(d, byPlayer) {
  if (d.exit || d.shut) return;
  if (!d.want) {
    d.want = true;
    const silent = S.silentDoorsT > 0 || d.silent;
    if (!silent) { const [v, p] = spatial(cellCenter(d.cx), cellCenter(d.cz), 120); Snd.sfx.door(v, p); if (byPlayer) noise(cellCenter(d.cx), cellCenter(d.cz), 'door', ai().hearingRadius.door, 5); }
  }
  d.timer = S.doorHold || 3.5;
}
G.openDoor = openDoor;
function updateDoors(dt) {
  const w = G.world, chars = G.doorUsers?.() || [];
  for (const d of w.doors) {
    if (d.exit) continue;
    const cx = cellCenter(d.cx), cz = cellCenter(d.cz);
    if (d.lockT > 0) { d.lockT -= dt; if (d.lockT <= 0 && !d.locked) { /* lock expires */ } }
    if (d.want) {
      d.timer -= dt;
      const near = Math.hypot(P.x - cx, P.z - cz) < 6 || chars.some((c) => Math.hypot(c.x - cx, c.z - cz) < 8);
      if (near) d.timer = Math.max(d.timer, 0.8);
      if (d.timer <= 0) { d.want = false; if (S.silentDoorsT <= 0) { const [v, p] = spatial(cx, cz, 90); Snd.sfx.doorClose(v, p); } }
    }
    if ((d.locked || d.lockT > 0) && d.want && !d.openedByBreak) d.want = false;
    d.openAmt += clamp((d.want ? 1 : 0) - d.openAmt, -dt * 2.2, dt * 2.2);
    const off = d.openAmt * CELL * 0.95;
    d.mesh.position.set(d.base.x + (d.alongX ? off : 0), d.base.y, d.base.z + (d.alongX ? 0 : off));
  }
  for (const c of chars) {
    const cx = toCell(c.x), cz = toCell(c.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const d = w.doorAt(cx + dx, cz + dz);
      if (d && !d.exit && !d.gate && !d.locked && d.lockT <= 0 && Math.hypot(c.x - cellCenter(d.cx), c.z - cellCenter(d.cz)) < 6.5) openDoor(d, false);
    }
  }
}

// ------------------------------------------------------------------ pickups & items
export function addPickup(type, x, z) {
  const wrapped = S.style === 'party';
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex(wrapped ? 'present' : type), transparent: true }));
  s.scale.set(3, 3, 1); s.position.set(x, 2.2, z); G.root.add(s);
  const p = { type, x, z, sprite: s, ph: Math.random() * 6 }; pickups.push(p); return p;
}
G.addPickup = addPickup;
function itemSpots(n) {
  const w = G.world, spots = [];
  w.rooms.forEach((r) => { if (r === w.jdRoom) return; for (let k = 0; k < 3; k++) spots.push({ x: rnd(r.x0 + 0.8, r.x1 + 0.2) * CELL, z: rnd(r.z0 + 0.8, r.z1 + 0.2) * CELL }); });
  for (let k = 0; k < 16; k++) { const h = w.randHall(); spots.push({ x: h.x + rnd(-2, 2), z: h.z + rnd(-2, 2) }); }
  spots.sort(() => Math.random() - 0.5);
  const ok = (s) => !w.solids.some((o) => s.x > o.x0 - 2.5 && s.x < o.x1 + 2.5 && s.z > o.z0 - 2.5 && s.z < o.z1 + 2.5) && !pickups.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 8) && !notebooksList.some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 5) && Math.hypot(s.x - P.x, s.z - P.z) > 12;
  return spots.filter(ok).slice(0, n);
}
const NULL_SWAP = { bsoda: 'lock', alarm: 'nosquee', apple: 'zesty', tape: 'boots' };
function spawnItems() {
  const base = ['keys', 'zesty', 'zesty', 'bsoda', 'bsoda', 'alarm', 'scissors', 'tape', 'nosquee', 'lock', 'boots', 'apple'];
  if (S.style === 'demo') base.push('bsoda', 'zesty', 'tape', 'apple', 'lock');      // Demo: more random items
  const spots = itemSpots(base.length);
  base.forEach((t, i) => { if (spots[i]) addPickup((S.style === 'null' || S.style === 'glitch') ? (NULL_SWAP[t] || t) : t, spots[i].x, spots[i].z); });
  const o = G.world.office; ['bsoda', 'zesty', 'boots'].forEach((t, k) => addPickup(t, (o.x0 + 2 + k * 2) * CELL + 4, (o.z0 + 0.8) * CELL));
}
export function clearPickups() { pickups.forEach((p) => G.root.remove(p.sprite)); pickups.length = 0; }

export function useItem() {
  if (G.throwCarry?.()) return;
  const it = S.items[S.sel];
  if (!it) { say('Empty slot.', 800); return; }
  if (S.style === 'lessonb') { if (G.lb.useItem(it)) { S.items[S.sel] = null; renderSlots(); haptic(30); G.lb.itemUsed(); } return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), consume = () => { S.items[S.sel] = null; renderSlots(); haptic(30); };
  const jd = G.actors.jd;
  switch (it) {
    case 'zesty': S.stamina = 100; S.boost = 6; Snd.sfx.eat(); consume(); say('Mmm! Energy!', 1200); break;
    case 'bsoda': {
      Snd.sfx.bsoda(); consume();
      for (let k = 0; k < 14; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x66aaff, transparent: true, opacity: 0.8 })); s.scale.set(1.5, 1.5, 1); s.position.set(P.x, 3.5, P.z); G.root.add(s); puffs.push({ sprite: s, vx: fx * 40 + rnd(-6, 6), vz: fz * 40 + rnd(-6, 6), life: 0.6 }); }
      let hits = 0;
      for (const c of G.actors.pushables()) {
        const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz);
        if (d < 32 && (dx * fx + dz * fz) / (d || 1) > 0.55 && G.world.los(P.x, P.z, c.x, c.z)) { G.actors.onBsoda(c, fx, fz); hits++; }
      }
      if (hits >= 4) unlockAchievement('bsoda4');
      break;
    }
    case 'alarm': { consume(); G.alarm = { x: P.x + fx * 3, z: P.z + fz * 3, t: 6, ring: 0 }; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex('alarm'), transparent: true })); s.scale.set(2.5, 2.5, 1); s.position.set(G.alarm.x, 1.5, G.alarm.z); G.root.add(s); G.alarm.sprite = s; say('Alarm set… it rings in 6 seconds!', 2000); break; }
    case 'tape': consume(); S.staticT = ai().deafSecondsTape; S.deafT = ai().deafSecondsTape; Snd.sfx.staticLoopStart(); say("JD's Least Favorite Tape is playing static. JD can't hear anything!", 2600); break;
    case 'nosquee': consume(); S.silentDoorsT = 90; Snd.sfx.eat(); say('Doors are silent for 90 seconds.', 2000); break;
    case 'lock': {
      const w = G.world; let best = null, bd = 1e9;
      for (const d of w.doors) { if (d.exit || d.gate) continue; const dd = Math.hypot(cellCenter(d.cx) - P.x, cellCenter(d.cz) - P.z); if (dd < bd) { bd = dd; best = d; } }
      if (best && bd < 16) { consume(); best.lockT = 25; best.want = false; Snd.sfx.key(); say('Door locked for 25 seconds (JD can break it).', 2200); } else say('Stand next to a door to lock it.', 1600);
      break;
    }
    case 'boots': consume(); P.boots = 60; Snd.sfx.pickup(); say("Big Ol' Boots on! Gotta Sweep can't push you for 60 seconds.", 2400); break;
    case 'apple': {
      const j = G.actors.jd;
      if (j.active && Math.hypot(j.x - P.x, j.z - P.z) < 60 && G.world.los(P.x, P.z, j.x, j.z)) { consume(); G.actors.feedJD(); Snd.sfx.throwIt(); say('JD stops to eat the apple!', 1800); }
      else say('Throw the apple when JD is in sight.', 1600);
      break;
    }
    case 'quarter': say('Use the quarter on a vending machine, or hand it to the Bully.', 2200); break;
    case 'keys': say("Walk up to a locked door to use the keys.", 2000); break;
    case 'scissors': if (!G.actors.cutRope()) say('Safety Scissors cut Playtime\'s rope or free you from detention.', 2200); else consume(); break;
  }
}
G.useItem = useItem;
function updateAlarm(dt) {
  const al = G.alarm; if (!al) return;
  al.t -= dt;
  if (al.t <= 0 && al.ring === 0) { al.ring = 1; al.rt = al.dur || 10; Snd.sfx.alarmStart(); }
  if (al.ring === 1) {
    al.rt -= dt; al.sprite.position.y = 1.5 + Math.abs(Math.sin(S.time * 40)) * 0.3;
    Snd.sfx.alarmVol(Math.max(0.1, spatial(al.x, al.z, 160)[0]));
    al.nt = (al.nt || 0) - dt; if (al.nt <= 0) { al.nt = 1; noise(al.x, al.z, 'alarm', Infinity, 3); }
    if (al.rt <= 0) { Snd.sfx.alarmStop(); G.root.remove(al.sprite); G.alarm = null; }
  }
}

// ------------------------------------------------------------------ interaction
let interact = null;
export function findInteract() {
  const w = G.world, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let best = null, bd = 1e9;
  const consider = (label, fn, x, z, range, o = {}) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz), minDot = o.minDot ?? 0.6;
    if (d > range || d < 0.01 || (dx * fx + dz * fz) / d < minDot) return;
    if (o.los !== false && !w.los(P.x, P.z, x, z)) return;
    if (d < bd) { bd = d; best = { label, fn }; }
  };
  for (const n of notebooksList) if (!n.taken) consider('Take notebook', () => takeNotebook(n), n.x, n.z, 11);
  for (const p of pickups) consider(S.style === 'party' ? 'Open present' : 'Take ' + nm(p.type), () => takePickup(p), p.x, p.z, 8, { minDot: 0.45 });
  for (const d of w.doors) {
    if (d.exit) continue;
    const label = d.gate && d.locked ? 'Swinging doors (locked)' : d.locked ? (S.items.includes('keys') ? 'Unlock door' : 'Locked – needs keys') : (d.lockT > 0 ? 'Door is locked' : (d.want ? null : 'Open door'));
    if (label) consider(label, () => useDoor(d), cellCenter(d.cx), cellCenter(d.cz), 11, { los: false });
  }
  if (S.style !== 'lessonb') for (const v of w.vending) consider(S.items.includes('quarter') ? 'Insert quarter' : 'Vending machine (needs a quarter)', () => useVending(v), v.x, v.z, 10, { los: false });
  G.extraInteract?.(consider);
  return best;
}
function takePickup(p) {
  if (!giveItem(p.type)) { say('Inventory full!', 1200); return; }
  G.root.remove(p.sprite); pickups.splice(pickups.indexOf(p), 1); Snd.sfx.pickup(); haptic(15);
  say(S.style === 'party' ? `Unwrapped <b>${nm(p.type)}</b>!` : `Got <b>${nm(p.type)}</b>`, 1600);
}
function useDoor(d) {
  if (d.gate && d.locked) { Snd.sfx.locked(); say(S.style === 'lessonb' ? 'Locked.' : 'The yellow swinging doors stay locked until you have <b>2 notebooks</b>.', 2400); return; }
  if (d.locked) {
    const ki = S.items.indexOf('keys');
    if (ki < 0) { Snd.sfx.locked(); say("The door is locked. Find the <b>Principal's Keys</b>.", 2200); return; }
    S.items[ki] = null; d.locked = false; Snd.sfx.key(); renderSlots(); say('Unlocked!', 1400);
  } else if (d.lockT > 0) { Snd.sfx.locked(); return; }
  openDoor(d, true);
}
function useVending(v) {
  const qi = S.items.indexOf('quarter');
  if (qi < 0) { Snd.sfx.locked(); say('Insert a <b>quarter</b>.', 1500); return; }
  S.items[qi] = null; Snd.sfx.coin(); renderSlots();
  const it = Math.random() < 0.55 ? 'zesty' : 'bsoda';
  setTimeout(() => { Snd.sfx.vend(); if (!giveItem(it)) addPickup(it, v.x, v.z); say(`Out came a <b>${nm(it)}</b>!`, 1800); }, 500);
}

// ------------------------------------------------------------------ notebooks + You Can Think Pad
function takeNotebook(n) {
  if (S.style === 'null' || S.style === 'glitch') { n.taken = true; G.root.remove(n.mesh); G.nullNotebook(n); return; }
  openPad(n);
}
function genProblems(nbNo, impossibleLast) {   // nbNo = 1.. ; addition and subtraction only
  const qs = [], lv = S.run === 'endless' ? Math.min(7, 1 + Math.floor(S.endlessScore / 2)) : nbNo;
  for (let i = 0; i < 3; i++) {
    if (i === 2 && impossibleLast) { qs.push({ q: pick(['▒ + ¿ =', '7̷ − ?̸ = ▓', '█ + █ = ?̷̢', '∞ − ∞ =']), a: null, impossible: true }); continue; }
    if (Math.random() < 0.5) { const x = ri(1, 5 + lv * 3), y = ri(1, 5 + lv * 3); qs.push({ q: `${x} + ${y} =`, a: x + y }); }
    else { const x = ri(3, 9 + lv * 3), y = ri(1, x); qs.push({ q: `${x} − ${y} =`, a: x - y }); }
  }
  return qs;
}
G.genProblems = genProblems;
let pad = null;
const padMsg = (t) => { $('mathMsg').textContent = t; };
function openPad(nb) {
  const nbNo = S.run === 'endless' ? S.endlessScore + 1 : S.notebooks + 1;
  pad = { nb, i: 0, wrong: 0, right: 0, qs: S.style === 'lessonb' ? G.lb.problems(nbNo) : genProblems(nbNo, nbNo >= 2), input: '', lock: false, nbNo };
  S.mode = 'pad'; document.exitPointerLock?.(); $('math').classList.remove('hidden'); setPrompt(null);
  $('mathTitle').textContent = S.style === 'lessonb' ? `NOTEBOOK ${nbNo}` : S.run === 'endless' ? `YOU CAN THINK PAD · NOTEBOOK ${nbNo}` : `YOU CAN THINK PAD · NOTEBOOK ${nbNo} OF ${TOTAL_NB}`;
  Snd.sfx.click(); showQ(true);
}
const spoken = (q) => q.replace('−', 'minus').replace('+', 'plus').replace('×', 'times').replace('÷', 'divided by').replace('=', '');
function showQ(first) {
  const q = pad.qs[pad.i];
  $('mathQ').textContent = q.q; $('mathA').innerHTML = '&nbsp;'; pad.input = ''; $('mathProg').textContent = `Problem ${pad.i + 1}/3`;
  $('mathQ').classList.toggle('glitch', !!q.impossible);
  padMsg(first && pad.nbNo === 1 ? "Hello! Let's learn some basics!" : '');
  if (q.impossible) { Snd.sfx.glitchy(); Snd.speak("Oh dear. This one is impossible!", 0.3); }
  else Snd.speak((first && pad.nbNo === 1 ? "Hello! Let's learn some basics! " : `Problem ${pad.i + 1}. `) + spoken(q.q));
}
export function padInput(k) {
  if (!pad || pad.lock) return;
  if (k === '⌫') pad.input = pad.input.slice(0, -1);
  else if (k === 'OK') { submit(); return; }
  else if (k === '-') { if (!pad.input) pad.input = '-'; }
  else if (pad.input.replace('-', '').length < (S.style === 'lessonb' ? 5 : 4)) pad.input += k;
  $('mathA').textContent = pad.input || ' ';
}
G.padInput = padInput;
function submit() {
  if (pad.input === '' || pad.input === '-') return;
  const q = pad.qs[pad.i], ok = !q.impossible && parseInt(pad.input, 10) === q.a;
  pad.lock = true;
  if (ok) { pad.right++; S.correct++; Snd.sfx.correct(); const m = pick(['Correct!', 'Great job!', 'Good!', 'Excellent!']); padMsg(m); Snd.speak(m, 0.7); }
  else {
    pad.wrong++; S.wrong++; Snd.sfx.wrong();
    padMsg(q.impossible ? 'I GET ANGRIER FOR EVERY PROBLEM YOU GET WRONG!' : S.style === 'lessonb' ? 'Wrong!' : `Wrong! It was ${q.a}.`); Snd.speak(q.impossible ? 'I get angrier for every problem you get wrong!' : 'Oh no, that is wrong!', 0.25);
    try { if (S.style !== 'lessonb') G.actors.onWrong(pad.i, q.impossible, pad); } catch (e) { console.error(e); }
  }
  try { if (S.style === 'lessonb') G.lb.onAnswer(ok, pad.i, q); } catch (e) { console.error(e); }
  const p = pad;
  setTimeout(() => {
    if (pad !== p) return;   // the pad was closed some other way (quit, restart)
    try { pad.i++; if (pad.i >= 3) finishPad(); else { pad.lock = false; showQ(); } }
    catch (e) { console.error(e); recoverPad(); }   // never leave the pad locked
  }, 1300);
}
function recoverPad() { pad = null; $('math').classList.add('hidden'); $('mathQ').classList.remove('glitch'); if (S.mode === 'pad') S.mode = 'play'; G.lockPointer(); }
function finishPad() {
  const nb = pad.nb, info = pad; pad = null;
  $('math').classList.add('hidden'); S.mode = 'play'; $('mathQ').classList.remove('glitch');
  G.lockPointer();
  try { collectNotebook(nb, info); } catch (e) { console.error(e); }
}
export function collectNotebook(nb, info = null) {
  if (nb) { nb.taken = true; G.root.remove(nb.mesh); }
  S.notebooks++;
  if (S.run === 'endless') { S.endlessScore++; G.endlessCollected(); }
  updateNb(); Snd.sfx.notebook(); haptic(40);
  if (S.style === 'lessonb') G.lb.onNotebook(info); else G.actors.onNotebook(info);
  if (S.run !== 'endless' && S.notebooks >= (S.style === 'lessonb' ? G.lb.target() : TOTAL_NB)) startEscape();
  else if (S.style !== 'lessonb' && info && info.nbNo === 1 && info.wrong === 0 && S.run !== 'endless' || (info && S.run === 'endless' && S.endlessScore === 1 && info.wrong === 0)) {
    if (S.style === 'party') say('<b>JD</b>: "Great job! A present for you!"', 3200, 'Great job! Here is a present!'); else say('<b>JD</b>: "Perfect! Here is a quarter!"', 3200, 'Perfect! Here is a quarter!');
    if (!giveItem('quarter')) addPickup('quarter', P.x, P.z);
  }
  if (S.run === 'story' && S.notebooks === 3 && S.correct === 0 && (S.style === 'classic' || S.style === 'party')) G.secretAllWrong?.();
}
G.collectNotebook = collectNotebook;
function startEscape() {
  if (S.style === 'lessonb') { G.lb.onEscape(); return; }
  S.exitsOpen = true; G.world.exitsOpen = true; S.phase = 'escape';
  G.world.exitDoors.forEach((d) => { d.mesh.visible = false; });
  if (S.style === 'null' || S.style === 'glitch') { G.nullAllNotebooks(); return; }
  Snd.sfx.siren(); flash('#f55', 0.5);
  say('All notebooks collected! <b>RUN to an EXIT!</b>', 5000, S.run === 'free' ? 'Wow! You found them all!' : 'Oh no! You will never get out!');
  G.actors.onEscape();
}

// ------------------------------------------------------------------ run setup
export function setStyle(style, run, fun) { S.style = style; S.run = run; S.fun = { ...fun }; }
export function startRun(style, run, fun) {
  G.lb?.cleanup?.();
  const nullish = style === 'null' || style === 'glitch';
  setStyle(style, run, nullish || style === 'lessonb' ? { hard: false, lights: false, mirror: false } : fun);
  Object.assign(S, { notebooks: 0, correct: 0, wrong: 0, stamina: 100, boost: 0, items: [null, null, null], sel: 0, time: 0, detention: 0, exitsOpen: false, exitsReached: 0, firstWrongT: null, hostile: false, carry: null, deafT: 0, silentDoorsT: 0, calmT: 0, staticT: 0, endlessScore: 0, event: null, eventT: 0, nextEventT: rnd(45, 80), caught: false, bossHits: 0, phase: 'main', behind: false, paused: false, staMax: 100, staDrain: 0, staRegen: 0, staResume: 0, staDelay: 0, staDelayT: 0, doorHold: 0, runMul: 0, frozenT: 0 });
  Object.assign(P, { vx: 0, vz: 0, pitch: 0, boots: 0, shoveX: 0, shoveZ: 0, y: 0, exhausted: false });
  const mirror = !!S.fun.mirror;
  if (!G.worlds[mirror]) G.worlds[mirror] = buildWorld(G.scene, mirror);
  for (const k in G.worlds) G.worlds[k].root.visible = (k === String(mirror));
  G.world = G.worlds[mirror]; G.root = G.world.root;
  const w = G.world;
  w.solids.length = w.solids.length;   // static solids stay; dynamic ones are removed below
  G.removeDynamicSolids?.();
  w.exitsOpen = false;
  w.doors.forEach((d) => { d.want = false; d.openAmt = 0; d.lockT = 0; d.shut = false; d.silent = false; d.gate = !!d.isGate; d.locked = d.exit ? false : (d.label === 'OFFICE' || d.isGate); d.mesh.visible = true; });
  if (S.run === 'free' || nullish || style === 'lessonb') w.gateDoors.forEach((d) => { d.gate = false; d.locked = false; });   // the swinging doors only gate the Baldi-style runs
  Snd.sfx.alarmStop(); Snd.sfx.staticLoopStop(); G.alarm = null;
  clearNotebooks(); clearPickups(); puffs.forEach((p) => G.root.remove(p.sprite)); puffs.length = 0;
  P.x = cellCenter(w.map.start.x); P.z = cellCenter(w.map.start.z); P.yaw = 0;   // the south exit: the school's 4-way hub is straight ahead
  // notebooks: 7 random classrooms (never JD's room)
  if (style !== 'lessonb') {
    const classes = w.roomInfo.filter((r) => r.r.kind === 'class');
    const near = classes.filter((r) => r.id === 'C1' || r.id === 'C2'), far = classes.filter((r) => r.id !== 'C1' && r.id !== 'C2').sort(() => Math.random() - 0.5);
    const rooms = S.run === 'endless' ? [...near, ...far] : [...near, ...far].sort(() => Math.random() - 0.5);   // Endless always starts with the two classrooms beside the hub
    const count = S.run === 'endless' ? 3 : TOTAL_NB;
    rooms.slice(0, count).forEach((ri_) => spawnNotebookAt(ri_));
    G.nbSpare = rooms.slice(count);
    spawnItems();
  }
  G.resetActors(); G.setupMode();
  applyLook(); updateNb(); renderSlots(); banner('');
  S.mode = 'play';
  Snd.ambienceStart();
  G.musicWant = null; musicT = 0; G.sceneCue = null;
}
G.startRun = startRun;
function spawnNotebookAt(ri_) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), G.nbMat || (G.nbMat = new THREE.MeshBasicMaterial({ map: A.notebookTex(), side: THREE.DoubleSide })));
  mesh.position.copy(ri_.pos); G.root.add(mesh);
  notebooksList.push({ mesh, room: ri_.r, info: ri_, taken: false, x: ri_.pos.x, z: ri_.pos.z });
}
G.spawnNotebookAt = spawnNotebookAt;
function clearNotebooks() { notebooksList.forEach((n) => { if (n.mesh.parent) n.mesh.parent.remove(n.mesh); }); notebooksList.length = 0; }
G.clearNotebooks = clearNotebooks;

// ------------------------------------------------------------------ look (fog, brightness, red tint)
export function applyLook() {
  const U = G.R.uniforms, sc = G.scene;
  U.bright.value = 1; U.tintAmt.value = 0; U.glitch.value = 0; U.hue.value = 0; U.vignette.value = 0.15; U.invert.value = 0;
  sc.fog.color.set(0x1a2224); sc.fog.near = 50; sc.fog.far = 230; sc.background.set(0x86c5ee);
  G.world.ceil.visible = true; G.world.ground.material.color.set(0x4f9a46);
  if (S.fun.lights) { sc.fog.color.set(0x000000); sc.fog.near = 6; sc.fog.far = 85; U.bright.value = 0.8; U.vignette.value = 0.5; }
  }
G.applyLook = applyLook;

// ------------------------------------------------------------------ update
export function update(dt) {
  const w = G.world;
  if (S.mode === 'play' || S.mode === 'playtime') S.time += dt;
  const playing = S.mode === 'play';
  const keyMove = !!(input.mx || input.mz);
  let mx = input.mx, mz = input.mz; const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  if (!playing || S.frozenT > 0) { mx = mz = 0; }
  P.moving = ml > 0.1 && playing;
  const wantRun = input.run;
  if (P.stamina === undefined) P.stamina = 100;
  const staMax = S.staMax || 100;
  if (S.stamina <= 0) P.exhausted = true; else if (S.stamina > (S.staResume || 25)) P.exhausted = false;
  P.running = wantRun && P.moving && S.stamina > 0 && !P.exhausted;
  let speed = P.running ? (S.style === 'lessonb' ? ai().walkSpeed * S.runMul : ai().runSpeed) : ai().walkSpeed;
  if (S.event === 'flood') speed *= 0.6;
  if (S.carry && S.carry.heavy) speed *= 0.85;
  if (P.running) { S.stamina = Math.max(0, S.stamina - (S.boost > 0 ? 0 : (S.staDrain || 18)) * dt); S.staDelayT = S.staDelay || 0; }
  else { S.staDelayT = Math.max(0, (S.staDelayT || 0) - dt); if (S.staDelayT <= 0) S.stamina = Math.min(staMax, S.stamina + (S.staRegen || 12) * dt); }
  S.boost = Math.max(0, S.boost - dt);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const acc = Math.min(1, dt * (S.event === 'gravity' ? 3 : 14));
  P.vx += ((fx * mz + rx * mx) * speed - P.vx) * acc; P.vz += ((fz * mz + rz * mx) * speed - P.vz) * acc;
  if (S.mode === 'play' || S.mode === 'playtime') {
    P.x += (P.vx + P.shoveX) * dt; w.resolve(P, P.r); P.z += (P.vz + P.shoveZ) * dt; w.resolve(P, P.r);
    const k = Math.exp(-dt * 3); P.shoveX *= k; P.shoveZ *= k;
  }
  P.boots = Math.max(0, P.boots - dt);
  if (P.moving) {
    P.bob += dt * (P.running ? 13 : 9);
    const stepN = Math.floor(P.bob / Math.PI);
    if (P.running && stepN !== P.lastStep) { P.lastStep = stepN; noise(P.x, P.z, 'footstep', ai().hearingRadius.footstep, 1.5); }
  }
  S.silentDoorsT = Math.max(0, S.silentDoorsT - dt); S.calmT = Math.max(0, S.calmT - dt);
  if (S.deafT > 0) { S.deafT -= dt; if (S.deafT <= 0) Snd.sfx.staticLoopStop(); }
  if (S.detention > 0) { S.detention -= dt; if (S.detention <= 0) (S.style === 'lessonb' ? G.lb : G.actors).endDetention(false); }
  if (S.mode === 'play') {
    interact = findInteract();
    setPrompt(interact ? interact.label + (isTouch ? '' : ' [E / Click]') : null);
    if (input.act && interact) interact.fn();
    if (input.use) useItem();
  }
  input.act = input.use = false;
  updateDoors(dt); updateAlarm(dt);
  G.updateActors(dt); G.updateModes(dt);
  // exits
  if (playing) checkExits();
  // pickups & misc anims
  pickups.forEach((p) => { p.sprite.position.y = 2.2 + Math.sin(S.time * 2.4 + p.ph) * 0.35 + (S.event === 'gravity' ? 1.5 + Math.sin(S.time + p.ph) : 0); });
  notebooksList.forEach((n) => { if (!n.taken) { n.mesh.rotation.y += dt * 1.8; n.mesh.position.y = 5.4 + Math.sin(S.time * 2) * 0.35; } });
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= dt; p.sprite.position.x += p.vx * dt; p.sprite.position.z += p.vz * dt; p.sprite.material.opacity = clamp(p.life * 2, 0, 0.8); p.sprite.scale.multiplyScalar(1 + dt * 3); if (p.life <= 0) { G.root.remove(p.sprite); puffs.splice(i, 1); } }
  // HUD
  hud.sta.style.width = clamp(S.stamina / (S.staMax || 100) * 100, 0, 100) + '%'; hud.sta.classList.toggle('low', P.exhausted || (S.style === 'lessonb' && S.stamina < 20)); hud.sta.classList.toggle('mid', S.style === 'lessonb' && !P.exhausted && S.stamina >= 20 && S.stamina <= 60);
  if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) hud.sub.style.display = 'none'; }
  if (S.map) drawMap();
  hud.carry.style.display = S.carry ? 'block' : 'none'; if (S.carry) hud.carry.textContent = `Holding ${S.carry.label || 'item'}`;
  musicT -= dt; if (musicT <= 0) { musicT = 0.5; updateMusic(); }
}
function checkExits() {
  const w = G.world;
  w.exitPos.forEach((e, i) => {
    const d = w.exitDoors[i]; if (!d) return;
    const dd = Math.hypot(P.x - e.x, P.z - e.z);
    if (!S.exitsOpen && dd < 6 && S.run !== 'free' && S.run !== 'endless') {
      d.rattle = (d.rattle || 0) - 1 / 60; if (d.rattle <= 0) { d.rattle = 2.5; Snd.sfx.locked(); noise(e.x, e.z, 'exit', Infinity, 4); say('The exit is locked. Find all <b>7 notebooks</b>!', 2200); }
    }
    if (S.exitsOpen && !d.shut && dd < 5) G.reachExit(i, d);
  });
}
G.reachExit = (i, d) => {
  if (S.style === 'lessonb') { G.lb.win(); return; }
  if (S.style === 'null' || S.style === 'glitch') { G.nullExit(i, d); return; }
  if (S.style === 'party') { G.partyFinale(); return; }
  win();
};
function updateMusic() {
  if (G.musicHold > 0) { G.musicHold -= 0.5; return; }
  let want;
  const pl = G.actors.playtime;
  if (S.mode === 'pad') want = 'math';
  else if (S.phase === 'boss') want = 'boss';
  else if (S.style === 'null' || S.style === 'glitch') want = null;
  else if (S.exitsOpen) want = S.run === 'free' ? 'escapeFree' : 'escape';
  else if (pl && pl.state !== 'away' && pl.state !== 'gone' && pl.sprite.visible && Math.hypot(pl.x - P.x, pl.z - P.z) < 45) want = S.style === 'party' ? 'party' : 'playtime';
  else want = 'schoolhouse';
  if (G.sceneCue) want = G.sceneCue;
  if (want !== G.musicWant) { G.musicWant = want; if (want) Snd.music.play(want); else Snd.music.stop(); }
  const jd = G.actors.jd, dB = jd.active ? Math.hypot(P.x - jd.x, P.z - jd.z) : 999;
  if (S.style !== 'lessonb') Snd.music.setIntensity(clamp(S.notebooks / 10 + (dB < 80 ? (1 - dB / 80) * 0.5 : 0) + (S.exitsOpen ? 0.2 : 0), 0, 1));   // Lesson-B eases its own intensity
}

// ------------------------------------------------------------------ minimap
const mm = $('minimap'), mg = mm.getContext('2d');
let mmBase = null, mmWorld = null;
function drawMap() {
  const w = G.world, T = 8;
  if (mmWorld !== w) {
    mmWorld = w; mmBase = A.cv(W * T, H * T); const g = mmBase.getContext('2d');
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const c = w.grid[z][x]; g.fillStyle = c === '#' ? '#222' : c === 'D' ? '#b07a3a' : c === 'L' ? '#a33' : c === 'E' ? '#3c3' : c === 'r' ? '#6f8da0' : c === 'o' ? '#7d3a3a' : '#c9a63a'; g.fillRect(x * T, z * T, T, T); }
    mm.width = 248; mm.height = Math.round(248 * H / W);
  }
  mg.drawImage(mmBase, 0, 0, mm.width, mm.height);
  const k = mm.width / (W * CELL);
  mg.save(); mg.translate(P.x * k, P.z * k); mg.rotate(-P.yaw);
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -6); mg.lineTo(4, 5); mg.lineTo(-4, 5); mg.closePath(); mg.fill(); mg.strokeStyle = '#000'; mg.stroke(); mg.restore();
}

// ------------------------------------------------------------------ flow: pause / win / lose
export function pause() {
  if (S.mode !== 'play' && S.mode !== 'playtime') return;
  S.paused = true; G.prevMode = S.mode; S.mode = 'paused'; $('pause').classList.remove('hidden'); document.exitPointerLock?.(); Snd.suspend(); G.hooks.onPause?.();
}
export function resume() {
  if (S.mode !== 'paused') return;
  $('pause').classList.add('hidden'); S.mode = G.prevMode || 'play'; S.paused = false; Snd.resume(); G.hooks.onResume?.();
}
G.pause = pause; G.resume = resume;
export function showOver(title, msg, o = {}) {
  S.mode = 'over'; Snd.music.stop(); Snd.sfx.alarmStop(); Snd.sfx.staticLoopStop(); Snd.ambienceStop(); document.exitPointerLock?.();
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('math').classList.add('hidden'); $('play').classList.add('hidden');
  $('overTitle').textContent = title; $('overMsg').textContent = msg;
  $('retryBtn').textContent = o.retry || 'Try again'; $('over').classList.remove('hidden');
  if (o.won && S.run === 'story') Snd.music.play('credits');
  G.hooks.onOver?.(o);
}
G.showOver = showOver;
G.winLB = (text) => { Snd.sfx.win(); showOver('YOU ESCAPED!', text, { won: true, retry: 'Play again' }); };
export function caught(by = 'jd') {
  if (S.caught || (S.mode !== 'play' && S.mode !== 'playtime')) return;
  S.caught = true; document.exitPointerLock?.(); Snd.music.stop(); Snd.sfx.alarmStop(); Snd.sfx.staticLoopStop(); setPrompt(null); haptic([200, 80, 200]);
  if (S.style === 'null' || S.style === 'glitch') { G.nullCatch(); return; }
  const lessonb = S.style === 'lessonb', scare = settings().scare || 'normal';
  S.mode = 'scare';
  const finish = () => { $('scare').classList.add('hidden'); showOver(lessonb ? 'The Teacher caught you!' : 'JD got you!', lessonb ? G.lb.overText() : S.run === 'endless' ? `You collected ${S.endlessScore} notebooks.` : `You collected ${S.notebooks} of ${TOTAL_NB} notebooks.`, { lost: true }); if (S.run === 'endless') G.recordEndless(); };
  if (scare === 'off') { flash('#000', 1); Snd.sfx.click(); setTimeout(finish, 700); return; }   // no flashes, no sudden stings
  Snd.sfx.scare();
  const c = $('scareCv'), g = c.getContext('2d'); g.fillStyle = '#300'; g.fillRect(0, 0, 512, 768); g.drawImage(A.drawJD('scream', true), -60, 30, 640, 960);
  $('scare').classList.toggle('calm', scare === 'low'); $('scare').classList.remove('hidden');
  setTimeout(finish, scare === 'low' ? 1400 : 1900);
}
G.caught = caught;
export function win(extra = '', title = 'YOU ESCAPED!') {
  if (S.mode === 'over') return;
  const t = S.time, p = Save.progress, st = S.style;
  Snd.sfx.win(); S.mode = 'over';
  let msg = `You escaped in ${Math.floor(t / 60)}m ${Math.floor(t % 60)}s${S.wrong ? ` (${S.wrong} wrong answers)` : ' with a perfect score!'}`;
  if (S.run === 'story' && p.beaten[st] !== undefined) {
    p.beaten[st] = true; unlockAchievement('beat_' + st);
    const unlocks = []; const uf = p.unlockedFun;
    if (st === 'classic' && !uf.mirror) { uf.mirror = true; unlocks.push('Mirror Mode'); }
    if (st === 'party' && !uf.lights) { uf.lights = true; unlocks.push('Lights Out'); }
    if (st === 'demo' && !uf.hard) { uf.hard = true; unlocks.push('Hard Mode'); }
    const best = Save.data.scores.bestTime[st]; if (best == null || t < best) Save.data.scores.bestTime[st] = Math.round(t);
    if (t < 360) unlockAchievement('speedrun');
    if (S.fun.hard && S.fun.lights && S.fun.mirror) { unlockAchievement('all_fun'); }
    if (unlocks.length) msg += `\nUnlocked: ${unlocks.join(', ')}!`;
    Save.save();
  }
  showOver(title, msg + extra, { won: true, retry: 'Play again' });
}
G.win = win;
G.recordEndless = () => {
  const sc = Save.data.scores.endless; if (S.endlessScore > (sc[S.style] || 0)) sc[S.style] = S.endlessScore;
  if (S.endlessScore >= 10) unlockAchievement('endless10'); if (S.endlessScore >= 15) unlockAchievement('endless15'); if (S.endlessScore >= 20) unlockAchievement('endless20');
  Save.save();
};
G.padOpen = () => !!pad;
