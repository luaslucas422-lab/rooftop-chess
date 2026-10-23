/* Rooftop Chess – the rules of chess.
   Used by the app (board, bots, puzzles, review) and by the server (online games), so both always agree.
   Board is 0x88: square = rank * 16 + file, a1 = 0, h8 = 119. Pieces: 1 pawn .. 6 king, +8 for black. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chess = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const WHITE = 0, BLACK = 1;
  const F_CAPTURE = 1, F_DOUBLE = 2, F_EP = 4, F_CASTLE = 8, F_PROMO = 16;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
  const KING_D = [16, -16, 1, -1, 17, 15, -17, -15];
  const DIAG_D = [17, 15, -17, -15];
  const ORTH_D = [16, -16, 1, -1];
  const LETTERS = ' pnbrqk';
  const VALUE = [0, 100, 320, 330, 500, 900, 0];

  const sqName = sq => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
  const sqParse = s => { s = String(s); const f = s.charCodeAt(0) - 97, r = s.charCodeAt(1) - 49; return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 16 + f : -1; };
  const mFrom = m => m & 127, mTo = m => (m >> 7) & 127, mPromo = m => (m >> 14) & 7, mFlags = m => m >> 17;
  const mkMove = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | (flags << 17);

  /* castling rights lost when a piece leaves or lands on these squares */
  const CASTLE_MASK = new Int8Array(128).fill(15);
  CASTLE_MASK[4] = 15 & ~3; CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1;
  CASTLE_MASK[116] = 15 & ~12; CASTLE_MASK[112] = 15 & ~8; CASTLE_MASK[119] = 15 & ~4;

  /* Zobrist keys from a fixed seed, so every copy of the game hashes positions the same way */
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z_PIECE_LO = new Int32Array(16 * 128), Z_PIECE_HI = new Int32Array(16 * 128);
  for (let i = 0; i < 16 * 128; i++) { Z_PIECE_LO[i] = rnd(); Z_PIECE_HI[i] = rnd(); }
  const Z_CASTLE_LO = new Int32Array(16), Z_CASTLE_HI = new Int32Array(16);
  for (let i = 0; i < 16; i++) { Z_CASTLE_LO[i] = rnd(); Z_CASTLE_HI[i] = rnd(); }
  const Z_EP_LO = new Int32Array(8), Z_EP_HI = new Int32Array(8);
  for (let i = 0; i < 8; i++) { Z_EP_LO[i] = rnd(); Z_EP_HI[i] = rnd(); }
  const Z_SIDE_LO = rnd(), Z_SIDE_HI = rnd();

  class Position {
    constructor(fen) {
      this.board = new Int8Array(128);
      this.kings = [-1, -1];
      this.stack = [];
      this.load(fen || START_FEN);
    }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      const b = this.board; b.fill(0); this.kings = [-1, -1];
      const rows = (parts[0] || '').split('/');
      if (rows.length !== 8) throw new Error('Bad FEN: needs 8 ranks');
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const ch of rows[7 - r]) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const t = LETTERS.indexOf(ch.toLowerCase());
          if (t < 1 || f > 7) throw new Error('Bad FEN: ' + ch);
          const color = ch === ch.toLowerCase() ? BLACK : WHITE;
          b[r * 16 + f] = t | (color << 3);
          if (t === KING) this.kings[color] = r * 16 + f;
          f++;
        }
        if (f !== 8) throw new Error('Bad FEN: rank ' + (r + 1));
      }
      if (this.kings[0] < 0 || this.kings[1] < 0) throw new Error('Bad FEN: both kings needed');
      this.turn = parts[1] === 'b' ? BLACK : WHITE;
      const c = parts[2] || '-';
      this.castling = (c.includes('K') && b[4] === KING && b[7] === ROOK ? 1 : 0) | (c.includes('Q') && b[4] === KING && b[0] === ROOK ? 2 : 0) |
        (c.includes('k') && b[116] === (KING | 8) && b[119] === (ROOK | 8) ? 4 : 0) | (c.includes('q') && b[116] === (KING | 8) && b[112] === (ROOK | 8) ? 8 : 0);
      this.ep = -1;
      const ep = sqParse(parts[3] || '-');
      if (ep >= 0 && this.epPossible(ep)) this.ep = ep;
      this.halfmove = Math.max(0, parseInt(parts[4], 10) || 0);
      this.fullmove = Math.max(1, parseInt(parts[5], 10) || 1);
      this.stack = [];
      this.rehash();
      return this;
    }

    /* an en passant square only counts if a pawn could actually take there (keeps repetitions honest) */
    epPossible(ep) {
      const us = this.turn, pawn = PAWN | (us << 3), dir = us === WHITE ? -16 : 16;
      return [ep + dir - 1, ep + dir + 1].some(s => !(s & 0x88) && this.board[s] === pawn);
    }

    rehash() {
      let lo = 0, hi = 0;
      for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = this.board[sq]; if (p) { lo ^= Z_PIECE_LO[p * 128 + sq]; hi ^= Z_PIECE_HI[p * 128 + sq]; } }
      lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
      if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
      if (this.turn === BLACK) { lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI; }
      this.hlo = lo; this.hhi = hi;
    }
    key() { return (this.hhi >>> 0).toString(36) + '.' + (this.hlo >>> 0).toString(36); }

    fen() {
      const b = this.board; let s = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = b[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          const ch = LETTERS[p & 7]; s += p & 8 ? ch : ch.toUpperCase();
        }
        if (empty) s += empty;
        if (r) s += '/';
      }
      const c = (this.castling & 1 ? 'K' : '') + (this.castling & 2 ? 'Q' : '') + (this.castling & 4 ? 'k' : '') + (this.castling & 8 ? 'q' : '');
      return s + ' ' + (this.turn ? 'b' : 'w') + ' ' + (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.halfmove + ' ' + this.fullmove;
    }

    clone() { const p = Object.create(Position.prototype); p.board = new Int8Array(this.board); p.kings = this.kings.slice(); p.stack = [];
      p.turn = this.turn; p.castling = this.castling; p.ep = this.ep; p.halfmove = this.halfmove; p.fullmove = this.fullmove; p.hlo = this.hlo; p.hhi = this.hhi; return p; }

    attacked(sq, by) {
      const b = this.board; let s;
      if (by === WHITE) {
        s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
        s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
      } else {
        s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
        s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | 8)) return true;
      }
      const c = by << 3, kn = KNIGHT | c, kg = KING | c, bi = BISHOP | c, ro = ROOK | c, qu = QUEEN | c;
      for (let i = 0; i < 8; i++) { s = sq + KNIGHT_D[i]; if (!(s & 0x88) && b[s] === kn) return true; }
      for (let i = 0; i < 8; i++) { s = sq + KING_D[i]; if (!(s & 0x88) && b[s] === kg) return true; }
      for (let i = 0; i < 4; i++) { const d = DIAG_D[i]; s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === bi || p === qu) return true; break; } s += d; } }
      for (let i = 0; i < 4; i++) { const d = ORTH_D[i]; s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if (p === ro || p === qu) return true; break; } s += d; } }
      return false;
    }
    inCheck(color) { if (color === undefined) color = this.turn; return this.attacked(this.kings[color], color ^ 1); }

    /* pseudo-legal moves (may leave the king in check); capsOnly = captures and queen promotions */
    genMoves(out, capsOnly) {
      const b = this.board, us = this.turn, them = us ^ 1;
      const up = us === WHITE ? 16 : -16, startRank = us === WHITE ? 1 : 6, lastRank = us === WHITE ? 7 : 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq]; if (!p || (p >> 3) !== us) continue;
        const t = p & 7;
        if (t === PAWN) {
          const to = sq + up;
          if (!b[to]) {
            if ((to >> 4) === lastRank) { out.push(mkMove(sq, to, QUEEN, F_PROMO)); if (!capsOnly) { out.push(mkMove(sq, to, KNIGHT, F_PROMO)); out.push(mkMove(sq, to, ROOK, F_PROMO)); out.push(mkMove(sq, to, BISHOP, F_PROMO)); } }
            else if (!capsOnly) { out.push(mkMove(sq, to, 0, 0)); if ((sq >> 4) === startRank && !b[to + up]) out.push(mkMove(sq, to + up, 0, F_DOUBLE)); }
          }
          for (let k = -1; k <= 1; k += 2) {
            const c = to + k; if (c & 0x88) continue;
            const q = b[c];
            if (q && (q >> 3) === them) {
              if ((c >> 4) === lastRank) { out.push(mkMove(sq, c, QUEEN, F_PROMO | F_CAPTURE)); if (!capsOnly) { out.push(mkMove(sq, c, KNIGHT, F_PROMO | F_CAPTURE)); out.push(mkMove(sq, c, ROOK, F_PROMO | F_CAPTURE)); out.push(mkMove(sq, c, BISHOP, F_PROMO | F_CAPTURE)); } }
              else out.push(mkMove(sq, c, 0, F_CAPTURE));
            } else if (c === this.ep) out.push(mkMove(sq, c, 0, F_EP | F_CAPTURE));
          }
        } else if (t === KNIGHT || t === KING) {
          const D = t === KNIGHT ? KNIGHT_D : KING_D;
          for (let i = 0; i < 8; i++) {
            const to = sq + D[i]; if (to & 0x88) continue;
            const q = b[to];
            if (!q) { if (!capsOnly) out.push(mkMove(sq, to, 0, 0)); }
            else if ((q >> 3) === them) out.push(mkMove(sq, to, 0, F_CAPTURE));
          }
        } else {
          const D = t === BISHOP ? DIAG_D : t === ROOK ? ORTH_D : KING_D;
          for (let i = 0; i < D.length; i++) {
            const d = D[i]; let to = sq + d;
            while (!(to & 0x88)) {
              const q = b[to];
              if (!q) { if (!capsOnly) out.push(mkMove(sq, to, 0, 0)); }
              else { if ((q >> 3) === them) out.push(mkMove(sq, to, 0, F_CAPTURE)); break; }
              to += d;
            }
          }
        }
      }
      if (!capsOnly && this.castling) {
        if (us === WHITE) {
          if ((this.castling & 1) && !b[5] && !b[6] && !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK)) out.push(mkMove(4, 6, 0, F_CASTLE));
          if ((this.castling & 2) && !b[3] && !b[2] && !b[1] && !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK)) out.push(mkMove(4, 2, 0, F_CASTLE));
        } else {
          if ((this.castling & 4) && !b[117] && !b[118] && !this.attacked(116, WHITE) && !this.attacked(117, WHITE) && !this.attacked(118, WHITE)) out.push(mkMove(116, 118, 0, F_CASTLE));
          if ((this.castling & 8) && !b[115] && !b[114] && !b[113] && !this.attacked(116, WHITE) && !this.attacked(115, WHITE) && !this.attacked(114, WHITE)) out.push(mkMove(116, 114, 0, F_CASTLE));
        }
      }
      return out;
    }

    /* plays a pseudo-legal move; returns false (and takes it back) if it leaves our king in check */
    make(m) {
      const b = this.board, from = m & 127, to = (m >> 7) & 127, flags = m >> 17, us = this.turn;
      const piece = b[from];
      let captured = b[to], lo = this.hlo, hi = this.hhi;
      this.stack.push(m, captured, this.castling, this.ep, this.halfmove, lo, hi);
      if (this.ep >= 0) { lo ^= Z_EP_LO[this.ep & 7]; hi ^= Z_EP_HI[this.ep & 7]; }
      lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
      lo ^= Z_PIECE_LO[piece * 128 + from]; hi ^= Z_PIECE_HI[piece * 128 + from];
      b[from] = 0;
      if (flags & F_EP) {
        const cs = to + (us === WHITE ? -16 : 16); captured = b[cs]; b[cs] = 0;
        this.stack[this.stack.length - 6] = captured;
        lo ^= Z_PIECE_LO[captured * 128 + cs]; hi ^= Z_PIECE_HI[captured * 128 + cs];
      } else if (captured) { lo ^= Z_PIECE_LO[captured * 128 + to]; hi ^= Z_PIECE_HI[captured * 128 + to]; }
      const placed = flags & F_PROMO ? ((m >> 14) & 7) | (us << 3) : piece;
      b[to] = placed; lo ^= Z_PIECE_LO[placed * 128 + to]; hi ^= Z_PIECE_HI[placed * 128 + to];
      if ((piece & 7) === KING) {
        this.kings[us] = to;
        if (flags & F_CASTLE) {
          const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1, rook = b[rf];
          b[rt] = rook; b[rf] = 0;
          lo ^= Z_PIECE_LO[rook * 128 + rf] ^ Z_PIECE_LO[rook * 128 + rt]; hi ^= Z_PIECE_HI[rook * 128 + rf] ^ Z_PIECE_HI[rook * 128 + rt];
        }
      }
      this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
      lo ^= Z_CASTLE_LO[this.castling]; hi ^= Z_CASTLE_HI[this.castling];
      this.ep = -1;
      if (flags & F_DOUBLE) {
        const ep = (from + to) >> 1, enemy = PAWN | ((us ^ 1) << 3);
        if ((!((to - 1) & 0x88) && b[to - 1] === enemy) || (!((to + 1) & 0x88) && b[to + 1] === enemy)) { this.ep = ep; lo ^= Z_EP_LO[ep & 7]; hi ^= Z_EP_HI[ep & 7]; }
      }
      this.halfmove = (piece & 7) === PAWN || captured ? 0 : this.halfmove + 1;
      if (us === BLACK) this.fullmove++;
      this.turn = us ^ 1; lo ^= Z_SIDE_LO; hi ^= Z_SIDE_HI;
      this.hlo = lo; this.hhi = hi;
      if (this.attacked(this.kings[us], us ^ 1)) { this.unmake(); return false; }
      return true;
    }

    unmake() {
      const s = this.stack, b = this.board;
      const hi = s.pop(), lo = s.pop(), half = s.pop(), ep = s.pop(), castling = s.pop(), captured = s.pop(), m = s.pop();
      const from = m & 127, to = (m >> 7) & 127, flags = m >> 17;
      this.turn ^= 1; const us = this.turn;
      const piece = flags & F_PROMO ? PAWN | (us << 3) : b[to];
      b[from] = piece;
      if (flags & F_EP) { b[to] = 0; b[to + (us === WHITE ? -16 : 16)] = captured; }
      else b[to] = captured;
      if ((piece & 7) === KING) {
        this.kings[us] = from;
        if (flags & F_CASTLE) { const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1; b[rf] = b[rt]; b[rt] = 0; }
      }
      this.castling = castling; this.ep = ep; this.halfmove = half; this.hlo = lo; this.hhi = hi;
      if (us === BLACK) this.fullmove--;
    }

    /* pass the turn (used by the engine's null-move search) */
    makeNull() {
      this.stack.push(0, 0, this.castling, this.ep, this.halfmove, this.hlo, this.hhi);
      if (this.ep >= 0) { this.hlo ^= Z_EP_LO[this.ep & 7]; this.hhi ^= Z_EP_HI[this.ep & 7]; this.ep = -1; }
      this.turn ^= 1; this.hlo ^= Z_SIDE_LO; this.hhi ^= Z_SIDE_HI; this.halfmove++;
    }
    unmakeNull() {
      const s = this.stack; this.hhi = s.pop(); this.hlo = s.pop(); this.halfmove = s.pop(); this.ep = s.pop(); this.castling = s.pop(); s.pop(); s.pop();
      this.turn ^= 1;
    }

    legalMoves() {
      const list = this.genMoves([]), out = [];
      for (const m of list) if (this.make(m)) { this.unmake(); out.push(m); }
      return out;
    }
    hasLegalMove() {
      const list = this.genMoves([]);
      for (const m of list) if (this.make(m)) { this.unmake(); return true; }
      return false;
    }

    /* not enough pieces left for anyone to ever checkmate */
    insufficient() {
      const b = this.board; let minors = 0, bishopColors = 0, knights = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const t = b[sq] & 7;
        if (t === PAWN || t === ROOK || t === QUEEN) return false;
        if (t === KNIGHT) { minors++; knights++; }
        if (t === BISHOP) { minors++; bishopColors |= 1 << (((sq >> 4) + (sq & 7)) & 1); }
      }
      return minors <= 1 || (knights === 0 && bishopColors !== 3);
    }
    /* could this side ever checkmate? (decides a win or a draw when the other side runs out of time) */
    canMate(color) {
      const b = this.board; let mine = 0, minorOnly = true, theirs = 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq]; if (!p || (p & 7) === KING) continue;
        if ((p >> 3) === color) { mine++; if ((p & 7) !== KNIGHT && (p & 7) !== BISHOP) minorOnly = false; } else theirs++;
      }
      if (!mine) return false;
      if (mine === 1 && minorOnly && !theirs) return false;
      return true;
    }

    /* why a set-up position can't be played (null when it's fine) */
    problem() {
      const b = this.board; let wk = 0, bk = 0;
      for (let sq = 0; sq < 128; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = b[sq];
        if (p === KING) wk++; if (p === (KING | 8)) bk++;
        if ((p & 7) === PAWN && ((sq >> 4) === 0 || (sq >> 4) === 7)) return 'Pawns can’t stand on the first or last rank'; }
      if (wk !== 1 || bk !== 1) return 'Each side needs exactly one king';
      if (this.inCheck(this.turn ^ 1)) return 'The side not to move is in check';
      return null;
    }

    pieceAt(sq) { const p = this.board[typeof sq === 'string' ? sqParse(sq) : sq]; return p ? { type: LETTERS[p & 7], color: p & 8 ? 'b' : 'w' } : null; }

    toSan(m, legal) {
      const b = this.board, from = m & 127, to = (m >> 7) & 127, flags = m >> 17, t = b[from] & 7;
      let s;
      if (flags & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else {
        if (t === PAWN) s = flags & F_CAPTURE ? 'abcdefgh'[from & 7] + 'x' : '';
        else {
          s = LETTERS[t].toUpperCase();
          const others = (legal || this.legalMoves()).filter(o => o !== m && ((o >> 7) & 127) === to && (b[o & 127] & 7) === t && (o & 127) !== from);
          if (others.length) {
            const sameFile = others.some(o => ((o & 127) & 7) === (from & 7)), sameRank = others.some(o => ((o & 127) >> 4) === (from >> 4));
            if (!sameFile) s += 'abcdefgh'[from & 7];
            else if (!sameRank) s += (from >> 4) + 1;
            else s += sqName(from);
          }
          if (flags & F_CAPTURE) s += 'x';
        }
        s += sqName(to);
        if (flags & F_PROMO) s += '=' + LETTERS[(m >> 14) & 7].toUpperCase();
      }
      if (this.make(m)) {
        if (this.inCheck()) s += this.hasLegalMove() ? '+' : '#';
        this.unmake();
      }
      return s;
    }
  }

  const toUci = m => sqName(m & 127) + sqName((m >> 7) & 127) + ((m >> 17) & F_PROMO ? LETTERS[(m >> 14) & 7] : '');
  const cleanSan = s => String(s).replace(/[+#!?]/g, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O').replace(/=/, '').replace(/x/g, '').replace(/([a-h][18])([qrbn])$/, (_, a, b) => a + b.toUpperCase()).trim();

  /* a whole game: history, result, SAN, PGN */
  class Game {
    constructor(fen) {
      this.startFen = fen ? new Position(fen).fen() : START_FEN;
      this.pos = new Position(this.startFen);
      this.history = [];
      this.keys = [this.pos.key()];
      this.headers = {};
      this.forced = null;   // result set from outside: resign, time, agreement
    }
    get turn() { return this.pos.turn ? 'b' : 'w'; }
    fen() { return this.pos.fen(); }
    inCheck() { return this.pos.inCheck(); }
    moves() {
      const legal = this.pos.legalMoves();
      return legal.map(m => this.describe(m, legal));
    }
    describe(m, legal) {
      const f = m >> 17;
      return { move: m, from: sqName(m & 127), to: sqName((m >> 7) & 127), promo: f & F_PROMO ? LETTERS[(m >> 14) & 7] : null, uci: toUci(m), san: this.pos.toSan(m, legal),
        piece: LETTERS[this.pos.board[m & 127] & 7], color: this.turn, capture: !!(f & F_CAPTURE), castle: !!(f & F_CASTLE), ep: !!(f & F_EP) };
    }
    /* accepts {from,to,promo}, a UCI string like "e7e8q", or SAN like "Nf3" */
    find(input) {
      const legal = this.pos.legalMoves();
      if (input && typeof input === 'object') {
        const from = sqParse(input.from), to = sqParse(input.to), promo = input.promo ? LETTERS.indexOf(String(input.promo).toLowerCase()) : QUEEN;
        return legal.find(m => (m & 127) === from && ((m >> 7) & 127) === to && (!((m >> 17) & F_PROMO) || ((m >> 14) & 7) === promo)) || null;
      }
      const s = String(input || '').trim();
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) { const m = legal.find(x => toUci(x) === s || (s.length === 4 && toUci(x) === s + 'q')); if (m) return m; }
      const want = cleanSan(s);
      for (const m of legal) if (cleanSan(this.pos.toSan(m, legal)) === want) return m;
      const loose = want.replace(/^([NBRQK])[a-h1-8]{1,2}([a-h][1-8])$/, '$1$2');   // extra (unneeded) disambiguation
      if (loose !== want) for (const m of legal) if (cleanSan(this.pos.toSan(m, legal)) === loose) return m;
      return null;
    }
    move(input) {
      if (this.forced) return null;
      const m = this.find(input); if (m == null) return null;
      const legal = this.pos.legalMoves();
      const rec = this.describe(m, legal);
      rec.fenBefore = this.pos.fen();
      this.pos.make(m);
      rec.fen = this.pos.fen();
      rec.check = this.pos.inCheck();
      this.history.push(rec);
      this.keys.push(this.pos.key());
      return rec;
    }
    undo() {
      if (!this.history.length) return null;
      this.forced = null;
      this.pos.unmake(); this.keys.pop();
      return this.history.pop();
    }
    repetitions() { const k = this.keys[this.keys.length - 1]; let n = 0; for (const x of this.keys) if (x === k) n++; return n; }
    /* {over, result: '1-0' | '0-1' | '1/2-1/2', reason, winner: 'w' | 'b' | null} */
    status() {
      if (this.forced) return this.forced;
      const p = this.pos;
      if (!p.hasLegalMove()) {
        if (p.inCheck()) { const w = p.turn ? 'w' : 'b'; return { over: true, result: w === 'w' ? '1-0' : '0-1', reason: 'checkmate', winner: w }; }
        return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
      }
      if (p.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: null };
      if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'repetition', winner: null };
      if (p.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: '50-move rule', winner: null };
      return { over: false, result: '*', reason: '', winner: null };
    }
    /* end the game from outside (resign, timeout, agreement, abandon) */
    finish(winner, reason) {
      this.forced = { over: true, result: winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : '1/2-1/2', reason, winner: winner || null };
      return this.forced;
    }
    /* who wins when `color` ('w'/'b') runs out of time */
    timeoutResult(color) {
      const other = color === 'w' ? BLACK : WHITE;
      return this.pos.canMate(other) ? (color === 'w' ? 'b' : 'w') : null;
    }
    pgn(extra) {
      const st = this.status();
      const h = Object.assign({ Event: 'Casual game', Site: 'Rooftop Chess', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: '?', Black: '?', Result: st.result }, this.headers, extra || {});
      if (this.startFen !== START_FEN) { h.SetUp = '1'; h.FEN = this.startFen; }
      let out = '';
      for (const k in h) out += '[' + k + ' "' + String(h[k]).replace(/["\\]/g, '') + '"]\n';
      const start = new Position(this.startFen);
      let n = start.fullmove, white = start.turn === WHITE, line = '', text = '';
      const add = tok => { if (line.length + tok.length + 1 > 80) { text += line.trimEnd() + '\n'; line = ''; } line += tok + ' '; };
      this.history.forEach((r, i) => {
        if (white) add(n + '.'); else if (i === 0) add(n + '...');
        add(r.san);
        if (!white) n++;
        white = !white;
      });
      add(h.Result);
      return out + '\n' + (text + line).trim() + '\n';
    }
    static fromPgn(text) {
      text = String(text || '');
      const headers = {};
      text = text.replace(/^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/gm, (_, k, v) => { headers[k] = v; return ''; });
      let body = text.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').replace(/\$\d+/g, ' ');
      while (/\([^()]*\)/.test(body)) body = body.replace(/\([^()]*\)/g, ' ');
      const g = new Game(headers.FEN || undefined);
      g.headers = headers;
      const tokens = body.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean);
      for (const tok of tokens) {
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
        if (!g.move(tok)) throw new Error('Could not read move "' + tok + '"');
      }
      const res = headers.Result, st = g.status();
      if (!st.over && /^(1-0|0-1|1\/2-1\/2)$/.test(res || '')) g.finish(res === '1-0' ? 'w' : res === '0-1' ? 'b' : null, headers.Termination || 'game ended');
      return g;
    }
  }

  /* number of leaf positions at a depth – the standard way to prove a move generator is right */
  function perft(pos, depth) {
    if (depth === 0) return 1;
    const list = pos.genMoves([]); let n = 0;
    for (const m of list) if (pos.make(m)) { n += depth === 1 ? 1 : perft(pos, depth - 1); pos.unmake(); }
    return n;
  }

  return { Position, Game, perft, START_FEN, sqName, sqParse, toUci, mFrom, mTo, mPromo, mFlags, mkMove,
    PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK, F_CAPTURE, F_DOUBLE, F_EP, F_CASTLE, F_PROMO, LETTERS, VALUE, KNIGHT_D, KING_D, DIAG_D, ORTH_D };
});
