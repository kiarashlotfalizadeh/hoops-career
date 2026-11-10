// Shared parts of the tactics lab: arguments, output paths, the lab league (scripts/tactic-sweep.ts's
// setup), statistics, the check of a patch against the engine's TacticsPatch type, and table helpers.
// Only stable public APIs: createLeague, defaultSettings, ensureRotation, teamPlayers, the lab's types.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { ensureRotation } from '../../src/core/league/games';
import { teamPlayers } from '../../src/core/league/helpers';
import type { LabSide } from '../../src/core/ai/lab';
import type { League } from '../../src/core/types';

export const LAB_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(LAB_DIR, '../..');
export const SEED_FILE = join(REPO, 'src/data/seed.json');

/** Franchise abbreviations by tid, for labels (the league's own abbrevs are used where a league is at hand). */
export const ABBR = [
  'ATL',
  'BOS',
  'BKN',
  'CHA',
  'CHI',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GSW',
  'HOU',
  'IND',
  'LAC',
  'LAL',
  'MEM',
  'MIA',
  'MIL',
  'MIN',
  'NOP',
  'NYK',
  'OKC',
  'ORL',
  'PHI',
  'PHX',
  'POR',
  'SAC',
  'SAS',
  'TOR',
  'UTA',
  'WAS',
];

// ------------------------------------------------------------------ arguments

export interface LabArgs {
  label: string;
  quick: boolean;
  /** Worker processes for the lab parts. */
  workers: number;
  /** Overrides: games per matchup (levers) or cell (coverage), seasons and games per team per sample (league). */
  games?: number;
  seasons?: number;
  perTeam?: number;
  /** The league part's league seed (default 307). */
  rngSeed?: number;
  /** Run the league part after the lab parts instead of beside them (run.ts). */
  serial: boolean;
  synergy?: string;
}

export function parseArgs(argv = process.argv.slice(2)): LabArgs {
  const num = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    const v = Number(argv[i + 1]);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${flag} needs a positive number (got "${argv[i + 1]}")`);
    return v;
  };
  const str = (flag: string) => {
    const i = argv.indexOf(flag);
    return i < 0 ? undefined : argv[i + 1];
  };
  const valued = new Set(['--workers', '--games', '--seasons', '--per-team', '--rng-seed', '--synergy']);
  const positional = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
  const label = positional[0];
  if (!label || !/^[\w.-]+$/.test(label))
    throw new Error(
      'Usage: npx tsx scripts/tactics-lab/<run|levers|coverage|league|summary>.ts <label> [--quick] [--workers N] [--games N] [--seasons K] [--per-team N] [--rng-seed N] [--serial] [--synergy path]',
    );
  return {
    label,
    quick: argv.includes('--quick'),
    workers: num('--workers') ?? 12,
    games: num('--games'),
    seasons: num('--seasons'),
    perTeam: num('--per-team'),
    rngSeed: num('--rng-seed'),
    serial: argv.includes('--serial'),
    synergy: str('--synergy'),
  };
}

/** The flags to hand a part run in a child process (run.ts), as given. */
export function argFlags(args: LabArgs): string[] {
  const out = [args.label];
  if (args.quick) out.push('--quick');
  out.push('--workers', String(args.workers));
  if (args.games) out.push('--games', String(args.games));
  if (args.seasons) out.push('--seasons', String(args.seasons));
  if (args.perTeam) out.push('--per-team', String(args.perTeam));
  if (args.rngSeed) out.push('--rng-seed', String(args.rngSeed));
  if (args.synergy) out.push('--synergy', args.synergy);
  return out;
}

/** True when the module at `url` is the script node was started with. */
export function isMain(url: string): boolean {
  return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url);
}

// ------------------------------------------------------------------ output

export function outDir(label: string): string {
  const dir = join(LAB_DIR, 'out', label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(label: string, name: string, data: unknown): string {
  const file = join(outDir(label), name);
  writeFileSync(file, JSON.stringify(data, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v), 1) + '\n');
  return file;
}

export function readJson<T>(label: string, name: string): T | null {
  const file = join(LAB_DIR, 'out', label, name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

export interface RunMeta {
  label: string;
  started: string;
  commit: string;
  /** Uncommitted changes under src/ when the run started (the engine measured isn't the commit's). */
  srcDirty: boolean;
  node: string;
  seconds: number;
}

export function runMeta(label: string, t0: number, started: Date): RunMeta {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  return {
    label,
    started: started.toISOString(),
    commit: git('git rev-parse --short HEAD') || 'unknown',
    srcDirty: git('git status --porcelain -- src') !== '',
    node: process.version,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
  };
}

// ------------------------------------------------------------------ the lab league

/** The 2026-27 league from the real seed on rngSeed 7, every rotation set (tactic-sweep.ts's setup). */
export function labLeague(): League {
  const L = createLeague({ name: 'Sweep', userTid: 0, coachName: 'C', settings: defaultSettings(), seed: JSON.parse(readFileSync(SEED_FILE, 'utf8')), rngSeed: 7 });
  for (const t of L.teams) ensureRotation(L, t.tid);
  return L;
}

/** A team as the lab plays it: its own tactics and rotation, its healthy players. */
export function labSide(L: League, tid: number): LabSide {
  return { team: { ...L.teams[tid], seasons: [] }, players: teamPlayers(L, tid).filter((p) => !p.injury) };
}

/** The settings a side plays by default, for the record (the lab's deltas are against them). */
export function tacticsSnapshot(L: League, tid: number) {
  const t = L.teams[tid].tactics as unknown as Record<string, unknown> & { offense: Record<string, unknown>; defense: Record<string, unknown> };
  const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
  return {
    tid,
    abbrev: L.teams[tid].abbrev,
    offPreset: t.offPreset,
    defPreset: t.defPreset,
    mentality: t.mentality ?? null,
    offense: pick(t.offense, ['pace', 'transition', 'threePoint', 'rimAttack', 'crashBoards', 'actions', 'huntMismatch', 'shape']),
    defense: pick(t.defense, ['scheme', 'pnr', 'help', 'pressure', 'press', 'getBack', 'switchOffBall', 'starPlan', 'physicality']),
  };
}

// ------------------------------------------------------------------ statistics

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}
export function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}
/** The standard error of a mean of independent estimates. */
export const seOfMean = (ses: number[]) => Math.sqrt(ses.reduce((a, s) => a + s * s, 0)) / Math.max(1, ses.length);
export const round = (x: number, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : NaN);

// ------------------------------------------------------------------ the patch check

/** What the engine's TacticsPatch type accepts at one key: nested keys, or values. */
export interface SchemaNode {
  props?: Record<string, SchemaNode>;
  str?: string[] | true;
  num?: number[] | true;
  bool?: true;
}

/**
 * The engine's TacticsPatch type, read with the TypeScript compiler from the lab's export, so a setting
 * whose key or value the engine no longer has can be skipped and said so. Null if it can't be read
 * (then every setting runs, and a setting that changes no game at all is reported as inert).
 */
export function patchSchema(): SchemaNode | null {
  try {
    const probe = join(LAB_DIR, '__patch_probe__.ts');
    const text = "import type { TacticsPatch } from '../../src/core/ai/lab';\nexport type Probe = TacticsPatch;\n";
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const readFile = host.readFile.bind(host);
    host.getSourceFile = (f, lang, ...rest) => (resolve(f) === probe ? ts.createSourceFile(f, text, lang) : getSourceFile(f, lang, ...rest));
    host.fileExists = (f) => resolve(f) === probe || fileExists(f);
    host.readFile = (f) => (resolve(f) === probe ? text : readFile(f));
    const program = ts.createProgram([probe], options, host);
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(probe);
    const alias = sf?.statements.find(ts.isTypeAliasDeclaration);
    if (!alias) return null;
    const describe = (type: ts.Type, depth: number): SchemaNode => {
      const node: SchemaNode = {};
      const t = checker.getNonNullableType(type);
      for (const m of t.isUnion() ? t.types : [t]) {
        if (m.flags & ts.TypeFlags.StringLiteral) {
          if (node.str !== true) node.str = [...(node.str ?? []), (m as ts.StringLiteralType).value];
        } else if (m.flags & ts.TypeFlags.String) node.str = true;
        else if (m.flags & ts.TypeFlags.NumberLiteral) {
          if (node.num !== true) node.num = [...(node.num ?? []), (m as ts.NumberLiteralType).value];
        } else if (m.flags & ts.TypeFlags.Number) node.num = true;
        else if (m.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Boolean)) node.bool = true;
        else if (m.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection) && depth < 3) {
          // (lists and functions are never patched one key at a time)
          const name = m.getSymbol()?.getName();
          if (name === 'Array' || name === 'ReadonlyArray' || m.getCallSignatures().length) continue;
          node.props ??= {};
          for (const p of checker.getPropertiesOfType(m)) node.props[p.name] = describe(checker.getTypeOfSymbolAtLocation(p, alias), depth + 1);
        }
      }
      return node;
    };
    const root = describe(checker.getTypeAtLocation(alias.name), 0);
    return root.props && Object.keys(root.props).length ? root : null;
  } catch {
    return null;
  }
}

/** Why the engine's patch type doesn't take this patch (a missing key, a value it doesn't have), or null if it does. */
export function patchProblem(schema: SchemaNode | null, patch: unknown, path = 'patch'): string | null {
  if (!schema) return null;
  if (patch !== null && typeof patch === 'object' && !Array.isArray(patch)) {
    if (!schema.props) return `${path} takes no settings`;
    for (const [k, v] of Object.entries(patch)) {
      const child = schema.props[k];
      if (!child) return `no key ${path}.${k}`;
      const p = patchProblem(child, v, `${path}.${k}`);
      if (p) return p;
    }
    return null;
  }
  if (typeof patch === 'string') return schema.str === true || schema.str?.includes(patch) ? null : `${path} has no value "${patch}"`;
  if (typeof patch === 'number') return schema.num === true || schema.num?.includes(patch) ? null : `${path} has no value ${patch}`;
  if (typeof patch === 'boolean') return schema.bool ? null : `${path} is not a switch`;
  return null;
}

// ------------------------------------------------------------------ formatting

export const sign = (x: number, d = 2) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(d)}` : 'n/a');
export const fix = (x: number | null | undefined, d = 2) => (x !== null && x !== undefined && Number.isFinite(x) ? x.toFixed(d) : 'n/a');
export const pct = (x: number | null | undefined, d = 1) => (x !== null && x !== undefined && Number.isFinite(x) ? (x * 100).toFixed(d) : 'n/a');

export function mdTable(head: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.map((c) => String(c)).join(' | ')} |`;
  return [line(head), line(head.map((_, i) => (i === 0 ? '---' : '---:'))), ...rows.map(line)].join('\n');
}

/** A progress line every tenth of the jobs (and at the end), with the time so far. */
export function progress(name: string, total: number, t0: number) {
  let done = 0;
  let next = Math.ceil(total / 10);
  return () => {
    done++;
    if (done >= next || done === total) {
      console.log(`[${name}] ${done}/${total} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
      next = done + Math.ceil(total / 10);
    }
  };
}
