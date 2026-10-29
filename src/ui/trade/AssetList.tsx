// One team's side of the builder: its players and picks to tap into the deal, then the swap rights
// and cash it can add.
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { DraftPick, League, Player } from '../../core/types';
import { teamPlayers } from '../../core/league/helpers';
import { pickLabel, untradeable, type TradeOffer } from '../../core/league/trades';
import { availability, valueTier } from '../../core/league/tradeFinder';
import { playerAge, salaryFor } from '../../core/playerGen';
import { TeamLogo } from '../components/TeamLogo';
import { Ovr } from '../components/ui';
import { useLeagueMemo } from '../../state/store';
import { Term } from '../components/Glossary';
import { contractEnd, outTag, rosterLine, salaryText } from '../office/common';
import { pickOrder, pickProjText, projectedSlot } from '../draft/common';
import { rosterNames } from '../stats';
import { AvailFlag, TierLine } from './common';
import { CashControl, SwapChips } from './Terms';
import { toggle, type Sel } from './sel';

export function AssetList({
  league,
  tid,
  offer,
  season,
  sel,
  onChange,
  title,
}: {
  league: League;
  tid: number;
  offer: TradeOffer;
  season: number;
  sel: Sel;
  onChange: (s: Sel) => void;
  title: string;
}) {
  const other = offer.a.tid === tid ? offer.b : offer.a;
  // a draft can't be swapped both ways, nor while either team's own first of it is moving in the deal
  const moving = new Set([...offer.a.dpids, ...offer.b.dpids]);
  const taken = [
    ...(other.swaps ?? []),
    ...league.draftPicks.filter((d) => d.round === 1 && moving.has(d.dpid) && (d.originalTid === tid || d.originalTid === other.tid)).map((d) => d.season),
  ];
  const all = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const nameOf = rosterNames(all, { initial: true });
  // after the season, players whose deals are up are leaving (re-signed or let go, never traded):
  // named in one line under the list rather than offered at $0
  const leaving = all.filter((p) => untradeable(league, p)?.kind === 'expiring');
  const players = all.filter((p) => !leaving.includes(p));
  // the ones his team would move come first, under their own divider: the flag no longer crowds each name
  const shopped = new Set(players.filter((p) => availability(league, p) === 'block').map((p) => p.pid));
  const groups = shopped.size
    ? [
        { k: 'On the block', ps: players.filter((p) => shopped.has(p.pid)) },
        { k: 'Rest of the roster', ps: players.filter((p) => !shopped.has(p.pid)) },
      ].filter((g) => g.ps.length)
    : [{ k: '', ps: players }];
  // where each pick projects (until its slot is set), by the strength its value is priced on
  const proj = useLeagueMemo(() => projectedSlot(league), [league]);
  // in the order every pick list uses: by draft, then where each lands
  const picks = league.draftPicks.filter((d) => d.tid === tid).sort(pickOrder(league, proj));
  // the swap rights and cash fold away until wanted (open from the start while the deal has some)
  const [more, setMore] = useState(() => (sel.swaps?.length ?? 0) > 0 || (sel.cash ?? 0) > 0);
  return (
    <section className="card flush fo-assets" aria-label={title}>
      <div className="fo-assets-h">
        <TeamLogo tid={tid} size={22} decorative />
        <h3 className="grow">{title}</h3>
        {/* the roster as every desk counts it */}
        <span className="tiny dim fo-assets-n">{rosterLine(league, tid, false)}</span>
      </div>
      {groups.map((g) => (
        <div key={g.k || 'all'}>
          {g.k && <div className="list-divider">{g.k}</div>}
          <div className="list">
            {g.ps.map((p) => (
              <PlayerAsset
                key={p.pid}
                league={league}
                p={p}
                name={nameOf(p.pid)}
                season={season}
                on={sel.pids.includes(p.pid)}
                onToggle={() => onChange({ ...sel, pids: toggle(sel.pids, p.pid) })}
              />
            ))}
          </div>
        </div>
      ))}
      {leaving.length > 0 && <div className="fo-assets-empty">Contracts up, can't be traded: {leaving.map((p) => nameOf(p.pid)).join(', ')}.</div>}
      <div className="list-divider">Draft picks</div>
      {picks.length === 0 ? (
        <div className="fo-assets-empty">No draft picks.</div>
      ) : (
        <div className="list">
          {picks.map((dp) => (
            <PickAsset
              key={dp.dpid}
              league={league}
              dp={dp}
              proj={pickProjText(league, dp)}
              on={sel.dpids.includes(dp.dpid)}
              onToggle={() => onChange({ ...sel, dpids: toggle(sel.dpids, dp.dpid) })}
            />
          ))}
        </div>
      )}
      {/* the rarer terms, one tap down (open by itself while one is in the deal) */}
      <details className="fo-assets-more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
        <summary>
          <span className="grow">Swap rights and cash</span>
          <ChevronDown size={16} aria-hidden="true" />
        </summary>
        <div className="list-divider">
          <Term id="swap">Swap rights</Term>
        </div>
        <SwapChips league={league} giver={tid} taker={other.tid} value={sel.swaps ?? []} taken={taken} onChange={(swaps) => onChange({ ...sel, swaps })} />
        <div className="list-divider">Cash</div>
        <CashControl league={league} from={tid} to={other.tid} value={sel.cash ?? 0} blocked={(other.cash ?? 0) > 0} onChange={(cash) => onChange({ ...sel, cash })} />
      </details>
    </section>
  );
}

/**
 * A player to tap into the deal: two lines (his name and one flag; position, age and his trade value),
 * his rating, this season's salary and when his deal ends. Whether his team would move him is the
 * list's grouping; a flag that doesn't fit beside his name wraps under it rather than cutting it off.
 */
function PlayerAsset({ league, p, name, season, on, onToggle }: { league: League; p: Player; name: string; season: number; on: boolean; onToggle: () => void }) {
  const locked = untradeable(league, p);
  const flag = locked ? (
    <span className="fo-flag bad">{p.contract.tenDay ? '10-day' : { expiring: 'Expiring', option: 'Option', signed: 'Signed' }[locked.kind]}</span>
  ) : p.injury ? (
    <span className="fo-flag bad">{outTag(p)}</span>
  ) : p.contract.twoWay ? (
    <span className="fo-flag">2W</span>
  ) : null;
  return (
    <button className={`fo-asset ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="fo-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <Ovr v={p.ovr} size="sm" />
      <div className="grow">
        <div className="fo-asset-name">
          <span className="fo-name">{name}</span>
          {/* one flag: why he can't be traded, else his injury, else a two-way deal, else a cornerstone his team builds around */}
          {flag ?? (availability(league, p) === 'franchise' ? <AvailFlag avail="franchise" /> : null)}
        </div>
        <div className="fo-meta fo-wrap">
          {p.pos} · {playerAge(p, league.season)} · <TierLine inline tier={valueTier(league, p)} />
        </div>
      </div>
      <div className="fo-money">
        <div className="a">{salaryText(league, salaryFor(p, season))}</div>
        <div className="b">{contractEnd(league, p, season)}</div>
      </div>
    </button>
  );
}

/** A pick to tap into the deal, on one line: its name (the original team's mark, round, protection, swap) and where it projects. */
function PickAsset({ league, dp, proj, on, onToggle }: { league: League; dp: DraftPick; proj?: string; on: boolean; onToggle: () => void }) {
  return (
    <button className={`fo-asset pick ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="fo-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <TeamLogo tid={dp.originalTid} size={24} decorative />
      <span className="fo-name grow">{pickLabel(league, dp)}</span>
      {proj !== undefined && <span className="tiny dim num nowrap">{proj}</span>}
    </button>
  );
}
