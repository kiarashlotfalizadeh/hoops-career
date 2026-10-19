import { Check } from 'lucide-react';
import { useLeague, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { ROLE_META, archetype } from '../../core/ratings';
import type { OffRole, Player, ShotFreedom, Tactics } from '../../core/types';
import { fitStars, roleFits } from '../../core/analysis/system';
import { Section, Segmented } from './ui';
import '../screens/team.css';

/** Offensive role and shot freedom for one of the user's players, from Tactics > Players or his own page. */
export function RoleEditor({ p, onDone }: { p: Player; onDone: () => void }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const natural = archetype(p.ratings).role;
  const fits = roleFits(p);
  const busy = useStore((s) => !!s.sim);
  const edit = (label: string, fn: (tt: Tactics) => void) =>
    act(label, (l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  return (
    <div className="tm-ed">
      <Section title="Offensive role" right={<span className="tm-sec-hint">{p.archetype}</span>}>
        <div className="card flush list">
          {(Object.keys(ROLE_META) as OffRole[]).map((r) => {
            const on = (t.offense.roles[p.pid] ?? natural) === r;
            return (
              <button
                key={r}
                className={`tm-role-opt ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={busy}
                onClick={() => edit('Set his role', (tt) => void (tt.offense.roles[p.pid] = r))}
              >
                <span className="grow">
                  <span className="tm-role-opt-l">
                    {ROLE_META[r].label}
                    {r === natural && <span className="tag">Natural</span>}
                    <span className="tm-role-stars" aria-label={`${fitStars(fits[r])} of 5 for it`}>
                      {'★'.repeat(fitStars(fits[r]))}
                      <span className="dim">{'★'.repeat(5 - fitStars(fits[r]))}</span>
                    </span>
                  </span>
                  <span className="tm-role-opt-h">{ROLE_META[r].help}</span>
                </span>
                <span className="tm-role-check" aria-hidden="true">
                  {on && <Check size={16} />}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Shot freedom">
        <Segmented
          value={String(t.offense.freedom[p.pid] ?? 0)}
          disabled={busy}
          onChange={(x) => edit('Set his shot freedom', (tt) => void (tt.offense.freedom[p.pid] = Number(x) as ShotFreedom))}
          label="Shot freedom"
          options={[
            { id: '-1', label: 'Limited' },
            { id: '0', label: 'Normal' },
            { id: '1', label: 'Green light' },
          ]}
        />
      </Section>
      <button className="btn block" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
