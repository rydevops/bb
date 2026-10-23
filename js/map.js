// School layout. '#' wall, '.' hall, 'r' classroom, 'o' office, 'D' door, 'L' locked door, 'E' exit
export const W = 31, H = 25, CELL = 8, WALLH = 9;

export function buildMap() {
  const g = Array.from({ length: H }, () => Array(W).fill('#'));
  const fill = (x0, z0, x1, z1, ch) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z][x] = ch; };
  fill(1, 7, 29, 9, '.');      // top hall
  fill(1, 15, 29, 17, '.');    // bottom hall
  fill(1, 7, 3, 17, '.');      // left hall
  fill(27, 7, 29, 17, '.');    // right hall
  const rooms = [];
  const spans = [[1, 6, 3], [8, 14, 11], [16, 22, 19], [24, 29, 26]];
  spans.forEach(([a, b, d], i) => {
    fill(a, 1, b, 5, 'r'); g[6][d] = 'D'; rooms.push({ id: 'T' + i, x0: a, x1: b, z0: 1, z1: 5, door: [d, 6], side: 'top' });
    fill(a, 19, b, 23, 'r'); g[18][d] = 'D'; rooms.push({ id: 'B' + i, x0: a, x1: b, z0: 19, z1: 23, door: [d, 18], side: 'bottom' });
  });
  fill(5, 11, 10, 13, 'r'); g[14][7] = 'D'; rooms.push({ id: 'M1', x0: 5, x1: 10, z0: 11, z1: 13, door: [7, 14], side: 'bottom' });
  fill(20, 11, 25, 13, 'r'); g[10][23] = 'D'; rooms.push({ id: 'M3', x0: 20, x1: 25, z0: 11, z1: 13, door: [23, 10], side: 'top' });
  fill(12, 11, 18, 13, 'o'); g[10][15] = 'L';
  const office = { id: 'OFFICE', x0: 12, x1: 18, z0: 11, z1: 13, door: [15, 10], side: 'top' };
  g[12][0] = 'E'; g[12][30] = 'E';
  return { grid: g, rooms, office };
}

export const cellCenter = (c) => (c + 0.5) * CELL;
export const toCell = (v) => Math.floor(v / CELL);
