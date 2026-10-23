/* Rooftop Chess – how each bot picks its moves. Shared by the app's engine thread and tools/calibrate-bots.js,
   so the strengths measured by the calibration are exactly the ones people play against.
   Weaker bots look only a move or two ahead and pick among good-ish moves with some randomness, like people do;
   the strongest search a fixed amount (not a fixed time), so they play the same on a fast computer and a slow phone. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess.js'), () => require('./engine.js'), () => require('./openings.js'));
  else root.BotPlay = factory(root.Chess, () => root.Engine, () => root.Openings);
})(typeof self !== 'undefined' ? self : this, function (Chess, getEngine, getOpenings) {
  'use strict';
  /* depth: how far ahead it looks · noise: how loosely it picks between moves (in centipawns) · blunder: chance of a random move
     pv: how many candidate moves it weighs · nodes / time: search budget for the strong bots · book: chance of playing a known opening move */
  const LEVELS = {
    pip: { depth: 1, noise: 320, blunder: 0.3 },
    juniper: { depth: 1, noise: 190, blunder: 0.12, book: 0.3 },
    otto: { depth: 2, noise: 140, blunder: 0.06, book: 0.5, mateSense: true },
    mabel: { depth: 2, noise: 95, blunder: 0.03, book: 0.65, mateSense: true },
    ravi: { depth: 2, noise: 60, blunder: 0.012, book: 0.75, mateSense: true },
    selma: { depth: 3, pv: 5, noise: 42, book: 0.8, mateSense: true },
    hector: { depth: 3, pv: 4, noise: 26, book: 0.85, mateSense: true },
    yuki: { depth: 4, pv: 4, noise: 16, book: 0.9, mateSense: true },
    dmitri: { nodes: 120000, book: 0.9 },
    wren: { nodes: 450000, book: 0.9 },
    atlas: { time: 2500, book: 0.9 },
  };
  function gauss(rand) { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* the bot's move in this position. S: an Engine.Searcher · history: earlier positions (for repetitions) · sans: moves so far
     returns { uci, book } or null when there are no moves */
  function choose(S, pos, history, sans, L, rand) {
    const Engine = getEngine(), Openings = getOpenings();
    rand = rand || Math.random; L = L || {};
    const legal = pos.legalMoves();
    if (!legal.length) return null;
    if (L.book && sans && sans.length < 14 && rand() < L.book) {
      const next = Openings.next(sans);
      if (next.length) { const g = new Chess.Game(pos.fen()); const r = g.move(next[Math.floor(rand() * next.length)]); if (r) return { uci: r.uci, book: true }; }
    }
    if (L.time || L.nodes) {
      const r = S.think(pos, { time: L.time || 15000, nodes: L.nodes, history });
      return { uci: Chess.toUci(r.best) };
    }
    let list;
    if (L.pv) { const r = S.think(pos, { depth: L.depth, multiPV: L.pv, history, time: 8000 }); list = r.lines.map(l => ({ move: l.move, score: l.score })); }
    else list = S.scoreMoves(pos, L.depth || 1, { history, time: 4000 });
    if (!list.length) list = legal.map(m => ({ move: m, score: 0 }));
    if (L.mateSense && list[0].score > Engine.MATE_BOUND) return { uci: Chess.toUci(list[0].move) };
    if (L.blunder && rand() < L.blunder) return { uci: Chess.toUci(legal[Math.floor(rand() * legal.length)]) };
    let best = list[0], bs = -1e9;
    for (const x of list) { const s = Math.max(-2500, Math.min(2500, x.score)) + gauss(rand) * (L.noise || 0); if (s > bs) { bs = s; best = x; } }
    return { uci: Chess.toUci(best.move) };
  }
  return { LEVELS, choose };
});
