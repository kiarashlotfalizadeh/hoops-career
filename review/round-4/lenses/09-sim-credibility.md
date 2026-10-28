The harness refused to write `REPORT.md` (subagents can't write report files), so the full report is below and nothing is saved at that path. My scripts, outputs and screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/sim-credibility/`, written below as `./`. The browser profile is deleted. Timings ran on a shared machine (load average 19-26).

# Sim credibility review, round 4 (`sim-credibility`)

## 1. Verdict

A single night and a single season now feel like the NBA. League rates sit within 1-3% of 2025-26 in all 11 seeds I ran. Box scores read like real ones. The tail problems from round 3 are fixed: the longest streak is 25 games, the threes leader is sensible, and the All-Star badge starts at 86.

What still breaks it for a fan sits in three places:

- **Defense on the player card.** Maxey's perimeter defense is 86, "elite", and is the first thing his card lists. Trae Young's is 78, above Lu Dort's 75. Draymond, Dort, Herb Jones and Caruso made the All-Defense first team 0 times in 36 simulated seasons.
- **Star production.** The sim has about half the real league's 25-point scorers (6.7 a season vs 13 in 2025-26). The scoring leader's median is 29.7, while the real league has had a 33-34 PPG leader in each of the last four seasons.
- **The longer run.** The opening-season Thunder still reach 70 wins in 4 of 22 seeds, and one later season had a 77-5 team. Over five summers the league drifts smaller: threes go from 42.5% to 45% of shots, and players averaging 10 rebounds fall from 7.5 to about 1.5 a season.

The endgame also has a real hole. A team trailing by 3, with the leader holding the ball and under 24 seconds left, never fouls.

**Score: 7.4/10** (round 3: 7.0). One season is as credible as BBGM or better. The ratings layer still lacks the reputation sense 2K builds in, and the multi-season shape is not yet solid.

## 2. What's genuinely great (protect these)

- **League rates are on the NBA's** (`./real-check*.txt`, 11 seeds: rng 1-11, sim vs 2025-26).
  - Pace 99.6-102.1 (99.6). Points 112.5-115.3 (114.4). 3PA 36.6-37.9 (37.5). 3P% .353-.359 (.359). FTA 20.7-22.1 (21.8). STL, BLK and TOV within 3%.
  - Margin SD 14.5-15.4 (16). Games decided by 20+: 18.3-21.8% (21%). 2.14-2.40 wins per point of margin (NBA 2.2-2.4).
- **Players' lines track their real ones.** Over 221-226 regulars per seed: PPG r 0.92-0.95, RPG 0.92-0.95, BPG 0.91-0.95, 3PM 0.92-0.96, 3PA share r 0.95-0.96.
  - Team net rating against the players' real BPM: r 0.81-0.89.
- **The top of the ladder reads right** (`./ratings.txt`). SGA 97, Wembanyama 97, Jokić 96, Dončić 95, Giannis 93.
  - The tiers come out 5 / 18 / 38 (Superstar / All-NBA or better / All-Star or better). All 23 reputation anchors hold.
  - Curry is 87 "All-Star". Gobert went from 77 to 80, and his market value from $5.3M to $10.8M.
- **The tail problems are gone** (star-check, 4 leagues × 8 seasons, PASS in 184 s; `./star-check.txt`).
  - Longest streak: median 18, max 25 (round 3: 19 and 36, with 41 in a lab).
  - Threes leader: mean 4.79 a game, at most 5.63, and 5.2 or less in 81% of seasons. 10-three nights: 10.1 a season (round 3: 15.2).
  - Scoring leader at most 34.0, no 35-PPG season. Game high 66. Max margin 70.
- **Titles spread out.** OKC won 10 of 32 in star-check and 7 of 36 in my six leagues (`./shape-20*.json`).
  - My six leagues crowned 14 different champions.
  - Seeds 1-2 won 27 of 36 titles, seeds 4-7 won 9. That is about the real league's shape.
- **Team luck is realistic.** Across 11 seeds, the same opening roster's wins vary by SD 5.5 per team, about what injuries plus 82 games should produce.
- **The box score looks like a real one** (`./shots/22-Box.png`, opener NYK 118-116 PHI).
  - Brunson 20/6/12 on 9-14. Towns in foul trouble with 5 fouls in 19 minutes. Jaylen Brown 30 on 12-29.
  - Did-not-play reasons are listed. Quarter splits and the team comparison are plausible.
  - The debrief separates shot luck (57.8% expected eFG vs 52.2% actual) from the plan.
- **No engine exploit** (paired lab `./exploit.txt`, 3 user teams × 4 opponents × 60 games, net per 100):
  - Hack-a-player below 85% from Q1: −27.3. Below 75%: −14.9.
  - Starters at 42 minutes: −1.9.
  - Garbage time off: +1.2. Fatigue subs off: +0.35 (noise).
  - Heavy minutes cost injury risk: wear across games (`src/core/league/games.ts:31-36`) and fatigue within a game (`src/core/sim/engine/rotation.ts:286`).
- **The engine is fast.** A quick-sim takes 2.2 s, and opening night to the trade deadline (52 games, with stops) took about 14 s in the UI.

## 3. Findings (most severe first)

### 1. Perimeter defense is upside down for the league's best-known defenders (P1)

**What the player sees** on the Ratings tab (`./shots/40-ratings-*.png`):

| Player     | Perimeter defense | Defensive IQ |
| ---------- | ----------------- | ------------ |
| Maxey      | **86, "elite"**   | 79           |
| Trae Young | 78                | 66           |
| Dort       | 75                | 72           |

- Maxey's card headlines "Best at: **On-ball defense 99th**" and calls him a "Point-of-Attack Stopper" (`./shots/02-player-Maxey.png`). Dort's card says 79th.
- By raw rating, the league's top perimeter defenders are VanVleet, Maxey, Gillespie, Moody, Mitchell and Edgecombe; Haliburton, Edwards and Kyrie are at 70. Dort is 60 (display 75), Herb Jones 63, Daniels 61, Caruso 61, Jrue 60 (`./names2.txt`).
- Draymond is 72 "Rotation" with a **$2.4M market value**, on the same card as "DPOY, 9× All-Defense" (`./shots/02-player-Draymond.png`).

**In the sim:** across 180 All-Defense first-team slots in 36 seasons, Dort, Herb Jones, Caruso, Draymond, Holiday, Anunoby and Bridges got **0**.

- Wembanyama, Holmgren, Barnes and Kessler took 69 of those slots. Dylan Cardwell won DPOY twice.
- In the opening seasons, the rookie Aday Mara made the first team in 3 of 11 seeds.

**Cause:**

- `scripts/data/derive.ts:292`: perimeter defense is 5·z(matchup points saved) + 4·z(defensive RAPM) + 4·z(steal%).
- Points saved is not adjusted for who a defender guards. Dort and Herb Jones take the best scorer every night and look worse than a guard who hides.
- The reputation check explicitly exempts them: "not backed: Draymond Green 72 (−1.7), Luguentz Dort 74 (0.2)".

**Why it matters:**

- This is the screenshot an NBA fan posts.
- It is also a gameplay error. Perimeter defense drives switching and isolation defense in the engine, so the staff will put Maxey on the opponent's star, and the "why" layer will explain it with a wrong number.

**Fix (M):**

- Weight matchup points saved by assignment difficulty (`ptsExpected` is already in the data).
- Anchor known stoppers: All-Defense players of the last 3 seasons get perimeter defense 80+ on display; nobody with negative defensive RAPM in the top 10.
- Floor All-Defense veterans at 78 OVR ("Starter").

### 2. Stars produce about 75-85% of a real star season, so the league has half the big stat lines (P1)

**One season** (my six leagues, 58+ games; real is the seed's 2025-26 regular season):

|         | Sim     | Real |
| ------- | ------- | ---- |
| 25+ PPG | **6.7** | 13   |
| 30+ PPG | 0.8     | 2    |
| 10+ RPG | 7.5     | 8    |
| 8+ APG  | 5.2     | 3    |

- **Scoring leaders** across 68 seasons: median 29.7, and only 4 of 32 star-check seasons at 33+. The real leader has been 32.7-34.7 in each of the last four seasons.
- **Real stars** (real-check, 11 seeds): Dončić 25.6-32.0 (real 33.5). SGA 27.3-31.5 (31.1). Maxey 22.3-30.5 (27.7). Brown 23.5-27.6 (28.4). Meanwhile Tatum scores 25.7-30.8 off a 22-game, post-Achilles 22.2.
- **Minutes:** star-check's top-two players per team average **32.2 / 30.2**, unchanged since round 3. The MPG leader is 35.5-36.7; Maxey played 38.3.

**Cause:** the new usage ceiling (`src/core/sim/engine/constants.ts` `useCeil {level 0.38, damp 25}`) stops runaway seasons, but the binding problem is minutes: the rotation AI gives stars 31-34.

**Why it matters:** scoring titles, award races and "my star had a monster year" are the stories fans tell. BBGM routinely produces 30+ PPG leaders, and 2K's sim leaders sit at 30-35.

**Fix (M):** add a 34-36 minute floor for healthy top-two players when the game is within 15. Add star-check guards on the number of 25-PPG scorers (9-15) and the leader's median (31-34).

### 3. The trailing team does not foul down 3 when the leader has the ball late (P1 for close-game credibility)

**What happens:** in an engine run of 1,500 games, the leader got the ball (a rebound or steal) up 1-3 with 6-24 seconds left 56 times. In **54% of those the trailing team never fouled**, and the leader ran out the clock (`./endgame.ts`).

- Example (`./endgame-samples.txt`): DEN trails DET 131-128 with 25 s left. Jokić misses, DET rebounds, nobody fouls. Duren misses at 0:07, DET gets the offensive rebound, and the game ends.

**Cause:** `src/core/sim/engine/fouls.ts:19-31` fouls down 1-2 (under 24 s) and down 4-9, but down 3 deliberately "they defend". That only makes sense when the trailing team has the ball. When the leader holds it and the game clock is under the shot clock, real teams foul.

**Timeouts:** close games average **0.18 timeouts** in the last 2:00. The AI only calls timeouts to stop runs (`src/core/sim/engine/coach.ts:205-220`); there are no late advance-the-ball timeouts.

**OT:** 2.9% (1,500-game lab), 2.9% (star-check) and 3.5% (real-check, 11 seeds), against the repo's own target of 4.7%. The missing late fouls and timeouts are a likely reason.

**Why it matters:** the last minute is what a fan watches live, and what the debrief's "turning point" narrates.

**Fix (S-M):** foul down 3 when the leader has the ball and the game clock is under the shot clock. Give the AI an advance-the-ball timeout in the last 24 s when within 3. Then re-measure OT.

### 4. The opening-season Thunder still reach 70 wins in about one seed in five (P2, partly fixed)

**OKC opening-season wins, n=22 seeds:**

- 52, 57, 57, 57, 58, 62, 63, 64, 64, 65, 66, 66, 66, 66, 67, 67, 67, 69, **70, 71, 72, 73**.
- Median 66. **4 of 22 at 70+.** OKC had the best record in about 18 of 22.

**Later seasons:** 1 of 32 in star-check and 1 of 36 in mine had a 70-win team, and mine was **PHI 77-5** (rng 203, 2032), past the real record of 73-9.

**Opening-season titles:** OKC won 6 of the 11 seeds that played playoffs.

**Why it matters:** a 66-win OKC is credible; 70 wins in one season of five is not, since the NBA has done it three times. The 77-5 passed CI's allowance (one season past 73 per 20).

**Fix (M):** look at OKC's depth (10 players at 74+) and the minutes it earns there. Make 73 wins a hard cap in star-check. Track opening-season OKC wins over 10+ seeds.

### 5. The league drifts small over five summers (P2, newly measured)

**My 6 leagues × 6 seasons** (n=6 a year):

| Year | 3PA share | Rim share | 10+ RPG players | 25+ PPG players | 8+ APG players |
| ---- | --------- | --------- | --------------- | --------------- | -------------- |
| 0    | .425      | .339      | 7.5             | 6.7             | 5.2            |
| 1    | .433      |           | 5.3             |                 |                |
| 2    | .443      |           | 3.7             |                 |                |
| 3    | .450      |           | 3.2             |                 |                |
| 4    | .450      |           | 1.3             | 5.0             | 2.5            |
| 5    | .447      | .326      | 1.8             | 4.5             | 2.2            |

- **AI rotations:** 25 cases of an 82-86 OVR big playing 19-22 MPG for a full season. Hartenstein appears 7 times, plus Edey, Steinbach, Lively, Clingan and Salaün.
- **Why it matters:** five seasons in, the league has one or two 10-rebound players, and nothing in CI watches later seasons.
- **Fix (M):** add year-5 guards: 3PA share within ±2 points of the seed's, 10+ RPG players ≥ 5, 25+ PPG players ≥ 8. Then check how the AI rotation and progression treat bigs.

### 6. Archetype labels misdescribe stars (P2)

- On cards (`./arch.txt`): Franz Wagner (a SF) and Banchero are "Traditional Big". Bam (a C) and Jalen Johnson are "Utility Wing".
- Wembanyama is "Post Scorer", Sabonis "Rim Runner", Towns "Glass Cleaner", Booker "Floor General", Bane "Spot-Up Shooter".
- Dort is a "Combo Guard" with a "Movement Shooter" role.
- **Why it matters:** the label sits under every name, and fans read it as the game's understanding of the player.
- **Fix (S):** derive the label from position and real play-type shares, not ratings alone, and check the top 60 by eye.

### 7. Players who missed 2025-26 rate and play like healthy stars (P2, still open)

- Haliburton is 92 "All-NBA" on 0 real games, then leads the league in threes in 8 of 36 seasons.
- Kyrie is 87 on 0 games and plays 34-35 MPG.
- Lillard is 84 at 36 on 0 games and **leads the league in minutes** in 2 of 11 seeds.
- **Fix (S):** cap a player with no games last season at his last real OVR minus an injury discount, with a minutes limit for his first 20 games.

### 8. Efficient bigs top the efficiency boards (P2, partly)

- At the deadline, Duren has **73.7 TS%**, #2 in PER and #3 in win shares; Edey 70.0 (`./shots/31-stats.png`).
- Rim FG% r is 0.36-0.54 and TS% r is 0.56-0.73 across 11 seeds. The median is 0.67: the "TS r 0.56" the team quotes is rng 7's worst case.
- **Fix (M):** shrink low-usage bigs' rim make probability toward their real rim FG%.

### 9. Foul-outs about 1.5× high (P2, still open)

- 200 a season in star-check, against a target of ≤130 (flagged WATCH there).
- **Fix (S):** sit a player with 5 fouls until the last 6 minutes unless he's the go-to player.

### 10. Generated players carry real players' surnames (P3, still open)

- From star-check: "Franz Hartenstein" (94 OVR), "Kevin Bryant" (95), "Dyson Giddey".
- `src/core/names.ts:512` and `:518` put real surnames (Giddey, Thybulle, Exum, Hartenstein, Schröder and others) in the generated-name pools.
- **Fix (S):** filter generated names against the real-player registry.

### 11. Generated draft classes are NBA-ready (P3, still open)

- The 2027 class has 21 prospects at 70+, the top ones 76-77 at 18-21 (`./draft.ts`).
- **Fix (S):** lower generated prospects' current OVR by about 4 and keep their potential.

### 12. Assists run a little low and Draymond's playmaking disappears (P3)

- League assists are −1% to −9% in 10 of 11 seeds.
- Draymond: 2.5 APG vs a real 5.6 rate at sim minutes.
- Trae Young leads in assists in 21 of 36 seasons.
- **Fix (S):** refit passing usage for hub forwards.

### 13. Smaller items (P3)

- Win SD 11.1-12.8 and net-rating SD 4.6-5.7 (NBA ~13 and 5.4-6.1): a slightly compressed middle.
- Score correlation 0.29-0.37 (NBA 0.22).
- Kawhi at 35 is MVP in 4 of 11 opening seasons, the most frequent winner.

## 4. Since round 3

| Round-3 finding                       | Status           | How verified                                                                                                                                                                                                 |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. OKC dynasty, 70-win teams, streaks | **Partly fixed** | Streaks max 25 (was 36/41). OKC titles 17 of 68 seasons. 70-win seasons 3 of 68. But opening OKC is 70+ in 4 of 22 seeds, and one 77-5 (PHI)                                                                 |
| 2. Defensive veterans under-rated     | **Partly**       | Gobert 80, market $10.8M. Draymond 72, Dort 74, Caruso 76, Herb Jones 78 unchanged. Perimeter defense still ranks Maxey 86 > Dort 75, and the anchor exempts Draymond and Dort. Paul Reed down to 76 (fixed) |
| 3. Tier labels vs anchors             | **Fixed**        | All-Star at 86; Curry 87 "All-Star"                                                                                                                                                                          |
| 4. Threes leaders past the record     | **Fixed**        | Mean 4.79, 81% ≤5.2, 10.1 ten-three nights. Role shooters still lead sometimes (Gillespie 4 of 36), but under 5.3                                                                                            |
| 5. Stars below real lines             | **Still open**   | Top-two MPG 32.2/30.2, unchanged. 25+ PPG scorers 6.7 vs 13. The usage ceiling capped the upside                                                                                                             |
| 6. Forecast compressed                | Other lens       | Not re-measured here                                                                                                                                                                                         |
| 7. OT under target                    | **Still open**   | 2.9-3.5% vs 4.7%. The late-game foul and timeout gaps are a likely cause (finding 3)                                                                                                                         |
| 8. Foul-outs high                     | **Still open**   | 200 a season                                                                                                                                                                                                 |
| 9. Efficient bigs                     | **Still open**   | Duren 73.7 TS% at the deadline                                                                                                                                                                               |
| 10. Haliburton off a missed season    | **Still open**   | 92; Kyrie and Lillard have the same issue                                                                                                                                                                    |
| 11. CI guards loosened                | **Fixed**        | Streak, 70-win, title-share, threes and 10-three-night guards in `scripts/star-check.ts`, passing                                                                                                            |
| 13. Draft names and readiness         | **Still open**   | Real surnames in pools; 21 prospects at 70+                                                                                                                                                                  |
| 14. Odd starter minutes               | Not seen         | Opener minutes plausible                                                                                                                                                                                     |

**New since round 3:**

- The seeded record book (great).
- The usage ceiling: it removed 35-PPG seasons but makes the star compression worse.
- The OVR big floor (Gobert 80).
- The card's "Best at" now headlines the perimeter-defense inversion.
- The endgame foul gap, newly measured.
- The multi-season drift, newly measured.

## 5. What it would take to reach 9/10

1. **Reputation-true defense** (finding 1). Adjust for assignment difficulty and anchor known stoppers. This is the highest-traffic trust fix: every card and every matchup the staff picks.
2. **Stars play star minutes** (finding 2). Minute floors plus guards on 25-PPG scorers. It brings back scoring races, 30-point seasons and MVP stories.
3. **A correct endgame** (finding 3). Foul down 3, add late timeouts, then re-measure OT, so the live crunch time plays like the NBA's.
4. **Guard the shape of later seasons** (findings 4-5). A hard 73-win cap, year-5 guards, and opening OKC at 70+ in under 1 seed in 10. The league stays the NBA in year five.
5. **Card polish** (findings 6, 7, 10). Labels from play types, injury discounts, a name filter. Cheap, and it removes the remaining screenshot jokes.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright, 390×844, own profile, deleted afterwards):

- New real league as the Knicks; preseason cuts through the staff's picks.
- Opener quick-sim with its report and Box/Shots/Flow tabs (`./shots/20-22*`).
- Simmed to the deadline through calls and away sheets (`./shots/30-32*`): League stats and standings.
- Cards and Ratings tabs for Dort, Maxey, Draymond, Gobert, Wembanyama and Trae Young (`./shots/02-*`, `./shots/40-*`).
- I read the store only for pids and phase.

**Repo scripts:** `star-check` (default 4 × 8, PASS) and `real-check` × 11 seeds.

**My scripts:**

- `./ratings.ts`, `./names2.ts`, `./arch.ts`: seed cards.
- `./shape.ts` × 7 leagues (6 × 6 seasons plus 1, full offseasons), aggregated by `./agg.py`.
- `./endgame.ts`: 1,500 engine games with play-by-play.
- `./exploit.mts`: paired lab.
- `./draft.ts`, `./realcounts.ts`: draft class and real baselines.

**Not verified:**

- The live game in the browser. The endgame was measured in the engine, not watched.
- Playoff upset rates beyond champion seeds.
- Difficulty presets.
- Real foul-out, triple-double and 50-point-game counts (no source in the seed).
- Whether the seed's 2026 offseason moves are real (past my knowledge).
- The BBGM and 2K comparisons are from familiarity, not side-by-side runs.
