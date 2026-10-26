// What the night's moves were worth, measured once the final is in: the game from tip-off (the live
// game kept it) played on the same seed to the first move, and from there the rest of the night over
// and over with every move made where it was and without them (nightWorth in state/liveWorth.ts), in
// the worker behind any sim. The reading goes on the game's result (GameResult.movesWorth), so the
// report reads it rather than measuring it again; a game left before it's in keeps none.
import type { CoachMove, GameResult, LiveOp, MovesWorth } from '../../core/types';
import { edit } from '../../state/actions';
import { useStore } from '../../state/store';
import { measureNight } from '../../state/simClient';
import type { LiveGame, LiveMark } from '../../state/live';

/** The report's move (res.moves) that a journaled op is part of: the last one of its kind made at or before it (moves made together are one). */
export function moveOf(moves: CoachMove[], mark: Pick<LiveMark, 'op' | 'q' | 'clock'>): CoachMove | undefined {
  const t = (q: number, clock: number) => q * 10000 - clock;
  const at = t(mark.q, Math.round(mark.clock));
  return [...moves].reverse().find((m) => m.kind === mark.op.op && t(m.q, m.clock) <= at);
}

/** The games whose moves are being measured now (this session): the report says so until the reading is in. */
const measuring = new Set<number>();
export const measuringNight = (gid: number) => measuring.has(gid);

/** Measure `lg`'s moves (it's recorded: its result is lg.committed) and keep the reading on its result. */
export function measureTonight(lg: LiveGame) {
  const res: GameResult | null = lg.committed;
  const ops: LiveOp[] = lg.journal.ops;
  if (!res || !ops.length || res.movesWorth) return;
  const league = lg.league;
  measuring.add(res.gid);
  void measureNight(lg.tip, lg.userSide, ops)
    .finally(() => measuring.delete(res.gid))
    .then((w) => {
      if (!w) return;
      const op = w.top ? ops[w.top.op] : undefined;
      const mark = op && lg.marks.find((m) => m.op === op);
      const move = mark && res.moves ? moveOf(res.moves, mark) : undefined;
      const worth: MovesWorth = {
        pts: w.pts,
        raw: w.raw,
        se: w.se,
        win: w.win,
        winSe: w.winSe,
        n: w.n,
        moves: w.moves,
        ...(w.top && move && { top: { text: move.text, pts: w.top.pts, se: w.top.se } }),
      };
      // (only into the league it was played in, while it's the one open)
      if (useStore.getState().league !== league) return;
      edit((l) => {
        const g = l.games.find((x) => x.gid === res.gid);
        if (g) g.movesWorth = worth;
      });
    })
    .catch((e: unknown) => console.warn("The night's moves could not be measured:", e));
}
