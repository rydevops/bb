// Classic-style schoolhouse (single floor), pure data - no three.js, so it can be unit-tested in Node.
// Layout (after Baldi's Basics Classic): you start at the SOUTH exit and walk into a four-way hub. West, east and north
// of the hub are yellow swinging doors that stay locked until notebook 2. Beyond them: a hall ring around the school with
// 7 classrooms, 5 faculty rooms, the Principal's office, a cafeteria and four exits (south start, west, east, cafeteria).
// '#' wall, '.' hall, 'r' room floor, 'o' office, 'D' door (or swinging gate), 'L' locked door, 'E' exit
export const W = 47, H = 39, CELL = 8, WALLH = 9;

export function buildMap(mirror = false) {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const fill = (x0, z0, x1, z1, ch) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; };
  const rooms = []; let office = null, jdRoom = null;
  // doors always sit on a north or south wall of the room
  const room = (id, kind, x0, z0, x1, z1, doorX, doorZ) => {
    const isOffice = kind === 'office';
    fill(x0, z0, x1, z1, isOffice ? 'o' : 'r'); g[doorZ][doorX] = isOffice ? 'L' : 'D';
    const r = { id, kind, x0, z0, x1, z1, door: [doorX, doorZ] };
    if (isOffice) office = r; else { rooms.push(r); if (kind === 'jd') jdRoom = r; }
    return r;
  };
  // ---- halls (3 cells = 24 units wide)
  fill(1, 8, 45, 10, '.');      // top hall
  fill(1, 8, 3, 26, '.');       // west hall
  fill(43, 8, 45, 26, '.');     // east hall
  fill(1, 24, 45, 26, '.');     // hub hall (the start hub is its middle section)
  fill(22, 11, 24, 23, '.');    // north corridor: top hall <-> hub
  fill(22, 27, 24, 37, '.');    // south corridor: hub <-> start / south exit
  // ---- north row (doors on z = 7 facing the top hall)
  room('C3', 'class', 2, 1, 8, 6, 5, 7);
  room('C4', 'class', 10, 1, 16, 6, 13, 7);
  room('CAF', 'cafeteria', 18, 1, 28, 6, 23, 7);
  room('C5', 'class', 30, 1, 36, 6, 33, 7);
  room('C6', 'class', 38, 1, 44, 6, 41, 7);
  // ---- inner north row (doors on z = 11 facing the top hall)
  room('OFFICE', 'office', 6, 12, 12, 16, 9, 11);
  room('JD', 'jd', 14, 12, 20, 16, 17, 11);
  room('C7', 'class', 26, 12, 32, 16, 29, 11);
  room('F4', 'faculty', 34, 12, 40, 16, 37, 11);
  // ---- start rooms (doors on z = 23 facing the hub) and the two start faculty rooms (doors on z = 27)
  room('C1', 'class', 16, 18, 20, 22, 18, 23);
  room('C2', 'class', 26, 18, 30, 22, 28, 23);
  room('F1', 'faculty', 16, 28, 20, 34, 18, 27);
  room('F2', 'faculty', 26, 28, 30, 34, 28, 27);
  // ---- beyond the hub gates (south row)
  room('F5', 'faculty', 5, 28, 12, 34, 8, 27);
  room('F3', 'faculty', 34, 28, 41, 34, 37, 27);
  // ---- swinging gates (yellow doors): locked until notebook 2
  const gates = [];
  for (let z = 24; z <= 26; z++) { g[z][15] = 'D'; gates.push({ x: 15, z, alongX: false }); g[z][31] = 'D'; gates.push({ x: 31, z, alongX: false }); }
  for (let x = 22; x <= 24; x++) { g[17][x] = 'D'; gates.push({ x, z: 17, alongX: true }); }
  // ---- four exits: south (start), west, east, and the cafeteria (north)
  g[38][23] = 'E'; g[17][0] = 'E'; g[17][46] = 'E'; g[0][23] = 'E';
  const exits = [[23, 38], [0, 17], [46, 17], [23, 0]];
  const start = { x: 23, z: 36 }, hubCam = { x: 23, z: 25 };
  const vending = [{ cx: 21, cz: 27, face: -1 }, { cx: 20, cz: 7, face: 1 }];          // against the hub hall's south wall and the top hall's north wall
  const sweepLines = [{ a: [2, 9], b: [44, 9] }, { a: [2, 9], b: [2, 25] }, { a: [44, 9], b: [44, 25] }, { a: [2, 25], b: [13, 25] }, { a: [33, 25], b: [44, 25] }];
  const zone = { startX: [16, 30], startZ: [17, 37] };   // the region reachable before the gates open
  const map = { grid: g, rooms, office, exits, jdRoom, gates, start, hubCam, vending, sweepLines, zone, mirror };
  if (mirror) {   // Mirror Mode: flip the whole school left to right
    for (const row of g) row.reverse();
    const fx = (x) => W - 1 - x;
    for (const r of [...rooms, office]) { const a = fx(r.x1), b = fx(r.x0); r.x0 = a; r.x1 = b; r.door = [fx(r.door[0]), r.door[1]]; }
    exits.forEach((e) => { e[0] = fx(e[0]); }); gates.forEach((q) => { q.x = fx(q.x); });
    start.x = fx(start.x); hubCam.x = fx(hubCam.x); vending.forEach((v) => { v.cx = fx(v.cx); });
    sweepLines.forEach((l) => { l.a[0] = fx(l.a[0]); l.b[0] = fx(l.b[0]); }); zone.startX = [fx(zone.startX[1]), fx(zone.startX[0])];
  }
  return map;
}
export const cellCenter = (c) => (c + 0.5) * CELL;
export const toCell = (v) => Math.floor(v / CELL);
