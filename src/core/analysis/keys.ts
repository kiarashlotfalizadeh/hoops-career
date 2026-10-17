// Keys to the game: three things to win tonight, each a number to hit, read from what both teams
// have done this season (what they do best to take away, what they give up to go after, the player
// they run their offense through). The pre-game screen sets them, the live game tracks them at the
// breaks and in the huddle, and the result keeps how each one went.
//
// They come only from games played before tonight's date: the preview (before the day's other
// games), the live game (after them) and the result (recorded later still) all read the same keys.

import type { GameResult, KeyGrade, KeyStat, League, ScheduledGame, TeamBox, TeamTotals } from '../types';
import { playerName } from '../league/helpers';

export interface GameKey {
  id: string;
  /** What to do, in a few words: "Keep them off the glass". */
  title: string;
  /** The number: "Hold BOS to 10 offensive rebounds or fewer". */
  goal: string;
  /** What the numbers say: "They grab 12.4 offensive rebounds a game, 3rd in the league". */
  why: string;
  /** Whose number it is. */
  side: 'us' | 'them';
  stat: KeyStat;
  /** For a player's points: whose. */
  pid?: number;
  /** 'max': at most the target; 'min': at least it. */
  dir: 'max' | 'min';
  target: number;
}

/**
 * The offensive glass is read as a share of the misses (a team that misses more gets more chances,
 * so a count would grow as it loses); every other number is a count for the game.
 */
export const isRate = (stat: KeyStat) => stat === 'orb';

/** Games a team needs before its own numbers are read (otherwise last season's, or what its coach and roster suggest). */
const MIN_GAMES = 5;

/** League per-team-game numbers to fall back on with no games to read (the engine plays to the 2025-26 NBA's). */
const LEAGUE_DEFAULT: Record<Exclude<KeyStat, 'pts'>, number> = { orb: 27, tov: 14.2, tpm: 13.5, fta: 21.7, fastBreak: 14.5, paint: 48, ast: 27 };

const STAT_WORDS: Record<KeyStat, [string, string]> = {
  orb: ['offensive rebound', 'offensive rebounds'],
  tov: ['turnover', 'turnovers'],
  tpm: ['three', 'threes'],
  fta: ['free-throw attempt', 'free-throw attempts'],
  fastBreak: ['fast-break point', 'fast-break points'],
  paint: ['point in the paint', 'points in the paint'],
  ast: ['assist', 'assists'],
  pts: ['point', 'points'],
};

const plural = (n: number, stat: KeyStat) => `${n} ${STAT_WORDS[stat][n === 1 ? 0 : 1]}`;

/** A team's number in one box score (`other`: the other team's, for a share of the misses). */
function boxStat(b: TeamBox, stat: Exclude<KeyStat, 'pts'>, other: TeamBox): number {
  switch (stat) {
    case 'orb': {
      const chances = b.t.orb + other.t.drb;
      return chances ? (100 * b.t.orb) / chances : 0;
    }
    case 'fastBreak':
      return b.extra.fastBreak;
    case 'paint':
      return b.extra.paint;
    default:
      return b.t[stat];
  }
}

/** The goal for a share of the misses: "Hold BOS to 27% of their misses or fewer", "Grab 30% of your misses". */
const glassGoal = (dir: 'max' | 'min', who: string, target: number) => (dir === 'max' ? `Hold ${who} to ${target}% of their misses or fewer` : `Grab ${target}% of your misses`);

const TEAM_STATS: Exclude<KeyStat, 'pts'>[] = ['orb', 'tov', 'tpm', 'fta', 'fastBreak', 'paint', 'ast'];

interface TeamAgg {
  gp: number;
  /** Per game: what the team did, and what its opponents did against it. */
  for: Record<string, number>;
  against: Record<string, number>;
}

interface SeasonAgg {
  season: number;
  teams: Map<number, TeamAgg>;
  /** Points per game by player, for the players of the team asked about. */
  scorers: Map<number, { pts: number; gp: number }>;
}

/** Per-game numbers from this season's regular-season games before `day`. */
function aggregate(league: League, season: number, day: number, scorersOf: number): SeasonAgg {
  const sums = new Map<number, { gp: number; for: Record<string, number>; against: Record<string, number> }>();
  const scorers = new Map<number, { pts: number; gp: number }>();
  const blank = () => Object.fromEntries(TEAM_STATS.map((k) => [k, 0]));
  for (const g of league.games) {
    if (g.season !== season || g.type !== 'regular' || g.day >= day) continue;
    for (const [me, them] of [
      [g.home, g.away],
      [g.away, g.home],
    ] as const) {
      const s = sums.get(me.tid) ?? { gp: 0, for: blank(), against: blank() };
      s.gp++;
      for (const k of TEAM_STATS) {
        s.for[k] += boxStat(me, k, them);
        s.against[k] += boxStat(them, k, me);
      }
      sums.set(me.tid, s);
      if (me.tid === scorersOf)
        for (const b of me.players) {
          if (b.min <= 0) continue;
          const sc = scorers.get(b.pid) ?? { pts: 0, gp: 0 };
          sc.pts += b.pts;
          sc.gp++;
          scorers.set(b.pid, sc);
        }
    }
  }
  const teams = new Map<number, TeamAgg>();
  for (const [tid, s] of sums) {
    const per = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v / s.gp]));
    teams.set(tid, { gp: s.gp, for: per(s.for), against: per(s.against) });
  }
  return { season, teams, scorers };
}

/**
 * Per-game numbers from a past season's team totals and season lines: its stored results keep only
 * the user's games (each opponent's meetings with him are no sample of its season), but every team's
 * totals stay. They don't split out the paint or fast breaks, so those aren't read from them.
 */
function totalsAgg(league: League, season: number, scorersOf: number): SeasonAgg {
  const teams = new Map<number, TeamAgg>();
  for (const t of league.teams) {
    const ts = t.seasons.find((s) => s.season === season);
    const gp = ts ? ts.won + ts.lost : 0;
    if (!ts || !gp) continue;
    const per = (a: TeamTotals, b: TeamTotals) => ({
      orb: a.orb + b.drb ? (100 * a.orb) / (a.orb + b.drb) : 0,
      tov: a.tov / gp,
      tpm: a.tpm / gp,
      fta: a.fta / gp,
      ast: a.ast / gp,
      fastBreak: NaN,
      paint: NaN,
    });
    teams.set(t.tid, { gp, for: per(ts.t, ts.o), against: per(ts.o, ts.t) });
  }
  const scorers = new Map<number, { pts: number; gp: number }>();
  for (const p of Object.values(league.players))
    for (const s of p.stats) if (s.season === season && s.tid === scorersOf && !s.playoffs && !s.real && s.gp > 0) scorers.set(p.pid, { pts: s.pts, gp: s.gp });
  return { season, teams, scorers };
}

const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;

interface Candidate extends GameKey {
  /** How strongly the numbers point at it (standard deviations from the league's teams). */
  z: number;
}

/**
 * Tonight's keys for the user's team in game `g`: up to three, the strongest signals first, never
 * two on the same number.
 */
export function gameKeys(league: League, g: ScheduledGame): GameKey[] {
  const us = league.userTid;
  if (g.home !== us && g.away !== us) return [];
  const them = g.home === us ? g.away : g.home;
  // this season's games before tonight; with too few, last season's totals; with none (a new league), the coach and the roster
  let agg = aggregate(league, league.season, g.day, them);
  const enough = (a: SeasonAgg) => (a.teams.get(us)?.gp ?? 0) >= MIN_GAMES && (a.teams.get(them)?.gp ?? 0) >= MIN_GAMES;
  if (!enough(agg)) {
    const prev = totalsAgg(league, league.season - 1, them);
    agg = enough(prev) ? prev : agg;
  }
  const cands = enough(agg) ? fromNumbers(league, agg, us, them) : fromPriors(league, them);
  const picked: GameKey[] = [];
  const stats = new Set<string>();
  for (const c of cands.sort((a, b) => b.z - a.z || a.id.localeCompare(b.id))) {
    if (picked.length >= 3) break;
    const k = `${c.side}:${c.stat}`;
    if (stats.has(k)) continue;
    stats.add(k);
    picked.push({ id: c.id, title: c.title, goal: c.goal, why: c.why, side: c.side, stat: c.stat, ...(c.pid !== undefined && { pid: c.pid }), dir: c.dir, target: c.target });
  }
  return picked;
}

/** Keys from the season's numbers: each team stat against the league's spread of teams. */
function fromNumbers(league: League, agg: SeasonAgg, us: number, them: number): Candidate[] {
  const U = agg.teams.get(us)!;
  const O = agg.teams.get(them)!;
  const abbrev = league.teams[them].abbrev;
  const all = [...agg.teams.values()];
  const n = all.length;
  const spread = (side: 'for' | 'against', k: string) => {
    const vs = all.map((t) => t[side][k]);
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, vs.length - 1)) || 1;
    return { mean, sd };
  };
  /** Rank of team `t`'s number among the league's (1 = the most). */
  const rank = (t: TeamAgg, side: 'for' | 'against', k: string) => 1 + all.filter((x) => x[side][k] > t[side][k]).length;
  const label = agg.season === league.season ? '' : ' last season';
  const out: Candidate[] = [];
  /**
   * A key on one team's number: `dir` max holds the other team to it, min goes and gets it.
   * `signal` is the opponent's number that makes it worth a key (its own, or what it allows).
   */
  const add = (
    id: string,
    title: string,
    side: 'us' | 'them',
    stat: Exclude<KeyStat, 'pts'>,
    dir: 'max' | 'min',
    signal: 'for' | 'against',
    why: (v: string, r: string) => string,
  ) => {
    const { mean, sd } = spread(signal, stat);
    const v = O[signal][stat];
    const z = (v - mean) / sd;
    // (a number last season's totals don't have isn't read)
    if (!(z >= 0.6)) return;
    // tonight's number if both play to form: the team's own and what the other one allows, halved
    const mine = side === 'us' ? U : O;
    const other = side === 'us' ? O : U;
    const expect = (mine.for[stat] + other.against[stat]) / 2;
    const target = dir === 'max' ? Math.max(0, Math.floor(expect)) : Math.ceil(expect);
    const who = side === 'us' ? 'your team' : abbrev;
    const goal = isRate(stat)
      ? glassGoal(dir, who, target)
      : dir === 'max'
        ? side === 'us'
          ? `Keep it to ${plural(target, stat)} or fewer`
          : `Hold ${who} to ${plural(target, stat)} or fewer`
        : `${side === 'us' ? 'Get' : 'Force'} ${plural(target, stat)}`;
    out.push({
      id,
      title,
      goal,
      why: why(v.toFixed(1), `${ord(rank(O, signal, stat))} of ${n}${label}`),
      side,
      stat,
      dir,
      target,
      z,
    });
  };
  // what they do best, to take away
  add('glass', 'Keep them off the glass', 'them', 'orb', 'max', 'for', (v, r) => `They rebound ${v}% of their misses, ${r}.`);
  add('arc', 'Run them off the line', 'them', 'tpm', 'max', 'for', (v, r) => `They make ${v} threes a game, ${r}.`);
  add('line', 'Defend without fouling', 'them', 'fta', 'max', 'for', (v, r) => `They shoot ${v} free throws a game, ${r}.`);
  add('getback', 'Get back in transition', 'them', 'fastBreak', 'max', 'for', (v, r) => `They score ${v} fast-break points a game, ${r}.`);
  add('paint', 'Protect the paint', 'them', 'paint', 'max', 'for', (v, r) => `They score ${v} points in the paint a game, ${r}.`);
  // what their defense does to teams, to beat or go after
  add('ball', 'Take care of the ball', 'us', 'tov', 'max', 'against', (v, r) => `Their defense forces ${v} turnovers a game, ${r}.`);
  add('crash', 'Crash the offensive glass', 'us', 'orb', 'min', 'against', (v, r) => `Teams rebound ${v}% of their misses against them, ${r}.`);
  add('attack', 'Get to the line', 'us', 'fta', 'min', 'against', (v, r) => `They put teams on the line ${v} times a game, ${r}.`);
  add('fly', 'Let it fly', 'us', 'tpm', 'min', 'against', (v, r) => `They give up ${v} threes a game, ${r}.`);
  // their own loose handling
  {
    const { mean, sd } = spread('for', 'tov');
    const z = (O.for.tov - mean) / sd;
    if (z >= 0.6) {
      const target = Math.ceil((O.for.tov + U.against.tov) / 2);
      out.push({
        id: 'pressure',
        title: 'Make them cough it up',
        goal: `Force ${plural(target, 'tov')}`,
        why: `They turn it over ${O.for.tov.toFixed(1)} times a game, ${ord(rank(O, 'for', 'tov'))} of ${n}${label}.`,
        side: 'them',
        stat: 'tov',
        dir: 'min',
        target,
        z,
      });
    }
  }
  // the player they run it through
  const star = [...agg.scorers.entries()]
    .filter(([pid, s]) => s.gp >= MIN_GAMES && league.players[pid]?.tid === them && !(league.players[pid]?.injury?.gamesRemaining ?? 0))
    .sort((a, b) => b[1].pts / b[1].gp - a[1].pts / a[1].gp)[0];
  if (star) {
    const ppg = star[1].pts / star[1].gp;
    if (ppg >= 20) {
      const p = league.players[star[0]];
      // a scorer's nights spread out above his average more than below it: a point and a half under it is about even money
      const target = Math.round(ppg - 1.5);
      out.push({
        id: 'star',
        title: `Make ${p.lastName} work`,
        goal: `Hold ${playerName(p)} to ${plural(target, 'pts')} or fewer`,
        why: label ? `He scored ${ppg.toFixed(1)} a game${label}, the most on his team.` : `He scores ${ppg.toFixed(1)} a game, the most on his team.`,
        side: 'them',
        stat: 'pts',
        pid: p.pid,
        dir: 'max',
        target,
        z: (ppg - 18) / 5,
      });
    }
  }
  // always something to play for: moving the ball
  out.push({
    id: 'share',
    title: 'Share the ball',
    goal: `Get ${plural(Math.ceil((U.for.ast + O.against.ast) / 2), 'ast')}`,
    why: `You average ${U.for.ast.toFixed(1)} assists a game; they allow ${O.against.ast.toFixed(1)}.`,
    side: 'us',
    stat: 'ast',
    dir: 'min',
    target: Math.ceil((U.for.ast + O.against.ast) / 2),
    z: 0.3,
  });
  return out;
}

/** Keys with no games to read (a new league's opening nights): what the other coach's tactics and his roster say. */
function fromPriors(league: League, them: number): Candidate[] {
  const t = league.teams[them].tactics;
  const abbrev = league.teams[them].abbrev;
  const D = LEAGUE_DEFAULT;
  const out: Candidate[] = [];
  const hold = (id: string, title: string, stat: Exclude<KeyStat, 'pts'>, why: string, z: number, by = 1.08) => {
    const target = Math.floor(D[stat] * by);
    out.push({
      id,
      title,
      goal: isRate(stat) ? glassGoal('max', abbrev, target) : `Hold ${abbrev} to ${plural(target, stat)} or fewer`,
      why,
      side: 'them',
      stat,
      dir: 'max',
      target,
      z,
    });
  };
  if (t.offense.crashBoards >= 60) hold('glass', 'Keep them off the glass', 'orb', 'Their coach sends players to the offensive glass.', (t.offense.crashBoards - 50) / 20);
  if (t.offense.threePoint >= 60) hold('arc', 'Run them off the line', 'tpm', 'Their coach wants threes and shots at the rim.', (t.offense.threePoint - 50) / 20);
  if (t.offense.pace >= 60 || t.offense.transition >= 60)
    hold('getback', 'Get back in transition', 'fastBreak', 'They like to run.', (Math.max(t.offense.pace, t.offense.transition) - 50) / 20);
  if (t.defense.pressure >= 60 || t.defense.press !== 'none') {
    const target = Math.floor(D.tov);
    out.push({
      id: 'ball',
      title: 'Take care of the ball',
      goal: `Keep it to ${plural(target, 'tov')} or fewer`,
      why: 'Their defense pressures the ball.',
      side: 'us',
      stat: 'tov',
      dir: 'max',
      target,
      z: (Math.max(t.defense.pressure, 60) - 50) / 20,
    });
  }
  // last season's top scorer among their players, if he scored
  const star = Object.values(league.players)
    .filter((p) => p.tid === them && !(p.injury?.gamesRemaining ?? 0))
    .map((p) => {
      const s = p.stats.filter((x) => x.season === league.season - 1 && !x.playoffs);
      const gp = s.reduce((a, x) => a + x.gp, 0);
      return { p, gp, ppg: gp ? s.reduce((a, x) => a + x.pts, 0) / gp : 0 };
    })
    .filter((x) => x.gp >= 20)
    .sort((a, b) => b.ppg - a.ppg)[0];
  if (star && star.ppg >= 20)
    out.push({
      id: 'star',
      title: `Make ${star.p.lastName} work`,
      goal: `Hold ${playerName(star.p)} to ${plural(Math.round(star.ppg - 1.5), 'pts')} or fewer`,
      why: `He scored ${star.ppg.toFixed(1)} a game last season.`,
      side: 'them',
      stat: 'pts',
      pid: star.p.pid,
      dir: 'max',
      target: Math.round(star.ppg - 1.5),
      z: (star.ppg - 18) / 5,
    });
  const ast = Math.ceil(D.ast);
  out.push({
    id: 'share',
    title: 'Share the ball',
    goal: `Get ${plural(ast, 'ast')}`,
    why: 'Good looks come from the extra pass.',
    side: 'us',
    stat: 'ast',
    dir: 'min',
    target: ast,
    z: 0.3,
  });
  out.push({
    id: 'crash',
    title: 'Win the second chances',
    goal: glassGoal('min', 'your team', Math.ceil(D.orb)),
    why: 'Extra possessions decide close games.',
    side: 'us',
    stat: 'orb',
    dir: 'min',
    target: Math.ceil(D.orb),
    z: 0.2,
  });
  return out;
}

/** A key's number in a box score (the result, or the live game as drawn); null for a player who didn't play. */
export function keyValue(key: Pick<GameKey, 'side' | 'stat' | 'pid'>, res: Pick<GameResult, 'home' | 'away'>, userSide: 0 | 1): number | null {
  const box = (key.side === 'us') === (userSide === 0) ? res.home : res.away;
  if (key.stat === 'pts') {
    const line = box.players.find((b) => b.pid === key.pid);
    return line && line.min > 0 ? line.pts : null;
  }
  // (a share of the misses as a whole percentage)
  const v = boxStat(box, key.stat, box === res.home ? res.away : res.home);
  return isRate(key.stat) ? Math.round(v) : v;
}

export type KeyState = 'met' | 'missed' | 'on' | 'behind' | 'void';

/**
 * Where a key stands: finished (`met`, `missed`; `void` when the player it was about didn't play),
 * or while the game goes on, decided already (a max key gone past, a min key reached) or on pace
 * (`on`, `behind`) for a full game at the rate so far (`share`: the part of the game played, 0..1).
 */
export function keyState(key: Pick<GameKey, 'dir' | 'target'> & { stat?: KeyStat }, value: number | null, share: number, final: boolean): KeyState {
  if (value === null) return final ? 'void' : 'on';
  // a share of the misses is never decided before the end: on track while it's on the right side
  if (key.stat && isRate(key.stat)) {
    const ok = key.dir === 'max' ? value <= key.target : value >= key.target;
    return final ? (ok ? 'met' : 'missed') : ok ? 'on' : 'behind';
  }
  if (key.dir === 'max') {
    if (value > key.target) return 'missed';
    if (final) return 'met';
    return share > 0 && value / share > key.target + 0.5 ? 'behind' : 'on';
  }
  if (value >= key.target) return 'met';
  if (final) return 'missed';
  return share > 0 && value / share < key.target - 0.5 ? 'behind' : 'on';
}

/** How a key went, to keep with the result. */
export function gradeKey(key: GameKey, res: Pick<GameResult, 'home' | 'away'>, userSide: 0 | 1): KeyGrade {
  const value = keyValue(key, res, userSide);
  const state = keyState(key, value, 1, true);
  return {
    id: key.id,
    title: key.title,
    goal: key.goal,
    dir: key.dir,
    target: key.target,
    value,
    met: state === 'void' ? null : state === 'met',
    ...(isRate(key.stat) && { pct: true as const }),
  };
}
