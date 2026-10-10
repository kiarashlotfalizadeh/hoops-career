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

## Real data (Basketball Reference)

The seed is built from Basketball Reference:
- per-game and advanced tables for 2023-24, 2024-25 and 2025-26 (`/leagues/NBA_20xx_per_game.html`, `_advanced.html`)
- the current contracts table (`/contracts/players.html`), which decides who plays where in 2026-27 and their salaries
- 2026-27 and 2025-26 team roster pages (height, weight, birth date, jersey, country, college) and draft pages (draft slot)

```bash
npm run data:fetch   # polite crawler, ~90 pages at 1 request / 3.7 s, cached in data/raw/
npm run data:build   # parse → derive ratings → calibrate in the engine → src/data/seed.json
```

Or let GitHub do it: run the **Build seed data** workflow (Actions tab → Run workflow). It fetches the pages on GitHub's runners, builds and calibrates the seed, verifies the app still builds and passes its tests, and commits `src/data/seed.json` to `main`. It also keeps the raw pages as a tarball on the `data-raw` branch, so later runs only fetch what's missing.

How ratings are made (`scripts/data/derive.ts`, `scripts/data/calibrate.ts`):
1. Seasons are weighted by recency and minutes (2025-26 ×1.0, 24-25 ×0.6, 23-24 ×0.3). Shooting uses Bayesian priors, and everything is regressed toward the mean by sample size.
2. Stats are mapped to 21 attributes, and per-player tendencies (usage, three-point rate, driving, passing) are set.
3. **Engine-in-the-loop calibration**: whole seasons are simulated repeatedly, and each player's simulated per-36 profile is compared with his real one. Ratings and tendencies are nudged until he reproduces his shot volume, shot mix, 3P%/2P%, free-throw rate, assists, turnovers, rebounds, steals and blocks.
4. Players without NBA stats (2026 draftees, international signings) are rated from draft slot, age and measurables, plus scouting-consensus profiles for headline prospects.

The pipeline is covered by parser unit tests and an offline end-to-end fixture (`scripts/data/test/make-fixture.ts`). Until the seed is generated, New League offers a fictional league with real franchises.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: engine, schedule, rotations, season loop, trades, lab, parsers
npm run typecheck
npm run bench        # engine calibration bench vs 2025-26 averages
npm run season-test  # multi-season end-to-end run
npm run build        # production PWA in dist/
```

## Ship to phones

- **PWA**: deploy `dist/` to any static host and use "Add to Home Screen". It works offline after the first load, and saves stay on the device (IndexedDB).
- **Android**: the *Android APK* workflow builds a debug APK on every push to `main` (download it from the run's artifacts). Pushing a `v*` tag attaches the APK to a release. Locally: `npm run cap:sync && npx cap open android`.
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
scripts/data/      Basketball Reference fetch/parse/derive/calibrate pipeline
android/, ios/     Capacitor native projects
```

## Design decisions

- Ratings are shown on a 2K-style 40-99 scale, fully visible. The scale is anchored to the league's distribution, so a 90+ is MVP-level and 75 is a quality starter.
- Free agents and AI trades are tuned for casual play by default (difficulty can be changed in Settings).
- Future draft-pick ownership starts with every team owning its own picks, because Basketball Reference's contracts table doesn't include pick trades.
- Team logos are original monograms in each franchise's colors (no trademarked artwork).
