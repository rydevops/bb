// Classic-style layout checks: counts, connectivity, gates, exits, mirror.
import assert from 'assert';
import { buildMap, W, H } from '../js/map.js';

function check(mirror) {
  const m = buildMap(mirror), g = m.grid, tag = mirror ? 'mirror' : 'normal';
  assert.strictEqual(g.length, H); g.forEach((r) => assert.strictEqual(r.length, W));
  const kinds = (k) => m.rooms.filter((r) => r.kind === k);
  assert.strictEqual(kinds('class').length, 7, 'seven classrooms'); assert.strictEqual(kinds('faculty').length, 5, 'five faculty rooms');
  assert.strictEqual(kinds('cafeteria').length, 1); assert.strictEqual(kinds('jd').length, 1); assert.ok(m.office && g[m.office.door[1]][m.office.door[0]] === 'L');
  assert.strictEqual(m.exits.length, 4);
  m.exits.forEach(([x, z]) => assert.strictEqual(g[z][x], 'E', `exit cell ${x},${z}`));
  assert.strictEqual(g[m.start.z][m.start.x], '.', 'start is in a hall');
  // every room door: one side hall, other side the room, and it sits on a north/south wall
  for (const r of [...m.rooms, m.office]) {
    const [dx, dz] = r.door; assert.ok('DL'.includes(g[dz][dx]), `door cell of ${r.id}`);
    const inside = dz < r.z0 ? [dx, dz + 1] : [dx, dz - 1], outside = dz < r.z0 ? [dx, dz - 1] : [dx, dz + 1];
    assert.ok('ro'.includes(g[inside[1]][inside[0]]), `${r.id} door leads inside`); assert.strictEqual(g[outside[1]][outside[0]], '.', `${r.id} door opens onto a hall`);
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) assert.ok('ro'.includes(g[z][x]), `${r.id} floor ${x},${z}`);
  }
  // flood fill: gates closed => only the start zone; gates open => everything
  const flood = (openGates) => {
    const seen = new Set(), q = [[m.start.x, m.start.z]], gate = new Set(m.gates.map((q2) => q2.x + ',' + q2.z));
    while (q.length) { const [x, z] = q.pop(), k = x + ',' + z; if (seen.has(k) || x < 0 || z < 0 || x >= W || z >= H) continue; const c = g[z][x];
      if (c === '#' || c === 'E') { if (c === 'E') seen.add(k); continue; } if (gate.has(k) && !openGates) continue; seen.add(k); q.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]); }
    return seen;
  };
  const before = flood(false), after = flood(true);
  const roomReached = (set, r) => set.has(r.door[0] + ',' + r.door[1]);
  const startClasses = kinds('class').filter((r) => roomReached(before, r)).map((r) => r.id).sort();
  assert.deepStrictEqual(startClasses, ['C1', 'C2'], `${tag}: two classrooms (notebooks 1 and 2) are reachable before the gates`);
  assert.strictEqual(kinds('class').filter((r) => !roomReached(after, r)).length, 0, 'all classrooms reachable once the gates open');
  for (const r of [...m.rooms, m.office]) assert.ok(roomReached(after, r), `${r.id} reachable`);
  m.exits.forEach(([x, z]) => assert.ok(after.has(x + ',' + z), `exit ${x},${z} reachable`));
  assert.ok(before.has(m.exits[0][0] + ',' + m.exits[0][1]), 'start exit reachable before the gates (the 4-way hub)');
  assert.ok(!before.has(m.exits[1][0] + ',' + m.exits[1][1]) && !before.has(m.exits[2][0] + ',' + m.exits[2][1]), 'far exits are behind the gates');
  assert.ok(!roomReached(before, m.jdRoom) && !roomReached(before, m.office), "JD's room and the office are behind the gates");
  // the three gates form complete cuts (3 cells each) around the hub
  assert.strictEqual(m.gates.length, 9);
  // a ring exists: the top hall connects west and east halls
  assert.ok(after.has('1,9') && after.has('45,9') && after.has('23,9'));
  m.vending.forEach((v) => assert.strictEqual(g[v.cz][v.cx], '#', 'vending machines stand against a wall'));
  m.sweepLines.forEach((l) => { [l.a, l.b].forEach(([x, z]) => assert.strictEqual(g[z][x], '.', 'sweep line ends in a hall')); });
}
check(false); check(true);
console.log('map tests passed');
