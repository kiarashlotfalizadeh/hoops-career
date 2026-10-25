// Multi-season invariant check: plays N seasons of the real league, then a few of a fictional one
// (whose coach is fired after the first and takes over another team), through every phase (user
// team auto-managed), and asserts league-state invariants after each phase.
// Usage: npx tsx scripts/league-invariants.ts [seasons] [rngSeed] [userTid] [fictionalSeasons]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import * as S from '../src/core/league/season';
import * as H from '../src/core/league/helpers';
import * as C from '../src/core/league/contracts';
import * as FA from '../src/core/league/freeAgency';
import * as R from '../src/core/league/rfa';
import * as N from '../src/core/league/negotiation';
import * as TD from '../src/core/league/tenDay';
import { nextPick } from '../src/core/league/draft';
import { finalsHomeCourt, standings } from '../src/core/league/standings';
import { cupTables } from '../src/core/league/cup';
import { missesAllStarGame } from '../src/core/league/awards';
import { takeOverTeam } from '../src/core/league/owner';
import { frozen } from '../src/core/league/books';
import * as TR from '../src/core/league/trades';
import { makeItWork } from '../src/core/league/tradeHelp';
import * as P from '../src/core/league/proposals';
import { openStint, registryProblems, userCoach } from '../src/core/league/coaches';
import { contractExp, extensionStart, salaryFor } from '../src/core/playerGen';
import { CAP, seasonLabel } from '../src/core/constants';
import { arenaCapacity, aiTicketPrice, attendanceFor, MERCH_PER_GAME, LOCAL_TV_PER_GAME } from '../src/core/league/finances';
import { booksOutlook, sanctionedTax } from '../src/core/league/books';
import { pickProjection } from '../src/core/analysis/odds';
import * as REC from '../src/core/league/records';
import type { League, Player } from '../src/core/types';

const [seasons, rngSeed, userTid, fictionalSeasons] = [5, 42, 19, 2].map((d, i) => Number(process.argv[i + 2] ?? d));
let L: League;
/** Which league the run is on, for the violation log. */
let label = '';
const viol = new Map<string, string[]>();
const bad = (kind: string, msg: string) => {
  const v = viol.get(kind) ?? [];
  v.push(`[${label}${L.season} ${L.phase} d${L.day}] ${msg}`);
  viol.set(kind, v);
};
const nm = (pid: number) => `${pid}:${L.players[pid] ? H.playerName(L.players[pid]) : '?'}`;
const std = (tid: number) => H.standardRoster(L, tid);
const date = (day: number) => H.dayToDate(L.season, day);

function walk(o: unknown, path: string): void {
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) bad('non-finite number', path);
    return;
  }
  if (!o || typeof o !== 'object') return;
  const proto = Object.getPrototypeOf(o);
  if (proto !== Object.prototype && proto !== Array.prototype) return bad('non-plain object (IndexedDB)', path);
  for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
}

/** The most a deal can start at: his max, or with the honors for one (All-NBA, MVP, Defensive Player of the Year) 35% of the cap (see playerMax). */
const topSalary = (p: Player, cap: ReturnType<typeof H.CAP_FOR>) =>
  p.awards.some((a) => a.type.startsWith('All-NBA') || a.type === 'MVP' || a.type === 'Defensive Player of the Year')
    ? Math.round(cap.salaryCap * 0.35)
    : cap.maxContract(p.experience);

function check() {
  const season = L.season;
  const ph = L.phase;
  walk(L, 'league');
  // the record book: every list best first and no longer than it keeps, a franchise's best never past the league's
  const book = L.records;
  if (book) {
    for (const kind of ['reg', 'post'] as const) {
      const shelves = [
        { who: 'league', s: book.league[kind], keep: REC.KEEP.league[kind] },
        ...Object.entries(book.teams).map(([tid, t]) => ({ who: tid, s: t[kind], keep: REC.KEEP.team[kind] })),
      ];
      for (const { who, s, keep } of shelves)
        for (const side of ['players', 'teams'] as const)
          for (const [stat, list] of Object.entries(s[side]) as [string, number[][]][]) {
            if (list.length > keep || list.some((r, i) => i > 0 && r[0] > list[i - 1][0]))
              bad('record book list out of order', `${who} ${kind} ${side} ${stat} ${JSON.stringify(list.map((r) => r[0]))}`);
            const top = (book.league[kind][side] as Record<string, number[][]>)[stat]?.[0]?.[0];
            if (who !== 'league' && list[0] && top !== undefined && list[0][0] > top) bad('franchise record past the league record', `${who} ${kind} ${side} ${stat}`);
          }
    }
  }
  for (const t of L.teams) {
    const n = std(t.tid).length;
    // (through the draft and the re-sign window, as for the standard roster, the two-way deals that run into next season)
    const tw = H.twoWayRoster(L, t.tid).filter((p) => !(ph === 'draft' || ph === 'resign') || contractExp(p.contract) > L.season).length;
    const who = `${t.abbrev}${t.tid === L.userTid ? '*' : ''}`;
    // standard roster: 13-15 in season, plus hardship 10-days beyond 15; two-way deals sit outside it (max 3)
    const hardship = std(t.tid).filter((p) => p.contract.tenDay?.hardship).length;
    if (H.inSeason(L) && (n < CAP.rosterMin || n - hardship > CAP.rosterMax)) bad('roster size in season', `${who} ${n} (${hardship} hardship)`);
    // through the draft and the re-sign window expiring deals still sit on the roster; count next season's contracts
    const signed = ph === 'draft' || ph === 'resign' ? H.standardRoster(L, t.tid).filter((p) => contractExp(p.contract) > L.season).length : n;
    if (signed > H.OFFSEASON_ROSTER_MAX) bad('roster above offseason limit', `${who} ${signed}`);
    if (tw > H.TWO_WAY_MAX) bad('too many two-way players', `${who} ${tw}`);
    if (ph === 'preseason' && t.tid !== L.userTid && n < CAP.rosterMin) bad('AI roster <13 in preseason', `${who} ${n}`);
    if (new Set(t.rotation.order).size !== t.rotation.order.length) bad('dup pid in rotation', who);
    for (const pid of t.rotation.order) if (L.players[pid]?.tid !== t.tid) bad('rotation has non-roster pid', `${who} ${nm(pid)}`);
    if (new Set(t.seasons.map((s) => s.season)).size !== t.seasons.length) bad('dup TeamSeason', who);
    if (t.deadMoney.some((d) => !(d.amount > 0))) bad('bad dead money', who);
  }
  for (const p of Object.values(L.players)) {
    if (!(p.tid >= -3 && p.tid < L.teams.length)) bad('invalid tid', `${nm(p.pid)} ${p.tid}`);
    if (p.contract.salaries.some((x) => !(x >= 0))) bad('negative/NaN salary', nm(p.pid));
    if (p.tid >= 0) {
      const need = ph === 'freeAgency' ? season + 1 : ph === 'preseason' || H.inSeason(L) ? season : null;
      if (need !== null && salaryFor(p, need) <= 0) bad('rostered without salary this contract season', `${nm(p.pid)} ${JSON.stringify(p.contract)}`);
      if (contractExp(p.contract) < season) bad('rostered with expired contract', nm(p.pid));
      if (p.retiredSeason !== undefined) bad('rostered but retired', nm(p.pid));
      if (H.inSeason(L) && !L.teams[p.tid].rotation.order.includes(p.pid)) bad('rostered but not in rotation', nm(p.pid));
      const cap = H.CAP_FOR(L, p.contract.start);
      const first = p.contract.salaries[0];
      // (a 10-day contract's one salary is the minimum prorated: see checkContracts)
      if (
        !p.contract.twoWay &&
        !p.contract.tenDay &&
        p.contract.start > L.startSeason &&
        (first > topSalary(p, cap) + 10 || first < cap.minContract - 1 || p.contract.salaries.length > 5)
      )
        bad('contract outside min/max/5yr', `${nm(p.pid)} ${JSON.stringify(p.contract)}`);
      if ((ph === 'preseason' || ph === 'regular') && p.draft.round > 0 && p.draft.year === season - 1 && p.experience !== 0)
        bad('rookie experience != 0', `${nm(p.pid)} exp ${p.experience}`);
    }
    // a signed extension: a standard deal's, starting after this season (newSeason makes it the contract), within the min and max of its first season
    const next = p.contract.next;
    if (next) {
      const start = extensionStart(p.contract)!;
      const cap = H.CAP_FOR(L, start);
      if (p.tid < 0 || p.contract.twoWay) bad('extension off a standard roster deal', `${nm(p.pid)} tid ${p.tid} ${JSON.stringify(p.contract)}`);
      if (start <= season) bad('extension not taken over', `${nm(p.pid)} ${JSON.stringify(p.contract)}`);
      if (
        !next.salaries.length ||
        next.salaries.length > 5 ||
        next.salaries.some((x) => !(x > 0)) ||
        next.salaries[0] > topSalary(p, cap) + 10 ||
        next.salaries[0] < cap.minContract - 1
      )
        bad('extension outside min/max/5yr', `${nm(p.pid)} ${JSON.stringify(p.contract)}`);
    }
    if (p.tid === -1 && !(p.asking && p.asking.amount > 0)) bad('FA without asking price', nm(p.pid));
    // waivers: only free agents released in season, cleared or claimed before the season ends
    if (p.waivers && p.tid !== -1) bad('rostered player on waivers', nm(p.pid));
    if (p.waivers && !H.inSeason(L)) bad('waivers outside the season', nm(p.pid));
    // generated players get tendencies like the seed's calibrated ones (without them a star plays like a role player)
    if (p.tid >= -2 && !p.tend) bad('player without tendencies', nm(p.pid));
    if (p.tid === -3 && p.contract.salaries.some((x) => x > 0)) bad('retired with salary', nm(p.pid));
    if (p.tid === -2 && p.draft.year < season) bad('stale prospect', nm(p.pid));
    if (p.injury && !(p.injury.gamesRemaining > 0 && p.injury.gamesRemaining < 200)) bad('bad injury length', `${nm(p.pid)} ${p.injury.gamesRemaining}`);
    const rows = p.stats.filter((s) => s.season === season && !s.playoffs && !s.real);
    const gp = rows.reduce((a, s) => a + s.gp, 0);
    // a player traded between teams with different schedules can pass 82, as in the NBA
    if (gp > (rows.length > 1 ? 88 : 82)) bad('player gp over the limit', `${nm(p.pid)} ${gp} (${rows.length} teams)`);
  }
  if (ph !== 'freeAgency' && L.faBids?.length) bad('offers to free agents outside free agency', L.faBids.map((b) => nm(b.pid)).join(', '));
  for (const b of L.faBids ?? []) if (L.players[b.pid]?.tid !== -1) bad('offer to a player off the market', nm(b.pid));
  for (const b of L.faBids ?? []) if (L.players[b.pid]?.rfa) bad('top-free-agent offer to a restricted free agent', nm(b.pid));
  checkRfa();
  const first = ['resign', 'freeAgency'].includes(ph) ? season + 1 : season;
  const cnt = new Map<string, number>();
  for (const d of L.draftPicks) {
    if (d.season < first || !(d.tid >= 0 && d.tid < 30)) bad('stale/unowned pick', JSON.stringify(d));
    cnt.set(`${d.season}-${d.round}-${d.originalTid}`, (cnt.get(`${d.season}-${d.round}-${d.originalTid}`) ?? 0) + 1);
  }
  for (let s = first; s <= season + 3; s++)
    for (const r of [1, 2])
      for (let t = 0; t < 30; t++)
        if ((cnt.get(`${s}-${r}-${t}`) ?? 0) !== 1 && !(ph === 'draft' && s === season)) bad('pick count != 1', `${s} r${r} orig ${t}: ${cnt.get(`${s}-${r}-${t}`) ?? 0}`);
  // AI trade offers: none outlives its longest stand (three weeks, for one whose mail is still
  // unread: see P.OFFER_MAX_DAYS), every asset is still with the team that would send it, and none
  // asks for a player the user made untouchable (who must be on the user's team)
  for (const p of L.proposals ?? []) {
    if (p.season !== season || L.day - p.day > P.OFFER_MAX_DAYS) bad(`trade offer older than ${P.OFFER_MAX_DAYS} days`, `#${p.id} ${p.season} d${p.day}`);
    for (const side of [p.offer.a, p.offer.b]) {
      for (const pid of side.pids) if (L.players[pid]?.tid !== side.tid) bad('trade offer player not on his team', `#${p.id} ${nm(pid)}`);
      for (const d of side.dpids) if (L.draftPicks.find((x) => x.dpid === d)?.tid !== side.tid) bad('trade offer pick not with its team', `#${p.id} pick ${d}`);
    }
    if (p.offer.a.tid !== L.userTid) bad('trade offer to another team', `#${p.id}`);
    for (const pid of p.offer.a.pids) if (L.untouchable?.includes(pid)) bad('trade offer asks for an untouchable', `#${p.id} ${nm(pid)}`);
  }
  if ((L.proposals?.length ?? 0) > P.MAX_OPEN || new Set(L.proposals?.map((p) => p.tid)).size !== (L.proposals?.length ?? 0))
    bad('too many trade offers', String(L.proposals?.length));
  for (const pid of L.untouchable ?? []) if (L.players[pid]?.tid !== L.userTid) bad('untouchable not on the user team', nm(pid));
  checkTerms();
  checkTransactions();
  checkContracts();
  checkRetiredNumbers();
  // the coach registry: one open job per team, held by its coach (the user's with his team), names unique
  for (const p of registryProblems(L)) bad('coach registry', p);
  try {
    if (JSON.stringify(structuredClone(L)) !== JSON.stringify(L)) bad('structuredClone mismatch', '');
  } catch (e) {
    bad('structuredClone throws', String(e));
  }
}

function checkClinch() {
  const st = standings(L);
  const rem = (tid: number) => L.schedule.filter((g) => g.type === 'regular' && !g.played && (g.home === tid || g.away === tid)).length;
  for (const conf of ['E', 'W']) {
    const cr = st.filter((r) => r.conf === conf);
    for (const r of cr) {
      for (const [mark, from] of [
        ['x', 6],
        ['p', 10],
      ] as const)
        if (r.clinched === mark && cr.slice(from).some((o) => o.won + rem(o.tid) >= r.won)) bad(`clinch '${mark}' wrong`, `${L.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
      if (r.clinched === 'e' && cr.filter((o) => o.tid !== r.tid && o.won > r.won + rem(r.tid)).length < 10) bad("clinch 'e' wrong", `${L.teams[r.tid].abbrev} ${r.won}-${r.lost}`);
    }
  }
}

/** Every game day of a team this regular season (the Cup final included: it's a game night too), in order. */
function gameDays(tid: number): number[] {
  return L.schedule
    .filter((g) => (g.type === 'regular' || g.type === 'cup') && (g.home === tid || g.away === tid))
    .map((g) => g.day)
    .sort((a, b) => a - b);
}

/** No team twice on one day, three days running or four games in five nights. */
function checkCrowding() {
  for (const t of L.teams) {
    const days = gameDays(t.tid);
    if (days.some((d, i) => i >= 1 && d === days[i - 1])) bad('two games on one day', t.abbrev);
    if (days.some((d, i) => i >= 2 && d - days[i - 2] <= 2)) bad('three days running', t.abbrev);
    if (days.some((d, i) => i >= 3 && d - days[i - 3] <= 4)) bad('four games in five nights', t.abbrev);
  }
}

/**
 * The calendar: the All-Star Game on a February Sunday with the weekend around it dark, the trade
 * deadline the Thursday ten days before, and a generated season dark on Thanksgiving and Christmas Eve.
 */
function checkCalendar(generated: boolean) {
  const asg = date(L.allStarDay);
  if (asg.getUTCDay() !== 0 || asg.getUTCMonth() !== 1) bad('All-Star Game not on a February Sunday', asg.toISOString().slice(0, 10));
  if (date(L.tradeDeadlineDay).getUTCDay() !== 4 || L.allStarDay - L.tradeDeadlineDay !== 10)
    bad('deadline not the Thursday ten days before', `${L.tradeDeadlineDay} vs ${L.allStarDay}`);
  for (const g of L.schedule) {
    if (g.day >= L.allStarDay - 2 && g.day <= L.allStarDay + 1) bad('game on All-Star weekend', `day ${g.day}`);
    const d = date(g.day);
    const thanksgiving = d.getUTCMonth() === 10 && d.getUTCDay() === 4 && d.getUTCDate() >= 22 && d.getUTCDate() <= 28;
    if (generated && (thanksgiving || (d.getUTCMonth() === 11 && d.getUTCDate() === 24))) bad('game on a holiday', d.toISOString().slice(0, 10));
  }
}

/** Who wore each retired number on its team when it went up (league, team and number -> pids): only they may wear it there, until they leave. */
const keepers = new Map<string, Set<number>>();

/**
 * Retired numbers: once per legend on a team, his name and season on it, and nobody who joined the
 * team since wears one (a player who wore it there when it went up keeps it until he leaves). A
 * number is first seen at the check after the playoffs it was retired at, before anyone can join.
 */
function checkRetiredNumbers() {
  for (const t of L.teams) {
    const list = t.retired ?? [];
    if (new Set(list.map((r) => r.pid)).size !== list.length) bad('number retired twice for a player', `${t.abbrev} ${JSON.stringify(list)}`);
    const roster = H.teamPlayers(L, t.tid);
    for (const r of list) {
      if (!r.name || !(r.season <= L.season) || (L.players[r.pid] && L.players[r.pid].tid !== -3)) bad('retired number off', `${t.abbrev} ${JSON.stringify(r)}`);
      const key = `${label}${t.tid}#${r.jersey}`;
      if (!keepers.has(key)) keepers.set(key, new Set(roster.filter((p) => p.jersey === r.jersey).map((p) => p.pid)));
      const kept = keepers.get(key)!;
      for (const pid of kept) if (L.players[pid]?.tid !== t.tid) kept.delete(pid);
      for (const p of roster) if (p.jersey === r.jersey && !kept.has(p.pid)) bad('newcomer wears a retired number', `${t.abbrev} #${r.jersey} (${r.name}): ${nm(p.pid)}`);
    }
  }
}

/** Opening night: everyone wears his own number, nobody active shares a name, no four games in five nights. */
function checkOpeningNight() {
  for (const t of L.teams) {
    const numbers = H.teamPlayers(L, t.tid).map((p) => p.jersey);
    if (new Set(numbers).size !== numbers.length) bad('teammates share a number', `${t.abbrev} ${numbers.sort().join(',')}`);
  }
  checkCrowding();
  const names = Object.values(L.players)
    .filter((p) => p.tid !== -3)
    .map((p) => H.playerName(p));
  if (new Set(names).size !== names.length) bad('active players share a name', `${names.length - new Set(names).size}`);
}

/**
 * The All-Star Game is over: four guards and six frontcourt players at least among each
 * conference's twelve, all from that conference, and a healthy replacement for each one an injury
 * keeps out more than two games; and All-Star Saturday was held.
 */
function checkAllStars() {
  const aw = L.awards.find((a) => a.season === L.season);
  if (!aw || aw.allStarMvp === undefined) return bad('no All-Star Game', '');
  for (const conf of ['E', 'W'] as const) {
    const ps = aw.allStars[conf].map((pid) => L.players[pid]);
    const picks = ps.slice(0, 12);
    const guards = picks.filter((p) => p.pos === 'PG' || p.pos === 'SG').length;
    if (picks.length < 12 || new Set(ps).size !== ps.length || guards < 4 || picks.length - guards < 6) bad('All-Star selection', `${conf}: ${ps.length} picked, ${guards} guards`);
    if (ps.some((p) => p.tid < 0 || L.teams[p.tid].conf !== conf)) bad('All-Star from the other conference', conf);
    const subs = ps.slice(12);
    if (subs.length !== picks.filter(missesAllStarGame).length || subs.some(missesAllStarGame))
      bad('All-Star replacements', `${conf}: ${picks.filter(missesAllStarGame).length} hurt, ${subs.length} replaced`);
  }
  // All-Star Saturday: eight shooters and four dunkers, scores in range, the top three and two in the finals, the winners with the award
  const sat = aw.saturday;
  if (!sat || sat.three.length !== 8 || sat.dunk.length !== 4 || new Set(sat.three.map((e) => e.pid)).size !== 8 || new Set(sat.dunk.map((e) => e.pid)).size !== 4)
    return bad('All-Star Saturday fields', `${sat?.three.length} shooters, ${sat?.dunk.length} dunkers`);
  const dunks = sat.dunk.flatMap((e) => [...e.r1, ...(e.final ?? []), ...(e.r1Off ?? []), ...(e.finalOff ?? [])]);
  const finalist = (i: number) => i < 3;
  if (sat.three.some((e, i) => e.r1 < 0 || e.r1 > 40 || finalist(i) === (e.final === undefined)) || dunks.some((d) => d.score < 30 || d.score > 50 || !d.text))
    bad('All-Star Saturday scores', JSON.stringify(sat));
  const won = (pid: number, type: string) => L.players[pid]?.awards.some((a) => a.season === L.season && a.type === type);
  if (!won(sat.three[0].pid, 'Three-Point Contest') || !won(sat.dunk[0].pid, 'Slam Dunk Contest')) bad('All-Star Saturday winner without the award', '');
}

/**
 * The regular season is over: 82 games a team, all played, the Cup's knockout window included in
 * the crowding rules, and the Cup played out (quarter and semifinals at the better seed on their
 * nights, the three group winners and the best runner-up in each conference through).
 */
function checkRegularSeasonOver() {
  for (const t of L.teams) {
    const mine = L.schedule.filter((g) => g.type === 'regular' && (g.home === t.tid || g.away === t.tid));
    if (mine.length !== 82 || mine.some((g) => !g.played)) bad('regular season not 82 games', `${t.abbrev} ${mine.filter((g) => g.played).length}/${mine.length}`);
  }
  checkCrowding();
  const cup = L.cup;
  if (!cup || cup.season !== L.season) return;
  const round = (r: string) => cup.bracket.filter((x) => x.round === r).length;
  if (round('qf') !== 4 || round('sf') !== 2 || round('final') !== 1 || cup.bracket.some((x) => x.winner === undefined) || cup.champion === undefined)
    return bad('Cup not played out', `${cup.bracket.length} ties`);
  for (const x of cup.bracket) {
    const g = L.schedule.find((s) => s.gid === x.gid);
    const night = x.round === 'qf' ? cup.qfDays.includes(x.day) : x.day === (x.round === 'sf' ? cup.sfDay : cup.finalDay);
    if (!g || g.day !== x.day || !night || g.cup !== x.round || g.type !== (x.round === 'final' ? 'cup' : 'regular')) bad('Cup tie off its night', JSON.stringify(x));
    else if (x.round !== 'final' && (g.home !== x.high || x.highSeed >= x.lowSeed)) bad('Cup tie not at the better seed', JSON.stringify(x));
  }
  const tables = cupTables(L);
  for (const conf of ['E', 'W'] as const) {
    const mine = tables.filter((t) => t.group.conf === conf);
    const seeds = cup.seeds?.[conf] ?? [];
    if (seeds.length !== 4 || !mine.every((t) => seeds.slice(0, 3).includes(t.rows[0].tid)) || !mine.some((t) => t.rows[1].tid === seeds[3])) bad('Cup knockout seeds', conf);
  }
  if (L.awards.find((a) => a.season === L.season)?.cupWinner !== cup.champion) bad('Cup champion missing from awards', '');
}

/**
 * The postseason: 7 v 8 and 9 v 10 at the better seeds and the last spot at the 7 v 8 loser, first
 * rounds 1-8, 4-5, 3-6 and 2-7, the better seed's 2-2-1-1-1 home court, and the Finals' by record
 * and tiebreakers.
 */
function checkPostseason() {
  const seed = (tid: number) => H.curTeamSeason(L, tid).seed;
  for (const conf of ['E', 'W'] as const) {
    const st = standings(L)
      .filter((r) => r.conf === conf)
      .map((r) => r.tid);
    const pi = (id: string) => L.playIn.find((p) => p.id === `${conf}-${id}`);
    const [g78, g910, g8] = [pi('78'), pi('910'), pi('8')];
    if (!g78 || !g910 || !g8 || g78.home !== st[6] || g78.away !== st[7] || g910.home !== st[8] || g910.away !== st[9] || g8.home !== g78.loser || g8.away !== g910.winner) {
      bad('play-in pairings', conf);
      continue;
    }
    if (st.slice(0, 6).some((tid, i) => seed(tid) !== i + 1) || seed(g78.winner!) !== 7 || seed(g8.winner!) !== 8) bad('playoff seeds', conf);
    const firstRound = L.playoffs
      .filter((s) => s.round === 1 && s.conf === conf)
      .map((s) => `${s.highSeed}-${s.lowSeed}`)
      .sort()
      .join();
    if (firstRound !== '1-8,2-7,3-6,4-5') bad('first-round pairs', `${conf} ${firstRound}`);
  }
  for (const s of L.playoffs) {
    const home = L.schedule
      .filter((g) => g.seriesId === s.id)
      .sort((a, b) => a.day - b.day)
      .map((g) => (g.home === s.high ? 'H' : 'A'))
      .join('');
    if (home !== 'HHAAHAH'.slice(0, s.highWins + s.lowWins)) bad('home court not 2-2-1-1-1', `${s.id} ${home}`);
    if (s.round < 4 && (s.highSeed >= s.lowSeed || seed(s.high) !== s.highSeed || seed(s.low) !== s.lowSeed)) bad('better seed without home court', s.id);
    if (s.round === 4 && finalsHomeCourt(L, s.high, s.low) !== s.high) bad('Finals home court', s.id);
  }
}

function checkSeasonEnd() {
  const aw = L.awards.find((a) => a.season === L.season)!;
  const line = (pid: number) => H.seasonTotals(L.players[pid], L.season);
  const gp = (pid: number) => line(pid)?.gp ?? 0;
  const mpg = (pid: number) => (gp(pid) ? line(pid)!.min / gp(pid) : 0);
  // Most Improved needs last season's numbers: none in a fictional league's first season
  const lastSeason = Object.values(L.players).some((p) => (H.seasonTotals(p, L.season - 1)?.gp ?? 0) >= 20);
  // 65 games for the MVP, DPOY and MIP; Rookie and Sixth Man of the Year aren't covered by the rule, so Sixth Man asks for a voter's 50
  for (const k of ['mvp', 'dpoy', 'smoy', 'mip'] as const)
    if ((aw[k] === undefined && (k !== 'mip' || lastSeason)) || (aw[k] !== undefined && gp(aw[k]!) < (k === 'smoy' ? 50 : 65)))
      bad('award eligibility', `${k} ${aw[k]} gp ${aw[k] !== undefined ? gp(aw[k]!) : '-'}`);
  // ... and 20 minutes a game, as for All-NBA and All-Defense
  for (const pid of [aw.mvp, aw.dpoy, aw.mip, ...aw.allNba.flat(), ...aw.allDefense.flat()])
    if (pid !== undefined && (gp(pid) < 65 || mpg(pid) < 20)) bad('award without 65 games and 20 minutes', `${nm(pid)} ${gp(pid)} gp ${mpg(pid).toFixed(1)} mpg`);
  if (aw.mip !== undefined && (L.players[aw.mip].draft.year === L.season - 1 || (H.seasonTotals(L.players[aw.mip], L.season - 1)?.gp ?? 0) < 20))
    bad("MIP without last season's numbers", nm(aw.mip));
  if (aw.roy !== undefined && L.players[aw.roy].draft.year !== L.season - 1) bad('ROY not a rookie', nm(aw.roy));
  for (const pid of aw.allRookie) if (L.players[pid].draft.year !== L.season - 1) bad('All-Rookie not a rookie', nm(pid));
  if (new Set(aw.allNba.flat()).size !== 15 || new Set(aw.allDefense.flat()).size !== 10 || aw.champion === undefined) bad('All-NBA/All-Defense/champion', '');
  if (L.playoffs.length !== 15 || L.playoffs.some((s) => Math.max(s.highWins, s.lowWins) !== 4)) bad('playoff bracket', `${L.playoffs.length} series`);
  for (const conf of ['E', 'W'])
    if (
      L.teams
        .filter((t) => t.conf === conf)
        .map((t) => H.curTeamSeason(L, t.tid).seed)
        .filter(Boolean)
        .sort((a, b) => a! - b!)
        .join() !== '1,2,3,4,5,6,7,8'
    )
      bad('seeds', conf);
  for (const t of L.teams) if (H.curTeamSeason(L, t.tid).won + H.curTeamSeason(L, t.tid).lost !== 82) bad('team != 82 games', t.abbrev);
  if (aw.smoy !== undefined) {
    const s = H.seasonTotals(L.players[aw.smoy], L.season)!;
    if (s.gs >= s.gp - s.gs) bad('6MOY started as often as he came off the bench', `${nm(aw.smoy)} ${s.gs}/${s.gp}`);
  }
  for (const t of L.teams) {
    const ts = H.curTeamSeason(L, t.tid);
    if (ts.attendance / Math.max(1, ts.homeWon + ts.homeLost) > arenaCapacity(t)) bad('attendance over capacity', t.abbrev);
  }
  for (const g of L.games) if (g.season === L.season && (g.att ?? 0) > arenaCapacity(L.teams[g.home.tid])) bad('a crowd over capacity', `${g.gid} ${g.att}`);
  // playoff series: every other day at most
  for (const s of L.playoffs) {
    const days = L.schedule
      .filter((g) => g.seriesId === s.id)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    if (days.some((d, i) => i > 0 && d - days[i - 1] < 2)) bad('playoff games on consecutive days', `${s.id} ${days.join(',')}`);
  }
  checkPostseason();
}

function checkLottery() {
  // second round: straight reverse order of record across all 30 teams
  const r2 = L.draftPicks.filter((d) => d.season === L.season && d.round === 2).sort((a, b) => a.pick! - b.pick!);
  const pct = r2.map((d) => H.winPct(H.curTeamSeason(L, d.originalTid)));
  if (pct.some((x, i) => i > 0 && x < pct[i - 1] - 1e-9)) bad('second round not by record', pct.map((x) => x.toFixed(3)).join(','));
}

/**
 * Deal terms: a swap right ties a first to another team's first of the same draft, neither
 * protected nor with its slot set, each pick in one swap at most; no team past its cash limit for
 * the contract season.
 */
function checkTerms() {
  const inOne = new Set<number>();
  for (const d of L.draftPicks) {
    if (d.swap === undefined) continue;
    const o = L.draftPicks.find((x) => x.dpid === d.swap);
    if (
      !o ||
      o.season !== d.season ||
      d.round !== 1 ||
      o.round !== 1 ||
      o.originalTid === d.originalTid ||
      d.protection ||
      o.protection ||
      d.pick !== undefined ||
      o.pick !== undefined
    )
      bad('bad pick swap', JSON.stringify([d, o]));
    if (inOne.has(d.dpid) || inOne.has(d.swap)) bad('pick in two swaps', String(d.dpid));
    inOne.add(d.dpid).add(d.swap);
  }
  const cs = H.contractSeason(L);
  for (const t of L.teams) {
    const c = t.cashTrades;
    const limit = TR.cashRoom(L, t.tid).limit;
    if (c && c.season === cs && (c.sent > limit || c.received > limit || c.sent < 0 || c.received < 0))
      bad('cash in trades over the limit', `${t.abbrev} ${JSON.stringify(c)} limit ${limit}`);
  }
}

/**
 * Contract talks, 10-day contracts and the exceptions: talks only with a real team and in range,
 * and over once he signs (no free-agent or re-sign talks left on a player who signed elsewhere); a
 * 10-day contract only in the regular season on a roster, up to twenty days out (a second one runs
 * on from the first), under his minimum, and two at most with one team; a team never on the
 * mid-level and the room exception, nor the room exception and the bi-annual, in one contract
 * season, and on the room exception only after using its cap space.
 */
function checkContracts() {
  const cs = H.contractSeason(L);
  const cap = H.CAP_FOR(L);
  for (const p of Object.values(L.players)) {
    const t = p.talks;
    if (t && (!L.teams[t.tid] || !(t.patience >= 0 && t.patience <= 5) || (t.sour ?? 0) > 0.06 + 1e-9 || (t.counter && !(t.counter.amount > 0))))
      bad('talks out of range', `${nm(p.pid)} ${JSON.stringify(t)}`);
    if (t && p.tid >= 0 && p.tid !== t.tid && t.kind !== 'extend') bad('talks left on a player who signed elsewhere', `${nm(p.pid)} ${JSON.stringify(t)}`);
    const td = p.contract.tenDay;
    if (!td) continue;
    const min = p.experience >= 3 ? cap.vetMin : cap.minContract;
    if (L.phase !== 'regular' || p.tid < 0) bad('10-day contract outside the regular season', `${nm(p.pid)} ${L.phase} tid ${p.tid}`);
    else if (!(td.until > L.day && td.until <= L.day + 2 * TD.TEN_DAYS && td.until <= L.regularSeasonDays + 1) || !(p.contract.salaries[0] > 0 && p.contract.salaries[0] < min))
      bad('10-day contract off its terms', `${nm(p.pid)} ${JSON.stringify(p.contract)} day ${L.day}`);
    if (!p.tenDays || p.tenDays.season !== L.season || !p.tenDays.by[p.tid] || Object.values(p.tenDays.by).some((n) => n > TD.TEN_DAY_MAX))
      bad('10-day count off', `${nm(p.pid)} ${JSON.stringify(p.tenDays)}`);
  }
  for (const t of L.teams) {
    if (t.mleSeason === cs && t.roomSeason === cs) bad('mid-level and room exception in one season', t.abbrev);
    if (t.roomSeason === cs && (t.spaceSeason !== cs || t.baeSeason === cs))
      bad('room exception without cap space, or with the bi-annual', `${t.abbrev} ${JSON.stringify([t.spaceSeason, t.baeSeason])}`);
  }
}

/** How many teams used cap space and each exception in a contract season (the last use each made). */
function routeUse(season: number) {
  const n = (k: 'spaceSeason' | 'mleSeason' | 'roomSeason' | 'baeSeason') => L.teams.filter((t) => t[k] === season).length;
  return { space: n('spaceSeason'), mle: n('mleSeason'), room: n('roomSeason'), bae: n('baeSeason') };
}

/** What the user's contract moves came to this season: talks (offers, counters, signings under the ask, breakdowns), stretched releases and 10-days. */
const contractTally = { offers: 0, counters: 0, under: 0, broke: 0, lowballs: 0, stretched: 0, tenDays: 0 };

/** 10-day contracts signed this season (players seen on one), by AI teams and on hardship spots. */
const tenDayTally = { ai: new Set<number>(), hardship: new Set<number>() };

/** What the user's deals with deal terms came to this season. */
const termsTally = { trades: 0, swaps: 0, cash: 0 };

/**
 * Preseason: the user trades with terms, as a player might. His next first, top-10 protected, the
 * right to swap the following draft's firsts and $1M for an AI team's next second (the first team in
 * order that takes it; without the first if the Stepien rule or a swap stands in the way), then
 * "what would make this work?" with cash for another team's second.
 */
function tradeWithTerms() {
  const u = L.userTid;
  const s = L.season;
  const mine = L.draftPicks.find((d) => d.originalTid === u && d.tid === u && d.round === 1 && d.season === s + 1 && !TR.inSwap(L, d));
  for (const t of L.teams) {
    if (t.tid === u) continue;
    const second = L.draftPicks.find((d) => d.originalTid === t.tid && d.tid === t.tid && d.round === 2 && d.season === s + 1);
    if (!second) continue;
    const swaps = TR.swapSeasons(L, u, t.tid).filter((y) => y === s + 2);
    const tries: TR.TradeOffer[] = [
      ...(mine ? [{ a: { tid: u, pids: [], dpids: [mine.dpid], protect: { [mine.dpid]: 10 }, swaps, cash: 1_000 }, b: { tid: t.tid, pids: [], dpids: [second.dpid] } }] : []),
      { a: { tid: u, pids: [], dpids: [], swaps, cash: 1_000 }, b: { tid: t.tid, pids: [], dpids: [second.dpid] } },
    ];
    const o = tries.find((x) => TR.evaluateTrade(L, x).accept);
    if (!o) continue;
    TR.executeTrade(L, o);
    termsTally.trades++;
    termsTally.swaps += o.a.swaps?.length ?? 0;
    termsTally.cash += o.a.cash ?? 0;
    if (mine && o.a.dpids.includes(mine.dpid) && mine.protection !== 10) bad('protection not set by the trade', JSON.stringify(mine));
    break;
  }
  for (const t of [...L.teams].reverse()) {
    const second = L.draftPicks.find((d) => d.originalTid === t.tid && d.tid === t.tid && d.round === 2 && d.season === s + 2);
    if (t.tid === u || !second) continue;
    const r = makeItWork(L, { a: { tid: u, pids: [], dpids: [] }, b: { tid: t.tid, pids: [], dpids: [second.dpid] } }, [], { cash: true });
    if (!r.offer?.a.cash || r.offer.a.pids.length || r.offer.a.dpids.length) continue;
    if (!TR.evaluateTrade(L, r.offer).accept) bad('a cash offer that would make it work is turned down', JSON.stringify(r.offer));
    TR.executeTrade(L, r.offer);
    termsTally.trades++;
    termsTally.cash += r.offer.a.cash;
    break;
  }
}

/** The transaction log: ids unique and increasing, real teams, a player on every move, and sides (one per team) on trades only. */
function checkTransactions() {
  let last = 0;
  for (const t of L.transactions ?? []) {
    if (!(t.id > last)) bad('transaction ids not increasing', `${last} then ${t.id}`);
    last = Math.max(last, t.id);
    if (!t.tids.length || t.tids.some((tid) => !L.teams[tid])) bad('transaction with a bad team', JSON.stringify(t));
    // (an exercised pick swap lists the pick each team gave up, as a trade does)
    const picksMoved = t.kind === 'trade' || t.kind === 'swap';
    if (picksMoved !== !!t.sides) bad('trade sides off a trade', JSON.stringify(t));
    if (t.sides && t.sides.map((x) => x.tid).join() !== t.tids.join()) bad("trade sides don't match its teams", JSON.stringify(t));
    if (!picksMoved && (t.pid === undefined || !t.name)) bad('move without a player', JSON.stringify(t));
    if (t.kind === 'swap' && t.sides!.some((x) => x.picks.length !== 1 || x.players.length)) bad('swap without one pick a side', JSON.stringify(t));
  }
  if (last && !((L.nextTxnId ?? 0) > last)) bad('transaction id reused', `next ${L.nextTxnId}, last ${last}`);
}

/**
 * Restricted free agency: a qualifying offer only on an expiring player of the team that made it
 * (re-sign period) or on a free agent (free agency), never on a roster otherwise and never outside
 * the summer; offer sheets 2-5 years within the min and max, from another team, decided by their
 * last match day; an AI team with one sheet pending at most; and every team's cap holds in free
 * agency exactly its restricted free agents' holds plus the offer sheets it signed, in capPayroll too.
 */
function checkRfa() {
  const ph = L.phase;
  const next = L.season + 1;
  const cap = H.CAP_FOR(L, next);
  const held = new Map<number, number>();
  const sheets = new Map<number, number>();
  for (const p of Object.values(L.players)) {
    const r = p.rfa;
    if (!r) continue;
    if (ph !== 'resign' && ph !== 'freeAgency') bad('restricted free agent outside the summer', `${nm(p.pid)} ${ph}`);
    else if (ph === 'resign' ? p.tid !== r.tid || contractExp(p.contract) > L.season || !!r.sheet : p.tid !== -1)
      bad('restricted free agent on a roster', `${nm(p.pid)} tid ${p.tid} rfa ${JSON.stringify(r)}`);
    if (!L.teams[r.tid] || !(r.qo > 0) || (ph === 'freeAgency' && !((r.hold ?? 0) >= r.qo)))
      bad('qualifying offer without a team, amount or hold', `${nm(p.pid)} ${JSON.stringify(r)}`);
    if (ph === 'freeAgency') held.set(r.tid, (held.get(r.tid) ?? 0) + (r.hold ?? r.qo));
    const s = r.sheet;
    if (!s) continue;
    sheets.set(s.tid, (sheets.get(s.tid) ?? 0) + 1);
    held.set(s.tid, (held.get(s.tid) ?? 0) + s.amount);
    if (s.tid === r.tid || !L.teams[s.tid]) bad('offer sheet from his own team', nm(p.pid));
    if (s.years < 2 || s.years > 5 || s.amount < cap.minContract - 1 || s.amount > cap.maxContract(p.experience) + 10)
      bad('offer sheet outside 2-5 yrs or min/max', `${nm(p.pid)} ${JSON.stringify(s)}`);
    if (s.until < s.day || s.until > FA.FA_DAYS - 1 || s.until < L.faDay) bad('offer sheet past its match day', `${nm(p.pid)} ${JSON.stringify(s)} faDay ${L.faDay}`);
  }
  for (const [tid, n] of sheets) if (n > 1 && tid !== L.userTid) bad('AI team with two offer sheets pending', `${L.teams[tid].abbrev} ${n}`);
  if (ph !== 'freeAgency') return;
  for (const t of L.teams) {
    const want = held.get(t.tid) ?? 0;
    const holds = FA.capHolds(L, t.tid).reduce((a, h) => a + h.amount, 0);
    if (holds !== want || FA.capPayroll(L, t.tid, next) !== H.payroll(L, t.tid, next) + want) bad('cap holds off in free agency', `${t.abbrev} holds ${holds} want ${want}`);
  }
}

/** Offer sheets pending now, to check how each is settled (see settledSheets). */
const sheetSnapshot = () =>
  new Map(
    Object.values(L.players)
      .filter((p) => p.rfa?.sheet)
      .map((p) => [p.pid, { own: p.rfa!.tid, ...p.rfa!.sheet! }]),
  );

/**
 * The sheets in `before` that were decided since (contracts starting `next`): each player is with
 * his team or the offering one, on exactly the sheet's terms. Returns how many were matched and declined.
 */
function settledSheets(before: ReturnType<typeof sheetSnapshot>, next: number): { matched: number; declined: number } {
  const out = { matched: 0, declined: 0 };
  for (const [pid, s] of before) {
    const p = L.players[pid];
    if (p.rfa?.sheet) continue;
    const c = C.makeContract(L, s.amount, s.years, next, p.experience);
    if ((p.tid !== s.own && p.tid !== s.tid) || p.contract.start !== next || p.contract.salaries.join() !== c.salaries.join())
      bad('offer sheet settled off its terms', `${nm(pid)} tid ${p.tid} ${JSON.stringify(p.contract)} vs ${JSON.stringify(s)}`);
    out[p.tid === s.own ? 'matched' : 'declined']++;
  }
  return out;
}

/** Restricted free agents now, with the team holding their rights. */
const rfaSnapshot = () => new Map(R.restrictedFreeAgents(L).map((p) => [p.pid, p.rfa!.tid]));

/** Restricted free agents in `before` who left the market since went only to their own team, or to one whose offer sheet wasn't matched (or are free agents after a withdrawal). */
function checkRfaMoves(before: Map<number, number>, sheets: ReturnType<typeof sheetSnapshot>) {
  for (const [pid, own] of before) {
    const p = L.players[pid];
    if (p.rfa || p.tid === own || (p.tid === -1 && !p.rfa) || p.tid === sheets.get(pid)?.tid) continue;
    bad('restricted free agent signed without an offer sheet', `${nm(pid)} -> ${p.tid} (rights ${own})`);
  }
}

/** The user's restricted free agents with an offer sheet: he matches when his team's AI would (roster and budget allowing), else lets them go. */
function decideUserSheets() {
  for (const p of R.restrictedFreeAgents(L, L.userTid).filter((x) => x.rfa!.sheet)) {
    const match = R.aiMatchVerdict(L, p).match && !R.sheetDecisionBlocked(L, p.pid, true);
    const res = R.userDecideSheet(L, p.pid, match);
    if (!res.ok) bad('offer sheet decision refused', `${nm(p.pid)} ${res.reason}`);
  }
}

/** The user signs the best AI restricted free agent he can pay to an offer sheet at his asking price (at least two years). */
function sheetOnRfa(): number | null {
  const u = L.userTid;
  const rfas = R.restrictedFreeAgents(L)
    .filter((p) => p.rfa!.tid !== u && !p.rfa!.sheet)
    .sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a));
  for (const p of rfas) {
    const a = C.askingContract(L, p, u);
    const years = Math.max(R.SHEET_MIN_YEARS, Math.min(4, a.years));
    const amount = Math.ceil((a.amount * (1 + Math.abs(years - a.years) * 0.03)) / 50) * 50;
    if (FA.userOffer(L, p.pid, amount, years).ok) {
      if (!L.players[p.pid].rfa?.sheet || L.players[p.pid].rfa!.sheet!.tid !== u) bad('user offer sheet not pending', nm(p.pid));
      return p.pid;
    }
  }
  return null;
}

function checkOptions(user: boolean) {
  for (const p of Object.values(L.players)) if (C.pendingOption(L, p) && (user || p.tid !== L.userTid)) bad('undecided contract option', `${nm(p.pid)} ${p.contract.option}`);
}

/**
 * The owner fires the coach after the playoffs (the review itself is unit-tested): nothing of his old
 * team's is his to run until he takes over another one, which he does before the draft.
 */
function fireAndMove() {
  const old = L.userTid;
  L.fired = true;
  const fa = H.freeAgents(L)[0];
  if (fa && FA.userOffer(L, fa.pid, C.askingContract(L, fa, old).amount, 1).reason !== C.FIRED_REASON) bad('fired coach can sign', nm(fa.pid));
  const ai = (old + 1) % L.teams.length;
  const mine = std(old)[0];
  if (mine && !TR.validateTrade(L, { a: { tid: old, pids: [mine.pid], dpids: [] }, b: { tid: ai, pids: [], dpids: [] } }).some((e) => e.includes('fired')))
    bad('fired coach can trade', '');
  // the job on offer: the worst record in the league
  const to = L.teams.filter((t) => t.tid !== old).sort((a, b) => H.winPct(H.curTeamSeason(L, a.tid)) - H.winPct(H.curTeamSeason(L, b.tid)))[0].tid;
  takeOverTeam(L, to);
  const coached = L.teams.filter((t) => t.coach.name === L.coachName).map((t) => t.tid);
  // his job with the new team starts next season, as his tenure does
  const job = openStint(userCoach(L)!);
  if (
    L.fired ||
    L.userTid !== to ||
    coached.join() !== String(to) ||
    L.teams[old].rotation.manual ||
    L.teams[old].tactics.manual ||
    L.tenureStart !== L.season + 1 ||
    job?.tid !== to ||
    job.from !== L.season + 1
  )
    bad('take-over', `${L.teams[old].abbrev} -> ${L.teams[to].abbrev}, coaching ${coached.join()}, job ${JSON.stringify(job)}`);
}

/** Preseason: the user extends his best player in a final season who'll talk, at his asking price. */
function extendBest() {
  const p = H.teamPlayers(L, L.userTid)
    .filter((x) => !C.extensionBlockedReason(L, x) && !C.extensionRefusal(L, x))
    .sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a))[0];
  // (a frozen budget allows no raises: the owner's rule, not a refusal to check)
  if (!p || frozen(L)) return;
  const ask = C.extensionAsk(L, p);
  const res = N.userExtend(L, p.pid, ask.amount, ask.years);
  if (!res.ok || !p.contract.next) bad('extension at his ask refused', `${nm(p.pid)} ${res.reason}`);
}

function fixUserRoster() {
  const u = L.userTid;
  while (std(u).length > CAP.rosterMax) releaseStretched(std(u).sort((a, b) => C.valueScore(L, a) - C.valueScore(L, b))[0]);
  for (let g = 0; std(u).length < CAP.rosterMin && g < 40; g++)
    for (const p of H.freeAgents(L).sort((a, b) => b.ovr - a.ovr)) {
      const ask = C.askingContract(L, p, u);
      // one year at his price, else the years he asks for
      if (FA.userOffer(L, p.pid, ask.amount, 1).ok || FA.userOffer(L, p.pid, ask.amount, ask.years).ok) break;
    }
}

/**
 * The user releases a player, stretching his dead money when there's something to stretch: the
 * same total, spread evenly over twice the seasons left plus one (this season's as usual once it's
 * under way), each stretched season marked.
 */
function releaseStretched(p: Player) {
  const plain = C.releaseSchedule(L, p);
  const stretch = C.stretchDeadMoney(L, plain);
  const tid = p.tid;
  C.releasePlayer(L, p, { stretch: !!stretch });
  if (!stretch) return;
  contractTally.stretched++;
  const dead = L.teams[tid].deadMoney.filter((d) => d.pid === p.pid);
  const spread = dead.filter((d) => d.stretched);
  const sum = (xs: { amount: number }[]) => xs.reduce((a, d) => a + d.amount, 0);
  if (sum(dead) !== sum(plain) || spread.length % 2 !== 1 || spread.some((d, i) => i > 0 && d.season !== spread[i - 1].season + 1))
    bad('stretched dead money off', `${nm(p.pid)} ${JSON.stringify(plain)} -> ${JSON.stringify(dead)}`);
}

/**
 * The summer market: the user negotiates with the two best free agents he can pay who aren't top
 * or restricted ones. A lowball to the first (refused, and AI teams' prices unchanged), then 87% of
 * the ask for his length to each: signed if that's within his walk-away price, else a counter
 * between the offer and his ask, which he then takes as offered.
 */
function negotiate() {
  const u = L.userTid;
  const s = H.contractSeason(L);
  const other = (u + 1) % L.teams.length;
  const fas = H.freeAgents(L)
    // (a minimum-level player just takes his minimum: talks are about more than that)
    .filter(
      (p) =>
        !p.rfa &&
        !FA.marqueeFA(L, p) &&
        N.talkAsk(L, p, 'fa').amount > H.CAP_FOR(L, s).vetMin * 1.5 &&
        FA.offerRoute(L, p, N.talkAsk(L, p, 'fa').amount, s, N.talkAsk(L, p, 'fa').years),
    )
    .sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a))
    .slice(0, 2);
  const round50 = (x: number) => Math.round(x / 50) * 50;
  for (const [i, p] of fas.entries()) {
    const ask = N.talkAsk(L, p, 'fa');
    if (i === 0) {
      const aiAsk = C.askingContract(L, p, other).amount;
      const r = FA.userOffer(L, p.pid, round50(ask.amount * 0.7), ask.years);
      contractTally.offers++;
      contractTally.lowballs++;
      if (r.ok) bad('a lowball was taken', `${nm(p.pid)} ${r.reason}`);
      if (C.askingContract(L, p, other).amount !== aiAsk) bad("a lowball moved an AI team's price", nm(p.pid));
      if (/broke down/.test(r.reason)) {
        contractTally.broke++;
        continue;
      }
    }
    const offer = round50(N.askFor(L, p, 'fa', ask.years) * 0.87);
    const walk = N.walkAwayFor(L, p, 'fa', ask.years);
    const r = FA.userOffer(L, p.pid, offer, ask.years);
    contractTally.offers++;
    if (r.ok) {
      contractTally.under++;
      if (offer < walk - 1) bad('signed under his walk-away price', `${nm(p.pid)} ${offer} < ${walk}`);
      continue;
    }
    if (/broke down/.test(r.reason)) contractTally.broke++;
    const c = r.counter;
    if (!c) continue;
    contractTally.counters++;
    if (offer >= walk - 1 || c.amount < offer || c.amount > N.askFor(L, p, 'fa', c.years))
      bad('counter off', `${nm(p.pid)} offer ${offer} walk ${walk} counter ${JSON.stringify(c)}`);
    const took = FA.userOffer(L, p.pid, c.amount, c.years);
    if (took.ok) contractTally.under += c.amount < N.askFor(L, p, 'fa', c.years) ? 1 : 0;
    else if (!/roster is full|cap space|run \d years at most/.test(took.reason)) bad('his counter, as offered, refused', `${nm(p.pid)} ${took.reason}`);
  }
}

/**
 * The re-sign period: the user's first expiring player worth keeping is negotiated with (87% of his
 * ask for his length: signed within his walk-away price, else a counter between the offer and the
 * ask, taken as offered). Returns whether talks happened.
 */
function resignTalks(p: Player): boolean {
  if (contractTally.offers > 0) return false;
  const round50 = (x: number) => Math.round(x / 50) * 50;
  const ask = N.talkAsk(L, p, 'resign');
  // (one who wants more than his Bird rights allow goes to the market: no talks)
  const limit = C.resignLimit(L, p, L.userTid);
  if (C.askingContract(L, p, L.userTid).amount > limit || N.askFor(L, p, 'resign', ask.years) > limit) return false;
  const offer = round50(N.askFor(L, p, 'resign', ask.years) * 0.87);
  const walk = N.walkAwayFor(L, p, 'resign', ask.years);
  const r = FA.userResign(L, p.pid, offer, ask.years);
  contractTally.offers++;
  if (r.ok) {
    contractTally.under++;
    if (offer < walk - 1) bad('re-signed under his walk-away price', `${nm(p.pid)} ${offer} < ${walk}`);
    return true;
  }
  const c = r.counter;
  if (!c) {
    bad('no counter in the re-sign period', `${nm(p.pid)} ${r.reason}`);
    return true;
  }
  contractTally.counters++;
  if (offer >= walk - 1 || c.amount < offer || c.amount > N.askFor(L, p, 'resign', c.years))
    bad('counter off', `${nm(p.pid)} offer ${offer} walk ${walk} counter ${JSON.stringify(c)}`);
  const took = FA.userResign(L, p.pid, c.amount, c.years);
  if (!took.ok) bad('his counter, as offered, refused', `${nm(p.pid)} ${took.reason}`);
  else contractTally.under += c.amount < N.askFor(L, p, 'resign', c.years) ? 1 : 0;
  return true;
}

/** The day of the 10-day exercise: the user's 10-day player, signed on January 5. */
let tenDayPid: number | null = null;

/**
 * January 5: the user signs the best free agent who'd take the minimum to a 10-day contract (making
 * room on a full roster), five days later to a second one, and on its last day for the rest of the
 * season; each step checked.
 */
function tenDayStep() {
  const u = L.userTid;
  if (L.day === TD.tenDayOpenDay(L)) {
    if (std(u).length >= CAP.rosterMax) releaseStretched(std(u).sort((a, b) => C.valueScore(L, a) - C.valueScore(L, b))[0]);
    const p = H.freeAgents(L)
      // (not one he released this season: the rule refuses him, and the check is whether the signing works)
      .filter((x) => TD.wantsTenDay(L, x, u) && !x.injury && !C.releasedBy(L, x, u))
      .sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a))[0];
    if (!p) return;
    const r = TD.userTenDay(L, p.pid);
    if (!r.ok || !p.contract.tenDay || p.tid !== u) return bad('10-day signing refused', `${nm(p.pid)} ${r.reason}`);
    tenDayPid = p.pid;
    contractTally.tenDays++;
    return;
  }
  const p = tenDayPid === null ? null : L.players[tenDayPid];
  if (!p || p.tid !== u || !p.contract.tenDay) return;
  if (L.day === TD.tenDayOpenDay(L) + 5) {
    const until = p.contract.tenDay.until;
    const r = TD.userTenDay(L, p.pid);
    if (!r.ok || p.contract.tenDay.until !== Math.min(until + TD.TEN_DAYS, L.regularSeasonDays + 1) || TD.tenDaysWith(L, p, u) !== 2)
      bad('second 10-day off', `${nm(p.pid)} ${r.reason} ${JSON.stringify(p.contract)}`);
    else if (!TD.tenDayBlockedReason(L, u, p)?.includes('two 10-day contracts')) bad('third 10-day not refused', nm(p.pid));
  } else if (L.day === p.contract.tenDay.until - 1) {
    const r = TD.userTenDayRest(L, p.pid);
    if (!r.ok || p.contract.tenDay || p.contract.salaries.length !== 1) bad('rest-of-season deal off', `${nm(p.pid)} ${r.reason} ${JSON.stringify(p.contract)}`);
    tenDayPid = null;
  }
}

/** The user's offer each summer to the best top free agent the team can pay: what leads the field now if it can, else his asking price. */
function bidOnStar(): number | null {
  const u = L.userTid;
  const stars = H.freeAgents(L)
    .filter((p) => FA.marqueeFA(L, p))
    .sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a));
  for (const p of stars) {
    const a = C.askingContract(L, p, u);
    const lead = FA.bidStanding(L, p, a.amount, a.years).toLead;
    if ((lead !== null && lead > a.amount && FA.userBid(L, p.pid, lead, a.years).ok) || FA.userBid(L, p.pid, a.amount, a.years).ok) return p.pid;
  }
  return null;
}

// ---------------------------------------------------------------- the economy's holes, kept shut
// (the October 2026 economy round: each check fails on the hole it closed)

/** 80+ free agents' summer signings this run: salary against the market value he had when the market opened. */
const faTally: { ratio: number; name: string; back: boolean }[] = [];

/**
 * Opening night: dead money carries its cost, and picks are priced from projected strength. A
 * contract worth nothing on the court (a 45 on two seasons at DUMP_PER_FIRST of the cap) is a
 * burden no team takes for nothing, and one season of it some team takes with two firsts attached
 * (the market for absorbing salary is still there); Anthony Davis-style overpays went for free
 * before. And the
 * worst projected team's own first is worth well above the best projected team's (every first was
 * priced the same before 15 games).
 */
function checkEconomyOpening() {
  const u = L.userTid;
  const cs = H.contractSeason(L);
  const cap = H.CAP_FOR(L, cs);
  const host = std(u).sort((a, b) => a.ovr - b.ovr)[0];
  if (host) {
    const keep = { ...host, ratings: { ...host.ratings }, contract: structuredClone(host.contract) };
    const sal = Math.round((cap.salaryCap * C.DUMP_PER_FIRST) / 10) * 10;
    host.contract = { start: cs, salaries: [sal, sal] };
    host.ovr = 45;
    host.pot = 45;
    host.bornYear = L.season - 33;
    for (const k of Object.keys(host.ratings) as (keyof Player['ratings'])[]) host.ratings[k] = 20;
    const dump = (dpids: number[]): TR.TradeOffer => ({ a: { tid: u, pids: [host.pid], dpids }, b: { tid: 0, pids: [], dpids: [] } });
    const takers = L.teams.filter((t) => t.tid !== u).map((t) => t.tid);
    const free = takers.filter((tid) => TR.teamDelta(L, { ...dump([]), b: { tid, pids: [], dpids: [] } }, tid) >= 0);
    if (free.length) bad('dead money taken for nothing', `${free.map((t) => L.teams[t].abbrev).join(', ')} take two seasons at ${sal} of it for nothing`);
    // one season of it, with two firsts attached: some team takes it (about a first's worth of dead money, two firsts however late)
    host.contract = { start: cs, salaries: [sal] };
    const firsts = L.draftPicks
      .filter((d) => d.tid === u && d.round === 1 && d.season > L.season)
      .slice(0, 2)
      .map((d) => d.dpid);
    if (firsts.length === 2 && !takers.some((tid) => TR.teamDelta(L, { ...dump(firsts), b: { tid, pids: [], dpids: [] } }, tid) >= 0))
      bad('dead money no one absorbs for two firsts', `a season at ${sal}`);
    Object.assign(host, keep);
  }
  // own firsts of the next draft, priced clean (no protection, no swap riding on it)
  const proj = pickProjection(L);
  const clean = (tid: number) => {
    const dp = L.draftPicks.find((d) => d.season === proj.season && d.round === 1 && d.originalTid === tid);
    return dp ? TR.pickValue(L, { ...dp, dpid: -1, tid, protection: undefined, swap: undefined }) : undefined;
  };
  const order = L.teams.map((t) => t.tid).sort((a, b) => proj.pct[a] - proj.pct[b]);
  const worst = clean(order[0]);
  const best = clean(order[order.length - 1]);
  if (worst === undefined || best === undefined || worst < best * 1.5)
    bad('day-one picks priced flat', `worst-projected ${L.teams[order[0]].abbrev} ${worst?.toFixed(1)} vs best ${L.teams[order[order.length - 1]].abbrev} ${best?.toFixed(1)}`);
}

/**
 * A summer day of free agency: no 80+ free agent's price under his summer floor, and each 80+
 * signing (with a team other than the one bringing him back on Bird rights it can't stretch) at
 * SUMMER_FLOOR.late of his market value or more. `pool`: the free agents before the day, with their
 * market values as the market opened.
 */
function checkFaPrices(pool: Map<number, { m: number; ovr: number; tid: number | null }>) {
  for (const p of H.freeAgents(L))
    if (p.ovr >= C.SUMMER_FLOOR.ovr && !p.waivers && p.asking && p.asking.amount < C.summerFloor(L, p) - 60)
      bad('80+ free agent priced under his summer floor', `${nm(p.pid)} ${p.asking.amount} < ${Math.round(C.summerFloor(L, p))}`);
  for (const [pid, x] of pool) {
    const p = L.players[pid];
    if (p.tid < 0 || x.ovr < C.SUMMER_FLOOR.ovr) continue;
    pool.delete(pid);
    const sal = salaryFor(p, L.season + 1);
    // (his old team on Bird rights that can't pay more: a non- or early-Bird limit under his floor)
    const capped = p.tid === x.tid && sal >= C.resignLimit(L, p, p.tid) - 60;
    faTally.push({ ratio: sal / x.m, name: H.playerName(p), back: p.tid === x.tid });
    if (sal < x.m * C.SUMMER_FLOOR.late - 60 && !capped && !p.contract.twoWay)
      bad('80+ free agent signed under his summer floor', `${nm(pid)} ${sal} vs market ${Math.round(x.m)} -> ${L.teams[p.tid].abbrev}`);
  }
}

/**
 * The season's end: losing on purpose costs money and the owner's money stories agree. A home game
 * of the user's team as a tank (hype 0.1, a 15-67 record) must bring in less than the same team at
 * .500 (hype 0.5), each at its own best ticket price, by at least a sixth (the payroll the same,
 * the tank must not out-earn the .500 team); and the books' close the owner judges is the cash plus
 * exactly the tax his goals signed off on.
 */
function checkEconomyClose() {
  const u = L.userTid;
  const t = L.teams[u];
  const ts = H.curTeamSeason(L, u);
  const keep = { hype: t.hype, won: ts.won, lost: ts.lost, price: t.budget.ticketPrice };
  const gate = (hype: number, won: number) => {
    t.hype = hype;
    ts.won = won;
    ts.lost = 82 - won;
    t.budget.ticketPrice = aiTicketPrice(L, t);
    const s = H.revenueScale(L);
    return (attendanceFor(L, t) * t.budget.ticketPrice) / 1000 + MERCH_PER_GAME * s * (0.5 + t.hype) * (0.7 + t.pop / 15) + LOCAL_TV_PER_GAME * s * (0.6 + t.pop / 12);
  };
  const tank = gate(0.1, 15);
  const even = gate(0.5, 41);
  Object.assign(t, { hype: keep.hype });
  t.budget.ticketPrice = keep.price;
  ts.won = keep.won;
  ts.lost = keep.lost;
  if (tank > even * (5 / 6)) bad('a tank earns about what a .500 team does', `${tank.toFixed(0)} vs ${even.toFixed(0)} a home game`);
  const o = booksOutlook(L);
  if (Math.abs(o.judged - o.end - sanctionedTax(L)) > 1) bad('books outlook off the tax the owner signed off on', JSON.stringify(o));
}

/** `realCalendar`: the first season plays the NBA's own schedule; `fire`: the coach loses his job after it. */
function play(n: number, opts: { realCalendar: boolean; fire: boolean }) {
  for (let s = 0; s < n; s++) {
    fixUserRoster();
    extendBest();
    // the user's best player is off the table: no offer may ask for him
    const best = std(L.userTid).sort((a, b) => C.valueScore(L, b) - C.valueScore(L, a))[0];
    if (best) P.setUntouchable(L, best.pid, true);
    Object.assign(termsTally, { trades: 0, swaps: 0, cash: 0 });
    Object.assign(contractTally, { offers: 0, counters: 0, under: 0, broke: 0, lowballs: 0, stretched: 0, tenDays: 0 });
    tenDayTally.ai.clear();
    tenDayTally.hardship.clear();
    tradeWithTerms();
    check();
    const offers0 = L.nextProposalId ?? 1;
    const errs = S.startRegularSeason(L);
    if (errs.length) throw new Error(errs.join('; '));
    check();
    const extended = Object.values(L.players).filter((p) => p.contract.next).length;
    checkOpeningNight();
    checkEconomyOpening();
    checkCalendar(!(opts.realCalendar && s === 0));
    let accepted = '';
    // news is capped, so count trades by id as they appear (the deadline recap is a trade story too)
    let trades = 0;
    let buyouts = 0;
    let claims = 0;
    let lastId = L.nextMsgId;
    const firstTxn = L.nextTxnId ?? 1;
    for (let g = 0; L.phase === 'regular' && g < 400; g++) {
      const waived = C.onWaivers(L).map((p) => ({ pid: p.pid, from: p.waivers!.from, contract: p.waivers!.contract, dead: p.waivers!.dead }));
      S.simDay(L);
      // 10-day contracts: the user's own, and the AI teams' (hardship ones among them)
      if (L.phase === 'regular') tenDayStep();
      for (const p of Object.values(L.players))
        if (p.contract.tenDay && p.tid >= 0 && p.tid !== L.userTid) {
          tenDayTally.ai.add(p.pid);
          if (p.contract.tenDay.hardship) tenDayTally.hardship.add(p.pid);
        }
      trades += L.news.filter((x) => x.kind === 'trade' && x.text.startsWith('Trade: ') && x.id >= lastId).length;
      buyouts += L.news.filter((x) => x.kind === 'release' && x.id >= lastId && x.text.includes('bought out')).length;
      lastId = L.nextMsgId;
      // a player can't be signed on waivers: one on a roster now with his old contract was claimed, and
      // took his dead money with him; one on a new deal cleared and signed the same day (a 10-day, say),
      // and his old team keeps its dead money
      for (const w of waived) {
        const q = L.players[w.pid];
        if (!(q?.tid >= 0)) continue;
        if (q.contract !== w.contract) {
          if (!L.teams[w.from].deadMoney.some((d) => d.pid === w.pid)) bad('dead money gone for a player who cleared waivers', `${nm(w.pid)} ${L.teams[w.from].abbrev}`);
          continue;
        }
        claims++;
        // (his waiver's dead money: a release of his from an earlier deal can still be on the books)
        const left = L.teams[w.from].deadMoney.filter((d) => d.pid === w.pid && w.dead.some((x) => x.season === d.season && x.amount === d.amount));
        if (left.length) bad('dead money left for a claimed player', `${nm(w.pid)} ${L.teams[w.from].abbrev} ${JSON.stringify(left)} of ${JSON.stringify(w.dead)}`);
      }
      // take the first offer that comes before the deadline: every open one must go through
      const open = P.openProposals(L)[0];
      if (!accepted && open && L.phase === 'regular' && L.day <= L.tradeDeadlineDay) {
        const r = P.acceptProposal(L, open.id);
        if (!r.ok) bad('open trade offer refused', `#${open.id} ${open.kind}: ${r.reason}`);
        accepted = `${open.kind} with ${L.teams[open.tid].abbrev}`;
        trades += L.news.filter((x) => x.kind === 'trade' && x.text.startsWith('Trade: ') && x.id >= lastId).length;
        lastId = L.nextMsgId;
        check();
      }
      if (L.day % 30 === 0) check();
      if (L.day > 90 && L.phase === 'regular') checkClinch();
      if (L.day === L.allStarDay + 1 && L.phase === 'regular') checkAllStars();
    }
    checkRegularSeasonOver();
    const offers = (L.nextProposalId ?? 1) - offers0;
    if (L.news.filter((x) => x.season === L.season && x.text.startsWith('Trade deadline recap')).length !== 1) bad('deadline recap not once', '');
    const logged = (L.transactions ?? []).filter((t) => t.kind === 'trade' && t.id >= firstTxn).length;
    if (logged !== trades) bad('trade missing from the transaction log', `${trades} made, ${logged} logged`);
    for (let g = 0; (L.phase === 'playin' || L.phase === 'playoffs') && g < 300; g++) S.simDay(L);
    check();
    checkSeasonEnd();
    checkEconomyClose();
    // the coaching carousel after the playoffs: AI coaches fired, and their replacements (first-time head coaches or former ones)
    const carousel = L.news.filter((x) => x.kind === 'coach' && x.season === L.season);
    const coachLine = `coaching changes ${carousel.filter((x) => / (fired|parted ways with) /.test(x.text)).length} (${carousel.filter((x) => x.text.includes('first-time')).length} first-time head coaches)`;
    const taxpayers = L.teams.filter((t) => H.curTeamSeason(L, t.tid).payroll > H.CAP_FOR(L).luxuryTax).length;
    // exceptions used in the season itself (the summer's are counted at the close of free agency)
    const inSeasonRoutes = routeUse(L.season);
    checkLottery();
    if (opts.fire && s === 0) fireAndMove();
    S.startDraft(L);
    check();
    for (let g = 0; nextPick(L) && g < 100; g++) S.autoDraftUserPick(L);
    S.finishDraftPhase(L);
    check();
    checkOptions(false);
    const firstRfa = L.nextTxnId ?? 1;
    // young players who can be made restricted and are worth a spot get qualifying offers (so
    // offer sheets come in for the user to decide); the other 70+ players are re-signed
    for (const p of FA.expiringPlayers(L, L.userTid))
      if (R.rfaEligible(L, p) && C.valueScore(L, p) >= 64) {
        // (under a frozen budget a qualifying offer is a raise the owner forbids: he walks)
        if (frozen(L)) continue;
        const res = R.userQualify(L, p.pid);
        if (!res.ok || !p.rfa) bad('qualifying offer refused', `${nm(p.pid)} ${res.reason}`);
      } else if (p.ovr >= 70) {
        if (resignTalks(p)) continue;
        const a = C.askingContract(L, p, L.userTid);
        FA.userResign(L, p.pid, a.amount, a.years);
      }
    check();
    // the free agents to be, valued as the market opens (the opening wave signs inside startFreeAgency)
    const faPool = new Map<number, { m: number; ovr: number; tid: number | null }>();
    for (const p of Object.values(L.players))
      if ((p.tid >= 0 && contractExp(p.contract) <= L.season) || p.tid === -1) faPool.set(p.pid, { m: C.marketSalary(L, p), ovr: p.ovr, tid: p.tid >= 0 ? p.tid : null });
    S.startFreeAgency(L);
    // (his old team re-signing him before the market opened isn't a free-agent signing)
    for (const [pid, x] of faPool)
      if (
        L.players[pid].tid >= 0 &&
        L.players[pid].tid === x.tid &&
        L.players[pid].contract.start === L.season + 1 &&
        L.faDay === 0 &&
        !L.transactions?.some((t) => t.pid === pid && t.phase === 'freeAgency')
      )
        faPool.delete(pid);
    checkFaPrices(faPool);
    check();
    checkOptions(true);
    // one withdrawn when there are two or more: an unrestricted free agent, his hold gone (not one
    // who signed an offer sheet in the market's opening wave: that one waits for the match)
    const mine = R.restrictedFreeAgents(L, L.userTid);
    const w = [...mine].reverse().find((p) => !p.rfa?.sheet);
    if (mine.length >= 2 && w) {
      if (!R.userWithdrawQualifying(L, w.pid).ok || w.rfa || FA.capHolds(L, L.userTid).some((h) => h.p.pid === w.pid)) bad('qualifying offer not withdrawn', nm(w.pid));
    }
    const star = bidOnStar();
    const sheet = sheetOnRfa();
    negotiate();
    const next = L.season + 1;
    const settled = { matched: 0, declined: 0 };
    // day by day, deciding offer sheets on the user's restricted free agents as they come (free agency stops for them)
    const day = () => {
      const sheets = sheetSnapshot();
      const rfas = rfaSnapshot();
      S.faAdvance(L, 1);
      checkFaPrices(faPool);
      for (const [pid, s] of sheetSnapshot()) sheets.set(pid, s);
      decideUserSheets();
      const x = settledSheets(sheets, next);
      settled.matched += x.matched;
      settled.declined += x.declined;
      checkRfaMoves(rfas, sheets);
    };
    for (let d = 0; d < 10 && !S.faOver(L); d++) day();
    check();
    if (L.faBids?.some((b) => b.decideDay < L.faDay)) bad('offer past its decision day', L.faBids.map((b) => `${nm(b.pid)} d${b.decideDay}`).join(', '));
    const bid =
      star === null
        ? 'none'
        : `${H.playerName(L.players[star])} ${L.players[star].tid >= 0 ? `-> ${L.teams[L.players[star].tid].abbrev}${L.players[star].tid === L.userTid ? '*' : ''}` : 'unsigned'}`;
    for (let d = 0; d < 40 && !S.faOver(L); d++) day();
    if (S.faDayNumber(L) !== S.FA_DAYS || !S.faOver(L)) bad('free agency past its last day', String(L.faDay));
    decideUserSheets();
    if (S.newSeasonBlockedReason(L)) bad('new season blocked at the close', S.newSeasonBlockedReason(L)!);
    // the close: the sheets left are decided, and restricted free agents still unsigned take their qualifying offers
    const closing = sheetSnapshot();
    const qos = R.restrictedFreeAgents(L)
      .filter((p) => !p.rfa!.sheet)
      .map((p) => ({ p, ...p.rfa! }));
    const rfas = rfaSnapshot();
    const summerRoutes = routeUse(L.season + 1);
    if (!S.newSeason(L)) bad('new season refused', '');
    // rotation-level free agents nobody signed this summer
    const unsigned = H.freeAgents(L).filter((p) => C.valueScore(L, p) >= 66).length;
    const x = settledSheets(closing, next);
    settled.matched += x.matched;
    settled.declined += x.declined;
    checkRfaMoves(rfas, closing);
    for (const { p, tid, qo } of qos)
      if (!(p.tid === tid && p.contract.qualifying && p.contract.start === next && p.contract.salaries.join() === String(qo)) && !(p.tid === -1 && !p.rfa))
        bad('qualifying offer not taken as offered', `${nm(p.pid)} ${p.tid} ${JSON.stringify(p.contract)} qo ${qo}`);
    check();
    const rfaLog = (L.transactions ?? []).filter((t) => t.id >= firstRfa);
    const count = (kind: string, note?: string, user?: boolean) => rfaLog.filter((t) => t.kind === kind && (!note || t.note === note) && (!user || t.tids[0] === L.userTid)).length;
    const outcomes = { matched: count('match', 'matched'), declined: count('match', 'declined') };
    if (outcomes.matched !== settled.matched || outcomes.declined !== settled.declined)
      bad('offer sheet outcomes off the log', `${JSON.stringify(settled)} vs ${JSON.stringify(outcomes)}`);
    const rfaLine = `QOs ${count('qualify', 'extended')} (yours ${count('qualify', 'extended', true)}), offer sheets ${count('offerSheet')} (yours ${count('offerSheet', undefined, true)}${sheet !== null ? `: ${H.playerName(L.players[sheet])} -> ${L.teams[L.players[sheet].tid]?.abbrev ?? 'FA'}` : ''}), on yours ${rfaLog.filter((t) => t.kind === 'offerSheet' && t.tids[1] === L.userTid).length}, matched ${settled.matched}, not matched ${settled.declined}, came to terms ${rfaLog.filter((t) => t.kind === 'resign' && t.phase === 'freeAgency').length}, QOs taken ${count('qualify', 'accepted')}`;
    const sz = L.teams.map((t) => std(t.tid).length);
    console.log(
      `-> ${label}${L.season}: preseason rosters ${Math.min(...sz)}-${Math.max(...sz)}, players ${Object.keys(L.players).length}, strategies ${['contend', 'retool', 'rebuild'].map((x) => L.teams.filter((t) => t.strategy === x).length).join('/')}, trades ${trades}, offers ${offers}${accepted ? ` (took a ${accepted})` : ''}, extensions ${extended}, buyouts ${buyouts}, waiver claims ${claims}, bid ${bid}, taxpayers ${taxpayers}, save ${(JSON.stringify(L).length / 1e6).toFixed(2)}MB`,
    );
    console.log(`   restricted free agency: ${rfaLine}`);
    const ratios = faTally.map((x) => x.ratio).sort((a, b) => a - b);
    console.log(
      `   80+ free agents so far: ${ratios.length} signed, median ${ratios.length ? Math.round(ratios[Math.floor(ratios.length / 2)] * 100) : '-'}% of market value, ${ratios.filter((x) => x < C.SUMMER_FLOOR.late).length} under ${C.SUMMER_FLOOR.late * 100}% (${faTally.filter((x) => x.ratio < C.SUMMER_FLOOR.late && x.back).length} back with Bird rights capped)`,
    );
    const highsKB = Object.values(L.players).reduce((a, p) => a + (p.highs ? JSON.stringify(p.highs).length : 0), 0) / 1000;
    console.log(
      `   record book: ${L.news.filter((n) => n.kind === 'record' && n.season === L.season - 1).length} record news in ${seasonLabel(L.season - 1)}, book ${(JSON.stringify(L.records ?? {}).length / 1000).toFixed(1)}KB, career highs ${highsKB.toFixed(1)}KB`,
    );
    const raised = L.teams.flatMap((t) => (t.retired ?? []).filter((r) => r.season === L.season - 1).map((r) => `${t.abbrev} #${r.jersey} ${r.name}`));
    console.log(`   retired numbers: ${raised.length}${raised.length ? ` (${raised.join(', ')})` : ''}, ${L.teams.reduce((a, t) => a + (t.retired?.length ?? 0), 0)} in all`);
    console.log(`   coaches: ${coachLine}, registry ${L.coaches?.length ?? 0} coaches, ${(JSON.stringify(L.coaches ?? []).length / 1e3).toFixed(1)}KB`);
    const routes = (r: ReturnType<typeof routeUse>) => `space ${r.space}, mid-level ${r.mle}, room ${r.room}, bi-annual ${r.bae}`;
    console.log(
      `   exceptions (teams): for ${seasonLabel(L.season)} this summer ${routes(summerRoutes)}; for ${seasonLabel(L.season - 1)} by its end ${routes(inSeasonRoutes)}; unsigned 66+ free agents ${unsigned}; 10-days: AI ${tenDayTally.ai.size} (hardship ${tenDayTally.hardship.size}), yours ${contractTally.tenDays}`,
    );
    console.log(
      `   talks: ${contractTally.offers} offers (${contractTally.lowballs} lowballs), ${contractTally.counters} counters, ${contractTally.under} signed under the ask, ${contractTally.broke} broke down; stretched releases ${contractTally.stretched}`,
    );
    // the user's swaps settled at last season's lottery (he hears about each), and how many were used
    const swapsSettled = L.inbox.filter((m) => m.season === L.season - 1 && m.subject.startsWith('Pick swap')).length;
    const swapped = (L.transactions ?? []).filter((t) => t.kind === 'swap' && t.season === L.season - 1).length;
    console.log(
      `   deal terms: ${termsTally.trades} trades (${termsTally.swaps} swap rights given, $${(termsTally.cash / 1000).toFixed(1)}M cash), ${swapsSettled} swaps settled at the lottery (${swapped} used)`,
    );
    const log = L.transactions ?? [];
    const kinds = new Map<string, number>();
    for (const t of log) kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
    console.log(
      `   transaction log: ${log.length} (${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}), ${(JSON.stringify(log).length / 1e3).toFixed(1)}KB, ${log.filter((t) => t.season === L.season - 1).length} from ${L.season - 1}`,
    );
  }
}

// the real league's run never fires the coach (fire: false), so the owner's own verdict is off too:
// an auto-managed team fired after a bad stretch would leave the run stuck on its next phase
L = createLeague({
  name: 'Inv',
  userTid,
  coachName: 'C',
  settings: { ...defaultSettings(), jobSecurity: false },
  seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')),
  rngSeed,
});
// a fixed id: the lottery draws ties from it, so a run with the same seed repeats
L.id = `inv_${rngSeed}`;
play(seasons, { realCalendar: true, fire: false });
if (fictionalSeasons > 0) {
  label = 'fictional ';
  L = createLeague({ name: 'InvF', userTid, coachName: 'C', settings: defaultSettings(), seed: null, rngSeed });
  L.id = `inv_f_${rngSeed}`;
  play(fictionalSeasons, { realCalendar: false, fire: true });
}
console.log(viol.size ? '\nVIOLATIONS:' : '\nNo violations.');
for (const [k, v] of [...viol].sort((a, b) => b[1].length - a[1].length)) console.log(`${v.length}x ${k}\n   ${v.slice(0, 3).join('\n   ')}`);
process.exitCode = viol.size ? 1 : 0;
