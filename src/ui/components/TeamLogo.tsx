import { createContext, useContext } from 'react';
import { FRANCHISES } from '../../core/teams';
import { useStore } from '../../state/store';
import { inkOn } from '../teamColors';

/** True inside a league's screens: marks and avatars there wear its teams' abbreviations and colours (god mode can change them). */
export const LeagueLook = createContext(false);

/** A team's abbreviation and colours as the open league has them, inside its screens (undefined elsewhere: the franchise's are used). */
export function useTeamLook(tid: number): { abbrev?: string; colors?: [string, string, string] } {
  const inLeague = useContext(LeagueLook);
  const abbrev = useStore((s) => (inLeague ? s.league?.teams[tid]?.abbrev : undefined));
  const colors = useStore((s) => (inLeague ? s.league?.teams[tid]?.colors : undefined));
  return { abbrev, colors };
}

// Original monogram marks generated from franchise colors (no trademarked artwork). `decorative`: the
// team's name is shown next to it, so screen readers skip the mark instead of reading the name twice.
export function TeamLogo({ tid, size = 36, abbrev, colors, decorative }: { tid: number; size?: number; abbrev?: string; colors?: [string, string, string]; decorative?: boolean }) {
  const f = FRANCHISES[tid];
  const look = useTeamLook(tid);
  const ab = abbrev ?? look.abbrev ?? f?.abbrev ?? '???';
  const [c1, c2, c3] = colors ?? look.colors ?? f?.colors ?? ['#334155', '#94a3b8', '#ffffff'];
  const shape = f?.mark ?? 'circle';
  const text = ab.length > 3 ? ab.slice(0, 3) : ab;
  const ink = inkOn(c1);
  const ring = c2.toLowerCase() === c1.toLowerCase() ? c3 : c2;
  let body: JSX.Element;
  switch (shape) {
    case 'shield':
      body = <path d="M50 4 L92 16 L88 58 Q84 82 50 96 Q16 82 12 58 L8 16 Z" fill={c1} stroke={ring} strokeWidth="6" />;
      break;
    case 'hex':
      body = <polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill={c1} stroke={ring} strokeWidth="6" />;
      break;
    case 'diamond':
      body = <rect x="17" y="17" width="66" height="66" rx="10" transform="rotate(45 50 50)" fill={c1} stroke={ring} strokeWidth="6" />;
      break;
    case 'round-square':
      body = <rect x="7" y="7" width="86" height="86" rx="24" fill={c1} stroke={ring} strokeWidth="6" />;
      break;
    default:
      body = <circle cx="50" cy="50" r="44" fill={c1} stroke={ring} strokeWidth="6" />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': ab })} style={{ flex: 'none' }}>
      {body}
      <path d="M22 62 Q50 40 78 62" fill="none" stroke={ring} strokeOpacity="0.35" strokeWidth="3" />
      <text x="50" y="58" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="800" fontSize={text.length === 3 ? 30 : 36} fill={ink} letterSpacing="1">
        {text}
      </text>
    </svg>
  );
}
