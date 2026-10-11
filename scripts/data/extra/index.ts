// Opening-night extras for the seed: the real schedule, future pick ownership, injuries and
// two-way contracts. Each source is optional: a missing file leaves that part to the game's
// generated defaults (generated schedule, own picks, healthy rosters, standard contracts).
import { existsSync, readFileSync } from 'node:fs';
import type { SeedData, SeedPlayer } from '../../../src/core/league/create';
import { buildOvrScale, ovrRaw, toDisplay } from '../../../src/core/ratings';
import { seasonLabel } from '../../../src/core/constants';
import { extraPath } from './sources';
import { parseNbaSchedule } from './schedule';
import { parseLdSport, projectionFromStrength, resolvePicks, type RawPickRow } from './picks';
import { attachInjuries, loadInjuries } from './injuries';
import { markTwoWays } from './twoway';
import { ALL_TEAMS } from './teams';

/** Seasons (drafts) of pick ownership to seed: next June's through seven years out. */
export const PICK_YEARS = 7;

const readJson = (key: string): unknown | null => {
  const f = extraPath(key);
  if (!existsSync(f)) {
    console.warn(`  (missing data/raw/extra/${key}; run npm run data:fetch-extra)`);
    return null;
  }
  return JSON.parse(readFileSync(f, 'utf8'));
};

/** Team strength for the projected draft order: weighted OVR of each team's top ten. */
export function teamStrength(players: SeedPlayer[]): Record<string, number> {
  const scale = buildOvrScale(players.filter((p) => p.team).map((p) => ovrRaw(p.ratings)));
  const W = [0.17, 0.15, 0.13, 0.12, 0.1, 0.09, 0.08, 0.06, 0.05, 0.05];
  const out: Record<string, number> = {};
  for (const t of ALL_TEAMS) {
    // a player out for most of the season helps his team less
    const ovr = players
      .filter((p) => p.team === t)
      .map((p) => toDisplay(ovrRaw(p.ratings), scale) - (p.injury ? (p.injury.games / 82) * 15 : 0))
      .sort((a, b) => b - a);
    out[t] = W.reduce((s, w, i) => s + w * (ovr[i] ?? 40), 0);
  }
  return out;
}

export async function applyExtras(seed: SeedData): Promise<void> {
  const season = seed.season;
  console.log('opening-night extras:');

  // schedule
  delete seed.schedule;
  const schedJson = readJson('schedule.json');
  if (schedJson) {
    const parsed = parseNbaSchedule(schedJson, season);
    if (!parsed) console.warn('  schedule: file is not the expected season; using the generated schedule');
    else {
      seed.schedule = parsed.schedule;
      const per: Record<string, number> = {};
      for (const g of parsed.schedule.games) for (const t of g.split(':')[1].split('@')) per[t] = (per[t] ?? 0) + 1;
      const counts = Object.values(per);
      console.log(`  schedule: ${parsed.schedule.games.length} regular-season games (${Math.min(...counts)}-${Math.max(...counts)} per team), ${parsed.placeholders} Cup placeholders; opening night: ${parsed.schedule.games.filter((g) => g.startsWith('0:')).map((g) => g.slice(2)).join(', ')}`);
    }
  }

  // two-way contracts (before injuries: some two-way players were unsigned in the seed)
  const swish = readJson('players.json') as { name: string; team: string; contractType?: string | null }[] | null;
  if (swish) {
    const tw = markTwoWays(seed.players, swish, seasonLabel(season));
    const per: Record<string, number> = {};
    for (const p of tw.marked) per[p.team!] = (per[p.team!] ?? 0) + 1;
    console.log(`  two-way contracts: ${tw.marked.length} marked (${Object.entries(per).map(([t, n]) => `${t}:${n}`).join(' ')})`);
    if (tw.moved.length) console.log(`    joined their two-way team: ${tw.moved.join(', ')}`);
    if (tw.missing.length) console.log(`    ${tw.missing.length} listed players aren't in the seed (no NBA or college record we use); ignored`);
  } else for (const p of seed.players) if (p.contract) delete p.contract.twoWay;

  // injuries (before picks: they feed the projected standings)
  for (const p of seed.players) delete p.injury;
  const inj = await loadInjuries(extraPath('injuries.json'), extraPath('injuries_2027.parquet'));
  if (!inj) console.warn('  injuries: no injury report (data/raw/extra/injuries.json); everyone starts healthy');
  else {
    const res = attachInjuries(seed.players, inj.rows, seed.schedule ?? null, season, inj.asOf);
    console.log(`  injuries (${inj.source}, ${inj.asOf}): ${res.applied.length} players out on opening night`);
    for (const a of res.applied.sort((x, y) => y.injury.games - x.injury.games)) {
      const back = a.injury.returnDay === null ? 'no date' : `back ~${new Date(Date.UTC(season - 1, 9, 20 + a.injury.returnDay)).toISOString().slice(0, 10)}`;
      console.log(`    ${a.team} ${a.name}: ${a.injury.type} (${a.injury.severity}), ~${a.injury.games} games, ${back}`);
    }
    if (res.unmatched.length) console.log(`    not in the seed: ${res.unmatched.join(', ')}`);
  }

  // future draft picks
  delete seed.picks;
  delete seed.picksThrough;
  const rows = readJson('draft-picks.json') as RawPickRow[] | null;
  if (rows) {
    const last = season + PICK_YEARS - 1;
    const proj = projectionFromStrength(teamStrength(seed.players), season);
    const { picks, notes } = resolvePicks(rows, proj, season, last);
    seed.picks = picks.filter((p) => p.owner !== p.original || p.protection).map((p) => ({ season: p.season, round: p.round, original: p.original, owner: p.owner, ...(p.protection ? { protection: p.protection } : {}) }));
    seed.picksThrough = last;
    console.log(`  draft picks ${season}-${last}: ${rows.length} RealGM rows → ${seed.picks.length} picks away from their original team or protected (${seed.picks.filter((p) => p.protection).length} protected)`);
    for (const n of notes) console.log(`    note: ${n}`);
    const ld = existsSync(extraPath('draft-picks-ldsport.py')) ? parseLdSport(readFileSync(extraPath('draft-picks-ldsport.py'), 'utf8')) : null;
    const mism: string[] = [];
    const lines: string[] = [];
    for (const t of ALL_TEAMS) {
      const per = [];
      for (let y = season; y <= last; y++) {
        const n = picks.filter((p) => p.season === y && p.round === 1 && p.owner === t).length;
        per.push(n);
        const l = ld?.get(`${t}:${y}`);
        if (l && (n < l.sure || n > l.max)) mism.push(`${t} ${y} (ours ${n}, LD Sport ${l.sure === l.max ? l.sure : `${l.sure}-${l.max}`})`);
      }
      const six = per.slice(0, 6).reduce((a, b) => a + b, 0);
      lines.push(`${t} ${six} [${per.join(' ')}]`);
    }
    console.log(`  first-rounders owned ${season}-${season + 5} [per year ${season}-${last}]:`);
    for (let i = 0; i < lines.length; i += 6) console.log(`    ${lines.slice(i, i + 6).join('  ')}`);
    if (ld) console.log(`  vs LD Sport's (older, hand-kept) table: ${mism.length ? `first-round counts differ for ${mism.join(', ')}` : 'first-round counts agree'}`);
  }
  seed.extrasAsOf = new Date().toISOString().slice(0, 10);
}
