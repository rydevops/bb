// Procedural art: every texture and sprite is painted on a canvas at load time.
import * as THREE from '../vendor/three.module.js';

export function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, { repeat, nearest = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, cols, size = 2) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(Math.random() * cols.length) | 0]; g.fillRect((Math.random() * w) | 0, (Math.random() * h) | 0, size, size); }
}

export function wallTex() {
  const c = cv(128, 128), g = c.getContext('2d');
  g.fillStyle = '#d9d2b8'; g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 500, ['#cfc7aa', '#e2dcc4', '#d3ccb0']);
  g.fillStyle = '#5b7f99'; g.fillRect(0, 70, 128, 8);       // stripe
  g.fillStyle = '#4a3a2c'; g.fillRect(0, 108, 128, 20);     // baseboard
  g.fillStyle = '#5c4a39'; g.fillRect(0, 108, 128, 4);
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 0, 2, 128); g.fillRect(126, 0, 2, 128);
  return toTex(c);
}
export function carpetTex() {
  const c = cv(64, 64), g = c.getContext('2d');
  g.fillStyle = '#c9a63a'; g.fillRect(0, 0, 64, 64);
  speckle(g, 64, 64, 700, ['#b8942c', '#d8b84d', '#a98724'], 1);
  return toTex(c);
}
export function tileTex() {
  const c = cv(64, 64), g = c.getContext('2d');
  g.fillStyle = '#9fb7c7'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#c8d6df'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  speckle(g, 64, 64, 120, ['#8aa4b5', '#d6e2e9'], 1);
  return toTex(c);
}
export function officeTex() {
  const c = cv(64, 64), g = c.getContext('2d');
  g.fillStyle = '#6d2f2f'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#7d3a3a'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  return toTex(c);
}
export function ceilingTex() {
  const c = cv(64, 64), g = c.getContext('2d');
  g.fillStyle = '#e8e4d6'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#bdb8a4'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
  speckle(g, 64, 64, 60, ['#d8d3c2'], 1);
  return toTex(c);
}
export function doorTex(label, locked) {
  const c = cv(128, 160), g = c.getContext('2d');
  g.fillStyle = locked ? '#5a1d1d' : '#8a5a2b'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = locked ? '#6d2626' : '#9c6a36'; g.fillRect(8, 8, 112, 144);
  g.fillStyle = locked ? '#3b1212' : '#6b4421'; g.fillRect(14, 14, 100, 60); g.fillRect(14, 84, 100, 62);
  if (!locked) { g.fillStyle = '#9fd3e8'; g.fillRect(34, 24, 60, 40); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(34, 24, 18, 40); }
  g.fillStyle = '#d9c25a'; g.beginPath(); g.arc(104, 92, 6, 0, 7); g.fill();
  g.fillStyle = '#f3efdf'; g.fillRect(44, 92, 40, 22);
  g.fillStyle = '#222'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText(label, 64, 108);
  return toTex(c, { nearest: false });
}
export function gateTex() {   // yellow swinging doors
  const c = cv(128, 160), g = c.getContext('2d');
  g.fillStyle = '#e8c020'; g.fillRect(0, 0, 128, 160); g.fillStyle = '#c9a010'; g.fillRect(0, 0, 6, 160); g.fillRect(122, 0, 6, 160); g.fillRect(61, 0, 6, 160);
  g.fillStyle = '#9fd3e8'; g.fillRect(14, 22, 38, 44); g.fillRect(76, 22, 38, 44); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(14, 22, 12, 44); g.fillRect(76, 22, 12, 44);
  g.fillStyle = '#8a6a08'; g.fillRect(0, 118, 128, 8); g.fillRect(0, 150, 128, 10);
  return toTex(c, { nearest: false });
}
export function exitTex() {
  const c = cv(128, 160), g = c.getContext('2d');
  g.fillStyle = '#555c63'; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#7b848c'; g.fillRect(8, 24, 112, 128);
  g.fillStyle = '#2a8a3a'; g.fillRect(24, 4, 80, 22);
  g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('EXIT', 64, 22);
  g.fillStyle = '#c33'; g.fillRect(48, 70, 32, 6);
  g.fillStyle = '#ddd'; g.fillRect(20, 100, 88, 6);
  return toTex(c, { nearest: false });
}
export function exitOpenTex() {
  const c = cv(128, 160), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#9fe0ff'); gr.addColorStop(1, '#b8f2a4');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#fff'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
  g.fillStyle = '#2a8a3a'; g.fillRect(24, 4, 80, 22); g.fillStyle = '#fff'; g.fillText('RUN!', 64, 22);
  return toTex(c, { nearest: false });
}
export function chalkboardTex(text) {
  const c = cv(256, 96), g = c.getContext('2d');
  g.fillStyle = '#6b4a2a'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#1f4a38'; g.fillRect(6, 6, 244, 84);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(6, 6, 244, 20);
  g.fillStyle = '#eef'; g.font = '28px "Comic Sans MS", cursive, sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 58);
  g.fillStyle = '#ddd'; g.fillRect(10, 86, 40, 4);
  return toTex(c, { nearest: false });
}
const POSTERS = [
  ['WELCOME!', '#3b82c4', "to JD's\nBasics School"],
  ['QUIET', '#c4553b', 'in the halls\nplease'],
  ['MATH IS', '#3bc47a', 'FUN!\n(allegedly)'],
  ['NO', '#c4a53b', 'running in\nthe halls'],
  ['READ', '#8a3bc4', 'a book\ntoday'],
  ['7 + 7', '#3b9ec4', '= ?\nask JD'],
  ['LUNCH', '#c43b8a', 'is at 12:00\n(never)'],
];
export function posterTex(i) {
  const [h, col, sub] = POSTERS[i % POSTERS.length];
  const c = cv(96, 128), g = c.getContext('2d');
  g.fillStyle = '#f4efe0'; g.fillRect(0, 0, 96, 128);
  g.fillStyle = col; g.fillRect(6, 6, 84, 116);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 20px sans-serif'; g.fillText(h, 48, 40);
  g.font = '12px sans-serif'; sub.split('\n').forEach((l, k) => g.fillText(l, 48, 70 + k * 16));
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(48, 105, 8, 0, 7); g.fill();
  return toTex(c, { nearest: false });
}
export function deskTex() {
  const c = cv(32, 32), g = c.getContext('2d');
  g.fillStyle = '#b9854c'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#a3703a'; g.fillRect(0, 0, 32, 3); g.fillRect(0, 29, 32, 3);
  speckle(g, 32, 32, 40, ['#946530'], 1);
  return toTex(c);
}
export function vendingTex() {
  const c = cv(96, 160), g = c.getContext('2d');
  g.fillStyle = '#c0392b'; g.fillRect(0, 0, 96, 160);
  g.fillStyle = '#111'; g.fillRect(8, 24, 80, 80);
  const cols = ['#4ad', '#fd4', '#6c6', '#e8a'];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { g.fillStyle = cols[(r + k) % 4]; g.fillRect(14 + k * 19, 30 + r * 18, 12, 14); }
  g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('BSODA', 48, 18);
  g.fillStyle = '#333'; g.fillRect(20, 114, 56, 8); g.fillStyle = '#999'; g.fillRect(36, 130, 24, 20);
  g.fillStyle = '#ffd400'; g.fillRect(70, 112, 14, 12);
  return toTex(c, { nearest: false });
}
export function notebookTex() {
  const c = cv(96, 128), g = c.getContext('2d');
  g.fillStyle = '#d63b3b'; g.fillRect(0, 0, 96, 128);
  g.fillStyle = '#a82424'; g.fillRect(0, 0, 10, 128);
  g.fillStyle = '#fff'; g.fillRect(22, 18, 62, 40);
  g.fillStyle = '#222'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('MATH', 53, 44);
  g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText('1+1=', 53, 95); g.fillText('?', 53, 115);
  return toTex(c, { nearest: false });
}

// ---------- item icons ----------
export function itemIcon(type) {
  const c = cv(64, 64), g = c.getContext('2d');
  g.lineWidth = 3; g.strokeStyle = '#222';
  const rr = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
  switch (type) {
    case 'zesty':
      rr(8, 22, 48, 22, '#8b4a1e'); rr(8, 22, 48, 8, '#e9b04a'); g.fillStyle = '#fff'; g.font = 'bold 10px sans-serif'; g.fillText('ZESTY', 14, 40); break;
    case 'bsoda':
      rr(20, 10, 24, 44, '#3b82e0'); rr(24, 4, 16, 8, '#ccc'); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.fillText('B', 28, 38); g.fillRect(22, 22, 20, 2); break;
    case 'scissors':
      g.strokeStyle = '#999'; g.lineWidth = 5; g.beginPath(); g.moveTo(16, 10); g.lineTo(44, 40); g.moveTo(48, 10); g.lineTo(20, 40); g.stroke();
      g.strokeStyle = '#e8a020'; g.lineWidth = 6; g.beginPath(); g.arc(18, 48, 7, 0, 7); g.arc(46, 48, 7, 0, 7); g.stroke(); break;
    case 'quarter':
      g.fillStyle = '#d9d9d9'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#666'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText('25', 32, 39); break;
    case 'keys':
      g.strokeStyle = '#c9a227'; g.lineWidth = 6; g.beginPath(); g.arc(20, 32, 11, 0, 7); g.stroke();
      g.fillStyle = '#c9a227'; g.fillRect(28, 29, 28, 6); g.fillRect(46, 33, 5, 10); g.fillRect(36, 33, 5, 8); break;
    case 'tape':
      rr(10, 18, 44, 30, '#444'); g.fillStyle = '#ddd'; g.beginPath(); g.arc(24, 33, 6, 0, 7); g.arc(40, 33, 6, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#e44'; g.fillRect(14, 22, 36, 5); g.fillStyle = '#fff'; g.font = 'bold 8px sans-serif'; g.fillText('JD', 52, 14); break;
    case 'nosquee':
      rr(22, 14, 20, 38, '#e8c020'); rr(26, 6, 12, 10, '#2a62c8'); g.fillStyle = '#c22'; g.font = 'bold 10px sans-serif'; g.fillText('WD', 22, 36); g.fillText('NO', 24, 46); break;
    case 'lock':
      g.strokeStyle = '#999'; g.lineWidth = 6; g.beginPath(); g.arc(32, 24, 11, Math.PI, 0); g.stroke();
      rr(16, 26, 32, 26, '#f0c814'); g.fillStyle = '#222'; g.beginPath(); g.arc(32, 36, 4, 0, 7); g.fill(); g.fillRect(30, 36, 4, 10); break;
    case 'boots':
      rr(14, 14, 16, 34, '#6b4a2a'); rr(14, 40, 34, 12, '#6b4a2a'); rr(14, 14, 16, 6, '#c9a227'); g.fillStyle = '#111'; g.fillRect(14, 48, 34, 4); break;
    case 'apple':
      g.fillStyle = '#d82a2a'; g.beginPath(); g.arc(25, 36, 14, 0, 7); g.arc(39, 36, 14, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#5a3a1a'; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 26); g.lineTo(34, 12); g.stroke();
      g.fillStyle = '#3a9a46'; g.beginPath(); g.ellipse(41, 16, 8, 4, -0.5, 0, 7); g.fill(); break;
    case 'present':
      rr(10, 24, 44, 30, '#e0407a'); g.fillStyle = '#ffe14a'; g.fillRect(29, 24, 6, 30); g.fillRect(10, 36, 44, 6);
      g.beginPath(); g.arc(24, 18, 7, 0, 7); g.arc(40, 18, 7, 0, 7); g.fill(); g.stroke(); break;
    case 'alarm':
      g.fillStyle = '#e04040'; g.beginPath(); g.arc(32, 36, 18, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 36, 13, 0, 7); g.fill();
      g.strokeStyle = '#222'; g.beginPath(); g.moveTo(32, 36); g.lineTo(32, 27); g.moveTo(32, 36); g.lineTo(39, 38); g.stroke();
      g.fillStyle = '#e8a020'; g.beginPath(); g.arc(18, 16, 6, 0, 7); g.arc(46, 16, 6, 0, 7); g.fill(); break;
  }
  return c;
}
export function itemTex(type) { return toTex(itemIcon(type), { nearest: false }); }

// ---------- characters (drawn as billboard sprites) ----------
function body(g, o) {
  const { cx = 128, skin, shirt, pants, shoes = '#222', head = 52, headY = 100, tie } = o;
  g.lineWidth = 5; g.strokeStyle = '#1a1a1a'; g.lineJoin = 'round';
  // legs
  g.fillStyle = pants; g.fillRect(cx - 34, 270, 30, 90); g.fillRect(cx + 4, 270, 30, 90);
  g.strokeRect(cx - 34, 270, 30, 90); g.strokeRect(cx + 4, 270, 30, 90);
  g.fillStyle = shoes; g.fillRect(cx - 40, 350, 38, 18); g.fillRect(cx + 2, 350, 38, 18);
  // torso
  g.fillStyle = shirt; g.fillRect(cx - 44, 160, 88, 120); g.strokeRect(cx - 44, 160, 88, 120);
  // arms
  g.fillRect(cx - 66, 165, 22, 90); g.strokeRect(cx - 66, 165, 22, 90);
  g.fillRect(cx + 44, 165, 22, 90); g.strokeRect(cx + 44, 165, 22, 90);
  g.fillStyle = skin; g.fillRect(cx - 66, 255, 22, 20); g.strokeRect(cx - 66, 255, 22, 20);
  g.fillRect(cx + 44, 255, 22, 20); g.strokeRect(cx + 44, 255, 22, 20);
  if (tie) { g.fillStyle = tie; g.beginPath(); g.moveTo(cx - 8, 162); g.lineTo(cx + 8, 162); g.lineTo(cx + 12, 230); g.lineTo(cx, 244); g.lineTo(cx - 12, 230); g.closePath(); g.fill(); g.stroke(); }
  // neck + head
  g.fillStyle = skin; g.fillRect(cx - 12, 148, 24, 18);
  g.beginPath(); g.ellipse(cx, headY, head, head * 1.12, 0, 0, 7); g.fill(); g.stroke();
}
function eyes(g, cx, y, { gap = 20, r = 11, angry = false, pupil = '#111', white = '#fff' }) {
  g.lineWidth = 3;
  [-1, 1].forEach((s) => {
    g.fillStyle = white; g.beginPath(); g.ellipse(cx + s * gap, y, r, r * 1.15, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = pupil; g.beginPath(); g.arc(cx + s * gap, y + 2, r * 0.42, 0, 7); g.fill();
    if (angry) { g.strokeStyle = '#111'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + s * (gap + 16), y - r - 8 + 2); g.lineTo(cx + s * (gap - 14), y - r + 8); g.stroke(); g.lineWidth = 3; }
  });
}
function mouth(g, cx, y, mood) {
  g.strokeStyle = '#111'; g.lineWidth = 4;
  if (mood === 'happy') { g.beginPath(); g.arc(cx, y - 6, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
  else if (mood === 'angry') {
    g.fillStyle = '#400'; g.beginPath(); g.ellipse(cx, y + 6, 24, 18, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(cx - 18, y - 8, 36, 7);
  } else if (mood === 'o') { g.fillStyle = '#400'; g.beginPath(); g.ellipse(cx, y + 6, 10, 14, 0, 0, 7); g.fill(); g.stroke(); }
  else { g.beginPath(); g.moveTo(cx - 14, y); g.lineTo(cx + 14, y); g.stroke(); }
}

export function drawJD(mood = 'happy', slap = false, w = 256, h = 384) {
  const c = cv(256, 384), g = c.getContext('2d');
  const cx = 128;
  body(g, { skin: '#f0bd8a', shirt: '#3a9a46', pants: '#5a3a22', tie: '#e2402a', head: 56, headY: 100 });
  // bald shine + wisp of ear
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(cx - 20, 60, 16, 8, -0.5, 0, 7); g.fill();
  g.fillStyle = '#f0bd8a'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
  [-1, 1].forEach((s) => { g.beginPath(); g.ellipse(cx + s * 58, 104, 9, 16, 0, 0, 7); g.fill(); g.stroke(); });
  const angry = mood === 'angry' || mood === 'scream';
  eyes(g, cx, 98, { gap: 22, r: 13, angry });
  mouth(g, cx, 142, angry ? 'angry' : (mood === 'o' ? 'o' : 'happy'));
  // ruler
  g.save(); g.translate(cx + 70, 255); g.rotate(slap ? -1.25 : -0.2);
  g.fillStyle = '#e8c04a'; g.fillRect(-6, -130, 14, 140); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(-6, -130, 14, 140);
  g.fillStyle = '#222'; for (let i = 0; i < 12; i++) g.fillRect(-6, -126 + i * 11, i % 2 ? 6 : 10, 2);
  g.restore();
  return c;
}
export function drawPrincipal() {
  const c = cv(256, 384), g = c.getContext('2d');
  body(g, { skin: '#e7b58a', shirt: '#26324a', pants: '#1b2236', tie: '#b02a2a', head: 52, headY: 100 });
  g.fillStyle = '#6c6c6c'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(128, 62, 50, 22, 0, Math.PI, 0); g.fill(); g.stroke();   // hair
  eyes(g, 128, 100, { gap: 20, r: 9, angry: true });
  g.fillStyle = '#6c6c6c'; g.fillRect(100, 128, 56, 12); g.strokeRect(100, 128, 56, 12); // moustache
  mouth(g, 128, 150, 'flat');
  g.fillStyle = '#d4af37'; g.fillRect(186, 232, 14, 24); // whistle
  return c;
}
export function drawBully() {
  const c = cv(256, 384), g = c.getContext('2d');
  body(g, { skin: '#d9a77a', shirt: '#f2b630', pants: '#2d4f9c', head: 48, headY: 105 });
  g.fillStyle = '#6a3b1a'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(128, 70, 52, 28, 0, Math.PI, 0); g.fill(); g.stroke();
  g.fillStyle = '#111'; g.fillRect(84, 95, 88, 16); // shades
  g.fillStyle = '#444'; g.fillRect(90, 98, 30, 8); g.fillRect(136, 98, 30, 8);
  g.strokeStyle = '#111'; g.lineWidth = 5; g.beginPath(); g.moveTo(104, 142); g.quadraticCurveTo(128, 128, 152, 142); g.stroke();
  return c;
}
export function drawPlaytime() {
  const c = cv(256, 384), g = c.getContext('2d');
  const cx = 128;
  // small girl: shorter body; draw scaled
  g.save(); g.translate(0, 70);
  body(g, { skin: '#f3cba5', shirt: '#e85aa5', pants: '#6a3fb0', shoes: '#fff', head: 50, headY: 100 });
  g.restore();
  g.fillStyle = '#a0622c'; g.strokeStyle = '#1a1a1a'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(cx, 130, 56, 40, 0, Math.PI, 0); g.fill(); g.stroke();
  [-1, 1].forEach((s) => { g.beginPath(); g.arc(cx + s * 62, 168, 20, 0, 7); g.fill(); g.stroke(); });
  g.fillStyle = '#e85aa5'; [-1, 1].forEach((s) => { g.beginPath(); g.arc(cx + s * 56, 142, 9, 0, 7); g.fill(); });
  eyes(g, cx, 178, { gap: 20, r: 10 });
  mouth(g, cx, 218, 'happy');
  // rope
  g.strokeStyle = '#d4a017'; g.lineWidth = 5; g.beginPath(); g.moveTo(62, 330); g.quadraticCurveTo(128, 410, 194, 330); g.stroke();
  return c;
}
export function drawSweep() {
  const c = cv(256, 384), g = c.getContext('2d');
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 5;
  g.fillStyle = '#9a6a3a'; g.fillRect(122, 20, 14, 280); g.strokeRect(122, 20, 14, 280); // handle
  g.fillStyle = '#e1c15a'; g.beginPath(); g.moveTo(40, 300); g.lineTo(220, 300); g.lineTo(240, 372); g.lineTo(20, 372); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#a08430'; g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(40 + i * 15, 305); g.lineTo(30 + i * 17, 368); g.stroke(); }
  // googly face on broom head
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 3;
  [-1, 1].forEach((s) => { g.beginPath(); g.arc(130 + s * 28, 335, 14, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#111'; g.beginPath(); g.arc(130 + s * 28, 338, 6, 0, 7); g.fill(); g.fillStyle = '#fff'; });
  return c;
}
export function spriteTex(canvas) { return toTex(canvas, { nearest: false }); }
export function makeSprite(canvas, height) {
  const mat = new THREE.SpriteMaterial({ map: spriteTex(canvas), transparent: true, fog: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(height * (canvas.width / canvas.height), height, 1);
  s.center.set(0.5, 0);
  return s;
}


// ---------- extra characters (original drawings) ----------
export function drawFirstPrize() {
  const c = cv(256, 384), g = c.getContext('2d'); g.lineWidth = 5; g.strokeStyle = '#1a1a1a'; g.lineJoin = 'round';
  g.fillStyle = '#c9ccd2'; g.fillRect(70, 180, 116, 150); g.strokeRect(70, 180, 116, 150);       // body
  g.fillStyle = '#e8c020'; g.fillRect(90, 330, 20, 40); g.fillRect(146, 330, 20, 40); g.strokeRect(90, 330, 20, 40); g.strokeRect(146, 330, 20, 40);
  g.fillStyle = '#d63b3b'; g.fillRect(100, 220, 56, 60); g.strokeRect(100, 220, 56, 60);
  g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('1', 128, 268);
  g.fillStyle = '#c9ccd2'; g.fillRect(40, 190, 30, 100); g.fillRect(186, 190, 30, 100); g.strokeRect(40, 190, 30, 100); g.strokeRect(186, 190, 30, 100);
  g.fillStyle = '#d9dce2'; g.beginPath(); g.roundRect(60, 60, 136, 120, 18); g.fill(); g.stroke();        // head
  g.fillStyle = '#222'; g.fillRect(78, 90, 100, 36);
  g.fillStyle = '#4bf'; g.beginPath(); g.arc(104, 108, 11, 0, 7); g.arc(152, 108, 11, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.moveTo(98, 150); g.lineTo(158, 150); g.stroke();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 60); g.lineTo(128, 30); g.stroke();
  g.fillStyle = '#d63b3b'; g.beginPath(); g.arc(128, 26, 9, 0, 7); g.fill();
  return c;
}
export function drawArts() {
  const c = cv(256, 384), g = c.getContext('2d'); g.lineWidth = 5; g.strokeStyle = '#1a1a1a'; g.lineJoin = 'round';
  g.fillStyle = '#b86a3c'; g.beginPath(); g.moveTo(88, 360); g.lineTo(92, 130); g.quadraticCurveTo(128, 70, 164, 130); g.lineTo(168, 360); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#e0a63c'; g.fillRect(90, 270, 78, 22); g.fillRect(90, 320, 78, 22);          // sock stripes
  g.fillStyle = '#fff'; [-1, 1].forEach((sg) => { g.beginPath(); g.arc(128 + sg * 22, 140, 15, 0, 7); g.fill(); g.stroke(); });
  g.fillStyle = '#111'; g.beginPath(); g.arc(112, 144, 6, 0, 7); g.arc(150, 138, 6, 0, 7); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(106, 190); g.quadraticCurveTo(128, 178, 150, 192); g.stroke();
  g.fillStyle = '#d63b3b'; g.beginPath(); g.arc(128, 80, 16, 0, 7); g.fill();              // pom-pom hat
  return c;
}
export function drawNull() {   // dithered, high-contrast cut-out of a figure in a red tee and jeans (original, generated)
  const c = cv(256, 384), g = c.getContext('2d');
  g.fillStyle = '#d8a88a'; g.beginPath(); g.ellipse(128, 70, 40, 50, 0, 0, 7); g.fill();       // head
  g.fillStyle = '#111'; g.fillRect(96, 54, 20, 10); g.fillRect(140, 54, 20, 10);               // hollow eyes
  g.fillStyle = '#400'; g.fillRect(112, 96, 32, 6);
  g.fillStyle = '#c4161c'; g.fillRect(76, 120, 104, 120); g.fillRect(44, 124, 34, 100); g.fillRect(178, 124, 34, 100);   // red t-shirt
  g.fillStyle = '#d8a88a'; g.fillRect(44, 224, 34, 28); g.fillRect(178, 224, 34, 28);
  g.fillStyle = '#2d4f9c'; g.fillRect(80, 240, 46, 130); g.fillRect(130, 240, 46, 130);          // jeans
  g.fillStyle = '#111'; g.fillRect(78, 366, 50, 14); g.fillRect(128, 366, 50, 14);
  const d = g.getImageData(0, 0, 256, 384), px = d.data;                                      // ordered dither + specks
  for (let y = 0; y < 384; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4; if (px[i + 3] === 0) continue;
    const th = ((x & 3) * 4 + (y & 3) * 3) % 16 / 16 - 0.5;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] / 255 * 3 + th) / 3 * 255;
  }
  g.putImageData(d, 0, 0);
  g.fillStyle = '#888'; for (let i = 0; i < 160; i++) g.fillRect((Math.random() * 256) | 0, (Math.random() * 384) | 0, 2, 1 + (Math.random() * 6 | 0));
  return c;
}
export function drawLoon() {
  const c = cv(256, 384), g = c.getContext('2d'); g.lineWidth = 5; g.strokeStyle = '#300';
  g.fillStyle = '#e02020'; g.beginPath(); g.ellipse(128, 150, 86, 110, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#e02020'; g.beginPath(); g.moveTo(118, 258); g.lineTo(138, 258); g.lineTo(128, 274); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#ddd'; g.lineWidth = 3; g.beginPath(); g.moveTo(128, 274); g.quadraticCurveTo(110, 320, 132, 370); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(98, 130, 18, 0, 7); g.arc(158, 130, 18, 0, 7); g.fill();
  g.fillStyle = '#000'; g.beginPath(); g.arc(98, 134, 8, 0, 7); g.arc(158, 134, 8, 0, 7); g.fill();
  g.fillStyle = '#400'; g.beginPath(); g.ellipse(128, 190, 28, 14, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(88, 80, 18, 28, -0.5, 0, 7); g.fill();
  return c;
}
export function drawBalloon(color, label) {
  const c = cv(128, 192), g = c.getContext('2d'); g.lineWidth = 4; g.strokeStyle = '#222';
  g.fillStyle = color; g.beginPath(); g.ellipse(64, 70, 50, 62, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = color; g.beginPath(); g.moveTo(56, 130); g.lineTo(72, 130); g.lineTo(64, 142); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = '#999'; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 142); g.quadraticCurveTo(52, 165, 66, 190); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(44, 40, 10, 18, -0.5, 0, 7); g.fill();
  if (label != null) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 5; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.strokeText(String(label), 64, 84); g.fillText(String(label), 64, 84); }
  return c;
}
export function drawThrowable(kind) {
  const c = cv(128, 128), g = c.getContext('2d'); g.lineWidth = 4; g.strokeStyle = '#1a1a1a'; g.lineJoin = 'round';
  if (kind === 'chair') { g.fillStyle = '#b9854c'; g.fillRect(34, 20, 12, 60); g.fillRect(34, 60, 60, 12); g.fillRect(34, 72, 10, 40); g.fillRect(84, 72, 10, 40); g.strokeRect(34, 20, 12, 60); g.strokeRect(34, 60, 60, 12); }
  else if (kind === 'desk') { g.fillStyle = '#c4935a'; g.fillRect(16, 40, 96, 16); g.fillRect(24, 56, 10, 56); g.fillRect(94, 56, 10, 56); g.strokeRect(16, 40, 96, 16); }
  else if (kind === 'tree') { g.fillStyle = '#9a5a2a'; g.fillRect(44, 70, 40, 44); g.strokeRect(44, 70, 40, 44); g.fillStyle = '#3a9a46'; g.beginPath(); g.arc(64, 48, 30, 0, 7); g.fill(); g.stroke(); }
  else { g.fillStyle = '#ffd400'; g.beginPath(); g.moveTo(30, 90); g.quadraticCurveTo(64, 120, 100, 40); g.lineTo(88, 34); g.quadraticCurveTo(70, 90, 36, 76); g.closePath(); g.fill(); g.stroke(); }
  return c;
}
export function drawMachine(text) {   // Demo-style Math Machine panel
  const c = cv(256, 192), g = c.getContext('2d'); g.fillStyle = '#3a5a7a'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#111'; g.fillRect(12, 12, 232, 96); g.fillStyle = '#6f6'; g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.fillText(text, 128, 70);
  g.fillStyle = '#e8c020'; g.fillRect(40, 126, 176, 40); g.fillStyle = '#222'; g.font = 'bold 18px sans-serif'; g.fillText('MATH MACHINE', 128, 153);
  return c;
}
export function withPartyHat(src, x = 128, y = 40) {
  const c = cv(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0);
  g.fillStyle = '#ff4fa3'; g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 28, y + 20); g.lineTo(x, y - 46); g.lineTo(x + 28, y + 20); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(x, y - 46, 7, 0, 7); g.fill();
  return c;
}
export function drawCake(candlesLit) {
  const c = cv(256, 220), g = c.getContext('2d'); g.lineWidth = 4; g.strokeStyle = '#222';
  g.fillStyle = '#f4a7c8'; g.fillRect(30, 110, 196, 90); g.strokeRect(30, 110, 196, 90);
  g.fillStyle = '#fff'; g.fillRect(30, 110, 196, 22); g.strokeRect(30, 110, 196, 22);
  for (let i = 0; i < 5; i++) { const x = 56 + i * 36; g.fillStyle = ['#4bf', '#fd4', '#6c6', '#e8a', '#f84'][i]; g.fillRect(x, 70, 10, 40); g.strokeRect(x, 70, 10, 40);
    if (i < candlesLit) { g.fillStyle = '#ffd24a'; g.beginPath(); g.ellipse(x + 5, 58, 7, 13, 0, 0, 7); g.fill(); g.fillStyle = '#f84'; g.beginPath(); g.ellipse(x + 5, 62, 3, 6, 0, 0, 7); g.fill(); } }
  return c;
}

// ---------- JD: a deliberately crude low-poly 3D model ----------
export function makeJD() {
  const mat = (col) => new THREE.MeshBasicMaterial({ color: col });
  const face = (mood) => {
    const c = cv(128, 128), g = c.getContext('2d'); g.fillStyle = '#f0bd8a'; g.fillRect(0, 0, 128, 128);
    const angry = mood === 'angry';
    [-1, 1].forEach((sg) => { g.fillStyle = '#fff'; g.fillRect(64 + sg * 26 - 13, 38, 26, 30); g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(64 + sg * 26 - 13, 38, 26, 30);
      g.fillStyle = '#111'; g.fillRect(64 + sg * 26 - 5, 48, 10, 12);
      if (angry) { g.lineWidth = 7; g.beginPath(); g.moveTo(64 + sg * 44, 30); g.lineTo(64 + sg * 8, 44); g.stroke(); } });
    g.fillStyle = angry ? '#500' : '#a33'; g.fillRect(36, 86, 56, angry ? 30 : 14); g.fillStyle = '#fff'; g.fillRect(40, 86, 48, 8);
    return toTex(c);
  };
  const faces = { happy: face('happy'), angry: face('angry') };
  const group = new THREE.Group();
  const skin = mat(0xf0bd8a);
  const headMats = [skin, skin, skin, skin, new THREE.MeshBasicMaterial({ map: faces.happy }), skin];  // +z is the face
  const head = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3, 2.8), headMats); head.position.y = 7.3; group.add(head);
  [-1, 1].forEach((sg) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 0.6), skin); e.position.set(sg * 1.5, 7.3, 0); group.add(e); });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 2), mat(0x3a9a46)); torso.position.y = 4.1; group.add(torso);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.1), mat(0xe2402a)); tie.position.set(0, 4.3, 1.06); group.add(tie);
  const legs = [-1, 1].map((sg) => { const l = new THREE.Mesh(new THREE.BoxGeometry(1.3, 3, 1.4), mat(0x5a3a22)); l.position.set(sg * 0.85, 1.5, 0); group.add(l); return l; });
  const mkArm = (sg) => { const pivot = new THREE.Group(); pivot.position.set(sg * 2.2, 5.6, 0); const a = new THREE.Mesh(new THREE.BoxGeometry(1, 3.2, 1), mat(0x3a9a46)); a.position.y = -1.5; pivot.add(a); group.add(pivot); return pivot; };
  const armL = mkArm(-1), armR = mkArm(1);
  const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.8), mat(0xe8c04a)); ruler.position.set(0, -3.6, 1); armR.add(ruler);
  armR.rotation.x = -1.2;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 5), mat(0xff4fa3)); hat.position.y = 9.9; hat.visible = false; group.add(hat);
  group.userData = { hat, faces, head, armR, armL, legs, setMood(m) { headMats[4].map = faces[m]; headMats[4].needsUpdate = true; }, slap() { this.slapT = 0.18; } };
  return group;
}

export function drawPartyHatSprite() {
  const c = cv(96, 112), g = c.getContext('2d'); g.fillStyle = '#ff4fa3'; g.strokeStyle = '#222'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(10, 104); g.lineTo(48, 14); g.lineTo(86, 104); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ffe14a'; g.fillRect(24, 66, 48, 10); g.beginPath(); g.arc(48, 12, 9, 0, 7); g.fill(); g.stroke();
  return c;
}
