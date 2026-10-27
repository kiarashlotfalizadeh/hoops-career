# Game-day review, round 3 (lens `game-day`)

All my files are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/game-day/`:

- `shots/`: screenshots
- `logs/`: watched-game logs
- `runs/`: headless output
- Scripts: `policy.mts`, `truth.mjs`, `d0.mjs`, `late.mts`, `counter.mts`, `planplacebo.mts`, `analyze.mjs`

The repo is untouched (`git status` is clean). The machine was heavily loaded for the first hour (load average 46 to 57), so all timings below were taken under load.

## 1. Verdict

Game day has crossed a line since round 2: **the bench now talks, and what it says is true.**

- **How often:** headless, the staff made **1.10 measured calls a game** over 144 paired games. 103 of the 144 games had at least one call.
- **How true:** on 155 calls, each re-measured on 800 fresh seeds, the shrunk number on screen averaged **+0.79**. The true worth averaged **+0.86 ± 0.06** by shot value and **+0.94** in points.
- **It beats a guess:** the bench's own unmeasured first draft is worth **−0.37 ± 0.07**. So the measuring is what makes the advice worth taking.
- **The play call holds up:** the late play call is still the best moment in the game. Touchline changes are now measured from the spot after you make them.

What holds it back:

- The live voice is front-loaded. 45% of calls come in Q1 and 13 of 144 games had a Q4 call. Crunch time is still mostly the last-possession call or nothing.
- A persistence bug silently erases the debrief's verdict on your moves after a reload.
- Pacing defaults are unchanged: 1×, Key plays off, clutch skips into blowouts, and play calls are offered at 99%.
- On a slow phone, the 12-second budget probably cuts calls by about 40% (this is a headless estimate, not tested on a device).

**Score: 7.5/10** (round 2: 6.5). Honesty and agency are now genuinely FM-plus. The pacing and crunch-time experience is still below 2K coach mode.

## 2. What's genuinely great (protect these)

- **A measured, calibrated live voice** (`calls.ts` → `liveWorth.ts measureCalls`). It screens 64 replays, confirms on 320 fresh ones, shrinks with `CALL_SPREAD` 0.6, and shows where it measured from.
  - Calibration by kind: Pressure the ball (41 calls) shown +0.88, truth +1.11. Drop on ball screens (35) shown +0.83, truth +1.09. Stay home (21) shown +0.76, truth +0.74. Double (15) shown +0.56, truth +0.59.
  - Only 1 of 155 calls was truly below even beyond its noise.
  - Placebo/control: all 865 drafted changes averaged −0.09. The "man-to-man" draft averaged −0.88 ± 0.13. The measurement, not the drafting, is what earns the gain.
- **"None clears the noise. Nothing to change."** The bench says this honestly at most breaks. One example: "Measured 5 changes from halftime: none clears the noise" (`shots/g1-stop-2.png`).
- **The late play call.** Over 137 last-possession spots (400 replays shown, 1,600 fresh as truth):
  - Taking the top-sorted option is worth **+4.1 to +4.7** points of win chance, against an oracle best of +4.5 to +5.1.
  - A green "+X% to win" reads +8.6 to 9.0 against a true +7.4 to 8.1.
  - Seen live in g1: down 2 with 5.5 s left, "Elevator: Bane +9%". Bane tied it, ORL won in OT, and the story read "The Elevator you called for Bane tied it with 1 second left in regulation" (`shots/g1-stop-10.png`, `shots/g1-final-full2.png`).
- **Touchline changes measured after you commit.** Example: "Your change (Mentality: Balanced → Very aggressive), from the end of Q1: too close to say (0.0, ±0.4). 320 replays each way", with Reset (`shots/g3-touch-full.png`).
- **The debrief judges late calls by win chance.** Example: "Your call: +10% to win tonight, measured (about ±4%)", even in a 1-point loss (g4).
- **Luck is named as luck at every break.** Example: "The Hawks' shots didn't fall… luck: nothing to change for it". Unmeasured advice is labelled "The staff's read … not measured against NYK".
- **The broadcast package and the final card.** The final card now carries your coaching: the debrief, your moves, and a story that names your call.

## 3. Findings (most severe first)

**1. The night's "Your moves were worth…" verdict disappears after a reload, and the season tally undercounts. P1 (bug, honesty)**

- **What happens:**
  - g2 showed "Your moves: too close to say tonight (+0.5, about ±0.9)" and g3 showed "(−0.3, about ±0.9)".
  - After a reload, both reports show the moves with no verdict (`shots/rep-24.png`, `shots/rep-39.png`).
  - The store holds `movesWorth: null` for gids 24 and 39 but keeps it for 11 and 67 (`mw.mjs`).
  - The season line read "+0.9 points over 3 games" after 5 coached games.
- **Cause:**
  - `tonight.ts:49` writes `movesWorth` into an already-saved result.
  - `persistence.ts:223-224` rewrites a stored result only when its play-by-play flag changes.
  - Nights with early moves take longer to replay, so they land after the save and are lost. Late-only calls (g1, g4) landed in time.
- **Why it matters:** the one paired verdict on your coaching vanishes, and the Career row and season line read low.
- **Fix (S):** mark the game dirty when `movesWorth` lands, for example by tracking a revision per game in `Synced`.

**2. Crunch time is still mostly silent. P1 (agency where it matters)**

- **Headless:** calls by period were Q1 53, end of Q1 17, Q2 30, half 15, Q3 23, end of Q3 6, Q4 14. 13 of 144 games had any Q4 call. There were 0 timeout calls and 0 sub calls.
- **Watched:**
  - g1: a 17-point Q4 lead became a 17-4 run. At every stop the bench said "Measured 5 changes from Q4 5:50 / 2:49: none clears". Nothing stopped the game until the last possession.
  - g3 (down 4 at 2:09) and c2 (a 12-point lead lost by 4) never stopped at all.
- **Why it matters:** a close finish is where watching should beat quick sim. Right now the only crunch decision is the last-possession play.
- **Fix (M):**
  - In crunch time, measure win-chance calls at every dead ball.
  - Re-admit the timeout and sub drafts there (with staff subs on, `calls.ts` drafts subs only when `manualSubs`).
  - Show "none clears" as an explicit beat, so silence reads as a judgement and not an absence.

**3. On a slow phone the live voice likely goes quiet again. P1 (mobile-first; headless estimate)**

- **Evidence:** I ran a worst case of the device floor (`CALL_SCREEN_MIN` 16 and `CALL_CONFIRM_MIN` 96 at every stop, `liveWorth.ts:211-213`) on the same seeds. Calls fell from **0.53 to 0.33 a game** (36 paired games); unpaired, 0.28 a game over 47 games.
- **Context:** desktop needs about 8 s at Q1's end (from the README). A mid-range phone at 3 to 4× slower hits the 12 s cap at most early stops.
- **Fix (M):**
  - Measure ahead during play: start the stop's drafts a possession early, and give breaks a longer budget, since the game is paused there anyway.
  - Profile on a real mid-range Android.

**4. The win chance shown beside a margin call is overstated by about 1.7×. P2 (numbers rule)**

- **Evidence:** on 28 calls whose banner also showed a win chance (for example "+0.7 to the margin (±0.4), **+8% to win**", g2 Q1), the shown value averaged **+7.4%** against a true **+4.3 ± 0.6%**.
- **Cause:** `readingLine` (`calls.ts:212`) prints the raw `r.win`, unshrunk, and prints it only when it clears 2 SE. That is selection on noise.
- **Fix (S):** shrink the win figure as the margin is shrunk, or drop it for margin-judged calls.

**5. Pacing defaults are unchanged. P2 (round-2 #10, still open)**

- **Measured times:**

| Setting                                      | Live time for one game              |
| -------------------------------------------- | ----------------------------------- |
| 1× (default, `create.ts:155`, Key plays off) | 15.4 min (g1, with OT, under load)  |
| 2×                                           | 6.1 to 6.7 min                      |
| 4× with Key plays                            | **1.0 min** (po2 Q1 opened at 5:29) |
| Clutch skip from the tip                     | about 0.8 min                       |

- **Fix (S):**
  - Default to 2×.
  - Automatically slow close finishes to 1×; the "Always" option already exists but is buried in a 9-second toast.
  - Show the Key plays state on the scorebug.

**6. Clutch skip lands in decided games. P2 (round-2 #8, still open)**

- **Evidence:** c3 landed at 97% and c4 at 98%; c2 landed at 89% and became a loss. `skip.ts:25` offers "Clutch time" without checking whether the game is still close (`closeGame`).
- **Fix (S):** skip to the final when the game is decided, and offer a "Sim to final" chip above about 98%.

**7. The late play call is offered in decided games. P2 (round-2 #9, still open)**

- **Evidence:** g2's Q4 timeout at >99% showed 4 options, all "Too close to say", after 400 replays. The condition is `PeriodReport.tsx:436` (`late = kind==='last' || q>=4 && clock<=CLUTCH_SEC`).
- **Fix (S):** gate it on `closeGame`.

**8. The first-game coach mark persists for weeks and covers the staff-call banner. P2**

- **Evidence:** "1/3 Tap the court for speed and Skip ahead" was still up in g1 Q2 (`shots/g1-t3.png`). In profile 2 it was still up in **playoff Game 1**, sitting on top of "Staff call Man-to-man" (`shots/po1-followed-5.png`).
- **Fix (S):** auto-advance it after a few seconds and draw it under the banners.

**9. Ignored calls repeat as banners. P3**

- **Evidence:** in g1, "Stay home on shooters" was bannered 3 times in Q1. In po2, "Pressure the ball" was bannered 4 times.
- **Cause:** only tapping × declines a call (`useStaffCall.ts:82`).
- **Fix (S):** treat an un-taken call as declined for `DECLINED_TRIPS`, or skip the banner when the same draft was bannered recently.

**10. Starters still log heavy minutes in playoff blowouts. P2 (round-2 #7, partly)**

- **Evidence:** po2 was a 33-point win, up 20 after three at >99%. Tatum, White and Pritchard each played 39 minutes, and the break report listed "Pritchard 30% energy". In po1 they played 40, 41 and 40. Regular-season blowouts were fine (g2: 34 to 36).
- **Fix (S):** have playoff garbage time follow the same blowout rule.

**11. The verdict line can blame "their game plan" for your own setting's cost. P2**

- **Evidence:** g3's headline was "A 4-point loss. Their game plan won it." Its top factor was "The Knicks won second chances off the zone's loose box-outs… Your zone defense won 15.1 back". That is my own zone's trade-off, net positive, not NYK's plan.
- **Cause:** `debrief.ts:254` maps the `tactics` category to "Their game plan".
- **Fix (S):** skip edges whose own setting net-won, or say "Our zone's glass cost us".

**12. The static `CALL_WORTH` table contradicts the live measurements. P3**

- **Evidence:**
  - "Stay home" is banned as a Next-time fix (`callWorth.ts:62`, −0.5 ± 0.47 on 14 calls; `labelCosts`, `debrief.ts:69`).
  - Yet the live staff called "Stay home on shooters" 21 times with a true worth of +0.74.
  - A fresh paired measurement had it at +1.85 ± 0.32 for ORL vs UTA (`runs/counter2.log`).
- **Fix (S):** retire the round-2 table in favour of the live measurements, or re-measure it.

**13. The live voice never feeds the next game. P3 (opportunity)**

- **Evidence:** "Pressure the ball" and "Drop on ball screens" clear in game after game (76 of 158 calls). The pre-game counter "Turn up the pressure" reads "About +4.1 a game" against UTA, and my re-measure found +2.9 ± 0.3. Yet the debrief never says "measured three nights running: make it your default?"
- **Fix (M):** add a debrief "Tonight's calls" row that sends a repeat call through `counterWorth` for the next game.

**14. Two voices on the bench. P3**

- **Evidence:** measured calls sit next to textbook banners with no number, such as "Beat zones with Motion & cuts (Instructions > In possession > Play through)…" and "Shorten stints (Rotation), or raise 'Sub out tired players at' (Tactics > Match)" (the latter while 20 up).
- **Fix (S):** fold these into the reads list, or drop the banners.

**15. Small copy and labels. P3**

- "0.00 before" baselines on a few trips: "Help defense: Balanced → Stay home · MIN 0.93 a trip since (101 trips), 0.00 before". The cause is `moves.ts:326`, which has no minimum like `MARGIN_MIN_BEFORE`.
- "Q4 6.0" for 6 seconds reads like 6:00.
- "too close to say (+10% to win, about ±5%)" (g1) reads as clear; it is a rounding edge.
- "Measured from Q3 5:50" appears while the scorebug shows 6:03, because the sim runs one possession ahead.
- "3 more threes than them (6-11)" is still ambiguous.
- "Today · Home" still sits over the away half.
- An injured "Hart · bench" is still listed.
- The watch pick never changes (McCollum all night while Alexander-Walker led ATL).

**16. Cross-lens, sim-credibility.** ORL free-throw edges were lopsided again: g1 30 FTA vs 6, the quick-simmed BOS game 33 vs 7 (personal fouls 23 vs 10), po1 BOS 12 vs ORL 8. Zones are common defaults (ORL, BOS, NYK).

## 4. Since round 2

| Round-2 finding                          | Now                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| #1 Silent assistant (0.047 calls a game) | **Fixed.** 1.10 a game, calibrated (above). Open: crunch time (#2) and phones (#3).                                       |
| #2 Touchline levers blind                | **Partly.** Measured after commit, with Reset. Still no number before you choose.                                         |
| #3 Working labels biased                 | **Fixed.** `MovesList` shows no verdict. Placebo on the plan-grade "it showed" rule: 12 of 2,957 null judgements (0.41%). |
| #4 Quick-sim "+0.5" claim                | **Fixed.** The copy now says "About even". Headless: +0.67 ± 1.02 pts, −0.12 ± 0.73 by shot value.                        |
| #5 Late call graded by points            | **Fixed.** Graded by win chance.                                                                                          |
| #6 One-taps contradict the measurements  | **Mostly fixed.** Unmeasured fixes are labelled "the staff's read". New inconsistency: #12.                               |
| #7 Starters' minutes                     | **Partly.** Fine in the regular season, not in playoff blowouts.                                                          |
| #8 Clutch skip                           | **Open.**                                                                                                                 |
| #9 Play call when decided                | **Open.**                                                                                                                 |
| #10 Pacing                               | **Open.**                                                                                                                 |
| #11 Watch pick                           | **Open.**                                                                                                                 |
| #13 Coach mark                           | **Open, and worse:** it now covers the call banner.                                                                       |
| #14 Final card shows coaching            | **Fixed.**                                                                                                                |

**New since round 2:** the `movesWorth` persistence loss (#1), the win-chance overstatement (#4), repeat banners (#9), the two-voice bench (#14), and the phone budget risk (#3).

**README claim:** "+2.2 ± 0.7 points and +11 ± 3% win a game" from taking calls. My paired game-level result was +1.74 ± 0.79 pts and +7.6 ± 3.7% win (but only +0.17 ± 0.62 by shot value). The much tighter per-call truth implies about **+1.0 pt and +2.8% win a game**, so +11% overstates it by about 4×. This is documentation only; it is not shown in the app.

## 5. What it would take to reach 9/10

1. **Make crunch time the event.**
   - Win-chance calls at every dead ball inside `closeGame`, with timeout and sub drafts.
   - Auto-slow to 1×.
   - Gate the play call and the clutch skip on closeness.
   - Impact: the close finish, the moment players remember, becomes a run of real, measured decisions.
2. **Fix the persistence bug and keep the verdicts.** Impact: coaching worth adds up across a season, and Career's record is honest.
3. **Make the voice phone-proof.** Measure ahead in a buffer, and give breaks a longer budget. Impact: the main new feature survives on the actual target device.
4. **Pacing defaults.** 2× by default, and the coach mark auto-dismissed. Impact: a watched game takes 6 minutes, and nothing covers the bench.
5. **Close the loop.** Shrink the win-chance numbers, and carry repeat calls into the next game's plan. Impact: the honest numbers turn into learning across games.

## 6. What I couldn't verify, and how I tested

**UI** (Playwright, 390×844, my own profiles):

| Games                   | Setup                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| ORL g1                  | 1×, defaults, OT win with a last-possession call                             |
| g2                      | 2×, following calls, Q4 timeout                                              |
| g3                      | touchline change, 4-point loss                                               |
| g4                      | "Let the staff make tactics calls", 1-point loss with a last-possession call |
| BOS playoff R1 G1 (po1) | 2×, following calls                                                          |
| BOS playoff R1 G2 (po2) | 4× with Key plays                                                            |
| c2 to c4                | clutch skips                                                                 |

- 3 quick sims.
- Routes: `/games/:tid` (Preview, Scout, Plan, Matchups), `/live` (Staff, Game plan, breaks, huddles, Skip sheet, clutch offer) and `/game/:gid`.
- I used `window.__hc` only to read results and gids.

**Headless:**

| Script                     | What it measured                       | Size                        |
| -------------------------- | -------------------------------------- | --------------------------- |
| `policy.mts`               | ignore / quick / follow / rules        | 144 paired games, 24 teams  |
| `policy.mts` (truth mode)  | each call re-measured                  | 155 calls × 800 fresh seeds |
| `policy.mts` (draft0 mode) | every drafted change                   | 865 drafts                  |
| `policy.mts` (phone mode)  | worst-case device budget               | 47 games                    |
| `late.mts`                 | late play call                         | 137 spots                   |
| `planplacebo.mts`          | plan-grade "it showed" rule            | 2,957 null judgements       |
| `counter.mts`              | ORL vs UTA counters                    | 1,000 paired games          |
| `probe2.mjs`               | measure timing against the drawn clock | —                           |

**Not verified:**

- Real-device timing (the phone figure is a floor simulation).
- The fifth-foul and closer stops, and crunch-time sub measurement, which need manual subs.
- Landscape, haptics, and the GAME WINNER flash.
- Game-level follow vs ignore stays noisy at 144 games; I leaned on the per-call truth instead.
