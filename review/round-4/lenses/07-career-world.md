# Hoops Career, round 4: `career-world` lens (the long game)

**REPORT.md was not written.** The harness blocks report files from subagents, so this message is the full report.

Paths used below:

- `S` = `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/career-world/shots`
- `D` = `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/career-world`

## 1. Verdict

**Score: 8.0/10, up from 7.5.**

A long save now feels remembered:

- History opens on the 2025-26 Knicks and lists all 80 champions.
- The record book combines the NBA's all-time marks (Wilt's 100, Stockton's 14.5, the 73-9 Warriors) with this league's own nights.
- Past seasons are full reference pages: bracket, standings, stat leaders and award winners.
- Retirements bring farewells, banner nights and Hall of Fame cards.
- The chronicle reads the past back to you: "a first title since 2012-13", "a fourth title in five years".

What separates it from 2K's MyNBA or a BBGM real-players league is **the franchise past**:

- The Bulls' rafters hold Jimmy Butler's #21 and no Jordan.
- The Lakers' all-time scoring leader is LeBron at 12,402 points, with no Kobe, Kareem or West.
- The Hall of Fame starts empty.
- Its formula leaves out Gobert (4× DPOY), Paul George and Booker, but lets in Sabonis and Markkanen.
- The coaches are still invented.
- A career still can't end.

The world is alive and the record keeping is honest. But the real NBA before 2003-04 is only a list of Finals and MVPs, not a place you can explore.

## 2. What's genuinely great (protect these)

**The record book is honest and knows the real all-time marks.**

- Records → "Single game · Since 1996-97" is seeded from real game data: Adebayo's 83, Barkley's 33 rebounds, Rondo's 25 assists, Klay's 14 threes, the Kings' 176 points, Memphis's +73.
- "All-time · The NBA's and this league's" has:
  - Wilt's 100 points and 55 rebounds, Skiles's 30 assists, Elmore Smith's 17 blocks;
  - the Pistons' 186 points;
  - Wilt's 50.4 per game and 4,029 in a season, Curry's 402 threes;
  - 73-9 and 7-59 (`S/2027-preseason-records.txt`).
- It updates when the league beats the NBA. At year 10 it shows the Pacers' 36 threes and the Celtics' 8-74 as all-time marks (`S/y10-records.png`).
- The Career block is labelled "Players in this league".
- News lines carry the qualifier: "55 points (a Thunder playoff record since 1996-97)".

**Season pages are now proper reference pages.** `S/2027-draftLottery-season-page.png` has:

- the champion's banner and 12 stories;
- a full bracket with series scores, and both conference standings;
- points, rebounds and assists leaders;
- MVP, Finals MVP, DPOY, ROY and the Cup winner;
- "Your season", which links to its review.

**Send-offs carry history.**

- Farewell cards: "Retires Draymond Green · 8,372 points in 968 games · four titles, a DPOY, two All-NBA, four All-Star". The honours are correct.
- Banner night: "No. 11 · Klay Thompson's number goes up to the rafters…" (`S/moment-002-2028-regular.png`). It shows the Warriors number even though he retired a Buck.
- Hall of Fame cards: "Stephen Curry · 30,476 points…" (`S/moment-015-2029-draft.png`).
- 23 franchises retired numbers over the decade. Most are right: Curry #30 GSW, Westbrook #0 OKC, KD #35 OKC, Kawhi #2 at SAS and LAC, Butler #21 CHI and #22 MIA, Giannis #34.

**Legends' pages are complete.** LeBron at year 10 (`S/y10-lebron.txt`):

- "Cavaliers 11 seasons · Heat 4 · Lakers 8 · 76ers 1";
- 44,442 points, "Retired: Cavaliers No. 23, Lakers No. 23";
- 4× Champion, 4× MVP, 4× Finals MVP, 21× All-NBA, 22× All-Star.

**The league turns over believably, with no rating drift.** Decade A, 10 seasons:

| Measure                        | Range over the decade |
| ------------------------------ | --------------------- |
| Players rated 90+              | 12–16                 |
| Players rated 85+              | 42–53                 |
| Mean first-round rookie rating | 70.0–72.2             |
| Best rookie in each class      | 80–83                 |

- By 2037, 8 of the top 10 players were drafted in the save. Cedric Adams (#2 in 2027) went from 74 to 97.
- Late picks can bloom: #25 Bryce Thomas reached 92, #21 Terrell Holland 91, and a second-rounder reached 87.
- Aging curve (n≈4,700 player-seasons, `D/aging.py`):
  - +1.4 a year at ages 20–21;
  - flat at 25–27;
  - −0.9 at 29–30, −2.4 at 33, −3.9 at 36.
- Champions: run B had 9 different champions in 9 seasons. Run A had OKC win 4 in 5, then 5 different champions.

**The chronicle knows the history.** Decade A's chronicle includes "a three-peat", "a fourth title in five years", "the first title in franchise history", "a first title since 2012-13", and "Nikola Jokić's night in Denver" when his #15 went up.

**The GM legacy has real substance.** Career at year 10 (`S/y10-career.txt`) shows:

- both jobs and every season's review with its grade;
- the Hall of Fame case;
- "Kaden Rhodes · Drafted #12 in 2029 · All-Star · 93 peak";
- signature wins.

The tenure card now reads the situation: "Year 4 with the Warriors · Two seasons out of the playoffs. The core is 24."

**It runs fast.** These timings are under load from ten reviewers on one machine.

- Headless, a season takes 16–36 s.
- In the UI, a season plus its offseason takes about 70 s.
- The save grows from 5.5 MB in year 1 to 10.1 MB in year 10.
- A year-10 import opened in 186 ms with no errors.

## 3. Findings (most severe first)

### F1. The franchise past stops at 2003-04 while claiming to be complete (P1)

What the player sees:

- **Bulls** (`S/d-chi.png`):
  - Title banners 1991–1998, but the only retired number is "21 · Jimmy Butler · 2028-29".
  - Franchise leaders: "Z. LaVine 10,056 · C. White · N. Vučević…". No Jordan (29,277), no Pippen.
- **Lakers** (`S/d-lal.txt`):
  - Leaders: "L. James 12,402 · L. Dončić · A. Reaves · A. Davis · K. Kuzma…".
  - No Kobe, West, Kareem or Magic.
  - LeBron's #23 is the only retired number.
- **Magic:** the leader is Vučević, not Dwight Howard.
- Every leaders table carries the caption "Leaders count the real seasons before 2026-27 too". That is only true for players in the 2026 rosters, so it tells fans the table is complete when it isn't.
- The Hall of Fame starts as "Nobody inducted yet".

Cause:

- `history.json` (11.7 KB) holds only Finals, MVPs and the honours of the 143 players in the starting rosters.
- `careerLeaders` (`records.ts:737`) can only see players in the starting rosters.
- `team.retired` starts empty (`jerseys.ts:50`).

Why it matters: this is the first thing an NBA fan checks in a real-league save. 2K and BBGM ship franchise history.

Fix (M):

- Extend `data:history` with each franchise's real retired numbers (about 190).
- Add each franchise's all-time top-10 leaders as fixed rows that merge with in-league totals.
- Add the real Hall of Fame.
- Until then, change the caption to "players active since 2003-04".

### F2. The Hall of Fame formula still ignores the honours it knows (P1/P2, round-3 F3 still open)

Who got in and who didn't (decade A, `D/decade-a.log`):

- **Out:**
  - Gobert: 4× DPOY, 4× All-NBA, 3× All-Star.
  - Paul George: 9× All-Star, 6× All-NBA.
  - Booker: 26,454 points.
  - Brunson and Jaylen Brown: both Finals MVPs.
- **In:**
  - Sabonis: 14.5 points per game for his career.
  - Markkanen: his card shows "Champion · NBA Cup" as its two credentials (`S/y10-hof.txt`).

Cause:

- `hallOfFameScore` (`season.ts:405`) skips every award won before the save began.
- `preLeagueLegacy` (`season.ts:378-401`) uses box-score game score squared, which favours a rebounding, passing big over a 4× DPOY.

Other problems:

- Induction is instant at retirement, so there is no yearly class to look forward to.
- The coach's bar is still "two titles or 600 wins".
- The honour chips are in an odd order: "Champion · 4× MVP" for Jokić.

Fix (S):

- Score the real honours with the existing `HOF_POINTS` and add DPOY credit.
- Use the box-score measure only as a tiebreak.
- Induct a class each summer, a season after retirement.
- Sort chips by weight.

### F3. The chronicle drops Hall of Famers' farewells to make room for the user's role players (P2, new)

- In the 2033 chronicle (decade A), the four farewells are Terance Mann, Moritz Wagner and Keon Ellis (all on the user's Nets) plus Giannis.
- Embiid and Sabonis, both inducted that summer, never make the league's permanent memory.
- Cause:
  - Every farewell has the same weight.
  - Stories about the user's team get +3 (`chronicle.ts:45-47`).
  - The cap is `FAREWELLS_MAX = 4`.
  - Hall of Famers get no bonus.
- The same season kept two Heat streak stories, but nothing on their 70-12 season or the Celtics' 8-74 (an all-time worst).
- Fix (S):
  - Give Hall of Fame farewells +10.
  - Allow at most one of the user's farewells.
  - Merge streak stories.
  - Add a story when an all-time team-season mark falls.

### F4. The NBA's team-threes record falls in the first season of every league (P2, round-3 F16 partly fixed)

- In all three leagues I ran, the real record of 29 threes fell in season one:
  - UI run: Suns 30, then Bucks 31, in the same season.
  - Decade A: 30, then 31, 32, 34 and 36 by year 7.
  - Decade B: 30, then 31.
- The league average is right: 13.2–14.5 threes on 37–40 attempts per team per game.
- The single-game spread is too wide: standard deviation 4.7 in stored games (`D/tpm.py`), against about 4.0 in the NBA.
- Other records held for the whole decade: 83 points, 33 rebounds, 176 team points, +73.
- Team records drift to extremes over time:
  - 60-win teams go from 1 per season to 4;
  - Miami went 70-12 three years running;
  - Boston went 8-74.
- Fix (M), handed to sim-credibility:
  - Narrow the game-to-game three-point variance.
  - Add an invariants check: no all-time team record broken in season one, across 20 seeds.

### F5. There is no draft history, and the hindsight grade is computed but never shown (P2, new)

- There is no past-drafts view: you can't open "the 2027 draft" to see who went where and how each pick turned out.
- `draftHindsight()` (`prospects.ts:537`) already grades each pick "beat it / as read / bust" against the draft-night read, but no screen calls it.
- Stories like a #25 pick becoming a 92, or the 2027 class producing four 90+ players, are never told.
- BBGM's past-drafts pages are a long-save staple.
- Fix (S/M): add History → Drafts with pick, team, peak, current rating, verdict and honours, plus a "steal of the draft" line on each season page.

### F6. Coaches are still fictional (P2, round-3 F8 open)

- Year-10 Coaches page: "IND Marty Underwood · 2 titles · COY", "MIA Rick Grantham".
- Your career rank ("12th in wins of 30 head coaches") is measured against invented people.
- Fix (M): seed the real coaches, or label them as fictional.

### F7. A career still can't end (P2, round-3 F10 open)

- There is no retire or step-down action anywhere in `src`.
- The Hall of Fame case has no payoff: no finale, no induction.
- Fix (M): add Career → Retire, leading to a final career page and a coach Hall of Fame vote.

### F8. Generated players carry real NBA names (P2, round-3 F12 open)

- Among 686 players drafted in decade A, five have exact real names:
  - "Kyle Anderson", who won ROY in 2034;
  - "Jonas Valančiūnas";
  - "Emeka Okafor", on the user's roster at year 10;
  - "Didi Louzada" and "Michael Smith".
- 118 more share a 7+ letter surname with a real player, e.g. "Chinedu Achiuwa", "Lachlan Giddey".
- Fix (S): filter generated names against the starting rosters plus the 325 historical names already in `records.json`.

### F9. Award and exit moments are flat and uneven (P2, round-3 F4/F7 partly fixed)

- The award card is still a flat line: "Most Improved · Kyle Filipowski takes the award."
- Play-in exits get a card, but the 2027 round-2 Game 7 loss got none: no moment between days 195 and 207 (`D/drive.out`).
- A retiring bench player of yours takes the full screen ("Retires Gary Payton II · 2,480 points in 402 games").
- Fix (S):
  - Give award cards context ("his first; your #24 pick").
  - Card every playoff exit.
  - Keep full-screen farewells for 76+ rated or decorated players.

### F10. Retired numbers and banners have data and format problems (P2, round-3 F9 open)

- The real retired numbers are missing (see F1).
- Banner chips mix formats: "1949 Lakers… 1972…", and "1949 Lakers" really means Minneapolis.
- Philadelphia retired Embiid's **#10** from a late return stint, not the #21 he wore for years. Cause: `numberWith` takes the most recent number (`jerseys.ts:163`).
- Lillard's jersey is blank in the starting data, so Portland retired #7 instead of #0.
- Fix (S): use the number worn for the most seasons, show relocated city names on chips, and fill the missing jerseys.

### F11. Legends' rating history is cut to one or two points (P3, round-3 F14 open)

At year 10, Jokić's `ratingsHistory` is [(2028, 97), (2034, 67)] and LeBron's is [(2027, 84)]. Cause: `compactRetired` (`season.ts:~790`). Keeping one rating per season would cost about 2 bytes a season.

### F12. Development copy says "this month" in preseason (P3, round-3 F11 partly fixed)

- The 2029 preseason screen says "The summer's work is in", then "No change this month; stamina −2…".
- It also says "Coaching budget 1st of 30, development coaching 29th of 30" without explaining how both are true.
- Fix (S): say "over the summer" in preseason and explain the budget vs coach-quality split in one line.

### F13. The real-playoff rivalry table is stale (P3, round-3 F15 open)

`REAL_SERIES` (`gameStory.ts:985`) still holds the 2024-25 playoffs, while `history.json` already knows the 2026 Finals.

### F14. Copy nits (P3)

- The seasons list mixes formats: "Mavericks def. MIA 4-1" next to "Knicks def. Spurs 4-1".
- Westbrook is still listed as "SF" in the Hall of Fame.
- "Notable retirements" includes Mamadi Diakite (71 games).
- Every signature win over a decade is a regular-season upset; none is from the playoffs.
- A banner-night card dated Oct 20 appeared on day 103, after a long sim.
- The title news says "2027 NBA champions" while everything else says "2026-27".

## 4. Since round 3

| Round-3 finding                       | Status           | How I verified                                                                                                                                    |
| ------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 record book ignores the NBA past   | **Fixed**        | Seeded book since 1996-97; all-time table that updates; news qualifiers; career block labelled. Franchise all-time leaders still missing (new F1) |
| F2 shallow season pages               | **Fixed**        | Bracket, Finals, standings, leaders, winners, series scores; story logos now follow the story's team                                              |
| F3 Hall of Fame formula and coach bar | **Open**         | New F2                                                                                                                                            |
| F4 flat award moments                 | **Open**         | New F9                                                                                                                                            |
| F5 wrong jersey on banner nights      | **Fixed**        | #11 on Klay's card; Curry's card shows #30, greyed                                                                                                |
| F6 thin tenure card                   | **Mostly fixed** | "Two seasons out of the playoffs. The core is 24."                                                                                                |
| F7 no playoff-exit card               | **Partly**       | Play-in exits carded; a round-2 Game 7 loss wasn't                                                                                                |
| F8 invented coaches                   | **Open**         | New F6                                                                                                                                            |
| F9 real retired numbers missing       | **Open**         | Now visible on every franchise page                                                                                                               |
| F10 no way to end a career            | **Open**         | New F7                                                                                                                                            |
| F11 development copy                  | **Partly**       | New F12                                                                                                                                           |
| F12 real-name echoes                  | **Open**         | Five exact real names in one decade                                                                                                               |
| F13 chronicle trivia                  | **Partly**       | Game-1 stories gone; new problem with farewells (F3)                                                                                              |
| F14 compacted rating history          | **Open**         | New F11                                                                                                                                           |
| F15 stale rivalry table               | **Open**         | New F13                                                                                                                                           |
| F16 record inflation                  | **Partly**       | Only team threes still inflates                                                                                                                   |
| F17 copy nits                         | **Partly**       | Westbrook "SF" remains                                                                                                                            |

**New and good:** the all-time table, the 73-9 chase (`winsBar` in `records.ts:468`, code only), and the full season pages.

**New problems:** the overclaiming leaders caption, the farewell ranking, and the unused `draftHindsight`.

## 5. What it would take to reach 9/10

1. **Seed the franchise past** (F1, F10): real retired numbers, all-time franchise leaders and the real Hall of Fame. This is the biggest "this is the NBA" upgrade.
2. **Make the Hall of Fame mean something** (F2, F7): score the real honours, induct a yearly class after a waiting period, set tiers for coaches, and add a retire-and-be-inducted ending. That gives the long game a goal and an ending.
3. **Add a draft history** (F5): past drafts with hindsight verdicts, using code that already exists.
4. **Fix the league's memory** (F3, F9): Hall of Famers always make the chronicle, every playoff exit gets a card, award cards carry context, and all-time team-season records become stories.
5. **Clean up what fans notice** (F4, F6, F8): fix the team-threes spread, use real coaches or label them fictional, and stop generating real names.

## 6. How I tested, and what I couldn't verify

**UI play:**

- Port 5191, phone viewport 390×844, my own browser profile, driven through the Play menu with `D/drive.mjs`.
- I let the staff make blocking roster decisions; no tactics changes or trades.
- Golden State, real league, Normal, three seasons:

| Season  | Record | Finish                                 |
| ------- | ------ | -------------------------------------- |
| 2026-27 | 44-38  | Won round 1 4-1, lost Game 7 to Denver |
| 2027-28 | 40-42  | Out in the play-in                     |
| 2028-29 | 40-42  | Out in the play-in                     |

- Each season I screenshotted every big moment plus Today, Growth, News, Awards, every History tab, the season page, Career, the review and Owner. Logs are in `D/drive.out` and `D/drive2.out`.

**Headless:**

- `D/decade.ts` builds a real league with `history.json` and `records.json` loaded the same way the app's `seedLoader` does.
- Decade A: Brooklyn, seed 7, 10 seasons in 269 s. The user was fired in year 9 and moved to Orlando.
- Decade B: Golden State, seed 99, 9 seasons logged.
- I imported the year-10 save through Import backup and screenshotted the History tabs, season pages, Career and four player pages (`S/y10-*`).
- `D/aging.py` computes the aging curve and draft-class outcomes; `D/tpm.py` measures the three-point spread.
- All timings are under shared load.

**Not verified:**

- Title and lost-Finals cards: I won no title in the UI.
- Trade grades on Career: I made no trades.
- Being fired in the UI: only headless.
- Live games.
- The 73-9 chase copy on screen: code only.
- BBGM's real-league retired numbers: from my own knowledge of BBGM, not checked.

No repo changes (`git status` is clean). I deleted both browser profiles; the year-5 and year-10 saves are still in `D/saves/`.
