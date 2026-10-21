// The Tactics screen's reading of partnerships and grades: the five and the bench in the rotation's
// order, the system report's strengths and weaknesses for the hero, and how the board draws a link
// (its weight and ink from what the engine plays it at). Pure.
import type { Quality, SystemReport } from '../../core/analysis/system';
import { LINK_META, linkState, type Link } from '../../core/sim/links';
import { BOARD_H } from './formation';

/** The five (the rotation's first five) and the bench after them; anyone the rotation leaves out goes last. */
export function startersOf<P extends { pid: number }>(order: readonly number[], players: readonly P[]): { five: P[]; bench: P[] } {
  const byId = new Map(players.map((p) => [p.pid, p]));
  const all = [...order.map((pid) => byId.get(pid)).filter((p): p is P => !!p), ...players.filter((p) => !order.includes(p.pid))];
  return { five: all.slice(0, 5), bench: all.slice(5) };
}

/** The report's best `n` and worst `n` qualities at either end, by where they rank in the league (the best first, the worst first). */
export function strengthsOf(r: SystemReport, n = 2): { strengths: Quality[]; weaknesses: Quality[] } {
  const all = [...r.off, ...r.def];
  const best = [...all].sort((a, b) => a.rank - b.rank);
  const strengths = best.slice(0, n);
  const weaknesses = [...all]
    .sort((a, b) => b.rank - a.rank)
    .filter((q) => !strengths.includes(q))
    .slice(0, n);
  return { strengths, weaknesses };
}

/** A link's state word as a tag's tone: strong reads green, building amber, weak red. */
export const linkTone = (l: Link): 'good' | 'warn' | 'bad' | undefined => {
  const w = linkState(l).word;
  return w === 'Strong' ? 'good' : w === 'Building' ? 'warn' : w === 'Weak' ? 'bad' : undefined;
};

/** A link's key, for the board's highlight and React. */
export const linkKey = (l: Pick<Link, 'id' | 'a' | 'b'>) => `${l.id}:${l.a}-${l.b}`;

/** The links the board shows on a side: the offense's in possession, the defense's out of it. */
export const linksOnSide = (links: Link[], side: 'in' | 'out') => links.filter((l) => LINK_META[l.id].end === (side === 'in' ? 'off' : 'def'));

/** How the board draws a link: heavier and darker the more of it the engine plays; a dashed hairline when it plays at little. */
export function linkLine(strength: number): { width: number; opacity: number; dashed: boolean } {
  const s = Math.max(0, Math.min(1, strength));
  return { width: +(0.5 + 1.3 * s).toFixed(2), opacity: +(0.4 + 0.55 * s).toFixed(2), dashed: s < 0.25 };
}

/** Where a plate's centre sits on the court (in court units): its spot, kept a half plate in from the edges as the CSS keeps it. */
export const plateAt = (spot: { x: number; y: number }) => ({ x: Math.max(16.5, Math.min(83.5, spot.x)), y: Math.max(8.5, Math.min(BOARD_H - 8.5, spot.y)) });
