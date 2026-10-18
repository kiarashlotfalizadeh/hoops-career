// The ratings columns shared by the roster's Ratings view (yours and other teams') and the
// league-wide Ratings view: OVR, POT and the main attributes on the 40-99 scale the player page
// shows them on, coloured on one scale everywhere (ratingTone), with RatingKey to say what the
// colours and the column names mean. Names and headers come from RATING_META, so a rating has one
// name on every screen.
import { RATING_META, attrDisplay } from '../core/ratings';
import type { Player, RatingKey } from '../core/types';
import { Help, Ovr, type Col } from './components/ui';
import './components/ovrKey.css';

/** The ratings a table shows, in order. */
const TABLE_KEYS: RatingKey[] = ['hgt', 'spd', 'ath', 'ins', 'mid', 'tp', 'hnd', 'pas', 'oiq', 'perD', 'intD', 'blk', 'diq', 'dreb'];
const META = new Map(RATING_META.map((m) => [m.key, m]));
/** Each column's header and the rating's name (the header's name for screen readers, and the key's list). */
export const ATTRS = TABLE_KEYS.map((k) => ({ key: k, short: META.get(k)!.short, label: META.get(k)!.label }));

/**
 * One scale for an attribute on the 40-99 display, wherever it's shown, on the OVR badges' ramp
 * (gold > purple > blue > green > light grey > grey): 85+ elite (gold), 75+ strong (blue), 64+
 * solid (green), under 64 weak (grey). Tables colour the figure, the player page its bar.
 */
export function ratingTone(v: number): 'elite' | 'good' | 'ok' | 'weak' {
  return v >= 85 ? 'elite' : v >= 75 ? 'good' : v >= 64 ? 'ok' : 'weak';
}
/** A band's colour, the same for a table's figure and a bar: the OVR tiers' gold, blue and green, grey under 64. */
export const RATING_COLOR: Record<ReturnType<typeof ratingTone>, string> = {
  elite: 'var(--tier-elite)',
  good: 'var(--tier-good)',
  ok: 'var(--tier-avg)',
  weak: 'var(--text-dim)',
};

/** OVR, POT and the attribute columns for rows that are (or carry) a player. */
export function ratingCols<T>(player: (r: T) => Player): Col<T>[] {
  return [
    { key: 'ovr', label: 'OVR', help: 'Overall rating', get: (r) => player(r).ovr, fmt: (v) => <Ovr v={v as number} size="sm" /> },
    { key: 'pot', label: 'POT', help: 'Potential', get: (r) => player(r).pot },
    ...ATTRS.map((a) => ({
      key: a.key,
      label: a.short,
      help: a.label,
      get: (r: T) => attrDisplay(player(r).ratings[a.key]),
      fmt: (v: number | string) => <span style={{ color: RATING_COLOR[ratingTone(v as number)] }}>{v}</span>,
    })),
  ];
}

/** The bands in their colours, one line: "Ratings 85+ 75+ 64+ under 64", or with `named` their names ("85+ elite · 75+ strong ..."). */
export function RatingBands({ named = false }: { named?: boolean }) {
  const bands = [
    ['elite', '85+', 'elite'],
    ['good', '75+', 'strong'],
    ['ok', '64+', 'solid'],
    ['weak', 'under 64', 'weak'],
  ] as const;
  return (
    <span>
      {named ? '' : 'Ratings '}
      {bands.map(([tone, text, name], i) => (
        <span key={tone}>
          {i > 0 ? (named ? ' · ' : ' ') : ''}
          <b style={{ color: RATING_COLOR[tone] }}>{text}</b>
          {named ? ` ${name}` : ''}
        </span>
      ))}
    </span>
  );
}

/** What a ratings table's colours and column names mean: the bands in one line, the names behind its "?". */
export function RatingKey() {
  return (
    <span className="ok-rkey">
      <RatingBands />
      <Help title="Rating columns">
        <p>Every rating is on the 40-99 scale the player page shows: 85+ is elite, 75+ strong, 64+ solid, under 64 weak. Tap a column to sort by it.</p>
        <ul className="ok-rkey-list">
          {ATTRS.map((a) => (
            <li key={a.key}>
              <b>{a.short}</b> {a.label}
            </li>
          ))}
        </ul>
      </Help>
    </span>
  );
}
