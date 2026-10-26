// Lesson-B spec checks: Teacher table (8.3), anger (7.3/8.3), problem generator (7.4/7.5), noise bus (11), rank (A.3), share code (14.3), variant layer (20).
import fs from 'fs'; import assert from 'assert';
import * as L from '../js/lbai.js';
const rd = (f) => JSON.parse(fs.readFileSync(new URL('../data/lessonb/' + f, import.meta.url)));
const teacher = rd('teacher.json'), tiers = rd('tiers.json');

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
console.log('ok  teacher speed / wait table');

// anger: wrong +1.0, correct -0.15 (floor 0), cap 6, decay only after 10 s unseen
assert.strictEqual(L.angerWrong(0, 1, teacher), 1); assert.strictEqual(L.angerWrong(5.5, 1, teacher), 6);
assert.ok(Math.abs(L.angerCorrect(1, teacher) - 0.85) < 1e-9); assert.strictEqual(L.angerCorrect(0.1, teacher), 0);
assert.strictEqual(L.angerDecay(2, 1, 5, teacher), 2); assert.ok(Math.abs(L.angerDecay(2, 1, 11, teacher) - 1.98) < 1e-9);
console.log('ok  anger model');

// T01: notebook 1: P3 is impossible and any answer is wrong
const nb1 = L.generateNotebook(1, L.mulberry32(5), tiers);
assert.strictEqual(nb1.length, 3); assert.ok(nb1[2].impossible && nb1[2].answer === null && !nb1.slice(0, 2).some((p) => p.impossible));
for (const a of ['0', '1', '42', '-3', '']) assert.ok(!L.checkAnswer(nb1[2], a));
assert.ok(L.checkAnswer(nb1[0], String(nb1[0].answer)) && !L.checkAnswer(nb1[0], 'x'));
assert.ok(tiers.impossible.length >= 6);
// generator rules over many seeds: integers, no duplicate answers per notebook, no trivial operands, negatives only from notebook 4, impossible only N1-P3
for (let seed = 1; seed <= 300; seed++) {
  const rng = L.mulberry32(seed);
  for (let nb = 1; nb <= 7; nb++) {
    const ps = L.generateNotebook(nb, rng, tiers), answers = ps.filter((p) => !p.impossible).map((p) => p.answer);
    assert.strictEqual(new Set(answers).size, answers.length, `duplicate answers nb${nb} seed${seed}`);
    ps.forEach((p, i) => {
      assert.strictEqual(p.impossible, nb === 1 && i === 2, `impossible placement nb${nb} p${i}`);
      if (p.impossible) return;
      assert.ok(Number.isInteger(p.answer), `integer answer ${p.prompt}`);
      if (nb < 4) assert.ok(p.answer >= 0, `negative before notebook 4: ${p.prompt} ${p.answer}`);
      const nums = (p.prompt.match(/\d+/g) || []).map(Number);
      if (/×/.test(p.prompt)) assert.ok(nums.every((n) => n >= 2), `×0/×1 in ${p.prompt}`);
      if (/\+/.test(p.prompt)) assert.ok(nums.every((n) => n >= 1), `+0 in ${p.prompt}`);
    });
  }
}
console.log('ok  problem generator (300 seeds x 7 notebooks)');
// T11: same seed twice -> identical notebooks; different seed -> different
const a = JSON.stringify([1, 2, 3, 4, 5, 6, 7].map((n) => L.generateNotebook(n, L.makeStreams(123456).math, tiers)));
const b = JSON.stringify([1, 2, 3, 4, 5, 6, 7].map((n) => L.generateNotebook(n, L.makeStreams(123456).math, tiers)));
const c = JSON.stringify([1, 2, 3, 4, 5, 6, 7].map((n) => L.generateNotebook(n, L.makeStreams(654321).math, tiers)));
assert.strictEqual(a, b); assert.notStrictEqual(a, c);
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
