// The development watch's marks, wherever a player shows: an arrow with his change this season
// (OVR or a rating) and the tag a roster row carries (Breakout, Rising, Prospect, Declining). The
// numbers come from core/league/devWatch.ts; this file only draws them.
import type { DevTag } from '../../core/league/devWatch';
import './growth.css';

/** "+3" or "−2" with a true minus. */
export const signedInt = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

/**
 * A change as an arrow and its size: green up, red down, nothing for no change. `since` names what
 * it's measured from for a screen reader ("since last season").
 */
export function DevDelta({ d, since, size = 'sm' }: { d: number; since?: string; size?: 'sm' | 'md' }) {
  if (!d) return null;
  const px = size === 'md' ? 10 : 8;
  return (
    <span className={`dv-d ${size} ${d > 0 ? 'up' : 'down'}`}>
      {/* a solid wedge: a stroked arrow this small prints as a smudge */}
      <svg width={px} height={px} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <path d={d > 0 ? 'M5 1.2 9.4 8.6H.6z' : 'M5 8.8.6 1.4h8.8z'} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      </svg>
      <span aria-hidden="true">{Math.abs(d)}</span>
      <span className="sr-only">
        {d > 0 ? 'up' : 'down'} {Math.abs(d)}
        {since ? ` ${since}` : ''}
      </span>
    </span>
  );
}

/** What each tag says, for its title and the roster's key. */
export const TAG_HELP: Record<DevTag, string> = {
  Breakout: 'Well past what his age alone would add this season',
  Rising: 'Young and up 4 or more this season',
  Prospect: '22 or younger with 8 or more to go to his potential',
  Declining: '30 or older and down 4 or more this season',
};

/** A development tag, quiet: only a breakout carries colour. */
export function DevTagChip({ tag }: { tag: DevTag }) {
  return (
    <span className={`tag dv-tag ${tag === 'Breakout' ? 'good' : ''}`} title={TAG_HELP[tag]}>
      {tag}
    </span>
  );
}
