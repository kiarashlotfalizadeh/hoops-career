# Hoops Career: UX / IA review (lens `ux-ia`)

I couldn't save this report to `REPORT.md`: the tool refused, because sub-agents have to return reports as text. The full report is below. Screenshots and scripts are in my review folder; nothing was written to the repo.

Screenshots: `S = /private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/ux-ia/shots`

- `$S/phone/<route>.png` is the first screen; `<route>-full.png` is the whole page.
- `$S/tablet/...` is the same at 820x1180.
- `$S/i-*.png` are the interaction probes.

Save used: Lakers, 2026-27, simmed to Feb 6 (game 54 of 82, 30-23, 6th West). That is the trade-deadline stop, 5 days before the deadline.

## 1. Verdict

This is a confident, well-built interface. The Hardwood system mostly works: the team slabs, the split-colour game boards and the live court are the best-looking screens I have seen in a sports sim. The foundations are better than most shipped apps: no console errors on 88 routes at two viewports, working legacy redirects, a sensible Back after a deep link, scroll restoration, focus management and reduced motion. Three things let it down:

- **The same number disagrees with itself across screens.** The chance to win changes from 31% to 29% just by opening the Matchup page. Playoff odds read 72%, 74% and "75% even with a loss" at the same time.
- **Search shows ghost rows.**
- **The complexity budget is broken exactly where the depth lives.** Today, Tactics, Matchup, the Game report and League are all over it. The usual cause is a tall hero repeated above every sub-tab, which pushes the tab content down to, or under, the dock.

**Score: 7/10.** The craft deserves an 8 or 9. The number inconsistencies and over-stacked depth screens cost the player's trust in what they read, and that trust is the game's pitch ("tells you why").

## 2. What's genuinely great (protect these)

- **Zero runtime errors.** 88 route variants × 2 viewports gave no page errors and no console errors. The only console output was a React duplicate-key warning from search (finding 2). No route overflows sideways at 390 or 820.
- **Back behaves.**
  - Back from a deep link goes to the section's fallback (`/player/19` → `/team`), not out of the app (`nav.ts:10 useBack`).
  - Back inside the app restores scroll exactly (320px → 320px).
  - All 13 legacy routes redirect correctly.
  - Bad ids get calm one-line empty states ("That player is no longer in the league.").
- **Accessibility foundations.**
  - Sheets are proper modal dialogs: they take focus, close on Esc and return focus to the button that opened them.
  - Focus moves to `<main>` on every route change.
  - Reduced motion is honoured globally (`styles/tokens.css:244`).
  - Switches have proper roles and labels.
  - All text colours pass AA contrast (`--text-dim` 5.5:1, `--brand` 4.7:1).
  - The bottom nav lights the right tab for a player's page: Team for yours, League for anyone else.
- **The posters.** These are the app's identity:
  - the player slab, with its giant jersey number and OVR card;
  - Today's 31% hero;
  - the Games/Matchup split board;
  - the final-score board;
  - other teams' slabs in their own colours.
- **The live game** (`$S/i-live-1.png`, `$S/i-live-landscape.png`, `$S/i-live-tablet.png`):
  - a broadcast scorebug with labelled figures, a big maple court and one bench bar;
  - it goes two-column in landscape;
  - it is the best screen in the app.
- **One "Needs you" count.** The bell badge, Today and the Play options sheet show the same 2 items in the same order.
- **Search is forgiving where it matters.** "doncic", "sga" and "wemby" find the players; "minutes" finds Rotation; "save" finds League file; "mle" finds the glossary entry.
- **Cross-links follow the IA.**
  - Matchup links to "Team page", and another team's slab has Matchup and Trade buttons.
  - The Office slab has a "Cap sheet ›" link.
  - A player page has Trade and Release under Contract.

## 3. Findings (most severe first)

### 1. The same figure shows different values on different screens (P1)

- **Chance to win.**
  - Today and Games say **31%** (`$S/phone/today.png`, `games-full.png`).
  - Matchup, League → Scores and the live scorebug say **29%** ("SAS by 8.4 projected", `matchup-full.png`).
  - It is order-dependent. In a fresh session Today shows 31%; after one visit to `/games/26`, Today shows **29%**.
  - A direct call of `gameProjection` moves from margin 7.54 (win 0.693) to margin 8.41 (win 0.713) (`probe5.mjs`).
  - Every one of these screens calls the same `gameProjection(league, g)` with the same game (`today/NextGame.tsx:210`, `games/GamesHub.tsx:132`, `games/Matchup.tsx:131`, `league/Schedule.tsx:123`). So something in the Matchup page's lazily loaded code changes the projection as a side effect.
- **Playoff odds on one Today page.**
  - The deadline card says **72%** — a stale Feb 1 snapshot (the Odds chart is captioned "72% on Feb 1").
  - "Your season" says **74%**.
  - Matchup's "What it's worth" says "**81% with a win, 75% with a loss**". Both are above the 74% shown as today's odds, which is impossible.
- **Free agents.** Office says "**19** on the market"; the Free agents screen says "**20** available" (`office-full.png`, `office-fa.png`).

**Why it matters:** DESIGN.md promises "one chance to win… A screen never computes its own", and the pitch is honest numbers.

**Fix (M):**

- Find the side effect behind `gameProjection` and make the projection pure.
- Make the deadline agenda item read the live playoff odds (`core/league/agenda.ts`).
- Count free agents the same way on Office and the Free agents screen.
- Add a test that compares Today's figures before and after every lazily loaded chunk has loaded.

### 2. Search shows phantom duplicate results above "Nothing matches" (P1)

- Typing "playoff odds" shows **"Player roles" twice**, then "Nothing matches 'playoff odds'." (`$S/i-search-playoff-odds.png`).
- "game plan" leads with an unrelated "Player roles" row.
- **Cause:** React warns "two children with the same key `s:/team/tactics`". `SCREENS` has two entries with `to: '/team/tactics'`, Tactics and Player roles (`src/ui/search.ts:68-77`). `QuickSearch.tsx:105` keys rows by that path, so stale rows stay on screen as the query changes.
- **Fix (S):** give each entry a unique id, or merge Player roles into the Tactics entry's `also` words.

### 3. Depth screens bury their tabs under a repeated hero (P1)

- **Game report.** Every tab repeats the board, headline, dek, Player of the game, statline, "2nd straight win" and "The story".
  - The tab row sits at y≈705 of 844, touching the dock.
  - A deep link to `?tab=box` shows **no box score** on the first screen (`$S/phone/report-box.png`).
- **Tactics.** All four sections repeat the slab, page tabs and the full tactic card. Instructions shows only "Mentality" above the dock (`team-tactics-instr.png`).
- **Career and Matchup** have the same pattern.
- **Fix (M):**
  - When a sub-tab is chosen, collapse the hero to one line.
  - On Tactics, move strengths, weaknesses and the assistant switch into the Tactic section.
  - On the report, keep the board and put headline, Player of the game and statline in Debrief only.

### 4. Tactics stacks four levels of tabs (P1)

On `/team/tactics`, from top to bottom (`team-tactics-full.png`, 2.7 screens):

1. Page tabs: Roster | Rotation | Tactics | Lineups | Growth.
2. Slots: A Main | B + | C +.
3. Section chips: Tactic | Instructions | Match | Analysis.
4. In possession | Out of possession.

Under them:

- the board, with **10px** role labels and stars;
- Partnerships;
- a 10-row Bench list where every row says "100%".

Problems:

- DESIGN.md allows "one row of tabs; a boxed Segmented under it at most".
- The section chips aren't real tabs: the sweep found no tab lists anywhere, so screen readers don't announce them as navigation.

**Fix (M):**

- Make the four sections a real tab bar that replaces the page tabs inside Tactics, or give them their own routes.
- Drop the Bench "100%" column.

### 5. Today is over budget: 7 blocks under the hero (P2)

- **What's there:** hero, headline and plan chip, injury lines, Needs you (2 cards, 4 buttons), From your staff, Your season, News, More (`today-full.png`).
- **Fix (S):**
  - Fold injuries into the hero's meta line.
  - Turn Your season into a one-line strip.
  - Retire "More": Practice belongs to Tactics, and the Glossary is in search and Settings.

### 6. League hides about 30 views behind two scrolling tab rows (P2)

- **Too many sections, clipped:**
  - 8 sections; on a 390 phone the bar cuts off mid-word ("Sco ›"), so News, Awards and History are off-screen.
  - Each section has its own chip row, also clipped ("Lotte", "Co", "Pow").
- **Naming:** the `/league/schedule` route is labelled "Scores".
- **A wasted header:** a ~120px "League" heading that tells you nothing. `league-history.png` is mostly empty under it.
- **Fix (M):**
  - Cut the top row to 5 (Standings incl. playoffs and odds, Stats, Scores, News, History); Cup and Awards become chips.
  - Replace the heading with a poster hero like the other hubs.
  - Rename the route `/league/scores`.

### 7. Six rating scales, and tier colours that change meaning (P2)

- **The six scales:**
  - OVR 40-99;
  - letter grades A+..D (tactic strengths; player game grades on the report's Why tab);
  - 1-5 stars (role fit on the board);
  - percentiles ("99th");
  - percentages (familiarity, "understanding 99%");
  - words (Strong/Good, Fluid, Steady/Content/Buzzing, Superstar/Fringe).
- **Colour thresholds differ:**
  - The OVR key is gold 89+, violet 82, blue 78, green 72, grey 67.
  - The attribute key is "85+ elite · 75+ strong · 64+ solid".
  - So a 76 is a **green** OVR badge but a **blue** attribute bar (`team-roster-full.png` vs `player-mine-ratings-full.png`).
- **Compare** marks the better side with a green pill even on OVR, so a 97 shows in green when its tier colour is gold (`$S/i-compare-full.png`).
- **Fix (M):**
  - Use the 40-99 scale with tier colour for role fit and tactic strengths.
  - Align `ratingTone` thresholds with `OVR_TIERS`.
  - In Compare, bold the winning figure instead of the green pill.

### 8. Practice, the owner and a player's role each live in several places (P2)

- **Practice appears in 5 places:**
  - Today → More (`today/Today.tsx:169`);
  - Matchup → Plan;
  - Tactics familiarity;
  - the pre-game Briefing;
  - the Debrief.

  DESIGN.md places it under Tactics only.

- **The owner shows two different measures that both read 52:**
  - "Job security 52 · Steady";
  - "Owner Content, 52 of 100" — the pulse chart, also on Today (`office-owner-full.png`).
- **A player's role has two names on one page.**
  - The tag under the slab comes from `core/ratings.ts:344` ("Heliocentric Creator").
  - "Role & usage: Primary Creator" comes from tactics.
  - None of "Heliocentric", "Glue Guy", "Hub Big", "Fringe" or "Green light" is in `glossary.ts`.
- **Fix (S-M):**
  - Keep the one Practice control on Tactics; elsewhere show a read-only line with a link.
  - Relabel the owner pulse so it doesn't look like a second /100 score.
  - Drop or rename the archetype tag, and add glossary entries for the role names.

### 9. Sheets stay open on Back and route changes (P2)

- Open search on `/team` and press Back: the page underneath goes to `/league/stats` but the sheet stays up (`$S/i-back-with-sheet.png`).
- On Android and the Capacitor shell, Back is the expected way to dismiss a sheet.
- **Fix (S):** have `Sheet` push a history entry when it opens and close on `popstate`, or close all sheets when `location.key` changes.

### 10. Search misses the words players use for GM tasks (P2)

- "contract(s)" finds only glossary terms — not Roster → Contracts or Re-sign.
- "salaries", "cap sheet" and "extend" find **nothing**, although the Office slab shows "Cap sheet ›" and Re-sign's only buttons say "Extend".
- The Tactics entry's description still says "offense, defense, players, game management" (`search.ts:70`). The real section names are Tactic, Instructions, Match, Analysis.
- **Fix (S):** add the missing synonyms and update the description.

### 11. Text below the 12px floor (P2)

- **10px:**
  - the live scorebug's "Timeouts 7 · Fouls 0";
  - board role names and stars;
  - bracket seeds;
  - the odds chart axis and the Flow tab's axis;
  - "th"/"nd" suffixes.
- **10.5px:** League → Scores card kickers.
- **11px:**
  - roster and rotation column heads;
  - the owner meter labels;
  - the live bench-bar labels.
- DESIGN.md's smallest size (`.tiny`) is 12px.
- **Fix (S):** a 12px floor; replace stars with one figure.

### 12. Touch targets under 44px (P2)

- **"?" Help buttons (~28px):** 13 on Settings, 19 on Tactics Match, 26 on Matchup Scout.
- **Sort headers:** 20-21 per stats table.
- **News:** 183 inline name links.
- **Agenda buttons** are 44px on Today but about 28px in the Play options sheet and on Office. That includes "Stand pat", "Look for a deal", "Accept" and "Turn down" (`$S/i-play-options.png`, `office-full.png`).
- **Fix (S):**
  - Give Help a 44px hit area.
  - Size `AgendaRow` actions the same everywhere.
  - On News, make the headline row the link instead of every name.

### 13. Repeated figures on the same screen (P2)

- **The record.** The top bar always shows "LAL 30-23 · 6th West", yet it is repeated by:
  - the Team slab on all five Team tabs;
  - the Career slab;
  - the Games hero;
  - Today's hero;
  - the Matchup board.

  DESIGN principle 7 says not to.

- **Growth** shows Carr in the hero and again under Rookie watch.
- **The report's Debrief and Why** both open with the same factor rows and the same "Next time" advice.
- **Fix (S):**
  - Show only the team name on the slab on non-roster tabs.
  - Remove the duplicate Carr row from Growth.
  - Make Debrief the summary and Why the evidence.

### 14. Truncation hides the actual content (P2)

- "S. Gilgeous-Al…" in League stats.
- "Mamukelas…" and "Jade… dead money" in Roster → Contracts, where there is room to spare.
- "On waivers · c…" on a free agent: you can't read the terms.
- "Three-point shoo…" and "Offensive reboundi…" in the ratings grids.
- Growth rows like "speed −1, stre…", where the cut text is the only content of the row.
- **Fix (S):**
  - Allow two lines for Growth rows and free-agent tags.
  - Use short rating labels in the grids.
  - Size the Contracts name column with `minmax`.

### 15. Copy slips (P3)

- "The staff's call: buy, but nothing they found works: stand pat or look yourself." Two colons, robotic.
- **Re-sign** is named for what you can't do yet:
  - its subtitle says "Opens after the playoffs" over live "Extend" buttons;
  - its giant figure is "$20.2M Over the cap · 27-28", about next season.
- **Rotation:**
  - "Targets 239 · min, scaled to 240" asks the player to decode a rounding artefact;
  - "STA" is never spelled out (`screens/Rotation.tsx:308`);
  - every starter is tagged "closer".
- **Mixed casing:** Title Case role names next to sentence case.
- **Dates break the "year only outside this season" rule:** "Jan 26, 2027", "Jan 2027", "February 2027".
- **Settings difficulty** is a 6-column grid at 390px:
  - its headings wrap onto two lines;
  - its values mix units ("−12%", "Fair", "+1.5");
  - "On court +1.5" has no unit.
- **Fix (S):** a copy pass, and make difficulty three cards with one line each.

### 16. Hub headers are inconsistent (P3)

- Today has a game hero, Team a slab, Games a board.
- League has a bare heading with nothing under it.
- Office has a payroll slab and never shows its own title.
- **Fix (S):** give League a poster hero. "Thunder lead the West · 8.5 games clear" already exists under Standings.

### 17. Row and primary-button rules broken (P3)

- **Free-agent rows** carry two meta lines plus "Claim his contract".
- **Starting fives** add "for Reaves" under a name.
- **Compare's empty state** has two primary "Pick a player" buttons.
- **Matchup Preview** has a primary "Clear to play" while the dock shows "Tip off".
- **Fix (S):** one meta line per row; make the second Compare pick a secondary button.

### 18. The tablet layout is the phone layout (P3)

- Every route is a single centred column at 820, as designed, with no overflows or breakage.
- The tactics board card is narrower than its sibling cards and looks misaligned (`$S/tablet/team-tactics.png`).
- Wide tables still fade at the right edge although there is room.
- **Fix (M):** let the tables use the full width at ≥768px, and align the board card to the column.

### 19. Focus hides under the sticky header; the top bar shows content through it (P3)

- Tabbing through `/team` lands focus on the "Ratings" chip while it is hidden under the sticky stack (`$S/i-focus-team.png`). That fails WCAG 2.4.11.
- The top bar is translucent, so chips and headings scroll visibly behind it.
- **Fix (S):** set `scroll-margin-top` to the header height, and make the top bar opaque.

### 20. Tier colours lean on hue alone (P3)

- **Similar lightness:** the gold (`#835b00`), green (`#167343`) and grey (`#57534b`) badges are close in lightness, so they blur together under red-green colour blindness. I reasoned this from the hex values, not a simulator.
- **The wrong signal:** the average tier uses the same green as "good" signals, so a 72 OVR player reads as a positive.
- **Fix (S):**
  - Vary fill or lightness by tier.
  - Move the average tier off the signal green.

### 21. League → News is an 8-screen wall (P3)

- The page is 6,764 CSS px of dated prose, every name a bold link, ending in "Show 379 more" (`league-news-full.png`).
- The filter chips clip off-screen.
- The first top-story headline is purple and the second black, with no visible reason.
- **Fix (S):**
  - Show about 20 items with paging.
  - Use one headline colour.
  - Turn the chips into a control that fits.

### 22. Cross-lens (P2, sim credibility)

On Feb 4, News reports CJ McCollum traded twice in one day:

- "the Mavericks send Scoot Henderson to the Warriors for CJ McCollum";
- then "the Hawks send CJ McCollum to the Warriors for Draymond Green…" (`$S/phone/crop-news-mid.png`).

## 4. Top 5 moves

1. **One number everywhere (finding 1).** Make the projection pure, read live odds in the deadline item, unify the free-agent count. Players trust the figures the game is built on.
2. **Fix search (findings 2, 10).** Unique keys and the missing GM words. About half a day for the app's main escape hatch.
3. **Collapse heroes on sub-tabs and flatten Tactics (findings 3, 4).** Tab content starts above the fold on Report, Tactics, Matchup and Career.
4. **Budget pass on Today and League (findings 5, 6, 16, 21).** A calmer front page and faster League navigation on phones.
5. **Ergonomics pass (findings 9, 11, 12, 19).** Back closes sheets, a 12px floor, 44px targets, focus never hidden. The Android build feels native and passes a basic accessibility audit.

## 5. Route table

Phone 390x844; every row was also checked on tablet. Scr = page height in phone screens. Prim = primary buttons in the page (the dock's play button not counted). Console errors: none on any row at either viewport.

| Route                                      | Scr                   | Prim | Verdict                                                                    |
| ------------------------------------------ | --------------------- | ---- | -------------------------------------------------------------------------- |
| `/` Today                                  | 2.1                   | 1    | Stunning hero; 7 blocks; two playoff-odds figures (72/74)                  |
| `/inbox` (+ Important)                     | 2.1 / 1.0             | 0    | Clean; chip row clips; previews truncate                                   |
| `/settings`                                | 1.2                   | 0    | Difficulty grid cramped; 13 small Help targets                             |
| `/god`                                     | 1.0                   | 0    | Fine, calm empty state                                                     |
| `/team` Roster (+ Contracts)               | 2.0 / 1.4             | 0    | Strong row grid with OVR key; 11px heads; record repeated; names truncated |
| `/team/rotation`                           | 2.3                   | 0    | Clear; "239 / 240", "STA", "closer" on everyone                            |
| `/team/tactics`                            | 2.7                   | 0    | Four stacked tab levels; 10px board labels; star scale                     |
| `?tab=instructions`                        | 1.9                   | 0    | First control is the only thing above the dock                             |
| `?tab=match`                               | 1.7                   | 0    | Good empty state                                                           |
| `?tab=analysis`                            | 2.6                   | 0    | Hero repeated again                                                        |
| `/team/lineups`                            | 2.1                   | 0    | Clear Net-led rows; good "faded" note                                      |
| `/team/growth`                             | 1.6                   | 0    | Carr twice; truncated notes                                                |
| `/player/:pid` mine                        | 2.2                   | 0    | Poster slab; two role names                                                |
| player ratings                             | 2.9                   | 0    | Rich; colour thresholds differ from OVR; truncated labels                  |
| player stats / games / growth              | 2.1 / 2.9 / 1.7       | 0    | Solid tables; ~20 small sort headers                                       |
| player, other team                         | 2.3                   | 0    | Lights the League tab correctly                                            |
| player, free agent                         | 1.9                   | 1    | Good slate slab; "Make an offer" in reach                                  |
| `/compare?a=&b=`                           | 2.6                   | 0    | Strong; green winner pills clash with tier colours                         |
| `/compare` empty                           | 1.0                   | 2    | Clear; two primaries                                                       |
| `/games`                                   | 2.1                   | 0    | Excellent board; clean schedule and results                                |
| `/games/:tid` Preview                      | 3.0                   | 2    | Over budget; 29% vs Today's 31%                                            |
| Matchup Scout                              | 3.2                   | 1    | 6 blocks, 6 screens; red/green PPP from their side confuses                |
| Matchup Plan                               | 2.4                   | 1    | Good evidence next to each lever; Practice duplicated                      |
| Matchup Matchups                           | 1.8                   | 1    | Clear                                                                      |
| Matchup, non-next opponent                 | 3.1                   | 0    | Fine                                                                       |
| `/preview` redirect                        | 3.0                   | 2    | Correct                                                                    |
| `/game/:gid` Debrief                       | 2.3                   | 0    | Gorgeous final board; tabs at the dock edge                                |
| Report Why                                 | 2.8                   | 0    | Repeats Debrief's rows; letter grades                                      |
| Report Box                                 | 3.5                   | 0    | Box score fully below the fold on a deep link                              |
| Report Shots / Flow                        | 2.2 / 1.8             | 0    | Fine; 10px Flow axis                                                       |
| `/live`                                    | n/a                   | n/a  | Best screen; 10px scorebug labels                                          |
| `/league` Standings                        | 1.7                   | 0    | Clear; tab bar clipped; empty heading                                      |
| Standings: Power / Odds                    | 3.9 / 2.9             | 0    | Good forecast hero; 10px chart axis                                        |
| Playoffs / Cup                             | 1.7 / 2.6             | 0    | Nice "if the season ended today" hero; 10px seeds                          |
| Stats: leaders / players / teams / ratings | 3.6 / 1.4 / 2.3 / 5.8 | 0    | Strong tables; truncated names                                             |
| Scores (`/league/schedule`)                | 1.2                   | 0    | Label and route disagree; 10.5px kickers                                   |
| Awards                                     | 2.6                   | 0    | Good MVP ladder                                                            |
| News                                       | 8.0                   | 0    | 8-screen wall; 183 small links                                             |
| History                                    | 1.0                   | 0    | Nearly empty in year 1                                                     |
| `/teams/:tid` (6 tabs)                     | 1.0-3.4               | 1    | Beautiful other-team slab; tab row clipped                                 |
| `/teams/<mine>` → `/team`; `/teams/999`    | n/a / 1.0             | 0    | Correct redirect; clear empty state                                        |
| `/office`                                  | 1.8                   | 0    | Good desk hub; 28px Accept/Turn down                                       |
| `/office/trade`                            | 3.2                   | 0    | Strong; 6 screens with picks                                               |
| `/office/free-agents`                      | 2.6                   | 0    | 20 vs Office's 19; truncated waiver tag                                    |
| `/office/resign`                           | 1.0                   | 0    | Named for what you can't do now                                            |
| `/office/draft`                            | 2.8                   | 0    | Clean                                                                      |
| `/office/finances` (3 tabs)                | 1.0-1.8               | 0    | Clear                                                                      |
| `/office/owner`                            | 1.5                   | 0    | Clear meter; two 52s that mean two things                                  |
| `/office/career` (3 tabs)                  | 1.2-1.8               | 0    | Good signature wins; dates carry the year                                  |
| `/office/assets` (2 tabs)                  | 1.0-1.9               | 0    | Fine                                                                       |
| 13 legacy routes                           | n/a                   | n/a  | All redirect correctly                                                     |
| `/league/xyz`, `/nope`                     | n/a                   | n/a  | Redirect quietly                                                           |
| `/player/999999`, `/game/999999`           | 1.0                   | 0    | Good empty states                                                          |

**Sheets checked:**

- Search: ghost rows, and it stays open on Back.
- Needs you: correct, and returns focus.
- Play options: its agenda buttons shrink to 28px.
- Practice, the away digest, and the live console views.

**Taps to common tasks (phone):**

- **Set the rotation:** 2 taps (Team → Rotation).
- **Make a trade:** 3 taps before picking assets (Office → Make a trade → partner); 1 tap from Today's deadline card ("Look for a deal").
- **Check standings:** 1 tap (League). The League tab doesn't remember your last section.
- **See a player's contract:** 2 taps and a scroll (Team → player), or 2 taps via Team → Contracts.
- **See last game's box score:** 3 taps and a scroll (Games → result → Box).

## 6. What I couldn't verify, and how I tested

**How I tested:**

- Created a real-rosters league as the Lakers through the UI.
- Cut one player via the agenda to get to 15, started the season and used "Sim to trade deadline".
- Used a persistent browser profile under my review folder.
- Scripts are in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/ux-ia/`:
  - `setup*.mjs`: league creation and the sim.
  - `sweep.mjs`: 88 route variants per viewport, with screenshots, DOM metrics and console capture. Output is in `sweep-phone.json` and `sweep-tablet.json`.
  - `probe2-5.mjs`: search, sheets, Back and scroll, keyboard focus, contrast, the live game on phone, tablet and landscape, and the projection test.

**Not covered:**

- Offseason screens in their live states (draft night, free agency, re-sign window, RFA), a fired coach, a playoff game.
- `/start` and `/new` beyond creating the league (the onboarding lens covers them).
- A real screen reader: roles, names and focus were checked in code only.
- Notched devices, and the native shells' hardware Back (simulated with browser back).
- The root cause of the projection drift: I confirmed it depends on load order but did not find which module causes it.

My review profile was left mid-live-game. It is my own profile and affects no one else.
