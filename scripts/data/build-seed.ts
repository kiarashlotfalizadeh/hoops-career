// Build src/data/seed.json from cached Basketball Reference pages (run data:fetch first).
//
// Inputs: per-game + advanced tables for 2023-24, 2024-25, 2025-26; the current contracts
// table (who plays where in 2026-27 and their salaries); team roster pages (height, weight,
// birth date, jersey, country, college); draft pages (draft slot).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAT_SEASONS, ROSTER_SEASONS, DRAFT_YEARS, TEAM_CODES } from './sources';
import { COUNTRY_NAMES, parseAdvanced, parseContracts, parseDraft, parsePerGame, parseRoster, type AdvRow, type ContractRow, type DraftRow, type PerGameRow, type RosterRow } from './parse';
import { PROSPECT_HINTS, aggregate, deriveRatings, popStats, prospectRatings, type Agg } from './derive';
import { calibrate } from './calibrate';
import type { PlayerStats, Pos, Ratings, Tendencies } from '../../src/core/types';
import type { SeedData, SeedPlayer } from '../../src/core/league/create';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { BBREF_TO_TID } from '../../src/core/teams';
import { RATING_KEYS, ovrRaw, toDisplay } from '../../src/core/ratings';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');
const read = (key: string) => {
  const f = join(RAW, `${key}.html`);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const COMBINED = /^(TOT|\dTM)$/;

function main() {
  const contractsHtml = read('contracts');
  if (!contractsHtml) {
    console.error('Missing data/raw/contracts.html. Run `npm run data:fetch` first.');
    process.exit(1);
  }
  const contracts = parseContracts(contractsHtml);
  console.log(`contracts: ${contracts.length} players (first column ${contracts[0]?.firstSeasonLabel || '?'})`);

  const perGame: PerGameRow[] = [];
  const adv: AdvRow[] = [];
  const leagueAvg: Record<number, PerGameRow> = {};
  for (const s of STAT_SEASONS) {
    const pg = read(`per_game_${s}`);
    const ad = read(`advanced_${s}`);
    if (!pg || !ad) {
      console.error(`Missing stats for ${s}.`);
      process.exit(1);
    }
    const parsed = parsePerGame(pg, s);
    perGame.push(...parsed.rows);
    if (parsed.league) leagueAvg[s] = parsed.league;
    adv.push(...parseAdvanced(ad, s));
    console.log(`season ${s}: ${parsed.rows.length} per-game rows`);
  }
  const rosters: RosterRow[] = [];
  for (const s of ROSTER_SEASONS) for (const t of TEAM_CODES) {
    const html = read(`roster_${t}_${s}`);
    if (html) rosters.push(...parseRoster(html, t, s));
  }
  const drafts: DraftRow[] = [];
  for (const y of DRAFT_YEARS) {
    const html = read(`draft_${y}`);
    if (html) drafts.push(...parseDraft(html, y));
  }
  console.log(`rosters: ${rosters.length} rows, drafts: ${drafts.length} picks`);

  const byId = <T extends { id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.id) ?? [];
      list.push(r);
      m.set(r.id, list);
    }
    return m;
  };
  const pgById = byId(perGame);
  const advById = byId(adv);
  const rosterById = new Map<string, RosterRow>();
  for (const r of rosters.sort((a, b) => a.season - b.season)) rosterById.set(r.id, r); // later season wins
  const draftById = new Map(drafts.map((d) => [d.id, d]));
  const contractById = new Map<string, ContractRow>(contracts.map((c) => [c.id, c]));

  // universe: everyone under contract + recent rotation players who are unsigned
  const ids = new Set<string>(contracts.map((c) => c.id));
  const fa = [...pgById.entries()]
    .filter(([id, rows]) => !ids.has(id) && rows.some((r) => r.season === 2026 && r.g * r.mp >= 250))
    .map(([id, rows]) => ({ id, min: rows.filter((r) => r.season === 2026 && !COMBINED.test(r.team)).reduce((a, r) => a + r.g * r.mp, 0) }))
    .sort((a, b) => b.min - a.min)
    .slice(0, 140);
  for (const f of fa) ids.add(f.id);

  // aggregate stats
  const aggs = new Map<string, Agg>();
  for (const id of ids) {
    const rows = pgById.get(id) ?? [];
    // use the combined row when a player changed teams mid-season; otherwise the single row
    const forAgg: PerGameRow[] = [];
    for (const s of STAT_SEASONS) {
      const sr = rows.filter((r) => r.season === s);
      const comb = sr.find((r) => COMBINED.test(r.team));
      if (comb) forAgg.push(comb);
      else forAgg.push(...sr);
    }
    const advRows: AdvRow[] = [];
    for (const s of STAT_SEASONS) {
      const sr = (advById.get(id) ?? []).filter((r) => r.season === s);
      const comb = sr.find((r) => COMBINED.test(r.team));
      if (comb) advRows.push(comb);
      else advRows.push(...sr);
    }
    const a = forAgg.length ? aggregate(forAgg, advRows) : null;
    if (a) aggs.set(id, a);
  }
  const pop = popStats([...aggs.values()]);

  const players: SeedPlayer[] = [];
  const targets: { idx: number; agg: Agg; rel: number }[] = [];
  for (const id of ids) {
    const c = contractById.get(id);
    const rows = pgById.get(id) ?? [];
    const ros = rosterById.get(id);
    const dr = draftById.get(id);
    const name = c?.name ?? ros?.name ?? rows[0]?.name ?? id;
    const parts = name.split(' ');
    const first = parts.length > 1 ? parts[0] : '';
    const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    const lastStat = [...rows].sort((a, b) => b.season - a.season)[0];
    // birth year in the game's convention (age = season - bornYear, as of Feb 1)
    let bornYear: number;
    if (ros?.birthDate && ros.birthDate.length === 8) {
      const y = Number(ros.birthDate.slice(0, 4));
      const md = Number(ros.birthDate.slice(4));
      bornYear = y + (md > 201 ? 1 : 0);
    } else if (lastStat) bornYear = lastStat.season - lastStat.age;
    else bornYear = 2027 - 21;
    const age = 2027 - bornYear;
    const posRaw = (ros?.pos || lastStat?.pos || 'SF').toUpperCase();
    const pos = (['PG', 'SG', 'SF', 'PF', 'C'].includes(posRaw) ? posRaw : posRaw === 'G' ? 'SG' : posRaw === 'F' ? 'PF' : 'SF') as Pos;
    const heightIn = ros?.heightIn || estimateHeight(pos);
    const weightLb = ros?.weightLb || 215;
    const agg = aggs.get(id);
    let ratings: Ratings;
    let tend: Tendencies;
    let rel = 0;
    if (agg && agg.rawMin >= 60) {
      const d = deriveRatings(agg, { heightIn, weightLb, age, pos }, pop, id);
      rel = d.rel;
      if (agg.rawMin < 400) {
        // thin NBA sample: blend with a draft-slot prior
        const pr = prospectRatings({ heightIn, weightLb, age, pos }, dr?.pick ?? null, id, PROSPECT_HINTS[name]);
        const w = agg.rawMin / 400;
        ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, d.r[k] * w + pr.r[k] * (1 - w)])) as unknown as Ratings;
      } else ratings = d.r;
      tend = d.tend;
    } else {
      const pr = prospectRatings({ heightIn, weightLb, age, pos }, dr?.pick ?? null, id, PROSPECT_HINTS[name]);
      ratings = pr.r;
      tend = pr.tend;
    }
    const stats: PlayerStats[] = rows
      .filter((r) => !COMBINED.test(r.team))
      .map((r) => {
        const a = (advById.get(id) ?? []).find((x) => x.season === r.season && x.team === r.team);
        const g = r.g;
        const t = (v: number) => Math.round(v * g);
        return {
          season: r.season,
          tid: BBREF_TO_TID[r.team] ?? -1,
          playoffs: false,
          real: true,
          gp: g,
          gs: r.gs,
          min: Math.round(r.mp * g),
          fgm: t(r.fg),
          fga: t(r.fga),
          tpm: t(r.fg3),
          tpa: t(r.fg3a),
          ftm: t(r.ft),
          fta: t(r.fta),
          orb: t(r.orb),
          drb: t(r.drb),
          ast: t(r.ast),
          stl: t(r.stl),
          blk: t(r.blk),
          tov: t(r.tov),
          pf: t(r.pf),
          pts: t(r.pts),
          pm: 0,
          rimM: 0,
          rimA: 0,
          midM: 0,
          midA: 0,
          onPoss: 0,
          onPtsFor: 0,
          onPtsAgainst: 0,
          teamFga: 0,
          teamFta: 0,
          teamTov: 0,
          adv: a
            ? { per: a.per, ts: a.ts, usg: a.usgPct, astPct: a.astPct, trbPct: a.trbPct, stlPct: a.stlPct, blkPct: a.blkPct, tovPct: a.tovPct, ws: a.ws, ws48: a.ws48, obpm: a.obpm, dbpm: a.dbpm, bpm: a.bpm, vorp: a.vorp }
            : undefined,
        };
      });
    const lastOpt = c?.options[c.options.length - 1];
    const sp: SeedPlayer = {
      id,
      first,
      last,
      pos,
      heightIn,
      weightLb,
      bornYear,
      country: COUNTRY_NAMES[ros?.country ?? 'US'] ?? ros?.country ?? 'USA',
      college: ros?.college ?? dr?.college ?? '',
      jersey: ros?.jersey ?? '',
      team: c ? c.team : null,
      contract: c && c.salaries.length ? { salaries: c.salaries, option: lastOpt === 'player' || lastOpt === 'team' ? lastOpt : undefined } : null,
      draft: dr ? { year: dr.year, round: dr.round, pick: dr.pick, team: dr.team } : null,
      ratings,
      tend,
      stats,
    };
    if (agg && agg.rawMin >= 300) targets.push({ idx: players.length, agg, rel });
    players.push(sp);
  }
  console.log(`players: ${players.length} (${players.filter((p) => p.team).length} under contract, ${players.filter((p) => !p.team).length} free agents)`);
  const teamCounts: Record<string, number> = {};
  for (const p of players) if (p.team) teamCounts[p.team] = (teamCounts[p.team] ?? 0) + 1;
  console.log('roster sizes:', Object.entries(teamCounts).map(([t, n]) => `${t}:${n}`).join(' '));

  // calibrate in the engine
  const seed: SeedData = { version: 1, generated: new Date().toISOString(), source: 'Basketball Reference: 2023-24 to 2025-26 per-game & advanced; current contracts', season: 2027, players, realAvgs: realAvgs(leagueAvg[2026]) };
  const league = createLeague({ name: 'calib', userTid: 0, coachName: 'x', settings: { ...defaultSettings(), injuries: false }, seed, rngSeed: 99 });
  const pidByIdx = new Map<number, number>();
  for (const p of Object.values(league.players)) {
    const i = players.findIndex((sp) => sp.id === p.bbrefId);
    if (i >= 0) pidByIdx.set(i, p.pid);
  }
  const tmap = new Map<number, { agg: Agg; rel: number }>();
  for (const t of targets) {
    const pid = pidByIdx.get(t.idx);
    if (pid !== undefined) tmap.set(pid, { agg: t.agg, rel: t.rel });
  }
  console.log(`calibrating ${tmap.size} players in the engine…`);
  calibrate(league, tmap, [
    { games: 40, damp: 0.75 },
    { games: 40, damp: 0.7 },
    { games: 60, damp: 0.6 },
    { games: 82, damp: 0.5 },
    { games: 120, damp: 0.45 },
    { games: 164, damp: 0.4 },
  ]);
  // copy back
  for (const [idx, pid] of pidByIdx) {
    const lp = league.players[pid];
    players[idx].ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, Math.round(lp.ratings[k] * 10) / 10])) as unknown as Ratings;
    if (lp.tend) players[idx].tend = { use: r3(lp.tend.use), three: r3(lp.tend.three), drive: r3(lp.tend.drive), pass: r3(lp.tend.pass) };
  }

  // sanity report: OVR vs real impact
  const rows = players
    .map((p) => ({ p, a: aggs.get(p.id), ovr: toDisplay(ovrRaw(p.ratings), league.ovrScale) }))
    .filter((x) => x.a && x.a.rawMin >= 1500);
  const corr = pearson(rows.map((x) => x.ovr), rows.map((x) => x.a!.adv.bpm));
  console.log(`OVR vs BPM correlation (1500+ min): ${corr.toFixed(3)} over ${rows.length} players`);
  const top = [...players].map((p) => ({ n: `${p.first} ${p.last}`, ovr: toDisplay(ovrRaw(p.ratings), league.ovrScale), t: p.team })).sort((a, b) => b.ovr - a.ovr).slice(0, 30);
  console.log('Top 30:', top.map((x) => `${x.n} ${x.ovr}`).join(', '));
  writeFileSync(OUT, JSON.stringify(seed));
  console.log(`wrote ${OUT} (${(JSON.stringify(seed).length / 1e6).toFixed(2)} MB)`);
}

function r3(x: number) {
  return Math.round(x * 1000) / 1000;
}

function estimateHeight(pos: Pos) {
  return { PG: 75, SG: 77, SF: 79, PF: 81, C: 83 }[pos];
}

function realAvgs(r?: PerGameRow): Record<string, number> | undefined {
  if (!r) return undefined;
  return { fga: r.fga, fg3a: r.fg3a, fta: r.fta, orb: r.orb, drb: r.drb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov, pf: r.pf, pts: r.pts };
}

function pearson(x: number[], y: number[]) {
  const n = x.length;
  if (!n) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

main();
