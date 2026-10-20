// A player's role sheet (Tactics → Players, the tactics board, his own page): his roles at both ends,
// each picked from every role with how well he suits it (★) and how well he'd know the pair it makes
// (a new pair is played a step slow until it's drilled), his best and natural roles marked; then his
// shot freedom and his duty on the offensive glass.
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { ROLE_META, archetype } from '../../core/ratings';
import { DEF_ROLES, type DefRole, type GlassDuty, type OffRole, type Player, type ShotFreedom, type Tactics } from '../../core/types';
import { fitStars, defRoleFits, miscast, roleFits } from '../../core/analysis/system';
import { DEF_ROLE_META, GLASS_META, defRoleOf } from '../../core/sim/tactics';
import { NATURAL_PAIR, NEW_KNOW, NEW_PAIR, famLabel, FLUID, knowOf, roleFam } from '../../core/sim/familiarity';
import { teamFam } from '../tactics/fam';
import { famTone } from '../tactics/formation';
import { Help, Section, Segmented } from './ui';
import { Term } from './Glossary';
import '../screens/team.css';

type Side = 'off' | 'def';

/** Stars for a fit, the empty ones dimmed. */
export function Stars({ v, label }: { v: number; label?: string }) {
  const n = fitStars(v);
  return (
    <span className="tm-role-stars" role="img" aria-label={label ?? `${n} of 5`}>
      {'★'.repeat(n)}
      <span className="dim">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

const withRole = (t: Tactics, pid: number, side: Side, r: string): Tactics =>
  side === 'off'
    ? { ...t, offense: { ...t.offense, roles: { ...t.offense.roles, [pid]: r as OffRole } } }
    : { ...t, defense: { ...t.defense, roles: { ...t.defense.roles, [pid]: r as DefRole } } };

/** Roles at both ends, shot freedom and glass duty for one of the user's players. */
export function RoleEditor({ p, onDone, side: initial = 'off' }: { p: Player; onDone: () => void; side?: Side }) {
  const league = useLeague();
  const t = league.teams[league.userTid].tactics;
  const fam = useLeagueMemo(() => teamFam(league), [league]);
  const [side, setSide] = useState<Side>(initial);
  const natural = archetype(p.ratings).role;
  const offFits = roleFits(p);
  const defFits = defRoleFits(p);
  const busy = useStore((s) => !!s.sim);
  const edit = (label: string, fn: (tt: Tactics) => void) =>
    act(label, (l) => {
      const tt = l.teams[l.userTid].tactics;
      fn(tt);
      tt.manual = true;
    });
  const offRole = t.offense.roles[p.pid] ?? natural;
  const defRole = defRoleOf(t.defense, p.pid);
  const pair = roleFam(fam, t, p);
  const know = knowOf(fam, p.pid);
  const roles = side === 'off' ? (Object.keys(ROLE_META) as OffRole[]) : DEF_ROLES;
  const fits: Record<string, number> = side === 'off' ? offFits : defFits;
  const cur = side === 'off' ? offRole : defRole;
  // a role that suits him clearly better than the one he plays (two stars or more: one is within the fits' noise)
  const better = miscast(fits, cur);
  const glass = (t.offense.glass?.[p.pid] ?? 0) as GlassDuty;
  return (
    <div className="tm-ed">
      {/* his pair and how well he knows it, over the pickers */}
      <div className="tm-ed-sum">
        <div className="tm-ed-pair">
          <span className="over">In possession</span>
          <span className="tm-ed-role">
            {ROLE_META[offRole].label} <Stars v={offFits[offRole]} />
          </span>
        </div>
        <div className="tm-ed-pair">
          <span className="over">Out of possession</span>
          <span className="tm-ed-role">
            {DEF_ROLE_META[defRole].label} <Stars v={defFits[defRole]} />
          </span>
        </div>
        <div className="tm-ed-fam">
          <span>
            Role pair <b className={famTone(pair)}>{Math.round(pair)}%</b> {famLabel(pair)}
          </span>
          <span>
            Knows the system <b className={famTone(know)}>{Math.round(know)}%</b>
          </span>
          <Help title="His familiarity">
            <p>
              <b>Role pair:</b> how well he knows the two roles you give him together. A pair he&apos;s new to starts at {NEW_PAIR} ({NATURAL_PAIR} when the offensive one is his
              natural role) and builds with his minutes and practice; below {FLUID} he plays it a step slow.
            </p>
            <p>
              ★ is how well he suits a role. One star either way is within what the ratings can tell; <b>Better fit</b> marks a role two or more stars above the one he plays.
            </p>
            <p>
              <b>Knows the system:</b> your playbook as a whole. A new arrival starts at {NEW_KNOW}. See <Term id="familiarity">familiarity</Term>.
            </p>
          </Help>
        </div>
      </div>
      <Segmented
        value={side}
        onChange={setSide}
        label="Which end's role"
        options={[
          { id: 'off', label: 'In possession' },
          { id: 'def', label: 'Out of possession' },
        ]}
      />
      <Section title={side === 'off' ? 'Offensive role' : 'Defensive role'} right={<span className="tm-sec-hint">★ suits him · % he&apos;d know the pair</span>}>
        <div className="card flush list">
          {roles.map((r) => {
            const on = cur === r;
            const meta = side === 'off' ? ROLE_META[r as OffRole] : DEF_ROLE_META[r as DefRole];
            const f = on ? pair : roleFam(fam, withRole(t, p.pid, side, r), p);
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
                    <Stars v={fits[r]} label={`${fitStars(fits[r])} of 5 for it`} />
                  </span>
                  <span className="tm-role-opt-h">{meta.help}</span>
                </span>
                <span className={`tm-role-fam num ${famTone(f)}`}>
                  <span className="sr-only">He&apos;d know the pair: </span>
                  {Math.round(f)}%
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
        title="Shot freedom"
        right={
          <Help title="Shot freedom">
            How many of the shots that come his way he takes: a green light looks for his own, limited passes up all but the open ones. It scales his shot volume whatever his role.
          </Help>
        }
      >
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
      <Section
        title="Offensive glass"
        right={
          <Help title="Offensive glass">
            {([1, 0, -1] as const).map((g) => (
              <p key={g}>
                <b>{GLASS_META[g].label}:</b> {GLASS_META[g].help}
              </p>
            ))}
          </Help>
        }
      >
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
      </Section>
      <button className="btn block" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
