// Spec section 7 budgets: total precache < 40 MB, first load < 12 MB, JS (excluding three.js) < 400 KB gzipped.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib'; import assert from 'assert';
const root = new URL('..', import.meta.url).pathname;
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const list = [...sw.matchAll(/'([^']+\.[a-z0-9]+|\.\/)'/g)].map((m) => m[1]).filter((f) => f !== './' && !f.startsWith('http'));
let total = 0, js = 0;
for (const f of list) {
  const p = path.join(root, f);
  assert.ok(fs.existsSync(p), `precache entry missing on disk: ${f}`);
  const b = fs.readFileSync(p); total += b.length;
  if (f.endsWith('.js') && !f.startsWith('vendor/')) js += zlib.gzipSync(b).length;
}
console.log(`precache ${(total / 1e6).toFixed(2)} MB, game JS ${(js / 1024).toFixed(0)} KB gzipped`);
assert.ok(total < 12e6, 'first-load budget (12 MB)');
assert.ok(js < 400 * 1024, 'JS budget (400 KB gzipped)');
console.log('budget tests passed');
