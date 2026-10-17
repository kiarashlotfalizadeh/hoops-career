import { useId } from 'react';

/** The app's mark (public/icon.svg's artwork without its tile): the coach's chalk, an X and a play swept into the ball. */
export function BrandMark({ size = 96 }: { size?: number }) {
  // ids unique per instance: two marks on a page mustn't share a gradient or a clip
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="60 60 452 452" aria-hidden="true" style={{ flex: 'none' }}>
      <defs>
        <linearGradient id={`${id}b`} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
          <stop offset="0" stopColor="#ff9845" />
          <stop offset="1" stopColor="#ec5c0a" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <circle cx="318" cy="318" r="176" />
        </clipPath>
      </defs>
      <circle cx="318" cy="318" r="176" fill={`url(#${id}b)`} />
      <g clipPath={`url(#${id}c)`} fill="none" stroke="#2a1305" strokeWidth="13" strokeLinecap="round">
        <path d="M142 318 H494" />
        <path d="M318 142 V494" />
        <path d="M196 196 Q272 318 196 440" />
        <path d="M440 196 Q364 318 440 440" />
      </g>
      <g fill="none" stroke="#f2f5f9" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round">
        <path d="M96 96 L156 156 M156 96 L96 156" />
        <path d="M128 214 C 132 296, 168 334, 226 344" />
        <path d="M196 312 L232 346 L190 372" />
      </g>
    </svg>
  );
}
