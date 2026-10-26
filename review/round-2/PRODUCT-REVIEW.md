# Hoops Career — product review, round 2 (October 2026)

This is the second full review. Ten Opus reviewers each took one lens and played the game in their own headless phone browser. Most also ran headless paired-game experiments against the engine. They played first and only then compared with [round 1](../PRODUCT-REVIEW.md). Their full reports, with evidence, file:line references and screenshot paths, are in [`lenses/`](lenses/). This page brings them together.

Since round 1, three rounds of work have landed:

- **Trust.**
- **Can't put it down.** Measured live calls and tactic edits, a weekly staff call, a chronicle, contract burden and pick projection.
- **Game-files seed.** The real league was rebuilt from NBA box scores and play-by-play, with the app's own impact estimate replacing Dunks & Threes.

| #   | Lens                                              | R1  | R2      | One line                                                                                                                                                                                 |
| --- | ------------------------------------------------- | --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Onboarding](lenses/01-onboarding.md)             | 6.5 | **7**   | 7 taps to tip-off, a sane default team, coach marks, a measured counter. Now the trust gap: the staff's default playbook ranks below its own read, and day-2 odds say "season's over"    |
| 2   | [Core loop](lenses/02-core-loop.md)               | 5   | **6**   | 2–7 calls a month instead of none until day 93. The commonest one, the weekly call, is a rubber stamp, and long sims quietly skip it                                                     |
| 3   | [Game day](lenses/03-game-day.md)                 | 6   | **6.5** | Following the staff no longer costs points, and the late play call is measured and wins games. The bench is now nearly silent: 0.05 calls a game                                         |
| 4   | [Tactics & team](lenses/04-tactics-team.md)       | 6   | **7**   | A real feedback loop ("Since you changed it"); defense read r 0.89, shape r 0.63. The assistant runs worse than its own read, and the 2-3 zone is best for 22 of 30 teams                |
| 5   | [Front office](lenses/05-front-office.md)         | 6.5 | **7**   | Dumps cost assets, picks priced by projection, AI offers fair. Free agency's top end is a dead market; cap space launders value                                                          |
| 6   | [Stakes](lenses/06-stakes.md)                     | 6   | **6.5** | The four job moments landed, and tanking no longer pays. Goals can be failed before tip-off or gamed with two sliders, and your team pick sets the difficulty                            |
| 7   | [Career & world](lenses/07-career-world.md)       | 6   | **7**   | 33 moments in six seasons, legends sent off properly, a chronicle. Still no real history, no GM legacy, and year 10 looks like year 1                                                    |
| 8   | [UX & IA](lenses/08-ux-ia.md)                     | 7   | **7.5** | One chance to win everywhere, search and Back fixed, zero console errors. Four visible layout breaks, Tactics still four control rows deep, tier colours fail colour-blind players       |
| 9   | [Sim credibility](lenses/09-sim-credibility.md)   | 6.5 | **6.5** | The engine is an 8: rates within 5%, extremes tamed, no exploit. The new seed's rating cards contradict reputations (Curry 3P 82, Kennard an 87 "All-Star"), and AI OKC caps out at 1.9× |
| 10  | [Market & platform](lenses/10-market-platform.md) | 6   | **6**   | Platform about 9 (API 36/AAB, iOS manifest, 1.35 MB backups, kill-safe sims). The IP and data path is unchanged and now publicly exposed                                                 |

**Overall: about 6.7/10, up from 6.2.** Every lens but two rose, and round 1's four P0s are fixed, apart from the IP one:

- following the in-game assistant no longer loses games;
- free agency no longer re-signs a star for less than he turned down;
- getting fired is a moment.

The work changed the product's main problem. It used to be that numbers weren't measured. Now the measuring is good, but three things around it aren't:

- **The staff doesn't act on its own measurements.**
- **Measuring made it quiet or a formality.**
- **The game's goals and economy reward gaming more than judgment.**

> **Act now (P0, outside the app):** the market reviewer found the repo `kiarashlotfalizadeh/hoops-career` is **public with no licence**, the app is live on **GitHub Pages**, and the `data-raw` branch hosts an 8.2 MB tarball of **cached Basketball Reference pages**. Sports Reference's data-use terms forbid building tools on scraped data. Make the repo private or delete `data-raw`, and turn Pages off or deploy a fictional-only build ([market F1](lenses/10-market-platform.md)).

---

## The six themes

### 1. The staff measures honestly and then doesn't follow its own numbers

Round 1's complaint was "the numbers aren't measured". Most now are, and well:

| Measurement                 | Result                                       |
| --------------------------- | -------------------------------------------- |
| Defense style read          | r 0.89                                       |
| Shape read                  | r 0.63                                       |
| The night's moves, replayed | within 0.35 of a 1,000-replay reading        |
| Late play call, top option  | +4.4 of a possible +4.6 points of win chance |

The new failures are places where the app contradicts its own measurements:

- **The assistant knowingly picks worse than its read.** "Let the assistant manage" adds a hidden 8-point lean toward the coach's own playbook (the README says 3) and bans itself from the zone (`NOT_A_BASE`). Across the league, the staff's pick is the measured best for only 4 of 30 offenses and 6 of 30 defenses. For the reviewer's team, handing back to the staff cost **−0.76 ± 0.23 a game** ([tactics F1](lenses/04-tactics-team.md)).
  - A newcomer sees this on day 0: the playbook the staff set ranks 3rd–5th in the staff's own picker. A week later the staff says "Blitzing is costing you" about its own default ([onboarding F1](lenses/01-onboarding.md)).
- **Copy that quotes numbers that don't reproduce.** "Assistant adjusts in simmed games: measured over 17,280 games, about +0.5 a game". Two reviewers measured −0.09 ± 0.15 and −0.07 ± 0.20 ([game-day F4](lenses/03-game-day.md), [tactics F8](lenses/04-tactics-team.md)).
- **Live move verdicts are biased toward "Working".** In a placebo test (change nothing at the trigger point), 17 of 69 read "Working" and 0 read "Not working", because of regression to the mean ([game-day F3](lenses/03-game-day.md)).
- **The debrief misses or contradicts measured results:**
  - It grades a game-winning late call (+9% to win, measured) as "too close to say", because it judges by points only ([game-day F5](lenses/03-game-day.md)).
  - It offers one-tap "Next time" counters (Stay home, double their star) that the staff has measured as costs ([game-day F6](lenses/03-game-day.md)).
- **Labels that misreport:**
  - The Tactics hero says "Switch Everything" while the staff changed the coverage to Drop ([ux F5](lenses/08-ux-ia.md)).
  - Today's "Postseason 9%" is not the owner's goal: the play-in is about 21% ([onboarding F3](lenses/01-onboarding.md)).
  - The owner's "read of the roster" differs from the season forecast by 4–8 wins for several teams ([stakes F5](lenses/06-stakes.md)).

**The fix is one rule on top of the measurement rule: the staff acts on what it measured, and every label agrees with it.**

- Drop or show the philosophy lean, and pick by the read.
- Re-measure the "+0.5" copy, or remove it.
- Remove the Working / Not working labels and let the replayed night give the verdict.
- Grade late moves by win chance.
- Gate the debrief's one-tap advice on measured worth.
- Label the hero "edited" or "Custom" when the staff has changed it.
- Label Today's odds by the owner's goal.
- Set the owner's read from the forecast.

### 2. Measuring made the staff quiet or a formality

The honesty fixes removed bad calls but put little in their place.

- **The bench is nearly silent.** In 360 headless games it made 0.047 actionable calls a game. Across six watched games it made zero, including a 43-25 playoff quarter.
  - `callCosts` drops any call with a negative raw mean even inside the noise. 10 of 16 measured call kinds are cut ([game-day F1](lenses/03-game-day.md)).
  - The touchline levers really swing games (±1–3 points) but show no numbers before you commit ([game-day F2](lenses/03-game-day.md)).
- **The weekly call is a rubber stamp.** About 25 a season, each worth +0.5 to +2.5, about 0.6–0.9 wins in total. The staff's pick is also what happens if you don't answer, and "Keep your plan" is never right. That breaks `weekCall.ts`'s own rule that a call whose honest answer is always the same isn't a choice ([core F1](lenses/02-core-loop.md)).
- **The weekly call misbehaves around sims:**
  - It stops a week sim for a card that disappears seconds later ([core F2](lenses/02-core-loop.md)).
  - Measuring can stall for more than 30 seconds ([core F4](lenses/02-core-loop.md)).
  - Long sims skip the counters entirely, while Settings says the opposite. On one seed that was 46-36 versus 40-42 for MIN ([core F3](lenses/02-core-loop.md)).
- **The ledger rarely says anything.** Tactic verdicts resolve to about ±0.5–0.66 a game, so most say "Even". Edits made before closing the app on the Team tab never reach the ledger, and same-day edits merge into one entry ([tactics F3–F5](lenses/04-tactics-team.md)).
- **One option dominates.** The 2-3 zone is best for 22 of 30 teams (+1.27 a game), and only the user can run it ([tactics F2](lenses/04-tactics-team.md)).

**Fix direction:**

- **A live voice from live measurement.** At breaks and after runs, measure 3–5 candidate changes from the current spot with `measureChoices` (the machinery is in `state/liveWorth.ts`). Propose the best one that clears its noise, with its number. Do the same for touchline changes when they're made.
- **Weekly calls only when there's a real choice.** Stop only for a real trade-off or real stakes, otherwise apply silently and list it in the digest. Long and short sims should be treated the same.
- **Ledger fixes.** Persist the edit snapshot, measure edits separately, and run larger background checks.
- **Retune the zone and remove `NOT_A_BASE`,** with a CI gate on style diversity.

### 3. Goals and economy reward gaming over judgment

- **Owner goals failed before you play:**
  - "Add nothing to the payroll you inherited" is broken on opening night for 9 of 13 teams. The causes are rounding the target down and dead money from the game's own forced cuts ([stakes F1](lenses/06-stakes.md), [core F11](lenses/02-core-loop.md)).
  - On Hard, a bad roster is a scripted firing: an ultimatum to "reach the play-in" at 0.0% odds ([stakes F4](lenses/06-stakes.md)).
- **Owner goals gamed cheaply:**
  - Lower ticket prices and raise budgets before opening night, then put them back: the profit target is set from the gamed values. It saved one Hard coach from being fired ([stakes F2](lenses/06-stakes.md)).
  - Concede the season and play the kids, and you beat pushing for wins by about 60 points of grade ([stakes F3](lenses/06-stakes.md)).
  - Your team pick sets the difficulty more than the preset does: targets range from 9 wins below the forecast to 11 above it ([stakes F5](lenses/06-stakes.md)).
- **Market holes:**
  - The top of free agency is dead. No AI team has cap room, so stars sit unsigned for 30 days and then go home cheap. Players rated under 80 sink to the minimum by day 9 ([front office F1–F2](lenses/05-front-office.md)).
  - Cap space launders value. Absorbing a tax team's good player turned 26 value into 75 in one preseason deal, because tax savings count as value ([front office F3](lenses/05-front-office.md)).
  - Cornerstones go for two good players ([front office F8](lenses/05-front-office.md)).
  - On draft night a pick sells for less than the player it becomes ([front office F11](lenses/05-front-office.md)).
- **AI credibility:**
  - AI-to-AI churn: 16 of 104 traded players moved twice or more in a season ([front office F6](lenses/05-front-office.md)).
  - AI OKC climbs to 1.9× the cap with no apron cost, and a team posts 70+ wins in about 1 simulated season in 6 ([sim F3](lenses/09-sim-credibility.md)).

### 4. The new seed's rating cards break belief

The engine reproduces players well, but the visible attributes and OVR tiers contradict reputations, some worse than in round 1:

- **Attributes:**
  - Curry's three-point rating is 82, behind eight players.
  - Gafford, Kessler, Filipowski and Keldon Johnson have a 99 mid-range.
  - Finishing is 99 for 57-66 OVR role players.
  - Giannis rates 72 at drawing fouls.
- **OVR tiers:**
  - Kennard is an 87 "All-Star" with a $44.9M market value.
  - LeBron, Jaylen Brown and Mobley are 81 ([sim F1–F2](lenses/09-sim-credibility.md)).
- **It spreads into the trade economy:**
  - Cheap 87-rated shooters (Spencer, Jerome, Joe, Kennard) are worth more in trades than Brunson or Booker.
  - A 3.7-minute two-way player asks $23.1M ([front office F10](lenses/05-front-office.md)).
- **The cause** is the derivation priors in `scripts/data/derive.ts:269-278` and the displayed OVR.
- **Fix:**
  - Shrink mid-range to a positional prior when attempts are low.
  - Rank threes by makes per 36 at the top.
  - Blend production and usage into the displayed OVR, or rename the tiers.
  - Add a reputation regression to `real-check`.

Other outliers still open: three-point leaders above Curry's record in 15 of 32 seasons, OT 3.3% against a 4.7% target, few late timeouts, foul-outs about 2× real, fast-break points high, stars at 32–33 minutes ([sim F4–F9](lenses/09-sim-credibility.md)).

### 5. The world remembers, but not your past or the NBA's

Round 1's "0 moments in 5 seasons" is fixed: 33 moments in six seasons, owner verdicts, legends' farewells, banner nights, a chronicle. What's left:

- **No real history.** LeBron's Hall of Fame card reads "an All-Star selection in this league". Kawhi's chips are "All-NBA · Player of the Month". There's no defending champion ([career F1](lenses/07-career-world.md)).
- **No GM legacy.** Ten years show 14 Coach of the Month tiles and nothing about the players you drafted or built ([career F2](lenses/07-career-world.md)).
- **Flat title moments.** A Game 7 buzzer-beater title gets the same card as a sweep ([career F3](lenses/07-career-world.md)).
- **Year 10 Today looks like day one** ([career F4](lenses/07-career-world.md)).
- **Copy bugs kept forever in the chronicle.** "wins his second in three seasons MVP" ([career F5](lenses/07-career-world.md)).
- **The chronicle keeps trivia over records.** It dropped a 67-point night ([career F9](lenses/07-career-world.md)).
- **Banner nights can expire unseen** ([career F10](lenses/07-career-world.md)).

### 6. Ship-readiness is now about IP, data and offer, not code

- **The platform is close to store-grade:**
  - Android: API 36, AAB, a required release key.
  - iOS: Light mode, a privacy manifest, the encryption key, portrait lock.
  - Saves: backups at 1.35 MB gzipped, sims that survive a hard kill, offline mode.
- **Still blocking:**
  - Public exposure (the P0 above).
  - Unlicensed NBA/NBPA IP, and a "fictional" league that keeps the real franchises.
  - Seed inputs with unrecorded provenance and terms.
  - No price or offer.
  - No privacy policy or store listing.
  - Native saves only in WebView IndexedDB.
  - An icon that doesn't match the in-app mark or read as basketball.
  - No share loop ([market F1–F9](lenses/10-market-platform.md)).
- **The landscape moved:** NBA 2K26 Arcade Edition now puts a licensed GM-plus-coach mode on iPhone through Apple Arcade. The hook has to be "tells you why you won", not "real NBA".

### Also: visible finish problems ([ux](lenses/08-ux-ia.md))

- **Four layout breaks:**
  - The Finances hero overlaps its caption on phones.
  - The compact report board shows "L… 94 – 118 L…".
  - Headlines break mid-word ("Timberwolve / s").
  - Records wrap at the hyphen.
- **Tactics** still has four rows of controls.
- **League** has 8 sections behind clipped tab rows.
- **One owner score has two names** ("Steady" and "Watchful").
- **Tier colours** collide with the warning and "good" colours, and fail colour-blind players.
- **About 25 core terms are missing from the glossary**: counter, luck, Keys, Fluid, the playbook and role names, PER, Win shares ([ux F15](lenses/08-ux-ia.md), [onboarding F6](lenses/01-onboarding.md)).

---

## Every P0

| P0                                                                                                                   | Lens        | Size                      |
| -------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------- |
| Public repo with no licence, a live Pages site, and a public `data-raw` branch of scraped Basketball Reference pages | Market F1   | S (your account settings) |
| Unlicensed NBA/NBPA IP blocks any store release; "fictional" keeps the real franchises                               | Market F2   | L                         |
| The in-game assistant is effectively silent (0.05 calls a game), against the promise of a big in-game role           | Game day F1 | M/L                       |

## Quick wins (S, high value)

**Honesty**

- Drop or show the assistant's philosophy lean, and have it pick by its own read (tactics F1, onboarding F1).
- Re-measure or remove the "+0.5 a game" copy (game-day F4, tactics F8).
- Remove the Working / Not working move labels (game-day F3).
- Grade late moves by win chance in the debrief (game-day F5).
- Label the Tactics hero "edited" or "Custom" after staff changes (ux F5).
- Label Today's odds cell by the owner's goal (onboarding F3).
- Fix the plan strip's only button, "No plan", so it offers "Add <counter>" (onboarding F2).

**Goals**

- Round the inherited-payroll target up, count forced dead money, and allow ±$0.5M (stakes F1, core F11).
- Set the profit target from standard levers (stakes F2).
- Cap the Hard floor at the owner's read, and give only ultimatums with at least a 25% chance (stakes F4).

**Loop**

- Measure before stopping, and lead with the stop's cause (core F2, F8).
- Fix the Settings copy about long sims (core F3).
- Add a diagnosis and escalation to the skid call (core F5).

**Live**

- "Clutch time" stops only when the game is close.
- Offer the play call only inside `closeGame`.
- Default to 2× (game-day F8–F10).

**Market**

- 72–79 OVR free-agent price floor (front office F2).
- Name the rule that blocks "Trade for #1" (front office F5).
- A 60-day re-trade cooldown for AI teams (front office F6).

**World**

- Fix the "his second in three seasons MVP" templates (career F5).
- Feed `titleLine` and the Finals MVP into the title moment (career F3).
- Add a preseason kicker with tenure and history (career F4).
- Stop banner nights from expiring (career F10).

**UX**

- Fix the four layout breaks (ux F1, F2, F7).
- Use one word ladder for the owner's score (ux F4).
- Add about 25 glossary entries (ux F15, onboarding F6).
- Separate tier colours by lightness and move them off the warning and "good" colours (ux F8).

**Ship**

- Write a privacy policy page (market F9).
- Lock Android phones to portrait (market F10).
- Default league names to the team and season (market F13).

## Suggested order

**Now: outside the code, plus trust.**

- Resolve the public exposure.
- Then the honesty quick wins and goal-fairness fixes above. Each removes a place where the app contradicts its own numbers or punishes a player for doing nothing.

**Next: give the measurement a voice and real choices.**

1. A live staff voice from live measurement at breaks, plus measured touchline changes (theme 2).
2. A weekly call that is a real choice or silent, with long and short sims treated the same (theme 2).
3. Retune the 2-3 zone, remove `NOT_A_BASE`, and add a style-diversity gate (theme 2).
4. Fix the ratings derivation and displayed OVR, with a reputation regression test (theme 4).
5. Restart the free-agent market (exception bids, re-signing during the market), close tax-relief laundering, and put the AI under apron discipline (theme 3).

**Later: depth, memory and the business.**

- Seeded real history, a GM legacy and drama-aware title moments (theme 5).
- Scouting and a living draft class.
- A store-safe identity with real rosters via an imported league file.
- Pricing, a hook and a share loop.
- Native autosave.
- Flatter Tactics and League.

## Protect these

- **The late play call:** measured, sorted best first, and it wins games ("Elevator: Joe +9% to win"). It's the best moment in the game.
- **The "Since you changed it" loop:** a measured line on Done, a check after the games played, mail, and a one-tap put-back.
- **"Your moves" replayed 200 times in the debrief,** and the luck line.
- **The four job moments and the season verdict,** and legends' farewells and banner nights.
- **Trade value that prices contracts and picks,** a dock that explains itself, fair AI offers, and the draft-night theatre.
- **One chance to win everywhere,** search and Back, and zero console errors across 88 routes.
- **The engine's league shape:** rates within 5%, extremes tamed, and no tactic exploit across 37 settings.
- **Speed, offline play and kill-safe saves.**

## What reviewers couldn't verify

- Native builds on devices.
- Real-phone sim speed.
- A screen reader.
- More than one or two UI seasons for most lenses.
- The fictional league in the UI (one reviewer's run built the real league by mistake).
- Legal conclusions, which need counsel.

Each lens report lists its own gaps.
