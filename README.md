# Hoops Career

A mobile-first basketball GM **and** head-coach game, built as an installable offline PWA with Capacitor shells for Android and iOS. It starts in the 2026-27 season with real rosters, and its main feature is a tactics layer that tells you *why* things happen.

## What's in the box

**Possession-by-possession engine** (`src/core/sim/engine.ts`)
- Every half-court trip runs a concrete action: pick & roll, isolation, post-up, handoffs/off-ball screens, or motion/cuts/drive-and-kick. Transition, putbacks, presses and end-of-game situations are modeled too.
- Defense chooses its PnR coverage (drop, switch, hedge, blitz, ice), base scheme (man, 2-3, 3-2), help level, ball pressure, physicality, transition defense, press and a star plan (deny or double).
- Each tactical effect is tagged with its expected-points value (e.g. "drop coverage conceded pull-ups: +3.4"). That is what drives the post-game report, live assistant tips and the Tactics Lab.
- Rotations follow a minute-by-minute stint plan built from your depth chart. The staff overrides it for fouls, fatigue, injuries and blowouts. You can also sub manually during live games.
- Calibrated to 2025-26 league averages: pace ≈ 100, ORtg ≈ 114-115, ~42% of shots from three, realistic turnover, rebounding, foul and block rates. A full season sims in about 8 s on a laptop.

**Coaching & understanding**
- **Tactics**: playbooks with live "fit" scores for your roster, every slider explained in place, and Simple/Advanced/Expert depth. Expert mode adds roles, shot freedom, screeners and late-game rules.
- **Tactics Lab**: runs real engine games in a Web Worker. *Project* your plan against any opponent, *Compare* before vs after your edits (paired seeds, honest error bars), or let the assistant generate *Counters* and test each one.
- **Live game**: an animated 2D court driven by the engine's possession logs, plus timeouts, subs, in-game tactic changes, and assistant alerts ("their PnR handler is scoring 1.35 PPP against your drop: switch to hedge?").
- **Post-game "Why"**: the ranked factors that decided the game, with point values and advice. Also four factors, play-type PPP, lineups, player grades, shot charts, score flow and play-by-play.
- **Rotation**: reorderable depth chart, minute targets, caps, closers, rest on back-to-backs, and a 48-minute stint-plan visual.

**League systems**: 82-game NBA-format schedule (41 home games each), standings with tiebreakers, play-in, 2-2-1-1-1 playoffs, All-Star selection and game, full awards (MVP, DPOY, ROY, 6MOY, MIP, COY, All-NBA, All-Defense, All-Rookie, Finals MVP), history and Hall of Fame. Also the 2019-odds draft lottery, generated draft classes with combine data, re-signing, a 30-day free agency, trades (validation, AI valuation, "what would make this work?", AI offers), morale and role expectations, injuries and load management, development (age curves, training focus, coaching, practice intensity, minutes), finances and owner job security.

**Simplified CBA**: soft cap (free agents need cap space unless signed for the minimum), unlimited re-signing of your own players, luxury tax, 125% + $100K salary matching when over the cap, a 13-15 man roster, rookie scale, and dead money for releases.

## Real data

The seed combines three public sources, all fetched by scripts in `scripts/data/`:

| Source | What it provides |
|---|---|
| **Basketball Reference** | The current contracts table (who plays where in 2026-27, salaries, options), roster pages (height, weight, birth date, jersey, country, college), draft pages, and per-game and advanced tables for 2023-24 to 2025-26 |
| **NBA.com** play-by-play (cdn.nba.com) and season matchups (stats.nba.com), archived by the public [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data) dataset | Every shot with its zone and type (pull-up, drive, cut, lob, putback, post move, transition), who assisted it, blocks, steals, turnover and foul types, substitutions (lineups), and who guarded whom |
| **ESPN college box scores** via [sportsdataverse/hoopR-mbb-data](https://github.com/sportsdataverse/hoopR-mbb-data) | 2024-25 and 2025-26 college production for incoming rookies |

stats.nba.com blocks cloud IPs, so the NBA.com data comes from those GitHub-hosted archives, which download from anywhere.

```bash
npm run data:fetch       # Basketball Reference, ~90 pages at 1 request / 3.7 s, cached in data/raw/
npm run data:fetch-nba   # NBA.com play-by-play + matchups (3 seasons) and college box scores, ~90 MB
npm run data:build       # parse → profile → RAPM → derive → calibrate in the engine → src/data/seed.json
```

Or let GitHub do it: run the **Build seed data** workflow (Actions tab → Run workflow). It fetches everything on GitHub's runners, builds and calibrates the seed, verifies the app still builds and passes its tests, and commits `src/data/seed.json` to `main`. It also keeps the Basketball Reference pages as a tarball on the `data-raw` branch, so later runs only fetch what's missing.

The current seed has 544 players: 483 under contract for 2026-27 plus the best 61 unsigned players from 2025-26. All 802 NBA.com players from the last three seasons are matched to their Basketball Reference ids.

How ratings are made (`scripts/data/`):
1. **Play-by-play profiles** (`nba/pbp.ts`): one pass over each season builds every player's shot diet by zone (the engine's zones: rim, paint, mid-range, corner three, above-the-break three) with make rates, how he creates (pull-ups, drives, cuts, post moves, putbacks, transition, share of makes assisted), assists by the zone they set up, turnover and foul types, fouls drawn, true rebound rates from on-court opportunities, and rim deterrence (opponents' rim attempts and rim FG% with him on the floor). It also rebuilds every lineup stint.
2. **RAPM** (`nba/rapm.ts`): ridge-regressed adjusted plus-minus over about 200,000 stints from three seasons (recency-weighted, home court modeled), split into offense and defense. Matchup data (`nba/matchups.ts`) adds points saved per 100 possessions guarded, relative to what the same scorers did against everyone else.
3. **Attributes** (`derive.ts`): seasons are weighted by recency and minutes (2025-26 ×1.0, 24-25 ×0.6, 23-24 ×0.3), with Bayesian priors on percentages. Finishing, floaters and mid-range come from zone make rates; handling from self-creation and lost-ball rate; passing from assist and bad-pass rates; rebounding from true rebound rates; defense from RAPM, matchup defense, rim deterrence, steals and blocks.
4. **Engine-in-the-loop calibration** (`calibrate.ts`): seasons are simulated repeatedly and each player's simulated profile is compared with his real one. Shooting ratings and hidden per-player tendencies are nudged until he reproduces it. The tendencies cover usage, three-point rate, rim, mid-range and corner-three shares, self-creation, passing, turnovers, share of rebounds, steals, blocks and fouls. The tendencies absorb role and opportunity, so they don't distort the visible ratings.
5. **Rookies and small samples**: 2026 draftees are shaped by their college production (shooter, passer, rim protector...) and leveled to their draft slot and reputation. Short NBA samples are shrunk toward the level their minutes suggest; calibration then settles again.
6. **OVR** is a fitted, size-aware blend of attributes. The weights were fitted so that real players' ratings predict half regressed box plus-minus and half RAPM, plus the minutes and usage coaches gave them (OVR vs BPM r ≈ 0.88, vs RAPM r ≈ 0.76).

`npm run real-check` simulates a season with the real league and compares every regular with his real 2025-26 numbers. With the current seed, sim-vs-real correlations are about 0.86 for points, 0.86 for assists and 0.93 for rebounds per game. Shot diets match too: about 0.93 for rim share, 0.88 for mid-range share and 0.92 for three-point share.

The pipeline is covered by parser and pipeline unit tests (CSV, RAPM, name matching), an offline end-to-end fixture (`scripts/data/test/make-fixture.ts`) and seed sanity tests. New League also offers a fictional league with real franchises.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: engine, schedule, rotations, season loop, trades, lab, parsers
npm run typecheck
npm run bench        # engine calibration bench vs 2025-26 averages
npm run season-test  # multi-season end-to-end run
npm run real-check   # one real-league season vs real 2025-26 stats
npm run build        # production PWA in dist/
npm run smoke        # browser smoke test on the production build (also runs in CI)
```

Visual QA: `node scripts/qa/tour.mjs <devServerUrl> <outDir>` screenshots every screen and tab on a phone and a tablet at six points of a season (preseason, trade deadline, after the playoffs, draft, re-sign period, free agency). `scripts/qa/full-career.mjs` plays a whole career loop through the Play menu.

## Ship to phones

- **PWA**: deploy `dist/` to any static host and use "Add to Home Screen". It works offline after the first load, and saves stay on the device (IndexedDB, with persistent storage requested). A new version downloads in the background and applies on the next launch, never mid-game.
- **Backups**: Settings → Export backup saves the league as a JSON file (the share sheet in the app, a download on the web). Import it from Settings or the start screen on any device.
- **Android**: the *Android APK* workflow builds a debug APK on every push to `main` (download it from the run's artifacts). Pushing a `v*` tag attaches the APK to a release. Locally: `npm run cap:sync && npx cap open android`. The native shell adds the hardware Back button (closes sheets first), haptics, edge-to-edge insets and no service worker (the files ship in the APK).
- **iOS**: `npm run cap:sync && npx cap open ios` on a Mac with Xcode.
- **GitHub Pages**: run the *Deploy PWA to Pages* workflow manually after setting Settings → Pages → Source to "GitHub Actions". Pages on a private repo needs a paid GitHub plan.

## Layout

```
src/core/          engine, ratings, tactics, league systems (pure TypeScript, no DOM)
  sim/             engine.ts, tactics.ts, rotationPlan.ts, log.ts
  league/          season loop, schedule, playoffs, awards, draft, FA, trades, contracts, finances...
  ai/              coachAI (auto rotations/tactics), advisor (scouting/alerts), lab (batch sims)
  analysis/        post-game report
src/state/         zustand store, IndexedDB persistence, live-game controller, lab worker client
src/ui/            screens, components, 2D court (live/)
src/workers/       Tactics Lab web worker
scripts/data/      seed pipeline: Basketball Reference fetch/parse, derive, calibrate
  nba/             NBA.com play-by-play profiles, RAPM, matchups, id crosswalk, college stats
android/, ios/     Capacitor native projects
```

## Design decisions

- Ratings are shown on a 2K-style 40-99 scale, fully visible. OVR is anchored to the league's distribution, so a 90+ is MVP-level and 75 is a quality starter. Attributes use the same 40-99 scale (league median ≈ 68).
- The contracts table includes two-way and camp deals, so some teams start with 16-20 players. AI teams make preseason cuts down to 15 at league creation. If your team is over, the Assistant GM suggests who to release before opening night.
- Free agents and AI trades are tuned for casual play by default (difficulty can be changed in Settings).
- Future draft-pick ownership starts with every team owning its own picks, because Basketball Reference's contracts table doesn't include pick trades.
- Team logos are original monograms in each franchise's colors (no trademarked artwork).
