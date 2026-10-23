/* Rooftop Chess server: serves the app at /chess/ and runs online play on /chess/ws (see chess-server.js) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createChessServer } = require('./chess-server');
const { chatClean } = require('./filter');

const PORT = process.env.PORT || 8080;
const DIR = path.join(__dirname, 'public');
const CHESS = createChessServer({ cleanName: s => chatClean(String(s == null ? '' : s).replace(/[<>]/g, '').slice(0, 20)) });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function serveApp(req, res, url) {
  if (url === '/chess') { res.writeHead(301, { Location: '/chess/' }); res.end(); return; }
  let rel;
  try { rel = decodeURIComponent(url.slice('/chess/'.length)) || 'index.html'; } catch (e) { res.writeHead(400); res.end(); return; }
  const file = path.normalize(path.join(DIR, rel));
  if (!file.startsWith(DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || rel === 'sw.js' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/chess' || url.startsWith('/chess/')) return serveApp(req, res, url);
  if (url === '/health') { const s = CHESS.stats(); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Rooftop Chess is running. Online now: ' + s.online + ', games: ' + s.games + '\n'); return; }
  // the app lives at /chess/ (its links and the online connection expect that path)
  res.writeHead(302, { Location: '/chess/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }); res.end();
});
server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').split('?')[0] === '/chess/ws') return CHESS.handleUpgrade(req, socket, head);
  socket.destroy();
});
server.listen(PORT, () => console.log('Rooftop Chess listening on port ' + PORT));
