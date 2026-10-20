import type { League } from '../../core/types';
import { FORECAST_SIMS, pct, type Forecast, type TeamOdds } from '../../core/analysis/odds';
import { fmtDate } from '../../core/league/helpers';
import { LineChart } from '../components/charts';
import { Help, Section } from '../components/ui';
import { Toolbar, confName, confOrder, teamPath, useQueryParam } from './shared';
import { TeamRow, TeamTable } from './Table';
import { useForecast } from '../useForecast';

/**
 * The season forecast (src/core/analysis/odds.ts): both conferences by projected record with the
 * chances to make the playoffs, go deep and win it all; the user's odds through the season on top.
 */
export function OddsView({ league }: { league: League }) {
  const userConf = league.teams[league.userTid].conf;
  // a link names the conference to read first (a team page's odds line)
  const [first] = useQueryParam<'E' | 'W'>('oconf', userConf, ['E', 'W']);
  const f = useForecast(league);
  if (!f) return <NoForecast />;
  return (
    <>
      <Trail league={league} />
      {confOrder(first).map((c, i) => (
        <Section key={c} title={`${confName(c)}${f.preseason ? ' · preseason forecast' : ''}`} right={i === 0 ? <OddsHelp /> : undefined}>
          <TeamTable cols={[54, 58, 44, 48, 54, 50, 50]} head={['Proj', 'Playoffs', 'Title', 'Top 6', 'Play-in', 'Conf F', 'Finals']}>
            {f.teams
              .filter((t) => league.teams[t.tid].conf === c)
              .sort((a, b) => b.w - a.w || b.reach[0] - a.reach[0])
              .map((t, i) => (
                <OddsRow key={t.tid} league={league} t={t} rank={i + 1} />
              ))}
          </TeamTable>
        </Section>
      ))}
    </>
  );
}

/** The lottery as it stands: every team not sure of the playoffs, worst projected first, with the chances for its own first-round pick. */
export function LotteryView({ league }: { league: League }) {
  const f = useForecast(league);
  if (!f) return <NoForecast />;
  const rows = f.teams.filter((t) => !t.clinched).sort((a, b) => a.w - b.w || b.pick1 - a.pick1);
  return (
    <>
      <Toolbar right={<OddsHelp />}>Each team&apos;s own first-round pick</Toolbar>
      <TeamTable cols={[54, 46, 50, 44, 56]} head={['Proj', 'No. 1', 'Top 4', 'Avg', 'Lottery']}>
        {rows.map((t, i) => (
          <LotteryRow key={t.tid} league={league} f={f} t={t} rank={i + 1} />
        ))}
      </TeamTable>
    </>
  );
}

function NoForecast() {
  return <div className="card empty">The season is over: the forecast returns in the preseason.</div>;
}

function OddsHelp() {
  return (
    <Help title="Season forecast">
      <p className="lg-p">
        The rest of the season is played out {FORECAST_SIMS.toLocaleString('en-US')} times, game by game on the real schedule, then the play-in, the playoffs and the lottery draw.
        Each team&apos;s strength is its net rating this season, weighed against what its roster is worth (injured players count from when they&apos;re back) until enough games are
        in, and it&apos;s uncertain, more so early on.
      </p>
      <p className="lg-p">
        Proj is the projected record, its 10th-90th percentile of wins under it. Playoffs counts the play-in&apos;s winners. Swipe the table for the rest of the rounds.
      </p>
      <p className="lg-p">
        The lottery is everyone not in the playoffs: the chances are for each team&apos;s own first-round pick, wherever it went in a trade (→ its owner now): first, in the top
        four, and where it lands on average when it&apos;s in the lottery.
      </p>
      <p className="lg-p">
        It knows nothing about how the games will actually go. 100% and — mean a place clinched or a team that&apos;s out; anything else rounds to &gt;99% or &lt;1%.
      </p>
    </Help>
  );
}

const projOf = (t: TeamOdds) => {
  const w = Math.round(t.w);
  return `${w}-${Math.round(t.w + t.l) - w}`;
};

function OddsRow({ league, t, rank }: { league: League; t: TeamOdds; rank: number }) {
  const proj = projOf(t);
  return (
    <TeamRow
      to={teamPath(t.tid)}
      me={t.tid === league.userTid}
      rank={rank}
      tid={t.tid}
      name={league.teams[t.tid].name}
      spoken={`, projected ${proj}, ${t.lo} to ${t.hi} wins, playoffs ${pct(t.reach[0], t.clinched || t.out)}, title ${pct(t.reach[4], t.out)}`}
    >
      <span className="wl lg-proj" aria-hidden="true">
        {proj}
        {t.lo !== t.hi && (
          <span className="odds-range">
            {t.lo}-{t.hi}
          </span>
        )}
      </span>
      <span className={`hi ${t.reach[0] >= 0.5 ? 'good' : ''}`} aria-hidden="true">
        {pct(t.reach[0], t.clinched || t.out)}
      </span>
      <span className="hi" aria-hidden="true">
        {pct(t.reach[4], t.out)}
      </span>
      <span aria-hidden="true">{pct(t.top6)}</span>
      <span aria-hidden="true">{pct(t.playIn)}</span>
      <span aria-hidden="true">{pct(t.reach[2], t.out)}</span>
      <span aria-hidden="true">{pct(t.reach[3], t.out)}</span>
    </TeamRow>
  );
}

function LotteryRow({ league, f, t, rank }: { league: League; f: Forecast; t: TeamOdds; rank: number }) {
  // the pick's owner, when it isn't the team's own any more
  const dp = league.draftPicks.find((d) => d.season === f.season && d.round === 1 && d.originalTid === t.tid);
  const owner = dp && dp.tid !== t.tid ? league.teams[dp.tid].abbrev : null;
  const proj = projOf(t);
  const avg = t.pick !== null && t.lottery >= 0.05 ? t.pick.toFixed(1) : '—';
  return (
    <TeamRow
      to={teamPath(t.tid)}
      me={t.tid === league.userTid}
      rank={rank}
      tid={t.tid}
      name={league.teams[t.tid].name}
      after={
        owner ? (
          <span className="lg-conf" aria-hidden="true">
            → {owner}
          </span>
        ) : undefined
      }
      spoken={`, projected ${proj}, number 1 pick ${pct(t.pick1, t.clinched)}, top 4 ${pct(t.top4, t.clinched)}${avg !== '—' ? `, average pick ${avg}` : ''}, lottery ${pct(t.lottery, t.clinched || t.out)}${owner ? `, pick owned by ${owner}` : ''}`}
    >
      <span className="wl" aria-hidden="true">
        {proj}
      </span>
      <span className="hi" aria-hidden="true">
        {pct(t.pick1, t.clinched)}
      </span>
      <span className="hi" aria-hidden="true">
        {pct(t.top4, t.clinched)}
      </span>
      <span aria-hidden="true">{avg}</span>
      <span aria-hidden="true">{pct(t.lottery, t.clinched || t.out)}</span>
    </TeamRow>
  );
}

/** The user's playoff odds week by week this season (League.oddsTrail), from the second week on. */
function Trail({ league }: { league: League }) {
  const tr = league.oddsTrail;
  if (!tr || tr.season !== league.season || tr.tid !== league.userTid || tr.pts.length < 2) return null;
  // a flat line at the top (or the bottom) all season says nothing the table doesn't
  if (tr.pts.every((p) => p[1] >= 990) || tr.pts.every((p) => p[1] <= 10)) return null;
  const last = tr.pts[tr.pts.length - 1];
  return (
    <Section
      title={`${league.teams[league.userTid].abbrev} playoff odds`}
      right={<span className="lg-sec-meta">{`${pct(last[1] / 1000)} on ${fmtDate(league.season, last[0])}`}</span>}
    >
      <div className="card lg-trail">
        <LineChart points={tr.pts.map((p) => p[1] / 10)} labels={tr.pts.map((p) => fmtDate(league.season, p[0]))} yMin={0} yMax={100} refLine={50} height={96} values={false} />
      </div>
    </Section>
  );
}
