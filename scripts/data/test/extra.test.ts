import { describe, expect, it } from 'vitest';
import { cleanPickText, projectionFromStrength, resolvePicks, type RawPickRow } from '../extra/picks';
import { parseNbaSchedule } from '../extra/schedule';
import { attachInjuries, daysFromNote, injuryType } from '../extra/injuries';
import { markTwoWays } from '../extra/twoway';
import { inferPosition, statsPosition } from '../positions';
import { ALL_TEAMS } from '../extra/teams';
import type { SeedPlayer } from '../../../src/core/league/create';
import { emptyRatings } from '../../../src/core/ratings';

const row = (p: Partial<RawPickRow> & Pick<RawPickRow, 'teamOwner' | 'year' | 'round'>): RawPickRow => ({
  teamFrom: null,
  swapOwner: null,
  swapOption: null,
  protections: null,
  pickPool: null,
  rank: null,
  ...p,
});

// strength = alphabetical index: ATL is the weakest team (most favorable pick), WAS the best
const strength = Object.fromEntries(ALL_TEAMS.map((t, i) => [t, i]));
const proj = projectionFromStrength(strength, 2027);
const resolve = (rows: RawPickRow[]) => {
  const { picks } = resolvePicks(rows, proj, 2027, 2028);
  const get = (season: number, round: number, original: string) => picks.find((p) => p.season === season && p.round === round && p.original === original)!;
  return { picks, get };
};

const sched = {
  leagueSchedule: {
    seasonYear: '2026-27',
    gameDates: [
      { games: [{ gameId: '0012600001', gameDateEst: '2026-10-03T00:00:00Z', homeTeam: { teamTricode: 'TOR' }, awayTeam: { teamTricode: 'MIA' } }] },
      {
        games: [
          { gameId: '0022600001', gameDateEst: '2026-10-20T00:00:00Z', homeTeam: { teamTricode: 'DET' }, awayTeam: { teamTricode: 'BOS' } },
          { gameId: '0022600003', gameDateEst: '2026-10-20T00:00:00Z', homeTeam: { teamTricode: 'SAS' }, awayTeam: { teamTricode: 'OKC' } },
        ],
      },
      { games: [{ gameId: '0022600100', gameDateEst: '2026-11-01T00:00:00Z', homeTeam: { teamTricode: 'PHX' }, awayTeam: { teamTricode: 'BKN' } }] },
      { games: [{ gameId: '0022601201', gameDateEst: '2026-12-04T00:00:00Z', homeTeam: { teamTricode: '' }, awayTeam: { teamTricode: '' } }] },
    ],
  },
};

const player = (id: string, first: string, last: string, team: string | null): SeedPlayer => ({
  id,
  first,
  last,
  team,
  pos: 'SF',
  heightIn: 79,
  weightLb: 220,
  bornYear: 1998,
  country: 'USA',
  college: '',
  jersey: '',
  contract: team ? { salaries: [5000] } : null,
  draft: null,
  ratings: emptyRatings(),
  stats: [],
});

describe('opening-night extras', () => {
  it('resolves future picks to one owner each, and reads the schedule, injuries, two-way contracts and positions', () => {
    // RealGM pick text: asides cleaned, list markers kept
    expect(cleanPickText('More favorable of (i) ATL and (ii) less favorable of UTH (cannot be 1-5) and CLE [CLE may convey] (via UTH swap for CLE; via ATL)*;')).toBe(
      'More favorable of (i) ATL and (ii) less favorable of UTH and CLE',
    );

    // every pick has exactly one owner, defaulting to its original team
    const { picks } = resolve([]);
    expect(picks).toHaveLength(30 * 2 * 2);
    expect(new Set(picks.map((p) => `${p.season}-${p.round}-${p.original}`)).size).toBe(picks.length);
    expect(picks.every((p) => p.owner === p.original)).toBe(true);

    // traded picks move, "a-30" ranges become top-N protections, pools and swaps resolve on the projected order
    const traded = resolve([
      row({ teamOwner: 'Brooklyn Nets', year: 2027, round: 'First Round', teamFrom: 'New York Knicks' }),
      row({ teamOwner: 'Dallas Mavericks', year: 2027, round: 'First Round', protections: '3-30 to Charlotte Hornets' }),
      row({ teamOwner: 'Charlotte Hornets', year: 2027, round: 'First Round', teamFrom: 'Dallas Mavericks', protections: '1-2 to Dallas Mavericks' }),
      // pool: Atlanta gets the less favorable (better team's) pick of Milwaukee (16) and New Orleans (19)
      row({
        teamOwner: 'Atlanta Hawks',
        year: 2027,
        round: 'First Round',
        pickPool: 'Milwaukee Bucks, New Orleans Pelicans',
        rank: 'Less favorable of MIL and NOP if either or both 5-30 (via NOP)',
      }),
      // swap: Washington (best) may swap with Atlanta (worst)
      row({ teamOwner: 'Washington Wizards', year: 2028, round: 'First Round', swapOption: 'Atlanta Hawks' }),
      row({ teamOwner: 'Atlanta Hawks', year: 2028, round: 'First Round', swapOwner: 'Washington Wizards' }),
      // three-way pool with explicit recipients
      row({
        teamOwner: 'Boston Celtics',
        year: 2028,
        round: 'First Round',
        pickPool: 'x',
        rank: 'Most and least favorable of BOS, POR and MIL to POR; second most favorable to WAS (via BOS to POR)',
      }),
    ]).get;
    expect(traded(2027, 1, 'NYK').owner).toBe('BRK');
    expect(traded(2027, 1, 'DAL')).toMatchObject({ owner: 'CHO', protection: 2 });
    expect(traded(2027, 1, 'NOP').owner).toBe('ATL');
    expect(traded(2027, 1, 'MIL').owner).toBe('MIL');
    expect(traded(2028, 1, 'ATL').owner).toBe('WAS');
    expect(traded(2028, 1, 'WAS').owner).toBe('ATL');
    // BOS (index 1) most favorable, MIL (16) second, POR (24) least
    expect(traded(2028, 1, 'BOS').owner).toBe('POR');
    expect(traded(2028, 1, 'POR').owner).toBe('POR');
    expect(traded(2028, 1, 'MIL').owner).toBe('WAS');

    // "if not already settled" chains are discounted by the earlier conveyance:
    // WAS is the best team: its 2027 pick (15-30 to CHA) almost surely conveys, so 2028 stays home
    const chained = resolve([
      row({ teamOwner: 'Washington Wizards', year: 2027, round: 'First Round', protections: '15-30 to Charlotte Hornets' }),
      row({ teamOwner: 'Charlotte Hornets', year: 2028, round: 'First Round', teamFrom: 'Washington Wizards', protections: 'WAS if not already settled' }),
    ]).get;
    expect(chained(2027, 1, 'WAS')).toMatchObject({ owner: 'CHO', protection: 14 });
    expect(chained(2028, 1, 'WAS').owner).toBe('WAS');

    // the NBA.com schedule compacts to day:AWY@HOM strings on the game calendar
    const r = parseNbaSchedule(sched, 2027)!;
    expect(r.schedule.games).toEqual(['0:BOS@DET', '0:OKC@SAS', '12:BKN@PHX']);
    expect(r.placeholders).toBe(1);
    expect(r.schedule.start).toBe('2026-10-20');
    expect(parseNbaSchedule(sched, 2028)).toBeNull();

    // injury reports map to types and count games to the return date
    expect(injuryType('Knee — Veesaar was diagnosed with a torn right ACL', 82).type).toBe('Torn ACL');
    expect(injuryType('Hamstring — strained his hamstring', 5)).toEqual({ type: 'Hamstring strain', severity: 'moderate' });
    expect(injuryType('Knee — hopes to be back early in 2027', 33)).toEqual({ type: 'Knee injury', severity: 'major' });
    const hurt = [player('butleji01', 'Jimmy', 'Butler', 'GSW'), player('x', 'Healthy', 'Guy', 'GSW')];
    const schedule = { season: 2027, start: '2026-10-20', games: ['0:GSW@LAL', '2:LAL@GSW', '5:GSW@DEN', '80:GSW@BOS'] };
    const injured = attachInjuries(
      hurt,
      [
        { team: 'GSW', name: 'Jimmy Butler III', status: 'Out', detail: 'Knee — The Warriors hope to have Butler back early in 2027', returnDate: '2026-10-26' },
        { team: 'GSW', name: 'Healthy Guy', status: 'Day-To-Day', detail: 'Rest — rest', returnDate: '2026-10-14' },
      ],
      schedule,
      2027,
    );
    expect(injured.applied.map((a) => a.id)).toEqual(['butleji01']);
    // 3 of the team's 4 listed games fall before Oct 26 (day 6), scaled to 82 games
    expect(hurt[0].injury).toMatchObject({ returnDay: 6, games: Math.round((3 * 82) / 4) });
    expect(hurt[1].injury).toBeUndefined();
    // a placeholder "day after the opener" date gives way to a timeline in the note
    expect(daysFromNote('Claxton tweaked his hamstring and will be re-evaluated in two weeks')).toBe(14);
    expect(daysFromNote('expected to miss four-to-six weeks')).toBe(42);
    expect(daysFromNote('Rest — rest')).toBeNull();
    const p2 = [player('claxtni01', 'Nic', 'Claxton', 'GSW')];
    attachInjuries(
      p2,
      [{ team: 'GSW', name: 'Nic Claxton', status: 'Day-To-Day', detail: 'Hamstring — will be re-evaluated in two weeks', returnDate: '2026-10-21' }],
      schedule,
      2027,
      '2026-10-11',
    );
    expect(p2[0].injury).toMatchObject({ returnDay: 5 });

    // two-way players are marked, and unsigned ones move to their two-way team
    const twoWays = [player('a', 'Jalen', 'Wilson', null), player('b', 'Ernest', 'Udeh', 'CLE'), player('c', 'Star', 'Player', 'CLE')];
    const marked = markTwoWays(
      twoWays,
      [
        { name: 'Jalen Wilson', team: 'ATL', contractType: 'two-way', cashSalary: { '2026-27': 680985 } },
        { name: 'Ernest Udeh Jr.', team: 'CLE', contractType: 'two-way' },
        { name: 'Star Player', team: 'CLE', contractType: null },
        { name: 'Not In Seed', team: 'CHO', contractType: 'two-way' },
      ],
      '2026-27',
    );
    expect(marked.marked.map((p) => p.id)).toEqual(['a', 'b']);
    expect(twoWays[0]).toMatchObject({ team: 'ATL', contract: { salaries: [681], twoWay: true } });
    expect(twoWays[1].contract).toMatchObject({ salaries: [5000], twoWay: true });
    expect(twoWays[2].contract?.twoWay).toBeUndefined();
    expect(marked.missing).toEqual(['Not In Seed (CHO)']);

    // a refresh starts from the contracts table: a player no longer on a two-way deal goes back where he was
    const refreshed = [player('a', 'Jalen', 'Wilson', null), player('b', 'Ernest', 'Udeh', 'CLE')];
    const rows = [
      { name: 'Jalen Wilson', team: 'ATL', contractType: 'two-way' },
      { name: 'Ernest Udeh', team: 'CLE', contractType: 'two-way' },
    ];
    markTwoWays(refreshed, rows, '2026-27');
    // the seed goes through JSON between runs
    const again = JSON.parse(JSON.stringify(refreshed)) as SeedPlayer[];
    markTwoWays(again, rows, '2026-27');
    expect(again).toEqual(JSON.parse(JSON.stringify(refreshed)));
    markTwoWays(again, rows.slice(1), '2026-27');
    expect(again[0]).toMatchObject({ team: null, contract: null });
    expect(again[0]).not.toHaveProperty('twoWayFrom');
    expect(again[1].contract).toEqual({ salaries: [5000], twoWay: true });

    // positions come from box scores, else are inferred from G/F/C, size and skills
    expect(
      statsPosition([
        { season: 2025, team: 'OKC', pos: 'PF', g: 70, mp: 30 },
        { season: 2026, team: 'TOT', pos: 'SF', g: 60, mp: 30 },
        { season: 2026, team: 'OKC', pos: 'SG', g: 40, mp: 30 },
        { season: 2026, team: 'MEM', pos: 'SF', g: 20, mp: 30 },
      ]),
    ).toBe('SG');
    expect(statsPosition([])).toBeNull();
    const blank = emptyRatings();
    expect(inferPosition('G', 74, { ...blank, hnd: 70, pas: 68 })).toBe('PG');
    expect(inferPosition('G', 78, { ...blank, hnd: 50, pas: 45 })).toBe('SG');
    expect(inferPosition('F', 79, { ...blank, oreb: 40, dreb: 44 })).toBe('SF');
    expect(inferPosition('F', 81, { ...blank, oreb: 55, dreb: 60, hnd: 45, pas: 45 })).toBe('PF');
    expect(inferPosition('F-C', 83, blank)).toBe('C');
  });
});
