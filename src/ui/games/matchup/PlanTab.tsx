// The matchup page's Plan: your plan against this team first (each item with exactly what it
// changes, and how long it lasts), then the staff's counters, a star plan, a junk
// defense and who it chases, a defender to attack, players to hack, and a note. Every change is the
// user's tactics against this team only, on top of his playbook (see core/league/gamePlans.ts).
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
                A <Term id="gameplan">game plan</Term> changes your tactics against this team only, on top of your playbook: the counters you add, a star plan, a junk defense, a
                defender to attack, players to hack, and who guards whom (Matchups). Your playbook itself never changes.
              </p>
              <p>Next game: used up when you play them. This series: until the playoff series is decided. All season: every meeting this season. Plans clear at the new season.</p>
            </Help>
          </span>
        }
      >
        {plan && (plan.items.length > 0 || extras) ? (
          <div className="card flush list">
            {plan.items.map((it) => (
              <PlanItemRow key={it.id} league={league} opp={opp} it={it} />
            ))}
            {extras && <div className="mu-item mu-note">Plus {extras} (Matchups).</div>}
          </div>
        ) : (
          <div className="mu-note">
            {NO_PLAN}: you play your playbook ({playbookLabel(base)}). Add a counter or set any card below.
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
      <StarPlanCard league={league} opp={opp} />
      <JunkCard league={league} opp={opp} />
      <AttackCard league={league} opp={opp} />
      <HackCard league={league} opp={opp} />
      <NoteCard key={`${opp}:${stored?.note ?? ''}`} league={league} opp={opp} />
    </>
  );
}

/** One item in the plan: its name, what it changes from your playbook, why, and Remove. */
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
        {it.evidence && <span className="lr-meta">{it.evidence}</span>}
      </span>
      <button className="iconbtn" disabled={simming} onClick={() => edit((l) => removePlanItem(l, opp, it.id))} aria-label={`Remove ${it.label}`}>
        <X size={18} />
      </button>
    </div>
  );
}

/** "2 planned matchups and 3 guarding instructions", or '' when there are none. */
function plannedExtras(plan: { matchups?: Record<number, number>; playerD?: Record<number, unknown> }) {
  const m = Object.keys(plan.matchups ?? {}).length;
  const d = Object.keys(plan.playerD ?? {}).length;
  return [m ? plural(m, 'planned matchup') : '', d ? plural(d, 'guarding instruction') : ''].filter(Boolean).join(' and ');
}

/** A star plan for this opponent: none, deny or double, on one of their top eight. */
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
      const label = plan === 'none' ? 'Play their stars straight' : plan === 'double' ? `Double-team ${who}` : `Deny ${who}`;
      setPlanItem(l, opp, { id: `star-${plan}`, label, group: 'star', patch: { defense: { starPlan: plan, starTarget: plan === 'none' ? null : tgt } } });
    });
  return (
    <Section
      title={
        <h3>
          <Term id="starplan">Star plan</Term>
        </h3>
      }
      right={
        <Help title="Star plan">
          Deny keeps the ball out of one player&apos;s hands; a double team sends a second defender when he attacks. Without a target it goes after their primary creator. ★ is the
          player their offense runs through by the numbers, or their best shot creator by the scouts.
        </Help>
      }
    >
      <div className="mu-group">
        <Chips
          label="Star plan"
          value={sp}
          disabled={simming}
          // from no star plan it goes after the suggested star; between deny and double the target picked (Top creator too) stays
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
    </Section>
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
  // their poor shooters: under 70% from the line, three at least, six at most
  const sorted = [...theirs].sort((a, b) => a.ratings.ft - b.ratings.ft);
  const rows = sorted.slice(0, Math.max(3, Math.min(6, sorted.filter((p) => ftPct(p.ratings.ft) < 0.7).length)));
  const targets = eff.manage.hackTargets ?? [];
  const fromQ = eff.manage.hackFromQ ?? 1;
  // two free throws pay against a normal possession below half the league's points per possession
  const ppp = useLeagueMemo(() => leaguePpp(league), [league]);
  const breakEven = ppp !== null ? Math.round((ppp / 2) * 100) : null;
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
    <Section
      title="Hack-a-player"
      right={
        <Help title="Hack-a-player">
          <p>
            Foul a poor free-throw shooter on purpose whenever he&apos;s on the floor, from the quarter you pick: two free throws for him instead of a normal possession
            {ppp !== null ? (
              <>
                {' '}
                (the league scores {ppp.toFixed(2)} points a possession), so it pays below about {breakEven}% from the line
              </>
            ) : null}
            . Never in the last two minutes of a period, where it costs a free throw and the ball.
          </p>
          <p>Their staff benches a player hacked twice in a period when a reserve his size can come in.</p>
        </Help>
      }
    >
      <div className="card flush list">
        {breakEven !== null && (
          <div className="list-divider list-h" aria-hidden="true">
            <span>Pays under {breakEven}% from the line</span>
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
              {breakEven !== null && pct < breakEven && <Tag tone="good">Pays</Tag>}
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
    </Section>
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
