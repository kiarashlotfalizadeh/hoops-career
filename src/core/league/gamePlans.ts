// Opponent-specific game plans for the user's team: changes to the base tactics (and planned
// matchups) that apply only against one opponent, for the next game, a playoff series or the season.

import type { GamePlan, GamePlanItem, League, PlanScope, ScheduledGame, Tactics } from '../types';
import { applyPatch, cloneTactics } from '../sim/tactics';

/** The playoff series the user is playing against `opp` right now, if any. */
function liveSeries(league: League, opp: number) {
  const me = league.userTid;
  return league.playoffs.find((s) => s.winner === undefined && ((s.high === me && s.low === opp) || (s.low === me && s.high === opp)));
}

/** A plan still has something in it. */
const hasContent = (p: GamePlan) => p.items.length > 0 || Object.keys(p.matchups ?? {}).length > 0;

/**
 * The plan that applies against `opp` (in `game`, when given): none once a series plan's series is
 * over, or for a game outside the series it was made for.
 */
export function planFor(league: League, opp: number, game?: Pick<ScheduledGame, 'seriesId'>): GamePlan | null {
  const p = league.gamePlans?.[opp];
  if (!p || !hasContent(p)) return null;
  if (p.scope === 'series') {
    const s = p.seriesId ? league.playoffs.find((x) => x.id === p.seriesId) : undefined;
    if (!s || s.winner !== undefined) return null;
    if (game && game.seriesId !== p.seriesId) return null;
  }
  return p;
}

/** The scope a new plan against `opp` starts with: the series when one is under way, else the next game. */
export function defaultScope(league: League, opp: number): PlanScope {
  return liveSeries(league, opp) ? 'series' : 'next';
}

/** The plan against `opp`, created (empty) if there is none. */
export function ensurePlan(league: League, opp: number): GamePlan {
  const plans = (league.gamePlans ??= {});
  const cur = plans[opp];
  // a series plan from a series that's over starts again
  const stale = cur?.scope === 'series' && !league.playoffs.some((s) => s.id === cur.seriesId && s.winner === undefined);
  if (cur && !stale) return cur;
  const scope = defaultScope(league, opp);
  const plan: GamePlan = { oppTid: opp, items: [], scope, ...(scope === 'series' ? { seriesId: liveSeries(league, opp)!.id } : {}) };
  plans[opp] = plan;
  return plan;
}

/** The group an item belongs to: a newer item in the same group (one ball-screen coverage, one star plan...) replaces it. */
export const itemGroup = (it: Pick<GamePlanItem, 'id' | 'group'>) => it.group ?? it.id;

/** Add an item to the plan against `opp`, replacing any item in its group. */
export function setPlanItem(league: League, opp: number, item: GamePlanItem) {
  const plan = ensurePlan(league, opp);
  const g = itemGroup(item);
  plan.items = [...plan.items.filter((x) => itemGroup(x) !== g), structuredClone(item)];
}

export function removePlanItem(league: League, opp: number, id: string) {
  const plan = league.gamePlans?.[opp];
  if (!plan) return;
  plan.items = plan.items.filter((x) => x.id !== id);
  prune(league, opp);
}

/** Plan who guards one of their players (`mine` null: back to the staff's choice). */
export function setPlanMatchup(league: League, opp: number, theirs: number, mine: number | null) {
  const plan = ensurePlan(league, opp);
  const m = { ...(plan.matchups ?? {}) };
  if (mine === null) delete m[theirs];
  else {
    // one assignment per defender: whoever he was guarding goes back to the staff's choice
    for (const [k, v] of Object.entries(m)) if (v === mine) delete m[+k];
    m[theirs] = mine;
  }
  plan.matchups = m;
  prune(league, opp);
}

/** How long the plan against `opp` lasts. A series scope needs a series under way against them. */
export function setPlanScope(league: League, opp: number, scope: PlanScope): boolean {
  const plan = league.gamePlans?.[opp];
  if (!plan) return false;
  if (scope === 'series') {
    const s = liveSeries(league, opp);
    if (!s) return false;
    plan.seriesId = s.id;
  } else delete plan.seriesId;
  plan.scope = scope;
  return true;
}

export function clearPlan(league: League, opp: number) {
  if (league.gamePlans) delete league.gamePlans[opp];
}

/** Every plan goes (a new season, or a new job: the old team's plans don't come along). */
export function clearAllPlans(league: League) {
  delete league.gamePlans;
}

function prune(league: League, opp: number) {
  const p = league.gamePlans?.[opp];
  if (p && !hasContent(p)) delete league.gamePlans![opp];
}

/**
 * The user's tactics for a game against `opp`: the base tactics with the plan's items applied in
 * order, then its matchups on top of any the base tactics carry.
 */
export function effectiveTactics(league: League, opp: number, game?: Pick<ScheduledGame, 'seriesId'>, base: Tactics = league.teams[league.userTid].tactics): Tactics {
  const plan = planFor(league, opp, game);
  if (!plan) return cloneTactics(base);
  let t = base;
  for (const it of plan.items) t = applyPatch(t, it.patch);
  const out = cloneTactics(t);
  if (plan.matchups) out.defense.matchups = { ...out.defense.matchups, ...plan.matchups };
  return out;
}

/**
 * After the user plays `opp`: a next-game plan is used up; series plans go once their series is
 * decided (or gone), whoever they were against.
 */
export function consumePlans(league: League, g: ScheduledGame) {
  const plans = league.gamePlans;
  if (!plans) return;
  const me = league.userTid;
  if (g.home === me || g.away === me) {
    const opp = g.home === me ? g.away : g.home;
    const p = plans[opp];
    if (p && (p.scope ?? 'next') === 'next') delete plans[opp];
  }
  for (const [k, p] of Object.entries(plans)) {
    if (p.scope !== 'series') continue;
    const s = league.playoffs.find((x) => x.id === p.seriesId);
    if (!s || s.winner !== undefined) delete plans[+k];
  }
  if (!Object.keys(plans).length) delete league.gamePlans;
}

/**
 * Tactics the user keeps for every game: tonight's matchups and star target name this opponent's
 * players, so they stay in the game (or its plan) instead.
 */
export function persistableTactics(t: Tactics): Tactics {
  const out = cloneTactics(t);
  out.defense.matchups = {};
  out.defense.starTarget = null;
  return out;
}
