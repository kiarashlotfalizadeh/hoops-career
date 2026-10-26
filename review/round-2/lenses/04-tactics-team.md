## Tactics-team lens: second-round review

All evidence is under `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/`. Screenshots are in `shots/`, headless outputs are the `*.txt` files, and the scripts that made them sit beside them. The repo was not touched.

### 1. Verdict

The Team tab is now a real feedback loop. You change something, tap Done, and in about 2 seconds the staff says "This change costs 0.7 a game over your next five (measured)". Fifteen games later a ledger entry and a mail give the verdict, with a tap to put the change back. The pre-choice numbers are mostly calibrated:

- **Defensive style read:** r = 0.89 against measured worth.
- **Shape read:** r = 0.63 (it was 0.08 in the first round).
- **Offensive style read:** r = 0.53, below the 0.6 target the app's own check script sets.

Three things undercut it:

- **The assistant overrides its own read.** "Let the assistant manage" knowingly runs a system worse than its own read says is best, because of a hidden coach-philosophy lean and a hidden ban on the zone.
- **The 2-3 Zone is the new dominant setup.** It is best for 22 of 30 teams, replacing Heliocentric from the first round.
- **The verdicts almost always say "Even".** They resolve only to about ±0.5 a game, and most choices are worth less than that. Some changes never reach the ledger at all.

**Score: 7/10** (up from 6). The honesty machinery is genuinely good now. The assistant and the balance aren't.

### 2. What's genuinely great (protect these)

- **"Since you changed it."** It gives a measured line on Done, a check on the games actually played since, mail, and a one-tap put-back (`shots/13-measured-Ice-.png`, `shots/28-ledger-checked.png`). Measuring nothing reads exactly 0 ± 0, so the pairing is deterministic (`m2.txt`).
- **The style picker reads in points a game, and every read explains itself.** The Heliocentric sheet shows "+0.1 for a typical roster, −0.2 lead creator (best you have: C. McCollum) = −0.1 … What would raise it: +0.1 a game for 5 rating points" (`shots/25-helio-fit.png`).
- **The shape sheet is honest now.** At 522 games per option, the sign against 4-out is right in 32 of 39 cases (`style-shape-k18.txt`).
- **Heliocentric is no longer dominant.** It is best for 6 of 30 teams, worth +0.12 a game against a team's average option.
- **Edit dock and hand-over.** The dock shows grade moves with Undo and Done. The hand-over now asks first and offers "Keep mine as a playbook".
- **No degenerate slider.** In `tactic-sweep` at 200 games × 4 matchups, the EXPLOIT bundle loses 2.61 per 100. Every extreme tested is at most +0.74 over the team's base, and those are within about 1.7 standard errors.

### 3. Findings

**1. "Let the assistant manage" knowingly picks worse than its own read, and never says why. P1**

- **What the player sees.** In preseason, with the assistant on, the Change sheet lists the Hawks' Hub Big ("Yours") 4th. Five-Out Motion shows +0.8 and Pace & Space +0.4. On defence, Hedge is 6th of 7, with 2-3 Zone at +0.7 and Ice at +0.6 (`shots/04-change-sheet.png`).
- **Cause 1: a hidden philosophy lean.** The staff adds 8 fit points (0.8 a game) to the coach's own playbook (`coachAI.ts:698`). The README says 3. The user's coach inherits the old coach's random philosophy (here hub/hedge, `teamFactory.ts:171`), and no screen ever mentions it.
- **Cause 2: the zone is banned for the staff.** `NOT_A_BASE` (`coachAI.ts:883`) keeps the staff off the zone unless it is the coach's own style.
- **Cause 3: stickiness.** In season the staff only switches for a gain of 0.8 or more (`STICK`, line 908), so the hint "He refits the playbook…" rarely happens.
- **Measured across the league** (style-check, 522 games per option on offence, 348 on defence):
  - Following the sheet's top read beats the staff's pick by **+0.29 a game on offence and +0.52 on defence**.
  - The staff's pick is the measured best for only 4 of 30 offences and 6 of 30 defences.
  - It sits 0.60 and 0.87 a game under the best.
- **Measured for my team.** Over the Hawks' next 8 games, handing back to the staff costs **−0.76 ± 0.23 a game** (−0.66 once drilled) (`m2.txt`).
- **The hand-over sheet** names neither the staff's pick nor that cost.
- **Fix (S/M).** Drop the lean for the user's staff, or show it ("Your coach's own: Hub Big, +0.8"). Have the assistant pick by the read. Have the hand-over sheet say "Staff would run Hub Big · Hedge: −0.8 a game against yours (staff's read)".

**2. The 2-3 Zone is the dominant defence, and the code knows it. P1**

- At 348 games per option, the zone is best for **22 of 30 teams**, worth **+1.27 a game** against a team's average defence. Ice comes next at +0.84 (`style-def-k12.txt`).
- For Atlanta, fully drilled, the zone is +1.1 and the staff's Hedge is +0.2.
- In `tactic-sweep`, zone23 is +0.73 ± 0.46 per 100 against each team's own base.
- The comment above `NOT_A_BASE` (`coachAI.ts:874-883`) says the engine's zone "gives up less than an NBA zone", so the AI is kept off it while the user is free to use it. This is the first round's Heliocentric problem moved to defence.
- **Fix (M).** Retune the engine's zone (threes conceded, the glass), then remove `NOT_A_BASE`. Add a CI gate: no option best for more than about 40% of teams.

**3. The verdict loop rarely says anything. P1**

- **Precision.** Measured changes resolve to about ±0.5–0.66 a game (as made: se 0.60 and 0.66; at the check: 0.49 and 0.53).
- **Typical effect sizes are smaller than that:**
  - styles: ±0.5
  - shapes: ±0.2
  - a role change: 0.2 (Daniels Slasher vs Secondary Scorer: −0.21 ± 0.2)
  - sets: about 0
- **Result.** Both my changes ended "Even · Too close to say, on the games played since · 15 games".
- **What gets hidden.** The ledger drops the estimate. The −0.39 ± 0.49 reading becomes just "Even", and the made-time line disappears.
- **Fix (M).**
  - Show the estimate with a band ("−0.4, likely −1.4 to +0.6").
  - Play more games in the background check (480 → about 1,500 roughly halves the error).
  - Add a running "your changes this season: +x ± y".

**4. Edits silently go missing from the ledger. P1**

- **How it happens.** A change is only recorded on Done or when the Team screens unmount (`editWatch.ts:105, 209`). Close or reload the app while on Team and the next visit snapshots the edited team as the new baseline.
- **What I lost this way.** Hub → Five-Out, Hedge → Zone, and a Protect-a-lead plan were never measured. The ledger still has 2 entries after navigating away (`s20.mjs` output).
- On a phone, swiping the app away is the normal exit.
- **Fix (S).** Persist the visit-start snapshot in the league, or settle on `pagehide`/`visibilitychange`.

**5. Same-day edits merge into one entry, so you can't tell ideas apart. P2**

- `tacticEdits.ts:220` folds every edit made before the next game into the previous entry.
- **What happened.** My Daniels → Slasher change was absorbed into "Defensive identity: 2-3 Zone → Ice & Contain · … 6 more changes". Its reading moved from −0.7 to −0.1, and the ledger title never mentions the role change.
- **Fix (S/M).** Merge only edits to the same control, or offer "measure separately".

**6. Familiarity contradicts itself and still isn't in points. P2**

- **Two numbers for the same thing.** The picker says "Ice & Contain · 83% familiar" (an average over the defensive end). The hero card says "Icing ball screens is new to us (45%)".
- **Costs are in the wrong unit.** Instructions shows "−18 actions & shots familiarity", not points.
- **Measured costs** (`sysimpact.txt`, per 100 possessions):
  - new coverage: −0.31
  - new zone: −0.58
  - new shape: −0.13
  - whole new system: −1.83
- The card's "Stick with it… or go back to what we know" overweights a cost of about 0.3.
- **Fix (S).** Show the weakest part's % in the picker, and show the drilling cost in points a game. `drilledAs` in `editPlan` already computes the measured gap.

**7. Inert levers still take surface space. P2**

- **Protect-a-lead plan:** worth −0.04 ± 0.04 a game when measured.
- **Defensive roles:** league average +0.10 per 100. Ten of 30 staffs assign none, and the Hawks' bench is 11 identical "· Position Defender" rows.
- **A new arrival in the five:** +0.00 ± 0.00. First-round finding 8 is unchanged.
- **Sets marked "won't run":** they can still be added (I added Spain and Horns), and removing them measures −0.05 ± 0.26 a game.
- **Fix (M).** Give these levers real effect or fold them one tap down. Block or warn on sets that won't run.

**8. The "Assistant adjusts in simmed games" copy quotes an engine number it doesn't hold to. P2**

- `CrunchTimeCard.tsx:102` says "Measured over 17,280 games… about +0.5 points a game". That breaks DESIGN.md's rule against quoting engine effect sizes in copy.
- **My measurements:**
  - the user-assistant variant: −0.07 ± 0.20 per 100 (8 teams × 400 games, `adjust2.txt`)
  - the AI variant: −0.31 ± 0.24 per 100 (8 teams × 300 games, `adjust.txt`)
  - for the Hawks: +0.17 ± 0.18 a game
- **Fix (S).** Drop the number, or measure it at runtime.

**9. The offensive read is the weak link. P2**

- At 522 games per option, r = 0.53 overall (`style-off-k18.txt`). At 174 games on a fresh seed it is 0.32 (`style-off-4242.txt`).
- Within each option, the read doesn't track worth for Balanced (−0.04), Pace & Space (0.02) or Grit & Grind (0.05). Their reads are flat constants.
- Pace & Space is measured best for 14 of 30 teams.
- **Fix (M).** Refit those terms.

**10. Report grades are better, but Spacing still doesn't track its stats. P2**

- Preseason grade rank against season rank (Spearman), three seasons (`grades-*.txt`, `grades2-*.txt`):

| Grade             | Compared with | Spearman                   |
| ----------------- | ------------- | -------------------------- |
| Ball security     | TOV%          | 0.63–0.70                  |
| Offensive glass   | ORB%          | 0.62–0.83                  |
| Defensive glass   | opp ORB%      | 0.61–0.72                  |
| Transition        | pace          | 0.71–0.77                  |
| Perimeter D       | opp 3P%       | 0.49–0.73                  |
| Rim pressure      | rim rate      | 0.30–0.42 (was about 0.08) |
| **Spacing**       | **eFG%**      | **−0.29 / −0.15 / +0.05**  |
| **Spacing**       | **3PA rate**  | **0.17–0.32**              |
| Ball movement     | ORtg          | 0.13–0.32                  |
| Forcing turnovers | opp TOV%      | 0.22–0.32                  |
| Forcing turnovers | steal rate    | 0.54–0.74                  |

- Forcing turnovers tracks steal rate, not the stat its name suggests.
- The hero still shows grades as fact, with no actual-rank column.
- **Fix (M).** Recalibrate Spacing and Ball movement. Add a "this season" rank, or label the grades "projected".

**11. The complexity budget is still broken on Tactics. P2**

- One screen carries the Team tabs, the section chips, Analysis's segmented control and the board's In/Out switch.
- The Tactic section is about 2,600px: a hero with six parts, a staff card, the board, Partnerships, an 11-row bench and My playbooks (`shots/t-tac-tactic-*.png`).
- **Fix (S).** List bench rotation players only, with "+N more". Fold In/Out into the board.

**12. The Season card splits one lever and contradicts itself. P2 (still open)**

- It shows "+1.1 hedges stalled ball handlers" and "−1.6 roll men behind the hedge → use Drop" as separate rows, right beside "−1.3 attacked drop coverage with pull-ups".
- The drop came from the assistant's in-game switches, and the card doesn't say so.
- **Fix (S).** Net each lever, and name who made the change.

**13. "Five-Out Motion" plays in a 4-Out, 1-In shape. P3 (still open)**

- The description says "with five shooters", and it is the top read a newcomer will pick.
- The 5-Out shape itself reads −0.2 for the Hawks and measures −0.68 ± 0.16.

**14. Mentality copy misstates the trade-off. P3**

- The copy and README frame "aggressive" as a variance tool with a cost.
- League-wide (7 teams × 1,200 games, `mentality.txt`): aggressive +0.16 ± 0.14, very aggressive +0.07 ± 0.15. The cautious settings are the ones that cost (−0.26, −0.33).
- For the Hawks, very aggressive measured +0.84 ± 0.22 a game.

**15. Small leftovers. P3**

- `gameReport.ts:696` still says "(Tactics → Players)". Path separators are mixed: "Tactics > Match" vs "Team → Tactics → Analysis".
- Rotation still reorders with an up arrow only and says "239 min, scaled to 240".
- Lineups still lead with noise ("−60.0 Net" on 13 minutes).
- Compare still has no "in your system" block.
- Go-to "None" still means "auto".
- The hero still prints the preset name after the settings move (`Hero.tsx:63`, code only).
- The sticky header still ghosts content behind it.

### 4. Since the first review

| First-round finding                  | Status                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Fit doesn't predict worth (r ≈ 0) | **Mostly fixed.** Now in points a game; defence r 0.89, offence 0.53, still under the 0.6 target (#9).                                           |
| 2. Heliocentric dominant             | **Fixed** (best for 6 of 30). **New dominant setup:** the 2-3 Zone (#2).                                                                         |
| 3. Shape figure untrue               | **Fixed.** r 0.63, sign right 32 of 39.                                                                                                          |
| 4. No way to know if a change worked | **Fixed in design.** Ledger, mail and put-back exist. **Open:** low resolution (#3), lost edits (#4), merged edits (#5).                         |
| 5. Grades weak                       | **Partly fixed.** Rim pressure improved; Spacing still doesn't track; forcing turnovers compared with opp TOV% fell from 0.64–0.77 to 0.22–0.32. |
| 6. Hero label after a staff change   | **Open** (code-verified only).                                                                                                                   |
| 7. Situations inert                  | **Open** (−0.04 ± 0.04).                                                                                                                         |
| 8. Player system knowledge cosmetic  | **Open** (+0.00 ± 0.00).                                                                                                                         |
| 9. Defensive roles worth about 0     | **Open** (+0.10; 10 of 30 teams now get none, was 16).                                                                                           |
| 10. Familiarity cost not in points   | **Partly fixed.** Measured edits include it; the picker still uses %, and contradicts the hero card (#6).                                        |
| 11. Six scales                       | **Partly fixed.** Styles, shapes and edits share points a game; stars, grades, sets' fit and familiarity remain.                                 |
| 12. Assistant adjusts unclear        | **Regressed in copy.** Now quotes "+0.5" against the copy rule, and I couldn't reproduce it (#8).                                                |
| 13. Hand-over erases a system        | **Fixed** (confirm sheet with save-as-playbook).                                                                                                 |
| 14. Season splits levers             | **Open** (#12).                                                                                                                                  |
| 15. Stale control names              | **Open** (`gameReport.ts:696`).                                                                                                                  |
| 16. Complexity budget                | **Open** (#11).                                                                                                                                  |
| 17–21                                | **Open** (#13, #15).                                                                                                                             |

New since the first round: the hidden philosophy lean and zone ban (#1, #2), lost and merged ledger edits (#4, #5), and the mentality free lunch on the aggressive side (#14).

### 5. Top 5 moves

1. **Make the assistant honest (#1).** Drop or expose the lean, have it pick by the read, and show its pick and cost in the hand-over sheet. This is worth about +0.8 a game, roughly 2 wins, for anyone who leaves it on, and it ends the "the staff's best isn't the staff's pick" contradiction.
2. **Retune the engine's zone and remove `NOT_A_BASE`, with a CI gate on style diversity (#2).** This removes a roughly +1.3-a-game setup that only the user can use.
3. **Make verdicts land (#3, #4, #5).** Persist the edit snapshot, measure edits separately, play bigger background checks, and show the estimate with its band. "Did my idea work?" then gets an answer more often than "Even".
4. **Subtract or sharpen the inert levers, and show familiarity cost in points from the weakest part (#6, #7).** Every control on the surface should then earn its place.
5. **Polish honesty and the budget (#8, #10–15).** Remove the "+0.5" copy, recalibrate Spacing, cut a tab row and trim the bench, net the Season levers, and fix the "Five-Out" naming. Each is a small fix that removes a contradiction an expert would notice.

### 6. What I couldn't verify, and how I tested

**Played in the browser** (390×844, own profile):

- New real league as the Hawks; simmed from preseason to Dec 22 (12-16).
- Visited every Tactics section and Analysis view, Rotation, Lineups, Roster, Growth, a player page and Compare.
- Opened the style picker and fit sheets, the shape sheet, the role sheet, the set package, the hand-over sheet and Protect-a-lead.
- Made 3 measured edits: Zone → Ice, Daniels → Slasher, a set package.
- Read the checks and the staff mail. No console errors.

**Headless runs:**

- `style-check`: offence, defence and shapes at 6 games per opponent (seed 4242), plus a larger second pass (offence 18, defence 12, shapes 18; seed 777).
- `system-impact`: familiarity, roles and mentality at 300 games; mentality again at 1,200.
- `tactic-sweep` at 200.
- `grades*` over three full seasons.
- `adjust`/`adjust2`: 8 teams.
- `m1.mts`/`m2.mts`: the app's own `measureChanges` on my exported saves (`league-day21.json`, `league-day63.json`).

**Not verified:**

- Live-game tactics, timeouts and the touchline (game-day lens).
- Counters and game plans.
- Playoffs and multi-season familiarity.
- Switching between Tactic B and C.
- Playbooks carried over after a job change.
- Partnership worth (I didn't re-run `link-impact`).
- Situation templates other than Protect-a-lead.
- Tablet layout.

Key files:

- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/style-def-k12.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/style-off-k18.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/m2.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/shots/04-change-sheet.png`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/tactics-team/shots/28-ledger-checked.png`
