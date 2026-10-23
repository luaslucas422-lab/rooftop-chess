/* Online play test: starts the real server, two players find each other, play, resign, rematch, friend challenge.
   Run: node test/online.test.js [server entry file, default ../server.js] */
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const dataFile = path.join(require('os').tmpdir(), 'chess-test-' + PORT + '.json');
const entry = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'server.js');
const srv = spawn(process.execPath, [entry], { env: Object.assign({}, process.env, { PORT, DATABASE_URL: '' , CHESS_DATA_FILE: dataFile }), stdio: ['ignore', 'pipe', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
function client(token, name) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/chess/ws');
  const inbox = [];
  const c = { ws, inbox, send: o => ws.send(JSON.stringify(o)),
    next: (t, ms) => new Promise((res, rej) => { const t0 = Date.now(); const iv = setInterval(() => { const i = inbox.findIndex(m => m.t === t); if (i >= 0) { clearInterval(iv); res(inbox.splice(i, 1)[0]); } else if (Date.now() - t0 > (ms || 4000)) { clearInterval(iv); rej(new Error(name + ' waited for ' + t + '; got ' + inbox.map(m => m.t).join(','))); } }, 10); }) };
  ws.on('message', d => inbox.push(JSON.parse(d)));
  return new Promise(res => ws.on('open', () => { c.send({ t: 'hello', token, name }); res(c); }));
}
(async () => {
  for (let i = 0; i < 50; i++) { try { await new Promise((res, rej) => require('http').get('http://127.0.0.1:' + PORT + '/chess/', r => r.statusCode === 200 ? res() : rej()).on('error', rej)); break; } catch (e) { await wait(100); } }
  const a = await client('a'.repeat(48), 'Alice'), b = await client('b'.repeat(48), 'Bob');
  const wa = await a.next('welcome'), wb = await b.next('welcome');
  assert.strictEqual(wa.name, 'Alice'); assert.strictEqual(wa.ratings.blitz.r, 1200);
  a.send({ t: 'seek', tc: '3+2' }); b.send({ t: 'seek', tc: '3+2' });
  const ga = await a.next('game'), gb = await b.next('game');
  assert.strictEqual(ga.id, gb.id); assert.notStrictEqual(ga.you, gb.you); assert.deepStrictEqual(ga.clock, [180000, 180000]);
  const W = ga.you === 'w' ? a : b, B = ga.you === 'w' ? b : a, id = ga.id;
  // illegal move and out-of-turn move are refused
  B.send({ t: 'move', id, uci: 'e7e5', ply: 0 }); await B.next('error');
  W.send({ t: 'move', id, uci: 'e2e5', ply: 0 }); await W.next('game');
  const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'];
  for (let i = 0; i < moves.length; i++) { (i % 2 ? B : W).send({ t: 'move', id, uci: moves[i], ply: i }); const ma = await a.next('move'); await b.next('move'); assert.strictEqual(ma.uci, moves[i]); assert.strictEqual(ma.ply, i + 1); }
  // clocks run after both first moves and increments apply
  await wait(300); B.send({ t: 'move', id, uci: 'g8f6', ply: 5 }); const mv = await a.next('move'); await b.next('move');
  assert(mv.clock[1] < 184000 && mv.clock[1] > 183000, 'black clock: 3:00 + two 2s increments - thinking time, got ' + mv.clock[1]);
  // draw offer declined by moving, then resign
  W.send({ t: 'draw', id, op: 'offer' }); const off = await B.next('offer'); assert.strictEqual(off.kind, 'draw'); await W.next('offer');
  B.send({ t: 'resign', id }); const ea = await a.next('end'); await b.next('end');
  assert.strictEqual(ea.reason, 'resignation'); assert.strictEqual(ea.winner, 'w');   // Black resigned
  assert(ea.ratings.w.now !== 1200 && ea.ratings.b.now !== 1200, 'ratings changed');
  assert(/Termination "resignation"/.test(ea.pgn));
  // rematch: colors swap
  W.send({ t: 'rematch', id, op: 'offer' }); await B.next('offer'); B.send({ t: 'rematch', id, op: 'offer' });
  const r1 = await W.next('game'); await B.next('game'); assert.strictEqual(r1.you, 'b');
  W.send({ t: 'abort', id: r1.id }); const ab = await W.next('end'); await B.next('end'); assert.strictEqual(ab.reason, 'aborted'); assert.strictEqual(ab.ratings, null);
  // friend challenge by code
  a.send({ t: 'challenge', tc: '10+0', color: 'w' }); const ch = await a.next('challenge'); assert(/^[A-Z0-9]{6}$/.test(ch.code));
  b.send({ t: 'challengeInfo', code: ch.code }); const info = await b.next('challengeInfo'); assert.strictEqual(info.from.name, 'Alice');
  b.send({ t: 'accept', code: ch.code.toLowerCase() }); const fa = await a.next('game'); await b.next('game'); assert.strictEqual(fa.you, 'w'); assert.strictEqual(fa.rated, false);
  // fool's mate ends the game by checkmate
  const fm = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
  for (let i = 0; i < fm.length; i++) { (i % 2 ? b : a).send({ t: 'move', id: fa.id, uci: fm[i], ply: i }); await a.next('move'); await b.next('move'); }
  const em = await a.next('end'); assert.strictEqual(em.reason, 'checkmate'); assert.strictEqual(em.winner, 'b'); assert.strictEqual(em.ratings, null);
  // reconnect: a new socket for the same token replaces the old one; leaderboard lists both
  const a2 = await client('a'.repeat(48), 'Alice'); await a2.next('welcome'); await a.next('replaced');
  a2.send({ t: 'leaders', cat: 'blitz' }); const lb = await a2.next('leaders'); assert.strictEqual(lb.list.length, 2);
  // the app's files are served
  const html = await new Promise(res => require('http').get('http://127.0.0.1:' + PORT + '/chess/js/chess.js', r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res([r.statusCode, s])); }));
  assert.strictEqual(html[0], 200); assert(html[1].includes('class Position'));
  const bad = await new Promise(res => require('http').get('http://127.0.0.1:' + PORT + '/chess/..%2findex.js', r => res(r.statusCode)));
  assert.notStrictEqual(bad, 200);
  // a broken %-escape must not take the server down
  const broken = await new Promise(res => require('http').get('http://127.0.0.1:' + PORT + '/chess/%E0%A4%A', r => res(r.statusCode)));
  assert.strictEqual(broken, 400);
  const alive = await new Promise(res => require('http').get('http://127.0.0.1:' + PORT + '/chess/', r => res(r.statusCode)));
  assert.strictEqual(alive, 200);
  console.log('online ok');
  srv.kill(); try { fs.unlinkSync(dataFile); } catch (e) {} process.exit(0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
