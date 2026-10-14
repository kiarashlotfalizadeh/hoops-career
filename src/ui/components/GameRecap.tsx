// The post-game recap for one of the user's games: the player of the game, what the result did to
// the standings or the series, quotes and the press conference, the rest of the night's results
// that matter to you, and what's next. Takes a stored result, so the report and the Live screen's
// final card can both show it.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Mic, Trophy } from 'lucide-react';
import type { GameResult, League, PressChoice, ScheduledGame, StandingLine } from '../../core/types';
import { buildGameReport, type GameReport } from '../../core/analysis/gameReport';
import { holdPress, isLatestUserGame, postGameQuotes, pressEffects, pressOpen, pressOptions, pressSummary, streakAfter, type PressEffect } from '../../core/analysis/quotes';
import { seriesLabel } from '../../core/league/playoffs';
import { confStandings } from '../../core/league/standings';
import { fmtDate, playerName } from '../../core/league/helpers';
import { useStore } from '../../state/store';
import { finalLabel, ordinal } from '../stats';
import { Avatar, Card, Tag } from './ui';
import { TeamLogo } from './TeamLogo';
import './gameday.css';

const confWord = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');
const gbText = (l: StandingLine) => (l.rank === 1 ? 'in first' : `${l.gb % 1 ? l.gb.toFixed(1) : l.gb} GB`);
const CLINCH: Record<NonNullable<StandingLine['clinched']>, { text: string; tone: 'good' | 'info' | 'bad' }> = {
  x: { text: 'Clinched a playoff spot', tone: 'good' },
  p: { text: 'Clinched a play-in spot', tone: 'info' },
  e: { text: 'Eliminated from the postseason', tone: 'bad' },
};

/** A playoff series as it stood after this game, and its next game. */
function seriesAfter(league: League, res: GameResult, tid: number) {
  if (res.type !== 'playoffs' || !res.seriesId) return null;
  const games = league.games.filter(
    (g) => g.season === res.season && g.type === 'playoffs' && g.seriesId === res.seriesId && (g.day < res.day || (g.day === res.day && g.gid <= res.gid)),
  );
  const won = games.filter((g) => (g.home.pts > g.away.pts ? g.home.tid : g.away.tid) === tid).length;
  const lost = games.length - won;
  const s = res.season === league.season ? league.playoffs.find((x) => x.id === res.seriesId) : undefined;
  const next = league.schedule.filter((g) => g.seriesId === res.seriesId && g.type === 'playoffs' && g.day > res.day).sort((a, b) => a.day - b.day)[0];
  return { won, lost, label: s ? seriesLabel(s) : 'Playoffs', next: won < 4 && lost < 4 ? next : undefined, game: games.length + 1 };
}

/** The user's next game after this one: only for his latest game (an older report's "next" would be a game long gone). */
function nextUp(league: League, res: GameResult): ScheduledGame | undefined {
  if (!isLatestUserGame(league, res)) return undefined;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && (g.home === league.userTid || g.away === league.userTid))
    .sort((a, b) => a.day - b.day || a.gid - b.gid)[0];
}

export function GameRecap({ res, league, report }: { res: GameResult; league: League; report?: GameReport | null }) {
  const tid = league.userTid;
  const us = res.home.tid === tid ? res.home : res.away.tid === tid ? res.away : null;
  const rep = useMemo(() => (report !== undefined ? report : us && res.impacts ? buildGameReport(league, res) : null), [report, us, res, league]);
  const quotes = useMemo(() => (us ? postGameQuotes(league, res, rep) : []), [us, league, res, rep]);
  const [pressFx, setPressFx] = useState<string | null>(null);
  if (!us) return null;
  const them = us === res.home ? res.away : res.home;
  const won = us.pts > them.pts;
  const team = league.teams[tid];

  // player of the game
  const pogBox = res.pog !== undefined ? [...res.home.players, ...res.away.players].find((b) => b.pid === res.pog) : undefined;
  const pogP = res.pog !== undefined ? league.players[res.pog] : undefined;
  const pogMine = !!pogBox && us.players.includes(pogBox);
  const pogTeam = pogBox ? league.teams[pogMine ? us.tid : them.tid] : undefined;

  // standings (regular season) or the series (playoffs)
  const stakes = res.stakes?.tid === tid && res.stakes.before && res.stakes.after ? res.stakes : undefined;
  const newly = stakes?.after.clinched && stakes.after.clinched !== stakes.before.clinched ? CLINCH[stakes.after.clinched] : undefined;
  const streak = res.type === 'regular' ? streakAfter(league, res) : 0;
  const series = seriesAfter(league, res, tid);
  const playIn = res.type === 'playin' && res.seriesId ? res.seriesId : undefined;

  // the rest of the night: teams near you in the standings and your next opponent
  const next = nextUp(league, res);
  const nextOpp = next ? (next.home === tid ? next.away : next.home) : undefined;
  const near = new Set<number>();
  if (res.type === 'regular' && res.season === league.season) {
    const conf = confStandings(league, team.conf);
    const me = conf.findIndex((r) => r.tid === tid);
    for (const r of conf) if (me >= 0 && Math.abs(r.confRank - (me + 1)) <= 3) near.add(r.tid);
  }
  const elsewhere = league.games
    .filter(
      (g) =>
        g.season === res.season &&
        g.day === res.day &&
        g.gid !== res.gid &&
        (res.type === 'regular' ? [g.home.tid, g.away.tid].some((x) => near.has(x) || x === nextOpp) : g.type === res.type),
    )
    .slice(0, 4);

  const press = isLatestUserGame(league, res) ? pressOptions(league, res) : [];
  const open = pressOpen(league, res);
  const held = league.press?.gid === res.gid ? league.press.choice : undefined;
  const answer = (choice: PressChoice) => {
    const out: { fx: PressEffect[] | null } = { fx: null };
    useStore.getState().mutate((l) => {
      const g = l.games.find((x) => x.gid === res.gid);
      if (g) out.fx = holdPress(l, g, choice);
    });
    if (out.fx) setPressFx(pressSummary(out.fx));
  };
  const heldFx = held ? (pressFx ?? pressSummary(pressEffects(league, res, held))) : null;
  const pregame = league.settings.pregame !== false;

  return (
    <Card
      title={
        <h3>
          <Trophy size={14} style={{ verticalAlign: -2 }} /> {won ? 'Win' : 'Loss'} · {us.pts}-{them.pts}
          {res.ot ? ` ${finalLabel(res.ot).replace('F/', '')}` : ''}
        </h3>
      }
      right={<span className="small dim">{fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
    >
      <div className="col" style={{ gap: 12 }}>
        {pogBox && (
          <Link to={`/player/${pogBox.pid}`} className={`gd-pog ${pogMine ? 'mine' : ''}`} aria-label={`Player of the game: ${pogP ? playerName(pogP) : pogBox.name}`}>
            {pogP ? <Avatar p={pogP} /> : <TeamLogo tid={pogTeam?.tid ?? them.tid} size={40} decorative />}
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="tiny dim upper bold">Player of the game{pogMine ? '' : ` · ${pogTeam?.abbrev ?? ''}`}</div>
              <div className="bold ellipsis">{pogP ? playerName(pogP) : pogBox.name}</div>
              <div className="small dim2 num">
                {pogBox.pts} pts · {pogBox.orb + pogBox.drb} reb · {pogBox.ast} ast · {pogBox.fgm}/{pogBox.fga} FG
              </div>
            </div>
            {pogMine && <Tag tone="good">Yours</Tag>}
          </Link>
        )}

        <div className="col" style={{ gap: 4 }}>
          {stakes && (
            <div className="gd-line small">
              <span className="bold">{confWord(team.conf)}:</span>
              <span className="num">
                {ordinal(stakes.before.rank)} → {ordinal(stakes.after.rank)}
              </span>
              <span className={`num ${stakes.after.rank < stakes.before.rank ? 'good' : stakes.after.rank > stakes.before.rank ? 'bad' : 'dim'}`}>
                {stakes.after.rank < stakes.before.rank ? '▲' : stakes.after.rank > stakes.before.rank ? '▼' : '·'}
              </span>
              <span className="dim num">{gbText(stakes.after)}</span>
            </div>
          )}
          {newly && (
            <div className="gd-line">
              <Tag tone={newly.tone}>{newly.text}</Tag>
            </div>
          )}
          {Math.abs(streak) >= 2 && (
            <div className="gd-line small">
              <span className="bold">Streak:</span>
              <span className={streak > 0 ? 'good' : 'bad'}>{streak > 0 ? `Won ${streak} straight` : `Lost ${-streak} straight`}</span>
            </div>
          )}
          {series && (
            <div className="gd-line small">
              <span className="bold">{series.label}:</span>
              {series.won === 4 || series.lost === 4 ? (
                <span className={series.won === 4 ? 'good' : 'bad'}>
                  {series.won === 4 ? 'Won' : 'Lost'} the series {series.won}-{series.lost}
                </span>
              ) : (
                <span className="num">
                  Series {series.won}-{series.lost}
                  {series.next ? ` · Game ${series.game} ${fmtDate(league.season, series.next.day, { weekday: 'short' })}` : ''}
                </span>
              )}
            </div>
          )}
          {playIn && (
            <div className="gd-line small">
              <span className="bold">Play-in:</span>
              <span className={won ? 'good' : playIn.endsWith('-78') ? 'warn' : 'bad'}>
                {won
                  ? playIn.endsWith('-910')
                    ? 'Through to the game for the 8th seed'
                    : `In the playoffs as the ${playIn.endsWith('-78') ? '7th' : '8th'} seed`
                  : playIn.endsWith('-78')
                    ? 'One more chance: the game for the 8th seed'
                    : 'Season over'}
              </span>
            </div>
          )}
        </div>

        {quotes.length > 0 && (
          <div className="col" style={{ gap: 10 }}>
            {quotes.map((q, i) => (
              <blockquote key={i} className={`gd-quote ${q.tid === tid ? 'mine' : ''}`}>
                <p>“{q.text}”</p>
                <footer>
                  {q.who}, {q.role}
                </footer>
              </blockquote>
            ))}
          </div>
        )}

        {press.length > 0 && (open || held) && (
          <div className="card tight col" style={{ gap: 8 }}>
            <div>
              <div className="row" style={{ gap: 6 }}>
                <Mic size={14} className="dim" />
                <span className="small bold">Press conference</span>
              </div>
              {!held && <div className="tiny dim">Optional: your answer moves the locker room a little.</div>}
            </div>
            {held ? (
              <div className="small">
                <span className="dim2">You: {press.find((o) => o.id === held)?.label ?? 'Answered'}.</span> <span className="bold">{heldFx}</span>
              </div>
            ) : (
              <div className="row wrap" style={{ gap: 6 }}>
                {press.map((o) => (
                  <button key={o.id} className="btn sm" onClick={() => answer(o.id)}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {elsewhere.length > 0 && (
          <div className="col" style={{ gap: 0 }}>
            <div className="tiny dim upper bold">Elsewhere {res.day === league.day - 1 || res.day === league.day ? 'tonight' : 'that night'}</div>
            {elsewhere.map((g) => {
              const hw = g.home.pts > g.away.pts;
              return (
                <Link
                  key={g.gid}
                  to={`/game/${g.gid}`}
                  className="gd-row small"
                  aria-label={`${league.teams[g.away.tid].name} ${g.away.pts}, ${league.teams[g.home.tid].name} ${g.home.pts}`}
                >
                  <TeamLogo tid={g.away.tid} size={20} decorative />
                  <span className={`num ${hw ? 'dim' : 'bold'}`}>
                    {league.teams[g.away.tid].abbrev} {g.away.pts}
                  </span>
                  <span className="dim">@</span>
                  <TeamLogo tid={g.home.tid} size={20} decorative />
                  <span className={`num ${hw ? 'bold' : 'dim'}`}>
                    {league.teams[g.home.tid].abbrev} {g.home.pts}
                  </span>
                  <span className="grow" />
                  <span className="tiny dim">{finalLabel(g.ot)}</span>
                </Link>
              );
            })}
          </div>
        )}

        {next && nextOpp !== undefined && (
          <div className="card tight row" style={{ gap: 10 }}>
            <CalendarDays size={16} className="dim" />
            <TeamLogo tid={nextOpp} size={28} decorative />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="tiny dim upper bold">Next up</div>
              <div className="small bold ellipsis">
                {next.home === tid ? 'vs' : '@'} {league.teams[nextOpp].name}
              </div>
              <div className="row tiny dim" style={{ gap: 6 }}>
                {next.day === league.day ? 'Today' : fmtDate(league.season, next.day, { weekday: 'short', month: 'short', day: 'numeric' })}
                {next.day - res.day === 1 && <Tag tone="warn">Back-to-back</Tag>}
              </div>
            </div>
            {!pregame && next.day === league.day ? (
              <Link to="/live" className="btn sm primary" aria-label={`Watch and coach the game against the ${league.teams[nextOpp].name}`}>
                Watch & coach
              </Link>
            ) : (
              <Link to={`/preview/${next.gid}`} className="btn sm" aria-label={`Preview the game against the ${league.teams[nextOpp].name}`}>
                Preview <ArrowRight size={14} />
              </Link>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
