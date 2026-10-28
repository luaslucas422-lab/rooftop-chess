/* End-to-end test in a real (headless) browser: first launch, a bot game, a puzzle, an online game between two
   players, and Game Review. Needs Playwright: `npm install --no-save playwright && npx playwright install chromium`.
   Run: node test/browser.test.js */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('browser test skipped: Playwright is not installed'); process.exit(0); }

const PORT = 19000 + Math.floor(Math.random() * 900);
const URL = 'http://127.0.0.1:' + PORT + '/chess/';
const dataFile = path.join(require('os').tmpdir(), 'chess-browser-' + PORT + '.json');
const wait = ms => new Promise(r => setTimeout(r, ms));
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT, CHESS_DATA_FILE: dataFile, CHESS_SECRET: 'browser-test', DATABASE_URL: '' }), stdio: ['ignore', 'ignore', 'inherit'] });

async function page(browser, name) {
  // bypassCSP: some Playwright versions poll with eval(), which the app's Content-Security-Policy rightly blocks
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, bypassCSP: true });
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/WebSocket|ERR_/.test(m.text())) p.errors.push(m.text()); });
  await p.goto(URL);
  await p.fill('#nm', name); await p.click('[data-ok]');
  await p.waitForSelector('.hero');
  return p;
}
/* tap a square on the game board, whichever way round it is */
async function tap(p, sq) {
  const box = await p.locator('.gv-main .board').first().boundingBox();
  const flipped = await p.evaluate(() => parseFloat(document.querySelector('.gv-main .board [data-sq="a1"]').style.top) < 50);
  const f = 'abcdefgh'.indexOf(sq[0]), r = +sq[1] - 1, x = flipped ? 7 - f : f, y = flipped ? r : 7 - r, s = box.width / 8;
  await p.mouse.click(box.x + (x + 0.5) * s, box.y + (y + 0.5) * s);
}
async function move(p, from, to) { await tap(p, from); await wait(60); await tap(p, to); }

(async () => {
  for (let i = 0; i < 80; i++) { try { await new Promise((res, rej) => http.get(URL, r => r.statusCode === 200 ? res() : rej()).on('error', rej)); break; } catch (e) { await wait(100); } }
  const browser = await chromium.launch();

  // a bot game: the bot answers, and the game is saved after resigning
  const a = await page(browser, 'Alice');
  await a.click('[data-go="bots"]'); await a.click('[data-bot="otto"]'); await a.click('[data-color="w"]'); await a.click('[data-a="play"]');
  await move(a, 'e2', 'e4');
  await a.waitForFunction(() => Play.current.game.history.length >= 2, null, { timeout: 15000 });
  await a.click('.gv-main [data-act="menu"]'); await a.click('[data-m="resign"]'); await a.click('[data-yes]');
  await a.waitForSelector('[data-r="review"]');
  assert.strictEqual(await a.evaluate(() => Store.data.games.length), 1, 'the bot game is in the history');
  console.log('bot game ok');

  // Game Review of that game
  await a.click('[data-r="review"]');
  await a.waitForSelector('.coach .bubble', { timeout: 30000 });
  assert(/accuracy/i.test(await a.locator('.gv-main .coach .bubble').innerText()));
  console.log('review ok');

  // Coach Mira stops the game when the queen is left hanging, and the takeback puts it back
  await a.evaluate(() => Play.startBot(BOTS[4], 'w', { startFen: '7k/8/8/3p4/8/8/4Q3/4K3 w - - 0 1', coach: true }));
  await a.waitForSelector('.gv-main .coach-live .coach-msg');
  await move(a, 'e2', 'e4');
  await a.waitForSelector('.gv-main [data-coach="undo"]', { timeout: 20000 });
  assert(/queen on e4/.test(await a.locator('.gv-main .coach-live').innerText()), 'the coach explains the blunder');
  await wait(1500);
  assert.strictEqual(await a.evaluate(() => Play.current.game.history.length), 1, 'the bot waits while the coach talks');
  await a.click('.gv-main [data-coach="undo"]');
  await a.waitForFunction(() => Play.current.game.history.length === 0 && Play.current.myTurn());
  await move(a, 'e2', 'e4');
  await a.waitForSelector('.gv-main [data-coach="play"]', { timeout: 20000 }); await a.click('.gv-main [data-coach="play"]');
  await a.waitForFunction(() => Play.current.game.history.length === 2, null, { timeout: 15000 });
  await a.click('.gv-main [data-act="menu"]'); await a.click('[data-m="resign"]'); await a.click('[data-yes]');
  await a.waitForSelector('[data-r="review"]');
  assert.strictEqual(await a.evaluate(() => Store.data.beaten.ravi), undefined);
  await a.evaluate(() => UI.closeSheet());
  console.log('coach ok');

  // your own bots: up to three, and one plays a game
  const mine = await a.evaluate(() => [1, 2, 3, 4].map(i => !!MyBots.save({ name: 'Mine ' + i, elo: 300 * i })));
  assert.deepStrictEqual(mine, [true, true, true, false], 'no more than three bots each');
  await a.evaluate(() => Play.startBot(findBot(MyBots.saved()[1].id), 'w', {}));
  await a.waitForFunction(() => Play.current.el && Play.current.bot.mine && !document.querySelector('.sheet-wrap'));   // the new game is on screen
  await move(a, 'e2', 'e4');
  await a.waitForFunction(() => Play.current.game.history.length >= 2, null, { timeout: 15000 });
  assert.strictEqual(await a.evaluate(() => Play.current.bot.level.elo), 600);
  await a.evaluate(() => { for (const b of MyBots.saved().slice()) MyBots.remove(b.id); Store.data.current = null; App.go('home'); });
  console.log('own bots ok');

  // Trying Pip's title comes with its disclaimer
  await a.evaluate(() => App.go('bots')); await a.click('[data-bot="tryingpip"]');
  assert(/not an official grandmaster/i.test(await a.locator('.disclaimer').innerText()), 'the GM title is explained');
  // a bot game with a clock: running out of time loses
  await a.evaluate(() => Play.startBot(BOTS[0], 'w', { tc: { base: 60000, inc: 0 } }));
  await a.waitForFunction(() => Play.current.el && Play.current.tc && !document.querySelector('.sheet-wrap'));
  await move(a, 'e2', 'e4'); await a.waitForFunction(() => Play.current.game.history.length >= 2, null, { timeout: 15000 });
  await a.evaluate(() => { const c = Play.current; c.clock[0] = 800; c.clockAt = performance.now(); });
  await a.waitForFunction(() => Play.current.over, null, { timeout: 5000 });
  assert.strictEqual(await a.evaluate(() => Play.current.over.reason), 'timeout');
  await a.waitForSelector('[data-r="review"]'); await a.evaluate(() => { UI.closeSheet(); App.go('home'); });
  // piece styles switch everywhere at once
  assert(/crispEdges/.test(await a.evaluate(() => { Store.data.settings.pieces = PIECES.use('pixel'); return PIECES.svg('wK'); })), 'pixel pieces');
  await a.evaluate(() => { Store.data.settings.pieces = PIECES.use('classic'); });
  console.log('bot clock, Trying Pip, piece styles ok');

  // Experimental: 4-player chess against bots – you move, the three bots answer
  await a.evaluate(() => App.go('multi', { players: 4, who: 'bots', level: 'easy' }));
  await a.waitForSelector('.mboard [data-s]');
  await a.click('.mboard [data-s="' + (12 * 14 + 6) + '"]'); await a.click('.mboard [data-s="' + (10 * 14 + 6) + '"]');
  await a.waitForFunction(() => Multi.current.state.plies >= 4 && Multi.current.state.turn === 0, null, { timeout: 15000 });
  await a.evaluate(() => App.go('home'));
  console.log('4-player chess ok');

  // a rated puzzle, solved with its own solution
  await a.evaluate(() => App.go('puzzle', { mode: 'rated' }));
  await a.waitForFunction(() => Puzzles.active && Puzzles.active.step === 1, null, { timeout: 10000 });
  const line = await a.evaluate(() => Puzzles.active.p.line);
  for (let i = 1; i < line.length; i += 2) {
    await a.waitForFunction(i => Puzzles.active.step === i, i, { timeout: 10000 });
    await move(a, line[i].slice(0, 2), line[i].slice(2, 4));
    if (await a.evaluate(() => Puzzles.active.done)) break;
  }
  await a.waitForFunction(() => Puzzles.active.done, null, { timeout: 10000 });
  assert.strictEqual(await a.evaluate(() => Store.data.puzzles.solved), 1);
  console.log('puzzle ok');

  // an online game between two people
  const b = await page(browser, 'Bruno');
  for (const p of [a, b]) { await p.evaluate(() => App.go('online')); await p.click('[data-tc="3+2"]'); await p.click('[data-a="play"]'); }
  await a.waitForSelector('.gv-main .board'); await b.waitForSelector('.gv-main .board');
  await a.waitForFunction(() => Play.player, null, { timeout: 10000 }); await b.waitForFunction(() => Play.player, null, { timeout: 10000 });
  const white = (await a.evaluate(() => Play.player.me)) === 'w' ? a : b, black = white === a ? b : a;
  await move(white, 'e2', 'e4'); await black.waitForFunction(() => Play.player.game.history.length === 1);
  await move(black, 'e7', 'e5'); await white.waitForFunction(() => Play.player.game.history.length === 2);
  await move(white, 'g1', 'f3'); await black.waitForFunction(() => Play.player.game.history.length === 3);
  await black.click('.gv-main [data-act="resign"]'); await black.click('[data-yes]');
  await white.waitForFunction(() => Play.player.over && Play.player.ratingChange, null, { timeout: 10000 });
  const rc = await white.evaluate(() => Play.player.ratingChange);
  assert(rc.w.now > rc.w.old && rc.b.now < rc.b.old, 'ratings moved the right way');
  console.log('online game ok');

  for (const p of [a, b]) assert.deepStrictEqual(p.errors, [], 'no page errors');

  // the app itself runs under its Content-Security-Policy without breaking it
  const strict = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await strict.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await strict.goto(URL); await wait(800);
  await strict.evaluate(() => { Store.data.profile.name = 'Strict'; Play.startBot(BOTS[0], 'w'); });
  await wait(1500);
  await strict.evaluate(() => App.go('analysis', {})); await wait(1500);
  assert.deepStrictEqual(await strict.evaluate(() => window.__csp), [], 'no Content-Security-Policy violations');
  console.log('content security policy ok');
  await browser.close(); server.kill(); try { fs.unlinkSync(dataFile); } catch (e) {}
  console.log('browser ok');
  process.exit(0);
})().catch(e => { console.error(e); server.kill(); process.exit(1); });
