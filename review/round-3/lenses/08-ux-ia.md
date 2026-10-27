I visited all 34 route patterns (95 route variants on phone and on tablet), the offseason states, the draft with scouting, a live game and the search. Everything is in my scratch folder; the full report follows.

# UX / IA lens — round 3

## 1. Verdict

As an interface this is now a confident, good-looking app. The numbers you check most agree across screens:

- **Chance to win** reads 79% on Today, Games, Matchup and Scores, and 80/82% on the live scorebug as the game moves.
- **Needs you**: the bell badge and Today both say 3.
- **No console errors** anywhere: 95 route variants each on phone and tablet, the playoffs, draft lottery, draft night, re-sign, free agency and a live game.

The two round-2 complaints that most needed fixing are fixed. League now has five tabs that fit a 390px phone. Rating tiers now separate by lightness and badge weight, not hue alone.

What keeps it from 9 is mostly the same set of problems as round 2:

- **Tactics** still stacks three navigation layers.
- **Today** is still about 8 blocks with two solid primary buttons.
- **The "finish" pass missed spots.** Records still break at the hyphen in two places, and two tracked-out capitals rules survive.
- **New issues.** For a red-green colour-blind player, `--bad` and `--warn` collapse into each other, and green team slabs collapse into the gold tier.
- **Polish debt** in copy and search.

**Score: 7.8/10** (round 2: 7.5). Real structural gains (League, tiers, history, glossary, report board, Finances) against unfinished vocabulary, depth and layout-break work.

## 2. What's genuinely great (protect these)

- **One chance to win everywhere**, at game time −1 day and on game day. Today says "79% to win" and then "Chance to win 79%". Games, Matchup and Scores ("BOS 79% to win") agree, and the live scorebug moves from there. Matchup's "Playoffs 56%" for MIN matches the Odds table's 56% (`live.log`).
- **One "Needs you" count.** The bell is 3 and the sheet shows the deadline call, "2 trade offers: ATL, MEM" as one row, and backup (`shots/misc-bell.png`).
- **The posters**, which are where Hardwood is stunning:
  - the split-colour game board with court lines (`mid-phone/games.png`, `matchup-next.png`);
  - the player slab with its giant "#0" and white OVR card (`player-mine.png`);
  - the draft-night "#28 You're up" slab (`off/draft-draft-fold.png`);
  - the News front page (`news-fold.png`);
  - "Cavaliers lead the East · 3.5 games clear" (`league.png`);
  - the History champion slab over 80 seeded seasons (`history.png`).
- **The live game** (`shots/live-03-live-8.png`): an ink scorebug with labelled Timeouts/PF, "To win MIN 20% ··· 80% BOS", a maple court in team paint, one bench bar. In landscape it splits cleanly into court plus console (`live-07-landscape.png`).
- **The roster grid and OVR key** (`team-roster.png`). Under Machado deuteranopia the tiers still read as a ladder: solid, solid, wash, wash, hairline, plain (`shots/cvd/roster-deutan.png`).
- **The prospect sheet** (`shots/draft/mid-prospect-sheet.png`): "Staff read: OVR 70-76 · POT 80-92 / Not scouted yet. The more they watch, the narrower the range. / Scout him (0 of 5 out)". This is a model of honest uncertainty in a UI.
- **Glossary coverage.** There are 101 hand entries plus generated playbook and role entries. "heliocentric", "five-out", "movement shooter", "glue guy", "fluid", "partnership", "STA", "GB", "PER" and "Win shares" all resolve in search.
- **Empty and error states are one line**: "That player is no longer in the league." Legacy routes redirect (`/gameplan/17` → `/games/17`, `/roster` → `/team`); `/nope/xyz` goes to Today.

## 3. Findings (most severe first)

**1. Tactics is still three navigation layers deep before any content (P1)**

- **What you see on `/team/tactics`, top to bottom** (`mid-phone/tactics-tactic-fold.png`, `tactics-instr.png`, `tactics-analysis.png`):
  1. a 120px green "Celtics" name bar;
  2. the hub tabs (Roster / Rotation / Tactics / Lineups / Growth);
  3. the hero or the compact tactic row;
  4. the section chips (Tactic / Instructions / Match / Analysis);
  5. a third switch, depending on the section:
     - Tactic: In / Out of possession;
     - Instructions: In possession / Transition / Out of possession;
     - Analysis: Report / Familiarity / Season.
- **On the first screen of the Tactic section the board is not visible at all.** The fold ends at the section chips.
- **The commit's claim is true only narrowly.** "Two control rows on a phone" holds for the hero, but DESIGN's rule is "one row of tabs; a boxed Segmented under it at most", and Tactics breaks it.
- **The board itself:**
  - role labels are 10.4px and stars 10px; the empty stars are at 1.52:1 contrast (audit `tactics-tactic`);
  - the hero says "Familiarity 99% Fluid" while the board card says "The baseline shape · 100% fluid";
  - the shape reads "4-Out, 1-In" under a playbook called "Five-Out Motion" (`mid-tablet/tactics-tactic.png`).
- **Why it matters:** this is the pitch screen, and it takes a scroll and three choices before you see a lever.
- **Fix (M):**
  - give the four sections their own paths under the hub bar;
  - drop the name bar on non-roster sections;
  - put In/Out or the phase switch as the board's heading, as DESIGN describes;
  - raise board labels to 12px and drop the stars for one fit figure.

**2. Records and ranges still break at the hyphen (P1, a visible "broken" moment)**

- **Games hub:** "Season 1-0 · 2 left · last W 134- / 133" (`crops/games-meta.png`). Cause: `ui/games/GamesHub.tsx:173` renders `seriesLine` without `keep()`. The Matchup slab renders the same string correctly.
- **Draft board:** "proj. #37- / 48" and "#40- / 49" (`crops/draft-rows.png`). Cause: `ui/draft/common.ts:72` builds the range with no non-breaking hyphen.
- **Status:** the finish commit claimed this class of bug was fixed at the root.
- **Fix (S):**
  - wrap both strings in `keepFigures`;
  - add a lint or test that every `-`-joined figure passes through it.

**3. Red-green colour-blind players lose the signals and the job-security meter (P1)**

- **`--bad` vs `--warn` under deuteranopia: ΔE2000 3.1** (`cvd.py`). Red and the dark orange read as the same brown. Where it bites:
  - Re-sign's "Over the cap $66.1M" (warn) sits beside "Luxury tax $14.3M" (bad) (`off/resign-resign.png`);
  - the job-security bar's red "fired" zone, warn zone and green "safe" zone all render the same olive; only the blue middle differs (`shots/cvd/owner-deutan.png`).
- **Team green vs gold tier.** Under deutan, Celtics green becomes olive, the same family as the gold elite tier. Tatum's gold 90 badge sits on a slab of nearly its own colour (`cvd/player-ratings-deutan.png`), and the red inbox count turns olive too.
- **Tritan:** good vs info ΔE 4.9.
- **Grayscale:** `--good` = `--info` (ΔE 0.0), and tier text colours collapse (good = low, elite = bad). Badges survive by weight; plain `ratingTone` text in tables does not.
- **Status:** the "a step darker" change separated bad and warn from gold, but not from each other.
- **Fix (S-M):**
  - shift `--warn` toward a lighter amber or yellow-ochre;
  - give the security bar zone ticks or labels ("Hot seat", "Safe") and a pattern on the danger zone;
  - add a white keyline to elite badges on slabs.

**4. Today is still over the complexity budget, with two solid primaries (P2)**

- **What's there, mid-season** (`mid-phone/today.png`, 2.3 screens), against the budget of one hero and ≤5 blocks:
  - result slab, story and statline;
  - Needs you (a call card with two buttons);
  - the backup card (a second solid primary: "Stand pat" and "Export backup" are both ink pills);
  - Next game;
  - Your season;
  - News;
  - More (Practice, While you were away, From your staff, Glossary).
- **On deadline day the decision is below the fold.** The first screen is last night's 116-96 and "Trade deadline: today" starts at y≈1250 under a giant final.
- **The Play options sheet repeats the two primaries:** "Stand pat" and "Sim to next game" are both solid ink (`misc-play-options.png`).
- **Fix (M):**
  - collapse the result to the compact board once a call is open;
  - fold backup into Needs you without its own primary;
  - drop More (Practice belongs to Tactics; the Glossary to search).

**5. Practice lives in four places (P2, round 1 #8 and round 2: still open)**

- **Where it shows up:**
  - Today → More → "Practice Balanced";
  - Matchup → Plan → Familiarity → Practice chips (`matchup-next-plan.png`);
  - Tactics → Analysis → Familiarity → "Practice focus";
  - Finances → Budget → "Practice intensity".
- **Search for "practice" finds only the glossary**, not any of these screens.
- **Fix (S):** one home (Tactics → Familiarity); the other three link to it.

**6. One vocabulary pass is still missing (P2)**

- **The live bench tab has three names.** It is Staff during play, "Report" at a break and "Huddle" in a timeout (`ui/live/BenchBar.tsx:73`; `live-05-timeout.png`).
- **A player has two role-like labels on the same screen:**
  - Tatum's tag says "Shot Creator" while Role & usage and the board say "Secondary Scorer" (`player-mine.png`);
  - a prospect gets "Utility Wing" and then "Slashing Cutter" in the next line (`mid-prospect-sheet.png`).
- **"Round 2 81%" on Today's Your season** is the chance at the owner's goal. It links to Standings, where no "Round 2" figure exists (Odds shows only Playoffs and Title). Cause: `today/FrontPage.tsx:199-201`.
- **Two fan scales:** Owner shows "Fans Electric · 81 of 100" while Finances shows "Hype 64 of 100".
- **The owner pulse is asymmetric.** The level word is unified now ("62 Steady" on Owner, Today and Career), but Owner → Pulse shows "Owner Rising" (a trend word) beside "Fans Electric" (a level word). "Rising" in a 40px headline reads as the owner's mood.
- **Unlabelled counter words.** Matchup counters still read "Even · Always · Add" with no label (`matchup-next-plan.png`).
- **The deadline call contradicts its own buttons.** It reads "The staff's call: buy a player… Nobody the staff asked takes what you can send for one; Find lists who's out there." That is four lines, it names a "Find" tab the player has never seen, and the solid primary is "Stand pat", the opposite of the stated call.
- **Fix (S):**
  - name the bench tab "Staff" always; the break and huddle state goes in its content;
  - drop the archetype tag or merge it into the role;
  - label the goal cell "Win a round 81%" and link it to Owner;
  - "Owner ↗" with no word, as Career does;
  - label the counter cells ("Measured: even · Applies: always");
  - rewrite the deadline call to match its primary.

**7. The draft shows the same staff read two ways (P2)**

- **What you see:**
  - Board: "73 · POT 80-92".
  - Combine (next tab): "OVR 73 · POT 86" as plain numbers (`shots/draft/lottery-Combine.png`). The "staff's read (the middle of its range)" note sits only behind the column's help (`ui/draft/CombineView.tsx:20-21`).
  - The board's badge shows a crisp "73" in a normal tier badge for a 70-76 read.
- **Why it matters:** the numbers rule is that anything before a choice is labelled the staff's read. A sortable precise POT next to a ranged POT invites false precision.
- **Fix (S):** show the range (or "~86") on Combine, and give a staff-read badge a dashed or hollow style.

**8. Inbox: duplicate mail and a capitalisation bug (P2)**

- **Two mails for one event on Feb 1:** "Coach of the Month" (Gabe Hardin) and "You're the East Coach of the Month for January" (League office). DESIGN says "one mail per pitch or event".
- **The first one reads "…Coach of the Month. the Celtics went 11-5…"** with a lowercase "the". Cause: `core/league/legacy.ts:626` concatenates `h.line`, which starts lowercase; the second mail comes from `media/honors.ts:116`.
- **All 36 previews truncate** (audit `inbox`).
- **Fix (S):** drop one of the two mails, capitalise the joined sentence, and use a two-line clamp.

**9. Sentence-case rule broken in two surviving places (P2, round 2 #16: still open)**

- **Today's slab:** `today/today.css:359` (`.td-phase-gk`, uppercase, 0.04em tracking) renders "THE OWNER EXPECTS / OWNER ›" in preseason (`setup-07-today-preseason.png`). After the season it renders "THE OWNER: EXCELLENT / DRAFT BOARD ›" (`shots/draft/lottery-today.png`).
- **The guide kicker:** `components/agenda.css:171` (`.guide-k`).
- **Fix (S):** delete both rules.

**10. Search misses common words (P2, partly fixed)**

- **No result** (from 90 queries in `search.mjs`): "chance to win", "set package", "crunch", "go-to", "huddle", "assistant", "release", "legacy", "hall of fame" (Career shows "Hall of Fame case" and History has a Hall of Fame tab), "coach of the month", "fans", "pulse", "sound".
- **Wrong result:**
  - "scout" → Matchup only, never the draft's scouting;
  - "fired" → Fred VanVleet;
  - "glossary" → League file, not the glossary sheet;
  - "practice" → the glossary only.
- **Fix (S):** add `also` words in `ui/search.ts` SCREENS, add a Glossary screen entry, and match "scout" to both screens.

**11. Rows over the one-meta-line rule (P2)**

- **Awards → Honors:** 46 rows with two lines of meta (`awards-honors-fold.png`; 6.4 screens).
- **Draft board:** rows run "PF · 20 ↓2 · proj. #15-24 · 94% gone by your #26" over two lines (`mid-phone/draft.png`).
- **Re-sign:** rows are 5-6 lines (stat line, TS%, ask, "was", Renounce/Negotiate, then a Qualifying-offer row) (`off/resign-resign.png`).
- **Free agency, day 1:** the first player row starts at y≈1400. Above it are a giant "$47.3M over the cap", a statline, an empty-looking "Latest signings" card and a segmented control. The list is 4.7 screens (`off/freeAgency-fa-fold.png`).
- **Growth:** the only content of each row is cut ("No change this month; three-point …", 7 truncations).
- **Fix (M):** one meta line per row with detail in the sheet; on FA, lead with the list and put the cap figure in the statline.

**12. Touch targets under 44px (P2, round 2 #12: still open)**

- **Counts across the phone crawl:** 539 under-44 hits.
- **What they are:**
  - sort headers `.th-sort` at 15-51 × 17px, up to 39 per page (Stats, Box, Rotation, player Stats/Games);
  - back buttons `.iconbtn.back` at 42×42 (31 pages);
  - switches `.toggle` at 48×28;
  - box-score `.bx-link` at 102×38;
  - News headline links `.lg-news-head` at 358×20;
  - Rotation's row arrows `.tm-rup` at 40×57.
- **Fix (S):** a whole-cell `::after` hit area for sort headers, a 44px back button and switch wrapper, and the whole News row as the link.

**13. Contrast misses on team slabs and the live ticker (P2)**

- **Slab labels.** Slab micro-labels (`.k` "PTS/REB/AST/TS%", `.tm-hh-k` "Roster · full / Payroll", `.tm-hero-note`, Career's `.over`) are white-alpha text at 12px, measured at 3.97:1 on Celtics green.
- **Other teams.** At 4.09:1, "· Moda Center" (`lg-team-arena`) on Portland's red slab is also under 4.5:1.
- **Live ticker.** The ticker time "7:30 PM" in green on the dark bar is 2.68:1.
- **Disabled pill.** "Offers (0)" on the draft slab is a faint ghost.
- **Fix (S):** full-opacity white for slab labels (or 13px semibold), and ticker time in `--paper-ink`.

**14. League → Stats → Players still scrolls inside the page (P3, round 2 #21: still open)**

- **What you see:** 100 rows sit in a box about 11 rows tall, above a footer reading "Top 100 of 321 players". "S. Gilgeous-Al…" is still truncated (`stats-players.png`).
- **Fix (S):** let the table grow on phones and keep the header sticky against the page.

**15. Other teams' pages: the tab row clips (P3)**

- **What you see:** `/teams/:tid` has six tabs, and at 390 wide the row reads "Overview Roster Schedule Picks Mov… ›", with History hidden (`teamview.png`).
- **Same pattern elsewhere:**
  - Inbox chips clip ("Co…");
  - History chips clip ("Co…" for Coaches);
  - the News filter chips clip ("Pow…").
- **Status:** League was fixed to five tabs for exactly this reason.
- **Fix (S):** move History to a header link on team pages, as League does.

**16. Today has no h1; page tabs are radio groups (P3, round 2 #20: partly fixed)**

- **Headings.** Today has zero visible h1 (audit), while team pages and God mode now have one.
- **Tabs.** Every page `TabBar` is `role="radiogroup"`/`radio` (`components/ui.tsx:153`); there is not one `tablist` in the app.
- **Fix (S):** a sr-only h1 on Today; `tablist`/`tab` or links with `aria-current` for page tabs.

**17. Settings → Difficulty grid is still cramped (P3, open since round 1)**

- **What you see:** the Hard row reads "−1 to −5 1 yr" with the cells running together. Headers stack ("Contract / asks", "Opponent / plans"), and units mix ("−12%", "Fair", "None", "+1.5") (`settings.png`).
- **Fix (S):** three radio cards with one line each.

**18. Sheets and empty cards that cost a tap or look unfinished (P3)**

- **The release sheet stays open.** After settling the only required item, it stays up showing "All set. The season can move on." with no button to move on (`setup-12-after-release.png`).
- **Cards around a single line**, against DESIGN's "never a card around a single line":
  - Career's "Upsets, closeouts and titles land here…";
  - FA's "Latest signings" card;
  - the bad-player-id state.
- **The dock's options button floats over content.** On draft night it covers the "Staff read" column head (`crops/draft-fold.png`).
- **The playoffs dock** shows a clipped focus outline (two green vertical lines) beside its chevron, and the sub-line truncates "Game 1 · vs ORL (serie…" (`crops/po-dock.png`).
- **Fix (S):** close the sheet when it empties (or show the next step's button there), remove those cards, and give the options button a gutter above lists.

**19. Hardwood: where it's cheap (P3)**

- **The Team hub's name bar.** A 120px green bar that only says "Celtics" opens all five Team sections (`tactics-tactic-fold.png`, `team-growth.png`). It is decoration with no information, and it pushes Tactics below the fold.
- **The tactic hero is misaligned.** The centred title, a left "A ▾" pill on a lower baseline, and "Change" under the subtitle look unbalanced (`tactics-tactic-fold.png`).
- **Shot profile and Tempo levels** squeeze 12px condensed labels into tiles ("Lots of twos", "Fewer / threes"), and the filled-meter look reads as disabled.
- **Lineups' net column has no fixed width,** so names start at different x positions (`team-lineups-fold.png`).
- **"Key / players"** wraps under the column heads on team pages (`teamview.png`).
- **The Career slab kicker wraps** ("Celtics · season 1 · / Normal" and "Season by / season").
- **The free-agency hero** is a giant black "$47.3M" for how far over the cap you are.
- **Fix (S):** cut the name bar on non-roster sections, fix-width the figure columns, and allow at most one line for slab kickers.

**20. Copy density in the staff's prose (P3)**

- **What you see:**
  - Report → Why's first item runs 3-4 lines;
  - the deadline call runs 4 lines;
  - Scout's "Runs Heliocentric at a moderate pace" uses Title-Case jargon mid-sentence;
  - the live "Keys to the game" says "Crash the offensive glass · 0% so far · goal ≥ 28% · On track" at 11:05 in Q1.
- **Fix (S):**
  - a two-line cap with More;
  - lower-case playbook names in prose, or a `Term`;
  - "Too early" instead of "On track" before about 10 possessions.

### Complexity budget: violators (phone, counted below the hero)

| Screen                   | Height      | Over budget by                                                                                                    |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| Today, mid-season        | 2.3 screens | 7 blocks; 2 solid primaries; call below the fold                                                                  |
| Tactics (any section)    | 1.4-2.8     | 3 navigation layers plus a 4-control hero                                                                         |
| Report → Why             | 2.2         | 7 sections (What decided it, Four factors, Player grades, Adjustments, Play types, Your lineups, Momentum swings) |
| League → Stats → Leaders | 3.6         | 9 leaderboards                                                                                                    |
| Finances → Budget        | 1.8         | 6 sections                                                                                                        |
| League → News            | 7.2         | 4 sections with a long Latest list (`news.png`)                                                                   |
| Awards → Honors          | 6.4         | 46 rows with 2 meta lines each                                                                                    |
| Free agency (day 1)      | 4.7         | 4 blocks before the first row; rows of 2-3 lines                                                                  |
| Re-sign (offseason)      | 2.2         | rows of 5-6 lines                                                                                                 |
| Player → Stats           | 2.2         | 8 top-level blocks                                                                                                |
| Play options sheet       | n/a         | 2 solid primaries                                                                                                 |

### Taps to common tasks (phone)

| Task                   | Taps                                           |
| ---------------------- | ---------------------------------------------- |
| Last box score         | 2 (Today slab → Box)                           |
| Plan the next opponent | 2 (Today Next game → Plan)                     |
| Rotation               | 2                                              |
| Change playbook        | 3 (Team → Tactics → Change)                    |
| Start a trade          | 2 (Office → Make a trade, or Desks → Trade)    |
| Playoff odds           | 2 (League → Odds chip)                         |
| Practice focus         | 1 plus a scroll (Today → More), or 3 elsewhere |
| Scout a prospect       | 3 (Office → Draft → row → Scout him)           |
| Crunch-time go-to      | 4 (Team → Tactics → Match → Go-to player)      |
| Sign a free agent      | 3-4                                            |

All reasonable, except that depth in Tactics makes its sub-settings the slowest in the app.

## 4. Since round 2

| #   | Round-2 finding                                 | Now                                                                                                                                                                                |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Finances hero overlaps its caption              | **Fixed.** Cash, then Books close stacked (`finances.png`).                                                                                                                        |
| 2   | Compact report board "L… / L…"                  | **Fixed.** "GSW 96 [W +20] 116 BOS" (`report-mine-why-fold.png`).                                                                                                                  |
| 3   | Tactics 4 control rows                          | **Partly.** A/B/C slot pills became "A ▾" in the hero; hub tabs + section chips + a phase/side/view switch remain (F1). Board text is still 10px. The sticky ghost text is fixed.  |
| 4   | Owner "47 Steady" vs "Watchful"                 | **Mostly fixed.** One ladder (`legacyPulse.ts:51`); Today and Career say "Steady". Owner → Pulse's "Rising" trend word is a new asymmetry (F6).                                    |
| 5   | Tactic hero hides a custom defense              | **Not verified.** My team ran an unedited 2-3 Zone.                                                                                                                                |
| 6   | League 8 clipped sections                       | **Fixed.** 5 tabs, Awards/History as header links, the chip row fits. "Scores" is still `/league/schedule` (cosmetic).                                                             |
| 7   | Headline mid-word breaks, records at the hyphen | **Partly.** "East champion" and playoff headlines are fine; "last W 134- / 133" (Games) remains and "proj. #37- / 48" (draft) is new (F2).                                         |
| 8   | Tiers hue-only, near signals                    | **Mostly fixed** for the ladder (lightness + weight; verified by simulation). **New:** bad vs warn under deutan ΔE 3.1, the security bar collapses, green slabs vs gold tier (F3). |
| 9   | Complexity budget                               | **Still open** (table above).                                                                                                                                                      |
| 10  | Truncation of content                           | **Still open.** Growth 7, Inbox 36, "S. Gilgeous-Al…", "Three-point shoo…". The dock sub-line now fits mid-season but truncates in the playoffs.                                   |
| 11  | Growth hero contradicts its row                 | **Fixed.** The hero player is no longer repeated in the list.                                                                                                                      |
| 12  | Touch targets                                   | **Still open** (F12).                                                                                                                                                              |
| 13  | Search misses                                   | **Partly.** Glossary words now resolve; screen words and "hall of fame", "release", "fired", "glossary", "practice" still miss (F10).                                              |
| 14  | Same concept, different names                   | **Partly.** The "p clinched play-in" legend is fixed and Heliocentric is glossed; Staff/Huddle (now also "Report"), role vs archetype and "Even · Always" remain (F6).             |
| 15  | Glossary gaps                                   | **Fixed** (STA, GB, PER, WS, Closer, roles, Fluid, Junk defense all present).                                                                                                      |
| 16  | Uppercase kickers                               | **Still open** (F9); the second rule now also shows on the season-review slab.                                                                                                     |
| 17  | Difficulty grid cramped                         | **Still open** (F17).                                                                                                                                                              |
| 18  | Live chips close in colour                      | **Not reproduced** (MIN blue vs BOS green are distinct).                                                                                                                           |
| 19  | Copy that makes you decode                      | **Partly.** Rotation's "240 of 240 min" is fixed and "closer" tags are gone; "Even · Always" remains; the deadline call is new (F6).                                               |
| 20  | Tabs as radiogroups, no h1                      | **Partly.** Team pages and God mode have an h1; Today does not; still no tablist (F16).                                                                                            |
| 21  | Nested stats scroll                             | **Still open** (F14).                                                                                                                                                              |
| 22  | Tablet = stretched phone                        | **Still open, by design.** The same single column at 820 is clean (`mid-tablet/today-fold.png`).                                                                                   |

**New since round 2:**

- **Better:**
  - History seeded with 80 champions (`history.png`);
  - a living draft with scouting ranges;
  - live landscape layout.
- **Worse or new problems:**
  - the CVD signal and slab collisions (F3);
  - Combine's precise POT (F7);
  - duplicate Coach of the Month mail and the lowercase "the" (F8);
  - "Round 2 81%" with no home (F6);
  - draft hyphen wraps (F2).

## 5. What it would take to reach 9/10 in this lens

1. **Flatten Tactics** (M). Sections as paths, no name bar, the board above the fold with In/Out as its heading, 12px board labels. The pitch screen becomes usable one-handed and passes its own budget.
2. **A "finish for real" sweep with tests** (S). `keepFigures` on every figure join (GamesHub, draft ranges); delete the two uppercase rules; a two-line clamp on Growth and Inbox; a static check that flags `text-transform: uppercase` and `-` joins outside `keepFigures`. This removes the screenshots that make it look unfinished.
3. **A colour-blind signal pass** (S-M). Move `--warn` to a lighter amber, mark the security-bar zones with ticks or patterns, give elite badges a keyline on slabs, and add a CVD check to CI beside the tier check. That covers the roughly 8% of men with red-green colour blindness on the screens that carry stakes.
4. **The vocabulary pass** (S). One bench tab name; role and archetype merged; practice in one home; label the goal-odds cell; "Even · Always" labelled; one fan scale; the deadline call's copy matching its primary; Combine showing ranges.
5. **The Today and long-list budget** (M). Today down to hero, Needs you, Next game, News, with one primary; News and Honors paged at about 20; FA leading with its list; Re-sign rows down to one meta line; whole-cell sort headers and 44px back buttons and switches.

## 6. Route table (phone 390×844; every route also at 820×1180; zero console errors on all)

| Route                                                          | Screens (phone) | Verdict                                                             |
| -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| `/start`, `/new`                                               | 1-2             | Bold, clear; team grid with roster rank                             |
| `/` Today (preseason / mid / game day / lottery / draft)       | 1.2-2.3         | Gorgeous final slab; 7 blocks, 2 primaries; uppercase kicker; no h1 |
| `/inbox`                                                       | 4.0             | Clean list; duplicate Coach of the Month; all previews cut          |
| `/settings` (Game / Live / League)                             | 1.1-1.7         | Clear; Difficulty grid cramped                                      |
| `/god`                                                         | 1.0             | Fine                                                                |
| `/team` Roster (Players / Ratings / Stats / Contracts)         | 1.5-1.9         | Best list in the app; slab labels 3.97:1                            |
| `/team/rotation`                                               | 2.3             | Clear; 31 small arrows and sort heads                               |
| `/team/tactics` Tactic / Out                                   | 2.7-2.8         | Board below the fold; 3 nav layers; 10px labels; 99% vs 100% fluid  |
| Tactics Instructions (3 phases)                                | 1.4             | Good surfaced decisions; squeezed level tiles                       |
| Tactics Match                                                  | 1.4             | Fine                                                                |
| Tactics Analysis (Report / Familiarity / Season)               | 1.9-2.2         | Rich grades; 4th layer of tabs; practice duplicated                 |
| `/team/lineups`                                                | 2.1             | Useful; ragged figure column                                        |
| `/team/growth`                                                 | 1.6             | Hero fixed; every row truncated                                     |
| `/player/:pid` (5 tabs; mine / other / FA / prospect)          | 1.5-2.9         | Best slab; role vs archetype; "Three-point shoo…"                   |
| `/compare`                                                     | 2.6             | Strong two-tone slab; bars read well                                |
| `/games`                                                       | 2.1             | Excellent board; "134- / 133" wrap                                  |
| `/games/:tid` Preview / Scout / Plan / Matchups                | 1.4-2.9         | Strong; "Even · Always" unlabelled; practice duplicated             |
| `/live` (play / timeout / landscape)                           | n/a             | The best screen; Staff → Report → Huddle renames; 2.68:1 ticker     |
| `/game/:gid` Debrief / Why / Box / Shots / Flow / PBP          | 1.3-3.2         | Compact board fixed; Why has 7 sections; sort heads 17px            |
| `/league` Standings (E / W / League / Power / Odds / Lottery)  | 1.7-3.8         | Five tabs fit; Odds table mixes "POR" / "MIN" with full names       |
| Playoffs (mid / live postseason)                               | 1.7-1.8         | Clean bracket; playoff dock sub-line cut                            |
| Cup                                                            | 2.6             | Fine                                                                |
| Stats (Leaders / Players / Teams / Ratings)                    | 1.4-5.8         | 9 leaderboards; nested scroll; 39 small sort heads                  |
| Scores                                                         | 1.1             | Consistent odds                                                     |
| News                                                           | 7.2             | Beautiful front page; long wall                                     |
| Awards / Honors                                                | 2.6 / 6.4       | Lovely MVP slab / 46 two-line rows                                  |
| History (Seasons / Teams / Records / HoF / Coaches / a season) | 1.0-3.3         | Now rich (80 champions); chips clip "Co…"                           |
| `/teams/:tid` (6 tabs)                                         | 1.2-3.4         | Beautiful slab; tab row clips, History hidden                       |
| `/office` (season / draft / re-sign / FA)                      | 1.5-2.0         | Good desk hub                                                       |
| `/office/trade` (Build / Find / Offers)                        | 1.4-4.1         | Strong; truncated names with tags                                   |
| `/office/free-agents` (season / FA day 1)                      | 3.5 / 4.7       | List starts below 4 blocks; floating advance bar                    |
| `/office/resign` (season / phase)                              | 1.0 / 2.2       | Rows of 5-6 lines; warn and bad side by side                        |
| `/office/draft` (season / lottery / live)                      | 1.8-4.3         | Draft night stunning; "proj. #37- / 48"; Combine POT precise        |
| `/office/finances` (3 tabs)                                    | 1.0-1.8         | Overlap fixed; "Hype 64" vs "Fans 81"                               |
| `/office/owner`                                                | 1.6             | Clear meter; collapses under deutan; "Rising" vs "Steady"           |
| `/office/career` (3 tabs)                                      | 1.0-1.8         | Good; kicker wraps; card around one line                            |
| `/office/assets` (2 tabs)                                      | 1.0-2.3         | Fine                                                                |
| Legacy routes, `/nope`, bad ids                                | n/a             | Redirect, or one-line empty states                                  |

## 7. What I couldn't verify, and how I tested

**How I tested:**

- **My own save.** A Celtics real-league save made through the UI: released 2 at the agenda, then simmed to the deadline (Feb 11, 38-17).
- **Crawls.** `crawl.mjs` covered 95 route variants at 390 and at 820 wide, each with a full-page screenshot, a fold screenshot, a DOM audit and console capture → `audit-mid-phone.json` and `audit-mid-tablet.json`. The audit checks font sizes, contrast, 44px targets, truncation, unnamed controls, h1s, block, primary and control-row counts, and multi-line meta.
- **Live game.** `live.mjs`: game day, then live play, a timeout, landscape and Leave, checking chance to win on 5 screens.
- **Offseason.** `off.mjs`: deadline → play-in → playoffs (lost the Finals in 7) → lottery → draft → re-sign → free agency → preseason 2028.
- **Draft.** `draft.mjs`: the mid-season prospect sheet and tabs, then the lottery's Board, Combine and Mock tabs, then draft night. This was a separate run from a copy of the deadline save.
- **Search.** `search.mjs`: 90 queries.
- **Colour blindness.** `cvd.mjs` and `cvd.py`: Machado protan, deutan and tritan plus grayscale, as on-screen filters and as ΔE2000 maths over the tokens.
- **Other checks.** `misc.mjs`: sticky stacks, bell, Play options, focus, Career.
- **Load.** Timings were taken on a machine shared with nine other reviewers, so they are noisy.
- **Where things are.** Everything is under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/ux-ia/`: screenshots in `shots/mid-phone`, `shots/mid-tablet`, `shots/off`, `shots/draft`, `shots/cvd` and `shots/live-*`; crops in `crops/`.

**Not verified:**

- The custom-defense label on the tactic hero (my team ran an unedited 2-3 Zone).
- RFA offer sheets, a fired coach's screens, and the fictional league.
- A real screen reader: roles and names were checked only in the DOM.
- Hardware Back in the native shells.
- Colour blindness with real people (simulation only).
- My contrast heuristic falsely flagged text on split slabs (1.1-1.15:1 on board numbers); I discarded those after looking at the screenshots.
