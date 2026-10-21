import { memo, useState } from 'react';
import type { PbpEntry } from '../../core/types';
import { gameTime } from '../../core/format';
import { pbpOpacity } from '../stats';
import { Segmented } from '../components/ui';
import { isClutch, type AtmoKind } from './atmosphere';

/** One line of the play-by-play: the sim's, in the night's voice when it has one, or a moment the night called. */
export interface FeedRow {
  key: string;
  e: PbpEntry;
  /** How big the call is: 0 routine .. 3 the biggest (a moment's row: its weight). */
  tier?: number;
  /** A moment the night called (a run, a lead change, clutch time, the crowd), with its kicker. */
  beat?: { kicker: string; kind: AtmoKind };
}

/**
 * The play-by-play under the console's Stats view, newest first, each line with the score after it (away-home, as
 * the scorebug reads): everything, the scoring plays (with the period and timeout lines that frame
 * them, and the runs and lead changes), or one team's. Bigger plays read bigger, routine trips calm;
 * clutch time's lines carry its edge. It only re-renders when new lines arrive, not on every animation frame.
 */
export const Feed = memo(function Feed({
  feed,
  colors,
  homeAbbrev,
  awayAbbrev,
}: {
  feed: FeedRow[];
  colors: [[string, string], [string, string]];
  homeAbbrev: string;
  awayAbbrev: string;
}) {
  const [only, setOnly] = useState<'all' | 'score' | '0' | '1'>('all');
  const shown = feed.filter(({ e, beat }) =>
    only === 'all'
      ? true
      : only === 'score'
        ? e.kind === 'make' || e.kind === 'ft' || e.kind === 'period' || e.kind === 'timeout' || (!!beat && beat.kind !== 'crowd')
        : e.t === +only || e.kind === 'period' || beat?.kind === 'clutch',
  );
  return (
    <div className="lv-fd">
      <Segmented
        value={only}
        onChange={setOnly}
        label="Show"
        options={[
          { id: 'all', label: 'All' },
          { id: 'score', label: 'Scoring' },
          { id: '1', label: awayAbbrev },
          { id: '0', label: homeAbbrev },
        ]}
      />
      <div className="lv-fd-list" role="log" aria-label="Play-by-play">
        {shown.length === 0 && <div className="small dim lv-fd-row">Nothing yet.</div>}
        {shown.map(({ key, e, tier, beat }) => {
          const clutch = isClutch(e.q, e.clock, e.hs - e.as);
          const cls = `lv-fd-row${e.kind === 'period' || e.kind === 'timeout' ? ' strong' : ''}${beat ? ` beat beat-${beat.kind}` : ''}${tier ? ` tier-${tier}` : ''}${clutch ? ' clutch' : ''}`;
          return (
            <div key={key} className={cls} style={beat || tier ? undefined : { opacity: pbpOpacity(e.kind) }}>
              <span className="lv-fd-when num">{gameTime(e.q, e.clock)}</span>
              <span className="lv-fd-team" style={{ background: e.t === -1 ? 'transparent' : colors[e.t][0] }} />
              <span className="grow">
                {beat && <span className="lv-fd-k">{beat.kicker}</span>}
                {e.text}
              </span>
              <span className="lv-fd-sc num">
                {e.as}-{e.hs}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
