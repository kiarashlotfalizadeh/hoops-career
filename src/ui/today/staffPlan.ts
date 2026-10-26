// The staff's numbers on its calls, and "Leave it to the staff" on a series call.
//
// A call whose choice needs a number (the week's counter for its big game, a skid's change, the
// adjustment when behind in a series, the week's practice, what a hurt star is worth: see calls.ts's
// CallMeasure) is measured as its row shows, in the sim worker, one at a time (a newer measurement
// stops the one in flight, so two rows would only stop each other): "The staff is measuring…" with
// how far it has got, then the numbers, kept on the league (storeWorth) so the card, the staff's
// own pick on game day and a reload all read the same ones. A sim never waits on it: one starting
// stops a measurement in flight (the row asks again after), and none starts while one runs. Counters
// go first: a change waits for them.
//
// "Leave it to the staff" on a series call whose counters aren't measured yet: the staff's plan, as
// the Preview's "Use the staff's plan" makes it. Its counters are measured first (a few seconds of
// games against them, see core/ai/counterWorth.ts), then the gains go in, the biggest first and one
// per kind; with none, the call settles on the playbook as it is. Either way the toast says what the
// staff set.
import { useEffect, useState } from 'react';
import type { GamePlanItem, League } from '../../core/types';
import type { AgendaItem } from '../../core/league/agenda';
import { changeWorth, countersWorth, storeWorth, type CallAction, type CallMeasure } from '../../core/league/calls';
import { counterCandidates } from '../../core/ai/advisor';
import { withChange, worthCall, type CounterWorth } from '../../core/ai/counterWorth';
import { itemGroup, planFor } from '../../core/league/gamePlans';
import { cancelWorth, measureChanges, measureCounters } from '../../state/simClient';
import { useStore, useVersion } from '../../state/store';
import { act, touch } from '../../state/actions';
import { resolveAgenda } from '../../core/league/agenda';
import { inLane } from '../tactics/worthLane';

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

// ---------------------------------------------------------------- the calls' numbers

/** A measurement asked for by a row: the league it was asked on and what to measure. */
interface Ask {
  tag: string;
  league: League;
  m: CallMeasure;
}

/** What's measured on what: the league, the call's key, the game and the tactics it read. */
const tagOf = (league: League, m: CallMeasure) => `${league.id}|${m.key}|${m.gid}|${m.sig}`;

const asked = new Map<string, Ask>();
/** Rows showing each tag: a measurement nobody's row asks for any more isn't started. */
const rows = new Map<string, number>();
/** Tags measured (or given up on) this session: not asked again. */
const settled = new Set<string>();
let current: { tag: string; progress: number } | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

let watching = false;
/** When the last sim ended (ms): a measurement waits SETTLE_MS after it. */
let simEnded = 0;
/**
 * How long Today has to sit after a sim before the staff starts measuring: one playing week after
 * week straight away never waits on a measurement (a sim stops one only between its configurations,
 * up to half a second in), and one reading the card has its number a few seconds later.
 */
const SETTLE_MS = 1500;
/** How long a measurement another one stopped waits before it's run again. */
const RETRY_MS = 1000;

/** A sim starting stops a measurement in flight (the two share the worker: the sim would wait on it); its row asks again after. */
function watchSims() {
  if (watching) return;
  watching = true;
  useStore.subscribe((st, prev) => {
    if (st.sim && !prev.sim && current) cancelWorth();
    if (!st.sim && prev.sim) simEnded = Date.now();
  });
}

/** The staff's numbers, one measurement at a time: counters first (a change waits for them). */
function pump() {
  watchSims();
  if (current || useStore.getState().sim) return;
  const wait = simEnded + SETTLE_MS - Date.now();
  if (wait > 0) return void setTimeout(pump, wait);
  const all = [...asked.values()];
  const next = all.find((a) => a.m.kind === 'counters') ?? all[0];
  if (!next) return;
  current = { tag: next.tag, progress: 0 };
  tell();
  const progress = (done: number, total: number) => {
    if (current?.tag !== next.tag) return;
    current = { tag: next.tag, progress: done / Math.max(1, total) };
    tell();
  };
  const { league, m } = next;
  // (in the worker's lane: the staff's background measuring of his changes waits for it, rather than stopping it)
  const run = inLane(() =>
    m.kind === 'counters'
      ? measureCounters(league, m.opp, m.gid, progress).then((out) => (out ? countersWorth(league, m, out) : null))
      : measureChanges(m.base ? withChange(league, m.base) : league, m.opp, m.gid, [m.change], progress).then((out) => (out?.[0] ? changeWorth(league, m, out[0]) : null)),
  );
  let again = 0;
  run
    .then(
      (w) => {
        // stopped by a newer measurement (the matchup page's) or a sim: measured again shortly while
        // its row still shows (before, it waited for the row to show again, and a card sat "Measuring")
        if (!w) {
          if (rows.has(next.tag)) again = RETRY_MS;
          else asked.delete(next.tag);
          return;
        }
        asked.delete(next.tag);
        settled.add(next.tag);
        const now = useStore.getState().league;
        if (now && now.id === league.id && !useStore.getState().sim) touch((l) => storeWorth(l, m.key, w));
      },
      (e: unknown) => {
        asked.delete(next.tag);
        settled.add(next.tag);
        console.warn('The staff could not measure a call:', e);
      },
    )
    .finally(() => {
      current = null;
      tell();
      // (the next on the next tick: what the store holds now is what's asked next)
      setTimeout(pump, again);
    });
}

/**
 * A call's number, measured as its row shows (see the top of this file): how far the staff has got
 * while it measures (0 to 1), or null when there's nothing to measure. Never while a sim runs.
 */
export function useCallWorth(league: League, item: AgendaItem): number | null {
  const [, bump] = useState(0);
  const v = useVersion();
  const simming = useStore((s) => !!s.sim);
  const m = item.measure;
  const tag = m ? tagOf(league, m) : null;
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  useEffect(() => {
    if (!m || !tag) return;
    rows.set(tag, (rows.get(tag) ?? 0) + 1);
    return () => {
      const n = (rows.get(tag) ?? 1) - 1;
      if (n > 0) return void rows.set(tag, n);
      rows.delete(tag);
      if (current?.tag !== tag) asked.delete(tag);
    };
  }, [tag, m]);
  useEffect(() => {
    if (!m || !tag || simming || settled.has(tag)) return;
    if (!asked.has(tag)) asked.set(tag, { tag, league, m });
    pump();
  }, [tag, simming, v, league, m]);
  if (!tag || settled.has(tag)) return null;
  return current?.tag === tag ? current.progress : 0;
}
