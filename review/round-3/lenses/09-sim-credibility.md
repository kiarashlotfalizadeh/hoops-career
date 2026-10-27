# Sim credibility review, round 3 (`sim-credibility`)

## 1. Verdict

Box scores, league rates and stat lines now pass a fan's sniff test. The v9 ratings fixed most of the "Curry is an 82 shooter" problems from round 2: all 20 reputation anchors hold, Curry is #1 from three at 90, and Kennard is a 77. What still breaks the feeling of a real NBA is the league over several seasons:

- The Thunder win most titles.
- A 70-win team shows up in about one season in five.
- Win streaks of 30 to 41 games happen.
- Role shooters lead the league in made threes, and that leader beats Curry's record in about half of all seasons.

The ratings also still have a blind spot for defensive veterans. Gobert is a "Rotation" 77 with a $5.3M market value in the same season he wins DPOY. Draymond Green is 72, Dort 73. Low-minute bigs like Paul Reed (81) rate above them. The tier labels also contradict the reputation check: Curry and Jaylen Brown are 86, which the check calls "All-Star level", but the badge says "Quality Starter".

**Score: 7.0/10** (round 2: 6.5). Ratings and anchors gained a lot. Multi-season balance (dynasty, streaks, 70-win teams, threes leaders) did not improve, and some of it got worse.

## 2. What's genuinely great (protect these)

- **League rates sit at the NBA's.** `real-check` (rng 7), sim vs 2025-26:
  - Pace 100.5 (99.6), points 113.6 (114.4), 3P% .359 (.359), AST 26.0 (26.6), TOV 14.2 (13.9), STL 8.4 (8.2), BLK 5.1 (5.0).
  - Team net-rating SD 5.37 (NBA 5.4-6.1). Margin SD 15.5 (16). Games by 20+: 21.5% (21%).
  - Player correlations over 224 regulars: PPG 0.925, RPG 0.937, BPG 0.939, 3PM 0.928.
- **The reputation anchors work.** 20 of 20 hold (`scripts/data/reputation.ts`, printed by real-check, enforced by seed.test).
  - Curry 3P 90 (#1). Wembanyama BLK 99 (#1). The mid-range masters are 84-93. Giannis finishes at 94.
  - Tiers come out 7 / 17 / 28 (Superstar / All-NBA or better / All-Star or better).
  - Round 2's absurdities are gone: Kessler, Gafford and the other centers with mid-range 99, Kennard as an "All-Star", Giannis drawing fouls at 72.
- **The top of the ladder reads right.** Jokić 97, SGA 97, Dončić 96, Giannis 94, Wembanyama 94, then Mitchell, Cunningham, Edwards, Maxey and Tatum at 90-91 (`shots/../cards.txt`).
- **No exploit found** (paired engine lab `exploit.mts`, 3 user teams × 4 opponents × 60 games, net per 100):
  - Hack-a-player below 85% from Q1: −28.8. Below 75%: −12.5.
  - Five starters at 42 minutes with no fatigue subs: −1.9.
  - Turning the fatigue-sub threshold off: 0.0.
  - Turning garbage time off: +1.1 (a small, sensible effect).
- **The style gate passes** (`style-gate 3 4`, 477s). No playbook is best for more than 9.8 of 30 teams, and no shape for more than 9.3. The 2-3 zone is down to 7.2.
- **Single-game outliers are now under the real rate.** In star-check's 32 seasons, only one night reached 70+ (Dončić 76). Blowout margins peaked at 55 (mean 46.8). Catastrophic injuries stay in range: 4.5 absences of 60+ games a season, 2.2 Achilles ruptures.
- **Box scores read like the NBA.** Opener at `/game/7` (GSW 102, LAL 129): Dončić 29/6/8 on 10-12 FT, Curry 4-20 with 2-15 from three in a rout, minutes and fouls plausible (`shots/11-box-7.png`, `shots/10-game1.png`). The debrief separates shot luck (eFG vs expected) from the plan, which is exactly right.
- **The invariants pass:** `league-invariants` (3 real seasons plus a fictional league) reports "No violations".

## 3. Findings (most severe first)

**1. The AI Thunder are still the default champion, 70-win teams are about 5× too common, and win streaks pass the record (P1, still open, partly worse)**

- **Titles:** OKC won 9 of the 12 titles I observed.
  - My lab leagues: 6 of 8 (`lab-11.txt`, `lab-22.txt`), including two as the 5th-best record.
  - `season-test 3`: 2 of 3.
  - My UI season: a perfect 16-0 playoff run, sweeping all four rounds (`dump.mjs` output). That has never happened in the NBA.
- **70-win teams:** star-check had one in 6 of 32 seasons: OKC 74-8, OKC 72-10 twice, WAS 72-10, OKC 70-12, and BKN 71-11 with CHA 70-12 in the same season. My lab added OKC 75-7. Real NBA: 3 times in about 78 seasons.
- **Win streaks:** star-check median 19, max 36. My lab hit 41 (OKC, rng 22, 2028). The NBA record is 33.
- **Why the CI check doesn't catch it:** star-check allows one season over 73 wins per 20 (`scripts/star-check.ts:82`), and OKC 74-8 (rng 7) uses up exactly that allowance. Streaks have no guard at all.
- **Why it matters:** the title race reads as OKC versus everyone, and an all-time streak shows up casually and loses its meaning.
- **Fix (M):**
  - Add star-check guards: longest streak ≤ 28 in ≥ 90% of seasons; a 70-win team in ≤ 1 season per 8; no franchise with more than 50% of titles across a league's 8 seasons.
  - Then find the lever. Likely candidates are the young core's progression plus AI re-signing at any price; OKC payroll is no longer the culprit (invariants: AI max 1.39-1.47× the cap).

**2. Defensive veterans are under-rated, and low-minute bigs are over-rated (P1, new as the main ratings gap)**

- **Under-rated:**
  - Gobert is 77 "Rotation", tied with Luka Garza and Alex Caruso.
  - Draymond Green 72, Lu Dort 73, Nic Claxton 72, Herb Jones 78, Alex Caruso 77.
- **Over-rated, all bench bigs:**
  - Paul Reed 81 "Starter" (13.9 MPG real; on the floor he plays as a "Wing Stopper", a role the app gives to a center).
  - Day'Ron Sharpe 81 (18.7 MPG), Goga Bitadze 79 (15.2 MPG), Jonathan Isaac 75 (10.0 MPG).
- **Ratings inside the defense group:**
  - Gobert's interior defense is 84, below Luke Kornet (86) and tied with Jaylin Williams.
  - Perimeter defense ranks Maxey 86 above Herb Jones 79 and Dort 76.
  - Offensive IQ ranks Obi Toppin 86 and Cameron Johnson 85 above LeBron (69) and Dončić (81).
- **What the player sees on Gobert's page** (`/player/48`, `shots/pl-_player_48.png`): DPOY and All-Defense 1st this season, "5× DPOY", and next to it a 77 "Rotation" badge with **Market $5.3M**. Ty Jerome, a 15-game bench scorer, is 86 with a $30.3M market value (`real-check`).
- **Likely cause:**
  - OVR is 0.42 production, 0.38 impact and 0.20 minutes (`scripts/data/reputation.ts:29`). Production per game counts points ahead of defense.
  - Players under 1,000 minutes are left out of the fit (`minMinutes: 1000`), so their per-36 rates go unshrunk.
- **Why it matters:** the sim itself values Gobert (it named him DPOY) while the card says "Rotation". That gap breaks the "tells you why" pitch, and trade and market values follow the card.
- **Fix (M):**
  - Add anchors: every All-Defense 1st-teamer of the last two seasons rates 80+; a reigning DPOY rates 82+; no player under 20 real MPG rates 80+ without 1,500+ minutes.
  - Shrink sub-1,000-minute players toward a positional prior.

**3. The tier labels contradict the reputation check (P1, new, S)**

- The check calls 86+ "All-Star level" (`scripts/data/reputation.ts:175, 181, 198`). The badge only says All-Star from 87 (`src/core/ratings.ts:308`).
- So Curry (86, 26.6 PPG real), Jaylen Brown (86, 28.7 PPG real) and Anthony Davis wear "Quality Starter" badges (`/player/1`; cards dump rows 29-31). The same label goes to Ty Jerome, Derrick White and Michael Porter Jr.
- Fan-facing, "Curry: Quality Starter" is the screenshot that goes viral.
- **Fix (S):** move All-Star to 86, or make the anchors demand 87.

**4. Role shooters lead the league in threes, and the leader beats Curry's record most seasons (P1, still open, slightly worse)**

- **star-check, 32 seasons:**
  - The made-threes leader averages 5.17 a game (max 5.96). It beats the real record of 5.1 in 17 of 32 seasons (round 2: 15).
  - 10-three nights average 15.2 a season (max 28), up from round 2's 10.5.
- **Who leads:** Collin Gillespie (80 OVR) at 5.22-5.59 in two leagues, Isaiah Joe 5.26-5.96 in one league, Grayson Allen (72 OVR) at 4.7 in my lab. Haliburton leads at 4.8-5.8, against his real 2.5-3.
- **The guards are loose:** `MAX_TPM = 6.2` and `MAX_TPM10 = 30` (`star-check.ts:52-53`) sit far above the records, so CI can't fail on this.
- **Fix (S-M):**
  - Tighten the guards to a leader ≤ 5.2 in ≥ 75% of seasons and ≤ 12 ten-three nights.
  - Cap three-point volume by real attempt rate for non-creators.

**5. Superstars score and play below their real lines (P2, still open)**

- **`real-check`, sim vs real 2025-26:**
  - Dončić 27.3 (33.5), SGA 27.1 (30.5), Jokić 23.6/10.9/9.3 in 31.4 MPG (27.7/12.9/10.7 in 34.8).
  - Kawhi 23.7 (27.8), Mitchell 24.1 (27.5), Embiid 21.3 (26.4), Brown 24.9 (28.4).
  - Meanwhile Coby White scores 24.5 (17.1).
- **Minutes:** star-check's per-team top-two average is 32.2/30.2 MPG, unchanged from round 2. The league leader is 35.9 (Maxey played 38.0 for real).
- **Big nights:** 50-point games run 4-16 a season and fall each season as the real stars age out (my lab: 10-16 in year one, 3-4 by year four). Triple-doubles fall from 72-88 to 32-56 (the NBA has 100+).
- **Awards drift:** MVPs include Tyler Herro (25.9 PPG, lab rng 22) and Jokić on 23.4 PPG in my UI season.
- **Fix (S-M):** floor healthy top-two minutes at 34-35 in the auto rotation, and anchor stars' usage to their real usage.

**6. The preseason forecast is compressed and mis-reads veteran teams, and owner goals inherit the error (P2, new)**

- **Measured** (`proj.mts`, two leagues, forecast at opening night vs the actual record):
  - r 0.71-0.75. MAE 5.8-7.1 (Vegas-like).
  - Projection SD only 7.0 against an actual win SD of 10.6-12.4.
  - 5-10 of 30 teams miss by 10+ wins. The 10-90% band held 21-24 of 30 (it should hold about 24).
- **Golden State is projected 32 wins every time** and won 42, 44 (my UI), 48 (real-check) and 51.
- **What the player sees:** the GSW owner sets "Win about 32 games" (`shots/03-after-release.png`), and my team cruised to 44-38.
- **Probable cause:** the forecast's strength comes from roster talent, and the vets it under-rates (Draymond 72, Horford 74) play well in the engine (ties to finding 2).
- **Fix (M):** calibrate the forecast's strength on simulated seasons (scale its spread up about 1.5×), and recheck owner goals against it.

**7. OT is under target, and end-of-game timeouts weren't re-measured (P2, still open)**

- OT rate is 3.1% (star-check, 32 seasons) and 2.8-3.6% in my lab, against the repo's own `TARGETS.otRate 0.047` (`src/core/constants.ts:111`).
- Games decided by 3 or less: 17.3%.
- **Fix (M):** add a guard on the OT target. See round 2 finding 5 for the timeout and last-shot gaps.

**8. Foul-outs still run about 2× high (P2, still open)**

- My lab: 170-256 a season (0.067-0.104 per team-game). The real figure is well under half that (estimate from memory).
- **Fix (S):** foul-trouble benching at 5 fouls until late, and add a guard of ≤ 130 a season.

**9. Efficient bigs top the shooting boards (P2, partly)**

- True-shooting leaders are bigs in every season:
  - At the deadline: Jarrett Allen 72.6 TS% and Kessler 67.2 (`/league/stats`).
  - In my lab: Kalkbrenner and Konan Niederhäuser at 0.70-0.74.
- `real-check` rim FG% correlation with real is only 0.418.
- Less extreme than round 2's Duren at 73%, but still systematic.

**10. Haliburton is a 93 "Superstar" off a missed season (P2, new)**

- He played 0 real games in 2025-26 (Achilles), and his last real season was about 18.6/9.2. He rates 93/94, the 7th-best player in the league.
- In sim seasons he becomes a perennial 4.8-5.8 made-threes leader.
- **Fix (S):** cap a player with no real season in the last year at the OVR his last real season earned, minus an injury discount.

**11. CI guards were loosened to fit what the engine does (P2, process)**

- **The single-game cap went 73 → 80** in commit 4588c80, and the 76-point night in CI's own leagues needs it (Dončić 76, rng 2026, 2027).
  - The code comment says the real league has had 74-76 point nights "once in a few dozen seasons". Only Wilt and Kobe's 81 have topped 73.
  - The engine's actual 70+ rate (1 in 32 seasons) is fine, so the raise is defensible, but the comment overstates real history.
- **The reputation thresholds are documented as softened**, and each softening is explained in the code:
  - Curry 3P 90, not 95.
  - Giannis drawing fouls 85, not 90.
  - Zion finishing 75.
  - Jerome only held below All-NBA.
- **Neither the 70-win allowance nor the streak or threes guards would catch finding 1 or 4.**
- **Fix (S):** correct the comment; add the guards from findings 1, 4, 7 and 8.

**12. AI front offices pick styles their own measurement doesn't favour (P3)**

- In the style gate, AI staffs pick Hub for 7.5 teams where it is measured best for 0.8, and Ice/Hedge for 9.3/9 where those are best for 4.1/2.4.
- This is diverse and realistic, but it leaves free points for the user's staff.
- The user's staff picks the zone for 11 of 30 rosters, near the gate's limit of 12.

**13. Generated draft classes are still ready-made, and names still mash real players together (P3, still open)**

- **Readiness:** the class has 15 prospects at 70+ and the top two at 76 (75-76 at 19-20) (`dc.mjs`).
- **Names:** "Quentin Olynyk", "Rico McBride", "Thomas Porter" in this class; "Franz Hartenstein" (star-check rng 2026) and "E. Şengün" (my lab) in other leagues.
- **Fix (S):** filter generated names against the real-player registry.

**14. Bench-heavy distribution in blowouts and odd starter minutes (P3)**

- In the opener, Melton started and played 1-2 minutes (`shots/11-box-7.png`).
- The lab's minute high was 64.9 in a single game (a 4OT night).

**15. Season-test tooling still prints "cannot start: Your roster has 17 players" and later "12 players" (P3, still open)**

### Measured vs real

| Metric                            | Sim (source)                                  | Real NBA                   | Read                 |
| --------------------------------- | --------------------------------------------- | -------------------------- | -------------------- |
| Pace / pts per team-game          | 100.5 / 113.6 (rc); 112.8-115.3 (lab)         | 99.6 / 114.4               | ok                   |
| 3P% / FTA / AST / TOV             | .359 / 22.2 / 26.0 / 14.2                     | .359 / 21.8 / 26.6 / 13.9  | ok                   |
| Home win %                        | 53.3-56.3% (lab)                              | ~54-55%                    | ok                   |
| Margin SD / 20+ games             | 15.5 / 21.5%                                  | 16 / 21%                   | ok                   |
| Win SD / net SD                   | 10.4-13.2 / 5.37                              | ~13 / 5.4-6.1              | ok-tight             |
| Best record median / max          | 65 / 74 (sc); 75 (lab)                        | median ~64, record 73      | max off              |
| Seasons with a 70-win team        | 6 of 32 (sc) + 1 of 8 (lab)                   | 3 of ~78                   | **off, ~5×**         |
| Longest streak median / max       | 19 / 36 (sc), 41 (lab)                        | ~12-16 typical / record 33 | **off**              |
| Titles by one franchise           | OKC 9 of 12 observed                          | —                          | **off**              |
| Scoring leader                    | 26.5-33.4                                     | 31-34 recently             | ok                   |
| Stars' PPG (Dončić / SGA / Jokić) | 27.3 / 27.1 / 23.6 (rc)                       | 33.5 / 31.1 / 27.7         | **low**              |
| Top-two MPG / MPG leader          | 32.2/30.2 / 35.9-37.3                         | ~35/33 / 38.0              | low                  |
| 3PM leader mean / seasons > 5.1   | 5.17 / 17 of 32                               | record 5.1                 | **off, worse**       |
| 10-three nights a season          | 15.2 mean, max 28                             | a handful                  | high                 |
| 70+ point games                   | 1 in 32 seasons                               | ~1 per decade since 1980   | ok                   |
| 50+ point games a season          | 4-16, falling                                 | ~15-30 recently (memory)   | low                  |
| Triple-doubles a season           | 32-88, falling                                | 100+                       | **low**              |
| OT rate                           | 3.1% (sc)                                     | 4.7% (repo target)         | **low**              |
| Games decided by ≤3               | 17.3%                                         | ~18-20%                    | ok                   |
| Foul-outs a season                | 170-256                                       | well under half (estimate) | **high**             |
| Max margin / team score           | 55 / 168                                      | 73 / ~150-160              | ok                   |
| STL / BLK leader                  | 2.23 mean / 3.1-3.6                           | ~2.0-2.5 / ~3.0-3.6        | ok                   |
| 60+ game injuries / Achilles      | 4.5 / 2.2 a season                            | ~4-8 / 1-3                 | ok                   |
| Series won by lower seed          | 1-7 of 15                                     | ~3-4                       | ok, noisy            |
| AI max payroll / cap              | 1.39-1.47 (inv), 2-5 teams past 2nd apron     | ~1.4-1.5                   | ok (fixed from 1.93) |
| Taxpayers                         | 10-16                                         | ~7-9                       | slightly high        |
| Forecast vs result                | r 0.71-0.75, MAE 5.8-7.1, SD 7.0 vs 10.6-12.4 | Vegas MAE ~7               | spread compressed    |
| #1 pick OVR                       | 73-82                                         | rookie ~75-78 2K           | ok                   |

Sources: rc = real-check, sc = star-check. Real figures marked "~" or "memory" are recollection; the rest come from real-check's 2025-26 numbers and the repo's TARGETS.

## 4. Since round 2

| Round-2 finding                              | Status                                 | Evidence                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Attribute ratings vs reputation           | **Mostly fixed**                       | 20/20 anchors. Curry 3P 90 #1. Centers' mid-range capped at 75. Mid-range masters 84-93. Remaining: perimeter defense, defensive IQ and offensive IQ oddities (Maxey perD 86, Toppin OIQ 86, LeBron OIQ 69); GP2 and Jaxson Hayes finishing 95; T.J. McConnell 88-95 in mid, passing and handle |
| 2. OVR tiers crown role players              | **Mostly fixed, new gap**              | Kennard 77, Joe 78, Spencer 81. But Jerome 86 equals Curry; Gobert 77; low-minute bigs 79-81 (findings 2-3)                                                                                                                                                                                     |
| 3. OKC dynasty / payroll                     | **Payroll fixed, dynasty open, worse** | AI max 1.39-1.47× the cap. OKC titles 9 of 12; 74-8, 75-7, a 41-game streak                                                                                                                                                                                                                     |
| 4. 3PM leaders over the record               | **Still open, slightly worse**         | 17 of 32 over 5.1 (was 15); 10-three nights 15.2 (was 10.5)                                                                                                                                                                                                                                     |
| 5. End game / OT                             | Still open                             | OT 3.1% vs 4.7%. Timeouts not re-measured                                                                                                                                                                                                                                                       |
| 6. Star minutes / Jokić                      | Still open                             | 32.2/30.2 MPG; Jokić 23.6/10.9/9.3 in 31.4 MPG                                                                                                                                                                                                                                                  |
| 7. Efficient bigs                            | Partly                                 | TS leaders still bigs at 70-74%; Allen 72.6                                                                                                                                                                                                                                                     |
| 8. Foul-outs                                 | Still open                             | 170-256 a season                                                                                                                                                                                                                                                                                |
| 9. Score and PER extremes                    | Improved                               | Team score max mean 154.9 (was 157.5); PER leader 32.2 at the deadline                                                                                                                                                                                                                          |
| 10. Streaks                                  | **Worse**                              | Median 19 (was 17), max 36/41 (was 27)                                                                                                                                                                                                                                                          |
| 11. Draft classes / names                    | Still open                             | Top prospects 75-76, 15 at 70+; real-name mashups remain                                                                                                                                                                                                                                        |
| 12. Heavy minutes cost nothing               | Still open, not an exploit             | Ironman −1.9 per 100; the fatigue-sub threshold measures 0.0                                                                                                                                                                                                                                    |
| 13. Season-test health line / "cannot start" | Still open                             | Same messages                                                                                                                                                                                                                                                                                   |

**New in the last two rounds:**

- Reputation anchors and the OVR fit (great).
- The tier-label mismatch (finding 3).
- Forecast compression feeding owner goals (finding 6).
- The single-game cap raised to 80 with an inaccurate rationale (finding 11).
- The style-gate CI job (great).
- Haliburton's 93 off a missed season (finding 10).

## 5. What it takes to reach 9/10

1. **End the default-champion league.** Find why OKC (and occasionally WAS or BKN) reach 70+ wins and 30+ game streaks, then add star-check guards for streaks, 70-win seasons and title concentration. The league would feel open, and records would mean something again.
2. **Defense-aware OVR plus fixed tier boundaries.**
   - Add All-Defense and DPOY anchors.
   - Shrink sub-1,000-minute players.
   - Align "All-Star" at 86.
   - The highest-traffic trust problem left: every player card and market value.
3. **Stars play like stars.** Minute floors of 34-35 for healthy top-two players and real-usage anchors. Dončić, SGA and Jokić return to their 30/27 lines, and triple-doubles and 50-point nights recover.
4. **Threes volume discipline.** Cap non-creators' three-point attempt rates, and tighten MAX_TPM to 5.2 and MAX_TPM10 to about 12. That removes the "Grayson Allen leads the league" seasons.
5. **Calibrate the forecast's spread on simulated seasons.** Owner goals and odds would become fair, especially for veteran rosters like GSW and CLE.

## 6. What I couldn't verify and how I tested

**UI** (Playwright, phone viewport, own profile; screenshots in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/sim-credibility/shots/`):

- New real league as Golden State; preseason cuts through the Needs-you confirm.
- The opener quick-simmed, with its report and box score (`/game/7`).
- Simmed to the trade deadline (standings and stats), then the end of the regular season, the play-in and playoffs, to the draft lottery.
- Screens: `/league/stats`, `/league/awards`, `/league/standings`, `/office/draft`, and player pages for Gobert, Reed, Curry and Jerome.
- I read the store only for gids, playoff series, the draft class and pids.

**Repo scripts:**

- `real-check`: 20/20 anchors.
- `star-check` (4 leagues × 8 seasons): PASS.
- `season-test 3`: exit 0.
- `league-invariants`: no violations.
- `style-gate 3 4`: passed.

**My scripts** (same folder):

- `cards.ts`: every rostered player's card against his real line; I checked 60+ names beyond the anchors.
- `lab.mts`: 2 leagues × 4 seasons with full offseasons. Foul-outs, OT, streaks, upsets, payrolls, rookies, leaders.
- `proj.mts`: preseason forecast vs result, 2 leagues.
- `exploit.mts`: paired engine lab for hack-a-player, ironman minutes, garbage time and fatigue subs.

**Not verified:**

- Live-game play-by-play and late-game timeouts (quick-sims store no play-by-play).
- Difficulty presets.
- Whether the seed's 2026 offseason roster moves are real (past my knowledge).
- Real foul-out, 50-point-game and triple-double totals are from memory and marked as such.

Timings ran under heavy shared load (load average about 48).
