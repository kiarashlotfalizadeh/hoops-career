# Courtside: the Hoops Career design system

A dark, game-first broadcast look for a phone, built for players who want the whole sim: depth is
always there, one tap down, never hidden behind a mode. Read this before changing a screen;
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

| Tab        | What it's for         | Lives here (and nowhere else)                                                                                                                                                                                                                                                                                                                                    |
| ---------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**  | What needs you now    | The agenda (decisions waiting), the staff's top advice, the next game at a glance, the inbox (`/inbox`), settings (`/settings`), god mode (`/god`), the glossary                                                                                                                                                                                                 |
| **Team**   | Who plays and how     | Your roster with its views (players, ratings, stats, contracts) at `/team`; rotation `/team/rotation`; tactics (playbook, offense, defense, roles, game management, saved playbooks) `/team/tactics`; lineups `/team/lineups`; your players' pages; compare                                                                                                      |
| **Games**  | When and against whom | Your schedule and results (`/games`); one **Matchup** page per opponent (`/games/:tid`: scouting, the game plan with the staff's counters tested in place, matchups, the Lab against them, and on game day the preview; its slab carries the plan's state); the live game (`/live`); game reports (`/game/:gid`); the Lab (`/lab`, for comparing your own edits) |
| **League** | Everyone else         | Standings and odds, the schedule around the league, stats, ratings, playoffs, the Cup, awards, news, other teams' pages (`/teams/:tid`), other players' pages, history (`/league/history`: seasons, records, Hall of Fame, coaches)                                                                                                                              |
| **Office** | The GM's desk         | The cap sheet and exceptions, trade (`/office/trade`), free agents, re-signing, the draft, picks, finances, the owner and job security (`/office/owner`), your career and job offers (`/office/career`)                                                                                                                                                          |

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

## Principles

1. **One brand, team identity where a team is the subject.** Controls (primary buttons, the active
   tab, chips, focus, links) use the brand orange `--accent` whatever team you run. Team colours
   appear only on identity surfaces: slabs, jersey badges, team marks, the live court's floor, and a
   thin edge on your own rows. Never tint a whole screen.
2. **Flat, not boxed.** Hierarchy comes from type, space and hairlines. A screen is a stack of
   sections with overline headings, not a stack of identical cards. One slab per screen at most, at
   the top.
3. **Scoreboard figures.** Numbers people look at are set in the condensed display face, tabular.
4. **Short copy.** See Copy.
5. **Thumb first.** Primary actions sit low (the Continue bar, a screen's own `.dockbar`), targets
   are 44px, nothing important hides behind hover.
6. **Density with a ceiling.** A hub page opens on what it's for and shows at most about six
   sections; the rest is a tab or a link away. No figure appears twice on one screen (the record is
   in the top bar: a screen doesn't repeat it unless it's the subject).

## Tokens (theme.css `:root`)

| Token                                           | Use                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `--bg` `--bg-2`                                 | page ground; sheets, table heads, field grounds                   |
| `--raised`                                      | cards, tables, list grounds                                       |
| `--surface` `--surface-2` `--surface-3`         | pressed rows, buttons, chips on, tracks                           |
| `--line` `--line-2` `--line-3`                  | hairlines: between rows / around controls / strong                |
| `--text` `--text-2` `--text-dim`                | primary / secondary / labels and meta (all 4.5:1 on every ground) |
| `--accent` `--accent-text` `--accent-ink`       | brand fill / brand text and links / ink on brand fills            |
| `--good` `--bad` `--warn` `--info`              | signals only (wins, losses, issues, tips)                         |
| `--tier-*`                                      | OVR badge tiers (via `ovrColor`)                                  |
| `--team` `--team-2` `--team-text` `--team-slab` | your team's identity (set by `applyAccent`)                       |
| `--display-w` `--text-w`                        | the font's width axis for display (68%) and text (90%)            |
| `--gut-l` `--gut-r`                             | the page's side gutters (16px, more past a notch)                 |
| `--gap-page` `--gap-sec` `--pad-card`           | density: between sections (12), heading to content (8), in a card |
| `--row-min` `--row-py` `--row-px`               | a list row: 48px tall at least, its padding                       |
| `--cell-py` `--cell-px`                         | a stat table's cell padding                                       |

Don't hard-code colours or spacing that exist as tokens: screens read the density tokens so they
tighten (or loosen) together.

Figures are written by `src/core/format.ts`, the same way on every screen and in every message:
`money` ("$12.3M"), `moneySigned` ("+$1.2M"), `moneyExact` (to the $10K for minimums, two-ways and
cash: "$1.27M") and `plural` ("1 game", "5 games"). Don't write a new inline formatter. Team colours for another team come from
`teamColors.ts`: `slabVars(colors)` for a slab, `jerseyKit` (inside `Avatar`), `teamLook`,
`identityColor`. Two teams side by side use `matchupLooks`, and `matchupColors`/`jerseyColors` for
lines and jerseys.

## Type

One family, Archivo (variable width). Whenever you set `font-family: var(--display)` also set
`font-stretch: var(--display-w)` and a heavy weight (800).

- `h1` 30-32px display caps: the page title (`PageHeader`).
- `h2` 22px display caps: a sheet's title, a slab's headline.
- `.over` / a section's or card's `h3`: 11.5px, 750, wide-spaced caps, `--text-dim`.
- Body 15px; `.small` 13px; `.tiny` 11.5px. Meta lines 12.5px `--text-dim`.
- Figures: display face, tabular (`.num`).

## Components and classes

- `PageHeader` (`.ph`): back button, title, one short sub line, a control on the right. A hub's
  sections use `TabBar` (`league/shared.tsx`, sticky page tabs) under it, never a second header.
- `Section` (`.sec`, `.sec-h`): overline title + right-side link (`.card-link`) + content.
- `Card` (`.card`): flat `--raised` panel. `.flush` + `.list` for rows. `accent` sparingly.
- `.slab` (+ `.slab-mark`): the identity hero. Your team by default; another with `slabVars(colors)`.
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
- `Segmented` (`tabs` for page tabs), `Chips`, `.tag`, `Ovr`, `Avatar`, buttons (`.btn`, `.primary`,
  `.ghost`, `.danger`, `.good`, `.sm`, `.xs`, `.block`, `.big`).
- `Help` ("?" opening a sheet) and `More` (an expander) carry every explanation. `Toggle`'s `help`
  goes behind its "?" automatically.
- `Term` (keeps the caps of the heading it sits in) (`components/Glossary.tsx`): a word with a glossary entry (drop, MLE, eFG...): tap for what
  it means. `GlossarySheet` is the whole list. Use `Term` the first time a screen shows jargon.
- `AgendaList` / `AgendaRow` (`components/Agenda.tsx`): decisions with their actions in reach.
- `AssistantCards` (`components/Assistant.tsx`): the staff's advice for an area, with one-tap fixes.
- `Sheet`: bottom sheet (dialog on tablets). Title in `h2`.
- `.dockbar`: a screen's own fixed action bar over the tab bar; the Continue bar steps aside for it.
- The Continue bar (App.tsx) names the next step and runs it. A required agenda item takes its place
  and opens in a sheet to be settled. On the screen the next step names, it shrinks to its options.
- `.empty` for empty states: one line, what to do next.

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
  under it when Settings has them on). Captions, graphics, replays and **one banner at a time**
  (injuries, foul-outs, their adjustments, the staff's alerts) go over the court, never beside it.
- **The scorebug labels its figures**: each team's block reads Timeouts n and Fouls n (Penalty n
  when the other team is in the bonus), and the sliver under it reads To win. A player on the floor
  shows points, energy (bar and %) and fouls as "n PF".
- **One row of quick actions** takes the tab bar's place: Timeout, Subs, Call, the staff's top fix
  as a pill, Clipboard. They carry no counts (the scorebug has them). Don't add a second row or a
  floating button.
- **One Clipboard** (Lineup, Tactics, Calls, Box, Play-by-play) holds every coaching control; it
  docks under the court when there's room and opens as a sheet otherwise. A new control goes in one
  of its tabs, once.
- Playback (pause, replay, skip, speed, key plays) lives only in the court's tap-to-reveal overlay.
- **One break screen** for quarters, halftime and timeouts (huddle mode): the score and the chance
  to win, who's tired or in foul trouble, what's deciding it with Apply, the keys, and Start.
- Every change during a game goes through the live controller (the journal records it), never a raw
  league edit. The Clipboard's Tactics tab says what's changed since the tip, in Tactics' words.
- **One box score**: `BoxScore` (`components/BoxScore.tsx`), in the live game and the report, with
  MIN PTS REB AST STL BLK TOV FG 3P FT PF +/-. Don't build another.
- Two-team comparisons use `CompareBar`, which puts the winning figure in a pill of its side's
  colour (`higherBetter={false}` where lower wins, as for TOV%).
- A court or reel that plays on request is one header line with its button until it's played.

## Copy

- **Headline + figure.** A card says what it is in a headline and at most one short line. Anything
  longer goes behind `Help` or `More`. No paragraph of more than two lines is visible by default.
- Cut "you can", "this shows", restating the label, and hedges.
- Sentence case for text and buttons; capitals only through the overline/display styles.
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
  Lab's or the league's numbers at runtime, or none. The engine is re-tuned; copy isn't.
- Keep explanations that teach the game, but behind `Help`/`More`/`Term`.
- Names of controls in advice must match the controls on screen (Team → Tactics tabs: Playbook,
  Offense, Defense, Roles, Game Mgmt).
- Inbox mail: a subject that says what happened and a one-line summary; detail below it. **Mail is
  for what changes a plan**: what a screen already shows (a short injury, "the season starts")
  doesn't get mail. One mail per pitch or event: a repeat replaces its earlier mail.

## Motion

- Screens fade in (opacity only: a transform would trap fixed docks). Sheets and the Continue bar
  slide up; toasts drop in. Press states scale to 0.97.
- Figures in a `Statline` count up when a screen opens (`CountUp`), once.
- Big moments get a full-screen card in your colours (`moments.ts`, `components/Moments.tsx`), once,
  after a sim and outside the live game.
- Everything respects `prefers-reduced-motion` (theme.css zeroes animations).

## Accessibility (unchanged bar)

- 4.5:1 text contrast on every ground.
- 44px touch targets (compact controls extend their hit area with `::after`).
- Radio groups for switches, `aria-pressed` on toggles, names on icon buttons, `sr-only` text where
  a badge alone carries meaning, focus rings in `--accent-text`.
