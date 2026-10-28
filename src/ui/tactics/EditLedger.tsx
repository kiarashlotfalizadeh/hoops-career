// "Since you changed it" (Tactics → Analysis → Report) and the bar the staff's measuring takes on
// Tactics after Done. A change shows what it moved, what it measured as it was made over the next
// few games, and once CHECK_AFTER games have been played, what it measured on them: "It worked",
// "It cost" (with a tap to put it back) or "Too close to say". Every number on it is a measurement
// (paired games with and without the change, see core/ai/tacticEdits.ts), never the record.
import { X } from 'lucide-react';
import type { League, TacticEdit } from '../../core/types';
import { CHECK_AFTER, editCall, editsOf, madeShort, playedSince } from '../../core/ai/tacticEdits';
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

function EditRow({ e, league, measuring }: { e: TacticEdit; league: League; measuring: boolean }) {
  const played = playedSince(league, e).length;
  const left = Math.max(0, CHECK_AFTER - played);
  // the latest measurement leads: the check once there is one
  const w = e.check ?? e.worth;
  const call = editCall(e.check);
  const cost = e.check && `It cost ${Math.abs(e.check.pts).toFixed(1)} a game`;
  const meta = measuring
    ? 'The staff is measuring it…'
    : e.check && e.closed === 'reverted'
      ? `${cost} · put back${e.closedDay === undefined ? '' : ` ${fmtDate(e.season, e.closedDay)}`}`
      : e.check && call === 'cost' && !e.closed
        ? `${cost}: want it back?`
        : e.check
          ? `${call === 'gain' ? 'It worked' : call === 'cost' ? cost : 'Too close to say'}, on the games played since`
          : e.worth
            ? `${madeShort(e)}${e.closed ? '' : ` · again in ${plural(left, 'game')}`}`
            : e.closed
              ? 'Not measured'
              : 'Not measured yet: it will be next time you open Team';
  const back = e.check && call === 'cost' && !e.closed;
  return (
    <div className="listrow tx-edrow">
      <span className="grow tx-swrow-m">
        <span className="lr-name ellipsis">{e.what}</span>
        <span className={`lr-meta tx-edmeta ${e.check ? toneOf(e.check) : ''}`}>
          {fmtDate(e.season, e.day)} · {e.closed === 'reverted' && !e.check ? 'Put back · ' : ''}
          {meta}
        </span>
      </span>
      {back ? (
        <button className="btn xs" onClick={() => putBackEdit(e)}>
          Put back
        </button>
      ) : (
        w && (
          <span className={`tx-edv num ${toneOf(w)}`}>
            {editCall(w) === 'even' ? 'Even' : signed(w.pts)}
            <span className="tiny dim">{e.check ? `${e.check.games} games` : 'a game'}</span>
          </span>
        )
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
          <p>
            When you change your tactics or rotation, the staff plays your next few games many times with the change and without it, on the same bounces, and says what it&apos;s
            worth a game. That number includes what learning something new costs tonight, which fades as the team drills it: &quot;once drilled&quot; is what it&apos;s worth then.
          </p>
          <p>
            After {CHECK_AFTER} games they replay the games you actually played, with and without it, and say whether it worked. Wins and losses can&apos;t tell you that: one
            game&apos;s margin swings by far more than any change is worth. &quot;Too close to say&quot; means the change is within a few tenths of even.
          </p>
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
