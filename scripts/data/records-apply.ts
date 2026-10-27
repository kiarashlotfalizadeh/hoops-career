// The record book's past (src/data/records.json, see src/core/league/records.ts seedRecords): the
// best single games since 1996-97, read from the game files' box scores (every NBA game since then,
// data/raw/games), for the league and for each franchise, the regular season's and the postseason's,
// as many as the book keeps (its KEEP). A real league starts its book with them, so its first 60-point
// night is measured against Kobe Bryant's 81, and a Bulls record against the Bulls' since 1996-97.
// The marks before the files (Wilt Chamberlain's 100, the 72-10 Bulls) are a small table of public
// facts in records.ts (ALL_TIME), not here.
//
// Players go by NBA.com person id (the seed's nbaId), with their names beside, teams by today's
// franchise code (the SuperSonics' are the Thunder's, as the game files' team ids have them).
// Nothing is fetched. Usage: npx tsx scripts/data/records-apply.ts (also run by npm run data:history).
import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { splitCsv } from './nba/csv';
import { BOX_FILE, GAMES_RAW, gameOf, type GamePart } from './games/sources';
import { teamByName } from './extra/teams';
import { SEED_SEASON } from './sources';
import { BBREF_TO_TID, FRANCHISES } from '../../src/core/teams';
import { KEEP, REC_STATS, TEAM_REC_STATS, type RecStat, type TeamRecStat } from '../../src/core/league/records';
import type { RecordsData, SeedMarkRow, SeedShelf, SeedTeamRow } from '../../src/core/league/records';

const RECORDS_OUT = process.env.HC_RECORDS_OUT ?? join(process.cwd(), 'src', 'data', 'records.json');

/** A row while lists are built: its number, then what breaks a tie (the earlier night keeps it). */
interface Cand<R> {
  v: number;
  date: number;
  gid: number;
  who: number;
  row: R;
}

/** A list kept best first, at most `keep` long once finished; until then ties at its foot are kept too, so the earliest of them stays. */
class Top<R> {
  items: Cand<R>[] = [];
  constructor(private keep: number) {}
  floor(): number {
    return this.items.length >= this.keep ? this.items[this.keep - 1].v : 0;
  }
  add(c: Cand<R>) {
    if (c.v <= 0 || c.v < this.floor()) return;
    this.items.push(c);
    this.items.sort(order);
    if (this.items.length > this.keep * 3) {
      const f = this.items[this.keep - 1].v;
      this.items = this.items.filter((x) => x.v >= f);
    }
  }
  done(): R[] {
    return [...this.items]
      .sort(order)
      .slice(0, this.keep)
      .map((x) => x.row);
  }
}
const order = <R>(a: Cand<R>, b: Cand<R>) => b.v - a.v || a.date - b.date || a.gid - b.gid || a.who - b.who;

type Lists = { players: Record<RecStat, Top<SeedMarkRow>>; teams: Record<TeamRecStat, Top<SeedTeamRow>> };
const lists = (keep: number): Lists => ({
  players: Object.fromEntries(REC_STATS.map((s) => [s, new Top<SeedMarkRow>(keep)])) as Lists['players'],
  teams: Object.fromEntries(TEAM_REC_STATS.map((s) => [s, new Top<SeedTeamRow>(keep)])) as Lists['teams'],
});
const shelfOf = (l: Lists): SeedShelf => ({
  players: Object.fromEntries(REC_STATS.map((s) => [s, l.players[s].done()]).filter(([, r]) => r.length)),
  teams: Object.fromEntries(TEAM_REC_STATS.map((s) => [s, l.teams[s].done()]).filter(([, r]) => r.length)),
});

/** The files' old team names (on rows that carry no team id) to today's franchise code. */
const OLD_NAMES: Record<string, string> = {
  'Seattle SuperSonics': 'OKC',
  'New Jersey Nets': 'BKN',
  'Vancouver Grizzlies': 'MEM',
  'Washington Bullets': 'WAS',
  'New Orleans Hornets': 'NOP',
  'New Orleans/Oklahoma City Hornets': 'NOP',
  'Charlotte Bobcats': 'CHA',
};

/** A team's side of a game, added up from its players' lines. */
interface Side {
  gid: number;
  season: number;
  part: GamePart;
  date: number;
  code: string;
  opp: string;
  pts: number;
  tpm: number;
}

/** Read the box scores a row at a time. */
async function eachRow(file: string, fn: (get: (col: string) => string) => void) {
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
    fn((k) => c[at[k]] ?? '');
  }
}

export async function writeRecords() {
  const file = join(GAMES_RAW, BOX_FILE);
  if (!existsSync(file)) {
    console.error(`Missing ${file}: the record book's past comes from it.`);
    process.exit(1);
  }
  // today's franchise code for a team in the files: by its id (ids stay with a franchise when it moves), else its name
  const idName = new Map<number, [date: number, name: string]>();
  await eachRow(file, (get) => {
    const id = Number(get('playerteamId')) || 0;
    const date = Number(get('gameDateTimeEst').slice(0, 10).replace(/-/g, '')) || 0;
    const name = `${get('playerteamCity')} ${get('playerteamName')}`.trim();
    if (id && name && date >= (idName.get(id)?.[0] ?? 0)) idName.set(id, [date, name]);
  });
  const abbrevOf = (bbref: string | undefined) => (bbref && BBREF_TO_TID[bbref] !== undefined ? FRANCHISES[BBREF_TO_TID[bbref]].abbrev : undefined);
  const byId = new Map([...idName].map(([id, [, name]]) => [id, abbrevOf(teamByName(name))]));
  const unknown = new Set<string>();
  const codeOf = (id: number, name: string) => {
    const code = (id ? byId.get(id) : undefined) ?? abbrevOf(teamByName(name)) ?? OLD_NAMES[name];
    if (!code) unknown.add(name || String(id));
    return code;
  };

  const book = { reg: lists(KEEP.league.reg), post: lists(KEEP.league.post) };
  const franchises = new Map<string, { reg: Lists; post: Lists }>();
  const franchise = (code: string) => {
    if (!franchises.has(code)) franchises.set(code, { reg: lists(KEEP.team.reg), post: lists(KEEP.team.post) });
    return franchises.get(code)!;
  };
  const names = new Map<number, string>();
  const sides = new Map<string, Side>();
  let games = 0;
  await eachRow(file, (get) => {
    const n = (k: string) => Number(get(k)) || 0;
    const g = gameOf(get('gameId'));
    // (the regular season and postseason before the league's first: its own games are its book's)
    if (!g || g.season >= SEED_SEASON) return;
    const gid = Number(get('gameId'));
    const date = Number(get('gameDateTimeEst').slice(0, 10).replace(/-/g, '')) || 0;
    const code = codeOf(n('playerteamId'), `${get('playerteamCity')} ${get('playerteamName')}`.trim());
    const opp = codeOf(n('opponentteamId'), `${get('opponentteamCity')} ${get('opponentteamName')}`.trim());
    if (!code || !opp) return;
    const key = `${gid}|${code}`;
    let side = sides.get(key);
    if (!side) {
      side = { gid, season: g.season, part: g.part, date, code, opp, pts: 0, tpm: 0 };
      sides.set(key, side);
      games++;
    }
    side.pts += n('points');
    side.tpm += n('threePointersMade');
    // (a night counts for a player who played, as the book counts one: a line with no minutes is a DNP)
    const pid = n('personId');
    if (!pid || !get('numMinutes')) return;
    names.set(pid, `${get('firstName')} ${get('lastName')}`.trim());
    const nums: Record<RecStat, number> = {
      pts: n('points'),
      reb: n('reboundsTotal') || n('reboundsOffensive') + n('reboundsDefensive'),
      ast: n('assists'),
      stl: n('steals'),
      blk: n('blocks'),
      tpm: n('threePointersMade'),
    };
    for (const stat of REC_STATS) {
      const v = nums[stat];
      if (v <= 0) continue;
      const cand = { v, date, gid, who: pid, row: [v, pid, code, opp, g.season, date, gid] as SeedMarkRow };
      book[g.part].players[stat].add(cand);
      franchise(code)[g.part].players[stat].add(cand);
    }
  });
  if (unknown.size) throw new Error(`The game files name teams no franchise is called: ${[...unknown].join(', ')}`);
  for (const s of sides.values()) {
    const them = sides.get(`${s.gid}|${s.opp}`);
    if (!them) continue;
    const nums: Record<TeamRecStat, number> = { pts: s.pts, margin: s.pts - them.pts, tpm: s.tpm };
    for (const stat of TEAM_REC_STATS) {
      const v = nums[stat];
      if (v <= 0) continue;
      const cand = { v, date: s.date, gid: s.gid, who: 0, row: [v, s.code, s.opp, s.season, s.date, s.gid, s.pts, them.pts] as SeedTeamRow };
      book[s.part].teams[stat].add(cand);
      franchise(s.code)[s.part].teams[stat].add(cand);
    }
  }
  const out: RecordsData = {
    from: Math.min(...[...sides.values()].map((s) => s.season)),
    through: SEED_SEASON - 1,
    league: { reg: shelfOf(book.reg), post: shelfOf(book.post) },
    teams: Object.fromEntries([...franchises].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([code, f]) => [code, { reg: shelfOf(f.reg), post: shelfOf(f.post) }])),
    names: {},
  };
  // the names of the players on the lists only
  const listed = new Set<number>();
  const shelves = [out.league.reg, out.league.post, ...Object.values(out.teams).flatMap((t) => [t.reg, t.post])];
  for (const sh of shelves) for (const l of Object.values(sh.players)) for (const r of l ?? []) listed.add(r[1]);
  out.names = Object.fromEntries([...listed].sort((a, b) => a - b).map((pid) => [pid, names.get(pid) ?? '']));
  const json = JSON.stringify(out);
  writeFileSync(RECORDS_OUT, json);
  const top = (sh: SeedShelf, stat: RecStat) => {
    const r = sh.players[stat]?.[0];
    return r ? `${stat} ${r[0]} ${out.names[r[1]]} (${r[2]} ${r[4]})` : `${stat} -`;
  };
  const topTeam = (sh: SeedShelf, stat: TeamRecStat) => {
    const r = sh.teams[stat]?.[0];
    return r ? `team ${stat} ${r[0]} ${r[1]} ${r[6]}-${r[7]} (${r[3]})` : `team ${stat} -`;
  };
  for (const part of ['reg', 'post'] as const)
    console.log(`${part}: ${[...REC_STATS.map((s) => top(out.league[part], s)), ...TEAM_REC_STATS.map((s) => topTeam(out.league[part], s))].join('; ')}`);
  console.log(`${games.toLocaleString('en-US')} team games ${out.from}-${out.through}, ${Object.keys(out.teams).length} franchises, ${listed.size} players named`);
  console.log(`wrote ${RECORDS_OUT} (${(json.length / 1e3).toFixed(1)} kB)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await writeRecords();
