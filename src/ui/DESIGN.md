# Night Edition: the Hoops Career design system

The sports pages of a night game, on a phone: warm ink grounds, serif headlines, condensed
scoreboard figures, hairline rules instead of boxes, and colour only where it means something (a
team, a result, a tier). Built for players who want the whole sim: depth is always there, one tap
down, never hidden behind a mode. Read this before changing a screen;
`src/ui/theme.css` indexes the design system's partials (`src/ui/styles/`: tokens, type, layout,
the app's chrome, surfaces, controls, badges, forms, data, overlays, figures, and the rules that
load last), `src/ui/components/ui.tsx` holds the shared components.

**Who it's for: players who know sims.** Understandable means fast scanning, no decoding and no
hunting: every figure says what it is and which way is good, the same thing has the same name
everywhere, and nothing needs two taps when one would do. Plain words come first; the NBA term is
one tap away (`Term`).

The north star is **coherence: one obvious place for everything.** Before adding a figure, a control
or a screen, find where it already lives. If it's there, link to it; don't show it again.

## Information architecture

Five tabs, one per role. Every screen belongs to exactly one (`tabFor` in `nav.ts` lights it).

| Tab        | What it's for         | Lives here (and nowhere else)                                                                                                                                                                                                                                                                                                                                           |
| ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**  | What needs you now    | The agenda (decisions waiting), the staff's top advice, the next game at a glance, the inbox (`/inbox`), settings (`/settings`), god mode (`/god`), the glossary                                                                                                                                                                                                        |
| **Team**   | Who plays and how     | Your roster with its views (players, ratings, stats, contracts) at `/team`; rotation `/team/rotation`; tactics (Tactic A/B/C, the board with shape and roles at both ends, instructions by phase, players' roles, familiarity and practice, game management, the system report, saved playbooks) `/team/tactics`; lineups `/team/lineups`; your players' pages; compare |
| **Games**  | When and against whom | Your schedule and results (`/games`); one **Matchup** page per opponent (`/games/:tid`: scouting, the game plan with the staff's counters, matchups, and on game day the preview with the staff's briefing; its slab carries the plan's state); the live game (`/live`); game reports (`/game/:gid`, opening on the staff's debrief)                                    |
| **League** | Everyone else         | Standings and odds, the schedule around the league, stats, ratings, playoffs, the Cup, awards, news, other teams' pages (`/teams/:tid`), other players' pages, history (`/league/history`: seasons, records, Hall of Fame, coaches)                                                                                                                                     |
| **Office** | The GM's desk         | The cap sheet and exceptions, trade (`/office/trade`), free agents, re-signing, the draft, picks, finances, the owner and job security (`/office/owner`), your career and job offers (`/office/career`)                                                                                                                                                                 |

Rules that follow from it:

- **Your team has one home: Team.** Other screens show a one-line summary and link there (Office's
  cap sheet links to Team → Roster → Contracts; it doesn't repeat the table).
- **Anything about one opponent lives on its Matchup page.** Home, the schedule, a team's page, the
  live game and the report link to `/games/:tid`; they don't host their own scouting, plans or
  matchup editors.
- **A change to the tactics reads in Tactics' own words** wherever it shows (plan items, counters,
  situations, saved playbooks): described through `ui/tactics/changes.ts`, named as the control is.
- **Money lives in Office.** Payroll appears once as a figure on Team → Roster's header line, and in
  full only in Office.
- **A cap sheet never shows a negative room**: "Over the cap $X" or "Cap space $X"; for the tax, the
  bill and how far over the line, or the room under it. An existing contract says when it ends
  ("thru 27-28", "expiring", PO/TO); a new deal says how long it runs ("$12.0M × 4 yrs"). Use the
  helpers in `office/common.tsx` (`capRoomFig`, `capRoomText`, `taxFig`, `rosterFig`,
  `contractEnd`, `forYears`). Rosters count against opening night's 15 everywhere ("16/15 · 1 to
  cut").
- **The owner lives in Office → Owner**, as one job-security meter (`jobSecurity`); Today shows the
  meter only when the seat is warm.
- **Advice has one voice.** Everything the staff says comes through the assistant feed
  (`core/ai/assistant.ts`, drawn with `AssistantCards`): a screen shows the cards for its own area.
  Don't build a new tips box.
- **Decisions have one list.** Anything the user must or may decide (cuts, offer sheets, offers,
  10-days, his pick, a new job) is an agenda item (`core/league/agenda.ts`, drawn with
  `AgendaList`/`AgendaRow`), settled in place. Required items hold the Continue bar.
- Routes from before the redesign redirect (`routes/legacy.tsx`); link to the new ones.
- **Search finds everything.** The top bar's search (`components/QuickSearch.tsx`, ranking in
  `search.ts`; Ctrl/⌘ K or "/") reaches any player, team, screen or glossary word. A new screen
  gets an entry in `SCREENS` with the words players use for it.
- **Teaching can be turned off.** The first-week guide, its welcome mail and Today's Glossary link
  follow `settings.teaching` (Settings → Help, and New League). Every `?` and `Term` stays.

## How screens change the league

- Every change goes through `act(label, fn)` (all or nothing: a league action) or `edit(fn)` (a light
  change: a setting, a tactics level, a read mark), from `state/actions.ts`. Never call the store's
  `mutate` from a screen. Steps that belong together go in one `act`.
- While a sim or a phase change runs, the league can't change (the worker is playing on a copy):
  `act`/`edit` say so. Buttons that change the league are disabled while `useStore((s) => !!s.sim)`.
- Phase changes are named operations (`store.task(label, { kind: ... })`), run in the sim worker.
- Read the league with `useLeague()` / `useLeagueMemo()`. A sim hands back a new league object:
  never hold on to one across a sim.

## The world around the user

The analysis is the depth; the world is the reason to press Continue. Every Continue should land on
something new **about the user's team**, and the user's choices should come back to him through the
world (no people layer: no morale, personalities or player conversations, by the user's choice).

- **The press** (`core/league/media.ts`, `media/*`) writes stories with a headline (`head`), a dek
  (`text`) and a body, weighted 3 (front page), 2 (story) or 1 (brief). Front pages about the user's
  team stop long sims and can take the screen, so they're rare: a handful a season. Story links go
  to `/league/news?story=<id>` (`storyPath`).
- **Game day is an occasion** (`core/analysis/gameStory.ts`): a game ahead has a billing
  (`billingFor`), a game played has a story (`gameStoryFor`: headline, hero, what it means). The
  result leads; the analysis sits under it.
- **Development shows** (`core/league/devWatch.ts`): arrows from where a player ended last season,
  quiet tags, the monthly report, Team → Growth.
- **The career builds** (`core/league/legacy*.ts`): milestones, signature wins, the cabinet, the
  owner's and fans' pulse, the season review.
- **Today is the front page** (`ui/today/FrontPage.tsx`, `front.ts`): the user's last result or top
  story, the next game's billing, form and pulse, the league's headlines; after a long sim, "While you
  were away" (`digest.ts`).
- All of it reads the league and writes news, mail and its own state from `core/league/world.ts`,
  never from the league's random stream: the games play out the same with or without it.

## Principles

1. **Monochrome controls, colour that means something.** A control that is on or primary is paper
   on ink (`--accent`, cream): primary buttons, the Continue bar, a chosen chip, a level, a switch,
   the active tab's rule. Colour is kept for meaning: team identity (slabs, jerseys, marks, your
   rows' edge), results and signals (`--good` `--bad` `--warn` `--info`), rating tiers. Links and
   "go there" text are the one warm tone (`--accent-text`); the brand orange (`--brand`) marks
   only what needs you (the inbox count, a sim's progress edge, live). Never tint a whole screen.
2. **A printed page, not a stack of cards.** Sections are opened by a hairline rule with their
   label under it (`Section`), and spaced by `--gap-page`. A `.card` is for a block that is one
   object (a table, a list, a form); never wrap a section's every part in its own card. One slab per
   screen at most, at the top.
3. **Three voices of type.** Serif (`--serif`, Newsreader) for headlines: page and sheet titles,
   stories, a game's result, a slab's headline. Condensed Archivo (`--display`) for figures:
   scores, ratings, money, records. Semi-condensed Archivo (`--font`) for everything else.
4. **Sentence case, always.** No tracked-out capitals: not for section labels, kickers, tags,
   buttons, tabs or table heads. Abbreviations keep their own capitals (PTS, OKC, MLE). A kicker over
   a headline is `.over`: small, quiet, sentence case ("Final · Tue, Oct 20").
5. **No decoration that says nothing.** No coloured left-edge stripes on cards, no gradients
   standing in for a surface, no diagonal weaves, cut corners or giant faded logos, no icons in
   rounded squares beside every row, no glows. An icon appears where it names an action or a kind
   (a toast's tone, a nav tab), small and in the text's colour.
6. **Scoreboard figures.** Numbers people look at are set in the condensed face, tabular.
7. **Short copy.** See Copy.
8. **Thumb first.** Primary actions sit low (the Continue bar, a screen's own `.dockbar`), targets
   are 44px, nothing important hides behind hover.
9. **Density with a ceiling.** A hub page opens on what it's for and shows at most about six
   sections; the rest is a tab or a link away. No figure appears twice on one screen (the record is
   in the top bar: a screen doesn't repeat it unless it's the subject).

## Tokens (theme.css `:root`)

| Token                                           | Use                                                                                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` `--bg-2`                                 | page ground (warm ink); sheets, list dividers                                                                                                                   |
| `--raised`                                      | cards, tables, list grounds                                                                                                                                     |
| `--surface` `--surface-2` `--surface-3`         | pressed rows, buttons, tracks, a segment that's on                                                                                                              |
| `--line` `--line-2` `--line-3`                  | hairlines: between rows / a section's opening rule and controls / strong (a table's head)                                                                       |
| `--text` `--text-2` `--text-dim`                | primary / secondary / labels and meta (all 4.5:1 on every ground)                                                                                               |
| `--accent` `--accent-ink`                       | paper: the fill of a control that's on or primary / ink on it                                                                                                   |
| `--accent-text`                                 | links and "go there" text (warm orange)                                                                                                                         |
| `--brand`                                       | the brand orange, only for what needs you: the inbox count, a sim's progress edge, live                                                                         |
| `--good` `--bad` `--warn` `--info`              | signals only (wins, losses, issues, tips)                                                                                                                       |
| `--tier-*`                                      | OVR badge tiers (via `ovrColor`)                                                                                                                                |
| `--team` `--team-2` `--team-text` `--team-slab` | your team's identity (set by `applyAccent`)                                                                                                                     |
| `--font` `--display` `--serif`                  | text / figures (with `font-stretch: var(--display-w)`) / headlines                                                                                              |
| `--display-w` `--text-w`                        | the sans's width axis for figures (72%) and text (90%)                                                                                                          |
| `--gut-l` `--gut-r`                             | the page's side gutters (16px, more past a notch)                                                                                                               |
| `--gap-page` `--gap-sec` `--pad-card`           | density: between sections (22), rule to content (10), in a card (14)                                                                                            |
| `--row-min` `--row-py` `--row-px`               | a list row: 50px tall at least, its padding                                                                                                                     |
| `--cell-py` `--cell-px`                         | a stat table's cell padding                                                                                                                                     |
| `--radius-xs` … `--radius-xl`                   | corners, kept small: xs 3 tags, sm 4 small controls and badges, md 6 buttons, inputs and chips, `--radius` 8 cards and slabs, lg 12 floating bars, xl 18 sheets |
| `--shadow` `--shadow-float`                     | a panel over the page (toasts, docks); a bar floating over the tab bar                                                                                          |
| `--ease-out` `--dur-fast` `--dur`               | motion: ease-out curve, 150ms for state changes, 220ms for entrances                                                                                            |

Don't hard-code colours, spacing, corners or shadows that exist as tokens: screens read the density
tokens so they tighten (or loosen) together. A control inside a padded box is concentric with it (the
box's corner is the control's plus the padding: `.seg`).

Figures are written by `src/core/format.ts`, the same way on every screen and in every message:
`money` ("$12.3M"), `moneySigned` ("+$1.2M"), `moneyExact` (to the $10K for minimums, two-ways and
cash: "$1.27M"), `plural` ("1 game", "5 games"), `rankOf` ("7th of 30"), `madeAtt` ("34-90", in
tables and sentences alike), `injuryName` and `outFor` ("Torn meniscus · out 8 games"). Don't
write a new inline formatter.

**One word for one thing** (the vocabulary every screen uses):

| Concept          | Write it                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Threes           | 3P / 3PA / 3P% / 3PM in figures; "three-point", "threes" in words. Never 3PT                                 |
| Team ratings     | ORtg / DRtg / Net, as is even inside caps (`.as-is`, `Col.asIs`)                                             |
| Per game         | PTS REB AST STL BLK MIN, one decimal; "per game" said once (a header, a foot, the slab's caption)            |
| Potential        | a POT column beside OVR; "POT 89" inline and under a badge (`OvrPot`). No ▲                                  |
| A player rating  | its `RATING_META` name (sentence case); in prose lower case with its value (`ratingText`)                    |
| A contract's end | `contractEnd` ("thru 28-29 PO", "expiring"); a new deal `forYears` ("$12.0M × 4 yrs")                        |
| A roster         | `rosterLine`/`rosterFig` (`office/basis.ts`): signed for the season the money is about, of 15                |
| Picks            | one row (`PickRow`), one order (`pickOrder`); "Owned by", "1st round", neutral "proj. #17"; `picksText`      |
| A plan, a series | `planStatus` ("No game plan yet" / "Plan: 3 changes · next game"); `seriesText`, `streakText`, `lastTenText` |
| Before a game    | one chance to win: `gameProjection` (the matchup preview's). A screen never computes its own                 |
| An AI offer      | one headline (`offerSubject`) in the inbox and on the agenda; the other GM quoted in his name                |
| A teammate       | told apart when another shares his last name: `rosterNames` in lists, `shortName` in text                    |
| Dates            | `fmtDate`: "Feb 11", "Wed, Feb 11"; a year only outside this season; never an all-caps long weekday          |
| Owner numbers    | job security out of 100 (50 = goals met exactly); grades −100..+100 (0 = met exactly)                        |

**Colour that means "how good" has one order everywhere**: gold > purple > blue > green > light
grey > grey (the OVR tiers). Ratings: 85+ gold, 75+ blue, 64+ green, under 64 grey (`ratingTone`,
in a table and a bar alike); percentiles 85th+/65th+/35th+/below likewise (`skillColor`). Red is for
losses and warnings, never a low rating; trade value tiers are plain text. One game's screens put
the away team on the left and the home team on the right, as the final does; shot charts draw each
team's makes in its `matchupColors` colour and misses in grey, under one `ShotKey`.

**Prefix class names by area** (`lg-`, `tm-`, `td-`, `fo-`, `lv-`, `gs-`, `mu-`): lazy chunks load
their CSS late, so a bare name from one screen restyles another once it has loaded (the live
game's `.bk` once broke the playoff bracket). A wide `StatTable` keeps its first column sticky and
fades at the right edge while columns wait (built in; `.tablewrap-o` elsewhere).

Team colours for another team come from
`teamColors.ts`: `slabVars(colors)` for a slab, `jerseyKit` (inside `Avatar`), `teamLook`,
`identityColor`. Two teams side by side use `matchupLooks`, and `matchupColors`/`jerseyColors` for
lines and jerseys.

## Type

Two families: Archivo (variable width) for the interface and figures, Newsreader (variable, with
italics) for headlines.

- `h1` 34-36px serif, weight 560, tight tracking (-0.018em): the page title (`PageHeader`).
- `h2` 25-26px serif: a sheet's title, a slab's headline.
- A story's or a result's headline: serif (`.serif` or the screen's own class), 22-32px, weight
  540-600, `text-wrap: balance`. A dek under it in `--text-2`, 14-15px sans.
- A section's label (`Section`, a card's `h3`): 14px sans, 720, sentence case, `--text`.
- `.over`, a kicker over a headline or a figure's label: 12-12.5px sans, 600-620, `--text-dim`.
- Body 15px; `.small` 13px; `.tiny` 11.5px. Meta lines 12.5px `--text-dim`.
- Figures: `--display` with `font-stretch: var(--display-w)`, weight 700-780, tabular (`.num`).
  Never in capitals-only words: a figure's label sits beside it in sentence case.
- Weights in the sans run 560-760; 800+ is reserved for nothing.

## Components and classes

- `PageHeader` (`.ph`): back button, title, one short sub line, a control on the right. A hub's
  sections use `TabBar` (`league/shared.tsx`, sticky page tabs) under it, never a second header.
- `Section` (`.sec`, `.sec-h`): a hairline rule, the label under it + right-side link (`.card-link`),
  then content.
- `Card` (`.card`): a borderless `--raised` panel for one object. `.flush` + `.list` for rows.
  `accent` (a paper hairline) sparingly.
- `.slab`: the identity hero, a flat team-colour field lit from the top with the trim as a 3px rule
  along its top edge. Your team by default; another with `slabVars(colors)`. (`.slab-mark` is
  retired: it no longer shows.)
- Lists: `.card.flush` > `.list` > rows. `.listrow` (`--row-min`, 48px), `.lr-name`, `.lr-meta`. Your
  own rows: a `--team-text` inset edge + 9% tint.
- **A list of players with figures is a row grid** (`team/RosterViews`): the jersey, the name over
  position and age, then figures in columns named once per group (in the divider), OVR beside POT.
  Never a unit on every figure. Every team's roster is the same component.
- **A score in a list** (a playbook's fit, a set's fit) is a figure in its own column with a bar
  under it, named in a column header (`.list-divider.list-h`) that says the order; colour bands are
  explained in the section's Help. A control's reference setting (the playbook's own) carries a dot
  (`Levels mark`).
- **Badge colours come from `OVR_TIERS`** (`core/ratings.ts`), one colour per tier name. A list or
  table of badges carries `OvrKey` under it; a player's own badge opens the ladder. Attribute
  ratings use `ratingTone` everywhere, with `RatingKey` under a ratings table.
- Figures: `Statline` for 2-4 figures in a row; `Kpi` tiles only for a grid of many.
- `Segmented` (`tabs` for page tabs: sentence case, a paper rule under the one that's on), `Chips`
  (a chosen chip is filled paper), `.tag` (an outlined label in sentence case; a tone adds a dot and
  colours the word), `Ovr`, `Avatar`, buttons (`.btn`, `.primary` paper, `.ghost`, `.danger` and
  `.good` outlined in their signal, `.sm`, `.xs`, `.block`, `.big`).
- `Help` ("?" opening a sheet) and `More` (an expander) carry every explanation. `Toggle`'s `help`
  goes behind its "?" automatically.
- `Term` (keeps the caps of the heading it sits in) (`components/Glossary.tsx`): a word with a glossary entry (drop, MLE, eFG...): tap for what
  it means. `GlossarySheet` is the whole list. Use `Term` the first time a screen shows jargon.
- `AgendaList` / `AgendaRow` (`components/Agenda.tsx`): decisions with their actions in reach.
- `AssistantCards` (`components/Assistant.tsx`): the staff's advice for an area, with one-tap fixes.
- `Sheet`: bottom sheet (dialog on tablets). Title in `h2`. It locks the page behind it and slides out
  on close; its content must not assume the sheet unmounts the instant `open` turns false. A sheet
  that filters a list as you type gives its box `.sheet-filter`, so it keeps its height.
- A first-run or setup flow (New League) keeps its step's call to action in a sticky foot
  (`.nl-cta`) so a long grid never hides it.
- `.dockbar`: a screen's own fixed action bar over the tab bar; the Continue bar steps aside for it.
- The Continue bar (App.tsx) names the next step and runs it. A required agenda item takes its place
  and opens in a sheet to be settled. On the screen the next step names, it shrinks to its options.
- `.empty` for empty states: one line, what to do next; no icon or display headline.

## Screen anatomy (phone)

1. `PageHeader` (or a slab for identity screens: a team, a player, a matchup).
2. `TabBar` for a hub's sections, if any.
3. The thing the screen is for, first. Then sections in order of use.
4. Nothing important below a long list; filters above it.

Spacing comes from the density tokens: `--gap-page` between sections, `--gap-sec` inside one, `--pad-card` inside a card, `--row-min` for a row. Phone
first: wide screens get the same single column, centred, at most 788px. Grid columns are
`minmax(0, 1fr)`, never a bare `1fr` (a long line would push the page sideways).

## The live game

Broadcast first: the court is always the biggest thing on screen.

- A slim scorebug sits over a full-width court (the win-probability sliver and the scores ticker
  under it when Settings has them on). Captions, graphics and **one banner at a time** (injuries,
  foul-outs, their adjustments, the staff's word) go over the court, never beside it.
- **The scorebug labels its figures**: each team's block reads Timeouts n and Fouls n (Penalty n
  when the other team is in the bonus), and the sliver under it reads To win. A player on the floor
  shows points, energy (bar and %) and fouls as "n PF".
- **One bench bar** takes the tab bar's place: the one action the moment calls for first (Timeout
  while the game plays, Start the next period at a break, Resume in your huddle), then the
  console's views (Bench, Game plan, Lineup, Stats; the Bench counts the staff's calls waiting).
  Don't add a second row or a floating button.
- **One console** under the court (beside it, held sideways) holds every coaching control, in its
  four views. **Evidence next to the lever**: a control in the Game plan sits beside the number it
  moves (the coverage beside their pick-and-roll's points a trip). Every setting is in its sheet,
  one tap down. A new control goes in one view, once.
- **The staff has one voice**: the lead assistant (`leadAssistant`) heads the Bench, the breaks,
  the pre-game briefing and the debrief, as `AssistantHead` with a read in a sentence; his calls are
  `NoteCard`s (evidence, the moves on offer with his pick first, Not now). Don't build another
  advice box.
- **Every move is measured**: a tactics change, sub or timeout shows in Your moves with what it has
  done since (`coachMoves`, drawn with `MovesList`), in the live game and in the report.
- Playback (pause, skip, speed, key plays) lives only in the court's tap-to-reveal overlay.
- **The way out is on the scorebug's top line** (Leave, beside what's at stake): the game waits where
  it is, and the Continue bar and its Matchup page resume it.
- **The breaks are on the screen, not over it**: at a period's end or in your timeout the court
  steps aside for the period report or the huddle in the console; the next period starts from the
  bench bar.
- Every change during a game goes through the live controller (the journal records it), never a raw
  league edit. The Game plan says what's changed since the tip, in Tactics' words.
- **One box score**: `BoxScore` (`components/BoxScore.tsx`), in the live game and the report, with
  MIN PTS REB AST STL BLK TOV FG 3P FT PF +/-. Don't build another.
- Two-team comparisons use `CompareBar`, which puts the winning figure in a pill of its side's
  colour (`higherBetter={false}` where lower wins, as for TOV%).
- A highlights reel that plays on request is one header line with its button until it's played.

## Copy

- **Headline + figure.** A card says what it is in a headline and at most one short line. Anything
  longer goes behind `Help` or `More`. No paragraph of more than two lines is visible by default.
- Cut "you can", "this shows", restating the label, and hedges.
- Sentence case for text, buttons, labels and tabs; capitals only in abbreviations (PTS, OKC, MLE).
- "TO" is never used: Timeout(s) in words, TOV for turnovers, PF for fouls in compact figures.
- A figure that leads a row carries its unit under it (pts, PPP); the row's text doesn't repeat it.
- Teammates who share a last name are told apart everywhere (`rosterNames` in lists, `shortName`
  in text).
- Numbers over words where a number says it: "3-7 in last 10", "+3.4 pts/100".
- **Every big figure says what it is** (a label under it, or its column name) **and which way is
  good**; ranks say out of how many ("25th of 30"). Colours on scouting numbers rate the team shown
  (green: better than the league), whoever's team it is.
- **A leaderboard links to its full table**, sorted by its figure.
- A percentage says what it's a percentage of ("75% of value"); a bar's legend names every part,
  a striped amount included.
- **Never quote an engine effect size or spread in copy** ("worth about +1.1 per 100"): show the
  game's or the league's numbers at runtime, or none. The engine is re-tuned; copy isn't.
- **A tactical effect is phrased against what would otherwise have happened** ("turned it over
  less than pressure would have made them"), never as a count the box score's factors could
  contradict.
- Keep explanations that teach the game, but behind `Help`/`More`/`Term`.
- Names of controls in advice must match the controls on screen (Team → Tactics tabs: Tactic,
  Instructions, Players, Familiarity, Game Mgmt, Report).
- Inbox mail: a subject that says what happened and a one-line summary; detail below it. **Mail is
  for what changes a plan**: what a screen already shows (a short injury, "the season starts")
  doesn't get mail. One mail per pitch or event: a repeat replaces its earlier mail.
- **The bell's badge counts what needs you** (`needsYou`: important mail from the last two weeks of
  this season, or a decision still open); other mail is unread in the list without feeding the badge
  or Today's count.

## Motion

- Screens fade in (opacity only: a transform would trap fixed docks). Sheets and the Continue bar
  slide up; a sheet slides back down when it closes (showing what it showed while open), and a drag
  let go short of closing settles back. Press states scale to 0.97 (buttons, team tiles) or darken
  (rows, chips, segments, icon buttons); a mouse gets a hover state too (`(hover: hover)` only, never
  something a touch needs).
- **Toasts** rise above the Continue bar (over a sheet: at the top, clear of its buttons), at most two
  at once, one width, an icon for their tone. A tap dismisses one or opens its link. A sim or a phase
  change starting clears the ones before it: a toast is about the league as it was.
- **Loading**: nothing for 300ms, then a spinner fades in where the screen will be (`Waiting` in
  App.tsx). Never a "Loading…" line that flashes on every lazy screen.
- While a sim runs, the Continue bar fills from the left with a `--brand` edge along its foot and says
  "Day n of N"; a one-shot job (a new season, free agency) shows a sweeping glow instead.
- Figures in a `Statline` count up when a screen opens (`CountUp`), once.
- Big moments get a full-screen card in your colours (`moments.ts`, `components/Moments.tsx`), once,
  after a sim and outside the live game: career moments, or else the one biggest front-page story.
  A game's own report opens on its result moment (score counts up once, under a second), so a game's
  story never takes the screen there.
- The live game's atmosphere (`live/atmosphere.ts`): runs, the crowd's glow by the arena's name, one
  big-play callout at a time (rate-limited), and a clutch state in the last five minutes within five.
- Everything respects `prefers-reduced-motion` (theme.css zeroes animations).

## Accessibility (unchanged bar)

- 4.5:1 text contrast on every ground.
- 44px touch targets (compact controls extend their hit area with `::after`).
- Radio groups for switches, `aria-pressed` on toggles, names on icon buttons, `sr-only` text where
  a badge alone carries meaning, focus rings in `--accent-text`.
