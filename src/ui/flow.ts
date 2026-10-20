// Phase-aware "what can I do next" actions: the Continue bar's primary and its Play options. A
// required agenda item (see core/league/agenda.ts) comes first and holds every sim and phase change
// until it's settled; letting the staff make the user's draft pick stays open, as it settles it.
import type { League, Phase, ScheduledGame } from '../core/types';
import { allStarStop, type SimTarget } from '../state/store';
import { liveInProgress, type LiveStatus } from '../state/live';
import { canStartRegularSeason, FA_DAYS, faDayNumber, faOver, newSeasonBlockedReason, regularGamesLeft } from '../core/league/season';
import { userGameOnDay } from '../core/league/games';
import { curTeamSeason, fmtDate, standardRoster } from '../core/league/helpers';
import { CAP, seasonLabel } from '../core/constants';
import { plural } from '../core/format';
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

/** A game in progress from the user's side: "NYK up 11-10", "NYK down 88-92", "Tied 50-50". */
export function liveScoreText(league: League, live: Pick<LiveStatus, 'score'>): string {
  const [us, them] = live.score;
  const ab = league.teams[league.userTid].abbrev;
  return us === them ? `Tied ${us}-${them}` : `${ab} ${us > them ? 'up' : 'down'} ${us}-${them}`;
}

const POST_ROUND = ['', 'first round', 'conference semifinals', 'conference finals', 'NBA Finals'];

/** Where the league stood when a sim started, for `simSummary`. */
export interface SimStart {
  season: number;
  phase: Phase;
  day: number;
  games: number;
  /** The user's season still had games in it (the regular season, or alive in the postseason). */
  alive: boolean;
}

const playing = (l: League) => l.phase === 'regular' || ((l.phase === 'playin' || l.phase === 'playoffs') && stillAlive(l));

export const simStart = (l: League): SimStart => ({ season: l.season, phase: l.phase, day: l.day, games: l.games.length, alive: playing(l) });

/**
 * What a long sim did for the user, said once it stops (the top bar has the record, not the
 * change): "4-3 since Feb 11 · now 31-24"; how his season ended if it did ("Out in the first
 * round: TOR won 4-2"); and the champion when the sim ran through the Finals. A title or a series
 * won is a moment instead; a sim of a day or to the next game says nothing.
 */
export function simSummary(before: SimStart, l: League): { text: string; tone: 'good' | 'bad' | 'neutral'; link: string } | null {
  if (l.season !== before.season) return null;
  const me = l.userTid;
  const finals = l.playoffs.find((s) => s.round === 4 && s.winner !== undefined);
  const crowned = finals && before.phase !== 'draftLottery' && l.phase === 'draftLottery' ? finals : undefined;
  const champ = crowned && crowned.winner !== me ? `${l.teams[crowned.winner!].abbrev} won the title` : '';
  if (before.alive && !playing(l) && l.phase !== 'regular') {
    // his season ended in this sim: how
    const ts = curTeamSeason(l, me);
    const lost = l.playoffs.filter((s) => (s.high === me || s.low === me) && s.winner !== undefined && s.winner !== me).sort((a, b) => b.round - a.round)[0];
    if (!lost && crowned?.winner === me) return null;
    const score = lost && `${Math.max(lost.highWins, lost.lowWins)}-${Math.min(lost.highWins, lost.lowWins)}`;
    const how = lost
      ? lost.round === 4
        ? `Lost the NBA Finals: ${l.teams[lost.winner!].abbrev} won ${score}`
        : `Out in the ${POST_ROUND[lost.round] ?? 'playoffs'}: ${l.teams[lost.winner!].abbrev} won ${score}`
      : l.playIn.some((g) => g.loser === me)
        ? 'Out in the play-in'
        : `Season over at ${ts.won}-${ts.lost}, short of the postseason`;
    // (beaten in the Finals: the champion is the team just named)
    return { text: [how, lost?.round === 4 ? '' : champ].filter(Boolean).join(' · '), tone: 'bad', link: '/league/playoffs' };
  }
  if (champ && crowned) {
    const [w, lo] = [Math.max(crowned.highWins, crowned.lowWins), Math.min(crowned.highWins, crowned.lowWins)];
    const loser = crowned.winner === crowned.high ? crowned.low : crowned.high;
    return { text: `${champ}, ${w}-${lo} over ${l.teams[loser].abbrev}`, tone: 'neutral', link: '/league/playoffs' };
  }
  let w = 0;
  let lo = 0;
  for (let i = before.games; i < l.games.length; i++) {
    const g = l.games[i];
    if (g.home.tid !== me && g.away.tid !== me) continue;
    const us = g.home.tid === me ? g.home : g.away;
    const them = g.home.tid === me ? g.away : g.home;
    if (us.pts > them.pts) w++;
    else lo++;
  }
  if (w + lo < 2) return null;
  const ts = curTeamSeason(l, me);
  const since = fmtDate(l.season, before.day, { month: 'short', day: 'numeric' });
  const now = l.phase === 'regular' && ts.won + ts.lost > w + lo ? ` · now ${ts.won}-${ts.lost}` : '';
  return { text: `${w}-${lo} since ${since}${now}`, tone: w > lo ? 'good' : w < lo ? 'bad' : 'neutral', link: '/games' };
}

/** The user's games still to play from today up to (not including) `end`. */
function yourGames(league: League, end: number): number {
  return league.schedule.filter((g) => !g.played && g.type !== 'playoffs' && g.day >= league.day && g.day < end && (g.home === league.userTid || g.away === league.userTid)).length;
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
      const me = league.userTid;
      const opener = league.schedule.filter((x) => !x.played && x.type === 'regular' && (x.home === me || x.away === me)).sort((x, y) => x.day - y.day)[0];
      a.push({
        id: 'start',
        label: 'Start regular season',
        // (short enough for the bar: the opener, not a sentence a phone cuts off)
        sub:
          errs[0] ??
          (opener
            ? `Opening night: ${fmtDate(league.season, opener.day, { weekday: 'short', month: 'short', day: 'numeric' })} ${opponentText(league, opener).replace(/ \(.*\)$/, '')}`
            : undefined),
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
        a.push({ id: 'live', label: 'Resume live game', sub: `${q} · ${liveScoreText(league, live)}`, primary: true, cmd: 'watchLive' });
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
        // how far each sim goes, in your games: a sim of n days plays today and the n - 1 after it
        const span = (end: number, lead?: string) => [lead, `${yourGames(league, end)} of your games`].filter(Boolean).join(' · ');
        a.push({ id: 'week', label: 'Sim 1 week', sub: span(league.day + 7, `Through ${when(league.day + 6)}`), sim: { kind: 'week' } });
        if (league.day < league.tradeDeadlineDay)
          a.push({ id: 'deadline', label: 'Sim to trade deadline', sub: span(league.tradeDeadlineDay, when(league.tradeDeadlineDay)), sim: { kind: 'deadline' } });
        if (league.day < allStarStop(league))
          a.push({ id: 'allstar', label: 'Sim to All-Star break', sub: span(allStarStop(league), when(allStarStop(league))), sim: { kind: 'allStar' } });
        a.push({ id: 'endreg', label: 'Sim to end of regular season', sub: `${span(Infinity)} · ${left} league-wide`, sim: { kind: 'endRegular' } });
      } else if (!out) {
        a.push({ id: 'endpost', label: league.phase === 'playin' ? 'Sim through play-in' : 'Sim to end of playoffs', sim: { kind: 'endPostseason' } });
      }
      break;
    }
    case 'draftLottery': {
      // (Today's card says the lottery is in: the bar says where the user picks)
      const first = draftOrder(league).find((d) => d.tid === league.userTid);
      a.push({
        id: 'draft',
        label: 'Go to the draft',
        sub: first ? `Your first pick: ${first.round === 1 ? '' : '2nd round, '}No. ${first.pick}` : 'You have no pick this year.',
        primary: true,
        cmd: 'startDraft',
      });
      a.push({ id: 'board', label: 'Scout prospects', to: '/office/draft' });
      break;
    }
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
      // every pick made: the draft is over, and finishing it opens re-signing
      const over = draftOrder(league).length === 0;
      a.push({
        id: 'finish',
        label: over ? 'Continue to re-signing' : 'Auto-draft the rest',
        sub: next ? 'The staff makes your picks.' : undefined,
        primary: !next,
        cmd: 'finishDraft',
      });
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
      // short of opening night's minimum: camp opens, but the season won't start until he signs more
      const short = CAP.rosterMin - standardRoster(league, league.userTid).length;
      a.push({
        id: 'new',
        label: `Start ${seasonLabel(league.season + 1)} season`,
        sub: blocked ?? (short > 0 ? `Sign ${plural(short, 'more player')} by opening night.` : 'Training camp: players develop and age.'),
        primary: over,
        cmd: 'newSeason',
        disabled: blocked,
      });
      break;
    }
  }
  return a;
}
