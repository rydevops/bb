// Spec section 3 tuning note: simulate a run at each notebook count and check JD's effective
// speed matches the table. Run with: node tests/ai.test.mjs
import fs from 'fs';
import assert from 'assert';
import * as AI from '../js/ai.js';
const ai = JSON.parse(fs.readFileSync(new URL('../config/ai.json', import.meta.url)));

const expect = { 1: 'slower than walking', 2: 'slower than walking', 3: 'slower than walking', 4: 'same as walking', 5: 'between walking and running', 6: 'same as running', 7: 'faster than running' };
const gaps = { 1: 2.5, 2: 2.25, 3: 2.0, 4: 1.75, 5: 1.5, 6: 1.25, 7: 1.0 };
for (let n = 1; n <= 7; n++) {
  const gap = AI.effectiveGap(AI.baseGap(n, ai), 0, ai);
  assert.strictEqual(gap, gaps[n], `gap at ${n} notebooks`);
  const sl = new AI.Slapper(ai);
  let dist = 0, slaps = 0; const dt = 1 / 60, T = gap * 120;   // whole number of slap cycles
  for (let t = 0; t < T; t += dt) { const r = sl.step(dt, gap); dist += r.speed * dt; if (r.slapped) slaps++; }
  const eff = dist / T;
  assert.ok(Math.abs(eff - AI.avgSpeed(gap, ai)) / AI.avgSpeed(gap, ai) < 0.03, `simulated speed at ${n}: ${eff}`);
  assert.ok(Math.abs(slaps - 120) <= 1, `slap count at ${n}: ${slaps}`);
  assert.strictEqual(AI.classifySpeed(eff, ai), expect[n], `classification at ${n}: ${eff.toFixed(2)} vs walk ${ai.walkSpeed} run ${ai.runSpeed}`);
  console.log(`ok  ${n} notebooks  gap ${gap}s  speed ${eff.toFixed(2)}  (${expect[n]})`);
}
assert.strictEqual(AI.baseGap(0, ai), 3.0, 'longest gap is 3s before any notebook');
// anger: problem 1/2/impossible subtract 0.135/0.27/0.405 and decay 0.2 s/s, floor at minGap
assert.strictEqual(AI.angerForProblem(0, ai), 0.135);
assert.strictEqual(AI.angerForProblem(1, ai), 0.27);
assert.strictEqual(AI.angerForProblem(2, ai), 0.405);
assert.strictEqual(AI.effectiveGap(2.5, 0.405, ai), 2.5 - 0.405);
assert.strictEqual(AI.effectiveGap(1.0, 0.405, ai), 0.595);
assert.strictEqual(AI.effectiveGap(1.0, 5, ai), ai.minGap, 'never below minGap');
assert.ok(Math.abs(AI.decayAnger(0.405, 1, ai) - 0.205) < 1e-9);
assert.strictEqual(AI.decayAnger(0.1, 5, ai), 0);
// noise priority: detention > alarm > exit > wrong > door
const P = ai.noisePriority;
assert.ok(P.detention > P.alarm && P.alarm > P.exit && P.exit > P.wrong && P.wrong > P.door);
assert.ok(AI.betterNoise({ pri: P.door }, { pri: P.wrong }) && !AI.betterNoise({ pri: P.alarm }, { pri: P.door }));
// Null outruns JD at every notebook count
for (let n = 2; n <= 7; n++) { const g = AI.effectiveGap(AI.baseGap(n, ai), 0, ai); assert.ok(AI.nullSpeed(g, ai) > AI.avgSpeed(g, ai)); }
console.log('ai tests passed');
