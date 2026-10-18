// Global search: names without their accents, words in any order, abbreviations, screens by the
// words players use, glossary terms, and who wins a tie (your players, then active ones).
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../../core/league/create';
import { RETIRED } from '../../core/types';
import { matchScore, normalize, search, searchIndex } from '../search';

const league = createLeague({ name: 'search', userTid: 19, coachName: 'c', settings: defaultSettings(), seed: seedJson as unknown as SeedData, rngSeed: 5 });
const index = searchIndex(league);
const find = (q: string) => search(index, q).map((e) => e.title);
const named = (first: string, last: string) => Object.values(league.players).find((p) => p.firstName === first && p.lastName === last)!;

describe('global search', () => {
  it('finds players without their accents, by any words in any order', () => {
    expect(find('doncic')[0]).toBe('Luka Dončić');
    expect(find('jal wil')[0]).toBe('Jalen Williams');
    expect(find('williams jalen')[0]).toBe('Jalen Williams');
    expect(normalize('Şengün')).toBe('sengun');
  });

  it('finds teams by abbreviation, city or name, with their matchup page beside them', () => {
    const okc = search(index, 'okc')[0];
    expect(okc).toMatchObject({ kind: 'team', title: 'Oklahoma City Thunder' });
    expect(search(index, 'celtics')[0]).toMatchObject({ kind: 'team', alt: { label: 'Matchup' } });
    // your own team goes to Team, with no matchup against yourself
    const mine = index.find((e) => e.id === `t:${league.userTid}`)!;
    expect(mine).toMatchObject({ to: '/team', alt: undefined });
  });

  it('finds screens by the words players use, and glossary terms', () => {
    expect(search(index, 'cap')[0]).toMatchObject({ kind: 'screen', to: '/office' });
    expect(search(index, 'depth chart')[0]).toMatchObject({ kind: 'screen', to: '/team/rotation' });
    expect(search(index, 'drop').some((e) => e.kind === 'term' && e.termId === 'drop')).toBe(true);
  });

  it('breaks ties toward your players and active ones, and never matches on a stray letter', () => {
    const p = named('Jalen', 'Williams');
    const e = index.find((x) => x.id === `p:${p.pid}`)!;
    expect(matchScore(e, 'x')).toBe(0);
    expect(matchScore(e, 'len')).toBe(300); // inside the name, three letters or more
    expect(matchScore(e, 'le')).toBe(0);
    const retired = { ...e, id: 'p:-1', boost: 0 };
    const active = { ...e, id: 'p:-2', boost: 40 };
    expect(search([retired, active], 'jalen')[0].id).toBe('p:-2');
    // retired players have no OVR badge
    const old = Object.values(league.players).find((x) => x.tid === RETIRED);
    if (old) expect(index.find((x) => x.id === `p:${old.pid}`)?.ovr).toBeUndefined();
  });

  it('returns nothing for an empty query', () => {
    expect(search(index, '   ')).toEqual([]);
  });
});
