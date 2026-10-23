/* Rooftop Chess – Glicko ratings (online games on the server, puzzles in the app) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rating = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const Q = Math.log(10) / 400, DAY = 86400000;
  const START = 1200, START_RD = 300, MIN_RD = 45, MAX_RD = 350, C = 18;   // C: how fast uncertainty grows per idle day
  const g = rd => 1 / Math.sqrt(1 + 3 * Q * Q * rd * rd / (Math.PI * Math.PI));
  const fresh = () => ({ r: START, rd: START_RD, at: 0, games: 0, w: 0, l: 0, d: 0, best: START });
  /* uncertainty grows when you haven't played for a while */
  function rdNow(p, now) { const days = p.at ? Math.max(0, ((now || Date.now()) - p.at) / DAY) : 0; return Math.min(MAX_RD, Math.sqrt(p.rd * p.rd + C * C * days)); }
  function expected(p, o, now) { return 1 / (1 + Math.pow(10, -g(rdNow(o, now)) * (p.r - o.r) / 400)); }
  /* score: 1 win, 0.5 draw, 0 loss. Returns a new rating object. */
  function update(p, o, score, now) {
    now = now || Date.now();
    const rd = rdNow(p, now), go = g(rdNow(o, now)), E = 1 / (1 + Math.pow(10, -go * (p.r - o.r) / 400));
    const d2 = 1 / (Q * Q * go * go * E * (1 - E));
    const denom = 1 / (rd * rd) + 1 / d2;
    const r = Math.max(100, p.r + (Q / denom) * go * (score - E));
    const nrd = Math.max(MIN_RD, Math.sqrt(1 / denom));
    const out = Object.assign({}, p, { r, rd: nrd, at: now, games: (p.games || 0) + 1 });
    if (score === 1) out.w = (p.w || 0) + 1; else if (score === 0) out.l = (p.l || 0) + 1; else out.d = (p.d || 0) + 1;
    out.best = Math.max(p.best || START, r);
    return out;
  }
  const provisional = p => rdNow(p) > 110;
  /* time-control family from base seconds + increment, the same split most sites use */
  function category(base, inc) { const t = base + 40 * inc; return t < 180 ? 'bullet' : t < 600 ? 'blitz' : 'rapid'; }
  return { fresh, update, expected, rdNow, provisional, category, START };
});
