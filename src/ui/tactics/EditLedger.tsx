// "Since you changed it" (Tactics → Analysis → Report) and the bar the staff's measuring takes on
// Tactics after Done. A change shows what it moved and, as a verdict and one number, what it measured:
// as it was made over the next few games, then, once CHECK_AFTER games have been played, on them
// ("Helps", "Hurts" with a tap to put it back, or "No real change"). Every number on it is a
// measurement (paired games with and without the change, see core/ai/tacticEdits.ts), never the record.
import { X } from 'lucide-react';
import type { League, TacticEdit } from '../../core/types';
import { CHECK_AFTER, editCall, editsOf, playedSince, verdictWord } from '../../core/ai/tacticEdits';
import { plural } from '../../core/format';
import { fmtDate } from '../../core/league/helpers';
import { Help, Section } from '../components/ui';
import { signed } from '../stats';
import { putBackEdit, stopMeasuring, useEditWatch } from './editWatch';

/** Rows shown: the newest changes. */
const SHOWN = 3;

const toneOf = (w: { pts: number } | undefined) => {
  const c = editCall(w);
  return c === 'gain' ? 'good' : c === 'cost' ? 'bad' : '';
};

/** While the staff measures a change the user just made: how far it has got, and a way to stop it. */
export function EditMeasureBar() {
  const { running } = useEditWatch();
  if (!running || running.kind !== 'made') return null;
  return (
    <div className="dockbar tx-dock" role="status" aria-label="The staff is measuring your change">
      <span className="grow tx-dock-l">Measuring your change · {Math.round(running.progress * 100)}%</span>
      <button className="btn sm ghost" aria-label="Stop measuring" onClick={stopMeasuring}>
        <X size={16} />
      </button>
    </div>
  );
}

/** A change's line under its name: when, the verdict, and where it stands. */
function metaOf(e: TacticEdit, league: League, measuring: boolean): string {
  const when = fmtDate(e.season, e.day);
  if (measuring) return `${when} · Measuring…`;
  const w = e.check ?? e.worth;
  if (!w) return `${when} · ${e.closed ? 'Not measured' : 'Measured when you next open Team'}`;
  const verdict = verdictWord(w);
  if (e.closed === 'reverted') return `${when} · ${verdict} · put back${e.closedDay === undefined ? '' : ` ${fmtDate(e.season, e.closedDay)}`}`;
  if (e.check) return `${when} · ${verdict} over ${plural(e.check.games, 'game')}`;
  const left = Math.max(0, CHECK_AFTER - playedSince(league, e).length);
  return `${when} · ${verdict}${e.closed ? '' : ` · check in ${plural(left, 'game')}`}`;
}

function EditRow({ e, league, measuring }: { e: TacticEdit; league: League; measuring: boolean }) {
  // the latest measurement leads: the check once there is one
  const w = e.check ?? e.worth;
  const back = !!e.check && editCall(e.check) === 'cost' && !e.closed;
  return (
    <div className="listrow tx-edrow">
      <span className="grow tx-swrow-m">
        <span className="lr-name ellipsis">{e.what}</span>
        <span className={`lr-meta tx-edmeta ${e.check ? toneOf(e.check) : ''}`}>{metaOf(e, league, measuring)}</span>
      </span>
      {w && !measuring && (
        <span className={`tx-edv num ${toneOf(w)}`}>
          {signed(w.pts)}
          <span className="tiny dim">a game</span>
        </span>
      )}
      {back && (
        <button className="btn xs" onClick={() => putBackEdit(e)}>
          Put back
        </button>
      )}
    </div>
  );
}

/** The user's recent changes and what each measured: one block on the report. Nothing until the first change. */
export function SinceYouChanged({ league }: { league: League }) {
  const { running } = useEditWatch();
  const list = editsOf(league)
    .filter((e) => e.season === league.season)
    .slice(-SHOWN)
    .reverse();
  if (!list.length) return null;
  return (
    <Section
      title="Since you changed it"
      right={
        <Help title="Since you changed it">
          <p>The staff plays your next few games many times, with your change and without it. That says what it&apos;s worth a game.</p>
          <p>After {CHECK_AFTER} games they replay the games you played, both ways. A win-loss record can&apos;t tell you that.</p>
        </Help>
      }
    >
      <div className="card flush list">
        {list.map((e) => (
          <EditRow key={e.id} e={e} league={league} measuring={running?.id === e.id} />
        ))}
      </div>
    </Section>
  );
}
