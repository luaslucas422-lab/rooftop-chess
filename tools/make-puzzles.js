/* Makes the puzzle set: weak bots play each other, and whenever one blunders the strong engine checks that the
   punishment is the only winning move, follows the forcing line, and records it as a puzzle.
   Usage: node tools/make-puzzles.js <seed> <games> <out.json>      then: node tools/make-puzzles.js merge <out.js> <in1.json> ... */
const fs = require('fs');
const path = require('path');
const C = require('../public/js/chess.js'), E = require('../public/js/engine.js'), O = require('../public/js/openings.js');

if (process.argv[2] === 'merge') {
  const out = process.argv[3], all = [], seen = new Set();
  for (const f of process.argv.slice(4)) for (const p of JSON.parse(fs.readFileSync(f, 'utf8'))) { const k = p.fen.split(' ').slice(0, 4).join(' ') + p.moves[0]; if (!seen.has(k)) { seen.add(k); all.push(p); } }
  all.sort((a, b) => a.rating - b.rating);
  const lines = all.map(p => '  [' + JSON.stringify(p.fen) + ',' + JSON.stringify(p.moves.join(' ')) + ',' + p.rating + ',' + JSON.stringify(p.themes.join(',')) + ']');
  fs.writeFileSync(out, '/* Rooftop Chess – puzzles (made by tools/make-puzzles.js; every solution checked by the engine).\n' +
    '   [position before the opponent\'s move, moves (opponent first, then you), rating, themes] */\n' +
    '(function (root) {\n  const PUZZLES = [\n' + lines.join(',\n') + '\n  ];\n  if (typeof module === \'object\' && module.exports) module.exports = PUZZLES; else root.PUZZLES = PUZZLES;\n' +
    '})(typeof self !== \'undefined\' ? self : this);\n');
  const by = {}; for (const p of all) for (const t of p.themes) by[t] = (by[t] || 0) + 1;
  console.log('puzzles:', all.length, by, 'ratings', all[0] && all[0].rating, '-', all[all.length - 1] && all[all.length - 1].rating);
  process.exit(0);
}

const seedArg = +process.argv[2] || 1, GAMES = +process.argv[3] || 20, OUT = process.argv[4] || path.join(__dirname, 'puzzles-' + seedArg + '.json');
let s = seedArg * 2654435761 >>> 0;
const rand = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const S = new E.Searcher(20);
const MB = E.MATE_BOUND;
const VAL = [0, 100, 300, 320, 500, 900, 0];

function histOf(g) { const { history } = E.replay(g.startFen, g.history.map(h => h.uci)); return history; }
function posOf(g) { return E.replay(g.startFen, g.history.map(h => h.uci)); }
function think(g, opts) { const { pos, history } = posOf(g); return S.think(pos, Object.assign({ history }, opts)); }

/* a person-like bot: scores moves shallowly and picks one with some noise */
function botMove(g, depth, noise) {
  const sans = g.history.map(h => h.san);
  if (g.history.length < 12 && rand() < 0.85) { const book = O.next(sans); if (book.length) return book[Math.floor(rand() * book.length)]; }
  const { pos, history } = posOf(g);
  const list = S.scoreMoves(pos, depth, { history });
  let best = null, bs = -1e9;
  for (const x of list) { const v = x.score + gauss() * noise; if (v > bs) { bs = v; best = x; } }
  return C.toUci(best.move);
}

const isMate = sc => Math.abs(sc) > MB;
/* the move to play here, if it's clearly the only good one */
function onlyMove(g, time) {
  const r = think(g, { time, multiPV: 2 });
  if (!r.lines.length) return null;
  const a = r.lines[0], b = r.lines[1];
  if (isMate(a.score) && a.score > 0) {
    if (a.mate === 1) return { uci: C.toUci(a.move), score: a.score, mate: 1, depth: r.depth };
    if (!b || !isMate(b.score) || b.score < 0 || b.mate > a.mate + 1) return { uci: C.toUci(a.move), score: a.score, mate: a.mate, depth: r.depth };
    return null;
  }
  if (a.score < 280) return null;
  if (b && (b.score > a.score - 250 || b.score > 160)) return null;
  return { uci: C.toUci(a.move), score: a.score, mate: 0, depth: r.depth };
}
/* how deep the engine had to look before it saw the answer – a decent difficulty signal */
function discoveryDepth(g, uci) {
  const { pos, history } = posOf(g);
  let found = 99;
  S.clear();
  S.think(pos, { history, depth: 12, time: 1500, onInfo: i => { if (i.pv[0] === uci && i.score > 200) { if (found === 99) found = i.depth; } else found = 99; } });
  return found === 99 ? 12 : found;
}

function themesFor(g0, moves, mate) {
  const th = [];
  const g = new C.Game(g0.fen()); const startPos = g.pos.clone();
  if (mate) th.push('mateIn' + mate);
  // first move of the solution
  const first = g.find(moves[0]); const from = first & 127, to = (first >> 7) & 127, pc = startPos.board[from] & 7, victim = startPos.board[to] & 7;
  const them = startPos.turn ^ 1;
  if (victim && VAL[victim] >= 300 && !startPos.attacked(to, them)) th.push('hangingPiece');
  // after the first move: is the moved piece attacked cheaply (a sacrifice)? does it hit two big targets (a fork)?
  const p2 = startPos.clone(); p2.make(first);
  const myVal = VAL[pc] || 0;
  if (!mate && myVal >= 300 && (VAL[victim] || 0) + 150 < myVal && p2.attacked(to, them)) th.push('sacrifice');
  let targets = 0;
  const D = pc === C.KNIGHT ? C.KNIGHT_D : pc === C.BISHOP ? C.DIAG_D : pc === C.ROOK ? C.ORTH_D : pc === C.QUEEN || pc === C.KING ? C.KING_D : [];
  const slide = pc === C.BISHOP || pc === C.ROOK || pc === C.QUEEN;
  for (const d of D) { let s2 = to + d; while (!(s2 & 0x88)) { const q = p2.board[s2]; if (q) { if ((q >> 3) === them && ((q & 7) === C.KING || VAL[q & 7] > myVal || (VAL[q & 7] >= 300 && !p2.attacked(s2, them)))) targets++; break; } if (!slide) break; s2 += d; } }
  if (pc === C.PAWN) for (const k of [-1, 1]) { const s2 = to + (startPos.turn === C.WHITE ? 16 : -16) + k; if (!(s2 & 0x88) && p2.board[s2] && (p2.board[s2] >> 3) === them && VAL[p2.board[s2] & 7] >= 300) targets++; }
  if (!mate && targets >= 2) th.push('fork');
  if (moves.some((u, i) => i % 2 === 0 && u.length === 5)) th.push('promotion');
  // back-rank mate: the king is mated on its first rank by a rook or queen on that rank
  if (mate) { const end = new C.Game(g0.fen()); for (const u of moves) end.move(u); const p = end.pos, k = p.kings[p.turn], rank = p.turn === C.WHITE ? 0 : 7;
    if ((k >> 4) === rank) { const last = end.history[end.history.length - 1]; const lt = C.sqParse(last.to); if ((lt >> 4) === rank && (last.piece === 'r' || last.piece === 'q')) th.push('backRankMate'); } }
  let phase = 0; for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) continue; phase += [0, 0, 1, 1, 2, 4, 0][startPos.board[sq] & 7]; }
  if (phase <= 8) th.push('endgame');
  if (!mate && !th.includes('fork') && !th.includes('hangingPiece')) th.push(moves.length > 1 ? 'combination' : 'advantage');
  return th;
}

function rateIt(moves, mate, themes, dd) {
  const n = Math.ceil(moves.length / 2);
  let r = mate === 1 ? 520 : themes.includes('hangingPiece') && n === 1 ? 700 : 950;
  r += (n - 1) * 260;
  if (mate >= 2) r += 120;
  if (themes.includes('sacrifice')) r += 160;
  r += Math.max(0, dd - 2) * 85;
  r += Math.round(gauss() * 45);
  return Math.max(400, Math.min(2700, Math.round(r / 5) * 5));
}

const found = [];
const t0 = Date.now();
for (let gi = 0; gi < GAMES; gi++) {
  // a decent, slightly random bot keeps the game balanced; at each position we look at the moves a person
  // might plausibly play (fine at a glance, losing on a closer look) and turn the punishments into puzzles
  const g = new C.Game();
  const noise = 15 + rand() * 30;
  let made = 0, lastAt = -99;
  while (!g.status().over && g.history.length < 110 && made < 4) {
    if (g.history.length >= 6 && g.history.length - lastAt >= 12 && rand() < 0.6) {
      const { pos, history } = posOf(g);
      const base = S.think(pos, { history, time: 60, depth: 7 });
      if (Math.abs(base.score) > 600) break;   // one side is far ahead – start a new game
      const shallow = S.scoreMoves(pos, 1, { history });
      const top = shallow[0].score;
      const plausible = shallow.filter(x => x.move !== base.best && x.score >= top - 70).slice(0, 6);
      for (const x of plausible.sort(() => rand() - 0.5)) {
        const trial = new C.Game(g.startFen); for (const h of g.history) trial.move(h.uci);
        const before = trial.fen(), uci = C.toUci(x.move);
        trial.move(uci); if (trial.status().over) continue;
        const quick = think(trial, { time: 50, depth: 7 });
        if (quick.score >= 300 && quick.score + base.score >= 250) {
          const puzzle = tryPuzzle(trial, before, uci);
          if (puzzle) { found.push(puzzle); made++; lastAt = g.history.length; fs.writeFileSync(OUT, JSON.stringify(found)); break; }
        }
      }
    }
    g.move(botMove(g, 2, noise));
  }
  if (gi % 5 === 4) console.log('seed', seedArg, 'game', gi + 1, '/', GAMES, 'puzzles', found.length, Math.round((Date.now() - t0) / 1000) + 's');
}
fs.writeFileSync(OUT, JSON.stringify(found));
console.log('seed', seedArg, 'done:', found.length, 'puzzles in', Math.round((Date.now() - t0) / 1000) + 's');

function tryPuzzle(g, fenBefore, blunder) {
  const p = new C.Game(g.fen());
  const start = new C.Game(g.fen());
  const moves = [];
  let mate = 0;
  for (let step = 0; step < 4; step++) {
    const om = onlyMove(p, step === 0 ? 1800 : 1200);
    if (!om) break;
    if (step === 0) mate = om.mate;
    if (mate && !om.mate) break;
    const mv = p.find(om.uci); const desc = p.describe(mv, p.pos.legalMoves());
    // after the first move, keep going only with forcing moves (captures, checks, promotions) or mates
    if (step > 0 && !mate && !(desc.capture || desc.promo || /\+/.test(desc.san))) break;
    p.move(om.uci); moves.push(om.uci);
    if (p.status().over) break;
    if (!mate && step >= 1) break;
    if (!mate && step === 0 && !(desc.capture || /\+/.test(desc.san) || desc.promo)) {
      // a quiet first move (a pin, a trap): the puzzle is just that move
      break;
    }
    // opponent's best reply
    const r = think(p, { time: 900 });
    if (!r.best) break;
    const reply = C.toUci(r.best);
    // only continue if the next step is also forcing; otherwise stop after our move
    const probe = new C.Game(p.fen()); probe.move(reply);
    const next = onlyMove(probe, 1000);
    if (!next) break;
    const nd = probe.describe(probe.find(next.uci), probe.pos.legalMoves());
    if (!mate && !(nd.capture || nd.promo || /\+/.test(nd.san))) break;
    if (mate && !next.mate) break;
    p.move(reply); moves.push(reply);
  }
  if (!moves.length || moves.length % 2 === 0) return null;   // must end on our move
  if (mate) { const end = new C.Game(start.fen()); for (const u of moves) end.move(u); if (end.status().reason !== 'checkmate') return null; mate = Math.ceil(moves.length / 2); }
  const themes = themesFor(start, moves, mate);
  const dd = discoveryDepth(start, moves[0]);
  return { fen: fenBefore, moves: [blunder, ...moves], rating: rateIt(moves, mate, themes, dd), themes };
}
