// A player's sheet (the tactics board and bench, his own page): his roles at both ends, each picked
// from every role with how well he suits it (★), how well he'd know the pair it makes (a new pair is
// played a step slow until it's drilled) and, for the offensive ones, the partnerships it would make
// with the starting five; his best and natural roles marked. Then his player instructions: shot
// freedom, his duty on the offensive glass, and whether he's one of your preferred ball screeners.
import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { act } from '../../state/actions';
import { ROLE_META, archetype } from '../../core/ratings';
import { rosterSorted } from '../../core/league/helpers';
import { LINK_META, linkState, linksByRole, lineupLinks, type Link } from '../../core/sim/links';
import { DEF_ROLES, type DefRole, type GlassDuty, type OffRole, type Player, type ShotFreedom, type Tactics } from '../../core/types';
import { fitStars, defRoleFits, miscast, roleFits } from '../../core/analysis/system';
import { DEF_ROLE_META, GLASS_META, defRoleOf } from '../../core/sim/tactics';
import { NATURAL_PAIR, NEW_KNOW, NEW_PAIR, famLabel, FLUID, knowOf, roleFam } from '../../core/sim/familiarity';
import { teamFam } from '../tactics/fam';
import { famTone } from '../tactics/formation';
import { linkTone, startersOf } from '../tactics/partners';
import { ordinal as ordinalOf, rosterNames } from '../stats';
import { Help, Section, Segmented, Toggle } from './ui';
import { Term } from './Glossary';
import '../screens/team.css';
import '../tactics/links.css';

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

/** A player's links in a few words, from his side: "Two-man game with Holmgren". */
const linkWith = (l: Link, pid: number, name: (pid: number) => string) => `${LINK_META[l.id].label} with ${name(l.a === pid ? l.b : l.a)}`;

/** Roles at both ends, shot freedom, glass duty and screens for one of the user's players. */
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
  // the five he'd play with: the starters, him among them (a bench player as if he joined them)
  const roster = useLeagueMemo(() => rosterSorted(league, league.userTid), [league]);
  const nameOf = useMemo(() => rosterNames(roster), [roster]);
  const order = league.teams[league.userTid].rotation?.order;
  const group = useLeagueMemo(() => {
    const { five } = startersOf(order ?? [], roster);
    return five.some((x) => x.pid === p.pid) ? five : [...five, p];
  }, [order, roster, p]);
  const starter = group.length === 5;
  const mine = useLeagueMemo(() => lineupLinks(t, group, fam).links.filter((l) => l.a === p.pid || l.b === p.pid), [t, group, fam, p.pid]);
  const byRole = useLeagueMemo(() => (side === 'off' ? linksByRole(t, group, p.pid, fam) : {}), [t, group, fam, p.pid, side]);
  const screens = t.offense.screeners.indexOf(p.pid);
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
            <p>
              <b>Partnerships:</b> what his roles make with {starter ? 'the rest of the starting five' : 'the starting five, if he played with them'} (
              <Term id="partnership">partnerships</Term>), and how well each plays.
            </p>
          </Help>
        </div>
        <div className="tm-ed-links">
          <span className="over">{starter ? 'Partnerships' : 'With the starters'}</span>
          {mine.length ? (
            mine.map((l) => (
              <span key={`${l.id}${l.a}${l.b}`} className="tm-ed-link">
                {linkWith(l, p.pid, nameOf)} <b className={`tx-link-w ${linkTone(l)}`}>{linkState(l).word}</b>
              </span>
            ))
          ) : (
            <span className="tm-ed-link dim">None in these roles</span>
          )}
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
                  {side === 'off' && byRole[r as OffRole] && <span className="tm-role-links">{byRole[r as OffRole]!.map((l) => linkWith(l, p.pid, nameOf)).join(' · ')}</span>}
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
        title="Player instructions"
        right={
          <Help title="Player instructions">
            <p>
              <b>Shot freedom:</b> how many of the shots that come his way he takes: a green light looks for his own, limited passes up all but the open ones. It scales his shot
              volume whatever his role.
            </p>
            {([1, 0, -1] as const).map((g) => (
              <p key={g}>
                <b>{g === 0 ? 'Offensive glass, as the team' : GLASS_META[g].label}:</b> {GLASS_META[g].help}
              </p>
            ))}
            <p>
              <b>Preferred ball screener:</b> he sets your ball screens first; with several, in the order you picked them. With none picked, the offense chooses.
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
