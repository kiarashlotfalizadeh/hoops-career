// A possession's shot clock, as the court plays it. It is set to 24 as each possession starts, stops
// on a shot off the iron, and starts again from 14 when the offense keeps the ball (an offensive or a
// team rebound). It is off at the line, and once the game clock has less on it than the shot clock.
// Frames are read as the court reaches them, so nothing is known before it has been played. The
// building's boards (court3d/boards.ts) and the scorebug read it off the same stage, each with its own
// ShotClock, so the two always show the same number.
import type { Frame, Script } from './choreo';

/** A possession's shot clock, and what an offensive rebound off the iron sets it to. */
export const SHOT = 24;
export const SHOT_RESET = 14;
/** Under this many seconds the shot clock shows tenths, in the warning colour. */
export const SHOT_WARN = 5;

/** The shot clock: whole seconds, and tenths under five. */
export function shotText(s: number): string {
  return s >= SHOT_WARN ? String(Math.ceil(s - 1e-6)) : (Math.floor(s * 10) / 10).toFixed(1);
}

/** The shot clock of the possession being played, read frame by frame. */
export class ShotClock {
  /** A man at the line: from the walk there to his last shot landing. */
  line = false;
  private script: Script | null = null;
  private seen = 0;
  // the game clock it was last set at, what to, and where a shot off the iron stopped it
  private from = 0;
  private to = SHOT;
  private held: number | null = null;
  private walk = Infinity;

  /** Seconds on the shot clock with the court at frame `play.i` and the game clock at `play.clock`; null when it is off. */
  read(sc: Script, play: { i: number; clock: number }): number | null {
    if (sc !== this.script) {
      this.script = sc;
      this.seen = 0;
      this.from = sc.clockStart;
      this.to = SHOT;
      this.held = null;
      // (the walk to the line is the frame before his first shot from it)
      const ft = sc.frames.findIndex((f) => f.act.includes('ft'));
      this.walk = ft < 0 ? Infinity : ft - 1;
    }
    // (the frames before the move it is in have been reached)
    const reached = Math.min(play.i, sc.frames.length);
    for (; this.seen < reached; this.seen++) this.saw(sc.frames[this.seen], play.clock);
    this.line = play.i >= this.walk;
    const shot = Math.max(0, this.held ?? this.to - (this.from - play.clock));
    // (off at the line, and once the game clock has less on it than the shot clock)
    return this.line || play.clock < shot ? null : shot;
  }

  private saw(f: Frame, clock: number) {
    const text = f.flash?.text ?? '';
    // a shot off the iron stops the shot clock; the offense keeping the ball starts it again from 14
    if (f.fx) this.held = Math.max(0, this.to - (this.from - clock));
    if (text === 'Off. rebound' || text === 'Team rebound') {
      this.from = clock;
      this.to = SHOT_RESET;
      this.held = null;
    }
  }
}
