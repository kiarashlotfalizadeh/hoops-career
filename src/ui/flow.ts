// Phase-aware "what can I do next" actions shared by the top-bar play button and Home.
import type { League } from '../core/types';
import type { SimTarget } from '../state/store';
import { canStartRegularSeason, regularGamesLeft } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { fmtDate } from '../core/league/helpers';

export interface FlowAction {
  id: string;
  label: string;
  sub?: string;
  primary?: boolean;
  /** Either a sim target, a route, or a named command. */
  sim?: SimTarget;
  to?: string;
  cmd?: 'startRegular' | 'startDraft' | 'finishDraft' | 'startFA' | 'faDay' | 'faWeek' | 'newSeason' | 'quickGame' | 'watchLive';
  disabled?: string;
}

export function flowActions(league: League): FlowAction[] {
  const a: FlowAction[] = [];
  switch (league.phase) {
    case 'preseason': {
      const errs = canStartRegularSeason(league);
      a.push({ id: 'start', label: 'Start regular season', sub: errs[0] ?? 'Opening night is set. Rotations and tactics can be changed any time.', primary: true, cmd: 'startRegular', disabled: errs[0] });
      a.push({ id: 'tactics', label: 'Review tactics', to: '/tactics' });
      a.push({ id: 'fa', label: 'Sign free agents', to: '/free-agents' });
      break;
    }
    case 'regular':
    case 'playin':
    case 'playoffs': {
      const g = userGameOnDay(league, league.day);
      const date = fmtDate(league.season, league.day, { weekday: 'short', month: 'short', day: 'numeric' });
      if (g) {
        a.push({ id: 'live', label: 'Watch & coach live', sub: `${date}: your game is today`, primary: true, cmd: 'watchLive' });
        a.push({ id: 'quick', label: 'Quick sim this game', cmd: 'quickGame' });
      } else {
        a.push({ id: 'next', label: 'Sim to next game', sub: date, primary: true, sim: { kind: 'untilUserGame' } });
      }
      a.push({ id: 'day', label: 'Sim 1 day', sim: { kind: 'days', n: 1 } });
      if (league.phase === 'regular') {
        a.push({ id: 'week', label: 'Sim 1 week', sim: { kind: 'week' } });
        if (league.day <= league.tradeDeadlineDay) a.push({ id: 'deadline', label: 'Sim to trade deadline', sim: { kind: 'deadline' } });
        if (league.day <= league.allStarDay) a.push({ id: 'allstar', label: 'Sim to All-Star break', sim: { kind: 'allStar' } });
        a.push({ id: 'endreg', label: 'Sim to end of regular season', sub: `${regularGamesLeft(league)} games left league-wide`, sim: { kind: 'endRegular' } });
      } else {
        a.push({ id: 'endpost', label: league.phase === 'playin' ? 'Sim through play-in' : 'Sim to end of playoffs', sim: { kind: 'endPostseason' } });
      }
      break;
    }
    case 'draftLottery':
      a.push({ id: 'draft', label: 'Go to the draft', sub: 'Lottery results are in.', primary: true, cmd: 'startDraft' });
      a.push({ id: 'board', label: 'Scout prospects', to: '/draft' });
      break;
    case 'draft':
      a.push({ id: 'board', label: 'Draft board', sub: 'You are on the clock when it is your pick.', primary: true, to: '/draft' });
      a.push({ id: 'finish', label: 'Auto-draft the rest', cmd: 'finishDraft' });
      break;
    case 'resign':
      a.push({ id: 'resign', label: 'Re-sign players', primary: true, to: '/resign' });
      a.push({ id: 'fa', label: 'Open free agency', sub: 'Unsigned players will hit the market.', cmd: 'startFA' });
      break;
    case 'freeAgency':
      a.push({ id: 'fas', label: 'Free agents', sub: `Day ${league.faDay + 1} of 30`, primary: true, to: '/free-agents' });
      a.push({ id: 'faday', label: 'Advance 1 day', cmd: 'faDay' });
      a.push({ id: 'faweek', label: 'Advance 1 week', cmd: 'faWeek' });
      a.push({ id: 'new', label: `Start ${league.season}-${String((league.season + 1) % 100).padStart(2, '0')} season`, sub: 'Training camp: players develop and age.', cmd: 'newSeason' });
      break;
  }
  return a;
}
