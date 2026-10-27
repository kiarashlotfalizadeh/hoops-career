# Stakes lens: owner, money, job security, difficulty (round 3)

Everything I made is in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/stakes/`. Screenshots are in `shots/`, headless logs in `out/`, and the scripts (`harness.mts`, `passive.mts`, `targets2.mts`, `calib.mts`, `ease.mts`, `budget.mts`, `swap.mts`, `concede2.mts`, `ult.mts`, `season.mjs`, `takejob.mjs`) are at its top level. Nothing in the repo was touched.

**Two warnings first:**

- **The disk was nearly full during the review.** Free space fell to 164 MB at one point, and two of my commands failed with ENOSPC. The space is going to other folders: the round-2 session's scratchpad is 5.6 GB and the `claude-spares` folders total about 6 GB. I deleted only two of my own browser profiles, `profileTmp` and `profileMin`.
- **Timings were taken under heavy load** (load average 45–55, with ten reviewers running).

## 1. Verdict

Most round-2 complaints are fixed:

- Win targets now come from the season forecast: all 30 teams sit within ±2.6 wins of it on every difficulty.
- The inherited-payroll goal is met on opening night.
- The profit target can't be gamed with the sliders.
- Ultimatums are reachable: 25–31% at issue.
- The off-season hot-seat line now says what the next review needs.

Failing is still dramatic. The verdict, ultimatum, "You're fired" and "New job" moments are must-see, and a run into the ground through the UI ends in a firing in season 3 with every step announced.

But fairness now leaks through four other doors:

- **The forecast itself is compressed at the extremes.** The Thunder are underestimated by 11–17 wins, so they carry no pressure at all, while bad teams start under water.
- **The postseason goal comes from a strategy label**, not from the odds: Minnesota on Hard is asked to win a playoff round at a 9% chance.
- **A title outweighs a $1.07B loss**: the owner says "I'm thrilled."
- **One tap ("Tell him it's a development year") is worth +48 season grade.**

The preseason line also told me "about 4 wins" would save my job when only the play-in could.

**Score: 6.8/10** (round 2: 6.5). The drama and legibility are an 8. Fairness across teams, gameable levers and two honesty bugs hold it back.

## 2. What's genuinely great (protect these)

- **The job moments.**
  - Verdict: "Poor · 'I'm concerned.' Season grade −64, standing −64 after 18-64", with each goal's grade (`shots/hw-moment0-moment_verdict.png`).
  - Ultimatum: "Win 26 games · Miss it and you're fired… 19 of 26 so far."
  - Fired: "'I told you at the break: win 13 games. It didn't happen…' 11-71 · season grade −60" (`shots/hw-moment0-moment_fired.png`).
  - Hired: "Phoenix Suns · Builder owner… He can't fire you in your first season."
- **The owner admits when he's asking for more than his read.** On opening night: "He expects more than his read of this roster: win a playoff round", with the goal tagged "Behind his read" (`shots/m-owner-open.png`). Round-2 F10 is fixed.
- **Ultimatums are now real demands, not executions.**
  - Kings on Hard, at 20-40: "Win 29 games" against a 27.6-win forecast.
  - Wizards: "Reach the play-in" at 30.8% (`out/ult_*_hard.txt`).
- **Staff calls price the young players' minutes honestly.** For example: "22 more minutes a game for the young players? It costs 1.5 pts a game (≈ −4% to win, measured @ TOR)… on pace for 9,236 of his 10,700."
- **The rebuild clock is legible.** "2 seasons without the postseason is all I'll take. This season we compete: miss the play-in and it grades −60 at best."
- **The Finances budget tab states real costs.** "Development −0.49 rating pts per skill a year", "Injuries last 12% longer", "−1,352 fans a home game", "Est. crowd 3,712 · 18% full".

## 3. Findings (most severe first)

**F1. The forecast behind the owner's targets is compressed at the extremes, so your team pick still sets the difficulty. P1**

- **What I measured (`calib.mts`, 10 seasons, 270 team-seasons, opening-night forecast against the final record):**

| Team, difficulty       | Forecast (= owner's read) | Actual wins                          |
| ---------------------- | ------------------------- | ------------------------------------ |
| Thunder (AI-run)       | 55.6–56.1                 | 67, 68, 71, 72                       |
| Thunder (mine), Normal | 55.1–55.6                 | 65, 69, 71                           |
| Thunder (mine), Hard   | 47.5–47.6                 | 64, 64, 67, plus 69 in a passive run |
| Kings (AI-run)         | 31–33                     | 15–28 (mean 22)                      |

- **Teams forecast at 30–36 wins went 30.8** on average (n=68).
- **What it costs:**
  - The Thunder's owner asks 46–50 on Hard, and you go 64-18. "Secure 87–90" every season: the best team has no stakes.
  - The Kings miss 25–30-win asks by 5–14 wins and start every career under the floor's cap.
- **Hard's edge is smaller than assumed.** The forecast assumes Hard costs the Thunder about 8.6 wins; measured, it cost about 4.5 (Thunder as AI 69.5 against mine on Hard 65; small n).
- **Code:** `ownerGoals.ts:277` (`leagueOutlook`), `analysis/odds.ts` (`ROSTER_NET`, `PRIOR_GAMES`).
- **Cross-lens:** sim-credibility. The press's "projected for N wins" is wrong in the same way.
- **Fix (M):** Recalibrate `ROSTER_NET` and the prior so the actual-vs-forecast slope is about 1 at the tails. Meanwhile, cap the target at no less than the forecast's 40th percentile for top-3 rosters.

**F2. The postseason goal comes from the front-office strategy label, not the odds. P1**

- **What happens:** "contend" (any top-10 by the average of the top-eight players' overall ratings) means "Win a playoff round" whatever the forecast says (`ownerGoals.ts:601`).
- **What I measured (`targets2.mts`):**
  - Hard: 7 of 30 teams get a postseason goal the forecast gives under 25%: Minnesota 9%, Clippers 11%, Portland 15%, Boston 20%, Houston 21%, Lakers 21%, Warriors 21%.
  - Normal: 2 teams (Minnesota 16%, Clippers 18%).
- **In the UI** (`shots/m-owner-open.png`): Minnesota, Hard: "Win a playoff round · Behind his read · His read of the roster: 9th in the West · weight 33%". The same day's preview headline: "36 wins and a fight for the play-in".
- **What it costs:** missing by 2–3 levels grades −70 to −100 on 30–40% of the review.
  - That's what fired my passive Wizards on Hard. Seasons 2 and 3 asked "Win a playoff round" at a 40-win forecast; both grades were −100 on that goal (−55 and −80 seasons). See `out/passive_29_hard.txt`.
- **The Clippers case:** "rebuild" plus a top-half payroll gives "Reach the play-in" at 11%. That payroll is the one the same owner calls inherited.
- **Fix (S):** Pick the highest level the forecast gives about 35%+ (the ultimatum already does this at 25%, `jobSecurity.ts:298`). Don't apply `paidToWin` to an inherited payroll.

**F3. A title outweighs any loss: −$883M in a season, and the owner is "thrilled". P1**

- **What happened** (passive Thunder on Hard, `out/passive_20_hard.txt`):
  - 2028: lost $219M, books at −$182M → grade 50, "I'm thrilled".
  - 2029: lost $883.5M, cash −$1,065M → grade 50, standing 57, "Secure 79", "I'm thrilled".
  - 2030: fired at 66-16, conference finals, "The books closed $1444.9M in the red".
- **Causes:**
  - `CROWN_GRADE` lifts any season to +50 unless the budget is frozen (`ownerGoals.ts:1188`).
  - The books ladder is size-blind: warning → ultimatum → freeze → final, and the debt-limit shortcut only applies from the freeze (`books.ts:309`).
  - The help text and the README read "(at once past $150M in the red)", but the earliest sack is three reviews after the first red close.
- **Caveat:** my harness re-signs everyone rated 72+ at his ask, but a lazy human can do exactly that. The re-sign sheet shows the tax, not the owner's goal or the books.
- **Fix (S/M):**
  - Scale the books step by the size of the hole (past the debt limit, go straight to the freeze or final warning).
  - Let the books cap the crown before the freeze: a title can't lift a season whose close is past the debt limit.
  - Give the owner a line for it: "We won, and it cost me $900M."

**F4. "Tell him it's a development year" is worth about +48 season grade at no clock cost for a rebuilding team. P1 (new exploit)**

- **What I measured** (`ease.mts`, Kings, Normal, identical 16-66 season):
  - Chase (the staff's suggested answer): grade −62, standing −62, "Hot seat 19".
  - Ease: grade −14, standing −24, "Warm seat 38".
- **Why:** easing drops the floor 10 points of win% (−8 wins), so the floor cap never bites, and moves 40% of the wins weight to youth minutes, where its miss grades 0 (`ownerGoals.ts:932`).
- **The clock cost is nothing for a team already rebuilding:** a rebuild season counts on the clock anyway (`og.rebuild ??=`).
- **The staff's call offers it as the secondary choice:** "Chase the floor" is the suggestion. The player who taps the lean pays 38 standing points.
- **Fix (S):** Keep the moved weight's miss (grade it, don't zero it). Count the eased floor's shortfall against the floor's wins. Or make easing cost what it saves: 10 points plus the floor's cap on the wins goal.

**F5. The preseason "next review needs" line ignores the rebuild cap and told me the wrong thing. P1 (honesty)**

- **What the screen said** (Wizards, Hard, season 3 preseason, `shots/hw-s3pre-owner.png`):
  - "Next review needs a season grade of −58 or better: **about 4 wins.**"
  - Lower on the same screen: "miss the play-in and it grades −60 at best, whatever else goes right".
- **The truth:** no record without the play-in could reach −58.
- **What happened:** I went 11-71, graded −60 (rebuild cap), standing −51, and was fired. The ultimatum at the break had asked for 13 wins.
- **Cause:** `nextReviewNeeds` at `jobSecurity.ts:250` mins against `floorCap` only, not `patienceCap`. It also assumes the money goal is met exactly.
- **Fix (S):** Include `patienceCap(og, met ? post.target : 0)`. When only the postseason gets there, say "the play-in, whatever your record".

**F6. A season's win target can be held 14+ wins over the owner's own read. P1**

- **What the screen said** (Wizards, Hard, season 3, `out/ui_hw.txt`):
  - Preseason: "Win about 30 games / His read of the roster: 13 wins".
  - Opening night: "Win 30 games / His read: 16 wins".
  - Rule quoted: "Last season I asked for 33 wins. A roster that got worse on your watch doesn't lower the bar by more than 3."
- **Cause:** `WIN_SLIDE` (`ownerGoals.ts:631`) bypasses `FLOOR_MARGIN`, so the round-2 "16-win read, 35-win ask" pattern is back by another route. The wins goal is −85 to −100 before tip-off.
- **"On your watch" includes things you didn't do:** aging, stars walking in free agency, and the coaching budget all count.
- **Fix (S):** Clamp a held target to at most the read plus about 6. Name what got worse on his watch (trades and releases).

**F7. Swapping an inherited star for one on the same salary wipes the owner's sign-off on the tax. P2 (new trap)**

- **What I measured** (`swap.mts`, emulated user trade at opening night, Normal):

| Team    | Swap                            | Payroll goal            | Books judged          | Sign-off    |
| ------- | ------------------------------- | ----------------------- | --------------------- | ----------- |
| Nuggets | Jokić for Tatum (−$0.5M salary) | "on track", $1.1M under | +$35.3M → **−$23.2M** | $61.0M → $0 |
| 76ers   | Embiid for Tatum                | "on track"              | +$51.8M → **−$36.2M** | $86.3M → $0 |

- **Why it matters:** the two money stories disagree again. The goal says "Add nothing" and you added nothing, but the books head to a warning or ultimatum.
- **Cause:** `allowedThisSeason` uses `forcedPayroll(now)` (`books.ts:113`), and it still signs off on the inherited salary past his line (round-2 F6).
- **Fix (S):** Freeze the sign-off at opening night's figure, reduced only by salary added on net. Show it on the trade screen.

**F8. Conceding a season is now dominated, but the staff still recommends it. P2**

- **What the call says:** "The staff's call: tell the owner now… rather than miss his playoff goal" (`calls.ts:974`).
- **The numbers:** conceding costs 10 standing at once. Pushing and missing a one-level goal costs 0.35 × weight 0.3 × season weight 0.4 ≈ 4 standing on Normal (≈ 5.5 on Hard). Conceding only pays when the goal is 3+ levels out.
- **This breaks the numbers rule:** the staff's lean isn't measured.
- **Test status:** my concede-vs-push runs didn't trigger (Minnesota went 49-33), so this is from the grading code.
- **Fix (S):** Compute both outcomes' expected standing from the forecast and lean on the better one, showing the number.

**F9. A met ultimatum keeps a perennially bad coach alive. P2**

- **What happened** (passive Kings on Normal, `out/passive_25_normal.txt`):
  - Results: 16, 24, 24 and 25 wins.
  - Standing: −62, −41, −26, −25.
  - Each season's ultimatum was "Win 24 games", met at 24-25. The +15 bonus (`ULTIMATUM_MET`) offsets the rebuild clock's −20/season.
- **Steady state:** about −42 until the cap reaches −100 in season 6+.
- **Why it matters:** "Warm seat 37–38" for four straight lottery seasons on Normal. The road doesn't really run out.
- **Fix (S):** Scale the bonus with the ask's difficulty, or give it once per tenure.

**F10. Cutting all three budgets is free profit-goal points. P2**

- **What I measured** (`budget.mts`, two seasons, same seed):

| Team  | Profit, cut vs control       | Profit grade, cut vs control | Wins, cut vs control   |
| ----- | ---------------------------- | ---------------------------- | ---------------------- |
| Bulls | +$29.6M and +$15.3M a season | +87/+71 vs +13/+35           | 33/23 vs 25/28 (noise) |
| Nets  | +$17.3M and +$8.5M           | +58/+35 vs +15/−19           | 5–6 fewer each season  |

- **Why:** the target is set at standard levers (that closed round-2 F2), so going below standard banks the difference.
- **The owner never mentions gutting the medical staff.**
- **Fix (S):** Read the staff/facilities levers at the review (spending below standard isn't profit he asked for), or have him react to it.

**F11. The owner is indifferent to an empty arena. P3**

- **What happened:** with tickets at $250 the Wizards' arena ran 8–15% full for three seasons, and fans hit "Fed Up 1 of 100" (`shots/hw-s1allstar-owner.png`).
- **What it cost:** nothing on his payroll-goal reviews; even with budgets at 1 the season profited $25.9M (+58).
- **Fix (S):** Add an attendance or fan line to his check-ins, or a fan-mood term for a frugal or builder owner.

**F12. After a takeover, Today's season-review card still mixes two teams. P2 (round-2 F8, still open)**

- **What you see** (taking the Suns job, `out/ui_hw.txt` 13s):
  - "2028-29 · Season review · 15-67" (the Suns' record).
  - "Player of the season: AJ Dybantsa… Franchise record: 49 points by Trae Young" (Wizards players).
  - "The owner gives his verdict when the Finals end": he had already given it and fired me.
- **Fix (S):** After a takeover, show the season review of the job you left, or none.

**F13. Being fired is recoverable but cheap, and the offer cards still hide the job. P2 (round-2 F12, partly fixed)**

- **What happens:** fired at −51, you open the Suns job at "38 Warm seat" with fresh grace.
- **The offers show** "Rebuilding 15-67 · $222.1M payroll" and why the team called. They don't show owner type, projected books (−$8.4M) or your starting standing.
- **Finances on the new job says** "Owed to players you released": that's the previous coach's dead money.
- **Fix (S):** One meta line per offer. Also change "you released" to "released".

**F14. The Hard court edge is invisible in game UI. P2 (round-2 F17, still open)**

- **What I found:** nothing under `src/ui` reads `userCourtPoints`. Only the Settings table shows "−1 to −5".
- **Fix (S):** Add a pregame line such as "Hard: they play 2.4 better against you."

**F15. The team picker shows nothing about the job. P2 (round-2 F16, still open)**

- **What you see:** "76ers · 4th of 30 · 18 players · 3 to cut" (`out/` picker log).
- **What it should show:** owner type, ask vs forecast, payroll vs tax, starting books.
- **Fix (S).**

**F16. The Office hub still leads with cash. P2 (round-2 F15, still open)**

- **What you see:** "Finances · Cash $60.0M" (`Office.tsx:670`). The owner judges the books' close, not cash.
- **Fix (S):** Show "Books close −$X" on the hub row.

**F17. Setting a ticket price ends staff pricing for good. P3 (round-2 F14, still open)**

- **How:** `priceSet: true` (`Finances.tsx:396`), and there's no way back.
- **Fix (S):** Add a "Let the staff price" toggle on Finances.

**F18. Profit goals grade positive for passive play. P3**

- **What I measured:** the control coaches' profit grades averaged about +18 (n=21: +15, +13, +40, +34, +36, +56, +34…). The README claims an average of 0.
- **Fix (S):** Refit `PROFIT_EXTRA`.

**F19. The Owner page is over its complexity budget. P3 (round-2 F18, partly fixed)**

- **What you see:** six blocks (seat, ultimatum/books, pulse, goals, why-lines, past reviews), over the ≤5 budget. Pulse now shows the owner as a word ("Holding"), so the duplicate number is gone.
- **The help sheet leaves out** the "development year" option and the 3-win hold rule.
- **Fix (S).**

## 4. Since round 2

| Round-2 finding                           | Now                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| F1 inherited payroll failed on day 1      | **Fixed.** All 5 teams checked show "on track" with a +16 grade-if-final (`out/dead2.txt`); Minnesota shows "$0.6M under".      |
| F2 profit-slider exploit                  | **Fixed** (standard levers, `ownerGoals.ts:697`). New lever: F10.                                                               |
| F3 concede exploit                        | **Fixed, then overcorrected:** conceding is now dominated (F8). The exploit moved to "development year" (F4).                   |
| F4 Hard bad roster scripted, 0% ultimatum | **Fixed** (6-win floor margin; ultimatums at 25–31%). **Regressed by another route:** the 3-win hold rule (F6).                 |
| F5 targets vs forecast ±9–11              | **Fixed against the forecast** (±2.6 for all 30 teams on all three difficulties). The forecast itself is off at the tails (F1). |
| F6 sign-off cushion                       | **Still open**, plus a new swap trap (F7).                                                                                      |
| F7 Finances overlap                       | **Fixed** (`shots/hj-newjob_office_finances.png`).                                                                              |
| F8 mixed review card                      | **Still open** (F12).                                                                                                           |
| F9 re-sign spiral, "thrilled"             | **Still open and more extreme** (F3).                                                                                           |
| F10 "Steady 50" while goals behind        | **Fixed.**                                                                                                                      |
| F11 off-season line                       | **Fixed, but wrong when the rebuild cap applies** (F5).                                                                         |
| F12 firing cheap, offers thin             | **Partly fixed** (F13).                                                                                                         |
| F13 difficulty change buys grace          | **Fixed** (`graceLeft` counts each season on the difficulty it was played on; checked in code).                                 |
| F14 ticket trap                           | **Still open** (F17).                                                                                                           |
| F15 hub shows cash                        | **Still open** (F16).                                                                                                           |
| F16 picker                                | **Still open** (F15).                                                                                                           |
| F17 Hard edge invisible                   | **Still open** (F14).                                                                                                           |
| F18 duplicate number                      | **Partly fixed** (F19).                                                                                                         |
| F19 dominant season only "pleased"        | **Fixed in effect:** 71-11 and out in round 2 grades +44, "thrilled", though partly because the targets are low (F1).           |

New since round 2: F1 (forecast tails), F2 (strategy-label postseason goal), F4, F5, F6, F7, F8, F9, F10, F11.

## 5. What it would take to reach 9/10

1. **One honest bar per team (F1, F2, F6).** Calibrate the forecast's tails, set the postseason level by odds, and clamp held targets to the read. Then every team carries real but reachable pressure: the Thunder stop being a free "Secure", and the Kings stop starting under water. This is the biggest fairness gain.
2. **Money that can't be ignored (F3, F7, F10).** Scale the books ladder and the owner's tone with the size of the hole, freeze the sign-off at opening night, and judge budget cuts. Then "win at any cost" stops being free, and a salary-neutral trade stops being a trap.
3. **Staff leans that are measured (F4, F8, F5).** Price "development year", "rebuild" and "chase" in expected standing, and fix the next-review line. Then the advice holds to the game's own numbers rule, and nobody gets fired after being told "about 4 wins".
4. **Show the job before you take it (F13, F15, F14, F16).** Owner type, ask vs forecast and books belong on the picker and on offers, plus the Hard edge on the pregame card and "Books close" on the hub. Then players see the stakes before they're committed to them.
5. **Close the ultimatum treadmill (F9),** so that losing seasons on Normal eventually end a job.

## 6. What I couldn't verify, and how I tested

**UI (Playwright, phone viewport, profiles of my own):**

- **Wizards on Hard, run into the ground:** every budget at 1 and tickets at $250. Three seasons through the floor calls, two ultimatum moments, verdicts, the firing and the job offers. Took the Suns job: hired moment, Today, Owner, Finances, Career.
- **Hornets on Normal, played straight:** two seasons, with the verdicts "Good +29" and "As expected +1".
- **Timberwolves on Hard:** opening night (Owner, Today, odds).
- **Also:** the new-league difficulty table, Settings, the team picker and the Office hub.

**Headless (`harness.mts`, about 35 runs, roughly 60 simulated seasons):**

- **Targets vs forecast:** every team at each difficulty, with each goal's chance (`targets.txt`, `targets2.txt`).
- **Passive coach for 4–5 seasons:** Thunder on Hard, Kings on Normal and Hard, Wizards on Hard, Bulls on Easy and Hard.
- **Forecast calibration:** 10 league-seasons (`calib_*`).
- **Lever tests:** budget cut vs control, ease vs chase, concede vs push (didn't trigger), ultimatum reachability, the inherited-salary swap, and the opening-night payroll check.

**Caveats:**

- **The harness re-signs everyone rated 72+ at his ask,** which drives the Thunder's payroll blow-up.
- **One seed per lever test,** so the budget cut's cost on the court is within the noise.
- **The concede verdict is from the grading code,** not a run.
- **Not seen in the UI:** a budget freeze, a final warning or a books-sack.
