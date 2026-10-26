import type { DraftPick, League, Player } from '../types';
import { DRAFT_PROSPECT, FREE_AGENT, RETIRED } from '../types';
import { Rng, clamp, hashString } from '../random';
import { contractExp, genTendencies, generatePlayer, refreshPlayerDerived } from '../playerGen';
import { shiftToOvr } from '../ratings';
import { TWO_WAY_MAX, addInbox, addNews, andList, curTeamSeason, playerName, prospects, standardRoster, teamPlayers, twoWayRoster, winPct } from './helpers';
import { FA_PRICE_CUT_DAYS, askingContract, rookieContract, twoWaySalary, valueScore } from './contracts';
import { numberTeam } from './jerseys';
import { logMove, logSwap } from './transactions';
import { pickLabel } from './trades';
import { blurb, combineFor, consensusRead, consensusView, holdCombine, rankByConsensus, readRange, staffRead, teamRead, type Read } from './prospects';

export const LOTTERY_ODDS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

/** Display OVR when the class arrives, the preseason before its draft, for the prospect at talent rank `i` (0 = best). */
function prospectLevel(i: number): number {
  return i < 30 ? 77 - 9.5 * Math.pow(i / 29, 0.8) : 64 - (5 * (i - 30)) / 42;
}

/** Generate a class of prospects for the draft held at the end of `year`'s season. */
export function generateDraftClass(league: League, year: number, rng: Rng, size = 72) {
  const created: Player[] = [];
  // nobody arrives sharing a name with a player still in the league
  const taken = new Set(Object.values(league.players).flatMap((p) => (p.tid === RETIRED ? [] : [playerName(p)])));
  for (let i = 0; i < size; i++) {
    const t = i / size;
    const talent = 0.85 - 2.4 * Math.pow(t, 0.75) + rng.normal(0, 0.45);
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
      taken,
    });
    p.bornYear = year - age;
    p.growth = clamp(rng.normal(0.15, 0.45), -1, 1);
    // level to how real classes arrive: ~77 at the top in the preseason, ~68 by the end of round one
    p.ratings = shiftToOvr(p.ratings, Math.round(prospectLevel(i) + rng.normal(0, 2.2)), league.ovrScale);
    refreshPlayerDerived(p, league.season, league.ovrScale);
    p.tend = genTendencies(p, rng);
    p.contract = { start: year + 1, salaries: [0] };
    league.players[p.pid] = p;
    created.push(p);
  }
  // (the combine drawn now is replaced by the real one in May: see holdCombine)
  for (const p of created) p.prospect = { rank: 99, combine: combineFor(p, rng), blurb: blurb(p) };
  rankProspects(league, year, rng);
  for (const p of created) if (p.prospect) p.prospect.rank0 = p.prospect.rank;
}

/**
 * Consensus big board: by the league's read of each prospect (prospects.ts), which carries the
 * room's error. (One draw a prospect from `rng`, as when the board was the truth plus media noise,
 * so the league's stream runs as it did.)
 */
export function rankProspects(league: League, year: number, rng: Rng) {
  for (let i = prospects(league, year).length; i > 0; i--) rng.normal(0, 1.2);
  rankByConsensus(league, year);
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

/**
 * Every team, worst record first. Like the NBA, ties are broken by a random draw, seeded by the
 * league and season so the Draft screen shows the same pre-lottery order the lottery used; in the
 * second round teams on the same record pick in the reverse of that draw.
 */
export function draftStandings(league: League, round: 1 | 2 = 1): { tid: number; playoff: boolean }[] {
  const draw = (tid: number) => hashString(`${league.id}:${league.season}:${tid}`);
  return league.teams
    .map((t) => {
      const ts = curTeamSeason(league, t.tid);
      return { tid: t.tid, wp: winPct(ts), playoff: ts.playoffRound >= 1, draw: draw(t.tid) };
    })
    .sort((a, b) => a.wp - b.wp || (round === 1 ? a.draw - b.draw : b.draw - a.draw))
    .map(({ tid, playoff }) => ({ tid, playoff }));
}

/**
 * Lottery chances per team (per thousand), in pre-lottery order. Teams on the same record split the
 * chances of the places they share, as in the NBA; the drawing only orders them for the picks the
 * lottery doesn't move.
 */
export function lotteryOdds(league: League): { tid: number; w: number; pre: number }[] {
  const lottery = draftStandings(league).filter((r) => !r.playoff);
  const pct = (tid: number) => winPct(curTeamSeason(league, tid));
  return lottery.map((r, i) => {
    const shared = lottery.flatMap((x, j) => (Math.abs(pct(x.tid) - pct(r.tid)) < 1e-9 ? [LOTTERY_ODDS[j] ?? 0] : []));
    return { tid: r.tid, w: shared.reduce((a, w) => a + w, 0) / shared.length, pre: i + 1 };
  });
}

/** Run the lottery for this season's draft and assign pick numbers. */
export function runLottery(league: League, rng: Rng): LotteryResult {
  const season = league.season;
  // the combine is in by now, even after a short postseason (on a stream of its own)
  holdCombine(league);
  const recs = draftStandings(league);
  const playoff = recs.filter((r) => r.playoff);
  const pool = lotteryOdds(league);
  const winners: typeof pool = [];
  const remaining = [...pool];
  for (let k = 0; k < 4 && remaining.length; k++) {
    const i = rng.weighted(remaining.map((x) => x.w));
    winners.push(remaining[i]);
    remaining.splice(i, 1);
  }
  const lotteryOrder = [...winners, ...remaining];
  const firstRound = [...lotteryOrder.map((x) => x.tid), ...playoff.map((r) => r.tid)];
  // the second round has no lottery: straight reverse order of record across the whole league, ties the other way round
  const secondRound = draftStandings(league, 2).map((r) => r.tid);
  const assign = (round: 1 | 2, order: number[]) => {
    order.forEach((origTid, i) => {
      const dp = league.draftPicks.find((d) => d.season === season && d.round === round && d.originalTid === origTid);
      if (!dp) return;
      dp.pick = i + 1;
      // a protected pick that lands inside its protection stays home and the obligation ends
      if (dp.protection && dp.pick <= dp.protection && dp.tid !== dp.originalTid) {
        const holder = league.teams[dp.tid];
        const orig = league.teams[dp.originalTid];
        addNews(league, {
          kind: 'draft',
          text: `The ${orig.name} keep their ${season} ${round === 1 ? 'first' : 'second'}-round pick (#${(round - 1) * 30 + dp.pick}, top-${(round - 1) * 30 + dp.protection} protected); the ${holder.name} come away empty.`,
          tids: [dp.tid, dp.originalTid],
          pids: [],
        });
        dp.tid = dp.originalTid;
      }
      delete dp.protection;
    });
  };
  assign(1, firstRound);
  resolveSwaps(league, season);
  assign(2, secondRound);
  const result: LotteryResult = {
    order: lotteryOrder.map((x, i) => ({ tid: x.tid, odds: x.w / 10, pick: i + 1, pre: x.pre })),
  };
  // (every team in the playoffs would leave nobody to draw)
  const top = result.order[0];
  if (top)
    addNews(league, {
      kind: 'draft',
      text: `Draft lottery: the ${league.teams[top.tid].region} ${league.teams[top.tid].name} win the No. 1 pick (pre-lottery position ${top.pre}).`,
      tids: [top.tid],
      pids: [],
    });
  const mine = league.draftPicks
    .filter((d) => d.season === season && d.tid === league.userTid && d.pick)
    .map((d) => (d.round - 1) * 30 + d.pick!)
    .sort((a, b) => a - b);
  if (mine.length) {
    addInbox(league, {
      from: 'Scouting Department',
      subject: 'Draft lottery results',
      body: `You hold ${andList(mine.map((k) => `#${k}`))}. Check the Draft board for the order, the combine results and the scouting blurbs.`,
      tone: 'neutral',
      link: '/office/draft',
    });
  }
  return result;
}

/**
 * This draft's pick swaps, once the first round's order is set: the team holding a first with a
 * swap right takes the other first instead when that one landed higher (the two picks change
 * owners), otherwise it keeps its own; either way the right is used up. A swap made is news and goes
 * in the transaction log; the user hears about any swap his team was in.
 */
export function resolveSwaps(league: League, season: number) {
  for (const right of league.draftPicks.filter((d) => d.season === season && d.round === 1 && d.swap !== undefined)) {
    const subject = league.draftPicks.find((d) => d.dpid === right.swap);
    delete right.swap;
    if (!subject || right.pick === undefined || subject.pick === undefined || right.tid === subject.tid) continue;
    const up = league.teams[right.tid];
    const down = league.teams[subject.tid];
    // the slot of the pick subject to the swap, and of the one holding the right
    const [theirs, ours] = [subject.pick, right.pick];
    const used = theirs < ours;
    if (used) {
      // labels as each team held its pick, before they change hands
      logSwap(league, up.tid, pickLabel(league, right), down.tid, pickLabel(league, subject));
      [right.tid, subject.tid] = [down.tid, up.tid];
      addNews(league, {
        kind: 'draft',
        text: `Pick swap: the ${up.region} ${up.name} use their swap right with the ${down.region} ${down.name} and pick #${theirs} instead of #${ours}.`,
        tids: [up.tid, down.tid],
        pids: [],
      });
    }
    const userUp = up.tid === league.userTid;
    if (!userUp && down.tid !== league.userTid) continue;
    const them = (userUp ? down : up).abbrev;
    addInbox(league, {
      from: 'Scouting Department',
      subject: used ? (userUp ? `Pick swap: we move up to #${theirs}` : `Pick swap: ${them} take our #${theirs}`) : `Pick swap with ${them} not used`,
      body: used
        ? userUp
          ? `Our swap right paid off: ${them}'s pick landed #${theirs}, ahead of ours at #${ours}, so the two picks change hands. We pick at #${theirs}.`
          : `${them} held the right to swap firsts with us, and our pick landed #${theirs}, ahead of theirs at #${ours}: they take it, and we pick at #${ours}.`
        : userUp
          ? `${them}'s pick landed #${theirs}, behind ours at #${ours}: the swap right lapses and we keep ours.`
          : `Our pick landed #${theirs}, behind ${them}'s at #${ours}: their swap right lapses and we keep ours.`,
      tone: used ? (userUp ? 'good' : 'bad') : 'neutral',
      link: '/office/draft',
    });
  }
}

export function draftOrder(league: League): DraftPick[] {
  return league.draftPicks.filter((d) => d.season === league.season && d.pick !== undefined).sort((a, b) => a.round - b.round || a.pick! - b.pick!);
}

export function nextPick(league: League): DraftPick | undefined {
  return draftOrder(league)[0];
}

export function draftPlayer(league: League, dp: DraftPick, pid: number) {
  const p = league.players[pid];
  if (!p || p.tid !== DRAFT_PROSPECT) throw new Error('Not an available prospect');
  const overall = (dp.round - 1) * 30 + dp.pick!;
  // how the room (and, for his own pick, the user's staff) read him tonight: what a draft grade compares his career with
  const room = readRange(consensusRead(league, p));
  const staff = dp.tid === league.userTid ? readRange(staffRead(league, p)) : null;
  // the value a team sees in him tonight: the room's read (the truth shows once he's on a roster)
  const seen = consensusView(league, p);
  p.tid = dp.tid;
  p.draft = {
    year: league.season,
    round: dp.round,
    pick: dp.pick!,
    tid: dp.tid,
    read: { ovr: room.ovr, pot: room.pot, rank: p.prospect?.rank, ...(staff ? { staff: { ovr: staff.ovr, pot: staff.pot } } : {}) },
  };
  p.contract = rookieContract(league, dp.pick!, dp.round, league.season + 1);
  // an AI team stashes its second-rounder on a two-way deal when it has a two-way slot for next
  // season (deals running out this season don't hold one) and either a roster that's nearly set
  // (11 signed for next season) or a pick who isn't ready (worth under 64)
  const committed = standardRoster(league, dp.tid).filter((x) => x.pid !== pid && contractExp(x.contract) > league.season).length;
  const twoWaysNext = twoWayRoster(league, dp.tid).filter((x) => contractExp(x.contract) > league.season).length;
  if (dp.round === 2 && dp.tid !== league.userTid && twoWaysNext < TWO_WAY_MAX && (committed >= 11 || valueScore(league, seen) < 64)) {
    p.contract = { start: league.season + 1, salaries: [twoWaySalary(league, league.season + 1), twoWaySalary(league, league.season + 2)], twoWay: true };
  }
  p.joinedSeason = league.season + 1;
  p.birdSince = league.season + 1;
  // a pick traded away this season can't come straight back as the player it became
  if (dp.tradedFrom) p.tradedFrom = dp.tradedFrom;
  const team = league.teams[dp.tid];
  team.rotation.order.push(p.pid);
  numberTeam(league, dp.tid);
  league.draftPicks = league.draftPicks.filter((d) => d.dpid !== dp.dpid);
  addNews(league, { kind: 'draft', text: `#${overall}: ${team.abbrev} select ${playerName(p)} (${p.pos}, ${p.college || p.country}).`, tids: [dp.tid], pids: [p.pid] });
  if (dp.round === 1 || dp.tid === league.userTid) logMove(league, 'draft', dp.tid, p, { note: `#${overall}` });
}

/**
 * The spread of an AI team's whim on draft night, on top of its own read of each prospect (its
 * board, see teamRead): the board carries most of a team's unpredictability now.
 */
export const DRAFT_NOISE = 0.8;

/** The bigs and the ball handlers on a roster, which nudge an AI team's pick toward need. */
export interface DraftNeed {
  bigs: number;
  guards: number;
}

export const draftNeed = (roster: Player[]): DraftNeed => ({ bigs: roster.filter((p) => p.ratings.hgt >= 60).length, guards: roster.filter((p) => p.ratings.hnd >= 60).length });

/**
 * How a team rates a prospect: potential and talent as it reads them (`read`: its board, see
 * teamRead; the mock goes by the consensus), `noise` (its whim on the night, see DRAFT_NOISE), a
 * nudge toward a big or a ball handler it's short of, and (`room`) a lean toward the consensus
 * rank. The user's staff go by their read alone.
 */
export function draftScore(p: Player, need: DraftNeed, noise = 0, read: Pick<Read, 'ovr' | 'pot'> = p, room = true): number {
  let s = read.pot * 0.65 + read.ovr * 0.35 + noise;
  if (need.bigs <= 2 && p.ratings.hgt >= 60) s += 1;
  if (need.guards <= 2 && p.ratings.hnd >= 60) s += 1;
  if (room) s -= (p.prospect?.rank ?? 50) * 0.04;
  return s;
}

/**
 * A team's pick: the best player available on its own board, with a nudge toward need. The user's
 * staff (his auto-pick) take the best on theirs, with no whim: never a player they read worse.
 */
export function aiChoose(league: League, tid: number, rng: Rng): Player | undefined {
  const avail = prospects(league, league.season);
  if (!avail.length) return undefined;
  const need = draftNeed(teamPlayers(league, tid));
  const staff = tid === league.userTid;
  let best: Player | undefined;
  let bs = -Infinity;
  for (const p of avail) {
    // (a draw a prospect for the user's pick too, so the league's stream runs the same either way)
    const whim = rng.normal(0, DRAFT_NOISE);
    const s = draftScore(p, need, staff ? 0 : whim, teamRead(league, tid, p), !staff);
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

/**
 * Make AI picks until it's the user's turn (or the draft ends). Returns picks made. `beforePick`:
 * what happens before an AI team picks (its draft-night trades, see aiDraftTrade).
 */
export function draftUntilUser(league: League, rng: Rng, includeUser = false, beforePick?: (dp: DraftPick) => void): number {
  let made = 0;
  for (;;) {
    let dp = nextPick(league);
    if (!dp) break;
    if (dp.tid === league.userTid && !includeUser) break;
    if (beforePick && dp.tid !== league.userTid) {
      beforePick(dp);
      // a trade can hand the pick to another team, the user's among them
      dp = nextPick(league);
      if (!dp) break;
      if (dp.tid === league.userTid && !includeUser) break;
    }
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
  // the best of the rest by the room's read get a free-agent chance
  const left = prospects(league, league.season).sort((a, b) => valueScore(league, consensusView(league, b)) - valueScore(league, consensusView(league, a)));
  left.forEach((p, i) => {
    if (i < 15) {
      p.tid = FREE_AGENT;
      p.draft = { year: league.season, round: 0, pick: 0, tid: null };
      p.contract = { start: league.season + 1, salaries: [0] };
      p.asking = askingContract(league, p);
      p.faDays = FA_PRICE_CUT_DAYS;
    } else {
      p.tid = RETIRED;
      p.retiredSeason = league.season;
      delete league.players[p.pid];
    }
  });
  // remove any leftover current-season picks
  league.draftPicks = league.draftPicks.filter((d) => d.season > league.season);
}
