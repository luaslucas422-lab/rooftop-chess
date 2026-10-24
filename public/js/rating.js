/* Rooftop Chess – ratings. Glicko-2 for players (online games on the server; puzzles and bot games in the app),
   and Game Review's accuracy and game-rating estimate. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rating = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DAY = 86400000, SCALE = 173.7178;
  const START = 1200, START_RD = 300, MIN_RD = 45, MAX_RD = 350, C = 18;   // C: how fast uncertainty grows per idle day
  const VOL = 0.06, TAU = 0.75;   // starting volatility, and how much volatility may change (Glickman suggests 0.3–1.2)
  const fresh = () => ({ r: START, rd: START_RD, vol: VOL, at: 0, games: 0, w: 0, l: 0, d: 0, best: START });
  /* uncertainty grows when you haven't played for a while */
  function rdNow(p, now) { const days = p.at ? Math.max(0, ((now || Date.now()) - p.at) / DAY) : 0; return Math.min(MAX_RD, Math.sqrt(p.rd * p.rd + C * C * days)); }
  const gPhi = phi => 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
  function expected(p, o, now) { return 1 / (1 + Math.exp(-gPhi(rdNow(o, now) / SCALE) * (p.r - o.r) / SCALE)); }

  /* Glicko-2 (Glickman, "Example of the Glicko-2 system"): one rating period with these results.
     games: [{ o: opponent rating object, score: 1 | 0.5 | 0 }]. Returns { r, rd, vol }. */
  function glicko2(p, games, now, tau) {
    tau = tau || TAU;
    const mu = (p.r - 1500) / SCALE, phi = rdNow(p, now) / SCALE, sigma = p.vol || VOL;
    let vInv = 0, sum = 0;
    for (const x of games) {
      const muJ = (x.o.r - 1500) / SCALE, gJ = gPhi(rdNow(x.o, now) / SCALE), E = 1 / (1 + Math.exp(-gJ * (mu - muJ)));
      vInv += gJ * gJ * E * (1 - E); sum += gJ * (x.score - E);
    }
    const v = 1 / vInv, delta = v * sum;
    // the new volatility: solve f(x) = 0 with the Illinois method
    const a = Math.log(sigma * sigma), f = x => { const ex = Math.exp(x), d = phi * phi + v + ex; return ex * (delta * delta - phi * phi - v - ex) / (2 * d * d) - (x - a) / (tau * tau); };
    let A = a, B;
    if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
    else { let k = 1; while (f(a - k * tau) < 0) k++; B = a - k * tau; }
    let fA = f(A), fB = f(B);
    for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
      const Cx = A + (A - B) * fA / (fB - fA), fC = f(Cx);
      if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
      B = Cx; fB = fC;
    }
    const vol = Math.exp(A / 2), phiStar = Math.sqrt(phi * phi + vol * vol);
    const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), muNew = mu + phiNew * phiNew * sum;
    return { r: 1500 + SCALE * muNew, rd: SCALE * phiNew, vol };
  }
  /* after one game. score: 1 win, 0.5 draw, 0 loss. Returns a new rating object. */
  function update(p, o, score, now) {
    now = now || Date.now();
    const n = glicko2(p, [{ o, score }], now);
    const r = Math.max(100, n.r), rd = Math.max(MIN_RD, Math.min(MAX_RD, n.rd)), vol = Math.max(0.03, Math.min(0.15, n.vol));
    const out = Object.assign({}, p, { r, rd, vol, at: now, games: (p.games || 0) + 1 });
    if (score === 1) out.w = (p.w || 0) + 1; else if (score === 0) out.l = (p.l || 0) + 1; else out.d = (p.d || 0) + 1;
    out.best = Math.max(p.best || START, r);
    return out;
  }
  const provisional = p => rdNow(p) > 110;
  /* time-control family from base seconds + increment, the same split most sites use */
  function category(base, inc) { const t = base + 40 * inc; return t < 180 ? 'bullet' : t < 600 ? 'blitz' : 'rapid'; }

  /* ---------- Game Review ---------- */
  /* chance of winning (0–100) for a score in centipawns */
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  /* an engine line (scores from White's side) as centipawns; a mate counts as about a hundred pawns */
  const cpOf = e => e.mate ? (e.mate > 0 ? 10000 - e.mate * 10 : -10000 - e.mate * 10) : Math.max(-10000, Math.min(10000, e.score));
  /* one move's accuracy from the winning chances it gave away */
  const moveAccuracy = loss => Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  /* a game's accuracy from its moves' accuracies: between the plain average and the harmonic one, so blunders count */
  function accuracy(accs) {
    if (!accs.length) return null;
    const mean = accs.reduce((a, b) => a + b, 0) / accs.length, harm = accs.length / accs.reduce((a, b) => a + 1 / Math.max(1, b), 0);
    return (mean + harm) / 2;
  }
  /* What rating plays a game like this? Measured with tools/calibrate-review.js: bots with known ratings played each other
     and every game was reviewed. ACC: the typical accuracy at each rating (accuracy → rating). One game's accuracy is
     noisy (FIT.sd: how far it typically strays, in accuracy points), so the estimate is the rating that best explains both
     the accuracy and – when the opponent's rating is known – the result, by the usual Elo odds. Losing to a far stronger
     player then says little (anyone would), and beating one says a lot. If the player's own rating is established, the
     estimate leans on it too (FIT.spread: how far one game's level typically strays from a player's rating). */
  // measured on 310 bot games (tools/data/review-calibration.json); 1650–2100 play about equally accurately, so they share a point
  const ACC = [[0, 100], [65.3, 250], [65.5, 450], [73, 650], [76.9, 850], [81.1, 1050], [83.4, 1250], [85.8, 1450], [88, 1650], [88.1, 2000], [92.1, 2350], [100, 3000]];
  const FIT = { sd: 9.7, spread: 350 };
  function fromAccuracy(acc) {
    if (acc <= ACC[0][0]) return ACC[0][1];
    for (let i = 1; i < ACC.length; i++) if (acc <= ACC[i][0]) { const [a0, r0] = ACC[i - 1], [a1, r1] = ACC[i]; return r0 + (r1 - r0) * (acc - a0) / (a1 - a0); }
    return ACC[ACC.length - 1][1];
  }
  function accuracyAt(r) {   // the other way round: typical accuracy at a rating
    if (r <= ACC[0][1]) return ACC[0][0];
    for (let i = 1; i < ACC.length; i++) if (r <= ACC[i][1]) { const [a0, r0] = ACC[i - 1], [a1, r1] = ACC[i]; return a0 + (a1 - a0) * (r - r0) / (r1 - r0); }
    return ACC[ACC.length - 1][0];
  }
  /* o: { acc, opp (opponent's rating, if known), score (1, 0.5, 0 for this side), own (this player's established rating, if any) }
     → a rating, in steps of 25 */
  function gameRating(o) {
    let best = 100, bestL = -Infinity;
    for (let r = 100; r <= 3000; r += 25) {
      let L = -Math.pow(o.acc - accuracyAt(r), 2) / (2 * FIT.sd * FIT.sd);
      if (o.opp != null) { const E = 1 / (1 + Math.pow(10, (o.opp - r) / 400)); L += Math.log(Math.max(1e-9, o.score === 1 ? E : o.score === 0 ? 1 - E : 4 * E * (1 - E))); }
      if (o.own != null) L -= Math.pow(r - o.own, 2) / (2 * FIT.spread * FIT.spread);
      if (L > bestL) { bestL = L; best = r; }
    }
    return best;
  }

  return { fresh, update, glicko2, expected, rdNow, provisional, category, START, winPct, cpOf, moveAccuracy, accuracy, fromAccuracy, accuracyAt, gameRating, ACC, FIT };
});
