// 10-day contracts on screen (see src/core/league/tenDay.ts): the Free Agents offer sheet with its
// fixed terms, the actions when one runs out (a second 10-day, the rest of the season, let him go)
// for the player page, the Office and the inbox, and the short label lists show.
import type { League, Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, playerName, standardRoster } from '../../core/league/helpers';
import {
  HARDSHIP_OUT,
  TEN_DAY_MAX,
  hardship,
  tenDayBlockedReason,
  tenDayEnds,
  tenDayEndBlockedReason,
  tenDayLeft,
  tenDayPay,
  tenDayRestBlockedReason,
  tenDaySpot,
  tenDayUntil,
  tenDaysWith,
  userEndTenDay,
  userTenDay,
  userTenDayRest,
} from '../../core/league/tenDay';
import { useLeague, useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { Sheet } from '../components/ui';
import { OvrPot, fmtM, playerMeta } from './common';

/** Run a core action on the league and toast its answer. */
function act(fn: (l: League) => { ok: boolean; reason: string }) {
  let res = { ok: false, reason: '' };
  useStore.getState().mutate((l) => {
    res = fn(l);
  });
  useStore.getState().toast(res.reason, res.ok ? 'good' : 'bad');
  return res.ok;
}

/** "10-day · 4 days left" (with "hardship" when he's beyond 15), or null for anyone else. */
export function tenDayLabel(league: League, p: Player): string | null {
  const td = p.contract.tenDay;
  if (!td || p.tid < 0) return null;
  const left = tenDayLeft(league, p);
  return `10-day${td.hardship ? ' · hardship' : ''} · ${left > 1 ? `${left} days left` : 'last day'}`;
}

/** What his 10-day contract is, in a sentence: when it ends, which of his two with the team it is, and hardship. */
export function tenDayLine(league: League, p: Player): string {
  const td = p.contract.tenDay!;
  const n = tenDaysWith(league, p, p.tid);
  return `${n >= 2 ? 'Second' : 'First'} 10-day contract with the ${league.teams[p.tid].name} (${fmtM(p.contract.salaries[0], 2)} paid when he signed): ends after ${tenDayEnds(league, td.until)}${
    td.hardship ? ', on a hardship spot beyond 15' : ''
  }. No dead money if he goes.`;
}

/** The user's 10-day player: a second 10-day, the rest of the season at his minimum, or let him go, each with why not (none while a live game is on). */
export function TenDayActions({ league, p }: { league: League; p: Player }) {
  if (!p.contract.tenDay || p.tid !== league.userTid) return null;
  const live = liveInProgress(league) ? 'Finish your live game first.' : null;
  const again = live ?? tenDayBlockedReason(league, league.userTid, p);
  const rest = live ?? tenDayRestBlockedReason(league, p);
  const end = live ?? tenDayEndBlockedReason(league, p);
  const min = p.experience >= 3 ? CAP_FOR(league).vetMin : CAP_FOR(league).minContract;
  const next = tenDayUntil(league, p.contract.tenDay.until);
  const why = [...new Set([again, rest, end])].filter(Boolean);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn xs" disabled={!!again} onClick={() => act((l) => userTenDay(l, p.pid))}>
          Second 10-day{again ? '' : ` · ${fmtM(tenDayPay(league, p, next - p.contract.tenDay.until), 2)}`}
        </button>
        <button className="btn xs primary" disabled={!!rest} onClick={() => act((l) => userTenDayRest(l, p.pid))}>
          Rest of season · {fmtM(min, 2)}
        </button>
        <button className="btn xs" disabled={!!end} onClick={() => act((l) => userEndTenDay(l, p.pid))}>
          Let him go
        </button>
      </div>
      {why.length > 0 && <div className="tiny dim">{why.join(' ')}</div>}
    </div>
  );
}

/** A 10-day notice in the inbox: its actions while he's still on the 10-day contract, else how it ended. */
export function TenDayMessage({ league, pid }: { league: League; pid: number }) {
  const p = league.players[pid];
  if (p?.contract.tenDay && p.tid === league.userTid) return <TenDayActions league={league} p={p} />;
  const how =
    !p || p.tid < 0
      ? 'His 10-day contract is over: he is a free agent.'
      : p.tid === league.userTid
        ? 'He is signed with us now.'
        : `He has signed with the ${league.teams[p.tid].name}.`;
  return <p className="small dim">{how}</p>;
}

/** A 10-day contract for a free agent, on its fixed terms: the pay, when it ends, the roster spot it takes (hardship beyond 15). */
export function TenDaySheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const tid = league.userTid;
  const open = !!p && p.tid !== tid;
  const n = standardRoster(league, tid).length;
  const h = hardship(league, tid);
  const spot = tenDaySpot(league, tid);
  const until = tenDayUntil(league);
  const blocked = p ? tenDayBlockedReason(league, tid, p) : null;
  const had = p ? tenDaysWith(league, p, tid) : 0;
  return (
    <Sheet open={open} onClose={onClose} title="10-day contract">
      {open && p && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="fo-name">{playerName(p)}</div>
              <div className="fo-meta">{playerMeta(league, p, p.archetype)}</div>
            </div>
            <OvrPot p={p} />
          </div>
          <div className="small dim2">
            {fmtM(tenDayPay(league, p, until - league.day), 2)}, his minimum prorated for {until - league.day} days, paid when he signs. He holds a roster spot through{' '}
            {tenDayEnds(league, until)}, then becomes a free agent again with no dead money, unless you sign him to a second 10-day or for the rest of the season. Two 10-days with
            one team a season at most{had ? ': this would be his second with you' : ''}.
          </div>
          <div className="card tight col" style={{ gap: 4 }}>
            <div className="row between small">
              <span className="dim2">Roster</span>
              <span className="bold num">
                {n}/{CAP.rosterMax}
                {h.spots ? ` + ${h.spots} hardship` : ''}
              </span>
            </div>
            <div className="row between small">
              <span className="dim2">Players out (3+ games)</span>
              <span className="bold num">{h.out}</span>
            </div>
            <div className="tiny dim">
              {spot === 'hardship'
                ? `He'd take a hardship spot beyond ${CAP.rosterMax}: with ${h.out} players out you can carry ${h.spots} more on 10-days, and they leave when their days are up.`
                : spot === 'regular'
                  ? 'He takes one of your 15 roster spots.'
                  : `With ${HARDSHIP_OUT} or more players out for 3+ games, the hardship exception lets you carry 10-day players beyond ${CAP.rosterMax}.`}
            </div>
          </div>
          {blocked && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={!!blocked} onClick={() => act((l) => userTenDay(l, p.pid)) && onClose()}>
              Sign to a 10-day
            </button>
          </div>
          <div className="tiny dim">Up to {TEN_DAY_MAX} per player with one team a season; after his second, sign him for the rest of the season or he leaves.</div>
        </div>
      )}
    </Sheet>
  );
}
