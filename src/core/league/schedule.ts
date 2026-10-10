// NBA-format 82-game schedule: 4 vs division, 3-4 vs conference, 2 vs other conference,
// spread over ~5.5 months with an All-Star break, limited back-to-backs and no 3-in-3s.

import type { ScheduledGame, Team } from '../types';
import { Rng } from '../random';

interface Matchup {
  home: number;
  away: number;
}

export function buildMatchups(teams: Team[], season: number): Matchup[] {
  const out: Matchup[] = [];
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
      const homeFirst = (i + j + season) % 2 === 0;
      for (let g = 0; g < games; g++) {
        const aHome = g % 2 === 0 ? homeFirst : !homeFirst;
        out.push(aHome ? { home: a.tid, away: b.tid } : { home: b.tid, away: a.tid });
      }
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
