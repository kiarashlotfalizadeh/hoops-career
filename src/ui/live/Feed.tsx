import { memo, useState } from 'react';
import type { PbpEntry } from '../../core/types';
import { fmtClock, pbpOpacity, periodLabel } from '../stats';
import { Segmented } from '../components/ui';

/**
 * The Clipboard's Play-by-play tab, newest first: everything, the scoring plays (with the period and
 * timeout lines that frame them), or one team's. It only re-renders when new lines arrive, not on
 * every animation frame.
 */
export const Feed = memo(function Feed({
  feed,
  colors,
  homeAbbrev,
  awayAbbrev,
}: {
  feed: { i: number; e: PbpEntry }[];
  colors: [[string, string], [string, string]];
  homeAbbrev: string;
  awayAbbrev: string;
}) {
  const [only, setOnly] = useState<'all' | 'score' | '0' | '1'>('all');
  const shown = feed.filter(({ e }) =>
    only === 'all' ? true : only === 'score' ? e.kind === 'make' || e.kind === 'ft' || e.kind === 'period' || e.kind === 'timeout' : e.t === +only || e.kind === 'period',
  );
  return (
    <div className="fd">
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
      <div className="fd-list" role="log" aria-label="Play-by-play">
        {shown.length === 0 && <div className="small dim fd-row">Nothing yet.</div>}
        {shown.map(({ i, e }) => (
          <div key={i} className={`fd-row${e.kind === 'period' || e.kind === 'timeout' ? ' strong' : ''}`} style={{ opacity: pbpOpacity(e.kind) }}>
            <span className="fd-when num">
              {periodLabel(e.q)} {fmtClock(e.clock)}
            </span>
            <span className="fd-team" style={{ background: e.t === -1 ? 'transparent' : colors[e.t][0] }} />
            <span className="grow">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
