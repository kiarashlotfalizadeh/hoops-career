# Game-day review, round 2 (lens `game-day`)

My working files are in `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/game-day/`. Screenshots are in `shots/`, logs from watched games in `logs/`, and the headless scripts are `policy.mts`, `late.mts`, `placebo.mts`, `nightcheck.mts` and `adjcheck.mts`, with their JSON and log outputs beside them. All paths below are relative to that folder. The repo is untouched: `git status` is clean.

## 1. Verdict

Game day is more honest than in round 1, and it has one great moment. Following the staff no longer costs you points, and the hot-hand call is gone. The late play call is measured, sorted best first, and in practice wins games. The debrief's paired "Your moves" line is well calibrated.

The price is that the in-game assistant has almost nothing left to say:

- **Headless:** over 360 paired games it made **0.047 actionable calls a game**. Only 17 of the 360 games had any call at all.
- **Watched (ORL, six full games):** it said "Nothing the staff would change right now" for every possession it showed, including a 43-25 playoff third quarter. It made zero calls.
- **Where the real choices are:** the touchline levers really move games (±1-3 points), but they are blind. Before you commit, the only measured numbers are on the last-possession play call, and on subs in crunch time if you run the subs yourself.

Feedback is mostly honest, but four places break the owner's rule on numbers:

- The live "Working" verdicts are biased toward "Working".
- The +0.5 claim for quick sim's assistant doesn't reproduce.
- A game-winning call that the huddle said was "+9% to win" is graded "too close to say" in the debrief.
- The debrief offers one-tap counters that the staff's own measurements call costs.

**Score: 6.5/10.**

- Honesty: up from round 1.
- Presentation: 8/10.
- Agency: thinner than round 1. The reason to watch instead of quick sim is the broadcast, plus about one close last possession every seven games.

## 2. What's genuinely great (protect these)

- **The late play call, measured.** Across 133 last-possession spots (`late.mts`, `late.log`):
  - Taking the option the huddle sorts first (`PeriodReport.tsx:370`) gained **+4.4 ± 0.4 points of win chance**. The best possible pick gains +4.6.
  - The closer's isolation is worth **−0.5 ± 0.1**, and the sets +3.5 to +3.6.
  - Seen live: "Last possession · Tied at 139, 23.8 left · Elevator: Joe **+9% to win**" (`shots/lp8-stop-2-full.png`). I called it, Joe hit it, and the story read "Joe put them ahead with 3 seconds left, on the Elevator you called for him."
  - That is FM-grade drama with an honest number.
- **The night's moves, replayed (`nightWorth`) is honest.** On 36 coached nights with three ordinary changes (`nightcheck.mts`):
  - The standard error is about ±0.74.
  - The shrunk reading lands within 0.35 of a 1,000-replay reading.
  - The 9 "clear" nights all had the right sign.
  - In play it reads "Your moves: too close to say tonight (+0.2, about ±0.3) … The rest of the game from the first move, played 200 times", plus a season line.
- **Following the staff no longer hurts.**
  - `follow` scored **+0.00 ± 0.05** pts and `auto` the same, over 360 pairs (`pA.json` and `pB.json`). Round 1 measured −0.83.
  - The hot-scorer call is gone.
  - `callHold` blocks calls in decided games and in the last 24 seconds.
- **Luck told as luck**, and the plan graded on measured worth:
  - "Ice coverage · Tonight: ATL pick-and-roll 0.67 a trip on 15 trips · Worth +0.5 a game" (`shots/g1-final-full.png`).
  - When no counter measures as a gain, the staff says so: "By the staff's numbers, none of its counters beats how you play them now." (playoff preview, `logs/po1.log:2`).
- **The broadcast package.** The scorebug in team colours, the To-win bar, the ticker of other scores, run callouts ("Magic on a 12-2 run · Kia Center is on its feet", `shots/g2-view-Gameplan.png`), the clutch "Watch at 1×" offer, and the highlights reel.

## 3. Findings (most severe first)

### 1. The in-game assistant is effectively silent. P0 for the owner's "big in-game assistant role"

**What the player sees:** an assistant who never asks for anything. In my six ORL live games (g1 to g5, po1) there were zero decision cards. In playoff Game 1, ORL lost the third quarter 43-25, and the bench said "Nothing the staff would change right now" for the whole quarter (`logs/po1.log:29-47`).

**Evidence:**

- **Headless, during play** (`policy.mts`, `LiveGame` driven with `staffNotes` as the Live screen does it, 6 teams, 360 paired games): 0.047 calls a game. Only 17 of the 360 games had any call.
- **Adding the break-report fixes** under "What's deciding it" (`pC.json`): 0.16 a game, worth +0.07 ± 0.22.
- **Why it's so quiet:**
  - `CALL_WORTH` drops 10 of its 16 measured kinds.
  - `callCosts` (`src/core/analysis/callWorth.ts:90`) drops a call when its raw mean is below zero, with no test of whether that is more than noise. Examples:
    - "Sprint back" at −0.1 ± 0.25 on 13 calls (line 61).
    - "Stay home" at −0.5 ± 0.47 on 14 calls (line 60).
    - "cold" at −0.1 ± 0.13.
  - Meanwhile "run" at 0.0 is kept.
- **With staff subs (the default), the game never stops for a call** except the last possession (`useLiveGame.ts:899`). That spot came up in 133 of about 960 headless games, roughly 14%.

**Why it matters:** the coaching half of watching is missing. A player learns that the assistant has nothing for them.

**Recommendation (M/L):** replace the static table with live measurement.

- At each break, and after a run, have the staff take its 3 to 5 candidate changes and score each with `measureChoices` from the current spot. The machinery already exists in `state/liveWorth.ts`: 200 to 400 replays in the worker.
- Propose the best one only if it clears its noise, and show the number.
- "Let the staff make tactics calls" then means "take it".

### 2. The touchline levers are real but blind. P1

**Evidence:** three ordinary changes (a different coverage in Q2, more threes in Q3, a slower pace in Q4) were measured over 1,000 replays per night. Their true worth ranged from −2.5 to +2.8 points (`nightcheck.mts` output). The Game plan tab offers Tactic A/B/C, five mentalities and "Stay home / Balanced / Pack the paint" per play type, with familiarity but no worth (`shots/g2-view-Gameplan.png`).

**Why it matters:** this is where the user's agency actually lives, and it is a guess. Pre-game counters and the late play call show numbers; mid-game changes don't.

**Recommendation (M):** when a change is made on the Game plan tab, measure it from the spot with the same machinery ("From here: about +0.6 (±0.4)"), the way the play call is measured.

### 3. "Working" verdicts on live moves are biased toward "Working". P1 (owner's rule)

**Evidence:** placebo test (`placebo.mts`, 400 games).

- At the moment the bench's trigger fires (one of their play types hot: at least 12 trips, z > 2), I changed **nothing**, then judged the rest of the game with the move-verdict rule (`moves.ts:351`, `MOVE_Z` 2).
- Result: **17 of 69 read "Working", 0 read "Not working"** (28 were too short to judge).
- The cause is regression to the mean: a move made after a hot stretch looks good afterwards even if it did nothing.
- The labels are in `StaffCards.tsx:71-72`.

**Why it matters:** "it worked" may only come from a paired counterfactual. This label tells players that useless moves work.

**Recommendation (S):** drop the Working and Not working labels. Show the rate since the move ("0.81 a trip since, 1.33 before") without a verdict, and let `nightWorth` give the verdict.

### 4. The quick-sim assistant's "+0.5 a game" doesn't reproduce. P1 (a number shown before a choice)

**What the player reads:** the Tactics toggle says "Measured over 17,280 games played both ways: worth about +0.5 points a game" (`CrunchTimeCard.tsx:102`).

**Evidence:**

- I ran 6,320 paired games across 20 teams, each team's first 10 to 12 games, injuries on. The assistant made 0.6 adjustments a game, so the hook does fire (`adjcheck.mts`).
- Result: **−0.09 ± 0.15** pts, −0.04 ± 0.11 by shot value, and −0.4 ± 0.6 percentage points of win chance (`pQ.json`, `pQ2.json`).
- The claim is about 3 standard errors away from my result.
- The code's own note (`coach.ts:22-24`) admits that "by shot value both read below even".

**Recommendation (S):** re-measure with injuries on and the current engine, then fix the copy (most likely "about even"). Live games then lose nothing relative to quick sim, and the copy should stop implying they do.

### 5. The debrief grades a game-winning call as "too close to say". P1

**Evidence:** in lp8 the huddle showed "Elevator: Joe +9% to win", and the call won the game. The debrief then read "Your moves: too close to say tonight (+0.2, about ±0.3)" (`logs/lp8.log:41`). `nightLine` (`debrief.ts:395-400`) judges only by points of margin. It never reads `MovesWorth.win`, although `CallWorth` already judges late calls `by: 'win'`.

**Recommendation (S):** when the moves came in crunch time, judge and print win chance ("Your call: +9% to win, measured").

### 6. The debrief's one-tap "Next time" advice contradicts the staff's own measurements. P1

**Evidence:**

- **Stay home.** g5's debrief offers a **"Stay home: vs TOR"** button with no number (`shots/g5rep-recap.png`). The bench dropped "Stay home" as a measured cost (`callWorth.ts:60`), and the sim assistant skips "staying home on shooters" because it "cost 3.4 a game" (`coach.ts:22`).
- **Slow their star.** The same debrief says "Slow their star … double him" right next to a card saying the shots that beat us were luck. The star row is still in the post-game list ("−6.5 Quickley erupted for 35").
- **Hedge.** The preview's "Hedge coverage · Worth +0.6" (g3) sits beside Tactics copy saying the assistant never makes Drop-to-Hedge changes.

**Recommendation (S-M):** offer a debrief patch only after `counterWorth` has measured it against that opponent, or label it "the staff's read". Drop star rows from "what decided it".

### 7. Starters are run into the ground, and the call that would rest them was dropped on a margin-only measurement. P1 (shared with sim-credibility)

**Evidence:**

- In g2 Suggs played **45 minutes** in a game ORL led by 27 and won by 12. Wagner and Carter Jr. each played 39 (`mins.mjs` output).
- The huddle at Q4 4:51, up 15, listed "Suggs 28% energy" (`logs/g2.log:184`).
- Below 60% energy, injury risk is ×1.6 (`rotation.ts:276`), and wear builds every minute played (`games.ts:540`).
- The rest-the-starters call (`garbage`, −2.3, `callWorth.ts:54`) was dropped on margin alone. That measurement prices neither injury risk nor wear.

**Recommendation (S):** price injuries and wear into that measurement, or bring the call back. Define crunch time with `closeGame`; round 1's F5 is still open.

### 8. Dead air in decided games. P2

**Evidence:**

- Skip to clutch landed with one side at 90% or more in **6 of 10** tries (lp2, 3, 4, 5, 8, 10; `skip.ts:24` checks nothing about the score).
- g1's fourth quarter at 99% played out in full: about 3 minutes at 1×, with nothing offered.

**Recommendation (S):** "Clutch time" should stop only if the game is close, and otherwise go to the final. Above 98%, show a "Sim to final" chip on the court.

### 9. Late huddles before the last possession are noise, even in decided games. P2

**Evidence:** every Q4 timeout huddle I took (g2, g3, g4, g5, po1) read "Too close to say" on every option. The call was also offered at >99% (`shots/g2-stop-7-full.png`, po1 down 20).

**Recommendation (S):** offer the play call only inside `closeGame`. Keep the clean version for the last possession and the final two minutes.

### 10. Pacing presets. P2

| How                                                    | Real time per game |
| ------------------------------------------------------ | ------------------ |
| 1× (still the default, `create.ts:152`, Key plays off) | about 12.5 min     |
| 2×                                                     | about 6.4 min      |
| 2× + Key plays                                         | about 1.9 min      |
| 4× + Key plays                                         | 63-68 s            |

- In g4, at 4× with Key plays, a 1- to 4-point finish went from Q4 3:05 to the final in about 13 s. The clutch offer stays up only 9 s (`Atmos.tsx:41`).
- The Key plays setting carries silently from game to game.

**Recommendation (S):** default to 2×, slow close finishes to 1× automatically, and show the Key plays state on the scorebug.

### 11. "Who to watch" ignores the night. P3

**Evidence:**

- The preview's pick is watched all game: McCollum while Johnson leads ATL (g1), and Leonard while Barnes has 22 at the half (po1).
- In g2 the preview's pick (Ball) differed from the key ("Make Edwards work").

**Recommendation (S):** after the first quarter, watch their top scorer, or the key's player.

### 12. Copy and labels. P3

- "5 more threes than them (6-8)" is ambiguous; say "6 of 8".
- The Timeout row reads "ORL 11-11 since (0)", which is cryptic.
- The huddle lists "Carter Jr. 100% energy · 4 fouls" as foul trouble in Q4, below the limit (`logs/g4.log:29`).
- "Today · Home" still sits over the away team's half of the preview hero (`shots/08-preview.png`).
- The compact report board truncates names to "M.." and "O.." (`shots/g2rep-flow.png`).

### 13. The first coach mark never leaves. P3

"1/3 Tap the court for speed and Skip ahead" stays over the bottom of the court until it is tapped (`shots/g1-t4.png`, `shots/lp1-clutchoffer-1.png`). It should fade after a few seconds.

### 14. The final card and flow chart don't show your coaching. P3

The live final card is the same as quick sim's (`shots/g1-final.png`, `shots/qs-3-toast.png`). The flow chart doesn't pin your moves (`shots/g2rep-flow.png`). Round 1's F17 and F18 are still open.

### 15. Game billing is still thin. P3

g2 was billed "Milestone watch: Banchero needs 3 rebounds for 2,000 in his career" (`shots/g2-pre.png`), and the next game a "Revenge game".

### 16. Cross-lens, sim-credibility: three of the six games were decided at the line

- po1: personal fouls ORL 31, TOR 19; free throws 12-23 vs 35-41.
- g3: personal fouls NYK 32, ORL 17.
- g4: free throws 15-17 vs 24-30.

Each time the staff could only say "Not from how physical you played".

## 4. Since the first review

| Round-1 finding                                     | Status now                                                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 Following the bench loses games                  | **Fixed.** Measured +0.00 ± 0.05; the hot-hand call is gone. Over-corrected into silence (finding 1).                                               |
| F2 Quick-sim adjustments cost points                | **Changed, still not right.** Now about 0 (−0.09 ± 0.15), but the copy claims +0.5 (finding 4).                                                     |
| F3 Late play call offered blind                     | **Fixed.** Measured and sorted; gains 4.4 of a possible 4.6 points of win chance. Protect it.                                                       |
| F4 Can't tell whether coaching mattered             | **Mostly fixed.** `nightWorth` is calibrated. Open: late calls are judged by points (finding 5); before/after verdicts are biased (finding 3, new). |
| F5 Crunch time ignores the score                    | **Still open** (finding 7).                                                                                                                         |
| F6 Calls fired in decided games or the last seconds | **Fixed** (`callHold`, `LEVER_TRIPS`). The play call is still offered when decided (finding 9).                                                     |
| F7 Clutch skips land in blowouts                    | **Still open:** 6 of 10.                                                                                                                            |
| F8 Huddle pointed to an unreachable screen          | **Fixed:** the saved after-timeout play is shown read-only.                                                                                         |
| F9 Keys' pace projection noisy                      | **Partly.** The pace still shows from about the 6-minute mark; "On track" still shows before the tip.                                               |
| F10 Star rows in "what's deciding it"               | **Partly.** Gone from live breaks, still post-game with "double him" advice.                                                                        |
| F12 Stop-call sheet without a comparison            | **Partly.** Subs are measured in crunch time, but only with manual subs.                                                                            |
| F16 Pacing defaults                                 | **Still open:** 1×, Key plays off.                                                                                                                  |
| F17 / F18 Final card and flow chart                 | **Still open.**                                                                                                                                     |
| F19 One "watch" pick                                | **Still open.** Tip off still allowed while measuring, but now labelled with the percentage.                                                        |
| F21 Labels ("Today · Home")                         | **Still open** for the home label.                                                                                                                  |

**New this round:** the near-silent bench (1), the biased Working labels (3), the overstated quick-sim claim (4), the debrief's points-only grading of late calls (5), and one-tap advice contradicting measured costs (6).

## 5. Top 5 moves

1. **Give the bench a measured voice.** At each break and after runs, measure 3 to 5 candidate changes from the current spot with `measureChoices`, and propose the best one that clears its noise, with its number. Impact: the assistant speaks 3 to 5 times a game, honestly, and "Let the staff make tactics calls" means something.
2. **Measure touchline changes before they're committed,** using the same machinery. Impact: the ±1-3 point levers stop being guesses.
3. **Fix the feedback honesty gaps:**
   - Drop the Working and Not working labels.
   - Grade late moves by win chance.
   - Gate the debrief's one-tap advice on measurement.
   - Correct the "+0.5" quick-sim copy.
4. **Make close finishes the event:**
   - Show the play call only when the game is close.
   - Auto-slow to 1× in close finishes.
   - Make "Clutch time" skip to the final when the game is decided.
   - Add a "Sim to final" chip above 98%.
5. **Default to 2×, and price injuries and wear into the calls that rest starters.** Impact: a watched game takes 5 to 6 minutes instead of 12, and stars stop playing 45 minutes in a 27-point game.

## 6. What I couldn't verify, and how I tested

**In the UI** (Playwright, 390×844 phone viewport, my own profiles):

- Live games watched in full:
  - ORL g1: 1×, a 35-point win, coached from the end of Q1 after a reload.
  - g2: 2×, with views and a Q4 timeout.
  - g3, g4 (a close 3-point loss with a clutch huddle) and g5: 4× with Key plays.
  - po1: East R1 Game 1 at 2× with Key plays.
- Ten DET clutch-skip finishes (lp1 to lp10), including a real last-possession stop with a winning call.
- Four DET quick sims.
- Routes: Today, `/games/:tid` (Preview, Plan), `/live` (Staff, Game plan, Lineup, Stats, breaks, huddles, Skip sheet, clutch offer), and `/game/:gid` (Debrief, Why, Flow).
- I used `window.__hc` only to read game ids and minutes. Simming to the playoffs went through the Play options, with skid calls answered "Ride it out".

**Headless** (`npx tsx`, real seed, every comparison paired on the same seeds):

| Script           | What it measured                   | Size                                |
| ---------------- | ---------------------------------- | ----------------------------------- |
| `policy.mts`     | ignore / quick / follow / auto     | 360 games                           |
| `policy.mts`     | break fixes ("What's deciding it") | 360 games                           |
| `policy.mts`     | quick sim vs live with no moves    | 6,320 games                         |
| `late.mts`       | late play call                     | 133 spots, 400 + 1,600 replays each |
| `placebo.mts`    | move verdicts with nothing changed | 400 games                           |
| `nightcheck.mts` | the debrief's night reading        | 36 nights, 200 vs 1,000 replays     |

**Not verified:**

- Real-device performance, landscape layout and haptics.
- Overtime and the GAME WINNER flash: lp8 ended 144-141, but I didn't capture the flash.
- How a human who picks selectively among calls would do (moot while the bench is nearly silent).
- The +0.47 setup itself. My setup differs from the owner's in having injuries on and covering 20 teams.
- Whether the round-1 F11 contradiction (plan vs "step slow") still appears; none came up in my debriefs.
