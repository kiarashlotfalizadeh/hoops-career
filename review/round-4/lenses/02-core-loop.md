The harness blocked writing `REPORT.md` to my scratch folder (subagents can't write report files), so the full report is below and is not on disk. The driver scripts, logs and screenshots it cites are in my scratch folder. I deleted my browser profile and left the repo untouched (`review/round-4/` is untracked but isn't mine).

# Core loop: round-4 review (lens 2, `core-loop`)

`<S>` = `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/1432d099-c3e8-46a9-bd36-274882ec0af2/scratchpad/review/core-loop`

## 1. Verdict

The loop is quick, stable and honest:

- **Speed:** a week sims in about a second. A whole regular season of long sims is about 13s of waiting, under load.
- **Stability:** 0 console errors across about 60 sims.
- **Saves:** quarter saves and snapshots both work.
- **The digest:** "While you were away" is the best FM-style "what happened" screen in the genre's mobile tier.

For a winning team, though, the season is still a decision desert:

- **Celtics season 1, played by weeks:** 25 "Sim 1 week" presses gave exactly one sim stop, the trade deadline on day 109. There were 0 weekly cards. The staff changed nothing for 109 days, and nothing again from the deadline to the playoffs.
- **Celtics season 2, played by long sims:** 2 stops in the whole regular season.
- **Headless, 4 teams that weren't rebuilding:** 1 regular-season call each.

The design works where there is something to weigh. A team with an owner youth goal, or a bad team, gets real weekly trade-offs: youth minutes against wins, with a measured payoff line afterwards. Those are the best cards in the game.

Contenders and middle teams get none of that. For them:

- "Sim to end" is the optimal play.
- The staff measures six times a season and almost never acts.
- Series cards stop the sim only to say there is nothing to change.

**Score: 6/10.** The plumbing and honesty are about 8. The rhythm for a typical (winning) save is about 4; a rebuilding save feels about 7. There is little pull to play "one more week", because nothing is about to be decided.

## 2. What's genuinely great (protect these)

- **Speed and stability under load.** All timings are with 10 reviewers plus my two headless jobs on the machine.
  - "Sim 1 week": median 0.94s (n=26, range 0.65–1.55s).
  - Season-2 regular season via "Sim to end of regular season": 4.96s + 2.94s + 4.95s, about 13s in total. Round 3 measured 25–30s.
  - Phase changes take about 0.65s.
  - 0 console errors across 2 seasons, 2 postseasons and 2 offseasons.
- **The digest** (`<S>/shots/w01.png`). It shows:
  - the record for the stretch;
  - movement in the conference ("15th → 9th") and the power rankings;
  - each result with its headline;
  - your team's stories, injuries and new mail;
  - "The staff's calls" (what the staff did);
  - why the sim stopped ("Stopped for tonight: Game 7 at 76ers").
- **The Play menu is as complete as Basketball GM's.**
  - Options: next game, a day, the next big night ("Rivalry · Wed, Dec 27 · @ DET"), week, month, deadline, All-Star, end of season.
  - Each option says how many of your games it covers ("Through Thu, Dec 28 · 2 of your games").
  - Open calls sit at the top of the sheet.
- **The youth card is the model call.** "65 more minutes a game for the young players? It costs 2.0 pts a game (≈ −5% to win, measured vs BKN): about 0.5 wins over 10 games. It adds 650 of the owner's minutes: on pace for 5,884 of his 5,300, not 5,234 … Unanswered, the staff goes with its lean tomorrow."
  - Ten games later the digest closes the loop: "Your call on Oct 21 … measured again on its last game (vs CHA), −1.3 pts; −1.6 pts when it went in. They played 1,134 minutes in its 10 games."
  - Screenshot: `<S>/shots/s3-week-card.png`.
- **The deadline card now carries the bill** (round-3 F3 fixed). "Pascal Siakam (84) … for Paul George (82), Neemias Queta (81), the 2028 1st (LAC) and the 2027 1st. With the deal: about +1.3 a game (measured @ PHI), about +1.0 wins over the 30 games left … Siakam: 32, $101.2M over 2 seasons. The owner's goals: payroll $196.7M, not $204.5M (his line $208.2M)" (`<S>/shots/w16-deadline-card.png`).
- **Staff tactics changes are now paired, announced and undoable.** Season 2, day 100, by mail: "Pick-and-roll coverage: Switch → Drop. Drop measured +1.3 a game against Switch over our next six games, each played both ways on the same seeds, so I've changed it. Team → Tactics has it, with Undo." The digest says it too.
- **Saves you can trust.**
  - A live Game 7 left at the end of Q1 survived a full reload. Today showed "Live · BOS down 28-32" and the menu offered "Resume live game · End of Q1".
  - "Restore 2027-28 start" in Settings → League created a separate league beside the original, as the copy promises (`<S>/shots/start-leagues.png`).
- **Phantom ride-out lines are gone** (round-3 F6). They now read: "Payton Pritchard out: the staff spread his minutes (nothing else to choose)."
- **Big-night stops work.** "Sim to end of playoffs" stopped for "Game 7 at 76ers" and for "Elimination game at Pistons".

## 3. Findings (most severe first)

### F1. The regular season is still a decision desert for any team that isn't rebuilding (P1)

**What I saw in the UI.** Boston: 15th-ranked roster, owner wants 47 wins and a playoff round.

| Season  | How played                       | Regular-season stops | What they were                        | Weekly cards | What the staff did                              |
| ------- | -------------------------------- | -------------------- | ------------------------------------- | ------------ | ----------------------------------------------- |
| 2026-27 | 25 × Sim 1 week                  | 1                    | deadline, day 109                     | 0            | 2 silent picks                                  |
| 2027-28 | 3 × Sim to end of regular season | 2                    | Tatum injury day 93, deadline day 108 | 0            | 1 coverage change (mail + Undo), 4 silent lines |

Other Needs-you traffic in season 1:

- 8 unsolicited AI trade offers, each a depth player of 74–82 OVR.
- 1 backup prompt.
- 1 "open roster spot" row.
- Needs you was empty on 9 of the 14 weekly visits between day 22 and day 109.

**Headless.** `<S>/audit.ts` runs the same order as the real sim (staff's morning, then the day), never answering. Logs are `<S>/audit-*.log`.

| Team          | Final | Regular-season cards                                          | Series/play-in cards | Silent picks | Lever readings / moves |
| ------------- | ----- | ------------------------------------------------------------- | -------------------- | ------------ | ---------------------- |
| BOS           | 47-35 | 1 (deadline)                                                  | 3                    | 13           | 6 / 0                  |
| IND (seed 11) | 45-37 | 1 (deadline)                                                  | 2                    | 8            | 6 / 0                  |
| MIL           | 40-42 | 1 (injury)                                                    | 3                    | 10           | 6 / 0                  |
| OKC           | 64-18 | 1 (deadline)                                                  | 4                    | 2            | 6 / 0                  |
| WAS           | 31-51 | 9 (4 youth week cards, 2 skid, odds + its due date, deadline) | 0                    | 15           | 6 / 0                  |
| CHI           | 24-58 | 5 (1 youth, 3 skid, deadline)                                 | 0                    | 17           | 6 / 0                  |

After the deadline there were 0 stops for every non-rebuilding team, in all 4 headless runs and both UI seasons.

**Cause: every card source is built to stay quiet, and together they leave a contender nothing.**

- Practice cards need familiarity under 85 _and_ a billed game (`weekCall.ts:8-21`). A kept playbook sits at 99%.
- Youth cards need an owner youth goal, or a season already lost.
- Injury cards need a measured loss (see F3).
- Staff tactics changes need the gain to clear the minimum _and_ sit 2 standard errors from zero (see F5).

**Fix (L):** see section 5, move 1, and the cadence trade-off in section 4.

### F2. Series cards with no measured counter still stop the sim (P1; round-3 F11, which the brief says was addressed)

- **What happened:** "Sim to end of playoffs" stopped on day 195 (stop id `series:2027:E2-0`) with "Needs you: East Semifinals vs DET: Game 1 tonight".
- **What the card said:** "None of the staff's counters measures as a gain against them: your playbook as it is, or a plan of your own", with [Plan the series] and [Leave it to the staff]. Screenshot: `<S>/shots/po-r2-card.png`.
- **The two buttons do the same thing.** The best measured counters were +0.0 and +0.1.
- **How often:** all 3 series cards in my UI play said this, and 9 of 12 series/play-in cards headless.
- **Cause:** `calls.ts:648-649` opens the series call whenever no series plan is set, whatever was measured.
- **Why it matters:** it contradicts the game's own rule ("a call is only a call with a real choice in it") and the Settings copy ("stops only for a choice").
- **Fix (S):** don't open a call when no counter clears the minimum. Put "Game 1 tonight, nothing to change, Watch & coach?" in the Today hero instead.

### F3. Injury calls hinge on a one-game, shrunk measurement that calls stars "no real loss" (P1)

- **Pritchard** (82 OVR starter), out 15 games:
  - No card at all.
  - Measured worth was +0.2 points, shrunk from a raw +1.1 with a standard error of 2.2.
  - The digest said "nothing else to choose."
- **Tatum** (90 OVR, All-NBA 3rd team), out 17 games:
  - Card text: "Without him: about −0.6 a game (measured on Saturday @ MIL)".
  - Shrunk from a raw 1.6 with a standard error of 1.54.
  - Screenshot: `<S>/shots/s2-tatum-card.png`.
- **Tatum in the season-1 playoffs**, out from Game 5 of a first-round series:
  - No card.
  - No staff line until 7 days later, after Games 6 and 7 had been played.
- **Cause:** the injury card measures only the next game (`calls.ts:1234-1247`). Staff tactics changes, by contrast, measure 6 games × 20 pairs because single opponents swing about ±1.2 points (`staffLever.ts:34-40`). One game is so noisy that shrinkage pulls every star toward zero, and the card either never opens or reads as trivial (`calls.ts:1216`).
- **Why it matters:** the star injury is the genre's most natural in-season decision, and noise is suppressing it. "Your franchise player is worth 0.6 points" is also a credibility hit.
- **Fix (M):**
  - Measure an absence over the games he'll miss, up to 6.
  - Show the spread.
  - Open the card for any top-3 player out 10+ games.

### F4. Most of what the staff does is invisible (P2)

- **What the staff did that nobody saw:** in season 1 it measured "heavy help → Stay home" six times (−0.5, −0.4, +0.1, −0.3, +0.2, +0.4). Nothing changed, and nothing was said anywhere (`staffLever.ts:17`).
- **Headless:** 36 readings over 6 team-seasons, 0 changes.
- **It keeps looking at the same thing.**
  - The only candidate all season, by team:
    - BOS, IND and WAS: always "Stay home";
    - CHI: always "Switch to Hedge";
    - OKC: always "Go to Drop".
  - MIL mixed "Stay home" with two other levers.
- **Coaching-staff mail:** 1 message in all of season 1. Season 1 had 49 inbox items in total: owner 10, medical 8, league 7, AI GMs 8, media 5, scouting 5.
- **Why it matters:** the pitch is "one staff voice that tells you why", and the staff's homework never reaches the player.
- **Fix (S–M):**
  - A weekly "Staff report" row in the digest, reporting rather than asking: "Checked Stay home over the next 6 games: −0.3 ± 0.9, keeping it."
  - Rotate the lever's candidate after a flat reading.

### F5. The staff lever almost never fires, so manual-tactics players get no lever cards either (P2)

- **How often it fires:** 1 change in about 42 readings (my season 2), because the bar is the minimum gain plus 2 standard errors, checked every 28 days (`staffLever.ts:41-55`).
- **Why it matters:** the same bar applies to the card a user who runs his own tactics would get. Switching off "Let the assistant manage" creates no decisions.
- **Fix (M):** for manual-tactics users, offer the best reading as a card once it clears the minimum alone, with the error shown. Keep the 2-standard-error bar only for changes the staff makes without asking.

### F6. The deadline card's stakes metric is the wrong one, and its two numbers disagree (P2)

- **Season 1:** "Postseason odds 99%. The staff's call: buy … about +1.0 wins … postseason odds about 98% with it (the forecast's read)."
  - The odds go down on a "buy".
  - This is a 32-20 team whose owner goal is "Win a playoff round" (42% on Today's "Round 2" tile).
- **Season 2:** the card said stand pat, and its only alternative was a deal the staff itself measured at −1.8 a game.
- **Why it matters:** the deal is measured on one game (@ PHI, standard error 1.32), the season forecast then reads it the other way, and neither speaks to the goal the owner will grade.
- **Fix (S–M):**
  - Quote odds for the owner's postseason goal (win a round, or the title).
  - Use one model for both numbers, or label the disagreement.
  - When the best deal measures negative, offer "Look for a deal" instead of a bad trade.

### F7. Tapping the deadline card opens an empty trade builder with Atlanta, not the proposed deal (P2)

- **What happens:** you land on "ATL … You send: Nothing yet" (`<S>/shots/w16-deadline-open.png`).
- **Cause:** the card links to plain `/office/trade` (`calls.ts:1428`).
- **Fix (S):** link to the deal pre-loaded. The trade screen already supports `?offer=` for AI offers.

### F8. Youth goal projections disagree between the Owner page and the card (P2)

- **Owner page:** "53 so far, projected 5,300 · On track".
- **Week card, same morning:** "on pace for 4,683 of his 5,300, not 4,003", which is short of the goal either way. Screenshots: `<S>/shots/s3-week-open.png` vs `<S>/shots/s3-week-card.png`.
- **Why it matters:** this is the best call in the game, and the player can't tell which number to believe.
- **Fix (S):** use one projection for both, or label each as the owner's read vs the staff's.

### F9. The offseason and free agency are dead stretches for a team over the cap (P2)

- **Free agency:** 4 × "Advance 1 week" produced 0 mail, 0 Needs-you items and no digest on 3 of the 4 presses. Ty Jerome (86) and Fred VanVleet (82) were still unsigned on day 29 of 30.
- **Re-signing:** Today is nearly empty, with a stale digest row ("May 10 to Jun 6") (`<S>/shots/resign-today2.png`).
- **Draft:** "Go to the draft" jumps 18 days with no decision in between.
- **Fix (M):**
  - FA: a daily ticker and staff notes on bargains in the digest.
  - Re-signing: Today leads with the staff's re-sign plan and its cap and owner effect.

### F10. Today mid-season has no "race" to pull you forward (P2)

- **What Today shows:** win %, "Round 2 26% · Last 5 · Owner Steady · Cup 2-0", one news card and the digest row (`<S>/shots/w04-today.png`).
- **What it doesn't show:** the seed race, the biggest swing game ahead, or the next milestone.
- **Fix (S–M):** one "This week" line with the games, the most important game by the forecast, the seed gap and the owner's pace.

### F11. A long-sim reload loses everything since the sim started (P3)

- **What happened:** I reloaded about 3.5s into "Sim to end of regular season". The bar said "Day 42 of 168", but the league on screen stayed at day 1, and after the reload the save was back at day 1.
- **Cause:** checkpoints come at most every 5s and only on 20-day steps (`sim.worker.ts:67`, `simCore.ts:157`). A season that sims in about 13s gets 0–2 of them.
- **Mitigation already there:** going to the background asks the worker for a checkpoint (`App.tsx:110-113`). I couldn't verify that on a device.
- **Fix (S):** a first checkpoint at about 3s, plus a `pagehide` handler.

### Polish (P3)

- **F12. An answered deadline card lingers.** After "Stand pat" it stays as "Trade deadline in 5 days · The last day for deals" until the deadline (round-3 F12, still open).
- **F13. The 10-day cover is unmeasured.** The card measures Tatum's loss but not what Draymond Green (68) wins back. Signing him also silently dropped a pending MIL offer from Needs you.
- **F14. The champion is missing from both offseason digests.** They led with retirements and "the pick is the Thunder in 5". OKC actually won 4-1.
- **F15. The guide's "Coach a game live" step doesn't tick** after a partial watch followed by "Sim to final" (round-3 F17).
- **F16. Luck lines with stars out.** "Outscored by 33.0 a game; … shots that didn't fall (luck, not the plan) (−29.6) …; Tatum, White and George are out." The skid card now follows its diagnosis (`calls.ts:1536-1545`); the series line doesn't.
- **F17. AI offers carry no measured worth.** "HOU want Harper Jr. for 1 pick … A little short". These offers are 8 of the 11 Needs-you decisions in a contender's regular season.

## 4. Since round 3

| Round-3 finding                       | Status                                                               | Evidence                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 decision desert                    | **Still open**                                                       | 1–2 regular-season stops for BOS in the UI. Headless, 1 for each of 4 non-rebuilding teams, and 0 after the deadline. Rebuilding teams get 5–9. |
| F2 postseason sim error               | **Fixed**                                                            | Game 7 watched live, reloaded at end of Q1, finished, then 3 × "Sim to end of playoffs": 0 errors.                                              |
| F3 deadline buy hides the bill        | **Fixed**                                                            | The card shows age, money, years, measured points and wins, odds and payroll. New issues are F6 and F7.                                         |
| F4 "Look for a trade" is a blank page | **Partly**                                                           | The injury card now describes a Find filter (headless). The deadline card's link is still blank (F7).                                           |
| F5 skid card contradicts itself       | **Mostly fixed**                                                     | When the diagnosis is luck it now says ride it out. With starters out it still says luck, then "trade".                                         |
| F6 phantom "went unanswered"          | **Fixed**                                                            | The line was 7 days late for Tatum's playoff injury.                                                                                            |
| F7 youth double count                 | **Fixed**                                                            | A new mismatch with the Owner page (F8).                                                                                                        |
| F8 measuring cost vs value            | **Still open, cost higher**                                          | The staff's morning work takes 76–100% of the time of the day's games themselves (round 3: +44–62%). The UI still feels fine.                   |
| F9 unpaired playbook rewrites         | **Fixed**                                                            | The new problem is the reverse: it almost never fires (F5).                                                                                     |
| F10 decisions bunch at the deadline   | **Still open**                                                       | —                                                                                                                                               |
| F11 empty series cards stop the sim   | **Still open**                                                       | F2.                                                                                                                                             |
| F12 Needs you clogged                 | **Partly**                                                           | Usually empty now; the answered deadline card still lingers.                                                                                    |
| F14–F17                               | F15 partly; F16 not reproduced (Tatum PF → Green PF); F17 still open | —                                                                                                                                               |
| Round-2 F12 champion untold           | **Still open**                                                       | —                                                                                                                                               |
| Round-2 F13 no tally of your calls    | **Partly**                                                           | Only the youth card has a payoff line.                                                                                                          |

**The F1 cadence question is still yours to decide.** The evidence frames it as a choice between two failure modes the game has already shipped:

- **Honest and quiet (today).**
  - A contender gets about 1 regular-season stop, and every number before a choice is measured.
  - The loop becomes "Sim to end". The staff's 6 readings and 2–13 silent picks a season are invisible.
- **Lower the bar.**
  - Cards at the minimum gain without the 2-standard-error test, injuries measured over the absence, a youth or rest card for contenders.
  - Likely 6–10 stops a season for a contender.
  - Some cards would have options within about one standard error of each other. The numbers rule allows that if the spread is shown.
  - Round 2's weekly rubber stamp is the cautionary case.
- **The middle path my data supports:**
  1. Report weekly without asking.
  2. Ask only when the options pay off on different horizons:
     - a playoff rotation vs development minutes;
     - rest vs the seed race;
     - the lever, for manual-tactics users.
  3. Never stop for an empty card.

  Expected result: about 4–6 real stops a season for a contender.

## 5. What it would take to reach 9/10

1. **Give contenders a horizon trade-off every 2–3 weeks (L).**
   - Use the youth card's shape (measured cost now vs measured gain later, plus a payoff line) for:
     - tightening the playoff rotation vs regular-season legs;
     - rest before the playoffs vs the seed race;
     - development minutes vs wins;
     - lever cards.
   - Expected: 1–2 stops become about 6, each a real choice.
2. **Measure injuries and deals the way the lever is measured (M).**
   - Over 6 games, with the spread shown and the owner's goal as the stakes, and the deal loads in one tap.
   - Expected: believable star-injury calls ("−4.2 ± 1.1 a game").
3. **Make the staff visible without asking (S–M).**
   - A weekly staff-report row and rotating lever candidates.
   - A monthly coaching mail.
4. **Remove non-choices (S).**
   - Empty series cards become a hero line, and "Stand pat" settles the card.
   - The champion leads the offseason digest, and the youth projection is the same on both screens.
5. **Fill the offseason (M).**
   - A free-agency ticker and bargains in the digest.
   - A staff re-sign plan on Today and a draft-week call.

## 6. What I couldn't verify, and how I tested

**UI.** Playwright, phone viewport, my own profile, through an interactive driver (`<S>/server.mjs`, `<S>/defs.js`). Every sim is logged in `<S>/loop.jsonl` (56 records), with about 50 screenshots in `<S>/shots/`.

- **Season 1 (Boston, Normal, real league), played by weeks.**
  - Preseason: cuts and the guide steps; the opener watched live, then Sim to final.
  - Regular season: 25 × Sim 1 week. I accepted one AI offer, let 7 lapse, and stood pat at the deadline.
  - Playoffs: Game 7 watched live, reloaded mid-game, then finished.
  - Offseason: draft (one pick by hand, the rest auto), re-signing, 4 weeks of free agency.
- **Season 2** (restored from the snapshot): long sims, the Tatum 10-day, playoffs, the review page.
- **Season 3:** offseason, two youth cards, "Sim to the next big night", and the mid-sim reload test.
- **Store reads were for verification only.** Nothing was fast-forwarded through the store.

**Headless.** `<S>/audit.ts` over 6 team-seasons (BOS, MIL, OKC, WAS and CHI on seed 7; IND on seed 11). Logs: `<S>/audit-*.log`.

**Not verified:**

- The app going to the background mid-sim on a real device.
- The Easy and Hard difficulty presets.
- The paired value of answering vs ignoring calls.
- The practice-vs-prep week card: it never fired.
- Floor and books calls for my team; the odds call fired only headless, for WAS.
- Clicking "Look for a trade" in the UI.
- Why season-2 payroll ended $5.1M above opening night (owner −57 on the payroll goal). That belongs to the stakes lens; the card already showed $228.8M on day 108.

All timings were taken under shared load.
