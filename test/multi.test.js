/* Experimental 3- and 4-player chess: moves, attacks, eliminations and bots. Run: node test/multi.test.js */
const assert = require('assert');
const M = require('../public/js/multi.js');
const empty = players => { const st = M.setup(players); st.board.fill(null); return st; };
const put = (st, x, y, t, o) => { st.board[M.sq(x, y)] = { t, o }; };

// the start: every army has the 20 moves of normal chess; the 3-player board leaves Green's side empty
assert.deepStrictEqual([0, 1, 2, 3].map(o => M.legal(M.setup(4), o).length), [20, 20, 20, 20]);
assert.deepStrictEqual([0, 1, 2, 3].map(o => M.legal(M.setup(3), o).length), [20, 20, 20, 0]);
assert.strictEqual(M.setup(4).board.filter(Boolean).length, 64);
// the board is a cross: 14×14 without its 3×3 corners
let cells = 0; for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) if (M.ok(x, y)) cells++;
assert.strictEqual(cells, 160);

// "is this square attacked?" agrees with trying every other army's moves, all through some bot games
let checked = 0;
for (let g = 0; g < 6; g++) {
  const st = M.setup(g % 2 ? 3 : 4);
  for (let i = 0; i < 120 && !st.over; i++) {
    if (i % 10 === 0) for (const o of M.alive(st)) for (let s = 0; s < 196; s++) {
      const x = M.X(s), y = M.Y(s); if (!M.ok(x, y)) continue;
      const keep = st.board[s]; if (keep && keep.o === o) continue;
      st.board[s] = { t: 'n', o };   // something of o's to take
      const brute = M.alive(st).some(e => e !== o && M.pseudo(st, e).some(m => m.to === s));
      assert.strictEqual(M.attacked(st, s, o), brute, 'attack on ' + x + ',' + y + ' against ' + M.NAMES[o]);
      st.board[s] = keep; checked++;
    }
    M.play(st, M.botMove(st));
  }
}
console.log('attacks checked on', checked, 'squares');

// pawns: forward one or two from the start, take diagonally forward, become queens in the middle
{ const st = empty(4); put(st, 6, 13, 'k', 0); put(st, 0, 6, 'k', 1); put(st, 6, 0, 'k', 2); put(st, 13, 6, 'k', 3);
  put(st, 5, 12, 'p', 0); put(st, 4, 11, 'r', 2);
  const mv = M.legal(st, 0).filter(m => m.from === M.sq(5, 12)).map(m => M.X(m.to) + ',' + M.Y(m.to)).sort();
  assert.deepStrictEqual(mv, ['4,11', '5,10', '5,11'], 'Red pawn: one, two, or take the rook');
  put(st, 8, 7, 'p', 0); st.turn = 0; assert(M.play(st, { from: M.sq(8, 7), to: M.sq(8, 6) }));
  assert.strictEqual(st.board[M.sq(8, 6)].t, 'q', 'promoted in the middle'); }
// Blue's pawns go right, Green's left, Yellow's down
{ const st = M.setup(4);
  for (const [o, from, to] of [[1, [1, 5], [3, 5]], [2, [5, 1], [5, 3]], [3, [12, 8], [10, 8]]]) assert(M.legal(st, o).some(m => m.from === M.sq(...from) && m.to === M.sq(...to)), M.NAMES[o] + ' pawn double step'); }

// checkmate on your turn puts you out; the game goes on until one king is left
{ const st = empty(3); put(st, 3, 13, 'k', 0); put(st, 3, 12, 'q', 2); put(st, 4, 11, 'b', 2); put(st, 0, 6, 'k', 1); put(st, 6, 0, 'k', 2);
  st.turn = 2;   // Yellow just moved; Blue moves, then it's Red's turn – mated
  put(st, 0, 3, 'p', 1);
  st.turn = 1; assert(M.play(st, M.legal(st, 1).find(m => m.from === M.sq(0, 3))));
  assert.strictEqual(st.turn, 2, 'then Yellow');
  assert(M.play(st, M.legal(st, 2).find(m => m.from === M.sq(6, 0))));   // Yellow's king steps; now Red has no move
  assert(!st.active[0] && st.out[0].reason === 'checkmated', 'Red is out'); assert.strictEqual(st.turn, 1, 'and it is Blue’s turn');
  assert(!st.board.some(p => p && p.o === 0), 'Red’s pieces have left the board');
  // Blue resigns the hard way: a lone king stalemated is out too, and Yellow is the last king standing
}
// a king attacked by two players before its turn comes round can be taken – that player is out
{ const st = empty(4); put(st, 6, 13, 'k', 0); put(st, 0, 6, 'k', 1); put(st, 6, 0, 'k', 2); put(st, 13, 6, 'k', 3);
  put(st, 6, 5, 'r', 2); put(st, 10, 10, 'r', 3);   // Yellow's rook already looks down Red's king's file
  st.turn = 3; assert(M.play(st, { from: M.sq(10, 10), to: M.sq(10, 13) }));   // Green adds a check along the bottom row
  // Red must answer: it can't leave the king on the file or the row
  const red = M.legal(st, 0); assert(red.length > 0 && red.every(m => m.from === M.sq(6, 13)), 'only king moves get out of both');
}
// king capture
{ const st = empty(4); put(st, 6, 13, 'k', 0); put(st, 0, 6, 'k', 1); put(st, 6, 0, 'k', 2); put(st, 13, 6, 'k', 3);
  put(st, 6, 8, 'r', 1);   // Blue's rook stares at Red's king (Red to move would have to deal with it – but Blue moves again first here)
  st.turn = 1; assert(M.play(st, { from: M.sq(6, 8), to: M.sq(6, 13) }));
  assert(!st.active[0] && st.out[0].reason === 'king captured');
  assert.strictEqual(M.points(st, 1), 0, 'a king isn’t worth points'); }

// bots finish games and never play an illegal move (play() refuses those)
for (const n of [3, 4]) for (let g = 0; g < 8; g++) {
  const st = M.setup(n); let k = 0;
  while (!st.over && k < 4000) { const m = M.botMove(st); assert(m && M.play(st, m), 'a legal bot move'); k++; }
  assert(st.over, 'the game ends'); if (st.over.winner != null) assert.deepStrictEqual(M.alive(st), [st.over.winner]);
}
console.log('multi ok');
