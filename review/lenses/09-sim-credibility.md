# Sim credibility review: does it feel like real NBA basketball?

Lens: `sim-credibility`. Reviewer folder: `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/sim-credibility/` (screenshots in `shots/`, probe scripts `measure.ts`, `lab.ts`, `pbp.ts`, `ovr.ts`, logs `*.log`). REPORT.md was not written: the tool blocked report files, so the full report is below. Nothing in the repo was created or changed (git status clean).

## 1. Verdict

At the league level this is one of the most credible basketball sims I have seen. League averages land within 1-5% of the 2025-26 NBA on every box-score line. Sim and real per-game stats correlate at 0.92-0.94 for points, assists and rebounds. I could not find a tactic or rotation trick that turns an average roster into a juggernaut.

A Reddit regular would still find plenty to screenshot by the end of the first season:

- Curry, at 38, makes **5.3-6.0 threes a game** in every league I ran. The record is 5.09.
- Anthony Edwards averages **35-37 PPG** in about a third of later seasons.
- Alex Caruso averages **3+ steals** in 21 minutes.
- Rating cards show **Walker Kessler with a 99 mid-range** and **Rudy Gobert at 84**. **Curry's three-point rating is 80**, below Edwards (92) and Kyrie (94).
- The league has **3-8 Achilles ruptures every season**, often to aging stars.
- The 65-win Thunder never won the title in six simulated postseasons.

The averages are right; the extremes, which are what fans screenshot, are not. **Score: 6.5/10.** The core engine deserves an 8. Odd visible ratings, record-breaking outliers every season, too many catastrophic injuries and thin end-of-game basketball pull it down.

## 2. What's genuinely great (protect these)

- **League shape is calibrated to the decimal** (`real-check.ts`, rng 7). Each figure below is sim, then NBA in brackets:
  - Pace 101.3 (99.6), points 116.1 (114.4), FGA 88.6 (88.8).
  - 3PA 37.6 (37.5), 3P% .366 (.359), FTA 21.4 (21.8).
  - Assists 27.2 (26.6), turnovers 13.6 (13.9).
  - Share of games decided by 20+: 21.0% (21%). Win SD 13.7 (about 13).
  - Assisted share of makes by zone: 61/44/38/83 (about 65/45/40/85).
- **Players mostly look like themselves.** Over 229 regulars, sim vs real correlation:
  - PPG 0.941, APG 0.921, RPG 0.931, BPG 0.931, 3PM 0.907.
  - Shot diet: rim share 0.927, 3PA share 0.927.
  - Jokić (12.9 RPG in both), Wembanyama (DPOY in every league), Luka (MVP), Cade (assists leader), Brunson and Gobert all read right.
- **Team strength follows player value.** Team net rating vs the players' real BPM at sim minutes: r 0.90. Against projected EPM: r 0.88.
- **No exploit found.** These are paired-seed lab runs (`lab.ts`), changes in net points per 100 possessions:
  - Pace & Space plus Full-Court Chaos: −3.1 to +1.3.
  - Mentality ±2: within ±0.8.
  - Star on green light plus creator plus go-to: ±0.2.
  - Everyone on green light: at most +0.6.
  - Starters at 44 minutes with a 7-man rotation: −0.7 to +0.9.
  - Physicality 100 plus pressure 100: −0.3 to −2.7.
  - Hack-a-player from Q1: −3.8 to −7.4, correctly punished.
- **The CI realism guards are real.** `star-check.ts` (4 leagues × 8 seasons) checks:
  - The scoring leader stays at or under 39 PPG.
  - No single game passes 73 points.
  - Records over 73 wins are rare.
  - It also tracks aging; stars fade believably from about 33 (SGA 97 → 86 by 35, Giannis 92 → 71 by 39).
- **The post-game "Why" card is honest about luck.** It shows the eFG% a team's shots were worth next to what fell ("MEM 64.8% eFG on looks worth 60.4%") (`shots/03-report-Why.png`).
- **Home court is right.** Regular-season home teams win 53.7-55.2%, playoffs 54-61%.

### Measured vs real NBA

Sources: rc = `real-check.ts` at rng 7; m = my `measure.ts` (full seasons at rng 11, 21, 22, 23, 24); sc = `star-check.ts` (32 seasons).

| Metric                           | Sim                                            | Real NBA                                          | Read          |
| -------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------- |
| Pace, league                     | 101.3 (rc)                                     | 99.6                                              | ok            |
| Pace, fastest team               | 110-112 (m; OKC with Chaos press)              | about 104 at most in the modern era               | **off**       |
| Points per team-game             | 116.1                                          | 114.4                                             | ok            |
| Best team PPG                    | 125.8-130.2                                    | about 120-123                                     | **off**       |
| FG% / 3P% / FT%                  | .483 / .366 / .779                             | .471 / .359 / .784                                | ok            |
| 3PA / FTA / ORB / TOV            | 37.6 / 21.4 / 10.4 / 13.6                      | 37.5 / 21.8 / 10.8 / 13.9                         | ok            |
| Team 3PA range                   | 26.9-52.2                                      | about 31-48                                       | high          |
| Margin SD                        | 17.0                                           | 15.6-16.4                                         | slightly wide |
| Games decided by 20+             | 21.0%                                          | 19-23%                                            | ok            |
| Largest margin each season       | 63, 70, 77, 71, 63                             | record is 73                                      | **off**       |
| Highest team score each season   | 157-165                                        | about 150-157, rare                               | **off**       |
| OT rate                          | 2.7-3.8%                                       | 4.7% (the repo's own TARGETS)                     | **low**       |
| Games decided by ≤3              | 15.3-18.5%                                     | about 18-20%                                      | slightly low  |
| Home win %                       | 53.7-55.2%                                     | about 54-55%                                      | ok            |
| Wins per point of margin         | 2.02                                           | 2.2-2.4                                           | low           |
| Team net-rating SD               | 6.54                                           | 5.4-6.1                                           | wide          |
| Best record, median / max        | 65 / 74 (OKC 74-8 at rng 7)                    | median about 64; record 73                        | high          |
| Longest win streak, median / max | 19 / 31                                        | about 13-16; record 33                            | **off**       |
| 50-point games per season        | 10-27                                          | about 10-15                                       | high          |
| 10+ made threes per season       | 19-39, including two 14-make games             | about 15 at most                                  | **off**       |
| Triple-doubles per season        | 55-77                                          | 100+ in recent seasons                            | **low**       |
| Foul-outs per game               | 0.24-0.27                                      | well under half that (my estimate)                | **high**      |
| Timeouts per game, both teams    | 3.1; 0.15 in the last 2:00 of Q4               | about 10-12                                       | **low**       |
| Threes-made leader               | Curry 5.3-6.0 per game at 38                   | record 5.09                                       | **off**       |
| Steals leader                    | Caruso 2.8-3.4 in 21 minutes                   | about 2.0-2.2                                     | **off**       |
| Rebounds leader                  | 10.6-12.9                                      | about 12.5-14                                     | slightly low  |
| TS% leaders (1000+ min)          | bigs at 72-75%                                 | about 68-72%                                      | high          |
| TS% spread (SD)                  | 0.053                                          | 0.044                                             | wide          |
| Injuries per team-season         | 37-39 total; 5.6-6.5 of 10+ games              | design target 4-6                                 | ok            |
| New 60+ game injuries per season | 5-13, including 3-8 Achilles                   | ACL plus Achilles about 4-8; Achilles usually 1-3 | **high**      |
| Series won by lower seed         | 4-7 of 15; 8 over 1 twice; one 8-seed champion | about 3-4 of 15                                   | high          |

## 3. Findings (most severe first)

### 1. Visible ratings contradict reputations fans know (P1)

**What the player sees:**

- On League › Ratings (`shots/13-ratings.png`), Curry's Three-point is 80, below Edwards 92, Kyrie 94, Durant 92 and Kennard 92.
- Kessler's Mid-range is 99, shown as the "99th" percentile on a "Rim Protector" card (`shots/16-player-kessler-Ratings.png`). Gobert's is 84.
- Kyrie's Perimeter defense is 83, above Caruso 79 and SGA 71.
- OVR has the same problem. Ty Jerome is 88, level with Franz Wagner and Towns. Gillespie, Isaiah Joe and Pritchard are 85.
- Mobley 79, Şengün 79 and Banchero 78 all sit below them.

**Evidence:** the raw ratings are Curry 3P 68.1, Kessler mid 100 and Kyrie perimeter defense 72.6, shown as `40 + 0.59v` (`src/core/ratings.ts:47`). The derivation in `scripts/data/derive.ts` causes it:

- `:270` adds paint FG% into mid-range, which lifts bigs.
- `:271` builds three-point from 3P% and volume, which caps Curry's edge.
- `:280` builds perimeter defense from mdSaved and rapmD.

**Fix (M):**

- Pull mid-range toward a positional prior when a player has fewer than about 50 mid-range attempts, and drop the paint term.
- Weight three-point by makes per 36.
- Add a reputation check to `real-check.ts` (for example Curry 3P ≥ 95, Gobert MID ≤ 55).

### 2. Curry at 38 breaks the threes record every season (P1)

**What the player sees:** 5.3-6.0 made threes on 13.2-13.8 attempts in every league. My UI season had 6.0 made, 45.2% and 29.5 PPG (`shots/12-stats.png`, `shots/16-player-curry-Stats.png`). His real line is 4.4 made on 11.3 attempts at 38.9%.

**Evidence:** 19-39 games a season of 10+ made threes, including 14-make games (Mitchell 14/25, Curry 14/26) and Keyonte George going 13/14.

**Fix (S-M):**

- Add star-check guards: threes leader ≤ 5.2 per game, 10+ make games ≤ 15 a season.
- Damp three-point volume for high-usage shooters, the way `K.useLevel` damps overall usage.

### 3. Edwards becomes a perennial 35-37 PPG scorer, and 78-84 OVR players lead in scoring (P1)

**What the player sees:**

- In star-check, 11 of 32 seasons have a 35+ PPG scorer, nearly all Edwards (35.7 to 37.3).
- In real history, 35+ has happened about a dozen times.
- Saddiq Bey (83 OVR) averages 29-31.5, Parker Russell (78) 29.2 and MPJ (80) 29.8. LaVine, at 35 and 79 OVR, averages 27.7. Alex Sarr posts a 41% usage season.

**Evidence:** CI passes because `MAX_PPG = 39` in `scripts/star-check.ts`.

**Fix (M):**

- Tighten the guards: at most one 35+ season per league, and fail when a scoring leader is under 82 OVR.
- Damp usage concentration on bad teams.

### 4. Too many season-ending injuries, and they decide the title (P1)

**What the player sees:**

- Each season adds 5-13 new injuries of 60+ games, including 3-8 Achilles ruptures.
- One league (rng 21) lost Kawhi (141 games), Harden (138), Kyrie, Draymond, Chet, Randle and Markkanen in a single season.
- In my UI season SGA was hurt during the playoffs: 13 minutes in game 1, then out of the box score for 5 games against SAS and for Finals games 1-3.
- The 65-17 Thunder lost the Finals 1-4 to Miami. In my lab OKC wins 84% of playoff games against that same Miami roster.
- Over 6 postseasons the best-record team never won the title. Champions were HOU(3), DEN(8), SAS(2), TOR(3), ORL(4) and MIA(3).

**Evidence:**

- In `src/core/league/injuries.ts:45-46`, a torn ACL costs 70-110 games and a ruptured Achilles 80-125.
- Severe injuries are ×1.6 likelier from age 30, and lengths ×1.15 from 32 (`:50`, `:55`).
- `K.injuryRate` is 0.00042 (`constants.ts:59`).

**Fix (S):**

- Cut severe-injury weights by about 40-50%, and cap Achilles at about 95 games.
- Add a star-check line: ACL plus Achilles ≤ 6 a season.

### 5. Blowouts and scorelines past the NBA record every season (P2)

**What the player sees:**

- Season-high margins of 63-77, past the all-time record of 73. Examples: "SAC 88 @ OKC 165", "OKC 161 @ NOP 94", "SAS 137 @ MIL 66".
- 19-32 games a season decided by 40+.
- Real-check shows 2.02 wins per point of margin (NBA 2.2-2.4) and team net SD 6.54 (NBA 5.4-6.1).

**Fix (M):**

- Make garbage time pull both benches toward each other.
- Have leaders slow down and stop pressing once up 25+.
- Add guards: max margin ≤ 65, max team score ≤ 160.

### 6. The AI Thunder play at 111 pace and score 130 a game with an all-game press (P2)

**What the player sees:**

- OKC's coach AI picks Pace & Space with Full-Court Chaos (`src/core/sim/tactics.ts:141`), which plays the press every possession.
- The result is pace 111.3 and 130.1 PPG (opponents 111.8).
- OKC also posts 28-31 game win streaks and 74-8 at rng 7, which is CI's default seed.
- In the lab, switching OKC to balanced costs only 2.85 points per 100. The pace is a style artifact on top of a truly great roster.

**Fix (S):** Make the always-on press situational only for the AI, and clamp the pace a press adds to about 104-105.

### 7. End-of-game basketball is too thin (P2)

**What the player sees:**

- 3.1 timeouts per game for both teams combined, and only 0.15 in the last two minutes of the fourth (`pbp.ts`, 400 games).
- One example from those runs, NYK trailing BOS 126-129 with 21 seconds left:
  - BOS got an offensive rebound and NYK didn't foul.
  - BOS then shot a three with 12 seconds left instead of running clock.
  - Down 5 with 9.7 seconds left, NYK called no timeout and took a three at 0.2.
- 23 of 63 games that were within 3-6 points in the last 35 seconds had no foul at all in that window.

**Evidence:** the OT rate of 2.7-3.8% misses the repo's own `TARGETS.otRate` of 0.047. Timeouts only fire on opponent runs (`coach.ts:182-194`).

**Fix (M):**

- Foul whenever trailing with under about 24 seconds on defense.
- Call timeouts to advance the ball late.
- Hold for the shot clock when up 3.

### 8. Embiid, Giannis, Lillard and Morant don't look like themselves (P2)

**What the player sees:**

- Embiid averages 17.3-19.4 PPG (real 26.9) on 1.3-2.2 three-point attempts (real 4.2), at 84 OVR.
- Giannis averages 22.6-25.1 (real 27.6).
- Lillard sits about 7 points under his real scoring rate, Morant about 5.
- Kessler averages 16.2 PPG with 19.9% usage and a 27.8 PER, and finishes third in the league in Win Shares.

**Fix (M):** Anchor stars' share of shots to their real usage, and let the EPM-driven OVR set efficiency, not shot share.

### 9. Steals leaders sit far above anything in decades (P2)

**What the player sees:** Caruso 2.8-3.4 SPG (real 1.3), Thybulle up to 3.3, SGA 2.4-2.9 (real 1.4). Steals is real-check's weakest correlation at 0.817.

**Fix (S):** Compress the steal rate at the top of the scale, and add "steals leader ≤ 2.6" to real-check.

### 10. Default rotations are flat, so stars play 27-29 minutes (P2)

**What the player sees:**

- OKC: SGA 29.0 MPG (real 33.2), with 11 players at 19.6+ MPG.
- My staff-managed Grizzlies: best player 26.7 MPG, with 11 players between 21 and 27.

**Evidence:** `autoRotation` (`src/core/ai/coachAI.ts:316-361`) and the youth lean for the owner's young-players goal (`src/core/league/games.ts:284`). The flat minutes also explain the low star totals and the shortage of triple-doubles.

**Fix (S):**

- Floor the top two players at 32-34 minutes when healthy.
- Apply the youth lean to bench minutes instead.

### 11. Starters at 44 minutes cost nothing (P2)

**What the player sees:**

- The Rotation slider allows 44 minutes (`src/ui/screens/Rotation.tsx:23`); in the engine those starters ended up around 39-40.
- Their true shooting stayed within noise, and net rating moved only −0.7 to +0.9.
- It isn't an exploit, but heavy minutes should hurt.

**Fix (S):** Add a fourth-quarter efficiency fade past about 38 minutes, plus extra injury risk, and show both on the Rotation screen.

### 12. Tactical extremes are almost inert (P2; also the tactics lens)

**What the player sees:**

- 100% isolations for MEM or CHI changes net rating by only +0.3 to +0.6.
- Green lights for everyone gives at most +0.6.

**Fix (M):** Make unfit extremes cost several points per 100, scaled by how well the roster fits the role.

### 13. AI trades a fan would call fleeces (P2; also the front-office lens)

**What the player sees, from one season (`probe7.mjs`):**

- HOU sends Şengün, Capela and a 1st for Michael Porter Jr.
- POR sends Sharpe and Clingan for De'Andre Hunter.
- GSW sends Moody, Santos, a 1st and two 2nds for A.J. Green.
- DET sends Duren for LaVine, who is 31.

**Evidence:** these follow from the OVR problems in finding 1. The season test also shows median payroll at 1.21-1.23× the cap, with 13-16 teams paying tax.

**Fix (M):** Value young players on trajectory as well as OVR.

### 14. Foul-outs are two to three times too common (P2)

294-336 a season (0.24-0.27 a game), even though league fouls are 5% under target. Fouls are too concentrated on single players.

**Fix (S):** Sit "standard foul trouble" players at 5 fouls until late, and cap one defender's share of team fouls.

### 15. Playoffs are too random at the series level (P2)

- Lower seeds won 5-7 of 15 series.
- 8 seeds beat 1 seeds twice, and an 8 seed won the title once.
- A 31-51 Dallas team reached the playoffs through the play-in.
- The lab shows no per-game playoff bias, so this comes from injuries plus series game plans.

**Fix:** Re-measure after the injury fix, then add a guard.

### 16. Efficient bigs are over-rewarded (P3)

- True-shooting leaders are all bigs at 70-75%.
- TS% spread is 0.053 vs 0.044 real, and the TS correlation is only 0.669.
- In the UI season Kessler was 2nd in TS, 3rd in Win Shares and 4th in PER.

### 17. Too few triple-doubles and 20-rebound nights (P3)

55-77 triple-doubles a season (real 100+). Jokić averages 8.6-9.5 assists (real 10.7). Mostly fixed by finding 10.

### 18. "Playoff odds 100%" for a team that missed the playoffs (P3)

**What the player sees:** the mid-season digest showed 100% at 29-22. The team finished 40-42 and lost in the play-in.

**Evidence:**

- The forecast's playoff figure includes the play-in (`src/core/analysis/odds.ts:45`).
- `calls.ts:104` rounds to "100%", while `pct()` elsewhere shows ">99%".

**Fix (S):** Use `pct()` everywhere, and label it "Postseason odds".

### 19. Hard difficulty is a hidden rubber band (P3)

On Hard, opponents get up to 5 points a game against strong user teams (`src/core/league/difficulty.ts`, `courtGrowth`). The post-game "Why" card then calls the result luck.

**Fix (S):** Show the difficulty's points on the "Why" card.

### 20. The All-Star Game plays like a regular game (P3)

The score was 148-129, and the MVP came from the losing team.

**Fix (S):** Make exhibitions more open, and pick the MVP from the winners.

### 21. Uniform garbage time (P3)

In a blowout, five reserves per team each played exactly 5 minutes, and MEM's bench scored 86 (`shots/03-report-Box.png`).

**Fix (S):** Randomize when garbage time starts and how many reserves go in.

### 22. Repo scripts drift (P3)

- `league-invariants.ts` reports "2x roster above offseason limit: BKN 23 [2028 resign d250]".
- `season-test.ts` opens with "Your roster has 17 players" and has to make its own cuts.

## 4. Top 5 moves

1. **Fix the derived-rating priors and add a reputation check** (finding 1, M). This raises trust on the most-viewed screens and fixes trades and star identity downstream.
2. **Tighten the outlier guards and tune to them** (findings 2, 3, 5, 9). Targets: threes leader ≤ 5.2, steals leader ≤ 2.6, one 35+ PPG season per league at most, max margin ≤ 65. This removes the season-one screenshots.
3. **Cut catastrophic injuries and cap their length** (finding 4, S). Fewer collapsed seasons, and titles that feel earned.
4. **Rebuild late-game AI** (finding 7, M): fouling when trailing, timeouts to advance the ball, holding for the shot clock. Close games would read as NBA, and the OT rate would hit target.
5. **Rotation floors for stars, plus a fatigue cost for minute loading** (findings 10 and 11, S). Star lines and triple-doubles come back, and the 44-minute slider becomes a real trade-off.

## 5. What I couldn't verify, and how I tested

**Scripts run:** the four repo scripts (logs in my folder), plus my own:

- `measure.ts` and `measure2.ts`: five full seasons.
- `lab.ts`: exploit hunting with `runLab`.
- `pbp.ts`: 400 games of play-by-play.
- `ovr.ts`: opening ratings.

**UI play** (Playwright, phone viewport, own profile, Grizzlies):

- Preseason cuts and the opener's full report.
- Simmed through the deadline digest, the regular season, the play-in and the playoffs.
- Visited standings, stats, ratings, playoffs, awards, and player pages for Curry, Kessler, Gobert and Jokić.

**Not verified:**

- Live-game play-by-play, beyond the headless engine runs.
- How realistic generated draft classes are, beyond star-check's OVR paths.
- A multi-season UI career, and Easy or Hard on the court.
- Real-NBA figures marked "about" or "estimate" are from memory; the rest come from the repo's TARGETS.
- 2026 roster moves in the seed that are past my knowledge (Giannis to MIA, Jaylen Brown to PHI, Kawhi to TOR, Trae to WAS).
