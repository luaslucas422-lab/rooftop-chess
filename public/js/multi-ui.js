/* Rooftop Chess – Experimental: 3- and 4-player chess on this device (the rules are in multi.js).
   Play against bots, or pass the phone around: every seat is either a person or a bot. */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet, confirmBox } = UI;
  const icon = Play.icon;
  const M = Multi;
  const LEVELS = [['easy', 'Easy', 1.4], ['normal', 'Normal', 0.35], ['hard', 'Hard', 0.08]];
  const RULES = '<p>Everyone plays at once on a cross-shaped board: <b style="color:' + M.COLORS[0] + '">Red</b>, then <b style="color:' + M.COLORS[1] + '">Blue</b>, <b style="color:' + M.COLORS[2] + '">Yellow</b> and <b style="color:' + M.COLORS[3] + '">Green</b> take turns, going round the table.</p>' +
    '<p>Pieces move just like in chess. Pawns march toward the far side and <b>become queens when they reach the middle of the board</b>. There’s no castling or en passant.</p>' +
    '<p>You can’t leave your king attacked by anyone. If it’s your turn and you have no legal move (checkmate or stalemate), you’re out – and if two players gang up on a king before its turn comes round, it can be taken, which also knocks that player out. Pieces of players who are out leave the board.</p>' +
    '<p><b>The last king standing wins.</b> In 3-player chess Green’s side of the board stays empty.</p>';

  /* ---------- setting up ---------- */
  function screenSetup(el) {
    const pref = Object.assign({ players: 4, who: 'bots', level: 'normal' }, Store.data.lastMulti);
    const draw = () => {
      el.innerHTML = '<div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>Experimental</h2></div><div class="page" style="padding-top:4px">' +
        '<p class="muted small" style="margin-top:0">New ways to play, still being tried out. These games aren’t rated and aren’t saved to your history.</p>' +
        '<div class="mode-cards">' + [[4, '4-player chess', 'Four armies on a cross-shaped board. Last king standing wins.'], [3, '3-player chess', 'Three armies on the same board – one side stays empty.']].map(([n, t, d]) =>
          '<button class="mode-card' + (pref.players === n ? ' on' : '') + '" data-n="' + n + '"><span class="mini-cross">' + miniCross(n) + '</span><b>' + t + '</b><small>' + d + '</small></button>').join('') + '</div>' +
        '<div class="tc-label">Who’s playing</div><div class="seg">' + [['bots', 'Me vs bots'], ['people', 'Pass & play']].map(([k, n]) => '<button data-who="' + k + '" class="' + (pref.who === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
        '<p class="small muted" style="margin:8px 2px 0">' + (pref.who === 'bots' ? 'You play Red, at the bottom; bots play the rest.' : 'Everyone shares this device – pass it round. Red starts.') + '</p>' +
        (pref.who === 'bots' ? '<div class="tc-label">Bots</div><div class="seg">' + LEVELS.map(([k, n]) => '<button data-lv="' + k + '" class="' + (pref.level === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' : '') +
        '<button class="btn primary big" style="margin-top:16px" data-a="start">Start ' + pref.players + '-player chess</button>' +
        '<button class="btn ghost block" style="margin-top:8px" data-a="rules">How it works</button></div>';
    };
    el.addEventListener('click', e => {
      const n = e.target.closest('[data-n]'); if (n) { pref.players = +n.dataset.n; return draw(); }
      const w = e.target.closest('[data-who]'); if (w) { pref.who = w.dataset.who; return draw(); }
      const l = e.target.closest('[data-lv]'); if (l) { pref.level = l.dataset.lv; return draw(); }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'back') return App.back();
      if (a.dataset.a === 'rules') return sheet('<h3>3- and 4-player chess</h3>' + RULES);
      if (a.dataset.a === 'start') { Store.data.lastMulti = pref; Store.save(); App.go('multi', Object.assign({}, pref)); }
    });
    draw();
  }
  /* a little picture of the board with the armies' colors */
  function miniCross(n) {
    let s = '<svg viewBox="0 0 14 14">';
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      if (!M.ok(x, y)) continue;
      const o = y >= 12 ? 0 : x <= 1 ? 1 : y <= 1 ? 2 : x >= 12 ? 3 : -1;
      const fill = o >= 0 && (o < 3 || n === 4) ? M.COLORS[o] : (x + y) % 2 ? 'var(--dark)' : 'var(--light)';
      s += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + fill + '"/>';
    }
    return s + '</svg>';
  }

  /* ---------- the game ---------- */
  const tints = {};
  /* the classic pieces in an army's color */
  function pieceUrl(o, t) {
    const k = o + t;
    if (!tints[k]) tints[k] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>*{fill:' + M.COLORS[o] +
      ';stroke:#1b1714;stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}.d{stroke:#1b1714;stroke-width:2.4}.e{fill:#1b1714;stroke:none}</style><g>' + PIECES.SHAPES[t] + '</g></svg>');
    return tints[k];
  }
  function screenGame(el, params) {
    const players = params.players === 3 ? 3 : 4, people = params.who === 'people';
    const noise = (LEVELS.find(l => l[0] === params.level) || LEVELS[1])[2];
    const human = o => people || o === 0;
    const name = o => people ? M.NAMES[o] : o === 0 ? (Store.data.profile.name || 'You') : M.NAMES[o] + ' bot';
    let st = M.setup(players), sel = null, dests = [], timer = null, gone = false, watching = false;

    el.innerHTML = '<div class="multi"><div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>' + players + '-player chess</h2><button class="iconbtn" data-a="menu" aria-label="Menu">' + icon('menu') + '</button></div>' +
      '<div class="mseats"></div><div class="mboard-wrap"><div class="mboard"></div></div><div class="mstatus"></div></div>';
    const boardEl = $('.mboard', el);
    let cells = '';
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) cells += M.ok(x, y) ? '<div class="mc ' + ((x + y) % 2 ? 'dk' : 'lt') + '" data-s="' + M.sq(x, y) + '"></div>' : '<div class="mc off"></div>';
    boardEl.innerHTML = cells;
    const cellEl = s => boardEl.children[s];

    function draw() {
      const checked = M.alive(st).map(o => M.inCheck(st, o) ? M.kingOf(st, o) : -1);
      for (let s = 0; s < 196; s++) {
        const c = cellEl(s); if (c.classList.contains('off')) continue;
        const p = st.board[s];
        c.style.backgroundImage = p ? 'url("' + pieceUrl(p.o, p.t) + '")' : '';
        c.classList.toggle('sel', s === sel);
        c.classList.toggle('dest', dests.includes(s)); c.classList.toggle('cap', dests.includes(s) && !!p);
        c.classList.toggle('last', !!st.last && (s === st.last.from || s === st.last.to));
        c.classList.toggle('chk', checked.includes(s));
      }
      $('.mseats', el).innerHTML = [0, 1, 2, 3].filter(o => o < 3 || players === 4).map(o => {
        const out = st.out.find(x => x.o === o), turn = !st.over && st.turn === o;
        return '<div class="seat' + (turn ? ' turn' : '') + (out ? ' out' : '') + '" style="--c:' + M.COLORS[o] + '"><i></i><span class="grow ellipsis">' + esc(name(o)) + '</span><b>' + M.points(st, o) + '</b>' +
          (out ? '<small>' + esc(out.reason) + '</small>' : turn ? '<small>' + (human(o) ? 'to move' : 'thinking…') + '</small>' : '') + '</div>';
      }).join('');
      let msg;
      if (st.over) msg = st.over.winner != null ? '<b style="color:' + M.COLORS[st.over.winner] + '">' + esc(name(st.over.winner)) + '</b> wins – the last king standing!' : 'A draw: ' + esc(st.over.reason) + '.';
      else if (!people && !st.active[0]) msg = 'You’re out. ' + (watching ? 'Watching the bots finish…' : '');
      else if (human(st.turn)) msg = (people ? '<b style="color:' + M.COLORS[st.turn] + '">' + M.NAMES[st.turn] + '</b> to move' : 'Your move') + (M.inCheck(st, st.turn) ? ' – <span class="bad">your king is attacked!</span>' : '');
      else msg = '<span class="muted">' + esc(name(st.turn)) + ' is thinking…</span>';
      const btns = st.over || (!people && !st.active[0]) ? '<button class="btn sm primary" data-a="again">New game</button>' + (!st.over && !watching ? '<button class="btn sm" data-a="watch">Watch them finish</button>' : '') : '';
      $('.mstatus', el).innerHTML = '<span>' + msg + '</span>' + btns;
    }
    const outBefore = () => st.out.length;
    function afterMove(n0, captured) {
      Sound.play(captured ? 'capture' : 'move');
      if (st.out.length > n0) { const o = st.out[st.out.length - 1]; Sound.play('notify'); toast(name(o.o) + (o.o === 0 && !people ? ' – that’s you – ' : ' ') + 'is out (' + o.reason + ')'); }
      sel = null; dests = []; draw(); next();
    }
    function next() {
      clearTimeout(timer);
      if (gone || st.over) return;
      if (!people && !st.active[0] && !watching) return;   // you're out: wait until you choose to watch
      if (human(st.turn)) return;
      timer = setTimeout(() => {
        if (gone || st.over) return;
        const m = M.botMove(st, { noise }); if (!m) return;
        const n0 = outBefore(), cap = !!st.board[m.to];
        M.play(st, m); afterMove(n0, cap);
      }, watching ? 250 : 550);
    }
    boardEl.addEventListener('click', e => {
      const c = e.target.closest('[data-s]'); if (!c || st.over || !human(st.turn) || !st.active[st.turn]) return;
      const s = +c.dataset.s, p = st.board[s];
      if (sel != null && dests.includes(s)) { const n0 = outBefore(), cap = !!p; M.play(st, { from: sel, to: s }); return afterMove(n0, cap); }
      if (p && p.o === st.turn) { sel = s; dests = M.legal(st, st.turn).filter(m => m.from === s).map(m => m.to); if (!dests.length) toast('That piece can’t move'); }
      else { sel = null; dests = []; }
      draw();
    });
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      const k = a.dataset.a;
      if (k === 'back') { if (!st.over && st.plies > 0 && !(await confirmBox('Leave this game?', 'It isn’t saved.', 'Leave', 'Keep playing'))) return; return App.back(); }
      if (k === 'again') { clearTimeout(timer); st = M.setup(players); sel = null; dests = []; watching = false; Sound.play('start'); draw(); return next(); }
      if (k === 'watch') { watching = true; draw(); return next(); }
      if (k === 'menu') {
        const s = sheet('<h3>' + players + '-player chess</h3><button class="menu-item" data-m="rules">' + icon('review') + 'How it works</button><button class="menu-item" data-m="again">' + icon('plus') + 'New game</button><button class="menu-item" data-m="home">' + icon('back') + 'Back to Experimental</button>');
        s.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (!b) return; s.close();
          if (b.dataset.m === 'rules') sheet('<h3>How it works</h3>' + RULES);
          if (b.dataset.m === 'again') { clearTimeout(timer); st = M.setup(players); sel = null; dests = []; watching = false; draw(); next(); }
          if (b.dataset.m === 'home') App.go('experimental', {}, true); });
      }
    });
    Sound.play('start'); draw(); next();
    root.Multi.current = { get state() { return st; } };   // for tests
    return () => { gone = true; clearTimeout(timer); };
  }

  root.MultiUI = { screenSetup, screenGame };
})(typeof self !== 'undefined' ? self : this);
