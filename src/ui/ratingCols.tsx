// The ratings columns shared by the roster's Ratings view and the league-wide Ratings tab: OVR,
// POT and the main attributes on the 40-99 scale the player page shows them on, the strong ones in
// green and the weak ones dimmed.
import { attrDisplay } from '../core/ratings';
import type { Player } from '../core/types';
import { Ovr, type Col } from './components/ui';

/** Each column's header and what it is (the header's tooltip and its name for screen readers: PER here is perimeter defense, not the efficiency rating). */
const ATTRS = {
  hgt: ['SIZ', 'Size'],
  spd: ['SPD', 'Speed'],
  ath: ['EXP', 'Explosiveness'],
  ins: ['FIN', 'Finishing'],
  mid: ['MID', 'Mid-range'],
  tp: ['3PT', 'Three-point shooting'],
  hnd: ['HND', 'Ball handling'],
  pas: ['PAS', 'Passing'],
  oiq: ['OIQ', 'Offensive IQ'],
  perD: ['PER', 'Perimeter defense'],
  intD: ['INT', 'Interior defense'],
  blk: ['BLK', 'Shot blocking'],
  diq: ['DIQ', 'Defensive IQ'],
  dreb: ['REB', 'Defensive rebounding'],
} as const;

/** OVR, POT and the attribute columns for rows that are (or carry) a player. */
export function ratingCols<T>(player: (r: T) => Player): Col<T>[] {
  return [
    { key: 'ovr', label: 'OVR', help: 'Overall rating', get: (r) => player(r).ovr, fmt: (v) => <Ovr v={v as number} size="sm" /> },
    { key: 'pot', label: 'POT', help: 'Potential', get: (r) => player(r).pot },
    ...(Object.keys(ATTRS) as (keyof typeof ATTRS)[]).map((k) => ({
      key: k,
      label: ATTRS[k][0],
      help: ATTRS[k][1],
      get: (r: T) => attrDisplay(player(r).ratings[k]),
      fmt: (v: number | string) => <span style={{ color: (v as number) >= 80 ? 'var(--good)' : (v as number) <= 60 ? 'var(--text-dim)' : undefined }}>{v}</span>,
    })),
  ];
}
