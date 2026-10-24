/* Rooftop Chess – shared app pieces: saved data, small UI helpers, avatars, the engine threads, the bots */
(function (root) {
  'use strict';
  const KEY = 'rooftop-chess.v1';
  const randHex = n => { const a = new Uint8Array(n); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };

  /* ---------- saved data (this device) ---------- */
  const DEFAULT_SETTINGS = { board: 'grass', sound: true, dests: true, coords: true, lastMove: true, autoQueen: false, premoves: true, anim: 200, theme: 'dark', server: '', confirmResign: true, bigClock: false, evalBar: true, botChat: true, vibrate: true };
  function blank() {
    return { v: 1, profile: { token: randHex(24), name: '', face: Math.floor(Math.random() * 1e9), created: Date.now() }, settings: Object.assign({}, DEFAULT_SETTINGS),
      puzzles: Object.assign(Rating.fresh(), { seen: {}, solved: 0, failed: 0, streak: 0, bestStreak: 0, log: [] }), rush: { best: 0, runs: 0 }, games: [], beaten: {}, botRating: Rating.fresh(),
      online: { id: '', ratings: {} }, lessons: {}, drills: {}, current: null };
  }
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
  if (!data || data.v !== 1) data = blank();
  data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  const fill = blank(); for (const k in fill) if (data[k] == null) data[k] = fill[k];
  let saveT = null;
  const write = () => { saveT = null; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
  const Store = {
    get data() { return data; },
    save(now) { clearTimeout(saveT); if (now) write(); else saveT = setTimeout(write, 150); },
    reset() { data = blank(); this.save(true); },
    addGame(rec) { data.games.unshift(rec); if (data.games.length > 150) data.games.length = 150; this.save(); },
    /* rating history for the graph on the Me tab. kind: 'puzzle' | 'bullet' | 'blitz' | 'rapid' */
    logRating(kind, r) { const log = data.ratingLog || (data.ratingLog = []); log.push({ t: Date.now(), k: kind, r: Math.round(r) }); if (log.length > 600) log.splice(0, log.length - 600); this.save(); },
  };

  // phones may close the app any moment after it's hidden: write anything still waiting
  const flush = () => { if (saveT) { clearTimeout(saveT); write(); } };
  if (root.addEventListener) { root.addEventListener('pagehide', flush); root.addEventListener('visibilitychange', () => { if (root.document && root.document.hidden) flush(); }); }

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
    const close = () => { if (!wrap.isConnected) return; wrap.classList.remove('on'); wrap.style.pointerEvents = 'none'; setTimeout(() => wrap.remove(), 200);   // taps go through while it fades
      sheetStack = sheetStack.filter(s => s.wrap !== wrap); if (opts.onClose) opts.onClose(); };
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

  /* ---------- avatars: faces drawn from a set of features, or a photo ---------- */
  const BG = ['#f6a04d', '#6cc4a1', '#7aa7f0', '#e27fa7', '#b18cf0', '#f2cc5b', '#5fc2d9', '#ef7b6b', '#9bcf6b', '#c99a6b', '#8aa0b8', '#e8a0d0'];
  const SKIN = ['#f5d2b5', '#e9b48f', '#c98d66', '#9b6544', '#6d4630', '#f1c9a5'];
  const HAIR = ['#2b2018', '#5a3a22', '#c8802e', '#e6c46a', '#a33b2e', '#3d3d48', '#e9e9e9', '#6b4bb3'];
  const SHIRT = ['#3b6fd8', '#e2544b', '#2f9e6e', '#f2a93b', '#7c4dbd', '#2b2f36', '#e8e8e8', '#c2185b', '#0f8b8d', '#6d4c41'];
  const IRIS = ['#5b3a1e', '#2f6b9a', '#3c7a3a', '#3b2a20'];
  /* a lighter (f > 0) or darker (f < 0) version of a #rrggbb color */
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), t = f < 0 ? 0 : 255, p = Math.abs(f);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round((t - x) * p + x));
    return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1);
  }
  /* o: { bg, skin (0-5), hair (0-7 color), style (0-8: bald, short, long, bun, spiky, swept, curly, bob, afro), eyes (0-3: plain,
     happy, big, stern), mouth (0-3: smile, flat, oh, grin), acc (0-7: none, glasses, cap, crown, headphones, bow, earrings, beanie),
     and optionally shirt, brows (0-2), nose (0-2), beard (0-3: none, stubble, mustache, full), iris (0-3), age (0/1), freckles } */
  function face(o) {
    const sk = SKIN[(o.skin || 0) % 6], skD = shade(sk, -0.16), skDD = shade(sk, -0.32);
    const hc = HAIR[(o.hair || 0) % 8], hD = shade(hc, -0.28), hL = shade(hc, 0.35);
    const bg = typeof o.bg === 'string' ? o.bg : BG[(o.bg || 0) % BG.length];
    const shirt = typeof o.shirt === 'string' ? o.shirt : SHIRT[(o.shirt != null ? o.shirt : (o.bg || 0) + 3) % SHIRT.length];
    const style = (o.style || 0) % 9, acc = (o.acc || 0) % 8, eyes = (o.eyes || 0) % 4, iris = IRIS[(o.iris || 0) % 4];
    const brows = o.brows != null ? o.brows % 3 : eyes === 3 ? 2 : eyes === 2 ? 1 : 0, beard = (o.beard || 0) % 4;
    const P = (d, fill, extra) => '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>';
    const S = (d, stroke, w, extra) => '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>';
    let s = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="22" fill="' + bg + '"/>' +
      '<circle cx="24" cy="18" r="46" fill="#fff" opacity=".1"/><circle cx="86" cy="96" r="30" fill="#000" opacity=".06"/>';
    // hair that falls behind the head
    if (style === 2) s += P('M26 46c0-17 10-27 24-27s24 10 24 27v30c0 6-4 9-10 9H36c-6 0-10-3-10-9z', hD);
    if (style === 7) s += P('M27 45c0-15 10-24 23-24s23 9 23 24v20c0 4-3 6-7 6H34c-4 0-7-2-7-6z', hD);
    if (style === 8) s += '<circle cx="50" cy="40" r="27" fill="' + hc + '"/>' + '<circle cx="50" cy="40" r="27" fill="#000" opacity=".12"/>';
    // shoulders, shirt and collar
    s += P('M8 100c2-15 17-23 42-23s40 8 42 23z', shirt) + P('M50 77c-25 0-40 8-42 23h12c2-10 13-16 30-17z', '#000', ' opacity=".1"') +
      S('M41 78l9 8 9-8', shade(shirt, -0.3), 2.2) + P('M44 79l6 6 6-6z', sk, ' opacity=".9"');
    // neck with the chin's shadow
    s += P('M42 63h16v13c0 4-16 4-16 0z', sk) + P('M42 66c5 4 11 4 16 0v-3H42z', '#000', ' opacity=".13"');
    // ears
    for (const x of [29, 71]) s += '<ellipse cx="' + x + '" cy="51" rx="4.6" ry="6.2" fill="' + sk + '"/><ellipse cx="' + x + '" cy="51.5" rx="2.1" ry="3.5" fill="' + skD + '"/>';
    // head, with shading on one side and under the hair
    s += P('M29 46c0-14 9-23 21-23s21 9 21 23v6c0 13-9 21-21 21s-21-8-21-21z', sk) +
      P('M71 48c0 15-8 24-21 25 9-4 15-12 16-25z', '#000', ' opacity=".07"') + '<ellipse cx="44" cy="35" rx="9" ry="5" fill="#fff" opacity=".12"/>';
    // cheeks and freckles
    s += '<circle cx="37" cy="59" r="4.2" fill="#ec8577" opacity=".28"/><circle cx="63" cy="59" r="4.2" fill="#ec8577" opacity=".28"/>';
    if (o.freckles) for (const [x, y] of [[36, 56], [39, 58], [34, 59], [61, 58], [64, 56], [66, 59]]) s += '<circle cx="' + x + '" cy="' + y + '" r=".75" fill="' + skDD + '" opacity=".7"/>';
    if (o.age) s += S('M41 33q9-2 18 0M43 37q7-1.5 14 0', skDD, 1, ' opacity=".45"') + S('M33 52l-2 1.5M67 52l2 1.5M42 61q-2 3-1 6M58 61q2 3 1 6', skDD, 1, ' opacity=".5"');
    // eyes
    for (const [x, d] of [[41, -1], [59, 1]]) {
      if (eyes === 1) s += S('M' + (x - 4) + ' 50q4-4.5 8 0', '#2a1d16', 2.4);
      else {
        const r = eyes === 2 ? 4.7 : 3.9;
        s += '<ellipse cx="' + x + '" cy="50" rx="' + r + '" ry="' + (eyes === 2 ? 4.7 : 3.4) + '" fill="#fff"/>' +
          '<circle cx="' + (x + d * 0.3) + '" cy="50.4" r="' + (eyes === 2 ? 3 : 2.4) + '" fill="' + iris + '"/>' +
          '<circle cx="' + (x + d * 0.3) + '" cy="50.4" r="' + (eyes === 2 ? 1.6 : 1.2) + '" fill="#141414"/>' +
          '<circle cx="' + (x + d * 0.3 + 1) + '" cy="49.2" r="' + (eyes === 2 ? 1 : 0.75) + '" fill="#fff"/>';
        if (eyes === 3) s += P('M' + (x - r - 0.5) + ' 50.2a' + (r + 0.5) + ' 4 0 0 1 ' + (2 * r + 1) + ' 0v-5h-' + (2 * r + 1) + 'z', sk) + S('M' + (x - r) + ' 50.2h' + 2 * r, '#2a1d16', 1.5);
        else s += S('M' + (x - r) + ' 49q' + r + '-' + (eyes === 2 ? 5.6 : 4.4) + ' ' + 2 * r + ' 0', '#2a1d16', 1.3);
      }
    }
    // eyebrows
    const bw = 2.3, bc = (o.hair || 0) % 8 === 6 ? '#b9b9b9' : hD;
    if (brows === 0) s += S('M36 43q5-3 10-0.5M54 42.5q5-2.5 10 0.5', bc, bw);
    else if (brows === 1) s += S('M36 41.5q5-4 10-1.5M54 40q5-2.5 10 1.5', bc, bw);
    else s += S('M36 41.5l10 2.5M64 41.5l-10 2.5', bc, bw + 0.3);
    // nose
    const nose = (o.nose || 0) % 3;
    if (nose === 0) s += S('M50.5 51c-.5 3-2 5.5-3 6.5 1.6 1 4 1 5.5 0', skDD, 1.4, ' opacity=".8"');
    else if (nose === 1) s += '<ellipse cx="50" cy="57.5" rx="3.2" ry="2.2" fill="' + skD + '"/><circle cx="48.6" cy="57" r=".6" fill="#fff" opacity=".5"/>';
    else s += S('M50 50v7.5M47.4 58.4q2.6 1.6 5.2 0', skDD, 1.4, ' opacity=".8"');
    // facial hair (under the mouth so the mouth shows)
    if (beard === 1) s += P('M33 56c1 10 8 16 17 16s16-6 17-16c-3 6-8 9-17 9s-14-3-17-9z', hD, ' opacity=".35"');
    if (beard === 3) s += P('M30 52c0 14 8 22 20 22s20-8 20-22c-2 6-5 8-8 8-3-3-7-4-12-4s-9 1-12 4c-3 0-6-2-8-8z', hc) + P('M44 66q6-3 12 0q-6 4-12 0z', skD);
    // mouth
    const lip = '#7a2f2a', mouth = (o.mouth || 0) % 4;
    if (mouth === 0) s += S('M43 63q7 6.5 14 0', lip, 2.4);
    else if (mouth === 1) s += S('M44.5 64h11', lip, 2.4);
    else if (mouth === 2) s += '<ellipse cx="50" cy="64.5" rx="4.6" ry="3.8" fill="' + lip + '"/><ellipse cx="50" cy="66.2" rx="2.8" ry="1.6" fill="#e0717a"/>';
    else s += P('M41.5 61.5q8.5 11 17 0z', lip) + P('M43.5 62h13l-.8 2h-11.4z', '#fff');
    if (beard === 2) s += P('M41 61c3-3 6-3.5 9-1.5 3-2 6-1.5 9 1.5-3 .5-6 0-9-1-3 1-6 1.5-9 1z', hc);
    // hair in front
    const hl = S('M36 30q8-6 18-5', hL, 2, ' opacity=".55"');
    switch (style) {
      case 0: s += P('M30 42c1-12 9-19 20-19s19 7 20 19c-4-7-11-10-20-10s-16 3-20 10z', hc, ' opacity=".45"'); break;
      case 1: s += P('M28 45c-1-15 9-24 22-24s23 9 22 24c-2-6-5-9-8-10-7 2-18 3-28 0-3 2-6 5-8 10z', hc) + hl; break;
      case 2: s += P('M27 46c0-16 10-25 23-25s23 9 23 25c-5-9-11-13-17-14-2 4-8 7-15 8-6 1-10 3-14 6z', hc) + hl; break;
      case 3: s += '<circle cx="50" cy="18" r="8.5" fill="' + hc + '"/><circle cx="47.5" cy="15.5" r="3" fill="' + hL + '" opacity=".45"/>' + P('M28 44c1-14 10-22 22-22s21 8 22 22c-6-6-13-9-22-9s-16 3-22 9z', hc) + hl; break;
      case 4: s += P('M28 44l2-14 6 6 3-12 6 8 5-11 5 11 6-8 3 12 6-6 2 14c-7-5-14-7-22-7s-15 2-22 7z', hc); break;
      case 5: s += P('M27 47c-3-16 8-26 23-26 14 0 25 9 22 26-3-8-7-12-12-13-5 7-17 10-27 7-3 1-5 3-6 6z', hc) + hl; break;
      case 6: for (const [x, y, r] of [[31, 40, 6], [35, 31, 6.5], [43, 25, 7], [52, 23, 7], [61, 26, 6.5], [67, 33, 6], [70, 41, 5.5], [40, 34, 5], [56, 31, 5]]) s += '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + hc + '"/>'; s += hl; break;
      case 7: s += P('M27 52c-2-19 9-30 23-30s25 11 23 30c-3-7-6-10-9-11 1-5-1-8-3-10-6 3-17 5-26 3-4 4-7 10-8 18z', hc) + hl; break;
      case 8: for (const [x, y] of [[30, 38], [35, 29], [43, 23], [52, 22], [61, 25], [68, 31], [71, 40]]) s += '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + hc + '"/>'; break;
    }
    // accessories
    if (acc === 1) s += '<g fill="none" stroke="#1c1c1c" stroke-width="2.2"><circle cx="41" cy="50" r="6.6"/><circle cx="59" cy="50" r="6.6"/><path d="M47.6 49.5q2.4-1.6 4.8 0M34.4 49l-5-1.5M65.6 49l5-1.5"/></g><path d="M37 46q3-2 6-1M55 46q3-2 6-1" stroke="#fff" stroke-width="1.2" fill="none" opacity=".5"/>';
    if (acc === 2) s += P('M28 38c1-11 10-18 22-18s21 7 22 18z', '#3b6fd8') + P('M26 37h48c3 0 4 3 1 4H25c-3-1-2-4 1-4z', '#2a57b8') + '<circle cx="50" cy="19.5" r="2.6" fill="#f2f2f2"/>' + S('M40 23q10-4 20 0', '#fff', 1.4, ' opacity=".35"');
    if (acc === 3) s += P('M32 30l6 7 12-13 12 13 6-7-3 12H35z', '#f2c14e', ' stroke="#b98a1e" stroke-width="1.4"') + '<circle cx="50" cy="28" r="2.4" fill="#e2544b"/><circle cx="38" cy="36" r="1.6" fill="#4f8fe0"/><circle cx="62" cy="36" r="1.6" fill="#4f8fe0"/>';
    if (acc === 4) s += S('M25 52a25 25 0 0 1 50 0', '#2c2c2c', 4.2) + '<rect x="20" y="46" width="9" height="16" rx="4.5" fill="#e2544b"/><rect x="71" y="46" width="9" height="16" rx="4.5" fill="#e2544b"/><rect x="22" y="49" width="3" height="10" rx="1.5" fill="#fff" opacity=".3"/>';
    if (acc === 5) s += P('M60 27l10-8 2 12z M60 27l-9-7-2 11z', '#e2544b') + '<circle cx="60" cy="27" r="3" fill="#b93b33"/>';
    if (acc === 6) s += '<circle cx="29" cy="59" r="2.1" fill="#f2c14e"/><circle cx="71" cy="59" r="2.1" fill="#f2c14e"/>';
    if (acc === 7) s += P('M27 42c0-13 10-21 23-21s23 8 23 21z', '#e2544b') + '<rect x="26" y="37" width="48" height="7" rx="3.5" fill="#b93b33"/><circle cx="50" cy="19" r="3.4" fill="#f2f2f2"/>';
    return s + '</svg>';
  }
  /* a face of its own for every player (the seed is a number saved on their device) */
  function faceParams(seed) {
    let x = (seed >>> 0) || 1; const r = n => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % n; };
    const o = { bg: r(12), skin: r(6), hair: r(8), style: r(9), eyes: r(4), mouth: r(4), acc: r(5) === 0 ? 1 + r(7) : 0 };
    return Object.assign(o, { shirt: r(10), brows: r(3), nose: r(3), iris: r(4), beard: r(6) === 0 ? 1 + r(3) : 0, freckles: r(5) === 0 });
  }
  const faceFromSeed = seed => face(faceParams(seed));
  /* a player's picture: their photo if they have one (only ever on this device), else their face */
  function avatarHtml(p, size) {
    const w = 'width:' + (size || 36) + 'px;height:' + (size || 36) + 'px';
    if (p && p.img && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.img)) return '<span class="av" style="' + w + '"><img src="' + p.img + '" alt=""></span>';
    const svg = p && p.faceSvg ? p.faceSvg : faceFromSeed(p && p.face != null ? p.face : 7);
    return '<span class="av" style="' + w + '">' + svg + '</span>';
  }
  /* pick a picture from the phone and make it a small square (center crop, 160 px) – for your icon and your bots' */
  function pickImage() {
    return new Promise(res => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0]; if (!f) return res(null);
        const fail = () => { toast('That picture couldn’t be opened'); res(null); };
        // read it as a data: URL (the app's security policy doesn't allow blob: images)
        const rd = new FileReader();
        rd.onerror = fail;
        rd.onload = () => {
          const img = new Image();
          img.onload = () => {
            const n = 160, c = document.createElement('canvas'); c.width = c.height = n;
            const side = Math.min(img.width, img.height), ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, n, n);   // see-through pictures get a white background
            ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, n, n);
            res(c.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = fail;
          img.src = rd.result;
        };
        rd.readAsDataURL(f);
      };
      input.click();
    });
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
    { id: 'pip', name: 'Pip', rating: 250, blurb: 'Just learned how the horsey moves. Thinks every piece is a snack.', face: { bg: 5, skin: 0, hair: 3, style: 3, eyes: 2, mouth: 3, acc: 0, shirt: 3, freckles: true, nose: 1, iris: 1 }, level: BotPlay.LEVELS.pip },
    { id: 'juniper', name: 'Juniper', rating: 450, blurb: 'Plays fast, loves attacking, forgets to defend.', face: { bg: 1, skin: 1, hair: 2, style: 2, eyes: 0, mouth: 0, acc: 5, shirt: 1, freckles: true, iris: 2 }, level: BotPlay.LEVELS.juniper },
    { id: 'otto', name: 'Otto', rating: 650, blurb: 'A retired postman who plays in the park every Sunday.', face: { bg: 2, skin: 0, hair: 6, style: 0, eyes: 0, mouth: 0, acc: 1, shirt: 0, beard: 2, age: 1, nose: 2, iris: 1 }, level: BotPlay.LEVELS.otto },
    { id: 'mabel', name: 'Mabel', rating: 850, blurb: 'Knows the openings by name. The middle of the game, less so.', face: { bg: 3, skin: 2, hair: 0, style: 7, eyes: 1, mouth: 0, acc: 6, shirt: 4, nose: 0 }, level: BotPlay.LEVELS.mabel },
    { id: 'ravi', name: 'Ravi', rating: 1050, blurb: 'School chess club captain. Spots forks from a mile away.', face: { bg: 4, skin: 3, hair: 0, style: 6, eyes: 0, mouth: 3, acc: 4, shirt: 8, brows: 1 }, level: BotPlay.LEVELS.ravi },
    { id: 'selma', name: 'Selma', rating: 1250, blurb: 'Solid and patient. Waits for you to make the mistake.', face: { bg: 6, skin: 1, hair: 4, style: 5, eyes: 0, mouth: 1, acc: 0, shirt: 2, iris: 2, nose: 0 }, level: BotPlay.LEVELS.selma },
    { id: 'hector', name: 'Hector', rating: 1450, blurb: 'Café regular. Plays the King’s Gambit and dares you to take it.', face: { bg: 7, skin: 4, hair: 1, style: 1, eyes: 0, mouth: 0, acc: 0, shirt: 9, beard: 3, brows: 1, nose: 1 }, level: BotPlay.LEVELS.hector },
    { id: 'yuki', name: 'Yuki', rating: 1650, blurb: 'Studies endgames on the train. Will grind you down.', face: { bg: 8, skin: 5, hair: 0, style: 7, eyes: 0, mouth: 1, acc: 1, shirt: 5, iris: 3 }, level: BotPlay.LEVELS.yuki },
    { id: 'dmitri', name: 'Dmitri', rating: 1900, blurb: 'Club champion three years running. Calculates everything.', face: { bg: 10, skin: 0, hair: 5, style: 1, eyes: 3, mouth: 1, acc: 0, shirt: 5, beard: 1, brows: 2, nose: 2, iris: 1 }, level: BotPlay.LEVELS.dmitri },
    { id: 'wren', name: 'Wren', rating: 2100, blurb: 'A titled player who streams blitz at 3am.', face: { bg: 9, skin: 2, hair: 7, style: 5, eyes: 1, mouth: 3, acc: 4, shirt: 7 }, level: BotPlay.LEVELS.wren },
    { id: 'atlas', name: 'Atlas', rating: 2350, blurb: 'Calculates deep and almost never blunders.', face: { bg: '#2b2f36', skin: 0, hair: 5, style: 0, eyes: 3, mouth: 1, acc: 1, shirt: '#46536a', brows: 2, nose: 2 }, level: BotPlay.LEVELS.atlas },
    { id: 'titan', name: 'Titan', rating: 2800, blurb: 'The engine at full strength – the hardest opponent here.', face: { bg: '#1b2433', skin: 2, hair: 6, style: 4, eyes: 3, mouth: 1, acc: 3, shirt: '#c9a227', brows: 2, beard: 1 }, level: BotPlay.LEVELS.titan },
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
    titan: { hello: 'Full power. Let’s see what you’ve got.', gotcha: 'Calculated.', ouch: 'Interesting choice…', check: 'Check.', win: 'As expected.', lose: 'Incredible. You beat the full engine!', draw: 'A draw against me is a great result.' },
  };
  for (const b of BOTS) { b.faceSvg = face(b.face); b.isBot = true; b.chat = CHAT[b.id]; }

  /* ---------- your own bots: up to 3, kept on this device, so only you can play them ---------- */
  const MAX_MY_BOTS = 3;
  const MY_CHAT = { hello: 'Good luck – I’m ready!', gotcha: 'Got it!', ouch: 'Nice one.', check: 'Check!', win: 'Good game!', lose: 'Well played – you got me.', draw: 'A draw. Good game!' };
  const okImg = x => typeof x === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x);
  /* where a rating sits among the bots, in words */
  function describeElo(elo) {
    const by = BOTS.slice().sort((a, b) => a.rating - b.rating), top = by[by.length - 1], same = by.find(b => Math.abs(b.rating - elo) <= 25);
    if (same) return 'Plays like ' + same.name + '.';
    if (elo < by[0].rating) return 'Weaker than ' + by[0].name + ' – blunders a lot.';
    if (elo > top.rating) return 'Stronger than ' + top.name + ': thinks up to ' + Math.round(BotPlay.forElo(elo).time / 1000) + ' s a move. The strongest player here.';
    const hi = by.find(b => b.rating > elo), lo = by[by.indexOf(hi) - 1];
    return 'Between ' + lo.name + ' (' + lo.rating + ') and ' + hi.name + ' (' + hi.rating + ').';
  }
  /* a saved bot { id, name, elo, img | face } → one you can play */
  function playable(b) {
    const elo = Math.max(BotPlay.MIN_ELO, Math.min(BotPlay.MAX_ELO, Math.round(b.elo)));
    return { id: b.id, name: b.name, rating: elo, blurb: 'Your bot. ' + describeElo(elo), faceSvg: okImg(b.img) ? '<img src="' + b.img + '" alt="">' : face(b.face || {}),
      level: BotPlay.forElo(elo), chat: MY_CHAT, isBot: true, mine: true };
  }
  const MyBots = {
    MAX: MAX_MY_BOTS, describeElo, okImg,
    saved() { return Store.data.myBots || (Store.data.myBots = []); },
    list() { return this.saved().map(playable); },
    save(b) {
      const list = this.saved(), i = list.findIndex(x => x.id === b.id);
      if (i < 0 && list.length >= MAX_MY_BOTS) return false;
      const clean = { id: b.id || 'my-' + randHex(4), name: String(b.name || 'My bot').trim().slice(0, 16) || 'My bot', elo: Math.max(BotPlay.MIN_ELO, Math.min(BotPlay.MAX_ELO, Math.round(+b.elo || 1200))),
        img: okImg(b.img) ? b.img : null, face: okImg(b.img) ? null : b.face || { bg: 0 } };
      if (i < 0) list.push(clean); else list[i] = clean;
      Store.save(); return clean;
    },
    remove(id) { Store.data.myBots = this.saved().filter(x => x.id !== id); Store.save(); },
  };
  /* any bot by id: the built-in ones, then yours */
  const findBot = id => BOTS.find(b => b.id === id) || MyBots.list().find(b => b.id === id) || null;

  root.UI = { esc, $, $$, toast, sheet, closeSheet, confirmBox, fmtClock, ago, copy, avatarHtml, face, faceFromSeed, faceParams, pickImage };
  root.Store = Store; root.engine = engine; root.BOTS = BOTS; root.MyBots = MyBots; root.findBot = findBot; root.randHex = randHex;
})(typeof self !== 'undefined' ? self : this);
