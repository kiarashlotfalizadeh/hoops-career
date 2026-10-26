// The engine's tuning constants (K): shooting by zone, the base rates of turnovers, fouls, boards and
// run-outs, time, fatigue and injuries, and the size of every tactical edge (coverages, zones and junk
// defenses, pressure, the press, the double, hunting, the late-game fouls),
// each with what it is and how it was sized; the tactical leverage those edges are played at
// (K.tacticEdge, with lev and the helpers after K that apply it); and the diagnostics the
// calibration scripts read.

import type { DefScheme, ShotZone } from '../../types';

export const K = {
  zoneBase: { rim: 0.624, paint: 0.447, mid: 0.411, c3: 0.371, ab3: 0.336 } as Record<ShotZone, number>,
  zoneSkill: { rim: 0.15, paint: 0.13, mid: 0.13, c3: 0.1, ab3: 0.1 } as Record<ShotZone, number>,
  zoneOpen: { rim: 0.1, paint: 0.07, mid: 0.055, c3: 0.06, ab3: 0.06 } as Record<ShotZone, number>,
  foulRate: { rim: 0.208, paint: 0.106, mid: 0.041, c3: 0.014, ab3: 0.016 } as Record<ShotZone, number>,
  /** Share of misses that are blocks, for an average contesting defender. */
  blockMiss: { rim: 0.24, paint: 0.154, mid: 0.04, c3: 0.0165, ab3: 0.0165 } as Record<ShotZone, number>,
  /** Extra share of misses blocked by the shooter's own defender (from behind, on the contest). */
  chaseBlock: { rim: 0.06, paint: 0.048, mid: 0.026, c3: 0.01, ab3: 0.01 } as Record<ShotZone, number>,
  orbBase: 0.262,
  toBase: 0.15,
  /** Reach-ins and holds on the handler, a chance per trip (0.23 until 2026-10-25: see K.recenter). */
  nonShootFoul: 0.22,
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
   * The reach-in rate of a defense protecting a one-to-three-point lead in the last 24 seconds of the
   * fourth quarter or overtime: it plays without fouling (a reach-in there was a free tie or lead).
   */
  lateLeadFoul: 0.3,
  /**
   * Seconds left on the game clock when a team holding for the last shot starts its action: a range,
   * drawn each time, tied in the fourth quarter or overtime and behind by one or two there; at the end
   * of the other quarters, always the same. Started at 6.5 seconds every time, a game's last shot
   * nearly always went up at the horn: four games in a hundred were won at the buzzer, and almost no
   * late winner came earlier.
   */
  holdStart: { tied: [7.5, 10.5] as [number, number], behind: [9.5, 13.5] as [number, number], quarter: 6.5 },
  /** Seconds a game's last shot goes up with (a range, drawn each time), from a play started in time for it. */
  lastShotSpare: [1.5, 4.5] as [number, number],
  /**
   * A trip begun with under `sec` seconds left in the fourth quarter or overtime: its shots go in less often, by up to `cut`
   * of their chance (all of it from a standing start, none at `sec`). Without it a defensive board
   * with a second and a half left became a layup at the other end as often as any rushed shot went in.
   */
  scramble: { sec: 3.5, cut: 0.55 },
  /** Share of rebounds credited to the team rather than a player (NBA box scores leave these out). */
  teamReb: { orb: 0.02, drb: 0.09 },
  transitionBase: { steal: 0.62, dreb: 0.19, made: 0.035, ft: 0.03, deadTO: 0.03, start: 0 } as Record<string, number>,
  setup: { made: 8.6, dreb: 4.9, steal: 2.0, ft: 8.4, deadTO: 8.0, start: 5.6 } as Record<string, number>,
  actionTime: 7.6,
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
   * within a few simulated seasons.
   */
  useLevel: 0.32,
  usageDamp: 9,
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
   */
  threeUse: { from: 15, level: 0.18, damp: 15 },
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
   * up more, against the league's fives as they shoot now).
   */
  crashTag: { orb: 0.49, leak: 0.29 },
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
   * worth less. At 0.5 the switch tags −1.10 against a measured −1.01.
   */
  switchTag: 0.5,
  /** Share of offensive boards given up at full transition-D sprint back. */
  getBackOrb: 0.08,
  /** Game-to-game conditions shared by both teams (SDs): tempo, field-goal percentage, foul calls. */
  envPace: 0.035,
  envShoot: 0.012,
  envFouls: 0.08,
  /** Score effects: past this second-half margin the leader eases off and the trailer plays
   * loose, up to this much field-goal percentage either way, reached this many points later. */
  easeFrom: 8,
  ease: 0.05,
  easeSpan: 12,
  /**
   * ...and past `from`, a deep bench against a deep bench in a game nobody is playing for any more:
   * up to `x` more by `from` + `span`. The engine's possessions are noisier than the NBA's (a real
   * team against itself: 9.0 points of margin SD a quarter, the NBA's about 8), so games ran away by
   * halftime (45 a season were 30 or more apart at the break) and the fourth quarter couldn't bring
   * them back. Over 48 seasons (four leagues of twelve), with garbage time (K.garbage) and this: 6.7
   * games a season decided by 40 or more (27.8 before; the NBA about 6), the season's biggest margin
   * 50 on average and 63 at most (68 and 89; the record is 73), its biggest team score in regulation
   * 160 and 171 (163 and 191), with the margin's SD at 15.7 (16.5) and 23% of games decided by 20 or
   * more (22%): `ease` came down from 0.058 to hold that share near the NBA's 21%.
   */
  easeBig: { from: 27, span: 12, x: 0.08 },
  /**
   * Garbage time (see wantsGarbage): with `start` seconds of regulation left or fewer (from the start
   * of the third quarter), a lead of `from` + `per`·√(minutes left) decides a game for a coach at the
   * league's line (34.5 at the half, 30 with three minutes left in the third, 28.5 at the start of the
   * fourth, 23 with five minutes left, 18 with one), times his own `patience` tonight (a range, drawn
   * per game: some coaches empty the bench sooner). (`start` was 900, 3:00 left in the third, until
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
   * of their real lines in the first season (2.0-2.4 before).
   */
  garbage: {
    start: 1440,
    from: 14,
    per: 4.2,
    patience: [0.9, 1.15] as [number, number],
    exit: 8,
    depth: 2,
    late: [150, 330] as [number, number],
    slow: 3,
    run: 0.5,
    three: 0.75,
    pressLead: 20,
  },
  clutchSec: 240,
  clutchEase: 0.05,
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
   * Crunch time: how much more often the ball finds the go-to player, and how much more his best action
   * is run; and the same for the staff's own go-to (the best scorer on the floor) when nobody is named.
   */
  goToPick: 2.5,
  goToAction: 1.6,
  goToAuto: 1.7,
  goToAutoAction: 1.25,
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
   * The blitz's and a star double's trap: the handler's passing over 55 that's a step of escape (the
   * turnovers it forces and the 4-on-3 behind it). `help`: how far the help comes at a setting
   * (help's room on drives and kick-outs, and its pull on the rim's contests, grow with it).
   */
  cov: {
    drop: { pull: 0.85, rim: 0.7, rimProt: 100, roll: 0.6, pop: 0.7 },
    hedge: { stall: 0.4, roll: 0.45, kick: 0.35, speed: 40 },
    ice: { pull: 0.35, rim: 0.3, roll: 0.1, kick: 0.6, to: 0 },
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
   * 8.2 with turnovers on its 13.9 (0.88 then; 0.92 since stealCap).
   */
  stealShare: 0.92,
  /**
   * Past `from` steals in a game a defender's share of his man's turnovers that are steals falls by
   * exp(-damp) a steal: handlers stop putting the ball near him. The calibrated ball hawks stole
   * twice their real rates in league play, where they guard the other team's lead handler as its
   * point-of-attack stopper (Caruso 2.8-3.4 a game in 21 minutes, his real 1.3): the steals leader
   * averaged 2.98 a game (3.48 at most, one season of nine real-league runs), the NBA's about 2.0-2.3.
   * With this and stealShare up from 0.88 to give the league back its steals: 2.41 (2.96), the
   * league's steals at 7.85 a team game (8.08; the NBA's 8.2); over 48 seasons 2.19 (2.72 at most).
   */
  stealCap: { from: 2, damp: 0.6 },
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
   */
  recenter: { three: -0.12, foul: -0.04, orb: -0.15, tov: -0.12, blk: 0 },
  /**
   * Tactical familiarity (src/core/sim/familiarity.ts): at the full penalty (a unit that knows
   * nothing of what it plays) the make probability its offense loses and its turnover rate's rise,
   * and the make probability its defense gives up. A unit is played at famPenalty of it, none when
   * fluid (scripts/system-impact.ts, against the same tactics drilled): a never-drilled coverage costs
   * about 0.4 points per 100, a never-drilled 2-3 zone about 0.6, a new shape about 0.25, a new
   * offense with new roles for everyone about 1.8. Not a tactical edge: no leverage.
   */
  fam: { shot: 0.029, tov: 0.15, shotD: 0.036 },
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
   * handler's blow-bys and the turnovers he forces on him; the wing stopper's man's touches and the
   * contest he adds; the rim anchor's weight among the rim's contesters and the open catch his man
   * gets per unit of shooting over 50; the roamer's help (rim openness off teammates' drives, cuts and
   * rolls) and his man's open catch (at the roamer's give-back, see giftExp); and the extra drain of
   * the chasing roles. How hard the matchups send
   * each role to its man is `pull` (a cost the matchup solver weighs against size and quality).
   */
  role: {
    poaBlowBy: 0.035,
    poaTO: 0.04,
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
  /**
   * Partnerships (src/core/sim/links.ts), at a link's full strength: a two-man game or a pick-and-pop
   * adds `adv` to the handler's edge on the pick-and-roll and openness to the roll man's finish or the
   * pop; inside-out adds openness to the post hub's kick-outs, a handoff chain to the hub's handoffs
   * and cuts, and the wall takes `wall` off the edge of a handler its stopper guards, on the
   * pick-and-roll and the isolation; `screen` is how much more
   * often a handler's linked big sets his screens (a weight, 1 + screen at full strength). The crowded
   * paint takes `crowd` off everyone else's half-court shots at the rim and in the paint. Tactical
   * edges (at the leverage). Measured in scripts/link-impact.ts (paired, each team's own links gelled
   * against its pairs new to each other): about +0.5 per 100 on average, +0.66 for an elite two-man
   * game, +1.4 for an elite pick-and-pop, −0.14 for a crowded starting five. `tag` is the share of
   * its openness and edge a link's impact tag counts, so the reports say what it measures (the
   * two-man game's and the crowd's rim openness tag about three times what they're worth).
   */
  link: {
    adv: 0.9,
    twoMan: 0.9,
    popMan: 1.0,
    inOut: 1.6,
    dho: 1.6,
    wall: 2.0,
    screen: 0.4,
    crowd: 0.25,
    tag: { link_twoMan: 0.35, link_popMan: 0.65, link_wall: 0.5, clash_crowd: 0.25 } as Record<string, number>,
  },
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
