// The game files' players and lines as the seed takes them: NBA.com's people matched to the
// Basketball Reference ids the seed is keyed by, its team ids to franchises, and each line (a team, a
// season, its regular season or postseason) as a real season on a player's record.
import type { PlayerStats } from '../../../src/core/types';
import { BBREF_TO_TID, FRANCHISES } from '../../../src/core/teams';
import { crosswalk, type BbrefRow, type NbaPerson } from '../nba/crosswalk';
import { teamByName } from '../extra/teams';
import type { AdvRow, PerGameRow } from '../parse';
import type { BoxData, BoxLine } from './boxscores';
import type { LineShots } from './playbyplay';

/** Each NBA.com team id's franchise, by its Basketball Reference code today (team ids stay with a franchise when it moves). */
export function franchiseCodes(box: BoxData): Map<number, string> {
  const out = new Map<number, string>();
  const unknown: string[] = [];
  for (const [id, name] of Object.entries(box.teamNames)) {
    const code = teamByName(name);
    if (code) out.set(Number(id), code);
    else unknown.push(name);
  }
  if (unknown.length) throw new Error(`Box scores name teams no franchise is called: ${unknown.join(', ')}`);
  return out;
}

/** A Basketball Reference team code of any season ('SEA', 'NJN') as its franchise's code today. */
export const franchiseOf = (code: string): string | undefined => {
  const tid = BBREF_TO_TID[code];
  return tid === undefined ? undefined : FRANCHISES[tid].bbref;
};

/**
 * NBA.com person id → Basketball Reference id for everyone who played from season `from` on, by name
 * and by franchise and season (crosswalk.ts), against `bbref`'s rows (any season's team codes).
 */
export function matchPlayers(box: BoxData, bbref: BbrefRow[], codes: Map<number, string>, from: number, log = console.log): Map<number, string> {
  const people: NbaPerson[] = [];
  for (const [pid, p] of Object.entries(box.people)) {
    const teams: Record<number, string> = {};
    for (const [s, teamId] of Object.entries(p.teams)) if (Number(s) >= from && codes.has(teamId)) teams[Number(s)] = codes.get(teamId)!;
    if (Object.keys(teams).length) people.push({ pid: Number(pid), name: p.name, teams });
  }
  const rows = bbref.flatMap((r) => {
    const team = franchiseOf(r.team);
    return team ? [{ ...r, team }] : [];
  });
  const { map, unmatched } = crosswalk(people, rows);
  // (one who played only in the new season's first nights and signed no contract has no row to match)
  log(
    `  players matched to Basketball Reference: ${map.size} of ${people.length}${
      unmatched.length
        ? ` (${unmatched.length} with no row: ${unmatched
            .slice(0, 6)
            .map((p) => p.name)
            .join(', ')}…)`
        : ''
    }`,
  );
  return map;
}

/** A box-score line as a real season on his record: shots by zone and games started from the play-by-play, advanced numbers from Basketball Reference. */
export function seedLine(l: BoxLine, code: string, shots: LineShots | undefined, startsListed: boolean, adv: AdvRow | undefined): PlayerStats {
  return {
    season: l.season,
    tid: BBREF_TO_TID[code] ?? -1,
    playoffs: l.part === 'post',
    real: true,
    gp: l.gp,
    // (the box scores mark starters in some seasons only; the play-by-play's opening fives cover the rest)
    gs: startsListed || !shots ? l.gs : Math.min(shots.gs, l.gp),
    min: l.min,
    fgm: l.fgm,
    fga: l.fga,
    tpm: l.tpm,
    tpa: l.tpa,
    ftm: l.ftm,
    fta: l.fta,
    orb: l.orb,
    drb: l.drb,
    ast: l.ast,
    stl: l.stl,
    blk: l.blk,
    tov: l.tov,
    pf: l.pf,
    pts: l.pts,
    pm: l.pm,
    rimM: shots?.fgm.rim ?? 0,
    rimA: shots?.fga.rim ?? 0,
    midM: shots?.fgm.mid ?? 0,
    midA: shots?.fga.mid ?? 0,
    onPoss: l.poss,
    onPtsFor: l.ptsFor,
    onPtsAgainst: l.ptsAgainst,
    teamFga: l.teamFga,
    teamFta: l.teamFta,
    teamTov: l.teamTov,
    adv: adv
      ? {
          per: adv.per,
          ts: adv.ts,
          usg: adv.usgPct,
          astPct: adv.astPct,
          trbPct: adv.trbPct,
          stlPct: adv.stlPct,
          blkPct: adv.blkPct,
          tovPct: adv.tovPct,
          ws: adv.ws,
          ws48: adv.ws48,
          obpm: adv.obpm,
          dbpm: adv.dbpm,
          bpm: adv.bpm,
          vorp: adv.vorp,
        }
      : undefined,
  };
}

/** A regular-season box-score line as a Basketball Reference per-game row (what the ratings are derived from), his age and position from `like`. */
export function perGameRow(l: BoxLine, code: string, like: PerGameRow): PerGameRow {
  const g = Math.max(1, l.gp);
  const per = (v: number) => v / g;
  return {
    id: like.id,
    name: like.name,
    season: l.season,
    age: like.age,
    team: code,
    pos: like.pos,
    g: l.gp,
    gs: l.gs,
    mp: per(l.min),
    fg: per(l.fgm),
    fga: per(l.fga),
    fg3: per(l.tpm),
    fg3a: per(l.tpa),
    fg2: per(l.fgm - l.tpm),
    fg2a: per(l.fga - l.tpa),
    ft: per(l.ftm),
    fta: per(l.fta),
    orb: per(l.orb),
    drb: per(l.drb),
    ast: per(l.ast),
    stl: per(l.stl),
    blk: per(l.blk),
    tov: per(l.tov),
    pf: per(l.pf),
    pts: per(l.pts),
  };
}
