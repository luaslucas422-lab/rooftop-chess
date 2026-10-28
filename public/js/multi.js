/* Rooftop Chess – Experimental: chess for 3 or 4 players on a 14×14 cross-shaped board (the 3×3 corners are cut off).
   Red sits at the bottom, Blue on the left, Yellow at the top, Green on the right, and they move in that order.
   Rules: pieces move as in chess; pawns move toward the far side and become queens on reaching the middle (their 8th
   rank); no castling or en passant. You may not leave your own king attacked by anyone. A player with no legal move on
   their turn (checkmated or stalemated) is out, and so is one whose king is captured (possible when two players attack
   it before its turn comes round). Out players' pieces leave the board. The last king standing wins. In 3-player chess
   Green's side stays empty. Squares are numbers y*14 + x, with y = 0 at the top. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Multi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const N = 14, NAMES = ['Red', 'Blue', 'Yellow', 'Green'], COLORS = ['#e0453a', '#3b7fe8', '#e8b623', '#36a457'];
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const FWD = [[0, -1], [1, 0], [0, 1], [-1, 0]];                      // each army's forward direction
  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const DIAG = KING.slice(4), ORTH = KING.slice(0, 4);
  const ok = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !((x < 3 || x > 10) && (y < 3 || y > 10));
  const sq = (x, y) => y * N + x, X = s => s % N, Y = s => (s / N) | 0;
  /* has this army's pawn reached its 8th rank (the middle of the board)? */
  const promotes = (o, s) => o === 0 ? Y(s) <= 6 : o === 1 ? X(s) >= 7 : o === 2 ? Y(s) >= 7 : X(s) <= 6;
  const startLine = (o, s) => o === 0 ? Y(s) === 12 : o === 1 ? X(s) === 1 : o === 2 ? Y(s) === 1 : X(s) === 12;

  /* a new game for 3 or 4 players */
  function setup(players) {
    const board = new Array(N * N).fill(null), back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const active = [true, true, true, players !== 3];
    for (let o = 0; o < 4; o++) {
      if (!active[o]) continue;
      for (let i = 0; i < 8; i++) {   // each army's back row from its own left to its own right
        const [bx, by, px, py] = o === 0 ? [3 + i, 13, 3 + i, 12] : o === 1 ? [0, 3 + i, 1, 3 + i] : o === 2 ? [10 - i, 0, 10 - i, 1] : [13, 10 - i, 12, 10 - i];
        board[sq(bx, by)] = { t: back[i], o }; board[sq(px, py)] = { t: 'p', o };
      }
    }
    return { board, players, active, turn: 0, plies: 0, quiet: 0, out: [], taken: [[], [], [], []], last: null, over: null };
  }
  const kingOf = (st, o) => st.board.findIndex(p => p && p.t === 'k' && p.o === o);

  /* is square s attacked by any active player other than `not`? (or only by `only`, when given) */
  function attacked(st, s, not, only) {
    const b = st.board, x = X(s), y = Y(s);
    const foe = p => p && p.o !== not && st.active[p.o] && (only == null || p.o === only);
    for (const [dx, dy] of KNIGHT) { const a = x + dx, c = y + dy; if (ok(a, c)) { const p = b[sq(a, c)]; if (foe(p) && p.t === 'n') return true; } }
    for (const [dx, dy] of KING) { const a = x + dx, c = y + dy; if (ok(a, c)) { const p = b[sq(a, c)]; if (foe(p) && p.t === 'k') return true; } }
    for (const [dx, dy] of DIAG) {
      let a = x + dx, c = y + dy, first = true;
      while (ok(a, c)) {
        const p = b[sq(a, c)];
        if (p) {
          if (foe(p) && (p.t === 'b' || p.t === 'q')) return true;
          // a pawn attacks diagonally forward: this square is ahead of it in its own direction
          if (first && foe(p) && p.t === 'p') { const [fx, fy] = FWD[p.o]; if ((fx && -dx === fx) || (fy && -dy === fy)) return true; }
          break;
        }
        a += dx; c += dy; first = false;
      }
    }
    for (const [dx, dy] of ORTH) {
      let a = x + dx, c = y + dy;
      while (ok(a, c)) { const p = b[sq(a, c)]; if (p) { if (foe(p) && (p.t === 'r' || p.t === 'q')) return true; break; } a += dx; c += dy; }
    }
    return false;
  }
  /* moves for player o that may leave their king attacked: [{ from, to }] */
  function pseudo(st, o) {
    const b = st.board, out = [];
    const add = (f, a, c, capOnly, quietOnly) => {
      if (!ok(a, c)) return false;
      const t = sq(a, c), p = b[t];
      if (p && (p.o === o || !st.active[p.o])) return false;
      if (p && quietOnly) return false;
      if (!p && capOnly) return true;
      out.push({ from: f, to: t }); return !p;
    };
    for (let s = 0; s < N * N; s++) {
      const p = b[s]; if (!p || p.o !== o) continue;
      const x = X(s), y = Y(s);
      if (p.t === 'p') {
        const [fx, fy] = FWD[o];
        if (ok(x + fx, y + fy) && !b[sq(x + fx, y + fy)]) {
          out.push({ from: s, to: sq(x + fx, y + fy) });
          if (startLine(o, s) && ok(x + 2 * fx, y + 2 * fy) && !b[sq(x + 2 * fx, y + 2 * fy)]) out.push({ from: s, to: sq(x + 2 * fx, y + 2 * fy) });
        }
        for (const k of [-1, 1]) { const a = x + fx + (fx ? 0 : k), c = y + fy + (fy ? 0 : k); if (ok(a, c) && b[sq(a, c)]) add(s, a, c, true); }
      } else if (p.t === 'n' || p.t === 'k') {
        for (const [dx, dy] of p.t === 'n' ? KNIGHT : KING) add(s, x + dx, y + dy);
      } else {
        for (const [dx, dy] of p.t === 'b' ? DIAG : p.t === 'r' ? ORTH : KING) { let a = x + dx, c = y + dy; while (add(s, a, c)) { a += dx; c += dy; } }
      }
    }
    return out;
  }
  /* play a move on the board only (no turns, no eliminations); returns what's needed to take it back */
  function make(st, m) {
    const b = st.board, p = b[m.from], cap = b[m.to];
    const promo = p.t === 'p' && promotes(p.o, m.to);
    b[m.to] = promo ? { t: 'q', o: p.o } : p; b[m.from] = null;
    return { m, p, cap, promo };
  }
  function unmake(st, u) { st.board[u.m.from] = u.p; st.board[u.m.to] = u.cap; }
  /* legal moves: your king (if you still have one) may not be left attacked */
  function legal(st, o) {
    if (!st.active[o]) return [];
    return pseudo(st, o).filter(m => { const u = make(st, m), k = kingOf(st, o), safe = k < 0 || !attacked(st, k, o); unmake(st, u); return safe; });
  }
  const inCheck = (st, o) => { const k = kingOf(st, o); return k >= 0 && attacked(st, k, o); };
  function eliminate(st, o, reason) {
    st.active[o] = false; st.out.push({ o, reason, ply: st.plies });
    for (let s = 0; s < N * N; s++) if (st.board[s] && st.board[s].o === o) st.board[s] = null;
  }
  const alive = st => [0, 1, 2, 3].filter(o => st.active[o]);
  /* the next player who can move: anyone without a legal move on their turn is out on the way. Ends the game when one is left. */
  function advance(st) {
    for (let guard = 0; guard < 8; guard++) {
      if (alive(st).length <= 1) { st.over = { winner: alive(st)[0] != null ? alive(st)[0] : null, reason: 'last king standing' }; return; }
      let o = st.turn;
      do { o = (o + 1) % 4; } while (!st.active[o]);
      st.turn = o;
      if (legal(st, o).length) return;
      eliminate(st, o, inCheck(st, o) ? 'checkmated' : 'stalemated');
    }
  }
  /* the current player plays move m ({ from, to }): takes, promotes, knocks out a player whose king it took, passes the turn */
  function play(st, m) {
    if (st.over) return false;
    const o = st.turn, ok2 = legal(st, o).some(x => x.from === m.from && x.to === m.to); if (!ok2) return false;
    const u = make(st, m);
    st.plies++; st.last = { from: m.from, to: m.to, o };
    st.quiet = u.cap || u.p.t === 'p' ? 0 : st.quiet + 1;
    if (u.cap) { st.taken[o].push(u.cap.t); if (u.cap.t === 'k') eliminate(st, u.cap.o, 'king captured'); }
    if (st.quiet >= 60 * alive(st).length) { st.over = { winner: null, reason: 'no captures or pawn moves for 60 rounds' }; return true; }
    advance(st);
    return true;
  }
  const points = (st, o) => st.taken[o].reduce((s, t) => s + (t === 'k' ? 0 : VAL[t]), 0);

  /* ---------- bots ---------- */
  /* how good a move looks to its player: what it takes (a king most of all), checks and mates it gives, whether the piece
     is safe where it lands, what it leaves hanging, and a little for good squares. noise: how loosely it picks. */
  function botMove(st, opts) {
    opts = opts || {}; const rand = opts.rand || Math.random, noise = opts.noise != null ? opts.noise : 0.35, o = st.turn;
    const moves = legal(st, o); if (!moves.length) return null;
    const value = t => t === 'k' ? 60 : VAL[t];
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const u = make(st, m), p = st.board[m.to];
      let s = u.cap ? value(u.cap.t) : 0;
      if (u.promo) s += 8;
      // checks and mates against each opponent
      for (const e of alive(st)) {
        if (e === o) continue;
        const k = kingOf(st, e); if (k < 0) continue;
        if (attacked(st, k, e, o)) { s += 0.4; if (!legal(st, e).length) s += 40; }
      }
      // is the piece safe on its new square? (defended pieces only lose what the cheapest attacker is worth less)
      if (attacked(st, m.to, o)) {
        const defended = defends(st, m.to, o);
        s -= defended ? Math.max(0, VAL[p.t] - cheapest(st, m.to, o)) : (p.t === 'k' ? 0 : VAL[p.t]);
      }
      // what else of ours is now hanging
      for (let q = 0; q < N * N; q++) { const r = st.board[q]; if (r && r.o === o && q !== m.to && r.t !== 'k' && attacked(st, q, o) && !defends(st, q, o)) s -= VAL[r.t] * 0.45; }
      // good squares: toward the middle, pawns forward, pieces out of the back row early on
      const cx = Math.abs(X(m.to) - 6.5), cy = Math.abs(Y(m.to) - 6.5), fx = Math.abs(X(m.from) - 6.5), fy = Math.abs(Y(m.from) - 6.5);
      s += ((fx + fy) - (cx + cy)) * (p.t === 'k' ? -0.03 : 0.04);
      if (p.t === 'p') s += 0.05;
      if (p.t === 'q' && st.plies < 16) s -= 0.3;
      unmake(st, u);
      s += (rand() - 0.5) * 2 * noise;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }
  /* is square s (holding o's piece) covered by another of o's pieces? */
  function defends(st, s, o) { const p = st.board[s]; st.board[s] = { t: 'p', o: -1 }; const r = attacked(st, s, -1, o); st.board[s] = p; return r; }
  function cheapest(st, s, o) {
    let best = 99;
    for (const e of alive(st)) if (e !== o && attacked(st, s, o, e)) {
      // the cheapest of e's pieces that can reach s
      for (const m of pseudo(st, e)) if (m.to === s) best = Math.min(best, st.board[m.from].t === 'k' ? 50 : VAL[st.board[m.from].t]);
    }
    return best === 99 ? 0 : best;
  }

  return { N, NAMES, COLORS, VAL, ok, sq, X, Y, setup, legal, pseudo, attacked, inCheck, kingOf, play, botMove, points, alive, promotes };
});
