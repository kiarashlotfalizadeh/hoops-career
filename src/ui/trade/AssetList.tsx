// One team's side of the builder: its players and picks to tap into the deal, then the swap rights
// and cash it can add.
import { Check } from 'lucide-react';
import type { DraftPick, League, Player } from '../../core/types';
import { teamPlayers } from '../../core/league/helpers';
import { pickLabel, untradeable, type TradeOffer } from '../../core/league/trades';
import { availability, valueTier } from '../../core/league/tradeFinder';
import { playerAge, salaryFor } from '../../core/playerGen';
import { TeamLogo } from '../components/TeamLogo';
import { Ovr } from '../components/ui';
import { useLeagueMemo } from '../../state/store';
import { pickProjection } from '../league/shared';
import { Term } from '../components/Glossary';
import { contractEnd, outTag, rosterLine, salaryText } from '../office/common';
import { pickOrder, projText } from '../draft/common';
import { rosterNames } from '../stats';
import { TierLine } from './common';
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
  const players = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const nameOf = rosterNames(players, { initial: true });
  // this draft's picks: where they'd land if the season ended today (until the lottery sets the order)
  const proj = useLeagueMemo(() => pickProjection(league), [league]);
  // in the order every pick list uses: by draft, then where each lands
  const picks = league.draftPicks.filter((d) => d.tid === tid).sort(pickOrder(league, proj));
  return (
    <section className="card flush fo-assets" aria-label={title}>
      <div className="fo-assets-h">
        <TeamLogo tid={tid} size={22} decorative />
        <h3 className="grow">{title}</h3>
        {/* the roster as every desk counts it */}
        <span className="tiny dim fo-assets-n">{rosterLine(league, tid, false)}</span>
      </div>
      <div className="list">
        {players.map((p) => (
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
              proj={proj(dp)}
              on={sel.dpids.includes(dp.dpid)}
              onToggle={() => onChange({ ...sel, dpids: toggle(sel.dpids, dp.dpid) })}
            />
          ))}
        </div>
      )}
      <div className="list-divider">
        <Term id="swap">Swap rights</Term>
      </div>
      <SwapChips league={league} giver={tid} taker={other.tid} value={sel.swaps ?? []} taken={taken} onChange={(swaps) => onChange({ ...sel, swaps })} />
      <div className="list-divider">Cash</div>
      <CashControl league={league} from={tid} to={other.tid} value={sel.cash ?? 0} blocked={(other.cash ?? 0) > 0} onChange={(cash) => onChange({ ...sel, cash })} />
    </section>
  );
}

/** A player to tap into the deal: two lines (his name and flags; position, age, potential, his trade value and whether he's on the block, wrapping rather than cut off), his rating, this season's salary and when his deal ends. */
function PlayerAsset({ league, p, name, season, on, onToggle }: { league: League; p: Player; name: string; season: number; on: boolean; onToggle: () => void }) {
  const locked = untradeable(league, p);
  return (
    <button className={`fo-asset ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="fo-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <Ovr v={p.ovr} size="sm" />
      <div className="grow">
        <div className="fo-asset-name">
          <span className="fo-name">{name}</span>
          {p.injury && <span className="fo-flag bad">{outTag(p)}</span>}
          {p.contract.twoWay && <span className="fo-flag">2W</span>}
          {locked && <span className="fo-flag bad">{{ expiring: 'Expiring', option: 'Option', signed: 'Signed' }[locked.kind]}</span>}
        </div>
        <div className="fo-meta fo-wrap">
          {p.pos} · {playerAge(p, league.season)}
          {p.pot > p.ovr + 2 ? ` · POT ${p.pot}` : ''} · <TierLine inline tier={valueTier(league, p)} avail={availability(league, p)} />
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
function PickAsset({ league, dp, proj, on, onToggle }: { league: League; dp: DraftPick; proj?: number; on: boolean; onToggle: () => void }) {
  return (
    <button className={`fo-asset pick ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="fo-check" aria-hidden="true">
        <Check size={14} strokeWidth={3} />
      </span>
      <TeamLogo tid={dp.originalTid} size={24} decorative />
      <span className="fo-name grow">{pickLabel(league, dp)}</span>
      {proj !== undefined && <span className="tiny dim num nowrap">{projText(proj)}</span>}
    </button>
  );
}
