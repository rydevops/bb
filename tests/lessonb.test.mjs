// Lesson-B spec checks: Teacher table (8.3), anger (8.3), noise bus (11), rank (A.3), share code (14.3), variant layer (20).
import fs from 'fs'; import assert from 'assert';
import * as L from '../js/lbai.js';
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/lessonb/' + f, import.meta.url)));
const teacherTuned = rd('teacher.json');
// the spec's raw formulas (no pacing caps) for the section 8.3 table
const teacher = { ...teacherTuned, speedCapByNotebooks: undefined, waitFloorByNotebooks: undefined };

// 8.3 table: N, A, avgSpeed, W, distance per slap
for (const [N, A, spd, W, d] of [[1, 1, 6.8, 2.30, 15.6], [2, 1, 8.4, 2.10, 17.6], [3, 1, 10.0, 1.90, 19.0], [4, 1, 11.6, 1.70, 19.7], [5, 1, 13.2, 1.50, 19.8], [6, 1, 14.8, 1.30, 19.2], [7, 1, 16.4, 1.10, 18.0], [7, 4, 20.0, 0.90, 18.0]]) {
  const p = L.teacherParams(N, A, teacher);
  assert.ok(Math.abs(p.avgSpeed - spd) < 0.01, `speed N${N} A${A}: ${p.avgSpeed}`);
  assert.ok(Math.abs(p.W - W) < 0.01, `W N${N} A${A}: ${p.W}`);
  assert.ok(Math.abs(p.burstDist - d) < 0.06, `dist N${N} A${A}: ${p.burstDist}`);
  assert.ok(Math.abs(p.burstSpeed - p.burstDist / 0.45) < 1e-9);
}
assert.strictEqual(L.teacherParams(0, 0, teacher).avgSpeed, 4.0);
assert.strictEqual(L.teacherParams(7, 99, teacher).avgSpeed, 24.0, 'speed clamps at 24');
console.log('ok  teacher speed / wait table (raw spec formulas)');

// pacing: with the shipped caps the Teacher ramps smoothly, however many answers are wrong
const WALK = 10, RUN = 16; let prev = null;
for (let N = 0; N <= 7; N++) {
  const worst = L.teacherParams(N, teacherTuned.angerCap, teacherTuned), calm = L.teacherParams(N, 0, teacherTuned);
  assert.ok(worst.avgSpeed <= (L.teacherParams(N, 2, teacher).avgSpeed + 1e-9), `anger cannot add more than anger=2 at N${N}`);
  if (prev !== null) assert.ok(worst.avgSpeed - prev <= 0.2 * WALK + 1e-9, `step N${N - 1}->${N} is ${(worst.avgSpeed - prev).toFixed(2)} u/s (must be <= 0.2 x walk)`);
  prev = worst.avgSpeed;
  assert.ok(worst.W >= teacherTuned.waitFloorByNotebooks[N] - 1e-9 && calm.avgSpeed <= worst.avgSpeed + 1e-9);
}
assert.ok(L.teacherParams(3, 6, teacherTuned).avgSpeed <= 1.15 * WALK, 'at notebook 3 the Teacher is still about walking pace even with six wrong answers');
assert.ok(L.teacherParams(6, 6, teacherTuned).avgSpeed <= RUN + 1e-9, 'by notebook 6 he matches (never beats) the run speed');
console.log('ok  smooth pacing (no cliff after notebook 3)');

// anger: +1.0 per increase, -0.15 per decrease (floor 0), cap 6, decay only after 10 s unseen
assert.strictEqual(L.angerWrong(0, 1, teacher), 1); assert.strictEqual(L.angerWrong(5.5, 1, teacher), 6);
assert.ok(Math.abs(L.angerCorrect(1, teacher) - 0.85) < 1e-9); assert.strictEqual(L.angerCorrect(0.1, teacher), 0);
assert.strictEqual(L.angerDecay(2, 1, 5, teacher), 2); assert.ok(Math.abs(L.angerDecay(2, 1, 11, teacher) - 1.98) < 1e-9);
console.log('ok  anger model');

// seeded streams: the same seed gives the same sequence, another seed differs (used for notebook rooms, item placement, characters)
const seq = (seed) => { const st = L.makeStreams(seed); return JSON.stringify(['rooms', 'items', 'chars', 'teacher'].map((k) => [st[k](), st[k](), st[k]()])); };
assert.strictEqual(seq(123456), seq(123456)); assert.notStrictEqual(seq(123456), seq(654321));
console.log('ok  seeded determinism');

// noise bus: highest priority in range, ties -> closest; out of range ignored
const P = L.NOISE; const at = (x, kind) => ({ x, z: 0, ...P[kind] });
assert.strictEqual(L.pickNoise([at(10, 'door'), at(20, 'vend')], { x: 0, z: 0 })?.priority, 3);
assert.strictEqual(L.pickNoise([at(10, 'door'), at(5, 'fizz')], { x: 0, z: 0 }).x, 5, 'tie -> closest');
assert.strictEqual(L.pickNoise([at(100, 'door')], { x: 0, z: 0 }), null, 'door radius 25');
assert.strictEqual(L.pickNoise([at(100, 'alarm')], { x: 0, z: 0 }).priority, 5, 'alarm radius 200');
assert.strictEqual(L.pickNoise([at(10, 'windup')], { x: 0, z: 0 }, 2), null, 'Teacher ignores priority-1 events');
console.log('ok  noise bus');

// rank formula and share code
assert.strictEqual(L.rankScore({ time: 300, wrong: 0, detentions: 0, itemsUsed: 0, hits: 0, flawless: 3 }), 1450);
assert.strictEqual(L.rankLetter(1100), 'S'); assert.strictEqual(L.rankLetter(899), 'B'); assert.strictEqual(L.rankLetter(499), 'D');
const share = { mode: 'story', diff: 'hard', seed: 123456, time: 345.67, accuracy: 0.83 };
const code = L.encodeShare(share), back = L.decodeShare(code);
assert.deepStrictEqual({ ...back, seed: back.seed & 0xFFFFF }, { ...share, seed: share.seed & 0xFFFFF });
assert.strictEqual(L.decodeShare(code.replace(/.$/, (ch) => (ch === '0' ? '1' : '0'))), null, 'checksum rejects typos');
console.log('ok  rank + share code', code);

// variant layer (20): data-only overrides
const base = { teacher: { ...teacher }, characters: rd('characters.json'), items: rd('items.json'), notebooks: 7 };
const v = L.applyVariant(base, { teacher: { baseSpeed: 6 }, notebooks: { total: 5 }, chars: { enabled: ['principal'], custom: [{ id: 'x' }] }, items: { enabled: ['zest'], overrides: { zest: { seconds: 5 } } }, detention: { base: 20 } });
assert.strictEqual(v.teacher.baseSpeed, 6); assert.strictEqual(v.notebooks, 5); assert.deepStrictEqual(v.enabledChars, ['principal']); assert.strictEqual(v.customChars.length, 1);
assert.strictEqual(v.items.zest.seconds, 5); assert.strictEqual(v.characters.principal.detentionBase, 20); assert.strictEqual(base.teacher.baseSpeed, 4, 'base config untouched');
const dflt = L.applyVariant(base, JSON.parse(fs.readFileSync(new URL('../data/lessonb/variants/b.json', import.meta.url))));
assert.strictEqual(dflt.notebooks, 7); assert.strictEqual(dflt.enabledChars.length, 6);
console.log('ok  variant layer');
console.log('lesson-b tests passed');
