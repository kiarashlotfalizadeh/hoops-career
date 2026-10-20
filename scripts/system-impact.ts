// System impact: what the Football Manager-style parts of the tactics are worth, in net points per 100
// possessions for the team using them, paired seeds (the same games with and without), against the
// league's average opponent. Familiarity: a fluid team against itself with a new coverage, a new
// shape, a whole new system, and a new arrival in its five. Shapes: each shape against four-out,
// team by team (what the staff's shape fit is fitted to). Roles: the staff's out-of-possession roles
// against none. Mentality: each step against balanced.
// Usage: npx tsx scripts/system-impact.ts [games per case] [parts, comma-separated: fam,shape,roles,mentality]
import { createLeague, defaultSettings } from '../src/core/league/create';
import { teamPlayers } from '../src/core/league/helpers';
import { pairedDelta, runLab, type LabSummary } from '../src/core/ai/lab';
import type { DefScheme, Familiarity, Mentality, OffShape, Player, PnrCoverage, Tactics, Team } from '../src/core/types';
import { OFF_SHAPES } from '../src/core/types';
import { freshFamiliarity } from '../src/core/sim/familiarity';
import { applyOffPreset, cloneTactics } from '../src/core/sim/tactics';
import { autoDefRoles, shapeFits } from '../src/core/ai/coachAI';
import { readFileSync, existsSync } from 'node:fs';

const games = Number(process.argv[2] ?? 300);
const parts = (process.argv[3] ?? 'fam,shape,roles,mentality').split(',');
const seedPath = 'src/data/seed.json';
const seed = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;
const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 17 });

/** The league's average opponent: every team in turn, as many games against each. */
function vsLeague(tid: number, team: Team, players: Player[], fam: Familiarity | undefined, n = games): LabSummary[] {
  const out: LabSummary[] = [];
  const opps = league.teams.filter((t) => t.tid !== tid);
  const per = Math.max(2, Math.round(n / opps.length));
  for (const o of opps) {
    out.push(
      runLab({
        a: { team: { ...team, fam }, players },
        b: { team: { ...o, fam: undefined }, players: teamPlayers(league, o.tid) },
        games: per,
        seed: 1000 + o.tid * 7919 + tid,
      }),
    );
  }
  return out;
}

function delta(a: LabSummary[], b: LabSummary[]) {
  let d = 0;
  let v = 0;
  for (let i = 0; i < a.length; i++) {
    const x = pairedDelta(a[i], b[i]);
    d += x.delta;
    v += x.se ** 2;
  }
  return { delta: d / a.length, se: Math.sqrt(v) / a.length };
}
const fmt = (x: { delta: number; se: number }) => `${x.delta >= 0 ? '+' : ''}${x.delta.toFixed(2)} ± ${x.se.toFixed(2)}`;

const SAMPLE = [0, 4, 9, 13, 17, 22, 26];

if (parts.includes('fam')) {
  console.log('\n== Familiarity (fluid team vs the same tactics with something new)');
  const cases: [string, (t: Team, ps: Player[], f: Familiarity) => { tactics?: Tactics; fam: Familiarity }][] = [
    [
      'new coverage (blitz, never drilled)',
      (t, _ps, f) => {
        const tactics = cloneTactics(t.tactics);
        tactics.defense.pnr = t.tactics.defense.pnr === 'blitz' ? 'hedge' : ('blitz' as PnrCoverage);
        return { tactics, fam: f };
      },
    ],
    [
      'new scheme (2-3 zone, never drilled)',
      (t, _ps, f) => {
        const tactics = cloneTactics(t.tactics);
        tactics.defense.scheme = (t.tactics.defense.scheme === 'zone23' ? 'zone32' : 'zone23') as DefScheme;
        return { tactics, fam: f };
      },
    ],
    [
      'new shape (five-out)',
      (t, _ps, f) => {
        const tactics = cloneTactics(t.tactics);
        tactics.offense.shape = 'fiveOut';
        // (the shape's own effect is taken out: the same shape, drilled, is the base below)
        return { tactics, fam: f };
      },
    ],
    [
      'whole new system (opening night after a coaching change)',
      (t, ps, f) => {
        const fam: Familiarity = { opt: {}, habit: {}, know: { ...f.know }, roles: {} };
        const old = applyOffPreset(cloneTactics(t.tactics).offense, t.tactics.offPreset === 'grind' ? 'paceSpace' : 'grind');
        for (const k of Object.keys(f.habit))
          fam.habit[k] = k.startsWith('a_') ? old.actions[k.slice(2) as keyof typeof old.actions] : ((old as unknown as Record<string, number>)[k] ?? f.habit[k]);
        void ps;
        return { fam };
      },
    ],
    [
      'a new arrival in the five (knowledge 35)',
      (t, _ps, f) => {
        const fam = structuredClone(f);
        fam.know[t.rotation.order[0]] = 35;
        return { fam };
      },
    ],
  ];
  for (const [label, mk] of cases) {
    const ds: { delta: number; se: number }[] = [];
    for (const tid of SAMPLE) {
      const t = league.teams[tid];
      const ps = teamPlayers(league, tid);
      const fluid = freshFamiliarity(t, ps, 100);
      const c = mk(t, ps, fluid);
      const team = c.tactics ? { ...t, tactics: c.tactics } : t;
      // base: the same tactics fully drilled; alt: as the case leaves the team's familiarity
      const drilled = freshFamiliarity(team, ps, 100);
      ds.push(delta(vsLeague(tid, team, ps, drilled), vsLeague(tid, team, ps, c.fam)));
    }
    const d = ds.reduce((a, x) => a + x.delta, 0) / ds.length;
    const se = Math.sqrt(ds.reduce((a, x) => a + x.se ** 2, 0)) / ds.length;
    console.log(`${label.padEnd(58)} ${fmt({ delta: d, se })}`);
  }
}

if (parts.includes('shape')) {
  console.log('\n== Shapes against four-out, one-in, team by team (net per 100) and the staff fit');
  console.log(
    `${'team'.padEnd(6)} ${OFF_SHAPES.filter((s) => s !== 'fourOut')
      .map((s) => s.padEnd(16))
      .join(' ')}  fits`,
  );
  for (const t of league.teams) {
    const ps = teamPlayers(league, t.tid);
    const four = cloneTactics(t.tactics);
    delete four.offense.shape;
    const base = vsLeague(t.tid, { ...t, tactics: four }, ps, undefined, Math.round(games / 2));
    const row: string[] = [];
    for (const s of OFF_SHAPES) {
      if (s === 'fourOut') continue;
      const tactics = cloneTactics(four);
      tactics.offense.shape = s as OffShape;
      row.push(fmt(delta(base, vsLeague(t.tid, { ...t, tactics }, ps, undefined, Math.round(games / 2)))).padEnd(16));
    }
    const fits = shapeFits(ps, four, t.rotation.order);
    console.log(`${t.abbrev.padEnd(6)} ${row.join(' ')}  ${OFF_SHAPES.map((s) => `${s}:${fits[s].toFixed(1)}`).join(' ')}`);
  }
}

if (parts.includes('roles')) {
  console.log('\n== The staff’s out-of-possession roles against none');
  const ds: { delta: number; se: number }[] = [];
  for (const t of league.teams) {
    const ps = teamPlayers(league, t.tid);
    const tactics = cloneTactics(t.tactics);
    tactics.defense.roles = autoDefRoles(ps, t.rotation);
    const plain = cloneTactics(t.tactics);
    delete plain.defense.roles;
    const d = delta(vsLeague(t.tid, { ...t, tactics: plain }, ps, undefined, Math.round(games / 2)), vsLeague(t.tid, { ...t, tactics }, ps, undefined, Math.round(games / 2)));
    ds.push(d);
    console.log(`${t.abbrev.padEnd(6)} ${fmt(d)}  ${Object.values(tactics.defense.roles).join(',')}`);
  }
  const d = ds.reduce((a, x) => a + x.delta, 0) / ds.length;
  console.log(`league average ${d.toFixed(2)}`);
}

if (parts.includes('mentality')) {
  console.log('\n== Mentality against balanced');
  for (const m of [-2, -1, 1, 2] as Mentality[]) {
    const ds: { delta: number; se: number }[] = [];
    let pace = 0;
    for (const tid of SAMPLE) {
      const t = league.teams[tid];
      const ps = teamPlayers(league, tid);
      const base = vsLeague(tid, t, ps, undefined);
      const alt = vsLeague(tid, { ...t, tactics: { ...cloneTactics(t.tactics), mentality: m } }, ps, undefined);
      ds.push(delta(base, alt));
      pace += alt.reduce((a, x) => a + x.pace, 0) / alt.length - base.reduce((a, x) => a + x.pace, 0) / base.length;
    }
    const d = ds.reduce((a, x) => a + x.delta, 0) / ds.length;
    const se = Math.sqrt(ds.reduce((a, x) => a + x.se ** 2, 0)) / ds.length;
    console.log(`${String(m).padEnd(4)} ${fmt({ delta: d, se })}  pace ${pace / SAMPLE.length >= 0 ? '+' : ''}${(pace / SAMPLE.length).toFixed(1)}`);
  }
}
