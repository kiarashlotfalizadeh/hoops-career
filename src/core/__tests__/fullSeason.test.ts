// One league played through a regular season and into the playoffs, read three ways.
// The season forecast: chances that add up (six top-six seeds and eight playoff teams a conference,
// one champion, one No. 1 pick, fourteen lottery teams), never a draw from the league's random stream
// and the same forecast for the same league, clinched and eliminated teams at exactly 100% and 0%,
// the playoffs read from the series as they stand, a game taken as won helping the team that won
// it, the user's weekly trail, and saves.
// All-Star Saturday: eight healthy shooters and four healthy dunkers from the rosters, scores in
// range, the winners with the award and the best final, the same league getting the same day, the
// league's random stream (and so the All-Star Game) untouched by it, a damaged result dropped on
// load, the contests a token among a career's honours, and the calibration over many contests; and
// award votes that read like the NBA's.
// Advanced numbers from the box scores as Basketball Reference works them out: PER averaging 15 over
// the league's minutes, win shares adding up to about the wins each team had, believable leaders, a
// season split between teams combined as a "TOT" line, imported seasons left as they came, nothing
// for the playoffs, and no change to the league.
import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { testLeague } from '../../state/__tests__/fixtures';
import { migrate } from '../../state/persistence';
import { accoladeScore, accolades } from '../../ui/league/shared';
import { advancedView } from '../../ui/stats';
import { forecast, forecastable, gameStakes, leagueForecast, pct, rosterWorth, type Forecast } from '../analysis/odds';
import { seasonAdvanced, type Advanced } from '../analysis/advanced';
import { createLeague, defaultSettings } from '../league/create';
import { hallOfFameScore, simDay } from '../league/season';
import { standings } from '../league/standings';
import { userGameOnDay } from '../league/games';
import { computeRegularSeasonAwards, missesAllStarGame, selectAllStars } from '../league/awards';
import { curTeamSeason, playerName, seasonTotals, standardRoster, statsLine } from '../league/helpers';
import {
  DUNK_FIELD,
  DUNK_FINALISTS,
  THREE_FIELD,
  THREE_FINALISTS,
  allStarSaturday,
  dunkField,
  dunkSkills,
  slamDunkContest,
  threeField,
  threePointContest,
  threeSkill,
} from '../league/allStarSaturday';
import { playerAge } from '../playerGen';
import { Rng } from '../random';
import type { Dunk, League, Player, SeasonAwards } from '../types';

const sum = (f: Forecast, k: (t: Forecast['teams'][number]) => number, conf?: 'E' | 'W', l?: League) =>
  f.teams.filter((t) => !conf || l!.teams[t.tid].conf === conf).reduce((a, t) => a + k(t), 0);

function expectConsistent(l: League, f: Forecast) {
  for (const conf of ['E', 'W'] as const) {
    expect(sum(f, (t) => t.top6, conf, l)).toBeCloseTo(6, 6);
    expect(sum(f, (t) => t.reach[0], conf, l)).toBeCloseTo(8, 6);
    expect(sum(f, (t) => t.seed1, conf, l)).toBeCloseTo(1, 6);
  }
  expect(sum(f, (t) => t.reach[1])).toBeCloseTo(8, 6);
  expect(sum(f, (t) => t.reach[2])).toBeCloseTo(4, 6);
  expect(sum(f, (t) => t.reach[3])).toBeCloseTo(2, 6);
  expect(sum(f, (t) => t.reach[4])).toBeCloseTo(1, 6);
  expect(sum(f, (t) => t.pick1)).toBeCloseTo(1, 6);
  expect(sum(f, (t) => t.top4)).toBeCloseTo(4, 6);
  expect(sum(f, (t) => t.lottery)).toBeCloseTo(14, 6);
  for (const t of f.teams) {
    // each stage is a subset of the one before
    for (let r = 1; r < 5; r++) expect(t.reach[r]).toBeLessThanOrEqual(t.reach[r - 1] + 1e-12);
    expect(t.lo).toBeLessThanOrEqual(t.w + 1e-9);
    expect(t.hi).toBeGreaterThanOrEqual(t.w - 1e-9);
    expect(t.reach[0] + t.lottery).toBeCloseTo(1, 6);
  }
}

const awardsOf = (l: League): SeasonAwards => l.awards.find((a) => a.season === l.season)!;
const total = (ds: Dunk[] | undefined) => (ds ?? []).reduce((a, d) => a + d.score, 0);
const allDunks = (e: NonNullable<SeasonAwards['saturday']>['dunk'][number]) => [...e.r1, ...(e.final ?? []), ...(e.r1Off ?? []), ...(e.finalOff ?? [])];

describe('a season played', () => {
  /** Before the first game, a month in, the morning of the All-Star day and the day after, late in the season, its end, and a few days into the playoffs. */
  let pre: League;
  let mid: League;
  let before: League;
  let after: League;
  let late: League;
  let regular: League;
  let playoffs: League;
  beforeAll(() => {
    const l = testLeague('odds');
    pre = structuredClone(l);
    pre.id = 'lg_odds_pre';
    // (the league's streams of its own are seeded from its id, which reads the clock: pinned, every run plays the same season)
    l.id = 'lg_odds';
    for (let i = 0; i < 30; i++) simDay(l);
    mid = structuredClone(l);
    while (l.day < l.allStarDay) simDay(l);
    before = structuredClone(l);
    simDay(l);
    after = structuredClone(l);
    while (l.day < 150) simDay(l);
    late = structuredClone(l);
    for (let i = 0; i < 400 && l.phase === 'regular'; i++) simDay(l);
    regular = structuredClone(l);
    for (let i = 0; i < 500 && l.phase !== 'playoffs'; i++) simDay(l);
    // a few days into the playoffs: series under way
    for (let i = 0; i < 4; i++) simDay(l);
    playoffs = l;
  }, 300_000);

  it('the forecast adds up at every stage, from the rosters to the series as they stand, and the screens read it', () => {
    // before the first game it reads the rosters, and adds up
    expect(forecastable(pre)).toBe(true);
    const f0 = forecast(pre)!;
    expect(f0.preseason).toBe(true);
    expectConsistent(pre, f0);
    // the most talented roster is a favourite; the projected records add up to a league's worth
    expect(Math.abs(sum(f0, (t) => t.w) - 41 * 30)).toBeLessThan(5);
    const fav = [...f0.teams].sort((a, b) => b.reach[4] - a.reach[4])[0];
    expect(fav.reach[4]).toBeGreaterThan(1 / 30);

    // never draws from the league's random stream, and the same league gets the same forecast
    {
      const x = structuredClone(mid);
      const before = JSON.stringify(x);
      const a = forecast(x)!;
      const b = forecast(x)!;
      expect(JSON.stringify(x)).toBe(before);
      expect(a).toEqual(b);
      expectConsistent(x, a);
      // the screens share one, worked out once for the league as it is
      expect(leagueForecast(x)).toBe(leagueForecast(x));
    }

    // mid-season, a better record and roster mean better odds
    {
      const f = forecast(mid)!;
      const rank = new Map(standings(mid).map((r) => [r.tid, r.confRank]));
      for (const conf of ['E', 'W'] as const) {
        const rows = f.teams.filter((t) => mid.teams[t.tid].conf === conf);
        const top = rows.filter((t) => rank.get(t.tid)! <= 3);
        const bottom = rows.filter((t) => rank.get(t.tid)! >= 13);
        const avg = (xs: typeof rows) => xs.reduce((a, t) => a + t.reach[0], 0) / xs.length;
        expect(avg(top)).toBeGreaterThan(avg(bottom));
      }
    }

    // late in the season, a clinched place reads 100% and an eliminated team 0%, exactly
    {
      const f = forecast(late)!;
      expectConsistent(late, f);
      const marks = new Map(standings(late).map((r) => [r.tid, r.clinched]));
      expect([...marks.values()].some(Boolean)).toBe(true);
      for (const t of f.teams) {
        if (marks.get(t.tid) === 'x') expect([t.top6, t.reach[0], t.clinched]).toEqual([1, 1, true]);
        if (marks.get(t.tid) === 'p') expect(t.top6 + t.playIn).toBeCloseTo(1, 9);
        if (marks.get(t.tid) === 'e') expect([t.reach[0], t.lottery, t.out]).toEqual([0, 1, true]);
      }
    }

    // in the playoffs, starts from the series as they stand
    {
      const f = forecast(playoffs)!;
      expect(f.seeded).toBe(true);
      expectConsistent(playoffs, f);
      for (const s of playoffs.playoffs.filter((x) => x.round === 1)) {
        for (const tid of [s.high, s.low]) {
          expect(f.teams[tid].reach[0]).toBe(1);
          expect(f.teams[tid].clinched).toBe(true);
        }
        // a series a team has won, or lost, is settled
        if (s.winner !== undefined) {
          expect(f.teams[s.winner].reach[1]).toBe(1);
          expect(f.teams[s.winner === s.high ? s.low : s.high].reach[1]).toBe(0);
        }
      }
      // up three games or more, a team is a big favourite in its series
      const up = playoffs.playoffs.find((s) => s.winner === undefined && Math.abs(s.highWins - s.lowWins) >= 3);
      if (up) {
        const lead = up.highWins > up.lowWins ? up.high : up.low;
        expect(f.teams[lead].reach[up.round]).toBeGreaterThan(0.5);
      }
      // the lottery's fourteen are settled too
      const out = playoffs.teams.filter((t) => !playoffs.playoffs.some((s) => s.round === 1 && (s.high === t.tid || s.low === t.tid)));
      for (const t of out) expect(f.teams[t.tid].lottery).toBe(1);
    }

    // a game taken as won helps the team that won it, from the same stream
    {
      const x = structuredClone(mid);
      const g = userGameOnDay(x, x.day) ?? x.schedule.find((s) => s.type === 'regular' && !s.played)!;
      const win = forecast(x, { fixed: { gid: g.gid, homeWon: true } })!;
      const loss = forecast(x, { fixed: { gid: g.gid, homeWon: false } })!;
      // every simulated season is the same but for that game: exactly one more win, and (but for the play-in's draws) better odds
      expect(win.teams[g.home].w - loss.teams[g.home].w).toBeCloseTo(1, 9);
      expect(win.teams[g.home].reach[0]).toBeGreaterThanOrEqual(loss.teams[g.home].reach[0] - 0.01);
      expect(win.teams[g.away].reach[0]).toBeLessThanOrEqual(loss.teams[g.away].reach[0] + 0.01);
      // the preview's stakes, from the team's side; nothing for a game it isn't in, or one already played
      const st = gameStakes(x, g.gid, g.away)!;
      expect(st.win).toBeGreaterThanOrEqual(st.loss - 0.01);
      expect(gameStakes(x, g.gid, x.teams.find((t) => t.tid !== g.home && t.tid !== g.away)!.tid)).toBeNull();
      const played = x.schedule.find((s) => s.played)!;
      expect(gameStakes(x, played.gid, played.home)).toBeNull();
    }

    // a weekly trail of the user's odds, and a damaged one goes on load
    {
      const tr = late.oddsTrail!;
      expect(tr.season).toBe(late.season);
      expect(tr.tid).toBe(late.userTid);
      // a point a week, in tenths of a percent
      expect(tr.pts.length).toBeGreaterThanOrEqual(20);
      for (let i = 1; i < tr.pts.length; i++) expect(tr.pts[i][0] - tr.pts[i - 1][0]).toBe(7);
      for (const p of tr.pts) for (const v of [p[1], p[2]]) expect(v >= 0 && v <= 1000 && Number.isInteger(v)).toBe(true);
      expect(JSON.stringify(tr).length).toBeLessThan(800);
      expect(migrate(structuredClone(late)).oddsTrail).toEqual(tr);
      const bad = structuredClone(late) as unknown as { oddsTrail: { pts: unknown[] } };
      bad.oddsTrail.pts.push([1, 2000, 0]);
      expect(migrate(bad).oddsTrail).toBeUndefined();
    }

    // quick enough to work out when a screen opens
    const t0 = performance.now();
    forecast(mid);
    expect(performance.now() - t0).toBeLessThan(2500);

    // nothing to forecast once the Finals are won
    const done = structuredClone(playoffs);
    for (let i = 0; i < 80 && forecastable(done); i++) simDay(done);
    expect(forecastable(done)).toBe(false);
    expect(forecast(done)).toBeNull();

    // what a roster is worth over the games left: an injured star counts for the games he will be back for
    const p = (pid: number, ovr: number, out = 0) =>
      ({ pid, ovr, injury: out ? { type: 'x', gamesRemaining: out, gamesTotal: out, severity: 'minor' } : null }) as unknown as Player;
    const team = [p(1, 90), ...Array.from({ length: 11 }, (_, i) => p(i + 2, 72 - i))];
    const healthy = rosterWorth(team, 40);
    const outAll = rosterWorth([p(1, 90, 60), ...team.slice(1)], 40);
    const outHalf = rosterWorth([p(1, 90, 20), ...team.slice(1)], 40);
    expect(outAll).toBeLessThan(outHalf);
    expect(outHalf).toBeLessThan(healthy);
    expect(outHalf).toBeCloseTo((healthy + outAll) / 2, 6);

    // chances read the way the screens show them
    expect(pct(0.643)).toBe('64%');
    expect(pct(1)).toBe('>99%');
    expect(pct(1, true)).toBe('100%');
    expect(pct(0)).toBe('<1%');
    expect(pct(0, true)).toBe('—');
    expect(pct(0.003)).toBe('<1%');
  }, 120_000);

  it('All-Star Saturday: the fields, the results, its own stream, saves and honours, the calibration; and award votes', () => {
    const sat = awardsOf(after).saturday!;

    // the fields: eight shooters and four dunkers, healthy (or with a knock that heals over the break) and
    // on a roster that morning, names and teams as they were
    expect(sat.three).toHaveLength(THREE_FIELD);
    expect(sat.dunk).toHaveLength(DUNK_FIELD);
    for (const e of [...sat.three, ...sat.dunk]) {
      const p = before.players[e.pid];
      expect(p.tid, e.name).toBeGreaterThanOrEqual(0);
      expect(e.tid).toBe(p.tid);
      expect(e.name).toBe(playerName(p));
      // the day heals a knock short enough to keep an All-Star his place before the contests
      if (p.injury) expect(missesAllStarGame(p), e.name).toBe(false);
    }
    expect(new Set(sat.three.map((e) => e.pid)).size).toBe(THREE_FIELD);
    expect(new Set(sat.dunk.map((e) => e.pid)).size).toBe(DUNK_FIELD);
    // shooters with the attempts; dunkers young high-flyers who are no All-Stars
    const games = Math.max(...before.teams.map((t) => t.seasons.find((s) => s.season === before.season)!).map((s) => s.won + s.lost));
    for (const e of sat.three) expect(seasonTotals(before.players[e.pid], before.season)!.tpa).toBeGreaterThanOrEqual(2.5 * games);
    const stars = new Set([...awardsOf(after).allStars.E, ...awardsOf(after).allStars.W]);
    for (const e of sat.dunk) {
      const p = before.players[e.pid];
      expect(stars.has(e.pid), e.name).toBe(false);
      expect(p.ovr).toBeLessThanOrEqual(84);
      // the real league has plenty of young athletes to ask
      expect(playerAge(p, before.season)).toBeLessThanOrEqual(26);
    }
    // a couple of All-Stars are invited when they are among the best shooters
    {
      const l = structuredClone(before);
      selectAllStars(l);
      const aw = awardsOf(l);
      aw.allStars = { E: [], W: [] };
      const first = threeField(l);
      // the next eight: hurt the first eight for a moment
      for (const p of first) p.injury = { type: 'Sprained Ankle', gamesRemaining: 1, gamesTotal: 1, severity: 'minor' };
      const next = threeField(l);
      for (const p of first) p.injury = null;
      aw.allStars = { E: [next[0].pid], W: [next[1].pid] };
      const field = threeField(l).map((p) => p.pid);
      expect(field).toHaveLength(THREE_FIELD);
      expect(field).toContain(next[0].pid);
      expect(field).toContain(next[1].pid);
      // in place of the two shooters ranked last
      expect(field.slice(0, 6)).toEqual(first.slice(0, 6).map((p) => p.pid));
    }

    // Three-Point Contest: 0-40 a round, the top three in the final, the winner with the best final and the award
    {
      for (const e of sat.three) {
        expect(Number.isInteger(e.r1) && e.r1 >= 0 && e.r1 <= 40).toBe(true);
        if (e.final !== undefined) expect(e.final >= 0 && e.final <= 40).toBe(true);
      }
      const finalists = sat.three.slice(0, THREE_FINALISTS);
      expect(finalists.every((e) => e.final !== undefined)).toBe(true);
      expect(sat.three.slice(THREE_FINALISTS).every((e) => e.final === undefined)).toBe(true);
      const cut = Math.min(...finalists.map((e) => e.r1));
      for (const e of sat.three.slice(THREE_FINALISTS)) {
        expect(e.r1).toBeLessThanOrEqual(cut);
        // level with a finalist: he lost a shoot-off
        if (e.r1 === cut) expect(e.r1Off?.length).toBeGreaterThan(0);
      }
      const [w] = sat.three;
      expect(w.final).toBe(Math.max(...finalists.map((e) => e.final!)));
      if (finalists.filter((e) => e.final === w.final).length > 1) expect(w.finalOff?.length).toBeGreaterThan(0);
      expect(after.players[w.pid].awards).toContainEqual({ season: after.season, type: 'Three-Point Contest' });
      const news = after.news.find((n) => n.kind === 'award' && n.text.includes('wins the Three-Point Contest'))!;
      expect(news.text.startsWith(w.name)).toBe(true);
      expect(news.text).toContain(`${w.final}`);
    }

    // Slam Dunk Contest: 30-50 a dunk with its name, two a round, the top two in the final, the winner with the best final and the award
    {
      for (const e of sat.dunk) {
        expect(e.r1).toHaveLength(2);
        for (const d of allDunks(e)) {
          expect(Number.isInteger(d.score) && d.score >= 30 && d.score <= 50).toBe(true);
          expect(d.text.length).toBeGreaterThan(3);
          // one he couldn't finish scores low
          if (d.miss) expect(d.score).toBeLessThanOrEqual(36);
        }
      }
      const finalists = sat.dunk.slice(0, DUNK_FINALISTS);
      expect(finalists.every((e) => e.final?.length === 2)).toBe(true);
      expect(sat.dunk.slice(DUNK_FINALISTS).every((e) => e.final === undefined)).toBe(true);
      const cut = Math.min(...finalists.map((e) => total(e.r1)));
      for (const e of sat.dunk.slice(DUNK_FINALISTS)) expect(total(e.r1)).toBeLessThanOrEqual(cut);
      const [w, second] = sat.dunk;
      expect(total(w.final)).toBeGreaterThanOrEqual(total(second.final));
      if (total(w.final) === total(second.final)) expect(w.finalOff?.length).toBeGreaterThan(0);
      expect(after.players[w.pid].awards).toContainEqual({ season: after.season, type: 'Slam Dunk Contest' });
      const news = after.news.find((n) => n.kind === 'award' && n.text.includes('wins the Slam Dunk Contest'))!;
      expect(news.text.startsWith(w.name)).toBe(true);
      expect(news.text).toMatch(/with a \d\d for /);
    }

    // only the two winners get a contest award, and the user hears about his players in one message
    const won = Object.values(after.players).flatMap((p) => p.awards.filter((a) => a.season === after.season && a.type.endsWith('Contest')).map(() => p.pid));
    expect(won.sort()).toEqual([sat.three[0].pid, sat.dunk[0].pid].sort());
    const mine = [...sat.three, ...sat.dunk].filter((e) => before.players[e.pid].tid === after.userTid);
    const mail = after.inbox.filter((m) => m.subject === 'All-Star Saturday' && m.season === after.season);
    expect(mail).toHaveLength(mine.length ? 1 : 0);
    for (const e of mine) expect(mail[0].body).toContain(e.name);

    // its own random stream: the same league gets the same Saturday whatever state the league stream is in, and leaves it where it was
    {
      const a = structuredClone(before);
      const b = structuredClone(before);
      b.rng = (b.rng ^ 0x5bd1e995) >>> 0;
      for (const l of [a, b]) {
        selectAllStars(l);
        // as the day does: knocks short enough to keep an All-Star his place heal over the break
        for (const p of Object.values(l.players)) if (p.tid >= 0 && p.injury && !missesAllStarGame(p)) p.injury = null;
      }
      const rng = a.rng;
      allStarSaturday(a);
      expect(a.rng).toBe(rng);
      allStarSaturday(b);
      expect(awardsOf(b).saturday).toEqual(awardsOf(a).saturday);
      // and it's the Saturday the day itself held
      expect(awardsOf(a).saturday).toEqual(sat);
    }
    // the All-Star Game and the league stream after the day are what they would be without it
    {
      const without = structuredClone(before);
      let aw = without.awards.find((a) => a.season === without.season);
      if (!aw) {
        aw = { season: without.season, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } };
        without.awards.push(aw);
      }
      // a Saturday already held is never held again
      aw.saturday = { three: [], dunk: [] };
      simDay(without);
      expect(without.rng).toBe(after.rng);
      expect(awardsOf(without).allStarMvp).toBe(awardsOf(after).allStarMvp);
      expect(Object.values(without.players).some((p) => p.awards.some((a) => a.type.endsWith('Contest')))).toBe(false);
    }

    // an intact Saturday survives a load; a damaged one is dropped and the rest of the awards stay
    expect(awardsOf(migrate(structuredClone(after))).saturday).toEqual(sat);
    const damage: ((s: SeasonAwards['saturday'] & object) => void)[] = [
      (s) => (s.three[0].r1 = 41),
      (s) => ((s.dunk[0].r1[0] as unknown as { score: string }).score = 'x'),
      (s) => ((s.dunk[1] as unknown as { r1: unknown }).r1 = null),
      (s) => (s.three[2].tid = 999),
      (s) => (s.dunk.push(...s.dunk.slice(0, 1)), s.dunk.push(...s.dunk.slice(0, 1))),
    ];
    for (const f of damage) {
      const x = structuredClone(after);
      f(awardsOf(x).saturday!);
      const back = awardsOf(migrate(x));
      expect(back.saturday).toBeUndefined();
      expect(back.allStars).toEqual(awardsOf(after).allStars);
    }
    const junk = structuredClone(after);
    (awardsOf(junk) as unknown as { saturday: unknown }).saturday = 'junk';
    expect(awardsOf(migrate(junk)).saturday).toBeUndefined();

    // a contest win is a token among the honours: nothing toward the Hall of Fame, a quarter point in the rankings, a chip after All-Star MVP
    {
      const p = structuredClone(after.players[sat.three[0].pid]);
      const base = { hof: hallOfFameScore(after, p), acc: accoladeScore(p) };
      for (let i = 0; i < 3; i++) p.awards.push({ season: after.season + i, type: 'Three-Point Contest' }, { season: after.season + i, type: 'Slam Dunk Contest' });
      expect(hallOfFameScore(after, p)).toBe(base.hof);
      expect(accoladeScore(p)).toBeCloseTo(base.acc + 1.5);
      const chips = accolades({ ...p, awards: [...p.awards, { season: 1, type: 'All-Star MVP' }] }).map((a) => a.label);
      expect(chips.indexOf('Three-Point Contest')).toBe(chips.indexOf('All-Star MVP') + 1);
      expect(chips).toContain('Dunk Contest');
    }

    // calibration, over the fields this league invites at its break, as in the contests' calibration notes
    {
      const l = structuredClone(before);
      selectAllStars(l);
      const shooters = threeField(l).map((p) => threeSkill(p, l.season));
      const dunkers = dunkField(l);
      const q = dunkSkills(l, dunkers);
      const N = 3000;
      // Three-Point Contest: first rounds average about 21, the winning final 24-29
      let rng = new Rng(2027);
      let r1 = 0;
      let won3 = 0;
      for (let i = 0; i < N; i++) {
        const res = threePointContest(
          rng,
          shooters.map((skill, pid) => ({ entry: { pid, name: '', tid: 0, r1: 0 }, skill })),
        );
        r1 += res.reduce((a, e) => a + e.r1, 0) / res.length;
        won3 += res[0].final!;
        expect(res.every((e) => e.r1 >= 0 && e.r1 <= 40)).toBe(true);
      }
      expect(r1 / N).toBeGreaterThan(18);
      expect(r1 / N).toBeLessThan(23);
      expect(won3 / N).toBeGreaterThan(24);
      expect(won3 / N).toBeLessThan(29);
      // Slam Dunk Contest: a finished dunk averages in the 40s, about one in ten missed, the winning final near 90
      rng = new Rng(2027);
      const made: number[] = [];
      let missed = 0;
      let wonDunk = 0;
      for (let i = 0; i < N; i++) {
        const res = slamDunkContest(
          rng,
          dunkers.map((_, pid) => ({ entry: { pid, name: '', tid: 0, r1: [] }, q: q[pid] })),
        );
        for (const d of res.flatMap(allDunks)) {
          expect(d.score >= 30 && d.score <= 50).toBe(true);
          if (d.miss) missed++;
          else made.push(d.score);
        }
        wonDunk += total(res[0].final);
      }
      const mean = made.reduce((a, b) => a + b, 0) / made.length;
      expect(mean).toBeGreaterThan(41);
      expect(mean).toBeLessThan(47);
      expect(missed / (missed + made.length)).toBeGreaterThan(0.05);
      expect(missed / (missed + made.length)).toBeLessThan(0.16);
      // (the field is whoever this league's first half left healthy: a point either way is the field, not the contest)
      expect(wonDunk / N).toBeGreaterThan(84);
      expect(wonDunk / N).toBeLessThan(96);
    }

    // award votes: an MVP from a contender, a Most Improved Player who broke out rather than got minutes,
    // a Defensive Player of the Year who isn't simply the best team's go-to scorer
    {
      const U = 19;
      const fictional = createLeague({ name: 'a', userTid: U, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
      /** Every rostered player gets a quiet season (6 a game in 24 minutes); `line` sets one player's. */
      const seasonOf = (l: League) => {
        for (const t of l.teams) [curTeamSeason(l, t.tid).won, curTeamSeason(l, t.tid).lost] = [41, 41];
        const line = (p: Player, o: { gp?: number; gs?: number; mpg?: number; ppg: number; bpg?: number }, season = l.season) => {
          const gp = o.gp ?? 70;
          const s = statsLine(p, season, p.tid, false);
          Object.assign(s, { gp, gs: o.gs ?? gp, min: (o.mpg ?? 24) * gp, pts: o.ppg * gp, fgm: (o.ppg / 2.2) * gp, fga: (o.ppg / 1.1) * gp, blk: (o.bpg ?? 0) * gp });
        };
        for (const p of Object.values(l.players)) if (p.tid >= 0) line(p, { ppg: 6 });
        return line;
      };
      const veterans = (l: League, tid: number) => standardRoster(l, tid).filter((p) => p.draft.year !== l.season - 1);
      // MVP: a contender's star over a bigger scorer on a .500 team
      {
        const l = structuredClone(fictional);
        const line = seasonOf(l);
        const other = l.teams.find((t) => t.tid !== U)!.tid;
        const [mine] = veterans(l, U);
        const [theirs] = veterans(l, other);
        [curTeamSeason(l, U).won, curTeamSeason(l, U).lost] = [62, 20];
        line(mine, { ppg: 28, mpg: 35 });
        line(theirs, { ppg: 33, mpg: 35 });
        expect(computeRegularSeasonAwards(l).mvp).toBe(mine.pid);
      }
      // Most Improved: a breakout from a real role, not a bench player handed minutes
      {
        const l = structuredClone(fictional);
        const line = seasonOf(l);
        const [benchGuy, breakout] = veterans(l, U);
        // 2 points in 3 minutes to 12 in 26
        line(benchGuy, { ppg: 2, mpg: 3, gp: 40 }, l.season - 1);
        line(benchGuy, { ppg: 12, mpg: 26 });
        // 12 in 24 to 20 in 32
        line(breakout, { ppg: 12, mpg: 24 }, l.season - 1);
        line(breakout, { ppg: 20, mpg: 32 });
        expect(computeRegularSeasonAwards(l).mip).toBe(breakout.pid);
      }
      // Defensive Player of the Year: a 32-point scorer's blocks don't outweigh a defender's
      {
        const l = structuredClone(fictional);
        const line = seasonOf(l);
        const [scorer, anchor] = veterans(l, U);
        // the league's best defender by his ratings, twice over
        Object.assign(scorer.ratings, { perD: 95, intD: 95, blk: 95, stl: 90, diq: 95, hgt: 85 });
        anchor.ratings = { ...scorer.ratings };
        line(scorer, { ppg: 32, mpg: 34, bpg: 2.2 });
        line(anchor, { ppg: 12, mpg: 34, bpg: 2.0 });
        expect(computeRegularSeasonAwards(l).dpoy).toBe(anchor.pid);
      }
    }
  }, 120_000);

  it('advanced numbers: PER averages 15, win shares add up to the wins, believable leaders, a split season combined, imports and the playoffs left alone', () => {
    const l = regular;
    const rows: { p: Player; a: Advanced; min: number }[] = Object.values(l.players).flatMap((p) => {
      const a = seasonAdvanced(l, p, l.season);
      const min = p.stats.filter((s) => s.season === l.season && !s.playoffs && !s.real).reduce((x, s) => x + s.min, 0);
      return a ? [{ p, a, min }] : [];
    });

    // PER averages 15 over the league's minutes
    expect(rows.length).toBeGreaterThan(400);
    const per = rows.reduce((x, r) => x + r.a.per * r.min, 0) / rows.reduce((x, r) => x + r.min, 0);
    expect(per).toBeCloseTo(15, 6);

    // win shares add up to about each team's wins
    const byTeam = new Map<number, number>();
    for (const { p, a } of rows) {
      const lines = p.stats.filter((s) => s.season === l.season && !s.playoffs && !s.real && s.min > 0);
      const tot = lines.reduce((x, s) => x + s.min, 0);
      for (const s of lines) byTeam.set(s.tid, (byTeam.get(s.tid) ?? 0) + (a.ws * s.min) / tot);
    }
    let se = 0;
    let ws = 0;
    let wins = 0;
    for (const t of l.teams) {
      const won = t.seasons.find((s) => s.season === l.season)!.won;
      se += ((byTeam.get(t.tid) ?? 0) - won) ** 2;
      ws += byTeam.get(t.tid) ?? 0;
      wins += won;
    }
    expect(Math.abs(ws - wins) / wins).toBeLessThan(0.05);
    expect(Math.sqrt(se / l.teams.length)).toBeLessThan(5);

    // leaders look like a season of the NBA
    const full = rows.filter((r) => r.min >= 1500);
    const top = (f: (a: Advanced) => number) => Math.max(...full.map((r) => f(r.a)));
    expect(top((a) => a.ws)).toBeGreaterThan(8);
    expect(top((a) => a.ws)).toBeLessThan(22);
    expect(top((a) => a.per)).toBeGreaterThan(22);
    expect(top((a) => a.per)).toBeLessThan(40);
    expect(top((a) => a.ws48)).toBeLessThan(0.4);
    for (const { a } of full) {
      expect(a.ws).toBeCloseTo(a.ows + a.dws, 9);
      for (const k of ['usg', 'astPct', 'trbPct', 'stlPct', 'blkPct', 'tovPct'] as const) expect(a[k] >= 0 && a[k] <= 100, k).toBe(true);
      expect(a.ortg).toBeGreaterThan(70);
      expect(a.ortg).toBeLessThan(160);
    }

    // a season split between teams reads as the two lines combined
    {
      const { p } = rows.find((r) => r.min > 1500 && r.p.stats.filter((s) => s.season === l.season && !s.playoffs).length === 1)!;
      const line = p.stats.find((s) => s.season === l.season && !s.playoffs)!;
      const other = (line.tid + 1) % l.teams.length;
      const half = (k: number) => Math.round(k / 2);
      const keys = ['gp', 'gs', 'min', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pts'] as const;
      const first = { ...line };
      const second = { ...line, tid: other };
      for (const k of keys) {
        first[k] = half(line[k]);
        second[k] = line[k] - first[k];
      }
      const a = seasonAdvanced(l, { ...p, stats: [first, second] }, l.season)!;
      const one = seasonAdvanced(l, { ...p, stats: [first] }, l.season)!;
      const two = seasonAdvanced(l, { ...p, stats: [second] }, l.season)!;
      expect(a.ws).toBeCloseTo(one.ws + two.ws, 9);
      expect(a.per).toBeCloseTo((one.per * first.min + two.per * second.min) / (first.min + second.min), 9);
      expect(a.ws48).toBeCloseTo(((one.ws + two.ws) * 48) / (first.min + second.min), 9);
    }

    // imported seasons keep Basketball Reference's numbers; the playoffs have none; the league is only read
    const vet = Object.values(l.players).find((p) => p.stats.some((s) => s.real && s.adv && !s.playoffs))!;
    const real = vet.stats.find((s) => s.real && s.adv && !s.playoffs)!;
    expect(seasonAdvanced(l, vet, real.season)).toBeNull();
    expect(advancedView(l, vet, real)).toMatchObject({ per: real.adv!.per, ws: real.adv!.ws, bpm: real.adv!.bpm });
    const sim = rows[0];
    const line = sim.p.stats.find((s) => s.season === l.season && !s.playoffs)!;
    expect(advancedView(l, sim.p, line)).toMatchObject({ per: sim.a.per, ws: sim.a.ws, computed: true });
    expect(advancedView(l, sim.p, { ...line, playoffs: true })).toBeNull();
    const before = JSON.stringify(l);
    for (const r of rows.slice(0, 50)) seasonAdvanced(l, r.p, l.season);
    expect(JSON.stringify(l)).toBe(before);

    // a whole league's season works out quickly
    const t0 = performance.now();
    for (const p of Object.values(l.players)) seasonAdvanced(l, p, l.season);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
