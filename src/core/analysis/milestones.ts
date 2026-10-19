// Career milestones: round career totals a player reaches (points, rebounds, assists). Only careers
// the game has whole are counted: a player's stored stats begin with his first NBA season (a real
// league seeded with every season since 2003-04 has its veterans' whole careers; one seeded with only
// their last three seasons doesn't, so none of their milestones are claimed). Regular-season games
// only, as the NBA counts them.

import type { BoxLine, GameResult, League, Player } from '../types';

export type MilestoneStat = 'pts' | 'reb' | 'ast';

export const STAT_WORD: Record<MilestoneStat, [string, string]> = { pts: ['point', 'points'], reb: ['rebound', 'rebounds'], ast: ['assist', 'assists'] };

/** Career regular-season totals from the stored stats (real seasons included). */
export function careerTotals(p: Player): Record<MilestoneStat, number> & { gp: number } {
  const t = { pts: 0, reb: 0, ast: 0, gp: 0 };
  for (const s of p.stats) {
    if (s.playoffs) continue;
    t.pts += s.pts;
    t.reb += s.orb + s.drb;
    t.ast += s.ast;
    t.gp += s.gp;
  }
  return t;
}

/**
 * Whether his whole career is in the stored stats: every NBA season he has completed (experience)
 * is on record, or his real seasons reach back to his first (realCareerOnRecord: a season lost to
 * injury or played overseas leaves a gap, not a hole). A fictional league's veterans start with no
 * seasons, and a real veteran's record in a league seeded with only his last three starts there, so
 * their career totals stay unknown.
 */
export function careerOnRecord(league: League, p: Player): boolean {
  const seasons = new Set<number>();
  for (const s of p.stats) if (!s.playoffs && s.gp > 0 && s.season < league.season) seasons.add(s.season);
  return seasons.size >= p.experience || realCareerOnRecord(league, p);
}

/**
 * A real player's seasons reach back to his first NBA season: the league was seeded with every real
 * season since `careersFrom` (League.careersFrom) and his first came after it, or he was drafted too
 * late to have played before it (LeBron James's first is that one: drafted in 2003).
 */
export function realCareerOnRecord(league: League, p: Player): boolean {
  const from = league.careersFrom;
  if (from === undefined || !p.real) return false;
  let first = Infinity;
  for (const s of p.stats) if (s.real && !s.playoffs && s.gp > 0) first = Math.min(first, s.season);
  return first < Infinity && (first > from || (p.draft.year > 0 && p.draft.year + 1 >= from));
}

/** Round career marks (every thousand) that `before` → `after` crossed, lowest first. */
export function marksCrossed(before: number, after: number, step = 1000): number[] {
  const out: number[] = [];
  for (let m = (Math.floor(before / step) + 1) * step; m <= after; m += step) out.push(m);
  return out;
}

/**
 * Marks big enough for the league's news: every 5,000 points; 5,000 rebounds or assists and every
 * 2,500 after. (The round thousands in between are noted in the user's own recap.)
 */
export function newsworthy(stat: MilestoneStat, mark: number): boolean {
  return stat === 'pts' ? mark % 5000 === 0 : mark >= 5000 && mark % 2500 === 0;
}

/** "10,000th career point". */
export function markText(stat: MilestoneStat, mark: number) {
  return `${mark.toLocaleString('en-US')}th career ${STAT_WORD[stat][0]}`;
}

const lineStat = (b: Pick<BoxLine, 'pts' | 'orb' | 'drb' | 'ast'>, stat: MilestoneStat) => (stat === 'pts' ? b.pts : stat === 'reb' ? b.orb + b.drb : b.ast);

export interface Milestone {
  pid: number;
  tid: number;
  stat: MilestoneStat;
  mark: number;
}

/**
 * The round career marks players reached in a game of this season (regular season only), from the
 * stored results: a player's total after it is his career total now less his regular-season games
 * since (every game of the season is stored). Players whose careers aren't whole are left out.
 */
export function milestonesIn(league: League, res: GameResult): Milestone[] {
  if (res.type !== 'regular' || res.season !== league.season) return [];
  const out: Milestone[] = [];
  const lines = [...res.home.players, ...res.away.players].filter((b) => b.min > 0 && league.players[b.pid] && careerOnRecord(league, league.players[b.pid]));
  if (!lines.length) return out;
  // what each of them has added since (his games on later days: a player plays once a day)
  const since = new Map(lines.map((b) => [b.pid, { pts: 0, reb: 0, ast: 0 }]));
  for (const g of league.games) {
    if (g.season !== res.season || g.type !== 'regular' || g.day <= res.day) continue;
    for (const x of [g.home.players, g.away.players].flat()) {
      const s = since.get(x.pid);
      if (s) for (const stat of ['pts', 'reb', 'ast'] as const) s[stat] += lineStat(x, stat);
    }
  }
  for (const b of lines) {
    const now = careerTotals(league.players[b.pid]);
    const tid = res.home.players.includes(b) ? res.home.tid : res.away.tid;
    for (const stat of ['pts', 'reb', 'ast'] as const) {
      const after = now[stat] - since.get(b.pid)![stat];
      // the round thousands, and the marks between them that make the league's news (7,500 rebounds)
      for (const mark of marksCrossed(after - lineStat(b, stat), after, 500)) if (mark % 1000 === 0 || newsworthy(stat, mark)) out.push({ pid: b.pid, tid, stat, mark });
    }
  }
  return out;
}
