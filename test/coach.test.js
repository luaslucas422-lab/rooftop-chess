/* Coach tests: how Coach Mira judges and explains moves, with real engine lines where it matters. Run: node test/coach.test.js */
const assert = require('assert');
const C = require('../public/js/chess.js'), E = require('../public/js/engine.js'), Coach = require('../public/js/coach.js');
const S = new E.Searcher(18);

/* the engine thread's answer for a position, as the coach gets it: { best, line: { score, mate (White's side), pv, san } } */
function think(fen, depth) {
  const pos = new C.Position(fen), r = S.think(pos, { depth: depth || 6, time: 20000 }), l = r.lines[0], white = pos.turn === C.WHITE;
  const g = new C.Game(fen), san = [];
  for (const u of l.pv.map(C.toUci)) { const x = g.move(u); if (!x) break; san.push(x.san); }
  return { best: C.toUci(r.best), line: { score: white ? l.score : -l.score, mate: white ? l.mate : -l.mate, pv: l.pv.map(C.toUci), san } };
}
/* play a move from a position and have the coach judge it */
function judge(fen, uci, color) {
  const g = new C.Game(fen), rec = g.move(uci), before = think(fen), after = think(rec.fen);
  const gr = Coach.grade({ color, uci, best: before.best, before: before.line, after: after.line });
  const why = Coach.explain({ fen, move: rec, color, them: 'Ravi', before: before.line, after: after.line });
  return { gr, why, before, after };
}
const has = (s, ...parts) => { for (const p of parts) assert(s.includes(p), JSON.stringify(s) + ' should mention ' + p); };

// scores: White's side in, the player's side out; mates count as about a hundred pawns
assert.strictEqual(Coach.cpFor({ score: 120 }, 'w'), 120);
assert.strictEqual(Coach.cpFor({ score: 120 }, 'b'), -120);
assert(Coach.cpFor({ score: 0, mate: 2 }, 'w') > 9000 && Coach.cpFor({ score: 0, mate: 2 }, 'b') < -9000);
assert.strictEqual(Coach.mateFor({ mate: -3 }, 'b'), 3);

// material along a line
assert.strictEqual(Coach.lineGain('7k/8/8/3p4/4Q3/8/8/4K3 b - - 0 1', ['d5e4'], 'b'), 9);
assert.strictEqual(Coach.lineGain('7k/8/8/3p4/4Q3/8/8/4K3 b - - 0 1', ['d5e4'], 'w'), -9);
assert.strictEqual(Coach.lineGain('7k/8/8/3p4/4Q3/8/8/4K3 b - - 0 1', ['h8g8', 'e4d5'], 'w'), 1);

// a knight fork: on c2 it hits the king and the rook
{ const pos = new C.Position('4k3/8/8/8/8/8/P1n4P/R3K3 w - - 0 1'); const t = Coach.forkTargets(pos, C.sqParse('c2')).map(x => C.sqName(x.sq)).sort();
  assert.deepStrictEqual(t, ['a1', 'e1']); }

// the position flipped to "their move" for threats – not when you're in check
assert.strictEqual(Coach.flipFen('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), '4k3/8/8/8/8/8/8/R3K3 b - - 0 1');
assert.strictEqual(Coach.flipFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1'), null);

// grading: the engine's move is always best; book moves are book
assert.strictEqual(Coach.grade({ color: 'w', uci: 'e2e4', best: 'e2e4', before: { score: 30 }, after: { score: -400 } }).cls, 'best');
assert.strictEqual(Coach.grade({ color: 'w', uci: 'e2e4', best: 'd2d4', before: { score: 30 }, after: { score: 20 }, book: true }).cls, 'book');
assert.strictEqual(Coach.grade({ color: 'b', uci: 'a7a6', best: 'e7e5', before: { score: 0 }, after: { score: 600 } }).cls, 'blunder');

// the levels rate the same move differently: losing about 12% of your winning chances
{ const o = { color: 'w', uci: 'a2a3', best: 'e2e4', before: { score: 0 }, after: { score: -135 } };
  const at = lv => Coach.grade(Object.assign({ scale: Coach.LEVELS[lv].scale }, o)).cls;
  assert.deepStrictEqual([at('beginner'), at('normal'), at('extreme')], ['inaccuracy', 'mistake', 'blunder']);
  // a hung queen stops the game at every level, and walking into mate is always a blunder
  for (const lv of Object.keys(Coach.LEVELS)) {
    assert(['mistake', 'blunder'].includes(Coach.grade({ color: 'w', uci: 'e2e4', best: 'e2b5', before: { score: 800 }, after: { score: 0 }, scale: Coach.LEVELS[lv].scale }).cls), lv);
    assert.strictEqual(Coach.grade({ color: 'w', uci: 'a1a7', best: 'h2h3', before: { score: 0 }, after: { score: 0, mate: -1 }, scale: Coach.LEVELS[lv].scale }).cls, 'blunder'); }
  assert.strictEqual(Coach.level(true), 'normal'); assert.strictEqual(Coach.level('extreme'), 'extreme'); assert.strictEqual(Coach.level('off'), null); }

// 1. leaving the queen where a pawn takes it
{ const { gr, why } = judge('7k/8/8/3p4/8/8/4Q3/4K3 w - - 0 1', 'e2e4', 'w');
  assert.strictEqual(gr.cls, 'blunder'); assert.strictEqual(why.kind, 'hangs'); has(why.text, 'queen on e4', 'dxe4');
  console.log('hanging queen:', why.text); }

// 2. ignoring a knight fork on c2
{ const { gr, why } = judge('4k3/8/8/8/1n6/8/P6P/R3K3 w - - 0 1', 'h2h3', 'w');
  assert(gr.loss >= 10, 'a lost rook is a big mistake'); assert.strictEqual(why.kind, 'fork'); has(why.text, 'Nc2+', 'king and rook');
  console.log('fork:', why.text); }

// 3. walking into a back-rank mate
{ const { gr, why } = judge('4r1k1/5ppp/8/8/8/8/6PP/R6K w - - 0 1', 'a1a7', 'w');
  assert.strictEqual(gr.cls, 'blunder'); assert.strictEqual(why.kind, 'mate'); has(why.text, 'checkmate', 'Re1#');
  console.log('allows mate:', why.text); }

// 4. missing a mate in one
{ const { gr, why } = judge('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 4', 'g1e2', 'w');
  assert(gr.loss >= 10); assert.strictEqual(why.kind, 'missedMate'); has(why.text, 'Qxf7#', 'checkmate');
  console.log('missed mate:', why.text); }

// 5. missing a free knight
{ const fen = '4k3/8/8/4n3/3Q4/8/8/4K3 w - - 0 1', rec = new C.Game(fen).move('e1e2');
  const why = Coach.explain({ fen, move: rec, color: 'w', them: 'Ravi', before: { score: 1200, mate: 0, pv: ['d4e5', 'e8f7'], san: ['Qxe5+', 'Kf7'] }, after: { score: 900, mate: 0, pv: ['e5c6'], san: ['Nc6'] } });
  assert.strictEqual(why.kind, 'missedWin'); has(why.text, 'knight on e5', 'free', 'Qxe5+');
  console.log('missed win:', why.text); }

// 5b. a piece that was already attacked and still is
{ const { why } = judge('7k/8/8/3p4/4Q3/8/8/4K3 w - - 0 1', 'e1d2', 'w');
  assert.strictEqual(why.kind, 'hangs'); has(why.text, 'queen on e4 is still under attack', 'dxe4'); }

// 6. a good move gets no excuses: the queen steps out of the pawn's reach
{ const { gr } = judge('7k/8/8/3p4/8/8/4Q3/4K3 w - - 0 1', 'e2b5', 'w'); assert(!['mistake', 'blunder'].includes(gr.cls), gr.cls); }

// threats on your turn: the pawn on d5 is hitting the queen
{ const fen = '7k/8/8/3p4/4Q3/8/8/4K3 w - - 0 1', now = think(fen), flipped = Coach.flipFen(fen), there = think(flipped);
  const t = Coach.threat({ color: 'w', them: 'Ravi', now: now.line, flipped, line: there.line });
  assert(t && t.kind === 'attacked', JSON.stringify(t)); has(t.text, 'queen on e4', 'pawn on d5');
  console.log('threat:', t.text); }
// …and no warning when nothing is threatened
{ const fen = '7k/8/8/8/8/8/4Q3/4K3 w - - 0 1', now = think(fen), flipped = Coach.flipFen(fen), there = think(flipped);
  assert.strictEqual(Coach.threat({ color: 'w', them: 'Ravi', now: now.line, flipped, line: there.line }), null); }
// a back-rank mate threat
{ const fen = 'r5k1/5ppp/8/8/8/8/5PPP/7K w - - 0 1', now = think(fen), flipped = Coach.flipFen(fen), there = think(flipped);
  const t = Coach.threat({ color: 'w', them: 'Ravi', now: now.line, flipped, line: there.line });
  assert(t && t.kind === 'mate', JSON.stringify(t)); has(t.text, 'checkmate', 'Ra1#');
  console.log('mate threat:', t.text); }

// the bot slips: a knight left hanging, or a mate on the board
{ const o = Coach.opportunity({ fen: '4k3/8/8/4n3/3Q4/8/8/4K3 w - - 0 1', color: 'w', them: 'Ravi', now: { score: 310, mate: 0, pv: ['d4e5', 'e8f7'], san: ['Qxe5+', 'Kf7'] }, prev: 0 });
  assert(o && o.kind === 'win'); has(o.text, 'Ravi', 'knight on e5', 'unprotected');
  assert.strictEqual(Coach.opportunity({ fen: '4k3/8/8/4n3/3Q4/8/8/4K3 w - - 0 1', color: 'w', them: 'Ravi', now: { score: 310, mate: 0, pv: ['d4e5'], san: ['Qxe5+'] }, prev: 290 }), null, 'no jump, no news');
  const m = Coach.opportunity({ fen: '4k3/8/8/4n3/3Q4/8/8/4K3 b - - 0 1', color: 'b', them: 'Ravi', now: { score: 0, mate: -1, pv: ['e5f3'], san: ['Nf3#'] }, prev: null });
  assert(m && m.kind === 'mate'); has(m.text, 'checkmate in one'); }

// opening tips, each once
{ const g = new C.Game(); g.move('e4');
  const t1 = Coach.openingTip({ history: g.history, color: 'w', said: new Set() }); assert.strictEqual(t1.id, 'center');
  assert.strictEqual(Coach.openingTip({ history: g.history, color: 'w', said: new Set(['center']) }), null);
  g.move('e5'); g.move('Qh5');
  assert.strictEqual(Coach.openingTip({ history: g.history, color: 'w', said: new Set() }).id, 'queen');
  const g2 = new C.Game(); for (const m of ['Nf3', 'd6', 'Ng5']) g2.move(m);
  assert.strictEqual(Coach.openingTip({ history: g2.history, color: 'w', said: new Set() }).id, 'twice');
  const g3 = new C.Game(); for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']) g3.move(m);
  assert.strictEqual(Coach.openingTip({ history: g3.history, color: 'w', said: new Set() }).id, 'castled');
  const g4 = new C.Game(); g4.move('Na3');
  assert.strictEqual(Coach.openingTip({ history: g4.history, color: 'w', said: new Set() }).id, 'rim');
  // Black's tip after Black's move, not White's
  const g5 = new C.Game(); g5.move('e4'); g5.move('d5');
  assert.strictEqual(Coach.openingTip({ history: g5.history, color: 'b', said: new Set() }).id, 'center');
  assert.strictEqual(Coach.openingTip({ history: g5.history, color: 'w', said: new Set() }), null); }

// the castling reminder: seven moves in, king still home
{ const g = new C.Game(); for (const m of ['a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f6', 'g3', 'g6']) g.move(m);
  const r = Coach.castleReminder({ fen: g.fen(), history: g.history, color: 'w', said: new Set() });
  assert(r && r.id === 'castle');
  assert.strictEqual(Coach.castleReminder({ fen: g.fen(), history: g.history, color: 'w', said: new Set(['castle']) }), null); }

console.log('coach ok');
