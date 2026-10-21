// The user's coaching legacy (see world.ts): his milestones as they happen (a first win in a new job,
// career wins by the hundred, a ten-game streak, a 50- or 60-win season, a first playoff berth, series
// and title, firsts with each franchise, a win over every team in the league, his Coach of the Month
// and Coach of the Year honors), his signature wins (the biggest upsets by the odds at tip-off, the
// series he closed out, the title), the honors cabinet, the owner's and the fans' pulse through the
// season (legacyPulse.ts) and the review when the Finals end (legacyReview.ts). Each milestone makes
// the news and a short mail, once: `done` remembers it, and a save from before the legacy marks what
// its career had already reached the first time it's read, so nothing old fires as new. Nothing here
// draws from the league's random stream (phrasing comes from worldRng), and a game costs a few
// lookups unless it's the user's.
import type { GameResult, League, ScheduledGame } from '../types';
import { GAME, seasonLabel } from '../constants';
import { ordinal, plural } from '../format';
import { FRANCHISES } from '../teams';
import { winProb } from '../analysis/winProb';
import { worldRng } from './world';
import { addInbox, addNews, fmtDate } from './helpers';
import { coachCareer, coyWinners, openStint, stintSeasons, userCoach, type CoachCareer, type CoachSeason } from './coaches';
import { seriesLabel } from './playoffs';
import { pulseDay } from './legacyPulse';
import { buildSeasonReview, type SeasonReview } from './legacyReview';

/** A milestone of the user's career (LegacyState.milestones). */
export interface Milestone {
  /** What it is, once: "wins:100", "job:3:2027", "title:2028" (see LegacyState.done). */
  key: string;
  season: number;
  day: number;
  /** His team then. */
  tid: number;
  /** "Win No. 100 for Coach Smith". */
  head: string;
  /** One line with the specifics. */
  text: string;
  /** A front page (weight 3). */
  big?: true;
  /** The game it came in, when it came in one. */
  gid?: number;
}

/** One of the user's signature wins (LegacyState.wins): kept with its score and its story, since games are pruned after two seasons. */
export interface SignatureWin {
  gid: number;
  season: number;
  day: number;
  tid: number;
  opp: number;
  home: boolean;
  /** His team's points first. */
  score: [number, number];
  /** His chance to win at tip-off, in percent (absent for a game that kept no projection). */
  p?: number;
  kind: 'upset' | 'series' | 'title' | 'elimination';
  /** The playoff round (1-4), for a playoff win. */
  round?: number;
  /** "Beat the 58-win Celtics as 21% underdogs at TD Garden". */
  line: string;
  /** How big it was, for ranking (see winValue). */
  v: number;
}

/** A Coach of the Month the user won (LegacyState.honors): the press keeps two seasons of honors, the cabinet keeps his for good. */
export interface CoachHonor {
  kind: 'cotm';
  season: number;
  day: number;
  tid: number;
  conf?: 'E' | 'W';
  line: string;
}

/** The owner's and the fans' pulse at the end of a week: [day, the owner's job-security score, the fans' mood], both 0..100. */
export type PulsePoint = [day: number, owner: number, fans: number];

export interface LegacyState {
  /** The season the legacy started keeping (a save from before it: the season it was first read in). */
  since: number;
  /** Milestones reached, fired or (for a career from before the legacy) marked as already passed. */
  done: string[];
  /** The milestones, oldest first (at most MILESTONES_KEPT). */
  milestones: Milestone[];
  /** Signature wins, best first: the career's best and each recent season's (see keepWins). */
  wins: SignatureWin[];
  /** His Coach of the Month honors, oldest first. */
  honors: CoachHonor[];
  /** Every franchise he has beaten as a head coach (since `since`, and the games kept then). */
  beaten: number[];
  /** Playoff games won and lost since `since` (the registry keeps series, not games). */
  post?: [number, number];
  /** This season's pulse, a point a week (a new season or team starts it again). */
  pulse?: { season: number; tid: number; pts: PulsePoint[] };
  /** The owner's monthly check-ins this season: the days sent, and the record and his score at the last one. */
  checkins?: { season: number; tid: number; sent: string[]; last?: { won: number; lost: number; score: number } };
  /** The season reviews, oldest first (at most REVIEWS_KEPT). */
  reviews: SeasonReview[];
}

export const MILESTONES_KEPT = 120;
export const WINS_KEPT = 12;
export const LEGACY_REVIEWS_KEPT = 10;
/** Career wins that are milestones: 50, then every hundred. */
export const WIN_MARKS = [50, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 100)];
/** Winning streaks that are milestones (once a season each). */
export const STREAK_MARKS = [10, 15, 20];
/** Wins in a season that are milestones. */
export const SEASON_MARKS = [50, 60, 70];
/** A regular-season win at or under this chance at tip-off (percent) is a signature upset. */
export const UPSET_P = 30;

/** The legacy as it stands, or an empty one: for reading (screens). */
export function legacyOf(league: League): LegacyState {
  return league.legacy ?? { since: league.season, done: [], milestones: [], wins: [], honors: [], beaten: [], reviews: [] };
}

// ---------------------------------------------------------------- the state

/**
 * The legacy, started if the league has none: a career from before it (a save from an earlier
 * version, or a new league's first game) has its passed milestones marked done without news, the
 * game being counted (`credit`: a regular-season win just booked) excepted, so a 100th win that
 * comes in this very game still fires.
 */
export function ensureLegacy(league: League, credit = 0): LegacyState {
  if (league.legacy) return league.legacy;
  const s: LegacyState = { since: league.season, done: [], milestones: [], wins: [], honors: [], beaten: [], reviews: [], post: [0, 0] };
  league.legacy = s;
  const me = userCoach(league);
  if (!me) return s;
  const k = coachCareer(league, me, coyWinners(league));
  const done = new Set<string>();
  const won = k.won - credit;
  for (const n of WIN_MARKS) if (won >= n) done.add(`wins:${n}`);
  for (const j of k.stints) {
    const w = j.won - (j.stint === openStint(me) ? credit : 0);
    if (w > 0) done.add(jobKey(j.stint.tid, j.stint.from));
  }
  // the playoff runs of seasons already settled (this season's, still being played, fire as they happen)
  const settled = (season: number) => season < league.season || !['regular', 'playin', 'playoffs'].includes(league.phase);
  for (const l of k.lines) {
    const r = l.round ?? -1;
    if (!settled(l.season) || r < 1) continue;
    done.add('playoffs:first').add(`fr:${l.tid}:playoffs`).add(`berth:${l.season}`);
    if (r >= 2) done.add('series:first').add(`fr:${l.tid}:series`);
    if (r >= 3) done.add('round:3');
    if (r >= 4) done.add('round:4');
    if (r === 5) done.add('title:first').add(`fr:${l.tid}:title`).add(`title:${l.season}`);
  }
  for (const season of k.coy) done.add(`coy:${season}`);
  for (const a of league.awards) if (a.cupWinner !== undefined && k.lines.some((l) => l.season === a.season && l.tid === a.cupWinner)) done.add(`cup:${a.season}`);
  // this season's streak and wins as they stood before this game
  const ts = league.teams[league.userTid]?.seasons.find((x) => x.season === league.season);
  if (ts) {
    const cur = k.lines.find((l) => l.season === league.season && l.tid === league.userTid);
    for (const n of STREAK_MARKS) if (ts.streak - credit >= n) done.add(`streak:${league.season}:${n}`);
    for (const n of SEASON_MARKS) if ((cur?.won ?? 0) - credit >= n) done.add(`season:${league.season}:${n}`);
  }
  s.done = [...done];
  // the franchises he has beaten in the games the save still keeps
  const beaten = new Set<number>();
  for (const g of league.games) {
    const mine = mySide(league, g);
    if (mine && mine.us > mine.them && k.lines.some((l) => l.season === g.season && l.tid === mine.tid)) beaten.add(mine.opp);
  }
  s.beaten = [...beaten].sort((a, b) => a - b);
  if (beaten.size >= league.teams.length - 1) s.done.push('all-teams');
  return s;
}

const jobKey = (tid: number, from: number) => `job:${tid}:${from}`;

/** The user's side of a result: his team (the user's team that played it), his points and theirs, the opponent. Null when he wasn't in it. */
function mySide(league: League, g: GameResult, tid = league.userTid) {
  if (g.home.tid !== tid && g.away.tid !== tid) return null;
  const home = g.home.tid === tid;
  return { tid, home, opp: home ? g.away.tid : g.home.tid, us: home ? g.home.pts : g.away.pts, them: home ? g.away.pts : g.home.pts };
}

/** The user's chance to win at tip-off (0..1), from the projection the game kept; null without one. */
export function tipoffChance(g: GameResult, home: boolean): number | null {
  if (g.edge === undefined) return null;
  const p = winProb({ margin: 0, q: 1, clock: GAME.quarterSec, ball: null, edge: g.edge });
  return home ? p : 1 - p;
}

const teamName = (league: League, tid: number) => `${league.teams[tid].region} ${league.teams[tid].name}`;
const nick = (league: League, tid: number) => league.teams[tid].name;
/** The arena a team plays in (the franchise table's), or "<city>'s arena". */
export const arenaOf = (league: League, tid: number) => FRANCHISES[tid]?.arena ?? `${league.teams[tid].region}'s arena`;
/** Where a game was: "at TD Garden" (his road game) or "at home" (the arena named). */
const where = (league: League, side: { home: boolean; tid: number; opp: number }) => `at ${arenaOf(league, side.home ? side.tid : side.opp)}`;

// ---------------------------------------------------------------- milestones

/** A milestone reached: in the legacy, the news (a story at `weight`) and a short mail. */
function reach(
  league: League,
  m: Omit<Milestone, 'season' | 'day' | 'tid'> & { body?: string; pids?: number[]; mail: { from: string; subject?: string; body: string; important?: boolean } },
  weight: 2 | 3,
  news = true,
) {
  const s = ensureLegacy(league);
  if (s.done.includes(m.key)) return false;
  s.done.push(m.key);
  const ms: Milestone = {
    key: m.key,
    season: league.season,
    day: league.day,
    tid: league.userTid,
    head: m.head,
    text: m.text,
    ...(weight === 3 ? { big: true as const } : {}),
    ...(m.gid !== undefined ? { gid: m.gid } : {}),
  };
  s.milestones.push(ms);
  if (s.milestones.length > MILESTONES_KEPT) s.milestones.splice(0, s.milestones.length - MILESTONES_KEPT);
  if (news)
    addNews(league, {
      kind: 'milestone',
      head: m.head,
      text: m.text,
      ...(m.body ? { body: m.body } : {}),
      weight,
      tids: [league.userTid],
      pids: m.pids ?? [],
    });
  addInbox(league, {
    from: m.mail.from,
    subject: m.mail.subject ?? m.head,
    body: m.mail.body,
    tone: 'good',
    link: '/office/career?tab=milestones',
    ...(m.mail.important ? { important: true } : {}),
  });
  return true;
}

/** Mark a milestone passed without saying so (a bigger one in the same game says it). */
function mark(league: League, key: string) {
  const s = ensureLegacy(league);
  if (!s.done.includes(key)) s.done.push(key);
}

const has = (league: League, key: string) => !!league.legacy?.done.includes(key);

/** One of several phrasings, the same one every time for this occasion. */
function pick<T>(league: League, key: string, options: readonly T[]): T {
  return worldRng(league, 'legacy', key).pick(options);
}

/** "Win No. 100" headlines and their kin for a career-wins mark. */
function winsMilestone(league: League, k: CoachCareer, n: number, side: NonNullable<ReturnType<typeof mySide>>, gid: number) {
  const coach = league.coachName;
  const jobs = new Set(k.lines.map((l) => l.tid)).size;
  const pct = (k.won / Math.max(1, k.won + k.lost)).toFixed(3).replace(/^0/, '');
  const head = pick(league, `wins:${n}`, [`Win No. ${n} for ${coach}`, `${coach} reaches ${n} career wins`, `${n} and counting for ${coach}`, `${coach} gets to ${n}`]);
  const text = `It came ${side.us}-${side.them} over the ${teamName(league, side.opp)} ${where(league, side)}. ${k.won}-${k.lost} as a head coach (${pct})${jobs > 1 ? ` across ${plural(jobs, 'job')}` : ''}.`;
  const big = n === 100 || n % 500 === 0;
  reach(
    league,
    {
      key: `wins:${n}`,
      head,
      text,
      gid,
      ...(big
        ? {
            body: `${k.seasons > 1 ? `${plural(k.seasons, 'season')} in, ` : ''}${coach} has won ${n} games as a head coach. ${k.titles ? `${plural(k.titles, 'title')} along the way.` : k.playoffs ? `${plural(k.playoffs, 'playoff run')} along the way.` : 'The playoffs are still to come.'}`,
          }
        : {}),
      mail: {
        from: 'Media Relations',
        body: `${n} career wins, the latest ${side.us}-${side.them} over the ${nick(league, side.opp)}. You're ${k.won}-${k.lost} (${pct}).`,
        important: n % 500 === 0,
      },
    },
    big ? 3 : 2,
  );
}

/**
 * After every game. The user's: his wins over each team, his playoff record, the milestones the game
 * reached (a first win in the job, career wins, a streak, a season's wins, a series or a title) and
 * a signature win if it was one. Other teams' games cost two comparisons.
 */
export function legacyGame(league: League, g: ScheduledGame) {
  const tid = league.userTid;
  if ((g.home !== tid && g.away !== tid) || league.fired) return;
  let res: GameResult | undefined;
  for (let i = league.games.length - 1; i >= 0; i--)
    if (league.games[i].gid === g.gid) {
      res = league.games[i];
      break;
    }
  if (!res) return;
  const side = mySide(league, res);
  if (!side) return;
  const won = side.us > side.them;
  const regular = g.type === 'regular';
  const s = ensureLegacy(league, won && regular ? 1 : 0);
  if (g.type === 'playoffs' || g.type === 'playin') {
    s.post ??= [0, 0];
    s.post[won ? 0 : 1]++;
  }
  if (!won) return;
  if (!s.beaten.includes(side.opp)) {
    s.beaten.push(side.opp);
    s.beaten.sort((a, b) => a - b);
    if (s.beaten.length >= league.teams.length - 1 && league.teams.every((t) => t.tid === tid || s.beaten.includes(t.tid)))
      reach(
        league,
        {
          key: 'all-teams',
          head: pick(league, 'all-teams', [`${league.coachName} has beaten every team in the league`, `All ${league.teams.length - 1}: ${league.coachName} completes the set`]),
          text: `The ${nick(league, side.opp)} were the last: ${side.us}-${side.them} ${where(league, side)}. Every franchise in the league has now lost to a team he coached.`,
          gid: g.gid,
          mail: { from: 'Media Relations', body: `With the win over the ${nick(league, side.opp)}, you've beaten all ${league.teams.length - 1} other teams in the league.` },
        },
        2,
      );
  }
  const me = userCoach(league);
  const stint = me && openStint(me);
  if (me && stint && regular) {
    const k = coachCareer(league, me, new Map());
    const job = k.stints.find((j) => j.stint === stint);
    const date = fmtDate(league.season, res.day);
    // a first win: in his career, or in a new job (the career's own first says both)
    if (job && job.won >= 1 && !has(league, jobKey(stint.tid, stint.from))) {
      const first = k.won === 1;
      const coach = league.coachName;
      reach(
        league,
        {
          key: jobKey(stint.tid, stint.from),
          head: first
            ? pick(league, 'first-win', [
                `${coach} gets his first win`,
                `Win No. 1 for ${coach}`,
                `${coach} is off the mark: ${side.us}-${side.them} over the ${nick(league, side.opp)}`,
              ])
            : pick(league, jobKey(stint.tid, stint.from), [
                `${coach}'s first win with the ${nick(league, tid)}`,
                `${coach} is off the mark in ${league.teams[tid].region}`,
                `A first win for the ${nick(league, tid)}'s new coach`,
              ]),
          text: `${side.us}-${side.them} over the ${teamName(league, side.opp)} ${where(league, side)} on ${date}.${first ? '' : ` Win No. ${k.won} of his career, the first of a new job.`}`,
          body: first
            ? `The first of the career came on ${date}: ${teamName(league, tid)} ${side.us}, ${teamName(league, side.opp)} ${side.them}. Every coach in the league has one of these. Only the next ones are hard.`
            : undefined,
          gid: g.gid,
          mail: {
            from: 'Owner',
            subject: first ? 'Your first win' : `Your first win with the ${nick(league, tid)}`,
            body: first
              ? `${side.us}-${side.them}. The first one is in. Let's not stop at one.`
              : `${side.us}-${side.them} over the ${nick(league, side.opp)}. Welcome to ${league.teams[tid].region}. More of those.`,
          },
        },
        3,
      );
    }
    for (const n of WIN_MARKS) if (k.won >= n && !has(league, `wins:${n}`)) winsMilestone(league, k, n, side, g.gid);
    const ts = league.teams[tid].seasons.find((x) => x.season === league.season);
    if (ts) {
      for (const n of STREAK_MARKS) {
        if (ts.streak < n || has(league, `streak:${league.season}:${n}`)) continue;
        // a longer streak reached at once (an old save) says only the longest
        if (STREAK_MARKS.some((m) => m > n && ts.streak >= m)) {
          mark(league, `streak:${league.season}:${n}`);
          continue;
        }
        reach(
          league,
          {
            key: `streak:${league.season}:${n}`,
            head: pick(league, `streak:${league.season}:${n}`, [
              `${n} straight for the ${nick(league, tid)}`,
              `The ${nick(league, tid)} have won ${n} in a row`,
              `${n} in a row and counting`,
            ]),
            text: `The run reached ${n} with ${side.us}-${side.them} over the ${nick(league, side.opp)} ${where(league, side)}. ${ts.won}-${ts.lost} now.`,
            body: `Nobody has beaten the ${teamName(league, tid)} since ${streakStart(league, tid, n)}. ${n >= 15 ? `It's the kind of run a season is remembered by.` : `${league.coachName}'s team is the hottest in the league.`}`,
            gid: g.gid,
            mail: { from: 'Media Relations', body: `${n} wins in a row, the latest over the ${nick(league, side.opp)}. You're ${ts.won}-${ts.lost}.` },
          },
          3,
        );
      }
      const cur = job?.lines.find((l) => l.season === league.season);
      const sw = cur?.won ?? 0;
      for (const n of SEASON_MARKS) {
        if (sw < n || has(league, `season:${league.season}:${n}`)) continue;
        const firstEver = !k.lines.some((l) => l.season !== league.season && l.won >= n);
        reach(
          league,
          {
            key: `season:${league.season}:${n}`,
            head: pick(league, `season:${league.season}:${n}`, [
              `The ${nick(league, tid)} reach ${n} wins`,
              `${n} wins for ${league.coachName}'s ${nick(league, tid)}`,
              `${n} and still going: the ${nick(league, tid)}`,
            ]),
            text: `No. ${n} came ${side.us}-${side.them} over the ${nick(league, side.opp)} with ${plural(Math.max(0, 82 - ts.won - ts.lost), 'game')} left.${firstEver ? ` A first ${n}-win season for ${league.coachName}.` : ''}`,
            gid: g.gid,
            mail: { from: 'Media Relations', body: `${n} wins (${ts.won}-${ts.lost}).${firstEver ? ` The first ${n}-win season of your career.` : ''}` },
          },
          n >= 60 ? 3 : 2,
        );
      }
    }
  }
  if (g.type === 'playoffs') playoffMilestones(league, g, side);
  noteSignatureWin(league, g, res, side);
}

/** The day a streak of `n` began, in words ("Jan 4"): the first of its games. */
function streakStart(league: League, tid: number, n: number): string {
  let count = 0;
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season || g.type !== 'regular' || (g.home.tid !== tid && g.away.tid !== tid)) continue;
    if (++count === n) return fmtDate(league.season, g.day);
  }
  return 'the start of the run';
}

/** The user's series this game was part of, once it's decided by it. */
function seriesOf(league: League, g: ScheduledGame) {
  return league.playoffs.find((x) => x.id === g.seriesId);
}

/** A series won or the title: the career's firsts, the franchise's, and every title. */
function playoffMilestones(league: League, g: ScheduledGame, side: NonNullable<ReturnType<typeof mySide>>) {
  const s = seriesOf(league, g);
  if (!s || s.winner !== side.tid) return;
  const tid = side.tid;
  const games = `${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
  const coach = league.coachName;
  // (the title is in his record already: the series set the round)
  const titles = Math.max(1, userCoach(league) ? coachCareer(league, userCoach(league)!, new Map()).titles : 1);
  if (s.round === 4) {
    const first = !has(league, 'title:first');
    mark(league, 'title:first');
    mark(league, `fr:${tid}:title`);
    mark(league, 'series:first');
    mark(league, `fr:${tid}:series`);
    reach(
      league,
      {
        key: `title:${league.season}`,
        head: first
          ? pick(league, `title:${league.season}`, [
              `Champions: ${coach} wins his first title`,
              `The ${nick(league, tid)} are champions, and ${coach} has his ring`,
              `${coach}'s ${nick(league, tid)} win it all`,
            ])
          : pick(league, `title:${league.season}`, [`Title No. ${titles} for ${coach}`, `${coach} wins it all again`, `The ${nick(league, tid)} are champions once more`]),
        text: `${games} over the ${teamName(league, side.opp)} in the Finals, closed out ${side.us}-${side.them} ${where(league, side)}.`,
        body: `${teamName(league, tid)}, ${seasonLabel(league.season)} champions. ${first ? `It is the first title of ${coach}'s career` : `It is ${coach}'s ${ordinalWord(titles)} title`}, won ${games} against the ${nick(league, side.opp)}.`,
        gid: g.gid,
        mail: {
          from: 'Media Relations',
          subject: first ? 'Your first title' : `Title No. ${titles}`,
          body: `Champions, ${games} over the ${nick(league, side.opp)}.${first ? ' The first of your career.' : ''}`,
          important: first,
        },
      },
      3,
    );
    return;
  }
  // the career's first series win, else the franchise's first under him, else a first conference finals or Finals
  const round = s.round + 1;
  const label = seriesLabel(s);
  if (!has(league, 'series:first')) {
    mark(league, `fr:${tid}:series`);
    reach(
      league,
      {
        key: 'series:first',
        head: pick(league, 'series:first', [`${coach} wins his first playoff series`, `A first series win for ${coach}`, `${coach} gets past the first round`]),
        text: `${games} over the ${teamName(league, side.opp)} in the ${label}, closed out ${side.us}-${side.them} ${where(league, side)}.`,
        gid: g.gid,
        mail: { from: 'Media Relations', body: `Your first playoff series win: ${games} over the ${nick(league, side.opp)}.` },
      },
      3,
    );
  } else if (!has(league, `fr:${tid}:series`)) {
    reach(
      league,
      {
        key: `fr:${tid}:series`,
        head: `${coach}'s first series win with the ${nick(league, tid)}`,
        text: `${games} over the ${nick(league, side.opp)} in the ${label}.`,
        gid: g.gid,
        mail: { from: 'Media Relations', body: `Your first series win with the ${nick(league, tid)}: ${games} over the ${nick(league, side.opp)}.` },
      },
      2,
    );
  }
  if ((round === 3 || round === 4) && !has(league, `round:${round}`)) {
    reach(
      league,
      {
        key: `round:${round}`,
        head:
          round === 4
            ? pick(league, 'round:4', [`${coach} is going to the Finals`, `The ${nick(league, tid)} win the ${s.conf === 'E' ? 'East' : 'West'}`])
            : `${coach} reaches the conference finals`,
        text: `${games} over the ${nick(league, side.opp)} in the ${label}: a first ${round === 4 ? 'Finals' : 'conference finals'} of his career.`,
        gid: g.gid,
        mail: { from: 'Media Relations', body: `Your first ${round === 4 ? 'Finals' : 'conference finals'}: ${games} over the ${nick(league, side.opp)}.` },
      },
      round === 4 ? 3 : 2,
    );
  }
}

const ordinalWord = (n: number) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] ?? `${n}th`;

// ---------------------------------------------------------------- signature wins

/**
 * How big a win was: an upset by the odds at tip-off (up to 50 for a 0% underdog), a playoff series
 * closed out (20 more each round), the title (80), a win that kept a season alive (15), and a little
 * for a one-possession game or overtime. Zero for an ordinary win.
 */
export function winValue(w: Pick<SignatureWin, 'kind' | 'p' | 'round' | 'score'>, ot = 0): number {
  const upset = w.p !== undefined ? Math.max(0, 50 - w.p) : 0;
  const base = w.kind === 'title' ? 80 : w.kind === 'series' ? 20 + 10 * (w.round ?? 1) : w.kind === 'elimination' ? 15 + 5 * (w.round ?? 1) : 0;
  const close = w.score[0] - w.score[1] <= 3 ? 4 : 0;
  return Math.round(base + upset * (w.kind === 'upset' ? 1 : 0.5) + close + (ot ? 2 : 0));
}

/** The record of the team he beat going in ("the 52-20 Celtics"), from its season now (the game counted). */
function oppRecord(league: League, opp: number, gameType: string): string {
  const ts = league.teams[opp].seasons.find((x) => x.season === league.season);
  if (!ts || gameType !== 'regular') return `the ${nick(league, opp)}`;
  return `the ${ts.won}-${ts.lost} ${nick(league, opp)}`;
}

function noteSignatureWin(league: League, g: ScheduledGame, res: GameResult, side: NonNullable<ReturnType<typeof mySide>>) {
  const p = tipoffChance(res, side.home);
  const pct = p === null ? undefined : Math.round(p * 100);
  const s = g.type === 'playoffs' ? seriesOf(league, g) : undefined;
  let w: Omit<SignatureWin, 'v'> | null = null;
  const base = {
    gid: g.gid,
    season: league.season,
    day: res.day,
    tid: side.tid,
    opp: side.opp,
    home: side.home,
    score: [side.us, side.them] as [number, number],
    ...(pct !== undefined ? { p: pct } : {}),
  };
  const at = where(league, side);
  if (s && s.winner === side.tid) {
    const games = `${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
    w =
      s.round === 4
        ? { ...base, kind: 'title', round: 4, line: `Won the title ${games} over the ${nick(league, side.opp)}, ${side.us}-${side.them} ${at}` }
        : { ...base, kind: 'series', round: s.round, line: `Closed out the ${nick(league, side.opp)} ${games} in the ${seriesLabel(s)}, ${side.us}-${side.them} ${at}` };
  } else if (s) {
    // a win that kept the season alive: they had three wins before it
    const theirs = s.high === side.tid ? s.lowWins : s.highWins;
    if (theirs === 3)
      w = { ...base, kind: 'elimination', round: s.round, line: `Down to the last game, beat the ${nick(league, side.opp)} ${side.us}-${side.them} ${at} to force another` };
  }
  if (!w && pct !== undefined && pct <= UPSET_P)
    w = { ...base, kind: 'upset', line: `Beat ${oppRecord(league, side.opp, g.type)} as a ${pct}% underdog, ${side.us}-${side.them} ${at}` };
  if (!w) return;
  keepWin(league, { ...w, v: winValue(w, res.ot) });
}

/** Keep a signature win: the career's best WINS_KEPT, and the best three of this season and the last (for the reviews). */
function keepWin(league: League, w: SignatureWin) {
  const s = ensureLegacy(league);
  const all = [...s.wins.filter((x) => x.gid !== w.gid || x.season !== w.season), w].sort((a, b) => b.v - a.v || b.season - a.season || b.day - a.day);
  const top = new Set(all.slice(0, WINS_KEPT));
  for (const season of [league.season, league.season - 1]) for (const x of all.filter((y) => y.season === season).slice(0, 3)) top.add(x);
  s.wins = all.filter((x) => top.has(x));
}

/** His signature wins, best first. */
export const signatureWins = (league: League) => legacyOf(league).wins;

/** The season's best win, if it had one worth keeping. */
export const bestWinOf = (league: League, season: number, tid?: number) => legacyOf(league).wins.find((w) => w.season === season && (tid === undefined || w.tid === tid));

// ---------------------------------------------------------------- the day

/**
 * At the end of every day: his Coach of the Month honors into the cabinet, a first playoff berth, a
 * Coach of the Year or an NBA Cup, and the owner's and fans' pulse (weekly, with the owner's monthly
 * check-in; see legacyPulse.ts). In free agency, nothing.
 */
export function legacyDay(league: League) {
  if (league.fired || league.phase === 'freeAgency' || league.phase === 'draft' || league.phase === 'resign' || league.phase === 'draftLottery') return;
  if (!league.legacy && !['regular', 'playin', 'playoffs'].includes(league.phase)) return;
  const s = ensureLegacy(league);
  const tid = league.userTid;
  // Coach of the Month: the press names one a conference each month (kept two seasons there, for good here)
  const honors = league.media?.honors;
  if (honors?.length) {
    for (const h of honors) {
      if (h.kind !== 'cotm' || h.tid !== tid || h.season !== league.season) continue;
      if (s.honors.some((x) => x.season === h.season && x.day === h.day)) continue;
      s.honors.push({ kind: 'cotm', season: h.season, day: h.day, tid: h.tid, ...(h.conf ? { conf: h.conf } : {}), line: h.line });
      const n = s.honors.length;
      reach(
        league,
        {
          key: `cotm:${h.season}:${h.day}`,
          head: n === 1 ? `${league.coachName}'s first Coach of the Month` : `Coach of the Month, ${plural(n, 'time')} now`,
          text: h.line,
          mail: {
            from: 'Media Relations',
            subject: 'Coach of the Month',
            body: `You're the ${h.conf === 'E' ? 'East' : h.conf === 'W' ? 'West' : "league's"} Coach of the Month${n > 1 ? ` (your ${ordinalWord(n)})` : ''}. ${h.line}`,
          },
        },
        2,
        // (the press writes the honor's story; this is the cabinet's and the inbox's)
        false,
      );
    }
  }
  // the playoffs start: a first berth for his career, or with this franchise
  const ts = league.teams[tid]?.seasons.find((x) => x.season === league.season);
  if (league.phase === 'playoffs' && ts && ts.playoffRound >= 1 && !has(league, `berth:${league.season}`)) {
    mark(league, `berth:${league.season}`);
    const seed = ts.seed ? `the ${ordinal(ts.seed)} seed` : 'a playoff spot';
    if (!has(league, 'playoffs:first')) {
      mark(league, `fr:${tid}:playoffs`);
      reach(
        league,
        {
          key: 'playoffs:first',
          head: pick(league, 'playoffs:first', [
            `${league.coachName} takes the ${nick(league, tid)} to the playoffs`,
            `A first playoff berth for ${league.coachName}`,
            `${league.coachName} is in the playoffs`,
          ]),
          text: `${ts.won}-${ts.lost} and ${seed} in the ${league.teams[tid].conf === 'E' ? 'East' : 'West'}: the first playoff trip of his career.`,
          mail: { from: 'Owner', subject: 'The playoffs', body: `${ts.won}-${ts.lost}, ${seed}. That's what I wanted to see. Now go win a round.` },
        },
        3,
      );
    } else if (!has(league, `fr:${tid}:playoffs`)) {
      reach(
        league,
        {
          key: `fr:${tid}:playoffs`,
          head: `${league.coachName}'s first playoff trip with the ${nick(league, tid)}`,
          text: `${ts.won}-${ts.lost} and ${seed}.`,
          mail: { from: 'Media Relations', body: `Your first playoff trip with the ${nick(league, tid)}: ${ts.won}-${ts.lost}, ${seed}.` },
        },
        2,
      );
    }
  }
  // Coach of the Year (voted when the regular season ends) and the NBA Cup
  const aw = league.awards.find((a) => a.season === league.season);
  if (aw?.coy === tid && !has(league, `coy:${league.season}`) && (aw.coyCoach === undefined || aw.coyCoach === league.coachName)) {
    const n = (userCoach(league) ? coachCareer(league, userCoach(league)!).coy.length : 0) || 1;
    reach(
      league,
      {
        key: `coy:${league.season}`,
        head:
          n === 1
            ? pick(league, `coy:${league.season}`, [`${league.coachName} is Coach of the Year`, `Coach of the Year: ${league.coachName}`])
            : `${league.coachName} is Coach of the Year again`,
        text: `${ts ? `${ts.won}-${ts.lost} with the ${nick(league, tid)}` : `With the ${nick(league, tid)}`}${n > 1 ? `: his ${ordinalWord(n)}` : ''}.`,
        mail: {
          from: 'Owner',
          subject: 'Coach of the Year',
          body: n === 1 ? "Coach of the Year. I'll frame it. Then I'll want another season like it." : `Coach of the Year again (${n}). The league has noticed what I have.`,
        },
      },
      3,
    );
  }
  if (aw?.cupWinner === tid && !has(league, `cup:${league.season}`)) {
    reach(
      league,
      {
        key: `cup:${league.season}`,
        head: `${league.coachName} lifts the NBA Cup`,
        text: `The ${teamName(league, tid)} won the ${seasonLabel(league.season)} NBA Cup${aw.cupRunnerUp !== undefined ? ` over the ${nick(league, aw.cupRunnerUp)}` : ''}.`,
        mail: {
          from: 'Media Relations',
          subject: 'NBA Cup',
          body: `The Cup is yours${aw.cupRunnerUp !== undefined ? `, won against the ${nick(league, aw.cupRunnerUp)}` : ''}. It goes in the cabinet.`,
        },
      },
      2,
      // (the Cup's own news says it)
      false,
    );
  }
  pulseDay(league);
}

// ---------------------------------------------------------------- the season's end

/** When the Finals end: the season's review (legacyReview.ts), and the owner's verdict mail pointed at it. */
export function legacySeasonEnd(league: League) {
  if (!userCoach(league) && !league.legacy) return;
  const s = ensureLegacy(league);
  const review = buildSeasonReview(league);
  if (!review) return;
  s.reviews = [...s.reviews.filter((r) => r.season !== review.season), review].slice(-LEGACY_REVIEWS_KEPT);
  // the owner's verdict (the season's mail) opens the review, which has it in full
  const mail = league.inbox.find((m) => m.season === league.season && m.from === 'Owner' && (m.subject === 'Season review' || m.subject === "You're fired"));
  if (mail && mail.subject === 'Season review') mail.link = reviewPath(review.season);
}

export const reviewPath = (season: number) => `/office/career?review=${season}`;

/** The review of a season, if one was kept. */
export const seasonReviewOf = (league: League, season: number) => legacyOf(league).reviews.find((r) => r.season === season);

// ---------------------------------------------------------------- the cabinet

/** One piece of the honors cabinet. */
export interface Trophy {
  kind: 'title' | 'conf' | 'coy' | 'cup' | 'cotm';
  season: number;
  tid: number;
  /** "2027-28 champions", "Coach of the Month, Dec 2027". */
  label: string;
}

/**
 * The honors cabinet: his titles, conference titles (Finals reached), Coaches of the Year and NBA Cups,
 * read from the league's history (kept for good), and the Coaches of the Month the legacy keeps.
 * Newest first.
 */
export function cabinet(league: League, k?: CoachCareer): Trophy[] {
  const me = userCoach(league);
  const career = k ?? (me ? coachCareer(league, me) : null);
  const out: Trophy[] = [];
  if (career) {
    for (const l of career.lines) {
      if (l.round === 5) out.push({ kind: 'title', season: l.season, tid: l.tid, label: `${seasonLabel(l.season)} champions` });
      else if (l.round === 4)
        out.push({ kind: 'conf', season: l.season, tid: l.tid, label: `${seasonLabel(l.season)} ${league.teams[l.tid].conf === 'E' ? 'East' : 'West'} champions` });
    }
    for (const season of career.coy) {
      const l = career.lines.find((x) => x.season === season);
      out.push({ kind: 'coy', season, tid: l?.tid ?? league.userTid, label: `Coach of the Year ${seasonLabel(season)}` });
    }
    for (const a of league.awards) {
      if (a.cupWinner === undefined) continue;
      const l = career.lines.find((x) => x.season === a.season && x.tid === a.cupWinner);
      if (l) out.push({ kind: 'cup', season: a.season, tid: l.tid, label: `NBA Cup ${seasonLabel(a.season)}` });
    }
  }
  for (const h of legacyOf(league).honors)
    out.push({ kind: 'cotm', season: h.season, tid: h.tid, label: `Coach of the Month · ${fmtDate(h.season, Math.max(0, h.day - 3), { month: 'short', year: 'numeric' })}` });
  const order: Record<Trophy['kind'], number> = { title: 0, cup: 1, conf: 2, coy: 3, cotm: 4 };
  return out.sort((a, b) => b.season - a.season || order[a.kind] - order[b.kind]);
}

// ---------------------------------------------------------------- among the league's coaches

/** Where the user ranks among the coaches in charge now: by career wins, and by win% (at least a season's games). */
export function coachRanks(league: League): { wins: number; pct: number | null; of: number; pctOf: number } | null {
  const reg = league.coaches;
  const me = userCoach(league);
  if (!reg || !me) return null;
  const coy = coyWinners(league);
  const rows = reg.filter((r) => openStint(r) || r.user).map((r) => ({ r, k: coachCareer(league, r, coy) }));
  const mine = rows.find((x) => x.r.user)!;
  const wins = 1 + rows.filter((x) => x !== mine && x.k.won > mine.k.won).length;
  const pctOf = (x: (typeof rows)[number]) => x.k.won / Math.max(1, x.k.won + x.k.lost);
  const qualified = rows.filter((x) => x.k.won + x.k.lost >= 82);
  const pct = mine.k.won + mine.k.lost >= 82 ? 1 + qualified.filter((x) => x !== mine && pctOf(x) > pctOf(mine)).length : null;
  return { wins, pct, of: rows.length, pctOf: qualified.length };
}

/** The seasons he coached a franchise, with his record in each (for its history's "your seasons"). */
export function userSeasonsWith(league: League, tid: number): Map<number, CoachSeason> {
  const me = userCoach(league);
  if (!me) return new Map();
  return new Map(me.stints.filter((s) => s.tid === tid).flatMap((s) => stintSeasons(league, s).map((l) => [l.season, l] as const)));
}
