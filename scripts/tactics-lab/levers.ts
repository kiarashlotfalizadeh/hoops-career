// Part 1, the levers: every tactical setting as a patch on side A against side A's own settings, in
// six real matchups with paired seeds (the same games for the base and the patched runs). For each
// setting: the net change per 100 possessions (the mean of the six paired deltas) with its standard
// error, how many of the six are positive, the matchups where it changed no game at all (inert), and
// what it moved for side A and its opponent (possessions, shot profile, turnovers, the glass, eFG and
// the play-type shares), all read from the lab's summaries.
// Usage: npx tsx scripts/tactics-lab/levers.ts <label> [--quick] [--games N] [--workers N]
import { pairedDelta, type LabSummary, type TacticsPatch } from '../../src/core/ai/lab';
import {
  ABBR,
  isMain,
  labLeague,
  mean,
  parseArgs,
  patchProblem,
  patchSchema,
  progress,
  round,
  runMeta,
  seOfMean,
  tacticsSnapshot,
  writeJson,
  type LabArgs,
  type RunMeta,
} from './common';
import { runJobs, type LabJob, type Pool } from './pool';

/** Side A, side B (tids in the lab league). */
export const MATCHUPS: [number, number][] = [
  [5, 9],
  [13, 22],
  [0, 1],
  [27, 3],
  [7, 20],
  [19, 16],
];
/** Each matchup's games are drawn from its own fixed seed, the same for the base and every setting. */
export const matchupSeed = (a: number) => 4242 + a;

export interface Setting {
  name: string;
  /** Whose play it changes first: the offense's settings (side A's play types) or the defense's (the opponent's). */
  side: 'off' | 'def';
  patch: Record<string, unknown>;
}

const o = (offense: Record<string, unknown>) => ({ offense });
const d = (defense: Record<string, unknown>) => ({ defense });

export const SETTINGS: Setting[] = [
  ...(['pace', 'transition', 'threePoint', 'rimAttack', 'crashBoards'] as const).flatMap((k) =>
    [0, 100].map((v): Setting => ({ name: `${k} ${v}`, side: 'off', patch: o({ [k]: v }) })),
  ),
  ...[0, 100].map((v): Setting => ({ name: `getBack ${v}`, side: 'def', patch: d({ getBack: v }) })),
  ...(['iso', 'post', 'pnr', 'handoff', 'motion'] as const).flatMap((k) => [0, 100].map((v): Setting => ({ name: `${k} ${v}`, side: 'off', patch: o({ actions: { [k]: v } }) }))),
  ...(['help', 'pressure', 'physicality'] as const).flatMap((k) => [0, 100].map((v): Setting => ({ name: `${k} ${v}`, side: 'def', patch: d({ [k]: v }) }))),
  { name: 'press afterMade', side: 'def', patch: d({ press: 'afterMade' }) },
  { name: 'press always', side: 'def', patch: d({ press: 'always' }) },
  { name: 'mentality -2', side: 'off', patch: { mentality: -2 } },
  { name: 'mentality +2', side: 'off', patch: { mentality: 2 } },
  ...(['drop', 'hedge', 'ice', 'blitz'] as const).map((c): Setting => ({ name: c, side: 'def', patch: d({ pnr: c, switchOffBall: false }) })),
  { name: 'switch', side: 'def', patch: d({ pnr: 'switch', switchOffBall: true }) },
  ...(['zone23', 'zone32', 'box1', 'tri2'] as const).map((s): Setting => ({ name: s, side: 'def', patch: d({ scheme: s }) })),
  { name: 'starPlan double', side: 'def', patch: d({ starPlan: 'double' }) },
  { name: 'switchOffBall true', side: 'def', patch: d({ switchOffBall: true }) },
  { name: 'huntMismatch true', side: 'off', patch: o({ huntMismatch: true }) },
  ...(['fiveOut', 'horns', 'twoIn'] as const).map((s): Setting => ({ name: `shape ${s}`, side: 'off', patch: o({ shape: s }) })),
];

/** One side's numbers in a lab run: possessions a game, shot profile, turnovers, the glass, eFG, play-type shares. */
export interface SideStats {
  poss: number;
  threeRate: number;
  rimRate: number;
  ftRate: number;
  tov: number;
  orb: number;
  efg: number;
  playTypes: Record<string, number>;
}

export const STAT_KEYS = ['poss', 'threeRate', 'rimRate', 'ftRate', 'tov', 'orb', 'efg'] as const;

export function sideStats(r: LabSummary, opp: boolean): SideStats {
  const s = opp ? r.oppShot : r.shot;
  const pts = opp ? r.ptsAgainst : r.ptsFor;
  const rtg = opp ? r.drtg : r.ortg;
  const pt = opp ? r.oppPlayTypes : r.playTypes;
  return {
    poss: rtg ? (pts / rtg) * 100 : r.pace,
    threeRate: s.threeRate,
    rimRate: s.rimRate,
    ftRate: s.ftRate,
    tov: s.tov,
    orb: s.orb,
    efg: s.efg,
    playTypes: Object.fromEntries(Object.entries(pt).map(([k, v]) => [k, v.freq])),
  };
}

function statDelta(base: SideStats, alt: SideStats): SideStats {
  const kinds = new Set([...Object.keys(base.playTypes), ...Object.keys(alt.playTypes)]);
  return {
    poss: alt.poss - base.poss,
    threeRate: alt.threeRate - base.threeRate,
    rimRate: alt.rimRate - base.rimRate,
    ftRate: alt.ftRate - base.ftRate,
    tov: alt.tov - base.tov,
    orb: alt.orb - base.orb,
    efg: alt.efg - base.efg,
    playTypes: Object.fromEntries([...kinds].map((k) => [k, (alt.playTypes[k] ?? 0) - (base.playTypes[k] ?? 0)])),
  };
}

function statMean(xs: SideStats[], digits = 4): SideStats {
  const kinds = new Set(xs.flatMap((x) => Object.keys(x.playTypes)));
  const out = Object.fromEntries(STAT_KEYS.map((k) => [k, round(mean(xs.map((x) => x[k])), digits)])) as Omit<SideStats, 'playTypes'>;
  return { ...out, playTypes: Object.fromEntries([...kinds].map((k) => [k, round(mean(xs.map((x) => x.playTypes[k] ?? 0)), digits)])) };
}

export interface LeverRow {
  name: string;
  side: 'off' | 'def';
  patch: Record<string, unknown>;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  net?: number;
  se?: number;
  positive?: number;
  /** Matchups (A-B) where the patched games were exactly the base games: the setting changed nothing there. */
  inert?: string[];
  perMatchup?: { a: string; b: string; delta: number; se: number; inert: boolean }[];
  /** Mean change against the base, side A's numbers and its opponent's. */
  own?: SideStats;
  opp?: SideStats;
}

export interface LeversOut {
  meta: RunMeta;
  params: { games: number; matchups: { a: string; b: string; seed: number }[]; settings: number; schema: boolean; quick: boolean };
  /** The six base runs averaged: side A's numbers and the opponent's, and side A's net rating. */
  base: { net: number; pace: number; own: SideStats; opp: SideStats; perMatchup: { a: string; b: string; net: number; netSE: number; pace: number }[] };
  sides: ReturnType<typeof tacticsSnapshot>[];
  rows: LeverRow[];
}

export async function runLevers(args: LabArgs, pool?: Pool): Promise<LeversOut> {
  const t0 = performance.now();
  const started = new Date();
  const games = args.games ?? (args.quick ? 40 : 200);
  const L = labLeague();
  const schema = patchSchema();
  const label = (tid: number) => L.teams[tid]?.abbrev ?? ABBR[tid];
  const rows: LeverRow[] = SETTINGS.map((s) => {
    const why = patchProblem(schema, s.patch);
    return { name: s.name, side: s.side, patch: s.patch, status: why ? 'skipped' : 'ok', ...(why ? { reason: why } : {}) };
  });
  const live = rows.filter((r) => r.status === 'ok');
  const jobs: LabJob[] = [
    ...MATCHUPS.map(([a, b]): LabJob => ({ a, b, games, seed: matchupSeed(a) })),
    ...live.flatMap((r) => MATCHUPS.map(([a, b]): LabJob => ({ a, b, games, seed: matchupSeed(a), patch: r.patch as TacticsPatch }))),
  ];
  console.log(`[levers] ${live.length} settings (${rows.length - live.length} skipped) x ${MATCHUPS.length} matchups x ${games} games = ${jobs.length * games} games`);
  const results = await runJobs(jobs, { pool, workers: args.workers, onDone: progress('levers', jobs.length, t0) });
  const base = results.slice(0, MATCHUPS.length).map((r, i) => {
    if (r instanceof Error) throw new Error(`levers: the base run of ${label(MATCHUPS[i][0])}-${label(MATCHUPS[i][1])} failed: ${r.message}`);
    return r;
  });
  live.forEach((row, si) => {
    const rs = results.slice(MATCHUPS.length * (si + 1), MATCHUPS.length * (si + 2));
    const err = rs.find((r): r is Error => r instanceof Error);
    if (err) {
      row.status = 'error';
      row.reason = err.message.split('\n')[0];
      return;
    }
    const ok = rs as LabSummary[];
    const deltas = ok.map((r, i) => pairedDelta(base[i], r));
    const inert = ok.map((r, i) => r.margins.length === base[i].margins.length && r.margins.every((m, g) => m === base[i].margins[g]) && r.pace === base[i].pace);
    row.net = round(mean(deltas.map((x) => x.delta)));
    row.se = round(seOfMean(deltas.map((x) => x.se)));
    row.positive = deltas.filter((x) => x.delta > 0).length;
    row.inert = MATCHUPS.filter((_, i) => inert[i]).map(([a, b]) => `${label(a)}-${label(b)}`);
    row.perMatchup = MATCHUPS.map(([a, b], i) => ({ a: label(a), b: label(b), delta: round(deltas[i].delta), se: round(deltas[i].se), inert: inert[i] }));
    row.own = statMean(ok.map((r, i) => statDelta(sideStats(base[i], false), sideStats(r, false))));
    row.opp = statMean(ok.map((r, i) => statDelta(sideStats(base[i], true), sideStats(r, true))));
  });
  const out: LeversOut = {
    meta: runMeta(args.label, t0, started),
    params: { games, matchups: MATCHUPS.map(([a, b]) => ({ a: label(a), b: label(b), seed: matchupSeed(a) })), settings: SETTINGS.length, schema: !!schema, quick: args.quick },
    base: {
      net: round(mean(base.map((r) => r.net))),
      pace: round(mean(base.map((r) => r.pace))),
      own: statMean(base.map((r) => sideStats(r, false))),
      opp: statMean(base.map((r) => sideStats(r, true))),
      perMatchup: MATCHUPS.map(([a, b], i) => ({ a: label(a), b: label(b), net: round(base[i].net), netSE: round(base[i].netSE), pace: round(base[i].pace, 2) })),
    },
    sides: [...new Set(MATCHUPS.flat())].map((tid) => tacticsSnapshot(L, tid)),
    rows,
  };
  writeJson(args.label, 'levers.json', out);
  console.log(`[levers] done in ${out.meta.seconds}s`);
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  await runLevers(args);
  const { writeSummary } = await import('./summary');
  writeSummary(args.label);
}
