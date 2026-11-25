# Ten-Sonnet playtest, round 3 (2026-11-24)

This round used the same ten personas, the same brief and the same Playwright kit as rounds 1 and 2. The build is main `337281b`, the fix commit that followed round 2. Every tester started from a fresh save on a production build (`vite preview`) in headless Chromium, on a 390x844 phone unless their report says otherwise. The reports are in `reports/` and the brief in `BRIEF.md`. Round 2's synthesis is in `../playtest-2026-11-24/`.

## Verdict

**Overall 7.41. Round 1 was 7.45 and round 2 was 7.57. Recommend-to-a-friend was 7.45 (rounds 1 and 2: 7.5 and 7.65).** All ten testers would pay $7.99 on phones again. At $14.99 on Steam, three said yes or probably (03, 04, 01 "if"), five said maybe and one said no.

The overall score is flat across three rounds; each tester's number moves about ±0.5 between rounds, so the change is within noise. The round-2 fixes did land:
- The capologist's payroll goal no longer flips after a trade.
- Losing a free-agent bid now comes with a dollar-figure reason.
- The rebuild is no longer too fast.
- Playoff sims now stop for injuries and elimination games.
- Repeated play-call taps no longer pile up as separate calls.
- Every live call is now measured against a 200-game replay of the night without it.

That last feature answered round 2's top question, and the answer was **"your coaching is inside the noise."** The game-day coach's season ledger reads +4.3 pts ±4.8 over 29 games. The FM lifer saw his game plans move the forecast by 0.

**The new top problem is shooting luck.** Its spread is about two to three times what the game's own "1-in-N night" labels assume. The labels came out at 1-in-920, 1-in-98,160 and 1-in-900,856,495, and half of 06's reports carried a 1-in-30 or rarer label. I verified the cause in the code: the label assumes a spread of 7.5 points, but the sim's luck figure varies far more than that. That one fact sits under three complaints: "my coaching doesn't matter", "the luck numbers look miscalibrated" and "a half lead means nothing". It also strains the honesty layer, which is the game's best-loved feature.

Scores fell in game day (−0.8), coaching depth (−0.6) and sim honesty (−0.55). Part of that is who coached: 06 took a 26-win Chicago team, and 02 and 07 never coached live. The direction still matches the luck finding.

## Scorecard

| Area | R1 | R2 | **R3** | Δ R2→R3 | R3 range | Note |
|---|---|---|---|---|---|---|
| A First hour | 7.3 | 7.55 | **7.35** | −0.2 | 7–8.5 | The checklist and Today work. The re-sign wall and the release-two gate cost points. |
| B Coaching depth | 7.1 | 7.44 | **6.83** | −0.6 | 5–8 | Breadth is still praised (8s from 01 and 06). Testers who didn't coach scored it low. |
| C Game day | 6.8 | 7.31 | **6.5** | −0.8 | 6–8 | The tools are excellent, but every move reads "inside the noise". Live games are still 3-13 minutes. |
| D Front office | 7.6 | 7.06 | **7.2** | +0.15 | 4–8.5 | FA reasons and the AI's trade honesty win. The sell side is dead, and there are loopholes. 06's 4 is barely-used. |
| E Rebuild & dev | 5.9 | 6.06 | **6.38** | +0.3 | 5–8 | The rebuilder gave 8: readable and earned. It is still the lowest area. |
| F Analytics | 7.3 | 7.7 | **7.3** | −0.4 | 6–8.5 | 8.5 from 01, 03 and 05. The calibration doubts (06) and noisy on/off (03) pull it down. |
| G Sim honesty | 6.8 | 7.2 | **6.65** | −0.55 | 5–8 | League means are excellent. The luck spread, top-end outliers and a 71-11 OKC are not. |
| H Stakes & story | 6.9 | 7.45 | **7.3** | −0.15 | 6–9 | The journeyman gave 9 (firing, job market). The owner is too passive for winners and rebuilders. |
| I UX on device | 7.2 | 7.3 | **7.3** | 0 | 7–8 | Phone is good. Sheets block Play (a fourth round running) and there's a save race on close. |
| **J Overall** | 7.45 | 7.57 | **7.41** | −0.16 | 7–8 | |
| Recommend | 7.5 | 7.65 | **7.45** | −0.2 | 7–8 | |

Averages count only the testers who scored an area. B: 04 skipped it. C: 02, 04 and 07 skipped it. E: 06 and 08 skipped it.

## The ten players

| # | Persona | Team / what they did | J R1 → R2 → R3 | One-line take |
|---|---|---|---|---|
| 01 | FM lifer | DAL, 2 seasons: 33-49, then 41-41, won the play-in, lost R1 to SAS | 7.5 → 7.5 → **7.8** | "FM's feedback loop done honestly." Plans are the deepest surface and the one he can least feel. |
| 02 | Rebuilder | CHI from 30th: 26 → 31 → 51 → 48 → 48 wins | 7.5 → 8 → **7.5** | Draft night and FA are great. There's no sell or tank lever, and a PF-heavy 80-88 core stalls at 48 wins. |
| 03 | Analytics | ORL, 2 seasons: 36-46, then 55-27 | 7.5 → 8 → **8** | The best-explained sim. Wants on/off with intervals everywhere. The assistant picks bad minutes. |
| 04 | Capologist | GSW, GM only, ~2.6 seasons | 7.5 → 7.5 → **7.5** | The best cap and trade layer on a phone. Owner goals ignore the roster (youth minutes on a vet team, −100). |
| 05 | Contender | OKC, 4 seasons, 2 titles | 7 → 7.5 → **7.3** | Honest and deep. It's too easy with the starting roster (48-5 by February), and the playoffs have no stage. |
| 06 | Game-day coach | CHI, 31 games live, 9-22 | 7.5 → 7.7 → **7** | The best game-day explanation layer, but luck swings of ±20-45 pts and 1-in-900M nights erase the coaching. |
| 07 | Journeyman | 10 seasons, fired at CHI, hired by OKC | 7 → 8 → **7.5** | Career layer 9. League means are flat for 10 years, but the top end drifts (99s, 44.8 ppg, 73-9). |
| 08 | Purist | DEN GM-only, fictional BOS, OKC title | 7.5 → 7 → **7.5** | Real past lines and records are the hook. Invented coaches and nicknames, and high top ratings, are the drag. |
| 09 | Newcomer | WAS real (34-48, lottery to #2), fictional WAS | 7.5 → 7 → **7** | The first hour is good. The re-sign page is where a newcomer quits, and the fictional league has no hook. |
| 10 | Commuter | BOS, ~20 sessions, 57-25, R2 exit | 8 → 7.5 → **8** | "The best commuter management sim I have used." A draft pick was lost when the app closed within 2 s. |

## Fixed since round 2 (as the testers saw it)

- **Coaching is measured, not guessed.**
  - Every game report replays the night 200 times with and without your timeouts, subs, play calls and tactical changes, for example "timeout +0.5 ±1.1".
  - Season Analysis keeps a season ledger with wins (06, 01).
  - Tactical changes get 10- and 20-game check-ins with intervals, for example "+1.6 a game, give or take 0.4" (01, 03).
  - Round 2's top ask is delivered.
- **FA losses are explained in dollars.** 02 saw "NYK rated higher on record and market, $14.8M from them beat my $16.8M, about $16.9M needed". 03 saw "same salary counts for ~15% more from them". This was round 2's theme 4.
- **The payroll goal no longer flips.** 04 made a deadline trade and later got "$0.1M under +15". `forcedPayroll` now carries inherited salary through trades.
- **The rebuild is no longer too fast.** 02 went 26 → 31 → 51 → 48 → 48. Boozer went 80 → 88 over four years.
- **Playoff sims stop.**
  - 10's sim stopped for Queta's injury.
  - 05's stopped for an elimination game.
  - The Settings text now matches the rule.
- **Repeated play-call taps** no longer stack into ~70 rows (06 didn't see it again).
- **"Sim 1 day plays out your game in progress first"**: nobody was surprised by a game finishing without them.
- **Still holding from round 2:** exact live resume (10, about 8 closes), offline play (a 224 ms cold start), import/restore, no page errors, and league means (03, 07, 08).

## Themes, ranked

### 1. Shooting luck runs two to three times wider than the game says. Major. Verified.
- **The code.** `luckRarity` in `src/ui/games/report/SummaryTab.tsx:319` turns a night's luck into "about a 1-in-N shooting night", assuming `LUCK_SD = 7.5` points. It prints only past 2 SD, which should happen about 5% of the time.
- **The play.**
  - 06's 14 reports had luck of +16.7, −0.2, +19.0, +15.9, −21.2, −33.1, +13.0, −4.9, +27.5, −8.3, +45.7, +8.4 and −7.4. That is a spread near 20, and 7 of 14 were past 2 SD.
  - Other testers' labels: "1-in-920" (05), "1-in-875" (09), "1-in-165" and "1-in-35" (round 2), and "1-in-98,160" and "1-in-900,856,495" (06).
  - 06 also measured a Q1 break where 13-of-24 on 51.3% looks was labelled +15.1 luck. By eFG alone that is about 8-9 points.
- **What it means.** Either the engine's shooting nights are too wild (`K.envTeam` and the shared-night terms in `src/core/sim/engine/constants.ts` around line 385), or the "looks" model leaves real shot-quality differences in the luck bucket. Either way, one figure feeds the margin bridge, the "1-in-N" labels and the noise around every coaching measure. With luck that wide, no lever can be shown to matter.
- **What testers said.** "I won by 41 and was told a billion-to-one thing had happened" (06). "Two ugly starts the preview didn't predict… I can't tell whether that's bad luck twice or the odds are generous" (01).
- **The fix.**
  - Measure the luck figure's real spread over a season of league games, using the gameday-check harness.
  - Bring the engine's night-to-night shooting variance toward the NBA's (06 cites about 7 pts) if that's the cause, or fix the looks model if it's the split.
  - Then set `LUCK_SD` from the measurement, not a constant.

### 2. Coaching is now measured, and it measures as noise. Major.
- **06's season.** Live coaching was +4.3 pts ±4.8 over 29 games ("the staff's bench would have done about as well"). Per game, moves were ±1.
- **01's plans.** Pre-game win% was 75% before and after a counter, a double-team and a matchup for HOU, and 51% before and after for SAC. "Plans are the deepest-looking surface and the one I can least feel."
- **05's coach.** The staff's coach said "nothing the staff would change" in most messages, and a 66-16 team won with default tactics.
- **The season total doesn't match its parts. Verified.**
  - The total was +4.3, but the parts were 82 subs −5.6, 63 timeouts −3.1, 62 play calls −10.1 and 10 tactical changes +0.7.
  - In `src/state/liveWorth.ts`, the total is all moves versus none. Each part is everything versus everything-but-that-kind. Nights with only one kind of move add nothing to the parts.
  - So the parts are neither additive nor over the same games, and `src/ui/tactics/AnalysisTab.tsx` doesn't say so. It is the same pattern as round 2's two luck figures.
- **The fix.**
  - Theme 1 first, because it shrinks the error bars.
  - Then make the parts add up (a Shapley-style split or a leave-in order), or say plainly that they don't.
  - Put game plans in the season ledger, as 01 asked, and let the forecast move when a plan really changes the matchup.

### 3. The top end is too strong; the league averages are fine. Major.
- **League means are near-NBA.** ORtg 115.9-116.4, eFG 54-54.5, 3PA rate 41.7-42.5 and FT rate .249 (03). They held flat for 10 years: ORtg 115-116.5, pace 97, 3PA 41-43% (07). 08 saw 47% FG, 36% 3P and 114 ppg.
- **The outliers.**
  - OKC 71-11 in 03's season and in `season-test` (again).
  - SAS 73-9 and 72-10, Minnesota 10-72, two draftees at 99 OVR, and 44.8 ppg (07).
  - 05's OKC was 14-1 and 48-5 with default tactics, against a forecast of 71 wins.
  - 08: Kawhi 92 at 35, Murray 89, Queta 82 as a backup.
  - The fictional league's top three scorers have PER 32-34 (08).
- **And the reverse.** Jokić is compressed (24.0/11.7/8.9 against a real 27.7/12.9/10.7, `real-check` 25.3 vs 27.5). Embiid is 18.4 vs 26.7, and rim FG% correlates only r 0.32 with the real figure (03).

### 4. The owner reads the record but not the roster. Major.
- **04 (vet GSW).**
  - The owner asked for "1,500 minutes to players 23 or under", graded −100 for 0 young minutes.
  - The next season's ask rose to 2,000 young minutes after he signed Anthony Davis.
  - 04's one change: "Make the owner's goals read the roster."
- **05.** The owner's payroll line rose with his payroll ($232.7M → $274.7M) for two seasons and only bit in year 4. A second-round exit graded −22.
- **02.** Made the playoffs and still got −4. Security sat at 50-54 for five years: "never in danger, so I never felt the stakes".
- **09.** The owner's target reads 26 in the mail and 27 on Today (still).

### 5. Front office: no sell side, and loopholes. Major and minor.
- **No sell side.** No AI team paid a first-round pick for a useful vet at the deadline, and the staff says "no contender bites" (02). The rebuilder couldn't tank with an 83 PG.
- **Position glut is never flagged.** 02's core was Boozer, Essengue, Wilson, Holland, Buzelis, Kuminga and López, all PFs. They stalled at 48 wins, with 82-OVR players at 8-10 ppg.
- **The option-decline loophole.** Declining Powell's $22.6M team option and re-signing him cut his cost to about $10.7M (07, and 02 used it as a "smart trick").
- **No warnings on the re-sign page:**
  - An 82-rated 23-year-old walked over the Early Bird cap with no warning there (07).
  - Free agency opens with two stars unsigned and no warning (02 lost Giddey, 84).
- **The mid-level.** One signing uses the whole MLE, even at $5.0M, and default minimum deals run 3-4 years (04).
- **AI caps.** About 17 of 30 AI teams are over the tax, and Memphis sends the same dump offer every season (04).
- **The re-sign page loses newcomers.** "Committed / Keep everyone / Bird rights / Rookie scale…" with no "do what the staff suggests" (09's one change). For 08, "Make offer" didn't register.

### 6. The playoffs have no stage, and the sim runs the big games. Major for contenders.
- The Finals card looks like a November game, and a title arrives as a digest and an email. There's no banner or trophy scene (05).
- "Sim to end of playoffs" now stops before an elimination game, but nothing asks "coach it or sim it?". 05's G6 and G7 of a conference final ran by.
- The lottery reveal is a text list (02), although 09 called the "jump to No. 2" banner their best moment.

### 7. Live games: still slow, and a few traps. Major.
- **Speed.** About 10-13 minutes per game at 4x (01), about 8 at 2x (05), 3-8 at 4x (06).
- **Timeout pause lock.** Tap Timeout, then Escape, and the game stays paused until you pick a play and press Resume (01).
- **"Sim to the end" with no confirm.** It sits in the top playback bar late in a game, and one mis-tap loses the last 5 minutes (06).
- **Small top controls on a 375 px phone.** Leave, sound, sideways and 3D are 26-32 px tall (10).
- **Staff cards pass quickly at 4x**, and there's no log of recent calls (06).

### 8. Analytics: the confidence layer stops at Lineups. Major for 03.
- **No intervals outside Lineups.** On/off shows as a clean verdict on scouting cards, player cards and team tables ("on/off +54.7" after one game). Only Lineups greys out small samples.
- **The interval disagrees.** The inbox says −0.4 to +1.0 and Season Analysis says +0.3 ±0.3 for the same check (03).
- **The assistant picks bad minutes.**
  - It started a 4-guard five and played Prince (−12.4 on) and Clarkson (−14.1).
  - A bench unit ran −42.7.
  - It warns the user about "too many bigs" but never flags its own choices (03).

### 9. Saving and sheets. Major for 10, minor for others.
- **A save race on close.** Take the staff's draft pick, close within about 1-2 s, and the pick is gone (10). 10's one change: "save every action on tap and show a Saved tick."
- **Sheets block Play after a sim.** Reported by 01, 02, 03, 04, 07 and 09. It's the fourth round in a row.
- **A stale Today card after a live game.** It showed the wrong series score until a reload (05). 01 saw a "Final" vs "Today" mismatch.

### 10. Real vs fictional shell. Minor to major by persona.
- **08.** The real past (2025-26 lines, records, retirements, HoF) is the hook. Invented coaches and nicknames are the drag: "Stirrups" and "Twine" made him wince, and "Denver Arena" reads as a placeholder. He wants a local option to swap in real names.
- **09.** The fictional league has no stars to care about ("Trae Lloyd 82" is a wink, not a star). The default Washington is an over-the-cap rebuild, which is hard for a first-timer.
- **Fictional names.** They reuse real surnames (Şengün, Dort, Russell) (08).

## Bugs (deduplicated)

Repro steps and screenshots are in each report's Bugs section. "Verified" means I confirmed it in the code.

**Game day**
- **Luck rarity labels miscalibrated.** `LUCK_SD = 7.5` against an observed spread near 20 (06; also 01, 05, 09). Verified, see theme 1.
- **Season live-coaching total vs parts.** The total and the parts don't add up and cover different games, with no note saying so (06). Verified, see theme 2.
- **Timeout pause lock** after Escape (01).
- **"Sim to the end" with no confirm** in the top playback bar (06).
- **Leaving during a timeout** resumes on the "Your timeout" screen with no clock note (06).
- **Counters recompute on add.** "Staff still looking…" returns, so a second tap can add a different counter (01).
- **Timeout count fell from 6 to 5** on resume at the same clock (10, unconfirmed).
- **3D first frame** clips players at the left edge (06).

**Season and flow**
- **Sheets block Play** after a sim (01, 02, 03, 04, 07, 09).
- **Stacked cards block preseason Start**, each needing a two-tap confirm (07).
- **Stale Today card after a live game**, and a Final vs Today mismatch (05, 01).
- **"Coach a game live" doesn't tick** if you make no call in the game (09).
- **"Needs you" pill** with an empty queue (10).
- **The owner page** loaded blank once (02).
- **The All-Star moment** appeared in July of the next offseason (04).
- **"Fans: falling"** at 21-4 just after a Cup win (05).

**Front office**
- **Draft pick lost** if you close within about 2 s (10).
- **Re-sign "Make offer"** didn't register (08, headless).
- **"Open free agency" on /office/resign does nothing** (02, 09; 01 in round 2). Only the Play options entry works.
- **Block offer "Propose"** silently did nothing the first time (02).
- **Committed payroll jumped** $219.4M → $227.5M after cancelling a Decline sheet (10).
- **Cap figures disagree** by $0.1-0.2M between Office and the cap sheet; a second payroll figure has no label (04).
- **Payroll and stat count-ups** read wrong mid-animation (04, 03).
- **Contradictory staff advice.** "Buy Butler / the deal should help" next to "barely moves your postseason chances" (05). "Buy Curry" for two firsts (10). The deadline "sell" was a lateral Ayton-for-Wiggins (09).
- **Unclear counter wording.** "Add Claxton + 2030 1st": whose 1st? (02)

**Reports and stats**
- **The same check shows two different intervals** (inbox vs Season Analysis) (03).
- **The /games list links two games** to the same id (03).
- **2026-27 BPM shows "—"** (03, also round 2).
- **Odd scouting line.** "Haliburton 91, 5.0 PTS, 27.2% TS, on/off −40.0" from a tiny sample (01).
- **Clingan's RPG** differs between Records and Leaders, probably team splits (08).

**History and world**
- **GM-only careers credited as head coach** in news and on the Coaches tab (08). Third round running.
- **The backup banner** says "Last backup: never" after an export (10).
- **Fictional names reuse real surnames** (08).

## Suggested order

1. **Measure and fix the luck spread** (theme 1). It is the root of "coaching doesn't matter", "1-in-900M" and "half leads mean nothing". Measure first, then fix the engine variance or the looks model, then set `LUCK_SD` from the data.
2. **Make coaching legible** (theme 2).
   - Reconcile or explain the season total vs its parts.
   - Add game plans to the season ledger.
   - Let the forecast respond to a plan that really changes a matchup.
3. **Rein in the top end** (theme 3): the 71-11 OKC, 73-9 teams, 99 OVR draftees, 44.8 ppg, generous ratings for aging stars, and Jokić compression. Use `season-test` and `star-check` as the gate.
4. **Make owner goals read the roster** (theme 4): no youth-minutes goal for a vet contender, a payroll line that doesn't chase the payroll, and a preseason "can this roster hit it?" note.
5. **Front office** (theme 5):
   - AI contenders pay firsts for useful vets at the deadline.
   - Close the option-decline loophole.
   - Warn about Early Bird and unsigned stars before free agency opens.
   - Flag a position glut.
   - Add a staff-suggested re-sign button for newcomers.
6. **Trust and flow bugs:**
   - Save on tap, with a Saved tick.
   - Fix sheets blocking Play once and for all.
   - Fix the timeout pause lock.
   - Add a confirm to "Sim to the end".
   - Fix "Open free agency" on the re-sign page.
   - Fix GM-only coach credit.
7. **Give the playoffs a stage** (theme 6): a coach-it-or-sim-it prompt before elimination games, a distinct Finals card, and a title scene.
8. **Extend the confidence layer** to every on/off number, and have the assistant flag its own bad units (theme 8).

## Caveats

- **Different saves each round.** Each tester played a fresh save with different teams and luck. Per-tester deltas of ±0.5 are noise, and three rounds of flat overalls (7.45 → 7.57 → 7.41) mean no real change in overall. Read the area shifts and the reasons.
- **Who coached shapes the scores.** 06 picked a 26-win team (9-22), and 02, 04 and 07 coached no live games, so B, C and G rest on fewer and harder samples.
- **Headless Chromium with software rendering.** 3D and frame-rate judgements are a floor. A few bugs may be artefacts of the scripts: 08's "Make offer", 10's timeout count and 01's counter re-roll.
- **Sonnet testers cluster at 7-8.** The verified code findings (themes 1 and 2) carry more weight than the decimals.
