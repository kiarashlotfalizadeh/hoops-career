# Game-day tactics realism review 2

November 10, 2026, on commit 3bf220c (branch tactics-v2, clean working tree). Same scope, scale and bar as the first review (`review/GAMEDAY-TACTICS-REALISM.md`, commit f27e467, 69 strict and 78 as a game). This review covers only tactics: the choices a coach makes and how the engine plays them, the AI coaches' choices, and what the staff tells you, measured against the NBA. Nothing in the first review was assumed to still hold or to be fixed. Everything below was measured on this engine.

The bar is the one you set: it doesn't have to be perfect, it's just a game. Every finding says whether a player would notice it.

## Score: 82 / 100 (about 88 as a game)

**The rewrite fixed what broke the old layer. Junk defenses are now situational. AI teams play their real franchises' styles. AI coaches adjust at both ends, and nothing they do measures as losing. What's left is about balance. A full-game 2-3 zone is as good as man-to-man for most rosters, and your staff recommends it for 13 of 30. Three sliders turned up together are a free gain for every team. And the staff's offensive advice can't tell playbooks apart, so it puts Jokić's Nuggets in Pace & Space.**

- **What's right.**
  - **Junk defenses fit the opponent now.**
    - A box-and-one played all game is −0.35 per 100 against drop on average (60 defense-offense pairings). It comes out positive in 23 of the 60.
    - It pays against a lone scorer with no shooting around him: +2.2 to +3.1 against Curry's Warriors. It costs against a shooting team: −2.7 to −4.0 against the Celtics.
    - The first review measured the triangle-and-two at +2.2 per 100 against each team's own defense and +3 to +6 against star-led teams. Now it is −0.3.
  - **AI teams play like their real franchises.**
    - Each real team's coach plays a style built from its 2024-26 Synergy play types and box scores (`ai/style.ts`, `src/data/realStyles.json`).
    - Team play-type shares correlate with the real teams' at +0.30 to +0.93 for nine of the ten kinds (putbacks +0.15). They carry over from season to season about as much as real teams' do.
    - The scouting card reads like the real team. Warriors: "Motion-heavy". Nuggets: "Post-up-heavy". Rockets: "slow, post-up-heavy with few threes". Clippers: "Isolation-heavy, slow".
  - **The coverages have personnel logic.**
    - Drop is the best base coverage on average, and the elite pull-up shooters punish it. Curry scores 1.23 a trip against drop and 1.11 against hedge or ice.
    - Blitzing loses to passers (Gilgeous-Alexander 1.41 a trip against it, Dončić 1.34) and forces turnovers: +3.0 points of opponent turnover rate.
    - Switching turns ball screens into post-ups (from 3.2% to 8.2% of plays) and kills handoffs.
    - Ice is played only on side screens.
  - **No action weight is a free choice, and both ends of most sliders cost.** Setting motion to 0 costs 1.0 per 100 (it was a free +1.2).
  - **Shapes and mismatch hunting move the game.** Five-out opens the rim and costs offensive boards. Twin bigs win the glass. Hunting adds 1.1 points of isolations.
  - **Points per play are the NBA's.** Counted Synergy's way (an offensive rebound starts a new play), the sim scores 1.040 a play against the NBA's 1.046. Cuts score best, as in Synergy, and the order is close to Synergy's apart from pick-and-roll handlers (finding 8). The roll man finishes 31% of pick-and-rolls (the NBA's figure is 26%; it was 44%).
  - **The AI coaches are real coaches now.**
    - They game-plan for every opponent: zones against fives that can't shoot, box-and-ones on high-usage stars, hunting weak defenders.
    - They show high on Curry-class shooters instead of dropping, and trap elite scorers who don't pass.
    - They call after-timeout sets.
    - They adjust their offense as well as their defense, and no kind of adjustment measures as losing.
  - **The staff measures before it speaks.**
    - Counters are played out in the engine before they're proposed ("attacked drop coverage with pull-up jumpers: +1.0 points a game in your last meeting").
    - Game reports keep the looks apart from the luck.
    - The defensive playbook read tracks measured worth at r 0.93.
- **What a player would notice.**
  1. **Your staff runs a 2-3 zone as the base defense for 13 of 30 rosters.** A full-game 2-3 zone measures as the best defense for 10 rosters, and within half a point a game of the best man-to-man coverage for 21. In a fresh league, the staff set the Nuggets to Pace & Space and a 2-3 zone. No NBA team plays zone as its base defense.
  2. **The offensive playbook chooser can't tell playbooks apart.** On average 5.7 of the 6 offenses read as "Similar fit". The staff only ever recommends Balanced or Pace & Space (15 rosters each). That includes Pace & Space for Jokić.
- **What only the numbers show.**
  - **Three sliders up together are a free +1.7 per 100.** Glass at "Crash" (75), shot profile 100 and pushing after every stop beat every team's own settings in all 12 test matchups, against AI opponents that adjust too. That's about 4-5 wins a season for any team.
  - **Defensive roles reward the role, not the player.** Hide your two best perimeter defenders and make your two worst the stoppers, and it's worth as much (+0.45 ± 0.20 per 100) as the right assignment (+0.33 ± 0.19).
  - **Crashing still feeds the other side's break.** The fifth of teams that crash hardest give up 34% more run-outs than the fifth that crash least. In the NBA they give up none more.
  - **After-timeout sets score 15% better than other half-court trips.** In the NBA they score about the same.
- **Recommendation.** Price the full-game zone like the NBA's and make the offensive read split the playbooks. Then retune the three sliders so each team's own setting is near its best. Leave the rest.

### Scorecard

"As a game" counts only what a player could see: in the live game, the box score, the game report, the scouting card, the staff's reads, or by trying a tactic for a few games (the staff's edit ledger measures what a change was worth).

| Area                                   | Weight  | Strict | As a game | Why                                                                                                                                                                                                                                 |
| -------------------------------------- | ------- | ------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The toolkit: what a coach can choose   | 10      | 9.5    | 9.5       | Everything from the first review plus offense-defense substitutions, glass duties and defensive roles. Missing: a coverage for one handler only ("show on Curry, drop on the rest"), which the AI does, and lineup-specific schemes |
| Levers do the right things             | 20      | 18     | 19        | Every slider, coverage, zone, shape and hunt moves the right stats with a cost; blitz forces turnovers; drop is punished by pull-up shooters. Crashing still raises the other side's run-outs (the NBA's doesn't); roles are flat   |
| Effect sizes and balance               | 20      | 14.5   | 16.5      | No dominant choice and junk is situational. A full-game 2-3 zone ties man-to-man for most rosters; crash/threes/push together are a free +1.7 per 100 everywhere; max pressure forces more turnovers than any NBA defense           |
| Personnel fit                          | 10      | 8      | 8         | Coverages, zones, junk, pressure and Hub Big all scale with the players (Hub Big +1.0 a game for Şengün's Rockets, −1.0 for the Thunder). Roles ignore who plays them; Hub Big doesn't pay Jokić's Denver over its own mix          |
| What happens on the floor (play types) | 15      | 12     | 13.5      | Per-play points right overall and in order, roll man near the NBA's. Handler plays too efficient (0.96 vs 0.88), spot-ups too common and too poor, cuts and off-screens too common, isolations rare; team spreads wide              |
| AI coaches' tactics                    | 15      | 12.5   | 13.5      | Real styles, personnel coverages, game plans for everyone, two-way adjustments that don't lose, sets. Sets too rich; every team's zone the same 2-3%; the answer to a zone does nothing; styles cost ~0.5 a game vs Balanced        |
| Staff reads and feedback               | 10      | 7.5    | 8         | Measured counters, evidence-based scouting, honest game reports, defense read r 0.93. Offense read r 0.49 with "Similar fit" for nearly all; shape read r 0.12; zone recommended for 13 rosters                                     |
| **Total**                              | **100** | **82** | **88**    |                                                                                                                                                                                                                                     |

## The first review's findings, re-measured

| First review (f27e467)                                                             | Now (3bf220c)                                                                                                                                      | Status       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Junk defenses beat almost anyone: triangle-and-two +2.2 per 100, +3 to +6 vs stars | Box-and-one −0.35 and triangle-and-two −0.56 vs drop (60 cells); positive mainly vs Curry's Warriors (+2.2 to +3.1); vs own settings +0.25 / −0.31 | Fixed        |
| AI teams play random styles (r −0.21 to +0.26 with real teams)                     | Real styles: r +0.30 to +0.93 for nine of ten play types; real identities on the scouting card                                                     | Fixed        |
| AI coverage mix: switch 6.5%, hedge 24%                                            | Drop 49%, hedge 22%, switch 18%, ice 5%, zone 4%, blitz 2.3% (NBA 2020-21: drop 58%, switch 18%, blitz 3%)                                         | Mostly fixed |
| Every AI man defense switched all off-ball screens                                 | Only switching coverages switch off the ball                                                                                                       | Fixed        |
| Adjustments 1.6 a game, all defensive, two of them losing                          | 0.4-0.5 a game at both ends; none measured as losing                                                                                               | Fixed        |
| AI never called sets, game-planned only against you                                | After-timeout sets 2.6 a team-game; game plans in 57% of all matchups                                                                              | Fixed (rich) |
| Never crashing a free +1.0; crash leak up to ×5.5                                  | Never crashing costs 1.2; crashing at 75 is a free +1.0; leak ×1.45 at 100, but crashers still give up a third more run-outs                       | Changed      |
| Physicality moves opponents' FT rate by 40 points; hands-off +0.8                  | 15 points (0.17 to 0.32), 1.6 times the NBA's team range; hands-off +0.36                                                                          | Mostly fixed |
| Motion weight 0 a free +1.2                                                        | −1.0 per 100                                                                                                                                       | Fixed        |
| Shapes and hunting inert                                                           | Five-out rim +0.9 and boards −1.0; twin bigs boards +1.6; hunting isolations +1.1                                                                  | Fixed        |
| Blitz forced +0.2 points of turnovers                                              | +3.0 to +3.4 points                                                                                                                                | Fixed        |
| Ice on every screen                                                                | Side screens only (45%)                                                                                                                            | Fixed        |
| Drop barely punished by Curry (hedge +0.6)                                         | Hedge beats drop by 1.3 per 100 against the Warriors; Curry 1.23 a trip vs drop, 1.11 vs hedge                                                     | Fixed        |
| Roll man 44% of pick-and-roll finishes (NBA 27%)                                   | 31% (NBA 26%)                                                                                                                                      | Mostly fixed |
| "Similar fit" for every playbook; Pace & Space for Jokić                           | Still: 5.7 of 6 offenses "Similar fit"; the staff sets Denver to Pace & Space and a 2-3 zone                                                       | Not fixed    |
| Possible bug: set plays doubling help                                              | `setPlays.ts` passes `help / 2` (±1, as `sets.ts` reads it)                                                                                        | Fixed        |

## Would a player notice?

| What's off                                                  | Where a player would see it                                                     | Would they notice?      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------- |
| The staff's base defense is a 2-3 zone for 13 of 30 rosters | The playbook chooser and hand-over line; game reports crediting "your zone"     | Yes, any NBA fan        |
| Every offense a "Similar fit"; Pace & Space for Jokić       | The playbook chooser                                                            | Yes                     |
| Crash, threes and push together a free +1.7 per 100         | The staff's edit ledger, if a player tries them; otherwise only over many games | Maybe, by experimenting |
| Roles don't care who plays them                             | Only by measuring                                                               | No                      |
| Crashing teams give up more run-outs                        | The scouting card says "crashes hard, which leaves them open to run-outs"       | Rarely                  |
| After-timeout sets 15% better than other half-court trips   | Only by measuring                                                               | No                      |
| Cuts and spot-ups too common, isolations rare               | "What they're running" in the live game                                         | Rarely                  |
| Every AI team plays the same 2-3% zone                      | Rarely seeing a zone from anyone but Miami                                      | No                      |

## How this was measured

- **The kit** (`scripts/tactics-lab/run.ts rev-head`): 47 levers in six real matchups (200 paired games each); eight defensive choices from three defenses against nine offenses (250 a cell); the AI league over three seasons through the season runner (2,160 sampled games, game plans included); `adjustments.ts` at 300 games a matchup. My run reproduced `out/final` exactly. The kit's output was moved to this session's scratchpad.
- **My own paired experiments** (scripts in the scratchpad, the kit's lab league: 2026-27 rosters on seed 7, about 1.6 million games in all). Each side plays either by the kit's rules, with no adjustments, or as an AI coach does: his habits, zone mixing, sets and adjustments. Side A, the one making the change, keeps it all game.
  - **Levers.** The kit's 47 settings plus 12 more, over 12 matchups (the kit's six and six more), 300 games each. Against an opponent that doesn't adjust and one that does.
  - **Defensive choices by opponent.** Ten choices from five defenses (Chicago, Miami, Sacramento, Boston, New York) against twelve offenses, including every elite pull-up handler's team. 200 recorded games a cell, both opponent modes. Each elite handler's ball-screen trips tallied by the coverage on them.
  - **Playbooks and shapes.** Every playbook (six offensive, seven defensive) and shape (four) for each of the 30 teams. Played as the user's team plays them, against every other team's AI: 1,392 games per team and choice. Then the staff's reads (`coachAI.ts` fits, as the user's staff shows them) set against the measured worth.
  - **The AI league as it plays.** All 870 ordered pairs, AI against AI, 8 recorded games each (6,960 games). Plays counted Synergy's way (an offensive rebound starts a new play). Also coverage and scheme shares, adjustments, sets, and run-outs after defensive boards.
  - **Small checks.** Roles turned upside down, the hot hand, offense-defense substitutions, zones and junk played in stretches, the three sliders together, Hub Big's action mix for passing-big teams.
- **Real NBA numbers.**
  - **Synergy play types** by team, 2024-25 and 2025-26 (`data/raw/synergy/teams.json`).
  - **Team box-score ranges** (`src/data/realStyles.json`).
  - **The 2024-26 play-by-play** (`data/raw/games/PlayByPlay.parquet`): each team-season's offensive rebounding against how often its opponents pushed after its misses (60 team-seasons).
  - **Coverage shares** from Second Spectrum 2020-21, as the first review used them.
- **What the staff says.** A real league (seed 307, the user as Denver) run a month into the season. Its scouting cards, counters, game reports, the playbook chooser's reads and the AI game plans for every matchup.
- **Side effects.** `scripts/gameday-check.ts`, three seasons: 89 OK, 60 OFF.
- **Code checked** for every claim that depends on it. Cited inline.

## Findings

No P1. The first review's two P1s are fixed, and nothing I measured is as large or as visible.

### 1. The full-game 2-3 zone is priced like man-to-man, and the staff recommends it (P2, visible)

**What it is.** The 2-3 zone is one of the seven defensive playbooks, played all game by the user's team (the user's side plays a base zone 100% of the time: `game.ts` `coachHabits`, `zone: 1`). Measured three ways:

| Test                                                             | Full-game 2-3 zone                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| As a playbook, every team vs all 29 opponents (1,392 games each) | Best of the seven defenses for 10 rosters; within 0.5 a game of the best man coverage for 21 |
| Against each team's own settings, 12 matchups                    | +0.36 ± 0.26 per 100 (+0.11 against AI opponents that adjust)                                |
| Against drop, 60 defense-offense pairings                        | −0.46 ± 0.14 (−0.57 against AI); positive in 23 of 60                                        |
| Against the Warriors / Lakers' defense vs the 76ers / Celtics    | +1.8 to +2.5 / +3.6 / −3.2 to −3.5                                                           |

The staff's defensive read (`DEF_FIT` in `coachAI.ts`) tracks this at r 0.93, so it recommends the zone for 13 of 30 rosters (Drop 12, Blitz 5). In a fresh league with the user as Denver, the staff-run playbook was Pace & Space with a 2-3 Zone. The first game report then credited it: "The Nuggets' zone clogged driving lanes and post-ups (+5.7)". The code's own note says this is known: "Measured best on the real league: the 2-3 zone 11".

**Why it's wrong.** No NBA team plays a 2-3 zone as its base defense. Zones are a change-up, a few percent of half-court trips for most teams and the low teens for the heaviest users. Over a full game, NBA offenses solve them with the high post and shooters. The sim's AI offense does answer a zone: "attacks the zone with ball movement" fires 1.44 times a game against one. But the answer is worth about nothing; the zone's value moves from −0.46 to −0.57.

**What's right about zones.**

- Played in stretches, as an AI staff plays a planned one (19% of half-court trips), the 2-3 is −0.09 ± 0.13 per 100. That's an honest change-up.
- The 3-2 zone all game is clearly bad (−1.4 to −2.0).
- Against each choice the shot profile moves the NBA's way. The 2-3 adds +6.6 points of opponent threes, −3.8 at the rim, +3.5 offensive boards and +10 points of spot-ups. The 3-2 adds rim +5.9 and cuts +1.9.

**Would a player notice?** Yes. The staff's pick is on the Tactics screen and in the hand-over line, and the reports praise it.

**Fix.**

- Charge the full-game zone what an NBA zone costs over 48 minutes. Let the zone's open threes and offensive boards grow the longer it's played in a game: the offense reads it.
- Or make the AI's answer to a zone real: the high-post flash and quick ball reversal, not just more motion weight (the 3-2 gets no answer at all).
- Keep it out of the staff's recommendation except against fives that can't shoot.

**Target:** about −1 to −2 per 100 played all game against most offenses, positive only against a non-shooting five; the staff recommends it for none of the 30 real rosters.

### 2. The offensive playbook read can't tell playbooks apart (P2, visible)

**What it is.** Each of the six offensive playbooks played for each of the 30 rosters:

- **Little separates them.** A roster's best playbook is worth about 0.5 a game more than its average one. The spread across the six averages 0.38 a game (SD within a team).
- **The staff's read** (`OFF_FIT`: Balanced 1.7 fit points with no roster terms, Pace & Space 1.8 plus 0.17 a point of the lead creator's rating over 67) tracks the measured worth at only r 0.49.
- **On the screen**, 5.7 of the 6 offensive playbooks read "Similar fit" on average (within the 0.5-a-game threshold, `WORTH_MIN`).
- **The staff only ever picks two.** Its pick over the 30 real rosters is Balanced 15 times and Pace & Space 15 times. By construction, Five-Out can never win the read, and Hub Big would need a top eight averaging about 72 in passing.
- **What measures best** is more varied: Balanced 10, Pace & Space 7, Hub Big 4, Heliocentric 3, Grit & Grind 3, Five-Out 3.

Denver, against its own settings, per game (± 0.39):

| Balanced | Pace & Space | Hub Big | Grit & Grind | Five-Out | Heliocentric |
| -------- | ------------ | ------- | ------------ | -------- | ------------ |
| +1.07    | +0.99        | +0.79   | +0.76        | +0.58    | +0.39        |

The staff reads Pace & Space +0.24, Balanced +0.17 and Hub Big −0.13: all "Similar fit". It runs Jokić's Nuggets as Pace & Space.

**Hub Big has personnel logic.** Played as an action mix only (pace, shot profile and glass kept as each team's own), it's worth:

- +1.01 a game for Şengün's Rockets and +0.91 for Sabonis's Kings;
- −0.91 for the Cavaliers and −1.01 for the Thunder, who have no passing big;
- −0.18 for Denver. Denver's own post-heavy mix already runs through Jokić, so this is mostly a read and label problem.

The shape read (`shapeFits`) tracks measured worth at r 0.12, which is noise. Five-out measures best for 19 rosters; the staff picks it for 12.

**Would a player notice?** Yes. The first review's complaint stands: every offense is a "Similar fit", and Pace & Space for a Jokić team.

**Fix.**

- Give Hub Big a roster term an elite passing big actually triggers. Denver's top-eight passing average can't reach what the read needs now.
- Fit the read to the action-mix worth, which does separate rosters.
- Show the playbooks' order rather than "Similar fit" when the read's whole range is under the threshold.

### 3. Three sliders together are a free gain for every team (P2, numbers and the edit ledger)

Each against the team's own settings, 12 matchups, 300-400 paired games each:

| Setting                                    | Against rules opponents      | Against AI opponents    |
| ------------------------------------------ | ---------------------------- | ----------------------- |
| Glass: Crash (75)                          | +0.98 ± 0.20, 10/12 positive | +0.91 ± 0.20, 10/12     |
| Shot profile 100                           | +0.82 ± 0.24, 11/12          | +0.69 ± 0.24, 10/12     |
| After a stop 100                           | +0.68 ± 0.22, 10/12          | +0.61 ± 0.22, 10/12     |
| All three                                  | **+1.83 ± 0.21, 12/12**      | **+1.71 ± 0.21, 12/12** |
| Physicality 25 (hands off), alone          | +0.39 ± 0.19, 8/12           | +0.13 ± 0.20, 8/12      |
| Feed the hot hand off (it's on by default) | +0.23 ± 0.10, 10/12          | n/a                     |

Each team's own settings are its real franchise's: tempo, threes, glass and pushing from its 2024-26 numbers (`style.ts` `READ`). The engine prices more threes, more crashing and more running above what real teams chose.

- The per-matchup gain of all three runs +1.0 to +3.5 against rules opponents (+0.1 to +2.9 against AI ones): positive for all 12 teams tested, the Cavaliers' non-shooting bigs included.
- It is also why the generic Balanced playbook beats 23 of 29 AI teams' own offenses (+0.5 a game on average). Balanced carries crash 55 and shot profile 62.

The code knew about part of it. `TK.longRebound` was added because more threes "was a free +1.2 per 100", and it is still +0.7 to +0.8.

**Would a player notice?** Not by watching. But the staff measures every change a user makes (the edit ledger), so a player who tries these will be told they help, for every team.

**Fix.** Retune the long rebound, the crash fade and the transition edge until each team's own setting is near its best for its roster. Target: no single slider move worth more than about +0.5 per 100 for most teams, and three together under +1.

### 4. Defensive roles reward the role, not the player (P2 strict, P3 as a game)

Over 12 matchups, 400 paired games each:

| Roles                                                                                         | Net per 100                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------- |
| The right way: best perimeter defender stopper, second-best point-of-attack, two worst hidden | +0.33 ± 0.19, 8/12                    |
| Upside down: two best hidden, the two worst as stopper and point-of-attack                    | +0.45 ± 0.20, 10/12                   |
| The staff's own roles removed                                                                 | +0.08 ± 0.10 (7 of 12 teams had none) |

**Why.** Each role's edge is flat, whoever plays it:

- the point-of-attack stopper's extra turnovers and fewer blow-bys (`defense.ts:367`, `:392`, `TK.role.poaTO`, `poaBlowBy`);
- the wing stopper's touches and contest (`usage.ts:46`, `shots.ts:178`);
- the roamer's help (`defense.ts:138`).

The matchup solver's role pull (2.5 cost units, `matchups.ts`) outweighs a defender's quality (at most about 1.2). So the role sends the player to his man however bad he is, and the bonus comes with him.

**Fix.** Scale each role's edge by the player's fit for it (`defRoleFits` exists) and make a mismatch cost: a hidden good defender wasted, a bad one exposed.

### 5. Crashing still feeds the other side's break (P3, numbers only)

| Measure                                                                                                                     | NBA 2024-26 (60 team-seasons) | Sim (AI league, 6,960 games) |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------- |
| Team offensive rebound %, mean and SD                                                                                       | 25.6%, 2.8 points             | 25.2%, 2.2 points            |
| Quick trips after a defensive board off its misses (NBA: a shot or shooting foul within 6 s; sim: the trip over within 6 s) | 29.3%                         | 22.7%                        |
| ... bottom-fifth crashers / top-fifth crashers                                                                              | 28.8% / 29.0%                 | 21.7% / 24.6%                |
| Correlation of offensive rebounding with those pushes                                                                       | +0.05                         | +0.66                        |
| The engine's own run-outs after its misses, bottom / top fifth                                                              |                               | 18.5% / 24.8%                |

- The leak is much smaller than the first review's: ×1.45 at full crash, not ×5.5 (`TK.crash.leak`).
- Crashing pays anyway: Crash is a free +1 (finding 3), and "never crash" costs 1.2 per 100.
- The trade-off still has the wrong shape. Real crashing teams give up no extra break.
- The scouting card says so as a fact: "Crashes the offensive glass hard, which leaves them open to run-outs."

**Fix.** Move the cost of crashing off the opponent's run-outs, toward the crash's own fade. Then the team spread of offensive rebounding (2.2 against 2.8) widens on its own.

### 6. Effect sizes outside the NBA's range (P3, numbers only)

- **Maximum ball pressure.**
  - It adds +4.3 points to the opponent's turnover rate (0.135 to 0.178). The NBA's best turnover-forcing defenses sit near 0.16-0.17, team turnovers included.
  - The net swings from −5.4 (Lakers vs 76ers) to +5.8 (Raptors vs Hornets) per 100, by the opponent's ball security.
  - The direction is right; the top is out of range. Fix: flatten the top of `TK.pressure.to`.
- **Physicality.**
  - It moves the opponent's free-throw rate from 0.17 at 0 to 0.32 at 100 (base 0.243). That's 1.6 times the NBA's whole team range: 0.20-0.29 in 2024-25, 0.23-0.32 in 2025-26.
  - Hands-off is +0.36 per 100 (9/12). Much closer than the first review's 40 points and +0.8.
- **Team spreads.** The AI league against the NBA's 2024-26 team SDs:
  - pace: 1.6-1.9 vs 2.0-2.1 possessions;
  - 3PA rate: 0.038-0.047 vs 0.036-0.042;
  - free-throw rate: 0.025-0.028 vs 0.015-0.026;
  - turnovers forced: 0.007-0.009 vs 0.012 (narrow);
  - turnovers committed: 0.018-0.022 vs 0.010 (twice the NBA's).

### 7. AI habits (P3)

- **After-timeout sets are rich.** AI coaches call 2.6 sets a team-game. They score 1.30 a trip against 1.13 on other half-court trips. NBA after-timeout plays score about the half-court average (Synergy, as [Deadspin](https://deadspin.com/which-nba-coaches-are-best-at-designing-plays-during-t-1482773198/) reported it for an older season: 88.65 vs 88.44 per 100). Fix: halve the sets' edge for AI coaches, or tie it to the coach's tactics rating.
- **Everyone plays the same zone.**
  - Every coach but Miami's mixes in a 2.5% zone (`style.ts` `ZONE = { MIA: 0.12, rest: 0.025 }`): 2.2-2.8% of half-court trips for 28 teams, 11.8% for Miami (Atlanta, the lab league's user team, 1.3%). Planned zones add a bit.
  - No AI team ever plays a 3-2 zone.
  - Real teams range from almost none to the low teens. Fix: seed each real team's zone share from its real use.
- **Adjustments are rare but sound.**
  - 0.40-0.52 a game in the AI league. Icing a hot pull-up shooter 30%, going at a defender in foul trouble 23%, chasing the game late 21%, dropping the big 16%, then backing off, attacking the zone, staying home, man-to-man and hunting switches.
  - In `adjustments.ts` (one side adjusting, the other not), none loses. Dropping the big: +1.4 ± 1.0 a game where made. Foul-trouble hunting: +0.8 ± 0.5. Chasing: +0.1 ± 0.2.
  - Most kinds are made in 2% of games or fewer, so their worth is noisy.
- **Styles cost the AI a little.** An AI team's real style loses about 0.5 a game to the generic Balanced playbook (23 of 29 teams), mostly through finding 3's sliders. Its shapes are four-out or five-out only, and five-out on 6 of 30 teams where it measures best for 19.

### 8. What happens on the floor: play types (P3)

The AI league, plays counted Synergy's way (an offensive rebound starts a new play: 109 plays of the ten kinds a team-game, Synergy's 106-107). Shares are of the ten Synergy kinds:

| Play type        | NBA 2025-26: share, PPP | Sim: share, PPP | Team SD, NBA / sim | Sim vs real team shares (r) |
| ---------------- | ----------------------- | --------------- | ------------------ | --------------------------- |
| Spot-up          | 25.8%, 1.05             | 31.4%, 0.97     | 3.4 / 3.9          | +0.30                       |
| Transition       | 19.6%, 1.14             | 11.2%, 1.23     | 2.5 / 2.0          | +0.74                       |
| PnR ball handler | 16.2%, 0.88             | 16.1%, 0.96     | 3.1 / 3.6          | +0.63                       |
| Isolation        | 7.6%, 0.93              | 6.3%, 0.90      | 2.0 / 2.1          | +0.93                       |
| Cut              | 7.2%, 1.31              | 9.1%, 1.31      | 1.6 / 2.5          | +0.44                       |
| PnR roll man     | 5.7%, 1.11              | 7.1%, 1.07      | 1.2 / 1.5          | +0.30                       |
| Putback          | 5.6%, 1.12              | 4.6%, 1.21      | 0.8 / 0.9          | +0.15                       |
| Handoff          | 4.8%, 0.95              | 5.3%, 0.95      | 1.5 / 1.5          | +0.58                       |
| Off screen       | 3.9%, 0.98              | 5.6%, 0.99      | 1.4 / 2.4          | +0.40                       |
| Post-up          | 3.6%, 1.00              | 3.3%, 0.95      | 1.5 / 2.1          | +0.76                       |

- **Overall** the sim scores 1.040 a play to the NBA's 1.046.
- **Transition.** Synergy counts early offense as transition; the sim labels it by its action, so its transition share runs low by construction.
- **What's left.**
  - Pick-and-roll handler plays are the NBA's least efficient (0.88); here they score 0.96, above isolations, post-ups and handoffs.
  - Spot-ups are both too common and too poor: kick-outs are worth less, the handler's own shot more.
  - Cuts, off-screen plays and spot-ups run high and isolations low. `gameday-check` flags cuts at 9.6% of shots against the NBA's 4-8%.
  - Teams differ more than real teams in off-screen plays, cuts and post-ups (the SD columns).
- **Real-team correlations** are against the 2025-26 numbers the styles were partly built from (a 1/3 2024-25, 2/3 2025-26 blend), so they measure fidelity, not prediction. Season to season the sim's teams carry their styles at r 0.22-0.81 by play type, and real teams at 0.25-0.74.

A player would see this only in "What they're running". Leave it unless you're in there.

### 9. Toolkit gaps (P3)

- **No coverage for one handler.** The AI shows high on Curry-class shooters (`TK.upShooter`) and traps elite non-passers (`TK.blitzStar`) screen by screen. The user can only double a star (`starPlan`), which costs 1.9 per 100 on average and 1.1 even against Curry's Warriors.
- **No lineup-specific scheme** (zone only with a given five).
- **Offense-defense substitutions** now exist and are worth about nothing (+0.02 ± 0.01 per 100 off), as in the NBA.

## What's right: protect it

Twelve matchups, the team keeping the setting all game against its own settings, 300 paired games each (net per 100, ± about 0.22). Shares are percentage points.

| Lever                         | What it moves                                                                                                         | The NBA                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Tempo 0 / 100                 | −4.1 / +5.5 possessions; net −0.18 / +0.19                                                                            | Teams range 97-105.5 possessions                       |
| After a stop 0 / 100          | Transition share −5.3 / +4.4                                                                                          | Teams' Synergy transition 16-26%                       |
| Shot profile 0 / 100          | 3PA rate −12.0 / +7.5                                                                                                 | Teams range 34-54%                                     |
| Attack the rim 0 / 100        | Rim share −2.9 / +1.6, turnovers +0.3 at 100                                                                          | Driving costs charges and strips                       |
| Help 0 / 100                  | Their threes −8.3 / +7.1, rim +4.5 / −3.1; both ends cost (−1.2 / −2.0)                                               | Help trades rim shots for kick-outs                    |
| Ball pressure 0 / 100         | Their turnovers −1.4 / +4.3, free throws −2.6 / +3.1, eFG −0.6 / +3.9                                                 | Pressure forces turnovers and gets beaten              |
| Press after makes / always    | +3.0 / +3.5 possessions, their run-outs +8 / +10, own eFG −1.7 / −2.7; −0.9 / −2.9                                    | A full-court press all game loses                      |
| Drop / hedge / blitz / switch | Drop: their rim −1.7, threes +1.2. Hedge: rim +2.5. Blitz: turnovers +3.0, eFG +3.2. Switch: threes −5.8, post-ups +5 | Second Spectrum's coverages, each with its cost        |
| 2-3 zone / 3-2 zone           | Threes +6.6 / −5.7, rim −3.8 / +5.9, offensive boards +3.5 / +5.1                                                     | The 2-3 gives up threes and boards; the 3-2 the middle |
| Box-and-one                   | +2.2 to +3.1 against Curry's Warriors, −2.7 to −4.0 against the Celtics                                               | A junk defense dares a lone scorer's cast              |
| Zone or junk in stretches     | −0.09 / −0.14 per 100 at about a fifth of trips                                                                       | A change-up                                            |
| Shapes                        | Five-out rim +0.9, boards −1.0; horns rim −1.1; twin bigs boards +1.6, post-ups +1.3                                  | Spacing and size trade off                             |
| Hunt mismatches               | Isolations +1.1, about even                                                                                           | Hunting pays only with a real mismatch                 |
| Mentality −2 / +2             | −2.3 / +2.7 possessions, the glass, the whistle and transition both ways; −0.3 / −0.6                                 | A coach's risk appetite                                |
| Action weights                | No setting at 0 or 100 is a free gain (best +0.32)                                                                    | Mixing actions pays                                    |

Also right:

- **Elite pull-up handlers punish drop** (points per ball-screen trip by the coverage on it): Curry 1.23 vs 1.11 (hedge), Edwards 1.21 vs 1.17, Dončić 1.29 vs 1.23.
- **Blitzing a passer is punished**: Gilgeous-Alexander 1.41, Dončić 1.34, Jokić 1.37.
- **The AI's coverage mix** is near Second Spectrum's: drop the most common at 49%, switch 18%, blitz 2.3%, ice only on side screens. The 2020-21 split was 58 / 18 / 3, and switching has grown since ([The Ringer](https://www.theringer.com/nba/2021/5/17/22439801/nba-play-in-playoffs-steph-curry-damian-lillard), [FiveThirtyEight](https://fivethirtyeight.com/features/anybody-and-everybody-can-switch-on-pick-and-rolls-now)). Hedge at 22% is probably a little high.
- **AI game plans** come in 57% of matchups a month into a season. The items: hunt a weak defender 158, stay home on shooters 147, a 2-3 zone in stretches against a non-shooting five 98, pressure loose handlers 71, crash 64, pack the paint 56, get back 52, a box-and-one on a high-usage star with a poor cast 44.
- **The staff's counters** are measured in the engine before they're proposed. Scouting cites the evidence, and game reports split looks from luck.

## Side effects (gameday-check, three seasons)

89 of 149 rows OK. Tactics-relevant rows:

- Zone defense on 4.8% of AI half-court trips (NBA 1-5%, OK).
- Cuts 9.6% of shots (NBA 4-8%, finding 8).
- Corner threes 9.6% of shots (10.8%), above-the-break threes 33.4% (30.6-31.1%), paint non-restricted 15.5% (18.4-18.7%).
- Team strength SD 5.43 (NBA 5.9-6.1; the old engine 4.4-5.3) and the better team winning 66.2% (68.7-69.3%; old 64.7%): a little better than before.
- Players averaging 20 points: 25.3 a season (NBA 33-34; the old engine 26.7-28.8). Possibly a touch lower; worth watching, but not a tactics finding.

## Where to stop

| Step                                                                                                                           | Strict | As a game |
| ------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| The full-game zone priced like the NBA's and kept out of the staff's picks; the offensive read splits playbooks (findings 1-2) | +2.5   | +2.5      |
| The crash, three-point and transition sliders retuned so each team's own setting is near its best (finding 3)                  | +2     | +1        |
| Roles scaled by fit (finding 4)                                                                                                | +1     | +0.3      |
| Everything else: the crash-run-out link, pressure's top, sets, zone spread, play types (findings 5-9)                          | +4     | +1.5      |

**The first two get it to about 86-87 strict and 91-92 as a game. That is where I'd stop.** The third is cheap and worth doing alongside. The rest is invisible in play.

## Appendix: the lab

### Levers, 12 matchups

Twelve matchups from the 2026-27 league on seed 7: the kit's six (CLE-GSW, LAL-PHI, ATL-BOS, TOR-CHA, DEN-OKC, NYK-MIL) and MIA-UTA, MIN-HOU, PHX-IND, SAS-DET, BKN-MEM, ORL-POR. 300 paired games each. Net is points per 100 for the team making the change (± about 0.2-0.27), against an opponent that doesn't adjust, and one that does (AI).

| Setting                        | Net                           | +/12           | Net vs AI                     | What moves (rules)                                                        |
| ------------------------------ | ----------------------------- | -------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Tempo 0 / 100                  | −0.18 / +0.19                 | 6 / 7          | −0.33 / −0.42                 | possessions −4.1 / +5.5                                                   |
| After a stop 0 / 100           | −0.62 / +0.68                 | 3 / 10         | −0.96 / +0.61                 | transition share −5.3 / +4.4                                              |
| Shot profile 0 / 75 / 100      | −0.68 / +0.81 / +0.82         | 2 / 12 / 11    | −0.67 / +0.19 / +0.69         | 3PA rate −12.0 / +3.3 / +7.5                                              |
| Attack the rim 0 / 100         | −0.79 / +0.08                 | 1 / 6          | −0.80 / +0.15                 | rim −2.9 / +1.6                                                           |
| Crash 0 / 25 / 75 / 100        | −1.16 / −0.68 / +0.98 / +0.35 | 1 / 1 / 10 / 7 | −1.07 / −0.73 / +0.91 / +0.06 | ORB −5.0 / −2.4 / +2.4 / +2.5; their transition −0.7 / −0.4 / +1.0 / +2.0 |
| Get back 0 / 100               | −0.44 / −0.13                 | 3 / 3          | −0.72 / +0.11                 | their transition +2.5 / −2.0, own ORB +0.5 / −1.9                         |
| Iso 0 / 100                    | +0.10 / +0.00                 | 7 / 8          | −0.18 / −0.18                 | rim +0.9 / −0.8                                                           |
| Post 0 / 100                   | +0.17 / +0.25                 | 8 / 8          | −0.66 / −0.18                 | 3PA +0.6 / −1.4                                                           |
| PnR 0 / 100                    | −0.89 / −0.55                 | 1 / 2          | −1.17 / −0.87                 | 3PA −4.0 / +1.3                                                           |
| Handoff 0 / 100                | +0.32 / −0.27                 | 7 / 5          | −0.60 / −0.60                 | FT rate +1.1 / −1.7                                                       |
| Motion 0 / 100                 | −1.04 / −0.11                 | 1 / 4          | −1.44 / −0.55                 | 3PA +3.3 / −2.1, eFG −1.3 / +0.1                                          |
| Help 0 / 25 / 75 / 100         | −1.22 / −0.45 / −0.73 / −2.01 | 1 / 5 / 3 / 1  | −1.35 / −0.52 / −1.02 / −2.25 | their 3PA −8.3 / −5.0 / +4.0 / +7.1                                       |
| Pressure 0 / 25 / 75 / 100     | −0.38 / −0.11 / −0.06 / +0.11 | 4 / 5 / 8 / 7  | −0.78 / −0.39 / −0.14 / −0.78 | their TOV −1.4 / −0.9 / +2.0 / +4.3                                       |
| Physicality 0 / 25 / 75 / 100  | +0.36 / +0.39 / +0.02 / −0.24 | 9 / 8 / 8 / 5  | +0.35 / +0.13 / −0.26 / −0.18 | their FT rate −7.0 / −3.5 / +4.0 / +8.0                                   |
| Press after makes / always     | −0.88 / −2.88                 | 2 / 2          | −1.49 / −3.32                 | possessions +3.0 / +3.5, own eFG −1.7 / −2.7                              |
| Mentality −2 / +2              | −0.26 / −0.59                 | 6 / 3          | −0.70 / −1.27                 | possessions −2.3 / +2.7                                                   |
| Drop / hedge / ice             | +0.42 / −0.13 / −0.08         | 5 / 4 / 4      | +0.35 / −0.52 / +0.18         | their rim −1.7 / +2.5 / −0.6                                              |
| Blitz / switch                 | −0.06 / −0.31                 | 8 / 4          | −0.53 / −0.29                 | their TOV +3.0 / −0.2; threes +1.0 / −5.8                                 |
| 2-3 / 3-2 zone                 | +0.36 / −1.41                 | 6 / 2          | +0.11 / −1.43                 | their threes +6.6 / −5.7, ORB +3.5 / +5.1                                 |
| Box-and-one / triangle-and-two | +0.25 / −0.31                 | 7 / 5          | +0.28 / −0.13                 | their threes +5.7 / +3.1                                                  |
| Double the star                | −0.65                         | 5              | −1.36                         | their TOV +1.0, eFG +1.9                                                  |
| Switch off-ball screens        | +0.19                         | 5              | −0.04                         | their FT rate +1.1, ORB +0.5                                              |
| Hunt mismatches                | +0.20                         | 8              | −0.31                         | isolations +1.1 (the kit's six matchups)                                  |
| Five-out / horns / twin bigs   | −0.24 / −0.41 / +0.31         | 4 / 6 / 9      | −0.38 / −0.45 / −0.14         | rim +0.9 / −1.1 / −0.5; ORB −1.0 / +0.1 / +1.6                            |
| Roles off / OD subs off        | +0.03 / +0.02                 | —              | −0.11 / +0.01                 | nothing measurable                                                        |

The base (12 side-A teams): 98.9 possessions, 3PA rate 0.418, rim 0.303, FT rate 0.267, turnovers 0.130, offensive boards 0.253, eFG 0.555. Opponents: 3PA 0.445, rim 0.282, FT rate 0.243, turnovers 0.135.

### Defensive choices by opponent

Five defenses (Chicago, Miami, Sacramento, Boston, New York) each play every choice all game against each offense, 200 paired games a cell. Net per 100 for the defense against drop coverage, averaged over the five (± about 0.45 a row, 0.14 overall). Rules opponents first; the AI-opponent average is in the last row.

| Offense                  | Hedge     | Ice       | Blitz     | Switch    | Double star | 2-3 zone  | 3-2 zone  | Box-and-one | Triangle-and-two |
| ------------------------ | --------- | --------- | --------- | --------- | ----------- | --------- | --------- | ----------- | ---------------- |
| GSW (Curry)              | +1.26     | +0.35     | +0.98     | +0.20     | −1.13       | +2.16     | −0.07     | +2.35       | +1.28            |
| MIN (Edwards)            | +0.29     | +0.16     | −0.98     | −0.12     | −2.79       | −0.46     | −2.21     | −0.23       | +0.46            |
| OKC (Gilgeous-Alexander) | −0.52     | +0.39     | −2.61     | −0.96     | −1.71       | +0.03     | −2.30     | −0.36       | −0.25            |
| HOU (Durant)             | +0.45     | +0.28     | −0.04     | −0.62     | −0.04       | −0.39     | −1.06     | −1.03       | −0.12            |
| LAL (Dončić)             | +0.40     | −0.18     | −1.43     | −1.34     | −2.53       | −0.51     | −2.61     | −0.22       | +0.13            |
| PHX (Booker)             | +1.04     | +0.17     | +1.21     | +0.11     | −0.83       | +0.29     | +1.28     | −0.56       | −0.31            |
| WAS                      | −2.23     | −0.42     | −5.31     | −1.44     | −1.37       | −1.20     | −3.89     | −2.35       | −2.02            |
| IND                      | −1.69     | −0.61     | −4.22     | −0.66     | −2.73       | −1.04     | −3.07     | +0.35       | −0.93            |
| MEM                      | −0.39     | −0.49     | −0.54     | +0.44     | −0.70       | −1.90     | −1.86     | −0.80       | −0.33            |
| CLE                      | −1.40     | −0.56     | −3.97     | −0.23     | −2.52       | +0.12     | −2.07     | +0.76       | −0.27            |
| DET                      | −2.58     | −0.80     | −3.88     | −0.61     | −4.00       | −1.86     | −4.33     | −1.32       | −2.36            |
| DEN (Jokić)              | −0.64     | +0.15     | −2.14     | −1.51     | −1.94       | −0.79     | −2.32     | −0.76       | −2.01            |
| **All 60 cells**         | **−0.50** | **−0.13** | **−1.91** | **−0.56** | **−1.86**   | **−0.46** | **−2.04** | **−0.35**   | **−0.56**        |
| **All 60, AI opponents** | **−0.66** | **−0.45** | **−1.97** | **−0.28** | **−1.90**   | **−0.57** | **−1.80** | **−0.34**   | **−0.90**        |

What each choice does to the offense (rules, all cells, share of plays): drop handler 19.8% and roll man 5.0%; hedge 13.5% and 10.8%; blitz 4.9% and 15.1%, spot-ups 35.0%; switch post-ups 8.2% (3.2% against drop), handoffs 3.1% and off-screens 2.4% (5.1% and 4.0%); 2-3 zone spot-ups 40.6% (29.9%), cuts 6.5% (8.9%); 3-2 zone cuts 10.8%, roll man 11.0%.

### Playbooks for every roster

Each playbook for each of the 30 teams against all 29 opponents' AI, 1,392 games each (± about 0.39 a game against the team's own settings).

| Measure                                             | Offense (6)                                             | Defense (7)                                 | Shape (4)                             |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| Spread within a roster (SD, points a game)          | 0.38                                                    | 1.28 (0.41 without Full-Court Chaos)        | 0.44                                  |
| Staff read vs measured (r, slope)                   | 0.49, 1.17                                              | 0.93, 1.03                                  | 0.12, 0.23                            |
| Measured best                                       | Balanced 10, P&S 7, Hub 4, Helio 3, Grind 3, Five-Out 3 | Zone 10, Blitz 6, Drop 6, Switch 5, Hedge 3 | Five-out 19, twin bigs 8, four-out 3  |
| The staff's pick                                    | Balanced 15, Pace & Space 15                            | Zone 13, Drop 12, Blitz 5                   | Four-out 13, five-out 12, twin bigs 5 |
| Staff pick under the measured best (noise included) | 0.22 a game (a random pick 0.50)                        | 0.23 (1.02)                                 | 0.34 (0.50)                           |
| Playbooks reading "Similar fit" to the staff's best | 5.7 of 6                                                | 4.3 of 7                                    | 3.2 of 4                              |

## Method and caveats

- **Paired games remove most of the noise, not all of it.** A lever's 12-matchup mean carries about ±0.2 to ±0.27 per 100, so effects under about 0.5 are within noise. A playbook's worth for one team is ±0.39 a game.
- **"Best" counts include noise.** Picking the best of six or seven playbooks by measurement flatters the winner, so "measured best" counts and "staff pick under the best" overstate the gaps a little.
- **Opponent modes.** "Rules" opponents play as the kit's sides do: no adjustments, the user's habits. "AI" opponents play with an AI coach's habits and adjustments, which is what the user faces, but without the opponent-specific game plan the season builds. The kit's league part includes those plans.
- **The lab league** is the 2026-27 seed league on seed 7, so averages depend on its rosters. Where an effect flips by opponent, the findings say so.
- **Real-team correlations** are partly in-sample: the styles were built from a blend of the same two Synergy seasons.
- **Play-type counts.** The sim's plays were counted Synergy's way from the possession logs, but Synergy's transition still includes early offense the sim labels by its action.
- **Coverage shares** are Second Spectrum's 2020-21 figures, reported in the press. No newer public split was found; switching has grown since.
- **The pushes-after-a-board measure** (a shot or shooting foul within 6 s of a live defensive board) is taken from the play-by-play's clock for the NBA and from possession durations for the sim. Levels differ by a few points; the comparison is of the relationship.
- **No repo file was changed** apart from this review. The kit's output (`out/rev-head`), my scripts, the NBA extracts and every result file are in this session's scratchpad.
- **Sources.**
  - NBA.com Synergy team play types (in the repo).
  - Second Spectrum coverage shares as reported by [The Ringer](https://www.theringer.com/nba/2021/5/17/22439801/nba-play-in-playoffs-steph-curry-damian-lillard).
  - Switching trends in [FiveThirtyEight](https://fivethirtyeight.com/features/anybody-and-everybody-can-switch-on-pick-and-rolls-now).
  - After-timeout efficiency in [Deadspin](https://deadspin.com/which-nba-coaches-are-best-at-designing-plays-during-t-1482773198/) (Synergy, an older season).
