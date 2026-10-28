# UX / IA lens: round 4 (reviewer 8, `ux-ia`)

The tool harness blocked writing `REPORT.md` ("Subagents should return findings as text"), so this message is the full report and there is no file. My save profile has been deleted. Every path below is under the scratch folder `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/ux-ia/`.

## 1. Verdict

The app is technically very clean.

- **No breakage in the crawl.** 46 routes at 390×844, 360×740 and 820×1180 (15 more at 320×640) gave zero console errors, zero error boundaries and zero horizontal overflow.
- **Keyboard and screen readers.** Sheets trap focus and hand it back on Escape. The aria labels are unusually good.
- **The Hardwood posters** (matchup split slab, player slab, draft "#24 You're up", season review) still look better than anything else in the genre on a phone.

What a player notices instead is a set of visible "unfinished" moments:

- **Star names break mid-word on hero slabs.** "Antetokounmp / o" on Giannis's page at 390, "Cunningha / m" on Compare, and "Piston / s" on your own Team hero at 360.
- **A placeholder leaks.** The Tactics report and a staff mail say "(role): Playmaker → Auto".
- **The pitch screen is still deep.** Tactics stacks three switches before any content.
- **Leftovers from round 3:** search misses about 30% of what players type, staff calls run 7 dense lines, slab labels sit below 4.5:1, and about 900 controls are under 44px.

Many round-3 items are fixed: hyphen breaks, uppercase kickers, the bench-tab name, the Team name bar, the hatched hot seat and staff-read badges. Two new layout bugs (the word breaks and the "(role)" leak) take some of that back. **Score: 7.6/10** (round 3: 7.8).

## 2. What's genuinely great (protect these)

- **Robustness.** 153 route loads across 4 widths showed no overflow, errors or boundaries (`audit/p390.json`, `p360.json`, `t820.json`, `p320.json`). Even at 320px nothing pokes past the viewport.
- **Keyboard and focus.**
  - Play options takes focus into the sheet, keeps it there through 12 Tabs, and Escape returns it to "Play options" (`kbd.log`).
  - Focus rings are visible on every control I tabbed to, except one (finding 20).
- **Screen-reader labels a player would write themselves:**
  - Today's form cell: "Last 5, oldest first: won 120-109 versus NYK, lost 121-136 at PHI…";
  - the next-game card: "Next game, Sat, Feb 13: at the Trail Blazers, 49% chance to win. Out: Thompson 6 games";
  - the live scorebug reads score, state and win probability.
- **Reduced motion is global** (`styles/tokens.css:253`), and JS scrolls and count-ups respect it (`components/ui.tsx:113,740`).
- **The posters:**
  - the matchup split slab "49% / 51% To win" (`sheets/a4.png`, right);
  - the player slab (`shots/x-giannis.png`, apart from the bug);
  - draft night "#24 You're up · Take the staff's pick · Offers (8)" (`sheets/e1.png`);
  - the season review slab "Lost in the first round … 'I'm pleased.'" (`sheets/d2.png`);
  - the owner meter: "58 Steady", a hatched "Hot seat", "Fired under 25" (`sheets/c1.png`).
- **Destructive actions confirm in place:** "Confirm: Release Gary Harris · staff's pick / $3.8M stays on your books as dead money. Tap again to confirm." (`shots/12-after-release.png`).
- **Honest waiting copy:** "Tip off · Staff still measuring · 88%" on the preview (`shots/22b-preview-0.png`); dashed "Staff read" OVR badges on the draft board (`sheets/a9.png`, right).
- **The first-hour guide.** "Your first games · 0 of 4 done", with each step deep-linking to the exact control: "Keep these five", "Keep this playbook", "No plan this time".

## 3. Findings (most severe first)

**1. Hero names break mid-word (P1)**

- **What you see:**
  - On the league's biggest star's page the slab reads "Antetokounmp" / "o" (`shots/x-giannis.png`, 390×844).
  - Compare reads "Cunningha / m" at 390 (`sheets/a4.png`, left) and at 360 (`sheets/b1.png`, right).
  - Your own Team hero, the most-visited slab, reads "Piston / s" at 360×740 (`sheets/b1.png`, left) and "Pisto / ns" at 320 (`sheets/h1.png`). At 320 the "Starters" heading also collides with the MIN column.
- **Where else.** `wordbreak.mjs` found hyphen breaks on six more player slabs at 40px ("Gilgeous- / Alexander", "Caldwell- / Pope", "Murray- / Boyles").
- **Cause.** The guard is a character count, not a width:
  - `longWord(n, max = 10)` (`components/ui.tsx:660-663`) only steps the size down for words over 10 characters;
  - "Cunningham" (10) and "Pistons" (7) never trigger it;
  - Antetokounmpo is stepped down to 36px and still overflows.
- **Why it matters:** the brand is "a printed poster", and a broken name on a star's poster is the first screenshot anyone shares.
- **Fix (S-M):**
  - fit-to-width: measure the word with canvas `measureText`, or use container-query units (`font-size: min(var(--max), 14cqi)`), and never let `overflow-wrap` split a word in a headline;
  - add a Playwright check that renders the 10 longest last names and team names on Player, Compare, Team and TeamView at 320/360/390 and fails on a multi-line word.

**2. Placeholder "(role)" leaks into the Tactics report and the staff's mail (P1)**

- **What you see:**
  - Tactics → Analysis → "Since you changed it" opens with "(role): Playmaker → Auto · Depth order…", measured "Even · 15 games" (`sheets/a12.png`, left).
  - The inbox preview from the lead assistant reads "Luis Grantham · (role): Playmaker → Auto and more." (`audit/p360.json`, /inbox).
- **Cause.** I released Gary Harris, a Playmaker. `src/core/sim/playbooks.ts:279` builds `${nameOf(pid)} (role)`, and the name lookup returns "" for a player who has left the roster. On top of that, a release is logged and measured as if it were a tactics change you made.
- **Why it matters:** it reads as a bug in the screen whose pitch is "it tells you why", and it credits the player with an edit he didn't make.
- **Fix (S):**
  - resolve names from `league.players` regardless of team, or skip role diffs for departed players;
  - keep roster moves out of the tactic-edit ledger.

**3. Tactics is still three stacked switches before content (P2; was P1)**

- **What you see on `/team/tactics/*`** (`sheets/a11.png`, `sheets/a12.png`):
  1. the hub tabs (Roster…Growth);
  2. a boxed segment (Tactic / Instructions / Match / Analysis);
  3. the "A ▾ Grit & Grind · 2-3 Zone 100% Change" line;
  4. a third two- or three-option switch (In / Out of possession; In possession / Transition / Out of possession; Report / Familiarity / Season).
- **DESIGN's own count.** It calls the third a heading (`HeadSwitch`, DESIGN.md:384-387), but it looks and acts like a tab row: bold-vs-grey words, one tap each.
- **What improved.** The 120px name bar is gone, and the board now starts at y≈450 on a 390 phone (`shots/14-tactics-0.png`).
- **What breaks at 320:**
  - the hub row scrolls with arrows ("‹ ster … Gro ›");
  - the section segment clips "Anal";
  - the tactic line truncates to "Grit & Grind · 2…" (`sheets/h1.png`, right).
- **Fix (M):** make Tactics' four sections the only tab row when you're inside Tactics, with the Team hub reachable by back or the header. Alternatively, merge the HeadSwitch into the section content as a sticky sub-header that scrolls away.

**4. Search still misses what players type (P2; round 3 F10 unchanged)**

- **No result for 15 of 54 queries** (`search.log`): "chance to win", "set package", "crunch", "go-to", "huddle", "assistant", "release", "legacy", "hall of fame", "coach of the month", "fans", "streak", "colour blind", "dark mode", "text size".
- **Wrong results:**
  - "fired" → Fred VanVleet;
  - "glossary" → League file;
  - "scout" and "scouting" → Matchup only, never the draft board;
  - "practice" → a glossary entry only, none of the four screens that set it.
- **Fix (S):** add `also` words to `src/ui/search.ts` SCREENS (Crunch time → Match, Release → Roster, Hall of Fame → History, Glossary as a screen, Draft for "scout"), and stop people-name fuzzy matching from outranking a word typed in full.

**5. Staff calls and toasts are dense, and one contradicts its own buttons (P2)**

- **The youth-minutes call** in "While you were away" is 7 lines with 6 figures and an "@" shorthand (`shots/32-after-week.png`, `shots/34-stop-0.png`): "It costs 1.6 pts a game (≈ −4% to win, measured @ NYK): about 0.4 wins over 10 games. It adds 220 of the owner's minutes: on pace for 4,295 of his 4,300, not 4,075. The staff leans play them…"
- **The deadline call** still says "The staff's call: buy a player better than your fifth best (78 OVR). Nobody the staff asked takes what you can send for one; Find lists who's out there." Its solid primary is "Stand pat", the opposite of the call (`shots/35-today-deadline-0.png`).
- **Toasts have no subject:** "This change: even over your next five, too close to say" (`shots/15-today-after-0.png`) and "Too close to say: even over 15 games" (`sheets/a2.png`). The player can't tell which change is meant.
- **Fix (S):**
  - lead with the verdict in 1 line;
  - put the numbers behind a "Why" tap;
  - make the staff's recommended option the solid button;
  - name the change in every toast.

**6. Contrast misses on slabs, the live ticker, tags and links (P2; round 3 F13 still open)**

- **Slab micro-labels.** `--text-dim` on slabs is 78% white (`styles/surfaces.css:109`). At 12px it measures 3.97:1 on DET/ATL/LAC red, 3.80 on CHI/HOU/TOR, 3.87 on OKC, 3.98 on BOS/ORL and 4.00 on NYK/PHI. Of the 11 team colours I computed, 9 are under 4.5:1. Axe confirms #f3cad1 on #c8102e at 3.97 on Compare's slab.
- **Live ticker.** The game-time text uses the team accent on ink: #c8102e on #2a2826 is **2.50:1** at 12px (pixel-sampled from `shots/25-live-b.png`; `live/styles/scorebug.css`).
- **Gold tier tag on paper wash.** `.tm-gold.tag` #8d6300 on #e3d9c2 is 3.82:1 (axe, `/player/39`).
- **Growth links.** Player-name links are 1.83:1 against the surrounding text with no underline (axe `link-in-text-block`, 7 nodes).
- **Fix (S):**
  - slab `--text-dim` at 0.88 (it passes 4.5:1 on 10 of the 11 colours I computed; OKC is just short at 4.48);
  - ticker time in `--paper-ink`;
  - darken the gold tag text;
  - underline in-text links.

**7. Touch targets (P2; round 3 F12 still open)**

- **Totals.** At 390 the crawl found 901 visible controls under 44px across 46 routes, 345 of them under 24px.
- **What they are:**
  - the three top-bar buttons (Search, bell, Settings) at 38×38 on every screen;
  - Back at 42×42 (22 screens);
  - switches at 48×28;
  - every "?" Explain at 22×22;
  - sort headers 17px tall;
  - League → News with 161 controls under 24px;
  - live "Leave" at 63×24 and the speed chip at 46×34.
- **Fix (S):** a 44px hit area on `.iconbtn`, `.toggle`, the help buttons and the sort headers; make the whole News row the link.

**8. Complexity budget: about 20 violations across 46 routes (P2)**

Budget: one hero, ≤5 blocks, rows with ≤1 meta line, one primary button, one row of tabs.

| Screen (phone 390)                                                         | Height  | Over budget by                                                                      |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Tactics: Tactic / Instructions / Analysis                                  | 1.3-2.5 | 3 stacked switches                                                                  |
| Tactics: Match                                                             | 1.3     | 2 switches + tactic line                                                            |
| Today (deadline day)                                                       | 2.4     | 2 solid primaries ("Stand pat", "Export backup")                                    |
| Roster, Lineups, Matchup Scout, Trade, League Standings/Stats/News/History | 1.7-6.9 | Tab row + a chip row (DESIGN.md:272 allows it, but a phone shows two tab rows)      |
| League → Stats → Leaders                                                   | 3.6     | 8 leaderboards                                                                      |
| Game report → Why                                                          | 2.3     | 6-7 sections                                                                        |
| League → News                                                              | 6.9     | A wall                                                                              |
| Free agents (day 1)                                                        | 4.2     | Hero + one-link card + segment before the list; floating Advance pair over the rows |
| Re-sign                                                                    | 2.2     | Rows of 5-6 lines (`shots/63-0-Resignperiod-1.png`)                                 |
| Draft board                                                                | 3.2     | Rows wrap to 2 meta lines (`sheets/e1.png`)                                         |
| Lineups                                                                    | 2.0     | Rows of 2 name lines + meta + tags                                                  |
| Matchup → Scout                                                            | 3.1     | 5 sections + a segment                                                              |

- **Fix (M):** keep one solid primary on Today, lead FA with its list, give Re-sign rows one meta line, and page News.

**9. Truncation hides content (P2)**

- **Counts:** 52 truncated strings at 390.
- **What gets cut:**
  - Growth: each row's only content is cut ("Steady this month; strength −1 si…").
  - Roster at 360: the meta collapses to "PG …".
  - Trade: names with tags.
  - Free agency: RFA tags ("RFA · OKC can ma…").
  - The top-bar sub-line: "Free agency · Day 1 of …".
  - The dock sub-line: "Game 1 · vs ORL (serie…" and "The lottery is in: see where you pi…" (`sheets/d1.png`, `sheets/d2.png`).
- **Fix (S):** two-line clamps; shorter dock sub-lines.

**10. Practice still lives in four places (P2; open since round 1)**

- **Where:** Today → More; Matchup → Plan → Familiarity; Tactics → Analysis → Familiarity; Finances → Budget.
- **Search** for "practice" finds none of them.
- **Fix (S):** one home, with links from the other three.

**11. Vocabulary leftovers (P2)**

- **Two fan scales:** Owner "Fans Buzzing · 72 of 100" and Finances "Hype 60 of 100".
- **The Owner pulse** pairs "Rising" (a trend word) with "Buzzing" (a level word) (`sheets/c1.png`).
- **Counter cells are unlabelled:** "Even · Always · Add" and "Measuring… · Always · Add" (`shots/17-plan-wait-0.png`).
- **The advance verb changes by phase:** Sim, Start, Go to, Open, Advance.
- **The bell's screen-reader label** reads "1 need you" (`App.tsx:286`).
- **Fix (S):** one fan scale, one pulse word type, labelled counter cells, fix the plural.

**12. Inbox: duplicate Coach of the Month mail and a lowercase "the" (P2; round 3 F8 still open)**

- Day 163 has both "[Media Relations] … Coach of the Month. the Pistons went 13-3…" and the League Office version.
- **Fix (S):** keep one mail and capitalise the joined sentence.

**13. Tablet is a stretched phone (P2)**

- **What you see at 820:** one column, buttons sized for half the width, and a 600px board with the controls below it (`audit/t820-_.png`, `audit/t820-_team_tactics.png`).
- **The genre bar.** FM's and 2K's tablet modes use split panes.
- **Fix (M-L):** ≥768px list|detail panes for Team, Tactics, Trade and Inbox.

**14. No accessibility settings, and fixed-px type (P2)**

- **What's missing:** no text size, colour-blind or low-light option, and a fixed 15px root font.
- **What large text does.** The 320 run, which stands in for text zoom, shows "Pisto / ns" and "Starters" over "MIN" (`sheets/h1.png`).
- **Fix (M):** rem type, a three-step text size, and the CI break check from finding 1 run at 120%.

**15. Free agency: the list sits under a hero and a floating bar (P3)**

- **What you see:**
  - a giant "$6.8M Over the cap";
  - a "The market" card holding one collapsed link;
  - the list starting at y≈670.
- **The advance control.** A floating "Advance 1 day / Advance 1 week" pair covers the rows, and the dock vanishes on this screen (`sheets/g1.png`, `sheets/g3.png`).
- **Fix (S):** cap figure into the statline, drop the one-link card, put the advance in the dock.

**16. The draft's scroll-to-top button covers row actions (P3)**

- The round "^" button sits over rows' "Draft" buttons and the right end of the section heading (`sheets/e1.png`, `sheets/e2.png`).
- **Fix (S):** a bottom gutter, or hide it while rows have trailing actions.

**17. League → Stats → Players still scrolls inside the page (P3; round 3 F14 open)**

- A 558px `.tablewrap` holds 3969px of rows.
- **Fix (S):** let it grow, with a sticky header.

**18. Tab and chip rows clip (P3; round 3 F15 open)**

- **Where:** other teams' pages ("…Picks Move›", History hidden; `sheets/a7.png`), History chips "Co…", News chips "Pow…", Inbox chips "Co…".
- **Fix (S):** History as a header link on team pages, as League does.

**19. The Difficulty grid is cramped (P3; open since round 1)**

- New league step 3 and Settings render "Hard +12% +12% All −1 to −5 1 yr", with the last two cells running together (`shots/07-named.png`, `sheets/a1.png`).
- **Fix (S):** three radio cards with one line each.

**20. Semantics and focus details (P3; round 3 F16 partly open)**

- **Headings.**
  - Today has no h1; its headings start at h3.
  - 28 heading-order violations across the crawl.
  - Generic h1s: "Matchup" rather than the opponent, "League" on every League tab.
- **Tabs.** Page tabs are still `radiogroup`/`radio` (`components/ui.tsx:153`).
- **Page title and skip link.** `document.title` is "Hoops Career" on every route, and there is no skip link.
- **Focus rings.**
  - The Games slab link has no focus ring.
  - After a keyboard Escape from Play options, the dock chevron's ring renders as two clipped red lines above the dock (`shots/35-today-deadline-0.png`, x≈330 and 388).
- **Fix (S):** a sr-only h1 on Today, `tablist`/`tab`, per-route titles, an inset dock focus ring.

**21. Colour blindness: red slabs turn olive like the gold tier (P3; round 3 F3 mostly fixed)**

- **What improved.** The owner bar now reads under deuteranopia: the hatched hot seat, labels and ticks carry it (`sheets/c1.png`).
- **What remains under deutan and protan:**
  - DET's red slab and dock button turn olive, the same family as the gold elite badge (`sheets/c2.png`);
  - +/− net colours collapse into one olive, so only the sign carries the meaning (`sheets/c3.png`, `sheets/c4.png`).
- **Fix (S):** a white keyline on elite badges on slabs, plus ▲/▼ glyphs beside signed figures.

**22. Hardwood polish spots (P3)**

- **Career slab kickers wrap:** "Pistons · season 1 · / Normal" and "Season by / season" (`sheets/a12.png`, right).
- **Shot profile and Tempo tiles** squeeze two-line labels into ~62px pills, and the filled-meter look reads as disabled (`sheets/a11.png`, left).
- **The live Mentality control** wraps "Very / aggressive" (`shots/26-live-tab-Gameplan.png`).
- **Your own figure is dimmed when you're the underdog.** The slab fades the lower number, so your "47%" or "49%" reads as disabled.

## 4. Since round 3

| #   | Round-3 finding                    | Now                                                                                                                                 |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Tactics three nav layers, name bar | **Partly fixed.** Name bar gone; board on the first screen; sections have paths. Three stacked switches remain, and 320 clips them. |
| F2  | Hyphen breaks (Games, draft)       | **Fixed.** `keepFigures` in `GamesHub.tsx:174` and `draft/common.ts:13`. Mid-word breaks are a new, different bug.                  |
| F3  | CVD signals and security bar       | **Mostly fixed.** Hatched hot seat, labelled zones. Red slab vs gold tier and signed figures remain.                                |
| F4  | Today budget                       | **Partly.** Deadline call now on the first screen. Still 2 solid primaries.                                                         |
| F5  | Practice in four places            | **Still open.**                                                                                                                     |
| F6  | Vocabulary                         | **Partly.** The bench tab is always "Staff". Fan scales, pulse words, counters and the deadline copy remain.                        |
| F7  | Combine's precise POT              | **Partly / unverified.** The board uses dashed staff-read badges; the Combine tab wasn't reachable after the draft.                 |
| F8  | Duplicate Coach of the Month mail  | **Still open.**                                                                                                                     |
| F9  | Uppercase kickers                  | **Fixed.** No `text-transform: uppercase` left in `src/ui`.                                                                         |
| F10 | Search misses                      | **Still open.**                                                                                                                     |
| F11 | Rows over one meta line            | **Partly.** The FA list now starts at y≈670 (was ≈1400). Re-sign, draft and Growth rows remain.                                     |
| F12 | Touch targets                      | **Still open.**                                                                                                                     |
| F13 | Slab and ticker contrast           | **Still open:** 3.8-4.0:1 and 2.50:1.                                                                                               |
| F14 | Nested stats scroll                | **Still open.**                                                                                                                     |
| F15 | Team page tab row clips            | **Still open.**                                                                                                                     |
| F16 | No h1 on Today; radio tabs         | **Still open.**                                                                                                                     |
| F17 | Difficulty grid                    | **Still open.**                                                                                                                     |
| F18 | Sheets and floaters                | **Changed.** Release is an in-place confirm (good). The playoff dock line still truncates; the new draft FAB covers row buttons.    |
| F19 | Hardwood cheap spots               | **Partly.** Name bar gone; squeezed tiles and the Career kicker wrap remain.                                                        |
| F20 | Copy density                       | **Still open, arguably worse:** the new youth-minutes call is 7 lines.                                                              |

**New since round 3:**

- **Better:** the "Out:" line on Today's next game, staff-read badges, "Staff still measuring · 88%", draft-night offers on the slab, the hatched hot seat.
- **New problems:**
  - mid-word name breaks;
  - the "(role)" leak from the ledger, which now survives close and logs roster moves;
  - subjectless toasts;
  - the FA floating advance bar replacing the dock.

## 5. What it would take to reach 9/10 in this lens

1. **A "nothing looks broken" gate (S-M).** Fit-to-width headlines in place of `longWord`, the "(role)" fix, and a CI check on the longest names at 320/360/390 and 120% text. This removes the screenshots that make a polished app look unfinished.
2. **Flatten Tactics for real (M).** One tab row inside Tactics, with the HeadSwitch folded into the content.
3. **A copy and vocabulary pass (S).** Verdict-first calls, the staff's call as the solid button, toasts that name the change, one fan scale, labelled counters, one advance verb, one Practice home, deduplicated mail.
4. **An accessibility floor (S-M).** 44px hit areas, slab labels at 0.88 white, the ticker in paper ink, tablist semantics, per-route titles, an h1 on Today, a text-size setting.
5. **Search vocabulary and a tablet two-pane layout (M-L).**

## 6. What I couldn't verify, and how I tested

**How I tested:**

- **The career.** A Pistons real-league save created through the UI at 390×844.
  - Guide steps, the release with confirm, the opener's plan.
  - The opener watched live: intro, coach marks, all four bench tabs, skip sheet, sim to final, game report.
  - Simmed to the deadline through staff-call stops, then the play-in, playoffs (lost 2-4 to ORL), lottery, draft (staff's pick, then auto-draft), re-sign and FA day 1.
- **Crawls (`audit.mjs`).** 46 routes at 390, 360 and 820, plus 15 at 320, with reduced motion on. Checked errors, boundaries, overflow, truncation, tap targets, headings, tab rows and axe-core 4.13.
  - The "unnamed controls" counts in the logs are a false positive of my innerText heuristic; Playwright ARIA snapshots (`aria.mjs`) show every control named.
- **Word breaks (`wordbreak.mjs`).** Every other team's page and matchup, the 8 longest names and key screens, at 390 and 360.
- **Contrast.** Axe on every other team's page returns "incomplete" for slab text, so I computed slab contrast by hand for 11 team colours and pixel-sampled the live ticker.
- **Other checks.**
  - colour blindness (`cvd.mjs`): Machado deutan/protan on 8 screens;
  - keyboard (`kbd.mjs`);
  - search (`search.mjs`): 54 queries;
  - inbox copy (`copy.mjs`, `cotm.mjs`).
- **Load.** The machine was shared, so I made no timing claims. I used `window.__hc.store` only to read state; every action went through the UI.

**Not verified:** landscape live, the Combine tab, RFA offer sheets, firing, the fictional league, real VoiceOver/TalkBack speech, and Android WebView text zoom on a device.

The screenshots and side-by-side sheets are in `shots/`, `sheets/` and `audit/` under the scratch folder named at the top. The raw crawl data is in `audit/p390.json`, `p360.json`, `t820.json` and `p320.json`.
