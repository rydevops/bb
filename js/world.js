// The schoolhouse: geometry, doors, collision, line of sight and path finding.
import * as THREE from '../vendor/three.module.js';
import { W, H, CELL, WALLH, buildMap, cellCenter, toCell } from './map.js';
import * as A from './art.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const memo = {};
const tex = (key, fn) => memo[key] || (memo[key] = fn());
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function buildWorld(scene, mirror) {
  const map = buildMap(mirror);
  const { grid, rooms, office } = map;
  const root = new THREE.Group(); scene.add(root);
  const cellAt = (cx, cz) => (cx < 0 || cz < 0 || cx >= W || cz >= H) ? '#' : grid[cz][cx];
  const isHall = (cx, cz) => cellAt(cx, cz) === '.';
  const solids = [];          // static boxes (desks, machines) + dynamic barriers
  const doors = [];
  const w = { map, grid, rooms, office, root, solids, doors, exits: map.exits, cellAt, isHall, jdRoom: map.jdRoom, exitsOpen: false, mirror };

  // ---- walls / floors / ceiling
  const wallCells = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (grid[z][x] === '#' && DIRS.some(([dx, dz]) => cellAt(x + dx, z + dz) !== '#')) wallCells.push([x, z]);
  const d = new THREE.Object3D();
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALLH, CELL), new THREE.MeshBasicMaterial({ map: tex('wall', A.wallTex) }), wallCells.length);
  wallCells.forEach(([x, z], i) => { d.position.set(cellCenter(x), WALLH / 2, cellCenter(z)); d.updateMatrix(); wallMesh.setMatrixAt(i, d.matrix); });
  root.add(wallMesh); w.wallMesh = wallMesh;
  const plane = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
  w.floorMats = [];
  const floor = (key, fn, test) => {
    const list = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (test(grid[z][x])) list.push([x, z]);
    const m = new THREE.MeshBasicMaterial({ map: tex(key, fn) }); w.floorMats.push(m);
    const im = new THREE.InstancedMesh(plane, m, list.length);
    list.forEach(([x, z], i) => { d.position.set(cellCenter(x), 0, cellCenter(z)); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    root.add(im);
  };
  floor('carpet', A.carpetTex, (c) => c === '.' || c === 'D' || c === 'E');
  floor('tile', A.tileTex, (c) => c === 'r');
  floor('office', A.officeTex, (c) => c === 'o' || c === 'L');
  const ct = tex('ceil', () => { const t = A.ceilingTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W, H); return t; });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: ct }));
  ceil.position.set(W * CELL / 2, WALLH, H * CELL / 2); root.add(ceil); w.ceil = ceil;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4f9a46, fog: false }));
  ground.position.set(W * CELL / 2, -0.05, H * CELL / 2); root.add(ground); w.ground = ground;
  // flood water (Demo event)
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W * CELL, H * CELL).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a78c8, transparent: true, opacity: 0.55 }));
  water.position.set(W * CELL / 2, 0.9, H * CELL / 2); water.visible = false; root.add(water); w.water = water;

  // ---- doors & exits
  const doorMap = new Map();
  let n = 100;
  const exitClosed = tex('exitClosed', A.exitTex);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = grid[z][x];
    if (c !== 'D' && c !== 'L' && c !== 'E') continue;
    const alongX = cellAt(x - 1, z) === '#' && cellAt(x + 1, z) === '#';
    const geo = alongX ? new THREE.BoxGeometry(CELL, WALLH, 1.2) : new THREE.BoxGeometry(1.2, WALLH, CELL);
    const isJD = x === map.jdRoom.door[0] && z === map.jdRoom.door[1];
    const label = c === 'L' ? 'OFFICE' : isJD ? 'JD' : String(n++);
    const mat = new THREE.MeshBasicMaterial({ map: c === 'E' ? exitClosed : tex('door' + label + (c === 'L' || isJD), () => A.doorTex(label, c === 'L' || isJD)) });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(cellCenter(x), WALLH / 2, cellCenter(z)); root.add(mesh);
    const door = { cx: x, cz: z, mesh, alongX, openAmt: 0, want: false, timer: 0, locked: c === 'L', gate: isJD, lockT: 0, silent: false, exit: c === 'E', base: mesh.position.clone(), label, key: x + ',' + z };
    if (isJD) door.locked = true;
    doors.push(door); doorMap.set(door.key, door);
  }
  w.doorAt = (cx, cz) => doorMap.get(cx + ',' + cz);
  w.exitDoors = doors.filter((dd) => dd.exit);

  // ---- posters
  { let k = 0; const used = {};
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (grid[z][x] !== '#') continue;
      for (const [dx, dz] of DIRS) {
        if (!isHall(x + dx, z + dz) || ((x * 7 + z * 13 + dx * 3) % 5)) continue;
        if (DIRS.some(([a, b]) => 'DLE'.includes(cellAt(x + a, z + b)))) continue;
        const i = k++ % 7; used[i] = used[i] || A.posterTex(i);
        const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 5.3), new THREE.MeshBasicMaterial({ map: used[i] }));
        p.position.set(cellCenter(x) + dx * (CELL / 2 + 0.05), 5.2, cellCenter(z) + dz * (CELL / 2 + 0.05)); p.rotation.y = Math.atan2(dx, dz); root.add(p);
      }
    }
  }
  // ---- classrooms: board, teacher desk, student desks
  const deskMat = new THREE.MeshBasicMaterial({ map: tex('desk', A.deskTex) });
  const addSolid = (x, z, ww, dd, hh, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), mat); m.position.set(x, hh / 2, z); root.add(m);
    solids.push({ x0: x - ww / 2, x1: x + ww / 2, z0: z - dd / 2, z1: z + dd / 2 });
  };
  const boards = ['2 + 2 = ?', '4 + 3', 'a² + b²', '10 − 7', 'HOMEWORK!', '5 + 5 = ?', 'π ≈ 3.14', '9 − 3'];
  w.roomInfo = rooms.map((r, i) => {
    const doorNorth = r.door[1] < r.z0, farZ = doorNorth ? (r.z1 + 1) * CELL : r.z0 * CELL, sgn = doorNorth ? -1 : 1;
    const cx = (r.x0 + r.x1 + 1) * CELL / 2;
    const bd = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: tex('board' + i, () => A.chalkboardTex(boards[i % boards.length])) }));
    bd.position.set(cx, 5.3, farZ + sgn * 0.06); bd.rotation.y = doorNorth ? Math.PI : 0; root.add(bd);
    addSolid(cx, farZ + sgn * 2.2, 8, 3, 3.2, deskMat);
    const nRows = r.z1 - r.z0 + 1;
    for (let k = 2; k < nRows; k += 2) { const z = farZ + sgn * (k - 0.5) * CELL; addSolid((r.x0 + 0.5) * CELL, z, 3.4, 3, 2.6, deskMat); addSolid((r.x1 + 0.5) * CELL, z, 3.4, 3, 2.6, deskMat); }
    return { r, id: r.id, cx, farZ, sgn, pos: new THREE.Vector3(cx, 5.2, farZ + sgn * 2.2), center: { x: cx, z: (r.z0 + r.z1 + 1) * CELL / 2 } };
  });
  addSolid((office.x0 + office.x1 + 1) * CELL / 2, (office.z1 + 1) * CELL - 3, 10, 3.5, 3.2, deskMat);
  // ---- vending machines (BSODA)
  w.vending = [];
  { const tx = tex('vend', A.vendingTex);
    const mx = [Math.floor(W / 2)];       // centre of the long halls
    mx.forEach((cx) => [[7 * CELL + 1.6, 1], [18 * CELL - 1.6, -1]].forEach(([zz, face]) => {
      const x = (cx + 0.5) * CELL;
      const mats = [0, 1, 2, 3, 4, 5].map(() => new THREE.MeshBasicMaterial({ color: 0xa8281e })); mats[face === 1 ? 4 : 5] = new THREE.MeshBasicMaterial({ map: tx });
      const m = new THREE.Mesh(new THREE.BoxGeometry(5, 7.5, 3), mats); m.position.set(x, 3.75, zz); root.add(m);
      solids.push({ x0: x - 2.5, x1: x + 2.5, z0: zz - 1.5, z1: zz + 1.5 });
      w.vending.push({ x, z: zz + face * 3, mesh: m });
    }));
  }

  // ---- collision ----
  w.solidCell = (cx, cz) => {
    const c = cellAt(cx, cz);
    if (c === '#') return true;
    if (c === 'D' || c === 'L') return doorMap.get(cx + ',' + cz).openAmt < 0.7;
    if (c === 'E') return !w.exitsOpen || doorMap.get(cx + ',' + cz).shut;
    return false;
  };
  function pushOut(p, r, x0, z0, x1, z1) {
    const qx = clamp(p.x, x0, x1), qz = clamp(p.z, z0, z1), dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 < 1e-6) { const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r; return; }
    const dd = Math.sqrt(d2); p.x = qx + dx / dd * r; p.z = qz + dz / dd * r;
  }
  w.resolve = (p, r) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) { const h = w.randHall(); p.x = h.x; p.z = h.z; }   // never let a NaN position poison the game
    for (let it = 0; it < 2; it++) {
      const cx = toCell(p.x), cz = toCell(p.z);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (w.solidCell(cx + dx, cz + dz)) pushOut(p, r, (cx + dx) * CELL, (cz + dz) * CELL, (cx + dx + 1) * CELL, (cz + dz + 1) * CELL);
      for (const s of solids) { if (Math.abs(p.x - (s.x0 + s.x1) / 2) > 14 || Math.abs(p.z - (s.z0 + s.z1) / 2) > 14) continue; pushOut(p, r, s.x0, s.z0, s.x1, s.z1); }
    }
    p.x = clamp(p.x, 0.5, W * CELL - 0.5); p.z = clamp(p.z, 0.5, H * CELL - 0.5);   // stay inside the map even if shoved
  };
  const blocksSight = (cx, cz) => { const c = cellAt(cx, cz); if (c === '#') return true; if (c === 'D' || c === 'L') return doorMap.get(cx + ',' + cz).openAmt < 0.5; return false; };
  const ray = (ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz); if (!Number.isFinite(dist)) return false; const n = Math.min(120, Math.ceil(dist / 1.5)); for (let i = 1; i < n; i++) { const t = i / n; if (blocksSight(toCell(ax + dx * t), toCell(az + dz * t))) return false; } return true; };
  w.los = (x0, z0, x1, z1, width = 0) => {
    if (!ray(x0, z0, x1, z1)) return false;
    if (!width) return true;
    const dx = x1 - x0, dz = z1 - z0, dd = Math.hypot(dx, dz) || 1, nx = -dz / dd * width, nz = dx / dd * width;
    return ray(x0 + nx, z0 + nz, x1 + nx, z1 + nz) && ray(x0 - nx, z0 - nz, x1 - nx, z1 - nz);
  };
  // ---- path finding (BFS). canBreak: locked doors (item/key locks) are passable; gates never are
  const passable = (cx, cz, canBreak) => {
    const c = cellAt(cx, cz); if (c === '#' || c === 'E') return false;
    if (c === 'L' || c === 'D') { const dd = doorMap.get(cx + ',' + cz); if (dd.gate && dd.locked) return false; if ((dd.locked || dd.lockT > 0) && !canBreak) return false; }
    return true;
  };
  // BFS over the grid. Bounded: each cell is queued at most once, and a start/target outside the map (or NaN) returns null
  // instead of corrupting the search (this used to be able to loop forever and exhaust memory).
  const N = W * H, inBounds = (x, z) => Number.isInteger(x) && Number.isInteger(z) && x >= 0 && z >= 0 && x < W && z < H;
  w.nextStep = (sx, sz, tx, tz, canBreak) => {
    if (!inBounds(sx, sz) || !inBounds(tx, tz) || (sx === tx && sz === tz)) return null;
    const seen = new Uint8Array(N), prev = new Int32Array(N), q = new Int32Array(N);
    const start = sz * W + sx, target = tz * W + tx; let qh = 0, qt = 0;
    q[qt++] = start; seen[start] = 1; prev[start] = start;
    while (qh < qt && !seen[target]) {
      const k = q[qh++], x = k % W, z = (k / W) | 0;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const nk = nz * W + nx; if (seen[nk] || !passable(nx, nz, canBreak)) continue;
        seen[nk] = 1; prev[nk] = k; q[qt++] = nk;
      }
    }
    if (!seen[target]) return null;
    let k = target;
    for (let guard = 0; guard < N && prev[k] !== start; guard++) k = prev[k];
    return { x: k % W, z: (k / W) | 0 };
  };
  w.followPath = (e, gx_, gz_, speed, dt, canBreak = false) => {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) return 0;
    e.pathT = (e.pathT || 0) - dt;
    const gx = toCell(gx_), gz = toCell(gz_);
    if (e.pathT <= 0 || e.pgx !== gx || e.pgz !== gz) {
      e.pathT = 0.3; e.pgx = gx; e.pgz = gz;
      const s = w.nextStep(toCell(e.x), toCell(e.z), gx, gz, canBreak);
      e.nx = s ? cellCenter(s.x) : gx_; e.nz = s ? cellCenter(s.z) : gz_;
    }
    const dx = e.nx - e.x, dz = e.nz - e.z, dd = Math.hypot(dx, dz);
    if (dd > 0.01) { const st = Math.min(dd, speed * dt), px = e.x, pz = e.z; e.x += dx / dd * st; e.z += dz / dd * st; e.dirx = dx / dd; e.dirz = dz / dd; e.moved = Math.hypot(e.x - px, e.z - pz); }
    return Math.hypot(gx_ - e.x, gz_ - e.z);
  };
  w.hallCells = []; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (grid[z][x] === '.') w.hallCells.push([x, z]);
  w.randHall = (rand = Math.random) => { const [x, z] = w.hallCells[(rand() * w.hallCells.length) | 0]; return { x: cellCenter(x), z: cellCenter(z) }; };
  w.cellOfDoor = (door) => ({ x: cellCenter(door.cx), z: cellCenter(door.cz) });
  // exits: world position just inside each exit
  w.exitPos = w.exitDoors.map((d) => ({ x: cellCenter(d.cx), z: cellCenter(d.cz), inner: { x: cellCenter(d.cx + (d.cx === 0 ? 2 : -2)), z: cellCenter(d.cz) } }));
  return w;
}
export { CELL, WALLH, W, H, cellCenter, toCell };
