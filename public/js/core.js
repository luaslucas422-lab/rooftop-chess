/* Rooftop Chess – shared app pieces: saved data, small UI helpers, avatars, the engine threads, the bots */
(function (root) {
  'use strict';
  const KEY = 'rooftop-chess.v1';
  const randHex = n => { const a = new Uint8Array(n); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };

  /* ---------- saved data (this device) ---------- */
  const DEFAULT_SETTINGS = { board: 'grass', sound: true, dests: true, coords: true, lastMove: true, autoQueen: false, premoves: true, anim: 200, theme: 'dark', server: '', confirmResign: true, bigClock: false, evalBar: true, botChat: true, vibrate: true };
  function blank() {
    return { v: 1, profile: { token: randHex(24), name: '', face: Math.floor(Math.random() * 1e9), created: Date.now() }, settings: Object.assign({}, DEFAULT_SETTINGS),
      puzzles: Object.assign(Rating.fresh(), { seen: {}, solved: 0, failed: 0, streak: 0, bestStreak: 0, log: [] }), rush: { best: 0, runs: 0 }, games: [], beaten: {},
      online: { id: '', ratings: {} }, lessons: {}, drills: {}, current: null };
  }
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || data.v !== 1) data = blank();
  data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  const fill = blank(); for (const k in fill) if (data[k] == null) data[k] = fill[k];
  let saveT = null;
  const Store = {
    get data() { return data; },
    save(now) { clearTimeout(saveT); const w = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }; if (now) w(); else saveT = setTimeout(w, 150); },
    reset() { data = blank(); this.save(true); },
    addGame(rec) { data.games.unshift(rec); if (data.games.length > 150) data.games.length = 150; this.save(); },
  };

  /* ---------- tiny UI helpers ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => [...(el || document).querySelectorAll(sel)];
  let toastT = null;
  function toast(msg, ms) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2600);
  }
  /* bottom sheet / dialog. Returns the sheet element; close with UI.close() */
  let sheetStack = [];
  function sheet(html, opts) {
    opts = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap' + (opts.center ? ' center' : '');
    wrap.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + (opts.noClose ? '' : '<button class="sheet-x" aria-label="Close">✕</button>') + html + '</div>';
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('on'));
    const close = () => { if (!wrap.isConnected) return; wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); sheetStack = sheetStack.filter(s => s.wrap !== wrap); if (opts.onClose) opts.onClose(); };
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap && !opts.noClose) close(); });
    const x = $('.sheet-x', wrap); if (x) x.onclick = close;
    sheetStack.push({ wrap, close });
    wrap.close = close;
    return wrap;
  }
  function closeSheet() { const s = sheetStack[sheetStack.length - 1]; if (s) { s.close(); return true; } return false; }
  function confirmBox(title, text, yes, no) {
    return new Promise(res => {
      const s = sheet('<h3>' + esc(title) + '</h3>' + (text ? '<p class="muted">' + esc(text) + '</p>' : '') + '<div class="row gap"><button class="btn ghost" data-no>' + esc(no || 'Cancel') + '</button><button class="btn primary" data-yes>' + esc(yes || 'OK') + '</button></div>', { center: true, onClose: () => res(false) });
      $('[data-yes]', s).onclick = () => { res(true); s.close(); };
      $('[data-no]', s).onclick = () => { res(false); s.close(); };
    });
  }
  function fmtClock(ms) {
    ms = Math.max(0, ms);
    if (ms < 20000) { const s = Math.floor(ms / 100) / 10; return '0:' + (s < 10 ? '0' : '') + s.toFixed(1); }
    const t = Math.ceil(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
  }
  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago'; return new Date(t).toLocaleDateString();
  }
  async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (x) { toast('Could not copy'); } ta.remove(); } }

  /* ---------- avatars: little faces drawn from a few features ---------- */
  const BG = ['#f6a04d', '#6cc4a1', '#7aa7f0', '#e27fa7', '#b18cf0', '#f2cc5b', '#5fc2d9', '#ef7b6b', '#9bcf6b', '#c99a6b', '#8aa0b8', '#e8a0d0'];
  const SKIN = ['#f5d2b5', '#e9b48f', '#c98d66', '#9b6544', '#6d4630', '#f1c9a5'];
  const HAIR = ['#2b2018', '#5a3a22', '#c8802e', '#e6c46a', '#a33b2e', '#3d3d48', '#f2f2f2', '#6b4bb3'];
  function face(o) {
    // o: { bg, skin, hair, style (0-5), eyes (0-3), mouth (0-3), acc (0-5) }
    const s = SKIN[o.skin % SKIN.length], hc = HAIR[o.hair % HAIR.length], bg = typeof o.bg === 'string' ? o.bg : BG[o.bg % BG.length];
    let hairBack = '', hairFront = '';
    switch (o.style % 6) {
      case 1: hairFront = '<path d="M27 44c0-16 10-25 23-25s23 9 23 25c-5-7-13-11-23-11s-18 4-23 11z" fill="' + hc + '"/>'; break;
      case 2: hairBack = '<path d="M24 50c0-20 11-31 26-31s26 11 26 31v24H24z" fill="' + hc + '"/>'; hairFront = '<path d="M28 42c3-13 11-19 22-19s19 6 22 19c-8-5-14-7-22-7s-14 2-22 7z" fill="' + hc + '"/>'; break;
      case 3: hairFront = '<circle cx="50" cy="19" r="8" fill="' + hc + '"/><path d="M28 42c2-13 10-20 22-20s20 7 22 20c-6-6-13-8-22-8s-16 2-22 8z" fill="' + hc + '"/>'; break;
      case 4: hairFront = '<path d="M30 30l6 8 6-12 8 11 8-11 6 12 6-8 2 14H28z" fill="' + hc + '"/>'; break;
      case 5: hairFront = '<path d="M26 46c-2-18 9-27 24-27 16 0 26 10 24 27-4-10-8-13-12-14-4 6-17 8-26 4-4 2-7 5-10 10z" fill="' + hc + '"/>'; break;
      default: break;
    }
    const eyes = ['<circle cx="41" cy="50" r="3.2" fill="#231b15"/><circle cx="59" cy="50" r="3.2" fill="#231b15"/>',
      '<path d="M37 50q4-4 8 0M55 50q4-4 8 0" stroke="#231b15" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
      '<circle cx="41" cy="50" r="4.2" fill="#fff"/><circle cx="59" cy="50" r="4.2" fill="#fff"/><circle cx="42" cy="51" r="2.3" fill="#231b15"/><circle cx="60" cy="51" r="2.3" fill="#231b15"/>',
      '<path d="M37 49h8M55 49h8" stroke="#231b15" stroke-width="2.8" stroke-linecap="round"/>'][o.eyes % 4];
    const mouth = ['<path d="M43 61q7 6 14 0" stroke="#231b15" stroke-width="2.6" fill="none" stroke-linecap="round"/>',
      '<path d="M44 62h12" stroke="#231b15" stroke-width="2.6" stroke-linecap="round"/>',
      '<ellipse cx="50" cy="62" rx="4.5" ry="3.6" fill="#7a2f2a"/>',
      '<path d="M42 60q8 9 16 0z" fill="#7a2f2a"/>'][o.mouth % 4];
    const acc = ['',
      '<g fill="none" stroke="#1c1c1c" stroke-width="2.4"><circle cx="41" cy="50" r="6.5"/><circle cx="59" cy="50" r="6.5"/><path d="M47.5 50h5"/></g>',
      '<path d="M29 37c2-11 10-17 21-17s19 6 21 17z" fill="#3b6fd8"/><rect x="27" y="35" width="46" height="6" rx="3" fill="#2a57b8"/><circle cx="50" cy="19" r="4" fill="#f2f2f2"/>',
      '<path d="M33 30l6 7 11-12 11 12 6-7-3 12H36z" fill="#f2c14e" stroke="#b98a1e" stroke-width="1.5"/>',
      '<path d="M26 52a24 24 0 0 1 48 0" fill="none" stroke="#2c2c2c" stroke-width="4"/><rect x="21" y="48" width="8" height="14" rx="4" fill="#e2544b"/><rect x="71" y="48" width="8" height="14" rx="4" fill="#e2544b"/>',
      '<path d="M60 28l9-7 2 11z M60 28l-9-7-2 11z" fill="#e2544b"/><circle cx="60" cy="28" r="3" fill="#b93b33"/>'][o.acc % 6];
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="' + bg + '"/>' + hairBack +
      '<path d="M30 100c0-14 9-22 20-22s20 8 20 22z" fill="' + s + '" opacity=".9"/><ellipse cx="50" cy="52" rx="20" ry="22" fill="' + s + '"/>' +
      '<circle cx="35" cy="58" r="3.5" fill="#e98b7d" opacity=".35"/><circle cx="65" cy="58" r="3.5" fill="#e98b7d" opacity=".35"/>' + hairFront + eyes + mouth + acc + '</svg>';
  }
  function faceFromSeed(seed) { let x = (seed >>> 0) || 1; const r = n => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % n; };
    return face({ bg: r(12), skin: r(6), hair: r(8), style: r(6), eyes: r(4), mouth: r(4), acc: r(6) === 0 ? 1 + r(5) : 0 }); }
  /* a board-piece avatar for people who'd rather not have a face */
  function avatarHtml(p, size) {
    const svg = p && p.faceSvg ? p.faceSvg : faceFromSeed(p && p.face != null ? p.face : 7);
    return '<span class="av" style="width:' + (size || 36) + 'px;height:' + (size || 36) + 'px">' + svg + '</span>';
  }

  /* ---------- the engine threads ---------- */
  class EngineClient {
    constructor() { this.n = 0; this.pending = new Map(); this.spawn(); }
    spawn() {
      this.w = new Worker('js/engine-worker.js');
      this.w.onmessage = e => {
        const m = e.data, p = this.pending.get(m.id); if (!p) return;
        if (m.type === 'info') p.onInfo && p.onInfo(m);
        else if (m.type === 'progress') p.onProgress && p.onProgress(m);
        else { this.pending.delete(m.id); if (m.type === 'error') { console.error(m.error); p.resolve(null); } else p.resolve(m); }
      };
      this.w.onerror = e => { console.error('engine', e.message); };
    }
    request(cmd, payload, handlers) {
      return new Promise(resolve => {
        const id = ++this.n;
        this.pending.set(id, Object.assign({ resolve }, handlers || {}));
        this.w.postMessage(Object.assign({ id, cmd }, payload));
      });
    }
    get busy() { return this.pending.size > 0; }
    /* drop whatever it's doing (the thread is replaced, so this is instant) */
    stop() { if (!this.pending.size) return; this.w.terminate(); for (const p of this.pending.values()) p.resolve(null); this.pending.clear(); this.spawn(); }
  }
  const engines = {};
  const engine = name => engines[name] || (engines[name] = new EngineClient());

  /* ---------- the bots ---------- */
  const BOTS = [
    { id: 'pip', name: 'Pip', rating: 250, blurb: 'Just learned how the horsey moves. Thinks every piece is a snack.', face: { bg: 5, skin: 0, hair: 3, style: 3, eyes: 2, mouth: 3, acc: 0 }, level: BotPlay.LEVELS.pip },
    { id: 'juniper', name: 'Juniper', rating: 400, blurb: 'Plays fast, loves attacking, forgets to defend.', face: { bg: 1, skin: 1, hair: 2, style: 2, eyes: 0, mouth: 0, acc: 5 }, level: BotPlay.LEVELS.juniper },
    { id: 'otto', name: 'Otto', rating: 600, blurb: 'A retired postman who plays in the park every Sunday.', face: { bg: 2, skin: 0, hair: 6, style: 1, eyes: 3, mouth: 1, acc: 1 }, level: BotPlay.LEVELS.otto },
    { id: 'mabel', name: 'Mabel', rating: 800, blurb: 'Knows the openings by name. The middle of the game, less so.', face: { bg: 3, skin: 2, hair: 0, style: 2, eyes: 1, mouth: 0, acc: 0 }, level: BotPlay.LEVELS.mabel },
    { id: 'ravi', name: 'Ravi', rating: 1000, blurb: 'School chess club captain. Spots forks from a mile away.', face: { bg: 4, skin: 3, hair: 0, style: 4, eyes: 0, mouth: 0, acc: 4 }, level: BotPlay.LEVELS.ravi },
    { id: 'selma', name: 'Selma', rating: 1200, blurb: 'Solid and patient. Waits for you to make the mistake.', face: { bg: 6, skin: 1, hair: 4, style: 5, eyes: 2, mouth: 1, acc: 0 }, level: BotPlay.LEVELS.selma },
    { id: 'hector', name: 'Hector', rating: 1400, blurb: 'Café regular. Plays the King’s Gambit and dares you to take it.', face: { bg: 7, skin: 4, hair: 1, style: 1, eyes: 3, mouth: 0, acc: 0 }, level: BotPlay.LEVELS.hector },
    { id: 'yuki', name: 'Yuki', rating: 1600, blurb: 'Studies endgames on the train. Will grind you down.', face: { bg: 8, skin: 5, hair: 0, style: 2, eyes: 0, mouth: 1, acc: 1 }, level: BotPlay.LEVELS.yuki },
    { id: 'dmitri', name: 'Dmitri', rating: 1800, blurb: 'Club champion three years running. Calculates everything.', face: { bg: 10, skin: 0, hair: 5, style: 1, eyes: 3, mouth: 1, acc: 0 }, level: BotPlay.LEVELS.dmitri },
    { id: 'wren', name: 'Wren', rating: 2000, blurb: 'A titled player who streams blitz at 3am.', face: { bg: 9, skin: 2, hair: 7, style: 5, eyes: 1, mouth: 0, acc: 4 }, level: BotPlay.LEVELS.wren },
    { id: 'atlas', name: 'Atlas', rating: 2300, blurb: 'The engine at full strength. Good luck.', face: { bg: '#2b2f36', skin: 0, hair: 5, style: 0, eyes: 3, mouth: 1, acc: 3 }, level: BotPlay.LEVELS.atlas },
  ];
  /* what each bot says during a game: hello, gotcha (it took a piece), ouch (it lost one), check, win, lose, draw */
  const CHAT = {
    pip: { hello: 'Hi! I just learned how the horsey moves!', gotcha: 'Ooh, a snack!', ouch: 'Hey! I was using that!', check: 'Check! Is that how you say it?', win: 'I won?! Wait till I tell my mom!', lose: 'Good game! Can we play again?', draw: 'A tie! That’s like both of us winning!' },
    juniper: { hello: 'Let’s go! I’m attacking right away.', gotcha: 'Yoink!', ouch: 'Defending is boring anyway…', check: 'Check! Run, king, run!', win: 'Attack always wins!', lose: 'Next time I’ll attack faster.', draw: 'Huh. Nobody won.' },
    otto: { hello: 'Ah, a game in the park. Lovely day for it.', gotcha: 'Special delivery!', ouch: 'Oh dear, I didn’t see that one coming.', check: 'Check, if you please.', win: 'Just like the old days.', lose: 'Well played, young one.', draw: 'A fair result.' },
    mabel: { hello: 'Shall we begin? I know all the openings!', gotcha: 'Thank you kindly.', ouch: 'Hmm, that wasn’t in my book.', check: 'Check!', win: 'Theory prevails!', lose: 'I must study the middlegame more.', draw: 'A draw – very respectable.' },
    ravi: { hello: 'Good luck! Watch out for my knights.', gotcha: 'Fork-tastic.', ouch: 'Nice tactic!', check: 'Check.', win: 'Good game! Want to see where it turned?', lose: 'Great game – you outplayed me.', draw: 'Solid game.' },
    selma: { hello: 'Take your time. I’m patient.', gotcha: 'I was waiting for that.', ouch: 'Interesting.', check: 'Check.', win: 'Patience pays.', lose: 'Very well played.', draw: 'Balanced to the end.' },
    hector: { hello: 'Coffee’s ready. Let’s play!', gotcha: 'Merci!', ouch: 'Ah! You have teeth.', check: 'Check! Feel the pressure?', win: 'Another one for the café wall.', lose: 'Bravo! Next coffee’s on me.', draw: 'We shake hands, then.' },
    yuki: { hello: 'Let’s see how the endgame goes.', gotcha: 'Material is material.', ouch: 'Good find.', check: 'Check.', win: 'The endgame never lies.', lose: 'Impressive. You earned that.', draw: 'A fair fight.' },
    dmitri: { hello: 'I have calculated many games. Begin.', gotcha: 'As calculated.', ouch: '…I missed that.', check: 'Check.', win: 'The calculation was correct.', lose: 'Remarkable. I must recalculate.', draw: 'Equal. As expected.' },
    wren: { hello: 'gl hf!', gotcha: 'free piece, ty', ouch: 'oof, nice shot', check: 'check :)', win: 'gg wp', lose: 'gg, you’re cracked', draw: 'gg, peace' },
    atlas: { hello: 'Searching… ready.', gotcha: 'Evaluation improved.', ouch: 'Unexpected.', check: 'Check.', win: 'Checkmate was inevitable.', lose: 'I lost? Well played, human.', draw: 'Draw.' },
  };
  for (const b of BOTS) { b.faceSvg = face(b.face); b.isBot = true; b.chat = CHAT[b.id]; }

  root.UI = { esc, $, $$, toast, sheet, closeSheet, confirmBox, fmtClock, ago, copy, avatarHtml, face, faceFromSeed };
  root.Store = Store; root.engine = engine; root.BOTS = BOTS; root.randHex = randHex;
})(typeof self !== 'undefined' ? self : this);
