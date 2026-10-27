# Core-loop review, round 3

## 1. Verdict

The weekly rubber stamp from round 2 is gone. Long and short sims now make the same picks, cards no longer vanish, and numbers arrive with units and win %. All of that was verified. But the fix took the decisions away along with the noise. The staff now quietly makes nearly every in-season choice: game counters, the youth minutes, injury ride-outs, the series adjustments, and even changes to your base playbook (by inbox mail).

What's left is a loop that is honest but has almost nothing to decide:

- **OKC (contender):** pressing only the long sims, the regular season stopped exactly once, at the trade deadline.
- **MEM (middling):** three regular-season stops, two of them with no real second option.
- **From the deadline to the play-in:** about 8 weeks with nothing to decide, for both teams.

The consequence side is strong: reports, the luck line, the owner's verdict and the season review. "Decide → consequence → decide" works at the deadline, in the late huddle and at series starts, but not week to week. FM's Continue lands on a small choice every few days; this one mostly lands on "the staff did it."

A sim error after every watched postseason game, and a deadline "buy" that hides a $96M contract, cost trust.

**Score: 6/10.** Same as round 2, for different reasons. The plumbing and honesty are now about 8. The rhythm is about 4: little to press, and when there is something, the second option is often a blank screen.

## 2. What's genuinely great (protect these)

- **Long and short sims behave the same.** The staff measures every morning inside `runSim`, whatever the sim length (`simCore.ts:144-196`, `callMeasure.ts:56-71`).
  - 8 headless seasons: **0 vanished cards**.
  - Every stop opened with its numbers already in. The Spencer injury card read "Without him: about −3.3 a game (measured on Friday vs OKC)" the moment the sim stopped.
- **The settings copy now matches the behaviour.** "What has one honest answer the staff does on its own, in any sim, short or long…" (`shots/B27-settings.png`).
- **Units on every number.** For example: "+0.6 pts (≈ +2% to win) … (measured)".
- **The late huddle is a real decision.** Play-in at MIN, down 2 with 4.6s left: four sets, each "against no call, the rest of the game played 400 times" ("Elevator: Harden +24% to win"; `shots/B23-huddle.png`). This is the best decision in the loop.
- **Consequences read well:**
  - the debrief's luck line;
  - "Your plan … Worth +0.6 a game";
  - the owner's verdict moment ("Excellent · +47");
  - the season review page (`shots/A38-review.png`);
  - the Cup champions moment.
- **The digest says why a sim stopped:** "Stopped for tonight: Game 7 vs Lakers".
- **Sim speed is still fine (timed under 10-reviewer load):**

  | Sim                                 | Time                    |
  | ----------------------------------- | ----------------------- |
  | Week                                | 1.6–3.3s                |
  | Month                               | 5.0–7.5s                |
  | To the deadline                     | 3.7–7.6s                |
  | Full regular season, long sims only | about 25–30s of waiting |

  The roughly 50% CPU cost of measuring isn't felt as a problem. I saw one 6.1s quick-sim spike.

## 3. Findings (most severe first)

`<S>` = `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/aa526230-11b5-4da6-a507-e3bf42281b2d/scratchpad/review/core-loop`

**F1. The regular season is a decision desert — P1**

- **What the player gets, in UI play:**

  | Team | Regular-season stops | What they were                        |
  | ---- | -------------------- | ------------------------------------- |
  | OKC  | 1                    | the deadline                          |
  | MEM  | 3                    | Spencer injury, Edey injury, deadline |

  Across both teams there were 0 weekly cards all season.

- **Headless, 8 seasons, 2 teams, 3 seeds** (`<S>/call-audit.ts`; logs `<S>/audit-*.log`). Cards opened per regular season:
  - OKC: 2, 2, 3, 1;
  - MEM: 1, 3, 4, 1.
  - Typical spread: a youth card in Oct/Nov, then the injury/skid/deadline/odds cards bunched into Feb. OKC seed 23 got **only the deadline card** all regular season.
- **Silent picks per season:** 1–10 (log lines). The staff also changed OKC's base coverage 3 times by mail (Blitz → Drop → Hedge → Drop).
- **Other choices the player sees:** AI trade offers (OKC 8 a season, MEM 17). These end at the deadline, so March is empty.
- **Why it matters:** this is the screen the player repeats hundreds of times. With nothing to decide, "Sim to end" is the optimal play.
- **Fix (L):** see section 5, move 1. The staff's base-playbook flips and the youth lean are natural recurring cards: each has a real cost and horizon trade-off.

**F2. A sim error after every watched postseason game — P1**

- **What you get:** "The simulation hit an error, so it stopped at where it started. If it keeps happening, export a backup and report it."
- **Console:** `sim failed Error: The sim worker lost track of the results.` (`src/workers/sim.worker.ts`, `open()`; `base.length < delta.keep`).
- **Repro: 2 of 2 in the postseason, 0 of 1 in the regular season:**
  - MEM: watched the play-in live (huddle call), then "Sim to next game" from Today;
  - OKC: watched playoff Game 1 (skipped to clutch, then Sim to final), then "Sim to next game".
- A second tap works.
- **Why it matters:** it lands right after the most important games, with copy telling the player to back up their league.
- **Fix (S–M):** resync the worker cache after a postseason live commit, or have `open()` reset its cache and resend the full results instead of throwing.

**F3. The staff's deadline "buy" hides the bill — P1**

- **What MEM got** (25-26; owner wants a $25.5M profit and youth minutes): "The staff's call: buy. James Harden (89) from the Cavaliers for Cam Spencer (81)."
- **What the deal really is:** Harden is 37, on $30.6M, $32.2M and $33.7M (with a player option). Spencer earns $2.4M on a team option.
- **What the screens show:** no age, salary, years, owner-goal effect or measured worth, on the card or the one-tap confirm ("You send Cam Spencer (81); the Cavaliers send James Harden (89). Tap again to confirm"). Screens: `shots/B14-deadline-today.png`, `B15-deadline-confirm.png`.
- **Cause:** `planDeadlineCall` (`calls.ts:602-645`) picks by OVR over your 5th-best player and ignores salary, age and goals. The headless runs made the same pick (deterministic).
- **Afterwards:** the press graded the deal "C+".
- **Why it matters:** this is the season's biggest decision, and it is the one card with no number on it. That breaks the numbers rule.
- **Fix (M):**
  - measure net points and playoff odds (paired, like injuries);
  - show age, years and $ on the card;
  - filter the pick by the owner's money and youth goals.

**F4. "Look for a trade" is a door to a blank page — and it settles the card — P1**

- **Injury card** (Spencer, out 36): the alternative to riding it out opens `/office/trade` with ATL preloaded and "You send: Nothing yet". The card is gone from Needs you after one tap (`shots/B09-lookfortrade.png`).
- **Code:** both the injury and skid cards use `{action:{kind:'settle'}, to:'/office/trade'}` (`calls.ts:905`, `1149`). The "a call is a choice" filter counts any link as a choice (`calls.ts:1159`).
- **Result:** cards whose honest answer is "ride it out" still stop the sim. Edey's card read "Without him: too close to say … the team measures about as well without him", yet it still stopped the sim, because he was out 25 games (≥20, so a trade counts as an option).
- **Fix (M):**
  - let the staff propose 1–2 concrete, measured deals, or deep-link to Find filtered by position, salary match and availability;
  - don't count a bare link as a choice;
  - don't settle the card until a deal is made or the player taps "ride it out".

**F5. The skid card contradicts itself — P2**

- **What it says** (MEM seed 23): "8 straight losses: … the box scores point to shots that didn't fall (luck, not the plan) (−15.3 a game, the staff's read) … The staff's call: look for a trade; counters alone haven't turned it."
- **Hardcoded:** the recommendation is fixed whatever the diagnosis (`calls.ts:1146`).
- **Silent skids:** MEM lost 7 straight in November (UI) with no card.
- **Fix (S):**
  - if the diagnosis is luck, recommend riding it out;
  - recommend a trade only for structural causes (matchups, injuries).

**F6. "The card went unanswered" for cards that were never shown — P2**

- **What you see:** "Chet Holmgren out: the card went unanswered for 3 games, so the staff rode it out." OKC's sim never stopped for it, and Needs you never showed it.
- **How often:** in headless runs where every card was answered, 3 such lines in one MEM season.
- **Cause:** `ageInjuries` (`calls.ts:662-669`) walks every hurt star, but `staffCalls` filters out cards with no real choice (`calls.ts:1159`).
- **Fix (S):** say "the staff spread his minutes (nothing else to choose)" for cards that never opened.

**F7. The youth lean's digest line double-counts the lean — P2**

- **What MEM's toast said:** "The young players: about 33 more minutes a game until Nov 16, for the owner's goal (on pace for 8,224 of his 6,100 minutes, 7,894 without)…"
- **How it reads:** the goal already beaten, so the move looks pointless.
- **Cause:** `youthOutlook` is computed after `putYouth` has already leaned the rotation (`weekCall.ts:650-657`), so "without" includes the lean. The headless runs show the same pattern ("8,485 of his 6,700, 8,155 without").
- **Fix (S):** compute the outlook before `putYouth`.

**F8. Measuring costs about half again the sim time and buys about 0.1 wins of silent picks — P2**

- **Cost:** headless, measuring adds **+44% to +62%** to sim CPU (outliers of +98% and +147% under parallel load).
- **What it buys:** the silent counters it pays for claim 1.3–6.8 points a season, about **0.04–0.18 wins** (summed from staffPicks).
- **Repetition:** 14 of 17 silent counters (extra-seed runs) were just a pick-and-roll coverage swap (7 Ice, 3 Drop, 2 Switch, 2 Hedge).
- **Seed sensitivity:** with only the league id changed, opening night picked "Hedge +0.7" in one run and "Ice +0.5" in the other. These picks are inside the noise.
- **Why it matters:** not felt in wall-clock time, but it is compute and complexity spent on near-zero value.
- **Fix (M):** keep measuring for cards that open. Drop or batch the one-game silent counters, or raise their bar to about ≥ +1.5 pts.

**F9. The staff silently rewrites your playbook on unpaired numbers (cross-lens: tactics) — P2**

- **The mails:** "Staff change: Switch to Hedge — Our drop coverage has given up 2.0 points a game and won 0.4 back over 21 games, so I've changed it", then 63 days later "Go to Drop".
- **Source:** tag accounting (`games.ts:85-97`), not a paired measurement. The player only finds out in the inbox, never on Today or with a choice.
- **Fix (S–M):** make it a card ("Drop has cost 1.6 a game: switch to Hedge? measured +x"), and measure it paired.

**F10. The decisions that matter come in one week, then nothing — P2**

- **When they come:** MEM seed 23 got skid (day 107), deadline (day 109) and odds plus its due-date stop (day 112) within 5 days, after nothing since November.
- **Mid-February to the play-in:** 0 stops in UI for both teams. MEM's 6-game skid and Boozer's torn ACL (out 78) passed silently.
- **Fix (M):**
  - spread them: the odds card earlier;
  - post-deadline cards (play-in race, playoff-eight minutes, wear before the postseason);
  - a skid card after the deadline that offers a rotation choice.

**F11. Series cards with nothing to choose still stop the sim — P2**

- **The card:** "None of the staff's counters measures as a gain against them: your playbook as it is, or a plan of your own." [Plan the series] [Leave it to the staff]. Both do the same thing.
- **How often:** 3 of 4 OKC series in two headless seasons.
- **Fix (S):** fold it into "Stopped for Game 1: watch it?" with the scouting one tap away.

**F12. Needs you is rarely empty — P2**

- **What you see:** "Back up your league" sat in Needs you and on the bell ("1 need you") from December to the season's end. A deadline card answered "Stand pat" stayed as "Trade deadline in 5 days · The last day for deals: Feb 11" (round-2 F6, still open).
- **Fix (S):** move backups to a quieter row; remove answered cards.

**F13. The Cup is passive — P3**

- **No stakes before the final:** the Cup final had no staff counter ("No game plan yet"). The week's single measured big game was the semifinal.
- **Contradictory copy:** "NBA Cup final in Chicago — A trophy on the line in Las Vegas" (`shots/A23-cupfinal-today.png`).
- **All-Star weekend:** two days of nothing to do (fine, but "Sim to next game" skips it without saying so).

**F14. Low-value or stale full-screen moments — P3**

- **Stale:** "30,000 points · James Harden · Jan 3" took the screen on Feb 6, when he joined via trade.
- **Odd copy:** "Review A is off the mark against the Clippers 124-118 over the Los Angeles Clippers".

**F15. Luck lines bigger than the margin read as excuses — P3 (cross-lens: game-day)**

- **What the series line says:** "down 2-0 … Outscored by 15.0 a game; … shots that didn't fall (luck, not the plan) (−29.9 a game, the staff's read)". Every playoff deficit line in the audits blamed luck.

**F16. Cover suggestions ignore position — P3**

- **What the staff picked:** Jalen Williams (a wing) out 18 → "Sign Brook Lopez to a 10-day"; out 13 → "Al Horford".
- **Cause:** `tenDayCover` gives same position only a +2 OVR bonus (`calls.ts` ~786).

**F17. The guide's "Coach a game live" didn't tick (cross-lens: onboarding) — P3**

- **What happened:** after watching Q1 whole at 4× and then "Sim to final", the guide still showed "3 of 4" and kept holding week 0's call.
- **Likely cause:** the period is added to `skipped` when the skip starts at the Q1 break (`live.ts:179`, `409`).

### Decisions per month (UI play)

| Month   | OKC (game-by-game → week → month → long sims)                                            | MEM (game-by-game → week → month → long sims)             |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Oct     | 4 guide steps (rotation, playbook, opener counter, live opener)                          | 0 (youth lean silent; 3 cuts in preseason)                |
| Nov     | 0 calls; 4 AI offers; 1 staff playbook mail                                              | 1 injury card ("Look for a trade" = blank page); 5 offers |
| Dec     | 0 calls; Cup QF/SF/F with 0 prompts; 1 offer                                             | 0 (7-game skid silent); 2 offers                          |
| Jan     | 0; a phantom "ride it out" line; 2 offers                                                | 1 (Edey: "too close to say", still stopped)               |
| Feb     | 1 (deadline: stood pat)                                                                  | 1 (deadline: Harden)                                      |
| Mar     | 0                                                                                        | 0                                                         |
| Apr–Jun | 1 series card answered; 3 more series cards; elimination and Game 7 stops (watch-or-not) | Play-in staff plan + 1 huddle call                        |

Sim stops per regular season: OKC 1, MEM 3. Taps to play the whole OKC season: about 31. FM's Continue offers a non-people choice every few days.

## 4. Since round 2

| Round-2 finding                              | Status                   | How I checked                                                                                                                                 |
| -------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 weekly rubber stamp                       | **Fixed, overcorrected** | 0 weekly cards in UI play; 0–2 headless. Picks are silent and worth about 0.1 wins/season (new F1, F8)                                        |
| F2 vanishing cards                           | **Fixed**                | 0 vanished in 8 audits; every UI stop had its numbers                                                                                         |
| F3 long sims lose counters                   | **Fixed**                | `staffMorning` runs in every `runSim`; settings copy honest                                                                                   |
| F4 measuring stuck/slow                      | **Fixed for stops**      | Cards opened already measured                                                                                                                 |
| F5 collapse gets one "ride it out"           | **Partly**               | Diagnosis, injuries and 8/10 escalation now present; but luck → "trade" contradiction (F5), 6–7-game skids silent, post-deadline skids silent |
| F6 deadline unmeasured, no contract, lingers | **Still open / worse**   | Harden at 37 on $96M, nothing on the card (F3); answered card lingers (F12)                                                                   |
| F7 10-day cover unmeasured                   | **Still open**           | Card measures the loss, not the cover; position ignored (F16)                                                                                 |
| F8 stop cause not first                      | **Fixed**                | Deadline and injury stops led Needs you                                                                                                       |
| F9 worth units                               | **Fixed**                | "+0.6 pts (≈ +2% to win)"                                                                                                                     |
| F10 counters repeat                          | **Still open**           | 14 of 17 silent counters were a pick-and-roll coverage swap                                                                                   |
| F11 payroll rounding                         | **Fixed**                | OKC "$216.2M, $0.5M under (+16)"                                                                                                              |
| F12 title untold in digest                   | **Still open**           | Both offseason digests led with retirements and "The Finals: the pick is…", with no champion                                                  |
| F13 no coaching tally                        | **Still open**           | The review page has owner, press and best-of, but no tally of your calls or the staff's                                                       |
| F15 quick sim jumps to the report            | Unchanged (by design)    | —                                                                                                                                             |
| F16 low-value moments                        | **Still open**           | F14                                                                                                                                           |
| F18 empty series-deficit cards               | **Fixed**                | Now a silent digest line; but empty Game-1 series cards remain (F11)                                                                          |

**New since round 2:** F2 (postseason sim error), F4 (link counted as a choice), F6 (phantom ride-outs), F7 (youth double count), F8 (cost vs value), F9 (silent playbook rewrites), F13 (Cup final copy).

## 5. What it would take to reach 9/10

1. **Bring back one real recurring decision, every 1–2 weeks, built from levers the staff now pulls silently.** Rough size L.
   - **Content:** a base-playbook change with measured cost and benefit (instead of the inbox mail); youth minutes against wins; drills against prep against recovery; a rotation fix for a slumping or overworked player.
   - **Shape:** two measured options with different horizons, a lean, and a payoff line later ("You chose Hedge on Dec 1: +0.8 a game since, measured").
   - **Expected:** stops go from about 1–3 a season to about 15, each one a real choice. This is the FM-like rhythm.
2. **Make the big decisions concrete and honest.** Rough size M.
   - The deadline card shows age, contract and owner-goal effect, plus measured net points and odds. It filters the deal by goals.
   - "Look for a trade" becomes 1–2 measured staff deals or a filtered Find.
   - The skid recommendation follows its diagnosis.
   - **Expected:** the season's biggest choices stop being traps.
3. **Fix the trust leaks.** Rough size S each.
   - the postseason worker-cache error;
   - the phantom "card went unanswered" lines;
   - the youth double count;
   - answered cards and backups clogging Needs you;
   - the Cup final copy.
   - **Expected:** no scary toasts after big games; the digest's staff lines can be believed.
4. **Fill the post-deadline stretch.** Rough size M.
   - playoff-race and play-in stakes cards;
   - a playoff-eight and minutes decision;
   - Cup knockout plans (a staff counter for the final);
   - an earlier odds call.
   - **Expected:** March and early April get 2–3 meaningful stops.
5. **Close the loop at season scale.** Rough size S–M.
   - A tally on the review page: "You made 9 calls (measured +x); the staff made 14 picks (+0.2 wins); Harden trade: −y."
   - The champion leads the offseason digest.
   - Trim measuring to the cards that open, which returns about a third of sim time.

## 6. What I couldn't verify, and how I tested

**Tested**

- **Playwright, phone viewport, my own two profiles** (`<S>/profileA`, `<S>/profileB`), driven through the dock, Play options and Today. Driver: `<S>/server.mjs` plus helpers. Screenshots: `<S>/shots/` (68).
  - **OKC (Normal, guide on):** guide steps, the opener live (Q1 at 4×, then Sim to final), game by game, Sim 1 week, Sim 1 month, Cup QF/SF/final, to the deadline (stood pat), to All-Star, 2× Sim 1 day through All-Star weekend, to end of season, playoff Game 1 live (to clutch), then Sim to end of playoffs through a Game 7 loss.
  - **MEM (guide hidden):** preseason cuts, game by game with quick sims, week, month, to the deadline in two legs (injury stops; took the Harden deal), to All-Star, to end, the play-in watched live with the huddle, the second play-in.
- **Headless** (`<S>/call-audit.ts`, using the real `staffMorning` + `simDay` path): OKC and MEM, taking the staff's calls vs never answering on seed 7, plus never answering on seeds 11 and 23. Logs: `<S>/audit-*.log`.
- **Store reads were only for checking:** contracts, inbox counts and tactics flags. Nothing was fast-forwarded through the store.
- The repo was left untouched (`git status` clean).

**Not verified**

- **Paired win value of answering vs ignoring.** Seasons split apart randomly after the first different answer (MEM 36-46 vs 30-52 on seed 7), so the one-seed W-L gaps are noise.
- **Practice-trade weekly cards** (none fired in 10 seasons), and the floor and books calls (none fired).
- **"Sim to the next big night"** (never offered separately from the next game).
- **A second season**, Easy/Hard difficulty, and timing on a real phone.
- All timings were taken with about ten other reviewers loading the machine.
