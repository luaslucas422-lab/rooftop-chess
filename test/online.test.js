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
const get = (port, url) => new Promise(res => http.get('http://127.0.0.1:' + port + url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res([r.statusCode, s, r.headers])); }));
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
  // an illegal move on the way must not cost extra time: ~400ms thinking in total
  await wait(200); B.send({ t: 'move', id, uci: 'g8g5', ply: 5 }); await B.next('game');
  await wait(200); B.send({ t: 'move', id, uci: 'g8f6', ply: 5 }); const mv = await a.next('move'); await b.next('move');
  assert(mv.clock[1] < 184000 && mv.clock[1] > 183500, 'black clock: 3:00 + two 2s increments - ~400ms thinking, got ' + mv.clock[1]);
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
  // queue choices: colors and extras have to fit; extras make the game casual
  a.inbox.length = 0; b.inbox.length = 0;
  a.send({ t: 'seek', tc: '5+0', color: 'w', takebacks: 3 }); b.send({ t: 'seek', tc: '5+0', color: 'w', takebacks: 3 });
  assert.strictEqual((await a.next('seeking')).color, 'w'); await b.next('seeking'); await wait(1500);
  assert(!a.inbox.some(m => m.t === 'game'), 'two players who both want White are not paired');
  b.send({ t: 'seek', tc: '5+0', color: 'r', takebacks: 10 }); await b.next('seeking'); await wait(1500);
  assert(!a.inbox.some(m => m.t === 'game'), 'a different number of takebacks is not paired');
  b.send({ t: 'seek', tc: '5+0', color: 'b', takebacks: 3 }); await b.next('seeking');
  const ta = await a.next('game'), tb = await b.next('game'), tid = ta.id;
  assert.strictEqual(ta.you, 'w'); assert.strictEqual(tb.you, 'b');
  assert.strictEqual(ta.rated, false); assert.strictEqual(ta.takebacks, 3); assert.deepStrictEqual(ta.takebacksLeft, { w: 3, b: 3 }); assert.strictEqual(ta.ratings, false);
  const play = async (who, uci) => { who.send({ t: 'sync' }); const n = (await who.next('game')).moves.length; who.send({ t: 'move', id: tid, uci, ply: n }); await a.next('move'); await b.next('move'); };
  for (const [who, u] of [[a, 'e2e4'], [b, 'e7e5'], [a, 'g1f3']]) await play(who, u);
  // Black takes back e5 after White already answered – no asking: both moves go at once
  b.send({ t: 'takeback', id: tid });
  const sa = await a.next('game'); await b.next('game'); const tk = await a.next('tookBack'); await b.next('tookBack');
  assert.deepStrictEqual(sa.moves, ['e2e4']); assert.strictEqual(sa.turn, 'b'); assert.deepStrictEqual(sa.takebacksLeft, { w: 3, b: 2 });
  assert.strictEqual(tk.from, 'b'); assert.strictEqual(tk.left, 2);
  // just after your own move, only that move goes; after three, there are none left
  for (let i = 0; i < 2; i++) { await play(b, 'c7c5'); b.send({ t: 'takeback', id: tid }); const st = await b.next('game'); await a.next('game'); assert.deepStrictEqual(st.moves, ['e2e4']); }
  await play(b, 'c7c5');
  b.inbox.length = 0; b.send({ t: 'takeback', id: tid }); assert(/no takebacks left/.test((await b.next('error')).msg));
  a.send({ t: 'takeback', id: tid }); const sw = await a.next('game'); await b.next('game');
  assert.deepStrictEqual(sw.moves, []); assert.deepStrictEqual(sw.takebacksLeft, { w: 2, b: 0 });
  a.send({ t: 'abort', id: tid }); assert.strictEqual((await a.next('end')).ratings, null); await b.next('end');
  // unlimited takebacks
  a.inbox.length = 0; b.inbox.length = 0;
  a.send({ t: 'seek', tc: '5+0', takebacks: -1 }); b.send({ t: 'seek', tc: '5+0', takebacks: -1 });
  const ua = await a.next('game'); await b.next('game'); assert.strictEqual(ua.takebacks, -1);
  const UW = ua.you === 'w' ? a : b;
  for (let i = 0; i < 5; i++) { UW.send({ t: 'move', id: ua.id, uci: 'e2e4', ply: 0 }); await a.next('move'); await b.next('move'); UW.send({ t: 'takeback', id: ua.id }); assert.strictEqual((await UW.next('game')).takebacksLeft[ua.you === 'w' ? 'w' : 'b'], -1); }
  UW.send({ t: 'abort', id: ua.id }); await a.next('end'); await b.next('end');
  // a shared clock: one time for both players (only with others who chose it; casual)
  a.inbox.length = 0; b.inbox.length = 0;
  a.send({ t: 'seek', tc: '3+2', shared: true }); b.send({ t: 'seek', tc: '3+2' }); await a.next('seeking'); await b.next('seeking'); await wait(1500);
  assert(!a.inbox.some(m => m.t === 'game'), 'a shared clock is only paired with a shared clock');
  b.send({ t: 'seek', tc: '3+2', shared: true }); await b.next('seeking');
  const sh = await a.next('game'); await b.next('game'); assert.strictEqual(sh.shared, true); assert.strictEqual(sh.rated, false);
  const SW = sh.you === 'w' ? a : b, SB = SW === a ? b : a, shMoves = [[SW, 'e2e4'], [SB, 'e7e5'], [SW, 'g1f3'], [SB, 'b8c6']];
  let shClock = null;
  for (let i = 0; i < shMoves.length; i++) {
    if (i >= 2) await wait(300);
    shMoves[i][0].send({ t: 'move', id: sh.id, uci: shMoves[i][1], ply: i }); const mv = await a.next('move'); await b.next('move');
    assert.strictEqual(mv.clock[0], mv.clock[1], 'both sides always show the same time'); shClock = mv.clock[0];
  }
  // two moves of ~300 ms thinking each, each followed by the 2 s increment, come off the one clock
  assert(shClock > 180000 + 4000 - 900 && shClock < 180000 + 4000 - 450, 'shared clock after two timed moves: ' + shClock);
  SW.send({ t: 'resign', id: sh.id }); assert.strictEqual((await a.next('end')).ratings, null); await b.next('end');
  // no takebacks in a game that wasn't set up for them
  a.inbox.length = 0; b.inbox.length = 0;
  a.send({ t: 'seek', tc: '5+0', color: 'b' }); b.send({ t: 'seek', tc: '5+0' }); await a.next('seeking'); await b.next('seeking');
  const na = await a.next('game'); await b.next('game'); assert.strictEqual(na.you, 'b'); assert.strictEqual(na.rated, true); assert.strictEqual(na.takebacks, 0);
  b.send({ t: 'move', id: na.id, uci: 'e2e4', ply: 0 }); await a.next('move'); await b.next('move');
  b.send({ t: 'takeback', id: na.id }); await wait(300); assert(!b.inbox.some(m => m.t === 'game' || m.t === 'tookBack'), 'no takebacks when they are off');
  a.send({ t: 'abort', id: na.id }); await a.next('end'); await b.next('end');

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
  const page = await get(P, '/chess/');
  assert.strictEqual(page[0], 200);
  assert(/script-src 'self'/.test(page[2]['content-security-policy'] || ''), 'the app page has a Content-Security-Policy');
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
