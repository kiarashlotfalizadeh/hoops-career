// The game plan for one opponent: how long it lasts, what the scouting numbers say, the plan's
// items (with the counters the assistant suggests), the star plan, matchups and a note.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, FlaskConical, Plus, X } from 'lucide-react';
import type { GamePlanItem, League, PlanScope, StarPlan } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { counterCandidates, scoutTeam } from '../../core/ai/advisor';
import type { Candidate } from '../../core/ai/lab';
import { projectedRotation, scoutData } from '../../core/analysis/scouting';
import { clearPlan, defaultScope, effectiveTactics, ensurePlan, itemGroup, planFor, removePlanItem, setPlanItem, setPlanScope } from '../../core/league/gamePlans';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { DEF_PRESETS, OFF_PRESETS, STAR_PLAN_META } from '../../core/sim/tactics';
import { FINISH_LABEL } from '../../core/sim/log';
import { Card, Chips, Empty, Help, PageHeader, Segmented, Tag } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { RankStrip, scoutSource } from '../components/scouting';
import { MatchupPlanner } from '../components/MatchupPlanner';
import { rosterNames } from '../stats';
import '../components/scouting.css';

const SCOPE_HELP: Record<PlanScope, string> = {
  next: 'Used up when you play them next.',
  series: 'Lasts until this playoff series is decided.',
  season: 'Every game against them until the season ends.',
};

/** The user's unplayed games against `opp`, soonest first. */
function meetings(league: League, opp: number) {
  const me = league.userTid;
  return league.schedule.filter((g) => !g.played && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp))).sort((a, b) => a.day - b.day);
}

export default function GamePlan() {
  const league = useLeague();
  const { tid } = useParams();
  const opp = Number(tid);
  const team = Number.isInteger(opp) ? league.teams[opp] : undefined;
  if (!team || opp === league.userTid)
    return (
      <main className="page">
        <PageHeader title="Game plan" back backTo="/tactics" />
        <Card>
          <Empty>{team ? "You can't game-plan against your own team. Pick an opponent from Tactics." : 'That team does not exist.'}</Empty>
        </Card>
      </main>
    );
  return <PlanScreen league={league} opp={opp} />;
}

function PlanScreen({ league, opp }: { league: League; opp: number }) {
  const team = league.teams[opp];
  const me = league.teams[league.userTid];
  const complexity = league.settings.complexity;
  const mutate = useStore.getState().mutate;
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const stored = league.gamePlans?.[opp];
  const plan = planFor(league, opp);
  const next = meetings(league, opp);
  const series = league.playoffs.find((s) => s.winner === undefined && [s.high, s.low].includes(opp) && [s.high, s.low].includes(league.userTid));
  // (a series plan from a series that's over starts again with the default)
  const kept = (plan ?? stored)?.scope;
  const scope: PlanScope = kept && (kept !== 'series' || series) ? kept : defaultScope(league, opp);
  const ts = curTeamSeason(league, opp);
  const base = me.tactics;

  const addItem = (c: Candidate) =>
    mutate((l) => setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) }));
  const remove = (it: GamePlanItem) => mutate((l) => removePlanItem(l, opp, it.id));

  return (
    <main className="page">
      <PageHeader
        title="Game plan"
        sub={`vs the ${team.region} ${team.name}`}
        back
        backTo="/tactics"
        right={
          <Link to={`/lab?opp=${opp}&mode=counters`} className="btn sm">
            <FlaskConical size={16} /> Lab
          </Link>
        }
      />

      <Card accent>
        <div className="row" style={{ gap: 12 }}>
          <TeamLogo tid={opp} size={52} decorative />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold ellipsis">
              {team.region} {team.name}{' '}
              <span className="dim num" style={{ fontWeight: 500 }}>
                {ts.won}-{ts.lost}
              </span>
            </div>
            <div className="small dim2">
              {next.length
                ? `Next: ${fmtDate(league.season, next[0].day, { weekday: 'short', month: 'short', day: 'numeric' })}${next[0].day === league.day ? ' (today)' : ''}, ${next[0].home === league.userTid ? 'at home' : 'away'}${
                    next.length > 1
                      ? ` · then ${next
                          .slice(1, 3)
                          .map((g) => fmtDate(league.season, g.day))
                          .join(', ')}`
                      : ''
                  }`
                : 'No games against them left on the schedule.'}
            </div>
            {series && (
              <div className="small dim2">
                Series: {league.teams[series.high].abbrev} {series.highWins}-{series.lowWins} {league.teams[series.low].abbrev}
              </div>
            )}
          </div>
        </div>
        <Link to={`/team/${opp}?tab=scouting`} className="small row" style={{ gap: 2, marginTop: 10, color: 'var(--accent-text)', fontWeight: 650 }}>
          Full scouting report <ChevronRight size={15} />
        </Link>
      </Card>

      <Card
        title="How long it lasts"
        right={
          <Help title="Plan scope">
            A plan changes your tactics against this team only, on top of your playbook. Next game: used up when you play them. This series: until the playoff series is decided.
            All season: every meeting this season. Plans clear at the new season.
          </Help>
        }
      >
        <Segmented
          label="Plan scope"
          value={scope}
          onChange={(s) =>
            mutate((l) => {
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
        <div className="small dim" style={{ marginTop: 8 }}>
          {SCOPE_HELP[scope]}
        </div>
      </Card>

      <Card title="Scouting" right={data.enough ? <span className="tiny dim">{scoutSource(data)}</span> : undefined}>
        {data.enough ? (
          <div className="col" style={{ gap: 10 }}>
            {complexity !== 'simple' && <RankStrip d={data} complexity={complexity === 'expert' ? 'advanced' : 'simple'} />}
            {data.tendencies.length > 0 && (
              <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--info)' }}>
                {data.tendencies.slice(0, 3).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {data.exploits.length > 0 && (
              <ul className="lg-bullets" style={{ ['--bul' as string]: 'var(--good)' }}>
                {data.exploits.slice(0, 3).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {complexity === 'expert' && <TopPlayTypes league={league} opp={opp} />}
          </div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            <div className="small dim2">
              {scout.offense[0]} {scout.defense[0]}
            </div>
            {scout.weaknesses[0] && (
              <div className="small">
                <span className="good">Attack:</span> {scout.weaknesses[0]}
              </div>
            )}
            <div className="tiny dim">The numbers come in once they have played a few games.</div>
          </div>
        )}
      </Card>

      <Card
        title="Your plan"
        right={
          plan ? (
            <button className="btn xs ghost" onClick={() => mutate((l) => clearPlan(l, opp))}>
              Clear
            </button>
          ) : undefined
        }
      >
        {plan && plan.items.length ? (
          <div className="col" style={{ gap: 8 }}>
            {plan.items.map((it) => (
              <div key={it.id} className="row top" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="bold small">{it.label}</div>
                  {it.evidence && <div className="tiny dim2">{it.evidence}</div>}
                </div>
                <button className="iconbtn" onClick={() => remove(it)} aria-label={`Remove ${it.label}`}>
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="small dim">
            No changes yet: against them you play your playbook ({OFF_PRESETS.find((x) => x.id === base.offPreset)?.name ?? 'Custom'} ·{' '}
            {DEF_PRESETS.find((x) => x.id === base.defPreset)?.name ?? 'Custom'}).
          </div>
        )}
        {plan?.matchups && Object.keys(plan.matchups).length > 0 && (
          <div className="tiny dim2" style={{ marginTop: 8 }}>
            Plus {Object.keys(plan.matchups).length} planned matchup{Object.keys(plan.matchups).length === 1 ? '' : 's'}.
          </div>
        )}
      </Card>

      <Card
        title="Suggested counters"
        right={
          <Help title="Suggested counters">
            The assistant drafts these from their roster, their playbook and, once they have played enough games, their numbers (the ones the numbers back come first). None has
            been simulated yet: test them in the Lab before you trust them. Adding one replaces any item of the same kind in your plan.
          </Help>
        }
      >
        {cands.length ? (
          <div className="col" style={{ gap: 10 }}>
            {cands.map((c) => (
              <div key={c.id} className="row top" style={{ gap: 8 }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="bold small">{c.label}</span>
                    <Tag>Untested</Tag>
                  </div>
                  <div className="tiny dim2">{c.why}</div>
                  {c.evidence && (
                    <div className="tiny" style={{ marginTop: 2 }}>
                      <span className="good bold">By the numbers:</span> {c.evidence}
                    </div>
                  )}
                </div>
                <button className="btn xs" onClick={() => addItem(c)} aria-label={`Add ${c.label} to the plan`}>
                  <Plus size={14} /> Add
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="small dim">Nothing new to suggest: your plan already covers what the staff sees.</div>
        )}
        <Link to={`/lab?opp=${opp}&mode=counters`} className="small row" style={{ gap: 2, marginTop: 12, color: 'var(--accent-text)', fontWeight: 650 }}>
          Test them in the Lab <ChevronRight size={15} />
        </Link>
      </Card>

      <StarPlanCard league={league} opp={opp} />

      {complexity !== 'simple' && (
        <Card
          title="Matchups"
          right={
            <Help title="Matchups">
              Their projected top eight against your top ten, as the staff would match them at tip-off: starters on starters, bench on bench. Your own assignments are kept in this
              plan and hold whenever both players are on the floor.
            </Help>
          }
        >
          <MatchupPlanner league={league} opp={opp} />
        </Card>
      )}

      {complexity === 'expert' && <HackCard league={league} opp={opp} />}

      <NoteCard key={`${opp}:${stored?.note ?? ''}`} league={league} opp={opp} />
    </main>
  );
}

/** Their offense's biggest play types against the league (Expert). */
function TopPlayTypes({ league, opp }: { league: League; opp: number }) {
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const rows = data.playTypes.filter((r) => r.key !== 'misc').slice(0, 4);
  if (!rows.length) return null;
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="tiny upper dim bold">Their offense</div>
      {rows.map((r) => (
        <div key={r.key} className="row between small">
          <span className="dim2">{FINISH_LABEL[r.key]}</span>
          <span className="num">
            {Math.round(r.share * 100)}% · {r.ppp.toFixed(2)}{' '}
            <span className={Math.abs(r.z) >= 2 ? (r.z > 0 ? 'bad' : 'good') : 'dim'}>
              ({r.z > 0 ? '+' : ''}
              {r.z.toFixed(1)} z)
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** A star plan for this opponent: none, deny or double, on one of their top eight. */
function StarPlanCard({ league, opp }: { league: League; opp: number }) {
  const mutate = useStore.getState().mutate;
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
    mutate((l) => {
      const b = l.teams[l.userTid].tactics.defense;
      const items = l.gamePlans?.[opp]?.items.filter((it) => itemGroup(it) === 'star') ?? [];
      // the same as the playbook: no plan item needed
      if (plan === b.starPlan && (plan === 'none' || tgt === b.starTarget)) {
        for (const it of items) removePlanItem(l, opp, it.id);
        return;
      }
      const who = tgt !== null ? l.players[tgt]?.lastName : 'their top creator';
      const label = plan === 'none' ? 'Play their stars straight' : plan === 'double' ? `Double-team ${who}` : `Deny ${who}`;
      setPlanItem(l, opp, { id: `star-${plan}`, label, group: 'star', patch: { defense: { starPlan: plan, starTarget: plan === 'none' ? null : tgt } } });
    });
  return (
    <Card
      title="Star plan"
      right={
        <Help title="Star plan">
          Deny keeps the ball out of one player's hands; a double team sends a second defender when he attacks. Without a target it goes after their primary creator.
        </Help>
      }
    >
      <Chips
        label="Star plan"
        value={sp}
        onChange={(x: StarPlan) => set(x, x === 'none' ? null : (target ?? suggested))}
        options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
      />
      <div className="small dim" style={{ marginTop: 8 }}>
        {STAR_PLAN_META[sp].help}
      </div>
      {sp !== 'none' && theirs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="tiny upper dim bold" style={{ marginBottom: 6 }}>
            On
          </div>
          <Chips
            label="Star plan target"
            value={target ?? -1}
            onChange={(pid: number) => set(sp, pid < 0 ? null : pid)}
            options={[{ id: -1, label: 'Top creator' }, ...theirs.map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.pid === suggested ? ' ★' : ''}` }))]}
          />
          {suggested !== null && (
            <div className="tiny dim" style={{ marginTop: 6 }}>
              ★ {data.star !== undefined ? 'The player their offense runs through, by the numbers.' : 'Their best shot creator, by the scouts.'}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** The free-throw percentage the engine shoots a player at (from his FT rating). */
const ftPct = (ft: number) => Math.min(0.95, Math.max(0.3, 0.42 + 0.0052 * ft));

/** Hack-a-player: their poor free-throw shooters to foul on purpose, and the quarter it starts (Expert). */
function HackCard({ league, opp }: { league: League; opp: number }) {
  const mutate = useStore.getState().mutate;
  const eff = useLeagueMemo(() => effectiveTactics(league, opp), [league, opp]);
  const theirs = useLeagueMemo(() => projectedRotation(league, opp, 10), [league, opp]);
  const names = rosterNames(theirs);
  const rows = [...theirs].sort((a, b) => a.ratings.ft - b.ratings.ft).slice(0, 6);
  const targets = eff.manage.hackTargets ?? [];
  const fromQ = eff.manage.hackFromQ ?? 1;
  const set = (pids: number[], q: number) =>
    mutate((l) => {
      if (!pids.length) {
        removePlanItem(l, opp, 'hack');
        return;
      }
      const who = pids.map((pid) => l.players[pid]?.lastName ?? '').join(', ');
      setPlanItem(l, opp, { id: 'hack', label: `Hack-a-${who}${q > 1 ? ` from Q${q}` : ''}`, group: 'hack', patch: { manage: { hackTargets: pids, hackFromQ: q } } });
    });
  return (
    <Card
      title="Hack-a-player"
      right={
        <Help title="Hack-a-player">
          Foul a poor free-throw shooter on purpose whenever he's on the floor, from the quarter you pick: two free throws for him instead of a normal possession, worth about 1.12
          points, so it pays below about 56% from the line. Never in the last two minutes of a period, where it costs a free throw and the ball. Their staff benches a player hacked
          twice in a period when a reserve his size can come in.
        </Help>
      }
    >
      <div className="col" style={{ gap: 6 }}>
        {rows.map((p) => {
          const on = targets.includes(p.pid);
          const pct = Math.round(ftPct(p.ratings.ft) * 100);
          return (
            <button
              key={p.pid}
              className={`card tight row ${on ? 'accent' : ''}`}
              style={{ gap: 8 }}
              aria-pressed={on}
              onClick={() => set(on ? targets.filter((x) => x !== p.pid) : [...targets, p.pid], fromQ)}
            >
              <span className="bold grow" style={{ textAlign: 'left' }}>
                {names(p.pid)}
              </span>
              <span className={`num small ${pct < 60 ? 'bad' : pct < 70 ? 'warn' : 'dim'}`}>FT {pct}%</span>
              {on && <Tag tone="warn">Target</Tag>}
            </button>
          );
        })}
      </div>
      {targets.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="tiny upper dim bold" style={{ marginBottom: 6 }}>
            Starting
          </div>
          <Chips label="Hack from quarter" value={fromQ} onChange={(q: number) => set(targets, q)} options={[1, 2, 3, 4].map((q) => ({ id: q, label: `Q${q}` }))} />
        </div>
      )}
    </Card>
  );
}

/** A free-text note kept with the plan. */
function NoteCard({ league, opp }: { league: League; opp: number }) {
  const saved = league.gamePlans?.[opp]?.note ?? '';
  const [text, setText] = useState(saved);
  const save = () => {
    if (text.trim() === saved) return;
    useStore.getState().mutate((l) => {
      const p = ensurePlan(l, opp);
      if (text.trim()) p.note = text.trim();
      else delete p.note;
    });
  };
  return (
    <Card title="Notes">
      <textarea
        className="gp-note-input"
        value={text}
        maxLength={500}
        placeholder={`Anything to remember against the ${league.teams[opp].name}`}
        aria-label="Notes for this game plan"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
    </Card>
  );
}
