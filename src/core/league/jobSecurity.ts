// Job security: the owner's patience as one number, and the stakes behind it. His standing
// (League.ownerMood.total, −1..1) moves at each season's review by that season's grade (see
// ownerEvaluation); this reads where it would land if the season ends as it projects now, counted
// in as the season is played (none of it on opening night, all of it at the review), so the meter
// warms up as a season goes wrong instead of jumping at the review. The difficulty sets how many
// seasons he waits before he can fire you and how far one season moves his standing. A coach on
// the hot seat at the All-Star break gets an ultimatum (a wins total or a postseason level within
// reach): met, it buys him back some standing; missed, he's fired whatever else went right.
import type { League } from '../types';
import { clamp } from '../random';
import { preset } from './difficulty';
import { FIRING_LINE, seasonsInCharge } from './owner';
import { POSTSEASON, currentGoals, gradeGoal, ownerProgress, postseasonLevel, type OwnerGoals, type Ultimatum } from './ownerGoals';
import { addInbox, andList, curTeamSeason } from './helpers';
import type { Forecast } from '../analysis/odds';

export type SeatHeat = 'secure' | 'steady' | 'warm' | 'hot';

export interface JobSecurity {
  /** 0..100: 50 is a neutral standing, 25 the owner's firing line. */
  score: number;
  heat: SeatHeat;
  /** "Secure", "Hot seat". */
  label: string;
  /** One line: where it stands and why. */
  line: string;
  /** The standing now (−1..1), and where this season's review would leave it as things project. */
  standing: number;
  projected: number;
  /** Reviews before he can fire you (0: this season's can). */
  grace: number;
  ultimatum?: Ultimatum;
  /** Job security is off in Settings: he never fires you. */
  off: boolean;
}

/** Seasons in charge the owner waits before a review can fire the coach, by difficulty. */
export const GRACE: Record<League['settings']['difficulty'], number> = { easy: 3, normal: 2, hard: 1 };

/** How much this season's grade counts in his standing (the first season in charge sets it). */
export function seasonWeight(league: League): number {
  return seasonsInCharge(league) <= 1 ? 1 : clamp(0.4 * preset(league).ownerPressure, 0.2, 0.6);
}

/** Whether this season's review can fire the coach (the grace period is over and job security is on). */
export function canBeFired(league: League): boolean {
  return league.settings.jobSecurity && seasonsInCharge(league) > GRACE[league.settings.difficulty];
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

/** The season's grade if each goal ends where it projects (null without goals this season). */
function projectedGrade(league: League, og: OwnerGoals, fc?: Forecast | null): number | null {
  const prog = ownerProgress(league, og, fc);
  if (!prog.length) return null;
  return prog.reduce((a, p) => a + p.goal.weight * gradeGoal(league, og, p.goal, p.projected), 0);
}

export function jobSecurity(league: League, fc?: Forecast | null): JobSecurity {
  const standing = league.ownerMood.total;
  const og = currentGoals(league);
  const grade = og && !league.fired ? projectedGrade(league, og, fc) : null;
  const w = seasonWeight(league) * seasonPlayed(league, og);
  const projected = grade === null ? standing : clamp(grade * w + standing * (1 - w), -1, 1);
  const off = !league.settings.jobSecurity;
  const grace = Math.max(0, GRACE[league.settings.difficulty] - seasonsInCharge(league) + 1);
  const score = toScore(projected);
  const h = HEAT.find((x) => score >= x.min)!;
  const ultimatum = og?.ultimatum;
  let line: string;
  if (league.fired) line = 'You were fired. Take over another team.';
  else if (off) line = 'Job security is off: the owner never fires you.';
  else if (ultimatum) line = `Ultimatum: ${ultimatum.text.toLowerCase()}, or you're fired.`;
  else if (grade === null) line = h.heat === 'secure' || h.heat === 'steady' ? 'The owner is happy with the direction.' : 'The owner wants a better season than the last.';
  else {
    const prog = ownerProgress(league, og!, fc);
    const titles = (s: string) => andList(prog.filter((p) => p.status === s).map((p) => p.goal.title.toLowerCase()));
    const [missed, behind] = [titles('missed'), titles('behind')];
    // a goal the season can no longer meet is missed, not behind; on track with a cool seat: what's left of a poor standing from before
    line =
      missed || behind
        ? `${[missed && `Missed: ${missed}`, behind && `${missed ? 'behind' : 'Behind'} on ${behind}`].filter(Boolean).join('; ')}.`
        : h.heat === 'warm' || h.heat === 'hot'
          ? 'On track with his goals, but your standing from before still weighs on it.'
          : 'On track with his goals.';
  }
  if (!off && grace > 0 && (h.heat === 'warm' || h.heat === 'hot')) line += ` He can't fire you for ${grace === 1 ? 'this season' : `${grace} seasons`}.`;
  return { score, heat: h.heat, label: league.fired ? 'Fired' : h.label, line, standing, projected, grace, ultimatum, off };
}

/**
 * At the All-Star break: a coach the review could fire whose season projects near or under the
 * firing line gets an ultimatum, once. It asks for what the season can still deliver: a few wins
 * over his projection (never more than the owner's target), or the next postseason level up from
 * where the team projects (never past his goal). Money and youth goals don't make ultimatums.
 */
export function maybeUltimatum(league: League, fc?: Forecast | null): Ultimatum | null {
  const og = currentGoals(league);
  if (!og || og.ultimatum || league.fired || !canBeFired(league)) return null;
  const js = jobSecurity(league, fc);
  if (js.projected >= FIRING_LINE + 0.15) return null;
  const prog = ownerProgress(league, og, fc);
  const post = prog.find((p) => p.goal.kind === 'postseason');
  const wins = prog.find((p) => p.goal.kind === 'wins');
  let u: Ultimatum | null = null;
  if (post && post.projected < post.goal.target) {
    const target = Math.min(post.goal.target, Math.max(1, Math.round(post.projected) + 1));
    u = { kind: 'postseason', target, text: POSTSEASON[target].goal };
  } else if (wins && wins.projected < wins.goal.target) {
    const target = Math.min(wins.goal.target, Math.round(wins.projected) + 3);
    u = { kind: 'wins', target, text: `Win ${target} games${og.from ? ' from here' : ''}` };
  }
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
