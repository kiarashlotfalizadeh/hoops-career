// The player's journey between screens: what a long sim says when it stops (simSummary), how a game in
// progress reads on the Continue bar, what free agency's last step warns about, the big moments (read
// from the league as it stands, each with a key that stays the same, so only the ones that happen while
// the app is open are shown), what the unread badge counts, and Needs you's order (the staff's calls
// first, AI teams' offers as one row).
import { describe, expect, it } from 'vitest';
import type { GameResult, League, PlayoffSeries, Proposal } from '../../core/types';
import { createLeague, defaultSettings } from '../../core/league/create';
import { curTeamSeason, standardRoster, teamPlayers } from '../../core/league/helpers';
import { CAP } from '../../core/constants';
import { flowActions, liveScoreText, simStart, simSummary } from '../flow';
import { BIG_SIGNING_OVR, WAIT_DAYS, currentMoments, newMoments, pickMoments, scheduleMoments } from '../moments';
import { emptyBook } from '../../core/league/records';
import { currentGoals, setOwnerGoals } from '../../core/league/ownerGoals';
import { ownerEvaluation } from '../../core/league/owner';
import { takeJob } from '../../core/league/jobs';
import { gradeWord } from '../../core/league/legacyReview';
import { NEWS_DAYS, needsYou } from '../today/messages';
import { needsItems, needsYouOf } from '../today/needs';
import type { AgendaItem } from '../../core/league/agenda';

const make = (): League => createLeague({ name: 'j', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });

/** A finished game, as much of one as the summary reads. */
const game = (l: League, home: number, away: number, hp: number, ap: number) =>
  ({ gid: 90_000 + l.games.length, season: l.season, home: { tid: home, pts: hp }, away: { tid: away, pts: ap } }) as unknown as GameResult;

const series = (round: number, high: number, low: number, highWins: number, lowWins: number, winner?: number): PlayoffSeries => ({
  id: `S${round}-${high}-${low}`,
  round,
  conf: round === 4 ? 'F' : 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 4,
  highWins,
  lowWins,
  ...(winner !== undefined ? { winner } : {}),
});

/** A series by id, 4-1 to its winner if it has one. */
const decided = (id: string, round: number, high: number, low: number, winner?: number): PlayoffSeries => ({
  id,
  round,
  conf: round === 4 ? 'F' : 'E',
  high,
  low,
  highSeed: 1,
  lowSeed: 8,
  highWins: winner === high ? 4 : 1,
  lowWins: winner === low ? 4 : 1,
  ...(winner !== undefined ? { winner } : {}),
});

function playoffLeague(): League {
  const l = createLeague({ name: 'm', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 11 });
  l.phase = 'playoffs';
  return l;
}

describe('the journey between screens', () => {
  it('sums up a sim, reads the Continue bar, picks the moments and counts what needs you', () => {
    // simSummary: how a stretch of the regular season went, and the record when it differs
    {
      const l = make();
      l.phase = 'regular';
      l.day = 20;
      const before = simStart(l);
      l.games.push(game(l, 0, 1, 110, 100), game(l, 2, 0, 99, 90), game(l, 0, 3, 120, 101), game(l, 4, 5, 100, 90));
      const ts = curTeamSeason(l, 0);
      ts.won = 12;
      ts.lost = 9;
      const s = simSummary(before, l)!;
      expect(s.text).toMatch(/^2-1 since \w{3} \d+ · now 12-9$/);
      expect(s.tone).toBe('good');
      // the first week: the stretch is the whole record, said once
      ts.won = 2;
      ts.lost = 1;
      expect(simSummary(before, l)!.text).not.toContain('now');
    }

    // nothing for a sim that played fewer than two of your games
    {
      const l = make();
      l.phase = 'regular';
      const before = simStart(l);
      l.games.push(game(l, 0, 1, 110, 100), game(l, 2, 3, 99, 90));
      expect(simSummary(before, l)).toBeNull();
    }

    // how the season ended when a sim runs past it, and who won the title
    {
      const l = make();
      l.phase = 'playoffs';
      l.playoffs = [series(1, 2, 0, 4, 1)];
      curTeamSeason(l, 0).playoffRound = 1;
      const before = simStart(l);
      expect(before.alive).toBe(true);
      l.playoffs[0].winner = 2;
      l.playoffs.push(series(4, 2, 17, 4, 2, 2));
      l.phase = 'draftLottery';
      const s = simSummary(before, l)!;
      expect(s.text).toBe(`Out in the first round: ${l.teams[2].abbrev} won 4-1 · ${l.teams[2].abbrev} won the title`);
      expect(s.tone).toBe('bad');
      expect(s.link).toBe('/league/playoffs');
    }

    // the champion named once when he lost the Finals to it
    {
      const l = make();
      l.phase = 'playoffs';
      l.playoffs = [series(4, 17, 0, 3, 3)];
      curTeamSeason(l, 0).playoffRound = 4;
      const before = simStart(l);
      l.playoffs[0].highWins = 4;
      l.playoffs[0].winner = 17;
      l.phase = 'draftLottery';
      expect(simSummary(before, l)!.text).toBe(`Lost the NBA Finals: ${l.teams[17].abbrev} won 4-3`);
    }

    // a title left to its moment
    {
      const l = make();
      l.phase = 'playoffs';
      l.playoffs = [series(4, 0, 17, 3, 2)];
      curTeamSeason(l, 0).playoffRound = 4;
      const before = simStart(l);
      l.playoffs[0].highWins = 4;
      l.playoffs[0].winner = 0;
      l.phase = 'draftLottery';
      expect(simSummary(before, l)).toBeNull();
    }

    // the Continue bar reads a game in progress from your side
    {
      const l = make();
      const ab = l.teams[0].abbrev;
      expect(liveScoreText(l, { score: [11, 10] })).toBe(`${ab} up 11-10`);
      expect(liveScoreText(l, { score: [88, 92] })).toBe(`${ab} down 88-92`);
      expect(liveScoreText(l, { score: [50, 50] })).toBe('Tied 50-50');
    }

    // a warning at free agency's end when the roster is short of opening night's minimum
    {
      const l = make();
      l.phase = 'freeAgency';
      const std = standardRoster(l, 0);
      for (const p of std.slice(CAP.rosterMin - 2)) p.tid = -1;
      const next = flowActions(l).find((a) => a.id === 'new')!;
      expect(next.sub).toBe('Sign 2 more players by opening night.');
    }

    // draft picks aren't moments: the draft screen's announcer card has them
    {
      const l = make();
      const [a, b] = Object.values(l.players).filter((p) => p.tid === 0);
      a.draft = { ...a.draft, year: l.season, round: 1, pick: 12 };
      b.draft = { ...b.draft, year: l.season, round: 2, pick: 44 };
      l.transactions = [
        { id: 1, season: l.season, day: 0, phase: 'draft', kind: 'draft', tids: [0], pid: a.pid, name: 'A' },
        { id: 2, season: l.season, day: 0, phase: 'draft', kind: 'draft', tids: [0], pid: b.pid, name: 'B' },
      ];
      const keys = currentMoments(l)
        .filter((m) => m.kind === 'draft')
        .map((m) => m.pid);
      expect(keys).toEqual([]);
    }

    // a series the user wins is a moment; one he loses or still plays is not
    {
      const l = playoffLeague();
      l.playoffs = [decided('E1-0', 1, 0, 1, 0), decided('E1-1', 1, 2, 3, 3), decided('E2-0', 2, 0, 3)];
      const m = currentMoments(l);
      expect(m.map((x) => x.kind)).toEqual(['series']);
      expect(m[0].sub).toMatch(/^4-1 over the /);
    }

    // winning the Finals is the title, with confetti
    {
      const l = playoffLeague();
      l.playoffs = [decided('F', 4, 0, 16, 0)];
      const [m] = currentMoments(l);
      expect(m).toMatchObject({ kind: 'title', title: 'Champions', big: true });
      // (the team's mark, not the Finals MVP's jersey)
      expect(m.pid).toBeUndefined();
    }

    // keys stay the same, so only what is new since the last read shows
    {
      const l = playoffLeague();
      l.playoffs = [decided('E1-0', 1, 0, 1, 0)];
      const seen = new Set(currentMoments(l).map((x) => x.key));
      expect(newMoments(currentMoments(l), seen)).toEqual([]);
      l.playoffs.push(decided('E2-0', 2, 0, 3, 0));
      expect(newMoments(currentMoments(l), seen).map((x) => x.kind)).toEqual(['series']);
    }

    // only a good free agent makes his signing a moment
    {
      const l = playoffLeague();
      const ranked = [...teamPlayers(l, 0)].sort((a, b) => b.ovr - a.ovr);
      const [star, scrub] = [ranked[0], ranked[ranked.length - 1]];
      star.ovr = Math.max(star.ovr, BIG_SIGNING_OVR);
      scrub.ovr = Math.min(scrub.ovr, BIG_SIGNING_OVR - 10);
      l.transactions = [
        { id: 1, season: l.season, day: 0, phase: 'freeAgency', kind: 'sign', tids: [0], pid: star.pid, name: 'a', amount: 30000, years: 4 },
        { id: 2, season: l.season, day: 0, phase: 'freeAgency', kind: 'sign', tids: [0], pid: scrub.pid, name: 'b', amount: 1200, years: 1 },
      ];
      const m = currentMoments(l).filter((x) => x.kind === 'signing');
      expect(m.map((x) => x.pid)).toEqual([star.pid]);
      expect(m[0].sub).toContain('4 years · $30.0M a year');
    }

    // the season's occasions are moments of their own: his All-Stars (with the weekend's results), a
    // record his player set, a career mark, a number going up at his home opener, the summer's biggest
    // farewell, the Cup's knockouts; a story one of them tells isn't a story moment too; and of those
    // that come out together one shows, the rest that keep waiting for the next sim (not past WAIT_DAYS)
    {
      const l = make();
      l.phase = 'regular';
      l.day = 40;
      l.allStarDay = 38;
      const me = l.userTid;
      const [a, b] = [...teamPlayers(l, me)].sort((x, y) => y.ovr - x.ovr);
      const nm = (p: typeof a) => `${p.firstName} ${p.lastName}`;
      l.awards.push({
        season: l.season,
        allNba: [],
        allDefense: [],
        allRookie: [],
        allStars: { E: [a.pid, 99_999], W: [] },
        allStarGame: { east: 180, west: 170, mvp: { pts: 31, reb: 5, ast: 6 } },
        allStarMvp: a.pid,
      });
      const book = emptyBook(l.season - 1);
      book.league.reg.players.pts = [[62, a.pid, me, 5, l.season, 30, 777]];
      l.records = book;
      l.news.push({
        id: l.nextMsgId++,
        season: l.season,
        day: 31,
        kind: 'milestone',
        head: `${nm(b)} reaches 10,000 points`,
        text: `${nm(b)} (ABC) scored his 10,000th career point.`,
        body: 'He got there in his 600th game, in his 8th season.',
        tids: [me],
        pids: [b.pid],
        weight: 3,
      });
      l.teams[me].retired = [{ jersey: '7', pid: b.pid, name: nm(b), season: l.season - 1 }];
      l.games.push({ ...game(l, me, 3, 101, 99), type: 'regular', day: 2 } as GameResult);
      const gone = Object.values(l.players).find((p) => p.tid === 5)!;
      gone.tid = -3;
      gone.retiredSeason = l.season;
      l.news.push({
        id: l.nextMsgId++,
        season: l.season,
        day: 39,
        kind: 'retire',
        head: `${nm(gone)} calls it a career`,
        text: '20,000 points · Hall of Fame',
        tids: [5],
        pids: [gone.pid],
        weight: 3,
      });
      l.cup = {
        season: l.season,
        groups: [],
        nights: [],
        qfDays: [41, 42],
        sfDay: 45,
        finalDay: 48,
        seeds: { E: [me, 1, 2, 3], W: [15, 16, 17, 18] },
        bracket: [{ round: 'qf', conf: 'E', high: me, low: 3, highSeed: 1, lowSeed: 4, gid: 1, day: 41 }],
      };
      const m = currentMoments(l);
      const one = (kind: string) => m.filter((x) => x.kind === kind);
      expect(one('allStar')[0]).toMatchObject({ title: 'All-Star', pid: a.pid });
      expect(one('allStar')[0].sub).toMatch(new RegExp(`^${nm(a)} makes the All-Star team`));
      expect(one('allStar')[0].lines![0]).toBe(`The game: East 180-170 · MVP ${nm(a)}, 31 points`);
      expect(one('record')[0]).toMatchObject({ title: '62 points', pid: a.pid, link: '/game/777' });
      expect(one('record')[0].sub).toMatch(/the most in a game since/);
      expect(one('milestone')[0]).toMatchObject({ title: '10,000 points', sub: `${nm(b)}. He got there in his 600th game, in his 8th season.` });
      // (his jersey with the number going up on it, whatever he wore last)
      expect(one('jersey')[0]).toMatchObject({ title: 'No. 7', pid: b.pid, jersey: '7' });
      expect(one('farewell')[0]).toMatchObject({ title: nm(gone), pid: gone.pid });
      expect(one('cup')[0]).toMatchObject({ title: 'Into the knockouts' });
      // (the career mark's and the farewell's news items are theirs, not a front-page story's)
      expect(one('story')).toEqual([]);
      // knocked out of the Cup: that's a moment too
      l.cup.bracket[0] = { ...l.cup.bracket[0], winner: 3, highPts: 99, lowPts: 104 };
      expect(currentMoments(l).find((x) => x.key === `cup-out-${l.season}`)).toMatchObject({
        title: 'Out of the Cup',
        sub: `104-99 to the ${l.teams[3].name} in the quarterfinal.`,
      });
      // one shows, the ones that keep wait; a story doesn't, and nothing waits past WAIT_DAYS
      const story = { key: 'st', kind: 'story' as const, over: '', title: '', sub: '', rank: 9, season: l.season, day: 40 };
      const at = { season: l.season, day: 40 };
      const first = scheduleMoments([], [...m, story], [], at);
      expect(first.show.map((x) => x.kind)).toEqual(['cup']);
      expect(first.wait.length).toBe(3);
      expect(first.wait.some((x) => x.kind === 'story')).toBe(false);
      const next = scheduleMoments([], [], first.wait, at);
      expect(next.show).toEqual([first.wait[0]]);
      // (past WAIT_DAYS only a farewell or a banner night still waits: once in a career; never into the next season)
      const late = scheduleMoments([], [], first.wait, { season: l.season, day: 40 + WAIT_DAYS + 20 });
      expect(late.show.every((x) => x.kind === 'farewell' || x.kind === 'jersey')).toBe(true);
      expect(late.wait.every((x) => x.kind === 'farewell' || x.kind === 'jersey')).toBe(true);
      expect(scheduleMoments([], [], first.wait, { season: l.season + 1, day: 0 }).show).toEqual([]);
      // beside the job's own, a night's or a player's moment waits
      const verdict = { key: 'v', kind: 'verdict' as const, over: '', title: '', sub: '' };
      expect(pickMoments([one('record')[0], verdict]).map((x) => x.kind)).toEqual(['verdict']);
    }

    // the job's moments, for every team: the owner's ultimatum, his verdict on a losing season goal by
    // goal, the sack in his own words (it says the verdict itself), and a new job; each shows with
    // whatever else came out with it
    {
      const l = make();
      l.phase = 'regular';
      setOwnerGoals(l, true);
      currentGoals(l)!.ultimatum = { kind: 'postseason', target: 1, text: 'Reach the play-in' };
      expect(currentMoments(l).find((x) => x.kind === 'ultimatum')).toMatchObject({ title: 'Reach the play-in', sub: "Miss it and you're fired, whatever else goes right." });
      l.phase = 'playoffs';
      Object.assign(curTeamSeason(l, 0), { won: 20, lost: 62, playoffRound: -1 });
      const f = structuredClone(l);
      // in his grace period: the verdict
      ownerEvaluation(l);
      const r = l.ownerReviews!.at(-1)!;
      const v = currentMoments(l).find((x) => x.kind === 'verdict')!;
      expect(v).toMatchObject({ key: `verdict-${l.season}-0`, title: gradeWord(r.grade), linkLabel: 'Full review' });
      expect(v.sub).toMatch(/^“I'm .+\.” Season grade [+−]\d+, standing [+−]\d+ after 20-62\.$/);
      expect(v.lines).toHaveLength(Math.min(4, r.goals.length));
      // past it, the missed ultimatum: fired, in his words, with what's next
      f.tenureStart = f.season - 4;
      ownerEvaluation(f);
      expect(f.fired).toBe(true);
      const fm = currentMoments(f).filter((x) => x.kind === 'fired' || x.kind === 'verdict');
      expect(fm.map((x) => x.kind)).toEqual(['fired']);
      expect(fm[0].sub).toBe("“I told you at the break: reach the play-in. It didn't happen. We are going in a different direction.”");
      expect(fm[0].lines![0]).toMatch(/^20-62 · Missed the playoffs · season grade/);
      // they never wait in the digest behind a bigger moment, and the sack says the verdict itself
      const clinch = { key: 'c', kind: 'clinch' as const, over: '', title: '', sub: '' };
      expect(pickMoments([v, fm[0], clinch]).map((x) => x.kind)).toEqual(['clinch', 'fired']);
      // a new job: the new team's own moment, its owner and what's next
      f.settings.godMode = true;
      expect(takeJob(f, 5)).toBeNull();
      const h = currentMoments(f).find((x) => x.kind === 'hired')!;
      expect(h).toMatchObject({ title: `${f.teams[5].region} ${f.teams[5].name}`, link: '/office/owner' });
      expect(h.sub).toMatch(/^(Builder|Win-now|Frugal) owner: /);
    }

    // the unread badge counts mail that needs the user: big news and decisions still open
    {
      const base = { season: 2027, day: 1, from: 'x', subject: 's', body: 'b' };
      const open = new Map([['tradeOffer:4', true]]);
      expect(needsYou({ ...base, id: 1, read: false }, open)).toBe(false);
      expect(needsYou({ ...base, id: 2, read: false, important: true }, open)).toBe(true);
      expect(needsYou({ ...base, id: 3, read: true, important: true }, open)).toBe(false);
      expect(needsYou({ ...base, id: 4, read: false, proposal: 4 }, open)).toBe(true);
      // an offer that closed is just mail
      expect(needsYou({ ...base, id: 5, read: false, proposal: 9 }, open)).toBe(false);
    }

    // big news goes stale: two weeks on, or a new season
    {
      const news = { season: 2027, day: 200, from: 'x', subject: 's', body: 'b', id: 1, read: false, important: true };
      const open = new Map<string, boolean>();
      expect(needsYou(news, open, { season: 2027, day: 210 })).toBe(true);
      expect(needsYou(news, open, { season: 2027, day: 200 + NEWS_DAYS + 1 })).toBe(false);
      expect(needsYou(news, open, { season: 2028, day: 0 })).toBe(false);
      // a decision still open needs him however old it is
      expect(needsYou({ ...news, important: false, proposal: 4 }, new Map([['tradeOffer:4', true]]), { season: 2028, day: 0 })).toBe(true);
    }

    // Needs you (the bell's count and Today's list): the staff's calls first, AI teams' offers last as one row, counted once
    {
      const l = make();
      const item = (id: string, kind: AgendaItem['kind'], required = false): AgendaItem => ({ id, kind, required, title: id, line: '', tone: 'info' });
      const offer = (id: number, tid: number, expires: number): Proposal => ({
        id,
        tid,
        offer: { a: { tid: 0, pids: [], dpids: [] }, b: { tid, pids: [], dpids: [] } },
        kind: 'buy',
        note: '',
        season: l.season,
        day: 0,
        expires,
      });
      l.proposals = [offer(1, 5, 30), offer(2, 9, 20), offer(3, 12, 25)];
      const agendaOrder = [
        item('tradeOffer:1', 'tradeOffer'),
        item('tradeOffer:2', 'tradeOffer'),
        item('tradeOffer:3', 'tradeOffer'),
        item('guide', 'guide'),
        item('tenDay:1', 'tenDay'),
        item('cuts', 'cuts', true),
        item('odds:1', 'odds'),
      ];
      const items = needsItems(l, agendaOrder);
      expect(items.map((i) => i.id)).toEqual(['odds:1', 'cuts', 'guide', 'tenDay:1', 'tradeOffers']);
      // the offers' row names the teams, the first to lapse first, and opens them all
      const ab = (tid: number) => l.teams[tid].abbrev;
      expect(items.at(-1)).toMatchObject({ title: `3 trade offers: ${ab(9)}, ${ab(12)}, ${ab(5)}`, to: '/office/trade?tab=offers', required: false });
      // one offer is its own row
      expect(needsItems(l, agendaOrder.slice(2)).map((i) => i.id)).toEqual(['odds:1', 'cuts', 'guide', 'tenDay:1', 'tradeOffer:3']);
      // and the count is the rows, the offers' one counted once
      const needs = needsYouOf(l);
      expect(needs.count).toBe(needs.items.length + needs.mail.length + (needs.deadline !== null ? 1 : 0) + (needs.backup ? 1 : 0));
    }
  });
});
