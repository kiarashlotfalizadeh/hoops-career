// The game plan for one opponent: how long it lasts, what the scouting numbers say, the plan's
// items (with the counters the assistant suggests), the star plan, a junk defense, matchups, how to
// guard each of their players, a defender to attack, hack-a targets and a note.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, FlaskConical, Plus, X } from 'lucide-react';
import type { GamePlanItem, League, PlanScope, StarPlan } from '../../core/types';
import { useLeague, useLeagueMemo, useStore } from '../../state/store';
import { counterCandidates, scoutTeam } from '../../core/ai/advisor';
import type { Candidate } from '../../core/ai/lab';
import { projectedRotation, scoutData } from '../../core/analysis/scouting';
import { clearPlan, defaultScope, effectiveTactics, ensurePlan, itemGroup, planFor, removePlanItem, setPlanItem, setPlanScope } from '../../core/league/gamePlans';
import { curTeamSeason, fmtDate } from '../../core/league/helpers';
import { confStandings } from '../../core/league/standings';
import { neutralSite } from '../../core/league/games';
import { STAR_PLAN_META } from '../../core/sim/tactics';
import { playbookLabel } from '../../core/sim/playbooks';
import { FINISH_LABEL } from '../../core/sim/log';
import { Chips, Empty, Help, Ovr, PageHeader, Section, Segmented, Tag } from '../components/ui';
import { TeamLogo } from '../components/TeamLogo';
import { OppPlanNote, RankStrip, scoutSource } from '../components/scouting';
import { aiGamePlan, nextMeeting } from '../../core/ai/opponentPlan';
import { MatchupPlanner } from '../components/MatchupPlanner';
import { AttackCard, GuardCard, JunkCard } from '../components/GuardPlanner';
import { slabVars } from '../teamColors';
import { ordinal, rosterNames } from '../stats';
import '../components/scouting.css';
import './tactics.css';

const SCOPE_HELP: Record<PlanScope, string> = {
  next: 'Used up when you play them next.',
  series: 'Lasts until this playoff series is decided.',
  season: 'Every game against them until the season ends.',
};

type Tab = 'plan' | 'matchups' | 'scouting';

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
        <div className="card">
          <Empty>{team ? "You can't game-plan against your own team. Pick an opponent from Tactics." : 'That team does not exist.'}</Empty>
        </div>
      </main>
    );
  return <PlanScreen league={league} opp={opp} />;
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="tx-fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function PlanScreen({ league, opp }: { league: League; opp: number }) {
  const team = league.teams[opp];
  const me = league.teams[league.userTid];
  const mutate = useStore.getState().mutate;
  const [params, setParams] = useSearchParams();
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const scout = useLeagueMemo(() => scoutTeam(league, opp), [league, opp]);
  const cands = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  // what their coach has planned for the next meeting (your counters read his usual tactics)
  const theirPlan = useLeagueMemo(() => {
    const g = nextMeeting(league, opp);
    return g ? aiGamePlan(league, opp, league.userTid, g) : null;
  }, [league, opp]);
  const stored = league.gamePlans?.[opp];
  const plan = planFor(league, opp);
  const next = meetings(league, opp);
  const series = league.playoffs.find((s) => s.winner === undefined && [s.high, s.low].includes(opp) && [s.high, s.low].includes(league.userTid));
  // (a series plan from a series that's over starts again with the default)
  const kept = (plan ?? stored)?.scope;
  const scope: PlanScope = kept && (kept !== 'series' || series) ? kept : defaultScope(league, opp);
  const ts = curTeamSeason(league, opp);
  const rank = useLeagueMemo(() => confStandings(league, team.conf).find((r) => r.tid === opp)?.confRank, [league, team.conf, opp]);
  const base = me.tactics;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'matchups' as Tab, label: 'Matchups' },
    { id: 'scouting', label: 'Scouting' },
  ];
  const tab = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'plan';

  const addItem = (c: Candidate) =>
    mutate((l) => setPlanItem(l, opp, { id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}) }));
  const remove = (it: GamePlanItem) => mutate((l) => removePlanItem(l, opp, it.id));
  const where = (g: (typeof next)[number]) => (neutralSite(g) ? 'neutral floor' : g.home === league.userTid ? 'at home' : 'away');

  return (
    <main className="page">
      <PageHeader
        title="Game plan"
        back
        backTo="/tactics"
        right={
          <Link to={`/lab?opp=${opp}&mode=counters`} className="btn sm">
            <FlaskConical size={16} /> Lab
          </Link>
        }
      />

      <section className="slab tx-gp-slab" style={slabVars(team.colors)} aria-label={`Game plan against the ${team.region} ${team.name}`}>
        <span className="slab-mark">
          <TeamLogo tid={opp} size={190} decorative />
        </span>
        <div className="tx-slab-over">
          <span>{team.div} Division</span>
          {/* no rank before anyone has played */}
          {rank && ts.won + ts.lost > 0 && (
            <span>
              {ordinal(rank)} {team.conf === 'E' ? 'East' : 'West'}
            </span>
          )}
        </div>
        <div className="tx-gp-id">
          <TeamLogo tid={opp} size={52} decorative />
          <div className="grow">
            <div className="tx-gp-region">{team.region}</div>
            <h2 className="tx-gp-name">{team.name}</h2>
          </div>
          <span className="tx-gp-rec num">
            {ts.won}-{ts.lost}
          </span>
        </div>
        <dl className="tx-facts">
          {next.length ? (
            <Fact k="Next">
              {next[0].day === league.day ? 'Today' : fmtDate(league.season, next[0].day, { weekday: 'short', month: 'short', day: 'numeric' })}, {where(next[0])}
              {next.length > 1 &&
                ` · then ${next
                  .slice(1, 3)
                  .map((g) => fmtDate(league.season, g.day))
                  .join(', ')}`}
            </Fact>
          ) : (
            <Fact k="Next">No games against them left on the schedule.</Fact>
          )}
          {series && (
            <Fact k="Series">
              {league.teams[series.high].abbrev} {series.highWins}-{series.lowWins} {league.teams[series.low].abbrev}
            </Fact>
          )}
        </dl>
        {theirPlan && next[0] && (
          <div className="tx-gp-expect">
            <OppPlanNote league={league} items={theirPlan.items} day={next[0].day} />
          </div>
        )}
        <Link to={`/team/${opp}?tab=scouting`} className="card-link">
          Full scouting report <ChevronRight size={14} />
        </Link>
      </section>

      <div className="tx-scope">
        <div className="sec-h">
          <h3>How long it lasts</h3>
          <Help title="Plan scope">
            A plan changes your tactics against this team only, on top of your playbook. Next game: used up when you play them. This series: until the playoff series is decided.
            All season: every meeting this season. Plans clear at the new season.
          </Help>
        </div>
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
        <div className="tx-note">{SCOPE_HELP[scope]}</div>
      </div>

      <Segmented tabs value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} options={tabs} label="Game plan sections" />

      {tab === 'plan' && (
        <>
          <Section
            title="Your plan"
            right={
              plan ? (
                <button className="btn xs ghost" onClick={() => mutate((l) => clearPlan(l, opp))}>
                  Clear
                </button>
              ) : undefined
            }
          >
            <div className="card flush list">
              {plan && plan.items.length ? (
                plan.items.map((it) => (
                  <div key={it.id} className="tx-item">
                    <span className="grow">
                      <span className="lr-name">{it.label}</span>
                      {it.evidence && <span className="lr-meta">{it.evidence}</span>}
                    </span>
                    <button className="iconbtn" onClick={() => remove(it)} aria-label={`Remove ${it.label}`}>
                      <X size={18} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="tx-empty">No changes yet: against them you play your playbook ({playbookLabel(base)}).</div>
              )}
              {plan && (Object.keys(plan.matchups ?? {}).length > 0 || Object.keys(plan.playerD ?? {}).length > 0) && (
                <div className="tx-item tx-item-x">Plus {plannedExtras(plan)}.</div>
              )}
            </div>
          </Section>

          <Section
            title="Suggested counters"
            right={
              <Help title="Suggested counters">
                The assistant drafts these from their roster, their playbook and, once they have played enough games, their numbers (the ones the numbers back come first). None has
                been simulated yet: test them in the Lab before you trust them. Adding one replaces any item of the same kind in your plan.
              </Help>
            }
          >
            <div className="card flush list">
              {cands.length ? (
                cands.map((c) => (
                  <div key={c.id} className="tx-item">
                    <span className="grow">
                      <span className="lr-name">{c.label}</span>
                      <span className="lr-meta">{c.why}</span>
                      {c.evidence && (
                        <span className="tx-ev">
                          <b>By the numbers:</b> {c.evidence}
                        </span>
                      )}
                    </span>
                    <button className="btn xs" onClick={() => addItem(c)} aria-label={`Add ${c.label} to the plan`}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                ))
              ) : (
                <div className="tx-empty">Nothing new to suggest: your plan already covers what the staff sees.</div>
              )}
              <Link to={`/lab?opp=${opp}&mode=counters`} className="tx-linkrow">
                <span className="grow">
                  <span className="tx-linkrow-t">Test them in the Lab</span>
                  <span className="lr-meta">All untested: the Lab measures each against them.</span>
                </span>
                <ChevronRight size={16} />
              </Link>
            </div>
          </Section>

          <StarPlanCard league={league} opp={opp} />

          <JunkCard league={league} opp={opp} />

          <HackCard league={league} opp={opp} />

          <NoteCard key={`${opp}:${stored?.note ?? ''}`} league={league} opp={opp} />
        </>
      )}

      {tab === 'matchups' && (
        <>
          <Section
            title="Matchups"
            right={
              <Help title="Matchups">
                Their projected top eight against your top ten, as the staff would match them at tip-off: starters on starters, bench on bench. The staff matches size and puts its
                best defenders on the players their offense runs through. Your own assignments are kept in this plan and hold whenever both players are on the floor.
              </Help>
            }
          >
            <MatchupPlanner league={league} opp={opp} />
          </Section>
          <GuardCard league={league} opp={opp} />
          <AttackCard league={league} opp={opp} />
        </>
      )}

      {tab === 'scouting' &&
        (data.enough ? (
          <>
            {/* the ranks from Advanced depth (the four factors at Expert) */}
            {
              <Section title="League ranks" right={<span className="tiny dim">{scoutSource(data)}</span>}>
                <RankStrip d={data} />
              </Section>
            }
            {data.tendencies.length > 0 && (
              <Section title="Tendencies">
                <ul className="card tx-bullets info">
                  {data.tendencies.slice(0, 3).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Section>
            )}
            {data.exploits.length > 0 && (
              <Section title="Where to attack">
                <ul className="card tx-bullets good">
                  {data.exploits.slice(0, 3).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </Section>
            )}
            <TopPlayTypes league={league} opp={opp} />
          </>
        ) : (
          <Section title="Scouting">
            <div className="card col tx-group tight">
              <div className="small dim2">
                {scout.offense[0]} {scout.defense[0]}
              </div>
              {scout.weaknesses[0] && (
                <div className="tx-sline">
                  <Tag tone="good">Attack</Tag>
                  <span className="grow">{scout.weaknesses[0]}</span>
                </div>
              )}
              <div className="tx-note">The numbers come in once they have played a few games.</div>
            </div>
          </Section>
        ))}
    </main>
  );
}

/** "2 planned matchups and 3 instructions on how to guard their players". */
function plannedExtras(plan: { matchups?: Record<number, number>; playerD?: Record<number, unknown> }) {
  const m = Object.keys(plan.matchups ?? {}).length;
  const d = Object.keys(plan.playerD ?? {}).length;
  return [m ? `${m} planned matchup${m === 1 ? '' : 's'}` : '', d ? `${d} instruction${d === 1 ? '' : 's'} on how to guard their players` : ''].filter(Boolean).join(' and ');
}

/** Their offense's biggest play types against the league (Expert). */
function TopPlayTypes({ league, opp }: { league: League; opp: number }) {
  const data = useLeagueMemo(() => scoutData(league, opp), [league, opp]);
  const rows = data.playTypes.filter((r) => r.key !== 'misc').slice(0, 4);
  if (!rows.length) return null;
  return (
    <Section
      title="Their offense"
      right={
        <Help title="Their offense">
          Their four biggest play types: share of their possessions, points per possession, and how far that is from the league in standard errors (z). Beyond ±2 is more than
          noise.
        </Help>
      }
    >
      <div className="card flush tx-table">
        <div className="tx-tr tx-tr4 tx-th">
          <span>Type</span>
          <span>Share</span>
          <span>PPP</span>
          <span>z</span>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="tx-tr tx-tr4">
            <span className="ellipsis">{FINISH_LABEL[r.key]}</span>
            <span className="num dim2">{Math.round(r.share * 100)}%</span>
            <span className="num bold">{r.ppp.toFixed(2)}</span>
            <span className={`num ${Math.abs(r.z) >= 2 ? (r.z > 0 ? 'bad' : 'good') : 'dim'}`}>
              {r.z > 0 ? '+' : ''}
              {r.z.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </Section>
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
      <div className="card col tx-group tight">
        <Chips
          label="Star plan"
          value={sp}
          // from no star plan it goes after the suggested star; between deny and double the target picked (Top creator too) stays
          onChange={(x: StarPlan) => set(x, x === 'none' ? null : sp === 'none' ? suggested : target)}
          options={(Object.keys(STAR_PLAN_META) as StarPlan[]).map((k) => ({ id: k, label: STAR_PLAN_META[k].label }))}
        />
        <div className="tx-note">{STAR_PLAN_META[sp].help}</div>
        {sp !== 'none' && theirs.length > 0 && (
          <div className="tx-ctl-chips col">
            <div className="over">On</div>
            <Chips
              label="Star plan target"
              value={target ?? -1}
              onChange={(pid: number) => set(sp, pid < 0 ? null : pid)}
              options={[{ id: -1, label: 'Top creator' }, ...theirs.map((p) => ({ id: p.pid, label: `${names(p.pid)}${p.pid === suggested ? ' ★' : ''}` }))]}
            />
            {suggested !== null && (
              <div className="tx-note">★ {data.star !== undefined ? 'The player their offense runs through, by the numbers.' : 'Their best shot creator, by the scouts.'}</div>
            )}
          </div>
        )}
      </div>
    </Section>
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
            <button key={p.pid} className={`tx-hack ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => set(on ? targets.filter((x) => x !== p.pid) : [...targets, p.pid], fromQ)}>
              <span className="tx-check" aria-hidden="true">
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <Ovr v={p.ovr} size="sm" />
              <span className="grow lr-name">{names(p.pid)}</span>
              {on && <Tag tone="warn">Target</Tag>}
              <span className={`num tx-ft ${pct < 60 ? 'bad' : pct < 70 ? 'warn' : 'dim'}`}>FT {pct}%</span>
            </button>
          );
        })}
        {targets.length > 0 && (
          <div className="tx-ctl tx-ctl-chips">
            <div className="over">Starting</div>
            <Chips label="Hack from quarter" value={fromQ} onChange={(q: number) => set(targets, q)} options={[1, 2, 3, 4].map((q) => ({ id: q, label: `Q${q}` }))} />
          </div>
        )}
      </div>
    </Section>
  );
}

/** Keeps a note with the plan against `opp`, if it changed and its league is still the one open. */
function saveNote(leagueId: string, opp: number, text: string) {
  const { league, mutate } = useStore.getState();
  const note = text.trim();
  if (league?.id !== leagueId || note === (league.gamePlans?.[opp]?.note ?? '')) return;
  mutate((l) => {
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
        className="gp-note-input"
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
