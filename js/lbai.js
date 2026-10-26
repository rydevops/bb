// Lesson-B pure logic (no DOM / three.js): Teacher formulas, anger, problem generator, noise priority, rank, share code.
// Unit-tested in tests/lessonb.test.mjs.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- seeded randomness: one master seed drives separate streams (spec 6.8 / 17.2)
export function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const STREAMS = ['rooms', 'items', 'chars', 'math', 'teacher'];
export function makeStreams(seed) { const o = {}; STREAMS.forEach((n, i) => { o[n] = mulberry32((seed * 2654435761 + (i + 1) * 40503) >>> 0); }); return o; }
export const randSeed = () => 100000 + Math.floor(Math.random() * 900000);
export const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export const rpick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export function weightedPick(rng, weights, exclude = {}) {
  const e = Object.entries(weights).filter(([k]) => !exclude[k]); const tot = e.reduce((s, [, w]) => s + w, 0); let r = rng() * tot;
  for (const [k, w] of e) { r -= w; if (r <= 0) return k; } return e[e.length - 1][0];
}

// ---- Teacher: rhythm pursuit (spec 8.3)
export function teacherParams(N, A, t) {
  const avgSpeed = clamp(t.baseSpeed + t.speedPerNotebook * N + t.speedPerAnger * A, t.minSpeed, t.maxSpeed);
  const W = Math.max(t.minWait, t.baseWait - t.waitPerNotebook * N - t.waitPerAnger * A);
  const burstDist = avgSpeed * W;
  return { avgSpeed, W, burstDist, burstSpeed: burstDist / t.burstDuration };
}
export const angerWrong = (A, per, t) => Math.min(t.angerCap, A + per);
export const angerCorrect = (A, t) => Math.max(0, A + t.angerPerCorrect);             // angerPerCorrect is negative
export const angerDecay = (A, dt, unseenFor, t) => (unseenFor > t.angerDecayAfterUnseen ? Math.max(0, A - t.angerDecayPerSecond * dt) : A);

// ---- noise bus (spec 11): highest priority in range wins; ties go to the closest
export const NOISE = {
  run: { radius: 50, duration: 0.3, priority: 1 }, door: { radius: 25, duration: 0.5, priority: 2 }, slam: { radius: 30, duration: 0.5, priority: 2 },
  brace: { radius: 15, duration: 0.4, priority: 1 }, braceBreak: { radius: 120, duration: 1.0, priority: 4 }, vend: { radius: 40, duration: 0.8, priority: 3 },
  alarm: { radius: 200, duration: 8, priority: 5 }, tantrum: { radius: 80, duration: 20, priority: 3 }, fizz: { radius: 35, duration: 0.6, priority: 2 },
  windup: { radius: 100, duration: 3, priority: 1 }, escape: { radius: Infinity, duration: 6, priority: 5 },
};
export function pickNoise(events, pos, minPriority = 0, dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)) {
  let best = null, bd = Infinity;
  for (const e of events) {
    const d = dist(e, pos); if (e.priority < minPriority || d > e.radius) continue;
    if (!best || e.priority > best.priority || (e.priority === best.priority && d < bd)) { best = e; bd = d; }
  }
  return best;
}

// ---- notebook problems (spec 7.4, 7.5)
export function generateNotebook(nb, rng, tiers) {
  const tier = tiers.tiers[String(clamp(nb, 1, 7))], out = [], used = new Set();
  const [lo, hi] = tier.range, mr = tier.mulRange || [2, 9];
  const build = (type) => {
    switch (type) {
      case 'add': { const a = rint(rng, Math.max(1, lo), hi), b = rint(rng, Math.max(1, lo), hi); return { prompt: `${a} + ${b} =`, answer: a + b }; }
      case 'sub': { let a = rint(rng, Math.max(1, lo), hi), b = rint(rng, Math.max(1, lo), hi); if (a === b) a = Math.min(hi, b + 1); if (a === b) b = Math.max(1, a - 1);
        if (!tier.negatives && a < b) [a, b] = [b, a]; return { prompt: `${a} − ${b} =`, answer: a - b }; }
      case 'addsub': return build(rng() < 0.5 ? 'add' : 'sub');
      case 'mul': { const a = rint(rng, mr[0], mr[1]), b = rint(rng, mr[0], mr[1]); return { prompt: `${a} × ${b} =`, answer: a * b }; }
      case 'div': { const d = rint(rng, 2, Math.min(mr[1], 12)), q = rint(rng, 2, tier.quotMax || 12); return { prompt: `${d * q} ÷ ${d} =`, answer: q }; }
      case 'two': { const a = rint(rng, lo, hi), b = rint(rng, 2, Math.min(hi, 12)), c = rint(rng, 2, Math.min(hi, 12)); return { prompt: `${a} + ${b} × ${c} =`, answer: a + b * c }; }
      default: throw new Error('unknown problem type ' + type);
    }
  };
  tier.types.forEach((type) => {
    if (type === 'impossible') { out.push({ prompt: rpick(rng, tiers.impossible), answer: null, impossible: true }); return; }
    let p; for (let tries = 0; tries < 40; tries++) { p = build(type); if (!used.has(p.answer)) break; }   // no duplicate answers within a notebook
    used.add(p.answer); out.push({ ...p, impossible: false });
  });
  return out;
}
export function checkAnswer(p, input) { return !p.impossible && /^-?\d{1,5}$/.test(input) && Number(input) === p.answer; }

// ---- results (spec 4.3, A.3)
export function rankScore(r) {
  return 1000 - 2 * (r.time - 300) - 60 * r.wrong - 40 * r.detentions - 25 * r.itemsUsed - 80 * r.hits + 150 * r.flawless;
}
export const rankLetter = (s) => (s >= 1100 ? 'S' : s >= 900 ? 'A' : s >= 700 ? 'B' : s >= 500 ? 'C' : 'D');

// ---- share code (spec 14.3): mode + difficulty + seed + time + accuracy + checksum -> base32
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MODES = ['story', 'practice', 'endless', 'challenge'], DIFFS = ['easy', 'normal', 'hard', 'nightmare'];
export function encodeShare({ mode, diff, seed, time, accuracy }) {
  const t = Math.min(Math.round(time * 100), (1 << 24) - 1), a = clamp(Math.round(accuracy * 100), 0, 100);
  let v = BigInt(MODES.indexOf(mode));
  v = (v << 3n) | BigInt(DIFFS.indexOf(diff)); v = (v << 20n) | BigInt(seed & 0xFFFFF); v = (v << 24n) | BigInt(t); v = (v << 7n) | BigInt(a);
  let sum = 0; for (let x = v; x > 0n; x >>= 5n) sum = (sum * 31 + Number(x & 31n)) % 32;
  v = (v << 5n) | BigInt(sum);
  let s = ''; for (let i = 0; i < 12; i++) { s = B32[Number(v & 31n)] + s; v >>= 5n; }
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}
export function decodeShare(code) {
  const raw = code.toUpperCase().replace(/[^0-9A-Z]/g, ''); if (raw.length !== 12) return null;
  let v = 0n; for (const ch of raw) { const i = B32.indexOf(ch); if (i < 0) return null; v = (v << 5n) | BigInt(i); }
  const sum = Number(v & 31n); v >>= 5n; let chk = 0; for (let x = v; x > 0n; x >>= 5n) chk = (chk * 31 + Number(x & 31n)) % 32;
  if (chk !== sum) return null;
  const accuracy = Number(v & 127n) / 100; v >>= 7n; const time = Number(v & 0xFFFFFFn) / 100; v >>= 24n; const seed = Number(v & 0xFFFFFn); v >>= 20n;
  const diff = DIFFS[Number(v & 7n)]; v >>= 3n; const mode = MODES[Number(v)];
  return { mode, diff, seed, time, accuracy };
}
// merge a variant override file over the base config (spec 20)
export function applyVariant(base, variant) {
  const o = structuredClone(base);
  if (variant?.teacher) Object.assign(o.teacher, variant.teacher);
  if (variant?.notebooks?.total) o.notebooks = variant.notebooks.total;
  if (variant?.detention) Object.assign(o.characters.principal, { detentionBase: variant.detention.base ?? 15, detentionPerPrior: variant.detention.perPrior ?? 10, detentionCap: variant.detention.cap ?? 60 });
  o.enabledChars = variant?.chars?.enabled || ['principal', 'bully', 'sweeper', 'rope', 'hugbot', 'crafter'];
  o.customChars = variant?.chars?.custom || [];
  o.enabledItems = variant?.items?.enabled || Object.keys(o.items.items);
  if (variant?.items?.overrides) for (const k in variant.items.overrides) Object.assign(o.items[k] ||= {}, variant.items.overrides[k]);
  o.variantName = variant?.displayName || 'Lesson-B';
  return o;
}
