I couldn't save the report to `REPORT.md` in the scratch folder: the harness blocks subagents from writing report files. The full report is below instead, and all screenshots, data and scripts are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/tactics-team/`:

- `shots/`: PNG screenshots plus `.txt` dumps of each screen.
- `data/`: headless outputs and the edit-ledger JSON.
- The scripts sit beside them: `s*.mjs` drive the browser, `exp.ts` runs paired experiments, `styledump*.ts` dumps style measurements and `analyze.py` reads them.

I didn't touch the repo. My browser profile and the two large league exports have been deleted. The machine was shared at load average about 20 on 14 cores, so timings are under load.

# Tactics-team lens: round-4 review

## 1. Verdict

The Team tab is now the best "why" layer in the genre. You change a playbook and tap Done. About 5 seconds later the ledger shows the change measured over your next five games, and 10 games later a mail gives the paired verdict, with a working Put back. That loop now survives closing the app.

Every number shown before a choice I checked against paired games matched within noise:

- Hub Big: read −0.5, measured −0.6.
- Full-Court Chaos: read −4.5, measured −5.0, then −6.2 at the check.
- The hand-over: read +0.5, measured +0.2 once drilled.

Defensive reads track the engine at r 0.92.

What keeps it from 9 is that the role layer points the wrong way:

- Following the on-screen offensive stars **loses** 0.27 a game.
- Following the defensive stars **wins** 0.38.
- The staff makes neither move. Its defensive-role threshold leaves +0.35 ± 0.09 a game unclaimed for 11 of 12 teams.

Two more drags: the staff's monthly lever is a dead loop (10 of 11 readings were the same rejected "Switch to Hedge", 0 moves in two seasons), and at 4× the CI gate's games the 2-3 Zone is measured best for 14 of 30 teams.

Phone comprehension is decent per screen but still sits under three rows of navigation.

**Score: 7.5/10**, up from 7. Three round-3 P1s are fixed: the tally no longer decides anything, edits survive close, and the stars are percentile-ranked. The new problems are about whether the role and staff layers mean what they show.

## 2. What's genuinely great (protect these)

**The edit loop is honest end to end.** I made four edits and every reading agreed with the staff's read within its error (n = 1 each, se 0.4-0.7):

- **Hub Big:** the sheet said "−0.5 A game against Five-Out Motion · 6th of 6 … The staff's read, once drilled" (`shots/s3-hubbig-sheet.txt`). The ledger said "−0.6 a game over the next five" (raw −0.72 ± 0.62, `data/edits-1.json`).
- **Full-Court Chaos:** read −4.5, then "−5.0 a game over the next five" (drilled −4.7). At the check: "it cost 6.2 a game … with a tap to put it back" (`data/s10.log`).
- **Put back** restored Drop, the coverage, the press and help 56 exactly, and didn't log a new edit.
- The measurement took 5.0 s, with a progress dock and a Stop button.

**The ledger now survives the app closing.** I changed the shape to Double Post and closed the browser without Done. On reopening, the change was in the ledger as "Not measured yet", and it was measured when I opened Team (`data/edits-2c-reopen.json` → `edits-2d-after-open.json`).

**The style picker and the hand-over carry a labelled read:**

- The picker heads its column "Staff's read, a game" and ranks the options.
- Each option's sheet breaks the read into parts, says what would raise it ("Quicker hands in the top eight +0.9 a game for 5 rating points"), and gives a measured learning cost (`shots/s7-hubbig-sheet.txt`).
- The hand-over now says "Staff would run Five-Out Motion · Drop & Protect: +0.5 a game against yours (the staff's read, once drilled)" (`shots/s13-handover.txt`).

**The defensive reads are excellent.** Over 30 real teams × 7 identities at 1,392 paired games an option, the read tracks measured worth at r 0.92 with slope 1.00. Reads of 0.5 or more have the wrong sign in only 2 of 53 cases (`data/k12/style-def.json`).

**The tally no longer decides anything.** In my two-season save the staff lever measured every change in paired games before acting, and never acted on the tally (`staffLever.ts:1-20`; `data/s12.log`, `data/s15.log`).

**The lineup lab shows its noise:** "Net +26.6 ± 24.4 … The ± under Net is its 95% range: chance alone could move it that much" (`shots/s17-lineup-sheet.txt`).

**Partnerships are real and modest:** +0.52 ± 0.18 per 100 on average for gelled links (`data/links.txt`), as the README says.

**The board is genuinely FM-like.** The five sit on a half court with roles and stars, the shape and coverage are one tap away, and the link lines and the bench are below (`shots/p-tactic.png`).

## 3. Findings

### 1. The role stars point the wrong way, and the staff ignores the one direction that pays. P1

**What the player sees.** The board shows each starter's role with stars. A player naturally "fixes" 1-2★ assignments. Kings examples:

- Achiuwa plays Glue Guy at 1★, while his sheet shows Post Hub 4★.
- Sabonis plays Post Hub at 4★, with Rim Runner and Playmaking Hub at 5★.
- Out of possession, all five are "Position D" (Sabonis 2★, Hunter 1★), while Sabonis's Rim Anchor reads 4★ (`shots/s5-sheet-Achiuwa*.png`, `shots/s5-outposs.png`).

No "Better fit" flag appears anywhere.

**Measured: following the offensive stars costs you.** I moved every starter to his top-star offensive role, on 9 real teams, fully drilled, against all 29 opponents, 696 paired games a variant (`data/roles-teams.txt`):

| Team  | SAC   | OKC   | NYK   | DEN   | MIN   | BOS   | LAL   | CLE   | SAS   |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| Delta | +0.07 | +0.12 | −0.42 | +0.18 | −0.31 | −0.27 | −0.76 | −0.92 | −0.08 |

The mean is **−0.27 ± 0.12 a game**. LAL and CLE are each about 2.5 SE below zero.

**Measured: following the defensive stars pays.** Each starter moved to his top-star defensive role gave a mean of **+0.38 ± 0.12**. A cleaner version (one Rim Anchor, one Point-of-Attack Stopper and one Wing Stopper among the starters, best fit each, no threshold) gave **+0.35 ± 0.09 a game, positive for 11 of 12 teams**: SAC +0.56, NYK +0.87, LAL +0.72, GSW +0.62 (`data/droles.txt`, 928 games a variant).

**The cause** is two star scales:

- The screens rank against the league (`roleStars`, `system.ts:467-485`).
- The staff decides on the absolute fit scale: `fitStars`/`miscast` (`system.ts:414`), plus `autoDefRoles`'s `DEF_ROLE_MIN = 66` (`coachAI.ts:852`). So the Kings get no defensive roles at all.
- The default offensive role is the archetype (`coachAI.ts:739`). That is why the role editor tags Achiuwa's 1★ Glue Guy "Natural" (`RoleEditor.tsx:173`).

**Why it matters:**

- Stars are the board's main signal, and they mislead in one direction and go unused in the other.
- On defense, the user's own "Let the assistant manage" staff and every AI team leave about a win a season unclaimed, and any player who trusts the stars can take it.

**Fix (M):**

- Make the staff decide on the scale the screen shows. Drop or lower `DEF_ROLE_MIN` and assign one defensive role of each kind among the starters (and the bench unit) when it measures positive.
- Give the role picker a measured read like the playbooks have: "+0.4 a game (measured)", via `measureChanges` on the next games.
- Retire the "Natural" tag, or show it only where it is also the top-star role.

### 2. The staff's monthly lever re-measures the same rejected change all season. P1 (the "staff voice" is invisible in practice)

**What the player sees.** Nothing at all. Over 1.8 seasons with the assistant both off and on, the lever took 11 readings:

- 10 of the 11 were "Switch to Hedge" (−0.8, −1.1, −0.1, 0.0, −1.3; then −0.5, −0.6, +0.3, −0.4, −0.5). The other was "Back off the ball", +0.6 (raw 1.0 ± 0.92).
- It made 0 moves and showed 0 cards (`data/s12.log`, `data/s15.log`).

**The cause:**

- `candidate()` skips a change only if it was measured within `LEVER_STALE` days (`staffLever.ts:146`), and `LEVER_STALE = LEVER_EVERY = 28` (`:44-46`). So the tally's top trade-off (Drop) comes round again at every measurement.
- At 6 games × 20 pairs a reading's se is about 0.9, and `LEVER_Z = 2` then needs a raw +1.8 a game to act.

**Fix (S):**

- Exclude a change already read as ≤ 0 for the rest of the season, unless the roster changes.
- Walk down the tally to the next candidate.
- Show the readings on Analysis ("The staff measured Hedge: −0.6, keeping Drop") so the player sees the staff working.
- Consider 40 pairs over 6 games so a true +1 can clear.

### 3. The 2-3 Zone is quietly near-dominant once measured precisely; the CI gate is under-powered. P2

I dumped the style-gate's own measurement (`scripts/style-measure.ts`, the same four seed sets, real league):

- **At the gate's k = 3:** the zone is measured best for 9.8 of 30 teams (tie-shared, under the limit of 12).
- **At k = 12** (1,392 games an option, se 0.20): it is best for **14.3 of 30**. Raw argmax gives 17 of 30. The user's staff picks it for 14 by argmax (`data/k12/style-def.json`).

A balanced option's count should **fall** as the noise falls. It rose, so the zone's edge is real, and it is ahead by more than 0.2 for 10 teams.

Elsewhere at k = 12:

- **Offense:** Five-Out leads (9.2 of 30).
- **Shapes:** Double Post leads (9.6 of 30).
- **3-2 zone:** best in `tactic-sweep` (+1.55 ± 0.41 per 100), but not against every opponent (−0.33 to +0.13 a game for 6 teams, `data/zone32.txt`). Scheme chips are still outside the gate.

**Fix (S/M):**

- Run the gate at k ≥ 6, or add a second "precise" pass for the leaders.
- Trim the zone's open-three or glass terms.
- Add the scheme chips (3-2, box-and-one, triangle-and-two) to the gate.

### 4. The offense and shape reads are only moderately predictive, and the screen shows them to a tenth. P2

At k = 12 (se 0.19 offense, 0.14 shapes), the read against measured worth within team:

| Part    | r    | User's staff pick = measured best | Mean regret | Big reads with wrong sign |
| ------- | ---- | --------------------------------- | ----------- | ------------------------- |
| Offense | 0.53 | 9 of 30                           | 0.37 a game | 4 of 21                   |
| Shapes  | 0.55 | 14 of 30                          | 0.15 a game | 1 of 5                    |

- **Offense:** the "vs current" read misses the measured difference by 0.40 on average (`data/k12/style-off.json`).
- **Shapes:** the reads are compressed. All four Kings shapes read "±0 a game" or "−0.1" (`shots/s4-shape-sheet.txt`), while their measured spread is 0.56 a game on average and up to 1.1.

These are in-sample: the same real league the reads were fitted on. AI staffs pick Hub Big for 7.5 teams, yet it is the worst offense on average (−0.35) and the measured best for 0.8.

**Fix (M):**

- Show a band or a confidence word on offense and shape reads ("+0.3, rough").
- Or offer "measure it": play the paired games on the next five before committing, which the ledger already does after.

### 5. A same-day second edit silently overwrites a measured verdict. P2 (open from rounds 2-3)

Hub Big measured "−0.6 a game". Later the same day (no game between), I changed the shape, and the ledger replaced entry 1 with a merged "Shape … · Offensive playbook …" reading "Even" (`data/edits-2a-onload.json` → `2d-after-open.json`). The −0.6 is gone with no trace.

The cause is `recordEdit`'s merge at `tacticEdits.ts:220`.

**Fix (S):** merge only edits to the same control, or keep the earlier reading as a sub-row ("Hub Big alone: −0.6").

### 6. Verdicts show a point value with no band. P2 (open)

- The ledger shows "−0.6 a game" for raw −0.72 ± 0.62, and "Even" for −0.34 ± 0.46.
- A "too close to say" verdict and a ±0.4 one look the same apart from the word.
- The check runs at `CHECK_GAMES = 480`.

**Fix (S/M):** show "−0.6 (±0.6)" or a small range bar, and keep a running season total of the user's measured edits.

### 7. The system grades contradict the season's own stats on the same Analysis section. P2 (partly open)

In season 2 at 66 games, the hero's weakness is "Forcing turnovers F, 30th of 30", while Analysis → Season shows "Opp TOV% 14.9%, 3rd" (`shots/y2m-anal.txt`, `shots/s16-Season.txt`). In the same season:

- Ball security reads C, 23rd, against TOV% 9th.
- Spacing reads B+, 8th, against eFG% 19th.

The grades rank the systems' inputs, not results, but the screen presents them as fact.

**Fix (M):**

- Add "this season: Nth" beside each grade.
- Recalibrate Forcing turnovers and Spacing against what they produce.

### 8. The engine's tally still sits on Analysis as a red "Your settings, net −2.2" with the disclaimer behind a "?". P2

The Season tab leads with "Drop coverage −2.2, gave up 3.4, won 1.2 back" (`shots/s16-Season.png`). Meanwhile, the staff's paired readings that season measured the alternative, Hedge, as worse 4 times out of 5 (−0.5, −0.6, −0.4, −0.5). The code calls the tally "never advice" (`InsightsTab.tsx:1-5`), but on the surface it reads as advice.

**Fix (S):**

- Put the caveat in the row ("what happened, not what switching wins").
- Where the staff has measured the counter, show it beside the row: "Hedge measured −0.6 a game".

### 9. The complexity budget is still exceeded on a phone. P2 (open)

**Navigation rows.** Every Tactics view stacks three rows of navigation:

- the Team tabs;
- the Tactic/Instructions/Match/Analysis switch;
- then In/Out of possession, the three phases, or Report/Familiarity/Season.

On top of that come the playbook line and, in the first week, the guide card (`shots/p-instr.png`).

**Length and blocks.** The Tactic section is 1,900-2,240 px with seven blocks (`shots/p-tactic.png`, `shots/y2-tactic.png`):

- the style line;
- the guide;
- the board;
- the hero;
- Partnerships;
- a 7-10-row bench (injured players included);
- My playbooks.

**Truncation.** The changes dock truncates its grade moves ("Spacing B+→C+ Ball move…", `shots/s3-dock.png`).

**Fix (S):**

- Collapse the bench to rotation players plus "+N more".
- Fold the In/Out heading into the board card.
- Move strengths/weaknesses to Analysis.

### 10. The playbook name contradicts the shape. P3 (open)

The Kings open on "Five-Out Motion" with "Shape 4-Out, 1-In · The default, whatever the playbook" (`shots/03-tactic-0.png`). A new player reads that as a bug.

**Fix (S):** rename it "Motion (Five-Out)" and default its shape to 5-Out when the roster has the shooters, or explain on the playbook line itself.

### 11. Familiarity flips from 35% to 97% on pick in preseason. P3

- The shape sheet listed "Double Post · 35% known, new".
- After picking it, the note read "97% known, fluid" (`shots/s4-shape-sheet.txt`, `shots/s4-dock.txt`).
- The README says a new system lands "near 80%" after camp.

**Fix (S):** say "Training camp drills it to about X% before opening night" instead of showing the projected figure as current.

### 12. Ledger copy after Put back contradicts itself. P3

The row reads "Nov 10 · Put back · It cost: want it back?, on the games played since" (`shots/s11-after.txt`, `EditLedger.tsx:45`). The comma after "?" is also awkward. Before Put back, the row hides the −6.2 behind the button.

**Fix (S):** after Put back, read "It cost 6.2 a game · put back Nov 28".

### 13. The style picker still commits on a tap of the name. P3 (open)

`PresetPicker.tsx:115`: `onClick={() => pick(p.id)}`. The learning cost and the read's breakdown are only in the ⓘ sheet. The dock's Undo mitigates this.

**Fix (S):** open the sheet on a name tap, or keep it and show the measured learning cost on the row.

### 14. The crowded-paint warning measures at nothing. P3

- The board draws a red line where two bigs "crowd the paint", and the staff moves bigs out of it.
- `link-impact` crowd on against off: **+0.39 ± 0.32 per 100** (`data/links.txt`), the wrong sign and within noise. The README says −0.14.

**Fix (S):** retune `K.link.crowd`, or soften the warning to the staff's read.

### 15. Most surface levers are still unresolved or inert. P3 (open)

Kings, season 2, 696 paired games each (`exp.ts levers`):

| Lever                | Worth a game |
| -------------------- | ------------ |
| Set package (top 4)  | +0.11 ± 0.46 |
| Situations ×4        | +0.20 ± 0.31 |
| Mentality +1         | −0.33 ± 0.40 |
| Mentality −1         | +0.34 ± 0.38 |
| Go-to (injured star) | 0.00         |
| Play through: PnR    | +0.75 ± 0.47 |
| Play through: Iso    | +0.62 ± 0.46 |
| Play through: Post   | −0.56 ± 0.44 |

The Play-through chips are the biggest of these, and they show no read at all.

**Fix (M):** give Play through and the sets the same "staff's read" figure the playbooks have, since the fit machinery already exists.

### 16. Rotation reorders with up arrows only, and Tactics B and C stay empty. P3 (open)

- **Rotation:** no drag-and-drop on the depth chart (`shots/p-rot.png`). 2K and FM both drag.
- **Slots:** after two seasons, Tactics B and C still read "Empty · Set it up" (`shots/s16-slots.txt`). The staff never prepares an alternative, so the A/B/C system is invisible unless you build it yourself.

**Fix (S/M):**

- Add drag reorder.
- Have the staff seed B with the second-best measured playbook and C with a protect-a-lead variant.

### Cross-lens (severe, for the front-office lens)

In season 2's preseason the agenda's one-tap fix was "Sign Ty Jerome (SG · 87 OVR)" on a minimum to reach 13 players. An 87-OVR player unsigned into preseason is the known "top free agents sit unsigned" item, and it is still live.

## 4. Since round 3

| Round-3 finding                                 | Status now                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Tally drives the card and staff changes (P1) | **Fixed.** No "is costing you" card exists (grep finds the phrase only in a comment). The staff lever measures paired games before acting. **New problem:** the lever re-measures the same change and never acts (#2), and the tally still headlines Season (#8).                                                                         |
| 2. Role stars mis-scaled, "Hidden" nudges (P1)  | **Partly fixed.** Stars are percentile now (Towns: Rim Runner 4★, Playmaking Hub 5★, Rim Anchor 4★) and Hidden is out of `betterFit`. **New problem:** the screen's scale and the staff's scale disagree, the offensive stars mislead (−0.27) and the defensive ones pay unused (+0.35), and the "Natural" tag can sit on a 1★ role (#1). |
| 3. Edits lost on close (P1)                     | **Fixed.** Verified: closed mid-visit, reopened, the change was recorded and measured (`data/edits-2c/2d`).                                                                                                                                                                                                                               |
| 4. Same-day merges                              | **Still open.** Verified: a measured −0.6 was overwritten (#5).                                                                                                                                                                                                                                                                           |
| 5. No band on verdicts                          | **Still open** (#6).                                                                                                                                                                                                                                                                                                                      |
| 6. Inert levers                                 | **Still open** (#15). Go-to and the set package are still unresolved; defensive roles turn out to be a real lever the staff under-uses (#1).                                                                                                                                                                                              |
| 7. Mentality cost copy                          | **Fixed on screen.** The dial makes no cost claim, and it measures within noise (#15).                                                                                                                                                                                                                                                    |
| 8. Weak offense and shape reads                 | **Improved.** In-sample r is 0.53 for offense and 0.55 for shapes at k 12 (README: 0.49 and 0.52). Still shown to a tenth with no band (#4).                                                                                                                                                                                              |
| 9. Grades against stats                         | **Still open.** Forcing turnovers F/30th against Opp TOV% 3rd (#7).                                                                                                                                                                                                                                                                       |
| 10. Complexity budget                           | **Still open** (#9). The head switch replaced the chips but is still a second tab row.                                                                                                                                                                                                                                                    |
| 11. Defense story told three ways               | **Partly fixed.** `StaffMoveNote` names the author, date and Undo, but I couldn't see it fire: the staff made no move in two seasons (#2).                                                                                                                                                                                                |
| 12. Familiarity not in points                   | **Partly fixed.** The picker sheets show a measured learning cost ("Learning it costs too little to tell (measured)"); the chips are still % only.                                                                                                                                                                                        |
| 13. 5-Out copy against the report               | Not re-tested.                                                                                                                                                                                                                                                                                                                            |
| 14. Picker commits on name tap                  | **Still open** (#13).                                                                                                                                                                                                                                                                                                                     |
| 15. Hand-over without a read                    | **Fixed.** "+0.5 a game against yours (the staff's read, once drilled)", which measured +0.2 drilled.                                                                                                                                                                                                                                     |
| 16. Scheme chips outside the gate               | **Still open** (#3). The 3-2 zone is +1.55/100 in the sweep and ≈0 against the league.                                                                                                                                                                                                                                                    |
| 17. Leftovers                                   | Five-Out naming **open** (#10). Up-arrow reorder **open** (#16).                                                                                                                                                                                                                                                                          |

**New since round 3:**

- **Good:** Tactics at `/team/tactics/:sub` with one screen key. Moving between sections keeps the visit and its Undo, and I hit no route bugs.
- **Good:** the hand-over read.
- **Good:** the young-players week call quotes a measured cost ("costs 0.9 pts a game (≈ −2% to win, measured @ SAS)").
- **New problems:** the dead lever loop (#2), and the precise-measurement zone count (#3).

## 5. What it would take to reach 9/10

1. **Make roles a measured, staff-run lever (#1).** One star scale for the screen and the staff. The staff assigns defensive roles whenever they measure positive, and the role picker shows "+x a game (measured)". Expected impact: about 1 win a season for every managed team, and the board's stars become something a player can trust. Today they are the biggest gap between what the screen implies and what the engine does.
2. **A staff that visibly works (#2, #16).** Fix the candidate loop, publish the readings on Analysis ("measured Hedge −0.6, keeping Drop"), and seed Tactics B and C. The "one staff voice" pitch then shows up in a normal save, not only in the code.
3. **Re-balance the zone and tighten the gate (#3).** Run it at k ≥ 6 with the scheme chips included, so "no dominant setup" is true at the precision a dedicated player can reach.
4. **Show uncertainty wherever a number is shown (#4, #6, #5).** Bands on offense and shape reads and on ledger verdicts, and no silent merges. That makes the numbers rule visibly kept, not just kept in the code.
5. **Cut a navigation row and the bench, and reconcile the grades with the season (#7, #9, #10).** That makes the phone screen as comprehensible as it is deep, closer to FM26's single-board feel.

## 6. What I couldn't verify, and how I tested

**Played in the browser** (390×844 phone viewport, own profile, now deleted):

- A new real league as the Kings: preseason → season 1 (17-62 after my deliberate bad edits) → playoffs, draft, re-signing and FA on autopilot → season 2 to day 138 (36-30) with the assistant managing.
- Every Tactics section: Tactic, Instructions, Match, Analysis (Report, Familiarity, Season).
- The style picker and its sheets (Hub Big, Full-Court Chaos), the shape sheet, the player sheets (Sabonis, Achiuwa), the out-of-possession board, the hand-over sheet, the slots sheet, Rotation, Lineups (a five's sheet) and a player page.
- Four measured edits: Hub Big; Double Post (closed mid-visit); Full-Court Chaos (checked, then Put back via the ledger); the hand-over.
- No console errors in any run.

**Headless (my scripts):**

- `styledump.ts`: the style-gate measurement for off, def and shape at k 3 (gate settings), and at k 12 for off, def and shape. `analyze.py` reads them.
- `exp.ts`, paired, fully drilled, against all 29 opponents:
  - roles: 9 teams;
  - one-of-each defensive roles: 12 teams;
  - levers: Kings, season 2;
  - 3-2 zone, 2-3 zone and physicality: 6 teams.
- `tactic-sweep.ts 300` and `link-impact.ts 300 league,crowd`.

**Not verified:**

- The live-game touchline A/B/C switch (game-day lens).
- `StaffMoveNote`, since the staff never made a move.
- The tablet layout.
- Grade calibration over many seasons.
- Held-out-seed reads: my style measurements used the real league the reads were fitted on.
- The `npm run style-gate` CLI itself (I ran its measurement function directly with the same seeds and k).
- Exact phone timings, because the machine was loaded.
