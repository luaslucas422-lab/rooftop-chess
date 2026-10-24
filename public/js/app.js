/* Rooftop Chess – screens and navigation */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, sheet, confirmBox } = UI;
  const icon = Play.icon;
  const VERSION = '1.0.0';
  const TCS = { Bullet: ['1+0', '1+1', '2+1'], Blitz: ['3+0', '3+2', '5+0', '5+3'], Rapid: ['10+0', '10+5', '15+10', '30+0'] };
  const tcText = t => t.replace('+', ' | ');
  const catOf = t => { const [b, i] = t.split('+').map(Number); return Rating.category(b * 60, i); };
  const S = () => Store.data.settings;
  const FULL = new Set(['game', 'puzzle', 'rush', 'analysis', 'review', 'lesson', 'drill', 'editor']);
  const TAB_OF = { home: 'home', online: 'home', friend: 'home', bots: 'home', local: 'home', puzzles: 'puzzles', learn: 'learn', watch: 'watch', profile: 'profile', settings: 'profile', leaders: 'profile', games: 'profile' };
  let cleanup = null, current = { route: 'home', params: {} }, installEvt = null, depth = 0;   // depth: how many screens back we can go inside the app

  /* ---------- navigation ---------- */
  const App = {
    go(route, params, replace) {
      const st = { route, params: params || {} };
      try { if (replace) history.replaceState(st, '', '#' + route); else { history.pushState(st, '', '#' + route); depth++; } } catch (e) {}
      render(st);
    },
    /* back to the previous screen – but never out of the app (e.g. when it was opened from a link) */
    back(fallback) { if (depth > 0) history.back(); else App.go(fallback || 'home', {}, true); },
    get route() { return current.route; },
    settingsSheet,
  };
  function render(st) {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    current = st;
    const el = $('#screen');
    const fresh = el.cloneNode(false); el.replaceWith(fresh);   // drops old listeners
    document.body.classList.toggle('full', FULL.has(st.route));
    for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === TAB_OF[st.route]);
    const fn = SCREENS[st.route] || SCREENS.home;
    try { cleanup = fn(fresh, st.params || {}) || null; } catch (e) {
      console.error(e);
      fresh.innerHTML = '<div class="page"><h2>Something went wrong</h2><p class="muted">' + esc(e.message) + '</p><button class="btn" data-reload>Reload</button></div>';
      $('[data-reload]', fresh).onclick = () => { location.hash = ''; location.reload(); };
    }
    fresh.scrollTop = 0;
  }
  addEventListener('popstate', e => {
    if (UI.closeSheet()) { try { history.pushState(current, '', '#' + current.route); } catch (x) {} return; }
    depth = Math.max(0, depth - 1);
    render(e.state || { route: 'home', params: {} });
  });

  const top = (title, right) => '<div class="topbar"><button class="iconbtn" data-back aria-label="Back">' + icon('back') + '</button><h2>' + esc(title) + '</h2>' + (right || '') + '</div>';
  const back = el => el.addEventListener('click', e => { if (e.target.closest('[data-back]')) App.back(); });
  const miniBoard = (fen, flip) => { const d = document.createElement('div'); d.className = 'mini-board'; const b = new Board(d, { coords: false, animMs: 0, orientation: flip ? 'b' : 'w' }); b.set({ fen, animate: false }); return d; };
  const rr = r => r && r.games ? Math.round(r.r) + (r.provisional ? '?' : '') : '–';

  /* ---------- home ---------- */
  function home(el) {
    const p = Store.data.profile, cur = Store.data.current, og = Play.player && !Play.player.over ? Play.player : null;
    const R = Store.data.online.ratings || {};
    const hour = new Date().getHours(), hi = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const curBot = cur && BOTS.find(b => b.id === cur.bot);
    const recent = Store.data.games.slice(0, 4);
    const d = Puzzles.daily();
    el.innerHTML = '<div class="page">' +
      '<div class="row gap" style="margin-bottom:14px">' + UI.avatarHtml(p, 44) + '<div class="grow"><div class="small muted">' + hi + ',</div><div style="font-weight:800;font-size:18px" class="ellipsis">' + esc(p.name || 'Player') + '</div></div>' +
      '<span class="chip net"></span><button class="iconbtn" data-go="settings" aria-label="Settings">' + icon('gear') + '</button></div>' +
      (og ? '<button class="banner" data-a="return" style="width:100%;color:inherit;text-align:left"><b class="grow">Your game vs ' + esc(og.players[og.me === 'w' ? 'b' : 'w'].name) + ' is on</b><span class="btn sm primary">Return</span></button>' : '') +
      (curBot && !og ? '<div class="banner"><span class="av" style="width:36px;height:36px">' + curBot.faceSvg + '</span><div class="grow"><b>Unfinished game vs ' + esc(curBot.name) + '</b><div class="small muted">' + cur.moves.length + ' moves played</div></div><button class="btn sm primary" data-a="resume">Continue</button></div>' : '') +
      installBanner() +
      '<div class="hero"><svg class="skyline" viewBox="0 0 200 90"><path fill="currentColor" d="M0 90V60h14V40h10v20h8V30l8-8 8 8v30h10V48h18v42zm88 0V36h8V24h10v12h8v54zm34 0V56h12V44h4v-8h6v8h4v12h12v34zm44 0V30l10-10 10 10v60z"/></svg>' +
      '<div class="small muted">Rated games against real people</div><div style="font-size:22px;font-weight:900;margin:2px 0 12px">Play chess online</div>' +
      '<button class="btn primary big" data-go="online">' + icon('globe') + ' Play Online</button>' +
      '<div class="row gap" style="margin-top:10px;font-size:13px"><span class="chip">Bullet ' + rr(R.bullet) + '</span><span class="chip">Blitz ' + rr(R.blitz) + '</span><span class="chip">Rapid ' + rr(R.rapid) + '</span></div></div>' +
      '<div class="tiles" style="margin-top:12px">' +
      '<button class="tile" data-go="bots"><span class="ic" style="background:#7aa7f022;color:#7aa7f0">' + icon('robot') + '</span><span><b>Play a bot</b><small>12 characters, 250 to 2800</small></span></button>' +
      '<button class="tile" data-go="friend"><span class="ic" style="background:#6cc4a122;color:#6cc4a1">' + icon('friend') + '</span><span><b>Play a friend</b><small>Send a code or link</small></span></button>' +
      '<button class="tile" data-go="local"><span class="ic" style="background:#e27fa722;color:#e27fa7">' + icon('flip') + '</span><span><b>Pass & play</b><small>Two players, one phone</small></span></button>' +
      '<button class="tile" data-go="analysis"><span class="ic" style="background:#f2cc5b22;color:#f2cc5b">' + icon('chart') + '</span><span><b>Analysis</b><small>Engine, PGN & FEN</small></span></button>' +
      '</div>' +
      '<div class="section-title">Daily puzzle</div><button class="card row gap" data-a="daily" style="width:100%;border:0;text-align:left;color:inherit"><div class="db" style="width:104px;flex-shrink:0"></div><div class="grow"><b>' + (Store.data.dailyDone === Puzzles.dayNumber() ? 'Solved today ✓' : 'Today’s puzzle') + '</b><div class="small muted">' + (d ? (new Chess.Game(d.fen).turn === 'w' ? 'Black' : 'White') + ' to move · rated ' + d.rating : '') + '</div><div class="small" style="margin-top:6px;color:var(--accent);font-weight:700">Solve it →</div></div></button>' +
      '<div class="section-title">Recent games</div>' + (recent.length ? '<div class="list">' + recent.map(gameItem).join('') + '</div><button class="btn ghost block" style="margin-top:10px" data-go="games">All games</button>' : '<div class="card empty">Your games will show up here.</div>') +
      '</div>';
    if (d) { const g = new Chess.Game(d.fen); g.move(d.line[0]); $('.db', el).appendChild(miniBoard(g.fen(), g.turn === 'b')); }
    const net = () => { const c = $('.net', el); if (!c) return; c.innerHTML = Net.state === 'online' ? '<span style="width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block"></span> ' + ((Net.me && Net.me.stats && Net.me.stats.online) || 1) + ' online' : Net.state === 'connecting' ? 'Connecting…' : 'Offline'; };
    net(); const off = Net.on('state', net), off2 = Net.on('stats', m => { if (Net.me) Net.me.stats = m.stats; net(); });
    if (Net.state === 'online') Net.raw({ t: 'stats' });
    el.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'); if (g) return App.go(g.dataset.go);
      const a = e.target.closest('[data-a]'); if (a) { const k = a.dataset.a; if (k === 'return') { Play.current = Play.player; App.go('game'); } if (k === 'resume') Play.resumeBot(); if (k === 'daily') App.go('puzzle', { mode: 'daily' });
        if (k === 'install') install();
        if (k === 'noinstall') { Store.data.installHidden = true; Store.save(); const bn = $('.install-banner', el); if (bn) bn.remove(); } }
      const gi = e.target.closest('[data-game]'); if (gi) gameSheet(gi.dataset.game);
    });
    return () => { off(); off2(); };
  }
  function gameItem(g) {
    const opp = g.me ? (g.me === 'w' ? g.black : g.white) : null;
    const res = g.winner ? (g.me ? (g.winner === g.me ? 'win' : 'loss') : 'draw') : 'draw';
    const label = g.reason === 'aborted' ? 'Aborted' : !g.me ? (g.result || '').replace('1/2-1/2', '½-½') : res === 'win' ? 'Won' : res === 'loss' ? 'Lost' : 'Draw';
    const sub = (g.mode === 'online' ? (g.rated ? 'Rated ' : 'Casual ') + (g.cat || '') + ' ' + (g.tc || '') : g.mode === 'bot' ? 'vs bot' : 'Pass & play' + (g.tc ? ' ' + g.tc : '')) + ' · ' + UI.ago(g.at);
    const bot = opp && opp.bot && BOTS.find(b => b.id === opp.bot);
    return '<button class="item" data-game="' + esc(g.id) + '">' + (opp ? UI.avatarHtml(bot || opp, 38) : '<span class="av" style="width:38px;height:38px;display:grid;place-items:center">' + icon('flip') + '</span>') +
      '<div class="grow"><b class="ellipsis" style="display:block">' + esc(opp ? opp.name + (opp.rating ? ' (' + opp.rating + ')' : '') : g.white.name + ' vs ' + g.black.name) + '</b><div class="small muted ellipsis">' + esc(sub) + '</div></div>' +
      '<div class="col" style="align-items:flex-end;gap:2px"><span class="pill ' + (g.reason === 'aborted' ? 'draw' : res) + '">' + label + '</span>' + (g.delta != null ? '<span class="tiny ' + (g.delta >= 0 ? 'good' : 'bad') + '">' + (g.delta >= 0 ? '+' : '') + g.delta + '</span>' : '') + '</div></button>';
  }
  function gameSheet(id) {
    const g = Store.data.games.find(x => x.id === id); if (!g) return;
    const s = sheet('<h3>' + esc(g.white.name) + ' vs ' + esc(g.black.name) + '</h3><p class="muted small">' + esc((g.result || '').replace('1/2-1/2', '½-½')) + ' · ' + esc(g.reason || '') + ' · ' + g.moves + ' moves · ' + new Date(g.at).toLocaleString() + '</p>' +
      '<button class="menu-item" data-k="review">' + icon('review') + 'Game Review</button><button class="menu-item" data-k="analysis">' + icon('chart') + 'Open in Analysis</button><button class="menu-item" data-k="pgn">' + icon('copy') + 'Copy PGN</button>' +
      '<button class="menu-item" data-k="del">' + icon('x') + 'Delete from history</button>');
    s.addEventListener('click', async e => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
      const players = { w: g.white.bot ? BOTS.find(x => x.id === g.white.bot) || g.white : g.white, b: g.black.bot ? BOTS.find(x => x.id === g.black.bot) || g.black : g.black };
      if (k === 'review') { s.close(); App.go('review', { pgn: g.pgn, me: g.me, players }); }
      if (k === 'analysis') { s.close(); App.go('analysis', { pgn: g.pgn, flip: g.me === 'b' }); }
      if (k === 'pgn') UI.copy(g.pgn);
      if (k === 'del') { s.close(); if (await confirmBox('Delete this game?', 'It will be removed from this device.', 'Delete')) { Store.data.games = Store.data.games.filter(x => x.id !== id); Store.save(); App.go(current.route, current.params, true); } }
    });
  }

  /* ---------- play online ---------- */
  function tcPicker(selected) {
    return Object.entries(TCS).map(([k, list]) => '<div class="tc-label">' + k + '</div><div class="tc-grid">' + list.map(t => '<button data-tc="' + t + '" class="' + (t === selected ? 'on' : '') + '">' + tcText(t) + '</button>').join('') + '</div>').join('');
  }
  function online(el, params) {
    let tc = params.tc || Store.data.lastTc || '10+0', seeking = false, t0 = 0, iv = null;
    const draw = () => {
      const R = Store.data.online.ratings || {}, cat = catOf(tc);
      el.innerHTML = top('Play online', '<button class="iconbtn" data-go="leaders" aria-label="Leaderboard">' + icon('chart') + '</button>') + '<div class="page" style="padding-top:4px">' +
        (seeking ? '<div class="card center" style="padding:30px 16px"><div class="spin"></div><h2 style="margin-top:16px">Finding an opponent</h2><p class="muted">' + tcText(tc) + ' · ' + cat + ' · your rating ' + rr(R[cat]) + '</p><p class="big-t" style="font:800 26px ui-monospace,monospace" data-t>0:00</p>' +
          '<p class="small muted" data-hint></p><button class="btn ghost" data-a="cancel">Cancel</button></div>' :
          tcPicker(tc) + '<div class="row gap" style="margin:16px 2px 12px"><span class="muted small grow">Your ' + cat + ' rating</span><b>' + rr(R[cat]) + '</b></div><button class="btn primary big" data-a="play">Play ' + tcText(tc) + '</button>' +
          '<p class="small muted center net-line" style="margin-top:12px"></p>') + '</div>';
      netLine();
    };
    const netLine = () => { const l = $('.net-line', el); if (!l) return; l.innerHTML = Net.state === 'online' ? '● Connected · ' + ((Net.me && Net.me.stats && Net.me.stats.online) || 1) + ' online' : Net.state === 'connecting' ? 'Connecting to the server…' : 'Can’t reach the server. <a href="#" data-go="settings">Server settings</a>'; };
    const start = async () => {
      if (!(await Net.ready(6000))) { draw(); return toast('Can’t reach the server right now'); }
      Store.data.lastTc = tc; Store.save();
      if (Net.send({ t: 'seek', tc })) { seeking = true; t0 = Date.now(); draw(); }
    };
    const tick = () => {
      if (!seeking) return; const s = Math.floor((Date.now() - t0) / 1000), t = $('[data-t]', el), h = $('[data-hint]', el);
      if (t) t.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (h && s >= 20) h.innerHTML = 'Not many people online right now. You can keep waiting, <a href="#" data-go="friend">invite a friend</a> or <a href="#" data-go="bots">play a bot</a>.';
    };
    iv = setInterval(tick, 500);
    const offs = [Net.on('state', netLine), Net.on('seeking', () => { seeking = true; }), Net.on('unseeked', () => { seeking = false; draw(); })];
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-tc]'); if (b) { tc = b.dataset.tc; return draw(); }
      const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); return App.go(g.dataset.go); }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'play') start();
      if (a.dataset.a === 'cancel') { Net.send({ t: 'unseek' }); seeking = false; draw(); }
    });
    back(el); draw(); Net.connect();
    if (params.auto) start();
    return () => { clearInterval(iv); offs.forEach(f => f()); if (seeking) Net.raw({ t: 'unseek' }); };
  }

  /* ---------- play a friend ---------- */
  function friend(el, params) {
    let tc = Store.data.lastTc || '10+0', color = 'r', rated = false, code = null, preview = null;
    const link = c => { const base = (S().server || (location.protocol.startsWith('http') ? location.origin : '')).replace(/\/+$/, '').replace(/\/chess$/, ''); return base + '/chess/?join=' + c; };
    const draw = () => {
      el.innerHTML = top('Play a friend') + '<div class="page" style="padding-top:4px">' +
        (code ? '<div class="card center"><p class="muted">Send this code to your friend</p><div style="font:900 40px ui-monospace,monospace;letter-spacing:.12em;margin:4px 0 10px">' + esc(code) + '</div>' +
          '<div class="row gap" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" data-a="share">' + icon('share') + ' Share link</button><button class="btn" data-a="copy">' + icon('copy') + ' Copy</button></div>' +
          '<div class="spin" style="margin-top:22px;width:34px;height:34px"></div><p class="small muted" style="margin-top:10px">Waiting for your friend to join · ' + tcText(tc) + (rated ? ' · rated' : ' · casual') + '</p><button class="btn ghost" data-a="cancel">Cancel</button></div>' :
        '<h3>Join a friend’s game</h3><div class="row gap"><input class="field" id="code" maxlength="6" placeholder="Enter code" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;font-weight:800;letter-spacing:.1em" value="' + esc(params.join || '') + '"><button class="btn primary" data-a="look">Join</button></div>' +
        (preview ? '<div class="card" style="margin-top:10px">' + (preview.missing ? '<p class="bad" style="margin:0">No game with that code. Check it, or ask for a new one.</p>' : '<div class="row gap">' + UI.avatarHtml(preview.from, 44) + '<div class="grow"><b>' + esc(preview.from.name) + ' (' + preview.from.rating + ')</b><div class="small muted">' + tcText(preview.tc) + ' · ' + (preview.rated ? 'rated' : 'casual') + ' · you play ' + (preview.color === 'r' ? 'a random color' : preview.color === 'w' ? 'Black' : 'White') + '</div></div><button class="btn primary" data-a="accept">Accept</button></div>') + '</div>' : '') +
        '<h3 style="margin-top:26px">Or create a challenge</h3>' + tcPicker(tc) +
        '<div class="tc-label">I play</div><div class="seg">' + [['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([k, n]) => '<button data-color="' + k + '" class="' + (color === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
        '<label class="row gap" style="margin:16px 2px"><span class="grow"><b>Rated</b><div class="small muted">Counts toward both your ratings</div></span><span class="switch"><input type="checkbox" id="rated"' + (rated ? ' checked' : '') + '><span></span></span></label>' +
        '<button class="btn primary big" data-a="create">Create challenge</button>') + '</div>';
      const inp = $('#code', el); if (inp) inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (inp.value.length === 6) look(inp.value); };
      const r = $('#rated', el); if (r) r.onchange = () => { rated = r.checked; };
    };
    const look = async c => { if (!(await Net.ready(6000))) return toast('Can’t reach the server'); Net.send({ t: 'challengeInfo', code: c }); };
    const offs = [Net.on('challenge', m => { code = m.code; draw(); }), Net.on('challengeInfo', m => { preview = m; draw(); }), Net.on('challengeCancelled', () => { code = null; draw(); })];
    el.addEventListener('click', async e => {
      const t = e.target.closest('[data-tc]'); if (t) { tc = t.dataset.tc; return draw(); }
      const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; return draw(); }
      const a = e.target.closest('[data-a]'); if (!a) return;
      const k = a.dataset.a;
      if (k === 'create') { if (!(await Net.ready(6000))) return toast('Can’t reach the server right now'); Store.data.lastTc = tc; Store.save(); Net.send({ t: 'challenge', tc, color, rated }); }
      if (k === 'cancel') { Net.send({ t: 'cancelChallenge' }); code = null; draw(); }
      if (k === 'copy') UI.copy(link(code));
      if (k === 'share') { const url = link(code); if (navigator.share) navigator.share({ title: 'Play chess with me', text: 'Join my game on Rooftop Chess – code ' + code, url }).catch(() => {}); else UI.copy(url); }
      if (k === 'look') { const v = ($('#code', el).value || '').trim(); if (v.length !== 6) return toast('Codes are 6 letters and numbers'); look(v); }
      if (k === 'accept') Net.send({ t: 'accept', code: preview.code });
    });
    back(el); draw(); Net.connect();
    if (params.join && params.join.length === 6) look(params.join);
    return () => { offs.forEach(f => f()); if (code) Net.raw({ t: 'cancelChallenge' }); };
  }

  /* ---------- bots ---------- */
  function bots(el, params) {
    let sel = BOTS.find(b => b.id === Store.data.lastBot) || BOTS[1], color = Store.data.lastColor || 'r', saved = Store.data.coachLevel || (Store.data.coachOn === false ? 'off' : 'normal'),
      coach = params.coach ? (saved === 'off' ? 'beginner' : saved) : saved;   // off | beginner | normal | extreme
    const draw = () => {
      el.innerHTML = top('Play a bot') + '<div class="page" style="padding-top:4px">' +
        '<div class="card row gap" style="align-items:flex-start"><span class="av" style="width:72px;height:72px">' + sel.faceSvg + '</span><div class="grow"><h2 style="margin:0">' + esc(sel.name) + ' <span class="muted" style="font-size:16px">' + sel.rating + '</span></h2><p class="muted small" style="margin:4px 0 0">' + esc(sel.blurb) + '</p>' +
        (Store.data.beaten[sel.id] ? '<span class="chip acc" style="margin-top:6px">Beaten ✓</span>' : '') + '</div></div>' +
        (params.startFen ? '<p class="small muted" style="margin:10px 2px">Starting from the position you set up.</p>' : '') +
        '<div class="bot-grid" style="margin-top:12px">' + BOTS.map(b => '<button class="bot-card' + (b === sel ? ' on' : '') + '" data-bot="' + b.id + '">' + (Store.data.beaten[b.id] ? '<span class="won">✓</span>' : '') + '<span class="av" style="width:52px;height:52px">' + b.faceSvg + '</span><div class="nm">' + esc(b.name) + '</div><div class="rt">' + b.rating + '</div></button>').join('') + '</div>' +
        '<div class="tc-label">I play</div><div class="seg">' + [['w', 'White'], ['r', 'Random'], ['b', 'Black']].map(([k, n]) => '<button data-color="' + k + '" class="' + (color === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
        coachPick() +
        '<button class="btn primary big" style="margin-top:16px" data-a="play">Play ' + esc(sel.name) + '</button></div>';
    };
    /* Coach Mira: off or one of her three levels (Extreme opens up after a few games) */
    function coachPick() {
      const ex = Coach.extremeOpen(), L = Coach.LEVELS[coach];
      return '<div class="tc-label"><span class="av" style="width:22px;height:22px">' + UI.face(Coach.FACE) + '</span>Coach Mira</div><div class="seg coach-seg">' +
        [['off', 'Off']].concat(Object.keys(Coach.LEVELS).map(k => [k, Coach.LEVELS[k].name])).map(([k, n]) =>
          '<button data-coachlv="' + k + '" class="' + (coach === k ? 'on' : '') + (k === 'extreme' && !ex.open ? ' locked' : '') + '">' + (k === 'extreme' && !ex.open ? '🔒 ' : '') + n + '</button>').join('') + '</div>' +
        '<p class="small muted" style="margin:8px 2px 0">' + (L ? esc(L.blurb) : 'No coach – just you and the bot.') + (ex.open ? '' : ' <span class="faint">Extreme unlocks after ' + Coach.UNLOCK + ' finished games (' + ex.left + ' to go).</span>') + '</p>';
    }
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-bot]'); if (b) { sel = BOTS.find(x => x.id === b.dataset.bot); return draw(); }
      const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; return draw(); }
      const lv = e.target.closest('[data-coachlv]');
      if (lv) { if (lv.dataset.coachlv === 'extreme' && !Coach.extremeOpen().open) return toast('Finish ' + Coach.extremeOpen().left + ' more games to unlock Extreme coaching'); coach = lv.dataset.coachlv; return draw(); }
      if (e.target.closest('[data-a="play"]')) {
        Store.data.lastBot = sel.id; Store.data.lastColor = color; Store.data.coachLevel = coach; Store.save();
        let mine = color;
        if (params.startFen) mine = color === 'r' ? new Chess.Game(params.startFen).turn : color;
        Play.startBot(sel, mine, { startFen: params.startFen, coach: coach === 'off' ? null : coach });
      }
    });
    back(el); draw();
  }

  /* ---------- pass & play ---------- */
  function local(el) {
    let tc = 'none', flip = false;
    const opts = [['none', 'No clock'], ['3+2', '3 | 2'], ['5+0', '5 | 0'], ['10+0', '10 | 0'], ['15+10', '15 | 10'], ['30+0', '30 | 0']];
    const draw = () => {
      el.innerHTML = top('Pass & play') + '<div class="page" style="padding-top:4px"><p class="muted">Two players take turns on this device.</p><div class="tc-label">Clock</div><div class="tc-grid">' +
        opts.map(([k, n]) => '<button data-tc="' + k + '" class="' + (tc === k ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
        '<label class="row gap" style="margin:18px 2px"><span class="grow"><b>Turn the board each move</b><div class="small muted">So each player sees it from their side</div></span><span class="switch"><input type="checkbox" id="flip"' + (flip ? ' checked' : '') + '><span></span></span></label>' +
        '<button class="btn primary big" data-a="go">Start game</button></div>';
      $('#flip', el).onchange = e => { flip = e.target.checked; };
    };
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-tc]'); if (t) { tc = t.dataset.tc; return draw(); }
      if (e.target.closest('[data-a="go"]')) { const c = tc === 'none' ? null : (() => { const [b, i] = tc.split('+').map(Number); return { base: b * 60000, inc: i * 1000 }; })(); Play.startLocal({ tc: c, flipEach: flip }); }
    });
    back(el); draw();
  }

  /* ---------- watch ---------- */
  function watch(el) {
    let list = null, bw = BOTS[4], bb = BOTS[7];
    const draw = () => {
      el.innerHTML = '<div class="page"><div class="row"><h1 class="grow">Watch</h1><button class="iconbtn" data-a="refresh" aria-label="Refresh">' + icon('undo') + '</button></div>' +
        '<div class="section-title">Live games</div><div class="live"></div>' +
        '<div class="section-title">Bot battle</div><div class="card"><p class="small muted">Pick two bots and watch them play.</p><div class="row gap"><select class="field" id="bw">' + BOTS.map(b => '<option value="' + b.id + '"' + (b === bw ? ' selected' : '') + '>' + esc(b.name) + ' (' + b.rating + ')</option>').join('') + '</select><b class="muted">vs</b><select class="field" id="bb">' +
        BOTS.map(b => '<option value="' + b.id + '"' + (b === bb ? ' selected' : '') + '>' + esc(b.name) + ' (' + b.rating + ')</option>').join('') + '</select></div><button class="btn primary block" style="margin-top:12px" data-a="battle">Watch</button></div></div>';
      $('#bw', el).onchange = e => { bw = BOTS.find(b => b.id === e.target.value); };
      $('#bb', el).onchange = e => { bb = BOTS.find(b => b.id === e.target.value); };
      drawLive();
    };
    const drawLive = () => {
      const box = $('.live', el); if (!box) return;
      if (Net.state !== 'online') { box.innerHTML = '<div class="card empty">' + (Net.state === 'connecting' ? 'Connecting…' : 'Offline – live games need the server.') + '</div>'; return; }
      if (!list) { box.innerHTML = '<div class="card empty">Loading…</div>'; return; }
      if (!list.length) { box.innerHTML = '<div class="card empty">No games right now. Be the first – <a href="#" data-go="online">play online</a>!</div>'; return; }
      box.innerHTML = list.map(g => '<button class="live-card" data-watch="' + esc(g.id) + '"><div class="mb"></div><div class="grow"><div class="row gap4">' + UI.avatarHtml(g.white, 22) + '<b class="ellipsis">' + esc(g.white.name) + '</b><span class="muted small">' + g.white.rating + '</span></div>' +
        '<div class="row gap4" style="margin-top:4px">' + UI.avatarHtml(g.black, 22) + '<b class="ellipsis">' + esc(g.black.name) + '</b><span class="muted small">' + g.black.rating + '</span></div><div class="small muted" style="margin-top:6px">' + tcText(g.tc) + ' · ' + g.cat + ' · move ' + Math.ceil(g.moves / 2) + (g.watchers ? ' · ' + g.watchers + ' watching' : '') + '</div></div></button>').join('');
      $$('[data-watch]', box).forEach((b, i) => b.querySelector('.mb').appendChild(miniBoard(list[i].fen)));
    };
    const load = async () => { if (await Net.ready(5000)) Net.send({ t: 'live' }); drawLive(); };
    const offs = [Net.on('live', m => { list = m.games; drawLive(); }), Net.on('state', () => drawLive())];
    el.addEventListener('click', e => {
      const w = e.target.closest('[data-watch]'); if (w) return Net.send({ t: 'watch', id: w.dataset.watch });
      const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); return App.go(g.dataset.go); }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'refresh') load();
      if (a.dataset.a === 'battle') Play.startBattle(bw, bb);
    });
    draw(); load();
    const iv = setInterval(() => { if (Net.state === 'online') Net.raw({ t: 'live' }); }, 8000);
    return () => { clearInterval(iv); offs.forEach(f => f()); };
  }

  /* ---------- profile, games, leaderboard ---------- */
  function profile(el) {
    const p = Store.data.profile, R = Store.data.online.ratings || {}, P = Store.data.puzzles, G = Store.data.games;
    const mine = G.filter(g => g.me && g.reason !== 'aborted'), w = mine.filter(g => g.winner === g.me).length, l = mine.filter(g => g.winner && g.winner !== g.me).length, d = mine.length - w - l;
    const card = (name, r, sub) => '<div class="stat"><span>' + name + '</span><b>' + r + '</b><span>' + sub + '</span></div>';
    el.innerHTML = '<div class="page"><div class="row gap"><button data-a="face" style="border:0;background:none;padding:0" aria-label="New face">' + UI.avatarHtml(p, 72) + '</button><div class="grow"><h1 style="margin:0" class="ellipsis">' + esc(p.name || 'Player') + '</h1><div class="small muted">Playing since ' + new Date(p.created).toLocaleDateString() + '</div>' +
      '<button class="btn sm" style="margin-top:6px" data-a="name">Edit name</button></div><button class="iconbtn" data-go="settings" aria-label="Settings">' + icon('gear') + '</button></div>' +
      '<div class="section-title">Ratings</div><div class="stat-grid">' + card('Bullet', rr(R.bullet), (R.bullet ? R.bullet.games : 0) + ' games') + card('Blitz', rr(R.blitz), (R.blitz ? R.blitz.games : 0) + ' games') + card('Rapid', rr(R.rapid), (R.rapid ? R.rapid.games : 0) + ' games') +
      card('Puzzles', Math.round(P.r), P.solved + ' solved') + card('Rush', Store.data.rush.best, 'best score') + card('Record', w + '/' + l + '/' + d, 'win/loss/draw') + '</div>' +
      '<div class="section-title">Rating history</div><div class="card"><div class="seg" style="margin-bottom:10px">' + [['puzzle', 'Puzzles'], ['bullet', 'Bullet'], ['blitz', 'Blitz'], ['rapid', 'Rapid']].map(([k, n]) => '<button data-hist="' + k + '">' + n + '</button>').join('') + '</div><div class="hist"></div></div>' +
      '<div class="section-title">Bots beaten</div><div class="row wrap gap4">' + BOTS.map(b => '<span title="' + esc(b.name) + '" style="position:relative;opacity:' + (Store.data.beaten[b.id] ? 1 : .35) + '"><span class="av" style="width:44px;height:44px">' + b.faceSvg + '</span></span>').join('') + '</div>' +
      '<div class="section-title">Games</div>' + (G.length ? '<div class="list">' + G.slice(0, 8).map(gameItem).join('') + '</div>' + (G.length > 8 ? '<button class="btn ghost block" style="margin-top:10px" data-go="games">All ' + G.length + ' games</button>' : '') : '<div class="card empty">No games yet.</div>') +
      '<div class="tiles" style="margin-top:16px"><button class="tile" data-go="leaders"><span class="ic" style="background:#f2cc5b22;color:#f2cc5b">🏆</span><span><b>Leaderboard</b><small>Top online players</small></span></button>' +
      '<button class="tile" data-a="install"><span class="ic" style="background:#ff9f4322;color:var(--accent)">' + icon('plus') + '</span><span><b>Install app</b><small>Add to your home screen</small></span></button></div></div>';
    const drawHist = kind => {
      for (const b of $$('[data-hist]', el)) b.classList.toggle('on', b.dataset.hist === kind);
      const pts = (Store.data.ratingLog || []).filter(x => x.k === kind).slice(-120), box = $('.hist', el);
      if (pts.length < 2) { box.innerHTML = '<p class="small muted center" style="margin:14px 0">' + (kind === 'puzzle' ? 'Solve a few rated puzzles' : 'Play a few rated ' + kind + ' games') + ' to see your graph.</p>'; return; }
      const W = 300, H = 90, rs = pts.map(p => p.r), lo = Math.min(...rs) - 10, hi = Math.max(...rs) + 10;
      const xy = pts.map((p, i) => [i / (pts.length - 1) * W, H - (p.r - lo) / (hi - lo) * H]);
      const line = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
      box.innerHTML = '<div class="row" style="margin-bottom:6px"><b style="font-size:22px">' + rs[rs.length - 1] + '</b><span class="small muted right">best ' + Math.max(...rs) + ' · low ' + Math.min(...rs) + '</span></div>' +
        '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:90px;display:block"><path d="' + line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="rgba(255,159,67,.15)"/><path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' +
        '<div class="row tiny faint" style="margin-top:4px"><span>' + new Date(pts[0].t).toLocaleDateString() + '</span><span class="right">' + new Date(pts[pts.length - 1].t).toLocaleDateString() + '</span></div>';
    };
    const kinds = ['puzzle', 'blitz', 'rapid', 'bullet'];
    drawHist(kinds.find(k => (Store.data.ratingLog || []).filter(x => x.k === k).length >= 2) || 'puzzle');
    el.addEventListener('click', async e => {
      const h = e.target.closest('[data-hist]'); if (h) return drawHist(h.dataset.hist);
      const g = e.target.closest('[data-go]'); if (g) return App.go(g.dataset.go);
      const gi = e.target.closest('[data-game]'); if (gi) return gameSheet(gi.dataset.game);
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'face') { p.face = Math.floor(Math.random() * 1e9); Store.save(); Net.reconnect(); App.go('profile', {}, true); }
      if (a.dataset.a === 'name') nameSheet();
      if (a.dataset.a === 'install') install();
    });
  }
  function games(el) {
    el.innerHTML = top('All games') + '<div class="page" style="padding-top:4px">' + (Store.data.games.length ? '<div class="list">' + Store.data.games.map(gameItem).join('') + '</div>' : '<div class="card empty">No games yet.</div>') + '</div>';
    el.addEventListener('click', e => { const gi = e.target.closest('[data-game]'); if (gi) gameSheet(gi.dataset.game); });
    back(el);
  }
  function leaders(el) {
    let cat = 'blitz', list = null;
    const draw = () => {
      el.innerHTML = top('Leaderboard') + '<div class="page" style="padding-top:4px"><div class="seg">' + ['bullet', 'blitz', 'rapid'].map(c => '<button data-cat="' + c + '" class="' + (c === cat ? 'on' : '') + '">' + c[0].toUpperCase() + c.slice(1) + '</button>').join('') + '</div><div style="margin-top:12px">' +
        (list == null ? '<div class="card empty">' + (Net.state === 'online' ? 'Loading…' : 'Connecting…') + '</div>' : !list.length ? '<div class="card empty">Nobody has played ' + cat + ' yet.</div>' :
          '<div class="list">' + list.map((p, i) => '<div class="item"><b style="width:24px;color:' + (i < 3 ? 'var(--accent)' : 'var(--muted)') + '">' + (i + 1) + '</b>' + UI.avatarHtml(p, 34) + '<div class="grow"><b class="ellipsis" style="display:block">' + esc(p.name) + (p.id === Store.data.online.id ? ' (you)' : '') + '</b><div class="small muted">' + p.games + ' games</div></div><b>' + p.rating + '</b></div>').join('') + '</div>') + '</div></div>';
    };
    const ask = async () => { list = null; draw(); if (await Net.ready(6000)) Net.send({ t: 'leaders', cat }); };
    const off = Net.on('leaders', m => { if (m.cat === cat) { list = m.list; draw(); } });
    el.addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; ask(); } });
    back(el); ask();
    return off;
  }

  /* ---------- settings ---------- */
  const BOARDS = [['grass', 'Grass', '#eeeed2', '#769656'], ['walnut', 'Walnut', '#f0d9b5', '#b58863'], ['ocean', 'Ocean', '#dee3e6', '#8ca2ad'], ['dusk', 'Dusk', '#e8e2f3', '#8f7bb5'], ['sunset', 'Sunset', '#f7e4c9', '#d18b55'], ['slate', 'Slate', '#c9ced6', '#6b7686']];
  const TOGGLES = [['sound', 'Sounds'], ['vibrate', 'Vibrate on moves'], ['dests', 'Show legal moves'], ['coords', 'Board coordinates'], ['lastMove', 'Highlight the last move'], ['autoQueen', 'Always promote to a queen'], ['premoves', 'Premoves in online games'], ['botChat', 'Bots talk during games'], ['confirmResign', 'Ask before resigning'], ['bigClock', 'Big clock']];
  function settingsHtml(full) {
    const s = S();
    return '<div class="section-title" style="margin-top:4px">Board</div><div class="row wrap gap">' + BOARDS.map(([k, n, l, d]) => '<button data-boardtheme="' + k + '" style="border:2px solid ' + (s.board === k ? 'var(--accent)' : 'transparent') + ';border-radius:12px;padding:4px;background:var(--card2)"><span style="display:grid;grid-template-columns:1fr 1fr;width:46px;height:46px;border-radius:8px;overflow:hidden"><i style="background:' + l + '"></i><i style="background:' + d + '"></i><i style="background:' + d + '"></i><i style="background:' + l + '"></i></span><div class="tiny" style="margin-top:3px">' + n + '</div></button>').join('') + '</div>' +
      '<div class="list" style="margin-top:12px">' + TOGGLES.map(([k, n]) => '<label class="item"><span class="grow">' + n + '</span><span class="switch"><input type="checkbox" data-set="' + k + '"' + (s[k] ? ' checked' : '') + '><span></span></span></label>').join('') + '</div>' +
      '<div class="tc-label">Piece animation</div><div class="seg">' + [[0, 'Off'], [120, 'Fast'], [200, 'Normal'], [320, 'Slow']].map(([v, n]) => '<button data-anim="' + v + '" class="' + (s.anim === v ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
      '<div class="tc-label">App theme</div><div class="seg">' + [['dark', 'Dark'], ['light', 'Light']].map(([v, n]) => '<button data-apptheme="' + v + '" class="' + (s.theme === v ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' +
      (full ? '<div class="section-title">Online server</div><div class="card"><p class="small muted">Leave empty to use the server this app came from. If you opened the app from somewhere else, paste your Rooftop server link (like https://your-server.onrender.com).</p>' +
        '<div class="row gap"><input class="field" id="server" placeholder="This site" value="' + esc(s.server) + '"><button class="btn" data-a="server">Save</button></div><p class="small" style="margin:8px 0 0" id="srvstate"></p></div>' +
        '<div class="section-title">Your data</div><div class="list"><button class="item" data-a="pgns"><span class="grow">Copy all my games (PGN)</span><span class="small muted">' + Store.data.games.length + '</span></button><button class="item" data-a="export"><span class="grow">Copy a backup of my data</span></button><button class="item" data-a="import"><span class="grow">Restore from a backup</span></button><button class="item" data-a="reset"><span class="grow bad">Reset everything on this device</span></button></div>' +
        '<p class="faint small center" style="margin-top:18px">Rooftop Chess ' + VERSION + ' · pieces, characters and puzzles made for this app</p>' : '');
  }
  function bindSettings(root, redraw, onChange) {
    root.addEventListener('click', e => {
      const s = S();
      const b = e.target.closest('[data-boardtheme]'); if (b) { s.board = b.dataset.boardtheme; applyLook(); Store.save(); redraw(); onChange && onChange(); return; }
      const an = e.target.closest('[data-anim]'); if (an) { s.anim = +an.dataset.anim; Store.save(); redraw(); onChange && onChange(); return; }
      const th = e.target.closest('[data-apptheme]'); if (th) { s.theme = th.dataset.apptheme; applyLook(); Store.save(); redraw(); return; }
    });
    root.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.set; if (!k) return; S()[k] = e.target.checked; applyLook(); Store.save(); onChange && onChange(); });
  }
  function settings(el) {
    const draw = () => { el.innerHTML = top('Settings') + '<div class="page" style="padding-top:4px">' + settingsHtml(true) + '</div>'; srv(); };
    const srv = () => { const x = $('#srvstate', el); if (x) x.innerHTML = Net.state === 'online' ? '<span class="good">● Connected</span> ' + esc(Net.url() || '') : Net.state === 'connecting' ? 'Connecting… ' + esc(Net.url() || '') : '<span class="bad">Not connected</span>'; };
    bindSettings(el, draw);
    const off = Net.on('state', srv);
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'server') { S().server = $('#server', el).value.trim(); Store.save(); Net.reconnect(); toast('Saved'); }
      if (a.dataset.a === 'export') UI.copy(JSON.stringify(Store.data));
      if (a.dataset.a === 'pgns') { if (!Store.data.games.length) return toast('No games yet'); UI.copy(Store.data.games.slice().reverse().map(g => g.pgn.trim()).join('\n\n') + '\n'); }
      if (a.dataset.a === 'import') {
        const s = sheet('<h3>Restore a backup</h3><p class="small muted">Paste the backup text. This replaces what’s on this device.</p><textarea class="field"></textarea><button class="btn primary block" style="margin-top:10px" data-ok>Restore</button>');
        $('[data-ok]', s).onclick = () => { try { const d = JSON.parse($('textarea', s).value); if (!d || d.v !== 1 || !d.profile) throw 0; localStorage.setItem('rooftop-chess.v1', JSON.stringify(d)); location.reload(); } catch (x) { toast('That isn’t a Rooftop Chess backup'); } };
      }
      if (a.dataset.a === 'reset' && await confirmBox('Reset everything?', 'Your games, puzzle rating and settings on this device will be deleted. Online ratings are tied to this device too.', 'Reset')) { localStorage.removeItem('rooftop-chess.v1'); location.hash = ''; location.reload(); }
    });
    back(el); draw();
    return off;
  }
  function settingsSheet(onChange) {
    const s = sheet('<h3>Settings</h3><div class="body"></div>');
    const draw = () => { $('.body', s).innerHTML = settingsHtml(false); };
    bindSettings(s, draw, onChange); draw();
  }
  function applyLook() {
    const s = S(), d = document.documentElement;
    d.dataset.theme = s.theme; d.dataset.board = s.board;
    document.body.classList.toggle('nolast', !s.lastMove); document.body.classList.toggle('bigclock', !!s.bigClock);
    Sound.enabled = s.sound; Sound.vibrate = s.vibrate !== false;
    const m = $('meta[name="theme-color"]'); if (m) m.content = s.theme === 'light' ? '#f2f0ea' : '#15181d';
  }

  /* ---------- first launch, name, install ---------- */
  function nameSheet(first) {
    const p = Store.data.profile;
    const s = sheet((first ? '<div class="center"><img src="icons/icon.svg" width="64" height="64" alt="" style="border-radius:16px"><h2 style="margin-top:10px">Welcome to Rooftop Chess</h2><p class="muted">Pick a name other players will see.</p></div>' : '<h3>Your name</h3>') +
      '<div class="row gap" style="margin:10px 0"><button class="av-btn" data-face style="border:0;background:none;padding:0">' + UI.avatarHtml(p, 56) + '</button><input class="field" id="nm" maxlength="20" placeholder="Your name" value="' + esc(p.name) + '"></div>' +
      '<p class="tiny faint" style="margin-top:-4px">Tap the face for a new one. Keep it friendly – no real full names or contact details.</p>' +
      (first ? '<div class="tc-label">How well do you play?</div><div class="seg" id="lvl">' + [['new', 'New'], ['beg', 'Beginner'], ['mid', 'Club'], ['pro', 'Strong']].map(([k, n], i) => '<button data-l="' + k + '" class="' + (i === 1 ? 'on' : '') + '">' + n + '</button>').join('') + '</div>' : '') +
      '<button class="btn primary big" style="margin-top:16px" data-ok>' + (first ? 'Let’s play' : 'Save') + '</button>', { noClose: !!first });
    let lvl = 'beg';
    s.addEventListener('click', e => {
      if (e.target.closest('[data-face]')) { p.face = Math.floor(Math.random() * 1e9); $('[data-face]', s).innerHTML = UI.avatarHtml(p, 56); }
      const l = e.target.closest('[data-l]'); if (l) { lvl = l.dataset.l; $$('[data-l]', s).forEach(b => b.classList.toggle('on', b === l)); }
      if (e.target.closest('[data-ok]')) {
        const v = $('#nm', s).value.replace(/[<>]/g, '').trim().slice(0, 20);
        if (!v) return toast('Please pick a name');
        p.name = v;
        if (first) { const start = { new: [600, 'pip'], beg: [900, 'juniper'], mid: [1300, 'selma'], pro: [1700, 'dmitri'] }[lvl]; Store.data.puzzles.r = start[0]; Store.data.lastBot = start[1]; }
        Store.save(); s.close(); Net.reconnect();
        if (current.route === 'home' || current.route === 'profile') App.go(current.route, {}, true);
      }
    });
  }
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (current.route === 'home' && !$('.install-banner')) App.go('home', {}, true); });
  addEventListener('appinstalled', () => { installEvt = null; Store.data.installHidden = true; Store.save(); toast('Installed! Find Rooftop Chess on your home screen.'); });
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  /* a gentle nudge to install the app (until it's installed or dismissed) */
  function installBanner() {
    if (Store.data.installHidden || isStandalone() || !(installEvt || isIos())) return '';
    return '<div class="banner install-banner"><img src="icons/icon.svg" width="38" height="38" alt="" style="border-radius:10px"><div class="grow"><b>Get the app</b><div class="small muted">' +
      (installEvt ? 'Install Rooftop Chess on this device – it works offline too.' : 'Tap Share, then “Add to Home Screen”.') + '</div></div>' +
      (installEvt ? '<button class="btn sm primary" data-a="install">Install</button>' : '') + '<button class="iconbtn" data-a="noinstall" aria-label="Not now">' + icon('x') + '</button></div>';
  }
  function install() {
    if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; }); return; }
    if (matchMedia('(display-mode: standalone)').matches) return toast('You’re already using the app');
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    sheet('<h3>Install Rooftop Chess</h3>' + (ios ? '<p>In Safari, tap <b>Share</b> (the square with an arrow), then <b>Add to Home Screen</b>.</p>' : '<p>Open your browser’s menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>') + '<p class="muted small">Once installed it opens full screen like any other app, and bots, puzzles, lessons and analysis all work offline.</p>');
  }

  const SCREENS = {
    home, online, friend, bots, local, watch, profile, games, leaders, settings,
    game: (el) => Play.screen(el),
    puzzles: el => Puzzles.screenHome(el), puzzle: (el, p) => Puzzles.screenSolve(el, p), rush: el => Puzzles.screenRush(el),
    learn: el => Learn.screenLearn(el), lesson: (el, p) => Learn.screenLesson(el, p), drill: (el, p) => Learn.screenDrill(el, p),
    analysis: (el, p) => Analysis.screenAnalysis(el, p), review: (el, p) => Analysis.screenReview(el, p), editor: (el, p) => Analysis.screenEditor(el, p),
  };

  /* ---------- start ---------- */
  applyLook();
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) App.go(b.dataset.tab === 'home' ? 'home' : b.dataset.tab); });
  document.addEventListener('pointerdown', () => Sound.unlock(), { once: true, capture: true });
  root.App = App;
  const q = new URLSearchParams(location.search);
  const start = (location.hash || '').replace(/^#/, '');
  if (q.get('join')) { App.go('friend', { join: q.get('join').toUpperCase().slice(0, 6) }, true); history.replaceState(history.state, '', location.pathname + '#friend'); }
  else App.go(SCREENS[start] && !['game', 'review', 'puzzle', 'rush', 'drill', 'lesson'].includes(start) ? start : 'home', {}, true);
  if (!Store.data.profile.name) setTimeout(() => nameSheet(true), 300);
  if (location.protocol.startsWith('http') || S().server) Net.connect();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
})(typeof self !== 'undefined' ? self : this);
