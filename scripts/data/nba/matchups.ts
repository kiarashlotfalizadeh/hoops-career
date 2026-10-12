// Season matchup data (stats.nba.com tracking): who guarded whom, for how long, and what the
// offensive player did against him. A defender's value is the points he saved relative to
// what the same opponents scored against everyone else, per 100 partial possessions guarded.
import { tarCsvRows } from './csv';

export interface DefMatchup {
  id: number;
  name: string;
  partialPoss: number;
  ptsAllowed: number;
  ptsExpected: number;
  fgaAgainst: number;
  fgmAgainst: number;
  threesAgainst: number;
  switches: number;
  helpBlocks: number;
}

export interface SeasonMatchups {
  season: number;
  defenders: Record<number, DefMatchup>;
  /** Full names for every player seen (offense or defense). */
  names: Record<number, string>;
  /** Tricode of each player's team (last seen). */
  teams: Record<number, string>;
}

interface Row {
  off: number;
  def: number;
  pp: number;
  pts: number;
  fga: number;
  fgm: number;
  fg3a: number;
  sw: number;
  hb: number;
}

export async function processMatchups(file: string, season: number, log = console.log): Promise<SeasonMatchups> {
  const rows: Row[] = [];
  const names: Record<number, string> = {};
  const teams: Record<number, string> = {};
  for await (const get of tarCsvRows(file)) {
    const off = Number(get('person_id'));
    const def = Number(get('matchups_person_id'));
    if (!off || !def) continue;
    names[off] ??= `${get('first_name')} ${get('family_name')}`.trim();
    names[def] ??= `${get('matchups_first_name')} ${get('matchups_family_name')}`.trim();
    teams[off] = get('team_tricode');
    rows.push({
      off,
      def,
      pp: Number(get('partial_possessions')) || 0,
      pts: Number(get('player_points')) || 0,
      fga: Number(get('matchup_field_goals_attempted')) || 0,
      fgm: Number(get('matchup_field_goals_made')) || 0,
      fg3a: Number(get('matchup_three_pointers_attempted')) || 0,
      sw: Number(get('switches_on')) || 0,
      hb: Number(get('help_blocks')) || 0,
    });
  }
  // each scorer's points per partial possession against everyone
  const offPts = new Map<number, [number, number]>();
  for (const r of rows) {
    const a = offPts.get(r.off) ?? [0, 0];
    a[0] += r.pts;
    a[1] += r.pp;
    offPts.set(r.off, a);
  }
  const leaguePpp =
    [...offPts.values()].reduce((s, a) => s + a[0], 0) /
    Math.max(
      1,
      [...offPts.values()].reduce((s, a) => s + a[1], 0),
    );
  const rate = (off: number) => {
    const [p, pp] = offPts.get(off) ?? [0, 0];
    return (p + leaguePpp * 200) / (pp + 200); // regressed toward league rate
  };
  const defenders: Record<number, DefMatchup> = {};
  for (const r of rows) {
    const d = (defenders[r.def] ??= {
      id: r.def,
      name: names[r.def] ?? '',
      partialPoss: 0,
      ptsAllowed: 0,
      ptsExpected: 0,
      fgaAgainst: 0,
      fgmAgainst: 0,
      threesAgainst: 0,
      switches: 0,
      helpBlocks: 0,
    });
    d.partialPoss += r.pp;
    d.ptsAllowed += r.pts;
    d.ptsExpected += rate(r.off) * r.pp;
    d.fgaAgainst += r.fga;
    d.fgmAgainst += r.fgm;
    d.threesAgainst += r.fg3a;
    d.switches += r.sw;
    d.helpBlocks += r.hb;
  }
  log(`  ${season}: ${rows.length} matchup rows, ${Object.keys(defenders).length} defenders`);
  return { season, defenders, names, teams };
}
