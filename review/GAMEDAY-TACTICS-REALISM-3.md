# Game-day tactics realism review 3

November 10, 2026, on commit bb8601a (branch tactics-v2, clean tree apart from untracked review files). Same scope, scale and bar as the first two reviews (`review/GAMEDAY-TACTICS-REALISM.md`, 69 strict / 78 as a game on f27e467; `review/GAMEDAY-TACTICS-REALISM-2.md`, 82 / 88 on 3bf220c). It covers only tactics: the choices a coach makes, how the engine plays them, the AI coaches' choices and what the staff tells you, measured against the NBA. Nothing in either review was assumed to still hold or to be fixed. Every number below was measured on this engine, with more games than the kit's 200 a matchup wherever a lever's sign mattered.

The bar is the one you set: it doesn't have to be perfect, it's just a game. Every finding says whether a player would notice it.

## Score: 85 / 100 (about 90 as a game)

**The second round fixed what the second review found. The free three-slider combination is gone. A full-game 2-3 zone now costs what an NBA zone costs, and the staff never makes it the base. Pressure and physicality sit inside the NBA's team ranges. No lever is a free gain. What's left is one balance problem and one old read problem. Drop coverage is the best man-to-man coverage for 25 of 30 rosters, so the switching and hedging that personnel calls for doesn't pay, for the AI or for you. And the offensive playbook read still calls nearly every offense a "Similar fit".**

- **What's right.**
  - **No free levers.** Over 12 matchups and 400 paired games each (±0.2 per 100), no slider, coverage, scheme, shape or action weight beats every team's own settings by more than +0.35 per 100 against an AI opponent. Drop is the one exception (finding 1). The second review's free trio (glass "Crash", shot profile 100, push after every stop) is now −0.12 ± 0.21. It was +1.83.
  - **Both ends of each slider cost.** Crash 0 / 100: −1.28 / −1.71. Help 0 / 100: −1.59 / −1.68. Pressure 100: −1.70. Mentality +2: −1.60. The press always: −2.94.
  - **Zones and junk are situational.** A 2-3 zone played all game is −1.70 ± 0.12 per 100 against drop over 60 defense-offense pairings, positive in 10. The 3-2 is −2.95. A box-and-one is −1.42 on average and +1.41 against Curry's Warriors, a lone scorer with a weak cast.
  - **Effect sizes are in the NBA's ranges.**
    - Maximum pressure takes opponents' turnovers from 0.135 to 0.164 a trip. The NBA's best defenses force 0.160, or about 0.167 with team turnovers.
    - Physicality moves opponents' free-throw rate from 0.198 to 0.300. NBA teams allowed 0.198-0.288 in 2024-25 and 0.228-0.319 in 2025-26.
  - **The coverages have personnel logic.**
    - Curry punishes drop: 1.21 points per ball-screen trip against it, 1.12 against a hedge or show.
    - Blitzes lose to passers. Cunningham scores 1.49 a trip against a blitz (1.24 against drop), Young 1.37 (1.17), Jokić 1.32 (1.18). A blitz forces +3.1 points of turnovers.
    - Switching turns ball screens into post-ups (8.2% of plays against 3.3%) and kills handoffs.
  - **AI teams play like their real franchises.** Team play-type shares correlate with the real teams' 2025-26 Synergy shares at +0.92 for isolations, +0.72 for post-ups and +0.63-0.64 for transition, handler plays and handoffs. Scouting cards read like the real teams: "Motion-heavy offense with lots of threes" (Warriors), "Slow-paced, post-up-heavy offense with few threes" (Rockets).
  - **The AI's coverage mix is the NBA's.** Drop 54.7%, switch 20.3%, hedge 10.9%, ice 5.8%, zone 4.7%, blitz 3.6% of ball screens (the kit's three seasons). Second Spectrum's 2020-21 split was drop 58%, switch 18%, blitz 3%.
  - **Plays are worth what they should be.** Counted Synergy's way, the sim scores 1.034 a play against the NBA's 1.046. Isolations, handoffs, off-screens and post-ups are within a few hundredths of Synergy's share and points per play.
  - **The defensive read is excellent.** The staff's defensive playbook read tracks measured worth at r 0.96 (0.98 corrected for measurement noise). The shape read went from r 0.12 to 0.68, and the staff's shapes cost nothing against the measured best.
- **What a player would notice.**
  1. **The offensive playbook chooser still can't tell playbooks apart.** On average 5.9 of the 6 offenses read "Similar fit". The staff runs Balanced for 24 rosters and Pace & Space for 5. Hub Big measures best for 10 rosters and the staff never picks it. Jokić's Nuggets still get Pace & Space (this time the engine agrees, see finding 2).
  2. **Your staff's coverage can go against its own read.** For Denver the staff runs Hedge & Recover. Its own read says Drop is +0.44 a game better, and lists the 2-3 zone first as a "Change-up". Measured, drop beats hedge for Denver by 1.06 a game.
- **What only the numbers show.**
  - **Drop dominates the man coverages.** Against drop, over 60 pairings: hedge −0.65, switch −0.89, ice −0.29, blitz −2.23 per 100 (±0.1). Drop is the best man coverage for 25 of 30 rosters. Miami's switch, the coverage its personnel calls for, loses to drop by −0.95 ± 0.26. Edwards, the second-best pull-up shooter, doesn't punish drop: 1.18 a trip against it, 1.20 against a hedge.
  - **Crashing still feeds the other side's break.** Across the AI league, a team's offensive rebounding correlates with its opponents' run-outs at +0.57; in the NBA, +0.04. Crashing at 100 gets fewer offensive boards than crashing at 75.
- **Recommendation.** Make switching and hedging pay for the rosters built for them, so drop stops being everyone's best coverage. Make the offensive read split the playbooks. Then stop: the rest is invisible in play.

### Scorecard

"As a game" counts only what a player could see: in the live game, the box score, the game report, the scouting card, the staff's reads, or by trying a tactic for a few games (the staff's edit ledger measures what a change was worth).

| Area                                   | Weight  | Strict | As a game | Why                                                                                                                                                                                                                   |
| -------------------------------------- | ------- | ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The toolkit: what a coach can choose   | 10      | 9.5    | 9.5       | Show high (a coverage for one handler) closes the second review's gap. Still no lineup-specific scheme; your zone or junk defense is all game, never a change-up in stretches as the AI's is                          |
| Levers do the right things             | 20      | 18     | 19        | Every slider, coverage, zone, shape and hunt moves the right stats, both ends cost, blitz forces turnovers, Curry punishes drop. Crashing still raises the other side's run-outs; crash 100 gets fewer boards than 75 |
| Effect sizes and balance               | 20      | 16.5   | 18        | No free lever or combination; zone, pressure and physicality in the NBA's ranges. Drop is the best man coverage for 25 of 30 rosters, worth about +1 per 100 to teams that don't play it                              |
| Personnel fit                          | 10      | 8      | 8.5       | Zones, junk, blitzes and switch mismatches scale with the players; Hub Big measures best for 10 rosters. Switching and hedging don't pay for the rosters built for them; Edwards doesn't punish drop                  |
| What happens on the floor (play types) | 15      | 12.5   | 13.5      | Points per play right overall; iso, handoff, off-screen and post shares near Synergy's. Handler plays too efficient (0.95 vs 0.88), spot-ups too common and too poor; cut and post spreads wide                       |
| AI coaches' tactics                    | 15      | 13     | 14        | Real styles, the NBA's coverage mix, game plans in 54% of matchups, two-way adjustments. Their switching and hedging cost them; sets still 10% rich; everyone's zone the same 2-3% but Miami's                        |
| Staff reads and feedback               | 10      | 8      | 8         | Defense read r 0.96, shapes 0.68, measured counters, honest reports, real identities. Offense read r 0.44 with 5.9 of 6 "Similar fit"; the staff's base coverage can go against its own read                          |
| **Total**                              | **100** | **85** | **90**    |                                                                                                                                                                                                                       |

## The second review's findings, re-measured

| Second review (3bf220c)                                                     | Now (bb8601a)                                                                                                                                                                            | Status                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Full-game 2-3 zone priced like man-to-man; the staff ran it for 13 of 30    | −1.70 ± 0.12 vs drop played all game (10 of 60 positive); the staff never bases it. In simmed games, where your assistant pulls it once it's read, it still measures best for 10 rosters | Fixed (live)           |
| Offensive read can't tell playbooks apart (5.7 of 6 "Similar fit")          | r 0.44 (0.49 corrected), 5.9 of 6 "Similar fit"; staff picks Balanced 24, Pace & Space 5; Hub Big best for 10, never picked. The chooser now orders by the read                          | Not fixed              |
| Pace & Space for Jokić's Nuggets                                            | Still the staff's pick, and now the engine's best for Denver too: Pace & Space +0.80, Hub Big +0.59, Balanced +0.30 a game (±0.27 each)                                                  | Changed (engine's own) |
| Crash, threes and push together a free +1.7 per 100                         | −0.12 ± 0.21 (rules), −0.22 (AI); each alone within ±0.25                                                                                                                                | Fixed                  |
| Defensive roles reward the role, not the player                             | Each role's edge now scales with the player's fit (`roleEdge`). Not re-measured                                                                                                          | Likely fixed (code)    |
| Crashing feeds the other side's break (r +0.66)                             | r +0.57; run-outs allowed 17.5% (bottom-fifth crashers) vs 20.9% (top fifth). NBA r +0.04                                                                                                | Smaller, not fixed     |
| After-timeout sets 15% better than other half-court trips                   | 1.236 vs 1.126 a trip (+10%), 2.62 a team-game                                                                                                                                           | Partly fixed           |
| Maximum pressure forced 0.178 turnovers a trip                              | 0.164 (NBA best about 0.16-0.17)                                                                                                                                                         | Fixed                  |
| Physicality 0.17-0.32 free-throw rate; hands-off +0.36                      | 0.198-0.300; hands-off +0.32 ± 0.18 against rules opponents, −0.23 against AI                                                                                                            | Fixed                  |
| Turnovers committed spread twice the NBA's, turnovers forced narrow         | Team SD 0.016-0.017 (NBA 0.010); forced 0.005-0.009 (NBA 0.012)                                                                                                                          | Not fixed              |
| Everyone plays the same zone                                                | 28 teams 2.3-2.7% of half-court trips, Miami 11.7%, no 3-2                                                                                                                               | Not fixed              |
| Handler plays too efficient, spot-ups too common, off-screens and cuts high | Handler 0.954 (NBA 0.879); spot-ups 32.3% at 0.966 (25.8% at 1.048); off-screens 3.8% (3.9%); cuts 8.5% (7.2%); isolations 6.9% (7.6%)                                                   | Partly fixed           |
| No coverage for one handler                                                 | "Show high" star plan: about even on average (−0.35 vs drop), +0.28 / −0.33 against the Warriors                                                                                         | Fixed (toolkit)        |
| Shape read r 0.12                                                           | r 0.68 (0.78 corrected); the staff's shapes cost 0.00 against the measured best on held-out games                                                                                        | Fixed                  |
| Hub Big doesn't pay Denver over its own mix                                 | Hub Big +0.59 for Denver, behind Pace & Space by 0.21 ± 0.38                                                                                                                             | Not fixed              |

## Would a player notice?

| What's off                                               | Where a player would see it                                                        | Would they notice?      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------- |
| Every offense a "Similar fit"; Hub Big never the staff's | The playbook chooser                                                               | Yes                     |
| The staff's coverage goes against its own read           | The defense chooser: "Hedge & Recover: Yours", Drop and the zone read better above | Maybe                   |
| Drop is everyone's best coverage                         | The edit ledger, if a player tries drop; otherwise only over many games            | Maybe, by experimenting |
| Your zone is all game; the AI's comes in stretches       | Adding the staff's "2-3 zone" counter to a plan                                    | Rarely                  |
| Crashing teams give up more run-outs                     | The scouting line "crashes hard, which leaves them open to run-outs"               | Rarely                  |
| Spot-ups too common and too poor, handler plays too good | "What they're running" in the live game                                            | No                      |
| Every AI team plays the same 2-3% zone                   | Rarely seeing a zone from anyone but Miami                                         | No                      |
| Sets 10% richer than other half-court trips              | Only by measuring                                                                  | No                      |

## How this was measured

- **The kit** (`scripts/tactics-lab/run.ts rev3-head`, 47 s): it reproduced `out/final` exactly. Its output was moved to this session's scratchpad.
- **My own paired experiments** (scripts in the scratchpad's `reviewer3/`, the kit's lab league: 2026-27 rosters on seed 7, about 3.4 million games). Each side plays by the kit's rules (no adjustments; a zone or junk defense all game, as the user's side plays it live), as the user's team in a simmed game (the same habits, the assistant adjusting at both ends), or as an AI coach (his habits, zone mixing, sets and adjustments).
  - **Levers.** 76 settings, the kit's 47 plus intermediate values, show high, the hot hand, offense-defense subs and four combinations. Twelve matchups (the kit's six and six more), 400 paired games each (±0.2 per 100), against a rules opponent and an AI one.
  - **Defensive choices by opponent.** Eleven choices from five defenses (Chicago, Miami, Sacramento, Boston, New York) against twelve offenses, including every elite pull-up handler's team. 300 paired games a cell, both opponent modes. Then 200 recorded games a cell for the man coverages, with each elite handler's ball-screen trips tallied by coverage (5,000-33,000 trips each).
  - **Playbooks and shapes.** Every offensive (6) and defensive (7) playbook and shape (4) for each of the 30 rosters, played as the user's team in a simmed game against every other team's AI. Two independent seed sets of 48 games an opponent: 2,784 games per roster and choice, 1.5 million in all. The split halves give the measure's reliability (offense 0.80, defense 0.98, shapes 0.76), so the reads' correlations can be corrected for noise. Picks are scored on held-out games.
  - **The AI league as it plays.** All 870 ordered pairs, AI against AI, 16 recorded games each (13,920 games). Plays counted Synergy's way (an offensive board starts a new play). Coverage and scheme on each trip, sets, adjustments, run-outs after live defensive boards, team ranges.
- **What the staff says.** A real league (seed 307, the user as Denver) a month into the season: ten scouting cards with counters, the playbook chooser as the Tactics screen orders and labels it (`byFit`), the staff's picks for all 30 rosters, three game reports and the AI's game plans for every matchup.
- **Real NBA numbers.**
  - Synergy team play types, 2024-25 and 2025-26 (`data/raw/synergy/teams.json`).
  - Team box-score ranges (`src/data/realStyles.json`).
  - My own extraction from the 2024-26 play-by-play (`data/raw/games/PlayByPlay.parquet`, 60 team-seasons): offensive rebounding against how often opponents get a shot or free throws within 6 s of a live defensive board off the team's misses. ORB% SD 2.84 points; r with opponents' pushes +0.04; bottom and top fifths 28.8% and 29.0%. This matches the second review's numbers.
  - Coverage shares: Second Spectrum 2020-21, as the earlier reviews used them.
- **Not measured this time** (the coordinator asked me to finish; judgement given where it matters): roles turned upside down (the code now scales each role's edge by fit), `adjustments.ts` (the kit's league part shows the kinds and rates), zones in stretches for AI staffs (the kit's league shows 5.0% of trips), Hub Big as an action mix only, the glass dial's five levels, and `gameday-check` side effects.

## Findings

No P1. Nothing measured is as large or as visible as the first review's P1s, and the second review's P2s that a player could see are fixed or have narrowed to a read problem.

### 1. Drop is everyone's best man coverage; switching and hedging don't pay for the rosters built for them (P2)

**What it is.** Five defenses each played every coverage all game against twelve offenses (net per 100 for the defense against drop, ±0.1 per column over 60 cells):

| Choice                | Against rules opponents | Positive cells | Against AI opponents |
| --------------------- | ----------------------- | -------------- | -------------------- |
| Hedge                 | −0.65                   | 26 of 60       | −0.70                |
| Ice                   | −0.29                   | 23 of 60       | −0.26                |
| Switch (and off-ball) | −0.89                   | 13 of 60       | −0.58                |
| Blitz                 | −2.23                   | 12 of 60       | −2.29                |
| Show high on the star | −0.35                   | 26 of 60       | −0.33                |
| Double the star       | −1.97                   | 5 of 60        | −2.02                |

The personnel test, each defense with the coverage its own personnel calls for:

| Defense (its coverage) | That coverage vs drop, rules | vs AI        |
| ---------------------- | ---------------------------- | ------------ |
| Miami (switch)         | −0.95 ± 0.26                 | −0.77 ± 0.26 |
| Chicago (hedge)        | −0.41 ± 0.24                 | −0.18 ± 0.24 |
| New York (ice)         | −0.15 ± 0.23                 | −0.09 ± 0.23 |

The same in the other tests:

- In the lever table, switching to drop is positive for all six side-A teams that play something else. Atlanta (switch) +1.41, Denver (hedge) +1.57, New York (ice) +0.90, Miami (switch) +0.90, Phoenix (switch) +0.31, Orlando (hedge) +1.95: +1.17 ± 0.30 on average against rules opponents, +1.00 against AI ones.
- Among the five man coverages played as the user's team in simmed games, drop measures best for 25 of 30 rosters, switch for 1 and hedge for none. The staff's personnel picks are Drop 18, Switch 6, Hedge 3, Ice 2, Blitz 1. In simmed games the gap is small (the coverages spread 0.34 a game within a roster), because the assistant's "drops the big" adjustment rescues a losing coverage. In a live game nobody rescues it.
- The elite pull-up shooters mostly don't punish drop. Points per ball-screen trip, drop against hedge: Curry 1.21 / 1.12 (right), Dončić 1.26 / 1.22, Jerome 1.28 / 1.25, but Edwards (pull-up three 86) 1.18 / 1.20, Murray 1.29 / 1.32, Young 1.17 / 1.22, Gilgeous-Alexander 1.33 / 1.32.

**Why it's wrong.** In the NBA no base coverage dominates. Teams choose by personnel, and switch-heavy teams with versatile, similar-sized fives are among the league's best defenses. Here the AI's switching and hedging teams, 30-45% of the league's ball screens, give up about 0.5-1 point per 100 by doing what their personnel calls for. And the staff's own pick can contradict its read: Denver's staff runs Hedge & Recover by personnel, its read puts Drop +0.44 a game ahead (one hundredth short of "Better fit"), and the measured gap is 1.06 a game.

**Would a player notice?** Maybe. A player who tries drop sees the edit ledger call it a gain for most rosters. Otherwise only over many games.

**Fix.**

- Make the switch's scramble cost depend on the mismatch it leaves. A switch between similar-sized defenders should cost little (`TK.cov.switch.scramble`, `speed`), and the cost should be paid only where the switch strands a big on a guard.
- Give hedging a mobile big's payoff: less roll-man room when the big is quick (`TK.cov.hedge.roll`, `speed`).
- Raise the drop's pull-up room for elite pull-up shooters so Edwards-class handlers punish it, not only Curry (`TK.cov.drop.pull`, or the cap on `TK.use`).
- Let the staff's base coverage follow its read when the read and personnel disagree by more than about 0.4 a game.

**Target:** drop best for about half the rosters, switch and hedge best for the rosters built for them, and no coverage the AI's personnel calls for losing to drop by more than about 0.3 per 100.

### 2. The offensive playbook read can't tell playbooks apart (P2, visible)

**What it is.** Each of the six offensive playbooks played for each of the 30 rosters, 2,784 games per roster and choice:

| Measure                                                   | Offense                                                           | Defense (7)                                | Shape (4)                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Spread within a roster (SD, points a game)                | 0.43                                                              | 1.47 (0.34 among man)                      | 0.37                                           |
| Read vs measured, r (corrected for noise)                 | 0.44 (0.49)                                                       | 0.96 (0.96); man only 0.79 (0.98)          | 0.68 (0.78)                                    |
| Measured best                                             | Hub Big 10, Balanced 8, Heliocentric 6, P&S 3, Grit 2, Five-Out 1 | Drop 18, 2-3 zone 10, Blitz 1, Ice 1       | Five-out 12, four-out 10, horns 5, twin bigs 3 |
| The staff's pick                                          | Balanced 24, Pace & Space 5, Five-Out 1                           | Drop 18, Switch 6, Hedge 3, Ice 2, Blitz 1 | Four-out 25, five-out 5                        |
| Value on held-out games: best by measure / staff / random | +0.60 / +0.49 / +0.28 a game                                      | +0.19 / +0.07 / −0.67                      | −0.04 / 0.00 / −0.29                           |
| Reading "Similar fit" (the pick included)                 | 5.9 of 6                                                          | 5.3 of 7                                   | 3.3 of 4                                       |

- **The read can't reach Hub Big or Heliocentric.** `OFF_FIT` gives Balanced a base of 1.6 with no roster terms and Heliocentric 0.9 with none, so Heliocentric can never be picked. Hub Big measures best for 10 rosters, Sacramento's (+1.27 a game) and Houston's (+2.13, level with Balanced) among them, and the staff picks it for none.
- **In effect the read is fine.** The staff's pick is 0.11 a game short of the measured best on held-out games. The problem is the words: a chooser where every offense is a "Similar fit" tells a player nothing.
- **Denver.** The staff runs Pace & Space for Jokić's Nuggets. This time the engine agrees: Pace & Space +0.80, Hub Big +0.59, Balanced +0.30 a game against Denver's own post-heavy mix (±0.27 each). Pace & Space sets the post-up weight to 10 against Denver's own 89. An NBA fan will still read "Pace & Space for Jokić" as wrong, but the fix is in the engine's Hub Big, not the read.

**Would a player notice?** Yes, in the chooser.

**Fix.**

- Give Hub Big a roster term an elite passing big triggers, and Heliocentric a lead-creator term, so the read can reach the playbooks that measure best.
- Where the read's whole range is under the threshold, say so ("all within a few tenths") rather than six "Similar fit" tags, and keep the order.
- Let an elite passing big pay in Hub Big's actions: Denver's best playbook should run through Jokić.

### 3. Crashing still feeds the other side's break; its board response isn't monotonic (P3, numbers only)

| Measure                                                                         | NBA 2024-26 (60 team-seasons) | Sim (AI league, 13,920 games)         |
| ------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| Team offensive rebound %, SD                                                    | 2.84 points                   | 2.28 (the kit's seasons 2.4)          |
| Correlation of offensive rebounding with the opponents' pushes after its misses | +0.04                         | +0.57 (run-outs), +0.55 (quick trips) |
| Bottom-fifth / top-fifth crashers: opponents' pushes                            | 28.8% / 29.0%                 | run-outs 17.5% / 20.9%                |

- The leak itself is small now: crashing at 100 adds 0.8 points of opponent transition share in the lab. The rest of the correlation comes with the crashers' bigger, slower lineups, which the engine's run-out chance punishes (`K.runSpeed`). The NBA's crashers are just as big and give up no more pushes.
- Offensive board rate by crash setting: 0.196 at 0, 0.227 at 25, 0.276 at 75 and 0.266 at 100. The quadratic fade (`TK.crash.fade`) peaks near 80, so sending more players gets fewer boards. Crashing at 100 costs −1.71 per 100, most of it through the team's own shooting (eFG −1.0 from the legs), not the other side's break.
- **Fix:** make the fade level off rather than turn down, and soften the speed gap's effect on run-outs after a defensive board.

### 4. What happens on the floor: play types (P3)

The AI league, plays counted Synergy's way (108.9 plays of the ten kinds a team-game; Synergy about 106-107):

| Play type        | NBA 2025-26: share, PPP | Sim: share, PPP | Team SD, NBA / sim | Sim vs real team shares (r) |
| ---------------- | ----------------------- | --------------- | ------------------ | --------------------------- |
| Spot-up          | 25.8%, 1.048            | 32.3%, 0.966    | 3.4 / 3.8          | +0.35                       |
| Transition       | 19.6%, 1.136            | 10.7%, 1.226    | 2.6 / 1.6          | +0.63                       |
| PnR ball handler | 16.2%, 0.879            | 17.4%, 0.954    | 3.1 / 3.6          | +0.64                       |
| Isolation        | 7.6%, 0.929             | 6.9%, 0.904     | 2.1 / 2.3          | +0.92                       |
| Cut              | 7.2%, 1.310             | 8.5%, 1.309     | 1.6 / 2.5          | +0.44                       |
| PnR roll man     | 5.7%, 1.111             | 6.5%, 1.054     | 1.2 / 1.3          | +0.32                       |
| Putback          | 5.6%, 1.123             | 4.6%, 1.214     | 0.8 / 0.9          | +0.15                       |
| Handoff          | 4.8%, 0.946             | 5.5%, 0.961     | 1.5 / 1.8          | +0.64                       |
| Off screen       | 3.9%, 0.979             | 3.8%, 0.983     | 1.4 / 1.8          | +0.38                       |
| Post-up          | 3.6%, 1.004             | 3.8%, 0.957     | 1.5 / 2.1          | +0.72                       |

- Better than before: off-screens are now on Synergy's share, isolations are up and cuts down.
- Still off: handler plays score 0.075 a play above Synergy's, above isolations and post-ups. Spot-ups are too common and too poor. Cut and post-up shares spread wider across teams than real teams'.
- Synergy counts early offense as transition, so the sim's transition share runs low by construction.
- A player would see this only in "What they're running". Leave it unless you're in there.

### 5. AI habits and team ranges (P3)

- **Sets are still rich.** 2.62 after-timeout sets a team-game at 1.236 a trip, against 1.126 on other half-court trips (+10%; it was +15%). NBA after-timeout plays score about the half-court average. Worth about 0.3 points a game per team. Fix: lower `TK.aiSet.at` a little.
- **Everyone plays the same zone.** 2.3-2.7% of half-court trips for 28 teams, Miami 11.7%, Atlanta (the user's staff) 1.2%; no AI team plays a 3-2 (`style.ts` `ZONE`). Game plans add a planned 2-3 in 16% of matchups. Fix: spread the real teams' zone shares.
- **Defensive playbooks flip with the roster.** The AI re-picks its coverage whenever its personnel calls for another (`styleChanged`). In the kit's six samples Oklahoma City went ice, drop, ice, drop, ice, drop, and Miami drop, switch, ice, blitz, switch. A scouting card can name a new coverage every few weeks. Fix: a sticky margin like the user's staff's `STICK`.
- **Team ranges** (the kit's three seasons against the NBA's 2024-26 SDs): pace 1.35-1.78 vs 2.0-2.1 (narrow); 3PA rate 0.040-0.046 vs 0.036-0.042; FT rate 0.028-0.032 vs 0.015-0.026 (wide); turnovers committed 0.016-0.017 vs 0.010 (wide); turnovers forced 0.005-0.009 vs 0.012 (narrow).
- **Adjustments** are 0.51-0.56 a game at both ends: icing a pull-up shooter 28%, going at a defender in foul trouble 17%, dropping the big 16%, chasing late 15%, stopping a blitz 11%. Their worth wasn't re-measured this round. The code lists no losing kind.

### 6. Toolkit and zone edges (P3)

- **Your zone is all game.** The user's base or game-plan zone or junk defense is played on every trip (`coachHabits` rules: `zone: 1`, `junk: 1`). The AI's comes in stretches. So the scouting card's "2-3 zone" counter means a full-game zone, which measures −1.6 to −2.9 per 100 against drop against the very offenses it's offered for (Oklahoma City, Houston, the Lakers, Minnesota, Detroit). The counter's measured worth is shown before the staff proposes it, so it is honest, but a player can't ask for a zone in stretches.
- **The chooser lists the zone first for some rosters.** For Denver the 2-3 zone reads +0.50 and tops the defense chooser as a "Change-up". In simmed games, where the assistant goes back to man once the zone is read, a base zone measures best for 10 of 30 rosters. That works like a change-up, so it's acceptable, but the label doesn't say the zone is played all game in a live game.
- **Show high is about even.** −0.35 per 100 against drop on average. Against the Warriors +0.28 (rules) and −0.33 (AI), though Curry scores 0.09 a trip less on the screens it shows on. It works, but it isn't the clear answer to Curry that NBA teams treat it as.
- **No lineup-specific scheme.**

## What's right: protect it

Twelve matchups, the team keeping the setting all game against its own settings, 400 paired games each (net per 100, ±about 0.2; rules opponents, then AI ones). Shares are percentage points.

| Lever                            | What it moves                                                                   | Net, rules / AI              | The NBA                                     |
| -------------------------------- | ------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| Tempo 0 / 100                    | −4.0 / +5.6 possessions                                                         | +0.03 / +0.03; −0.64 / −0.09 | Teams range 97-105.5 possessions            |
| After a stop 0 / 100             | Own transition share −4.7 / +2.4                                                | −0.57 / +0.07; −0.79 / −0.08 | Synergy transition 16-26%                   |
| Shot profile 0 / 100             | 3PA rate −11.8 / +7.7                                                           | −0.37 / −0.23; −1.13 / −0.39 | Teams range 34-54%                          |
| Attack the rim 0 / 100           | Rim share −3.0 / +1.5, FT rate −1.4 / +0.8                                      | −0.74 / +0.32; −0.77 / −0.05 | Driving draws fouls and costs charges       |
| Crash 0 / 75 / 100               | ORB 0.196 / 0.276 / 0.266                                                       | −1.28 / +0.07 / −1.71        | Teams' ORB% 20-31%                          |
| Get back 0 / 100                 | Their transition +2.5 / −2.1, own ORB +0.3 / −1.9                               | −0.60 / +0.23; −0.68 / −0.42 | Getting back costs boards                   |
| Help 0 / 100                     | Their threes −8.3 / +8.2, rim +4.9 / −3.3                                       | −1.59 / −1.68; −2.03 / −1.98 | Help trades rim shots for kick-outs         |
| Ball pressure 0 / 100            | Their turnovers 0.121 / 0.164, FT rate −2.5 / +3.5                              | +0.02 / −1.70; −0.42 / −1.85 | Teams force 0.11-0.16 (0.17 with team TOs)  |
| Physicality 0 / 100              | Their FT rate 0.198 / 0.300                                                     | +0.32 / +0.04; −0.23 / −0.34 | Teams allow 0.20-0.32                       |
| Press after makes / always       | +3.0 / +3.6 possessions, their transition +8 / +10, own eFG −1.5 / −2.5         | −0.84 / −2.94; −1.21 / −3.36 | A full-court press all game loses           |
| Mentality −2 / +2                | −2.2 / +2.5 possessions, the glass, the whistle and turnovers both ways         | −0.14 / −1.60; −0.70 / −1.61 | A coach's risk appetite                     |
| Blitz                            | Their turnovers +3.1, handler plays 5% of plays at 0.45, roll man 15.7% at 1.28 | −0.57; −0.95                 | Blitzes force turnovers, the 4-on-3 leaks   |
| Switch                           | Their threes −4.1, post-ups 8.2% (3.3% against drop), handoffs 3.2% (5.3%)      | −0.32; −0.24                 | Switching invites post-ups                  |
| 2-3 / 3-2 zone (all game)        | Their threes +8.1 / −3.3, rim −3.8 / +5.2                                       | −0.75 / −2.38; −1.06 / −2.71 | The 2-3 gives up threes, the 3-2 the middle |
| Box-and-one                      | +1.41 against Curry's Warriors, −2.97 against Houston                           | −0.94; −0.90                 | A junk defense dares a lone scorer's cast   |
| Hunt mismatches                  | Isolations +1.4                                                                 | +0.35; −0.17                 | Hunting pays only with a real mismatch      |
| Shapes                           | Five-out rim +0.8, ORB −1.1; horns rim −1.0; twin bigs ORB +1.1, post-ups +1.3  | +0.06 / −0.45 / −0.11        | Spacing and size trade off                  |
| Action weights at 0 or 100       | None a free gain (best +0.05 against rules opponents)                           | pnr 0 −1.34, motion 0 −0.58  | Mixing actions pays                         |
| Hot hand off / OD subs off       | Nothing measurable                                                              | +0.02 / +0.01                | Small edges                                 |
| Crash 75 + threes 100 + push 100 | The second review's free trio                                                   | −0.12; −0.22                 | No free combination                         |

Also right:

- **Blitzing passers is punished** (points per ball-screen trip, blitz against drop): Cunningham 1.49 / 1.24, Haliburton 1.37 / 1.23, Young 1.37 / 1.17, Gilgeous-Alexander 1.42 / 1.33, Jokić 1.32 / 1.18.
- **AI game plans** come in 455 of 841 matchups a month into a season: a 2-3 zone in stretches 136, hunt a weak defender 130, stay home 80, pack the paint 77, pressure 77, get back 44, a stopper on the star 43, fewer fouls 36, crash 29, a box-and-one 27, a coverage change 48.
- **Scouting and reports.** Scouting cards name real identities and cite the evidence ("Stephen Curry uses 34% of their possessions. The rest make 30.4% of their threes"). Counters are measured before they're proposed. Game reports keep the looks apart from the luck ("The Nuggets' shots fell below their looks. That part is luck").

## Where to stop

| Step                                                                                                     | Strict | As a game |
| -------------------------------------------------------------------------------------------------------- | ------ | --------- |
| Switching and hedging pay for the rosters built for them; Edwards-class shooters punish drop (finding 1) | +2.5   | +1        |
| The offensive read splits the playbooks; Hub Big pays an elite passing big (finding 2)                   | +1.5   | +1.5      |
| Everything else: the crash curve and run-outs, play types, sets, zone spread, team ranges (findings 3-6) | +4     | +1        |

**The first two get it to about 89 strict and 92-93 as a game. That is where I'd stop.** Finding 1 is a handful of constants in `TK.cov` and worth doing. Finding 2 is a read and label change. The rest is invisible in play.

## Appendix: defensive choices by opponent

Five defenses (Chicago, Miami, Sacramento, Boston, New York) each play every choice all game against each offense, 300 paired games a cell. Net per 100 for the defense against drop, averaged over the five (±about 0.5 a row, 0.1 a column). Rules opponents.

| Offense          | Hedge | Ice   | Blitz | Switch | Double | Show  | 2-3 zone | 3-2 zone | Box-and-one | Triangle-and-two |
| ---------------- | ----- | ----- | ----- | ------ | ------ | ----- | -------- | -------- | ----------- | ---------------- |
| GSW (Curry)      | +0.94 | +0.39 | +0.69 | −0.49  | −0.77  | +0.28 | +1.40    | −0.74    | +1.41       | +0.65            |
| MIN (Edwards)    | +0.15 | +0.02 | −1.17 | −0.45  | −2.19  | −0.02 | −2.56    | −3.61    | −0.94       | −1.15            |
| OKC              | −1.43 | −0.35 | −3.13 | −1.83  | −2.33  | −0.43 | −1.63    | −3.71    | −1.50       | −1.73            |
| HOU (Durant)     | −0.18 | −0.31 | −0.25 | −1.54  | −0.09  | −0.18 | −2.02    | −2.86    | −2.97       | −2.88            |
| LAL (Dončić)     | −0.03 | −0.12 | −2.16 | +0.16  | −2.46  | +0.56 | −1.89    | −3.53    | −1.03       | −0.81            |
| PHX (Booker)     | +0.74 | +0.48 | +1.16 | +0.63  | −1.18  | +1.30 | −0.50    | +0.05    | −1.22       | −1.72            |
| WAS              | −2.85 | −1.34 | −5.80 | −2.58  | −1.53  | −1.07 | −2.64    | −5.48    | −3.74       | −4.25            |
| IND              | −0.96 | −0.89 | −4.56 | −0.66  | −2.68  | −0.56 | −2.09    | −3.23    | −0.29       | −1.43            |
| MEM              | +0.55 | +0.05 | +0.10 | −0.30  | −1.07  | −0.00 | −2.95    | −2.45    | −1.97       | −2.51            |
| CLE              | −0.76 | −0.08 | −3.76 | −0.41  | −1.75  | −0.22 | −0.90    | −2.70    | −0.85       | −1.62            |
| DET              | −3.39 | −1.33 | −5.06 | −1.97  | −4.92  | −3.30 | −2.92    | −4.26    | −2.36       | −4.84            |
| DEN (Jokić)      | −0.53 | −0.01 | −2.82 | −1.21  | −2.63  | −0.53 | −1.69    | −2.87    | −1.64       | −2.47            |
| **All 60 cells** | −0.65 | −0.29 | −2.23 | −0.89  | −1.97  | −0.35 | −1.70    | −2.95    | −1.42       | −2.06            |
| **AI opponents** | −0.70 | −0.26 | −2.29 | −0.58  | −2.02  | −0.33 | −1.85    | −2.79    | −1.37       | −2.03            |

What each choice does to the offense (rules, all cells, share of plays, points a play): drop handler 20.6% at 1.01 and roll man 5.0% at 0.92; hedge 13.9% at 0.90 and 11.1% at 1.18; blitz 5.0% at 0.45 and 15.7% at 1.28, spot-ups 36.0%; switch post-ups 8.2% (3.3% against drop), handoffs 3.2% (5.3%), off-screens 1.6% (2.6%).

## Method and caveats

- **Paired games remove most of the noise, not all of it.** A lever's 12-matchup mean carries about ±0.2 per 100, so effects under about 0.4 are within noise. A coverage column over 60 cells carries ±0.1. A playbook's worth for one roster carries about ±0.27 a game.
- **"Best" counts include noise.** Picking the best of several playbooks by measurement flatters the winner, so the staff's picks were also scored on held-out games (pick on one seed set, value on the other).
- **Opponent modes.** "Rules" opponents play as the kit's sides do. "AI" opponents play with an AI coach's habits and adjustments, but without the opponent-specific game plan the season builds; the kit's league part includes those plans.
- **The lab league** is the 2026-27 seed league on seed 7, so averages depend on its rosters. Where an effect flips by opponent, the findings say so. The team-range comparisons use the kit's season-runner league (seed 307), which plays as the app does.
- **Real-team correlations** are partly in-sample: the styles were built from a blend of the same two Synergy seasons.
- **Coverage shares** are Second Spectrum's 2020-21 figures, as reported by [The Ringer](https://www.theringer.com/nba/2021/5/17/22439801/nba-play-in-playoffs-steph-curry-damian-lillard). Switching has grown since ([FiveThirtyEight](https://fivethirtyeight.com/features/anybody-and-everybody-can-switch-on-pick-and-rolls-now)).
- **Unmeasured items** are listed under "How this was measured". Where the score depends on them (roles, adjustments' worth), the judgement leans on the code and the kit's league output.
- **No repo file was changed** apart from this review. The kit's output (`out/rev3-head`), my scripts and every result file are in this session's scratchpad (`reviewer3/`).
