// Stats → Teams: every team's season in one sortable table, opened on net rating.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { League, TeamSeason } from '../../../core/types';
import { useLeagueMemo } from '../../../state/store';
import { TeamLogo } from '../../components/TeamLogo';
import { StatTable, type Col } from '../../components/ui';
import { f1, signed, teamRatings } from '../../stats';
import { teamPath } from '../shared';
import { pctCell } from './rows';

interface TeamRow {
  tid: number;
  ts: TeamSeason;
  tr: ReturnType<typeof teamRatings>;
}

export function TeamStatsTable({ league, season }: { league: League; season: number }) {
  const nav = useNavigate();
  const rows = useLeagueMemo(() => {
    const out: TeamRow[] = [];
    for (const t of league.teams) {
      const ts = t.seasons.find((x) => x.season === season);
      if (!ts || ts.won + ts.lost === 0) continue;
      out.push({ tid: t.tid, ts, tr: teamRatings(ts) });
    }
    return out;
  }, [league, season]);
  const cols = useMemo<Col<TeamRow>[]>(
    () => [
      {
        key: 'team',
        label: 'Team',
        left: true,
        sticky: true,
        get: (r) => league.teams[r.tid].abbrev,
        fmt: (_v, r) => (
          <span className="lg-tcell">
            <TeamLogo tid={r.tid} size={20} decorative />
            {league.teams[r.tid].abbrev}
          </span>
        ),
      },
      { key: 'wl', label: 'W-L', get: (r) => r.ts.won / Math.max(1, r.ts.won + r.ts.lost), fmt: (_v, r) => `${r.ts.won}-${r.ts.lost}` },
      // the table opens sorted by Net, so it sits where a phone shows it
      { key: 'net', label: 'Net', asIs: true, get: (r) => r.tr.net, fmt: (x) => <b className={(x as number) >= 0 ? 'good' : 'bad'}>{signed(x as number)}</b> },
      { key: 'ortg', label: 'ORtg', asIs: true, get: (r) => r.tr.ortg, fmt: (x) => f1(x as number), help: 'Points scored per 100 possessions' },
      { key: 'drtg', label: 'DRtg', asIs: true, get: (r) => -r.tr.drtg, fmt: (_x, r) => f1(r.tr.drtg), help: 'Points allowed per 100 possessions (lower is better)' },
      { key: 'ppg', label: 'PTS', get: (r) => r.tr.ppg, fmt: (x) => f1(x as number), help: 'Points a game' },
      { key: 'opp', label: 'OPP', get: (r) => r.tr.oppg, fmt: (x) => f1(x as number), help: 'Points allowed a game' },
      { key: 'pace', label: 'Pace', get: (r) => r.tr.pace, fmt: (x) => f1(x as number), help: 'Possessions per game' },
      { key: 'efg', label: 'eFG%', get: (r) => r.tr.efg, fmt: pctCell },
      { key: 'tov', label: 'TOV%', get: (r) => -r.tr.tov, fmt: (_x, r) => pctCell(r.tr.tov), help: 'Turnovers per possession (lower is better)' },
      { key: 'orb', label: 'ORB%', get: (r) => r.tr.orb, fmt: pctCell },
      { key: 'ftr', label: 'FT Rate', get: (r) => r.tr.ftr, fmt: (x) => ((x as number) * 100).toFixed(1), help: 'Free throw attempts per field goal attempt' },
      { key: 'tpr', label: '3PA Rate', get: (r) => r.tr.tpRate, fmt: (x) => ((x as number) * 100).toFixed(1), help: 'Share of field goal attempts from three' },
      { key: 'oefg', label: 'Opp eFG%', get: (r) => -r.tr.oppEfg, fmt: (_x, r) => pctCell(r.tr.oppEfg) },
    ],
    [league],
  );
  if (!rows.length) return <div className="card empty">{season === league.season ? 'No games played yet this season.' : 'Team stats are only tracked for simulated seasons.'}</div>;
  return (
    <>
      <StatTable rows={rows} cols={cols} initialSort="net" rowKey={(r) => r.tid} onRow={(r) => nav(teamPath(r.tid))} highlight={(r) => r.tid === league.userTid} />
      <div className="lg-note">Regular season · PTS and OPP per game, ratings per 100 possessions · DRtg, TOV% and Opp eFG% sort lowest (best) first.</div>
    </>
  );
}
