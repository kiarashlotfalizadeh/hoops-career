// The play-by-play of every game since 1996-97 (data/raw/games/PlayByPlay.parquet). It comes in two
// forms: from 2019-20 NBA.com's cdn.nba.com log (possessions, in/out substitutions, shot descriptors,
// assist, block and steal ids), which nba/pbp.ts reads in full for the seasons the ratings and the
// impact estimate need (stints, shot creation, defense); before it NBA.com's older stats.nba.com log,
// read here, as the newer one is, for what every season on record needs: each player's shots by zone
// and the games he started.
//
// The file's rows are in no particular order, so one pass reads every row group, keeps the rows it
// needs in compact columns and then sorts them into games. What it finds is cached as JSON next to the
// file (keyed by the file's size and time), so a rebuild reads it in seconds.
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { asyncBufferFromFile, parquetMetadataAsync, parquetRead } from 'hyparquet';
import { compressors } from '../nba/college';
import { splitCsv } from '../nba/csv';
import { clockSecs, newSeason, processGame, shotZone, ZONES, type Row, type SeasonPbp, type Zone } from '../nba/pbp';
import { GAMES_RAW, PBP_FILES, gameOf, lineKey } from './sources';

/** The columns read (a CSV copy needs these headers). */
export const PBP_COLUMNS = [
  'gameId',
  'period',
  'clock',
  'actionType',
  'subType',
  'descriptor',
  'qualifiers',
  'personId',
  'playerNameI',
  'teamId',
  'playerteamId',
  'teamTricode',
  'possession',
  'scoreHome',
  'scoreAway',
  'shotResult',
  'shotValue',
  'area',
  'xLegacy',
  'yLegacy',
  'description',
  'assistPersonId',
  'blockPersonId',
  'stealPersonId',
  'foulDrawnPersonId',
  'orderNumber',
  'actionId',
] as const;
type Col = (typeof PBP_COLUMNS)[number];

/** Each line's shots by zone (attempts, makes) and games started, from the play-by-play. */
export interface LineShots {
  fga: Record<Zone, number>;
  fgm: Record<Zone, number>;
  /** Games he was on the floor for the opening tip. */
  gs: number;
}

export interface PbpData {
  /** The seasons read in full (nba/pbp.ts), by `${season}|${part}`. */
  full: Record<string, SeasonPbp>;
  /** Every line on record from `from` on, by lineKey. */
  lines: Record<string, LineShots>;
  /** Games whose opening fives were read whole (five a side), and all games. */
  starters: { whole: number; games: number };
}

/** Bump when what is read changes, so the caches are rebuilt. */
const CACHE_VERSION = 3;

export function pbpFile(dir = GAMES_RAW): string | null {
  for (const f of PBP_FILES) if (existsSync(join(dir, f))) return join(dir, f);
  return null;
}

/**
 * The play-by-play's shots and starts for every line from season `from` up to (not including)
 * `until`, and the seasons in `full` (regular season and postseason) read in full.
 */
export async function readPlayByPlay(full: number[], from: number, until: number, opts: { dir?: string; log?: (m: string) => void } = {}): Promise<PbpData> {
  const log = opts.log ?? console.log;
  const dir = opts.dir ?? GAMES_RAW;
  const file = pbpFile(dir);
  if (!file) throw new Error(`No play-by-play (${PBP_FILES.join(' or ')}) in ${dir}: put the game files there (see the README).`);
  const st = statSync(file);
  const key = `${CACHE_VERSION}:${from}:${until}:${st.size}:${st.mtimeMs}`;
  const cachePath = (name: string) => join(dir, `cache_${name}.json`);
  const load = <T>(name: string): T | null => {
    const f = cachePath(name);
    if (!existsSync(f)) return null;
    const c = JSON.parse(readFileSync(f, 'utf8')) as { key?: string; value: T };
    return c.key === key ? c.value : null;
  };
  const buckets = full.flatMap((s) => (['reg', 'post'] as const).map((part) => `${s}|${part}`));
  const out: PbpData = { full: {}, lines: {}, starters: { whole: 0, games: 0 } };
  const light = load<Pick<PbpData, 'lines' | 'starters'>>('pbp_lines');
  for (const b of buckets) {
    const v = load<SeasonPbp>(`pbp_${b.replace('|', '_')}`);
    if (v) out.full[b] = v;
  }
  const missing = buckets.filter((b) => !out.full[b]);
  if (light && !missing.length) return { ...out, ...light };

  const t0 = Date.now();
  const scan = new Scan(from, until, new Set(missing), !light);
  for await (const batch of file.endsWith('.parquet') ? parquetBatches(file, log) : csvBatches(file)) scan.batch(batch);
  log(`  play-by-play read in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${scan.rows.toLocaleString('en-US')} rows`);
  if (!light) {
    const lines = scan.shotLines();
    const starters = scan.starters(lines);
    writeFileSync(cachePath('pbp_lines'), JSON.stringify({ key, value: { lines, starters } }));
    out.lines = lines;
    out.starters = starters;
  } else Object.assign(out, light);
  for (const b of missing) {
    const s = scan.season(b);
    log(`  ${b.replace('|', ' ')}: ${s.games} games, ${Object.keys(s.players).length} players, ${s.stints.length} stints, ${s.lineupIssues} lineup repairs`);
    writeFileSync(cachePath(`pbp_${b.replace('|', '_')}`), JSON.stringify({ key, value: s }));
    out.full[b] = s;
  }
  return out;
}

/** A batch of rows as columns. */
interface Batch {
  n: number;
  col: (c: Col) => ArrayLike<unknown>;
}

async function* parquetBatches(path: string, log: (m: string) => void): AsyncGenerator<Batch> {
  const file = await asyncBufferFromFile(path);
  const metadata = await parquetMetadataAsync(file);
  let start = 0;
  const groups = metadata.row_groups.length;
  for (let g = 0; g < groups; g++) {
    const n = Number(metadata.row_groups[g].num_rows);
    const parts = new Map<string, { at: number; data: ArrayLike<unknown> }[]>();
    await parquetRead({
      file,
      metadata,
      compressors,
      columns: [...PBP_COLUMNS],
      rowStart: start,
      rowEnd: start + n,
      onChunk: (c) => {
        const list = parts.get(c.columnName) ?? [];
        list.push({ at: c.rowStart, data: c.columnData });
        parts.set(c.columnName, list);
      },
    });
    const cols = new Map<string, ArrayLike<unknown>>();
    for (const [name, list] of parts) {
      list.sort((a, b) => a.at - b.at);
      cols.set(name, list.length === 1 ? list[0].data : list.flatMap((p) => Array.from(p.data)));
    }
    yield { n, col: (c) => cols.get(c) ?? [] };
    start += n;
    if ((g + 1) % 100 === 0) log(`  play-by-play: ${g + 1} of ${groups} row groups`);
  }
}

async function* csvBatches(path: string): AsyncGenerator<Batch> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  let rows: string[][] = [];
  const flush = (): Batch => {
    const cur = rows;
    const at = idx!;
    rows = [];
    return { n: cur.length, col: (c) => cur.map((r) => r[at[c]] ?? '') };
  };
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsv(line);
    if (!idx) {
      idx = Object.fromEntries(cells.map((h, i) => [h, i]));
      continue;
    }
    rows.push(cells);
    if (rows.length >= 50_000) yield flush();
  }
  if (idx && rows.length) yield flush();
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const present = (v: unknown) => v !== null && v !== undefined && v !== '';
/** A team's id where a person's would be (team rebounds, team turnovers). */
const isTeam = (id: number) => id > 1e9;

const SHOT_V3 = new Set(['2pt', '3pt']);
const SHOT_OLD = new Set(['Made Shot', 'Missed Shot']);
/** What an opening-quarter row says: a player on the floor (an event, or a substitution taking him off), one coming on, or an old-form substitution (the one going off, by id; the one coming on, by name). */
const Kind = { Event: 0, Out: 1, In: 2, OldSub: 3 } as const;

/** A growing column of 32-bit numbers. */
class Grow {
  a: Int32Array | Float32Array;
  constructor(private float = false) {
    this.a = float ? new Float32Array(1024) : new Int32Array(1024);
  }
  set(i: number, v: number) {
    if (i >= this.a.length) {
      const b = this.float ? new Float32Array(this.a.length * 2) : new Int32Array(this.a.length * 2);
      b.set(this.a);
      this.a = b;
    }
    this.a[i] = v;
  }
}

/** Strings stored once, as numbers. */
class Strings {
  private map = new Map<string, number>();
  list: string[] = [];
  id(s: string) {
    let i = this.map.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.map.set(s, i);
      this.list.push(s);
    }
    return i;
  }
}

const FULL_COLS = [
  'game',
  'order',
  'period',
  'clock',
  'type',
  'sub',
  'desc',
  'qual',
  'pid',
  'team',
  'tri',
  'poss',
  'sh',
  'sa',
  'area',
  'x',
  'y',
  'three',
  'made',
  'ast',
  'blk',
  'stl',
  'drawn',
  'nameI',
] as const;
type FullCol = (typeof FULL_COLS)[number];

class Scan {
  rows = 0;
  private strings = new Strings();
  private zones = new Map<string, { fga: Record<Zone, number>; fgm: Record<Zone, number> }>();
  // opening-quarter rows of every game, for its starters
  private p1 = { n: 0, game: new Grow(), order: new Grow(), pid: new Grow(), p2: new Grow(), team: new Grow(), kind: new Grow(), name: new Grow() };
  private full = new Map<string, { n: number; c: Record<FullCol, Grow> }>();
  /** Each team id's tricode, for the rows that leave it out. */
  private tricodes = new Map<number, string>();

  constructor(
    private from: number,
    private until: number,
    private fullBuckets: Set<string>,
    private light: boolean,
  ) {}

  batch(b: Batch) {
    const c = Object.fromEntries(PBP_COLUMNS.map((k) => [k, b.col(k)])) as Record<Col, ArrayLike<unknown>>;
    for (let i = 0; i < b.n; i++) {
      this.rows++;
      const gameId = num(c.gameId[i]);
      const g = gameOf(gameId);
      if (!g || g.season < this.from || g.season >= this.until) continue;
      const v3 = present(c.orderNumber[i]);
      const type = str(c.actionType[i]).trim();
      const pid = num(c.personId[i]);
      // (some rows name the player's team only as his own: 2025-26's playoffs after each series' first game)
      const team = num(c.teamId[i]) || num(c.playerteamId[i]);
      const tri = str(c.teamTricode[i]);
      if (tri && team) this.tricodes.set(team, tri);
      const desc = str(c.description[i]);
      const three = v3 ? type === '3pt' : num(c.shotValue[i]) === 3 || /3PT/.test(desc);
      const x = num(c.xLegacy[i]);
      const y = num(c.yLegacy[i]);
      const made = str(c.shotResult[i]) === 'Made';
      const order = v3 ? num(c.orderNumber[i]) : num(c.actionId[i]);
      if (this.light) {
        if ((v3 ? SHOT_V3 : SHOT_OLD).has(type) && pid && team && !isTeam(pid)) {
          const k = lineKey(pid, g.season, team, g.part);
          let e = this.zones.get(k);
          if (!e) this.zones.set(k, (e = { fga: zz(), fgm: zz() }));
          const z = shotZone(str(c.area[i]), x, y, three);
          e.fga[z]++;
          if (made) e.fgm[z]++;
        }
        if (num(c.period[i]) === 1) this.opening(i, c, gameId, order, type, pid, team, v3, desc);
      }
      const bucket = `${g.season}|${g.part}`;
      if (v3 && this.fullBuckets.has(bucket)) {
        let f = this.full.get(bucket);
        if (!f) this.full.set(bucket, (f = { n: 0, c: Object.fromEntries(FULL_COLS.map((k) => [k, new Grow(k === 'clock')])) as Record<FullCol, Grow> }));
        const j = f.n++;
        const s = (k: FullCol, v: number) => f!.c[k].set(j, v);
        s('game', gameId);
        s('order', order);
        s('period', num(c.period[i]));
        s('clock', clockSecs(str(c.clock[i])));
        s('type', this.strings.id(type));
        s('sub', this.strings.id(str(c.subType[i])));
        s('desc', this.strings.id(str(c.descriptor[i])));
        const q = c.qualifiers[i];
        s('qual', this.strings.id(Array.isArray(q) ? q.join(' ') : str(q)));
        s('pid', pid);
        s('team', team);
        s('tri', this.strings.id(tri));
        s('poss', num(c.possession[i]));
        // (a score missing from a row reads as the one before it)
        s('sh', present(c.scoreHome[i]) ? num(c.scoreHome[i]) : -1);
        s('sa', present(c.scoreAway[i]) ? num(c.scoreAway[i]) : -1);
        s('area', this.strings.id(str(c.area[i])));
        s('x', x);
        s('y', y);
        s('three', three ? 1 : 0);
        s('made', made ? 1 : 0);
        s('ast', num(c.assistPersonId[i]));
        s('blk', num(c.blockPersonId[i]));
        s('stl', num(c.stealPersonId[i]));
        s('drawn', num(c.foulDrawnPersonId[i]));
        s('nameI', this.strings.id(str(c.playerNameI[i])));
      }
    }
  }

  /** An opening-quarter row: who it shows on the floor, or who it sends on. */
  private opening(i: number, c: Record<Col, ArrayLike<unknown>>, game: number, order: number, type: string, pid: number, team: number, v3: boolean, desc: string) {
    const sub = str(c.subType[i]);
    const lower = type.toLowerCase();
    if (['timeout', 'period', 'game', 'ejection', 'instant replay', 'instantreplay', 'stoppage', 'memo'].includes(lower)) return;
    if (lower === 'foul' && (/technical/i.test(sub) || /T\.FOUL|Technical/i.test(desc))) return;
    let kind: number = Kind.Event;
    let name = 0;
    if (lower === 'substitution') {
      if (v3) kind = sub === 'in' ? Kind.In : Kind.Out;
      else {
        const m = /^SUB:\s*(.+?)\s+FOR\s+/.exec(desc);
        kind = Kind.OldSub;
        name = this.strings.id(m ? m[1] : '');
      }
    }
    const p2 = v3 ? num(c.assistPersonId[i]) || num(c.blockPersonId[i]) || num(c.stealPersonId[i]) || num(c.foulDrawnPersonId[i]) : 0;
    if ((!pid || isTeam(pid)) && !p2) return;
    const p = this.p1;
    const j = p.n++;
    p.game.set(j, game);
    p.order.set(j, order);
    p.pid.set(j, isTeam(pid) ? 0 : pid);
    p.p2.set(j, p2);
    p.team.set(j, isTeam(pid) ? 0 : team);
    p.kind.set(j, kind);
    // (the player's own name rides on his events, to read who an old-form substitution sends on)
    p.name.set(j, kind === Kind.OldSub ? name : this.strings.id(str(c.playerNameI[i])));
  }

  shotLines(): Record<string, LineShots> {
    const out: Record<string, LineShots> = {};
    for (const [k, e] of this.zones) out[k] = { ...e, gs: 0 };
    return out;
  }

  /** Each game's opening fives, counted into its lines' games started. */
  starters(lines: Record<string, LineShots>): PbpData['starters'] {
    const p = this.p1;
    const idx = Array.from({ length: p.n }, (_, i) => i).sort((a, b) => p.game.a[a] - p.game.a[b] || p.order.a[a] - p.order.a[b]);
    let whole = 0;
    let games = 0;
    for (let s = 0; s < idx.length;) {
      let e = s;
      while (e < idx.length && p.game.a[idx[e]] === p.game.a[idx[s]]) e++;
      const rows = idx.slice(s, e);
      s = e;
      const g = gameOf(p.game.a[rows[0]])!;
      const pteam = new Map<number, number>();
      const names = new Map<number, string>();
      for (const r of rows) {
        const pid = p.pid.a[r];
        if (!pid || !p.team.a[r]) continue;
        pteam.set(pid, p.team.a[r]);
        if (p.kind.a[r] !== Kind.OldSub) names.set(pid, this.strings.list[p.name.a[r]]);
      }
      const teams = [...new Set(pteam.values())];
      if (teams.length !== 2) continue;
      games++;
      const subbedIn = new Set<number>();
      const five = new Map<number, number[]>(teams.map((t) => [t, []]));
      const mark = (pid: number) => {
        const t = pteam.get(pid);
        if (!pid || t === undefined || subbedIn.has(pid)) return;
        const list = five.get(t)!;
        if (list.length < 5 && !list.includes(pid)) list.push(pid);
      };
      for (const r of rows) {
        const pid = p.pid.a[r];
        const kind = p.kind.a[r];
        if (kind === Kind.In) subbedIn.add(pid);
        else if (kind === Kind.OldSub) {
          mark(pid);
          const on = whoCameOn(this.strings.list[p.name.a[r]], pteam.get(pid), pteam, names);
          if (on) subbedIn.add(on);
        } else {
          mark(pid);
          mark(p.p2.a[r]);
        }
      }
      if ([...five.values()].every((l) => l.length === 5)) whole++;
      for (const [t, list] of five)
        for (const pid of list) {
          const k = lineKey(pid, g.season, t, g.part);
          (lines[k] ??= { fga: zz(), fgm: zz(), gs: 0 }).gs++;
        }
    }
    return { whole, games };
  }

  /** A season read in full, game by game, through nba/pbp.ts. */
  season(bucket: string): SeasonPbp {
    const out = newSeason(Number(bucket.split('|')[0]));
    const f = this.full.get(bucket);
    if (!f) return out;
    const c = Object.fromEntries(FULL_COLS.map((k) => [k, f.c[k].a])) as Record<FullCol, Int32Array | Float32Array>;
    const idx = Array.from({ length: f.n }, (_, i) => i).sort((a, b) => c.game[a] - c.game[b] || c.order[a] - c.order[b]);
    const S = this.strings.list;
    for (let s = 0; s < idx.length;) {
      let e = s;
      while (e < idx.length && c.game[idx[e]] === c.game[idx[s]]) e++;
      let sh = 0;
      let sa = 0;
      const rows: Row[] = idx.slice(s, e).map((i) => {
        if (c.sh[i] >= 0) sh = c.sh[i];
        if (c.sa[i] >= 0) sa = c.sa[i];
        return {
          order: c.order[i],
          period: c.period[i],
          clock: c.clock[i],
          type: S[c.type[i]],
          sub: S[c.sub[i]],
          desc: S[c.desc[i]],
          qual: S[c.qual[i]],
          pid: c.pid[i],
          team: c.team[i],
          tri: S[c.tri[i]] || this.tricodes.get(c.team[i]) || (c.team[i] ? String(c.team[i]) : ''),
          poss: c.poss[i],
          sh,
          sa,
          area: S[c.area[i]],
          x: c.x[i],
          y: c.y[i],
          three: c.three[i] === 1,
          made: c.made[i] === 1,
          ast: c.ast[i],
          blk: c.blk[i],
          stl: c.stl[i],
          drawn: c.drawn[i],
          nameI: S[c.nameI[i]],
        };
      });
      s = e;
      processGame(rows, out);
    }
    return out;
  }
}

const zz = (): Record<Zone, number> => Object.fromEntries(ZONES.map((z) => [z, 0])) as Record<Zone, number>;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.'’]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Who an old-form substitution sends on ("SUB: Moore FOR Afflalo" names him as the log does: his
 * surname, or initial and surname when a teammate shares it), among his team's players in the game.
 */
export function whoCameOn(token: string, team: number | undefined, pteam: Map<number, number>, names: Map<number, string>): number | undefined {
  if (!token || team === undefined) return undefined;
  const t = norm(token);
  const mates = [...names].filter(([pid]) => pteam.get(pid) === team);
  const full = mates.filter(([, n]) => norm(n) === t);
  if (full.length === 1) return full[0][0];
  const sur = mates.filter(([, n]) => norm(n).replace(/^\S+ /, '') === t);
  return sur.length === 1 ? sur[0][0] : undefined;
}
