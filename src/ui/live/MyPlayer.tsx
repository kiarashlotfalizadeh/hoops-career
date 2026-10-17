import { Users } from 'lucide-react';
import type { League, OffRole, Settings, ShotFreedom, Tactics } from '../../core/types';
import { ROLE_META } from '../../core/ratings';
import { CLEAR_OUT, SETS } from '../../core/sim/sets';
import { Chips, Statline, Toggle } from '../components/ui';
import type { DrawnPlayer } from './drawn';

/** A player's night so far, at the top of his sheet (yours or theirs). */
export function PlayerLine({ p }: { p: DrawnPlayer }) {
  const e = Math.round(p.energy * 100);
  return (
    <div className="card ps-fig">
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
import { callLabel, fitPlayers, setsFor, type Calls } from './plays';

const FREEDOM: { id: ShotFreedom; label: string }[] = [
  { id: 1, label: 'Green light' },
  { id: 0, label: 'Normal' },
  { id: -1, label: 'Limited' },
];

/**
 * One of your players on the floor: his line tonight, and orders for him (as deep as the coaching
 * depth): sub him out (the Subs sheet opens with him picked), his shot freedom, and from Advanced his
 * role and a play run for him, from Expert crunch-time go-to and who he guards. Everything goes through your tactics or a play call,
 * so the game's journal keeps it, and "Keep changes after this game" treats it like any other change
 * (tonight's matchups excepted).
 */
export function MyPlayer({
  league,
  p,
  name,
  tactics,
  complexity,
  oppOn,
  guarding,
  nameOf,
  apply,
  calls,
  onSub,
}: {
  league: League;
  p: DrawnPlayer;
  name: string;
  tactics: Tactics;
  complexity: Settings['complexity'];
  /** Their five on the floor. */
  oppOn: number[];
  /** The one of theirs he guards now, if any. */
  guarding?: number;
  nameOf: (pid: number) => string;
  apply: (fn: (t: Tactics) => void) => void;
  calls: Calls;
  onSub: () => void;
}) {
  const adv = complexity !== 'simple';
  const expert = complexity === 'expert';
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
      <button className="btn block" onClick={onSub}>
        <Users size={16} /> Sub him out
      </button>

      <div className="ps-blk">
        <div className="over">Shot freedom tonight</div>
        <Chips label={`Shot freedom for ${name}`} value={freedom} onChange={(v: ShotFreedom) => apply((t) => void (t.offense.freedom[pid] = v))} options={FREEDOM} />
        <div className="tiny dim">
          {freedom === 1
            ? 'He looks for his own shot more and gets the ball more.'
            : freedom === -1
              ? 'He passes up shots and gets the ball less.'
              : 'He takes the shots his role and tendencies give him.'}
        </div>
      </div>

      {adv && role && (
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

      {expert && (
        <Toggle
          on={goTo}
          onChange={(on) => apply((t) => void (t.manage.goTo = on ? pid : null))}
          label="Crunch-time go-to"
          help="In the last two minutes of a close fourth quarter or overtime the ball finds him much more, and the offense runs more of what he does best."
        />
      )}

      {adv && (
        <div className="ps-blk">
          <div className="over">Run a play for him</div>
          {pending && <div className="small">Called: {callLabel(pending, nameOf)}</div>}
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
          <div className="tiny dim">
            {fits.length
              ? 'His best sets, run on your next half-court trip. Each run, their defense reads it a little better.'
              : 'No set fits him well; a clear-out isolation always does.'}
          </div>
        </div>
      )}

      {expert && oppOn.length > 0 && (
        <div className="ps-blk">
          <div className="over">Who he guards</div>
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
              Staff's pick
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
                  {guarding === o ? ' (now)' : ''}
                </button>
              );
            })}
          </div>
          <div className="tiny dim">An assignment holds whenever both are on the floor, for tonight only.</div>
        </div>
      )}
    </div>
  );
}
