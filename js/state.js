// Shared mutable game state. Modules attach their functions to G so they can call each other without import cycles.
import { cfg } from './config.js';
export const $ = (id) => document.getElementById(id);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const ri = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const isTouch = (typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches) || 'ontouchstart' in window;

export const ITEMS = {
  zesty: 'Zesty Bar', bsoda: 'BSODA', scissors: 'Safety Scissors', quarter: 'Quarter', keys: "Principal's Keys", alarm: 'Alarm Clock',
  tape: "JD's Least Favorite Tape", nosquee: 'WD-NoSquee', lock: 'Door Lock', boots: "Big Ol' Boots", apple: 'An Apple for JD',
};
export const TOTAL_NB = 7;

export const S = {
  mode: 'boot',                 // boot | menu | play | pad | playtime | paused | scene | over
  style: 'classic', run: 'story', fun: { hard: false, lights: false, mirror: false },
  notebooks: 0, correct: 0, wrong: 0, stamina: 100, boost: 0, items: [null, null, null], sel: 0,
  time: 0, detention: 0, exitsOpen: false, exitsReached: 0, firstWrongT: null, hostile: false,
  carry: null, deafT: 0, silentDoorsT: 0, calmT: 0, staticT: 0, map: false, paused: false,
  endlessScore: 0, event: null, eventT: 0, nextEventT: 0, caught: false, bossHits: 0, phase: 'main', behind: false,
};
export const P = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, r: 1.5, bob: 0, running: false, moving: false, exhausted: false, boots: 0, shoveX: 0, shoveZ: 0, y: 0, lastStep: 0 };
export const input = { mx: 0, mz: 0, run: false, act: false, use: false, behind: false };
export const G = { isTouch, S, P, input, cfg, R: null, scene: null, camera: null, world: null, worlds: {}, Snd: null, Save: null, hooks: {} };
