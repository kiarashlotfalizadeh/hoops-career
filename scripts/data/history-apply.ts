// Apply the seasons before the stat seasons (back to 2003-04) to an existing src/data/seed.json built
// without them, without rebuilding it: each player's real seasons get his career before them and his
// numbers at franchises he has left, as data:build now writes them (careers.ts), and a player the
// seed has no draft for gets his from the draft pages now cached (LeBron James's 2003). Nothing else
// moves: history never reaches the ratings, so the seed stays as calibrated. A seed that already has
// careers is left alone: rebuild it with data:build.
//
// Then it writes the league's past (src/data/history.json, see src/core/league/media/past.ts): every
// NBA Finals since 1947 (champion, runner-up, games, Finals MVP), every MVP, and each seed player's
// real honours (MVP, Finals MVP, DPOY, ROY, Sixth Man, Most Improved, All-NBA, All-Defensive, All-Star,
// titles). Read from what is on disk: the honours from the Awards column of the per-game and advanced
// pages (2003-04 on, every current player's whole career), the Finals and the rings from the game
// files' playoff box scores (1996-97 on), and before them a small hand-written table of public facts
// (OLD_FINALS, OLD_MVPS). Nothing is fetched. Last, the record book's past (src/data/records.json:
// the best single games since 1996-97, see records-apply.ts).
// Needs the Basketball Reference pages data:fetch caches (no NBA.com data).
// Usage: npm run data:history
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { DRAFT_YEARS, FIRST_SEASON, HISTORY_SEASONS, STAT_SEASONS, SEED_SEASON } from './sources';
import { load, parseDraft, parseRoster, seedDraft, tableRows, type DraftRow, type RosterRow } from './parse';
import { byId, formerNumbers, historyLines, loadSeasons } from './careers';
import { seasonLabel } from '../../src/core/constants';
import type { SeedData } from '../../src/core/league/create';
import { FRANCHISES } from '../../src/core/teams';
import type { HistoryData, HistoryFinal } from '../../src/core/league/media/past';
import { writeRecords } from './records-apply';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');
const HISTORY_OUT = process.env.HC_HISTORY_OUT ?? join(process.cwd(), 'src', 'data', 'history.json');
const GAMES_CSV = join(RAW, 'games', 'PlayerStatisticsExtended.csv');
const read = (key: string) => {
  const f = join(RAW, `${key}.html`);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};

function applyCareers() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  if (seed.careersFrom !== undefined) {
    console.log(`${OUT} already has careers from ${seasonLabel(seed.careersFrom)}; rebuild it with npm run data:build to take new pages in.`);
    return;
  }
  const history = loadSeasons(read, HISTORY_SEASONS);
  const recent = loadSeasons(read, STAT_SEASONS);
  const missing = [...history.missing, ...recent.missing];
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in ${RAW}. Run \`npm run data:fetch\` first.`);
    process.exit(1);
  }
  const histById = byId(history.perGame);
  const histAdvById = byId(history.adv);
  const recentById = byId(recent.perGame);
  const pages = new Map<string, RosterRow[]>();
  const rosterRow = (id: string, team: string, season: number) => {
    const key = `roster_${team}_${season}`;
    if (!pages.has(key)) {
      const html = read(key);
      pages.set(key, html ? parseRoster(html, team, season) : []);
    }
    return pages.get(key)!.find((r) => r.id === id);
  };
  const drafts = new Map<string, DraftRow>();
  for (const y of DRAFT_YEARS) {
    const html = read(`draft_${y}`);
    if (html) for (const d of parseDraft(html, y)) drafts.set(d.id, d);
  }

  let withHistory = 0;
  let lines = 0;
  const numbered: string[] = [];
  const drafted: string[] = [];
  for (const sp of seed.players) {
    const past = histById.get(sp.id) ?? [];
    const before = historyLines(past, histAdvById.get(sp.id) ?? []);
    if (before.length) withHistory++;
    lines += before.length;
    sp.stats = [...before, ...sp.stats];
    const jerseys = formerNumbers([...past, ...(recentById.get(sp.id) ?? [])], sp.team, (team, season) => rosterRow(sp.id, team, season));
    if (Object.keys(jerseys).length) {
      sp.jerseys = jerseys;
      numbered.push(
        `${sp.first} ${sp.last} ${Object.entries(jerseys)
          .map(([t, j]) => `${t} #${j}`)
          .join(', ')}`,
      );
    }
    // the build takes a draft row over everything else
    const dr = drafts.get(sp.id);
    if (dr && !sp.draft?.round) {
      sp.draft = seedDraft(dr, undefined);
      drafted.push(`${sp.first} ${sp.last} (${dr.year})`);
    }
  }
  seed.careersFrom = FIRST_SEASON;
  seed.source = seed.source.replace(
    /^Basketball Reference: [^;]*;/,
    `Basketball Reference: ${seasonLabel(FIRST_SEASON)} to ${seasonLabel(SEED_SEASON - 1)} per-game & advanced (ratings from ${seasonLabel(STAT_SEASONS[0])});`,
  );
  console.log(`careers: ${lines} seasons before ${seasonLabel(STAT_SEASONS[0])} for ${withHistory} players`);
  console.log(`numbers at former franchises for ${numbered.length}: ${numbered.join('; ')}`);
  if (drafted.length) console.log(`drafts now on record: ${drafted.join(', ')}`);
  const json = JSON.stringify(seed);
  writeFileSync(OUT, json);
  console.log(`wrote ${OUT} (${(json.length / 1e6).toFixed(2)} MB)`);
}

// ---------------------------------------------------------------- the league's past (history.json)

/**
 * The Finals before the game files (1946-47 to 1995-96), public record: [season (end year), champion,
 * runner-up (today's franchise code; '' for a franchise long gone), the champion's wins, the
 * runner-up's, the Finals MVP (named from 1969), the champion's name then and the runner-up's (when
 * the franchise had another).
 */
const OLD_FINALS: HistoryFinal[] = [
  [1947, 'GSW', '', 4, 1, '', 'Philadelphia Warriors', 'Chicago Stags'],
  [1948, '', 'GSW', 4, 2, '', 'Baltimore Bullets', 'Philadelphia Warriors'],
  [1949, 'LAL', '', 4, 2, '', 'Minneapolis Lakers', 'Washington Capitols'],
  [1950, 'LAL', 'PHI', 4, 2, '', 'Minneapolis Lakers', 'Syracuse Nationals'],
  [1951, 'SAC', 'NYK', 4, 3, '', 'Rochester Royals'],
  [1952, 'LAL', 'NYK', 4, 3, '', 'Minneapolis Lakers'],
  [1953, 'LAL', 'NYK', 4, 1, '', 'Minneapolis Lakers'],
  [1954, 'LAL', 'PHI', 4, 3, '', 'Minneapolis Lakers', 'Syracuse Nationals'],
  [1955, 'PHI', 'DET', 4, 3, '', 'Syracuse Nationals', 'Fort Wayne Pistons'],
  [1956, 'GSW', 'DET', 4, 1, '', 'Philadelphia Warriors', 'Fort Wayne Pistons'],
  [1957, 'BOS', 'ATL', 4, 3, '', undefined, 'St. Louis Hawks'],
  [1958, 'ATL', 'BOS', 4, 2, '', 'St. Louis Hawks'],
  [1959, 'BOS', 'LAL', 4, 0, '', undefined, 'Minneapolis Lakers'],
  [1960, 'BOS', 'ATL', 4, 3, '', undefined, 'St. Louis Hawks'],
  [1961, 'BOS', 'ATL', 4, 1, '', undefined, 'St. Louis Hawks'],
  [1962, 'BOS', 'LAL', 4, 3, ''],
  [1963, 'BOS', 'LAL', 4, 2, ''],
  [1964, 'BOS', 'GSW', 4, 1, '', undefined, 'San Francisco Warriors'],
  [1965, 'BOS', 'LAL', 4, 1, ''],
  [1966, 'BOS', 'LAL', 4, 3, ''],
  [1967, 'PHI', 'GSW', 4, 2, '', undefined, 'San Francisco Warriors'],
  [1968, 'BOS', 'LAL', 4, 2, ''],
  [1969, 'BOS', 'LAL', 4, 3, 'Jerry West'],
  [1970, 'NYK', 'LAL', 4, 3, 'Willis Reed'],
  [1971, 'MIL', 'WAS', 4, 0, 'Kareem Abdul-Jabbar', undefined, 'Baltimore Bullets'],
  [1972, 'LAL', 'NYK', 4, 1, 'Wilt Chamberlain'],
  [1973, 'NYK', 'LAL', 4, 1, 'Willis Reed'],
  [1974, 'BOS', 'MIL', 4, 3, 'John Havlicek'],
  [1975, 'GSW', 'WAS', 4, 0, 'Rick Barry', undefined, 'Washington Bullets'],
  [1976, 'BOS', 'PHX', 4, 2, 'Jo Jo White'],
  [1977, 'POR', 'PHI', 4, 2, 'Bill Walton'],
  [1978, 'WAS', 'OKC', 4, 3, 'Wes Unseld', 'Washington Bullets', 'Seattle SuperSonics'],
  [1979, 'OKC', 'WAS', 4, 1, 'Dennis Johnson', 'Seattle SuperSonics', 'Washington Bullets'],
  [1980, 'LAL', 'PHI', 4, 2, 'Magic Johnson'],
  [1981, 'BOS', 'HOU', 4, 2, 'Cedric Maxwell'],
  [1982, 'LAL', 'PHI', 4, 2, 'Magic Johnson'],
  [1983, 'PHI', 'LAL', 4, 0, 'Moses Malone'],
  [1984, 'BOS', 'LAL', 4, 3, 'Larry Bird'],
  [1985, 'LAL', 'BOS', 4, 2, 'Kareem Abdul-Jabbar'],
  [1986, 'BOS', 'HOU', 4, 2, 'Larry Bird'],
  [1987, 'LAL', 'BOS', 4, 2, 'Magic Johnson'],
  [1988, 'LAL', 'DET', 4, 3, 'James Worthy'],
  [1989, 'DET', 'LAL', 4, 0, 'Joe Dumars'],
  [1990, 'DET', 'POR', 4, 1, 'Isiah Thomas'],
  [1991, 'CHI', 'LAL', 4, 1, 'Michael Jordan'],
  [1992, 'CHI', 'POR', 4, 2, 'Michael Jordan'],
  [1993, 'CHI', 'PHX', 4, 2, 'Michael Jordan'],
  [1994, 'HOU', 'NYK', 4, 3, 'Hakeem Olajuwon'],
  [1995, 'HOU', 'ORL', 4, 0, 'Hakeem Olajuwon'],
  [1996, 'CHI', 'OKC', 4, 2, 'Michael Jordan', undefined, 'Seattle SuperSonics'],
];

/** Finals MVPs from 1996-97 to 2002-03, before the pages' Awards columns (public record). */
const OLD_FINALS_MVP: Record<number, string> = {
  1997: 'Michael Jordan',
  1998: 'Michael Jordan',
  1999: 'Tim Duncan',
  2000: "Shaquille O'Neal",
  2001: "Shaquille O'Neal",
  2002: "Shaquille O'Neal",
  2003: 'Tim Duncan',
};

/** MVPs from 1955-56 (the first) to 2002-03 (public record); the pages name the rest. */
const OLD_MVPS: [number, string][] = [
  [1956, 'Bob Pettit'],
  [1957, 'Bob Cousy'],
  [1958, 'Bill Russell'],
  [1959, 'Bob Pettit'],
  [1960, 'Wilt Chamberlain'],
  [1961, 'Bill Russell'],
  [1962, 'Bill Russell'],
  [1963, 'Bill Russell'],
  [1964, 'Oscar Robertson'],
  [1965, 'Bill Russell'],
  [1966, 'Wilt Chamberlain'],
  [1967, 'Wilt Chamberlain'],
  [1968, 'Wilt Chamberlain'],
  [1969, 'Wes Unseld'],
  [1970, 'Willis Reed'],
  [1971, 'Kareem Abdul-Jabbar'],
  [1972, 'Kareem Abdul-Jabbar'],
  [1973, 'Dave Cowens'],
  [1974, 'Kareem Abdul-Jabbar'],
  [1975, 'Bob McAdoo'],
  [1976, 'Kareem Abdul-Jabbar'],
  [1977, 'Kareem Abdul-Jabbar'],
  [1978, 'Bill Walton'],
  [1979, 'Moses Malone'],
  [1980, 'Kareem Abdul-Jabbar'],
  [1981, 'Julius Erving'],
  [1982, 'Moses Malone'],
  [1983, 'Moses Malone'],
  [1984, 'Larry Bird'],
  [1985, 'Larry Bird'],
  [1986, 'Larry Bird'],
  [1987, 'Magic Johnson'],
  [1988, 'Michael Jordan'],
  [1989, 'Magic Johnson'],
  [1990, 'Magic Johnson'],
  [1991, 'Michael Jordan'],
  [1992, 'Michael Jordan'],
  [1993, 'Charles Barkley'],
  [1994, 'Hakeem Olajuwon'],
  [1995, 'David Robinson'],
  [1996, 'Michael Jordan'],
  [1997, 'Karl Malone'],
  [1998, 'Michael Jordan'],
  [1999, 'Karl Malone'],
  [2000, "Shaquille O'Neal"],
  [2001, 'Allen Iverson'],
  [2002, 'Tim Duncan'],
  [2003, 'Tim Duncan'],
];

/** The game files' team names (city and nickname, then and now) to today's franchise code, with the name then when it differs. */
const CSV_TEAMS: Record<string, [code: string, as?: string]> = {
  'Seattle SuperSonics': ['OKC', 'Seattle SuperSonics'],
  'New Jersey Nets': ['BKN', 'New Jersey Nets'],
  'Washington Bullets': ['WAS', 'Washington Bullets'],
  'New Orleans Hornets': ['NOP', 'New Orleans Hornets'],
  'Charlotte Bobcats': ['CHA', 'Charlotte Bobcats'],
  'Vancouver Grizzlies': ['MEM', 'Vancouver Grizzlies'],
};

/** A page's Awards codes to the award's name on a player's record (the game's own names; the rest, like Clutch Player, aren't kept). */
const CODE_TYPE: Record<string, string> = {
  MVP: 'MVP',
  'Finals MVP': 'Finals MVP',
  DPOY: 'Defensive Player of the Year',
  ROY: 'Rookie of the Year',
  '6MOY': 'Sixth Man of the Year',
  MIP: 'Most Improved Player',
  NBA1: 'All-NBA 1st Team',
  NBA2: 'All-NBA 2nd Team',
  NBA3: 'All-NBA 3rd Team',
  DEF1: 'All-Defensive 1st Team',
  DEF2: 'All-Defensive 2nd Team',
  AS: 'All-Star',
};

/** Split a CSV line (quoted fields may hold commas). */
function csvSplit(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * The game files' playoffs: each season's Finals (the two teams and each one's wins, by game) and
 * who played for each team in the playoffs (NBA.com person ids), for the rings.
 */
async function csvPlayoffs(): Promise<{ finals: Map<number, Map<string, Set<string>>>; played: Map<string, Set<number>> }> {
  const finals = new Map<number, Map<string, Set<string>>>();
  const played = new Map<string, Set<number>>();
  const rl = createInterface({ input: createReadStream(GAMES_CSV), crlfDelay: Infinity });
  let col: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!col) {
      col = Object.fromEntries(line.split(',').map((h, i) => [h, i]));
      continue;
    }
    if (!line.includes(',Playoffs,')) continue;
    const f = csvSplit(line);
    if (f[col.gameType] !== 'Playoffs') continue;
    const season = Number(f[col.gameDateTimeEst].slice(0, 4));
    const team = `${f[col.playerteamCity]} ${f[col.playerteamName]}`;
    if (Number(f[col.numMinutes] || 0) > 0) {
      const key = `${season}:${team}`;
      if (!played.has(key)) played.set(key, new Set());
      played.get(key)!.add(Number(f[col.personId]));
    }
    if (f[col.gameLabel] !== 'NBA Finals' || f[col.win] !== '1') continue;
    if (!finals.has(season)) finals.set(season, new Map());
    const won = finals.get(season)!;
    if (!won.has(team)) won.set(team, new Set());
    won.get(team)!.add(f[col.gameId]);
    // the loser's side of the same game names the other team
    const opp = `${f[col.opponentteamCity]} ${f[col.opponentteamName]}`;
    if (!won.has(opp)) won.set(opp, new Set());
  }
  return { finals, played };
}

/** "2005-2009,2011": a sorted list of seasons with runs collapsed. */
function seasonRuns(seasons: number[]): string {
  const s = [...new Set(seasons)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(',');
}

async function writeHistory() {
  const seed = JSON.parse(readFileSync(OUT, 'utf8')) as SeedData;
  const ids = new Set(seed.players.map((p) => p.id));
  const byNba = new Map(seed.players.filter((p) => p.nbaId).map((p) => [p.nbaId!, p.id]));
  const nameOf = new Map<string, string>();
  // each seed player's honours from the pages' Awards columns, by code (a traded player's rows repeat them)
  const honours = new Map<string, Map<string, Set<number>>>();
  const mvps = new Map<number, string>();
  const fmvps = new Map<number, string>();
  const missing: string[] = [];
  for (let season = FIRST_SEASON; season < SEED_SEASON; season++) {
    for (const key of [`per_game_${season}`, `advanced_${season}`]) {
      const html = read(key);
      if (!html) {
        missing.push(key);
        continue;
      }
      const $ = load(html);
      // (the Finals MVP is in the playoffs' table)
      const tables = key.startsWith('per') ? [['per_game_stats', 'per_game']] : [['advanced', 'advanced_stats'], ['advanced_post']];
      for (const r of tables.flatMap((t) => tableRows($, t))) {
        const id = r.name_display__id ?? r.player__id;
        const cell = r.awards;
        if (!id || !cell) continue;
        const name = (r.name_display ?? r.player ?? '').replace(/\*$/, '').trim();
        nameOf.set(id, name);
        for (const raw of cell.split(',')) {
          const m = /^(.+?)(?:-(\d+))?$/.exec(raw.trim());
          if (!m) continue;
          const [, code, place] = m;
          // a vote placing (MVP-3) is no award; a selection (AS, NBA1) has none
          if (place !== undefined && place !== '1') continue;
          if (code === 'MVP') mvps.set(season, name);
          if (code === 'Finals MVP') fmvps.set(season, name);
          if (!ids.has(id) || !CODE_TYPE[code]) continue;
          if (!honours.has(id)) honours.set(id, new Map());
          const h = honours.get(id)!;
          if (!h.has(code)) h.set(code, new Set());
          h.get(code)!.add(season);
        }
      }
    }
  }
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} in ${RAW}. Run \`npm run data:fetch\` first.`);
    process.exit(1);
  }
  // the Finals and the rings from the game files
  if (!existsSync(GAMES_CSV)) {
    console.error(`Missing ${GAMES_CSV}: the Finals since 1996-97 and the rings come from it.`);
    process.exit(1);
  }
  const { finals: csvFinals, played } = await csvPlayoffs();
  const finals: HistoryFinal[] = [...OLD_FINALS];
  const codeOf = (team: string): [string, string | undefined] => {
    if (CSV_TEAMS[team]) return [CSV_TEAMS[team][0], CSV_TEAMS[team][1]];
    const f = FRANCHISES.find((x) => `${x.region} ${x.name}` === team || (x.abbrev === 'LAC' && team === 'LA Clippers'));
    if (!f) throw new Error(`No franchise for "${team}"`);
    return [f.abbrev, undefined];
  };
  const rings: string[] = [];
  for (const season of [...csvFinals.keys()].sort((a, b) => a - b)) {
    if (season <= OLD_FINALS[OLD_FINALS.length - 1][0] || season >= SEED_SEASON) continue;
    const teams = [...csvFinals.get(season)!].sort((a, b) => b[1].size - a[1].size);
    if (teams.length !== 2 || teams[0][1].size !== 4) throw new Error(`Finals ${season}: ${teams.map(([t, g]) => `${t} ${g.size}`).join(', ')}`);
    const [champ, runner] = teams;
    const [c, cAs] = codeOf(champ[0]);
    const [r, rAs] = codeOf(runner[0]);
    const mvp = fmvps.get(season) ?? OLD_FINALS_MVP[season] ?? '';
    finals.push([season, c, r, 4, runner[1].size, mvp, ...(cAs || rAs ? [cAs, rAs] : [])] as HistoryFinal);
    // a ring for everyone who played for the champion in those playoffs
    for (const nba of played.get(`${season}:${champ[0]}`) ?? []) {
      const id = byNba.get(nba);
      if (!id) continue;
      if (!honours.has(id)) honours.set(id, new Map());
      const h = honours.get(id)!;
      if (!h.has('CH')) h.set('CH', new Set());
      h.get('CH')!.add(season);
      rings.push(id);
    }
  }
  const last = finals[finals.length - 1][0];
  if (last !== SEED_SEASON - 1) throw new Error(`The Finals end at ${last}, not ${SEED_SEASON - 1}`);
  const allMvps: [number, string][] = [...OLD_MVPS, ...[...mvps].sort((a, b) => a[0] - b[0])];
  const players: Record<string, string> = {};
  for (const [id, h] of [...honours].sort((a, b) => (a[0] < b[0] ? -1 : 1)))
    players[id] = [...h]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([code, s]) => `${code === 'Finals MVP' ? 'FMVP' : code}:${seasonRuns([...s])}`)
      .join(';');
  const out: HistoryData = { through: SEED_SEASON - 1, honoursFrom: FIRST_SEASON, finals, mvps: allMvps, players };
  const json = JSON.stringify(out);
  writeFileSync(HISTORY_OUT, json);
  const finalsSince = finals.filter((f) => f[0] > 1996);
  console.log(`Finals ${finals[0][0]}-${last}: ${finalsSince.map((f) => `${f[0]} ${f[1]} ${f[3]}-${f[4]} ${f[2]} (${f[5] || '?'})`).join('; ')}`);
  console.log(`MVPs ${allMvps.length}, last ${allMvps.at(-1)!.join(' ')}; honours for ${Object.keys(players).length} players, ${new Set(rings).size} with a ring`);
  console.log(`wrote ${HISTORY_OUT} (${(json.length / 1e3).toFixed(1)} kB)`);
}

applyCareers();
await writeHistory();
await writeRecords();
