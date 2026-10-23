/* Rooftop Chess – the game screen, shared by every kind of game: bots, pass & play, online, and watching.
   A GameCtl holds the game itself; the screen can come and go (an online game keeps running while you look elsewhere). */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet, confirmBox, fmtClock } = UI;
  const ICON = {
    back: 'M15.5 4l1.5 1.5L10.5 12l6.5 6.5-1.5 1.5-8-8z',
    menu: 'M5 10.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
    hint: 'M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zm-3 17h6v2.2H9z',
    undo: 'M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 20.5 16l2.3-.8A10.5 10.5 0 0 0 12.5 8z',
    flip: 'M7 3l-4 4.5h3V16h2V7.5h3zm10 18l4-4.5h-3V8h-2v8.5h-3z',
    prev: 'M15.4 7.4L14 6l-6 6 6 6 1.4-1.4L10.8 12z', next: 'M8.6 16.6L10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
    first: 'M6 6h2v12H6zm11.4 1.4L16 6l-6 6 6 6 1.4-1.4L12.8 12z', last: 'M16 6h2v12h-2zM6.6 16.6L8 18l6-6-6-6-1.4 1.4 4.6 4.6z',
    flag: 'M5 3h2v18H5zm3 1h11l-2.5 4L19 12H8z', chat: 'M4 4h16v12H8.5L4 20.5z',
    half: 'M6.4 4.2h1.9V11H6.4V6.2L5 6.9V5zM16 4l1.6.9-9.7 15.3-1.6-.9zM15.5 13c1.7 0 2.9 1 2.9 2.4 0 1.1-.6 1.8-1.6 2.7l-.9.8h2.6V20h-5.3v-1.4l2.5-2.4c.6-.6.8-1 .8-1.4 0-.5-.4-.9-1-.9s-1.1.4-1.2 1l-1.5-.4c.3-1.4 1.3-2.5 2.7-2.5z',
    review: 'M10 3a7 7 0 0 1 5.6 11.2l5.6 5.6-1.4 1.4-5.6-5.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z', copy: 'M8 8h11v13H8zM5 3h11v3H7v11H5z', x: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
    share: 'M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7l-6.7 3.4a3 3 0 1 0 0 3.2L15 17a3 3 0 1 0 3-1z',
    chart: 'M4 19h16v2H4zM6 10h3v7H6zm5-5h3v12h-3zm5 8h3v4h-3z', eye: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z',
    gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm9 4.5v-2l-2.4-.6-.7-1.7 1.3-2.1-1.4-1.4-2.1 1.3-1.7-.7L13.4 3h-2.8l-.6 2.4-1.7.7-2.1-1.3-1.4 1.4 1.3 2.1-.7 1.7L3 11v2l2.4.6.7 1.7-1.3 2.1 1.4 1.4 2.1-1.3 1.7.7.6 2.4h2.8l.6-2.4 1.7-.7 2.1 1.3 1.4-1.4-1.3-2.1.7-1.7z',
    robot: 'M11 2h2v3h4a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h4zM9 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-6 5v1.5h6V15zM1 10h2v5H1zm20 0h2v5h-2z',
    friend: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7.5 0a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 13c-4 0-7 2-7 4.5V20h14v-2.5C16 15 13 13 9 13zm7.5 0c-.6 0-1.1 0-1.6.1 1.3 1 2.1 2.3 2.1 3.9V20h5v-2.5c0-2.4-2.5-4.5-5.5-4.5z',
    globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.8a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.1 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.9 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.2a16.5 16.5 0 0 0 0 4zm.8 2h2.8c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zm2.8-8H5.1a8 8 0 0 1 4.2-3.6C8.7 5.5 8.2 6.7 7.9 8zM12 20c-.8-1.1-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.9-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.4 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.8a8 8 0 0 1-4.2 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.2a8 8 0 0 1 0 4z',
    pass: 'M7 14l-5 5 5 5v-3.5h8V17H7zM17 0l-5 5 5 5V6.5h8V3h-8z',
  };
  const icon = n => '<svg viewBox="0 0 24 24"><path d="' + ICON[n] + '"/></svg>';
  const REASON = { checkmate: 'by checkmate', stalemate: 'by stalemate', 'insufficient material': 'by insufficient material', repetition: 'by repetition', '50-move rule': 'by the 50-move rule',
    resignation: 'by resignation', timeout: 'on time', 'timeout vs insufficient material': 'timeout vs insufficient material', agreement: 'by agreement', aborted: 'Game aborted', abandoned: 'by abandonment' };
  const START = { P: 8, N: 2, B: 2, R: 2, Q: 1 }, VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9 };

  /* what each side has taken, and who's ahead */
  function material(fen) {
    const n = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
    for (const ch of fen.split(' ')[0]) { if (!/[pnbrqPNBRQ]/.test(ch)) continue; n[ch === ch.toUpperCase() ? 'w' : 'b'][ch.toUpperCase()]++; }
    const took = c => { const o = c === 'w' ? 'b' : 'w', out = []; for (const t of ['Q', 'R', 'B', 'N', 'P']) for (let i = 0; i < Math.max(0, START[t] - n[o][t]); i++) out.push(o + t); return out; };
    let s = 0; for (const t in VAL) s += VAL[t] * (n.w[t] - n.b[t]);
    return { w: took('w'), b: took('b'), diff: s };
  }
  function capsHtml(list, plus) {
    let h = '', prev = '';
    for (const c of list) { h += '<i class="' + (prev && prev !== c ? 'gap' : '') + '" style="background-image:url(\'' + PIECES.url(c) + '\')"></i>'; prev = c; }
    if (plus > 0) h += '<em>+' + plus + '</em>';
    return h;
  }
  const otherC = c => c === 'w' ? 'b' : 'w';

  class GameCtl {
    /* opts: { mode, me, players: { w, b }, startFen, moves, tc: { base, inc } | null, bot, id, rated, cat, flipEach } */
    constructor(o) {
      this.mode = o.mode; this.me = o.me || null; this.players = o.players; this.bot = o.bot || null; this.bots = o.bots || null;
      this.game = new Chess.Game(o.startFen || undefined);
      for (const u of o.moves || []) this.game.move(u);
      this.tc = o.tc || null; this.id = o.id || 'local-' + Date.now().toString(36);
      this.rated = !!o.rated; this.cat = o.cat || null;
      this.clock = this.tc ? (o.clock || [this.tc.base, this.tc.base]) : null;
      this.clockAt = performance.now(); this.running = !!o.running;
      this.orientation = this.me || 'w';
      this.flipEach = !!o.flipEach;
      this.view = null;            // ply being looked at (null = latest)
      this.over = null; this.ratingChange = null;
      this.thinking = false; this.token = 0;
      this.drawOffer = o.drawOffer || null; this.rematchOffer = null; this.online = o.online || { w: true, b: true };
      this.premove = null; this.hintMove = null; this.assisted = false;
      this.offs = [];
      const st = this.game.status(); if (st.over) this.over = st;
      if (o.over) this.over = o.over;
    }

    get sans() { return this.game.history.map(h => h.san); }
    get ucis() { return this.game.history.map(h => h.uci); }
    myTurn() { return !this.over && (this.mode === 'local' || this.game.turn === this.me); }
    clocksNow() {
      if (!this.clock) return null;
      const c = this.clock.slice();
      if (this.running && !this.over) { const i = this.game.turn === 'w' ? 0 : 1; c[i] = Math.max(0, c[i] - (performance.now() - this.clockAt)); }
      return c;
    }

    /* ---------- screen ---------- */
    mount(el) {
      this.el = el;
      const evalbar = false;
      el.innerHTML = '<div class="gv' + (evalbar ? ' with-eval' : '') + '">' +
        '<div class="topbar"><button class="iconbtn" data-act="exit" aria-label="Back">' + icon('back') + '</button><h2 class="gv-title"></h2><button class="iconbtn" data-act="menu" aria-label="Menu">' + icon('menu') + '</button></div>' +
        '<div class="gv-main"><div class="gv-wrap">' +
          '<div class="pbar" data-side="top"></div><div class="gv-boardrow" style="position:relative"><div class="board"></div></div><div class="pbar" data-side="bottom"></div>' +
        '</div><div class="gv-status"></div><div class="opening"></div><div class="moves"></div><div class="actions"></div></div>' +
        '<div class="gv-side"><div class="side-head"><h3 class="gv-title"></h3><button class="iconbtn" data-act="menu" aria-label="Menu">' + icon('menu') + '</button></div><div class="gv-status"></div><div class="opening"></div><div class="moves"></div><div class="actions"></div></div>' +
        '</div>';
      const s = Store.data.settings;
      this.board = new Board($('.board', el), { orientation: this.orientation, coords: s.coords, showDests: s.dests, autoQueen: s.autoQueen, animMs: s.anim, premoves: s.premoves && this.mode === 'online',
        onMove: (f, t, p) => this.userMove(f, t, p), onPremove: (f, t, p) => { this.premove = f ? { from: f, to: t, promo: p } : null; },
        premoveDests: sq => this.premoveDests(sq) });
      el.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this.act(b.dataset.act, b); });
      this.timer = setInterval(() => this.tick(), 100);
      this.draw(false);
    }
    unmount() { clearInterval(this.timer); this.el = null; this.board = null; }

    draw(animate) {
      if (!this.el) return;
      const g = this.game, h = g.history, ply = this.view == null ? h.length : this.view;
      const fen = ply === 0 ? g.startFen : h[ply - 1].fen, last = ply ? h[ply - 1] : null;
      const live = ply === h.length;
      let dests = new Map(), movable = null;
      if (live && !this.over && this.mode !== 'watch') {
        if (this.myTurn() && !this.thinking) { for (const m of g.moves()) { if (!dests.has(m.from)) dests.set(m.from, []); dests.get(m.from).push(m.to); } movable = this.mode === 'local' ? g.turn : this.me; }
        else if (this.mode === 'online') movable = this.me;   // premoves
      }
      let check = null;
      if (last ? last.check : g.pos.inCheck() && ply === h.length) { const pos = new Chess.Position(fen); const k = pos.kings[pos.turn]; check = Chess.sqName(k); }
      this.board.set({ fen, lastMove: last ? [last.from, last.to] : null, check, movable, turn: fen.split(' ')[1], dests, animate: animate !== false });
      this.board.setArrows(this.hintMove && live ? [{ from: this.hintMove.slice(0, 2), to: this.hintMove.slice(2, 4), color: 'rgba(90,168,239,.9)' }] : []);
      this.board.setMarks(this.hintMove && live ? { [this.hintMove.slice(0, 2)]: 'hint' } : {});
      this.drawBars(fen); this.drawMoves(); this.drawActions(); this.drawStatus();
      const title = this.title();
      for (const t of $$('.gv-title', this.el)) t.textContent = title;
      const op = Openings.name(this.sans.slice(0, ply));
      for (const o of $$('.opening', this.el)) o.textContent = op;
    }
    title() {
      if (this.mode === 'bot') return 'vs ' + this.bot.name + ' (' + this.bot.rating + ')';
      if (this.mode === 'local') return 'Pass & play' + (this.tc ? ' · ' + this.tcLabel() : '');
      if (this.mode === 'watch') return 'Watching · ' + this.tcLabel();
      if (this.mode === 'battle') return 'Bot battle: ' + this.bots.w.name + ' vs ' + this.bots.b.name;
      return (this.rated ? 'Rated ' : 'Casual ') + (this.cat || '') + ' · ' + this.tcLabel();
    }
    tcLabel() { return this.tc ? this.tc.base / 60000 + ' | ' + this.tc.inc / 1000 : ''; }

    drawBars(fen) {
      const mat = material(fen), top = otherC(this.orientation), bottom = this.orientation;
      for (const [side, c] of [['top', top], ['bottom', bottom]]) {
        const bar = $('.pbar[data-side="' + side + '"]', this.el), p = this.players[c] || { name: c === 'w' ? 'White' : 'Black' };
        const rating = p.rating != null ? ' <span class="rt">(' + p.rating + (p.provisional ? '?' : '') + ')</span>' : '';
        const dot = this.mode === 'online' || this.mode === 'watch' ? '<span class="dot' + (this.online[c] === false ? ' off' : '') + '"></span>' : '';
        const thinking = this.thinking && ((this.mode === 'bot' && c !== this.me) || (this.mode === 'battle' && c === this.game.turn)) ? '<span class="thinking"><i></i><i></i><i></i></span>' : '';
        const diff = c === 'w' ? mat.diff : -mat.diff;
        bar.innerHTML = UI.avatarHtml(p, 36) + '<div class="who"><div class="nm"><span class="ellipsis">' + esc(p.name) + '</span>' + rating + dot + thinking + '</div><div class="caps">' + capsHtml(mat[c], diff) + '</div></div>' +
          (this.clock ? '<div class="clock" data-clock="' + c + '"></div>' : '');
      }
      this.tick(true);
    }
    tick(force) {
      if (!this.el || !this.clock) return;
      const c = this.clocksNow();
      for (const k of ['w', 'b']) {
        const el = $('.clock[data-clock="' + k + '"]', this.el); if (!el) continue;
        const ms = c[k === 'w' ? 0 : 1];
        const t = fmtClock(ms); if (el.textContent !== t) el.textContent = t;
        const on = !this.over && this.game.turn === k && (this.running || this.game.history.length < 2);
        el.classList.toggle('on', on); el.classList.toggle('low', ms < 20000);
      }
      if (this.running && !this.over && (this.mode === 'local')) {
        const i = this.game.turn === 'w' ? 0 : 1;
        if (c[i] <= 0) { this.clock = c; const winner = this.game.timeoutResult(this.game.turn); this.end(this.game.finish(winner, winner ? 'timeout' : 'timeout vs insufficient material')); }
      }
      if (this.mode === 'online' && !this.over && this.game.history.length < 2 && (force || Math.floor(performance.now() / 1000) !== this.lastStatusSec)) { this.lastStatusSec = Math.floor(performance.now() / 1000); this.drawStatus(); }
      // a soft tick when you're low on time
      if (this.mode === 'online' && this.running && !this.over && this.game.turn === this.me) {
        const ms = c[this.me === 'w' ? 0 : 1], s = Math.ceil(ms / 1000);
        if (s <= 10 && s !== this.lastTick) { this.lastTick = s; Sound.play('tick'); }
      }
    }
    drawMoves() {
      const h = this.game.history, cur = this.view == null ? h.length : this.view;
      let s = '';
      const startBlack = new Chess.Position(this.game.startFen).turn === 1, startN = new Chess.Position(this.game.startFen).fullmove;
      h.forEach((r, i) => {
        const idx = i + (startBlack ? 1 : 0);
        if (idx % 2 === 0) s += '<span class="mn">' + (startN + idx / 2) + '.</span>';
        else if (i === 0) s += '<span class="mn">' + startN + '…</span><span></span>';
        s += '<button data-act="goto" data-ply="' + (i + 1) + '" class="' + (cur === i + 1 ? 'cur' : '') + '">' + esc(r.san) + '</button>';
      });
      if (!h.length) s = '<span class="faint small" style="padding:4px 8px">' + (this.mode === 'watch' ? 'Waiting for the first move…' : 'Make your move!') + '</span>';
      for (const m of $$('.moves', this.el)) {
        m.innerHTML = s;
        const c = $('.cur', m); if (c) { if (getComputedStyle(m).display === 'grid') c.scrollIntoView({ block: 'nearest' }); else m.scrollLeft = c.offsetLeft - m.clientWidth / 2; }
        else m.scrollLeft = m.scrollWidth;
      }
    }
    drawActions() {
      const a = [], over = !!this.over, n = this.game.history.length, b = (act, ic, label, extra) => a.push('<button data-act="' + act + '" ' + (extra || '') + '>' + icon(ic) + '<span>' + label + '</span></button>');
      b('menu', 'menu', 'Options');
      if (over) {
        if (this.mode !== 'watch') b('review', 'review', 'Review', 'class="hot"');
        if (this.mode === 'online') b('rematch', 'plus', this.rematchOffer === 'them' ? 'Accept' : this.rematchOffer === 'me' ? 'Sent' : 'Rematch', this.rematchOffer === 'me' ? 'disabled' : this.rematchOffer === 'them' ? 'class="hot"' : '');
        else if (this.mode !== 'watch') b('again', 'plus', this.mode === 'battle' ? 'Again' : 'New game');
      } else if (this.mode === 'bot') {
        b('hint', 'hint', 'Hint', this.myTurn() && !this.thinking ? '' : 'disabled');
        b('takeback', 'undo', 'Takeback', n ? '' : 'disabled');
      } else if (this.mode === 'local') {
        b('takeback', 'undo', 'Undo', n ? '' : 'disabled');
        b('flip', 'flip', 'Flip');
      } else if (this.mode === 'online') {
        if (n < 2) b('abort', 'x', 'Abort');
        else b('draw', 'half', this.drawOffer && this.drawOffer !== this.me ? 'Accept draw' : this.drawOffer === this.me ? 'Offered' : 'Draw', this.drawOffer === this.me ? 'disabled' : this.drawOffer ? 'class="hot"' : '');
        b('resign', 'flag', 'Resign', n < 2 ? 'disabled' : '');
        b('chat', 'chat', 'Chat');
      } else if (this.mode === 'watch' || this.mode === 'battle') b('flip', 'flip', 'Flip');
      b('prev', 'prev', 'Back', (this.view == null ? n : this.view) > 0 ? '' : 'disabled');
      b('next', 'next', 'Forward', this.view != null && this.view < n ? '' : 'disabled');
      for (const el of $$('.actions', this.el)) el.innerHTML = a.join('');
    }
    drawStatus() {
      let s = '';
      if (this.over) s = '<span>' + esc(this.resultTitle()) + ' <span class="muted">· ' + esc(this.reasonText()) + '</span></span>';
      else if (this.mode === 'online' && Net.state !== 'online') s = '<span class="warn">Reconnecting… your clock keeps running</span>';
      else if (this.mode === 'online' && this.drawOffer && this.drawOffer !== this.me) s = '<span>Your opponent offers a draw</span><button class="btn sm primary" data-act="draw">Accept</button><button class="btn sm" data-act="decline">No</button>';
      else if (this.mode === 'online' && this.online[otherC(this.me)] === false) s = '<span class="warn">Your opponent disconnected – they have 90 seconds to come back</span>';
      else if (this.mode === 'online' && this.game.history.length < 2 && this.firstDeadline) { const left = Math.max(0, Math.ceil((this.firstDeadline - performance.now()) / 1000)); s = '<span class="muted">' + (this.game.turn === this.me ? 'Your move' : 'Waiting for their first move') + (left < 25 ? ' · ' + left + 's' : '') + '</span>'; }
      else if (this.mode === 'local') s = '<span class="muted">' + (this.game.turn === 'w' ? 'White' : 'Black') + ' to move</span>';
      else if (this.view != null && this.view < this.game.history.length) s = '<button class="btn sm" data-act="live">Back to the game</button>';
      for (const el of $$('.gv-status', this.el)) el.innerHTML = s;
    }
    resultTitle() {
      const o = this.over; if (!o) return '';
      if (o.reason === 'aborted') return 'Game aborted';
      if (!o.winner) return 'Draw';
      if (this.me && this.mode !== 'local') return o.winner === this.me ? 'You won!' : 'You lost';
      return (o.winner === 'w' ? 'White' : 'Black') + ' wins';
    }
    reasonText() { const r = this.over && this.over.reason; return r === 'aborted' ? 'no rating change' : REASON[r] || r || ''; }

    /* ---------- moves ---------- */
    premoveDests(sq) {
      const pos = new Chess.Position(this.game.fen());
      pos.turn = this.me === 'w' ? 0 : 1; pos.ep = -1;
      const from = Chess.sqParse(sq), out = new Set();
      for (const m of pos.genMoves([])) if ((m & 127) === from) out.add(Chess.sqName((m >> 7) & 127));
      // pawns may also premove a capture onto a square that's empty right now
      const p = pos.board[from];
      if ((p & 7) === Chess.PAWN) { const up = pos.turn === 0 ? 16 : -16; for (const k of [-1, 1]) { const t = from + up + k; if (!(t & 0x88)) out.add(Chess.sqName(t)); } }
      return [...out];
    }
    userMove(from, to, promo) {
      if (this.over || this.view != null && this.view < this.game.history.length) return false;
      if (!this.myTurn() || this.thinking) return false;
      const rec = this.game.move({ from, to, promo: promo || 'q' });
      if (!rec) { Sound.play('illegal'); return false; }
      this.afterMove(rec, true);
      return true;
    }
    afterMove(rec, mine) {
      this.view = null; this.hintMove = null;
      Sound.forMove(rec);
      if (this.clock && this.mode === 'local') {
        const n = this.game.history.length, i = rec.color === 'w' ? 0 : 1, t = performance.now();
        if (this.running) this.clock[i] = Math.max(0, this.clock[i] - (t - this.clockAt)) + this.tc.inc;
        this.clockAt = t; if (n >= 2) this.running = true;
      }
      if (this.mode === 'local' && this.flipEach) { this.orientation = this.game.turn; if (this.board) this.board.setOrientation(this.orientation); }
      if (this.mode === 'online' && mine) Net.send({ t: 'move', id: this.id, uci: rec.uci, ply: this.game.history.length - 1 });
      const st = this.game.status();
      if (st.over && this.mode !== 'online' && this.mode !== 'watch') { this.draw(); this.end(st); return; }
      this.draw();
      if (!st.over && ((this.mode === 'bot' && this.game.turn !== this.me) || this.mode === 'battle')) this.botTurn();
      this.save();
    }

    async botTurn() {
      const token = ++this.token;
      this.thinking = true; this.drawActions(); this.drawBars(this.game.fen());
      const t0 = performance.now();
      const L = (this.mode === 'battle' ? this.bots[this.game.turn] : this.bot).level;
      const res = await engine('bot').request('bot', { fen: this.game.startFen, moves: this.ucis, sans: this.sans, level: L });
      if (token !== this.token || this.over) return;
      // people take a moment to move – the weaker bots don't snap back instantly either
      const want = L.time ? 250 : 450 + Math.random() * 700;
      const wait = Math.max(0, want - (performance.now() - t0));
      await new Promise(r => setTimeout(r, wait));
      if (token !== this.token || this.over) return;
      this.thinking = false;
      const rec = res && res.best && this.game.move(res.best);
      if (!rec) { this.drawActions(); return; }
      this.afterMove(rec, false);
    }

    /* online: a move from the server (ours echoed back, or theirs) */
    serverMove(m) {
      const n = this.game.history.length;
      this.clock = m.clock.slice(); this.clockAt = performance.now(); this.running = m.running; this.drawOffer = m.drawOffer || null;
      if (m.ply === 1) this.firstDeadline = performance.now() + 30000;   // Black now has 30s for their first move
      if (m.ply === n) { this.tick(true); this.drawActions(); this.drawStatus(); return; }   // our own move, confirmed
      if (m.ply !== n + 1) { Net.send({ t: 'sync' }); return; }
      const rec = this.game.move(m.uci);
      if (!rec) { Net.send({ t: 'sync' }); return; }
      this.view = null;
      Sound.forMove(rec);
      this.draw();
      // play the queued premove if it's still legal
      if (this.premove && this.mode === 'online') {
        const p = this.premove; this.premove = null; if (this.board) this.board.clearPremove();
        if (this.game.turn === this.me && this.game.find({ from: p.from, to: p.to, promo: p.promo || 'q' }) != null) setTimeout(() => { if (!this.over) this.userMove(p.from, p.to, p.promo); }, 30);
      }
    }
    syncState(s) {
      // full state from the server: rebuild if our moves differ
      const mine = this.ucis.join(' '), theirs = s.moves.join(' ');
      if (mine !== theirs) { this.game = new Chess.Game(); for (const u of s.moves) this.game.move(u); this.view = null; }
      this.clock = s.clock.slice(); this.clockAt = performance.now(); this.running = s.running; this.drawOffer = s.drawOffer; this.online = s.online || this.online;
      if (s.firstMoveLeft != null) this.firstDeadline = performance.now() + s.firstMoveLeft;
      if (s.over && !this.over) this.serverEnd(Object.assign({ id: s.id }, s.over));
      this.draw(false);
    }
    serverEnd(m) {
      this.clock = m.clock ? m.clock.slice() : this.clock; this.running = false;
      this.game.finish(m.winner, m.reason);
      this.ratingChange = m.ratings || null;
      this.serverPgn = m.pgn;
      this.end({ over: true, winner: m.winner, reason: m.reason, result: m.result });
    }

    end(st) {
      if (this.over && this.ended) return;
      this.over = st; this.ended = true; this.thinking = false; this.token++;
      this.premove = null;
      if (this.board) this.board.clearPremove();
      engine('bot').stop(); engine('hint').stop();
      const won = this.me && st.winner === this.me;
      Sound.play(won ? 'win' : 'end');
      this.record();
      if (this.mode === 'bot') Store.data.current = null;
      if (this.mode === 'bot' && won && !this.assisted) Store.data.beaten[this.bot.id] = true;
      Store.save();
      this.draw();
      if (this.el) setTimeout(() => this.showResult(), 450);
    }
    record() {
      if (this.mode === 'watch' || this.mode === 'battle' || this.recorded) return;
      if (this.over.reason === 'aborted' && this.game.history.length < 2) return;
      this.recorded = true;
      const pl = c => { const p = this.players[c] || {}; return { name: p.name, rating: p.rating, face: p.face, bot: p.isBot ? p.id : undefined }; };
      const delta = this.ratingChange && this.me ? this.ratingChange[this.me].now - this.ratingChange[this.me].old : null;
      const pgn = this.serverPgn || this.game.pgn({ Event: this.title(), White: this.players.w.name, Black: this.players.b.name, Termination: this.over.reason });
      Store.addGame({ id: this.id, at: Date.now(), mode: this.mode, me: this.mode === 'local' ? null : this.me, white: pl('w'), black: pl('b'), result: this.over.result || this.game.status().result,
        winner: this.over.winner || null, reason: this.over.reason, tc: this.tc ? this.tcLabel() : null, cat: this.cat, rated: this.rated, delta, pgn, moves: this.ucis.length });
    }
    showResult() {
      if (!this.el || !this.over) return;
      const o = this.over, rc = this.ratingChange;
      const pl = c => { const p = this.players[c] || {}; const d = rc && rc[c] ? rc[c].now - rc[c].old : null;
        return '<div class="rp' + (o.winner === c ? ' winner' : '') + '">' + UI.avatarHtml(p, 64) + '<div class="nm">' + esc(p.name) + '</div><div class="small muted">' +
          (rc && rc[c] ? rc[c].now + ' <span class="delta ' + (d >= 0 ? 'good' : 'bad') + '">' + (d >= 0 ? '+' : '') + d + '</span>' : p.rating != null ? p.rating : '') + '</div></div>'; };
      let extra = '';
      if (this.mode === 'bot' && o.winner === this.me) extra = '<p class="center good"><b>' + (this.assisted ? 'Nice win! (Win without takebacks or hints to earn the badge.)' : 'You beat ' + esc(this.bot.name) + '! Badge earned.') + '</b></p>';
      const s = sheet('<div class="result-head"><h2>' + esc(this.resultTitle()) + '</h2><div class="muted">' + esc(this.reasonText()) + '</div></div>' +
        '<div class="result-players">' + pl('w') + '<div class="vs">' + esc(o.result && o.result !== '*' ? o.result.replace('1/2-1/2', '½-½') : 'vs') + '</div>' + pl('b') + '</div>' + extra +
        '<div class="col gap">' + (this.game.history.length >= 2 ? '<button class="btn primary big" data-r="review">' + icon('review') + ' Game Review</button>' : '') +
        '<div class="row gap">' + (this.mode === 'online' ? '<button class="btn" data-r="rematch">Rematch</button><button class="btn" data-r="newonline">New ' + esc(this.tcLabel()) + '</button>' :
          '<button class="btn" data-r="again">' + (this.mode === 'bot' ? 'Play again' : 'New game') + '</button><button class="btn" data-r="analysis">Analysis</button>') + '</div></div>');
      s.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (!b) return; s.close(); this.act(b.dataset.r); });
    }

    /* ---------- buttons ---------- */
    async act(a, btn) {
      const g = this.game, n = g.history.length;
      switch (a) {
        case 'exit': return App.go('home');
        case 'goto': this.view = +btn.dataset.ply; if (this.view >= n) this.view = null; return this.draw();
        case 'prev': this.view = Math.max(0, (this.view == null ? n : this.view) - 1); return this.draw();
        case 'next': if (this.view != null) { this.view++; if (this.view >= n) this.view = null; } return this.draw();
        case 'live': this.view = null; return this.draw();
        case 'flip': this.orientation = otherC(this.orientation); this.board.setOrientation(this.orientation); return this.drawBars(this.currentFen());
        case 'menu': return this.menu();
        case 'hint': {
          if (!this.myTurn()) return;
          this.assisted = true;
          toast('Thinking…', 900);
          const r = await engine('hint').request('think', { fen: g.startFen, moves: this.ucis, time: 900 });
          if (r && r.best && g.history.length === n) { this.hintMove = r.best; this.draw(false); }
          return;
        }
        case 'takeback': {
          if (!n) return;
          this.token++; this.thinking = false; engine('bot').stop();
          if (this.mode === 'bot') { this.assisted = true; g.undo(); if (g.turn !== this.me && g.history.length) g.undo(); }
          else g.undo();
          this.over = null; this.ended = false; this.view = null; this.hintMove = null;
          this.draw(); this.save();
          if (this.mode === 'bot' && g.turn !== this.me) this.botTurn();
          return;
        }
        case 'resign': {
          if (this.over) return;
          if (Store.data.settings.confirmResign && !(await confirmBox('Resign this game?', '', 'Resign', 'Keep playing'))) return;
          if (this.mode === 'online') return Net.send({ t: 'resign', id: this.id });
          const loser = this.mode === 'local' ? g.turn : this.me;
          return this.end(g.finish(otherC(loser), 'resignation'));
        }
        case 'abort': if (this.mode === 'online') Net.send({ t: 'abort', id: this.id }); return;
        case 'draw': {
          if (this.mode === 'online') { if (this.drawOffer && this.drawOffer !== this.me) Net.send({ t: 'draw', id: this.id, op: 'accept' }); else { Net.send({ t: 'draw', id: this.id, op: 'offer' }); this.drawOffer = this.me; this.drawActions(); toast('Draw offered'); } return; }
          if (this.mode === 'local') { if (await confirmBox('Agree to a draw?', 'Both players agree to call it a draw.', 'Draw')) this.end(g.finish(null, 'agreement')); return; }
          if (this.mode === 'bot') { if (n < 20) return toast(this.bot.name + ' wants to keep playing'); const r = await engine('hint').request('think', { fen: g.startFen, moves: this.ucis, time: 500 }); const sc = r && r.lines[0] ? r.lines[0].score * (this.me === 'w' ? 1 : -1) : 0;
            if (sc > -60) return toast(this.bot.name + ' declines the draw'); return this.end(g.finish(null, 'agreement')); }
          return;
        }
        case 'decline': Net.send({ t: 'draw', id: this.id, op: 'decline' }); this.drawOffer = null; return this.draw(false);
        case 'chat': {
          const s = sheet('<h3>Say something</h3><div class="row wrap gap4">' + Net.chat.map((c, i) => '<button class="btn sm" data-i="' + i + '">' + esc(c) + '</button>').join('') + '</div>');
          s.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { Net.send({ t: 'chat', id: this.id, i: +b.dataset.i }); s.close(); } });
          return;
        }
        case 'rematch': {
          if (this.rematchOffer === 'them') { Net.send({ t: 'rematch', id: this.id, op: 'offer' }); return; }
          if (Net.send({ t: 'rematch', id: this.id, op: 'offer' })) { this.rematchOffer = 'me'; this.drawActions(); toast('Rematch offered'); }
          return;
        }
        case 'newonline': return App.go('online', { tc: this.tcLabel().replace(' | ', '+'), auto: true });
        case 'again':
          if (this.mode === 'bot') return Play.startBot(this.bot, this.me === 'w' ? 'b' : 'w');
          if (this.mode === 'local') return Play.startLocal({ tc: this.tc, flipEach: this.flipEach });
          if (this.mode === 'battle') return Play.startBattle(this.bots.w, this.bots.b);
          return App.go('home');
        case 'review': return App.go('review', { pgn: this.game.pgn({ White: this.players.w.name, Black: this.players.b.name }), me: this.me, players: this.players, gameId: this.id });
        case 'analysis': return App.go('analysis', { pgn: this.game.pgn(), ply: this.view });
      }
    }
    currentFen() { const h = this.game.history, ply = this.view == null ? h.length : this.view; return ply === 0 ? this.game.startFen : h[ply - 1].fen; }
    menu() {
      const items = [];
      const it = (k, ic, label) => items.push('<button class="menu-item" data-m="' + k + '">' + icon(ic) + label + '</button>');
      if (!this.over && this.mode === 'bot') { it('resign', 'flag', 'Resign'); it('draw', 'half', 'Offer a draw'); }
      if (!this.over && this.mode === 'local') { it('resign', 'flag', (this.game.turn === 'w' ? 'White' : 'Black') + ' resigns'); it('draw', 'half', 'Agree to a draw'); it('autoflip', 'flip', (this.flipEach ? 'Stop' : 'Start') + ' turning the board each move'); }
      if (this.mode !== 'local') it('flip', 'flip', 'Flip board');
      if (this.over && this.game.history.length) it('review', 'review', 'Game Review');
      it('analysis', 'chart', 'Open in Analysis');
      it('pgn', 'copy', 'Copy PGN'); it('fen', 'copy', 'Copy position (FEN)');
      if (navigator.share) it('share', 'share', 'Share game');
      it('settings', 'gear', 'Board & sound settings');
      if (this.mode === 'watch') it('leave', 'x', 'Stop watching');
      else if (this.mode === 'battle') it('home', 'back', 'Leave');
      else if (this.over || this.mode !== 'online') it('home', 'back', 'Back to home');
      const s = sheet('<h3>' + esc(this.title()) + '</h3>' + items.join(''));
      s.addEventListener('click', e => {
        const b = e.target.closest('[data-m]'); if (!b) return; s.close();
        const k = b.dataset.m;
        if (k === 'pgn') return UI.copy(this.game.pgn({ White: this.players.w.name, Black: this.players.b.name }));
        if (k === 'fen') return UI.copy(this.currentFen());
        if (k === 'share') return navigator.share({ title: 'Rooftop Chess game', text: this.game.pgn({ White: this.players.w.name, Black: this.players.b.name }) }).catch(() => {});
        if (k === 'settings') return App.settingsSheet(() => this.applySettings());
        if (k === 'autoflip') { this.flipEach = !this.flipEach; if (this.flipEach) { this.orientation = this.game.turn; this.board.setOrientation(this.orientation); this.draw(false); } return; }
        if (k === 'leave') { Net.send({ t: 'unwatch' }); Play.current = Play.player && Play.player !== this ? Play.player : null; return App.go('watch'); }
        if (k === 'home') return App.go('home');
        this.act(k);
      });
    }
    applySettings() {
      if (!this.board) return;
      const s = Store.data.settings;
      Object.assign(this.board.o, { showDests: s.dests, autoQueen: s.autoQueen, animMs: s.anim, premoves: s.premoves && this.mode === 'online' });
      this.board.setCoords(s.coords); this.draw(false);
    }
    save() {
      if (this.mode !== 'bot' || this.over) return;
      Store.data.current = { mode: 'bot', bot: this.bot.id, me: this.me, startFen: this.game.startFen, moves: this.ucis, assisted: this.assisted, at: Date.now() };
      Store.save();
    }
    showChat(from, text) {
      if (!this.el) return;
      const side = from === this.orientation ? 'bottom' : 'top', bar = $('.pbar[data-side="' + side + '"]', this.el); if (!bar) return;
      const b = document.createElement('div'); b.className = 'chatline'; b.textContent = text;
      const wrap = $('.gv-wrap', this.el); wrap.style.position = 'relative';
      b.style.top = side === 'top' ? '44px' : 'auto'; b.style.bottom = side === 'bottom' ? '44px' : 'auto';
      wrap.appendChild(b); setTimeout(() => b.remove(), 3200);
    }
  }

  /* ---------- starting games ---------- */
  const me = () => ({ name: Store.data.profile.name || 'You', face: Store.data.profile.face });
  const Play = {
    current: null,   // the game on (or behind) the game screen
    player: null,    // our own online game, if any (kept while watching others)
    icon, ICON, GameCtl, material,
    startBot(bot, color, opts) {
      opts = opts || {};
      const mine = color === 'r' || !color ? (Math.random() < 0.5 ? 'w' : 'b') : color;
      engine('bot').stop();   // forget anything a previous game asked for
      const you = Object.assign(me(), { rating: null });
      const ctl = new GameCtl({ mode: 'bot', me: mine, bot, startFen: opts.startFen, moves: opts.moves, players: mine === 'w' ? { w: you, b: bot } : { w: bot, b: you } });
      ctl.assisted = !!opts.assisted;
      this.current = ctl;
      App.go('game');
      if (!opts.moves || !opts.moves.length) Sound.play('start');
      if (ctl.game.turn !== mine && !ctl.over) ctl.botTurn();
      ctl.save();
    },
    startBattle(w, b) {
      const ctl = new GameCtl({ mode: 'battle', bots: { w, b }, players: { w, b } });
      this.current = ctl; App.go('game'); Sound.play('start');
      setTimeout(() => ctl.botTurn(), 600);
    },
    resumeBot() {
      const c = Store.data.current; if (!c) return;
      const bot = BOTS.find(b => b.id === c.bot); if (!bot) { Store.data.current = null; return; }
      this.startBot(bot, c.me, { startFen: c.startFen, moves: c.moves, assisted: c.assisted });
    },
    startLocal(o) {
      o = o || {};
      const ctl = new GameCtl({ mode: 'local', players: { w: { name: 'White', face: 101 }, b: { name: 'Black', face: 202 } }, tc: o.tc || null, flipEach: o.flipEach, startFen: o.startFen });
      this.current = ctl; App.go('game'); Sound.play('start');
    },
    fromServer(s) {
      const tc = (() => { const [b, i] = s.tc.split('+').map(Number); return { base: b * 60000, inc: i * 1000 }; })();
      const ctl = new GameCtl({ mode: s.you ? 'online' : 'watch', me: s.you || 'w', id: s.id, players: { w: s.white, b: s.black }, moves: s.moves, tc, clock: s.clock, running: s.running, rated: s.rated, cat: s.cat, drawOffer: s.drawOffer, online: s.online });
      if (!s.you) ctl.me = null;
      if (s.firstMoveLeft != null) ctl.firstDeadline = performance.now() + s.firstMoveLeft;
      if (s.over) { ctl.over = { over: true, winner: s.over.winner, reason: s.over.reason, result: s.over.result }; ctl.ratingChange = s.over.ratings; ctl.ended = true; }
      return ctl;
    },
    /* the game screen */
    screen(el) {
      const ctl = this.current;
      if (!ctl) { App.go('home'); return; }
      ctl.mount(el);
      return () => ctl.unmount();
    },
  };

  /* online events */
  Net.on('game', s => {
    if (s.you) {
      const cur = Play.player;
      if (cur && cur.id === s.id) { cur.syncState(s); return; }
      const ctl = Play.fromServer(s);
      Play.player = ctl; Play.current = ctl;
      if (!s.over) Sound.play('start');
      App.go('game');
      return;
    }
    if (Play.current && Play.current.mode === 'watch' && Play.current.id === s.id) { Play.current.syncState(s); return; }
    Play.current = Play.fromServer(s); App.go('game');
  });
  const forGame = id => [Play.player, Play.current].find(c => c && c.id === id);
  Net.on('move', m => { const c = forGame(m.id); if (c) c.serverMove(m); });
  Net.on('end', m => { for (const c of new Set([Play.player, Play.current])) if (c && c.id === m.id && !c.ended) c.serverEnd(m); });
  Net.on('offer', m => {
    const c = forGame(m.id); if (!c) return;
    if (m.kind === 'draw') { c.drawOffer = m.from; c.draw(false); if (m.from !== c.me && c.me) Sound.play('notify'); }
    if (m.kind === 'rematch' && m.from !== c.me) { c.rematchOffer = 'them'; c.drawActions(); Sound.play('notify'); toast('Your opponent wants a rematch'); }
  });
  Net.on('declined', m => { const c = forGame(m.id); if (!c) return; if (m.kind === 'draw') { c.drawOffer = null; c.draw(false); if (m.from !== c.me) toast('Draw declined'); } if (m.kind === 'rematch') { c.rematchOffer = null; c.drawActions(); toast('Rematch declined'); } });
  Net.on('presence', m => { const c = forGame(m.id); if (!c) return; c.online[m.color] = m.online; c.draw(false); });
  Net.on('chat', m => { const c = forGame(m.id); if (c) { c.showChat(m.from, Net.chat[m.i] || ''); if (m.from !== c.me) Sound.play('notify'); } });
  Net.on('error', m => toast(m.msg));
  Net.on('nogame', () => {
    const c = Play.player; if (!c || c.over) return;
    // the server no longer knows this game (it restarted): it can't be finished, so call it off
    c.game.finish(null, 'aborted'); c.over = { over: true, winner: null, reason: 'aborted', result: '*' }; c.ended = true;
    c.draw(false); toast('That game was interrupted (the server restarted). No rating change.', 4500);
  });
  // after reconnecting, make sure the server still has our game
  Net.on('welcome', () => { const c = Play.player; if (c && !c.over) Net.raw({ t: 'sync' }); });
  Net.on('state', () => { for (const c of new Set([Play.player, Play.current])) if (c && c.el && (c.mode === 'online')) c.drawStatus(); });

  root.Play = Play;
})(typeof self !== 'undefined' ? self : this);
