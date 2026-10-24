/* Rooftop Chess – Coach Mira. She sits beside you in bot games: after each of your moves she checks it with the engine,
   stops the game on a mistake (take it back, see the best move, or play on), warns you about threats, tells you when
   the bot slips, and gives opening tips. The judging and explaining are plain functions (tested in test/coach.test.js);
   Coach.Live connects them to a game on screen. Engine lines here are the engine thread's: scores from White's side. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess.js'), require('./openings.js'));
  else root.Coach = factory(root.Chess, root.Openings);
})(typeof self !== 'undefined' ? self : this, function (Chess, Openings) {
  'use strict';
  const VAL = [0, 1, 3, 3, 5, 9, 0], NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const A_PIECE = ['', 'a pawn', 'a knight', 'a bishop', 'a rook', 'a queen', 'a king'];
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const sq = Chess.sqName, side = c => c === 'w' ? 0 : 1, b = s => '<b>' + s + '</b>';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CAPTURE = Chess.F_CAPTURE, PROMO = Chess.F_PROMO;

  /* an engine line's score for one side, in centipawns (a mate counts as about a hundred pawns) */
  function cpFor(line, color) {
    if (!line) return 0;
    const w = line.mate ? (line.mate > 0 ? 10000 - line.mate * 10 : -10000 - line.mate * 10) : Math.max(-10000, Math.min(10000, line.score));
    return color === 'w' ? w : -w;
  }
  /* mate in n for this side (> 0), against it (< 0), or none (0) */
  const mateFor = (line, color) => !line || !line.mate ? 0 : color === 'w' ? line.mate : -line.mate;

  function findMove(pos, uci) { for (const m of pos.legalMoves()) if (Chess.toUci(m) === uci) return m; return null; }
  /* material for side c (0 white, 1 black) minus the other side's, in pawns */
  function material(pos, c) {
    let s = 0;
    for (let i = 0; i < 128; i++) { if (i & 0x88) { i += 7; continue; } const p = pos.board[i]; if (p) s += (p >> 3) === c ? VAL[p & 7] : -VAL[p & 7]; }
    return s;
  }
  /* material this side wins (or loses, < 0) along an engine line, once the captures have played out */
  function lineGain(fen, pv, color) {
    const pos = new Chess.Position(fen), c = side(color), start = material(pos, c);
    pv = pv || [];
    for (let i = 0; i < Math.min(pv.length, 10); i++) {
      const m = findMove(pos, pv[i]); if (m == null) break;
      if (i >= 6 && !(Chess.mFlags(m) & (CAPTURE | PROMO))) break;
      pos.make(m);
    }
    return material(pos, c) - start;
  }
  /* squares the piece on s attacks */
  function attacksFrom(pos, s) {
    const bd = pos.board, p = bd[s], t = p & 7, out = [];
    if (t === Chess.PAWN) { const up = p & 8 ? -16 : 16; for (const k of [-1, 1]) { const x = s + up + k; if (!(x & 0x88)) out.push(x); } return out; }
    if (t === Chess.KNIGHT || t === Chess.KING) { for (const d of t === Chess.KNIGHT ? Chess.KNIGHT_D : Chess.KING_D) { const x = s + d; if (!(x & 0x88)) out.push(x); } return out; }
    const dirs = t === Chess.BISHOP ? Chess.DIAG_D : t === Chess.ROOK ? Chess.ORTH_D : Chess.DIAG_D.concat(Chess.ORTH_D);
    for (const d of dirs) { let x = s + d; while (!(x & 0x88)) { out.push(x); if (bd[x]) break; x += d; } }
    return out;
  }
  /* the enemy pieces the piece on s could win: the king, anything worth more, or anything unprotected */
  function forkTargets(pos, s) {
    const bd = pos.board, p = bd[s]; if (!p) return [];
    const c = p >> 3, mine = VAL[p & 7], out = [];
    for (const x of attacksFrom(pos, s)) {
      const q = bd[x]; if (!q || (q >> 3) === c) continue;
      const t = q & 7;
      if (t === Chess.KING || VAL[t] > mine || (VAL[t] >= 3 && !pos.attacked(x, c ^ 1))) out.push({ sq: x, type: t });
    }
    return out;
  }
  /* "king and rook", "two rooks", "queen, rook and knight" */
  function listNames(ts) {
    const rank = t => t === Chess.KING ? 99 : VAL[t];
    const names = ts.map(t => t.type).sort((x, y) => rank(y) - rank(x)).map(t => NAME[t]), u = [...new Set(names)];
    if (u.length === 1) return (names.length === 2 ? 'two ' : 'three ') + u[0] + 's';
    return u.slice(0, -1).join(', ') + ' and ' + u[u.length - 1];
  }

  /* ---------- judging a move ---------- */
  /* o: { color, uci (the move played), best (the engine's move), before (best line before the move), after (their best line after it), book,
     scale (how forgiving: 1 rates like Game Review, more is gentler, less is stricter) }
     returns { cls, loss (in win %), wpB, wpA } – cls as in Game Review: book, best, excellent, good, inaccuracy, mistake, miss, blunder */
  function grade(o) {
    const c = o.color, wpB = winPct(cpFor(o.before, c)), wpA = winPct(cpFor(o.after, c)), k = o.scale || 1;
    const loss = o.uci === o.best ? 0 : Math.max(0, wpB - wpA);
    let cls = o.book ? 'book' : loss < 0.6 * k ? 'best' : loss < 2 * k ? 'excellent' : loss < 5 * k ? 'good' : loss < 10 * k ? 'inaccuracy' : loss < 20 * k ? 'mistake' : 'blunder';
    const mB = mateFor(o.before, c), mA = mateFor(o.after, c);
    if (mA < 0 && mB >= 0 && wpB >= 10) cls = 'blunder';                                  // walking into a mate
    else if (mB > 0 && mB <= 2 && !(mA > 0)) cls = loss >= 20 * k ? 'blunder' : 'miss';   // a short mate was there
    return { cls, loss, wpB, wpA };
  }

  /* why a move went wrong, in a sentence or two. o: { fen (before the move), move (its record: uci, san, to, capture, fen),
     color, them (the bot's name), before (your best line before the move), after (their best line after it) }
     returns { kind: mate | missedMate | hangs | fork | loses | missedWin | generic, text, hint (what to look for next time) } */
  function explain(o) {
    const c = o.color, them = esc(o.them || 'Your opponent'), mB = mateFor(o.before, c), mA = mateFor(o.after, c);
    const best = o.before && o.before.pv && o.before.pv[0], bestSan = o.before && o.before.san && o.before.san[0];
    const reply = o.after && o.after.pv && o.after.pv[0], replySan = o.after && o.after.san && o.after.san[0];
    if (mA < 0 && mB >= 0 && replySan) return { kind: 'mate', hint: 'Before you move, look at every check they could give.',
      text: mA === -1 ? 'It lets ' + them + ' checkmate you: ' + b(replySan) + '.' : 'It lets ' + them + ' force checkmate in ' + -mA + ', starting with ' + b(replySan) + '.' };
    if (mB > 0 && !(mA > 0) && bestSan) return { kind: 'missedMate', hint: 'There’s a checkmate here. Try every check!',
      text: mB === 1 ? b(bestSan) + ' was checkmate!' : 'You had a forced checkmate in ' + mB + ', starting with ' + b(bestSan) + '.' };
    if (reply) {
      const lost = -lineGain(o.move.fen, o.after.pv, c);
      if (lost >= 2) { const t = lossText(o, reply, replySan, lost); if (t) return t; }
    }
    if (best && best !== o.move.uci) {
      const gBest = lineGain(o.fen, o.before.pv, c), gMine = lineGain(o.fen, [o.move.uci].concat(o.after && o.after.pv || []), c);
      if (gBest - gMine >= 2) { const t = missText(o, best, bestSan); if (t) return t; }
    }
    const wpB = winPct(cpFor(o.before, c)), wpA = winPct(cpFor(o.after, c));
    const lead = wpB >= 60 && wpA < 50 ? 'This gives away your advantage. ' : wpB >= 35 && wpA < 20 ? 'Now you’re in real trouble. ' : '';
    return { kind: 'generic', hint: 'Have another look – there’s a better move.', text: lead + (bestSan ? 'Best was ' + b(bestSan) + '.' : '') };
  }
  function lossText(o, reply, replySan, lost) {
    const c = side(o.color), pos = new Chess.Position(o.move.fen), m = findMove(pos, reply);
    if (m == null) return null;
    const to = Chess.mTo(m), from = Chess.mFrom(m), victim = pos.board[to] & 7, attacker = pos.board[from] & 7;
    if ((Chess.mFlags(m) & CAPTURE) && victim && VAL[victim] >= Math.min(3, lost)) {
      const v = NAME[victim], at = sq(to), moved = at === o.move.to, guarded = pos.attacked(to, c);
      const hint = moved ? 'Before you move a piece, check that it’s safe on its new square.' : 'Check that your other pieces are still protected after you move.';
      const was = new Chess.Position(o.fen), took = moved && o.move.capture ? was.board[to] & 7 : 0;
      let text;
      if (took && VAL[took] < VAL[victim]) text = b(replySan) + ' takes back – your ' + v + ' for ' + A_PIECE[took] + ' isn’t a good trade.';
      else if (moved && !guarded) text = 'Your ' + v + ' on ' + at + ' isn’t protected there – ' + b(replySan) + ' takes it.';
      else if (moved && VAL[attacker] < VAL[victim]) text = 'Your ' + v + ' on ' + at + ' can be taken by ' + A_PIECE[attacker] + ': ' + b(replySan) + '.';
      else if (!moved && was.board[to] === pos.board[to] && was.attacked(to, c ^ 1)) text = 'Your ' + v + ' on ' + at + ' is still under attack – ' + b(replySan) + ' takes it.';
      else if (!guarded) text = 'It leaves your ' + v + ' on ' + at + ' unprotected – ' + b(replySan) + ' takes it.';
      else text = b(replySan) + ' wins your ' + v + ' on ' + at + '.';
      return { kind: 'hangs', hint, text };
    }
    pos.make(m);
    const ts = forkTargets(pos, to);
    if (ts.length >= 2) return { kind: 'fork', hint: 'Watch out for forks – one piece attacking two of yours.', text: b(replySan) + ' attacks your ' + listNames(ts) + ' at the same time.' };
    return { kind: 'loses', hint: 'Have another look – something gets lost after this move.', text: 'After ' + b(replySan) + ' you lose material.' };
  }
  function missText(o, best, bestSan) {
    const pos = new Chess.Position(o.fen), m = findMove(pos, best); if (m == null) return null;
    const to = Chess.mTo(m), victim = pos.board[to] & 7, hint = 'There’s something to win here. Look at every capture!';
    if ((Chess.mFlags(m) & CAPTURE) && VAL[victim] >= 3) {
      const free = !pos.attacked(to, side(o.color) ^ 1);
      return { kind: 'missedWin', hint, text: (free ? 'The ' + NAME[victim] + ' on ' + sq(to) + ' was free' : 'You could have won the ' + NAME[victim] + ' on ' + sq(to)) + ': ' + b(bestSan) + '.' };
    }
    pos.make(m);
    const ts = forkTargets(pos, to);
    if (ts.length >= 2) return { kind: 'missedWin', hint: 'There’s a fork here. Look for a move that attacks two things!', text: b(bestSan) + ' was a fork – it attacks the ' + listNames(ts) + ' at once.' };
    return { kind: 'missedWin', hint, text: b(bestSan) + ' would have won material.' };
  }

  /* ---------- on your turn ---------- */
  /* the position with the other side to move, for "what would they do if it were their turn?" (null when that can't be set up) */
  function flipFen(fen) {
    const p = fen.split(' '); p[1] = p[1] === 'w' ? 'b' : 'w'; p[3] = '-';
    const f = p.join(' ');
    try { const pos = new Chess.Position(fen); if (pos.inCheck() || new Chess.Position(f).problem()) return null; } catch (e) { return null; }
    return f;
  }
  /* what they threaten. o: { color, them, now (your best line), flipped (flipFen of the position), line (their best line there) } */
  function threat(o) {
    const c = o.color, them = esc(o.them || 'Your opponent'), l = o.line;
    if (!l || !l.pv || !l.pv.length || mateFor(o.now, c) < 0) return null;
    const san = l.san && l.san[0], mate = mateFor(l, c);
    if (mate < 0 && mate >= -2) return { kind: 'mate', text: mate === -1 ? 'Watch out – ' + them + ' threatens checkmate with ' + b(san) + '!' : 'Watch out – ' + them + ' is building a checkmate attack. Look after your king!' };
    if (cpFor(o.now, c) - cpFor(l, c) < 150 || -lineGain(o.flipped, l.pv, c) < 2) return null;
    const pos = new Chess.Position(o.flipped), m = findMove(pos, l.pv[0]); if (m == null) return null;
    const to = Chess.mTo(m), from = Chess.mFrom(m), victim = pos.board[to] & 7;
    if ((Chess.mFlags(m) & CAPTURE) && VAL[victim] >= 3) {
      const a = pos.board[from] & 7, cheap = VAL[a] < VAL[victim] || !pos.attacked(to, side(c));
      return { kind: 'attacked', text: 'Careful – your ' + NAME[victim] + ' on ' + sq(to) + ' is under attack' + (cheap ? ' from the ' + NAME[a] + ' on ' + sq(from) + '.' : '.') };
    }
    pos.make(m);
    const ts = forkTargets(pos, to);
    if (ts.length >= 2) return { kind: 'fork', text: 'Careful – ' + them + ' threatens ' + b(san) + ', attacking your ' + listNames(ts) + ' at once.' };
    return { kind: 'threat', text: 'Careful – ' + them + ' is threatening ' + b(san) + '.' };
  }
  /* something good for you after their move. o: { fen, color, them, now (your best line), prev (your score before their move, or null) } */
  function opportunity(o) {
    const c = o.color, them = esc(o.them || 'Your opponent'), l = o.now;
    if (!l || !l.pv || !l.pv.length) return null;
    const mate = mateFor(l, c);
    if (mate > 0 && mate <= 3) return { kind: 'mate', text: mate === 1 ? 'There’s a checkmate in one here. Can you find it?' : 'You have a forced checkmate in ' + mate + '. Take your time!' };
    const cp = cpFor(l, c);
    if (o.prev == null || cp - o.prev < 150 || winPct(cp) < 55 || lineGain(o.fen, l.pv, c) < 2) return null;
    const pos = new Chess.Position(o.fen), m = findMove(pos, l.pv[0]); if (m == null) return null;
    const to = Chess.mTo(m), victim = pos.board[to] & 7;
    if ((Chess.mFlags(m) & CAPTURE) && VAL[victim] >= 3) {
      if (!pos.attacked(to, side(c) ^ 1)) return { kind: 'win', text: them + ' left the ' + NAME[victim] + ' on ' + sq(to) + ' unprotected. Can you win it?' };
      return { kind: 'win', text: them + ' slipped – look at the ' + NAME[victim] + ' on ' + sq(to) + '.' };
    }
    pos.make(m);
    if (forkTargets(pos, to).length >= 2) return { kind: 'win', text: them + ' slipped – there’s a fork here. Can you find it?' };
    return { kind: 'win', text: them + ' slipped – you can win material. Look at every check and capture!' };
  }

  /* ---------- opening tips (each one once a game) ---------- */
  const HOME = { w: { n: ['b1', 'g1'], b: ['c1', 'f1'], k: 'e1' }, b: { n: ['b8', 'g8'], b: ['c8', 'f8'], k: 'e8' } };
  function minorsAtHome(pos, color) {
    const c = side(color) << 3, at = s => pos.board[Chess.sqParse(s)];
    return HOME[color].n.filter(s => at(s) === (Chess.KNIGHT | c)).length + HOME[color].b.filter(s => at(s) === (Chess.BISHOP | c)).length;
  }
  /* a tip about the move you just played. o: { history (the game's move records, this move last), color, said (tips already given) } */
  function openingTip(o) {
    const c = o.color, said = o.said || new Set(), mine = o.history.filter(r => r.color === c), n = mine.length, mv = mine[n - 1];
    if (!mv || mv !== o.history[o.history.length - 1] || n > 14) return null;
    const pos = new Chess.Position(mv.fen), tip = (id, text) => said.has(id) ? null : { id, text };
    const homeMinors = minorsAtHome(pos, c), castled = mine.some(r => r.castle);
    let t = null;
    if (mv.castle) t = tip('castled', 'Castling keeps your king safe and brings a rook into play.');
    else if (n === 1 && /^[de][45]$/.test(mv.san)) t = tip('center', 'A pawn in the center – great start!');
    else if (mv.piece === 'q' && n <= 5 && !mv.capture && homeMinors >= 3) t = tip('queen', 'Careful with early queen moves – she gets chased around. Knights and bishops first!');
    else if (mv.piece === 'n' && n <= 8 && !mv.capture && /^[ah]/.test(mv.to)) t = tip('rim', 'Knights are stronger in the center than on the edge.');
    else if ((mv.piece === 'n' || mv.piece === 'b') && n <= 7 && !mv.capture && mine.slice(0, -1).some(r => r.to === mv.from) &&
      !new Chess.Position(mv.fenBefore).attacked(Chess.sqParse(mv.from), side(c) ^ 1)) t = tip('twice', 'Try to move each piece once in the opening.');
    if (!t && castled && homeMinors === 0) t = tip('developed', 'Pieces out, king safe – a model opening!');
    return t;
  }
  /* a reminder on your turn: o: { fen, history, color, said } */
  function castleReminder(o) {
    const c = o.color, n = o.history.filter(r => r.color === c).length, said = o.said || new Set();
    if (n < 7 || n > 12 || said.has('castle') || o.history.some(r => r.color === c && r.castle)) return null;
    const pos = new Chess.Position(o.fen), rights = pos.castling & (c === 'w' ? 3 : 12);
    if (!rights || pos.kings[side(c)] !== Chess.sqParse(HOME[c].k)) return null;
    return { id: 'castle', text: 'Your king is still in the middle – think about castling soon.' };
  }

  /* ---------- the coach in a game (browser only) ---------- */
  const FACE = { bg: '#2f6fd6', skin: 1, hair: 0, style: 1, eyes: 2, mouth: 0, acc: 1 };
  /* how she coaches. scale: how forgiving the ratings are (see grade) · help: threat warnings, the bot's slips and tips on your turn
     time: how long she looks at each position (ms). Every level stops the game on a mistake or worse – by that level's ratings. */
  const LEVELS = {
    beginner: { name: 'Beginner', scale: 1.5, help: true, time: 600, blurb: 'Rates your moves for a beginner: small slips are fine, and she stops you before big ones. Lots of warnings and tips.' },
    normal: { name: 'Normal', scale: 1, help: true, time: 700, blurb: 'For when you’ve played a while. Rates moves like Game Review, stops you on mistakes, warns you about threats.' },
    extreme: { name: 'Extreme', scale: 0.5, help: false, time: 1400, blurb: 'For good players. Strict ratings, a deeper look, and no warnings or tips – she only speaks up after your move.' },
  };
  const UNLOCK = 20;   // games to finish before Extreme opens up
  const level = x => x === true ? 'normal' : LEVELS[x] ? x : null;
  /* Extreme is earned: { open, left } (browser only) */
  function extremeOpen() {
    const d = Store.data;
    if (!d.extremeOpen && d.games.filter(g => g.moves >= 10).length >= UNLOCK) { d.extremeOpen = true; Store.save(); }
    return { open: !!d.extremeOpen, left: Math.max(0, UNLOCK - d.games.filter(g => g.moves >= 10).length) };
  }
  const TIME = { threat: 300 };
  const BAD = ['inaccuracy', 'mistake', 'miss', 'blunder'];
  const PRAISE = { best: ['is the best move.', 'is exactly right.', '– the best move!'], excellent: ['is excellent.', 'is a very good move.'], good: ['is a good move.', 'is a solid move.'] };
  let faceSvg = null;

  class Live {
    constructor(ctl, lvl) {
      this.level = level(lvl) || 'normal'; this.L = LEVELS[this.level];
      this.ctl = ctl; this.gen = 0; this.cache = new Map(); this.said = new Set();
      this.msg = ''; this.btns = []; this.tone = null; this.busy = 0;
      this.release = null;   // set while the game is stopped on a mistake
      this.paused = null;    // what that mistake was: { kind, hint, best, bestSan }
      this.offer = null;     // a move she can show you on your turn
      this.prev = null;      // your score after your last move, if they answer well (to spot their slips)
    }
    get eng() { return engine('coach'); }
    fenAt(ply) { const g = this.ctl.game; return ply === 0 ? g.startFen : g.history[ply - 1].fen; }

    /* ---------- what she shows ---------- */
    say(msg, o) { o = o || {}; this.msg = msg; this.btns = o.btns || []; this.tone = o.tone || null; this.render(); }
    render() {
      const el = this.ctl.el; if (!el) return;
      faceSvg = faceSvg || UI.face(FACE);
      const btns = this.btns.map(x => '<button class="btn sm' + (x.primary ? ' primary' : '') + '" data-coach="' + x.k + '">' + x.label + '</button>').join('');
      const gv = UI.$('.gv', el); if (gv) gv.classList.toggle('coach-ask', this.btns.length > 0);
      for (const box of UI.$$('.coach-live', el)) {
        box.innerHTML = '<span class="av">' + faceSvg + '</span><div class="bubble"' + (this.tone ? ' style="border-color:' + this.tone + '"' : '') + '>' +
          '<div class="coach-name">Coach Mira · ' + this.L.name + '</div><div class="coach-msg">' + this.msg + '</div><div class="coach-btns">' + btns + '</div></div>';
        box.classList.toggle('busy', this.busy > 0);
      }
    }
    setBusy(d) { this.busy = Math.max(0, this.busy + d); if (this.ctl.el) for (const box of UI.$$('.coach-live', this.ctl.el)) box.classList.toggle('busy', this.busy > 0); }
    badge(cls) { const C = Analysis.CLS[cls]; return '<span class="cls-dot" style="background:' + C.color + '">' + C.sym + '</span>'; }

    /* ---------- the engine ---------- */
    /* the engine's view of the game after `ply` moves: { best, line } (or null if it was interrupted). Kept for takebacks. */
    analyze(ply) {
      const g = this.ctl.game, key = ply + ' ' + this.fenAt(ply);
      let e = this.cache.get(key);
      if (!e) {
        e = { v: undefined };
        e.p = this.eng.request('think', { fen: g.startFen, moves: g.history.slice(0, ply).map(h => h.uci), time: this.L.time }).then(r => {
          const v = r && r.best && r.lines && r.lines[0] ? { best: r.best, line: r.lines[0] } : null;
          if (v) e.v = v; else if (this.cache.get(key) === e) this.cache.delete(key);
          return v;
        });
        this.cache.set(key, e);
        if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value);
      }
      return e.p;
    }
    async threatAt(ply) {
      const f = flipFen(this.fenAt(ply)); if (!f) return null;
      const r = await this.eng.request('think', { fen: f, moves: [], time: TIME.threat });
      return r && r.lines && r.lines[0] ? { fen: f, line: r.lines[0] } : null;
    }
    /* drop whatever she was working on */
    cancel() {
      this.gen++; this.paused = null; this.offer = null;
      for (const [k, e] of this.cache) if (e.v === undefined) this.cache.delete(k);
      this.eng.stop(); this.setBusy(-this.busy);
    }
    free() { const r = this.release; this.release = null; if (r) { r(); if (this.ctl.el) this.ctl.drawBars(this.ctl.currentFen()); } }

    /* ---------- the game ---------- */
    start() {
      const g = this.ctl.game;
      const hi = { beginner: 'Hi, I’m Mira! Small slips are fine – I’ll stop you before the big ones and warn you about threats.',
        normal: 'Hi, I’m Mira! I’ll check your moves and stop you if something goes wrong.',
        extreme: 'Extreme coaching: strict ratings, and I stop you on any real mistake. No warnings from me – find them yourself.' };
      this.say(g.history.length ? 'Welcome back! ' + this.L.name + ' coaching is on.' : hi[this.level]);
      this.yourTurn();
    }
    stop() { this.cancel(); this.free(); }

    /* your turn: look for their slips and threats while you think. quiet: only get the engine ready (after a takeback) */
    async yourTurn(o) {
      o = o || {};
      const ctl = this.ctl, g = ctl.game, ply = g.history.length, gen = this.gen;
      if (ctl.over || g.turn !== ctl.me) return;
      this.offer = null;
      const live = () => gen === this.gen && g.history.length === ply && !ctl.over;
      let now = null, th = null;
      this.setBusy(1);
      try {
        now = await this.analyze(ply);
        if (!o.quiet && this.L.help && ply >= 2 && live()) th = await this.threatAt(ply);
      } finally { if (gen === this.gen) this.setBusy(-1); }
      if (!live() || !now || o.quiet || !this.L.help) return;
      try {
        const c = ctl.me, them = ctl.bot.name, fen = this.fenAt(ply);
        let x = opportunity({ fen, color: c, them, now: now.line, prev: this.prev });
        if (x) { this.offer = now.best; return this.say(x.text, { btns: [{ k: 'hint', label: 'Show me' }], tone: Analysis.CLS.great.color }); }
        x = th && threat({ color: c, them, now: now.line, flipped: th.fen, line: th.line });
        if (x) { this.offer = now.best; Sound.play('notify'); return this.say(x.text, { btns: [{ k: 'hint', label: 'Show me' }], tone: 'var(--warn)' }); }
        x = g.startFen === Chess.START_FEN && castleReminder({ fen, history: g.history, color: c, said: this.said });
        if (x) { this.said.add(x.id); this.say(x.text); }
      } catch (e) { console.error(e); }
    }

    /* you just moved: judge it while the bot thinks. Returns a promise the bot waits for before it answers. */
    afterUserMove(rec) {
      const ctl = this.ctl, g = ctl.game, ply = g.history.length, gen = this.gen, offered = this.offer;
      this.offer = null;
      if (this.btns.some(x => x.k === 'hint')) this.say(this.msg, { tone: this.tone });   // the "show me" from your turn is out of date now
      return (async () => {
        let before, after;
        this.setBusy(1);
        try { before = await this.analyze(ply - 1); after = await this.analyze(ply); } finally { if (gen === this.gen) this.setBusy(-1); }
        if (gen !== this.gen || !before || !after || g.history.length !== ply || ctl.over) return;
        let stop = false;
        try { stop = this.judge(rec, before, after, offered); } catch (e) { console.error(e); }
        this.prev = cpFor(after.line, ctl.me);
        if (!stop) return;
        Sound.play('notify');
        await new Promise(res => { this.release = res; if (ctl.el) ctl.drawBars(ctl.currentFen()); });
      })();
    }
    /* say what she thinks of your move; true if the game should wait for you */
    judge(rec, before, after, offered) {
      const ctl = this.ctl, g = ctl.game, c = ctl.me, i = g.history.length - 1, sans = g.history.map(h => h.san);
      const standard = g.startFen === Chess.START_FEN;
      if (new Chess.Position(rec.fenBefore).legalMoves().length === 1) { this.say(b(rec.san) + ' was your only move.'); return false; }
      const gr = grade({ color: c, uci: rec.uci, best: before.best, before: before.line, after: after.line, book: standard && i < 24 && Openings.isBook(sans, i), scale: this.L.scale });
      let cls = gr.cls;
      if (!BAD.includes(cls)) {
        let text = this.badge(cls) + b(rec.san) + ' ';
        if (cls === 'book') text += 'is a book move.';
        else { const p = PRAISE[cls]; text = (offered && cls !== 'good' ? '<b>Well spotted!</b> ' : '') + text + p[i % p.length]; }
        const tip = standard && this.L.help && openingTip({ history: g.history, color: c, said: this.said });
        if (tip) { this.said.add(tip.id); text += ' ' + tip.text; }
        this.say(text);
        return false;
      }
      const why = explain({ fen: rec.fenBefore, move: rec, color: c, them: ctl.bot.name, before: before.line, after: after.line });
      if (why.kind === 'missedMate' || why.kind === 'missedWin') cls = 'miss';
      const name = Analysis.CLS[cls].name.toLowerCase(), head = this.badge(cls) + b(rec.san) + (cls === 'miss' ? ' misses a chance. ' : ' is ' + (cls === 'inaccuracy' ? 'an ' : 'a ') + name + '. ');
      const stop = gr.cls === 'mistake' || gr.cls === 'blunder' || why.kind === 'mate' || (why.kind === 'missedMate' && mateFor(before.line, c) <= 2);
      if (!stop) { this.say(head + why.text, { tone: Analysis.CLS[cls].color }); return false; }
      this.paused = { kind: why.kind, hint: why.hint, best: before.best, bestSan: before.line.san && before.line.san[0] };
      this.say(head + why.text, { tone: Analysis.CLS[cls].color, btns: [{ k: 'undo', label: 'Take it back', primary: true }, { k: 'show', label: 'Show me' }, { k: 'play', label: 'Play on' }] });
      return true;
    }
    /* a move was taken back (with her button or the game's own) */
    takenBack() {
      const p = this.paused;
      this.cancel(); this.free(); this.prev = null;
      this.say(p ? 'Your move again. ' + p.hint : 'Move taken back – your turn.');
      this.yourTurn({ quiet: true });
      return p;
    }
    gameOver(st) {
      this.cancel(); this.free();
      const ctl = this.ctl, me = ctl.me, pos = ctl.game.pos, ahead = material(pos, side(me)) >= 3;
      let t;
      if (st.reason === 'checkmate') t = st.winner === me ? '<b>Checkmate!</b> Brilliantly done.' : 'Checkmate… it happens to everyone. Game Review will show you where it turned.';
      else if (st.reason === 'resignation') t = 'No worries – Game Review will show you where it turned.';
      else if (st.reason === 'stalemate') t = ahead ? 'Stalemate – that’s a draw. The king had no moves but wasn’t in check. When you’re winning, always leave the king a square!' : 'Stalemate – a draw!';
      else if (st.reason === 'repetition' && ahead) t = 'A draw by repetition. When you’re ahead, look for a new plan instead of repeating moves.';
      else if (!st.winner) t = 'A draw. Well fought!';
      else t = st.winner === me ? 'You won! Great game.' : 'Good fight! Game Review will show you the key moments.';
      this.say(t);
    }

    /* her buttons */
    press(k) {
      const ctl = this.ctl;
      if (k === 'undo') { ctl.act('takeback'); return; }
      if (k === 'show') {
        const p = this.paused; if (!p) return;
        ctl.act('takeback');
        ctl.hintMove = p.best; ctl.draw(false);
        this.say('The best move here is ' + b(p.bestSan || p.best) + '.');
        return;
      }
      if (k === 'play') { this.paused = null; this.say(this.msg, { tone: this.tone }); this.free(); return; }
      if (k === 'hint') { if (this.offer && ctl.myTurn()) { ctl.hintMove = this.offer; ctl.draw(false); } this.offer = null; this.say(this.msg, { tone: this.tone }); }
    }
  }

  /* ---------- move ratings during an online game (when both players chose them) ---------- */
  /* every position gets a quick look in the background; every move then gets Game Review's verdict, and each side an accuracy */
  class Rater {
    constructor(ctl) { this.ctl = ctl; this.evals = []; this.busy = false; this.off = false; }
    get eng() { return engine('rater'); }
    fenAt(i) { const g = this.ctl.game; return i === 0 ? g.startFen : g.history[i - 1].fen; }
    /* look at the next position not looked at yet (call after any change to the game) */
    update() {
      if (this.busy || this.off) return;
      const g = this.ctl.game, n = g.history.length;
      let i = 0; while (i <= n && this.evals[i] && this.evals[i].fen === this.fenAt(i)) i++;
      this.evals.length = i;   // anything after a takeback is out of date
      if (i > n) return;
      const fen = this.fenAt(i), pos = new Chess.Position(fen);
      if (!pos.hasLegalMove()) { this.evals[i] = { fen, best: null, line: { score: pos.inCheck() ? (pos.turn === Chess.WHITE ? -31000 : 31000) : 0, mate: 0 } }; return this.done(); }
      this.busy = true;
      this.eng.request('think', { fen: g.startFen, moves: g.history.slice(0, i).map(h => h.uci), time: 350 }).then(r => {
        this.busy = false;
        if (!r || this.off) return;   // interrupted: the next update starts again
        if (i <= this.ctl.game.history.length && this.fenAt(i) === fen) this.evals[i] = { fen, best: r.best, line: r.lines[0] || { score: 0, mate: 0 } };
        this.done();
      });
    }
    done() { this.ctl.drawRatings(); this.update(); }
    /* move number `ply` (from 1): { cls, acc } – or null while it's still being looked at */
    move(ply) {
      const g = this.ctl.game, e0 = this.evals[ply - 1], e1 = this.evals[ply], rec = g.history[ply - 1];
      if (!e0 || !e1 || !rec) return null;
      const book = g.startFen === Chess.START_FEN && ply <= 24 && Openings.isBook(g.history.slice(0, ply).map(h => h.san), ply - 1);
      const gr = grade({ color: rec.color, uci: rec.uci, best: e0.best, before: e0.line, after: e1.line, book });
      return { cls: gr.cls, acc: Rating.moveAccuracy(gr.loss) };
    }
    /* each side's accuracy so far, worked out like Game Review's (null before their first rated move) */
    accuracy() {
      const xs = { w: [], b: [] }, h = this.ctl.game.history;
      for (let p = 1; p <= h.length; p++) { const m = this.move(p); if (m) xs[h[p - 1].color].push(m.acc); }
      return { w: Rating.accuracy(xs.w), b: Rating.accuracy(xs.b) };
    }
    stop() { this.off = true; this.eng.stop(); }
  }

  return { Live, Rater, FACE, LEVELS, UNLOCK, level, extremeOpen, grade, explain, threat, opportunity, openingTip, castleReminder, flipFen, lineGain, forkTargets, cpFor, mateFor, winPct };
});
