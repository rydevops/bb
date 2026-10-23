// Fully synthesised audio (WebAudio) - no sample files needed.
let ctx = null, master, sfxBus, musicBus, noiseBuf;
let alarmNodes = null;
let musicTimer = null, step = 0, musicMode = 'off', intensity = 0, nextT = 0;
let voiceOn = true;
let muted = false;

export function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.9; if (m && window.speechSynthesis) speechSynthesis.cancel(); }
export function setVoice(v) { voiceOn = v; }
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); if (window.speechSynthesis) speechSynthesis.cancel(); }
export function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

function out(vol, pan, bus) {
  const g = ctx.createGain(); g.gain.value = vol;
  let last = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); last = p; }
  last.connect(bus || sfxBus);
  return g;
}
function tone(freq, dur, type = 'square', vol = 0.2, when = 0, o = {}) {
  if (!ctx) return;
  vol = Math.max(vol, 0.0002);
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator(); osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env); env.connect(o.dest || out(1, o.pan, o.bus));
  osc.start(t); osc.stop(t + dur + 0.05);
}
function noise(dur, f0 = 1000, f1 = f0, vol = 0.3, type = 'lowpass', when = 0, o = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const flt = ctx.createBiquadFilter(); flt.type = type;
  flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(Math.max(vol, 0.0002), t); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(env); env.connect(out(1, o.pan, o.bus));
  src.start(t); src.stop(t + dur + 0.05);
}

// ---- sound effects (vol/pan allow positional use) ----
export const sfx = {
  slap(vol = 1, pan = 0) {
    noise(0.12, 4000, 600, 0.9 * vol, 'bandpass', 0, { pan });
    tone(160, 0.18, 'triangle', 0.7 * vol, 0, { slide: 50, pan });
  },
  door(vol = 1, pan = 0) {
    noise(0.35, 300, 1400, 0.35 * vol, 'lowpass', 0, { pan });
    tone(90, 0.25, 'sawtooth', 0.12 * vol, 0.05, { slide: 60, pan });
  },
  doorClose(vol = 1, pan = 0) { noise(0.15, 900, 200, 0.5 * vol, 'lowpass', 0, { pan }); },
  locked() { tone(110, 0.08, 'square', 0.2); tone(95, 0.1, 'square', 0.2, 0.1); },
  pickup() { [660, 880, 1320].forEach((f, i) => tone(f, 0.12, 'square', 0.15, i * 0.07)); },
  notebook() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.25, i * 0.09)); },
  correct() { tone(784, 0.1, 'square', 0.18); tone(1175, 0.25, 'square', 0.18, 0.1); },
  wrong() { tone(150, 0.45, 'sawtooth', 0.3, 0, { slide: 90 }); tone(140, 0.45, 'square', 0.2, 0, { slide: 80 }); },
  key() { for (let i = 0; i < 3; i++) tone(2400, 0.04, 'square', 0.1, i * 0.06); },
  click() { tone(900, 0.03, 'square', 0.1); },
  select() { tone(500, 0.05, 'triangle', 0.15); },
  drink() { noise(0.5, 2500, 500, 0.3, 'bandpass'); tone(300, 0.4, 'sine', 0.15, 0.05, { slide: 700 }); },
  bsoda() { noise(0.7, 5000, 1500, 0.55, 'highpass'); },
  eat() { for (let i = 0; i < 4; i++) noise(0.06, 2000, 1000, 0.3, 'bandpass', i * 0.09); tone(400, 0.3, 'sine', 0.12, 0.35, { slide: 800 }); },
  coin() { tone(1568, 0.08, 'square', 0.15); tone(2093, 0.3, 'square', 0.15, 0.08); },
  vend() { noise(0.4, 600, 300, 0.4, 'lowpass'); tone(200, 0.15, 'square', 0.2, 0.4); },
  whistle() { tone(2200, 0.5, 'sine', 0.25, 0, { slide: 2700 }); tone(2230, 0.5, 'sine', 0.2, 0, { slide: 2650 }); },
  steal() { tone(500, 0.25, 'sawtooth', 0.2, 0, { slide: 120 }); },
  jump() { tone(300, 0.15, 'square', 0.15, 0, { slide: 600 }); },
  miss() { tone(200, 0.3, 'square', 0.18, 0, { slide: 100 }); },
  giggle(pan = 0) { [900, 1100, 1000, 1250].forEach((f, i) => tone(f, 0.08, 'triangle', 0.15, i * 0.09, { pan })); },
  sweep(pan = 0, vol = 1) { noise(1.2, 400, 1800, 0.5 * vol, 'bandpass', 0, { pan }); },
  scare() {
    noise(1.6, 3000, 200, 0.9, 'bandpass');
    [220, 233, 311, 330].forEach((f) => tone(f, 1.5, 'sawtooth', 0.35, 0, { slide: f * 0.5 }));
  },
  siren() { for (let i = 0; i < 4; i++) { tone(700, 0.45, 'square', 0.12, i * 0.9, { slide: 1000 }); tone(1000, 0.45, 'square', 0.12, i * 0.9 + 0.45, { slide: 700 }); } },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'square', 0.2, i * 0.14)); },
  talk(pitch = 1) { tone(120 * pitch + Math.random() * 40, 0.07, 'sawtooth', 0.08); },
  alarmStart(pan = 0, getVol) {
    if (!ctx || alarmNodes) return;
    const g = out(1, 0); g.gain.value = 0.35;
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 1500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 8;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    const am = ctx.createGain(); am.gain.value = 0.5;
    lfo.connect(lg); lg.connect(am.gain);
    o1.connect(am); am.connect(g);
    o1.start(); lfo.start();
    alarmNodes = { o1, lfo, g };
  },
  alarmVol(v, pan) { if (alarmNodes) alarmNodes.g.gain.value = 0.5 * v; },
  alarmStop() { if (!alarmNodes) return; try { alarmNodes.o1.stop(); alarmNodes.lfo.stop(); } catch (e) {} alarmNodes = null; },
};

export function speak(text, pitch = 0.55) {
  if (muted || !voiceOn || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = pitch; u.rate = 0.9; u.volume = 1;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---- generative music ----
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const f = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const BASS = [0, 0, 7, 0, 5, 5, 3, 7];
const TITLE = [0, 4, 7, 12, 7, 4, 2, 5, 9, 14, 9, 5];

export function musicStart(mode) {
  if (!ctx) return;
  musicMode = mode; step = 0; nextT = ctx.currentTime + 0.1;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = setInterval(sched, 60);
}
export function musicStop() { musicMode = 'off'; if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
// 0..1 : how much danger (notebooks + proximity)
export function setIntensity(v) { intensity = v; }

function sched() {
  if (!ctx || musicMode === 'off' || ctx.state !== 'running') { if (ctx) nextT = Math.max(nextT, ctx.currentTime); return; }
  const bpm = musicMode === 'title' ? 84 : 96 + intensity * 70;
  const dur = 60 / bpm / 2;
  while (nextT < ctx.currentTime + 0.25) {
    const d = nextT - ctx.currentTime;
    play(step, d, dur);
    step++; nextT += dur;
  }
}
function play(s, when, dur) {
  const b = musicBus;
  if (musicMode === 'title') {
    const n = TITLE[s % TITLE.length];
    if (s % 2 === 0) tone(f(60 + n), 0.5, 'triangle', 0.35, when, { bus: b });
    if (s % 12 === 0) tone(f(36), 2.2, 'sine', 0.35, when, { bus: b });
    return;
  }
  const root = 33 + (musicMode === 'escape' ? 2 : 0);
  if (s % 2 === 0) tone(f(root + BASS[(s >> 1) % BASS.length]), dur * 1.8, 'triangle', 0.5, when, { bus: b });
  if (intensity > 0.08 && s % 4 === 2) noise(0.05, 7000, 7000, 0.25 + intensity * 0.3, 'highpass', when, { bus: b });
  if (intensity > 0.2 && s % 8 === 4) noise(0.1, 1800, 400, 0.3, 'bandpass', when, { bus: b });
  if (intensity > 0.35) {
    const idx = (s * 3 + (s >> 3)) % 7;
    if (s % 2 === 1) tone(f(root + 24 + MINOR[idx]), dur * 0.9, 'square', 0.1 + intensity * 0.08, when, { bus: b });
  }
  if (intensity > 0.6 && s % 1 === 0) tone(f(root + 36 + MINOR[(s * 5) % 7]), dur * 0.5, 'sawtooth', 0.05, when, { bus: b });
  if (musicMode === 'escape' && s % 4 === 0) tone(f(root + 12), dur * 3, 'sawtooth', 0.12, when, { bus: b, slide: f(root + 11) });
  if (s % 32 === 0) tone(f(root - 12), dur * 24, 'sine', 0.4, when, { bus: b });
}
