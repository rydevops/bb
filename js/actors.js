// The school's cast: JD, Principal of the Thing, Playtime, It's a Bully, Gotta Sweep, 1st Prize, Arts and Crafters.
import * as THREE from '../vendor/three.module.js';
import { G, S, P, $, rnd, ri, pick, clamp, dist, ITEMS, TOTAL_NB } from './state.js';
import { cfg } from './config.js';
import * as A from './art.js';
import * as AI from './ai.js';
import { CELL, cellCenter, toCell } from './world.js';
import { unlockAchievement } from './save.js';
import * as Snd from './audio.js';

const ai = () => cfg.ai, ch = () => cfg.chars;
const hm = () => (S.fun.hard ? ch().hard.speedMul : 1);       // Hard Mode: character interactions run faster
const actors = G.actors = {};
let pendingNoise = null;

function mkSprite(canvas, h, hatY = 0.9) {
  const m = new THREE.SpriteMaterial({ map: A.spriteTex(canvas), transparent: true });
  const s = new THREE.Sprite(m); s.scale.set(h * canvas.width / canvas.height, h, 1); s.center.set(0.5, 0);
  const hat = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.spriteTex(A.drawPartyHatSprite()), transparent: true }));
  hat.center.set(0.5, 0); hat.scale.set(3.2 / s.scale.x, 3.6 / s.scale.y, 1); hat.position.set(0, hatY, 0.01); hat.visible = false; s.add(hat);
  s.userData.hat = hat; G.scene.add(s); return s;
}

// ------------------------------------------------------------------ init / reset
G.initActors = () => {
  const jd = actors.jd = { x: 0, z: 0, active: false, state: 'wander', target: null, hearT: 0, hearPri: -1, anger: 0, stun: 0, eat: 0, slap: new AI.Slapper(ai()), jit: 1, lastSeen: null, goal: null, breakT: 0, dirx: 0, dirz: 1, calm: 0, model: A.makeJD(), walk: 0 };
  jd.model.scale.setScalar(1.0); jd.model.visible = false; G.scene.add(jd.model);
  actors.principal = { x: 0, z: 0, state: 'patrol', goal: null, warn: 0, cool: 0, lost: 0, stun: 0, sprite: mkSprite(A.drawPrincipal(), 8.2) };
  const pr = actors.principal; pr.glow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); pr.glow.scale.set(14, 14, 1); pr.glow.center.set(0.5, 0); pr.glow.visible = false; G.scene.add(pr.glow);
  actors.bully = { x: 0, z: 0, state: 'absent', timer: 0, spot: null, solid: null, stun: 0, sprite: mkSprite(A.drawBully(), 6.5) };
  actors.playtime = { x: 0, z: 0, state: 'wander', timer: 8, goal: null, stun: 0, sprite: mkSprite(A.drawPlaytime(), 7) };
  actors.sweep = { x: 0, z: 0, active: false, timer: 9999, route: [], ri: 0, stun: 0, rideT: 0, sprite: mkSprite(A.drawSweep(), 9) };
  actors.prize = { x: 0, z: 0, active: false, state: 'patrol', goal: null, cool: 0, stun: 0, sprite: mkSprite(A.drawFirstPrize(), 7.5) };
  actors.arts = { x: 0, z: 0, state: 'gone', timer: 0, stare: 0, teleported: false, stun: 0, sprite: mkSprite(A.drawArts(), 6) };
  actors.list = ['principal', 'bully', 'playtime', 'sweep', 'prize', 'arts'].map((k) => actors[k]);
};
const clamp01 = (v) => clamp(v, 0, 1);
G.resetActors = () => {
  const w = G.world, jd = actors.jd, party = S.style === 'party', school = S.style !== 'null' && S.style !== 'glitch';
  pendingNoise = null;
  const rc = w.jdRoom, jc = { x: (rc.x0 + rc.x1 + 1) * CELL / 2, z: (rc.z0 + rc.z1 + 1) * CELL / 2 };
  Object.assign(jd, { x: jc.x, z: jc.z, active: false, state: 'wander', target: null, hearT: 0, hearPri: -1, anger: 0, stun: 0, eat: 0, jit: 1, lastSeen: null, goal: null, breakT: 0, calm: 0, slap: new AI.Slapper(ai()) });
  jd.model.visible = false; jd.model.userData.hat.visible = party && school;
  const far = (min) => { let h; for (let i = 0; i < 30; i++) { h = w.randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > min) break; } return h; };
  const pr = actors.principal; let h = far(60); Object.assign(pr, { x: h.x, z: h.z, state: 'patrol', goal: null, warn: 0, cool: 6, lost: 0, stun: 0 });
  const bl = actors.bully; removeBullySolid(); Object.assign(bl, { state: 'absent', timer: 1e9, stun: 0, spot: null });
  const pl = actors.playtime; h = far(90); Object.assign(pl, { x: h.x, z: h.z, state: 'wander', timer: 10, goal: null, stun: 0, cool: 0 });
  const sw = actors.sweep; Object.assign(sw, { active: false, timer: 1e9, rideT: 0, stun: 0 });
  const pz = actors.prize; Object.assign(pz, { active: false, state: 'patrol', goal: null, cool: 0, stun: 0 });
  const ar = actors.arts; Object.assign(ar, { state: 'gone', timer: 2, stare: 0, teleported: false, stun: 0 });
  for (const a of actors.list) { a.sprite.visible = false; a.sprite.userData.hat.visible = party; }
  pr.glow.visible = false;
  if (school) { pr.sprite.visible = true; pl.sprite.visible = true; if (S.run === 'free') { bl.timer = ch().bully.firstAppearSecAfterWrong; sw.timer = rnd(ch().sweep.wakeMinSec, ch().sweep.wakeMaxSec); } }
  actors.enabled = school;
  pz.active = false;
};
function removeBullySolid() { const b = actors.bully; if (b.solid) { const i = G.world.solids.indexOf(b.solid); if (i >= 0) G.world.solids.splice(i, 1); b.solid = null; } }
G.removeDynamicSolids = () => { const a = G.world.solids; for (let i = a.length - 1; i >= 0; i--) if (a[i].dyn) a.splice(i, 1); };   // in place: the collision code holds this same array

// ------------------------------------------------------------------ JD
function activateJD() {
  const jd = actors.jd; if (jd.active || !actors.enabled || S.run === 'free') return;
  const rc = G.world.jdRoom; jd.x = (rc.x0 + rc.x1 + 1) * CELL / 2; jd.z = (rc.z0 + rc.z1 + 1) * CELL / 2;
  jd.active = true; jd.state = 'wander'; jd.model.visible = true; jd.slap = new AI.Slapper(ai());
}
G.hearNoise = (n, radius) => {
  const jd = actors.jd; if (!jd.active || S.deafT > 0) return;
  if (radius !== Infinity && Math.hypot(jd.x - n.x, jd.z - n.z) > radius) return;
  if (jd.state === 'chase') return;
  if (jd.hearT <= 0 || n.pri >= jd.hearPri) { jd.target = { x: n.x, z: n.z }; jd.hearT = n.dur; jd.hearPri = n.pri; jd.state = 'follow'; }
};
actors.onWrong = (problemIdx, impossible, pad) => {
  const jd = actors.jd, idx = impossible ? 2 : clamp(problemIdx, 0, 2);
  if (S.style === 'demo' && impossible) activateJD();   // Demo: JD turns angry at the unsolvable second problem
  if (S.firstWrongT == null) { S.firstWrongT = S.time; scheduleTimers(); }
  const a = AI.angerForProblem(idx, ai());
  if (S.style !== 'demo' || jd.active) jd.anger += a * (S.fun.hard && S.style === 'demo' ? 2 : 1);
  if (S.style !== 'demo' || impossible) S.hostile = true;   // Demo: JD only turns angry at the unsolvable second problem
  const nb = pad?.nb || { x: P.x, z: P.z };
  const exact = pad && pad.wrong + 1 >= 3;
  const n = { x: nb.x + (exact ? 0 : rnd(-20, 20)), z: nb.z + (exact ? 0 : rnd(-20, 20)), pri: ai().noisePriority.wrong, dur: 8, kind: 'wrong' };
  if (jd.active) G.hearNoise(n, Infinity); else pendingNoise = n;
};
function scheduleTimers() {
  const bl = actors.bully, sw = actors.sweep;
  bl.timer = ch().bully.firstAppearSecAfterWrong; sw.timer = rnd(ch().sweep.wakeMinSec, ch().sweep.wakeMaxSec);
}
actors.onNotebook = () => {
  const jd = actors.jd, w = G.world;
  if (S.notebooks >= ai().gateOpensAtNotebook) {
    const g = w.doorAt(w.jdRoom.door[0], w.jdRoom.door[1]);
    if (g && g.gate) { g.gate = false; g.locked = false; if (jd.active) { Snd.sfx.slam(); say('JD\'s swinging doors burst open!', 2200); } }
  }
  if (S.run === 'endless' && S.firstWrongT == null) { S.firstWrongT = S.time; scheduleTimers(); S.hostile = true; }
  if (S.hostile && !jd.active) activateJD();
  if (pendingNoise && jd.active) { G.hearNoise(pendingNoise, Infinity); pendingNoise = null; }
  if (S.run === 'endless') jd.calm = Math.min(ai().endless.maxCalm, jd.calm + ai().endless.calmPerNotebook);
  if (!actors.prize.active && S.notebooks >= ch().firstPrize.wakesAtNotebook && actors.enabled) wakePrize();
  if (S.notebooks === 3 && actors.arts.state === 'gone') actors.arts.timer = 1;
};
const say = (...a) => G.say(...a);
actors.onEscape = () => {
  const jd = actors.jd, w = G.world;
  const arts = actors.arts; arts.state = 'stand'; arts.stare = 0; arts.sprite.visible = true; placeFar(arts, 40);
  if (jd.active) { for (let i = 0; i < 20; i++) { const h = w.randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > 90) { jd.x = h.x; jd.z = h.z; break; } } }
  else if (S.run !== 'free') { activateJD(); }
};
actors.feedJD = () => { actors.jd.eat = 8; actors.jd.state = 'wander'; };
actors.pushables = () => {
  const out = [], jd = actors.jd, a = actors;
  if (jd.active) out.push(jd);
  for (const c of [a.principal, a.playtime, a.prize, a.arts, a.sweep]) if (c.sprite.visible) out.push(c);
  if (a.bully.state === 'block') out.push(a.bully);
  return out;
};
actors.onBsoda = (c, fx, fz) => {
  if (c === actors.sweep) { c.stun = 2; return; }
  c.x += fx * 10; c.z += fz * 10; G.world.resolve(c, 1.5); c.stun = 4;
  if (c === actors.bully) { bullyLeave(40); say('<b>It\'s a Bully</b> got soaked and ran off!', 1800); }
  else if (c === actors.jd) say('<b>JD</b> is stunned!', 1500);
  else if (c === actors.playtime && S.mode === 'playtime') endPlaytime();
};
G.doorUsers = () => {
  const a = actors, list = [];
  if (a.jd.active) list.push(a.jd);
  if (!actors.enabled) return list;
  list.push(a.principal, a.playtime); if (a.prize.active) list.push(a.prize);
  if (G.nullc?.active) list.push(G.nullc);
  return list;
};
function placeFar(e, min) { const w = G.world; for (let i = 0; i < 30; i++) { const h = w.randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > min) { e.x = h.x; e.z = h.z; return; } } }

function updateJD(dt) {
  const jd = actors.jd, w = G.world, m = jd.model;
  if (!jd.active) { m.visible = false; return; }
  m.visible = true;
  jd.stun = Math.max(0, jd.stun - dt); jd.eat = Math.max(0, jd.eat - dt); jd.hearT = Math.max(0, jd.hearT - dt);
  jd.anger = AI.decayAnger(jd.anger, dt, ai());
  if (jd.hearT <= 0) jd.hearPri = -1;
  // slap interval: table value for the notebooks held, minus temporary anger, never below minGap
  let base;
  if (S.run === 'endless') base = AI.baseGapLerp(Math.min(7, 1 + S.time / ai().endless.secondsPerLevel), ai()) + jd.calm;
  else base = AI.baseGap(S.notebooks, ai());
  if (S.run === 'endless') jd.calm = Math.max(0, jd.calm - ai().endless.calmDecayPerSec * dt);
  const gap = AI.effectiveGap(base, jd.anger, ai());
  const r = jd.slap.step(dt, S.event === 'ruler' ? gap * jd.jit : gap);
  if (r.slapped) { const [v, p] = G.spatial(jd.x, jd.z, 170); Snd.sfx.slap(v, p); m.userData.slapT = 0.18; if (S.event === 'ruler') jd.jit = rnd(0.5, 1.8); }
  let speed = r.speed;
  if (jd.stun > 0 || S.calmT > 0) speed *= 0.2;
  if (jd.eat > 0) speed = 0;
  const dp = Math.hypot(P.x - jd.x, P.z - jd.z);
  const sees = dp < 130 && w.los(jd.x, jd.z, P.x, P.z, 1.1) && S.detention <= 0;
  if (sees) { if (jd.state !== 'chase') jd.state = 'chase'; jd.lastSeen = { x: P.x, z: P.z }; }
  else if (jd.state === 'chase') { jd.state = 'follow'; jd.target = jd.lastSeen || { x: P.x, z: P.z }; jd.hearT = 4; jd.hearPri = 3; }   // check where the player was last seen
  const px = jd.x, pz = jd.z;
  if (jd.state === 'chase') {
    const dx = P.x - jd.x, dz = P.z - jd.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, speed * dt);
    jd.x += dx / d * st; jd.z += dz / d * st; jd.dirx = dx / d; jd.dirz = dz / d;
  } else if (jd.state === 'follow' && jd.target) {
    const left = w.followPath(jd, jd.target.x, jd.target.z, speed, dt, true);
    if (left < 3 || jd.hearT <= 0) { jd.state = 'wander'; jd.target = null; jd.goal = null; }
  } else {
    if (!jd.goal || Math.hypot(jd.goal.x - jd.x, jd.goal.z - jd.z) < 3) {   // wander: a nearby spot
      for (let i = 0; i < 12; i++) { const h = w.randHall(); if (Math.hypot(h.x - jd.x, h.z - jd.z) < 70) { jd.goal = h; break; } jd.goal = h; }
    }
    w.followPath(jd, jd.goal.x, jd.goal.z, speed * 0.8, dt, true);
  }
  // locked doors slow him: he breaks them down after a couple of seconds
  const ncx = toCell(jd.nx ?? jd.x), ncz = toCell(jd.nz ?? jd.z), door = w.doorAt(ncx, ncz);
  if (door && !door.exit && !door.gate && (door.locked || door.lockT > 0) && Math.hypot(cellCenter(door.cx) - jd.x, cellCenter(door.cz) - jd.z) < 11) {
    jd.breakT += dt; if (jd.breakT >= 2.5) { door.locked = false; door.lockT = 0; jd.breakT = 0; Snd.sfx.slam(); G.openDoor(door, false); }
  } else jd.breakT = 0;
  w.resolve(jd, 1.5);
  const moved = Math.hypot(jd.x - px, jd.z - pz);
  if (moved > 0.001) { jd.dirx = (jd.x - px) / moved; jd.dirz = (jd.z - pz) / moved; jd.walk += moved * 0.5; }
  m.position.set(jd.x, 0, jd.z); m.rotation.y = Math.atan2(jd.dirx, jd.dirz);
  const u = m.userData; u.slapT = Math.max(0, (u.slapT || 0) - dt);
  u.armR.rotation.x = u.slapT > 0 ? -2.3 : -0.5; u.armL.rotation.x = Math.sin(jd.walk) * 0.5;
  u.legs[0].rotation.x = Math.sin(jd.walk) * 0.5; u.legs[1].rotation.x = -Math.sin(jd.walk) * 0.5;
  u.setMood(S.hostile && (dp < 70 || jd.anger > 0) ? 'angry' : 'happy');
  if (!S.caught && S.mode === 'play' && dp < 3.8 && S.detention <= 0) G.caught('jd');
}

// ------------------------------------------------------------------ Principal of the Thing
function startDetention() {
  const pr = actors.principal, w = G.world, o = w.office;
  S.detention = ch().principal.detentionSec; pr.state = 'patrol'; pr.warn = 0; pr.cool = ch().principal.cooldownSec;
  P.x = (o.x0 + o.x1 + 1) * CELL / 2; P.z = (o.z0 + 1.5) * CELL; P.vx = P.vz = 0;
  const d = w.doorAt(o.door[0], o.door[1]); d.want = false; d.locked = true; d.gate = true;
  G.flash('#000', 1); say('<b>DETENTION!</b> You are locked in the office. Wait it out (or use Safety Scissors)…', 4000);
  Snd.sfx.locked(); G.noise(cellCenter(o.door[0]), cellCenter(o.door[1]), 'detention', Infinity, 12);   // JD heads for the office
  G.haptic(120);
}
actors.endDetention = (scissors) => {
  const w = G.world, o = w.office, d = w.doorAt(o.door[0], o.door[1]);
  S.detention = 0; actors.principal.cool = ch().principal.cooldownSec; d.gate = false; d.locked = false; G.openDoor(d, false);
  say(scissors ? 'You snipped your way out!' : 'Detention is over. <b>Walk</b> in the halls!', 2400);
};
function updatePrincipal(dt) {
  const c = actors.principal, w = G.world, cp = ch().principal;
  c.stun = Math.max(0, c.stun - dt); c.cool = Math.max(0, c.cool - dt);
  c.sprite.position.set(c.x, 0, c.z); c.glow.visible = S.fun.lights; c.glow.position.set(c.x, 0, c.z);
  if (S.detention > 0) return;
  const d = Math.hypot(P.x - c.x, P.z - c.z), sees = w.los(c.x, c.z, P.x, P.z);
  const sp = (c.state === 'chase' ? cp.chaseSpeed : cp.speed) * hm() * (c.stun > 0 ? 0.25 : 1);
  if (c.state === 'patrol') {
    if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3) c.goal = w.randHall();
    if (c.stun <= 0) w.followPath(c, c.goal.x, c.goal.z, sp, dt, false);
    if (c.cool <= 0 && P.running && P.moving && d < 70 && w.isHall(toCell(P.x), toCell(P.z)) && sees) { c.state = 'warn'; c.warn = cp.warnSec; Snd.sfx.whistle(); say('<b>Principal</b>: "NO RUNNING IN THE HALLS!"', 2200, 'No running in the halls!'); }
    const b = actors.bully;
    if (b.state === 'block' && Math.hypot(b.x - c.x, b.z - c.z) < 60 && w.los(c.x, c.z, b.x, b.z)) { c.state = 'bully'; Snd.sfx.whistle(); }
  } else if (c.state === 'warn') {
    c.warn -= dt; if (c.warn <= 0) { c.state = 'chase'; c.lost = 0; }
  } else if (c.state === 'chase') {
    if (sees) { c.lost = 0; const dx = P.x - c.x, dz = P.z - c.z, dd = Math.hypot(dx, dz) || 1; c.x += dx / dd * sp * dt; c.z += dz / dd * sp * dt; w.resolve(c, 1.5); }
    else { c.lost += dt; w.followPath(c, P.x, P.z, sp, dt, false); if (!S.fun.hard && c.lost > cp.loseSightSec) { c.state = 'patrol'; c.cool = 8; } }   // Hard Mode: he cannot lose a player he is chasing
    if (d < 4.8) startDetention();
  } else if (c.state === 'bully') {
    const b = actors.bully;
    if (b.state !== 'block') { c.state = 'patrol'; return; }
    w.followPath(c, b.x, b.z, cp.chaseSpeed * hm(), dt, false);
    if (Math.hypot(b.x - c.x, b.z - c.z) < 7) { bullyLeave(ch().bully.respawnSec); say('<b>Principal</b>: "Bully! To detention!"', 2600, 'Detention for you!'); unlockAchievement('bully_detention'); c.state = 'patrol'; c.cool = 5; }
  }
}

// ------------------------------------------------------------------ It's a Bully
const BULLY_SPOTS = () => [
  { x: cellCenter(2), z: cellCenter(12), r: [1 * CELL, 12 * CELL, 4 * CELL, 13 * CELL - 4] },
  { x: cellCenter(28), z: cellCenter(12), r: [27 * CELL, 12 * CELL, 30 * CELL, 13 * CELL - 4] },
  { x: cellCenter(10), z: cellCenter(8), r: [10 * CELL + 2, 7 * CELL, 11 * CELL + 6, 10 * CELL] },
  { x: cellCenter(21), z: cellCenter(8), r: [21 * CELL + 2, 7 * CELL, 22 * CELL + 6, 10 * CELL] },
  { x: cellCenter(10), z: cellCenter(16), r: [10 * CELL + 2, 15 * CELL, 11 * CELL + 6, 18 * CELL] },
  { x: cellCenter(21), z: cellCenter(16), r: [21 * CELL + 2, 15 * CELL, 22 * CELL + 6, 18 * CELL] },
];
function bullyLeave(sec) { const b = actors.bully; removeBullySolid(); b.state = 'gone'; b.timer = sec; b.sprite.visible = false; Snd.sfx.poof(); }
function updateBully(dt) {
  const b = actors.bully; b.stun = Math.max(0, b.stun - dt);
  if (b.state === 'absent' || b.state === 'gone') {
    b.timer -= dt;
    if (b.timer <= 0 && S.firstWrongT != null || (b.timer <= 0 && S.run === 'free')) {
      const spots = BULLY_SPOTS().filter((s) => Math.hypot(s.x - P.x, s.z - P.z) > 35).sort(() => Math.random() - 0.5);
      const s = spots[0]; if (s) { b.spot = s; b.x = s.x; b.z = s.z; b.state = 'block'; b.sprite.visible = true; b.solid = { x0: s.r[0], z0: s.r[1], x1: s.r[2], z1: s.r[3], dyn: true }; G.world.solids.push(b.solid); Snd.sfx.giggle(); }
    }
  }
  b.sprite.position.set(b.x, 0, b.z);
}
function bullyInteract(consider) {
  const b = actors.bully; if (b.state !== 'block') return;
  consider(S.items[S.sel] ? `Hand over ${ITEMS[S.items[S.sel]]} to pass` : "It's a Bully! Needs an item", () => {
    const it = S.items[S.sel];
    if (!it) { say('<b>It\'s a Bully</b>: "Gimme an item or you ain\'t passin\'!"', 2400, "Gimme an item!"); Snd.sfx.steal(); return; }
    S.items[S.sel] = null; G.renderSlots(); Snd.sfx.steal();
    say(`<b>It's a Bully</b>: "Heh. Thanks for the ${ITEMS[it]}. Go on."`, 2600, 'Thanks, loser!'); bullyLeave(ch().bully.respawnSec);
  }, b.x, b.z, 16);
}

// ------------------------------------------------------------------ Playtime
const pt = { hits: 0, pos: 0, dir: 1, speed: 1, active: false, start: null };
function startPlaytime() {
  const c = actors.playtime, cfgp = ch().playtime;
  S.mode = 'playtime'; pt.hits = 0; pt.pos = 0; pt.dir = 1; pt.speed = cfgp.markerStartSpeed * hm(); pt.active = true; pt.start = { x: P.x, z: P.z };
  $('play').classList.remove('hidden'); $('playProg').textContent = `0/${cfgp.jumpsNeeded}`; $('playMsg').textContent = 'Jump when the rope reaches the green!';
  $('ropeZone').style.left = cfgp.zone[0] * 100 + '%'; $('ropeZone').style.width = (cfgp.zone[1] - cfgp.zone[0]) * 100 + '%';
  $('cutBtn').classList.toggle('hidden', !S.items.includes('scissors'));
  c.state = 'game'; document.exitPointerLock?.(); G.setPrompt(null); Snd.sfx.giggle(); say('<b>Playtime</b>: "Wanna jump rope with me?!"', 2600);
}
actors.jumpPress = () => {
  if (!pt.active) return; const cp = ch().playtime;
  if (pt.pos >= cp.zone[0] && pt.pos <= cp.zone[1]) {
    pt.hits++; Snd.sfx.jump(); $('playProg').textContent = `${pt.hits}/${cp.jumpsNeeded}`; $('playMsg').textContent = pick(['Yay!', 'Again!', 'Wheee!', 'Nice jump!']);
    pt.speed += cp.markerSpeedPerHit; if (pt.hits >= cp.jumpsNeeded) endPlaytime();
  } else { Snd.sfx.miss(); pt.hits = Math.max(0, pt.hits - 1); $('playProg').textContent = `${pt.hits}/${cp.jumpsNeeded}`; $('playMsg').textContent = 'Oops! Try again!'; }
};
function endPlaytime(cut) {
  const c = actors.playtime; pt.active = false; $('play').classList.add('hidden'); S.mode = 'play';
  if (!G.isTouch) G.R.renderer.domElement.requestPointerLock?.();
  c.state = 'away'; c.timer = ch().playtime.cooldownSec; c.goal = G.world.randHall();
  Snd.sfx.giggle(); say(cut ? '<b>Playtime</b>: "My rope!! Meanie!"' : '<b>Playtime</b>: "That was fun! Bye!"', 2000);
}
actors.cutRope = () => {
  if (S.mode === 'playtime' && pt.active) { Snd.sfx.snip(); endPlaytime(true); return true; }
  if (S.detention > 0) { Snd.sfx.snip(); actors.endDetention(true); return true; }
  return false;
};
actors.cutRopeBtn = () => { const i = S.items.indexOf('scissors'); if (i < 0) return; S.sel = i; G.useItem(); };
function updatePlaytime(dt) {
  const c = actors.playtime, w = G.world, cp = ch().playtime;
  c.stun = Math.max(0, c.stun - dt); c.timer -= dt; c.sprite.position.set(c.x, 0, c.z);
  if (c.state === 'game') {
    pt.pos += pt.dir * pt.speed * dt; if (pt.pos > 1) { pt.pos = 1; pt.dir = -1; } else if (pt.pos < 0) { pt.pos = 0; pt.dir = 1; }
    $('ropeMark').style.left = `calc(${pt.pos * 100}% - 4px)`;
    if (pt.start && Math.hypot(P.x - pt.start.x, P.z - pt.start.z) > 14) endPlaytime(true);   // a push or teleport ends the game
    return;
  }
  if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3) c.goal = w.randHall();
  const d = Math.hypot(P.x - c.x, P.z - c.z), see = d < cp.seeRange && w.los(c.x, c.z, P.x, P.z), k = hm() * (c.stun > 0 ? 0.25 : 1);
  if (c.state === 'wander' && see && S.detention <= 0 && S.mode === 'play') c.state = 'chase';
  if (c.state === 'chase') { if (!see && d > cp.seeRange + 5) c.state = 'wander'; w.followPath(c, P.x, P.z, cp.chaseSpeed * k, dt, false); if (d < 5 && S.mode === 'play') startPlaytime(); }
  else if (c.state === 'away') { w.followPath(c, c.goal.x, c.goal.z, 12 * k, dt, false); if (c.timer <= 0) c.state = 'wander'; }
  else w.followPath(c, c.goal.x, c.goal.z, 7 * k, dt, false);
  if (see && Math.floor(S.time) % 4 === 0 && Math.random() < dt * 2) { const [v, p] = G.spatial(c.x, c.z, 90); Snd.sfx.giggle(p); }
}

// ------------------------------------------------------------------ Gotta Sweep (pushes everyone) and 1st Prize (pushes only the player)
function sweepRoute() {
  const ring = [[2, 8], [28, 8], [28, 16], [2, 16]].map(([x, z]) => ({ x: cellCenter(x), z: cellCenter(z) }));
  const start = ri(0, 3), dir = Math.random() < 0.5 ? 1 : -1, r = [];
  for (let i = 0; i < 9; i++) r.push(ring[((start + dir * i) % 4 + 4) % 4]);
  return r;
}
function updateSweep(dt) {
  const c = actors.sweep, sp = ch().sweep.speed * hm();
  if (!c.active) {
    c.timer -= dt;
    if (c.timer <= 0) {
      c.route = sweepRoute(); c.ri = 1; c.x = c.route[0].x; c.z = c.route[0].z; c.active = true; c.sprite.visible = true; c.rideT = 0;
      const [v, p] = G.spatial(c.x, c.z, 200); Snd.sfx.sweep(p, v); say('<b>Gotta Sweep</b> is sweeping the halls!', 2400, 'Sweeping!');
    }
    return;
  }
  const tgt = c.route[c.ri];
  if (!tgt) { c.active = false; c.sprite.visible = false; c.timer = rnd(ch().sweep.restMinSec, ch().sweep.restMaxSec); return; }
  const dx = tgt.x - c.x, dz = tgt.z - c.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, sp * (c.stun > 0 ? 0.2 : 1) * dt);
  c.stun = Math.max(0, c.stun - dt);
  c.x += dx / d * st; c.z += dz / d * st; if (d <= st + 0.01) c.ri++;
  const ux = dx / d, uz = dz / d; c.sprite.position.set(c.x, 0, c.z);
  const shove = (e, r = 6.5) => { if (Math.abs(e.x - c.x) < r && Math.abs(e.z - c.z) < r) { e.x += ux * sp * dt * 1.05; e.z += uz * sp * dt * 1.05; return true; } return false; };
  let riding = false;
  if (S.detention <= 0 && P.boots <= 0 && shove(P)) { G.world.resolve(P, P.r); riding = true; G.haptic(10); if (S.mode === 'playtime') { /* push ends the rope game via distance */ } }
  c.rideT = riding ? c.rideT + dt : 0; if (c.rideT >= 30) unlockAchievement('ride_sweep');
  for (const e of [actors.jd.active ? actors.jd : null, actors.principal, actors.playtime, actors.prize, actors.arts]) if (e && (e.sprite?.visible !== false)) { if (shove(e)) G.world.resolve(e, 1.5); }
}
function wakePrize() { const z = actors.prize; z.active = true; z.sprite.visible = true; placeFar(z, 70); z.state = 'patrol'; }
function updatePrize(dt) {
  const z = actors.prize; if (!z.active) return;
  const w = G.world, cp = ch().firstPrize; z.stun = Math.max(0, z.stun - dt); z.cool = Math.max(0, z.cool - dt);
  z.sprite.position.set(z.x, 0, z.z);
  const d = Math.hypot(P.x - z.x, P.z - z.z), see = d < cp.seeRange && w.los(z.x, z.z, P.x, P.z), k = hm() * (z.stun > 0 ? 0.25 : 1);
  if (z.state === 'patrol') {
    if (!z.goal || Math.hypot(z.goal.x - z.x, z.goal.z - z.z) < 3) z.goal = w.randHall();
    w.followPath(z, z.goal.x, z.goal.z, 8 * k, dt, false);
    if (see && z.cool <= 0 && S.detention <= 0) { z.state = 'chase'; Snd.sfx.giggle(); }
  } else {
    w.followPath(z, P.x, P.z, cp.speed * k, dt, false);
    if (d < 5) {   // 1st Prize only ever pushes the player
      const dx = P.x - z.x, dz = P.z - z.z, dd = Math.hypot(dx, dz) || 1; P.shoveX += dx / dd * cp.pushDistance * 2.2; P.shoveZ += dz / dd * cp.pushDistance * 2.2;
      Snd.sfx.boing(); say('<b>1st Prize</b>: "Hugs!" *shove*', 1500); z.state = 'patrol'; z.cool = 8; G.haptic(40);
    } else if (!see && d > cp.seeRange + 10) z.state = 'patrol';
  }
}

// ------------------------------------------------------------------ Arts and Crafters
function updateArts(dt) {
  const a = actors.arts, w = G.world, cp = ch().arts;
  a.stun = Math.max(0, a.stun - dt); a.sprite.position.set(a.x, 0, a.z);
  if (S.notebooks >= TOTAL_NB) {   // all notebooks: he stands still; staring at him too long is a mistake
    if (a.state !== 'stand') { a.state = 'stand'; a.sprite.visible = true; placeFar(a, 40); }
    const dx = a.x - P.x, dz = a.z - P.z, d = Math.hypot(dx, dz), fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const looking = d < 70 && (dx * fx + dz * fz) / (d || 1) > 0.93 && w.los(P.x, P.z, a.x, a.z);
    a.stare = looking ? a.stare + dt : Math.max(0, a.stare - dt * 2);
    if (a.stare >= cp.stareSec && !a.teleported && actors.jd.active) {
      a.teleported = true; a.stare = 0; const j = actors.jd;
      P.x = j.x + (j.dirx || 1) * -14; P.z = j.z + (j.dirz || 0) * -14; w.resolve(P, P.r); Snd.sfx.glitchy(); G.flash('#000', 0.9); say('<b>Arts and Crafters</b> stared back… and sent you to JD!', 2800);
    }
    return;
  }
  if (a.state === 'gone') { a.sprite.visible = false; a.timer -= dt; if (a.timer <= 0 && S.notebooks >= 1) { placeFar(a, 50); a.state = 'shy'; a.sprite.visible = true; a.timer = cp.vanishSec; } return; }
  const d = Math.hypot(P.x - a.x, P.z - a.z);
  if (d < 30 && w.los(a.x, a.z, P.x, P.z)) a.state = 'flee';
  if (a.state === 'flee') {
    // run away from the player toward the farthest hall spot
    if (!a.goal || Math.hypot(a.goal.x - a.x, a.goal.z - a.z) < 3) { let best = null, bd = -1; for (let i = 0; i < 12; i++) { const h = w.randHall(); const dd = Math.hypot(h.x - P.x, h.z - P.z); if (dd > bd) { bd = dd; best = h; } } a.goal = best; }
    w.followPath(a, a.goal.x, a.goal.z, cp.runSpeed * (a.stun > 0 ? 0.25 : 1), dt, false);
    a.timer -= dt; if (a.timer <= 0) { a.state = 'gone'; a.timer = cp.respawnSec; Snd.sfx.poof(); a.sprite.visible = false; a.goal = null; }
  }
}

// ------------------------------------------------------------------ frame update
G.updateActors = (dt) => {
  updateJD(dt);
  if (!actors.enabled) return;
  updatePrincipal(dt); updateBully(dt); updatePlaytime(dt); updateSweep(dt); updatePrize(dt); updateArts(dt);
};
G.extraInteract = (consider) => { if (actors.enabled) bullyInteract(consider); G.modeInteract?.(consider); };
G.actors = actors;
