// The staff's shared pieces, in the live game and after it: the lead assistant at the head of a
// section, one of his notes (a decision with the moves on offer, or a read), and the night's moves
// with the score since each (the facts alone: whether a move worked is the replayed night's to say).
import { ArrowLeftRight, Bot, Timer, X } from 'lucide-react';
import type { CoachMove } from '../../core/types';
import { moveRate } from '../../core/analysis/moves';
import { fmtClock, periodLabel } from '../stats';
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
 * One of the staff's notes: its headline and evidence, its size in a word, the moves on offer (the
 * staff's pick first) with the staff's opinion of the call, and Not now.
 */
export function NoteCard({ note, onAct, onDismiss, busy }: { note: StaffNote; onAct: (a: StaffAction) => void; onDismiss?: () => void; busy?: boolean }) {
  return (
    <div className={`lv-note tone-${note.tone} ${note.kind}`}>
      <div className="lv-note-top">
        {note.kind === 'read' && <span className="lv-note-dot" aria-hidden="true" />}
        <div className="grow lv-note-tx">
          <div className="lv-note-title">{note.title}</div>
          {note.text && <div className="lv-note-line">{note.text}</div>}
        </div>
        {note.tag && <span className="lv-note-tag">{note.tag}</span>}
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

/** What's happened since a move, in a line of plain facts: "OKC 14-9 since", "Fox 4 on 5 trips since". */
export function moveLine(m: CoachMove, abbrevs: { us: string; them: string }, nameOf: (pid: number) => string): string {
  // a play called: the one trip it ran on
  if (m.kind === 'play') {
    const t = m.after.us;
    return !t.poss ? 'Not run yet.' : t.pts ? `Ran it: ${plural(t.pts, 'point')}.` : 'Ran it: came up empty.';
  }
  const v = moveRate(m);
  if (v.now === null) return 'Not a trip since yet.';
  // one of theirs it was aimed at: his points and the trips he finished
  if (v.what === 'focus' && m.pid !== undefined) {
    const a = m.after.focus!;
    return `${nameOf(m.pid)} ${a.pts} on ${plural(a.poss, 'trip')} since.`;
  }
  return `${abbrevs.us} ${m.after.us.pts}-${m.after.them.pts} since.`;
}

/**
 * The night's moves, newest first, each with the score since, and no verdict: a move made after a hot stretch reads better afterwards whatever it did (the rate falls
 * back toward the usual either way), so "working" is left to the replayed night (see nightLine).
 */
export function MovesList({ moves, abbrevs, nameOf, max }: { moves: CoachMove[]; abbrevs: { us: string; them: string }; nameOf: (pid: number) => string; max?: number }) {
  const list = [...moves].reverse().slice(0, max ?? moves.length);
  if (!list.length) return <div className="lv-mv-empty small dim">Nothing changed yet. Your changes show here.</div>;
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
