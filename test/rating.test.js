/* Rating tests: Glicko-2 against Glickman's worked example, and Game Review's game rating. Run: node test/rating.test.js */
const assert = require('assert');
const R = require('../public/js/rating.js');
const near = (a, b, d, what) => assert(Math.abs(a - b) <= d, what + ': ' + a + ' should be ' + b);
const now = Date.now(), who = (r, rd) => ({ r, rd, at: now });

// Glickman, "Example of the Glicko-2 system": 1500 (RD 200, volatility 0.06, tau 0.5) beats a 1400, loses to a 1550 and a 1700
const ex = R.glicko2({ r: 1500, rd: 200, vol: 0.06, at: now }, [{ o: who(1400, 30), score: 1 }, { o: who(1550, 100), score: 0 }, { o: who(1700, 300), score: 0 }], now, 0.5);
near(ex.r, 1464.06, 0.05, 'rating'); near(ex.rd, 151.52, 0.05, 'RD'); near(ex.vol, 0.05999, 0.00001, 'volatility');

// one game at a time: beating a stronger player gains more, a loss to a weaker one costs more, and certainty grows
const me = Object.assign(R.fresh(), { at: now });
const winStrong = R.update(me, who(1500, 60), 1, now), winWeak = R.update(me, who(900, 60), 1, now), loseWeak = R.update(me, who(900, 60), 0, now);
assert(winStrong.r - me.r > winWeak.r - me.r && winWeak.r > me.r, 'wins move the rating up, more against stronger players');
assert(me.r - loseWeak.r > winWeak.r - me.r, 'losing to a weaker player costs more than beating them earns');
assert(winStrong.rd < me.rd && winStrong.games === 1 && winStrong.w === 1 && loseWeak.l === 1);
// ratings saved before Glicko-2 (no volatility yet) still update
const old = R.update({ r: 1500, rd: 80, at: now, games: 40 }, who(1500, 80), 0.5, now);
near(old.r, 1500, 0.5, 'a draw between equals'); assert(old.vol > 0.03 && old.vol < 0.15);
// a player who keeps beating much stronger opponents climbs fast
let p = Object.assign(R.fresh(), { at: now }); for (let i = 0; i < 10; i++) p = R.update(p, who(2000, 60), 1, now + i);
assert(p.r > 1800, 'ten wins against 2000s: ' + p.r);

// Game Review: better accuracy, better game rating; beating a strong opponent counts too
assert(R.fromAccuracy(90) > R.fromAccuracy(80) && R.fromAccuracy(80) > R.fromAccuracy(60));
assert(R.gameRating({ acc: 85 }) % 25 === 0);
assert(R.gameRating({ acc: 85, opp: 2000, score: 1 }) >= R.gameRating({ acc: 85, opp: 2000, score: 0 }));
assert(R.gameRating({ acc: 85, opp: 2000, score: 0.5 }) >= R.gameRating({ acc: 85, opp: 800, score: 0.5 }));
// accuracy: the review's formulas
assert.strictEqual(Math.round(R.moveAccuracy(0)), 100); assert(R.moveAccuracy(30) < 30);
near(R.accuracy([100, 100, 100]), 100, 0.01, 'perfect game'); assert(R.accuracy([100, 100, 10]) < 70, 'a blunder pulls it down hard');
console.log('rating ok');

// a bot of any rating (your own bots): measured bots at their own ratings, a mix in between, more blunders below Pip,
// more thinking time above Titan
const B = require('../public/js/botplay.js');
assert.deepStrictEqual(Object.assign({}, B.forElo(1050), { elo: undefined }), Object.assign({}, B.LEVELS.ravi, { elo: undefined }), 'exactly Ravi at 1050');
const mid = B.forElo(1150); assert(mid.mix && mid.mix.lo === B.LEVELS.ravi && mid.mix.hi === B.LEVELS.selma && Math.abs(mid.mix.t - 0.5) < 1e-9, 'halfway between Ravi and Selma');
assert(B.forElo(100).blunder > B.forElo(200).blunder && B.forElo(200).blunder > B.LEVELS.pip.blunder - 1e-9, 'below Pip: more blunders the lower it goes');
assert(B.forElo(3500).time > B.forElo(3000).time && B.forElo(3000).time > B.LEVELS.titan.time, 'above Titan: more time the higher it goes');
assert.strictEqual(B.forElo(9999).elo, 3500); assert.strictEqual(B.forElo(-5).elo, 100);
for (let e = 100; e < 3500; e += 50) { const a = B.forElo(e), b = B.forElo(e + 50); assert(a && b, 'a level for every rating'); }
// a mixed bot really moves: it plays like one of its two bots each time
{ const C = require('../public/js/chess.js'), E = require('../public/js/engine.js'), S = new E.Searcher(16), pos = new C.Position();
  for (let i = 0; i < 5; i++) assert(B.choose(S, pos, [], [], B.forElo(1150), Math.random), 'a move'); }
console.log('bot ratings ok');
