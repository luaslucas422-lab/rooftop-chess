/* Rooftop Chess server: serves the app at /chess/ and runs online play on /chess/ws (see chess-server.js) */
const http = require('http');
const { createChessServer } = require('./chess-server');
const { chatClean } = require('./filter');

const PORT = process.env.PORT || 8080;
const CHESS = createChessServer({ cleanName: s => chatClean(String(s == null ? '' : s).replace(/[<>]/g, '').slice(0, 20)) });

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/chess' || url.startsWith('/chess/')) return CHESS.serve(req, res, url);
  if (url === '/health') { const s = CHESS.stats(); res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Rooftop Chess is running. Online now: ' + s.online + ', games: ' + s.games + '\n'); return; }
  // the app lives at /chess/ (its links and the online connection expect that path)
  res.writeHead(302, { Location: '/chess/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }); res.end();
});
server.on('upgrade', (req, socket, head) => {
  if ((req.url || '').split('?')[0] === '/chess/ws') return CHESS.handleUpgrade(req, socket, head);
  socket.destroy();
});
server.listen(PORT, () => console.log('Rooftop Chess listening on port ' + PORT));
