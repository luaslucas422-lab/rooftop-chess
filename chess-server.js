/* Rooftop Chess – online play: matchmaking, friend challenges, clocks, ratings, rematches and spectating.
   Every move is checked on the server with the same rules file the app uses (chess/js/chess.js).
   Players are known by a secret token kept on their device; only its hash is stored.
   Storage: Postgres when DATABASE_URL is set, otherwise a JSON file. Free hosting wipes that file whenever the
   server restarts, so each player's phone also keeps a "rating card" signed with CHESS_SECRET: after a restart the
   phone hands it back and the rating is restored. Nobody can make or edit a card without the secret. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Chess = require('./public/js/chess.js');
const Rating = require('./public/js/rating.js');

/* the app's own files, served at /chess/ */
const PUBLIC_DIR = path.join(__dirname, 'public');
/* the page may only run this app's own scripts (a guard in case something ever slips past the name filter) */
const CSP = "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss: https:; " +
  "manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
/* answer a request for /chess or /chess/... (url is the path without the query) */
function serveApp(req, res, url) {
  if (url === '/chess') { res.writeHead(301, { Location: '/chess/' }); res.end(); return; }
  let rel;
  try { rel = decodeURIComponent(url.slice('/chess/'.length)) || 'index.html'; } catch (e) { res.writeHead(400); res.end(); return; }   // a broken %-escape
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    const ext = path.extname(file);
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' || rel === 'sw.js' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' };
    if (ext === '.html') { headers['Content-Security-Policy'] = CSP; headers['Referrer-Policy'] = 'no-referrer'; }
    res.writeHead(200, headers);
    res.end(body);
  });
}

const TIME_CONTROLS = ['1+0', '1+1', '2+1', '3+0', '3+2', '5+0', '5+3', '10+0', '10+5', '15+10', '30+0'];
const FIRST_MOVE_MS = 30000;      // a player who doesn't make their first move in time: game aborted
const ABANDON_MS = 90000;         // gone this long during a game: it counts as a loss
const REMATCH_MS = 120000;
const LAG_CREDIT_MAX = 300;       // at most this much of a player's measured network delay is given back per move
const CHAT = ['Hi!', 'Good luck!', 'Have fun!', 'Nice move!', 'Oops', 'Thanks!', 'Good game!', 'Well played!', 'Rematch?', 'Thinking…'];
const now = () => Date.now();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const tcParse = s => { const [b, i] = String(s).split('+').map(Number); return { base: b * 60000, inc: i * 1000, label: s }; };

/* ---------- storage ---------- */
function fileStore(file) {
  let db = { players: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  db.players = db.players || {};
  let t = null; const save = () => { clearTimeout(t); t = setTimeout(() => { try { fs.writeFileSync(file, JSON.stringify(db)); } catch (e) {} }, 500); };
  return {
    kind: 'file', async init() {},
    async get(id) { return db.players[id] || null; },
    async put(p) { db.players[p.id] = p; save(); },
    async top(cat, n) { return Object.values(db.players).filter(p => p.ratings[cat] && p.ratings[cat].games > 0).sort((a, b) => b.ratings[cat].r - a.ratings[cat].r).slice(0, n); },
  };
}
function pgStore(url) {
  const { Pool } = require('pg');
  let host = ''; try { host = new URL(url).hostname; } catch (e) {}
  const pool = new Pool({ connectionString: url, ssl: /^(localhost|127\.0\.0\.1)$|^dpg-[a-z0-9]+-a$/.test(host) || process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
  return {
    kind: 'postgres',
    async init() { await pool.query('CREATE TABLE IF NOT EXISTS chess_players (id TEXT PRIMARY KEY, data JSONB NOT NULL)'); },
    async get(id) { const r = await pool.query('SELECT data FROM chess_players WHERE id=$1', [id]); return r.rows[0] ? r.rows[0].data : null; },
    async put(p) { await pool.query('INSERT INTO chess_players (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data', [p.id, p]); },
    async top(cat, n) {
      if (!/^(bullet|blitz|rapid)$/.test(cat)) return [];
      const r = await pool.query("SELECT data FROM chess_players WHERE (data->'ratings'->'" + cat + "'->>'games')::int > 0 ORDER BY (data->'ratings'->'" + cat + "'->>'r')::float DESC LIMIT $1", [n]);
      return r.rows.map(x => x.data);
    },
  };
}

function createChessServer(opts) {
  opts = opts || {};
  const cleanName = opts.cleanName || (s => String(s || '').replace(/[<>]/g, '').slice(0, 20));
  const dataFile = opts.dataFile || process.env.CHESS_DATA_FILE;
  const store = process.env.DATABASE_URL && !dataFile ? pgStore(process.env.DATABASE_URL) : fileStore(dataFile || path.join(__dirname, 'chess-data.json'));
  const ready = store.init().catch(e => console.log('chess storage problem:', e.message));
  const secret = opts.secret || process.env.CHESS_SECRET;
  if (!secret) console.log('Rooftop Chess: set CHESS_SECRET so ratings survive server restarts');
  const cardKey = secret ? crypto.createHash('sha256').update('rooftop-chess-card:' + secret).digest() : crypto.randomBytes(32);
  const sign = s => crypto.createHmac('sha256', cardKey).update(s).digest('base64url');
  /* a rating card: the player's ratings, signed, for their phone to keep */
  function makeCard(pr) {
    const ratings = {};
    for (const c in pr.ratings) { const r = pr.ratings[c]; ratings[c] = { r: r.r, rd: r.rd, vol: r.vol || 0.06, at: r.at || 0, games: r.games || 0, w: r.w || 0, l: r.l || 0, d: r.d || 0, best: Math.round(r.best || r.r) }; }
    const body = Buffer.from(JSON.stringify({ id: pr.id, ratings, t: pr.updated || 0 })).toString('base64url');
    return body + '.' + sign(body);
  }
  function readCard(card, id) {
    if (typeof card !== 'string' || card.length > 4000) return null;
    const [body, sig] = card.split('.');
    if (!body || !sig) return null;
    const want = sign(body);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    let o; try { o = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch (e) { return null; }
    if (!o || o.id !== id || !o.ratings || typeof o.ratings !== 'object') return null;
    return o;
  }
  /* bring back ratings from a card if it is newer than what the server has (e.g. the server lost its data) */
  function restoreFromCard(pr, card) {
    const o = readCard(card, pr.id);
    if (!o || !(o.t > (pr.updated || 0))) return false;
    for (const c of ['bullet', 'blitz', 'rapid']) {
      const r = o.ratings[c]; if (!r || !Number.isFinite(r.r) || !Number.isFinite(r.rd)) continue;
      pr.ratings[c] = { r: Math.max(100, Math.min(4000, r.r)), rd: Math.max(45, Math.min(350, r.rd)), vol: Math.max(0.03, Math.min(0.15, +r.vol || 0.06)), at: +r.at || 0, games: r.games | 0, w: r.w | 0, l: r.l | 0, d: r.d | 0, best: Math.max(100, Math.min(4000, +r.best || r.r)) };
    }
    pr.updated = o.t;
    return true;
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

  const people = new Map();     // id -> { id, ws, profile, game, seek, challenge, watching }
  const seeks = new Map();      // tc -> [{ id, since, color: w | b | r, ratings, takebacks }]
  const TAKEBACKS = [0, 3, 10, -1];   // takebacks each player gets in a game: none, 3, 10, or (-1) as many as they like
  const challenges = new Map(); // code -> { code, from, tc, color, rated, at }
  const games = new Map();      // id -> game
  const finished = new Map();   // id -> recently finished game (for rematches)
  let gameSeq = 1;

  const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const sendTo = (id, o) => { const p = people.get(id); if (p) send(p.ws, o); };
  const publicPlayer = (pr, cat) => { const r = pr.ratings[cat] || Rating.fresh(); return { id: pr.id, name: pr.name, face: pr.face, rating: Math.round(r.r), provisional: Rating.provisional(r) }; };

  async function loadProfile(id) {
    let pr = await store.get(id);
    if (!pr) pr = { id, name: 'Guest', face: 0, ratings: {}, created: now() };
    pr.ratings = pr.ratings || {};
    for (const c of ['bullet', 'blitz', 'rapid']) if (!pr.ratings[c]) pr.ratings[c] = Rating.fresh();
    return pr;
  }
  const ratingsOut = pr => { const o = {}; for (const c in pr.ratings) { const r = pr.ratings[c]; o[c] = { r: Math.round(r.r), games: r.games || 0, w: r.w || 0, l: r.l || 0, d: r.d || 0, best: Math.round(r.best || r.r), provisional: Rating.provisional(r) }; } return o; };

  /* ---------- games ---------- */
  function gameState(g, forId) {
    return { t: 'game', id: g.id, white: g.players.w, black: g.players.b, tc: g.tc.label, cat: g.cat, rated: g.rated, moves: g.chess.history.map(h => h.uci),
      clock: clocksNow(g), turn: g.chess.turn, running: g.chess.history.length >= 2 && !g.over, you: g.ids.w === forId ? 'w' : g.ids.b === forId ? 'b' : null,
      drawOffer: g.drawOffer, ratings: !!g.ratings, takebacks: g.takebacks, takebacksLeft: g.tbLeft, over: g.over ? { result: g.result, reason: g.reason, winner: g.winner, ratings: g.ratingChange || null } : null,
      firstMoveLeft: g.chess.history.length < 2 ? Math.max(0, FIRST_MOVE_MS - (now() - g.turnStart)) : null,
      online: { w: isOnline(g.ids.w), b: isOnline(g.ids.b) }, spectators: g.watchers.size };
  }
  const isOnline = id => { const p = people.get(id); return !!(p && p.ws && p.ws.readyState === 1); };
  function clocksNow(g) {
    const c = g.clock.slice();
    if (!g.over && g.chess.history.length >= 2) { const i = g.chess.turn === 'w' ? 0 : 1; c[i] = Math.max(0, c[i] - (now() - g.turnStart)); }
    return c;
  }
  function broadcast(g, o) { send((people.get(g.ids.w) || {}).ws, o); send((people.get(g.ids.b) || {}).ws, o); for (const ws of g.watchers) send(ws, o); }

  /* opts: { ratings (show move ratings during the game), takebacks (how many moves each side may take back: 0, 3, 10, or -1 for any number) } */
  async function startGame(idW, idB, tcLabel, rated, from, opts) {
    const pw = people.get(idW), pb = people.get(idB);
    if (!pw || !pb) return;
    const tc = tcParse(tcLabel), cat = Rating.category(tc.base / 1000, tc.inc / 1000);
    const tb = (opts && opts.takebacks) || 0;
    const g = { id: 'g' + (gameSeq++).toString(36) + crypto.randomBytes(3).toString('hex'), ids: { w: idW, b: idB }, tc, cat, rated: rated !== false,
      players: { w: publicPlayer(pw.profile, cat), b: publicPlayer(pb.profile, cat) }, chess: new Chess.Game(), clock: [tc.base, tc.base],
      turnStart: now(), timer: null, drawOffer: null, ratings: !!(opts && opts.ratings), takebacks: (opts && opts.takebacks) || 0, rematch: null, watchers: new Set(), over: false, startedAt: now(), from: from || 'seek', gone: { w: 0, b: 0 } };
    g.tbLeft = { w: tb, b: tb };
    games.set(g.id, g);
    for (const p of [pw, pb]) { p.game = g.id; unseek(p); cancelChallenge(p); }
    send(pw.ws, gameState(g, idW)); send(pb.ws, gameState(g, idB));
    arm(g);
    return g;
  }

  /* the one timer a game needs: first-move deadline, flag fall, or an abandoned seat */
  function arm(g) {
    clearTimeout(g.timer); if (g.over) return;
    const n = g.chess.history.length, side = g.chess.turn, t = now();
    let wait;
    if (n < 2) wait = FIRST_MOVE_MS - (t - g.turnStart);
    else wait = g.clock[side === 'w' ? 0 : 1] - (t - g.turnStart);
    for (const c of ['w', 'b']) if (g.gone[c]) wait = Math.min(wait, ABANDON_MS - (t - g.gone[c]));
    g.timer = setTimeout(() => tick(g), Math.max(20, wait + 30));
  }
  function tick(g) {
    if (g.over) return;
    const t = now(), n = g.chess.history.length, side = g.chess.turn;
    for (const c of ['w', 'b']) if (g.gone[c] && t - g.gone[c] >= ABANDON_MS) {
      if (n < 2) return finish(g, null, 'aborted', false);
      return finish(g, c === 'w' ? 'b' : 'w', 'abandoned');
    }
    if (n < 2) { if (t - g.turnStart >= FIRST_MOVE_MS) return finish(g, null, 'aborted', false); }
    else if (clocksNow(g)[side === 'w' ? 0 : 1] <= 0) {
      g.clock[side === 'w' ? 0 : 1] = 0;
      const winner = g.chess.timeoutResult(side);
      return finish(g, winner, winner ? 'timeout' : 'timeout vs insufficient material');
    }
    arm(g);
  }

  async function finish(g, winner, reason, rated) {
    if (g.over) return;
    clearTimeout(g.timer);
    if (g.chess.history.length >= 2) { const i = g.chess.turn === 'w' ? 0 : 1; g.clock[i] = Math.max(0, g.clock[i] - (now() - g.turnStart)); }
    g.over = true; g.winner = winner || null; g.reason = reason;
    g.result = winner === 'w' ? '1-0' : winner === 'b' ? '0-1' : reason === 'aborted' ? '*' : '1/2-1/2';
    g.chess.finish(winner, reason);
    if (rated !== false && g.rated && reason !== 'aborted' && g.chess.history.length >= 2) {
      try {
        const [prW, prB] = [people.get(g.ids.w), people.get(g.ids.b)].map(p => p && p.profile);
        const a = prW || await loadProfile(g.ids.w), b = prB || await loadProfile(g.ids.b);
        const ra = a.ratings[g.cat], rb = b.ratings[g.cat], sw = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
        const na = Rating.update(ra, rb, sw), nb = Rating.update(rb, ra, 1 - sw);
        g.ratingChange = { w: { old: Math.round(ra.r), now: Math.round(na.r) }, b: { old: Math.round(rb.r), now: Math.round(nb.r) } };
        a.ratings[g.cat] = na; b.ratings[g.cat] = nb;
        a.updated = b.updated = now();
        await store.put(a); await store.put(b);
        sendTo(g.ids.w, { t: 'card', card: makeCard(a) }); sendTo(g.ids.b, { t: 'card', card: makeCard(b) });
      } catch (e) { console.log('chess rating save failed', e.message); }
    }
    const pgn = g.chess.pgn({ Event: (g.rated ? 'Rated ' : 'Casual ') + g.cat + ' game', Site: 'Rooftop Chess', White: g.players.w.name, Black: g.players.b.name, WhiteElo: g.players.w.rating, BlackElo: g.players.b.rating, TimeControl: g.tc.base / 1000 + '+' + g.tc.inc / 1000, Termination: reason });
    broadcast(g, { t: 'end', id: g.id, result: g.result, reason, winner: g.winner, ratings: g.ratingChange || null, clock: g.clock, pgn });
    for (const c of ['w', 'b']) { const p = people.get(g.ids[c]); if (p && p.game === g.id) p.game = null; }
    games.delete(g.id);
    finished.set(g.id, g);
    setTimeout(() => finished.delete(g.id), REMATCH_MS);
  }

  function playMove(p, m) {
    const g = games.get(m.id); if (!g || g.over) return;
    const color = g.ids.w === p.id ? 'w' : g.ids.b === p.id ? 'b' : null;
    if (!color || g.chess.turn !== color) return send(p.ws, { t: 'error', msg: 'Not your turn' });
    if (typeof m.ply === 'number' && m.ply !== g.chess.history.length) return send(p.ws, gameState(g, p.id));   // out of step: resync
    const uci = String(m.uci || '').slice(0, 5);
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) || g.chess.find(uci) == null) return send(p.ws, gameState(g, p.id));   // not a legal move: resync, clock untouched
    const t = now(), n = g.chess.history.length;
    const ci = color === 'w' ? 0 : 1;
    if (n >= 2) {
      g.clock[ci] -= Math.max(0, t - g.turnStart - Math.min(p.lag || 0, LAG_CREDIT_MAX));
      if (g.clock[ci] <= 0) { g.clock[ci] = 0; const winner = g.chess.timeoutResult(color); return finish(g, winner, winner ? 'timeout' : 'timeout vs insufficient material'); }
    }
    const rec = g.chess.move(uci);
    if (!rec) return send(p.ws, gameState(g, p.id));
    if (n >= 2) g.clock[ci] += g.tc.inc;
    g.turnStart = t;
    if (g.drawOffer && g.drawOffer !== color) g.drawOffer = null;   // moving declines their offer
    broadcast(g, { t: 'move', id: g.id, uci: rec.uci, san: rec.san, ply: g.chess.history.length, clock: g.clock.slice(), running: g.chess.history.length >= 2, drawOffer: g.drawOffer });
    const st = g.chess.status();
    if (st.over) return finish(g, st.winner, st.reason);
    arm(g);
  }

  /* take back `who`'s last move (and the reply to it, if there was one) – no asking, it's one of their takebacks.
     The side to move is charged the time it used. */
  function takeBack(g, who) {
    const h = g.chess.history; let k = h.length && h[h.length - 1].color !== who ? 1 : 0;
    if (h.length - k < 1 || h[h.length - 1 - k].color !== who) return;
    k++;
    const t = now();
    if (h.length >= 2) { const i = g.chess.turn === 'w' ? 0 : 1; g.clock[i] = Math.max(0, g.clock[i] - (t - g.turnStart)); }
    for (let i = 0; i < k; i++) g.chess.undo();
    if (g.tbLeft[who] > 0) g.tbLeft[who]--;
    g.turnStart = t; g.drawOffer = null;
    for (const c of ['w', 'b']) sendTo(g.ids[c], gameState(g, g.ids[c]));
    for (const ws of g.watchers) send(ws, gameState(g, null));
    broadcast(g, { t: 'tookBack', id: g.id, from: who, left: g.tbLeft[who] });
    arm(g);
  }

  /* ---------- seeks and challenges ---------- */
  function unseek(p) { if (!p.seek) return; const list = seeks.get(p.seek) || []; seeks.set(p.seek, list.filter(s => s.id !== p.id)); p.seek = null; }
  function cancelChallenge(p) { if (p.challenge) { challenges.delete(p.challenge); p.challenge = null; } }
  /* two seeks can be paired when they chose the same extras and their colors don't clash */
  const fits = (a, b) => a.ratings === b.ratings && a.takebacks === b.takebacks && !(a.color !== 'r' && a.color === b.color);
  function matchmake() {
    for (const [tc, list] of seeks) {
      if (list.length < 2) continue;
      const cat = Rating.category(tcParse(tc).base / 1000, tcParse(tc).inc / 1000);
      const t = now();
      const range = s => { const w = (t - s.since) / 1000; return w > 20 ? 1e9 : 150 + 50 * w; };
      for (let i = 0; i < list.length; i++) {
        const a = list[i], pa = people.get(a.id); if (!pa || !isOnline(a.id)) continue;
        let best = -1, bd = 1e9;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j], pb = people.get(b.id); if (!pb || !isOnline(b.id) || b.id === a.id || !fits(a, b)) continue;
          const d = Math.abs(pa.profile.ratings[cat].r - pb.profile.ratings[cat].r);
          if (d <= Math.min(range(a), range(b)) && d < bd) { bd = d; best = j; }
        }
        if (best >= 0) {
          const b = list[best];
          list.splice(best, 1); list.splice(i, 1); i--;
          const pb = people.get(b.id); pa.seek = null; pb.seek = null;
          const aWhite = a.color === 'w' || b.color === 'b' ? true : a.color === 'b' || b.color === 'w' ? false : Math.random() < 0.5;
          // move ratings and takebacks are help: those games don't count for ratings
          startGame(aWhite ? a.id : b.id, aWhite ? b.id : a.id, tc, !a.ratings && !a.takebacks, 'seek', { ratings: a.ratings, takebacks: a.takebacks });
        }
      }
      seeks.set(tc, list.filter(s => isOnline(s.id)));
    }
  }
  setInterval(matchmake, 700);
  /* measure each playing person's network delay now and then (used to give back clock time lost in transit) */
  let probeSeq = 1;
  setInterval(() => {
    for (const p of people.values()) {
      if (!p.game || !isOnline(p.id)) continue;
      if (p.probe && now() - p.probe.at < 10000) continue;
      p.probe = { i: probeSeq++, at: now() }; send(p.ws, { t: 'p', i: p.probe.i });
    }
  }, 4000);
  const code = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++) s += A[crypto.randomInt(A.length)]; return challenges.has(s) ? code() : s; };

  function stats() {
    let seeking = 0; for (const l of seeks.values()) seeking += l.length;
    return { online: [...people.values()].filter(p => p.ws && p.ws.readyState === 1).length, playing: games.size * 2, seeking, games: games.size };
  }
  function liveList() {
    return [...games.values()].filter(g => g.chess.history.length >= 1).map(g => ({ id: g.id, white: g.players.w, black: g.players.b, tc: g.tc.label, cat: g.cat, moves: g.chess.history.length, fen: g.chess.fen(), watchers: g.watchers.size }))
      .sort((a, b) => (b.white.rating + b.black.rating) - (a.white.rating + a.black.rating)).slice(0, 30);
  }
  function unwatch(p) { if (!p.watching) return; const g = games.get(p.watching); if (g) g.watchers.delete(p.ws); p.watching = null; }

  /* ---------- messages ---------- */
  async function onMessage(ws, m) {
    if (m.t === 'hello') {
      const token = String(m.token || ''); if (!/^[a-f0-9]{32,64}$/.test(token)) return send(ws, { t: 'error', msg: 'Bad sign-in' });
      await ready;
      const id = sha('rooftop-chess:' + token).slice(0, 16);
      let p = people.get(id);
      if (p && p.ws && p.ws !== ws) { send(p.ws, { t: 'replaced' }); try { p.ws.close(); } catch (e) {} }
      if (!p) {
        const profile = await loadProfile(id);
        p = people.get(id);   // another connection may have arrived while loading
        if (!p) { p = { id, ws, profile, game: null, seek: null, challenge: null, watching: null, lag: 0 }; people.set(id, p); }
      }
      p.ws = ws; ws.pid = id; clearTimeout(p.forget); p.probe = null;
      if (m.card && restoreFromCard(p.profile, m.card)) console.log('chess: ratings restored from a card for', id);
      const name = cleanName(String(m.name || '').trim()).trim();
      if (name) p.profile.name = name.slice(0, 20);
      if (Number.isFinite(m.face)) p.profile.face = Math.abs(m.face | 0);
      p.profile.seen = now();
      if (p.profile.updated) store.put(p.profile).catch(() => {});   // only players with rated games are kept (no storage for drive-by visitors)
      send(ws, { t: 'welcome', id, name: p.profile.name, ratings: ratingsOut(p.profile), card: makeCard(p.profile), chat: CHAT, tcs: TIME_CONTROLS, stats: stats() });
      const g = p.game && games.get(p.game);
      if (g) { const c = g.ids.w === id ? 'w' : 'b'; if (g.gone[c]) { g.gone[c] = 0; arm(g); } send(ws, gameState(g, id)); broadcast(g, { t: 'presence', id: g.id, color: c, online: true }); }
      return;
    }
    const p = people.get(ws.pid); if (!p || p.ws !== ws) return send(ws, { t: 'error', msg: 'Say hello first' });
    switch (m.t) {
      case 'seek': {
        const tc = String(m.tc); if (!TIME_CONTROLS.includes(tc) || p.game) return;
        unseek(p); cancelChallenge(p); p.seek = tc;
        if (!seeks.has(tc)) seeks.set(tc, []);
        const opt = { color: ['w', 'b'].includes(m.color) ? m.color : 'r', ratings: !!m.ratings, takebacks: TAKEBACKS.includes(m.takebacks) ? m.takebacks : 0 };
        seeks.get(tc).push(Object.assign({ id: p.id, since: now() }, opt));
        send(ws, Object.assign({ t: 'seeking', tc }, opt)); matchmake(); return;
      }
      case 'unseek': unseek(p); send(ws, { t: 'unseeked' }); return;
      case 'challenge': {
        const tc = String(m.tc); if (!TIME_CONTROLS.includes(tc) || p.game) return;
        unseek(p); cancelChallenge(p);
        const c = { code: code(), from: p.id, tc, color: ['w', 'b'].includes(m.color) ? m.color : 'r', rated: !!m.rated, at: now() };
        challenges.set(c.code, c); p.challenge = c.code;
        send(ws, { t: 'challenge', code: c.code, tc, color: c.color, rated: c.rated }); return;
      }
      case 'cancelChallenge': cancelChallenge(p); send(ws, { t: 'challengeCancelled' }); return;
      case 'challengeInfo': {
        const c = challenges.get(String(m.code || '').toUpperCase().trim()); const from = c && people.get(c.from);
        if (!c || !from) return send(ws, { t: 'challengeInfo', code: m.code, missing: true });
        const cat = Rating.category(tcParse(c.tc).base / 1000, tcParse(c.tc).inc / 1000);
        return send(ws, { t: 'challengeInfo', code: c.code, tc: c.tc, color: c.color, rated: c.rated, from: publicPlayer(from.profile, cat), self: c.from === p.id });
      }
      case 'accept': {
        const c = challenges.get(String(m.code || '').toUpperCase().trim());
        if (!c) return send(ws, { t: 'error', msg: 'That challenge is gone. Ask your friend for a new code.' });
        if (c.from === p.id) return send(ws, { t: 'error', msg: 'That’s your own challenge – send the code to a friend' });
        if (!isOnline(c.from)) return send(ws, { t: 'error', msg: 'Your friend isn’t online right now' });
        if (p.game) return send(ws, { t: 'error', msg: 'Finish your current game first' });
        challenges.delete(c.code); const from = people.get(c.from); from.challenge = null;
        const fromWhite = c.color === 'w' ? true : c.color === 'b' ? false : Math.random() < 0.5;
        startGame(fromWhite ? c.from : p.id, fromWhite ? p.id : c.from, c.tc, c.rated, 'friend'); return;
      }
      case 'move': return playMove(p, m);
      case 'resign': { const g = games.get(m.id); if (!g || !(g.ids.w === p.id || g.ids.b === p.id)) return;
        if (g.chess.history.length < 2) return finish(g, null, 'aborted', false);
        return finish(g, g.ids.w === p.id ? 'b' : 'w', 'resignation'); }
      case 'abort': { const g = games.get(m.id); if (!g || !(g.ids.w === p.id || g.ids.b === p.id)) return;
        if (g.chess.history.length < 2) finish(g, null, 'aborted', false); return; }
      case 'draw': {
        const g = games.get(m.id); if (!g || g.over) return; const c = g.ids.w === p.id ? 'w' : g.ids.b === p.id ? 'b' : null; if (!c) return;
        if (m.op === 'offer') { if (g.drawOffer === (c === 'w' ? 'b' : 'w')) return finish(g, null, 'agreement'); if (g.chess.history.length < 2) return; g.drawOffer = c; broadcast(g, { t: 'offer', id: g.id, kind: 'draw', from: c }); }
        else if (m.op === 'accept' && g.drawOffer && g.drawOffer !== c) finish(g, null, 'agreement');
        else if (m.op === 'decline' && g.drawOffer && g.drawOffer !== c) { g.drawOffer = null; broadcast(g, { t: 'declined', id: g.id, kind: 'draw', from: c }); }
        return;
      }
      case 'takeback': {
        const g = games.get(m.id); if (!g || g.over || !g.takebacks) return; const c = g.ids.w === p.id ? 'w' : g.ids.b === p.id ? 'b' : null; if (!c) return;
        if (g.tbLeft[c] === 0) return send(ws, { t: 'error', msg: 'You have no takebacks left' });
        return takeBack(g, c);
      }
      case 'rematch': {
        const g = finished.get(m.id); if (!g) return send(ws, { t: 'error', msg: 'Too late for a rematch' });
        const c = g.ids.w === p.id ? 'w' : g.ids.b === p.id ? 'b' : null; if (!c) return;
        const other = c === 'w' ? 'b' : 'w';
        if (m.op === 'decline') { g.rematch = null; return sendTo(g.ids[other], { t: 'declined', id: g.id, kind: 'rematch' }); }
        if (g.rematch === other) {
          if (!isOnline(g.ids[other])) return send(ws, { t: 'error', msg: 'They left' });
          if ((people.get(g.ids.w) || {}).game || (people.get(g.ids.b) || {}).game) return send(ws, { t: 'error', msg: 'They’re already in another game' });
          finished.delete(g.id); startGame(g.ids.b, g.ids.w, g.tc.label, g.rated, 'rematch', { ratings: g.ratings, takebacks: g.takebacks }); return;
        }
        g.rematch = c; sendTo(g.ids[other], { t: 'offer', id: g.id, kind: 'rematch', from: c }); send(ws, { t: 'rematchSent', id: g.id }); return;
      }
      case 'chat': { const g = games.get(m.id) || finished.get(m.id); if (!g) return; const c = g.ids.w === p.id ? 'w' : g.ids.b === p.id ? 'b' : null; const i = m.i | 0;
        if (!c || i < 0 || i >= CHAT.length) return; const t = now(); if (p.chatAt && t - p.chatAt < 1500) return; p.chatAt = t;
        broadcast(g, { t: 'chat', id: g.id, from: c, i }); return; }
      case 'sync': { const g = p.game && games.get(p.game); if (g) send(ws, gameState(g, p.id)); else send(ws, { t: 'nogame' }); return; }
      case 'live': return send(ws, { t: 'live', games: liveList(), stats: stats() });
      case 'watch': { unwatch(p); const g = games.get(m.id); if (!g) return send(ws, { t: 'error', msg: 'That game just ended' }); g.watchers.add(ws); p.watching = g.id; return send(ws, gameState(g, p.id)); }
      case 'unwatch': unwatch(p); return;
      case 'leaders': { const cat = ['bullet', 'blitz', 'rapid'].includes(m.cat) ? m.cat : 'blitz'; const list = await store.top(cat, 25);
        return send(ws, { t: 'leaders', cat, list: list.map(pr => ({ id: pr.id, name: pr.name, face: pr.face, rating: Math.round(pr.ratings[cat].r), games: pr.ratings[cat].games })) }); }
      case 'me': return send(ws, { t: 'me', ratings: ratingsOut(p.profile), name: p.profile.name });
      case 'stats': return send(ws, { t: 'stats', stats: stats() });
      case 'ping': return send(ws, { t: 'pong', at: m.at });
      case 'pp': {   // reply to a lag probe: keep a smoothed round-trip time
        if (!p.probe || m.i !== p.probe.i) return;
        const rtt = Math.min(5000, now() - p.probe.at); p.probe = null;
        p.lag = p.lag ? p.lag * 0.7 + rtt * 0.3 : rtt;
        return;
      }
    }
  }

  wss.on('connection', ws => {
    ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
    let count = 0, since = now();
    ws.on('message', data => {
      if (now() - since > 1000) { since = now(); count = 0; } if (++count > 30) return;
      let m; try { m = JSON.parse(data); } catch (e) { return; } if (!m || typeof m !== 'object') return;
      onMessage(ws, m).catch(e => console.log('chess message error', e));
    });
    ws.on('close', () => {
      const p = people.get(ws.pid); if (!p || p.ws !== ws) return;
      unseek(p); cancelChallenge(p); unwatch(p);
      const g = p.game && games.get(p.game);
      if (g) { const c = g.ids.w === p.id ? 'w' : 'b'; g.gone[c] = now(); arm(g); broadcast(g, { t: 'presence', id: g.id, color: c, online: false }); }
      p.forget = setTimeout(() => { if (!isOnline(p.id) && !p.game) people.delete(p.id); }, 10 * 60000);
    });
  });
  setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; try { ws.ping(); } catch (e) {} } }, 15000);

  return {
    handleUpgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); },
    serve: serveApp,   // the app's files: call for /chess and /chess/...
    stats, store,
  };
}

module.exports = { createChessServer, TIME_CONTROLS };
