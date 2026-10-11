// NBA-format 82-game schedule: 4 vs division, 3-4 vs conference, 2 vs other conference,
// spread over ~5.5 months with an All-Star break, limited back-to-backs and no 3-in-3s or 4-in-5s. With the
// NBA Cup, 80 games are scheduled up front (group games on Cup nights) and the last two per team
// are added in the December knockout window once the groups are decided (cup.ts).

import type { CupGroup, ScheduledGame, Team } from '../types';
import { Rng } from '../random';
import { cupCalendar, drawCupGroups, fourInFive, groupRounds, type CupSetup } from './cup';

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
  const divIndex = (t: Team) =>
    teams
      .filter((x) => x.div === t.div)
      .sort((a, b) => a.tid - b.tid)
      .findIndex((x) => x.tid === t.tid);
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
  /** NBA Cup groups and calendar; the knockout games are scheduled once the groups are decided. */
  cup?: CupSetup;
}

/**
 * Set aside what the NBA Cup needs from the 82-game matchups: each group's ten games (one per
 * pair, everyone hosting two), placed on the five Cup nights, and a home and an away game per
 * team for the knockout window (a cycle through each conference that never pairs groupmates).
 * Returns null, leaving the matchups untouched, if the league can't hold a Cup.
 */
function carveCup(matchups: Matchup[], teams: Team[], season: number, rng: Rng): { setup: CupSetup; fixed: Map<number, Matchup[]> } | null {
  const groups = drawCupGroups(teams, season, rng);
  if (!groups) return null;
  const cal = cupCalendar(season);
  const pool = matchups.slice();
  const take = (home: number, away: number) => {
    const i = pool.findIndex((m) => m.home === home && m.away === away);
    if (i < 0) return false;
    pool.splice(i, 1);
    return true;
  };
  const fixed = new Map<number, Matchup[]>();
  for (const grp of groups) {
    const rounds = groupRounds(grp.tids);
    for (let r = 0; r < rounds.length; r++) {
      for (const m of rounds[r]) {
        if (!take(m.home, m.away)) return null;
        fixed.set(cal.nights[r], [...(fixed.get(cal.nights[r]) ?? []), m]);
      }
    }
  }
  for (const conf of ['E', 'W'] as const) {
    const gs = groups.filter((g) => g.conf === conf);
    const cycle: number[] = [];
    for (let i = 0; i < 5; i++) for (const g of gs) cycle.push(g.tids[i]);
    for (let k = 0; k < cycle.length; k++) if (!take(cycle[k], cycle[(k + 1) % cycle.length])) return null;
  }
  matchups.length = 0;
  matchups.push(...pool);
  return { setup: { groups, ...cal }, fixed };
}

export function generateSchedule(teams: Team[], season: number, rng: Rng, startGid: number): ScheduleResult {
  const matchups = buildMatchups(teams, season);
  const cup = carveCup(matchups, teams, season, rng);
  rng.shuffle(matchups);
  const n = teams.length;
  const remaining = new Array(n).fill(0);
  for (const m of matchups) {
    remaining[m.home]++;
    remaining[m.away]++;
  }
  // mid-February break from Friday to Wednesday, the All-Star Game on its Sunday
  let allStarStart = 116;
  while (dateOf(season, allStarStart).getUTCDay() !== 5) allStarStart++;
  const allStarLen = 6;
  const lastTarget = 168;
  // the NBA's dark days: Thanksgiving and Christmas Eve
  const holiday = (d: number) => {
    const date = dateOf(season, d);
    return (date.getUTCMonth() === 10 && date.getUTCDay() === 4 && date.getUTCDate() >= 22) || (date.getUTCMonth() === 11 && date.getUTCDate() === 24);
  };
  const blocked = (d: number) => (d >= allStarStart && d < allStarStart + allStarLen) || (!!cup && d >= cup.setup.qfDays[0] && d <= cup.setup.finalDay) || holiday(d);
  // every day each team plays, including the Cup nights fixed in advance
  const plays = teams.map(() => new Set<number>());
  for (const [d, ms] of cup?.fixed ?? []) {
    for (const m of ms) {
      plays[m.home].add(d);
      plays[m.away].add(d);
    }
  }
  // anyone could have a quarterfinal on the window's first night or play in the championship on its
  // last: no back-to-back into the window, or straight out of it
  if (cup) for (const p of plays) p.add(cup.setup.qfDays[0]).add(cup.setup.finalDay);
  const on = (t: number, d: number) => plays[t].has(d);
  const threeInThree = (t: number, d: number) => (on(t, d - 1) && on(t, d - 2)) || (on(t, d - 1) && on(t, d + 1)) || (on(t, d + 1) && on(t, d + 2));
  const crowded = (t: number, d: number) => threeInThree(t, d) || fourInFive(plays[t], d);
  const games: ScheduledGame[] = [];
  let pool = matchups;
  let day = 0;
  let gid = startGid;
  while ((pool.length || (cup && day <= cup.setup.nights[cup.setup.nights.length - 1])) && day < 400) {
    if (blocked(day)) {
      day++;
      continue;
    }
    const today = cup?.fixed.get(day) ?? [];
    const busy = new Set<number>();
    for (const m of today) {
      games.push({ gid: gid++, day, home: m.home, away: m.away, type: 'regular', cup: 'group' });
      busy.add(m.home).add(m.away);
    }
    let daysLeft = 0;
    for (let d = day; d < lastTarget; d++) if (!blocked(d)) daysLeft++;
    const target = Math.min(n / 2, Math.max(2, Math.round(pool.length / Math.max(1, daysLeft) + rng.normal(0, 1.6)))) - today.length;
    // prioritize teams with many games left; no 3-in-3 or 4-in-5; discourage back-to-backs
    const scored = pool.map((m, idx) => {
      let s = remaining[m.home] + remaining[m.away] + rng.uniform(0, 8);
      for (const t of [m.home, m.away]) if (on(t, day - 1) || on(t, day + 1)) s -= 9;
      if (crowded(m.home, day) || crowded(m.away, day)) s = -Infinity;
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
      plays[m.home].add(day);
      plays[m.away].add(day);
    }
    pool = pool.filter((_, i) => !chosenSet.has(i));
    day++;
  }
  const lastDay = games.reduce((a, g) => Math.max(a, g.day), 0);
  // the deadline is the Thursday ten days before the All-Star Game
  return { games, lastDay, allStarDay: allStarStart + 2, tradeDeadlineDay: allStarStart - 8, cup: cup?.setup };
}

/** Real schedule from the seed: one "day:AWY@HOM" string per game (day 0 = opening night). */
export interface RealScheduleData {
  season: number;
  games: string[];
  /** The NBA Cup: groups ("East A" -> tricodes), which games are group games, and the knockout days. */
  cup?: RealCupData;
}

export interface RealCupData {
  groups: Record<string, string[]>;
  /** Group games, as they appear in `games`. */
  games: string[];
  qf: [number, number];
  sf: number;
  final: number;
}

/** Cup groups from the seed, or null if they don't cover every team in groups of five. */
function realCupGroups(teams: Team[], cup: RealCupData): CupGroup[] | null {
  const tidOf = new Map(teams.map((t) => [t.abbrev, t.tid]));
  const groups: CupGroup[] = [];
  const seen = new Set<number>();
  for (const [id, codes] of Object.entries(cup.groups).sort(([a], [b]) => a.localeCompare(b))) {
    const conf = id.startsWith('East') ? 'E' : id.startsWith('West') ? 'W' : null;
    const tids = codes.map((c) => tidOf.get(c));
    if (!conf || tids.length !== 5 || tids.some((t) => t === undefined || teams[t].conf !== conf || seen.has(t))) return null;
    for (const t of tids) seen.add(t!);
    groups.push({ id, conf, tids: tids as number[] });
  }
  return seen.size === teams.length ? groups : null;
}

const MS_DAY = 86_400_000;
const dateOf = (season: number, day: number) => new Date(Date.UTC(season - 1, 9, 20) + day * MS_DAY);

/**
 * The real NBA schedule. The NBA publishes 80 games per team and adds the Cup knockouts and the
 * games for teams knocked out of the Cup later: with the seed's Cup data those are scheduled in
 * the December window as the Cup plays out (see cup.ts). Without it, the missing games are
 * paired within conferences (fewest existing meetings first) and placed on open December dates
 * where neither team plays, never making a team play three days running, for 82 games (41 at
 * home) per team. Returns null if the data is unusable, so the caller can fall back to a
 * generated schedule.
 */
export function realSchedule(teams: Team[], data: RealScheduleData, season: number, rng: Rng, startGid: number): ScheduleResult | null {
  if (data.season !== season || !data.games.length) return null;
  const tidOf = new Map(teams.map((t) => [t.abbrev, t.tid]));
  const n = teams.length;
  const busy = teams.map(() => new Set<number>());
  const real: { day: number; home: number; away: number; s: string }[] = [];
  for (const s of data.games) {
    const m = s.match(/^(\d+):([A-Z]{2,4})@([A-Z]{2,4})$/);
    if (!m) continue;
    const day = Number(m[1]);
    const away = tidOf.get(m[2]);
    const home = tidOf.get(m[3]);
    if (away === undefined || home === undefined || away === home || busy[home].has(day) || busy[away].has(day)) continue;
    busy[home].add(day);
    busy[away].add(day);
    real.push({ day, home, away, s });
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
  const breakInfo = allStarBreak(real);

  // with the Cup, the published 80 games are the base: the knockouts and the games for teams
  // knocked out are scheduled in the clear December window once the groups are decided
  const cupGroups = data.cup && realCupGroups(teams, data.cup);
  if (cupGroups && data.cup && games.every((c) => c === 80)) {
    const cupGames = new Set(data.cup.games);
    const clear = real.every((g) => g.day < data.cup!.qf[0] || g.day > data.cup!.final);
    const marked = real.filter((g) => cupGames.has(g.s));
    if (clear && marked.length === 60) {
      let gid = startGid;
      const out: ScheduledGame[] = real
        .sort((x, y) => x.day - y.day || x.home - y.home)
        .map((g) => ({ gid: gid++, day: g.day, home: g.home, away: g.away, type: 'regular', ...(cupGames.has(g.s) ? { cup: 'group' as const } : {}) }));
      const nights = [...new Set(marked.map((g) => g.day))].sort((a, b) => a - b);
      return {
        games: out,
        lastDay: out.reduce((m, g) => Math.max(m, g.day), 0),
        allStarDay: breakInfo.allStarDay,
        tradeDeadlineDay: breakInfo.tradeDeadlineDay,
        cup: { groups: cupGroups, nights, qfDays: data.cup.qf, sfDay: data.cup.sf, finalDay: data.cup.final },
      };
    }
  }

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

  const lastReal = real.reduce((m, g) => Math.max(m, g.day), 0);
  const perDay = new Array(lastReal + 2).fill(0);
  for (const g of real) perDay[g.day]++;
  const breakStart = breakInfo.allStarDay - 2;
  const breakLen = breakInfo.breakLen;
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
      const crowded = fourInFive(busy[g.home], d) || fourInFive(busy[g.away], d) ? 20 : 0;
      const s = (december ? 0 : 30) + perDay[d] * 0.6 + b2b * 4 + crowded + rng.uniform(0, 0.5);
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
  return { games: out, lastDay, allStarDay: breakInfo.allStarDay, tradeDeadlineDay: breakInfo.tradeDeadlineDay };
}

/** All-Star break: the longest run of game-free days in the middle of the season. */
function allStarBreak(real: { day: number }[]): { allStarDay: number; tradeDeadlineDay: number; breakLen: number } {
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
  // the deadline is the Thursday ten days before the All-Star Game, as in generated seasons
  return { allStarDay: breakStart + 2, tradeDeadlineDay: breakStart - 8, breakLen };
}
