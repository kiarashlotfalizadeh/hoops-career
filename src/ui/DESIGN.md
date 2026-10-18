# Courtside: the Hoops Career design system

A dark, game-first broadcast look for a phone, built for players who want the whole sim: depth is
always there, one tap down, never hidden behind a mode. Read this before changing a screen;
`src/ui/theme.css` holds the tokens and shared classes, `src/ui/components/ui.tsx` the shared
components.

The north star is **coherence: one obvious place for everything.** Before adding a figure, a control
or a screen, find where it already lives. If it's there, link to it; don't show it again.

## Information architecture

Five tabs, one per role. Every screen belongs to exactly one (`tabFor` in `nav.ts` lights it).

| Tab        | What it's for         | Lives here (and nowhere else)                                                                                                                                                                                                                                                       |
| ---------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**  | What needs you now    | The agenda (decisions waiting), the staff's top advice, the next game at a glance, the inbox (`/inbox`), settings (`/settings`), god mode (`/god`), the glossary                                                                                                                    |
| **Team**   | Who plays and how     | Your roster with its views (players, ratings, stats, contracts) at `/team`; rotation `/team/rotation`; tactics (playbook, offense, defense, roles, game management, saved playbooks) `/team/tactics`; lineups `/team/lineups`; your players' pages; compare                         |
| **Games**  | When and against whom | Your schedule and results (`/games`); one **Matchup** page per opponent (`/games/:tid`: scouting, the game plan, matchups, the Lab against them, and on game day the preview); the live game (`/live`); game reports (`/game/:gid`); the Lab (`/lab`, for comparing your own edits) |
| **League** | Everyone else         | Standings and odds, the schedule around the league, stats, ratings, playoffs, the Cup, awards, news, other teams' pages (`/teams/:tid`), other players' pages, history (`/league/history`: seasons, records, Hall of Fame, coaches)                                                 |
| **Office** | The GM's desk         | The cap sheet and exceptions, trade (`/office/trade`), free agents, re-signing, the draft, picks, finances, the owner and job security (`/office/owner`), your career and job offers (`/office/career`)                                                                             |

Rules that follow from it:

- **Your team has one home: Team.** Other screens show a one-line summary and link there (Office's
  cap sheet links to Team → Roster → Contracts; it doesn't repeat the table).
- **Anything about one opponent lives on its Matchup page.** Home, the schedule, a team's page, the
  live game and the report link to `/games/:tid`; they don't host their own scouting, plans or
  matchup editors.
- **Money lives in Office.** Payroll appears once as a figure on Team → Roster's header line, and in
  full only in Office.
- **The owner lives in Office → Owner**, as one job-security meter (`jobSecurity`); Today shows the
  meter only when the seat is warm.
- **Advice has one voice.** Everything the staff says comes through the assistant feed
  (`core/ai/assistant.ts`, drawn with `AssistantCards`): a screen shows the cards for its own area.
  Don't build a new tips box.
- **Decisions have one list.** Anything the user must or may decide (cuts, offer sheets, offers,
  10-days, his pick, a new job) is an agenda item (`core/league/agenda.ts`, drawn with
  `AgendaList`/`AgendaRow`), settled in place. Required items hold the Continue bar.
- Routes from before the redesign redirect (`routes/legacy.tsx`); link to the new ones.

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

Don't hard-code colours that exist as tokens. Team colours for another team come from
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
- Lists: `.card.flush` > `.list` > rows. `.listrow` (58px), `.lr-name`, `.lr-meta`. Your own rows:
  a `--team-text` inset edge + 9% tint.
- Figures: `Statline` for 2-4 figures in a row; `Kpi` tiles only for a grid of many.
- `Segmented` (`tabs` for page tabs), `Chips`, `.tag`, `Ovr`, `Avatar`, buttons (`.btn`, `.primary`,
  `.ghost`, `.danger`, `.good`, `.sm`, `.xs`, `.block`, `.big`).
- `Help` ("?" opening a sheet) and `More` (an expander) carry every explanation. `Toggle`'s `help`
  goes behind its "?" automatically.
- `Term` (`components/Glossary.tsx`): a word with a glossary entry (drop, MLE, eFG...): tap for what
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

Spacing: the page stacks sections 16px apart; inside a section 10px; inside a card 10-12px. Phone
first: wide screens get the same single column, centred, at most 788px. Grid columns are
`minmax(0, 1fr)`, never a bare `1fr` (a long line would push the page sideways).

## The live game

Broadcast first: the court is always the biggest thing on screen.

- A slim scorebug sits over a full-width court (the win-probability sliver and the scores ticker
  under it when Settings has them on). Captions, graphics, replays and **one banner at a time**
  (injuries, foul-outs, their adjustments, the staff's alerts) go over the court, never beside it.
- **One row of quick actions** takes the tab bar's place: TO, Subs, Call, the staff's top fix as a
  pill, Clipboard. Don't add a second row or a floating button.
- **One Clipboard** (Lineup, Tactics, Calls, Box, Play-by-play) holds every coaching control; it
  docks under the court when there's room and opens as a sheet otherwise. A new control goes in one
  of its tabs, once.
- Playback (pause, replay, skip, speed, key plays) lives only in the court's tap-to-reveal overlay.
- **One break screen** for quarters, halftime and timeouts (huddle mode): the score and the chance
  to win, who's tired or in foul trouble, what's deciding it with Apply, the keys, and Start.
- Every change during a game goes through the live controller (the journal records it), never a raw
  league edit.

## Copy

- **Headline + figure.** A card says what it is in a headline and at most one short line. Anything
  longer goes behind `Help` or `More`. No paragraph of more than two lines is visible by default.
- Cut "you can", "this shows", restating the label, and hedges.
- Sentence case for text and buttons; capitals only through the overline/display styles.
- Numbers over words where a number says it: "3-7 in last 10", "+3.4 pts/100".
- Keep explanations that teach the game, but behind `Help`/`More`/`Term`.
- Names of controls in advice must match the controls on screen (Team → Tactics tabs: Playbook,
  Offense, Defense, Roles, Game Mgmt).
- Inbox mail: a subject that says what happened and a one-line summary; detail below it.

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
