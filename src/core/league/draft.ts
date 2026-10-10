import type { CombineResults, DraftPick, League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp } from '../random';
import { generatePlayer } from '../playerGen';
import { composites, ratingToHeight } from '../ratings';
import { addInbox, addNews, curTeamSeason, playerName, prospects, teamPlayers, winPct } from './helpers';
import { rookieContract } from './contracts';
import { valueScore } from './contracts';

export const LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

function combineFor(p: Player, rng: Rng): CombineResults {
  const r = p.ratings;
  const h = p.heightIn - 0.75 + rng.normal(0, 0.3);
  const wingspan = h + 3 + (r.hgt - 50) / 25 + rng.normal(0, 1.5);
  return {
    heightNoShoes: Math.round(h * 4) / 4,
    wingspan: Math.round(wingspan * 4) / 4,
    standingReach: Math.round((h * 1.33 + rng.normal(0, 1)) * 2) / 2,
    weight: p.weightLb,
    maxVert: Math.round((28 + r.ath * 0.13 + rng.normal(0, 1.5)) * 2) / 2,
    laneAgility: Math.round((12.4 - r.spd * 0.018 + rng.normal(0, 0.15)) * 100) / 100,
    sprint: Math.round((3.55 - r.spd * 0.0045 + rng.normal(0, 0.04)) * 100) / 100,
    shootingDrill: clamp(Math.round(6 + r.tp * 0.17 + rng.normal(0, 1.8)), 0, 25),
  };
}

function blurb(p: Player): string {
  const c = composites(p.ratings);
  const strengths: [string, number][] = [
    ['shot creation', (c.create + c.pnrHandle) / 2],
    ['shooting', (c.c3 + c.midShot) / 2],
    ['finishing', c.rim],
    ['playmaking', c.passing],
    ['perimeter defense', c.perDef],
    ['rim protection', c.rimProt],
    ['rebounding', (c.orb + c.drb) / 2],
    ['athleticism', (p.ratings.spd + p.ratings.ath) / 2],
  ];
  strengths.sort((a, b) => b[1] - a[1]);
  const weak = strengths[strengths.length - 1][0];
  return `${p.archetype}. Best tools: ${strengths[0][0]} and ${strengths[1][0]}. Needs work: ${weak}.`;
}

/** Generate a class of prospects for the draft held at the end of `year`'s season. */
export function generateDraftClass(league: League, year: number, rng: Rng, size = 72) {
  const created: Player[] = [];
  for (let i = 0; i < size; i++) {
    const t = i / size;
    const talent = 1.1 - 2.5 * Math.pow(t, 0.75) + rng.normal(0, 0.45);
    const age = clamp(Math.round(rng.normal(t < 0.3 ? 19.6 : 21, 1.1)), 18, 23);
    const p = generatePlayer(rng, {
      pid: league.nextPid++,
      season: league.season,
      tid: DRAFT_PROSPECT,
      age: age - (year - league.season),
      talent,
      scale: league.ovrScale,
      intlBias: 1.6,
      draftYear: year,
    });
    p.bornYear = year - age;
    p.growth = clamp(rng.normal(0.15, 0.45), -1, 1);
    p.contract = { start: year + 1, salaries: [0] };
    league.players[p.pid] = p;
    created.push(p);
  }
  rankProspects(league, year, rng);
  for (const p of created) {
    p.prospect = { rank: p.prospect?.rank ?? 99, combine: combineFor(p, rng), blurb: blurb(p) };
  }
  rankProspects(league, year, rng);
}

/** Consensus big board: mostly potential, some current ability, a little media noise. */
export function rankProspects(league: League, year: number, rng: Rng) {
  const list = prospects(league, year)
    .map((p) => ({ p, s: p.pot * 0.62 + p.ovr * 0.38 + rng.normal(0, 1.2) }))
    .sort((a, b) => b.s - a.s);
  list.forEach((x, i) => {
    x.p.prospect = { ...(x.p.prospect ?? { blurb: '' }), rank: i + 1 } as Player['prospect'];
  });
}

export function ensureFuturePicks(league: League, throughSeason: number) {
  for (let season = league.season; season <= throughSeason; season++) {
    for (const t of league.teams) {
      for (const round of [1, 2] as const) {
        if (!league.draftPicks.some((d) => d.season === season && d.round === round && d.originalTid === t.tid)) {
          league.draftPicks.push({ dpid: league.nextDpid++, season, round, originalTid: t.tid, tid: t.tid });
        }
      }
    }
  }
}

export interface LotteryResult {
  order: { tid: number; odds: number; pick: number; pre: number }[];
}

/** Run the lottery for this season's draft and assign pick numbers. */
export function runLottery(league: League, rng: Rng): LotteryResult {
  const season = league.season;
  const recs = league.teams.map((t) => {
    const ts = curTeamSeason(league, t.tid);
    return { tid: t.tid, wp: winPct(ts), playoff: ts.playoffRound >= 1, diff: ts.ptsFor - ts.ptsAgainst, rand: rng.next() };
  });
  const byWorst = (a: (typeof recs)[0], b: (typeof recs)[0]) => a.wp - b.wp || a.diff - b.diff || a.rand - b.rand;
  const lottery = recs.filter((r) => !r.playoff).sort(byWorst);
  const playoff = recs.filter((r) => r.playoff).sort(byWorst);
  const pool = lottery.map((r, i) => ({ tid: r.tid, w: LOTTERY_ODDS[i] ?? 0, pre: i + 1 }));
  const winners: typeof pool = [];
  const remaining = [...pool];
  for (let k = 0; k < 4 && remaining.length; k++) {
    const i = rng.weighted(remaining.map((x) => x.w));
    winners.push(remaining[i]);
    remaining.splice(i, 1);
  }
  const lotteryOrder = [...winners, ...remaining];
  const firstRound = [...lotteryOrder.map((x) => x.tid), ...playoff.map((r) => r.tid)];
  const secondRound = [...lottery, ...playoff].map((r) => r.tid);
  const assign = (round: 1 | 2, order: number[]) => {
    order.forEach((origTid, i) => {
      const dp = league.draftPicks.find((d) => d.season === season && d.round === round && d.originalTid === origTid);
      if (dp) dp.pick = i + 1;
    });
  };
  assign(1, firstRound);
  assign(2, secondRound);
  const result: LotteryResult = {
    order: lotteryOrder.map((x, i) => ({ tid: x.tid, odds: x.w / 10, pick: i + 1, pre: x.pre })),
  };
  const top = result.order[0];
  addNews(league, { kind: 'draft', text: `Draft lottery: the ${league.teams[top.tid].region} ${league.teams[top.tid].name} win the No. 1 pick (pre-lottery position ${top.pre}).`, tids: [top.tid], pids: [] });
  const mine = league.draftPicks.filter((d) => d.season === season && d.tid === league.userTid && d.pick);
  if (mine.length) {
    addInbox(league, {
      from: 'Scouting Department',
      subject: 'Draft lottery results',
      body: `You hold ${mine.map((d) => `#${d.pick}${d.round === 2 ? ' (2nd round)' : ''}`).join(', ')}. Check the Draft board: combine results and scouting blurbs are in.`,
      tone: 'neutral',
      link: '/draft',
    });
  }
  return result;
}

export function draftOrder(league: League): DraftPick[] {
  return league.draftPicks
    .filter((d) => d.season === league.season && d.pick !== undefined)
    .sort((a, b) => a.round - b.round || a.pick! - b.pick!);
}

export function nextPick(league: League): DraftPick | undefined {
  return draftOrder(league)[0];
}

export function draftPlayer(league: League, dp: DraftPick, pid: number) {
  const p = league.players[pid];
  if (!p || p.tid !== DRAFT_PROSPECT) throw new Error('Not an available prospect');
  const overall = (dp.round - 1) * 30 + dp.pick!;
  p.tid = dp.tid;
  p.draft = { year: league.season, round: dp.round, pick: dp.pick!, tid: dp.tid };
  p.contract = rookieContract(league, dp.pick!, dp.round, league.season + 1);
  p.joinedSeason = league.season + 1;
  const team = league.teams[dp.tid];
  team.rotation.order.push(p.pid);
  league.draftPicks = league.draftPicks.filter((d) => d.dpid !== dp.dpid);
  addNews(league, { kind: 'draft', text: `#${overall}: ${team.abbrev} select ${playerName(p)} (${p.pos}, ${p.college || p.country}).`, tids: [dp.tid], pids: [p.pid] });
}

/** AI selection: best player available with a nudge toward need. */
export function aiChoose(league: League, tid: number, rng: Rng): Player | undefined {
  const avail = prospects(league, league.season);
  if (!avail.length) return undefined;
  const roster = teamPlayers(league, tid);
  const bigs = roster.filter((p) => p.ratings.hgt >= 60).length;
  const guards = roster.filter((p) => p.ratings.hnd >= 60).length;
  let best: Player | undefined;
  let bs = -Infinity;
  for (const p of avail) {
    let s = p.pot * 0.65 + p.ovr * 0.35 + rng.normal(0, 1.5);
    if (bigs <= 2 && p.ratings.hgt >= 60) s += 1;
    if (guards <= 2 && p.ratings.hnd >= 60) s += 1;
    s -= (p.prospect?.rank ?? 50) * 0.04;
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

/** Make AI picks until it's the user's turn (or the draft ends). Returns picks made. */
export function draftUntilUser(league: League, rng: Rng, includeUser = false): number {
  let made = 0;
  for (;;) {
    const dp = nextPick(league);
    if (!dp) break;
    if (dp.tid === league.userTid && !includeUser) break;
    const choice = aiChoose(league, dp.tid, rng);
    if (!choice) {
      league.draftPicks = league.draftPicks.filter((d) => d.dpid !== dp.dpid);
      continue;
    }
    draftPlayer(league, dp, choice.pid);
    made++;
  }
  return made;
}

/** After the draft: top undrafted prospects become free agents, the rest leave the league. */
export function finishDraft(league: League) {
  const left = prospects(league, league.season).sort((a, b) => valueScore(league, b) - valueScore(league, a));
  left.forEach((p, i) => {
    if (i < 15) {
      p.tid = FREE_AGENT;
      p.draft = { year: league.season, round: 0, pick: 0, tid: null };
      p.contract = { start: league.season + 1, salaries: [0] };
    } else {
      p.tid = RETIRED;
      p.retiredSeason = league.season;
      delete league.players[p.pid];
    }
  });
  // remove any leftover current-season picks
  league.draftPicks = league.draftPicks.filter((d) => d.season > league.season);
}

export { ratingToHeight };
