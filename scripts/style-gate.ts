// Style gate (CI): no dominant setup. Every offensive and defensive playbook and every shape for every
// team of the real league against every other team (scripts/style-measure.ts: paired games on fixed
// seed sets, by shot-value margin, each option played as the user's team plays it), the user's staff's
// picks for each roster, and what the AI's staffs run. Fails if any playbook is measured best for more
// than MAX_PLAYBOOK of the 30 teams or picked by the user's own staff for more than MAX_USER_PICK, any
// shape is measured best for more than MAX_SHAPE, or the AI's staffs play any one ball-screen coverage
// with more than MAX_COVERAGE.
// Why these limits: an NBA league's teams spread over many schemes. With six offenses and seven
// defenses, four or five of them close in worth, the measured best is partly the games' noise (one
// playbook can be "best" for 9 or 10 teams by chance alone) and one seed set's games share some of
// their luck (on the tactics v2 engine, four groups of seed sets put Drop at 4.5 to 15 teams and the
// zone at 8 to 13, on the same league), so the gate plays four seed sets of 3 games against each
// opponent rather than one of 12, and the limit is 12 of 30 (two in five): no balanced engine has
// reached it and every dominant setup so far did (the 2-3 zone was best for 22 of 30, Heliocentric once
// for 73 of 90 rosters). Shapes are four, and four-out is the one the staff leaves only for a clear
// edge, so a shape may be best for up to 14. The user's own staff reads each roster alone: where the
// playbooks are within a tenth of a point a game of each other, an honest read sends every roster of a
// kind to the same one, so its limit is 18 of 30 (three in five): loose enough for that, tight enough
// for a read that dominates (the zone's 22, Heliocentric's 73 of 90). Tactics v2 (2026-11) gave no
// reason to move these three: only the user's staff picks playbooks now, and what they guard is the
// same. (On the v2 engine as first written they failed for the engine's sake, not the reads': Balanced
// was worth +0.26 a game over the roster's average playbook for every real roster alike, Horns beat
// four-out by about 0.2 a game whatever the roster. Once the playbooks came to differ in what they run,
// Horns gave up more spacing and the reads were refit, 2026-11-10, the measured best spread over all six
// playbooks, Drop and the zone lead the defenses with about 8 and 10 teams, and no shape passes 11.)
// The AI's staffs pick no playbook since tactics v2: each plays its coach's style (ai/style.ts) with the
// ball-screen coverage its personnel calls for (coverageFor). That coverage is the league's defensive
// spread, and NBA teams spread over coverages unevenly (Second Spectrum, 2020-21: drop on 58% of ball
// screens, switch 18% and rising, blitz 3%), so Drop may lead, but no coverage may be played by more
// than 20 of the 30 staffs (two in three: the NBA's drop share and room for a roster draw to lean
// further, short of a league where one coverage is all that's left). The real league's staffs play Drop
// 18, Switch 6, Hedge 3, Ice 2 and Blitz 1, and the user's staff the same by personnel (a fictional
// league's mix follows its coaches' own leans; the gate holds the real league's). On offense an AI staff's playbook is only a name, the one nearest its coach's
// real style (17 of the real league's 30 styles are nearest Heliocentric), which says nothing about a
// dominant setup, so it is reported and not held; so are the shapes the staffs play.
// A team counts whole for its best option only where that option beats the next by more than the games
// can tell apart (MEASURED_TIE), and for the user's staff's pick where its read beats the next by a
// tenth of a point a game (READ_TIE); closer than that it is shared between them (one playbook's read
// moving by 0.05 a game had moved six teams' picks at once). The counts are deterministic for a given
// engine, staff reads and seed.json (the shapes the league's staffs play come from the reads, so a refit
// that moves a team's shape moves its games); a failure after a ratings or engine change means a style
// now dominates, or the staff's reads need a refit (scripts/style-check.ts, scripts/style-fit.ts).
// Usage: tsx scripts/style-gate.ts [games per opponent on each seed set, default 3] [processes, default: the cores, at most 8]
import { availableParallelism } from 'node:os';
import { measureLeague, tally, tallyNear, type Part } from './style-measure';

const MAX_PLAYBOOK = 12;
/** The user's own staff's picks (the read alone): see the header. */
const MAX_USER_PICK = 18;
const MAX_SHAPE = 14;
/** The AI's staffs' ball-screen coverages: see the header. */
const MAX_COVERAGE = 20;
/** Points a game within which a team's options share its "best" (its games measure each to about ±0.4). */
const MEASURED_TIE = 0.2;
/** Fit points within which a staff's reads share its pick (a tenth of a point a game: a hair's move in one read shouldn't move whole teams). */
const READ_TIE = 1;
/** The seed sets the games are played on (k games against each opponent on each). */
const SEEDS = [9001, 4242, 777, 31337];

const k = Number(process.argv[2] ?? 3);
const jobs = Number(process.argv[3] ?? Math.min(8, Math.max(1, availableParallelism())));
const t0 = performance.now();
const failures: string[] = [];
for (const part of ['def', 'off', 'shape'] as Part[]) {
  const rows = await measureLeague({ part, k, seeds: SEEDS, league: 'real', jobs });
  // [what, counts, limit (none: reported only), what a failure calls it]
  const counts: [string, Record<string, number>, number | null, string][] = [
    ['measured best for', tallyNear(rows, (r) => r.meas, MEASURED_TIE), part === 'shape' ? MAX_SHAPE : MAX_PLAYBOOK, 'measured best'],
  ];
  // (the offense by the staff's read, ties shared; the defense as the staff picks it, by personnel unless the read is clear: staffPresets)
  if (part === 'off') counts.push(["the user's staff picks", tallyNear(rows, (r) => r.reads!.user, READ_TIE), MAX_USER_PICK, "the user's staff's pick"]);
  if (part === 'def') counts.push(["the user's staff picks", tally(rows, (r) => r.user!), MAX_USER_PICK, "the user's staff's pick"]);
  if (part === 'def') counts.push(['an AI staff runs', tally(rows, (r) => r.staff), MAX_COVERAGE, "an AI staff's coverage"]);
  else if (part === 'off') counts.push(['an AI style is nearest', tally(rows, (r) => r.staff), null, '']);
  else counts.push(['the staffs play', tally(rows, (r) => r.staff), null, '']);
  console.log(
    `\n== ${part} (${rows.length} teams, ${(rows.length - 1) * k * SEEDS.length} games an option on ${SEEDS.length} seed sets, ${((performance.now() - t0) / 1000).toFixed(0)}s)`,
  );
  for (const [what, c, max, name] of counts) {
    console.log(
      `${what.padEnd(24)} ${Object.entries(c)
        .map(([id, n]) => `${id} ${Math.round(n * 10) / 10}`)
        .join(' · ')}${max === null ? '  (reported only)' : ''}`,
    );
    if (max === null) continue;
    for (const [id, n] of Object.entries(c)) if (n > max) failures.push(`${part}: ${id} is ${name} for ${n.toFixed(1)} of ${rows.length} teams (limit ${max})`);
  }
}
console.log(`\n${((performance.now() - t0) / 1000).toFixed(0)}s`);
if (failures.length) {
  console.log(`\nStyle gate FAILED:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  console.log(
    'Retune the engine or the playbooks (src/core/sim) so no style dominates, refit the staff reads (coachAI OFF_FIT, DEF_FIT, shapeFits: scripts/style-fit.ts), or for the AI coverages revisit coverageFor (ai/style.ts).',
  );
  process.exit(1);
}
console.log('\nStyle gate passed: no playbook, shape or coverage dominates.');
