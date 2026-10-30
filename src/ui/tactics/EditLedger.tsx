// "Since you changed it" (Tactics → Analysis → Report) and the bar the staff's measuring takes on
// Tactics after Done. A change shows what it moved and what the staff makes of it in words: as it was
// made, then again once CHECK_AFTER games have been played ("Seems to help", "Seems to hurt" with a tap
// to put it back, or "No clear change"). The reading behind the words stays under the hood (paired
// games with and without the change, see core/ai/tacticEdits.ts).
import { X } from 'lucide-react';
import type { League, TacticEdit } from '../../core/types';
import { CHECK_AFTER, editCall, editsOf, playedSince } from '../../core/ai/tacticEdits';
import { SINCE, leanTone } from '../../core/analysis/staffWords';
import { plural } from '../../core/format';
import { fmtDate } from '../../core/league/helpers';
import { Help, Section, Tag } from '../components/ui';
import { putBackEdit, stopMeasuring, useEditWatch } from './editWatch';

/** Rows shown: the newest changes. */
const SHOWN = 3;

/** While the staff measures a change the user just made: that it's looking, and a way to stop it. */
export function EditMeasureBar() {
  const { running } = useEditWatch();
  if (!running || running.kind !== 'made') return null;
  return (
    <div className="dockbar tx-dock" role="status" aria-label="The staff is watching your change">
      <span className="grow tx-dock-l">Staff is watching your change</span>
      <button className="btn sm ghost" aria-label="Stop watching" onClick={stopMeasuring}>
        <X size={16} />
      </button>
    </div>
  );
}

/** A change's line under its name: when, and where it stands. */
function metaOf(e: TacticEdit, league: League, measuring: boolean): string {
  const when = fmtDate(e.season, e.day);
  if (measuring) return `${when} · The staff is watching…`;
  const w = e.check ?? e.worth;
  if (!w) return `${when} · ${e.closed ? 'No read' : 'The staff reads it when you next open Team'}`;
  if (e.closed === 'reverted') return `${when} · put back${e.closedDay === undefined ? '' : ` ${fmtDate(e.season, e.closedDay)}`}`;
  if (e.check) return `${when} · over ${plural(e.check.games, 'game')}`;
  const left = Math.max(0, CHECK_AFTER - playedSince(league, e).length);
  return e.closed ? when : `${when} · check in ${plural(left, 'game')}`;
}

function EditRow({ e, league, measuring }: { e: TacticEdit; league: League; measuring: boolean }) {
  // the latest reading leads: the check once there is one
  const call = editCall(e.check ?? e.worth);
  const back = !!e.check && editCall(e.check) === 'cost' && !e.closed;
  return (
    <div className="listrow tx-edrow">
      <span className="grow tx-swrow-m">
        <span className="lr-name ellipsis">{e.what}</span>
        <span className="lr-meta tx-edmeta">{metaOf(e, league, measuring)}</span>
      </span>
      {call && !measuring && <Tag tone={leanTone(call) || undefined}>{SINCE[call]}</Tag>}
      {back && (
        <button className="btn xs" onClick={() => putBackEdit(e)}>
          Put back
        </button>
      )}
    </div>
  );
}

/** The user's recent changes and what the staff makes of each: one block on the report. Nothing until the first change. */
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
          <p>What the staff makes of each change you made. They look again after {CHECK_AFTER} games.</p>
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
