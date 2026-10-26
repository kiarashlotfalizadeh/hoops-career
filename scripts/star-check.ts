// Star check: plays the real league for N seasons in several leagues at once (one per rng seed, each
// in its own process, the user's team auto-managed as in season-test) and watches what fans
// screenshot as broken: the scoring leaders with their usage, the night's biggest scoring games, the
// best record and the longest winning streak, how the best players age, and in the first season how
// the real league's top scorers' lines hold up, the leaders in made threes and steals, the season's
// biggest margin and team score, and the injuries that end seasons. Fails (exit 1) when any league
// has a season whose scoring leader averages more than MAX_PPG, a game over MAX_GAME_PTS, a threes
// or steals leader past MAX_TPM or MAX_STL, more than MAX_TPM10 nights of 10 made threes, a margin
// past MAX_MARGIN or a team score past MAX_TEAM_PTS, or more than MAX_35_SEASONS seasons of a
// 35-point scorer; when more seasons than BEST_RECORD_ALLOWANCE allows end with a record better than
// MAX_WINS, or more than OLD_LEADER_ALLOWANCE allows have a player 36 or older leading the league in
// points or threes; or when the seasons average more than MAX_LONG_INJURIES absences of 60+ games or
// MAX_ACHILLES Achilles ruptures.
// Usage: npx tsx scripts/star-check.ts [seasons] [rngSeed[:TEAM],...]   (env QUIET=1: leaders only,
//   TEAM=<abbrev>: the user's team where a league names none, Orlando by default; DIFFICULTY=easy|normal|hard)
import { readFileSync } from 'node:fs';
import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay, startDraft, finishDraftPhase, startFreeAgency, newSeason, autoDraftUserPick } from '../src/core/league/season';
import { playerName, standardRoster, freeAgents } from '../src/core/league/helpers';
import { CAP, TARGETS } from '../src/core/constants';
import { standings } from '../src/core/league/standings';
import { nextPick } from '../src/core/league/draft';
import { expiringPlayers, userOffer, userResign } from '../src/core/league/freeAgency';
import { askingContract, releasePlayer } from '../src/core/league/contracts';
import { takeJob } from '../src/core/league/jobs';
import { aiMatchVerdict, restrictedFreeAgents, sheetDecisionBlocked, userDecideSheet } from '../src/core/league/rfa';
import { playerAge } from '../src/core/playerGen';
import { FRANCHISES } from '../src/core/teams';
import type { League, Player } from '../src/core/types';

/** No one has averaged more than 38.4 over a full season since 1963: a leader past 39 is the engine running away. */
const MAX_PPG = 39;
/**
 * Only Chamberlain (several times) and Kobe Bryant's 81 have topped Dončić's 73. Star-led playbooks
 * (Grit & Grind, Heliocentric, Hub Big) put a 74-76 night in reach once in a few dozen seasons, as the
 * real league has had; a night past 80 is Kobe territory, and one in a check's few dozen seasons is the
 * engine running away.
 */
const MAX_GAME_PTS = 80;
/**
 * The outlier guards below sit a little past what the engine does since its extremes were tuned
 * (October 2026, 4 leagues x 12 seasons: the threes leader at most 5.6 a game, 26 nights of 10 made
 * threes in a season, the steals leader 2.7, a 67-point margin, 169 points in regulation; this
 * check's own 32 seasons 6.0, 18, 2.7, 65 and 171), at or a little past the NBA's records (5.1
 * threes, about 2.7 steals, a 73-point margin, about 160 points in regulation): they catch the
 * engine running away again. Before the tuning the same seasons had 8.2 threes, 93 ten-three
 * nights, 3.6 steals, an 89-point margin and 191 points.
 */
const MAX_TPM = 6.2;
const MAX_TPM10 = 30;
const MAX_STL = 3.2;
const MAX_MARGIN = 73;
const MAX_TEAM_PTS = 180;
/**
 * Seasons per league with a 35-PPG scorer: the NBA has had about a dozen in its history, and an
 * engine that made one perennial (Edwards at 35-37 in 6 of 8 seasons) had 12 in 32; since the
 * extremes were tuned, 3 in 48 (none in this check's 32).
 */
const MAX_35_SEASONS = 2;
/**
 * Seasons per one that may have a player 36 or older leading the league in points or made threes:
 * a 38-year-old Curry does it in some leagues' first season (he led it at 37 in 2025-26, with 4.4 a
 * game), and with every star's threes leveling off an old specialist can (5 in 48 seasons since the
 * tuning, 2 in this check's 32; 7 in 48 before, with 13 attempts a game in 19 minutes at 36). One
 * in five leaves room for him and a lucky year; an engine that kept its veterans' volume fails it.
 */
const OLD_LEADER_ALLOWANCE = 5;
/** New absences of 60+ games and Achilles ruptures a season, on average over every season played (the NBA: about 4-8 and 1-3). */
const MAX_LONG_INJURIES = 8;
const MAX_ACHILLES = 3.5;
/** The best record ever is 73-9 (Golden State, 2015-16): a 74-win season is a record the engine shouldn't be breaking. */
const MAX_WINS = 73;
/**
 * Seasons per one that may still end with a record over MAX_WINS. The NBA has seen 70 wins three
 * times in 78 seasons, so a sim league that is right at the top should almost never get there; one
 * in twenty leaves room for a stacked roster and a lucky year, while an engine whose best team runs
 * 77-5 as a matter of course fails in every league.
 */
const BEST_RECORD_ALLOWANCE = 20;
/**
 * The leagues CI plays: four different runs from the same opening night, one of them with the user
 * running the Thunder, the opening night's best team (a user keeps his core together, as AI front
 * offices over the tax don't: that league is where 77-5 seasons came from).
 */
const DEFAULT_SEEDS = ['42', '7', '2026', '1234:OKC'];
const DEFAULT_SEASONS = 8;

/** What a league reports back for each season. */
interface SeasonReport {
  season: number;
  leader: { name: string; ppg: number };
  game: { name: string; pts: number };
  best: { team: string; won: number; lost: number };
  streak: { team: string; games: number };
  /** The regular season's leaders per game in made threes and steals (50+ games). */
  tpm: { name: string; pg: number };
  stl: { name: string; pg: number };
  /** Scorers at 35+ PPG (50+ games). */
  over35: number;
  /** Games with 10 or more made threes by a player (regular season), and whether a player 36 or older led the league in points or made threes. */
  tpm10: number;
  oldLeader: string | null;
  /** The season's biggest margin and biggest team score in regulation (playoffs included, not the All-Star Game). */
  margin: { text: string; pts: number };
  score: { text: string; pts: number };
  /** New injuries in the season's games: all of them per team, and the league's 10+, 60+ game ones and Achilles/ACL tears. */
  injuries: { perTeam: number; ten: number; sixty: number; achilles: number; acl: number };
  /** Overtime games and the share decided by 3 or fewer (regular season), and the league's average MPG of each team's top two (50+ games). */
  otRate: number;
  close: number;
  topMin: [number, number];
}

const quiet = !!process.env.QUIET;
const seasons = Number(process.argv[2] ?? DEFAULT_SEASONS);
const seeds = process.argv[3] ? process.argv[3].split(',') : DEFAULT_SEEDS;
if (!Number.isInteger(seasons) || seasons < 1 || seeds.some((s) => !Number.isFinite(Number(s.split(':')[0])))) throw new Error('Usage: star-check [seasons] [rngSeed[:TEAM],...]');

/** Every league in its own process, as many at once as there are cores; their output is printed a league at a time. */
async function playLeagues() {
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  const all: (SeasonReport & { seed: string })[] = [];
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < seeds.length) {
      const seed = seeds[next++];
      const child = fork(self, [String(seasons), seed], { stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      let out = '';
      child.stdout!.on('data', (d) => (out += d));
      const reports = await new Promise<SeasonReport[]>((resolve, reject) => {
        let got: SeasonReport[] | null = null;
        child.on('message', (m) => (got = m as SeasonReport[]));
        child.on('exit', (code) => (got ? resolve(got) : reject(new Error(`League ${seed} stopped (exit ${code}):\n${out}`))));
      });
      console.log(`\n--- rng seed ${seed}\n${out.trimEnd()}`);
      all.push(...reports.map((r) => ({ seed, ...r })));
    }
  };
  await Promise.all(Array.from({ length: Math.min(seeds.length, Math.max(1, availableParallelism())) }, run));
  console.log(`\n${seeds.length} leagues of ${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(verdict(all) ? 0 : 1);
}

/** The thresholds over every season played; prints the summary and returns whether they all hold. */
function verdict(all: (SeasonReport & { seed: string })[]): boolean {
  const at = (r: SeasonReport & { seed: string }) => `${r.season} (rng ${r.seed})`;
  const failures: string[] = [];
  for (const r of all) {
    if (r.leader.ppg > MAX_PPG) failures.push(`${at(r)}: ${r.leader.name} led the league with ${r.leader.ppg.toFixed(1)} PPG (max ${MAX_PPG})`);
    if (r.game.pts > MAX_GAME_PTS) failures.push(`${at(r)}: ${r.game.name} scored ${r.game.pts} in a game (max ${MAX_GAME_PTS})`);
    if (r.tpm.pg > MAX_TPM) failures.push(`${at(r)}: ${r.tpm.name} made ${r.tpm.pg.toFixed(2)} threes a game (max ${MAX_TPM})`);
    if (r.tpm10 > MAX_TPM10) failures.push(`${at(r)}: ${r.tpm10} nights of 10 made threes (max ${MAX_TPM10})`);
    if (r.stl.pg > MAX_STL) failures.push(`${at(r)}: ${r.stl.name} had ${r.stl.pg.toFixed(2)} steals a game (max ${MAX_STL})`);
    if (r.margin.pts > MAX_MARGIN) failures.push(`${at(r)}: ${r.margin.text} was decided by ${r.margin.pts} (max ${MAX_MARGIN})`);
    if (r.score.pts > MAX_TEAM_PTS) failures.push(`${at(r)}: ${r.score.text} had a team score ${r.score.pts} in regulation (max ${MAX_TEAM_PTS})`);
  }
  for (const seed of new Set(all.map((r) => r.seed))) {
    const n = all.filter((r) => r.seed === seed && r.over35 > 0).length;
    if (n > MAX_35_SEASONS) failures.push(`rng ${seed}: ${n} seasons with a 35-PPG scorer (max ${MAX_35_SEASONS})`);
  }
  const old = all.filter((r) => r.oldLeader);
  const oldAllowed = Math.floor(all.length / OLD_LEADER_ALLOWANCE);
  if (old.length > oldAllowed)
    failures.push(`${old.length} of ${all.length} seasons had a league leader 36 or older (${oldAllowed} allowed): ${old.map((r) => `${at(r)} ${r.oldLeader}`).join(', ')}`);
  const over = all.filter((r) => r.best.won > MAX_WINS);
  const allowed = Math.floor(all.length / BEST_RECORD_ALLOWANCE);
  if (over.length > allowed)
    failures.push(
      `${over.length} of ${all.length} seasons had a team over ${MAX_WINS} wins (${allowed} allowed): ${over.map((r) => `${at(r)} ${r.best.team} ${r.best.won}-${r.best.lost}`).join(', ')}`,
    );
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const wins = sorted(all.map((r) => r.best.won));
  const streaks = sorted(all.map((r) => r.streak.games));
  const mid = (xs: number[]) => xs[Math.floor(xs.length / 2)];
  console.log(
    `Over ${all.length} seasons: scoring leader max ${Math.max(...all.map((r) => r.leader.ppg)).toFixed(1)} PPG, game high max ${Math.max(...all.map((r) => r.game.pts))}; best record median ${mid(wins)} wins (max ${wins[wins.length - 1]}), ${over.length} over ${MAX_WINS}; longest streak median ${mid(streaks)} (max ${streaks[streaks.length - 1]})`,
  );
  const max = (f: (r: SeasonReport) => number) => Math.max(...all.map(f));
  const mean = (f: (r: SeasonReport) => number) => all.reduce((a, r) => a + f(r), 0) / Math.max(1, all.length);
  const by35 = new Map<string, number>();
  for (const r of all) by35.set(r.seed, (by35.get(r.seed) ?? 0) + (r.over35 > 0 ? 1 : 0));
  console.log(
    `  3PM leader max ${max((r) => r.tpm.pg).toFixed(2)} (mean ${mean((r) => r.tpm.pg).toFixed(2)}), 10-three nights max ${max((r) => r.tpm10)} (mean ${mean((r) => r.tpm10).toFixed(1)}), leaders 36 or older ${old.length}, STL leader max ${max((r) => r.stl.pg).toFixed(2)} (mean ${mean((r) => r.stl.pg).toFixed(2)}), margin max ${max((r) => r.margin.pts)} (mean ${mean((r) => r.margin.pts).toFixed(1)}), team score max ${max((r) => r.score.pts)} (mean ${mean((r) => r.score.pts).toFixed(1)}), seasons with a 35+ PPG scorer per league ${[...by35].map(([k, v]) => `${v} (rng ${k})`).join(', ')}`,
  );
  console.log(
    `  OT ${(100 * mean((r) => r.otRate)).toFixed(1)}%, by 3 or less ${(100 * mean((r) => r.close)).toFixed(1)}%, top-two MPG ${mean((r) => r.topMin[0]).toFixed(1)}/${mean((r) => r.topMin[1]).toFixed(1)}, injuries ${mean((r) => r.injuries.perTeam).toFixed(1)}/team-season, 10+ games ${mean((r) => r.injuries.ten).toFixed(1)}/season (${(mean((r) => r.injuries.ten) / 30).toFixed(1)}/team), 60+ games ${mean((r) => r.injuries.sixty).toFixed(1)}/season (max ${max((r) => r.injuries.sixty)}), Achilles ${mean((r) => r.injuries.achilles).toFixed(1)} (max ${max((r) => r.injuries.achilles)}), ACL ${mean((r) => r.injuries.acl).toFixed(1)}`,
  );
  if (mean((r) => r.injuries.sixty) > MAX_LONG_INJURIES) failures.push(`${mean((r) => r.injuries.sixty).toFixed(1)} absences of 60+ games a season (max ${MAX_LONG_INJURIES})`);
  if (mean((r) => r.injuries.achilles) > MAX_ACHILLES) failures.push(`${mean((r) => r.injuries.achilles).toFixed(1)} Achilles ruptures a season (max ${MAX_ACHILLES})`);
  if (failures.length) {
    console.error(`FAIL: ${failures.join('; ')}`);
    return false;
  }
  console.log(
    `OK: no scoring leader above ${MAX_PPG} PPG, no game above ${MAX_GAME_PTS} points, at most ${allowed} season(s) above ${MAX_WINS} wins, leaders within ${MAX_TPM} threes and ${MAX_STL} steals, at most ${MAX_TPM10} 10-three nights a season, at most ${oldAllowed} season(s) led by a player 36 or older, margins within ${MAX_MARGIN}, team scores within ${MAX_TEAM_PTS}, at most ${MAX_35_SEASONS} seasons of a 35-PPG scorer per league, long injuries and Achilles ruptures within ${MAX_LONG_INJURIES} and ${MAX_ACHILLES} a season`,
  );
  return true;
}

/** His regular season: per-game line and his share of his team's possessions while he was on the floor. */
function line(p: Player, season: number) {
  const rows = p.stats.filter((s) => s.season === season && !s.playoffs);
  const sum = (k: 'gp' | 'pts' | 'min' | 'fga' | 'fta' | 'tov' | 'teamFga' | 'teamFta' | 'teamTov') => rows.reduce((a, s) => a + s[k], 0);
  const gp = sum('gp');
  const use = sum('teamFga') + 0.44 * sum('teamFta') + sum('teamTov');
  return { gp, ppg: sum('pts') / Math.max(1, gp), mpg: sum('min') / Math.max(1, gp), usg: use > 0 ? (sum('fga') + 0.44 * sum('fta') + sum('tov')) / use : 0 };
}
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** The season's regular-season games: the biggest scoring night, each team's longest winning streak, the league's assists and its nights of 10 made threes. */
function seasonGames(league: League, season: number) {
  const games = league.games.filter((g) => g.season === season && g.type === 'regular').sort((a, b) => a.day - b.day);
  let game = { name: '-', pts: 0 };
  const run = new Map<number, number>();
  let streak = { tid: -1, games: 0 };
  let ast = 0;
  let margin = { text: '-', pts: 0 };
  let score = { text: '-', pts: 0 };
  let ot = 0;
  let close = 0;
  let tpm10 = 0;
  const box = (g: League['games'][number]) => `${league.teams[g.away.tid]?.abbrev} ${g.away.pts} @ ${league.teams[g.home.tid]?.abbrev} ${g.home.pts}`;
  // (every game that counts, the playoffs too, not the All-Star Game; scores in regulation, as an overtime adds its own)
  for (const g of league.games.filter((x) => x.season === season && x.type !== 'allstar')) {
    const m = Math.abs(g.home.pts - g.away.pts);
    if (m > margin.pts) margin = { text: `${box(g)}, ${g.type}`, pts: m };
    const hi = Math.max(g.home.pts, g.away.pts);
    if (!g.ot && hi > score.pts) score = { text: `${box(g)}, ${g.type}`, pts: hi };
  }
  for (const g of games) {
    if (g.ot) ot++;
    if (Math.abs(g.home.pts - g.away.pts) <= 3) close++;
    for (const side of [g.home, g.away]) {
      ast += side.t.ast;
      for (const b of side.players) {
        if (b.pts > game.pts) game = { name: b.name, pts: b.pts };
        if (b.tpm >= 10) tpm10++;
      }
      const won = side.pts > (side === g.home ? g.away : g.home).pts;
      const n = won ? (run.get(side.tid) ?? 0) + 1 : 0;
      run.set(side.tid, n);
      if (n > streak.games) streak = { tid: side.tid, games: n };
    }
  }
  const n = Math.max(1, games.length);
  return { game, streak, astPerGame: ast / Math.max(1, 2 * games.length), margin, score, otRate: ot / n, close: close / n, tpm10 };
}

/** One league, start to finish: prints its seasons and returns what the thresholds look at. */
function playLeague(spec: string): SeasonReport[] {
  const [rngSeed, team = process.env.TEAM] = [Number(spec.split(':')[0]), spec.split(':')[1]];
  const seed: SeedData = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
  const t0 = performance.now();
  const userTid = team ? FRANCHISES.findIndex((f) => f.abbrev === team.toUpperCase()) : 19;
  if (userTid < 0) throw new Error(`${team} is no team in the seed`);
  const settings = { ...defaultSettings(), ...(process.env.DIFFICULTY && { difficulty: process.env.DIFFICULTY as League['settings']['difficulty'] }) };
  const league = createLeague({ name: 'Stars', userTid, coachName: 'Check', settings, seed, rngSeed });
  league.id = `star_check_${rngSeed}`;

  // the real league's top 20 scorers of 2025-26 (40+ games), measured in the first simulated season
  const realSeason = league.season - 1;
  const realTop = Object.values(league.players)
    // (real lines carry no on-floor team totals: their usage is Basketball Reference's)
    .map((p) => ({ p, r: { ...line(p, realSeason), usg: (p.stats.find((s) => s.real && s.season === realSeason && s.adv)?.adv?.usg ?? 0) / 100 } }))
    .filter((x) => x.r.gp >= 40)
    .sort((a, b) => b.r.ppg - a.r.ppg)
    .slice(0, 20);

  const startTop = Object.values(league.players)
    .filter((p) => p.tid >= 0)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 10);

  const reports: SeasonReport[] = [];
  for (let s = 0; s < seasons; s++) {
    if (startRegularSeason(league).length) {
      // auto-manage the user roster: cut extras, sign minimum deals to reach the minimum
      const roster = standardRoster(league, league.userTid).sort((a, b) => a.ovr - b.ovr);
      while (standardRoster(league, league.userTid).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
      for (const p of freeAgents(league).sort((a, b) => b.ovr - a.ovr)) {
        if (standardRoster(league, league.userTid).length >= CAP.rosterMin) break;
        userOffer(league, p.pid, askingContract(league, p, league.userTid).amount, 1);
      }
      const errs = startRegularSeason(league);
      if (errs.length) throw new Error(errs.join('; '));
    }
    let guard = 0;
    // every new injury of the season's games, seen as a new Injury on a player after a day
    const seen = new Map(Object.values(league.players).map((p) => [p.pid, p.injury]));
    const hurt: { type: string; games: number }[] = [];
    while ((league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') && guard++ < 600) {
      simDay(league);
      for (const p of Object.values(league.players)) {
        if (p.injury && p.injury !== seen.get(p.pid)) hurt.push({ type: p.injury.type, games: p.injury.gamesTotal });
        seen.set(p.pid, p.injury);
      }
    }
    const season = league.season;
    const rows = Object.values(league.players)
      .map((p) => ({ p, ...line(p, season), age: playerAge(p, season) }))
      .filter((x) => x.gp >= 50)
      .sort((a, b) => b.ppg - a.ppg);
    const lead = rows[0];
    const over30 = rows.filter((x) => x.ppg >= 30).length;
    const { game, streak, astPerGame, margin, score, otRate, close, tpm10 } = seasonGames(league, season);
    const perGame = (k: 'tpm' | 'stl') =>
      Object.values(league.players)
        .map((p) => {
          const st = p.stats.filter((x) => x.season === season && !x.playoffs);
          const gp = st.reduce((a, x) => a + x.gp, 0);
          return { name: playerName(p), gp, pg: st.reduce((a, x) => a + x[k], 0) / Math.max(1, gp), age: playerAge(p, season) };
        })
        .filter((x) => x.gp >= 50)
        .sort((a, b) => b.pg - a.pg)[0] ?? { name: '-', pg: 0, age: 0 };
    const tpm = perGame('tpm');
    const stl = perGame('stl');
    const over35 = rows.filter((x) => x.ppg >= 35).length;
    const oldLeader = lead && lead.age >= 36 ? `${playerName(lead.p)} (${lead.age}) in points` : tpm.age >= 36 ? `${tpm.name} (${tpm.age}) in threes` : null;
    const injuries = {
      perTeam: hurt.length / league.teams.length,
      ten: hurt.filter((h) => h.games >= 10).length,
      sixty: hurt.filter((h) => h.games >= 60).length,
      achilles: hurt.filter((h) => h.type === 'Ruptured Achilles').length,
      acl: hurt.filter((h) => h.type === 'Torn ACL').length,
    };
    const tops = league.teams.map((t) =>
      rows
        .filter((x) => x.p.tid === t.tid)
        .map((x) => x.mpg)
        .sort((a, b) => b - a),
    );
    const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
    const topMin: [number, number] = [avg(tops.map((x) => x[0] ?? 0)), avg(tops.map((x) => x[1] ?? 0))];
    const table = [...standings(league)].sort((a, b) => b.won - a.won);
    const abbrev = (tid: number) => league.teams[tid]?.abbrev ?? '-';
    const best = { team: abbrev(table[0].tid), won: table[0].won, lost: table[0].lost };
    reports.push({
      season,
      leader: { name: lead ? playerName(lead.p) : '-', ppg: lead?.ppg ?? 0 },
      game,
      best,
      streak: { team: abbrev(streak.tid), games: streak.games },
      tpm: { name: tpm.name, pg: tpm.pg },
      stl: { name: stl.name, pg: stl.pg },
      over35,
      tpm10,
      oldLeader,
      margin,
      score,
      injuries,
      otRate,
      close,
      topMin,
    });
    console.log(
      `${season}: ${rows
        .slice(0, quiet ? 3 : 5)
        .map((x) => `${playerName(x.p)} ${x.ppg.toFixed(1)} (${x.age}, ${x.p.ovr}, usg ${pct(x.usg)})`)
        .join(', ')} · ${over30} at 30+ · high ${game.name} ${game.pts} · best ${table
        .slice(0, 3)
        .map((r) => `${abbrev(r.tid)} ${r.won}-${r.lost}`)
        .join(', ')} · streak ${abbrev(streak.tid)} ${streak.games}`,
    );
    console.log(
      `  3PM ${tpm.name} ${tpm.pg.toFixed(2)} (${tpm.age}), ${tpm10} 10-three nights · STL ${stl.name} ${stl.pg.toFixed(2)} · margin ${margin.pts} (${margin.text}) · score ${score.pts} (${score.text}) · OT ${pct(otRate)}, by 3 or less ${pct(close)} · top-two MPG ${topMin[0].toFixed(1)}/${topMin[1].toFixed(1)} · injuries ${injuries.perTeam.toFixed(1)}/team, ${injuries.ten} of 10+, ${injuries.sixty} of 60+ (${injuries.achilles} Achilles, ${injuries.acl} ACL)`,
    );
    if (!quiet) {
      const best5 = Object.values(league.players)
        .filter((p) => p.tid >= 0)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 5);
      // the oldest regulars' minutes: real 34-and-up stars play about 30-32
      const vets = rows
        .filter((x) => x.age >= 34 && x.mpg >= 20)
        .sort((a, b) => b.mpg - a.mpg)
        .slice(0, 4);
      // the best team: its net rating per 100 and the players it was built on
      const top = league.teams[table[0].tid];
      const ts = top.seasons.find((x) => x.season === season)!;
      const core = Object.values(league.players)
        .filter((p) => p.tid === top.tid)
        .sort((a, b) => b.ovr - a.ovr)
        .slice(0, 4);
      console.log(
        `  ${top.abbrev}: net ${((100 * (ts.ptsFor - ts.ptsAgainst)) / Math.max(1, (ts.poss + ts.oppPoss) / 2)).toFixed(1)}, ${core.map((p) => `${playerName(p)} ${p.ovr}`).join(', ')}`,
      );
      console.log(
        `  top OVR: ${best5.map((p) => `${playerName(p)} ${p.ovr} (${playerAge(p, season)})`).join(', ')} · team AST ${astPerGame.toFixed(1)} (${TARGETS.ast}) · 34+ MPG: ${
          vets.map((x) => `${playerName(x.p)} ${x.mpg.toFixed(1)} (${x.age})`).join(', ') || 'none'
        }`,
      );
    }
    if (s === 0) {
      const miss = realTop.map((x) => ({ ...x, sim: line(x.p, season) })).filter((x) => x.sim.gp >= 20);
      const mae = miss.reduce((a, x) => a + Math.abs(x.sim.ppg - x.r.ppg), 0) / Math.max(1, miss.length);
      const off = miss.filter((x) => Math.abs(x.sim.ppg - x.r.ppg) > 3);
      console.log(
        `  real top-20 scorers (sim vs 2025-26, ${miss.length} with 20+ games): MAE ${mae.toFixed(1)}, ${off.length} more than 3 off${
          quiet ? '' : `\n    ${miss.map((x) => `${playerName(x.p)} ${x.sim.ppg.toFixed(1)} (${x.r.ppg.toFixed(1)}) usg ${pct(x.sim.usg)} (${pct(x.r.usg)})`).join('\n    ')}`
        }`,
      );
    }
    if (s === seasons - 1) break;
    if (league.fired) takeJob(league, league.jobOffers?.offers[0]?.tid ?? standings(league).find((r) => r.tid !== league.userTid)!.tid);
    startDraft(league);
    let picks = 0;
    while (nextPick(league) && picks++ < 100) autoDraftUserPick(league);
    finishDraftPhase(league);
    for (const p of expiringPlayers(league, league.userTid)) {
      const ask = askingContract(league, p, league.userTid);
      if (p.ovr >= 72) userResign(league, p.pid, ask.amount, ask.years);
    }
    startFreeAgency(league);
    for (let k = 0; k < 5 && !newSeason(league); k++)
      for (const p of restrictedFreeAgents(league, league.userTid).filter((x) => x.rfa!.sheet))
        userDecideSheet(league, p.pid, aiMatchVerdict(league, p).match && !sheetDecisionBlocked(league, p.pid, true));
    if (league.phase !== 'preseason') throw new Error(`The new season didn't start (phase ${league.phase})`);
  }
  if (!quiet) {
    // how the opening night's best aged: OVR each summer, by age
    console.log('\nOpening night top 10 by OVR, each summer:');
    for (const p of startTop) {
      const arc = p.ratingsHistory.filter((h) => h.season >= league.season - seasons + 1).map((h) => `${playerAge(p, h.season)}:${h.ovr}`);
      console.log(`  ${playerName(p).padEnd(24)} ${arc.join(' ')}${p.tid === -3 ? ' (retired)' : ''}`);
    }
  }
  console.log(`${seasons} seasons in ${((performance.now() - t0) / 1000).toFixed(0)}s`);
  return reports;
}

if (seeds.length === 1) {
  const reports = playLeague(seeds[0]);
  // (a league run by playLeagues hands its seasons back; on its own it judges them itself)
  if (process.send) process.send(reports);
  else process.exit(verdict(reports.map((r) => ({ seed: seeds[0], ...r }))) ? 0 : 1);
} else {
  void playLeagues();
}
