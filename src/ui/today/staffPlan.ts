// "Leave it to the staff" on a series call: the staff's plan, as the Preview's "Use the staff's plan"
// makes it. Its counters are measured in the sim worker first (a few seconds of games against them,
// see core/ai/counterWorth.ts), then the gains go in, the biggest first and one per kind; with none,
// the call settles on the playbook as it is. Either way the toast says what the staff set.
import type { GamePlanItem } from '../../core/types';
import type { CallAction } from '../../core/league/calls';
import { counterCandidates } from '../../core/ai/advisor';
import { worthCall, type CounterWorth } from '../../core/ai/counterWorth';
import { itemGroup, planFor } from '../../core/league/gamePlans';
import { measureCounters } from '../../state/simClient';
import { useStore } from '../../state/store';
import { act } from '../../state/actions';
import { resolveAgenda } from '../../core/league/agenda';

/** Counters the staff's plan holds at most (the Preview's briefing proposes as many). */
const PLAN_MAX = 3;

/** The staff's plan against `opp` from measured counters: the gains, the biggest first, one per game-plan group, leaving the groups his plan already settles. */
export function staffPlanItems(league: Parameters<typeof counterCandidates>[0], opp: number, worth: Map<string, CounterWorth>): GamePlanItem[] {
  const taken = new Set((planFor(league, opp)?.items ?? []).map(itemGroup));
  const gains = counterCandidates(league, league.userTid, opp)
    .filter((c) => worth.get(c.id) && worthCall(worth.get(c.id)!) === 'gain')
    .sort((a, b) => worth.get(b.id)!.pts - worth.get(a.id)!.pts);
  const out: GamePlanItem[] = [];
  for (const c of gains) {
    const g = itemGroup(c);
    if (out.length >= PLAN_MAX || taken.has(g)) continue;
    taken.add(g);
    out.push({ id: c.id, label: c.label, group: c.group, patch: c.patch, ...(c.evidence ? { evidence: c.evidence } : {}), pts: worth.get(c.id)!.pts });
  }
  return out;
}

let busy = false;

/** Measure the staff's counters for the series call's game, then answer the call with its plan. */
export async function leaveToStaff(title: string, a: Extract<CallAction, { kind: 'staffPlan' }>) {
  const st = useStore.getState();
  const league = st.league;
  if (busy || !league || st.sim) return;
  const day = league.day;
  const g = league.schedule.find((x) => !x.played && x.day === day && ((x.home === league.userTid && x.away === a.opp) || (x.away === league.userTid && x.home === a.opp)));
  busy = true;
  st.toast(`The staff is measuring its counters against ${league.teams[a.opp].abbrev}…`, 'neutral');
  try {
    const out = await measureCounters(league, a.opp, g?.gid, () => {});
    const now = useStore.getState().league;
    // (the day moved on, or the measuring was stopped: the call is answered from its card again)
    if (!out || !now || now.id !== league.id || now.day !== day) return;
    const items = staffPlanItems(now, a.opp, new Map(out.map((w) => [w.id, w])));
    let r = { ok: false, text: '' };
    if (act(title, (l) => void (r = resolveAgenda(l, { kind: 'call', call: { ...a, items } }))) && r.text) useStore.getState().toast(r.text, r.ok ? 'good' : 'bad');
  } catch (e) {
    console.warn('The staff could not measure its counters:', e);
    useStore.getState().toast('The staff could not measure its counters. Try the plan yourself.', 'bad');
  } finally {
    busy = false;
  }
}
