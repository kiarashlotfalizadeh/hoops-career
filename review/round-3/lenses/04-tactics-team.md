## Tactics-team lens: third-round review

All evidence is in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/`. Screenshots are in `shots/`, headless outputs are the `*.txt` files, and the scripts sit beside them. I didn't touch the repo. The machine was shared and heavily loaded (load average 35–60 on 14 cores), so timings are slow.

### 1. Verdict

The Team tab is now a real coaching instrument. You change the shape, a role and the coverage, tap Done, and about 5 seconds later the staff says "This change: even over your next five, too close to say". Eleven games later the ledger and the mail say "It worked, +0.6 a game", measured on the games actually played. The style picker reads in points a game, explains each read, and says when the staff is holding its playbook. No playbook or shape dominates any more, and the user's staff now picks by its own read.

Three things hold it back from FM-grade trust:

- **Two staff voices disagree on the same screen.** The "What your tactics did" evidence, the "X is costing you" card and the staff's automatic in-season changes all come from a one-sided tally of engine tags. In paired games that tally points the opposite way.
- **The role stars are mis-scaled.** Karl-Anthony Towns gets 2★ at every role, including his natural one, and 1★ as a defender. A third of the league is told it "suits" hiding.
- **The verdict loop still leaks.** Edits made before you close the app are never measured, and same-day edits merge into one bundle.

**Score: 7/10**, the same as round 2. Real fixes landed (the assistant, the zone, honest copy), but the new contradiction undercuts the pitch that the game tells you why, honestly.

### 2. What's genuinely great (protect these)

- **The edit loop.**
  - The dock shows grade moves with Undo and Done (`shots/12-after-v1.png`: "Spacing B+→A, Rim pressure D→F").
  - The measurement after Done took 4.7 s.
  - The check came 11 games later: "Shape … · Pick-and-roll coverage: Drop → Switch · Towns (role) … It worked +0.6, 11 games". The mail said: "each one replayed with it and without it… I'd keep it" (`shots/ledger2.txt`, `shots/inbox.txt`).
- **The style picker is honest and explains itself.**
  - It reads "Staff's read, a game", and the familiarity it shows is the weakest part ("Coverage 45%").
  - It says when the staff is holding its playbook: "The staff keeps Switch Everything… change once another reads +0.8 a game better (Drop & Protect: 0.0)" (`shots/sh-style.txt`).
  - Each option's sheet carries a measured learning cost: "Learning it costs too little to tell (measured)" (`shots/44-zone-sheet.png`).
- **No dominant setup** (style-check on a fresh seed, 5150, at 174 games an option):
  - Best-for counts: offense at most 10 of 30 (Five-Out), defense at most 7 of 30 (Drop), shapes at most 10 of 30 (Double Post).
  - The 2-3 zone is best for 5 of 30 (it was 22).
  - In my 4-matchup tactic sweep, the EXPLOIT bundle loses 1.65 ± 0.46 per 100.
- **The hand-over sheet names the staff's pick:** "The staff would keep Heliocentric · Switch Everything…", with "Keep mine as a playbook, then hand over".
- **Contextual coaching text** sits next to the controls ("Towns: shot blocking 70 · speed 62 · Weak rim deterrent" under the coverage), and the shape sheet labels its figure as the staff's read, once drilled.
- **The "Assistant adjusts in simmed games" copy is honest now:** "About even by the staff's measurements".

### 3. Findings

**1. The season evidence, the "is costing you" card and the managing staff's changes run on an unpaired tag tally that disagrees with paired games. P1**

- **What the player sees.** One Analysis screen holds two staff verdicts on the same change:
  - The top card says "Switching is costing you. It gives up 1.2 points a game and wins 0.5 back (46 games). [Go to Drop]".
  - Just below, the ledger says the change that put Switch back "worked, +0.6 · 11 games" (`shots/20-ledger2-0.png`).
  - The Season view below lists drop costing −2.3 (pull-ups) against +0.9 back (`shots/tac-season2-1.png`). By its own tally, Drop is worse than the Switch the card tells you to leave.
- **The staff acted on this tally while managing.** The inbox on Nov 10 reads: "Staff change: Go to Drop. Our switching has given up 1.2 points a game and won 0.6 back over 10 games, so I've changed it."
- **The cause.**
  - `advisor.ts:607-660` (`seasonLevers`/`seasonLever`) and `staffTactics` → `seasonAdjust` sum the engine's cost tags against its gain tags (`gameReport.ts:432 LEVERS`).
  - "46 games" is every game this season, including the ones played in the other coverage.
  - That is not a counterfactual, and the numbers rule says one is required.
- **Measured** (`nyk.mts`: Drop against Switch coverage, 6 teams × 406 paired games each, every opponent):
  - Paired games favour Drop in **6 of 6** teams, by −0.8 to −2.9 a game (NYK −2.88 ± 0.79).
  - The tag tally favours **Switch** by +1.6 to +2.6 in all six. The sign is wrong every time (`nyk.txt`).
  - The sweep shows the same pattern (`sweep.txt`): Drop is +0.54/100 by the games but −1.5 by the tags; pressure 100 is −0.07 against −2.5; help 100 is −0.83 against −2.7.
  - Every coverage tallies as a net loss (drop −3.3 to −4.1 a game, switch −1.2 to −2.0), so some coverage "is costing you" more or less forever.
- **Fix (M).**
  - Drive the card and `seasonAdjust` from paired measurement. `measureChanges`/`counterWorth` already exist; measure the counter on the next games before offering it.
  - Relabel the Season block as "the engine's tally of each effect, not what changing it would win", and net each lever on one row.
  - Never let the tally change a managed team's tactics.

**2. Role stars are mis-scaled and tell a third of the league to hide. P1**

- **Towns** (85 OVR, 3× All-NBA, a 7-footer) shows 2★ at every offensive role, including his "Natural" Rim Runner and Stretch Big. He shows 3★ only as Post Hub and Playmaking Hub, 1★ as Position Defender and 2★ as Rim Anchor (`shots/sh-towns-0.png`, `-1.png`, `shots/tac-tacticout-1.png`).
- **His player page disagrees:** "Rim protection 79th" and "Rebounding 97th" (`shots/player-towns-1.png`).
- **The cause.** `fitStars = (fit−30)/10` (`system.ts:415`), and fits cluster at 45–65. Over the top 150 players by OVR (`fits.mts`):
  - only 14 reach 5★ at their best offensive role;
  - 69 are at 2★ or less at their best defensive role;
  - Mikal Bridges peaks at 3★, OG Anunoby at 2★ on offense.
- **The "hide" fit** (`clamp(110 − general)`) makes a poor defender "suit" Hidden. `miscast` counts it, so 148 of 470 rostered players are flagged "Better fit" for Hidden (`bench.mts`). That includes Towns, Curry and Jaylen Brown, plus four Knicks bench players under "Better fit" (`aria.mjs` output).
- **Why it matters.** The stars are the board's main signal, and they currently read as "your whole team is miscast".
- **Fix (S/M).**
  - Rank each role's fit against the league's rotation players (percentile stars), or rescale.
  - Leave Hidden out of `miscast`, or show it as "hide him" rather than as a fit.

**3. Edits made before the app closes are never measured. P1 (still open from round 2)**

- I set Tempo to Patient and reloaded. The tactics kept Pace 25, but no ledger entry was ever recorded, even after leaving Team (`s12.mjs` output).
- An accidental playbook pick in the style picker was lost the same way.
- `App.tsx:110` flushes the save on `visibilitychange`, but `editWatch`'s visit snapshot lives only in memory, and the next visit starts from the edited team.
- **Fix (S).** Persist the visit-start snapshot in the league, or settle edits on hide.

**4. Same-day edits merge into one bundle, so a verdict can't be attributed. P2 (open)**

- I made a 5-Out shape and Towns → Stretch Big visit (−0.4 as made), then a separate visit to put Switch back.
- The second visit folded into the first (`tacticEdits.ts:220`). The reading moved silently from −0.4 to 0.0, and "It worked +0.6" then credited all three changes at once (`ledger1.txt`, `ledger2.txt`).
- **Fix (S/M).** Merge only edits to the same control, or offer "measure separately".

**5. Verdicts still resolve to about ±0.5 and hide the estimate. P2 (open)**

- Readings came with se 0.41–0.64 as made and 0.40–0.50 at the check (`CHECK_GAMES` is still 480).
- Up-tempo read −0.7 as made and −0.1 at the check; the ledger shows only "Even".
- **Fix (M).** Show the estimate with its band, run larger background checks, and keep a running season total.

**6. Inert levers still take surface space. P2** (`levers.mts`: 6 teams × 232 paired games a config)

| Lever                                 | Worth, per 100            |
| ------------------------------------- | ------------------------- |
| Protect-a-lead plan                   | +0.01 ± 0.06              |
| Go-to player                          | +0.01 ± 0.04              |
| The staff's defensive roles (vs none) | about +0.2 ± 0.2          |
| All four situation templates          | +0.45 ± 0.30              |
| Top-4 set package                     | +0.22 ± 0.41 (unresolved) |

- AI staffs assign defensive roles to only 0–2 players, so the bench reads ten identical "· Position Defender" rows.
- A new arrival's system knowledge (35%) is blended at a quarter weight (`familiarity.ts:236`). One arrival leaves the five Fluid, so it is inert.
- The set sheet shows only "Fit 66" with no worth (`shots/30-sets.png`).
- **Fix (M).**
  - Fold the go-to player, single situation templates and defensive roles one tap further down, or give them real effect.
  - Show set worth from `counterWorth`.

**7. The mentality copy states a cost the games don't show. P2 (open)**

- Aggressive (+1) measured +0.31 ± 0.37 per 100 over 6 teams (NYK +1.54 ± 0.94, LAL +1.22).
- The README says moving off balanced "costs about 0.3 to 1 point per 100". The sheet shows only help text, with no read.
- **Fix (S).** Measure it on the next games like the other choices, or drop the cost claim.

**8. The offensive and shape reads are weak on a held-out seed, and the README quotes in-sample numbers. P2**

- **Correlation with measured worth (seed 5150, 174 games):**
  - offense r 0.38 (README: 0.49);
  - shapes r 0.28 (README: 0.52);
  - defense r 0.57 excluding Full-Court Chaos (0.82 with it).
- **Against what the games can resolve** (noise ceilings): offense 0.51, defense 0.56, shapes 0.44. Defense is at its ceiling; offense and shapes are not.
- **When a read says ≥0.3,** its sign is right 27/30 on offense, 28/33 on defense, but only 7/10 for shapes. Shape signs at ≥0.2 are right 19 of 31.
- **Within-option reads** are poor for Balanced (−0.30), Grit & Grind (0.13) and four-out (−0.04).
- **What the assistant's pick is worth:** on average +0.21 a game (offense) and +0.17 (defense) over the team's average option. That's about the same as AI staffs with their coach lean (+0.18, +0.19), and probably half the edge the games can resolve (`pick.py` output).
- **Fix (M).** Refit the offense and shape terms on several seeds, and quote held-out r in the README.

**9. The system report's grades don't track the stats they name, mostly on defense. P2 (partly fixed)**

- **Preseason grade rank against season rank** (Spearman, two full seasons, `grades-11.txt` / `grades-23.txt`):

| Grade                | Compared with | Spearman      |
| -------------------- | ------------- | ------------- |
| Spacing              | eFG%          | −0.10 / −0.09 |
| Three-point D        | opp eFG%      | 0.04 / −0.19  |
| Rim protection       | DRtg          | 0.21 / 0.14   |
| Mean defensive grade | DRtg          | 0.40 / 0.41   |
| Mean offensive grade | ORtg          | 0.67 / 0.50   |

- **Better than round 2:** Rim pressure vs rim rate 0.61 / 0.35, Spacing vs 3PA rate 0.50 / 0.39, Forcing turnovers vs opp TOV% 0.37 / 0.44.
- **In my season:**
  - Forcing turnovers B+ (8th) against Opp TOV% 22nd;
  - Ball security B (12th) against TOV% 2nd;
  - Second chances C+ (16th) against ORB% 23rd.
- The hero shows the grades as fact. Only the "?" says they are a projection.
- **Fix (M).** Add a "this season: Nth" rank beside each grade, and recalibrate Spacing and the defensive grades.

**10. The complexity budget is still broken. P2 (open)**

- **Three rows of navigation on every section:** the Team tabs, the section chips, then In/Out, the phase switch, or Report/Familiarity/Season.
- **The Tactic section is 2,401 px.** It holds a hero with 7 parts, the guide strip, a staff card, the board, Partnerships, a 10-row bench (4 of them injured) and My playbooks.
- **Instructions → In possession with Fine-tune open has 79 buttons** (`s14.mjs` output).
- **Fix (S).**
  - Show only rotation players on the bench, with "+N more".
  - Fold In/Out into the board's own header.
  - Move the strengths/weaknesses block onto Analysis.

**11. The defensive story is told three different ways. P2**

- The hero says "Custom (Switch base)", meaning the staff had put in Drop.
- The picker says "The staff keeps Switch Everything while the team knows it".
- Instructions says "1 setting moved from Switch Everything · Put back" (`shots/tac-instr-out-0.png`).
- No screen says the staff made the change, or why.
- **Fix (S).** Name the change and its author ("Staff moved coverage to Drop on Nov 10 · why · undo").

**12. Familiarity costs are only partly in points. P3**

- Scheme and coverage chips show only a percentage ("2-3 Zone 35%" in red), with no learning cost (`s11.mjs`).
- Sliders show "Drilled at Balanced" and a measured cost only above a threshold. The picker's sheet does measure it.
- **Fix (S).** Put the picker's measured line under the chosen chip.

**13. The 5-Out copy contradicts the report. P3**

- The shape sheet promises "+ More room for drives, cuts and rolls".
- The report docks Rim pressure for 5-Out (`system.ts:276`, −4, "Shape: 5-Out"), and choosing it moved Rim pressure D → F.
- **Fix (S).** Say "more room inside; you'll take more threes and fewer shots at the rim".

**14. The style picker commits on a tap of the name. P3**

- Tapping "Five-Out Motion" switched my offense immediately (`s15.mjs` output). The learning cost lives only in the ⓘ sheet.
- The README says tapping a playbook "opens its sheet".
- **Fix (S).** Open the sheet on a name tap, with Use inside it, or show the learning cost on the row.

**15. The hand-over sheet doesn't say what handing over is worth. P3**

- It names the staff's pick, but not "−x a game against yours (staff's read)".
- **Fix (S).** Add the read.

**16. The gate doesn't cover scheme chips. P3**

- The style gate measures only playbooks and shapes, so the 3-2 zone and the junk defenses go unchecked.
- In my 4-matchup sweep, zone32 read +2.15 ± 0.46 per 100 (tags −2.4).
- Against every opponent it is −0.26 per 100 on average, positive for 3 of 8 teams (`zone32.txt`). It doesn't dominate today, but nothing would catch it if it did.
- **Fix (S).** Add the scheme chips to style-gate.

**17. Small leftovers. P3 (open)**

- "Five-Out Motion" still says "with five shooters" but doesn't set the 5-Out shape.
- `gameReport.ts:693` still says "(Tactics → Players)". Path separators are mixed: "Tactics > Match" vs "→".
- Go-to "None" means auto.
- The Rotation screen reorders with up arrows only.
- Compare has no roles or system block.
- The Season view still splits a lever: drop's +0.9 sits under Working and its −2.3 under Hurting.

### 4. Since round 2

| Round-2 finding                     | Status now                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Assistant overrides its own read | **Fixed.** The user's staff picks by its read (Heliocentric is "Yours" and top for NYK). Stickiness is explained in the picker, and the hand-over names the pick. Its cost isn't shown (#15). |
| 2. 2-3 Zone dominant                | **Fixed.** Best for 5 of 30. The CI gate exists; the scheme chips sit outside it (#16).                                                                                                       |
| 3. Verdicts rarely resolve          | **Still open** (#5).                                                                                                                                                                          |
| 4. Edits lost on close              | **Still open**, reproduced (#3).                                                                                                                                                              |
| 5. Same-day merges                  | **Still open**, reproduced (#4).                                                                                                                                                              |
| 6. Familiarity not in points        | **Partly fixed.** The picker shows the weakest part's % and a measured learning cost; the chips are still % only (#12).                                                                       |
| 7. Inert levers                     | **Still open** (#6).                                                                                                                                                                          |
| 8. "+0.5" copy                      | **Fixed** ("About even by the staff's measurements").                                                                                                                                         |
| 9. Offensive read weak              | **Still open.** Held-out r 0.38 (#8).                                                                                                                                                         |
| 10. Grades vs stats                 | **Partly fixed.** Rim pressure, Spacing vs 3PA rate and Forcing turnovers improved; Spacing vs eFG% and the defensive grades did not (#9).                                                    |
| 11. Complexity budget               | **Still open** (#10).                                                                                                                                                                         |
| 12. Season splits levers            | **Still open, and worse.** The same tally now drives a staff card and the managing staff's changes, and disagrees in sign with paired games (#1).                                             |
| 13. Five-Out naming                 | **Still open.**                                                                                                                                                                               |
| 14. Mentality copy                  | **Still open** (#7).                                                                                                                                                                          |
| 15. Leftovers                       | **Mostly open** (#17). Lineups now fade samples under 100 possessions, which fixes that one.                                                                                                  |

**New this round:**

- The tag-vs-paired sign error (#1).
- The star scale and the "suits Hidden" flags (#2).
- The three-way defensive story (#11).
- The style picker committing on a name tap (#14).

### 5. What it would take to reach 9/10

1. **One measurement standard (#1, #11).** Retire the tag tally as a decision input: the "is costing you" card, `seasonAdjust` and "What your tactics did". Use paired worth everywhere, and show the tally only as "what happened". This removes the biggest honesty hole and stops the staff churning coverages.
2. **Credible role stars (#2).** Percentile stars and no "Hidden" nudges. The board becomes something a basketball fan believes at a glance, which is the screen a newcomer judges first.
3. **A verdict loop that never drops or blurs an idea (#3, #4, #5).** Persist the snapshot, measure edits separately, run bigger checks and show the band. That answers "did my idea work?" for an expert.
4. **Earn or fold every lever, with measured mentality and set worth (#6, #7, #12).** Each control on the surface then has a number behind it.
5. **Cut a navigation row and the bench (#10)**, and refit the offense and shape reads on held-out seeds (#8).

### 6. What I couldn't verify, and how I tested

**Played in the browser** (390×844, own profile):

- New real league as the Knicks; released 2 players and simmed to Dec 19 (21-7), then to Jan 26 (33-13).
- Visited every Tactics section and view, the sheets (style, shape, role, mentality, sets, slots, My playbooks, hand-over, 2-3 Zone info), Rotation, Lineups, Roster, a player page and Compare.
- Made measured edits (5-Out + Towns Stretch Big, Put back to Switch, Up-tempo) and saw the checks and mail.
- Reload test for lost edits. No console errors.

**Headless runs:**

- `style-check` on seed 5150 (k 6, all parts, 23 min).
- `grades.mts` (round 2's method) over two full seasons.
- `levers.mts`: 6 teams × 7 configs.
- `tactic-sweep` at 250 games, 17 configs.
- `nyk.mts`: Drop vs Switch, paired games against the tag tally, 6 teams.
- `zone32.mts`: 8 teams vs the league.
- `fits.mts` and `bench.mts` for the role fits.

**Not verified:**

- The style-gate itself (I skipped it to spare the shared CPU; style-check on a held-out seed stood in).
- Partnership worth (`link-impact`).
- Tactic B/C in a live game.
- Playoffs and multi-season familiarity.
- The tablet layout.

Key files:

- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/nyk.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/style-5150.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/levers.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/sweep.txt`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/shots/20-ledger2-0.png`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/shots/tac-season2-1.png`
- `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/tactics-team/shots/sh-towns-0.png`
