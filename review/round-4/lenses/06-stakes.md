# Stakes lens (round 4): owner, money, job security, difficulty

Reviewer 6 of 10, lens `stakes`. HEAD 81f1bf6.

**I could not write `REPORT.md`.** The Write tool refuses report files from subagents, so this message is the full report. My scripts, logs, result files and screenshots are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/stakes/`. Screenshots are in `shots/`. The result files are:

- `fc-dump.jsonl` (forecast-check)
- `res-b1.jsonl` (difficulty)
- `res-b2.jsonl` (tank, overspend and passive careers)
- `res-staff.jsonl` (seasons with and without the staff's daily measuring)

Nothing in the repo was touched. My five browser profiles are deleted. Ten reviewers shared the machine, so every timing was taken under load.

## 1. Verdict

The bar is fair now. Targets track a calibrated forecast:

- `forecast-check` passes: slope 1.04, tails within ±1.0 win, 82% of seasons inside the band.
- OKC is asked for 65–68 wins and feels real pressure (season grades from −64 to +50).
- Postseason goals follow the odds.
- The "development year" now costs about what it saves.

But almost nothing ever feels at risk. On Normal:

- **A passive coach is never fired.** 0 of 12 five-season careers, the Clippers included.
- **Every hands-off UI season was "Good" or "Excellent".** 6 of 6.
- **Your team beats its own forecast.** By about +3 wins, so it meets the owner's win goal 78% of the time when the staff runs it as the app does.
- **Money can be ignored completely.** I lost $468M in a season and heard "Good · Secure 65 · The owner is happy with the direction". Then I walked into the Hawks job with clean books.

On the court the difficulty presets differ by about ±5 wins. In the owner's office only the grace period and the rebuild clock change. Hard's season grades are no lower than Normal's.

**Score: 6.9/10** (round 3: 6.8). Fairness and honesty are about an 8; risk and money are about a 5.

## 2. What's genuinely great (protect these)

- **The forecast under the targets is calibrated.**
  - `npm run forecast-check` (16 leagues × 2 seasons, 4 jobs, 3:03 under load), real league: slope 1.04, r 0.82, bottom fifth −1.0, top fifth +0.1, band 82%. Fictional league: slope 1.05.
  - Over 600 real team-seasons the owner's targets sat −0.1 wins from the forecast, and 53% were met.
  - OKC's targets are 65–68 and it wins 64–72. Round 3's "asked 46–50, went 64-18" is gone.
- **The owner says when he asks more than his own read.**
  - "He expects more than his read of this roster: reach the play-in… Behind his read" (`shots/k-10-opens2-owner.png`).
  - "Last season I asked for 41 wins. I'm holding the bar at 36, 6 over my read of this roster." The hold is now capped.
- **The floor call is priced in the owner's own terms.** The Kings card on Dec 18 read: "Chasing it: −11 to your standing at his review; a development year: −16, its cost included (the forecast's read: about 14 wins either way). The staff's call: chase it."
- **The development year is no longer free.** On identical records, easing beat chasing by only +3 standing (Kings, Normal, 15 wins: −11 vs −14; Kings, Hard, 10 wins: −52 vs −55). Round 3 measured +48.
- **The next-review line is accurate.** "Next review needs a season grade of −50 or better: about 41 wins" sits next to the −40 rebuild cap, and the two agree.
- **The job moments land.**
  - The ultimatum: "Reach the play-in · Miss it and you're fired, whatever else goes right" (`shots/t-moment0-moment_ultimatum.png`). It stops the sim.
  - The verdict lists each goal with its grade.
  - The meter shows a hatched hot seat and "Fired under 25".
- **The team picker shows the job.** The Kings tile reads "Owner: 21 wins · rebuild · frugal".
- **The debt shortcut works.** A $471.6M close went straight to the budget freeze, and the screen spelled out the terms (`shots/g-13-reviews2-owner.png`).

## 3. Findings (most severe first)

**F1. A half-billion-dollar loss is a "Good" season: the money never reaches the season's grade. P1**

- **What I did (Warriors, Normal, in the UI):**
  - Season 1: budgets at 100 and tickets at $30. Lost $129.7M.
  - Off-season: re-signed every expiring player at his max (G. Payton II $61.2M, M. Leons $62.0M × 4).
  - Season 2: payroll $288.4M, tax $327.2M, loss $468.5M, cash −$538.2M.
- **What the owner said:**
  - The verdict moment: **"Good · 'The books closed $471.6M in the red. I can't carry that.' Season grade +16, standing +30"** (`shots/g-moment0-moment_verdict.png`).
  - The Owner page: **"65 · Secure · The owner is happy with the direction"**, directly over "Budget frozen · Closed $471.6M in the red" (`shots/g-13-reviews2-owner.png`).
- **Why it happens:**
  - The only money goal was "Get under the first apron", weighted 11%.
  - The books ladder is separate from the grade and only caps seasons already played under the freeze (`owner.ts:130-134`, `books.ts:315-333`).
  - The verdict word comes from the grade (`legacyReview.ts:214`), while the quote comes from the debt.
- **Headless:** overspending Celtics and Suns ran four seasons through ultimatum, freeze and final warning without being fired. Their standing stayed between −26 and +29.
- **Fix (M):** grade the close on every season. Tie the verdict word and the meter line to the books. Make "Secure" impossible under a freeze.

**F2. Debt doesn't follow you: a frozen coach $538M in the hole walks into a new job with clean books. P1 (loophole)**

- **What happened:** after F1, "2 teams want you as coach: ATL, LAC". Taking the Hawks job gave:
  - "Frugal owner: watches the bottom line… He can't fire you in your first 2 seasons."
  - Cash $76.2M, books +$82.7M, job security 58 (`shots/g-51_office_owner.png`, `shots/g-51_office_finances.png`).
- **Cause:**
  - `takeOverTeam` deletes the books (`owner.ts:55`).
  - Job offers ignore the books.
- **The exploit:** overspend through the grace years, then change jobs.
- **Fix (S/M):** count the last close in the coach's reputation. Show the debt on offers and in the news. Frugal owners shouldn't call.

**F3. Ordinary failure carries no job risk on Normal: passive play wins. P1**

- **Nobody passive gets fired.** 0 of 12 five-season passive careers on Normal (6 teams × 2 seeds). The lowest standing was −40 (Clippers, 25-win roster).
- **No review can fire you for two seasons on Normal, and there is no in-season dismissal** (`jobSecurity.ts:59`). A Lakers coach who tanked a 50-win roster to 14-68 and then 30-52 (standing −89) was still employed in season 3. Tank careers were fired only after season 3 on Normal (season 5 for one Kings seed) and after season 2 on Hard.
- **Your team beats the bar** (opening seasons, 8 teams × 5 seeds):

| Setup                                | Wins over forecast | Win goal met |
| ------------------------------------ | ------------------ | ------------ |
| With the app's daily staff measuring | +3.2 (se 0.8)      | 31 of 40     |
| Without it                           | +2.7 (se 1.1)      | 25 of 40     |
| AI-run teams (forecast-check)        | −0.1               | —            |

- **Untouched UI seasons** all graded positive:

| Season              | Forecast | Wins | Grade                      |
| ------------------- | -------- | ---- | -------------------------- |
| Kings, Hard, year 1 | 20       | 15   | +11                        |
| Kings, Hard, year 2 | 25       | 41   | +73, and Coach of the Year |
| Warriors, year 1    | 39       | 51   | +39                        |
| Warriors, year 2    | 30       | 42   | +16                        |
| Lakers              | 50       | 57   | +33                        |
| Mavericks           | 31       | 36   | +16                        |

- **Fix (M):**
  - A one-season grace on Normal.
  - In-season dismissal for collapse after the grace.
  - Fold the user team's measured +3 into the target, or ask for the forecast's 55th percentile.
  - Let standing decay slowly.

**F4. Nothing stops reckless spending until the next review, and a first season's red is always only a warning. P1**

- **No owner check on contracts.** The re-sign sheet's quick "Max $61.22M" button bypasses the 1.5×-ask slider guard (`OfferControls.tsx:3`). Payton II signed at about 20× his ask (`shots/g-41-negotiate.png`). The projected books never appear on the contract sheet.
- **Season one is free spending.** `books.ts:325` turns any first-season close in the red into a warning. My $129.7M loss closed −$19.5M and still graded "Good +39".
- **Fix (M):**
  - An owner sign-off on deals that break his line or push the projected close into the red.
  - Limit the first-season exemption to the inherited payroll's tax.

**F5. The first-season warning blames "the payroll you inherited" even when the red is self-inflicted. P2 (honesty)**

- **The message** (`books.ts:217`): "You inherited that payroll, so this time it's a warning."
- **The truth:** about $78M of the hole was my ticket price and budgets. The tax had already been signed off ("his $56.6M sign-off doesn't count").
- **Fix (S):** name the actual cause.

**F6. Hard's owner isn't harder; the difficulty changes the court, the grace and the clock. P2**

- **Paired by seed** (5 teams × 3 seeds):

| Comparison     | Year 1 wins   | Year 1 grade | Year 2 wins | Year 2 grade |
| -------------- | ------------- | ------------ | ----------- | ------------ |
| Easy vs Normal | +4.7 (se 2.3) | +26          | +3.5        | +10          |
| Hard vs Normal | −5.8 (se 1.9) | **+17**      | −4.8        | −5.5         |

- **Standing after two seasons:** Easy +21.7, Normal 0, Hard +5.5. One coach was fired, on Hard.
- **Why:** targets shrink with the forecast's court edge (−4.3 wins on Hard). "Impatient owner" only means a one-season grace, a one-season rebuild clock and a 52% season weight.
- **The edge is invisible in play:** nothing under `src/ui` reads `userCourtPoints` (round-3 F14, still open).
- **Fix (S/M):** Hard asks for the forecast's 60th percentile and Easy the 40th, and the screens say so. Add a pregame line such as "Hard: they play 3.1 better against you."

**F7. Team-level forecast misses still decide some jobs. P2**

- **AI-run teams in their first season** (forecast-check, 10 leagues):

| Team | Wins vs forecast | Win goal met |
| ---- | ---------------- | ------------ |
| SAC  | −7.9 ± 1.7       | 1 of 10      |
| IND  | −6.5             | 3 of 10      |
| LAC  | −6.0             | 0 of 10      |
| DAL  | +6.1             | 9 of 10      |
| NYK  | +5.6             | 8 of 10      |
| UTA  | +4.3             | 9 of 10      |

- **As the user's team,** Dallas went 40, 42, 28, 42, 37, 43 and 36 against a 31-win forecast.
- **CI doesn't catch it.** It allows ±5 wins per team, and its only user-side check is "the default team meets its goals ≥50%" (met 9 of 10). It sims headless without the staff's measuring.
- **Fix (M):** gate the user team's mean miss at ±1.5 across teams, run through `runSim` with the staff. Refit the four outliers.

**F8. The rebuild clock overrides the odds rule, and its cap punishes a coach who beats his targets. P2**

- **The override:** `ownerGoals.ts:703` asks for the play-in whatever the odds. Kings, Hard, year 2, read 15th in the West: "Reach the play-in… −40 at best".
- **Beating the target still loses:**
  - Clippers, year 4: won 31 against a 24-win target (wins goal +35) and graded −60.
  - Another seed: 26 against 24 graded −60, then −80.
- **Fix (S):** cap only when the wins goal is also missed, or use the highest level with at least 15% odds.

**F9. The floor is a one-win cliff worth about 50 standing points. P2**

- **Rule** (`ownerGoals.ts:518-523`): 14 wins grades normally; 13 wins grades about −42.
- **In play:** the Kings card read "−11, about 14 either way". They finished at 15 wins: +11.
- **Fix (S):** ramp the cap over about 4 wins.

**F10. Tanking a bad roster is free down to the floor: the youth and inherited-payroll goals are near-automatic. P2**

- **Kings 15-67, four wins under target: "Good · I'm pleased +11".**
  - Youth minutes: 4,924 against a 3,000 target (+30), handed out by the staff.
  - "Stay under the tax" on an inherited payroll already $9.2M under: +29.
- **Headless tank:** 16 wins against a 21-win target graded +9.
- **Payroll goals** were met at +15 or better in 80% of passive seasons (n=54).
- **Fix (S):** a kept inherited line grades 0 to +10. Set youth targets from the staff's own rotation.

**F11. Profit goals still grade high for passive play. P2 (round-3 F18, open)**

- Passive seasons on Normal averaged +26 on the profit goal, with 82% met (n=68).
- **Fix (S):** refit `PROFIT_EXTRA` and `PROFIT_PER_WIN`.

**F12. The ultimatum card stays on Today after the season. P2 (bug)**

- After the Lakers met the play-in ultimatum and the review was in, Today still led with "Owner: Reach the play-in · Miss it and you're fired…" (`shots/t-13-reviews2-today.png`).
- **Cause:** `agenda.ts:470-479` only checks that the goals are this season's.
- **Fix (S):** show it only in-season, and only while it's unresolved.

**F13. The books card contradicts itself and understates what's coming. P2 (honesty)**

- **Contradiction:** the title read "The books are heading into the red" over the text "Next season's books project $75.1M in the black" (`shots/g-13-reviews1-today.png`).
- **Understatement:** before a −$466M close it promised "the owner gives you an ultimatum". The review went straight to the freeze.
- **Cause:** fixed copy per stage at `calls.ts:1501-1507`.
- **Fix (S):** read the title from the projection, and name the freeze when the debt rule applies.

**F14. A met ultimatum's flat +15 still props up a failing coach. P2 (round-3 F9, open)**

- Lakers on Hard: standing −49, then a −29 season, then the ultimatum met by losing the play-in. Standing ended at −24 ("Warm seat 38").
- **Cause:** `ULTIMATUM_MET = 0.15` (`jobSecurity.ts:333`).
- **Fix (S):** scale the bonus by how hard the ask was, or grant it once per tenure.

**F15. The owner never reacts to the fans. P2 (round-3 F11, open)**

- Kings fans hit "Fed Up 20", the arena was 81% full, and the team lost $23.2M. The frugal owner said "I'm pleased".
- **Fix (S):** add the fans to his check-ins or his money goal.

**F16. After a takeover, Today's review card mixes two teams. P2 (round-3 F12, open)**

- The card shows "18-64 · Picked for 29 wins" (Hawks), "Player of the season: Porziņģis" (Warriors), and "The owner gives his verdict when the Finals end" (`shots/g-51_.png`).
- The new job's dead money is listed as "Owed to players you released".
- **Fix (S).**

**F17. Offer cards are still thin. P3 (round-3 F13, open)**

- They show "Rebuilding 18-64 · $172.8M payroll": no owner type, no projected books, no starting standing. Combined with F2, this is how a "bottom line" owner ends up hiring a $468M loser.
- **Fix (S):** add one meta line.

**F18. The Office hub still leads with cash, not the books close. P3 (round-3 F16, open)**

- It reads "Cash −$538.2M · loss $468.5M".
- **Fix (S).**

**F19. A ticket price, once set, never goes back to staff pricing. P3 (round-3 F17, open)**

- `priceSet` at `Finances.tsx:398` is permanent.
- **Fix (S):** a "Let the staff price" toggle.

**F20. The owner model has become a rulebook. P3**

- About 15 rules interact: floor, floor margin, rebuild clock, patience steps, the 3-win slide, the hold over his read, the payroll raise, concede, development year, ultimatum, a five-stage books ladder, debt limit, sign-off, inherited payroll, title floor.
- The help sheet is about ten dense paragraphs (`Owner.tsx:440-475`). The page has six blocks against a budget of five.
- **Fix (M):** keep three or four rules a player can say back, and put the "why" lines under each goal.

**Cross-lens notes (severe only):**

- **Front office:** top free agents still sit unsigned into the pre-season. Ty Jerome (84) was available at $30.4M × 1 and lifted a 25-win Kings forecast to 41-41. Derrick Jones Jr. (80) was the staff's suggested pre-season signing.
- **Tactics:** depth-chart order doesn't set minutes. Dončić, placed ninth, averaged 28.8 points and won Sixth Man of the Year (`shots/t-61-rot-after.png`).

## 4. Since round 3

| Round-3 finding                            | Now                                                                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 forecast tails                          | **Fixed in aggregate** (bottom fifth −1.0, top fifth +0.1; OKC projected 66, won 65). Team biases (F7) and the user surplus (F3) remain.                                           |
| F2 postseason goal from the strategy label | **Fixed** (35% odds rule). Exception: the rebuild-clock and paid-to-win override (F8).                                                                                             |
| F3 a title outweighs a loss                | **Partly fixed.** Past the debt limit there's no title lift, and the debt goes straight to the freeze (verified). But a $471.6M loss without a title still grades "Good +16" (F1). |
| F4 development year worth +48              | **Fixed** (measured +3 under the floor, −10 above it).                                                                                                                             |
| F5 next-review line                        | **Fixed.**                                                                                                                                                                         |
| F6 held target 14 over his read            | **Fixed** ("holding the bar at 36, 6 over my read").                                                                                                                               |
| F7 swap trap                               | **Fixed in code** (`books.ts:110-127`), not replayed.                                                                                                                              |
| F8 concede lean                            | **Fixed in code** (`calls.ts:394`), not triggered in the UI.                                                                                                                       |
| F9 met-ultimatum treadmill                 | **Still open** (F14).                                                                                                                                                              |
| F10 budget cuts count as profit            | **Fixed** per the team, not re-measured.                                                                                                                                           |
| F11 owner indifferent to the arena         | **Still open** (F15).                                                                                                                                                              |
| F12 mixed review card                      | **Still open** (F16).                                                                                                                                                              |
| F13 thin offers                            | **Still open, and now part of an exploit** (F2, F17).                                                                                                                              |
| F14 Hard edge invisible                    | **Still open** (F6).                                                                                                                                                               |
| F15 picker shows nothing                   | **Fixed.**                                                                                                                                                                         |
| F16 hub shows cash                         | **Still open** (F18).                                                                                                                                                              |
| F17 one-way ticket price                   | **Still open** (F19).                                                                                                                                                              |
| F18 profit goals positive                  | **Still open** (F11).                                                                                                                                                              |
| F19 Owner page over budget                 | **Still open** (F20).                                                                                                                                                              |

New this round: F1 in its no-title form, F2, F3, F4, F5, F6, F8's case where beating the target still loses, F9, F10, F12, F13.

## 5. What it would take to reach 9/10

1. **Make money part of every season and of the coach's name (F1, F2, F4, F5).** Grade the close every season, add an owner sign-off on contracts, and make debt follow your reputation. Then "spend it all" becomes a decision with a price, not a cheat code.
2. **Real risk for ordinary failure (F3, F14).** A one-season grace on Normal, in-season dismissal for collapse, and targets that absorb the user team's +3. Then a hands-off player actually meets the owner as an antagonist.
3. **Difficulty you can feel in the office (F6).** Hard asks above the read and shows the court edge before each game.
4. **Per-team honesty in CI (F7).** Gate the user team's surplus with the staff running, and refit DAL, SAC, LAC and IND.
5. **Fewer, smoother rules (F8, F9, F10, F20).** No one-win cliff, no cap that ignores a met target, no free points.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright, 390×844 phone, port 5191):

- **Kings, Hard:** two hands-off seasons through New League, the difficulty table and help, the floor and deadline calls, verdicts, the off-season and a pre-season signing.
- **Warriors, Normal:** two overspending seasons via the Finances sliders and max re-signs, through the warning, the debt freeze and job offers, then the Hawks job.
- **Lakers, Hard:** deliberate failure by putting the worst eight at the top of the depth chart. Year 1 went 32-50 (standing −49); year 2 brought the ultimatum, which was met.
- **Lakers and Mavericks, Normal:** one season each.

**Headless:**

- `forecast-check` with its full dump (960 team-seasons).
- 181 seasons with `exp.mts`:
  - Difficulty: 5 teams × 3 difficulties × 3 seeds × 2 seasons.
  - Tanking with and without the development year: Kings, Lakers and Thunder on Normal and Hard.
  - Overspending: Warriors, Suns and Celtics, 4 seasons.
  - Passive careers: 6 teams × 2 seeds × 5 seasons.
- 80 paired seasons with and without `staffMorning` (`exp2.mts`).

**Caveats:**

- My harness re-signs every player rated 72+ at his ask. That inflates some payrolls (the Thunder tank run reached $339M) and drove the books stages in the passive careers.
- The UI forecast misses rest on six seasons only.
- F7 and F8 from round 3 are verified in code, not replayed.
- I never played Easy in the UI, and the development-year card never triggered there.
- I didn't measure the presets' trade and contract asks (front-office lens).
