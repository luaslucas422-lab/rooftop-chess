/* Calibrates Game Review's "game rating": bots with measured ratings play each other, every game is reviewed the way
   the app reviews games, and each side's accuracy is stored next to its real rating.
   Usage: node tools/calibrate-review.js play <games> <out.json> [seed]   (run several at once with different seeds)
          node tools/calibrate-review.js fit <out.json> ...              prints Rating.ACC and Rating.FIT to paste into rating.js
   The games behind the numbers in rating.js are in tools/data/review-calibration.json. */
const fs = require('fs');
const C = require('../public/js/chess.js'), E = require('../public/js/engine.js'), O = require('../public/js/openings.js'), R = require('../public/js/rating.js');
const B = require('../public/js/botplay.js');
const { playGame, rng } = require('./calibrate-bots.js');
// the bots' ratings as measured by calibrate-bots.js (Titan's is only an estimate, so it isn't used here)
const RATING = { pip: 250, juniper: 450, otto: 650, mabel: 850, ravi: 1050, selma: 1250, hector: 1450, yuki: 1650, dmitri: 1900, wren: 2100, atlas: 2350 };
const BOTS = Object.keys(RATING);
const DEPTH = 7;   // about what the app’s review (300 ms a position) reaches on a phone or laptop

/* Game Review's verdicts for a game: each side's accuracy, like analysis.js's classify + summarize */
function review(moves) {
  const S = new E.Searcher(18), evals = [];
  for (let i = 0; i <= moves.length; i++) {
    const { pos, history } = E.replay(C.START_FEN, moves.slice(0, i));
    const st = new C.Game(pos.fen()).status();
    if (st.over && st.reason !== 'repetition') { evals.push({ score: st.reason === 'checkmate' ? (pos.turn === C.WHITE ? -E.MATE : E.MATE) : 0, mate: 0 }); continue; }
    const r = S.think(pos, { depth: DEPTH, time: 30000, history }), l = r.lines[0], w = pos.turn === C.WHITE;
    evals.push({ score: w ? l.score : -l.score, mate: w ? l.mate : -l.mate });
  }
  const g = new C.Game(), accs = { w: [], b: [] };
  moves.forEach((u, i) => {
    const rec = g.move(u), sign = rec.color === 'w' ? 1 : -1;
    accs[rec.color].push(R.moveAccuracy(Math.max(0, R.winPct(sign * R.cpOf(evals[i])) - R.winPct(sign * R.cpOf(evals[i + 1])))));
  });
  return { w: R.accuracy(accs.w), b: R.accuracy(accs.b), n: { w: accs.w.length, b: accs.b.length } };
}

if (process.argv[2] === 'play') {
  const [, , , n, out, seed] = process.argv, rand = rng(+seed || 1), res = [];
  const t0 = Date.now();
  for (let i = 0; i < +n; i++) {
    // a bot against one up to two steps away, so the games look like real ones (close-ish matchups)
    const a = Math.floor(rand() * BOTS.length), b = Math.max(0, Math.min(BOTS.length - 1, a + [-2, -1, 1, 2][Math.floor(rand() * 4)]));
    if (a === b) { i--; continue; }
    const [white, black] = rand() < 0.5 ? [BOTS[a], BOTS[b]] : [BOTS[b], BOTS[a]];
    const game = playGame(white, black, rand, B.LEVELS), rv = review(game.moves);
    const score = game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : 0.5;
    for (const [c, bot, opp, s] of [['w', white, black, score], ['b', black, white, 1 - score]])
      res.push({ bot, rating: RATING[bot], opp: RATING[opp], score: s, acc: rv[c], moves: rv.n[c] });
    fs.writeFileSync(out, JSON.stringify(res));
  }
  console.log(n, 'games in', Math.round((Date.now() - t0) / 1000) + 's');
} else if (process.argv[2] === 'fit') {
  const rows = [].concat(...process.argv.slice(3).map(f => JSON.parse(fs.readFileSync(f, 'utf8')))).filter(x => x.acc != null && x.moves >= 8);
  // 1. typical accuracy for each bot (median, so one wild game doesn't move it) → points of the accuracy → rating table
  const med = xs => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  let pts = BOTS.map(b => { const xs = rows.filter(x => x.bot === b).map(x => x.acc); return xs.length ? [med(xs), RATING[b], xs.length] : null; }).filter(Boolean);
  for (const [a, r, k] of pts) console.log(String(r).padStart(5), 'median accuracy', a.toFixed(1), ' (' + k + ' games)');
  // keep it rising: average neighbours that come out of order (pool adjacent violators)
  let blocks = pts.map(([a, r]) => ({ a, r, w: 1 }));
  for (let i = 1; i < blocks.length; i++) if (blocks[i].a < blocks[i - 1].a) { const x = blocks[i - 1], y = blocks.splice(i, 1)[0]; x.a = (x.a * x.w + y.a * y.w) / (x.w + y.w); x.r = (x.r * x.w + y.r * y.w) / (x.w + y.w); x.w += y.w; i = 0; }
  const table = blocks.map(b => [Math.round(b.a * 10) / 10, Math.round(b.r)]);
  // ends: carry the slope of the outer points on to 0% and 100% accuracy
  const ext = (p, q, at) => Math.round(p[1] + (q[1] - p[1]) * (at - p[0]) / (q[0] - p[0]));
  const full = [[0, Math.max(100, ext(table[0], table[1], 0))], ...table, [100, Math.min(3000, ext(table[table.length - 2], table[table.length - 1], 100))]];
  R.ACC.splice(0, R.ACC.length, ...full);
  // 2. how far one game's accuracy typically strays from the usual accuracy at that rating
  R.FIT.sd = Math.round(Math.sqrt(rows.reduce((s, x) => s + Math.pow(x.acc - R.accuracyAt(x.rating), 2), 0) / rows.length) * 10) / 10;
  const rms = f => Math.round(Math.sqrt(rows.reduce((s, x) => s + (f(x) - x.rating) ** 2, 0) / rows.length));
  console.log('\nsides reviewed:', rows.length, '· one game’s accuracy strays by about', R.FIT.sd, 'points');
  console.log('typical error, old formula (3200·acc^3.5):          ', rms(x => 3200 * Math.pow(x.acc / 100, 3.5)));
  console.log('typical error, accuracy table alone:                ', rms(x => R.gameRating({ acc: x.acc })));
  console.log('typical error, with the opponent and result:        ', rms(x => R.gameRating({ acc: x.acc, opp: x.opp, score: x.score })));
  // with the player's rating known only roughly (off by about 150, like an established rating)
  let seed = 7; const noise = () => { let u = 0; for (let i = 0; i < 12; i++) { seed = (seed * 16807) % 2147483647; u += seed / 2147483647; } return (u - 6) * 150; };
  console.log('typical error, also knowing their rating ±150:      ', rms(x => R.gameRating({ acc: x.acc, opp: x.opp, score: x.score, own: x.rating + noise() })));
  // a check the bots' close matchups can't make: a mismatch, where a far stronger opponent wins
  const mis = rows.filter(x => x.score === 0).map(x => ({ acc: x.acc, rating: x.rating, opp: 2800, score: 0 }));
  console.log('typical error if those who lost had lost to a 2800:', Math.round(Math.sqrt(mis.reduce((s, x) => s + (R.gameRating(x) - x.rating) ** 2, 0) / mis.length)), '(accuracy alone for them:', Math.round(Math.sqrt(mis.reduce((s, x) => s + (R.gameRating({ acc: x.acc }) - x.rating) ** 2, 0) / mis.length)) + ')');
  console.log('\nconst ACC = ' + JSON.stringify(full).replace(/,\[/g, ', [') + ';');
  console.log('const FIT = ' + JSON.stringify(R.FIT).replace(/"/g, '').replace(/,/g, ', ').replace(/:/g, ': ').replace('{', '{ ').replace(/}$/, ' }') + ';');
}
