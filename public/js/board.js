/* Rooftop Chess – the board on screen: drag or tap to move, legal move dots, premoves, promotion picker,
   arrows, review badges and smooth piece animation. Knows nothing about the rules: the owner passes in
   the position (FEN) and the legal destinations, and gets onMove(from, to, promo) back. */
(function (root) {
  'use strict';
  const FILES = 'abcdefgh';
  const PROMO = ['q', 'n', 'r', 'b'];

  function parseFen(fen) {
    const map = new Map(), rows = String(fen).split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r] || '') {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const color = ch === ch.toLowerCase() ? 'b' : 'w';
        map.set(FILES[f] + (8 - r), color + ch.toUpperCase());
        f++;
      }
    }
    return map;
  }

  class Board {
    constructor(el, opts) {
      this.el = el;
      this.o = Object.assign({ orientation: 'w', coords: true, showDests: true, animMs: 200, autoQueen: false, premoves: true, shapes: true,
        onMove: null, onPremove: null, onSelect: null, premoveDests: null, onSquare: null }, opts || {});
      this.userShapes = [];   // arrows and circles drawn with the right mouse button: { from, to } (to === from is a circle)
      this.orientation = this.o.orientation;
      this.pieces = new Map();   // square -> element
      this.position = new Map();
      this.dests = new Map();    // from -> [to]
      this.movable = null;       // 'w' | 'b' | 'both' | null
      this.turn = 'w';
      this.lastMove = null; this.check = null; this.selected = null; this.premove = null; this.marks = {};
      el.classList.add('board');
      el.innerHTML = '<div class="b-sq"></div><div class="b-pc"></div><div class="b-badges"></div><svg class="b-arrows" viewBox="0 0 8 8" preserveAspectRatio="none"></svg><div class="b-promo" hidden></div>';
      this.sqLayer = el.children[0]; this.pcLayer = el.children[1]; this.badgeLayer = el.children[2]; this.arrowLayer = el.children[3]; this.promoLayer = el.children[4];
      this.squares = {};
      for (let r = 1; r <= 8; r++) for (let f = 0; f < 8; f++) {
        const name = FILES[f] + r, d = document.createElement('div');
        d.className = 'sq ' + ((f + r) % 2 ? 'l' : 'd');
        d.dataset.sq = name;
        this.squares[name] = d; this.sqLayer.appendChild(d);
      }
      this.layout();
      el.addEventListener('pointerdown', e => this.down(e));
      el.addEventListener('pointermove', e => this.moveDrag(e));
      el.addEventListener('pointerup', e => this.up(e));
      el.addEventListener('pointercancel', () => this.cancelDrag());
      el.addEventListener('contextmenu', e => e.preventDefault());
    }

    xy(sq) { const f = FILES.indexOf(sq[0]), r = +sq[1] - 1; return this.orientation === 'w' ? [f, 7 - r] : [7 - f, r]; }
    sqAt(clientX, clientY) {
      const b = this.el.getBoundingClientRect();
      const x = Math.floor((clientX - b.left) / b.width * 8), y = Math.floor((clientY - b.top) / b.height * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return this.orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
    }
    place(el, sq) { const [x, y] = this.xy(sq); el.style.transform = 'translate(' + x * 100 + '%,' + y * 100 + '%)'; }

    layout() {
      for (const name in this.squares) {
        const d = this.squares[name], [x, y] = this.xy(name);
        d.style.left = x * 12.5 + '%'; d.style.top = y * 12.5 + '%';
        let c = '';
        if (this.o.coords) {
          if (y === 7) c += '<i class="cf">' + name[0] + '</i>';
          if (x === 0) c += '<i class="cr">' + name[1] + '</i>';
        }
        d.innerHTML = c;
      }
      for (const [sq, el] of this.pieces) this.place(el, sq);
      this.drawArrows(); this.drawBadges();
    }
    setOrientation(c) { if (c !== this.orientation) { this.orientation = c; this.layout(); } }
    flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }
    setCoords(on) { this.o.coords = on; this.layout(); }

    /* new position. opts: { fen, lastMove: [from, to], check: square, movable, turn, dests: Map, animate } */
    set(opts) {
      if (opts.fen != null) {
        const placement = String(opts.fen).split(' ')[0];
        if (placement !== this.placement && this.userShapes.length) { this.userShapes = []; this.drawArrows(); }
        this.placement = placement;
        this.setPieces(parseFen(opts.fen), opts.animate !== false);
      }
      if ('lastMove' in opts) this.lastMove = opts.lastMove;
      if ('check' in opts) this.check = opts.check;
      if ('movable' in opts) this.movable = opts.movable;
      if ('turn' in opts) this.turn = opts.turn;
      if ('dests' in opts) this.dests = opts.dests || new Map();
      if (opts.fen != null || 'movable' in opts) this.select(null);
      this.paint();
    }

    setPieces(map, animate) {
      const old = this.pieces, next = new Map(), unused = new Map(old);
      // pieces that stay put
      for (const [sq, code] of map) { const el = old.get(sq); if (el && el.dataset.code === code) { next.set(sq, el); unused.delete(sq); } }
      // pieces that moved: take the nearest free piece of the same kind
      const moves = [];
      for (const [sq, code] of map) {
        if (next.has(sq)) continue;
        let best = null, bd = 99;
        for (const [osq, el] of unused) {
          if (el.dataset.code !== code || map.get(osq) === code) continue;
          const [ax, ay] = this.xy(osq), [bx, by] = this.xy(sq), d = Math.hypot(ax - bx, ay - by);
          if (d < bd) { bd = d; best = osq; }
        }
        if (best) { const el = unused.get(best); unused.delete(best); next.set(sq, el); moves.push([el, sq]); }
        else { const el = this.makePiece(code); next.set(sq, el); this.place(el, sq); if (animate) { el.classList.add('fadein'); setTimeout(() => el.classList.remove('fadein'), 250); } }
      }
      for (const [, el] of unused) { if (animate) { el.classList.add('fadeout'); setTimeout(() => el.remove(), 160); } else el.remove(); }
      for (const [el, sq] of moves) {
        el.classList.remove('dragging');
        el.style.transition = animate && !el.dropped ? 'transform ' + this.o.animMs + 'ms cubic-bezier(.3,.7,.4,1)' : 'none';
        el.dropped = false;
        el.style.zIndex = 3;
        this.place(el, sq);
        setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; }, this.o.animMs + 30);
      }
      this.pieces = next; this.position = map;
    }
    makePiece(code) {
      const el = document.createElement('div');
      el.className = 'pc'; el.dataset.code = code;
      el.style.backgroundImage = 'url("' + root.PIECES.url(code) + '")';
      this.pcLayer.appendChild(el);
      return el;
    }

    paint() {
      for (const name in this.squares) {
        const d = this.squares[name], cl = d.classList;
        cl.toggle('last', !!this.lastMove && (this.lastMove[0] === name || this.lastMove[1] === name));
        cl.toggle('check', this.check === name);
        cl.toggle('sel', this.selected === name);
        cl.toggle('pre', !!this.premove && (this.premove[0] === name || this.premove[1] === name));
        const ds = this.selected ? this.destsFor(this.selected) : null;
        const isDest = !!ds && ds.includes(name);
        cl.toggle('dest', isDest && this.o.showDests);
        cl.toggle('cap', isDest && this.o.showDests && this.position.has(name));
        for (const k of ['good', 'bad', 'hint', 'mark']) cl.toggle(k, this.marks[name] === k);
      }
    }
    setMarks(marks) { this.marks = marks || {}; this.paint(); }

    myColor(code) { return code && (this.movable === 'both' || code[0] === this.movable); }
    isPremove(sq) { const code = this.position.get(sq); return this.o.premoves && this.movable && this.movable !== 'both' && code && code[0] === this.movable && this.turn !== this.movable; }
    destsFor(sq) {
      if (this.isPremove(sq)) return this.o.premoveDests ? this.o.premoveDests(sq) : [];
      return this.dests.get(sq) || [];
    }
    select(sq) { this.selected = sq; this.paint(); if (this.o.onSelect) this.o.onSelect(sq); }

    down(e) {
      if (e.button === 2) {
        this.clearPremove(); this.select(null);
        if (this.o.shapes) { this.shapeFrom = this.sqAt(e.clientX, e.clientY); try { this.el.setPointerCapture(e.pointerId); } catch (x) {} }
        return;
      }
      if (e.button > 0) return;
      if (!this.promoLayer.hidden) return;
      const sq = this.sqAt(e.clientX, e.clientY); if (!sq) return;
      if (this.o.onSquare) { this.o.onSquare(sq); return; }
      if (this.userShapes.length) { this.userShapes = []; this.drawArrows(); }
      const code = this.position.get(sq);
      if (this.selected && this.selected !== sq && this.destsFor(this.selected).includes(sq)) { this.go(this.selected, sq, false); return; }
      if (this.premove && !this.myColor(code)) { this.clearPremove(); }
      if (!this.movable || !this.myColor(code)) { this.select(null); return; }
      if (this.isPremove(sq) && this.premove) this.clearPremove();
      const wasSelected = this.selected === sq;
      this.select(sq);
      const el = this.pieces.get(sq);
      const rect = this.el.getBoundingClientRect();
      this.drag = { sq, el, x0: e.clientX, y0: e.clientY, rect, moved: false, wasSelected, id: e.pointerId };
      try { this.el.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    }
    moveDrag(e) {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.moved = true;
      const size = d.rect.width / 8;
      d.el.classList.add('dragging');
      d.el.style.transition = 'none';
      d.el.style.transform = 'translate(' + (e.clientX - d.rect.left - size / 2) + 'px,' + (e.clientY - d.rect.top - size / 2) + 'px)';
      const over = this.sqAt(e.clientX, e.clientY);
      if (over !== this.hover) { if (this.hover) this.squares[this.hover].classList.remove('hover'); this.hover = over; if (over) this.squares[over].classList.add('hover'); }
    }
    up(e) {
      if (e.button === 2 && this.shapeFrom) {
        const from = this.shapeFrom, to = this.sqAt(e.clientX, e.clientY) || from; this.shapeFrom = null;
        const i = this.userShapes.findIndex(x => x.from === from && x.to === to);
        if (i >= 0) this.userShapes.splice(i, 1); else this.userShapes.push({ from, to });
        this.drawArrows(); return;
      }
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (this.hover) { this.squares[this.hover].classList.remove('hover'); this.hover = null; }
      if (!d.moved) { if (d.wasSelected) this.select(null); return; }
      const to = this.sqAt(e.clientX, e.clientY);
      if (to && to !== d.sq && this.destsFor(d.sq).includes(to)) { d.el.dropped = true; this.go(d.sq, to, true); return; }
      d.el.classList.remove('dragging'); d.el.style.transition = ''; this.place(d.el, d.sq);
    }
    cancelDrag() { const d = this.drag; if (!d) return; this.drag = null; d.el.classList.remove('dragging'); this.place(d.el, d.sq); }

    async go(from, to, dropped) {
      const code = this.position.get(from);
      const premove = this.isPremove(from);
      let promo = null;
      if (code && code[1] === 'P' && (to[1] === '8' || to[1] === '1')) {
        promo = this.o.autoQueen ? 'q' : await this.askPromotion(to, code[0]);
        if (!promo) { const el = this.pieces.get(from); if (el) { el.classList.remove('dragging'); el.style.transition = ''; this.place(el, from); } this.select(null); return; }
      }
      if (premove) {
        this.premove = [from, to, promo];
        const el = this.pieces.get(from); if (el) { el.classList.remove('dragging'); el.style.transition = ''; this.place(el, from); }
        this.select(null);
        if (this.o.onPremove) this.o.onPremove(from, to, promo);
        return;
      }
      this.select(null);
      if (dropped) { const el = this.pieces.get(from); if (el) { el.classList.remove('dragging'); el.style.transition = 'none'; this.place(el, to); } }
      const ok = this.o.onMove ? this.o.onMove(from, to, promo) : false;
      if (ok === false) { const el = this.pieces.get(from); if (el) { el.style.transition = ''; this.place(el, from); } }
    }
    clearPremove() { if (this.premove) { this.premove = null; this.paint(); if (this.o.onPremove) this.o.onPremove(null); } }

    askPromotion(to, color) {
      return new Promise(resolve => {
        const L = this.promoLayer, [x, y] = this.xy(to), down = y === 0;
        L.innerHTML = '';
        PROMO.forEach((p, i) => {
          const b = document.createElement('button');
          b.className = 'promo-pc';
          b.style.left = x * 12.5 + '%'; b.style.top = (down ? i : 7 - i) * 12.5 + '%';
          b.style.backgroundImage = 'url("' + root.PIECES.url(color + p.toUpperCase()) + '")';
          b.setAttribute('aria-label', { q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[p]);
          b.onpointerdown = e => { e.stopPropagation(); done(p); };
          L.appendChild(b);
        });
        const done = p => { L.hidden = true; L.innerHTML = ''; L.onpointerdown = null; resolve(p); };
        L.onpointerdown = e => { if (e.target === L) done(null); };
        L.hidden = false;
      });
    }

    /* arrows: [{ from, to, color }] */
    setArrows(list) { this.arrows = list || []; this.drawArrows(); }
    drawArrows() {
      const list = this.arrows || [];
      let s = '';
      list.forEach((a, i) => {
        const [x1, y1] = this.xy(a.from), [x2, y2] = this.xy(a.to);
        const cx1 = x1 + 0.5, cy1 = y1 + 0.5, cx2 = x2 + 0.5, cy2 = y2 + 0.5;
        const dx = cx2 - cx1, dy = cy2 - cy1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
        const head = 0.42, w = a.width || 0.16, ex = cx2 - ux * head, ey = cy2 - uy * head, sx = cx1 + ux * 0.2, sy = cy1 + uy * 0.2;
        const px = -uy, py = ux, color = a.color || 'rgba(255,170,0,.85)';
        s += '<path d="M' + (sx + px * w / 2) + ' ' + (sy + py * w / 2) + 'L' + (ex + px * w / 2) + ' ' + (ey + py * w / 2) + 'L' + (ex + px * w * 1.6) + ' ' + (ey + py * w * 1.6) +
          'L' + cx2 + ' ' + cy2 + 'L' + (ex - px * w * 1.6) + ' ' + (ey - py * w * 1.6) + 'L' + (ex - px * w / 2) + ' ' + (ey - py * w / 2) + 'L' + (sx - px * w / 2) + ' ' + (sy - py * w / 2) + 'Z" fill="' + color + '" opacity="' + (a.opacity || (i ? 0.6 : 0.9)) + '"/>';
      });
      // the user's own arrows and circles
      for (const u of this.userShapes) {
        if (u.from === u.to) { const [x, y] = this.xy(u.from); s += '<circle cx="' + (x + 0.5) + '" cy="' + (y + 0.5) + '" r="0.44" fill="none" stroke="rgba(235,97,80,.9)" stroke-width="0.08"/>'; continue; }
        const [x1, y1] = this.xy(u.from), [x2, y2] = this.xy(u.to), cx1 = x1 + 0.5, cy1 = y1 + 0.5, cx2 = x2 + 0.5, cy2 = y2 + 0.5;
        const dx = cx2 - cx1, dy = cy2 - cy1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, w = 0.15, ex = cx2 - ux * 0.42, ey = cy2 - uy * 0.42, sx = cx1 + ux * 0.2, sy = cy1 + uy * 0.2, px = -uy, py = ux;
        s += '<path d="M' + (sx + px * w / 2) + ' ' + (sy + py * w / 2) + 'L' + (ex + px * w / 2) + ' ' + (ey + py * w / 2) + 'L' + (ex + px * w * 1.6) + ' ' + (ey + py * w * 1.6) + 'L' + cx2 + ' ' + cy2 +
          'L' + (ex - px * w * 1.6) + ' ' + (ey - py * w * 1.6) + 'L' + (ex - px * w / 2) + ' ' + (ey - py * w / 2) + 'L' + (sx - px * w / 2) + ' ' + (sy - py * w / 2) + 'Z" fill="rgba(235,97,80,.85)"/>';
      }
      this.arrowLayer.innerHTML = s;
    }
    /* small icon in a square's corner (Game Review): { sq, cls, text } */
    setBadge(b) { this.badge = b; this.drawBadges(); }
    drawBadges() {
      const b = this.badge; this.badgeLayer.innerHTML = '';
      if (!b || !b.sq) return;
      const [x, y] = this.xy(b.sq), el = document.createElement('div');
      el.className = 'badge ' + (b.cls || ''); el.innerHTML = b.text || '';
      el.style.left = (x + 1) * 12.5 + '%'; el.style.top = y * 12.5 + '%';
      this.badgeLayer.appendChild(el);
    }
  }
  root.Board = Board;
  root.Board.parseFen = parseFen;
})(typeof self !== 'undefined' ? self : this);
