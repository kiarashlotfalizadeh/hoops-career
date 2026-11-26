import type { League } from '../types';
import { clamp } from '../random';
import { addInbox, contractSeason, curTeamSeason, revenueScale, teamPlayers, winPct } from './helpers';
import { clearAllPlans } from './gamePlans';
import { autoTactics } from '../ai/coachAI';
import { defaultTactics } from '../sim/tactics';
import { swapJobs } from './coaches';
import { POOR_GRADE, REVIEWS_KEPT, currentGoals, goalsRecord, gradeOwnerGoals, resultText, setOwnerGoals, type OwnerGoalKind, type OwnerReview } from './ownerGoals';
import { canBeFired, graceLeft, seasonWeight, ULTIMATUM_MET, ultimatumVerdict } from './jobSecurity';
import { firingSaid, ownerWords, verdictSaid } from './ownerVoice';
import { cameoAtReview } from './ownerCameos';

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
  // (the new team's playbook is no longer its old coach's style: the user's staff names and refits it)
  delete nu.tactics.identity;
  // the old team's game plans and the old scouting department's board don't come along, and
  // nor does its business: pending free-agent offers, trade offers and untouchables
  clearAllPlans(league);
  delete league.draftBoard;
  delete league.faBids;
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
const PART: Record<OwnerGoalKind, 'wins' | 'playoffs' | 'money' | 'youth'> = { wins: 'wins', postseason: 'playoffs', payroll: 'money', youth: 'youth' };

/** The overall standing (−1..1) under which the owner fires the coach, once the grace period is over and job security is on. */
export const FIRING_LINE = -0.5;

/**
 * Last season's review by this team's owner was a poor one (graded POOR_GRADE or worse, on goals of
 * his): the first strike. A second in a row, once the grace period is over, and he fires the coach
 * whatever the standing (see ownerEvaluation). The standing alone, a running average that one season
 * moves by 40%, had let a coach in good standing tank two seasons on purpose (graded −87 and −69)
 * and keep his job: he was never fired in eleven seasons (the playtest, 2026-11-23).
 */
export function poorLastSeason(league: League, season = league.season): boolean {
  const r = (league.ownerReviews ?? []).find((x) => x.tid === league.userTid && x.season === season - 1);
  return !!r && r.goals.length > 0 && !r.crowned && r.grade <= POOR_GRADE;
}

/**
 * The owner's review after the playoffs: each of the season's goals graded −1..1 against its target
 * (see gradeGoal), the season's grade their weighted sum (held down by the floor or the rebuild
 * clock; lifted by a title), and the overall standing its running average:
 * a new career's first season sets it, after that (and from the first season after a job change,
 * against the reputation he brought) each season counts 40%. The parts of the standing (wins,
 * playoffs, money and, once a season had a development goal, youth) are running averages of the goals
 * behind them, this owner's own from his first season; a part without a goal this season keeps its
 * value. A season without goals (a save from before them, picked up in the postseason) is graded on
 * the old absolute scale: wins against .500 and the playoff round reached. The review goes into the history (the last REVIEWS_KEPT seasons) and the inbox, goal by
 * goal; after the grace period, with job security on, a standing under FIRING_LINE gets the coach
 * fired, and so does a missed ultimatum, whatever the season won, or a second poor season in a row
 * (see poorLastSeason), whatever the standing. What he says about it (his verdict, the
 * warning, the sack) is his own, by his quirk (ownerVoice.ts); what he decides is the same for all.
 */
export function ownerEvaluation(league: League) {
  // a fired coach has no owner until he takes over another team
  if (league.fired) return;
  const tid = league.userTid;
  const og = currentGoals(league);
  const parts: Partial<Record<'wins' | 'playoffs' | 'money' | 'youth', number>> = {};
  let goals: OwnerReview['goals'] = [];
  let grade: number;
  let floored = false;
  let impatient = false;
  let crowned: 'title' | 'run' | undefined;
  if (og) {
    let f: true | undefined;
    let p: true | undefined;
    ({ goals, grade, floored: f, impatient: p, crowned } = gradeOwnerGoals(league, og));
    floored = !!f;
    impatient = !!p;
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
    grade = parts.wins * 0.5 + parts.playoffs * 0.5;
  }
  const prev = league.ownerMood;
  // how far one season moves his standing, and how long he waits to fire: see jobSecurity.ts
  const w = seasonWeight(league);
  // (the parts are this owner's own read: his first season sets them, whatever reputation came with the coach)
  const wp = seasonsInCharge(league) <= 1 ? 1 : w;
  const verdict = ultimatumVerdict(league, og);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const blend = (k: 'wins' | 'playoffs' | 'money' | 'youth') => {
    const now = parts[k];
    return now === undefined ? prev[k] : r2(now * wp + (prev[k] ?? 0) * (1 - wp));
  };
  // an ultimatum met buys back some standing; missed, nothing else counts. What conceding the season
  // cost stays off in full (it had come off the standing before the review, which a first season's
  // grade then replaced outright: a free concession)
  const cost = og?.cost ?? 0;
  // (and a side-bet of his he took up this season counts a little: ownerCameos.ts)
  const cameo = cameoAtReview(league);
  const total = clamp(grade * w + (prev.total + cost) * (1 - w) - cost + (verdict === 'met' ? ULTIMATUM_MET : 0) + cameo.bonus, -1, 1);
  const youth = blend('youth');
  league.ownerMood = { wins: blend('wins') ?? 0, playoffs: blend('playoffs') ?? 0, money: blend('money') ?? 0, total: r2(total), ...(youth !== undefined ? { youth } : {}) };
  const fireable = canBeFired(league);
  // (a second poor season in a row: the first was his warning, said at its review and on the meter all season)
  const twice = !!og && !crowned && grade <= POOR_GRADE && poorLastSeason(league);
  const fired = fireable && (total < FIRING_LINE || verdict === 'missed' || twice);
  const held = impatient ? 'patience' : floored ? 'floor' : undefined;
  // his first words on it, in his own manner (ownerVoice.ts): why he fired the coach, or how the season left him
  // (his verdict is on this season: its grade where he set goals, his standing where there were none to grade)
  const words = ownerWords(league);
  const feeling = verdictSaid(league, og ? grade : total);
  const said = fired ? firingSaid(league, verdict === 'missed' ? { ultimatum: og!.ultimatum!.text } : 'results') : feeling;
  const strike = fired && twice && verdict !== 'missed' && total >= FIRING_LINE;
  const review: OwnerReview = {
    season: league.season,
    tid,
    goals,
    grade: r2(grade),
    total: league.ownerMood.total,
    ...(og ? { games: og.games } : {}),
    ...(crowned ? { crowned } : {}),
    ...(held ? { held } : {}),
    ...(fired ? { fired: true as const } : {}),
    said,
  };
  league.ownerReviews = [...(league.ownerReviews ?? []).filter((r) => r.season !== league.season), review].slice(-REVIEWS_KEPT);
  const lines = goals.map((g) => `${g.title} — ${resultText(g, g.result)} (${fmt(g.grade)})`);
  // (a title is what the season is remembered for)
  if (crowned)
    lines.push(
      crowned === 'title' ? 'We won the title. Nothing else this season takes that away.' : 'Two rounds further than I asked for. That is what I will remember about this season.',
    );
  if (floored && og) {
    const rec = goalsRecord(league, og);
    lines.push(`${rec.won}-${rec.games - rec.won} is under anything I can accept, so nothing else saves this season's grade.`);
  }
  if (impatient && og?.rebuild) lines.push(`${og.rebuild.year} seasons in a row without the postseason. I said we compete, and we didn't. Nothing else saves this season's grade.`);
  if (strike) lines.push('Two poor seasons in a row. I said after the first that I would not take a second.');
  if (fired) {
    league.fired = true;
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: "You're fired",
      body: [said, ...lines, 'Your agent will bring you the offers. Take one to keep your career going. The league waits until you do.'].join('\n'),
      tone: 'bad',
      link: '/office/career',
    });
    return;
  }
  const answered = [verdict === 'met' ? words.answered : '', cameo.line ?? ''].filter(Boolean).join('\n');
  // (a poor season is a strike when next season's review can fire him: said now, so the second is no surprise)
  const poorNow = !!og && !crowned && grade <= POOR_GRADE && league.settings.jobSecurity && graceLeft(league, true) === 0;
  const warning = [total < -0.2 && fireable ? words.warning : '', poorNow ? 'That was a poor season. A second one in a row and you are out, whatever came before.' : '']
    .filter(Boolean)
    .join(' ');
  addInbox(league, {
    from: 'Owner',
    subject: 'Season review',
    body: og
      ? [`${feeling} Season grade ${fmt(grade)}, overall standing ${fmt(total)}. Both run −100 to +100, and 0 is my goals met exactly.`, ...lines, answered, warning]
          .filter(Boolean)
          .join('\n')
      : `${feeling} Wins: ${fmt(league.ownerMood.wins)} · Playoffs: ${fmt(league.ownerMood.playoffs)}.${warning ? ` ${warning}` : ''}`,
    tone: total > 0.1 ? 'good' : total < -0.2 ? 'bad' : 'neutral',
    link: '/office/owner',
  });
}

function fmt(x: number) {
  return `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
}
