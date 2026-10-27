# Hoops Career — product review, round 3 (October 2026)

This is the third full review. Ten Opus reviewers each took one lens, played the game in their own headless phone browser, and ran paired-game experiments against the engine. This time they were judged against the best in the genre (Football Manager, Basketball GM, NBA 2K MyNBA), not against round 2. Each played first and only then compared with [round 2](../round-2/PRODUCT-REVIEW.md). The full reports, with evidence, file:line references and screenshot paths, are in [`lenses/`](lenses/).

Two rounds landed since round 2:

- **"Now"**: the staff picks by its own read; biased move verdicts were removed; owner goals are fair.
- **"From 7 to 10"**: a live staff voice built on live measurement; weekly calls only when there's a real choice; the zone retuned, with a style gate in CI; v9 ratings checked against reputation; a moving free-agent market and AI apron discipline; scouting and a living draft class; the real NBA past seeded; a GM legacy; a finish pass.

| #   | Lens                                              | R1  | R2  | R3      | One line                                                                                                                                                                                      |
| --- | ------------------------------------------------- | --- | --- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Onboarding](lenses/01-onboarding.md)             | 6.5 | 7   | **6.5** | The best first ten minutes in the genre, then a trap: the default Wizards are forecast about 10 wins too high, start 0-7, and get a rebuild call at game 7                                    |
| 2   | [Core loop](lenses/02-core-loop.md)               | 5   | 6   | **6**   | Honest and consistent now, but a decision desert: 1-3 stops a regular season, the staff changes your playbook by mail, and a sim error follows every watched playoff game                     |
| 3   | [Game day](lenses/03-game-day.md)                 | 6   | 6.5 | **7.5** | The bench talks and tells the truth: 1.1 measured calls a game, calibrated, about +0.9 each. Crunch time is still mostly silent, and the night's verdict is lost on reload                    |
| 4   | [Tactics & team](lenses/04-tactics-team.md)       | 6   | 7   | **7**   | No dominant setup, and the edit loop works. But the "is costing you" card and the staff's in-season changes run on an unpaired tag tally that has the wrong sign                              |
| 5   | [Front office](lenses/05-front-office.md)         | 6.5 | 7   | **7.5** | A credible AI league and draft-as-story. Free agency overcorrected: an 86 signs for $6.5M on day 14. Picks on the clock are overpriced, and scouting is free omniscience                      |
| 6   | [Stakes](lenses/06-stakes.md)                     | 6   | 6.5 | **6.8** | Targets match the forecast, but the forecast is off at the tails. A title outweighs an $883M loss, and "development year" is a +48 one-tap                                                    |
| 7   | [Career & world](lenses/07-career-world.md)       | 6   | 7   | **7.5** | The NBA past is used ("his fourth straight MVP"), legends' pages reach BBGM level, and there's a GM legacy. The record book ignores that past, and season pages are still shallow             |
| 8   | [UX & IA](lenses/08-ux-ia.md)                     | 7   | 7.5 | **7.8** | 95 routes with zero errors, League fits on a phone, tiers readable for colour-blind players. Tactics is still 3 layers deep, hyphen breaks remain, and bad and warn collapse for deuteranopes |
| 9   | [Sim credibility](lenses/09-sim-credibility.md)   | 6.5 | 6.5 | **7.0** | Ratings fixed (20/20 anchors, Curry 3P 90). OKC wins 9 of 12 titles, 70-win teams are 5× too common, streaks reach 41, and Gobert is a 77 "Rotation" player in his DPOY season                |
| 10  | [Market & platform](lenses/10-market-platform.md) | 6   | 6   | **6**   | The platform still ships-grade, though sims are 30-45% slower. The IP is deeper (the seeded past), there's no store-safe build, and 2K27 Arcade and FM27 Touch launch in November             |

**Overall: about 7.0/10, up from 6.7 and 6.2.** Seven lenses rose. Game day had the biggest jump of any lens in any round:

- The live staff voice is real.
- It is calibrated: shown +0.79 against a true +0.86 over 155 calls.
- It is worth taking.

What separates this app from a 9 has changed again. It is no longer one systemic gap. It is a set of specific inputs that the honest machinery trusts too much:

- **A season forecast with compressed tails.** Owner goals, Today's odds, the press and the default team all inherit it.
- **An engine-tag tally that drives the staff's own decisions.** In paired games it has the wrong sign.
- **A league balance that crowns the Thunder.**
- **Market floors that don't hold.**

Fix those inputs and much of what sits on top of them improves together.

> **Outside the code (your decision, flagged again because it grew):** the public repo and the Pages site now also serve the seeded NBA past since 1947 (`history.json`) and real careers back to 2003. The market reviewer recommends acting before the next push ([market F2](lenses/10-market-platform.md)). Also, your disk was at 99% during this review. I cleared old browser profiles from a previous session's scratchpad, but `/private/tmp/claude-501` still holds several GB of old session scratch.

---

## The six themes

### 1. The season forecast is now the single point of failure

Three lenses found the same thing independently. The opening-night forecast is too compressed: its projection SD is about 7 wins against an actual SD of 10.6–12.4. It also misreads certain rosters by about 10 wins:

| Team                                    | Forecast       | Actual                                                                                              | Source                                   |
| --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Wizards (the new default newcomer team) | ~37.7          | 29.3 on average over 8 seasons; 1.5 wins in the first 7 games; 1 of 12 seasons met the owner's goal | [onboarding F1](lenses/01-onboarding.md) |
| Thunder (AI)                            | 55.6–56.1      | 67–72                                                                                               | [stakes F1](lenses/06-stakes.md)         |
| Kings                                   | 31–33          | 22                                                                                                  | [stakes F1](lenses/06-stakes.md)         |
| Golden State                            | ~32 every time | 42–51                                                                                               | [sim F6](lenses/09-sim-credibility.md)   |

The suspected causes are injury risk that isn't priced and veterans the ratings undervalue.

Everything honest sits on this number:

- the owner's targets, which now match the forecast as intended;
- Today's odds;
- the press's projections;
- the newcomer's default team, picked "nearest the middle" by roster strength.

The results:

- A newcomer's first week is a losing streak against a broken promise, with a rebuild call at game 7.
- The best team carries no stakes ("Secure 87–90" while going 64-18).
- The worst start every career under water.

**Fix:**

1. Calibrate the forecast on simulated seasons so its slope is about 1 at the tails, and price in injury risk.
2. Add a CI calibration check next to star-check (forecast vs result per team, its spread, its 10–90% band).
3. Choose the default team by a headless check that its median season meets its owner's goals.

### 2. The staff's own decisions still run on numbers that aren't measured

The live calls are now exemplary. Other staff voices aren't held to the same standard:

- **The "X is costing you" card, the Season evidence, and the managing staff's automatic in-season coverage changes all sum engine tags one-sidedly.** Paired games disagree in sign: Drop vs Switch favours Drop for 6 of 6 teams by 0.8–2.9 a game, while the tally favours Switch every time. Every coverage tallies as a net loss, so some card always says "is costing you", and the staff churns coverages by inbox mail ([tactics F1](lenses/04-tactics-team.md), [core F9](lenses/02-core-loop.md)).
- **The deadline "buy" shows no numbers.** It recommended Harden at 37, on about $96M over three years, for a team with a profit goal and a youth goal. No age, salary or measured worth is on the card ([core F3](lenses/02-core-loop.md)).
- **The win chance next to a margin call is overstated about 1.7×**: shown +7.4% against a true +4.3%, raw and selected on noise ([game-day F4](lenses/03-game-day.md)).
- **The FA sheet's market prediction is false**: "the most one could pay is $16.4M", and he signed for $6.5M ([front office F8](lenses/05-front-office.md)).
- **The preseason "next review needs about 4 wins" line ignores the rebuild cap** ([stakes F5](lenses/06-stakes.md)).
- **The staff recommends conceding even when pushing scores better** ([stakes F8](lenses/06-stakes.md)).
- **Post-game advice tells you to do what you already did**, and skips the two starters you lost in the opener ([onboarding F3–F4](lenses/01-onboarding.md)).
- **Role stars are mis-scaled.** Towns gets 2★ at his natural role, and a third of the league "suits Hidden" ([tactics F2](lenses/04-tactics-team.md)).

**Fix:** extend the live-call standard to every staff decision. Retire the tag tally as an input: show it only as "what happened", and drive the card and `seasonAdjust` from paired measurement. Measure the deadline deal (net points, odds, contract, goals). Shrink the win-chance figure. Make the FA projection a range or drop it. Price the concede, rebuild and development leans in expected standing.

### 3. The season has too few decisions, and the wrong ones are silent

- **The regular season has almost nothing to decide.**
  - In the UI, the contender stopped once (the deadline) and the middling team three times. From the deadline to the play-in there was nothing.
  - Headless: 1–4 cards a season. The staff makes 1–10 silent picks, worth about 0.04–0.18 wins a season.
  - Measuring adds 45–60% to sim CPU ([core F1, F8](lenses/02-core-loop.md)).
- **Crunch time is mostly silent live.** 45% of live calls come in Q1, and 13 of 144 games had any Q4 call. A blown 17-point Q4 lead got "none clears" until the last possession ([game-day F2](lenses/03-game-day.md)).
- **Options that go nowhere:**
  - "Look for a trade" opens a blank builder, yet counts as a choice that stops the sim ([core F4](lenses/02-core-loop.md)).
  - Series cards with nothing measurable still stop ([core F11](lenses/02-core-loop.md)).
  - A skid diagnosed as "luck" still recommends a trade ([core F5](lenses/02-core-loop.md)).

**Fix direction:** turn what the staff now does silently into a real recurring card every 1–2 weeks. Base-playbook changes, youth minutes vs wins, and drills vs recovery each have two measured options on different horizons, plus a payoff line later. Measure win-chance calls at every dead ball in crunch time. Stop only for real choices. Fill the post-deadline stretch.

### 4. League balance and the market moved, but not to the right place

- **A default champion.** OKC won 9 of 12 observed titles, including a 16-0 playoff run. A 70-win team appears in about 1 season in 5 (5× real). Streaks reach 36–41 against a record of 33. CI's guards don't catch any of it ([sim F1](lenses/09-sim-credibility.md)).
- **Free agency overcorrected.**
  - `summerFloor` turns off exactly when the money can't pay it, so asks fall 15% a day.
  - Ty Jerome (86, ask $45.5M) signed for $6.5M on day 14. 2–7 players rated 78+ sign for under half their market value every summer. Players rated 72–79 still reach the minimum ([front office F1–F2](lenses/05-front-office.md)).
- **Draft night is priced backwards.** Picks on the clock are worth 1.3–1.6× the player they become, so you should sell every first and buy rookies back ([front office F3](lenses/05-front-office.md)).
- **Scouting makes your staff all-knowing for free.** Its read is about 3× sharper than the best AI team's, mostly from the automatic scouts ([front office F4](lenses/05-front-office.md)).
- **Some leaks remain:** cap-space laundering is smaller but still about +45 total ([front office F6](lenses/05-front-office.md)), and the salary floor is invisible until season's end ([front office F7](lenses/05-front-office.md)).
- **Owner money:** a title outweighs any loss (an $883M loss, and "I'm thrilled") ([stakes F3](lenses/06-stakes.md)). "Tell him it's a development year" is a +48-grade one-tap for rebuilders ([stakes F4](lenses/06-stakes.md)). Cutting the three budgets banks free profit-goal points ([stakes F10](lenses/06-stakes.md)).

### 5. Ratings and records still contradict what fans know

- **Defensive veterans are underrated and low-minute bigs overrated.** Gobert is a 77 "Rotation" player with a $5.3M market value in his DPOY season. Draymond is 72 and Dort 73. Paul Reed (13.9 MPG) is 81 ([sim F2](lenses/09-sim-credibility.md)).
- **The tier labels contradict the reputation check.** The check calls 86 "All-Star level", but Curry and Jaylen Brown wear "Quality Starter" ([sim F3](lenses/09-sim-credibility.md)).
- **Threes leaders:** role shooters lead the league and beat Curry's record in 17 of 32 seasons ([sim F4](lenses/09-sim-credibility.md)).
- **Stars score and play below their real lines:** Dončić 27, Jokić 23.6 in 31 minutes ([sim F5](lenses/09-sim-credibility.md)).
- **The record book ignores the seeded past.** A 60-point night is "a league record", and 73-9 tying the real best went unnoticed ([career F1](lenses/07-career-world.md)).
- **The Hall of Fame formula ignores real honours.** Gobert is out and Bane is in, and the coach's Hall of Fame bar is cleared in year 3 ([career F3](lenses/07-career-world.md)).
- **Generated names include a real former player**, "Raul Neto" ([career F12](lenses/07-career-world.md)).

### 6. Trust bugs and ship readiness

- **Bugs:**
  - A sim error follows every watched postseason game: "the sim worker lost track of the results" ([core F2](lenses/02-core-loop.md)).
  - The night's "Your moves" verdict is silently lost after a reload, because `movesWorth` lands after the save ([game-day F1](lenses/03-game-day.md)).
  - Banner nights show the wrong jersey number ([career F5](lenses/07-career-world.md)).
  - Phantom lines say "the card went unanswered" ([core F6](lenses/02-core-loop.md)).
  - The staff's own silent plan ticks the guide step ([onboarding F6](lenses/01-onboarding.md)).
- **Platform:**
  - Sims are 30–45% slower, with 0.3–0.6 s main-thread freezes ([market F6](lenses/10-market-platform.md)).
  - On a slow phone the live voice probably drops from 0.53 to about 0.33 calls a game ([game-day F3](lenses/03-game-day.md)).
  - Native saves are IndexedDB only, at 16 MB by season 3 against Android's 25 MB backup cap.
  - There is no privacy policy or store listing ([market F7–F8](lenses/10-market-platform.md)).
- **Market:** the identity is unlicensed NBA IP, now including the past, and no store-safe build exists ([market F1](lenses/10-market-platform.md)). The hook that would sell is "the basketball sim that tells you why you won, and proves it" ([market F5](lenses/10-market-platform.md)).
- **UX finish** ([ux](lenses/08-ux-ia.md)):
  - Tactics is three navigation layers deep, with the board below the fold.
  - "134- / 133" and "#37- / 48" still break.
  - `--bad` and `--warn` collapse under deuteranopia (ΔE 3.1), and so do the job-security bar's zones.
  - Today has 8 blocks and two primaries.
  - The live tab has three names (Staff, Report, Huddle).
  - Practice lives in four places.

---

## Every P0

| P0                                                                                                                                 | Lens                                        | Size                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| The default newcomer team (Wizards) is forecast about 10 wins high, so 0-7 starts, failed owner goals and a rebuild call at game 7 | Onboarding F1 (root: the forecast, theme 1) | S to change the default; M to calibrate |
| Unlicensed NBA IP, now including the seeded past, with no store-safe build                                                         | Market F1                                   | L                                       |
| The public repo and Pages now also publish the seeded NBA past                                                                     | Market F2                                   | S (your settings)                       |

## Quick wins (S, high value)

**Bugs**

- Resync the worker cache after a postseason live commit ([core F2](lenses/02-core-loop.md)).
- Mark the game dirty when `movesWorth` lands ([game-day F1](lenses/03-game-day.md)).
- Fix the banner-night jersey number ([career F5](lenses/07-career-world.md)).
- Fix the phantom "went unanswered" lines and the youth outlook double-count ([core F6–F7](lenses/02-core-loop.md)).
- Ignore staff-made plans for the guide ([onboarding F6](lenses/01-onboarding.md)).

**Honesty**

- Shrink or drop the win chance shown beside margin calls ([game-day F4](lenses/03-game-day.md)).
- Show age, contract and goal effects on the deadline card ([core F3](lenses/02-core-loop.md)).
- Fix the preseason "next review needs" line ([stakes F5](lenses/06-stakes.md)).
- Make post-game advice aware of the plan played, and add an injury line ([onboarding F3–F4](lenses/01-onboarding.md)).
- Make the skid recommendation follow its diagnosis ([core F5](lenses/02-core-loop.md)).
- Line up the "All-Star" tier at 86 ([sim F3](lenses/09-sim-credibility.md)).

**Early game**

- Pick a default team whose median season meets its goals ([onboarding F1](lenses/01-onboarding.md)).
- Hold odds and rebuild calls and AI offers during the guide weeks ([onboarding F2](lenses/01-onboarding.md)).

**Owner**

- Set the postseason goal by odds, not by strategy label ([stakes F2](lenses/06-stakes.md)).
- Clamp held win targets to the read +6 ([stakes F6](lenses/06-stakes.md)).
- Keep the development-year miss on the grade ([stakes F4](lenses/06-stakes.md)).
- Freeze the tax sign-off at opening night ([stakes F7](lenses/06-stakes.md)).

**Market**

- A hard 80+ free-agent floor until day 20, and a 72–79 floor ([front office F1–F2](lenses/05-front-office.md)).
- Show the salary-floor shortfall on the FA and Office screens ([front office F7](lenses/05-front-office.md)).

**Live**

- Gate the clutch skip and the play call on `closeGame`; default to 2×; auto-dismiss the coach mark ([game-day F5–F8](lenses/03-game-day.md)).
- Have playoff garbage time follow the blowout rule ([game-day F10](lenses/03-game-day.md)).

**Sim guards**

Add star-check limits for:

- streaks (≤ 28);
- 70-win seasons (≤ 1 per 8);
- title concentration;
- the threes leader (≤ 5.2);
- OT rate;
- foul-outs.

Correct the comment on the raised single-game cap ([sim F1, F4, F11](lenses/09-sim-credibility.md)).

**UX**

- `keepFigures` on GamesHub and the draft ranges, plus a lint ([ux F2](lenses/08-ux-ia.md)).
- A lighter `--warn` and zone ticks on the security bar ([ux F3](lenses/08-ux-ia.md)).
- Delete the two uppercase rules ([ux F9](lenses/08-ux-ia.md)).
- One bench tab name ([ux F6](lenses/08-ux-ia.md)).

## Suggested order

**Now: fix the inputs and the bugs.**

- The two trust bugs (the postseason sim error and the lost moves verdict).
- Forecast calibration, with its CI check and a safe default team.
- Retire the tag tally as a decision input.
- Free-agent floors.
- The quick wins above.

Most of the other lenses' complaints trace back to these four inputs.

**Next: decisions and balance.**

1. A recurring two-option staff card built from the silent levers, plus crunch-time calls at every dead ball (theme 3).
2. Find the OKC dynasty lever, and add guards for streaks, 70-win seasons and titles (theme 4).
3. Defense-aware OVR anchors and star minutes and usage (theme 5).
4. Draft-night pricing on one consensus scale, and budgeted scouting (theme 4).
5. Measure the deadline deal and the owner leans (theme 2).

**Later: memory, phone and ship.**

- A record book seeded from the game files, almanac season pages and Hall of Fame tiers (theme 5).
- Measure-ahead for the live voice on phones, and sim-time profiling (theme 6).
- Flatten Tactics and finish the colour-blind signals (theme 6).
- A store-safe build, the offer and the hook, native autosave, a share loop (theme 6).

## Protect these

- **The live staff voice:** measured from the spot, shrunk, calibrated within about 0.1 of the truth, and honest when "none clears the noise".
- **The late play call and the debrief graded by win chance:** "The Elevator you called for Bane tied it."
- **The edit loop:** measured when made, checked on the games played, mailed with a put-back.
- **No dominant playbook or shape,** and the style-gate CI job.
- **20/20 reputation anchors,** with league rates within 5% of the real game.
- **A credible AI league:** almost no re-flips, priced cornerstones, dumps that cost the burden, fair offers.
- **Scouting that can expose a #1-prospect bust,** and a draft class that changes over the season.
- **The seeded past in use:** "a first title since 1982-83", legends' real seasons, honour chips. Also title cards that know the drama, and a GM legacy.
- **One chance to win on every screen,** zero console errors over 95 routes, and League on a phone.
- **Speed, offline play, gzipped backups and privacy.**

## What reviewers couldn't verify

- Real-device performance, which matters now that the live voice's budget is device-bound.
- Native builds.
- A screen reader.
- More than one or two UI seasons for most lenses.
- The fictional league beyond creation.
- The root cause of the forecast's misses. Injury risk and underrated veterans are the leading guesses.
- Legal conclusions, which need counsel.

All timings were taken with ten reviewers loading one machine. Each lens report lists its own gaps.
