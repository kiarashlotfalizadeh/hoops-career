// The free-agent list's two fixed-terms sheets: a two-way offer and a waiver claim.
import type { Player } from '../../core/types';
import { FREE_AGENT } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { TWO_WAY_MAX, shortName, twoWayRoster } from '../../core/league/helpers';
import { claimBlockedReason, twoWaySalary, twoWayYears, userClaim, waiverOrder, wantsTwoWay } from '../../core/league/contracts';
import { signingClosedReason, userTwoWayOffer } from '../../core/league/freeAgency';
import { useLeague } from '../../state/store';
import { settle, useBusy } from '../../state/actions/office';
import { Sheet } from '../components/ui';
import { Line, OvrPot, PlayerHead, capSeason } from './common';
import { moneyExact } from '../../core/format';

/** Fixed-terms two-way offer: no negotiation, he takes it if he's a minimum-level player. */
export function TwoWaySheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const open = !!p && p.tid === FREE_AGENT;
  const s = capSeason(league);
  const used = twoWayRoster(league, league.userTid).length;
  const blocked = !p
    ? null
    : (signingClosedReason(league) ??
      (used >= TWO_WAY_MAX
        ? `All ${TWO_WAY_MAX} two-way slots are taken.`
        : !wantsTwoWay(league, p, league.userTid)
          ? `${shortName(league, p)} wants a standard contract.`
          : null));
  const busy = useBusy();
  const offer = () => {
    if (p && settle('The two-way deal', (l) => userTwoWayOffer(l, p.pid))?.ok) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Two-way offer">
      {open && p && (
        <div className="col fo-sheet">
          <PlayerHead league={league} p={p} right={<OvrPot p={p} />} />
          <div className="fo-lines">
            <Line k="Pay a season">{moneyExact(twoWaySalary(league, s))}</Line>
            <Line k="Seasons">
              {twoWayYears(p)} from {seasonLabel(s)}
            </Line>
            <Line k="Two-way slots used">
              {used}/{TWO_WAY_MAX}
            </Line>
          </div>
          <p className="fo-lede small">No roster spot or cap room needed. He sits at the end of the bench unless you run short. He can move to a minimum deal when a spot opens.</p>
          {blocked && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary grow" disabled={!!blocked || busy} onClick={offer}>
              Offer two-way deal
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** A player on waivers: his contract, when he clears, where you stand in the waiver order, and your claim. */
export function WaiverSheet({ p, onClose }: { p: Player | undefined; onClose: () => void }) {
  const league = useLeague();
  const w = p?.waivers;
  const open = !!p && !!w && p.tid === FREE_AGENT;
  const tid = league.userTid;
  const blocked = open ? claimBlockedReason(league, tid, p) : null;
  const order = waiverOrder(league).filter((t) => t.tid !== w?.from);
  const rank = order.findIndex((t) => t.tid === tid) + 1;
  const days = w ? Math.max(0, w.until - league.day) : 0;
  const busy = useBusy();
  const claim = (on: boolean) => p && settle(on ? 'The waiver claim' : 'Withdrawing the claim', (l) => userClaim(l, p.pid, on));
  return (
    <Sheet open={open} onClose={onClose} title="Waiver claim">
      {open && p && w && (
        <div className="col fo-sheet">
          <PlayerHead league={league} p={p} right={<OvrPot p={p} />} />
          <p className="fo-lede small">
            Released by the {league.teams[w.from].region} {league.teams[w.from].name}. Clears {days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : 'today'}. Until then, teams
            claim him worst record first and take over his contract. Unclaimed, he&apos;s a free agent.
          </p>
          <div className="fo-lines">
            {w.contract.salaries.map((amt, i) => {
              const season = w.contract.start + i;
              return season < league.season ? null : (
                <Line key={season} k={seasonLabel(season)}>
                  {moneyExact(amt)}
                </Line>
              );
            })}
            {/* (none when you released him: the order skips his old team) */}
            {rank > 0 && (
              <Line k="Your place in the waiver order">
                #{rank} of {order.length}
              </Line>
            )}
          </div>
          {blocked && !w.claim && <div className="small warn">{blocked}</div>}
          <div className="row">
            <button className="btn grow" onClick={onClose}>
              Close
            </button>
            {w.claim ? (
              <button className="btn grow" disabled={busy} onClick={() => claim(false)}>
                Withdraw claim
              </button>
            ) : (
              <button className="btn primary grow" disabled={!!blocked || busy} onClick={() => claim(true)}>
                Put in a claim
              </button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
