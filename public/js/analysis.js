/* Rooftop Chess – the analysis board and Game Review */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet } = UI;
  const icon = Play.icon;
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const cpOf = e => e.mate ? (e.mate > 0 ? 10000 - e.mate * 10 : -10000 - e.mate * 10) : Math.max(-10000, Math.min(10000, e.score));
  const evalText = e => e.mate ? (e.mate > 0 ? '' : '-') + 'M' + Math.abs(e.mate) : Math.abs(e.score) >= Engine_MATE_BOUND() ? (e.score > 0 ? '1-0' : '0-1') : (e.score >= 0 ? '+' : '') + (e.score / 100).toFixed(1);
  function Engine_MATE_BOUND() { return 30000; }

  function evalBarHtml() { return '<div class="evalbar"><span class="top"></span><div class="w" style="height:50%"></div><span class="bot"></span></div>'; }
  function setEvalBar(bar, e, orientation) {
    if (!bar) return;
    const pct = e ? winPct(cpOf(e)) : 50, w = bar.querySelector('.w'), flip = orientation === 'b';
    bar.style.transform = flip ? 'rotate(180deg)' : '';
    w.style.height = pct + '%';
    const t = e ? evalText(e).replace('+', '') : '';
    const top = bar.querySelector('.top'), bot = bar.querySelector('.bot');
    top.style.transform = bot.style.transform = flip ? 'rotate(180deg)' : '';
    const whiteAhead = pct >= 50;
    bot.textContent = whiteAhead ? t : ''; top.textContent = whiteAhead ? '' : t;
  }

  /* ---------- the analysis board ---------- */
  function screenAnalysis(el, params) {
    let g;
    try { g = params.pgn ? Chess.Game.fromPgn(params.pgn) : new Chess.Game(params.fen || undefined); } catch (e) { toast(e.message); g = new Chess.Game(); }
    g.forced = null;
    let ply = params.ply != null ? Math.min(params.ply, g.history.length) : g.history.length;
    let orientation = params.flip ? 'b' : 'w', engineOn = Store.data.settings.evalBar !== false, lastInfo = null;
    el.innerHTML = '<div class="gv with-eval"><div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>Analysis</h2><button class="iconbtn" data-a="menu" aria-label="Menu">' + icon('menu') + '</button></div>' +
      '<div class="gv-main"><div class="gv-wrap"><div class="gv-boardrow">' + evalBarHtml() + '<div class="board"></div></div></div>' +
      '<div class="lines"></div><div class="opening"></div><div class="moves"></div><div class="navbtns"></div></div>' +
      '<div class="gv-side"><div class="side-head"><h3>Analysis</h3><button class="iconbtn" data-a="menu" aria-label="Menu">' + icon('menu') + '</button></div><div class="lines"></div><div class="opening"></div><div class="moves"></div><div class="navbtns"></div></div></div>';
    const s = Store.data.settings;
    const board = new Board($('.board', el), { orientation, coords: s.coords, showDests: s.dests, autoQueen: s.autoQueen, animMs: s.anim, onMove: (f, t, p) => move(f, t, p) });
    const eng = engine('analysis');
    const fenAt = i => i === 0 ? g.startFen : g.history[i - 1].fen;
    function move(from, to, promo) {
      // a move from here: follow the game if it's the next move, otherwise start a new line from here
      const next = g.history[ply];
      const pos = new Chess.Game(fenAt(ply));
      const m = pos.find({ from, to, promo: promo || 'q' }); if (m == null) return false;
      const uci = Chess.toUci(m);
      if (next && next.uci === uci) { ply++; Sound.forMove(next); draw(); return true; }
      while (g.history.length > ply) g.undo();
      const rec = g.move(uci); if (!rec) return false;
      ply++; Sound.forMove(rec); draw(); return true;
    }
    function draw() {
      const fen = fenAt(ply), last = ply ? g.history[ply - 1] : null;
      const view = new Chess.Game(fen), dests = new Map();
      if (!view.status().over) for (const m of view.moves()) { if (!dests.has(m.from)) dests.set(m.from, []); dests.get(m.from).push(m.to); }
      board.set({ fen, lastMove: last ? [last.from, last.to] : null, check: view.inCheck() ? Chess.sqName(view.pos.kings[view.pos.turn]) : null, movable: 'both', turn: view.turn, dests });
      board.setArrows([]);
      // moves
      let html = ''; const start = new Chess.Position(g.startFen);
      g.history.forEach((r, i) => { const idx = i + (start.turn ? 1 : 0); if (idx % 2 === 0) html += '<span class="mn">' + (start.fullmove + idx / 2) + '.</span>'; else if (i === 0) html += '<span class="mn">' + start.fullmove + '…</span><span></span>';
        html += '<button data-ply="' + (i + 1) + '" class="' + (ply === i + 1 ? 'cur' : '') + '">' + esc(r.san) + '</button>'; });
      if (!g.history.length) html = '<span class="faint small" style="padding:4px 8px">Move pieces for either side</span>';
      for (const m of $$('.moves', el)) { m.innerHTML = html; const c = $('.cur', m); if (c) { if (getComputedStyle(m).display === 'grid') c.scrollIntoView({ block: 'nearest' }); else m.scrollLeft = c.offsetLeft - m.clientWidth / 2; } }
      for (const o of $$('.opening', el)) o.textContent = Openings.name(g.history.slice(0, ply).map(h => h.san));
      for (const n of $$('.navbtns', el)) n.innerHTML = ['first', 'prev', 'flip', 'next', 'last'].map(k => '<button data-a="' + k + '" aria-label="' + k + '">' + icon(k) + '</button>').join('') +
        '<button data-a="engine" aria-label="Engine" style="' + (engineOn ? 'color:var(--accent)' : '') + '">' + icon('robot') + '</button>';
      const st = view.status();
      if (st.over) { setLines('<div class="line"><b>' + esc(st.result.replace('1/2-1/2', '½-½')) + '</b><span class="pv">' + esc(st.reason) + '</span></div>'); setEvalBar($('.evalbar', el), st.reason === 'checkmate' ? { mate: 0, score: view.turn === 'w' ? -31000 : 31000 } : { score: 0 }, orientation); eng.stop(); return; }
      analyze(fen);
    }
    function setLines(h) { for (const l of $$('.lines', el)) l.innerHTML = h; }
    function analyze() {
      eng.stop(); lastInfo = null;
      if (!engineOn) { setLines('<div class="line faint">Engine off</div>'); setEvalBar($('.evalbar', el), null, orientation); return; }
      setLines('<div class="line faint">Thinking…</div>');
      const at = ply;
      eng.request('think', { fen: g.startFen, moves: g.history.slice(0, ply).map(h => h.uci), time: 6000, multiPV: 3, stream: true }, { onInfo: info => { if (at === ply) show(info); } }).then(r => { if (r && at === ply) show(Object.assign({ final: true }, r)); });
    }
    function show(info) {
      lastInfo = info; const L = info.lines || []; if (!L.length) return;
      setEvalBar($('.evalbar', el), L[0], orientation);
      const pos = new Chess.Position(fenAt(ply)), num = pos.fullmove, black = pos.turn === 1;
      setLines(L.map(l => '<div class="line"><b>' + esc(evalText(l)) + '</b><span class="pv">' + esc(l.san.map((s, i) => { const k = i + (black ? 1 : 0); return (k % 2 === 0 ? (num + k / 2) + '. ' : i === 0 ? num + '… ' : '') + s; }).join(' ')) + '</span></div>').join('') +
        '<div class="tiny faint" style="padding:4px 2px">depth ' + info.depth + (info.final ? '' : ' …') + '</div>');
      const b = L[0].pv[0]; if (b) board.setArrows(L.slice(0, 2).map((l, i) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: i ? 'rgba(90,168,239,.7)' : 'rgba(92,196,107,.9)', opacity: i ? 0.55 : 0.9 })));
    }
    el.addEventListener('click', e => {
      const m = e.target.closest('[data-ply]'); if (m) { ply = +m.dataset.ply; return draw(); }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'back') return history.length > 1 ? history.back() : App.go('home');
      if (a === 'first') ply = 0; if (a === 'last') ply = g.history.length;
      if (a === 'prev') ply = Math.max(0, ply - 1); if (a === 'next') ply = Math.min(g.history.length, ply + 1);
      if (a === 'flip') { orientation = orientation === 'w' ? 'b' : 'w'; board.setOrientation(orientation); if (lastInfo) setEvalBar($('.evalbar', el), lastInfo.lines[0], orientation); return; }
      if (a === 'engine') { engineOn = !engineOn; Store.data.settings.evalBar = engineOn; Store.save(); }
      if (a === 'menu') return menu();
      draw();
    });
    function menu() {
      const s = sheet('<h3>Analysis</h3>' + [['import', 'copy', 'Load PGN or FEN'], ['pgn', 'copy', 'Copy PGN'], ['fen', 'copy', 'Copy position (FEN)'], ['review', 'review', 'Game Review of these moves'], ['play', 'robot', 'Play from here vs a bot'], ['reset', 'undo', 'New board']]
        .map(([k, ic, t]) => '<button class="menu-item" data-k="' + k + '">' + icon(ic) + t + '</button>').join(''));
      s.addEventListener('click', e => {
        const b = e.target.closest('[data-k]'); if (!b) return; s.close();
        const k = b.dataset.k;
        if (k === 'pgn') UI.copy(g.pgn());
        if (k === 'fen') UI.copy(fenAt(ply));
        if (k === 'reset') { g = new Chess.Game(); ply = 0; draw(); }
        if (k === 'review') { if (g.history.length < 2) return toast('Play a few moves first'); App.go('review', { pgn: g.pgn() }); }
        if (k === 'play') App.go('bots', { startFen: fenAt(ply) });
        if (k === 'import') importSheet();
      });
    }
    function importSheet() {
      const s = sheet('<h3>Load a game or position</h3><p class="muted small">Paste a PGN (a whole game) or a FEN (one position).</p><textarea class="field" placeholder="1. e4 e5 2. Nf3 …   or   rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"></textarea><div class="row gap" style="margin-top:12px"><button class="btn primary" data-load>Load</button></div>');
      $('[data-load]', s).onclick = () => {
        const t = $('textarea', s).value.trim(); if (!t) return;
        try {
          if (/^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}(\s|$)/.test(t)) { const p = new Chess.Position(t); const why = p.problem(); if (why) throw new Error(why); g = new Chess.Game(t); }
          else { g = Chess.Game.fromPgn(t); g.forced = null; }
          ply = g.history.length; s.close(); draw();
        } catch (err) { toast(err.message || 'Could not read that'); }
      };
    }
    draw();
    return () => eng.stop();
  }

  /* ---------- Game Review ---------- */
  const CLS = {
    brilliant: { name: 'Brilliant', sym: '!!', color: '#1fb9aa' }, great: { name: 'Great', sym: '!', color: '#4f8fe0' }, best: { name: 'Best', sym: '★', color: '#6ab04c' },
    excellent: { name: 'Excellent', sym: '✓', color: '#8bc34a' }, good: { name: 'Good', sym: '✓', color: '#8a9f86' }, book: { name: 'Book', sym: '≡', color: '#a88865' },
    inaccuracy: { name: 'Inaccuracy', sym: '?!', color: '#e8b23a' }, mistake: { name: 'Mistake', sym: '?', color: '#e58032' }, miss: { name: 'Miss', sym: '✕', color: '#e0605a' }, blunder: { name: 'Blunder', sym: '??', color: '#d23c34' },
  };
  const ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
  const PV = [0, 1, 3, 3, 5, 9, 0];
  /* cheapest enemy piece that can capture on a square (0 if none) */
  function cheapestAttacker(pos, sq, by) {
    const b = pos.board, c = by << 3; let best = 99;
    const up = by === 0 ? -16 : 16;
    for (const k of [-1, 1]) { const s = sq + up + k; if (!(s & 0x88) && b[s] === (1 | c)) return 1; }
    for (const d of Chess.KNIGHT_D) { const s = sq + d; if (!(s & 0x88) && b[s] === (2 | c)) best = Math.min(best, 3); }
    const rays = (D, types) => { for (const d of D) { let s = sq + d; while (!(s & 0x88)) { const p = b[s]; if (p) { if ((p & 8) === c && types.includes(p & 7)) best = Math.min(best, PV[p & 7]); break; } s += d; } } };
    rays(Chess.DIAG_D, [3, 5]); rays(Chess.ORTH_D, [4, 5]);
    for (const d of Chess.KING_D) { const s = sq + d; if (!(s & 0x88) && b[s] === (6 | c)) best = Math.min(best, 50); }
    return best === 99 ? 0 : best;
  }
  function isSacrifice(rec) {
    const pos = new Chess.Position(rec.fenBefore), from = Chess.sqParse(rec.from), to = Chess.sqParse(rec.to);
    const mover = pos.board[from] & 7, victim = rec.ep ? 1 : pos.board[to] & 7, us = pos.turn, them = us ^ 1;
    if (PV[mover] < 3 || mover === 6) return false;
    const m = pos.legalMoves().find(x => Chess.toUci(x) === rec.uci); if (m == null) return false;
    pos.make(m);
    const att = cheapestAttacker(pos, to, them); if (!att) return false;
    const defended = pos.attacked(to, us);
    return PV[mover] - PV[victim] >= 2 && (att < PV[mover] || !defended);
  }
  function classify(g, evals) {
    const h = g.history, sans = h.map(x => x.san), out = [];
    for (let i = 0; i < h.length; i++) {
      const r = h[i], before = evals[i], after = evals[i + 1]; if (!before || !after) break;
      const sign = r.color === 'w' ? 1 : -1;
      const wpB = winPct(sign * cpOf(before)), wpA = winPct(sign * cpOf(after)), loss = Math.max(0, wpB - wpA);
      const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
      let c;
      const best = before.best, isBest = r.uci === best;
      if (Openings.isBook(sans, i) && i < 24) c = 'book';
      else if (isBest || loss < 0.6) c = 'best';
      else if (loss < 2) c = 'excellent'; else if (loss < 5) c = 'good'; else if (loss < 10) c = 'inaccuracy'; else if (loss < 20) c = 'mistake'; else c = 'blunder';
      const prev = out[i - 1];
      if ((c === 'inaccuracy' || c === 'mistake' || c === 'blunder') && prev && (prev.cls === 'mistake' || prev.cls === 'blunder' || prev.cls === 'miss') && wpB >= 60 && wpA < wpB - 10) c = 'miss';
      if (c === 'best' && !Openings.isBook(sans, i)) {
        if (wpB < 97 && wpA >= 45 && isSacrifice(r)) c = 'brilliant';
        else if (before.lines && before.lines[1] && wpB > 15 && wpB < 92) { const second = winPct(sign * cpOf(before.lines[1])); if (wpA - second >= 18) c = 'great'; }
      }
      out.push({ cls: c, loss, acc, wpB, wpA, best, color: r.color });
    }
    return out;
  }
  function summarize(cl) {
    const res = {};
    for (const c of ['w', 'b']) {
      const xs = cl.filter(x => x.color === c).map(x => x.acc);
      if (!xs.length) { res[c] = { acc: 0, counts: {}, rating: 0 }; continue; }
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length, harm = xs.length / xs.reduce((a, b) => a + 1 / Math.max(1, b), 0);
      const acc = (mean + harm) / 2;
      const counts = {}; for (const x of cl) if (x.color === c) counts[x.cls] = (counts[x.cls] || 0) + 1;
      res[c] = { acc, counts, rating: Math.max(100, Math.min(3000, Math.round(3200 * Math.pow(acc / 100, 3.5) / 25) * 25)) };
    }
    return res;
  }
  const cache = new Map();

  function screenReview(el, params) {
    let g;
    try { g = Chess.Game.fromPgn(params.pgn); } catch (e) { toast('Could not read that game'); App.go('home'); return; }
    const final = g.status(); g.forced = null;
    const moves = g.history.map(h => h.uci), me = params.me || 'w';
    const players = params.players || { w: { name: g.headers.White || 'White' }, b: { name: g.headers.Black || 'Black' } };
    let ply = 0, orientation = params.me === 'b' ? 'b' : 'w', cl = null, evals = null, sum = null;
    const key = g.startFen + '|' + moves.join(' ');
    el.innerHTML = '<div class="page" style="padding-top:calc(30px + var(--safeT))"><div class="topbar" style="position:fixed;left:0;right:0;top:0;padding-left:12px"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>Game Review</h2></div>' +
      '<div class="card center" style="margin-top:30px"><div class="spin"></div><h3 style="margin-top:14px">Reviewing your game…</h3><p class="muted small">The engine checks every move</p><div class="progress"><i style="width:0%"></i></div></div></div>';
    const eng = engine('review');
    const done = (ev) => {
      evals = ev; cache.set(key, ev); cl = classify(g, evals); sum = summarize(cl);
      layout();
    };
    if (cache.has(key)) setTimeout(() => done(cache.get(key)), 0);
    else {
      const per = moves.length > 100 ? 160 : moves.length > 60 ? 220 : 300;
      eng.request('review', { fen: g.startFen, moves, time: per, depth: 14 }, { onProgress: p => { const bar = $('.progress i', el); if (bar) bar.style.width = Math.round(p.done / p.total * 100) + '%'; } })
        .then(r => { if (r && r.evals) done(r.evals); });
    }

    let board;
    function layout() {
      const s = Store.data.settings;
      el.innerHTML = '<div class="gv with-eval review"><div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>Game Review</h2><button class="iconbtn" data-a="analysis" aria-label="Analysis">' + icon('chart') + '</button></div>' +
        '<div class="gv-main"><div class="gv-wrap"><div class="pbar" data-side="top"></div><div class="gv-boardrow">' + evalBarHtml() + '<div class="board"></div></div><div class="pbar" data-side="bottom"></div></div>' +
        '<div class="coach"></div><div class="navbtns"></div><div style="width:100%;padding:0 10px"><svg class="graph"></svg></div><div class="sum" style="width:100%;padding:10px"></div></div>' +
        '<div class="gv-side"><div class="side-head"><h3>Game Review</h3><button class="iconbtn" data-a="analysis" aria-label="Analysis">' + icon('chart') + '</button></div><div class="coach"></div><div class="navbtns"></div><div style="padding:0 10px"><svg class="graph"></svg></div><div class="sum" style="padding:10px;overflow-y:auto"></div></div></div>';
      el.querySelector('.gv').style.height = 'auto';
      board = new Board($('.board', el), { orientation, coords: s.coords, showDests: false, animMs: s.anim });
      drawSummary(); draw();
    }
    function drawSummary() {
      const row = c => '<tr><td><span class="cls-dot" style="background:' + CLS[c].color + '">' + CLS[c].sym + '</span>' + CLS[c].name + '</td><td class="n" style="color:' + CLS[c].color + '">' + (sum.w.counts[c] || 0) + '</td><td class="n" style="color:' + CLS[c].color + '">' + (sum.b.counts[c] || 0) + '</td></tr>';
      const h = '<div class="acc-cards"><div class="acc">' + UI.avatarHtml(players.w, 40) + '<div class="small ellipsis">' + esc(players.w.name) + '</div><b>' + sum.w.acc.toFixed(1) + '</b><span class="small muted">accuracy</span></div>' +
        '<div class="acc">' + UI.avatarHtml(players.b, 40) + '<div class="small ellipsis">' + esc(players.b.name) + '</div><b>' + sum.b.acc.toFixed(1) + '</b><span class="small muted">accuracy</span></div></div>' +
        '<table class="cls-table" style="margin-top:10px"><tr><td class="muted small">Game rating (estimate)</td><td class="n">' + sum.w.rating + '</td><td class="n">' + sum.b.rating + '</td></tr>' + ORDER.map(row).join('') + '</table>' +
        '<p class="small muted" style="margin-top:10px">' + esc(Openings.name(g.history.map(x => x.san)) || 'Opening') + ' · ' + esc(final.over ? final.result.replace('1/2-1/2', '½-½') + ' ' + final.reason : 'game in progress') + '</p>';
      for (const x of $$('.sum', el)) x.innerHTML = h;
      drawGraph();
    }
    function drawGraph() {
      const n = evals.length, W = 300, H = 84;
      const pts = evals.map((e, i) => [n > 1 ? i / (n - 1) * W : 0, H - winPct(cpOf(e)) / 100 * H]);
      const d = 'M0 ' + H + ' ' + pts.map(p => 'L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' L' + W + ' ' + H + ' Z';
      const x = n > 1 ? ply / (n - 1) * W : 0;
      let dots = '';
      cl.forEach((c, i) => { if (['blunder', 'mistake', 'miss', 'brilliant', 'great'].includes(c.cls)) { const p = pts[i + 1]; dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.4" fill="' + CLS[c.cls].color + '" stroke="#fff" stroke-width="1"/>'; } });
      const svg = '<rect width="' + W + '" height="' + H + '" fill="#3d3a37"/><path d="' + d + '" fill="#f1f1f1"/><line x1="0" x2="' + W + '" y1="' + H / 2 + '" y2="' + H / 2 + '" stroke="#888" stroke-width=".6" stroke-dasharray="3 3"/>' +
        '<line x1="' + x + '" x2="' + x + '" y1="0" y2="' + H + '" stroke="var(--accent)" stroke-width="2"/>' + dots;
      for (const g2 of $$('.graph', el)) { g2.setAttribute('viewBox', '0 0 ' + W + ' ' + H); g2.setAttribute('preserveAspectRatio', 'none'); g2.innerHTML = svg; }
    }
    function bars(fen) {
      const mat = Play.material(fen);
      for (const [side, c] of [['top', orientation === 'w' ? 'b' : 'w'], ['bottom', orientation]]) {
        const bar = $('.pbar[data-side="' + side + '"]', el), p = players[c] || {};
        const diff = c === 'w' ? mat.diff : -mat.diff;
        bar.innerHTML = UI.avatarHtml(p, 32) + '<div class="who"><div class="nm"><span class="ellipsis">' + esc(p.name || (c === 'w' ? 'White' : 'Black')) + '</span>' + (p.rating != null ? '<span class="rt">(' + p.rating + ')</span>' : '') + '</div><div class="caps">' +
          mat[c].map(x => '<i style="background-image:url(\'' + PIECES.url(x) + '\')"></i>').join('') + (diff > 0 ? '<em>+' + diff + '</em>' : '') + '</div></div><span class="chip">' + sum[c].acc.toFixed(0) + '%</span>';
      }
    }
    function sanOf(fen, uci) { if (!uci) return ''; const t = new Chess.Game(fen); const r = t.move(uci); return r ? r.san : uci; }
    function draw() {
      const fen = ply === 0 ? g.startFen : g.history[ply - 1].fen, last = ply ? g.history[ply - 1] : null, c = ply ? cl[ply - 1] : null;
      const view = new Chess.Game(fen);
      board.set({ fen, lastMove: last ? [last.from, last.to] : null, check: view.inCheck() ? Chess.sqName(view.pos.kings[view.pos.turn]) : null, movable: null });
      board.setBadge(c ? { sq: last.to, cls: '', text: CLS[c.cls].sym } : null);
      const badge = $('.badge', el); if (badge && c) badge.style.background = CLS[c.cls].color;
      board.setMarks({});
      // arrow for the better move when this wasn't the best
      const arrows = [];
      if (c && c.best && c.best !== last.uci && !['best', 'book', 'brilliant', 'great'].includes(c.cls)) arrows.push({ from: c.best.slice(0, 2), to: c.best.slice(2, 4), color: 'rgba(92,196,107,.9)' });
      board.setArrows(arrows);
      setEvalBar($('.evalbar', el), evals[ply], orientation);
      bars(fen);
      // what the coach says
      let msg;
      if (!c) msg = '<b>Let’s look at your game.</b> Tap → to go through it move by move. ' + (sum[me] ? 'Your accuracy was <b>' + sum[me].acc.toFixed(1) + '</b>.' : '');
      else {
        const info = CLS[c.cls], san = esc(last.san), bestSan = esc(sanOf(last.fenBefore, c.best)), e = evals[ply];
        const article = /^[aeiou]/i.test(info.name) ? 'an' : 'a';
        msg = '<span class="cls-dot" style="background:' + info.color + '">' + info.sym + '</span><b>' + san + '</b> ';
        if (c.cls === 'book') msg += 'is a book move.';
        else if (c.cls === 'best') msg += 'is the best move.';
        else if (c.cls === 'brilliant') msg += 'is brilliant! A real sacrifice that works.';
        else if (c.cls === 'great') msg += 'is a great move – the only good one here.';
        else if (c.cls === 'excellent' || c.cls === 'good') msg += 'is ' + c.cls + '. ' + (bestSan ? 'The best was <b>' + bestSan + '</b>.' : '');
        else if (c.cls === 'miss') msg += 'misses a chance to punish their mistake. ' + (bestSan ? '<b>' + bestSan + '</b> was much stronger.' : '');
        else {
          msg += 'is ' + article + ' ' + info.name.toLowerCase() + '. ';
          if (e.mate && Math.sign(e.mate) !== (c.color === 'w' ? 1 : -1)) msg += 'It allows mate in ' + Math.abs(e.mate) + '. ';
          else if (c.wpB > 65 && c.wpA < 55) msg += 'It throws away your advantage. ';
          else if (c.wpB > 40 && c.wpA < 25) msg += 'Now you’re in trouble. ';
          if (bestSan) msg += 'Best was <b>' + bestSan + '</b>.';
        }
        msg += ' <span class="muted">(' + esc(evalText(e)) + ')</span>';
      }
      for (const x of $$('.coach', el)) x.innerHTML = '<span class="av" style="width:38px;height:38px">' + UI.face({ bg: '#2f6fd6', skin: 1, hair: 0, style: 1, eyes: 2, mouth: 0, acc: 1 }) + '</span><div class="bubble">' + msg + '</div>';
      for (const n of $$('.navbtns', el)) n.innerHTML = ['first', 'prev', 'flip', 'next', 'last'].map(k => '<button data-a="' + k + '" aria-label="' + k + '">' + icon(k) + '</button>').join('') +
        (c && c.best && c.best !== last.uci ? '<button data-a="retry" aria-label="Show best">' + icon('hint') + '</button>' : '');
      drawGraph();
    }
    el.addEventListener('click', e => {
      const gr = e.target.closest('.graph');
      if (gr && evals) { const r = gr.getBoundingClientRect(); ply = Math.round((e.clientX - r.left) / r.width * (evals.length - 1)); ply = Math.max(0, Math.min(g.history.length, ply)); return draw(); }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'back') return history.length > 1 ? history.back() : App.go('home');
      if (!cl) return;
      if (a === 'first') ply = 0; if (a === 'last') ply = g.history.length;
      if (a === 'prev') ply = Math.max(0, ply - 1);
      if (a === 'next') { ply = Math.min(g.history.length, ply + 1); if (ply) Sound.forMove(g.history[ply - 1]); }
      if (a === 'flip') { orientation = orientation === 'w' ? 'b' : 'w'; board.setOrientation(orientation); }
      if (a === 'analysis') return App.go('analysis', { pgn: params.pgn, ply, flip: orientation === 'b' });
      if (a === 'retry') { const c = cl[ply - 1]; const line = (evals[ply - 1].lines[0] || {}).san || []; return toast('Best line: ' + line.slice(0, 6).join(' '), 4000); }
      draw();
    });
    return () => eng.stop();
  }

  root.Analysis = { screenAnalysis, screenReview, classify, summarize, winPct, CLS };
})(typeof self !== 'undefined' ? self : this);
