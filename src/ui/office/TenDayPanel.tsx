// 10-day contracts on screen (see src/core/league/tenDay.ts): the Free Agents offer sheet with its
// fixed terms, the actions when one runs out (a second 10-day, the rest of the season, let him go)
// for the player page, the Office and the inbox, and the short label lists show.
import type { League, Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { CAP_FOR, standardRoster } from '../../core/league/helpers';
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
import { useLeague } from '../../state/store';
import { settle } from '../../state/actions/office';
import { liveInProgress } from '../../state/live';
import { Sheet } from '../components/ui';
import { Line, OvrPot, PlayerHead } from './common';
import { money } from '../../core/format';

/** Run a core move as one league action and toast its answer. */
const act = (label: string, fn: (l: League) => { ok: boolean; reason: string }) => !!settle(label, fn)?.ok;

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
  return `${n >= 2 ? 'Second' : 'First'} 10-day with the ${league.teams[p.tid].name} (${money(p.contract.salaries[0], 2)}, paid at signing): ends after ${tenDayEnds(league, td.until)}${
    td.hardship ? `, on a hardship spot beyond ${CAP.rosterMax}` : ''
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
    <div className="col">
      <div className="chips">
        <button className="btn xs" disabled={!!again} onClick={() => act('A second 10-day', (l) => userTenDay(l, p.pid))}>
          Second 10-day{again ? '' : ` · ${money(tenDayPay(league, p, next - p.contract.tenDay.until), 2)}`}
        </button>
        <button className="btn xs primary" disabled={!!rest} onClick={() => act('Signing him for the season', (l) => userTenDayRest(l, p.pid))}>
          Rest of season · {money(min, 2)}
        </button>
        <button className="btn xs" disabled={!!end} onClick={() => act('Ending his 10-day', (l) => userEndTenDay(l, p.pid))}>
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
        <div className="col fo-sheet">
          <PlayerHead league={league} p={p} right={<OvrPot p={p} />} />
          <div className="fo-lines">
            <Line k="Pay (paid at signing)">{money(tenDayPay(league, p, until - league.day), 2)}</Line>
            <Line k="Through">
              {tenDayEnds(league, until)} · {until - league.day} day{until - league.day === 1 ? '' : 's'}
            </Line>
            <Line k="Roster">
              {n}/{CAP.rosterMax}
              {h.spots ? ` + ${h.spots} hardship` : ''}
            </Line>
            <Line k="Players out (3+ games)">{h.out}</Line>
          </div>
          <p className="fo-lede small">
            His minimum, prorated. Then he's a free agent again with no dead money, unless you give him a second 10-day or the rest of the season
            {had ? ': this would be his second with you' : ''}.{' '}
            {spot === 'hardship'
              ? `He takes a hardship spot beyond ${CAP.rosterMax}: with ${h.out} out you can carry ${h.spots} more on 10-days.`
              : spot === 'regular'
                ? `He takes one of your ${CAP.rosterMax} roster spots.`
                : `With ${HARDSHIP_OUT}+ players out for 3+ games, the hardship exception allows 10-day players beyond ${CAP.rosterMax}.`}
          </p>
          {blocked && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={!!blocked} onClick={() => act('The 10-day contract', (l) => userTenDay(l, p.pid)) && onClose()}>
              Sign to a 10-day
            </button>
          </div>
          <div className="tiny dim">Up to {TEN_DAY_MAX} per player with one team a season; after the second, the rest of the season or he leaves.</div>
        </div>
      )}
    </Sheet>
  );
}
