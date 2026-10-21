// One player in the free-agent list: his rating, name and tags (restricted, your bid, waivers), his
// interest in your team and how you could pay him, and his ask (or a two-way's, a 10-day's or a
// waiver claim's terms).
import type { League, Player, SigningRoute } from '../../core/types';
import { playerName } from '../../core/league/helpers';
import { EXCEPTIONS, isException, twoWaySalary, twoWayYears, waiverSalary, type Ask } from '../../core/league/contracts';
import { tenDayPay, tenDayUntil } from '../../core/league/tenDay';
import { playerAge } from '../../core/playerGen';
import { OvrPot, appealInfo, contractEnd, forYears, outTag, salaryText } from './common';
import { rfaTag } from './RfaPanel';
import { moneyExact } from '../../core/format';

/** Which list the row is in: free agents' asks, two-way offers or 10-day contracts. */
export type FaListMode = 'standard' | 'twoWay' | 'tenDay';

export function FaRow({
  league,
  p,
  ask,
  appeal,
  route,
  mode,
  s,
  space,
  onOpen,
}: {
  league: League;
  p: Player;
  ask: Ask;
  appeal: number;
  route: SigningRoute | null;
  mode: FaListMode;
  /** The season the deals are for. */
  s: number;
  /** Your cap space (after holds and pending offers). */
  space: number;
  onOpen: () => void;
}) {
  const tid = league.userTid;
  const twoWayMode = mode === 'twoWay';
  const tenDays = mode === 'tenDay';
  const ai = appealInfo(appeal);
  const bid = (league.faBids ?? []).find((b) => b.pid === p.pid);
  const w = p.waivers;
  // days until he clears, as the waiver sheet and the claim's answer count them
  const wDays = w ? w.until - league.day : 0;
  const rfa = rfaTag(league, p);
  const own = p.rfa?.tid === tid;
  const tag: { label: string; tone: string } | null = w
    ? w.claim
      ? { label: 'Your claim is in', tone: 'good' }
      : { label: `On waivers · clears ${wDays > 1 ? `in ${wDays} days` : wDays === 1 ? 'tomorrow' : 'today'}`, tone: 'warn' }
    : bid
      ? { label: `Bidding · ${bid.decideDay > league.faDay ? `decides day ${bid.decideDay + 1}` : 'decides at the close'}`, tone: 'info' }
      : rfa
        ? { label: rfa.label, tone: rfa.tone }
        : p.injury
          ? { label: outTag(p)!, tone: 'bad' }
          : null;
  const route_ = w ? (
    <span className="dim">Claim his contract</span>
  ) : rfa?.wait ? (
    <span className="warn">{rfa.wait}</span>
  ) : own ? (
    <span className="good">Bird rights</span>
  ) : twoWayMode ? (
    <span className="good">Two-way</span>
  ) : tenDays ? (
    <span className="good">10-day</span>
  ) : route === 'min' ? (
    <span className="good">Min deal</span>
  ) : route === 'space' ? (
    <span className="good">Fits your space</span>
  ) : isException(route) ? (
    <span className="good">{EXCEPTIONS[route].short}</span>
  ) : space > 0 ? (
    <span className="warn">More than your space</span>
  ) : (
    <span className="dim">Needs cap space</span>
  );
  return (
    <button className="fo-prow" onClick={onOpen}>
      <OvrPot p={p} />
      <div className="grow">
        <div className="fo-prow-name">
          <span className="fo-name">{playerName(p)}</span>
          {/* one tag, the one that changes what you can do: waivers, your bid, his restricted status, an injury */}
          {tag && <span className={`fo-flag ${tag.tone}`}>{tag.label}</span>}
        </div>
        <div className="fo-meta">
          {p.pos} · {playerAge(p, league.season)}
          {/* (a claim takes over his contract: what he thinks of your team doesn't matter) */}
          {!w && (
            <>
              {' · '}
              <span className="fo-interest" style={{ ['--note' as string]: ai.color }}>
                {ai.label}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="fo-fa-end">
        {w ? (
          <div className="fo-money">
            <div className="a">{salaryText(league, waiverSalary(league, p))}</div>
            <div className="b">{contractEnd(league, { contract: w.contract }, league.season)}</div>
          </div>
        ) : twoWayMode ? (
          <div className="fo-money">
            <div className="a">{moneyExact(twoWaySalary(league, s))}</div>
            <div className="b">
              two-way · {twoWayYears(p)} yr{twoWayYears(p) > 1 ? 's' : ''}
            </div>
          </div>
        ) : tenDays ? (
          <div className="fo-money">
            <div className="a">{moneyExact(tenDayPay(league, p, tenDayUntil(league) - league.day))}</div>
            <div className="b">
              {tenDayUntil(league) - league.day} day{tenDayUntil(league) - league.day === 1 ? '' : 's'}
            </div>
          </div>
        ) : (
          <div className="fo-money">
            <div className="a">{salaryText(league, ask.amount)}</div>
            <div className="b">{forYears(ask.years)}</div>
          </div>
        )}
        {/* how you'd pay him (or why you can't), under his terms */}
        <div className="fo-route">{route_}</div>
      </div>
    </button>
  );
}
