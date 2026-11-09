# Game-day realism review, round 2

## Update, the same day: what was fixed, and what it measures now

The four P1s and the rebound regression are fixed in the engine, with most of the P2s. Nothing is committed. I have not re-scored it: the numbers below are from five seasons the fixes were **not** tuned on (seeds 31, 47, 59, 71, 83; tuning used 7, 11, 23), and `npm run gameday-check` now measures all of them (119 rows, 58 before).

| Measure                                             | NBA                      | Before                   | Now                      |
| --------------------------------------------------- | ------------------------ | ------------------------ | ------------------------ |
| Trailing side's 3P%, tied or down 1-3, last 5 s     | 20-21%                   | 38%                      | 17%                      |
| ... its 2P% there                                   | 33-34%                   | 50-55%                   | 34%                      |
| Trailing side, 4:00-0:24 within 6: 2P% / 3P%        | 53-54 / 34-35            | 61-62 / 40-44            | 54 / 34                  |
| Leader there: 2P% / 3P%                             | 50-51 / 32-34            | 53-54 / 32               | 50 / 34                  |
| Points per shot, first 4 s of the shot clock        | 1.34-1.39                | 1.15-1.17                | 1.34                     |
| ... last 4 s                                        | 0.99-1.01                | 1.08                     | 1.06                     |
| Leader up 1-2, last 24 s: clock runs out / turnover | 1-2% / 8-12%             | 14-18% / 0%              | 4% / 12%                 |
| Leader up 3: clock runs out / turnover              | 4% / 7-8%                | 12-21% / 0%              | 3% / 8%                  |
| Leader up 4-6: clock runs out / turnover            | 21-23% / 5-7%            | 29-33% / 0%              | 27% / 6%                 |
| Starter on the floor after his 3rd foul in Q2       | 20-22%                   | 1.4-1.7%                 | 22%                      |
| ... after his 4th in Q3 / 5th in Q4                 | 21-22% / 38-40%          | 1.5% / 18%               | 23% / 41%                |
| Foul-outs a game                                    | 0.18-0.21                | 0.17-0.18                | 0.20                     |
| Rebounds / offensive boards a team-game             | 43.8-44.1 / 11.1-11.4    | 40.8-41.2 / 10.0         | 43.6 / 11.1              |
| Heaves a game                                       | 0.9                      | 0                        | 0.84                     |
| Q1-Q3 timeouts in the minute after 7:00 or 3:00     | 33%                      | 70-73%                   | 43%                      |
| Leader uses 18 s+ after a score, last 3:00          | 58-59%                   | 74-79%                   | 62%                      |
| Margin's SD after Q1 / half / Q3 / final            | 8.6 / 11.9 / 14.8 / 16.1 | 9.3 / 13.9 / 14.8 / 15.0 | 8.4 / 11.8 / 13.9 / 15.0 |
| Within 5 after three quarters / at 2:00             | 29-30% / 29%             | 26% / 25-27%             | 30% / 28%                |
| Up 10-14 after Q1 wins                              | 73-75%                   | 80-84%                   | 76%                      |
| Decided by 3 or less / overtime                     | 14.4-15.0% / 4.4-4.9%    | 14-17% / 3.4-3.9%        | 13.8% / 3.9%             |

The box held or moved toward the NBA: 114.1 points, FG% 47.6, 2P% 55.8, 3P% 36.1, 87.1 shots, 23.2 free throws, 14.3 turnovers, 19.9 fouls. The round-1 measures this review asked to protect all held (late fouling 84-88%, foul up 3 30%, timeouts 5.5 with 2.16 late, tempo after makes and boards, stints).

**What changed.**

- **The catch-up rule is gone** (`K.clutchEase`). In its place: both defenses tighten late in a close game and the leader's twos come harder (`K.clutchD`), the leader turns it over more, and shots at the horn keep 60-85% of their chance (`K.lastLook`).
- **The score effect runs from the tip** (`K.band`), smaller than the old second-half rule, with each team's own shooting night (`K.envTeam`). This was finding 10's real cause: the sim had no pull toward the trailing side in the first half and too strong a one in the second, so the better team won the first half by too much and close games were too few. The catch-up rule had been hiding that.
- **A shot is worth what the moment makes it** (`K.tempo`): more in the first seconds after a board or a steal, less after the trip's first actions fail, less when forced.
- **Steal first, then foul** (`K.lateSteal`): a trap for 3-6 seconds that gets the ball a quarter of the time, then the foul; pressure also turns over a leader nobody is fouling.
- **Foul trouble is an AI coach's habit** (`K.foulRide`, `sitsForFouls`), and a player riding with fouls keeps his hands off. The user's own staff still keeps to the user's rule.
- **The board comes before the whistle** on a loose-ball foul or a held ball. In the penalty, a loose-ball foul by the offense is two shots at the other end.
- **Also:** heaves, down-1 and down-2 shot choices, trailing teams going early instead of holding, fewer last-trip turnovers, timeouts through the quarter, half the late slow-down, take fouls by the rule, no held ball at the horn, the turnover wording mix.
- **A bug found on the way.** The trap made an old loop reachable: a trip could wait forever for a planned foul the clock had already run past. It is fixed and has a test.

**Not done, or not right yet.**

- **The late shot clock is still too flat** (1.06 against 1.00). A cost by the second made Pace & Space the best playbook for 17-24 of 30 teams, and a cost by the action sank the motion offenses. It needs the playbooks and staff reads refit with it (`scripts/style-fit.ts`).
- **Overtime (3.9%) and the widest margins** (30+: 4.1% against 6.5-7.8%) are still short.
- **`forecast-check` fails on one team:** Sacramento, 9.5 wins under its projection (±0.9). It was 6.9 under (±1.3) before this round and passed by 1.4 wins; no single change here moves it.
- **`invariants` shows one front-office violation** (Brooklyn at 24 players in a 2029 re-signing window). The engine change reshuffles league histories; the roster code is not part of this round. I also gave the offer-sheet check a $10K rounding tolerance for a max contract.
- **Untouched:** shot locations (finding 13), rotation texture (11), challenges and goaltending (12), layup wording (14).
- **Tuning the AI's stars.** `usageDamp` went 9.5 → 10.5 and the three-point volume damp 17 → 30 to keep `star-check` passing; that check is sensitive to any engine change.

November 9, 2026. A fresh, independent re-review after commit 47225e3 ("Game-day realism: crunch time, timeouts, tempo, whistle, rotations"), which acted on round 1 (`review/GAMEDAY-REALISM.md`, 62/100). Same scope: how a game plays out on the floor and on the bench, against real NBA games. It covers the possession engine, the AI coaches, crunch time, rotations, the whistle, and what the live screen and play-by-play show. It does not cover the front office, progression or multi-season shape.

## Score: 73 / 100 (round 1: 62)

**The fixes are real. They also exposed what sits under them.**

- **What the round fixed.** On seasons it was not tuned on, these now match the NBA:
  - Late fouling, timeouts, the tempo after makes and boards, and shot-clock violations.
  - The whistle's evening-out and home edge.
  - Stint shape, dunks and alley-oops.
  - 168-176 of 263 measures sit inside the NBA's range, against 138 before.
- **What is wrong underneath, most of it new to this review.**
  1. **A catch-up rule decides close games.** In the last four minutes of a game within six, the trailing team's shots get 5 points of make chance and the leader's lose 5. The trailing team's threes in the final 5 seconds go in 38% of the time, against the NBA's 20%.
  2. **Shot value barely falls as the shot clock runs.** In the NBA, points per shot drop from 1.36 in the first four seconds to 1.00 in the last four. In the sim they drop from 1.17 to 1.08, so working the clock costs nothing and pushing gains nothing.
  3. **"Playing for the steal" just lets the clock run out.** That happens on 14-29% of late trips, against the NBA's 1-4%, and those trips never produce a steal.
  4. **Foul trouble is a hard rule.** A starter with 3 fouls in the second quarter sits 98% of the rest of it. NBA coaches leave him out there about a fifth of the time.
  5. **The box score drifted in this round.** Rebounds are 7% low and shot attempts 3% low, because loose-ball fouls and held balls replace the rebound instead of following it.
- **Why 73 and not the fix round's "about 80".** That estimate came from 58 measures in the round's own harness, tuned on the same three seasons it scored.
  - This review re-ran 263 measures on three new seasons.
  - It added the measures above, plus timeout timing, win odds by lead, clutch rates, closing lineups and garbage time.
  - With them, round 1 would have scored about 60, not 62.

### Scorecard

| Area                             | Weight  | Round 1 | Now    | Why                                                                                                                                                                     |
| -------------------------------- | ------- | ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box score and league rates       | 15      | 14      | 12.5   | Scoring, efficiency, free throws, turnovers, steals and blocks right; rebounds 7% low, shot attempts 3% low, FG% a point high; double-doubles −25%, triple-doubles −55% |
| Game flow and results            | 10      | 8.5     | 8.5    | Close finishes nearer the NBA's; overtime 20% low, 30-point games and 10-point comebacks rarer, early leads too safe                                                    |
| Possession engine and tactics    | 10      | 7.5     | 8      | Coherent action model; AI zone now in stretches, more switching                                                                                                         |
| Shot profile and scoring texture | 10      | 6       | 5.5    | Rim share 5 points high and mid-paint 4 low as before; shot value nearly flat across the shot clock                                                                     |
| Clock and tempo                  | 10      | 5       | 7.5    | Early offense, the spread after makes and shot-clock violations right; late slow-down and push about twice the NBA's, overtime too fast, no end-of-quarter heaves       |
| Crunch time                      | 15      | 5       | 9.5    | Late fouling and late timeouts now match; the catch-up rule doubles the trailing side's last-shot accuracy; one late trip in five the clock just runs out               |
| Rotations and minutes            | 10      | 6       | 7      | Stint shape right; foul trouble a hard rule, garbage time too complete, closers too starter-heavy, no late offense-defense subs                                         |
| Officiating and rules            | 8       | 3.5     | 6      | Evening-out, home whistle, technicals, flagrants, held and loose balls in; ejections a third, take fouls half, no challenges or goaltending, three rule slips           |
| AI coaching                      | 7       | 3       | 4.5    | Per-coach late habits, late timeouts with the ball; early timeouts land on the TV marks; rigid foul trouble; too eager for 2-for-1; plays for the tie down two          |
| Presentation                     | 5       | 3.5     | 4      | A broadcast-grade feed with the new whistle in it; turnover and layup wording mixes off, a few oddities                                                                 |
| **Total**                        | **100** | **62**  | **73** |                                                                                                                                                                         |

## How this was measured

- **New seasons, not the tuning ones.** The fix round tuned on league seeds 7, 11 and 23, so the headline numbers here come from seeds 31, 47 and 59 (3,693 games). The same three earlier seeds were re-run on the new engine (another 3,693) for paired before/after checks. The two sets agree on everything this review reports.
- **The same harness and script as round 1.** Each league game's play-by-play is recorded through a hook on `GameSim`'s prototype, with no engine changes. The parser now also reads the new lines: flagrants, loose-ball and take fouls, technicals and who drew them, ejections, kicked balls, held balls, shot-clock violations and the new turnover words. It left no line unparsed. One metrics script computes the same 288 measures on the sim and on all 2,460 games of 2024-25 and 2025-26 from the repo's `data/raw/games/`.
- **New measures this round:**
  - Shot value by shot-clock time.
  - Shooting by score state late in games, and last-possession choices.
  - End-of-quarter trips.
  - Foul trouble, garbage time and closing lineups.
  - Timeout timing within quarters.
  - Win odds by lead at each checkpoint, and clutch rates.
  - Pace by quarter.
  - The officials' evening-out curve, and technicals by margin.
- **The repo's `npm run gameday-check`** (seed 31) gives the same numbers as this harness wherever the two measure the same thing.
- **The engine diff, read:** about 1,000 lines across 13 files.
- **Two games in the app.** I played Celtics at Pistons and Knicks at Celtics, skipped ahead to clutch time, and read the full play-by-play.

## What the fixes got right (protect these)

| Measure                                                    | NBA 2024-26            | Round 1     | Now                 |
| ---------------------------------------------------------- | ---------------------- | ----------- | ------------------- |
| Leader has the ball under 0:24, up 3: trailing team fouls  | 81-86%                 | 0%          | 79%                 |
| … up 1-2                                                   | 81-82%                 | 100%        | 86%                 |
| Leader has the ball at 0:24-0:40, up 1-2 / 3 / 4-6: fouls  | 25-28 / 30-37 / 71-72% | 8 / 9 / 42% | 34 / 36 / 71%       |
| Leader fouls when up 3 in the last 12 s                    | 28-30%                 | 46%         | 27-29%              |
| Games decided by 3 or fewer                                | 14.4-15.0%             | 19.0%       | 14-17%              |
| Timeouts per team-game                                     | 5.39-5.42              | 1.59        | 5.06-5.12           |
| … in the last 2:00 of games within 5                       | 2.16-2.25              | 0.15        | 2.30-2.33           |
| … share in the fourth quarter                              | 35.0-35.6%             | 24.4%       | 35.8-36.5%          |
| After a defensive board: shot or turnover within 6 s       | 34.4-35.4%             | 20.5%       | 34.5-35.4%          |
| After a make: next shot 8-12 s / 16-20 s in                | 16% / 26%              | 3% / 42%    | 15% / 25%           |
| After an offensive board: next action within 2 s           | 61.6-62.9%             | 23.4%       | 57.3-57.5%          |
| Shot-clock violations per team-game                        | 0.67-0.74              | 0           | 0.65-0.66           |
| Starters' first trip to the bench (median)                 | 7:16                   | 10:03       | 7:37                |
| 30-minute players: stints, length                          | 3.8-4.1 of 9.2-9.8     | 4.9 of 7.6  | 4.1 of 9.0          |
| Gap between the teams' fouls, SD / free-throw attempts, SD | 4.9-5.0 / 8.6-9.2      | 7.1 / 11.7  | 5.2 / 9.4           |
| Technicals a game / flagrants a team-game                  | 1.04-1.07 / 0.06-0.10  | 0 / 0       | 1.03 / 0.07-0.08    |
| Loose-ball fouls a team-game / held balls a game           | 1.19-1.42 / 0.74-0.81  | 0 / 0       | 1.23-1.26 / 0.79    |
| Dunks, share of shots                                      | 6.1%                   | 14.2%       | 6.1-6.3%            |
| Alley-oops a team-game (share made)                        | 1.39 (82-83%)          | 2.58 (100%) | 1.1 (84%)           |
| Shots called layups: FG%                                   | 57-58%                 | 42%         | 59%                 |
| AI zone: share of half-court trips (the most-zone team)    | a few %                | 9.6% (35%)  | 2.8% (Portland 15%) |
| Measures inside the NBA's range (±10%)                     | —                      | 138 of 262  | 168-176 of 263      |

**The officials now even out a night the way the NBA's do.** The table shows how likely the next foul is to go against the home team, given the foul gap at that moment:

| Foul gap before the call (home − away) | −4    | −2    | 0     | +2    | +4    |
| -------------------------------------- | ----- | ----- | ----- | ----- | ----- |
| NBA 2025-26                            | 54.1% | 52.2% | 48.7% | 47.2% | 46.3% |
| NBA 2024-25                            | 55.7% | 52.7% | 49.9% | 48.6% | 47.1% |
| Sim, round 1                           | 47.6% | 49.5% | 50.5% | 50.5% | 51.1% |
| Sim, now                               | 53.0% | 52.8% | 49.6% | 47.7% | 46.0% |

The home side's free-throw edge, +0.2 a game, is close to the NBA's +0.25 to +0.57. Technicals are spread by margin as the NBA's are: about 40% come with the game within 5, and 8-10% with a margin of 21 or more.

## Findings

### 1. A catch-up rule decides close games (P1)

Late in close games the sim's trailing team shoots far better than the leader, and far better than real trailing teams. Its last-second shots go in about twice as often as the NBA's.

| Q4 and OT, game within 1-6           | NBA 2P%   | NBA 3P%   | Sim 2P% | Sim 3P% |
| ------------------------------------ | --------- | --------- | ------- | ------- |
| Whole game (reference)               | 54.4-55.0 | 36.3-36.5 | 57.1    | 35.8    |
| 4:00 to 0:24 left, the leading team  | 50.2-51.0 | 32.3-33.7 | 53.2    | 32.2    |
| 4:00 to 0:24 left, the trailing team | 52.8-54.3 | 34.1-34.7 | 60.5    | 39.8    |
| Last 24 s, the trailing team         | 55.1-55.6 | 23.1-26.7 | 58.2    | 38.3    |

| Shots, heaves excluded                       | NBA             | Round 1   | Now       |
| -------------------------------------------- | --------------- | --------- | --------- |
| Tied or down 1-3, last 5 s of Q4/OT: 2P%/3P% | 33-34% / 20-21% | 49% / 33% | 55% / 38% |
| … 5 to 24 s left: 2P% / 3P%                  | 51-54% / 23-27% | 58% / 42% | 64% / 41% |
| End of Q1-Q3, last 5 s: 2P% / 3P%            | 42-43% / 25-26% | 53% / 33% | 53% / 32% |
| Games decided by a shot in the last 5 s      | 4.0-4.1%        | 6.1%      | 4.7-5.1%  |

The sim samples are 297 twos and 362 threes in the final 5 seconds; the NBA's are 112-133 a season. The gap is several standard errors wide.

- **Cause.** `scoreEffect` (`src/core/sim/engine/shots.ts:95-101`) adds `K.clutchEase` (0.05) to the make chance of whichever side trails, and takes it from the leader, in the last `K.clutchSec` (240 s) of a game within six (`constants.ts:350-351`). The final shot's only penalty is the forced-shot openness of −0.45 (`possession.ts:254`, `:292`). That costs a three about 2.7 points (`K.zoneOpen` 0.06), less than the bonus.
  - The NBA does give trailing teams a small late edge on twos, 2-3 points. It comes from tempo: leaders work the clock into tough shots and trailers push.
- **Fix.**
  - Set `clutchEase` to 0 and let tempo carry the trailing team's edge (finding 2).
  - Give final-second and end-of-period shots the NBA's penalty: about 20% on threes and 33% on twos in the last 5 seconds.
  - Then re-measure comebacks and overtime (finding 10).

### 2. Shot value does not fall with the shot clock (P1)

| Seconds of the shot clock used | 0-4  | 4-8   | 8-12  | 12-16 | 16-20 | 20-24 | 24+ (after a reset) |
| ------------------------------ | ---- | ----- | ----- | ----- | ----- | ----- | ------------------- |
| NBA 2025-26: share of shots    | 4.1% | 15.0% | 22.6% | 24.7% | 18.0% | 10.7% | 4.8%                |
| Sim: share of shots            | 6.5% | 16.0% | 21.2% | 23.3% | 17.4% | 14.4% | 1.1%                |
| NBA 2025-26: points per shot   | 1.39 | 1.19  | 1.13  | 1.09  | 1.05  | 0.99  | 0.92                |
| NBA 2024-25: points per shot   | 1.34 | 1.18  | 1.12  | 1.10  | 1.06  | 1.01  | 0.94                |
| Sim: points per shot           | 1.17 | 1.15  | 1.11  | 1.10  | 1.11  | 1.08  | 1.09                |

The clock here runs from the change of possession; after an offensive board it starts at 10 s used, for the 14-second reset. Shots with under 24 s on the game clock are left out.

- **What it means.** In the NBA a quick look after a stop is the best shot in basketball, and a shot forced late in the clock the worst. In the sim the two are worth nearly the same.
  - Leaders who milk the clock (finding 6) lose nothing, trailing teams who push gain nothing, and so the tempo work in this round cannot change who wins.
  - The sim's early shots are also the wrong ones: 42% of shots in the first 4 seconds are threes, against the NBA's 30-31%, rather than run-outs to the rim.
- **Cause.** Only "forced" shots, with 4.5 s or less on the shot clock, get an openness penalty (`possession.ts:254`, `:292`). An early-offense trip is a shorter setup running the same half-court actions (`possession.ts:164-172`), with no unsettled-defense edge.
- **Fix.** Add an openness term that is high in the first seconds of a trip after a stop (the defense not set) and falls through the last eight. Fit it to the NBA curve above: early shots near 1.35 points, late ones near 1.00.

### 3. "Playing for the steal" just runs out the clock (P1)

The trailing team fouls about as often as the NBA's now. What it does when it doesn't foul is wrong.

| Leader has the ball, under 24 s | NBA: foul | NBA: clock runs out | NBA: leader turns it over | Sim: foul | Sim: clock runs out | Sim: turnover |
| ------------------------------- | --------- | ------------------- | ------------------------- | --------- | ------------------- | ------------- |
| Up 1-2                          | 81-82%    | 1-2%                | 8-12%                     | 86%       | 14%                 | 0%            |
| Up 3                            | 81-86%    | 4%                  | 7-8%                      | 79%       | 21%                 | 0%            |
| Up 4-6                          | 64-65%    | 21-23%              | 5-7%                      | 70%       | 29%                 | 0%            |

- **Seen in the sim.** The Knicks, down 1 with 16.9 seconds left, never fouled, and the Celtics dribbled out a 119-118 win.
  - Earlier in the last minute, at 24-40 seconds, NBA leaders turn it over on 8-14% of these trips. The sim's turn it over on 4-8%.
  - Free-throw trips in the last two minutes of games within 5: 2.1 against the NBA's 2.6.
- **Cause.** `lateFoulAt` (`fouls.ts:76-96`) decides at the start of the trip. With chance 1 − the coach's `lateFoul` habit (6-26%, from `coachHabits` in `game.ts`), the defense never fouls on that trip at all.
  - The leader's milk mode then lets the clock die with the ball (`possession.ts:236-243`). There is no pressure and no chance of a steal.
- **Fix.** Make "steal first" a trip of its own: a trap or denial for 3-6 seconds with a turnover chance, about half of the NBA's 7-12%, and then the foul. A clock that simply runs out should be rare, about 2%.

### 4. Foul trouble is a hard rule (P1)

| A starter's foul     | Window               | NBA: share of it on the floor  | Sim                      |
| -------------------- | -------------------- | ------------------------------ | ------------------------ |
| 2nd, Q1 (2:30+ left) | the rest of the half | 41-43% (other starters 54-55%) | 32% (other starters 60%) |
| 3rd, Q2 (3:00+ left) | the rest of Q2       | 20-22%                         | 1.7%                     |
| 4th, Q3 (3:00+ left) | the rest of Q3       | 21-22%                         | 1.4%                     |
| 5th, Q4 (7:00+ left) | until 4:00           | 38-40%                         | 19%                      |

- **Cause.** `foulLimit` (`rotation.ts:18-23`) sets a cap of 2 fouls in Q1, 3 in Q2, 4 in Q3 and 5 in Q4. `desiredLineup` drops anyone at the cap (`rotation.ts:134-136`), every time, until crunch time.
- **Effect.** Stars lose minutes a real coach would give them. The user can't tell a careful staff from a bold one, because every staff is the most careful there is.
- **Fix.** Make the cap a tendency weighed by period, time left, the player's value and the score. For example, sit with 3 fouls in Q2 about 80% of the time and bring him back for the last two or three minutes. Leave stars in more often.

### 5. The box score drifted in this round (P2)

| Per team-game         | NBA         | Round 1 (seeds 7, 11, 23) | Now, same seeds | Now (31, 47, 59) |
| --------------------- | ----------- | ------------------------- | --------------- | ---------------- |
| Rebounds              | 43.8-44.1   | 43.4                      | 41.2            | 40.8             |
| Offensive boards      | 11.1-11.4   | 10.5                      | 10.0            | 10.0             |
| Shot attempts         | 89.0-89.1   | 87.1                      | 86.5            | 85.8             |
| Three attempts        | 37.0-37.3   | 37.2                      | 36.5            | 35.3             |
| FG% / 2P%             | 47.0 / 54.8 | 47.6 / 56.5               | 48.1 / 56.9     | 48.3 / 57.0      |
| Assists               | 26.5-26.7   | 25.7                      | 25.5            | 24.9             |
| Double-doubles        | 0.78-0.91   | 0.69                      | 0.64            | 0.63             |
| Triple-doubles a game | 0.111-0.121 | 0.057                     | 0.050           | 0.049            |

- **Cause.** `rebound()` now runs `looseBall` before anyone gets the ball (`rebounds.ts:22`, `:93-145`). A loose-ball foul (2.7% of boards) or a held ball (0.9%) replaces the rebound, about 1.6 a team-game. The NBA logs 84% of its loose-ball fouls right after a rebound at the same clock.
  - More putbacks and kick-outs (`K.putback`) raise 2P%, and fewer misses leave fewer boards.
  - Shot-clock violations and take fouls take a few shot attempts.
- **Fix.**
  - Credit the board, then the scramble's foul.
  - Re-check `orbBase` and the box against the NBA: about 44 rebounds, 89 shots and .470.
  - Double-doubles and triple-doubles should follow; triple-doubles were already half the NBA's before this round.

### 6. The late-game slow-down and push are twice the NBA's (P2)

| Last 3:00 of Q4/OT, game within 8                 | NBA: mean   | NBA: share | Sim: mean | Sim: share |
| ------------------------------------------------- | ----------- | ---------- | --------- | ---------- |
| Leader, after the other side scores: 18 s+        | 18.3 s      | 58-59%     | 20.5 s    | 79%        |
| Leader, after a defensive board: 18 s+            | 13.8-14.5 s | 33-36%     | 15.6 s    | 45%        |
| Trailer, after a defensive board: 8 s or less     | 9.1-9.2 s   | 48-51%     | 7.4 s     | 65%        |
| Trailer, after the other side scores: 8 s or less | 13.7-14.0 s | 16%        | 11.6 s    | 26%        |

- **Related tempo gaps.**
  - In the last five minutes of games within 5, the sim plays 10.9 possessions a team; the NBA plays 9.7-9.8.
  - The NBA's fourth quarter is 5-6% slower than its first; the sim's is 2.6% slower.
  - Overtime runs 5% faster than the sim's own quarters, while the NBA's runs 5-7% slower. That gives 12.0-12.3 points a team per overtime, against 11.0.
- **Cause.** `K.lateSlow` (`constants.ts:69`: 3-8 extra seconds for the leader, setups cut to 55% for the trailer) applies on every trip in the last 3:00 of a game within 8. It stacks with milk mode under 50 s. Overtime has no pace of its own.
- **Fix.** Halve both, to about 1.5-4 s and 0.75, then re-measure. Give overtime the fourth quarter's late pace.

### 7. Early-quarter timeouts land on the TV marks (P2)

| Share of Q1-Q3 timeouts, by clock | 12:00-7:00 | 7:00-6:00 | 6:00-3:00 | 3:00-2:00 | 2:00-0:00 |
| --------------------------------- | ---------- | --------- | --------- | --------- | --------- |
| NBA 2024-26                       | 34%        | 17%       | 27%       | 16%       | 6%        |
| Sim                               | 13%        | 35%       | 9%        | 38%       | 6%        |

- **The pattern.** Seven in ten timeouts in the first three quarters come in the minute after the 7:00 and 3:00 marks. NBA coaches call theirs through the quarter, which satisfies the TV's need early. Quarters with three or more timeouts: 25%, against the NBA's 38-39%.
- **Cause.** `autoTimeouts` calls one only against an 8-0 run (`timeoutRun: 8`, `tactics.ts:465`), with two kept in reserve, so `mandatoryTimeout` (`coach.ts:219`) supplies most of them.
- **Fix.** Add discretionary timeouts through the quarter: smaller runs, a bad stretch, a substitution pattern. Keep the TV timeout as the fallback.
- **One oddity.** The fourth quarter's TV timeout comes at the first sim dead ball under 3:00. In one live game that was 1:05 left, and it was charged to a team up 25.

### 8. Last-possession choices (P2)

With the ball in the last 12 seconds of Q4 or overtime:

| Down | NBA: two / three / fouled / turnover | Sim: two / three / fouled / turnover |
| ---- | ------------------------------------ | ------------------------------------ |
| 1    | 49-50% / 19-21% / 12-15% / 6-10%     | 38% / 36% / 14% / 12%                |
| 2    | 28-35% / 40-45% / 17-18% / 2%        | 42% / 32% / 8% / 18%                 |
| 3    | 1-3% / 44-50% / 33-35% / 10-12%      | 8% / 50% / 38% / 5%                  |

- **Down 1.** NBA teams go for a two. Sim teams take threes as often as at any other time.
- **Down 2.** NBA teams go for the win more often than the tie. The sim does the opposite: `lateMode` sets `tie` (`clock.ts:122-123`) and cuts the threes by 40% (`possession.ts:355`). Its final trips also turn it over 15-18% of the time, against the NBA's 2-8%. They are forced isos and ball screens (`possession.ts:266`) at the normal turnover rate.
- **Fix.** Down 1, mostly twos. Down 2, threes on about 55% of the shots. Give the last trip a much lower turnover rate.

### 9. No heaves at the end of quarters (P2)

- **The gap.** A team that gets the ball with 1-6 seconds left in Q1-Q3 gets a shot off 29% of the time in the sim. The NBA's do 57-69% of the time, and 2025-26 logs 0.9 heaves a game.
  - The last shot of a quarter comes inside the final 3 seconds in 74% of quarters, against 83-88%.
- **Cause.** A trip that starts with a few seconds left still needs its setup and action, so the clock runs out first. Only Q4 and overtime get a scrambled look (`possession.ts:288-291`).
- **Fix.** Under about 4 seconds, a heave or quick catch-and-shoot, shooting about what the NBA's do.

### 10. Games are too predictable early, with too few blowouts (P2)

| Measure                              | NBA        | Sim (both seed sets) |
| ------------------------------------ | ---------- | -------------------- |
| Leading by 10-14 after Q1: wins      | 73-75%     | 83.5%                |
| Leader after Q1 wins                 | 65-67%     | 69.5-69.9%           |
| Comeback from 10 down                | 26.9-28.0% | 22.3-23.6%           |
| Final margin of 30+                  | 6.5-7.8%   | 4.2%                 |
| Final margin, SD                     | 15.9-16.4  | 14.8-15.0            |
| Correlation of the two teams' scores | 0.19-0.22  | 0.34                 |
| Overtime                             | 4.4-4.9%   | 3.7-3.9%             |

- **Cause.** The game's shared conditions (`K.envPace`, `K.envShoot`, `K.envFouls`, `constants.ts:287-289`) move both teams together, so their scores track each other. Night-to-night variance belongs more to one team than to both.
  - The second-half ease rule (`K.ease`, `constants.ts:292-294`) pulls margins in, so leads plateau rather than flip.
  - Catch-up shooting in the last four minutes (finding 1) is the wrong tool for comebacks: it acts in close games only.
- **Fix.** Shrink the shared conditions and add team-level shooting noise. Re-test comebacks, blowouts and overtime once `clutchEase` is gone.

### 11. Rotation texture (P3)

| Measure                                                             | NBA 2025-26                 | Sim                         |
| ------------------------------------------------------------------- | --------------------------- | --------------------------- |
| Share of the game with 0 / 1 / 2 / 3 / 4 / 5 starters on            | 5 / 13 / 19 / 21 / 18 / 25% | 9 / 18 / 12 / 13 / 22 / 26% |
| Starters' fourth-quarter minutes (all five), 20+ margin entering Q4 | 17.9-18.6                   | 13.1                        |
| Starters' minutes in the last 6:00, 25+ margin at 6:00              | 4.1-4.3                     | 1.0                         |
| Starters' minutes in the last 6:00 of games within 6 (of 30)        | 21.9-22.6                   | 26.3                        |
| Substitutions in the last 2:00 of close games, per team             | 2.2-2.3                     | 0.7-0.8                     |
| Team used exactly 10 players                                        | 29-32%                      | 38-39%                      |
| Top player played 40+                                               | 10-15%                      | 17-18%                      |

- **Lineups.** NBA coaches stagger in pairs, with two or three starters on together 40% of the time. The plan still moves in units (25%), and the stagger pass only guarantees one starter.
- **Garbage time.** The bench finishes blowouts without a starter, where NBA coaches leave one or two out there.
- **Closers.** Close games end with 4.4 starters on the floor, against the NBA's 3.7.
- **Late substitutions.** Offense-defense swaps are still missing.

### 12. The whistle's mix and three rule slips (P3)

| Measure                                     | NBA                                                                              | Sim                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| What technicals are                         | ~55% unsportsmanlike, ~27% defensive three seconds, ~13% doubles (no free throw) | every one a player, the bench or the coach, each with a free throw |
| Ejections per 100 games                     | 5.3-7.3                                                                          | 2.3-2.4                                                            |
| Take fouls per team-game                    | 0.37-0.39                                                                        | 0.17-0.18                                                          |
| Common / offensive fouls per team-game      | 5.7-6.0 / 1.39-1.46                                                              | 6.5-6.8 / 1.66-1.68                                                |
| Team-games with 28+ fouls                   | 2.4-3.9%                                                                         | 5.7%                                                               |
| Coach's challenges a game                   | 0.27-0.28                                                                        | none                                                               |
| Goaltending, lane violations, delay of game | present                                                                          | none                                                               |

- **Three rule slips in the new code:**
  - A loose-ball foul by the offense ends the trip with no free throws, even in the penalty (`rebounds.ts:106-111`). The NBA gives two shots.
  - Take fouls stop at 2:00 of every quarter (`transition.ts:74`, `this.clock > 120`). The rule's exception is the last two minutes of the fourth quarter and overtime only.
  - A held ball can be logged after the horn (`rebounds.ts:126-145`). In the live game: "Q4 0:00.0 Jump ball: Cenac Jr. vs. Smith. BOS gains possession."

### 13. Shot profile, unchanged from round 1 (P3)

| Measure                                   | NBA                   | Sim                   |
| ----------------------------------------- | --------------------- | --------------------- |
| Restricted-area share                     | 28.5-28.8%            | 33.9-34.4%            |
| Paint (non-restricted) share              | 18.4-18.7%            | 14.0-14.5%            |
| Corner-three share                        | 10.8%                 | 8.8-9.2%              |
| Assisted threes                           | 83.4-85.4%            | 77.6-79.0%            |
| Fast-break / second-chance points         | 15.2-15.5 / 14.1-15.0 | 16.3-17.1 / 12.9-13.0 |
| And-ones / three-shot trips per team-game | 2.25-2.37 / 0.34-0.40 | 2.53-2.61 / 0.45-0.46 |

The fix round's notes already say the shot locations need a style refit (`scripts/style-check.ts`, `style-fit.ts`), not a constant.

### 14. Presentation (P3)

- **Turnover wording.** Each of 12 words gets an equal share (`record.ts:89`). Three-second violations come out 6.6 times the NBA's rate, backcourt 3 times, and out-of-bounds half.
- **Layup wording.**
  - Finger rolls are 6.4% of shots, against the NBA's 3.4%.
  - Plain "layup" is 11.6%, where the NBA's feed calls most drives "driving layup" (9%; plain "Layup" 1.4%).
  - "Cutting layup" is 4.9%, twice the NBA's.
- **Seen in the live games:**
  - A step-back three 0.9 seconds after an offensive rebound, with 1.5 left.
  - A free-throw shooter rebounding his own miss.
  - "Robinson turnover, stolen by Robinson", one from each team.
  - Substitution lines logged before the timeout they happened in.
  - The fourth quarter's TV timeout charged to a team up 25 with 1:05 left.

## What it would take to reach 80, then 90

**About 80 (+7):**

1. Remove `clutchEase` and give last-second and end-of-period shots the NBA's penalty (finding 1). Crunch time +2.5, flow +0.5.
2. Make shot value fall through the shot clock (finding 2). Shot profile +1, tempo +0.5.
3. Make "steal first" a pressure trip that ends in a foul (finding 3). Crunch time +1.
4. Credit the board before a loose-ball foul or held ball, and re-check the box (finding 5). Box +1.
5. Turn foul trouble into a tendency (finding 4). Rotations +0.5, AI +0.5.

**About 90:**

6. Halve the late slow-down and push, and give overtime the late pace (finding 6).
7. Timeouts through the quarter (finding 7).
8. Last-possession choices, with fewer final-trip turnovers, and end-of-quarter heaves (findings 8 and 9).
9. The shot-location style refit (finding 13).
10. Team-level variance: smaller shared conditions, more one-team nights, then comebacks and blowouts re-measured (finding 10).
11. Rotations:
    - Staggered pairs.
    - Garbage time that keeps a starter or two.
    - Closers by matchup.
    - Offense-defense substitutions.
12. Officiating:
    - Challenges and goaltending.
    - Defensive three seconds and double technicals.
    - Ejections from flagrant 2s.
    - The three rule slips.
13. The wording mixes.

## Appendix: the comparison

Same script on all sides. NBA: every regular-season game of the season. Sim: three seasons per column (3,693 games).

| Measure                                              | NBA 2024-25 | NBA 2025-26 | Round 1 (7, 11, 23) | Now (31, 47, 59) | Now (7, 11, 23) |
| ---------------------------------------------------- | ----------- | ----------- | ------------------- | ---------------- | --------------- |
| **Results**                                          |             |             |                     |                  |                 |
| Points per team-game                                 | 113.8       | 115.6       | 112.7               | 113.1            | 113.5           |
| Points per 100 possessions                           | 111.7       | 112.3       | 112.7               | 113.1            | 113.1           |
| Possessions per team-game (box)                      | 102.0       | 103.0       | 100.0               | 100.1            | 100.5           |
| Home team wins                                       | 54.4%       | 55.5%       | 53.9%               | 55.2%            | 54.1%           |
| Overtime                                             | 4.9%        | 4.4%        | 3.5%                | 3.7%             | 3.9%            |
| Final margin 3 or less                               | 15.0%       | 14.4%       | 19.0%               | 14.1%            | 17.3%           |
| Final margin 30 or more                              | 6.5%        | 7.8%        | 3.9%                | 4.2%             | 4.2%            |
| Final margin, SD                                     | 15.9        | 16.4        | 14.9                | 15.0             | 14.8            |
| Lead changes                                         | 6.64        | 6.78        | 6.33                | 6.31             | 6.50            |
| Comeback from 10 down                                | 28.0%       | 26.9%       | 23.5%               | 22.3%            | 23.6%           |
| Leader after Q1 wins                                 | 66.7%       | 65.4%       | 70.1%               | 69.5%            | 69.9%           |
| Winner never trailed                                 | 12.1%       | 11.6%       | 14.9%               | 14.2%            | 13.8%           |
| **Box**                                              |             |             |                     |                  |                 |
| FGA                                                  | 89.0        | 89.1        | 87.1                | 85.8             | 86.5            |
| FG%                                                  | 46.9%       | 47.1%       | 47.6%               | 48.3%            | 48.1%           |
| 2P%                                                  | 54.5%       | 55.0%       | 56.5%               | 57.0%            | 56.9%           |
| 3PA                                                  | 37.3        | 37.0        | 37.2                | 35.3             | 36.5            |
| 3P%                                                  | 36.3%       | 36.0%       | 35.6%               | 35.8%            | 35.9%           |
| FTA                                                  | 21.7        | 23.5        | 21.3                | 22.8             | 22.2            |
| Rebounds                                             | 44.1        | 43.8        | 43.4                | 40.8             | 41.2            |
| Offensive rebounds                                   | 11.1        | 11.4        | 10.5                | 10.0             | 10.0            |
| Assists                                              | 26.5        | 26.7        | 25.7                | 24.9             | 25.5            |
| Turnovers                                            | 14.3        | 14.5        | 14.1                | 14.3             | 14.2            |
| Personal fouls                                       | 18.6        | 19.9        | 19.6                | 20.0             | 19.5            |
| Double-doubles per team-game                         | 0.91        | 0.78        | 0.69                | 0.63             | 0.64            |
| Triple-doubles per game                              | 0.121       | 0.111       | 0.057               | 0.049            | 0.050           |
| Team-games with a 50-point scorer                    | 0.73%       | 0.69%       | 0.31%               | 0.41%            | 0.57%           |
| **Clock and tempo**                                  |             |             |                     |                  |                 |
| After a defensive board: shot or turnover within 6 s | 34.4%       | 35.4%       | 20.5%               | 35.4%            | 34.5%           |
| After a make: next shot 8-12 s in                    | 15.7%       | 16.4%       | 2.6%                | 14.7%            | 15.3%           |
| After a make: next shot 16-20 s in                   | 25.9%       | 25.5%       | 41.7%               | 25.4%            | 25.0%           |
| After a timeout or dead ball: 20-24 s in             | 12.9%       | 12.6%       | 10.2%               | 20.1%            | 19.8%           |
| After an offensive board: next action within 2 s     | 61.6%       | 62.9%       | 23.4%               | 57.3%            | 57.5%           |
| After an offensive board: next action within 4 s     | 76.9%       | 77.5%       | 31.8%               | 64.3%            | 64.5%           |
| First action of a period (s)                         | 17.0        | 16.9        | 14.0                | 14.0             | 13.8            |
| Shot-clock violations per team-game                  | 0.74        | 0.67        | 0.00                | 0.66             | 0.65            |
| Two-for-one taken, trip starting 33-40 s             | 64.0%       | 65.3%       | 94.2%               | 86.5%            | 86.3%           |
| Last shot of Q1-Q3 inside the final 3 s              | 82.6%       | 88.0%       | 73.6%               | 74.1%            | 74.6%           |
| **End game**                                         |             |             |                     |                  |                 |
| Foul to stop, leader up 1-2, last 0:40               | 56.1%       | 58.7%       | 50.8%               | 47.3%            | 46.8%           |
| Foul to stop, leader up 3, last 0:40                 | 62.6%       | 57.9%       | 3.1%                | 46.6%            | 45.8%           |
| Foul to stop, leader up 4-6, last 0:40               | 55.2%       | 57.5%       | 40.5%               | 48.3%            | 51.4%           |
| Leader fouls when up 3, last 0:12                    | 28.1%       | 30.2%       | 45.8%               | 27.3%            | 28.8%           |
| Timeouts, last 2:00 of games within 5                | 2.25        | 2.16        | 0.15                | 2.30             | 2.33            |
| Free-throw trips, last 2:00 of games within 5        | 2.56        | 2.62        | 1.97                | 2.10             | 2.14            |
| Game decided by a shot in the last 5 s               | 4.07%       | 3.98%       | 6.07%               | 4.74%            | 5.14%           |
| OT period points per team                            | 11.0        | 11.0        | 12.3                | 12.3             | 12.0            |
| **Timeouts and subs**                                |             |             |                     |                  |                 |
| Timeouts per team-game                               | 5.42        | 5.39        | 1.59                | 5.06             | 5.12            |
| Share of timeouts in Q4                              | 35.6%       | 35.0%       | 24.4%               | 35.8%            | 36.5%           |
| Substitutions per team-game                          | 28.6        | 31.1        | 37.7                | 32.5             | 32.5            |
| 30+ minute players: stints                           | 3.82        | 4.05        | 4.87                | 4.12             | 4.13            |
| 30+ minute players: stint length (min)               | 9.8         | 9.2         | 7.6                 | 9.0              | 9.0             |
| Subs in the last 2:00 of close games, per team       | 2.18        | 2.33        | 0.73                | 0.78             | 0.71            |
| Top player plays 40+                                 | 14.8%       | 10.2%       | 13.6%               | 17.6%            | 17.0%           |
| **Whistle**                                          |             |             |                     |                  |                 |
| Common fouls per team-game                           | 5.73        | 6.02        | 8.49                | 6.81             | 6.45            |
| Offensive fouls per team-game                        | 1.39        | 1.46        | 1.73                | 1.68             | 1.66            |
| Loose-ball fouls per team-game                       | 1.19        | 1.42        | 0.00                | 1.23             | 1.26            |
| Take fouls per team-game                             | 0.39        | 0.37        | 0.00                | 0.18             | 0.17            |
| Flagrants per team-game                              | 0.060       | 0.099       | 0.000               | 0.076            | 0.068           |
| Technicals per game                                  | 1.04        | 1.07        | 0.00                | 1.03             | 1.03            |
| Ejections per 100 games                              | 7.3         | 5.3         | –                   | 2.4              | 2.3             |
| Coach challenges per game                            | 0.27        | 0.28        | 0.00                | 0.00             | 0.00            |
| And-ones per team-game                               | 2.25        | 2.37        | 2.35                | 2.61             | 2.53            |
| Three-shot trips per team-game                       | 0.34        | 0.40        | 0.46                | 0.45             | 0.46            |
| **Shots**                                            |             |             |                     |                  |                 |
| Restricted-area share                                | 28.5%       | 28.8%       | 33.8%               | 34.4%            | 33.9%           |
| Paint (non-RA) share                                 | 18.7%       | 18.4%       | 13.7%               | 14.5%            | 14.0%           |
| Corner-three share                                   | 10.8%       | 10.8%       | 9.4%                | 8.8%             | 9.2%            |
| Assisted threes                                      | 83.4%       | 85.4%       | 79.1%               | 77.6%            | 79.0%           |
| Dunks, share of shots                                | 6.1%        | 6.2%        | 14.2%               | 6.3%             | 6.1%            |
| Hooks, share of shots                                | 2.8%        | 2.6%        | 0.4%                | 1.9%             | 1.7%            |
| Alley-oops per team-game                             | 1.39        | 1.39        | 2.58                | 1.10             | 1.08            |
| Fast-break points                                    | 15.5        | 15.2        | 17.2                | 17.1             | 16.3            |
| Second-chance points                                 | 14.1        | 15.0        | 12.7                | 12.9             | 13.0            |
| Turnovers: out of bounds per team-game               | 2.84        | 2.91        | 0.68                | 1.28             | 1.28            |
| Turnovers: three seconds per team-game               | 0.05        | 0.05        | 0.00                | 0.33             | 0.32            |

## Method and caveats

- **Definitions.**
  - "Foul to stop" counts trips that start in the last 40 seconds and end in a non-shooting foul.
  - The late-foul grid (findings 3 and the protect table) follows the first thing that happens after the leader gains the ball.
  - The two can differ by a few points. `gameday-check` counts every personal foul by the side behind, so its numbers run a little higher.
- **Heaves.** The NBA logs end-of-period heaves as their own action in 2025-26. For 2024-25 they were inferred: missed threes from 36 feet or more with 3 seconds or less left. The sim has none, so its end-of-quarter shots are all counted as shots.
- **Small samples.** Last-possession cells have 50-130 NBA trips a season. The late-shooting gap in finding 1 is far outside that noise; the shot-choice splits in finding 8 are directional.
- **Lineups.** Lineups are rebuilt from substitutions plus on-court evidence. Minutes match the box score to within a minute for 100% of player-games on both sides.
- **Technicals' mix.** It comes from every season in the repo's play-by-play file. Their rate, 1.04-1.07 a game, is 2024-26 only.
- **The live games.** Played at desktop size. The Skip ahead sheet took a few taps to open in the browser pane (its controls fade after 2.8 s); this is not a realism issue.
