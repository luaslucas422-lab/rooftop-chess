/* Rooftop Chess – Learn: how the pieces move (collect the stars), checkmate drills, and the rules */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet } = UI;
  const icon = Play.icon;
  const FILES = 'abcdefgh';
  const STAR = '<svg viewBox="0 0 24 24"><path fill="#ffc83d" stroke="#b7791f" stroke-width="1.2" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';

  /* each level: the white piece, its square, stars to collect, black pieces to capture */
  const LESSONS = [
    { id: 'rook', name: 'The rook', piece: 'R', text: 'The rook moves in straight lines – up, down, left or right – as far as it likes, but it can’t jump over anything.',
      levels: [{ at: 'a1', stars: ['a6', 'f6'] }, { at: 'd4', stars: ['d8', 'h8', 'h1', 'a1'] }, { at: 'h1', stars: ['h5', 'c5', 'c2', 'f2'], block: ['e5', 'h7'] }] },
    { id: 'bishop', name: 'The bishop', piece: 'B', text: 'The bishop moves diagonally, as far as it likes. It stays on the same color of square all game.',
      levels: [{ at: 'c1', stars: ['h6', 'f8'] }, { at: 'f1', stars: ['b5', 'e8', 'h5', 'e2'] }, { at: 'a1', stars: ['g7', 'c3', 'e1', 'a5'], block: ['d4'] }] },
    { id: 'queen', name: 'The queen', piece: 'Q', text: 'The queen is the strongest piece: she moves like a rook and a bishop together.',
      levels: [{ at: 'd1', stars: ['d7', 'h3', 'a3'] }, { at: 'a8', stars: ['h1', 'h8', 'e5', 'b2', 'g2'] }] },
    { id: 'king', name: 'The king', piece: 'K', text: 'The king moves one square in any direction. He’s slow, but if he’s trapped (checkmated) the game is over!',
      levels: [{ at: 'e1', stars: ['e2', 'f3', 'g3', 'g2'] }, { at: 'a1', stars: ['b2', 'c3', 'd3', 'e4', 'e5'] }] },
    { id: 'knight', name: 'The knight', piece: 'N', text: 'The knight jumps in an L shape: two squares one way, then one square to the side. It’s the only piece that can jump over others.',
      levels: [{ at: 'b1', stars: ['c3', 'd5', 'f6'] }, { at: 'g1', stars: ['f3', 'g5', 'e6', 'c5'] }, { at: 'a1', stars: ['b3', 'd2', 'f1', 'h2'], block: ['b2', 'c2', 'a2'] }] },
    { id: 'pawn', name: 'The pawn', piece: 'P', text: 'Pawns march forward one square (two on their first move) and capture one square diagonally. A pawn that reaches the far side becomes a queen!',
      levels: [{ at: 'e2', stars: ['e4', 'e6'] }, { at: 'd2', stars: [], take: ['c3', 'd4', 'c5', 'b6'] }, { at: 'f5', stars: ['f8'] }] },
  ];
  const DRILLS = [
    { id: 'kq', name: 'Queen checkmate', text: 'King and queen against a lone king. Push the king to the edge, then mate – watch out for stalemate!', fen: '8/8/8/3k4/8/8/8/Q3K3 w - - 0 1', par: 12 },
    { id: 'krr', name: 'Two-rook ladder', text: 'Use the two rooks like a ladder: one cuts off a rank, the other gives check.', fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1', par: 8 },
    { id: 'kr', name: 'Rook checkmate', text: 'King and rook against a lone king. Your king has to help – the rook can’t do it alone.', fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1', par: 20 },
    { id: 'kp', name: 'Promote and win', text: 'Your king is in front of the pawn. Walk it to promotion, then finish with checkmate.', fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1', par: 14 },
    { id: 'kbb', name: 'Two-bishop checkmate', text: 'Hard! The bishops work side by side to sweep the king into a corner.', fen: '8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', par: 25 },
  ];

  /* moves for one piece on a nearly empty board (lessons don't need kings) */
  function destsFor(code, sq, occ) {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1, out = [];
    const at = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8 ? FILES[x] + (y + 1) : null;
    const t = code[1];
    const ray = (dx, dy, far) => { let x = f + dx, y = r + dy; while (at(x, y)) { const s = at(x, y), o = occ.get(s); if (o) { if (o[0] === 'b') out.push(s); break; } out.push(s); if (!far) break; x += dx; y += dy; } };
    if (t === 'R' || t === 'Q') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(dx, dy, true);
    if (t === 'B' || t === 'Q') for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(dx, dy, true);
    if (t === 'K') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(dx, dy, false);
    if (t === 'N') for (const [dx, dy] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) { const s = at(f + dx, r + dy); if (s && (!occ.get(s) || occ.get(s)[0] === 'b')) out.push(s); }
    if (t === 'P') {
      const one = at(f, r + 1); if (one && !occ.get(one)) { out.push(one); const two = at(f, r + 2); if (r === 1 && two && !occ.get(two)) out.push(two); }
      for (const dx of [-1, 1]) { const s = at(f + dx, r + 1); if (s && occ.get(s) && occ.get(s)[0] === 'b') out.push(s); }
    }
    return out;
  }
  const toFen = occ => { let s = ''; for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const c = occ.get(FILES[f] + (r + 1)); if (!c) { e++; continue; } if (e) { s += e; e = 0; } s += c[0] === 'w' ? c[1] : c[1].toLowerCase(); } if (e) s += e; if (r) s += '/'; } return s + ' w - - 0 1'; };

  function screenLesson(el, params) {
    const L = LESSONS.find(x => x.id === params.id) || LESSONS[0];
    let li = 0, occ, pieceSq, stars, moves;
    el.innerHTML = '<div class="gv"><div class="topbar"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>' + esc(L.name) + '</h2><span class="chip acc lv"></span></div>' +
      '<div class="gv-main"><div class="lesson-goal"></div><div class="gv-wrap"><div class="gv-boardrow" style="position:relative"><div class="board"></div><div class="stars" style="position:absolute;inset:0;pointer-events:none"></div></div></div><div class="pz-status"></div></div>' +
      '<div class="gv-side"><div class="side-head"><h3>' + esc(L.name) + '</h3></div><div class="lesson-goal"></div><div class="pz-status"></div></div></div>';
    const board = new Board($('.board', el), { coords: Store.data.settings.coords, animMs: 180, onMove: (from, to) => move(from, to) });
    function load() {
      const lv = L.levels[li];
      occ = new Map(); pieceSq = lv.at; occ.set(lv.at, 'w' + L.piece);
      for (const b of lv.block || []) occ.set(b, 'wP');
      for (const t of lv.take || []) occ.set(t, 'bP');
      stars = new Set(lv.stars); moves = 0;
      for (const x of $$('.lv', el)) x.textContent = (li + 1) + ' / ' + L.levels.length;
      for (const g of $$('.lesson-goal', el)) g.innerHTML = '<span class="av" style="width:40px;height:40px">' + UI.face({ bg: '#2f6fd6', skin: 1, hair: 0, style: 1, eyes: 2, mouth: 0, acc: 1 }) + '</span><div class="small">' + esc(L.text) + (lv.take ? ' <b>Capture the black pawns.</b>' : ' <b>Collect all the stars.</b>') + (lv.block ? ' Your own pawns are in the way.' : '') + '</div>';
      draw();
    }
    function draw() {
      const dests = new Map([[pieceSq, destsFor('w' + occ.get(pieceSq)[1], pieceSq, occ)]]);
      board.set({ fen: toFen(occ), movable: 'w', turn: 'w', dests, lastMove: null });
      const sEl = $('.stars', el); sEl.innerHTML = '';
      for (const s of stars) { const [x, y] = board.xy(s); const d = document.createElement('div'); d.className = 'star'; d.style.left = x * 12.5 + '%'; d.style.top = y * 12.5 + '%'; d.innerHTML = STAR; sEl.appendChild(d); }
      const left = stars.size + [...occ.values()].filter(c => c[0] === 'b').length;
      for (const p of $$('.pz-status', el)) p.innerHTML = '<div class="pz-status" style="padding:0;min-height:0"><div class="ic">' + left + '</div><div class="grow"><div class="tt">' + (left ? left + ' to go' : 'Done!') + '</div><div class="st">Moves: ' + moves + '</div></div>' +
        (moves ? '<button class="btn sm" data-a="retry">Restart</button>' : '') + '</div>';
    }
    function move(from, to) {
      let code = occ.get(from); occ.delete(from);
      const took = occ.get(to) && occ.get(to)[0] === 'b';
      if (code[1] === 'P' && to[1] === '8') code = 'wQ';
      occ.set(to, code); pieceSq = to; moves++;
      const star = stars.delete(to);
      Sound.play(took ? 'capture' : star ? 'correct' : 'move');
      draw();
      const left = stars.size + [...occ.values()].filter(c => c[0] === 'b').length;
      if (!left) setTimeout(levelDone, 350);
      return true;
    }
    function levelDone() {
      Sound.play('win');
      if (li + 1 < L.levels.length) { li++; toast('Level ' + li + ' done!'); load(); return; }
      Store.data.lessons[L.id] = true; Store.save();
      const nextL = LESSONS[LESSONS.indexOf(L) + 1];
      const s = sheet('<div class="result-head"><h2>Lesson complete!</h2><div class="muted">You know how the ' + esc(L.name.replace('The ', '')) + ' moves.</div></div><div class="col gap">' +
        (nextL ? '<button class="btn primary big" data-n>Next: ' + esc(nextL.name) + '</button>' : '<button class="btn primary big" data-d>Try a checkmate drill</button>') + '<button class="btn" data-b>Back to Learn</button></div>', { center: true });
      s.addEventListener('click', e => { if (e.target.closest('[data-n]')) { s.close(); App.go('lesson', { id: nextL.id }); } if (e.target.closest('[data-d]')) { s.close(); App.go('drill', { id: 'kq' }); } if (e.target.closest('[data-b]')) { s.close(); App.go('learn'); } });
    }
    el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'back') App.go('learn'); if (b.dataset.a === 'retry') load(); });
    load();
  }

  /* checkmate drills: you against the full-strength engine from a won position */
  function screenDrill(el, params) {
    const D = DRILLS.find(x => x.id === params.id) || DRILLS[0];
    const ctl = new Play.GameCtl({ mode: 'bot', me: 'w', bot: { id: 'coach', name: 'Defender', rating: 2300, level: { nodes: 200000, time: 3000 }, faceSvg: UI.face({ bg: '#2b2f36', skin: 0, hair: 5, style: 0, eyes: 3, mouth: 1, acc: 0 }) }, startFen: D.fen,
      players: { w: { name: Store.data.profile.name || 'You', face: Store.data.profile.face }, b: { name: 'Defender', faceSvg: UI.face({ bg: '#2b2f36', skin: 0, hair: 5, style: 0, eyes: 3, mouth: 1, acc: 0 }) } } });
    ctl.drill = D;
    ctl.title = () => D.name;
    const end = ctl.end.bind(ctl);
    ctl.record = () => {};
    ctl.save = () => {};
    ctl.end = st => {
      ctl.over = st; ctl.ended = true; ctl.thinking = false; ctl.token++; engine('bot').stop();
      const n = Math.ceil(ctl.game.history.length / 2), ok = st.winner === 'w';
      Sound.play(ok ? 'win' : 'end');
      if (ok) { const best = Store.data.drills[D.id]; if (!best || n < best) Store.data.drills[D.id] = n; Store.save(); }
      ctl.draw();
      const s = sheet('<div class="result-head"><h2>' + (ok ? 'Checkmate!' : st.reason === 'stalemate' ? 'Stalemate…' : 'Not this time') + '</h2><div class="muted">' +
        (ok ? 'Done in ' + n + ' moves' + (n <= D.par ? ' – under par (' + D.par + ')! ★' : ' (par is ' + D.par + ')') : st.reason === 'stalemate' ? 'The king had no moves but wasn’t in check – that’s a draw. Leave it a square!' : 'It ended ' + esc(st.reason) + '.') + '</div></div>' +
        '<div class="col gap"><button class="btn primary big" data-r>Try again</button><button class="btn" data-b>Back to Learn</button></div>', { center: true });
      s.addEventListener('click', e => { if (e.target.closest('[data-r]')) { s.close(); App.go('drill', { id: D.id, t: Date.now() }); } if (e.target.closest('[data-b]')) { s.close(); App.go('learn'); } });
      void end;
    };
    Play.current = ctl;
    ctl.mount(el);
    for (const st of $$('.gv-status', el)) st.innerHTML = '<span class="muted small">' + esc(D.text) + '</span>';
    return () => ctl.unmount();
  }

  const RULES = [
    ['Check and checkmate', 'When a king is attacked it is in <b>check</b>, and its side must get out of check right away – move the king, block, or capture the attacker. If there’s no way out, that’s <b>checkmate</b> and the game is over.'],
    ['Stalemate', 'If the player to move has no legal moves but is <b>not</b> in check, the game is a draw. Careful when you’re winning!'],
    ['Castling', 'Once per game, the king can move two squares toward a rook, and that rook hops over to the king’s other side. Not allowed if the king or rook has moved, if the king is in check, or if it would pass through an attacked square.'],
    ['En passant', 'If a pawn moves two squares and lands right beside an enemy pawn, that enemy pawn may capture it as if it had moved only one square – but only on the very next move.'],
    ['Promotion', 'A pawn reaching the far side becomes a queen, rook, bishop or knight – almost always a queen.'],
    ['Draws', 'Besides stalemate, a game is drawn when the same position appears three times, after 50 moves each with no capture or pawn move, when neither side has enough pieces to checkmate, or when both players agree.'],
    ['Piece values', 'A rough guide: pawn 1, knight 3, bishop 3, rook 5, queen 9. The king is priceless.'],
    ['Opening tips', 'Control the center with pawns and pieces, bring out your knights and bishops early, castle to keep your king safe, and don’t move the same piece over and over.'],
  ];

  function screenLearn(el) {
    el.innerHTML = '<div class="page"><h1>Learn</h1>' +
      '<div class="section-title">How the pieces move</div><div class="tiles">' + LESSONS.map(L => '<button class="tile" data-lesson="' + L.id + '"><span class="ic" style="background:var(--card2)"><img src="' + PIECES.url('w' + L.piece) + '" width="34" height="34" alt=""></span><span><b>' + esc(L.name) + '</b><small>' + (Store.data.lessons[L.id] ? '<span class="good">Completed ✓</span>' : L.levels.length + ' levels') + '</small></span></button>').join('') + '</div>' +
      '<div class="section-title">Checkmate drills</div><div class="list">' + DRILLS.map(D => '<button class="item" data-drill="' + D.id + '"><div class="mini" style="width:54px;flex-shrink:0"></div><div class="grow"><b>' + esc(D.name) + '</b><div class="small muted">' + esc(D.text) + '</div></div>' + (Store.data.drills[D.id] ? '<span class="chip acc">' + Store.data.drills[D.id] + ' moves' + (Store.data.drills[D.id] <= D.par ? ' ★' : '') + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="section-title">Practice tactics</div><div class="tiles"><button class="tile" data-pz="fork"><span class="ic" style="background:#4f8fe022;color:#6aa5f0">⑂</span><span><b>Forks</b><small>Hit two targets at once</small></span></button><button class="tile" data-pz="mateIn1"><span class="ic" style="background:#e2544b22;color:#ef6b5f">#</span><span><b>Mate in 1</b><small>Spot the checkmate</small></span></button></div>' +
      '<div class="section-title">The rules</div><div class="list">' + RULES.map((r, i) => '<button class="item" data-rule="' + i + '"><div class="grow"><b>' + esc(r[0]) + '</b></div><span class="faint">›</span></button>').join('') + '</div></div>';
    $$('[data-drill]', el).forEach(b => { const D = DRILLS.find(x => x.id === b.dataset.drill); const m = b.querySelector('.mini'); const bd = document.createElement('div'); bd.className = 'mini-board'; m.appendChild(bd); new Board(bd, { coords: false, animMs: 0 }).set({ fen: D.fen, animate: false }); });
    el.addEventListener('click', e => {
      const l = e.target.closest('[data-lesson]'); if (l) return App.go('lesson', { id: l.dataset.lesson });
      const d = e.target.closest('[data-drill]'); if (d) return App.go('drill', { id: d.dataset.drill });
      const t = e.target.closest('[data-pz]'); if (t) return App.go('puzzle', { mode: 'theme', theme: t.dataset.pz });
      const r = e.target.closest('[data-rule]'); if (r) { const [h, p] = RULES[+r.dataset.rule]; sheet('<h3>' + esc(h) + '</h3><p>' + p + '</p>'); }
    });
  }

  root.Learn = { LESSONS, DRILLS, screenLearn, screenLesson, screenDrill, destsFor };
})(typeof self !== 'undefined' ? self : this);
