# Hardwood: the Hoops Career design system

A printed sports poster in your hand: warm bone paper and white card stock, black ink, your team's
colour as solid blocks with the court's white lines on them, black expanded headlines, the box
score in mono, one ink dock at the foot, and screens that show a few things well instead of
everything at once. Built for players who want the whole sim: depth is always there, one tap
down, never hidden behind a mode. Read this before changing a screen;
`src/ui/theme.css` indexes the design system's partials (`src/ui/styles/`: tokens, type, layout,
the app's chrome, surfaces, controls, badges, forms, data, overlays, figures, motion, and the rules
that load last), `src/ui/components/ui.tsx` holds the shared components.

**Who it's for: players who know sims.** Understandable means fast scanning, no decoding and no
hunting: every figure says what it is and which way is good, the same thing has the same name
everywhere, and nothing needs two taps when one would do. Plain words come first; the NBA term is
one tap away (`Term`).

The north star is **coherence: one obvious place for everything.** Before adding a figure, a control
or a screen, find where it already lives. If it's there, link to it; don't show it again.

## Information architecture

Five tabs, one per role. Every screen belongs to exactly one (`tabFor` in `nav.ts` lights it).

| Tab        | What it's for         | Lives here (and nowhere else)                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Today**  | What needs you now    | The agenda (decisions waiting), the staff's top advice, the next game at a glance, the inbox (`/inbox`), settings (`/settings`), god mode (`/god`), the glossary                                                                                                                                                                                 |
| **Team**   | Who plays and how     | Your roster with its views (players, ratings, stats, contracts) at `/team`; rotation `/team/rotation`; tactics (one tactic: the board with shape and roles at both ends, instructions by phase, players' roles, game management, the system report) `/team/tactics`; lineups `/team/lineups`; your players' pages; compare                       |
| **Games**  | When and against whom | Your schedule and results (`/games`); one **Matchup** page per opponent (`/games/:tid`: scouting, the game plan with the staff's counters, matchups, and on game day the preview with the staff's briefing; its slab carries the plan's state); the live game (`/live`); game reports (`/game/:gid`, opening on the staff's debrief)             |
| **League** | Everyone else         | Five tabs: Standings (the odds, the lottery inside Odds), Playoffs (the Cup a row in it while it's on), Stats (ratings too), Scores (the schedule around the league) and News; Awards and History (`/league/history`: seasons, records, Hall of Fame, coaches) are links in its header; other teams' pages (`/teams/:tid`), other players' pages |
| **Office** | The GM's desk         | The cap sheet and exceptions, trade (`/office/trade`), free agents, re-signing, the draft, picks, finances, the owner and job security (`/office/owner`), your career and job offers (`/office/career`)                                                                                                                                          |

Rules that follow from it:

- **Your team has one home: Team.** Other screens show a one-line summary and link there (Office's
  cap sheet links to Team → Roster → Contracts; it doesn't repeat the table).
- **Anything about one opponent lives on its Matchup page.** Home, the schedule, a team's page, the
  live game and the report link to `/games/:tid`; they don't host their own scouting, plans or
  matchup editors.
- **A change to the tactics reads in Tactics' own words** wherever it shows, in plan items and
  counters: described through `ui/tactics/changes.ts`, named as the control is.
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

1. **Calm first, depth one tap down.** A screen answers one question at its top (the hero: a
   game, a figure, a headline) and shows at most four or five blocks under it. Everything else is a
   tab, a row that opens, a `More`, or a sheet away, never deleted and never shown all at once. A
   row carries a name and at most one line of detail; a block carries one short explanation at
   most, the rest behind its `Help`.
2. **Ink runs the controls, your team runs the identity.** A primary button is a solid ink pill,
   a secondary an ink ring (`.btn`), a chosen chip or level solid ink (`--on`), the page tab that's
   on carries a thick ink rule. Your team's colour (set by `applyAccent`) is the slab, the play
   button on the dock (`--team-night`), a switch that's on (`--accent`), links and "go there" text
   (`--accent-text`) and your rows' wash. Other colour means something: other teams' identity
   (slabs, jerseys, marks), results and signals (`--good` `--bad` `--warn` `--info`), rating tiers.
   `--brand` marks only what needs you (the inbox count, live). Never tint a whole screen.
3. **Paper, card stock and space.** The page is paper (`--bg`); a group is a white card
   (`.card`, 20px corners, a warm `--shadow-card`, no outline) holding one object: a list, a table,
   a form, a figure block. Sections are a black head and content, separated by `--gap-page`; no
   rule over every section. Never a card inside a card, never a card around a single line. One slab
   per screen at most, at the top: it's the screen's poster.
4. **One family in three widths, and the box score in mono.** Archivo expanded and black (`--head`,
   `.head`, `h1` `h2`, section heads) for headlines: page and sheet titles, a team's name, a story,
   a game's result. Condensed and black (`--display`, `.display`) for the one big figure a hero
   leads with (a score, a win chance). Normal width (`--font`) for reading. IBM Plex Mono (`--mono`,
   `.mono`) for the box score: stat figures, tables, `Statline`, `Kpi`, kickers (`.over`), dates and
   meta that is data. No serif, no italics.
5. **Sentence case, always.** No tracked-out capitals: not for section labels, kickers, tags,
   buttons, tabs or table heads. Abbreviations keep their own capitals (PTS, OKC, MLE). A kicker over
   a headline is `.over`: small, quiet, sentence case ("Final · Tue, Oct 20").
6. **No decoration that says nothing.** No coloured edge stripes, no gradients standing in for a
   surface, no weaves, cut corners or giant faded logos, no icons in rounded squares beside every
   row, no glows, no outlines around every chip. An icon appears where it names an action or a kind
   (a toast's tone, a nav tab), small and in the text's colour.
7. **Box-score figures.** Numbers people read are mono, tabular, with a small sentence-case label;
   a line of them sits under a 2px ink rule (`.statline`), as a printed box score does. The one figure
   a hero leads with is the condensed black cut, as big as it can be. A figure appears once per screen (the record is in the top bar: a screen
   doesn't repeat it unless it's the subject).
8. **Words before the fact, numbers for facts.** What has happened is a number: the box score,
   standings, OVR and POT, ages, contracts, money, a goal the owner set. What a choice will do, or an
   estimate of what it did, is the staff's opinion in words, from `core/analysis/staffWords.ts`
   ("Should help", "Seems to hurt", "Better fit", "Slight favorite", "Big edge"). No points a game, no
   win chance moving with a choice, no ± and no "measured over 240 games". The sim still measures, and
   the staff still picks by it, but the player gets a hunch and has to find out. League odds, draft
   projections and the lottery stay: they are the league's own boards, not a preview of a choice.
9. **Short copy.** See Copy.
10. **Thumb first.** Primary actions sit low (the dock's play row, a screen's own `.dockbar`),
    targets are 44px, nothing important hides behind hover.

## Tokens (theme.css `:root`)

| Token                                                                                                               | Use                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bg` `--bg-2`                                                                                                     | the paper; a recessed track (a `Segmented`)                                                                                                                                                         |
| `--raised`                                                                                                          | white card stock: cards, tables, list grounds                                                                                                                                                       |
| `--surface` `--surface-2` `--surface-3`                                                                             | pressed rows, level buttons, tracks, tags (paper tones, darker each step)                                                                                                                           |
| `--line` `--line-2` `--line-3`                                                                                      | hairlines: between rows / a chip's ring, a table's foot / strong ink rule                                                                                                                           |
| `--text` `--text-2` `--text-dim`                                                                                    | ink / secondary / labels and meta (all 4.5:1 on paper, card and `--surface-2`)                                                                                                                      |
| `--ink` `--ink-2` `--paper-ink`                                                                                     | the controls' ink (a primary pill, a ring, the dock) / pressed / text on ink                                                                                                                        |
| `--on` `--on-ink`                                                                                                   | a chosen option: a chip, a level (solid ink, white text)                                                                                                                                            |
| `--accent` `--accent-ink`                                                                                           | your team's colour as a fill on paper (a switch that's on, progress) / ink on it                                                                                                                    |
| `--accent-text`                                                                                                     | links and "go there" text: your team's colour, darkened to read on paper                                                                                                                            |
| `--team-night` `--team-night-ink`                                                                                   | your team's trim, lightened to read on ink: the play button, links in the dock                                                                                                                      |
| `--brand`                                                                                                           | red-orange, only for what needs you: the inbox count, live                                                                                                                                          |
| `--good` `--bad` `--warn` `--info`                                                                                  | signals only (wins, losses, issues, tips), deep enough to read on paper; `--bad` a deep red, `--warn` an ochre a step lighter, the gold tier lighter again: the three part for colour-blind players |
| `--tier-*`                                                                                                          | OVR tiers (via `ovrColor`), gold > violet > blue > teal > grey > light grey: text colours that read on white, on their wash and under a white figure                                                |
| `--team` `--team-2` `--team-text` `--team-slab`                                                                     | your team's identity (set by `applyAccent`)                                                                                                                                                         |
| `--font` `--display` `--head` `--mono`                                                                              | text / big figures (`--display-w` 72%) / headlines (`--head-w` 118%) / the box score; `--serif` is `--head`'s old name                                                                              |
| `--gut-l` `--gut-r`                                                                                                 | the page's side gutters (16px, more past a notch)                                                                                                                                                   |
| `--gap-page` `--gap-sec` `--pad-card`                                                                               | rhythm: between sections (32), head to content (12), in a card (18)                                                                                                                                 |
| `--row-min` `--row-py` `--row-px`                                                                                   | a list row: 54px tall at least, its padding                                                                                                                                                         |
| `--cell-py` `--cell-px`                                                                                             | a stat table's cell padding                                                                                                                                                                         |
| `--radius-xs` … `--radius-xl`, `--radius-pill`                                                                      | corners: xs 6 tags and badges, sm 10 level buttons, md 14 inputs and toasts, `--radius` 20 cards, lg 26 slabs and the dock, xl 30 sheets; pill for every button, chip and segment                   |
| `--shadow-card` `--shadow` `--shadow-float`                                                                         | a card on the paper; a panel over the page; a bar floating over the dock (all warm, never black)                                                                                                    |
| `--ease-out` `--ease-in` `--ease-move` `--ease-spring`, `--dur-fast` `--dur` `--dur-slow` `--dur-page`, `--stagger` | motion: arriving, leaving, moving, settling; 150ms state changes, 220ms entrances, 360ms a thing travelling, 340ms a screen's blocks, 32ms between them                                             |

Don't hard-code colours, spacing, corners or shadows that exist as tokens: screens read the density
tokens so they tighten (or loosen) together. A control inside a padded box is concentric with it (the
box's corner is the control's plus the padding: `.seg`).

Figures are written by `src/core/format.ts`, the same way on every screen and in every message:
`money` ("$12.3M"), `moneySigned` ("+$1.2M"), `moneyExact` (to the $10K for minimums, two-ways and
cash: "$1.27M"), `plural` ("1 game", "5 games"), `rankOf` ("7th of 30"), `madeAtt` ("34-90", in
tables and sentences alike), `injuryName` and `outFor` ("Torn meniscus · out 8 games"). Don't
write a new inline formatter. On screen a record, a series or a made-attempted never breaks at its
hyphen: `keepFigures` (`core/format.ts`) for a string, `keep` (`components/ui.tsx`) for any node
(display only: compare and store the plain string). The lint rule `hoops/keep-figures` flags a join
written into the markup without it.

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

**Colour that means "how good" has one order everywhere**: gold > violet > blue > teal > grey >
light grey (the OVR tiers). A badge differs by weight as well as colour, so the ladder reads without
its hue (a colour-blind player, a grey screenshot): the top two solid with a white figure, the middle
two the figure on a wash of its tier, the bench a grey figure with a hairline, the fringe a light grey
figure on its own (`.ovr.t-*`, `styles/badges.css`). Average is teal, never `--good`'s green, and
gold, orange (`--warn`) and red (`--bad`) separate by lightness. Ratings: 85+ gold, 75+ blue, 64+ teal, under 64 grey (`ratingTone`,
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

Archivo, variable in width and weight, for words and big figures; IBM Plex Mono for the box score.

- `h1` 32-34px, the headline cut (`--head`, `font-stretch: var(--head-w)` 118%), weight 900,
  tracking -0.04em, leading under 1: the page title (`PageHeader`), a team's or a player's name on
  its slab.
- `h2` 23-24px headline cut: a sheet's title, a slab's headline.
- A story's or a result's headline: `.head` (or the screen's own class on `--head`), 22-34px,
  weight 860-900, tracking -0.035em, `text-wrap: balance`. Shorter is better. A dek under it in
  `--text-2`, 14.5-15px.
- A section's head (`Section`, `.sec-h h3`): the headline cut at 114%, 19px, 880, `--text`. Inside a
  card (`.card-h h3`) a step down: 16.5px.
- `.over`, a kicker over a headline or a figure's label: mono 12px, 500, `--text-dim` ("Final · Tue,
  Oct 20").
- Body 15px at 420; `.small` 13.5px; `.tiny` 12px. Meta lines 13px `--text-dim` in the text cut
  (mono when the meta is data: a date, a record, a line of figures).
- Big figures: `--display` with `font-stretch: var(--display-w)` (72%), weight 860-900,
  tracking -0.03em. Stat figures: `--mono`, 500-600, tracking -0.03 to -0.06em. Both tabular.
  Never in capitals-only words: a figure's label sits beside it in sentence case.
- Names in rows 15.5px at 680. Nothing in the text cut above 760.
- A name on a hero or slab, and a page's title, never breaks inside a word ("Antetokounmp / o"): `Fit`
  (`components/ui.tsx`) prints it at its CSS size, or as much smaller as its widest word needs to fit
  the box, measured in the page (a hyphenated name may still break after its hyphen). The smoke test
  checks the longest names at 320-390px.

## Components and classes

- `PageHeader` (`.ph`): back button, title (34px black), one short mono sub line, a control on the right. A hub's
  sections use `TabBar` (`league/shared.tsx`, sticky page tabs) under it, never a second header.
  `TabBar` measures its own width and fits five short tabs on any row 320px or wider; more tabs
  scroll. Don't add per-screen narrow-width tab rules.
- `Section` (`.sec`, `.sec-h`): a bold head + right-side link (`.card-link`), then content. No rule.
- `Card` (`.card`): white card stock on the paper (`--raised`, `--shadow-card`) for one object.
  `.flush` + `.list` for rows. `accent` (printed on the paper, ruled in ink) sparingly.
- `.slab`: the identity hero, the team's colour as one solid block with the court's white lines
  under the content (`::before`; `.no-court` drops them). Your team by default; another with
  `slabVars(colors)`. Inside it the ink inverts: white text, white rings, a white primary, white OVR
  badges. Its one big figure is `--display` black, as large as fits.
- `Poster` and `PosterSlab` (`league/shared.tsx`): a screen's hero as a mono kicker, a black
  headline and a giant figure over a 2px ink rule on the paper, or the same on a team's slab. A
  game's board (`FinalSlab`'s `GameBoard`): two team blocks side by side with a full court across
  them, the giant figures (scores, chances to win) and a white pill on the seam.
- Lists: `.card.flush` > `.list` > rows. `.listrow` (`--row-min`, 54px), `.lr-name`, `.lr-meta`
  (one line). Your own rows: a 10% wash of `--team`, no edge stripe.
- **A roster row is two lines** (`team/RosterList`): the jersey; line 1 the name with at most one
  mark (Out, else a 10-day deal, else the development tag), OVR beside POT in columns named once in
  the group's header; line 2, quieter, position · age and the four figures, each with its small
  label (MIN PTS REB AST) in fixed columns. The OVR change lives in Roster → Ratings and on the
  player's page. Every team's roster is the same component. Wider tables (Ratings, Stats,
  Contracts, Rotation) keep figures in columns named once in the header.
- **A score in a list** (a playbook's fit) is a figure in its own column, named in a column header
  (`.list-divider.list-h`) that says the order; colour bands are explained in the section's Help. A control's reference setting (the playbook's own) carries a dot
  (`Levels mark`).
- **Badge colours come from `OVR_TIERS`** (`core/ratings.ts`), one colour and one weight per tier name. A list or
  table of badges carries `OvrKey` under it; a player's own badge opens the ladder. Attribute
  ratings use `ratingTone` everywhere, with `RatingKey` under a ratings table.
- Figures: `Statline` for 2-4 figures in a row; `Kpi` tiles only for a grid of many.
- `Segmented` (`tabs` for page tabs: the headline cut, a thick ink rule under the one that's on;
  one row of tabs per screen; a boxed `Segmented` under it at most: a recessed pill track with the
  option that's on as a white card), `Chips` (ink-ring pills; a chosen chip is solid ink), `.tag` (a
  printed tint in sentence case; a tone colours the word and its wash), `Ovr` (the figure in mono,
  at its tier's colour and weight: solid, tinted, hairline or plain), `Avatar`, buttons (all pills: `.btn` an ink ring,
  `.primary` solid ink, `.ghost` a quieter ring, `.text` a link-like action, `.danger` and `.good`
  washed in their signal, `.sm`, `.xs`, `.block`, `.big`).
- `Help` ("?" opening a sheet) and `More` (an expander) carry every explanation. `Toggle`'s `help`
  goes behind its "?" automatically.
- `Term` (keeps the caps of the heading it sits in) (`components/Glossary.tsx`): a word with a glossary entry (drop, MLE, eFG...): tap for what
  it means. `GlossarySheet` is the whole list. Use `Term` the first time a screen shows jargon.
- `AgendaList` / `AgendaRow` (`components/Agenda.tsx`): decisions with their actions in reach. The
  due date comes first. A staff call's row shows the call and one number; its reasons and other
  figures go in the item's `detail`, behind a Why.
- `AssistantCards` (`components/Assistant.tsx`): the staff's advice for an area, with one-tap fixes.
- `Sheet`: bottom sheet (dialog on tablets). Title in `h2`. It locks the page behind it and slides out
  on close; its content must not assume the sheet unmounts the instant `open` turns false. A sheet
  that filters a list as you type gives its box `.sheet-filter`, so it keeps its height.
- A first-run or setup flow (New League) keeps its step's call to action in a sticky foot
  (`.nl-cta`) so a long grid never hides it.
- `.dockbar`: a screen's own fixed action bar over the tab bar (an ink bar, inverted tokens); the
  play row steps aside for it.
- The dock (App.tsx): the tab bar with the play row on top of it, one ink slab with round top
  corners; inside it the tokens invert (white text, `--accent` = `--team-night`). The play row names
  the next step in the headline cut and runs it (a round play button in your team's trim); its
  arrow opens every option, under the staff's calls still open. A
  required agenda item takes its place and opens in a sheet to be settled. On the screen the next
  step names, it shrinks to a round options button.
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

Broadcast first. From the top: the ink scorebug (the game clock with the shot clock beside it,
`live/shotClock.ts`, the same number the arena's boards show), the call bar, the court, the console,
with the bench bar in the tab bar's place. A phone plays sideways (`live/turn.ts`,
`live/styles/side.css`): the court fills the screen under a slim strip with the scorebug and the call
bar, the bench bar is a rail on the right and the console a drawer it opens. Held upright the page is
turned so the phone is turned; Settings ("Sideways on a phone", `settings.liveTurn`) keeps it upright. The scorebug, the call bar and the court are the broadcast's graphics
package (ink plates, white type); the console is paper and card stock like every other screen.

- **The court is a full court and never leaves the screen.** Teams attack fixed ends (they swap at the
  half) and run the floor: the next possession starts where the last one left the players
  (`standing` in `live/choreo.ts`), so a steal goes the other way and a break is a run, not a cut.
  A phone held upright shows a window on the floor that pans with the ball; anything wide (a tablet, a
  desktop, a phone sideways, or the compact court) shows the whole floor sideways. The canvas picks
  the view from the box the layout gives it (`--court-ar` / `--court-h`, `live/styles/page.css`).
- **Two pictures of the one play** (`live/CourtView.tsx`). By default a 3D broadcast camera high on
  the near sideline (`live/Court3D.tsx`, `live/court3d/`): athletes in the night's kits,
  each as tall and as broad as his listed height and weight, each a generic man of his own (skin, face, hair and beard from his id, `court3d/look.ts`; no likeness). The camera button in the court's
  corner switches to the 2D floor from straight above (the tactics view), and back; the choice is
  saved (`settings.courtLook`). The chip beside it goes round the 3D picture's five cameras
  (`court3d/cameras.ts`, saved as `settings.courtCam`): Broadcast (the default: a gantry camera at
  mid-court that pans, tilts and zooms, all ten and the basket in a half-court set, ahead of the ball
  and wider on a break), Sideline (lower, closer, on a dolly), End zone (high behind the offense),
  Baseline (on the floor by the basket being attacked) and Overhead. Each is framed for the box's
  shape (a phone's stand higher and frame tighter). A tap on a player tags him for a few seconds; the
  man with the ball wears his tag over his head (not while he shoots; in a crowd one tag, the number
  alone if only that fits: the words never cover the ball, its path or the rim) and a ring in his
  team's colour under him, which turns to the warning colour and beats when the shot clock is under five. The 2D court always runs underneath: it keeps the play's clock,
  draws the break's shot chart, and is the whole court where WebGL 2 is missing or the 3D scene
  fails to load. If frames run slow the picture is first drawn less sharp, then the court offers 2D.
  three.js loads with the first 3D frame, never with the app.
- **The 3D picture is an arena whose things are modelled in Blender** (`scripts/blender/`,
  `npm run models:build`: headless Blender builds the models side by side, `run.ts` packs each
  (the same shape in some 40% fewer bytes) into `court3d/models/*.glb` and notes the scripts it was
  built from in `manifest.json`; `court3d/glb.ts` reads them, no glTF library; `models.test.ts`
  holds the contract between the two and fails when a script changed without a rebuild).
  `figure.glb` is the player: one fused skin on the puppet's 18 bones (shoulders, elbows and knees
  bend without a seam), a face, cropped hair, fingered hands, sneakers with a soft collar, a V-neck
  vest with sewn trim tucked into shorts cut as their own garment (a seat, a leg each that parts at
  the fork and swings a beat behind his thigh), every hollow's shade baked in. Skin, eyes, hair
  and beard are painted per man (`look.ts`), and his name is over his number on his back. `people.glb` is that same body posed and baked: two bench sitters
  and a coach in a suit with folded arms. `arena.glb` is the basket unit, rim, net, ball, bench
  chair, scorer's table, scoreboard, a seat of the stands and the spectators the crowd is made of
  (six grown-ups and a child of about 1,000 triangles for the rows by the floor, two of under 500 for the rows behind, one
  of under 150 for a slow device, and a 28-triangle stand-in for the floor's mirror and the slowest step) (`court3d/props.ts`).
  Everyone round the floor comes twice in `people.glb`: the body for a close camera, and one of a fifth
  of the triangles (`benchFar`, `staffFar`, `officialFar`) that a sitter is drawn in unless he is a fifth
  of the picture's height, and that throws a walker's shadow and stands in the mirror for him. The app gives
  each part its material by the name Blender gave it, and paints kits and the home colour on. A
  model changes in its `.py`, never by hand in the `.glb`. Two dev-server pages look at them in
  the app's own light: `scripts/qa/figure-lab` (one move as a strip of moments) and
  `scripts/qa/scene-lab` (the whole arena held still from any camera; `lab.bench()` costs a frame).
  The scene (`court3d/scene.ts`, `court3d/lens.ts`) lights it like a broadcast (`court3d/rig.ts`): four
  lamps round the roof, each with a shadow map fixed to the floor, so a man throws four faint shadows
  that are dark where they overlap; a cool edge light from behind, a soft one from the camera's side,
  a fill bounced off the wood, and the arena itself as the environment every material reflects (lamp
  banks in a dark roof, the floor's colour below), so skin, shoes, the ball, the rim and the glass
  catch the lamps. The house lights come down for the open, a timeout and the clutch (`rig.mood`).
  The floor is varnished maple, all drawn in its shader over a bare painted canvas: 2¼ in strips with
  staggered joints, tone and grain, paint glossier than wood, the lanes scuffed dull, the lamp banks
  lying in it as soft broken bars, and a mirror that is sharp at the feet, softer and fainter with
  height. Over the stands a faint lit haze and the lamps' beams; then the finish (antialiased, the
  dark where things meet found from the picture's depth (`court3d/ao.ts`), a restrained glow on the
  brightest things, a warm grade, darker corners, a soft background behind a close-up). Each player wears one painted picture (`court3d/figure.ts`): his kit with
  an outlined number, his name arched on the back, the abbreviation on the front and a team mark on
  the shorts, and, his own every night, one of ten cuts and maybe a headband, a sleeve, wristbands
  or a leg sleeve (one draw a player). The building (`court3d/arena.ts`, `court3d/boards.ts`,
  `court3d/fx.ts`) is alive: the scorer's table, the baseline and far-side boards, the ribbon and the
  scoreboard's screens are LED boards showing the score, period and clock as the court has played
  them (`GameInfo`, no spoilers), DEFENSE while the home side defends, and takeovers for a home three,
  dunk, and-one, block, steal, buzzer-beater, a timeout, the end of a period and the final; after a
  big home basket the scorer's card (his number, name and points so far) and REPLAY; MAKE SOME NOISE
  with a meter late in a close one; a side's leading scorer at a dead ball; and between plays panels
  for invented partners (no real brands); a shot
  clock and the game clock sit over each board. The bowl (`court3d/bowl.ts`) is a building on all
  four sides: stepped rows with aisles, tunnels with the concourse's light in their mouths, a walkway
  with people standing at the rail, lit suites, an upper deck (rows of a painted picture, each seat
  sat or on its feet) and walls up to a roof of trusses, catwalks, speakers and light banks; the near
  side's upper levels sit back behind the cameras. The crowd (`court3d/crowd.ts`) is people: men,
  women and children in the home colours, a visitors' block, seats in the building's colour where
  nobody sits. They shift, follow the ball, stand for a basket (the cheer goes out from the play),
  stand nervously late in a close game, wave towels, rally at a visitor's free throw, hold phones up,
  and leave late in a blowout; cameras flash on big moments. Each sits his own way (forward on his
  knees, sat back, arms folded, chin on a fist, head down over a phone; a few stand in the aisles and
  the top rows), no two side by side alike; a cheer reaches each in his own moment and he holds it his
  own while, and not everyone stands for a small one. While a play is on the stands sit back (stiller,
  a shade darker and greyer, no flashes, the boards a notch down) and come back up at a dead ball and
  a big moment. The end is the kind of win it is (`live/occasion.ts`: the game's type, its series, when
  the lead was taken for good): an ordinary win has handshakes toward centre court, the coaches meeting
  by the table and the crowd standing to clap; a late winner the scorer mobbed, his bench storming the
  floor and the losers down on their haunches; a playoff win chest bumps, roars and towels; a series
  won the five jumping together with the bench round them; a title a hug, a man on his knees, one sat
  on the floor, the crowd on its feet throughout, confetti and streamers in the champions' colours.
  The house lights go down, with spots sweeping the floor, before the tip, at a timeout and after a
  big home win. Banners in the home colours (letters and stripes, no years) hang in
  the roof.
- **The broadcast cuts** (`court3d/director.ts`, `aim` in `scene.ts`): the building from high before
  the tip, an orbit round the line-up, a crane down into the chosen camera (a little operator drift,
  in a little near the rim and at the line, a dip on a dunk), a bench and its coach and then the
  building at a timeout, the building after 1.5 s with nothing to follow, cut-ins on the scorer of a
  big basket, the man fouled or a man who made his free throw (waist up, opening out for his hands
  when they go up, from where nobody and no part of a basket's unit stands between, his face to the
  camera when it can be; left at once if someone or the unit comes in front; a lower third with his
  name, the building behind him soft), now and then his bench or
  the home crowd instead, and at the final buzzer the winners, their crowd, then the whole building.
  Cuts dissolve briefly. **Instant replays**: a dunk, a three, an and-one, a block or a shot at the
  buzzer is shown again at the next dead ball, slowed round its moment (a dunk's slam), from one of six
  cameras in turn (low past the baseline, over the backboard, the floor under the basket, low on the
  near side, the gantry's long lens, tight on the man), never one with the basket's arm or board in
  front of the man, between two wipes in the team's colours with a Replay bug; a shot at the buzzer,
  and at 1x a dunk, a second time, slower and tight. The picture keeps the play and its outcome in
  it, opening out little and slowly, the man high enough that he isn't under empty air, its aim and
  focus going from one thing to the next without a snap. The court's clock holds
  while it runs (CourtView keeps the possession's end until it is over), so nothing live is missed;
  a tap skips it. None at 4x, in key plays, while paused or waiting on a call, in a highlight or with
  reduced motion; at most one every 25 s (37 s above 1x). Reduced motion: no pans, cut-ins or
  replays; each half of the floor is a still picture from the chosen camera, with a cut between.
  A slow device gives up, a step at a time: the finish (and the first rows' detailed people), a little
  sharpness, the shadows (with the players' cloth detail, the roof's extras, and the crowd behind in its
  lightest model), the mirror and the fine wood (the whole house then a quarter of a million triangles),
  then half the sharpness. A phone or a tablet starts without the shadows and is given steps back if it
  keeps up.
- **3D plays a possession at half the 2D pace** (`COURT3D_PACE`): discs can cross the floor in a
  second, bodies can't. Only the play's clock is slowed; the figures' legs run on their own time, so
  a planted foot stays planted. The speed chips mean the same in both; a 3D game takes twice as long.
- **3D is drawn at most 60 times a second**, on the device's normal GPU setting, and not at all
  while paused in the middle of a move (at a held dead ball, a timeout or a huddle, the men keep
  breathing at half the rate for a minute). A phone takes the drawing context from an app in the background: the 2D court shows
  until it is back, then the scene is rebuilt (a new canvas is tried if it isn't back in 3 s).
- **The plan is `choreo.ts`'s; the figures only act it out.** Each keyframe says where every player
  is, what he is doing (`Frame.act`: dribble, screen, jumper, contest, rebound...) and where he
  faces (`Frame.face`). `court3d/puppet.ts` turns that into a body: it picks one of the clips in
  `court3d/clips.ts`, blends from the last, walks the feet (a planted foot stays where it landed) and
  solves arms and legs, so a hand on the ball is on the ball. Nothing in `court3d/` decides anything
  about the game.
- **Most clips are motion capture** (`court3d/mocap.gen.ts`, written by `npm run mocap:build` from
  CMU Motion Capture Database takes kept in `data/raw/mocap`, outside the repository): standing,
  walk, run, sprint, the defensive slide and stance, both dribbles, the crossover, the chest pass,
  the jump shot, free throw and layup. A take is measured into the puppet's own channels (hands from
  shoulders, hips, chest, head, elbows), so it fits any build and the feet stay the puppet's. No take
  covers a dunk, block, rebound, screen, post-up or celebration: those are keyed by hand in
  `clips.ts`, with three dunks (two hands, one, a hang on the rim), a free-throw routine and the
  dead-ball rests (hands on hips, on knees after a long stretch). Over every clip, a layer of its own:
  each man looks at something (the ball, his man, the rim, his target), breathes, keeps his hands
  busy on defence, and gestures (a flex, a point, a high five on the way back, a hand up for the foul,
  a protest, chest bumps at the buzzer). Bodies that meet are drawn touching (`Frame.meet`: a screen
  and the man it is set on, a box-out and the crasher; `court3d/spacing.ts` keeps everyone else apart,
  the walk to a timeout's bench too). The ball misses off the front rim, the back iron or round the
  ring, some makes rattle in, and passes go on a bounce under a defender in the lane.
  `scripts/qa/figure-lab/` shows any move as a strip of moments on the dev server, and
  `scripts/qa/motion-lab/` plays a simulated game through the real scene and measures it.
- **The floor is the home team's**: maple, its colour in both keys and the centre circle, its mark at
  centre court, its name along the baselines. The Cup final's floor is neutral. **Each building is its
  own** (`venueLook` in `teamColors.ts`, from the team's colours and a hash of its letters, the same
  every night): the maple's stain (pale blonde to deep honey), keys painted or stained and edged, a
  two-tone arc or none, the apron in its colour, its second or a dark stain, the circle filled, ringed
  or under a big mark, its city or name round the floor; in 3D the seats by section, the walls'
  padded tops, the concourse's signs and plates, a warm, plain or cool house and its partners' order.
  Shapes, colours and the team's own name: no real arena's marks. The 2D floor keeps it quiet (boards
  a breath apart, the paint and the mark let down into the wood) so the play reads first.
- **One colour a team, all night** (`matchKits` in `teamColors.ts`, `s.kits` in the live game): the
  scorebug's block, the win bar, the call bar's chips, the shot chart and the players on the floor
  all read from the same kit. The home team wears white trimmed in its colour (it stands on its own
  paint), the visitors their colour solid, so the two sides never look alike. Two teams whose
  colours read as the same (a perceptual distance, `lookDistance`) send the visitors to their next
  colour everywhere at once. Live code never calls `teamLook`, `matchupLooks` or `nightFill` itself.
- **Nothing sits over the court while the game plays** but the canvas's own short labels (Steal, +3,
  Foul: sentence case, never under 12px) and the ball handler's name tag. Everything else goes in the
  **call bar** (`live/CallBar.tsx`), one fixed-height ink strip that shows exactly one thing at a
  time: playback when the user asks (a tap on the court or its pause button), an offer, the one
  banner, a callout, a graphic, the crowd's line, or by default the running call of the play.
- **The court is never empty.** Before the tip the fives stand around the centre circle; in a huddle
  or a stop the players stay where the play left them; at a break the floor shows every shot so far
  (each team's at the end it attacks first, under an ink veil, in its colour as it reads on ink: a make
  a solid dot, a miss a thinner cross, both edged in ink and a pile eased apart so it reads as so many
  shots; each team's count and a Made/Missed key on the sideline aprons).
- **The breaks keep the court.** At a period's end or in your timeout the stage becomes the compact
  whole floor and the console opens on the break board (`BreakBoard`: the line score, and at a break
  the team comparisons) above the period report or the huddle. The next period starts from the bench bar.
- **The final buzzer is a frame**: a game watched to the end freezes the floor under the final score
  (`FinalFrame`) for a beat before the final card.
- **Clutch time shows**: the scorebug's clock plate, the call bar's edge and the stage's frame change,
  and the building's lights come down around the floor.
- **Reduced motion** keeps the game: the players still move (that is the content) and every label
  still shows; the camera cuts instead of panning and nothing spins, shakes, trails or fades.
- **The scorebug labels its figures**: each team's block reads Timeouts n and Fouls n (Penalty n
  when the other team is in the bonus), and the bar under it reads To win. A player's row shows his
  energy as a bar and a word (Fresh, Tiring, Tired), then OVR, MIN, PTS and PF in columns.
- **One bench bar** takes the tab bar's place: the one action the moment calls for first (Timeout
  while the game plays, Start the next period at a break, Resume in your huddle), then the
  console's views (Now, Players, Tactics, Stats; Now counts the staff's calls waiting).
  Don't add a second row or a floating button.
- **One console** under the court (beside it, held sideways) holds every coaching control, in its
  four views, **one question a view**. Now: what needs me? (the staff's read, its calls, who's tired
  or in foul trouble with the sub a tap away, the keys.) Players: who's on, who's fresh, who can come
  in? (the same row for your five, your bench and their five.) Tactics: what's each side running and
  what do I change? Stats: what happened? **Evidence next to the lever**: a Tactics row says in plain
  words how a play is going ("7 points on 4 trips", Hurting you), with its lever named under it. A
  lever shows once. Every setting is in its sheet, one tap down. A new control goes in one view, once.
- **The staff has one voice**: the lead assistant (`leadAssistant`) heads Now, the breaks,
  the pre-game briefing and the debrief, as `AssistantHead` with a read in a sentence; his calls are
  `NoteCard`s: the evidence as its headline, his opinion ("The staff thinks this helps from here"),
  the moves on offer with his pick first, and Not now. No figure and no method behind it.
  Don't build another advice box.
- **Every move is tracked**: a tactics change, sub or timeout shows in Your moves with the score since
  (`coachMoves`, drawn with `MovesList`), in the live game and in the report.
- Playback (pause, skip, speed, key plays) lives only in the call bar.
- **The way out is on the scorebug's top line** (Leave, beside what's at stake): the game waits where
  it is, and the Continue bar and its Matchup page resume it.
- The period report is the story so far, the staff and its calls, what's deciding it (each edge named
  by its team, never by colour alone), who is tired or in foul trouble, the keys, and both benches;
  the box score and play types stay in their own views.
- **The game stops for you only when it's close** (`closeGame`: neither side 95% to win it): a fifth
  foul or a closer out of legs the staff won't handle, and the last possession (your ball, tied or
  down three, the shot clock off), which opens the play call without a timeout. Late in a game the
  play call heads the huddle, built around your closer: his isolation, his sets, one for someone else.
- Every change during a game goes through the live controller (the journal records it), never a raw
  league edit. Tactics says what's changed since the tip, in Tactics' words.
- **One box score**: `BoxScore` (`components/BoxScore.tsx`), in the live game and the report, with
  MIN PTS REB AST STL BLK TOV FG 3P FT PF +/-. Don't build another.
- Two-team comparisons use `CompareBar`, which puts the winning figure in a pill of its side's
  colour (`higherBetter={false}` where lower wins, as for TOV%).
- A highlights reel that plays on request is one header line with its button until it's played.

## Copy

- **Headline + figure.** A card says what it is in a headline and at most one short line. Anything
  longer goes behind `Help` or `More`. No paragraph of more than two lines is visible by default.
- **Fifteen words, one idea.** A sentence has at most 15 words and says one thing. No bracketed
  asides, no semicolons, no chains of colons (one colon as a label is fine: "Next: set your
  rotation"). A help text is at most two sentences. This holds for strings built in `src/core` too
  (advice, stories, mail, reasons, toasts).
- **One line under a control, the rest behind its `?`.** What a setting does or why the staff
  picked something gets one short line at most on the screen.
- **Screens speak plainly, without "I".** The owner and the staff speak in first person only in
  their mail and their call cards.
- **The staff's measurements read as a verdict and one number**: "Helps: about +1 point a game."
  The range, the sample and the per-100 figure are one tap down.
- Cut "you can", "this shows", restating the label, and hedges.
- Wrap figures that must not break in `keep()` (records like 7-0, "3-game", "proj. #12-17").
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
- Names of controls in advice must match the controls on screen (Team → Tactics sections: Tactic,
  Instructions, Match, Analysis; Instructions' phases: In possession, Transition, Out of possession,
  each with its headline decisions and a Fine-tune; a player's roles and instructions are on his sheet
  from the board).
- **Tactics: big decisions on the surface, the rest one tap down.** Each phase of Instructions shows
  at most three headline decisions (one control may move several settings: Play through sets the five
  action weights, When a shot goes up the glass and getting back) and a Fine-tune with every setting
  apart. Each section is its own path under the Team tabs (`/team/tactics/:sub`), so
  a phone shows one row of tabs and one switch over the content; over each, a card holds the style,
  its mentality and Change (the style sheet: Offense, Defense, Mentality); on Tactic it also holds
  the assistant's switch and the staff's latest move. A section's own switch is its heading (`HeadSwitch`: the board's in/out of possession, the phase, the view).
- Inbox mail: a subject that says what happened and a one-line summary; detail below it. **Mail is
  for what changes a plan**: what a screen already shows (a short injury, "the season starts")
  doesn't get mail. One mail per pitch or event: a repeat replaces its earlier mail.
- **One "Needs you" count** (`today/needs.ts`): the bell's badge and Today's Needs you are the same
  number, in the same order, and the bell opens it (a sheet over any screen, the inbox a row under
  it): the agenda's decisions (the staff's calls first, always on Today's page; AI teams' trade
  offers last, two or more as one row), mail that needs you and isn't one of them (`needsYou`:
  important mail from the last two weeks of this season), the deadline's last week and a backup
  due. The staff's advice and a warm seat sit beside it on Today, uncounted. The inbox's own filter
  for big news and open decisions is "Important"; other mail is unread in the list without feeding
  a count.
- **A call is never passed in silence.** A sim that opens one says so (stopped for it, or ending
  where it was going anyway), the digest and the Play options show the calls still open over what
  would pass them, and one still open stops a long sim once more as its due date nears.

## Motion

- **One vocabulary** (`styles/motion.css`, hooks in `ui/motion.ts`). Arriving eases out
  (`--ease-out`), leaving eases in and is shorter (`--ease-in`), a thing moving between two places
  uses `--ease-move`, a small control settling uses `--ease-spring`. Only opacity, the `translate` /
  `scale` properties (never fighting an element's own `transform`), a clip and a stroke being drawn
  move. Motion says something: where a thing came from, what changed, what answered the touch.
  Nothing loops unless it's live (a game in progress, a sim running, the draft clock).
- **A screen's blocks rise in one after another**, top first (`.page > *`, 32ms apart, the first
  six). The page itself never moves (a transform would trap its fixed docks); a block holding a
  fixed dock stays still, and `.no-rise` opts a block out. A thing that mounts later takes a utility:
  `m-rise`, `m-pop`, `m-slam` (a result landing), `m-flash` (a value that just changed, with
  `useChanged`), `m-tick-up`, `m-draw` (an SVG line, `pathLength="1"`), `m-grow-x` / `m-grow-y`,
  `m-stagger` (a short row of children, the first eight). A chart or a meter starts when it scrolls
  into view (`useSeen`); a number that changes glides (`useTween`).
- **A choice slides.** The segmented control's thumb, the page tabs' ink rule and the level scale's
  ink thumb travel to the option chosen (`useIndicator`); a bar fills from the left and slides to a
  new value; a switch's knob settles.
- Sheets and the Continue bar slide up; a sheet slides back down when it closes (showing what it
  showed while open), and a drag let go short of closing settles back. Press states scale to 0.97
  (buttons, team tiles, chips) or darken (rows, segments, icon buttons); a mouse gets a hover state
  too (`(hover: hover)` only, never something a touch needs).
- **Toasts** (ink pills with white text) rise above the Continue bar (over a sheet: at the top, clear of its buttons), at most two
  at once, one width, an icon for their tone. A tap dismisses one or opens its link. A sim or a phase
  change starting clears the ones before it: a toast is about the league as it was. On the live page
  they go to the court's top corner instead, over the far stands (the newest only, smaller: toastHost.ts),
  never over the players or the console.
- **Loading**: nothing for 300ms, then a spinner fades in where the screen will be (`Waiting` in
  App.tsx). Never a "Loading…" line that flashes on every lazy screen.
- While a sim runs, the Continue bar fills from the left with your colour's edge along its foot and says
  "Day n of N"; a one-shot job (a new season, free agency) shows a sweeping glow instead.
- Figures in a `Statline` count up when a screen opens (`CountUp`), once.
- Big moments get a full-screen card in your colours (`moments.ts`, `components/Moments.tsx`), once,
  after a sim and outside the live game: career moments, or else the one biggest front-page story.
  A game's own report opens on its result moment (score counts up once, under a second), so a game's
  story never takes the screen there.
- The live game's atmosphere (`live/atmosphere.ts`): runs, the crowd's glow by the arena's name, one
  big-play callout at a time (rate-limited), and a clutch state in the last five minutes within five.
- Everything respects `prefers-reduced-motion` (tokens.css zeroes animations; a keyframe names only
  its start, so a thing that never animates is still there; scripts ask `reducedMotion()`).

## Accessibility (unchanged bar)

- 4.5:1 text contrast on every ground.
- 44px touch targets (compact controls extend their hit area with `::after`).
- Radio groups for switches, `aria-pressed` on toggles, names on icon buttons, `sr-only` text where
  a badge alone carries meaning, focus rings in `--accent-text`.
