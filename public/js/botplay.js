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
  /* Tuned with tools/calibrate-bots.js so each bot beats the one below it about three games in four
     (roughly 200 rating points a step). The ratings shown in the app come from those measurements. */
  const LEVELS = {
    pip: { depth: 1, noise: 280, blunder: 0.25 },
    juniper: { depth: 1, noise: 210, blunder: 0.14, book: 0.3 },
    otto: { depth: 1, noise: 130, blunder: 0.07, book: 0.5, mateSense: true },
    mabel: { depth: 2, noise: 135, blunder: 0.052, book: 0.65, mateSense: true },
    ravi: { depth: 2, noise: 100, blunder: 0.035, book: 0.75, mateSense: true },
    selma: { depth: 2, noise: 75, blunder: 0.02, book: 0.8, mateSense: true },
    hector: { depth: 2, noise: 50, blunder: 0.008, book: 0.85, mateSense: true },
    yuki: { nodes: 600, book: 0.9 },
    dmitri: { nodes: 900, book: 0.9 },
    wren: { nodes: 1500, book: 0.9 },
    atlas: { nodes: 2400, book: 0.9 },
    titan: { time: 2500, nodes: 1500000, book: 0.9 },
  };
  /* the bots' ratings, measured with tools/calibrate-bots.js (Titan's is an estimate) */
  const RATINGS = { pip: 250, juniper: 450, otto: 650, mabel: 850, ravi: 1050, selma: 1250, hector: 1450, yuki: 1650, dmitri: 1900, wren: 2100, atlas: 2350, titan: 2800 };
  const LADDER = Object.keys(RATINGS);
  const MIN_ELO = 100, MAX_ELO = 3500;
  /* how a bot of any rating (100–3500) plays. Between two measured bots it plays each move like one or the other, as often as
     its rating is close to each; below Pip it blunders more; above Titan it thinks longer (up to 10 s a move at 3500 – how
     much stronger that really makes it than Titan hasn't been measured, the engine can only see so much deeper). */
  function forElo(elo) {
    elo = Math.max(MIN_ELO, Math.min(MAX_ELO, Math.round(+elo || 0)));
    if (elo <= RATINGS.pip) { const t = (RATINGS.pip - elo) / (RATINGS.pip - MIN_ELO); return Object.assign({}, LEVELS.pip, { blunder: 0.25 + 0.25 * t, noise: 280 + 120 * t, elo }); }
    if (elo >= RATINGS.titan) { const t = (elo - RATINGS.titan) / (MAX_ELO - RATINGS.titan); return Object.assign({}, LEVELS.titan, { time: Math.round(2500 + 7500 * t), nodes: Math.round(1500000 * (1 + 4 * t)), elo }); }
    for (let i = 1; i < LADDER.length; i++) {
      const lo = LADDER[i - 1], hi = LADDER[i];
      if (elo > RATINGS[hi]) continue;
      const t = (elo - RATINGS[lo]) / (RATINGS[hi] - RATINGS[lo]);
      if (t <= 0) return Object.assign({ elo }, LEVELS[lo]);
      if (t >= 1) return Object.assign({ elo }, LEVELS[hi]);
      return { mix: { lo: LEVELS[lo], hi: LEVELS[hi], t }, elo };
    }
  }
  function gauss(rand) { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* the bot's move in this position. S: an Engine.Searcher · history: earlier positions (for repetitions) · sans: moves so far
     returns { uci, book } or null when there are no moves */
  function choose(S, pos, history, sans, L, rand) {
    const Engine = getEngine(), Openings = getOpenings();
    rand = rand || Math.random; L = L || {};
    if (L.mix) L = rand() < L.mix.t ? L.mix.hi : L.mix.lo;   // a bot between two measured ones (see forElo)
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
  return { LEVELS, RATINGS, MIN_ELO, MAX_ELO, forElo, choose };
});
