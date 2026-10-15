import { X } from 'lucide-react';
import type { League, SetId, Tactics } from '../../core/types';
import type { PlayCall } from '../../core/sim/log';
import { CLEAR_OUT, SETS, SET_IDS, bestFor, setFit } from '../../core/sim/sets';
import { Tag } from '../components/ui';
import type { DrawnSide } from './drawn';
import { callLabel, fitPlayers, readStatus, type Calls } from './plays';

/** A player fits a set well enough to offer it for him (the package's own bar is SET_K.fit). */
const OFFER_FIT = 50;

/**
 * Calling a play for the next half-court trip: any set, for the player it fits best on the floor or
 * one you pick, with how far their defense has read it tonight (from Advanced depth: `sets`); a
 * clear-out isolation; and (with `late`) the situational calls. The call waiting shows on top with Cancel.
 */
export function PlayPicker({
  league,
  tactics,
  me,
  calls,
  nameOf,
  late,
  sets = true,
}: {
  league: League;
  /** Your tactics now (the roles the sets weigh players by). */
  tactics: Tactics;
  /** Your side as the court has drawn it: the five on the floor, and the sets run so far. */
  me: DrawnSide;
  calls: Calls;
  nameOf: (pid: number) => string;
  /** Offer the situational calls too (go for three, a quick two, run the clock, foul now). */
  late?: boolean;
  /** Offer the sets (Simple depth calls none). */
  sets?: boolean;
}) {
  const five = fitPlayers(league, me.on, tactics);
  const pending = calls.pending;
  const call = (c: PlayCall) => calls.call(c);
  const on = (c: PlayCall) => !!pending && JSON.stringify(pending) === JSON.stringify(c);
  return (
    <div className="col" style={{ gap: 12 }}>
      {pending ? (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="pill" role="status">
            Called: {callLabel(pending, nameOf)}
          </span>
          <button className="btn xs ghost" aria-label="Cancel the call" onClick={calls.cancel}>
            <X size={14} /> Cancel
          </button>
        </div>
      ) : (
        <div className="small dim">Pick a play for your next half-court trip. It replaces any call still waiting and lasts until it's run or the period ends.</div>
      )}
      {sets && (
        <>
          <div className="tiny dim upper bold">Sets</div>
          <div className="col" style={{ gap: 10 }}>
            {SET_IDS.map((id) => (
              <SetRow key={id} id={id} five={five} me={me} on={on} call={call} nameOf={nameOf} />
            ))}
          </div>
        </>
      )}
      <div className="col" style={{ gap: 6 }}>
        <div className="tiny dim upper bold">{CLEAR_OUT.name}</div>
        <div className="chips" role="group" aria-label="Isolation for">
          {me.on.map((pid) => {
            const c: PlayCall = { kind: 'iso', pid };
            return (
              <button key={pid} className={`chip ${on(c) ? 'on' : ''}`} aria-pressed={on(c)} aria-label={`Isolation for ${nameOf(pid)}`} onClick={() => call(c)}>
                {nameOf(pid)}
              </button>
            );
          })}
        </div>
        <div className="tiny dim">
          {CLEAR_OUT.what} {CLEAR_OUT.note}
        </div>
      </div>
      {late && (
        <div className="col" style={{ gap: 6 }}>
          <div className="tiny dim upper bold">Situations</div>
          <div className="chips">
            {(['three', 'two', 'hold', 'foul'] as const).map((kind) => (
              <button key={kind} className={`chip ${on({ kind }) ? 'on' : ''}`} aria-pressed={on({ kind })} onClick={() => call({ kind })}>
                {callLabel({ kind }, nameOf)}
              </button>
            ))}
          </div>
          <div className="tiny dim">Foul now is for their next trip; the others for yours.</div>
        </div>
      )}
      <div className="tiny dim">
        A call changes who gets the ball and what the team looks for, never how well it plays. Each set has its own edges against some defenses and none against others, and every
        time you run one their defense reads it a little better: its look is less open and its passes get jumped more (a good coach reads faster).
      </div>
    </div>
  );
}

function SetRow({
  id,
  five,
  me,
  on,
  call,
  nameOf,
}: {
  id: SetId;
  five: ReturnType<typeof fitPlayers>;
  me: DrawnSide;
  on: (c: PlayCall) => boolean;
  call: (c: PlayCall) => boolean;
  nameOf: (pid: number) => string;
}) {
  const s = SETS[id];
  const best = bestFor(id, five);
  const others = five.filter((p) => p !== best && setFit(id, p) >= OFFER_FIT).sort((a, b) => setFit(id, b) - setFit(id, a));
  const status = readStatus(me, id);
  const auto: PlayCall = { kind: 'set', set: id };
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className="small bold">{s.name}</span>
        <Tag tone={status.onIt ? 'bad' : status.runs ? 'warn' : undefined}>{status.text}</Tag>
      </div>
      <div className="tiny dim">
        The look: {s.look}. Works against {s.beats}; not against {s.killedBy}.
      </div>
      <div className="chips" role="group" aria-label={`${s.name} for`}>
        {best && (
          <button className={`chip ${on(auto) ? 'on' : ''}`} aria-pressed={on(auto)} aria-label={`${s.name} for the best fit, ${nameOf(best.pid)} now`} onClick={() => call(auto)}>
            Best fit ({nameOf(best.pid)})
          </button>
        )}
        {others.map((p) => {
          const c: PlayCall = { kind: 'set', set: id, pid: p.pid };
          return (
            <button key={p.pid} className={`chip ${on(c) ? 'on' : ''}`} aria-pressed={on(c)} aria-label={`${s.name} for ${nameOf(p.pid)}`} onClick={() => call(c)}>
              {nameOf(p.pid)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
