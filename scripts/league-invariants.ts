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
import { nextPick } from '../src/core/league/draft';
import { finalsHomeCourt, standings } from '../src/core/league/standings';
import { cupTables } from '../src/core/league/cup';
import { missesAllStarGame } from '../src/core/league/awards';
import { takeOverTeam } from '../src/core/league/owner';
import { validateTrade } from '../src/core/league/trades';
import { contractExp, salaryFor } from '../src/core/playerGen';
import { CAP } from '../src/core/constants';
import { ARENA_CAPACITY } from '../src/core/league/finances';
import type { League } from '../src/core/types';

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

function check() {
  const season = L.season;
  const ph = L.phase;
  walk(L, 'league');
  for (const t of L.teams) {
    const n = std(t.tid).length;
    const tw = H.twoWayRoster(L, t.tid).length;
    const who = `${t.abbrev}${t.tid === L.userTid ? '*' : ''}`;
    // standard roster: 13-15 in season; two-way deals sit outside it (max 3)
    if (H.inSeason(L) && (n < CAP.rosterMin || n > CAP.rosterMax)) bad('roster size in season', `${who} ${n}`);
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
      if (!p.contract.twoWay && p.contract.start > L.startSeason && (first > cap.maxContract(p.experience) + 10 || first < cap.minContract - 1 || p.contract.salaries.length > 5))
        bad('contract outside min/max/5yr', `${nm(p.pid)} ${JSON.stringify(p.contract)}`);
      if ((ph === 'preseason' || ph === 'regular') && p.draft.round > 0 && p.draft.year === season - 1 && p.experience !== 0)
        bad('rookie experience != 0', `${nm(p.pid)} exp ${p.experience}`);
    }
    if (p.tid === -1 && !(p.asking && p.asking.amount > 0)) bad('FA without asking price', nm(p.pid));
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
 * keeps out more than two games.
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
  // 65 games for the MVP, DPOY and MIP; Rookie and Sixth Man of the Year aren't covered by the rule
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
    if (ts.attendance / Math.max(1, ts.homeWon + ts.homeLost) > ARENA_CAPACITY) bad('attendance over capacity', t.abbrev);
  }
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
  if (mine && !validateTrade(L, { a: { tid: old, pids: [mine.pid], dpids: [] }, b: { tid: ai, pids: [], dpids: [] } }).some((e) => e.includes('fired')))
    bad('fired coach can trade', '');
  // the job on offer: the worst record in the league
  const to = L.teams.filter((t) => t.tid !== old).sort((a, b) => H.winPct(H.curTeamSeason(L, a.tid)) - H.winPct(H.curTeamSeason(L, b.tid)))[0].tid;
  takeOverTeam(L, to);
  const coached = L.teams.filter((t) => t.coach.name === L.coachName).map((t) => t.tid);
  if (L.fired || L.userTid !== to || coached.join() !== String(to) || L.teams[old].rotation.manual || L.teams[old].tactics.manual || L.tenureStart !== L.season + 1)
    bad('take-over', `${L.teams[old].abbrev} -> ${L.teams[to].abbrev}, coaching ${coached.join()}`);
}

function fixUserRoster() {
  const u = L.userTid;
  while (std(u).length > CAP.rosterMax) C.releasePlayer(L, std(u).sort((a, b) => C.valueScore(L, a) - C.valueScore(L, b))[0]);
  for (let g = 0; std(u).length < CAP.rosterMin && g < 40; g++)
    for (const p of H.freeAgents(L).sort((a, b) => b.ovr - a.ovr)) {
      const ask = C.askingContract(L, p, u);
      // one year at his price, else the years he asks for
      if (FA.userOffer(L, p.pid, ask.amount, 1).ok || FA.userOffer(L, p.pid, ask.amount, ask.years).ok) break;
    }
}

/** `realCalendar`: the first season plays the NBA's own schedule; `fire`: the coach loses his job after it. */
function play(n: number, opts: { realCalendar: boolean; fire: boolean }) {
  for (let s = 0; s < n; s++) {
    fixUserRoster();
    check();
    const errs = S.startRegularSeason(L);
    if (errs.length) throw new Error(errs.join('; '));
    check();
    checkOpeningNight();
    checkCalendar(!(opts.realCalendar && s === 0));
    // news is capped, so count trades by id as they appear
    let trades = 0;
    let lastId = L.nextMsgId;
    for (let g = 0; L.phase === 'regular' && g < 400; g++) {
      S.simDay(L);
      trades += L.news.filter((x) => x.kind === 'trade' && x.id >= lastId).length;
      lastId = L.nextMsgId;
      if (L.day % 30 === 0) check();
      if (L.day > 90 && L.phase === 'regular') checkClinch();
      if (L.day === L.allStarDay + 1 && L.phase === 'regular') checkAllStars();
    }
    checkRegularSeasonOver();
    for (let g = 0; (L.phase === 'playin' || L.phase === 'playoffs') && g < 300; g++) S.simDay(L);
    check();
    checkSeasonEnd();
    const taxpayers = L.teams.filter((t) => H.curTeamSeason(L, t.tid).payroll > H.CAP_FOR(L).luxuryTax).length;
    checkLottery();
    if (opts.fire && s === 0) fireAndMove();
    S.startDraft(L);
    check();
    for (let g = 0; nextPick(L) && g < 100; g++) S.autoDraftUserPick(L);
    S.finishDraftPhase(L);
    check();
    checkOptions(false);
    for (const p of FA.expiringPlayers(L, L.userTid))
      if (p.ovr >= 70) {
        const a = C.askingContract(L, p, L.userTid);
        FA.userResign(L, p.pid, a.amount, a.years);
      }
    S.startFreeAgency(L);
    check();
    checkOptions(true);
    S.faAdvance(L, 10);
    check();
    S.faAdvance(L, 30);
    if (S.faDayNumber(L) !== S.FA_DAYS || !S.faOver(L)) bad('free agency past its last day', String(L.faDay));
    S.newSeason(L);
    check();
    const sz = L.teams.map((t) => std(t.tid).length);
    console.log(
      `-> ${label}${L.season}: preseason rosters ${Math.min(...sz)}-${Math.max(...sz)}, players ${Object.keys(L.players).length}, strategies ${['contend', 'retool', 'rebuild'].map((x) => L.teams.filter((t) => t.strategy === x).length).join('/')}, trades ${trades}, taxpayers ${taxpayers}, save ${(JSON.stringify(L).length / 1e6).toFixed(2)}MB`,
    );
  }
}

L = createLeague({ name: 'Inv', userTid, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')), rngSeed });
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
