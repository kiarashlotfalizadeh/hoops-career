// The tactics board's geometry: where the five stand in each offensive shape (in possession) and in
// each defensive scheme (out of possession), and who takes which spot. The court is drawn 100 units
// across and 84 up from the baseline (the arc's top at 58). A name plate is about a third of the
// court wide and a fifth of it high, so any two spots of one formation sit a plate's width (35)
// across or its height (18) apart, and the plates never cover each other.
import type { DefRole, DefScheme, OffRole, OffShape } from '../../core/types';

/** The board's height in court units. */
export const BOARD_H = 84;

/** What a spot asks of who stands there: the ball, a wing, a corner, a big's spot, a chaser's, the back line... */
export type SpotKind = 'ball' | 'wing' | 'corner' | 'big' | 'chase' | 'anchor' | 'back' | 'top';

export interface Spot {
  x: number;
  y: number;
  kind: SpotKind;
  /** The spot's name, for a screen reader: "left wing", "right elbow". */
  name: string;
}

const s = (x: number, y: number, kind: SpotKind, name: string): Spot => ({ x, y, kind, name });

/** In possession: each shape's five spots. */
export const OFF_SPOTS: Record<OffShape, Spot[]> = {
  fourOut: [
    s(50, 71, 'ball', 'top of the key'),
    s(15, 40, 'wing', 'left wing'),
    s(85, 40, 'wing', 'right wing'),
    s(85, 9, 'corner', 'right corner'),
    s(32, 12, 'big', 'dunker spot'),
  ],
  fiveOut: [
    s(50, 71, 'ball', 'top of the key'),
    s(15, 45, 'wing', 'left wing'),
    s(85, 45, 'wing', 'right wing'),
    s(15, 9, 'corner', 'left corner'),
    s(85, 9, 'corner', 'right corner'),
  ],
  horns: [
    s(50, 71, 'ball', 'top of the key'),
    s(30, 37, 'big', 'left elbow'),
    s(70, 37, 'big', 'right elbow'),
    s(12, 9, 'corner', 'left corner'),
    s(88, 9, 'corner', 'right corner'),
  ],
  twoIn: [s(50, 71, 'ball', 'top of the key'), s(15, 45, 'wing', 'left wing'), s(85, 45, 'wing', 'right wing'), s(30, 14, 'big', 'left block'), s(70, 14, 'big', 'right block')],
};

/** Out of possession: each scheme's five spots. */
export const DEF_SPOTS: Record<DefScheme, Spot[]> = {
  man: [s(50, 63, 'ball', 'on the ball'), s(15, 38, 'wing', 'left wing'), s(85, 38, 'wing', 'right wing'), s(50, 14, 'anchor', 'in the paint'), s(14, 9, 'back', 'help side')],
  zone23: [s(30, 50, 'top', 'top left'), s(70, 50, 'top', 'top right'), s(15, 14, 'back', 'left low'), s(50, 12, 'anchor', 'middle'), s(85, 14, 'back', 'right low')],
  zone32: [s(50, 66, 'top', 'point'), s(15, 42, 'wing', 'left wing'), s(85, 42, 'wing', 'right wing'), s(30, 12, 'back', 'left low'), s(70, 12, 'anchor', 'right low')],
  box1: [s(50, 70, 'chase', 'chaser'), s(30, 44, 'top', 'top left'), s(70, 44, 'top', 'top right'), s(30, 12, 'anchor', 'left low'), s(70, 12, 'back', 'right low')],
  tri2: [s(17, 66, 'chase', 'chaser'), s(83, 66, 'chase', 'chaser'), s(50, 42, 'top', 'point of the triangle'), s(25, 12, 'anchor', 'left low'), s(75, 12, 'back', 'right low')],
};

/** What the board knows of a player when it places him. */
export interface BoardPlayer {
  pid: number;
  /** His height rating (0-100). */
  hgt: number;
  /** His offensive role (in possession) or defensive one (out of possession). */
  role: OffRole | DefRole;
  /** How well he handles the ball and shoots (0-100 each). */
  handle: number;
  shoot: number;
}

const BALL_ROLES: string[] = ['creator', 'playmaker'];
const BIG_ROLES: string[] = ['roller', 'post', 'stretch', 'hub'];
const CORNER_ROLES: string[] = ['shooter', 'glue'];

/** How much a player belongs at a spot of a kind (higher: more). */
function claim(kind: SpotKind, p: BoardPlayer): number {
  const r = p.role as string;
  switch (kind) {
    case 'ball':
      return (BALL_ROLES.includes(r) || r === 'poa' ? 100 : r === 'scorer' ? 40 : 0) + p.handle - (r === 'anchor' ? 200 : 0) + (100 - p.hgt) / 4;
    case 'big':
      return (BIG_ROLES.includes(r) ? 100 : 0) + p.hgt;
    case 'anchor':
      return (r === 'anchor' ? 200 : 0) + p.hgt - (r === 'poa' || r === 'chase' ? 200 : 0);
    case 'back':
      return p.hgt - (r === 'poa' ? 100 : 0);
    case 'chase':
      return (r === 'poa' || r === 'stopper' ? 100 : 0) - p.hgt / 2;
    case 'corner':
      return (CORNER_ROLES.includes(r) ? 60 : 0) + p.shoot;
    case 'wing':
    case 'top':
      return (r === 'stopper' || r === 'scorer' || r === 'slasher' ? 30 : 0) + (100 - p.hgt) / 4;
  }
}

/** The order spots are filled in: the ones that matter most first, so the right player takes them. */
const FILL: SpotKind[] = ['chase', 'anchor', 'ball', 'big', 'back', 'corner', 'top', 'wing'];

/**
 * Where each of (up to) five players stands in a formation: each spot, in FILL's order, goes to the
 * player left who belongs there most. Returns each player's spot by pid.
 */
export function place(spots: Spot[], five: BoardPlayer[]): Map<number, Spot> {
  const out = new Map<number, Spot>();
  const left = [...five];
  const order = [...spots].sort((a, b) => FILL.indexOf(a.kind) - FILL.indexOf(b.kind));
  for (const spot of order) {
    if (!left.length) break;
    let best = 0;
    for (let i = 1; i < left.length; i++) if (claim(spot.kind, left[i]) > claim(spot.kind, left[best])) best = i;
    out.set(left[best].pid, spot);
    left.splice(best, 1);
  }
  return out;
}

/** A familiarity figure's tone: 80 and up good, 60 to 80 a warning, below that bad. */
export const famTone = (v: number): 'good' | 'warn' | 'bad' => (v >= 80 ? 'good' : v >= 60 ? 'warn' : 'bad');

/** A shape's fit as the board shows it: fit points are a tenth of a point a game ("+0.8", "−1.2", "±0"). */
export function fitPts(v: number): string {
  const x = Math.round(v) / 10;
  if (Math.abs(x) < 0.05) return '±0';
  return `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
}
