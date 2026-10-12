// The NBA Cup (in-season tournament). Six groups of five, drawn by last season's record, play
// four group games each on Cup nights in November. The three group winners and the best
// runner-up in each conference reach single-elimination knockouts in December: quarterfinals and
// semifinals at the better seed (both count in the standings), then a championship on a neutral
// floor that doesn't. The base schedule has 80 games per team; the knockout window is kept clear,
// and once the groups are decided the teams that didn't qualify get their last two games there
// (quarterfinal losers one), so everyone ends on 82.

import type { BoxLine, CupGroup, CupState, CupTie, League, ScheduledGame, Team } from '../types';
import type { Rng } from '../random';
import { addInbox, addNews, dateToDay, dayToDate, playerName, teamName, teamPlayers, winPct } from './helpers';

export interface CupSetup {
  groups: CupGroup[];
  nights: number[];
  qfDays: [number, number];
  sfDay: number;
  finalDay: number;
}

export const CUP_TEAMS_PER_GROUP = 5;

/** Group stage, quarterfinals and semifinals are regular-season games; the final isn't. */
export const CUP_ROUND_LABEL: Record<'group' | 'qf' | 'sf' | 'final', string> = {
  group: 'Group stage',
  qf: 'Quarterfinal',
  sf: 'Semifinal',
  final: 'Championship',
};

/**
 * Draw the groups: each conference's 15 teams are split into five pots of three by last season's
 * record (random for a league's first season), and each group takes one team from every pot.
 * Returns null when a conference can't be split into groups of five.
 */
export function drawCupGroups(teams: Team[], season: number, rng: Rng): CupGroup[] | null {
  const groups: CupGroup[] = [];
  for (const conf of ['E', 'W'] as const) {
    const confTeams = teams.filter((t) => t.conf === conf);
    if (confTeams.length !== 15) return null;
    const prev = (t: Team) => {
      const s = t.seasons.find((x) => x.season === season - 1);
      return s && s.won + s.lost > 0 ? winPct(s) : 0.5;
    };
    const ranked = confTeams
      .map((t) => ({ t, k: prev(t) + rng.next() * 1e-3 }))
      .sort((a, b) => b.k - a.k)
      .map((x) => x.t.tid);
    const ids = ['A', 'B', 'C'];
    const tids: number[][] = [[], [], []];
    for (let pot = 0; pot < 5; pot++) {
      const draw = rng.shuffle(ranked.slice(pot * 3, pot * 3 + 3));
      draw.forEach((tid, i) => tids[i].push(tid));
    }
    // order within a group is random: it decides who hosts whom and the group-night rotation
    for (let i = 0; i < 3; i++) groups.push({ id: `${conf === 'E' ? 'East' : 'West'} ${ids[i]}`, conf, tids: rng.shuffle(tids[i]) });
  }
  return groups;
}

/**
 * Calendar for a generated season: five Cup nights in November (Fridays and Tuesdays, the last one
 * the Friday after Thanksgiving), then an eight-day knockout window a week later: quarterfinals on
 * a Friday and Saturday, semifinals the Tuesday, the championship the Friday.
 */
export function cupCalendar(season: number): Omit<CupSetup, 'groups'> {
  // the first Friday from Nov 2: three weeks later is always the day after Thanksgiving (Nov 23-29)
  let f1 = dateToDay(season, 10, 2);
  while (dayToDate(season, f1).getUTCDay() !== 5) f1++;
  const nights = [f1, f1 + 7, f1 + 11, f1 + 18, f1 + 21];
  const q0 = nights[4] + 7;
  return { nights, qfDays: [q0, q0 + 1], sfDay: q0 + 4, finalDay: q0 + 7 };
}

/** The 4-out-of-5 round robin: g[i] hosts g[i+1] and g[i+2]; in round r, g[r] sits out. */
export function groupRounds(tids: number[]): { home: number; away: number }[][] {
  const out: { home: number; away: number }[][] = [];
  for (let r = 0; r < 5; r++) {
    const round: { home: number; away: number }[] = [];
    for (const [i, j] of [
      [(r + 1) % 5, (r + 4) % 5],
      [(r + 2) % 5, (r + 3) % 5],
    ]) {
      const hostsI = (j - i + 5) % 5 <= 2;
      round.push(hostsI ? { home: tids[i], away: tids[j] } : { home: tids[j], away: tids[i] });
    }
    out.push(round);
  }
  return out;
}

export function cupState(setup: CupSetup, season: number): CupState {
  return { season, groups: setup.groups, nights: setup.nights, qfDays: setup.qfDays, sfDay: setup.sfDay, finalDay: setup.finalDay, bracket: [] };
}

// ---------------------------------------------------------------- standings

export interface CupRow {
  tid: number;
  won: number;
  lost: number;
  pd: number;
  pf: number;
  /** Place in the group, 1-5. */
  rank: number;
  /** Knockout seed in its conference once the group stage is over (1-3 winners, 4 the wild card). */
  seed?: number;
}

export interface CupGroupTable {
  group: CupGroup;
  rows: CupRow[];
}

/** Stable last-resort tiebreak (the NBA draws lots). */
const lot = (season: number, tid: number) => (((season * 2654435761) ^ (tid * 40503)) >>> 0) % 1000;

function prevPct(league: League, tid: number) {
  const s = league.teams[tid].seasons.find((x) => x.season === league.season - 1);
  return s && s.won + s.lost > 0 ? winPct(s) : 0.5;
}

/**
 * Group tables from this season's group games. Ties: head-to-head among the tied teams, point
 * differential, points scored (all in group games), last season's record, then a drawing.
 */
export function cupTables(league: League): CupGroupTable[] {
  const cup = league.cup;
  if (!cup) return [];
  const rec = new Map<number, CupRow>();
  const beat = new Map<string, number>();
  for (const g of cup.groups) for (const tid of g.tids) rec.set(tid, { tid, won: 0, lost: 0, pd: 0, pf: 0, rank: 0 });
  for (const r of league.games) {
    if (r.cup !== 'group' || r.season !== cup.season) continue;
    const h = rec.get(r.home.tid);
    const a = rec.get(r.away.tid);
    if (!h || !a) continue;
    const homeWon = r.home.pts > r.away.pts;
    (homeWon ? h : a).won++;
    (homeWon ? a : h).lost++;
    h.pd += r.home.pts - r.away.pts;
    a.pd += r.away.pts - r.home.pts;
    h.pf += r.home.pts;
    a.pf += r.away.pts;
    const k = homeWon ? `${r.home.tid}-${r.away.tid}` : `${r.away.tid}-${r.home.tid}`;
    beat.set(k, (beat.get(k) ?? 0) + 1);
  }
  const pct = (r: CupRow) => (r.won + r.lost ? r.won / (r.won + r.lost) : 0);
  const tables = cup.groups.map((group) => {
    const rows = group.tids.map((tid) => rec.get(tid)!);
    rows.sort((x, y) => {
      if (Math.abs(pct(x) - pct(y)) > 1e-9) return pct(y) - pct(x);
      // head-to-head among every team on the same record
      const tied = rows.filter((r) => Math.abs(pct(r) - pct(x)) < 1e-9);
      const h2h = (r: CupRow) => tied.reduce((s, o) => s + (beat.get(`${r.tid}-${o.tid}`) ?? 0) - (beat.get(`${o.tid}-${r.tid}`) ?? 0), 0);
      return h2h(y) - h2h(x) || y.pd - x.pd || y.pf - x.pf || prevPct(league, y.tid) - prevPct(league, x.tid) || lot(cup.season, x.tid) - lot(cup.season, y.tid);
    });
    rows.forEach((r, i) => (r.rank = i + 1));
    return { group, rows };
  });
  if (cup.seeds) {
    for (const conf of ['E', 'W'] as const) {
      cup.seeds[conf].forEach((tid, i) => {
        const r = rec.get(tid);
        if (r) r.seed = i + 1;
      });
    }
  }
  return tables;
}

/** Across groups: record, point differential, points scored, last season's record, drawing. */
function crossGroup(league: League, a: CupRow, b: CupRow) {
  const pa = a.won / Math.max(1, a.won + a.lost);
  const pb = b.won / Math.max(1, b.won + b.lost);
  return pb - pa || b.pd - a.pd || b.pf - a.pf || prevPct(league, b.tid) - prevPct(league, a.tid) || lot(league.season, a.tid) - lot(league.season, b.tid);
}

/** Knockout seeds per conference: the three group winners, then the best runner-up. */
export function cupSeeds(league: League): { E: number[]; W: number[] } {
  const tables = cupTables(league);
  const out = { E: [] as number[], W: [] as number[] };
  for (const conf of ['E', 'W'] as const) {
    const mine = tables.filter((t) => t.group.conf === conf);
    const winners = mine.map((t) => t.rows[0]).sort((a, b) => crossGroup(league, a, b));
    const wild = mine.map((t) => t.rows[1]).sort((a, b) => crossGroup(league, a, b))[0];
    out[conf] = [...winners.map((r) => r.tid), wild.tid];
  }
  return out;
}

// ---------------------------------------------------------------- knockout scheduling

function teamDays(league: League): Set<number>[] {
  const days = league.teams.map(() => new Set<number>());
  for (const g of league.schedule) {
    days[g.home]?.add(g.day);
    days[g.away]?.add(g.day);
  }
  return days;
}

function addGame(league: League, g: Omit<ScheduledGame, 'gid'>): ScheduledGame {
  const sg: ScheduledGame = { gid: league.nextGid++, ...g };
  league.schedule.push(sg);
  return sg;
}

/** Keep the schedule in day order (the UI and the day loop expect it). */
function sortSchedule(league: League) {
  league.schedule.sort((a, b) => a.day - b.day || a.gid - b.gid);
}

/**
 * Pair the teams that still need games. Each wants to end on 41 home games where it can; hosts are
 * matched with visitors, conference rivals first and pairs that have met least this season.
 */
function pairFillers(league: League, need: Map<number, number>, rng: Rng): { home: number; away: number }[] {
  const homeCount = new Map<number, number>();
  const meet = new Map<string, number>();
  for (const g of league.schedule) {
    if (g.type !== 'regular') continue;
    homeCount.set(g.home, (homeCount.get(g.home) ?? 0) + 1);
    meet.set(pairKey(g.home, g.away), (meet.get(pairKey(g.home, g.away)) ?? 0) + 1);
  }
  const hostSlots: number[] = [];
  const awaySlots: number[] = [];
  for (const [tid, n] of need) {
    const h = Math.max(0, Math.min(n, 41 - (homeCount.get(tid) ?? 0)));
    for (let i = 0; i < h; i++) hostSlots.push(tid);
    for (let i = 0; i < n - h; i++) awaySlots.push(tid);
  }
  // balance the two lists: the teams with the most home games give up a home slot first
  const homes = (tid: number) => homeCount.get(tid) ?? 0;
  while (hostSlots.length > awaySlots.length) {
    hostSlots.sort((a, b) => homes(a) - homes(b));
    awaySlots.push(hostSlots.pop()!);
  }
  while (awaySlots.length > hostSlots.length) {
    awaySlots.sort((a, b) => homes(b) - homes(a));
    hostSlots.push(awaySlots.pop()!);
  }
  for (let attempt = 0; attempt < 80; attempt++) {
    const visitors = awaySlots.slice();
    const used = new Map(meet);
    const out: { home: number; away: number }[] = [];
    let ok = true;
    for (const host of rng.shuffle(hostSlots.slice())) {
      const opts = visitors
        .map((v, i) => ({ v, i, s: (used.get(pairKey(host, v)) ?? 0) * 10 + (league.teams[v].conf !== league.teams[host].conf ? 6 : 0) + rng.uniform(0, 4 + attempt) }))
        .filter((o) => o.v !== host && !out.some((g) => pairKey(g.home, g.away) === pairKey(host, o.v)))
        .sort((a, b) => a.s - b.s);
      if (!opts.length) {
        ok = false;
        break;
      }
      visitors.splice(opts[0].i, 1);
      out.push({ home: host, away: opts[0].v });
      used.set(pairKey(host, opts[0].v), (used.get(pairKey(host, opts[0].v)) ?? 0) + 1);
    }
    if (ok) return out;
  }
  // last resort (never seen in practice): pair in list order, skipping self-pairs
  const out: { home: number; away: number }[] = [];
  const visitors = awaySlots.slice();
  for (const host of hostSlots) {
    const i = visitors.findIndex((v) => v !== host);
    if (i >= 0) out.push({ home: host, away: visitors.splice(i, 1)[0] });
  }
  return out;
}

/** Key for a pair of teams, the same whichever comes first. */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Would a game on day `d` make three days running? */
export function threeInThree(days: Set<number>, d: number): boolean {
  return (days.has(d - 1) && days.has(d - 2)) || (days.has(d - 1) && days.has(d + 1)) || (days.has(d + 1) && days.has(d + 2));
}

/** Would a game on day `d` make four in five nights? (The NBA hasn't scheduled one since 2018.) */
export function fourInFive(days: Set<number>, d: number): boolean {
  for (let w = d - 4; w <= d; w++) {
    let n = 1;
    for (let x = w; x <= w + 4; x++) if (x !== d && days.has(x)) n++;
    if (n >= 4) return true;
  }
  return false;
}

/** Put each game on the best open day: both teams free, never three days running or four in five nights, few back-to-backs. */
function placeGames(league: League, pairs: { home: number; away: number }[], days: number[], rng: Rng) {
  const busy = teamDays(league);
  const perDay = new Map<number, number>();
  for (const g of league.schedule) perDay.set(g.day, (perDay.get(g.day) ?? 0) + 1);
  for (const p of pairs) {
    let best = -1;
    let bestScore = Infinity;
    for (const d of days) {
      if (busy[p.home].has(d) || busy[p.away].has(d)) continue;
      const s =
        (threeInThree(busy[p.home], d) || threeInThree(busy[p.away], d) ? 100 : 0) +
        (fourInFive(busy[p.home], d) || fourInFive(busy[p.away], d) ? 50 : 0) +
        [p.home, p.away].filter((t) => busy[t].has(d - 1) || busy[t].has(d + 1)).length * 4 +
        (perDay.get(d) ?? 0) * 0.6 +
        rng.uniform(0, 0.5);
      if (s < bestScore) {
        bestScore = s;
        best = d;
      }
    }
    // the window always has room; if not, the first free day after it
    if (best < 0) {
      best = days[days.length - 1] + 1;
      while (busy[p.home].has(best) || busy[p.away].has(best)) best++;
    }
    addGame(league, { day: best, home: p.home, away: p.away, type: 'regular' });
    busy[p.home].add(best);
    busy[p.away].add(best);
    perDay.set(best, (perDay.get(best) ?? 0) + 1);
  }
}

function range(a: number, b: number) {
  const out: number[] = [];
  for (let d = a; d <= b; d++) out.push(d);
  return out;
}

function addTie(league: League, cup: CupState, round: CupTie['round'], conf: CupTie['conf'], high: number, low: number, highSeed: number, lowSeed: number, day: number) {
  const g = addGame(league, { day, home: high, away: low, type: round === 'final' ? 'cup' : 'regular', cup: round });
  cup.bracket.push({ round, conf, high, low, highSeed, lowSeed, gid: g.gid, day });
}

function seedKnockouts(league: League, cup: CupState, rng: Rng) {
  cup.seeds = cupSeeds(league);
  // one conference's quarterfinals each night, which one first varies
  const firstEast = rng.chance(0.5);
  for (const conf of ['E', 'W'] as const) {
    const s = cup.seeds[conf];
    const day = cup.qfDays[(conf === 'E') === firstEast ? 0 : 1];
    addTie(league, cup, 'qf', conf, s[0], s[3], 1, 4, day);
    addTie(league, cup, 'qf', conf, s[1], s[2], 2, 3, day);
  }
  // everyone else: two games in the knockout window
  const inKnockouts = new Set([...cup.seeds.E, ...cup.seeds.W]);
  const need = new Map<number, number>();
  for (const t of league.teams) if (!inKnockouts.has(t.tid)) need.set(t.tid, 2);
  placeGames(league, pairFillers(league, need, rng), range(cup.qfDays[0], cup.finalDay - 1), rng);
  sortSchedule(league);

  const nm = (tid: number) => league.teams[tid].abbrev;
  addNews(league, {
    kind: 'general',
    text: `NBA Cup knockouts set. East: ${cup.seeds.E.map(nm).join(', ')}. West: ${cup.seeds.W.map(nm).join(', ')} (group winners, then the wild card).`,
    tids: [...cup.seeds.E, ...cup.seeds.W],
    pids: [],
  });
  const user = league.userTid;
  if (inKnockouts.has(user)) {
    const conf = league.teams[user].conf;
    const seed = cup.seeds[conf].indexOf(user) + 1;
    const opp = cup.bracket.find((t) => t.round === 'qf' && (t.high === user || t.low === user))!;
    const other = opp.high === user ? opp.low : opp.high;
    addInbox(league, {
      from: 'League Office',
      subject: 'NBA Cup: into the knockouts',
      body: `You're the ${['1st', '2nd', '3rd', '4th'][seed - 1]} seed in the ${conf === 'E' ? 'East' : 'West'}${seed === 4 ? ' as the wild card' : ''}. Quarterfinal ${opp.high === user ? 'at home' : 'on the road'} against the ${teamName(league.teams[other])}. Quarterfinals and semifinals count in the standings; the championship doesn't.`,
      tone: 'good',
      link: '/league?tab=cup',
    });
  } else {
    addInbox(league, {
      from: 'League Office',
      subject: 'NBA Cup: out in the group stage',
      body: 'You missed the knockout round. Your last two regular-season games have been added to the schedule in the knockout window in early December.',
      tone: 'neutral',
      link: '/league?tab=cup',
    });
  }
}

function settleTies(league: League, cup: CupState) {
  for (const t of cup.bracket) {
    if (t.winner !== undefined) continue;
    const r = league.games.find((g) => g.gid === t.gid);
    if (!r) continue;
    const highPts = r.home.tid === t.high ? r.home.pts : r.away.pts;
    const lowPts = r.home.tid === t.high ? r.away.pts : r.home.pts;
    t.highPts = highPts;
    t.lowPts = lowPts;
    t.winner = highPts > lowPts ? t.high : t.low;
  }
}

const loserOf = (t: CupTie) => (t.winner === t.high ? t.low : t.high);
const seedOf = (t: CupTie, tid: number) => (tid === t.high ? t.highSeed : t.lowSeed);

/** Game score summed over the Cup, knockout games counting a bit more. */
function cupMvp(league: League, champ: number, cup: CupState): number | undefined {
  const knockout = new Set(cup.bracket.map((t) => t.gid));
  const score = new Map<number, number>();
  const gmsc = (b: BoxLine) => b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.orb + 0.3 * b.drb + b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;
  for (const r of league.games) {
    if (r.season !== cup.season || !r.cup) continue;
    const side = r.home.tid === champ ? r.home : r.away.tid === champ ? r.away : null;
    if (!side) continue;
    const w = knockout.has(r.gid) ? 1.5 : 1;
    for (const b of side.players) if (b.min > 0) score.set(b.pid, (score.get(b.pid) ?? 0) + gmsc(b) * w);
  }
  let best: number | undefined;
  for (const [pid, s] of score) if (league.players[pid] && (best === undefined || s > score.get(best)!)) best = pid;
  return best;
}

function finishCup(league: League, cup: CupState, final: CupTie) {
  const champ = final.winner!;
  const runnerUp = loserOf(final);
  cup.champion = champ;
  cup.mvp = cupMvp(league, champ, cup);
  let aw = league.awards.find((a) => a.season === league.season);
  if (!aw) {
    aw = { season: league.season, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } };
    league.awards.push(aw);
  }
  aw.cupWinner = champ;
  aw.cupRunnerUp = runnerUp;
  aw.cupMvp = cup.mvp;
  for (const p of teamPlayers(league, champ)) p.awards.push({ season: league.season, type: 'NBA Cup' });
  if (cup.mvp !== undefined) league.players[cup.mvp].awards.push({ season: league.season, type: 'NBA Cup MVP' });
  const t = league.teams[champ];
  t.hype = Math.min(1, t.hype + 0.03);
  const score = `${Math.max(final.highPts!, final.lowPts!)}-${Math.min(final.highPts!, final.lowPts!)}`;
  const mvpName = cup.mvp !== undefined ? playerName(league.players[cup.mvp]) : '—';
  addNews(league, {
    kind: 'award',
    text: `🏆 The ${teamName(t)} win the NBA Cup, beating the ${teamName(league.teams[runnerUp])} ${score} in the championship. Cup MVP: ${mvpName}.`,
    tids: [champ, runnerUp],
    pids: cup.mvp !== undefined ? [cup.mvp] : [],
  });
  if (champ === league.userTid) {
    addInbox(league, {
      from: 'Owner',
      subject: 'NBA Cup champions!',
      body: `First trophy of the season. ${mvpName} was named Cup MVP. The fans loved it; now let's carry it into the spring.`,
      tone: 'good',
      link: '/league?tab=cup',
    });
  } else if (runnerUp === league.userTid) {
    addInbox(league, {
      from: 'Owner',
      subject: 'NBA Cup final',
      body: `We fell ${score} to the ${teamName(t)} in the championship. A good run, and the final doesn't count against our record.`,
      tone: 'neutral',
      link: '/league?tab=cup',
    });
  }
}

/**
 * Move the Cup along at the end of a day: seed the knockouts once every group game is played, then
 * schedule each round (and the quarterfinal losers' last game) when the previous one is done.
 */
export function advanceCup(league: League, rng: Rng) {
  const cup = league.cup;
  if (!cup || cup.season !== league.season || league.phase !== 'regular' || cup.champion !== undefined) return;
  if (!cup.seeds) {
    if (league.day < cup.nights[cup.nights.length - 1] || league.schedule.some((g) => g.cup === 'group' && !g.played)) return;
    seedKnockouts(league, cup, rng);
    return;
  }
  settleTies(league, cup);
  const qf = cup.bracket.filter((t) => t.round === 'qf');
  const sf = cup.bracket.filter((t) => t.round === 'sf');
  const fin = cup.bracket.find((t) => t.round === 'final');
  if (!sf.length && qf.length && qf.every((t) => t.winner !== undefined)) {
    for (const conf of ['E', 'W'] as const) {
      const [a, b] = qf.filter((t) => t.conf === conf);
      const wa = a.winner!;
      const wb = b.winner!;
      const [hi, lo] = seedOf(a, wa) < seedOf(b, wb) ? [wa, wb] : [wb, wa];
      addTie(league, cup, 'sf', conf, hi, lo, Math.min(seedOf(a, wa), seedOf(b, wb)), Math.max(seedOf(a, wa), seedOf(b, wb)), cup.sfDay);
    }
    // quarterfinal losers play one more game, between themselves
    const need = new Map(qf.map((t) => [loserOf(t), 1]));
    placeGames(league, pairFillers(league, need, rng), range(cup.qfDays[1] + 1, cup.finalDay - 1), rng);
    sortSchedule(league);
  } else if (!fin && sf.length && sf.every((t) => t.winner !== undefined)) {
    const e = sf.find((t) => t.conf === 'E')!.winner!;
    const w = sf.find((t) => t.conf === 'W')!.winner!;
    // neutral floor; the team with the better group-stage record is listed first
    const rows = new Map(cupTables(league).flatMap((t) => t.rows.map((r) => [r.tid, r] as const)));
    const [hi, lo] = crossGroup(league, rows.get(e)!, rows.get(w)!) <= 0 ? [e, w] : [w, e];
    addTie(league, cup, 'final', 'F', hi, lo, 1, 1, cup.finalDay);
    sortSchedule(league);
    addNews(league, { kind: 'general', text: `NBA Cup championship set: ${teamName(league.teams[e])} vs ${teamName(league.teams[w])}.`, tids: [e, w], pids: [] });
  } else if (fin && fin.winner !== undefined) {
    finishCup(league, cup, fin);
  }
}

/** Short label for a game's Cup stage, e.g. "NBA Cup · East B" or "NBA Cup Semifinal". */
export function cupLabel(league: League, g: { cup?: ScheduledGame['cup']; home: number; season?: number }): string | null {
  if (!g.cup) return null;
  if (g.cup === 'group') {
    const grp = league.cup?.groups.find((x) => x.tids.includes(g.home));
    return grp && (g.season === undefined || g.season === league.cup?.season) ? `NBA Cup · ${grp.id}` : 'NBA Cup';
  }
  return `NBA Cup ${CUP_ROUND_LABEL[g.cup]}`;
}
