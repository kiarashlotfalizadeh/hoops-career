// Advanced numbers for seasons played in this league, computed as Basketball Reference documents
// them from the box score totals the save keeps: PER (Hollinger's, pace-adjusted and normalized so
// the league's minutes-weighted average is 15), win shares (Dean Oliver's points produced and
// individual defensive rating, against the league's points per possession, in the season's points
// per win) and the rate stats (assist, rebound, steal, block, turnover and usage percentages).
// Imported real seasons carry Basketball Reference's own numbers and are never recomputed. Only the
// regular season: the teams' totals that PER and win shares are measured against aren't kept for the
// playoffs. Box plus-minus isn't computed: its regression's coefficients aren't reproduced here, so
// BPM and VORP stay the imported seasons'. Pure reads of the league.

import type { League, Player, PlayerStats, TeamSeason, TeamTotals } from '../types';

export interface Advanced {
  per: number;
  ows: number;
  dws: number;
  ws: number;
  ws48: number;
  /** Points produced and allowed per 100 possessions (Oliver's individual offensive and defensive ratings). */
  ortg: number;
  drtg: number;
  /** Percentages, 0-100 as Basketball Reference shows them. */
  astPct: number;
  orbPct: number;
  drbPct: number;
  trbPct: number;
  stlPct: number;
  blkPct: number;
  tovPct: number;
  usg: number;
}

interface TeamCtx {
  ts: TeamSeason;
  /** Team minutes: five on the floor for 48 a game (overtime isn't kept with the team's season). */
  mp: number;
  /** Possessions as Basketball Reference estimates them from the box (each side's, averaged), and the pace they make. */
  poss: number;
  pace: number;
}

/** Basketball Reference's possession estimate for a team's season: each side's from its box, averaged. */
function boxPoss(t: TeamTotals, o: TeamTotals): number {
  const side = (a: TeamTotals, b: TeamTotals) => a.fga + 0.4 * a.fta - 1.07 * (a.orb / Math.max(1, a.orb + b.drb)) * (a.fga - a.fgm) + a.tov;
  return 0.5 * (side(t, o) + side(o, t));
}

interface SeasonCtx {
  teams: Map<number, TeamCtx>;
  lg: TeamTotals;
  lgPoss: number;
  lgGames: number;
  lgPace: number;
  factor: number;
  vop: number;
  drbShare: number;
  /** The minutes-weighted average pace-adjusted PER before normalizing (15 after). */
  lgAper: number;
}

const blank = (): TeamTotals => ({ fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 });

const cache = new WeakMap<League, Map<number, { key: string; ctx: SeasonCtx | null }>>();

/** The league's and the teams' totals for a season, with PER's league factors (worked out once a game day). */
function seasonCtx(league: League, season: number): SeasonCtx | null {
  // a finished season doesn't change; the current one does with every game
  const key = season === league.season ? `${league.games.length}|${league.day}|${league.phase}` : 'done';
  const bySeason = cache.get(league) ?? cache.set(league, new Map()).get(league)!;
  const hit = bySeason.get(season);
  if (hit && hit.key === key) return hit.ctx;
  const ctx = buildCtx(league, season);
  bySeason.set(season, { key, ctx });
  return ctx;
}

function buildCtx(league: League, season: number): SeasonCtx | null {
  const teams = new Map<number, TeamCtx>();
  const lg = blank();
  let lgPoss = 0;
  let lgGames = 0;
  for (const t of league.teams) {
    const ts = t.seasons.find((s) => s.season === season);
    const g = ts ? ts.won + ts.lost : 0;
    if (!ts || !g) continue;
    const mp = 240 * g;
    const poss = boxPoss(ts.t, ts.o);
    teams.set(t.tid, { ts, mp, poss, pace: (48 * poss) / (mp / 5) });
    for (const k of Object.keys(lg) as (keyof TeamTotals)[]) lg[k] += ts.t[k];
    lgPoss += poss;
    lgGames += g;
  }
  if (!teams.size || !lg.fgm || !lg.fga) return null;
  const lgPace = (48 * lgPoss) / ((240 * lgGames) / 5);
  const lgTrb = lg.orb + lg.drb;
  const ctx: SeasonCtx = {
    teams,
    lg,
    lgPoss,
    lgGames,
    lgPace,
    factor: 2 / 3 - (0.5 * (lg.ast / lg.fgm)) / (2 * (lg.fgm / Math.max(1, lg.ftm))),
    vop: lg.pts / (lg.fga - lg.orb + lg.tov + 0.44 * lg.fta),
    drbShare: lgTrb ? (lgTrb - lg.orb) / lgTrb : 0.75,
    lgAper: 1,
  };
  // the league's minutes-weighted pace-adjusted PER, over every line played for a team that season
  let sum = 0;
  let min = 0;
  for (const p of Object.values(league.players))
    for (const s of p.stats) {
      if (s.season !== season || s.playoffs || s.real || !(s.min > 0)) continue;
      const a = aper(ctx, s);
      if (a === null) continue;
      sum += a * s.min;
      min += s.min;
    }
  ctx.lgAper = min > 0 && sum > 0 ? sum / min : 1;
  return ctx;
}

/** Hollinger's unadjusted PER for one team's line, adjusted to the league's pace (null without the team's season). */
function aper(c: SeasonCtx, s: PlayerStats): number | null {
  const tm = c.teams.get(s.tid);
  if (!tm || !(s.min > 0)) return null;
  const t = tm.ts.t;
  const lg = c.lg;
  const astFg = t.fgm ? t.ast / t.fgm : 0;
  const trb = s.orb + s.drb;
  const { vop, drbShare: d, factor } = c;
  const u =
    (1 / s.min) *
    (s.tpm +
      (2 / 3) * s.ast +
      (2 - factor * astFg) * s.fgm +
      s.ftm * 0.5 * (1 + (1 - astFg) + (2 / 3) * astFg) -
      vop * s.tov -
      vop * d * (s.fga - s.fgm) -
      vop * 0.44 * (0.44 + 0.56 * d) * (s.fta - s.ftm) +
      vop * (1 - d) * (trb - s.orb) +
      vop * d * s.orb +
      vop * s.stl +
      vop * d * s.blk -
      s.pf * (lg.ftm / lg.pf - 0.44 * (lg.fta / lg.pf) * vop));
  return tm.pace > 0 ? (c.lgPace / tm.pace) * u : u;
}

/** One team's line: everything but PER's normalization, with the parts the season's totals combine (points produced and possessions). */
function lineAdvanced(c: SeasonCtx, s: PlayerStats) {
  const tm = c.teams.get(s.tid);
  if (!tm || !(s.min > 0)) return null;
  const { ts, mp: tmMp, poss: defPoss } = tm;
  const t = ts.t;
  const o = ts.o;
  const mp = s.min;
  const share = mp / (tmMp / 5);
  const lgPpp = c.lg.pts / Math.max(1, c.lgPoss);
  const ptsPerWin = 0.32 * (c.lg.pts / Math.max(1, c.lgGames)) * (tm.pace / Math.max(1e-9, c.lgPace));
  const safe = (x: number) => (Number.isFinite(x) ? x : 0);

  // offense: points produced and possessions used (Oliver)
  const qAst = safe(share * (1.14 * ((t.ast - s.ast) / t.fgm)) + (((t.ast / tmMp) * mp * 5 - s.ast) / ((t.fgm / tmMp) * mp * 5 - s.fgm)) * (1 - share));
  const fgShare = s.fga ? (s.pts - s.ftm) / (2 * s.fga) : 0;
  const fgPart = s.fgm * (1 - 0.5 * fgShare * qAst);
  const othersFga = t.fga - s.fga;
  const astPart = othersFga > 0 ? 0.5 * ((t.pts - t.ftm - (s.pts - s.ftm)) / (2 * othersFga)) * s.ast : 0;
  const ftMiss = (made: number, att: number) => (att ? (1 - made / att) ** 2 : 0);
  const ftPart = s.fta ? (1 - ftMiss(s.ftm, s.fta)) * 0.4 * s.fta : 0;
  const teamScPoss = t.fgm + (1 - ftMiss(t.ftm, t.fta)) * t.fta * 0.4;
  const oppTrb = o.orb + o.drb;
  const teamOrbPct = t.orb / Math.max(1, t.orb + (oppTrb - o.orb));
  const teamPlay = teamScPoss / Math.max(1, t.fga + t.fta * 0.4 + t.tov);
  const orbWeight = ((1 - teamOrbPct) * teamPlay) / Math.max(1e-9, (1 - teamOrbPct) * teamPlay + teamOrbPct * (1 - teamPlay));
  const orbPart = s.orb * orbWeight * teamPlay;
  const keep = 1 - (t.orb / Math.max(1e-9, teamScPoss)) * orbWeight * teamPlay;
  const scPoss = (fgPart + astPart + ftPart) * keep + orbPart;
  const fgxPoss = (s.fga - s.fgm) * (1 - 1.07 * teamOrbPct);
  const ftxPoss = ftMiss(s.ftm, s.fta) * 0.4 * s.fta;
  const totPoss = scPoss + fgxPoss + ftxPoss + s.tov;
  const othersFgm = t.fgm - s.fgm;
  const pFg = 2 * (s.fgm + 0.5 * s.tpm) * (1 - 0.5 * fgShare * qAst);
  const pAst = othersFgm > 0 && othersFga > 0 ? 2 * ((othersFgm + 0.5 * (t.tpm - s.tpm)) / othersFgm) * 0.5 * ((t.pts - t.ftm - (s.pts - s.ftm)) / (2 * othersFga)) * s.ast : 0;
  const pOrb = s.orb * orbWeight * teamPlay * (t.pts / Math.max(1e-9, teamScPoss));
  const pprod = safe((pFg + pAst + s.ftm) * keep + pOrb);
  const ows = (pprod - 0.92 * lgPpp * totPoss) / ptsPerWin;

  // defense: stops and the individual defensive rating (Oliver)
  const dorPct = o.orb / Math.max(1, o.orb + t.drb);
  const dfgPct = o.fga ? o.fgm / o.fga : 0;
  const fmWt = (dfgPct * (1 - dorPct)) / Math.max(1e-9, dfgPct * (1 - dorPct) + (1 - dfgPct) * dorPct);
  const stops1 = s.stl + s.blk * fmWt * (1 - 1.07 * dorPct) + s.drb * (1 - fmWt);
  const stops2 = (((o.fga - o.fgm - t.blk) / tmMp) * fmWt * (1 - 1.07 * dorPct) + (o.tov - t.stl) / tmMp) * mp + (t.pf ? s.pf / t.pf : 0) * 0.4 * o.fta * ftMiss(o.ftm, o.fta);
  const stopPct = ((stops1 + stops2) * tmMp) / (defPoss * mp);
  const teamDrtg = (100 * o.pts) / defPoss;
  const dPtsPerScPoss = o.pts / Math.max(1e-9, o.fgm + (1 - ftMiss(o.ftm, o.fta)) * o.fta * 0.4);
  const drtg = teamDrtg + 0.2 * (100 * dPtsPerScPoss * (1 - stopPct) - teamDrtg);
  const dws = ((mp / tmMp) * defPoss * (1.08 * lgPpp - drtg / 100)) / ptsPerWin;

  const pct = (num: number, den: number) => (den > 0 ? (100 * num) / den : 0);
  const unit = tmMp / 5;
  return {
    mp,
    aper: aper(c, s) ?? 0,
    ows: safe(ows),
    dws: safe(dws),
    pprod,
    totPoss,
    drtg: safe(drtg),
    astPct: pct(s.ast, share * t.fgm - s.fgm),
    orbPct: pct(s.orb * unit, mp * (t.orb + o.drb)),
    drbPct: pct(s.drb * unit, mp * (t.drb + o.orb)),
    trbPct: pct((s.orb + s.drb) * unit, mp * (t.orb + t.drb + oppTrb)),
    stlPct: pct(s.stl * unit, mp * defPoss),
    blkPct: pct(s.blk * unit, mp * (o.fga - o.tpa)),
    tovPct: pct(s.tov, s.fga + 0.44 * s.fta + s.tov),
    usg: pct((s.fga + 0.44 * s.fta + s.tov) * unit, mp * (t.fga + 0.44 * t.fta + t.tov)),
  };
}

/**
 * A player's advanced numbers for one regular season played in this league, over all the teams he
 * played for (Basketball Reference's "TOT" line: win shares add up, the rates and PER are weighed by
 * minutes, the ratings read from the season's points produced and possessions). Null for an imported
 * season, a season without minutes, or one whose teams' totals aren't in the save.
 */
export function seasonAdvanced(league: League, p: Player, season: number): Advanced | null {
  const rows = p.stats.filter((s) => s.season === season && !s.playoffs && !s.real && s.min > 0);
  if (!rows.length) return null;
  const c = seasonCtx(league, season);
  if (!c) return null;
  const lines = rows.map((s) => lineAdvanced(c, s)).filter((x): x is NonNullable<typeof x> => !!x);
  const mp = lines.reduce((a, l) => a + l.mp, 0);
  if (!mp) return null;
  const w = (k: 'aper' | 'drtg' | 'astPct' | 'orbPct' | 'drbPct' | 'trbPct' | 'stlPct' | 'blkPct' | 'tovPct' | 'usg') => lines.reduce((a, l) => a + l[k] * l.mp, 0) / mp;
  const ows = lines.reduce((a, l) => a + l.ows, 0);
  const dws = lines.reduce((a, l) => a + l.dws, 0);
  const pprod = lines.reduce((a, l) => a + l.pprod, 0);
  const poss = lines.reduce((a, l) => a + l.totPoss, 0);
  return {
    per: (w('aper') * 15) / c.lgAper,
    ows,
    dws,
    ws: ows + dws,
    ws48: ((ows + dws) * 48) / mp,
    ortg: poss > 0 ? (100 * pprod) / poss : 0,
    drtg: w('drtg'),
    astPct: w('astPct'),
    orbPct: w('orbPct'),
    drbPct: w('drbPct'),
    trbPct: w('trbPct'),
    stlPct: w('stlPct'),
    blkPct: w('blkPct'),
    tovPct: w('tovPct'),
    usg: w('usg'),
  };
}
