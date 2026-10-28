// Job security: the owner's patience as one number, and the stakes behind it. His standing
// (League.ownerMood.total, −1..1) moves at each season's review by that season's grade (see
// ownerEvaluation); this reads where it would land if the season ends as it projects now, counted
// in as the season is played (none of it on opening night, all of it at the review), so the meter
// warms up as a season goes wrong instead of jumping at the review. He waits GRACE seasons before
// he can fire you, and one season moves his standing by SEASON_WEIGHT of its grade. A coach on
// the hot seat at the All-Star break gets an ultimatum (a wins total or a postseason level within
// reach): met, it buys him back some standing; missed, he's fired whatever else went right.
import type { League } from '../types';
import { clamp } from '../random';
import { FIRING_LINE, seasonsInCharge } from './owner';
import {
  POSTSEASON,
  WIN_SCALE,
  currentGoals,
  floorCap,
  gradeGoal,
  ownerProgress,
  patienceCap,
  planOwnerGoals,
  postseasonLevel,
  type OwnerGoals,
  type Ultimatum,
} from './ownerGoals';
import { BLEED_GRADE, DEBT_LIMIT, FREEZE_GRADE, booksOf, booksOutlook, frozen } from './books';
import { addInbox, andList, curTeamSeason, revenueScale } from './helpers';
import type { Forecast, TeamOdds } from '../analysis/odds';

export type SeatHeat = 'secure' | 'steady' | 'warm' | 'hot';

export interface JobSecurity {
  /** 0..100: 50 is a neutral standing, 25 the owner's firing line. */
  score: number;
  heat: SeatHeat;
  /** "Secure", "Hot seat". */
  label: string;
  /** One line: where it stands and why. */
  line: string;
  /**
   * Set when the season is heading for the sack whatever the standing says (a live ultimatum, or the
   * books under the freeze projected to close where the review fires him): the line, said under the
   * score, which is held on the hot seat (under the firing line when it's on course to happen).
   */
  danger?: string;
  /** The standing now (−1..1), and where this season's review would leave it as things project. */
  standing: number;
  projected: number;
  /** Reviews before he can fire you (0: this season's can). */
  grace: number;
  /** The same from the next review on: after the season's review, next season's (see graceLeft). */
  left: number;
  ultimatum?: Ultimatum;
  /** Job security is off in Settings: he never fires you. */
  off: boolean;
}

/** Seasons in charge the owner waits before a review can fire the coach. */
export const GRACE = 2;

/** How much a season's grade counts in his standing once his first season has set it. */
export const SEASON_WEIGHT = 0.4;

/**
 * How much this season's grade counts in his standing: a new career's first season sets it; after
 * that, and from the first season after a job change (when a review by another owner is on file:
 * the reputation he brought, see REPUTATION_CARRY, weighs against it rather than being wiped),
 * SEASON_WEIGHT.
 */
export function seasonWeight(league: League): number {
  const fresh = seasonsInCharge(league) <= 1 && !(league.ownerReviews ?? []).some((r) => r.tid !== league.userTid);
  return fresh ? 1 : SEASON_WEIGHT;
}

/** The phases after the season's review: the review that comes next is next season's. */
const REVIEWED: ReadonlySet<League['phase']> = new Set(['draftLottery', 'draft', 'resign', 'freeAgency']);

/**
 * Reviews before one can fire the coach, this season's first (0: this season's can; `next`: counted
 * from next season's): GRACE less the seasons of his tenure already played.
 */
export function graceLeft(league: League, next = false): number {
  const from = league.tenureStart ?? league.startSeason;
  return Math.max(0, GRACE - (league.season + (next ? 1 : 0) - from));
}

/** Whether this season's review can fire the coach (the grace period is over and job security is on). */
export function canBeFired(league: League): boolean {
  return league.settings.jobSecurity && graceLeft(league) === 0;
}

/** How much of the season the goals cover has been played (0 on opening night, 1 once the regular season is over). */
function seasonPlayed(league: League, og: OwnerGoals | undefined): number {
  if (!og || league.phase !== 'regular') return league.phase === 'preseason' ? 0 : 1;
  const ts = curTeamSeason(league, og.tid);
  const gp = ts.won + ts.lost - (og.from ? og.from.won + og.from.lost : 0);
  return clamp(gp / Math.max(1, og.games), 0, 1);
}

/** The standing at 0..100: the firing line at 25. */
const toScore = (s: number) => Math.round(clamp(50 + 50 * s, 0, 100));

const HEAT: { min: number; heat: SeatHeat; label: string }[] = [
  { min: 65, heat: 'secure', label: 'Secure' },
  { min: 45, heat: 'steady', label: 'Steady' },
  { min: 32, heat: 'warm', label: 'Warm seat' },
  { min: -1, heat: 'hot', label: 'Hot seat' },
];

/** The meter's word for a score ("Steady", "Hot seat"): the one ladder every screen names the owner's standing by. */
export const seatHeat = (score: number) => HEAT.find((x) => score >= x.min)!;

/**
 * Where the books' close projects under the freeze, as the review will read it (see booksVerdict):
 * in the red (its grade capped), and deeper than at the last review (the final warning's cap, or the
 * sack after one or past the debt limit). Null when the budget isn't frozen or the close projects in
 * the black.
 */
export function frozenBooksOutlook(league: League): { cap: number; deeper: boolean; fire: boolean } | null {
  const b = booksOf(league);
  if (!b || !frozen(league) || b.season >= league.season) return null;
  // (as the review reads them: the tax the owner signed off on doesn't count, see sanctionedTax)
  const end = booksOutlook(league).judged;
  if (end >= 0) return null;
  const deeper = b.close !== undefined && end < b.close;
  return { cap: deeper ? BLEED_GRADE : FREEZE_GRADE, deeper, fire: deeper && (b.stage === 'final' || end < -DEBT_LIMIT * revenueScale(league)) };
}

/** The season's grade if each goal ends where it projects (null without goals this season). */
function projectedGrade(league: League, og: OwnerGoals, fc?: Forecast | null): number | null {
  const prog = ownerProgress(league, og, fc);
  if (!prog.length) return null;
  const wins = prog.find((p) => p.goal.kind === 'wins');
  // (a development year's part of the young players' goal keeps the projected wins' miss)
  const wg = wins ? gradeGoal(league, og, wins.goal, wins.projected) : undefined;
  const sum = prog.reduce((a, p) => a + p.goal.weight * gradeGoal(league, og, p.goal, p.projected, wg), 0);
  // a record projected under his floor caps it, as the review will; so does a season past the
  // rebuild allowance projected out of the postseason, and books projected in the red under the freeze
  const post = prog.find((p) => p.goal.kind === 'postseason');
  const books = frozenBooksOutlook(league);
  return Math.min(sum, wins ? floorCap(og, wins.projected, og.games) : 1, post ? patienceCap(og, post.projected) : 1, books?.cap ?? 1);
}

/** The score the meter is held at (most) with a live ultimatum the season projects to meet: the top of the hot seat (on course to miss it, or for the books' sack: just under the firing line). */
const ULTIMATUM_SCORE = 31;

/**
 * A live ultimatum (one not yet met) and whether the season projects to meet it: the wins or the
 * postseason level as the goals project them (see ownerProgress).
 */
function ultimatumOutlook(league: League, og: OwnerGoals, fc?: Forecast | null): { met: boolean; onCourse: boolean } | null {
  const u = og.ultimatum;
  if (!u) return null;
  if (ultimatumVerdict(league, og) === 'met') return { met: true, onCourse: true };
  const p = ownerProgress(league, og, fc).find((x) => x.goal.kind === u.kind);
  return { met: false, onCourse: !!p && p.projected >= u.target };
}

export function jobSecurity(league: League, fc?: Forecast | null): JobSecurity {
  const standing = league.ownerMood.total;
  // (once the season's review is in, the standing is its result: counting the season's grade in again
  // had read a coach at −47 after his review as 21, under the firing line)
  const goals = currentGoals(league);
  const og = goals && !(league.ownerReviews ?? []).some((r) => r.season === goals.season && r.tid === goals.tid) ? goals : undefined;
  const grade = og && !league.fired ? projectedGrade(league, og, fc) : null;
  const w = seasonWeight(league) * seasonPlayed(league, og);
  // (a concession's cost stays off whatever the season grades, as the review counts it)
  const cost = og?.cost ?? 0;
  const projected = grade === null ? standing : clamp(grade * w + (standing + cost) * (1 - w) - cost, -1, 1);
  const off = !league.settings.jobSecurity;
  const grace = graceLeft(league);
  const ultimatum = og?.ultimatum;
  // the sack on the way whatever the standing: a live ultimatum, or the books under the freeze
  // heading where the review fires him. The meter says so: hot, under the line when it's on course
  const live = og && !league.fired && !off ? ultimatumOutlook(league, og, fc) : null;
  const booksFire = !league.fired && !off && canBeFired(league) && !!frozenBooksOutlook(league)?.fire;
  const danger =
    live && !live.met
      ? `Ultimatum: ${ultimatum!.text.toLowerCase()}, or you're fired.`
      : booksFire
        ? "The books are heading deeper into the red under the freeze: close there and you're fired, whatever you win."
        : undefined;
  const raw = toScore(projected);
  const score = booksFire || (live && !live.onCourse) ? Math.min(raw, toScore(FIRING_LINE) - 1) : danger ? Math.min(raw, ULTIMATUM_SCORE) : raw;
  const h = seatHeat(score);
  let line: string;
  if (league.fired) line = 'You were fired. Take a job offer from Career.';
  else if (off) line = 'Job security is off: the owner never fires you.';
  else if (danger) line = danger;
  else if (ultimatum) line = `Ultimatum met: ${ultimatum.text.toLowerCase()}. He'll count it at the review.`;
  else if (grade === null)
    line =
      h.heat === 'secure' || h.heat === 'steady'
        ? 'The owner is happy with the direction.'
        : (nextReviewNeeds(league, standing) ?? 'The owner wants a better season than the last.');
  else {
    const prog = ownerProgress(league, og!, fc);
    const titles = (s: string, before = false) => andList(prog.filter((p) => p.status === s && !!p.before === before).map((p) => p.goal.title.toLowerCase()));
    // (before a game counts, a goal behind is one he set over his own read of the roster: said so, ahead of the meter's neutral 50)
    const [missed, behind, over] = [titles('missed'), titles('behind'), titles('behind', true)];
    // a goal the season can no longer meet is missed, not behind; on track with a cool seat: what's left of a poor standing from before
    line =
      missed || behind || over
        ? `${[over && `He expects more than his read of this roster: ${over}`, missed && `${over ? 'missed' : 'Missed'}: ${missed}`, behind && `${over || missed ? 'behind' : 'Behind'}: ${behind}`].filter(Boolean).join('; ')}.`
        : h.heat === 'warm' || h.heat === 'hot'
          ? 'On track with his goals, but your standing from before still weighs on it.'
          : 'On track with his goals.';
  }
  // (after the season's review, the grace left starts with next season)
  const reviewed = REVIEWED.has(league.phase);
  const left = reviewed ? graceLeft(league, true) : grace;
  // (a new career's first season sets the standing outright, grace or not: said, so the grace isn't read as a free season)
  const sets = !reviewed && seasonWeight(league) >= 1;
  if (!off && left > 0 && (h.heat === 'warm' || h.heat === 'hot'))
    line += ` He can't fire you ${left === 1 ? (reviewed ? 'next season' : 'this season') : `for ${reviewed ? 'the next ' : ''}${left} seasons`}${sets ? ', but this season sets your standing with him' : ''}.`;
  return { score, heat: h.heat, label: league.fired ? 'Fired' : h.label, line, ...(danger ? { danger } : {}), standing, projected, grace, left, ultimatum, off };
}

/**
 * Between seasons, on a warm or hot seat: what the next review needs to keep the coach above the
 * firing line, when it can fire him ("Next review needs a season grade of −37 or better: about 31
 * wins", or "...: to reach the play-in, and about 24 wins"). The grade from his standing and how much a season counts; in the preseason
 * the fewest wins from the goals he'd set today (see planOwnerGoals) that get there, the floor's and
 * the rebuild clock's caps counted, his postseason goal named only when no record gets there without
 * it ("the play-in, whatever your record" when any record does with it). The rebuild clock's cap had
 * been left out: "about 4 wins" to a coach whose season graded −60 at best without the play-in, and
 * was fired at 11-71 (the review, round 3). Null when that review can't fire him or no grade can sink
 * him.
 */
function nextReviewNeeds(league: League, standing: number): string | null {
  const reviewed = REVIEWED.has(league.phase);
  if (!league.settings.jobSecurity || graceLeft(league, reviewed) > 0) return null;
  const w = reviewed ? SEASON_WEIGHT : seasonWeight(league);
  const need = (FIRING_LINE - standing * (1 - w)) / w;
  if (need <= -1) return null;
  const head = `Next review needs a season grade of ${need > 0 ? '+' : need < 0 ? '−' : ''}${Math.abs(Math.ceil(need * 100))} or better`;
  const og = league.phase === 'preseason' ? planOwnerGoals(league, league.userTid) : null;
  const wins = og?.goals.find((g) => g.kind === 'wins');
  if (!og || !wins) return `${head}.`;
  const post = og.goals.find((g) => g.kind === 'postseason');
  // (the fewest wins whose season grade gets there, under the floor's and the rebuild clock's caps
  // too, the other goals on target and the postseason goal missed; only when no record gets there
  // that way, with it met)
  const fewest = (met: boolean) => {
    const postGrade = post ? post.weight * (met ? 0.3 : Math.max(-1, -0.35 * post.target)) : 0;
    const patience = patienceCap(og, met && post ? post.target : 0);
    for (let n = 0; n <= og.games; n++) if (Math.min(wins.weight * clamp((n - wins.target) / WIN_SCALE, -1, 1) + postGrade, floorCap(og, n, og.games), patience) >= need) return n;
    return null;
  };
  const alone = fewest(false);
  if (alone === 0) return `${head}.`;
  if (alone !== null) return `${head}: about ${alone} wins.`;
  const n = fewest(true);
  if (n === null || !post) return `${head}.`;
  const goal = `${post.title.charAt(0).toLowerCase()}${post.title.slice(1)}`;
  return n === 0 ? `${head}: to ${goal}, whatever your record.` : `${head}: to ${goal}, and about ${n} wins.`;
}

/** The least chance the season forecast must give an ultimatum: one it gives less is a firing announced, not a demand. */
export const ULTIMATUM_ODDS = 0.25;

/** The forecast's chance of reaching a postseason level (see POSTSEASON): the play-in or the top six, then each round. */
export function levelOdds(o: TeamOdds, level: number): number {
  return level <= 0 ? 1 : level === 1 ? o.top6 + o.playIn : o.reach[Math.min(4, level - 2)];
}

/**
 * At the All-Star break: a coach the review could fire whose season projects near or under the
 * firing line gets an ultimatum, once. It asks for what the season can still deliver: the next
 * postseason level up from where the team projects (never past his goal), or a few wins over his
 * projection (never more than the owner's target, never less than his floor), and with the season
 * forecast at hand, one it gives at least ULTIMATUM_ODDS: the highest level that clears it, else
 * the most wins that do. The play-in at 0.0% had been a firing announced in February (the Kings on
 * Hard, the review found, round 2). Money and youth goals don't make ultimatums.
 */
export function maybeUltimatum(league: League, fc?: Forecast | null): Ultimatum | null {
  const og = currentGoals(league);
  if (!og || og.ultimatum || league.fired || !canBeFired(league)) return null;
  const js = jobSecurity(league, fc);
  if (js.projected >= FIRING_LINE + 0.15) return null;
  const prog = ownerProgress(league, og, fc);
  const post = prog.find((p) => p.goal.kind === 'postseason');
  const wins = prog.find((p) => p.goal.kind === 'wins');
  const odds = fc?.season === og.season ? fc.teams[og.tid] : undefined;
  const winsAsk = (most: number): Ultimatum | null => {
    if (!wins) return null;
    // a few wins over the projection, and never under the floor: "win 10 games" is no ultimatum
    const floorWins = og.floor !== undefined ? Math.ceil(og.floor * og.games) : 0;
    let target = Math.min(most, Math.max(Math.round(wins.projected) + 3, floorWins));
    // (the forecast's 10th-90th percentiles of wins, read as a normal spread: its upper quarter is a 25% chance)
    if (odds) target = Math.min(target, Math.floor(odds.w + 0.674 * Math.max(0.5, (odds.hi - odds.lo) / 2.563)) - (og.from?.won ?? 0));
    return target > wins.now ? { kind: 'wins', target, text: `Win ${target} games${og.from ? ' from here' : ''}` } : null;
  };
  let u: Ultimatum | null = null;
  if (post && post.projected < post.goal.target) {
    let target = Math.min(post.goal.target, Math.max(1, Math.round(post.projected) + 1));
    while (odds && target > 1 && levelOdds(odds, target) < ULTIMATUM_ODDS) target--;
    u = !odds || levelOdds(odds, target) >= ULTIMATUM_ODDS ? { kind: 'postseason', target, text: POSTSEASON[target].goal } : winsAsk(wins?.goal.target ?? 0);
  } else if (wins && wins.projected < wins.goal.target) u = winsAsk(wins.goal.target);
  if (!u) return null;
  og.ultimatum = u;
  addInbox(league, {
    important: true,
    from: 'Owner',
    subject: 'An ultimatum',
    body: `This season is heading the wrong way. ${u.text}, or I make a change this summer. Whatever else goes right.`,
    tone: 'bad',
    link: '/office/owner',
  });
  return u;
}

/** The ultimatum's verdict at the season's review: met, missed, or none was given. */
export function ultimatumVerdict(league: League, og: OwnerGoals | undefined): 'met' | 'missed' | null {
  const u = og?.ultimatum;
  if (!u || !og) return null;
  const ts = curTeamSeason(league, og.tid);
  const result = u.kind === 'wins' ? ts.won - (og.from?.won ?? 0) : postseasonLevel(ts);
  return result >= u.target ? 'met' : 'missed';
}

/** What meeting an ultimatum is worth to the standing. */
export const ULTIMATUM_MET = 0.15;

// ---------------------------------------------------------------- changing it mid-career

/**
 * Job security switched in Settings. Turned off, it waits for the next opening night (Settings.pending,
 * see applyPendingSettings), so it can't dodge a review or a firing; turned back on, it counts at once
 * (and cancels the wait).
 */
export function requestJobSecurity(league: Pick<League, 'settings'>, on: boolean) {
  const st = league.settings;
  if (on) {
    delete st.pending;
    st.jobSecurity = true;
  } else if (st.jobSecurity) st.pending = { jobSecurity: false };
}

/** What Settings shows as chosen: the change waiting for opening night, else what's in force. */
export function chosenJobSecurity(league: Pick<League, 'settings'>): boolean {
  return league.settings.pending?.jobSecurity ?? league.settings.jobSecurity;
}

/** On opening night (startRegularSeason, before the owner sets his goals): the change waiting in Settings takes effect. */
export function applyPendingSettings(league: Pick<League, 'settings'>) {
  if (league.settings.pending?.jobSecurity === false) league.settings.jobSecurity = false;
  delete league.settings.pending;
}
