import { Fragment, useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { standings, type StandingRow } from '../../core/league/standings';
import { curTeamSeason, teamPlayers } from '../../core/league/helpers';
import { useStore } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Card, Help, Segmented } from '../components/ui';
import { f0, f1, signed, teamRatings } from '../stats';
import { streakLabel, useQueryParam } from './shared';

type View = 'E' | 'W' | 'league' | 'power';
type Cols = 'basic' | 'splits';

export function StandingsTab({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const userConf = league.teams[league.userTid].conf;
  const [view, setView] = useQueryParam<View>('view', userConf, ['E', 'W', 'league', 'power']);
  const [cols, setCols] = useQueryParam<Cols>('cols', 'basic', ['basic', 'splits']);
  const rows = useMemo(
    () => standings(league),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [league, v],
  );
  const started = rows.some((r) => r.won + r.lost > 0);

  return (
    <>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { id: 'E', label: 'East' },
          { id: 'W', label: 'West' },
          { id: 'league', label: 'League' },
          { id: 'power', label: 'Power' },
        ]}
      />
      {view === 'power' ? (
        <PowerRankings league={league} />
      ) : (
        <>
          <div className="row between">
            <span className="small dim">
              {!started ? 'Season has not started' : view === 'league' ? 'All 30 teams by win %' : `${view === 'E' ? 'Eastern' : 'Western'} Conference`}
            </span>
            <div className="chips lg-only-narrow">
              <button className={`chip lg-chip-xs ${cols === 'basic' ? 'on' : ''}`} aria-pressed={cols === 'basic'} onClick={() => setCols('basic')}>
                Standings
              </button>
              <button className={`chip lg-chip-xs ${cols === 'splits' ? 'on' : ''}`} aria-pressed={cols === 'splits'} onClick={() => setCols('splits')}>
                Splits
              </button>
            </div>
          </div>
          <StandingsTable league={league} rows={view === 'league' ? leagueRows(rows) : rows.filter((r) => r.conf === view)} conf={view !== 'league'} cols={cols} />
          {view === 'league' ? (
            <div className="lg-note">Teams are ranked by win %, then point differential. Playoff seeding uses the conference standings and their tiebreakers.</div>
          ) : (
            <div className="lg-note">
              Seeds 1-6 make the playoffs; 7-10 go to the play-in. <span className="lg-clinch x">x</span> clinched playoffs · <span className="lg-clinch p">p</span> clinched
              play-in · <span className="lg-clinch e">e</span> eliminated. Two-team ties break on head-to-head, division leader, division record (same division only), conference
              record, record against playoff teams in the conference, then in the other conference, then point differential. In ties of three or more, division leaders go first.
            </div>
          )}
        </>
      )}
    </>
  );
}

/** League-wide order with GB measured from the overall leader. */
function leagueRows(rows: StandingRow[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => a.leagueRank - b.leagueRank);
  const lead = sorted[0];
  return sorted.map((r) => ({ ...r, gb: lead ? (lead.won - r.won + (r.lost - lead.lost)) / 2 : 0 }));
}

function StandingsTable({ league, rows, conf, cols }: { league: League; rows: StandingRow[]; conf: boolean; cols: Cols }) {
  // the play-in and lottery lines mean nothing before a game is played
  const cuts = conf && rows.some((r) => r.won + r.lost > 0);
  return (
    <Card className={`flush lg-flat lg-st mode-${cols}`}>
      <div className="lg-st-row lg-st-head">
        <span style={{ textAlign: 'right' }}>#</span>
        <span />
        <span>Team</span>
        <span>W-L</span>
        <span className="c-basic">GB</span>
        <span className="c-basic">L10</span>
        <span className="c-basic">Strk</span>
        <span className="c-split">Home</span>
        <span className="c-split">Away</span>
        <span className="c-split">Conf</span>
        <span className="c-split">Diff</span>
      </div>
      {rows.map((r, i) => {
        const t = league.teams[r.tid];
        const me = r.tid === league.userTid;
        return (
          <Fragment key={r.tid}>
            <Link to={`/team/${r.tid}`} className={`lg-st-row ${me ? 'me' : ''}`}>
              <span className="rk">{r.won + r.lost === 0 ? '–' : conf ? r.confRank : r.leagueRank}</span>
              <TeamLogo tid={r.tid} size={24} />
              <span className="nm">
                <span>
                  <span className="nm-full">{t.name}</span>
                  <span className="nm-ab">{t.abbrev}</span>
                </span>
                {r.clinched && <span className={`lg-clinch ${r.clinched}`}>{r.clinched}</span>}
                {!conf && (
                  <span className="tiny dim" style={{ fontWeight: 600 }}>
                    {r.conf}
                  </span>
                )}
              </span>
              <span className="wl">
                {r.won}-{r.lost}
              </span>
              <span className="c-basic dim2">{r.gb === 0 ? '–' : r.gb.toFixed(1)}</span>
              <span className="c-basic dim2">{r.lastTen}</span>
              <span className={`c-basic ${r.streak > 0 ? 'good' : r.streak < 0 ? 'bad' : 'dim'}`} style={{ fontWeight: 650 }}>
                {streakLabel(r.streak)}
              </span>
              <span className="c-split dim2">{r.home}</span>
              <span className="c-split dim2">{r.away}</span>
              <span className="c-split dim2">{r.confRec}</span>
              <span className={`c-split ${r.diff > 0 ? 'good' : r.diff < 0 ? 'bad' : 'dim'}`}>{r.won + r.lost ? signed(r.diff) : '–'}</span>
            </Link>
            {cuts && i === 5 && rows.length > 6 && (
              <div className="lg-cut">
                <span>Play-in</span>
              </div>
            )}
            {cuts && i === 9 && rows.length > 10 && (
              <div className="lg-cut">
                <span>Lottery</span>
              </div>
            )}
          </Fragment>
        );
      })}
    </Card>
  );
}

function PowerRankings({ league }: { league: League }) {
  const v = useStore((s) => s.v);
  const list = useMemo(() => {
    const base = league.teams.map((t) => {
      const ts = curTeamSeason(league, t.tid);
      const tr = teamRatings(ts);
      const top8 = teamPlayers(league, t.tid)
        .map((p) => p.ovr)
        .sort((a, b) => b - a)
        .slice(0, 8);
      const talent = top8.reduce((a, x) => a + x, 0) / Math.max(1, top8.length);
      return { tid: t.tid, ts, tr, talent, gp: ts.won + ts.lost };
    });
    const avgTalent = base.reduce((a, x) => a + x.talent, 0) / Math.max(1, base.length);
    return base
      .map((x) => {
        // Early in the season, lean on roster strength; after ~10 games the net rating speaks.
        const w = Math.min(1, x.gp / 10);
        const score = x.tr.net * w + (x.talent - avgTalent) * 1.3 * (1 - w);
        return { ...x, score };
      })
      .sort((a, b) => b.score - a.score);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league, v]);

  return (
    <>
      <div className="row between">
        <span className="small dim">
          {list.every((x) => x.gp === 0)
            ? 'Ranked by roster strength (TAL) until games are played'
            : list.some((x) => x.gp < 10)
              ? 'Net rating, blended with roster strength early on'
              : 'Ranked by net rating (points per 100 possessions)'}
        </span>
        <Help title="Power rankings">
          <p style={{ margin: 0 }}>Teams are ordered by net rating: offensive rating (points scored per 100 possessions) minus defensive rating (points allowed per 100).</p>
          <p style={{ margin: 0 }}>
            Net rating predicts future results better than win-loss record. Early in the season, roster strength (average OVR of the top eight players, TAL) is blended in until
            about ten games are played.
          </p>
        </Help>
      </div>
      <Card className="flush lg-flat lg-st mode-power">
        <div className="lg-st-row lg-st-head">
          <span style={{ textAlign: 'right' }}>#</span>
          <span />
          <span>Team</span>
          <span className="c-power">Net</span>
          <span className="c-power">ORtg</span>
          <span className="c-power">DRtg</span>
          <span className="c-power">Tal</span>
        </div>
        {list.map((x, i) => {
          const t = league.teams[x.tid];
          return (
            <Link key={x.tid} to={`/team/${x.tid}`} className={`lg-st-row ${x.tid === league.userTid ? 'me' : ''}`}>
              <span className="rk">{i + 1}</span>
              <TeamLogo tid={x.tid} size={24} />
              <span className="nm" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}>
                <span style={{ maxWidth: '100%' }}>{t.name}</span>
                <span className="tiny dim num" style={{ fontWeight: 600 }}>
                  {x.ts.won}-{x.ts.lost}
                </span>
              </span>
              <span className={`c-power bold ${x.gp ? (x.tr.net >= 0 ? 'good' : 'bad') : 'dim'}`}>{x.gp ? signed(x.tr.net) : '–'}</span>
              <span className="c-power dim2">{x.gp ? f1(x.tr.ortg) : '–'}</span>
              <span className="c-power dim2">{x.gp ? f1(x.tr.drtg) : '–'}</span>
              <span className="c-power dim2">{f0(x.talent)}</span>
            </Link>
          );
        })}
      </Card>
    </>
  );
}
