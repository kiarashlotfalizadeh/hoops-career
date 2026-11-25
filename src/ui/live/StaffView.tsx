// The live game's Now view, the one the console opens on: what the staff sees and what needs you, most
// urgent first. The lead assistant's read in a sentence, the calls he wants from you, who's tired or in
// foul trouble with the sub a tap away, what's working and what isn't, the scorer of theirs he's
// watching, your moves tonight with the score since, and whether he makes his
// tactics calls himself. Opinions in words: what a call will do stays the staff's hunch.
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CoachMove, Tactics } from '../../core/types';
import { keepFigures, madeAtt } from '../../core/format';
import { Section, Toggle } from '../components/ui';
import type { Drawn } from './drawn';
import { AssistantHead, MovesList, NoteCard } from '../components/StaffCards';
import type { StaffAction, StaffNote } from './staff';
import { Trouble, type SubFor } from './Trouble';

/** Moves listed before "All". */
const MOVES_SHOWN = 2;

export function StaffView({
  assistant,
  read,
  notes,
  quiet,
  onAct,
  onDismiss,
  autonomy,
  setAutonomy,
  moves,
  abbrevs,
  nameOf,
  busy,
  view,
  side,
  watch,
  onPlayer,
  tactics,
  subFor,
  substitute,
}: {
  assistant: { name: string; initials: string };
  read: string;
  notes: StaffNote[];
  /** The staff's line when it found nothing to change, or while it looks (useStaffCall). */
  quiet?: string | null;
  onAct: (n: StaffNote, a: StaffAction) => void;
  onDismiss: (n: StaffNote) => void;
  autonomy: 'ask' | 'auto';
  setAutonomy: (v: 'ask' | 'auto') => void;
  moves: CoachMove[];
  abbrevs: { us: string; them: string };
  nameOf: (pid: number) => string;
  busy?: boolean;
  view: Drawn;
  side: 0 | 1;
  /** Their scorer the staff is watching (their best tonight, or the threat the scouting named), and who's on him. */
  watch?: { pid: number; defender?: number };
  onPlayer: (pid: number) => void;
  tactics: Tactics;
  subFor: SubFor;
  substitute: (out: number, inn: number) => boolean;
}) {
  const [allMoves, setAllMoves] = useState(false);
  const [allCalls, setAllCalls] = useState(false);
  const decisions = notes.filter((n) => n.kind === 'decision');
  const reads = notes.filter((n) => n.kind === 'read');
  // (a player a call already offers to sub isn't offered twice)
  const offered = useMemo(() => new Set(decisions.flatMap((n) => n.actions.flatMap((a) => (a.kind === 'sub' ? [a.out] : [])))), [decisions]);
  return (
    <div className="lv-staff">
      {/* Put an active staff call first so its action buttons are always immediately reachable above the bottom nav. */}
      {decisions.length > 0 && (
        <div className="lv-notes">
          {/* one call at a time, the most urgent: the rest wait a tap away, so the console never stacks cards */}
          {decisions.slice(0, allCalls ? 3 : 1).map((n) => (
            <NoteCard key={n.id} note={n} busy={busy} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
          {decisions.length > 1 && (
            <button className="lv-mv-all lv-notes-more" onClick={() => setAllCalls((x) => !x)}>
              {allCalls ? 'One at a time' : `${decisions.length - 1} more ${decisions.length === 2 ? 'call' : 'calls'}`}
            </button>
          )}
        </div>
      )}
      {/* (keyed by his words: a new read ticks in) */}
      <AssistantHead key={read} name={assistant.name} initials={assistant.initials} read={read} />
      {decisions.length === 0 && (
        <div key={quiet ?? ''} className="lv-calm small dim" role="status">
          {quiet ?? 'Nothing the staff would change right now.'}
        </div>
      )}
      <Trouble view={view} side={side} tactics={tactics} names={nameOf} subFor={subFor} substitute={substitute} skip={offered} />
      {/* (a read waits while a call is up) */}
      {reads.length > 0 && decisions.length === 0 && (
        <div className="lv-notes reads">
          {reads.slice(0, 1).map((n) => (
            <NoteCard key={n.id} note={n} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
        </div>
      )}
      {watch && <Watch view={view} side={side} watch={watch} nameOf={nameOf} onPlayer={onPlayer} />}
      {/* (before the first move there's nothing to show: the section comes with it) */}
      {moves.length > 0 && (
        <Section
          title="Your moves"
          right={
            moves.length > MOVES_SHOWN ? (
              <button className="lv-mv-all" onClick={() => setAllMoves((x) => !x)}>
                {allMoves ? 'Fewer' : `All ${moves.length}`}
              </button>
            ) : undefined
          }
        >
          <MovesList moves={moves} abbrevs={abbrevs} nameOf={nameOf} max={allMoves ? undefined : MOVES_SHOWN} />
        </Section>
      )}
      <div className="lv-auto">
        <Toggle
          on={autonomy === 'auto'}
          onChange={(on) => setAutonomy(on ? 'auto' : 'ask')}
          label="Staff makes tactics calls"
          help={
            autonomy === 'auto'
              ? `On: ${assistant.name.split(' ').slice(-1)[0]} makes each tactics call himself, and it shows in your moves. Subs and timeouts stay yours.`
              : `Off: ${assistant.name.split(' ').slice(-1)[0]} brings you his calls and you make them. Turn it on and he makes the tactics calls himself; subs and timeouts stay yours.`
          }
        />
      </div>
    </div>
  );
}

/** The scorer of theirs the staff is watching: his night so far and who's on him, a tap from his sheet. */
function Watch({
  view,
  side,
  watch,
  nameOf,
  onPlayer,
}: {
  view: Drawn;
  side: 0 | 1;
  watch: { pid: number; defender?: number };
  nameOf: (pid: number) => string;
  onPlayer: (pid: number) => void;
}) {
  const them = view.sides[1 - side];
  const p = them.players.find((x) => x.pid === watch.pid);
  if (!p) return null;
  const who = watch.defender !== undefined ? `${nameOf(watch.defender)} on him` : them.on.includes(p.pid) ? 'Staff picks his matchup' : 'On the bench';
  return (
    <button className="lv-watch" onClick={() => onPlayer(p.pid)} aria-haspopup="dialog">
      <span className="lv-watch-t grow">
        <span className="lv-watch-n">
          <span className="dim2">Watch</span> {nameOf(p.pid)}
        </span>
        <span className="lv-watch-l small dim">
          {p.pts} pts on {keepFigures(madeAtt(p.fgm, p.fga))} · {who}
        </span>
      </span>
      <ChevronRight size={16} className="dim" aria-hidden="true" />
      <span className="sr-only">: how to play him</span>
    </button>
  );
}
