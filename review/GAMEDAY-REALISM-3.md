# Game-day realism review, round 3

## Update, the same day: what was fixed, and what it measures now

Most of the review's findings are fixed in the engine, and the seed was rebuilt on it. I have not re-scored it. The numbers below are from the review's own six seasons (seeds 97-181), which the fixes were **not** tuned on (tuning used 7, 11, 23, 201, 211 and 223), through the review's own harness: 142 of its 193 measures now sit in the NBA's range, against 106 before.

| Measure                                                        | NBA                             | Review             | Now                |
| -------------------------------------------------------------- | ------------------------------- | ------------------ | ------------------ |
| Last 24 s, tied or down 1-3: shots by the top scorer / top two | 30-32% / 47-51%                 | 17% / 34%          | 26% / 43%          |
| Player rebounds credited at the horn, per game                 | 0.04                            | 2.27               | 0                  |
| After a dead-ball team rebound: shot or turnover within 4 s    | 0.7%                            | 13.5%              | 0.7%               |
| An 8-0 run draws a timeout / Q1-Q3 timeouts down an 8+ run     | 28-29% / 11-12%                 | 69% / 23%          | 28% / 10%          |
| Q4 timeouts from 7:00 to 5:00 a game / games with 3+           | 0.62-0.67 / 0.3%                | 1.06 / 6.2%        | 0.57 / 0%          |
| Share of timeouts in Q4                                        | 35-36%                          | 30.8%              | 32.8%              |
| Two-for-one taken                                              | 64-65%                          | 89%                | 65%                |
| Down 1, last 12 s: shoots a three                              | 19-21%                          | 38%                | 20%                |
| Leader up 1-2 / 3 under pressure: gets a shot off              | 5-6% / 3-4%                     | 1% / 1%            | 5% / 4%            |
| Leader uses 18 s+ after a score, last 3:00                     | 58-59%                          | 69%                | 58%                |
| Overtime                                                       | 4.4-4.9%                        | 3.5%               | 4.1%               |
| Within 5 at 2:00: goes to overtime                             | 14.1-14.8%                      | 10.7%              | 13.3%              |
| Free-throw trips, last 2:00 of games within 5                  | 2.56-2.62                       | 2.24               | 2.62               |
| Last 5:00 within 5: free throws a shot / points a possession   | 0.44-0.45 / 1.23                | 0.39 / 1.12        | 0.44 / 1.17        |
| Decided by 3 or fewer                                          | 14.4-15.0%                      | 12.7%              | 12.5%              |
| Decided by 30 or more                                          | 6.5-7.8%                        | 4.3%               | 5.8%               |
| Starters on the floor, Q2 at 11:30 / 7:30 / 1:30               | 2.0 / 2.8 / 3.7                 | 1.6 / 4.2 / 2.1    | 1.9 / 2.8 / 3.9    |
| ... Q3 at 2:30 / Q4 at 11:30                                   | 1.7 / 2.1                       | 0.8 / 0.95         | 1.3 / 1.4          |
| Fouls a team, Q1 / Q4                                          | 3.5-3.9 / 4.8-5.0               | 4.60 / 4.47        | 3.60 / 4.91        |
| Free throws a team, Q1 / Q4                                    | 4.2-4.8 / 6.1-6.4               | 5.84 / 5.52        | 4.17 / 6.15        |
| Home minus away: fouls / free throws                           | −0.07 to −0.39 / +0.25 to +0.57 | +0.02 / −0.10      | −0.23 / +0.43      |
| Correlation of the two teams' FG%                              | 0                               | 0.18               | 0.11               |
| 5-steal games a season                                         | 122-144                         | 19                 | 73                 |
| Players averaging 20+ / the scoring leader                     | 33-34 / 32.7-33.5               | 26.7 / 30.3        | 28.0 / 31.6        |
| Real top-32 scorers against their real lines, points a game    | 0                               | −2.4               | −1.6               |
| FGA / FG% / second-chance points a team                        | 89.0 / 47.0 / 14.1-15.0         | 86.6 / 47.9 / 12.8 | 88.8 / 47.7 / 14.9 |
| Assists a team; assisted share of paint / mid-range makes      | 26.6; 48% / 38%                 | 24.7; 38% / 28%    | 25.4; 45% / 37%    |
| After a steal: first action within 4 s                         | 21%                             | 34%                | 23%                |

**What changed.**

- **The star takes the last shot.** In crunch time the go-to player's share of the ball that night no longer holds him back, and on a trip for the tie or the lead in the last half minute the ball and the play go to him (`K.goToLast`, `goToSelf`, `goToFrom`).
- **The late game plays at the NBA's speed.** A side behind by a possession runs its trip in a hurry and, with seconds left, shoots the first look it gets (`K.lateRush`). Trailing coaches foul by how far down they are and how much time is left, from the NBA's own shares (`K.lateFoul.by`). Late timeouts are kept for the last 24 seconds, and leaders call them too. A leader up three or more gives up the two; a side down two that drives for the tie gets there more often than one tied.
- **Timeouts are tendencies.** An AI coach's timeout against a run is a chance that grows with the run; a word with the team comes when play has gone a while without a stop; fourth-quarter spares go through the quarter, not in a burst; one timeout a dead ball.
- **The stint plan follows the NBA's shape** (`STARTERS_ON` in `rotationPlan.ts`): two starters open the second quarter and most of them close the half.
- **Bookkeeping.** No board is credited at the horn. A defensive team rebound is a dead ball with an inbound. A few misses go out of bounds to the offense, as 4 a team-game do in the NBA: that was the missing shot volume and second-chance scoring.
- **The whistle** is lighter in the first quarter and heaviest in the fourth (`K.whistleQ`), and the home side keeps its small edge.
- **Shooting nights are each team's own** (`K.envShoot` is 0).
- **Steals by rate.** The cap from a defender's second steal is gone. A stopper's exposure, a compressed tendency and a mild cap from his fourth steal hold the leaders' averages.
- **Stars.** The seed was rebuilt on the new engine (`npm run data:build`), so the real league's scorers are fitted to their real lines again. A scorer past his share of the ball gets tougher looks (`K.useContest`), which is what keeps a developed star's seasons in range.
- **Also:** two-for-ones by coach, twos when down one, beating the trap, a slower overtime, assists credited on paint and mid-range makes, ejections on a first technical now and then, blowouts eased later, and the box score names a player who left hurt or ejected.

**Not done, or not right yet.**

- **Games decided by 3 or fewer are still 12.5%** (14.4-15.0%). Overtime and the path to it moved; the one-possession finals did not.
- **The star's last shot is 26%, not 30%.** Pushed further, too few of the makes are assisted.
- **50-point games (8.5 a season) and 20-point scorers (28) are still short.** The in-game limits that hold multi-season scoring leaders also hold big nights. A developed star's scoring ratings all reach 100, which is a progression matter, not a game-day one.
- **Team spread** moved little (the better team wins 66%).
- **Rotations:** the third quarter still ends and the fourth still opens with about 1.3-1.4 starters (1.7-2.1), because AI closers are the five starters. No offense-defense substitutions.
- **Untouched:** the late shot clock's value and early threes (finding 5, needs a playbook refit), shot locations (10), challenges and goaltending (11), layup wording (12).

**Checks.** All 93 tests pass, with typecheck, lint, format, build, `invariants`, `star-check`, `style-gate` and `forecast-check`. Three things to know:

- **`star-check` and `style-gate` are sensitive.** Any engine change reshuffles their tails. This engine fails one or the other on about half of nearby settings.
- **I changed one `star-check` guard.** It counted seasons with a 35-point scorer per league (at most 2). It now fails on one scorer doing it in more than 3 of a league's 8 seasons, or more than 8 such seasons in 64. With stars on their real lines the old count failed on which league two scorers' best years fell in.
- **Ice gives up a little more of the corner** (`K.cov.ice.kick` 0.6 → 0.75). On the rebuilt seed it measured best for 14 of 30 teams, over `style-gate`'s limit of 12.

`npm run gameday-check` has 149 rows now (119 before): the review's new measures are in it.

November 9, 2026. A fresh, independent re-review after commit 4fce8db ("Enhance game simulation realism with new foul and shot clock mechanics"), which acted on round 2 (`review/GAMEDAY-REALISM-2.md`, 73/100). Same scope as rounds 1 and 2: how a game plays out on the floor and on the bench, against real NBA games. It covers the possession engine, the AI coaches, crunch time, rotations, the whistle, and what the live screen and play-by-play show. It does not cover the front office, progression or multi-season shape.

## Score: 77 / 100 (round 2: 73, round 1: 62)

**Crunch time is now right in its mechanics. What is left is mostly about who: which player, which coach, which team.**

- **What the round fixed.** On six seasons nobody tuned or validated on, these now match the NBA:
  - The catch-up rule is gone. Leaders and trailers shoot late what NBA leaders and trailers shoot, and the final 5 seconds go in at 37% on twos and 21% on threes (NBA 33-34% and 19-21%; round 2: 55% and 38%).
  - When the leader has the ball in the last 24 seconds, the clock now runs out as rarely as in the NBA, and the pressure gets turnovers.
  - Foul trouble is a coach's habit. A starter with his third foul in the second quarter is on the floor for 25% of the rest of it (NBA 20-22%; round 2: 2%).
  - An early look is worth what the NBA's is (1.35 points a shot in the first 4 seconds).
  - The score pulls back toward the trailing team from the tip, as the NBA's does. Rebounds, heaves and end-of-quarter trips are back.
  - 180 of 266 broad measures sit inside the NBA's range, against 169 for the round-2 engine on its seasons.
- **What is still wrong.** Most of these were measured for the first time this round.
  1. **The star doesn't take the last shot.** A team's top scorer takes 17% of its shots for the tie or the lead in the last 24 seconds. NBA teams give him 30-32%.
  2. **Close games now end less close.** With the catch-up rule gone, 12.7% of games are decided by 3 or fewer (NBA 14.4-15.0%), and 3.5% go to overtime (NBA 4.4-4.9%).
  3. **Stars and strong teams are flattened.** A season has 27 players averaging 20 points (NBA 33-34), half the NBA's 50-point games and triple-doubles, and a seventh of its 5-steal games. The spread of team quality is 20% narrower, so the better team wins 65% of the time (NBA 69%) and 40-point blowouts are a fifth as common.
  4. **The rotation has the wrong shape.** Starters come back early in the second quarter and sit through the end of the half. The fourth quarter opens with one starter on the floor where NBA teams have two.
  5. **Smaller things the box shows.** About one rebound a team-game is credited after the horn. Fouls fall through the game where the NBA's rise. The two teams' shooting nights move together.
- **Why 77 and not more.** The round fixed what round 2 measured. This round measured more:
  - Who shoots late, and season-level stat lines.
  - Team spread, starters on the floor minute by minute.
  - Timeout context, and the whistle by quarter.
  - On these measures the round-2 engine would score about 70, not 73.

### Scorecard

| Area                             | Weight  | Round 1 | Round 2 | Now    | Why                                                                                                                                                                                                       |
| -------------------------------- | ------- | ------- | ------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box score and league rates       | 15      | 14      | 12.5    | 12     | Team rates within 1-3%. FG% +0.9, FGA −2.7%, assists −7%, about one rebound a team-game logged after the horn. Production too flat: 27 players at 20 points a game against 33-34, half the triple-doubles |
| Game flow and results            | 10      | 8.5     | 8.5     | 8      | Score effect from the tip and early leads now right. Close finishes and overtime a quarter short, 30- and 40-point games rare, team strength compressed, the two teams' shooting tied together            |
| Possession engine and tactics    | 10      | 7.5     | 8       | 8      | An early look is worth more and a failed action costs. Points per trip and momentum match. 7% of shots come in the first 4 seconds (NBA 4%), few assists off the rim, second-chance points 15% low        |
| Shot profile and scoring texture | 10      | 6       | 5.5     | 6.5    | The early shot clock is right, the last 8 seconds still flat. Locations unchanged (rim 5 points high, paint 4 low); cuts, tips, hooks and pull-ups off                                                    |
| Clock and tempo                  | 10      | 5       | 7.5     | 8      | Late slow-down and push near the NBA's, end-of-quarter trips and heaves right. Two-for-one taken 89% of the time (NBA 64%), overtime and clutch 11-13% too fast, steals run out too quickly               |
| Crunch time                      | 15      | 5       | 9.5     | 12     | Late shooting by side, last-second shots and the last 24 seconds all match. The star takes 17% of last shots (NBA 31%), down-one teams shoot threes twice as often, overtime a quarter short              |
| Rotations and minutes            | 10      | 6       | 7       | 7.5    | Foul trouble now a habit and on the NBA's numbers; stints right. Starters return early in Q2 and sit at the end of the half, Q4 opens with one starter, closers too starter-heavy, no late substitutions  |
| Officiating and rules            | 8       | 3.5     | 6       | 6      | Three rule slips fixed; evening-out and the late penalty right. Fouls fall through the game, the home whistle is gone, boards credited after the horn, dead-ball team rebounds played live, few ejections |
| AI coaching                      | 7       | 3       | 4.5     | 5      | Foul-trouble riding and timeouts through quarters added. An 8-0 run still draws a timeout as a rule, spare fourth-quarter timeouts pile up after 7:00, two-for-one nearly always, no go-to star late      |
| Presentation                     | 5       | 3.5     | 4       | 4      | Heaves and the turnover wording right. Boards logged after the horn, an in-game injury missing from the box, timeout pile-ups visible, layup wording unchanged                                            |
| **Total**                        | **100** | **62**  | **73**  | **77** |                                                                                                                                                                                                           |

## How this was measured

- **New seasons only.** Six seasons on league seeds 97, 113, 131, 149, 167 and 181: 7,386 games.
  - None of them was used by the fix round. It tuned on 7, 11 and 23 and validated on 31, 47, 59, 71 and 83.
  - The two halves (seeds 97-131 and 149-181) agree within noise on everything below. The appendix gives each measure's range across the six seasons.
- **The round-2 engine, for comparison.** Commit 47225e3 on round 2's seasons (31, 47, 59), re-measured with this round's harness. It is the "round-2 engine" column throughout.
- **The same harness and metrics script as rounds 1 and 2** (287 measures, 266 with an NBA comparison), with two corrections:
  - Missed heaves leave the box score, as the NBA reference's do.
  - Flagrant and take-foul free throws keep the ball. Round 2's harness ended the trip on them, about 0.9 times a game.
- **About 190 targeted measures in eleven scripts**, round 2's and three new ones:
  - Late shooting by who leads, the last 24 seconds by outcome, and shot value by shot-clock time.
  - The score effect by quarter, team spread and how predictable results are, and the correlation of the two teams' shooting.
  - Momentum between trips, points per trip, and who takes the last shot.
  - Assisted share by zone, blocks, and free throws and fouls by quarter.
  - The penalty, the player foul distribution, timeout context, and starters on the floor minute by minute.
  - Season leaders and big nights, and how close games end by the lead at 2:00 and 1:00.
- **The repo's own check.** `npm run gameday-check` on seed 97 scored 64 OK and 55 OFF of its 119 rows. Its league has another name, so it plays a different season from mine. It agrees with this harness wherever the two measure the same thing.
- **The engine diff read:** about 800 lines across 13 engine files.
- **One game in the app.** I played Bulls at Celtics, skipped to clutch time, watched it to the end (Celtics 102-94), and read the full play-by-play.

## What the fixes got right (protect these)

| Measure                                                                  | NBA 2024-26                             | Round-2 engine        | Now                   |
| ------------------------------------------------------------------------ | --------------------------------------- | --------------------- | --------------------- |
| Tied or down 1-3, last 5 s of Q4/OT: 2P% / 3P% (heaves excluded)         | 33-34% / 19-21%                         | 55% / 38%             | 37% / 21%             |
| … 5 to 24 s left: 2P% / 3P%                                              | 51-54% / 23-27%                         | 64% / 41%             | 50% / 23%             |
| 4:00-0:24 left, within 6: leader 2P% / 3P%                               | 50-51% / 32-34%                         | 53% / 32%             | 50% / 35%             |
| … trailer 2P% / 3P%                                                      | 53-54% / 34-35%                         | 61% / 40%             | 53% / 33%             |
| Leader up 1-2 gains the ball, last 24 s: fouled / clock runs out         | 81-84% / 2-3%                           | 86% / 14%             | 87% / 3%              |
| … up 3: fouled / clock runs out                                          | 83-84% / 5-7%                           | 79% / 20%             | 84% / 3%              |
| … up 4-6: fouled / clock runs out                                        | 61% / 26-28%                            | 66% / 33%             | 67% / 28%             |
| Starter on the floor after his 3rd foul in Q2 / 4th in Q3                | 20-22% / 21-22%                         | 2% / 1%               | 25% / 23%             |
| … after his 2nd in Q1 / 5th in Q4                                        | 41-43% / 38-40%                         | 32% / 19%             | 42% / 44%             |
| Points per shot, first 4 s of the shot clock / 4-8 s                     | 1.34-1.39 / 1.18                        | 1.17 / 1.15           | 1.35 / 1.18           |
| Quarter margin per point of lead at its start, Q2 / Q3 / Q4              | −0.11 to −0.13 / −0.06 to −0.11 / −0.13 | +0.03 / −0.14 / −0.18 | −0.08 / −0.10 / −0.15 |
| Up 10-14 after Q1: wins                                                  | 73-75%                                  | 84%                   | 79%                   |
| Rebounds / offensive rebounds per team-game                              | 43.8-44.1 / 11.1-11.4                   | 40.8 / 10.0           | 43.5 / 11.1           |
| End of Q1-Q3, ball gained with 1-6 s left: gets a shot off               | 57-69%                                  | 29%                   | 67%                   |
| Heaves per game (share made)                                             | 0.56-0.94 (2.5-4%)                      | 0                     | 0.87 (2.3%)           |
| Last 3:00 within 8: leader uses 18 s+ after a score                      | 58-59%                                  | 79%                   | 69%                   |
| … trailer shoots within 8 s of a defensive board                         | 48-51%                                  | 65%                   | 55%                   |
| Q1-Q3 timeouts in the minute after 7:00 or 3:00                          | 33%                                     | 72%                   | 43%                   |
| Down 2, last 12 s with the ball: shoots a three                          | 40-45%                                  | 32%                   | 40%                   |
| Points on a trip: none / two / three (share of trips)                    | 48-49% / 32-33% / 16%                   | 48% / 33% / 15%       | 48% / 32% / 16%       |
| Scoring rate after a scoring trip minus after an empty one (points of %) | +0.3 to +0.4                            | +0.9                  | +0.6                  |

Round 1's fixes still hold:

- **Late fouling.** The trailing team fouls on 84-87% of late trips when down 1-3.
- **Timeouts.** 5.5 a team-game, and 2.15 in the last two minutes of close games.
- **Tempo after makes and boards** is unchanged.
- **The whistle evens out a night** as the NBA's does.
- **Stints and first substitutions** are on the NBA's numbers.

## Findings

### 1. The star doesn't take the last shot (P1)

| Shots in the last 24 s of Q4/OT, shooting team tied or down 1-3 | NBA 2025-26 | NBA 2024-25 | Round-2 engine | Now |
| --------------------------------------------------------------- | ----------- | ----------- | -------------- | --- |
| By the team's top scorer (season points a game)                 | 32%         | 30%         | 20%            | 17% |
| By its top two                                                  | 51%         | 47%         | 36%            | 34% |
| Top scorer's share of shots earlier in games (for reference)    | 15%         | 15%         | 14%            | 14% |
| Assisted share of the makes                                     | 48%         | 51%         | 51%            | 55% |

The NBA doubles its best scorer's share at the end of close games. The sim raises it by a quarter, so the other three players on the floor take two-thirds of the last shots between them. This is crunch time's most visible gap: it shows in the play-by-play of every close finish.

- **Cause.** There is a go-to rule.
  - In the last two minutes of a game within five, `pickActor` multiplies the closer's weight by `K.goToAuto` (1.7), or `K.goToPick` (2.5) for a player the user named (`usage.ts:101-104`, `constants.ts:543-546`).
  - It multiplies a weight that `usageWeight` has already cut for his share of the team's possessions that night (`usage.ts:43-50`, the "defenses load up" damp).
  - By the fourth quarter a star is past that cap, so the damp takes back most of the boost.
  - The action's shot can then fall to a teammate on the kick-out.
- **Fix.**
  - In crunch time, exempt the go-to player from the in-game use cap.
  - Raise `goToAuto` until the top scorer takes about 30% of these shots and the top two about half.
  - Leave the rest of the game's damp alone: his share earlier in games matches.

### 2. Close games end less close; overtime is a quarter short (P1)

| Measure                                               | NBA 2024-26         | Round-2 engine | Now               |
| ----------------------------------------------------- | ------------------- | -------------- | ----------------- |
| Games decided by 3 or fewer                           | 14.4-15.0%          | 14.1%          | 12.7% (11.9-13.2) |
| Overtime                                              | 4.4-4.9%            | 3.7%           | 3.5% (3.1-3.9)    |
| Decided by a shot in the last 5 s                     | 4.0-4.1%            | 4.7%           | 3.2%              |
| Within 5 at 2:00: goes to overtime                    | 14.1-14.8%          | 12.1%          | 10.7%             |
| … the leader at 2:00 wins                             | 71.6-75.8%          | 74.8%          | 77.1%             |
| … points in the last 2:00, trailing side / leader     | 6.0-6.1 / 5.9-6.0   | 6.0 / 5.8      | 5.4 / 5.4         |
| … free-throw trips in the last 2:00                   | 2.56-2.62           | 2.10           | 2.24              |
| … trailing side's non-shooting fouls in the last 1:00 | 1.20-1.28           | 0.89           | 0.99              |
| Up 1 at 2:00: goes to overtime / up 3                 | 20-23% / 14%        | 14% / 14%      | 13% / 10%         |
| Last 5:00 within 5: points per possession             | 1.23-1.24           | 1.17           | 1.12              |
| … free-throw attempts per shot / possessions per team | 0.44-0.45 / 9.7-9.8 | 0.37 / 10.9    | 0.39 / 10.8       |
| Leader fouls when up 3 (trips in the last 12 s)       | 32-33%              | 40%            | 43%               |

The catch-up rule was propping up close finishes. Without it, the last two minutes have about 10% less scoring than the NBA's, fewer free throws and fewer fouls by the trailing side. Games led by one or three at 2:00 now separate instead of tying. The state at 2:00 is right: 27.9% of games are within 5, against 28.8-29.3%.

- **Cause.** It is not one constant. These are the measured pieces:
  - Free-throw trips in the last two minutes are 13% short, and the trailing side commits 20% fewer non-shooting fouls in the last minute.
  - Leaders foul when up three a third more often than the NBA's, which takes away the tying three. This is the `foulUp3` habit, which 62% of AI coaches with the setting on have (`game.ts:70`).
  - Every shot in the last four minutes loses `K.clutchD.all` (3.3 points of make chance, `constants.ts:429`). That lowers clutch scoring for both sides, and clutch possessions also run 11% too fast.
- **Fix.**
  - Tune the late game against these rows together, not a constant at a time. `gameday-check` already has most of them.
  - Start with the up-three foul share and with fouls by the trailing side in the last minute.
  - Then check whether `clutchD.all` is needed once leaders' slow-down and the tempo cost already make late shots harder.

### 3. Stars and strong teams are flattened (P1)

| Per season (30 teams)                   | NBA 2025-26 | NBA 2024-25 | Round-2 engine | Now         |
| --------------------------------------- | ----------- | ----------- | -------------- | ----------- |
| Players averaging 20+ points            | 33          | 34          | 26             | 27          |
| Scoring leader, points a game           | 33.5        | 32.7        | 29.9           | 30.3        |
| 50-point games                          | 17          | 18          | 10             | 9.5         |
| Triple-doubles                          | 136         | 149         | 60             | 64          |
| Double-doubles                          | 1,917       | 2,245       | 1,539          | 1,753       |
| 20-rebound games                        | 26          | 39          | 11             | 20          |
| 15-assist games                         | 36          | 59          | 28             | 25          |
| 5-steal games                           | 144         | 122         | 19             | 19          |
| Scoreless games in 20+ minutes          | 149         | 163         | 183            | 190         |
| 22-point scorers: game-to-game CV       | 0.31        | 0.32        | 0.36           | 0.35        |
| Team strength: SD of season margin      | 6.1         | 5.9         | 4.9-5.4        | 4.6-4.9     |
| Better team (by season margin) wins     | 69.3%       | 68.7%       | 66.3%          | 65.4%       |
| Final margin explained by team strength | 27%         | 26%         | 22%            | 19%         |
| Games decided by 30+ / 40+              | 7.8% / 1.6% | 6.5% / 1.8% | 4.2% / 0.2%    | 4.3% / 0.3% |
| A season's biggest margin               | 55          | 59          | 40-45          | 40-47       |

The team totals are right. What's off is how they are shared:

- Stars score, rebound and assist less than real stars.
- Role players score more.
- Stars' nights swing more.
- The gap between strong and weak teams is narrower than the NBA's. That costs results as well: the better team wins less often, and blowouts are rare.

- **Cause.** Per-game caps, tuned to keep multi-season tails in line, flatten single nights:
  - A defender's steal chance falls by exp(−0.6) for each steal past his second of the night (`K.stealCap`, `constants.ts:833`). A fifth steal comes at a sixth of the usual chance.
  - Usage damping was raised in this round to keep `star-check` passing: `usageDamp` went 9.5 → 10.5 and `threeUse.damp` 17 → 30.
  - The in-game use and assist caps (`usage.ts:43-55`, `K.astCap`) add to it.
  - Blowouts are trimmed by `K.band` (capped at 24 points), `K.easeBig` and garbage time.
  - The round-2 engine had most of this too; the new damping moved it a little further.
- **Fix.**
  - Control season averages through ratings and tendencies, not per-game caps. Replace the steal cap with each player's own steal rate.
  - Run `star-check`'s multi-season tails and these single-season rows in the same check. Then a change that passes one can't quietly fail the other.
  - Loosen `easeBig` until 30- and 40-point games come back.

### 4. The rotation has the wrong shape (P2)

| Average starters on the floor                            | NBA 2025-26 | NBA 2024-25 | Now (round-2 engine the same) |
| -------------------------------------------------------- | ----------- | ----------- | ----------------------------- |
| Q2, 11:30                                                | 2.1         | 1.9         | 1.6                           |
| Q2, 7:30                                                 | 2.8         | 2.9         | 4.2                           |
| Q2, 1:30                                                 | 3.7         | 3.8         | 2.1                           |
| Q3, 2:30                                                 | 1.6         | 1.8         | 0.8                           |
| Q4, 11:30                                                | 2.2         | 2.1         | 0.95                          |
| Q4, 1:30, games within 6 at 6:00                         | 3.8         | 3.8         | 4.6                           |
| Starters' minutes, last 6:00 of games within 6 (of 30)   | 21.9        | 22.6        | 26.4                          |
| Starters' Q4 minutes, up or down 20+ entering Q4 (of 60) | 17.9        | 18.6        | 13.5                          |
| Substitutions per team, last 2:00 of games within 6      | 2.33        | 2.18        | 0.51                          |

- **What it looks like.**
  - Starters return about 8:00 into the second quarter, two to three minutes before NBA starters.
  - The bench then finishes the half: 2.1 starters at 1:30 against 3.7-3.8.
  - The third quarter ends with fewer than one starter on the floor.
  - The fourth opens with one, where the NBA has two.
  - Close games then end with nearly all five starters, and no offense-defense substitutions.
- **Cause.** `buildMinutePlan` (`rotationPlan.ts:162-300`) plans the first half forward, minute by minute.
  - The starters' first-half minutes run out by about 3:00 of Q2, and the bench is left to close it.
  - The second half is planned backward from the horn, which is why closers work and the end of Q3 is bare.
  - The stagger rule keeps at least one starter out there, not the NBA's two.
- **Fix.**
  - Plan the first half from its end, as the second is planned, so the starters close both halves.
  - Pin two starters to open the second and fourth quarters.
  - Let crunch-time lineups make an offense-defense swap on dead balls.

### 5. Shots late in the shot clock keep their value; too many very early shots (P2)

| Seconds of the shot clock used | 0-4       | 4-8        | 8-12       | 12-16      | 16-20      | 20-24      | 24+ (after a reset) |
| ------------------------------ | --------- | ---------- | ---------- | ---------- | ---------- | ---------- | ------------------- |
| NBA: points per shot           | 1.34-1.39 | 1.18-1.19  | 1.12-1.13  | 1.09-1.10  | 1.05-1.06  | 0.99-1.01  | 0.93-0.94           |
| Now                            | 1.35      | 1.18       | 1.08       | 1.09       | 1.08       | 1.06       | 1.07                |
| NBA: share of shots            | 3.8-4.1%  | 15.0-15.3% | 22.1-22.6% | 24.4-24.8% | 18.0-18.4% | 10.7-10.9% | 4.8-5.1%            |
| Now                            | 7.4%      | 14.4%      | 21.9%      | 23.8%      | 17.4%      | 14.1%      | 1.1%                |

- **What it means.**
  - The first 8 seconds are now right.
  - The last 8 are worth what the middle is, so a leader working the clock still loses nothing for it.
  - Shots in the first 4 seconds are nearly twice as common as the NBA's, and 42% of them are threes (NBA 30-31%).
  - After a steal, 34% of trips have their first shot or turnover within 4 seconds (NBA 21%). Fast-break points run 17.3 a team-game (NBA 15.2-15.5).
- **Cause.**
  - `K.tempo.late` is 0 (`constants.ts:404`). The fix round tried a late cost and it broke `style-gate`, because the playbooks and staff reads were fitted without one.
  - The run-out after a steal now takes 2.2-5.5 seconds (`transition.ts:61`).
  - `K.tempo.early`'s bonus (+1.3 openness) helps an early pull-up three as much as a run-out layup.
- **Fix.**
  - Refit the playbooks with a late cost (`scripts/style-fit.ts`), as the fix round noted.
  - Give the early bonus mostly to rim and paint shots.
  - Restore the steal run-out's 3-6.5 seconds.

### 6. The whistle doesn't build through the game; shooting nights are shared (P2)

| Measure                                      | NBA 2025-26   | NBA 2024-25   | Round-2 engine | Now           |
| -------------------------------------------- | ------------- | ------------- | -------------- | ------------- |
| Fouls per team: Q1 / Q4                      | 3.85 / 5.02   | 3.52 / 4.82   | 4.73 / 4.55    | 4.60 / 4.47   |
| Free-throw attempts per team: Q1 / Q4        | 4.79 / 6.38   | 4.20 / 6.08   | 5.91 / 5.44    | 5.84 / 5.52   |
| Technicals in Q1, share                      | 17%           | 14%           | 25%            | 25%           |
| Home minus away: fouls / free-throw attempts | −0.39 / +0.57 | −0.07 / +0.25 | −0.23 / +0.20  | +0.02 / −0.10 |
| Correlation of the two teams' FG%            | −0.01         | 0.01          | 0.19           | 0.18          |
| … of their 3P%                               | 0.01          | 0.02          | 0.11           | 0.11          |
| … of their points                            | 0.19          | 0.22          | 0.34           | 0.33          |

- **What it means.**
  - NBA officials call a light first quarter and the most fouls in the fourth. The sim calls the most in the first.
  - The home side's small edge at the line is gone, although home teams still win 54.7%.
  - In the NBA, one team's shooting night says nothing about the other's. In the sim they move together, and that is most of why the two teams' scores are correlated 0.33 against 0.19-0.22.
- **Cause.**
  - Foul rates have no game-phase term.
  - The home factor is 1.2% each way (`K.homeWhistle`), and the evening-out term in `whistle()` (`fouls.ts:315-320`) treats its fewer calls as luck to give back.
  - `K.envShoot` (0.012, `constants.ts:304`) is a shooting night both teams share.
- **Fix.**
  - Scale non-intentional fouls by quarter: about 0.85 in Q1 rising to 1.05 in Q4.
  - Count expected fouls after the home factor, so evening-out leaves the home edge alone.
  - Set `envShoot` to 0 and raise `K.envTeam` to keep each team's own spread.

### 7. AI timeouts: a rule at 8-0, a pile-up after 7:00 of the fourth (P2)

| Measure                                                           | NBA 2025-26   | NBA 2024-25   | Round-2 engine | Now           |
| ----------------------------------------------------------------- | ------------- | ------------- | -------------- | ------------- |
| An 8-0 run in Q1-Q3 draws a timeout before the losing side scores | 9.4%          | 9.1%          | 25.6%          | 21.6%         |
| Q1-Q3 timeouts called down an 8+ run                              | 11%           | 12%           | 30%            | 23%           |
| Timeouts between 7:00 and 5:00 of Q4, per game                    | 0.67          | 0.63          | —              | 1.04          |
| Games with 3+ timeouts in that window                             | 0.3%          | 0.3%          | —              | 6.1%          |
| Share of timeouts in Q4 / in Q1                                   | 35.0% / 20.0% | 35.6% / 19.8% | 35.8% / 21.0%  | 30.8% / 23.8% |
| Quarters with 3+ timeouts                                         | 38%           | 39%           | 25%            | 46%           |
| Q4 timeouts in the minute after 7:00                              | 10%           | 9%            | 33%            | 22%           |

Seen live: Celtics timeout at 6:50, another at 6:30 with the Bulls calling one at the same dead ball, then the Bulls again at 5:34, right after their own three. That is four timeouts in 76 seconds.

- **Cause.**
  - `autoTimeouts` calls one whenever the other side's run reaches the staff's `timeoutRun` (8 by default, `coach.ts:186`), every time.
  - From 7:00 to 3:00 of the fourth, a team holding more than the two it may keep spends one at 30% of dead balls (`K.lateTO.spend`/`spendP`, `coach.ts:207`), so the spares go in a burst.
  - `K.quarterTO` (`constants.ts:108`) adds the new Q1-Q3 timeouts on top.
- **Fix.**
  - Make the run timeout a chance that grows with the run and varies by coach.
  - Spend spare timeouts from earlier in the fourth (9:00) at a lower rate, and let some lapse.
  - Trim `quarterTO.any` in the first quarter.

### 8. Late-game choices (P2)

| Measure                                                              | NBA 2025-26  | NBA 2024-25  | Round-2 engine | Now          |
| -------------------------------------------------------------------- | ------------ | ------------ | -------------- | ------------ |
| Two-for-one taken (trip begun with 0:33-0:40 left in Q1-Q3)          | 65%          | 64%          | 86%            | 89%          |
| Down 1, last 12 s with the ball: shoots a three                      | 19%          | 21%          | 36%            | 38%          |
| Leader under pressure, last 24 s: gets a shot off (up 1-2 / 3 / 4-6) | 6% / 4% / 7% | 5% / 3% / 6% | 0% / 1% / 1%   | 1% / 1% / 0% |
| … turns it over, up 3                                                | 7%           | 7%           | 0%             | 12%          |
| Possessions per team in an overtime period (Q4 per 5 min)            | 9.4 (9.6)    | 9.2 (9.6)    | 10.8 (10.2)    | 10.5 (10.2)  |

- **What it means.**
  - Nearly every coach takes every two-for-one.
  - Down one, teams still shoot threes twice as often as the NBA's, though a two wins it.
  - A leader the defense traps never breaks it for a layup, and up three it turns the ball over too often.
  - Overtime runs faster than the fourth quarter, where the NBA's runs 3% slower.
- **Cause.**
  - The two-for-one is a rule for 85% of coaches: `res.quick` (`clock.ts:130`) with `habit.twoForOne` (`game.ts:71`).
  - Down one, `late.two` cuts the three-point weight in `prefs` (`possession.ts:418`), but 38% of these trips still end in a three. The forced action's kick-outs and the after-timeout sets don't read it.
  - The pressure turnover (`K.lateSteal.press` 0.4 when nobody fouls) has no counterpart in which the leader beats the press.
- **Fix.**
  - Make the two-for-one a chance per coach (about 65%).
  - Pass `late.two` to the kick-out and set choices.
  - Give the trap a small chance of a layup the other way.
  - Slow overtime the way the fourth quarter is slowed.

### 9. Box-score bookkeeping: boards after the horn, assists (P2)

| Measure                                                                 | NBA 2025-26        | NBA 2024-25        | Now                |
| ----------------------------------------------------------------------- | ------------------ | ------------------ | ------------------ |
| Rebounds credited to a player at 0:00.0, per game                       | 0.04               | 0.04               | 2.27               |
| Assisted share of made shots: rim / paint / mid / above-the-break three | 60 / 48 / 38 / 81% | 61 / 49 / 39 / 78% | 60 / 38 / 28 / 72% |
| Assists per team-game                                                   | 26.7               | 26.5               | 24.7               |
| FGA per team-game / FG%                                                 | 89.1 / 47.1%       | 89.0 / 46.9%       | 86.6 / 47.9%       |
| Second-chance points per team-game                                      | 15.0               | 14.1               | 12.8               |
| After an offensive board: next shot or turnover within 4 s              | 78%                | 77%                | 67%                |

- **Boards after the horn.** A miss in a period's last seconds, every heave included, gives someone a rebound at 0:00.0. The live game logged three in three quarters ("Offensive rebound Robinson" after Hauser's heave). That is about 1.1 of the 43.5 rebounds a team-game, so the real figure is nearer 42.4 against the NBA's 43.8-44.1.
  - Cause: `rebound()` (`rebounds.ts:12-86`) credits the board whatever the clock. The loose-ball check at line 22 stops at 0.3 s; the board doesn't.
- **Assists.** The assisted share is right at the rim and in the corner. It is 8-10 points low on paint shots, mid-range shots and above-the-break threes, which is the whole assist gap.
- **Fix.** No player rebound after a period's horn. Fit assist chances by zone. Look at why a putback chance after an offensive board is slower to arrive than the NBA's.

### 10. Shot locations and shot types, unchanged since round 1 (P3)

| Share of FGA                       | NBA 2024-26 | Now   |
| ---------------------------------- | ----------- | ----- |
| Restricted area                    | 28.5-28.8%  | 33.7% |
| Paint (not restricted area)        | 18.4-18.7%  | 14.4% |
| Corner three                       | 10.8%       | 8.9%  |
| Cuts (gameday-check, seed 97)      | 4-8%        | 13.4% |
| Tip-ins                            | 2.1-2.2%    | 1.2%  |
| Hooks                              | 2.6-2.8%    | 1.9%  |
| Pull-ups, share of jumpers         | 20-21%      | 24%   |
| Team-games with 25 or fewer threes | 3.7-5.2%    | 8.2%  |

### 11. Rule slips and missing calls (P3)

- **A dead-ball team rebound plays as a live one.**
  - `rebound()` sets `ctx = 'dreb'` for a team rebound (`rebounds.ts:75-84`), so the trip after the ball goes out of bounds can be early offense or a run-out.
  - Such trips have a first action within 4 seconds 13.5% of the time; the NBA's, after an inbound, 0.7%.
- **Rarer whistles.** Ejections are 1.6 per 100 games (NBA 5.3-7.3; round-2 engine: 2.4). Every technical is still a free throw.
- **Still missing.** Coach's challenges (0.27-0.28 a game), goaltending, clear-path fouls and defensive three seconds.

### 12. Presentation (P3)

- **Boards after the horn** appear in the feed: "Hauser misses heave from the backcourt. Offensive rebound Robinson." at 0:00.0.
- **An in-game injury is missing from the box.** The Bulls' Norman Powell left in the first quarter, injured. The box shows him with 7 minutes and no note; only the pregame injury is listed.
- **Timeout pile-ups read oddly.** "Timeout BOS." and "Timeout CHI." appear at the same 6:30.
- **Unchanged since round 2:** the layup wording mix (finger rolls about twice the NBA's) and the other shot-type descriptors.
- **Holds up well.** The live view's feed and story, the late penalty (a side-out on the Bulls' first foul in the last two minutes, two shots on the second), and the heave wording.

## What it would take to reach 80, then 85

**To about 80 (+3), in order of value for the effort:**

1. **The star takes the last shot** (finding 1): crunch time +0.75, coaching +0.25. Exempt the go-to player from the in-game use cap, then tune `goToAuto`.
2. **No boards after the horn; dead-ball team rebounds inbound** (findings 9 and 11): box +0.25, officials +0.25, presentation +0.25. Both are small fixes in `rebounds.ts`.
3. **Timeouts as tendencies** (finding 7): coaching +0.5. The run timeout becomes a chance; spare fourth-quarter timeouts are spread out.
4. **Separate shooting nights** (finding 6): flow +0.25. `envShoot` to 0.
5. **Two-for-one and down-one choices** (finding 8): clock +0.25, crunch +0.25.
6. **Close finishes** (finding 2): crunch +0.5, flow +0.25. A tuning pass against the end-game rows.

**To about 85 (+5 more):**

1. **The rotation's shape** (finding 4): rotations +1.5. Plan the first half from its end; two starters open Q2 and Q4.
2. **Stars and team spread** (finding 3): box +1, flow +0.5. Season-level control through ratings, steal rates per player, and blowouts allowed.
3. **The late shot clock with a playbook refit** (finding 5): shots +0.75, engine +0.25.
4. **Shot locations** (finding 10): shots +0.75.
5. **The whistle by quarter and the home edge** (finding 6): officials +0.5.

Past 85 the work is in what this engine doesn't model at all: challenges, goaltending, offense-defense substitutions, and closing lineups chosen for the moment.

## Appendix: the comparison

The NBA columns are every game of the 2025-26 and 2024-25 regular seasons from `data/raw/games/`. "Round-2 engine" is commit 47225e3 on seeds 31, 47 and 59. "Now" is commit 4fce8db on six seeds the fix round never used. "Range" is the spread across the six seasons, or across the two halves for the measures computed per half.

| Measure                                                                  | NBA 2025-26 | NBA 2024-25 | Round-2 engine | Now (6 seasons) | Range          |
| ------------------------------------------------------------------------ | ----------- | ----------- | -------------- | --------------- | -------------- |
| **Box and league rates**                                                 |             |             |                |                 |                |
| Points per team-game                                                     | 115.6       | 113.8       | 113.1          | 113.9           | 113.2–114.8    |
| FG%                                                                      | 47.1%       | 46.9%       | 48.3%          | 47.9%           | 47.6%–48.2%    |
| 2P%                                                                      | 55.0%       | 54.5%       | 57.0%          | 55.9%           | 55.7%–56.3%    |
| 3P%                                                                      | 36.0%       | 36.3%       | 35.8%          | 36.6%           | 36.3%–36.8%    |
| FGA per team-game                                                        | 89.1        | 89.0        | 85.8           | 86.6            | 85.8–87.4      |
| 3PA per team-game                                                        | 37.0        | 37.3        | 35.3           | 36.0            | 35.2–36.6      |
| FTA per team-game                                                        | 23.5        | 21.7        | 22.8           | 22.9            | 22.3–23.6      |
| Rebounds per team-game                                                   | 43.8        | 44.1        | 40.8           | 43.5            | 42.8–43.8      |
| Offensive rebounds per team-game                                         | 11.38       | 11.12       | 9.96           | 11.05           | 10.87–11.20    |
| Assists per team-game                                                    | 26.7        | 26.5        | 24.9           | 24.7            | 24.0–25.0      |
| Steals per team-game                                                     | 8.42        | 8.20        | 8.07           | 8.02            | 7.78–8.17      |
| Blocks per team-game                                                     | 4.84        | 4.88        | 4.89           | 4.98            | 4.84–5.08      |
| Turnovers per team-game                                                  | 14.51       | 14.30       | 14.28          | 14.33           | 14.05–14.55    |
| Personal fouls per team-game                                             | 19.9        | 18.6        | 20.0           | 19.7            | 19.2–20.1      |
| Pace (possessions per 48)                                                | 102.5       | 101.4       | 99.7           | 100.0           | 99.6–100.9     |
| Double-doubles per team-game                                             | 0.78        | 0.91        | 0.63           | 0.71            | 0.69–0.75      |
| Triple-doubles per game                                                  | 0.111       | 0.121       | 0.049          | 0.052           | 0.044–0.064    |
| Players averaging 20+ points, per season                                 | 33.0        | 34.0        | 25.7           | 26.7            | 26.3–27.0      |
| Season scoring leader, points a game                                     | 33.5        | 32.7        | 29.9           | 30.3            | 30.1–30.5      |
| 50-point games per season                                                | 17.0        | 18.0        | 10.0           | 9.5             | 9.0–10.0       |
| 5-steal games per season                                                 | 144         | 122         | 19             | 19              | 18–20          |
| 20-rebound games per season                                              | 26.0        | 39.0        | 11.3           | 19.5            | 16.3–22.7      |
| 15-assist games per season                                               | 36.0        | 59.0        | 27.7           | 25.0            | 22.7–27.3      |
| Scoreless games in 20+ minutes, per season                               | 149         | 163         | 183            | 190             | 181–198        |
| Players averaging 22+: game-to-game CV of points                         | 0.313       | 0.323       | 0.361          | 0.347           | 0.337 to 0.356 |
| Assisted share of made shots: rim                                        | 60%         | 61%         | 61%            | 60%             | 60%–61%        |
| ... paint                                                                | 48%         | 49%         | 40%            | 38%             | 38%–39%        |
| ... mid-range                                                            | 38%         | 39%         | 28%            | 28%             | 28%–28%        |
| ... above-the-break three                                                | 81%         | 78%         | 72%            | 72%             | 72%–72%        |
| Second-chance points per team-game                                       | 15.0        | 14.1        | 12.9           | 12.8            | 12.8–12.8      |
| Fast-break points per team-game                                          | 15.2        | 15.5        | 17.1           | 17.3            | 17.3–17.4      |
| **Results and game flow**                                                |             |             |                |                 |                |
| Margin SD                                                                | 16.4        | 15.9        | 15.0           | 15.1            | 14.9–15.5      |
| Decided by 3 or fewer                                                    | 14.4%       | 15.0%       | 14.1%          | 12.7%           | 11.9%–13.2%    |
| Decided by 30 or more                                                    | 7.8%        | 6.5%        | 4.2%           | 4.3%            | 3.6%–4.9%      |
| Overtime                                                                 | 4.4%        | 4.9%        | 3.7%           | 3.5%            | 3.1%–3.9%      |
| Home win %                                                               | 55.5%       | 54.4%       | 55.2%          | 54.7%           | 53.4%–55.6%    |
| Lead changes per game                                                    | 6.8         | 6.6         | 6.3            | 6.8             | 6.6–7.1        |
| Comeback from 10+ down                                                   | 26.9%       | 28.0%       | 22.3%          | 24.6%           | 22.2%–25.5%    |
| Leader after Q1 wins                                                     | 65.4%       | 66.7%       | 69.5%          | 68.4%           | 65.5%–69.7%    |
| Up 10-14 after Q1: wins                                                  | 73.2%       | 75.4%       | 83.5%          | 78.6%           | 78.1%–79.1%    |
| Quarter margin per point of lead at its start: Q2                        | −0.11       | −0.13       | +0.03          | −0.08           | −0.08 to −0.08 |
| ... Q3                                                                   | −0.06       | −0.11       | −0.14          | −0.10           | −0.10 to −0.10 |
| ... Q4                                                                   | −0.13       | −0.13       | −0.17          | −0.14           | −0.15 to −0.14 |
| Better team (by season margin) wins                                      | 69.3%       | 68.7%       | 66.3%          | 65.4%           | 65.0%–65.7%    |
| Final margin explained by team strength (R²)                             | 0.268       | 0.264       | 0.219          | 0.187           | 0.186 to 0.188 |
| Correlation of the two teams’ FG%                                        | -0.01       | 0.01        | 0.19           | 0.18            | 0.16–0.19      |
| Correlation of the two teams’ points                                     | 0.19        | 0.22        | 0.34           | 0.33            | 0.32–0.34      |
| Trips scoring 0 points                                                   | 48.0%       | 48.7%       | 48.0%          | 48.0%           | 47.9%–48.2%    |
| Scoring rate after a scoring trip minus after an empty one (points of %) | +0.4        | +0.3        | +0.9           | +0.6            | +0.5 to +0.6   |
| **Shot profile and shot clock**                                          |             |             |                |                 |                |
| Rim share of FGA                                                         | 28.8%       | 28.5%       | 34.4%          | 33.7%           | 33.1%–34.4%    |
| Paint (non-rim) share                                                    | 18.4%       | 18.7%       | 14.5%          | 14.4%           | 14.3%–14.6%    |
| Corner-3 share                                                           | 10.8%       | 10.8%       | 8.8%           | 8.9%            | 8.8%–9.0%      |
| Dunks, share of FGA                                                      | 6.2%        | 6.1%        | 6.3%           | 6.1%            | 5.9%–6.2%      |
| Tip-ins, share of FGA                                                    | 2.1%        | 2.2%        | 1.1%           | 1.2%            | 1.1%–1.2%      |
| Pull-ups, share of jumpers                                               | 20.8%       | 20.1%       | 24.0%          | 24.3%           | 23.0%–26.1%    |
| Points per shot, 0-4 s of shot clock used                                | 1.39        | 1.34        | 1.17           | 1.35            | 1.35–1.36      |
| Points per shot, 4-8 s of shot clock used                                | 1.19        | 1.18        | 1.15           | 1.18            | 1.17–1.18      |
| Points per shot, 8-12 s of shot clock used                               | 1.13        | 1.12        | 1.11           | 1.08            | 1.08–1.09      |
| Points per shot, 12-16 s of shot clock used                              | 1.09        | 1.10        | 1.10           | 1.09            | 1.09–1.09      |
| Points per shot, 16-20 s of shot clock used                              | 1.05        | 1.06        | 1.11           | 1.08            | 1.08–1.09      |
| Points per shot, 20-24 s of shot clock used                              | 0.99        | 1.01        | 1.08           | 1.06            | 1.06–1.06      |
| Points per shot, 24+ s of shot clock used                                | 0.93        | 0.94        | 1.09           | 1.07            | 1.07–1.07      |
| Share of shots in the first 4 s                                          | 4.1%        | 3.8%        | 6.5%           | 7.4%            | 7.4%–7.4%      |
| ... of them threes                                                       | 30%         | 31%         | 42%            | 42%             | 42%–42%        |
| Heaves per game                                                          | 0.94        | 0.56        | 0.00           | 0.87            | 0.86–0.88      |
| **Clock and tempo**                                                      |             |             |                |                 |                |
| After a defensive board: shot or turnover within 6 s                     | 35.4%       | 34.4%       | 35.3%          | 33.9%           | 33.1%–35.4%    |
| After a steal: first action within 4 s                                   | 21.1%       | 20.8%       | 20.5%          | 33.8%           | 33.1%–34.3%    |
| After a dead-ball defensive team rebound: within 4 s                     | 0.7%        | 0.7%        | 13.9%          | 13.5%           | 13.1%–14.1%    |
| After an offensive board: next action within 4 s                         | 77.5%       | 76.9%       | 64.3%          | 67.1%           | 67.0%–67.3%    |
| Two-for-one taken (trip begun at 0:33-0:40)                              | 65.3%       | 64.0%       | 86.4%          | 89.2%           | 85.1%–91.4%    |
| Shot-clock violations per team-game                                      | 0.67        | 0.74        | 0.66           | 0.76            | 0.73–0.78      |
| Possessions per team: Q1                                                 | 24.4        | 24.3        | 25.1           | 25.0            | 25.0–25.0      |
| ... Q4                                                                   | 23.1        | 23.1        | 24.4           | 24.4            | 24.4–24.4      |
| ... an overtime period                                                   | 9.4         | 9.2         | 10.8           | 10.5            | 10.4–10.6      |
| Last 3:00 within 8: leader uses 18 s+ after a score                      | 58%         | 59%         | 79%            | 69%             | 68%–69%        |
| ... trailer shoots within 8 s of a defensive board                       | 51%         | 48%         | 65%            | 55%             | 54%–55%        |
| End of Q1-Q3, ball gained with 1-6 s left: gets a shot off               | 68%         | 57%         | 29%            | 67%             | 67%–67%        |
| **Crunch time**                                                          |             |             |                |                 |                |
| 4:00-0:24 left, within 6: leader 2P%                                     | 51.0%       | 50.2%       | 53.2%          | 49.9%           | 48.5%–51.3%    |
| ... leader 3P%                                                           | 33.7%       | 32.3%       | 32.2%          | 34.9%           | 34.6%–35.2%    |
| ... trailer 2P%                                                          | 54.3%       | 52.8%       | 60.5%          | 52.6%           | 52.5%–52.7%    |
| ... trailer 3P%                                                          | 34.1%       | 34.7%       | 39.8%          | 33.3%           | 32.6%–34.1%    |
| Tied or down 1-3, last 5 s: 2P% (heaves excluded)                        | 33%         | 34%         | 55%            | 37%             | 36%–38%        |
| ... 3P%                                                                  | 21%         | 19%         | 38%            | 21%             | 20%–21%        |
| ... 5 to 24 s left: 2P%                                                  | 51%         | 54%         | 64%            | 50%             | 46%–53%        |
| ... 3P%                                                                  | 23%         | 27%         | 41%            | 23%             | 22%–23%        |
| Leader up 1-2 gains the ball at 0:02-0:24: fouled                        | 84%         | 81%         | 86%            | 87%             | 86%–88%        |
| ... clock runs out                                                       | 2%          | 3%          | 14%            | 3%              | 3%–4%          |
| ... turns it over                                                        | 7%          | 11%         | 0%             | 10%             | 8%–11%         |
| ... gets a shot off                                                      | 6%          | 5%          | 0%             | 1%              | 1%–1%          |
| Leader up 3 gains the ball at 0:02-0:24: fouled                          | 83%         | 84%         | 79%            | 84%             | 83%–85%        |
| ... clock runs out                                                       | 5%          | 6%          | 20%            | 3%              | 2%–3%          |
| ... turns it over                                                        | 7%          | 6%          | 0%             | 12%             | 11%–14%        |
| ... gets a shot off                                                      | 4%          | 3%          | 1%             | 1%              | 0%–2%          |
| Leader up 4-6 gains the ball at 0:02-0:24: fouled                        | 61%         | 61%         | 66%            | 67%             | 67%–68%        |
| ... clock runs out                                                       | 26%         | 28%         | 33%            | 28%             | 27%–28%        |
| ... turns it over                                                        | 7%          | 5%          | 0%             | 4%              | 4%–5%          |
| ... gets a shot off                                                      | 7%          | 6%          | 1%             | 0%              | 0%–0%          |
| Down 1, last 12 s with the ball: shoots a three                          | 19%         | 21%         | 36%            | 38%             | 38%–38%        |
| Down 2: shoots a three                                                   | 40%         | 45%         | 32%            | 40%             | 35%–45%        |
| Leader fouls when up 3, possession begun in the last 0:12                | 30.2%       | 28.1%       | 27.3%          | 33.7%           | 20.0%–45.8%    |
| ... any foul before the trailing side’s shot (trips in the last 12 s)    | 33%         | 32%         | 40%            | 43%             | 37%–50%        |
| Last 24 s, tied or down 1-3: shots by the team’s top scorer              | 32%         | 30%         | 20%            | 17%             | 17%–18%        |
| ... by its top two                                                       | 51%         | 47%         | 36%            | 34%             | 33%–34%        |
| Top scorer’s share of shots earlier in games                             | 15%         | 15%         | 14%            | 14%             | 14%–14%        |
| Last 5:00 within 5: points per possession                                | 1.23        | 1.24        | 1.17           | 1.12            | 1.12–1.13      |
| ... free-throw attempts per shot                                         | 0.45        | 0.44        | 0.37           | 0.39            | 0.38–0.40      |
| ... possessions per team                                                 | 9.8         | 9.7         | 10.9           | 10.8            | 10.8–10.8      |
| Free-throw trips, last 2:00 of games within 5                            | 2.62        | 2.56        | 2.10           | 2.24            | 2.17–2.38      |
| Leader at 2:00 (within 5) wins                                           | 71.6%       | 75.8%       | 74.8%          | 77.1%           | 74.5%–80.8%    |
| Decided by a shot in the last 5 s                                        | 4.0%        | 4.1%        | 4.7%           | 3.2%            | 2.8%–3.5%      |
| **Rotations and minutes**                                                |             |             |                |                 |                |
| Starter on the floor after his 2nd foul in Q1 (rest of half)             | 41%         | 43%         | 32%            | 42%             | 42%–42%        |
| ... 3rd in Q2 (rest of Q2)                                               | 22%         | 20%         | 2%             | 25%             | 25%–25%        |
| ... 4th in Q3 (rest of Q3)                                               | 22%         | 21%         | 1%             | 23%             | 23%–23%        |
| ... 5th in Q4, 7:00+ left (to 4:00)                                      | 38%         | 40%         | 19%            | 44%             | 43%–44%        |
| Starters on the floor: Q2 at 11:30                                       | 2.13        | 1.94        | 1.64           | 1.61            | 1.61–1.62      |
| ... Q2 at 7:30                                                           | 2.82        | 2.87        | 4.16           | 4.19            | 4.19–4.19      |
| ... Q2 at 1:30                                                           | 3.70        | 3.80        | 2.18           | 2.14            | 2.14–2.14      |
| ... Q3 at 2:30                                                           | 1.63        | 1.79        | 0.83           | 0.78            | 0.78–0.79      |
| ... Q4 at 11:30                                                          | 2.21        | 2.07        | 0.94           | 0.95            | 0.95–0.96      |
| ... Q4 at 1:30, games within 6 at 6:00                                   | 3.84        | 3.82        | 4.53           | 4.58            | 4.57–4.59      |
| Starters’ minutes in the last 6:00 of games within 6 (of 30)             | 21.9        | 22.6        | 26.3           | 26.4            | 26.4–26.4      |
| Starters’ Q4 minutes, 20+ margin entering Q4 (of 60)                     | 17.9        | 18.6        | 13.1           | 13.5            | 13.4–13.6      |
| Substitutions per team, last 2:00 of games within 6                      | 2.33        | 2.18        | 0.78           | 0.51            | 0.40–0.54      |
| Stints, 30-minute players                                                | 4.05        | 3.82        | 4.12           | 3.95            | 3.92–3.98      |
| Foul-outs per game                                                       | 0.21        | 0.18        | 0.18           | 0.20            | 0.16–0.21      |
| **Officials**                                                            |             |             |                |                 |                |
| Fouls per team: Q1                                                       | 3.85        | 3.52        | 4.73           | 4.60            | 4.55–4.64      |
| ... Q4                                                                   | 5.02        | 4.82        | 4.55           | 4.47            | 4.42–4.53      |
| Free-throw attempts per team: Q1                                         | 4.79        | 4.20        | 5.91           | 5.84            | 5.78–5.89      |
| ... Q4                                                                   | 6.38        | 6.08        | 5.44           | 5.52            | 5.43–5.61      |
| Technicals per game                                                      | 1.07        | 1.04        | 1.03           | 1.03            | 0.99–1.07      |
| Ejections per 100 games                                                  | 5.3         | 7.3         | 2.4            | 1.6             | 0.8–2.3        |
| Offensive fouls per team-game                                            | 1.46        | 1.39        | 1.68           | 1.66            | 1.61–1.70      |
| Loose-ball fouls per team-game                                           | 1.42        | 1.19        | 1.23           | 1.22            | 1.20–1.25      |
| **AI coaching**                                                          |             |             |                |                 |                |
| Timeouts per team-game                                                   | 5.39        | 5.42        | 5.06           | 5.50            | 5.43–5.55      |
| ... share in Q4                                                          | 35.0%       | 35.6%       | 35.8%          | 30.8%           | 30.3%–31.3%    |
| Q1-Q3 timeouts in the minute after 7:00 or 3:00                          | 33%         | 33%         | 72%            | 43%             | 43%–44%        |
| Quarters with 3+ timeouts                                                | 38%         | 39%         | 25%            | 46%             | 46%–47%        |
| Q1-Q3 timeouts called down an 8+ run                                     | 11%         | 12%         | 30%            | 23%             | 23%–23%        |
| Timeouts, last 2:00 of games within 5                                    | 2.16        | 2.25        | 2.30           | 2.15            | 2.07–2.25      |

## Method and caveats

- **Harness.** Each league game is recorded through hooks on `GameSim`'s prototype that call straight through. The engine is unchanged and its draws untouched.
  - The play-by-play is normalized into the same event format as the NBA reference, and one metrics script runs on both. No line of the sim's play-by-play went unparsed.
  - Shots, turnovers, free throws and timeouts take their structured fields from the hooked methods, not from the wording.
- **The "round-2 engine" column.** It is round 2's own seasons re-measured with this round's harness. Where the two harness corrections touch a number (possession-based measures, by under 1%), it differs slightly from round 2's report.
- **Small samples.** The last-second NBA cells hold 100-500 events a season, which is why both NBA seasons are shown. The sim's six seasons give 3-6 times as many. A sim value is called off only when it sits outside both NBA seasons by more than their own gap, and outside the six-season range of the sim.
- **Definitions for the new measures:**
  - "Top scorer" is the player with the most points a game for that team that season (20+ games).
  - "Team strength" is a team's mean margin that season.
  - "Starters" are the night's starters.
  - Shot-clock time runs from the change of possession; an offensive board starts it at 10 seconds used.
  - "Under pressure" means the leader gained the ball with 2-24 seconds left in Q4/OT, up 1-6.
- **Not covered:**
  - The user's own staff plays its settings as rules: it never rides foul trouble or calls the new quarter timeouts. This review measures league play, which is mostly AI staffs.
  - Multi-season shape (the tails `star-check` guards).
  - The front office.
