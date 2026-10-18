// Phase-aware "what can I do next" actions: the Continue bar's primary and its Play options. A
// required agenda item (see core/league/agenda.ts) comes first and holds every sim and phase change
// until it's settled; letting the staff make the user's draft pick stays open, as it settles it.
import type { League, ScheduledGame } from '../core/types';
import { allStarStop, type SimTarget } from '../state/store';
import { liveInProgress } from '../state/live';
import { canStartRegularSeason, FA_DAYS, faDayNumber, faOver, newSeasonBlockedReason, regularGamesLeft } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { seasonLabel } from '../core/constants';
import { agendaBlocker } from '../core/league/agenda';
import { draftOrder } from '../core/league/draft';
import { periodLabel } from './stats';

export interface FlowAction {
  id: string;
  label: string;
  sub?: string;
  primary?: boolean;
  /** The agenda item this settles (the Continue bar opens it in place). */
  agenda?: string;
  /** Either a sim target, a route, or a named command. */
  sim?: SimTarget;
  to?: string;
  cmd?: 'startRegular' | 'startDraft' | 'finishDraft' | 'startFA' | 'faDay' | 'faWeek' | 'newSeason' | 'quickGame' | 'watchLive';
  disabled?: string;
}

/** Is the user's team still playing this postseason? (Top-six seeds waiting out the play-in are.) */
export function stillAlive(league: League): boolean {
  const ts = curTeamSeason(league, league.userTid);
  if (league.phase === 'playin') return ts.playoffRound >= 0;
  return ts.playoffRound >= 1 && !league.playoffs.some((s) => s.winner !== undefined && s.winner !== league.userTid && (s.high === league.userTid || s.low === league.userTid));
}

/** "vs BOS (12-8)", "@ BOS (series 2-1)": the user's opponent in a game, with its record (or the series in the playoffs). */
export function opponentText(league: League, g: ScheduledGame): string {
  const home = g.home === league.userTid;
  const opp = home ? g.away : g.home;
  const s = g.type === 'playoffs' ? league.playoffs.find((x) => x.id === g.seriesId) : undefined;
  const ts = league.teams[opp].seasons.find((x) => x.season === league.season);
  const rec = s ? `series ${s.high === opp ? `${s.lowWins}-${s.highWins}` : `${s.highWins}-${s.lowWins}`}` : `${ts?.won ?? 0}-${ts?.lost ?? 0}`;
  return `${home ? 'vs' : '@'} ${league.teams[opp].abbrev} (${rec})`;
}

/** `onLive`: the Live screen is open, so a game in progress is all the menu offers. */
export function flowActions(league: League, opts: { onLive?: boolean } = {}): FlowAction[] {
  const acts = phaseActions(league, opts);
  const block = agendaBlocker(league);
  if (!block) return acts;
  // (a fired coach's old team isn't his to run: nothing moves on until he takes over another one)
  const why = `${block.title} first.`;
  return [
    { id: 'agenda', label: block.title, sub: block.line, primary: true, to: block.to ?? '/', agenda: block.id },
    ...acts
      .filter((x) => x.cmd || x.sim || (block.kind === 'draftPick' && x.to))
      .map((x) => ({ ...x, primary: false, disabled: block.kind === 'draftPick' && (x.cmd === 'finishDraft' || x.to) ? undefined : why })),
  ];
}

function phaseActions(league: League, { onLive = false } = {}): FlowAction[] {
  const a: FlowAction[] = [];
  switch (league.phase) {
    case 'preseason': {
      const errs = canStartRegularSeason(league);
      a.push({
        id: 'start',
        label: 'Start regular season',
        sub: errs[0] ?? 'Opening night is set. Rotations and tactics can be changed any time.',
        primary: true,
        cmd: 'startRegular',
        disabled: errs[0],
      });
      a.push({ id: 'tactics', label: 'Review tactics', to: '/team/tactics' });
      a.push({ id: 'fa', label: 'Sign free agents', to: '/office/free-agents' });
      break;
    }
    case 'regular':
    case 'playin':
    case 'playoffs': {
      // a live game in progress finishes from its current score before anything else is simmed
      // (open in this session, or journaled in the save after the app was closed mid-game)
      const live = liveInProgress(league);
      if (live && onLive) {
        a.push({ id: 'finish', label: 'Finish this game', sub: 'Sim the rest from the current score.', primary: true, cmd: 'quickGame' });
        break;
      }
      const g = userGameOnDay(league, league.day);
      const when = (day: number) => fmtDate(league.season, day, { weekday: 'short', month: 'short', day: 'numeric' });
      const out = league.phase !== 'regular' && !stillAlive(league);
      if (live) {
        const q = live.clock <= 0.05 ? `End of ${periodLabel(live.q)}` : periodLabel(live.q);
        a.push({ id: 'live', label: 'Resume live game', sub: `${q} · ${live.score[0]}-${live.score[1]}`, primary: true, cmd: 'watchLive' });
        a.push({ id: 'quick', label: 'Finish this game', sub: 'Sim the rest from the current score.', cmd: 'quickGame' });
      } else if (g) {
        a.push({ id: 'live', label: 'Watch & coach live', sub: `${opponentText(league, g)} · today`, primary: true, cmd: 'watchLive' });
        a.push({ id: 'quick', label: 'Quick sim this game', cmd: 'quickGame' });
      } else if (out) {
        // "next game" would never come: it would sim the whole postseason anyway
        a.push({ id: 'endpost', label: 'Sim to end of playoffs', sub: 'Your season is over.', primary: true, sim: { kind: 'endPlayoffs' } });
      } else {
        // playoff games are only scheduled a game at a time, so the next one may not be on the calendar yet
        const next = league.schedule.reduce<ScheduledGame | undefined>(
          (best, x) => (!x.played && x.day > league.day && (x.home === league.userTid || x.away === league.userTid) && (!best || x.day < best.day) ? x : best),
          undefined,
        );
        const sub = next
          ? `${when(next.day)} · ${opponentText(league, next)}`
          : league.phase === 'regular'
            ? 'Your regular season is over.'
            : league.phase === 'playin'
              ? 'Your series starts after the play-in.'
              : undefined;
        a.push({ id: 'next', label: 'Sim to next game', sub, primary: true, sim: { kind: 'untilUserGame' } });
      }
      a.push({ id: 'day', label: 'Sim 1 day', sim: { kind: 'days', n: 1 } });
      if (league.phase === 'regular') {
        const left = regularGamesLeft(league);
        a.push({ id: 'week', label: 'Sim 1 week', sim: { kind: 'week' } });
        if (league.day < league.tradeDeadlineDay) a.push({ id: 'deadline', label: 'Sim to trade deadline', sim: { kind: 'deadline' } });
        if (league.day < allStarStop(league)) a.push({ id: 'allstar', label: 'Sim to All-Star break', sim: { kind: 'allStar' } });
        a.push({ id: 'endreg', label: 'Sim to end of regular season', sub: `${left} game${left === 1 ? '' : 's'} left league-wide`, sim: { kind: 'endRegular' } });
      } else if (!out) {
        a.push({ id: 'endpost', label: league.phase === 'playin' ? 'Sim through play-in' : 'Sim to end of playoffs', sim: { kind: 'endPostseason' } });
      }
      break;
    }
    case 'draftLottery':
      a.push({ id: 'draft', label: 'Go to the draft', sub: 'Lottery results are in.', primary: true, cmd: 'startDraft' });
      a.push({ id: 'board', label: 'Scout prospects', to: '/office/draft' });
      break;
    case 'draft': {
      // with no picks left the board has nothing for the user to do: finishing it is the next step
      const mine = draftOrder(league).filter((d) => d.tid === league.userTid);
      const next = mine[0];
      a.push({
        id: 'board',
        label: 'Draft board',
        sub: next ? `Your next pick: ${next.round === 1 ? '' : '2nd round, '}No. ${next.pick}` : 'You have no picks left.',
        primary: !!next,
        to: '/office/draft',
      });
      a.push({ id: 'finish', label: 'Auto-draft the rest', sub: next ? 'The staff makes your picks.' : undefined, primary: !next, cmd: 'finishDraft' });
      break;
    }
    case 'resign':
      a.push({ id: 'resign', label: 'Re-sign players', primary: true, to: '/office/resign' });
      a.push({ id: 'fa', label: 'Open free agency', sub: 'Unsigned players will hit the market.', cmd: 'startFA' });
      break;
    case 'freeAgency': {
      // on the last day the calendar can't advance: the new season is all that's left
      const over = faOver(league);
      a.push({
        id: 'fas',
        label: 'Free agents',
        sub: over ? `Day ${FA_DAYS} of ${FA_DAYS}: the market is winding down.` : `Day ${faDayNumber(league)} of ${FA_DAYS}`,
        primary: !over,
        to: '/office/free-agents',
      });
      if (!over) {
        a.push({ id: 'faday', label: 'Advance 1 day', cmd: 'faDay' });
        a.push({ id: 'faweek', label: 'Advance 1 week', cmd: 'faWeek' });
      }
      // an offer sheet on one of the user's restricted free agents waits for his call first
      const blocked = newSeasonBlockedReason(league) ?? undefined;
      a.push({
        id: 'new',
        label: `Start ${seasonLabel(league.season + 1)} season`,
        sub: blocked ?? 'Training camp: players develop and age.',
        primary: over,
        cmd: 'newSeason',
        disabled: blocked,
      });
      break;
    }
  }
  return a;
}
