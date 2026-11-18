// A hand-off, as one thing two men do. No three.js here.
//
// A ball changes hands only where hands are. So a hand-off is not two clips on two clocks that are hoped to agree (the
// giver's opening his hands at his clip's moment, the taker's closing at his, the ball drawn across between them by a
// third): it is one exchange, and it goes on by what has happened, not by what time it is.
//
//   offer   the giver holds it out between the two of them, toward where the man coming by will be as he gets to it;
//           the taker's hands are out for it from his run in. As he gets there the giver puts it in his pocket: in by
//           his near hip, a place that goes with the taker. A man running by a ball held still has it in reach for a
//           tenth of a second, and at 4x that is less than a frame; a ball put in his pocket is in front of his hands
//           for as long as the giver's arms can follow him, which is how a hand-off is given to a man at a run.
//           "Goes with the taker" is meant exactly: the ball is `meshed` of the way from the giver's hold to the pocket,
//           and the pocket is a place on the taker as he is drawn this frame. It is not a point in the giver's frame
//           sent after him (played at 4x a man goes a foot a drawn frame, more than a hand or a held ball is let move
//           in one, so neither the ball nor the hands after it ever caught him up)
//   both    the taker's hands are on it, as they are drawn, in the giver's: four hands on one ball, for a beat that is
//           at least a drawn frame at any speed the game is played at
//   taken   only then is it his: it goes on with his hands, and only now do the giver's open and come off it
//
// The plan says when it should change hands (HANDOFF_AT through its move); the exchange keeps to that when the bodies
// do. When they don't (played at 4x a move is a dozen frames, and a man moved round another is not where the plan had
// him), both men's moves wait at that moment, the ball in the giver's hands at the taker's hip, until hands are on it.
// It is never the taker's while his hands are not on it, never let go of before they are, and so never in the air.

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (u: number) => u * u * (3 - 2 * u);

/**
 * The taker shows his hands from REACH_FROM ms of the play before the plan's moment and has them all the way out to
 * the ball by REACH_BY before it; the giver has it held out to him from OFFER_FROM to OFFER_BY. It can change hands
 * from OPEN_MS before the plan's moment (hands that get there early take it early: nobody waits with four hands on it
 * for a clock).
 */
const REACH_FROM = 330;
const REACH_BY = 110;
const OFFER_FROM = 360;
const OFFER_BY = 150;
const OPEN_MS = 100;
/**
 * And not before the giver has had it in his own hands for HAD_MS (the bodies' ms): a pass caught as the man runs by is
 * brought to where it is held out first; taken out of the hands that are still catching it, those arms were through him.
 */
const HAD_MS = 150;
/** The giver takes it from where he holds it out to the taker's pocket from MESH_FROM ms of the play before the plan's moment, all the way there by MESH_BY. */
const MESH_FROM = 150;
const MESH_BY = 20;
/** ...and over no fewer than MESH_FRAMES drawn frames, however late he got it or fast the game is played: it is carried there, not put there. */
const MESH_FRAMES = 3;
/**
 * The taker's hands are on it once his hold of it (Puppet.holds, 0..1: how far his hands have got to it) is ON or
 * more and that hold is within GAP_ON ft of where the ball is (on the 6 ft 6 puppet); they are off it again under OFF.
 */
const ON = 0.72;
const OFF = 0.4;
const GAP_ON = 0.32;
/** The taker is kept in reach of the giver from this long (the play's ms) before the plan's moment: see Exchange.keep. */
const HOLD_FROM = 110;
/** Both men have it for BOTH_MS (the bodies' ms) and BOTH_FRAMES drawn frames after the one their hands met in, at the least. */
const BOTH_MS = 50;
const BOTH_FRAMES = 1;
/** The giver's hands come off it over RELEASE_MS (the bodies' ms) once it is the taker's, not before RELEASE_HELD of it, and in no fewer than RELEASE_FRAMES drawn frames. */
const RELEASE_MS = 130;
const RELEASE_HELD = 0.25;
const RELEASE_FRAMES = 2;
/** An exchange first seen this long (the play's ms) past its moment is one picked up in the middle: it is the taker's. */
const MISSED_MS = 90;
/**
 * Where it is held out: on the line from the giver to where the taker will be as it changes hands, TAKE_IN ft from the
 * taker's middle, no farther from the giver's than OFFER_MOST nor nearer than OFFER_LEAST. The taker's pocket: POCKET_SIDE
 * ft to the giver's side of him (as far toward it as the giver's arms go: his hands are on it, and it is where they
 * are). OFFER_Y ft up. All on the 6 ft 6 puppet (each scaled by its own man).
 */
const TAKE_IN = 1.3;
const OFFER_LEAST = 0.95;
const OFFER_MOST = 1.45;
const OFFER_Y = 4.0;
export const POCKET_SIDE = 1.2;

export type Phase = 'offer' | 'both' | 'taken';

export class Exchange {
  phase: Phase = 'offer';
  /** It became the taker's with his hands not on it: the move ran out first (never, if the rest is right: the lab counts it). */
  forced = false;
  /** How long both have had it (the bodies' ms), and drawn frames since the one their hands met in. */
  private bothMs = 0;
  private bothFrames = 0;
  /** How long it has been the taker's: the play's ms, the bodies', and drawn frames. */
  private since = 0;
  private let = 0;
  private letFrames = 0;

  /**
   * `tx`: the play's ms until the plan has it change hands (negative: past it), when this exchange is first seen. One
   * picked up well past its moment (a replay cut into the middle of it) is already the taker's.
   */
  constructor(tx: number) {
    if (tx < -MISSED_MS) {
      this.m = 1;
      this.phase = 'taken';
      this.since = -tx;
      this.let = RELEASE_MS;
      this.letFrames = RELEASE_FRAMES;
    }
  }

  get taken(): boolean {
    return this.phase === 'taken';
  }

  /** How far the taker's hands are out to the ball (0..1), `tx` ms of the play before the plan's moment. */
  reach(tx: number): number {
    return this.phase !== 'offer' ? 1 : smooth(clamp((REACH_FROM - tx) / (REACH_FROM - REACH_BY), 0, 1));
  }

  /**
   * How far the taker is kept by the giver (0..1): from HOLD_FROM ms of the play before the plan's moment, in full at
   * it, until it is his. He runs in as the plan has him; he doesn't run out without it.
   */
  keep(tx: number): number {
    return this.phase === 'taken' ? 0 : smooth(clamp((HOLD_FROM - tx) / HOLD_FROM, 0, 1));
  }

  /** How far the giver has it held out for him (0..1). */
  offer(tx: number): number {
    return smooth(clamp((OFFER_FROM - tx) / (OFFER_FROM - OFFER_BY), 0, 1));
  }

  /** How far the giver would have it from where he held it out into the taker's pocket by now (0..1), by the plan's clock. */
  private mesh(tx: number): number {
    return smooth(clamp((MESH_FROM - tx) / (MESH_FROM - MESH_BY), 0, 1));
  }

  /** How far he has it there (0..1): by the plan's clock, once he has it, and no quicker than over MESH_FRAMES drawn frames. */
  get meshed(): number {
    return this.m;
  }
  private m = 0;

  /** The giver's hold of it (1 until it is the taker's, then let go of: see RELEASE_MS). */
  get grip(): number {
    if (this.phase !== 'taken') return 1;
    const u = clamp(Math.min((this.let - RELEASE_MS * RELEASE_HELD) / (RELEASE_MS * (1 - RELEASE_HELD)), this.letFrames / RELEASE_FRAMES), 0, 1);
    return 1 - smooth(u);
  }

  /**
   * Where each man's move is (ms: 0 as it changes hands): up to the plan's moment by the plan's clock, held there while
   * the hands are still getting to it, and on from there once it is taken.
   */
  tau(tx: number): number {
    return this.phase === 'taken' ? this.since : -Math.max(0, tx);
  }

  /** How long the giver has had it in his hands (the bodies' ms). */
  private had = 0;

  /**
   * A frame on: `dt` the play's ms, `own` the bodies'; `has`: the giver has it in his hands; `tx` the play's ms to the
   * plan's moment. Before the bodies are moved.
   */
  tick(dt: number, own: number, has: boolean, tx: number) {
    this.had = has ? this.had + own : 0;
    // (carried to the pocket only once it is in his own hands: see HAD_MS)
    if (dt > 0 || own > 0) this.m += clamp((this.had >= HAD_MS ? this.mesh(tx) : 0) - this.m, -1 / MESH_FRAMES, 1 / MESH_FRAMES);
    if (this.phase !== 'taken') return;
    this.since += dt;
    this.let += own;
    this.letFrames++;
  }

  /**
   * Both men's arms are drawn: `sure`, the taker's hold of it (Puppet.holds), and `gap`, how far that hold is off the
   * ball (ft, on the 6 ft 6 puppet). `tx` as above, `own` the bodies' ms this frame, `last`: the move is over (it is his
   * now whatever). Says whether it became the taker's this frame.
   */
  touch(tx: number, sure: number, gap: number, own: number, last: boolean): boolean {
    if (this.phase === 'taken') return false;
    const on = sure >= (this.phase === 'both' ? OFF : ON) && gap <= GAP_ON * (this.phase === 'both' ? 1.5 : 1);
    if (this.phase === 'offer') {
      if (on && tx <= OPEN_MS && this.had >= HAD_MS) {
        this.phase = 'both';
        this.bothMs = 0;
        this.bothFrames = 0;
      }
    } else if (!on) {
      // (his hands came off it again: it is still the giver's, held out)
      this.phase = 'offer';
    } else {
      this.bothMs += own;
      this.bothFrames++;
      if (this.bothMs >= BOTH_MS && this.bothFrames >= BOTH_FRAMES) return this.take(false);
    }
    return last ? this.take(this.phase !== 'both') : false;
  }

  private take(forced: boolean): boolean {
    this.phase = 'taken';
    this.forced = forced;
    this.since = 0;
    this.let = 0;
    this.letFrames = 0;
    return true;
  }
}

/**
 * Where the giver holds it out (into `out`, the scene's x and z, y up): from his middle (gx, gz; his size gs) toward
 * where the taker will be as it changes hands (ex, ez; his size ts). From there it is carried into the taker's pocket
 * (see Exchange.meshed), which is the scene's to place: it is a place on the taker.
 */
export function offerAt(gx: number, gz: number, gs: number, ex: number, ez: number, ts: number, out: { x: number; y: number; z: number }) {
  const dx = ex - gx;
  const dz = ez - gz;
  const far = Math.hypot(dx, dz) || 1;
  const r = clamp(far - TAKE_IN * ts, Math.min(OFFER_LEAST * gs, far * 0.5), OFFER_MOST * gs);
  out.x = gx + (dx / far) * r;
  out.z = gz + (dz / far) * r;
  out.y = OFFER_Y * (gs + ts) * 0.5;
  return out;
}
