// Tuning values live in config/*.json so they can be changed without touching code.
export const DEFAULT_AI = {
  slapGapByNotebooks: [3.0, 2.5, 2.25, 2.0, 1.75, 1.5, 1.25, 1.0], minGap: 0.5,
  angerPerProblem: [0.135, 0.27, 0.405], angerDecayPerSec: 0.2, burstFraction: 0.4,
  walkSpeed: 12.5, runSpeed: 17.5, walkGapIndex: 4, padPausesWorld: true, gateOpensAtNotebook: 2,
  calmAfterMathMachineSec: 5, deafSecondsTape: 30,
  noisePriority: { detention: 5, alarm: 4, exit: 3, wrong: 2, door: 1, footstep: 0 },
  hearingRadius: { door: 90, footstep: 22 }, nullSpeedBonusTiles: 2, nullStartNotebooks: 2,
  endless: { secondsPerLevel: 40, calmPerNotebook: 0.25, calmDecayPerSec: 0.04, maxCalm: 1.0 },
};
export const DEFAULT_CHARS = {
  principal: { speed: 9, chaseSpeed: 14, detentionSec: 18, loseSightSec: 3, warnSec: 0.9, cooldownSec: 30 },
  playtime: { jumpsNeeded: 5, markerStartSpeed: 0.7, markerSpeedPerHit: 0.08, zone: [0.275, 0.725], chaseSpeed: 7, seeRange: 35, cooldownSec: 25 },
  bully: { firstAppearSecAfterWrong: 90, respawnSec: 90 },
  sweep: { wakeMinSec: 120, wakeMaxSec: 180, speed: 30, restMinSec: 35, restMaxSec: 70 },
  firstPrize: { speed: 16, seeRange: 45, pushDistance: 22, wakesAtNotebook: 2 },
  arts: { runSpeed: 18, vanishSec: 6, respawnSec: 30, stareSec: 3 },
  hard: { speedMul: 1.3 },
  boss: { hitsToWin: 10, baseSpeedMul: 1.0, speedPerHit: 0.1 },
};
export const cfg = { ai: structuredClone(DEFAULT_AI), chars: structuredClone(DEFAULT_CHARS) };
function merge(dst, src) {
  for (const k in src) {
    if (k.startsWith('_')) continue;
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') merge(dst[k], src[k]);
    else dst[k] = src[k];
  }
}
export async function loadConfig() {
  try {
    const [a, c] = await Promise.all(['config/ai.json', 'config/characters.json'].map((u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json())));
    merge(cfg.ai, a); merge(cfg.chars, c);
  } catch (e) { /* defaults are fine */ }
  return cfg;
}
