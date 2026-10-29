// A player's sheet (the tactics board and bench, his own page): his roles at both ends, each one the
// switch to that end's list, where every role shows how well he suits it (★), his best and natural
// roles marked. Then his player instructions: shot freedom, his duty on the offensive glass, and
// whether he's one of your preferred ball screeners.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { ROLE_META, archetype } from '../../core/ratings';
import { rosterSorted } from '../../core/league/helpers';
import { DEF_ROLES, type DefRole, type GlassDuty, type OffRole, type Player, type ShotFreedom, type Tactics } from '../../core/types';
import { betterFit, defRoleFits, roleFits, roleScale, roleStars } from '../../core/analysis/system';
import { DEF_ROLE_META, GLASS_META, defRoleOf } from '../../core/sim/tactics';
import { ordinal as ordinalOf, rosterNames } from '../stats';
import { Help, Section, Segmented, Toggle } from './ui';
import '../screens/team.css';
import '../tactics/bench.css';

type Side = 'off' | 'def';

/** Stars for a fit (`n`, against the league's rotation players at the role: roleStars), the empty ones dimmed. */
export function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span className="tm-role-stars" role="img" aria-label={label ?? `${n} of 5`}>
      {'★'.repeat(n)}
      <span className="dim">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** Roles at both ends, shot freedom, glass duty and screens for one of the user's players. */
export function RoleEditor({ p, onDone, side: initial = 'off' }: { p: Player; onDone: () => void; side?: Side }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const [side, setSide] = useState<Side>(initial);
  const natural = archetype(p.ratings).role;
  const offFits = roleFits(p);
  const defFits = defRoleFits(p);
  const scale = useLeagueMemo(() => roleScale(league), [league]);
  const stars = (s: Side, r: string, v: number) => roleStars((s === 'off' ? scale.off : scale.def)[r as OffRole & DefRole], v);
  const busy = useStore((s) => !!s.sim);
  const edit = (label: string, fn: (tt: Tactics) => void) =>
    act(label, (l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  const offRole = t.offense.roles[p.pid] ?? natural;
  const defRole = defRoleOf(t.defense, p.pid);
  const roles = side === 'off' ? (Object.keys(ROLE_META) as OffRole[]) : DEF_ROLES;
  const fits: Record<string, number> = side === 'off' ? offFits : defFits;
  const cur = side === 'off' ? offRole : defRole;
  // a role that suits him clearly better than the one he plays (two stars or more: one is within the fits' noise)
  const better = side === 'off' ? betterFit(scale.off, offFits, offRole) : betterFit(scale.def, defFits, defRole);
  const glass = (t.offense.glass?.[p.pid] ?? 0) as GlassDuty;
  const roster = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(roster), [roster]);
  const screens = t.offense.screeners.indexOf(p.pid);
  return (
    <div className="tm-ed">
      {/* his roles at both ends, each the switch to its list */}
      <div className="tm-ed-sum" role="group" aria-label="Which end's role">
        {(
          [
            ['off', 'In possession', ROLE_META[offRole].label, stars('off', offRole, offFits[offRole])],
            ['def', 'Out of possession', DEF_ROLE_META[defRole].label, stars('def', defRole, defFits[defRole])],
          ] as const
        ).map(([id, end, role, n]) => (
          <button key={id} className={`tm-ed-pair${side === id ? ' on' : ''}`} aria-pressed={side === id} onClick={() => setSide(id)}>
            <span className="over">{end}</span>
            <span className="tm-ed-role">
              <span className="ellipsis">{role}</span> <Stars n={n} />
            </span>
          </button>
        ))}
      </div>
      <Section
        title={side === 'off' ? 'Roles in possession' : 'Roles out of possession'}
        right={
          <Help title="Roles">
            <p>★ is how well he suits a role. One star either way is within what the ratings can tell.</p>
            <p>
              <b>Better fit</b> marks a role two or more stars above his.
            </p>
          </Help>
        }
      >
        <div className="card flush list">
          {roles.map((r) => {
            const on = cur === r;
            const meta = side === 'off' ? ROLE_META[r as OffRole] : DEF_ROLE_META[r as DefRole];
            return (
              <button
                key={r}
                className={`tm-role-opt ${on ? 'on' : ''}`}
                aria-pressed={on}
                disabled={busy}
                onClick={() =>
                  edit(side === 'off' ? 'Set his role' : 'Set his defensive role', (tt) => {
                    if (side === 'off') tt.offense.roles[p.pid] = r as OffRole;
                    else if (r === 'standard') {
                      if (tt.defense.roles) delete tt.defense.roles[p.pid];
                    } else (tt.defense.roles ??= {})[p.pid] = r as DefRole;
                  })
                }
              >
                <span className="grow">
                  <span className="tm-role-opt-l">
                    <span className="ellipsis">{meta.label}</span>
                    {r === better && <span className="tag good">Better fit</span>}
                    {side === 'off' && r === natural && <span className="tag">Natural</span>}
                    <Stars n={stars(side, r, fits[r])} label={`${stars(side, r, fits[r])} of 5 for it`} />
                  </span>
                  <span className="tm-role-opt-h">{meta.help}</span>
                </span>
                <span className="tm-role-check" aria-hidden="true">
                  {on && <Check size={16} />}
                </span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section
        title="Player instructions"
        right={
          <Help title="Player instructions">
            <p>
              <b>Shot freedom:</b> how many of his chances he takes, whatever his role. Limited passes up all but open looks.
            </p>
            {([1, 0, -1] as const).map((g) => (
              <p key={g}>
                <b>{g === 0 ? 'Offensive glass, as the team' : GLASS_META[g].label}:</b> {GLASS_META[g].help}
              </p>
            ))}
            <p>
              <b>Preferred ball screener:</b> he sets your ball screens first, in the order you picked. With none picked, the offense chooses.
            </p>
          </Help>
        }
      >
        <div className="card col tm-ed-ins">
          <div className="col tm-ed-in">
            <span className="over">Shot freedom</span>
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
          </div>
          <div className="col tm-ed-in">
            <span className="over">Offensive glass</span>
            <Segmented
              value={String(glass)}
              disabled={busy}
              onChange={(x) =>
                edit('Set his glass duty', (tt) => {
                  const g = Number(x) as GlassDuty;
                  if (g) (tt.offense.glass ??= {})[p.pid] = g;
                  else if (tt.offense.glass) {
                    delete tt.offense.glass[p.pid];
                    if (!Object.keys(tt.offense.glass).length) delete tt.offense.glass;
                  }
                })
              }
              label="Offensive glass"
              options={[
                { id: '-1', label: GLASS_META[-1].label },
                { id: '0', label: 'As the team' },
                { id: '1', label: GLASS_META[1].label },
              ]}
            />
          </div>
          <Toggle
            on={screens >= 0}
            disabled={busy}
            onChange={(on) =>
              edit(on ? 'Make him a preferred screener' : 'Take him off the screeners', (tt) => {
                const list = tt.offense.screeners.filter((x) => x !== p.pid);
                tt.offense.screeners = on ? [...list, p.pid] : list;
              })
            }
            label={screens >= 0 && t.offense.screeners.length > 1 ? `Preferred ball screener · ${ordinalOf(screens + 1)}` : 'Preferred ball screener'}
            help={t.offense.screeners.length ? `In order: ${t.offense.screeners.map((x) => nameOf(x)).join(', ')}.` : 'None picked: the offense chooses.'}
          />
        </div>
      </Section>
      <button className="btn block" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
