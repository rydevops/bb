// Fully synthesised audio (WebAudio): original 1990s-MIDI-style cues generated in code, sound effects,
// separate music / effects / voice buses with ducking, and a distorted radio voice for Null.
// (The spec's 13 cues are all here; they are generated rather than shipped as AAC files, so the audio budget is 0 bytes.)
let ctx = null, master, sfxBus, musicBus, duckGain, noiseBuf;
let alarmNodes = null, ambNodes = null;
let vol = { music: 0.8, sfx: 0.9, voice: 1 };
let muted = false, voiceOn = true;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return !!ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  duckGain = ctx.createGain(); duckGain.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(duckGain);
  applyVol();
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return true;
}
function applyVol() { if (!ctx) return; musicBus.gain.value = vol.music * 0.4; sfxBus.gain.value = vol.sfx; }
export function setVolumes(m, s, v) { vol = { music: m, sfx: s, voice: v }; applyVol(); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 1; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
export function setVoice(v) { voiceOn = v; }
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); if (window.speechSynthesis) speechSynthesis.cancel(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export const isReady = () => !!ctx && ctx.state === 'running';

function out(v, pan, bus) {
  const g = ctx.createGain(); g.gain.value = v; let last = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); last = p; }
  last.connect(bus || sfxBus); return g;
}
function tone(freq, dur, type = 'square', v = 0.2, when = 0, o = {}) {
  if (!ctx) return; v = Math.max(v, 0.0002);
  const t = ctx.currentTime + when, osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(freq, t); if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(v, t + Math.min(o.attack || 0.02, dur / 3)); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env); env.connect(out(1, o.pan, o.bus)); osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, f0 = 1000, f1 = f0, v = 0.3, type = 'lowpass', when = 0, o = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when, src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const env = ctx.createGain(); env.gain.setValueAtTime(Math.max(v, 0.0002), t); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(env); env.connect(out(1, o.pan, o.bus)); src.start(t); src.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- sound effects
export const sfx = {
  slap(v = 1, pan = 0) { noise(0.12, 4000, 600, 0.9 * v, 'bandpass', 0, { pan }); tone(160, 0.18, 'triangle', 0.7 * v, 0, { slide: 50, pan }); },
  door(v = 1, pan = 0) { noise(0.35, 300, 1400, 0.35 * v, 'lowpass', 0, { pan }); tone(90, 0.25, 'sawtooth', 0.12 * v, 0.05, { slide: 60, pan }); },
  doorClose(v = 1, pan = 0) { noise(0.15, 900, 200, 0.5 * v, 'lowpass', 0, { pan }); },
  locked() { tone(110, 0.08, 'square', 0.2); tone(95, 0.1, 'square', 0.2, 0.1); },
  pickup() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.15, i * 0.07)); },
  notebook() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, i * 0.09)); },
  correct() { tone(784, 0.1, 'square', 0.18); tone(1175, 0.25, 'square', 0.18, 0.1); },
  wrong() { tone(150, 0.45, 'sawtooth', 0.3, 0, { slide: 90 }); tone(140, 0.45, 'square', 0.2, 0, { slide: 80 }); },
  glitchy() { for (let i = 0; i < 8; i++) tone(200 + Math.random() * 1800, 0.05, 'square', 0.12, i * 0.04); noise(0.4, 6000, 300, 0.3, 'bandpass'); },
  key() { for (let i = 0; i < 3; i++) tone(2400, 0.04, 'square', 0.1, i * 0.06); },
  click() { tone(900, 0.03, 'square', 0.1); },
  select() { tone(500, 0.05, 'triangle', 0.15); },
  eat() { for (let i = 0; i < 4; i++) noise(0.06, 2000, 1000, 0.3, 'bandpass', i * 0.09); tone(400, 0.3, 'sine', 0.12, 0.35, { slide: 800 }); },
  bsoda() { noise(0.7, 5000, 1500, 0.55, 'highpass'); },
  coin() { tone(1568, 0.08, 'square', 0.15); tone(2093, 0.3, 'square', 0.15, 0.08); },
  vend() { noise(0.4, 600, 300, 0.4, 'lowpass'); tone(200, 0.15, 'square', 0.2, 0.4); },
  whistle() { tone(2200, 0.5, 'sine', 0.25, 0, { slide: 2700 }); tone(2230, 0.5, 'sine', 0.2, 0, { slide: 2650 }); },
  steal() { tone(500, 0.25, 'sawtooth', 0.2, 0, { slide: 120 }); },
  jump() { tone(300, 0.15, 'square', 0.15, 0, { slide: 600 }); },
  miss() { tone(200, 0.3, 'square', 0.18, 0, { slide: 100 }); },
  snip() { for (let i = 0; i < 3; i++) noise(0.05, 5000, 3000, 0.4, 'highpass', i * 0.07); },
  giggle(pan = 0) { [900, 1100, 1000, 1250].forEach((f, i) => tone(f, 0.08, 'triangle', 0.15, i * 0.09, { pan })); },
  sweep(pan = 0, v = 1) { noise(1.2, 400, 1800, 0.5 * v, 'bandpass', 0, { pan }); },
  boing() { tone(200, 0.3, 'sine', 0.3, 0, { slide: 700 }); },
  static() { noise(1.5, 3000, 3000, 0.25, 'bandpass'); },
  thud() { tone(90, 0.25, 'sine', 0.5, 0, { slide: 40 }); noise(0.15, 400, 100, 0.4); },
  throwIt() { noise(0.25, 800, 2500, 0.3, 'bandpass'); },
  hit() { tone(120, 0.5, 'sawtooth', 0.4, 0, { slide: 30 }); noise(0.4, 3000, 200, 0.6, 'bandpass'); },
  slam() { noise(0.3, 500, 80, 0.9); tone(70, 0.4, 'sine', 0.6, 0, { slide: 30 }); },
  splash() { noise(0.5, 1500, 300, 0.3, 'bandpass'); },
  poof() { noise(0.4, 2500, 300, 0.4, 'bandpass'); },
  scare() { noise(1.6, 3000, 200, 0.9, 'bandpass'); [220, 233, 311, 330].forEach((f) => tone(f, 1.5, 'sawtooth', 0.35, 0, { slide: f * 0.5 })); },
  nullCatch() { noise(2.2, 8000, 100, 1, 'bandpass'); for (let i = 0; i < 6; i++) tone(900 + i * 70, 1.6, 'square', 0.25, i * 0.05, { slide: 80 }); tone(55, 2, 'sawtooth', 0.7); },
  siren() { for (let i = 0; i < 4; i++) { tone(700, 0.45, 'square', 0.12, i * 0.9, { slide: 1000 }); tone(1000, 0.45, 'square', 0.12, i * 0.9 + 0.45, { slide: 700 }); } },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'square', 0.2, i * 0.14)); },
  blow() { noise(0.6, 1200, 400, 0.35, 'lowpass'); },
  talk(p = 1) { tone(120 * p + Math.random() * 40, 0.07, 'sawtooth', 0.08); },
  beep(v = 1) { tone(1800, 0.18, 'square', 0.3 * v); },
  alarmStart() {
    if (!ctx || alarmNodes) return;
    const g = out(1, 0); g.gain.value = 0.35;
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 1500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 8; const lg = ctx.createGain(); lg.gain.value = 0.5; const am = ctx.createGain(); am.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain); o1.connect(am); am.connect(g); o1.start(); lfo.start();
    alarmNodes = { o1, lfo, g };
  },
  alarmVol(v) { if (alarmNodes) alarmNodes.g.gain.value = 0.5 * v; },
  alarmStop() { if (!alarmNodes) return; try { alarmNodes.o1.stop(); alarmNodes.lfo.stop(); } catch (e) {} alarmNodes = null; },
  staticLoopStart() { if (!ctx || sfx._st) return; const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; const g = out(0.25); src.connect(f); f.connect(g); src.start(); sfx._st = { src, g }; },
  staticLoopStop() { if (sfx._st) { try { sfx._st.src.stop(); } catch (e) {} sfx._st = null; } },
};

// ambience: a quiet cafeteria murmur plus the odd unsettling clip. Routed through the effects bus so SFX volume applies.
export function ambienceStart() {
  if (!ctx || ambNodes) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
  const g = out(0.05); src.connect(f); f.connect(g); src.start();
  const timer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const r = Math.random();
    if (r < 0.4) tone(mtof(40 + ((Math.random() * 5) | 0)), 2.5, 'sine', 0.04, 0, { slide: mtof(38), attack: 0.8 });
    else if (r < 0.7) noise(0.6, 600, 200, 0.05, 'bandpass');
  }, 22000);
  ambNodes = { src, timer };
}
export function ambienceStop() { if (!ambNodes) return; try { ambNodes.src.stop(); } catch (e) {} clearInterval(ambNodes.timer); ambNodes = null; }

// ---------------------------------------------------------------- voice
let duckT = 0;
function duck(sec) { if (!ctx) return; const t = ctx.currentTime; duckGain.gain.cancelScheduledValues(t); duckGain.gain.setTargetAtTime(0.35, t, 0.05); clearTimeout(duckT); duckT = setTimeout(() => { if (ctx) duckGain.gain.setTargetAtTime(1, ctx.currentTime, 0.4); }, sec * 1000); }
export function speak(text, pitch = 0.55) {
  duck(Math.max(1.2, text.length * 0.075));
  if (muted || !voiceOn || !window.speechSynthesis) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = 0.9; u.volume = vol.voice; speechSynthesis.speak(u); } catch (e) {}
}
// Null's voice: low-bandwidth, distorted, radio-like, with loud beeps. Purely synthesised.
export function nullVoice(text) {
  if (!ctx) return; duck(text.length * 0.09);
  const t0 = ctx.currentTime;
  const shaper = ctx.createWaveShaper(); const curve = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.sign(x) * Math.pow(Math.abs(x), 0.3); } shaper.curve = curve;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2;
  const g = ctx.createGain(); g.gain.value = 0.5 * vol.voice; shaper.connect(bp); bp.connect(g); g.connect(duckGain);
  const n = Math.min(60, text.length);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.085, o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55 + (text.charCodeAt(i) % 9) * 9, t);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.5, t + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.connect(e); e.connect(shaper); o.start(t); o.stop(t + 0.09);
  }
  tone(1800, 0.2, 'square', 0.3, n * 0.085 + 0.1, { bus: duckGain });
}

// ---------------------------------------------------------------- music: 13 generated cues
// A cue is a profile for a small step sequencer (8th-note steps). Melodies are seeded so each cue always sounds the same.
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10];
const CUES = {
  menuOpener:    { bpm: 120, steps: 40, loop: false, root: 60, scale: MAJOR, prog: [0, 3, 4, 0], lead: 'square', leadP: 0.8, bass: 'tri', drums: 'tick', seed: 1 },
  menuConfirm:   { bpm: 132, steps: 35, loop: false, root: 62, scale: MAJOR, prog: [0, 4, 3, 4], lead: 'square', leadP: 0.9, bass: 'tri', drums: 'beat', seed: 2 },
  schoolhouse:   { bpm: 96, steps: 128, loop: true, root: 48, scale: MINOR, prog: [0, 5, 3, 4], lead: 'tri', leadP: 0.28, bass: 'saw', drums: 'sparse', seed: 3, reactive: true },
  math:          { bpm: 120, steps: 120, loop: true, root: 57, scale: MAJOR, prog: [0, 5, 3, 4], lead: 'square', leadP: 0.7, bass: 'tri', drums: 'tick', seed: 4 },
  escape:        { bpm: 150, steps: 300, loop: true, root: 45, scale: PHRYG, prog: [0, 1, 0, 5], lead: 'saw', leadP: 0.85, bass: 'saw', drums: 'beat', seed: 5 },
  escapeFree:    { bpm: 120, steps: 360, loop: true, root: 52, scale: MINOR, prog: [0, 3, 5, 4], lead: 'square', leadP: 0.8, bass: 'tri', drums: 'beat', seed: 6 },
  playtime:      { bpm: 112, steps: 128, loop: true, root: 72, scale: MAJOR, prog: [0, 4, 5, 3], lead: 'box', leadP: 0.9, bass: 'none', drums: 'none', seed: 7 },
  party:         { bpm: 128, steps: 168, loop: true, root: 65, scale: MAJOR, prog: [0, 3, 4, 5], lead: 'box', leadP: 0.95, bass: 'tri', drums: 'tick', seed: 8 },
  candle:        { bpm: 90, steps: 60, loop: false, root: 67, scale: MAJOR, prog: [0, 4, 5, 0], lead: 'box', leadP: 0.6, bass: 'none', drums: 'none', seed: 9 },
  boss:          { bpm: 140, steps: 630, loop: true, root: 38, scale: PHRYG, prog: [0, 0, 1, 5], lead: 'saw', leadP: 0.9, bass: 'saw', drums: 'beat', seed: 10, boss: true },
  credits:       { bpm: 100, steps: 83, loop: false, root: 60, scale: MAJOR, prog: [0, 5, 3, 4], lead: 'tri', leadP: 0.7, bass: 'tri', drums: 'none', seed: 11 },
  secretSong:    { bpm: 110, steps: 220, loop: false, root: 62, scale: MAJOR, prog: [0, 0, 3, 4], lead: 'tri', leadP: 0.9, bass: 'tri', drums: 'tick', seed: 12 },
  warning:       { bpm: 70, steps: 140, loop: true, root: 36, scale: PHRYG, prog: [0, 0, 1, 0], lead: 'none', leadP: 0, bass: 'drone', drums: 'none', seed: 13 },
};
export const CUE_NAMES = Object.keys(CUES);
export const cueLengthSeconds = (name) => CUES[name].steps * 60 / CUES[name].bpm / 2;
let cue = null, step = 0, nextT = 0, timer = null, tempoMul = 1, intensity = 0, holdNote = false, endedCb = null;
const rng = (seed, i) => { let x = Math.sin(seed * 977 + i * 131.7) * 43758.5453; return x - Math.floor(x); };

export const music = {
  play(name, onEnd) {
    if (!ctx || !CUES[name]) return; if (cue && cue.name === name && timer) return;
    cue = { name, ...CUES[name] }; step = 0; nextT = ctx.currentTime + 0.08; tempoMul = 1; holdNote = false; endedCb = onEnd || null;
    if (!timer) timer = setInterval(sched, 60);
  },
  stop() { cue = null; if (timer) { clearInterval(timer); timer = null; } },
  get current() { return cue && cue.name; },
  setIntensity(v) { intensity = v; },
  setTempo(m) { tempoMul = m; },
  hold(on) { holdNote = on; },
};
function sched() {
  if (!ctx || !cue) return;
  if (ctx.state !== 'running') { nextT = Math.max(nextT, ctx.currentTime); return; }
  const dur = 60 / (cue.bpm * tempoMul) / 2;
  while (cue && nextT < ctx.currentTime + 0.25) {
    if (step >= cue.steps) { if (cue.loop) step = 0; else { const cb = endedCb; music.stop(); if (cb) cb(); return; } }
    playStep(cue, step, nextT - ctx.currentTime, dur); step++; nextT += dur;
  }
}
function voice(type, f, dur, v, when) {
  const wave = { square: 'square', tri: 'triangle', saw: 'sawtooth', box: 'sine', drone: 'sawtooth' }[type] || 'sine';
  if (type === 'box') { tone(f, dur * 2.5, 'sine', v, when, { bus: musicBus }); tone(f * 4, dur * 0.8, 'triangle', v * 0.25, when, { bus: musicBus }); }   // music-box
  else tone(f, dur, wave, v, when, { bus: musicBus });
}
function playStep(c, s, when, dur) {
  const bar = (s / 8) | 0, chord = c.prog[bar % c.prog.length], sc = c.scale;
  const degree = (d) => c.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  if (holdNote) { if (s % 16 === 0) tone(mtof(c.root), dur * 14, 'sine', 0.5, when, { bus: musicBus }); return; }
  const section = c.boss ? ((s / 64) | 0) % 5 : 0;     // the long boss track moves through sections
  // bass
  if (c.bass === 'drone') { if (s % 32 === 0) { tone(mtof(c.root), dur * 30, 'sawtooth', 0.2, when, { bus: musicBus }); tone(mtof(c.root + 6), dur * 30, 'sine', 0.12, when, { bus: musicBus }); } }
  else if (c.bass !== 'none' && s % 2 === 0) voice(c.bass, mtof(degree(chord) - 12), dur * 1.8, 0.45, when);
  // lead
  if (c.lead !== 'none') {
    const r = rng(c.seed, s + section * 7);
    const step2 = c.lead === 'box' ? 2 : 1;
    if (s % step2 === 0 && r < c.leadP * (c.reactive ? 0.4 + intensity : 1)) {
      const d = chord + [0, 2, 4, 7, 4, 2, 5, 9][((rng(c.seed + 1, s) * 8) | 0)] ;
      voice(c.lead, mtof(degree(d) + (c.boss ? 12 * (section % 2) : 12)), dur * (step2 === 2 ? 1.6 : 0.9), c.lead === 'box' ? 0.28 : 0.13, when);
    }
  }
  // drums
  const hat = () => noise(0.04, 7000, 7000, 0.12 + intensity * 0.2, 'highpass', when, { bus: musicBus });
  if (c.drums === 'tick' && s % 2 === 1) hat();
  if (c.drums === 'sparse') { if (intensity > 0.08 && s % 4 === 2) hat(); if (intensity > 0.25 && s % 8 === 4) noise(0.1, 1800, 400, 0.3, 'bandpass', when, { bus: musicBus }); }
  if (c.drums === 'beat') { if (s % 4 === 0) { tone(110, 0.12, 'sine', 0.6, when, { slide: 45, bus: musicBus }); } if (s % 4 === 2) noise(0.09, 2200, 600, 0.35, 'bandpass', when, { bus: musicBus }); if (s % 2 === 1) hat(); }
  // extra tension for the schoolhouse theme as JD gets close
  if (c.reactive && intensity > 0.5 && s % 16 === 0) tone(mtof(c.root - 12 + 1), dur * 14, 'sawtooth', 0.18, when, { bus: musicBus });
}
// back-compat helpers used by the game
export const musicStop = () => music.stop();
