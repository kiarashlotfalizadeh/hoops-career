import { useState } from 'react';
import { X } from 'lucide-react';
import type { League, SetId, Tactics } from '../../core/types';
import type { PlayCall, PossLog } from '../../core/sim/log';
import { ACTION_META } from '../../core/sim/tactics';
import { CLEAR_OUT, SETS, SET_IDS, atoLabel, bestFor, setFit } from '../../core/sim/sets';
import { Help, More, Section, Tag } from '../components/ui';
import { Term } from '../components/Glossary';
import type { DrawnSide } from './drawn';
import { callLabel, fitPlayers, readStatus, type Calls as CallsState } from './plays';

/** A player fits a set well enough to offer it for him (the package's own bar is SET_K.fit). */
const OFFER_FIT = 50;

const SITUATIONS = ['three', 'two', 'hold', 'foul'] as const;

/**
 * The Clipboard's Calls tab (and the huddle's "Draw up a play"): one place for every call from the
 * bench. The call waiting with Cancel; the situations (go for three, a quick two, run the clock, foul
 * now), which lead as "Late game" in the last two minutes of a close fourth quarter or overtime, with a
 * timeout first if wanted; a clear-out isolation; every set, for the best fit on the floor or one you
 * pick, with how far their defense has read it tonight; and the standing after-timeout play.
 * Everything reads the game as the court has drawn it (the drawn side `me`, `late`), never the sim
 * running a possession ahead; a call goes through the live game, which journals it.
 */
export function Calls({
  league,
  tactics,
  me,
  side,
  late: lateNow,
  logs,
  drawing,
  calls,
  nameOf,
  timeout,
  onCalled,
  huddle,
}: {
  league: League;
  /** Your tactics now (the roles the sets weigh players by, the after-timeout play). */
  tactics: Tactics;
  /** Your side as the court has drawn it: the five on the floor, and the sets run so far. */
  me: DrawnSide;
  side: 0 | 1;
  /** The late-game window is open (see lateGame), as the court has drawn the game. */
  late: boolean;
  logs: PossLog[];
  /** The court is drawing the last of `logs` (its situational plan is the one in effect). */
  drawing: boolean;
  calls: CallsState;
  nameOf: (pid: number) => string;
  /** Calls your timeout, as the TO button does (late game: "Timeout first"). */
  timeout?: () => void;
  /** A call went in (the Clipboard closes back to the court). */
  onCalled?: () => void;
  /** In the timeout huddle: the play drawn up comes out of it. */
  huddle?: boolean;
}) {
  const [withTimeout, setWithTimeout] = useState(false);
  const late = lateNow;
  const five = fitPlayers(league, me.on, tactics);
  const pending = calls.pending;
  const on = (c: PlayCall) => !!pending && JSON.stringify(pending) === JSON.stringify(c);
  const call = (c: PlayCall) => {
    if (late && withTimeout && timeout) timeout();
    setWithTimeout(false);
    if (calls.call(c)) onCalled?.();
  };
  const sit = drawing ? logs[logs.length - 1]?.sit?.[side] : undefined;
  const ato = tactics.manage.ato;
  const atoText = ato ? atoLabel(ato, (a) => ACTION_META[a].label, tactics.manage.atoPid != null ? nameOf(tactics.manage.atoPid) : undefined) : null;
  return (
    <div className="cl">
      {pending ? (
        <div className="cl-called" role="status">
          <span className="cl-called-k">Called</span>
          <span className="grow cl-called-v">{callLabel(pending, nameOf)}</span>
          <button className="btn xs ghost" onClick={calls.cancel}>
            <X size={14} aria-hidden="true" /> Cancel
          </button>
        </div>
      ) : (
        <div className="cl-hint">
          {huddle
            ? atoText
              ? `Out of the timeout: your ATO, ${atoText}, unless you call one here.`
              : 'Out of the timeout: the team runs its offense, unless you call one here.'
            : "For your next half-court trip, until it's run or the period ends."}
        </div>
      )}

      <Section
        className={late ? 'cl-late' : ''}
        title={<h3>{late ? 'Late game' : 'Situations'}</h3>}
        right={
          late ? (
            <span className="row" style={{ gap: 6 }}>
              {sit && <Tag tone="info">Plan: {sit}</Tag>}
              {timeout && (
                <button className={`chip ${withTimeout ? 'on' : ''}`} aria-pressed={withTimeout} onClick={() => setWithTimeout((x) => !x)}>
                  Timeout first
                </button>
              )}
            </span>
          ) : undefined
        }
      >
        <div className="chips">
          {SITUATIONS.map((kind) => (
            <button key={kind} className={`chip ${on({ kind }) ? 'on' : ''}`} aria-pressed={on({ kind })} onClick={() => call({ kind })}>
              {callLabel({ kind }, nameOf)}
            </button>
          ))}
        </div>
      </Section>

      <Section title={<h3>{<Term id="iso">{CLEAR_OUT.name}</Term>}</h3>}>
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
      </Section>

      <Section
        title={
          <h3>
            <Term id="sets">Sets</Term>
            <Help title="Calling sets">
              <p>A call changes who gets the ball and what the team looks for, never how well it plays.</p>
              <p>Each set has its own edges against some defenses and none against others.</p>
              <p>Every time you run one their defense reads it a little better: its look is less open and its passes get jumped more (a good coach reads faster).</p>
              <p>Foul now is for their next trip; every other call for yours.</p>
            </Help>
          </h3>
        }
      >
        <div className="card flush list">
          {SET_IDS.map((id) => (
            <SetRow key={id} id={id} five={five} me={me} on={on} call={call} nameOf={nameOf} />
          ))}
        </div>
      </Section>

      {!huddle && (
        <div className="cl-ato">
          <span className="over">
            After a timeout <Term id="ato">(ATO)</Term>
          </span>
          <span className="small">{atoText ?? 'No set: the team runs its offense.'}</span>
        </div>
      )}
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
  call: (c: PlayCall) => void;
  nameOf: (pid: number) => string;
}) {
  const s = SETS[id];
  const best = bestFor(id, five);
  const others = five.filter((p) => p !== best && setFit(id, p) >= OFFER_FIT).sort((a, b) => setFit(id, b) - setFit(id, a));
  const status = readStatus(me, id);
  const auto: PlayCall = { kind: 'set', set: id };
  return (
    <div className="cl-set">
      <div className="cl-set-h">
        <span className="cl-set-name">{s.name}</span>
        {status.runs > 0 && <Tag tone={status.onIt ? 'bad' : 'warn'}>{status.text}</Tag>}
      </div>
      <More label={s.look.replace(/^./, (c) => c.toUpperCase())}>
        <div className="tiny dim2">
          Works against {s.beats}; not against {s.killedBy}.
        </div>
      </More>
      <div className="chips" role="group" aria-label={`${s.name} for`}>
        {best && (
          <button className={`chip ${on(auto) ? 'on' : ''}`} aria-pressed={on(auto)} aria-label={`${s.name} for the best fit, ${nameOf(best.pid)} now`} onClick={() => call(auto)}>
            Best fit · {nameOf(best.pid)}
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
