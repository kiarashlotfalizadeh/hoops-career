// The building's sound around a live game (the court's own beats are CourtView's, see gameSound.ts):
// the crowd's murmur at the night's level, the horn at a period's end and at the final, and the
// crowd's answer to a run or to clutch time arriving. A component so its effects start and stop with
// the game on screen; it draws nothing.
import { useEffect, useRef } from 'react';
import { sfx } from '../sound';
import { buildingSound, hushMoves } from './gameSound';

export function GameSound({
  level,
  clutch,
  atBreak,
  final,
  run,
}: {
  /** The crowd, 0 hushed .. 4 on its feet (atmosphere.ts's crowdLevel). */
  level: number;
  clutch: boolean;
  /** Stopped at a period's end. */
  atBreak: boolean;
  /** The final buzzer has gone: did the home side win it? (undefined while the game is on) */
  final?: boolean;
  /** The run on now: whose (the home side's?) and a key that changes with each new run. */
  run?: { home: boolean; key: string } | null;
}) {
  useEffect(() => {
    buildingSound(level, clutch);
  }, [level, clutch]);
  useEffect(
    () => () => {
      hushMoves();
      buildingSound(null);
    },
    [],
  );
  // (not on the way in: a game picked up at a break, or in clutch time, doesn't sound its horn again)
  const was = useRef({ atBreak, final, clutch, run: run?.key });
  useEffect(() => {
    const w = was.current;
    if (atBreak && !w.atBreak) sfx('horn');
    if (final !== undefined && w.final === undefined) {
      sfx('horn');
      sfx(final ? 'roar' : 'groan', 1, 0.5);
    }
    if (clutch && !w.clutch) sfx('cheer', 0.8);
    if (run && run.key !== w.run) sfx(run.home ? 'roar' : 'groan', run.home ? 0.9 : 1);
    was.current = { atBreak, final, clutch, run: run?.key };
  }, [atBreak, final, clutch, run]);
  return null;
}
