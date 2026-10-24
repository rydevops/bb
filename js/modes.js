// Style-specific rules: Demo (Math Machines + random events), Party (presents, candles), Endless, Free Run,
// secret scenes, and Null / Glitch Style (silent hunter + boss fight).
import * as THREE from '../vendor/three.module.js';
import { G, S, P, input, $, rnd, ri, pick, clamp, TOTAL_NB, ITEMS, isTouch } from './state.js';
import { cfg } from './config.js';
import * as A from './art.js';
import * as AI from './ai.js';
import { CELL, cellCenter, toCell } from './world.js';
import { Save, unlockAchievement } from './save.js';
import * as Snd from './audio.js';

const ai = () => cfg.ai;
const say = (...a) => G.say(...a);
const NULL_LINES = {"start": ["U0VfCl1PWE8KREVeCllfWlpFWU9OCl5FCkxDRE4KXkJDWQpaRktJTwQ=", "QwpCT0tYCk9cT1hTCllFX0ROClNFXwpHS0FPBA==", "TkUKREVeClleRVoKR0VcQ0RNBA=="], "hunt": ["W19DT14ECkhPCltfQ09eBA==", "XkJPCllJQkVFRgpDWQpHQ0RPCkRFXQQ=", "U0VfCklLRERFXgpGT0tcTwQKXkJPCk5FRVhZCktYTwpGQ09ZBA==", "QU9PWgpNRUNETQQKXkJPWE8KS1hPCkVERlMKSwpMT10KRk9MXgQ=", "QwpJS0QKQk9LWApTRV8KSFhPS15CQ0RNBA=="], "allwrong": ["T1xPWFMKS0RZXU9YCl1YRURNBApCRV0KSFhLXE8E", "U0VfCklLR08KS0ZGCl5CTwpdS1MKTkVdRApCT1hPBA==", "REVdClNFXwpCS1xPCkdPXgpHTwQKWE9HT0dIT1gKXkJLXgQ="], "tele": ["XkJPCl5PRk9aRVheT1gKTkVPWQpERV4KTUUKXUJPWE8KU0VfCl5CQ0RBBA==", "QwpCS1xPCkhPT0QKXUtDXkNETQpFRApeQk8KRV5CT1gKWUNOTwQ="], "basement": ["XkJPCkhLWU9HT0ReCl1LWQpET1xPWApHT0tEXgpMRVgKXENZQ15FWFkE", "Qk8KQU9PWlkKR08KTkVdRApCT1hPBApdQ15CCl5CTwpZQlhDREEKR0tJQkNETwQ=", "Xk9GRgpERQpFRE8E"], "taunt": ["S0ZGCllPXE9EBApCRV0KXkJFX01CXkxfRgQ=", "REVdCl5CTwpGS1leCk5FRVgKXUNGRgpZXktTCllCX14E", "TUUKRUQECl5CWEVdCllFR09eQkNETQQKQ14KXUNGRgpERV4KR0teXk9YBA=="], "journal": ["XkJPCkBFX1hES0YKQ1kKSwpGQ08ECk9cT1hTCl1FWE4KRUwKQ14E", "QwpdS1kKQk9YTwpMQ1hZXgs=", "XkJDWQpDWQpERV4KXUJLXgpdS1kKXVhDXl5PRAs=", "BAQEQwpLRwpZXkNGRgpCT1hPBApDCktHClleQ0ZGBAQE"]};
const dec = (k) => NULL_LINES[k].map((b) => [...atob(b)].map((c) => String.fromCharCode(c.charCodeAt(0) ^ 42)).join(''));   // captions are stored obfuscated
const isNullish = () => S.style === 'null' || S.style === 'glitch';
let machines = [], balloons = [], decor = [], throwables = [], projectiles = [], barriers = [], teleporter = null, shrink = null;
let partyShuffleT = 0, evActive = null, bossT = 0, nullTalkT = 20, sceneTimer = null, sceneOnDone = null;

const nullc = G.nullc = { x: 0, z: 0, active: false, state: 'dormant', goal: null, goalT: 0, speedMul: 1, stun: 0, sprite: null, flick: 0, hits: 0 };

G.initModes = () => {
  const mk = (c, h) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(c), transparent: true })); s.scale.set(h * c.width / c.height, h, 1); s.center.set(0.5, 0); s.visible = false; G.scene.add(s); return s; };
  nullc.nullSprite = mk(A.drawNull(), 9); nullc.loonSprite = mk(A.drawLoon(), 9);
  nullc.sprite = nullc.nullSprite;
};
const clearList = (arr) => { arr.forEach((o) => (o.sprite || o.mesh)?.parent?.remove(o.sprite || o.mesh)); arr.length = 0; };

// ------------------------------------------------------------------ setup per style
G.setupMode = () => {
  clearList(balloons); clearList(decor); clearList(throwables); clearList(projectiles); clearList(barriers); G.removeDynamicSolids?.();
  machines.forEach((m) => m.mesh.parent?.remove(m.mesh)); machines = []; teleporter?.mesh.parent?.remove(teleporter.mesh); teleporter = null; shrink?.mesh.parent?.remove(shrink.mesh); shrink = null;
  S.carry = null; evActive = null; nullc.active = false; nullc.sprite.visible = false; nullc.nullSprite.visible = false; nullc.loonSprite.visible = false;
  Object.assign(nullc, { state: 'dormant', goal: null, goalT: 0, speedMul: 1, stun: 0, hits: 0 }); partyShuffleT = 40; bossT = 0; nullTalkT = 20;
  const w = G.world;
  if (S.style === 'party') {
    const cols = ['#e84a4a', '#4aa8e8', '#f2c230', '#6ccf5a', '#d86ae8'];
    for (let i = 0; i < 16; i++) { const h = w.randHall(); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(A.drawBalloon(pick(cols))), transparent: true })); s.scale.set(2.4, 3.6, 1); s.center.set(0.5, 0); s.position.set(h.x + rnd(-6, 6), 5 + rnd(0, 2), h.z + rnd(-6, 6)); G.root.add(s); decor.push({ sprite: s, ph: rnd(0, 6), y: s.position.y }); }
    const ri_ = w.roomInfo.find((r) => r.id === 'M3') || w.roomInfo[w.roomInfo.length - 1];
    const m = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.5, 16), new THREE.MeshBasicMaterial({ color: 0x4ae8ff })); m.position.set(ri_.center.x, 0.3, ri_.center.z); G.root.add(m);
    teleporter = { mesh: m, x: ri_.center.x, z: ri_.center.z };
  }
  if (S.style === 'demo') { setupMachines(); }
  if (S.style === 'demo') {   // Shrink Machine in JD's room (basement scene)
    const rc = w.jdRoom, x = (rc.x0 + rc.x1 + 1) * CELL / 2 + 14, z = (rc.z0 + 1.5) * CELL;
    const m = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 4), new THREE.MeshBasicMaterial({ color: 0xc86aa8 })); m.position.set(x, 3.5, z); G.root.add(m); shrink = { mesh: m, x, z };
    w.solids.push({ x0: x - 2.5, x1: x + 2.5, z0: z - 2, z1: z + 2, dyn: true });
  }
  if (isNullish()) {
    nullc.sprite = S.style === 'glitch' ? nullc.loonSprite : nullc.nullSprite;
    G.world.ground.material.color.set(0x303030);
  }
};

// ------------------------------------------------------------------ Demo: Math Machines + balloons
function setupMachines() {
  const w = G.world; G.clearNotebooks();
  const rooms = w.roomInfo.filter((r) => r.r !== w.jdRoom).sort(() => Math.random() - 0.5).slice(0, TOTAL_NB);
  rooms.forEach((ri_) => {
    const x = ri_.cx + 12, z = ri_.farZ + ri_.sgn * 3;
    const cvs = A.cv(256, 192), tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace;
    const mats = [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshBasicMaterial({ color: 0x3a5a7a })); mats[ri_.sgn === 1 ? 4 : 5] = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 6.5, 3), mats); mesh.position.set(x, 3.25, z); G.root.add(mesh);
    w.solids.push({ x0: x - 3, x1: x + 3, z0: z - 1.5, z1: z + 1.5, dyn: true });
    machines.push({ mesh, cvs, tex, x, z, room: ri_, done: false, step: 0, q: null, balloons: [] });
  });
  refreshMachines();
}
function drawMachine(m, text) { const g = m.cvs.getContext('2d'); g.drawImage(A.drawMachine(text), 0, 0); m.tex.needsUpdate = true; }
function refreshMachines() {
  const hard = S.fun.hard, steps = hard ? 3 : 1;
  machines.forEach((m) => {
    if (m.done) return;
    clearList(m.balloons); balloons = balloons.filter((b) => b.machine !== m);
    const impossible = S.notebooks === 1 && m.step === 0;
    const qs = G.genProblems(S.notebooks + 1, false), q = qs[0];
    m.q = impossible ? { q: 'ERR ▒ + ¿ =', a: null, impossible: true } : q;
    drawMachine(m, impossible ? 'ERR? ▒ + ¿' : (steps > 1 ? `${m.step + 1}/${steps}  ` : '') + q.q.replace(' =', ''));
    const vals = new Set(); if (!impossible) vals.add(q.a); while (vals.size < 3) vals.add(Math.max(0, (q.a ?? 7) + ri(-5, 5)));
    const arr = [...vals].sort(() => Math.random() - 0.5);
    arr.forEach((v, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(A.drawBalloon(['#e84a4a', '#4aa8e8', '#f2c230'][i], v)), transparent: true })); s.scale.set(3, 4.5, 1); s.center.set(0.5, 0);
      const bx = m.room.cx - 14 + i * 12, bz = m.room.farZ + m.room.sgn * (CELL * 2.6); s.position.set(bx, 4, bz); G.root.add(s);
      const b = { value: v, x: bx, z: bz, sprite: s, machine: m, ph: rnd(0, 6), held: false }; balloons.push(b); m.balloons.push(b);
    });
  });
}
function feedMachine(m) {
  if (!S.carry || S.carry.type !== 'balloon') { Snd.sfx.locked(); say('Bring this machine the <b>balloon</b> with the right answer.', 2200); return; }
  const ok = !m.q.impossible && S.carry.value === m.q.a, steps = S.fun.hard ? 3 : 1;
  S.carry = null;
  if (ok) { S.correct++; Snd.sfx.correct(); S.calmT = ai().calmAfterMathMachineSec; say('Correct! JD calms down for a moment.', 2000); m.step++; }
  else {
    S.wrong++; Snd.sfx.wrong(); say(m.q.impossible ? 'ERROR! JD is <b>furious</b>!' : 'Wrong!', 2200, m.q.impossible ? 'I get angrier for every problem you get wrong!' : undefined);
    G.actors.onWrong(m.q.impossible ? 2 : 1, m.q.impossible, { nb: { x: m.x, z: m.z }, wrong: 0 });
    if (S.fun.hard) { G.actors.jd.anger += AI.angerForProblem(2, ai()); m.step = steps; }   // Hard Mode: a wrong answer skips the rest and raises anger sharply
    else m.step = steps;
  }
  if (m.step >= steps) {   // the notebook pops out even if wrong
    m.done = true; clearList(m.balloons); balloons = balloons.filter((b) => b.machine !== m); drawMachine(m, 'DONE!'); Snd.sfx.poof();
    G.collectNotebook(null, { nbNo: S.notebooks + 1, wrong: ok ? 0 : 1 }); refreshMachines();
  } else refreshMachines();
}
function takeBalloon(b) { if (S.carry?.type === 'balloon') { const old = balloons.find((x) => x.held); if (old) { old.held = false; old.sprite.visible = true; } } b.held = true; b.sprite.visible = false; S.carry = { type: 'balloon', value: b.value, label: `balloon: ${b.value}` }; Snd.sfx.pickup(); }

// ------------------------------------------------------------------ Demo random events
const EVENTS = { gravity: 'Gravity Chaos!', fog: 'Fog rolls in…', flood: 'Flood!', ruler: "JD's ruler is broken!" };
function startEvent(name) {
  S.event = name; S.eventT = rnd(22, 32); G.banner('⚠ ' + EVENTS[name]); Snd.sfx.siren();
  if (name === 'flood') { G.world.water.visible = true; Snd.sfx.splash(); }
}
function endEvent() { S.event = null; G.banner(''); G.world.water.visible = false; G.applyLook(); S.nextEventT = rnd(50, 90); }

// ------------------------------------------------------------------ Party
G.partyFinale = () => {
  if (S.mode === 'scene') return;
  S.mode = 'scene'; document.exitPointerLock?.(); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); Snd.music.stop(); Snd.ambienceStop();
  const secret = S.correct === 0;
  G.sceneCue = secret ? 'secretSong' : 'candle'; Snd.music.play(G.sceneCue);
  const el = $('candle'), cv = $('candleCv'); el.classList.remove('hidden'); let lit = 5;
  const draw = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 220); g.drawImage(A.drawCake(lit), 0, 0); };
  draw(); $('candleMsg').textContent = secret ? '♪ JD sings: "Happy birthday, you got everything wrong!" ♪' : 'JD: "Make a wish and blow out the candles!"';
  if (secret) { say('♪ <b>JD</b> sings you a secret song ♪', 6000, 'Happy birthday to you! You got every answer wrong!', { pitch: 0.9 }); Save.progress.secrets.partySong = true; }
  $('blowBtn').onclick = () => {
    Snd.sfx.blow(); G.haptic(20); lit--; draw();
    if (lit <= 0) {
      $('blowBtn').onclick = null; $('candleMsg').textContent = 'Happy birthday!'; G.sceneCue = null;
      setTimeout(() => { el.classList.add('hidden'); glitchedSchool(); }, 1200);
    }
  };
};
function glitchedSchool() {
  Save.progress.secrets.glitchedSchool = true; unlockAchievement('secret_party');
  const U = G.R.uniforms; S.mode = 'scene'; let t = 0;
  const reduce = Save.settings.reduceFlashing;
  U.glitch.value = reduce ? 0 : 1; U.hue.value = 2.4; U.invert.value = 0;
  say('The school… <b>glitched</b>. Thank you for playing, and happy birthday!', 5500, undefined, { force: true });
  $('hud').classList.remove('hidden'); Snd.sfx.glitchy();
  const iv = setInterval(() => { t += 0.1; U.hue.value = 2.4 + Math.sin(t * 3) * 0.8; if (t > 6) { clearInterval(iv); U.glitch.value = 0; U.hue.value = 0; G.applyLook(); $('hud').classList.add('hidden'); G.win(); } }, 100);
}
G.secretAllWrong = () => {   // every answer wrong across the first three notebooks
  if (S.mode === 'scene') return; unlockAchievement('secret_allwrong'); Save.progress.secrets.allWrong = true;
  if (S.style === 'party') { G.partyFinale(); return; }
  const nd = Save.progress.nullDefeated;
  playScene(nd ? [{ who: 'JD', t: "Wow, every answer wrong! You're brave. Come back any time!", v: 'jd' }] : dec('allwrong').map((t) => ({ who: 'Null', t, v: 'null' })), { img: nd ? null : A.drawNull(), end: 'menu', onDone: () => metNull('classic') });
};
function metNull(which) {
  if (Save.progress.nullDefeated) return;
  Save.progress.met[which] = true; Save.save();
  const m = Save.progress.met; if (m.classic && m.party && m.demo) unlockAchievement('met_null');
}

// ------------------------------------------------------------------ cutscene overlay
export function playScene(lines, o = {}) {
  S.mode = 'scene'; document.exitPointerLock?.(); Snd.music.stop(); Snd.ambienceStop();
  const el = $('scene'), txt = $('sceneText'), cv = $('sceneImg'); el.classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  cv.style.display = o.img ? 'block' : 'none'; if (o.img) { const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 384); g.drawImage(o.img, 0, 0); }
  if (o.cue) { G.sceneCue = o.cue; Snd.music.play(o.cue); }
  let i = 0;
  const next = () => {
    clearTimeout(sceneTimer);
    if (i >= lines.length) { el.classList.add('hidden'); el.onclick = null; G.sceneCue = null; const d = o.onDone; if (d) d(); if (o.end === 'menu') G.exitToMenu(); return; }
    const l = lines[i++]; txt.textContent = (l.who ? l.who + ': ' : '') + l.t;
    if (l.v === 'null') { Snd.nullVoice(l.t); Snd.sfx.beep(0.5); } else if (l.v === 'jd') Snd.speak(l.t);
    sceneTimer = setTimeout(next, Math.max(2200, l.t.length * 75));
  };
  el.onclick = next; next();
}
G.playScene = playScene;
G.dec = dec;

// ------------------------------------------------------------------ interactions provided by modes
G.modeInteract = (consider) => {
  for (const b of balloons) if (!b.held) consider(`Take balloon ${b.value}`, () => takeBalloon(b), b.x, b.z, 12, { minDot: 0.5 });
  for (const m of machines) if (!m.done) consider(S.carry?.type === 'balloon' ? 'Feed balloon to the Math Machine' : 'Math Machine – needs a balloon', () => feedMachine(m), m.x, m.z, 14, { los: false });
  for (const t of throwables) consider(`Pick up ${t.kind}`, () => { if (S.carry) { Snd.sfx.locked(); return; } S.carry = { type: 'throw', kind: t.kind, label: t.kind, heavy: true }; G.root.remove(t.sprite); throwables.splice(throwables.indexOf(t), 1); Snd.sfx.pickup(); say(`Holding a ${t.kind}. Tap USE ITEM to throw it!`, 1600); }, t.x, t.z, 10, { minDot: 0.4 });
  if (teleporter) consider('Step on the Dangerous Teleporter', () => teleportScene(), teleporter.x, teleporter.z, 9, { los: false });
  if (shrink) consider("JD's Shrink Machine (basement hatch)", () => basementScene(), shrink.x, shrink.z, 10, { los: false });
  if (S.phase === 'journal' && G.journalSpot) consider('Read the journal', () => readJournal(), G.journalSpot.x, G.journalSpot.z, 12, { los: false });
};
function teleportScene() {
  const nd = Save.progress.nullDefeated;
  playScene(nd ? [{ who: 'JD', t: 'Whoops! This teleporter is for parties only. Back to the menu!', v: 'jd' }] : dec('tele').map((t) => ({ who: 'Null', t, v: 'null' })), { img: nd ? null : A.drawNull(), end: 'menu', onDone: () => metNull('party') });
}
function basementScene() {
  const nd = Save.progress.nullDefeated;
  playScene(nd ? [{ who: 'JD', t: 'Down the hatch is just my shrink machine. Nothing to see!', v: 'jd' }] : dec('basement').map((t) => ({ who: 'Null', t, v: 'null' })), { img: nd ? null : A.drawNull(), end: 'menu', onDone: () => metNull('demo') });
}
// throwing: USE ITEM while carrying a throwable (boss fight) – wired through useItem in main
G.throwCarry = () => {
  if (!S.carry || S.carry.type !== 'throw') return false;
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(A.drawThrowable(S.carry.kind)), transparent: true })); s.scale.set(3, 3, 1); s.position.set(P.x, 4, P.z); G.root.add(s);
  projectiles.push({ sprite: s, x: P.x, z: P.z, vx: fx * 55, vz: fz * 55, life: 1.6 }); S.carry = null; Snd.sfx.throwIt(); return true;
};

// ------------------------------------------------------------------ Endless
G.endlessCollected = () => {
  const w = G.world, used = new Set(G.notebooksList.filter((n) => !n.taken).map((n) => n.room));
  const free = w.roomInfo.filter((r) => r.r !== w.jdRoom && !used.has(r.r)).sort(() => Math.random() - 0.5);
  if (free[0]) G.spawnNotebookAt(free[0]);
  G.recordEndless?.();
};

// ------------------------------------------------------------------ Null / Glitch Style
G.nullNotebook = (n) => {
  S.notebooks++; G.updateNb(); const w = G.world;
  nullc.goal = { x: n.x, z: n.z }; nullc.goalT = 25;      // drawn to where the notebook was picked up – there is no sound
  if (S.notebooks >= ai().nullStartNotebooks && !nullc.active) {
    nullc.active = true; nullc.state = 'hunt'; nullc.sprite.visible = true;
    for (let i = 0; i < 30; i++) { const h = w.randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > 90) { nullc.x = h.x; nullc.z = h.z; break; } }
    if (S.style === 'null') say(dec('start')[0], 3200, dec('start')[0], { nullVoice: true, force: true });
  }
  if (S.notebooks >= TOTAL_NB) { G.world.exitsOpen = true; S.exitsOpen = true; G.nullAllNotebooks(); }
};
G.nullAllNotebooks = () => { S.exitsOpen = true; G.world.exitsOpen = true; G.world.exitDoors.forEach((d) => { d.mesh.visible = false; }); say('The exits are open. Quietly now…', 3000, undefined, { force: true }); };
G.nullExit = (i, d) => {
  if (S.phase === 'boss' || S.phase === 'journal') return;
  S.exitsReached++; d.shut = true; d.mesh.visible = true; d.mesh.material.color.set(0x555555);
  const e = G.world.exitPos[i]; P.x = e.inner.x; P.z = e.inner.z; P.vx = P.vz = 0;
  if (S.exitsReached === 3) { nullc.speedMul = 1.35; nullc.goal = { x: cellCenter(15), z: cellCenter(12) }; nullc.goalT = 30; if (S.style === 'null') say('…', 1500, undefined, { force: true }); }
  if (S.exitsReached >= 4 || G.world.exitDoors.every((dd) => dd.shut)) startBoss();
};
function startBoss() {
  S.phase = 'boss'; S.bossHits = 0; Snd.sfx.slam(); G.flash('#000', 0.8);
  nullc.state = 'boss'; nullc.speedMul = 1; nullc.stun = 2; nullc.hits = 0;
  const lines = dec('taunt'); lines.forEach((l, i) => setTimeout(() => { if (S.phase === 'boss') say(l, 3000, l, { nullVoice: S.style === 'null', force: true }); }, i * 3500));
  for (let i = 0; i < 6; i++) spawnThrowable();
  Snd.music.play('boss'); G.musicWant = 'boss'; bossT = 6;
}
const KINDS = ['chair', 'desk', 'tree', 'banana'];
function spawnThrowable() {
  if (throwables.length >= 7) return; const h = G.world.randHall(); const kind = pick(KINDS);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(A.drawThrowable(kind)), transparent: true })); s.scale.set(3.4, 3.4, 1); s.position.set(h.x, 2.2, h.z); G.root.add(s);
  throwables.push({ kind, x: h.x, z: h.z, sprite: s });
}
function spawnBarrier() {
  const w = G.world, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), bx = P.x + fx * 26, bz = P.z + fz * 26;
  const cx = toCell(bx), cz = toCell(bz); if (!w.isHall(cx, cz)) return;
  const horizontal = w.isHall(cx - 1, cz) && w.isHall(cx + 1, cz);   // hall runs along x
  const rect = horizontal ? { x0: cx * CELL + 2, x1: cx * CELL + 6, z0: (cz - 1) * CELL, z1: (cz + 2) * CELL } : { x0: (cx - 1) * CELL, x1: (cx + 2) * CELL, z0: cz * CELL + 2, z1: cz * CELL + 6 };
  const objs = ['chair', 'desk', 'tree', 'banana']; const tx = new THREE.CanvasTexture(A.drawThrowable(pick(objs))); tx.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.BoxGeometry(rect.x1 - rect.x0, 7, rect.z1 - rect.z0), mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tx }));
  mesh.position.set((rect.x0 + rect.x1) / 2, 3.5, (rect.z0 + rect.z1) / 2); G.root.add(mesh);
  const solid = { ...rect, dyn: true }; w.solids.push(solid); barriers.push({ mesh, solid, life: rnd(4, 6) });
}
function bossHit() {
  S.bossHits++; nullc.hits = S.bossHits; Snd.sfx.hit(); G.flash('#fff', 0.35); nullc.stun = 1.5; G.haptic(60);
  Snd.music.setTempo(1 + S.bossHits * 0.06);
  if (S.bossHits === 9 && !S.chaos) Snd.music.hold(true);
  say(`Hit ${S.bossHits}/${cfg.chars.boss.hitsToWin}!`, 1200, undefined, { force: true });
  if (S.bossHits >= cfg.chars.boss.hitsToWin) bossDefeated();
}
function bossDefeated() {
  S.phase = 'journal'; Snd.music.hold(false); Snd.music.stop(); G.musicWant = null; clearList(throwables); clearList(projectiles); barriers.forEach((b) => b.mesh.parent?.remove(b.mesh)); barriers.length = 0; G.removeDynamicSolids?.();
  nullc.state = 'gone'; nullc.sprite.visible = false; nullc.active = false;
  const w = G.world, U = G.R.uniforms; G.scene.background.set(0x000000); U.bright.value = 0.55;
  // a black hallway: the player is walked to the office, where a journal sits on the desk
  const o = w.office; P.x = (o.x0 + o.x1 + 1) * CELL / 2; P.z = (o.z0 + 2) * CELL; P.yaw = 0;
  G.journalSpot = { x: P.x, z: (o.z1 + 1) * CELL - 8 };
  const js = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex('present'), transparent: true, color: 0xcccc88 })); js.scale.set(3, 3, 1); js.position.set(G.journalSpot.x, 3.4, G.journalSpot.z + 1.5); G.root.add(js); decor.push({ sprite: js, ph: 0, y: 3.4, static: true });
  if (S.style === 'glitch') say('A friendly figure waits in the office…', 4000, undefined, { force: true });
  else say('The halls are black. A <b>journal</b> lies on the desk in the office.', 5000, undefined, { force: true });
  // the HUD vanishes in this hallway so it feels like a real screen
  $('hud').classList.add('hud-off');
}
function readJournal() {
  S.phase = 'journal-read'; $('hud').classList.remove('hud-off');
  const glitch = S.style === 'glitch';
  const note = glitch ? ['You made it. The developer thanks you for playing.', 'The red JDloon was only ever a balloon.'] : ['"Day 1: the school feels empty. Day 2: JD says hello to nobody. Day 3: Nothing is wrong here. Nothing."'];
  const body = [...note.map((t) => ({ who: glitch ? 'Developer' : 'Journal', t })), ...(glitch ? [] : dec('journal').map((t, i) => ({ who: 'Null', t, v: 'null' })))];
  playScene(body, { img: glitch ? A.drawLoon() : A.drawNull(), onDone: () => finishNull() });
}
function finishNull() {
  const p = Save.progress; $('hud').classList.remove('hud-off');
  if (S.style === 'null') { p.nullDefeated = true; unlockAchievement('beat_null'); p.debugUnlocked = false; }
  else { p.glitchBeaten = true; unlockAchievement('beat_glitch'); p.debugUnlocked = true; }
  Save.save(); G.applyLook(); S.phase = 'main';
  G.win(S.style === 'null' ? '\nNull is gone… Null Style has been replaced by Glitch Style.' : '\nA secret debug code has been revealed…', S.style === 'null' ? 'NULL IS GONE' : 'GLITCH CLEARED');
}
G.nullCatch = () => {
  S.mode = 'scare'; Snd.sfx.nullCatch(); const U = G.R.uniforms, reduce = Save.settings.reduceFlashing; let t = 0;
  G.scene.background.set(0x000000); G.world.ceil.visible = false; $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const iv = setInterval(() => {
    t += 0.05; const k = Math.min(1, t / 3.2);
    G.world.wallMesh.rotation.y = Math.sin(t * 9) * 0.12 * k; G.world.wallMesh.rotation.z = Math.sin(t * 7) * 0.05 * k;   // parts of the school rotate and shake
    if (!reduce) { U.hue.value = t * 2.5; U.glitch.value = k; U.invert.value = k > 0.7 && Math.sin(t * 40) > 0.6 ? 1 : 0; } else U.bright.value = Math.max(0.2, 1 - k);
    G.camera.rotation.z = Math.sin(t * 25) * 0.06 * k;
    if (t > 3.6) { clearInterval(iv); G.world.wallMesh.rotation.set(0, 0, 0); G.camera.rotation.z = 0; U.glitch.value = 0; U.hue.value = 0; U.invert.value = 0; G.applyLook(); S.phase = 'main'; G.showOver(S.style === 'glitch' ? 'The red JDloon got you!' : 'Null got you…', 'Collected ' + S.notebooks + ' of ' + TOTAL_NB + ' notebooks.', { lost: true }); }
  }, 50);
};

// ------------------------------------------------------------------ per-frame
G.updateModes = (dt) => {
  const w = G.world, t = S.time;
  decor.forEach((d) => { if (!d.static) d.sprite.position.y = d.y + Math.sin(t * 1.5 + d.ph) * 0.6; });
  balloons.forEach((b) => { if (!b.held) b.sprite.position.y = 4 + Math.sin(t * 2 + b.ph) * 0.5 + (S.event === 'gravity' ? 2 : 0); });
  if (teleporter) teleporter.mesh.rotation.y += dt;
  // Party: presents shuffle around
  if (S.style === 'party' && S.mode === 'play') { partyShuffleT -= dt; if (partyShuffleT <= 0) { partyShuffleT = 40; G.pickups.forEach((p) => { const h = w.randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > 30) { p.x = h.x + rnd(-3, 3); p.z = h.z + rnd(-3, 3); p.sprite.position.set(p.x, 2.2, p.z); } }); } }
  // Demo events
  if (S.style === 'demo' && S.mode === 'play') {
    if (!S.event) { S.nextEventT -= dt; if (S.nextEventT <= 0 && S.notebooks < TOTAL_NB) startEvent(pick(Object.keys(EVENTS))); }
    else { S.eventT -= dt; if (S.eventT <= 0) endEvent(); }
    const sc = G.scene, U = G.R.uniforms;
    if (S.event === 'fog') { sc.fog.color.set(0x8a8f95); sc.fog.near = 3; sc.fog.far = 34; }
    if (S.event === 'flood') { w.water.position.y = 0.9 + Math.sin(t * 2) * 0.08; if (P.moving && Math.random() < dt * 4) Snd.sfx.splash(); }
  }
  // boss: barriers, throwables, projectiles
  if (S.phase === 'boss') {
    bossT -= dt; if (bossT <= 0) { bossT = rnd(9, 14); spawnBarrier(); spawnThrowable(); }
  }
  for (let i = barriers.length - 1; i >= 0; i--) { const b = barriers[i]; b.life -= dt; if (b.life <= 0) { b.mesh.parent?.remove(b.mesh); const k = w.solids.indexOf(b.solid); if (k >= 0) w.solids.splice(k, 1); barriers.splice(i, 1); Snd.sfx.poof(); } }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt; p.x += p.vx * dt; p.z += p.vz * dt; p.sprite.position.set(p.x, 4 - (1.6 - p.life) * 1.2, p.z);
    let hit = false;
    if (nullc.active && nullc.state === 'boss' && Math.hypot(p.x - nullc.x, p.z - nullc.z) < 5) { hit = true; bossHit(); }
    else if (w.solidCell(toCell(p.x), toCell(p.z)) || p.life <= 0) hit = true;
    if (hit) { Snd.sfx.thud(); p.sprite.parent?.remove(p.sprite); projectiles.splice(i, 1); }
  }
  updateNull(dt);
  // null dims the lights as it nears (a steady dim instead of flicker when Reduce Flashing is on)
  if (isNullish() && nullc.active && S.phase !== 'journal') {
    const d = Math.hypot(P.x - nullc.x, P.z - nullc.z), k = clamp(1 - d / 75, 0, 1), U = G.R.uniforms;
    let b = 1 - 0.7 * k; if (!Save.settings.reduceFlashing && k > 0.15) b *= 0.8 + 0.2 * Math.sin(t * 50 * (0.3 + k));
    U.bright.value = b; G.scene.fog.color.set(0x000000); G.scene.fog.near = 20 - 14 * k; G.scene.fog.far = 200 - 120 * k;
  }
  // red alarm tint while escaping (not in Null Style, steady if Reduce Flashing)
  if (S.exitsOpen && !isNullish() && S.mode === 'play') G.R.uniforms.tintAmt.value = Save.settings.reduceFlashing ? 0.25 : 0.2 + 0.1 * Math.sin(t * 4);
};
function updateNull(dt) {
  if (!nullc.active) return;
  const w = G.world, c = nullc, s = c.sprite;
  c.stun = Math.max(0, c.stun - dt); c.goalT -= dt;
  const nb = clamp(S.notebooks, 1, 7), gap = AI.effectiveGap(AI.baseGap(nb, ai()), 0, ai());
  let speed = AI.nullSpeed(gap, ai()) * c.speedMul;
  if (c.state === 'boss') speed = (AI.nullSpeed(AI.baseGap(5, ai()), ai()) * 0.9) * (1 + cfg.chars.boss.speedPerHit * c.hits);   // constant pace, always knows where the player is
  if (c.stun > 0) speed *= 0.1;
  const dp = Math.hypot(P.x - c.x, P.z - c.z), sees = dp < 120 && w.los(c.x, c.z, P.x, P.z, 1);
  if (c.state === 'boss') w.followPath(c, P.x, P.z, speed, dt, true);
  else if (sees) { const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz) || 1; c.x += dx / d * speed * dt; c.z += dz / d * speed * dt; c.goal = { x: P.x, z: P.z }; c.goalT = 6; c.dirx = dx / d; }
  else if (c.goal && c.goalT > 0) { if (w.followPath(c, c.goal.x, c.goal.z, speed, dt, true) < 3) c.goal = null; }
  else { if (!c.wander || Math.hypot(c.wander.x - c.x, c.wander.z - c.z) < 3) c.wander = w.randHall(); w.followPath(c, c.wander.x, c.wander.z, speed * 0.7, dt, true); }
  w.resolve(c, 1.5);
  s.position.set(c.x, S.style === 'glitch' ? 1.5 + Math.sin(S.time * 2) : 0, c.z); s.visible = true;
  if (S.style === 'null' && S.phase === 'main') { nullTalkT -= dt; if (nullTalkT <= 0 && S.mode === 'play') { nullTalkT = rnd(25, 40); const l = pick(dec('hunt')); if (dp < 90) say(l, 2600, l, { nullVoice: true, force: true }); } }
  if (S.style === 'null') { c.beepT = (c.beepT || 4) - dt; if (c.beepT <= 0 && dp < 120) { c.beepT = 4; Snd.sfx.beep(clamp(1 - dp / 120, 0.2, 1)); } }
  if (!S.caught && S.mode === 'play' && dp < 3.8) G.caught('null');
}
G.dbg = () => ({ machines, balloons, throwables, projectiles, barriers, teleporter, shrink, decor });   // for tests
