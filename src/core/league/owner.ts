import type { League } from '../types';
import { clamp } from '../random';
import { addInbox, contractSeason, curTeamSeason, revenueScale, teamPlayers, winPct } from './helpers';
import { profit } from './finances';
import { clearAllPlans } from './gamePlans';
import { autoTactics } from '../ai/coachAI';
import { defaultTactics } from '../sim/tactics';

/** Seasons the user has run his current team, counting this one (grace period, owner weighting). */
export function seasonsInCharge(league: League): number {
  return league.season - (league.tenureStart ?? league.startSeason) + 1;
}

/**
 * The user takes over another team (after a firing or by choice): the coaches swap jobs, the old
 * team goes back to the AI staff, and the new owner starts a fresh evaluation with a new grace
 * period. Taken over after the season, the job starts with next season.
 */
export function takeOverTeam(league: League, tid: number) {
  const old = league.teams[league.userTid];
  const nu = league.teams[tid];
  const theirCoach = nu.coach.name;
  nu.coach.name = league.coachName;
  old.coach.name = theirCoach;
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
  // nor does its business: pending free-agent offers, waiver claims, trade offers, untouchables,
  // and the promises made at meetings with its players
  clearAllPlans(league);
  delete league.draftBoard;
  delete league.faBids;
  for (const p of Object.values(league.players)) {
    if (p.waivers?.claim) delete p.waivers.claim;
    delete p.promise;
    delete p.meeting;
  }
  delete league.proposals;
  delete league.untouchable;
  league.ownerMood = { wins: 0, playoffs: 0, money: 0, total: 0 };
  league.tenureStart = contractSeason(league);
}

/**
 * The owner's profit expectation in first-season dollars (grown with league revenue): hitting the
 * target grades 0, and OWNER_PROFIT_RANGE above or below it maxes the finances grade out.
 */
export const OWNER_PROFIT_TARGET = 10_000;
export const OWNER_PROFIT_RANGE = 50_000;

export function ownerMoneyScore(league: League, seasonProfit: number) {
  const s = revenueScale(league);
  return clamp((seasonProfit - OWNER_PROFIT_TARGET * s) / (OWNER_PROFIT_RANGE * s), -1, 1);
}

/** End-of-season owner review. Components are -1..1; total is a running average. */
export function ownerEvaluation(league: League) {
  // a fired coach has no owner until he takes over another team
  if (league.fired) return;
  const tid = league.userTid;
  const ts = curTeamSeason(league, tid);
  const wins = clamp((winPct(ts) - 0.5) * 2.5, -1, 1);
  const round = ts.playoffRound;
  const playoffs = round >= 5 ? 1 : round === 4 ? 0.7 : round === 3 ? 0.45 : round === 2 ? 0.2 : round === 1 ? 0 : -0.25;
  const money = ownerMoneyScore(league, profit(league, tid));
  const prev = league.ownerMood;
  const seasonsIn = seasonsInCharge(league);
  const w = seasonsIn <= 1 ? 1 : 0.4;
  const total = clamp((wins * 0.4 + playoffs * 0.4 + money * 0.2) * w + prev.total * (1 - w), -1, 1);
  league.ownerMood = {
    wins: Math.round((wins * w + prev.wins * (1 - w)) * 100) / 100,
    playoffs: Math.round((playoffs * w + prev.playoffs * (1 - w)) * 100) / 100,
    money: Math.round((money * w + prev.money * (1 - w)) * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
  const grace = seasonsIn < 3;
  if (league.settings.jobSecurity && !grace && total < -0.5) {
    league.fired = true;
    addInbox(league, {
      important: true,
      from: 'Owner',
      subject: "You're fired",
      body: 'The results have not been good enough. We are going in a different direction. (Take over another team to keep your career going: the league waits until you do.)',
      tone: 'bad',
      link: '/settings?sheet=switch',
    });
    return;
  }
  const verdict = total > 0.4 ? 'thrilled' : total > 0.1 ? 'pleased' : total > -0.2 ? 'patient, for now' : 'concerned';
  addInbox(league, {
    from: 'Owner',
    subject: 'Season review',
    body: `I'm ${verdict}. Wins: ${fmt(league.ownerMood.wins)} · Playoffs: ${fmt(league.ownerMood.playoffs)} · Finances: ${fmt(league.ownerMood.money)}.${total < -0.2 && !grace ? ' Another season like this and we will have a serious conversation.' : ''}`,
    tone: total > 0.1 ? 'good' : total < -0.2 ? 'bad' : 'neutral',
    link: '/owner',
  });
}

function fmt(x: number) {
  return `${x >= 0 ? '+' : ''}${Math.round(x * 100)}`;
}
