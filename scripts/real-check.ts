// Realism check for the seeded league: simulate one regular season and compare league averages
// and each regular's per-game line with his real 2025-26 numbers.
// Usage: npx tsx scripts/real-check.ts [path/to/seed.json] [rngSeed]
//   env HC_SEED=<path> (seed file), RNG=<n> (league rng seed, default 7), TEAM=<abbrev> (rotation detail),
//   WATCH=<comma-separated names>
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings, type SeedData } from '../src/core/league/create';
import { startRegularSeason, simDay } from '../src/core/league/season';
import { teamPlayers, playerName, seasonTotals, standardRoster } from '../src/core/league/helpers';
import { releasePlayer } from '../src/core/league/contracts';
import { standings } from '../src/core/league/standings';
import { CAP, TARGETS } from '../src/core/constants';
import type { Player } from '../src/core/types';
import { engineDiag, resetEngineDiag } from '../src/core/sim/engine';
import { awardLadder } from '../src/core/league/awards';
import { SEASON_WEIGHT } from './data/derive';

const seedPath = process.argv[2] ?? process.env.HC_SEED ?? 'src/data/seed.json';
const rngSeed = Number(process.argv[3] ?? process.env.RNG ?? 7);
const seed: SeedData = JSON.parse(readFileSync(seedPath, 'utf8'));
console.log(`seed ${seedPath} · rng ${rngSeed}`);
const league = createLeague({ name: 'Check', userTid: 0, coachName: 'Check', settings: defaultSettings(), seed, rngSeed });
// AI teams cut to 15 at creation, the user's team doesn't: release its lowest-rated standard contracts (two-way deals don't count)
const roster = standardRoster(league, 0).sort((a, b) => a.ovr - b.ovr);
while (standardRoster(league, 0).length > CAP.rosterMax) releasePlayer(league, roster.shift()!, { news: false });
const errs = startRegularSeason(league);
if (errs.length) throw new Error(errs.join('; '));
resetEngineDiag();
while (league.phase === 'regular') simDay(league);

const season = league.season;
type K = 'min' | 'pts' | 'ast' | 'orb' | 'drb' | 'stl' | 'blk' | 'tov' | 'fga' | 'fgm' | 'tpa' | 'tpm' | 'fta' | 'ftm' | 'rimA' | 'midA' | 'rimM' | 'gs';
const rows = Object.values(league.players)
  .map((p) => {
    const sim = p.stats.filter((s) => s.season === season && !s.playoffs);
    const gp = sim.reduce((a, s) => a + s.gp, 0);
    const tot = (k: K) => sim.reduce((a, s) => a + s[k], 0) / Math.max(1, gp);
    const real = p.stats.filter((s) => s.real && s.season === season - 1);
    const rgp = real.reduce((a, s) => a + s.gp, 0);
    const rt = (k: K) => real.reduce((a, s) => a + s[k], 0) / Math.max(1, rgp);
    const share = (f: typeof tot, k: 'rimA' | 'midA' | 'tpa') => f(k) / Math.max(0.01, f('fga'));
    return {
      p,
      gp,
      mpg: tot('min'),
      ppg: tot('pts'),
      apg: tot('ast'),
      rpg: tot('orb') + tot('drb'),
      spg: tot('stl'),
      bpg: tot('blk'),
      tpm: tot('tpm'),
      tov: tot('tov'),
      fgp: tot('fgm') / Math.max(0.01, tot('fga')),
      rgp,
      rmpg: rt('min'),
      rppg: rt('pts'),
      rapg: rt('ast'),
      rrpg: rt('orb') + rt('drb'),
      rspg: rt('stl'),
      rbpg: rt('blk'),
      rtpm: rt('tpm'),
      rtov: rt('tov'),
      rim: share(tot, 'rimA'),
      mid: share(tot, 'midA'),
      three: share(tot, 'tpa'),
      rrim: share(rt, 'rimA'),
      rmid: share(rt, 'midA'),
      rthree: share(rt, 'tpa'),
      rimPct: tot('rimM') / Math.max(0.01, tot('rimA')),
      rrimPct: rt('rimM') / Math.max(0.01, rt('rimA')),
      hasZones: rt('rimA') > 0,
      ts: tot('pts') / Math.max(0.01, 2 * (tot('fga') + 0.44 * tot('fta'))),
      rts: rt('pts') / Math.max(0.01, 2 * (rt('fga') + 0.44 * rt('fta'))),
    };
  })
  .filter((r) => r.gp >= 20);
const f = (x: number) => x.toFixed(1).padStart(5);

// ---- league averages per team game vs 2025-26 NBA
const tot: Record<string, number> = {};
let games = 0;
let poss = 0;
for (const t of league.teams) {
  const ts = t.seasons.find((s) => s.season === season);
  if (!ts) continue;
  games += ts.won + ts.lost;
  poss += ts.poss;
  for (const [k, v] of Object.entries(ts.t)) tot[k] = (tot[k] ?? 0) + (v as number);
}
const per = (k: string) => tot[k] / Math.max(1, games);
const lg: [string, number, number][] = [
  ['pace', poss / games, TARGETS.pace],
  ['pts', per('pts'), TARGETS.pts],
  ['fga', per('fga'), TARGETS.fga],
  ['fg%', tot.fgm / tot.fga, TARGETS.fgPct],
  ['3pa', per('tpa'), TARGETS.tpa],
  ['3p%', tot.tpm / tot.tpa, TARGETS.tpPct],
  ['fta', per('fta'), TARGETS.fta],
  ['ft%', tot.ftm / tot.fta, TARGETS.ftPct],
  ['orb', per('orb'), TARGETS.orb],
  ['drb', per('drb'), TARGETS.drb],
  ['ast', per('ast'), TARGETS.ast],
  ['stl', per('stl'), TARGETS.stl],
  ['blk', per('blk'), TARGETS.blk],
  ['tov', per('tov'), TARGETS.tov],
  ['pf', per('pf'), TARGETS.pf],
];
console.log('League per team game (sim vs 2025-26 NBA):');
console.log('  ' + lg.map(([k, v, t]) => `${k} ${v < 2 ? v.toFixed(3) : v.toFixed(1)} (${t < 2 ? t.toFixed(3) : t.toFixed(1)}, ${(((v - t) / t) * 100).toFixed(0)}%)`).join(' · '));
// ---- game-to-game shape, and how margin turns into wins (NBA: ~2.7 wins per point of average margin, win SD ~12)
{
  const played = league.games.filter((g) => g.season === season && g.type === 'regular');
  const margins = played.map((g) => g.home.pts - g.away.pts);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = (xs: number[]) => Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
  const cov = (xs: number[], ys: number[]) => xs.reduce((a, x, i) => a + (x - mean(xs)) * (ys[i] - mean(ys)), 0) / (xs.length - 1);
  const hs = played.map((g) => g.home.pts);
  const as = played.map((g) => g.away.pts);
  const ts = league.teams.map((t) => t.seasons.find((x) => x.season === season)!).filter(Boolean);
  const wins = ts.map((x) => x.won);
  const diff = ts.map((x) => (x.ptsFor - x.ptsAgainst) / Math.max(1, x.won + x.lost));
  console.log(
    `  games: margin SD ${sd(margins).toFixed(1)} (${TARGETS.marginSd}), 20+ ${((margins.filter((m) => Math.abs(m) >= 20).length / margins.length) * 100).toFixed(1)}% (${TARGETS.blowout20 * 100}%), OT ${((played.filter((g) => g.ot > 0).length / played.length) * 100).toFixed(1)}% (${TARGETS.otRate * 100}%), score corr ${(cov(hs, as) / sd(hs) / sd(as)).toFixed(2)} (${TARGETS.scoreCorr}); ${(cov(wins, diff) / sd(diff) ** 2).toFixed(2)} wins per point of margin (NBA ~2.7), win SD ${sd(wins).toFixed(1)} (NBA ~12), wins ${Math.min(...wins)}-${Math.max(...wins)}`,
  );
  // team net ratings vs what the same players' real box plus-minus and EPM (3 seasons) say at the minutes they got
  const impact = (p: Player, key: 'bpm' | 'epm') => {
    let v = 0;
    let m = 0;
    for (const s of p.stats) {
      const x = s.adv?.[key];
      if (s.real && !s.playoffs && SEASON_WEIGHT[s.season] && x !== undefined) {
        v += x * s.min * SEASON_WEIGHT[s.season];
        m += s.min * SEASON_WEIGHT[s.season];
      }
    }
    return m >= 300 ? v / m : -2;
  };
  const net = ts.map((x) => ((x.ptsFor - x.ptsAgainst) / ((x.poss + x.oppPoss) / 2)) * 100);
  const vs = (key: 'bpm' | 'epm', label: string) => {
    const proj = league.teams.map((t) =>
      Object.values(league.players).reduce(
        (a, p) => a + (impact(p, key) * p.stats.filter((s) => s.season === season && !s.playoffs && s.tid === t.tid).reduce((b, s) => b + s.min, 0)) / (82 * 48),
        0,
      ),
    );
    return `vs the players' real ${label} at sim minutes (SD ${sd(proj).toFixed(2)}): r ${(cov(net, proj) / sd(net) / sd(proj)).toFixed(2)}, slope ${(cov(net, proj) / sd(proj) ** 2).toFixed(2)}`;
  };
  const withEpm = Object.values(league.players).some((p) => p.stats.some((s) => s.adv?.epm !== undefined));
  console.log(`  team net rating SD ${sd(net).toFixed(2)} (NBA ~5-6); ${vs('bpm', 'BPM')}${withEpm ? `; ${vs('epm', 'EPM')}` : ''}`);
}
const zl = (z: 'rim' | 'paint' | 'mid' | 'three') => `${z} ${((100 * engineDiag.ast[z]) / Math.max(1, engineDiag.made[z])).toFixed(0)}%`;
console.log(`  assisted share of makes: ${zl('rim')}, ${zl('paint')}, ${zl('mid')}, ${zl('three')} (NBA ~65/45/40/85)`);

console.log('\nTop 25 scorers (sim vs real 2025-26):');
for (const r of [...rows].sort((a, b) => b.ppg - a.ppg).slice(0, 25))
  console.log(
    `${playerName(r.p).padEnd(26)} ${String(r.p.ovr).padStart(3)}  min ${f(r.mpg)} (${f(r.rmpg)})  pts ${f(r.ppg)} (${f(r.rppg)})  ast ${f(r.apg)} (${f(r.rapg)})  reb ${f(r.rpg)} (${f(r.rrpg)})`,
  );

// ---- leaders (50+ games), real 2025-26 in parentheses
const qual = rows.filter((r) => r.gp >= 50);
const leaders = (label: string, v: (r: (typeof rows)[0]) => number, rv: (r: (typeof rows)[0]) => number, n = 10) =>
  console.log(
    `${label.padEnd(5)} ` +
      [...qual]
        .sort((a, b) => v(b) - v(a))
        .slice(0, n)
        .map((r) => `${playerName(r.p)} ${v(r).toFixed(1)} (${rv(r).toFixed(1)})`)
        .join(', '),
  );
console.log('\nLeaders, 50+ games (real 2025-26):');
leaders(
  'PPG',
  (r) => r.ppg,
  (r) => r.rppg,
);
leaders(
  'RPG',
  (r) => r.rpg,
  (r) => r.rrpg,
);
leaders(
  'APG',
  (r) => r.apg,
  (r) => r.rapg,
);
leaders(
  'SPG',
  (r) => r.spg,
  (r) => r.rspg,
);
leaders(
  'BPG',
  (r) => r.bpg,
  (r) => r.rbpg,
);
leaders(
  '3PM',
  (r) => r.tpm,
  (r) => r.rtpm,
);
leaders(
  'TOV',
  (r) => r.tov,
  (r) => r.rtov,
);
leaders(
  'MPG',
  (r) => r.mpg,
  (r) => r.rmpg,
);

const both = rows.filter((r) => r.rgp >= 40 && r.rmpg >= 20);
const corr = (xs: number[], ys: number[]) => {
  const n = xs.length,
    mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let a = 0,
    b = 0,
    c = 0;
  for (let i = 0; i < n; i++) {
    a += (xs[i] - mx) * (ys[i] - my);
    b += (xs[i] - mx) ** 2;
    c += (ys[i] - my) ** 2;
  }
  return a / Math.sqrt(b * c);
};
const sdOf = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + (x - xs.reduce((b, y) => b + y, 0) / xs.length) ** 2, 0) / (xs.length - 1));
const mae = (xs: number[], ys: number[]) => xs.reduce((a, x, i) => a + Math.abs(x - ys[i]), 0) / xs.length;
console.log(
  `\nSim vs real correlation over ${both.length} regulars: MPG ${corr(
    both.map((r) => r.mpg),
    both.map((r) => r.rmpg),
  ).toFixed(3)}, PPG ${corr(
    both.map((r) => r.ppg),
    both.map((r) => r.rppg),
  ).toFixed(3)}, APG ${corr(
    both.map((r) => r.apg),
    both.map((r) => r.rapg),
  ).toFixed(3)}, RPG ${corr(
    both.map((r) => r.rpg),
    both.map((r) => r.rrpg),
  ).toFixed(3)}, SPG ${corr(
    both.map((r) => r.spg),
    both.map((r) => r.rspg),
  ).toFixed(3)}, BPG ${corr(
    both.map((r) => r.bpg),
    both.map((r) => r.rbpg),
  ).toFixed(3)}, 3PM ${corr(
    both.map((r) => r.tpm),
    both.map((r) => r.rtpm),
  ).toFixed(3)}, TS% ${corr(
    both.map((r) => r.ts),
    both.map((r) => r.rts),
  ).toFixed(3)} (SD ${sdOf(both.map((r) => r.ts)).toFixed(3)} vs ${sdOf(both.map((r) => r.rts)).toFixed(3)} real)`,
);
// minutes over everyone with a real 2025-26 sample, including players the plan left out
const mrows = Object.values(league.players)
  .map((p) => {
    const s = seasonTotals(p, season);
    const real = p.stats.filter((x) => x.real && x.season === season - 1);
    const rgp = real.reduce((a, x) => a + x.gp, 0);
    return { p, gp: s?.gp ?? 0, mpg: s && s.gp ? s.min / s.gp : 0, rgp, rmpg: real.reduce((a, x) => a + x.min, 0) / Math.max(1, rgp) };
  })
  .filter((r) => r.rgp >= 40 && r.p.tid >= 0 && (r.p.injury?.gamesRemaining ?? 0) < 20);
const playedRows = mrows.filter((r) => r.gp >= 20);
console.log(
  `Minutes over ${playedRows.length} players with 40+ real games: r ${corr(
    playedRows.map((r) => r.mpg),
    playedRows.map((r) => r.rmpg),
  ).toFixed(3)}, MAE ${mae(
    playedRows.map((r) => r.mpg),
    playedRows.map((r) => r.rmpg),
  ).toFixed(2)}; max sim MPG ${Math.max(...rows.map((r) => r.mpg)).toFixed(1)}; real 20+ MPG players under 12 sim MPG: ${
    mrows
      .filter((r) => r.rmpg >= 20 && r.gp >= 10 && r.mpg < 12)
      .map((r) => `${playerName(r.p)} ${r.mpg.toFixed(1)} (${r.rmpg.toFixed(1)})`)
      .join(', ') || 'none'
  }`,
);
const over = playedRows
  .filter((r) => r.mpg - r.rmpg >= 8)
  .sort((a, b) => b.mpg - b.rmpg - (a.mpg - a.rmpg))
  .slice(0, 8);
const under = playedRows
  .filter((r) => r.rmpg - r.mpg >= 8)
  .sort((a, b) => b.rmpg - b.mpg - (a.rmpg - a.mpg))
  .slice(0, 8);
console.log(`  most over-played: ${over.map((r) => `${playerName(r.p)} ${r.mpg.toFixed(1)} (${r.rmpg.toFixed(1)})`).join(', ') || 'none'}`);
console.log(`  most under-played: ${under.map((r) => `${playerName(r.p)} ${r.mpg.toFixed(1)} (${r.rmpg.toFixed(1)})`).join(', ') || 'none'}`);
// single-game extremes (real seasons: ~10-15 games of 50+, ~50 of 15+ assists)
const lines = league.games.filter((g) => g.season === season && g.type === 'regular').flatMap((g) => [...g.home.players, ...g.away.players]);
const top = (f: (b: (typeof lines)[0]) => number, n = 5) =>
  [...lines]
    .sort((a, b) => f(b) - f(a))
    .slice(0, n)
    .map((b) => `${b.name} ${f(b)}`)
    .join(', ');
console.log(
  `Game highs — pts: ${top((b) => b.pts)}; ast: ${top((b) => b.ast)}; reb: ${top((b) => b.orb + b.drb)}; 50+ pt games ${lines.filter((b) => b.pts >= 50).length}, 40+ ${lines.filter((b) => b.pts >= 40).length}, 15+ ast games ${lines.filter((b) => b.ast >= 15).length}, 20+ ast ${lines.filter((b) => b.ast >= 20).length}`,
);
// production vs his real rate (three seasons, recency-weighted per 36) at the minutes he got
const rate = (p: (typeof rows)[0]['p'], k: 'pts' | 'ast') => {
  let v = 0;
  let m = 0;
  for (const s of p.stats)
    if (s.real && SEASON_WEIGHT[s.season]) {
      v += s[k] * SEASON_WEIGHT[s.season];
      m += s.min * SEASON_WEIGHT[s.season];
    }
  return m >= 500 ? (v / m) * 36 : NaN;
};
for (const k of ['pts', 'ast'] as const) {
  const dev = rows
    .filter((r) => r.gp >= 40 && r.mpg >= 15)
    .map((r) => ({ r, exp: (rate(r.p, k) * r.mpg) / 36, got: k === 'pts' ? r.ppg : r.apg }))
    .filter((x) => Number.isFinite(x.exp))
    .sort((a, b) => b.got - b.exp - (a.got - a.exp));
  const fmt = (x: (typeof dev)[0]) => `${playerName(x.r.p)} ${x.got.toFixed(1)} (${x.exp.toFixed(1)})`;
  console.log(`${k.toUpperCase()} vs real rate at sim minutes — most over: ${dev.slice(0, 6).map(fmt).join(', ')}; most under: ${dev.slice(-6).reverse().map(fmt).join(', ')}`);
}
const zb = both.filter((r) => r.hasZones && r.rgp >= 40);
if (zb.length) {
  console.log(
    `Shot diet over ${zb.length} regulars (sim vs real 2025-26 NBA.com): rim share r ${corr(
      zb.map((r) => r.rim),
      zb.map((r) => r.rrim),
    ).toFixed(3)} (MAE ${(
      100 *
      mae(
        zb.map((r) => r.rim),
        zb.map((r) => r.rrim),
      )
    ).toFixed(1)} pts), mid share r ${corr(
      zb.map((r) => r.mid),
      zb.map((r) => r.rmid),
    ).toFixed(3)} (MAE ${(
      100 *
      mae(
        zb.map((r) => r.mid),
        zb.map((r) => r.rmid),
      )
    ).toFixed(1)}), 3PA share r ${corr(
      zb.map((r) => r.three),
      zb.map((r) => r.rthree),
    ).toFixed(3)}, rim FG% r ${corr(
      zb.map((r) => r.rimPct),
      zb.map((r) => r.rrimPct),
    ).toFixed(3)}`,
  );
}

// ---- awards
const aw = league.awards.find((a) => a.season === season);
if (aw) {
  const line = (pid?: number) => {
    if (pid === undefined) return '-';
    const r = rows.find((x) => x.p.pid === pid);
    const p = league.players[pid];
    const t = league.teams[p.tid];
    const ts = t?.seasons.find((s) => s.season === season);
    const drtg = ts ? (ts.ptsAgainst / Math.max(1, ts.oppPoss)) * 100 : 0;
    return r
      ? `${playerName(p)} (${t?.abbrev}, ${ts?.won}-${ts?.lost}, DRtg ${drtg.toFixed(1)}) ${r.ppg.toFixed(1)}p ${r.rpg.toFixed(1)}r ${r.apg.toFixed(1)}a ${r.spg.toFixed(1)}s ${r.bpg.toFixed(1)}b`
      : playerName(p);
  };
  console.log(`\nMVP ${line(aw.mvp)}\nDPOY ${line(aw.dpoy)}`);
  console.log(
    `  DPOY ladder: ${awardLadder(league, 'dpoy', 6)
      .map((x) => `${playerName(league.players[x.pid])} ${x.score.toFixed(1)}`)
      .join(', ')}`,
  );
  console.log(`All-Defense 1st: ${(aw.allDefense[0] ?? []).map((pid) => playerName(league.players[pid])).join(', ')}`);
}

const st = standings(league);
for (const conf of ['E', 'W'] as const)
  console.log(
    `${conf}: ` +
      st
        .filter((r) => r.conf === conf)
        .map((r) => `${league.teams[r.tid].abbrev} ${r.won}-${r.lost}`)
        .join(', '),
  );

const watch = (
  process.env.WATCH ??
  "Shai Gilgeous-Alexander,Luka Dončić,Nikola Jokić,Jaylen Brown,Trae Young,James Harden,Draymond Green,Isaiah Hartenstein,Jonathan Isaac,Ace Bailey,Royce O'Neale,A.J. Green,Sam Hauser,T.J. McConnell"
).split(',');
console.log('\nWatch list:');
for (const n of watch) {
  const r = rows.find((x) => playerName(x.p) === n);
  if (!r) {
    console.log(n, 'not found / <20 gp');
    continue;
  }
  const t = r.p.tid >= 0 ? league.teams[r.p.tid] : null;
  const role = t?.tactics.offense.roles?.[r.p.pid] ?? '-';
  const fr = t?.tactics.offense.freedom?.[r.p.pid] ?? 0;
  const rank = t
    ? teamPlayers(league, t.tid)
        .sort((a, b) => b.ovr - a.ovr)
        .findIndex((x) => x.pid === r.p.pid) + 1
    : 0;
  console.log(
    `${n.padEnd(24)} ${t?.abbrev ?? 'FA'} ${t?.tactics.offPreset ?? ''} ovr ${r.p.ovr} (#${rank}) ${role}/${fr} use ${r.p.tend?.use} pass ${r.p.tend?.pass} gp ${r.gp} | min ${f(r.mpg)} (${f(r.rmpg)}) pts ${f(r.ppg)} (${f(r.rppg)}) ast ${f(r.apg)} (${f(r.rapg)}) 3pm ${f(r.tpm)} (${f(r.rtpm)}) blk ${f(r.bpg)} (${f(r.rbpg)})`,
  );
}

const team = process.env.TEAM;
const T = team ? league.teams.find((t) => t.abbrev === team.toUpperCase()) : undefined;
if (team && !T) console.log(`\nTEAM=${team} is none of ${league.teams.map((t) => t.abbrev).join(', ')}`);
if (T) {
  console.log(`\n${T.abbrev} rotation plan vs actual:`);
  for (const pid of T.rotation.order) {
    const p = league.players[pid];
    const r = rows.find((x) => x.p.pid === pid);
    const pf = p.stats.filter((s) => s.season === season && !s.playoffs).reduce((a, s) => a + s.pf, 0) / Math.max(1, r?.gp ?? 1);
    console.log(
      `  ${playerName(p).padEnd(24)} ovr ${p.ovr} end ${Math.round(p.ratings.end)} plan ${T.rotation.minutes[pid] ?? 0} actual ${r ? r.mpg.toFixed(1) : '-'} (real ${r ? r.rmpg.toFixed(1) : '-'}) gp ${r?.gp ?? 0} pf ${pf.toFixed(1)}${p.injury ? ' INJ' : ''}`,
    );
  }
}
