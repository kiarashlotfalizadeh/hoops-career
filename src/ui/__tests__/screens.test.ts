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
import { curTeamSeason, payroll, standardRoster } from '../../core/league/helpers';
import { agenda } from '../../core/league/agenda';
import { CAP } from '../../core/constants';
import { RETIRED, type GameResult, type League, type PlayoffSeries } from '../../core/types';
import { matchScore, normalize, search, searchIndex } from '../search';
import { defaultTeam, ownerLine, rosterLine, seedRosterSizes, teamPreviews } from '../newLeague';
import { ownerPersonality, planOwnerGoals } from '../../core/league/ownerGoals';
import { seasonOutcome } from '../league/shared';
import { editOf as playerEdit, formOf as playerForm } from '../god/PlayerEditor';
import { editOf as teamEdit, formOf as teamForm } from '../god/TeamEditor';
import { blockOffers } from '../office/tradeBlock';
import { GLOSSARY, glossaryEntry } from '../glossary';

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
      {
        // the glossary: one entry per id, the core jargon in it, and every <Term id> on a screen resolves
        const ids = GLOSSARY.map((g) => g.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ['counter', 'luck', 'keys', 'measured', 'per', 'ws', 'closer', 'sta', 'gb', 'playin', 'roles', 'pb-helio', 'role-glue', 'drole-poa'])
          expect(glossaryEntry(id), id).toBeTruthy();
        expect(search(index, 'luck').some((e) => e.kind === 'term' && e.termId === 'luck')).toBe(true);
        const sources = import.meta.glob<string>('../**/*.tsx', { query: '?raw', import: 'default', eager: true });
        const used = Object.values(sources).flatMap((src) => [...src.matchAll(/<Term id="([\w-]+)"/g)].map((m) => m[1]));
        expect(used.length).toBeGreaterThan(20);
        expect(used.filter((id) => !glossaryEntry(id))).toEqual([]);
      }
      expect(search(index, 'next game')[0]).toMatchObject({ kind: 'screen', to: '/preview' });
      expect(search(index, 'draft order')[0]).toMatchObject({ kind: 'screen', to: '/league/standings?view=lottery' });
      expect(search(index, 'injured')[0]).toMatchObject({ kind: 'screen', to: '/league/news?kind=injury' });
      expect(search(index, 'big moments')[0]).toMatchObject({ kind: 'screen', to: '/settings' });
      expect(search(index, 'fa')[0]).toMatchObject({ title: 'Free agents' }); // a whole word before "Hall of Fame"
      // the GM's words, and one row per screen (rows are keyed by id)
      expect(search(index, 'contracts')[0]).toMatchObject({ kind: 'screen', to: '/team?view=contracts' });
      expect(search(index, 'contract')[0]).toMatchObject({ kind: 'screen', to: '/team?view=contracts' });
      expect(search(index, 'salaries')[0]).toMatchObject({ kind: 'screen', to: '/team?view=contracts' });
      expect(search(index, 'cap sheet')[0]).toMatchObject({ kind: 'screen', to: '/office' });
      expect(search(index, 'extend')[0]).toMatchObject({ kind: 'screen', to: '/office/resign' });
      expect(search(index, 'player roles')[0]).toMatchObject({ kind: 'screen', to: '/team/tactics' });
      expect(search(index, 'playoff odds')[0]).toMatchObject({ kind: 'screen', to: '/league/standings' });
      expect(new Set(index.map((e) => e.id)).size).toBe(index.length);
      // your last game's report, once there is one
      expect(index.some((e) => e.title === 'Last game')).toBe(false);
      const played = { ...league, games: [{ gid: 7, season: league.season, home: { tid: 0 }, away: { tid: league.userTid } } as unknown as GameResult] };
      expect(search(searchIndex(played), 'box score')[0]).toMatchObject({ title: 'Last game', to: '/game/7' });

      // players by their initials and a slip of a letter, below every true match
      if (seed.players.length) {
        expect(find('sga')[0]).toBe('Shai Gilgeous-Alexander');
        expect(find('kat')[0]).toBe('Karl-Anthony Towns');
        expect(find('holmgrn')[0]).toBe('Chet Holmgren');
        expect(find('shia')[0]).toBe('Shai Gilgeous-Alexander');
      }
      const tatum = { ...index.find((x) => x.kind === 'player')!, words: ['jayson', 'tatum'], full: 'jayson tatum' };
      expect(matchScore(tatum, 'tatm')).toBe(200);
      expect(matchScore(tatum, 'tat')).toBeGreaterThan(200);
      expect(matchScore(tatum, 'tum')).toBe(300);
      expect(matchScore(tatum, 'tam')).toBe(0); // no slips under four letters

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
      // the team step's pick before the user makes one: nearest the middle of the strength ranks with a
      // legal roster under the tax (no cuts, no apron goal on day one); none qualifying, no pick
      const rank = Object.fromEntries(Object.keys(sizes).map((t, i) => [+t, i + 1])) as Record<number, number>;
      const pick = defaultTeam(seed, rank)!;
      expect(sizes[pick]).toBeGreaterThanOrEqual(CAP.rosterMin);
      expect(sizes[pick]).toBeLessThanOrEqual(CAP.rosterMax);
      const mine = createLeague({ name: 'd', userTid: pick, coachName: 'c', settings: defaultSettings(), seed, rngSeed: 3 });
      expect(payroll(mine, pick)).toBeLessThan(CAP.luxuryTax);
      expect(agenda(mine).some((i) => i.required)).toBe(false);
      expect(defaultTeam({ ...seed, players: seed.players.map((p) => ({ ...p, contract: p.contract && { ...p.contract, salaries: [CAP.luxuryTax] } })) }, rank)).toBeNull();
    }
    // and says what opening night needs
    expect(rosterLine(CAP.rosterMax + 1)).toBe(`${CAP.rosterMax + 1} players · 1 to cut before opening night`);
    expect(rosterLine(CAP.rosterMax)).toBe(`${CAP.rosterMax} players`);
    expect(rosterLine(CAP.rosterMax - 2)).toBe(`${CAP.rosterMax - 2} players · 2 open spots`);
    expect(rosterLine(CAP.rosterMin - 1)).toBe(`${CAP.rosterMin - 1} players · 1 to sign before opening night`);
    // and what each owner asks on day one, from the league it previews with the id and seed Start
    // career creates with: the goals and the owner the user gets, whichever team he takes (a
    // fictional league's rosters ranked as well)
    {
      const made = { id: 'lg_preview_1', rngSeed: 11 };
      const make = (userTid: number) => createLeague({ name: 'p', userTid, coachName: 'c', settings: defaultSettings(), seed: null, ...made });
      const teams = teamPreviews(make(0));
      expect(new Set(Object.values(teams).map((t) => t.rank)).size).toBe(30);
      for (const tid of [7, 21]) {
        const own = make(tid);
        const og = planOwnerGoals(own, tid)!;
        expect(own.id).toBe(made.id);
        expect(teams[tid].who).toBe(ownerPersonality(own, tid));
        expect(teams[tid].wins).toBe(og.goals.find((g) => g.kind === 'wins')!.target);
        expect(teams[tid].level).toBe(og.goals.find((g) => g.kind === 'postseason')?.target ?? 0);
      }
      expect(ownerLine({ wins: 32, level: 0, who: 'builder' })).toBe('Owner: 32 wins · rebuild · builder');
      // with one difficulty the poster's owner is the one you get: the league built with that team as yours asks the same
      {
        const mine = createLeague({ name: 'p', userTid: 21, coachName: 'c', settings: defaultSettings(), seed: null, ...made });
        const og = planOwnerGoals(mine, 21)!;
        expect(og.goals.find((g) => g.kind === 'wins')!.target).toBe(teams[21].wins);
        expect(og.goals.find((g) => g.kind === 'postseason')?.target ?? 0).toBe(teams[21].level);
      }
    }

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
