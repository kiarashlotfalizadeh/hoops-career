import { Fragment } from 'react';
import type { League } from '../../core/types';
import { standings, type StandingRow } from '../../core/league/standings';
import { curTeamSeason, fmtDate, teamPlayers } from '../../core/league/helpers';
import { useLeagueMemo } from '../../state/store';
import { Help } from '../components/ui';
import { Term } from '../components/Glossary';
import { f0, f1, signed, teamRatings } from '../stats';
import { Poster, confName, ordinal, streakLabel, teamPath, useQueryParam } from './shared';
import { Foot, ViewChips } from './Views';
import { OddsView, LotteryView } from './OddsView';
import { TableCut, TeamRow, TeamTable } from './Table';
import { plural } from '../../core/format';
import { latestPower } from '../../core/league/media';
import { PowerList } from './news/PowerList';
import { newsDate } from './news/Linked';

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
      {/* five chips, which fit a 360px phone: the lottery is the forecast's other half, a row inside Odds */}
      <ViewChips
        label="Standings view"
        value={view === 'lottery' ? 'odds' : view}
        onChange={setView}
        options={[
          { id: 'E', label: 'East' },
          { id: 'W', label: 'West' },
          { id: 'league', label: 'League' },
          { id: 'power', label: 'Power' },
          { id: 'odds', label: 'Odds' },
        ]}
      />
      {view === 'odds' && <OddsView league={league} />}
      {view === 'lottery' && <LotteryView league={league} />}
      {view === 'power' && <Power league={league} />}
      {(view === 'E' || view === 'W' || view === 'league') && <Standings league={league} view={view} />}
    </>
  );
}

function Standings({ league, view }: { league: League; view: 'E' | 'W' | 'league' }) {
  const all = useLeagueMemo(() => standings(league), [league]);
  const started = all.some((r) => r.won + r.lost > 0);
  // before a game is played there's no order to show: the teams A to Z, and the line says so
  const rows = started ? all : [...all].sort((a, b) => league.teams[a.tid].name.localeCompare(league.teams[b.tid].name));
  const shown = view === 'league' ? (started ? leagueRows(rows) : rows) : rows.filter((r) => r.conf === view);
  return (
    <div className="lg-block">
      <StandingsPoster league={league} rows={shown} view={view} started={started} />
      <StandingsTable league={league} rows={shown} conf={view !== 'league'} />
      <Foot help={<StandingsHelp />}>
        {!started ? (
          'Season not started · teams A to Z'
        ) : view === 'league' ? (
          'All 30 by win % · swipe for splits'
        ) : (
          <>
            <span className="lg-keys" aria-hidden="true">
              <b className="lg-clinch x">x</b> in <b className="lg-clinch p">p</b> clinched play-in <b className="lg-clinch e">e</b> out
            </span>
            <span className="lg-foot-sep">swipe for splits</span>
          </>
        )}
      </Foot>
    </div>
  );
}

/** "11", "15.5": games back as the table prints them. */
const gbText = (gb: number) => (gb % 1 ? gb.toFixed(1) : gb.toFixed(0));

/** The table's headline: who leads it and by how much (the figure), and where you stand when it isn't you. */
function StandingsPoster({ league, rows, view, started }: { league: League; rows: StandingRow[]; view: 'E' | 'W' | 'league'; started: boolean }) {
  const conf = view !== 'league';
  const over = `${conf ? `${confName(view)} standings` : 'League standings'} · ${fmtDate(league.season, league.day)}`;
  const nm = (r: StandingRow) => league.teams[r.tid].name;
  if (!started || rows.length < 2) return <Poster over={over} head="Everyone starts at 0-0" />;
  const [a, b] = rows;
  const gap = b.gb - a.gb;
  const meIdx = rows.findIndex((r) => r.tid === league.userTid);
  const me = rows[meIdx];
  const dek =
    me && meIdx > 0 && (gap > 0 || meIdx > 1)
      ? `${nm(me)}: ${ordinal(conf ? me.confRank : me.leagueRank)}, ${me.gb - a.gb ? `${gbText(me.gb - a.gb)} back` : 'level with the lead'}`
      : undefined;
  if (gap <= 0) return <Poster over={over} head={`${nm(a)} and ${nm(b)} tied ${conf ? `for the ${confName(view)} lead` : 'for the best record'}`} dek={dek} />;
  return (
    <Poster
      over={over}
      head={conf ? `${nm(a)} lead the ${confName(view)}` : `${nm(a)} have the league's best record`}
      dek={dek}
      fig={{ v: gbText(gap), k: gap === 1 ? 'game clear' : 'games clear' }}
    />
  );
}

/** How the table reads and how ties break, a tap away. */
function StandingsHelp() {
  return (
    <Help title="Seeds and tiebreakers">
      <p className="lg-p">
        Seeds 1-6 in each conference make the playoffs; 7-10 go to the <Term id="playin">play-in</Term>. <Term id="gb">GB</Term> is games behind the leader.{' '}
        <b className="lg-clinch x">x</b> clinched a playoff spot, <b className="lg-clinch p">p</b> clinched at least the play-in, <b className="lg-clinch e">e</b> eliminated. Swipe
        the table for home, away and conference records and point differential.
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
    r.gb ? `${plural(r.gb, 'game')} back` : '',
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
    // (a phone shows the record, games back and the streak beside the team; the splits wait a swipe
    // away. "Last 10" so "L10" can't read as a streak)
    <TeamTable cols={[50, 38, 48, 50, 46, 46, 46, 46]} head={['W-L', 'GB', 'Streak', 'Last 10', 'Home', 'Away', 'Conf', 'Diff']}>
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
              <span aria-hidden="true">{r.gb === 0 ? '—' : r.gb % 1 ? r.gb.toFixed(1) : r.gb.toFixed(0)}</span>
              <span className={`strk ${r.streak > 0 ? 'good' : r.streak < 0 ? 'bad' : ''}`} aria-hidden="true">
                {streakLabel(r.streak)}
              </span>
              {/* (before opening night every split is a dash, as GB and the streak are) */}
              <span aria-hidden="true">{played ? r.lastTen : '—'}</span>
              <span aria-hidden="true">{played ? r.home : '—'}</span>
              <span aria-hidden="true">{played ? r.away : '—'}</span>
              <span aria-hidden="true">{played ? r.confRec : '—'}</span>
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

/**
 * Power: the press's weekly rankings once the season has had a week (each team's move and the
 * press's line on it), with the numbers behind an order (net rating, roster strength) a tap away.
 */
function Power({ league }: { league: League }) {
  const rows = latestPower(league);
  const [mode, setMode] = useQueryParam<'press' | 'net'>('pw', 'press', ['press', 'net']);
  if (!rows) return <PowerRankings league={league} />;
  const p = league.media!.power!;
  const week = `Week ${Math.max(1, Math.round(p.day / 7))}`;
  const top = rows.find((r) => r.rank === 1) ?? rows[0];
  const mine = rows.find((r) => r.tid === league.userTid);
  const topName = league.teams[top.tid].name;
  const head = top.prev === 1 ? `${topName} stay No. 1` : top.prev !== undefined ? `${topName} up to No. 1` : `${topName} start at No. 1`;
  return mode === 'net' ? (
    <PowerRankings league={league} back={() => setMode('press')} week={week} />
  ) : (
    <div className="lg-block">
      <Poster
        over={`Power rankings · ${week} · ${newsDate(league, p, false)}`}
        head={head}
        dek={
          mine && mine.rank !== 1
            ? `${league.teams[mine.tid].name}: No. ${mine.rank}${mine.prev !== undefined && mine.prev !== mine.rank ? `, ${mine.prev > mine.rank ? 'up' : 'down'} from ${mine.prev}` : ''}`
            : undefined
        }
      >
        <button type="button" className="btn text sm lg-poster-act" onClick={() => setMode('net')}>
          By net rating
        </button>
      </Poster>
      <PowerList league={league} rows={rows} />
      <Foot
        help={
          <Help title="Power rankings">
            <p className="lg-p">
              The press ranks all 30 teams once a week: how good each team is now (its net rating this season, weighed against what its healthy roster is worth, so an injury to a
              star shows), its record and its last ten games.
            </p>
            <p className="lg-p">The arrows show the move since last week. By net rating orders the teams by the numbers alone, today.</p>
          </Help>
        }
      >
        The press&apos;s weekly order, its move since last week
      </Foot>
    </div>
  );
}

/** The order by the numbers alone; `back` returns to the press's week when there is one. */
function PowerRankings({ league, back, week }: { league: League; back?: () => void; week?: string }) {
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

  const early = list.every((x) => x.gp === 0) ? (
    'By roster strength until games are played'
  ) : (
    <>
      By <Term id="ortg">net rating</Term>
      {list.some((x) => x.gp < 10) ? ', with roster strength early on' : ''}
    </>
  );
  return (
    <div className="lg-block">
      {list[0] && (
        <Poster
          over={`Power rankings · ${fmtDate(league.season, league.day)}`}
          head={`${league.teams[list[0].tid].name} on top`}
          dek={early}
          // the figure that orders the table: the net rating once teams have played enough, roster strength before
          fig={list[0].gp >= 10 ? { v: signed(list[0].tr.net), k: 'net per 100' } : { v: f0(list[0].talent), k: 'top 8 OVR' }}
        >
          {back && (
            <button type="button" className="btn text sm lg-poster-act" onClick={back}>
              {week} ranking
            </button>
          )}
        </Poster>
      )}
      <TeamTable
        // (roster strength third, in a phone's view without a swipe: it orders the table until games are played)
        cols={[48, 50, 48, 52, 52]}
        head={[
          <span key="n" className="as-is">
            Net
          </span>,
          'W-L',
          'Top 8',
          <span key="o" className="as-is">
            ORtg
          </span>,
          <span key="d" className="as-is">
            DRtg
          </span>,
        ]}
      >
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
            <span aria-hidden="true">{f0(x.talent)}</span>
            <span aria-hidden="true">{x.gp ? f1(x.tr.ortg) : '—'}</span>
            <span aria-hidden="true">{x.gp ? f1(x.tr.drtg) : '—'}</span>
          </TeamRow>
        ))}
      </TeamTable>
      <Foot
        help={
          <Help title="Power rankings">
            <p className="lg-p">Teams are ordered by net rating: offensive rating (points scored per 100 possessions) minus defensive rating (points allowed per 100).</p>
            <p className="lg-p">
              Net rating predicts future results better than win-loss record. Early in the season, roster strength (Top 8: the average OVR of the eight best players) is blended in
              until about ten games are played.
            </p>
          </Help>
        }
      >
        Net per 100 possessions · Top 8 is the eight best OVRs
      </Foot>
    </div>
  );
}
