// The matchup page's Plan: how long the plan lasts, what's in it, the staff's counters with the
// numbers behind them, a star plan, a junk defense and who it chases, a defender to attack, players
// to hack, and a note. Every change is the user's tactics against this team only, on top of his
// playbook (see core/league/gamePlans.ts).
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import type { League, PlanScope, StarPlan } from '../../../core/types';
import { useLeagueMemo, useStore } from '../../../state/store';
import { edit } from '../../../state/actions';
import { counterCandidates, scoutTeam } from '../../../core/ai/advisor';
import type { Candidate } from '../../../core/ai/lab';
import { projectedRotation, scoutData } from '../../../core/analysis/scouting';
import { clearPlan, defaultScope, effectiveTactics, ensurePlan, itemGroup, planFor, removePlanItem, setPlanItem, setPlanScope } from '../../../core/league/gamePlans';
import { STAR_PLAN_META } from '../../../core/sim/tactics';
import { playbookLabel } from '../../../core/sim/playbooks';
import { Chips, Help, Ovr, Section, Segmented } from '../../components/ui';
import { Term } from '../../components/Glossary';
import { AttackCard, JunkCard } from '../../components/GuardPlanner';
import { rosterNames } from '../../stats';
import { liveSeries } from '../data';

/** Counters shown before "more": the ones the numbers back come first. */
const COUNTERS_SHOWN = 4;

const SCOPE_NOTE: Record<PlanScope, string> = {
  next: 'Used up when you play them next.',
  series: 'Lasts until this series is decided.',
  season: 'Every game against them this season.',
};

export function PlanTab({ league, opp, onTest }: { league: League; opp: number; onTest: () => void }) {
  const simming = useStore((s) => !!s.sim);
  const stored = league.gamePlans?.[opp];
  const plan = planFor(league, opp);
  const series = liveSeries(league, opp);
  // (a series plan from a series that's over starts again with the default)
  const kept = (plan ?? stored)?.scope;
  const scope: PlanScope = kept && (kept !== 'series' || series) ? kept : defaultScope(league, opp);
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const base = league.teams[league.userTid].tactics;
  const extras = plan ? Object.keys(plan.matchups ?? {}).length + Object.keys(plan.playerD ?? {}).length : 0;
  const [allCounters, setAllCounters] = useState(false);
  const add = (c: Candidate) => edit((l) => setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) }));
  return (
    <>
      <Section
        title="How long it lasts"
        right={
          <Help title="Plan scope">
            A game plan changes your tactics against this team only, on top of your playbook. Next game: used up when you play them. This series: until the playoff series is
            decided. All season: every meeting this season. Plans clear at the new season.
          </Help>
        }
      >
        <Segmented
          label="Plan scope"
          value={scope}
          disabled={simming}
          onChange={(s) =>
            edit((l) => {
              ensurePlan(l, opp);
              setPlanScope(l, opp, s);
            })
          }
          options={[
            { id: 'next' as PlanScope, label: 'Next game' },
            ...(series ? [{ id: 'series' as PlanScope, label: 'This series' }] : []),
            { id: 'season', label: 'All season' },
          ]}
        />
        <div className="mu-note">{SCOPE_NOTE[scope]}</div>
      </Section>

      <Section
        title="Your plan"
        right={
          plan ? (
            <button className="btn xs ghost" disabled={simming} onClick={() => edit((l) => clearPlan(l, opp))}>
              Clear
            </button>
          ) : undefined
        }
      >
        {plan && (plan.items.length > 0 || extras > 0) ? (
          <div className="card flush list">
            {plan.items.map((it) => (
              <div key={it.id} className="mu-item">
                <span className="grow">
                  <span className="lr-name">{it.label}</span>
                  {it.evidence && <span className="lr-meta">{it.evidence}</span>}
                </span>
                <button className="iconbtn" disabled={simming} onClick={() => edit((l) => removePlanItem(l, opp, it.id))} aria-label={`Remove ${it.label}`}>
                  <X size={18} />
                </button>
              </div>
            ))}
            {extras > 0 && <div className="mu-item mu-note">Plus {plannedExtras(plan)} (Matchups).</div>}
          </div>
        ) : (
          <div className="mu-note">
            No <Term id="gameplan">game plan</Term> yet: your playbook plays ({playbookLabel(base)}).
          </div>
        )}
      </Section>

      <Section
        title="Counters"
        right={
          <Help title="Counters">
            The staff drafts these from their roster, their playbook and, once they have played enough games, their numbers (the ones the numbers back come first). None has been
            simulated: Test runs each against them. Adding one replaces any item of the same kind in your plan.
          </Help>
        }
      >
        <div className="card flush list">
          {cands.length ? (
            (allCounters ? cands : cands.slice(0, COUNTERS_SHOWN)).map((c) => (
              <div key={c.id} className="mu-item">
                <span className="grow">
                  <span className="lr-name">{c.label}</span>
                  <span className="lr-meta">{c.why}</span>
                  {c.evidence && (
                    <span className="mu-ev">
                      <b>By the numbers:</b> {c.evidence}
                    </span>
                  )}
                </span>
                <button className="btn xs" disabled={simming} onClick={() => add(c)} aria-label={`Add ${c.label} to the plan`}>
                  <Plus size={14} /> Add
                </button>
              </div>
            ))
          ) : (
            <div className="mu-empty">Your plan already covers what the staff sees.</div>
          )}
          {!allCounters && cands.length > COUNTERS_SHOWN && (
            <button className="gs-more" onClick={() => setAllCounters(true)}>
              <ChevronDown size={15} aria-hidden="true" /> {cands.length - COUNTERS_SHOWN} more
            </button>
          )}
          {cands.length > 0 && (
            <button className="mu-linkrow" onClick={onTest}>
              <span className="grow left">Test them against the {league.teams[opp].name}</span>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </Section>

      <StarPlanCard league={league} opp={opp} />
      <JunkCard league={league} opp={opp} />
      <AttackCard league={league} opp={opp} />
      <HackCard league={league} opp={opp} />
      <NoteCard key={`${opp}:${stored?.note ?? ''}`} league={league} opp={opp} />
    </>
  );
}

/** "2 planned matchups and 3 guarding instructions". */
function plannedExtras(plan: { matchups?: Record<number, number>; playerD?: Record<number, unknown> }) {
  const m = Object.keys(plan.matchups ?? {}).length;
  const d = Object.keys(plan.playerD ?? {}).length;
  return [m ? `${m} planned matchup${m === 1 ? '' : 's'}` : '', d ? `${d} guarding instruction${d === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
}

/** A star plan for this opponent: none, deny or double, on one of their top eight. */
function StarPlanCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 8), [league, opp]);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const names = rosterNames(theirs);
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
      title="Star plan"
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

/** The free-throw percentage the engine shoots a player at (from his FT rating). */
const ftPct = (ft: number) => Math.min(0.95, Math.max(0.3, 0.42 + 0.0052 * ft));

/** Hack-a-player: their poor free-throw shooters to foul on purpose, and the quarter it starts. */
function HackCard({ league, opp }: { league: League; opp: number }) {
  const simming = useStore((s) => !!s.sim);
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 10), [league, opp]);
  const names = rosterNames(theirs);
  // their poor shooters: under 70% from the line, three at least, six at most
  const sorted = [...theirs].sort((a, b) => a.ratings.ft - b.ratings.ft);
  const rows = sorted.slice(0, Math.max(3, Math.min(6, sorted.filter((p) => ftPct(p.ratings.ft) < 0.7).length)));
  const targets = eff.manage.hackTargets ?? [];
  const fromQ = eff.manage.hackFromQ ?? 1;
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
          Foul a poor free-throw shooter on purpose whenever he&apos;s on the floor, from the quarter you pick: two free throws for him instead of a normal possession, worth about
          1.12 points, so it pays below about 56% from the line. Never in the last two minutes of a period, where it costs a free throw and the ball. Their staff benches a player
          hacked twice in a period when a reserve his size can come in.
        </Help>
      }
    >
      <div className="card flush list">
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
              <span className={`num mu-ft ${pct < 60 ? 'bad' : pct < 70 ? 'warn' : 'dim'}`}>FT {pct}%</span>
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
