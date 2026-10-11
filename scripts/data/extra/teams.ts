// Team naming across sources → Basketball Reference codes (what the seed uses).
import { FRANCHISES } from '../../../src/core/teams';

const BY_NAME: Record<string, string> = {};
for (const f of FRANCHISES) BY_NAME[`${f.region} ${f.name}`.toLowerCase()] = f.bbref;
// source-specific spellings
Object.assign(BY_NAME, { 'la clippers': 'LAC', 'philadelphia sixers': 'PHI', 'la lakers': 'LAL' });

/** Full team name ("Philadelphia Sixers", "LA Clippers") → BBRef code. */
export function teamByName(name: string): string | undefined {
  return BY_NAME[name.trim().toLowerCase()];
}

/** RealGM (UTH, SAN, PHL, GOS...), NBA.com (BKN, CHA, PHX) and BBRef codes → BBRef code. */
const CODE: Record<string, string> = {
  UTH: 'UTA', SAN: 'SAS', PHL: 'PHI', GOS: 'GSW', BKN: 'BRK', CHA: 'CHO', PHX: 'PHO', NOR: 'NOP', NOH: 'NOP',
};
for (const f of FRANCHISES) {
  CODE[f.bbref] = f.bbref;
  CODE[f.abbrev] = f.bbref;
}
export function teamByCode(code: string): string | undefined {
  return CODE[code.trim().toUpperCase()];
}

/** NBA.com tricode (the game's display abbreviation) for a BBRef code. */
export function tricodeOf(bbref: string): string {
  return FRANCHISES.find((f) => f.bbref === bbref)?.abbrev ?? bbref;
}

export const ALL_TEAMS: string[] = FRANCHISES.map((f) => f.bbref);
