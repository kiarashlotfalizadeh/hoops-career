// The staff's shared pieces, in the live game and after it: the lead assistant at the head of a
// section, one of his notes (a decision with the moves on offer, or a read), and the night's moves
// with what each has done since (the numbers alone: whether a move worked is the replayed night's to say).
import { ArrowLeftRight, Bot, Timer, X } from 'lucide-react';
import type { CoachMove } from '../../core/types';
import { moveRate } from '../../core/analysis/moves';
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

/**
 * One of the staff's notes: its figure, headline and evidence, the moves on offer (the staff's pick
 * first) with what the call has been worth where it fires (measured, or the staff's read), and Not now.
 */
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
        {/* a note with no moves closes from its corner; a call says Not now beside its moves */}
        {onDismiss && !note.actions.length && (
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
          {onDismiss && (
            <button className="btn xs ghost" onClick={onDismiss} aria-label={`Not now: ${note.title}`}>
              Not now
            </button>
          )}
          {note.worth && <span className="lv-note-worth tiny">{note.worth}</span>}
        </div>
      )}
    </div>
  );
}

/** What a move has done since, in a line: "SAS 0.91 a trip in 22 trips since, 1.18 before". */
export function moveLine(m: CoachMove, abbrevs: { us: string; them: string }, nameOf: (pid: number) => string): string {
  // a play called: the one trip it ran on
  if (m.kind === 'play') {
    const t = m.after.us;
    return !t.poss ? 'Not run yet.' : t.pts ? `Ran it: ${plural(t.pts, 'point')}.` : 'Ran it: came up empty.';
  }
  const v = moveRate(m);
  if (v.now === null) return 'Not a trip since yet.';
  if (v.what === 'margin') {
    const t = m.after;
    const d = t.us.pts - t.them.pts;
    // (the rate before in words: "-0.80 a trip before" read as a figure with no subject)
    const was =
      v.was === null ? '' : Math.abs(v.was) < 0.005 ? ' Level before.' : ` ${v.was > 0 ? 'Outscoring them' : 'Outscored'} by ${Math.abs(v.was).toFixed(2)} a trip before.`;
    return `${abbrevs.us} ${t.us.pts}-${t.them.pts} since, ${signed(d, 0)}.${was}`;
  }
  // one of theirs it was aimed at: his points and the trips he finished, since and before
  if (v.what === 'focus' && m.pid !== undefined) {
    const a = m.after.focus!;
    const b = m.before.focus;
    return `${nameOf(m.pid)} ${a.pts} on ${a.poss} trips since${b && b.poss ? `, ${b.pts} on ${b.poss} before` : ''}.`;
  }
  const team = m.end === 'off' || v.what === 'us' ? abbrevs.us : abbrevs.them;
  const who = v.what === 'focus' && m.aim ? `${team} ${m.aim}` : team;
  const now = `${who} ${v.now.toFixed(2)} a trip in ${plural(v.trips, 'trip')} since`;
  return v.was !== null ? `${now}, ${v.was.toFixed(2)} before.` : `${now}.`;
}

/**
 * The night's moves, newest first, each with what it has done since against the stretch before it, and
 * no verdict: a move made after a hot stretch reads better afterwards whatever it did (the rate falls
 * back toward the usual either way), so "working" is left to the replayed night (see nightLine).
 */
export function MovesList({ moves, abbrevs, nameOf, max }: { moves: CoachMove[]; abbrevs: { us: string; them: string }; nameOf: (pid: number) => string; max?: number }) {
  const list = [...moves].reverse().slice(0, max ?? moves.length);
  if (!list.length) return <div className="lv-mv-empty small dim">Nothing changed yet. Every change you make shows here, with what it has done since.</div>;
  return (
    <div className="lv-mv card flush list">
      {list.map((m, i) => (
        <div key={`${m.q}-${m.clock}-${i}`} className="lv-mv-row">
          {/* (under a minute with its minute, "Q4 0:06": a "Q4 6.0" reads as 6:00; a move's clock is whole seconds) */}
          <span className="lv-mv-when num">
            {m.clock <= 0
              ? m.q === 2
                ? 'Half'
                : `End ${periodLabel(m.q)}`
              : `${periodLabel(m.q)} ${m.clock < 60 ? `0:${String(Math.round(m.clock)).padStart(2, '0')}` : fmtClock(m.clock)}`}
          </span>
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
        </div>
      ))}
    </div>
  );
}
