import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { League } from '../types';

// The press can be switched off for one clone (the world's hooks then do nothing for it), to show
// the league plays out the same either way.
const press = vi.hoisted(() => ({ on: true }));
vi.mock('../league/media', async (importOriginal) => {
  const real = await importOriginal<typeof import('../league/media')>();
  return {
    ...real,
    mediaGame: (...a: Parameters<typeof real.mediaGame>) => (press.on ? real.mediaGame(...a) : undefined),
    mediaDay: (...a: Parameters<typeof real.mediaDay>) => (press.on ? real.mediaDay(...a) : undefined),
    mediaSeasonStart: (...a: Parameters<typeof real.mediaSeasonStart>) => (press.on ? real.mediaSeasonStart(...a) : undefined),
    mediaSeasonEnd: (...a: Parameters<typeof real.mediaSeasonEnd>) => (press.on ? real.mediaSeasonEnd(...a) : undefined),
  };
});

import { createLeague, defaultSettings } from '../league/create';
import { simDay, startRegularSeason } from '../league/season';
import { CAP, seasonLabel } from '../constants';
import { teamPlayers } from '../league/helpers';
import { BODIES_KEPT, frontPage, latestPower, mediaDay, prune, seasonHonors } from '../league/media';
import { publish } from '../league/media/voice';
import { gradeTrade } from '../league/media/grades';
import { pressGame } from '../league/media/nights';
import { executeTrade } from '../league/trades';
import { GRADES } from '../league/media/voice';
import { CHRONICLE_STORIES, chronicleFarewell, chronicleOf, chronicleSeason } from '../league/media/chronicle';
import { anniversaryOf, awardLine, droughtLine, rematchLine, titleLine } from '../league/media/history';
import { emptyBook } from '../league/records';

const DAYS = 46;

function fresh(): League {
  const league = createLeague({ name: 'press', userTid: 4, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 77 });
  league.id = 'press_test';
  for (const p of teamPlayers(league, 4).slice(CAP.rosterMax)) p.tid = -1;
  return league;
}

function play(league: League, days: number) {
  expect(startRegularSeason(league)).toEqual([]);
  for (let i = 0; i < days; i++) simDay(league);
  return league;
}

/** Every result's score, the league's random stream and its moves: what the press must never change. */
const fingerprint = (l: League) => ({
  games: l.games.map((g) => `${g.gid}:${g.home.pts}-${g.away.pts}`).join(','),
  rng: l.rng,
  txns: (l.transactions ?? []).map((t) => `${t.kind}:${t.tids.join('/')}:${t.pid ?? ''}`).join(','),
});

describe('the press', () => {
  let base: League;
  let league: League;
  let twin: League;
  let quiet: League;
  beforeAll(() => {
    base = fresh();
    league = play(structuredClone(base), DAYS);
    twin = play(structuredClone(base), DAYS);
    press.on = false;
    quiet = play(structuredClone(base), DAYS);
    press.on = true;
  }, 240_000);

  it('covers the league without changing it: honors, power rankings, predictions, the front page, trade grades and pruning', () => {
    // leaves the games, the random stream and the moves exactly as they would be without it
    {
      expect(fingerprint(league)).toEqual(fingerprint(quiet));
      expect(quiet.media).toBeUndefined();
      expect(league.media?.power).toBeDefined();
    }

    // writes the same news from the same league
    {
      const text = (l: League) => l.news.map((n) => `${n.kind}|${n.head ?? ''}|${n.text}|${n.body ?? ''}|${n.weight ?? 1}`);
      expect(text(league)).toEqual(text(twin));
      expect(league.media).toEqual(twin.media);
    }

    // names players of the week each week and the monthly honors once October and November are done
    {
      const h = seasonHonors(league);
      const potw = h.filter((x) => x.kind === 'potw');
      // days 8, 15, ..., 43: six weeks, one a conference
      expect(potw.length).toBe(12);
      expect(new Set(potw.map((x) => x.day))).toEqual(new Set([8, 15, 22, 29, 36, 43]));
      for (const x of potw) {
        expect(league.teams[x.tid].conf).toBe(x.conf);
        expect(x.line).toMatch(/points.* a game as the .+ went \d+-\d+/);
      }
      // December 1st (day 42) closes the first month, October's games with November's
      const month = h.filter((x) => x.kind !== 'potw');
      expect(new Set(month.map((x) => x.kind))).toEqual(new Set(['potm', 'rotm', 'cotm']));
      expect(month.every((x) => x.day === 42)).toBe(true);
      expect(month.filter((x) => x.kind === 'cotm').every((x) => x.pid === undefined)).toBe(true);
      // the honored players carry it on their pages
      const p = league.players[potw[0].pid!];
      expect(p.awards.some((a) => a.type === 'Player of the Week' && a.season === league.season)).toBe(true);
      const pom = month.find((x) => x.kind === 'potm')!;
      expect(league.players[pom.pid!].awards.some((a) => a.type === 'Player of the Month')).toBe(true);
      expect(league.news.some((n) => n.kind === 'honor' && n.head?.length)).toBe(true);
    }

    // ranks all 30 teams weekly, each with a line of its own
    {
      const rows = latestPower(league)!;
      expect(league.media!.power!.day).toBe(42);
      expect(rows.map((r) => r.rank)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
      expect(new Set(rows.map((r) => r.tid)).size).toBe(30);
      // last week's rank is known, and the lines say something specific (a record, a name, a figure)
      expect(rows.every((r) => r.prev !== undefined)).toBe(true);
      for (const r of rows) expect(r.blurb).toMatch(/\d/);
      expect(new Set(rows.map((r) => r.blurb)).size).toBe(30);
      // the better record sits higher, by and large
      const ts = (tid: number) => league.teams[tid].seasons.find((s) => s.season === league.season)!;
      const pct = (tid: number) => ts(tid).won / Math.max(1, ts(tid).won + ts(tid).lost);
      const top = rows.slice(0, 5).reduce((a, r) => a + pct(r.tid), 0) / 5;
      const bottom = rows.slice(-5).reduce((a, r) => a + pct(r.tid), 0) / 5;
      expect(top).toBeGreaterThan(bottom + 0.2);
      const item = league.news.filter((n) => n.kind === 'power').at(-1)!;
      expect(item.head).toBeTruthy();
      expect(item.tids).toContain(league.userTid);
      // an opinion that moves every week is a story, never a front page
      expect(league.news.filter((n) => n.kind === 'power').every((n) => n.weight === 2)).toBe(true);
    }

    // predicts the season on opening night and previews it
    {
      const pre = league.media!.preseason!;
      expect(pre.season).toBe(league.season);
      expect(pre.rows).toHaveLength(30);
      for (const conf of ['E', 'W'] as const) {
        const ranks = pre.rows.filter((r) => league.teams[r.tid].conf === conf).map((r) => r.confRank);
        expect([...ranks].sort((a, b) => a - b)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
      }
      expect(pre.champ).toBeDefined();
      expect(pre.mvp).toHaveLength(3);
      const previews = league.news.filter((n) => n.kind === 'preview' && n.day === 0);
      expect(previews.some((n) => n.weight === 3 && n.tids.includes(league.userTid))).toBe(true);
      // three weeks in: the surprises and disappointments, against those predictions
      expect(league.media!.done?.keys).toContain('surprises');
    }

    // never writes a story about the user’s games (game day tells those)
    {
      const l = structuredClone(league);
      const g = l.schedule.filter((x) => x.played && (x.home === l.userTid || x.away === l.userTid)).at(-1)!;
      // even a 60-point night of his
      const res = l.games.find((x) => x.gid === g.gid)!;
      l.games.push({ ...res, home: { ...res.home, players: res.home.players.map((b, i) => (i === 0 ? { ...b, pts: 60 } : b)) } });
      const before = l.news.length;
      pressGame(l, g, l.media!);
      expect(l.news.length).toBe(before);
      // another game that went to triple overtime, with nothing bigger in it, is a story of its own
      const og = l.schedule.filter((x) => x.played && x.home !== l.userTid && x.away !== l.userTid).at(-1)!;
      const or = l.games.find((x) => x.gid === og.gid)!;
      const calm = (t: typeof or.home) => ({ ...t, extra: { ...t.extra, biggestLead: 6 }, players: t.players.map((b) => ({ ...b, pts: Math.min(b.pts, 30) })) });
      l.games.push({ ...or, ot: 3, home: calm(or.home), away: calm(or.away) });
      const was = l.news.length;
      pressGame(l, og, l.media!);
      const ot = l.news.slice(was).filter((n) => n.kind === 'game');
      expect(ot).toHaveLength(1);
      expect(ot[0].head).toMatch(/triple overtime|Three overtimes/);
      expect(ot[0].text).toContain('(3OT)');
      expect(ot[0].tids).toContain(or.home.pts > or.away.pts ? or.home.tid : or.away.tid);
    }

    // puts the biggest recent story on the front page
    {
      const { lead, headlines } = frontPage(league);
      expect(lead?.head).toBeTruthy();
      expect(headlines.every((n) => n.head && n !== lead)).toBe(true);
    }

    // trade grades: the side that got the star well above the side that gave him away for little
    {
      const league = structuredClone(base);
      mediaDay(league);
      const mine = teamPlayers(league, 4).sort((a, b) => b.ovr - a.ovr);
      const theirs = teamPlayers(league, 9).sort((a, b) => a.ovr - b.ovr);
      executeTrade(league, { a: { tid: 4, pids: [mine[0].pid], dpids: [] }, b: { tid: 9, pids: [theirs[0].pid], dpids: [] } });
      const txn = league.transactions!.at(-1)!;
      const [a, b] = gradeTrade(league, txn)!;
      expect(a.tid).toBe(4);
      expect(GRADES.indexOf(b.grade)).toBeLessThan(GRADES.indexOf(a.grade));
      expect(b.grade.startsWith('A')).toBe(true);
      expect(['D+', 'D', 'F'].includes(a.grade) || a.grade.startsWith('C')).toBe(true);
      // the trade's own item becomes its graded story: one item, now with a headline and both sides' reasons
      const before = league.news.length;
      mediaDay(league);
      expect(league.news.length).toBe(before);
      const item = league.news.filter((n) => n.kind === 'trade').at(-1)!;
      expect(item.text.startsWith('Trade: ')).toBe(true);
      expect(item.head).toMatch(/[A-F]/);
      expect(item.body).toContain(league.teams[4].name);
      expect(item.body).toContain(league.teams[9].name);
      // a front page only when a star (80+) or two firsts move
      expect(item.weight).toBe(Math.max(mine[0].ovr, theirs[0].ovr) >= 80 ? 3 : 2);
    }

    // the league's memory: a season's biggest stories kept for good (the user's a few of them, a few of a
    // kind, its wrap first), its playoff series, the summer's farewells added, and kept as the news is pruned
    {
      const l = structuredClone(league);
      const me = l.userTid;
      const story = (head: string, kind: Parameters<typeof publish>[1]['kind'], weight: 1 | 2 | 3, tids: number[]) =>
        publish(l, { kind, head, dek: `${head}.`, tids, pids: [], weight });
      for (let i = 0; i < 5; i++) story(`Record ${i}`, 'record', 3, [10 + i]);
      for (let i = 0; i < 5; i++) story(`Mine ${i}`, 'milestone', 3, [me]);
      story('Small one', 'game', 1, [20]);
      story('A preview', 'preview', 3, [21]);
      const wrap = story('Season wrap', 'column', 2, [22, me]);
      l.playoffs = [{ id: 'F', round: 4, conf: 'F', high: 3, low: 7, highSeed: 1, lowSeed: 2, highWins: 4, lowWins: 2, winner: 3 }];
      chronicleSeason(l, l.season, wrap.id);
      const c = chronicleOf(l, l.season)!;
      const heads = c.stories.map((x) => x.head);
      expect(c.stories.length).toBeLessThanOrEqual(CHRONICLE_STORIES);
      expect(heads).toContain('Season wrap');
      expect(c.wrap).toBe(wrap.id);
      expect(c.stories.filter((x) => x.id !== wrap.id && x.tids.includes(me))).toHaveLength(3);
      expect(heads.filter((h) => h.startsWith('Record'))).toHaveLength(2);
      expect(heads).not.toContain('Small one');
      expect(heads).not.toContain('A preview');
      expect(c.series).toEqual([[4, 3, 7, 4, 2]]);
      // a farewell in the summer joins it; read again once the news has let its stories go, it keeps them
      const bye = publish(l, { kind: 'retire', head: 'A legend retires', dek: 'His line.', tids: [5], pids: [], weight: 3 });
      chronicleFarewell(l, bye);
      l.news = l.news.filter((n) => n.season !== l.season || n.kind === 'retire');
      chronicleSeason(l, l.season);
      expect(chronicleOf(l, l.season)!.stories.map((x) => x.head)).toEqual([...heads, 'A legend retires']);
      // the history it and the awards give the press: a dynasty, a drought, an award again, a rematch, an anniversary
      const s0 = l.season;
      l.awards = [s0 - 4, s0 - 1, s0].map((season) => ({ season, champion: 3, allNba: [], allDefense: [], allRookie: [], allStars: { E: [], W: [] } }));
      expect(titleLine(l, 3, s0)).toBe('back-to-back titles');
      l.awards.find((a) => a.season === s0 - 1)!.champion = 9;
      expect(titleLine(l, 3, s0)).toBe(`a first title since ${seasonLabel(s0 - 4)}`);
      expect(titleLine(l, 3, s0 - 4)).toBeNull();
      l.teams[3].seasons = [
        { ...l.teams[3].seasons[0], season: s0 - 6, playoffRound: 2 },
        { ...l.teams[3].seasons[0], season: s0 - 1, playoffRound: 1 },
      ];
      expect(droughtLine(l, 3, s0, 2)).toBe(`a first series win since ${seasonLabel(s0 - 6)}`);
      expect(droughtLine(l, 3, s0, 1)).toBeNull();
      const p = Object.values(l.players).find((x) => x.tid === 3)!;
      p.awards = [s0 - 1, s0].map((season) => ({ season, type: 'MVP' }));
      expect(awardLine(l, p, 'MVP', s0)).toBe('his second straight');
      l.chronicle = [{ season: s0 - 2, stories: [], series: [[3, 3, 7, 4, 3]] }];
      expect(rematchLine(l, 7, 3)).toBe(`a rematch of the ${seasonLabel(s0 - 2)} conference finals, which the ${l.teams[3].name} won in seven`);
      const book = emptyBook(s0 - 6);
      book.league.reg.players.pts = [[62, p.pid, 3, 7, s0 - 5, 40, 1]];
      l.records = book;
      expect(anniversaryOf(l, { home: 7, away: 3, day: 40 })?.line).toBe(`Five years ago tonight, ${p.firstName} ${p.lastName} had 62 points against the ${l.teams[7].name}.`);
      expect(anniversaryOf(l, { home: 7, away: 3, day: 41 })).toBeNull();
    }

    // the summer's farewells: a Hall of Famer's own story with his career line, the wire's list without
    // him, the Hall of Fame's class
    {
      const l = structuredClone(league);
      l.phase = 'draftLottery';
      const [legend, plain] = Object.values(l.players).filter((x) => x.tid === 6);
      for (const x of [legend, plain]) {
        x.tid = -3;
        x.retiredSeason = l.season;
      }
      legend.hof = true;
      legend.awards = [
        { season: l.season, type: 'MVP' },
        { season: l.season, type: 'Hall of Fame' },
      ];
      const nm = (x: typeof legend) => `${x.firstName} ${x.lastName}`;
      l.news.push({ id: l.nextMsgId++, season: l.season, day: l.day, kind: 'retire', text: `Retirements: ${nm(legend)} (Hall of Fame), ${nm(plain)}.`, tids: [], pids: [] });
      mediaDay(l);
      const told = l.news.filter((n) => n.kind === 'retire' && n.head);
      expect(told.map((n) => n.pids[0])).toEqual([legend.pid]);
      expect(told[0]).toMatchObject({ weight: 3 });
      expect(told[0].text).toMatch(/an MVP.*Hall of Fame$/);
      expect(l.news.find((n) => n.kind === 'retire' && !n.head)?.text).toBe(`Also retiring: ${nm(plain)}.`);
      expect(l.news.find((n) => n.kind === 'column' && n.pids.includes(legend.pid))?.head).toMatch(/Hall of Fame/);
      // once a summer
      const n = l.news.length;
      mediaDay(l);
      expect(l.news.length).toBe(n);
    }

    // pruning keeps the bodies of only the latest stories
    {
      const league = structuredClone(base);
      for (let i = 0; i < BODIES_KEPT + 30; i++) publish(league, { kind: 'column', head: `Story ${i}`, dek: `Dek ${i}`, body: [`Body ${i}`], tids: [], pids: [], weight: 2 });
      prune(league);
      const withBody = league.news.filter((n) => n.body);
      expect(withBody).toHaveLength(BODIES_KEPT);
      expect(withBody[0].head).toBe('Story 30');
      // the headline and dek stay on every one
      expect(league.news.filter((n) => n.head?.startsWith('Story '))).toHaveLength(BODIES_KEPT + 30);
    }
  });
});
