import { Fragment } from 'react';
import type { League } from '../../core/types';
import { standings, type StandingRow } from '../../core/league/standings';
import { curTeamSeason, teamPlayers } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { Help, Segmented } from '../components/ui';
import { Term } from '../components/Glossary';
import { f0, f1, signed, teamRatings } from '../stats';
import { Toolbar, confName, ordinal, streakLabel, teamPath, useQueryParam } from './shared';
import { OddsView, LotteryView } from './OddsView';
import { TableCut, TeamRow, TeamTable } from './Table';

type View = 'E' | 'W' | 'league' | 'power' | 'odds' | 'lottery';

/** Standings: either conference, the whole league, power rankings, and the season forecast (playoff and lottery odds), one switch apart. */
export function StandingsTab({ league }: { league: League }) {
  const userConf = league.teams[league.userTid].conf;
  const [raw, setView] = useQueryParam<View>('view', userConf, ['E', 'W', 'league', 'power', 'odds', 'lottery']);
  // (a link from before the lottery had its own view)
  const [omode] = useQueryParam<string>('omode', '');
  const view: View = raw === 'odds' && omode === 'lottery' ? 'lottery' : raw;
  return (
    <>
      <Segmented
        label="Standings view"
        value={view}
        onChange={setView}
        options={[
          { id: 'E', label: 'East' },
          { id: 'W', label: 'West' },
          { id: 'league', label: 'League' },
          { id: 'power', label: 'Power' },
          { id: 'odds', label: 'Odds' },
          { id: 'lottery', label: 'Lottery' },
        ]}
      />
      {view === 'odds' && <OddsView league={league} />}
      {view === 'lottery' && <LotteryView league={league} />}
      {view === 'power' && <PowerRankings league={league} />}
      {(view === 'E' || view === 'W' || view === 'league') && <Standings league={league} view={view} />}
    </>
  );
}

function Standings({ league, view }: { league: League; view: 'E' | 'W' | 'league' }) {
  const rows = useLeagueMemo(() => standings(league), [league]);
  const started = rows.some((r) => r.won + r.lost > 0);
  return (
    <>
      <Toolbar right={<StandingsHelp />}>
        {!started ? 'Season not started' : view === 'league' ? 'By win %' : `${confName(view)}ern Conference`}
        {view !== 'league' && started && (
          <span className="lg-keys" aria-hidden="true">
            <b className="lg-clinch x">x</b> in <b className="lg-clinch p">p</b> play-in <b className="lg-clinch e">e</b> out
          </span>
        )}
      </Toolbar>
      <StandingsTable league={league} rows={view === 'league' ? leagueRows(rows) : rows.filter((r) => r.conf === view)} conf={view !== 'league'} />
    </>
  );
}

/** How the table reads and how ties break, a tap away. */
function StandingsHelp() {
  return (
    <Help title="Seeds and tiebreakers">
      <p className="lg-p">
        Seeds 1-6 in each conference make the playoffs; 7-10 go to the play-in. <b className="lg-clinch x">x</b> clinched a playoff spot, <b className="lg-clinch p">p</b> clinched
        at least the play-in, <b className="lg-clinch e">e</b> eliminated. Swipe the table for home, away and conference records and point differential.
      </p>
      <p className="lg-p">
        Two-team ties break on head-to-head, division leader, division record (same division only), conference record, record against playoff teams in the conference, then in the
        other conference, then point differential. In ties of three or more, division leaders go first.
      </p>
      <p className="lg-p">The League view ranks all 30 teams by win %, then point differential, with games behind the leader; seeds come from the conference standings.</p>
    </Help>
  );
}

/** League-wide order with GB measured from the overall leader. */
function leagueRows(rows: StandingRow[]): StandingRow[] {
  const sorted = [...rows].sort((a, b) => a.leagueRank - b.leagueRank);
  const lead = sorted[0];
  return sorted.map((r) => ({ ...r, gb: lead ? (lead.won - r.won + (r.lost - lead.lost)) / 2 : 0 }));
}

const CLINCH_TEXT: Partial<Record<NonNullable<StandingRow['clinched']>, string>> = { x: 'clinched a playoff spot', p: 'clinched a play-in spot', e: 'eliminated' };

/** A row read aloud after its rank and team as shown ("2 Spurs"): every column spelled out (the columns themselves are hidden from screen readers). */
function rowDetails(r: StandingRow, conf: boolean) {
  if (r.won + r.lost === 0) return ', 0-0';
  const cols = [
    conf ? `${ordinal(r.confRank)} in the ${confName(r.conf)}` : `${ordinal(r.leagueRank)} in the league`,
    `${r.won}-${r.lost}`,
    r.gb ? `${r.gb} game${r.gb === 1 ? '' : 's'} back` : '',
    `${r.lastTen} in the last 10`,
    r.streak ? `${r.streak > 0 ? 'won' : 'lost'} ${Math.abs(r.streak) === 1 ? 'the last game' : `${Math.abs(r.streak)} straight`}` : '',
    `${r.home} at home`,
    `${r.away} away`,
    `${r.confRec} in the conference`,
    `${signed(r.diff)} points a game`,
    r.clinched ? CLINCH_TEXT[r.clinched] : '',
  ];
  return `, ${cols.filter(Boolean).join(', ')}`;
}

function StandingsTable({ league, rows, conf }: { league: League; rows: StandingRow[]; conf: boolean }) {
  // the play-in and lottery lines mean nothing before a game is played
  const cuts = conf && rows.some((r) => r.won + r.lost > 0);
  return (
    <TeamTable cols={[46, 36, 36, 32, 44, 44, 44, 44]} head={['W-L', 'GB', 'L10', 'Strk', 'Home', 'Away', 'Conf', 'Diff']}>
      {rows.map((r, i) => {
        const t = league.teams[r.tid];
        const played = r.won + r.lost > 0;
        return (
          <Fragment key={r.tid}>
            <TeamRow
              to={teamPath(r.tid)}
              me={r.tid === league.userTid}
              rank={played ? conf ? r.confRank : r.leagueRank : <span aria-hidden="true">—</span>}
              tid={r.tid}
              name={t.name}
              after={
                <>
                  {r.clinched && (
                    <span className={`lg-clinch ${r.clinched}`} aria-hidden="true">
                      {r.clinched}
                    </span>
                  )}
                  {!conf && (
                    <span className="lg-conf" aria-hidden="true">
                      {r.conf}
                    </span>
                  )}
                </>
              }
              spoken={rowDetails(r, conf)}
            >
              <span className="wl" aria-hidden="true">
                {r.won}-{r.lost}
              </span>
              <span aria-hidden="true">{r.gb === 0 ? '—' : r.gb.toFixed(1)}</span>
              <span aria-hidden="true">{r.lastTen}</span>
              <span className={`strk ${r.streak > 0 ? 'good' : r.streak < 0 ? 'bad' : ''}`} aria-hidden="true">
                {streakLabel(r.streak)}
              </span>
              <span aria-hidden="true">{r.home}</span>
              <span aria-hidden="true">{r.away}</span>
              <span aria-hidden="true">{r.confRec}</span>
              <span className={r.diff > 0 ? 'good' : r.diff < 0 ? 'bad' : ''} aria-hidden="true">
                {played ? signed(r.diff) : '—'}
              </span>
            </TeamRow>
            {cuts && i === 5 && rows.length > 6 && <TableCut label="Play-in" />}
            {cuts && i === 9 && rows.length > 10 && <TableCut label="Lottery" />}
          </Fragment>
        );
      })}
    </TeamTable>
  );
}

function PowerRankings({ league }: { league: League }) {
  const list = useLeagueMemo(() => {
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
  }, [league]);

  return (
    <>
      <Toolbar
        right={
          <Help title="Power rankings">
            <p className="lg-p">Teams are ordered by net rating: offensive rating (points scored per 100 possessions) minus defensive rating (points allowed per 100).</p>
            <p className="lg-p">
              Net rating predicts future results better than win-loss record. Early in the season, roster strength (average OVR of the top eight players, TAL) is blended in until
              about ten games are played.
            </p>
          </Help>
        }
      >
        {list.every((x) => x.gp === 0) ? (
          'By roster strength until games are played'
        ) : (
          <>
            By <Term id="ortg">net rating</Term>
            {list.some((x) => x.gp < 10) ? ', with roster strength early on' : ''}
          </>
        )}
      </Toolbar>
      <TeamTable cols={[48, 46, 48, 48, 36]} head={['Net', 'W-L', 'ORtg', 'DRtg', 'Tal']}>
        {list.map((x, i) => (
          <TeamRow
            key={x.tid}
            to={teamPath(x.tid)}
            me={x.tid === league.userTid}
            rank={i + 1}
            tid={x.tid}
            name={league.teams[x.tid].name}
            spoken={`, ${x.ts.won}-${x.ts.lost}${x.gp ? `, net rating ${signed(x.tr.net)}` : ''}, roster strength ${f0(x.talent)}`}
          >
            <span className={`wl ${x.gp ? (x.tr.net >= 0 ? 'good' : 'bad') : 'dim'}`} aria-hidden="true">
              {x.gp ? signed(x.tr.net) : '—'}
            </span>
            <span aria-hidden="true">
              {x.ts.won}-{x.ts.lost}
            </span>
            <span aria-hidden="true">{x.gp ? f1(x.tr.ortg) : '—'}</span>
            <span aria-hidden="true">{x.gp ? f1(x.tr.drtg) : '—'}</span>
            <span aria-hidden="true">{f0(x.talent)}</span>
          </TeamRow>
        ))}
      </TeamTable>
    </>
  );
}
