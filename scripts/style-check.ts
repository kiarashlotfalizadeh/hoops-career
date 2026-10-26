// Style check: whether the staff's fits say what the engine says each style is worth. Every offensive
// playbook, defensive playbook and shape for every team of a league, fully drilled, against every
// other team (scripts/style-measure.ts: paired games, by shot-value margin a game). Prints, for each part:
// - r: the fit's points a game against the measured worth, both against the team's average option,
//   over every team and option (targets: defense 0.85, offense and shapes 0.6), and within each option
//   across teams;
// - for the playbooks, how many teams each is best for and picked by (an AI staff's pick, its coach's
//   lean included, and the user's own staff's, by its read alone), and the picks' cost against the best:
//   the league's style spread (scripts/style-gate.ts holds it in CI);
// - for the shapes, how often the fit's sign against four-out is right where it says 0.2 or more.
// The fits were fitted to runs of this over the real league and fictional ones (2026-10); run it again
// after an engine or playbook change, and refit coachAI's OFF_FIT/DEF_FIT/SHAPE_FIT if r falls.
// Usage: tsx scripts/style-check.ts [games per opponent on each seed set, default 6] [parts: off,def,shape]
// [seed sets, comma-separated, default 9001] [league: real, or a fictional league's rng seed] [processes, default 4]
// (STYLE_JSON=<file> also writes every row, the roster profiles included, for refitting.)
import { writeFileSync } from 'node:fs';
import { bestOf, measureLeague, tally, type Part, type StyleRow } from './style-measure';

const k = Number(process.argv[2] ?? 6);
const parts = (process.argv[3] ?? 'off,def,shape').split(',') as Part[];
const seeds = (process.argv[4] ?? '9001').split(',').map(Number);
const league = !process.argv[5] || process.argv[5] === 'real' ? 'real' : Number(process.argv[5]);
const jobs = Number(process.argv[6] ?? 4);

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const corr = (x: number[], y: number[]) => {
  const [mx, my] = [mean(x), mean(y)];
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    a += (x[i] - mx) * (y[i] - my);
    b += (x[i] - mx) ** 2;
    c += (y[i] - my) ** 2;
  }
  return a / Math.sqrt(b * c);
};

const t0 = performance.now();
const dump: Record<string, StyleRow[]> = {};
for (const part of parts) {
  const rows = await measureLeague({ part, k, seeds, league, jobs });
  dump[part] = rows;
  const ids = Object.keys(rows[0].meas);
  // fit points are a tenth of a point a game; both against the team's average option
  const rel = (r: StyleRow) => {
    const m = mean(ids.map((id) => r.fit[id]));
    return Object.fromEntries(ids.map((id) => [id, (r.fit[id] - m) / 10]));
  };
  const x = rows.flatMap((r) => ids.map((id) => rel(r)[id]));
  const y = rows.flatMap((r) => ids.map((id) => r.meas[id]));
  console.log(
    `\n== ${part}: ${rows.length} teams × ${ids.length} options, ${(rows.length - 1) * k * seeds.length} games each, league ${league}, seeds ${seeds.join(',')} (${((performance.now() - t0) / 1000).toFixed(0)}s)`,
  );
  console.log(`r(fit, measured) over every team and option: ${corr(x, y).toFixed(2)}`);
  console.log(
    `within each option across teams: ${ids
      .map(
        (id) =>
          `${id} ${corr(
            rows.map((r) => rel(r)[id]),
            rows.map((r) => r.meas[id]),
          ).toFixed(2)}`,
      )
      .join(' · ')}`,
  );
  console.log(`measured worth against the team's average option: ${ids.map((id) => `${id} ${mean(rows.map((r) => r.meas[id])).toFixed(2)}`).join(' · ')}`);
  console.log(`a team's standard error, a game: ${mean(rows.flatMap((r) => ids.map((id) => r.se[id]))).toFixed(2)}`);
  console.log(`best for: ${JSON.stringify(tally(rows, bestOf))}`);
  if (part !== 'shape') {
    console.log(
      `an AI staff picks: ${JSON.stringify(tally(rows, (r) => r.staff))}; the user's staff: ${JSON.stringify(tally(rows, (r) => r.user))}; the league plays: ${JSON.stringify(tally(rows, (r) => r.cur))}`,
    );
    for (const [who, f] of [
      ['an AI staff', (r: StyleRow) => r.staff!],
      ["the user's staff", (r: StyleRow) => r.user!],
    ] as const)
      console.log(
        `${who}'s pick under the best, a game: ${mean(rows.map((r) => r.meas[bestOf(r)] - r.meas[f(r)])).toFixed(2)} (the pick is the best for ${rows.filter((r) => bestOf(r) === f(r)).length} of ${rows.length})`,
      );
  } else {
    const said = rows.flatMap((r) =>
      ids.filter((id) => id !== 'fourOut' && Math.abs(r.fit[id] - r.fit.fourOut) >= 2).map((id) => Math.sign(r.fit[id] - r.fit.fourOut) === Math.sign(r.meas[id] - r.meas.fourOut)),
    );
    console.log(`the fit's sign against four-out, where it says 0.2 a game or more: right ${said.filter(Boolean).length} of ${said.length}`);
  }
  for (const r of rows)
    console.log(
      `  ${r.abbrev.padEnd(4)} ${ids.map((id) => `${id} ${r.meas[id] >= 0 ? '+' : ''}${r.meas[id].toFixed(1)}/${(rel(r)[id] >= 0 ? '+' : '') + rel(r)[id].toFixed(1)}`).join('  ')}${r.staff ? `  AI: ${r.staff} · user: ${r.user}` : ''}`,
    );
}
if (process.env.STYLE_JSON) writeFileSync(process.env.STYLE_JSON, JSON.stringify(dump));
