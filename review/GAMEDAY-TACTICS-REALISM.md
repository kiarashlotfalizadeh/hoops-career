# Game-day tactics realism review

November 10, 2026, on commit f27e467. This review covers only tactics: the choices a coach makes and how the engine plays them. That means the playbooks, shapes, action weights, shot profile, tempo, transition and the glass on offense. On defense it means schemes, ball-screen coverages, help, pressure, physicality, the press, off-ball switching, star plans, roles and matchups. It also covers set plays, the AI coaches' choices and in-game adjustments, and what the staff tells you. Everything is measured against real NBA basketball.

It applies the bar you set: it doesn't have to be perfect, it's just a game. Every finding says whether a player would notice it.

## Score: 69 / 100 (about 78 as a game)

**The toolkit is rich and most levers push the game the way basketball says they should. Three things break it: junk defenses that beat almost anyone, AI teams whose styles are random, and a few sliders whose costs or ranges are far off the NBA's.**

- **What's right.**
  - **A real coach's toolkit.** Six playbooks, four shapes and five action weights on offense. On defense: man, two zones, box-and-one and triangle-and-two; drop, hedge, ice, switch and blitz; help, pressure, the press, off-ball switching and a star plan. Add roles, matchups, late-game management and called plays after timeouts.
  - **The levers move the right numbers, and each has a cost.**
    - Help trades rim shots for threes.
    - Pressure forces turnovers but sends more players to the line and gets beaten off the dribble.
    - Drop protects the rim and gives up pull-ups.
    - A 2-3 zone gives up threes and offensive boards; a 3-2 zone takes the threes away.
    - The press speeds the game up and tires your own legs.
  - **The ranges are realistic.**
    - The tempo slider spans 9 possessions a game, the NBA's whole range of team paces.
    - The AI league's teams spread like real teams in pace, three-point rate and turnovers forced.
  - **Most single choices are worth less than 1.5 points per 100 possessions on average.** That is the size of real schematic edges, and the best choice depends on the opponent.
  - **Plays are worth what they should be, in order.** Cuts score best and isolations and pick-and-roll handlers least, as Synergy's 2024-25 numbers have them.
  - **A matched set play pays and gets scouted.** A well-chosen after-timeout set is worth a quarter to a third of a point on its first run, and less each time it's repeated.
  - **The staff talks like a staff.** "Beat zones with motion and cuts, shooters in the corners and a high-post passer." "No zone against strong rebounding teams."
- **What a player would notice.**
  1. **Junk defenses beat almost anyone.** A triangle-and-two played all game is the best defense in the game: +2.2 points per 100 on average, positive in all six test matchups. Against star-led teams a box-and-one or triangle-and-two beats drop coverage by 3 to 6 points per 100 (the Warriors +6.4, the Lakers +5.2). NBA teams use these for a handful of possessions a season. You can pick either one from the live Tactics panel.
  2. **AI teams play random styles.** Each AI coach's offensive and defensive philosophy is drawn at random (`teamFactory.ts:163-176`). The sim's teams match their real franchises' play types at a correlation of −0.21 to +0.26. Real teams carry their own styles from one season to the next at 0.60 to 0.74. The Warriors' scouting card says "Runs Grit & Grind at a slow pace". Your own staff calls every playbook a "Similar fit" for the Nuggets, and picks Pace & Space for Jokić.
  3. **The AI coaches' coverage mix and adjustments aren't the NBA's.**
     - AI defenses switch 6.5% of ball screens; the NBA switched 18% in 2020-21, and more since. They hedge 24%.
     - Every AI man-to-man defense switches all off-ball screens.
     - In-game adjustments run 1.6 a game, nearly all a flip between drop and hedge. They include two the code's own notes measured as losing (drop to hedge, −1.9 a game; staying home on shooters, −3.4).
     - AI coaches never adjust their offense.
- **What only the numbers show.**
  - **Crashing the glass.** In the NBA, the fifth of teams that crash hardest give up no more fast breaks than the fifth that crash least. In the sim, a full crash multiplies the opponent's run-out chance by up to 5.5, so "never crash" is a free +1.0 per 100, and teams' offensive rebounding varies half as much as in the NBA.
  - **Physicality.** The slider moves opponents' free-throw rate by about 40 points from end to end, more than three times the NBA's team range. At 0 it's a free +0.8.
  - **Motion.** Setting the motion weight to 0 is a free +1.2.
  - **Inert levers.** Shapes and mismatch hunting barely change anything.
- **Recommendation.** Fix the junk defenses, then the AI's styles along with its coverage mix and losing adjustments. Then narrow the crash cost and the physicality range, which are two constants. Leave the rest.

### Scorecard

"As a game" counts only what a player could see: in the live game, the box score, the game report, the scouting card, the staff's reads, or by trying a tactic for a few games.

| Area                                   | Weight  | Strict | As a game | Why                                                                                                                                                                                                                |
| -------------------------------------- | ------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The toolkit: what a coach can choose   | 10      | 9      | 9.5       | Nearly every NBA tactic is there, with the right names and trade-offs. No offense-defense substitutions late, and no lineup-specific schemes                                                                       |
| Levers do the right things             | 20      | 16     | 18        | Pace, transition, threes, rim, glass, help, pressure, press, coverages, zones and mentality all move the right stats with a cost. Shapes and mismatch hunting barely do anything; blitz forces almost no turnovers |
| Effect sizes and balance               | 20      | 11     | 14        | Most choices are within ±1.5 per 100, as in the NBA. Junk defenses beat almost anyone; crashing costs far more than in the NBA; physicality's range is three times the NBA's; motion 0 is a free gain              |
| Personnel fit                          | 10      | 7      | 7.5       | Actions, coverages, zones and matchups are all scaled by the players. Every playbook "Similar fit" for the Nuggets; Hub Big no better for Jokić; drop barely punished by Curry                                     |
| What happens on the floor (play types) | 15      | 11     | 13        | Synergy's efficiency order and transition volume are right. Cuts and roll-man finishes too common, isolations rare, teams' half-court styles more different than real teams'                                       |
| AI coaches' tactics                    | 15      | 7      | 8         | Sensible game plans against you. Random styles, a coverage mix off the NBA's, every man defense switching off the ball, adjustments that lose, no offensive adjustments, no sets                                   |
| Staff reads and feedback               | 10      | 8      | 8         | Sound advice, play-by-type points, shot quality kept apart from luck. "Similar fit" for everything; scouting cards show invented identities                                                                        |
| **Total**                              | **100** | **69** | **78**    |                                                                                                                                                                                                                    |

## Would a player notice?

| What's off                                    | Where a player would see it                                           | Would they notice?          |
| --------------------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| Junk defenses beat almost anyone              | Trying a triangle-and-two from the live Tactics panel for a few games | Yes, anyone who experiments |
| AI teams play random styles                   | Every scouting card ("Warriors: Grit & Grind at a slow pace")         | Yes, any NBA fan            |
| Your staff calls every playbook a similar fit | The playbook chooser                                                  | Yes                         |
| AI adjustments are drop/hedge flips           | "NOP adjusts: hedges ball screens instead of dropping", over and over | Maybe                       |
| Shapes and mismatch hunting do nothing        | Changing them and seeing no difference                                | Maybe                       |
| Crashing costs too much; motion 0 is free     | Only by measuring over many games                                     | No                          |
| Physicality's range                           | Only at the slider's ends, in free-throw totals                       | Rarely                      |
| Cut and roll-man shares high, isolations rare | "What they're running" in the live game                               | No                          |

## How this was measured

- **Paired experiments**, through the engine's own lab (`core/ai/lab.ts`, as `scripts/tactic-sweep.ts` uses it). Paired means the same game seeds were played with and without each change.
  - **Levers.** 47 settings, each against the team's own setting. Six real matchups from the 2026-27 league, 200 games each: 1,200 games a setting, about 56,000 in all.
  - **Coverages.** Five ball-screen coverages, a 2-3 zone and both junk defenses. Played by three defenses (Chicago, Miami, Sacramento) against nine offenses: the Warriors, Thunder, Lakers, Knicks, Wizards, Pacers, Grizzlies, Celtics and Cavaliers. 250 games each, about 54,000 in all.
  - **Set plays.** `scripts/tactic-impact.ts` (150 games).
- **The AI league as it plays.** Round 4's six seasons (seeds 307-521, 7,386 games): play types by team, the ball-screen coverage on each trip, every in-game adjustment, and team ranges.
- **Real NBA numbers.**
  - **Synergy play types** from NBA.com: all ten types for every team in 2024-25, and four types in 2025-26 for how styles carry over.
  - **Ball-screen coverage shares:** Second Spectrum's 2020-21 figures as reported in the press (drop 58%, switch 18%, blitz 3%).
  - **The 2024-25 and 2025-26 play-by-play** in `data/raw/games`: team ranges and the cost of crashing the glass (60 team-seasons).
- **Code.** An agent mapped every lever to the engine code. I checked the claims this review relies on:
  - the crash leak (`possession.ts:150-153`);
  - random coach philosophies (`teamFactory.ts:163-176`);
  - the AI's losing adjustments (`coach.ts:16-25`);
  - off-ball switching in every man-to-man preset (`tactics.ts:115-164`).
- **A live game in the app.** Nuggets at Pelicans, with the triangle-and-two picked from the live Tactics panel at 11:49 of the first quarter. Also the playbook chooser and the staff's reads.

## Findings

### 1. Junk defenses beat almost anyone (P1)

**What it is.** The box-and-one and the triangle-and-two put one or two chasers on the opponent's main creators and play zone behind them. You can pick either from the live Tactics panel or the guard planner. Played all game:

| Opponent (three defenses averaged) | Box-and-one vs drop, per 100 | Triangle-and-two vs drop |
| ---------------------------------- | ---------------------------- | ------------------------ |
| Warriors                           | +5.3                         | +6.4                     |
| Lakers                             | +3.7                         | +5.2                     |
| Cavaliers                          | +3.2                         | +4.2                     |
| Pacers                             | +2.4                         | +1.7                     |
| Knicks                             | +1.9                         | +1.2                     |
| Wizards, Grizzlies, Thunder        | about 0                      | about 0 to +0.7          |
| Celtics                            | −2.3                         | +0.4                     |

Against each team's own defense across the six lever matchups, the triangle-and-two is +2.2 per 100 (±0.4). It comes out positive in all six; the box-and-one is +1.1. No other single defensive choice comes close.

**Why it's wrong.**

- NBA teams play junk defenses for a few possessions, against one shooter, and good offenses carve them up.
- A defense worth 5-6 points per 100 against star-led teams would be the biggest schematic edge in basketball, and every team would use it.

**Why it happens.**

- The chased player gets 0.16 times his usual touches and late catches, and his usage limit drops (`usage.ts:117-118`, `usage.ts:51`).
- AI offenses never adjust (`coach.ts:78-163` only changes defenses), so nobody attacks the four-man zone behind the chasers.

**Fix.**

- Let the chased star keep more of the ball. A real box-and-one costs him touches, not four-fifths of them.
- Give the zone behind the chasers the 2-3's weaknesses at full size: open threes and offensive boards.
- Let an AI offense answer a junk defense the way it answers a zone.

**Target:** about −1 to +1 per 100 on average, positive only against a lone scorer with no shooting around him.

### 2. AI teams play random styles (P1 as a game)

**What it is.**

- Each AI coach's offensive and defensive philosophy is a random pick of six (`teamFactory.ts:163-176`), with a +8 lean in the fit models toward it (`coachAI.ts:890-895`).
- Nothing ties a real team to how it plays; only players' tendencies are fitted to real data.

| Play type (Synergy, team share) | NBA team-to-team SD, 2024-25 | Sim team-to-team SD | Real teams, 2024-25 vs 2025-26 | Sim teams vs their real 2024-25 selves |
| ------------------------------- | ---------------------------- | ------------------- | ------------------------------ | -------------------------------------- |
| Isolation                       | 1.9                          | 2.5                 | +0.73                          | +0.26                                  |
| Post-up                         | 1.6                          | 2.2                 | +0.74                          | +0.09                                  |
| Cut                             | 1.25                         | 3.0                 | +0.60                          | +0.07                                  |
| Off screen                      | 1.25                         | 2.1                 | +0.61                          | −0.02                                  |
| Handoff                         | 1.3                          | 2.1                 | —                              | −0.21                                  |
| Spot-up                         | 2.5                          | 3.9                 | —                              | −0.08                                  |
| Transition                      | 2.2                          | 1.4                 | —                              | +0.22                                  |

Real franchises keep their styles from one season to the next, even through roster changes. Denver leads the league in post-ups both years, and the Warriors lead in cuts and off-screen plays. The sim's teams are even more different from one another than real teams in the half court, but in random directions.

What a player sees:

- The scouting card: "Warriors: Runs Grit & Grind at a slow pace".
- The playbook chooser: your staff rates all six offenses a "Similar fit" for the Nuggets, and defaults to Pace & Space (pace 88) for a Jokić team.
- Round 4's finding: Jokić's assists, 7.8 against his real 10.7.

**The coverage mix** (every ball-screen trip in six seasons):

| Coverage | AI league | NBA (Second Spectrum, 2020-21)                |
| -------- | --------- | --------------------------------------------- |
| Drop     | 44%       | 58%                                           |
| Switch   | 6.5%      | 18% (and rising since)                        |
| Hedge    | 24%       | part of the remaining ~21%, with ice and zone |
| Ice      | 17%       |                                               |
| Zone     | 5%        |                                               |
| Blitz    | 3.5%      | 3%                                            |

**Fix.**

- Seed each real team's coach philosophy, playbook and coverage from its real play types and coverage tendencies. The data pipeline already reads players' play types (`cache_pbp_*`).
- Keep the random draw for fictional leagues and new hires.
- Make the playbook fit tell Hub Big apart for a passing center. Round 4's Jokić fix depends on this.

### 3. AI in-game adjustments and habits (P2)

- **Adjustments:**
  - 1.61 a game; 81% of games have at least one.
  - What they are, over 7,386 games: "drops the big" 5,491, "hedges instead of dropping" 4,007, "stops blitzing" 1,159, "back to man-to-man" 483, "stays home on shooters" 378, "backs off the ball" 359, "packs the paint" 6.
  - Every one is a defensive change. AI coaches never change their own offense: no more pick-and-roll for a hot handler, no attacking a mismatch, no going at a zone.
  - The code's own notes (`coach.ts:16-25`) measured two of the common ones as losing: drop to hedge (−1.9 a game) and staying home on shooters (−3.4). Your assistant skips them; AI coaches still make them.
- **Off-ball switching.** Every man-to-man preset switches all off-ball screens (`tactics.ts:115-164`). That kills handoffs and most set plays and gives up about 6% more offensive boards. In the NBA it's one team's choice, not everyone's.
- **What only you get.** AI teams never call sets or plays after timeouts, never set a mentality or a shape, and game-plan only against you. Against you, AI defenses play zone on 11% of trips, against 5% against each other.
- **What's sound.** The game plans against you are basketball:
  - a 2-3 zone against a five that can't shoot;
  - a box-and-one on a 28%-usage star with poor shooters around him;
  - doubles only for a high-usage star who doesn't pass;
  - otherwise their best perimeter defender on your star.

**Fix.** Drop the two losing adjustments for AI coaches as for your assistant. Add one or two offensive adjustments: feed the hot hand's play type, or attack a zone. Give each preset its own off-ball switching.

### 4. Crashing the glass costs far more than in the NBA (P2: numbers only)

| Measure                                                                  | NBA 2024-26 (60 team-seasons) | Sim (180 team-seasons) |
| ------------------------------------------------------------------------ | ----------------------------- | ---------------------- |
| Team offensive rebound %, SD across teams                                | 2.8 points                    | 1.6 points             |
| Opponent pushes within 6 s after its defensive board: top-fifth crashers | 27.6%                         | 31.1%                  |
| ... bottom-fifth crashers                                                | 27.3%                         | 23.7%                  |
| Correlation of a team's crashing with those pushes                       | +0.05                         | +0.58                  |

In the lab, crashing at 100 lifts offensive rebounds by 5.8 points, but the opponent's transition share almost triples (7.8% to 22.2%). The cost is the crash leak (`possession.ts:150-153`): ×(1 + 4.5 × crash past 50), up to 5.5× the opponent's run-out chance at 100. "Never crash" is +1.0 per 100 for free.

Getting back below 50 costs run-outs and gains almost nothing: +0.7 points of offensive boards at 0 (`rebounds.ts:42`), yet the "Crash" and "Crash hard" glass levels set it to 45 and 30.

**Fix.** Shrink the leak to a small per-possession cost, so crashing teams pay little in run-outs, as the NBA's do. Let getting back below 50 buy offensive boards. Expect the AI's teams to spread out on the glass.

### 5. Sliders with free gains or out-of-range effects (P2)

- **Physicality** (in the live Tactics panel's Fine-tune):
  - At 0 the opponent's free-throw rate falls from 0.27 to 0.09, and at 100 it rises to 0.49. NBA teams allow 0.20 to 0.32.
  - At 0 it's +0.8 per 100 (±0.4), because the shots given up are worth less than the fouls saved.
  - Fix: narrow the foul effect to about ±25%, with a matching contest effect.
- **Motion weight 0.** +1.2 per 100 (±0.4), positive in all six matchups. Dropping motion moves trips to ball screens and handoffs, which score more here. Fix: lift motion's value, or lower the others', until none is a free choice.
- **Pressure 0.** −2.3 per 100 in all six matchups. Having one setting that's clearly wrong is fine. Every real defense pressures the ball some.

### 6. What happens on the floor: play types (P3)

| Play type        | Synergy 2024-25: share, PPP | Sim: share of possessions, PPP |
| ---------------- | --------------------------- | ------------------------------ |
| Spot-up          | 23.1%, 1.05                 | 25.7%, 1.12                    |
| Transition       | 18.6%, 1.13                 | 10.8%, 1.36                    |
| PnR ball handler | 16.0%, 0.89                 | 13.0%, 1.06                    |
| Isolation        | 7.0%, 0.91                  | 5.1%, 1.00                     |
| Cut              | 6.9%, 1.30                  | 11.1%, 1.43                    |
| PnR roll man     | 5.8%, 1.10                  | 10.2%, 1.22                    |
| Putback          | 5.3%, 1.09                  | 4.6%, 1.40                     |
| Handoff          | 4.9%, 0.94                  | 6.4%, 1.06                     |
| Off screen       | 3.7%, 0.99                  | 5.8%, 1.07                     |
| Post-up          | 3.5%, 1.00                  | 4.9%, 1.08                     |

The two aren't counted the same way.

- Synergy counts plays: an offensive rebound starts a new one, and a team averages about 112 a game. The sim counts possessions by the play that ended them (99 a game). So the sim's points per play run higher across the board.
- Synergy's transition includes early offense that the sim labels by its action. Box-score fast-break points are on the NBA's number (16.3 against 15.2-15.5).

What still stands out:

- **The order is right.** Cuts score best; transition, putbacks and roll men come next; isolations and handlers score least.
- **Roll-man finishes are too common.** They are 44% of pick-and-roll finishes, against the NBA's 27%.
- **Cuts and isolations.** Cuts are too common and isolations rare.

A player would see this only in the live game's "What they're running" list. Leave it.

### 7. Levers that do little (P3)

- **Shapes.** Five-out, horns and twin bigs move net rating by less than 0.25 per 100 and barely move shot locations. Five-out doesn't open the rim; the October tactics overhaul's notes found spacing barely moves shot quality in this engine. Horns gives up spacing for little: a small handoff boost with a passing big (`game.ts:439-442`). The AI never picks it or twin bigs.
- **Hunting mismatches.** +0.2 (±0.3), and no play type moves.
- **Attacking the rim** carries no extra turnovers or charges.
- **Blitz** forces only +0.2 points of turnovers but gives up +2.5 points of eFG. Against most test offenses it is the worst coverage, −2 to −5 per 100 (the Thunder −5.2). In the NBA, blitzes force turnovers; that's their point.
- **Ice** is played on every ball screen, not just side ones.
- **Drop against elite pull-up shooters.** The Warriors' handlers score 1.16 a trip against drop and 0.89 against hedge, but hedging or icing beats dropping by only 0.6 per 100 against Curry's team.
- **A possible bug.** Set plays may double the help setting: `setPlays.ts:32` passes help on a ±2 scale, while `sets.ts:355` documents ±1. Check it.

## What's right: protect it

| Lever                      | What it moves (lab, against the team's own setting)                                    | The NBA                                                         |
| -------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tempo 0 / 100              | −5.8 / +3.3 possessions                                                                | Teams range 93.8-102.4 possessions; the slider spans 94-103     |
| After a stop 0 / 100       | Transition share −5.8 / +4.4 points                                                    | Teams range 15-24% (Synergy)                                    |
| Shot profile 0 / 100       | Three-point rate −12.0 / +4.8 points; more drives at 0                                 | Teams range 34-53%                                              |
| Help 0 / 100               | Their threes −8.2 / +6.3 points, rim +5.0 / −2.9; both ends cost (−1.4 / −0.8 per 100) | Help trades rim shots for kick-out threes                       |
| Pressure 0 / 100           | Their turnovers −3.9 / +3.4 points, free throws −3.3 / +3.4                            | Teams force 11-17% turnovers                                    |
| Press after makes / always | +3.5 / +4.0 possessions, a little more turnover, tired legs (−3.7 per 100 always)      | A full-court press all game loses to NBA ball handlers          |
| Drop                       | Their rim share −6.2, threes +2.8, free throws −5.6                                    | Drop walls off the rim and concedes pull-ups                    |
| 2-3 zone                   | Their threes +6.5, rim −6.4, offensive boards +4.4                                     | Zones give up threes and boards                                 |
| 3-2 zone                   | Their threes −8.0, rim +3.5, offensive boards +7.1                                     | The 3-2 takes away threes and gives up the middle and the glass |
| Mentality −2 / +2          | One dial: −2.8 / +3.0 possessions, the glass, the whistle and transition both ways     | A coach's risk appetite                                         |
| Set plays                  | A matched first run +0.23 to +0.33 a trip, less each repeat; the wrong one −0.34       | After-timeout plays pay, and get scouted                        |

Also right:

- **The AI league's team spread** is the NBA's in pace (SD 1.9 against 2.0 possessions), three-point rate (0.042 against 0.039) and turnovers forced (0.013 both).
- **The staff's live reads** split shot quality from luck, name the play types ("Handoff: 8 points on 5 trips"), and give sound advice against zones and rebounding teams.

## Where to stop

| Step                                                                                                               | Strict | As a game |
| ------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| Junk defenses become situational: the chased star keeps more of the ball, and offenses attack the zone (finding 1) | +4     | +4        |
| Real teams' styles and coverages seeded from real data; AI drops its losing adjustments (findings 2-3)             | +4     | +4        |
| The crash cost and the physicality range brought to the NBA's (findings 4-5)                                       | +2     | +0.5      |
| Everything else                                                                                                    | +6     | +2        |

**The first two get it to about 77 strict and 86 as a game. That is where I'd stop.** The third is two constants and worth doing if you're in there. The rest is invisible in play.

## Appendix: the lab

The six matchups used the 2026-27 league's teams on seed 7 (`scripts/tactic-sweep.ts`'s setup), 200 paired games each. "Net" is points per 100 possessions for the team making the change, against its own setting, with the standard error. Shares are percentage points.

| Lever                                     | Low end: net per 100 | Low end: what moves                             | High end: net per 100 | High end: what moves                            |
| ----------------------------------------- | -------------------- | ----------------------------------------------- | --------------------- | ----------------------------------------------- |
| Tempo 0 / 100                             | -0.47 ± 0.41         | possessions -5.8                                | +0.26 ± 0.38          | possessions +3.3                                |
| After a stop (transition) 0 / 100         | -0.48 ± 0.39         | transition share -5.8                           | +0.68 ± 0.37          | transition share +4.4                           |
| Shot profile 0 / 100                      | -0.54 ± 0.39         | 3PA rate -12.0, rim +3.3                        | +0.74 ± 0.38          | 3PA rate +4.8, rim -0.7                         |
| Attack the rim 0 / 100                    | -0.10 ± 0.36         | rim share -2.6, FT rate -1.0                    | +0.54 ± 0.33          | rim share +1.7, FT rate +0.7                    |
| Crash the glass 0 / 100                   | +0.96 ± 0.38         | ORB% -4.6, their transition share -3.2          | -1.38 ± 0.42          | ORB% +5.8, their transition share +14.3         |
| Get back 0 / 100                          | -1.36 ± 0.38         | ORB% +0.7, their transition share +4.2          | -0.28 ± 0.38          | ORB% -3.3, their transition share -3.4          |
| Isolation weight 0 / 100                  | +0.23 ± 0.34         | iso share -1.6                                  | -0.33 ± 0.41          | iso share +8.4                                  |
| Post-up weight 0 / 100                    | +0.23 ± 0.25         | post share -0.7                                 | -0.50 ± 0.40          | post share +6.2                                 |
| Pick-and-roll weight 0 / 100              | -0.02 ± 0.43         | PnR share -15.5                                 | +0.33 ± 0.42          | PnR share +8.2                                  |
| Handoff weight 0 / 100                    | +0.20 ± 0.41         | handoff + off-screen share -11.4                | +0.27 ± 0.42          | handoff + off-screen share +9.1                 |
| Motion weight 0 / 100                     | +1.20 ± 0.44         | cut share -10.7, 3PA rate +4.8                  | +0.03 ± 0.41          | cut share +3.4, 3PA rate -1.7                   |
| Help 0 / 100                              | -1.42 ± 0.41         | their 3PA rate -8.2, rim +5.0                   | -0.78 ± 0.40          | their 3PA rate +6.3, rim -2.9                   |
| Ball pressure 0 / 100                     | -2.33 ± 0.38         | their TOV% -3.9, FT rate -3.3                   | -0.55 ± 0.40          | their TOV% +3.4, FT rate +3.4                   |
| Physicality 0 / 100                       | +0.76 ± 0.38         | their FT rate -17.9, eFG +1.9                   | -1.93 ± 0.40          | their FT rate +22.1, eFG -1.5                   |
| Press after makes / always                | -0.69 ± 0.43         | possessions +3.5, their TOV% +0.9, own eFG -1.1 | -3.65 ± 0.45          | possessions +4.0, their TOV% +1.1, own eFG -2.6 |
| Mentality very cautious / very aggressive | -0.15 ± 0.42         | possessions -2.8, ORB% -2.4, their FT rate -3.4 | +0.05 ± 0.40          | possessions +3.0, ORB% +2.7, their FT rate +3.5 |

| Choice (against the team's own setting) | Net per 100  | Their 3PA rate | Their rim share | Their FT rate | Their TOV% | Their ORB% | Their eFG% |
| --------------------------------------- | ------------ | -------------- | --------------- | ------------- | ---------- | ---------- | ---------- |
| Drop                                    | +0.75 ± 0.40 | +2.8           | -6.2            | -5.6          | -1.4       | -0.9       | -1.0       |
| Hedge                                   | +0.31 ± 0.38 | -0.5           | +0.3            | -3.1          | -1.2       | -1.2       | -0.0       |
| Ice                                     | +0.08 ± 0.37 | +1.5           | -0.4            | -3.1          | -1.5       | -1.2       | -0.9       |
| Switch (and off-ball switches)          | -1.62 ± 0.40 | -3.7           | -1.2            | +1.5          | -1.4       | +0.1       | -0.1       |
| Blitz                                   | -1.26 ± 0.40 | -0.3           | +1.5            | -3.8          | +0.2       | -1.6       | +2.5       |
| 2-3 zone                                | -0.67 ± 0.40 | +6.5           | -6.4            | -5.7          | -1.0       | +4.4       | -2.0       |
| 3-2 zone                                | -0.03 ± 0.43 | -8.0           | +3.5            | -0.5          | -1.0       | +7.1       | -3.7       |
| Box-and-one                             | +1.06 ± 0.42 | +0.6           | -0.5            | -3.9          | -0.6       | +2.3       | -2.5       |
| Triangle-and-two                        | +2.21 ± 0.42 | -2.1           | +2.3            | -2.8          | -0.2       | +2.9       | -3.0       |
| Double the star                         | -1.20 ± 0.39 | +1.2           | +0.1            | -2.0          | -0.2       | -0.1       | +1.3       |
| Hunt mismatches                         | +0.23 ± 0.34 | -0.1           | +0.0            | +0.1          | -0.1       | +0.1       | -0.0       |
| Shape: five-out                         | -0.22 ± 0.29 | -0.1           | -0.0            | -0.1          | -0.1       | +0.1       | -0.1       |
| Shape: horns                            | -0.17 ± 0.39 | +0.1           | -0.2            | +0.3          | -0.2       | -0.0       | +0.1       |
| Shape: twin bigs                        | +0.15 ± 0.28 | +0.1           | -0.2            | +0.1          | -0.1       | -0.0       | -0.1       |

The base: 99.9 possessions, three-point rate 0.421, rim share 0.353, FT rate 0.276, turnovers 0.136 a trip, offensive rebound rate 0.268; the opponents' turnovers 0.153, FT rate 0.269. The hunt and shape rows are offensive choices: their columns are the opponent's numbers, which barely move.

## Method and caveats

- **Paired games remove most of the noise, not all of it.** A ±0.4 standard error on the six-matchup averages means effects under 0.8 are within noise. The coverage table by opponent has about ±0.6 a cell.
- **The lab's matchups are six real pairs**, so a lever's average depends on their rosters. Where an effect flips by opponent, the findings say so.
- **Play-type counts differ from Synergy's** (see finding 6), so the shares and points per play are compared for their order and their gaps, not their exact levels.
- **The coverage shares are Second Spectrum's 2020-21 figures.** Switching has grown since, which only widens the gap.
- **No repo file was changed.** The lab scripts, the NBA.com tables and the analysis are in this session's scratchpad.
- **Sources.**
  - NBA.com team play-type pages (nba.com/stats/teams/isolation and its siblings, 2024-25 and 2025-26).
  - Second Spectrum coverage shares as reported by [The Ringer](https://www.theringer.com/nba/2021/5/17/22439801/nba-play-in-playoffs-steph-curry-damian-lillard).
  - Switching trends in [FiveThirtyEight](https://fivethirtyeight.com/features/anybody-and-everybody-can-switch-on-pick-and-rolls-now).
