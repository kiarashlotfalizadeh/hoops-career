// Broadcast graphics say only what the drawn game shows, at most one every two game minutes, each
// once, and in the last 24 seconds of a period only the big ones; career numbers come only from
// careers on record, highs only from games stored this season.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';
import type { PossLog } from '../../core/sim/log';
import { snapshot, type Drawn } from '../live/drawn';
import { GRAPHIC_GAP, KEY_PRIORITY, graphicCandidates, nextGraphic, type Graphic, type GraphicInput, type PlayerBefore } from '../live/graphics';

function game(seed: number) {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0), adjust: false },
    { team: league.teams[1], players: teamPlayers(league, 1), adjust: true },
    { rng: new Rng(seed), type: 'regular', record: true, keepShots: true, injuries: false },
  );
  return { league, sim };
}

const input = (view: Drawn, logs: PossLog[], over: Partial<GraphicInput> = {}): GraphicInput => ({
  view,
  logs,
  abbrevs: ['HOM', 'AWY'],
  names: (pid) => `P${pid}`,
  before: new Map(),
  shown: new Set(),
  last: null,
  regular: true,
  ...over,
});

/**
 * Play a whole game as the Live screen does: a snapshot after every possession, a graphic when one
 * is due (each remembered, the gap from the last non-team one), with the snapshots kept.
 */
function playThrough(seed: number, before: Map<number, PlayerBefore> = new Map()) {
  const { sim } = game(seed);
  const logs: PossLog[] = [];
  const shown = new Set<string>();
  let last: number | null = null;
  const shots: { g: Graphic; view: Drawn; at: number }[] = [];
  const views: Drawn[] = [];
  let guard = 0;
  while (!sim.over && guard++ < 1000) {
    sim.step();
    logs.push(...sim.drainLogs());
    const view = snapshot(sim);
    views.push(view);
    const g = nextGraphic(input(view, logs, { before, shown, last }));
    if (g) {
      shown.add(g.id);
      if (g.kind !== 'team') last = view.elapsed;
      shots.push({ g, view, at: views.length - 1 });
    }
  }
  return { sim, shots, views, logs };
}

describe('broadcast graphics', () => {
  it('come at most one every two game minutes, never twice, only big ones late in a period, and team numbers only at breaks', () => {
    let total = 0;
    for (const seed of [3, 8, 21]) {
      const { shots } = playThrough(seed);
      total += shots.length;
      expect(new Set(shots.map((s) => s.g.id)).size).toBe(shots.length);
      const players = shots.filter((s) => s.g.kind !== 'team');
      for (let i = 1; i < players.length; i++) expect(players[i].view.elapsed - players[i - 1].view.elapsed).toBeGreaterThanOrEqual(GRAPHIC_GAP);
      for (const s of players) {
        expect(s.view.clock).toBeGreaterThan(0.05);
        if (s.view.clock <= 24) expect(s.g.priority).toBeGreaterThanOrEqual(KEY_PRIORITY);
      }
      for (const s of shots.filter((x) => x.g.kind === 'team')) expect(s.view.clock).toBeLessThanOrEqual(0.05);
      // each team number once a game
      const team = shots.filter((x) => x.g.kind === 'team').map((x) => x.g.id);
      expect(new Set(team).size).toBe(team.length);
    }
    // a game has a few
    expect(total).toBeGreaterThan(3);
  });

  it('a game picked up part-way puts up only what happens after it: everything it already called for counts as shown', () => {
    const { views, logs } = playThrough(11);
    // from halfway on, the first snapshot with a big night or a double-double already on the court (not at a
    // break, where the team numbers come one at a time)
    const mid = views.slice(Math.floor(views.length / 2)).find((v) => v.clock > 0.05 && graphicCandidates(input(v, logs)).some((g) => g.kind !== 'team'))!;
    const due = graphicCandidates(input(mid, logs));
    expect(due.length).toBeGreaterThan(0);
    const g = nextGraphic(input(mid, logs));
    if (g) expect(due.map((x) => x.id)).toContain(g.id);
    // seeded with them, nothing from before is put up again
    expect(nextGraphic(input(mid, logs, { shown: new Set(due.map((x) => x.id)) }))).toBeNull();
  });

  it("say what the box score shows: a player's points in a period, perfect shooting, one man's run", () => {
    for (const seed of [3, 8, 21, 34]) {
      const { shots, views } = playThrough(seed);
      for (const { g, view, at } of shots) {
        const pid = Number(/\d+/.exec(g.text.split(' ')[0])?.[0] ?? -1);
        const line = [...view.box.home.players, ...view.box.away.players].find((b) => b.pid === pid);
        if (g.kind === 'quarter') {
          // his points now less his points when the period began (from the snapshots, not the logs)
          const start = [...views.slice(0, at)].reverse().find((v) => v.q < view.q);
          const was = start ? ([...start.box.home.players, ...start.box.away.players].find((b) => b.pid === pid)?.pts ?? 0) : 0;
          expect(g.text).toContain(`${line!.pts - was} points in`);
        }
        if (g.id.startsWith('p3-')) expect(g.text).toBe(`P${pid}: ${line!.tpm} of ${line!.tpa} from three`);
        if (g.kind === 'solo') {
          const n = Number(/last (\d+) points/.exec(g.text)![1]);
          // his team's last n points are all his: its score n points ago was before his run
          const side = view.box.home.players.some((b) => b.pid === pid) ? 0 : 1;
          expect(n).toBeGreaterThanOrEqual(9);
          expect(view.sides[side].score).toBeGreaterThanOrEqual(n);
        }
        if (g.kind === 'big') expect(g.text).toMatch(new RegExp(`^P${pid}(: | has )${line!.pts} points`));
        if (g.kind === 'double' || g.kind === 'triple') {
          const tens = [line!.pts, line!.orb + line!.drb, line!.ast, line!.stl, line!.blk].filter((x) => x >= 10).length;
          expect(tens).toBe(g.kind === 'triple' ? 3 : 2);
        }
      }
    }
  });

  it('call a career milestone only for a career on record, and only in the regular season', () => {
    const { sim } = game(5);
    const logs: PossLog[] = [];
    let view = snapshot(sim);
    // play until someone has scored 12
    while (!sim.over && ![...view.box.home.players, ...view.box.away.players].some((b) => b.pts >= 12)) {
      sim.step();
      logs.push(...sim.drainLogs());
      view = snapshot(sim);
    }
    // (not in the last 24 seconds of a period, where only the big ones go up: a milestone would too)
    expect(view.clock).toBeGreaterThan(24);
    const star = [...view.box.home.players, ...view.box.away.players].find((b) => b.pts >= 12)!;
    const before = new Map<number, PlayerBefore>([[star.pid, { career: { pts: 4990, reb: 0, ast: 0 } }]]);
    const g = nextGraphic(input(view, logs, { before }));
    expect(g).toMatchObject({ kind: 'milestone', text: `P${star.pid} reaches 5,000 career points` });
    expect(nextGraphic(input(view, logs, { before, regular: false }))?.kind).not.toBe('milestone');
    // without his career on record, nothing about it
    expect(nextGraphic(input(view, logs))?.kind).not.toBe('milestone');
    // and it isn't shown twice
    expect(nextGraphic(input(view, logs, { before, shown: new Set([g!.id]) }))?.id).not.toBe(g!.id);
  });

  it('watch a season high late, and call a new one, only after ten games with a high of 20 or more', () => {
    const { sim } = game(9);
    const logs: PossLog[] = [];
    let view = snapshot(sim);
    // late (the 4th quarter), with someone past the 20 points a season high needs to be worth a graphic
    const topPts = (v: Drawn) => Math.max(...[...v.box.home.players, ...v.box.away.players].map((p) => p.pts));
    while (!sim.over && !(view.q === 4 && view.clock < 600 && topPts(view) > 20)) {
      sim.step();
      logs.push(...sim.drainLogs());
      view = snapshot(sim);
    }
    const top = [...view.box.home.players, ...view.box.away.players].sort((a, b) => b.pts - a.pts)[0];
    expect([view.q, top.pts > 20]).toEqual([4, true]);
    // (his big-night graphic, at 30 or 40, has already gone up: it outranks the watch)
    const shown = new Set([30, 40, 50].map((n) => `big-${top.pid}-${n}`));
    const with_ = (high: PlayerBefore['high']) => nextGraphic(input(view, logs, { before: new Map([[top.pid, { high }]]), shown }));
    expect(with_({ pts: top.pts + 2, games: 20, career: false })).toMatchObject({ kind: 'watch', text: `P${top.pid}: ${top.pts} points, 2 off his season high (${top.pts + 2})` });
    expect(with_({ pts: 20, games: 20, career: false })).toMatchObject({ kind: 'high', text: `P${top.pid}: ${top.pts} points, past his season high of 20` });
    expect(with_({ pts: top.pts - 1, games: 20, career: true })?.tag).toBe('New career high');
    // too few games, or too low a high, says nothing
    expect(with_({ pts: top.pts - 1, games: 5, career: false })?.kind).not.toBe('high');
  });
});

describe('record book graphics', () => {
  it('a franchise or league scoring record broken goes up, the league one first; one within reach late is a watch', () => {
    const { sim, views, logs } = playThrough(23);
    const end = views[views.length - 1];
    // (the night's top scorer, whichever side he's on: a record is tonight's best)
    const top = [...end.box.home.players, ...end.box.away.players].sort((a, b) => b.pts - a.pts)[0];
    expect(top.pts).toBeGreaterThan(10);
    const at = (records: PlayerBefore['records']) =>
      graphicCandidates(input(end, logs, { before: new Map([[top.pid, { records }]]) })).filter((g) => g.kind === 'record' || g.id.startsWith('rec-'));
    // past the franchise's record but not the league's
    expect(at({ team: top.pts - 1, teamName: 'Hawks', league: top.pts + 5, playoffs: false })).toEqual([
      expect.objectContaining({ id: `rec-t-${top.pid}`, tag: 'Franchise record', text: `P${top.pid}: ${top.pts} points, a Hawks record` }),
    ]);
    // past both: only the league's is called
    expect(at({ team: top.pts - 1, teamName: 'Hawks', league: top.pts - 1, playoffs: true }).map((g) => g.tag)).toEqual(['League playoff record']);
    // short of it: nothing early, a watch in the fourth when it's a real record (40+)
    const watch = at({ team: top.pts + 3, teamName: 'Hawks', league: 90, playoffs: false });
    if (end.q >= 4 && top.pts + 3 >= 40) expect(watch.map((g) => g.kind)).toEqual(['watch']);
    else expect(watch).toEqual([]);
    expect(sim.over).toBe(true);
  });

  it("a list with nothing on it has no record to break, and the record is tonight's best", () => {
    const { views, logs } = playThrough(23);
    const end = views[views.length - 1];
    const [top, second] = [...end.box.home.players].sort((a, b) => b.pts - a.pts);
    expect(second.pts).toBeGreaterThan(0);
    expect(top.pts).toBeGreaterThan(second.pts);
    const recs = (records: PlayerBefore['records']) =>
      graphicCandidates(input(end, logs, { before: new Map([top, second].map((b) => [b.pid, { records }])) })).filter((g) => g.kind === 'record');
    // a franchise's first postseason: no franchise or league list yet, so nobody's 12 points is "a record"
    expect(recs({ teamName: 'Hawks', playoffs: true })).toEqual([]);
    // both past the old franchise best: only the one with more tonight holds it
    expect(recs({ team: second.pts - 1, teamName: 'Hawks', league: 200, playoffs: false }).map((g) => g.id)).toEqual([`rec-t-${top.pid}`]);
  });
});
