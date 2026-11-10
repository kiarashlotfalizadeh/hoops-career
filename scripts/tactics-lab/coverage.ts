// Part 2, the defensive choices by opponent: three defenses (side A, patched) each play every choice
// against nine offenses, paired (each cell's games are the same for every choice). Reported per
// offense: each choice's net per 100 against drop coverage, from the defense's side, averaged over the
// three defenses with its standard error, and the overall average per choice. A man-to-man coverage
// is played in man: should a defense's own scheme be a zone, the coverages add scheme 'man' (noted
// in the output as manGuard).
// Usage: npx tsx scripts/tactics-lab/coverage.ts <label> [--quick] [--games N] [--workers N]
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

export const DEFENSES = [4, 15, 25]; // CHI, MIA, SAC
export const OFFENSES = [9, 20, 13, 19, 29, 11, 14, 1, 5]; // GSW, OKC, LAL, NYK, WAS, IND, MEM, BOS, CLE
/** Each cell's fixed seed, the same for every choice. */
export const cellSeed = (def: number, off: number) => 7700 + off * 31 + def;

export const CHOICES: { name: string; patch: Record<string, unknown>; man: boolean }[] = [
  ...(['drop', 'hedge', 'ice', 'blitz'] as const).map((c) => ({ name: c, patch: { defense: { pnr: c, switchOffBall: false } }, man: true })),
  { name: 'switch', patch: { defense: { pnr: 'switch', switchOffBall: true } }, man: true },
  ...(['zone23', 'box1', 'tri2'] as const).map((s) => ({ name: s, patch: { defense: { scheme: s } }, man: false })),
];

interface Cell {
  def: string;
  off: string;
  seed: number;
  manGuard: boolean;
  /** Each choice against drop (the defense's net per 100), and the offense's numbers under it. */
  choices: Record<string, { net: number; se: number; oppPPP: number; oppEfg: number; oppThreeRate: number; oppTov: number; oppPnrBH: number | null }>;
}

export interface CoverageOut {
  meta: RunMeta;
  params: { games: number; defenses: string[]; offenses: string[]; choices: string[]; skipped: { name: string; reason: string }[]; quick: boolean };
  defenses: ReturnType<typeof tacticsSnapshot>[];
  cells: Cell[];
  /** Per offense: each choice's net against drop averaged over the defenses, with its standard error. */
  byOffense: { off: string; choices: Record<string, { net: number; se: number; positive: number }> }[];
  /** Over every cell. */
  overall: Record<string, { net: number; se: number; positive: number; cells: number }>;
  errors: string[];
}

export async function runCoverage(args: LabArgs, pool?: Pool): Promise<CoverageOut> {
  const t0 = performance.now();
  const started = new Date();
  const games = args.games ?? (args.quick ? 50 : 250);
  const L = labLeague();
  const schema = patchSchema();
  const label = (tid: number) => L.teams[tid]?.abbrev ?? ABBR[tid];
  const skipped = CHOICES.map((c) => ({ name: c.name, reason: patchProblem(schema, c.patch) })).filter((c): c is { name: string; reason: string } => !!c.reason);
  if (skipped.some((s) => s.name === 'drop')) throw new Error(`coverage: drop, the baseline, can't be played on this engine (${skipped.find((s) => s.name === 'drop')!.reason})`);
  const choices = CHOICES.filter((c) => !skipped.some((s) => s.name === c.name));
  /** A coverage is played in man-to-man: a defense whose own scheme is a zone gets scheme 'man' with it. */
  const guard = (def: number) => {
    const scheme = (L.teams[def].tactics.defense as unknown as Record<string, unknown>).scheme;
    return typeof scheme === 'string' && scheme !== 'man';
  };
  const patchFor = (def: number, c: (typeof CHOICES)[number]): TacticsPatch =>
    (c.man && guard(def) ? { ...c.patch, defense: { ...(c.patch.defense as object), scheme: 'man' } } : c.patch) as TacticsPatch;
  const cells = DEFENSES.flatMap((def) => OFFENSES.map((off) => ({ def, off })));
  const jobs: LabJob[] = cells.flatMap(({ def, off }) => choices.map((c): LabJob => ({ a: def, b: off, games, seed: cellSeed(def, off), patch: patchFor(def, c) })));
  console.log(`[coverage] ${choices.length} choices x ${DEFENSES.length} defenses x ${OFFENSES.length} offenses x ${games} games = ${jobs.length * games} games`);
  const results = await runJobs(jobs, { pool, workers: args.workers, onDone: progress('coverage', jobs.length, t0) });
  const errors: string[] = [];
  const outCells: Cell[] = cells.map(({ def, off }, ci) => {
    const rs = results.slice(ci * choices.length, (ci + 1) * choices.length);
    const cell: Cell = { def: label(def), off: label(off), seed: cellSeed(def, off), manGuard: guard(def), choices: {} };
    const drop = rs[0];
    if (drop instanceof Error) {
      errors.push(`${cell.def} vs ${cell.off} drop: ${drop.message.split('\n')[0]}`);
      return cell;
    }
    choices.forEach((c, i) => {
      const r = rs[i];
      if (r instanceof Error) {
        errors.push(`${cell.def} vs ${cell.off} ${c.name}: ${r.message.split('\n')[0]}`);
        return;
      }
      const dd = i === 0 ? { delta: 0, se: 0 } : pairedDelta(drop, r as LabSummary);
      const s = r as LabSummary;
      cell.choices[c.name] = {
        net: round(dd.delta),
        se: round(dd.se),
        oppPPP: round(s.drtg / 100),
        oppEfg: round(s.oppShot.efg),
        oppThreeRate: round(s.oppShot.threeRate),
        oppTov: round(s.oppShot.tov),
        oppPnrBH: s.oppPlayTypes.pnrBH ? round(s.oppPlayTypes.pnrBH.ppp) : null,
      };
    });
    return cell;
  });
  const agg = (cs: Cell[], name: string) => {
    const xs = cs.map((c) => c.choices[name]).filter((x): x is NonNullable<typeof x> => !!x);
    return { net: round(mean(xs.map((x) => x.net))), se: round(seOfMean(xs.map((x) => x.se))), positive: xs.filter((x) => x.net > 0).length, cells: xs.length };
  };
  const out: CoverageOut = {
    meta: runMeta(args.label, t0, started),
    params: { games, defenses: DEFENSES.map(label), offenses: OFFENSES.map(label), choices: choices.map((c) => c.name), skipped, quick: args.quick },
    defenses: DEFENSES.map((t) => tacticsSnapshot(L, t)),
    cells: outCells,
    byOffense: OFFENSES.map((off) => {
      const cs = outCells.filter((c) => c.off === label(off));
      return { off: label(off), choices: Object.fromEntries(choices.slice(1).map((c) => [c.name, (({ net, se, positive }) => ({ net, se, positive }))(agg(cs, c.name))])) };
    }),
    overall: Object.fromEntries(choices.slice(1).map((c) => [c.name, agg(outCells, c.name)])),
    errors,
  };
  writeJson(args.label, 'coverage.json', out);
  console.log(`[coverage] done in ${out.meta.seconds}s`);
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  await runCoverage(args);
  const { writeSummary } = await import('./summary');
  writeSummary(args.label);
}
