// The matchup page's Plan: your plan against this team first (each item with exactly what it
// changes, and how long it lasts), then the staff's counters, the special plans (a star plan, a junk
// defense and who it chases, a defender to attack, players to hack: a row each that opens) and a
// note. Every change is the user's tactics against this team only, on top of his playbook (see
// core/league/gamePlans.ts).
import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { GamePlanItem, League, PlanScope, StarPlan } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { edit } from '../../../state/actions';
import { scoutTeam } from '../../../core/ai/advisor';
import { applyPatch } from '../../../core/sim/tactics';
import { projectedRotation, scoutData } from '../../../core/analysis/scouting';
import { clearPlan, defaultScope, effectiveTactics, ensurePlan, itemGroup, planFor, removePlanItem, setPlanItem, setPlanScope } from '../../../core/league/gamePlans';
import { STAR_PLAN_META } from '../../../core/sim/tactics';
import { playbookLabel } from '../../../core/sim/playbooks';
import { plural } from '../../../core/format';
import { Chips, Help, Ovr, Section, Segmented, Tag } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { AttackCard, JunkCard } from '../../components/GuardPlanner';
import { rosterNames } from '../../stats';
import { teamPlayers } from '../../../core/league/helpers';
import { changesLine, screenChanges } from '../../tactics/changes';
import { liveSeries, NO_PLAN } from '../data';
import { CountersCard } from './CountersCard';
import { Fold } from '../occasion';
import { ftChance } from '../../../core/sim/engine';

export function PlanTab({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const stored = league.gamePlans?.[opp];
  const plan = planFor(league, opp);
  const series = liveSeries(league, opp);
  // (a series plan from a series that's over starts again with the default)
  const kept = (plan ?? stored)?.scope;
  const scope: PlanScope = kept && (kept !== 'series' || series) ? kept : defaultScope(league, opp);
  const base = league.teams[league.userTid].tactics;
  const extras = plan ? plannedExtras(plan) : '';
  return (
    <>
      <Section
        title="Your plan"
        right={
          <span className="row" style={{ gap: 6 }}>
            {plan && (
              <button className="btn xs ghost" disabled={simming} onClick={() => edit((l) => clearPlan(l, opp))}>
                Clear
              </button>
            )}
            <Help title="Game plans">
              <p>
                A <Term id="gameplan">game plan</Term> changes your tactics against this team only, on top of your playbook. It lasts the next game, the series or the season, as
                you pick.
              </p>
            </Help>
          </span>
        }
      >
        {plan && (plan.items.length > 0 || extras) ? (
          <div className="card flush list">
            {plan.items.map((it) => (
              <PlanItemRow key={it.id} league={league} opp={opp} it={it} />
            ))}
            {extras && <div className="mu-item mu-note">Plus {extras}, on Matchups.</div>}
          </div>
        ) : (
          <div className="mu-note">
            {NO_PLAN}. You play {playbookLabel(base)} as usual.
          </div>
        )}
        <div className="mu-scope">
          <span className="over">Plan lasts</span>
          <Segmented
            label="How long the plan lasts"
            value={scope}
            disabled={simming}
            onChange={(sc) =>
              edit((l) => {
                ensurePlan(l, opp);
                setPlanScope(l, opp, sc);
              })
            }
            options={[
              { id: 'next' as PlanScope, label: 'Next game' },
              ...(series ? [{ id: 'series' as PlanScope, label: 'This series' }] : []),
              { id: 'season', label: 'All season' },
            ]}
          />
        </div>
      </Section>

      <CountersCard league={league} opp={opp} />
      <Section title="Special plans">
        <div className="card flush list">
          <StarPlanCard league={league} opp={opp} />
          <JunkCard league={league} opp={opp} fold />
          <AttackCard league={league} opp={opp} fold />
          <HackCard league={league} opp={opp} />
        </div>
      </Section>
      <NoteCard key={`${opp}:${stored?.note ?? ''}`} league={league} opp={opp} />
    </>
  );
}

/** One item in the plan: its name, what it changes from your playbook (why is on its counter's row), and Remove. */
function PlanItemRow({ league, opp, it }: { league: League; opp: number; it: GamePlanItem }) {
  const simming = useStore((s) => !!s.sim);
  const line = useLeagueMemo(() => {
    const base = league.teams[league.userTid].tactics;
    return changesLine(screenChanges(base, applyPatch(base, it.patch)));
  }, [league, it]);
  return (
    <div className="mu-item">
      <span className="grow">
        <span className="lr-name">{it.label}</span>
        {line && <span className="mu-changes">{line}</span>}
      </span>
      <button className="iconbtn" disabled={simming} onClick={() => edit((l) => removePlanItem(l, opp, it.id))} aria-label={`Remove ${it.label}`}>
        <X size={18} />
      </button>
    </div>
  );
}

/** "2 planned matchups", or '' when there are none. */
function plannedExtras(plan: { matchups?: Record<number, number> }) {
  const m = Object.keys(plan.matchups ?? {}).length;
  return m ? plural(m, 'planned matchup') : '';
}

/** A star plan for this opponent: none or a double, on one of their top eight. */
function StarPlanCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 8), [league, opp]);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  // (told apart from every teammate, the injured too, not just the ones shown)
  const names = useLeagueMemo(() => rosterNames(teamPlayers(league, opp)), [league, opp]);
  const sp = eff.defense.starPlan;
  // the player the numbers say they run through, else the one the scouts call their top creator
  const suggested = data.star ?? scout.threats[0]?.pid ?? theirs[0]?.pid ?? null;
  const target = eff.defense.starTarget;
  const set = (plan: StarPlan, tgt: number | null) =>
    edit((l) => {
      const b = l.teams[l.userTid].tactics.defense;
      const items = l.gamePlans?.[opp]?.items.filter((it) => itemGroup(it) === 'star') ?? [];
      // the same as the playbook: no plan item needed
      if (plan === b.starPlan && (plan === 'none' || tgt === b.starTarget)) {
        for (const it of items) removePlanItem(l, opp, it.id);
        return;
      }
      // (named as the chips name him: "R. McBride" when two of them share the name)
      const who = tgt !== null ? names(tgt) || l.players[tgt]?.lastName : 'their top creator';
      const label = plan === 'none' ? 'Play their stars straight' : `Double-team ${who}`;
      setPlanItem(l, opp, { id: `star-${plan}`, label, group: 'star', patch: { defense: { starPlan: plan, starTarget: plan === 'none' ? null : tgt } } });
    });
  const who = target !== null ? names(target) || league.players[target]?.lastName : 'their top creator';
  return (
    <Fold
      title="Star plan"
      peek={sp === 'none' ? STAR_PLAN_META.none.label : `${STAR_PLAN_META[sp].label} · ${who}`}
      help={<Help title="Star plan">A double pays against a star who can&apos;t pass out of it. ★ marks the man their offense runs through.</Help>}
    >
      <div className="mu-fold">
        <div className="mu-group">
          <Chips
            label="Star plan"
            value={sp}
            disabled={simming}
            // from no star plan it goes after the suggested star
            onChange={(x: StarPlan) => set(x, x === 'none' ? null : sp === 'none' ? suggested : target)}
            options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
          />
          {sp !== 'none' && theirs.length > 0 && (
            <div className="mu-sub">
              <div className="over">On</div>
              <Chips
                label="Star plan target"
                value={target ?? -1}
                disabled={simming}
                onChange={(pid: number) => set(sp, pid < 0 ? null : pid)}
                options={[{ id: -1, label: 'Top creator' }, ...theirs.map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.pid === suggested ? ' ★' : ''}` }))]}
              />
            </div>
          )}
        </div>
      </div>
    </Fold>
  );
}

/** The free-throw percentage the engine shoots a player at, from his FT rating. */
const ftPct = ftChance;

/** The league's points per possession this season (last season's before any games): what a hacked trip's two free throws have to beat. */
function leaguePpp(league: League): number | null {
  for (const season of [league.season, league.season - 1]) {
    let pts = 0;
    let poss = 0;
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === season);
      if (ts) {
        pts += ts.ptsFor;
        poss += ts.poss;
      }
    }
    if (poss > 0) return pts / poss;
  }
  return null;
}

/** Hack-a-player: their poor free-throw shooters to foul on purpose, and the quarter it starts. */
function HackCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 10), [league, opp]);
  // (told apart from every teammate, the injured too, not just the ones shown)
  const names = useLeagueMemo(() => rosterNames(teamPlayers(league, opp)), [league, opp]);
  const fromQ = eff.manage.hackFromQ ?? 1;
  // two free throws pay against a normal possession below half the league's points per possession
  const ppp = useLeagueMemo(() => leaguePpp(league), [league]);
  const breakEven = ppp !== null ? Math.round((ppp / 2) * 100) : null;
  // their poor shooters: within a few points of paying (under 70% before the league has a number), six
  // at most, and anyone already on the list
  const poor = breakEven !== null ? (breakEven + 5) / 100 : 0.7;
  const sorted = [...theirs].sort((a, b) => a.ratings.ft - b.ratings.ft);
  const targets = eff.manage.hackTargets ?? [];
  const rows = sorted.filter((p, i) => (i < 6 && ftPct(p.ratings.ft) < poor) || targets.includes(p.pid));
  const set = (pids: number[], q: number) =>
    edit((l) => {
      if (!pids.length) {
        removePlanItem(l, opp, 'hack');
        return;
      }
      const who = pids.map((pid) => names(pid) || (l.players[pid]?.lastName ?? '')).join(', ');
      setPlanItem(l, opp, { id: 'hack', label: `Hack-a-${who}${q > 1 ? ` from Q${q}` : ''}`, group: 'hack', patch: { manage: { hackTargets: pids, hackFromQ: q } } });
    });
  return (
    <Fold
      title="Hack-a-player"
      peek={targets.length ? targets.map((pid) => names(pid)).join(', ') + (fromQ > 1 ? ` from Q${fromQ}` : '') : 'Nobody'}
      help={
        <Help title="Hack-a-player">
          <p>Foul a poor free-throw shooter on purpose, from the quarter you pick. Never in a period&apos;s last two minutes, and their coach sits a man hacked twice.</p>
        </Help>
      }
    >
      {/* nobody worth fouling: say who comes closest, rather than offer a 76% shooter */}
      {!rows.length && sorted[0] && (
        <div className="mu-note">
          Nobody in their rotation is a poor free-throw shooter. The worst, {names(sorted[0].pid)}, makes {Math.round(ftPct(sorted[0].ratings.ft) * 100)}%.
        </div>
      )}
      <div className="list mu-hack-list" hidden={!rows.length}>
        {breakEven !== null && (
          <div className="list-divider list-h" aria-hidden="true">
            <span>Worth it against a poor free-throw shooter</span>
            <span className="as-is">FT%</span>
          </div>
        )}
        {rows.map((p) => {
          const on = targets.includes(p.pid);
          const pct = Math.round(ftPct(p.ratings.ft) * 100);
          return (
            <button
              key={p.pid}
              className={`mu-hack ${on ? 'on' : ''}`}
              aria-pressed={on}
              disabled={simming}
              onClick={() => set(on ? targets.filter((x) => x !== p.pid) : [...targets, p.pid], fromQ)}
            >
              <span className="mu-check" aria-hidden="true">
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <Ovr v={p.ovr} size="sm" />
              <span className="grow lr-name">{names(p.pid)}</span>
              {breakEven !== null && pct < breakEven && <Tag tone="good">Worth it</Tag>}
              {/* (the column is named once in its header when there is one) */}
              <span className="num mu-ft">{breakEven !== null ? pct : `FT ${pct}%`}</span>
            </button>
          );
        })}
        {targets.length > 0 && (
          <div className="mu-item">
            <span className="over">From</span>
            <Chips
              label="Hack from quarter"
              value={fromQ}
              disabled={simming}
              onChange={(q: number) => set(targets, q)}
              options={[1, 2, 3, 4].map((q) => ({ id: q, label: `Q${q}` }))}
            />
          </div>
        )}
      </div>
    </Fold>
  );
}

/** Keeps a note with the plan against `opp`, if it changed and its league is still the one open. */
function saveNote(leagueId: string, opp: number, text: string) {
  const { league } = useStore.getState();
  const note = text.trim();
  if (league?.id !== leagueId || note === (league.gamePlans?.[opp]?.note ?? '')) return;
  edit((l) => {
    const p = ensurePlan(l, opp);
    if (note) p.note = note;
    else delete p.note;
  });
}

/** A free-text note kept with the plan. */
function NoteCard({ league, opp }: { league: League; opp: number }) {
  const saved = league.gamePlans?.[opp]?.note ?? '';
  const [text, setText] = useState(saved);
  // typing not saved yet: kept when the screen closes with the note still focused (Android's back
  // button, a swipe back), where no blur comes; null once saved, so a cleared plan stays cleared
  const unsaved = useRef<string | null>(null);
  const id = league.id;
  useEffect(
    () => () => {
      if (unsaved.current !== null) saveNote(id, opp, unsaved.current);
    },
    [id, opp],
  );
  return (
    <Section title="Notes">
      <textarea
        className="mu-note-input"
        value={text}
        maxLength={500}
        placeholder={`Anything to remember against the ${league.teams[opp].name}`}
        aria-label="Notes for this game plan"
        onChange={(e) => {
          setText(e.target.value);
          unsaved.current = e.target.value;
        }}
        onBlur={() => {
          unsaved.current = null;
          saveNote(id, opp, text);
        }}
      />
    </Section>
  );
}
