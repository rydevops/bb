// Lesson-B: the "-B mod" mode (Project LESSON-B spec). A self-contained ruleset that plugs into the engine:
// Teacher with rhythm pursuit + anger, six hallway characters, ten items, detention, escape phase,
// results + rank + share code, all driven by data/lessonb/*.json and the variant layer (data/lessonb/variants/b.json).
import * as THREE from '../vendor/three.module.js';
import { G, S, P, input, $, rnd, pick, clamp, isTouch } from './state.js';
import * as A from './art.js';
import * as L from './lbai.js';
import { CELL, cellCenter, toCell } from './world.js';
import { Save, unlockAchievement } from './save.js';
import * as Snd from './audio.js';

const D = 0.8, V = 1.25;     // spec units -> engine units: distances x0.8 (tile 10u -> 8), speeds x1.25 (walk 10 u/s -> 12.5)
export let LB = null;        // merged data config (null until loaded)
const FILES = ['teacher', 'presets', 'items', 'characters'];

export async function loadLB() {
  try {
    const get = (f) => fetch('data/lessonb/' + f + '.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    const [teacher, presets, items, characters] = await Promise.all(FILES.map(get));
    const variant = await get('variants/b');
    const base = { teacher, characters, items, notebooks: 7 };
    LB = { ...L.applyVariant(base, variant), presets, variant };
  } catch (e) { console.error('Lesson-B data failed to load', e); LB = null; }
  G.lbReady = !!LB; return LB;
}

export const NAMES = { zesty: 'Zest Bar', bsoda: 'Fizz Can', lock: 'Brace Lock', keys: 'Master Keys', nosquee: 'Hinge Oil', quarter: 'Quarter', alarm: 'Alarm Clock', tape: 'Static Tape', scissors: 'Safety Scissors' };
const TO_ENGINE = { zest: 'zesty', fizz: 'bsoda', oil: 'nosquee', lock: 'lock', keys: 'keys', quarter: 'quarter', alarm: 'alarm', tape: 'tape', scissors: 'scissors' };
const lb = G.lb = { names: NAMES, active: () => S.style === 'lessonb' };
let run = null, ent = null;          // run state, entities (created once)

const mkSprite = (canvas, h) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(canvas), transparent: true })); s.scale.set(h * canvas.width / canvas.height, h, 1); s.center.set(0.5, 0); s.visible = false; G.scene.add(s); return s;
};
function initEntities() {
  if (ent) return;
  const model = A.makeJD(); model.visible = false; G.scene.add(model);
  ent = {
    T: { model, x: 0, z: 0, dirx: 0, dirz: 1, walk: 0 },
    principal: { sprite: mkSprite(A.drawPrincipal(), 8.2) }, sweeper: { sprite: mkSprite(A.drawSweep(), 9) }, rope: { sprite: mkSprite(A.drawPlaytime(), 7) },
    hug: { sprite: mkSprite(A.drawFirstPrize(), 7.5) }, crafter: { sprite: mkSprite(A.drawArts(), 6) }, bullies: [{ sprite: mkSprite(A.drawBully(), 6.5) }, { sprite: mkSprite(A.drawBully(), 6.5) }], customs: [],
  };
}
const world = () => G.world;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const inRoom = (r, p) => p.x >= r.x0 * CELL && p.x < (r.x1 + 1) * CELL && p.z >= r.z0 * CELL && p.z < (r.z1 + 1) * CELL;
const roomById = (id) => world().roomInfo.find((r) => r.id === id) || world().rooms.map((r) => ({ r, id: r.id, center: { x: (r.x0 + r.x1 + 1) * CELL / 2, z: (r.z0 + r.z1 + 1) * CELL / 2 } })).find((r) => r.id === id);
const centerOf = (id) => { if (id === 'OFFICE') { const o = world().office; return { x: (o.x0 + o.x1 + 1) * CELL / 2, z: (o.z0 + o.z1 + 1) * CELL / 2 }; } const ri = roomById(id); return ri ? { x: ri.center.x, z: ri.center.z } : world().randHall(); };

// ------------------------------------------------------------------ setup
lb.setup = () => {
  if (!LB) { G.say('Lesson-B data is missing.', 3000, undefined, { force: true }); return; }
  initEntities();
  const opts = G.lbOpts || { diff: 'normal', seed: L.randSeed(), mode: 'story' };
  const seed = opts.seed || L.randSeed(), diff = opts.diff || 'normal', preset = LB.presets[diff];
  run = {
    seed, diff, preset, practice: S.run === 'practice', rng: L.makeStreams(seed), clock: 0, detentions: 0, itemsUsed: 0, hits: 0,
    quietRunT: 0, runSeenT: 0, mercyT: 0, freezeT: 0, stunT: 0, zestT: 0, staticT: 0, noise: [], violations: 0, prior: 0, escapeT: 0, escaped: false, hyper: false, wMul: 1, lastSeenT: 0, spottedCooldown: 0,
    mercyDet: 0, vend: [{ stock: LB.items.vending.stock, cd: 0 }, { stock: LB.items.vending.stock, cd: 0 }], restocked: false, decks: [], capTimer: 0, over: false, nbTarget: Math.min(LB.notebooks, 7),
  };
  Object.assign(S, { staMax: 100, staDrain: 10, staRegen: 10, staResume: 20, staDelay: 0.5, staDelayT: 0, doorHold: 20, runMul: 16 / 10, frozenT: 0 });
  S.stamina = 100;
  const w = world();
  // doors: the study and the office are ordinary doors here (the Master Keys lie inside the office)
  w.doors.forEach((d) => { if (d.gate || d.label === 'OFFICE') { d.gate = false; d.locked = false; } });
  // notebooks in the 7 classroom-type rooms
  const eligible = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];   // the seven classrooms
  const order = eligible.map((id) => ({ id, k: run.rng.rooms() })).sort((a, b) => a.k - b.k).map((o) => o.id);
  G.nbSpare = [];
  order.slice(0, run.nbTarget).forEach((id) => { const ri = w.roomInfo.find((r) => r.id === id); if (ri) G.spawnNotebookAt(ri); });
  spawnItems(); placeDecks(); resetChars();
  if (S.run === 'practice') G.say('Practice: the Teacher is off. Try everything!', 4000);
  S.map = false; $('minimap').classList.add('hidden');
  const clock = $('clock'); clock.style.display = Save.settings.showTimer === false ? 'none' : 'block';
};

function spawnItems() {
  const w = world(), rng = run.rng.items, cfgI = LB.items, spots = [];
  const roomPoint = (ri) => ({ x: ri.cx + (rng() - 0.5) * 20, z: ri.farZ + ri.sgn * (CELL * (1.5 + rng() * 2.5)) });
  const add = (type, p) => { if (type && p && LB.enabledItems.includes(type)) G.addPickup(TO_ENGINE[type], p.x, p.z); };
  const room = (id) => w.roomInfo.find((r) => r.id === id);
  add('zest', roomPoint(room('CAF')));                                                 // Cafeteria
  const o = w.office; add('keys', { x: (o.x0 + o.x1 + 1) * CELL / 2 + 6, z: (o.z0 + 1) * CELL + 4 });   // Principal's Office
  add('scissors', roomPoint(room('F5')));                                              // Art Room (a faculty room)
  for (let i = 0; i < 2; i++) { const h = w.randHall(rng); add('quarter', { x: h.x + (rng() - 0.5) * 6, z: h.z + (rng() - 0.5) * 6 }); }
  for (let i = 0; i < 16; i++) { if (i % 2) { const h = w.randHall(rng); spots.push({ x: h.x + (rng() - 0.5) * 6, z: h.z + (rng() - 0.5) * 6 }); } else { const ri = w.roomInfo[Math.floor(rng() * w.roomInfo.length)]; spots.push(roomPoint(ri)); } }
  const count = Math.round(cfgI.randomCount * run.preset.itemMul), counts = {}, nbs = G.notebooksList;
  const ok = (s) => !nbs.some((n) => Math.hypot(n.x - s.x, n.z - s.z) < cfgI.minDistFromNotebook * D) && !w.solids.some((q) => s.x > q.x0 - 2 && s.x < q.x1 + 2 && s.z > q.z0 - 2 && s.z < q.z1 + 2);
  const usable = spots.filter(ok);
  for (let i = 0; i < count && i < usable.length; i++) {
    const exclude = {}; for (const k in counts) if (counts[k] >= cfgI.maxSame) exclude[k] = true;
    const weights = Object.fromEntries(Object.entries(cfgI.weights).filter(([k]) => LB.enabledItems.includes(k)));
    const t = L.weightedPick(rng, weights, exclude); counts[t] = (counts[t] || 0) + 1; add(t, usable[i]);
  }
}
function placeDecks() {
  run.decks.forEach((d) => d.mesh.parent?.remove(d.mesh)); run.decks = [];
  ['CAF', 'F4'].forEach((id) => {
    const ri = roomById(id); if (!ri) return; const c = ri.center;
    const m = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2.5), new THREE.MeshBasicMaterial({ color: 0x333a44 })); m.position.set(c.x - 6, 1.5, c.z); G.root.add(m);
    const l = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.2), new THREE.MeshBasicMaterial({ color: 0xff4a4a })); l.position.set(0, 0.7, 1.3); m.add(l);
    run.decks.push({ mesh: m, x: c.x - 6, z: c.z }); G.world.solids.push({ x0: c.x - 8, x1: c.x - 4, z0: c.z - 1.25, z1: c.z + 1.25, dyn: true });
  });
}

// ------------------------------------------------------------------ characters: creation / reset
function resetChars() {
  const w = world(), E = ent, rng = run.rng.chars, cc = LB.characters;
  const study = centerOf(w.jdRoom.id);
  const T = Object.assign(E.T, { x: study.x, z: study.z + 4, A: 0, state: 'friendly', phase: 'wait', t: 0, stateT: 0, noise: null, noiseT: 0, stall: 0, dirx: 0, dirz: 1, unseen: 0, sees: false, breakT: 0, disT: 0, goal: null, walk: 0, hostile: false, pathT: 0, burstDist: 0 });
  T.model.visible = !run.practice; T.model.position.set(T.x, 0, T.z); T.model.userData.setMood('happy'); T.model.userData.hat.visible = false;
  const hall = (n) => Array.from({ length: n }, () => w.randHall(rng));
  const farFrom = (min) => { for (let i = 0; i < 40; i++) { const h = w.randHall(rng); if (Math.hypot(h.x - P.x, h.z - P.z) > min) return h; } return w.randHall(rng); };
  const off = (c) => { c.sprite.visible = false; c.active = false; };
  Object.assign(E.principal, { x: 0, z: 0, state: 'patrol', wps: hall(8), wi: 0, runT: 0, warnT: 0, stall: 0, active: false, loungeT: 0, retreat: false }); off(E.principal);
  E.bullies.forEach((b, i) => { Object.assign(b, { x: 0, z: 0, state: 'lurk', t: rnd(10, 25) + i * 20, active: false, solid: null, stall: 0, demandT: 0, enabled: i === 0 || run.diff === 'nightmare' }); off(b); });
  Object.assign(E.sweeper, { x: 0, z: 0, state: 'closet', t: cc.sweeper.wakeCheck, route: null, shoved: false, active: false }); off(E.sweeper);
  Object.assign(E.rope, { x: 0, z: 0, state: 'wander', t: 0, wps: hall(4), wi: 0, misses: 0, active: false, cool: 0, stall: 0 }); off(E.rope);
  Object.assign(E.hug, { x: 0, z: 0, state: 'idle', t: 0, active: false, stall: 0, tx: 0, tz: 0, ox: 0 }); off(E.hug);
  const ar = roomById('F5'); Object.assign(E.crafter, { x: ar.center.x, z: ar.center.z, state: 'dormant', t: 0, lookT: 0, active: false, stall: 0 }); off(E.crafter);
  E.customs.forEach((c) => c.sprite.parent?.remove(c.sprite)); E.customs = [];
  LB.customChars.forEach((def) => {
    const sp = mkSprite(A.drawArts(), 6.5); const room = roomById(def.spawn?.room) || roomById('C3');
    E.customs.push({ def, sprite: sp, x: room.center.x, z: room.center.z, state: 'idle', cool: 0, active: false, stall: 0 });
  });
  run.capTimer = 0;
  // the Principal is on duty from the start; others join as notebooks are collected
  if (LB.enabledChars.includes('principal') && run.preset.characters !== 'noPrincipalNoRope') { activate('principal'); }
  if (run.practice) ['bully', 'sweeper', 'rope', 'hugbot', 'crafter'].forEach((k) => { run.cheatAll = true; activate(k); });
}
const PRIORITY = ['principal', 'bully', 'sweeper', 'rope', 'hugbot', 'crafter'];
function activeCount() { const E = ent; return [E.principal, ...E.bullies, E.sweeper, E.rope, E.hug, E.crafter].filter((c) => c.active && c.sprite.visible !== false && c.state !== 'dormant' && c.state !== 'closet').length; }
function activate(k) {
  const E = ent, w = world(), rng = run.rng.chars; if (!LB.enabledChars.includes(k)) return false;
  if (k === 'rope' && run.preset.characters === 'noPrincipalNoRope') return false;
  const far = (min) => { for (let i = 0; i < 40; i++) { const h = w.randHall(rng); if (Math.hypot(h.x - P.x, h.z - P.z) > min) return h; } return w.randHall(rng); };
  if (k === 'principal') { const o = centerOf('OFFICE'); Object.assign(E.principal, { x: o.x, z: o.z + 2, active: true }); E.principal.sprite.visible = true; }
  else if (k === 'bully') { E.bullies.forEach((b) => { if (b.enabled && !b.active) { b.active = true; b.state = 'lurk'; b.t = rnd(3, 10); } }); }
  else if (k === 'sweeper') { E.sweeper.active = true; E.sweeper.state = 'closet'; E.sweeper.t = LB.characters.sweeper.wakeCheck; }
  else if (k === 'rope') { const h = far(20 * D); Object.assign(E.rope, { x: h.x, z: h.z, active: true, state: 'wander' }); E.rope.sprite.visible = true; }
  else if (k === 'hugbot') { const c = centerOf(rng() < 0.5 ? 'CAF' : 'C4'); Object.assign(E.hug, { x: c.x + 6, z: c.z, active: true, state: 'idle' }); E.hug.sprite.visible = true; }
  else if (k === 'crafter') { E.crafter.active = true; E.crafter.state = 'dormant'; E.crafter.sprite.visible = true; }
  return true;
}
function updateActivation(dt) {
  run.capTimer -= dt; run.pendDt = (run.pendDt || 0) + dt; if (run.capTimer > 0) return; run.capTimer = 1; const elapsed = run.pendDt; run.pendDt = 0;
  const cap = S.notebooks >= LB.characters.capLateFrom ? LB.characters.capLate : LB.characters.capBase, E = ent, [d0, d1] = LB.characters.activationDelay || [0, 0];
  const isOn = { principal: E.principal.active, bully: E.bullies[0].active, sweeper: E.sweeper.active, rope: E.rope.active, hugbot: E.hug.active, crafter: E.crafter.active };
  run.pending = run.pending || {};
  for (const k of PRIORITY) {
    if (isOn[k] || S.notebooks < LB.characters[k].from) continue;
    // characters arrive a little after their notebook count is reached instead of all at once (no cliff at one notebook)
    if (run.pending[k] === undefined) run.pending[k] = k === 'principal' || run.cheatAll ? 0 : rnd(d0, d1);
    run.pending[k] -= elapsed; if (run.pending[k] > 0) continue;
    if (activeCount() >= cap) break;
    activate(k);
  }
}

// ------------------------------------------------------------------ noise bus
const KIND_MAP = { door: 'door', footstep: 'run', alarm: 'alarm', exit: null, wrong: null, detention: null };
lb.noise = (x, z, kind) => {
  if (!run || run.over) return; const k = KIND_MAP[kind] === undefined ? kind : KIND_MAP[kind]; const n = k && L.NOISE[k]; if (!n) return;
  run.noise.push({ x, z, radius: n.radius === Infinity ? Infinity : n.radius * D, duration: n.duration, priority: n.priority, kind: k, t: 0 });
  if (run.noise.length > 40) run.noise.shift();
};
const noiseAt = (x, z, k) => lb.noise(x, z, k);

// ------------------------------------------------------------------ Teacher
function slap(T) { const [v, p] = G.spatial(T.x, T.z, 170); Snd.sfx.slap(v, p); T.model.userData.slapT = 0.18; T.pulse = 0.15; }
function teacherSees(T) {
  const d = near(T, P); if (d > LB.teacher.sightRange * D || !world().los(T.x, T.z, P.x, P.z, 1)) return false;
  if (T.state === 'chasing') return true;
  const ang = Math.atan2(P.x - T.x, P.z - T.z), face = Math.atan2(T.dirx, T.dirz); let da = Math.abs(ang - face); if (da > Math.PI) da = 2 * Math.PI - da;
  return da <= (LB.teacher.sightFovDeg / 2) * Math.PI / 180;
}
function teacherMove(T, tx, tz, speed, dt) {
  const w = world(), n = Math.max(1, Math.ceil(speed * dt / 1.4)), sub = dt / n;       // sub-stepped so fast bursts never tunnel through the catch radius
  for (let i = 0; i < n; i++) {
    const px = T.x, pz = T.z; w.followPath(T, tx, tz, speed, sub, true); w.resolve(T, 1.5);
    const mv = Math.hypot(T.x - px, T.z - pz); if (mv > 0.001) { T.dirx = (T.x - px) / mv; T.dirz = (T.z - pz) / mv; T.walk += mv * 0.5; }
    if (!run.practice && near(T, P) < LB.teacher.catchRadius * D && S.mode === 'play') { G.caught('teacher'); return; }
  }
  // locked doors in the way: Brace Locks break 1.2 s after contact (loud), the office during detention after a 2 s warning
  const door = w.doorAt(toCell(T.nx ?? T.x), toCell(T.nz ?? T.z));
  if (door && !door.exit && (door.lockT > 0 || door.locked) && Math.hypot(cellCenter(door.cx) - T.x, cellCenter(door.cz) - T.z) < 10) {
    T.breakT += dt; const need = door.lockT > 0 ? LB.items.lock.breakAfterContact : 2.0;
    if (T.breakT >= need) { door.lockT = 0; door.locked = false; T.breakT = 0; Snd.sfx.slam(); noiseAt(cellCenter(door.cx), cellCenter(door.cz), 'braceBreak'); G.openDoor(door, false); }
  } else T.breakT = 0;
}
function updateTeacher(dt) {
  const T = ent.T, m = T.model, w = world(), tp = LB.teacher, escBonus = run.escaped ? tp.escape.waitMultiplier : 1;
  m.position.set(T.x, 0, T.z); m.rotation.y = Math.atan2(T.dirx, T.dirz);
  const u = m.userData; u.slapT = Math.max(0, (u.slapT || 0) - dt); u.armR.rotation.x = u.slapT > 0 ? -2.3 : -0.5; u.armL.rotation.x = Math.sin(T.walk) * 0.5; u.legs[0].rotation.x = Math.sin(T.walk) * 0.5; u.legs[1].rotation.x = -Math.sin(T.walk) * 0.5;
  T.pulse = Math.max(0, (T.pulse || 0) - dt); const sc = 1 + (T.pulse > 0 ? 0.08 * Math.sin((1 - T.pulse / 0.15) * Math.PI) : 0); m.scale.set(sc, sc, sc);   // slap pulse
  u.setMood(T.A < 1 ? 'happy' : 'angry');
  if (run.practice) return;
  const dp = near(T, P);
  if (T.state === 'friendly') { if (T.hostile) { T.state = 'angryIdle'; T.stateT = tp.angryIdleSeconds; } return; }
  if (T.state === 'angryIdle') { T.stateT -= dt; if (T.stateT <= 0) T.state = 'hunting'; return; }
  T.stall = Math.max(0, T.stall - dt); T.disT = Math.max(0, T.disT - dt);
  T.sees = teacherSees(T);
  if (T.sees) { if (T.unseen > 8 && run.spottedCooldown <= 0) { Snd.sfx.steal(); run.spottedCooldown = 6; } T.unseen = 0; } else T.unseen += dt;
  run.spottedCooldown = Math.max(0, run.spottedCooldown - dt);
  T.A = L.angerDecay(T.A, dt, T.unseen, tp);
  const prm = L.teacherParams(S.notebooks, T.A, tp), mul = run.preset.speedMul;
  const Wp = prm.W * escBonus * (run.diff === 'hard' || run.diff === 'nightmare' ? 0.95 : 1), avg = prm.avgSpeed * V * mul, burstDist = avg * Wp, burstSpeed = burstDist / tp.burstDuration * (T.sees ? 1 + tp.chaseBurstBonus : 1);
  // target selection (spec 8.4): escape alarm > player in sight > ringing alarm > loud noise > known position
  let target = { x: P.x, z: P.z }, state = 'hunting';
  const ev = L.pickNoise(run.noise, T, 2, (e, p) => Math.hypot(e.x - p.x, e.z - p.z));
  const alarm = run.noise.find((e) => e.kind === 'alarm');
  if (run.escapeT > 0) { state = 'chasing'; }
  else if (T.sees) { state = 'chasing'; }
  else if (alarm) { target = { x: alarm.x, z: alarm.z }; state = 'distracted'; }
  else if (ev && T.disT <= 0) { target = { x: ev.x, z: ev.z }; state = 'distracted'; T.noiseT = Math.max(T.noiseT, ev.duration); }
  if (T.state === 'disoriented' && T.disT > 0 && !alarm) {          // Static Tape: a 12 s random walk (an alarm clock overrides it)
    if (!T.goal || near(T, T.goal) < 3) T.goal = w.randHall(run.rng.teacher);
    teacherMove(T, T.goal.x, T.goal.z, avg * 0.8, dt); return;
  }
  if (T.state === 'disoriented') T.state = 'hunting';
  if (T.stall > 0) return;                                           // knockback stall
  T.state = state;
  if (tp.mode === 'continuous') { teacherMove(T, target.x, target.z, avg, dt); return; }
  T.t += dt;
  if (T.phase === 'wait') { if (T.t >= Wp) { slap(T); T.phase = 'burst'; T.t = 0; } }
  else { teacherMove(T, target.x, target.z, burstSpeed, dt); if (T.t >= tp.burstDuration) { T.phase = 'wait'; T.t = 0; } }
  if (!run.escaped && dp < 60 * D) { /* danger vignette handled in mood */ }
}
const teacherPush = (T, fx, fz, dist) => { const w = world(); for (let d = 0; d < dist; d += 1.5) { const px = T.x, pz = T.z; T.x += fx * 1.5; T.z += fz * 1.5; w.resolve(T, 1.5); if (Math.hypot(T.x - px, T.z - pz) < 0.7) break; } };

// ------------------------------------------------------------------ Principal + detention
function violation(kind) {
  const pr = ent.principal; if (run.mercyDet > 0 || pr.state === 'escort' || S.detention > 0 || run.escaped) return;
  run.violations++;
  if (run.violations === 1) { Snd.sfx.whistle(); G.say(`<b>Principal</b>: "Warning! ${kind === 'run' ? 'No running' : kind === 'lounge' ? 'Staff only' : 'Hands off those keys'}!"`, 2600, 'Warning!'); pr.warnCool = 3; }
  else { pr.state = 'escort'; Snd.sfx.whistle(); G.say('<b>Principal</b>: "That is enough. To the office!"', 2600, 'To the office!'); }
}
function startDetention() {
  const pr = ent.principal, w = world(), o = w.office, cc = LB.characters.principal;
  const T = Math.min(cc.detentionCap, cc.detentionBase + cc.detentionPerPrior * run.prior); run.prior++; run.detentions++;
  S.detention = T; pr.state = 'patrol'; run.mercyDet = 1e9;
  P.x = (o.x0 + o.x1 + 1) * CELL / 2; P.z = (o.z0 + 1.5) * CELL; P.vx = P.vz = 0; pr.x = P.x + 4; pr.z = P.z;
  const d = w.doorAt(o.door[0], o.door[1]); d.want = false; d.locked = true;
  G.flash('#000', 0.8); Snd.sfx.locked(); G.say(`<b>DETENTION</b> for ${T} seconds. The Teacher is coming…`, 3500); G.haptic(100);
}
lb.endDetention = () => {
  const w = world(), o = w.office, d = w.doorAt(o.door[0], o.door[1]); S.detention = 0; d.locked = false; G.openDoor(d, false);
  run.mercyDet = LB.characters.mercySeconds; G.say('Detention is over. Walk in the halls!', 2400);
};
function updatePrincipal(dt) {
  const pr = ent.principal, w = world(), cc = LB.characters.principal; if (!pr.active) return;
  if (run.mercyDet < 1e8) run.mercyDet = Math.max(0, run.mercyDet - dt); pr.stall = Math.max(0, pr.stall - dt); pr.warnCool = Math.max(0, (pr.warnCool || 0) - dt);
  pr.sprite.position.set(pr.x, 0, pr.z);
  if (S.detention > 0) return;
  if (run.escaped) {   // Principal retreats to his office during the escape phase
    const o = centerOf('OFFICE'); if (near(pr, o) > 4) w.followPath(pr, o.x, o.z, cc.speed * V, dt, false); return;
  }
  if (pr.stall > 0) return;
  const sees = w.los(pr.x, pr.z, P.x, P.z) && near(pr, P) < 90;
  if (pr.state === 'escort') {
    w.followPath(pr, P.x, P.z, cc.chase * V, dt, false); if (sees) { const dx = P.x - pr.x, dz = P.z - pr.z, d = Math.hypot(dx, dz) || 1; pr.x += dx / d * cc.chase * V * dt * 0.5; pr.z += dz / d * cc.chase * V * dt * 0.5; w.resolve(pr, 1.5); }
    if (near(pr, P) < 4.8) startDetention(); return;
  }
  const wp = pr.wps[pr.wi % pr.wps.length]; if (near(pr, wp) < 3) pr.wi++; w.followPath(pr, wp.x, wp.z, cc.speed * V, dt, false);
  if (!sees || run.mercyDet > 0) { pr.runT = 0; return; }
  if (P.running && P.moving) { pr.runT += dt; if (pr.runT >= cc.runViolation) { pr.runT = -3; violation('run'); } } else pr.runT = Math.max(0, pr.runT - dt);
  const lounge = world().roomInfo.find((r) => r.id === 'F4'); if (lounge && inRoom(lounge.r, P)) { pr.loungeT += dt; if (pr.loungeT > 0.5) { pr.loungeT = -3; violation('lounge'); } } else pr.loungeT = Math.min(0, pr.loungeT) < 0 ? pr.loungeT + dt : 0;
}

// ------------------------------------------------------------------ Bully
function bullyBlockRect(b) {
  const w = world(), cx = toCell(b.x), cz = toCell(b.z), horiz = w.isHall(cx - 1, cz) && w.isHall(cx + 1, cz);
  return horiz ? { x0: cx * CELL + 2, x1: cx * CELL + 6, z0: (cz - 2) * CELL, z1: (cz + 3) * CELL, dyn: true } : { x0: (cx - 2) * CELL, x1: (cx + 3) * CELL, z0: cz * CELL + 2, z1: cz * CELL + 6, dyn: true };
}
function bullyLeave(b) { if (b.solid) { const i = world().solids.indexOf(b.solid); if (i >= 0) world().solids.splice(i, 1); b.solid = null; } b.state = 'leave'; b.t = 3; run.mercyT = Math.max(run.mercyT, LB.characters.mercySeconds); }
function updateBullies(dt) {
  const w = world(), cc = LB.characters.bully;
  ent.bullies.forEach((b) => {
    if (!b.active) return; b.stall = Math.max(0, b.stall - dt); b.t -= dt; b.sprite.position.set(b.x, 0, b.z);
    if (b.state === 'lurk') {
      b.sprite.visible = !!b.x;
      if (!b.x || b.t <= 0) { for (let i = 0; i < 30; i++) { const h = w.randHall(run.rng.chars); if (Math.hypot(h.x - P.x, h.z - P.z) > 60 * D) { b.x = h.x; b.z = h.z; break; } } b.t = rnd(...cc.relocate); b.sprite.visible = true; }
      if (b.stall <= 0 && run.mercyT <= 0 && near(b, P) < cc.lurkRange * D && w.los(b.x, b.z, P.x, P.z)) { b.state = 'approach'; }
    } else if (b.state === 'approach') {
      if (near(b, P) > cc.approachTo * D) w.followPath(b, P.x, P.z, cc.speed * V * (run.hyper ? 1.25 : 1), dt, false); else { b.state = 'demand'; b.demandT = cc.demandWindow; Snd.sfx.giggle(); G.say('<b>Bully</b>: "Hand it over!"', 2000, 'Hand it over!'); }
    } else if (b.state === 'demand') {
      b.demandT -= dt;
      if (b.demandT <= 0) {   // take an item at random (unselected first)
        const idx = S.items.map((x, i) => (x ? i : -1)).filter((i) => i >= 0), uns = idx.filter((i) => i !== S.sel), pool = uns.length ? uns : idx;
        if (pool.length) { const i = pool[Math.floor(Math.random() * pool.length)], it = S.items[i]; S.items[i] = null; G.renderSlots(); Snd.sfx.steal(); run.hits++; G.say(`<b>Bully</b> took your ${NAMES[it] || it}!`, 2200); }
        b.state = 'block'; b.t = cc.block; b.solid = bullyBlockRect(b); w.solids.push(b.solid);
      }
    } else if (b.state === 'block') { if (b.t <= 0) bullyLeave(b); }
    else if (b.state === 'leave') {
      const h = b.goal || (b.goal = w.randHall(run.rng.chars)); w.followPath(b, h.x, h.z, cc.speed * V, dt, false); if (b.t <= 0 || near(b, h) < 3) { b.goal = null; b.state = 'lurk'; b.t = rnd(...cc.relocate); b.x = 0; b.sprite.visible = false; }
    }
  });
}

// ------------------------------------------------------------------ Sweeper
function sweepRoute() {
  const l = world().map.sweepLines[Math.floor(run.rng.chars() * world().map.sweepLines.length)], pt = ([x, z]) => ({ x: cellCenter(x), z: cellCenter(z) });
  return run.rng.chars() < 0.5 ? { a: pt(l.a), b: pt(l.b) } : { a: pt(l.b), b: pt(l.a) };
}
function updateSweeper(dt) {
  const s = ent.sweeper, cc = LB.characters.sweeper; if (!s.active) return;
  s.sprite.position.set(s.x, 0, s.z);
  if (s.state === 'closet') {
    s.sprite.visible = false; s.t -= dt;
    if (s.t <= 0) {
      s.t = cc.wakeCheck; const p = clamp(cc.wakeChance + cc.wakePerNotebook * (S.notebooks - cc.from), 0, 0.95);
      if (S.notebooks >= cc.from && run.mercyT <= 0 || run.cheatAll) if (run.rng.chars() < p || run.cheatAll) { s.route = sweepRoute(); s.x = s.route.a.x; s.z = s.route.a.z; s.state = 'windup'; s.t = cc.telegraph; s.sprite.visible = true; s.shoved = false; noiseAt(s.x, s.z, 'windup'); Snd.sfx.sweep(...G.spatial(s.x, s.z, 200).reverse()); }
    }
  } else if (s.state === 'windup') {
    s.t -= dt; s.sprite.position.x = s.x + Math.sin(S.time * 60) * 0.5;       // shake
    if (s.t <= 0) { s.state = 'sweep'; G.say('<b>Sweeper</b> is coming through!', 1800); }
  } else if (s.state === 'sweep') {
    const sp = cc.speed * V * (run.escaped ? LB.teacher.escape.sweeperSpeedMul : 1) * (run.hyper ? 1 : 1), dx = s.route.b.x - s.x, dz = s.route.b.z - s.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt), ux = dx / d, uz = dz / d;
    s.x += ux * st; s.z += uz * st;
    if (!s.shoved && Math.abs(P.x - s.x) < 5 && Math.abs(P.z - s.z) < 5 && S.detention <= 0) { s.shoved = true; P.shoveX += ux * cc.shove * D * 3; P.shoveZ += uz * cc.shove * D * 3; run.stunT = cc.stun; run.hits++; Snd.sfx.boing(); G.haptic(50); run.mercyT = Math.max(run.mercyT, LB.characters.mercySeconds); }
    for (const p of G.pickups) if (Math.hypot(p.x - s.x, p.z - s.z) < 5) { p.x += ux * st; p.z += uz * st; p.sprite.position.x = p.x; p.sprite.position.z = p.z; }   // loose floor items get swept along
    if (d <= st + 0.01) { s.state = 'closet'; s.sprite.visible = false; s.t = cc.wakeCheck; }
  }
}

// ------------------------------------------------------------------ Rope kid (jump-rope game)
const pt = { active: false, round: 0, pos: 0, dir: 1, misses: 0, speed: 2 };
function startRope() {
  const r = ent.rope, cc = LB.characters.rope; S.mode = 'playtime'; pt.active = true; pt.round = 0; pt.pos = 0; pt.dir = 1; pt.misses = r.misses; pt.speed = 2 / cc.cycle;
  const win = Save.settings.assistRope ? cc.assistWindow : cc.window; pt.zone = [0.5 - win / 2, 0.5 + win / 2]; run.mercyT = 1e9;
  $('play').classList.remove('hidden'); $('playProg').textContent = `0/${cc.rounds}`; $('playMsg').textContent = 'Jump when the rope reaches the green!';
  $('ropeZone').style.left = pt.zone[0] * 100 + '%'; $('ropeZone').style.width = win * 100 + '%'; $('cutBtn').classList.toggle('hidden', !S.items.includes('scissors'));
  r.state = 'play'; document.exitPointerLock?.(); G.setPrompt(null); Snd.sfx.giggle(); G.say('<b>Rope kid</b>: "Jump with me!"', 2400);
}
function endRope(why) {
  const r = ent.rope, cc = LB.characters.rope; pt.active = false; $('play').classList.add('hidden'); if (S.mode === 'playtime') S.mode = 'play'; G.lockPointer();
  run.mercyT = LB.characters.mercySeconds; r.misses = 0;
  if (why === 'tantrum') { r.state = 'tantrum'; r.t = cc.tantrumSeconds; G.say('<b>Rope kid</b> is throwing a tantrum!', 2500); }
  else { r.state = 'cooldown'; r.t = cc.cooldown; Snd.sfx.giggle(); }
}
lb.jump = () => {
  if (!pt.active) return; const cc = LB.characters.rope;
  if (pt.pos >= pt.zone[0] && pt.pos <= pt.zone[1]) { pt.round++; Snd.sfx.jump(); $('playProg').textContent = `${pt.round}/${cc.rounds}`; $('playMsg').textContent = pick(['Yay!', 'Again!', 'Nice jump!']); if (pt.round >= cc.rounds) endRope('win'); }
  else { Snd.sfx.miss(); pt.round = 0; ent.rope.misses++; run.hits++; $('playProg').textContent = `0/${cc.rounds}`; $('playMsg').textContent = 'Missed! Back to round 1.'; if (ent.rope.misses >= cc.tantrumMisses) endRope('tantrum'); }
};
function updateRope(dt) {
  const r = ent.rope, w = world(), cc = LB.characters.rope; if (!r.active) return;
  r.sprite.position.set(r.x, 0, r.z); r.stall = Math.max(0, r.stall - dt); r.t -= dt; const k = run.hyper ? 1.25 : 1;
  if (r.state === 'play') { pt.pos += pt.dir * pt.speed * dt; if (pt.pos > 1) { pt.pos = 1; pt.dir = -1; } else if (pt.pos < 0) { pt.pos = 0; pt.dir = 1; } $('ropeMark').style.left = `calc(${pt.pos * 100}% - 4px)`; if (S.mode !== 'playtime') pt.active = false; return; }
  if (r.stall > 0) return;
  const d = near(r, P), sees = d < cc.sight * D && w.los(r.x, r.z, P.x, P.z);
  if (r.state === 'wander') { const wp = r.wps[r.wi % r.wps.length]; if (near(r, wp) < 3) r.wi++; w.followPath(r, wp.x, wp.z, cc.speed * V * k, dt, false); if (sees && run.mercyT <= 0 && S.detention <= 0 && S.mode === 'play') { r.state = 'invite'; r.t = cc.invite; if (d > cc.accept * D) { run.freezeT = Math.max(run.freezeT, cc.invite); } } }
  else if (r.state === 'invite') {
    w.followPath(r, P.x, P.z, cc.run * V * k, dt, false);
    if (d < cc.accept * D && S.mode === 'play') { run.freezeT = 0; startRope(); } else if (r.t <= 0 && !sees) r.state = 'wander';
  } else if (r.state === 'tantrum') { w.followPath(r, P.x, P.z, cc.run * V * 0.6, dt, false); r.nT = (r.nT || 0) - dt; if (r.nT <= 0) { r.nT = 1; noiseAt(r.x, r.z, 'tantrum'); Snd.sfx.giggle(); } if (r.t <= 0) { r.state = 'cooldown'; r.t = cc.cooldown; } }
  else if (r.state === 'cooldown') { const wp = r.wps[r.wi % r.wps.length]; if (near(r, wp) < 3) r.wi++; w.followPath(r, wp.x, wp.z, cc.speed * V, dt, false); if (r.t <= 0) r.state = 'wander'; }
}

// ------------------------------------------------------------------ Hug-bot
function updateHug(dt) {
  const h = ent.hug, w = world(), cc = LB.characters.hugbot; if (!h.active) return;
  h.sprite.position.set(h.x, 0, h.z); h.stall = Math.max(0, h.stall - dt); h.t -= dt; if (h.stall > 0) return;
  if (h.state === 'idle') {
    const ev = L.pickNoise(run.noise.filter((e) => e.kind === 'run'), h, 1);   // it only reacts to running; walking is silent to it
    if (ev && run.mercyT <= 0 && S.mode === 'play') { h.state = 'alert'; h.t = cc.alert; h.tx = ev.x; h.tz = ev.z; Snd.sfx.beep(0.6); Snd.sfx.beep(0.6); }
  } else if (h.state === 'alert') { if (h.t <= 0) { h.state = 'charge'; const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz) || 1; h.tx += dx / d * cc.overshoot * D; h.tz += dz / d * cc.overshoot * D; h.t = 4; } }
  else if (h.state === 'charge') {
    const sp = cc.charge * V * (run.hyper ? 1.25 : 1), dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * dt);
    h.x += dx / d * st; h.z += dz / d * st; w.resolve(h, 1.5);
    if (near(h, P) < 3.6 && S.mode === 'play' && S.detention <= 0) { run.freezeT = cc.hug; S.stamina = 0; P.exhausted = true; run.hits++; Snd.sfx.boing(); G.say('<b>Hug-bot</b> hugs you! Stamina gone.', 2400); G.haptic(80); h.state = 'recover'; h.t = cc.recover; run.mercyT = LB.characters.mercySeconds; }
    else if (d <= st + 0.1 || h.t <= 0) { h.state = 'recover'; h.t = 2; }
  } else if (h.state === 'recover') { if (h.t <= 0) h.state = 'idle'; }
}

// ------------------------------------------------------------------ Crafter
const viewAngle = (x, z) => { const a = Math.atan2(-(x - P.x), -(z - P.z)); let d = Math.abs(a - P.yaw) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };
function updateCrafter(dt) {
  const c = ent.crafter, w = world(), cc = LB.characters.crafter; if (!c.active) return;
  c.sprite.position.set(c.x, 0, c.z); c.stall = Math.max(0, c.stall - dt); c.t -= dt;
  const los = w.los(P.x, P.z, c.x, c.z), ang = viewAngle(c.x, c.z), inCone = los && ang < (cc.wakeCone * Math.PI / 180) && near(c, P) < 100;
  if (c.state === 'dormant') {
    if (c.t > 0) return; c.lookT = inCone ? c.lookT + dt : 0;
    if (c.lookT >= cc.wakeSeconds) { c.state = 'stalk'; Snd.sfx.glitchy(); }
    return;
  }
  if (c.stall > 0) return;
  const seen = los && viewAngle(c.x, c.z) < 40 * Math.PI / 180;          // keep him in view and he never moves
  if (!seen) { w.followPath(c, P.x, P.z, cc.speed * V, dt, false); c.sc = (c.sc || 0) - dt; if (c.sc <= 0) { c.sc = 0.5; Snd.sfx.snip(); } }
  if (near(c, P) < cc.teleportAt * D && S.mode === 'play') {
    const e = ['JD', 'F4', 'F5'].map(centerOf).filter((r) => Math.hypot(r.x - P.x, r.z - P.z) > 40).sort(() => Math.random() - 0.5)[0] || centerOf('OFFICE');
    G.flash('#000', 1); P.x = e.x; P.z = e.z; P.vx = P.vz = 0; Snd.sfx.glitchy(); run.hits++; G.say('<b>Crafter</b> sent you somewhere else…', 2400);
    const ar = centerOf('F5'); c.x = ar.x; c.z = ar.z; c.state = 'dormant'; c.t = cc.dormant; c.lookT = 0;
  }
}

// ------------------------------------------------------------------ custom (variant) characters, data only
function updateCustoms(dt) {
  const w = world();
  ent.customs.forEach((c) => {
    const def = c.def; c.sprite.position.set(c.x, 0, c.z);
    if (!c.active) { if (S.notebooks >= (def.spawn?.minNotebooks || 0)) { c.active = true; c.sprite.visible = true; } return; }
    c.cool = Math.max(0, c.cool - dt); c.stall = Math.max(0, c.stall - dt); if (c.stall > 0) return;
    const sight = (def.senses?.sight ?? 80) * D, hear = (def.senses?.hearing ?? 60) * D, d = near(c, P);
    const heard = run.noise.find((e) => Math.hypot(e.x - c.x, e.z - c.z) < Math.min(e.radius, hear));
    const sees = d < sight && w.los(c.x, c.z, P.x, P.z);
    if (sees || (heard && S.mode === 'play')) w.followPath(c, sees ? P.x : heard.x, sees ? P.z : heard.z, (def.speed || 12) * V, dt, false);
    if (d < 3.4 && c.cool <= 0 && S.mode === 'play') {
      c.cool = def.mercyCooldown || 15; run.hits++;
      const e = def.onPlayerContact; if (e === 'catch') G.caught('custom'); else if (e === 'stun') run.freezeT = 2; else if (e === 'drainStamina') S.stamina = 0;
      else if (e === 'stealItem') { const i = S.items.findIndex((x) => x); if (i >= 0) { S.items[i] = null; G.renderSlots(); } } else if (e === 'teleport') { const h = w.randHall(); P.x = h.x; P.z = h.z; }
    }
  });
}

// ------------------------------------------------------------------ items
const aimDoor = (range = 14) => {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); let best = null, bd = 1e9;
  for (const d of world().doors) { if (d.exit) continue; const dx = cellCenter(d.cx) - P.x, dz = cellCenter(d.cz) - P.z, dist = Math.hypot(dx, dz); if (dist < range && (dx * fx + dz * fz) / (dist || 1) > 0.5 && dist < bd) { bd = dist; best = d; } }
  return best;
};
lb.useItem = (it) => {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), E = ent, cf = LB.items;
  switch (it) {
    case 'zesty': S.staMax = Math.round(100 * (1 + cf.zest.maxBonus)); S.stamina = S.staMax; run.zestT = cf.zest.seconds; Snd.sfx.eat(); G.say('Zest Bar! Full stamina and a bigger bar for 20 s.', 2200); return true;
    case 'lock': { const d = aimDoor(); if (!d || d.gate) { G.say('Aim at a door to brace it.', 1600); return false; } d.lockT = cf.lock.seconds; d.want = false; noiseAt(cellCenter(d.cx), cellCenter(d.cz), 'brace'); Snd.sfx.key(); G.say('Door braced for 30 s. The Teacher will break it.', 2200); return true; }
    case 'keys': { const d = aimDoor(); if (!d || !d.locked) { G.say('Aim at a locked door.', 1600); return false; } d.locked = false; Snd.sfx.key(); if (E.principal.active && world().los(E.principal.x, E.principal.z, P.x, P.z)) violation('keys'); G.say('Door unlocked for good.', 1600); return true; }
    case 'bsoda': {
      Snd.sfx.bsoda(); noiseAt(P.x, P.z, 'fizz'); const range = cf.fizz.range * D, half = (cf.fizz.coneDeg / 2) * Math.PI / 180, push = cf.fizz.push * D;
      for (let k = 0; k < 14; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x66aaff, transparent: true, opacity: 0.8 })); s.scale.set(1.5, 1.5, 1); s.position.set(P.x, 3.5, P.z); G.root.add(s); G.puffs.push({ sprite: s, vx: fx * 40 + rnd(-8, 8), vz: fz * 40 + rnd(-8, 8), life: 0.6 }); }
      const inCone = (e) => { const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz); if (d > range || d < 0.1) return false; return Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) <= half && world().los(P.x, P.z, e.x, e.z); };
      const T = E.T; if (!run.practice && T.state !== 'friendly' && inCone(T)) { teacherPush(T, fx, fz, cf.fizz.teacherPush * D); T.stall = cf.fizz.teacherStall + 0.4; }
      const pr = E.principal; if (pr.active && inCone(pr)) { teacherPush(pr, fx, fz, push); pr.stall = 1; }
      E.bullies.forEach((b) => { if (b.active && b.sprite.visible && inCone(b)) { teacherPush(b, fx, fz, push); bullyLeave(b); } });
      if (E.sweeper.active && E.sweeper.state === 'windup' && inCone(E.sweeper)) { E.sweeper.state = 'closet'; E.sweeper.t = LB.characters.sweeper.wakeCheck; E.sweeper.sprite.visible = false; G.say('Sweep cancelled!', 1500); }
      if (E.rope.active && E.rope.state !== 'play' && inCone(E.rope)) { teacherPush(E.rope, fx, fz, push); E.rope.stall = 1.5; }
      if (E.hug.active && inCone(E.hug)) { teacherPush(E.hug, fx, fz, push); E.hug.stall = cf.fizz.hugStun; E.hug.state = 'recover'; E.hug.t = 4; }
      if (E.crafter.active && inCone(E.crafter)) E.crafter.stall = cf.fizz.crafterStun;
      return true;
    }
    case 'quarter': {
      const b = E.bullies.find((x) => x.active && x.state === 'demand' && near(x, P) < 18);
      if (b) { bullyLeave(b); Snd.sfx.coin(); G.say('<b>Bully</b> takes the bribe and leaves.', 2000); return true; }
      G.say('Use the quarter on a vending machine, or bribe the Bully.', 2000); return false;
    }
    case 'alarm': { G.alarm = { x: P.x + fx * 3, z: P.z + fz * 3, t: cf.alarm.delay, ring: 0, dur: 8 }; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex('alarm'), transparent: true })); s.scale.set(2.5, 2.5, 1); s.position.set(G.alarm.x, 1.5, G.alarm.z); G.root.add(s); G.alarm.sprite = s; G.say('Alarm set. It rings in 20 seconds.', 2000); return true; }
    case 'tape': {
      const deck = run.decks.find((d) => Math.hypot(d.x - P.x, d.z - P.z) < 12); if (!deck) { G.say('Insert the tape in a <b>Tape Deck</b> (Cafeteria, Faculty Lounge).', 2400); return false; }
      run.staticT = cf.tape.seconds; Snd.sfx.staticLoopStart(); G.say('Static plays for 12 seconds…', 2000);
      const T = E.T; if (!run.practice && T.state !== 'friendly' && near(T, deck) < cf.tape.teacherRange * D * 2.5) { T.state = 'disoriented'; T.disT = cf.tape.seconds; T.goal = null; } return true;
    }
    case 'scissors': if (lb.cutRope()) return true; G.say('Safety Scissors cut the Rope kid\'s rope.', 2000); return false;
    case 'nosquee': { const d = aimDoor(); if (!d) { G.say('Aim at a door to oil its hinges.', 1600); return false; } d.silent = true; d.silentT = cf.oil.seconds; Snd.sfx.eat(); G.say('That door is silent for 60 s.', 1800); return true; }
  }
  return false;
};
lb.cutRope = () => { if (!pt.active) return false; Snd.sfx.snip(); endRope('win'); return true; };

lb.interact = (consider) => {
  if (!run) return;
  const w = world();
  w.vending.forEach((v, i) => { const m = run.vend[i]; if (!m) return;
    consider(m.stock <= 0 ? 'Vending machine (empty)' : S.items.includes('quarter') ? `Insert quarter (${i ? 'Fizz Can' : 'Zest Bar'})` : 'Vending machine (needs a quarter)', () => {
      const qi = S.items.indexOf('quarter'); if (m.stock <= 0 || m.cd > 0) { Snd.sfx.locked(); return; } if (qi < 0) { Snd.sfx.locked(); G.say('Insert a <b>quarter</b>.', 1500); return; }
      S.items[qi] = null; m.stock--; m.cd = LB.items.vending.cooldown; Snd.sfx.coin(); noiseAt(v.x, v.z, 'vend'); G.renderSlots();
      const it = i ? 'bsoda' : 'zesty'; setTimeout(() => { Snd.sfx.vend(); if (!G.giveItem(it)) G.addPickup(it, v.x, v.z); }, 400);
    }, v.x, v.z, 10, { los: false }); });
  run.decks.forEach((d) => consider(S.items.includes('tape') ? 'Tape Deck: insert Static Tape' : 'Tape Deck', () => { const i = S.items.indexOf('tape'); if (i < 0) { G.say('You need a <b>Static Tape</b>.', 1500); return; } S.sel = i; G.renderSlots(); G.useItem(); }, d.x, d.z, 9, { los: false }));
};

// ------------------------------------------------------------------ notebooks (Lesson-B has no math questions)
lb.onNotebook = () => {
  const T = ent.T; run.capTimer = 0;
  if (S.notebooks === 1 && !run.practice) {   // the first notebook turns the Teacher: his first anger, then he starts hunting
    T.hostile = true; T.A = L.angerWrong(T.A, run.preset.angerPerWrong * LB.teacher.angerPerWrong, LB.teacher);
    Snd.sfx.glitchy(); G.say('<b>Teacher</b>: "Class is in session."', 3000, 'Class is in session.');
  } if (S.notebooks === LB.items.vending.restockAt && !run.restocked) { run.restocked = true; run.vend.forEach((v) => { v.stock = LB.items.vending.stock; }); } };
lb.onEscape = () => {
  const w = world(), T = ent.T; run.escaped = true; run.escapeT = LB.teacher.escape.alarmSeconds; run.hyper = true;
  T.A = L.angerWrong(T.A, LB.teacher.escape.angerBonus, LB.teacher); if (!run.practice) { T.hostile = true; if (T.state === 'friendly') T.state = 'hunting'; }
  S.exitsOpen = true; w.exitsOpen = true; S.phase = 'escape';
  // "the Exit": the door nearest the start; the other three stay shut
  const st0 = world().map.start, start = { x: cellCenter(st0.x), z: cellCenter(st0.z) }; let best = 0, bd = 1e9;
  w.exitPos.forEach((e, i) => { const d = Math.hypot(e.x - start.x, e.z - start.z); if (d < bd) { bd = d; best = i; } });
  w.exitDoors.forEach((d, i) => { if (i === best) { d.mesh.visible = false; d.shut = false; } else { d.shut = true; d.mesh.visible = true; } });
  run.exitIndex = best; lb.noise(P.x, P.z, 'escape'); run.noise[run.noise.length - 1].x = P.x;
  Snd.sfx.siren(); G.flash('#f55', 0.4); G.say('All notebooks! <b>Run to the lit EXIT!</b>', 5000, 'All seven. Run.');
};

// ------------------------------------------------------------------ per-frame
function mood(dt) {
  const U = G.R.uniforms, N = S.notebooks, reduce = Save.settings.reduceFlashing;
  const lv = [[1, [1.1, 1, 0.88], 0.5, 0], [0.9, [1, 1, 1], 0, 0.02], [0.9, [1, 1, 1], 0, 0.02], [0.8, [0.9, 0.97, 1.1], 0.4, 0.04], [0.8, [0.9, 0.97, 1.1], 0.4, 0.04], [0.7, [1.15, 0.9, 0.9], 0.3, 0.07], [0.7, [1.15, 0.9, 0.9], 0.3, 0.07]][Math.min(N, 6)];
  const tgt = run.escaped ? { sat: 0.6, tint: [1.35, 0.55, 0.55], amt: reduce ? 0.2 : 0.2 + 0.12 * Math.sin(S.time * 4), flick: 0.1 } : { sat: lv[0], tint: lv[1], amt: lv[2], flick: lv[3] };
  // ease towards the target so changing notebook count never causes a sudden visual jump
  const m = (run.mood = run.mood || { sat: 1, tint: [1.1, 1, 0.88], amt: 0.5, flick: 0 }), k = Math.min(1, dt * 0.8);
  m.sat += (tgt.sat - m.sat) * k; m.amt += (tgt.amt - m.amt) * k; m.flick += (tgt.flick - m.flick) * k; m.tint = m.tint.map((v, i) => v + (tgt.tint[i] - v) * k);
  U.sat.value = m.sat; U.tint.value.set(...m.tint); U.tintAmt.value = m.amt;
  // flicker is an occasional brief dip (never per-frame strobing); more frequent as the lights fail
  run.flickT = (run.flickT ?? 3) - dt; if (run.flickT <= 0) { run.flickDip = 0.1; run.flickT = m.flick > 0.005 ? rnd(0.4, 1.2) / (m.flick * 12 + 0.2) : 99; }
  run.flickDip = Math.max(0, (run.flickDip || 0) - dt); U.bright.value = reduce ? 1 : (run.flickDip > 0 ? 0.88 : 1);
  const d = near(ent.T, P), danger = !run.practice && ent.T.state !== 'friendly' ? clamp(1 - d / (60 * D), 0, 1) : 0; U.vignette.value = 0.15 + danger * 0.7;
  run.musicI = (run.musicI ?? 0); run.musicI += (clamp(N / 8 + danger * 0.5 + (run.escaped ? 0.3 : 0), 0, 1) - run.musicI) * Math.min(1, dt * 0.5); Snd.music.setIntensity(run.musicI);
}
lb.update = (dt) => {
  if (!run || !LB) return; initEntities();
  if (S.mode === 'play' || S.mode === 'playtime') run.clock += dt;
  run.mercyT = run.mercyT >= 1e8 ? run.mercyT : Math.max(0, run.mercyT - dt); if (run.mercyT >= 1e8 && S.mode !== 'playtime') run.mercyT = LB.characters.mercySeconds;
  run.freezeT = Math.max(0, run.freezeT - dt); run.stunT = Math.max(0, run.stunT - dt); S.frozenT = Math.max(run.freezeT, run.stunT);
  run.escapeT = Math.max(0, run.escapeT - dt);
  if (run.zestT > 0) { run.zestT -= dt; if (run.zestT <= 0) { S.staMax = 100; S.stamina = Math.min(S.stamina, 100); } }
  if (run.staticT > 0) { run.staticT -= dt; if (run.staticT <= 0) Snd.sfx.staticLoopStop(); }
  for (let i = run.noise.length - 1; i >= 0; i--) { run.noise[i].t += dt; if (run.noise[i].t > run.noise[i].duration) run.noise.splice(i, 1); }
  run.vend.forEach((m) => { m.cd = Math.max(0, m.cd - dt); });
  world().doors.forEach((d) => { if (d.silentT > 0) { d.silentT -= dt; if (d.silentT <= 0) d.silent = false; } });
  if (P.running && P.moving && ent.T.sees) run.quietRunT += dt;
  updateTeacher(dt);
  updateActivation(dt); updatePrincipal(dt); updateBullies(dt); updateSweeper(dt); updateRope(dt); updateHug(dt); updateCrafter(dt); updateCustoms(dt);
  const t = run.clock, mm = Math.floor(t / 60), ss = Math.floor(t % 60); $('clock').textContent = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  $('eventBanner').style.display = 'none';
  if (S.detention > 0) { $('eventBanner').textContent = `DETENTION ${Math.ceil(S.detention)}s`; $('eventBanner').style.display = 'block'; }
  mood(dt);
};
// the player's input is frozen by Hug / Rope invite / sweeper stun
lb.frozen = () => S.frozenT > 0;
lb.doorUsers = () => (run && ent ? [ent.T, ent.principal.active && ent.principal, ent.rope.active && ent.rope, ent.hug.active && ent.hug, ...ent.bullies.filter((b) => b.active && b.x)].filter(Boolean) : []);

// ------------------------------------------------------------------ results
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 100)).padStart(2, '0')}`;
function stats() {
  const acc = 1, score = L.rankScore({ time: run.clock, wrong: 0, detentions: run.detentions, itemsUsed: run.itemsUsed, hits: run.hits, flawless: 0 });
  return { acc, score, rank: L.rankLetter(score), code: L.encodeShare({ mode: S.run === 'practice' ? 'practice' : 'story', diff: run.diff, seed: run.seed, time: run.clock, accuracy: acc }) };
}
lb.itemUsed = () => { if (run) run.itemsUsed++; };
lb.overText = () => run ? `Notebooks ${S.notebooks}/${run.nbTarget} · Time survived ${mmss(run.clock)}\nSeed ${run.seed} (${run.preset.label})` : '';
lb.win = () => {
  if (!run || run.over) return; run.over = true;
  const st = stats(), sc = Save.data.scores; sc.lessonb = sc.lessonb || { best: {}, wins: 0, seeds: [] };
  const close = near(ent.T, P) < 10 * D && !run.practice;
  let extra = '';
  if (!run.practice) {
    const best = sc.lessonb.best[run.diff]; if (best == null || run.clock < best) { sc.lessonb.best[run.diff] = Math.round(run.clock * 100) / 100; extra = '\nNew best time!'; }
    sc.lessonb.wins++; sc.lessonb.seeds = [run.seed, ...sc.lessonb.seeds.filter((s) => s !== run.seed)].slice(0, 20);
    unlockAchievement('lb_win'); if (run.itemsUsed === 0) unlockAchievement('lb_ghost'); if (run.quietRunT === 0) unlockAchievement('lb_quiet'); if (close) unlockAchievement('lb_close');
    Save.save();
  }
  const text = `Time ${mmss(run.clock)}\nItems used ${run.itemsUsed} · Detentions ${run.detentions} · Character hits ${run.hits}\nRank ${st.rank} (${Math.round(st.score)} pts) · Seed ${run.seed} · ${run.preset.label}\nShare code ${st.code}${extra}`;
  G.winLB(text);
};
lb.run = () => run;
lb.target = () => (run ? run.nbTarget : 7);
lb.stats = () => (run ? { ...stats(), clock: run.clock } : null);
lb.cleanup = () => { if (!run) return; Snd.sfx.staticLoopStop(); if (ent) { ent.T.model.visible = false; [ent.principal, ent.sweeper, ent.rope, ent.hug, ent.crafter, ...ent.bullies, ...ent.customs].forEach((c) => { c.sprite.visible = false; c.active = false; }); } run.decks?.forEach((d) => d.mesh.parent?.remove(d.mesh)); const U = G.R.uniforms; U.sat.value = 1; };
lb.ent = () => ent;   // for tests
