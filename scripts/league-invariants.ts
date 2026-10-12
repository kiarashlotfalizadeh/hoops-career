// Multi-season invariant check: plays N seasons through every phase (user team auto-managed)
// and asserts league-state invariants after each phase.
// Usage: npx tsx scripts/league-invariants.ts [seasons] [rngSeed] [userTid]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import * as S from '../src/core/league/season';
import * as H from '../src/core/league/helpers';
import * as C from '../src/core/league/contracts';
import * as FA from '../src/core/league/freeAgency';
import { nextPick } from '../src/core/league/draft';
import { standings } from '../src/core/league/standings';
import { contractExp, salaryFor } from '../src/core/playerGen';
import { CAP } from '../src/core/constants';
import { ARENA_CAPACITY } from '../src/core/league/finances';

const [seasons, rngSeed, userTid] = [5, 42, 19].map((d, i) => Number(process.argv[i + 2] ?? d));
const L = createLeague({ name: 'Inv', userTid, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync('src/data/seed.json', 'utf8')), rngSeed });
// a fixed id: the lottery draws ties from it, so a run with the same seed repeats
L.id = `inv_${rngSeed}`;
const viol = new Map<string, string[]>();
const bad = (kind: string, msg: string) => {
  const v = viol.get(kind) ?? [];
  v.push(`[${L.season} ${L.phase} d${L.day}] ${msg}`);
  viol.set(kind, v);
};
const nm = (pid: number) => `${pid}:${L.players[pid] ? H.playerName(L.players[pid]) : '?'}`;
const std = (tid: number) => H.standardRoster(L, tid);

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

function checkSeasonEnd() {
  const aw = L.awards.find((a) => a.season === L.season)!;
  const gp = (pid: number) => H.seasonTotals(L.players[pid], L.season)?.gp ?? 0;
  // 65 games for the MVP, DPOY and MIP; Rookie and Sixth Man of the Year aren't covered by the rule
  for (const k of ['mvp', 'dpoy', 'smoy', 'mip'] as const)
    if (aw[k] === undefined || gp(aw[k]!) < (k === 'smoy' ? 50 : 65)) bad('award eligibility', `${k} ${aw[k]} gp ${aw[k] !== undefined ? gp(aw[k]!) : '-'}`);
  if (aw.roy !== undefined && L.players[aw.roy].draft.year !== L.season - 1) bad('ROY not a rookie', nm(aw.roy));
  if (new Set(aw.allNba.flat()).size !== 15 || aw.champion === undefined) bad('All-NBA/champion', '');
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

/** Opening night: everyone wears his own number, nobody active shares a name, no four games in five nights. */
function checkOpeningNight() {
  for (const t of L.teams) {
    const numbers = H.teamPlayers(L, t.tid).map((p) => p.jersey);
    if (new Set(numbers).size !== numbers.length) bad('teammates share a number', `${t.abbrev} ${numbers.sort().join(',')}`);
    const days = L.schedule
      .filter((g) => g.home === t.tid || g.away === t.tid)
      .map((g) => g.day)
      .sort((a, b) => a - b);
    if (days.some((d, i) => i >= 3 && d - days[i - 3] <= 4)) bad('four games in five nights', t.abbrev);
  }
  const names = Object.values(L.players)
    .filter((p) => p.tid !== -3)
    .map((p) => H.playerName(p));
  if (new Set(names).size !== names.length) bad('active players share a name', `${names.length - new Set(names).size}`);
}

function fixUserRoster() {
  while (std(userTid).length > CAP.rosterMax) C.releasePlayer(L, std(userTid).sort((a, b) => C.valueScore(L, a) - C.valueScore(L, b))[0]);
  for (let g = 0; std(userTid).length < CAP.rosterMin && g < 40; g++)
    for (const p of H.freeAgents(L).sort((a, b) => b.ovr - a.ovr)) if (FA.userOffer(L, p.pid, C.askingContract(L, p, userTid).amount, 1).ok) break;
}

for (let s = 0; s < seasons; s++) {
  fixUserRoster();
  check();
  const errs = S.startRegularSeason(L);
  if (errs.length) throw new Error(errs.join('; '));
  check();
  checkOpeningNight();
  // news is capped, so count trades by id as they appear
  let trades = 0;
  let lastId = L.nextMsgId;
  for (let g = 0; L.phase === 'regular' && g < 400; g++) {
    S.simDay(L);
    trades += L.news.filter((n) => n.kind === 'trade' && n.id >= lastId).length;
    lastId = L.nextMsgId;
    if (L.day % 30 === 0) check();
    if (L.day > 90 && L.phase === 'regular') checkClinch();
  }
  for (let g = 0; (L.phase === 'playin' || L.phase === 'playoffs') && g < 300; g++) S.simDay(L);
  check();
  checkSeasonEnd();
  const taxpayers = L.teams.filter((t) => H.curTeamSeason(L, t.tid).payroll > H.CAP_FOR(L).luxuryTax).length;
  checkLottery();
  S.startDraft(L);
  check();
  for (let g = 0; nextPick(L) && g < 100; g++) S.autoDraftUserPick(L);
  S.finishDraftPhase(L);
  check();
  checkOptions(false);
  for (const p of FA.expiringPlayers(L, userTid))
    if (p.ovr >= 70) {
      const a = C.askingContract(L, p, userTid);
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
    `-> ${L.season}: preseason rosters ${Math.min(...sz)}-${Math.max(...sz)}, players ${Object.keys(L.players).length}, strategies ${['contend', 'retool', 'rebuild'].map((x) => L.teams.filter((t) => t.strategy === x).length).join('/')}, trades ${trades}, taxpayers ${taxpayers}, save ${(JSON.stringify(L).length / 1e6).toFixed(2)}MB`,
  );
}
console.log(viol.size ? '\nVIOLATIONS:' : '\nNo violations.');
for (const [k, v] of [...viol].sort((a, b) => b[1].length - a[1].length)) console.log(`${v.length}x ${k}\n   ${v.slice(0, 3).join('\n   ')}`);
process.exitCode = viol.size ? 1 : 0;
