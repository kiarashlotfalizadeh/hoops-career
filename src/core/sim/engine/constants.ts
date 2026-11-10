// The engine's tuning constants (K): shooting by zone, the base rates of turnovers, fouls, boards and
// run-outs, time, fatigue and injuries, and the size of every tactical edge (coverages, zones and junk
// defenses, pressure, the press, the double, hunting, the late-game fouls),
// each with what it is and how it was sized; the tactical leverage those edges are played at
// (K.tacticEdge, with lev and the helpers after K that apply it); and the diagnostics the
// calibration scripts read.

import type { DefScheme, ShotZone } from '../../types';

export const K = {
  zoneBase: { rim: 0.592, paint: 0.437, mid: 0.411, c3: 0.371, ab3: 0.336 } as Record<ShotZone, number>,
  zoneSkill: { rim: 0.15, paint: 0.13, mid: 0.13, c3: 0.1, ab3: 0.1 } as Record<ShotZone, number>,
  zoneOpen: { rim: 0.1, paint: 0.07, mid: 0.055, c3: 0.06, ab3: 0.06 } as Record<ShotZone, number>,
  foulRate: { rim: 0.204, paint: 0.104, mid: 0.04, c3: 0.014, ab3: 0.016 } as Record<ShotZone, number>,
  /** Share of misses that are blocks, for an average contesting defender. */
  blockMiss: { rim: 0.24, paint: 0.154, mid: 0.04, c3: 0.0165, ab3: 0.0165 } as Record<ShotZone, number>,
  /** Extra share of misses blocked by the shooter's own defender (from behind, on the contest). */
  chaseBlock: { rim: 0.06, paint: 0.048, mid: 0.026, c3: 0.01, ab3: 0.01 } as Record<ShotZone, number>,
  orbBase: 0.265,
  toBase: 0.146,
  /** Reach-ins and holds on the handler, a chance per trip (0.23 until 2026-10-25: see K.recenter). */
  nonShootFoul: 0.154,
  /**
   * The officials (see whistle): a foul call's chance falls by exp(-whistleBalance) per foul the calls
   * have gone against the side beyond what the two sides' play drew, and the home side's by homeWhistle
   * (the away side's rises by it). Technicals: the chance at each dead ball before a trip (NBA 2024-26: 1.04-1.07 a game); flagrants, the
   * share of reach-ins (0.06-0.10 a team-game); kicked balls, the chance on a trip without a reach-in.
   * Loose-ball fouls on a rebound (1.2-1.4 a team-game), held balls on one (0.74-0.81 a game), and
   * take fouls on a run-out (about 0.4 a team-game): the reach-ins went from 0.22 to 0.165 a trip
   * with them (common fouls were 8.5 a team-game, the NBA's 5.7-6.0). Shot-clock violations: the
   * chance a trip whose shot clock is running out never gets its shot off (0.67-0.74 a team-game).
   */
  whistleBalance: 0.3,
  homeWhistle: 0.008,
  /**
   * The whistle through a game: the chance of a shooting foul or a reach-in by quarter (overtime as
   * the fourth). NBA 2024-26 officials call a light first quarter and the most fouls in the fourth
   * (3.5-3.9 a team, then 4.3-4.7, 4.5-4.7 and 4.8-5.0; free throws 4.2-4.8 a team in the first and
   * 6.1-6.4 in the fourth); with the same whistle all night the sim's ran 4.5, 4.5, 4.3 and 4.4, the
   * most in the first.
   */
  whistleQ: [0.78, 1, 1.08, 1.125] as number[],
  tech: 0.019,
  /** The chance a player's first technical is an ejection on the spot (see randomTechnical). */
  ejectP: 0.04,
  flagrant: 0.012,
  kicked: 0.006,
  looseBall: 0.027,
  heldBall: 0.009,
  takeFoul: 0.1,
  shotClockOut: 0.58,
  /**
   * A side-out foul in an action that plays on: the seconds the inbound and the reset take before the
   * action's shot (it used to go up on the same tick as the whistle).
   */
  sideOutTime: { min: 2, max: 4 },
  /**
   * The share of dead-ball turnovers that are offensive fouls (a personal foul on the handler): about
   * 1.8 a team game, the NBA's rate (at 0.24, 1.4, the league's fouls ran 8% under its 19.4).
   */
  chargeShare: 0.3,
  /**
   * The reach-in rate of a defense tied or protecting a one-to-three-point lead in the last 24 seconds
   * of the fourth quarter or overtime: it plays a little more carefully (0.3 until 2026-11-09: NBA
   * 2024-26, a side behind by one to three with the ball in the last 40 seconds is fouled before its
   * shot on 21% of trips, the sim's on 14%; two free throws down two are how a good share of the
   * NBA's late ties are made).
   */
  lateLeadFoul: 0.5,
  /**
   * A trailing defense's late fouls (see lateFoulAt), the chance on a trip. Down three or less with
   * more time left than a shot clock, a foul a few seconds in anyway (`early`: NBA 2024-26, the leader
   * up 1-3 with 24-40 seconds left was fouled before its next shot 33-36% of the time); with 4 seconds
   * or fewer, `last` (68-85%: there isn't always time). Down four to nine, `by`: a row for each deficit
   * from four, by the seconds left when the leader gains the ball (5 or fewer, to 8, to 14, to 32, and
   * a trip begun before that), the NBA's shares of those trips the leader was fouled on: nearly always
   * down four with a quarter minute left (94%), half the time with seconds left (46%), and hardly ever
   * down six by then (3%), while down seven most coaches still foul with half a minute left (77%).
   * With one number for four to six (0.85 to the last 6 seconds, none after) a four-point lead with 12
   * seconds left stayed four half the time, the NBA's a quarter, and games ended at four or five 30%
   * more often than the NBA's while fewer ended inside three.
   */
  lateFoul: {
    early: 0.3,
    last: 0.9,
    by: [
      [0.46, 0.6, 0.78, 0.92, 0.72],
      [0.3, 0.62, 0.75, 0.8, 0.8],
      [0.05, 0.33, 0.45, 0.7, 0.66],
      [0, 0.07, 0.36, 0.45, 0.75],
      [0.05, 0.08, 0.11, 0.28, 0.5],
      [0.05, 0, 0.11, 0.17, 0.36],
    ] as number[][],
  },
  /**
   * The last `from` seconds of a game within `lead` points: the leader's setup runs `slow` seconds
   * longer (a range) and the trailing side's is cut to `push` of it (see lateMode). Halved on
   * 2026-11-09 (3-8 seconds and 0.55): leaders used 18 seconds or more on 74-79% of trips after a
   * score, the NBA's 58-59%, and trailing sides shot within 8 seconds of a defensive board on 65%,
   * the NBA's 48-51%.
   */
  lateSlow: { from: 180, lead: 8, slow: [1.2, 4] as [number, number], push: 0.95 },
  /**
   * Early offense: after a defensive board or a steal that isn't a run-out, the share of trips (times
   * the coach's habit and the team's pace) that are in the half court within a couple of seconds and
   * shoot early in the clock (NBA 2024-26: 34-35% of trips after a defensive board shot or turned it
   * over within 6 seconds, run-outs included).
   */
  earlyO: { dreb: 0.2, steal: 0.25, setup: [1, 2.2] as [number, number], act: [1.2, 3.2] as [number, number] },
  /**
   * Off an offensive board: the rebounder's chance of putting it straight back up (a base, by his size
   * and finishing, up to `max`) and how soon (seconds); else the share of resets that are a kick-out on
   * the spot. NBA 2024-26: 62-63% of offensive boards were followed within 2 seconds by a shot, a
   * foul or a turnover (at 0.25, 0.8-2.5 s and no kick-outs, 23%); second-chance points 14.1-15.0.
   */
  /**
   * Seconds from a miss to the rebound (a range): the flight and the scramble. With none, every board
   * came on the shot's tick, and trips had to run longer than the NBA's to hold its pace. A shot that
   * goes up with more than `horn` seconds left in a period is rebounded before the horn; one later
   * than that is nobody's board (see rebound).
   */
  reboundTime: { shot: [1.2, 3.4] as [number, number], ft: [0.2, 0.9] as [number, number], horn: 1 },
  putback: { base: 0.45, max: 0.78, time: [0.2, 1.4] as [number, number], kick: 0.55, kickAct: [0.5, 2] as [number, number] },
  /**
   * The staff's late-game timeouts with the ball (see autoTimeouts), a chance at each trip: behind or
   * tied by six or less in the last `at` seconds (`behindEarly` from `from` seconds), ahead by one to
   * six after the other side scored there (`ahead`, `aheadEarly`), and in a game within five in the
   * last two minutes after the other side scored (`close`). NBA 2024-26: 2.2-2.3 timeouts in the last
   * two minutes of games within five, 1.3 of them in the last 24 seconds, 0.6-0.7 from 1:00 to 0:24
   * and 0.3 before that; a quarter of them the leader's (with every late dead ball a 40% chance and
   * only leads of one to three calling one, the sim's coaches had spent theirs early: 0.7, 0.75 and
   * 0.7, the leader's a fifth). Before 3:00 of the fourth (from `spend` seconds left), a team with
   * more than the two it may keep now and then spends one at a dead ball (`spendP`: at 0.3 from 7:00
   * the spares went in a burst, three or more timeouts between 7:00 and 5:00 in 6% of games, the
   * NBA's 0.3%); the rest go through the quarter (K.quarterTO.q4) or lapse.
   */
  lateTO: { from: 60, at: 24, behind: 0.95, behindEarly: 0.4, ahead: 0.7, aheadEarly: 0.3, close: 0.14, spend: 600, spendP: 0.03 },
  /**
   * An AI coach's timeouts through a quarter (before the last three minutes of the fourth), the chance
   * when the other side has just scored: by its unanswered points (`run8` at eight, `per` more a point
   * past it; `run6` at six or seven; `run4` at four or five, else `any`, those two only when play has
   * gone `quiet` seconds without a timeout and, in the first three quarters, the quarter hasn't had
   * its two already, and `mid` times as likely between 7:00 and 3:00);
   * `q4` times as likely in the fourth, where a timeout not used by 3:00 is lost; times his own habit.
   * NBA 2024-26: a third of the first three quarters' timeouts come before 7:00, a sixth in the minute
   * after 7:00, 27% from 6:00 to 3:00 and a sixth in the minute after 3:00 (the TV's, when nobody has
   * called one); 11-12% are called against a run of eight or more, and an 8-0 run draws one before the
   * side on the wrong end scores about three times in ten. With a timeout at every 8-0 run the sim's
   * had 23% against such runs and seven in ten of them drew one.
   */
  quarterTO: { run8: 0.3, per: 0.05, run6: 0.25, run4: 0.2, any: 0.09, quiet: 90, mid: 2.5, q4: 2 },
  /**
   * An AI staff whose base defense is a 2-3 or 3-2 zone plays it this share of the time, in stretches
   * of `zoneStretch` seconds, man-to-man the rest: playing it every trip, AI defenses were in a zone on
   * 9.6% of half-court trips (Cleveland 35%), the NBA's few percent (a handful of teams near ten).
   */
  zoneShare: 0.25,
  zoneStretch: 150,
  /** The TV's two timeouts a quarter (see mandatoryTimeout). */
  tvTimeouts: true,
  /** Late-game timeouts: setup out of one that advances the ball to the frontcourt (seconds, a range). */
  advanceSetup: [1.2, 3] as [number, number],
  /**
   * Seconds left on the game clock when a team holding for the last shot starts its action: a range,
   * drawn each time, tied in the fourth quarter or overtime and behind by one or two there; at the end
   * of the other quarters, always the same. Started at 6.5 seconds every time, a game's last shot
   * nearly always went up at the horn: four games in a hundred were won at the buzzer, and almost no
   * late winner came earlier.
   */
  holdStart: { tied: [7.5, 10.5] as [number, number], behind: [9.5, 13.5] as [number, number], quarter: 6.5 },
  /** Behind by one or two, a team holds for the last shot only with this many seconds left or fewer (see lateMode). */
  holdBehind: 13,
  /** Seconds a game's last shot goes up with (a range, drawn each time), from a play started in time for it. */
  lastShotSpare: [1.5, 4.5] as [number, number],
  /**
   * A trip begun with under `sec` seconds left in the fourth quarter or overtime: its shots go in less often, by up to `cut`
   * of their chance (all of it from a standing start, none at `sec`). Without it a defensive board
   * with a second and a half left became a layup at the other end as often as any rushed shot went in.
   */
  scramble: { sec: 3.5, cut: 0.55 },
  /**
   * Share of rebounds credited to the team rather than a player (NBA box scores leave these out), and
   * `keep`: the chance a miss the defense had goes out of bounds off it, the offense's ball with 14 on
   * the shot clock and nobody's rebound. NBA 2024-26 play-by-play: 4.0 offensive team rebounds a
   * team-game that aren't the dead ball between free throws (blocks out of bounds among them) and 2.4
   * defensive; the sim had 0.2 and 3.1 with about 1.5 blocks out of bounds, so 2.3 second chances a
   * team-game were missing: shots ran 2.7% under the NBA's and second-chance points 15% under, with
   * the players' own boards on its numbers.
   */
  teamReb: { orb: 0.02, drb: 0.07, keep: 0.05 },
  /** (`oob`: a dead ball that isn't a turnover, a defensive board gone out of bounds: an inbound under the basket.) */
  transitionBase: { steal: 0.62, dreb: 0.19, made: 0.035, ft: 0.03, deadTO: 0.03, oob: 0.03, start: 0 } as Record<string, number>,
  setup: { made: 8.4, dreb: 4.8, steal: 2.0, ft: 8.2, deadTO: 7.8, oob: 7.8, start: 5.6 } as Record<string, number>,
  actionTime: 7.2,
  /**
   * Overtime is played a little slower than the game before it (setups and actions this much longer):
   * the NBA's overtime periods run 3% under the fourth quarter's pace, the sim's ran 3% over, and its
   * overtime games ended inside three 29% of the time (38%).
   */
  otPace: 1.07,
  /**
   * The spread of setups and actions (the sd of a log-normal multiplier around 1): at uniform 0.75-1.25
   * and 0.6-1.4 nearly every trip after a make shot 16-20 seconds in (42%, NBA 26%) and almost none
   * 8-12 seconds in (2.6%, NBA 16%).
   */
  spread: { setup: 0.38, action: 0.42 },
  /**
   * Seconds a run-out takes to its shot (a range): off a steal, and off a board or anything else. NBA
   * 2024-26: 21% of trips after a steal have their first shot or turnover within 4 seconds; at 2.2-5.5
   * for a steal's run-out the sim's had 34%, and 7.4% of all shots came in the shot clock's first 4
   * seconds (the NBA's 4%).
   */
  runOutTime: { steal: [2.8, 6.2] as [number, number], other: [3, 6.5] as [number, number] },
  continueBase: 0.38,
  injuryRate: 0.00042,
  /** A player playing through an injury (a game-time decision: SimTeamInput.play) is this many times as likely to get hurt in the game. */
  gameTimeRisk: 2,
  drain: 0.00068,
  recover: 0.0012,
  /** Home court: field-goal percentage the home side gains (the away side loses 0.3 of it): about 2 points a game, 54% home wins. */
  home: 0.009,
  usageExp: 2.0,
  /**
   * A player's share of his team's possessions while he's on the floor levels off past useLevel: his
   * usage weight falls by exp(-usageDamp) per unit of share above it, so as the game goes on the ball
   * finds his teammates. The real league's top scorers use 30-34% (Dončić 38%); at 36.5% and 5.2 a
   * star's share kept climbing with his ratings, and leaders used 40-43% and scored 38-43 a game
   * within a few simulated seasons. Damp 9 → 9.5 on 2026-11-09, when the stint plan's longer stints
   * (four of about nine minutes) put about 0.3 a game on the top two's minutes and Anthony Edwards
   * averaged 0.8 a game more over star-check's 64 seasons, three of them past 35 in one league. 9.5 → 10.5
   * and K.threeUse's damp 17 → 30 the same day, when AI coaches came to leave a star on in foul trouble
   * and an early look came to be worth more (K.foulRide, K.tempo): star-check's scoring and threes
   * leaders were past their lines again.
   */
  useLevel: 0.32,
  usageDamp: 10.5,
  /**
   * ...and past useLevel the shots he still takes are tougher ones, by this much make probability per
   * unit of share over it (the defense is loaded up on him: 3 points of percentage at a 35% share),
   * as K.threeUse.contest does for a shooter's threes. The real league's highest-usage scorers give
   * efficiency back for volume; the sim's kept all of theirs, so a star who grew into a 95 rating
   * scored 37-40 a game on a 35-37% share in star-check's seasons (Edwards, once his season-one line
   * was fitted to his real one), where the real league's 35% seasons are 32-34. The seed's ratings
   * are fitted with it, so the real league's own high-usage scorers keep their real lines.
   */
  useContest: 1.1,
  /**
   * ...and past `level` it falls by exp(-damp) per unit more: a season's share past it is beyond all
   * but two real seasons of 1,354 since 2004 (Westbrook's 0.408 and Harden's 0.406; the 99.5th
   * percentile is 0.374). The soft levelling alone held the first season, its stars fitted against
   * their real teammates, but once the generated players who replace those teammates (with their
   * level's usage) took the floor a star's share jumped in a summer: Edwards 0.32 to 0.40 and Mitchell
   * 0.31 to 0.39, with seasons of 34-39 points a game.
   */
  useCeil: { level: 0.355, damp: 40 },
  /**
   * A shooter's three-point volume levels off past `level` of his team's shots while he's on the
   * floor (see threeDamp; from `from` of them on), his three-point tendency falling by exp(-damp) per
   * unit of share over it, as useLevel levels off his share of the possessions. The real league's
   * biggest share is Curry's, about 0.20 (11.3 a game at 37); without it the sim's high-volume
   * shooters took 0.22-0.31 (a generated guard took 18.7 a game at 22): over 48 seasons (four leagues
   * of twelve) the threes leader averaged 6.3 a game, up to 9.1, with 44 nights a season of ten made
   * threes, up to 93 (the record is 5.1 a game; the NBA has about a dozen such nights). With this,
   * threeTop and the aging of volume (progression.ts): 5.0 and 5.6, and 11 nights a season (26 at
   * most). A harder level (0.17, damp 20) took the leader no lower and broke the tactics' measured
   * worth (engineBalance: running and switching ball screens moved half again off their tags) and the
   * sets' looks; a set run for a shooter takes his own tendency (possession.ts). Damp 10 → 15 when
   * the AI's staffs were refit (2026-10-25) and the league went to Five-Out and Pace & Space, whose
   * shooters had the leader back to 6.2 a game and 35 ten-three nights in a season: now 5.1 (6.2 at
   * most) and 13 (26), over star-check's 32 seasons.
   *
   * `contest`: past `level` the threes he still gets are tougher, by this much make probability per
   * unit of share over it (the defense is running him off the line). The real league's 8+ attempt
   * shooters made 37.4% of them in 2025-26, and the sim had them at 39.4-40.4% on the same volume
   * (the 6-8 a game band within 0.7 of its 38.8%): its threes leader at 5.2 or less in 64% of 64
   * seasons (eight leagues of eight, star-check), 15 ten-three nights a season, most of them 10 of
   * 13-16. With it and the season's volume ceiling (progression.ts, threeVolume): 86% and 10.7 (and
   * 81% and 11.3 in star-check's own 32 seasons on the October 2026 ratings rebuild). A zone's open
   * looks are left out (nobody is running him off the line there): at every share it took the 2-3's
   * and box-and-one's measured worth with it (tacticsModel, engineDefense).
   */
  threeUse: { from: 15, level: 0.165, damp: 36, contest: 1.15 },
  /**
   * A three-point shooter's skill (c3 or pu3) counts in full up to `from`, at `keep` of it to `top` and
   * at `keepTop` past that. The real league's shooting was fitted to the engine before the big
   * decisions' looks came to count by who takes them (K.matchup), so the better the shooter the more
   * he outshot his real line: by skill band over six real-league seasons +1.2 points of percentage in
   * the 60s, +1.5 in the 70s and +2.4 in the 80s (the 30s to 50s within 0.3), the league at 36.8% (the
   * NBA's 35.9%), and shooters who developed past 90 made 47-52% on 11-14 a game. Now every band is
   * within 0.7 of the real league's, the league is at 35.9%, the real league's 25 top three-point
   * shooters make 0.04 a game more than they did (0.16 before; Curry at 38: 4.5, his 4.4 at 37), and
   * a band of 90 and up makes 45%.
   */
  threeTop: { from: 55, keep: 0.7, top: 80, keepTop: 0.4 },
  freedomGreen: 1.25,
  freedomLimited: 0.55,
  /** How strongly usage tendency tilts an actor's shoot-vs-pass choice. */
  selfShotExp: 0.6,
  /** Share of a team's actions one player can run before the ball starts finding others. */
  actCap: 0.68,
  /** Assist share of teammates' baskets past which a passer starts looking for his own shot. */
  astCap: 0.45,
  /** A junk defense's chaser face-guarding his man: his share of actions, the advantage he loses catching it late and further out, and the chaser's extra drain. */
  chaseTouch: 0.4,
  chaseCatch: 0.45,
  chaseDrain: 1.3,
  /**
   * ...and the usage share past which the defense loads up on him comes this much sooner (see
   * usageWeight): 0.14 when the damping past it was 5.2. With the steeper damping past useLevel a box-and-one
   * aimed at a heliocentric star gains about 2 points per 100 at 1x leverage and a little more at 2x, its
   * gap from one aimed at a shooting team twice as wide (engineDefense's leverage test).
   */
  chaseCap: 0.11,
  /** Run-outs against a team that crashed the glass: chance multiplier per unit of crash above 50, and the runners' edge. */
  crashLeak: 1.5,
  crashRunOut: 0.5,
  /** Expected points of one unit of transition advantage, for impact tags (see runOutPts). */
  transAdvPts: 0.05,
  /** Diminishing returns on crashing past 50: offensive-board rate given back at 100. */
  crashFade: 0.11,
  /**
   * Crashing under 50 (sending fewer to the glass): the offensive-board rate given up per unit below
   * 50, the run-outs it saves (chance multiplier per unit), the edge the runners lose against the
   * defenders who got back, and the openness the other side's first half-court action loses against
   * a defense that is set (per unit, before the leverage); setPts, what a unit of that openness is
   * worth in the tags (0.05 had tagged the set defense at 2.7 points a game where switching it off
   * measured 1.6: ten seed sets of engineBalance's crash case).
   */
  crashLow: { orb: 0.1, leak: 0.7, back: 0.6, set: 0.8, setPts: 0.03 },
  /**
   * What the "why" tags of crashing count of their own estimates: the boards crashing wins or gives up
   * (both sides of 50), and the run-outs a team that crashed gives up. Over ten seed sets of
   * engineBalance's crash cases on the real league, taking each effect out of the engine showed the
   * boards worth about 0.55 of their tagged points (to 0: 1.8 measured, 3.2 tagged; to 100: 1.9, 3.6)
   * and the run-outs crashing gives up about 0.4 (1.8, 4.7), while the low side's saved run-outs and
   * set defense measured as tagged (0.8 and 0.9, 1.4 and 1.6). The effects interact, so the factors
   * fit the whole dial: going to 0 tagged -1.07 where it measured -0.14, and to 100 -0.80 where it
   * measured +0.05; these bring both within 0.1. Refit 2026-10-26 (0.75 → 0.49, 0.6 → 0.29) on the
   * ratings that count three-point volume, with the playbooks rebalanced (the four teams now crash at
   * 42-55 and push more): over the same ten seed sets going to 0 measured +0.65 ± 0.23 where it tagged
   * -0.15, and to 100 +0.79 ± 0.25 where it tagged +0.42 (a board is worth less, and a run-out given
   * up more, against the league's fives as they shoot now). Boards 0.49 → 0.65 on 2026-11-09, when
   * more of them came to be put straight back up or kicked out on the spot (K.putback) and the ball
   * took its time coming down (K.reboundTime): going to 0 measured −0.38 and +0.30 on two engines a
   * stream apart (the measure's noise is wider than its ±0.24) where it tagged +0.62; now about +0.15.
   */
  crashTag: { orb: 0.65, leak: 0.29 },
  /**
   * Switching off-ball screens: the edge it takes off the man coming off a handoff or a screen, and off
   * motion's ball movement; and the offensive boards it gives up (a guard switched onto a big can't
   * keep him off the glass), as a share of the offensive-board rate.
   */
  switchDeny: { handoff: 0.25, motion: 0.1 },
  switchGlass: 0.03,
  /**
   * What the "why" tags of switching off-ball screens count of their own estimates, measured: paired
   * runs over ten seed sets (two real matchups, 150 games each) with each mechanism on and off showed
   * the cross-screen mismatch post-ups worth about 0.24 of their tagged points, the switched-handoff
   * hunts 0.6, the boards a switch gives up 0.28 and the handoffs and ball movement it denies 0.24
   * (each tag priced the look against the same action, not against the trip the offense would
   * otherwise have run). Before, not switching tagged +1.7 a game against a measured +0.8.
   */
  offBallTag: { cross: 0.24, hunt: 0.6, glass: 0.28, deny: 0.24 },
  /**
   * The same for a switched ball screen's mismatch (the handler on the big, or the screener posting
   * the guard): what its tags count of their own estimates. Measured as engineBalance does (switching
   * every screen against icing them, two real matchups over ten seed sets): at 1 the mismatches tagged
   * −1.79 a game against a measured −1.46 for them (2026-10-24), then −2.29 against −1.10 once volume
   * shooters were damped and the AI's offenses refit (2026-10-25): each mismatch is still taken, and
   * worth less. At 0.5 the switch tags −1.10 against a measured −1.01. 0.95 since 2026-11-09, when the
   * game-day realism round (stint plan, tempo, the whistle) left switching measured at −1.46 (−0.63 before)
   * and its tags at −0.09: now about −1.1.
   */
  switchTag: 0.95,
  /** Share of offensive boards given up at full transition-D sprint back. */
  getBackOrb: 0.08,
  /**
   * Game-to-game conditions shared by both teams (SDs): tempo and foul calls. (And field-goal
   * percentage, 0.012, until 2026-11-09: in the NBA one team's shooting night says nothing about the
   * other's, the two teams' FG% correlated −0.01 to 0.01 and their points 0.19-0.22; with a shared
   * shooting night the sim's were 0.18 and 0.33. Each team's own night, K.envTeam, took its share.)
   */
  envPace: 0.035,
  envShoot: 0,
  envFouls: 0.08,
  /**
   * ...and each team's own shooting night (SD, field-goal percentage): some nights the shots fall for
   * one side and not the other. With the score effect running from the tip (K.band) the better team
   * came to win more surely than the NBA's does (streaks of 36 and 39 games in star-check's 64
   * seasons, where the record is 33) and the final margin's SD ran 15.3-15.5 (16.1).
   */
  envTeam: 0.019,
  /**
   * The score effect, from the tip: the side ahead gives back `per` of field-goal percentage for each
   * ten points of its lead and the side behind gains it, up to a lead of `cap`. NBA 2024-26: a quarter's
   * margin runs against the lead it began with by about 0.13 points a point beyond what the better
   * team's edge predicts; the margin's SD is 8.6 after one quarter, 11.9 at the half, 14.8 after three
   * and 16.1 at the end, and the better team wins each of the first three quarters by about as much
   * (0.30, 0.25 and 0.25 of its season's edge, 0.16 in the fourth). Until 2026-11-09 there was no
   * effect in the first half and a strong one in the second (up to 5 points of percentage either way
   * from a lead of 8, reached at 20): the sim's margins ran 9.3, 13.9, 14.8 and 15.0, the better team
   * won the first half by too much and the second by half what it should (0.36, 0.34, 0.14, 0.11), and
   * too few games were close late (within 5 after three quarters: 26%, the NBA's 29-30%). Now 8.7,
   * 12.0, 14.4 and 15.3, and 29%, with each team's own shooting night (K.envTeam).
   */
  band: { per: 0.015, cap: 24 },
  /**
   * ...and in the second half past `from`, a deep bench against a deep bench in a game nobody is
   * playing for any more: up to `x` more by `from` + `span`. The engine's possessions are noisier than the NBA's (a real
   * team against itself: 9.0 points of margin SD a quarter, the NBA's about 8), so games ran away by
   * halftime (45 a season were 30 or more apart at the break) and the fourth quarter couldn't bring
   * them back. Over 48 seasons (four leagues of twelve), with garbage time (K.garbage) and this: 6.7
   * games a season decided by 40 or more (27.8 before; the NBA about 6), the season's biggest margin
   * 50 on average and 63 at most (68 and 89; the record is 73), its biggest team score in regulation
   * 160 and 171 (163 and 191), with the margin's SD at 15.7 (16.5) and 23% of games decided by 20 or
   * more (22%). (`from` 27 until 2026-11-09: the NBA of 2024-26 has 20 games a season decided by 40 or
   * more and its biggest margin is 55-59, where the sim's seasons had four and 40-47; eased from 30,
   * 30-point games come nearly as often as the NBA's and star-check's widest margin in 64 seasons is 66.)
   */
  easeBig: { from: 30, span: 12, x: 0.08 },
  /**
   * Garbage time (see wantsGarbage): with `start` seconds of regulation left or fewer (from the start
   * of the third quarter), a lead of `from` + `per`·√(minutes left) decides a game for a coach at the
   * league's line (35.5 at the half, 31 with three minutes left in the third, 29.5 at the start of the
   * fourth, 24.5 with five minutes left, 19 with one), times his own `patience` tonight (a range, drawn
   * per game: some coaches empty the bench sooner). (`from` was 14 until 2026-11-09: NBA starters play
   * 18 of their 60 fourth-quarter minutes in games 20 or more apart after three, the sim's played 13.5,
   * and games decided by 30 or more ran 4.3% against the NBA's 6.5-7.8%. At 16, with the blowout's
   * easing from 33, star-check's seasons had margins of 74-79 in three runs of twelve.) (`start` was 900, 3:00 left in the third, until
   * 2026-10-26: a 70-win team 45 up at the half played its starters on through the third quarter, and
   * star-check's seasons had nights decided by 74-86; from the half, the worst of one such matchup's
   * 3,000 nights came down from 78 to 68.) Both benches finish it, until the lead is back under the line
   * less `exit`: the reserves next in line, the first `depth` of them sitting it out some nights
   * (drawn), and the deepest end of the bench for the last `late` seconds (a range, drawn), a tired
   * one spelled by a rested reserve. The team up big eases off (eases): `slow` more seconds walking it
   * up, `run` of its run-outs and `three` of its taste for threes; and a team up `pressLead` or more
   * calls off its full-court press, in any quarter (a 57-10 first quarter of pressing a team with no
   * ball handlers left had made an 84-point game). Before, the deepest five came in for the last five
   * minutes at 22 up or the last 2:30 at 16 up, and played exactly that in every blowout, while the
   * starters played on through a 35-point third quarter. Over the 48 seasons, starters now play 23.4
   * minutes in games decided by 30 or more (25.8 before) and a team's best starter 28.2 (31.7); over
   * a season each team's two best players give up about half a minute a game (star-check's 31.8/30.0,
   * 32.5/30.5 before), and the real league's top 20 scorers still land within 1.7-2.4 points a game
   * of their real lines in the first season (2.0-2.4 before). In the playoffs the same line decides
   * a game (the bench came in as often and as early: 83% of games up 20 after three, 9.2 minutes
   * left; 81% and 8.6 in the regular season), but the playoff rotation (the eight, the five's extra
   * minutes) played on until then: a lead within `playoffs` of the line (either way, from the half)
   * sends a coach back to his regular-season rotation (see lopsided). Over 1,500 paired games, the
   * winner's three busiest starters in a playoff win by 25+ play 28.9 minutes (29.3 before; 26.6 in
   * the regular season, the rest the playoff rotation's first half), 2.6 of them in the fourth
   * quarter of a game up 20 after three (2.8; 2.6), and 38.1 in a game decided by 5 or less, as before.
   */
  garbage: {
    start: 1440,
    from: 15,
    per: 4.2,
    patience: [0.9, 1.15] as [number, number],
    exit: 8,
    playoffs: 12,
    depth: 2,
    late: [150, 330] as [number, number],
    slow: 3,
    run: 0.5,
    three: 0.75,
    pressLead: 20,
  },
  /**
   * What a shot is worth by when in the trip it goes up (see tempoOpen), in openness: `early` on a
   * shot in the first `earlyFull` seconds after a live-ball change of possession (a defensive board, a
   * steal: the defense isn't set), fading to none by `earlyEnd` (`dead` of it after a make or a dead
   * ball); `perAct` less for each action the trip has already run without finding its shot, up to
   * `acts` of them (the offense is going down its options); `forced` less on a shot the shot clock or
   * the horn forces (0.45 before); and from `lateFrom` seconds of the shot clock used, down to `late`
   * less when it runs out (none: see below). NBA 2024-26, points per shot by 4 seconds of
   * shot clock used: 1.36, 1.19, 1.13, 1.09, 1.05, 1.00; the sim's ran 1.15, 1.16, 1.12, 1.11, 1.10,
   * 1.08, so working the clock cost a leader nothing and pushing gained a trailing side nothing.
   * The early looks are the ones that are there: a team that pushes more often than the league (its
   * transition and pace settings, its coach's habit) takes more of them, each worth as much less
   * (see earlyScale), so the settings move when a team shoots, not what the league's early shot is
   * worth; and the late cost is mostly by action, not by second, so a deliberate offense's first look
   * is as good as a quick one's. With the cost all by the second and the early edge the same however
   * often a team ran, Pace & Space measured best for 24.5 of 30 teams (style-gate), and for 17 with
   * any cost by the second at all, and a cost of 0.26 an action took the motion offenses' teams
   * well under their forecasts; now the sim's curve runs 1.34, 1.17, 1.08, 1.09, 1.09, 1.06 on seasons
   * it wasn't tuned on: the early end is the NBA's, the late end is still too flat (it needs the
   * playbooks refit with it, scripts/style-fit.ts). Pace also tires a team a little more than it did
   * (see tick): Pace & Space is best for 9.3.
   */
  tempo: { early: 1.3, earlyFull: 3.5, earlyEnd: 5.5, dead: 0.4, perAct: 0.12, acts: 3, lateFrom: 12, late: 0, forced: 0.6 },
  /**
   * Shots against the horn, as a share of their chance, each [twos, threes]. `quarter`: any shot in
   * the last `horn` seconds of a period (NBA 2024-26, heaves aside: 42-43% on twos and 25-26% on
   * threes; the sim's went in at 53% and 33%). `game`: one to tie or win in the last `horn` seconds of
   * the fourth quarter or overtime, the defense set for it and nothing else to guard (33-34% and
   * 20-21%; 50% and 38%); `late`: one with `horn` to `sec` seconds left (51-54% and 23-27%; 59% and
   * 44%). Each by whether the shooting side is `tied` or `behind`: tied, nobody has to shoot it and the
   * last look is a contested one (29% on twos in the last five seconds, behind by one to three 36-38%;
   * with one number for both the sim's were the other way round, 35% and 29%), and a side down two
   * that goes to the basket for the tie gets there (`down2` on its twos: 43-54% in the last 24
   * seconds against 40-42% down one; the sim's 38% and 42%). `far`: a three
   * down four to six in the last `sec` seconds, the line guarded; `concede`: a two down three or more
   * there, which the leader gives up rather than foul (60-70%; the sim's 42-57%). With them the
   * catch-up rule is gone: the trailing side's shots in the last four minutes of a game within six
   * went in 5 points more often and the leader's 5 less (K.clutchEase), and its threes in the final
   * 5 seconds went in at 38%, the NBA's at 20%.
   */
  lastLook: {
    sec: 24,
    horn: 5,
    quarter: [0.84, 0.78] as [number, number],
    game: { tied: [0.55, 0.7] as [number, number], behind: [0.8, 0.6] as [number, number] },
    late: { tied: [0.95, 0.8] as [number, number], behind: [1.05, 0.7] as [number, number] },
    far: 0.88,
    concede: 1.15,
    down2: 1.15,
  },
  /**
   * The last `sec` seconds of a game within `within`: both defenses tighten (`all` off every shot's
   * chance) and the side ahead plays not to lose (`leadTwo` more off its twos, `leadThree` off its threes). NBA 2024-26, from
   * 4:00 to 0:24 of games within six: the leader shot 50-51% on twos and 32-34% on threes, the
   * trailing side 53-54% and 34-35%, against 54.5-55% and 36% over whole games. The sim's sides both
   * shot what they did all night or better (the starters are on); before 2026-11-09 a catch-up rule
   * gave the trailing side 5 points and took 5 from the leader, threes and all. The leader also turns
   * it over more there (16.3% of its trips against the trailing side's 12.9%; `leadTO`, `trailTO` on
   * the turnover chance), and more shots are fouled at both ends (`fouls`; free throws per shot 0.42
   * and 0.36 against 0.25 all game), though not one for the tie or the lead at the horn (`hornFouls`,
   * the last K.lastLook.horn seconds), and a side up four or more in the last 24 seconds keeps its
   * hands off altogether (`safe`: the NBA's trailing sides went to the line 0.03-0.09 times in the
   * last 8 seconds down four to six, the sim's 0.2).
   */
  clutchD: { sec: 240, within: 6, all: 0.025, leadTwo: 0.03, leadThree: 0.012, leadTO: 1.25, trailTO: 0.95, fouls: 1.12, hornFouls: 0.6, safe: 0.3 },
  /**
   * Turnovers on a trip for the tie or the lead in the last 24 seconds of the fourth quarter or
   * overtime, as a share of the usual rate: those trips turned it over 12-18% of the time, the NBA's 2-10%.
   */
  lastTripTO: 0.5,
  /**
   * A heave: a trip begun with under `sec` seconds left in one of the first three quarters throws one
   * up from the backcourt `take` of the time when it has no time for anything else (NBA 2025-26: 0.9
   * a game, about 2% made; `make` is its chance).
   */
  heave: { sec: 3.2, take: 0.65, make: 0.025 },
  /**
   * A trailing defense in the last seconds that doesn't foul at once (see lateFoulAt): `first` of the
   * coach's fouls-at-once are the steal first. `trap`: it plays for the steal for `time` seconds (a
   * range) and gets one this often, then fouls (`miss`: or nobody does); `inbound`: the
   * chance its pressure turns the leader over before a foul it meant to give at once; `press`: the
   * chance on a trip the leader is running out with nobody fouling (down four to six). NBA 2024-26,
   * the leader with the ball in the last 24 seconds: fouled 81-86% up one to three, the clock running
   * out on 1-4% of trips and the leader turning it over on 7-12% (up four to six: 64-65%, 21-23% and
   * 5-7%); the sim's "steal first" trips never fouled and never stole it, and the clock ran out on
   * 14-29%. `beat`: the leader breaks the trap for a layup (`beatPress`: or the pressure, with nobody
   * fouling); it got a shot off on 3-7% of those trips, the sim's on 0-1%.
   */
  lateSteal: { first: 0.18, trap: 0.2, beat: 0.2, miss: 0.2, time: [3, 6] as [number, number], inbound: 0.02, press: 0.4, beatPress: 0.18 },
  /**
   * Behind by one to three in the last `from` seconds of the fourth quarter or overtime and not holding
   * for the last shot: the trip is run in a hurry, its setup no longer than `setup` (a range) and each
   * action no longer than `act`, so there is time to foul and get the ball back. NBA 2024-26, games
   * within five at 2:00: 2.3 shots, 1.3 trips to the line and 4.0-4.2 points in the last 24 seconds (both
   * sides); walking it up after the leader's free throws, the sim's had 1.9, 1.0 and 3.1, and went to
   * overtime 10.7% of the time (14-15%). `dash`: behind by nine or fewer with `dashFrom` seconds or fewer left and
   * not holding for one shot, the ball is up the floor in `dashSetup` seconds and the first look goes
   * up within `dash` (a four-point lead with 8 seconds left stayed four a third of the time in the NBA,
   * the trailing side getting 1.2 shots up and the leader to the line 0.65 times; using the clock that
   * was left for one shot, the sim's stayed four 64% of the time, with 0.8 shots and 0.5 trips).
   * `ato`: out of a timeout that advanced the ball, a side two possessions down shoots off the inbound play (its first action's seconds, a range: the NBA's trailing sides
   * shot 3.9 seconds after the inbound there, the sim's 5.9).
   */
  lateRush: {
    from: 36,
    setup: [3, 5.5] as [number, number],
    act: 6,
    ato: [1, 2.6] as [number, number],
    dashFrom: 10,
    dashSetup: [0.5, 1.6] as [number, number],
    dash: [0.8, 2.6] as [number, number],
  },
  /** Down one with the last shot, a two wins it: the weight left on the three (NBA 2024-26: 19-21% of those shots are threes; at 0.45 on the action's own shots only, 38%). */
  lateTwo: 0.25,
  /**
   * Foul trouble as a tendency (see sitsForFouls): the chance an AI coach leaves a player on with the
   * foul that puts him at the quarter's limit (2 in the first, 3 in the second, 4 in the third, 5 in
   * the fourth), by quarter; `star` more for a player the plan gives `starMin` minutes or more; `over`
   * of it for each foul past the limit; and a coach who sat him brings him back for the last `back`
   * seconds of the first three quarters `backP` of the time. NBA 2024-26: a starter with his third in
   * the second quarter is on the floor for 20-22% of the rest of it (the sim's 1.4%), with his second
   * in the first for 41-43% of the rest of the half (31%), with his fifth in the fourth with 7:00 or
   * more left for 38-40% of the time to 4:00 (17.5%). The user's own staff keeps to his rule. A player
   * on the floor at or past the quarter's limit plays with his hands off: `careful` of his usual share
   * of his side's fouls (NBA 2024-26: 0.18-0.21 foul-outs a game; riding without it, 0.29).
   */
  foulRide: { q: [0.5, 0.15, 0.4, 0.5] as number[], star: 0.1, starMin: 32, over: 0.25, back: 150, backP: 0.35, careful: 0.55 },
  /**
   * Team feel vs team defense: field-goal percentage per 50 points of difference between the
   * offense's feel (oiq/pas/hnd) and the defense's team defense (diq/perD/intD), past the gap at
   * which real-league scoring is unchanged. Sized so team net ratings track what the players'
   * real box plus-minus says: the OVR model weights these attributes most, and the per-player
   * matchups alone left team defense barely mattering. A matchup form, so fictional leagues
   * (whose players rate higher on both ends) keep their scoring.
   */
  feel: 0.22,
  feelGap: 3,
  /** Full-court press: turnover rate against average ball handlers. */
  pressTO: 0.012,
  /**
   * The press against the handlers bringing it up: their ball security and passing over the league's
   * (`sec`, the two most secure handlers' and the unit's passing) against the trappers' hands and feet
   * over the league's (`trap`), a step per `per` points. The turnovers it forces fall by `to` a step,
   * and it's broken (a run-out) `broken` of the time at even and `brokenAdv` more a step; the pressing
   * side's legs go `drain` faster all game (on top of the press's drain on both). It had read the two
   * against each other, where the league's handlers stand 15 points over its trappers: the press
   * forced its floor of turnovers against almost everyone. Now it's about even blind and two points
   * a game either way against the loosest and the most secure handlers (with K.pressTO's average 1.2%).
   */
  pressAdv: { sec: 65, trap: 50, per: 8, to: 0.025, broken: 0.4, brokenAdv: 0.08, drain: 1.1 },
  /**
   * Blitz: the trap's turnover rate, a flat part and a part per unit of the trappers' hands and length
   * (pnr.ts; about 0.24 for the league's average pair, 0.34 for the quickest), and the 4-on-3's
   * openness behind it. The trap's turnovers had run far past the NBA's (the blitz playbook forcing up
   * to 1.5 times ice's, the Thunder 20 a game): now the turnovers come from the hands alone and the
   * 4-on-3 is 0.6 of what it was (0.65), so trapping costs an average defense about 1 per 100 against
   * ice and pays the quickest hands about as much (paired preset runs, every team's offense).
   */
  blitzTO: 0,
  blitzHands: 0.18,
  blitz4v3: 0.75,
  /** Field-goal percentage a fully physical defense takes off every shot. */
  physContest: 0.01,
  /**
   * Points per switched pick-and-roll the switch takes away (the screen's advantage), for its tag only:
   * fitted so a switch to Switch is tagged about what paired games measure it at (6 real-league pairs,
   * 2026-10: tags within 0.35 a game of it; at 0.04 the tags called a switch that cost 1.1 a game a gain).
   */
  switchScreen: 0.02,
  /**
   * Handler's blow-by edge per unit of ball pressure, and the extra edge at full pressure; and the
   * edge at which its tag counts a unit of it at half of K.advPts (see blowByTag).
   */
  blowBy: 0.15,
  blowByConvex: 0.62,
  blowBySat: 2,
  /** Expected points of one unit of handler advantage per action, for impact tags. */
  advPts: { pnr: 0.04, handoff: 0.04, iso: 0.04, post: 0.04 },
  /**
   * Expected points swung by an offensive board, a turnover, and a run-out over a half-court trip, for
   * impact tags. A run-out is worth less than it looks: the extra run-outs crashing gives up cost
   * about 0.15 points each in the final margin (paired runs with and without the leak, at 1x and
   * 2x), where the boards, turnovers and open looks the tags count show about 0.6 of their tagged
   * points in the margin (leads ease off), so a run-out tagged 0.18 and the runners' edge 0.05 a unit.
   * Over ten seed sets of the real league, the run-outs pushing in transition makes were worth 0.06
   * to 0.13 each in the margin (the seed's turnover tendencies re-fit or not) against that 0.18, so a
   * run-out tags 0.15: the cost crashing's leak was measured at.
   */
  orbPts: 1.6,
  toPts: 1.45,
  runOutPts: 0.15,
  /**
   * What the transition setting's tag counts of the run-outs a team gives up by walking it up (push
   * under 1; pushing counts in full). Over engineBalance's ten seed sets against ice, transition 0
   * measured -0.89 ± 0.23 a game on the opening-night seed and -0.33 ± 0.23 on the October 2026
   * ratings rebuild's, both tagged -1.20 (transition 100: +0.14 and +0.52 ± 0.21, tagged +0.60): the
   * run-outs a team stops making are worth less than the ones it adds, as the half-court trips it
   * plays instead are its better ones. At half, -0.6.
   */
  walkUpTag: 0.5,
  /**
   * Crunch time: how much more often the ball finds the go-to player, and how much more his best action
   * is run; and the same for the staff's own go-to (the best scorer on the floor) when nobody is named.
   * His share of the ball so far tonight doesn't hold him back there (see usageWeight: by the fourth
   * quarter a star is past K.useLevel, and the damp took back most of the boost). `goToLast`: more
   * again, the ball and the play, on a trip for the tie or the lead begun in the last `goToFrom` seconds
   * (the trips whose shot goes up in the last 24), where he also takes the shot himself more often than
   * he passes out of it (`goToSelf`). NBA 2024-26: a team's top scorer takes 30-32% of its shots for
   * the tie or the lead in the last 24 seconds and its top two 47-51%, against 15% of its shots
   * earlier in games; the sim's took 17% and 34%, and take 28% and 46% now (eight seasons). The rest
   * is putbacks, scrambles and nights its top scorer isn't the one on the floor; pushed further, fewer
   * of the makes are assisted than the NBA's half (39% now).
   */
  goToPick: 2.5,
  goToAction: 1.6,
  goToAuto: 1.7,
  goToAutoAction: 1.25,
  goToLast: 4.5,
  goToSelf: 2.3,
  goToFrom: 36,
  /** Chance an off-ball cross-screen against a switching defense leaves a big posting up a small (when the mismatch is there). */
  crossSwitch: 0.12,
  /** ...and the size edge (height rating, about 4.3 an inch) it takes. */
  crossSize: 20,
  /** A switched handoff: the matchup edge past which the offense goes after it, how fast its chance of doing so grows, and its cap. */
  switchHuntFrom: 0.2,
  switchHunt: 0.6,
  switchHuntMax: 0.75,
  /** The scramble a late switch leaves: openness for the mismatch it hands the offense. */
  switchScramble: 0.15,
  /** Shooting fouls on a switched post-up grow by one per this much size edge (height rating). */
  mismatchFoul: 30,
  /**
   * Zone defenses by scheme: the openness its back line takes off the roller (the 2-3's big sits in
   * the lane as a drop big does; the 3-2's is spread thinner), the edge each takes off the pick-and-roll handler, an isolation, a
   * post-up and a drive (with their expected points for the zone_paint tags); the openness it
   * leaves on kick-outs, pops and handoffs; motion's cuts (weight lost, openness lost), swings
   * (weight multiplier, openness, the corner's share of them); and its offensive-board multiplier
   * and tag. The 2-3 walls off the paint and leaves threes; the 3-2's three on the arc close out
   * harder than man-to-man does (negative openness: the ball still swings, into contested threes)
   * but leave the paint, the post, cutters and the glass softer. The 2-3's walls and the 3-2's
   * closeouts were made bigger (2026-10) as their threes came to count by who takes them (K.matchup):
   * the 2-3 is about +1.8 a game against the league's worst-shooting fives and −3.8 against the best.
   */
  zone: {
    zone23: {
      roll: 0.5,
      pnr: 0.6,
      pnrTag: 0.6 * 0.1,
      iso: 0.65,
      isoTag: 0.065,
      post: 0.9,
      postTag: 0.09,
      drive: 0.6,
      kick: 0.38,
      pop: 0.28,
      handoff: 0.18,
      cutW: 0.25,
      cut: 0.2,
      swingW: 1.35,
      swing: 0.48,
      corner: 0.45,
      glass: 1.13,
      glassTag: 0.13,
    },
    zone32: {
      roll: 0.08,
      pnr: 0.1,
      pnrTag: 0.01,
      iso: 0.1,
      isoTag: 0.01,
      post: 0,
      postTag: 0,
      drive: 0.05,
      kick: -0.8,
      pop: -0.5,
      handoff: -0.6,
      cutW: 0.2,
      cut: 0.06,
      swingW: 1.5,
      swing: -0.8,
      corner: 0.15,
      glass: 1.22,
      glassTag: 0.22,
    },
    // the junk defenses' zones behind their chasers: four in a 2-2 box, three in a triangle. Fewer
    // bodies wall off less of the paint and the glass and leave more of the arc open for everyone
    // the chasers aren't on
    box1: {
      roll: 0.18,
      pnr: 0.28,
      pnrTag: 0.028,
      iso: 0.3,
      isoTag: 0.03,
      post: 0.22,
      postTag: 0.022,
      drive: 0.28,
      kick: 0.45,
      pop: 0.35,
      handoff: 0.3,
      cutW: 0.15,
      cut: 0.1,
      swingW: 1.4,
      swing: 0.45,
      corner: 0.5,
      glass: 1.08,
      glassTag: 0.08,
    },
    tri2: {
      roll: 0.14,
      pnr: 0.2,
      pnrTag: 0.02,
      iso: 0.22,
      isoTag: 0.022,
      post: 0.18,
      postTag: 0.018,
      drive: 0.2,
      kick: 0.5,
      pop: 0.4,
      handoff: 0.35,
      cutW: 0.08,
      cut: 0.04,
      swingW: 1.45,
      swing: 0.5,
      corner: 0.55,
      glass: 1.1,
      glassTag: 0.1,
    },
  } as Record<Exclude<DefScheme, 'man'>, ZoneK>,
  /**
   * What a zone's table is worth against these five, from this five (GameSim.zone scales it per pair of
   * lineups): a zone's walls (the edges it takes off the ball-screen, isolations, post-ups, drives and
   * cuts) stand taller with length (the five's average height rating against `hgt`) and come down
   * against a five with someone to flash to the middle and make the play from the high post or the short
   * corner (its best at passing and mid-range, half each, against `mid`); the looks it leaves at the arc
   * open wider the better the ball moves (the five's passQ against `pass`) and narrower the longer its
   * closeouts; its softer glass is softer still against a five that crashes it (average offensive
   * rebounding against `orb`). Each as a share of the table's size a rating point, inside [min, max].
   * And a zone hides its weak on-ball defenders and wastes its good ones: the handler's edge on his man
   * counts `hide` of the man's on-ball defense as `hideAt` instead (an isolation, a ball-screen, a drive).
   * So the 2-3 is a weapon for long fives short of on-ball defenders against fives that can't shoot, pass
   * or rebound, and a loser the other way, as an NBA zone is, not a blanket gain (2026-10-26: it was the
   * best defense for 22 of the real league's 30 rosters, +1.3 a game over a roster's average).
   */
  zoneFit: { hgt: 46.5, wallLen: 0.06, mid: 67, wallMid: 0.035, pass: 63, arcPass: 0.04, arcLen: 0.03, orb: 47, glassOrb: 0.12, min: 0.35, max: 1.8, hide: 0.5, hideAt: 50 },
  /**
   * A junk defense's chaser top-locking his man off the ball (on top of the fewer touches and late
   * catches): his weight as a kick-out target, the openness taken off his catch-and-shoot threes, the
   * edge lost coming off screens and handoffs, and what a defender caught high gives back on his
   * drives on the catch, his curls and his back-cuts (the openness, and his cut weight multiplier).
   * (Guarding instructions on one player, top-locking, going under, sagging and getting physical,
   * were cut in 2026-10 with the star plan's deny: over the real league each was worth under a
   * point a game against every opponent, and they crowded the plan's real decisions.)
   */
  lock: {
    box: { kickW: 0.45, c3: 0.4, offScreen: 0.3, beat: 0.3, cutW: 1.6 },
  },
  /**
   * Hunting one defender: how much more often the player he guards gets the isolations, post-ups and
   * ball-handler reps, the chance he's the screener when he isn't handling, the handler's edge per
   * this much of the hunted screen defender's gap to his teammates (see huntGap), and the edge motion
   * and handoffs lose while the ball sticks to the hunted matchup.
   */
  hunt: { pick: 1.8, screen: 0.75, screenEdge: 20, flow: 0.08 },
  /**
   * Foul to give: the most seconds left it's used with (and the fewest: under that there's no shot to
   * take away), the openness the inbounds play's first action loses, and the chance the whistle
   * comes on the shot anyway (two free throws).
   */
  ftg: { max: 8, min: 2.5, open: 0.35, inAct: 0.05 },
  /**
   * Tactical leverage. The owner's call: tactics matter about twice as much as they did, so a
   * well-aimed choice is worth about twice as much and a wrong one costs about twice as much, while
   * no setting becomes a free win and the league's averages stay NBA-like. Every edge a tactical
   * choice gets from fitting (or not fitting) the opponent and its own personnel is this many times
   * the size written where it's set (the tables above and the numbers in the actions are its 1x
   * sizes; see lev and levW): the pick-and-roll coverages, switching, the zones and junk defenses,
   * help, ball pressure and physicality, the press, the double,
   * hunting, sets and the defense's reads of them, crashing the glass and getting back. Where twice
   * the edge would have made a blind extreme a win against average personnel, its cost grows with
   * the leverage too (tradeOff); a roamer's give-back grows a little less (giftExp);
   * and a few base rates are recentered (recenter). All of them are nothing at 1, where the engine
   * plays exactly as it did before the change. scripts/tactic-impact.ts measures aimed choices at
   * 1x and at this leverage, scripts/tactic-sweep.ts the blind extremes.
   */
  tacticEdge: 2,
  /**
   * The costs that grow past 1x leverage on top of the doubled edges, where twice the edge made a
   * blind extreme a win against average personnel (the tactic sweep): the openness a half-court
   * shot gains per unit of ball pressure above 50 (the defense a step out of position), the blitz's
   * extra 4-on-3 openness, and the run-out chance a defensive board adds per unit of the other
   * side's crashing above 50 (on top of K.crashLeak's, so a team that runs collects most of it).
   * Each is multiplied by the leverage past 1. How much an offense makes of the pressure's is its
   * ball-handlers' doing: its unit's ball security (ST.secQ) against the league's (sec.avg; its teams
   * are 50-63) over sec.open, so a loose-handling team gets a quarter of it and a secure one up to
   * 1.5 times; and the turnovers pressure forces lean the same way, by that difference over sec.to
   * (see toChance). Pressure is the call against loose handlers, not against everyone.
   */
  tradeOff: { pressure: 0.45, blitz: 0.36, crash: 1.5, sec: { avg: 56, open: 8, to: 15 } },
  /**
   * The ball-screen coverages' room (openness, at 1x) on the pick-and-roll's looks: drop's big sags
   * (the handler's pull-ups open, his drive and the roll taken away, more so by a rim protector:
   * a step of `rim` per `rimProt` of his over 50; a popping screener open), hedge's show (the
   * handler stalled, the roll and the rotation's kick-out left open as the big recovers, the sooner by
   * a step per `speed` of quickness the big has on the screener), ice's
   * sideline (the middle's pull-ups, drives and rolls taken away, the weak side's corner given up),
   * the switch's scramble (the edge a handler gets on the switched big, on top of the matchup, and
   * `speed` more per 50 of quickness he has on him) and the slip (a screener who rolls well slips it
   * before the switch `slip` of the time, a roll at `slipOpen`: a switch had killed the roll outright,
   * and against ice switching everything had become a free point a game). (2026-10-26: a drop's wall
   * came to lean twice as much on the rim protector, `rimProt` 200 → 100, and a hedge's recovery half
   * again as much on the big's feet, `speed` 60 → 40, so Drop pays a rim protector and Hedge a mobile
   * big, as their playbooks say, rather than each paying nearly every roster alike.)
   * (Ice's corner 0.6 → 0.75 on 2026-11-09, when the seed was refit to the engine of the game-day
   * rounds and its scorers' finishing came up with it: taking the middle away was worth more, and Ice
   * measured best for 14 of 30 teams, style-gate's limit 12; now 8.)
   * The blitz's and a star double's trap: the handler's passing over 55 that's a step of escape (the
   * turnovers it forces and the 4-on-3 behind it). `help`: how far the help comes at a setting
   * (help's room on drives and kick-outs, and its pull on the rim's contests, grow with it).
   */
  cov: {
    drop: { pull: 0.85, rim: 0.7, rimProt: 100, roll: 0.6, pop: 0.7 },
    hedge: { stall: 0.4, roll: 0.45, kick: 0.35, speed: 40 },
    ice: { pull: 0.35, rim: 0.3, roll: 0.1, kick: 0.75, to: 0 },
    switch: { scramble: 0.2, speed: 0.5, slip: 0.15, slipOpen: 0.3 },
    blitz: { escape: 50 },
    double: { escape: 40 },
    help: 2,
  },
  /**
   * The big decisions' matchups: what makes the scheme, the ball-screen coverage, help, the
   * double-team and ball pressure worth points against one opponent and costly against another. A
   * look one of them gives up counts by who gets it: on top of the room the decision leaves, the
   * shooter gets `open[family]` more openness per step of his skill for the shot over the league's
   * (against `avg`, the attempt-weighted average for it, in steps of `per`, about its spread; at most
   * `cap` steps either way; less for a worse shooter, down to `floor` of the room for one who can't
   * shoot at all; a half-court look only, not a putback or a run-out). So a drop's pull-up room is a gift to an elite pull-up shooter and none to one who
   * can't shoot, and a zone's open threes sink a shooting team and not one that can't make them.
   * Before it every look counted the same whoever took it, and over the real league each of these
   * choices varied by under 0.7 points a game from one opponent to the next (the 2-3 zone's by 0.03):
   * nothing for scouting to find. `family`: the impact tags each family's looks carry.
   */
  matchup: {
    avg: { rim: 52, paint: 55, mid: 59, c3: 60, pu3: 59 },
    per: 12,
    cap: 1.5,
    open: { coverage: 1.4, zone: 1.1, help: 1.4, double: 1.3, pressure: 0.6 },
    /** The share of a decision's room the worst shooter keeps (an open look still beats a contested one for him). */
    floor: 0.25,
    /** Each family's average taker of its looks against the league's average taker of the shot, so the term is even for him (measured in real-league games). */
    center: { coverage: 2, zone: 0, help: -3, double: -2, pressure: 0 },
    family: {
      // (a switch's mismatches are the off-ball switching's too, a Fine-tune setting: not one of these)
      coverage: ['drop_', 'ice_', 'hedge_', 'blitz_', 'switch_slip'],
      zone: ['zone_', 'box_'],
      help: ['help_'],
      double: ['double_', 'star_double'],
    },
  },
  /**
   * Ball pressure under 50: the share of the turnover rate's swing a containing defense gives up
   * (above 50 an average lineup, ST.pressQ 50, forces half of it). At the full swing, dropping from 50
   * to 20 cost more than a third of the turnovers it forced and about 3.5 points per 100 against
   * every kind of offense (paired sweeps against each team's own setting): a trap, not a trade.
   */
  containTO: 0.35,
  /**
   * The turnover rate's swing per unit of ball pressure above 50 (under 50 it is 0.32, of which
   * containing gives up K.containTO). Raised from 0.32 when the league's turnovers were recentred
   * (K.recenter.tov): at 0.32 pressing loose handlers at 85 was worth nothing at 2x (it had been +1.2).
   * Then cut to 0.6 of that with the costs that pay for it (blowByConvex, tradeOff.pressure and
   * .blitz): pressure and the blitz are the same trade at a realistic size, as the league's forced
   * turnovers spread about as the NBA's do (top team about 1.3 times the average, not 1.5). Raised
   * again (0.24 → 0.34, with blowByConvex and tradeOff.pressure, and the trade leaning on the offense's
   * ball security, K.tradeOff.sec) when ball pressure was made a big decision: +1.9 a game against the
   * loosest-handling fives, −2.2 against the most secure, about even blind.
   */
  pressureTO: 0.34,
  /**
   * What the "why" tags of the turnovers pressure forces (or gives back) count of their own estimate:
   * with them leaning on the offense's ball security (K.tradeOff.sec), turning the AI's pressure off in
   * engineBalance's games measured -1.7 a game where the full tags said -2.0 more than that (a
   * turnover's tagged points show about three quarters in the margin, as crashing's boards show
   * part of theirs: see K.crashTag).
   */
  pressureTag: 0.75,
  /** How much of K.pressureTO's swing a pressing unit gets for its hands and feet (ST.pressQ): half at 50, a step per `per` points, within [min, max]. */
  pressQ: { per: 16, min: 0.15, max: 1.2 },
  /**
   * Seconds a press takes off the shot clock (the walk-up included: the half court's setup is shortened
   * by it), and the share secure handlers save per unit of their edge on the trap: before both,
   * pressing secure handlers after makes was a win at 2x (about +0.9 per 100) its tags called a loss.
   */
  pressTime: { min: 2, max: 4, beat: 0.4 },
  /**
   * The share of a defender's turnovers that are his steals, against the action's own (stealBy): the
   * turnovers containing gives back are mostly live balls, so steals ran about 6% over the league's
   * 8.2 with turnovers on its 13.9. (0.92 while a defender's steals were capped in a game, his chance
   * falling by exp(-0.6) for each past his second: that held the ball hawks' averages and took the
   * league's 5-steal games down to 19 a season, the NBA's 122-144. The stopper's own exposure,
   * K.role.poaSteal, does the first without the second.)
   */
  stealShare: 0.98,
  /**
   * ...and how much of a defender's steal tendency counts in it (an exponent): his tendency was fitted
   * with the per-game cap in place, and without it the best hands stole 15% more than their real rates
   * (per 36 minutes the top three 3.2, 2.9 and 2.5, the real league's 2.8, 2.5 and 2.4), 203 5-steal
   * games a season where the NBA has 122-144.
   */
  stealSpread: 0.45,
  /**
   * ...and past `from` steals in a game it falls by exp(-damp) a steal: handlers stop putting the ball
   * near him. (From his second steal at 0.6 until 2026-11-09: see stealShare.) With the tendency alone
   * a ball hawk who grew into 36 minutes a night led the league at 3.4-3.7 a game in a few of
   * star-check's 64 seasons, where 3.0 has been reached once since 1991.
   */
  stealCap: { from: 3, damp: 0.4 },
  /**
   * A roamer's give-back (the open catch his man gets while he helps) grows as the leverage to this
   * power, about 1.6 times at 2x. The offense takes more of a bigger gift, and each one is better, so
   * its cost compounds: at the full leverage it grew several times what the help saved.
   */
  giftExp: 0.65,
  /**
   * The open floor rewards the faster five: run-outs come more often by one per `often` points of speed
   * the runners have over the defenders (their fives' average speed ratings), and land with one unit of
   * edge per `edge` points. So pushing (Pace & Space) pays a fast roster and costs a slow one (2026-10-26:
   * was 120 and 25, when pushing paid nearly every roster alike and Pace & Space was the best offense for
   * half of a fictional league's rosters).
   */
  runSpeed: { often: 30, edge: 14 },
  /**
   * A handoff's hub reads the play (keeps it, gives it, hits the back-cut) as well as he passes: one unit of
   * the shooter's edge per `per` points of his passing over `at`. So a passing big is what makes Hub Big's
   * handoff-heavy offense work (2026-10-26: before it, a hub's passing moved nothing, and Hub Big measured the
   * same for a roster with an elite passing big as for one with none).
   */
  hubRead: { at: 55, per: 60 },
  /**
   * Past 1x leverage the doubled edges move the league's averages (the coverages, pressure, switching
   * and crashing AI coaches play), so these base rates move back by this share per unit of leverage
   * past 1, keeping AI-vs-AI games on their 2025-26 averages: the offense's taste for threes, shooting
   * fouls, offensive boards, turnovers and blocks. Last set (with K.zoneBase 1.5% lower, reach-ins at
   * 0.23 and a 9% team share of defensive boards) when the AI's playbooks were recalibrated: AI teams
   * now press the ball at 52 and more, switch off-ball screens and crash 42-72, which had sent
   * turnovers 17% over the league's, steals 15%, free throws 15% and offensive boards 10%, and threes 9%
   * under (two real-league seasons, rng 7 and 11, now every rate within 5%). Moved again (turnovers
   * −0.16 → −0.12, fouls −0.1 → −0.05, blocks −0.03 → 0) when pressure and the blitz were cut to a
   * realistic size and fewer AI teams pressed: those had fallen 3-6% under (rng 7, 11 and 23).
   * Moved again (threes −0.045 → −0.2, fouls −0.08 → −0.04, turnovers −0.2 → −0.12, reach-ins
   * K.nonShootFoul 0.23 → 0.22) on 2026-10-25, when the AI's staffs were refit to what each style
   * measures on the engine with blowouts and old stars tamed: the league went from Hub Big to
   * Five-Out and Pace & Space, and from blitzing and pressing to icing and hedging, which had sent
   * threes 9% over, fouls 8% under, free throws 9%, turnovers 7% and steals 9% under (two seasons,
   * rng 7 and 11). Now within 3% (rng 7, 11 and 23). Threes −0.2 → −0.12 on 2026-10-26, when the 2-3
   * zone was retuned and the playbooks rebalanced (Pace & Space and Five-Out shoot fewer threes, Grit &
   * Grind more, and fewer staffs run the two): threes had fallen 4-6% under (rng 7, 11 and 23).
   * Threes −0.12 → −0.15 on 2026-10-28, when partnerships and familiarity were deleted: without the
   * two-man game's and the pick-and-pop's roll and pop, more ball screens ended in kick-outs, and
   * threes had gone 2-3% over (rng 7), the leaders' and their 10-three nights past star-check's shape.
   */
  recenter: { three: -0.15, foul: -0.04, orb: -0.15, tov: -0.12, blk: 0 },
  /**
   * The offense's shape (SHAPE_META), against four-out, one-in (the engine's baseline). In the half
   * court, five-out opens the rim for everyone's drives, rolls and cuts (`rim`, the openness), less
   * `exposed` of it per non-shooter on the floor (his spacing short of 40, over 40: his man sits in the
   * paint), costs post-ups' capability and the offensive glass. Horns: spacing, ball screens, handoffs
   * at an average passing big (each 20 points of the better elbow big's passing over 55 adds
   * handoffW), motion and turnovers. The double post: its two bigs finish better inside (`bigs`) and
   * weigh more on the offensive glass (glassW), everyone else's drives find a crowded paint (`crowd`,
   * more by `waste` for each point of a big's spacing over `inside`, shooting wasted under the
   * basket), and post-ups are easier to get. Tactical edges (at the leverage). Measured in
   * scripts/system-impact.ts: each is a trade that pays for some rosters and costs others. (Retuned
   * 2026-10-26, five-out's exposure 0.75 → 0.55 and its rim 0.18 → 0.2, horns' spacing −1.5 → −2.2 and
   * turnovers −0.005 → 0, the double post's crowd 0.07 → 0.14, when the ratings came to count
   * three-point volume and the league's fives shot less: the double post had become the best shape for
   * 17 of the real league's 30 rosters and horns a small gain for nearly all of them. A shape's worth
   * leans on how the whole league shoots: on the ratings before that change five-out is the best shape
   * for 12 rosters, on the ratings since for 7.)
   */
  shape: {
    fiveOut: { rim: 0.2, exposed: 0.55, post: 0.6, glass: -0.02 },
    horns: { space: -2.2, pnr: 1.0, handoff: 1.0, handoffW: 0.03, motion: 0.95, tov: 0 },
    twoIn: { inside: 25, crowd: 0.14, waste: 0.002, bigs: 0.04, post: 1.15, glassW: 1.04 },
  },
  /**
   * Out-of-possession roles (DEF_ROLE_META): the point-of-attack stopper's edge against the
   * handler's blow-bys and the turnovers he forces on him (`poaSteal`: the share of his own steal
   * tendency that counts on the ball: his steals were fitted in games where he guarded whoever came,
   * and guarding the lead handler every trip the calibrated ball hawks stole twice their real rates,
   * Caruso 2.8-3.4 a game in 21 minutes for a real 1.3); the wing stopper's man's touches and the
   * contest he adds; the rim anchor's weight among the rim's contesters and the open catch his man
   * gets per unit of shooting over 50; the roamer's help (rim openness off teammates' drives, cuts and
   * rolls) and his man's open catch (at the roamer's give-back, see giftExp); and the extra drain of
   * the chasing roles. How hard the matchups send
   * each role to its man is `pull` (a cost the matchup solver weighs against size and quality).
   */
  role: {
    poaBlowBy: 0.035,
    poaTO: 0.04,
    poaSteal: 0.5,
    stopperTouch: 0.95,
    stopperContest: 0.006,
    anchorRim: 1.15,
    anchorKick: 0.06,
    roamHelp: 0.16,
    roamKick: 0.51,
    drain: 1.1,
    pull: 2.5,
  },
  /** A player's glass duty: his weight among the offensive rebounders when he crashes or gets back, and what each crasher on the floor adds to the team's crashing (out of 100). */
  glassDuty: { crash: 1.35, back: 0.45, team: 6 },
};

/** A tactical edge (openness, advantage, a rate) at the game's tactical leverage: `x` is its 1x size. */
/** The share of free throws a player makes, from his FT rating (the Plan tab's Hack-a-player reads it too). */
export const ftChance = (ft: number) => Math.min(0.95, Math.max(0.3, 0.42 + 0.0052 * ft));

export const lev = (x: number) => x * K.tacticEdge;
/** A tactical multiplier (a weight or a rate factor) at the game's tactical leverage: 1.8 at 1x is 1.8² at 2x. */
export const levW = (m: number) => m ** K.tacticEdge;
/** The part of a tactical edge past its 1x size, for an edge that comes from a matchup rather than a number: 0 at 1x. */
export const levExtra = (x: number) => x * (K.tacticEdge - 1);
/** A roamer's give-back at the game's tactical leverage (see K.giftExp); a multiplier with `w`. */
export const levGift = (x: number) => x * K.tacticEdge ** K.giftExp;
export const levGiftW = (m: number) => m ** (K.tacticEdge ** K.giftExp);
/**
 * The expected points of a blow-by edge of this size, for impact tags: the openness an advantage
 * buys is capped (a beaten defender is only so far behind), so the bigger the edge the less each
 * unit of it is worth (paired runs with and without it, at 1x and 2x: about 0.8 of K.advPts a unit
 * at full pressure at 1x, about half at 2x, as the other tags show in the margin).
 */
export const blowByTag = (edge: number, from: keyof typeof K.advPts) => (edge * K.advPts[from]) / (1 + (edge / K.blowBySat) ** 2);

export interface ZoneK {
  /** Openness the zone's back line takes off the roll man (the drop's job in man-to-man). */
  roll: number;
  pnr: number;
  pnrTag: number;
  iso: number;
  isoTag: number;
  post: number;
  postTag: number;
  drive: number;
  kick: number;
  pop: number;
  handoff: number;
  cutW: number;
  cut: number;
  swingW: number;
  swing: number;
  corner: number;
  glass: number;
  glassTag: number;
}

/** Diagnostics for calibration scripts: made field goals and assisted makes by zone. */
export const engineDiag = {
  made: { rim: 0, paint: 0, mid: 0, three: 0 },
  ast: { rim: 0, paint: 0, mid: 0, three: 0 },
};
export function resetEngineDiag() {
  for (const k of ['rim', 'paint', 'mid', 'three'] as const) {
    engineDiag.made[k] = 0;
    engineDiag.ast[k] = 0;
  }
}
