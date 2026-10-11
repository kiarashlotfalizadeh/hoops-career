import { useLeague, useStore } from '../../state/store';
import { ROLE_META, archetype } from '../../core/ratings';
import type { OffRole, Player, ShotFreedom, Tactics } from '../../core/types';
import { Segmented } from './ui';

/** Offensive role and shot freedom for one of the user's players, from Tactics > Roles or his own page. */
export function RoleEditor({ p, onDone }: { p: Player; onDone: () => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const natural = archetype(p.ratings).role;
  const edit = (fn: (tt: Tactics) => void) =>
    useStore.getState().mutate((l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="small dim2">
        Natural fit: {ROLE_META[natural].label} ({p.archetype}).
      </div>
      <div className="col" style={{ gap: 6 }}>
        {(Object.keys(ROLE_META) as OffRole[]).map((r) => {
          const on = (t.offense.roles[p.pid] ?? natural) === r;
          return (
            <button
              key={r}
              className="card tight"
              aria-pressed={on}
              style={{ textAlign: 'left', borderColor: on ? 'var(--accent)' : undefined }}
              onClick={() => edit((tt) => void (tt.offense.roles[p.pid] = r))}
            >
              <div className="bold small">{ROLE_META[r].label}</div>
              <div className="tiny dim">{ROLE_META[r].help}</div>
            </button>
          );
        })}
      </div>
      <div>
        <div className="small bold" style={{ marginBottom: 6 }}>
          Shot freedom
        </div>
        <Segmented
          value={String(t.offense.freedom[p.pid] ?? 0)}
          onChange={(x) => edit((tt) => void (tt.offense.freedom[p.pid] = Number(x) as ShotFreedom))}
          label="Shot freedom"
          options={[
            { id: '-1', label: 'Limited' },
            { id: '0', label: 'Normal' },
            { id: '1', label: 'Green light' },
          ]}
        />
      </div>
      <button className="btn block" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
