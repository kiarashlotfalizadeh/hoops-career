## Hoops Career: `career-world` lens report (the long game: seasons 3, 5, 10)

The tool refused to write `REPORT.md` because subagents must return reports as text, so the full report is below. Screenshots are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/career-world/shots/`, written `shots/…` below. The logs, the decade analysis and the scripts sit next to that folder.

### 1. Verdict

**Score: 6/10.** The archives and the league's long-run health would earn an 8; the way the game surfaces and remembers stories earns about a 4. Most of the gap is surfacing and copy, not missing systems.

The bones of a great long save are here, and some are better than BBGM's:

- a real record book, franchise histories, a Hall of Fame and retired numbers;
- a coaches' registry with a working carousel and job market;
- a season review written like a ceremony;
- a development watch with breakouts and career arcs;
- a draft pipeline that keeps the league healthy and competitive for a decade.

The trouble is how little of that reaches the player:

- In 5 seasons simmed through the UI, **not one big moment took the screen**: 0 moment overlays in 117 logged sim steps.
- My own player's **62-point league record** got the headline "Booker leads Suns past Jazz". Booker scored 21.
- **LeBron, Durant and Harden retired on the same day in one comma-separated line.**
- The press forgets everything after about a season.
- Legends' pages open on their last, worst season, still showing "Contract" and "Role & usage".
- The real league starts with **no history**: no past champions or MVPs, so Curry's Hall of Fame row says only "All-Star".
- Year 5 looks the same as year 1.
- After 5 years the career page holds a W-L record, six "beat X as a 15% underdog" rows and a list of season reviews. Nothing records what you built as a GM.

### 2. What's genuinely great (protect these)

- **The season review page** (`/office/career?review=<season>`, `shots/fired-review-2029.png`, `shots/y5/review-2031.png`). It's the best long-game screen in the app:
  - the record slab and the owner's verdict, scored goal by goal;
  - a line against the press's pick ("+1 win on the prediction · 15th in the West, picked 15th");
  - the season's best win, best player and breakout, the records set, and the pulse chart.
  - It's stored as a small snapshot (`legacyReview.ts`), so it reads the same years later.
- **The record book** (League → History → Records, `shots/y3/hist-records.png`). It has single-game, season, team-season and career records, for the league and each franchise, regular season and playoffs. Careers include real seasons back to 2003, so "L. James 44,712" is right on day one. This is BBGM-grade.
- **Development you can see.**
  - Team → Growth (`shots/s2028-team-growth-preseason.png`) has "the one to watch", Rising/Holding/Slipping groups, a rookie watch and breakouts around the league.
  - The player Growth tab shows his arc, his climb to potential and what moved.
  - The summer report is the right kind of story: "Jeremiah Fears arrives at camp transformed · Up 7 over the summer to 82" (`shots/s2027-sheet-6.png`).
- **The league stays alive for a decade.** In the headless runs, one decade had 8 different champions in 10 seasons and the other had 9, with a GSW three-peat. Best records stay at 60-68 wins and worst at 10-23. Coaching changes run 2-8 a summer, which looks like the NBA.
- **Real stars age believably.**
  - SGA: 97 at 28, 91 at 33, 83 at 35, retired at 36.
  - Luka: 95 at 27, 82 at 37.
  - Curry retired at 40 and KD at 39; LeBron retired after 2027-28.
  - Wembanyama was still 92 at 33, with 7 DPOYs.
- **Generated players take over smoothly.**
  - By year 10, 16 of the top 25 players are draftees made in the save, from all parts of the draft: Tyson Moore (#19) reached 92 and Eli Jordan (#10) reached 93.
  - Every draft class from 2027 to 2033 had 4-10 players at 80+ OVR by their fourth season, so classes don't get weaker.
- **The coach's slab, rank, signature wins and milestones** ("22nd in wins of 30 head coaches", "has beaten every team in the league") are good ideas with honest numbers.
- **Getting fired and rehired works.** You get the "You're fired" mail, an agent with two offers from the worst teams, and a career that carries across jobs; the app recolours to the new team (`shots/fired-today.png`, `shots/job-career.png`).

### 3. Findings (most severe first)

**F1. In sim-heavy play the big-moment layer never fires: zero moments in a 5-season career — P1**

- **What I saw:** I simmed 5 seasons and offseasons the way the Play menu offers. No moment overlay ever came up.
  - Every result landed in "While you were away" sheets.
  - Those sheets lead with staff calls and a red "6-27 in the stretch" (`shots/s2029-sheet-11.png`).
- **Cause:**
  - `src/ui/components/Moments.tsx:58-63` drops every story moment while the digest is open.
  - The other moment kinds (`src/ui/moments.ts`) only cover clinches, series, titles, the Cup, awards, signings of 80+ OVR, and draft picks on the draft screen, which auto-draft skips.
  - So a losing or middling team never gets one.
- **Why it matters:** The long-save player is the player who sims, and right now he gets none of the occasion layer.
- **Fix (M):**
  - After a long sim, show one "moment of the stretch" card before the digest, picked from records, milestones, breakouts, career nights, jersey retirements and the season review.
  - Give each digest a "Biggest moment" hero.

**F2. A league single-game record by your own player is buried, and the headline credits the other team — P1**

- **What I saw:** On Nov 22, 2028, Keyonte George (UTA) scored **62**, the league record.
  - The game's headline was **"Booker leads Suns past Jazz"**, with the subhead "…Devin Booker had 21 for the Suns".
  - The record itself was a routine news item with no weight (`records.ts:311`) plus one Media Relations mail among 150 in the inbox.
  - It never made the front page and never became a moment. I only found it in the season review, six months later.
- **Fix (S):**
  - Give league records weight 3 (front page) and the user's franchise records weight 2.
  - Let a 50-point game or a record take over the headline.
  - Add a moment for league records by your players.

**F3. The real league starts with no history: no past champions, MVPs, banners or real trophy cases — P1**

- **What I saw:**
  - After year 1, History → Seasons has one row (`shots/s2027-history.png`).
  - Every franchise, the Celtics and Lakers included, shows "Titles 0 · in this save".
  - Hall of Fame chips only count what was won in the save:
    - Curry has one chip, "All-Star". Lillard has none. KD has "All-Star".
    - **Anthony Davis's top chip is "2× Player of the Week"** (`shots/y5/hist-hof.png`).
- **Cause:** `seed.json` carries no awards, champions or retired numbers, and `create.ts:217` sets `awards: []`. `AccoladeChips` (`src/ui/league/shared.tsx:333`) falls back to weekly honours when nothing better exists.
- **Why it matters:** BBGM's real-player leagues ship with full award history.
- **Fix (M):** Seed 2003-04 through 2025-26 from Basketball Reference, which the pipeline already scrapes:
  - champions and Finals MVPs;
  - each player's MVP, DPOY, ROY, All-NBA and All-Star awards;
  - franchise titles and real retired numbers.
  - Also drop weekly and monthly honours from Hall of Fame chips.

**F4. The press remembers about one season — P1**

- **What I saw:**
  - No "defending champions", repeats, dynasties, droughts or "Nth MVP". In the seed-42 decade GSW won three straight and nobody mentioned it; in the seed-7 decade Wembanyama won DPOY 7 times.
  - The awards story is a single line: `Awards: MVP … · DPOY …` (`awards.ts:241`).
  - Grepping `media/`, `gameStory.ts` and `storylines.ts` finds only last-season rematches.
  - News is capped at 600 items (`helpers.ts:175`); in the year-10 save only the latest season's news is left.
- **Fix (M):**
  - Add history lines built from `league.awards` and team seasons, which are kept forever.
  - Keep a per-season **Chronicle** of the top 5-8 headlines forever (about 1 KB a season), shown on History → Seasons.

**F5. Legends' pages open on their worst season — P1**

- **What I saw:**
  - Curry (Hall of Fame) opens with **OVR 71, 11.2 PTS**, then "Role & usage" and "Contract" (`shots/y5/star-StephenCurry.png`). LeBron opens with OVR 79 (`shots/y3/star-LeBronJames.png`).
  - Two summers after retiring, `compactRetired` (`season.ts:798-803`) cuts a player's rating history to two points, his peak and his last.
  - The Hall of Fame "peak OVR" badge therefore reads **LeBron 85, Westbrook 75, KD 90**.
- **Fix (M):**
  - A retired player's hero should show career averages, seasons and honours; hide Contract and Role & usage.
  - Keep `{season, ovr}` for every season, which costs only bytes.
  - Label the badge "peak in this league", or hide it for seeded veterans.

**F6. The coach's legacy is only W-L; the GM half leaves no trace — P1**

- **What I saw:** After 5 seasons and 2 jobs the career page shows 105-305, 0/0/0, six interchangeable underdog wins, and the reviews (`shots/y5/career.png`).
  - `cabinet()` (`legacy.ts:738`) covers titles, conference titles, COY, the Cup and Coach of the Month.
  - Nothing records my 15 draftees, the players I developed, All-Stars I coached, trades, or numbers retired from my era.
- **Fix (M):** Add a "Your players" section to Career, built from `draft.tid`, transactions and awards:
  - every player you drafted, with his peak OVR and honours;
  - the biggest OVR gains made on your roster;
  - All-Stars and awards won under you;
  - your best trade.
  - Add milestones such as "your draftee's first All-Star".

**F7. The season review isn't a ceremony — P2**

- **What I saw:**
  - Each June the digest's "The Jazz in the news" leads with another team's season wrap: "Season wrap: the Cavaliers' year" (2027), "2027-28, wrapped: the Grizzlies on top" (2028), "Season wrap: the Thunder's year" (2029).
  - "Season review · The owner" is the third mail row (`shots/s2027-sheet-5.png`, `shots/s2028-sheet-5.png`).
  - The wrap counts as "about you" because it carries the user's team id (`columns.ts:489`).
  - There's no moment kind for the review.
- **Fix (S):**
  - Fire a once-a-season review moment for every user, champion or 18-64.
  - Make it Today's hero until the draft.

**F8. Legend retirements, Hall of Fame inductions and jersey retirements get one routine line each — P2**

- **What I saw:** The whole 2028 retirement news was: "Retirements: Jimmy Butler (Hall of Fame), Kevin Durant (Hall of Fame), James Harden (Hall of Fame), CJ McCollum, LeBron James (Hall of Fame), DeMar DeRozan (Hall of Fame)."
  - The owner's jersey mail promises the number "goes up to the rafters at the home opener", but nothing at the opener ever does it: "rafters" appears only at `jerseys.ts:190-191`.
- **Fix (S/M):**
  - Give each Hall-of-Fame-level retirement its own front-page story.
  - Run a "Hall of Fame class" column.
  - Bill a jersey night at the home opener.

**F9. OKC retired Westbrook's #18 instead of #0 — P2**

- He rejoined OKC in-season wearing #18 and has no record of his old OKC number, so `numberWith()` falls back to his current one (`jerseys.ts:150-158`).
- **Fix (S):** Seed each player's number per franchise from the bbref roster pages already scraped, preferring the number he wore for most of his seasons there.

**F10. Past seasons are dead rows — P2**

- Franchise season rows don't link anywhere, even to your own reviews (`Franchise.tsx:81-101`), and old box scores are pruned.
- **Fix (M):** Make each row open a season card: roster with per-game lines (already in `p.stats`), coach, outcome, and the review link for your seasons.

**F11. Year 5 looks the same as year 1 — P2**

- **What I saw:** Every preseason hero has the same layout and words (`shots/s2028-today-preseason.png`, `shots/s2029-today-preseason.png`).
  - Taking a new job is only a toast: "Welcome to the Los Angeles Clippers, Coach." (`shots/job-after.png`).
- **Fix (S):**
  - Add a kicker line to the preseason hero: "Year 3 · Last season 28-54 · Career 51-113".
  - Add a "New chapter" moment when you take a job.

**F12. Development copy contradicts itself — P2**

- **Potential tier vs sentence:** POT 85 is labelled "Quality Starter" while the text says "at 85 he would be an All-Star". `potentialText` (`devWatch.ts:291`) uses 89/82/76/70 cut-offs; `tierLabel` uses 93/89/87/82/78/72/67.
- **"Holding" group:** Team → Growth's "Holding" contains players showing ↓2.
- **Wrong timing in preseason:** rows say "Steady this month" right after a summer.
- **Outlook by age alone:** a player at −3 with a falling arc gets "Still improving…" (`GrowthTab.tsx:136-139`, `shots/y5/draftee-568-dev.png`).
- **Fix (S):**
  - Build `potentialText` from `tierLabel`.
  - Group players by the arrow they display.
  - Say "over the summer" in preseason.
  - Write the outlook from age and last season's change together.

**F13. The memory horizon is short everywhere — P2**

- Season reviews keep 10 (`legacy.ts:100`), signature wins 12, the inbox 150 (`helpers.ts:198`), news about a season, and rivalries one season.
- **Fix (S):** Keep every review, and keep the best win of each season forever.

**F14. Generated names duplicate real players — P2**

- In the decade save, 3 exact matches (Christian Koloko, Yves Missi, Thomas Bryant), and 38% of generated players share a current NBA surname ("Joel Missi" won Finals MVP).
- **Fix (S):** Reject exact full-name matches and cap surname reuse.

**F15. The AI coaches are invented and start at 0-0 — P2**

- OKC is coached by "Eric Mancini" and Cleveland by "Glenn Olander" (COY), so "22nd in wins of 30 coaches" is measured against this save only.
- **Fix:** Seed the real coaches and their real career records, or explain the invented names if they're deliberate.

**F16. The coach's career has no end — P2**

- There's no retirement, no final summary and no coaches' Hall of Fame.
- **Fix (M):** Add "Retire" with a final career page, and a coaches' wing in the Hall of Fame.

**F17. The league's stat identity drifts over a decade — P2** (owned by the sim-credibility lens; it affects the long-save feel)

- Seed 7:
  - The season threes record (real NBA mark 402) was beaten in 4 of 10 seasons, peaking at 470.
  - The assists leader fell from about 12 to **7.9** by 2036.
  - The rebounding leader was under 10 per game in two seasons.
- Seed 42: the scoring leader reached **38.6 PPG**.

**F18. "Development coaching 15th of 30" never moves — P3**

- That is the user's own coach rating, fixed at creation; only God mode edits it (`devWatch.ts:367`).
- **Fix:** Hide it, or let it grow with the coach's legacy.

**F19. Mixed labelling on the records page — P3**

- The page says "since 2026-27", but the career block counts seasons back to 2003.
- **Fix:** Label it, and optionally show the real NBA marks as targets.

**F20. Small presentation issues — P3**

- The career record wraps as "105-" over "305" on a phone.
- Every signature win uses the same template.
- "Notable retirements" is ordered by year rather than by honours.

**F21. Saves grow fast — P3** (cross-lens: market-platform)

- The league save grows from 5.0 MB to 9.9 MB over 10 seasons.

### 4. Top 5 moves for this lens

1. **Surface the story after every sim** (F1, F2, F7). One moment per stretch, records on the front page, and the season review as a ceremony for every team. The long-save player finally sees the world the game already writes.
2. **Seed real history** (F3, F9, F15). Awards, champions, banners, real retired numbers and real coaches. Credible from day one.
3. **Give the press and the archive a long memory** (F4, F8, F13). Dynasty, drought and repeat lines, the Chronicle, legend retirements on the front page, jersey nights. Season 5 can then refer back to seasons 1-4.
4. **Make the GM's legacy visible** (F6, F16). "Your players", milestones about them, and a career finale. Ten years then leave something to show.
5. **Legend pages and franchise seasons** (F5, F10). Career-first pages for retired players, intact arcs, and franchise seasons you can open. History becomes a place to browse, as in BBGM.

### 5. What I couldn't verify, and how I tested

- **UI play:** 5 full seasons and offseasons on a phone viewport with the real league, all through the Play options (`play.mjs`).
  - Jazz: 23-59, 28-54, 18-64, then fired.
  - Clippers job taken through Career; 20-62 and 16-66.
  - I captured screens every season, and visited every History view, every Career tab and review, Team → Growth, the inbox, draftees and 8 real stars after seasons 3 and 5 (`explore.mjs`).
- **Headless:** `npx tsx scripts/season-test.ts 10` (seed 42), plus my own copy at seed 7 that saved the year-10 league for analysis.
- **Not verified:**
  - Winning-team moments: titles, series, awards and the honours cabinet. My script made no moves and answered no staff calls, so my teams lost every year.
  - The pick moment on the draft screen, which auto-draft skips.
  - All-Star Saturday in the UI.
  - Live games.
  - UI screens after year 5.

Files are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/career-world/`:

- `shots/`
- `play.log`
- `decade-analysis.txt`
- `season-test-10.log`
- `play.mjs`
- `explore.mjs`
- `analyze.mjs`
- `decade.ts`

I made no changes to the repo.
