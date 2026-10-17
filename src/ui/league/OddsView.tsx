import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { FORECAST_SIMS, leagueForecast, pct, type TeamOdds } from '../../core/analysis/odds';
import { fmtDate } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { LineChart } from '../components/charts';
import { Card, Help } from '../components/ui';
import { confName, useQueryParam } from './shared';

type Mode = 'playoffs' | 'lottery';

/**
 * The season forecast (src/core/analysis/odds.ts) for one conference: projected records and the
 * chances to make the playoffs, go deep and win it all, or, for the teams headed for the lottery,
 * at the top picks. The user's own odds through the season sit on top.
 */
export function OddsView({ league }: { league: League }) {
  const userConf = league.teams[league.userTid].conf;
  const [conf, setConf] = useQueryParam<'E' | 'W'>('oconf', userConf, ['E', 'W']);
  const [mode, setMode] = useQueryParam<Mode>('omode', 'playoffs', ['playoffs', 'lottery']);
  const f = useLeagueMemo(() => leagueForecast(league), [league]);
  if (!f) return <div className="lg-note">The season is over: the forecast starts again with next season's preseason.</div>;
  // the playoff race best first; the lottery worst first
  const rows = f.teams
    .filter((t) => league.teams[t.tid].conf === conf)
    .sort((a, b) => (mode === 'lottery' ? a.w - b.w || b.pick1 - a.pick1 : b.w - a.w || b.reach[0] - a.reach[0]));
  return (
    <>
      <Trail league={league} />
      <div className="row between">
        <div className="chips">
          {(['E', 'W'] as const).map((c) => (
            <button key={c} className={`chip lg-chip-xs ${conf === c ? 'on' : ''}`} aria-pressed={conf === c} onClick={() => setConf(c)}>
              {c === 'E' ? 'East' : 'West'}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <div className="chips">
            {(['playoffs', 'lottery'] as const).map((m) => (
              <button key={m} className={`chip lg-chip-xs ${mode === m ? 'on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'playoffs' ? 'Playoffs' : 'Lottery'}
              </button>
            ))}
          </div>
          <Help title="Season forecast">
            <p style={{ margin: 0 }}>
              The rest of the season is played out {FORECAST_SIMS.toLocaleString('en-US')} times, game by game on the real schedule, then the play-in, the playoffs and the lottery
              draw. Each team's strength is its net rating this season, weighed against what its roster is worth (injured players count from when they're back) until enough games
              are in, and it's uncertain, more so early on.
            </p>
            <p style={{ margin: 0 }}>
              It knows nothing about how the games will actually go. 100% and — mean a place clinched or a team that's out; anything else rounds to &gt;99% or &lt;1%.
            </p>
          </Help>
        </div>
      </div>
      <Card className={`flush lg-flat lg-st mode-odds odds-${mode}`}>
        <div className="lg-st-row lg-st-head" aria-hidden="true">
          <span style={{ textAlign: 'right' }}>#</span>
          <span />
          <span>Team</span>
          <span>Proj</span>
          {mode === 'playoffs' ? (
            <>
              <span className="c-wide">Top 6</span>
              <span className="c-wide">Play-in</span>
              <span>Playoffs</span>
              <span className="c-wide">Conf F</span>
              <span className="c-wide">Finals</span>
              <span>Title</span>
            </>
          ) : (
            <>
              <span className="c-wide">Lottery</span>
              <span>No. 1</span>
              <span>Top 4</span>
              <span className="c-wide">Avg pick</span>
            </>
          )}
        </div>
        {rows.map((t, i) => (
          <OddsRow key={t.tid} league={league} t={t} rank={i + 1} mode={mode} />
        ))}
      </Card>
      <div className="lg-note">
        {f.preseason ? 'Preseason forecast: rosters only, before a game is played. ' : ''}
        {mode === 'playoffs'
          ? `The ${confName(conf)} by projected record, with the 10th-90th percentile of wins under it. Playoffs counts the play-in's winners.`
          : 'The lottery is everyone not in the playoffs. The chances are for each team’s own first-round pick, wherever it went in a trade (→ its owner now): first, in the top four, and where it lands on average when it’s in the lottery.'}
      </div>
    </>
  );
}

function OddsRow({ league, t, rank, mode }: { league: League; t: TeamOdds; rank: number; mode: Mode }) {
  const team = league.teams[t.tid];
  const me = t.tid === league.userTid;
  const w = Math.round(t.w);
  const proj = `${w}-${Math.round(t.w + t.l) - w}`;
  // the pick's owner, when it isn't the team's own any more
  const dp = league.draftPicks.find((d) => d.season === league.season && d.round === 1 && d.originalTid === t.tid);
  const owner = dp && dp.tid !== t.tid ? league.teams[dp.tid].abbrev : null;
  const spoken =
    mode === 'playoffs'
      ? `, projected ${proj}, ${t.lo} to ${t.hi} wins, playoffs ${pct(t.reach[0], t.clinched || t.out)}, title ${pct(t.reach[4], t.out)}`
      : `, projected ${proj}, number 1 pick ${pct(t.pick1)}, top 4 ${pct(t.top4)}${t.pick !== null ? `, average pick ${t.pick.toFixed(1)}` : ''}${owner ? `, pick owned by ${owner}` : ''}`;
  return (
    <Link to={`/team/${t.tid}`} className={`lg-st-row ${me ? 'me' : ''}`}>
      <span className="rk">{rank}</span>
      <TeamLogo tid={t.tid} size={24} decorative />
      <span className="nm">
        <span>
          <span className="nm-full">{team.name}</span>
          <span className="nm-ab">{team.abbrev}</span>
        </span>
        {mode === 'lottery' && owner && (
          <span className="tiny dim" style={{ fontWeight: 600 }} aria-hidden="true">
            → {owner}
          </span>
        )}
        <span className="sr-only">{spoken}</span>
      </span>
      <span className="wl" aria-hidden="true">
        {proj}
        {mode === 'playoffs' && t.lo !== t.hi && (
          <span className="tiny dim odds-range">
            {t.lo}-{t.hi}
          </span>
        )}
      </span>
      {mode === 'playoffs' ? (
        <>
          <span className="c-wide dim2" aria-hidden="true">
            {pct(t.top6)}
          </span>
          <span className="c-wide dim2" aria-hidden="true">
            {pct(t.playIn)}
          </span>
          <span className={t.reach[0] >= 0.5 ? 'good' : undefined} style={{ fontWeight: 700 }} aria-hidden="true">
            {pct(t.reach[0], t.clinched || t.out)}
          </span>
          <span className="c-wide dim2" aria-hidden="true">
            {pct(t.reach[2], t.out)}
          </span>
          <span className="c-wide dim2" aria-hidden="true">
            {pct(t.reach[3], t.out)}
          </span>
          <span aria-hidden="true">{pct(t.reach[4], t.out)}</span>
        </>
      ) : (
        <>
          <span className="c-wide dim2" aria-hidden="true">
            {pct(t.lottery, t.clinched || t.out)}
          </span>
          <span aria-hidden="true">{pct(t.pick1, t.clinched)}</span>
          <span aria-hidden="true">{pct(t.top4, t.clinched)}</span>
          <span className="c-wide dim2" aria-hidden="true">
            {t.pick !== null && t.lottery >= 0.05 ? t.pick.toFixed(1) : '—'}
          </span>
        </>
      )}
    </Link>
  );
}

/** The user's playoff odds week by week this season (League.oddsTrail), from the second week on. */
function Trail({ league }: { league: League }) {
  const tr = league.oddsTrail;
  if (!tr || tr.season !== league.season || tr.tid !== league.userTid || tr.pts.length < 2) return null;
  const last = tr.pts[tr.pts.length - 1];
  return (
    <Card
      title={`Your playoff odds · ${league.teams[league.userTid].name}`}
      right={<span className="tiny dim">{`${pct(last[1] / 1000)} on ${fmtDate(league.season, last[0])}`}</span>}
    >
      <LineChart points={tr.pts.map((p) => p[1] / 10)} labels={tr.pts.map((p) => fmtDate(league.season, p[0]))} yMin={0} yMax={100} refLine={50} height={110} values={false} />
    </Card>
  );
}
