// The tactics' constants (TK): the size of every edge a tactical choice gets from fitting, or not
// fitting, the opponent and its own personnel, at the size the engine plays it (there is no separate
// leverage multiplier: each number here is the edge itself). Written from scratch in November 2026
// against the game-day tactics review (review/GAMEDAY-TACTICS-REALISM.md) and NBA numbers: Synergy
// play types by team (2024-25, 2025-26), Second Spectrum's ball-screen coverage shares, and the
// 2024-26 play-by-play. Each block says what it is and what it was sized to. The measuring kit is
// scripts/tactics-lab (levers, coverages by opponent, the AI league as it plays).

import type { ActionType, DefScheme } from '../../types';

export interface ZoneT {
  /** Openness its back line takes off the roll man, and the edge it takes off the ball-screen handler, an isolation, a post-up and a drive. */
  roll: number;
  pnr: number;
  iso: number;
  post: number;
  drive: number;
  /** Openness it leaves on kick-outs, pops, handoffs and swings (a negative: harder closeouts than man). */
  kick: number;
  pop: number;
  handoff: number;
  swing: number;
  /** Swing weight multiplier, the corner's share of swing threes, cut weight lost and cut openness lost. */
  swingW: number;
  corner: number;
  cutW: number;
  cut: number;
  /** Offensive-board multiplier for the offense. */
  glass: number;
}

export const TK = {
  // ------------------------------------------------------------------ the half court's choices
  /**
   * How sharply the action weights steer the half court: an action's weight is (w / 50)^emph times
   * what the five on the floor can run (capability), times the defense keying on it (key). 1.4 before
   * 2026-11: with it the playbooks' mixes ran further apart than real teams' (the sim's team-to-team
   * SD of cut share 3.0 points, the NBA's 1.25; isolation 2.5 against 1.9).
   */
  emph: 1.2,
  /**
   * The defense keys on what an offense runs most: past `ref` of the night's half-court actions
   * (counted from `from` actions on), an action starts each run `per` openness down for each unit of
   * share over it. Why teams mix their actions: before it, setting the motion weight to 0 was a free
   * +1.2 per 100 (its trips went to ball screens and handoffs, which scored more), with no cost for
   * running one thing all night. `ref` is a little above the league's mix of actions (pick-and-roll
   * about a third of the half court's first actions, motion a third, handoffs a sixth), and a five
   * built for an action can run it up to `nat` times its natural share (what it would run with every
   * weight equal, by what its players do best) first: with one bar for everyone, Balanced Attack measured
   * best for nearly every roster alike and Hub Big never paid an elite passing center.
   */
  key: { from: 14, per: 2.6, nat: 1.5, ref: { pnr: 0.42, iso: 0.16, post: 0.12, handoff: 0.22, motion: 0.38 } as Record<ActionType, number> },
  /**
   * Against a zone or a junk defense the ball moves on its own: players attack it with ball movement
   * and the high post rather than isolations (the action weights times these while a zone is played).
   */
  vsZone: { pnr: 0.9, iso: 0.7, post: 0.8, handoff: 1.15, motion: 1.35 } as Record<ActionType, number>,

  // ------------------------------------------------------------------ ball screens
  /**
   * Where a ball screen is set: on the side `side` of the time (an Ice defense ices those and drops
   * the middle ones; horns' screens are at the elbows, the middle). A screen by a non-big for a handler
   * of about his size (within `smallGap` of height rating) is switched by a man defense `smallSwitch`
   * of the time whatever its coverage (its habit: AI coaches 0.45-0.9), the league's most common
   * switch. NBA (Second Spectrum, 2020-21): drop 58%, switch 18% and rising, blitz 3%; the sim's AI
   * switched 6.5% of ball screens and iced every one, side or middle.
   */
  screen: { side: 0.45, smallGap: 14, smallSwitch: 0.7 },
  /**
   * The coverages' room, in openness on the pick-and-roll's looks.
   * - drop: the big sags. The handler's pull-ups open (`pull`, its value scaled by his pull-up skill:
   *   see room), his drive and the roll walled (`rim`, more by a rim protector: a step per `rimProt` of
   *   his over 50; `roll`), a popping screener open (`pop`); the big contests the drive (`contest`
   *   weight among the rim's contesters).
   * - hedge: the big shows: the handler stalled (`stall`), more of his passes picked (`to`), the roll
   *   open as the big recovers (`roll`, less a step per `speed` of quickness the big has on the
   *   screener), the rotation's kick-out open (`kick`).
   * - ice: the side screen pushed to the baseline: the middle's pull-ups, drives and rolls taken away,
   *   the weak side's corner open (`kick`), a few more turnovers (`to`).
   * - switch: the screen's edge gone; the matchup the switch leaves is played (`scramble`, and `speed`
   *   more per 50 of quickness the handler has on the big); a rolling screener slips it `slip` of the
   *   time (`slipOpen`), and a big left on a guard posts him `post` of the time when he has the better
   *   of it. (Scramble 0.32 and post 0.7 made switching a loser for nearly every defense, as it had
   *   been: the NBA's second most common coverage.)
   * - blitz: two on the ball. The handler rarely shoots (`shoot`), the trap's turnovers (`to` plus
   *   `hands` per unit of the trappers' hands and length, less `escape` per unit of the handler's
   *   passing over 55 in steps of `per`), the 4-on-3 behind it (`fourThree`, more by the escape and the
   *   short-roll big's passing). NBA blitzes force turnovers: that is their point (the sim's forced
   *   +0.2 points of them and gave up +2.5 points of eFG).
   */
  cov: {
    drop: { pull: 0.95, rim: 1.0, rimProt: 90, roll: 0.9, pop: 1.2, contest: 2.0 },
    hedge: { stall: 0.6, to: 0.012, roll: 0.75, kick: 0.6, speed: 40 },
    ice: { pull: 0.6, rim: 0.55, roll: 0.25, kick: 1.15, to: 0.004 },
    switch: { scramble: 0.14, speed: 0.45, slip: 0.1, slipOpen: 0.5, post: 0.35 },
    blitz: { shoot: 0.08, to: 0.055, hands: 0.22, escape: 0.22, per: 50, fourThree: 1.6, short: 2.6 },
  },
  /** Off a ball screen, the roll man's weight against the handler's other looks (the NBA's roll men finish about 27% of pick-and-rolls; the sim's 44%). */
  rollW: 0.25,
  /**
   * How far the help comes: help() runs -help (staying home) .. +help (packing the paint), and each
   * action's room on drives, rolls and kick-outs is a share of it. Help 0 / 100 moved the other side's
   * three-point rate -8 / +6 points and its rim share +5 / -3, both ends a cost (the review: right).
   */
  help: 2,
  /**
   * What a look's room is worth to whoever gets it: room times use(skill), his skill for the shot
   * against the league's average taker (`avg`), a step per `per`, between `min` (one who can't shoot
   * still takes an open look over a contested one) and `max`. So a drop's pull-up room is a gift to
   * an elite pull-up shooter and little to one who can't shoot, and a zone's open threes sink a
   * shooting team and not one that can't make them. Room taken away costs everyone alike.
   */
  use: { avg: { rim: 52, paint: 55, mid: 59, c3: 60, pu3: 59 }, per: 22, min: 0.3, max: 1.7 },

  // ------------------------------------------------------------------ off-ball switching
  /**
   * Switching off-ball screens: the edge it takes off the man coming off a handoff or a screen and off
   * motion's ball movement; a cross-screen leaving a big posting a small (`cross`, when the size gap is
   * `crossSize` or more); a switched handoff's mismatch hunted (from `huntFrom` of edge, its chance
   * growing `hunt` a unit to `huntMax`); the scramble it leaves (`scramble`); and the offensive boards
   * it gives up (a guard switched onto a big). Only Switch Everything and the press switch off the ball
   * now: every man-to-man playbook used to.
   */
  offBall: { handoff: 0.45, motion: 0.16, cross: 0.12, crossSize: 20, huntFrom: 0.2, hunt: 0.6, huntMax: 0.75, scramble: 0.3, glass: 0.03 },

  // ------------------------------------------------------------------ pressure, help, physicality
  /**
   * Ball pressure (-1 sagging .. +1 swarming): the turnover rate's swing per unit above 50 (`to`, as
   * much as the unit's hands and feet make of it: half at an average unit, a step per `pressQ` points,
   * within [qMin, qMax]; leaning on the offense's ball security over `secAvg` in steps of `secTo`), the
   * share of it a sagging defense gives up (`contain`), the handler's blow-by edge (`blowBy` per unit
   * and `convex` more at the top), and the openness a defense out of position gives up on the shots
   * that do get off (`over`, as much as the handlers make of it: `secOpen`). At a `to` of 0.68,
   * pressure at 100 took the other side's turnovers from 0.135 to 0.178, past the NBA's best defenses
   * (about 0.16-0.17, second review).
   */
  pressure: { to: 0.5, contain: 0.3, pressQ: 20, qMin: 0.15, qMax: 0.95, secAvg: 56, secTo: 15, secOpen: 8, blowBy: 0.3, convex: 1.24, over: 0.45 },
  /**
   * Physicality (-1 hands off .. +1 rough it up): shooting fouls and reach-ins times 1 + `foul` per
   * unit, and every shot's chance `contest` down per unit. NBA teams allow free-throw rates of
   * 0.20-0.32; the slider used to move the opponents' from 0.09 to 0.49, and "hands off" was a free
   * +0.8 per 100; at a `foul` of 0.24 it still moved them 0.17-0.32, 1.6 times the NBA's team range
   * (second review).
   */
  phys: { foul: 0.16, contest: 0.0075 },

  // ------------------------------------------------------------------ zones and junk defenses
  /**
   * Zone defenses by scheme, at their size against an average five from an average five (zoneFit
   * scales them to the two on the floor). The 2-3 walls off the paint and leaves threes (corners) and
   * the glass; the 3-2's three on the arc close out harder than man (negative openness) and leave the
   * paint, the post, cutters and the glass softer. The junk defenses' zones behind their chasers have
   * fewer bodies: four in a 2-2 box, three in a triangle. They still sit in the paint, so it's the arc
   * they leave, and the glass, for everyone the chasers aren't on: a box-and-one played all game pays
   * against a lone scorer whose teammates can't shoot (about +2.8 a game against Curry's Warriors) and
   * loses 1-2 against a five of shooters. Before, a triangle-and-two played all game was the best
   * defense in the game (+2.2 per 100, +3 to +6 against star-led teams).
   */
  zone: {
    zone23: { roll: 1.0, pnr: 1.2, iso: 1.3, post: 1.8, drive: 1.2, kick: 0.7, pop: 0.52, handoff: 0.34, swing: 0.9, swingW: 1.8, corner: 0.45, cutW: 0.5, cut: 0.4, glass: 1.16 },
    zone32: {
      roll: -0.15,
      pnr: 0,
      iso: 0,
      post: -0.2,
      drive: -0.15,
      kick: -0.6,
      pop: -0.4,
      handoff: -0.4,
      swing: -0.6,
      swingW: 1.8,
      corner: 0.2,
      cutW: -0.2,
      cut: -0.15,
      glass: 1.25,
    },
    box1: { roll: 0.85, pnr: 0.9, iso: 1.0, post: 1.3, drive: 0.95, kick: 1.2, pop: 0.95, handoff: 0.7, swing: 1.25, swingW: 2.0, corner: 0.55, cutW: 0.4, cut: 0.32, glass: 1.07 },
    tri2: { roll: 0.7, pnr: 0.75, iso: 0.8, post: 1.0, drive: 0.8, kick: 1.35, pop: 1.05, handoff: 0.85, swing: 1.4, swingW: 2.1, corner: 0.6, cutW: 0.3, cut: 0.25, glass: 1.1 },
  } as Record<Exclude<DefScheme, 'man'>, ZoneT>,
  /**
   * A zone's table against these five from this five: its walls stand taller with length (the five's
   * average height rating against `hgt`) and come down against a five with a high-post passer
   * (best of passing and mid-range, half each, against `mid`); its open looks open wider the better the
   * ball moves (passQ against `pass`) and narrower the longer its closeouts; its softer glass is softer
   * still against a five that crashes it (average offensive rebounding against `orb`). Each a share of
   * the table's size a rating point, within [min, max]. A zone also hides its weak on-ball defenders
   * and wastes its good ones (`hide` of the man's on-ball defense counts as `hideAt`).
   */
  zoneFit: { hgt: 46.5, wallLen: 0.06, mid: 67, wallMid: 0.035, pass: 63, arcPass: 0.04, arcLen: 0.03, orb: 47, glassOrb: 0.12, min: 0.35, max: 1.8, hide: 0.5, hideAt: 50 },
  /**
   * An AI staff's zone in stretches of `stretch` seconds: a base zone (or a game plan's) is played
   * `planned` of the time; a man defense's coach mixes his own zone in at his style's share. NBA
   * teams play zone on about 1-5% of half-court trips; at 0.25 the AI league played 5.4%.
   */
  zoneStretch: 150,
  /**
   * The offense reads a zone (or a junk defense) as the game goes: after `trips` half-court trips
   * against one tonight its open looks and its glass are `max` wider and its walls `wall`·`max`
   * lower, growing with each trip (the table moves every `step`). A change-up played in stretches
   * stays fresh; a zone played all game gets solved, as NBA offenses solve one with the high post
   * and ball reversal. Before it, a full-game 2-3 zone measured as good as man-to-man and the staff
   * ran it for 13 of the 30 real rosters (second review). A coach's answer to one (attackZone, the
   * high-post flash) reads it `answer` trips sooner; before, it was worth nothing.
   */
  zoneRead: { trips: 40, max: 0.3, wall: 0.5, step: 4, answer: 16 },
  zonePlanned: 0.2,
  /**
   * A junk defense's chasers: the chased player's share of the half court's touches (`touch`, a box's
   * one and a triangle's two: a real box-and-one costs a star some of his touches, not four fifths of
   * them as it did), the edge he loses catching it late and further out (`catch`), the usage share past
   * which the defense loads up on him coming this much sooner (`cap`), and the chaser's extra drain.
   * Off the ball, top-locked: his weight as a kick-out target, the openness off his catch-and-shoot
   * threes, the edge off screens and handoffs, and what a defender caught high gives back on his drives
   * on the catch, his curls and back-cuts (openness, and his cut weight).
   */
  chase: { touch: 0.4, catch: 0.4, cap: 0.04, drain: 1.35, kickW: 0.55, c3: 0.5, offScreen: 0.3, beat: 0.45, cutW: 2.0 },
  /**
   * An AI staff traps the other side's main creator on a share of his ball screens (`share`, times his
   * coach's habit, 0.5-1.5) when he scores at `score` or better off the dribble (pull-up three or
   * mid-range) and passes under `pass`. NBA defenses blitzed about 3% of ball screens (Second Spectrum,
   * 2020-21), mostly a star's; the sim's AI blitzed 0.5%, only where a whole coverage was a blitz.
   */
  blitzStar: { share: 0.3, score: 72, pass: 72 },
  /**
   * An AI drop (or ice) staff shows high on the screens of a handler who pulls up at this or better
   * (three or mid-range), on a share of them by its habit (0.5-0.95): NBA teams don't drop against
   * Curry or Edwards. Without it the league's elite pull-up shooters feasted on drop coverage and the
   * best of them reached 35 a game in four seasons of a league (star-check); again at a habit of
   * 0.3-0.9 and 80, once the AI's coverages came to hedge less (style.ts coverageFor).
   */
  upShooter: 78,
  /** A junk defense from an AI game plan is played in stretches (this share of the time), as real teams play one. */
  junkPlanned: 0.15,

  // ------------------------------------------------------------------ the glass and the open floor
  /**
   * Crashing the offensive glass (c: -1 never .. +1 crash hard): the offensive-board rate times
   * 1 + `orb`·c - `fade`·c² above 50 and 1 + `low`·c below; the other side's run-out chance after its
   * defensive board times 1 + `leak`·c above 50 (1 + `leakLow`·c below), its runners `edge`·c
   * ahead; a defense that didn't crash is set for the other side's first half-court action (`set`
   * openness per unit below 50); and crashing wears the legs (`drain` more per unit above 50). NBA 2024-26: the fifth of teams that crash hardest give up no more
   * pushes than the fifth that crash least (27.6% and 27.3%), and teams' offensive rebounding spreads
   * with an SD of 2.8 points; the sim's leak multiplied run-outs by up to 5.5 and never crashing was a
   * free +1.0 per 100, with team ORB% spreading 1.6. Then crashing at 75 was a free +1.0 with the
   * crashers giving up a third more run-outs (second review): its cost moved from the other side's
   * break to its own legs and its diminishing boards (in six matchups crashing at 75 +0.5 per 100, at
   * 100 −1.5).
   */
  crash: { orb: 0.3, fade: 0.24, low: 0.26, leak: 0.15, leakLow: 0.15, edge: 0.5, set: 0.45, drain: 0.45 },
  /**
   * Getting back (g = getBack/100): the other side's run-out chance times `base` - `per`·g, its
   * runners' edge down `edge`·(g - 0.5), and the side's own offensive boards down `orb` at full sprint
   * back. NBA teams' transition shares run 15-24% (Synergy). It had been
   * ×1.5 to ×0.5 with the runners a full unit ahead or behind: getting back below 50 cost run-outs and
   * won almost nothing (+0.7 points of offensive boards).
   */
  getBack: { base: 1.25, per: 0.5, edge: 1.0, orb: 0.1 },
  /**
   * A missed three comes off long: the other side's run-out chance after the defensive board times
   * this. Long rebounds are where three-point volume pays for itself: without them shooting more threes
   * was a free +1.2 per 100 (positive in five of six matchups) on the new engine.
   */
  longRebound: 1.32,
  /**
   * Hunting threes: a team's half-court threes lose `forced` openness at a shot profile of 100, from
   * `from` up (squared: little at the real teams' settings, most at the slider's end), as the defense
   * runs it off the line. A shot profile of 100 was a free +0.8 per 100 for nearly every team (second
   * review); now about even.
   */
  arc: { from: 55, forced: 0.22 },
  /**
   * Pushing after every stop: from a transition setting of 50 up, only `found` of the extra pushes
   * become run-outs (the defense is back for the rest), and the run-outs it does get have less edge
   * (`adv`) and more turnovers (`to`, a share) per unit to 100. Pushing after every stop was a free
   * +0.7 per 100 (second review), and the three sliders together +1.7; in six matchups now each about
   * even, all three −0.4.
   */
  push: { adv: 0.15, to: 0.15, found: 0.45 },
  /** A run-out's base openness (before the runners' edge): the handler at the rim, the trailer's three, the handler's pull-up three, the drop-off to a runner. */
  run: { rim: -0.08, three: 0.08, pull: 0.1, drop: 0.06 },
  /** A player's glass duty: his weight among the offensive rebounders when he crashes or gets back, and what each crasher on the floor adds to the team's crashing (out of 100). */
  glassDuty: { crash: 1.35, back: 0.45, team: 6 },

  // ------------------------------------------------------------------ the shape
  /**
   * The half-court shape against four-out, one-in. Five-out: the paint open for everyone's drives,
   * rolls and cuts (`rim` openness, less `exposed` of it per non-shooter on the floor: his spacing short
   * of 40, over 40, his man sits in the paint), drives and cuts run a little more (`driveW`, `cutW`),
   * post-ups harder to get (`post`), the glass emptier (`glass`). Horns: a big at each elbow: better
   * screens (`pnr` edge), handoffs as good as the better elbow passer (`handoff` + `handoffW` per 20 of
   * his passing over 55), less motion (`motion`) and a little less spacing (`space`), fewer turnovers
   * (`tov`). The double post: its two bigs finish better inside (`bigs`) and weigh more on the glass
   * (`glass`), post-ups easier to get (`post`), everyone else's drives into a crowded paint (`crowd`,
   * and `waste` more per point of a big's spacing over `inside`: shooting wasted under the basket), and
   * drives run less (`driveW`). Before, shapes moved net rating by under 0.25 per 100 whoever played.
   */
  shape: {
    fiveOut: { rim: 0.6, exposed: 0.6, driveW: 1.15, cutW: 1.2, post: 0.55, glass: -0.05 },
    horns: { space: -5, pnr: 0.02, pnrCap: 1.0, handoff: 0.9, handoffW: 0.08, motion: 0.75, tov: 0 },
    twoIn: { inside: 25, crowd: 0.36, waste: 0.004, bigs: 0.1, post: 1.5, glass: 0.08, driveW: 0.8 },
  },

  // ------------------------------------------------------------------ hunting
  /**
   * Hunting one defender (a game's target): the player he guards gets the isolations, post-ups and
   * ball-handler reps this many times as often, he sets the screen `screen` of the time when he isn't
   * handling, the handler's edge per `screenEdge` of the hunted screen defender's gap to his teammates,
   * and motion's and handoffs' edge lost while the ball sticks (`flow`). Hunting mismatches (the
   * setting): an isolation or post-up goes to a capable creator (post scorer: `able` and up, over 25)
   * whose man is weaker than the rest of the defense on the floor (`weakPer` rating points a unit, and
   * height on a post-up), a ball screen's screener is the one whose man defends the ball worst (`tilt`
   * per unit, within [tiltMin, tiltMax]: against a switch the weak defender ends up on the handler),
   * isolations and post-ups run more where there is a mismatch worth it (`isoW` per point of the best
   * gap over `from`, up to `isoMax`), and the ball sticks (`flowAuto`). In the lab's six matchups it
   * runs 1.3-2.3 points more isolations and nets about even (half of them ahead), against switching
   * defenses too. It barely moved anything before (+0.2 per 100, no play type moved), and then sent
   * the ball to anyone whose man rated lower than him, the best defender's man included.
   */
  hunt: { pick: 3.2, screen: 0.75, screenEdge: 20, flow: 0.16, tilt: 2.2, tiltMin: -0.5, tiltMax: 1.0, able: 45, weakPer: 15, from: 3, isoW: 0.08, isoMax: 2.2, flowAuto: 0.08 },

  // ------------------------------------------------------------------ attacking the rim
  /**
   * Attacking the rim (a: -1 jump shots .. +1 all downhill): the drive's weight comes from the shot
   * profile (prefs); its costs: more charges and turnovers on drives (`to` per unit above 50) and more
   * blocks (`blk`). Before, driving more carried no extra turnovers or charges.
   */
  rim: { to: 0.02, blk: 0.18 },

  // ------------------------------------------------------------------ the double and roles
  /**
   * The star plan's double: the chance the double comes when he attacks, its turnovers (`to` at a
   * passing of 55, `escape` less per 40 of passing over it, within [toMin, toMax]), the 4-on-3's
   * openness (`kick`, and a unit more per 40 of his passing over 55), and a forced shot when he tries to split it (`split`).
   */
  double: { p: 0.75, to: 0.14, escape: 0.5, toMin: 0.04, toMax: 0.3, kick: 0.85, split: -1.0 },
  /**
   * Out-of-possession roles: the point-of-attack stopper's edge against the handler's blow-bys and the
   * turnovers he forces on him (`poaSteal`: the share of his own steal tendency that counts on the
   * ball); the wing stopper's man's touches and the contest he adds; the rim anchor's weight among the
   * rim's contesters; the roamer's help (rim openness off teammates' drives, cuts and rolls, two at
   * most) and his man's open catch; the chasing roles' extra drain; and how hard the matchups send
   * each role to its man. Each edge is the role's at a fit for it of `fitAt` + `fitPer` (see roleEdge:
   * none at `fitAt`, a cost below it, at most `fitMax` of it): before, a role's edge was the same
   * whoever played it, and a lineup with its two best perimeter defenders hidden and its two worst
   * as stoppers measured as well as the right way round (second review).
   */
  role: {
    poaBlowBy: 0.07,
    poaTO: 0.08,
    poaSteal: 0.5,
    stopperTouch: 0.9,
    stopperContest: 0.012,
    anchorRim: 1.32,
    anchorKick: 0.06,
    roamHelp: 0.3,
    roamKick: 0.8,
    drain: 1.1,
    pull: 2.5,
    fitAt: 50,
    fitPer: 18,
    fitMax: 1,
  },

  // ------------------------------------------------------------------ the press
  /**
   * The full-court press against the handlers bringing it up: their ball security and passing over the
   * league's (`sec`) against the trappers' hands and feet over the league's (`trap`), a step per `per`.
   * Its turnovers (`baseTO` at even, `to` a step), broken into a run-out `broken` of the time at even
   * (`brokenAdv` more a step), the seconds it takes (`time`, secure handlers saving `beat` of them a
   * step), and the pressing side's legs (`drain` all game on top
   * of the press's own drain on both, `always` more for pressing every inbound).
   */
  press: { baseTO: 0.012, sec: 65, trap: 50, per: 8, to: 0.05, broken: 0.4, brokenAdv: 0.16, drain: 1.21, both: 1.32, always: 1.25, time: [2, 4] as [number, number], beat: 0.4 },

  // ------------------------------------------------------------------ late substitutions
  /**
   * Offense-defense substitutions: in the last `sec` seconds of the fourth quarter or overtime with the
   * game within `within`, a team about to defend brings in its best defender off the bench of the same
   * size for the five's weakest (never its closer) when he defends `gap` points better (0.5 perimeter,
   * 0.3 help, 0.2 inside), and goes back to its closing five on offense. NBA coaches do it at nearly
   * every late stoppage; the sim's never did (the review's toolkit gap). AI coaches by habit (most).
   */
  odSub: { sec: 36, within: 3, gap: 10, habit: 0.8 },

  // ------------------------------------------------------------------ mentality
  /**
   * What a mentality costs or saves beyond the settings it nudges (withMentality): per step of
   * aggression (-2 .. +2), turnovers times 1 + `to` a step (rushed decisions; patience saves `toLow`),
   * and the half court's looks `rush` openness down a step above 0 (`patient` up a step below). Before,
   * very aggressive was the settings' nudges and nothing else, a small free gain (+0.7 per 100, five of
   * six matchups).
   */
  mentality: { to: 0.04, toLow: 0.015, rush: 0.06, patient: 0.012 },

  // ------------------------------------------------------------------ the AI's habits
  /**
   * How readily an AI coach calls a set out of a timeout (times his own habit, 0.5-1.5): NBA teams
   * run a drawn-up play out of most timeouts; the sim's AI coaches never did, only the user could.
   */
  ato: 0.55,
  /**
   * An AI coach's own after-timeout set comes with `at` of the library's edge at a tactics rating of
   * 50, `per` more a point, within [min, max]. At the full edge AI sets scored 1.30 a trip to the half
   * court's 1.13, where NBA after-timeout plays score about the half-court average (second review).
   */
  aiSet: { at: 0.4, per: 0.006, min: 0.2, max: 0.65 },
};

/** What a look's room is worth to a shooter of this skill for it (see TK.use): 1 at the league's average taker. */
export function roomWorth(skill: number, avg: number): number {
  const u = TK.use;
  return Math.min(u.max, Math.max(u.min, 1 + (skill - avg) / u.per));
}
