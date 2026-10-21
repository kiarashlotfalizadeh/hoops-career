// Partnership impact: what links are worth (src/core/sim/links.ts), in net points per 100 possessions
// for the team that has them, paired seeds (the same games with its pairs gelled and with every pair
// new to each other), against the league's average opponent. League: each sampled team's own links as
// its staff's roles make them, with how many it has and their strength, and the tags' points a game.
// Elite: a team given an elite handler and an elite rim runner (or stretch big) who know each other,
// against the same two new to each other. Crowd: the crowded paint's cost (K.link.crowd on and off).
// Level: the league's scoring with every team's pairs gelled against every pair new (what a recentre
// would have to take back).
// Usage: npx tsx scripts/link-impact.ts [games per case] [parts, comma-separated: league,elite,crowd,level]
import { existsSync, readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { ensureRotation } from '../src/core/league/games';
import { teamPlayers } from '../src/core/league/helpers';
import { pairedDelta, runLab, type LabSummary } from '../src/core/ai/lab';
import type { Familiarity, OffRole, Player, Team } from '../src/core/types';
import { freshFamiliarity } from '../src/core/sim/familiarity';
import { lineupLinks } from '../src/core/sim/links';
import { cloneTactics } from '../src/core/sim/tactics';
import { K } from '../src/core/sim/engine';

const games = Number(process.argv[2] ?? 300);
const parts = (process.argv[3] ?? 'league,elite,crowd,level').split(',');
const seedPath = 'src/data/seed.json';
const seed = existsSync(seedPath) ? JSON.parse(readFileSync(seedPath, 'utf8')) : null;
const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 17 });
for (const t of league.teams) ensureRotation(league, t.tid);
const gelled = (t: Team, ps: Player[]) => freshFamiliarity(t, ps, 100);
/** The same record with every pair new to each other. */
const strangers = (f: Familiarity): Familiarity => ({ ...f, duo: {} });

/** The league's average opponent (each fluid, its pairs gelled): every team in turn. */
function vsLeague(tid: number, team: Team, players: Player[], fam: Familiarity, n = games, oppFam?: (t: Team, ps: Player[]) => Familiarity): LabSummary[] {
  const out: LabSummary[] = [];
  const opps = league.teams.filter((t) => t.tid !== tid);
  const per = Math.max(2, Math.round(n / opps.length));
  for (const o of opps) {
    const ops = teamPlayers(league, o.tid);
    out.push(runLab({ a: { team: { ...team, fam }, players }, b: { team: { ...o, fam: (oppFam ?? gelled)(o, ops) }, players: ops }, games: per, seed: 1000 + o.tid * 7919 + tid }));
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
/** Points a game each partnership tag earned the team, or cost it (the clash, the opponent's wall), as the lab tallies impacts. */
function tags(runs: LabSummary[]) {
  const sum: Record<string, number> = {};
  for (const r of runs)
    for (const [k, v] of Object.entries(r.impacts)) {
      if (!k.startsWith('link_') && !k.startsWith('clash_')) continue;
      // (ours: our links on offense and our wall; what we lose: the clash we play into, their wall)
      const mine = k.endsWith(':o') ? v.us : k === 'link_wall:d' ? v.us - v.them : -v.them;
      sum[k] = (sum[k] ?? 0) + mine / runs.length;
    }
  return Object.entries(sum)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`)
    .join(', ');
}

const SAMPLE = [0, 4, 9, 13, 17, 22, 26];

if (parts.includes('tags')) {
  console.log('\n== Every team’s partnership tags (points a game), its pairs gelled');
  const tot: Record<string, number> = {};
  for (const t of league.teams) {
    const ps = teamPlayers(league, t.tid);
    const on = vsLeague(t.tid, t, ps, gelled(t, ps), Math.round(games / 3));
    const tg = tags(on);
    for (const part of tg.split(', ').filter(Boolean)) {
      const [k, v] = part.split(' ');
      tot[k] = (tot[k] ?? 0) + Number(v) / league.teams.length;
    }
    console.log(`${t.abbrev.padEnd(4)} ${tg}`);
  }
  console.log(
    'league mean',
    Object.entries(tot)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', '),
  );
}

if (parts.includes('league')) {
  console.log('\n== Each team’s own links: gelled against new to each other (net per 100), the starting five’s links');
  const all: { delta: number; se: number }[] = [];
  for (const tid of SAMPLE) {
    const t = league.teams[tid];
    const ps = teamPlayers(league, tid);
    const f = gelled(t, ps);
    const five = t.rotation.order.slice(0, 5).map((pid) => ps.find((p) => p.pid === pid)!);
    const { links, clashes } = lineupLinks(t.tactics, five, f);
    const on = vsLeague(tid, t, ps, f);
    const d = delta(vsLeague(tid, t, ps, strangers(f)), on);
    all.push(d);
    const list = links.map((l) => `${l.id}:${l.strength.toFixed(2)}`).join(' ');
    console.log(`${t.abbrev.padEnd(4)} ${fmt(d).padEnd(14)} ${list}${clashes.length ? ' CROWD' : ''}  | ${tags(on)}`);
  }
  const m = all.reduce((a, x) => a + x.delta, 0) / all.length;
  const se = Math.sqrt(all.reduce((a, x) => a + x.se ** 2, 0)) / all.length;
  console.log(`mean ${fmt({ delta: m, se })}`);
}

if (parts.includes('elite')) {
  console.log('\n== An elite pair in the five: gelled against new to each other (net per 100)');
  const tid = 9;
  const t = league.teams[tid];
  for (const [kind, bigRole] of [
    ['two-man game', 'roller'],
    ['pick-and-pop', 'stretch'],
  ] as [string, OffRole][]) {
    const ps = structuredClone(teamPlayers(league, tid));
    const five = t.rotation.order.slice(0, 5).map((pid) => ps.find((p) => p.pid === pid)!);
    const handler = [...five].sort((a, b) => b.ratings.hgt - a.ratings.hgt).at(-1)!;
    const big = [...five].sort((a, b) => b.ratings.hgt - a.ratings.hgt)[0];
    Object.assign(handler.ratings, { hnd: 90, pas: 90, oiq: 88 });
    Object.assign(big.ratings, bigRole === 'roller' ? { ins: 88, ath: 85, str: 80, oiq: 80 } : { tp: 85, oiq: 80 });
    const tactics = cloneTactics(t.tactics);
    // (nobody else in a role that links with them: the pair alone)
    for (const p of ps) tactics.offense.roles[p.pid] = 'glue';
    tactics.offense.roles[handler.pid] = 'creator';
    tactics.offense.roles[big.pid] = bigRole;
    const team = { ...t, tactics };
    const f = gelled(team, ps);
    const on = vsLeague(tid, team, ps, f);
    console.log(`${kind.padEnd(14)} ${fmt(delta(vsLeague(tid, team, ps, strangers(f)), on))}  | ${tags(on)}`);
  }
}

if (parts.includes('crowd')) {
  console.log('\n== The crowded paint: two inside bigs in the five, four-out (net per 100, K.link.crowd on against off)');
  const tid = 13;
  const t = league.teams[tid];
  const ps = teamPlayers(league, tid);
  const five = t.rotation.order.slice(0, 5).map((pid) => ps.find((p) => p.pid === pid)!);
  const bigs = [...five].sort((a, b) => b.ratings.hgt - a.ratings.hgt).slice(0, 2);
  const tactics = cloneTactics(t.tactics);
  delete tactics.offense.shape;
  tactics.offense.roles[bigs[0].pid] = 'roller';
  tactics.offense.roles[bigs[1].pid] = 'post';
  const team = { ...t, tactics };
  const f = gelled(team, ps);
  const crowd = K.link.crowd;
  const on = vsLeague(tid, team, ps, f);
  K.link.crowd = 0;
  const off = vsLeague(tid, team, ps, f);
  K.link.crowd = crowd;
  console.log(`crowd ${fmt(delta(off, on))}  | ${tags(on)}`);
}

if (parts.includes('level')) {
  console.log('\n== The league’s scoring: every team’s pairs gelled against every pair new (points per 100, both sides)');
  let on = 0;
  let off = 0;
  let n = 0;
  for (const tid of SAMPLE) {
    const t = league.teams[tid];
    const ps = teamPlayers(league, tid);
    const a = vsLeague(tid, t, ps, gelled(t, ps), Math.round(games / 2));
    const b = vsLeague(tid, t, ps, strangers(gelled(t, ps)), Math.round(games / 2), (o, ops) => strangers(gelled(o, ops)));
    for (let i = 0; i < a.length; i++) {
      on += (a[i].ortg + a[i].drtg) / 2;
      off += (b[i].ortg + b[i].drtg) / 2;
      n++;
    }
  }
  console.log(`gelled ${(on / n).toFixed(2)}  new ${(off / n).toFixed(2)}  shift ${(on / n - off / n).toFixed(2)} per 100`);
}
