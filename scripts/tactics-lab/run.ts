// The tactics lab: a reproducible measurement of the tactics layer, to compare engines run for run.
//   Part 1, levers.ts:   each setting's worth against a team's own settings in six paired matchups.
//   Part 2, coverage.ts: the defensive choices against drop coverage, by opponent.
//   Part 3, league.ts:   the AI league as it plays (play types, coverages, adjustments, team ranges,
//                        presets, Synergy comparison), sampled from seasons the season runner plays.
// Outputs go to scripts/tactics-lab/out/<label>/ (levers.json, coverage.json, league.json, run.json and
// summary.md). Only stable public APIs are used (the lab, GameSim and its logs, the season runner), so
// the kit runs on a rewritten tactics layer; a setting the engine's TacticsPatch type no longer has is
// skipped and said so.
// Usage: npx tsx scripts/tactics-lab/run.ts <label> [--quick] [--workers N] [--serial]
//   --quick      small sizes for a check (levers 40 games a matchup, coverage 50 a cell, 1 season)
//   --workers N  lab worker processes (default 12); the league part runs beside them in its own process
//   --serial     run the league part after the lab parts (cleaner timings)
//   --games N, --seasons K, --per-team N, --synergy <teams.json>: override the sizes / the real data
// Each part runs alone too: npx tsx scripts/tactics-lab/levers.ts <label> (coverage.ts, league.ts),
// and summary.ts <label> rewrites the digest from whatever results exist.
import { fork } from 'node:child_process';
import { join } from 'node:path';
import { argFlags, LAB_DIR, parseArgs, round, writeJson } from './common';
import { Pool } from './pool';
import { runLevers } from './levers';
import { runCoverage } from './coverage';
import { runLeague } from './league';
import { writeSummary } from './summary';

const args = parseArgs();
const t0 = performance.now();
const started = new Date();
console.log(`[run] tactics lab "${args.label}"${args.quick ? ' (quick)' : ''}, ${args.workers} workers${args.serial ? ', parts in series' : ''}`);

/** The league part in a process of its own, beside the lab workers. */
const leagueChild = () =>
  new Promise<void>((resolve, reject) => {
    const child = fork(join(LAB_DIR, 'league.ts'), [...argFlags(args), '--no-summary'], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`the league part exited with code ${code}`))));
  });

const league = args.serial ? null : leagueChild();
const pool = new Pool(args.workers);
try {
  await runLevers(args, pool);
  await runCoverage(args, pool);
} finally {
  pool.close();
}
if (league) await league;
else await runLeague(args);
writeJson(args.label, 'run.json', {
  started: started.toISOString(),
  seconds: round((performance.now() - t0) / 1000, 1),
  workers: args.workers,
  serial: args.serial,
  quick: args.quick,
});
writeSummary(args.label);
console.log(`[run] done in ${round((performance.now() - t0) / 1000, 1)}s`);
