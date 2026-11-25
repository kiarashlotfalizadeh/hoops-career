# Ten-Sonnet playtest, round 6 (2026-11-25)

This round reused the personas, brief and kit from round 5. The build is main `aef1ad5`, which adds two fix commits to round 5's build.

**`344f508`**
- Lottery news and mail are held until the reveal is watched.
- Draft-class first names are unique.
- The counter-measurement queue is reworked.
- Clutch-skip wording changed.

**`aef1ad5`**
- The foul-trouble panel and the staff's sub picker share one limit.
- Clutch time always stops at 5:00 left in the fourth, even in a decided game.
- A deliberate timeout gives the calling team a short huddle boost.
- Deadline cards check value, age and window, and default to Stand pat.
- Low-star-minutes warning.
- Stale manual targets are reset when the roster turns over.

Every tester started a fresh save on a production build (`vite preview`) in headless Chromium, on a 390x844 phone unless their report says otherwise. The reports are in `reports/`, the brief in `BRIEF.md` and the exact persona prompts in `PERSONAS.md`. These are saved this round, so later rounds reuse them word for word. Round 5 is in `../playtest-2026-11-25-r5/`.

**One setup change:** `star-check` was taken off 03's and 07's allowed scripts, because its 8 × 12-season run outlasts their 10-minute limit. I ran it myself (below).

## Verdict

**Overall 7.65, down from round 5's 7.90 but the third-highest of six rounds (7.45 → 7.57 → 7.41 → 7.71 → 7.90 → 7.65). Recommend was 7.7.**
- Four testers scored 8 (01, 02, 05, 10), five scored 7.5, and one scored 7 (09).
- All ten would pay $7.99 on phones.
- On $14.99 for Steam:
  - **Yes or probably, with a condition (6):** 01, 02, 03, 05, 06 and 08.
  - **Maybe or only if (4):** 04, 07, 09 and 10.

**Read the drop as noise first.**
- Seven testers moved by 0.5, the noise band. Four went down and three went up (05, 06, 10).
- Every tester scored 7 or more.
- The two areas that fell most are thin samples:
  - **Rebuild (−0.62):** the scorers had a contender, no picks, or one offseason.
  - **First hour (−0.4):** five 7s, for two-tap confirms, overlay stacks, jargon and a 40-point opener. None of those changed between builds.
- The machine was heavier this time: load ~14 on 4 cores (05), so live games ran slower than in round 5.

**Game day rose most (+0.5, to 7.06), its best since round 2.** The round's fixes showed up there:
- **Clutch skip stopped at 5:00** in every report that used it (02, 05, 10). 10 played out a 102-105 finish and lost by one, where round 5 skipped it to the final.
- **Last-possession calls won and lost games.**
  - 06: "Elevator: McCollum", a buzzer three to win 116-113.
  - 05: a G4 timeout Iso, "Est. +5% win", then a 0-2 comeback to a Game 7 win.
- **No foul-trouble ping-pong** in 06's 9 games or anyone else's.
- **Deadline cards became honest.** 03, 01 and 10 got "barely moves your postseason chances / stand pat", and 04's sell card was labelled "could hurt". Round 5's "Davis … should help" didn't come back.

**The top problem is narrower now: coaching measures as noise, and the staff's pre-game counters rarely show.** 01 set about 35 game plans and saw "Staff still looking…" on nearly all of them. I timed the measurement: about 8 s on a quiet core (theme 1). So it resolves, but too slowly for a phone, and it starts again every session.

## Scorecard

| Area | R1 | R2 | R3 | R4 | R5 | **R6** | Δ R5→R6 | R6 range | Note |
|---|---|---|---|---|---|---|---|---|---|
| A First hour | 7.3 | 7.55 | 7.35 | 7.8 | 7.9 | **7.5** | −0.4 | 7–8 | Five 7s: two-tap confirms, overlay stack at the first tip, jargon, a 40-point opener (09). |
| B Coaching depth | 7.1 | 7.44 | 6.83 | 6.94 | 7.06 | **7.0** | −0.06 | 6–8 | 8s from 01, 05 and 06. The staff counters' "Staff still looking…" (01) and the assistant re-taking control (07) cost it. |
| C Game day | 6.8 | 7.31 | 6.5 | 6.89 | 6.56 | **7.06** | +0.5 | 5–8.5 | Clutch stops, last-possession calls and graded moves. 05 8.5, 02/06 8; 07 (one game) 5. |
| D Front office | 7.6 | 7.06 | 7.2 | 7.83 | 7.78 | **7.83** | +0.05 | 7–8.5 | 04 8.5. FA bidding and trade explanations still lead. FA-wait decay and the all-or-nothing mid-level remain. |
| E Rebuild & dev | 5.9 | 6.06 | 6.38 | 6.57 | 6.62 | **6.0** | −0.62 | 5–7 | Mostly testers who didn't rebuild. 02 (who did) gave 7: five years ended on a play-in. |
| F Analytics | 7.3 | 7.7 | 7.3 | 7.65 | 7.9 | **7.95** | +0.05 | 6–9 | 9s from 01 and 05. 03 verified box, on/off and league means by hand. Two names for one margin reading remain. |
| G Sim honesty | 6.8 | 7.2 | 6.65 | 6.6 | 6.75 | **6.55** | −0.2 | 6–7 | Hot single games (138-137, 134-96), 20-30 pt luck lines, a contender's 68-14 and 67-15. |
| H Stakes & story | 6.9 | 7.45 | 7.3 | 7.55 | 7.5 | **7.7** | +0.2 | 6–9 | 9s from 02 and 07 (owner as opponent; job market). |
| I UX on device | 7.2 | 7.3 | 7.3 | 7.45 | 7.55 | **7.3** | −0.25 | 6–8 | Offline, backup and resume hold. Stale resume label, sticky sheets, two-tap confirms. |
| **J Overall** | 7.45 | 7.57 | 7.41 | 7.71 | 7.90 | **7.65** | −0.25 | 7–8 | |
| Recommend | 7.5 | 7.65 | 7.45 | 7.7 | 7.9 | **7.7** | −0.2 | 7–8 | |

Averages count only the testers who scored an area:
- **B and C:** 04 skipped them (GM only).
- **D and E:** 06 skipped them.

## The ten players

| # | Persona | Team / what they did | J R4 → R5 → R6 | One-line take |
|---|---|---|---|---|
| 01 | FM lifer | DAL, 2 seasons: 41-41 (swept by 69-win OKC), 38-44 then upset 65-win OKC in 7; ~40 live sittings, ~35 plans | 7.8 → 8 → **8** | "The best why-did-that-happen layer in a sports sim", but the staff's counters never showed and plans gave no reward loop. |
| 02 | Rebuilder | CHI from 30th: 20 → 31 → 34 → 44 → 45 | 8 → 8 → **8** | Clingan max signing was the heartbeat. Ratings vs results diverged (85/82/81 → 34-48), and five years ended on a play-in. |
| 03 | Analytics | DEN: 57-25 (conf. finals), then 36-46 with Jokić out 29 games | 7.5 → 8 → **7.5** | Box, plus/minus, league means and on/off all reconcile. The owner asked for 34 wins after 57. |
| 04 | Capologist | GSW, GM only: 41-41, 42-40, 31-51 | 8 → 8 → **7.5** | Every rule checks out by hand. FA-wait decay and the all-or-nothing mid-level are the exploits. |
| 05 | Contender | OKC: 68-14 (title, from 0-2 down in the WCF), 67-15 (title), 60-22 (SGA ACL) | 7.5 → 8 → **8** | The G7 comeback felt earned. The owner's payroll line can't be met by a dynasty, and the regular season is a cakewalk. |
| 06 | Game-day coach | ATL, 9 games live, 4-5 | 7.5 → 8 → **7.5** | A buzzer-three play call won a game. The staff's Blitz was shredded while its own breaks said so. |
| 07 | Journeyman | 11 seasons: CHA, BKN, BOS, DET (fired), OKC | 8 → 8 → **7.5** | Career layer 9 again. A pre-season tank grades +62, and the new rotation reset overrode a deliberate benching. |
| 08 | Purist | OKC GM-only (64-18), NYK GM+HC (49-33), fictional OKC (title) | 7.6 → 8 → **7.5** | Contract and pick fidelity is uncanny. 275-point games, flat FA pricing, a drafted #5 he couldn't find. |
| 09 | Newcomer | WAS real (35-47, play-in, #3 pick), fictional WAS (11-9) | 7.5 → 7.5 → **7** | The guide queue carries the first hour. Cap jargon is a wall, and the first live game was a 40-point loss. |
| 10 | Commuter | BOS, ~1.3 seasons, 49-33 | 7.7 → 7.5 → **8** | "Best commuter loop": exact resume at breaks, offline, backup in 2.6 s. The resume card shows a stale score. |

## Fixed since round 5 (as the testers saw it)

- **Clutch skip stops at 5:00.**
  - 10: Clutch time at 102-105, then a timeout sheet with Iso Tatum or Hammer.
  - 02 used it in all three of its live games.
  - 05: "Clutch skip … decide[s] games."
  - Round 5's "jumped straight to the final" is gone.
- **No foul-trouble ping-pong.** 06's 9 games logged none. 02 saw clean "Clingan 5 fouls, Claxton in" chips.
- **Deadline cards are honest.**
  - 03: "forecast barely moves your postseason chances", stand pat.
  - 01: stand pat on Bridges.
  - 04: "Sell to SAS … The deal could hurt" (labelled).
  - 09's sell of Davis came with "barely moves".
  - Round 5's "Buy Anthony Davis … should help" for a 2-for-1 didn't recur.
- **Stale year-1 minutes didn't wreck a season.** 03 had no repeat of round 5's 37-45 collapse.
- **The lottery reveal holds its news.** 09 and 02 saw the reveal sequence before the mail.
- **The deadline stop holds** (10, 03), and so do offline play, resume and backup (10). There were no page errors in any session.
- **Top end, by star-check on this build** (8 leagues × 12 seasons, run by the lead):
  - scoring leader max 38.5 ppg, median 33.7, 0 seasons at 40+;
  - 3 of 96 seasons with a 70-win team;
  - no 99s.
  - Round 5 measured 37.1 / 33.2 / 7.
  - 07's ten seasons agree: leaders at 31-34 ppg.

## Themes, ranked

### 1. The staff's pre-game counters rarely show, so plans have no feedback loop. Major for 01.

- **01:** "On every Game Plan page I opened (about 35 games) … every counter read 'Staff still looking…'". It added counters blind, and Season Analysis then said its own settings "Cost you".
- **What the measurement does.**
  - It runs a few seconds of simulated games in the sim worker (`useCounterWorth.ts`, `core/ai/counterWorth.ts`).
  - Its readings are kept in memory only, so every new session starts again.
  - A page left early cancels or defers it.
- **Timed by the lead on this build.** On `/games/<opp>?tab=plan` the four counters went from "Staff still looking…" to verdicts in about **8 s**, at a load average of 1.5.
- **Why testers rarely saw verdicts.**
  - With ten browsers on 4 cores it is several times slower.
  - Scripts read a page within a second or two.
  - A real phone core is slower than this server's.
- **Fix.**
  - Store the reading on the plan or league (the plan's own worth is already kept as `GamePlan.worth`).
  - Measure the next opponent during sims.
  - Show the last reading for that opponent while a fresh one runs.

The coaching-as-noise finding from rounds 4-5 continues more quietly:
- 01's live moves read "−0.9 ±1.2 … inside the noise".
- 08's halftime switch read "−0.4 ±0.6".
- But game day rose, and 05 and 06 each had a play call decide a game. The huddle boost and last-possession calls give the coach moments; plans still don't.

### 2. The staff's in-game defense advice contradicts its own break reports. Major for 06.

- **06:** the staff's recommended "Blitz the Ball" lost by 38, 6 and 18, with "beat the blitz … Hedge or Drop instead" in every break report.
- **Fouls came with it.** It shot −9 and −17 on free throws, and committed 16 personal fouls to 9, with nothing warning that pressure was driving the fouls.
- **01:** every one of its settings was flagged "Cost you" in Season Analysis.
- **What's needed.** The playbook fit grade and the live break reports should agree. When a break says a scheme is being beaten, the staff's live card should offer the switch.
- **06's other ask:** auto-pause or a bell when the opponent starts a run. At 4-8x "a 10-0 run can pass before I react".

### 3. The owner's goals can be gamed one way and are unwinnable the other. Major for 05 and 07.

- **The payroll line can't be met by a dynasty (05).**
  - The line is "the contracts I inherited plus $18.6M" and "moves with those deals, never with what you add".
  - Extending its own stars scored the Money goal −100, and job security fell from 77 to 44 at 20-7 with two titles.
  - The tax bill ($89M, then $338.6M; "keep everyone" ≈ $500M) has no cost except that goal.
- **A pre-season tank grades well (07).** Gutting BOS before the season reset the goal to "win about 8 games" and graded **+62**. Getting fired took six seasons of deliberate work. The "bar doesn't come down" rule only applies after a poor season.
- **Win targets reset too low after a breakout (03).** 57-25 and a conference final, then "win about 34".
- **Fix.** Scale the payroll line with a contender's own re-signs and extensions. Set win targets from prior seasons as well as the roster. Make a sell-off before the season something the owner agrees to.

### 4. Front office: free-agency decay, the mid-level and the cap wall. Major for 04, 02 and 05.

- **Waiting out free agency (04, a second round).**
  - Asks fall 30-45% in week 1, and 77-79 vets are still there on days 15-22 near the minimum.
  - Powell (79) cost $4.35M on day 29 against a "market" $10.6M.
  - Paul George (79) cost $3.45M on day 17.
- **The mid-level is all-or-nothing (04).** A $3.65M signing used the whole $14.0M, with no warning that it spends the exception. Taxpayers still get the full amount.
- **No way to dump salary (05, a second round after 02 and 07 in round 5).** Block offers for Caruso only returned salary.
- **Fit is invisible while shopping (02).** An 85/82/81/80 roster went 34-48 on Spacing D. The grades exist in Season Analysis but not on the FA or trade sheets.
- **Re-signs eat cap space without saying so (02).** "Leaves $5.6M of cap space" never says it kills the FA plan.
- **FA pricing is flat (08).** Almost every 77-78 player asks about $14M × 4.
- **A staff-built trade the AI refuses (04).** The staff's deadline card for NAW returned "Atlanta has changed its mind" on Confirm.

### 5. The rotation reset now overrides deliberate choices. Major for 07. Verified.

- **The cause.** The round-5 fix (`newSeason` in `season.ts`) switches a manual rotation back to the assistant when two starters leave, three newcomers enter the top 8, or a top-two healthy star is planned under 28 minutes. Pinned "Keep as set" players are exempt.
- **What 07 saw.** It had benched every star on purpose, and a season went 44-38 with them playing.
- **The only notice** is an Assistant Coach inbox mail ("Rotation refreshed for the new roster").
- **The fix also helped.** 03 (round 5's victim) had no repeat.
- **What's needed.** Treat a star set to 0 minutes, or a whole lineup the coach dismissed, as deliberate. Show the reset on Today, not only in the inbox.

### 6. Sim spread: hot single games, big luck lines, easy contender seasons. Major for 08, minor for others.

- **Scores.**
  - 08: NYK 138, PHI 137, with 112 in the first half.
  - 06: 134-96, 130-124.
  - 09: 132-92 and a 172-point game.
- **Luck lines.**
  - 01: "+1.1 / +30.2", "+1.5 / −34.1".
  - 06: −29.2.
  - 09: −25.9 in its first game.
  - 01 asks whether "the luck model overstates, or scores are too volatile". League means are normal (03: ORtg 117.1, pace 98.0).
- **Contender seasons.**
  - 05: 68-14 and 67-15, with nothing pushing back before the playoffs.
  - Round 5's 05 saw 54-64-53, so this is seed-dependent.
  - star-check's first-season best records: 60-70 (median 64-65).
- **Paint scoring.** 72 of OKC's 74 two-point points came in the paint, 29-33 at the rim (03). One game, but an analyst flags it.
- **One-sided Game 7s.** 08 saw a 34-point home loss.

### 7. Analytics labels: one reading, two names. Minor-major for 03.

- **03:** "Tactics +15.0" in the factor list and "looks +7.9" in the margin identity, for what reads as the same thing. In playoff G1 it was Tactics +1.8, looks +24.5.
- **Round 5 verified** that these are different quantities: shot quality at average attempts, versus total look points. They are still shown as if one.
- **On/off has no small-sample shading** while lineups do. Holmes −17.0 on 148 minutes would get the wrong man benched (03).

### 8. Newcomer friction. Major for 09.

- **Cap jargon on the re-sign page:** "Bird rights", "rights let you pay $9.7M at most", TO/PO and the mid-level. 09: "the point where I'd start guessing."
- **The first live game was a 40-point loss** labelled mostly luck. 09 asks for a pre-game note on the roster's weaknesses (two F grades) and what to try.
- **A staff "lean" changed minutes unseen.** It came "on a card you left on Oct 21", gave young players minutes, and "seems to hurt" (09).
- **The lottery page doesn't mark the user's team**, and Skip didn't reveal the order (09).

### 9. Flow on a phone. Minor to major.

- **The Today resume card shows a stale score:** "Q1 · Tied 0-0" while the save is at 7-10. Mid-quarter resume loses about 15 s (10).
- **Overlays stack at the first tip:** "watch sideways", "3D slow", camera tips and the coach card (06, 09, 10). The court tutorial's "Next" opens "Around the league", which then sticks over the tab bar (08).
- **Confirms are inconsistent.**
  - Extensions sign on one tap; re-signs need "Confirm: sign him" (02, 07).
  - Team-option Decline/Exercise didn't visibly change committed payroll (04).
- **A live game can block the calendar.** One left on "Clutch time, Not close" blocked the next day (01). A game closed mid-way appeared to finish itself (05).
- **Tablet is still a stretched phone page** (10), though desktop has a two-column Tactics page and a two-column 3D layout (10, 06).

## Bugs (deduplicated)

Repro steps and screenshots are in each report's Bugs section. "Verified" means I confirmed it in the code.

**Front office**
- **The re-sign sheet's contract total doesn't match the contract** (09: $102.1M on the sheet, $96.1M in the news; round 5's 04: $129.9M vs $122.4M; round 4's 07 too). Verified.
  - Both ratios (1.0624, 1.0613) equal 8% raises over 5% raises across five years (1.0617).
  - The sheet totals at the Bird-rights 8%, and the contract written by `signPlayer` → `signingTerms` → `raiseWith` comes out at 5%.
  - Either the player gets smaller raises than promised, or the sheet overstates them. Three rounds running.
- **The staff's deadline trade card fails** on Confirm with "Atlanta has changed its mind" (04).
- **The mid-level shows "Used"** while bids are pending (04, 03), and a $3.65M signing spends the whole exception (04).
- **Dead money on $2.4M minimum deals** contradicts the "not guaranteed until opening night" text (04, a second round). The salary floor is missing from "How the cap works" (04).
- **Team-option Decline/Exercise** doesn't change the committed total (04).
- **A drafted #5 (Noah Moore) couldn't be found** after the draft, while other rookies landed in a "Release 2" prompt with $8.9M of dead money (08). Not verified.
- **The draft board gives three different numbers for one player:** 93% at #5, "rank 12th", "Big reach" (02).
- **A staff-suggested signing was out for 57 games**, unmentioned on the button (07).
- **A lost FA bid gives no message** (10). Other testers did get loss mail, so this may depend on the route.

**Game day and reports**
- **The staff's counters stay on "Staff still looking…"** for about 8 s at best, and longer under load or after a reopen (01; theme 1). Verified as timing, not a hang.
- **Sub options missing** from a starter's sheet with no reason (06).
- **"Skip stopped: X is hurt"** has no break UI to continue from (01).
- **The Play options sheet's first button has no label** (01).
- **The tutorial "Next" opens "Around the league"**, which then sticks over the tab bar (08).
- **The live game runs on** while the Players, Tactics or Stats tabs are open (round 5's 01; 06 asks for auto-pause on runs).

**Season, flow and world**
- **The rotation reset overrides a deliberate benching**, with an inbox-only notice (07). Verified, see theme 5.
- **Power rankings showed 23rd** for a 6-3, +6.1 team (03).
- **The player-grades table omits one of 13 players** who played (03).
- **The Today resume card shows a stale score** (10).
- **": Washington Mages. Home" stray text** at the top of every screen, likely a live region (09).
- **The owner label differs** between setup steps ("frugal" / "builder"), and the welcome mail says 27 wins while the goals mail says 26 (09).
- **Team abbreviations shown as cities** (GSW, NOP, SAS) (08, a third round); "Michael Porter Jr.." double period (08).
- **The career record "371-531" wraps** on a 390 px screen (07).
- **"Go to the draft" silently closes the job window** (07).
- **The trade partner picker shows no cap space** (07).
- **A GM-only user wins Coach of the Year** (08).

## Suggested order

1. **Make the staff's counters show** (theme 1).
   - Persist each reading.
   - Pre-measure the next opponent during sims.
   - Show the last reading while re-measuring.
   - Then add the "your plans over N games" ledger 01 asked for.
2. **Fix the re-sign contract total** (verified, three rounds). Make the offer sheet and `signPlayer` use the same raise.
3. **Make the staff's defense advice agree with its break reports, and warn on fouls from pressure** (theme 2). Consider auto-pause on an opponent run.
4. **Owner goals** (theme 3).
   - A payroll line that scales with a contender's own re-signs.
   - Win targets that remember prior seasons.
   - A pre-season sell-off that needs the owner's agreement.
5. **Respect deliberate rotations** (theme 5). Don't reset stars set to 0 by choice, and surface the reset on Today.
6. **Front office** (theme 4).
   - Slow late-FA decay for 75+ players.
   - A divisible (and taxpayer-sized) mid-level.
   - A salary-dump-with-sweetener route.
   - Fit grades on FA and trade sheets.
   - A warning that re-signs consume cap space.
   - Let the staff's trade cards only offer deals the AI will accept.
7. **Sim spread** (theme 6). Look at single-game score variance and the size of luck lines; league means are fine.
8. **Labels and newcomer friction** (themes 7-9).
   - One name for the margin reading.
   - On/off sample shading.
   - Tap-to-explain for CBA terms.
   - A first-game weakness note.
   - A resume card with the saved score.
   - One overlay at the first tip.
   - Consistent two-tap confirms.

## Caveats

- **Fresh saves each round.** Per-tester deltas of ±0.5 are noise. Six rounds read 7.45 → 7.57 → 7.41 → 7.71 → 7.90 → 7.65. This round's −0.25 is inside what fresh saves and a heavier machine produce. No tester reported a regression caused by the new commits, except the rotation reset's side effect (theme 5).
- **Heavier load.** 05 measured a load average of 14 on 4 cores. Live games and the counter measurement ran slower than in round 5, which weighs on C, I and theme 1.
- **Who coached:**
  - 01 coached ~40 live sittings, 05 ~25 and 06 9.
  - 02 and 09 coached 3, 08 and 10 one or two, 03 and 07 one, and 04 none.
  - 06 lost about 26 minutes to its own scripts parked on a timeout screen.
- **Short of brief.** 05 played 3 seasons, not 4. 06 coached 9 live games, not 25. 10 played ~1.3 seasons.
- **Headless Chromium with software rendering.** 3D and speed judgements are a floor.
- **Sonnet testers cluster at 7-8.** The verified findings (the contract total, the rotation reset, the counter timing) and the repeated ones (FA decay and the mid-level from 04 twice, owner goals from 03, 05 and 07) carry more weight than the decimals.
