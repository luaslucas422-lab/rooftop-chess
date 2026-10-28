/* Rooftop Chess – draw your own chess pieces: one drawing for each kind of piece (white and black are colored for you)
   and a name for the style. Sets are kept on this device (Store.data.pieceSets) and show up in Settings → Pieces. */
(function (root) {
  'use strict';
  const { esc, $, $$, toast, confirmBox } = UI;
  const icon = Play.icon;
  const KINDS = [['k', 'King'], ['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight'], ['p', 'Pawn']];
  const WIDTHS = [[4, 'Thin'], [7, 'Medium'], [11, 'Thick']];
  const MAX_SETS = 5, MAX_STROKES = 80, MAX_POINTS = 400;

  function screen(el, params) {
    const sets = Store.data.pieceSets || (Store.data.pieceSets = []);
    const old = params.id ? sets.find(x => x.id === params.id) : null;
    if (!old && sets.length >= MAX_SETS) { toast('You can keep ' + MAX_SETS + ' drawn styles – delete one first'); App.back('settings'); return; }
    const set = old ? JSON.parse(JSON.stringify(old)) : { id: 'pc-' + randHex(4), name: '', w: 7, s: {} };
    let kind = 'k', live = null;
    const undo = [];   // [kind, strokes before the change]
    const strokes = () => set.s[kind] || (set.s[kind] = []);

    el.innerHTML = '<div class="page draw-page"><div class="topbar" style="padding-left:0"><button class="iconbtn" data-a="back" aria-label="Back">' + icon('back') + '</button><h2>' + (old ? 'Edit your pieces' : 'Draw your pieces') + '</h2></div>' +
      '<input class="field" id="setname" maxlength="18" placeholder="Name your style" value="' + esc(set.name) + '">' +
      '<div class="kinds"></div>' +
      '<div class="pad-wrap"><svg class="pad" viewBox="0 0 100 100" aria-label="Drawing area"><image class="ghost" x="0" y="0" width="100" height="100"/><g class="ink"></g></svg></div>' +
      '<p class="small muted center" style="margin:6px 0 10px">Draw the piece with your finger. The faint shape is only a guide. White and black pieces are colored for you.</p>' +
      '<div class="row gap" style="flex-wrap:wrap"><div class="seg grow widths">' + WIDTHS.map(([w, n]) => '<button data-w="' + w + '">' + n + '</button>').join('') + '</div>' +
      '<button class="btn sm" data-a="undo">' + icon('undo') + ' Undo</button><button class="btn sm" data-a="clear">Clear</button></div>' +
      '<div class="tc-label">How it looks</div><div class="previews"></div>' +
      '<div class="row gap" style="margin-top:16px">' + (old ? '<button class="btn ghost" data-a="delete">Delete</button>' : '') + '<button class="btn primary grow" data-a="save">Save style</button></div></div>';
    const pad = $('.pad', el), ink = $('.ink', pad);

    const pathD = p => { let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += (i ? 'L' : 'M') + p[i] + ' ' + p[i + 1]; return p.length === 2 ? d + 'l.1 0' : d; };
    const strokeSvg = d => '<path d="' + d + '" fill="none" stroke="#1d1b19" stroke-width="' + (set.w + 5) + '" stroke-linecap="round" stroke-linejoin="round"/><path d="' + d + '" fill="none" stroke="#fff" stroke-width="' + set.w + '" stroke-linecap="round" stroke-linejoin="round"/>';
    function drawPad() { ink.innerHTML = strokes().map(p => strokeSvg(pathD(p))).join(''); }
    function drawRest() {
      $('.kinds', el).innerHTML = KINDS.map(([k, n]) => '<button data-k="' + k + '" class="' + (k === kind ? 'on' : '') + (set.s[k] && set.s[k].length ? ' done' : '') + '"><i style="background-image:url(\'' + PIECES.preview('w' + k.toUpperCase(), set.id, set) + '\')"></i><span>' + n + '</span></button>').join('');
      for (const b of $$('[data-w]', el)) b.classList.toggle('on', +b.dataset.w === set.w);
      const K = kind.toUpperCase();
      $('.previews', el).innerHTML = [['w', 'light'], ['w', 'dark'], ['b', 'light'], ['b', 'dark']].map(([c, sq]) => '<span class="pv ' + sq + '"><i style="background-image:url(\'' + PIECES.preview(c + K, set.id, set) + '\')"></i></span>').join('');
    }
    function drawAll() {
      $('.ghost', pad).setAttribute('href', PIECES.preview('w' + kind.toUpperCase(), 'classic'));
      drawPad(); drawRest();
    }

    // drawing: a stroke per touch, points at most about 1 unit apart
    const at = e => { const r = pad.getBoundingClientRect(); return [Math.round(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)) * 10) / 10, Math.round(Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)) * 10) / 10]; };
    pad.addEventListener('pointerdown', e => {
      if (strokes().length >= MAX_STROKES) return toast('That’s a lot of lines – try Undo or Clear');
      e.preventDefault(); pad.setPointerCapture(e.pointerId);
      undo.push([kind, strokes().map(p => p.slice())]);
      live = at(e);
      ink.insertAdjacentHTML('beforeend', '<g class="live">' + strokeSvg(pathD(live)) + '</g>');
    });
    pad.addEventListener('pointermove', e => {
      if (!live || live.length >= MAX_POINTS * 2) return;
      const [x, y] = at(e), lx = live[live.length - 2], ly = live[live.length - 1];
      if (Math.hypot(x - lx, y - ly) < 1) return;
      live.push(x, y);
      const d = pathD(live); for (const p of $$('.live path', ink)) p.setAttribute('d', d);
    });
    const end = () => { if (!live) return; strokes().push(live); live = null; drawPad(); drawRest(); };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);

    el.addEventListener('click', async e => {
      const k = e.target.closest('[data-k]'); if (k) { kind = k.dataset.k; return drawAll(); }
      const w = e.target.closest('[data-w]'); if (w) { set.w = +w.dataset.w; drawPad(); return drawRest(); }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'back') return App.back('settings');
      if (a === 'undo') { const u = undo.pop(); if (!u) return toast('Nothing to undo'); kind = u[0]; set.s[kind] = u[1]; return drawAll(); }
      if (a === 'clear') { if (!strokes().length) return; undo.push([kind, strokes().slice()]); set.s[kind] = []; return drawAll(); }
      if (a === 'delete') {
        if (!(await confirmBox('Delete “' + old.name + '”?', 'Your drawings for it will be gone.', 'Delete'))) return;
        Store.data.pieceSets = sets.filter(x => x.id !== old.id);
        if (Store.data.settings.pieces === old.id) Store.data.settings.pieces = PIECES.use('classic');
        Store.save(); toast('Deleted'); return App.back('settings');
      }
      if (a === 'save') {
        set.name = $('#setname', el).value.trim().slice(0, 18) || 'My pieces';
        if (!KINDS.some(([k]) => set.s[k] && set.s[k].length)) return toast('Draw at least one piece first');
        for (const [k] of KINDS) if (set.s[k] && !set.s[k].length) delete set.s[k];
        const i = sets.findIndex(x => x.id === set.id);
        if (i < 0) sets.push(set); else sets[i] = set;
        Store.data.settings.pieces = PIECES.use(set.id, sets);
        Store.save(); toast('“' + set.name + '” is your piece style now' + (KINDS.every(([k]) => set.s[k]) ? '' : ' (pieces you didn’t draw look Classic)'));
        App.back('settings');
      }
    });
    drawAll();
  }

  root.PieceEditor = { screen, MAX_SETS };
})(typeof self !== 'undefined' ? self : this);
