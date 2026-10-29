import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { League } from '../../core/types';
import { FORECAST_SIMS, pct, type Forecast, type TeamOdds } from '../../core/analysis/odds';
import { fmtDate } from '../../core/league/helpers';
import { LineChart } from '../components/charts';
import { Help, Section } from '../components/ui';
import { Term } from '../components/Glossary';
import { Poster, confName, confOrder, teamPath, useQueryParam } from './shared';
import { Foot } from './Views';
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
  const fav = [...f.teams].sort((a, b) => b.reach[4] - a.reach[4])[0];
  const me = f.teams[league.userTid];
  return (
    <>
      {fav && (
        <Poster
          over={f.preseason ? 'Preseason forecast' : `Forecast · ${fmtDate(league.season, league.day)}`}
          head={`${league.teams[fav.tid].name} favoured to win it all`}
          dek={me && me.tid !== fav.tid ? `${league.teams[me.tid].name}: playoffs ${pct(me.reach[0], me.clinched || me.out)} · title ${pct(me.reach[4], me.out)}` : undefined}
          fig={{ v: pct(fav.reach[4]), k: 'title chance' }}
        />
      )}
      <Trail league={league} />
      <ForecastLink to="lottery" />
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
  const best = [...rows].sort((a, b) => b.pick1 - a.pick1)[0];
  return (
    <div className="lg-block">
      {best && (
        <Poster
          over={`Draft lottery · ${fmtDate(league.season, league.day)}`}
          head={`${league.teams[best.tid].name} have the best shot at No. 1`}
          fig={{ v: pct(best.pick1, best.clinched), k: 'chance at No. 1' }}
        />
      )}
      <ForecastLink to="odds" />
      <TeamTable cols={[54, 46, 50, 44, 56]} head={['Proj', 'No. 1', 'Top 4', 'Avg', 'Lottery']}>
        {rows.map((t, i) => (
          <LotteryRow key={t.tid} league={league} f={f} t={t} rank={i + 1} />
        ))}
      </TeamTable>
      <Foot help={<OddsHelp />}>Odds for each team&apos;s own 1st · → who owns it now</Foot>
    </div>
  );
}

/** The forecast's other half, one row away: the playoff odds from the lottery and the lottery from the odds. */
function ForecastLink({ to }: { to: 'odds' | 'lottery' }) {
  return (
    <Link to={`/league/standings?view=${to}`} replace className="card listrow clickable lg-cuplink">
      <span className="grow">
        <span className="lr-name">{to === 'lottery' ? 'Draft lottery' : 'Playoff odds'}</span>
        <span className="lr-meta">{to === 'lottery' ? 'Each team’s chance at the No. 1 pick' : 'Each team’s chance to make it and go deep'}</span>
      </span>
      <ChevronRight size={18} className="dim" aria-hidden="true" />
    </Link>
  );
}

function NoForecast() {
  return <div className="card empty">The season is over. The forecast returns in the preseason.</div>;
}

function OddsHelp() {
  return (
    <Help title="Season forecast">
      <p className="lg-p">
        The rest of the season is played {FORECAST_SIMS.toLocaleString('en-US')} times on the real schedule. Then come the <Term id="playin">play-in</Term>, the playoffs and the
        lottery draw.
      </p>
      <p className="lg-p">
        A team&apos;s strength is its net rating, weighed against what its roster is worth. Injured players count from when they&apos;re back. The early weeks are the least
        certain.
      </p>
      <p className="lg-p">Proj is the projected record. Under it, the range of wins in 8 of 10 seasons. Playoffs counts the play-in&apos;s winners. Swipe for the later rounds.</p>
      <p className="lg-p">
        The lottery covers every team not in the playoffs. The odds are for each team&apos;s own 1st, wherever a trade sent it. An arrow names its owner now. Avg is its average
        slot in the lottery.
      </p>
      <p className="lg-p">100% means a place is clinched, and — a team that&apos;s out. Anything else rounds to &gt;99% or &lt;1%.</p>
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
        {/* the wins it reaches in 8 seasons of 10, a range of wins ("30–44 W"), never a record */}
        {t.lo !== t.hi && <span className="odds-range">{`${t.lo}–${t.hi}\u00a0W`}</span>}
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
      // (a traded pick reads "LAC → OKC": the two abbreviations fit beside the figures where a name and its owner can't)
      name={owner ? league.teams[t.tid].abbrev : league.teams[t.tid].name}
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
