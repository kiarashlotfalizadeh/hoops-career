// What the Games screens read about the user's schedule: his meetings with one team, a playoff
// series, a game's short tag ("Cup QF", "R1 G4") and how far his game plan against a team goes.
import type { GamePlan, League, PlanScope, ScheduledGame } from '../../core/types';
import { plural } from '../../core/format';
import { planFor } from '../../core/league/gamePlans';
import { scoutTeam, type Threat } from '../../core/ai/advisor';
import { roundName } from '../league/shared';

const TYPE_LABEL: Record<string, string> = { playin: 'Play-In', playoffs: 'Playoffs', allstar: 'All-Star' };
const CUP_SHORT: Record<string, string> = { group: 'Cup', qf: 'Cup QF', sf: 'Cup SF', final: 'Cup Final' };

/** The user's unplayed games against `opp`, soonest first. */
export function meetings(league: League, opp: number): ScheduledGame[] {
  const me = league.userTid;
  return league.schedule
    .filter((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)))
    .sort((a, b) => a.day - b.day || a.gid - b.gid);
}

/**
 * The player of theirs the staff watches tonight: the threat its scouting names first. One pick for
 * the night, so the preview's "Watch" and the live bench's "Watching" are the same man.
 */
export function nightWatch(league: League, opp: number): Threat | undefined {
  return scoutTeam(league, opp).threats[0];
}

/** The playoff series the user is playing against `opp` right now. */
export function liveSeries(league: League, opp: number) {
  const me = league.userTid;
  return league.playoffs.find((s) => s.winner === undefined && [s.high, s.low].includes(opp) && [s.high, s.low].includes(me));
}

/** Game number within a playoff series (1-based), by scheduling order. */
export function seriesGameNo(league: League, g: ScheduledGame): number {
  if (!g.seriesId) return 0;
  const list = league.schedule.filter((x) => x.seriesId === g.seriesId && x.type === g.type).sort((a, b) => a.day - b.day || a.gid - b.gid);
  return list.findIndex((x) => x.gid === g.gid) + 1;
}

/** "1st Round G4", "Finals G2", "Cup QF", "Play-In", or '' for a regular-season game. */
export function gameTag(league: League, g: ScheduledGame): string {
  if (g.type === 'playoffs') {
    const round = g.seriesId ? Number(g.seriesId[1]) : 0;
    const n = seriesGameNo(league, g);
    return `${round >= 1 ? roundName(round, true) : 'Playoffs'}${n ? ` G${n}` : ''}`;
  }
  if (g.cup) return CUP_SHORT[g.cup];
  return TYPE_LABEL[g.type] ?? '';
}

/** How much a plan holds: its changes and planned matchups. */
export function planSize(plan: GamePlan | null): number {
  if (!plan) return 0;
  return plan.items.length + Object.keys(plan.matchups ?? {}).length;
}

/** How long a plan lasts, as its status line says it. */
export const SCOPE_WORD: Record<PlanScope, string> = { next: 'next game', series: 'this series', season: 'all season' };

/**
 * The plan that applies against `opp` (in `g`), as every screen says it: "Plan: 3 changes · next
 * game" (`detail` without the "Plan: ", for a line already labelled Plan), or "No game plan yet".
 */
export function planStatus(league: League, opp: number, g?: ScheduledGame): { set: boolean; text: string; detail: string } {
  const plan = planFor(league, opp, g);
  const n = planSize(plan);
  if (!n || !plan) return { set: false, text: NO_PLAN, detail: NO_PLAN };
  const detail = `${plural(n, 'change')} · ${SCOPE_WORD[plan.scope ?? 'next']}`;
  return { set: true, text: `Plan: ${detail}`, detail };
}

/** A matchup with no plan, the same words everywhere (Today's next game too). */
export const NO_PLAN = 'No game plan yet';

/** The user's side in a game: home, away or (the Cup final) neither. */
export const atWord = (league: League, g: ScheduledGame, neutral: boolean) => (g.home === league.userTid || neutral ? 'vs' : '@');
