// "Since you changed it" (Tactics → Season Analysis). A change shows what it moved and where it
// stands: waiting for its check until CHECK_AFTER games have been played with it, then what the staff
// makes of it ("Seems to help", "Seems to hurt" with a tap to put it back, or "Too close to call")
// with the check's figure, a fact about played games (paired replays with and without the change, see
// core/ai/tacticEdits.ts). Nothing is said of a change before its games are played.
import type { League, TacticEdit } from '../../core/types';
import { CHECK_AFTER, RECHECK_AFTER, editCall, editsOf, playedSince, recheckAhead } from '../../core/ai/tacticEdits';
import { SINCE, leanTone, ptsFig } from '../../core/analysis/staffWords';
import { plural } from '../../core/format';
import { fmtDate } from '../../core/league/helpers';
import { Help, Section, Tag } from '../components/ui';
import { putBackEdit, useEditWatch } from './editWatch';

/** Rows shown: the newest changes. */
const SHOWN = 3;

/** A check's figure, a fact about played games: "+0.9 a game ±0.4" (the replays' reading, shrunk toward even, and its give or take). */
const checkFig = (e: TacticEdit) => (e.check ? `${ptsFig(e.check.pts, false)} a game ±${Math.max(0.1, e.check.se).toFixed(1)}` : '');

/** A change's line under its name: when, and where it stands. */
function metaOf(e: TacticEdit, league: League, measuring: boolean): string {
  const when = fmtDate(e.season, e.day);
  if (measuring && !e.check) return `${when} · The staff is checking it…`;
  if (e.closed === 'reverted') return `${when} · put back${e.closedDay === undefined ? '' : ` ${fmtDate(e.season, e.closedDay)}`}`;
  if (e.check && recheckAhead(e)) {
    // (one that couldn't tell: its one second look, and when; the season over, the first look stands)
    const left = Math.max(0, e.check.games + RECHECK_AFTER - playedSince(league, e).length);
    return e.season === league.season
      ? `${when} · ${checkFig(e)} over ${plural(e.check.games, 'game')} · second look in ${plural(left, 'game')}`
      : `${when} · ${checkFig(e)} over ${plural(e.check.games, 'game')} · final`;
  }
  if (e.check) return `${when} · ${checkFig(e)} over ${plural(e.check.games, 'game')}${e.check.recheck ? ' · second look, final' : ' · final'}`;
  if (e.closed) return `${when} · replaced before its check`;
  const left = Math.max(0, CHECK_AFTER - playedSince(league, e).length);
  return left ? `${when} · check in ${plural(left, 'game')}` : `${when} · check due`;
}

function EditRow({ e, league, measuring }: { e: TacticEdit; league: League; measuring: boolean }) {
  // (only a check on played games is said: a change still waiting for its games has no verdict)
  const call = editCall(e.check);
  const back = !!e.check && editCall(e.check) === 'cost' && !e.closed;
  return (
    <div className="listrow tx-edrow">
      <span className="grow tx-swrow-m">
        <span className="lr-name ellipsis">{e.what}</span>
        <span className="lr-meta tx-edmeta">{metaOf(e, league, measuring)}</span>
      </span>
      {call && <Tag tone={leanTone(call) || undefined}>{SINCE[call]}</Tag>}
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
          <p>
            After {CHECK_AFTER} played games, the staff replays them with your change and without it and says what it found. If it can&apos;t tell, one more look {RECHECK_AFTER}{' '}
            games later, then it&apos;s final. Until then, what a change does is yours to judge on the floor.
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
