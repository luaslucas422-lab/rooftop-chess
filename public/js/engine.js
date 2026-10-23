/* Rooftop Chess – the engine (bots, hints, analysis, game review).
   Alpha-beta search with a transposition table, null-move pruning, late-move reductions and a quiescence search,
   on top of a tapered (middlegame/endgame) evaluation. Runs in a Web Worker in the app, or in Node for tools. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess.js'));
  else root.Engine = factory(root.Chess);
})(typeof self !== 'undefined' ? self : this, function (Chess) {
  'use strict';
  const { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK, F_CAPTURE, F_PROMO, KNIGHT_D, KING_D, DIAG_D, ORTH_D } = Chess;
  const INF = 32000, MATE = 31000, MATE_BOUND = 30000, MAX_PLY = 96;
  const EXACT = 1, LOWER = 2, UPPER = 3;

  /* ---------- evaluation ---------- */
  const MG_VAL = [0, 100, 320, 335, 500, 960, 0], EG_VAL = [0, 120, 300, 320, 540, 950, 0];
  const PHASE = [0, 0, 1, 1, 2, 4, 0];
  // piece-square tables from White's side, a8 first (as the board looks on screen)
  const T = {
    pmg: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 22, 22, 0, 0, 0, 5, -5, -10, 4, 4, -10, -5, 5, 5, 10, 10, -22, -22, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    peg: [0, 0, 0, 0, 0, 0, 0, 0, 80, 80, 80, 80, 80, 80, 80, 80, 50, 50, 50, 50, 50, 50, 50, 50, 30, 30, 30, 30, 30, 30, 30, 30,
      15, 15, 15, 15, 15, 15, 15, 15, 5, 5, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -35, -30, -30, -30, -30, -35, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -12, -10, -10, -12, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 3, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    kmg: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 15, 15, -5, -10, -10, -5, 15, 15, 20, 30, 10, -5, 0, 5, 30, 20],
    keg: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const MG_T = [null, T.pmg, T.n, T.b, T.r, T.q, T.kmg], EG_T = [null, T.peg, T.n, T.b, T.r, T.q, T.keg];
  // PST[piece * 128 + sq] includes material; piece = type | color << 3
  const PST_MG = new Int16Array(16 * 128), PST_EG = new Int16Array(16 * 128);
  for (let t = 1; t <= 6; t++) for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const r = sq >> 4, f = sq & 7;
    PST_MG[t * 128 + sq] = MG_VAL[t] + MG_T[t][(7 - r) * 8 + f];
    PST_EG[t * 128 + sq] = EG_VAL[t] + EG_T[t][(7 - r) * 8 + f];
    PST_MG[(t | 8) * 128 + sq] = MG_VAL[t] + MG_T[t][r * 8 + f];
    PST_EG[(t | 8) * 128 + sq] = EG_VAL[t] + EG_T[t][r * 8 + f];
  }
  const PASSED_MG = [0, 5, 8, 14, 24, 40, 60, 0], PASSED_EG = [0, 10, 15, 28, 48, 80, 120, 0];
  const CENTER_DIST = sq => { const r = sq >> 4, f = sq & 7; return Math.max(3 - r, r - 4) + Math.max(3 - f, f - 4); };
  const pawnsW = new Int8Array(8), pawnsB = new Int8Array(8), minRankW = new Int8Array(8), maxRankB = new Int8Array(8);
  const maxRankW = new Int8Array(8), minRankB = new Int8Array(8);

  function evaluate(pos) {
    const b = pos.board;
    let mgW = 0, mgB = 0, egW = 0, egB = 0, phase = 0;
    let bishopsW = 0, bishopsB = 0, nonPawnW = 0, nonPawnB = 0, pawnCountW = 0, pawnCountB = 0;
    pawnsW.fill(0); pawnsB.fill(0); minRankW.fill(8); maxRankB.fill(-1); maxRankW.fill(-1); minRankB.fill(8);
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue;
      const t = p & 7, black = p & 8;
      phase += PHASE[t];
      if (black) { mgB += PST_MG[p * 128 + sq]; egB += PST_EG[p * 128 + sq]; }
      else { mgW += PST_MG[p * 128 + sq]; egW += PST_EG[p * 128 + sq]; }
      if (t === PAWN) {
        const f = sq & 7, r = sq >> 4;
        if (black) { pawnsB[f]++; pawnCountB++; if (r > maxRankB[f]) maxRankB[f] = r; if (r < minRankB[f]) minRankB[f] = r; }
        else { pawnsW[f]++; pawnCountW++; if (r < minRankW[f]) minRankW[f] = r; if (r > maxRankW[f]) maxRankW[f] = r; }
        continue;
      }
      if (t === KING) continue;
      if (black) nonPawnB += MG_VAL[t]; else nonPawnW += MG_VAL[t];
      if (t === BISHOP) { if (black) bishopsB++; else bishopsW++; }
      // mobility
      let mob = 0;
      if (t === KNIGHT) {
        for (let i = 0; i < 8; i++) { const s = sq + KNIGHT_D[i]; if (!(s & 0x88) && (!b[s] || (b[s] & 8) !== black)) mob++; }
        mob = (mob - 4) * 4;
      } else {
        const D = t === BISHOP ? DIAG_D : t === ROOK ? ORTH_D : KING_D;
        for (let i = 0; i < D.length; i++) { const d = D[i]; let s = sq + d; while (!(s & 0x88)) { const q = b[s]; if (!q) mob++; else { if ((q & 8) !== black) mob++; break; } s += d; } }
        mob = t === BISHOP ? (mob - 6) * 4 : t === ROOK ? (mob - 7) * 2 : (mob - 13);
      }
      if (black) { mgB += mob; egB += mob; } else { mgW += mob; egW += mob; }
    }
    // rooks on open files (needs full pawn counts)
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if ((p & 7) !== ROOK) continue;
      const f = sq & 7;
      if (p & 8) { if (!pawnsB[f]) { mgB += pawnsW[f] ? 10 : 22; egB += pawnsW[f] ? 5 : 10; } }
      else if (!pawnsW[f]) { mgW += pawnsB[f] ? 10 : 22; egW += pawnsB[f] ? 5 : 10; }
    }
    // pawn structure
    for (let f = 0; f < 8; f++) {
      const wl = f > 0 ? pawnsW[f - 1] : 0, wr = f < 7 ? pawnsW[f + 1] : 0, bl = f > 0 ? pawnsB[f - 1] : 0, br = f < 7 ? pawnsB[f + 1] : 0;
      if (pawnsW[f]) {
        if (pawnsW[f] > 1) { mgW -= 10 * (pawnsW[f] - 1); egW -= 22 * (pawnsW[f] - 1); }
        if (!wl && !wr) { mgW -= 12 * pawnsW[f]; egW -= 14 * pawnsW[f]; }
        // the most advanced white pawn on this file: passed if no black pawn ahead on this or next files
        const r = maxRankW[f];
        let passed = true;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (maxRankB[g] > r) { passed = false; break; }
        if (passed) { mgW += PASSED_MG[r]; egW += PASSED_EG[r];
          const ahead = r * 16 + 16 + f; if (b[ahead]) egW -= PASSED_EG[r] >> 2;
          const kd = Math.max(Math.abs((pos.kings[BLACK] >> 4) - 7), Math.abs((pos.kings[BLACK] & 7) - f)), md = Math.max(7 - r, 0);
          if (nonPawnB === 0 && kd > md + (pos.turn === BLACK ? 1 : 0)) egW += 300;   // the king can't catch it
        }
      }
      if (pawnsB[f]) {
        if (pawnsB[f] > 1) { mgB -= 10 * (pawnsB[f] - 1); egB -= 22 * (pawnsB[f] - 1); }
        if (!bl && !br) { mgB -= 12 * pawnsB[f]; egB -= 14 * pawnsB[f]; }
        const r = minRankB[f];
        let passed = true;
        for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (minRankW[g] < r) { passed = false; break; }
        if (passed) { mgB += PASSED_MG[7 - r]; egB += PASSED_EG[7 - r];
          const ahead = r * 16 - 16 + f; if (b[ahead]) egB -= PASSED_EG[7 - r] >> 2;
          const kd = Math.max(Math.abs(pos.kings[WHITE] >> 4), Math.abs((pos.kings[WHITE] & 7) - f)), md = r;
          if (nonPawnW === 0 && kd > md + (pos.turn === WHITE ? 1 : 0)) egB += 300;
        }
      }
    }
    if (bishopsW >= 2) { mgW += 30; egW += 50; }
    if (bishopsB >= 2) { mgB += 30; egB += 50; }
    // king shelter (middlegame)
    const kw = pos.kings[WHITE], kb = pos.kings[BLACK];
    if ((kw >> 4) <= 1) { const f = kw & 7; for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) { if (b[kw + 16 + g - f] === PAWN) mgW += 12; else if (!((kw + 32 + g - f) & 0x88) && b[kw + 32 + g - f] === PAWN) mgW += 6; else mgW -= 14; if (!pawnsW[g]) mgW -= 10; } }
    if ((kb >> 4) >= 6) { const f = kb & 7; for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) { if (b[kb - 16 + g - f] === (PAWN | 8)) mgB += 12; else if (!((kb - 32 + g - f) & 0x88) && b[kb - 32 + g - f] === (PAWN | 8)) mgB += 6; else mgB -= 14; if (!pawnsB[g]) mgB -= 10; } }

    if (phase > 24) phase = 24;
    let score = (((mgW - mgB) * phase) + ((egW - egB) * (24 - phase))) / 24;
    // help finish won endgames: push the lone king to the edge and bring ours closer
    const matW = nonPawnW + pawnCountW * 100, matB = nonPawnB + pawnCountB * 100;
    if (!pawnCountB && nonPawnB <= 330 && matW - matB >= 400 && nonPawnW >= 500) score += 10 * CENTER_DIST(kb) + 4 * (14 - (Math.abs((kw >> 4) - (kb >> 4)) + Math.abs((kw & 7) - (kb & 7)))) + 200;
    if (!pawnCountW && nonPawnW <= 330 && matB - matW >= 400 && nonPawnB >= 500) score -= 10 * CENTER_DIST(kw) + 4 * (14 - (Math.abs((kw >> 4) - (kb >> 4)) + Math.abs((kw & 7) - (kb & 7)))) + 200;
    // without pawns, a small extra piece usually isn't enough to win
    if (score > 0 && !pawnCountW && nonPawnW - nonPawnB < 400) score /= 6;
    if (score < 0 && !pawnCountB && nonPawnB - nonPawnW < 400) score /= 6;
    score = score | 0;
    return (pos.turn === WHITE ? score : -score) + 12;
  }

  /* ---------- search ---------- */
  class Searcher {
    constructor(ttBits) {
      this.ttBits = ttBits || 19; const n = 1 << this.ttBits; this.ttMask = n - 1;
      this.ttKey = new Int32Array(n); this.ttMove = new Int32Array(n); this.ttScore = new Int16Array(n); this.ttDepth = new Int8Array(n); this.ttFlag = new Uint8Array(n);
      this.history = new Int32Array(16 * 128);
      this.killers = new Int32Array(MAX_PLY * 2);
      this.pv = new Int32Array(MAX_PLY * MAX_PLY); this.pvLen = new Int32Array(MAX_PLY);
      this.moveLists = []; this.moveScores = [];
      for (let i = 0; i < MAX_PLY + 8; i++) { this.moveLists.push([]); this.moveScores.push(new Int32Array(256)); }
      this.repLo = new Int32Array(1200); this.repHi = new Int32Array(1200); this.repLen = 0;
    }
    clear() { this.ttKey.fill(0); this.ttFlag.fill(0); this.history.fill(0); }

    /* positions already played in the game, so the engine knows about repetitions.
       The list always holds the positions before the current one (its ancestors). */
    setHistory(list) { this.repLen = 0; for (const [lo, hi] of list || []) { this.repLo[this.repLen] = lo; this.repHi[this.repLen++] = hi; } }

    isRepetition(pos) {
      const lo = pos.hlo, hi = pos.hhi, stop = Math.max(0, this.repLen - pos.halfmove);
      for (let i = this.repLen - 2; i >= stop; i -= 2) if (this.repLo[i] === lo && this.repHi[i] === hi) return true;
      return false;
    }

    checkTime() {
      if (this.stopped) return;
      if ((this.maxNodes && this.nodes >= this.maxNodes) || (this.deadline && Date.now() >= this.deadline)) this.stopped = true;
    }

    orderMoves(pos, list, scores, ttMove, ply) {
      const b = pos.board, k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
      for (let i = 0; i < list.length; i++) {
        const m = list[i], fl = m >> 17, from = m & 127, to = (m >> 7) & 127;
        let s;
        if (m === ttMove) s = 10000000;
        else if (fl & (F_CAPTURE | F_PROMO)) s = 1000000 + ((b[to] & 7) || (fl & F_PROMO ? 0 : 1)) * 100 - (b[from] & 7) + (fl & F_PROMO ? ((m >> 14) & 7) === QUEEN ? 800 : -900000 : 0);
        else if (m === k1) s = 900000;
        else if (m === k2) s = 800000;
        else s = this.history[b[from] * 128 + to];
        scores[i] = s;
      }
    }
    pick(list, scores, i) {
      let best = i;
      for (let j = i + 1; j < list.length; j++) if (scores[j] > scores[best]) best = j;
      if (best !== i) { const m = list[i]; list[i] = list[best]; list[best] = m; const s = scores[i]; scores[i] = scores[best]; scores[best] = s; }
      return list[i];
    }

    quiesce(pos, alpha, beta, ply) {
      if ((++this.nodes & 1023) === 0) this.checkTime();
      if (this.stopped) return 0;
      if (ply >= MAX_PLY - 2) return evaluate(pos);
      const inCheck = pos.inCheck();
      let best = -INF, stand = 0;
      if (!inCheck) {
        stand = evaluate(pos);
        if (stand >= beta) return stand;
        if (stand > alpha) alpha = stand;
        best = stand;
      }
      const list = this.moveLists[ply]; list.length = 0;
      pos.genMoves(list, !inCheck);
      const scores = this.moveScores[ply];
      this.orderMoves(pos, list, scores, 0, ply);
      const b = pos.board, them = pos.turn ^ 1;
      let legal = 0;
      for (let i = 0; i < list.length; i++) {
        const m = this.pick(list, scores, i);
        if (!inCheck) {
          const to = (m >> 7) & 127, victim = (m >> 17) & 4 ? PAWN : b[to] & 7, attacker = b[m & 127] & 7, promo = (m >> 17) & F_PROMO;
          if (!promo && stand + MG_VAL[victim] + 200 < alpha) continue;   // can't possibly help
          if (!promo && MG_VAL[victim] < MG_VAL[attacker] && pos.attacked(to, them)) continue;   // likely loses material
        }
        if (!pos.make(m)) continue;
        legal++;
        const score = -this.quiesce(pos, -beta, -alpha, ply + 1);
        pos.unmake();
        if (this.stopped) return 0;
        if (score > best) { best = score; if (score > alpha) { alpha = score; if (score >= beta) break; } }
      }
      if (inCheck && !legal) return -MATE + ply;
      return best;
    }

    search(pos, depth, alpha, beta, ply, allowNull) {
      if ((++this.nodes & 1023) === 0) this.checkTime();
      if (this.stopped) return 0;
      this.pvLen[ply] = ply;
      if (pos.halfmove >= 100 || this.isRepetition(pos)) return 0;
      alpha = Math.max(alpha, -MATE + ply); beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
      const inCheck = pos.inCheck();
      if (inCheck) depth++;
      if (depth <= 0 || ply >= MAX_PLY - 4) return this.quiesce(pos, alpha, beta, ply);
      const pvNode = beta - alpha > 1;
      const idx = pos.hlo & this.ttMask;
      let ttMove = 0;
      if (this.ttKey[idx] === pos.hhi && this.ttFlag[idx]) {
        ttMove = this.ttMove[idx];
        if (!pvNode && this.ttDepth[idx] >= depth) {
          let s = this.ttScore[idx];
          if (s > MATE_BOUND) s -= ply; else if (s < -MATE_BOUND) s += ply;
          const fl = this.ttFlag[idx];
          if (fl === EXACT || (fl === LOWER && s >= beta) || (fl === UPPER && s <= alpha)) return s;
        }
      }
      const staticEval = inCheck ? -INF : evaluate(pos);
      if (!pvNode && !inCheck) {
        // the position is already so good that even a big drop would still beat beta
        if (depth <= 3 && staticEval - 110 * depth >= beta && Math.abs(beta) < MATE_BOUND) return staticEval;
        // give the opponent a free move: if we're still winning, this line is good enough
        if (allowNull && depth >= 3 && staticEval >= beta && this.hasPieces(pos)) {
          const R = depth > 6 ? 3 : 2;
          this.repLo[this.repLen] = pos.hlo; this.repHi[this.repLen++] = pos.hhi;
          pos.makeNull();
          const s = -this.search(pos, depth - 1 - R, -beta, -beta + 1, ply + 1, false);
          pos.unmakeNull(); this.repLen--;
          if (this.stopped) return 0;
          if (s >= beta) return s > MATE_BOUND ? beta : s;
        }
      }
      const list = this.moveLists[ply]; list.length = 0;
      pos.genMoves(list, false);
      const scores = this.moveScores[ply];
      this.orderMoves(pos, list, scores, ttMove, ply);
      const b = pos.board;
      this.repLo[this.repLen] = pos.hlo; this.repHi[this.repLen++] = pos.hhi;
      let best = -INF, bestMove = 0, legal = 0, flag = UPPER;
      for (let i = 0; i < list.length; i++) {
        const m = this.pick(list, scores, i);
        const quiet = !((m >> 17) & (F_CAPTURE | F_PROMO));
        const piece = b[m & 127], to = (m >> 7) & 127;
        if (!pos.make(m)) continue;
        legal++;
        const givesCheck = pos.inCheck();
        // far behind with a quiet move at the edge of the search: skip it
        if (!pvNode && !inCheck && !givesCheck && quiet && legal > 1 && depth <= 2 && staticEval + 120 * depth + 60 <= alpha) { pos.unmake(); continue; }
        let score;
        if (legal === 1) score = -this.search(pos, depth - 1, -beta, -alpha, ply + 1, true);
        else {
          let r = 0;
          if (depth >= 3 && quiet && !inCheck && !givesCheck && legal > 3 && m !== this.killers[ply * 2] && m !== this.killers[ply * 2 + 1]) {
            r = 1 + (legal > 8 ? 1 : 0) + (depth > 7 ? 1 : 0) - (pvNode ? 1 : 0);
            if (r > depth - 2) r = depth - 2; if (r < 0) r = 0;
          }
          score = -this.search(pos, depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && r) score = -this.search(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
          if (score > alpha && score < beta) score = -this.search(pos, depth - 1, -beta, -alpha, ply + 1, true);
        }
        pos.unmake();
        if (this.stopped) { this.repLen--; return 0; }
        if (score > best) {
          best = score; bestMove = m;
          if (score > alpha) {
            alpha = score; flag = EXACT;
            const base = ply * MAX_PLY, next = (ply + 1) * MAX_PLY;
            this.pv[base + ply] = m;
            for (let j = ply + 1; j < this.pvLen[ply + 1]; j++) this.pv[base + j] = this.pv[next + j];
            this.pvLen[ply] = Math.max(ply + 1, this.pvLen[ply + 1]);
            if (score >= beta) {
              flag = LOWER;
              if (quiet) {
                if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
                const h = piece * 128 + to; this.history[h] += depth * depth; if (this.history[h] > 700000) for (let k = 0; k < this.history.length; k++) this.history[k] >>= 1;
              }
              break;
            }
          }
        }
      }
      this.repLen--;
      if (!legal) return inCheck ? -MATE + ply : 0;
      let ts = best; if (ts > MATE_BOUND) ts += ply; else if (ts < -MATE_BOUND) ts -= ply;
      if (this.ttDepth[idx] <= depth || this.ttKey[idx] !== pos.hhi) {
        this.ttKey[idx] = pos.hhi; this.ttMove[idx] = bestMove; this.ttScore[idx] = ts; this.ttDepth[idx] = depth; this.ttFlag[idx] = flag;
      }
      return best;
    }
    hasPieces(pos) {
      const b = pos.board, c = pos.turn << 3;
      for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = b[sq]; if (p && (p & 8) === c && (p & 7) !== PAWN && (p & 7) !== KING) return true; }
      return false;
    }

    pvFrom(pos, first) {
      const out = [first]; const base = 1 * MAX_PLY;
      for (let j = 1; j < this.pvLen[1]; j++) out.push(this.pv[base + j]);
      // make sure every move is really playable (the table can be cut short or stale)
      const ok = []; let n = 0;
      for (const m of out) { if (!m || !pos.legalMoves().includes(m)) break; pos.make(m); ok.push(m); n++; }
      while (n--) pos.unmake();
      return ok;
    }

    /* think about a position. opts: { time (ms), depth, nodes, multiPV, history: [[lo, hi], ...], onInfo(info) }
       returns { best, score, mate, depth, pv, lines: [{ move, score, mate, pv }], nodes, time } – scores are for the side to move */
    think(pos, opts) {
      opts = opts || {};
      const start = Date.now();
      this.deadline = opts.time ? start + opts.time : 0;
      this.maxNodes = opts.nodes || 0;
      this.nodes = 0; this.stopped = false;
      this.killers.fill(0);
      for (let k = 0; k < this.history.length; k++) this.history[k] >>= 2;
      if (opts.history) this.setHistory(opts.history);
      const baseRep = this.repLen;
      this.repLo[this.repLen] = pos.hlo; this.repHi[this.repLen++] = pos.hhi;
      const maxDepth = Math.min(opts.depth || 64, MAX_PLY - 10);
      const multi = Math.max(1, opts.multiPV || 1);
      let root = pos.legalMoves().map(m => ({ move: m, score: -INF, pv: [m] }));
      const result = { best: 0, score: 0, depth: 0, pv: [], lines: [], nodes: 0, time: 0 };
      if (!root.length) { this.repLen = baseRep; result.score = pos.inCheck() ? -MATE : 0; return result; }
      // put the table's move first
      const idx = pos.hlo & this.ttMask;
      if (this.ttKey[idx] === pos.hhi) { const i = root.findIndex(r => r.move === this.ttMove[idx]); if (i > 0) root.unshift(root.splice(i, 1)[0]); }
      for (let depth = 1; depth <= maxDepth; depth++) {
        const done = [];
        const lines = Math.min(multi, root.length);
        for (let k = 0; k < lines; k++) {
          let alpha = -INF; const beta = INF;
          let bestIdx = -1;
          for (let i = 0; i < root.length; i++) {
            const r = root[i];
            if (done.includes(r)) continue;
            pos.make(r.move);
            let score;
            if (bestIdx < 0) score = -this.search(pos, depth - 1, -beta, -alpha, 1, true);
            else {
              score = -this.search(pos, depth - 1, -alpha - 1, -alpha, 1, true);
              if (score > alpha && !this.stopped) score = -this.search(pos, depth - 1, -beta, -alpha, 1, true);
            }
            pos.unmake();
            if (this.stopped) break;
            if (bestIdx < 0 || score > alpha) {
              alpha = score; bestIdx = i;
              r.score = score; r.pv = this.pvFrom(pos, r.move);
            } else r.score = -INF + 1;
          }
          if (bestIdx < 0) break;
          const r = root[bestIdx];
          done.push(r);
          // keep the order: found lines first, best first, so the next depth searches them first
          root.splice(bestIdx, 1); root.splice(k, 0, r);
          if (this.stopped) break;
        }
        if (!done.length) break;
        // a cut-short depth still counts: its first line was fully searched (with several lines, keep the last whole set)
        if (this.stopped && done.length < lines && result.depth) break;
        result.best = done[0].move; result.score = done[0].score; result.depth = depth; result.pv = done[0].pv;
        result.lines = done.map(r => ({ move: r.move, score: r.score, pv: r.pv, mate: mateIn(r.score) }));
        result.mate = mateIn(result.score);
        result.nodes = this.nodes; result.time = Date.now() - start;
        if (opts.onInfo) opts.onInfo({ depth, score: result.score, mate: result.mate, pv: result.pv.map(Chess.toUci), lines: result.lines.map(l => ({ score: l.score, mate: l.mate, pv: l.pv.map(Chess.toUci) })), nodes: this.nodes, time: result.time });
        if (this.stopped) break;
        if (Math.abs(result.score) > MATE_BOUND && depth > (MATE - Math.abs(result.score)) + 2 && multi === 1) break;   // a mate is found and proven
        if (this.deadline && Date.now() - start > (this.deadline - start) * 0.55) break;   // the next depth won't finish in time
        if (root.length === 1 && depth >= 4 && multi === 1) break;   // only one move – no need to keep thinking
      }
      this.repLen = baseRep;
      if (!result.best) { result.best = root[0].move; result.pv = [root[0].move]; }
      result.nodes = this.nodes; result.time = Date.now() - start;
      return result;
    }

    /* score every legal move at a fixed depth (bots use this to play like people, picking good-but-not-perfect moves) */
    scoreMoves(pos, depth, opts) {
      opts = opts || {};
      this.deadline = opts.time ? Date.now() + opts.time : 0; this.maxNodes = 0; this.nodes = 0; this.stopped = false;
      if (opts.history) this.setHistory(opts.history);
      const baseRep = this.repLen;
      this.repLo[this.repLen] = pos.hlo; this.repHi[this.repLen++] = pos.hhi;
      const out = [];
      for (const m of pos.legalMoves()) {
        pos.make(m);
        const s = -this.search(pos, Math.max(0, depth - 1), -INF, INF, 1, true);
        pos.unmake();
        out.push({ move: m, score: this.stopped ? 0 : s });
      }
      this.repLen = baseRep;
      return out.sort((a, b) => b.score - a.score);
    }
  }
  const mateIn = s => s > MATE_BOUND ? Math.ceil((MATE - s) / 2) : s < -MATE_BOUND ? -Math.ceil((MATE + s) / 2) : 0;

  /* replay a game (start FEN + UCI moves) and collect the hashes along the way */
  function replay(fen, moves) {
    const pos = new Chess.Position(fen);
    const hist = [];
    for (const u of moves || []) {
      hist.push([pos.hlo, pos.hhi]);
      const m = pos.legalMoves().find(x => Chess.toUci(x) === u);
      if (m == null) break;
      pos.make(m);
    }
    pos.stack = [];
    return { pos, history: hist };
  }

  return { Searcher, evaluate, replay, mateIn, INF, MATE, MATE_BOUND };
});
