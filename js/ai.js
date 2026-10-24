// Pure JD logic (no DOM / three.js) so it can be unit-tested in Node.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function baseGap(n, ai) { const t = ai.slapGapByNotebooks; return t[clamp(Math.floor(n), 0, t.length - 1)]; }
// fractional notebook levels (Endless) interpolate between table rows
export function baseGapLerp(level, ai) {
  const t = ai.slapGapByNotebooks, l = clamp(level, 0, t.length - 1), i = Math.floor(l);
  return t[i] + ((t[Math.min(i + 1, t.length - 1)] - t[i]) * (l - i));
}
export function effectiveGap(base, anger, ai) { return Math.max(ai.minGap, base - anger); }
// distance JD covers per slap cycle: chosen so the 4-notebook gap exactly matches walking speed
export function distancePerSlap(ai) { return ai.walkSpeed * ai.slapGapByNotebooks[ai.walkGapIndex]; }
export function avgSpeed(gap, ai) { return distancePerSlap(ai) / gap; }
export function classifySpeed(speed, ai) {
  const eps = 0.02;
  if (speed < ai.walkSpeed * (1 - eps)) return 'slower than walking';
  if (speed <= ai.walkSpeed * (1 + eps)) return 'same as walking';
  if (speed < ai.runSpeed * (1 - eps)) return 'between walking and running';
  if (speed <= ai.runSpeed * (1 + eps)) return 'same as running';
  return 'faster than running';
}
export function angerForProblem(i, ai) { return ai.angerPerProblem[clamp(i, 0, ai.angerPerProblem.length - 1)]; }
export function decayAnger(anger, dt, ai) { return Math.max(0, anger - ai.angerDecayPerSec * dt); }
// Null: faster than JD by N tiles per move interval
export function nullSpeed(gap, ai, cell = 8) { return (distancePerSlap(ai) + ai.nullSpeedBonusTiles * cell) / gap; }

// noise priority: highest wins, equal priority -> newest wins
export function betterNoise(current, incoming) { return !current || incoming.pri >= current.pri; }

// ruler-slap burst scheduler. Each cycle lasts one gap; JD sprints during the first burstFraction of it.
export class Slapper {
  constructor(ai) { this.ai = ai; this.t = 0; this.cycle = 1; this.started = false; }
  // advances dt seconds (splitting at cycle boundaries so frame rate never changes the average speed)
  step(dt, gap) {
    let slapped = false, sprint = 0, left = dt;
    const f = this.ai.burstFraction;
    if (!this.started) { this.t = 0; this.cycle = gap; this.started = true; slapped = true; }
    for (let guard = 0; guard < 8 && left > 0; guard++) {
      const end = this.cycle * f, toCycleEnd = this.cycle - this.t, seg = Math.min(left, toCycleEnd);
      sprint += Math.max(0, Math.min(this.t + seg, end) - Math.max(this.t, 0));
      this.t += seg; left -= seg;
      if (this.t >= this.cycle - 1e-9) { this.t = 0; this.cycle = gap; slapped = true; }
    }
    const speed = dt > 0 ? (distancePerSlap(this.ai) / (this.cycle * f)) * (sprint / dt) : 0;
    return { slapped, speed, burst: this.t < this.cycle * f };
  }
}
