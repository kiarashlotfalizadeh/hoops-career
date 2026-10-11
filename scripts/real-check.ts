// Realism check for the seeded league: simulate one regular season and compare league averages
// and each regular's per-game line with his real 2025-26 numbers.
// Usage: npx tsx scripts/real-check.ts [path/to/seed.json]
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay } from '../src/core/league/season';
import { teamPlayers, playerName } from '../src/core/league/helpers';
import { standings } from '../src/core/league/standings';
import { CAP } from '../src/core/constants';
import { FREE_AGENT } from '../src/core/types';

const seed: SeedData = JSON.parse(readFileSync(process.argv[2] ?? 'src/data/seed.json', 'utf8'));
const league = createLeague({ name: 'Check', userTid: 0, coachName: 'Check', settings: defaultSettings(), seed, rngSeed: 7 });
const roster = teamPlayers(league, 0).sort((a, b) => a.ovr - b.ovr);
while (teamPlayers(league, 0).length > CAP.rosterMax) roster.shift()!.tid = FREE_AGENT;
const errs = startRegularSeason(league);
if (errs.length) throw new Error(errs.join('; '));
while (league.phase === 'regular') simDay(league);

const season = league.season;
const rows = Object.values(league.players)
  .map((p) => {
    const sim = p.stats.filter((s) => s.season === season && !s.playoffs);
    const gp = sim.reduce((a, s) => a + s.gp, 0);
    const tot = (k: 'min' | 'pts' | 'ast' | 'orb' | 'drb' | 'stl' | 'blk' | 'tov' | 'fga' | 'fgm' | 'tpa' | 'tpm' | 'fta' | 'rimA' | 'midA' | 'rimM') => sim.reduce((a, s) => a + s[k], 0) / Math.max(1, gp);
    const real = p.stats.filter((s) => s.real && s.season === 2026);
    const rgp = real.reduce((a, s) => a + s.gp, 0);
    const rt = (k: 'min' | 'pts' | 'ast' | 'orb' | 'drb' | 'stl' | 'blk' | 'tov' | 'fga' | 'fgm' | 'tpa' | 'tpm' | 'fta' | 'rimA' | 'midA' | 'rimM') => real.reduce((a, s) => a + s[k], 0) / Math.max(1, rgp);
    const share = (f: typeof tot, k: 'rimA' | 'midA' | 'tpa') => f(k) / Math.max(0.01, f('fga'));
    return {
      p, gp, mpg: tot('min'), ppg: tot('pts'), apg: tot('ast'), rpg: tot('orb') + tot('drb'), fgp: tot('fgm') / Math.max(0.01, tot('fga')), rgp, rmpg: rt('min'), rppg: rt('pts'), rapg: rt('ast'), rrpg: rt('orb') + rt('drb'),
      rim: share(tot, 'rimA'), mid: share(tot, 'midA'), three: share(tot, 'tpa'), rrim: share(rt, 'rimA'), rmid: share(rt, 'midA'), rthree: share(rt, 'tpa'),
      rimPct: tot('rimM') / Math.max(0.01, tot('rimA')), rrimPct: rt('rimM') / Math.max(0.01, rt('rimA')), hasZones: rt('rimA') > 0,
    };
  })
  .filter((r) => r.gp >= 20);
const f = (x: number) => x.toFixed(1).padStart(5);
console.log('Top 25 scorers (sim vs real 2025-26):');
for (const r of [...rows].sort((a, b) => b.ppg - a.ppg).slice(0, 25))
  console.log(`${playerName(r.p).padEnd(26)} ${String(r.p.ovr).padStart(3)}  min ${f(r.mpg)} (${f(r.rmpg)})  pts ${f(r.ppg)} (${f(r.rppg)})  ast ${f(r.apg)} (${f(r.rapg)})  reb ${f(r.rpg)} (${f(r.rrpg)})`);
console.log('\nTop 12 by minutes:', [...rows].sort((a, b) => b.mpg - a.mpg).slice(0, 12).map((r) => `${playerName(r.p)} ${r.mpg.toFixed(1)}`).join(', '));
console.log('Top 8 APG:', [...rows].sort((a, b) => b.apg - a.apg).slice(0, 8).map((r) => `${playerName(r.p)} ${r.apg.toFixed(1)} (${r.rapg.toFixed(1)})`).join(', '));
console.log('Top 8 RPG:', [...rows].sort((a, b) => b.rpg - a.rpg).slice(0, 8).map((r) => `${playerName(r.p)} ${r.rpg.toFixed(1)} (${r.rrpg.toFixed(1)})`).join(', '));
const both = rows.filter((r) => r.rgp >= 40 && r.rmpg >= 20);
const corr = (xs: number[], ys: number[]) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return a / Math.sqrt(b * c);
};
console.log(`\nSim vs real correlation over ${both.length} regulars: MPG ${corr(both.map((r) => r.mpg), both.map((r) => r.rmpg)).toFixed(3)}, PPG ${corr(both.map((r) => r.ppg), both.map((r) => r.rppg)).toFixed(3)}, APG ${corr(both.map((r) => r.apg), both.map((r) => r.rapg)).toFixed(3)}, RPG ${corr(both.map((r) => r.rpg), both.map((r) => r.rrpg)).toFixed(3)}`);
const zb = both.filter((r) => r.hasZones && r.rgp >= 40);
const mae = (xs: number[], ys: number[]) => xs.reduce((a, x, i) => a + Math.abs(x - ys[i]), 0) / xs.length;
if (zb.length) {
  console.log(`Shot diet over ${zb.length} regulars (sim vs real 2025-26 NBA.com): rim share r ${corr(zb.map((r) => r.rim), zb.map((r) => r.rrim)).toFixed(3)} (MAE ${(100 * mae(zb.map((r) => r.rim), zb.map((r) => r.rrim))).toFixed(1)} pts), mid share r ${corr(zb.map((r) => r.mid), zb.map((r) => r.rmid)).toFixed(3)} (MAE ${(100 * mae(zb.map((r) => r.mid), zb.map((r) => r.rmid))).toFixed(1)}), 3PA share r ${corr(zb.map((r) => r.three), zb.map((r) => r.rthree)).toFixed(3)}, rim FG% r ${corr(zb.map((r) => r.rimPct), zb.map((r) => r.rrimPct)).toFixed(3)}`);
  for (const n of ['Rudy Gobert', 'DeMar DeRozan', 'Stephen Curry', 'Shai Gilgeous-Alexander', 'Nikola Jokić', 'Kevin Durant']) {
    const r = zb.find((x) => playerName(x.p) === n);
    if (r) console.log(`  ${n.padEnd(24)} rim ${(100 * r.rim).toFixed(0)}% (${(100 * r.rrim).toFixed(0)}) mid ${(100 * r.mid).toFixed(0)}% (${(100 * r.rmid).toFixed(0)}) 3PA ${(100 * r.three).toFixed(0)}% (${(100 * r.rthree).toFixed(0)})`);
  }
}
const st = standings(league);
for (const conf of ['E', 'W'] as const)
  console.log(`${conf}: ` + st.filter((r) => r.conf === conf).map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`).join(', '));

const watch = (process.env.WATCH ?? 'Shai Gilgeous-Alexander,Luka Dončić,Nikola Jokić,Giannis Antetokounmpo,Jalen Brunson,Victor Wembanyama,Isaiah Joe,T.J. McConnell').split(',');
console.log('\nWatch list:');
for (const n of watch) {
  const r = rows.find((x) => playerName(x.p) === n);
  if (!r) { console.log(n, 'not found / <20 gp'); continue; }
  const t = r.p.tid >= 0 ? league.teams[r.p.tid] : null;
  const role = t?.tactics.offense.roles?.[r.p.pid] ?? '-';
  const fr = t?.tactics.offense.freedom?.[r.p.pid] ?? 0;
  const rank = t ? teamPlayers(league, t.tid).sort((a, b) => b.ovr - a.ovr).findIndex((x) => x.pid === r.p.pid) + 1 : 0;
  console.log(`${n.padEnd(24)} ${t?.abbrev ?? 'FA'} ovr ${r.p.ovr} (#${rank} on team) role ${role} freedom ${fr} use ${r.p.tend?.use} gp ${r.gp} | min ${f(r.mpg)} (${f(r.rmpg)}) pts ${f(r.ppg)} (${f(r.rppg)}) ast ${f(r.apg)} (${f(r.rapg)}) fg% ${(r.fgp * 100).toFixed(1)}`);
}

const team = process.env.TEAM ?? 'SAS';
const T = league.teams.find((t) => t.abbrev === team);
if (T) {
  console.log(`\n${team} rotation plan vs actual:`);
  for (const pid of T.rotation.order) {
    const p = league.players[pid];
    const r = rows.find((x) => x.p.pid === pid);
    const pf = p.stats.filter((s) => s.season === season && !s.playoffs).reduce((a, s) => a + s.pf, 0) / Math.max(1, r?.gp ?? 1);
    console.log(`  ${playerName(p).padEnd(24)} ovr ${p.ovr} end ${Math.round(p.ratings.end)} plan ${T.rotation.minutes[pid] ?? 0} actual ${r ? r.mpg.toFixed(1) : '-'} (real ${r ? r.rmpg.toFixed(1) : '-'}) gp ${r?.gp ?? 0} pf ${pf.toFixed(1)}`);
  }
}
