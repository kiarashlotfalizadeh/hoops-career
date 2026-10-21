// The press's voice: names as a beat writer uses them, figures as sentences, and phrasing chosen
// from many on the world's own random stream, never the same shape twice running (see world.ts).
import type { BoxLine, League, NewsItem, Player, TeamSeason } from '../../types';
import type { Rng } from '../../random';
import { addNews, curTeamSeason, playerName, seasonTotals, shortName } from '../helpers';
import type { MediaState } from '../media';

/** Phrasings the press remembers having used lately, so the next headline reaches for another. */
const RECENT = 40;

export const confName = (c: 'E' | 'W') => (c === 'E' ? 'East' : 'West');

/** "Knicks". */
export const nick = (league: League, tid: number) => league.teams[tid].name;

/** "the Knicks". */
export const the = (league: League, tid: number) => `the ${league.teams[tid].name}`;

/** "New York Knicks". */
export const full = (league: League, tid: number) => `${league.teams[tid].region} ${league.teams[tid].name}`;

/** "the Knicks'", "the Magic's", "Brunson's": a name in the possessive. */
export const poss = (name: string) => `${name}${name.endsWith('s') ? "'" : "'s"}`;

/** "31-12". */
export const rec = (w: number, l: number) => `${w}-${l}`;

export const recOf = (ts: TeamSeason) => rec(ts.won, ts.lost);

/** A figure with its sign, a true minus for a negative: "+4.2", "−3.1". */
export function signed(x: number, d = 1): string {
  const v = x.toFixed(d);
  if (Number(v) === 0) return (0).toFixed(d);
  return x > 0 ? `+${v}` : `−${v.replace('-', '')}`;
}

/** Last name, or the full name when a teammate shares it. */
export const last = (league: League, p: Player) => shortName(league, p);

export const name = (p: Player) => playerName(p);

/** "7-3 in their last 10" from a team season's last ten. */
export function lastTen(ts: TeamSeason): { w: number; l: number } {
  const w = ts.lastTen.reduce((a, x) => a + x, 0);
  return { w, l: ts.lastTen.length - w };
}

/** Net rating per 100 possessions this season (0 before a game). */
export function netOf(ts: TeamSeason): number {
  return ts.poss > 0 && ts.oppPoss > 0 ? (ts.ptsFor / ts.poss) * 100 - (ts.ptsAgainst / ts.oppPoss) * 100 : 0;
}

export const rebOf = (b: Pick<BoxLine, 'orb' | 'drb'>) => b.orb + b.drb;

/** A night's line in words, only what stands out: "38 points, 11 rebounds and 7 assists". */
export function nightLine(b: BoxLine): string {
  const parts = [`${b.pts} point${b.pts === 1 ? '' : 's'}`];
  const reb = rebOf(b);
  if (reb >= 8) parts.push(`${reb} rebounds`);
  if (b.ast >= 7) parts.push(`${b.ast} assists`);
  if (b.stl >= 4) parts.push(`${b.stl} steals`);
  if (b.blk >= 4) parts.push(`${b.blk} blocks`);
  return list(parts);
}

/** "A", "A and B", "A, B and C". */
export function list(items: string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : (items[0] ?? '');
}

/** A season's per-game points, rebounds and assists so far (null before a game). */
export function perGame(p: Player, season: number): { gp: number; pts: number; reb: number; ast: number } | null {
  const s = seasonTotals(p, season, false);
  if (!s || !s.gp) return null;
  return { gp: s.gp, pts: s.pts / s.gp, reb: (s.orb + s.drb) / s.gp, ast: s.ast / s.gp };
}

export const f1 = (x: number) => x.toFixed(1);

/** The current season of a team. */
export const tsOf = (league: League, tid: number) => curTeamSeason(league, tid);

/** A team's best player by OVR, healthy or not. */
export function bestPlayer(league: League, tid: number, healthy = false): Player | undefined {
  let best: Player | undefined;
  for (const p of Object.values(league.players)) {
    if (p.tid !== tid || (healthy && p.injury)) continue;
    if (!best || p.ovr > best.ovr || (p.ovr === best.ovr && p.pid < best.pid)) best = p;
  }
  return best;
}

/** Every team's players, read in one pass over the league. */
export function rosters(league: League): Player[][] {
  const out: Player[][] = league.teams.map(() => []);
  for (const p of Object.values(league.players)) if (p.tid >= 0 && out[p.tid]) out[p.tid].push(p);
  for (const r of out) r.sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
  return out;
}

/** Whether a story is about the user's team: it names the team, or one of its players. */
export function aboutUser(league: League, n: Pick<NewsItem, 'tids' | 'pids'>): boolean {
  return n.tids.includes(league.userTid) || n.pids.some((pid) => league.players[pid]?.tid === league.userTid);
}

/**
 * The press's phrasing for one occasion: `say` picks one of several ways to put a thing, on the
 * occasion's own stream, passing over the ones it used lately (remembered in the media state), so
 * the same headline shape doesn't come round twice in a row.
 */
export class Voice {
  constructor(
    readonly rng: Rng,
    private readonly media: MediaState,
  ) {}

  /** One of `options` for situation `key`, avoiding the ones used lately. */
  say(key: string, options: readonly string[]): string {
    if (!options.length) return '';
    const recent = (this.media.recent ??= []);
    const fresh = options.map((_, i) => i).filter((i) => !recent.includes(`${key}:${i}`));
    const pool = fresh.length ? fresh : options.map((_, i) => i);
    const i = pool[Math.floor(this.rng.next() * pool.length)];
    recent.push(`${key}:${i}`);
    if (recent.length > RECENT) recent.splice(0, recent.length - RECENT);
    return options[i];
  }

  /** A plain pick, not remembered (fillers inside a sentence). */
  pick<T>(options: readonly T[]): T {
    return options[Math.floor(this.rng.next() * options.length)];
  }
}

/** A press story: a headline, the line under it (`dek`), a body and how big it is. */
export interface Story {
  kind: NewsItem['kind'];
  /** None for a brief. */
  head?: string;
  dek: string;
  body?: string[];
  tids: number[];
  pids: number[];
  weight: 1 | 2 | 3;
}

/** Put a story in the news (a body's paragraphs separated by blank lines). */
export function publish(league: League, s: Story): NewsItem {
  addNews(league, {
    kind: s.kind,
    ...(s.head ? { head: s.head } : {}),
    text: s.dek,
    ...(s.body?.length ? { body: s.body.filter(Boolean).join('\n\n') } : {}),
    tids: [...new Set(s.tids)],
    pids: [...new Set(s.pids)],
    weight: s.weight,
  });
  return league.news[league.news.length - 1];
}

/** "1st" ... for ranks in copy. */
export function nth(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Letter grades, best first, and the one a score earns (score: about −1 to +1). */
export const GRADES = ['A+', 'A', 'A−', 'B+', 'B', 'B−', 'C+', 'C', 'C−', 'D+', 'D', 'F'] as const;
export type Grade = (typeof GRADES)[number];

export function gradeFor(score: number): Grade {
  const cuts = [0.55, 0.38, 0.25, 0.14, 0.05, -0.04, -0.12, -0.2, -0.3, -0.4, -0.52];
  const i = cuts.findIndex((c) => score >= c);
  return GRADES[i < 0 ? GRADES.length - 1 : i];
}

/** "an A", "a B+": the article a grade takes. */
export const aGrade = (g: Grade) => (g.startsWith('A') || g.startsWith('F') ? `an ${g}` : `a ${g}`);
