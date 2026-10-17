# Courtside: the Hoops Career design system

A dark, game-first broadcast look for a phone. Read this before changing a screen; `src/ui/theme.css`
holds the tokens and shared classes, `src/ui/components/ui.tsx` the shared components, and
`src/ui/screens/Home.tsx` + `home.css` are the reference screen.

## Principles

1. **One brand, team identity where a team is the subject.** Controls (primary buttons, the active tab,
   chips, sliders, focus, links) use the brand orange `--accent` whatever team you run. Team colours
   appear only on identity surfaces: slabs (a team's or player's hero), jersey badges, team marks, the
   live court's floor, and a thin edge on your own rows (`--team-text`). Never tint a whole screen.
2. **Flat, not boxed.** Hierarchy comes from type, space and hairlines. A screen is a stack of
   sections with overline headings (`Section`), not a stack of identical cards. Use a card (`.card`)
   for a list or a group of controls that needs a ground; use `.card.flush` + `.list` for rows. One
   slab per screen at most, at the top.
3. **Scoreboard figures.** Numbers people look at (records, ratings, stats, money) are set in the
   condensed display face (`.display`, `.kpi .v`, `.statline .v`, `.ovr`), tabular.
4. **Short copy.** Every visible line earns its place. A card says what it is in a headline and at
   most one short line; explanations live behind `Help` (sheet) or `More` (expander). Write like a
   broadcast graphic, not a manual. Keep facts accurate to the engine.
5. **Thumb first.** Primary actions sit low (the Continue bar, a screen's own `.dockbar`), targets are
   44px, nothing important hides behind hover.

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
`identityColor`, `matchupColors`/`jerseyColors` for two teams side by side.

## Type

One family, Archivo (variable width). Whenever you set `font-family: var(--display)` also set
`font-stretch: var(--display-w)` and a heavy weight (800).

- `h1` 30-32px display caps: the page title (`PageHeader`).
- `h2` 22px display caps: a sheet's title, a slab's headline.
- `.over` / a section's or card's `h3`: 11.5px, 750, wide-spaced caps, `--text-dim`. This is the
  workhorse label for sections, figures and table heads.
- Body 15px; `.small` 13px; `.tiny` 11.5px. Meta lines 12.5px `--text-dim`.
- Figures: display face, tabular (`.num`).

## Components and classes

- `PageHeader` (`.ph`): back button, title, one short sub line, a control on the right.
- `Section` (`.sec`, `.sec-h`): overline title + right-side link (`.card-link`: brand text with a
  chevron) + content. Prefer it to `Card title=...` for anything that isn't a single grouped panel.
- `Card` (`.card`): flat `--raised` panel, 12px radius. `.flush` for edge-to-edge lists, `.tight`.
  `accent` = a highlighted card (thin brand edge); use sparingly (onboarding, a decision waiting).
- `.slab` (+ `.slab-mark` for a big faded team mark): the identity hero. Your team by default; another
  team with `style={slabVars(colors)}`. White text tokens are set inside it. It has a cut top-right
  corner and a trim line along the bottom. `.slab.plain` drops the cut.
- Lists: `.card.flush` > `.list` > rows. `.listrow` (58px, 14px sides), `.lr-name`, `.lr-meta`.
  `.list-divider` for group labels. Your own rows: a `--team-text` inset edge + 9% tint.
- Figures: `Statline` (`.statline`: label/value/sub, hairlines between, no boxes) for 2-4 figures in a
  row; `Kpi` (`.kpi`) when figures must be tiles (a grid of many).
- `Segmented`: a boxed switch for filters and options; `tabs` prop for a screen's own sections
  (underlined page tabs, `.seg.tabs`). Keep `role=radiogroup`.
- `Chips` / `.chip`: toggles and quick filters. `.tag` (+ `good` `bad` `warn` `info` `brand`):
  small caps labels; never a whole sentence.
- `Ovr` (tier badge), `Avatar` (the jersey badge: team colours and number; neutral kit for free
  agents and prospects).
- Buttons: `.btn` (44px), `.primary` (brand), `.ghost`, `.danger`, `.good`, `.sm` (34px), `.xs` (28px,
  padded hit area), `.block`, `.big` (display caps with the number-plate cut: the screen's one big
  call to action).
- `Help` (a "?" that opens a sheet) and `More` (a "More ⌄" expander) for explanations.
- `Sheet`: bottom sheet (dialog on tablets). Title in `h2`.
- `.dockbar`: a screen's own fixed action bar over the tab bar; the Continue bar steps aside for it
  (and for `.fo-dock` and `.gd-dock`).
- `.empty` for empty states: one line, what to do next.

## Screen anatomy (phone)

1. `PageHeader` (or a slab for identity screens: Home, a team, a player).
2. `Segmented tabs` for the screen's own sections, if any.
3. The thing the screen is for, first. Then sections in order of use.
4. Nothing important below a long list; filters above it.

Spacing: the page stacks sections 16px apart; inside a section 10px; inside a card 10-12px.

## Copy

- Headline + one line. Cut "you can", "this shows", restating the label, and hedges.
- Sentence case for text and buttons; capitals only through the overline/display styles.
- Numbers over words where a number says it: "3-7 in last 10", "+3.4 pts/100".
- Keep explanations that teach the game (what a coverage does, why fit is 72), but behind `Help`/`More`.
- Names of controls in advice must match the controls on screen.

## Motion

- Screens fade in (opacity only: a transform would trap fixed docks). Sheets and the Continue bar
  slide up; toasts drop in. Press states scale to 0.97.
- Big moments (a clinch, a title, your draft pick, a signing, an award) get a full-screen moment.
- Everything respects `prefers-reduced-motion` (theme.css zeroes animations).

## Accessibility (unchanged bar)

- 4.5:1 text contrast on every ground (the tokens hold it; tinted surfaces lighten `--text-dim`).
- 44px touch targets (compact controls extend their hit area with `::after`).
- Radio groups for switches, `aria-pressed` on toggles, names on icon buttons, `sr-only` text where
  a badge alone carries meaning, focus rings in `--accent-text`.
