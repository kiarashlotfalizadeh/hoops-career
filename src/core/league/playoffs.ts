import type { League, PlayInGame, PlayoffSeries, ScheduledGame } from '../types';
import { confStandings } from './standings';
import { addInbox, addNews, curTeamSeason, teamName } from './helpers';

export function startPlayIn(league: League) {
  league.playIn = [];
  for (const conf of ['E', 'W'] as const) {
    const st = confStandings(league, conf);
    st.forEach((r, i) => {
      const ts = curTeamSeason(league, r.tid);
      ts.seed = i < 6 ? i + 1 : null;
      ts.playoffRound = i < 6 ? 1 : i < 10 ? 0 : -1;
      ts.playIn = i >= 6 && i < 10;
    });
    league.playIn.push({ id: `${conf}-78`, conf, home: st[6].tid, away: st[7].tid });
    league.playIn.push({ id: `${conf}-910`, conf, home: st[8].tid, away: st[9].tid });
  }
  league.phase = 'playin';
  league.day = league.regularSeasonDays + 2;
  schedulePlayIn(league);
}

function schedulePlayIn(league: League) {
  for (const pi of league.playIn) {
    if (pi.winner !== undefined) continue;
    const exists = league.schedule.some((g) => g.type === 'playin' && g.seriesId === pi.id);
    if (exists) continue;
    const day = pi.id.endsWith('-8') ? league.day + 2 : league.day;
    league.schedule.push({ gid: league.nextGid++, day, home: pi.home, away: pi.away, type: 'playin', seriesId: pi.id });
  }
}

export function processPlayInResult(league: League, g: ScheduledGame, homeWon: boolean) {
  const pi = league.playIn.find((p) => p.id === g.seriesId);
  if (!pi) return;
  pi.winner = homeWon ? pi.home : pi.away;
  pi.loser = homeWon ? pi.away : pi.home;
  const conf = pi.conf;
  const g78 = league.playIn.find((p) => p.id === `${conf}-78`)!;
  const g910 = league.playIn.find((p) => p.id === `${conf}-910`)!;
  if (pi.id.endsWith('-78')) {
    curTeamSeason(league, pi.winner).seed = 7;
    curTeamSeason(league, pi.winner).playoffRound = 1;
  }
  if (pi.id.endsWith('-910')) {
    curTeamSeason(league, pi.loser).playoffRound = -1;
  }
  if (g78.winner !== undefined && g910.winner !== undefined && !league.playIn.some((p) => p.id === `${conf}-8`)) {
    const last: PlayInGame = { id: `${conf}-8`, conf, home: g78.loser!, away: g910.winner };
    league.playIn.push(last);
    league.schedule.push({ gid: league.nextGid++, day: league.day + 2, home: last.home, away: last.away, type: 'playin', seriesId: last.id });
  }
  if (pi.id.endsWith('-8')) {
    curTeamSeason(league, pi.winner).seed = 8;
    curTeamSeason(league, pi.winner).playoffRound = 1;
    curTeamSeason(league, pi.loser).playoffRound = -1;
  }
}

export function playInDone(league: League) {
  return league.playIn.filter((p) => p.id.endsWith('-8') && p.winner !== undefined).length === 2;
}

export function startPlayoffs(league: League) {
  league.playoffs = [];
  for (const conf of ['E', 'W'] as const) {
    const seeds: number[] = [];
    for (const t of league.teams) {
      if (t.conf !== conf) continue;
      const ts = curTeamSeason(league, t.tid);
      if (ts.seed) seeds[ts.seed] = t.tid;
    }
    const pairs: [number, number][] = [
      [1, 8],
      [4, 5],
      [3, 6],
      [2, 7],
    ];
    pairs.forEach(([h, l], i) => {
      league.playoffs.push({ id: `${conf}1-${i}`, round: 1, conf, high: seeds[h], low: seeds[l], highSeed: h, lowSeed: l, highWins: 0, lowWins: 0 });
    });
  }
  league.phase = 'playoffs';
  league.day += 2;
  const user = league.userTid;
  const inIt = league.playoffs.some((s) => s.high === user || s.low === user);
  addInbox(league, {
    from: 'League Office',
    subject: inIt ? 'Playoffs: you are in!' : 'Playoffs begin',
    body: inIt ? 'Your team has qualified for the playoffs. Tactics matter more than ever: the assistant coach will scout each opponent before the series.' : 'The playoffs are underway. Your season is over. Use the time to plan the draft and free agency.',
    tone: inIt ? 'good' : 'neutral',
    link: '/league/playoffs',
  });
}

const HOME_PATTERN = [true, true, false, false, true, false, true]; // 2-2-1-1-1 from the higher seed's view

export function schedulePlayoffDay(league: League) {
  for (const s of league.playoffs) {
    if (s.winner !== undefined) continue;
    const pending = league.schedule.some((g) => g.seriesId === s.id && !g.played);
    if (pending) continue;
    const n = s.highWins + s.lowWins;
    const highHome = HOME_PATTERN[n];
    league.schedule.push({
      gid: league.nextGid++,
      day: league.day,
      home: highHome ? s.high : s.low,
      away: highHome ? s.low : s.high,
      type: 'playoffs',
      seriesId: s.id,
    });
  }
}

export function processPlayoffResult(league: League, g: ScheduledGame, homeWon: boolean) {
  const s = league.playoffs.find((x) => x.id === g.seriesId);
  if (!s) return;
  const winner = homeWon ? g.home : g.away;
  if (winner === s.high) s.highWins++;
  else s.lowWins++;
  if (s.highWins === 4 || s.lowWins === 4) {
    s.winner = s.highWins === 4 ? s.high : s.low;
    const loser = s.winner === s.high ? s.low : s.high;
    const wt = league.teams[s.winner];
    const lt = league.teams[loser];
    curTeamSeason(league, s.winner).playoffRound = s.round + 1;
    curTeamSeason(league, loser).playoffRound = s.round;
    const res = `${Math.max(s.highWins, s.lowWins)}-${Math.min(s.highWins, s.lowWins)}`;
    const roundName = s.round === 4 ? 'NBA Finals' : s.round === 3 ? 'Conference Finals' : s.round === 2 ? 'Conference Semifinals' : 'First Round';
    addNews(league, { kind: 'general', text: `${teamName(wt)} defeat the ${lt.name} ${res} in the ${roundName}.`, tids: [wt.tid, lt.tid], pids: [] });
    advanceRounds(league);
  }
}

function seedOf(s: PlayoffSeries, tid: number) {
  return tid === s.high ? s.highSeed : s.lowSeed;
}

function advanceRounds(league: League) {
  for (const round of [1, 2, 3]) {
    const rs = league.playoffs.filter((s) => s.round === round);
    if (!rs.length || rs.some((s) => s.winner === undefined)) continue;
    if (league.playoffs.some((s) => s.round === round + 1)) continue;
    if (round < 3) {
      for (const conf of ['E', 'W'] as const) {
        const cs = rs.filter((s) => s.conf === conf).sort((a, b) => a.id.localeCompare(b.id));
        for (let i = 0; i < cs.length; i += 2) {
          const a = cs[i];
          const b = cs[i + 1];
          const ta = a.winner!;
          const tb = b.winner!;
          const sa = seedOf(a, ta);
          const sb = seedOf(b, tb);
          const highFirst = sa < sb || (sa === sb && curTeamSeason(league, ta).won >= curTeamSeason(league, tb).won);
          league.playoffs.push({
            id: `${conf}${round + 1}-${i / 2}`,
            round: round + 1,
            conf,
            high: highFirst ? ta : tb,
            low: highFirst ? tb : ta,
            highSeed: highFirst ? sa : sb,
            lowSeed: highFirst ? sb : sa,
            highWins: 0,
            lowWins: 0,
          });
        }
      }
    } else {
      const e = rs.find((s) => s.conf === 'E')!;
      const w = rs.find((s) => s.conf === 'W')!;
      const te = e.winner!;
      const tw = w.winner!;
      const eTs = curTeamSeason(league, te);
      const wTs = curTeamSeason(league, tw);
      const eHigh = eTs.won / Math.max(1, eTs.won + eTs.lost) >= wTs.won / Math.max(1, wTs.won + wTs.lost);
      league.playoffs.push({
        id: 'F4-0',
        round: 4,
        conf: 'F',
        high: eHigh ? te : tw,
        low: eHigh ? tw : te,
        highSeed: eHigh ? seedOf(e, te) : seedOf(w, tw),
        lowSeed: eHigh ? seedOf(w, tw) : seedOf(e, te),
        highWins: 0,
        lowWins: 0,
      });
    }
  }
}

export function champion(league: League): number | undefined {
  return league.playoffs.find((s) => s.round === 4)?.winner;
}

export function seriesLabel(s: PlayoffSeries) {
  return s.round === 4 ? 'NBA Finals' : s.round === 3 ? `${s.conf === 'E' ? 'East' : 'West'} Finals` : s.round === 2 ? `${s.conf === 'E' ? 'East' : 'West'} Semifinals` : `${s.conf === 'E' ? 'East' : 'West'} First Round`;
}
