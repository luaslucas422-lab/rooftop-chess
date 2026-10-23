# Rooftop Chess

A chess app for phones and computers: play online, against bots or a friend, solve puzzles, learn, and review your games.
It's a web app you install to your home screen, plus the small server that runs online games.

## Get it on your phone
1. Put the server online (below). You get a link like `https://rooftop-chess.onrender.com`.
2. Open that link on your phone. The app is at `/chess/` (the plain link takes you there).
3. **Android (Chrome):** tap **Me → Install app** (or ⋮ menu → Install app). **iPhone (Safari):** **Share → Add to Home Screen**.

It opens full screen like any app. Bots, puzzles, lessons and analysis work offline; online play needs the server.

## Put it online with Render (free)
1. Sign in at render.com with GitHub.
2. **New → Blueprint** → pick this repository. It reads `render.yaml` and sets everything up, including `CHESS_SECRET`.
   (Or **New → Web Service** with Build command `npm install` · Start command `npm start` · Instance type Free,
   and add an environment variable `CHESS_SECRET` set to any long random text.)
3. Open the link Render gives you.

On the free plan the server goes to sleep after 15 minutes with nobody connected, so the first visit after that can take up to a minute.

### Where ratings are kept
Render's free plan wipes the server's files whenever it restarts or goes to sleep. So besides the server's own copy,
each player's phone keeps a **rating card** – their ratings, signed with `CHESS_SECRET`. After a restart the phone hands the card
back and the rating returns. Nobody can make or change a card without the secret, and a card only works for the phone it was made for.
Keep `CHESS_SECRET` the same, or old cards stop working (ratings then start again from 1200).

If you want a permanent leaderboard (it otherwise only lists people who have connected since the last restart), set `DATABASE_URL`
to a Postgres database and ratings are stored there too. Note that Render's free Postgres databases expire after 30 days.

## What's in it
- **Play online** – bullet, blitz and rapid (1|0 up to 30|0): matchmaking, clocks kept on the server, Glicko ratings, draw offers, rematches, preset quick chat, premoves, leaderboard.
- **Play a friend** – a 6-letter code or a share link; casual or rated.
- **Play a bot** – 11 characters from 250 to 2300, with takebacks, hints and "beaten" badges.
- **Pass & play** – two people on one device, with an optional clock.
- **Puzzles** – 831 puzzles with your own puzzle rating, Puzzle Rush (3 minutes, 3 strikes), a daily puzzle and themes.
- **Game Review** – every move rated (best, brilliant, great, mistake, blunder…) with accuracy, an eval graph and an explanation.
- **Analysis board** – engine with the top 3 lines and an eval bar; load or copy PGN and FEN.
- **Learn** – "how the pieces move" lessons, checkmate drills against the engine, and the rules.
- **Watch** – spectate live games, or set two bots against each other.

## Files
- `chess/` – the app (plain HTML/CSS/JS, no build step). Rules: `chess/js/chess.js`. Engine: `chess/js/engine.js`, run in a background thread by `engine-worker.js`.
- `server.js` – serves the app and connects online players. `chess-server.js` – matchmaking, clocks, ratings; every move is checked with the same `chess.js` the app uses.
- `filter.js` – keeps player names friendly (no links, contact details or rude words).
- `tools/make-puzzles.js` – makes the puzzles. Bots play each other, and when one blunders the engine checks that only one move wins.
  Run `node tools/make-puzzles.js <seed> <games> out.json` (several at once is faster), then `node tools/make-puzzles.js merge chess/js/puzzles.js out*.json`.
- `test/` – `npm test` runs the rules tests (perft move counts, SAN/PGN, draws, every opening line and puzzle), the engine tests, and an online test with two players.

Players are known by a secret token saved on their device; only its hash is stored on the server. Updates reach installed apps by themselves.
