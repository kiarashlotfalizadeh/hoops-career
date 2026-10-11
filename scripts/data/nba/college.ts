// 2025-26 college production for incoming rookies, from ESPN game box scores
// (sportsdataverse/hoopR-mbb-data). Used to shape a draftee's ratings (shooter, passer, rim
// protector...); his overall level still comes from draft slot and reputation.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parquetReadObjects } from 'hyparquet';
import { zstdDecompressSync } from 'node:zlib';
import { clamp } from '../../../src/core/random';
import { clampRatings, heightToRating } from '../../../src/core/ratings';
import type { Ratings, Tendencies } from '../../../src/core/types';
import { normName } from './crosswalk';
import { COLLEGE_SEASONS } from './sources';

const compressors = { ZSTD: (input: Uint8Array) => new Uint8Array(zstdDecompressSync(input)) };

export interface CollegeAgg {
  /** ESPN athlete id (the same person across seasons and transfers). */
  athleteId: string;
  name: string;
  team: string;
  teamId: string;
  season: number;
  games: number;
  min: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
  /** Team totals while the season was played (for usage-style rates). */
  teamFga: number;
  teamFta: number;
  teamTov: number;
  teamMin: number;
}

export async function loadCollege(dir: string, log = console.log): Promise<Map<string, CollegeAgg[]>> {
  const out = new Map<string, CollegeAgg[]>();
  const n = (v: unknown) => Number(v ?? 0) || 0;
  for (const season of COLLEGE_SEASONS) {
    const file = join(dir, `ncaa_player_box_${season}.parquet`);
    if (!existsSync(file)) continue;
    const buf = readFileSync(file);
    const rows = (await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), compressors })) as Record<string, unknown>[];
    const players = new Map<string, CollegeAgg>();
    const team = new Map<string, { fga: number; fta: number; tov: number; min: number }>();
    for (const r of rows) {
      if (r.did_not_play || !n(r.minutes)) continue;
      const tk = String(r.team_id);
      const t = team.get(tk) ?? { fga: 0, fta: 0, tov: 0, min: 0 };
      t.fga += n(r.field_goals_attempted);
      t.fta += n(r.free_throws_attempted);
      t.tov += n(r.turnovers);
      t.min += n(r.minutes);
      team.set(tk, t);
      const id = String(r.athlete_id);
      const p = players.get(id) ?? {
        athleteId: id,
        name: String(r.athlete_display_name ?? ''),
        team: String(r.team_display_name ?? ''),
        teamId: tk,
        season,
        games: 0,
        min: 0,
        fgm: 0,
        fga: 0,
        tpm: 0,
        tpa: 0,
        ftm: 0,
        fta: 0,
        orb: 0,
        drb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        pf: 0,
        pts: 0,
        teamFga: 0,
        teamFta: 0,
        teamTov: 0,
        teamMin: 0,
      };
      p.games++;
      p.min += n(r.minutes);
      p.fgm += n(r.field_goals_made);
      p.fga += n(r.field_goals_attempted);
      p.tpm += n(r.three_point_field_goals_made);
      p.tpa += n(r.three_point_field_goals_attempted);
      p.ftm += n(r.free_throws_made);
      p.fta += n(r.free_throws_attempted);
      p.orb += n(r.offensive_rebounds);
      p.drb += n(r.defensive_rebounds);
      p.ast += n(r.assists);
      p.stl += n(r.steals);
      p.blk += n(r.blocks);
      p.tov += n(r.turnovers);
      p.pf += n(r.fouls);
      p.pts += n(r.points);
      players.set(id, p);
    }
    for (const p of players.values()) {
      const t = team.get(p.teamId);
      if (t) Object.assign(p, { teamFga: t.fga, teamFta: t.fta, teamTov: t.tov, teamMin: t.min });
      const k = normName(p.name);
      (out.get(k) ?? out.set(k, []).get(k)!).push(p);
    }
    log(`  college ${season}: ${players.size} players from ${rows.length} box scores`);
  }
  return out;
}

/** Per-40 rates and percentages used for z-scores. */
function feats(c: CollegeAgg) {
  const p40 = (x: number) => (x / Math.max(1, c.min)) * 40;
  const usg = c.teamMin ? ((c.fga + 0.44 * c.fta + c.tov) * (c.teamMin / 5)) / (c.min * (c.teamFga + 0.44 * c.teamFta + c.teamTov)) : 0.2;
  const two = c.fga - c.tpa;
  return {
    usg,
    tp: (c.tpm + 0.34 * 60) / (c.tpa + 60),
    tpa40: Math.log1p(p40(c.tpa)),
    two: (c.fgm - c.tpm + 0.5 * 60) / (two + 60),
    ft: (c.ftm + 0.72 * 40) / (c.fta + 40),
    fta40: Math.log1p(p40(c.fta)),
    ftr: c.fga ? c.fta / c.fga : 0,
    ast40: p40(c.ast),
    tov40: p40(c.tov),
    orb40: p40(c.orb),
    drb40: p40(c.drb),
    stl40: p40(c.stl),
    blk40: p40(c.blk),
    ts: c.pts / Math.max(1, 2 * (c.fga + 0.44 * c.fta)),
    tpar: c.fga ? c.tpa / c.fga : 0,
  };
}

export interface CollegePop {
  mean: Record<string, number>;
  sd: Record<string, number>;
}

export function collegePop(all: Map<string, CollegeAgg[]>): CollegePop {
  const pool = [...all.values()].flat().filter((c) => c.min >= 400);
  const fs = pool.map(feats);
  const mean: Record<string, number> = {};
  const sd: Record<string, number> = {};
  for (const k of Object.keys(fs[0] ?? {})) {
    const v = fs.map((f) => (f as Record<string, number>)[k]);
    mean[k] = v.reduce((a, b) => a + b, 0) / v.length;
    sd[k] = Math.sqrt(v.reduce((a, b) => a + (b - mean[k]) ** 2, 0) / v.length) || 1;
  }
  return { mean, sd };
}

/**
 * Pick the right college player for a name (two players can share one) and return his latest
 * season. Roster pages list every school a transfer attended ("Santa Clara, Ohio State"), so a
 * season at any of them identifies him, and his latest season may be at a school spelled
 * differently ("UNC" for North Carolina).
 */
export function findCollege(all: Map<string, CollegeAgg[]>, name: string, college?: string): CollegeAgg | undefined {
  const c = (all.get(normName(name)) ?? []).filter((x) => x.min >= 100);
  if (!c.length) return undefined;
  const wants = (college ?? '')
    .toLowerCase()
    .split(',')
    .map((s) => s.trim().split(' ')[0])
    .filter(Boolean);
  const ranked = [...c].sort((a, b) => b.season - a.season || b.min - a.min);
  const hit = ranked.find((x) => wants.some((w) => x.team.toLowerCase().includes(w)));
  return hit ? ranked.find((x) => x.athleteId === hit.athleteId) : ranked[0];
}

/**
 * Ratings shaped by college production. The level is arbitrary here: the seed builder shifts
 * every skill together to the draft-slot target, so only the relative strengths matter.
 */
export function collegeRatings(c: CollegeAgg, pop: CollegePop, heightIn: number, weightLb: number, age: number): { r: Ratings; tend: Tendencies } {
  const f = feats(c) as Record<string, number>;
  const rel = c.min / (c.min + 300);
  const z = (k: string) => clamp(((f[k] - pop.mean[k]) / pop.sd[k]) * rel, -3, 3.5);
  const h = heightToRating(heightIn || 79);
  const hz = (h - 50) / 15;
  const wz = ((weightLb || 215) - 215) / 25;
  const youth = clamp(23 - age, 0, 5);
  const r: Ratings = {
    hgt: h,
    spd: 70 - 0.42 * h + 4 * z('stl40') + 2 * z('ftr') + youth,
    ath: 52 + 4 * z('blk40') + 3 * z('orb40') + 3 * z('ftr') - 0.05 * h + youth,
    str: 44 + 10 * wz + 3 * hz - youth,
    end: 45,
    ins: 48 + 7 * z('two') + 4 * z('ftr') + 3 * hz,
    mid: 46 + 6 * z('ft') + 3 * z('tpa40') + 3 * z('usg') - 2 * hz,
    tp: 45 + 9 * z('tp') + 9 * z('tpa40'),
    ft: clamp((f.ft - 0.42) / 0.0052, 1, 100),
    hnd: 48 + 6 * z('usg') + 6 * z('ast40') - 3 * z('tov40') - 5 * hz,
    pas: 48 + 11 * z('ast40') - 2 * z('tov40'),
    oiq: 46 + 5 * z('ts') + 3 * z('ast40') - 2 * z('tov40'),
    drw: 46 + 9 * z('fta40') + 3 * z('ftr'),
    post: 28 + 8 * hz + 5 * z('usg') + 4 * wz - 4 * z('tpar'),
    perD: 48 + 5 * z('stl40') - 3 * hz,
    intD: 44 + 6 * z('blk40') + 6 * hz + 3 * z('drb40'),
    stl: 48 + 12 * z('stl40'),
    blk: 44 + 12 * z('blk40') + 4 * hz,
    diq: 46 + 3 * z('stl40') + 3 * z('blk40') + 2 * z('drb40'),
    oreb: 46 + 12 * z('orb40') + 3 * hz,
    dreb: 46 + 12 * z('drb40') + 3 * hz,
  };
  const tend: Tendencies = {
    use: clamp(Math.pow(Math.max(0.1, f.usg) / 0.2, 1.1), 0.4, 2.4),
    three: clamp((f.tpar + 0.03) / 0.41, 0.03, 2.6),
    drive: clamp(Math.pow((f.ftr + 0.05) / 0.4, 0.6), 0.5, 2),
    pass: clamp(Math.pow(Math.max(0.5, f.ast40) / 3.5, 0.6), 0.5, 2),
  };
  return { r: clampRatings(r), tend };
}
