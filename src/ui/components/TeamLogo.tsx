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
  // a small mark (a row's, a board's) carries a heavier ring and bigger letters: at 18-24px the
  // regular ones thin out to a hairline and a smudge
  const small = size <= 24;
  const sw = small ? 6 : 4.5;
  // where the letters sit and how big, by shape: a shield's weight is above its middle, a diamond
  // and a hexagon are narrower across than a roundel
  let body: JSX.Element;
  let cy = 50;
  let fs = 31;
  switch (shape) {
    case 'shield':
      body = <path d="M50 5 L90 15.5 L87 57 Q83.5 81 50 95 Q16.5 81 13 57 L10 15.5 Z" fill={c1} stroke={ring} strokeWidth={sw} strokeLinejoin="round" />;
      cy = 46.5;
      break;
    case 'hex':
      body = <polygon points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5" fill={c1} stroke={ring} strokeWidth={sw} strokeLinejoin="round" />;
      fs = 30;
      break;
    case 'diamond':
      body = <rect x="18" y="18" width="64" height="64" rx="7" transform="rotate(45 50 50)" fill={c1} stroke={ring} strokeWidth={sw} />;
      fs = 28;
      break;
    case 'round-square':
      body = <rect x="8" y="8" width="84" height="84" rx="18" fill={c1} stroke={ring} strokeWidth={sw} />;
      fs = 33;
      break;
    default:
      body = <circle cx="50" cy="50" r="44" fill={c1} stroke={ring} strokeWidth={sw} />;
  }
  if (text.length < 3) fs += 6;
  if (small) fs += 2;
  // (Archivo's capitals stand 0.69em tall: the baseline that centres them on `cy`)
  const base = cy + fs * 0.345;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': ab })} style={{ flex: 'none' }}>
      {body}
      <text
        x="50"
        y={base.toFixed(1)}
        textAnchor="middle"
        fontFamily="Archivo Variable, sans-serif"
        fontWeight="860"
        style={{ fontStretch: '74%' }}
        fontSize={fs}
        fill={ink}
        letterSpacing={small ? 0 : 0.5}
      >
        {text}
      </text>
    </svg>
  );
}
