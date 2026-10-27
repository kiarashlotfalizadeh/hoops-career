## Hoops Career, round 3: `career-world` lens (seasons 3, 5 and 10)

### 1. Verdict

**Score: 7.5/10, up from 7.** Most of what round 2 asked for has shipped:

- the real NBA past is seeded;
- title cards know the drama and the franchise's history;
- Career now carries a GM legacy (your draftees, title cores, honours, a Hall of Fame case);
- Today's preseason has a tenure card;
- banner nights and Hall of Fame inductions now take the screen.

In three UI seasons with OKC (73-9 and a title in year 1, 61-21, a second title in year 3), the game remembered my titles back to me well: "A second title in three years… Kia Coach's first title".

What keeps it from FM- or BBGM-grade long saves:

- **Records:** the record book and the press don't use the NBA past the app now has. A 60-point night is "a league record", and a 45-point night is "a Bulls record".
- **Past seasons:** they are still pages of headlines, with no bracket or standings.
- **Hall of Fame:** the player formula ignores the real honours now seeded, and the coach's bar is cleared in year 3.
- **Today in year 11:** for anyone without a title, it differs from year 1 by one line ("500 wins: 40 to go.").

### 2. What's genuinely great (protect these)

**The seeded past is used, not just shown.**

- History opens on "2025-26 champions · defending · Knicks · 3 titles" with all 80 champions listed.
- The press reads that past back:
  - "Shai Gilgeous-Alexander wins his fourth straight MVP" (decade chronicle, 2028);
  - "The 76ers win a first title since 1982-83";
  - "a first title since the 1977-78 Bullets for the Wizards";
  - "The Clippers win the first title in franchise history".

**Legends' pages are BBGM-level.**

- LeBron's Stats tab has every real season from 2003-04, marked "real", with advanced stats. His career highs include "61 Points vs CHA · Mar 3, 2014" (`shots/y4-lebron-stats.txt`).
- His honour chips are right: "4× Champion, 4× MVP, 4× Finals MVP, 21× All-NBA, 22× All-Star". Curry, KD, Jokić and SGA are right too.
- At year 10, Jokić's page reads "Retired: Nuggets No. 15 · 3× MVP".

**The title card.** `moment-009-2027-draftLottery.png` reads "Champions · 4-1 over the Celtics · A second title in three years · Finals MVP Shai Gilgeous-Alexander · 36.8 pts · 7.0 reb · 8.4 ast · Kia Coach's first title". The code behind it (`src/ui/moments.ts:586-656`) has headlines for a three-peat, back-to-back, a comeback from 3-1, a Game 7 and a sweep, plus a card for a lost Finals.

**Send-offs.**

- LeBron's Hall of Fame card: "44,447 points in 1,685 games · four titles, four MVPs…" (`moment-012-2027-resign.png`).
- KD's and Kawhi's induction cards.
- Westbrook's and KD's banner nights both took the screen at the home opener. The round-2 expiry bug did not recur.

**The GM legacy on Career** (`2029-draftLottery-career.txt`):

- the Hall of Fame case;
- each title's core;
- "Jamir Mason · Drafted #24 in 2027 · ROY · OKC · 81 peak";
- your players' honours, signature wins and every season's review;
- Coach of the Month collapsed to one tile ("8× Coach of the Month").

**Development is visible.**

- Team → Growth has "The one to watch", Rising and Holding groups, a Rookie watch and "Breakouts around the league".
- A player's Growth tab has an arc and "What moved since last season".

**The rest of the archive works.**

- The coaching carousel and its history page (`y10-coaches.txt`) have retired coaches, stints and titles.
- Franchise pages have real franchise leaders ("R. Westbrook · 11 seasons here · 18,859").
- The season review and the owner's verdict are good.

**The league turns over.** By year 10 the MVPs are drafted in the save (Darryn Peterson, Jeremiah Fears), and the decade had 9 different champions in 10 years. Saves grow about 0.5 MB a season: 5.7 MB in year 1, 10.1 MB in year 10. A year-10 import opened instantly.

### 3. Findings (most severe first)

`S` = `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/career-world/shots`

**F1. The record book and the press ignore the NBA past the app now seeds — P1**

What the player sees:

- **Year-1 chronicle:** "Jayson Tatum sets a league record: 60 points" (`S/y4-s2027.txt`), in a league whose History page lists every champion since 1947.
- **News lines:**
  - "Josh Giddey (CHI): 45 points (a Bulls record)";
  - "Amen Thompson: 46 points (a Rockets record)";
  - "Tristan Daniels: 52 points (a Knicks record)";
  - "Shai Gilgeous-Alexander: 18 assists (a league playoff record)";
  - "Raul Caboclo: 68 points (a Warriors playoff record)".
- **Career block on Records:** it presents LeBron as the all-time rebounds leader ("12,486") with no "since" label (`S/2027-draftLottery-records.png`).
- **73-9:** my season tied the NBA's best-ever record and nothing noticed. The milestone said "70 and still going… A first 70-win season for Kia Coach".

Cause:

- The book starts empty at `records.since` (`records.ts:283`).
- The news copy drops the qualifier that the Records page and the record moment use ("the most in a game since 2026-27").

Why it matters: this contradicts the real past the app just added, and fans notice it first.

Fix (M):

- Seed the book's single-game and franchise marks from the game files (`data/raw/games`, every game since 1996-97; `realHighs` already reads them).
- Add a small all-time table: Wilt's 100, Kobe's 81, 73-9, 72-10.
- Until then, write "the most since 2026-27" in the news and label the Career block "players in this league".

**F2. Past seasons are still shallow pages — P1** (round-2 F8, still open)

A season page has a champion slab, about 12 headlines, 5 winners and your season. It has no bracket, no standings and no stat leaders (`S/y10-s2030.txt`).

- The chronicle stores 15 series per season, but no UI file reads `series`. `History.tsx:234-340` renders only stories.
- Seasons played in the save lose the series score that pre-league rows show: "Nets def. OKC" next to "Knicks def. Spurs 4-1" (`S/y10-seasons.txt`).
- Story logos are wrong: "The Thunder win a third title in six years" and Kawhi's farewell carry the **SAS** logo on the user's Spurs save. The cause is `x.tids.find(t => t === league.userTid)` (`History.tsx:285`).

BBGM's season page has standings, a bracket and awards.

Fix (M):

- Render the stored series as a bracket.
- Build the standings from `team.seasons`.
- Keep the scoring, rebounds and assists leaders.
- Add the series score to the rows, and use the story's subject team for the logo.

**F3. The Hall of Fame formula ignores the real honours now seeded — P2**

- Out: Gobert (4× DPOY, 4× All-NBA) and Klay Thompson (4 titles) (`S/y4-hof.png`).
- In: Jimmy Butler, Desmond Bane and Jamal Murray (decade save, year 10).
- Cause: `hallOfFameScore` (`season.ts:405-408`) counts awards only from `startSeason` on, and `preLeagueLegacy` uses box production alone.

The coach's bar is too low too:

- "2 titles, 187 wins (.760)… The press has him in." arrived in year 3 (`S/2029-draftLottery-career.txt`; `legacy.ts:927-935`).
- After that the long game has no aspiration left.

Fix (S):

- Score the seeded pre-league honours with `HOF_POINTS`.
- Raise the coach bar (for example 3 titles, or 2 titles and 500 wins), or add tiers ("first-ballot").

**F4. Award moments are flat and don't use the history — P2**

- "MVP · Shai Gilgeous-Alexander takes the award." (`moment-005`) on the day the news said "his third straight".
- "Rookie of the Year · Jamir Mason takes the award." never says he was your #24 pick.
- A second "Finals MVP … takes the award" moment arrives at the draft (`moment-011`, `moment-030`), repeating the title card.

Code: `moments.ts:719-733`.

Fix (S):

- Reuse `awardLine` for "his third straight" or "his 4th".
- Add "your #24 pick" for draftees.
- Drop the Finals MVP moment when the title card has already named him.

**F5. Banner-night cards show the wrong jersey number — P2** (bug)

- Westbrook's card says "No. 0" over a **#55** jersey (`moment-022-2029-regular.png`).
- KD's says "No. 35" over a **#7** jersey (run2 log).
- Cause: `MomentCard` draws `<Avatar p={p}>` (`Moments.tsx:162`), which shows the player's last number, not the one going up.
- On the title card, SGA's "2" jersey sits next to "A second title" and reads like a title count.

Fix (S): Pass the retired number to the avatar, and use the team logo on title cards.

**F6. The tenure card is thin for anyone without a title — P2** (round-2 F4, partly fixed)

- OKC with titles: "Year 4 with the Thunder · Two titles. Defending champions. 200 wins: 13 to go." That one is good.
- Spurs, year 6, after 287-123 with 5 playoff trips and 2 conference finals: "300 wins: 13 to go." (`S/y5-today.txt`).
- Spurs, year 11: "500 wins: 40 to go." (`S/y10-today.png`).
- Cause: `tenure.ts:37-81` counts only titles, Finals losses and droughts.

Fix (S):

- Add playoff streaks, best runs ("three conference finals"), the franchise player's arc and last season's exit.
- Show a rebuild clock after a losing stretch.

**F7. Playoff exits get no moment — P2**

- The defending champions went out in the 2nd round in 2028; OKC lost in the 1st round in 2030 and 2031.
- None of these got a card, only the owner's verdict. Only a lost Finals has one (`moments.ts:671`).
- Long saves need their heartbreaks as much as their titles.

Fix (S): Add a quiet "Season over" card with the series score and the deciding game.

**F8. The coaches are invented in a real league — P2** (round-2 F13, open)

- OKC is coached by "Darnell Radcliffe", PHI by "Sam Whitfield".
- Coach of the Year history and "1st in wins of 30 head coaches" rank you against fiction.

Fix (M): Seed the real coaches, or label the coaches "fictional" and rank you only against coaches with 2+ seasons.

**F9. Franchises' real retired numbers are missing — P2** (new)

- At year 10 the Spurs' banners are the five titles and **only Kawhi Leonard's #2**, retired in the save. There is no Duncan, Robinson, Ginóbili or Parker (`S/y10-franchise.txt`).
- Banner chips mix formats: "1979 SuperSonics", "2025", "2026-27 champions" (`S/y4-franchise.png`).

Fix (S/M): Add the retired numbers to `history.json`, and use one label format.

**F10. No way to end a career — P2** (open since round 1)

- Career and Settings have no Retire or step-down option (grep finds none).
- After "The press has him in", nothing caps the story. FM has retirement; a final career page plus a coach Hall of Fame induction would close it.

Fix (M).

**F11. Development copy still contradicts itself, and drops come without a why — P2** (round-2 F6, open)

- On opening day: "Quiet month, big year: +5 since last season" (`S/2028-preseason-growth.txt`; `devWatch.ts:384`).
- Jamir Mason, ROY at 24, fell 81 → 78 (stamina −4, shot blocking −3). His page says "Still improving, especially skills and decisions." and "Still climbing toward his peak", with no reason given (`S/y4-mason-growth.png`).

For a game whose pitch is "why", an unexplained drop hurts.

Fix (S):

- Say "a down summer: summers swing about ±3".
- Say "over the summer" in preseason.
- Gate the outlook sentence on the sign of the change.

**F12. Generated names echo real players — P2/P3** (round-2 F17, open and worse)

- One is an exact former NBA player: **"Raul Neto"**.
- Others are near-copies: "Raul Caboclo", "Moritz Hartenstein", "Lukas Hartenstein", "Mantas Valančiūnas", "Femi Adebayo", "Emanuel Nembhard", "Carter Alexander-Walker", "Nathan Alexander-Walker", "Giannis Kalaitzakis".
- "Kristian Landale" won Rookie of the Year in 2036.
- 63 of 417 generated players share a 7+ letter surname with a seeded player.

Cause: country name pools (`names.ts:447, 512, 518, 524, 549`).

Fix (S): Drop famous surnames from the pools and filter against the seed plus a list of retired players.

**F13. The chronicle keeps trivia in your team's slots — P3** (round-2 F9, partly fixed)

- Kept: "Spurs drop one to Mavericks", "Spurs fall behind 0-1", "Lakers take 1-0 lead on Spurs" (decade 2030-2036).
- Duplicates: "Tatum goes for 60" next to "Jayson Tatum sets a league record: 60 points".
- Records now lead, which is improved.

Fix (S): Never keep Game 1 or Game 2 states or single losses, and merge a game with its record story.

**F14. Legends' career arcs are cut to two points — P3** (round-2 F7, open)

Jokić's arc at year 10 has two points: '27 and '33 (`S/y10-jokic-growth.txt`). Cause: `compactRetired` (`season.ts:793`).

**F15. The real-league rivalry table is a season stale — P3** (round-2 F11, open)

`REAL_SERIES` is still the 2025 playoffs, and the heat index is still off by one (`gameStory.ts:981-1004`), while `history.json` already knows the 2026 Finals (NYK–SAS).

**F16. Records inflate past the real game's — P3** (sim-credibility owns it)

- Team threes: 38. Team points: 178 (2036).
- A 68-point playoff game, above Jordan's 63.
- 62-point margins.
- Ten 56+ point nights in five seasons.

**F17. Copy nits — P3**

- The owner's verdict "Short of it" over the quote "I'm pleased.".
- "Add nothing to the payroll you inherited" in year 2.
- The Finals MVP's line differs between the title card (31.7 pts) and the Awards page (37.4, his whole playoffs).
- Franchise footnote "the figures above, this league's seasons only" sits under Westbrook's real 18,859.
- "1st in wins of 30 head coaches · 1st by win% of 28".
- Signature wins for a 73-9 team are 77-86% closeouts.
- Hall of Fame rows list Westbrook as "SF" and DeRozan as "PF".

### 4. Since round 2

| Round-2 finding               | Status                     | How I checked                                                                                                                                                             |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 no real past               | **Fixed**, with a gap      | 80 champions, defending NYK, real honour chips, "fourth straight MVP" and "first since 1982-83". The gap: the Hall of Fame formula and the record book ignore it (F1, F3) |
| F2 GM leaves no trace         | **Fixed**                  | Draftees with peak and team now, title cores, players' honours, Coach of the Month collapsed. Retire is still missing (F10)                                               |
| F3 flat title card            | **Fixed**                  | `titleLine`, Finals MVP line and coach's count on screen; drama headlines in code. A Game 7 card wasn't seen live                                                         |
| F4 year N = year 1            | **Partly**                 | Tenure card ships; thin without titles (F6)                                                                                                                               |
| F5 garbled templates          | **Fixed**                  | "wins his fourth straight MVP", "his eighth straight selection"                                                                                                           |
| F6 dev copy                   | **Open**                   | F11                                                                                                                                                                       |
| F7 arcs and peak badge        | **Partly**                 | Card shows #23 and the badge is footnoted; arcs still compacted (F14)                                                                                                     |
| F8 shallow seasons            | **Open**                   | F2                                                                                                                                                                        |
| F9 trivia kept                | **Partly**                 | 60-point nights and records now kept; Game 1 stories remain (F13)                                                                                                         |
| F10 banner moment expiry      | **Fixed**                  | Westbrook and KD banner nights took the screen; new jersey-number bug (F5)                                                                                                |
| F11 stale `REAL_SERIES`       | **Open**                   | F15                                                                                                                                                                       |
| F12 record inflation          | **Open**                   | F16                                                                                                                                                                       |
| F13 invented coaches          | **Open**                   | F8                                                                                                                                                                        |
| F15 "fired" on a title season | Not reproduced             | No firing in my runs                                                                                                                                                      |
| F16 low Hall of Fame bar      | **Open**, now inconsistent | F3                                                                                                                                                                        |
| F17 name echoes               | **Worse**                  | An exact real name (Raul Neto) and a ROY "Landale" (F12)                                                                                                                  |
| F18 save size                 | Unchanged and fine         | 10.1 MB at year 10                                                                                                                                                        |

New since round 2: the jersey-number bug (F5), Finals MVP shown twice, wrong story logos, the missing real retired numbers, and the 2-title coach Hall of Fame bar arriving in year 3.

### 5. What it would take to reach 9/10

1. **Make the record book know the real past (F1).** Seed it from the game files plus an all-time table. "His 61 breaks Melo's Knicks record" is the kind of line that makes a real league feel real; today the app tells fans wrong facts.
2. **Turn season pages into almanac pages (F2).** Add the bracket from the stored series, standings, leaders and series scores. This is BBGM's core long-save pleasure, and it is cheap because the data is mostly stored already.
3. **Give careers aspiration and an ending (F3, F10).** Count seeded honours in the Hall of Fame, set coach tiers, add retirement with a finale and induction.
4. **Make each year read as that year (F6, F7, F4).** A richer tenure card, a "season over" card for playoff exits, history-aware award moments.
5. **Polish what fans notice (F5, F8, F9, F12).** Correct jersey numbers, real retired banners, no real-name echoes, and real coaches or an honest "fictional" label.

### 6. How I tested, and what I couldn't verify

**UI play** (390×844 phone viewport, my own profile, through the Play menu; staff picks for blocking roster decisions):

- OKC, real league, Normal difficulty, 5 seasons and offseasons:
  - 2026-27: 73-9, won the title and the NBA Cup.
  - 2027-28: 61-21, lost in the 2nd round.
  - 2028-29: 53-29, won the title.
  - 2029-30: 44-38, lost in the 1st round.
  - 2030-31: 49-33, lost in the 1st round.
- I screenshotted every moment, and each season's Today, Growth, News, Awards, History (Seasons, Teams, Records, Hall of Fame, Coaches), season pages, Career (Profile and Milestones), the review, and the pages of LeBron, Curry, KD, Jokić, SGA and my draftee Mason.
- Driver scripts: `drive.mjs`, `snapone.mjs`, `tab.mjs`, `ev.mjs`. Reading the store was for inspection only.

**Headless:**

- `npx tsx scripts/season-test.ts 10`: 7 different champions; 5.45 → 10.05 MB; `scripts/season-test.ts` does not load `history.json`.
- My own `decade.ts`: Spurs, seed 11, with `history.json` added. It saved years 1, 3, 5 and 10. I imported the year-5 and year-10 saves through Import backup into separate profiles and screenshotted them (`S/y5-*`, `S/y10-*`).

Timings were under heavy load: one season took up to 720 s headless.

**Not verified:**

- A lost-Finals card, or a Game 7 or 3-1-comeback title card, on screen (code only).
- Being fired in the UI.
- The trade grading on Career: none of my runs made a trade.
- Live games.

My second UI run (seasons 4-5) stopped silently after the 2030-31 owner's verdict.

Everything is in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/career-world/`. I made no changes to the repo.
