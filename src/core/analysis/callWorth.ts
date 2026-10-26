// What each of the bench's live calls has been worth, measured: every call as it fired in the user's
// games, and from that exact spot the rest of the game played 30 times with it and without it, game
// for game on the same seeds (state/liveWorth.ts; scratch round/gameday/calls.mts, 2026-10-25: MIA,
// NYK, BOS, DEN, POR and UTA as the user, their first 8 games, 1,920 games and 5,067 calls, with the
// staff's switches on and with them off). A call is dropped only where it measured as a cost beyond
// its noise (shrunk toward even, then two standard errors below it: callCosts); one inside its noise
// is kept as a place to look, and the live staff measures it from the spot before it proposes it
// (ui/live/calls.ts). Taking every call as it fired, over 1,200 paired games with the
// switches on: −0.20 ± 0.24 points a game before (1.9 calls a game, the most frequent, "We're beating
// X: attack him", at −0.2 each, the coverage switches to Hedge at −1.3 to −1.6), +0.10 ± 0.12 after
// (0.2 calls a game, +1.5 each). A kept call shows its number; one the staff makes too rarely to have
// measured shows as the staff's read. Pure.

/** "+2.2", "−1.3" (a true minus), "0.0". */
const signed = (v: number, d = 1) => {
  const t = Math.abs(v).toFixed(d);
  return Number(t) === 0 ? t : `${v > 0 ? '+' : '−'}${t}`;
};

/** A call's measured worth when taken where it fires: points of the rest of the game's margin and of win chance, each with its standard error, over `n` calls. */
export interface CallWorth {
  pts: number;
  ptsSe: number;
  win: number;
  winSe: number;
  n: number;
  /** The one the call is judged by: the margin, or (late in a game, where a point of margin isn't the question) the win chance. */
  by: 'pts' | 'win';
}

/** Calls measured fewer times than this read as the staff's read: there's no number to show. */
export const CALL_MIN_N = 10;

const w = (pts: number, ptsSe: number, win: number, winSe: number, n: number, by: 'pts' | 'win' = 'pts'): CallWorth => ({ pts, ptsSe, win, winSe, n, by });

/**
 * The calls as measured, by call (see callKey). Kept (even or better): the counters to Drop when their
 * roll man punishes a hedge (+2.2 a game, 7 points of win chance) or their switch hunting works, the
 * post double, a timeout to stop a run (even) and the late fouls (+1.4 points of win chance down late,
 * judged by the result: fouling costs a little margin by design). Dropped: attacking the defender
 * we're beating, leaning into or away from our own play types, the switches to Hedge off Drop, staying
 * home on spot-ups and sprinting back off a hot transition game, resting the starters in a decided game
 * with the coach's switch for it off (2.3 points of margin in 396 blowouts, never a result: his starters
 * are his call), and (with the staff making the subs) sitting a player with five fouls or a gassed
 * closer in a close fourth quarter: the staff's own crunch-time rule plays through both, and the
 * measurement agrees with it.
 */
export const CALL_WORTH: Record<string, CallWorth> = {
  'imp-hedge_roll:o>Go to Drop': w(2.2, 0.19, 0.074, 0.008, 203),
  'imp-switch_mismatch:o>Go to Drop': w(0.4, 0.17, -0.003, 0.008, 85),
  'pt-post>Double the post': w(0.3, 0.17, 0.02, 0.015, 28),
  run: w(0.0, 0.05, -0.002, 0.002, 900),
  lateFoul: w(-0.3, 0.02, 0.014, 0.002, 190, 'win'),
  lateUp3: w(0.0, 0.02, 0.004, 0.003, 66, 'win'),
  // (dropped: measured below even)
  garbage: w(-2.3, 0.08, 0, 0, 396),
  hunt: w(-0.2, 0.04, -0.006, 0.002, 1790),
  work: w(-0.1, 0.08, -0.003, 0.005, 158),
  cold: w(-0.1, 0.13, -0.007, 0.009, 73),
  'imp-drop_pullup:o>Switch to Hedge': w(-1.6, 0.17, -0.048, 0.009, 121),
  'pt-pnrBH>Switch to Hedge': w(-1.3, 0.27, -0.041, 0.012, 52),
  'pt-spotup>Stay home': w(-0.5, 0.47, -0.014, 0.03, 14),
  'pt-transition>Sprint back': w(-0.1, 0.25, 0, 0.017, 13),
  tired: w(-0.1, 0.03, -0.005, 0.003, 666, 'win'),
  fouls5: w(-0.2, 0.04, -0.013, 0.004, 492, 'win'),
};

/**
 * Which call a note or alert is, for its measurement: its kind (`hunt-12` is `hunt`, a fifth foul's
 * `fouls-12-5` is `fouls5`, `late-foul-4` is `lateFoul`), and for a counter to a tactical edge or a
 * hot play type, which edge and which counter (`imp-hedge_roll:o>Go to Drop`; a period report's
 * deciding edge `f-hedge_roll:o` is the same call). `manual`: you make the subs, and a sub call is
 * information you need, not one the staff would make for you (it isn't measured: the staff's read).
 */
export function callKey(id: string, label: string | undefined, manual = false): string {
  if (id.startsWith('fouls-')) return manual ? 'fouls-manual' : id.endsWith('-5') ? 'fouls5' : 'fouls';
  if (id.startsWith('tired-')) return manual ? 'tired-manual' : 'tired';
  if (id.startsWith('late-foul')) return 'lateFoul';
  if (id.startsWith('late-up3')) return 'lateUp3';
  const stem = id.startsWith('f-') ? `imp-${id.slice(2)}` : id;
  if (stem.startsWith('imp-') || stem.startsWith('pt-')) return `${stem}>${label ?? ''}`;
  return id.split('-')[0];
}

/** A call's measurement, when it has one worth reading (CALL_MIN_N calls or more). */
export function callWorth(key: string): CallWorth | undefined {
  const m = CALL_WORTH[key];
  return m && m.n >= CALL_MIN_N ? m : undefined;
}

/**
 * How far the calls' true worth spreads either side of even, in points of margin a call (and in win
 * chance, for the ones judged by it): what a reading is shrunk toward even by before it's believed.
 */
export const CALL_WORTH_SPREAD = { pts: 1.0, win: 0.03 };

/** A call's reading (by what it's judged by) shrunk toward even by the share of it that can be noise, with its standard error. */
export function callShrunk(m: CallWorth): { v: number; se: number } {
  const [v, se, s] = m.by === 'win' ? [m.win, m.winSe, CALL_WORTH_SPREAD.win] : [m.pts, m.ptsSe, CALL_WORTH_SPREAD.pts];
  return { v: (v * s ** 2) / (s ** 2 + se ** 2), se };
}

/**
 * Whether a call measured as a cost where it fires: its reading, shrunk toward even by its noise, is
 * below even by more than two standard errors (the staff no longer makes it). A reading below even but
 * inside its noise ("Stay home" at −0.5 ± 0.47 on 14 calls) isn't a cost: it's too close to say, and
 * the staff still looks there (the live staff measures it from the spot before it says anything).
 */
export function callCosts(key: string): boolean {
  const m = callWorth(key);
  if (!m) return false;
  const { v, se } = callShrunk(m);
  return v < 0 && -v >= 2 * se;
}

/**
 * Whether a call's reading is below even at all, noise or not: the debrief's "Next time" one-tap is
 * offered only for a fix that hasn't measured as a loss (a bench look inside its noise is measured from
 * the spot live; a one-tap for next game isn't).
 */
export function callBelowEven(key: string): boolean {
  const m = callWorth(key);
  if (!m) return false;
  return m.by === 'win' ? m.win < 0 : m.pts < 0;
}

/**
 * A kept call's number, in a few words: "Worth +2.2 a game where we've made it", "+1.4% to win",
 * "About even when measured" (inside two standard errors of even); the staff's read with none.
 */
export function worthLine(key: string): string {
  const m = callWorth(key);
  if (!m) return "The staff's read: not measured yet";
  const [v, se] = m.by === 'win' ? [m.win * 100, m.winSe * 100] : [m.pts, m.ptsSe];
  if (Math.abs(v) < 2 * se) return 'Measured: about even where we make it';
  return m.by === 'win' ? `Measured: ${signed(v, 1)}% to win where we make it` : `Measured: worth ${signed(v, 1)} a game where we make it`;
}
