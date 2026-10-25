// The trading block: pick one of your players and see each team's best package for him.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, LockKeyhole, Ticket } from 'lucide-react';
import type { League } from '../../core/types';
import { playerName, shortName, teamPlayers } from '../../core/league/helpers';
import { capSalary, untradeable, type TradeOffer } from '../../core/league/trades';
import { pickName } from '../draft/common';
import { playerAge, salaryFor } from '../../core/playerGen';
import { useLeagueMemo } from '../../state/store';
import { TeamLogo } from '../components/TeamLogo';
import { Empty, Ovr, Section } from '../components/ui';
import { STRATEGY_META, capSeason, contractEnd, salaryText } from '../office/common';
import { blockOffers } from '../office/tradeBlock';
import { isUntouchable } from '../../core/league/proposals';
import { UntouchableToggle } from '../office/Untouchable';
import { money } from '../../core/format';
import { rosterNames } from '../stats';

export function TradingBlock({
  league,
  shop,
  setShop,
  closed,
  onLoad,
}: {
  league: League;
  shop: number | null;
  setShop: (pid: number) => void;
  closed: boolean;
  onLoad: (o: TradeOffer) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const mine = teamPlayers(league, league.userTid).sort((a, b) => b.ovr - a.ovr);
  // teammates who share a last name told apart on the chips
  const nameOf = rosterNames(mine);
  const pid = shop !== null && league.players[shop]?.tid === league.userTid ? shop : null;
  const target = pid !== null ? league.players[pid] : null;
  // expiring, option and recently signed players can't be moved at all: say so instead of shopping them
  const locked = target ? untradeable(league, target) : null;
  const isLocked = !!locked;
  const offers = useLeagueMemo(() => (pid !== null && !closed && !isLocked ? blockOffers(league, pid) : []), [league, pid, closed, isLocked]);
  return (
    <>
      <Section title="Shop a player" right={<span className="tiny dim">Best package from every team</span>}>
        <div className="hscroll fo-shop">
          {mine.map((p) => {
            const lock = untradeable(league, p);
            return (
              <button
                key={p.pid}
                className={`chip ${pid === p.pid ? 'on' : ''} ${lock && pid !== p.pid ? 'fo-locked' : ''}`}
                aria-pressed={pid === p.pid}
                onClick={() => setShop(p.pid)}
              >
                <Ovr v={p.ovr} size="sm" />
                {nameOf(p.pid)}
                {lock && <Lock size={12} role="img" aria-label="can't be traded now" />}
                {isUntouchable(league, p.pid) && <LockKeyhole size={12} role="img" aria-label="untouchable" className="accent-text" />}
              </button>
            );
          })}
        </div>
        {target && (
          <div className="card tight">
            <UntouchableToggle league={league} p={target} />
          </div>
        )}
      </Section>
      {closed ? (
        <Empty>Teams aren't taking calls until trading reopens.</Empty>
      ) : !target ? (
        <Empty>Pick a player above to hear offers.</Empty>
      ) : locked ? (
        <Empty>{locked.why}</Empty>
      ) : offers.length === 0 ? (
        <Empty>No team has a package for {shortName(league, target)} that works on value and salary right now.</Empty>
      ) : (
        <Section title={`${offers.length} team${offers.length > 1 ? 's' : ''} would deal for ${shortName(league, target)}`}>
          <div className="card flush list">
            {(showAll ? offers : offers.slice(0, 8)).map((o) => {
              const t = league.teams[o.tid];
              // a player worth less than nothing (a bad contract): any taker is a salary dump, not a share of his value;
              // the share in league-neutral value, not your front office's lens on it
              const dump = o.neutralGive <= 0;
              const ratio = dump ? 0 : o.neutralGet / o.neutralGive;
              const tone = dump
                ? { l: 'Salary dump', c: 'good' }
                : ratio >= 1.1
                  ? { l: 'Overpay', c: 'good' }
                  : ratio >= 0.9
                    ? { l: 'Fair value', c: 'info' }
                    : ratio >= 0.7
                      ? { l: 'Below value', c: 'warn' }
                      : { l: 'Lowball', c: 'bad' };
              const inSal = o.offer.b.pids.reduce((a, x) => a + capSalary(league, x), 0);
              return (
                <div key={o.tid} className="fo-pkg">
                  <div className="fo-pkg-h">
                    <TeamLogo tid={o.tid} size={26} decorative />
                    <div className="grow">
                      <div className="fo-name ellipsis">
                        {t.region} {t.name}
                      </div>
                      {/* (wraps rather than cut off: the share of his value is the point) */}
                      <div className="fo-meta">
                        {STRATEGY_META[t.strategy].label}
                        {dump ? '' : ` · ${Math.round(ratio * 100)}% of his value`} · {inSal > 0 ? `${money(inSal)} back` : 'no salary back'}
                      </div>
                    </div>
                    <div className="right">
                      <span className={`tag ${tone.c}`}>{tone.l}</span>
                      <button className="btn xs" aria-label={`Open the ${t.name}' package in the builder`} onClick={() => onLoad(o.offer)}>
                        Open
                      </button>
                    </div>
                  </div>
                  <div className="fo-pkg-items">
                    {o.offer.b.pids.map((x) => {
                      const p = league.players[x];
                      return (
                        <div key={x} className="fo-pkg-item">
                          <Ovr v={p.ovr} size="sm" />
                          <Link to={`/player/${p.pid}`} className="grow ellipsis bold">
                            {playerName(p)}
                          </Link>
                          <span className="dim">
                            {p.pos} · {playerAge(p, league.season)}
                          </span>
                          <span className="num">{salaryText(league, salaryFor(p, capSeason(league)))}</span>
                          <span className="dim fo-pkg-end">{contractEnd(league, p)}</span>
                        </div>
                      );
                    })}
                    {o.offer.b.dpids.map((d) => {
                      const dp = league.draftPicks.find((x) => x.dpid === d)!;
                      return (
                        <div key={d} className="fo-pkg-item">
                          <Ticket size={16} className="dim fo-pkg-ic" />
                          <span className="grow bold">{pickName(league, dp)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {offers.length > 8 && !showAll && (
            <button className="btn ghost block" onClick={() => setShowAll(true)}>
              Show all {offers.length} offers
            </button>
          )}
        </Section>
      )}
    </>
  );
}
