// The development watch (devWatch.ts): the snapshots behind the arrows, the arrows themselves,
// breakouts, the monthly report's groups, pruning, and that none of it changes how a league plays out.
import { describe, expect, it, vi } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { refreshDerived } from '../league/progression';
import { teamPlayers } from '../league/helpers';
import { playerAge } from '../playerGen';
import { RETIRED, type League, type Player } from '../types';
import {
  devBase,
  devCheckIn,
  devDay,
  devReport,
  devSeasonEnd,
  devTag,
  growthStory,
  isBreakout,
  isRookie,
  ovrChange,
  ratingDeltas,
  reportMail,
  seasonMoves,
  seasonTrail,
  unpackRatings,
} from '../league/devWatch';
import { RATING_KEYS, attrDisplay } from '../ratings';
import { hashString } from '../random';

const fresh = (seed = 5) => {
  const l = createLeague({ name: 'd', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: seed });
  l.id = `devwatch-${seed}`;
  return l;
};

/** A league on opening night with the watch's snapshot taken (the first day played). */
function opened(seed = 5): League {
  const l = fresh(seed);
  while (teamPlayers(l, 0).filter((p) => !p.contract.twoWay).length > 15) teamPlayers(l, 0).pop()!.tid = -1;
  expect(startRegularSeason(l)).toEqual([]);
  simDay(l);
  return l;
}

/** Lift every rating of a player by `by` raw points (about by × 0.6 on the 40-99 scale) and refresh his OVR. */
function lift(l: League, p: Player, by: number) {
  for (const k of RATING_KEYS) if (k !== 'hgt') p.ratings[k] = Math.min(100, p.ratings[k] + by);
  refreshDerived(l, p);
}

const youngest = (l: League, tid = 0) => teamPlayers(l, tid).sort((a, b) => playerAge(a, l.season) - playerAge(b, l.season) || a.pid - b.pid)[0];

/** A league's course as a hash: every result, every player's ratings and team, the moves and the random stream's state. */
function fingerprint(l: League) {
  const parts = [String(l.rng)];
  for (const g of l.games) parts.push(`${g.gid}:${g.home.pts}-${g.away.pts}`);
  for (const p of Object.values(l.players)) parts.push(`${p.pid}:${p.tid}:${p.ovr}:${RATING_KEYS.map((k) => p.ratings[k]).join(',')}`);
  parts.push(JSON.stringify(l.transactions ?? []));
  const all = parts.join(';');
  // a hash and the length: two runs that differ anywhere differ here
  return `${hashString(all)}:${all.length}`;
}

describe('the development watch', () => {
  it('snapshots the league, draws the arrows, spots breakouts, writes the monthly report, and changes nothing about how a league plays out', async () => {
    const base = opened();
    const copy = () => structuredClone(base);

    // opening night writes down every rostered player, and a check-in only the ones who moved
    {
      const l = copy();
      const dw = l.devWatch!;
      expect(dw.season).toBe(l.season);
      const rostered = Object.values(l.players).filter((p) => p.tid >= 0);
      expect(Object.keys(dw.start).length).toBe(rostered.length);
      expect(dw.checks).toEqual([]);
      const p = youngest(l);
      const before = p.ovr;
      lift(l, p, 6);
      expect(p.ovr).toBeGreaterThan(before);
      l.day = 45;
      devCheckIn(l, []);
      expect(dw.checks.length).toBe(1);
      expect(dw.checks[0].ovr[p.pid]).toBe(p.ovr);
      // everyone else held: a check-in stays small
      expect(Object.keys(dw.checks[0].ovr).length).toBe(1);
      expect(seasonMoves(l, p)).toEqual({ sinceOpening: p.ovr - before, sinceCheck: 0 });
      expect(seasonTrail(l, p).map((x) => x.ovr)).toEqual([before, p.ovr]);
    }

    // the season end packs each player’s ratings in a character apiece, and next season measures from it
    {
      const l = copy();
      const p = youngest(l);
      devSeasonEnd(l);
      const end = l.devWatch!.ends!.find((s) => s.season === l.season)!;
      expect(end.ovr[p.pid]).toBe(p.ovr);
      const r = unpackRatings(end.r[p.pid]);
      for (const k of RATING_KEYS) expect(r[k]).toBe(attrDisplay(p.ratings[k]));
      // a summer later: the arrows read from that end
      l.season++;
      l.phase = 'preseason';
      lift(l, p, 4);
      const b = devBase(l, p);
      expect(b.since).toBe('last');
      expect(b.ovr).toBe(end.ovr[p.pid]);
      expect(ovrChange(l, p)).toBe(p.ovr - end.ovr[p.pid]);
      const d = ratingDeltas(l, p);
      expect(d.tp).toBe(attrDisplay(p.ratings.tp) - r.tp!);
      // the size of the height rating never moves, so it's never an arrow
      expect(d.hgt).toBeUndefined();
    }

    // players who leave the league leave the snapshots
    {
      const l = copy();
      const p = youngest(l, 3);
      expect(l.devWatch!.start[p.pid]).toBeDefined();
      p.tid = RETIRED;
      l.day = 45;
      devCheckIn(l, []);
      expect(l.devWatch!.start[p.pid]).toBeUndefined();
    }

    // most days do nothing
    {
      const l = copy();
      const before = JSON.stringify(l.devWatch);
      l.day = 12;
      devDay(l);
      expect(JSON.stringify(l.devWatch)).toBe(before);
    }

    // a young player far past what his age adds is a breakout, and the league hears about a good one
    {
      const l = copy();
      const p = Object.values(l.players).find((x) => x.tid > 0 && playerAge(x, l.season) <= 23 && x.ovr >= 60)!;
      expect(isBreakout(l, p)).toBe(false);
      lift(l, p, 10);
      expect(ovrChange(l, p)).toBeGreaterThanOrEqual(4);
      expect(isBreakout(l, p)).toBe(true);
      expect(devTag(l, p)).toBe('Breakout');
      const news = l.news.length;
      l.day = 45;
      devCheckIn(l, []);
      expect(l.devWatch!.told).toContain(`b:${p.pid}`);
      if (p.ovr >= 66) expect(l.news.slice(news).some((n) => n.pids.includes(p.pid) && n.head)).toBe(true);
      // once: the next check-in doesn't report him again
      const after = l.news.length;
      l.day = 90;
      devCheckIn(l, []);
      expect(l.news.slice(after).some((n) => n.pids.includes(p.pid))).toBe(false);
    }

    // a veteran down four or more is declining; an older player is never a breakout
    {
      const l = copy();
      const p = Object.values(l.players).find((x) => x.tid >= 0 && playerAge(x, l.season) >= 31)!;
      lift(l, p, 12);
      expect(isBreakout(l, p)).toBe(false);
      lift(l, p, -24);
      expect(ovrChange(l, p)).toBeLessThanOrEqual(-4);
      expect(devTag(l, p)).toBe('Declining');
    }

    // the report groups the young players by the month (and the year behind it), the veterans apart, with a reason for each
    {
      const l = copy();
      l.day = 45;
      devCheckIn(l, []);
      const young = teamPlayers(l, 0)
        // (rookies are watched on their own, apart from the groups)
        .filter((p) => playerAge(p, l.season) <= 26 && !isRookie(l, p))
        .sort((a, b) => a.pid - b.pid);
      expect(young.length).toBeGreaterThanOrEqual(2);
      const [up, down] = young;
      lift(l, up, 3);
      lift(l, down, -3);
      l.day = 90;
      // the report reads the league as it stands: before the next snapshot, the month's moves show
      const r = devReport(l);
      expect(r.rising.map((x) => x.pid)).toContain(up.pid);
      expect(r.slipping.map((x) => x.pid)).toContain(down.pid);
      for (const x of [...r.rising, ...r.holding, ...r.slipping]) expect(x.reason.length).toBeGreaterThan(5);
      const vets = teamPlayers(l, 0).filter((p) => playerAge(p, l.season) > 26 && !isRookie(l, p));
      expect(r.veterans.sort()).toEqual(vets.map((p) => p.pid).sort());
      expect(r.watch).toBeDefined();
      const mail = reportMail(l, r);
      expect(mail.subject).toMatch(/^Development report: /);
      expect(mail.body).toContain('Rising:');
      expect(mail.body).toContain('Slipping:');
      // true minus signs, never a hyphen for a drop
      expect(mail.body).not.toMatch(/ -\d/);
    }

    // a check-in sends the user one report, linked to Team → Growth; a quiet month (no one rising or slipping) none
    {
      const l = copy();
      const mails = l.inbox.length;
      const m = () => l.inbox.slice(0, l.inbox.length - mails).filter((x) => x.from === 'Player Development');
      l.day = 45;
      devCheckIn(l, []);
      expect(m().length).toBe(0);
      const up = teamPlayers(l, 0)
        .filter((p) => playerAge(p, l.season) <= 26 && !isRookie(l, p))
        .sort((a, b) => a.pid - b.pid)[0];
      lift(l, up, 3);
      l.day = 90;
      devCheckIn(l, []);
      expect(m().length).toBe(1);
      expect(m()[0].link).toBe('/team/growth');
    }

    // his story says where his career stands
    {
      const l = copy();
      const young = Object.values(l.players).find((p) => p.tid >= 0 && playerAge(p, l.season) <= 21)!;
      const old = Object.values(l.players).find((p) => p.tid >= 0 && playerAge(p, l.season) >= 31 && playerAge(p, l.season) <= 33)!;
      expect(growthStory(l, young)).toMatch(/peak/);
      expect(growthStory(l, old)).toMatch(/^Past his peak/);
    }

    // a league plays out the same with the watch as without it (through two check-ins)
    const run = async () => {
      const { createLeague: create, defaultSettings: settings } = await import('../league/create');
      const S = await import('../league/season');
      const l = create({ name: 'o', userTid: 0, coachName: 'c', settings: settings(), seed: null, rngSeed: 11 });
      l.id = 'devwatch-outcomes';
      for (const p of Object.values(l.players)
        .filter((x) => x.tid === 0 && !x.contract.twoWay)
        .slice(15))
        p.tid = -1;
      expect(S.startRegularSeason(l)).toEqual([]);
      for (let i = 0; i < 95; i++) S.simDay(l);
      return { fp: fingerprint(l), watched: !!l.devWatch };
    };
    const real = await run();
    expect(real.watched).toBe(true);
    vi.resetModules();
    vi.doMock('../league/devWatch', () => ({ devDay: () => {}, devSeasonEnd: () => {}, devCheckIn: () => {} }));
    const without = await run();
    vi.doUnmock('../league/devWatch');
    vi.resetModules();
    expect(without.watched).toBe(false);
    expect(without.fp).toBe(real.fp);
  }, 300_000);
});
