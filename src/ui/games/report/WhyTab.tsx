// The game report's Why, for one of your games: what decided it (each edge in points of the final
// margin, biggest first, a row each that opens on its detail and the staff's fix), the four factors side by side (away
// on the left, as the final reads),
// every player's grade, both benches' adjustments, and one tap down the play types, your sets, your
// lineups and the momentum swings.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { GameResult, League } from '../../../core/types';
import { setLineText, type GameReport } from '../../../core/analysis/gameReport';
import { Help, More, Section } from '../../components/ui';
import { CompareBar } from '../../components/charts';
import { AdjustmentsCard } from '../../components/AdjustmentsCard';
import { Term } from '../../components/Glossary';
import { periodLabel, signed, wholeMinutes } from '../../stats';
import { boxNames } from './names';

/** Factors shown before "more". */
const FACTORS_SHOWN = 3;

export function WhyTab({ g, league, report }: { g: GameResult; league: League; report: GameReport }) {
  // your side of the game (0 home, 1 away)
  const side: 0 | 1 = g.home.tid === league.userTid ? 0 : 1;
  const mine = side === 0 ? g.home : g.away;
  const names = boxNames(league, mine);
  // two teams side by side read away on the left, home on the right, as the final does; your side carries the accent
  const [awayAb, homeAb] = [league.teams[g.away.tid].abbrev, league.teams[g.home.tid].abbrev];
  const ff = side === 0 ? { away: report.fourFactors.opp, home: report.fourFactors.user } : { away: report.fourFactors.user, home: report.fourFactors.opp };
  const [colorA, colorB] = side === 0 ? ['var(--text-dim)', 'var(--accent)'] : ['var(--accent)', 'var(--text-dim)'];
  const pts = report.playTypes.map((p) =>
    side === 0
      ? { key: p.key, label: p.label, a: [p.oppPoss, p.oppPpp] as const, b: [p.userPoss, p.userPpp] as const }
      : { key: p.key, label: p.label, a: [p.userPoss, p.userPpp] as const, b: [p.oppPoss, p.oppPpp] as const },
  );
  return (
    <>
      <Section
        title="What decided it"
        right={
          <Help title="What decided it">
            <p>Each figure is what that edge was worth to the final margin. Plus went your way, minus theirs.</p>
          </Help>
        }
      >
        {report.factors.length === 0 ? <div className="gv-note">No single factor stood out: this one came down to execution.</div> : <Factors factors={report.factors} />}
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

      <Section
        title={
          <h3>
            <Term id="grade">Player grades</Term>
          </h3>
        }
      >
        <Grades grades={report.grades} box={mine} names={names} />
      </Section>

      <AdjustmentsCard g={g} league={league} />

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
                      <span className="dim"> · {runContext(g, side, r.startIdx, r.endIdx)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </More>
    </>
  );
}

/**
 * What decided it, biggest first, each worth so many points of the margin: the first few, the rest a
 * tap away. A row is its figure and what happened; it opens on the detail and the staff's fix.
 */
function Factors({ factors }: { factors: GameReport['factors'] }) {
  const [all, setAll] = useState(false);
  const shown = all ? factors : factors.slice(0, FACTORS_SHOWN);
  return (
    <div className="card flush list">
      {shown.map((f, i) => (
        <details key={i} className="gv-factor">
          <summary>
            <span className={`gv-pts num ${f.pts >= 0 ? 'good' : 'bad'}`}>
              {signed(f.pts)}
              <span className="gv-pts-u">pts</span>
            </span>
            <span className="grow gv-factor-t">{f.title}</span>
            <ChevronDown size={16} className="gd-fold-c" aria-hidden="true" />
          </summary>
          <div className="gv-factor-b">
            <div className="gv-factor-d">{f.detail}</div>
            {f.advice && <div className="gv-advice">{f.advice}</div>}
          </div>
        </details>
      ))}
      {shown.length < factors.length && (
        <button className="gv-more" onClick={() => setAll(true)}>
          <ChevronDown size={15} aria-hidden="true" /> {factors.length - shown.length} more
        </button>
      )}
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
