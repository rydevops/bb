const CACHE = 'jd-dev';
const ASSETS = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/main.js', 'js/state.js', 'js/config.js', 'js/ai.js', 'js/save.js', 'js/render.js', 'js/world.js', 'js/map.js', 'js/art.js', 'js/audio.js', 'js/game.js', 'js/actors.js', 'js/modes.js', 'js/ui.js', 'js/lbai.js', 'js/lessonb.js',
  'config/ai.json', 'config/characters.json', 'data/lessonb/teacher.json', 'data/lessonb/presets.json', 'data/lessonb/items.json', 'data/lessonb/characters.json', 'data/lessonb/variants/b.json', 'vendor/three.module.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ASSETS.map((a) => c.add(new Request(a, { cache: 'no-cache' }))))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// network-first so updates always show up; the precache is the offline fallback (the app is fully playable offline)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
