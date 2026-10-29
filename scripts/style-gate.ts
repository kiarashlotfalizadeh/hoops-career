// Style gate (CI): no dominant setup. Every offensive and defensive playbook and every shape for every
// team of the real league against every other team (scripts/style-measure.ts: paired
// games on fixed seed sets, by shot-value margin), and the staff's picks for each roster. Fails if any
// playbook is measured best for, or picked by an AI staff for, more than MAX_PLAYBOOK of the 30 teams,
// picked by the user's own staff for more than MAX_USER_PICK, or any shape is measured best for more
// than MAX_SHAPE.
// Why these limits: an NBA league's teams spread over many schemes. With six offenses and seven
// defenses, four or five of them close in worth, the measured best is partly the games' noise (one
// playbook can be "best" for 9 or 10 teams by chance alone) and one seed set's games share some of
// their luck (one set put the 2-3 zone at 13 teams, another at 6, on the same league), so the gate
// plays four seed sets of 3 games against each opponent rather than one of 12, and the limit is 12 of
// 30 (two in five): no balanced engine has reached it and every dominant setup so far did (the 2-3
// zone was best for 22 of 30, Heliocentric once for 73 of 90 rosters). Shapes are four, and four-out is
// the one the staff leaves only for a clear edge, so a shape may be best for up to 14. The user's own
// staff reads each roster alone, without a coach's lean: where the playbooks are within a tenth of a
// point a game of each other, an honest read sends every roster of a kind to the same one (since
// partnerships went, 2026-10-28, Five-Out reads best for about 16 of the real league's passing rosters
// while no offense measures best for more than 8), so its limit is 18 of 30 (three in five): loose
// enough for that, tight enough for a read that dominates (the zone's 22, Heliocentric's 73 of 90).
// The league's own variety is held by the measured best and the AI staffs' picks. A team counts
// whole for its best option only where that option beats the next by more than the games can tell
// apart (MEASURED_TIE), and for the staff's pick where its read beats the next by a tenth of a point a
// game (READ_TIE, the style picker's precision); closer than that it is shared between them (one
// playbook's read moving by 0.05 a game had moved six teams' picks at once, and one seed group's games
// put the zone at 11 teams where another's put it at 8). The counts are
// deterministic for a given engine and seed.json; a failure after a ratings or engine change means a
// style now dominates, or the staff's reads need a refit (scripts/style-check.ts, scripts/style-fit.ts).
// Usage: tsx scripts/style-gate.ts [games per opponent on each seed set, default 3] [processes, default: the cores, at most 8]
import { availableParallelism } from 'node:os';
import { measureLeague, tallyNear, type Part } from './style-measure';

const MAX_PLAYBOOK = 12;
/** The user's own staff's picks (the read alone): see the header. */
const MAX_USER_PICK = 18;
const MAX_SHAPE = 14;
/** Points a game within which a team's options share its "best" (its games measure each to about ±0.4). */
const MEASURED_TIE = 0.2;
/** Fit points within which a staff's reads share its pick (a tenth of a point a game: the style picker shows one decimal). */
const READ_TIE = 1;
/** The seed sets the games are played on (k games against each opponent on each). */
const SEEDS = [9001, 4242, 777, 31337];

const k = Number(process.argv[2] ?? 3);
const jobs = Number(process.argv[3] ?? Math.min(8, Math.max(1, availableParallelism())));
const t0 = performance.now();
const failures: string[] = [];
for (const part of ['def', 'off', 'shape'] as Part[]) {
  const rows = await measureLeague({ part, k, seeds: SEEDS, league: 'real', jobs });
  const limit = (what: string) => (part === 'shape' ? MAX_SHAPE : what === "the user's staff picks" ? MAX_USER_PICK : MAX_PLAYBOOK);
  const counts: [string, Record<string, number>][] = [['measured best for', tallyNear(rows, (r) => r.meas, MEASURED_TIE)]];
  if (part !== 'shape') {
    counts.push(['an AI staff picks', tallyNear(rows, (r) => r.reads!.ai, READ_TIE)]);
    counts.push(["the user's staff picks", tallyNear(rows, (r) => r.reads!.user, READ_TIE)]);
  }
  console.log(
    `\n== ${part} (${rows.length} teams, ${(rows.length - 1) * k * SEEDS.length} games an option on ${SEEDS.length} seed sets, ${((performance.now() - t0) / 1000).toFixed(0)}s)`,
  );
  for (const [what, c] of counts) {
    console.log(
      `${what.padEnd(24)} ${Object.entries(c)
        .map(([id, n]) => `${id} ${Math.round(n * 10) / 10}`)
        .join(' · ')}`,
    );
    const max = limit(what);
    for (const [id, n] of Object.entries(c))
      if (n > max)
        failures.push(
          `${part}: ${id} is ${what === 'measured best for' ? 'measured best' : what.replace(' picks', "'s pick")} for ${n.toFixed(1)} of ${rows.length} teams (limit ${max})`,
        );
  }
}
console.log(`\n${((performance.now() - t0) / 1000).toFixed(0)}s`);
if (failures.length) {
  console.log(`\nStyle gate FAILED:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  console.log('Retune the engine or the playbooks (src/core/sim) so no style dominates, or refit the staff reads (coachAI OFF_FIT, DEF_FIT, shapeFits: scripts/style-fit.ts).');
  process.exit(1);
}
console.log('\nStyle gate passed: no playbook or shape dominates.');
