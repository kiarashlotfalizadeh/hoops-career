// Big moments: the events of the user's career that take the screen for a moment (a clinch, a
// series, a title, the Cup, his draft picks, a big signing, an award, and the front-page stories
// about his team: a milestone, an honor, a career night, a streak, a breakout), and the job's own:
// the owner's ultimatum, his verdict on the season, the sack, a new job, for every team, winners or
// not. Each is read from the league as it stands and has a stable key, so the shell can show only
// the ones that happen while it's open: whatever is already true when a league opens counts as seen.
import type { League, NewsItem, Player } from '../core/types';
import { confStandings } from '../core/league/standings';
import { seasonLabel } from '../core/constants';
import { money, plural } from '../core/format';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { storyLink } from './today/front';
import { isFrontPage } from '../state/simCore';
import { PERSONALITY, currentGoals, ownerPersonality, resultText } from '../core/league/ownerGoals';
import { GRACE } from '../core/league/jobSecurity';
import { openStint, userCoach } from '../core/league/coaches';
import { reviewPath, seasonReviewOf } from '../core/league/legacy';
import { endText, gradeWord } from '../core/league/legacyReview';

export type MomentKind = 'clinch' | 'series' | 'title' | 'cup' | 'draft' | 'signing' | 'award' | 'story' | 'verdict' | 'ultimatum' | 'fired' | 'hired';

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

/** How far back a story can be and still be a moment: this season's latest news, read from the end. */
const STORY_SCAN = 80;

/** The front-page stories about the user's team this season (events, not the press's opinions), newest first. */
function storyMoments(league: League): Moment[] {
  const out: Moment[] = [];
  const me = league.userTid;
  for (let i = league.news.length - 1, n = 0; i >= 0 && n < STORY_SCAN; i--, n++) {
    const x = league.news[i];
    if (x.season !== league.season) break;
    if (!isFrontPage(league, x)) continue;
    const [label, rank] = STORY_KIND[x.kind] ?? ['Front page', 1];
    // his own player's jersey, when the story is about one
    const pid = x.pids.find((p) => league.players[p]?.tid === me);
    out.push({
      key: `news-${x.id}`,
      kind: 'story',
      over: `${fmtDate(x.season, x.day)} · ${label}`,
      title: x.head ?? x.text,
      sub: x.head ? x.text : '',
      pid,
      link: storyLink(x.id),
      rank: rank * 1e6 + x.id,
      news: x.kind,
    });
  }
  return out;
}

/** Career moments by size, the biggest first: one that comes out with a bigger one waits in the digest. */
const CAREER_ORDER: MomentKind[] = ['title', 'cup', 'series', 'clinch', 'award', 'signing', 'draft'];
/** The job's moments in the order they show, after the biggest of the rest: the verdict, then what it led to. */
const JOB_ORDER: MomentKind[] = ['verdict', 'ultimatum', 'fired', 'hired'];

/**
 * The moments to show from those new at once: the biggest career moment, or else the biggest
 * front-page story, so whatever ends a sim takes the screen once, not as a stack of cards (the rest
 * are in the digest); and after it every one of the job's (a sack says the season's verdict itself).
 */
export function pickMoments(fresh: Moment[]): Moment[] {
  const job = fresh.filter((m) => JOB_MOMENTS.has(m.kind)).sort((a, b) => JOB_ORDER.indexOf(a.kind) - JOB_ORDER.indexOf(b.kind));
  const jobs = job.filter((m) => !(m.kind === 'verdict' && job.some((x) => x.kind === 'fired')));
  const career = fresh.filter((m) => m.kind !== 'story' && !JOB_MOMENTS.has(m.kind)).sort((a, b) => CAREER_ORDER.indexOf(a.kind) - CAREER_ORDER.indexOf(b.kind));
  if (career.length) return [career[0], ...jobs];
  const stories = fresh.filter((m) => m.kind === 'story').sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  return [...stories.slice(0, 1), ...jobs];
}

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
      });
  }
  // a new job (not his first): the new team's colours, its owner and what he wants
  const coach = userCoach(league);
  const stint = coach && !league.fired && coach.stints.length > 1 ? openStint(coach) : undefined;
  if (stint && stint.tid === me) {
    const who = PERSONALITY[ownerPersonality(league, me)];
    const grace = GRACE[league.settings.difficulty];
    out.push({
      key: `hired-${me}-${stint.from}`,
      kind: 'hired',
      over: `${seasonLabel(stint.from)} · New job`,
      title: `${team.region} ${team.name}`,
      sub: `${who.label} owner: ${who.blurb}.`,
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
    if (s.winner !== me) continue;
    const opp = league.teams[s.high === me ? s.low : s.high];
    const [w, l] = s.high === me ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
    if (s.round === 4)
      out.push({
        key: `title-${season}`,
        kind: 'title',
        over: `${seasonLabel(season)} · NBA Finals`,
        title: 'Champions',
        sub: `The ${team.region} ${nick} win the title, ${w}-${l} over the ${opp?.name ?? 'field'}.`,
        big: true,
      });
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
      out.push({ key: `award-${season}-${k}`, kind: 'award', over: `${seasonLabel(season)} · ${AWARD_NAME[k]}`, title: AWARD_SHORT[k], sub: `${name(p)} takes the award.`, pid });
    }
    if (aw.coy === me)
      out.push({
        key: `award-${season}-coy`,
        kind: 'award',
        over: `${seasonLabel(season)} · Coach of the Year`,
        title: 'Coach of the Year',
        sub: `${league.coachName} is the league's best coach.`,
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
  return out.concat(jobMoments(league), storyMoments(league));
}

/** The moments in `now` that weren't in `seen`, oldest first. */
export function newMoments(now: Moment[], seen: ReadonlySet<string>): Moment[] {
  return now.filter((m) => !seen.has(m.key));
}
