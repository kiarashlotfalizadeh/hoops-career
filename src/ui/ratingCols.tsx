// The ratings columns shared by the roster's Ratings view (yours and other teams') and the
// league-wide Ratings view: OVR, POT and the main attributes on the 40-99 scale the player page
// shows them on, coloured on one scale everywhere (ratingTone), with RatingKey to say what the
// colours and the column names mean.
import { attrDisplay } from '../core/ratings';
import type { Player } from '../core/types';
import { Help, Ovr, type Col } from './components/ui';
import './components/ovrKey.css';

/** Each column's header and what it is (the header's name for screen readers, and the key's list). */
export const ATTRS = {
  hgt: ['SIZ', 'Size'],
  spd: ['SPD', 'Speed'],
  ath: ['EXP', 'Explosiveness'],
  ins: ['FIN', 'Finishing'],
  mid: ['MID', 'Mid-range'],
  tp: ['3PT', 'Three-point shooting'],
  hnd: ['HND', 'Ball handling'],
  pas: ['PAS', 'Passing'],
  oiq: ['OIQ', 'Offensive IQ'],
  // (not "PER": that's the efficiency rating in every stats table)
  perD: ['PERD', 'Perimeter defense'],
  intD: ['INTD', 'Interior defense'],
  blk: ['BLK', 'Shot blocking'],
  diq: ['DIQ', 'Defensive IQ'],
  dreb: ['REB', 'Defensive rebounding'],
} as const;

/**
 * One scale for an attribute on the 40-99 display, wherever it's shown: 85+ elite (gold), 75+
 * strong (green), 64+ solid, under 64 weak (dimmed). The player page's bars use the same bands.
 */
export function ratingTone(v: number): 'elite' | 'good' | 'ok' | 'weak' {
  return v >= 85 ? 'elite' : v >= 75 ? 'good' : v >= 64 ? 'ok' : 'weak';
}
/** A band's colour for text (a table cell): solid ones keep the text colour. */
export const RATING_TEXT: Record<ReturnType<typeof ratingTone>, string | undefined> = {
  elite: 'var(--tier-elite)',
  good: 'var(--good)',
  ok: undefined,
  weak: 'var(--text-dim)',
};
/** A band's colour for a bar (the player page): solid ones in blue so the bar still shows. */
export const RATING_BAR: Record<ReturnType<typeof ratingTone>, string> = {
  elite: 'var(--tier-elite)',
  good: 'var(--good)',
  ok: 'var(--info)',
  weak: 'var(--text-dim)',
};

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
      fmt: (v: number | string) => <span style={{ color: RATING_TEXT[ratingTone(v as number)] }}>{v}</span>,
    })),
  ];
}

/** What a ratings table's colours and column names mean: the bands in one line, the names behind its "?". */
export function RatingKey() {
  return (
    <span className="ok-rkey">
      <span>
        Ratings <b style={{ color: RATING_TEXT.elite }}>85+</b> <b style={{ color: RATING_TEXT.good }}>75+</b> <span className="dim">dim under 64</span>
      </span>
      <Help title="Rating columns">
        <p>Every rating is on the 40-99 scale the player page shows: 85+ is elite, 75+ strong, under 64 weak. Tap a column to sort by it.</p>
        <ul className="ok-rkey-list">
          {Object.values(ATTRS).map(([k, label]) => (
            <li key={k}>
              <b>{k}</b> {label}
            </li>
          ))}
        </ul>
      </Help>
    </span>
  );
}
