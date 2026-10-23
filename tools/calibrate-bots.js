/* Measures the bots against each other, so the rating next to each name means something.
   Usage: node tools/calibrate-bots.js play <botA> <botB> <games> <out.json> [seed]
          node tools/calibrate-bots.js report <results.json> ...
   Bots play with colors alternating. Weak bots can shuffle forever in won positions, so once a neutral engine "judge"
   sees one side clearly winning (more than a rook up, twice in a row) the game is scored as a win. */
const fs = require('fs');
const C = require('../public/js/chess.js'), E = require('../public/js/engine.js'), B = require('../public/js/botplay.js');

function rng(seed) { let s = seed >>> 0 || 1; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function judgeScore(judge, g) {
  const { pos, history } = E.replay(g.startFen, g.history.map(h => h.uci));
  const r = judge.think(pos, { nodes: 40000, history });
  return pos.turn === C.WHITE ? r.score : -r.score;   // from White's side
}

function playGame(white, black, rand, levels) {
  const S = { w: new E.Searcher(18), b: new E.Searcher(18) }, judge = new E.Searcher(18);
  const L = { w: levels[white], b: levels[black] };
  const g = new C.Game();
  let lopsided = 0, last = 0;
  for (;;) {
    const st = g.status();
    if (st.over) return { result: st.result, reason: st.reason, plies: g.history.length };
    const { pos, history } = E.replay(g.startFen, g.history.map(h => h.uci));
    const r = B.choose(S[g.turn], pos, history, g.history.map(h => h.san), L[g.turn], rand);
    if (!r || !g.move(r.uci)) throw new Error('bot made no move');
    const n = g.history.length;
    if (n >= 24 && n % 4 === 0) {
      const w = judgeScore(judge, g);
      if (Math.abs(w) >= 1000 && Math.sign(w) === Math.sign(last)) lopsided++; else lopsided = Math.abs(w) >= 1000 ? 1 : 0;
      last = w;
      if (lopsided >= 2) return { result: w > 0 ? '1-0' : '0-1', reason: 'judged', plies: n };
    }
    if (n >= 260) { const w = judgeScore(judge, g); return { result: w > 250 ? '1-0' : w < -250 ? '0-1' : '1/2-1/2', reason: 'long game', plies: n }; }
  }
}

function eloDiff(score) { if (score <= 0) return -800; if (score >= 1) return 800; return 400 * Math.log10(score / (1 - score)); }

if (process.argv[2] === 'play') {
  const [, , , a, b, n, out, seed] = process.argv;
  const levels = Object.assign({}, B.LEVELS, process.env.LEVELS ? JSON.parse(process.env.LEVELS) : {});   // LEVELS='{"otto":{...}}' to try changes
  if (!levels[a] || !levels[b]) throw new Error('unknown bot');
  const rand = rng(+seed || 1);
  const res = { a, b, levels: { [a]: levels[a], [b]: levels[b] }, games: [] };
  const t0 = Date.now();
  for (let i = 0; i < +n; i++) {
    const white = i % 2 ? b : a, black = i % 2 ? a : b;
    const r = playGame(white, black, rand, levels);
    res.games.push(Object.assign({ white, black }, r));
    fs.writeFileSync(out, JSON.stringify(res));
  }
  console.log(a, 'vs', b, n, 'games in', Math.round((Date.now() - t0) / 1000) + 's');
} else if (process.argv[2] === 'report') {
  for (const f of process.argv.slice(3)) {
    const res = JSON.parse(fs.readFileSync(f, 'utf8'));
    let pts = 0, w = 0, l = 0, d = 0, plies = 0;
    for (const g of res.games) {
      const aWhite = g.white === res.a, s = g.result === '1-0' ? (aWhite ? 1 : 0) : g.result === '0-1' ? (aWhite ? 0 : 1) : 0.5;
      pts += s; if (s === 1) w++; else if (s === 0) l++; else d++; plies += g.plies;
    }
    const n = res.games.length, sc = n ? pts / n : 0.5;
    const se = n ? Math.sqrt(sc * (1 - sc) / n) : 0;
    console.log((res.b + ' vs ' + res.a).padEnd(18), String(n).padStart(3), 'games  ', res.b, '+' + l, '=' + d, '-' + w, '  score', ((1 - sc) * 100).toFixed(0) + '%',
      '  ≈', (-eloDiff(sc)).toFixed(0).padStart(5), 'Elo (±' + Math.round(eloDiff(Math.min(0.99, 1 - sc + se)) - eloDiff(1 - sc)) + ')  avg', Math.round(plies / Math.max(1, n)), 'plies');
  }
}
