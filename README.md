# Rooftop Chess

A chess app for phones and computers: play online, against bots or a friend, solve puzzles, learn, and review your games.
It's a web app you install to your home screen, plus the small server that runs online games.

## Get it on your phone
1. Put the server online (below). You get a link like `https://rooftop-chess.onrender.com`.
2. Open that link on your phone. The app is at `/chess/` (the plain link takes you there).
3. **Android (Chrome):** tap **Install** on the "Get the app" banner (or ⋮ menu → Install app). **iPhone (Safari):** **Share → Add to Home Screen**.

It opens full screen like any app. Bots, puzzles, lessons and analysis work offline; online play needs the server.

## Put it online with Render (free)
The easy way – click this, sign in, and press **Deploy**:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/luaslucas422-lab/rooftop-chess)

Or by hand:
1. Sign in at render.com with GitHub.
2. **New → Blueprint** → pick this repository. It reads `render.yaml` and sets everything up, including `CHESS_SECRET`.
   (Or **New → Web Service** with Build command `npm install` · Start command `npm start` · Instance type Free,
   and add an environment variable `CHESS_SECRET` set to any long random text.)
3. Open the link Render gives you.

On the free plan the server goes to sleep after 15 minutes with nobody connected, so the first visit after that can take up to a minute.

### Where ratings are kept
Render's free plan wipes the server's files whenever it restarts or goes to sleep. So besides the server's own copy,
each player's phone keeps a **rating card** – their ratings, signed with `CHESS_SECRET`. After a restart the phone hands the card
back and the rating returns. Nobody can make or change a card without the secret, and a card only works for the player it was made for.
Keep `CHESS_SECRET` the same, or old cards stop working (ratings then start again from 1200).

If you want a permanent leaderboard (it otherwise only lists people who have connected since the last restart), set `DATABASE_URL`
to a Postgres database and ratings are stored there too. Note that Render's free Postgres databases expire after 30 days.

## What's in it
- **Play online** – bullet, blitz and rapid (1|0 up to 30|0): pick your color, and choose whether the game shows **move ratings** (every move's verdict and both players' accuracy, live) how many **takebacks** each player gets (none, 3, 10 or unlimited – take back your last move whenever you like, no asking), and whether you play with a **shared clock** (one clock for both players: it runs whoever is thinking, and whoever is to move when it runs out loses) – you're only paired with players who chose the same, and games with either extra are casual. Matchmaking, clocks kept on the server (with a little time given back for slow connections), Glicko-2 ratings (the system Lichess uses), draw offers, rematches, preset quick chat, premoves, leaderboard.
- **Play a friend** – a 6-letter code or a share link; casual or rated.
- **Play a bot** – 13 characters from 250 to 3500, with or without a clock (bullet, blitz or rapid – the bots manage their time), takebacks, hints, chatty personalities and "beaten" badges. Trying Pip (3500) is Pip, trying very hard; the "GM" next to the name is part of the joke – it's not an official grandmaster title, and Rooftop Chess doesn't make or give titles. Their ratings come from playing them against each other (each beats the one below 3 or 4 games in 5, see below); Titan, the full-strength engine, is an estimate. You can also make **up to 3 bots of your own** – a name, a picture (one of the drawn faces or a photo) and any rating from 100 to 3500. They live on your device, so only you can play them. Between two of the measured bots, a bot of yours plays each move like one or the other, as often as its rating is close to each (checked: bots set to 1150, 1550 and 2000 measured about 1105, 1575 and 1960, ±60); below Pip it blunders more; above Titan it thinks longer – up to 10 seconds a move at 3500, which makes it the strongest player in the app, though how much stronger than Titan hasn't been measured. Games you play without help (no coach, hints or takebacks) give you a **bot rating** – Glicko-2 against the bots' measured ratings – and the bots screen marks a good match for your level.
- **Coach Mira** – pick her level when you choose a bot (or from Learn, or the game menu): **Beginner** rates moves gently and gives lots of warnings and tips, **Normal** rates like Game Review, and **Extreme** – unlocked after 20 finished games – rates strictly, looks deeper, and gives no warnings or tips. She checks every move you make: a mistake stops the game and she says what went wrong ("Your queen on e4 isn’t protected there – dxe4 takes it"), and you can take it back, see the best move, or play on. On your turn she warns you about threats, tells you when the bot slips, and gives opening tips. Games with her help don’t earn the "beaten" badge.
- **Pass & play** – two people on one device, with an optional clock.
- **Puzzles** – 831 puzzles with your own puzzle rating (easier / normal / harder), Puzzle Rush (3 minutes, 3 strikes), a daily puzzle and themes.
- **Game Review** – every move rated (best, brilliant, great, mistake, blunder…) with accuracy, a game rating (see below), an eval graph and an explanation; jump between key moments, retry your mistakes, and play through the engine's best line.
- **Analysis board** – engine with the top 3 lines and an eval bar, known opening moves, a position editor, and PGN/FEN import and export. On a computer, right-click to draw arrows.
- **Learn** – "how the pieces move" lessons, checkmate drills against the engine, and the rules.
- **Watch** – spectate live games, or set two bots against each other.
- **Settings** – board colors, and **piece styles**: Classic, Royal, Neon, Ink, Pixel and Letters, or draw your own set (one drawing per piece, white and black colored for you) and give it a name.
- **Me** – your picture (a drawn face, or a photo that stays on your phone – other players online see your drawn face), ratings and a rating graph, every game you've played (review, analyse, or copy them all as PGN), bots beaten, settings (6 board colors, light/dark, sounds, vibration…).

## How strong the bots are
Measured with `tools/calibrate-bots.js` (30–44 games per pair). Ratings add up the steps from Pip, set at 250.

| Bot | Plays by | Beats the bot below | Rating |
|---|---|---|---|
| Pip | 1 move ahead, very loose | – | 250 |
| Juniper | 1 move ahead, loose | 74% | 450 |
| Otto | 1 move ahead | 80% | 650 |
| Mabel | 2 moves ahead, loose | 77% | 850 |
| Ravi | 2 moves ahead | 73% | 1050 |
| Selma | 2 moves ahead, careful | 78% | 1250 |
| Hector | 2 moves ahead, very careful | 73% | 1450 |
| Yuki | searches 600 positions | 73% | 1650 |
| Dmitri | searches 900 positions | 83% | 1900 |
| Wren | searches 1,500 positions | 76% | 2100 |
| Atlas | searches 2,400 positions | 81% | 2350 |
| Titan | full engine, 2.5 s a move | won both test games | ~2800 (estimate) |
| Trying Pip | full engine, 10 s a move | not measured | 3500 (a label, not a measurement) |

The searching bots use a fixed number of positions, not a fixed time, so they're equally strong on any device.
These are ratings against each other; how they compare to people's ratings is a rough guess.

## How the game rating works
Game Review estimates the rating each side played at. One game's accuracy is a rough guide on its own, so the estimate is the
rating that best explains three things together: the accuracy (compared with how accurately bots of each rating play), the result
against an opponent of known strength (by the usual Elo odds – losing to a much stronger player says little, beating one says a lot),
and the player's own established rating, when there is one. Measured on 310 bot games, the old accuracy-only formula was off by about
590 points on average; the new estimate is off by about 200 when the player's rating is known, and about 515 from accuracy and result alone.

## Files
- `public/` – the app (plain HTML/CSS/JS, no build step). Rules: `public/js/chess.js`. Engine: `public/js/engine.js`, run in a background thread by `engine-worker.js`.
- `server.js` – serves the app and connects online players. `chess-server.js` – matchmaking, clocks, ratings; every move is checked with the same `chess.js` the app uses.
- `filter.js` – keeps player names friendly (no links, contact details or rude words).
- `public/js/coach.js` – Coach Mira: how she judges and explains moves (tested in `test/coach.test.js`), and the coach in a game.
- `public/js/botplay.js` – how each bot picks its moves. `tools/calibrate-bots.js` plays bots against each other to measure them:
  `node tools/calibrate-bots.js play hector yuki 40 out.json`, then `node tools/calibrate-bots.js report out.json`.
- `tools/calibrate-review.js` – measures Game Review's game rating: bots play each other, every game is reviewed, and each side's accuracy is stored next to its real rating
  (`node tools/calibrate-review.js play 100 out1.json 1`, several at once, then `node tools/calibrate-review.js fit out*.json` prints the table for `public/js/rating.js`).
- `tools/make-puzzles.js` – makes the puzzles. Bots play each other, and when one blunders the engine checks that only one move wins.
  Run `node tools/make-puzzles.js <seed> <games> out.json` (several at once is faster), then `node tools/make-puzzles.js merge public/js/puzzles.js out*.json`.
- `test/` – `npm test` runs the rules tests (perft move counts, SAN/PGN, draws, every opening line and puzzle), the engine tests, the coach tests, and an online test with two players
  (including a server restart). `npm run test:browser` plays through the app in a headless browser (needs Playwright). GitHub runs both on every push.

Players are known by a secret token saved on their device; only its hash is stored on the server. Updates reach installed apps by themselves.
