/* Rules tests: perft (move generator), SAN, PGN, game endings. Run: node test/chess.test.js */
const assert = require('assert');
const C = require('../public/js/chess.js');
const t0 = Date.now();
const PERFT = [
  [C.START_FEN, [20, 400, 8902, 197281, 4865609]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862, 4085603]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238, 674624]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467, 422333]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379, 2103487]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890, 3894594]],
];
for (const [fen, counts] of PERFT) {
  const pos = new C.Position(fen);
  counts.forEach((n, i) => { const got = C.perft(pos, i + 1); assert.strictEqual(got, n, fen + ' depth ' + (i + 1) + ': ' + got + ' != ' + n); });
  assert.strictEqual(pos.fen().split(' ').slice(0, 3).join(' '), fen.split(' ').slice(0, 3).join(' '), 'position restored');
}
console.log('perft ok', (Date.now() - t0) + 'ms');

// hashes are incremental and must equal a fresh hash
{ const pos = new C.Position(PERFT[1][0]); const walk = d => { if (!d) return; for (const m of pos.genMoves([])) if (pos.make(m)) { const k = pos.hlo, h = pos.hhi; pos.rehash(); assert(pos.hlo === k && pos.hhi === h, 'hash'); walk(d - 1); pos.unmake(); } }; walk(3); }

// SAN, disambiguation, checks, mate, PGN round trip
{ const g = new C.Game();
  for (const s of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']) assert(g.move(s), s);
  assert.strictEqual(g.history[6].san, 'Qxf7#'); const st = g.status(); assert(st.over && st.reason === 'checkmate' && st.result === '1-0');
  const pgn = g.pgn({ White: 'A', Black: 'B' }); const g2 = C.Game.fromPgn(pgn); assert.strictEqual(g2.fen(), g.fen()); }
{ const g = new C.Game('6k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'); const s = g.moves().map(m => m.san); assert(s.includes('O-O-O') && s.includes('O-O'), s.join(' ')); }
{ const g = new C.Game('6k1/8/8/8/8/8/8/R4RK1 w - - 0 1'); const s = g.moves().map(m => m.san); assert(s.includes('Rab1') && s.includes('Rfe1') && s.includes('Ra8+'), s.join(' ')); }
{ assert(new C.Position('7k/8/8/8/8/8/8/R3K2R w KQ - 0 1').problem()); assert(!new C.Position().problem()); assert(new C.Position('P6k/8/8/8/8/8/8/4K3 w - - 0 1').problem()); }
{ const g = new C.Game('k7/8/8/8/8/8/N3N3/K7 w - - 0 1'); assert(g.moves().some(m => m.san === 'Nac3')); assert(g.moves().some(m => m.san === 'Nec3')); }
{ const g = new C.Game('k7/8/8/8/8/1N3N2/8/1N1K4 w - - 0 1'); const s = g.moves().map(m => m.san); assert(s.includes('Nb1d2') || s.includes('N1d2'), s.join(' ')); }
// promotion + en passant
{ const g = new C.Game('8/P6k/8/3pP3/8/8/8/K7 w - d6 0 1'); assert(g.move('exd6')); assert.strictEqual(g.pos.pieceAt('d5'), null); g.undo(); assert(g.move('a8=N')); assert.strictEqual(g.pos.pieceAt('a8').type, 'n'); }
// draws
{ const g = new C.Game('8/8/8/8/8/5k2/8/5K1B w - - 0 1'); assert.strictEqual(g.status().reason, 'insufficient material'); }
{ const g = new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); assert.strictEqual(g.status().reason, 'stalemate'); }
{ const g = new C.Game(); for (const s of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) g.move(s); assert.strictEqual(g.status().reason, 'repetition'); }
{ const g = new C.Game(); assert.strictEqual(g.timeoutResult('w'), 'b'); const k = new C.Game('8/8/8/8/8/5k2/8/5K1R w - - 0 1'); assert.strictEqual(k.timeoutResult('w'), null); assert.strictEqual(k.timeoutResult('b'), 'w'); }
// sloppy input
{ const g = new C.Game(); assert(g.move('e2e4')); assert(g.move({ from: 'e7', to: 'e5' })); assert(g.move('Ngf3')); assert(g.move('0-0') === null); }
// PGN with comments, variations and NAGs
{ const g = C.Game.fromPgn('[Event "x"]\n[Result "0-1"]\n\n1. e4 {best by test} e5 (1... c5 2. Nf3) 2. Nf3 $1 Nc6 3. Bb5 a6 0-1'); assert.strictEqual(g.history.length, 6); assert.strictEqual(g.status().result, '0-1'); }
console.log('rules ok', (Date.now() - t0) + 'ms');

// every opening line is legal and written exactly as the app writes SAN
{ const O = require('../public/js/openings.js');
  for (const [name, line] of O.LINES) { const g = new C.Game(); for (const s of line.split(' ')) { const r = g.move(s); assert(r && r.san === s, name + ': ' + s + ' (got ' + (r && r.san) + ')'); } }
  assert.strictEqual(O.name(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3']), 'Sicilian Defense: Najdorf Variation');
  assert(O.isBook(['e4', 'e5', 'Nf3'], 2) && !O.isBook(['e4', 'e5', 'Qh5'], 2));
  console.log('openings ok', O.LINES.length); }

// every puzzle replays legally, ends on the solver's move, and mate puzzles really end in mate
{ const P = require('../public/js/puzzles.js');
  assert(P.length >= 200, 'puzzle count ' + P.length);
  for (const [fen, line, rating, themes] of P) {
    const g = new C.Game(fen), ms = line.split(' ');
    assert(ms.length % 2 === 0, 'puzzle must end on the solver move: ' + fen);
    for (const u of ms) assert(g.move(u), 'illegal puzzle move ' + u + ' in ' + fen);
    if (/mateIn/.test(themes)) assert.strictEqual(g.status().reason, 'checkmate', 'mate puzzle without mate: ' + fen);
    assert(rating >= 400 && rating <= 2700);
  }
  console.log('puzzles ok', P.length); }
