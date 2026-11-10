# Game-day realism review, round 4

November 10, 2026. A fresh, independent re-review after commit f27e467 ("Game-day realism round 3: star's last shot, late game, timeouts, stints"), which acted on round 3 (`review/GAMEDAY-REALISM-3.md`, 77/100). Same scope as rounds 1-3: how a game plays out on the floor and on the bench, against real NBA games. It covers the possession engine, the AI coaches, crunch time, rotations, the whistle, and what the live screen and the box score show. It does not cover the front office, progression or multi-season shape.

This round also applies the bar you set: it doesn't have to be perfect, it's just a game. Every finding says whether a player would notice it.

## Score: 84 / 100 (round 3: 77, round 2: 73, round 1: 62)

**On the same scale as rounds 1-3, 84. Judged as a game, on what a player can see, about 90. Most of what's left shows only in season-long numbers.**

- **What the round fixed.** On six seasons nobody tuned on, these now match the NBA:
  - **The finish of a close game.** From 2:00 left within five, games go to overtime 13.7% of the time (NBA 14.1-14.8%; round 3 10.7%) and the leader wins 73.5% (72-76%). Overtime overall: 4.4% of games (4.4-4.9%).
  - **Late choices.** Two-for-ones (64%), threes when down one (19%), and the leader's last trip all match. When the leader gets the ball in the last 24 seconds, the trailing side fouls, steals or concedes in the NBA's proportions.
  - **The star's last shot.** The top scorer takes 26% of his team's shots for the tie or the lead in the last 24 seconds, up from 17% (NBA 30-32%).
  - **The whistle and the bookkeeping.**
    - Fouls build through the game, from 3.6 a team in the first quarter to 4.9 in the fourth (NBA 3.5-3.9 to 4.8-5.0).
    - The home side keeps its small edge.
    - No rebound is credited after the horn.
    - Dead-ball team rebounds are inbounded.
    - Ejections happen at the NBA's rate.
  - **AI timeouts and rotations.**
    - A timeout against a run is a tendency, not a rule: 10% of first-to-third-quarter timeouts come down an 8-point run (NBA 11-12%; round 3 23%).
    - The second quarter's rotation has the NBA's shape.
    - A player hurt during the game is named in the box.
  - **Real stars hit their real scoring lines.** Dončić averages 32.7 (real 33.5), Gilgeous-Alexander 30.9 (31.1), Edwards 28.6 (28.8) and Curry 26.3 (26.6).
  - **Team box-score rates.** Points, shots, threes, free throws, rebounds, steals, blocks, turnovers and pace are all within 1-4% of the NBA's.
  - **Broad measures.** 204 of 266 sit inside the NBA's range. The round-3 engine had 180.
- **What a player would still notice.**
  1. **Jokić isn't Jokić.** He averages 25.6 points, 11.5 rebounds and 7.8 assists, with 14 triple-doubles a season. His real line is 27.7, 12.9 and 10.7, with 34 triple-doubles in each of the last two seasons. Passing big men get 20% fewer assists a minute than their real lines, and the league has half the NBA's triple-doubles.
  2. **AI teams don't play like themselves.** The coach AI picks playbooks by roster fit. The Warriors and the Thunder run Grit & Grind, and the scouting card tells you so. Denver gets the same post-up playbook, the likely cause of Jokić's missing assists.
  3. **The biggest nights are rare.** The league has half the NBA's 50-point games (8.8 a season against 17-18), and 29 players average 20 points (33-34). 40-point games are on the NBA's number.
- **What only the numbers show.** None of these would stand out in play:
  - Games decided by 3 or fewer: 12.9% (NBA 14.4-15.0%).
  - Shot locations: 4 points too many shots at the rim.
  - Late in the shot clock, shots keep their value.
  - The fourth quarter opens with 1.4 starters on the floor (NBA 2.1).
  - Standings are a little bunched next to the last two seasons, but within the NBA's range since 1996.
- **Recommendation.** Fix the first two, which are one change to how the coach AI picks playbooks and roles. Then stop. The third is a design call (finding 3).

### Scorecard

"As a game" counts only gaps a player could see: in the live view, the box score, the game report, the leader boards, the standings or a scouting card.

| Area                             | Weight  | Round 1 | Round 2 | Round 3 | Now    | As a game | Why                                                                                                                                                                                                        |
| -------------------------------- | ------- | ------- | ------- | ------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Box score and league rates       | 15      | 14      | 12.5    | 12      | 13     | 13.5      | Team rates within 1-4% and real stars on their scoring lines. Jokić and passing bigs short on assists, triple-doubles and 50-point games half the NBA's, the 20-point list a little flat                   |
| Game flow and results            | 10      | 8.5     | 8.5     | 8       | 8.5    | 9         | Overtime and the path to it right. Finals within 3 still 1.8 points short, 30-point games short, team strength a little compressed (within NBA history), the two teams' shooting still tied a bit          |
| Possession engine and tactics    | 10      | 7.5     | 8       | 8       | 8.5    | 9.5       | Points per trip, momentum, assisted shares and second chances right. Early shots still 6% of all shots (NBA 4%); the offense after an offensive board a little slow                                        |
| Shot profile and scoring texture | 10      | 6       | 5.5     | 6.5     | 6.5    | 8.5       | Unchanged this round: 4 points too many shots at the rim, 4 too few in the paint, few corner threes; the last seconds of the shot clock cost nothing; too many early threes                                |
| Clock and tempo                  | 10      | 5       | 7.5     | 8       | 9      | 9.5       | Two-for-ones, run-outs, late clock use and dead-ball inbounds right. The fourth quarter isn't slower than the first (NBA 5% slower), close finishes and overtime 4-5% fast                                 |
| Crunch time                      | 15      | 5       | 9.5     | 12      | 13.5   | 14.5      | Late shooting, last-second shots, the last 24 seconds and the path to overtime all match. The star takes 26% of last shots (30-32%); trailing twos with 5-24 s left go in too often                        |
| Rotations and minutes            | 10      | 6       | 7       | 7.5     | 8      | 8.5       | Second-quarter shape, foul trouble and minutes right. The fourth opens with 1.4 starters (2.1), closers too starter-heavy, no offense-defense swaps late, starters sit early in blowouts                   |
| Officiating and rules            | 8       | 3.5     | 6       | 6       | 7      | 7         | Whistle by quarter, home edge, horn rebounds, dead-ball inbounds and ejections fixed. No coach's challenges, goaltending or clear-path fouls; a first-technical ejection gives no reason                   |
| AI coaching                      | 7       | 3       | 4.5     | 5       | 5.5    | 5.5       | Timeouts as tendencies and two-for-ones fixed, the go-to star better. Playbooks ignore team identity (Warriors and Thunder on Grit & Grind), zone twice as often against you, timeouts bunched early in Q4 |
| Presentation                     | 5       | 3.5     | 4       | 4       | 4.5    | 4.5       | Horn rebounds and timeout pile-ups gone, in-game injuries named in the box. Scouting cards show the wrong team identities; ejections without a reason                                                      |
| **Total**                        | **100** | **62**  | **73**  | **77**  | **84** | **90**    |                                                                                                                                                                                                            |

## Would a player notice?

| What's left                                          | Where a player would see it                                        | Would they notice?                     |
| ---------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| Jokić and passing bigs short on assists              | Every Nuggets box score; the assist leaders (Jokić isn't top five) | Yes, any NBA fan                       |
| Triple-doubles half the NBA's                        | League news, player pages                                          | Yes, through Jokić                     |
| AI playbooks ignore team identity                    | Every scouting card ("Warriors: Grit & Grind at a slow pace")      | Yes                                    |
| 50-point games half the NBA's, 20-point list flat    | League news, scoring leaders                                       | Maybe, over a season                   |
| Bench opens the fourth; no late offense-defense subs | The live view                                                      | A careful watcher                      |
| Too many shots at the rim, few floaters and corners  | The shot chart in a game report                                    | A careful watcher                      |
| No coach's challenges                                | The live view                                                      | Maybe (a modern NBA fixture)           |
| Finals within 3: 12.9% (NBA 14.4-15.0%)              | One fewer close finish in about 55 games                           | No                                     |
| Standings a little bunched                           | The standings, next to the last two seasons                        | No (inside the NBA's range since 1996) |
| Late shot clock value, early threes, Q4 pace         | Only in season-long numbers                                        | No                                     |

## How this was measured

- **New seasons only.** Six seasons on league seeds 307, 331, 353, 379, 503 and 521: 7,386 games.
  - No round has tuned or validated on these seeds. The two halves (307-353 and 379-521) agree within noise. The appendix gives each measure's range.
- **The round-3 engine, for comparison.** Commit 4fce8db on round 3's own six seasons (seeds 97-181), as round 3 measured it.
- **The same harness and scripts as round 3**: 287 broad measures (266 with an NBA comparison) and the eleven targeted scripts. Two changes:
  - **Ejections.** The engine now ejects on a first technical now and then ("X is ejected."). The harness had dropped those lines: 247 of them in 7,386 games.
  - **A correction to round 3's tempo numbers.** Round 3 counted possessions from box-score totals (shots, free throws, turnovers, offensive rebounds). That skews the comparison, because the NBA files count dead-ball team rebounds between free throws as offensive rebounds. Counted by changes of possession instead:
    - The round-3 engine's close finishes were 3% fast, not 11-13%.
    - Its scoring per possession there was 4% low, not 9%.
    - Now they are 4% fast and on the NBA's 1.17.
- **What a player sees, new this round.**
  - Real players' season lines against their real 2025-26 lines.
  - The leader boards and the standings.
  - Team spread against 23 earlier NBA seasons (1996-97 to 2018-19, from the same play-by-play file).
  - The AI's playbooks and roles.
  - Two scratch runs on seed 307 to test causes. The repo was not changed.
- **Three games in the app**, as the Nuggets:
  - At Oklahoma City: lost 114-139.
  - Against New Orleans: won 126-109.
  - Against Golden State, watched live from 4:50 left with the Warriors up 126-121: lost 132-151.
  - Full play-by-play and box score read for each.
- **The repo's own check.** `npm run gameday-check -- --seed 307` (one season): 75 of 149 rows inside its bands, against 74 on seed 97 after the round-3 fixes. Its bands are the two NBA seasons with no allowance for one season's noise, so half the rows land outside on any seed.

## What the round-3 fixes got right

| Measure                                                        | NBA 2024-26                     | Round-3 engine  | Now             |
| -------------------------------------------------------------- | ------------------------------- | --------------- | --------------- |
| Overtime                                                       | 4.4-4.9%                        | 3.5%            | 4.4%            |
| Within 5 at 2:00: goes to overtime / leader wins               | 14.1-14.8% / 71.6-75.8%         | 10.7% / 77.1%   | 13.7% / 73.5%   |
| Free-throw trips, last 2:00 of games within 5                  | 2.56-2.62                       | 2.24            | 2.51            |
| Last 5:00 within 5: points per possession                      | 1.17-1.18                       | 1.13            | 1.18            |
| Leader up 1-2 gains the ball at 0:02-0:24: fouled / shot off   | 81-84% / 5-6%                   | 87% / 1%        | 83% / 6%        |
| Two-for-one taken                                              | 64-65%                          | 89%             | 64%             |
| Down 1, last 12 s: shoots a three                              | 19-21%                          | 38%             | 19%             |
| Last 24 s, tied or down 1-3: shots by the top scorer / top two | 30-32% / 47-51%                 | 17% / 34%       | 26% / 44%       |
| Leader uses 18 s+ after a score, last 3:00 within 8            | 58-59%                          | 69%             | 58%             |
| After a steal: first action within 4 s                         | 21%                             | 34%             | 23%             |
| After a dead-ball team rebound: shot or turnover within 4 s    | 0.7%                            | 13.5%           | 0.7%            |
| Player rebounds credited at 0:00.0, per game                   | 0.04                            | 2.27            | 0               |
| Fouls a team, Q1 / Q4                                          | 3.5-3.9 / 4.8-5.0               | 4.60 / 4.47     | 3.60 / 4.87     |
| Home minus away: fouls / free-throw attempts                   | −0.07 to −0.39 / +0.25 to +0.57 | +0.02 / −0.10   | −0.24 / +0.39   |
| Ejections per 100 games                                        | 5.3-7.3                         | 1.6             | 5.6             |
| Q1-Q3 timeouts called down an 8+ run                           | 11-12%                          | 23%             | 10%             |
| Starters on the floor, Q2 at 11:30 / 7:30 / 1:30               | 2.0 / 2.8 / 3.7                 | 1.6 / 4.2 / 2.1 | 1.9 / 2.8 / 3.9 |
| FGA / second-chance points a team                              | 89.0 / 14.1-15.0                | 86.6 / 12.8     | 89.2 / 15.0     |
| Assisted share of paint / mid-range makes                      | 48-49% / 38-39%                 | 38% / 28%       | 45% / 38%       |
| Season scoring leader, points a game                           | 32.7-33.5                       | 30.3            | 32.8            |
| 5-steal games a season                                         | 122-144                         | 19              | 72              |

In the live games, the play-by-play read like the NBA's.

- Shot descriptions vary (step-backs, drop-steps, finger rolls, runners).
- Timeouts follow runs and the coaches spend them through the fourth.
- A shot with 2.6 seconds left was rebounded at 0.2, one after the horn by nobody.
- "Left the game: A. Gordon, injured" sat under the Nuggets' box.

Two things looked odd in the Warriors game, and both turned out to be one-night quirks:

- Murray went out and back in three times in 33 seconds.
- Denver called a timeout down 19 with 1:09 left.

Over the six seasons, quick returns run 2.95 a game (NBA 3.1-3.5), and timeouts in the last two minutes of 15-point games 0.05 a game (0.05-0.07).

## Findings

### 1. Passing big men, and the triple-doubles they bring (P1 as a game)

**What it is.** The engine credits a center's passing at about 80% of his real rate. The players hit hardest are the ones fans know best.

| Player or group                          | Real 2025-26            | Sim, six seasons                      |
| ---------------------------------------- | ----------------------- | ------------------------------------- |
| Jokić: points / rebounds / assists       | 27.7 / 12.9 / 10.7      | 25.6 / 11.5 / 7.8                     |
| Jokić: triple-doubles a season           | 34 (also 34 in 2024-25) | 14.3                                  |
| Assists a minute, share of the real line | 100%                    | centers 80%, forwards 87%, guards 94% |
| Triple-doubles a season, league          | 136-149                 | 70                                    |
| ... without Jokić                        | 102-115                 | 55                                    |

Giddey (12 a season, real 13) and Dončić (5, real 5-8) get theirs. Jokić gets 14 of his 34, and that is most of the league's gap.

On a season's assist leaders, Jokić isn't in the top five. Real 2025-26 has him first.

**Why.** Two candidates were tested.

- **Not the in-game assist brake.** `K.astCap` (0.45, `constants.ts:302`) slows a passer once he has assisted on 45% of his teammates' baskets in a game. That is Jokić's real level. A scratch season with it at 0.6 moved Trae Young to 11.9 assists a game and Jokić to 6.6. The brake only spreads assists; it doesn't cause the gap.
- **The playbook the coach AI gives him.** A month into a season the AI has Denver on Grit & Grind's actions: post-ups 58, handoffs 30. Hub Big, "run it through the big", has handoffs 72. A center's assists come from handoffs, post kick-outs and short rolls.
  - Only Jokić and Antetokounmpo are cast in the hub role.
  - Sabonis is a roller on Sacramento's Hub Big team.
  - I couldn't confirm the effect in a scratch run, because the coach AI refits the playbook before games (`games.ts:319-323`). This is the likely cause, not a proven one.

**Fix.** Part of finding 2.

- The coach AI should give a team with an elite passing center the Hub Big playbook or its handoff weight, and cast the passing bigs as hubs.
- Then check Jokić and Sabonis over a season.
- If Jokić still doesn't reach 9-10 assists, the hub's share of touches in `handoff.ts` and `motion.ts` needs raising.

### 2. AI teams don't play like themselves (P1 as a game)

**What it is.** A month into seed 307's season the AI's playbooks were:

| Playbook     | Teams                                               |
| ------------ | --------------------------------------------------- |
| Pace & Space | 9                                                   |
| Heliocentric | 7                                                   |
| Five-Out     | 5                                                   |
| Grit & Grind | 4: Denver, Detroit, Golden State and Oklahoma City  |
| Hub Big      | 4: the Clippers, the Lakers, Orlando and Sacramento |
| Balanced     | 1                                                   |

The Warriors' scouting card reads "Runs Grit & Grind at a slow pace". The real Warriors are the league's motion offense, and the real Thunder run Gilgeous-Alexander's pick-and-rolls.

Within a season the playbook works: Pace & Space teams play 4.5 more possessions a game than the rest. But the teams' identities come from the AI's roster fit and `style-gate`'s limits, not from how the real teams play. Across seeds, a team's pace tracks its real 2025-26 pace with a correlation of 0.39. The real league's own year-to-year correlation is 0.55.

AI defenses also play zone on 11% of trips against your team, against 5% against each other. In the live opener, the Thunder's plan was "plays a 2-3 zone".

**Why it matters as a game.** The scouting card is the one place the game tells you how an opponent plays, and for some teams it's wrong.

**Fix.** Seed each real team's playbook from its real play types, then let the AI drift from it only as the roster changes. The data pipeline already reads them (`cache_pbp_*` has each player's post-ups, cuts, drives, pull-ups and transition shots). Keep `style-gate`'s limit on any one playbook dominating. It is about fits, and it should still hold.

### 3. The biggest nights are half as common (P2, a design call)

| Measure                                     | NBA 2024-26 | Round-3 engine | Now                |
| ------------------------------------------- | ----------- | -------------- | ------------------ |
| 40-point games a season                     | 133-139     | —              | 127                |
| 50-point games a season                     | 17-18       | 9.5            | 8.8                |
| Players averaging 20+                       | 33-34       | 26.7           | 28.8               |
| The real top 30 scorers against their lines | 0           | —              | −1.5 points a game |
| 5-steal games a season                      | 122-144     | 19             | 72                 |
| 20-rebound games a season                   | 26-39       | 19.5           | 21.5               |

The top stars and the 40-point nights are right. The tail past 50 is thin, and the second tier of scorers sits 1.5 points under their real lines.

**Why.** The in-game limits that hold a star's share of the ball also hold the multi-season scoring leaders in `star-check`:

- `K.usageDamp` 10.5 (`constants.ts:236`).
- `K.useContest` 1.1: tougher looks once a scorer is past his share of the ball (`shots.ts:228-231`).
- `K.stealCap`, from a fourth steal (`constants.ts:983`).

The round-3 fix session found that a developed star's scoring ratings reach 100, which is a progression matter.

**Call.** Leave it, or cap rating growth in progression and then ease the in-game limits. As a game, half the 50-point nights is a mild loss, so this is yours to weigh.

### 4. Close finals a little short (P3: numbers only)

12.9% of games end within 3 (NBA 14.4-15.0%). That is lower than every NBA season since 1996-97 (lowest 13.9%).

From 2:00 left within five, everything now matches: overtime, the leader's chances, both sides' points and free throws. The gap is spread thin:

- Slightly fewer games within five at 2:00 (25.5% against 26.6-26.9%).
- Slightly fewer of those ending within 3 (32.7% against 35.3-35.8%).

A player gets about one fewer one-possession final in 55 games. Leave it.

### 5. Shot locations and the late shot clock (P3, unchanged from round 3)

| Measure                                            | NBA 2024-26           | Now         |
| -------------------------------------------------- | --------------------- | ----------- |
| Rim share of shots                                 | 28.5-28.8%            | 32.9%       |
| Paint (non-rim) share                              | 18.4-18.7%            | 14.9%       |
| Corner-three share                                 | 10.8%                 | 9.0%        |
| Pull-ups, share of jumpers                         | 20.1-20.8%            | 24.9%       |
| Points a shot, 20-24 s / 24+ s of the clock        | 0.99-1.01 / 0.93-0.94 | 1.05 / 1.06 |
| Share of shots in the first 4 s, threes among them | 3.8-4.1%, 30-31%      | 6.1%, 43%   |

Round 3's findings 5 and 10 still stand. A player would only see this on a game report's shot chart. Round 3's note holds too: any shot-clock cost needs a playbook refit (`scripts/style-fit.ts`), because a plain constant makes Pace & Space dominate `style-gate`. Leave it unless finding 2's playbook work opens the door.

### 6. Rotation tails (P3)

| Measure                                                    | NBA 2024-26       | Round-3 engine | Now       |
| ---------------------------------------------------------- | ----------------- | -------------- | --------- |
| Starters on the floor, Q3 at 2:30 / Q4 at 11:30            | 1.6-1.8 / 2.1-2.2 | 0.8 / 0.95     | 1.3 / 1.4 |
| Starters on the floor at 1:30 of close fourth quarters     | 3.8               | 4.6            | 4.6       |
| Starters' minutes in the last 6:00 of close games (of 30)  | 21.9-22.6         | 26.4           | 24.3      |
| Substitutions a team in the last 2:00 of close games       | 2.2-2.3           | 0.5            | 0.5       |
| Starters' fourth-quarter minutes in 20-point games (of 60) | 17.9-18.6         | 13.5           | 13.8      |

Minutes otherwise match: 0-5 players a season average 36 or more (NBA 3-14), 67-73 average 30 (65-84), and starters play 29.5 a game (29.6-30.8).

The AI closes with its five starters and doesn't swap for offense and defense in the last minute. A careful watcher of the live view might notice the bench opening the fourth.

### 7. Small things only the numbers show (P3)

- **Pace by quarter.** The fourth quarter isn't slower than the first (24.2 and 24.1 possessions a team; NBA 24.8-25.1 and 23.8). Close fourth quarters run 4% fast and blowouts 7% slow, the opposite of the NBA's garbage time. Overtime and close finishes run 4-5% fast.
- **Opening trips.** A quarter's first trip reaches its first shot or turnover in 12.9 seconds (median; NBA 17).
- **Shared shooting nights.** The two teams' field-goal percentages still correlate (0.13; NBA about 0), with `K.envShoot` at 0. Pace and garbage time are the likely sources.
- **Trailing twos.** Tied or down 1-3 with 5-24 seconds left, the trailing side's twos go in 59% (NBA 51-54%). `K.lastLook.late.behind` (1.05 on twos) and `down2` (1.15) were fitted to a few dozen NBA shots a season.
- **Fourth-quarter timeouts.** They bunch early: 37% before 7:00 (NBA 28-29%) and 15% from 6:00 to 3:00 (29-30%). 47% of quarters have three or more timeouts (38-39%).
- **Missing calls.** No coach's challenges (NBA 0.28 a game), no goaltending (0.05-0.06 a team-game) and no clear-path fouls. A first-technical ejection reads "X is ejected." with no reason. Technical free throws run 20% high.
- **Assists and run-outs.** Assists run 4% low, with above-the-break threes assisted 72% of the time (78-81%). Fast-break points are 5% high.
- **Team spread.** A season's team net ratings spread with an SD of 4.4-5.3. The NBA's was 5.9-6.1 in 2024-26 and 3.8-5.4 from 1996-97 to 2018-19. The better team wins 64.7% (68.7-69.3%; 64-73% in 1996-2019). This was a P1 in round 3, against the two most spread-out seasons in the file; against the NBA's history it is ordinary.

## Where to stop

| Step                                                                                      | Strict | As a game |
| ----------------------------------------------------------------------------------------- | ------ | --------- |
| Playbooks from each real team's play types, and hub roles for passing bigs (findings 1-2) | +2.5   | +3        |
| Optional: progression caps rating growth, then ease the in-game star limits (finding 3)   | +1     | +0.5      |
| Everything else                                                                           | +3     | +0.5      |

**Doing the first gets it to about 86 strict and 93 as a game. That is where I'd stop.** The rest is real but invisible in play. Chasing it is the tuning loop you asked to avoid.

## Appendix: the measures

NBA columns are the 2025-26 and 2024-25 regular seasons from `data/raw/games/PlayByPlay.parquet`. "Round-3 engine" is commit 4fce8db on round 3's six seasons (seeds 97-181). "Now" is commit f27e467 on seeds 307-521, 7,386 games. "Range" is the per-season range for box-score rows, and the two halves (307-353 and 379-521) for the rest.

The possession rows are counted by changes of possession. That is not round 3's box-score estimate (see "How this was measured").

| Measure                                                                  | NBA 2025-26 | NBA 2024-25 | Round-3 engine | Now (6 seasons) | Range          |
| ------------------------------------------------------------------------ | ----------- | ----------- | -------------- | --------------- | -------------- |
| **Box and league rates**                                                 |             |             |                |                 |                |
| Points per team-game                                                     | 115.6       | 113.8       | 113.9          | 115.3           | 114.4–116.5    |
| FG%                                                                      | 47.1%       | 46.9%       | 47.9%          | 47.5%           | 47.0%–47.8%    |
| 2P%                                                                      | 55.0%       | 54.5%       | 55.9%          | 55.7%           | 55.2%–56.1%    |
| 3P%                                                                      | 36.0%       | 36.3%       | 36.6%          | 36.0%           | 35.7%–36.2%    |
| FGA per team-game                                                        | 89.1        | 89.0        | 86.6           | 89.2            | 88.3–89.8      |
| 3PA per team-game                                                        | 37.0        | 37.3        | 36.0           | 37.1            | 36.7–37.6      |
| FTA per team-game                                                        | 23.5        | 21.7        | 22.9           | 22.2            | 21.7–22.8      |
| Rebounds per team-game                                                   | 43.8        | 44.1        | 43.5           | 43.2            | 42.7–43.6      |
| Offensive rebounds per team-game                                         | 11.38       | 11.12       | 11.05          | 11.32           | 11.14–11.42    |
| Assists per team-game                                                    | 26.7        | 26.5        | 24.7           | 25.5            | 25.1–26.0      |
| Steals per team-game                                                     | 8.42        | 8.20        | 8.02           | 8.13            | 7.90–8.23      |
| Blocks per team-game                                                     | 4.84        | 4.88        | 4.98           | 5.02            | 4.96–5.08      |
| Turnovers per team-game                                                  | 14.51       | 14.30       | 14.33          | 14.13           | 13.80–14.32    |
| Personal fouls per team-game                                             | 19.9        | 18.6        | 19.7           | 19.2            | 18.7–19.7      |
| Pace (possessions per 48)                                                | 102.5       | 101.4       | 100.0          | 101.6           | 100.4–102.7    |
| Double-doubles per team-game                                             | 0.78        | 0.91        | 0.71           | 0.74            | 0.71–0.78      |
| Triple-doubles per game                                                  | 0.111       | 0.121       | 0.052          | 0.057           | 0.047–0.065    |
| Players averaging 20+ points, per season                                 | 33.0        | 34.0        | 26.7           | 28.8            | 27.7–30.0      |
| Season scoring leader, points a game                                     | 33.5        | 32.7        | 30.3           | 32.8            | 32.3–33.3      |
| 50-point games per season                                                | 17.0        | 18.0        | 9.5            | 8.8             | 8.0–9.7        |
| 5-steal games per season                                                 | 144         | 122         | 19             | 72              | 65–79          |
| 20-rebound games per season                                              | 26.0        | 39.0        | 19.5           | 21.5            | 20.7–22.3      |
| 15-assist games per season                                               | 36.0        | 59.0        | 25.0           | 33.2            | 30.7–35.7      |
| Scoreless games in 20+ minutes, per season                               | 149         | 163         | 190            | 172             | 167–177        |
| Players averaging 22+: game-to-game CV of points                         | 0.313       | 0.323       | 0.347          | 0.342           | 0.338 to 0.346 |
| Assisted share of made shots: rim                                        | 60%         | 61%         | 60%            | 58%             | 58%–58%        |
| ... paint                                                                | 48%         | 49%         | 38%            | 45%             | 44%–45%        |
| ... mid-range                                                            | 38%         | 39%         | 28%            | 38%             | 38%–38%        |
| ... above-the-break three                                                | 81%         | 78%         | 72%            | 72%             | 72%–72%        |
| Second-chance points per team-game                                       | 15.0        | 14.1        | 12.8           | 15.0            | 15.0–15.0      |
| Fast-break points per team-game                                          | 15.2        | 15.5        | 17.3           | 16.3            | 16.1–16.6      |
| **Results and game flow**                                                |             |             |                |                 |                |
| Margin SD                                                                | 16.4        | 15.9        | 15.1           | 15.5            | 15.3–15.6      |
| Decided by 3 or fewer                                                    | 14.4%       | 15.0%       | 12.7%          | 12.9%           | 11.4%–13.9%    |
| Decided by 30 or more                                                    | 7.8%        | 6.5%        | 4.3%           | 5.5%            | 4.5%–6.4%      |
| Overtime                                                                 | 4.4%        | 4.9%        | 3.5%           | 4.4%            | 3.7%–5.6%      |
| Home win %                                                               | 55.5%       | 54.4%       | 54.7%          | 54.7%           | 53.9%–55.6%    |
| Lead changes per game                                                    | 6.8         | 6.6         | 6.8            | 6.8             | 6.6–7.0        |
| Comeback from 10+ down                                                   | 26.9%       | 28.0%       | 24.6%          | 24.9%           | 23.8%–26.7%    |
| Leader after Q1 wins                                                     | 65.4%       | 66.7%       | 68.4%          | 67.6%           | 65.5%–70.0%    |
| Up 10-14 after Q1: wins                                                  | 73.2%       | 75.4%       | 78.6%          | 78.5%           | 77.1%–79.8%    |
| Quarter margin per point of lead at its start: Q2                        | −0.11       | −0.13       | −0.08          | −0.10           | −0.10 to −0.10 |
| ... Q3                                                                   | −0.06       | −0.11       | −0.10          | −0.08           | −0.09 to −0.08 |
| ... Q4                                                                   | −0.13       | −0.13       | −0.14          | −0.13           | −0.14 to −0.13 |
| Better team (by season margin) wins                                      | 69.3%       | 68.7%       | 65.4%          | 64.7%           | 63.4%–66.0%    |
| Final margin explained by team strength (R²)                             | 0.268       | 0.264       | 0.187          | 0.191           | 0.185 to 0.196 |
| Correlation of the two teams’ FG%                                        | -0.01       | 0.01        | 0.18           | 0.13            | 0.13–0.13      |
| Correlation of the two teams’ points                                     | 0.19        | 0.22        | 0.33           | 0.33            | 0.33–0.34      |
| Trips scoring 0 points                                                   | 48.0%       | 48.7%       | 48.0%          | 47.4%           | 47.3%–47.5%    |
| Scoring rate after a scoring trip minus after an empty one (points of %) | +0.4        | +0.3        | +0.6           | +0.7            | +0.5 to +0.8   |
| **Shot profile and shot clock**                                          |             |             |                |                 |                |
| Rim share of FGA                                                         | 28.8%       | 28.5%       | 33.7%          | 32.9%           | 32.6%–33.5%    |
| Paint (non-rim) share                                                    | 18.4%       | 18.7%       | 14.4%          | 14.9%           | 14.8%–15.0%    |
| Corner-3 share                                                           | 10.8%       | 10.8%       | 8.9%           | 9.0%            | 8.9%–9.3%      |
| Dunks, share of FGA                                                      | 6.2%        | 6.1%        | 6.1%           | 6.1%            | 5.9%–6.3%      |
| Tip-ins, share of FGA                                                    | 2.1%        | 2.2%        | 1.2%           | 1.4%            | 1.4%–1.5%      |
| Pull-ups, share of jumpers                                               | 20.8%       | 20.1%       | 24.3%          | 24.9%           | 23.9%–26.3%    |
| Points per shot, 0-4 s of shot clock used                                | 1.39        | 1.34        | 1.35           | 1.33            | 1.32–1.33      |
| Points per shot, 4-8 s of shot clock used                                | 1.19        | 1.18        | 1.18           | 1.17            | 1.17–1.18      |
| Points per shot, 8-12 s of shot clock used                               | 1.13        | 1.12        | 1.08           | 1.08            | 1.08–1.09      |
| Points per shot, 12-16 s of shot clock used                              | 1.09        | 1.10        | 1.09           | 1.08            | 1.08–1.08      |
| Points per shot, 16-20 s of shot clock used                              | 1.05        | 1.06        | 1.08           | 1.08            | 1.08–1.08      |
| Points per shot, 20-24 s of shot clock used                              | 0.99        | 1.01        | 1.06           | 1.05            | 1.05–1.06      |
| Points per shot, 24+ s of shot clock used                                | 0.93        | 0.94        | 1.07           | 1.06            | 1.06–1.06      |
| Share of shots in the first 4 s                                          | 4.1%        | 3.8%        | 7.4%           | 6.1%            | 6.1%–6.1%      |
| ... of them threes                                                       | 30%         | 31%         | 42%            | 43%             | 43%–43%        |
| Heaves per game                                                          | 0.94        | 0.56        | 0.87           | 0.88            | 0.87–0.89      |
| **Clock and tempo**                                                      |             |             |                |                 |                |
| After a defensive board: shot or turnover within 6 s                     | 35.4%       | 34.4%       | 33.9%          | 33.1%           | 31.8%–34.3%    |
| After a steal: first action within 4 s                                   | 21.1%       | 20.8%       | 33.8%          | 23.2%           | 22.8%–23.9%    |
| After a dead-ball defensive team rebound: within 4 s                     | 0.7%        | 0.7%        | 13.5%          | 0.7%            | 0.5%–0.8%      |
| After an offensive board: next action within 4 s                         | 77.5%       | 76.9%       | 67.1%          | 70.3%           | 69.7%–70.7%    |
| Two-for-one taken (trip begun at 0:33-0:40)                              | 65.3%       | 64.0%       | 89.2%          | 64.3%           | 60.4%–66.9%    |
| Shot-clock violations per team-game                                      | 0.67        | 0.74        | 0.76           | 0.72            | 0.65–0.77      |
| Possessions per team (counted by changes of possession): Q1              | 25.1        | 24.8        | 24.7           | 24.2            | —              |
| ... Q4                                                                   | 23.8        | 23.8        | 24.0           | 24.1            | —              |
| ... an overtime period                                                   | 9.9         | 9.6         | 10.4           | 10.2            | —              |
| Last 3:00 within 8: leader uses 18 s+ after a score                      | 58%         | 59%         | 69%            | 58%             | 58%–59%        |
| ... trailer shoots within 8 s of a defensive board                       | 51%         | 48%         | 55%            | 48%             | 48%–48%        |
| End of Q1-Q3, ball gained with 1-6 s left: gets a shot off               | 68%         | 57%         | 67%            | 69%             | 69%–69%        |
| **Crunch time**                                                          |             |             |                |                 |                |
| 4:00-0:24 left, within 6: leader 2P%                                     | 51.0%       | 50.2%       | 49.9%          | 50.3%           | 49.8%–50.7%    |
| ... leader 3P%                                                           | 33.7%       | 32.3%       | 34.9%          | 32.1%           | 30.9%–33.2%    |
| ... trailer 2P%                                                          | 54.3%       | 52.8%       | 52.6%          | 53.5%           | 52.9%–54.1%    |
| ... trailer 3P%                                                          | 34.1%       | 34.7%       | 33.3%          | 33.9%           | 33.1%–34.7%    |
| Tied or down 1-3, last 5 s: 2P% (heaves excluded)                        | 33%         | 34%         | 37%            | 33%             | 32%–35%        |
| ... 3P%                                                                  | 21%         | 19%         | 21%            | 21%             | 20%–23%        |
| ... 5 to 24 s left: 2P%                                                  | 51%         | 54%         | 50%            | 59%             | 58%–61%        |
| ... 3P%                                                                  | 23%         | 27%         | 23%            | 22%             | 20%–24%        |
| Leader up 1-2 gains the ball at 0:02-0:24: fouled                        | 84%         | 81%         | 87%            | 83%             | 82%–84%        |
| ... clock runs out                                                       | 2%          | 3%          | 3%             | 3%              | 3%–4%          |
| ... turns it over                                                        | 7%          | 11%         | 10%            | 8%              | 7%–8%          |
| ... gets a shot off                                                      | 6%          | 5%          | 1%             | 6%              | 4%–7%          |
| Leader up 3 gains the ball at 0:02-0:24: fouled                          | 83%         | 84%         | 84%            | 82%             | 82%–83%        |
| ... clock runs out                                                       | 5%          | 6%          | 3%             | 3%              | 2%–5%          |
| ... turns it over                                                        | 7%          | 6%          | 12%            | 8%              | 8%–9%          |
| ... gets a shot off                                                      | 4%          | 3%          | 1%             | 6%              | 6%–6%          |
| Leader up 4-6 gains the ball at 0:02-0:24: fouled                        | 61%         | 61%         | 67%            | 63%             | 63%–64%        |
| ... clock runs out                                                       | 26%         | 28%         | 28%            | 29%             | 28%–30%        |
| ... turns it over                                                        | 7%          | 5%          | 4%             | 6%              | 5%–6%          |
| ... gets a shot off                                                      | 7%          | 6%          | 0%             | 2%              | 2%–2%          |
| Down 1, last 12 s with the ball: shoots a three                          | 19%         | 21%         | 38%            | 19%             | 19%–19%        |
| Down 2: shoots a three                                                   | 40%         | 45%         | 40%            | 36%             | 35%–36%        |
| Leader fouls when up 3, possession begun in the last 0:12                | 30.2%       | 28.1%       | 33.7%          | 31.4%           | 21.5%–41.0%    |
| ... any foul before the trailing side’s shot (trips in the last 12 s)    | 33%         | 32%         | 43%            | 43%             | 40%–45%        |
| Last 24 s, tied or down 1-3: shots by the team’s top scorer              | 32%         | 30%         | 17%            | 26%             | 24%–28%        |
| ... by its top two                                                       | 51%         | 47%         | 34%            | 44%             | 42%–46%        |
| Top scorer’s share of shots earlier in games                             | 15%         | 15%         | 14%            | 13%             | 13%–14%        |
| Last 5:00 within 5: points per possession (same count)                   | 1.17        | 1.18        | 1.13           | 1.18            | —              |
| ... free-throw attempts per shot                                         | 0.45        | 0.44        | 0.39           | 0.43            | 0.42–0.44      |
| ... possessions per team                                                 | 10.5        | 10.4        | 10.7           | 10.9            | —              |
| Free-throw trips, last 2:00 of games within 5                            | 2.62        | 2.56        | 2.24           | 2.51            | 2.42–2.65      |
| Leader at 2:00 (within 5) wins                                           | 71.6%       | 75.8%       | 77.1%          | 73.5%           | 72.0%–75.2%    |
| Decided by a shot in the last 5 s                                        | 4.0%        | 4.1%        | 3.2%           | 3.7%            | 3.3%–4.1%      |
| **Rotations and minutes**                                                |             |             |                |                 |                |
| Starter on the floor after his 2nd foul in Q1 (rest of half)             | 41%         | 43%         | 42%            | 42%             | 42%–42%        |
| ... 3rd in Q2 (rest of Q2)                                               | 22%         | 20%         | 25%            | 28%             | 28%–28%        |
| ... 4th in Q3 (rest of Q3)                                               | 22%         | 21%         | 23%            | 23%             | 23%–23%        |
| ... 5th in Q4, 7:00+ left (to 4:00)                                      | 38%         | 40%         | 44%            | 42%             | 40%–44%        |
| Starters on the floor: Q2 at 11:30                                       | 2.13        | 1.94        | 1.61           | 1.92            | 1.92–1.92      |
| ... Q2 at 7:30                                                           | 2.82        | 2.87        | 4.19           | 2.85            | 2.85–2.85      |
| ... Q2 at 1:30                                                           | 3.70        | 3.80        | 2.14           | 3.89            | 3.88–3.90      |
| ... Q3 at 2:30                                                           | 1.63        | 1.79        | 0.78           | 1.27            | 1.27–1.28      |
| ... Q4 at 11:30                                                          | 2.21        | 2.07        | 0.95           | 1.43            | 1.43–1.44      |
| ... Q4 at 1:30, games within 6 at 6:00                                   | 3.84        | 3.82        | 4.58           | 4.56            | 4.56–4.57      |
| Starters’ minutes in the last 6:00 of games within 6 (of 30)             | 21.9        | 22.6        | 26.4           | 24.3            | 24.3–24.3      |
| Starters’ Q4 minutes, 20+ margin entering Q4 (of 60)                     | 17.9        | 18.6        | 13.5           | 13.8            | 13.6–14.1      |
| Substitutions per team, last 2:00 of games within 6                      | 2.33        | 2.18        | 0.51           | 0.50            | 0.44–0.54      |
| Stints, 30-minute players                                                | 4.05        | 3.82        | 3.95           | 3.79            | 3.74–3.83      |
| Foul-outs per game                                                       | 0.21        | 0.18        | 0.20           | 0.21            | 0.18–0.25      |
| **Officials**                                                            |             |             |                |                 |                |
| Fouls per team: Q1                                                       | 3.85        | 3.52        | 4.60           | 3.60            | 3.57–3.62      |
| ... Q4                                                                   | 5.02        | 4.82        | 4.47           | 4.87            | 4.86–4.87      |
| Free-throw attempts per team: Q1                                         | 4.79        | 4.20        | 5.84           | 4.18            | 4.11–4.24      |
| ... Q4                                                                   | 6.38        | 6.08        | 5.52           | 6.14            | 6.11–6.16      |
| Technicals per game                                                      | 1.07        | 1.04        | 1.03           | 1.06            | 1.05–1.08      |
| Ejections per 100 games                                                  | 5.3         | 7.3         | 1.6            | 5.6             | 4.6–6.7        |
| Offensive fouls per team-game                                            | 1.46        | 1.39        | 1.66           | 1.57            | 1.56–1.59      |
| Loose-ball fouls per team-game                                           | 1.42        | 1.19        | 1.22           | 1.27            | 1.25–1.32      |
| **AI coaching**                                                          |             |             |                |                 |                |
| Timeouts per team-game                                                   | 5.39        | 5.42        | 5.50           | 5.47            | 5.41–5.53      |
| ... share in Q4                                                          | 35.0%       | 35.6%       | 30.8%          | 33.1%           | 32.4%–33.7%    |
| Q1-Q3 timeouts in the minute after 7:00 or 3:00                          | 33%         | 33%         | 43%            | 39%             | 38%–40%        |
| Quarters with 3+ timeouts                                                | 38%         | 39%         | 46%            | 47%             | 45%–48%        |
| Q1-Q3 timeouts called down an 8+ run                                     | 11%         | 12%         | 23%            | 10%             | 10%–10%        |
| Timeouts, last 2:00 of games within 5                                    | 2.16        | 2.25        | 2.15           | 2.22            | 2.15–2.30      |

## Method and caveats

- **Seasons.** The league is the real 2026-27 league from `src/data/seed.json`, built the way the app builds it: `createLeague` with each seed, then the regular season by `simDay`. The harness hooks the engine's prototype to record every league game. The user team's games are included and its staff makes the calls.
- **Comparing rosters.** The rosters are 2026-27's and the NBA references are 2024-25 and 2025-26. So team-by-team results aren't compared, only league-wide shapes. Player lines are compared for players with 40 or more real games and 30 or more in at least three simulated seasons (290 players). Changed roles and aging explain some single gaps, such as Durant's minutes.
- **Noise.** One NBA season has about 330 games within five at 2:00, and a few dozen late two-point shots for each score. Rows built on those carry a few points of noise on the NBA side. The six simulated seasons carry about a third of it.
- **Scratch runs.** Two on seed 307 tested finding 1's causes: the assist brake at 0.6, and Denver's playbook forced to Hub Big. The second had no effect, because the coach AI refits playbooks before games. No repo file was changed.
- **Scripts.** The harness, the scripts and the NBA reference files are in this session's scratchpad, not the repo. The NBA files rebuild from the parquet.
