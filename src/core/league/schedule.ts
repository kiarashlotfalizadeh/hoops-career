// NBA-format 82-game schedule: 4 vs division, 3-4 vs conference, 2 vs other conference,
// spread over ~5.5 months with an All-Star break, limited back-to-backs and no 3-in-3s.

import type { ScheduledGame, Team } from '../types';
import { Rng } from '../random';

interface Matchup {
  home: number;
  away: number;
}

/**
 * Orient the edges of an even-degree graph so every vertex has equal in/out degree
 * (Euler circuits). Used to give each team exactly two "extra" home games in its four
 * three-game conference series, keeping everyone at 41 home games.
 */
function balancedOrientation(edges: [number, number][], season: number): Map<string, number> {
  const adj = new Map<number, { to: number; id: number }[]>();
  edges.forEach(([a, b], id) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, id });
    adj.get(b)!.push({ to: a, id });
  });
  const used = new Array(edges.length).fill(false);
  const homeOf = new Map<string, number>();
  const ptr = new Map<number, number>();
  const verts = [...adj.keys()].sort((x, y) => x - y);
  // vary which way circuits run by season
  if (season % 2) verts.reverse();
  for (const start of verts) {
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1];
      const list = adj.get(v)!;
      let i = ptr.get(v) ?? 0;
      while (i < list.length && used[list[i].id]) i++;
      ptr.set(v, i);
      if (i === list.length) {
        stack.pop();
        continue;
      }
      const e = list[i];
      used[e.id] = true;
      // traversing v -> e.to: v hosts the extra game
      homeOf.set(key(v, e.to), v);
      stack.push(e.to);
    }
  }
  return homeOf;
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function buildMatchups(teams: Team[], season: number): Matchup[] {
  const out: Matchup[] = [];
  const threeGame: [number, number][] = [];
  const pairGames = new Map<string, number>();
  const confDivs: Record<string, string[]> = {};
  for (const t of teams) {
    confDivs[t.conf] ??= [];
    if (!confDivs[t.conf].includes(t.div)) confDivs[t.conf].push(t.div);
  }
  const divIndex = (t: Team) => teams.filter((x) => x.div === t.div).sort((a, b) => a.tid - b.tid).findIndex((x) => x.tid === t.tid);
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i];
      const b = teams[j];
      let games: number;
      if (a.div === b.div) games = 4;
      else if (a.conf === b.conf) {
        const ia = divIndex(a);
        const ib = divIndex(b);
        const divs = confDivs[a.conf];
        // rotate which pairs play three times by season so it varies year to year
        const shift = (divs.indexOf(a.div) + divs.indexOf(b.div) + season) % 5;
        games = (ia + ib + shift) % 5 <= 1 ? 3 : 4;
      } else games = 2;
      pairGames.set(key(a.tid, b.tid), games);
      if (games === 3) threeGame.push([a.tid, b.tid]);
    }
  }
  const extraHome = balancedOrientation(threeGame, season);
  for (const [k, games] of pairGames) {
    const [x, y] = k.split('-').map(Number);
    if (games === 3) {
      const host = extraHome.get(k) ?? x;
      const other = host === x ? y : x;
      out.push({ home: host, away: other }, { home: host, away: other }, { home: other, away: host });
    } else {
      for (let g = 0; g < games; g++) out.push(g % 2 === 0 ? { home: x, away: y } : { home: y, away: x });
    }
  }
  return out;
}

export interface ScheduleResult {
  games: ScheduledGame[];
  lastDay: number;
  allStarDay: number;
  tradeDeadlineDay: number;
}

export function generateSchedule(teams: Team[], season: number, rng: Rng, startGid: number): ScheduleResult {
  const matchups = rng.shuffle(buildMatchups(teams, season));
  const n = teams.length;
  const remaining = new Array(n).fill(0);
  for (const m of matchups) {
    remaining[m.home]++;
    remaining[m.away]++;
  }
  const lastPlayed = new Array(n).fill(-10);
  const prevPlayed = new Array(n).fill(-10);
  const allStarStart = 118; // mid-February
  const allStarLen = 6;
  const games: ScheduledGame[] = [];
  let pool = matchups.slice();
  let day = 0;
  let gid = startGid;
  while (pool.length && day < 400) {
    if (day >= allStarStart && day < allStarStart + allStarLen) {
      day++;
      continue;
    }
    const daysLeft = Math.max(1, 168 - day - (day < allStarStart ? allStarLen : 0));
    const target = Math.min(n / 2, Math.max(2, Math.round(pool.length / daysLeft + rng.normal(0, 1.6))));
    const busy = new Set<number>();
    // prioritize teams with many games left; avoid 3-in-3; discourage back-to-backs
    const scored = pool.map((m, idx) => {
      const b2bH = lastPlayed[m.home] === day - 1;
      const b2bA = lastPlayed[m.away] === day - 1;
      const three = (t: number) => lastPlayed[t] === day - 1 && prevPlayed[t] === day - 2;
      let s = remaining[m.home] + remaining[m.away] + rng.uniform(0, 8);
      if (b2bH) s -= 9;
      if (b2bA) s -= 9;
      if (three(m.home) || three(m.away)) s = -Infinity;
      return { idx, s };
    });
    scored.sort((a, b) => b.s - a.s);
    const chosen: number[] = [];
    for (const { idx, s } of scored) {
      if (chosen.length >= target) break;
      if (s === -Infinity) continue;
      const m = pool[idx];
      if (busy.has(m.home) || busy.has(m.away)) continue;
      busy.add(m.home);
      busy.add(m.away);
      chosen.push(idx);
    }
    const chosenSet = new Set(chosen);
    for (const idx of chosen) {
      const m = pool[idx];
      games.push({ gid: gid++, day, home: m.home, away: m.away, type: 'regular' });
      remaining[m.home]--;
      remaining[m.away]--;
      prevPlayed[m.home] = lastPlayed[m.home];
      prevPlayed[m.away] = lastPlayed[m.away];
      lastPlayed[m.home] = day;
      lastPlayed[m.away] = day;
    }
    pool = pool.filter((_, i) => !chosenSet.has(i));
    day++;
  }
  const lastDay = games.reduce((a, g) => Math.max(a, g.day), 0);
  return { games, lastDay, allStarDay: allStarStart + 2, tradeDeadlineDay: allStarStart - 10 };
}

/** Real schedule from the seed: one "day:AWY@HOM" string per game (day 0 = opening night). */
export interface RealScheduleData {
  season: number;
  games: string[];
}

const MS_DAY = 86_400_000;
const dateOf = (season: number, day: number) => new Date(Date.UTC(season - 1, 9, 20) + day * MS_DAY);

/**
 * The real NBA schedule, completed to 82 games (41 at home) per team. The NBA publishes the
 * Cup knockout round and the games for teams knocked out of it later; the missing games are
 * paired within conferences (fewest existing meetings first) and placed on open December dates
 * (the Cup window) where neither team plays, never making a team play three days running.
 * Returns null if the data is unusable, so the caller can fall back to a generated schedule.
 */
export function realSchedule(teams: Team[], data: RealScheduleData, season: number, rng: Rng, startGid: number): ScheduleResult | null {
  if (data.season !== season || !data.games.length) return null;
  const tidOf = new Map(teams.map((t) => [t.abbrev, t.tid]));
  const n = teams.length;
  const busy = teams.map(() => new Set<number>());
  const real: { day: number; home: number; away: number }[] = [];
  for (const s of data.games) {
    const m = s.match(/^(\d+):([A-Z]{2,4})@([A-Z]{2,4})$/);
    if (!m) continue;
    const day = Number(m[1]);
    const away = tidOf.get(m[2]);
    const home = tidOf.get(m[3]);
    if (away === undefined || home === undefined || away === home || busy[home].has(day) || busy[away].has(day)) continue;
    busy[home].add(day);
    busy[away].add(day);
    real.push({ day, home, away });
  }
  const games = new Array(n).fill(0);
  const homes = new Array(n).fill(0);
  for (const g of real) {
    games[g.home]++;
    games[g.away]++;
    homes[g.home]++;
  }
  const needHome = homes.map((h) => 41 - h);
  const needAway = games.map((c, t) => 82 - c - needHome[t]);
  // a mostly-missing or inconsistent file: use the generated schedule instead
  if (real.length < 1000 || needHome.some((x) => x < 0) || needAway.some((x) => x < 0)) return null;

  // pair the missing games: hosts that still need home games vs visitors that need road games
  const meet = new Map<string, number>();
  const mk = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const g of real) meet.set(mk(g.home, g.away), (meet.get(mk(g.home, g.away)) ?? 0) + 1);
  let extra: { home: number; away: number }[] | null = null;
  for (let attempt = 0; attempt < 60 && !extra; attempt++) {
    const h = needHome.slice();
    const a = needAway.slice();
    const out: { home: number; away: number }[] = [];
    const used = new Map(meet);
    let ok = true;
    for (;;) {
      const hosts = teams.map((t) => t.tid).filter((t) => h[t] > 0);
      if (!hosts.length) break;
      const order = hosts.map((t) => ({ t, k: h[t] + a[t] + rng.next() * 0.5 })).sort((x, y) => y.k - x.k);
      const host = order[0].t;
      const opts = teams
        .map((t) => t.tid)
        .filter((t) => t !== host && a[t] > 0)
        .map((t) => ({ t, s: (used.get(mk(host, t)) ?? 0) * 10 + (teams[t].conf !== teams[host].conf ? 6 : 0) + rng.uniform(0, 4 + attempt) }))
        .sort((x, y) => x.s - y.s);
      if (!opts.length) {
        ok = false;
        break;
      }
      const vis = opts[0].t;
      out.push({ home: host, away: vis });
      h[host]--;
      a[vis]--;
      used.set(mk(host, vis), (used.get(mk(host, vis)) ?? 0) + 1);
    }
    if (ok && a.every((x) => x === 0)) extra = out;
  }
  if (!extra) return null;

  // All-Star break: the longest run of game-free days in the middle of the season
  const lastReal = real.reduce((m, g) => Math.max(m, g.day), 0);
  const perDay = new Array(lastReal + 2).fill(0);
  for (const g of real) perDay[g.day]++;
  let breakStart = -1;
  let breakLen = 0;
  for (let d = 60; d < lastReal - 20; d++) {
    if (perDay[d]) continue;
    let e = d;
    while (e < lastReal && !perDay[e]) e++;
    if (e - d > breakLen) {
      breakLen = e - d;
      breakStart = d;
    }
    d = e;
  }
  if (breakLen < 3) {
    breakStart = 118;
    breakLen = 0;
  }
  const inBreak = (d: number) => d >= breakStart && d < breakStart + breakLen;

  // place each extra game on the best open day: December first, the emptier the better
  const three = (t: number, d: number) => {
    const b = busy[t];
    return (b.has(d - 1) && b.has(d - 2)) || (b.has(d - 1) && b.has(d + 1)) || (b.has(d + 1) && b.has(d + 2));
  };
  const placed: { day: number; home: number; away: number }[] = [];
  for (const g of rng.shuffle(extra)) {
    let best = -1;
    let bestScore = Infinity;
    for (let d = 1; d <= lastReal; d++) {
      const date = dateOf(season, d);
      const december = date.getUTCMonth() === 11;
      if (inBreak(d) || (december && date.getUTCDate() === 24) || busy[g.home].has(d) || busy[g.away].has(d)) continue;
      if (three(g.home, d) || three(g.away, d)) continue;
      const b2b = [g.home, g.away].filter((t) => busy[t].has(d - 1) || busy[t].has(d + 1)).length;
      const s = (december ? 0 : 30) + perDay[d] * 0.6 + b2b * 4 + rng.uniform(0, 0.5);
      if (s < bestScore) {
        bestScore = s;
        best = d;
      }
    }
    if (best < 0) return null;
    busy[g.home].add(best);
    busy[g.away].add(best);
    perDay[best]++;
    placed.push({ day: best, home: g.home, away: g.away });
  }
  const all = [...real, ...placed].sort((x, y) => x.day - y.day || x.home - y.home);
  let gid = startGid;
  const out: ScheduledGame[] = all.map((g) => ({ gid: gid++, day: g.day, home: g.home, away: g.away, type: 'regular' }));
  const lastDay = out.reduce((m, g) => Math.max(m, g.day), 0);
  return { games: out, lastDay, allStarDay: breakStart + 2, tradeDeadlineDay: breakStart - 10 };
}
