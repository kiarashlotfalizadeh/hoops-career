// The post-game recap for one of the user's games, most telling first: the staff's debrief (its
// verdict, what decided it, your moves and what to do next time), the three stars (the player of the
// game first), the keys to the game graded, the night (how win probability turned, what the
// result did to the standings or the series, milestones and records), the highlights, what was
// said after the game and the rest of the night's results that matter to him (the Continue bar, or
// the final card's Next game, names the next game). Takes a stored result, so the report and the
// Live screen's final card can both show it, under the result itself (FinalSlab.tsx).
import { KeysGraded } from './GameKeys';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameResult, League, ScheduledGame, StandingLine } from '../../core/types';
import { buildGameReport, type GameReport } from '../../core/analysis/gameReport';
import { isLatestUserGame, postGameQuotes, streakAfter, threeStars } from '../../core/analysis/quotes';
import { COMEBACK_WP, playAt, swingWords, TURN_MIN, wpStory, wpText, type WpPoint } from '../../core/analysis/winProb';
import { markText, milestonesIn } from '../../core/analysis/milestones';
import { recordWhat, recordsHeld } from '../../core/league/records';
import { seriesLabel } from '../../core/league/playoffs';
import { confStandings } from '../../core/league/standings';
import { fmtDate, playerName } from '../../core/league/helpers';
import { finalLabel, ordinal } from '../stats';
import { streakText } from '../games/series';
import { gameTime, madeAtt } from '../../core/format';
import { Avatar, Section, Tag } from './ui';
import { Debrief } from './Debrief';
import { TeamLogo } from './TeamLogo';
import './gameday.css';

const confWord = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');
// (none for the leader: "1st" already says it)
const gbText = (l: StandingLine) => (l.rank === 1 ? '' : `${l.gb % 1 ? l.gb.toFixed(1) : l.gb} GB`);
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

/** A fact of the night: its label and what happened. */
function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="gd-fact">
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function GameRecap({ res, league, report, highlights }: { res: GameResult; league: League; report?: GameReport | null; highlights?: ReactNode }) {
  const tid = league.userTid;
  const us = res.home.tid === tid ? res.home : res.away.tid === tid ? res.away : null;
  const rep = useMemo(() => (report !== undefined ? report : us && res.impacts ? buildGameReport(league, res) : null), [report, us, res, league]);
  const quotes = useMemo(() => (us ? postGameQuotes(league, res, rep) : []), [us, league, res, rep]);
  const story = useMemo(() => (us ? wpStory(res) : null), [us, res]);
  const marks = useMemo(() => (us ? milestonesIn(league, res) : []), [us, league, res]);
  const records = useMemo(() => (us ? recordsHeld(league, res) : []), [us, league, res]);
  if (!us) return null;
  const them = us === res.home ? res.away : res.home;
  const won = us.pts > them.pts;
  const team = league.teams[tid];

  // the three stars, the player of the game first
  const stars = threeStars(res);
  const nameOf = (pid: number, fallback: string) => (league.players[pid] ? playerName(league.players[pid]) : fallback);

  // win probability: the play that swung it most the winner's way, and how low the winner fell
  const pct = wpText;
  const winAbbrev = league.teams[(story?.winner === 0 ? res.home : res.away).tid].abbrev;
  const winnerMargin = (m: number) => (story?.winner === 0 ? m : -m);
  const ourMargin = (m: number) => (us === res.home ? m : -m);
  const turn = story && story.turn.to - story.turn.from >= TURN_MIN ? story.turn : null;
  const turnPlay = turn ? playAt(res, turn.point) : null;
  const turnText = turn
    ? `${gameTime(turn.point.q, turn.point.clock)}, ${
        turnPlay ? turnPlay.text.replace(/\.$/, '') : `${winAbbrev} ${swingWords(winnerMargin(turn.prev.margin), winnerMargin(turn.point.margin))}`
      }: ${winAbbrev} ${pct(turn.from)} → ${pct(turn.to)} to win.`
    : null;
  // the winner's low point: a comeback (ours) or a lead let slip (theirs); at tip-off, an upset
  const low = story && story.low.wp <= COMEBACK_WP ? story.low : null;
  const lowWhere = (p: WpPoint) => {
    const m = ourMargin(p.margin);
    return `${m > 0 ? `up ${m}` : m < 0 ? `down ${-m}` : 'tied'}, ${gameTime(p.q, p.clock)}`;
  };
  const swing = !low
    ? null
    : low.point.i < 0
      ? { label: 'Upset', text: won ? `Won with a ${pct(low.wp)} chance at tip-off` : `Lost with a ${pct(1 - low.wp)} chance at tip-off` }
      : won
        ? { label: 'Comeback', text: `Won after falling to ${pct(low.wp)} (${lowWhere(low.point)})` }
        : { label: 'Let it slip', text: `Lost after reaching ${pct(1 - low.wp)} (${lowWhere(low.point)})` };

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

  const facts = !!(stakes || newly || Math.abs(streak) >= 2 || series || turnText || swing || marks.length || records.length || playIn);

  return (
    <div className="gd-recap">
      {rep && <Debrief res={res} league={league} report={rep} />}

      {stars.length > 0 && (
        <Section title="Three stars">
          <div className="card flush list">
            {stars.map(({ line, tid: st }, k) => {
              const p = league.players[line.pid];
              const mine = st === tid;
              const pog = k === 0 && line.pid === res.pog;
              return (
                // named by what it shows: "1 Player of the game Shai Gilgeous-Alexander 42 pts · …"
                <Link key={line.pid} to={`/player/${line.pid}`} className={`gd-star${pog ? ' pog' : ''}${mine ? ' mine' : ''}`}>
                  <span className="gd-star-n num">{k + 1}</span>
                  {p ? <Avatar p={p} /> : <TeamLogo tid={st} size={36} decorative />}
                  <span className="grow gd-star-who">
                    {pog && <span className="gd-star-k">Player of the game</span>}
                    <span className="gd-star-name ellipsis">{nameOf(line.pid, line.name)}</span>
                    <span className="gd-star-line num">
                      {line.pts} pts · {line.orb + line.drb} reb · {line.ast} ast{pog ? ` · ${madeAtt(line.fgm, line.fga)} FG` : ''}
                    </span>
                  </span>
                  {/* (your own carry your team's edge) */}
                  {!mine && <span className="gd-star-team">{league.teams[st]?.abbrev}</span>}
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {res.keys && res.keys.length > 0 && <KeysGraded keys={res.keys} />}

      {facts && (
        <Section title="The night">
          <dl className="gd-facts">
            {turnText && <Fact k="Turning point">{turnText}</Fact>}
            {swing && (
              <Fact k={swing.label}>
                <span className={won ? 'good' : 'bad'}>{swing.text}</span>
              </Fact>
            )}
            {stakes && (
              <Fact k={confWord(team.conf)}>
                {/* (a place held reads as one: "1st · no change", the live final's shape) */}
                {stakes.after.rank === stakes.before.rank ? (
                  <span className="num">
                    <b>{ordinal(stakes.after.rank)}</b> <span className="dim">· no change</span>
                  </span>
                ) : (
                  <>
                    <span className="num">
                      {ordinal(stakes.before.rank)} → <b>{ordinal(stakes.after.rank)}</b>
                    </span>{' '}
                    <span className={`num ${stakes.after.rank < stakes.before.rank ? 'good' : 'bad'}`}>{stakes.after.rank < stakes.before.rank ? '▲' : '▼'}</span>
                  </>
                )}
                {gbText(stakes.after) && <span className="dim num"> · {gbText(stakes.after)}</span>}
                {newly && (
                  <>
                    {' '}
                    <Tag tone={newly.tone}>{newly.text}</Tag>
                  </>
                )}
              </Fact>
            )}
            {!stakes && newly && (
              <Fact k="Clinched">
                <Tag tone={newly.tone}>{newly.text}</Tag>
              </Fact>
            )}
            {Math.abs(streak) >= 2 && (
              <Fact k="Streak">
                <span className={`num bold ${streak > 0 ? 'good' : 'bad'}`}>{streakText(streak)}</span>
              </Fact>
            )}
            {series && (
              <Fact k="Series">
                <span className="dim2">{series.label}: </span>
                {series.won === 4 || series.lost === 4 ? (
                  <span className={series.won === 4 ? 'good' : 'bad'}>
                    {series.won === 4 ? 'Won' : 'Lost'} the series {series.won}-{series.lost}
                  </span>
                ) : (
                  <span className="num">
                    {series.won}-{series.lost}
                    {series.next ? ` · Game ${series.game} ${fmtDate(league.season, series.next.day, { weekday: 'short' })}` : ''}
                  </span>
                )}
              </Fact>
            )}
            {playIn && (
              <Fact k="Play-in">
                <span className={won ? 'good' : playIn.endsWith('-78') ? 'warn' : 'bad'}>
                  {won
                    ? playIn.endsWith('-910')
                      ? 'Through to the game for the 8th seed'
                      : `In the playoffs as the ${playIn.endsWith('-78') ? '7th' : '8th'} seed`
                    : playIn.endsWith('-78')
                      ? 'One more chance: the game for the 8th seed'
                      : 'Season over'}
                </span>
              </Fact>
            )}
            {marks.length > 0 && (
              <Fact k="Milestone">
                {marks
                  .slice(0, 2)
                  .map((m) => `${nameOf(m.pid, '')}'s ${markText(m.stat, m.mark)}`)
                  .join('; ')}
              </Fact>
            )}
            {records.length > 0 && (
              <Fact k="Record">
                {records
                  .slice(0, 2)
                  .map((r) => {
                    const who = r.pid !== undefined ? `${nameOf(r.pid, '')}'s` : `${league.teams[r.tid]?.abbrev ?? '?'}'s`;
                    const whose = r.scope === 'league' ? 'league' : `${league.teams[r.tid]?.name ?? 'franchise'}`;
                    const what = r.team && r.stat === 'margin' ? `${r.v}-point win` : recordWhat(r);
                    return `${who} ${what}, a ${whose} ${r.book === 'post' ? 'playoff ' : ''}record`;
                  })
                  .join('; ')}
              </Fact>
            )}
          </dl>
        </Section>
      )}

      {highlights}

      {quotes.length > 0 && (
        <Section title="Postgame">
          <div className="gd-quotes">
            {quotes.map((q, i) => (
              <blockquote key={i} className={`gd-quote ${q.tid === tid ? 'mine' : ''}`}>
                <p>“{q.text}”</p>
                <footer>
                  {q.who}, {q.role}
                </footer>
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      {elsewhere.length > 0 && (
        <Section title={`Elsewhere ${res.day === league.day - 1 || res.day === league.day ? 'tonight' : 'that night'}`}>
          <div className="card flush list">
            {elsewhere.map((g) => {
              const hw = g.home.pts > g.away.pts;
              return (
                // named by what it shows: "MIA 120 @ DET 117 FINAL"
                <Link key={g.gid} to={`/game/${g.gid}`} className="gd-other">
                  <span className={`gd-other-t${hw ? '' : ' won'}`}>
                    <TeamLogo tid={g.away.tid} size={20} decorative />
                    <span>{league.teams[g.away.tid].abbrev}</span>
                    <span className="num">{g.away.pts}</span>
                  </span>
                  <span className="dim">@</span>
                  <span className={`gd-other-t${hw ? ' won' : ''}`}>
                    <TeamLogo tid={g.home.tid} size={20} decorative />
                    <span>{league.teams[g.home.tid].abbrev}</span>
                    <span className="num">{g.home.pts}</span>
                  </span>
                  <span className="grow" />
                  <span className="gd-other-f">{g.ot ? finalLabel(g.ot) : 'Final'}</span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
