/* Rooftop Chess – puzzles: rated puzzles, Puzzle Rush, the daily puzzle and themes */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet } = UI;
  const icon = Play.icon;
  const ALL = (root.PUZZLES || []).map((p, i) => ({ id: i, fen: p[0], line: p[1].split(' '), rating: p[2], themes: p[3] ? p[3].split(',') : [] }));
  const THEMES = [
    ['mateIn1', 'Mate in 1', 'Find the checkmate'], ['mateIn2', 'Mate in 2', 'Two moves to checkmate'], ['mateIn3', 'Mate in 3+', 'Longer mating attacks'],
    ['backRankMate', 'Back-rank mate', 'The king is trapped behind its pawns'], ['fork', 'Forks', 'Attack two things at once'], ['hangingPiece', 'Free pieces', 'Grab what was left undefended'],
    ['sacrifice', 'Sacrifices', 'Give something to get more'], ['combination', 'Combinations', 'A forcing sequence wins'], ['promotion', 'Promotion', 'Make a new queen'], ['endgame', 'Endgames', 'Few pieces left'],
  ];
  const ofTheme = t => ALL.filter(p => t === 'mateIn3' ? p.themes.some(x => /^mateIn[3-9]$/.test(x)) : p.themes.includes(t));
  const dayNumber = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  function daily() { const pool = ALL.filter(p => p.rating >= 1000 && p.rating <= 1900); if (!pool.length) return ALL[0]; return pool[(dayNumber() * 7919) % pool.length]; }

  function pickRated() {
    const P = Store.data.puzzles, r = P.r;
    let pool = ALL.filter(p => !P.seen[p.id]);
    if (pool.length < 5) { P.seen = {}; pool = ALL.slice(); }
    pool.sort((a, b) => Math.abs(a.rating - r) - Math.abs(b.rating - r));
    const near = pool.slice(0, 12);
    return near[Math.floor(Math.random() * near.length)];
  }

  /* one puzzle on a board: plays the opponent's moves, checks yours */
  class Solver {
    constructor(boardEl, o) {
      this.o = o;
      const s = Store.data.settings;
      this.board = new Board(boardEl, { coords: s.coords, showDests: s.dests, autoQueen: s.autoQueen, animMs: s.anim, onMove: (f, t, p) => this.move(f, t, p) });
    }
    load(p) {
      this.p = p; this.game = new Chess.Game(p.fen); this.step = 0; this.failed = false; this.done = false; this.hinted = false; this.token = (this.token || 0) + 1;
      this.solver = this.game.turn === 'w' ? 'b' : 'w';
      this.board.setOrientation(this.solver);
      this.board.setArrows([]); this.board.setMarks({});
      this.board.set({ fen: this.game.fen(), lastMove: null, check: null, movable: null, animate: false });
      const tk = this.token;
      setTimeout(() => { if (tk === this.token) this.opponent(); }, 650);
    }
    show(lastRec, movable) {
      const g = this.game, dests = new Map();
      if (movable) for (const m of g.moves()) { if (!dests.has(m.from)) dests.set(m.from, []); dests.get(m.from).push(m.to); }
      const check = g.inCheck() ? Chess.sqName(g.pos.kings[g.pos.turn]) : null;
      this.board.set({ fen: g.fen(), lastMove: lastRec ? [lastRec.from, lastRec.to] : null, check, movable: movable ? this.solver : null, turn: g.turn, dests });
    }
    opponent() {
      const rec = this.game.move(this.p.line[this.step]); if (!rec) return;
      this.step++; Sound.forMove(rec); this.show(rec, true);
      if (this.o.onTurn) this.o.onTurn(this);
    }
    move(from, to, promo) {
      if (this.done || this.game.turn !== this.solver) return false;
      const want = this.p.line[this.step];
      const rec = this.game.move({ from, to, promo: promo || 'q' }); if (!rec) return false;
      const mate = this.game.status().reason === 'checkmate';
      if (rec.uci === want || mate) {
        this.step++; Sound.forMove(rec); this.show(rec, false);
        this.board.setMarks({ [rec.to]: 'good' });
        if (this.step >= this.p.line.length || mate) { this.done = true; Sound.play('correct'); if (this.o.onSolved) this.o.onSolved(this); return true; }
        if (this.o.onGood) this.o.onGood(this);
        const tk = this.token;
        setTimeout(() => { if (tk === this.token) { this.board.setMarks({}); this.opponent(); } }, 380);
        return true;
      }
      // wrong
      Sound.play('wrong'); this.show(rec, false); this.board.setMarks({ [rec.to]: 'bad' });
      const first = !this.failed; this.failed = true;
      if (this.o.onWrong) this.o.onWrong(this, first);
      if (!this.o.strikeOut) {
        const tk = this.token;
        setTimeout(() => { if (tk !== this.token) return; this.game.undo(); this.board.setMarks({}); const h = this.game.history; this.show(h[h.length - 1], true); }, 700);
      } else this.done = true;
      return true;
    }
    hint() { if (this.done) return; this.hinted = true; this.failed = true; const want = this.p.line[this.step]; this.board.setMarks({ [want.slice(0, 2)]: 'hint' }); }
    solution() {
      if (this.done) return; this.failed = true; this.done = true; this.token++;
      const tk = this.token;
      const playNext = () => {
        if (tk !== this.token || this.step >= this.p.line.length) { if (this.o.onShown) this.o.onShown(this); return; }
        const rec = this.game.move(this.p.line[this.step++]); if (!rec) return;
        Sound.forMove(rec); this.show(rec, false);
        if (rec.color === this.solver) this.board.setArrows([{ from: rec.from, to: rec.to, color: 'rgba(92,196,107,.9)' }]); else this.board.setArrows([]);
        setTimeout(playNext, 650);
      };
      // undo a wrong move still on the board
      while (this.game.history.length > this.step) this.game.undo();
      playNext();
    }
    stop() { this.token++; }
  }

  const themeName = t => (THEMES.find(x => x[0] === t) || [t, t.replace(/mateIn(\d)/, 'Mate in $1')])[1];
  function playLayout(el, title) {
    el.innerHTML = '<div class="gv"><div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>' + esc(title) + '</h2><span class="chip acc pz-rating"></span></div>' +
      '<div class="gv-main"><div class="gv-wrap"><div class="rush-top hidden"></div><div class="gv-boardrow"><div class="board"></div></div></div><div class="pz-status"></div><div class="rush-log hidden"></div><div class="actions"></div></div>' +
      '<div class="gv-side"><div class="side-head"><h3>' + esc(title) + '</h3><span class="chip acc pz-rating"></span></div><div class="pz-status"></div><div class="rush-log hidden"></div><div class="actions"></div></div></div>';
  }
  const setAll = (el, sel, html) => { for (const x of $$(sel, el)) x.innerHTML = html; };

  /* rated / theme / daily puzzles */
  function screenSolve(el, params) {
    const mode = params.mode || 'rated';
    const P = Store.data.puzzles;
    playLayout(el, mode === 'daily' ? 'Daily puzzle' : mode === 'theme' ? themeName(params.theme) : 'Puzzles');
    let queue = mode === 'theme' ? ofTheme(params.theme).sort(() => Math.random() - 0.5) : null, qi = 0, current = null, delta = null;
    const solver = new Solver($('.board', el), {
      onTurn: () => { status('turn'); },
      onGood: () => status('good'),
      onWrong: (s, first) => { if (first && mode === 'rated') rate(0); status('wrong'); },
      onSolved: s => { if (mode === 'rated' && !s.failed) rate(1); if (!s.failed) { P.streak++; P.bestStreak = Math.max(P.bestStreak, P.streak); P.solved++; } else { P.streak = 0; P.failed++; } log(!s.failed); if (mode === 'daily') { Store.data.dailyDone = dayNumber(); } Store.save(); status('solved'); },
      onShown: () => { P.streak = 0; P.failed++; log(false); Store.save(); status('shown'); },
    });
    function rate(score) {
      if (current.rated) return; current.rated = true;
      const before = P.r;
      Object.assign(P, Rating.update(P, { r: current.rating, rd: 80, at: Date.now() }, score));
      delta = Math.round(P.r) - Math.round(before);
      Store.save(); showRating();
    }
    function log(ok) { P.log = P.log || []; P.log.unshift({ id: current.id, ok, at: Date.now(), r: current.rating }); if (P.log.length > 60) P.log.length = 60; }
    function showRating() { setAll(el, '.pz-rating', mode === 'rated' ? Math.round(P.r) + (delta != null ? ' <span class="' + (delta >= 0 ? 'good' : 'bad') + '">' + (delta >= 0 ? '+' : '') + delta + '</span>' : '') : current ? current.rating : ''); }
    function status(kind) {
      const side = solver.solver === 'w' ? 'White' : 'Black';
      let ic = '', tt = '', st = '', cls = '';
      if (kind === 'load') { tt = 'Get ready…'; st = 'Watch your opponent’s move'; }
      if (kind === 'turn') { ic = solver.solver === 'w' ? '♔' : '♚'; tt = 'Your turn'; st = 'Find the best move for ' + side; }
      if (kind === 'good') { cls = 'ok'; ic = '✓'; tt = 'Best move!'; st = 'Keep going…'; }
      if (kind === 'wrong') { cls = 'no'; ic = '✕'; tt = 'That’s not it'; st = mode === 'rated' && delta != null && delta < 0 ? 'Try again, or see the solution' : 'Try again'; }
      if (kind === 'solved') { cls = 'ok'; ic = '✓'; tt = solver.failed ? 'Solved (with help)' : 'Solved!'; st = (current.themes.length ? current.themes.map(themeName).join(' · ') : '') + ' · Rated ' + current.rating; }
      if (kind === 'shown') { cls = 'no'; ic = '!'; tt = 'Solution'; st = current.themes.map(themeName).join(' · ') + ' · Rated ' + current.rating; }
      setAll(el, '.pz-status', '<div class="pz-status ' + cls + '" style="padding:0;min-height:0"><div class="ic">' + ic + '</div><div><div class="tt">' + esc(tt) + '</div><div class="st">' + esc(st) + '</div></div></div>');
      const done = kind === 'solved' || kind === 'shown';
      const acts = '<button data-a="hint" ' + (done ? 'disabled' : '') + '>' + icon('hint') + '<span>Hint</span></button>' +
        '<button data-a="solution" ' + (done ? 'disabled' : '') + '>' + icon('eye') + '<span>Solution</span></button>' +
        '<button data-a="analysis">' + icon('chart') + '<span>Analyze</span></button>' +
        (mode === 'daily' ? '' : '<button data-a="next" class="' + (done ? 'hot' : '') + '">' + icon('next') + '<span>' + (done ? 'Next' : 'Skip') + '</span></button>');
      setAll(el, '.actions', acts);
    }
    function next() {
      delta = null;
      if (mode === 'daily') current = Object.assign({}, daily());
      else if (mode === 'theme') { if (!queue.length) { toast('No puzzles for this theme yet'); return App.go('puzzles'); } current = Object.assign({}, queue[qi++ % queue.length]); }
      else { if (current && !current.rated && !solver.done && solver.step > 1) rate(0); current = Object.assign({}, pickRated()); P.seen[current.id] = 1; Store.save(); }
      status('load'); showRating(); solver.load(current);
    }
    Puzzles.active = solver;   // (for tests and debugging)
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
      const a = b.dataset.a;
      if (a === 'back') return App.go('puzzles');
      if (a === 'hint') { if (mode === 'rated' && !current.rated) rate(0); solver.hint(); }
      if (a === 'solution') { if (mode === 'rated' && !current.rated) rate(0); solver.solution(); }
      if (a === 'next') next();
      if (a === 'analysis') { const g = new Chess.Game(current.fen); for (const u of current.line.slice(0, Math.max(1, solver.step))) g.move(u); App.go('analysis', { pgn: g.pgn(), flip: solver.solver === 'b' }); }
    });
    next();
    return () => solver.stop();
  }

  /* Puzzle Rush: as many as you can in 3 minutes, 3 mistakes and you're out */
  function screenRush(el) {
    playLayout(el, 'Puzzle Rush');
    const R = Store.data.rush;
    let score = 0, strikes = 0, idx = 0, endAt = 0, over = false, current = null, timer = null;
    const log = [], used = new Set();
    for (const x of $$('.rush-top, .rush-log', el)) x.classList.remove('hidden');
    const solver = Puzzles.active = new Solver($('.board', el), {
      strikeOut: true,
      onTurn: () => draw(),
      onSolved: () => { score++; log.push(1); idx++; draw(); setTimeout(next, 350); },
      onWrong: () => { strikes++; log.push(0); idx++; draw(); if (strikes >= 3) finish(); else setTimeout(next, 650); },
    });
    function pick() {
      const target = 450 + idx * 60 + Math.random() * 60;
      const pool = ALL.filter(p => !used.has(p.id)).sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target)).slice(0, 5);
      const p = pool[Math.floor(Math.random() * pool.length)] || ALL[Math.floor(Math.random() * ALL.length)];
      used.add(p.id); return p;
    }
    function next() { if (over) return; current = pick(); solver.load(current); draw(); }
    function draw() {
      const left = Math.max(0, endAt - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      $('.rush-top', el).innerHTML = '<div class="score">' + score + '</div><div class="grow"><div class="tiny muted">BEST ' + R.best + '</div><div class="strikes">' + [0, 1, 2].map(i => '<i class="' + (i < strikes ? 'x' : '') + '">✕</i>').join('') + '</div></div>' +
        '<div class="clock on' + (left < 20000 ? ' low' : '') + '">' + m + ':' + String(s).padStart(2, '0') + '</div>';
      setAll(el, '.rush-log', log.map(x => '<i class="' + (x ? '' : 'x') + '"></i>').join(''));
      if (!over && current) setAll(el, '.pz-status', '<div class="pz-status" style="padding:0;min-height:0"><div class="ic">' + (solver.solver === 'w' ? '♔' : '♚') + '</div><div><div class="tt">' + (solver.solver === 'w' ? 'White' : 'Black') + ' to move</div><div class="st">Puzzle ' + (idx + 1) + ' · Rated ' + current.rating + '</div></div></div>');
      setAll(el, '.actions', '<button data-a="quit">' + icon('flag') + '<span>' + (over ? 'Done' : 'End run') + '</span></button>' + (over ? '<button data-a="again" class="hot">' + icon('plus') + '<span>Try again</span></button>' : ''));
    }
    function finish() {
      if (over) return; over = true; solver.stop(); clearInterval(timer);
      const best = score > R.best; R.best = Math.max(R.best, score); R.runs = (R.runs || 0) + 1; Store.save();
      Sound.play(best ? 'win' : 'end'); draw();
      setAll(el, '.pz-status', '<div class="pz-status ok" style="padding:0;min-height:0"><div class="ic">' + score + '</div><div><div class="tt">' + (best ? 'New best score!' : 'Run over') + '</div><div class="st">You solved ' + score + ' puzzle' + (score === 1 ? '' : 's') + ' · best ' + R.best + '</div></div></div>');
      sheet('<div class="result-head"><h2>' + score + '</h2><div class="muted">' + (best ? 'New personal best!' : 'Best: ' + R.best) + '</div></div><div class="rush-log" style="justify-content:center;margin-bottom:14px">' + log.map(x => '<i class="' + (x ? '' : 'x') + '"></i>').join('') + '</div><button class="btn primary big" data-again>Play again</button>', { center: true })
        .addEventListener('click', e => { if (e.target.closest('[data-again]')) { UI.closeSheet(); App.go('rush', { t: Date.now() }); } });
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      if (b.dataset.a === 'back') return App.go('puzzles');
      if (b.dataset.a === 'quit') { if (over) return App.go('puzzles'); finish(); }
      if (b.dataset.a === 'again') App.go('rush', { t: Date.now() });
    });
    // a short countdown, then 3 minutes
    let n = 3;
    setAll(el, '.pz-status', '<div class="pz-status" style="padding:0;min-height:0"><div class="ic">3</div><div><div class="tt">Get ready</div><div class="st">3 minutes · 3 strikes and you’re out</div></div></div>');
    const cd = setInterval(() => {
      n--;
      if (n > 0) { setAll(el, '.pz-status .ic', String(n)); Sound.play('tick'); return; }
      clearInterval(cd); Sound.play('start');
      endAt = Date.now() + 180000; next();
      timer = setInterval(() => { draw(); if (Date.now() >= endAt) finish(); }, 250);
    }, 800);
    draw();
    return () => { clearInterval(cd); clearInterval(timer); solver.stop(); };
  }

  /* the Puzzles tab */
  function screenHome(el) {
    const P = Store.data.puzzles, R = Store.data.rush, d = daily();
    const dailyDone = Store.data.dailyDone === dayNumber();
    el.innerHTML = '<div class="page"><h1>Puzzles</h1>' +
      '<div class="hero"><div class="row gap"><div class="grow"><div class="small muted">Puzzle rating</div><div style="font-size:34px;font-weight:900">' + Math.round(P.r) + (Rating.provisional(P) ? '<span class="muted" style="font-size:18px">?</span>' : '') + '</div>' +
      '<div class="small muted">' + P.solved + ' solved · streak ' + P.streak + ' · best streak ' + P.bestStreak + '</div></div></div>' +
      '<button class="btn primary big" style="margin-top:14px" data-go="puzzle">Solve puzzles</button></div>' +
      '<div class="tiles" style="margin-top:12px">' +
      '<button class="tile" data-go="rush"><span class="ic" style="background:#e2544b22;color:#ef6b5f">⚡</span><span><b>Puzzle Rush</b><small>3 minutes, 3 strikes · best ' + R.best + '</small></span></button>' +
      '<button class="tile" data-go="daily"><span class="ic" style="background:#f2c14e22;color:#f2c14e">★</span><span><b>Daily puzzle</b><small>' + (dailyDone ? 'Solved today ✓' : 'A new one every day') + '</small></span></button></div>' +
      '<div class="section-title">Themes</div><div class="list">' +
      THEMES.map(([k, n, s]) => { const c = ofTheme(k).length; return c ? '<button class="item" data-pz="' + k + '"><div class="grow"><b>' + esc(n) + '</b><div class="small muted">' + esc(s) + '</div></div><span class="chip">' + c + '</span></button>' : ''; }).join('') + '</div>' +
      (P.log && P.log.length ? '<div class="section-title">Recent</div><div class="rush-log" style="padding:0">' + P.log.slice(0, 40).map(x => '<i class="' + (x.ok ? '' : 'x') + '" title="' + x.r + '"></i>').join('') + '</div>' : '') +
      '<p class="faint small" style="margin-top:18px">' + ALL.length + ' puzzles, each one found by the engine in real games between bots and double-checked so there’s only one winning move.</p></div>';
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-pz]'); if (t) return App.go('puzzle', { mode: 'theme', theme: t.dataset.pz });
      const g = e.target.closest('[data-go]'); if (!g) return;
      if (g.dataset.go === 'daily') return App.go('puzzle', { mode: 'daily' });
      App.go(g.dataset.go);
    });
    void d;
  }

  root.Puzzles = { ALL, THEMES, daily, dayNumber, screenSolve, screenRush, screenHome, Solver, themeName };
})(typeof self !== 'undefined' ? self : this);
