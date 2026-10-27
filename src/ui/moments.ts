// Big moments: the events of the user's career that take the screen for a moment (a clinch, a
// series, a title, the Cup's knockouts, a big signing, an award, his All-Stars, a record or a career
// mark by one of his players, a number going up at his home opener, a legend's farewell, and the
// front-page stories about his team: a milestone, an honor, a career night, a streak, a breakout),
// and the job's own: the owner's ultimatum, his verdict on the season, the sack, a new job, for every
// team, winners or not. Each is read from the league as it stands and has a stable key, so the shell
// can show only the ones that happen while it's open: whatever is already true when a league opens
// counts as seen. Of those that come out together one shows (pickMoments); the rest of the ones
// worth it wait for the next sim (scheduleMoments), so each Continue lands on something.
import type { League, NewsItem, Player } from '../core/types';
import { RETIRED } from '../core/types';
import { confStandings } from '../core/league/standings';
import { seasonLabel } from '../core/constants';
import { money, plural } from '../core/format';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { storyLink } from './today/front';
import { isFrontPage } from '../state/simCore';
import { currentGoals, ownerPersonality, personalityLine, resultText } from '../core/league/ownerGoals';
import { GRACE } from '../core/league/jobSecurity';
import { coachCareer, openStint, userCoach } from '../core/league/coaches';
import { clincherLine, finalsStory, seriesArc, titleCount } from '../core/league/media/finals';
import { reviewPath, seasonReviewOf } from '../core/league/legacy';
import { endText, gradeWord } from '../core/league/legacyReview';
import { awardLine, awardPhrase } from '../core/league/media/history';
import { isCareerMarkStory } from '../core/league/media/marks';
import { BIG_NIGHT, REC_LABEL, REC_STATS, TEAM_REC_STATS, gameMark, recordWhat, teamMark } from '../core/league/records';

export type MomentKind =
  | 'clinch'
  | 'series'
  | 'title'
  | 'cup'
  | 'draft'
  | 'signing'
  | 'award'
  | 'allStar'
  | 'record'
  | 'milestone'
  | 'jersey'
  | 'farewell'
  | 'story'
  | 'verdict'
  | 'ultimatum'
  | 'fired'
  | 'hired';

/**
 * The job's moments: each shows whatever else came out with it (they're never the one left in the
 * digest), and whatever the digest leads with.
 */
export const JOB_MOMENTS: ReadonlySet<MomentKind> = new Set<MomentKind>(['verdict', 'ultimatum', 'fired', 'hired']);
/** ...and the two no one sims past unseen: they show even with Settings → Big moments off. */
export const MUST_SEE: ReadonlySet<MomentKind> = new Set<MomentKind>(['ultimatum', 'fired']);

export interface Moment {
  key: string;
  kind: MomentKind;
  /** The line over the headline: when and where ("2026-27 · NBA Finals"). */
  over: string;
  /** The headline, in display capitals ("Champions"). */
  title: string;
  /** One line under it. */
  sub: string;
  /** The player it's about, for his jersey; otherwise the team's mark is shown. */
  pid?: number;
  /** The number on that jersey when it isn't his latest: the one going up on a banner night, in the team's colours. */
  jersey?: string;
  /** Titles get confetti. */
  big?: boolean;
  /** Where "Read" goes (a story's page). */
  link?: string;
  /** A story's size among others at the same time: the bigger shows (see pickMoments). */
  rank?: number;
  /** The kind of news a story is. */
  news?: NewsItem['kind'];
  /** A few short lines under the sub (the owner's goal by goal, the record, what's next). */
  lines?: string[];
  /** The link's button ("Full review"; a story's is "Read the story"). */
  linkLabel?: string;
  /** When it happened (the season's day), so one that waits for the next sim goes stale (see scheduleMoments). */
  season?: number;
  day?: number;
  /** The news item it tells, when it tells one: the digest that leads with it has told it already. */
  story?: number;
  /** Mail it says in full (the award's letter, the record's note): read once it has shown. */
  mail?: number[];
}

const ROUND = ['', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const NEXT = ['', 'the conference semifinals', 'the conference finals', 'the NBA Finals'];

/** A free agent this good (OVR) or this expensive (share of the cap, in $K) makes his signing a moment. */
export const BIG_SIGNING_OVR = 80;

const AWARD_NAME: Record<string, string> = {
  mvp: 'Most Valuable Player',
  finalsMvp: 'Finals MVP',
  dpoy: 'Defensive Player of the Year',
  roy: 'Rookie of the Year',
  smoy: 'Sixth Man of the Year',
  mip: 'Most Improved Player',
};
const AWARD_SHORT: Record<string, string> = { mvp: 'MVP', finalsMvp: 'Finals MVP', dpoy: 'DPOY', roy: 'Rookie of the Year', smoy: 'Sixth Man', mip: 'Most Improved' };

const name = (p: Player | undefined, fallback = '') => (p ? `${p.firstName} ${p.lastName}` : fallback);

/** What a front-page story is, over its headline, and how it ranks against another at the same time. */
const STORY_KIND: Partial<Record<NewsItem['kind'], [string, number]>> = {
  milestone: ['Milestone', 6],
  record: ['Record', 6],
  award: ['Award', 5],
  honor: ['Honor', 5],
  game: ['Final', 4],
  draft: ['Draft', 3],
  trade: ['Trade', 2],
  signing: ['Signing', 2],
};

/** Mail from this sender with this subject this season (the letter a moment says in full). */
function mailOf(league: League, from: string, subject: (s: string) => boolean, day?: number): number[] {
  return league.inbox.filter((m) => m.season === league.season && m.from === from && subject(m.subject) && (day === undefined || Math.abs(m.day - day) <= 1)).map((m) => m.id);
}

/**
 * The front-page stories about the user's team this season (events, not the press's opinions),
 * newest first, but for those another moment tells (`told`: a career mark, a record's night, a
 * farewell, a number going up).
 */
function storyMoments(league: League, told: ReadonlySet<number>): Moment[] {
  const out: Moment[] = [];
  const me = league.userTid;
  for (let i = league.news.length - 1; i >= 0; i--) {
    const x = league.news[i];
    if (x.season !== league.season) break;
    if (told.has(x.id) || !isFrontPage(league, x)) continue;
    const [label, rank] = STORY_KIND[x.kind] ?? ['Front page', 1];
    // his own player's jersey, when the story is about one
    const pid = x.pids.find((p) => league.players[p]?.tid === me);
    out.push({
      key: `news-${x.id}`,
      kind: 'story',
      over: `${fmtDate(x.season, x.day)} · ${label}`,
      title: x.head ?? x.text,
      sub: x.head ? subOf(x.head, x.text) : '',
      pid,
      link: storyLink(x.id),
      rank: rank * 1e6 + x.id,
      news: x.kind,
      season: x.season,
      day: x.day,
      story: x.id,
      // (a milestone's note from the staff says the same)
      mail:
        x.kind === 'milestone' && x.head ? mailOf(league, 'Media Relations', (s) => s === x.head, x.day).concat(mailOf(league, 'Owner', (s) => s === x.head, x.day)) : undefined,
    });
  }
  return out;
}

/**
 * The line under a story's headline on its moment: its dek, unless the dek only says the score the
 * headline already gives ("133-128 over the Timberwolves" twice); then what comes after it.
 */
function subOf(head: string, dek: string): string {
  const score = /^(\d+-\d+)[^.]*\.\s*/.exec(dek);
  if (score && head.includes(score[1])) return dek.slice(score[0].length);
  return dek;
}

/** Career moments by size, the biggest first: one that comes out with a bigger one waits for the next sim. */
const CAREER_ORDER: MomentKind[] = ['title', 'cup', 'series', 'clinch', 'award', 'record', 'allStar', 'farewell', 'jersey', 'milestone', 'signing', 'draft'];
/** The job's moments in the order they show, after the biggest of the rest: the verdict, then what it led to. */
const JOB_ORDER: MomentKind[] = ['verdict', 'ultimatum', 'fired', 'hired'];

/**
 * The moments to show from those new at once: the biggest career moment, or else the biggest
 * front-page story, so whatever ends a sim takes the screen once, not as a stack of cards (the rest
 * wait: see scheduleMoments); and after it every one of the job's (a sack says the season's verdict
 * itself).
 */
export function pickMoments(fresh: Moment[]): Moment[] {
  const job = fresh.filter((m) => JOB_MOMENTS.has(m.kind)).sort((a, b) => JOB_ORDER.indexOf(a.kind) - JOB_ORDER.indexOf(b.kind));
  const jobs = job.filter((m) => !(m.kind === 'verdict' && job.some((x) => x.kind === 'fired')));
  // (beside the job's own, only a moment of the season's own size: a farewell or a record waits for the next sim)
  const career = fresh
    .filter((m) => m.kind !== 'story' && !JOB_MOMENTS.has(m.kind) && !(jobs.length && MINOR.has(m.kind)))
    .sort((a, b) => CAREER_ORDER.indexOf(a.kind) - CAREER_ORDER.indexOf(b.kind) || (b.rank ?? 0) - (a.rank ?? 0));
  if (career.length) return [career[0], ...jobs];
  if (jobs.length) return jobs;
  const stories = fresh.filter((m) => m.kind === 'story').sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  return stories.slice(0, 1);
}

/** Moments of a night or a player rather than of the season: they don't take the screen beside the job's own, and wait. */
const MINOR: ReadonlySet<MomentKind> = new Set<MomentKind>(['allStar', 'record', 'milestone', 'jersey', 'farewell']);
/**
 * The moments that wait for the next sim when a bigger one has the screen. A clinch or a series is
 * told by the next one; a story is the news of its night, and a week on it isn't.
 */
const WAITS: ReadonlySet<MomentKind> = new Set<MomentKind>(['award', 'allStar', 'record', 'milestone', 'jersey', 'farewell', 'cup']);
/** Days a moment can wait and still be news (the summer's are counted on its calendar too: the Finals to the draft is about two weeks). */
export const WAIT_DAYS = 21;
/** Moments that wait for the next sim however long it ran (within their season): a number going up, a farewell. */
const KEEPS: ReadonlySet<MomentKind> = new Set<MomentKind>(['jersey', 'farewell']);
/** The most that wait at once: the biggest. */
const WAIT_MAX = 3;

/**
 * What a sim's end shows and what waits: of the moments queued, those just in and those waiting from
 * before, the biggest shows (pickMoments) and the rest of the ones that keep (WAITS) wait for the
 * next sim, the biggest few and none older than WAIT_DAYS: so a title's night shows the title, and the
 * Finals MVP or a legend's farewell takes the screen at the next step instead of never.
 */
export function scheduleMoments(queued: Moment[], fresh: Moment[], waiting: Moment[], now: { season: number; day: number }): { show: Moment[]; wait: Moment[] } {
  // (a banner night and a legend's farewell wait out a long sim: they're once in a career, not a week's news)
  const live = (m: Moment) => m.season === undefined || (m.season === now.season && (KEEPS.has(m.kind) || now.day - (m.day ?? now.day) <= WAIT_DAYS));
  const pool = [...queued, ...fresh, ...waiting.filter(live)].filter((m, i, all) => all.findIndex((x) => x.key === m.key) === i);
  const show = pickMoments(pool);
  const wait = pool
    .filter((m) => !show.includes(m) && WAITS.has(m.kind) && live(m))
    .sort((a, b) => CAREER_ORDER.indexOf(a.kind) - CAREER_ORDER.indexOf(b.kind) || (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, WAIT_MAX);
  return { show, wait };
}

// ---------------------------------------------------------------- the season's occasions

/** The user's All-Stars this season, once they're named (the selections, the contests and the game are one day): one moment for all of them. */
function allStarMoment(league: League): Moment | null {
  const me = league.userTid;
  const aw = league.awards.find((a) => a.season === league.season);
  const mine = aw ? [...aw.allStars.E, ...aw.allStars.W].filter((pid) => league.players[pid]?.tid === me) : [];
  if (!aw || !mine.length) return null;
  const ps = mine.map((pid) => league.players[pid]);
  const first = ps[0];
  const again = awardLine(league, first, 'All-Star', league.season);
  const lines: string[] = [];
  const g = aw.allStarGame;
  if (g) {
    const mvp = aw.allStarMvp !== undefined ? league.players[aw.allStarMvp] : undefined;
    const ours = mvp && mvp.tid === me;
    lines.push(
      `The game: ${g.east > g.west ? 'East' : 'West'} ${Math.max(g.east, g.west)}-${Math.min(g.east, g.west)}${mvp ? ` · MVP ${name(mvp)}${ours && g.mvp ? `, ${g.mvp.pts} points` : ''}` : ''}`,
    );
  }
  const sat = aw.saturday;
  for (const [label, field] of [
    ['Three-Point Contest', sat?.three],
    ['Slam Dunk Contest', sat?.dunk],
  ] as const) {
    const w = field?.[0];
    const p = w ? league.players[w.pid] : undefined;
    if (p && p.tid === me) lines.push(`${label}: ${name(p)} wins it`);
  }
  const day = league.allStarDay;
  return {
    key: `allstar-${league.season}`,
    kind: 'allStar',
    over: `${seasonLabel(league.season)} · All-Star weekend`,
    title: ps.length > 1 ? `${ps.length} All-Stars` : 'All-Star',
    sub:
      ps.length > 1
        ? `${andName(ps)} make the All-Star team.`
        : `${name(first)} makes the All-Star team${again && again !== 'his first' ? `, ${awardPhrase(again, 'selection')}` : again === 'his first' ? ' for the first time' : ''}.`,
    pid: first.pid,
    lines,
    link: '/league/awards',
    linkLabel: 'All-Star weekend',
    season: league.season,
    day,
    mail: mailOf(league, 'League Office', (x) => x === 'All-Star selections' || x === 'All-Star Saturday'),
  };
}

const andName = (ps: Player[]) =>
  ps.length > 1
    ? `${ps
        .slice(0, -1)
        .map((p) => name(p))
        .join(', ')} and ${name(ps[ps.length - 1])}`
    : name(ps[0]);

/** A franchise scoring record is a moment from this many points (a team's own record falls often in a league's first seasons). */
const FRANCHISE_POINTS = 45;

/**
 * The records the user's team set this season that still stand: a league record (a player's or the
 * team's, regular season), and a franchise scoring record of FRANCHISE_POINTS or more by one of his
 * players, once the book has a season behind it. Read from the record book (kept for good), each for
 * the night it was set.
 */
function recordMoments(league: League): Moment[] {
  const book = league.records;
  const me = league.userTid;
  const season = league.season;
  if (!book) return [];
  // (in the book's first season every big night is "a record": only a night of BIG_NIGHT points is one)
  const young = season <= book.since;
  const out: Moment[] = [];
  const since = seasonLabel(book.since);
  const seen = new Set<number>();
  const push = (scope: 'league' | 'team', what: string, gid: number, day: number, pid: number | undefined, rank: number, line: string) => {
    if (seen.has(gid)) return;
    seen.add(gid);
    out.push({
      key: `record-${scope}-${gid}-${pid ?? 'team'}`,
      kind: 'record',
      over: `${fmtDate(season, day)} · ${scope === 'league' ? 'League record' : 'Franchise record'}`,
      title: what,
      sub: line,
      pid,
      link: `/game/${gid}`,
      linkLabel: 'Game report',
      rank,
      season,
      day,
      mail: mailOf(league, 'Media Relations', (x) => x.startsWith(scope === 'league' ? 'League record' : 'Franchise record'), day),
    });
  };
  for (const stat of REC_STATS) {
    const r = book.league.reg.players[stat]?.[0];
    if (!r || r[4] !== season || r[2] !== me || (young && (stat !== 'pts' || r[0] < BIG_NIGHT))) continue;
    const m = gameMark(league, r);
    push(
      'league',
      `${m.v} ${REC_LABEL[stat][1]}`,
      m.gid,
      m.day,
      m.pid,
      9,
      `${m.name} against the ${league.teams[m.opp]?.name}: the most in a game ${young ? 'in this league' : `since ${since}`}.`,
    );
  }
  for (const stat of TEAM_REC_STATS) {
    const r = book.league.reg.teams[stat]?.[0];
    if (!r || r[3] !== season || r[1] !== me || young) continue;
    const m = teamMark(r);
    const what = recordWhat({ stat, team: true, v: m.v });
    push(
      'league',
      what.replace(/^./, (c) => c.toUpperCase()),
      m.gid,
      m.day,
      undefined,
      8,
      `${m.score[0]}-${m.score[1]} over the ${league.teams[m.opp]?.name}: a league record since ${since}.`,
    );
  }
  const mine = book.teams[me]?.reg;
  const pts = mine?.players.pts?.[0];
  if (pts && pts[4] === season && pts[0] >= FRANCHISE_POINTS && !young) {
    const m = gameMark(league, pts);
    push('team', `${m.v} points`, m.gid, m.day, m.pid, 6, `${m.name} against the ${league.teams[m.opp]?.name}: the most for the ${league.teams[me].name} since ${since}.`);
  }
  return out;
}

/** A news item another kind of moment tells, never a story moment: a career mark, a farewell, a number going up. */
const toldElsewhere = (n: NewsItem) => isCareerMarkStory(n) || (n.kind === 'retire' && !!n.head);

/** "25,000 points" out of a career mark's headline ("Stephen Curry reaches 25,000 points"). */
const MARK_FIG = /([\d,]+ (?:points|rebounds|assists))/;

/** His players' career marks this season, as the press told them (media/marks.ts): the story's id is the moment's. */
function markMoments(league: League): Moment[] {
  const me = league.userTid;
  const out: Moment[] = [];
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.season !== league.season) break;
    if (!isCareerMarkStory(n)) continue;
    const p = league.players[n.pids[0]];
    const fig = MARK_FIG.exec(n.head ?? '')?.[1];
    if (!p || p.tid !== me || !fig) continue;
    out.push({
      key: `mark-${n.id}`,
      kind: 'milestone',
      over: `${fmtDate(n.season, n.day)} · Career milestone`,
      title: fig,
      sub: `${name(p)}. ${n.body ?? ''}`.trim(),
      pid: p.pid,
      link: storyLink(n.id),
      rank: n.weight ?? 2,
      season: n.season,
      day: n.day,
      story: n.id,
    });
  }
  return out;
}

/**
 * The summer's farewells (media/legends.ts) the press puts on its front page: his own notable
 * players' and franchise legends', and the summer's biggest legend's whoever he played for.
 */
function farewellMoments(league: League): Moment[] {
  const me = league.userTid;
  const out: Moment[] = [];
  for (let i = league.news.length - 1; i >= 0; i--) {
    const n = league.news[i];
    if (n.season !== league.season) break;
    if (n.kind !== 'retire' || !n.head || n.text.startsWith('Before the home opener')) continue;
    const p = league.players[n.pids[0]];
    if (!p || p.tid !== RETIRED || n.weight !== 3) continue;
    out.push({
      key: `farewell-${p.pid}`,
      kind: 'farewell',
      over: `${seasonLabel(league.season)} · ${p.hof ? 'Into the Hall of Fame' : 'Retires'}`,
      title: name(p),
      sub: n.text,
      pid: p.pid,
      link: storyLink(n.id),
      rank: (n.tids.includes(me) ? 10 : 0) + (n.weight ?? 2),
      season: n.season,
      day: n.day,
      story: n.id,
    });
  }
  return out;
}

/** A number his franchise retired last summer, once it has gone up at this season's home opener. */
function jerseyMoments(league: League): Moment[] {
  const me = league.userTid;
  const team = league.teams[me];
  const up = (team.retired ?? []).filter((r) => r.season === league.season - 1);
  if (!up.length) return [];
  const opener = league.games.find((g) => g.season === league.season && g.type === 'regular' && g.home.tid === me);
  if (!opener) return [];
  const story = league.news.find((n) => n.season === league.season && n.kind === 'retire' && !!n.head && n.tids[0] === me);
  return up.map((r) => {
    const p = league.players[r.pid];
    return {
      key: `jersey-${me}-${r.jersey}-${league.season}`,
      kind: 'jersey' as const,
      over: `${fmtDate(league.season, opener.day)} · Banner night`,
      title: `No. ${r.jersey}`,
      sub: `${p ? name(p) : r.name}'s number goes up to the rafters before the home opener. Nobody wears it for the ${team.name} again.`,
      pid: r.pid,
      jersey: r.jersey,
      ...(story ? { link: storyLink(story.id), story: story.id } : {}),
      season: league.season,
      day: opener.day,
      mail: league.inbox.filter((m) => m.from === 'Owner' && m.subject === `No. ${r.jersey} to the rafters`).map((m) => m.id),
    };
  });
}

/** The NBA Cup's knockouts, from his side: through to them, or out of them (winning it is its own moment). */
function cupMoments(league: League): Moment[] {
  const cup = league.cup;
  const me = league.userTid;
  if (!cup || cup.season !== league.season || !cup.seeds) return [];
  const out: Moment[] = [];
  const conf = league.teams[me].conf;
  const seed = cup.seeds[conf].indexOf(me);
  if (seed >= 0) {
    const qf = cup.bracket.find((t) => t.round === 'qf' && (t.high === me || t.low === me));
    const opp = qf ? league.teams[qf.high === me ? qf.low : qf.high] : undefined;
    out.push({
      key: `cup-ko-${league.season}`,
      kind: 'cup',
      over: `${seasonLabel(league.season)} · NBA Cup`,
      title: 'Into the knockouts',
      sub: `The ${ordinalSeed(seed)} seed in the ${conf === 'E' ? 'East' : 'West'}${seed === 3 ? ', the wild card' : ''}.${qf && opp ? ` The quarterfinal is ${qf.high === me ? 'at home to' : 'at'} the ${opp.name} on ${fmtDate(league.season, qf.day)}: win twice more and it's Las Vegas.` : ''}`,
      link: '/league/cup',
      linkLabel: 'The bracket',
      rank: 1,
      season: league.season,
      day: league.day,
      mail: mailOf(league, 'League Office', (x) => x === 'NBA Cup: into the knockouts'),
    });
  }
  const lost = cup.bracket.find((t) => t.winner !== undefined && t.winner !== me && (t.high === me || t.low === me));
  if (lost) {
    const round = lost.round === 'final' ? 'final' : lost.round === 'sf' ? 'semifinal' : 'quarterfinal';
    const [us, them] = lost.high === me ? [lost.highPts, lost.lowPts] : [lost.lowPts, lost.highPts];
    out.push({
      key: `cup-out-${league.season}`,
      kind: 'cup',
      over: `${fmtDate(league.season, lost.day)} · NBA Cup ${round}`,
      title: lost.round === 'final' ? 'Cup runners-up' : 'Out of the Cup',
      sub: `${them}-${us} to the ${league.teams[lost.winner!].name} in the ${round}.${lost.round === 'final' ? " The final doesn't count against the record." : ''}`,
      link: '/league/cup',
      linkLabel: 'The bracket',
      rank: 0,
      season: league.season,
      day: lost.day,
      mail: mailOf(league, 'League Office', (x) => x.startsWith('NBA Cup: out')).concat(mailOf(league, 'Owner', (x) => x === 'NBA Cup final')),
    });
  }
  return out;
}

const ordinalSeed = (i: number) => ['1st', '2nd', '3rd', '4th'][i] ?? `${i + 1}th`;

const grade100 = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}`;

/**
 * The job's moments as the league stands: the owner's ultimatum this season, his verdict on the last
 * season reviewed (or the sack), and the job the user holds when it isn't his first.
 */
function jobMoments(league: League): Moment[] {
  const out: Moment[] = [];
  const me = league.userTid;
  const team = league.teams[me];
  const season = league.season;
  const og = currentGoals(league);
  if (og?.ultimatum) {
    const u = og.ultimatum;
    out.push({
      key: `ultimatum-${season}-${me}`,
      kind: 'ultimatum',
      over: `${seasonLabel(season)} · The owner's ultimatum`,
      title: u.text,
      sub: "Miss it and you're fired, whatever else goes right.",
      lines: [
        u.kind === 'wins' ? `${(curTeamSeason(league, me).won ?? 0) - (og.from?.won ?? 0)} of ${u.target} so far.` : '',
        `“This season is heading the wrong way. ${u.text}, or I make a change this summer.”`,
      ].filter(Boolean),
      link: '/office/owner',
      linkLabel: 'See where it stands',
    });
  }
  // the season's review: his verdict, or the sack (the latest one with this team: it stands until the next)
  const r = (league.ownerReviews ?? []).find((x) => x.season === season && x.tid === me);
  if (r) {
    const ts = team.seasons.find((x) => x.season === season);
    const rec = ts ? `${ts.won}-${ts.lost}` : '';
    const kept = seasonReviewOf(league, season);
    const goals = r.goals.map((g) => `${g.title}: ${resultText(g, g.result)} (${grade100(g.grade)})`);
    if (r.fired && league.fired)
      out.push({
        key: `fired-${season}-${me}`,
        kind: 'fired',
        over: `${seasonLabel(season)} · ${team.region} ${team.name}`,
        title: "You're fired",
        sub: r.said ? `“${r.said}”` : 'The owner is going in a different direction.',
        lines: [
          [rec, ts ? endText({ round: ts.playoffRound }) : '', `season grade\u00a0${grade100(r.grade)}`].filter(Boolean).join(' · '),
          'Your agent brings you the offers. The league waits until you take one.',
        ],
        link: '/office/career?tab=jobs',
        linkLabel: 'Find a new job',
      });
    else if (!r.fired)
      out.push({
        key: `verdict-${season}-${me}`,
        kind: 'verdict',
        over: `${seasonLabel(season)} · The owner's verdict`,
        title: gradeWord(r.grade),
        sub: `${r.said ? `“${r.said}” ` : ''}Season grade ${grade100(r.grade)}, standing ${grade100(r.total)}${rec ? ` after ${rec}` : ''}.`,
        lines: goals.slice(0, 4),
        link: kept ? reviewPath(season) : '/office/owner',
        linkLabel: 'Full review',
        mail: mailOf(league, 'Owner', (x) => x === 'Season review'),
      });
  }
  // a new job (not his first): the new team's colours, its owner and what he wants
  const coach = userCoach(league);
  const stint = coach && !league.fired && coach.stints.length > 1 ? openStint(coach) : undefined;
  if (stint && stint.tid === me) {
    // (in the words the Owner page uses, so a win-now owner taking a rebuild says so)
    const who = personalityLine(ownerPersonality(league, me), og ?? undefined).replace(' · ', ' owner: ');
    const grace = GRACE[league.settings.difficulty];
    out.push({
      key: `hired-${me}-${stint.from}`,
      kind: 'hired',
      over: `${seasonLabel(stint.from)} · New job`,
      title: `${team.region} ${team.name}`,
      sub: `${who}.`,
      lines: [
        og ? `He wants: ${og.goals.map((g) => g.title.toLowerCase()).join('; ')}.` : 'He sets his goals on opening night, from the roster you open with.',
        grace === 1 ? "He can't fire you in your first season." : `He can't fire you in your first ${grace} seasons.`,
      ],
      link: '/office/owner',
      linkLabel: 'Meet the owner',
    });
  }
  return out;
}

/**
 * The Finals as a moment, won or lost, told as it went (media/finals.ts): the headline for what it
 * was (a three-peat, Game 7, a comeback from 3-1, a sweep), the night that ended it as the line under
 * it, then what the title means against the franchise's history, the Finals MVP with his line, and
 * the coach's count of titles. Null while the Finals go on.
 */
function finalsMoment(league: League): Moment | null {
  const me = league.userTid;
  const team = league.teams[me];
  const f = finalsStory(league, me);
  if (!f) return null;
  const season = league.season;
  const us = team.name;
  const them = league.teams[f.opp]?.name ?? 'other side';
  const g7 = f.w + f.l === 7;
  const night = clincherLine(f, us, them);
  const arc = seriesArc(f, us, them);
  const over = `${seasonLabel(season)} · NBA Finals${f.last ? ` · Game ${f.last.n}` : ''}`;
  if (!f.won) {
    return {
      key: `finals-lost-${season}`,
      kind: 'series',
      over,
      title: g7 ? 'Lost in Game 7' : 'Runners-up',
      sub: `The ${them} win the title, ${f.l}-${f.w}${f.w === 0 ? ', a sweep' : ''}.${night ? ` ${night}` : ''}`,
      ...(arc && f.w > 0 ? { lines: [arc] } : {}),
      link: '/league/playoffs',
      linkLabel: 'The bracket',
      season,
      day: league.day,
    };
  }
  const peat = /^a (three|four|five|six|seven|eight)-peat$/.exec(f.history ?? '');
  // the headline: what the title was, in the words a fan would use
  const title = peat
    ? `${peat[1][0].toUpperCase()}${peat[1].slice(1)}-peat`
    : f.history === 'back-to-back titles'
      ? 'Back to back'
      : f.down
        ? `From ${f.down.at[1]}-${f.down.at[0]} down`
        : g7
          ? 'Game 7. Champions.'
          : f.l === 0
            ? 'A sweep. Champions.'
            : 'Champions';
  // (the series' arc, when the headline doesn't say it already)
  const first = arc && (peat || f.history === 'back-to-back titles') ? arc : null;
  const sub = [night ?? `The ${team.region} ${us} win the title, ${f.w}-${f.l} over the ${them}.`, night ? `A ${f.w}-${f.l} series over the ${them}.` : '']
    .filter(Boolean)
    .join(' ');
  const coach = userCoach(league);
  const titles = coach ? coachCareer(league, coach).titles : 0;
  const mvp = f.mvp ? league.players[f.mvp.pid] : undefined;
  const lines = [
    first ?? '',
    f.history && !peat && f.history !== 'back-to-back titles' ? f.history.charAt(0).toUpperCase() + f.history.slice(1) + '.' : '',
    f.upset ? `${f.upset.champWins} wins in the regular season, against the ${f.upset.runnerWins}-win ${them}.` : '',
    mvp && f.mvp ? `Finals MVP ${name(mvp)} · ${f.mvp.line}` : '',
    titles >= 1 ? `${league.coachName}'s ${titles === 1 ? 'first title' : titleCount(titles)}.` : '',
  ].filter(Boolean);
  return {
    key: `title-${season}`,
    kind: 'title',
    over,
    title,
    sub,
    // (the team's mark: the Finals MVP's number beside "A second title" reads as a count)
    big: true,
    lines: lines.slice(0, 4),
    ...(f.last ? { link: `/game/${f.last.gid}`, linkLabel: `Game ${f.last.n} report` } : {}),
    mail: mailOf(league, 'Owner', (x) => x === 'Champions'),
  };
}

/** Every moment the league holds for the user's team right now, oldest kinds first. */
export function currentMoments(league: League): Moment[] {
  const out: Moment[] = [];
  const me = league.userTid;
  const team = league.teams[me];
  if (!team) return out;
  const nick = team.name;
  const season = league.season;

  // a postseason spot (read into the postseason too: a long sim can clinch it in its last week and
  // end in the play-in, before the screen has looked)
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') {
    const row = confStandings(league, team.conf).find((r) => r.tid === me);
    const conf = team.conf === 'E' ? 'Eastern Conference' : 'Western Conference';
    // a play-in spot is only news until a playoff spot is
    if (row?.clinched === 'x')
      out.push({ key: `clinch-x-${season}`, kind: 'clinch', over: `${seasonLabel(season)} · ${conf}`, title: 'Playoff bound', sub: `The ${nick} have clinched a top-six seed.` });
    else if (row?.clinched === 'p') {
      // clinching the top ten mid-season is "at least the play-in", not a play-in seed: a team
      // sitting first can clinch it in February
      const playIn = league.phase !== 'regular';
      out.push({
        key: `clinch-p-${season}`,
        kind: 'clinch',
        over: `${seasonLabel(season)} · ${conf}`,
        title: playIn ? 'In the play-in' : 'Postseason bound',
        sub: playIn ? `The ${nick} play on in the play-in.` : `The ${nick} have clinched at least a play-in spot.`,
      });
    }
  }

  for (const s of league.playoffs) {
    // a Finals lost: its own moment, told as the series went (see finalsMoment)
    if (s.round === 4 && s.winner !== undefined && s.winner !== me && (s.high === me || s.low === me)) {
      const m = finalsMoment(league);
      if (m) out.push(m);
    }
    if (s.winner !== me) continue;
    const opp = league.teams[s.high === me ? s.low : s.high];
    const [w, l] = s.high === me ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
    if (s.round === 4)
      out.push(
        finalsMoment(league) ?? {
          key: `title-${season}`,
          kind: 'title',
          over: `${seasonLabel(season)} · NBA Finals`,
          title: 'Champions',
          sub: `The ${team.region} ${nick} win the title, ${w}-${l} over the ${opp?.name ?? 'field'}.`,
          big: true,
          mail: mailOf(league, 'Owner', (x) => x === 'Champions'),
        },
      );
    else
      out.push({
        key: `series-${season}-${s.id}`,
        kind: 'series',
        over: `${seasonLabel(season)} · ${ROUND[s.round] ?? 'Playoffs'}`,
        title: 'Series won',
        sub: `${w}-${l} over the ${opp?.name ?? 'other side'}. Next up: ${NEXT[s.round] ?? 'the next round'}.`,
      });
  }

  const aw = league.awards.find((a) => a.season === season);
  if (aw?.cupWinner === me)
    out.push({ key: `cup-${season}`, kind: 'cup', over: `${seasonLabel(season)} · NBA Cup`, title: 'Cup champions', sub: `The ${nick} lift the NBA Cup.`, big: true });
  if (aw) {
    for (const k of Object.keys(AWARD_NAME) as (keyof typeof AWARD_NAME)[]) {
      const pid = aw[k as 'mvp'];
      const p = pid !== undefined ? league.players[pid] : undefined;
      if (!p || p.tid !== me) continue;
      out.push({
        key: `award-${season}-${k}`,
        kind: 'award',
        over: `${seasonLabel(season)} · ${AWARD_NAME[k]}`,
        title: AWARD_SHORT[k],
        sub: `${name(p)} takes the award.`,
        pid,
        season,
        day: league.day,
        mail: mailOf(league, 'League Office', (x) => x === 'Season awards'),
      });
    }
    if (aw.coy === me)
      out.push({
        key: `award-${season}-coy`,
        kind: 'award',
        over: `${seasonLabel(season)} · Coach of the Year`,
        title: 'Coach of the Year',
        sub: `${league.coachName} is the league's best coach.`,
        season,
        day: league.day,
      });
  }

  // this season's moves: the stars the user signs (the log keeps his moves for good). His draft picks
  // have their moment on the draft screen, the announcer's card
  for (const t of league.transactions ?? []) {
    if (t.season !== season || t.tids[0] !== me || t.pid === undefined) continue;
    const p = league.players[t.pid];
    if (t.kind === 'sign' && p && p.ovr >= BIG_SIGNING_OVR) {
      const perYear = t.amount ? `${money(t.amount)} a year` : '';
      out.push({
        key: `txn-${t.id}`,
        kind: 'signing',
        over: `${seasonLabel(season)} · Free agency`,
        title: 'Signed',
        sub: [name(p, t.name), t.years ? plural(t.years, 'year') : '', perYear].filter(Boolean).join(' · '),
        pid: t.pid,
      });
    }
  }
  // the season's occasions and the nights his players are remembered for: each tells its news item,
  // which isn't a story moment as well
  const occasions = [allStarMoment(league), ...cupMoments(league), ...recordMoments(league), ...markMoments(league), ...jerseyMoments(league), ...farewellMoments(league)].filter(
    (m): m is Moment => !!m,
  );
  // (whether or not it's a moment now: a career mark by a player who has left since is no front-page story either)
  const told = new Set(occasions.flatMap((m) => (m.story !== undefined ? [m.story] : [])));
  for (const n of league.news) if (n.season === season && toldElsewhere(n)) told.add(n.id);
  // (a record's night: its game's story is the record's)
  const recordDays = new Set(occasions.filter((m) => m.kind === 'record').map((m) => m.day));
  for (const n of league.news) if (n.season === season && n.kind === 'game' && recordDays.has(n.day) && n.tids[0] === me) told.add(n.id);
  return out.concat(occasions, jobMoments(league), storyMoments(league, told));
}

/** The moments in `now` that weren't in `seen`, oldest first. */
export function newMoments(now: Moment[], seen: ReadonlySet<string>): Moment[] {
  return now.filter((m) => !seen.has(m.key));
}
