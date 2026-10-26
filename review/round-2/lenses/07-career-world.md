**Hoops Career: `career-world` review, round 2 (seasons 3, 5 and 10)**

## 1. Verdict

**Score: 7/10, up from 6.** The world now tells its stories to you while you play. The biggest problems are still open: the real league starts with no past, so seasons 5 and 10 look like season 1, and ten years leave you a win-loss record and a wall of Coach of the Month badges.

In four UI seasons with OKC (titles in years 1 and 3) and two with Utah (a losing team), 33 moments took the screen:

- your coach's first win and 100th win, a comeback from 40 down, a franchise record;
- an owner's verdict every season, with a Full review button;
- Hall of Fame inductions and legends' farewells;
- each title, with a column calling the second one "a second title in three years for the Thunder".

What isn't working:

- The real league has no history, so **LeBron's Hall of Fame card says "an All-Star selection in this league"** and Kawhi's Hall of Fame chips read "All-NBA · Player of the Month".
- The **title screen is the same logo and one sentence** for the first title as for a Game 7 buzzer-beater title.
- Today in year 10 uses the same preseason template as day one.
- After ten years the GM side of your career leaves nothing behind.

The archives are now good enough to browse; what's missing is mostly what you put into them and how much they say.

## 2. What's genuinely great (protect these)

**Moments fire for good and bad teams alike.** The occasion layer now reaches long sims:

- After a month-long sim, "While you were away" opens with **"The moment of the stretch · From 15 down, Thunder come back on Celtics"** (`okc31-03-Sim1month-after.png`).
- As the Jazz (30-52) I still got:
  - "Rev Coach gets his first win";
  - "From 40 down, Jazz come back on Wizards";
  - "Franchise record · 45 points Lauri Markkanen";
  - "A first playoff berth for Rev Coach";
  - the owner's verdict.

**The season review and the owner's verdict.** Each June you get a full-screen "Excellent / Poor" card scored goal by goal, then Today's hero becomes the season review (`2028-draftLottery-today-post.png`). The review page itself (`2027-draftLottery-review.png`) has:

- the owner's goals and the press's prediction;
- the season's best win and best player;
- the breakout ("Jared McCain OVR 74 → 79, 8.0 → 11.9 PTS");
- the records set;
- next season's target.

**Legends are sent off properly.**

- Each one gets his own story: "Kevin Durant calls it a career · 34,826 points in 1,308 games".
- The Hall of Fame class gets a column ("Two go into the Hall of Fame").
- His number is retired in the news ("The Thunder will retire Kevin Durant's No. 35"), then a banner-night story at the next home opener.
- Westbrook's **#0** is now the number OKC retires.
- Retired players get a career-first hero: career per game, "best season 2013-14, 32.0 PTS", teams, "Retired: Thunder No. 35" (`y5-kd.png`).

**History → Seasons pages and the chronicle.**

- Each past season keeps 8-12 headlines plus its farewells, still there in year 10.
- Lines that compare against the save's past work: "Luka Dončić wins his third straight MVP", "Season wrap: back-to-back titles for the Heat".

**Franchise history** (`y5-franchise.png`):

- title banners and retired-number banners;
- every season with seed and outcome;
- franchise leaders that count real seasons back to 2003.

**The league stays healthy over a decade.**

- My seed-7 decade had 7 champions in 10 years (two repeats); `season-test 10` had 6.
- By year 10, 22 of the top 30 players were drafted in the save, from picks #1 to #18 and the second round.
- Real stars age out believably; the Hall of Fame reached 17 inductees with 17 numbers retired.

**Development you can follow.** My #5 pick, Kobe Williams, went 84 → 91 → 94 → 96. Every step showed up in the staff's monthly mail, the review's "Breakout" line, All-Star and Player of the Week stories, and his Growth tab's arc and "what moved since last season".

## 3. Findings (most severe first)

`S` below means `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/career-world/shots`.

**F1. The real league still starts with no past, so legends and stars are undersold — P1**

What the player sees:

- History → Seasons on day one: "No champions yet".
- Hall of Fame cards and chips count only honours won in the save:
  - **LeBron: "44,609 points · an All-Star selection in this league"** (`S/moment-003-2028-resign.png`).
  - KD's page shows a single chip, "All-NBA" (`S/y5-kd.png`).
  - Kawhi's row: **"All-NBA · Player of the Month"**. Embiid's row has no chips at all (`S/y5-hof.txt`).
  - Jokić at year 10: "Champion, All-NBA, 3× All-Star, 3× All-Star MVP", with no MVPs (`S/y10-jokic-ov.txt`).
- Headlines get the count wrong for an NBA fan: **"Shai Gilgeous-Alexander wins his second in four seasons MVP"** (`S/2030-draftLottery-season-page.txt`), when the real SGA already had two MVPs before the save began.
- OKC's banners start empty, though the save's own players are the 2025 champions.
- There is also no defending champion. The seed's 2026 playoff lines show SAS (23 playoff games) and NYK (19) as the 2026 finalists, but nothing in the app knows it.

Cause:

- `seed.json` players have no `awards` field.
- `history.ts` header: "a real league opens without the NBA's past".
- `accolades` (`src/ui/league/shared.tsx:~295-302`) still lists Player of the Week and Player of the Month.

The data partly exists already: the game files hold every playoff run since 1996-97, and the build already scrapes Basketball Reference.

Fix (M):

- Seed champions and Finals results from the game files.
- Seed MVP, Finals MVP, DPOY, ROY, All-NBA and All-Star awards from Basketball Reference into `p.awards` with a `real` flag, plus franchise title banners.
- Drop weekly and monthly honours from Hall of Fame and legend chips.

**F2. Ten years in, your career shows wins and losses and a wall of Coach of the Month badges; the GM leaves no trace — P1**

- Career at year 10 (`S/y10-career.png`): **20 honours, 14 of them Coach of the Month**, laid out as the same trophy tiles as the two titles.
- There is nothing about who you drafted or developed. My #5 pick who became a 96 OVR superstar appears nowhere on Career.
- There is no list of the All-Stars or award winners you coached, and no coach retirement or finale.
- The `cabinet()` scope (`legacy.ts:748`) is unchanged, and Career.tsx has no players section.

Fix (M):

- Add a "Your players" block: draftees with their peak OVR and honours, the biggest growth under you, and the All-Stars, MVPs and Finals MVPs you coached.
- Collapse Coach of the Month into one "14× Coach of the Month" tile.
- Add "Retire" with a final career page.

**F3. The title moment doesn't grow with history or drama — P1**

- **Year 1:** "Champions · The Oklahoma City Thunder win the title, 4-0 over the Pistons."
- **Year 3:** the same card for "4-3 over the Magic" (`S/moment-010-2027-draftLottery.png`). That title was a **Game 7 won 111-110 on a Holmgren basket with 1 second left**, and the game story's headline was just "Thunder are champions" (`S/2029-draftLottery-news-post.txt`).
- The column did say "a second title in three years". The moment (`src/ui/moments.ts:600-609`) never calls `titleLine`, and it names no Finals MVP and no count of your titles.

Fix (S):

- Feed `titleLine` and the Finals MVP into the moment.
- Add "Rev Coach's 2nd title".
- When the clincher was Game 7, a buzzer-beater or a comeback, let the game story's category lead the headline.

**F4. Year 5 and year 10 still look like year 1 — P1** (open since the last review)

- Today's preseason screen in 2030-31 and in year 10 (`S/y5-today.txt`, `S/y10-today.txt`) is the same "Preseason / The owner expects" hero as on day one.
- It doesn't mention:
  - the defending title or the dynasty;
  - your tenure ("Year 5 with the Thunder · 2 titles");
  - your superstar's arc;
  - the next milestone ("300 wins: 75 to go");
  - anniversaries of your own titles.

Fix (S): Add a kicker line to the preseason hero, plus one "this season's story" line built from `titleLine`, `droughtLine` and the chronicle.

**F5. Two templates garble the copy, and a third repeats every month — P2**

The two template bugs:

- **MVP headline:** `awards.ts:275` builds `${name} wins ${again} MVP`. That gives "VJ Edgecombe wins his second in three seasons MVP" (decade chronicle 2036, and 2030 in the UI). The headline is kept for good in the chronicle.
- **All-Star moment:** `moments.ts:258` builds `, ${again} selection`, which produced "makes the All-Star team, his second in three seasons selection" (run log, 2029).
- **The same template on Today:** `today/occasions.ts:67` builds `, ${again} time`, which would give "…, his second in three seasons time for the Thunder". I didn't see that line on screen; it's from the code.

The monthly growth mails repeat themselves. Kobe Williams's monthly line was the same "A quiet month after a big summer: +3 since last season" at all three check-ins of the season (`devWatch.ts:384`).

Fix (S): Build these as "his second MVP in three seasons", and stop repeating the monthly lines.

**F6. Development copy still contradicts itself — P2** (same as the old F12)

- **Wrong timing:** On opening day, preseason rows say "Steady this month", "Quiet month, big year" and "A quiet month after a big summer" before any month has been played (`S/2028-preseason-growth.txt`; `devWatch.ts:381-386`).
- **Tier and sentence disagree:** `potentialText` (`devWatch.ts:291`) still uses 89/82/76/70 cut-offs, so Kobe's page shows the tier "Superstar" over the sentence "an All-NBA player at 99" (`S/y5-kobe.png`).
- **Rookies left out of the summer report:** `devSummer` skips anyone without last season's end snapshot. Kobe's jump from a #5-pick rating to 84 OVR by opening night was never reported (`devWatch.ts:716-722`).

Fix (S):

- Say "over the summer" in the preseason.
- Build `potentialText` from `tierLabel`.
- Report rookies measured from draft night.

**F7. Legends lose their arc, and their peak badge is wrong — P2** (same as the old F5)

- `compactRetired` (`season.ts:798-803`) still cuts rating history to the peak and the last season. Jokić's career arc at year 10 is two points, '28 and '33 (`S/y10-jokic.txt`).
- The Hall of Fame "peak" badge reads **LeBron 81** and KD 86 (`S/y5-hof.txt`).
- The LeBron Hall of Fame card shows **#32**, the number the game handed him when he joined the 76ers, where #23 was already taken. His page says #23 (`S/moment-003-2028-resign.png`).

Fix (S):

- Keep `{season, ovr}` for every season (a few bytes).
- Label the badge "peak in this league", or hide it for seeded veterans.
- Show his main team's number on the card.

**F8. Past seasons are still shallow pages — P2**

- A season page (`S/y10-s2028.txt`) has 8-12 headlines and the winners. There's no bracket, though the chronicle keeps every series (`History.tsx:153-240` never reads `c.series`), no standings and no stat leaders.
- Old headlines stop opening once the news is pruned, which is about a season later. Nothing on the year-10 season pages can be tapped except your own review.

Fix (M):

- Render the stored series as a bracket.
- Keep the final standings top line per conference and the scoring, rebounds and assists leaders (a few hundred bytes).
- Keep each story's first sentence as a dek.

**F9. The chronicle picks trivia over moments people remember — P2**

What the kept stories looked like:

- In 2026-27, "Rev Coach gets his first win" and "Early verdicts: Hawks up, Bucks down" were kept. SGA's **67-point league record** wasn't.
- The decade save kept "Losing streak hits 5 for Clippers", "Clippers end 7-game skid", "Bucks edge Jazz 109-105 at the finish" and "Mara takes the West's rookie of the month honor".

Why:

- Your team's 3 slots (`MINE_MAX`, `chronicle.ts:14`) go to milestones by weight.
- League records don't get bonus weight in your own games.

The book gate (`moments.ts`: `season <= book.since` returns none) also meant the 67-point night was never a moment.

Fix (S):

- Rank your team's slots by kind: records first, then playoffs, then milestones.
- Never keep losing streaks or weekly and monthly honours.
- Let a 60-plus-point game be a moment even in the first season.

**F10. Banner night at your own arena can age out unseen — P2**

- KD's #35 went up at OKC's 2029-30 home opener. The news has the story, "The Thunder retire Kevin Durant's No. 35 · Oct 20".
- No jersey moment took the screen. The next sim ran past the Cup knockouts, and waiting moments expire after `WAIT_DAYS = 21` (`moments.ts:199, 210`).

Fix (S): Exempt `jersey` and `farewell` moments from the 21-day expiry, or show them first in the next digest.

**F11. The real league's rivalry history is a season out of date — P2**

- `REAL_SERIES` (`gameStory.ts:977-998`) hardcodes the 2025 playoffs.
- The seed already has the 2026 playoff lines, with SAS and NYK in the Finals.
- The heat lookup `[2.5, 1.5][league.season - s.season - 2]` gives 1.5 in season one, not the 2.5 its comment promises.

Fix (S): Derive the series from the seed's last postseason, and fix the index.

**F12. The record book's league marks fall every year — P2** (owned by the sim-credibility lens)

- In the decade save, the team points record went 161 → 167 → 168 → **177**, and the team threes record 28 → 29 → 31 → 32.
- 72-point games happened twice.
- "League record" stories become routine and stop meaning anything.

**F13. AI coaches are invented, and the carousel hires mostly unknowns — P2** (same as the old F15)

- No real coaches, so "1st in wins of 30 head coaches" after year 1 is trivial (`S/2027-draftLottery-coaches.png`).
- In the 2029 UI summer, 7 coaches were fired and **all 7 hires were "a first-time head coach"** (`S/2029-draftLottery-news-post.txt`).
- In year 1, 5 of 30 coaches were fired after a single season.
- The decade save looked healthier (4 of 5 rehires in 2030).

Fix:

- Seed the real coaches.
- Or say in-game that the coaches are invented, and only rank the user against coaches with at least 2 seasons.

**F14. Coach of the Month dominates the cabinet and the career honours list — P3**

This is the same root as F2. The Profile tab's honours list puts Coach of the Month between "Champions" and the NBA Cup (`S/2028-draftLottery-career.txt`).

**F15. A title season reads "fired" in the review list — P3**

- In the headless decade save, the coach went 73-9, won the 2030 title, and was fired over the books.
- The career list row reads "2029-30 · 73-9 · fired · −40" with no mention of the title (`S/y10-career.png`).

Fix (S): Show "Won the title · fired".

**F16. The Hall of Fame bar is low for in-save careers — P3**

- Jarrett Allen (3 All-Stars, 2 All-NBA, 2 rings in the save) is a Hall of Famer, and Cleveland retired his #31.
- Markkanen (8 All-Stars in the save) got in too, and Boston retired his #23.
- The line is 22 in-save points (`season.ts:361-362`). Recheck it once real awards are seeded (F1).

**F17. Small presentation issues — P3**

- The career record still wraps on a phone ("225-" over "103") (`S/y5-career.png`).
- A Rookie of the Month moment for your player repeats every conference winner in its subhead.
- News items carry a "🏆" emoji, off the house style.
- Generated surnames echo current stars ("Zion James", "Johannes Hartenstein", "Jock Thybulle"). Exact duplicates are now 0, but 34% of generated players share a current player's surname.

**F18. Save size — P3** (cross-lens: market-platform)

- My decade save was 10.0 MB of JSON at year 10.
- `season-test`'s save grew from 7.2 MB to 10.0 MB over the decade.

## 4. Since the first review

| First-round finding                               | Status now                          | How I checked                                                                                                                                                |
| ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 moments never fire                             | **Fixed**                           | 21 moments in OKC seasons 2-4, 12 as the Jazz; the digest leads with "The moment of the stretch"                                                             |
| F2 record buried, headline credits the other team | **Partly fixed**                    | Record headlines now lead in code (`dekOf` rec-; `records.ts:318` front page). SGA's season-1 67 points still got no moment and wasn't kept in the chronicle |
| F3 no real history                                | **Open** (F1 above)                 | Weekly and monthly honours still appear as Hall of Fame chips                                                                                                |
| F4 the press forgets                              | **Largely fixed**                   | The chronicle, `titleLine`, `awardLine`, rematches and anniversaries exist, and dynasty lines appear in columns; new copy bugs (F5)                          |
| F5 legend pages open on the worst season          | **Fixed** for the hero and overview | Arc compaction and the peak badge are still open (F7)                                                                                                        |
| F6 GM legacy missing                              | **Open** (F2)                       |                                                                                                                                                              |
| F7 season review isn't a ceremony                 | **Fixed**                           | Owner's-verdict moment for winners and losers, review as Today's hero                                                                                        |
| F8 legends get one line                           | **Fixed**                           | Individual farewells, Hall of Fame class column, banner-night story; the banner moment can expire (F10)                                                      |
| F9 Westbrook #18                                  | **Fixed**                           | #0 retired at OKC                                                                                                                                            |
| F10 past seasons are dead rows                    | **Partly fixed**                    | Season pages exist; still no bracket or standings, and old stories don't open (F8)                                                                           |
| F11 year 5 = year 1                               | **Open** (F4)                       |                                                                                                                                                              |
| F12 dev copy                                      | **Open** (F6)                       |                                                                                                                                                              |
| F13 short memory                                  | **Improved**                        | Every review is kept (`legacy.ts:719-721`); the pulse chart is kept for 10                                                                                   |
| F14 name duplicates                               | **Mostly fixed**                    | 0 exact matches; surname echoes remain (F17)                                                                                                                 |
| F15 invented coaches                              | **Open** (F13)                      |                                                                                                                                                              |
| F16 no coach career end                           | **Open**                            | No Retire on the Career page                                                                                                                                 |
| F18 dev coaching rank frozen                      | **Fixed**                           | It moves now (12th → 14th)                                                                                                                                   |
| F19 record labels                                 | **Partly fixed**                    | There's a "?" explainer; the career block still says only "Career"                                                                                           |
| F21 save growth                                   | **Unchanged**                       |                                                                                                                                                              |

New problems from the recent rounds: the copy bugs (F5), the stale `REAL_SERIES` (F11), banner moments expiring (F10) and the chronicle's choice of stories (F9).

## 5. Top 5 moves

1. **Seed real history (F1, F11).** Champions, Finals results, awards and title banners. Every Hall of Fame card, farewell and "his Nth MVP" line becomes true for NBA fans on day one. This is the biggest gain in credibility.
2. **Give the GM a legacy (F2, F14).** "Your players", a cabinet without the Coach of the Month clutter, and a retirement finale. This answers "what do I have to show for 10 years".
3. **Make big moments say what they are (F3, F9, F10).** Dynasty and Game 7 lines on the title card, records ahead of trivia in the chronicle, and banner nights that never expire. Long saves would then remember their best nights.
4. **Make year N feel like year N (F4).** A tenure and history kicker on Today plus one story line for the season, which is cheap.
5. **Fix the copy bugs (F5, F6, F7).** About an hour of fixes to lines that are otherwise kept for good in the chronicle.

## 6. How I tested, and what I couldn't verify

**UI play.** All on a 390×844 phone viewport, through the Play menu, with staff picks for blocking roster decisions and "Keep the plan" on series calls.

- OKC, real league, Normal difficulty, 4 seasons and offseasons: 66-16 with a title, 55-27, 55-27 with a Game 7 title, 49-33.
- Utah, 2 seasons: 30-52, then 34-48 and the play-in.
- I screenshotted every moment, Today, Growth, Awards, News, History (Seasons, Teams, Records, Hall of Fame, Coaches), season pages, Career and reviews, Owner, Inbox, Draft and Re-sign each season, plus KD's, LeBron's, SGA's and Kobe Williams's pages.

**Headless.**

- `npx tsx scripts/season-test.ts 10` (NYK, seed 42).
- My own `decade.ts` (OKC, seed 7), saving the league at years 1, 5 and 10, analysed with `analyze.mjs`.
- The year-10 save imported into the app through Import backup to screenshot year-10 Career, History, legends and Today (`S/y10-*`).

**Not verified:**

- Live games and the draft-pick moment with a manual pick.
- All-Star Saturday's screen in detail.
- A coach fired in the UI (only headless).
- Whether a jersey moment shows on a short sim right after the opener.
- The year-1 headline of the 67-point game, which had already been pruned from the news.

Scripts, logs and saves are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/career-world/`. I made no changes to the repo.
