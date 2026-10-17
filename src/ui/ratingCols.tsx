// The ratings columns shared by the roster's Ratings view and the league-wide Ratings tab: OVR,
// POT and every attribute on the 40-99 scale the player page shows, the strong ones in green and
// the weak ones dimmed.
import { attrDisplay } from '../core/ratings';
import type { Player } from '../core/types';
import { Ovr, type Col } from './components/ui';

const ATTRS = {
  hgt: 'SIZ',
  spd: 'SPD',
  ath: 'EXP',
  ins: 'FIN',
  mid: 'MID',
  tp: '3PT',
  hnd: 'HND',
  pas: 'PAS',
  oiq: 'OIQ',
  perD: 'PER',
  intD: 'INT',
  blk: 'BLK',
  diq: 'DIQ',
  dreb: 'REB',
} as const;

/** OVR, POT and the attribute columns for rows that are (or carry) a player. */
export function ratingCols<T>(player: (r: T) => Player): Col<T>[] {
  return [
    { key: 'ovr', label: 'OVR', get: (r) => player(r).ovr, fmt: (v) => <Ovr v={v as number} size="sm" /> },
    { key: 'pot', label: 'POT', get: (r) => player(r).pot },
    ...(Object.keys(ATTRS) as (keyof typeof ATTRS)[]).map((k) => ({
      key: k,
      label: ATTRS[k],
      get: (r: T) => attrDisplay(player(r).ratings[k]),
      fmt: (v: number | string) => <span style={{ color: (v as number) >= 80 ? 'var(--good)' : (v as number) <= 60 ? 'var(--text-dim)' : undefined }}>{v}</span>,
    })),
  ];
}
