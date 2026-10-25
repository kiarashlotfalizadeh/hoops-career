// Every player's box score in every game since 1996-97 (data/raw/games/PlayerStatisticsExtended.csv),
// added up into his lines: one per team, season and part (regular season, postseason). Beside the
// traditional line each game carries his plus-minus, the possessions he played, his team's offensive
// and defensive ratings while he played and his shares of its shots, free throws and turnovers then,
// so a line also holds his team's points for and against and its usage with him on the floor. Also
// his regular-season career highs, and his name and teams for matching him to Basketball Reference.
// Parsed once and cached as JSON next to the file.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { splitCsv } from '../nba/csv';
import { BOX_FILE, GAMES_RAW, gameOf, lineKey, type GamePart } from './sources';

export interface BoxLine {
  pid: number;
  season: number;
  teamId: number;
  part: GamePart;
  gp: number;
  /** Games the box score lists him as a starter (see BoxData.startsListed). */
  gs: number;
  min: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  pm: number;
  /** His team's possessions, points and points allowed while he played. */
  poss: number;
  ptsFor: number;
  ptsAgainst: number;
  /** His team's shots, free throws and turnovers while he played. */
  teamFga: number;
  teamFta: number;
  teamTov: number;
  /** His first game of the line (yyyymmdd): orders a season split between teams. */
  first: number;
}

/** A career high: the number, the season, the date (yyyymmdd), his team and the opponent (NBA.com team ids). */
export type BoxHigh = [v: number, season: number, date: number, teamId: number, oppId: number];
export const HIGH_STATS = ['pts', 'reb', 'ast', 'stl', 'blk', 'tpm'] as const;
export type HighStat = (typeof HIGH_STATS)[number];

export interface BoxData {
  lines: BoxLine[];
  /** Everyone who played, by NBA.com person id: his name and his team in each season (the one he played most games for). */
  people: Record<number, { name: string; teams: Record<number, number> }>;
  /** Each NBA.com team id's latest name ("Golden State Warriors"). */
  teamNames: Record<number, string>;
  /** By `${season}|${part}`: whether the box scores mark five starters a side (they don't in some seasons). */
  startsListed: Record<string, boolean>;
  /** Regular-season career highs by person id. */
  highs: Record<number, Partial<Record<HighStat, BoxHigh>>>;
}

/** Bump when what is read changes, so the cache is rebuilt. */
const CACHE_VERSION = 5;

/** One player's game, as read. */
interface Game {
  g: { season: number; part: GamePart };
  gameId: string;
  pid: number;
  name: string;
  date: number;
  teamId: number;
  team: string;
  oppId: number;
  opp: string;
  min: number;
  starter: boolean;
  box: Record<'fgm' | 'fga' | 'tpm' | 'tpa' | 'ftm' | 'fta' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'pts', number>;
  pm: number;
  poss: number;
  ortg: number;
  drtg: number;
  /** His shares of his team's shots, free throws and turnovers while he played. */
  share: Record<'fga' | 'fta' | 'tov', number>;
}

/** Minutes as written: "34:12", or a number, which some seasons write as minutes and seconds ("34.12", `mmss`). */
const minutes = (s: string, mmss: boolean) => {
  if (!s) return 0;
  const m = /^(\d+):(\d+)$/.exec(s) ?? (mmss ? /^(\d+)\.([0-5]\d)$/.exec(s) : null);
  return m ? Number(m[1]) + Number(m[2]) / 60 : Number(s) || 0;
};

/**
 * How each season writes minutes, and what each team's game is short of. Through 2023-24 the box
 * scores list whole minutes, cut off (a team's add up to 236.8 a game, not 240 and its overtime), and
 * 2024-25 and 2025-26 write minutes and seconds as a decimal ("38.17" for 38:17). A season whose
 * two-decimal minutes never pass .59 is read as minutes and seconds; then each team's game gets back
 * what its listed minutes fall short of its length (240, and 25 an overtime), shared equally by the
 * players who played (those listed with 0 played under a minute), as cut-off minutes lose about half a
 * minute each (a game short by more than 12, a player's row missing, is left alone).
 */
async function minuteRules(file: string): Promise<{ mmss: Set<number>; extra: Map<string, number> }> {
  const seasons = new Map<number, { rows: number; twoDecimals: number; past59: number }>();
  const games = new Map<string, { season: number; dec: number; mmss: number; n: number }>();
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const c = splitCsv(line);
    if (!idx) {
      idx = Object.fromEntries(c.map((h, i) => [h, i]));
      continue;
    }
    const at = idx;
    const get = (k: string) => c[at[k]] ?? '';
    const g = gameOf(get('gameId'));
    const raw = get('numMinutes');
    if (!g || !raw) continue;
    const s = seasons.get(g.season) ?? { rows: 0, twoDecimals: 0, past59: 0 };
    seasons.set(g.season, s);
    s.rows++;
    const two = /^\d+\.(\d\d)$/.exec(raw);
    if (two) {
      s.twoDecimals++;
      if (Number(two[1]) >= 60) s.past59++;
    }
    const k = `${get('gameId')}|${get('playerteamCity')} ${get('playerteamName')}`;
    const e = games.get(k) ?? { season: g.season, dec: 0, mmss: 0, n: 0 };
    games.set(k, e);
    e.dec += minutes(raw, false);
    e.mmss += minutes(raw, true);
    e.n++;
  }
  const mmss = new Set([...seasons].filter(([, s]) => s.twoDecimals > s.rows / 2 && s.past59 < s.twoDecimals * 0.02).map(([season]) => season));
  const extra = new Map<string, number>();
  for (const [k, e] of games) {
    const sum = mmss.has(e.season) ? e.mmss : e.dec;
    const length = 240 + 25 * Math.max(0, Math.round((sum + 5 - 240) / 25));
    const short = length - sum;
    if (short > 0.01 && short <= 12) extra.set(k, short / e.n);
  }
  return { mmss, extra };
}

/**
 * Box-score lines for seasons before `until` (later games, the new season's first nights, only name
 * players and their teams), and everyone's career highs.
 */
export async function readBoxScores(until: number, opts: { dir?: string; log?: (m: string) => void } = {}): Promise<BoxData> {
  const log = opts.log ?? console.log;
  const dir = opts.dir ?? GAMES_RAW;
  const file = join(dir, BOX_FILE);
  if (!existsSync(file)) throw new Error(`No box scores (${BOX_FILE}) in ${dir}: put the game files there (see the README).`);
  const st = statSync(file);
  const key = `${CACHE_VERSION}:${until}:${st.size}:${st.mtimeMs}`;
  const cache = join(dir, 'cache_box.json');
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, 'utf8')) as { key?: string; value: BoxData };
    if (c.key === key) return c.value;
  }
  const t0 = Date.now();
  const rules = await minuteRules(file);
  const lines = new Map<string, BoxLine & { known: Record<'fga' | 'fta' | 'tov', [team: number, poss: number]>; unknown: Record<'fga' | 'fta' | 'tov', number> }>();
  const people: BoxData['people'] = {};
  // games per player by season and team (season * 1e10 + team id)
  const teamGames = new Map<number, Map<number, number>>();
  const teamNames: BoxData['teamNames'] = {};
  const teamNameAt: Record<number, number> = {};
  const flagged = new Map<string, { teamGames: Set<string>; flags: number }>();
  const highs: BoxData['highs'] = {};
  // a season's rows may carry their teams by name alone (2021-22's do): those wait for the names' ids
  const idByName = new Map<string, number>();
  let rows = 0;
  const pending: Game[] = [];
  const take = (r: Game, last = false) => {
    const { g, pid, date, box } = r;
    const teamId = r.teamId || idByName.get(r.team) || 0;
    const oppId = r.oppId || idByName.get(r.opp) || 0;
    if (!teamId || (!oppId && !last)) {
      pending.push(r);
      return;
    }
    people[pid] ??= { name: r.name, teams: {} };
    const tg = teamGames.get(pid) ?? new Map<number, number>();
    teamGames.set(pid, tg);
    tg.set(g.season * 1e10 + teamId, (tg.get(g.season * 1e10 + teamId) ?? 0) + 1);
    // (the new season's games only name players and their teams: they name its rookies)
    if (g.season >= until) return;
    rows++;
    const k = lineKey(pid, g.season, teamId, g.part);
    let e = lines.get(k);
    if (!e) {
      e = {
        pid,
        season: g.season,
        teamId,
        part: g.part,
        gp: 0,
        gs: 0,
        min: 0,
        fgm: 0,
        fga: 0,
        tpm: 0,
        tpa: 0,
        ftm: 0,
        fta: 0,
        orb: 0,
        drb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pts: 0,
        pm: 0,
        poss: 0,
        ptsFor: 0,
        ptsAgainst: 0,
        teamFga: 0,
        teamFta: 0,
        teamTov: 0,
        first: date,
        known: { fga: [0, 0], fta: [0, 0], tov: [0, 0] },
        unknown: { fga: 0, fta: 0, tov: 0 },
      };
      lines.set(k, e);
    }
    e.gp++;
    if (r.starter) e.gs++;
    e.min += r.min;
    for (const [s, v] of Object.entries(box)) (e as unknown as Record<string, number>)[s] += v;
    e.pm += r.pm;
    e.poss += r.poss;
    e.ptsFor += (r.ortg * r.poss) / 100;
    e.ptsAgainst += (r.drtg * r.poss) / 100;
    // his team's shots, free throws and turnovers while he played: his own over his share of them
    for (const s of ['fga', 'fta', 'tov'] as const) {
      const sh = r.share[s];
      if (box[s] > 0 && sh > 0) {
        e.known[s][0] += box[s] / sh;
        e.known[s][1] += r.poss;
      } else e.unknown[s] += r.poss;
    }
    e.first = Math.min(e.first, date);
    const fk = `${g.season}|${g.part}`;
    const f = flagged.get(fk) ?? { teamGames: new Set<string>(), flags: 0 };
    flagged.set(fk, f);
    f.teamGames.add(`${r.gameId}|${teamId}`);
    if (r.starter) f.flags++;
    if (g.part === 'reg') {
      const h = (highs[pid] ??= {});
      const nums: Record<HighStat, number> = { pts: box.pts, reb: box.orb + box.drb, ast: box.ast, stl: box.stl, blk: box.blk, tpm: box.tpm };
      for (const s of HIGH_STATS) {
        const v = nums[s];
        const cur = h[s];
        if (v > 0 && (!cur || v > cur[0] || (v === cur[0] && date < cur[2]))) h[s] = [v, g.season, date, teamId, oppId];
      }
    }
  };
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const c = splitCsv(line);
    if (!idx) {
      idx = Object.fromEntries(c.map((h, i) => [h, i]));
      continue;
    }
    const at = idx;
    const get = (k: string) => c[at[k]] ?? '';
    const n = (k: string) => Number(get(k)) || 0;
    const g = gameOf(get('gameId'));
    const pid = n('personId');
    if (!g || !pid) continue;
    const raw = get('numMinutes');
    const listed = minutes(raw, rules.mmss.has(g.season));
    // (a whole-minute season lists a player who played under a minute with 0: he played)
    if (!raw || (listed <= 0 && rules.mmss.has(g.season))) continue;
    const min = listed + (rules.extra.get(`${get('gameId')}|${get('playerteamCity')} ${get('playerteamName')}`) ?? 0);
    const date = Number(get('gameDateTimeEst').slice(0, 10).replace(/-/g, '')) || g.season * 10000;
    const team = `${get('playerteamCity')} ${get('playerteamName')}`.trim();
    const teamId = n('playerteamId');
    if (teamId && team) {
      idByName.set(team, teamId);
      if (date >= (teamNameAt[teamId] ?? 0)) {
        teamNameAt[teamId] = date;
        teamNames[teamId] = team;
      }
    }
    take({
      g,
      gameId: get('gameId'),
      pid,
      name: `${get('firstName')} ${get('lastName')}`.trim(),
      date,
      teamId,
      team,
      oppId: n('opponentteamId'),
      opp: `${get('opponentteamCity')} ${get('opponentteamName')}`.trim(),
      min,
      starter: get('startingPosition') !== '',
      box: {
        fgm: n('fieldGoalsMade'),
        fga: n('fieldGoalsAttempted'),
        tpm: n('threePointersMade'),
        tpa: n('threePointersAttempted'),
        ftm: n('freeThrowsMade'),
        fta: n('freeThrowsAttempted'),
        orb: n('reboundsOffensive'),
        drb: n('reboundsDefensive'),
        ast: n('assists'),
        stl: n('steals'),
        blk: n('blocks'),
        tov: n('turnovers'),
        pf: n('foulsPersonal'),
        pts: n('points'),
      },
      pm: n('plusMinusPoints'),
      poss: n('possessions'),
      ortg: n('offensiveRating'),
      drtg: n('defensiveRating'),
      share: { fga: n('percentTeamFieldGoalsAttempted'), fta: n('percentTeamFreeThrowsAttempted'), tov: n('percentTeamTurnovers') },
    });
  }
  const unplaced = pending.splice(0);
  for (const r of unplaced) take(r, true);
  if (pending.length) log(`  box scores: ${pending.length} player games with a team no other row names, left out (${[...new Set(pending.map((r) => r.team))].join(', ')})`);
  for (const [pid, tg] of teamGames) {
    const best = new Map<number, [teamId: number, games: number]>();
    for (const [k, games] of tg) {
      const season = Math.floor(k / 1e10);
      const teamId = k - season * 1e10;
      const cur = best.get(season);
      if (!cur || games > cur[1]) best.set(season, [teamId, games]);
    }
    people[pid].teams = Object.fromEntries([...best].map(([s, [t]]) => [s, t]));
  }
  const out: BoxLine[] = [];
  for (const e of lines.values()) {
    const { known, unknown, ...line } = e;
    // (a game he took none of them in says nothing of his team's: its possessions count at his rate elsewhere in the line, or a league-like rate)
    const fill = (s: 'fga' | 'fta' | 'tov', rate: number) => known[s][0] + unknown[s] * (known[s][1] > 0 ? known[s][0] / known[s][1] : rate);
    line.teamFga = Math.round(fill('fga', 0.87));
    line.teamFta = Math.round(fill('fta', 0.25));
    line.teamTov = Math.round(fill('tov', 0.14));
    line.min = Math.round(line.min);
    line.poss = Math.round(line.poss);
    line.ptsFor = Math.round(line.ptsFor);
    line.ptsAgainst = Math.round(line.ptsAgainst);
    out.push(line);
  }
  out.sort((a, b) => a.season - b.season || a.pid - b.pid || a.first - b.first || (a.part === b.part ? 0 : a.part === 'reg' ? -1 : 1));
  const startsListed = Object.fromEntries([...flagged].map(([k, f]) => [k, Math.abs(f.flags / f.teamGames.size - 5) < 0.2]));
  const value: BoxData = { lines: out, people, teamNames, startsListed, highs };
  writeFileSync(cache, JSON.stringify({ key, value }));
  log(
    `  box scores read in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${rows.toLocaleString('en-US')} player games, ${out.length.toLocaleString('en-US')} lines; minutes and seconds in ${[...rules.mmss].sort().join(', ') || 'no season'}, ${rules.extra.size.toLocaleString('en-US')} team games' cut-off minutes given back`,
  );
  return value;
}
