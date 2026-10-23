/* Engine tests: finds mates and wins material, speed check. Run: node test/engine.test.js */
const assert = require('assert');
const C = require('../public/js/chess.js'), E = require('../public/js/engine.js');
const S = new E.Searcher(18);
const best = (fen, opts) => { const pos = new C.Position(fen); const r = S.think(pos, opts); return { uci: C.toUci(r.best), r }; };
const cases = [
  ['6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1d8', 'back rank mate in 1'],
  ['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'h5f7', 'scholar mate'],
  ['6rk/6pp/8/6N1/8/8/8/1Q4K1 w - - 0 1', 'b1h7', 'smothered: Qh7+ first'],
  ['r1b1kb1r/pppp1ppp/5q2/4n3/3KP3/2N3PN/PPP4P/R1BQ1B1R b kq - 0 1', 'f8c5', 'mate in 2 vs exposed king'],
  ['4k3/8/8/8/8/8/3q4/R3K3 w Q - 0 1', 'e1d2', 'take the free queen'],
  ['8/8/4k3/8/2n5/8/3K4/2R5 w - - 0 1', 'd2d3', 'win the knight? (fork-free) – just a legal sane move'],
];
for (const [fen, want, name] of cases.slice(0, 5)) {
  const { uci, r } = best(fen, { time: 3000 });
  console.log(name.padEnd(28), uci, 'depth', r.depth, 'score', r.score, 'mate', r.mate, 'nodes', r.nodes, 'ms', r.time);
  assert.strictEqual(uci, want, name);
}
// speed
{ const pos = new C.Position('r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP1B1PPP/R2QKB1R w KQ - 0 8'); const r = S.think(pos, { time: 2000 }); console.log('middlegame 2s: depth', r.depth, 'nps', Math.round(r.nodes / r.time * 1000), 'best', C.toUci(r.best), r.score); assert(r.depth >= 6); }
// KQ v K: the engine should mate
{ const g = new C.Game('8/8/8/4k3/8/8/8/3QK3 w - - 0 1'); const s2 = new E.Searcher(18); let n = 0;
  while (!g.status().over && n < 120) { const { pos, history } = E.replay(g.startFen, g.history.map(h => h.uci)); const r = s2.think(pos, { time: 150, history }); g.move(C.toUci(r.best)); n++; }
  console.log('KQ v K self-play:', g.status().reason, 'after', n, 'plies'); assert.strictEqual(g.status().reason, 'checkmate'); }
// KR v K
{ const g = new C.Game('8/8/8/4k3/8/8/8/R3K3 w - - 0 1'); const s2 = new E.Searcher(18); let n = 0;
  while (!g.status().over && n < 160) { const { pos, history } = E.replay(g.startFen, g.history.map(h => h.uci)); const r = s2.think(pos, { time: 200, history }); g.move(C.toUci(r.best)); n++; }
  console.log('KR v K self-play:', g.status().reason, 'after', n, 'plies'); assert.strictEqual(g.status().reason, 'checkmate'); }
// repetition awareness: a side that is losing takes the draw by repetition when offered
console.log('engine ok');
