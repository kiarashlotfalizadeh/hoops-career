import { useMemo } from 'react';
import { Lightbulb, Play } from 'lucide-react';
import type { League, Tactics, Team } from '../../core/types';
import { buildGameReport } from '../../core/analysis/gameReport';
import { impactCounter, liveCounter } from '../../core/ai/advisor';
import { zScore } from '../../core/analysis/playTypes';
import { FINISH_LABEL, type FinishType } from '../../core/sim/log';
import { Card } from '../components/ui';
import { QuarterTable, TeamComparison } from '../components/gameBlocks';
import { periodLabel, signed } from '../stats';
import { adviceFor } from '../seasonAnalysis';
import { foulLimit } from './alerts';
import type { Drawn } from './drawn';
import { wpText } from '../../core/analysis/winProb';

/**
 * The break between periods: your chance to win, the score by quarter, how the teams compare, who's
 * scoring, your players in foul or energy trouble, what has decided the game so far (with one-tap
 * fixes), their play types running above this season's norm and the game plan their coach brought.
 */
export function PeriodReport({
  league,
  view,
  side,
  teams,
  tactics,
  names,
  baselines,
  colors,
  apply,
  onStart,
  oppPlan,
  win,
}: {
  league: League;
  view: Drawn;
  side: 0 | 1;
  /** [home, away]. */
  teams: [Team, Team];
  /** The user's tactics now. */
  tactics: Tactics;
  names: (pid: number) => string;
  baselines: Record<string, number>;
  /** Away, home bar colours. */
  colors: [string, string];
  apply: (fn: (t: Tactics) => void) => void;
  onStart: () => void;
  /** The game plan the other coach brought tonight, if he game-planned. */
  oppPlan?: readonly { text: string }[];
  /** Your team's win probability now (absent when it's switched off). */
  win?: number;
}) {
  const report = useMemo(() => buildGameReport(league, view.box, league.userTid, { partial: true, elapsed: view.elapsed, tactics }), [league, view, tactics]);
  const q = view.q;
  const next = periodLabel(q + 1);
  const [home, away] = teams;
  const me = view.sides[side];
  const meTeam = teams[side];
  const them = view.sides[1 - side];
  // the fourth quarter keeps at most four, each overtime brings two
  const timeouts = q + 1 >= 5 ? 2 : q + 1 === 4 ? Math.min(4, me.timeouts) : me.timeouts;
  // trouble going into the next period: one foul from the staff's limit, or still tired after the break's rest
  const limit = foulLimit(q + 1, tactics.manage.foulTrouble);
  const rest = q === 2 ? 0.3 : 0.1;
  const fouls = me.players.filter((p) => p.out === 0 && p.fouls >= limit - 1).sort((a, b) => b.fouls - a.fouls);
  const tired = me.players.filter((p) => p.out === 0 && p.fga + p.fta + p.fouls > 0 && Math.min(1, p.energy + rest) < tactics.manage.fatigueSub + 0.1);
  const scorers = (s: 0 | 1) =>
    [...view.sides[s].players]
      .filter((p) => p.pts > 0)
      .sort((a, b) => b.pts - a.pts)
      .slice(0, 2)
      .map((p) => `${names(p.pid)} ${p.pts}`)
      .join(', ') || '—';
  const factors = (report?.factors ?? []).slice(0, 3);
  const hot = Object.entries(them.pt)
    .filter(([k, v]) => k !== 'misc' && baselines[k] !== undefined && v.poss >= 6 && zScore(v, baselines[k]) > 1.5)
    .sort((a, b) => zScore(b[1], baselines[b[0]]) - zScore(a[1], baselines[a[0]]))
    .slice(0, 2);
  return (
    <Card title={q === 2 ? 'Halftime report' : `End of ${periodLabel(q)}`} accent>
      <div className="col" style={{ gap: 12 }}>
        {report && <div className="bold">{report.headline}</div>}
        {win !== undefined && (
          <div className="small">
            <span className="dim2">Win probability:</span>{' '}
            <b className="num">
              {meTeam.abbrev} {wpText(win)}
            </b>
          </div>
        )}
        <QuarterTable g={view.box} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
        <TeamComparison g={view.box} colors={colors} only={['fg', 'tp', 'reb', 'tov']} />
        <div className="col small" style={{ gap: 2 }}>
          <div>
            <b>{away.abbrev}</b> <span className="dim2">{scorers(1)}</span>
          </div>
          <div>
            <b>{home.abbrev}</b> <span className="dim2">{scorers(0)}</span>
          </div>
        </div>
        {(fouls.length > 0 || tired.length > 0) && (
          <div className="col small" style={{ gap: 2 }}>
            {fouls.length > 0 && (
              <div>
                <span className="warn bold">Foul trouble:</span> {fouls.map((p) => `${names(p.pid)} (${p.fouls})`).join(', ')}
                <span className="dim">
                  {' '}
                  · your staff sits players at {limit} in {next}
                </span>
              </div>
            )}
            {tired.length > 0 && (
              <div>
                <span className="warn bold">Tired legs:</span> {tired.map((p) => `${names(p.pid)} (${Math.round(Math.min(1, p.energy + rest) * 100)}%)`).join(', ')}
              </div>
            )}
          </div>
        )}
        {factors.length > 0 && (
          <div className="col" style={{ gap: 8 }}>
            <div className="tiny dim upper bold">What's deciding it</div>
            {factors.map((f, i) => {
              const fix = f.pts < 0 && f.key ? impactCounter(f.key, tactics) : undefined;
              return (
                <div key={i} className="row top" style={{ gap: 8 }}>
                  <span className={`num bold ${f.pts >= 0 ? 'good' : 'bad'}`} style={{ width: 40, flex: 'none' }}>
                    {signed(f.pts)}
                  </span>
                  <div className="grow small">
                    <div>{f.title}</div>
                    {f.advice && !fix && (
                      <div className="tiny" style={{ color: 'var(--warn)', marginTop: 2 }}>
                        <Lightbulb size={12} style={{ verticalAlign: -2 }} /> {adviceFor(f.advice, league.settings.complexity)}
                      </div>
                    )}
                  </div>
                  {fix && (
                    <button className="btn xs primary" onClick={() => apply(fix.apply)}>
                      {fix.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hot.length > 0 && (
          <div className="col" style={{ gap: 8 }}>
            <div className="tiny dim upper bold">Hurting you</div>
            {hot.map(([k, v]) => {
              const c = liveCounter(k as FinishType, tactics);
              return (
                <div key={k} className="row top" style={{ gap: 8 }}>
                  <div className="grow small">
                    {FINISH_LABEL[k as FinishType]}: {(v.pts / v.poss).toFixed(2)} per possession on {v.poss} (league {baselines[k].toFixed(2)}).{c?.note ? ` ${c.note}` : ''}
                  </div>
                  {c && (
                    <button className="btn xs primary" onClick={() => apply(c.apply)}>
                      {c.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {oppPlan && oppPlan.length > 0 && (
          <div className="small">
            <span className="dim2">Their game plan:</span> {oppPlan.map((x) => x.text).join(', ')}.
          </div>
        )}
        <div className="tiny dim">
          {meTeam.abbrev}: {timeouts} timeout{timeouts === 1 ? '' : 's'} for {next}. Subs and adjustments you make now apply from its first possession.
        </div>
        <button className="btn primary block" onClick={onStart}>
          <Play size={16} fill="currentColor" /> Start {next}
        </button>
      </div>
    </Card>
  );
}
