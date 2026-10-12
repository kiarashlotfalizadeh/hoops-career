// Build src/data/seed.json from cached Basketball Reference pages (run data:fetch first).
//
// Inputs: per-game + advanced tables for 2023-24, 2024-25, 2025-26; the current contracts
// table (who plays where in 2026-27 and their salaries); team roster pages (height, weight,
// birth date, jersey, country, college); draft pages (draft slot).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEED_SEASON, STAT_SEASONS, ROSTER_SEASONS, DRAFT_YEARS, TEAM_CODES } from './sources';
import {
  countryName,
  parseAdvanced,
  parseContracts,
  parseDraft,
  parsePerGame,
  parseRoster,
  seedDraft,
  type AdvRow,
  type ContractRow,
  type DraftRow,
  type PerGameRow,
  type RosterRow,
} from './parse';
import { PROSPECT_HINTS, aggregate, deriveRatings, popStats, prospectRatings, type Agg } from './derive';
import { calibrate } from './calibrate';
import { buildNbaProfile } from './nba/build';
import { profilesByBbref, type PbpAgg } from './nba/profile';
import { NBA_RAW } from './nba/fetch';
import { collegePop, collegeRatings, findCollege, loadCollege } from './nba/college';
import { refreshPlayerDerived } from '../../src/core/playerGen';
import type { PlayerStats, Pos, Ratings, Tendencies } from '../../src/core/types';
import type { SeedData, SeedPlayer } from '../../src/core/league/create';
import { createLeague, defaultSettings } from '../../src/core/league/create';
import { BBREF_TO_TID } from '../../src/core/teams';
import { RATING_KEYS, buildOvrScale, ovrRaw, shiftToOvr, toDisplay } from '../../src/core/ratings';
import { clamp } from '../../src/core/random';
import { CAP, seasonLabel } from '../../src/core/constants';
import { COMBINED, inferPosition, statsPosition } from './positions';
import { applyExtras } from './extra/index';

const RAW = process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw');
const OUT = process.env.HC_SEED_OUT ?? join(process.cwd(), 'src', 'data', 'seed.json');
const read = (key: string) => {
  const f = join(RAW, `${key}.html`);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};

async function main() {
  const contractsHtml = read('contracts');
  if (!contractsHtml) {
    console.error(`Missing ${join(RAW, 'contracts.html')}. Run \`npm run data:fetch\` first.`);
    process.exit(1);
  }
  const contracts = parseContracts(contractsHtml);
  console.log(`contracts: ${contracts.length} players (first column ${contracts[0]?.firstSeasonLabel || '?'})`);

  const perGame: PerGameRow[] = [];
  const adv: AdvRow[] = [];
  for (const s of STAT_SEASONS) {
    const pg = read(`per_game_${s}`);
    const ad = read(`advanced_${s}`);
    if (!pg || !ad) {
      console.error(`Missing stats for ${s}.`);
      process.exit(1);
    }
    const parsed = parsePerGame(pg, s);
    perGame.push(...parsed.rows);
    adv.push(...parseAdvanced(ad, s));
    console.log(`season ${s}: ${parsed.rows.length} per-game rows`);
  }
  const rosters: RosterRow[] = [];
  const noRoster: string[] = [];
  for (const s of ROSTER_SEASONS)
    for (const t of TEAM_CODES) {
      const html = read(`roster_${t}_${s}`);
      const rows = html ? parseRoster(html, t, s) : [];
      if (!rows.length) noRoster.push(`${t} ${s}${html ? ' (empty)' : ''}`);
      rosters.push(...rows);
    }
  const drafts: DraftRow[] = [];
  const noDraftPage: number[] = [];
  for (const y of DRAFT_YEARS) {
    const html = read(`draft_${y}`);
    if (html) drafts.push(...parseDraft(html, y));
    else noDraftPage.push(y);
  }
  console.log(`rosters: ${rosters.length} rows, drafts: ${drafts.length} picks`);
  if (noRoster.length) console.warn(`  no roster rows for ${noRoster.join(', ')}: their players get no bio, jersey or position from those pages`);
  if (noDraftPage.length) console.warn(`  no draft page for ${noDraftPage.join(', ')}: players drafted then are seeded as undrafted`);

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
  for (const r of rosters.sort((a, b) => a.season - b.season)) {
    // later season wins, but offseason pages leave uniform numbers blank: keep the last known one
    const prev = rosterById.get(r.id);
    rosterById.set(r.id, prev && !r.jersey && prev.jersey ? { ...r, jersey: prev.jersey } : r);
  }
  const draftById = new Map(drafts.map((d) => [d.id, d]));
  // five-position labels from roster pages (last season's pages have them; current ones say G/F/C)
  const rosterFive = new Map<string, string>();
  for (const r of rosters) if (['PG', 'SG', 'SF', 'PF', 'C'].includes(r.posRaw)) rosterFive.set(r.id, r.posRaw);
  /** Players whose position is inferred from G/F/C + ratings (re-inferred after calibration). */
  const inferredPos = new Map<number, string>();
  // a waived player's dead money is listed like a contract: drop rows under the minimum salary for
  // players on no current-season roster page (two-way and minimum deals are on one)
  const current = new Set(rosters.filter((r) => r.season === SEED_SEASON).map((r) => r.id));
  const deadMoney = contracts.filter((c) => current.size > 0 && (c.salaries[0] ?? 0) < CAP.minContract && !current.has(c.id));
  if (deadMoney.length) console.log(`  dead money, not seeded as contracts: ${deadMoney.map((c) => `${c.name} (${c.team} $${c.salaries[0] ?? 0}K)`).join(', ')}`);
  const signed = contracts.filter((c) => !deadMoney.includes(c));
  const contractById = new Map<string, ContractRow>(signed.map((c) => [c.id, c]));

  // universe: everyone under contract + recent rotation players who are unsigned
  const ids = new Set<string>(signed.map((c) => c.id));
  const fa = [...pgById.entries()]
    .filter(([id, rows]) => !ids.has(id) && rows.some((r) => r.season === SEED_SEASON - 1 && r.g * r.mp >= 250))
    .map(([id, rows]) => ({ id, min: rows.filter((r) => r.season === SEED_SEASON - 1 && !COMBINED.test(r.team)).reduce((a, r) => a + r.g * r.mp, 0) }))
    .sort((a, b) => b.min - a.min)
    .slice(0, 140);
  for (const f of fa) ids.add(f.id);

  // NBA.com play-by-play profiles (shot zones, creation, defense, RAPM), if downloaded
  let pbpById = new Map<string, PbpAgg>();
  let prof: Awaited<ReturnType<typeof buildNbaProfile>> | null = null;
  if (existsSync(join(NBA_RAW, `cdnnba_${STAT_SEASONS[STAT_SEASONS.length - 1] - 1}.tar.xz`))) {
    console.log('NBA.com play-by-play:');
    prof = await buildNbaProfile();
    pbpById = profilesByBbref(
      prof,
      perGame.map((r) => ({ id: r.id, name: r.name, season: r.season, team: r.team })),
    );
  } else console.log('NBA.com play-by-play not found (npm run data:fetch-nba); using box scores only');

  // college production for rookies and recent draftees
  const college = await loadCollege(NBA_RAW);
  const cpop = college.size ? collegePop(college) : null;
  let collegeUsed = 0;

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
    if (a) {
      a.pbp = pbpById.get(id);
      aggs.set(id, a);
    }
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
    else if (dr)
      bornYear = dr.year - 19; // drafted at about 19
    else bornYear = SEED_SEASON - 21;
    const age = SEED_SEASON - bornYear;
    // box-score position (latest season, main team), else last season's roster page, else
    // inferred from the G/F/C label, size and skills once ratings exist
    const fivePos = (statsPosition(rows) ?? rosterFive.get(id) ?? null) as Pos | null;
    const label = (ros?.posRaw || ros?.pos || '').toUpperCase();
    const pos: Pos = fivePos ?? ({ G: 'SG', F: 'SF', C: 'C' } as Record<string, Pos>)[label[0]] ?? 'SF';
    const heightIn = ros?.heightIn || estimateHeight(pos);
    const weightLb = ros?.weightLb || 215;
    const agg = aggs.get(id);
    // no usable NBA sample: shape from college production when we have it, else draft slot + profile
    const prior = () => {
      const col = cpop && age <= 24 ? findCollege(college, name, dr?.college || ros?.college) : undefined;
      if (col && cpop) {
        collegeUsed++;
        return collegeRatings(col, cpop, heightIn, weightLb, age);
      }
      return prospectRatings({ heightIn, weightLb, age, pos }, dr?.pick ?? null, id, PROSPECT_HINTS[name]);
    };
    let ratings: Ratings;
    let tend: Tendencies;
    let rel = 0;
    if (agg && agg.rawMin >= 60) {
      const d = deriveRatings(agg, { heightIn, weightLb, age, pos }, pop, id);
      rel = d.rel;
      if (agg.rawMin < 400) {
        // thin NBA sample: blend with a draft-slot / college prior
        const pr = prior();
        const w = agg.rawMin / 400;
        ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, d.r[k] * w + pr.r[k] * (1 - w)])) as unknown as Ratings;
      } else ratings = d.r;
      tend = d.tend;
    } else {
      const pr = prior();
      ratings = pr.r;
      tend = pr.tend;
    }
    const nbaId = pbpById.get(id)?.nbaId;
    const seasonFga = (s: number) => rows.filter((r) => r.season === s && !COMBINED.test(r.team)).reduce((a, r) => a + r.fga * r.g, 0);
    const stats: PlayerStats[] = rows
      .filter((r) => !COMBINED.test(r.team))
      .map((r) => {
        // real shot locations from NBA.com, split across teams by shot volume
        const sp = nbaId && prof ? prof.players[prof.seasons.indexOf(r.season)]?.[nbaId] : undefined;
        const share = sp ? (r.fga * r.g) / Math.max(1, seasonFga(r.season)) : 0;
        const zn = (x: number) => Math.round(x * share);
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
          rimM: sp ? zn(sp.fgm.rim) : 0,
          rimA: sp ? zn(sp.fga.rim) : 0,
          midM: sp ? zn(sp.fgm.mid) : 0,
          midA: sp ? zn(sp.fga.mid) : 0,
          onPoss: 0,
          onPtsFor: 0,
          onPtsAgainst: 0,
          teamFga: 0,
          teamFta: 0,
          teamTov: 0,
          adv: a
            ? {
                per: a.per,
                ts: a.ts,
                usg: a.usgPct,
                astPct: a.astPct,
                trbPct: a.trbPct,
                stlPct: a.stlPct,
                blkPct: a.blkPct,
                tovPct: a.tovPct,
                ws: a.ws,
                ws48: a.ws48,
                obpm: a.obpm,
                dbpm: a.dbpm,
                bpm: a.bpm,
                vorp: a.vorp,
              }
            : undefined,
        };
      });
    const lastOpt = c?.options[c.options.length - 1];
    if (!fivePos) inferredPos.set(players.length, label);
    const sp: SeedPlayer = {
      id,
      nbaId,
      first,
      last,
      pos: fivePos ?? inferPosition(label, heightIn, ratings),
      heightIn,
      weightLb,
      bornYear,
      country: countryName(ros?.country),
      college: ros?.college || dr?.college || '',
      jersey: ros?.jersey ?? '',
      team: c ? c.team : null,
      contract: c && c.salaries.length ? { salaries: c.salaries, option: lastOpt === 'player' || lastOpt === 'team' ? lastOpt : undefined } : null,
      draft: seedDraft(dr, ros),
      ratings,
      tend,
      stats,
    };
    if (agg && agg.rawMin >= 300) targets.push({ idx: players.length, agg, rel });
    players.push(sp);
  }
  console.log(
    `players: ${players.length} (${players.filter((p) => p.team).length} under contract, ${players.filter((p) => !p.team).length} free agents); ${collegeUsed} shaped by college stats`,
  );
  const noBio = players.filter((p) => p.team && !rosterById.has(p.id));
  if (noBio.length) console.warn(`  under contract but on no roster page (size, age and country estimated): ${noBio.map((p) => `${p.first} ${p.last} (${p.team})`).join(', ')}`);
  // experience comes from the draft year, so every player needs one: undrafted players get their entry class
  const undrafted = players.filter((p) => p.draft && !p.draft.round);
  const early = undrafted.filter((p) => p.draft!.year < DRAFT_YEARS[0]);
  console.log(
    `draft: ${players.filter((p) => p.draft?.round).length} drafted, ${undrafted.length} undrafted, ${players.filter((p) => !p.draft).length} unknown (no draft or roster row)`,
  );
  if (early.length) console.warn(`  entered the league before ${DRAFT_YEARS[0]} (drafted then? add earlier DRAFT_YEARS): ${early.map((p) => `${p.first} ${p.last}`).join(', ')}`);
  const teamCounts: Record<string, number> = {};
  for (const p of players) if (p.team) teamCounts[p.team] = (teamCounts[p.team] ?? 0) + 1;
  console.log(
    'roster sizes:',
    Object.entries(teamCounts)
      .map(([t, n]) => `${t}:${n}`)
      .join(' '),
  );

  // level players with little or no NBA sample before calibrating, so the AI coaches hand
  // out realistic minutes during the calibration games
  const levelTargets = new Map<string, number>();
  levelPlayers(players, aggs, levelTargets, false);

  // calibrate in the engine
  const seed: SeedData = {
    version: 1,
    generated: new Date().toISOString(),
    source: `Basketball Reference: ${seasonLabel(STAT_SEASONS[0])} to ${seasonLabel(SEED_SEASON - 1)} per-game & advanced; current contracts`,
    season: SEED_SEASON,
    players,
  };
  const league = createLeague({ name: 'calib', userTid: 0, coachName: 'x', settings: { ...defaultSettings(), injuries: false }, seed, rngSeed: 99, preseasonCuts: false });
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
    { games: 60, damp: 0.65 },
    { games: 60, damp: 0.6 },
    { games: 82, damp: 0.55 },
    { games: 82, damp: 0.5 },
    { games: 120, damp: 0.45 },
    { games: 164, damp: 0.4 },
  ]);
  // copy back
  for (const [idx, pid] of pidByIdx) {
    const lp = league.players[pid];
    players[idx].ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, Math.round(lp.ratings[k] * 10) / 10])) as unknown as Ratings;
    if (lp.tend) {
      const t = lp.tend;
      players[idx].tend = { use: r3(t.use), three: r3(t.three), drive: r3(t.drive), pass: r3(t.pass) };
      for (const k of ['blk', 'stl', 'orb', 'drb', 'tov', 'pf', 'mid', 'corner', 'create'] as const) if (t[k] !== undefined) players[idx].tend![k] = r3(t[k]!);
    }
  }

  levelPlayers(players, aggs, levelTargets, true);
  // leveling moves role players' skills, which shifts usage around them: settle again
  for (const [idx, pid] of pidByIdx) league.players[pid].ratings = { ...players[idx].ratings };
  league.ovrScale = buildOvrScale(
    Object.values(league.players)
      .filter((p) => p.tid >= 0)
      .map((p) => ovrRaw(p.ratings)),
  );
  for (const p of Object.values(league.players)) refreshPlayerDerived(p, league.season, league.ovrScale);
  calibrate(league, tmap, [
    { games: 82, damp: 0.5 },
    { games: 120, damp: 0.45 },
    { games: 164, damp: 0.4 },
  ]);
  for (const [idx, pid] of pidByIdx) {
    const lp = league.players[pid];
    players[idx].ratings = Object.fromEntries(RATING_KEYS.map((k) => [k, Math.round(lp.ratings[k] * 10) / 10])) as unknown as Ratings;
    if (lp.tend) players[idx].tend = Object.fromEntries(Object.entries(lp.tend).map(([k, v]) => [k, r3(v as number)])) as unknown as Tendencies;
  }

  // positions inferred from ratings follow the calibrated ratings
  for (const [idx, label] of inferredPos) players[idx].pos = inferPosition(label, players[idx].heightIn, players[idx].ratings);
  const posCount: Record<string, number> = {};
  const rostered = players.filter((p) => p.team);
  for (const p of rostered) posCount[p.pos] = (posCount[p.pos] ?? 0) + 1;
  console.log(
    `positions (under contract): ${['PG', 'SG', 'SF', 'PF', 'C'].map((k) => `${k} ${posCount[k] ?? 0} (${Math.round(((posCount[k] ?? 0) / rostered.length) * 100)}%)`).join(', ')}; ${inferredPos.size} inferred from G/F/C + ratings`,
  );
  const spot = ['gilgesh01', 'willija06', 'willike04', 'carusal01', 'topicni01', 'brunsja01', 'jokicni01', 'jamesle01', 'tatumja01'];
  console.log(
    `  e.g. ${spot
      .map((id) => players.find((p) => p.id === id))
      .filter((p) => p)
      .map((p) => `${p!.first} ${p!.last} ${p!.pos}`)
      .join(', ')}`,
  );

  // sanity report: OVR vs real impact
  const finalScale = buildOvrScale(players.filter((p) => p.team).map((p) => ovrRaw(p.ratings)));
  const rows = players.map((p) => ({ p, a: aggs.get(p.id), ovr: toDisplay(ovrRaw(p.ratings), finalScale) })).filter((x) => x.a && x.a.rawMin >= 1500);
  const corr = pearson(
    rows.map((x) => x.ovr),
    rows.map((x) => x.a!.adv.bpm),
  );
  console.log(`OVR vs BPM correlation (1500+ min): ${corr.toFixed(3)} over ${rows.length} players`);
  const rr = rows.filter((x) => x.a!.pbp);
  if (rr.length)
    console.log(
      `OVR vs RAPM correlation (1500+ min): ${pearson(
        rr.map((x) => x.ovr),
        rr.map((x) => x.a!.pbp!.rapmO + x.a!.pbp!.rapmD),
      ).toFixed(3)} over ${rr.length} players`,
    );
  const top = [...players]
    .map((p) => ({ n: `${p.first} ${p.last}`, ovr: toDisplay(ovrRaw(p.ratings), finalScale), t: p.team }))
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 30);
  console.log('Top 30:', top.map((x) => `${x.n} ${x.ovr}`).join(', '));
  if (process.env.HC_REPORT) {
    const report = players.map((p) => {
      const a = aggs.get(p.id);
      return {
        id: p.id,
        name: `${p.first} ${p.last}`,
        team: p.team,
        age: SEED_SEASON - p.bornYear,
        pick: p.draft?.round ? (p.draft.round - 1) * 30 + p.draft.pick : null,
        rawMin: a?.rawMin ?? 0,
        wMin: a?.wMin ?? 0,
        mpg: a?.mpg ?? 0,
        adv: a?.adv ?? null,
        per36: a?.per36 ?? null,
        rapm: a?.pbp ? { o: a.pbp.rapmO, d: a.pbp.rapmD, poss: a.pbp.rapmPoss } : null,
        ratings: p.ratings,
        tend: p.tend,
      };
    });
    writeFileSync(process.env.HC_REPORT, JSON.stringify({ ovrScale: finalScale, players: report }));
  }
  await applyExtras(seed);
  writeFileSync(OUT, JSON.stringify(seed));
  console.log(`wrote ${OUT} (${(JSON.stringify(seed).length / 1e6).toFixed(2)} MB)`);
}

/** Display OVR expected from draft slot and reputation alone (no NBA sample). */
function priorOvr(sp: SeedPlayer): number {
  const age = SEED_SEASON - sp.bornYear;
  // overall pick; round 0 is undrafted
  const pick = sp.draft?.round ? (sp.draft.round - 1) * 30 + sp.draft.pick : null;
  const bump = (PROSPECT_HINTS[`${sp.first} ${sp.last}`.trim()]?.bump ?? 0) * 8;
  const yearsSince = sp.draft ? Math.max(0, SEED_SEASON - 1 - sp.draft.year) : 0;
  if (age <= 23 && yearsSince <= 2) {
    const base = pick === null ? 61 : pick <= 30 ? 78 - 9 * Math.pow((pick - 1) / 29, 0.8) : 65.5 - (4 * (pick - 31)) / 29;
    return base + bump + yearsSince * 1.5;
  }
  // veterans without recent NBA minutes: overseas returns, long injuries, camp invites
  return 64 + (pick !== null && pick <= 14 ? 4 : pick !== null && pick <= 30 ? 2 : 0) - Math.max(0, age - 31) * 1.5;
}

/**
 * Regress small samples. No NBA minutes: draft slot / reputation. Under 400 minutes: blend
 * toward that prior. Otherwise (after calibration only) shrink toward the level typical for
 * the player's minutes per game, with weight minutes / (minutes + 500), so a hot 1,500-minute
 * stretch counts for less than three full seasons. Targets are fixed on first sight; later
 * passes only re-hit them as the display scale moves.
 */
function levelPlayers(players: SeedPlayer[], aggs: Map<string, Agg>, targets: Map<string, number>, calibrated: boolean) {
  const scaleNow = () => buildOvrScale(players.filter((p) => p.team).map((p) => ovrRaw(p.ratings)));
  let scale = scaleNow();
  const disp = (p: SeedPlayer) => toDisplay(ovrRaw(p.ratings), scale);
  if (calibrated) {
    // OVR as a function of minutes per game, fitted on reliable samples
    const fitRows = players.map((p) => ({ a: aggs.get(p.id), o: disp(p) })).filter((x) => x.a && x.a.rawMin >= 2500);
    const mx = fitRows.reduce((s, x) => s + x.a!.mpg, 0) / fitRows.length;
    const my = fitRows.reduce((s, x) => s + x.o, 0) / fitRows.length;
    const slope = fitRows.reduce((s, x) => s + (x.a!.mpg - mx) * (x.o - my), 0) / fitRows.reduce((s, x) => s + (x.a!.mpg - mx) ** 2, 0);
    console.log(`leveling: OVR ≈ ${my.toFixed(1)} + ${slope.toFixed(2)} × (MPG − ${mx.toFixed(1)}) on ${fitRows.length} reliable players`);
    for (const p of players) {
      const a = aggs.get(p.id);
      if (!a || a.rawMin < 400 || targets.has(p.id)) continue;
      const rel = a.rawMin / (a.rawMin + 500);
      targets.set(p.id, Math.round(rel * disp(p) + (1 - rel) * (my + slope * (a.mpg - mx))));
    }
  } else {
    for (const p of players) {
      const a = aggs.get(p.id);
      if (!a || a.rawMin < 60) {
        targets.set(p.id, Math.round(priorOvr(p)));
        // stamina sets sustainable minutes; a prospect's should match the role his level earns
        p.ratings.end = clamp(Math.round(42 + (priorOvr(p) - 70) * 1.2), 30, 60);
      } else if (a.rawMin < 400) targets.set(p.id, Math.round((a.rawMin / 400) * disp(p) + (1 - a.rawMin / 400) * priorOvr(p)));
    }
  }
  let moved = 0;
  for (let iter = 0; iter < 3; iter++) {
    moved = 0;
    for (const p of players) {
      const t = targets.get(p.id);
      if (t === undefined || disp(p) === t) continue;
      p.ratings = shiftToOvr(p.ratings, t, scale);
      moved++;
    }
    scale = scaleNow();
  }
  console.log(`leveling: ${targets.size} targets, ${moved} still moving on the last pass`);
}

function r3(x: number) {
  return Math.round(x * 1000) / 1000;
}

function estimateHeight(pos: Pos) {
  return { PG: 75, SG: 77, SF: 79, PF: 81, C: 83 }[pos];
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

void main();
