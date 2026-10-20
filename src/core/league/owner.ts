import type { League } from '../types';
import { clamp } from '../random';
import { addInbox, contractSeason, curTeamSeason, revenueScale, teamPlayers, winPct } from './helpers';
import { profit } from './finances';
import { clearAllPlans } from './gamePlans';
import { autoTactics } from '../ai/coachAI';
import { defaultTactics } from '../sim/tactics';
import { swapJobs } from './coaches';
import { REVIEWS_KEPT, currentGoals, gradeOwnerGoals, resultText, setOwnerGoals, type OwnerGoalKind, type OwnerReview } from './ownerGoals';
import { canBeFired, seasonWeight, ULTIMATUM_MET, ultimatumVerdict } from './jobSecurity';

/** Seasons the user has run his current team, counting this one (grace period, owner weighting). */
export function seasonsInCharge(league: League): number {
  return league.season - (league.tenureStart ?? league.startSeason) + 1;
}

/**
 * The user takes over another team (after a firing or by choice): the coaches swap jobs, each with his
 * own profile (the user's development and adjustments ratings go with him), the old team goes back to
 * the AI staff, and the new owner starts a fresh evaluation with a new grace period and goals of his
 * own: from that day in season (prorated to the games left; in the postseason, the next round), on
 * opening night in the preseason. The old job's mail is marked read. Taken over after the season, the job starts with next season, and so
 * do its goals. The coach registry records both moves (see swapJobs).
 */
export function takeOverTeam(league: League, tid: number) {
  const old = league.teams[league.userTid];
  const nu = league.teams[tid];
  swapJobs(league, old.tid, tid);
  [old.coach, nu.coach] = [nu.coach, old.coach];
  old.rotation.manual = false;
  // and the minute caps and back-to-back rests the user set: the AI staff never sets or clears these
  old.rotation.caps = {};
  old.rotation.restB2B = [];
  // the old team's new staff fits its own playbook from scratch: the user's custom one (late-game
  // rules, roles, screeners, star plan) doesn't stay behind with the players
  old.tactics = autoTactics({ ...old, tactics: defaultTactics(old.coach.offPhilosophy, old.coach.defPhilosophy) }, teamPlayers(league, old.tid), false);
  league.userTid = tid;
  league.fired = false;
  // the old team's game plans and the old scouting department's board don't come along, and
  // nor does its business: pending free-agent offers, waiver claims, trade offers and untouchables
  clearAllPlans(league);
  delete league.draftBoard;
  delete league.faBids;
  for (const p of Object.values(league.players)) {
    if (p.waivers?.claim) delete p.waivers.claim;
  }
  delete league.proposals;
  delete league.untouchable;
  // the old job's mail (its extension candidates, camp report, offers) is read: what's unread is the new job's
  for (const m of league.inbox) m.read = true;
  league.ownerMood = { wins: 0, playoffs: 0, money: 0, total: 0 };
  league.tenureStart = contractSeason(league);
  // the new owner's goals: from today in season; before opening night, or once the team's season is over, none yet
  if (league.phase === 'preseason') delete league.ownerGoals;
  else setOwnerGoals(league);
}

/**
 * The owner's profit expectation in first-season dollars (grown with league revenue) for a season
 * without goals (see ownerEvaluation): hitting the target grades 0, and OWNER_PROFIT_RANGE above or
 * below it maxes the finances grade out.
 */
export const OWNER_PROFIT_TARGET = 10_000;
export const OWNER_PROFIT_RANGE = 50_000;

export function ownerMoneyScore(league: League, seasonProfit: number) {
  const s = revenueScale(league);
  return clamp((seasonProfit - OWNER_PROFIT_TARGET * s) / (OWNER_PROFIT_RANGE * s), -1, 1);
}

/** The part of the owner's standing (League.ownerMood) each kind of goal feeds. */
const PART: Record<OwnerGoalKind, 'wins' | 'playoffs' | 'money' | 'youth'> = { wins: 'wins', postseason: 'playoffs', profit: 'money', payroll: 'money', youth: 'youth' };

/** The overall standing (−1..1) under which the owner fires the coach, once the grace period is over and job security is on. */
export const FIRING_LINE = -0.5;

/**
 * The owner's review after the playoffs: each of the season's goals graded −1..1 against its target
 * (see gradeGoal), the season's grade their weighted sum, and the overall standing its running
 * average: the first season in charge sets it, after that each season counts 40%. The parts of the
 * standing (wins, playoffs, money and, once a season had a development goal, youth) are running
 * averages of the goals behind them; a part without a goal this season keeps its value. A season
 * without goals (a save from before them, picked up in the postseason) is graded on the old absolute
 * scale: wins against .500, the playoff round reached and profit against a fixed target. The review
 * goes into the history (the last REVIEWS_KEPT seasons) and the inbox, goal by goal; after the grace
 * period, with job security on, a standing under FIRING_LINE gets the coach fired.
 */
export function ownerEvaluation(league: League) {
  // a fired coach has no owner until he takes over another team
  if (league.fired) return;
  const tid = league.userTid;
  const og = currentGoals(league);
  const parts: Partial<Record<'wins' | 'playoffs' | 'money' | 'youth', number>> = {};
  let goals: OwnerReview['goals'] = [];
  let grade: number;
  if (og) {
    ({ goals, grade } = gradeOwnerGoals(league, og));
    for (const k of ['wins', 'playoffs', 'money', 'youth'] as const) {
      const mine = goals.filter((g) => PART[g.kind] === k);
      const w = mine.reduce((a, g) => a + g.weight, 0);
      if (w > 0) parts[k] = mine.reduce((a, g) => a + g.weight * g.grade, 0) / w;
    }
  } else {
    const ts = curTeamSeason(league, tid);
    const round = ts.playoffRound;
    parts.wins = clamp((winPct(ts) - 0.5) * 2.5, -1, 1);
    parts.playoffs = round >= 5 ? 1 : round === 4 ? 0.7 : round === 3 ? 0.45 : round === 2 ? 0.2 : round === 1 ? 0 : -0.25;
    parts.money = ownerMoneyScore(league, profit(league, tid));
    grade = parts.wins * 0.4 + parts.playoffs * 0.4 + parts.money * 0.2;
  }
  const prev = league.ownerMood;
  // how far one season moves his standing, and how long he waits to fire: see jobSecurity.ts
  const w = seasonWeight(league);
  const verdict = ultimatumVerdict(league, og);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const blend = (k: 'wins' | 'playoffs' | 'money' | 'youth') => {
    const now = parts[k];
    return now === undefined ? prev[k] : r2(now * w + (prev[k] ?? 0) * (1 - w));
  };
  // an ultimatum met buys back some standing; missed, nothing else counts
  const total = clamp(grade * w + prev.total * (1 - w) + (verdict === 'met' ? ULTIMATUM_MET : 0), -1, 1);
  const youth = blend('youth');
  league.ownerMood = { wins: blend('wins') ?? 0, playoffs: blend('playoffs') ?? 0, money: blend('money') ?? 0, total: r2(total), ...(youth !== undefined ? { youth } : {}) };
  const fireable = canBeFired(league);
  const fired = fireable && (total < FIRING_LINE || verdict === 'missed');
  const review: OwnerReview = { season: league.season, tid, goals, grade: r2(grade), total: league.ownerMood.total, ...(fired ? { fired: true as const } : {}) };
  league.ownerReviews = [...(league.ownerReviews ?? []).filter((r) => r.season !== league.season), review].slice(-REVIEWS_KEPT);
  const lines = goals.map((g) => `${g.title} — ${resultText(g, g.result)} (${fmt(g.grade)})`);
  if (fired) {
    league.fired = true;
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: "You're fired",
      body: [
        verdict === 'missed'
          ? `I told you at the break: ${og!.ultimatum!.text.toLowerCase()}. It didn't happen. We are going in a different direction.`
          : 'The results have not been good enough. We are going in a different direction.',
        ...lines,
        '(Take over another team to keep your career going: the league waits until you do.)',
      ].join('\n'),
      tone: 'bad',
      link: '/office/career',
    });
    return;
  }
  const feeling = total > 0.4 ? 'thrilled' : total > 0.1 ? 'pleased' : total > -0.2 ? 'patient, for now' : 'concerned';
  const answered = verdict === 'met' ? 'You answered my ultimatum. That counts for something.' : '';
  const warning = total < -0.2 && fireable ? 'Another season like this and we will have a serious conversation.' : '';
  addInbox(league, {
    from: 'Owner',
    subject: 'Season review',
    body: og
      ? [`I'm ${feeling}. Season grade ${fmt(grade)}, overall standing ${fmt(total)} (both −100 to +100; 0 is my goals met exactly).`, ...lines, answered, warning]
          .filter(Boolean)
          .join('\n')
      : `I'm ${feeling}. Wins: ${fmt(league.ownerMood.wins)} · Playoffs: ${fmt(league.ownerMood.playoffs)} · Finances: ${fmt(league.ownerMood.money)}.${warning ? ` ${warning}` : ''}`,
    tone: total > 0.1 ? 'good' : total < -0.2 ? 'bad' : 'neutral',
    link: '/office/owner',
  });
}

function fmt(x: number) {
  return `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
}
