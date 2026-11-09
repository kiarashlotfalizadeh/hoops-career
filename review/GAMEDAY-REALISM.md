# Game-day realism review

## Update, the same day: the fixes are in (about 80 / 100)

Most of this review's fixes are now in the engine (uncommitted). The same measures, re-run with `npm run gameday-check -- --seasons 3` (3,690 games, seeds 7, 11, 23), now land 33 of 58 in the NBA's band, against 15 before.

| Measure                                      | NBA        | Before     | Now        |
| -------------------------------------------- | ---------- | ---------- | ---------- |
| Down 3, leader has the ball under 24 s: foul | 81-86%     | 0%         | 86%        |
| Down 1-2, under 24 s: foul                   | 81-82%     | 100%       | 82%        |
| Down 4-6, 24-40 s: foul                      | 71-72%     | 43%        | 72%        |
| Leader up 3 fouls, last 12 s                 | 28-30%     | 46%        | 29%        |
| Games ending within 3                        | 14-15%     | 19%        | 16%        |
| Timeouts per team-game                       | 5.4        | 1.6        | 5.1        |
| Timeouts, last 2:00 of close games           | 2.2        | 0.16       | 2.35       |
| Share of timeouts in Q4                      | 35%        | 24%        | 36%        |
| After a defensive board: shot within 6 s     | 35%        | 20%        | 34%        |
| After a make: shot in 8-12 s / 16-20 s       | 16% / 26%  | 3% / 42%   | 15% / 25%  |
| After an offensive board: action within 2 s  | 62%        | 20%        | 53%        |
| Shot-clock violations per team-game          | 0.7        | 0          | 0.65       |
| Starter's first trip to the bench            | 7.3 min    | 10.1       | 7.7        |
| Stints for 30+ minute players                | 4.0 of 9.5 | 4.9 of 7.6 | 4.1 of 9.0 |
| Technicals per game                          | 1.05       | 0          | 1.0        |
| Held balls / loose-ball fouls                | 0.8 / 1.3  | 0 / 0      | 0.8 / 1.25 |
| Foul-gap SD / games with a 15+ FTA gap       | 5.0 / 11%  | 7.2 / 21%  | 5.3 / 12%  |
| Dunks, share of shots / alley-oop FG%        | 6.2% / 82% | 14% / 100% | 6.2% / 83% |
| AI zone, share of half-court trips           | a few %    | 10%        | 6%         |

The box score held: 113.3 points per 100 possessions, 100.4 possessions, FG% 48.1, 3PA 36.5, FTA 22.1, turnovers 14.0, fouls 19.5. Player lines in `real-check`: points r 0.93, rebounds 0.95, assists 0.90, minutes 0.81 (0.78 before).

**What changed.**

- **Crunch time.** The trailing defense now plans its foul as each trip begins (`lateFoulAt`) and can foul partway through it. AI coaches have habits of their own (`coachHabits`): most foul at once, the rest try for a steal first; about 62% foul up 3, 85% take the 2-for-1. The user's side plays its settings as rules.
- **Timeouts.** The TV's timeouts at 7:00 and 3:00, late ones with the ball, Q4 timeouts spent before the 3:00 limit, and advance-the-ball in the last two minutes (a 1-3 s frontcourt setup).
- **Tempo.** Early offense off boards and steals, setups and actions drawn from a wider spread, the ball's flight to the rebound, more putbacks and kick-outs, shot-clock violations, leaders working the clock from 3:00 and trailing teams pushing.
- **The whistle.** Technicals (a second ejects), flagrants, kicked balls, loose-ball fouls, held balls and transition take fouls. The officials even out a night's _luck_, fouls called beyond what each side's play drew, so a team that draws fouls by its play keeps its edge. A small home whistle.
- **Rotations.** Stints sized to minutes (the opening one shortest), held until done, a starter kept with the second unit, and a pass that removes one-minute stints.
- **AI zone.** Played in stretches, about a quarter of the time, for staffs whose base defense is a zone.
- **Play-by-play.** Dunks, hooks, fadeaways and alley-oops come from the shooter's own size and bounce; alley-oops can miss.
- **A bug found on the way.** Oliver's assisted-share term in `analysis/advanced.ts` divided by nearly zero on a few-minute stint, and one player had 69 win shares. It is now clamped.

**Rescored.** Game flow 9, engine and tactics 8, shot profile 6.5, clock and tempo 8.5, crunch time 12.5, rotations 8, officiating 6.5, AI coaching 5.5, presentation 4.5, box score 14: about 83 by the scorecard below. Call it about 80: the live screen wasn't re-coached.

**Still open.**

- Shot locations: 34% of shots at the rim (NBA 28.7%) and 14% off cuts. Moving them flipped which offenses the AI's playbook fits favour, so they need a style refit (`scripts/style-check.ts`, `style-fit.ts`), not a constant.
- Overtime 3.4% (NBA 4.4-4.9%), blowouts of 30+ at 3.7% (6.5-7.8%), free-throw trips in close finishes 2.0 (2.6), triple-doubles at half.
- No coach's challenges, goaltending or lane violations. Switching stays rare.

**Tests.** All 93 pass, with every CI check (invariants, star-check, style gate, forecast check). Several tests measure a tactic's worth over paired games, and a change that only shifts the random stream moved those worths by up to ±0.5 a game. I raised their game counts rather than retune to noise, and the reason is noted in each test. Two "why" tag weights were re-measured: `K.switchTag` 0.5 → 0.95 and `K.crashTag.orb` 0.49 → 0.65. Star scoring needed `K.usageDamp` 9 → 9.5.

---

November 9, 2026. Scope: how a game plays out, on the floor and on the bench, compared with real NBA games. This covers the possession engine, the AI coaches, crunch time, rotations, the whistle, and what the live screen and play-by-play show. It does not cover the front office, progression or multi-season shape.

## Score: 62 / 100

**The box score is NBA-grade. The game around it is not yet.**

- **What's real.** League rates are within about 3% of the NBA, player lines track real ones (points r 0.93), and the shape of a game matches closely: lead changes, largest leads, runs, home edge, quarter scoring.
- **What isn't.** The departures cluster in time and situation:
  - Crunch time: a team down 3 never fouls.
  - Timeouts: AI coaches call about 1.6 a game against the NBA's 5.4, and almost none late.
  - Tempo: every possession runs at one speed, with no early offense, no instant putbacks and no clock-milking leads.
  - Rotations: starters' first stints run about 10 minutes against the NBA's 7.
  - The whistle: no technicals, violations or held balls.
- **What fans will notice.** The final minute is where a fan sees most of these at once. The play-by-play also makes Jalen Brunson dunk about 60 times a season.

### Scorecard

| Area                             | Weight  | Score  | Why                                                                                                                                          |
| -------------------------------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Box score and league rates       | 15      | 14     | Points, FG%, threes, free throws, turnovers, steals, blocks, efficiency and quarter scoring all within a few percent                         |
| Game flow and results            | 10      | 8.5    | Lead changes, largest leads, runs, home edge right; overtime 25% low, too many 1-3 point finishes, 10-point comebacks 15% rarer              |
| Possession engine and tactics    | 10      | 7.5    | A rich, coherent action model; AI defenses play zone 2-3 times the NBA's rate and almost never switch                                        |
| Shot profile and scoring texture | 10      | 6      | Zone FG% right; 5 points too many restricted-area shots, cuts 3× too common, second-chance points low                                        |
| Clock and tempo                  | 10      | 5      | Average pace exact, distribution far too narrow; no early offense, no tip-ins, no shot-clock violations, leads not milked                    |
| Crunch time                      | 15      | 5      | Down 3 never fouls; no late timeouts and no advancing the ball; foul up 3 overused; fouling all-or-nothing by the clock                      |
| Rotations and minutes            | 10      | 6      | Players used, top minutes and foul-outs right; first stints 3 minutes too long, 5 short stints instead of 4, all-bench units twice as common |
| Officiating and rules            | 8       | 3.5    | Penalty, resets and timeout rules right; no technicals, flagrants, held balls, violations or challenges; foul counts far too lopsided        |
| AI coaching                      | 7       | 3      | Sensible adjustments at breaks; timeouts only to stop runs; zone and foul-up-3 overused                                                      |
| Presentation                     | 5       | 3.5    | A convincing broadcast; shot descriptions ignore who shot (dunks 2.3×, alley-oops never missed)                                              |
| **Total**                        | **100** | **62** |                                                                                                                                              |

## How this was measured

- **The engine, read end to end.** All 7,500 lines of `src/core/sim/engine/`, `rotationPlan.ts`, `tactics.ts` and the AI's game plans.
- **Three simulated seasons against two real ones, by one script.** 3,693 regular-season games (league seeds 7, 11, 23) were played the way the app plays them (`createLeague` + `simDay`), with play-by-play recorded through a hook on `GameSim`'s prototype. Nothing in the engine was changed. They were compared with all 2,460 games of 2024-25 and 2025-26 from the repo's own `data/raw/games/` play-by-play and box scores. Both sides were converted to one event format, and one metrics script computed 288 measures for both.
- **The repo's `real-check`** for player lines (seed 7).
- **One live game coached in the app:** the Knicks' opener against the 76ers, at 2×, on a phone-size viewport.

Method details and caveats are at the end.

## What's genuinely realistic (protect these)

- **The box score.** Points per 100 possessions 112.7 (NBA 111.7-112.3). FG% .476 (.469-.471). 3PA 37.2 (37.0-37.3), 3P% .357 (.360-.363). Turnovers 14.1 (14.3-14.5), steals 8.3 (8.2-8.4), blocks 4.9 (4.8-4.9). And-ones 2.35 (2.25-2.37). Assisted share of makes 62% (64%). Scoring dips in the fourth quarter by about a point a team, as the NBA's does.
- **Players' lines.** Over 224 regulars, sim against real 2025-26: PPG r 0.93, RPG 0.92, APG 0.90, BPG 0.94, 3PM 0.93, minutes 0.78. Shot diets: rim share r 0.94, three-point share r 0.96.
- **The shape of a game.**

  | Measure                     | NBA        | Sim   |
  | --------------------------- | ---------- | ----- |
  | Lead changes (median, p90)  | 5-6, 15    | 5, 15 |
  | Largest lead                | 20.7-21.1  | 20.7  |
  | Biggest run                 | 11.6-11.8  | 11.5  |
  | Leader after three wins     | 82.5-84.0% | 84.3% |
  | 15 up entering the 4th wins | 98-99%     | 97.8% |
  | Home team wins              | 54.4-55.5% | 53.9% |

- **The macro rotation.** Players used per team-game 10.9 (10.7-10.8). The team's top player's minutes 36.1 (35.5-36.4). Players changed per substitution: one at a time 64% of the time in both. **Foul-outs 0.17 a game (NBA 0.18-0.21).**
  - Correction: the round-4 review and `scripts/star-check.ts:122` (`MAX_FOUL_OUTS = 130`) treat ~200 foul-outs a season as too many. The real league had 221, 216 and 261 in the last three seasons, so that WATCH line is a false alarm.
- **The rules that matter most are right.**
  - The penalty: the fifth team foul, the fourth in overtime, the second in the last two minutes.
  - The shot clock: 14 seconds after an offensive rebound, 14 or more after a side-out foul.
  - Timeouts: 4 in the fourth quarter and 2 after 3:00. In a live ball only the team with the ball may call one; the user's timeout correctly waits for the dead ball.
  - The possession arrow, the away-from-the-play rule that ends hack-a-player at 2:00, and the foul to give.
  - Holding for the last shot with time left for a putback, and a scrambled look when a trip starts with a second or two left.
- **An action model a coach recognizes.**
  - The pick-and-roll is played six ways, each with its own outcomes: drop's pull-ups, hedge's roll, blitz's 4-on-3, ice's corner, switch slips and post-mismatches, the zone's back line.
  - Help leaves kick-outs. A double hands the offense a 4-on-3.
  - Mismatch hunting and screen hunting, presses, crash-or-get-back, and fatigue that costs shooting.
  - A hot hand that only changes who shoots, not whether it goes in, is the defensible reading of the research.
- **The broadcast.**
  - The starting-lineups intro with last season's numbers, the scorebug and the league ticker.
  - Lower-thirds, run and lead-change callouts, a 2D court drawn from the engine's own possession log, and play-by-play with a voice ("Brown rattles the rim, Embiid with the dish").
  - The halftime read that separates shot luck from looks ("the 76ers' shots fell below their looks. That part is luck").

## Findings, most severe first

### 1. Crunch time: the trailing team never fouls down 3, and late fouling is all-or-nothing (P1)

**What happens.** The leader gets the ball, up 3, with 24 seconds or less left. The trailing team does not foul, the leader holds the ball, and the clock runs out. It happened in all 101 such cases in three seasons. Real teams foul 81-86% of the time.

| The leader gets the ball (defensive rebound, steal, opponent's score)  | NBA 2025-26 | NBA 2024-25 | Sim    |
| ---------------------------------------------------------------------- | ----------- | ----------- | ------ |
| Up 3, 24 s or less: trailing team fouls                                | 81%         | 86%         | **0%** |
| Up 3, 24-40 s: trailing team fouls                                     | 30%         | 37%         | 9%     |
| Up 1-2, 24 s or less                                                   | 82%         | 81%         | 100%   |
| Up 1-2, 24-40 s                                                        | 28%         | 25%         | 8%     |
| Up 4-6, 24-40 s                                                        | 72%         | 71%         | 42%    |
| Leader up 3 in the last 12 s fouls (foul up 3)                         | 30%         | 28%         | 46%    |
| Close games (within 5 at 2:00): trailing team's fouls in the last 1:00 | 1.20        | 1.27        | 0.74   |
| Close games: free-throw trips in the last 2:00                         | 2.62        | 2.56        | 1.97   |

A typical finish (sim, GSW at DEN):

1. DEN leads 120-117 with 22.7 seconds left and misses.
2. GSW rebounds, calls no timeout and misses a three at 8.5.
3. DEN rebounds and nobody fouls. Game over.

**Downstream.**

| Measure                       | NBA      | Sim  |
| ----------------------------- | -------- | ---- |
| Overtime                      | 4.4-4.9% | 3.5% |
| Games ending within 3         | 14-15%   | 19%  |
| Games decided in the last 5 s | 4%       | 6.1% |
| Blowouts of 30+               | 6.5-7.8% | 3.9% |

Late free throws are what stretch real final margins.

**Cause.**

- `src/core/sim/engine/fouls.ts:19-31` decides fouling by fixed windows. Down 1-2 fouls under 24 s, every time. Down 4-9 fouls from 30 s (50 for 7-9). Down 3 never fouls: the comment reasons that "a stop and a three tie it". That is true only when the game clock is longer than the shot clock. Under 24 s the leader just holds the ball (`clock.ts:112`, the `milk` mode).
- Foul up 3 is on for every team by default (`tactics.ts:460`), so every coach does it.

**Fix (S-M).**

- Foul whenever the trailing team is down 3 or less, the leader has the ball, and the game clock is under the shot clock.
- Make fouling a coach's tendency over time and margin, not a cliff. Draw it from a per-coach trait so some coaches try for a steal first: real leaders turn it over 7-12% of the time before the foul.
- Make foul-up-3 a per-coach trait held by about 30% of coaches.
- Then re-measure overtime and margins against the table above.

### 2. AI coaches call a quarter of the NBA's timeouts, almost none late, and the ball is never advanced (P1)

**What happens.** Every AI timeout is a run-stopper: 6,877 at 8-0, 3,777 at 9-0, 1,053 at 10-0 over 3,693 games. Real coaches spend most of their timeouts elsewhere: two or three a quarter around the mandatory spots, and a pile in the last two minutes. Those set up a play, advance the ball to the frontcourt, or rest and ice.

| Timeouts                                 | NBA 2025-26 | NBA 2024-25 | Sim      |
| ---------------------------------------- | ----------- | ----------- | -------- |
| Per team-game                            | 5.39        | 5.42        | **1.59** |
| Share in the 4th quarter                 | 35%         | 36%         | 24%      |
| Last 2:00 of games within 5 (both teams) | 2.16        | 2.25        | **0.15** |
| Last 24 s of those games                 | 1.52        | 1.53        | **0.04** |
| Coach's challenges per game              | 0.28        | 0.27        | 0        |

**On the live screen.**

- In the opener the Knicks still had all 7 timeouts at 8:23 of the third quarter. The scorebug shows it all game.
- Under 3:00 the rules cap each team at 2, and 89% of sim team-games end with both still unused (6,541 of 7,386).

**Missing entirely.**

- The last-two-minutes rule that a timeout advances the ball to the frontcourt.
- After-timeout plays in the final minute for AI teams. There is an `ato` setting, but nothing calls the timeout.
- Without these, real late-game possessions (inbound at the 28-foot line, set play, 8-14 seconds of clock) don't exist.

**Cause.** `src/core/sim/engine/coach.ts:168-180` (`autoTimeouts`) only reacts to `opp.run >= timeoutRun` (8). The possession that follows a timeout always walks the ball up (`K.setup.deadTO` = 8 s, `constants.ts:57`).

**Fix (M).**

- Add the real reasons for timeouts:
  - a timeout most quarters, roughly the mandatory spots;
  - in the last ~30 s, the trailing team after a stop or a score if it has one;
  - advance-the-ball, with a shorter setup and a frontcourt inbound set;
  - one saved for the last possession.
- Let the user's staff take the same late timeouts when the user hasn't.
- This also feeds item 1: real trailing teams usually take the timeout, then foul.

### 3. Every possession runs at one speed (P1)

**What happens.** The average pace is exact: 100.2 tracked possessions a team-game (NBA 100.4-101.1). The distribution is not. The sim builds a trip from a setup time plus 7.6-second actions (`constants.ts:57-58`), so almost every half-court trip lands in the same band.

| Time to the first shot or turnover                                             | NBA 2025-26 | NBA 2024-25 | Sim      |
| ------------------------------------------------------------------------------ | ----------- | ----------- | -------- |
| After a defensive rebound: mean                                                | 9.4 s       | 9.5 s       | 11.3 s   |
| ... within 6 s (early offense)                                                 | 35%         | 34%         | **20%**  |
| After a steal: within 6 s                                                      | 62%         | 62%         | 50%      |
| After a make: mean                                                             | 16.0 s      | 16.2 s      | 16.3 s   |
| ... in 8-12 s                                                                  | 16%         | 16%         | **2.6%** |
| ... in 16-20 s                                                                 | 26%         | 26%         | **42%**  |
| ... past 24 s (stoppages)                                                      | 6.4%        | 6.9%        | 0.8%     |
| After an offensive rebound: next action within 2 s (tips, putbacks, kick-outs) | 63%         | 62%         | **23%**  |
| Shot-clock violations per team-game                                            | 0.67        | 0.74        | **0**    |

**Late in games.** Real teams in the last 3:00 leading by 1-8 use 18 seconds or more on 58-59% of possessions after the other team scores. They do it on 33-36% after a defensive rebound. The sim does 35% and 11%: it only milks a lead under 50 seconds (`clock.ts:112`). Trailing teams push in both, but less in the sim: within 8 s on 38% of trips, against 48-51%.

**End of quarters.**

| Measure                                | NBA     | Sim |
| -------------------------------------- | ------- | --- |
| 2-for-1 taken when available           | 79-80%  | 91% |
| Q1-Q3 ending on a shot in the last 3 s | 83-88%  | 74% |
| End-of-period heaves per game          | 0.5-0.9 | 0   |

**Why it matters.**

- The court animation and play-by-play make every trip feel the same.
- The offensive glass isn't a putback game: second-chance points 12.7 against 14.1-15.0, and the immediate putback is rare (`rebounds.ts:101`).
- No possession ever dies to the shot clock, because the engine always gets the shot off (`possession.ts:241`).

**Fix (M).**

- Add an early-offense branch after defensive rebounds: secondary break, early-clock threes.
- Raise immediate putbacks, tips and kick-outs off offensive rebounds.
- Widen the setup and action time distributions.
- Allow a small stagnation chance of a shot-clock violation (~0.7 per team-game).
- Milk leads from about 3:00, scaled by margin, and hurry from the same point when trailing.
- Make 2-for-1 a per-coach habit, not universal.

### 4. The play-by-play describes shots without looking at the shooter (P2, but the most visible)

**What happens.** `shotDesc` (`src/core/sim/engine/shots.ts:468-494`) picks the word from the zone and play type only.

- A made finish at the rim off a roll, cut or run-out is called a dunk half to three-quarters of the time, whoever made it (`:481`). Any other make at the rim is a dunk a quarter of the time (`:482`).
- Only made shots are ever called alley-oops.
- Hooks, fadeaways and turnarounds are described only out of post-ups.

| Per season            | NBA 2025-26 | Sim (average of 3) |
| --------------------- | ----------- | ------------------ |
| Dunk attempts, league | 13,473      | ~30,400            |
| Jalen Brunson's dunks | 0           | 60                 |
| Trae Young's          | 0           | 52                 |
| Stephen Curry's       | 1           | 58                 |
| Luka Dončić's         | 4           | 90                 |
| Nikola Jokić's        | 22          | 189                |
| Joel Embiid's         | 17          | 140                |
| Rudy Gobert's         | 211         | 95                 |

| Share of FGA (league)      | NBA      | Sim      |
| -------------------------- | -------- | -------- |
| Dunks                      | 6.1-6.2% | 14.2%    |
| Hooks                      | 2.6-2.8% | 0.4%     |
| Fadeaways                  | 3.4-3.6% | 0.4%     |
| Turnarounds                | 3.9-4.2% | 0.4%     |
| Alley-oops per team-game   | 1.39     | 2.58     |
| FG% on alley-oops          | 82-83%   | **100%** |
| FG% on shots called layups | 57-58%   | **42%**  |

The NBA figures for dunks come from last-name matches in the play-by-play.

In the live opener: "Maxey finishes with the dunk", then "Alley-oop, Hart to Clarkson". It's what a fan screenshots.

**Fix (S).**

- Pass the shooter to `shotDesc`.
- Draw dunk/layup/hook/fadeaway from his own mix. `data:build` can fit each player's dunk share of rim attempts from the play-by-play it already reads (`subType` DUNK/Layup/Hook, `descriptor` fadeaway/turnaround/driving).
- Allow missed alley-oops.

### 5. Rotations: starters stay in too long at first, then come and go in short stints (P2)

| Measure                                                               | NBA 2025-26        | NBA 2024-25     | Sim                 |
| --------------------------------------------------------------------- | ------------------ | --------------- | ------------------- |
| A starter's first trip to the bench (median)                          | 7:16 into the game | —               | **10:03**           |
| A team's first substitution                                           | 5.3 min            | 5.6 min         | 6.3 min             |
| Stints for players with 30+ minutes                                   | 4.05 of 9.2 min    | 3.82 of 9.8 min | **4.87 of 7.6 min** |
| Substitutions per team-game                                           | 31.1               | 28.6            | 37.7                |
| Time with no starter on the floor                                     | 5.0%               | —               | **10.7%**           |
| Time with all five starters                                           | 24.5%              | —               | 28.1%               |
| Subs per team in the last 2:00 of a close 4th (offense-defense swaps) | 2.33               | 2.18            | 0.73                |
| Minutes per starter                                                   | 29.7               | 30.5            | 28.8                |

**In the opener.** Brunson, Hart, Bridges and Anunoby all played the first 10 minutes. Then a five-man bench unit closed the first quarter. Real coaches pull a starter or two around 6:00 and stagger, keeping one or two starters with the bench.

**Stars.** Several heliocentric stars play 2-4 minutes under their real minutes (real-check, seed 7): Dončić 32.5 (35.8), Jokić 31.6 (35.2), Durant 32.9 (36.5), Booker 31.5 (34.0). Most others land within a minute.

**Cause.**

- `src/core/sim/rotationPlan.ts:217` lets a stint run 6-12 minutes by endurance, and the greedy per-minute plan pins all five starters from the tip.
- The second half is planned backwards, and fatigue and foul-trouble checks add extra on-off cycles.
- Nothing swaps a defender for a shooter on dead balls late.

**Fix (M).**

- Cap first stints at about 6-8 minutes.
- Stagger: keep one or two starters with the second unit.
- Aim for four stints of about 9 minutes for 30-minute players.
- Add late offense-defense substitutions at dead balls.

### 6. The whistle: missing events, the wrong kinds of fouls, and counts far too lopsided (P2)

**Missing entirely.**

| Per game                                                                                | NBA 2025-26 | NBA 2024-25 | Sim |
| --------------------------------------------------------------------------------------- | ----------- | ----------- | --- |
| Technical fouls                                                                         | 1.07        | 1.04        | 0   |
| Flagrants (per team-game)                                                               | 0.10        | 0.06        | 0   |
| Ejections (per 100 games)                                                               | 5.3         | 7.3         | 0   |
| Held-ball jump balls                                                                    | 0.81        | 0.74        | 0   |
| Violations: kicked ball, goaltending, delay of game, lane                               | 1.73        | 1.72        | 0   |
| Shot-clock, 3-second, backcourt, 8-second and other violation turnovers (per team-game) | 1.0         | 1.1         | 0   |

The only technical in the engine is the one charged when a disqualified player has to stay in (`fouls.ts:203`).

**The wrong kinds of fouls.** The total is right: 19.6 a team-game (18.6-19.9). The mix isn't.

| Per team-game            | NBA      | Sim |
| ------------------------ | -------- | --- |
| Common fouls (reach-ins) | 5.7-6.0  | 8.5 |
| Loose-ball fouls         | 1.2-1.4  | 0   |
| Transition take fouls    | ~0.4     | 0   |
| Shooting fouls           | 9.8-10.4 | 9.4 |
| Offensive fouls          | 1.4-1.5  | 1.7 |

There are no illegal-screen calls: the only offensive fouls are charges.

**Lopsided nights.** Real officiating evens out foul counts within a game; the sim treats each foul as independent.

| Per game                           | NBA 2025-26 | Sim       |
| ---------------------------------- | ----------- | --------- |
| Foul difference between teams (SD) | 5.0         | **7.1**   |
| Free-throw-attempt difference (SD) | 9.2         | **11.7**  |
| Games with a 15+ FTA gap           | 11.4%       | **20.8%** |
| Team-games with 28+ fouls          | 2.4-3.9%    | **7.3%**  |
| Home team's FTA edge               | +0.6        | 0         |

The live opener ended Knicks 29 fouls, 76ers 15, and FTA 37-15 the other way. At halftime it was already 17 fouls to 7.

**Fix (M).**

- Add technicals at about one a game (one free throw; ejection after a second).
- Add loose-ball fouls on rebounds and take fouls in transition, taken out of the reach-in rate.
- Add held balls, kicked balls (retained, 14-second reset), goaltending, 3-second and backcourt calls.
- Add a light foul-balancing term (the side with fewer fouls is a little likelier to be called) and a small home edge on the whistle.
- Add coach's challenges for user and AI.

### 7. Shot locations and play types lean to the rim and to cuts (P2)

| Share of FGA      | NBA        | Sim   | FG% NBA    | FG% sim |
| ----------------- | ---------- | ----- | ---------- | ------- |
| Restricted area   | 28.5-28.8% | 33.8% | 65.2-65.8% | 64.3%   |
| Paint (non-RA)    | 18.4-18.7% | 13.7% | 44.2-44.4% | 46.7%   |
| Mid-range         | 10.8-11.2% | 9.8%  | 44.3-44.6% | 43.0%   |
| Corner three      | 10.8%      | 9.4%  | 38.6-38.8% | 37.9%   |
| Above-break three | 30.6-31.1% | 33.3% | 35.0-35.4% | 35.0%   |

- **Cuts.** Shots off cuts are 14.1% of FGA, against 4.1-4.5% for the NBA's own "cutting" tag (a scorer's tag, so the gap is approximate). Possessions finished by a cut are 12.5% at 1.43 points each. Public play-type data has put cuts at roughly 7-8% of offense.
- **Other play types.** The sim's play-type mix (share of possessions, points per possession):

  | Play type        | Share | PPP  |
  | ---------------- | ----- | ---- |
  | Spot-up          | 25.7% | 1.07 |
  | Transition       | 12.1% | 1.27 |
  | P&R ball handler | 11.9% | 1.01 |
  | P&R roll man     | 10.9% | 1.19 |
  | Handoff          | 7.0%  | 1.03 |
  | Off screen       | 6.4%  | 1.05 |
  | Isolation        | 4.7%  | 0.98 |
  | Post-up          | 4.0%  | 1.04 |
  | Putback          | 2.9%  | 1.40 |

  Next to typical published splits, that is too much roll and cut, too little ball-handler and isolation, and transition and putbacks are too efficient. The league total still lands on the NBA's efficiency because the parts offset.

- **Scoring sources.** Assisted threes are 79% (NBA 83-85%). Second-chance points 12.7 (14.1-15.0). Fast-break points 17.2 (15.2-15.5).

**Fix (M).** Shift weight from roll and cut finishes to ball-handler pull-ups and floaters (the paint band). Recheck the zone shares in `real-check` at league level, not only per player.

### 8. AI defenses zone too much and almost never switch (P2)

**What happens.**

- AI teams play a 2-3 zone on 9.6% of half-court possessions. Cleveland does it on 35%, Indiana and Brooklyn on 26%, and 18 of 30 teams on 5% or more.
- The NBA's zone usage is a few percent league-wide, with only a handful of teams near double digits.
- In the opener the staff's pre-game plan, and its call in the first quarter, were both "2-3 zone". The 76ers opened the season in one.

**Ball screens.** When a pick-and-roll is run:

| Coverage | Share |
| -------- | ----- |
| Drop     | 38%   |
| Hedge    | 23%   |
| Ice      | 21%   |
| Zone     | 10%   |
| Switch   | 4.2%  |
| Blitz    | 3.4%  |

Switching is a staple of modern NBA defenses, far more common than 4%.

**Coverage churn.** AI adjustments run 2.35 a game. They are mostly flipping drop to hedge and back: 3,421 "drops the big" against 2,298 "hedges instead of dropping".

**Cause.**

- The zone is a full preset (`tactics.ts:156`) chosen where it measures best.
- The tactical leverage doubles every scheme's edge (`constants.ts:514`, `tacticEdge: 2`, "the owner's call"), so the measured best drifts to extremes more often than real coaches do.

**Fix (S-M).**

- Cap base-zone usage and give zone teams a man-to-man base with zone stretches.
- Make switching the coverage for switchable rosters.
- Damp repeat flip-flops: one change of coverage a game unless it is being punished.

### 9. Big nights are too rare: triple-doubles at half, 50-point games under half (P2)

| Per season                   | NBA 2025-26 | NBA 2024-25 | Sim (3 seasons) |
| ---------------------------- | ----------- | ----------- | --------------- |
| Triple-doubles               | 136         | 149         | 62-78           |
| 50-point games               | 17          | 18          | 3-11            |
| 40-point games               | 133         | 139         | 100-152         |
| Double-doubles per team-game | 0.78        | 0.91        | 0.69            |

**Leaders and spread.**

- The scoring leader sits around 28-29 points a game. The real leader was Dončić at 33.5 in 2025-26.
- Assists pile onto some guards: Brunson 9.1 a game (6.6), Trae Young 10.6 (8.0).
- Game-to-game spread is a little wide: an SD of 8.6-9.1 points for 22+ PPG scorers, against 8.1.

**Cause.** Mostly the heliocentric stars' minutes (item 5) and the point-center's rebound share (Jokić 9.6 against a real 12.9).

**Fix.** Mostly falls out of item 5. Then check the rebound distribution for hub bigs.

### 10. Smaller things seen live (P3)

- **Two timeouts charged a minute apart.** I asked for a timeout during the 76ers' run; it waited for the dead ball. The staff then called its own run timeout at 8:12, and mine was still charged at 7:00. A waiting request should be satisfied by any timeout at that dead ball.
- **The timeout callout comes late and gives a different reason.** "Knicks call timeout. The 76ers' 8-0 run" appears a possession after the timeout, and once more for the user's timeout under a "12-2 run" heading.
- **"Tired or in foul trouble" suggests one player for four spots at once** ("Anunoby in" next to Brunson, Clarkson, Alvarado and Hart).
- **Rebounds land at the same tenth of a second as the miss.** In the real logs the rebound comes a median 3 seconds after the shot (only 8% at the same second); the court's timing would read better with the gap.
- **In-game injuries are frequent: 0.87 a game ("X is injured and leaves the game").** I couldn't verify a real rate from play-by-play, but nearly one a night looks high. Worth checking against injury-report data.
- **The OT tip has no play-by-play line.** The opening tip has one.

### A note on the tactical leverage

`tacticEdge: 2` makes every tactical edge twice the size its 1× tables give. That is a deliberate realism trade for agency. The round-4 game-day lens measured following every staff call at about +1 point a game, so even doubled, coaching effects stay inside what real adjustments plausibly move. It's not counted as a defect here. But it is part of why defenses drift to zone and away from switching (item 8).

## What it would take to reach 80, then 90

1. **Crunch time (items 1-2), about +10.** Foul down 3, fouling as a coach's tendency over time and margin, per-coach foul-up-3, late timeouts with advance-the-ball, AI after-timeout plays. Re-measure overtime and margins.
2. **Tempo (item 3), about +4.** Early offense, immediate putbacks, a wider time distribution, shot-clock violations, leaders milking from 3:00.
3. **Rotations (item 5), about +3.** Shorter first stints, staggering, four stints, late offense-defense swaps.
4. **Whistle (item 6), about +3.** Technicals, loose-ball and take fouls, held balls and violations, foul balancing, a home whistle.
5. **Play-by-play by player (item 4), about +1.5.**

That is about 80. Past it, item 7's shot locations and play-type mix, item 8's zone and switching, and item 9's star nights take it toward 90.

**Make it stay fixed.** Add the end-game, timeout, tempo and rotation measures in the appendix to CI next to `real-check`. The harness and the shared metrics script used here can be added to `scripts/` for that.

## Appendix: the comparison

Three simulated seasons (3,693 games, seeds 7, 11, 23) against every regular-season game of the last two NBA seasons, through the same metrics script.

| Area     | Measure                                           | NBA 2025-26 | NBA 2024-25 | Sim (3 seasons) |
| -------- | ------------------------------------------------- | ----------- | ----------- | --------------- |
| Results  | Points per team-game                              | 115.6       | 113.8       | 112.7           |
| Results  | Total points SD                                   | 19.9        | 19.8        | 21.3            |
| Results  | Margin SD                                         | 16.4        | 15.9        | 14.9            |
| Results  | Home win %                                        | 55.5%       | 54.4%       | 53.9%           |
| Results  | OT rate                                           | 4.4%        | 4.9%        | 3.5%            |
| Results  | Final margin ≤3                                   | 14.4%       | 15.0%       | 19.0%           |
| Results  | Final margin ≥20                                  | 22.9%       | 21.1%       | 19.8%           |
| Results  | Final margin ≥30                                  | 7.8%        | 6.5%        | 3.9%            |
| Results  | Q4 points per team                                | 27.7        | 27.5        | 27.3            |
| Flow     | Lead changes per game                             | 6.78        | 6.64        | 6.33            |
| Flow     | Ties per game                                     | 4.51        | 4.40        | 4.17            |
| Flow     | Largest lead                                      | 21.1        | 20.7        | 20.7            |
| Flow     | Winner never trailed                              | 11.6%       | 12.1%       | 14.9%           |
| Flow     | Won after trailing by 10+                         | 26.9%       | 28.0%       | 23.5%           |
| Flow     | Won after trailing by 15+                         | 8.5%        | 9.1%        | 7.8%            |
| Flow     | Q1 leader wins                                    | 65.4%       | 66.7%       | 70.1%           |
| Flow     | Q3 leader wins                                    | 82.5%       | 84.0%       | 84.3%           |
| Flow     | Biggest run per game                              | 11.8        | 11.6        | 11.5            |
| Flow     | Games with a 10-0 run                             | 78.5%       | 78.9%       | 75.6%           |
| Box      | FG%                                               | 47.1%       | 46.9%       | 47.6%           |
| Box      | 3PA per team-game                                 | 37.0        | 37.3        | 37.2            |
| Box      | 3P%                                               | 36.0%       | 36.3%       | 35.6%           |
| Box      | FTA per team-game                                 | 23.5        | 21.7        | 21.3            |
| Box      | Assists per team-game                             | 26.7        | 26.5        | 25.7            |
| Box      | Turnovers per team-game                           | 14.5        | 14.3        | 14.1            |
| Box      | OREB%                                             | 25.8%       | 25.0%       | 24.1%           |
| Box      | Points per 100 possessions                        | 112.3       | 111.7       | 112.7           |
| Box      | Possessions per team-game (tracked)               | 101.1       | 100.4       | 100.2           |
| Shots    | Restricted-area share of FGA                      | 28.8%       | 28.5%       | 33.8%           |
| Shots    | Paint (non-RA) share                              | 18.4%       | 18.7%       | 13.7%           |
| Shots    | Mid-range share                                   | 11.2%       | 10.8%       | 9.8%            |
| Shots    | Corner-3 share                                    | 10.8%       | 10.8%       | 9.4%            |
| Shots    | Above-break-3 share                               | 30.6%       | 31.1%       | 33.3%           |
| Shots    | Restricted-area FG%                               | 65.8%       | 65.2%       | 64.3%           |
| Shots    | Paint (non-RA) FG%                                | 44.4%       | 44.2%       | 46.7%           |
| Shots    | Mid-range FG%                                     | 44.6%       | 44.3%       | 43.0%           |
| Shots    | Assisted share of makes                           | 63.7%       | 63.7%       | 62.1%           |
| Shots    | Assisted share of made 3s                         | 85.4%       | 83.4%       | 79.1%           |
| Shots    | Blocked share of FGA                              | 5.4%        | 5.5%        | 5.6%            |
| Shots    | And-ones per team-game                            | 2.37        | 2.25        | 2.35            |
| Shots    | Dunks, share of FGA                               | 6.2%        | 6.1%        | 14.2%           |
| Shots    | FG% on shots called layups                        | 58.0%       | 57.1%       | 42.1%           |
| Shots    | Hooks, share of FGA                               | 2.6%        | 2.8%        | 0.4%            |
| Shots    | Alley-oop attempts per team-game                  | 1.39        | 1.39        | 2.58            |
| Shots    | Second-chance points                              | 15.0        | 14.1        | 12.7            |
| Shots    | Fast-break points                                 | 15.2        | 15.5        | 17.2            |
| Clock    | Secs to first shot/TO after a defensive rebound   | 9.4         | 9.5         | 11.3            |
| Clock    | ... within 6 s                                    | 35.4%       | 34.4%       | 20.5%           |
| Clock    | Secs to first shot/TO after a make                | 16.0        | 16.2        | 16.3            |
| Clock    | ... in 8-12 s                                     | 16.4%       | 15.7%       | 2.6%            |
| Clock    | ... in 16-20 s                                    | 25.5%       | 25.9%       | 41.7%           |
| Clock    | Next action within 2 s of an offensive rebound    | 62.9%       | 61.6%       | 23.4%           |
| Clock    | Shot-clock violations per team-game               | 0.67        | 0.74        | 0.00            |
| Clock    | 2-for-1 taken when available                      | 79.6%       | 79.2%       | 90.8%           |
| Clock    | Q1-Q3 last shot in final 3 s                      | 88.0%       | 82.6%       | 73.6%           |
| End game | Timeouts, last 2:00 of games within 5             | 2.16        | 2.25        | 0.15            |
| End game | FT trips, last 2:00 of games within 5             | 2.62        | 2.56        | 1.97            |
| End game | Trailing team fouls, last 1:00                    | 1.20        | 1.27        | 0.74            |
| End game | Foul to stop the clock, leader up 1-2 (last 0:40) | 58.7%       | 56.1%       | 50.8%           |
| End game | ... leader up 3                                   | 57.9%       | 62.6%       | 3.1%            |
| End game | ... leader up 4-6                                 | 57.5%       | 55.2%       | 40.5%           |
| End game | Leader fouls when up 3 (last 0:12)                | 30.2%       | 28.1%       | 45.8%           |
| End game | Game decided in the last 5 s                      | 4.0%        | 4.1%        | 6.1%            |
| Rotation | Minutes before a team's first sub                 | 5.3         | 5.6         | 6.3             |
| Rotation | Substitutions per team-game                       | 31.1        | 28.6        | 37.7            |
| Rotation | Stints, players with 30+ min                      | 4.05        | 3.82        | 4.87            |
| Rotation | Stint length, players with 30+ min (min)          | 9.2         | 9.8         | 7.6             |
| Rotation | Subs per team, last 2:00 of close Q4              | 2.33        | 2.18        | 0.73            |
| Rotation | Players used per team-game                        | 10.8        | 10.7        | 10.9            |
| Rotation | Minutes, team's top player                        | 35.5        | 36.4        | 36.1            |
| Rotation | Minutes per starter                               | 29.7        | 30.5        | 28.8            |
| Rotation | Foul-outs per game                                | 0.21        | 0.18        | 0.17            |
| Whistle  | Personal fouls per team-game                      | 19.9        | 18.6        | 19.6            |
| Whistle  | Common (non-shooting) fouls                       | 6.0         | 5.7         | 8.5             |
| Whistle  | Shooting fouls                                    | 10.4        | 9.8         | 9.4             |
| Whistle  | Loose-ball fouls                                  | 1.42        | 1.19        | 0.00            |
| Whistle  | Take fouls                                        | 0.37        | 0.39        | 0.00            |
| Whistle  | Offensive fouls                                   | 1.46        | 1.39        | 1.73            |
| Whistle  | Technicals per game                               | 1.07        | 1.04        | 0.00            |
| Whistle  | Flagrants per team-game                           | 0.10        | 0.06        | 0.00            |
| Whistle  | Coach's challenges per game                       | 0.28        | 0.27        | 0.00            |
| Whistle  | Out-of-bounds turnovers                           | 2.91        | 2.84        | 0.68            |
| Whistle  | Bad-pass turnovers                                | 5.19        | 5.15        | 7.38            |
| Coaching | Timeouts per team-game                            | 5.39        | 5.42        | 1.59            |
| Coaching | Share of timeouts in Q4                           | 35.0%       | 35.6%       | 24.4%           |
| Players  | Triple-doubles per game                           | 0.111       | 0.121       | 0.057           |
| Players  | Team-games with a 50-point scorer                 | 0.69%       | 0.73%       | 0.31%           |
| Players  | Team-games with a 40-point scorer                 | 5.4%        | 5.6%        | 4.9%            |
| Players  | Team's top scorer, points                         | 27.5        | 27.9        | 27.1            |

## Method and caveats

**Simulated side.**

- `createLeague` from the committed seed, staff-run rotations and tactics for every team (the user team too), injuries on, regular season only.
- Play-by-play was turned on per game through a wrapper on `GameSim.prototype.step`. Shot zones, turnover actors and free-throw trips were read from wrappers on `shoot`, `turnover` and `freeThrows`. The engine's own draws are untouched.
- The sim's play-by-play text was parsed into the event format. One parser bug (names ending in "Jr." at a sentence end) was found and fixed before the numbers above.

**Real side.**

- `data/raw/games/PlayByPlay.parquet` (NBA.com's live play-by-play) and `PlayerStatisticsExtended.csv`, 2024-25 and 2025-26 regular seasons, all 1,230 games each.
- Lineups rebuilt from substitutions match the box-score minutes within a minute for 99.99% of players.

**Caveats.**

- **Clock precision.** Real clocks are whole seconds outside the last minute.
- **Descriptor tags** (cutting, driving, fadeaway) are the scorer's in the NBA data and come from the play type and the description in the sim, so compare them as approximate.
- **Pace.** The box-score pace here (FGA + 0.44 FTA − OREB + TOV) runs higher than the 99.6 in `TARGETS`. Both sides use the same formula.
- **Play-type comparisons** are to rough published splits, not to the Synergy data, which isn't in the repo.
- **One live game** only, so the live screen observations are anecdotes. The endgame ones are backed by the tables.
- **Not measured.** Playoffs, generated leagues, later seasons, and phones.

**Scripts** (session scratchpad, not in the repo): the harness, the real-data normalizer, the shared metrics script and the one-off analyses. They can be moved into `scripts/` to make this repeatable.
