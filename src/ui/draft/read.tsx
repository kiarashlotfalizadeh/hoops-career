// A prospect as the user's staff read him: the OVR badge at their read and POT as the range that
// holds the truth four times in five (core/league/prospects.ts), his move on the big board since the
// class arrived, and whether the scouts are on him. Anyone already on a roster shows as he is.
import { ArrowDown, ArrowUp, Binoculars } from 'lucide-react';
import type { League, Player } from '../../core/types';
import { DRAFT_PROSPECT } from '../../core/types';
import { scoutList, seenRange, stockMove } from '../../core/league/prospects';
import { Ovr } from '../components/ui';
import { OvrPot } from '../office/common';

/** "74" over "POT 80-86": the staff's read (a player off the board: his OVR and POT). */
export function ReadOvrPot({ league, p }: { league: League; p: Player }) {
  if (p.tid !== DRAFT_PROSPECT) return <OvrPot p={p} />;
  const r = seenRange(league, p);
  return (
    <div className="fo-ovrstack dn-read" aria-label={`Staff read: OVR ${r.ovrLo} to ${r.ovrHi}, POT ${r.potLo} to ${r.potHi}`}>
      <Ovr v={r.ovr} size="sm" />
      <span className="pot" aria-hidden="true">
        <span className="pot-k">POT</span> {r.potLo === r.potHi ? r.pot : `${r.potLo}-${r.potHi}`}
      </span>
    </div>
  );
}

/** His move on the big board since the class arrived: "↑ 4" in green, "↓ 3" in red, nothing if he hasn't moved. */
export function StockMove({ p }: { p: Player }) {
  const d = stockMove(p);
  if (!d) return null;
  return (
    <span className={`dn-stock ${d > 0 ? 'good' : 'bad'}`} title="Places on the big board since the preseason">
      {d > 0 ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
      {Math.abs(d)}
      <span className="sr-only">{d > 0 ? ' places up since the preseason' : ' places down since the preseason'}</span>
    </span>
  );
}

/** The prospects the user's scouts are on (pid → sent by him, or the staff's own pick). */
export const scoutedSet = (league: League) => new Map(scoutList(league).map((s) => [s.pid, s.auto]));

/** A small binoculars mark for a prospect the scouts are on. */
export function ScoutMark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="dn-scouted" title="Your scouts are on him">
      <Binoculars size={13} aria-hidden="true" />
      <span className="sr-only">Scouted</span>
    </span>
  );
}
