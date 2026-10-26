**Core-loop review, round 2**

## 1. Verdict

The loop now has decisions in it. A weekly staff call, skid calls, series-deficit calls, injury calls with a measured number, a season-end hero and an All-Star hero all landed, and the game still sims fast. A playoff team now gets 2–7 calls a month instead of one call in 93 days.

The trouble is the commonest decision. The weekly call, about 25 a season, is a rubber stamp:

- the staff's pick is also what happens if you don't answer;
- it is always worth +0.5 to +2.5 points in one game;
- 25 of them add up to about 0.6–0.9 wins a season;
- "Keep your plan" is never the right answer.

On top of that, a week's sim sometimes stops for a call that disappears a few seconds later. A month's sim skips the calls altogether, and the player quietly loses those counters (the small, one-game tactical changes the staff measures). The real decisions (injuries, the deadline, a series) are good. Collapses still get almost nothing: a 13-game losing streak got one "ride it out" call.

FM's Continue lands on small choices that cost something (training load, opposition instructions, board requests). Here, most Continues land on agreeing with the staff.

**Score: 6/10.** Up from 5: the plumbing is still a 9 and the rhythm is now about a 5. There is something to press, but rarely a choice to think about.

## 2. What's genuinely great (protect these)

- **Sim speed.** Measured in the UI:
  - a week takes 1.0–1.6s and a month 1.9–2.4s;
  - Mar 2 → Apr 12 (21 games) took 2.3s;
  - a whole MIN regular season with "Sim to end" took **13s with 3 stops**.
- **Each game's result answers the decision you made.** The debrief after TOR said "Your plan: 2-3 zone · Tonight: TOR offense 1.25 a trip … 1.24 coming in · Worth +0.9 a game". The luck line was also honest: "Their shots fell above what their looks were worth: that part was luck, not the plan."
- **Injury calls carry a measured number:** "Without him: about −2.9 a game (measured on Thursday vs MEM)".
- **"Leave it to the staff" now applies the staff's plan** and says so in a toast ("The staff's plan vs GSW: Sprint back").
- **The season-end hero and review** (`/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/core-loop/shots/t2-season-end.png`): "Lost in the second round · Picked for 36 wins · The owner: Excellent · Best win…".
- **The digest says why it stopped:** "Stopped for tonight: Game 7 at Trail Blazers". The moment of the stretch leads.
- **Mail volume is sane:** 45 messages a season with 16 unread (round 1: 55, with 50 unread).
- **All-Star weekend:** a hero on Today and a moment ("4 All-Stars…").
- **Staff cards on Today now rotate.**

## 3. Findings (most severe first)

The folder `<S>` below is `/private/tmp/claude-501/-Users-kiarash-Downloads-hoops-career/3ab7e56a-18a1-4267-8218-da731c128be7/scratchpad/review/core-loop`.

**F1. The weekly call is a rubber stamp — P1**

- **What you get:** "The staff's counter: 2-3 zone, about +0.9 a game against them (measured). Unanswered, the staff puts it in on game day. [Put it in] [Keep your plan]" (`<S>/shots/17-week2-measured.png`). Tapping "Put it in" does what doing nothing does. Your own plan is measured as worse, so "Keep your plan" is never right.
- **Evidence:** a headless audit (`<S>/call-audit.ts`) played a full season, measured each card as the screen does, and took the staff's call. Logs: `<S>/audit-den.log`, `<S>/audit-min.log`.

  | Team | Weekly calls | Disappeared | Real | Each worth   | Season total |
  | ---- | ------------ | ----------- | ---- | ------------ | ------------ |
  | DEN  | 25           | 3           | 22   | +0.5 to +1.5 | +17.3 pts    |
  | MIN  | 25           | 1           | 24   | +0.5 to +2.5 | +28.4 pts    |

  At about 0.03 win probability per point in one game, that is **0.55–0.9 wins a season** for about 25 stops.

- **It breaks the code's own rule.** `weekCall.ts:21-25` rejects resting a star as a call because "A call whose honest answer is always 'play him' isn't a choice". The weekly counter's honest answer is always "put it in".
- **Fix (M):** stop the sim only when the call has a real trade-off or real stakes. Otherwise apply it silently and list it in the digest. Real choices could be:
  - two measured options with different costs (tonight only vs. the series or the season; a big familiarity hit vs. a small gain);
  - only billed games where the gain is at least about 5% win chance.

**F2. A week's sim stops for calls that then disappear — P1**

- **What you get:** "Sim 1 week" stops, the card says "The staff is measuring… · 38% measured / Keep your plan", and 2–6s later the card is gone. The digest's stop line still says "Needs you: This week: @ NOP on Wednesday" and links to nothing.
- **Seen in the UI 3 times in DEN's 9 week-sim stops:** Oct 27, Dec 1 and Mar 2 (Mar 2 vs SAS: 5s of measuring, then nothing).
- **The label over-promises.** "Sim 1 week · Through Wed, Oct 28 · 4 of your games" stopped after 2 games. Feb 22 → 23 stopped after 1 day and 0 games.
- **Cause:** `openWeekId`/`gameOf` (`weekCall.ts:212-258`) count an unmeasured game as a choice, and `runSim` (`simCore.ts`) stops on it.
- **Fix (S-M):** measure in the worker before stopping, and don't stop if the result is no gain. Rename the option to "Sim to next week's call".

**F3. Long sims quietly cost you the counters, and the settings copy says the opposite — P1**

- **What you get:** after any long sim the digest repeats "4 weeks' big games (…) went by in the sim: the staff doesn't put in counters it hasn't measured, so your plan stood."
- **The settings say otherwise:** "A longer one leaves it to the staff, and the digest says what it did." The README says the same.
- **One-seed comparison** (the same season with nothing ever answered or measured; not a paired measurement):

  | Team | Took the staff's calls | Never answered |
  | ---- | ---------------------- | -------------- |
  | DEN  | 56-26                  | 54-28          |
  | MIN  | 46-36                  | 40-42          |

  Logs: `<S>/audit-den-blind.log`, `<S>/audit-min-blind.log`.

- **Why it matters:** sim granularity changes the outcome, so tapping weekly is rewarded busywork.
- **Fix (M):** either let the staff measure and apply during long sims (in the worker, with fewer games), or have no one get them. Fix the settings copy either way.

**F4. Measuring can get stuck, and every stop waits on it — P1**

- **Stuck:** reproduced twice. New league → Timberwolves → Start regular season. The DiVincenzo injury card says "· Measuring" for more than 30s. It only clears after you navigate away and back, or reload. The measuring queue in `src/ui/today/staffPlan.ts` never starts.
- **Slow:** every call stop showed 2.0–6.2s of "Measuring" before the final buttons appeared.
- **The card changes under you:** "Jazz rolling: @ UTA on Saturday" turned into "This week: @ IND on Wednesday" while I was reading it.
- **Fix (M):** finish the measuring before the stop is shown, and fix the stuck queue.

**F5. A collapse gets one "ride it out" — P1**

- **What happened:** MIN lost 13 straight (28-30 → 28-38). There was one call at 5 losses: "Nothing … is a clear fix … ride it out". Then one sim ran through 8 more losses without a word. `SKID_GAP = 8` (`calls.ts:124`).
- **No diagnosis:** the card only says "Outscored by 12.4 a game". It doesn't mention that Edwards and Ball were out, and doesn't give the top reason (the debrief's Why factor).
- **Wrong moment:** that stretch's moment was "Grading all 30 at the break: Timberwolves B" over a 0-8 run (`<S>/shots/t2-eors2.png`).
- **Fix (S-M):**
  - name the main cause and the injuries on the card;
  - escalate the call at 8 and 10 losses;
  - make the streak the digest's moment.

**F6. The deadline call isn't measured and doesn't see the long run — P2**

- **Durant trade:** the staff's call was "buy: Kevin Durant (86) for Cameron Johnson (84) and Christian Braun (76)". Johnson had a ruptured Achilles (out 74). Durant is 38, on $43.9M plus a $46.1M player option, and none of that is on the card. The press graded the deal the same night as a full-screen moment: "Trade grades: Nuggets F, Rockets A+". Nothing reconciles the staff's call with that verdict, and the card has no worth number (the injury card does).
- **When buying fails (MIN):** "Look for a deal" opens Find (`minOvr=77`), and the list starts with SGA, Dončić and Wembanyama, all untouchable.
- **The answered card lingers:** it stays in Needs you as "Trade deadline in 5 days · The last day for deals: Feb 11" with no buttons, and keeps the bell badge at 1 (`<S>/shots/41-deadline-after.png`).
- **Fix (M):** measure what the deal does to net points and playoff odds, and show age and contract years on the card. Filter Find to players who can actually be traded for. Remove the card once it's answered.

**F7. The 10-day call measures the injury but not the cover — P2**

- **What you get:** −2.9 for losing Murray, but no number for Conley.
- **Details come late:** the cover's position, OVR and terms ("PG · 70 OVR, for ten days at the minimum") appear only after the first tap, inside a 4-second confirm window (`Agenda.tsx:40`).
- **Fix (S):** measure the cover too, and show "PG 70, 39" on the button.

**F8. The call that stopped the sim isn't listed first — P2**

- **What happened:** with only "Sim to end of regular season", MIN stopped on Dec 13 for a skid and on Feb 6 for the deadline. Both times Needs you led with the opening-night DiVincenzo injury card, still unanswered.
- **Fix (S):** lead with the call that caused the stop. Let unanswered injury calls age out.

**F9. Worth has no unit and no win chance — P2**

- **What you get:** "+0.9 a game" (points? wins?), while the matchup hero speaks in win %.
- **Fix (S):** write "+0.9 pts ≈ +3% to win Wednesday".

**F10. The counters repeat and sometimes contradict the scouting — P2**

- **Repetition:** DEN's 22 weekly counters were 7 Ice, 7 Drop, 3 2-3 zone, 2 pressure and 3 others. MIN's: 6 pressure, 4 Drop, 4 2-3 zone, 3 Switch and 7 others.
- **Contradiction:** on the SAS plan tab, "the Spurs attacked drop coverage with pull-ups (+1.4)" sits next to "Drop coverage · About +1.0" as the top counter.
- **Fix (M):** when one coverage wins most weeks, make it a one-time season-level call to change the playbook. Keep the weekly calls for things specific to that opponent.

**F11. The payroll goal is failed from opening night (cross-lens: stakes) — P2**

- **What happens:** "Add nothing to the payroll you inherited" uses a target rounded to $0.1M:

  | Team | Target  | Payroll on opening night |
  | ---- | ------- | ------------------------ |
  | MIN  | 215,300 | 215,328                  |
  | POR  | 216,800 | 217,027                  |

  MIN made no moves and still got "$215.3M, $0.0M over (−25)" (`ownerGoals.ts:923-927`). Its job-security card said "Behind: … add nothing to the payroll" all season.

- **Evidence:** `<S>/payroll-check.ts`.
- **Fix (S):** don't round the target, or allow some tolerance.

**F12. The season's biggest stories go untold — P2**

- **The title:** DEN's offseason digest led with retirements and never named the champion (the Spurs, who knocked DEN out).
- **The comeback:** MIN came back from 0-3 against a 58-20 Thunder, and the news line was "Loop Two wins his first playoff series". The moment card said "Series won 4-3".
- **Cross-lens (sim credibility):** a 38-44 eighth seed beating a 58-20 top seed from 0-3 down, and one DEN game with +34.7 points of shooting luck.
- **Fix (S):** lead the digest with the title, and flag historic upsets.

**F13. No season-level reckoning of your coaching — P2**

- **What's missing:** the review page (`/office/career?review=2027`) grades the owner's goals but never tallies your calls.
- **Fix (S):** add a line such as "23 counters put in, measured +21 pts ≈ +0.7 wins; Durant trade: …".

**F14. "Sim to the next big night" changes target without saying so — P3**

- **What happened:** the option said "Christmas Day". The sim landed on Dec 19 (the Lakers game), with no stop line.
- **Copy:** the billing read "Lakers rolling vs the Lakers".

**F15. Quick sim always jumps to the game report — P3**

- From `/team`, both the dock chip and the Play options land on `#/game/N`. The README says it "toasts … without leaving the screen".

**F16. Low-value full-screen moments — P3**

- "Career milestone 5,000 points: Trey Lyles" and "…Jaden McDaniels" each took over the screen.

**F17. Needs you is empty while contracts expire — P3**

- In the re-signing phase, Today's hero says "7 contracts expiring" while Needs you and the bell say "Nothing needs you right now."

**F18. The series-deficit call fires with nothing to offer — P3**

- "Nothing the staff measured beats your plan: keep it, or plan your own" came 4 times in a row for DEN, with no choice in it.

**F19. Power rankings show as a drop at 6-0 — P3 (sim credibility)**

- The digest showed "2nd → 3rd" in red while DEN was 6-0 and 1st in the West.

## 4. Since the first review

| Round-1 finding                          | Status                             | How I checked                                                                                                           |
| ---------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| F1 no decisions until day 93             | **Fixed in count, hollow in kind** | Weekly calls plus skids give 2–7 calls a month; see new F1–F3                                                           |
| F2 skids silent                          | **Partly**                         | The skid call exists, but there's no diagnosis and an 8-game gap (new F5)                                               |
| F3 staff card never changes              | **Fixed**                          | Cards rotated through the season                                                                                        |
| F4 season payoff is a mail               | **Fixed**                          | Season-end hero, review page, and a verdict moment                                                                      |
| F5 All-Star / Cup                        | **All-Star fixed; Cup partly**     | DEN's Cup exit was still only a mail, with a Cup cell on Today's strip                                                  |
| F6 calls can't fix what they raise       | **Still open**                     | Deadline "buy" that finds nothing (MIN), unmeasured trade (DEN)                                                         |
| F7 buttons lie                           | **Mostly fixed**                   | "Plan the series" no longer settles the call; "Leave it to the staff" applies the plan. "Look for a deal" is unfiltered |
| F8 injury call has no number             | **Partly**                         | Injury cost is measured; the cover isn't                                                                                |
| F9 confirm taps lost                     | **Still open**                     | The confirm window is 4s                                                                                                |
| F10 digest shows newest, not best        | **Fixed**                          | Moment of the stretch; no power rankings in your news                                                                   |
| F11 big night lands on an ordinary night | **Fixed**                          | Retargets daily (copy gap: new F14)                                                                                     |
| F12 inbox nobody reads                   | **Fixed**                          | 45 messages, 16 unread                                                                                                  |
| F13 quick sim 3 taps                     | **Partly**                         | Now 2 taps a game                                                                                                       |
| F14 practice never suggested             | **Still open in practice**         | 0 practice calls in either audit season                                                                                 |
| F15 one series decision                  | **Fixed**                          | Deficit calls (they can be empty: F18)                                                                                  |
| F18 offer deadlines move                 | **Not verified**                   |                                                                                                                         |
| F20 owner goals differ a day apart       | **Fixed**                          | "I'll set the final numbers on opening night"                                                                           |

New since round 1: F1–F4, F6's unmeasured trade, F8, F11 and F12.

## 5. Top 5 moves

1. **Make the weekly call a choice or make it silent** (F1, F2, F3). Stop only for billed games with a real gain or a trade-off. Otherwise let the staff apply it and report it. Treat long and short sims the same. Expected: half as many stops, each one worth thinking about.
2. **Measure before stopping, and lead with the stop's cause** (F2, F4, F8). No more cards that vanish, stall or shift under you.
3. **Turn collapses and the deadline into real decisions** (F5, F6, F7): a diagnosis, escalation, and measured trade worth with the contract in view.
4. **Close the loop at season scale** (F12, F13): a coaching tally in the review, the title and historic upsets in the digest.
5. **Plug trust leaks** (F11, F9, F6's lingering card): fix the payroll-goal rounding, show worth as win %, remove answered cards.

### Decisions per month (UI play)

| Month   | DEN (week/month/game mix)                                | MIN (game-by-game → weeks → months)                 |
| ------- | -------------------------------------------------------- | --------------------------------------------------- |
| Oct     | 1 (AI trade), plus 1 stop with no decision               | 2 (injury, offer); the weekly call was auto-applied |
| Nov     | 2 (counter, skid)                                        | 4 (3 counters, skid)                                |
| Dec     | 5 (offer, injury, 3 weekly), plus 1 empty stop           | 1 (Christmas counter)                               |
| Jan     | 2 (10-day, counter)                                      | 0 (43 days, no stop)                                |
| Feb     | 2 (deadline trade, counter)                              | 4 (injury, deadline, offer, skid)                   |
| Mar     | 0, plus 1 empty stop                                     | 1 (13th straight loss)                              |
| Apr–May | 1 real + 3 empty "keep the plan" + 1 adjustment declined | 1 play-in + 4 adjustments                           |

A player who only presses "Sim to end of regular season" gets **3 stops all season** (skid, deadline, play-in).

## 6. What I couldn't verify, and how I tested

**Tested**

- Playwright on a phone viewport with my own persistent profiles, driven through the dock and Play options:
  - **DEN:** a full season and playoffs, mixing quick sims, sim 1 day/week/month, next big night, to deadline, to All-Star and to end, and one live game skipped to clutch then to final;
  - **MIN:** game by game, then weeks, then months; play-in and two playoff rounds;
  - **a third MIN league:** "Sim to end" only, plus the stuck-measuring repro.
- Headless: `<S>/call-audit.ts` (taking the staff's call vs never answering, both teams) and `<S>/payroll-check.ts` (all 30 teams). I read the store only to check what I saw on screen.
- Screenshots are in `<S>/shots/` (86 of them).

**Not verified**

- The odds, floor and books calls (none triggered).
- Practice weekly calls (never fired).
- Cup knockouts, job offers, a second season, Easy/Hard difficulty, and timing on a real phone.
