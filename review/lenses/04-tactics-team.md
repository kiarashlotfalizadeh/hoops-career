The tool refused to write `REPORT.md` because subagents can't create report files. The full report is below, and the lead should save it to `review/tactics-team/REPORT.md` if a copy on disk is needed. Everything else is in `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/tactics-team/`: screenshots in `shots/`, headless outputs (`*.txt`) and the scripts that made them (`*.ts`, `*.mjs`). The repo is untouched (`git status` is clean).

---

# Lens 4: `tactics-team` (Team tab: roster, rotation, tactics, lineups, partnerships, familiarity, player pages, compare)

Shot paths below are relative to `/private/tmp/claude-501/-Users-kiarash--claude-spares-spare-hVNZPT/b285bc02-5a07-46d5-a46e-e152c55fa3b7/scratchpad/review/tactics-team/`.

## 1. Verdict

Team → Tactics looks and feels like the deepest basketball tactics screen on a phone. FM-style slots, a board with roles at both ends, partnerships, phases, familiarity and situations are all there, and much of it is well presented. The after-the-fact evidence is the honest, strong part: game tags like "−2.2 the Suns found the weak-side corner when the Hawks iced ball screens", the luck line, and the staff's "our blitzing has given up 2.0 and won 1.3 back, so I've changed it".

The numbers a player chooses by are a different story. I measured them against the engine. The style **Fit** score has no measurable relationship to what a style is worth (r ≈ 0). The shape's "per 100" figure is close to a coin flip. Two of the fourteen report grades don't predict their own stat. Meanwhile one offense (Heliocentric) beats the staff's pick for 20 of 26 teams, and no team runs it. Several big-looking levers (situations, defensive roles, player system knowledge, the assistant's in-game adjustments) measure at about zero.

So an expert can express a real idea, but neither an expert nor a newcomer can find out whether it worked. Real effects are 0.5–2.5 points per 100, and a season's noise is larger than that. The app never measures a change for you or keeps a before/after for it.

**Score: 6/10.** The presentation and the post-game "why" are 8-level work. The pre-choice guidance is uncalibrated, and that undercuts the headline promise.

## 2. What's genuinely great (protect these)

- **The Shape sheet is the model for every picker.** Each shape shows points per 100 against 4-out, how well the team knows it, and a +/− trade-off line ("Non-shooters get sagged off; fewer offensive boards; no post game"). See `shots/22-shape-1.png`. Its _format_ is exactly right (finding 3 is about the number in it).
- **The role editor** (`shots/21-player-okongwu-1..3.png`) shows star fit per role, the role-pair familiarity it would cost (70% vs 100%), and the partnerships each role would create ("Handoff chain with McCollum · Handoff chain with Daniels").
- **Evidence-based staff changes, explained.** Inbox, day 49: "Staff change: Stop trapping. Our blitzing has given up 2.0 points a game and won 1.3 back over 23 games, so I've changed it." The Instructions tab then says "1 setting moved from Blitz the Ball" with **Put back** (`shots/10-outposs-2.png`).
- **Game tags tie outcomes to your choices.** The Why tab for game 349 lists −2.2 "found the weak-side corner when the Hawks iced ball screens … take your coverage out of Ice", −4.2 ball pressure with a fix that names the control, and a luck line that separates shot-making from shot quality.
- **Familiarity by phase with a time to fluid** ("In possession · Learning 79% · Fluid in ~12 games", `shots/40-fam-2.png`), plus the staff card "Icing ball screens is new to us (45%) … about 19 games … Tactical drills".
- **Live grade movement plus an Undo/Done dock while editing** (`shots/31-hero-after-style.png`).
- **No degenerate slider.** `tactic-sweep` (160 games × 4 matchups): no single slider extreme beats a team's base by more than +0.75 per 100 (three 100: +0.75 ± 0.42). The "EXPLOIT" bundle loses (−0.96). The tag column roughly agrees with measured net.

## 3. Findings (most severe first)

### 1. The style "Fit" score doesn't predict what a style is worth. **P1**

**What the player sees.** "Pick a style" ranks the playbooks "Best fit for your roster first" on a 45–100 scale (`shots/20-style-1.png`). Choosing a style, and the staff's own pick, rest on this number.

**Evidence.** I ran `presets.ts`: every playbook against the staff's pick, all fully drilled, paired seeds, against every opponent.

- **Correlation with measured worth.** At 120 games (6 teams × 13 playbooks) it was **r = 0.26** (n = 78). The 400-game confirmation on ATL/CHI gave **r = 0.01** (n = 26). The 30-team run gave **r = −0.02** (n = 90).
- **Atlanta, 400 games.** The staff's Hub Big (Fit 100) is beaten by Pace & Space, **+2.5 ± 0.7** (Fit 80), and by Heliocentric, **+2.1 ± 0.7** (Fit 70).
- **Chicago, 400 games.** Heliocentric beats the staff's Five-Out (Fit 100) by +2.0 ± 0.8.
- **Lakers, 120 games.** Blitz the Ball shows Fit 100 and measures −1.1. Drop shows Fit 85 and measures −3.5.

**Cause.** The Fit is a hand-built roster heuristic (`src/core/ai/coachAI.ts:475-619`) that is never checked against the engine. `fitScale` (`coachAI.ts:816`) then min–max stretches it so the worst option always reads 45.

**Why it matters.** This is the first decision a coach makes. The staff's `autoTactics` uses the same rule, so "let the assistant manage" inherits the blind spot.

**Recommendation (M/L).** Fit the terms by regression against lab sweeps (30 teams × presets), or show measured worth from the `counterWorth` worker that already plays 240 paired games for counters. Add a CI check alongside `star-check` that fails below r ≈ 0.6.

### 2. Heliocentric is a near-dominant offense that nobody runs; the league is a Hub Big / Five-Out monoculture. **P1**

**Evidence (`dominant.txt`, 120 games per team).**

- **Heliocentric beats the staff's offense for 20 of 26 teams**, by a mean of **+1.2 per 100**, roughly 3 wins a season. Examples: IND +4.2, CHI +4.1, DAL +3.7, POR +3.1, LAC +3.0, BOS +2.9.
- For comparison, Pace & Space averages −0.03 and Ice & Contain +0.32.
- In my browser league on Dec 16, 15 of 30 teams ran Hub Big, 10 ran Five-Out Motion, and **none ran Heliocentric** (or Grit & Grind). Twelve teams sat in a 5-Out shape.

**Why it matters.** This is a degenerate best setup that nothing points to (Fit 70–86 for most teams). It also flattens league identity (cross-lens: sim-credibility).

**Recommendation (M).** Rebalance the engine's creator usage or the fit terms. Add a style-diversity and "no preset beats the staff's pick by more than 0.5 on average" check to `league-invariants`.

### 3. The shape's "per 100" figure and the staff's shape advice don't track the engine. **P1**

**Evidence.**

- The Shape sheet says its figure "is what the shape should be worth for this roster … in points per 100" (`src/ui/tactics/Board.tsx:175`). The staff card says "{Shape} fits this roster better: About X points per 100" (`src/core/ai/advisor.ts:858`).
- In `system-impact` (each shape against 4-out for every team), the shown fit correlated with measured worth at **r = 0.08** over 90 pairs. Where the fit claimed at least 0.4, its sign was right in **20 of 37** cases.
- Examples: HOU 5-Out fit −0.88, measured **+2.52 ± 1.14**. IND Double Post fit +0.41, measured **−2.49 ± 1.18**. UTA Double Post fit −0.44, measured **+3.08 ± 1.13**.

**Recommendation (M).** Measure it (paired lab, about 200 games, cached per roster change), or label it "the staff's estimate" until it's calibrated.

### 4. You cannot find out whether a change worked: no before/after, no measured verdict, and effects are smaller than a season's noise. **P1**

**What the player experiences.** I rebuilt the Hawks' system: Hub Big plus Ice & Contain, Horns, Okongwu as Playmaking Hub, Johnson as go-to, and the Protect-a-lead plan.

- The only verdict was the dock's grade arrows: "Shot creation C→D · Spacing A→B +6" (`shots/33-tactic-after-2.png`).
- After a week, "While you were away" showed 1-1 and trade mail, with nothing about the change (`shots/40-after-sim.png`). Today led with a Dec 7 story.
- Analysis → Season pools all 25 games, so the change is invisible there.

**Evidence.** Measured effects run 0.2–2.5 points per 100. With a margin SD of about 13, a team's net rating carries roughly ±2.9 of noise after 20 games and ±1.4 after a season. The only measured verdicts in the app are the Matchup counters, and nothing records when a tactic changed.

**Recommendation (M).**

1. On **Done**, have the staff measure the edit the way it already measures counters: about 240 paired games of your next opponents, old tactics against new, familiarity included. Show one line, e.g. "+0.8 ± 0.5 per 100 once drilled, −0.6 while you learn it."
2. Keep a "Since you changed it" ledger under Analysis → Season: the date, the netted tagged effects, and ORtg/DRtg before and after with ± bands.
3. Surface it in the digest.

This is not the removed Tactics Lab: the staff runs it automatically and returns one number, as the counters do today.

### 5. The system-report grades read as fact but are weak or wrong for several qualities. **P1**

**What the player sees.** The hero reads "A+ Perimeter D (3rd), A Three-point D (4th)" (`shots/10-tactic-1.png`). The same team shows **Opp eFG% 57.9%, 23rd** (`shots/10-season-3.png`).

**Evidence (`grades.ts`).** Pre-season grades for all 30 teams against the full season's ranks, three seeds:

| Grade             | Compared with | Spearman, three seeds     |
| ----------------- | ------------- | ------------------------- |
| Spacing           | eFG%          | **−0.40 / −0.27 / −0.31** |
| Spacing           | 3PA rate      | 0.08 / 0.28 / 0.16        |
| Rim pressure      | rim rate      | **0.10 / 0.04 / 0.08**    |
| Rim protection    | opponent eFG% | 0.19 / 0.44 / 0.27        |
| Ball security     | TOV%          | 0.69–0.76                 |
| Forcing turnovers | opponent TOV% | 0.64–0.77                 |
| Mean grade        | ORtg / DRtg   | 0.56–0.79                 |

So spacing is anti-correlated with its own stat and rim pressure is noise. The code calls the report "a projection … not a promise" (`src/core/analysis/system.ts:1-9`); the hero doesn't say so.

**Recommendation (M).** Recalibrate spacing, rim pressure and rim protection. Add a "This season" rank column beside each grade (the data is in `scoutData`). Label the hero "Projected".

### 6. The defensive style label in the hero lies after a staff change, and the picker invites undoing that change. **P2**

**Evidence.** The hero says "**Blitz the Ball on defense**" while the coverage is **Hedge** (`shots/10-tacticout-2.png`). `Hero.tsx:69` prints the preset name; the screen-reader text says "Custom (Blitz base)". The picker shows Blitz at Fit 100 with a red "Settings moved: tap to put them back" (`shots/20-style-2.png`). The sweep has blitz as the worst coverage on average (−1.54 ± 0.52).

**Recommendation (S).** Name what is played ("Blitz the Ball, hedging" or "Staff-tuned"). Show "Put back" in neutral ink with the staff's reason.

### 7. Situational plans are elaborate and inert. **P2**

**Evidence.** The plan editor has five trigger sliders, a mentality row, five nudge sliders and scheme/press chips (`shots/64-plan-edit-1..3.png`). Measured (10 teams × 2,900 games each, paired):

| Template       | Change in wins | Change in net per 100 |
| -------------- | -------------- | --------------------- |
| Protect a lead | +11            | −0.03                 |
| Chasing late   | +7             | +0.05                 |
| Second unit    | −4             | −0.00                 |
| End of quarter | −4             | +0.04                 |

That is at most 0.4% of games.

**Recommendation (M).** Give the templates teeth or fold Situations under "More rules". Show each template's measured worth.

### 8. Player "Knows the system" is cosmetic: one new arrival has exactly zero effect. **P2**

**Evidence.** `system-impact` reports "a new arrival in the five (knowledge 35) **+0.00 ± 0.00**". `execution()` (`src/core/sim/familiarity.ts:235-240`) weights knowledge at 25% of the five's average, so one newcomer gives 96.75, and the penalty is 0 at 95 and above.

**Recommendation (S).** Weight the least-knowing starter, or remove the figure from the sheets.

### 9. Out-of-possession roles are a full layer the staff barely uses, and they're worth about nothing. **P2**

**Evidence.** On the Hawks board, 4 of 5 starters and all 11 bench players are "Position Defender" (`shots/10-tacticout-2.png`). Okongwu is not the Rim Anchor. In `system-impact`, 16 of 30 teams get no specialist roles (`autoDefRoles` threshold, `coachAI.ts:750-765`), and the league average is **+0.08 per 100**. OKC's +2.83 ± 1.24 shows the roles can matter.

**Recommendation (M).** Make the roles bite and have the staff use them, or merge the defensive board into a matchups view.

### 10. Familiarity copy and colour overstate its cost against what a change is worth. **P2**

**Evidence.** Options are coloured red or amber by familiarity (Ice 45%). The staff card says "Stick with it … or go back to what we know." Measured costs:

- a never-drilled coverage: **−0.26 ± 0.11**
- a 2-3 zone: −0.33
- a new shape: −0.20
- a whole new system: −1.97

Moving from blitz to ice is worth about +1.6. My rebuild's game tags showed about 1 point a game of familiarity cost.

**Recommendation (S).** Show the cost in points beside each option, in the same unit as its worth.

### 11. Six different scales answer "how good is this choice". **P2**

| Scale                | Where           |
| -------------------- | --------------- |
| Fit 45–100, relative | Style picker    |
| Stars                | Roles           |
| Points per 100       | Shape           |
| Letter grades        | Report and hero |
| Good / Weak          | Partnerships    |
| %                    | Familiarity     |

The dock reports edits only as grade letters. **Recommendation (M).** Use points per 100 with ± everywhere a choice is made.

### 12. "Assistant adjusts in simmed games" flips off silently when you take over, and its worth is unclear. **P2**

**Evidence.** The toggle was on before my first edit and off after it (`shots/10-match-2.png` vs `shots/35-match-after-2.png`), because of `CrunchTimeCard.tsx:97`. The code comment claims that without it the other bench "kept cashing in" (`games.ts:366-370`). Measured (8 teams × 200 games): **−0.14 ± 0.30 per 100**, ranging from DET −1.75 to GSW +1.69.

**Recommendation (S).** If it helps, keep it on at takeover and say so; if not, cut it. Retune it so a low-rated coach's adjustments aren't harmful.

### 13. Turning "Let the assistant manage" back on silently erases a custom system. **P2**

**Evidence.** The toggle runs `autoTactics` over everything (`Hero.tsx:118-123`), with no confirm and no prompt to save to My playbooks. Only this visit's Undo saves you.

**Recommendation (S).** Confirm with "Save as a playbook first?".

### 14. Analysis → Season splits one lever into two rows and advises against its net. **P2**

**Evidence.** "+3.8 ball pressure forced turnovers" sits under Working, and "−2.8 handlers blew by … → Back off the Ball pressure" under Hurting (`shots/10-season-2.png`). Pressure nets +1.0, and the sweep has pressure 75 vs base at −0.22 (flat). `seasonLever` (`advisor.ts:644`) already nets won against lost.

**Recommendation (S).** Group by lever, show the net, and advise only when it is negative.

### 15. Advice uses stale or inconsistent control names. **P2**

**Evidence.**

- "(**Tactics → Players**)" appears in `gameReport.ts:696`; that section no longer exists.
- The same report also says "(Instructions)" and "Instructions > In possession > Play through".
- The situation editor speaks "Pace −25 · Push in transition −20", while Instructions uses named levels ("Patient", "Balanced").

This breaks DESIGN.md's "Tactics' own words" rule. **Recommendation (S).** Route all advice through `changes.ts` and make the control name a deep link.

### 16. Team → Tactics breaks the complexity budget. **P2**

**Evidence.** There are three rows of tabs on one screen: Team tabs, section chips, and a segmented control. The Tactic section runs about four phone screens: a six-part hero, a staff card, the board, Partnerships, **a 12-row bench where every row reads "… · Position Defender · 100%"**, and My playbooks.

**Recommendation (S).** Show only rotation players on the bench, with "+N more". Hide the fluid column when everyone is fluid. Fold the In/Out switch into the board itself.

### 17. Compare has no tactical dimension. **P2**

**Evidence.** `/compare?a=117&b=135` (`shots/51-compare-*.png`) shows ratings and percentiles only. It has no role stars, no partnerships with your five, and no fit in your system. Archetype names also clash with role names: "Traditional Big" isn't a role, and "Stretch Big" is both.

**Recommendation (M).** Add an "In your system" block.

### 18. Rotation has no evidence and clumsy reordering. **P2**

**Evidence.**

- No on/off or lineup net in the depth chart.
- Reordering is a one-step up arrow only (`Rotation.tsx:164`), so moving the 12th man into the five takes 7+ taps.
- Alexander-Walker's target is 36 while the stint plan gives him 37.
- The header reads "239 min, scaled to 240".

**Recommendation (S/M).** Add swap or drag, an on/off column, and reconcile target with plan.

### 19. "Five-Out Motion" (playbook) and "5-Out" (shape) are different things. **P3**

The Hawks ran Five-Out Motion in a 4-Out, 1-In shape, while the shape sheet rates 5-Out at −1.0 for them. **Recommendation (S).** Rename the playbook or have it set the shape.

### 20. Lineup lab leads with noise. **P3**

"+61.5 Net · 12 min" and "+50.0 · 13 min" sit in the main list, and the fade for rows under 100 possessions is subtle. **Recommendation (S).** Shrink toward zero, or hide units under about 50 possessions by default.

### 21. Small copy and colour issues. **P3**

- "Go-to player: **None**" actually means the best scorer on the floor; say "Auto".
- On a red-accent team, accent text reads as errors.
- An improving weakness turns green under "Weaknesses".
- Content ghosts through the translucent sticky header.
- "On net", "+/-" and "On-off" sit side by side and are easy to mix up.

## 4. Top 5 moves

1. **Make the pre-choice numbers measured (findings 1, 3, 5, 11).** Calibrate Fit, shape worth and grades, or compute them with the `counterWorth` worker, in points per 100 with ±, and gate them in CI. _Impact:_ the headline promise becomes true, and "let the assistant manage" stops inheriting a blind model.
2. **Add a staff verdict on Done plus a "Since you changed it" ledger (finding 4).** _Impact:_ closes the "did my idea work?" loop and gives the digest something about your coaching.
3. **Break the Heliocentric edge and the Hub Big / Five-Out monoculture (finding 2).** _Impact:_ removes a hidden ~3-win exploit and varies opponents.
4. **Give the inert levers teeth or demote them (findings 7, 8, 9, 12).** _Impact:_ every visible control earns its space, and the complexity budget is met by subtraction.
5. **Honesty and budget fixes (findings 6, 10, 13–16).** Name the real defense, put familiarity cost in points, confirm before the assistant overwrites, net the Season levers, fix the stale copy, and trim the tabs and bench. _Impact:_ each is an S-size fix that removes a contradiction experts would notice.

## 5. What I couldn't verify, and how I tested

**Played (390×844, own profile).**

- New league as the Atlanta Hawks; simmed to 9-14 (Dec 9).
- Visited every Tactics section and view, Rotation, Lineups (5-man and On-off), `/player/117` and Compare.
- Opened the Style, fit breakdown, Shape, role editor, Go-to, Tactic B, My playbooks and plan-editor sheets.
- Rebuilt the system, simmed a week to 10-15, and read the digest, Today, the game report (Debrief and Why), Familiarity and Season.
- No console errors.

**Headless runs.**

- `tactic-sweep 160` and `system-impact 160`
- `grades.ts`: three full seasons
- `presets.ts`: 6 teams at 120 games, plus ATL/CHI at 400
- `dominant.ts`: 30 teams
- `adjust.ts`: 8 teams × 200 games
- `situations.ts`: 10 teams × 4 templates × 300 games

All lab results are fully drilled, against the league's average opponent, with paired seeds. 120-game cells carry about ±1.3 per 100, so I lean on pooled or 400-game figures.

**Not verified.**

- The live touchline and playoff rotations.
- Saved playbooks surviving a job change, and multi-season familiarity.
- The worth of sets, the go-to player and the after-timeout play (`tactic-impact sets` not run).
- Whether role stars predict role performance.
- The Matchup counters (game-day lens). They are the template for move 1.
- Tablet layout.
