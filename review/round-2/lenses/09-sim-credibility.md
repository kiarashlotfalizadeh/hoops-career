I played one full season in the UI as Memphis (opener through the Finals and the 2027 draft lottery) and ran the repo scripts plus my own batch scripts.

# Sim credibility review, round 2 (`sim-credibility`)

## 1. Verdict

The league plays like the NBA. Every per-game rate is within 5% of 2025-26. Margins, injuries, steals and playoff upsets, all flagged last round, now land in realistic ranges. A paired sweep of 37 tactic settings found no exploit.

What a knowledgeable fan sees first, though, are the rating cards, and they still contradict reputations, in places worse than last round:

- Curry's three-point rating is 82, which the app's own legend calls "strong", not elite.
- Daniel Gafford's mid-range is 99, and his scouting card calls it "Mid-range scoring 99th".
- Luke Kennard is an 87 "All-Star" with a $44.9M market value; Evan Mobley is 81.

Over multiple seasons the AI Thunder become a juggernaut. Their payroll climbs to 1.93× the cap, and they win 70+ games in roughly a sixth of all simulated seasons.

**Score: 6.5/10.** The engine itself deserves 8. The ratings layer and the AI's roster economics pull it down, because those are what fans screenshot.

## 2. What's genuinely great (protect these)

- **League shape** (`real-check.ts`, rng 7):
  - Pace 100.8 (NBA 99.6), points 114.6 (114.4), assists 26.4 (26.6), turnovers 14.2 (13.9), steals 8.4 (8.2), blocks 5.2 (5.0).
  - Player correlations over 222 regulars: points 0.93, assists 0.90, rebounds 0.91, blocks 0.93, threes 0.91.
  - Shot diet: rim share 0.93, three-point share 0.93.
- **No user exploit found:**
  - `tactic-sweep.ts` at 200 games × 4 matchups: every single setting lands between −3.2 and +0.7 net per 100. The built-in "EXPLOIT" combo (full pressure, all-game press, blitz, crash the glass) is −2.6.
  - My paired rotation lab (`rotlab.ts`): five starters at 40 or 44 minutes is −1.4 to +0.4 for GSW, SAC and NYK. Memphis gains +3.5, but that comes from playing two-way Javon Small (80), not from the heavy minutes.
- **Catastrophic injuries are fixed:**
  - star-check over 32 seasons: 4.4 injuries of 60+ games a season, 2.0 Achilles, 2.3 ACL.
  - Last round it was 5-13 such injuries a season, including 3-8 Achilles.
- **Blowouts are fixed:** the largest margin each season is 48-65 in my four seasons (star-check mean 49), down from 63-77.
- **Steals leaders are fixed:** star-check mean 2.24, max 2.77, down from 2.8-3.4.
- **Late-game fouling now exists:**
  - 571 intentional fouls across 1,500 recorded games (`endgame.ts`).
  - Teams down 3 in the last 12 seconds shoot threes 86% of the time (66 of 77).
- **Playoffs read right:** lower seeds won 3-6 of 15 series; home teams won 54-63% of playoff games.
- **35+ PPG seasons are rare:** 5 in 32 star-check seasons.
- **Box scores add up.** In the opener (`/game/8`), team +/- sums to 5 × margin, and minutes and lines are plausible (`shots/19-game-Box.png`).

## 3. Findings (most severe first)

**1. Attribute ratings contradict what every fan knows (P1, still open, partly worse)**

What the player sees in League › Stats › Ratings and on player Ratings tabs (`shots/08-curry-ratings.png`, `shots/23-league-ratings.png`):

- **Three-point:** Curry is 82. LaVine (91), McLaughlin (88), Irving (88), Cam Spencer, Garland, Edwards, Donovan Mitchell and Davion Mitchell (all 87) sit above him. The legend reads "85+ elite · 75+ strong".
- **Mid-range:** Kessler, Gafford, Filipowski and Keldon Johnson are 99, Gobert 93 and Mitchell Robinson 83. Gafford's and Kennard's scouting cards say "Mid-range scoring 99th".
- **Finishing:** 99 for Bouyea (66 OVR), Anthony Gill (57 OVR), Keon Ellis and Jaxson Hayes; Curry is 77.
- **Drawing fouls:** Giannis is 72, below Sion James 89, Grant Williams 88 and Javonte Green 88.
- **Offensive IQ:** Jalen Duren is 88, second in the league and above SGA.

Evidence:

- The derivation formulas haven't changed since round 1 (`scripts/data/derive.ts:269-278`). Mid-range adds paint FG% (`4*z('paintPct')`); three-point is FG3% plus attempts per 36.
- Display is `40 + 0.59v` (`src/core/ratings.ts:47`).
- The engine reproduces each player through hidden tendencies, so Curry still leads in threes. The visible number is not what drives him, so the screen explains the wrong thing.

Why it matters: the app's pitch is "tells you why". Here the "why" contradicts both the box score and the fan's knowledge.

Fix (M):

- Shrink mid-range to a positional prior below ~50 attempts and drop the paint term.
- Rank three-point by makes per 36 at the top end.
- Add a reputation regression to `real-check` (e.g. Curry 3P ≥ 95, top-5 3PM men ≥ 90, a center's mid-range ≤ 70 unless he takes 2+ mid-range attempts a game).

**2. OVR tiers crown efficient role players and demote famous stars (P1, still open)**

- **Raised:**
  - Kennard is 87 with an "All-Star" badge (8.4 PPG real) and a $44.9M market value on a $6.1M deal.
  - Isaiah Joe, Ty Jerome and Cam Spencer are 87.
  - Gillespie, McBride, Grayson Allen and Jaylin Williams are 84.
- **Lowered:**
  - LeBron 81, Jaylen Brown 81 (he averages 27-28 PPG in the sim and makes the All-Star team), Embiid 81-82, AD 82, Mobley 81 ($22.8M market).
  - Morant 79, Şengün 78, Gobert 75, Zubac 74.
- **First impression:** the team-picker card sells Memphis on "87 T. Jerome · 87 C. Spencer · 80 J. Small", and Small is a two-way the staff plays 3.4 minutes a game (`shots/01-team-pick.png`).
- **Knock-on effects:**
  - AI rotations follow OVR: Kennard plays 31.9 MPG (real 22.8) and Joe 30.0 (19.7).
  - Role players lead the league in made threes: Grayson Allen hit 341 (seed 3); McBride led at 5.78 a game in star-check 2030.
  - Trade value is OVR, potential and age only (`src/core/league/contracts.ts:54-60`, `:96`), so these numbers flow into every deal.

Fix (M):

- Either blend box production and usage into the _displayed_ OVR (keep impact for the engine), or rename the tier labels (`ratings.ts` OVR_TIERS) away from reputation words like "All-Star" and "Superstar".
- Add a check: any player with ≥ 25 PPG at 34+ MPG shows ≥ 85.

**3. The AI Thunder become a capped-out dynasty (P1, new in this form)**

- **`season-test.ts 8`:**
  - OKC posts the best record in 6 of 8 seasons: 65, 70, **75-7**, 70, 61, 69.
  - They win 4 titles.
  - Their payroll climbs 1.44 → 1.63 → 1.69 → 1.65 → **1.93** → 1.88× the cap. The league median is 1.18-1.24 (`season-test8.txt`).
- **star-check:** OKC goes 73-9, 70-12 and 68-14 (rng 42), and 70, 71, 66, 62, 68 (rng 1234).
- **My UI season:** 71-11, +15.7 net at the deadline, and a preseason forecast of 62-20 with a 46% title chance (`shots/13-Odds.png`).
- **Frequency:** 70+ wins happened in about 1 in 6 simulated seasons (5 of 32 in star-check, 3 of 8 in season-test). In 79 real NBA seasons it has happened twice.

Why it matters: the league reads as OKC versus everyone, and the user can't plan against an AI that pays no apron price.

Fix (M; overlaps the front-office lens):

- AI teams above the second apron must shed salary or lose flexibility.
- Raise tax-bill sensitivity for repeat taxpayers.
- Add star-check guards: no AI team above ~1.5× the cap, and at most one 70-win season per 8.

**4. Three-point leaders break Curry's record about half the time (P2, partly fixed)**

- Of 32 star-check seasons, 15 have a leader above 5.1 made threes a game (mean 5.02, max 5.78).
- Curry made 5.3 a game in my UI season at 38 (`shots/21-stats-deadline.png`), 360 threes in seed 1, and was at a 5.4 pace at the deadline.
- 10-three nights are improved (mean 10.5 a season, down from 19-39), but the leader rate is not.

Fix (S): cap three-point volume for top usage shooters, and add a star-check line "3PM leader ≤ 5.2 in ≥ 75% of seasons".

**5. End-of-game coaching is still thin, and OT is under target (P2, partly fixed)**

- Only 79 timeouts in the last 2:00 across 432 games that were within 3 points then (0.18 a game). Real teams call several.
- AI timeouts fire only on opponent runs (`src/core/sim/engine/coach.ts:208-219`).
- OT rate is 3.0-3.9% in my seasons (star-check 3.3%, 1,500 recorded games 3.1%), against the repo's own 4.7% target.
- Sample from `endgame.ts`: MEM trails DAL 122-125 and gets the ball after Irving's free throws with 0.8 seconds left. Memphis takes no shot.

Fix (M): timeouts to advance the ball after makes and rebounds in the last 0:30, an AI hold-for-last-shot, and a guard on `TARGETS.otRate`.

**6. Stars play too few minutes, and Jokić doesn't look like Jokić (P2, partly improved)**

- **Minutes:**
  - Per-team top-two MPG is 32.7/30.6 (star-check). The league max is 35.9-36.4 MPG, with only 0-3 players at 36+; in 2025-26 Maxey played 38.3.
  - Starters average 28.9 minutes.
- **Triple-doubles:** 58-70 a season (NBA 100+).
- **Jokić:**
  - 32.1 MPG and 24.2/11.6/9.3 against a real 27.5/12.9/10.6.
  - 5-26 triple-doubles a season, against a real 30+.
  - Teammate Jamal Murray won MVP in `real-check`.
- **Other stars under their real lines** (real rate at sim minutes in brackets): Lillard 17.2 (24.9), Embiid 18.6 (24.6), Trae 19.0 (23.9), LeBron 17.3 (21.4).

Fix (S-M): floor healthy top-two players at 33-35 minutes in `autoRotation`, and anchor high-usage stars' shot share to their real usage.

**7. Efficient bigs are over-rewarded (P2, still open)**

- Duren: 20.4 PPG on 70.2% shooting in 26.6 minutes (real rate 14.3), TS% 73.1, second in Win Shares and third in PER at the deadline. He made the All-Star team and won Player of the Month.
- Kessler was DPOY in 2027 and 2028 of the season-test, ahead of Wembanyama.
- The true-shooting leaderboard is all bigs: Duren, Allen, Zubac.

Fix (M): compress rim FG% at the top, and add "TS leader ≤ 70% (9+ attempts)" to `real-check`.

**8. Foul-outs run 2-3× too high, led by guards (P2, improved)**

- 191-242 a season, down from 294-336.
- Team fouls are 20.1 a game (real 19.4).
- The disqualification leaders are guards and wings (Nique Clifford 6, Jalen Suggs 6, Anthony Black, Kobe Sanders, Bones Hyland), not bigs (`extras.ts`).

Fix (S): bench players at 5 fouls until late, and check how foul share is spread across defenders.

**9. Scoreline and efficiency extremes (P2)**

- Team score max is 155-166 every season (star-check mean 157.5).
- Fast-break points average 18.3 per team-game (NBA about 14-15), with a max of 60 and a 95th percentile of 34.
- Memphis scored 41 fast-break points in its opener (`shots/19-game-Box.png`).
- SGA's PER ran 36.3 at the deadline and 34.5 at season's end; the all-time record is about 32.9.
- The NBA Cup final finished 151-148.

Fix (S): taper transition volume at extreme pace, and normalize PER to a league mean of 15.

**10. Bunched middle, one outlier, long streaks (P2)**

- Win SD is 10.6-12.4 (NBA about 13) and team net SD 4.7-5.4 (NBA 5.4-6.1), yet one team sits at +15.7.
- The longest win streak each season is 14-25 (star-check median 17, max 27); a typical NBA season's longest is about 12-16.
- Mostly fixed by finding 3. Re-measure after.

**11. Generated draft classes are too ready, and names recycle real players (P3)**

- The 2027 class's top prospects are already 76-79 OVR at 19 (Kai Peters 78/90, Jerome Crawford 79/88). 13 prospects sit at or above the league median of 74.
- Rookies of the Year in the season-test run 73-80 OVR.
- Names mash real NBA players together: "Alperen Bitim", "Ike Okongwu", "Jock Ingles", "Tyrese McBride", "Jayson Holmes".
- Fix (S): lower the class mean by about 3-4, and filter generated names against the real-player registry.

**12. Heavy minutes cost almost nothing (P3, still open)**

- Starters at 44 minutes cost only −1.0 to −1.4 per 100 (`rotlab.txt`).
- Full seasons at 40-44 minutes showed no visible injury penalty (`mx-*.txt`).
- It isn't an exploit, but the slider isn't a real trade-off.
- Fix (S): add a fourth-quarter efficiency fade and extra injury risk past about 38 minutes, and show both on the Rotation screen.

**13. The season-test health line measures the wrong thing (P3, repo tooling)**

- `season-test.ts` prints "last season ppg" from `league.games`, but `newSeason` keeps only the user team's games (`src/core/league/season.ts:688`). The "league ppg" swings 109.3 to 116.9 from year to year, and it is really one team's 82 games.
- It also still opens with "cannot start: Your roster has 17 players" (and later "12 players").
- Fix (S): compute league ppg before the prune, or from team seasons.

**14. Instant Hall of Fame (P3, mostly the career-world lens)**

LeBron (81) and Westbrook (65) were inducted the same summer they retired (season.ts:430-436). The real minimum wait is four years.

**15. A two-way player on the team-picker card (P3)**

Javon Small (two-way, 80) is shown as one of Memphis's three best players. The staff then plays him 3.4 MPG, although he played 20.2 MPG for real in 2025-26.

### Measured vs real NBA

| Metric                                | Sim (source)                                     | Real NBA                        | Read               |
| ------------------------------------- | ------------------------------------------------ | ------------------------------- | ------------------ |
| Pace / points per team-game           | 100.8 / 114.6 (rc); 114.3-116.7 (4 seasons)      | 99.6 / 114.4                    | ok                 |
| FG% / 3PA / FTA                       | .483 / 35.8 / 22.8                               | .471 / 37.5 / 21.8              | ok (±5%)           |
| ORB / AST / TOV / PF                  | 10.4 / 26.4 / 14.2 / 20.2                        | 10.8 / 26.6 / 13.9 / 19.4       | ok                 |
| Home win %                            | 53.0-55.8%                                       | ~54-55%                         | ok                 |
| Margin SD / games by 20+              | 14.8-15.4 / 18.9-21.1%                           | 16 / 21%                        | ok, slightly tight |
| Largest margin each season            | 48-65 (star-check mean 49, max 70)               | record 73                       | **fixed**          |
| Highest team score                    | 155-166                                          | ~150-157, rare                  | high               |
| OT rate                               | 3.0-3.9% (3.3% star-check)                       | 4.7% (repo target)              | **low**            |
| Games decided by ≤3                   | 15.2-18.6%                                       | ~18-20%                         | slightly low       |
| Win SD / net-rating SD                | 10.6-12.4 / 4.7-5.4                              | ~13 / 5.4-6.1                   | tight              |
| Best record                           | 57-71; 70+ wins in 5/32 + 3/8 seasons; 75-7 once | 70+ twice in ~79 seasons        | **off**            |
| AI max payroll / cap                  | 1.44-1.93 (OKC)                                  | ~1.4-1.55 historic max          | **off**            |
| Longest win streak                    | 14-25 (median 17)                                | ~12-16 typical                  | high               |
| 50-point / 60-point games             | 14-25 / 0-6                                      | ~10-20 / 0-5                    | ok                 |
| Triple-doubles a season               | 58-70                                            | 100-140                         | **low**            |
| Foul-outs a season                    | 191-242, guards lead                             | well under half that (estimate) | **high**           |
| Timeouts, last 2:00 of games within 3 | 0.18 a game                                      | several                         | **off**            |
| 3PM leader per game                   | mean 5.02; 15/32 seasons over 5.1                | record 5.1                      | **off**            |
| STL / BLK leader                      | 2.0-2.8 / 3.0-4.1                                | ~2.0-2.5 / ~3.0-3.6             | ok                 |
| MPG leader / players at 36+           | 35.9-36.4 / 0-3                                  | 38.3 (Maxey) / ~5-10            | low                |
| Fast-break points, team avg / max     | 18.3 / 60                                        | ~14-15 / ~35-40                 | high               |
| PER leader                            | 34.5-36.3                                        | record ~32.9                    | high               |
| 35+ PPG seasons                       | 5 in 32                                          | ~2 in the last decade           | ok                 |
| 60+ game injuries / Achilles          | 4.4 / 2.0 a season                               | ~4-8 / 1-3                      | **fixed**          |
| Series won by lower seed              | 3-6 of 15                                        | ~3-4                            | ok                 |

Real figures marked "~" are from memory; the rest come from the repo's TARGETS and `real-check`'s 2025-26 numbers.

## 4. Since the first review

| Round-1 finding                              | Status now                          | Evidence                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Visible ratings vs reputation             | **Still open, partly worse**        | Curry 3P 80 → 82, still behind 8 players. Gobert mid-range 84 → 93. Kessler is still 99, now joined by Gafford, Filipowski and Keldon Johnson. Finishing-99 and drawing-fouls oddities are new. |
| 2. Curry threes record                       | Partly                              | Curry 5.3 at 38 in the UI; leaders above the record in 15/32 seasons; 10-three nights down from 19-39 to a mean of 10.5.                                                                        |
| 3. 35+ PPG scorers / low-OVR scoring leaders | Mostly fixed                        | 5 in 32 seasons (Edwards 3 of them). But Markkanen (80-84 OVR) averages 31-35, and Brown (81) 28.                                                                                               |
| 4. Catastrophic injuries                     | **Fixed**                           | 4.4 injuries of 60+ games a season, Achilles 2.0.                                                                                                                                               |
| 5. Blowouts / scores                         | Margins fixed; scores still high    | Margin max 48-65; team score 155-166.                                                                                                                                                           |
| 6. OKC press at 111 pace                     | Pace fixed; dominance remains       | OKC pace 101.2 at the deadline, but see finding 3.                                                                                                                                              |
| 7. End-of-game                               | Partly                              | Fouling and down-3 threes are now right; timeouts and OT are still off.                                                                                                                         |
| 8. Embiid / Giannis / Lillard / Morant       | Partly                              | Giannis 28.5 in the UI is fine. Embiid 17-18, Lillard 17, Trae 19, LeBron 17 are still under.                                                                                                   |
| 9. Steals leaders                            | **Fixed**                           | Mean 2.24.                                                                                                                                                                                      |
| 10. Flat rotations                           | Partly                              | Stars now 32-33 MPG, down from 27-29, but still short of the NBA.                                                                                                                               |
| 11. 44 minutes costs nothing                 | Still open                          | −1.0 to −1.4 per 100.                                                                                                                                                                           |
| 13. AI fleeces                               | Not re-verified (front-office lens) | AI trade value is still OVR-only, so finding 2 still feeds it.                                                                                                                                  |
| 14. Foul-outs                                | Improved, still about 2×            | 191-242, down from 294-336.                                                                                                                                                                     |
| 15. Playoff randomness                       | **Fixed**                           | 3-6 upsets of 15.                                                                                                                                                                               |
| 16. Efficient bigs                           | Still open                          | Duren TS 73% and WS #2.                                                                                                                                                                         |
| 17. Triple-doubles                           | Still open                          | 58-70 a season.                                                                                                                                                                                 |
| 20. All-Star Game                            | Fixed                               | 161-148, MVP from the winning side.                                                                                                                                                             |
| 22. Script drift                             | Still open                          | Plus the misleading ppg health line (finding 13).                                                                                                                                               |

New this round: the OKC payroll dynasty (finding 3), the inflated finishing and drawing-fouls attributes, fast-break and PER extremes, real-name mashups in generated classes, and two-way players on the franchise card.

## 5. Top 5 moves

1. **Fix the attribute derivation and add a reputation regression test** (findings 1 and 2, M). This is the highest-traffic trust problem: every player page and ratings table.
2. **Put the AI under apron and tax discipline** (finding 3, M). It ends the 70-win, 1.9×-cap Thunder and makes the title race open.
3. **Set minute floors for stars and anchor their usage** (finding 6, S-M). Jokić, Embiid and Lillard would read as themselves, and triple-doubles would recover.
4. **Late-game timeouts and holds, tuned to the OT target** (finding 5, M). Close games would feel like the NBA.
5. **Tighten the outlier guards in star-check and real-check** (findings 4, 7, 8, 9, S): 3PM leader ≤ 5.2, TS leader ≤ 70%, foul-outs ≤ ~120 a season, team score ≤ 158, fast-break max ≤ 45, PER leader ≤ 33.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright, phone viewport, own profile at `.../scratchpad/review/sim-credibility/profile`, Memphis):

- New league, preseason cuts, Power and Odds forecasts, the opener's report (Box and Flow).
- Simmed to the trade deadline, then to the end of the regular season, through the play-in and playoffs to the draft lottery, with Stats, Ratings, Teams, Awards and Playoffs screens.
- Player pages for Curry, Gafford, Kennard and Mobley.
- Screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/sim-credibility/shots/`.

**Repo scripts:** `real-check.ts`, `star-check.ts` (4 leagues × 8 seasons), `league-invariants.ts` (passed), `season-test.ts 3` and `season-test.ts 8`, `tactic-sweep.ts 200`.

**My scripts** (same folder):

- `ratings.ts`: opening ratings dump.
- `season-stats.ts`: 4 full seasons with playoffs.
- `endgame.ts`: 1,500 recorded games, read for late-game behaviour.
- `extras.ts`: fast-break points, foul-outs, starter minutes.
- `minutes-exploit.ts`: 14 full seasons.
- `rotlab.ts`: paired lab, 4 teams × 3 rotation variants.

**Not verified:**

- Live-game play-by-play in the UI. Quick-simmed games store no play-by-play, so I read it from headless engine runs.
- Difficulty presets on the court.
- The 2026-27 roster moves in the seed (Kawhi to TOR, Giannis to MIA, Trae to WAS, Brown to PHI) are past my knowledge.
- Real-NBA foul-out totals and some extremes are estimates, marked "~" or "estimate" in the table.
- The minutes-exploit season comparison is noisy (±8 wins season to season), so I relied on the paired lab for that conclusion.
