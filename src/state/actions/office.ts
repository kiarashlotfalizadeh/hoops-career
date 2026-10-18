// The front office's league actions (see ../actions.ts): signings, releases, trades, picks and jobs,
// each one `act` with a label, so a step that throws leaves the league as it was. Most core moves
// answer { ok, reason }: `settle` runs one and says it in a toast. A refused move (a counter, a
// lowball, a rule) still went through as an action: talks remember it, so nothing is rolled back.
import type { League } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { evaluateTrade, executeTrade, type TradeOffer } from '../../core/league/trades';
import { continueDraft, userDraftPick } from '../../core/league/season';
import { releasePlayer, userBuyout } from '../../core/league/contracts';
import { declineJob, takeJob } from '../../core/league/jobs';
import { act } from '../actions';
import { useStore } from '../store';

/** A sim or a phase change is running: buttons that change the league wait. */
export const useBusy = () => useStore((s) => !!s.sim);

type Tone = 'good' | 'neutral' | 'bad';
const say = (text: string, tone: Tone) => text && useStore.getState().toast(text, tone);

/**
 * Run a core move that answers { ok, reason } as one league action, and say its answer (`good`:
 * the tone of a yes). Returns the answer, or null when the move couldn't run (a sim is on, or it threw).
 */
export function settle<R extends { ok: boolean; reason: string }>(label: string, fn: (l: League) => R, good: Tone = 'good', quiet = false): R | null {
  let r: R | null = null;
  if (!act(label, (l) => void (r = fn(l)))) return null;
  const res = r as R | null;
  if (res && !quiet) say(res.reason, res.ok ? good : 'bad');
  return res;
}

/** A trade, if they still take it; a pick traded on draft night lets the draft carry on. Returns whether it went through. */
export function makeTrade(league: League, o: TradeOffer, label = 'The trade'): boolean {
  const abbrev = league.teams[o.b.tid].abbrev;
  let msg = '';
  let ok = false;
  if (
    !act(label, (l) => {
      const ev = evaluateTrade(l, o);
      if (!ev.accept) {
        msg = `${abbrev}: ${ev.message}`;
        return;
      }
      executeTrade(l, o);
      if (l.phase === 'draft') continueDraft(l);
      ok = true;
    })
  )
    return false;
  if (!ok) {
    say(msg, 'bad');
    return false;
  }
  const names = o.b.pids.map((pid) => league.players[pid]?.lastName).filter(Boolean);
  const picks = o.b.dpids.length;
  const got = [names.join(', '), picks ? (picks === 1 ? 'a pick' : `${picks} picks`) : ''].filter(Boolean).join(' and ');
  say(`Trade done with ${abbrev}${got ? `: ${got} join${names.length === 1 && !picks ? 's' : ''} you` : ''}.`, 'good');
  return true;
}

/** The user's draft pick. */
export function draftPick(league: League, pid: number, overall: number): boolean {
  const name = playerName(league.players[pid]);
  let err: string | null = null;
  if (!act('Your pick', (l) => void (err = userDraftPick(l, pid)))) return false;
  if (err) say(err, 'bad');
  else say(`With the #${overall} pick, you select ${name}.`, 'good');
  return !err;
}

/** Release one of the user's players (stretched, or bought out). */
export function release(league: League, pid: number, how: { stretch?: boolean; buyout?: boolean }, after: string): boolean {
  if (how.buyout) return !!settle('The buyout', (l) => userBuyout(l, pid, !!how.stretch), 'neutral')?.ok;
  const name = playerName(league.players[pid]);
  if (!act(`Releasing ${name}`, (l) => releasePlayer(l, l.players[pid], { stretch: how.stretch }))) return false;
  say(after, 'neutral');
  return true;
}

/** Take a job: the user takes over that team. Returns whether he did. */
export function takeTeam(league: League, tid: number): boolean {
  const t = league.teams[tid];
  let err: string | null = null;
  if (!act('Taking the job', (l) => void (err = takeJob(l, tid)))) return false;
  if (err) {
    say(err, 'bad');
    return false;
  }
  say(`Welcome to the ${t.region} ${t.name}, Coach.`, 'good');
  return true;
}

/** Turn a job offer down. */
export function turnDownJob(league: League, tid: number) {
  if (act('Turning the job down', (l) => declineJob(l, tid))) say(`You turned down the ${league.teams[tid].name}.`, 'neutral');
}
