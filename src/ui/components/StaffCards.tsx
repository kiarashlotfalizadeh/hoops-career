// The staff's shared pieces, in the live game and after it: the lead assistant at the head of a
// section, one of his notes (a decision with the moves on offer, or a read), and the night's moves
// with what each has done since.
import { ArrowLeftRight, Bot, Check, Timer, X } from 'lucide-react';
import type { CoachMove } from '../../core/types';
import { moveVerdict, type MoveVerdict } from '../../core/analysis/moves';
import { fmtClock, periodLabel, signed } from '../stats';
import { plural } from '../../core/format';
import type { StaffAction, StaffNote } from '../live/staff';
import './staff.css';

/** The lead assistant: his initials, his name and what he reads in the game now. */
export function AssistantHead({ name, initials, read, right }: { name: string; initials: string; read: string; right?: React.ReactNode }) {
  return (
    <div className="lv-ah">
      <span className="lv-ah-av" aria-hidden="true">
        {initials}
      </span>
      <div className="lv-ah-t grow">
        <div className="lv-ah-n">
          {name} <span className="lv-ah-role">Lead assistant</span>
        </div>
        <div className="lv-ah-read">{read}</div>
      </div>
      {right}
    </div>
  );
}

/** One of the staff's notes: its figure, headline and evidence, the moves on offer (the staff's pick first) and Not now. */
export function NoteCard({ note, onAct, onDismiss, busy }: { note: StaffNote; onAct: (a: StaffAction) => void; onDismiss?: () => void; busy?: boolean }) {
  return (
    <div className={`lv-note tone-${note.tone} ${note.kind}`}>
      <div className="lv-note-top">
        {note.fig && (
          <span className="lv-note-fig num" aria-hidden="true">
            {note.fig.v}
            <span className="lv-note-u">{note.fig.unit}</span>
          </span>
        )}
        <div className="grow lv-note-tx">
          <div className="lv-note-title">{note.title}</div>
          {note.text && <div className="lv-note-line">{note.text}</div>}
        </div>
        {onDismiss && (
          <button className="lv-note-x" onClick={onDismiss} aria-label={`Not now: ${note.title}`}>
            <X size={15} />
          </button>
        )}
      </div>
      {note.actions.length > 0 && (
        <div className="lv-note-acts">
          {note.actions.map((a, i) => (
            <button key={a.label} className={`btn xs ${i === 0 ? 'primary' : ''}`} disabled={busy} onClick={() => onAct(a)}>
              {a.kind === 'timeout' && <Timer size={13} aria-hidden="true" />}
              {a.kind === 'sub' && <ArrowLeftRight size={13} aria-hidden="true" />}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const VERDICT: Record<MoveVerdict, { label: string; tone: string }> = {
  better: { label: 'Working', tone: 'good' },
  worse: { label: 'Not working', tone: 'bad' },
  same: { label: 'No clear change', tone: 'dim' },
  early: { label: 'Too early', tone: 'dim' },
};

/** A move whose stretch ended (the next one of its kind, or the buzzer) before it had a few trips. */
const CUT_SHORT = { label: 'Too short to tell', tone: 'dim' };
/** ...and one whose stretch is over with no clear change: there won't be one now. */
const NO_DIFFERENCE = { label: 'No clear difference', tone: 'dim' };

/** What a move has done since, in a line: "SAS 0.91 a trip since (22 trips), 1.18 before". */
export function moveLine(m: CoachMove, abbrevs: { us: string; them: string }, nameOf: (pid: number) => string): string {
  // a play called: the one trip it ran on
  if (m.kind === 'play') {
    const t = m.after.us;
    return !t.poss ? 'Not run yet.' : t.pts ? `Ran it: ${plural(t.pts, 'point')}.` : 'Ran it: came up empty.';
  }
  const v = moveVerdict(m);
  if (v.now === null) return 'Not a trip since yet.';
  if (v.what === 'margin') {
    const t = m.after;
    const d = t.us.pts - t.them.pts;
    // (the rate before in words: "-0.80 a trip before" read as a figure with no subject)
    const was =
      v.was === null ? '' : Math.abs(v.was) < 0.005 ? '; level before' : `; ${v.was > 0 ? 'outscoring them' : 'outscored'} by ${Math.abs(v.was).toFixed(2)} a trip before`;
    return `${abbrevs.us} ${t.us.pts}-${t.them.pts} since (${signed(d, 0)})${was}.`;
  }
  // one of theirs it was aimed at: his points and the trips he finished, since and before
  if (v.what === 'focus' && m.pid !== undefined) {
    const a = m.after.focus!;
    const b = m.before.focus;
    return `${nameOf(m.pid)} ${a.pts} on ${a.poss} trips since${b && b.poss ? `, ${b.pts} on ${b.poss} before` : ''}.`;
  }
  const team = m.end === 'off' || v.what === 'us' ? abbrevs.us : abbrevs.them;
  const who = v.what === 'focus' && m.aim ? `${team} ${m.aim}` : team;
  const now = `${who} ${v.now.toFixed(2)} a trip since (${plural(v.trips, 'trip')})`;
  return v.was !== null ? `${now}, ${v.was.toFixed(2)} before.` : `${now}.`;
}

/** The night's moves, newest first, each with what it has done since and the staff's verdict on it. */
export function MovesList({ moves, abbrevs, nameOf, max }: { moves: CoachMove[]; abbrevs: { us: string; them: string }; nameOf: (pid: number) => string; max?: number }) {
  const list = [...moves].reverse().slice(0, max ?? moves.length);
  if (!list.length) return <div className="lv-mv-empty small dim">Nothing changed yet. Every change you make shows here, with what it has done since.</div>;
  return (
    <div className="lv-mv card flush list">
      {list.map((m, i) => {
        const v = moveVerdict(m);
        // (a timeout rests legs and stops the clock: what follows it isn't its verdict)
        // (nor is one trip a play's: it scored or it didn't)
        const verdict =
          m.kind === 'timeout' || m.kind === 'play' ? null : m.closed && v.verdict === 'early' ? CUT_SHORT : m.closed && v.verdict === 'same' ? NO_DIFFERENCE : VERDICT[v.verdict];
        return (
          <div key={`${m.q}-${m.clock}-${i}`} className="lv-mv-row">
            <span className="lv-mv-when num">{m.clock <= 0 ? (m.q === 2 ? 'Half' : `End ${periodLabel(m.q)}`) : `${periodLabel(m.q)} ${fmtClock(m.clock)}`}</span>
            <div className="grow lv-mv-tx">
              <div className="lv-mv-what">
                {m.by === 'staff' && (
                  <span className="lv-mv-by" title="The staff made this change">
                    <Bot size={12} aria-hidden="true" /> Staff
                  </span>
                )}
                {m.text}
              </div>
              <div className="lv-mv-line small dim2">{moveLine(m, abbrevs, nameOf)}</div>
            </div>
            {verdict && (
              <span className={`lv-mv-v ${verdict.tone}`}>
                {v.verdict === 'better' && <Check size={12} aria-hidden="true" />}
                {verdict.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
