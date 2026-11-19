// What the live game sounds like, decided here: the court's own beats (each frame of a possession as
// the floor reaches it, live/choreo.ts) turned into the ball, the rim, the net, the whistle and the
// crowd's answer, and the night's bigger turns (a period's horn, a run, the final) into the
// building's. The sounds themselves are ui/sound.ts's; nothing here decides anything about the game.
// The crowd is the home side's: it cheers its own baskets and groans at the visitors'.
import type { Act, Frame, Script } from './choreo';
import { crowd, sfx } from '../sound';

const ON_BALL: ReadonlySet<Act> = new Set<Act>(['dribble', 'drive']);

/** Timers for the bounces of the move now being played (a new beat, a pause or a skip clears them). */
let pending: ReturnType<typeof setTimeout>[] = [];

export function hushMoves() {
  pending.forEach(clearTimeout);
  pending = [];
}

const later = (ms: number, fn: () => void) => void pending.push(setTimeout(fn, ms));

/** The points a frame put on the board (0: none), from the score before it. */
function pointsAt(frames: Frame[], i: number): number {
  const now = frames[i].score;
  if (!now) return 0;
  for (let j = i - 1; j >= 0; j--) {
    const was = frames[j].score;
    if (was) return now[0] + now[1] - was[0] - was[1];
  }
  return 0;
}

/**
 * The court has reached frame `i` of `script`: what it sounds like, and the bounces of the move that
 * starts here. `speed` is the pace the floor is played at (1 = real time); `stakes` 0..1 lifts the
 * crowd's answer (clutch time, a loud building).
 */
export function beatSound(script: Script, i: number, speed: number, stakes: number) {
  hushMoves();
  const f = script.frames[i];
  if (!f) return;
  const home = script.off === 0;
  const n = script.oPids.length;
  const acts = f.act;
  const big = 1 + stakes * 0.6;

  // ---- what just happened
  if (f.swat !== undefined) {
    sfx('block');
    // (the defense's block: the home side's lifts the building, the visitors' draws a groan)
    sfx(home ? 'groan' : 'ooh', home ? 0.7 : big, 0.05);
  } else if (f.fx === 'make') {
    const dunk = acts.slice(0, n).includes('dunk');
    const ft = acts.slice(0, n).includes('ft');
    const pts = pointsAt(script.frames, i);
    if (dunk) sfx('dunk');
    else {
      if (acts.slice(0, n).includes('layup')) sfx('board', 0.5);
      sfx('swish', ft ? 0.7 : 1, 0.02);
    }
    if (!ft) {
      if (home) sfx(dunk || pts >= 3 ? (stakes > 0.6 ? 'roar' : 'cheer') : 'cheer', (dunk || pts >= 3 ? 1 : 0.55) * big, 0.12);
      else if (dunk || pts >= 3) sfx('groan', 0.8, 0.15);
    }
  } else if (f.fx === 'miss') {
    sfx('rim');
    if (acts.slice(0, n).includes('dunk')) sfx('ooh', 1, 0.05);
  }
  if (f.foul !== undefined) sfx('whistle', 1, 0.04);
  const flash = f.flash;
  if (flash?.kind === 'to') {
    if (flash.text === 'Steal') sfx(home ? 'groan' : 'ooh', home ? 0.7 : big, 0.05);
    // (a dead-ball turnover is a whistle: out of bounds, a travel, three seconds)
    else sfx('whistle', 0.8);
  } else if (flash?.kind === 'info' && flash.text.startsWith('Timeout')) sfx('whistle');

  // ---- the move that starts here: the dribble's bounces and a sneaker now and then
  const next = script.frames[i + 1];
  if (!next || speed > 2.4) return;
  const ms = next.dur / Math.max(0.25, speed);
  const offense = next.act.slice(0, n);
  if (offense.some((a) => ON_BALL.has(a))) {
    const drive = offense.includes('drive');
    // a dribble every 0.4 s or so (quicker attacking the basket), the first just after the move starts
    const gap = drive ? 300 : 410;
    for (let t = 140; t < ms - 60; t += gap) later(t, () => sfx('bounce', drive ? 0.9 : 0.7));
    if (drive && ms > 260) later(ms * 0.55, () => sfx('squeak'));
  } else if (i % 3 === 0 && ms > 300 && next.act.includes('move')) later(ms * 0.4, () => sfx('squeak', 0.7));
}

/**
 * The building around the game: the crowd's murmur at `level` 0 (hushed) .. 4 (on its feet), a notch
 * up in clutch time. `null` when no game is on.
 */
export function buildingSound(level: number | null, clutch = false) {
  crowd(level === null ? null : Math.min(1, level / 4 + (clutch ? 0.15 : 0)));
}
