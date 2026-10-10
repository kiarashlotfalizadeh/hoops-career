import type { League } from '../types';
import { clamp } from '../random';
import { addInbox, curTeamSeason, winPct } from './helpers';
import { profit } from './finances';

/** End-of-season owner review. Components are -1..1; total is a running average. */
export function ownerEvaluation(league: League) {
  const tid = league.userTid;
  const ts = curTeamSeason(league, tid);
  const wins = clamp((winPct(ts) - 0.5) * 2.5, -1, 1);
  const round = ts.playoffRound;
  const playoffs = round >= 5 ? 1 : round === 4 ? 0.7 : round === 3 ? 0.45 : round === 2 ? 0.2 : round === 1 ? 0 : -0.25;
  const money = clamp((profit(league, tid) - 15_000) / 60_000, -1, 1);
  const prev = league.ownerMood;
  const seasonsIn = league.season - league.startSeason + 1;
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
      from: 'Owner',
      subject: "You're fired",
      body: 'The results have not been good enough. We are going in a different direction. (You can keep playing by taking over another team from Settings.)',
      tone: 'bad',
      link: '/settings',
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
