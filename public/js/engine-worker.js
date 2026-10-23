/* Rooftop Chess – the engine's own thread, so the screen never freezes while it thinks.
   Messages in: { id, cmd: 'think' | 'bot' | 'review', fen, moves: [uci], ... }. Scores going out are from White's side. */
importScripts('chess.js', 'engine.js', 'openings.js');
const S = new Engine.Searcher(19);
const W = (score, pos) => pos.turn === Chess.WHITE ? score : -score;
const toSan = (pos, ucis) => { const g = new Chess.Game(pos.fen()); const out = []; for (const u of ucis) { const r = g.move(u); if (!r) break; out.push(r.san); } return out; };
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.cmd === 'think') think(m);
    else if (m.cmd === 'bot') bot(m);
    else if (m.cmd === 'review') review(m);
  } catch (err) { postMessage({ id: m.id, type: 'error', error: String(err && err.stack || err) }); }
};

function lineOut(pos, l) { return { score: W(l.score, pos), mate: pos.turn === Chess.WHITE ? l.mate : -l.mate, pv: l.pv.map(Chess.toUci), san: toSan(pos, l.pv.slice(0, 10).map(Chess.toUci)) }; }

function think(m) {
  const { pos, history } = Engine.replay(m.fen, m.moves);
  const r = S.think(pos, { time: m.time || 1000, depth: m.depth, multiPV: m.multiPV || 1, history,
    onInfo: m.stream ? info => postMessage({ id: m.id, type: 'info', depth: info.depth, nodes: info.nodes, lines: info.lines.map(l => ({ score: W(l.score, pos), mate: pos.turn === Chess.WHITE ? l.mate : -l.mate, pv: l.pv, san: toSan(pos, l.pv.slice(0, 10)) })) }) : null });
  postMessage({ id: m.id, type: 'done', best: r.best ? Chess.toUci(r.best) : null, depth: r.depth, nodes: r.nodes, lines: r.lines.map(l => lineOut(pos, l)) });
}

/* a bot's move. level: { depth, noise, blunder, time, book, mateSense } */
function bot(m) {
  const { pos, history } = Engine.replay(m.fen, m.moves);
  const L = m.level || {};
  const legal = pos.legalMoves();
  if (!legal.length) return postMessage({ id: m.id, type: 'done', best: null });
  // play a known opening move now and then, like people do
  if (L.book && m.sans && m.sans.length < 14 && Math.random() < L.book) {
    const next = Openings.next(m.sans);
    if (next.length) { const g = new Chess.Game(pos.fen()); const pick = next[Math.floor(Math.random() * next.length)]; const r = g.move(pick); if (r) return postMessage({ id: m.id, type: 'done', best: r.uci, book: true }); }
  }
  if (L.time) {
    const r = S.think(pos, { time: L.time, depth: L.depth || 64, history });
    return postMessage({ id: m.id, type: 'done', best: Chess.toUci(r.best), score: W(r.score, pos) });
  }
  // weaker bots: score every move a few moves deep, then pick with some human-like noise
  const list = S.scoreMoves(pos, L.depth || 1, { history, time: 4000 });
  if (L.mateSense && list[0].score > Engine.MATE_BOUND) return postMessage({ id: m.id, type: 'done', best: Chess.toUci(list[0].move) });
  if (L.blunder && Math.random() < L.blunder) { const pick = list[Math.floor(Math.random() * list.length)]; return postMessage({ id: m.id, type: 'done', best: Chess.toUci(pick.move) }); }
  let best = list[0], bs = -1e9;
  for (const x of list) { const s = Math.max(-2500, Math.min(2500, x.score)) + gauss() * (L.noise || 0); if (s > bs) { bs = s; best = x; } }
  postMessage({ id: m.id, type: 'done', best: Chess.toUci(best.move) });
}

/* Game Review: the engine's view of every position in the game */
function review(m) {
  const out = [];
  const n = m.moves.length;
  for (let i = 0; i <= n; i++) {
    const { pos, history } = Engine.replay(m.fen, m.moves.slice(0, i));
    const g = new Chess.Game(pos.fen());
    const st = g.status();
    if (st.over && st.reason !== 'repetition') {
      out.push({ score: st.reason === 'checkmate' ? (pos.turn === Chess.WHITE ? -Engine.MATE : Engine.MATE) : 0, mate: 0, over: st.reason, best: null, lines: [] });
    } else {
      const r = S.think(pos, { time: m.time || 250, depth: m.depth || 14, multiPV: 2, history });
      const lines = r.lines.map(l => lineOut(pos, l));
      out.push({ score: lines[0] ? lines[0].score : 0, mate: lines[0] ? lines[0].mate : 0, best: r.best ? Chess.toUci(r.best) : null, lines });
    }
    postMessage({ id: m.id, type: 'progress', done: i + 1, total: n + 1 });
  }
  postMessage({ id: m.id, type: 'done', evals: out });
}
