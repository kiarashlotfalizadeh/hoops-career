// Screen logic. Global search: names without their accents, words in any order, abbreviations, screens
// by the words players use, glossary terms, and who wins a tie (your players, then active ones). New
// League's team step: the roster size it reads from the seed is the one the league is built with. How a
// team's season reads on its page and in the history (seasonOutcome): a playoff team that has won its
// series waits for the next round's draw. God mode's editor sheets: Save sends what was changed in the
// sheet, measured from the form as it opened, so a sim that ran with the sheet open isn't put back by it.
// The trading block: the best package each team would give for one of the user's players.
import { describe, expect, it } from 'vitest';
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../../core/league/create';
import { curTeamSeason, standardRoster } from '../../core/league/helpers';
import { CAP } from '../../core/constants';
import { RETIRED, type League, type PlayoffSeries } from '../../core/types';
import { matchScore, normalize, search, searchIndex } from '../search';
import { rosterLine, seedRosterSizes } from '../newLeague';
import { seasonOutcome } from '../league/shared';
import { editOf as playerEdit, formOf as playerForm } from '../god/PlayerEditor';
import { editOf as teamEdit, formOf as teamForm } from '../god/TeamEditor';
import { blockOffers } from '../office/tradeBlock';

const seed = seedJson as unknown as SeedData;

const series = (id: string, round: number, high: number, low: number, highWins: number, lowWins: number, winner?: number): PlayoffSeries => ({
  id,
  round,
  conf: 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 8,
  highWins,
  lowWins,
  ...(winner !== undefined ? { winner } : {}),
});

/** The first round under way: 0 swept 1 and waits, 2 and 3 still play. */
function midFirstRound(): League {
  const league = createLeague({ name: 'out', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });
  league.phase = 'playoffs';
  league.playoffs = [series('E1-0', 1, 0, 1, 4, 0, 0), series('E1-1', 1, 2, 3, 2, 1)];
  curTeamSeason(league, 0).playoffRound = 2;
  curTeamSeason(league, 1).playoffRound = 1;
  curTeamSeason(league, 2).playoffRound = 1;
  curTeamSeason(league, 3).playoffRound = 1;
  return league;
}

const outcome = (league: League, tid: number) => seasonOutcome(league, tid, curTeamSeason(league, tid)).short;

const godLeague = () => createLeague({ name: 'god-ui', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 7 });

describe('screen logic', () => {
  it('searches, sizes New League rosters, reads season outcomes, edits in god mode and builds the trading block', () => {
    // global search
    {
      const league = createLeague({ name: 'search', userTid: 19, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 5 });
      const index = searchIndex(league);
      const find = (q: string) => search(index, q).map((e) => e.title);
      const named = (first: string, last: string) => Object.values(league.players).find((p) => p.firstName === first && p.lastName === last)!;

      // players found without their accents, by any words in any order
      expect(find('doncic')[0]).toBe('Luka Dončić');
      expect(find('jal wil')[0]).toBe('Jalen Williams');
      expect(find('williams jalen')[0]).toBe('Jalen Williams');
      expect(normalize('Şengün')).toBe('sengun');

      // teams by abbreviation, city or name, with their matchup page beside them
      const okc = search(index, 'okc')[0];
      expect(okc).toMatchObject({ kind: 'team', title: 'Oklahoma City Thunder' });
      expect(search(index, 'celtics')[0]).toMatchObject({ kind: 'team', alt: { label: 'Matchup' } });
      // your own team goes to Team, with no matchup against yourself
      const mine = index.find((e) => e.id === `t:${league.userTid}`)!;
      expect(mine).toMatchObject({ to: '/team', alt: undefined });

      // screens by the words players use, and glossary terms
      expect(search(index, 'cap')[0]).toMatchObject({ kind: 'screen', to: '/office' });
      expect(search(index, 'depth chart')[0]).toMatchObject({ kind: 'screen', to: '/team/rotation' });
      expect(search(index, 'drop').some((e) => e.kind === 'term' && e.termId === 'drop')).toBe(true);

      // ties broken toward your players and active ones, and never a match on a stray letter
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

      // nothing for an empty query
      expect(search(index, '   ')).toEqual([]);
    }

    // New League counts the standard contracts each team opens camp with (with a seed to read)
    if (seed.players.length) {
      const sizes = seedRosterSizes(seed);
      expect(Object.keys(sizes)).toHaveLength(30);
      // no preseason cuts, so every team keeps its camp roster (a team under the minimum is filled)
      const league = createLeague({ name: 'n', userTid: 0, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 3, preseasonCuts: false });
      for (const t of league.teams) {
        const n = sizes[t.tid] ?? 0;
        if (n >= CAP.rosterMin) expect(standardRoster(league, t.tid).length, t.abbrev).toBe(n);
      }
    }
    // and says what opening night needs
    expect(rosterLine(CAP.rosterMax + 1)).toBe(`${CAP.rosterMax + 1} players · 1 to cut before opening night`);
    expect(rosterLine(CAP.rosterMax)).toBe(`${CAP.rosterMax} players`);
    expect(rosterLine(CAP.rosterMax - 2)).toBe(`${CAP.rosterMax - 2} players · 2 open spots`);
    expect(rosterLine(CAP.rosterMin - 1)).toBe(`${CAP.rosterMin - 1} players · 1 to sign before opening night`);

    // seasonOutcome: a series winner waiting for the next round is still in it, not out in it
    {
      const league = midFirstRound();
      expect(outcome(league, 0)).toBe('In 2nd Round');
      expect(outcome(league, 1)).toBe('Lost 1st Round');
      expect(outcome(league, 2)).toBe('In 1st Round');
      expect(outcome(league, 3)).toBe('In 1st Round');
      // once the playoffs are over, the rounds read as they ended
      league.playoffs.push(series('F4-0', 4, 0, 2, 4, 3, 0));
      curTeamSeason(league, 0).playoffRound = 5;
      curTeamSeason(league, 2).playoffRound = 4;
      league.phase = 'draftLottery';
      expect(outcome(league, 0)).toBe('Champion');
      expect(outcome(league, 2)).toBe('Lost Finals');
      expect(outcome(league, 1)).toBe('Lost 1st Round');
    }

    // the player editor sends nothing for an untouched sheet, whatever moved since it opened
    {
      const l = godLeague();
      const p = standardRoster(l, 0)[0];
      const base = playerForm(l, p);
      // what a sim does to him meanwhile
      p.wear = 40;
      p.injury = { type: 'Sprained Ankle', gamesRemaining: 3, gamesTotal: 3, severity: 'minor' };
      p.tid = 1;
      expect(playerEdit(base, { ...base })).toEqual({});
    }

    // only the fields changed, as typed (an unreadable number goes in for the checks to name); a new salary runs for the seasons shown
    {
      const l = godLeague();
      const p = standardRoster(l, 0)[0];
      const base = playerForm(l, p);
      expect(playerEdit(base, { ...base, wear: base.wear + 2 })).toEqual({ wear: base.wear + 2 });
      expect(playerEdit(base, { ...base, age: ` ${base.age} ` })).toEqual({});
      expect(playerEdit(base, { ...base, age: 'abc' }).age).toBeNaN();
      expect(playerEdit(base, { ...base, injury: { type: 'Sprained Ankle', games: '' } }).injury?.games).toBeNaN();
      const e = playerEdit(base, { ...base, amount: '12.34', touched: { amount: true } });
      expect(e.contract).toEqual({ amount: 12_340, years: base.years });
    }

    // the team editor leaves the balance, hype and coach a sim moved alone, and sends the one coach rating changed
    {
      const l = godLeague();
      const t = l.teams[3];
      const base = teamForm(t);
      t.cash += 2_345;
      t.hype = Math.min(1, t.hype + 0.2);
      t.coach.development = 99;
      expect(teamEdit(base, { ...base })).toEqual({});
      expect(teamEdit(base, { ...base, tactics: base.tactics === 50 ? 51 : 50 })).toEqual({ coach: { tactics: base.tactics === 50 ? 51 : 50 } });
    }

    // the trading block doesn't mistake a salary filler for a pick already in the package when their ids match
    let tried = 0;
    for (const rngSeed of [7, 11, 23]) {
      const l = createLeague({ name: `block${rngSeed}`, userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed });
      for (const target of standardRoster(l, 0)) {
        for (const o of blockOffers(l, target.pid)) {
          if (!o.offer.b.dpids.length) continue;
          // give the package's pick the id of a player in the same package (a salary filler, when
          // the money needed one), swapping with the pick that had it
          for (const pid of o.offer.b.pids) {
            const d = l.draftPicks.find((x) => x.dpid === o.offer.b.dpids[0])!;
            const other = l.draftPicks.find((x) => x.dpid === pid);
            const old = d.dpid;
            if (other) other.dpid = old;
            d.dpid = pid;
            const again = blockOffers(l, target.pid).find((x) => x.tid === o.tid);
            d.dpid = old;
            if (other) other.dpid = pid;
            tried++;
            // the same package, its picks under their swapped ids
            expect(again?.offer.b.pids).toEqual(o.offer.b.pids);
            expect(again?.offer.b.dpids.map((x) => (x === pid ? old : other && x === old ? pid : x))).toEqual(o.offer.b.dpids);
          }
        }
      }
    }
    expect(tried).toBeGreaterThan(0);
  }, 180_000);
});
