// The style measurement style-check and style-gate share: every offensive playbook, defensive
// playbook or shape for every team of a league, fully drilled, against every other team (paired games:
// the same seeds for each option), by shot-value margin a game (every attempt as likely to fall, a
// fouled miss at what its free throws were worth, plus the free throws made: as counterWorth measures),
// as a difference from the team's average option; with the staff's fit for each, its picks (an AI
// staff's, coach's lean included, and the user's own staff's, by its read alone) and the roster's
// profile. The teams are split over `jobs` processes (each a fork of this file).
import { fork } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { startRegularSeason } from '../src/core/league/season';
import { buildSimInput } from '../src/core/league/games';
import { teamPlayers } from '../src/core/league/helpers';
import { GameSim } from '../src/core/sim/engine';
import { Rng } from '../src/core/random';
import { freshFamiliarity } from '../src/core/sim/familiarity';
import { DEF_PRESETS, OFF_PRESETS, applyDefPreset, applyOffPreset, cloneTactics } from '../src/core/sim/tactics';
import { defPresetFit, fitRoster, offPresetFit, presetScores, rosterProfile, shapeFits, shapeInputs, type ProfileKey } from '../src/core/ai/coachAI';
import { OFF_SHAPES, type League, type Tactics } from '../src/core/types';

export type Part = 'off' | 'def' | 'shape';

export interface StyleRow {
  tid: number;
  abbrev: string;
  /** Each option's measured worth against the team's average option, points a game, and its standard error (paired). */
  meas: Record<string, number>;
  se: Record<string, number>;
  /** The staff's fit for each option, in fit points (a tenth of a point a game). */
  fit: Record<string, number>;
  /** An AI staff's pick (its coach's lean included) and the user's own staff's (the read alone), and the reads they pick from; playbooks only. */
  staff?: string;
  user?: string;
  reads?: { ai: Record<string, number>; user: Record<string, number> };
  /** What the team runs. */
  cur: string;
  profile: Record<ProfileKey, number>;
  /** For the shapes, what their fits are read from (shapeInputs). */
  shape?: Record<string, number>;
}

export interface MeasureOpts {
  part: Part;
  /** Games against each opponent per option, on each seed set. */
  k: number;
  /**
   * The seed sets: every option plays the same games, k on each set. A set's games share more of their
   * luck than independent games would (one set can put a playbook 0.2 a game up across the league), so
   * a count of the teams each option is best for averages several.
   */
  seeds: number[];
  /** 'real' (src/data/seed.json) or a fictional league's rng seed. */
  league: 'real' | number;
  jobs: number;
}

/** The league measured: the real one (rng 7) or a fictional one from its rng seed, in its regular season. */
export function styleLeague(league: 'real' | number): League {
  const real = league === 'real';
  const L = createLeague({
    name: 'Style',
    userTid: 0,
    coachName: 'C',
    settings: defaultSettings(),
    seed: real ? JSON.parse(readFileSync('src/data/seed.json', 'utf8')) : null,
    rngSeed: real ? 7 : league,
  });
  L.id = 'style-check';
  startRegularSeason(L);
  return L;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

/** The rows for these teams, measured in this process. */
export function measureTeams(L: League, o: Omit<MeasureOpts, 'jobs' | 'league'>, tids: number[]): StyleRow[] {
  const { part, k, seeds } = o;
  return tids.map((tid) => {
    const team = L.teams[tid];
    const ps = teamPlayers(L, tid);
    const t = team.tactics;
    let options: [string, Tactics][];
    let fit: Record<string, number>;
    const pr = rosterProfile(fitRoster(ps));
    if (part === 'off' || part === 'def') {
      const presets = part === 'off' ? OFF_PRESETS : DEF_PRESETS;
      options = presets.map((p) => {
        const x = cloneTactics(t);
        if (part === 'off') [x.offense, x.offPreset] = [applyOffPreset(x.offense, p.id), p.id];
        else [x.defense, x.defPreset] = [applyDefPreset(x.defense, p.id), p.id];
        return [p.id, x];
      });
      fit = part === 'off' ? offPresetFit(pr) : defPresetFit(pr);
    } else {
      options = OFF_SHAPES.map((s) => {
        const x = cloneTactics(t);
        if (s === 'fourOut') delete x.offense.shape;
        else x.offense.shape = s;
        return [s, x];
      });
      fit = shapeFits(fitRoster(ps), t, team.rotation.order);
    }
    const top = (sc: Record<string, number>) => Object.entries(sc).sort((a, b) => b[1] - a[1])[0][0];
    const reads = part === 'shape' ? undefined : { ai: presetScores(team, ps)[part], user: presetScores(team, ps, { user: true })[part] };
    // the games: the same seeds for every option
    const base = buildSimInput(L, tid, 1, 'regular');
    const opps = L.teams.filter((x) => x.tid !== tid).map((x) => buildSimInput(L, x.tid, 1, 'regular'));
    const runs: Record<string, number[]> = {};
    for (const [id, tactics] of options) {
      const tm = { ...team, tactics };
      const me = { ...base, team: tm, fam: freshFamiliarity(tm, ps, 100), adjust: true };
      const xs: number[] = [];
      for (const seed of seeds)
        for (const op of opps)
          for (let g = 0; g < k; g++) {
            const rng = new Rng((seed + tid * 7919 + op.team.tid * 104729 + Math.imul(g + 1, 2654435761)) >>> 0);
            const home = g % 2 === 0;
            const sim = new GameSim(home ? me : op, home ? op : me, { rng, type: 'regular', injuries: false });
            const r = sim.simToEnd();
            const x = r.xShots!;
            const f = sim.xFouledMiss;
            const v = [x[0].pts + f[0] + r.home.t.ftm, x[1].pts + f[1] + r.away.t.ftm];
            xs.push(home ? v[0] - v[1] : v[1] - v[0]);
          }
      runs[id] = xs;
    }
    const ids = Object.keys(runs);
    const n = runs[ids[0]].length;
    // (no games: the picks alone, every option measured at 0)
    if (!n) for (const id of ids) runs[id] = [0, 0];
    const gameAvg = Array.from({ length: Math.max(n, 2) }, (_, g) => mean(ids.map((id) => runs[id][g])));
    const meas: Record<string, number> = {};
    const se: Record<string, number> = {};
    for (const id of ids) {
      const d = runs[id].map((v, g) => v - gameAvg[g]);
      const m = mean(d);
      meas[id] = m;
      se[id] = Math.sqrt(d.reduce((a, v) => a + (v - m) ** 2, 0) / (d.length - 1) / d.length);
    }
    const profile = Object.fromEntries(Object.entries(pr).filter(([key]) => key !== 'drivers')) as Record<ProfileKey, number>;
    return {
      tid,
      abbrev: team.abbrev,
      meas,
      se,
      fit,
      staff: reads && top(reads.ai),
      user: reads && top(reads.user),
      ...(reads ? { reads } : {}),
      cur: part === 'off' ? t.offPreset : part === 'def' ? t.defPreset : (t.offense.shape ?? 'fourOut'),
      profile,
      ...(part === 'shape' ? { shape: shapeInputs(fitRoster(ps), t, team.rotation.order) } : {}),
    };
  });
}

/** Every team's row, the teams split over `jobs` forked processes (in this one when jobs is 1). */
export async function measureLeague(o: MeasureOpts): Promise<StyleRow[]> {
  const L = styleLeague(o.league);
  const tids = L.teams.map((t) => t.tid);
  if (o.jobs <= 1) return measureTeams(L, o, tids);
  const self = fileURLToPath(import.meta.url);
  const chunks = Array.from({ length: o.jobs }, (_, j) => tids.filter((_, i) => i % o.jobs === j)).filter((c) => c.length);
  const parts = await Promise.all(
    chunks.map(
      (c) =>
        new Promise<StyleRow[]>((resolve, reject) => {
          const child = fork(self, [], { env: { ...process.env, STYLE_WORKER: JSON.stringify({ ...o, tids: c }) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
          let got: StyleRow[] | null = null;
          child.on('message', (m) => (got = m as StyleRow[]));
          child.on('exit', (code) => (got ? resolve(got) : reject(new Error(`A style worker stopped (exit ${code})`))));
        }),
    ),
  );
  return parts.flat().sort((a, b) => a.tid - b.tid);
}

// a forked worker: measure its teams and send them back
if (process.env.STYLE_WORKER && process.send) {
  const o = JSON.parse(process.env.STYLE_WORKER) as MeasureOpts & { tids: number[] };
  const rows = measureTeams(styleLeague(o.league), o, o.tids);
  process.send(rows, () => process.exit(0));
}

/** How many teams each option is (by `f`) — every option listed, at 0 if none. */
export function tally(rows: StyleRow[], f: (r: StyleRow) => string | undefined): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(Object.keys(rows[0].meas).map((id) => [id, 0]));
  for (const r of rows) {
    const v = f(r);
    if (v !== undefined) out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

/**
 * How many teams each option is the top for by `value` (a staff's read, or the measured worth), a team
 * shared between the options within `tie` of its top (in the value's units): the same at the precision
 * the read is shown at, or the games can measure, so a hair's change in one option's value doesn't move
 * a whole team from one count to another.
 */
export function tallyNear(rows: StyleRow[], value: (r: StyleRow) => Record<string, number>, tie: number): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(Object.keys(rows[0].meas).map((id) => [id, 0]));
  for (const r of rows) {
    const f = value(r);
    const best = Math.max(...Object.values(f));
    const near = Object.keys(f).filter((id) => f[id] >= best - tie);
    for (const id of near) out[id] += 1 / near.length;
  }
  return out;
}

/** The option measured best for a team. */
export const bestOf = (r: StyleRow) => Object.keys(r.meas).reduce((a, id) => (r.meas[id] > r.meas[a] ? id : a));
