import * as THREE from '../vendor/three.module.js';
import { W, H, CELL, WALLH, buildMap, cellCenter, toCell } from './map.js';
import * as A from './art.js';
import * as Snd from './audio.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;

const ITEM_NAMES = { zesty: 'Zesty Bar', bsoda: 'BSODA', scissors: 'Safety Scissors', quarter: 'Quarter', keys: "Principal's Keys", alarm: 'Alarm Clock' };
const TOTAL_NB = 7;

// ------------------------------------------------------------------ renderer
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x86c5ee);
scene.fog = new THREE.Fog(0x1a2224, 50, 230);
const camera = new THREE.PerspectiveCamera(72, 1, 0.3, 400);
camera.rotation.order = 'YXZ';
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.fov = w / h < 1 ? 85 : 72; camera.updateProjectionMatrix();
  $('rotate').classList.toggle('hidden', !(isTouch && h > w && S.mode !== 'title'));
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ------------------------------------------------------------------ world
const { grid, rooms, office } = buildMap();
const cellAt = (cx, cz) => (cx < 0 || cz < 0 || cx >= W || cz >= H) ? '#' : grid[cz][cx];
const isHall = (cx, cz) => cellAt(cx, cz) === '.';
const solids = [];       // extra AABBs (desks, machines)
const doors = [];
const posters = [];
let exitMeshes = [];

const S = {
  mode: 'title', notebooks: 0, stamina: 100, items: [null, null, null], sel: 0, exitsOpen: false,
  detention: 0, time: 0, anger: 0, frozen: false, map: false, sens: 1, lastNoise: null,
};
const P = { x: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vz: 0, running: false, bob: 0, r: 1.5 };

const walls = [];
for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
  if (grid[z][x] !== '#') continue;
  const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => cellAt(x + dx, z + dz) !== '#' || (x + dx < 0 || x + dx >= W || z + dz < 0 || z + dz >= H) && false);
  if (n) walls.push([x, z]);
}
{
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALLH, CELL), new THREE.MeshBasicMaterial({ map: A.wallTex() }), walls.length);
  const d = new THREE.Object3D();
  walls.forEach(([x, z], i) => { d.position.set(cellCenter(x), WALLH / 2, cellCenter(z)); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
  scene.add(m);
  // floors
  const plane = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
  const mk = (tex, test) => {
    const list = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (test(grid[z][x])) list.push([x, z]);
    const im = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ map: tex }), list.length);
    list.forEach(([x, z], i) => { d.position.set(cellCenter(x), 0, cellCenter(z)); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    scene.add(im);
  };
  mk(A.carpetTex(), (c) => c === '.' || c === 'D' || c === 'E');
  mk(A.tileTex(), (c) => c === 'r');
  mk(A.officeTex(), (c) => c === 'o' || c === 'L');
  const ct = A.ceilingTex(); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(W, H);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: ct }));
  ceil.position.set(W * CELL / 2, WALLH, H * CELL / 2); scene.add(ceil);
  // ground outside (so exits look like outdoors)
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4f9a46, fog: false }));
  gr.position.set(W * CELL / 2, -0.05, H * CELL / 2); scene.add(gr);
}

// doors
{
  let n = 100;
  const doorTexCache = {};
  const dt = (label, locked) => doorTexCache[label + locked] || (doorTexCache[label + locked] = A.doorTex(label, locked));
  const roomAtDoor = (x, z) => [...rooms, office].find((r) => r.door[0] === x && r.door[1] === z);
  const exitClosed = A.exitTex();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = grid[z][x];
    if (c !== 'D' && c !== 'L' && c !== 'E') continue;
    const alongX = cellAt(x - 1, z) === '#' && cellAt(x + 1, z) === '#';
    const geo = alongX ? new THREE.BoxGeometry(CELL, WALLH, 1.2) : new THREE.BoxGeometry(1.2, WALLH, CELL);
    let mat;
    if (c === 'E') mat = new THREE.MeshBasicMaterial({ map: exitClosed });
    else {
      const r = roomAtDoor(x, z);
      mat = new THREE.MeshBasicMaterial({ map: c === 'L' ? dt('OFFICE', true) : dt(String(n++), false) });
      if (c === 'D') mat.map.repeat.set(1, 1);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cellCenter(x), WALLH / 2, cellCenter(z));
    scene.add(mesh);
    const door = { cx: x, cz: z, mesh, alongX, openAmt: 0, want: false, timer: 0, locked: c === 'L', exit: c === 'E', base: mesh.position.clone() };
    doors.push(door);
    if (c === 'E') exitMeshes.push(door);
  }
}
const doorAt = (cx, cz) => doors.find((d) => d.cx === cx && d.cz === cz);
const doorGrid = new Map(doors.map((d) => [d.cx + ',' + d.cz, d]));

// posters
{
  let k = 0;
  const texes = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (grid[z][x] !== '#') continue;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      if (!isHall(x + dx, z + dz) || Math.random() > 0.2) return;
      // keep clear of doors
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => 'DLE'.includes(cellAt(x + a, z + b)))) return;
      const i = k++ % 7;
      const t = texes[i] || (texes[i] = A.posterTex(i));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 5.3), new THREE.MeshBasicMaterial({ map: t }));
      p.position.set(cellCenter(x) + dx * (CELL / 2 + 0.05), 5.2, cellCenter(z) + dz * (CELL / 2 + 0.05));
      p.rotation.y = Math.atan2(dx, dz);
      scene.add(p);
    });
  }
}

// classroom furniture + chalkboards + notebook desks
const deskMat = new THREE.MeshBasicMaterial({ map: A.deskTex() });
const roomInfo = [];
function addSolidBox(x, z, w, d, h, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, h / 2, z); scene.add(m);
  solids.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
}
const boards = ['2 + 2 = ?', '4 + 3', 'a² + b²', '10 − 7', 'HOMEWORK!', '5 + 5 = ?', 'π ≈ 3.14', '9 − 3'];
rooms.forEach((r, i) => {
  const doorNorth = r.door[1] < r.z0;
  const farZ = doorNorth ? (r.z1 + 1) * CELL : r.z0 * CELL;
  const sgn = doorNorth ? -1 : 1;                 // direction from far wall into room
  const cx = (r.x0 + r.x1 + 1) * CELL / 2;
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: A.chalkboardTex(boards[i % boards.length]) }));
  bd.position.set(cx, 5.3, farZ + sgn * 0.06); bd.rotation.y = doorNorth ? Math.PI : 0; scene.add(bd);
  addSolidBox(cx, farZ + sgn * 2.2, 8, 3, 3.2, deskMat);   // teacher desk
  const rowsZ = [];
  const nRows = r.z1 - r.z0 + 1;
  for (let k = 2; k < nRows; k += 2) rowsZ.push(farZ + sgn * (k - 0.5) * CELL);
  rowsZ.forEach((z) => { addSolidBox((r.x0 + 0.5) * CELL, z, 3.4, 3, 2.6, deskMat); addSolidBox((r.x1 + 0.5) * CELL, z, 3.4, 3, 2.6, deskMat); });
  roomInfo.push({ r, nbPos: new THREE.Vector3(cx, 5.2, farZ + sgn * 2.2) });
});
// office desk
{ const r = office; addSolidBox((r.x0 + r.x1 + 1) * CELL / 2, (r.z1 + 1) * CELL - 3, 10, 3.5, 3.2, deskMat); }
// vending machines
const vending = [];
{
  const tex = A.vendingTex();
  [[15, 7.5, 1], [15, 17.5, -1]].forEach(([cx, cz, face]) => {
    const x = (cx + 0.5) * CELL, z = cz * CELL + (face === 1 ? 0 : 0);
    const zz = face === 1 ? 7 * CELL + 1.6 : 18 * CELL - 1.6;
    const mats = [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshBasicMaterial({ color: 0xa8281e }));
    mats[face === 1 ? 4 : 5] = new THREE.MeshBasicMaterial({ map: tex });
    const m = new THREE.Mesh(new THREE.BoxGeometry(5, 7.5, 3), mats);
    m.position.set(x, 3.75, zz); scene.add(m);
    solids.push({ x0: x - 2.5, x1: x + 2.5, z0: zz - 1.5, z1: zz + 1.5 });
    vending.push({ x, z: zz + face * 3, mesh: m });
  });
}

// ------------------------------------------------------------------ collision
function solidCell(cx, cz) {
  const c = cellAt(cx, cz);
  if (c === '#') return true;
  if (c === 'D' || c === 'L') { const d = doorGrid.get(cx + ',' + cz); return d.openAmt < 0.7; }
  if (c === 'E') return !S.exitsOpen;
  return false;
}
function resolve(p, r) {
  for (let it = 0; it < 2; it++) {
    const cx = toCell(p.x), cz = toCell(p.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!solidCell(x, z)) continue;
      pushOut(p, r, x * CELL, z * CELL, (x + 1) * CELL, (z + 1) * CELL);
    }
    for (const s of solids) {
      if (Math.abs(p.x - (s.x0 + s.x1) / 2) > 12 || Math.abs(p.z - (s.z0 + s.z1) / 2) > 12) continue;
      pushOut(p, r, s.x0, s.z0, s.x1, s.z1);
    }
  }
}
function pushOut(p, r, x0, z0, x1, z1) {
  const qx = clamp(p.x, x0, x1), qz = clamp(p.z, z0, z1);
  let dx = p.x - qx, dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 < 1e-6) {  // centre inside box: push along shortest axis
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r;
    return;
  }
  const d = Math.sqrt(d2);
  p.x = qx + dx / d * r; p.z = qz + dz / d * r;
}
// line of sight on the grid (closed doors and walls block)
function blocksSight(cx, cz) {
  const c = cellAt(cx, cz);
  if (c === '#') return true;
  if (c === 'D' || c === 'L') return doorGrid.get(cx + ',' + cz).openAmt < 0.5;
  return c === 'E' ? false : false;
}
function los(x0, z0, x1, z1, width = 0) {
  const test = (ax, az, bx, bz) => {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 1.5);
    for (let i = 1; i < n; i++) { const t = i / n; if (blocksSight(toCell(ax + dx * t), toCell(az + dz * t))) return false; }
    return true;
  };
  if (!test(x0, z0, x1, z1)) return false;
  if (width > 0) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz) || 1, nx = -dz / d * width, nz = dx / d * width;
    return test(x0 + nx, z0 + nz, x1 + nx, z1 + nz) && test(x0 - nx, z0 - nz, x1 - nx, z1 - nz);
  }
  return true;
}
// BFS path
const passFor = (cx, cz, locked) => { const c = cellAt(cx, cz); return c !== '#' && c !== 'E' && (c !== 'L' || locked); };
function nextStep(sx, sz, tx, tz, locked) {
  if (sx === tx && sz === tz) return null;
  const key = (x, z) => z * W + x;
  const prev = new Int32Array(W * H).fill(-1);
  const q = [key(sx, sz)]; prev[q[0]] = q[0];
  const target = key(tx, tz);
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === target) break;
    const x = k % W, z = (k / W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const nk = key(nx, nz);
      if (prev[nk] !== -1 || !passFor(nx, nz, locked)) continue;
      prev[nk] = k; q.push(nk);
    }
  }
  if (prev[target] === -1) return null;
  let k = target;
  while (prev[k] !== key(sx, sz)) k = prev[k];
  return { x: k % W, z: (k / W) | 0 };
}
function followPath(e, goalX, goalZ, speed, dt, locked = false) {
  e.pathT = (e.pathT || 0) - dt;
  const cx = toCell(e.x), cz = toCell(e.z), gx = toCell(goalX), gz = toCell(goalZ);
  if (e.pathT <= 0 || e.pgx !== gx || e.pgz !== gz) {
    e.pathT = 0.3; e.pgx = gx; e.pgz = gz;
    const s = nextStep(cx, cz, gx, gz, locked);
    e.nx = s ? cellCenter(s.x) : goalX; e.nz = s ? cellCenter(s.z) : goalZ;
  }
  const dx = e.nx - e.x, dz = e.nz - e.z, d = Math.hypot(dx, dz);
  if (d > 0.01) { const st = Math.min(d, speed * dt); e.x += dx / d * st; e.z += dz / d * st; e.dirx = dx / d; e.dirz = dz / d; }
  return Math.hypot(goalX - e.x, goalZ - e.z);
}
const hallCells = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (grid[z][x] === '.') hallCells.push([x, z]);
const randHall = () => { const [x, z] = pick(hallCells); return { x: cellCenter(x), z: cellCenter(z) }; };

// ------------------------------------------------------------------ characters
const baldiTex = { happy: A.spriteTex(A.drawBaldi('happy')), angry: A.spriteTex(A.drawBaldi('angry')), slap: A.spriteTex(A.drawBaldi('angry', true)), idleSlap: A.spriteTex(A.drawBaldi('happy', true)) };
function mkSprite(canvasOrTex, h) {
  const tex = canvasOrTex.isTexture ? canvasOrTex : A.spriteTex(canvasOrTex);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(h * 256 / 384, h, 1); s.center.set(0.5, 0); scene.add(s); return s;
}
const baldi = { x: 0, z: 0, active: false, sprite: mkSprite(baldiTex.happy, 8), sinceSlap: 0, slapCount: 0, stun: 0, heard: null, heardT: 0, track: 0, tgt: null, angry: 0, caught: false };
const principal = { x: 0, z: 0, sprite: mkSprite(A.drawPrincipal(), 8.2), goal: null, stun: 0, warn: 0, cool: 0 };
const bully = { x: 0, z: 0, sprite: mkSprite(A.drawBully(), 6.5), state: 'wait', timer: 0, goal: null };
const playtime = { x: 0, z: 0, sprite: mkSprite(A.drawPlaytime(), 7), state: 'wander', timer: 8, goal: null };
const sweep = { x: 0, z: 0, sprite: mkSprite(A.drawSweep(), 9), active: false, dx: 0, dz: 0, timer: 40, tx: 0, tz: 0 };
sweep.sprite.visible = false;

// ------------------------------------------------------------------ pickups, notebooks
const notebooksList = [];
const pickups = [];
let alarm = null;
const puffs = [];
const nbMat = new THREE.MeshBasicMaterial({ map: A.notebookTex(), side: THREE.DoubleSide });
function setupWorld() {
  notebooksList.forEach((n) => scene.remove(n.mesh)); notebooksList.length = 0;
  pickups.forEach((n) => scene.remove(n.sprite)); pickups.length = 0;
  if (alarm) { scene.remove(alarm.sprite); alarm = null; Snd.sfx.alarmStop(); }
  puffs.forEach((p) => scene.remove(p.sprite)); puffs.length = 0;
  // notebooks in 7 random classrooms
  const chosen = [...roomInfo].sort(() => Math.random() - 0.5).slice(0, TOTAL_NB);
  chosen.forEach((ri_, i) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), nbMat);
    mesh.position.copy(ri_.nbPos); scene.add(mesh);
    notebooksList.push({ mesh, room: ri_.r, taken: false, x: ri_.nbPos.x, z: ri_.nbPos.z });
  });
  // items
  const spawn = [['keys', 1], ['quarter', 3], ['zesty', 2], ['bsoda', 2], ['alarm', 1], ['scissors', 1]];
  const spots = [];
  rooms.forEach((r) => { for (let k = 0; k < 3; k++) spots.push({ x: (rnd(r.x0 + 1, r.x1 - 0.2) + 0.5) * CELL, z: (rnd(r.z0 + 0.8, r.z1 + 0.2)) * CELL }); });
  hallCells.forEach(() => {}); for (let k = 0; k < 14; k++) { const h = randHall(); spots.push({ x: h.x + rnd(-2, 2), z: h.z + rnd(-2, 2) }); }
  spots.sort(() => Math.random() - 0.5);
  const okSpot = (s) => !solids.some((o) => s.x > o.x0 - 2 && s.x < o.x1 + 2 && s.z > o.z0 - 2 && s.z < o.z1 + 2) && !pickups.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 8) && !notebooksList.some((n) => Math.hypot(n.x - s.x, n.z - s.z) < 5);
  spawn.forEach(([type, n]) => { for (let k = 0; k < n; k++) { const s = spots.find(okSpot); if (s) { spots.splice(spots.indexOf(s), 1); addPickup(type, s.x, s.z); } } });
  // principal's office stash
  ['bsoda', 'zesty', 'quarter'].forEach((t, k) => addPickup(t, (office.x0 + 2 + k * 2) * CELL + 4, (office.z0 + 0.8) * CELL));
}
function addPickup(type, x, z) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex(type), transparent: true }));
  s.scale.set(3, 3, 1); s.position.set(x, 2.2, z); scene.add(s);
  pickups.push({ type, x, z, sprite: s, ph: Math.random() * 6 });
}

// ------------------------------------------------------------------ HUD helpers
const hud = { prompt: $('prompt'), sub: $('subtitle'), nb: $('nbCount'), sta: $('staBar'), slots: $('slots'), flash: $('flash') };
let subTimer = 0;
function say(html, ms = 3200, voice) {
  hud.sub.innerHTML = html; hud.sub.style.display = 'block'; subTimer = ms / 1000;
  if (voice) Snd.speak(voice);
}
function setPrompt(t) { if (t) { hud.prompt.textContent = t; hud.prompt.style.display = 'block'; } else hud.prompt.style.display = 'none'; }
function renderSlots() {
  hud.slots.innerHTML = '';
  S.items.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'slot' + (i === S.sel ? ' sel' : '');
    if (it) { const c = A.itemIcon(it); d.appendChild(c); const t = document.createElement('span'); t.textContent = ITEM_NAMES[it]; d.title = ITEM_NAMES[it]; d.appendChild(t); }
    d.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (S.sel === i && S.items[i]) useItem(); else { S.sel = i; Snd.sfx.select(); renderSlots(); } });
    hud.slots.appendChild(d);
  });
}
function updateNb() { hud.nb.innerHTML = `Notebooks <b>${S.notebooks}/${TOTAL_NB}</b>`; }
function giveItem(type) {
  const i = S.items.findIndex((x) => !x);
  if (i < 0) return false;
  S.items[i] = type; if (!S.items[S.sel]) S.sel = i; renderSlots(); return true;
}
function flash(color = '#fff', a = 0.8) { hud.flash.style.background = color; hud.flash.style.transition = 'none'; hud.flash.style.opacity = a; requestAnimationFrame(() => { hud.flash.style.transition = 'opacity .6s'; hud.flash.style.opacity = 0; }); }

// ------------------------------------------------------------------ spatial audio helper
function spatial(x, z, range = 140) {
  const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz) || 1;
  const vol = Math.pow(clamp(1 - d / range, 0, 1), 1.4);
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  return [vol, clamp((dx * rx + dz * rz) / d, -1, 1) * 0.9];
}
function makeNoise(x, z, radius, dur = 6) {
  const d = Math.hypot(x - P.x, z - P.z);
  baldi.noiseSrc = { x, z, radius, dur };
  if (baldi.active && Math.hypot(x - baldi.x, z - baldi.z) < radius) { baldi.heard = { x, z }; baldi.heardT = dur; }
}

// ------------------------------------------------------------------ doors
function openDoor(d, byPlayer) {
  if (d.exit) return;
  if (!d.want) {
    d.want = true;
    const [v, p] = spatial(cellCenter(d.cx), cellCenter(d.cz), 120);
    Snd.sfx.door(v, p);
    if (byPlayer) makeNoise(cellCenter(d.cx), cellCenter(d.cz), 90, 5);
  }
  d.timer = 3.5;
}
function updateDoors(dt) {
  for (const d of doors) {
    if (d.exit) continue;
    const cx = cellCenter(d.cx), cz = cellCenter(d.cz);
    if (d.want) {
      d.timer -= dt;
      const near = Math.hypot(P.x - cx, P.z - cz) < 6 || (baldi.active && Math.hypot(baldi.x - cx, baldi.z - cz) < 8) || Math.hypot(principal.x - cx, principal.z - cz) < 6;
      if (near) d.timer = Math.max(d.timer, 0.8);
      if (d.timer <= 0) { d.want = false; const [v, p] = spatial(cx, cz, 90); Snd.sfx.doorClose(v, p); }
    }
    const target = d.want ? 1 : 0;
    d.openAmt += clamp(target - d.openAmt, -dt * 2.2, dt * 2.2);
    const off = d.openAmt * CELL * 0.95;
    d.mesh.position.set(d.base.x + (d.alongX ? off : 0), d.base.y, d.base.z + (d.alongX ? 0 : off));
  }
  // let non-player characters trigger doors
  const chars = [baldi, principal, bully, playtime];
  for (const c of chars) {
    if (c === baldi && !baldi.active) continue;
    const cx = toCell(c.x), cz = toCell(c.z);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const d = doorGrid.get((cx + dx) + ',' + (cz + dz));
      if (d && !d.exit && (!d.locked || c === baldi) && Math.hypot(c.x - cellCenter(d.cx), c.z - cellCenter(d.cz)) < 6.5) {
        if (d.locked && c === baldi) d.locked = false;
        openDoor(d, false);
      }
    }
  }
}

// ------------------------------------------------------------------ input
const keys = {};
const stick = { x: 0, y: 0, id: null, cx: 0, cy: 0 };
let runBtn = false, actQueued = false, useQueued = false;
addEventListener('keydown', (e) => {
  if (e.repeat && !['Backspace'].includes(e.code)) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (S.mode === 'math') { mathKey(e); return; }
  if (S.mode === 'playtime' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); jumpPress(); return; }
  if (S.mode !== 'play' && S.mode !== 'playtime') return;
  if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { actQueued = true; e.preventDefault(); }
  if (e.code === 'KeyF') useQueued = true;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') { S.sel = +e.code.slice(-1) - 1; Snd.sfx.select(); renderSlots(); }
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyP') pauseGame();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (S.mode === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && (S.mode === 'play' || S.mode === 'playtime')) pauseGame(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || S.mode === 'math') return;
  const s = 0.0022 * S.sens;
  P.yaw -= e.movementX * s; P.pitch = clamp(P.pitch - e.movementY * s, -1.2, 1.2);
});
addEventListener('mousedown', (e) => {
  if (S.mode !== 'play' && S.mode !== 'playtime') return;
  if (document.pointerLockElement !== canvas) { if (!isTouch && e.target === canvas) canvas.requestPointerLock?.(); return; }
  if (e.button === 0) actQueued = true; else if (e.button === 2) useQueued = true;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (S.mode !== 'play') return; S.sel = (S.sel + (e.deltaY > 0 ? 1 : 2)) % 3; Snd.sfx.select(); renderSlots(); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas && S.mode === 'play' && !isTouch) pauseGame(); });

// stop the browser from scrolling / zooming / back-swiping while playing
['touchmove', 'gesturestart'].forEach((ev) => document.addEventListener(ev, (e) => { if (S.mode !== 'title') e.preventDefault(); }, { passive: false }));

// touch: raw Touch Events (most reliable on phones). Left 40% of the screen = floating
// joystick, the rest = look. Buttons / slots / overlays keep their own handling.
const stickEl = $('stick'), knob = $('knob');
const stickTouch = { id: null }, lookTouch = { id: null, x: 0, y: 0 };
const isUiTarget = (t) => !!(t.closest && t.closest('button, .slot, #math, #play, .screen, #hudBtns'));
function moveStick(x, y) {
  let dx = x - stick.cx, dy = y - stick.cy; const m = 52, d = Math.hypot(dx, dy);
  if (d > m) { dx = dx / d * m; dy = dy / d * m; }
  stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
}
function releaseStick() {
  stickTouch.id = null; stick.x = stick.y = 0; knob.style.transform = '';
  stickEl.style.left = stickEl.style.top = stickEl.style.bottom = '';
}
function touchesPlaying() { return S.mode === 'play' || S.mode === 'playtime'; }
document.addEventListener('touchstart', (e) => {
  if (!touchesPlaying()) return;
  for (const t of e.changedTouches) {
    if (isUiTarget(e.target) && t.target !== stickEl && t.target !== knob) continue;
    if (t.clientX < window.innerWidth * 0.4 || t.target === stickEl || t.target === knob) {
      if (stickTouch.id !== null) continue;
      stickTouch.id = t.identifier;
      const r = stickEl.getBoundingClientRect();
      if (t.target === stickEl || t.target === knob) { stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2; }
      else {
        stick.cx = t.clientX; stick.cy = t.clientY;
        stickEl.style.left = (t.clientX - r.width / 2) + 'px'; stickEl.style.top = (t.clientY - r.height / 2) + 'px'; stickEl.style.bottom = 'auto';
      }
      moveStick(t.clientX, t.clientY);
    } else if (lookTouch.id === null) { lookTouch.id = t.identifier; lookTouch.x = t.clientX; lookTouch.y = t.clientY; }
  }
}, { passive: false });
document.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stickTouch.id) moveStick(t.clientX, t.clientY);
    else if (t.identifier === lookTouch.id) {
      const sc = 0.0055 * S.sens;
      P.yaw -= (t.clientX - lookTouch.x) * sc; P.pitch = clamp(P.pitch - (t.clientY - lookTouch.y) * sc, -1.2, 1.2);
      lookTouch.x = t.clientX; lookTouch.y = t.clientY;
    }
  }
}, { passive: false });
const touchEnd = (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stickTouch.id) releaseStick();
    if (t.identifier === lookTouch.id) lookTouch.id = null;
  }
};
document.addEventListener('touchend', touchEnd); document.addEventListener('touchcancel', touchEnd);
$('tRun').addEventListener('pointerdown', (e) => { e.preventDefault(); runBtn = !runBtn; $('tRun').classList.toggle('on', runBtn); });
$('tAct').addEventListener('pointerdown', (e) => { e.preventDefault(); actQueued = true; });
$('tItem').addEventListener('pointerdown', (e) => { e.preventDefault(); useQueued = true; });
$('btnMap').addEventListener('click', toggleMap);
$('btnPause').addEventListener('click', pauseGame);
function toggleMap() { S.map = !S.map; $('minimap').classList.toggle('hidden', !S.map); }

// ------------------------------------------------------------------ interaction
let interact = null;
function findInteract() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  let best = null, bd = 1e9;
  const consider = (type, obj, x, z, range, label, needLos = true, minDot = 0.6) => {
    const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.01 || (dx * fx + dz * fz) / d < minDot) return;
    if (needLos && !los(P.x, P.z, x, z)) return;
    if (d < bd) { bd = d; best = { type, obj, label }; }
  };
  for (const n of notebooksList) if (!n.taken) consider('nb', n, n.x, n.z, 11, 'Take notebook');
  for (const p of pickups) consider('pick', p, p.x, p.z, 8, 'Take ' + ITEM_NAMES[p.type], true, 0.45);
  for (const d of doors) {
    if (d.exit) continue;
    const label = d.locked ? (S.items.includes('keys') ? 'Unlock door' : 'Locked – needs keys') : (d.want ? null : 'Open door');
    if (label) consider('door', d, cellCenter(d.cx), cellCenter(d.cz), 11, label, false);
  }
  for (const v of vending) consider('vend', v, v.x, v.z, 10, S.items.includes('quarter') ? 'Insert quarter' : 'Vending machine (needs a quarter)', false);
  return best;
}
function doInteract(t) {
  if (!t) return;
  if (t.type === 'nb') openMath(t.obj);
  else if (t.type === 'pick') {
    if (giveItem(t.obj.type)) {
      scene.remove(t.obj.sprite); pickups.splice(pickups.indexOf(t.obj), 1); Snd.sfx.pickup();
      say(`Got <b>${ITEM_NAMES[t.obj.type]}</b>`, 1500);
    } else say('Inventory full!', 1200);
  } else if (t.type === 'door') {
    const d = t.obj;
    if (d.locked) {
      const ki = S.items.indexOf('keys');
      if (ki < 0) { Snd.sfx.locked(); say("The door is locked. Find the <b>Principal's Keys</b>.", 2200); return; }
      S.items[ki] = null; d.locked = false; Snd.sfx.key(); renderSlots(); say('Unlocked the Principal\'s office!', 1800);
    }
    openDoor(d, true);
  } else if (t.type === 'vend') {
    const qi = S.items.indexOf('quarter');
    if (qi < 0) { Snd.sfx.locked(); say('Insert a <b>quarter</b>.', 1500); return; }
    S.items[qi] = null; Snd.sfx.coin();
    const it = Math.random() < 0.55 ? 'zesty' : 'bsoda';
    setTimeout(() => { Snd.sfx.vend(); if (!giveItem(it)) addPickup(it, t.obj.x, t.obj.z); say(`Out came a <b>${ITEM_NAMES[it]}</b>!`, 1800); }, 500);
    renderSlots();
  }
}

// ------------------------------------------------------------------ items
function useItem() {
  const it = S.items[S.sel];
  if (!it) { say('Empty slot.', 800); return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  const consume = () => { S.items[S.sel] = null; renderSlots(); };
  if (it === 'zesty') { S.stamina = 100; S.boost = 6; Snd.sfx.eat(); consume(); say('Mmm! Energy!', 1200); }
  else if (it === 'bsoda') {
    Snd.sfx.bsoda(); consume();
    for (let k = 0; k < 14; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x66aaff, transparent: true, opacity: 0.8 }));
      s.scale.set(1.5, 1.5, 1); s.position.set(P.x, 3.5, P.z); scene.add(s);
      puffs.push({ sprite: s, vx: fx * 40 + rnd(-6, 6), vz: fz * 40 + rnd(-6, 6), life: 0.6 });
    }
    [baldi, principal, bully].forEach((c) => {
      if (c === baldi && !baldi.active) return;
      const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz);
      if (d < 30 && (dx * fx + dz * fz) / (d || 1) > 0.6 && los(P.x, P.z, c.x, c.z)) {
        c.x += fx * 10; c.z += fz * 10; resolve(c, 1.5); c.stun = 4;
        if (c === baldi) say('<b>Baldi</b> is stunned!', 1500);
      }
    });
  } else if (it === 'alarm') {
    consume(); alarm = { x: P.x + fx * 3, z: P.z + fz * 3, t: 6, ring: 0 };
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.itemTex('alarm'), transparent: true }));
    s.scale.set(2.5, 2.5, 1); s.position.set(alarm.x, 1.5, alarm.z); scene.add(s); alarm.sprite = s;
    say('Alarm set… it rings in 6 seconds!', 2000);
  } else if (it === 'quarter') say('Use the quarter on a <b>vending machine</b>.', 1800);
  else if (it === 'keys') say("Walk up to the <b>Principal's door</b> to use the keys.", 2000);
  else if (it === 'scissors') {
    if (S.detention > 0) { consume(); endDetention(true); } else say('Safety Scissors let you escape <b>detention</b>.', 2000);
  }
}
function updateAlarm(dt) {
  if (!alarm) return;
  alarm.t -= dt;
  if (alarm.t <= 0 && alarm.ring === 0) { alarm.ring = 1; alarm.rt = 10; Snd.sfx.alarmStart(); }
  if (alarm.ring === 1) {
    alarm.rt -= dt;
    alarm.sprite.position.y = 1.5 + Math.abs(Math.sin(S.time * 40)) * 0.3;
    const [v] = spatial(alarm.x, alarm.z, 160); Snd.sfx.alarmVol(Math.max(0.1, v));
    if (baldi.active) { baldi.heard = { x: alarm.x, z: alarm.z }; baldi.heardT = 3; baldi.alarmWait = 0; }
    if (alarm.rt <= 0) { Snd.sfx.alarmStop(); scene.remove(alarm.sprite); alarm = null; }
  }
}

// ------------------------------------------------------------------ math
const mathEl = $('math');
let mq = null;
const mathMsg = (t) => { $('mathMsg').textContent = t; };
(function buildKeypad() {
  const kp = $('keypad');
  ['7', '8', '9', '⌫', '4', '5', '6', '-', '1', '2', '3', '0', 'OK'].forEach((k) => {
    const b = document.createElement('button'); b.textContent = k === 'OK' ? 'ENTER' : k;
    if (k === 'OK') b.className = 'ok';
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); Snd.sfx.click(); mathInput(k); });
    kp.appendChild(b);
  });
})();
function genQuestions(n) {
  const qs = [];
  for (let i = 0; i < 3; i++) {
    const lv = n;                       // notebook number 1..7: bigger numbers later
    let q, a;
    if (Math.random() < 0.5) { const x = ri(1, 5 + lv * 3), y = ri(1, 5 + lv * 3); q = `${x} + ${y} =`; a = x + y; }
    else { const x = ri(3, 9 + lv * 3), y = ri(1, x); q = `${x} − ${y} =`; a = x - y; }
    qs.push({ q, a });
  }
  return qs;
}
function openMath(nb) {
  mq = { nb, i: 0, wrong: 0, qs: genQuestions(S.notebooks + 1), input: '', lock: false };
  S.mode = 'math'; document.exitPointerLock?.();
  mathEl.classList.remove('hidden'); setPrompt(null);
  $('mathTitle').textContent = `NOTEBOOK ${S.notebooks + 1} OF ${TOTAL_NB}`;
  showQ(true);
}
function showQ(first) {
  const q = mq.qs[mq.i];
  $('mathQ').textContent = q.q; $('mathA').innerHTML = '&nbsp;'; mq.input = '';
  $('mathProg').textContent = `Problem ${mq.i + 1}/3`;
  mathMsg(first && S.notebooks === 0 ? "Hello! Let's learn some basics!" : '');
  Snd.sfx.talk(1);
  if (!first || S.notebooks > 0) Snd.speak(`Problem ${mq.i + 1}. ${q.q.replace('−', 'minus').replace('+', 'plus').replace('=', '')}`);
  else Snd.speak("Hello! Let's learn some basics! " + q.q.replace('−', 'minus').replace('+', 'plus').replace('=', ''));
}
function mathInput(k) {
  if (!mq || mq.lock) return;
  if (k === '⌫') mq.input = mq.input.slice(0, -1);
  else if (k === 'OK') { submitAnswer(); return; }
  else if (k === '-') { if (!mq.input) mq.input = '-'; }
  else if (mq.input.replace('-', '').length < 4) mq.input += k;
  $('mathA').textContent = mq.input || ' ';
}
function mathKey(e) {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') mathInput('OK');
  else if (e.code === 'Backspace') mathInput('⌫');
  else if (/^[0-9]$/.test(e.key)) mathInput(e.key);
  else if (e.key === '-') mathInput('-');
  e.preventDefault();
}
function submitAnswer() {
  if (mq.input === '' || mq.input === '-') return;
  const q = mq.qs[mq.i], ok = parseInt(mq.input, 10) === q.a;
  mq.lock = true;
  if (ok) { Snd.sfx.correct(); const m = pick(['Correct!', 'Great job!', 'Good!', 'Excellent!']); mathMsg(m); Snd.speak(m); }
  else {
    Snd.sfx.wrong(); mq.wrong++; mathMsg(`Wrong! It was ${q.a}.`); Snd.speak('Wrong!', 0.3);
    baldi.angry = 9; S.anger++;
  }
  setTimeout(() => {
    mq.i++;
    if (mq.i >= 3) finishNotebook(); else { mq.lock = false; showQ(); }
  }, 1300);
}
function finishNotebook() {
  const nb = mq.nb, wrong = mq.wrong; mq = null;
  nb.taken = true; scene.remove(nb.mesh);
  S.notebooks++; updateNb(); Snd.sfx.notebook();
  mathEl.classList.add('hidden'); S.mode = 'play';
  if (!isTouch) canvas.requestPointerLock?.();
  if (S.notebooks === 1) {
    baldi.active = true; baldi.tgt = null; baldi.heard = { x: P.x, z: P.z }; baldi.heardT = 4;
    say('<b>Baldi</b> heard you… He is coming!', 3500);
    Snd.musicStart('chase');
  } else if (wrong > 0) say(`<b>Baldi</b> is angry! ${wrong} wrong…`, 2600, 'I am angry!');
  else say(`${S.notebooks}/${TOTAL_NB} notebooks – perfect!`, 2200);
  if (S.notebooks >= TOTAL_NB) startEscape();
}
function startEscape() {
  S.exitsOpen = true;
  exitMeshes.forEach((d) => { d.mesh.material = new THREE.MeshBasicMaterial({ map: A.exitOpenTex() }); d.mesh.visible = false; });
  Snd.sfx.siren(); Snd.musicStart('escape'); flash('#f55', 0.5);
  say('All notebooks collected! <b>RUN to an EXIT!</b>', 5000, 'Oh no! You will never get out!');
  baldi.angry = 99999; baldi.track = 0;
  // drop Baldi somewhere in the halls, but not on top of the player
  for (let i = 0; i < 20; i++) { const h = randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > 90) { baldi.x = h.x; baldi.z = h.z; break; } }
}

// ------------------------------------------------------------------ playtime mini game
const playEl = $('play');
const pt = { hits: 0, pos: 0, dir: 1, speed: 1.6, active: false, zone: [0.275, 0.725] };
function startPlaytime() {
  S.mode = 'playtime'; pt.hits = 0; pt.pos = 0; pt.dir = 1; pt.speed = 0.7; pt.active = true;
  playEl.classList.remove('hidden'); $('playProg').textContent = '0/3'; $('playMsg').textContent = 'Jump when the rope reaches the green!';
  playtime.state = 'game'; document.exitPointerLock?.(); setPrompt(null);
  Snd.sfx.giggle(); say('<b>Playtime</b>: "Wanna jump rope with me?!"', 2600);
}
function jumpPress() {
  if (!pt.active) return;
  if (pt.pos >= pt.zone[0] && pt.pos <= pt.zone[1]) {
    pt.hits++; Snd.sfx.jump(); $('playProg').textContent = pt.hits + '/3'; $('playMsg').textContent = pick(['Yay!', 'Again!', 'Wheee!', 'Nice jump!']);
    pt.speed += 0.08;
    if (pt.hits >= 3) endPlaytime(true);
  } else {
    Snd.sfx.miss(); pt.hits = Math.max(0, pt.hits - 1); $('playProg').textContent = pt.hits + '/3'; $('playMsg').textContent = 'Oops! Try again!';
  }
}
function endPlaytime() {
  pt.active = false; playEl.classList.add('hidden'); S.mode = 'play';
  if (!isTouch) canvas.requestPointerLock?.();
  playtime.state = 'away'; playtime.timer = 25; playtime.goal = randHall();
  Snd.sfx.giggle(); say('<b>Playtime</b>: "That was fun! Bye!"', 2000);
}
$('jumpBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); jumpPress(); });

// ------------------------------------------------------------------ AI
function updateBaldi(dt) {
  const B = baldi;
  if (!B.active) { B.sprite.position.set(B.x, 0, B.z); B.sprite.material.map = baldiTex.happy; return; }
  const n = S.notebooks;
  B.stun = Math.max(0, B.stun - dt); B.angry = Math.max(0, B.angry - dt); B.heardT = Math.max(0, B.heardT - dt);
  const period = Math.max(0.5, 1.5 - 0.14 * n);
  B.sinceSlap += dt;
  if (B.sinceSlap >= period) {
    B.sinceSlap = 0; B.slapCount++;
    const [v, p] = spatial(B.x, B.z, 170); Snd.sfx.slap(v, p);
  }
  const burst = B.sinceSlap < period * 0.45;
  let base = 6.2 + 1.35 * n;
  if (B.angry > 0) base *= 1.45;
  if (S.detention > 0) base *= 0.35;
  if (B.stun > 0) base *= 0.25;
  const speed = base * (burst ? 2.0 : 0.2);
  const dp = Math.hypot(P.x - B.x, P.z - B.z);
  const sees = dp < 130 && los(B.x, B.z, P.x, P.z, 1.1);
  let moved = false;
  if (S.detention <= 0 && (sees || B.angry > 0 && dp < 60 && sees)) {
    // direct chase
    const dx = P.x - B.x, dz = P.z - B.z, d = Math.hypot(dx, dz) || 1;
    B.x += dx / d * speed * dt; B.z += dz / d * speed * dt; B.tgt = { x: P.x, z: P.z }; moved = true;
    B.heardT = 0;
  } else if (B.heardT > 0 && B.heard) {
    const left = followPath(B, B.heard.x, B.heard.z, speed, dt, true);
    if (left < 3) { B.heardT = 0; B.heard = null; }
  } else {
    B.track -= dt;
    if (B.track <= 0 || !B.tgt) { B.tgt = S.detention > 0 ? (B.tgt || { x: B.x, z: B.z }) : { x: P.x + rnd(-8, 8), z: P.z + rnd(-8, 8) }; B.track = Math.max(1, 3.2 - 0.3 * n); }
    followPath(B, B.tgt.x, B.tgt.z, speed, dt, true);
  }
  B.sprite.position.set(B.x, 0, B.z);
  B.sprite.material.map = (B.sinceSlap < 0.18) ? (dp < 70 ? baldiTex.slap : baldiTex.idleSlap) : (dp < 60 || B.angry > 0 ? baldiTex.angry : baldiTex.happy);
  if (!S.caught && S.mode !== 'math' && dp < 3.8 && S.detention <= 0) caught();
}
function updatePrincipal(dt) {
  const c = principal;
  c.stun = Math.max(0, c.stun - dt); c.cool = Math.max(0, c.cool - dt);
  if (S.detention > 0) { c.sprite.position.set(c.x, 0, c.z); return; }
  if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3) c.goal = randHall();
  if (c.warn > 0) {
    c.warn -= dt;
    if (c.warn <= 0) startDetention();
  } else if (c.stun <= 0) {
    followPath(c, c.goal.x, c.goal.z, 9, dt, false);
  }
  const d = Math.hypot(P.x - c.x, P.z - c.z);
  if (c.warn <= 0 && c.cool <= 0 && P.running && P.moving && d < 70 && isHall(toCell(P.x), toCell(P.z)) && los(c.x, c.z, P.x, P.z)) {
    c.warn = 0.9; Snd.sfx.whistle(); say('<b>Principal</b>: "NO RUNNING IN THE HALLS!"', 2200, 'No running in the halls!');
  }
  c.sprite.position.set(c.x, 0, c.z);
}
function startDetention() {
  S.detention = 18; principal.warn = 0; principal.cool = 0;
  P.x = cellCenter(15); P.z = cellCenter(12); P.vx = P.vz = 0;
  const d = doorAt(office.door[0], office.door[1]); d.want = false; d.locked = true;
  flash('#000', 1); say('<b>DETENTION!</b> You are locked in the office. Wait it out (or use Safety Scissors)…', 4000);
  Snd.sfx.locked();
}
function endDetention(scissors) {
  S.detention = 0; principal.cool = 30;
  const d = doorAt(office.door[0], office.door[1]); d.locked = false; openDoor(d, false);
  say(scissors ? 'You snipped your way out!' : 'Detention is over. <b>Walk</b> in the halls!', 2400);
}
function updateBully(dt) {
  const c = bully; c.stun = Math.max(0, c.stun - dt);
  c.timer -= dt;
  if (c.state === 'wait') {
    if (c.stun <= 0 && Math.hypot(P.x - c.x, P.z - c.z) < 8 && c.timer <= 0) {
      const have = S.items.map((x, i) => x ? i : -1).filter((i) => i >= 0);
      if (have.length) {
        const i = pick(have); const it = S.items[i]; S.items[i] = null; renderSlots(); Snd.sfx.steal();
        say(`<b>It's a Bully</b>: "Gimme your ${ITEM_NAMES[it]}!"`, 2600, "Gimme your stuff!");
        c.state = 'flee'; c.timer = 18; c.goal = randHall();
      } else { say('<b>It\'s a Bully</b>: "You got nothin\'? Beat it!"', 1800); c.timer = 6; }
    }
  } else if (c.state === 'flee') {
    followPath(c, c.goal.x, c.goal.z, 16, dt, false);
    if (Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3 || c.timer <= 0) { c.state = 'hide'; c.timer = rnd(15, 25); c.sprite.visible = false; }
  } else if (c.state === 'hide' && c.timer <= 0) {
    const h = randHall(); if (Math.hypot(h.x - P.x, h.z - P.z) > 50) { c.x = h.x; c.z = h.z; c.state = 'wait'; c.timer = 1; c.sprite.visible = true; }
  }
  c.sprite.position.set(c.x, 0, c.z);
}
function updatePlaytime(dt) {
  const c = playtime;
  c.timer -= dt;
  if (c.state === 'game') { c.sprite.position.set(c.x, 0, c.z); return; }
  if (!c.goal || Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 3) c.goal = randHall();
  const d = Math.hypot(P.x - c.x, P.z - c.z);
  const see = d < 35 && los(c.x, c.z, P.x, P.z);
  if ((c.state === 'wander') && see && S.detention <= 0 && S.mode === 'play') c.state = 'chase';
  if (c.state === 'chase') {
    if (!see && d > 40) c.state = 'wander';
    followPath(c, P.x, P.z, 7, dt, false);
    if (d < 5) startPlaytime();
  } else if (c.state === 'away') {
    followPath(c, c.goal.x, c.goal.z, 12, dt, false);
    if (c.timer <= 0) c.state = 'wander';
  } else followPath(c, c.goal.x, c.goal.z, 7, dt, false);
  if (see && S.time % 3 < dt) { const [v, p] = spatial(c.x, c.z, 90); Snd.sfx.giggle(p); }
  c.sprite.position.set(c.x, 0, c.z);
}
function updateSweep(dt) {
  const c = sweep;
  if (!c.active) {
    c.timer -= dt;
    if (c.timer <= 0 && S.notebooks > 0) {
      const opts = [
        { x: 1.5, z: 8.5, dx: 1, dz: 0, len: 28 }, { x: 29.5, z: 8.5, dx: -1, dz: 0, len: 28 },
        { x: 1.5, z: 16.5, dx: 1, dz: 0, len: 28 }, { x: 29.5, z: 16.5, dx: -1, dz: 0, len: 28 },
        { x: 2.5, z: 7.5, dx: 0, dz: 1, len: 10 }, { x: 28.5, z: 17.5, dx: 0, dz: -1, len: 10 },
      ];
      const o = pick(opts);
      c.x = o.x * CELL; c.z = o.z * CELL; c.dx = o.dx; c.dz = o.dz; c.left = o.len * CELL; c.active = true; c.sprite.visible = true;
      const [v, p] = spatial(c.x, c.z, 200); Snd.sfx.sweep(p, v);
      say('<b>Gotta Sweep</b> is sweeping the halls!', 2200);
    }
    return;
  }
  const sp = 34;
  c.x += c.dx * sp * dt; c.z += c.dz * sp * dt; c.left -= sp * dt;
  c.sprite.position.set(c.x, 0, c.z);
  const shove = (e, r = 6) => {
    if (Math.abs(e.x - c.x) < r && Math.abs(e.z - c.z) < r) { e.x += c.dx * sp * dt * 1.1; e.z += c.dz * sp * dt * 1.1; return true; }
  };
  if (S.detention <= 0 && shove(P)) resolve(P, P.r);
  if (baldi.active) shove(baldi);
  shove(principal);
  if (c.left <= 0) { c.active = false; c.sprite.visible = false; c.timer = rnd(35, 70); }
}

// ------------------------------------------------------------------ game flow
function resetGame() {
  Object.assign(S, { notebooks: 0, stamina: 100, items: [null, null, null], sel: 0, exitsOpen: false, detention: 0, time: 0, anger: 0, boost: 0, caught: false });
  P.x = cellCenter(15); P.z = cellCenter(16); P.yaw = 0; P.pitch = 0; P.vx = P.vz = 0;
  const bs = rooms[0]; // top-left classroom
  Object.assign(baldi, { x: cellCenter(3), z: cellCenter(3), active: false, stun: 0, heard: null, heardT: 0, track: 0, tgt: null, angry: 0, sinceSlap: 0 });
  Object.assign(principal, { stun: 0, warn: 0, cool: 6, goal: null }); let h = randHall(); principal.x = h.x; principal.z = h.z;
  do { h = randHall(); } while (Math.hypot(h.x - P.x, h.z - P.z) < 60);
  Object.assign(bully, { x: h.x, z: h.z, state: 'wait', timer: 2, stun: 0 }); bully.sprite.visible = true;
  do { h = randHall(); } while (Math.hypot(h.x - P.x, h.z - P.z) < 90);
  Object.assign(playtime, { x: h.x, z: h.z, state: 'wander', timer: 10, goal: null });
  Object.assign(sweep, { active: false, timer: 30 }); sweep.sprite.visible = false;
  doors.forEach((d) => { d.want = false; d.openAmt = 0; d.locked = d.mesh.material.map === undefined ? false : d.locked; });
  doorAt(office.door[0], office.door[1]).locked = true;
  exitMeshes.forEach((d) => { d.mesh.material = new THREE.MeshBasicMaterial({ map: A.exitTex() }); d.mesh.visible = true; });
  setupWorld(); updateNb(); renderSlots();
}
function startGame() {
  Snd.init(); Snd.resume();
  resetGame();
  ['title', 'help', 'pause', 'over'].forEach((id) => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden'); $('scare').classList.add('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  S.mode = 'play'; resize();
  if (!isTouch) canvas.requestPointerLock?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
  try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (e) {}
  Snd.musicStart('chase'); Snd.setIntensity(0);
  say("Find the <b>7 notebooks</b> in the classrooms. Stay quiet… Baldi is napping.", 5000, "Hello! Collect all seven notebooks!");
}
function pauseGame() {
  if (S.mode !== 'play') return;
  if (typeof releaseStick === 'function') releaseStick();
  S.mode = 'paused'; $('pause').classList.remove('hidden'); document.exitPointerLock?.(); Snd.suspend();
}
function resumeGame() {
  $('pause').classList.add('hidden'); S.mode = 'play'; Snd.resume(); last = performance.now();
  if (!isTouch) canvas.requestPointerLock?.();
}
function toTitle() {
  if (updatePending) { location.reload(); return; }
  Snd.sfx.alarmStop(); Snd.musicStart('title'); Snd.resume();
  S.mode = 'title'; ['pause', 'over', 'help'].forEach((id) => $(id).classList.add('hidden'));
  $('title').classList.remove('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden'); $('scare').classList.add('hidden');
  mathEl.classList.add('hidden'); playEl.classList.add('hidden'); document.exitPointerLock?.(); resize();
}
function caught() {
  S.caught = true; S.mode = 'scare'; document.exitPointerLock?.();
  Snd.musicStop(); Snd.sfx.alarmStop(); Snd.sfx.scare(); setPrompt(null);
  const c = $('scareCv'), g = c.getContext('2d'); g.fillStyle = '#300'; g.fillRect(0, 0, 512, 768);
  g.drawImage(A.drawBaldi('scream', true), -60, 30, 640, 960);
  $('scare').classList.remove('hidden');
  setTimeout(() => {
    $('scare').classList.add('hidden'); $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    $('overTitle').textContent = 'Baldi got you!';
    $('overMsg').textContent = `You collected ${S.notebooks} of ${TOTAL_NB} notebooks.`;
    $('over').classList.remove('hidden'); S.mode = 'over'; setTimeout(applyUpdate, 1200);
  }, 1900);
}
function win() {
  S.mode = 'win'; document.exitPointerLock?.(); Snd.musicStop(); Snd.sfx.alarmStop(); Snd.sfx.win();
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  $('overTitle').textContent = 'YOU ESCAPED!';
  $('overMsg').textContent = `You escaped the schoolhouse in ${Math.floor(S.time / 60)}m ${Math.floor(S.time % 60)}s${S.anger ? ` (made Baldi angry ${S.anger}×)` : ' with a perfect score!'}`;
  $('over').classList.remove('hidden');
}

// ------------------------------------------------------------------ minimap
const mm = $('minimap'), mg = mm.getContext('2d');
const mmBase = A.cv(W * 8, H * 8);
{ const g = mmBase.getContext('2d'); for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { const c = grid[z][x]; g.fillStyle = c === '#' ? '#222' : c === 'D' ? '#b07a3a' : c === 'L' ? '#a33' : c === 'E' ? '#3c3' : c === 'r' ? '#6f8da0' : c === 'o' ? '#7d3a3a' : '#c9a63a'; g.fillRect(x * 8, z * 8, 8, 8); } }
function drawMap() {
  mg.drawImage(mmBase, 0, 0);
  for (const n of notebooksList) if (!n.taken && S.notebooks >= 99) { }
  mg.save(); mg.translate(P.x / CELL * 8, P.z / CELL * 8); mg.rotate(-P.yaw);
  mg.fillStyle = '#fff'; mg.beginPath(); mg.moveTo(0, -6); mg.lineTo(4, 5); mg.lineTo(-4, 5); mg.closePath(); mg.fill(); mg.strokeStyle = '#000'; mg.stroke(); mg.restore();
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function update(dt) {
  S.time += dt;
  const playing = S.mode === 'play';
  // movement
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
  let mz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - stick.y;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  if (!playing || S.detention > 0 && false) { mx = mz = 0; }
  const wantRun = !!(keys.ShiftLeft || keys.ShiftRight || runBtn);
  P.moving = ml > 0.1 && playing;
  P.running = wantRun && P.moving && S.stamina > 0 && !(S.stamina < 8 && P.exhausted);
  if (S.stamina <= 0) P.exhausted = true; else if (S.stamina > 25) P.exhausted = false;
  if (P.exhausted) P.running = false;
  const speed = P.running ? 22 : 12.5;
  if (P.running) S.stamina = Math.max(0, S.stamina - (S.boost > 0 ? 0 : 22) * dt); else S.stamina = Math.min(100, S.stamina + 14 * dt);
  S.boost = Math.max(0, (S.boost || 0) - dt);
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const tvx = (fx * mz + rx * mx) * speed, tvz = (fz * mz + rz * mx) * speed;
  const acc = Math.min(1, dt * 14);
  P.vx += (tvx - P.vx) * acc; P.vz += (tvz - P.vz) * acc;
  P.x += P.vx * dt; resolve(P, P.r); P.z += P.vz * dt; resolve(P, P.r);
  if (P.moving) {
    P.bob += dt * (P.running ? 13 : 9);
    if (P.running && Math.floor(P.bob / Math.PI) !== P.lastStep) { P.lastStep = Math.floor(P.bob / Math.PI); makeNoise(P.x, P.z, 22, 1.5); }
  }
  // detention timer
  if (S.detention > 0) { S.detention -= dt; if (S.detention <= 0) endDetention(false); }

  // interactions
  if (playing) {
    interact = findInteract();
    setPrompt(interact ? interact.label + (isTouch ? '' : ' [E / Click]') : null);
    if (actQueued && interact) doInteract(interact);
    if (useQueued) useItem();
  } else interact = null;
  actQueued = useQueued = false;

  updateDoors(dt); updateAlarm(dt);
  if (S.mode === 'play' || S.mode === 'playtime') {
    updateBaldi(dt); updatePrincipal(dt); updateBully(dt); updatePlaytime(dt); updateSweep(dt);
  }
  if (S.mode === 'playtime') {
    pt.pos += pt.dir * pt.speed * dt;
    if (pt.pos > 1) { pt.pos = 1; pt.dir = -1; } else if (pt.pos < 0) { pt.pos = 0; pt.dir = 1; }
    $('ropeMark').style.left = `calc(${pt.pos * 100}% - 4px)`;
  }
  // exit
  if (playing && grid[toCell(P.z)] && cellAt(toCell(P.x), toCell(P.z)) === 'E' && S.exitsOpen) win();
  if (playing && S.exitsOpen && (P.x < 1.2 || P.x > W * CELL - 1.2)) win();

  // pickups & misc anims
  pickups.forEach((p) => { p.sprite.position.y = 2.2 + Math.sin(S.time * 2.4 + p.ph) * 0.35; });
  notebooksList.forEach((n) => { if (!n.taken) { n.mesh.rotation.y += dt * 1.8; n.mesh.position.y = 5.4 + Math.sin(S.time * 2) * 0.35; } });
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= dt; p.sprite.position.x += p.vx * dt; p.sprite.position.z += p.vz * dt; p.sprite.material.opacity = clamp(p.life * 2, 0, 0.8); p.sprite.scale.multiplyScalar(1 + dt * 3); if (p.life <= 0) { scene.remove(p.sprite); puffs.splice(i, 1); } }

  // HUD
  hud.sta.style.width = S.stamina + '%'; hud.sta.classList.toggle('low', P.exhausted);
  if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) hud.sub.style.display = 'none'; }
  if (S.map) drawMap();
  // music intensity
  const dB = baldi.active ? Math.hypot(P.x - baldi.x, P.z - baldi.z) : 999;
  Snd.setIntensity(clamp(S.notebooks / 10 + (dB < 80 ? (1 - dB / 80) * 0.5 : 0) + (S.exitsOpen ? 0.2 : 0), 0, 1));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.mode === 'play' || S.mode === 'playtime' || S.mode === 'math') {
    if (S.mode === 'math') { /* world frozen while doing homework */ } else update(dt);
  } else if (S.mode === 'title') { P.yaw += dt * 0.15; S.time += dt; }
  // camera
  const bob = Math.sin(P.bob) * 0.22 * (P.moving ? 1 : 0);
  if (S.mode === 'title') { camera.position.set(cellCenter(15), 5, cellCenter(8)); }
  else camera.position.set(P.x, 5.2 + bob, P.z);
  camera.rotation.set(S.mode === 'title' ? 0 : P.pitch, P.yaw, 0);
  if (S.mode === 'scare') { /* handled by overlay */ }
  // billboards face camera automatically; mirror the loop for sprite order
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ UI wiring
$('startBtn').addEventListener('click', startGame);
$('retryBtn').addEventListener('click', startGame);
$('menuBtn').addEventListener('click', toTitle);
$('quitBtn').addEventListener('click', toTitle);
$('resumeBtn').addEventListener('click', resumeGame);
$('helpBtn').addEventListener('click', () => { $('help').classList.remove('hidden'); });
$('helpClose').addEventListener('click', () => { $('help').classList.add('hidden'); });
$('sens').addEventListener('input', (e) => { S.sens = parseFloat(e.target.value); try { localStorage.setItem('bb_sens', S.sens); } catch (_) {} });
let soundOn = true, voiceOn = true, titleStarted = false;
$('soundBtn').addEventListener('click', () => { soundOn = !soundOn; Snd.init(); Snd.setMuted(!soundOn); $('soundBtn').textContent = 'Sound: ' + (soundOn ? 'on' : 'off'); });
$('voiceBtn').addEventListener('click', () => { voiceOn = !voiceOn; Snd.setVoice(voiceOn); $('voiceBtn').textContent = 'Voice: ' + (voiceOn ? 'on' : 'off'); });
try { const s = parseFloat(localStorage.getItem('bb_sens')); if (s) { S.sens = s; $('sens').value = s; } } catch (_) {}
// first interaction on the title starts the title music
addEventListener('pointerdown', () => { if (S.mode === 'title' && soundOn) { Snd.init(); Snd.resume(); if (!titleStarted) { titleStarted = true; Snd.musicStart('title'); } } }, { once: false });

// PWA
let deferredPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('installBtn').classList.add('hidden'); });
// Auto-update: check for a new service worker on open (and whenever the app returns to the
// foreground). When a new version takes over we reload - immediately on menu screens, or as
// soon as the player is back at the title/game-over screen so a run is never interrupted.
let updatePending = false;
function applyUpdate() {
  if (!updatePending) return;
  if (S.mode === 'title' || S.mode === 'over' || S.mode === 'win') location.reload();
}
function showUpdateToast(msg) {
  let t = $('updateToast');
  if (!t) { t = document.createElement('div'); t.id = 'updateToast'; t.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:60;background:#000c;color:#fff;padding:6px 14px;border-radius:8px;font-size:.85rem;pointer-events:none'; document.body.appendChild(t); }
  t.textContent = msg;
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;                 // first install, nothing to replace
    updatePending = true;
    if (S.mode === 'title' || S.mode === 'over' || S.mode === 'win') { showUpdateToast('Updating…'); setTimeout(() => location.reload(), 300); }
    else showUpdateToast('Update ready - it will install when you return to the title screen');
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
}

// boot
const BUILD = 'v9-autoupdate'; $('build').textContent = BUILD;
if (location.search.includes('debug')) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:6px;top:80px;z-index:99;font:11px monospace;background:#000a;color:#0f0;padding:3px;pointer-events:none'; document.body.appendChild(d); setInterval(() => { d.textContent = `${BUILD} mode=${S.mode} stick=${stick.x.toFixed(2)},${stick.y.toFixed(2)} id=${stickTouch.id} look=${lookTouch.id} P=${P.x.toFixed(0)},${P.z.toFixed(0)}`; }, 100); }
resetGame(); resize(); updateNb();
P.yaw = 0;
requestAnimationFrame(frame);
window.__game = { S, P, baldi, principal, bully, playtime, sweep, notebooksList, pickups, doors, scene, camera, renderer, openMath, giveItem, doInteract, findInteract, startGame, caught, win };
