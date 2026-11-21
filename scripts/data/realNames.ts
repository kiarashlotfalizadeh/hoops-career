// The real league's team nicknames, by Basketball Reference code. The game ships invented nicknames
// (src/core/teams.ts); the data build still has to read its sources, which name teams as they are
// ("Brooklyn Nets"). Build scripts only: nothing in src/ imports this, so it never reaches the app.
import type { FranchiseDef } from '../../src/core/teams';

const REAL_NAME: Record<string, string> = {
  ATL: 'Hawks',
  BOS: 'Celtics',
  BRK: 'Nets',
  CHO: 'Hornets',
  CHI: 'Bulls',
  CLE: 'Cavaliers',
  DAL: 'Mavericks',
  DEN: 'Nuggets',
  DET: 'Pistons',
  GSW: 'Warriors',
  HOU: 'Rockets',
  IND: 'Pacers',
  LAC: 'Clippers',
  LAL: 'Lakers',
  MEM: 'Grizzlies',
  MIA: 'Heat',
  MIL: 'Bucks',
  MIN: 'Timberwolves',
  NOP: 'Pelicans',
  NYK: 'Knicks',
  OKC: 'Thunder',
  ORL: 'Magic',
  PHI: '76ers',
  PHO: 'Suns',
  POR: 'Trail Blazers',
  SAC: 'Kings',
  SAS: 'Spurs',
  TOR: 'Raptors',
  UTA: 'Jazz',
  WAS: 'Wizards',
};

/** A franchise's name as the sources write it: "Brooklyn Nets". */
export function realName(f: Pick<FranchiseDef, 'bbref' | 'region'>): string {
  const name = REAL_NAME[f.bbref];
  if (!name) throw new Error(`No real name for ${f.bbref}`);
  return `${f.region} ${name}`;
}
