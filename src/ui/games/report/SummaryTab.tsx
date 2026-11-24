// The game report's Summary, for one of your games, numbers first: the night in three figures (what
// the schemes were worth, what shooting luck was worth, what your moves were worth), then what
// decided it (each edge with its points, biggest first, a row each that opens on its detail and the
// staff's fix; shots falling above or below their looks told apart as luck), the four factors side by
// side (away on the left, as the final reads), your coaching (the plan's counters with tonight on
// what each was aimed at, your moves with the score since and what they were worth), what to do next
// time (a fix a tap away only when the staff backs it), every player's grade, both benches'
// adjustments, and one tap down the play types, your sets, your lineups and the momentum swings.
// Takes a stored result, so the report and the Live screen's final card both show it.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GameResult, League } from '../../../core/types';
import { buildGameReport, setLineText, type Factor, type GameReport } from '../../../core/analysis/gameReport';
import { debrief, luckPts, nightLine, sameChange, seasonCoachingLine, type DebriefAdvice } from '../../../core/analysis/debrief';
import { ptsFig } from '../../../core/analysis/staffWords';
import { applyPatch } from '../../../core/sim/tactics';
import { persistableTactics, planFor, setPlanItem } from '../../../core/league/gamePlans';
import { counterCandidates } from '../../../core/ai/advisor';
import { worthCall } from '../../../core/ai/counterWorth';
import { shortName } from '../../../core/league/helpers';
import { useLeagueMemo, useStore } from '../../../state/store';
import { act } from '../../../state/actions';
import { measuringNight } from '../../live/tonight';
import { counterItem, useCounterWorth } from '../matchup/useCounterWorth';
import { Help, More, Section, Tag } from '../../components/ui';
import { CompareBar } from '../../components/charts';
import { AdjustmentsCard } from '../../components/AdjustmentsCard';
import { MovesList } from '../../components/StaffCards';
import { Term } from '../../components/Glossary';
import { periodLabel, signed, wholeMinutes } from '../../stats';
import { boxNames } from './names';

/** Factors shown before "more". */
const FACTORS_SHOWN = 4;
/** What to do next time, shown before "more". */
const ADVICE_SHOWN = 2;

/** A figure's tone: good or bad once it's a point of margin either way. */
const tone = (pts: number) => (pts >= 0.05 ? 'good' : pts <= -0.05 ? 'bad' : '');

export function SummaryTab({ res, league, report, highlights }: { res: GameResult; league: League; report?: GameReport | null; highlights?: ReactNode }) {
  const me = league.userTid;
  const mineGame = res.home.tid === me || res.away.tid === me;
  const rep = useMemo(() => (report !== undefined ? report : mineGame && res.impacts ? buildGameReport(league, res) : null), [report, mineGame, res, league]);
  if (!mineGame) return null;
  if (!rep)
    return (
      <>
        <div className="gv-note">This game was kept without its report: the box score has the rest.</div>
        {highlights}
      </>
    );
  return <Summary res={res} league={league} report={rep} highlights={highlights} />;
}

function Summary({ res, league, report, highlights }: { res: GameResult; league: League; report: GameReport; highlights?: ReactNode }) {
  const me = league.userTid;
  // your side of the game (0 home, 1 away)
  const side: 0 | 1 = res.home.tid === me ? 0 : 1;
  const other = (1 - side) as 0 | 1;
  const mine = side === 0 ? res.home : res.away;
  const d = useMemo(() => debrief(league, res, report), [league, res, report]);
  const names = boxNames(league, mine);
  const nameOf = (pid: number) => (league.players[pid] ? shortName(league, league.players[pid]) : `#${pid}`);
  const opp = league.teams[d.opp];
  // two teams side by side read away on the left, home on the right, as the final does; your side carries the accent
  const [awayAb, homeAb] = [league.teams[res.away.tid].abbrev, league.teams[res.home.tid].abbrev];
  const ff = side === 0 ? { away: report.fourFactors.opp, home: report.fourFactors.user } : { away: report.fourFactors.user, home: report.fourFactors.opp };
  const [colorA, colorB] = side === 0 ? ['var(--text-dim)', 'var(--accent)'] : ['var(--accent)', 'var(--text-dim)'];
  const pts = report.playTypes.map((p) =>
    side === 0
      ? { key: p.key, label: p.label, a: [p.oppPoss, p.oppPpp] as const, b: [p.userPoss, p.userPpp] as const }
      : { key: p.key, label: p.label, a: [p.userPoss, p.userPpp] as const, b: [p.oppPoss, p.oppPpp] as const },
  );
  // the night in three figures: the schemes (every tactical edge, both ways), the luck (shots against
  // their looks, both sides), and your moves (the night played back with them and without)
  const scheme = report.factors.filter((f) => f.category === 'tactics' && !f.luck).reduce((a, f) => a + f.pts, 0);
  const luck = res.xShots ? luckPts(res, side) - luckPts(res, other) : null;
  const staffOnly = !!res.moves?.length && res.moves.every((m) => m.by === 'staff');
  const night = res.moves?.length ? nightLine(res, staffOnly) : null;
  const season = night ? seasonCoachingLine(league, res.season) : null;
  const tactical = report.factors.filter((f) => !f.luck);
  const lucky = report.factors.filter((f) => f.luck);
  const abbrevs = { us: league.teams[mine.tid].abbrev, them: opp.abbrev };
  return (
    <div className="gd-recap">
      <dl className="gv-sum" aria-label="The night in points">
        <SumFig k="Tactics" v={scheme} help="Every tactical edge of the night added up, yours less theirs." />
        {luck !== null && <SumFig k="Shooting luck" v={luck} help="Points both teams' shots fell above or below what their looks were worth. Nothing to change for it." />}
        {res.movesWorth && Number.isFinite(res.movesWorth.pts) && (
          <SumFig k={staffOnly ? "Staff's moves" : 'Your moves'} v={res.movesWorth.pts} help="The night played back with your in-game moves and without them." />
        )}
      </dl>
      {res.xShots && <MarginSum res={res} side={side} />}

      {d.hurt && (
        <p className="gd-hurt small">
          <b>Hurt tonight:</b> {d.hurt}.
        </p>
      )}

      {d.lesson && (
        // (his first game: the plan, how it came out, one next step: deciding, not finding screens)
        <section className="gd-lesson card" aria-label="Your first game">
          <div className="over">Your first game</div>
          <p className="small">
            <b>The plan.</b> {d.lesson.plan}
          </p>
          <p className="small">
            <b>How it went.</b> {d.lesson.outcome}
          </p>
          <p className="small">
            <b>Next.</b> {d.lesson.next}
          </p>
          {d.lesson.to && (
            <Link to={d.lesson.to} className="card-link">
              {d.lesson.toLabel} <ChevronRight size={14} aria-hidden="true" />
            </Link>
          )}
        </section>
      )}

      <Section
        title="What decided it"
        right={
          <Help title="What decided it">
            <p>Each edge with the points it was worth to you (+) or to them (−). Edges overlap, so they don&apos;t add up to the margin.</p>
          </Help>
        }
      >
        {tactical.length === 0 && lucky.length === 0 ? (
          <div className="gv-note">No single factor was worth 3 points: this one came down to execution.</div>
        ) : (
          <Factors factors={tactical} luck={lucky} />
        )}
        {d.frame && <p className="gd-frame small dim2">{d.frame}</p>}
      </Section>

      <Section
        title={
          <h3>
            <Term id="fourfactors">Four factors</Term>
          </h3>
        }
        right={
          <span className="tiny dim">
            {awayAb} · {homeAb}
          </span>
        }
      >
        <div className="card gv-bars">
          <CompareBar label={<Term id="efg">eFG%</Term>} a={ff.away.efg * 100} b={ff.home.efg * 100} colorA={colorA} colorB={colorB} />
          <CompareBar label={<Term id="tov">TOV%</Term>} a={ff.away.tov * 100} b={ff.home.tov * 100} colorA={colorA} colorB={colorB} higherBetter={false} />
          <CompareBar label={<Term id="orb">ORB%</Term>} a={ff.away.orb * 100} b={ff.home.orb * 100} colorA={colorA} colorB={colorB} />
          <CompareBar label={<Term id="ftfga">FT/FGA</Term>} a={ff.away.ftr * 100} b={ff.home.ftr * 100} colorA={colorA} colorB={colorB} />
        </div>
      </Section>

      {d.plan.length > 0 && (
        <Section title="Your plan">
          {/* a row each: the counter, what the staff measured it worth going in, and tonight on what it was aimed at */}
          <div className="card flush list">
            {d.plan.map((g) => (
              <div key={g.label} className="gv-plan">
                <span className="grow">
                  <span className="lr-name">{g.label}</span>
                  <span className="gd-plan-line small dim2">
                    {g.line}
                    {g.bridge ? ` ${g.bridge}` : ''}
                  </span>
                </span>
                {g.pts !== undefined && (
                  <Tag tone={g.call === 'gain' ? 'good' : g.call === 'cost' ? 'bad' : undefined}>
                    <span title="What the staff measured it worth a game, over many games">{ptsFig(g.pts)}</span>
                  </Tag>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {res.moves && res.moves.length > 0 && (
        <Section title={staffOnly ? "The staff's moves" : 'Your moves'}>
          {night ? (
            <details className={`gd-night tone-${night.tone}`}>
              <summary>
                <span className="grow gd-night-t num">{night.text}</span>
                <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
              </summary>
              <p className="small dim2">
                {night.detail}
                {season ? ` ${season}.` : ''}
              </p>
            </details>
          ) : (
            measuringNight(res.gid) && <div className="gd-night small dim">The staff is playing the night back without your moves…</div>
          )}
          <MovesList moves={res.moves} abbrevs={abbrevs} nameOf={nameOf} />
        </Section>
      )}

      {d.advice.length > 0 && <NextTime league={league} d={d} />}

      <Section
        title={
          <h3>
            <Term id="grade">Player grades</Term>
          </h3>
        }
      >
        <Grades grades={report.grades} box={mine} names={names} />
      </Section>

      <AdjustmentsCard g={res} league={league} />

      {highlights}

      <More label="Play types, sets, lineups and runs">
        <div className="col" style={{ gap: 'var(--gap-page)', marginTop: 6 }}>
          <Section
            title="Play types"
            right={
              <span className="tiny dim">
                Poss · <Term id="ppp">PPP</Term>
              </span>
            }
          >
            <div className="card flush list">
              <div className="gv-pt gv-pt-h" aria-hidden="true">
                <span className="grow" />
                <span>{awayAb}</span>
                <span>{homeAb}</span>
              </div>
              {pts.map((p) => (
                <div key={p.key} className="gv-pt">
                  <span className="grow">{p.label}</span>
                  {[p.a, p.b].map(([poss, ppp], i) => (
                    <span key={i} className="num">
                      <span className="dim">{poss}</span> <b style={{ color: pppColor(ppp, poss) }}>{poss ? ppp.toFixed(2) : '—'}</b>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </Section>
          {report.sets.length > 0 && (
            <Section
              title="Your sets"
              right={
                <Help title="Sets">
                  <p>The possessions each set opened, second chances included. Read by: the run their defense had it covered by.</p>
                </Help>
              }
            >
              <div className="card flush list">
                {report.sets.map((s) => (
                  <div key={s.id} className="gv-row">
                    <span className="grow">{s.name}</span>
                    <span className="num dim2">{setLineText(s)}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section title="Your lineups" right={<span className="tiny dim">+/- · minutes together</span>}>
            {report.lineups.length === 0 ? (
              <div className="gv-note">No lineup played 3+ minutes together.</div>
            ) : (
              <div className="card flush list">
                {report.lineups.map((l, i) => (
                  <div key={i} className="gv-row top">
                    <span className={`gv-pm num ${l.pm >= 0 ? 'good' : 'bad'}`}>{signed(l.pm, 0)}</span>
                    <span className="grow dim2">{l.pids.map((pid) => names(pid) || '?').join(', ')}</span>
                    <span className="dim tiny num nowrap">{l.min.toFixed(0)} min</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
          {report.runs.length > 0 && (
            <Section title="Momentum swings">
              <div className="card flush list">
                {report.runs.map((r, i) => (
                  <div key={i} className="gv-row top">
                    <span className={`gv-run ${r.side === 'user' ? 'good' : 'bad'}`} aria-hidden="true" />
                    <span className="grow">
                      <span className={r.side === 'user' ? 'good' : 'bad'}>{r.text}</span>
                      <span className="dim"> · {runContext(res, side, r.startIdx, r.endIdx)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </More>
    </div>
  );
}

/** One of the night's three figures: its name, its points with their sign, and what it counts a tap away. */
/** One game's net shooting luck, as spread as it runs night to night (points, one standard deviation). */
const LUCK_SD = 7.5;

/** "about a 1-in-20 shooting night": how rare a night's luck was, from two standard deviations on (else nothing). */
function luckRarity(luck: number): string | null {
  const z = Math.abs(luck) / LUCK_SD;
  if (z < 2) return null;
  // two-sided normal tail (Abramowitz-Stegun's erfc)
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  const n = Math.round(1 / erfc / 5) * 5;
  return `about a 1-in-${n.toLocaleString('en-US')} shooting night`;
}

/**
 * How the final margin adds up, every point of it: what both sides' looks were worth, the shooting
 * luck (shots falling above or below those looks) and the free throws. Tactics run through all three,
 * so they stand apart above; this line is the arithmetic the luck figure is part of.
 */
function MarginSum({ res, side }: { res: GameResult; side: 0 | 1 }) {
  const other = (1 - side) as 0 | 1;
  const [me, them] = side === 0 ? [res.home, res.away] : [res.away, res.home];
  const x = res.xShots!;
  const looks = x[side].pts - x[other].pts;
  const luck = luckPts(res, side) - luckPts(res, other);
  const ft = me.t.ftm - them.t.ftm;
  const margin = me.pts - them.pts;
  const rare = luckRarity(luck);
  const f = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace(/\.0$/, '')}`;
  return (
    <p className="gv-recon small dim2">
      <b>How the margin adds up:</b> looks {f(looks)} · shooting luck {f(luck)} · free throws {f(ft)} = <b className="num">{f(margin)}</b>
      {rare && <> · {rare}</>}
    </p>
  );
}

function SumFig({ k, v, help }: { k: string; v: number; help: string }) {
  return (
    <div className="gv-sum-c">
      <dt>
        {k}{' '}
        <Help title={k}>
          <p>{help}</p>
        </Help>
      </dt>
      <dd className={`num ${tone(v)}`}>{ptsFig(v)}</dd>
    </div>
  );
}

/**
 * What to do next time: a fix one tap away for the plan against this opponent only when the staff
 * likes it against them (else it's only their read), for every game only when they back it where the
 * bench calls it. What a fix will do stays an opinion in words: it hasn't been played.
 */
function NextTime({ league, d }: { league: League; d: ReturnType<typeof debrief> }) {
  const [all, setAll] = useState(false);
  const simming = useStore((s) => !!s.sim);
  const inPlan = new Set(planFor(league, d.opp)?.items.map((it) => it.id));
  /** A change measured as a gain where the bench calls it, into your tactics for every game. */
  const always = (a: DebriefAdvice) => {
    if (!a.patch) return;
    const ok = act('Tactics', (l) => {
      const tm = l.teams[l.userTid];
      tm.tactics = { ...persistableTactics(applyPatch(tm.tactics, a.patch), tm.tactics), manual: true };
    });
    if (ok) useStore.getState().toast(`Your tactics: ${a.label}`, 'good');
  };
  return (
    <Section title="Next time">
      <div className="gd-next card flush list">
        {(all ? d.advice : d.advice.slice(0, ADVICE_SHOWN)).map((a) => (
          <div key={a.id} className="gd-next-row">
            <div className="gd-next-t">{a.title}</div>
            <div className="gd-next-x small dim2">{a.text}</div>
            {a.patch && (d.meetAgain || a.worth) && (
              <div className="gd-next-acts">
                {d.meetAgain && <PlanFix league={league} opp={d.opp} a={a} inPlan={inPlan} quiet={!!a.worth} />}
                {/* (for every game only a change the staff backs: one night's tags are no reason to change them all) */}
                {a.worth && (
                  <button className="btn xs" disabled={simming} onClick={() => always(a)}>
                    {a.label}: every game
                  </button>
                )}
                {a.worth && <span className="lv-note-worth tiny">{a.worth}</span>}
              </div>
            )}
          </div>
        ))}
        {!all && d.advice.length > ADVICE_SHOWN && (
          <button className="gv-more" onClick={() => setAll(true)}>
            <ChevronDown size={15} aria-hidden="true" /> {d.advice.length - ADVICE_SHOWN} more
          </button>
        )}
      </div>
    </Section>
  );
}

/**
 * A next-time fix for the plan against this opponent: one tap only as the staff's counter that makes
 * the same change (sameChange), measured a gain against them on the matchup page's games. Otherwise
 * the staff's read, said as such, with nothing to tap (`quiet`: the row already carries the bench's
 * opinion, so this one says nothing).
 */
function PlanFix({ league, opp, a, inPlan, quiet }: { league: League; opp: number; a: DebriefAdvice; inPlan: Set<string>; quiet: boolean }) {
  const simming = useStore((s) => !!s.sim);
  const drafted = useLeagueMemo(() => counterCandidates(league, league.userTid, opp), [league, opp]);
  const measuring = useCounterWorth(league, opp);
  const abbrev = league.teams[opp].abbrev;
  const base = league.teams[league.userTid].tactics;
  const c = a.patch ? drafted.find((x) => sameChange(base, a.patch!, x.patch)) : undefined;
  const w = c ? measuring?.worth?.get(c.id) : undefined;
  if (inPlan.has(a.id) || (c && inPlan.has(c.id))) return <Tag tone="good">In the plan vs {abbrev}</Tag>;
  if (c && w && worthCall(w) === 'gain') {
    const add = () => {
      if (act('Game plan', (l) => setPlanItem(l, opp, counterItem(c, w)))) useStore.getState().toast(`Plan vs ${abbrev}: ${c.label}`, 'good');
    };
    return (
      <>
        <button className="btn xs" disabled={simming} onClick={add}>
          {c.label}: vs {abbrev}
        </button>
        <span className="lv-note-worth tiny">Should help against {abbrev}</span>
      </>
    );
  }
  if (quiet) return null;
  const note =
    c && measuring && !measuring.worth
      ? `The staff is looking at it against ${abbrev}…`
      : w
        ? worthCall(w) === 'cost'
          ? `Could hurt against ${abbrev}. Not one for the plan.`
          : `No clear edge against ${abbrev}. Not one for the plan.`
        : `Only the staff's read against ${abbrev}`;
  return <span className="lv-note-worth tiny">{note}</span>;
}

/**
 * What decided it, biggest first: the first few, the rest a tap away. A row is what happened and the
 * points it was worth, in the tone of who it favoured; it opens on the detail and the staff's fix.
 * Shots falling above or below their looks come last, under their own heading: luck, not a decision.
 */
function Factors({ factors, luck }: { factors: Factor[]; luck: Factor[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? factors : factors.slice(0, FACTORS_SHOWN);
  const row = (f: Factor, i: number) => (
    <details key={`${f.title}-${i}`} className="gv-factor">
      <summary>
        <span className="grow gv-factor-t">{f.title}</span>
        <Tag tone={f.pts >= 0 ? 'good' : 'bad'}>{ptsFig(f.pts)}</Tag>
        <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
      </summary>
      <div className="gv-factor-b">
        <div className="gv-factor-d">{f.detail}</div>
        {f.advice && <div className="gv-advice">{f.advice}</div>}
      </div>
    </details>
  );
  return (
    <div className="card flush list">
      {shown.map(row)}
      {shown.length < factors.length && (
        <button className="gv-more" onClick={() => setAll(true)}>
          <ChevronDown size={15} aria-hidden="true" /> {factors.length - shown.length} more
        </button>
      )}
      {luck.length > 0 && <div className="list-divider">Shooting luck</div>}
      {luck.map(row)}
    </div>
  );
}

/** Your players' grades, A+ to F, with the night each one is for. */
function Grades({ grades, box, names }: { grades: GameReport['grades']; box: GameResult['home']; names: (pid: number) => string }) {
  const min = wholeMinutes(box.players);
  const line = new Map(box.players.map((p) => [p.pid, p]));
  return (
    <div className="tablewrap">
      <table className="stats gv-grades">
        <thead>
          <tr>
            <th className="l">
              <span className="sr-only">Grade</span>
            </th>
            <th className="l">Player</th>
            <th>
              <abbr title="Minutes">MIN</abbr>
            </th>
            <th>
              <abbr title="Points">PTS</abbr>
            </th>
            <th>
              <abbr title="Rebounds">REB</abbr>
            </th>
            <th>
              <abbr title="Assists">AST</abbr>
            </th>
            <th>
              <abbr title="Plus-minus: the score while he was on the floor">+/-</abbr>
            </th>
          </tr>
        </thead>
        <tbody>
          {grades.map((gr) => {
            const p = line.get(gr.pid);
            return (
              <tr key={gr.pid}>
                <td className="l">
                  <span className={`gv-g ${gr.grade[0]}`}>{gr.grade}</span>
                </td>
                <td className="l gv-grade-n">
                  <Link to={`/player/${gr.pid}`} className="bx-link">
                    {names(gr.pid)}
                  </Link>
                </td>
                <td>{min(gr.pid)}</td>
                <td className="bold">{p?.pts ?? 0}</td>
                <td>{p ? p.orb + p.drb : 0}</td>
                <td>{p?.ast ?? 0}</td>
                <td className={p && p.pm > 0 ? 'good' : p && p.pm < 0 ? 'bad' : ''}>{signed(p?.pm ?? 0, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** When a run happened and the margin it turned, from the user's side: "Q2-Q3, from down 13 to up 4". */
function runContext(g: GameResult, userSide: 0 | 1, start: number, end: number) {
  const flow = g.flow ?? [];
  const margin = (i: number) => (userSide === 0 ? 1 : -1) * (flow[i] ?? 0);
  const says = (m: number) => (m === 0 ? 'tied' : m > 0 ? `up ${m}` : `down ${-m}`);
  const period = (i: number) => (g.flowPeriods ?? []).reduce((q, at, k) => (at <= i ? k + 1 : q), 0);
  // flow[start] is the margin before the run's first possession
  const [a, b] = [period(start + 1), period(end)];
  const when = !a ? '' : a === b ? `${periodLabel(a)}, ` : `${periodLabel(a)}-${periodLabel(b)}, `;
  return `${when}from ${says(margin(start))} to ${says(margin(end))}`;
}

/** Points per possession worth a colour: 1.2 and up good, under 0.9 bad (league average is about 1.1). */
function pppColor(ppp: number, poss: number) {
  if (!poss) return undefined;
  return ppp >= 1.2 ? 'var(--good)' : ppp < 0.9 ? 'var(--bad)' : undefined;
}
