// The post-game recap for one of the user's games, most telling first: the three stars (the player
// of the game first), the keys to the game graded, the night (how win probability turned, what the
// result did to the standings or the series, milestones and records), the highlights, the press
// conference (the quotes, then the user's answer, each with what it does to the locker room) and the
// rest of the night's results that matter to him (the Continue bar, or the final card's Next game,
// names the next game). Takes a stored result, so the report and the Live screen's final card can
// both show it. FinalSlab is the result itself, as a
// broadcast's final graphic, over both.
import { KeysGraded } from './GameKeys';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameResult, League, PressChoice, ScheduledGame, StandingLine } from '../../core/types';
import { buildGameReport, type GameReport } from '../../core/analysis/gameReport';
import {
  holdPress,
  isLatestUserGame,
  postGameQuotes,
  pressEffects,
  pressOpen,
  pressOptions,
  pressSummary,
  streakAfter,
  threeStars,
  type PressEffect,
} from '../../core/analysis/quotes';
import { COMEBACK_WP, playAt, swingWords, TURN_MIN, wpStory, wpText, type WpPoint } from '../../core/analysis/winProb';
import { markText, milestonesIn } from '../../core/analysis/milestones';
import { recordWhat, recordsHeld } from '../../core/league/records';
import { seriesLabel } from '../../core/league/playoffs';
import { confStandings } from '../../core/league/standings';
import { cupLabel } from '../../core/league/cup';
import { fmtDate, playerName } from '../../core/league/helpers';
import { act } from '../../state/actions';
import { useStore } from '../../state/store';
import { matchupLooks } from '../teamColors';
import { finalLabel, fmtClock, ordinal, periodLabel } from '../stats';
import { Avatar, Help, Section, Tag } from './ui';
import { TeamLogo } from './TeamLogo';
import { QuarterTable } from './gameBlocks';
import './gameday.css';

const confWord = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');
// (none for the leader: "1st" already says it)
const gbText = (l: StandingLine) => (l.rank === 1 ? '' : `${l.gb % 1 ? l.gb.toFixed(1) : l.gb} GB`);
const CLINCH: Record<NonNullable<StandingLine['clinched']>, { text: string; tone: 'good' | 'info' | 'bad' }> = {
  x: { text: 'Clinched a playoff spot', tone: 'good' },
  p: { text: 'Clinched a play-in spot', tone: 'info' },
  e: { text: 'Eliminated from the postseason', tone: 'bad' },
};

/** "NBA Cup · Final", "Playoffs", "Play-In", "Regular season". */
export function gameTypeLabel(league: League, g: GameResult): string {
  return cupLabel(league, { cup: g.cup, home: g.home.tid, season: g.season }) ?? (g.type === 'playoffs' ? 'Playoffs' : g.type === 'playin' ? 'Play-In' : 'Regular season');
}

/**
 * The result as a broadcast's final: both teams in their colours, the score, the linescore, and
 * whether the user won. `children` go under it (the final card's buttons).
 */
export function FinalSlab({ res, league, children }: { res: GameResult; league: League; children?: ReactNode }) {
  const home = league.teams[res.home.tid];
  const away = league.teams[res.away.tid];
  // (on a clash the away side wears its second colour, so the two halves never read as one)
  const [lh, la] = matchupLooks(home.colors, away.colors);
  const us = res.home.tid === league.userTid ? res.home : res.away.tid === league.userTid ? res.away : null;
  const won = !!us && us.pts > (us === res.home ? res.away : res.home).pts;
  const side = (t: typeof home, pts: number, win: boolean, isHome: boolean) => (
    <Link to={t.tid === league.userTid ? '/team' : `/teams/${t.tid}`} className={`gd-fs-team${isHome ? ' home' : ''}${win ? '' : ' lost'}`}>
      <TeamLogo tid={t.tid} size={40} decorative />
      <span className="gd-fs-ab">{t.abbrev}</span>
      <span className="gd-fs-pts num">{pts}</span>
    </Link>
  );
  return (
    <section
      className="slab gd-final"
      aria-label={`Final: ${away.name} ${res.away.pts}, ${home.name} ${res.home.pts}`}
      style={{ '--fa': la.slab, '--fh': lh.slab, '--ta': la.trim, '--th': lh.trim } as CSSProperties}
    >
      <div className="gd-fs-over">
        <span>{gameTypeLabel(league, res)}</span>
        <span>
          {fmtDate(res.season, res.day, { weekday: 'short', month: 'short', day: 'numeric' })}
          {res.att ? ` · Att ${res.att.toLocaleString()}` : ''}
        </span>
      </div>
      <div className="gd-fs-row">
        {side(away, res.away.pts, res.away.pts > res.home.pts, false)}
        <div className="gd-fs-mid">
          <span className="gd-fs-final">{finalLabel(res.ot)}</span>
          {us && <span className={`gd-fs-wl ${won ? 'w' : 'l'}`}>{won ? 'Win' : 'Loss'}</span>}
        </div>
        {side(home, res.home.pts, res.home.pts > res.away.pts, true)}
      </div>
      <QuarterTable g={res} abbrevs={{ [home.tid]: home.abbrev, [away.tid]: away.abbrev }} />
      {children && <div className="gd-fs-actions">{children}</div>}
    </section>
  );
}

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
    ? `${periodLabel(turn.point.q)} ${fmtClock(turn.point.clock)}, ${
        turnPlay ? turnPlay.text.replace(/\.$/, '') : `${winAbbrev} ${swingWords(winnerMargin(turn.prev.margin), winnerMargin(turn.point.margin))}`
      }: ${winAbbrev} ${pct(turn.from)} → ${pct(turn.to)} to win.`
    : null;
  // the winner's low point: a comeback (ours) or a lead let slip (theirs); at tip-off, an upset
  const low = story && story.low.wp <= COMEBACK_WP ? story.low : null;
  const lowWhere = (p: WpPoint) => {
    const m = ourMargin(p.margin);
    return `${m > 0 ? `up ${m}` : m < 0 ? `down ${-m}` : 'tied'}, ${periodLabel(p.q)} ${fmtClock(p.clock)}`;
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
                      {line.pts} pts · {line.orb + line.drb} reb · {line.ast} ast{pog ? ` · ${line.fgm}/${line.fga} FG` : ''}
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
                {stakes.after.rank === stakes.before.rank ? (
                  <b className="num">{ordinal(stakes.after.rank)}</b>
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
                <span className={streak > 0 ? 'good' : 'bad'}>{streak > 0 ? `Won ${streak} straight` : `Lost ${-streak} straight`}</span>
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

      <PressConference league={league} res={res} quotes={quotes} />

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
                  <span className="tiny dim">{finalLabel(g.ot)}</span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

/**
 * What was said after the game, and the user's own answer (his latest game only, once): each answer
 * shows what it does to the locker room before it's given (see the press conference in quotes.ts).
 */
function PressConference({ league, res, quotes }: { league: League; res: GameResult; quotes: ReturnType<typeof postGameQuotes> }) {
  const simming = useStore((s) => !!s.sim);
  const [given, setGiven] = useState<PressEffect[] | null>(null);
  const tid = league.userTid;
  const press = isLatestUserGame(league, res) ? pressOptions(league, res) : [];
  const open = pressOpen(league, res);
  const held = league.press?.gid === res.gid ? league.press.choice : undefined;
  const answer = (choice: PressChoice) => {
    let fx: PressEffect[] | null = null;
    if (
      !act('Press conference', (l) => {
        const g = l.games.find((x) => x.gid === res.gid);
        if (g) fx = holdPress(l, g, choice);
      })
    )
      return;
    setGiven(fx);
  };
  const answering = press.length > 0 && (open || held);
  if (!quotes.length && !answering) return null;
  return (
    <Section
      title="Press conference"
      right={
        answering && !held ? (
          <Help title="Press conference">
            <p>
              One answer after your latest game, if you want to give one. It moves your players&apos; mood, which lifts or drags how they play a little and fades over the weeks.
            </p>
            <p>
              Praise lifts the player of the game most, but the teammate he outshone and a starter who had a poor night cool a little. Crediting the group lifts everyone after a
              win; after a loss it reads as soft.
            </p>
            <p>
              After a loss, challenging the team fires up players in a good mood and stings unhappy ones; calling out the player who struggled most is a big swing: a veteran in a
              good mood takes it as a challenge, anyone else takes it badly.
            </p>
          </Help>
        ) : undefined
      }
    >
      {quotes.length > 0 && (
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
      )}
      {answering &&
        (held ? (
          <div className="gd-press-done small">
            <span className="dim2">You: {press.find((o) => o.id === held)?.label ?? 'Answered'}.</span>{' '}
            <span className="bold">{pressSummary(given ?? pressEffects(league, res, held))}</span>
          </div>
        ) : (
          <div className="card flush list gd-press" role="group" aria-label="Your answer">
            {press.map((o) => (
              <button key={o.id} className="gd-press-opt" disabled={simming} onClick={() => answer(o.id)} aria-label={`${o.label}: ${o.hint}`}>
                <span className="gd-press-l">{o.label}</span>
                <span className="gd-press-h">
                  {/* (+ and − are whose mood it lifts or cools) */}
                  {/^[+−]/.test(o.hint) && <span className="dim">Mood </span>}
                  {o.hint.split(' · ').map((part, i) => (
                    <span key={part}>
                      {i > 0 && ' · '}
                      <span className={part.startsWith('+') ? 'good' : part.startsWith('−') ? 'bad' : undefined}>{part}</span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
        ))}
    </Section>
  );
}
