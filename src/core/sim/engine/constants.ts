// The engine's tuning constants (K): shooting by zone, the base rates of turnovers, fouls, boards and
// run-outs, time, fatigue and injuries, and the size of every tactical edge (coverages, zones and junk
// defenses, pressure, the press, deny and double, guarding instructions, hunting, the late-game fouls),
// each with what it is and how it was sized; the tactical leverage those edges are played at
// (K.tacticEdge, with lev and the helpers after K that apply it); and the diagnostics the
// calibration scripts read.

import type { DefScheme, ShotZone } from '../../types';

export const K = {
  zoneBase: { rim: 0.638, paint: 0.458, mid: 0.42, c3: 0.383, ab3: 0.346 } as Record<ShotZone, number>,
  zoneSkill: { rim: 0.15, paint: 0.13, mid: 0.13, c3: 0.1, ab3: 0.1 } as Record<ShotZone, number>,
  zoneOpen: { rim: 0.1, paint: 0.07, mid: 0.055, c3: 0.06, ab3: 0.06 } as Record<ShotZone, number>,
  foulRate: { rim: 0.208, paint: 0.106, mid: 0.041, c3: 0.014, ab3: 0.016 } as Record<ShotZone, number>,
  /** Share of misses that are blocks, for an average contesting defender. */
  blockMiss: { rim: 0.24, paint: 0.154, mid: 0.04, c3: 0.0165, ab3: 0.0165 } as Record<ShotZone, number>,
  /** Extra share of misses blocked by the shooter's own defender (from behind, on the contest). */
  chaseBlock: { rim: 0.06, paint: 0.048, mid: 0.026, c3: 0.01, ab3: 0.01 } as Record<ShotZone, number>,
  orbBase: 0.262,
  toBase: 0.15,
  nonShootFoul: 0.18,
  /** Share of rebounds credited to the team rather than a player (NBA box scores leave these out). */
  teamReb: { orb: 0.02, drb: 0.07 },
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
  /** Usage damping counts free-throw attempts (0.44 each); fitted when it counted trips, hence the odd values. */
  usageDamp: 5.2,
  freedomGreen: 1.25,
  freedomLimited: 0.55,
  /** How strongly usage tendency tilts an actor's shoot-vs-pass choice. */
  selfShotExp: 0.6,
  /** Share of a team's actions one player can run before the ball starts finding others. */
  actCap: 0.68,
  /** Assist share of teammates' baskets past which a passer starts looking for his own shot. */
  astCap: 0.45,
  /** Star plan "deny": his share of actions, the advantage he loses catching it late and further out, extra drain on his defender. */
  denyTouch: 0.62,
  denyCatch: 0.3,
  denyDrain: 1.3,
  /** A junk defense's chaser, with a zone behind him, denies harder than a man-to-man deny: his man's share of actions, and the advantage he loses on the catch. */
  chaseTouch: 0.4,
  chaseCatch: 0.45,
  /** ...and the usage share past which the defense loads up on him comes this much sooner (see usageWeight). */
  chaseCap: 0.14,
  /** Run-outs against a team that crashed the glass: chance multiplier per unit of crash above 50, and the runners' edge. */
  crashLeak: 1.5,
  crashRunOut: 0.5,
  /** Expected points of one unit of transition advantage, for impact tags (see runOutPts). */
  transAdvPts: 0.05,
  /** Diminishing returns on crashing past 50: offensive-board rate given back at 100. */
  crashFade: 0.11,
  /** Share of offensive boards given up at full transition-D sprint back. */
  getBackOrb: 0.08,
  /** Game-to-game conditions shared by both teams (SDs): tempo, field-goal percentage, foul calls. */
  envPace: 0.035,
  envShoot: 0.012,
  envFouls: 0.08,
  /** Score effects: past this second-half margin the leader eases off and the trailer plays
   * loose, up to this much field-goal percentage either way, reached this many points later. */
  easeFrom: 8,
  ease: 0.058,
  easeSpan: 12,
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
  pressTO: 0.06,
  /** Blitz: trap turnover rate for an average trap and handler, and the 4-on-3's openness behind it. */
  blitzTO: 0.045,
  blitz4v3: 0.65,
  /** Field-goal percentage a fully physical defense takes off every shot. */
  physContest: 0.01,
  /** Points per switched pick-and-roll the switch takes away (the screen's advantage). */
  switchScreen: 0.04,
  /**
   * Handler's blow-by edge per unit of ball pressure, and the extra edge at full pressure; and the
   * edge at which its tag counts a unit of it at half of K.advPts (see blowByTag).
   */
  blowBy: 0.15,
  blowByConvex: 0.8,
  blowBySat: 2,
  /** Expected points of one unit of handler advantage per action, for impact tags. */
  advPts: { pnr: 0.04, handoff: 0.04, iso: 0.04, post: 0.04 },
  /**
   * Expected points swung by an offensive board, a turnover, and a run-out over a half-court trip, for
   * impact tags. A run-out is worth less than it looks: the extra run-outs crashing gives up cost
   * about 0.15 points each in the final margin (paired runs with and without the leak, at 1x and
   * 2x), where the boards, turnovers and open looks the tags count show about 0.6 of their tagged
   * points in the margin (leads ease off), so a run-out tags 0.18 and the runners' edge 0.05 a unit.
   */
  orbPts: 1.6,
  toPts: 1.45,
  runOutPts: 0.18,
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
  switchHuntFrom: 0.3,
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
   * but leave the paint, the post, cutters and the glass softer.
   */
  zone: {
    zone23: {
      roll: 0.3,
      pnr: 0.3,
      pnrTag: 0.3 * 0.1,
      iso: 0.35,
      isoTag: 0.035,
      post: 0.55,
      postTag: 0.055,
      drive: 0.3,
      kick: 0.2,
      pop: 0.15,
      handoff: 0.1,
      cutW: 0.25,
      cut: 0.2,
      swingW: 1.35,
      swing: 0.22,
      corner: 0.45,
      glass: 1.07,
      glassTag: 0.07,
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
      kick: -0.6,
      pop: -0.4,
      handoff: -0.5,
      cutW: 0.2,
      cut: 0.06,
      swingW: 1.5,
      swing: -0.6,
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
   * Top-locking a player off the ball, by a junk defense's chaser or a "tight" instruction (on top
   * of the deny's fewer touches and late catches for a chased player): his weight as a kick-out
   * target, the openness taken off his catch-and-shoot threes, the edge lost coming off screens and
   * handoffs, and what a defender caught high gives back on his drives on the catch, his curls and
   * his back-cuts (the openness, and his cut weight multiplier).
   */
  lock: {
    box: { kickW: 0.45, c3: 0.4, offScreen: 0.3, beat: 0.3, cutW: 1.6 },
    tight: { kickW: 0.6, c3: 0.3, offScreen: 0.25, beat: 0.3, cutW: 1.4 },
  },
  /**
   * Scouting-report instructions on one player: going under screens on him (openness his pull-ups
   * gain, the edge his drives off the screen lose, the roll and pop openness the screener's defender
   * takes away by staying home); sagging off him (rim openness taken off teammates' drives, cuts and
   * rolls while he's off the ball, openness his own catch-and-shoot looks gain); getting physical
   * with him (the edge his post-ups and drives lose, and his shooting and reach-in fouls drawn).
   */
  pd: {
    under: { pull: 0.4, drive: 0.5, roll: 0.25 },
    sag: { help: 0.2, kick: 0.6 },
    body: { post: 0.35, drive: 0.25, foul: 1.35 },
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
   * help, ball pressure and physicality, the press, deny and double, the guarding instructions,
   * hunting, sets and the defense's reads of them, crashing the glass and getting back. Where twice
   * the edge would have made a blind extreme a win against average personnel, its cost grows with
   * the leverage too (tradeOff); a guarding instruction's give-back grows a little less (giftExp);
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
  tradeOff: { pressure: 0.45, blitz: 0.6, crash: 1.5, sec: { avg: 55, open: 20, to: 70 } },
  /**
   * Ball pressure under 50: the share of the turnover rate's swing a containing defense gives up
   * (above 50 an average lineup, ST.pressQ 50, forces half of it). At the full swing, dropping from 50
   * to 20 cost more than a third of the turnovers it forced and about 3.5 points per 100 against
   * every kind of offense (paired sweeps against each team's own setting): a trap, not a trade.
   */
  containTO: 0.35,
  /**
   * The share of a defender's turnovers that are his steals, against the action's own (stealBy): the
   * turnovers containing gives back are mostly live balls, so steals ran about 6% over the league's
   * 8.2 with turnovers on its 13.9.
   */
  stealShare: 0.94,
  /**
   * A guarding instruction's give-back on the player it names (the open catch a sag leaves him, the
   * room going under gives his pull-ups, the drives and back-cuts a top-lock gives up, the fouls
   * getting physical sends him to the line for) grows as the leverage to this power, about 1.6
   * times at 2x. The offense takes more of a bigger gift, and each one is better, so its cost
   * compounds: at the full leverage it grew several times what the instruction's take-away saved.
   */
  giftExp: 0.65,
  /**
   * Past 1x leverage the doubled edges move the league's averages a little (the coverages AI coaches
   * play leave more pull-ups and kick-outs and fewer drives, and most of them crash less and get back
   * more than 50), so these base rates move back by this share per unit of leverage past 1, keeping
   * AI-vs-AI games on their 2025-26 averages: the offense's taste for threes, shooting fouls,
   * offensive boards, turnovers and blocks. (Turnovers moved back down when backing off the ball
   * stopped giving up the full swing of them, K.containTO: most AI defenses play under 50.)
   */
  recenter: { three: -0.1, foul: 0.053, orb: 0.057, tov: -0.005, blk: 0.06 },
};

/** A tactical edge (openness, advantage, a rate) at the game's tactical leverage: `x` is its 1x size. */
/** The share of free throws a player makes, from his FT rating (the Plan tab's Hack-a-player reads it too). */
export const ftChance = (ft: number) => Math.min(0.95, Math.max(0.3, 0.42 + 0.0052 * ft));

export const lev = (x: number) => x * K.tacticEdge;
/** A tactical multiplier (a weight or a rate factor) at the game's tactical leverage: 1.8 at 1x is 1.8² at 2x. */
export const levW = (m: number) => m ** K.tacticEdge;
/** The part of a tactical edge past its 1x size, for an edge that comes from a matchup rather than a number: 0 at 1x. */
export const levExtra = (x: number) => x * (K.tacticEdge - 1);
/** A guarding instruction's give-back at the game's tactical leverage (see K.giftExp); a multiplier with `w`. */
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
