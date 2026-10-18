import { ArrowLeftRight, Lightbulb } from 'lucide-react';
import type { League, OffRole, ShotFreedom, Tactics } from '../../core/types';
import { ROLE_META } from '../../core/ratings';
import { CLEAR_OUT, SETS } from '../../core/sim/sets';
import { Chips, Help, Statline, Tag, Toggle } from '../components/ui';
import type { DrawnPlayer } from './drawn';
import { fitPlayers, setsFor, type Calls } from './plays';

/** A player's night so far, at the top of his sheet (yours or theirs). */
export function PlayerLine({ p }: { p: DrawnPlayer }) {
  const e = Math.round(p.energy * 100);
  return (
    <div className="ps-fig">
      <Statline
        items={[
          { k: 'Pts', v: p.pts },
          { k: 'FG', v: `${p.fgm}/${p.fga}` },
          { k: 'Fouls', v: p.fouls, color: p.fouls >= 5 ? 'var(--bad)' : p.fouls >= 4 ? 'var(--warn)' : undefined },
          { k: 'Energy', v: `${e}%` },
        ]}
      />
    </div>
  );
}

const FREEDOM: { id: ShotFreedom; label: string }[] = [
  { id: 1, label: 'Green light' },
  { id: 0, label: 'Normal' },
  { id: -1, label: 'Limited' },
];

/** Who can swap places with him: bench players for one on the floor, the five for one on the bench. */
export interface SubOptions {
  /** He's on the floor now (in the game itself, which runs a possession ahead of the court). */
  on: boolean;
  /** He can't play: 1 fouled out, 2 hurt or resting. */
  out: 0 | 1 | 2;
  /** "Rest" when he's resting tonight. */
  dnp?: string;
  options: { pid: number; line: string; staff?: boolean }[];
}

/**
 * One of your players: his line tonight, the sub (the bench players who can come in for him, the
 * staff's pick first, or the five he can come in for), and his orders: shot freedom, role, crunch-time
 * go-to, a play run for him and who he guards. Every order goes through your tactics or a play call,
 * so the game's journal keeps it, and "Keep changes after this game" treats it like any other change
 * (tonight's matchups excepted).
 */
export function MyPlayer({
  league,
  p,
  name,
  tactics,
  oppOn,
  guarding,
  nameOf,
  apply,
  calls,
  subs,
  onSub,
}: {
  league: League;
  p: DrawnPlayer;
  name: string;
  tactics: Tactics;
  /** Their five on the floor. */
  oppOn: number[];
  /** The one of theirs he guards now, if any. */
  guarding?: number;
  nameOf: (pid: number) => string;
  apply: (fn: (t: Tactics) => void) => void;
  calls: Calls;
  subs: SubOptions;
  /** Swap him with `other` (out for in, or in for out, as he stands). */
  onSub: (other: number) => void;
}) {
  const pid = p.pid;
  const freedom = tactics.offense.freedom[pid] ?? 0;
  const fp = fitPlayers(league, [pid], tactics)[0];
  const role: OffRole | undefined = fp?.role;
  const fits = fp ? setsFor(fp).slice(0, 4) : [];
  const goTo = tactics.manage.goTo === pid;
  const assigned = Object.entries(tactics.defense.matchups).find(([, d]) => d === pid)?.[0];
  const pending = calls.pending;
  const isOn = (c: Parameters<Calls['call']>[0]) => !!pending && JSON.stringify(pending) === JSON.stringify(c);
  return (
    <div className="ps">
      <PlayerLine p={p} />

      {subs.out ? (
        <div className="ps-out">
          <Tag tone={subs.out === 1 ? 'bad' : undefined}>{subs.out === 1 ? 'Fouled out' : subs.dnp === 'Rest' ? 'Resting tonight' : 'Out for the game'}</Tag>
        </div>
      ) : (
        <div className="ps-blk">
          <div className="over">
            <ArrowLeftRight size={12} aria-hidden="true" /> {subs.on ? 'Sub him out' : 'Put him in for'}
          </div>
          {subs.options.length ? (
            <>
              <div className="chips" role="group" aria-label={subs.on ? `Who comes in for ${name}` : `Who ${name} comes in for`}>
                {subs.options.map((o) => (
                  <button key={o.pid} className={`chip ps-sub${o.staff ? ' staff' : ''}`} onClick={() => onSub(o.pid)}>
                    {o.staff && <Lightbulb size={13} className="accent-text" aria-hidden="true" />}
                    {nameOf(o.pid)} <span className="ps-sub-l num">{o.line}</span>
                    {o.staff && <span className="sr-only"> (the staff&apos;s pick)</span>}
                  </button>
                ))}
              </div>
              <div className="tiny dim" aria-hidden="true">
                Energy{subs.on ? '' : ' and fouls'}
                {subs.options.some((o) => o.staff) && (
                  <>
                    {' '}
                    · <Lightbulb size={11} className="accent-text" /> the staff&apos;s pick
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="small dim">Nobody can come in for him right now.</div>
          )}
        </div>
      )}

      <div className="ps-blk">
        <div className="over">
          Shot freedom
          <Help title="Shot freedom">
            <p>
              <b>Green light:</b> he looks for his own shot more and gets the ball more.
            </p>
            <p>
              <b>Normal:</b> he takes the shots his role and tendencies give him.
            </p>
            <p>
              <b>Limited:</b> he passes up shots and gets the ball less.
            </p>
          </Help>
        </div>
        <Chips label={`Shot freedom for ${name}`} value={freedom} onChange={(v: ShotFreedom) => apply((t) => void (t.offense.freedom[pid] = v))} options={FREEDOM} />
      </div>

      {role && (
        <div className="ps-blk">
          <div className="over">Role</div>
          <Chips
            label={`Role for ${name}`}
            value={role}
            onChange={(r: OffRole) => apply((t) => void (t.offense.roles[pid] = r))}
            options={(Object.keys(ROLE_META) as OffRole[]).map((r) => ({ id: r, label: ROLE_META[r].label }))}
          />
          <div className="tiny dim">{ROLE_META[role].help}</div>
        </div>
      )}

      <Toggle
        on={goTo}
        onChange={(on) => apply((t) => void (t.manage.goTo = on ? pid : null))}
        label="Crunch-time go-to"
        help="In the last two minutes of a close fourth quarter or overtime the ball finds him much more, and the offense runs more of what he does best."
      />

      {subs.on && (
        <div className="ps-blk">
          <div className="over">
            Run a play for him
            <Help title="A play for him">
              <p>His best sets, run on your next half-court trip; a clear-out isolation always fits. Each run, their defense reads a set a little better.</p>
            </Help>
          </div>
          <div className="chips" role="group" aria-label={`Plays for ${name}`}>
            {fits.map((id) => {
              const c = { kind: 'set' as const, set: id, pid };
              return (
                <button key={id} className={`chip ${isOn(c) ? 'on' : ''}`} aria-pressed={isOn(c)} title={SETS[id].look} onClick={() => calls.call(c)}>
                  {SETS[id].name}
                </button>
              );
            })}
            <button className={`chip ${isOn({ kind: 'iso', pid }) ? 'on' : ''}`} aria-pressed={isOn({ kind: 'iso', pid })} onClick={() => calls.call({ kind: 'iso', pid })}>
              {CLEAR_OUT.name}
            </button>
          </div>
        </div>
      )}

      {subs.on && oppOn.length > 0 && (
        <div className="ps-blk">
          <div className="over">
            Who he guards
            <Help title="Matchups">
              <p>An assignment holds whenever both are on the floor, for tonight only. Otherwise the staff matches by size and threat.</p>
            </Help>
          </div>
          <div className="chips" role="group" aria-label={`Who ${name} guards`}>
            <button
              className={`chip ${assigned === undefined ? 'on' : ''}`}
              aria-pressed={assigned === undefined}
              onClick={() =>
                apply((t) => {
                  for (const k of Object.keys(t.defense.matchups)) if (t.defense.matchups[+k] === pid) delete t.defense.matchups[+k];
                })
              }
            >
              Staff&apos;s pick
            </button>
            {oppOn.map((o) => {
              const on = assigned !== undefined && +assigned === o;
              return (
                <button
                  key={o}
                  className={`chip ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    apply((t) => {
                      for (const k of Object.keys(t.defense.matchups)) if (t.defense.matchups[+k] === pid || +k === o) delete t.defense.matchups[+k];
                      t.defense.matchups[o] = pid;
                    })
                  }
                >
                  {nameOf(o)}
                  {guarding === o ? ' · now' : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
