import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import type { League } from '../../core/types';
import { standings, type StandingRow } from '../../core/league/standings';
import { curTeamSeason, teamPlayers } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Help, Segmented } from '../components/ui';
import { f0, f1, signed, teamRatings } from '../stats';
import { Toolbar, confName, ordinal, streakLabel, useQueryParam } from './shared';
import { OddsView } from './OddsView';

type View = 'E' | 'W' | 'league' | 'power' | 'odds';
type Cols = 'basic' | 'splits';

export function StandingsTab({ league }: { league: League }) {
  const userConf = league.teams[league.userTid].conf;
  const [view, setView] = useQueryParam<View>('view', userConf, ['E', 'W', 'league', 'power', 'odds']);
  const [cols, setCols] = useQueryParam<Cols>('cols', 'basic', ['basic', 'splits']);
  const rows = useLeagueMemo(() => standings(league), [league]);
  const started = rows.some((r) => r.won + r.lost > 0);

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
        ]}
      />
      {view === 'odds' ? (
        <OddsView league={league} />
      ) : view === 'power' ? (
        <PowerRankings league={league} />
      ) : (
        <>
          <Toolbar
            right={
              <>
                <div className="chips lg-only-narrow" role="group" aria-label="Columns">
                  <button className={`chip lg-chip-xs ${cols === 'basic' ? 'on' : ''}`} aria-pressed={cols === 'basic'} onClick={() => setCols('basic')}>
                    Standings
                  </button>
                  <button className={`chip lg-chip-xs ${cols === 'splits' ? 'on' : ''}`} aria-pressed={cols === 'splits'} onClick={() => setCols('splits')}>
                    Splits
                  </button>
                </div>
                <StandingsHelp />
              </>
            }
          >
            {!started ? 'Season not started' : view === 'league' ? 'All 30 teams by win %' : `${view === 'E' ? 'Eastern' : 'Western'} Conference`}
          </Toolbar>
          <StandingsTable league={league} rows={view === 'league' ? leagueRows(rows) : rows.filter((r) => r.conf === view)} conf={view !== 'league'} cols={cols} />
          {view === 'league' ? (
            <div className="lg-note">Ties break on point differential. Seeds come from the conference standings.</div>
          ) : (
            <div className="lg-legend">
              <span>1-6 playoffs</span>
              <span>7-10 play-in</span>
              <span>
                <b className="lg-clinch x">x</b> clinched
              </span>
              <span>
                <b className="lg-clinch p">p</b> play-in
              </span>
              <span>
                <b className="lg-clinch e">e</b> out
              </span>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** How the table reads and how ties break, a tap away. */
function StandingsHelp() {
  return (
    <Help title="Seeds and tiebreakers">
      <p className="lg-p">
        Seeds 1-6 in each conference make the playoffs; 7-10 go to the play-in. <b className="lg-clinch x">x</b> clinched a playoff spot, <b className="lg-clinch p">p</b> clinched
        at least the play-in, <b className="lg-clinch e">e</b> eliminated.
      </p>
      <p className="lg-p">
        Two-team ties break on head-to-head, division leader, division record (same division only), conference record, record against playoff teams in the conference, then in the
        other conference, then point differential. In ties of three or more, division leaders go first.
      </p>
      <p className="lg-p">The League view ranks all 30 teams by win %, then point differential; seeding uses the conference standings and their tiebreakers.</p>
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

/**
 * A row read aloud after its rank and team as shown ("2 Spurs"): every column spelled out, whichever
 * ones the screen shows (the columns themselves are hidden from screen readers).
 */
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

function StandingsTable({ league, rows, conf, cols }: { league: League; rows: StandingRow[]; conf: boolean; cols: Cols }) {
  // the play-in and lottery lines mean nothing before a game is played
  const cuts = conf && rows.some((r) => r.won + r.lost > 0);
  return (
    <div className={`card flush lg-st mode-${cols}`}>
      <div className="lg-st-row lg-st-head" aria-hidden="true">
        <span>#</span>
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
              <span className="rk">{r.won + r.lost === 0 ? <span aria-hidden="true">—</span> : conf ? r.confRank : r.leagueRank}</span>
              <TeamLogo tid={r.tid} size={24} decorative />
              <span className="nm">
                <span>
                  {/* "Spurs" here, "SAS" where the split columns need the room: whichever shows names the row */}
                  <span className="nm-full">{t.name}</span>
                  <span className="nm-ab">{t.abbrev}</span>
                </span>
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
                <span className="sr-only">{rowDetails(r, conf)}</span>
              </span>
              <span className="wl" aria-hidden="true">
                {r.won}-{r.lost}
              </span>
              <span className="c-basic" aria-hidden="true">
                {r.gb === 0 ? '—' : r.gb.toFixed(1)}
              </span>
              <span className="c-basic" aria-hidden="true">
                {r.lastTen}
              </span>
              <span className={`c-basic strk ${r.streak > 0 ? 'good' : r.streak < 0 ? 'bad' : ''}`} aria-hidden="true">
                {streakLabel(r.streak)}
              </span>
              <span className="c-split" aria-hidden="true">
                {r.home}
              </span>
              <span className="c-split" aria-hidden="true">
                {r.away}
              </span>
              <span className="c-split" aria-hidden="true">
                {r.confRec}
              </span>
              <span className={`c-split ${r.diff > 0 ? 'good' : r.diff < 0 ? 'bad' : ''}`} aria-hidden="true">
                {r.won + r.lost ? signed(r.diff) : '—'}
              </span>
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
    </div>
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
        {list.every((x) => x.gp === 0)
          ? 'By roster strength (TAL) until games are played'
          : list.some((x) => x.gp < 10)
            ? 'Net rating, with roster strength early on'
            : 'By net rating per 100 possessions'}
      </Toolbar>
      <div className="card flush lg-st mode-power">
        <div className="lg-st-row lg-st-head">
          <span>#</span>
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
              <TeamLogo tid={x.tid} size={24} decorative />
              <span className="nm two">
                <span>{t.name}</span>
                <span className="lg-st-rec">
                  {x.ts.won}-{x.ts.lost}
                </span>
              </span>
              <span className={`c-power wl ${x.gp ? (x.tr.net >= 0 ? 'good' : 'bad') : 'dim'}`}>{x.gp ? signed(x.tr.net) : '—'}</span>
              <span className="c-power">{x.gp ? f1(x.tr.ortg) : '—'}</span>
              <span className="c-power">{x.gp ? f1(x.tr.drtg) : '—'}</span>
              <span className="c-power">{f0(x.talent)}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
