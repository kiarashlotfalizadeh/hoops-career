# Hoops Career

A mobile-first basketball GM **and** head-coach game, built as an installable offline PWA with Capacitor shells for Android and iOS. It starts in the 2026-27 season with real rosters, and its main feature is a tactics layer that tells you *why* things happen.

## What's in the box

**Possession-by-possession engine** (`src/core/sim/engine.ts`)
- Every half-court trip runs a concrete action: pick & roll, isolation, post-up, handoffs/off-ball screens, or motion/cuts/drive-and-kick. Transition, putbacks, presses and end-of-game situations are modeled too.
- Defense chooses its PnR coverage (drop, switch, hedge, blitz, ice), base scheme (man, 2-3, 3-2), help level, ball pressure, physicality, transition defense, press and a star plan (deny or double).
- Each tactical effect is tagged with its expected-points value (e.g. "drop coverage conceded pull-ups: +3.4"). That is what drives the post-game report, live assistant tips and the Tactics Lab.
- Rotations follow a minute-by-minute stint plan built from your depth chart. The staff overrides it for fouls, fatigue, injuries and blowouts. You can also sub manually during live games.
- Calibrated to 2025-26 league averages: pace ≈ 100, ORtg ≈ 114, ~41% of shots from three, about 27 assists per team game with NBA-like assisted shares, and turnover, rebounding, foul and block rates within 5%. A full season sims in about 8 s on a laptop.

**Coaching & understanding**
- **Tactics**: playbooks with live "fit" scores for your roster, every slider explained in place, and Simple/Advanced/Expert depth. Expert mode adds roles, shot freedom, screeners and late-game rules.
- **Tactics Lab**: runs real engine games in a Web Worker. *Project* your plan against any opponent, *Compare* before vs after your edits (paired seeds, honest error bars), or let the assistant generate *Counters* and test each one.
- **Live game**: an animated 2D court driven by the engine's possession logs, plus timeouts, subs, in-game tactic changes, and assistant alerts ("their PnR handler is scoring 1.35 PPP against your drop: switch to hedge?").
- **Post-game "Why"**: the ranked factors that decided the game, with point values and advice. Also four factors, play-type PPP, lineups, player grades, shot charts, score flow and play-by-play.
- **Rotation**: reorderable depth chart, minute targets, caps, closers, rest on back-to-backs, and a 48-minute stint-plan visual.

**League systems**: the real 2026-27 schedule (82 games, 41 at home; fictional leagues get a generated NBA-format one), the NBA Cup, standings with NBA tiebreakers (multi-team ties broken as a group), play-in, 2-2-1-1-1 playoffs, All-Star selection and game, full awards (MVP, DPOY, ROY, 6MOY, MIP, COY, All-NBA, All-Defense, All-Rookie, Finals MVP), history and Hall of Fame. Also the 2019-odds draft lottery, generated draft classes with combine data, re-signing, a 30-day free agency, trades (validation, AI valuation, "what would make this work?", AI offers), morale and role expectations, injuries and load management, development (age curves, training focus, coaching, practice intensity, minutes), finances and owner job security.

**Simplified CBA**: soft cap (free agents need cap space unless signed for the minimum), unlimited re-signing of your own players, luxury tax, 125% + $100K salary matching when over the cap, a 13-15 man roster in season (up to 21 in the offseason), up to three two-way contracts outside the roster and the cap, player and team options decided after the draft (you choose on your own team options), protected draft picks, rookie scale, and dead money for releases. Players on expiring deals can't be traded after the season, and free agents can be signed in preseason, the regular season and free agency.

**NBA Cup** (`src/core/league/cup.ts`): six groups of five, drawn each season from pots by last season's record, play four group games on Cup nights in November (Tuesdays and Fridays). The three group winners and the best runner-up in each conference reach the December knockouts: quarterfinals and semifinals at the better seed, then a championship on a neutral floor. Group, quarterfinal and semifinal games count in the standings; the championship counts in neither the standings nor season stats. As in the NBA, 80 games per team are scheduled up front with the knockout window kept clear, and once the groups are decided the teams that didn't advance (and quarterfinal losers) get their last games there, so everyone plays 82. Group ties break on head-to-head, point differential and points scored in group games, then last season's record. The League hub has a Cup tab (group tables, bracket, championship); the winner, runner-up and Cup MVP go into awards and history.

AI front offices pick a strategy by where their roster ranks (about ten contenders, ten rebuilders), trade among themselves a few times a season, and trim to the roster limits with an eye on the money they'd still owe.

## Real data

The seed combines several public sources, all fetched by scripts in `scripts/data/`:

| Source | What it provides |
|---|---|
| **Basketball Reference** | The current contracts table (who plays where in 2026-27, salaries, options), roster pages (height, weight, birth date, jersey, country, college), draft pages, and per-game and advanced tables for 2023-24 to 2025-26 |
| **NBA.com** play-by-play (cdn.nba.com) and season matchups (stats.nba.com), archived by the public [shufinskiy/nba_data](https://github.com/shufinskiy/nba_data) dataset | Every shot with its zone and type (pull-up, drive, cut, lob, putback, post move, transition), who assisted it, blocks, steals, turnover and foul types, substitutions (lineups), and who guarded whom |
| **ESPN college box scores** via [sportsdataverse/hoopR-mbb-data](https://github.com/sportsdataverse/hoopR-mbb-data) | 2024-25 and 2025-26 college production for incoming rookies |
| **NBA.com league schedule** (`scheduleLeagueV2_1.json` on NBA.com's public S3 bucket) | The real 2026-27 regular season: every published game with its date and home team |
| **RealGM future draft picks** via [calebcpratt-git/nba-roster-builder](https://github.com/calebcpratt-git/nba-roster-builder) (daily scrape, pinned to a commit in `scripts/data/extra/sources.ts`) | Who owns every 2027-2033 first- and second-round pick, with protections, swaps and pick pools. [LD Sport's table](https://github.com/tobeyhirsch/nba-draft-pick-grader) is used as a cross-check |
| **ESPN injury report** via [BenoParadise/nba-injuries](https://github.com/BenoParadise/nba-injuries) (hourly mirror; [sportsdataverse](https://github.com/sportsdataverse/sportsdataverse-data) injury history as a backup) | Who is out on opening night, and until when |
| **SalarySwish contracts** via nba-roster-builder | Two-way contracts |

stats.nba.com, ESPN and Basketball Reference block many cloud IPs, so everything except the Basketball Reference pages comes from GitHub-hosted mirrors or NBA.com's S3 bucket, which download from anywhere.

```bash
npm run data:fetch       # Basketball Reference, ~90 pages at 1 request / 3.7 s, cached in data/raw/
npm run data:fetch-nba   # NBA.com play-by-play + matchups (3 seasons) and college box scores, ~90 MB
npm run data:fetch-extra # schedule, pick ownership, injuries, two-way contracts → data/raw/extra/ (--force to refresh)
npm run data:build       # parse → profile → RAPM → derive → calibrate in the engine → extras → src/data/seed.json
npm run data:extras      # refresh only the schedule / picks / injuries / two-way part of the current seed
```

Or let GitHub do it: run the **Build seed data** workflow (Actions tab → Run workflow). It fetches everything on GitHub's runners, builds and calibrates the seed, verifies the app still builds and passes its tests, and commits `src/data/seed.json` to `main`. It also keeps the Basketball Reference pages as a tarball on the `data-raw` branch, so later runs only fetch what's missing. Tick **extras_only** to just refresh the injuries, pick ownership, two-way contracts and schedule in the current seed (no recalibration). Any extra source that can't be downloaded is skipped with a warning, and the game falls back to its generated version of that part.

The current seed has 544 players: 483 under contract for 2026-27 plus the best 61 unsigned players from 2025-26. 26 players are on two-way deals (23 of them were unsigned in the contracts table, so they join their two-way teams). All 802 NBA.com players from the last three seasons are matched to their Basketball Reference ids.

What's real on opening night, besides the rosters and ratings:
- **Schedule**: the NBA's 2026-27 calendar, from opening night (Oct 20: BOS@DET, PHI@NYK, OKC@SAS) to Apr 11, with the real All-Star break (the trade deadline is set 10 days before it, as in generated seasons). Later seasons, and fictional leagues, use the generated schedule.
- **NBA Cup**: the real groups (East A: BKN, DET, MIL, ORL, TOR …) and their 60 group games on the real Cup nights (Oct 30 to Nov 27), with quarterfinals Dec 4-5, semifinals Dec 8 and the championship Dec 11. The knockout matchups and the two games for each team that doesn't reach them are decided by the simulated group stage, as the NBA will do. If a seed has no Cup data, the missing games go on open December dates instead and there is no Cup that season.
- **Draft picks**: RealGM's ownership rows for 2027-2033 (`scripts/data/extra/picks.ts`). Each pick gets exactly one owner. Pools ("less favorable of MIL and NOP") and swap rights are resolved on a projected draft order (team strength from the seed's ratings, regressed toward the middle for later years), and conditions that depend on other picks ("if DAL conveys its 2027 first", "if not already settled") are checked against picks already resolved. A pick that conveys only outside the top N ("3-30 to Charlotte") is stored as a top-N protected pick. Where several outcomes are possible, the most likely owner gets the pick. The build prints every team's first-rounders and compares them with LD Sport's table.
- **Injuries**: players listed out on opening night start injured. The time out is counted in their team's real games before the expected return date, and a return after the regular season costs playoff games too. ESPN's description is mapped to the game's injury types where one fits (Torn ACL, Hamstring Strain...), otherwise kept descriptive (Torn Labrum). Injuries are off when the league's injury setting is off.
- **Two-way contracts** are marked and don't count toward the 15-man roster.
- **Positions** come from each player's box-score position in his latest season (Basketball Reference's current roster pages only say G / F / C). Rookies without one get theirs from the G/F/C label, size and skills: a guard who handles and passes like a lead guard for his size is a PG, a forward who handles more and rebounds less is an SF.

How ratings are made (`scripts/data/`):
1. **Play-by-play profiles** (`nba/pbp.ts`): one pass over each season builds every player's shot diet by zone (the engine's zones: rim, paint, mid-range, corner three, above-the-break three) with make rates, how he creates (pull-ups, drives, cuts, post moves, putbacks, transition, share of makes assisted), assists by the zone they set up, turnover and foul types, fouls drawn, true rebound rates from on-court opportunities, and rim deterrence (opponents' rim attempts and rim FG% with him on the floor). It also rebuilds every lineup stint.
2. **RAPM** (`nba/rapm.ts`): ridge-regressed adjusted plus-minus over about 200,000 stints from three seasons (recency-weighted, home court modeled), split into offense and defense. Matchup data (`nba/matchups.ts`) adds points saved per 100 possessions guarded, relative to what the same scorers did against everyone else.
3. **Attributes** (`derive.ts`): seasons are weighted by recency and minutes (2025-26 ×1.0, 24-25 ×0.6, 23-24 ×0.3), with Bayesian priors on percentages. Finishing, floaters and mid-range come from zone make rates; handling from self-creation and lost-ball rate; passing from assist and bad-pass rates; rebounding from true rebound rates; defense from RAPM, matchup defense, rim deterrence, steals and blocks.
4. **Engine-in-the-loop calibration** (`calibrate.ts`): seasons are simulated repeatedly and each player's simulated profile is compared with his real one. Shooting ratings and hidden per-player tendencies are nudged until he reproduces it. The tendencies cover usage, three-point rate, rim, mid-range and corner-three shares, self-creation, passing, turnovers, share of rebounds, steals, blocks and fouls. The tendencies absorb role and opportunity, so they don't distort the visible ratings. So that tendencies don't overfit one context, half the calibration games use next season's rosters and half the 2025-26 teams the stats came from, each game draws the coach's playbook from his top three, and players randomly miss games so rotations get re-planned around them.
5. **Rookies and small samples**: 2026 draftees are shaped by their college production (shooter, passer, rim protector...) and leveled to their draft slot and reputation. Short NBA samples are shrunk toward the level their minutes suggest; calibration then settles again.
6. **OVR** is a fitted, size-aware blend of attributes. The weights were fitted so that real players' ratings predict half regressed box plus-minus and half RAPM, plus the minutes and usage coaches gave them (OVR vs BPM r ≈ 0.88, vs RAPM r ≈ 0.76).

`npm run real-check` simulates a season with the real league and compares every regular with his real 2025-26 numbers. With the current seed, sim-vs-real correlations over 224 regulars are 0.91 for points, 0.91 for assists, 0.94 for rebounds, 0.94 for blocks, 0.88 for threes made and 0.80 for minutes per game (coaches remember last season's roles, so real rotations carry over). Every league per-game rate (pace, points, threes, free throws, rebounds, assists, steals, blocks, turnovers, fouls) lands within 5% of the 2025-26 NBA, and shot diets match too: about 0.93 for rim share, 0.88 for mid-range share and 0.92 for three-point share. It also prints the leaders, single-game highs and the DPOY ladder, so outliers are easy to spot.

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
- **Android**: the *Android APK* workflow builds a debug APK on every push to `main` (download it from the run's artifacts). Pushing a `v*` tag attaches the APK to a release. Locally: `npm run cap:sync && npx cap open android`. The native shell adds the hardware Back button (closes sheets first, saves before leaving), haptics, edge-to-edge insets and no service worker (the files ship in the APK).
- **Android signing**: Android only installs an update signed with the same key as the installed app. Without signing secrets, each workflow run signs with a throwaway debug key, so a new build only installs after uninstalling the old one, which deletes its saves (export a backup first). To sign every build with one key, create a keystore once and keep it safe (a lost key means users must reinstall):
  ```bash
  keytool -genkeypair -v -keystore release.keystore -alias hoops -keyalg RSA -keysize 2048 -validity 10000
  base64 -w0 release.keystore   # paste the output into ANDROID_KEYSTORE_BASE64
  ```
  Then add four repository secrets (Settings → Secrets and variables → Actions): `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`hoops` above) and `ANDROID_KEY_PASSWORD`. Debug APKs are then signed with that key, and `v*` tags also get a signed release APK (`app-release.apk`) on the release. The version code is the workflow's run number, so each build counts as newer than the last.
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
  extra/           opening-night extras: real schedule, pick ownership, injuries, two-way contracts
android/, ios/     Capacitor native projects
```

## Design decisions

- Ratings are shown on a 2K-style 40-99 scale, fully visible. OVR is anchored to the league's distribution, so a 90+ is MVP-level and 75 is a quality starter. Attributes use the same 40-99 scale (league median ≈ 68).
- The contracts table includes camp deals, so some teams start with 16-20 players. AI teams make preseason cuts down to 15 standard contracts at league creation (two-way contracts don't count). If your team is over, the Assistant GM suggests who to release before opening night.
- Free agents and AI trades are tuned for casual play by default (difficulty can be changed in Settings).
- Future picks start with their real owners (2027-2033). The game's pick model is one owner per pick plus an optional top-N protection, so RealGM's conditions are simplified: swaps and "more/less favorable of" pools go to the projected outcome, protections that send the pick to a third team, or roll over to a later year, are approximated as "stays with the original team that year, obligation ends", and picks the NBA has forfeited stay with their original team.
- The real schedule is used for 2026-27 only. Games the NBA hasn't published yet are filled on open December dates.
- Team logos are original monograms in each franchise's colors (no trademarked artwork).
