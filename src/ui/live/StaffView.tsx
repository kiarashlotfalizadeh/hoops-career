// The live game's Staff view, the one the console opens on: the lead assistant and his read of the game,
// the calls he wants from you (each with the moves on offer, his pick first, how it was measured a tap
// down), what's working and what isn't, the scorer of theirs he's watching, the keys to the game as
// they stand, your moves tonight with what each has done since, and whether he makes his tactics calls
// himself.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CoachMove, GameResult } from '../../core/types';
import type { GameKey } from '../../core/analysis/keys';
import { keepFigures, madeAtt } from '../../core/format';
import { Help, Section, Toggle } from '../components/ui';
import { KeysLive } from '../components/GameKeys';
import type { Drawn } from './drawn';
import { AssistantHead, MovesList, NoteCard } from '../components/StaffCards';
import type { StaffAction, StaffNote } from './staff';
import { keysShare } from './session';

/** Moves listed before "All". */
const MOVES_SHOWN = 4;

/**
 * A note as its card shows it: how its number was measured (`detail`) a tap down, a "?" beside the
 * moves on offer (decision 8: the verdict and its number on the card, the method under the tap).
 */
export function noteView(n: StaffNote): StaffNote {
  if (!n.detail) return n;
  return {
    ...n,
    worth: (
      <>
        {n.worth}
        <Help title="How the staff measured it">
          <p>{n.detail}</p>
        </Help>
      </>
    ),
  };
}

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
  keys,
  watch,
  onPlayer,
}: {
  assistant: { name: string; initials: string };
  read: string;
  notes: StaffNote[];
  /** The staff's line when it measured and found nothing to change, or while it measures (useStaffCall). */
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
  keys?: GameKey[];
  /** Their scorer the staff is watching (their best tonight, or the threat the scouting named), and who's on him. */
  watch?: { pid: number; defender?: number };
  onPlayer: (pid: number) => void;
}) {
  const [allMoves, setAllMoves] = useState(false);
  const decisions = notes.filter((n) => n.kind === 'decision');
  const reads = notes.filter((n) => n.kind === 'read');
  return (
    <div className="lv-staff">
      <AssistantHead name={assistant.name} initials={assistant.initials} read={read} />
      {decisions.length > 0 ? (
        <div className="lv-notes">
          {decisions.slice(0, 4).map((n) => (
            <NoteCard key={n.id} note={noteView(n)} busy={busy} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
        </div>
      ) : (
        <div className="lv-calm small dim" role="status">
          {quiet ?? 'Nothing the staff would change right now.'}
        </div>
      )}
      {reads.length > 0 && (
        <div className="lv-notes reads">
          {reads.slice(0, 2).map((n) => (
            <NoteCard key={n.id} note={n} onAct={(a) => onAct(n, a)} onDismiss={() => onDismiss(n)} />
          ))}
        </div>
      )}
      {watch && <Watch view={view} side={side} watch={watch} nameOf={nameOf} onPlayer={onPlayer} />}
      {keys && keys.length > 0 && <KeysLive keys={keys} box={view.box as Pick<GameResult, 'home' | 'away'>} side={side} share={keysShare(view.elapsed, view.q)} compact />}
      {/* (before the first move there's nothing to measure: the section comes with it) */}
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
          help={`${assistant.name.split(' ').slice(-1)[0]} makes each measured call himself, and it shows in your moves. Subs and timeouts stay yours.`}
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
  return (
    <button className="lv-watch" onClick={() => onPlayer(p.pid)} aria-haspopup="dialog">
      <span className="lv-watch-pts">
        <span className="num">{p.pts}</span>
        <span className="tiny dim">pts</span>
      </span>
      <span className="lv-watch-t grow">
        <span className="lv-watch-n">
          <span className="dim2">Watching</span> {nameOf(p.pid)} <span className="dim num">{keepFigures(madeAtt(p.fgm, p.fga))} FG</span>
        </span>
        <span className="lv-watch-l small dim">
          {watch.defender !== undefined ? `${nameOf(watch.defender)} is on him` : them.on.includes(p.pid) ? 'The staff picks his matchup' : 'On the bench'}
        </span>
      </span>
      <ChevronRight size={16} className="dim" aria-hidden="true" />
      <span className="sr-only">: how to play him</span>
    </button>
  );
}
