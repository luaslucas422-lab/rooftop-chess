/* Rooftop Chess – keeps a copy of the app on the phone so it works offline (online play aside).
   Files are fetched fresh whenever there's a connection, so updates show up on their own. */
const VERSION = 'rc-1.2.0';
const FILES = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/chess.js', 'js/engine.js', 'js/engine-worker.js', 'js/botplay.js', 'js/openings.js', 'js/rating.js', 'js/pieces.js', 'js/puzzles.js', 'js/sound.js', 'js/board.js',
  'js/core.js', 'js/net.js', 'js/coach.js', 'js/play.js', 'js/puzzle-ui.js', 'js/analysis.js', 'js/learn.js', 'js/piece-editor.js', 'js/app.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
/* network first (so updates show up), falling back to the saved copy when offline */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
