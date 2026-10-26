## 1. Verdict

The app is much more trustworthy as an interface than in round one. The chance to win now reads **51% on Today, Games, Matchup, League → Scores and the live scorebug**, whichever screen you open first. I checked this against the previous load-order bug. Search and sheets are fixed: search has no ghost rows, Back closes a sheet, and the GM words work. Sub-tabs no longer repeat a full hero. I saw zero console errors on 88 route variants at 390 and 820 wide, in a live game and through playoffs → draft → re-sign → free agency → preseason.

What still hurts is structure and finish:

- **Tactics** still stacks three or four control rows.
- **League** still hides 8 sections behind a scrolling bar.
- **The owner's 47** has two names on the same screen.
- **New layout bugs.** Text sits on top of the Finances hero figure, the report's compact board shows "L… 94 – 118 L…", and the playoff headline breaks as "Timberwolve / s".
- **Shared polish problems.** Tier colours lean on hue alone, sort headers are 17px tall, and the meta lines that carry the content get cut off.

**Score: 7.5/10** (round one: 7). The numbers can now be trusted. Navigation depth and a handful of visible layout breaks keep it below 8.

## 2. What's genuinely great (protect these)

- **One chance to win everywhere.** At game day (Feb 12, vs DEN) Today, `/games`, `/games/7`, Scores and the live scorebug all said 51/49. Today still said 51% after visiting Matchup first (`checks.mjs`). Playoff odds read ">99%" on Today, the deadline card, Odds and Owner. The free-agent count matches: Office "31 on the market" and FA "31 available".
- **No runtime errors** anywhere I went, phone and tablet, including the live game and the whole offseason. No sideways overflow on any route.
- **Back and deep links.**
  - Back from a deep link to `/player/39` lands on his team page, `/teams/20`.
  - Play options and search close on browser Back and the URL stays put.
  - Bad ids get one-line empty states: "That player is no longer in the league.", "This game is no longer stored…".
  - All legacy routes redirect correctly; for example `/gameplan/7` goes to `/games/7`.
- **Sub-tabs collapse their hero.** Matchup's Scout/Plan/Matchups use a one-line board (`seg/phone-*`, `mid-phone/matchup-next-plan.png`), and so do Report's Why/Box. Tactics' Instructions collapses the tactic card to one row ("A Pace & Space · Switch E… 99% Change") and its content starts above the fold (`shots/tactics-instr-fold.png`).
- **The posters:**
  - the Games/Matchup split board;
  - the player slab with its giant number and OVR card;
  - other teams' slabs, e.g. Memphis (`seg/phone-teamview-0.png`);
  - the Awards MVP slab;
  - the Today final board.

  These are the identity and look expensive.

- **The live game** (`shots/live-03-live-8.png`, `live2-*`): a labelled scorebug, "To win DEN 49% / 51% LAL", a big court, one bench bar and evidence beside the levers. It is still the best screen.
- **Search:**
  - "playoff odds" finds Standings;
  - "contract" finds Contracts and Re-sign;
  - "extend" finds Re-sign;
  - "cap sheet" finds Office;
  - "salaries" finds Contracts;
  - "doncic" finds Dončić;
  - "efg" finds the glossary entry.
- **Agenda buttons are 44px everywhere now**, Office and Play options included, with a two-step confirm on destructive actions: "Confirm: Release Jaden Hardy · staff's pick … $6.0M stays on your books as dead money. Tap again to confirm." (`shots/setup-11-after-release.png`).

## 3. Findings (most severe first)

**1. The Finances hero overlaps its own caption on phones (P1)**

- **What happens:** On `/office/finances` the caption "projected, after $0.5M tax; the $0.5M he signed off on doesn't count" prints across the giant "$68.9M" Cash figure. Both are unreadable (`seg/phone-finances-0.png`). The tablet is fine (`mid-tablet/finances.png`).
- **Cause:** `src/ui/screens/Finances.tsx:106-115`. The right-hand "Books close" column carries a long sentence beside a display figure, with no wrap or stacking rule.
- **Why it matters:** the owner's books are the stakes, and their screen looks broken.
- **Fix (S):** stack Books close under Cash below 480px, and move the tax sentence behind the `?`.

**2. The report's compact board truncates 3-letter abbreviations to "L…" (P1)**

- **What happens:** On every report sub-tab (Why/Box/Shots/Flow) the board reads "L… 94 [Won by 24] 118 L…". Both teams show as "L…" (`mid-phone/report-mine-why.png`; the audit lists "LAC" and "LAL" as truncated).
- **Cause:** `components/FinalSlab.tsx:100-101` already falls back to the abbreviation, but the "Won by 24" pill (wider than Matchup's "To win") leaves no room.
- **Fix (S):** shorten the pill ("W +24") on compact boards, or drop the logos there.

**3. Tactics still stacks four rows of controls (P1)**

- **What's on `/team/tactics`, top to bottom:**
  1. hub tabs (Roster / Rotation / Tactics / Lineups / Growth);
  2. slot pills (A Main / B + / C +);
  3. section chips (Tactic / Instructions / Match / Analysis);
  4. on the board, In possession / Out of possession, or on Instructions, In possession / Transition / Out of possession plus Play through chips (`seg/phone-tactics-0/1.png`, `tactics-instr-fold.png`).
- **The budget:** DESIGN allows "one row of tabs; a boxed Segmented under it at most".
- **Other problems:**
  - The board's role labels are 10.4px and its stars 10px ("Movement Shooter", "★★★"). The empty stars have 1.5:1 contrast.
  - The Bench list still shows "100%" on nearly every row (`mid-tablet/tactics-tactic.png`).
  - On scroll, the sticky segmented control shows through under the sticky hub tab bar: there is ghost text "In possession" behind "Roster Rotation…" (`seg/phone-tactics-1.png`).
- **Fix (M):**
  - Give the four sections their own routes under the hub bar, e.g. `/team/tactics/instructions`.
  - Make A/B/C a dropdown in the tactic row.
  - Raise the board labels to 12px or replace the stars with a single fit figure.
  - Make the sticky stacks opaque.

**4. One owner number, two names, two colours (P2)**

- **Owner page:** the hero says "**47 Steady**" (blue, "Job security · out of 100"). The Pulse under it says "Owner **Watchful** · 47 of 100" (`seg/phone-owner-0.png`).
- **Career:** "47 Job security · Steady · Owner watchful" (`seg/phone-career-0.png`).
- **Today** says "Owner Watchful".
- **Cause:** two word ladders over the same score, `core/league/jobSecurity.ts:74-79` and `core/league/legacyPulse.ts:45-52`.
- **Status:** this is round one's finding 8; it is still open.
- **Fix (S):** one ladder. Either the pulse shows only the trend line, or both use `jobSecurity`'s label.

**5. The tactic hero hides that the defense is custom (P2)**

- **The contradiction:**
  - The Tactic card says "Pace & Space · **Switch Everything on defense**".
  - The live state is `defPreset:'switch'` with `pnr:'drop'`: the staff moved it ("Staff change: Go to Drop", inbox, Nov 3).
  - Matchup → Plan says "Custom (Switch base)".
  - The counters read "Pick-and-roll coverage: **Drop** → Hedge".
- **Why it matters:** a player reading Tactics thinks he switches. DESIGN: "A change to the tactics reads in Tactics' own words wherever it shows".
- **Fix (S):** the hero should say "Switch Everything · edited (P&R: Drop)", or "Custom", as Plan does.

**6. League is two clipped scrolling rows plus an empty heading (P2)**

- **Still the same as round one:**
  - 8 sections; at 390 wide the bar reads "‹ ·tats … Awards News History" or "Standings … Sco ›".
  - Each section has a second chip row that clips ("Lotte", "Co", "Pow").
  - A bare 120px "League" heading.
  - The "Scores" tab is still `/league/schedule` (`LeagueHub.tsx:20-31`).
  - History in season 1 is one row, "2026-27 In progress", with no real NBA history (`seg/phone-history-0.png`).
- **Fix (M):**
  - Cut the top row to 5 (Standings incl. Playoffs/Cup, Stats, Scores, News, History; Awards becomes a chip).
  - Replace the heading with the standings poster.
  - Rename the route.

**7. Headlines break inside words and records break at the hyphen (P2)**

- **Headlines:**
  - The playoffs poster reads "Lakers vs Timberwolve / s" (`off/po-playoffs.png`).
  - The Finals card reads "East champ… / West cham…".
- **Records and scores wrap at the hyphen:**
  - "last W 107- / 98" on Games and Matchup (`seg/phone-games-0.png`);
  - "vs CHI (14- / 40)" and "(35-19)" splitting in Play options (`shots/sheet-play-options.png`).
- **Fix (S):**
  - Use `overflow-wrap: normal` plus `hyphens: none`, and step the font size down for long team names on `.head`.
  - Put records and scores in `white-space: nowrap` spans, or use U+2011 non-breaking hyphens in `format.ts`.

**8. Tier colours share hue with signals and collapse for colour-blind players (P2)**

- **Measured from `styles/tokens.css:115-127`:**
  - `--tier-elite` #835b00 vs `--warn` #8b5300: RGB distance 11. A 95 OVR is the warning colour.
  - `--tier-avg` #167343 vs `--good` #106e40: distance 8. A 72 reads as "good".
  - Under a deuteranopia simulation (Machado): star (violet) vs good (blue) drops to distance 23, and avg (green) vs low (grey) to 23.
  - All six tiers have relative luminance between 0.09 and 0.13, so lightness gives no cue at all.
- **Scales still disagree:** OVR tiers are 89/82/78/72/67, attributes are 85/75/64, and Compare uses green winner pills on tier-coloured bars (`shots/compare-luka-sga.png`).
- **Fix (S-M):**
  - Spread tier lightness and pick hues away from warn and good.
  - Align `ratingTone` with `OVR_TIERS`.
  - Bold the winning figure in Compare instead of the green pill.

**9. Over the complexity budget (P2)**
Counted on the phone, below the hero:

| Screen                  | Height (phone screens) | Count          | What's there                                                                                   |
| ----------------------- | ---------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| Today, mid-season       | 2.3                    | 7 blocks       | story, statline, Needs you (2 cards, 4 buttons), backup, Next game, Your season, News, More    |
| League → News           | 7.5                    | 4 sections     | ends "Show more (384)"                                                                         |
| Stats → Leaders         | 3.6                    | 9 leaderboards |                                                                                                |
| Report → Why            | 2.3                    | 7 sections     |                                                                                                |
| Matchup, other opponent | 3.2                    | 6              |                                                                                                |
| Finances → Budget       | 1.8                    | 6              |                                                                                                |
| Re-sign, offseason      | 5.3                    | —              | rows of 5-7 lines (stats, ask, "was", Bird-rights note, two buttons) — `off/resign-resign.png` |
| FA, offseason           | 10                     | —              | a list (`off/freeAgency-fa.png`)                                                               |

- **Two primaries on one screen:**
  - the Play options sheet: "Trade for Kevin Durant" plus the "Sim to next game" row, both solid ink;
  - Compare's empty state.
- **Fix (M):**
  - On Today, fold backup into Needs you only, and drop "More" (Practice belongs to Tactics, Glossary to search).
  - Page News at about 20 items.
  - On Re-sign, one meta line per row, with the detail in the negotiate sheet.

**10. Truncation cuts the actual content (P2)**

- **Growth:** every row's only content is cut: "25 · Speed −1, explosiveness −1 since …" (`mid-phone/team-growth.png`).
- **Inbox:** all 31 previews.
- **Elsewhere:** "S. Gilgeous-Al…" (stats, also on tablet), "Offensive reboundi…" (player ratings), "Mamukelas…" (live lineup).
- **Dock sub-line:** the meta is cut on every screen, losing the opponent: "Milestone watch · Fri, Feb 12 · vs …".
- **Fix (S):**
  - Two-line clamp on Growth and Inbox.
  - Short rating labels ("Off. reb").
  - Put the opponent first in the dock line.

**11. Growth contradicts itself (P2)**

- **The contradiction:** The hero says "The one to watch: Walker Kessler, +1 this season and still climbing". His row in the same screen says "Speed −1, explosiveness −1", and he is out 41 games.
- **The list header:** he sits under "Holding · 7" with ↑1 — "Holding" yet up.
- **Status:** the hero player repeated in the list is round one's Carr issue again, with a different player.
- **Fix (S):** exclude the hero from the list, and don't pick an injured player whose ratings are falling as "still climbing".

**12. Touch targets under 44px (P2)**

- **Sort headers are 17px tall,** 7-20 per table: player Stats/Games, Finances history, Matchup play types, league tables.
- **Inline name links are 14-19px:** Growth footer, Re-sign names, team Moves, News headlines (20px, 31 on the page).
- **Smaller misses:**
  - range inputs in Match are 28px tall;
  - the Back icon button is 42×42;
  - the switch is 48×28 with no extended hit area.
- **Fix (S):**
  - A sort header's hit area should be the whole header cell (`::after`).
  - On News, make the whole headline row the link.
  - Give the switch a 44px wrapper.

**13. Search misses common words (P2)**

- **Nothing found:** "hall of fame" (while History's meta says "Hall of Fame"), "god", "release", "retired", "ticket price" (while Finances' meta says "ticket pri…"), "pnr", "morale" (fine).
- **Found the wrong thing:**
  - "glossary" finds League file, not the glossary sheet;
  - "fired" finds Fred VanVleet;
  - "practice" finds only the glossary, not the Practice screen;
  - "coach" finds History, not Career.
- **Fix (S):**
  - Add `also` words in `ui/search.ts` SCREENS.
  - Match multi-word queries against the meta text.
  - Add a Glossary entry and a God mode entry.

**14. The same concept named differently (P2)**

- **Copy:**
  - The Staff tab in the live bench bar becomes "Huddle" in a timeout (`live2-*`).
  - "Chance to win" on Today vs "To win" elsewhere.
  - "Heliocentric Creator" (archetype tag) vs "Primary Creator" (role) on the same player slab; "Heliocentric" has no glossary entry.
  - "More about tonight" when the game is "Tomorrow" (Matchup on Feb 11).
- **Legend:** the standings legend "p play-in" sits next to the 53-2 Thunder, so it reads as "Thunder in the play-in". It means "clinched at least the play-in" (`StandingsTab.tsx:68` vs `:111`).
- **Fix (S):** a copy pass. The legend should read "p clinched play-in", and the archetype tag should go or be glossed.

**15. Glossary gaps for words on screen (P3)**

- **Missing from `ui/glossary.ts` (81 entries):**
  - Win shares / PER (Stats leaders);
  - "STA" (Rotation);
  - the role names Glue Guy / Rim Runner / Movement Shooter / Primary Creator;
  - Hub Big (Scout);
  - Junk defense;
  - Fluid (familiarity tiers);
  - Closer;
  - GB;
  - Revenge game / billings.
- **Fix (S):** add the entries and wrap the first use on each screen in `Term`.

**16. Sentence-case violations (P3)**

- **Where:**
  - "THE OWNER EXPECTS" / "OWNER" on Today's preseason slab: `today/today.css:359` (`text-transform: uppercase; letter-spacing: .04em`);
  - the guide strip kicker: `components/agenda.css:159`.

  Both are explicitly against DESIGN principle 5 (`shots/setup-07-today-regular.png`).

- **Fix (S):** delete both rules.

**17. Settings → Difficulty grid is cramped (P3)**

- **At 390 wide:**
  - "Contract Opponent" headers run together;
  - the Hard row reads "−1 to −5 1 yr";
  - units are mixed ("−12%", "Fair", "+1.5", "None").
- **Status:** same as round one (`seg/phone-settings-0.png`).
- **Fix (S):** three radio cards with one line each.

**18. The live court's team markers are close in colour (P3)**

- **What you see:** LAL (#552583) and DEN (#0E2240) chips are both dark with gold rings and gold numbers. Jokić and Reaves are both #15 (`live-03-live-8.png`). Under deuteranopia, LAL maps to #003E81, close to DEN's navy.
- **Fix (S):** when the two primaries are close, `matchupColors` should switch one side to its light or alternate kit (white chip, coloured number).

**19. Copy that makes the player decode (P3)**

- **Still open from round one:**
  - Rotation: "Targets 241 · min, scaled to 240". The stint plan shows Reaves 37 while the list shows 38.
  - Every starter is tagged "closer".
  - Re-sign's subtitle in season, "Opens after the playoffs", sits over live Extend buttons.
- **New:**
  - Draft after the draft says "All picks are in" over a "Best available · 12 left" list. These are the undrafted players; call them "Undrafted".
  - Matchup Plan counters show "Even · Always" with no label for either word.
  - The FA team slab mixes seasons: "2026-27 · 52-30" over "Roster 27-28".
- **Fix (S):** a copy pass.

**20. Page tabs are radiogroups and Today has no h1 (P3)**

- **Tabs:** `Segmented` renders `role="radiogroup"` for page tabs too (`components/ui.tsx:~151`); the sweep found no tablist anywhere. TabBar's paging chevrons are `aria-hidden`, which is fine.
- **Headings:** Today, God mode and team pages have no `h1` (the audit's `title` was empty).
- **What is fine:** focus rings are a 2px solid team colour, and the bell's accessible name works ("3 need you").
- **Fix (S):** use `role="tablist"`/`tab` (or links with `aria-current`) for page tabs, and give Today a visually hidden h1.

**21. A nested scroll area in the stats tables (P3)**

- **What happens:** League → Stats → Players puts 100 rows in a 558px inner scroll box (`tablewrap 558/3969`). On a phone, with the dock covering about 230px, you scroll inside a small window inside the page. The footer reads "Top 100 of 307 players" over about 11 visible rows.
- **Fix (S):** let the table grow on phones and keep the header sticky against the page.

**22. The tablet layout is still the phone layout stretched (P3)**

- **What happens:** at 820 wide every screen is the same single column.
- **What it costs:** Today wastes the width, and the tactics board sits narrower than its sibling cards (`mid-tablet/tactics-tactic.png`).
- **What's fine:** Finances and tables look better on tablet.
- **Fix (M):** use two columns at ≥768px for Today, Matchup Scout and Report Why.

## 4. Since the first review

| #   | First-round finding                                                | Now                                                                                                                                                          |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Chance to win / odds / FA count disagree                           | **Fixed.** 51% on 5 screens, order-independent; odds >99% everywhere; FA 31 = 31.                                                                            |
| 2   | Search ghost rows                                                  | **Fixed.** No duplicate-key warning; "playoff odds" finds Standings.                                                                                         |
| 3   | Heroes repeated on sub-tabs                                        | **Mostly fixed** (Matchup, Report, Tactics collapse). **Regressed detail:** the compact report board truncates to "L…" (F2).                                 |
| 4   | Tactics' four tab levels                                           | **Still open** (F3). The board labels are still 10px and the Bench still says "100%".                                                                        |
| 5   | Today over budget                                                  | **Still open** (7 blocks).                                                                                                                                   |
| 6   | League tabs clipped, "Scores" vs `/schedule`, empty heading        | **Still open** (F6).                                                                                                                                         |
| 7   | Six rating scales, tier thresholds differ, Compare green pills     | **Still open** (F8).                                                                                                                                         |
| 8   | Practice in several places; owner shows two 52s; two role names    | **Still open.** Practice is on Today → More, Matchup Plan and Tactics Analysis; the owner shows 47 Steady vs Watchful (F4); Heliocentric vs Primary Creator. |
| 9   | Sheets stay open on Back                                           | **Fixed** (Play options and search close on Back).                                                                                                           |
| 10  | Search misses GM words                                             | **Fixed** for contract/extend/cap sheet/salaries. New misses in F13.                                                                                         |
| 11  | Text under 12px                                                    | **Mostly fixed.** The audit found only the tactics board (10-10.4px) and the compact board's "%" (10.8px).                                                   |
| 12  | Small touch targets                                                | **Partly fixed.** Agenda buttons are 44px everywhere; sort headers and inline links remain (F12).                                                            |
| 13  | The record repeated                                                | **Partly fixed.** The Team slab collapses to the name on non-roster tabs. Growth's hero duplicate is back (F11).                                             |
| 14  | Truncation                                                         | **Still open** (F10).                                                                                                                                        |
| 15  | Copy slips (239/240, STA, closer, Re-sign naming, difficulty grid) | **Still open** (F17, F19).                                                                                                                                   |
| 16  | Hub headers inconsistent                                           | **Still open** for League.                                                                                                                                   |
| 17  | Row/primary rules                                                  | **Still open** (Compare's two primaries, multi-line FA and Re-sign rows).                                                                                    |
| 18  | Tablet = phone                                                     | **Still open.**                                                                                                                                              |
| 19  | Focus under sticky header, translucent bar                         | **Partly open.** Text still shows through the sticky stacks on Tactics.                                                                                      |
| 20  | Tier colours hue-only                                              | **Still open**, now measured (F8).                                                                                                                           |
| 21  | News 8-screen wall                                                 | **Still open** (7.5 screens, "Show more (384)").                                                                                                             |

**New since round one:**

- the Finances overlap (F1);
- the compact report board truncation (F2);
- the custom-defense mislabel (F5);
- the headline mid-word break (F7);
- the Huddle/Staff rename (F14);
- the nested stats scroll (F21);
- the draft "Best available" after the draft (F19).

## 5. Top 5 moves

1. **Fix the four visible layout breaks:** Finances overlap, the compact board's "L…", the "Timberwolve/s" headline, records wrapping at the hyphen (F1, F2, F7). All S. Removes the "broken" moments a new player screenshots.
2. **Flatten Tactics** (sections as routes, A/B/C as a dropdown, a 12px board, opaque sticky stacks) **and say "edited/Custom" on the hero** (F3, F5). M. The game's pitch screen becomes readable on a phone, and what it says matches what the team actually runs.
3. **One vocabulary pass:**
   - one owner word ladder;
   - one role name per player;
   - Staff/Huddle;
   - the "p" legend;
   - glossary entries for the role and stat names (F4, F14, F15, F19).

   S-M. This finishes the honest-numbers work: the same thing is called the same everywhere.

4. **Tier colours and scales:** separate tiers by lightness, move them off the warn and good signal colours, align `ratingTone` with `OVR_TIERS`, stop the green Compare pills (F8). S-M. Ratings become readable at a glance, including for the roughly 8% of male players with red-green colour blindness.
5. **League and Today budget pass:** a 5-section League with a poster hero; Today down to hero, Needs you, Next game, News; News paged at about 20 items; Re-sign rows down to one meta line (F6, F9). M. Fewer screens of scrolling and quicker answers on the two most-visited hubs.

## 6. Route table (phone 390×844; every row also checked at 820×1180; zero console errors on all)

| Route                                               | Scr       | Verdict                                                                 |
| --------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `/` Today (mid / game day / preseason)              | 2.3       | Gorgeous final/odds hero; 7 blocks; uppercase owner kicker in preseason |
| `/inbox`                                            | 3.3       | Clean list; every preview truncated; filter chips clip                  |
| `/settings`                                         | 1.2       | Difficulty grid cramped; otherwise clear                                |
| `/god`                                              | 1.0       | Calm one-line state                                                     |
| `/team` Roster (Players/Ratings/Stats/Contracts)    | 1.6-1.9   | Excellent row grid with OVR key; hub tabs plus a chip row               |
| `/team/rotation`                                    | 2.3       | Clear; "241 scaled to 240", 37 vs 38, "closer" everywhere, STA          |
| `/team/tactics` Tactic                              | 2.7       | Three or four control rows; 10px board; Switch label hides Drop         |
| Tactics Instructions / Transition / Out             | 1.5-1.6   | Content now above the fold; Mentality's disabled-looking fills          |
| Tactics Match                                       | 1.4       | Fine; 28px sliders                                                      |
| Tactics Analysis (report / familiarity / season)    | 1.9-2.2   | Rich; truncated role lines                                              |
| `/team/lineups`                                     | 2.1       | Clear Net-led rows, good "faded" note                                   |
| `/team/growth`                                      | 1.6       | Hero contradicts its row; every row truncated                           |
| `/player/:pid` (5 tabs)                             | 1.7-3.3   | Best poster; two role names; 17px sort headers on Stats/Games           |
| Player, other team / free agent                     | 2.4 / 1.6 | Correct tab lit; FA "Make an offer" in reach                            |
| `/compare` (empty / pair)                           | 1.0 / 2.4 | Two primaries when empty; green pills clash with tiers                  |
| `/games`                                            | 2.1       | Excellent board, consistent 51%; "107- / 98" wrap                       |
| `/games/:tid` Preview / Scout / Plan / Matchups     | 1.4-2.8   | Strong; compact board on sub-tabs; unlabelled "Even · Always"           |
| Matchup, other opponent                             | 3.2       | Over budget (6 blocks)                                                  |
| `/preview`, `/gameplan/:tid`                        | n/a       | Redirect correctly                                                      |
| `/live`                                             | n/a       | Best screen; similar team chips; Staff→Huddle rename                    |
| `/game/:gid` Debrief                                | 1.9       | Beautiful; tabs reachable                                               |
| Report Why / Box / Shots / Flow                     | 1.3-3.0   | Compact board shows "L… / L…"; Why has 7 sections                       |
| Report, other teams                                 | 3.1       | Fine                                                                    |
| `/league` Standings (E/W/League/Power/Odds/Lottery) | 1.7-4.0   | Clear tables; two clipped rows; "p play-in" ambiguity                   |
| Playoffs (mid / live postseason)                    | 1.7       | Good bracket; "Timberwolve/s" and "East champ…" breaks                  |
| Cup                                                 | 2.6       | Fine                                                                    |
| Stats (Leaders / Players / Teams / Ratings)         | 1.4-5.8   | 9 leaderboards; nested 558px scroll; truncated names                    |
| Scores (`/league/schedule`)                         | 1.1       | Consistent 51%; route/label mismatch                                    |
| Awards                                              | 2.6       | Lovely MVP slab; "4.5 / REB" line break                                 |
| News                                                | 7.5       | Wall; 20px headline links; "Show more (384)"                            |
| History (Seasons/Teams/Records/HoF/Coaches)         | 1.0-3.3   | Nearly empty in year 1                                                  |
| `/teams/:tid` (6 tabs)                              | 1.3-3.3   | Beautiful other-team slab; tab row clips                                |
| `/office`                                           | 2.2       | Good desk hub; 3 offers each with Accept/Turn down                      |
| `/office/trade`                                     | 3.2       | Strong; defaults to ATL; two-line meta rows                             |
| `/office/free-agents` (season / FA day 1)           | 3.5 / 10  | Clear hero; 10-screen list in the offseason                             |
| `/office/resign` (season / re-sign phase)           | 1.0 / 5.3 | Season version misnamed; phase version over budget                      |
| `/office/draft` (season / after draft)              | 2.8       | Clean board; "Best available" after the draft is confusing              |
| `/office/finances` Overview / Budget / History      | 1.0-1.8   | **Overview hero text overlaps (phone)**; Budget has 6 blocks            |
| `/office/owner`                                     | 1.6       | Clear meter; Steady vs Watchful for one 47                              |
| `/office/career` (3 tabs)                           | 1.0-1.6   | Good slab; same two-name 47                                             |
| `/office/assets` (2 tabs)                           | 1.0-2.0   | Fine                                                                    |
| Legacy routes, `/nope`, `/league/xyz`, bad ids      | n/a       | Redirect, or one-line empty states                                      |

**Taps to common tasks (phone):**

- last box score: 2 (Today hero "Report" → Box);
- plan the next opponent: 2 (Today hero "Matchup" → Plan);
- rotation: 2;
- start a trade: 2 (Office → Make a trade), then a team picker;
- playoff odds: 2 (League → Odds chip), or read on Today.

## 7. What I couldn't verify, and how I tested

**How I tested:**

- Created my own Lakers real-league save through the UI (released a player via the agenda's confirm).
- Simmed to the trade deadline (4 call stops on the way, ending Feb 11, 35-21), all under `…/scratchpad/review/ux-ia/profile*`.
- Scripts: `crawl.mjs` covers 88 route variants per viewport, with screenshots, DOM audits (font size, contrast, 44px targets, truncation, unnamed controls) and console capture → `audit-mid-phone.json` and `audit-mid-tablet.json`. Supporting scripts are `seg.mjs`, `search.mjs` (74 queries), `nav.mjs` and `checks.mjs` (Back, sheets, focus, deep links, order dependence), `live.mjs`/`live2.mjs` (game day plus live views) and `off.mjs` (play-in → playoffs → draft → re-sign → free agency → preseason 2028).
- Screenshots: `…/ux-ia/shots/mid-phone/`, `shots/mid-tablet/`, `seg/` (viewport crops), `shots/off/` (offseason), `shots/live*`.

**Not verified:**

- Draft night with a pick of my own (my team had none).
- RFA offer sheets and a fired coach.
- A real screen reader: roles and names were checked in the DOM only.
- Landscape on the live game.
- Hardware Back in the native shells (simulated with browser Back).
- Colour-blindness: judged by simulation maths, not by people.

My contrast heuristic falsely flagged text on split slabs; I discarded those after looking at the screenshots.
