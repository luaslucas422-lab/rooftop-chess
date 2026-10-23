/* Online play test: starts the real server, two players find each other, play, resign, rematch, friend challenge,
   then restarts the server with its data gone and checks ratings come back from the players' signed cards.
   Run: node test/online.test.js [server entry file, default ../server.js] */
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const entry = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'server.js');
const SECRET = 'test-secret-' + Math.random();
const wait = ms => new Promise(r => setTimeout(r, ms));
const files = [];
async function startServer() {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const dataFile = path.join(require('os').tmpdir(), 'chess-test-' + port + '-' + Date.now() + '.json'); files.push(dataFile);
  const proc = spawn(process.execPath, [entry], { env: Object.assign({}, process.env, { PORT: port, DATABASE_URL: '', CHESS_DATA_FILE: dataFile, CHESS_SECRET: SECRET }), stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 80; i++) { try { await new Promise((res, rej) => http.get('http://127.0.0.1:' + port + '/chess/', r => r.statusCode === 200 ? res() : rej()).on('error', rej)); break; } catch (e) { await wait(100); } }
  return { port, proc, stop: () => new Promise(res => { proc.once('exit', res); proc.kill(); }) };
}
const get = (port, url) => new Promise(res => http.get('http://127.0.0.1:' + port + url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res([r.statusCode, s])); }));
function client(port, token, name, card) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/chess/ws');
  const inbox = [];
  const c = { ws, inbox, send: o => ws.send(JSON.stringify(o)),
    next: (t, ms) => new Promise((res, rej) => { const t0 = Date.now(); const iv = setInterval(() => { const i = inbox.findIndex(m => m.t === t); if (i >= 0) { clearInterval(iv); res(inbox.splice(i, 1)[0]); } else if (Date.now() - t0 > (ms || 4000)) { clearInterval(iv); rej(new Error(name + ' waited for ' + t + '; got ' + inbox.map(m => m.t).join(','))); } }, 10); }) };
  ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'p') return c.send({ t: 'pp', i: m.i }); inbox.push(m); });   // answer lag probes like the app does
  return new Promise(res => ws.on('open', () => { c.send({ t: 'hello', token, name, card }); res(c); }));
}
let S = null;
(async () => {
  S = await startServer(); const P = S.port;
  const a = await client(P, 'a'.repeat(48), 'Alice'), b = await client(P, 'b'.repeat(48), 'Bob');
  const wa = await a.next('welcome'); await b.next('welcome');
  assert.strictEqual(wa.name, 'Alice'); assert.strictEqual(wa.ratings.blitz.r, 1200); assert(wa.card, 'a rating card comes with the welcome');
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
  // draw offer, then resign
  W.send({ t: 'draw', id, op: 'offer' }); const off = await B.next('offer'); assert.strictEqual(off.kind, 'draw'); await W.next('offer');
  B.send({ t: 'resign', id }); const ea = await a.next('end'); await b.next('end');
  assert.strictEqual(ea.reason, 'resignation'); assert.strictEqual(ea.winner, 'w');   // Black resigned
  assert(ea.ratings.w.now !== 1200 && ea.ratings.b.now !== 1200, 'ratings changed');
  assert(/Termination "resignation"/.test(ea.pgn));
  const cardA = (await a.next('card')).card, cardB = (await b.next('card')).card;
  const ratingA = ea.ratings[ga.you].now, ratingB = ea.ratings[gb.you].now;
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
  const a2 = await client(P, 'a'.repeat(48), 'Alice'); await a2.next('welcome'); await a.next('replaced');
  a2.send({ t: 'leaders', cat: 'blitz' }); const lb = await a2.next('leaders'); assert.strictEqual(lb.list.length, 2);
  // a player whose game the server forgot gets told so
  a2.send({ t: 'sync' }); await a2.next('nogame');
  // the app's files are served; bad paths aren't
  const js = await get(P, '/chess/js/chess.js'); assert.strictEqual(js[0], 200); assert(js[1].includes('class Position'));
  assert.notStrictEqual((await get(P, '/chess/..%2findex.js'))[0], 200);
  // a broken %-escape must not take the server down
  assert.strictEqual((await get(P, '/chess/%E0%A4%A'))[0], 400);
  assert.strictEqual((await get(P, '/chess/'))[0], 200);
  for (const c of [a, b, a2]) c.ws.close();
  await S.stop();

  // the server restarts and its data is gone: ratings come back from the signed cards
  S = await startServer(); const Q = S.port;
  const a3 = await client(Q, 'a'.repeat(48), 'Alice', cardA); const w3 = await a3.next('welcome');
  assert.strictEqual(w3.ratings.blitz.r, ratingA, 'Alice’s rating restored from her card');
  // a card can't be edited...
  const [body, sig] = cardB.split('.'), o = JSON.parse(Buffer.from(body, 'base64url').toString());
  o.ratings.blitz.r = 2900;
  const forged = Buffer.from(JSON.stringify(o)).toString('base64url') + '.' + sig;
  const b3 = await client(Q, 'b'.repeat(48), 'Bob', forged); assert.strictEqual((await b3.next('welcome')).ratings.blitz.r, 1200, 'an edited card is ignored');
  // ...or used by someone else
  const c3 = await client(Q, 'c'.repeat(48), 'Cara', cardA); assert.strictEqual((await c3.next('welcome')).ratings.blitz.r, 1200, 'someone else’s card is ignored');
  // Bob's real card still works on a fresh connection
  b3.ws.close(); await wait(50);
  const b4 = await client(Q, 'b'.repeat(48), 'Bob', cardB); assert.strictEqual((await b4.next('welcome')).ratings.blitz.r, ratingB);
  console.log('online ok');
  await S.stop(); for (const f of files) try { fs.unlinkSync(f); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error(e); if (S) S.proc.kill(); process.exit(1); });
