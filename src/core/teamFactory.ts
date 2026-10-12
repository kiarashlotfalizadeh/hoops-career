import type { CoachProfile, Team, TeamSeason, TeamTotals } from './types';
import { FRANCHISES } from './teams';
import { defaultTactics } from './sim/tactics';
import { Rng } from './random';

const COACH_FIRST = [
  'Mike',
  'Steve',
  'Erik',
  'Joe',
  'Tom',
  'Rick',
  'Doc',
  'Monty',
  'Quin',
  'Mark',
  'Chris',
  'Darvin',
  'Ime',
  'Taylor',
  'Will',
  'Jordi',
  'Charles',
  'Jamahl',
  'JB',
  'Billy',
  'Nate',
  'Kenny',
  'Jason',
  'Adrian',
  'Jarron',
  'Tyronn',
  'Brian',
  'Ty',
  'Darko',
  'Jordan',
];
const COACH_LAST = [
  'Daly',
  'Carroll',
  'Brown',
  'Harris',
  'Hammond',
  'Silas',
  'Lee',
  'Fisher',
  'Mitchell',
  'Kidd',
  'Snyder',
  'Rivers',
  'Finch',
  'Hardy',
  'Mosley',
  'Fernández',
  'Udoka',
  'Atkinson',
  'Lue',
  'Holmes',
  'Kerr',
  'Thibodeau',
  'Bickerstaff',
  'McMillan',
  'Nurse',
  'Popovich',
  'Rajaković',
  'Redick',
  'Ott',
  'Spoelstra',
];
const OFF_PHIL = ['balanced', 'helio', 'fiveOut', 'hub', 'paceSpace', 'grind'];
const DEF_PHIL = ['drop', 'switch', 'blitz', 'ice', 'hedge', 'zone'];

export const coachName = (rng: Rng) => `${rng.pick(COACH_FIRST)} ${rng.pick(COACH_LAST)}`;

export function randomCoach(rng: Rng): CoachProfile {
  return {
    name: coachName(rng),
    offPhilosophy: rng.pick(OFF_PHIL),
    defPhilosophy: rng.pick(DEF_PHIL),
    development: Math.round(rng.uniform(35, 85)),
    tactics: Math.round(rng.uniform(35, 85)),
  };
}

export function emptyTotals(): TeamTotals {
  return { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 };
}

export function newTeamSeason(season: number, pop: number): TeamSeason {
  return {
    season,
    won: 0,
    lost: 0,
    homeWon: 0,
    homeLost: 0,
    confWon: 0,
    confLost: 0,
    divWon: 0,
    divLost: 0,
    streak: 0,
    lastTen: [],
    ptsFor: 0,
    ptsAgainst: 0,
    poss: 0,
    oppPoss: 0,
    playoffRound: -1,
    seed: null,
    revenue: 0,
    expenses: 0,
    payroll: 0,
    attendance: 0,
    pop,
    t: emptyTotals(),
    o: emptyTotals(),
  };
}

export function makeTeam(tid: number, season: number, rng: Rng): Team {
  const f = FRANCHISES[tid];
  const coach = randomCoach(rng);
  return {
    tid,
    abbrev: f.abbrev,
    region: f.region,
    name: f.name,
    // a copy: the franchise table is shared by every league
    colors: [...f.colors],
    conf: f.conf,
    div: f.div,
    pop: f.pop,
    tactics: defaultTactics(coach.offPhilosophy, coach.defPhilosophy),
    rotation: { order: [], minutes: {}, closers: [], restB2B: [], caps: {}, manual: false },
    strategy: 'retool',
    budget: { coaching: 50, health: 50, facilities: 50, ticketPrice: 95 },
    cash: 60_000,
    hype: 0.5,
    coach,
    seasons: [newTeamSeason(season, f.pop)],
    deadMoney: [],
    practice: 'normal',
  };
}
