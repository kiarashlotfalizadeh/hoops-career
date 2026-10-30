// The live game's assistant, bench and broadcast graphics. The assistant reads the game as the court has
// drawn it: a snapshot taken before a step says the same thing however far the sim has run since, and its
// alerts only speak up when the staff won't handle it (tired legs, foul trouble, runs) or when a decision
// is the coach's alone. The bench (live/staff.ts): who's scoring on whom from the possession logs, the
// staff's calls (the defender of theirs you're beating, your own actions stalling; never a scorer's hot
// streak), each with real changes on offer, held back when they can't matter (a decided game, a period's
// last seconds) or would undo a change still being judged, and its read of the game in a sentence. Broadcast
// graphics say only what the drawn game shows, at most one every two game minutes, each once, and in the
// last 24 seconds of a period only the big ones; career numbers come only from careers on record, highs
// only from games stored this season.
import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../../core/league/create';
import { teamPlayers } from '../../core/league/helpers';
import { GameSim } from '../../core/sim/engine';
import { Rng } from '../../core/random';
import { cloneTactics } from '../../core/sim/tactics';
import { DEFAULT_PPP } from '../../core/analysis/playTypes';
import type { PossLog } from '../../core/sim/log';
import { snapshot, streaks, type Drawn } from '../live/drawn';
import { tacticsDiff } from '../live/alerts';
import { foulLimit, liveAlerts, newEvents, recentLevers, staffCallsTimeout, type AlertInput } from '../live/alerts';
import { finisher, gameDecided, matchups, staffNotes, staffRead, sumBy, type StaffInput } from '../live/staff';
import { stopCalls, takeStop, type StopCall } from '../live/useLiveGame';
import { callCosts, callKey, worthLine } from '../../core/analysis/callWorth';
import { CALL_DRAFTS, CALL_DRAFTS_CRUNCH, benchFor, callDrafts, callQuietLine, deadBall, nextStop, noStops, stopAfter } from '../live/calls';
import { CALL_CONFIRM_MIN, PLAY_SPREAD, clearOf, measureCalls, measureChange, type LiveChoice } from '../../state/liveWorth';
import { favoured, playReading } from '../live/usePlayWorth';
import { fitPlayers, playOptions } from '../live/plays';
import { SET_K, setFit } from '../../core/sim/sets';
import { subOptions } from '../live/session';
import type { LiveGame } from '../../state/live';
import { GRAPHIC_GAP, KEY_PRIORITY, graphicCandidates, nextGraphic, type Graphic, type GraphicInput, type PlayerBefore } from '../live/graphics';

function game(seed = 5) {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const sim = new GameSim(
    { team: league.teams[0], players: teamPlayers(league, 0), adjust: false },
    { team: league.teams[1], players: teamPlayers(league, 1), adjust: true },
    { rng: new Rng(seed), type: 'regular', record: true, keepShots: true, injuries: false },
  );
  const logs: PossLog[] = [];
  return { league, sim, logs };
}

function alertInput(g: ReturnType<typeof game>, view: Drawn, over: Partial<AlertInput> = {}): AlertInput {
  const { league, sim } = g;
  return {
    view,
    side: 0,
    teams: [league.teams[0], league.teams[1]],
    tactics: sim.baseTactics(0),
    manualSubs: false,
    atBreak: false,
    timeoutPending: false,
    events: [],
    names: (pid) => `P${pid}`,
    baselines: DEFAULT_PPP,
    subFor: (pid) => sim.T[0].players.find((p) => !p.on && p.out === 0 && p.pid !== pid)?.pid,
    ...over,
  };
}

function staffInput(g: ReturnType<typeof game>, over: Partial<StaffInput> = {}): StaffInput {
  return {
    ...alertInput(g, snapshot(g.sim, g.logs.length)),
    logs: g.logs,
    ...over,
  };
}

const play = (g: ReturnType<typeof game>, n: number) => {
  for (let i = 0; i < n && !g.sim.over; i++) {
    g.sim.step();
    g.logs.push(...g.sim.drainLogs());
  }
};

/** A copy of a snapshot with one of the user's players on the floor changed. */
function withPlayer(view: Drawn, i: number, patch: Partial<Drawn['sides'][0]['players'][0]>): Drawn {
  const v = structuredClone(view);
  const pid = v.sides[0].on[i];
  Object.assign(
    v.sides[0].players.find((p) => p.pid === pid)!,
    patch,
  );
  return v;
}

/** Alerts without their action functions, to compare. */
const plain = (a: ReturnType<typeof liveAlerts>) => a.map((x) => ({ ...x, action: x.action && { ...x.action, apply: undefined } }));

const graphicInput = (view: Drawn, logs: PossLog[], over: Partial<GraphicInput> = {}): GraphicInput => ({
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

const played = new Map<number, ReturnType<typeof playOnce>>();
/**
 * Play a whole game as the Live screen does: a snapshot after every possession, a graphic when one
 * is due (each remembered, the gap from the last non-team one), with the snapshots kept. Each seed's
 * game is played once and shared.
 */
const playThrough = (seed: number) => played.get(seed) ?? played.set(seed, playOnce(seed)).get(seed)!;
function playOnce(seed: number) {
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
    const g = nextGraphic(graphicInput(view, logs, { shown, last }));
    if (g) {
      shown.add(g.id);
      if (g.kind !== 'team') last = view.elapsed;
      shots.push({ g, view, at: views.length - 1 });
    }
  }
  return { sim, shots, views, logs };
}

describe('the live assistant and the bench', () => {
  it('alert from the drawn game only when the staff will not handle it, and the bench reads matchups, calls and the game', { timeout: 60_000 }, async () => {
    // alerts come from the drawn snapshot: the sim running on changes nothing they say
    {
      const g = game();
      for (let i = 0; i < 60; i++) g.sim.step();
      const view = snapshot(g.sim);
      const before = plain(liveAlerts(alertInput(g, view)));
      const box = JSON.stringify(view.box);
      for (let i = 0; i < 40; i++) g.sim.step();
      expect(plain(liveAlerts(alertInput(g, view)))).toEqual(before);
      expect(JSON.stringify(view.box)).toBe(box);
      expect(view.sides[0].score + view.sides[1].score).toBeLessThan(g.sim.T[0].score + g.sim.T[1].score);
    }

    // a play type running hot is flagged, unless their shots are falling well above their looks: that heat is luck
    {
      const g = game();
      for (let i = 0; i < 200; i++) g.sim.step();
      const view = snapshot(g.sim);
      // (post-ups: their counter, the post double, measured even or better; staying home on hot spot-ups
      // didn't. In a game still to be decided and not in its last seconds: then there's no counter to call)
      view.sides[1].pt = { ...view.sides[1].pt, post: { poss: 20, pts: 40 } };
      view.sides[0].score = view.sides[1].score;
      Object.assign(view, { q: 3, clock: 300 });
      const them = view.box.away;
      expect(them.t.fga).toBeGreaterThanOrEqual(20);
      const made = 2 * them.t.fgm + them.t.tpm;
      const hot = () => liveAlerts(alertInput(g, view)).some((x) => x.id === 'pt-post');
      view.box.xShots = [view.box.xShots![0], { ...view.box.xShots![1], pts: made }];
      expect(hot()).toBe(true);
      view.box.xShots = [view.box.xShots![0], { ...view.box.xShots![1], pts: made - 0.12 * 2 * them.t.fga }];
      expect(hot()).toBe(false);
    }

    // tired legs flagged only when you make the subs: the staff subs them out itself, and in crunch
    // time plays through them (a gassed closer subbed out there cost about 0.1 a game, measured)
    {
      const g = game();
      for (let i = 0; i < 30; i++) g.sim.step();
      // (the rest of the five fresh, whatever the engine's legs did to them by now: one gassed player)
      const fresh = snapshot(g.sim);
      for (const p of fresh.sides[0].players) if (fresh.sides[0].on.includes(p.pid)) p.energy = 0.9;
      const view = withPlayer(fresh, 0, { energy: 0.4 });
      const tired = (a: AlertInput) => liveAlerts(a).filter((x) => x.id.startsWith('tired-'));
      expect(view.q).toBeLessThan(4);
      expect(tired(alertInput(g, view))).toEqual([]);
      const manual = tired(alertInput(g, view, { manualSubs: true }));
      expect(manual).toHaveLength(1);
      expect(manual[0].action?.kind).toBe('sub');
      // below the coach's own line only: a lower "sub out tired players at" quiets it
      const t = g.sim.baseTactics(0);
      t.manage.fatigueSub = 0.35;
      expect(tired(alertInput(g, view, { manualSubs: true, tactics: t }))).toEqual([]);
      const crunch = structuredClone(view);
      crunch.q = 4;
      crunch.clock = 200;
      // (a close game, whatever the first 30 trips made the score)
      crunch.sides[0].score = crunch.sides[1].score;
      expect(tired(alertInput(g, crunch))).toEqual([]);
      expect(tired(alertInput(g, crunch, { manualSubs: true }))).toHaveLength(1);
      // a blowout in the fourth: not worth a word (outside the close-game band the game stops in)
      crunch.sides[0].score += 30;
      expect(tired(alertInput(g, crunch))).toEqual([]);
      expect(tired(alertInput(g, crunch, { manualSubs: true }))).toEqual([]);
    }

    // 5 fouls in the fourth quarter flagged with a Sit him button, crunch time or not, when you make the
    // subs; the staff makes that call itself (sitting him in a close fourth cost 1.3 points of win chance, measured)
    {
      const g = game();
      for (let i = 0; i < 30; i++) g.sim.step();
      const view = withPlayer(snapshot(g.sim), 1, { fouls: 5 });
      const pid = view.sides[0].on[1];
      const manual = { manualSubs: true };
      expect(liveAlerts(alertInput(g, view)).filter((x) => x.id.startsWith('fouls-'))).toEqual([]);
      for (const clock of [500, 100]) {
        const late = structuredClone(view);
        late.q = 4;
        late.clock = clock;
        // (a close game: up 2)
        late.sides[0].score = late.sides[1].score + 2;
        expect(liveAlerts(alertInput(g, late)).some((x) => x.id.startsWith('fouls-'))).toBe(false);
        const a = liveAlerts(alertInput(g, late, manual)).filter((x) => x.id === `fouls-${pid}-5`);
        expect(a).toHaveLength(1);
        expect(a[0].title).toContain('5 fouls');
        expect(a[0].action).toMatchObject({ kind: 'sub', out: pid, label: `Sit P${pid}` });
        // down 30, or in the period's last 24 seconds, it isn't
        const blow = structuredClone(late);
        blow.sides[1].score += 30;
        expect(liveAlerts(alertInput(g, blow, manual)).some((x) => x.id === `fouls-${pid}-5`)).toBe(false);
      }
      const last = structuredClone(view);
      last.q = 4;
      last.clock = 20;
      expect(liveAlerts(alertInput(g, last, manual)).some((x) => x.id === `fouls-${pid}-5`)).toBe(false);
    }

    // foul trouble at the staff's limit flagged only when you handle subs
    {
      const g = game();
      for (let i = 0; i < 20; i++) g.sim.step();
      const view = withPlayer(snapshot(g.sim), 2, { fouls: foulLimit(1, 'standard') });
      expect(view.q).toBe(1);
      expect(liveAlerts(alertInput(g, view)).some((x) => x.id.startsWith('fouls-'))).toBe(false);
      const a = liveAlerts(alertInput(g, view, { manualSubs: true })).find((x) => x.id.startsWith('fouls-'));
      expect(a?.action?.label).toBe(`Sit P${view.sides[0].on[2]}`);
      expect(foulLimit(2, 'strict')).toBe(2);
      expect(foulLimit(4, 'loose')).toBe(6);
      expect(foulLimit(6, 'standard')).toBe(5);
    }

    // a timeout offered against a run the staff won't stop, saying what a timeout really does
    {
      const g = game();
      for (let i = 0; i < 20; i++) g.sim.step();
      const view = structuredClone(snapshot(g.sim));
      view.sides[1].run = 9;
      view.sides[0].timeouts = 5;
      // the staff calls its own at 8-0 (a run is only the coach's call with manual subs or auto timeouts off)
      expect(staffCallsTimeout(view, 0, g.sim.baseTactics(0).manage, false)).toBe(true);
      expect(liveAlerts(alertInput(g, view)).some((x) => x.id.startsWith('run-'))).toBe(false);
      const run = liveAlerts(alertInput(g, view, { manualSubs: true })).find((x) => x.id.startsWith('run-'))!;
      expect(run.action?.kind).toBe('timeout');
      expect(run.title).toBe(`${g.league.teams[1].abbrev} on a 9-0 run`);
      expect(run.text).toMatch(/rests legs.*stop it.*their coach adjust/);
      expect(run.text).not.toMatch(/momentum/i);
      // already called, or at a break: nothing to offer
      expect(liveAlerts(alertInput(g, view, { manualSubs: true, timeoutPending: true })).some((x) => x.id.startsWith('run-'))).toBe(false);
      expect(liveAlerts(alertInput(g, view, { manualSubs: true, atBreak: true })).some((x) => x.id.startsWith('run-'))).toBe(false);
    }

    // injuries, foul-outs and the other coach's adjustments turned into events, then alerts for a couple of minutes
    {
      const g = game();
      for (let i = 0; i < 30; i++) g.sim.step();
      const prev = snapshot(g.sim);
      const next = structuredClone(prev);
      const mine = next.sides[0].on[0];
      next.sides[0].players.find((p) => p.pid === mine)!.out = 1;
      next.adjustments = prev.adjustments + 1;
      next.injuries = prev.injuries + 1;
      const theirs = next.sides[1].on[0];
      const adjustments = [...g.sim.adjustments.slice(0, prev.adjustments), { t: 1 as const, q: 1, clock: 300, text: 'hedges ball screens instead of dropping' }];
      const injuries = [...g.sim.injuries.slice(0, prev.injuries), { pid: theirs, tid: g.league.teams[1].tid, q: 1 }];
      const ev = newEvents(prev, next, adjustments, injuries, [g.league.teams[0], g.league.teams[1]], (pid) => `P${pid}`);
      expect(ev.map((e) => [e.kind, e.side])).toEqual([
        ['injury', 1],
        ['foulout', 0],
        ['adjust', 1],
      ]);
      expect(ev[2].text).toBe(`${g.league.teams[1].abbrev} adjusts: hedges ball screens instead of dropping.`);
      // nothing new the next time round
      expect(newEvents(next, next, adjustments, injuries, [g.league.teams[0], g.league.teams[1]], (pid) => `P${pid}`)).toEqual([]);
      const a = liveAlerts(alertInput(g, next, { events: ev }));
      // yours and the other coach's change; their injury is a banner only
      expect(a.map((x) => x.id).filter((id) => /^(inj|fo|adj)-/.test(id))).toEqual([`fo-${mine}`, ev[2].id]);
      // as a headline and its line
      expect(a.find((x) => x.id === ev[2].id)).toMatchObject({ title: `${g.league.teams[1].abbrev} adjusts`, text: 'Hedges ball screens instead of dropping.' });
      expect(a.find((x) => x.id === `fo-${mine}`)).toMatchObject({ title: `P${mine} has fouled out`, text: '' });
      const later = structuredClone(next);
      later.elapsed += 200;
      expect(liveAlerts(alertInput(g, later, { events: ev })).some((x) => /^(inj|fo|adj)-/.test(x.id))).toBe(false);
    }

    // the biggest edge against you turned into a one-tap fix, when that fix measured as a gain where it
    // fires (callWorth.ts): a roll man punishing a hedge brings Go to Drop; pull-ups over a drop bring
    // nothing (the switch to Hedge cost 1.6 a game, measured), nor does a counter-call on it
    {
      const g = game();
      for (let i = 0; i < 40; i++) g.sim.step();
      const t = g.sim.baseTactics(0);
      t.defense.scheme = 'man';
      t.defense.pnr = 'hedge';
      const view = structuredClone(snapshot(g.sim));
      view.impacts = [{ key: 'hedge_roll:o', t: 1, count: 6, pts: 4.2, players: {} }];
      const a = liveAlerts(alertInput(g, view, { tactics: t })).find((x) => x.id === 'imp-hedge_roll:o')!;
      expect(a.action).toMatchObject({ kind: 'tactics', label: 'Go to Drop' });
      const note = staffNotes({ ...staffInput(g), view, tactics: t }).find((n) => n.id === 'imp-hedge_roll:o')!;
      expect(note.worth).toBe('Usually helps here');
      if (a.action?.kind === 'tactics') {
        a.action.apply(t);
        expect(t.defense.pnr).toBe('drop');
        // fixed: the edge no longer applies, so nothing more to say about it
        expect(liveAlerts(alertInput(g, view, { tactics: t })).some((x) => x.id === 'imp-hedge_roll:o')).toBe(false);
      }
      view.impacts = [{ key: 'drop_pullup:o', t: 1, count: 6, pts: 4.2, players: {} }];
      expect(callCosts(callKey('imp-drop_pullup:o', 'Switch to Hedge'))).toBe(true);
      expect(liveAlerts(alertInput(g, view, { tactics: t })).some((x) => x.id === 'imp-drop_pullup:o')).toBe(false);
      // a call made too rarely to have measured is the staff's read
      expect(worthLine('imp-drop_handoff:o>Switch off-ball screens')).toBeUndefined();
    }

    // straight makes and misses counted from the shot log
    {
      const s = streaks([
        { pid: 1, made: true },
        { pid: 2, made: false },
        { pid: 1, made: true },
        { pid: 1, made: true },
        { pid: 2, made: false },
        { pid: 3, made: true },
        { pid: 3, made: false },
      ]);
      expect([s.get(1), s.get(2), s.get(3)]).toEqual([3, -2, -1]);
    }

    // the bench credits each trip to the player who finished it and the defender on him
    {
      const g = game();
      play(g, 120);
      for (const l of g.logs.slice(0, 40)) {
        const f = finisher(l);
        if (f !== undefined) expect([...l.on[0], ...l.on[1]]).toContain(f);
      }
      const theirs = matchups(g.logs, 1);
      const trips = theirs.reduce((a, r) => a + r.trips, 0);
      const pts = theirs.reduce((a, r) => a + r.pts, 0);
      // (free-throw-only trips aren't a matchup)
      expect(trips).toBeGreaterThan(30);
      expect(pts).toBeLessThanOrEqual(g.logs.filter((l) => l.off === 1).reduce((a, l) => a + l.pts, 0));
      expect([...sumBy(theirs, 'def').keys()].every((pid) => g.sim.T[0].players.some((p) => p.pid === pid))).toBe(true);
    }

    // no call on their scorer's hot streak: the engine has no hot hand, so a double answers noise (and cost
    // about a point a game when followed)
    {
      const g = game();
      play(g, 60);
      const base = staffInput(g);
      const view = structuredClone(base.view);
      const them = view.sides[1];
      const star = them.players.find((p) => them.on.includes(p.pid))!;
      Object.assign(star, { pts: 16, fgm: 7, fga: 9, streak: 4 });
      const notes = staffNotes({ ...base, view });
      expect(notes.some((n) => n.id.startsWith('hot-') || n.actions.some((a) => /^Double /.test(a.label)))).toBe(false);
    }

    // no call to attack the defender you're beating (a cost beyond its noise where it fires: callWorth.ts);
    // leaning into or away from your own play types measured below even but inside the noise, so the
    // bench looks there again (the live staff measures it from the spot before it's offered: calls.ts)
    {
      const g = game();
      play(g, 60);
      const base = staffInput(g);
      const view = structuredClone(base.view);
      view.sides[0].pt.iso = { poss: 14, pts: 4 };
      view.sides[0].pt.pnrBH = { poss: 14, pts: 26 };
      const t = cloneTactics(base.tactics);
      t.offense.actions.iso = 60;
      t.offense.actions.pnr = 50;
      expect(staffNotes({ ...base, view, tactics: t }).some((n) => /^hunt-/.test(n.id))).toBe(false);
      expect(['hunt', 'fouls5', 'garbage'].every((k) => callCosts(k))).toBe(true);
      expect(['cold', 'work', 'tired', 'pt-spotup>Stay home', 'pt-transition>Sprint back'].some((k) => callCosts(k))).toBe(false);

      // a kept call held back when it can't matter: a decided game (up 40 in any quarter), a period's last
      // 24 seconds; but fouling late is the last seconds' call. No call to rest the starters with the
      // coach's switch for it off (2.3 points of margin in blowouts, never a result: his call)
      t.defense.scheme = 'man';
      t.defense.pnr = 'hedge';
      view.impacts = [{ key: 'hedge_roll:o', t: 1, count: 6, pts: 4.2, players: {} }];
      const ids = (v: Drawn, over: Partial<StaffInput> = {}) => staffNotes({ ...base, view: v, tactics: t, ...over }).map((n) => n.id);
      const at = (q: number, clock: number, margin: number) => {
        const v = structuredClone(view);
        Object.assign(v, { q, clock });
        v.sides[0].score = v.sides[1].score + margin;
        return v;
      };
      const drop = 'imp-hedge_roll:o';
      expect(ids(at(2, 300, 0))).toContain(drop);
      expect(ids(at(2, 300, 40))).not.toContain(drop);
      expect(ids(at(2, 300, -40))).not.toContain(drop);
      expect(ids(at(2, 20, 0))).not.toContain(drop);
      t.manage.foulWhenTrailing = false;
      t.manage.garbageTime = false;
      expect(ids(at(4, 20, -2))).toContain('late-foul-4');
      expect(ids(at(4, 200, 25)).some((id) => id.startsWith('garbage-'))).toBe(false);
      // and never on a setting changed fewer than 15 trips ago (no Drop → Hedge whiplash): another setting's change doesn't hold it
      expect(ids(at(2, 300, 0), { recent: { 'defense.pnr': 6 } })).not.toContain(drop);
      expect(ids(at(2, 300, 0), { recent: { 'defense.pnr': 15, 'offense.actions.iso': 2 } })).toContain(drop);
      // the trips since a change are the side's it acts on: theirs for a defensive setting
      const after = cloneTactics(t);
      after.defense.pnr = 'drop';
      const r = recentLevers([{ op: { at: 0, op: 'tactics', args: { tactics: after } }, log: 10, before: t }], g.logs, 0);
      expect(Object.keys(r)).toEqual(['defense.pnr']);
      expect(r['defense.pnr']).toBe(g.logs.slice(10).filter((l) => l.off === 1 && l.kind !== 'ft').length);
    }

    // the staff's live voice (calls.ts): at a stop it drafts three to five real changes from the game in
    // front of it (none it was told no to lately, none on a lever just changed), measures them from the
    // spot (the same spot reads the same), and proposes one only when its fresh reading clears its noise
    {
      const g = game();
      play(g, 100);
      const input = staffInput(g, { atBreak: true });
      const drafts = callDrafts(input, g.sim);
      expect(drafts.length).toBeGreaterThanOrEqual(3);
      expect(drafts.length).toBeLessThanOrEqual(CALL_DRAFTS);
      expect(new Set(drafts.map((d) => d.id)).size).toBe(drafts.length);
      const now = input.tactics;
      for (const d of drafts) if (d.choice.kind === 'tactics') expect(tacticsDiff(now, d.choice.tactics).length).toBeGreaterThan(0);
      expect(callDrafts(input, g.sim, new Set([drafts[0].id])).some((d) => d.id === drafts[0].id)).toBe(false);
      const held = callDrafts({ ...input, recent: { 'defense.scheme': 3, 'defense.help': 3 } }, g.sim);
      expect(held.some((d) => d.choice.kind === 'tactics' && tacticsDiff(now, d.choice.tactics).some((k) => k === 'defense.scheme' || k === 'defense.help'))).toBe(false);
      const m = (await measureCalls(
        g.sim,
        0,
        drafts.map((d) => d.choice),
        { screen: 6, confirm: 12 },
      ))!;
      expect(
        await measureCalls(
          g.sim,
          0,
          drafts.map((d) => d.choice),
          { screen: 6, confirm: 12 },
        ),
      ).toEqual(m);
      expect(m.tried).toBe(drafts.length);
      if (m.pick !== null) expect(m.reading!.raw).toBeGreaterThanOrEqual(2 * m.reading!.se);
      if (m.reading) expect(Math.abs(m.reading.pts)).toBeLessThanOrEqual(Math.abs(m.reading.raw) + 0.05);
      // (a crunch-time call clears on the result and the margin both)
      if (m.pick !== null && m.by === 'win') expect(m.reading!.win).toBeGreaterThanOrEqual(2 * m.reading!.winSe);
      // a change that changes nothing reads even, and the staff says so when nothing clears
      const same = (await measureChange(g.sim, 0, { kind: 'none' }, { kind: 'tactics', tactics: g.sim.baseTactics(0) }, { games: 8 }))!;
      expect([same.raw, same.win, same.n]).toEqual([0, 0, 8]);
      expect(callQuietLine({ state: 'none', tried: 4, at: 'Q2 3:10' })).toBe('Nothing the staff would change right now.');
      // a stop the game will come to is measured from a copy played on to it: the very spot the game gets
      // to (the same possessions, the same reading); its budget starts only once the game is there, and
      // a budget run out plays the device floor, never fewer
      const seen = noStops();
      seen.mid = g.sim.q;
      const ahead = nextStop(g.sim, 0, { ...seen }, 80)!;
      expect(ahead.k).toBeGreaterThan(0);
      let k = 0;
      let prio = 0;
      while (k < ahead.k) {
        const timeouts: [number, number] = [g.sim.T[0].timeouts, g.sim.T[1].timeouts];
        let got: PossLog[] = [];
        while (!got.length && k < ahead.k) {
          g.sim.step();
          k++;
          got = g.sim.drainLogs();
          g.logs.push(...got);
        }
        prio = stopAfter(g.sim, 0, timeouts, seen);
      }
      expect(prio).toBe(ahead.prio);
      expect(ahead.logs).toEqual(g.logs.slice(-ahead.logs.length));
      // (the copy keeps no shot chart: nothing the staff drafts from reads it)
      const sides = (x: GameSim) => snapshot(x).sides.map((d) => ({ ...d, players: d.players.map((p) => ({ ...p, streak: 0 })) }));
      expect([ahead.sim.q, ahead.sim.clock, sides(ahead.sim)]).toEqual([g.sim.q, g.sim.clock, sides(g.sim)]);
      const draftsAt = (x: GameSim) =>
        callDrafts({ ...staffInput(g, { atBreak: x.clock <= 0.05 }), view: snapshot(x, g.logs.length), subFor: (pid) => benchFor(x, 0, pid) }, x).map((d) => [d.id, d.choice]);
      expect(draftsAt(ahead.sim)).toEqual(draftsAt(g.sim));
      const from = draftsAt(g.sim).map(([, c]) => c as LiveChoice);
      const there = await measureCalls(g.sim, 0, from, { screen: 6, confirm: 12 });
      expect(await measureCalls(ahead.sim, 0, from, { screen: 6, confirm: 12, due: () => Infinity })).toEqual(there);
      const late = (await measureCalls(g.sim, 0, from, { screen: 40, confirm: 200, due: () => 0 }))!;
      if (late.reading) expect(late.reading.n).toBe(CALL_CONFIRM_MIN);
    }

    // crunch time (the last six minutes of a game in reach): every dead ball is a stop, and there the staff
    // drafts a timeout and fresh legs for your most tired player, whoever makes the subs; a live ball
    // (their defensive board, a steal) isn't a stop, and a period's end is one once
    {
      const g = game();
      play(g, 120);
      const s = g.sim;
      Object.assign(s, { q: 4, clock: 200 });
      s.T[0].score = s.T[1].score = 90;
      const tired = s.T[0].on[0];
      tired.energy = 0.05;
      const seen = noStops();
      const to: [number, number] = [s.T[0].timeouts, s.T[1].timeouts];
      Object.assign(s, { ctx: 'made' });
      expect(deadBall(s)).toBe(true);
      expect(stopAfter(s, 0, to, seen)).toBe(1);
      expect(stopAfter(s, 0, to, seen)).toBe(1);
      Object.assign(s, { ctx: 'dreb' });
      expect(stopAfter(s, 0, to, seen)).toBe(0);
      Object.assign(s, { ctx: 'made' });
      s.T[0].score = 120;
      expect(stopAfter(s, 0, to, seen)).toBe(0);
      s.T[0].score = 90;
      const input = staffInput(g, { manualSubs: false, subFor: (pid) => benchFor(s, 0, pid) });
      const drafts = callDrafts(input, s);
      expect(drafts.length).toBeLessThanOrEqual(CALL_DRAFTS_CRUNCH);
      expect(drafts.find((d) => d.id === 'crunch-to')?.choice).toEqual({ kind: 'timeout' });
      const sub = drafts.find((d) => d.id === `crunch-sub-${tired.pid}`);
      expect(sub?.choice).toMatchObject({ kind: 'sub', out: tired.pid });
      expect(callDrafts({ ...input, timeoutPending: true }, s).some((d) => d.choice.kind === 'timeout')).toBe(false);
      Object.assign(s, { clock: 0 });
      expect([stopAfter(s, 0, to, seen), stopAfter(s, 0, to, seen)]).toEqual([2, 0]);
    }

    // the game read in a sentence: the score early, then the biggest edges in the box score
    {
      const g = game();
      play(g, 2);
      expect(staffRead(staffInput(g))).toMatch(/Early/);
      play(g, 80);
      const read = staffRead(staffInput(g));
      expect(read.length).toBeGreaterThan(10);
      expect(read).toMatch(/\.$/);
    }

    // the staff stands down in a decided game, as the bench empties
    expect(gameDecided(3, 30, 35)).toBe(false);
    expect(gameDecided(4, 400, 25)).toBe(false);
    expect(gameDecided(4, 280, 22)).toBe(true);
    expect(gameDecided(4, 140, -16)).toBe(true);
    expect(gameDecided(4, 600, 30)).toBe(true);
    expect(gameDecided(4, 3, 30)).toBe(false);

    // the game stops for a call only you can make, and only in a close game (neither side 95% to win
    // it): the last possession (your ball, tied or down three, once a period), a fifth foul from the
    // fourth on and a closer out of legs in crunch time (those two only when the staff won't, the
    // staff's pick never one in foul trouble). A blowout never stops
    {
      const g = game();
      for (let i = 0; i < 30; i++) g.sim.step();
      const lg = { sim: g.sim, userSide: 0, manualSubs: false, edge: 0 } as unknown as LiveGame;
      const manual = { ...lg, manualSubs: true } as LiveGame;
      const pid = g.sim.T[0].on[0].pid;
      const names = (x: number) => `P${x}`;
      // (the drawn game at `margin` for the user, the home side, his five fresh and out of foul trouble but
      // for `p` on the first of them: their ball unless said)
      const at = (q: number, clock: number, p: Parameters<typeof withPlayer>[2], margin = 2, ball: 0 | 1 = 1): Drawn => {
        const fresh = snapshot(g.sim);
        for (const x of fresh.sides[0].players) Object.assign(x, { energy: 1, fouls: 0 });
        const v = { ...withPlayer(fresh, 0, p), q, clock, ball };
        v.sides = [
          { ...v.sides[0], score: 90 + margin },
          { ...v.sides[1], score: 90 },
        ];
        return v;
      };
      const stopFor = (v: Drawn, x = lg, dismissed: string[] = []) => stopCalls(v, x, names, dismissed)[0] ?? null;
      // (the staff sits him at five in the fourth before crunch time, and plays him through it in crunch
      // time: sitting him there cost win chance, measured, so the game doesn't stop for it unless the subs are yours)
      expect(stopFor(at(4, 500, { fouls: 5 }))).toBeNull();
      expect(stopFor(at(4, 200, { fouls: 5 }))).toBeNull();
      expect(stopFor(at(4, 200, { fouls: 5 }), manual)).toMatchObject({ id: `fouls-${pid}`, pid });
      expect(stopFor(at(4, 200, { fouls: 5 }), manual, [`fouls-${pid}-5`])).toBeNull();
      expect(stopFor(at(3, 200, { fouls: 5 }), manual)).toBeNull();
      // with the subs yours a fifth foul stops the game before crunch time, while it's close: down 14
      // with 11 minutes left and the ball it is, down 15 or down 30 it isn't, nor up 30 with two minutes left
      expect(stopFor(at(4, 660, { fouls: 5 }, -14, 0), manual)).toMatchObject({ id: `fouls-${pid}` });
      expect(stopFor(at(4, 660, { fouls: 5 }, -15, 0), manual)).toBeNull();
      expect(stopCalls(at(4, 600, { fouls: 5 }, -30), manual, names, [])).toEqual([]);
      expect(stopCalls(at(4, 120, { fouls: 5, energy: 0.3 }, 30, 0), manual, names, [])).toEqual([]);
      // the last possession: the game clock under the shot clock in the fourth or an overtime, your
      // ball, tied or down three or less (up, there's no call to make); its id is the period's
      const last = (margin: number, clock = 14, ball: 0 | 1 = 0, q = 4) => stopFor(at(q, clock, {}, margin, ball));
      expect(last(0)).toMatchObject({ id: 'last-4', kind: 'last', text: 'Last possession, your ball, tied.' });
      expect(last(-3, 1)).toMatchObject({ id: 'last-4', text: 'Last possession, your ball, down 3.' });
      expect(last(-1, 3, 0, 5)).toMatchObject({ id: 'last-5' });
      for (const [margin, clock, ball] of [
        [-4, 14, 0],
        [1, 14, 0],
        [0, 14, 1],
        [0, 30, 0],
      ] as const)
        expect(last(margin, clock, ball), `${margin} ${clock} ${ball}`).toBeNull();
      // it stops once a period, and its screen (who's tired or in foul trouble on it) stands for the fifth foul due with it
      const stopped = new Set<string>();
      const fifth = at(4, 14, { fouls: 5 }, -2, 0);
      expect(stopCalls(fifth, lg, names, []).map((c) => c.id)).toEqual(['last-4']);
      expect(stopCalls(fifth, manual, names, []).map((c) => c.id)).toEqual(['last-4', `fouls-${pid}`]);
      const seen: (StopCall | null)[] = [fifth, at(4, 9, {}, 0, 0), at(4, 4, {}, -1, 0), at(5, 12, {}, -2, 0), at(5, 6, {}, 0, 0)].map((v) =>
        takeStop(stopCalls(v, manual, names, []), stopped),
      );
      expect(seen.map((c) => c?.id ?? null)).toEqual(['last-4', null, null, 'last-5', null]);
      const t = g.sim.T[0];
      t.team = { ...t.team, rotation: { ...t.team.rotation, closers: t.on.map((p) => p.pid) } };
      expect(stopFor(at(4, 200, { energy: 0.3 }))).toBeNull();
      expect(stopFor(at(4, 200, { energy: 0.3 }), manual)).toMatchObject({ id: `tired-${pid}-4`, text: `P${pid} is gassed, at 30% energy.` });
      t.team = {
        ...t.team,
        rotation: {
          ...t.team.rotation,
          closers: t.players
            .filter((p) => !p.on)
            .slice(0, 5)
            .map((p) => p.pid),
        },
      };
      expect(stopFor(at(4, 200, { energy: 0.3 }), manual)).toBeNull();

      // the late play call is built around your closer (the go-to you named while he's on the floor,
      // else the engine's): his clear-out first, then the sets he fits best, then one set for someone else
      const five = t.on.map((p) => p.pid);
      const go = g.sim.baseTactics(0);
      const fits = fitPlayers(g.league, five, go);
      go.manage.goTo = null;
      g.sim.setTactics(0, go);
      const auto = g.sim.closer(t)!.pid;
      const named = five.find((x) => x !== auto)!;
      go.manage.goTo = named;
      g.sim.setTactics(0, go);
      expect(g.sim.closer(t)!.pid).toBe(named);
      const plays = playOptions(g.league, five, go, named);
      expect(plays[0]).toEqual({ id: 'iso', pid: named });
      expect(plays.length).toBeLessThanOrEqual(4);
      const others = plays.filter((p) => p.pid !== named);
      expect(others.length).toBeLessThanOrEqual(1);
      if (others.length) expect(plays.at(-1)).toBe(others[0]);
      for (const p of plays.slice(1))
        expect(
          setFit(
            p.id as Exclude<typeof p.id, 'iso'>,
            fits.find((x) => x.pid === p.pid)!,
          ),
        ).toBeGreaterThanOrEqual(SET_K.fit);
      // on the bench, he isn't the closer: the best one on the floor is
      go.manage.goTo = t.players.find((p) => !p.on)!.pid;
      g.sim.setTactics(0, go);
      expect(g.sim.closer(t)!.pid).toBe(auto);
      // the bench's sheet puts the ones at the period's foul limit last (past its six, gone), with their fouls
      const bench = t.players.filter((p) => !p.on && p.out === 0);
      const sheet = () => subOptions(snapshot(g.sim), 0, t, pid, () => undefined).options;
      const first = sheet()[0].pid;
      const pf = bench.find((p) => p.pid === first)!;
      pf.fouls = 4;
      const ids = sheet().map((o) => o.pid);
      expect(ids.indexOf(first)).toBe(bench.length > 6 ? -1 : ids.length - 1);
      pf.fouls = 1;
      expect(sheet()[0]).toMatchObject({ pid: first, line: expect.stringContaining('1 PF') });
      pf.fouls = 0;

      // the play call's and the sub chips' readings are shrunk toward even by their noise, as the calls
      // are, and say something only clear of what's left of it: one just past two standard errors raw is
      // too close to say. The lightbulb goes on the best clear gain, and on none without one
      const read = (win: number, winSe = 0.024) => playReading({ win, winSe, pts: 0, ptsSe: 1, n: 400 }, PLAY_SPREAD);
      const big = read(0.108);
      expect([big.clear, big.win > 0.08 && big.win < 0.095, big.winSe < 0.024]).toEqual([true, true, true]);
      expect([clearOf(0.05, 0.024), read(0.05).clear, read(-0.05).clear]).toEqual([true, false, false]);
      expect(favoured([read(0.05), big, read(0.2, 0.1)])).toBe(1);
      expect([favoured([read(0.02), read(-0.12)]), favoured(null)]).toEqual([null, null]);
    }

    // the edge against you runs on from the one for you, a count keeping its figure
    {
      const box = (t: Record<string, number>, paint: number) => ({ t: { orb: 0, drb: 0, tov: 0, tpm: 0, tpa: 0, fta: 0, ...t }, extra: { paint } });
      const read = (us: ReturnType<typeof box>, them: ReturnType<typeof box>) =>
        staffRead({ view: { elapsed: 1200, box: { home: us, away: them } }, side: 0, teams: [{ abbrev: 'OKC' }, { abbrev: 'SAS' }] } as unknown as Parameters<typeof staffRead>[0]);
      // more turnovers from them, and more paint points for them
      expect(read(box({ tov: 4 }, 20), box({ tov: 12 }, 36))).toBe("They have 12 turnovers to our 4, but they're +16 in the paint.");
      // the glass the other way: "they're" runs on in lower case
      expect(read(box({ tov: 4, drb: 10 }, 30), box({ tov: 12, drb: 20 }, 30))).toBe("They have 12 turnovers to our 4, but they're winning the glass by 10.");
      expect(read(box({ fta: 6 }, 40), box({ fta: 24 }, 24))).toBe("We're +16 in the paint, but they have 18 more free throws.");
    }
  });
});

describe('broadcast graphics', () => {
  it('pace themselves, say what the box score shows, and call milestones, highs and records only from what is on record', () => {
    // at most one every two game minutes, never twice, only big ones late in a period, and team numbers only at breaks
    {
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
    }

    // a game picked up part-way puts up only what happens after it: everything it already called for counts as shown
    {
      const { views, logs } = playThrough(11);
      // from halfway on, the first snapshot with a big night or a double-double already on the court (not at a
      // break, where the team numbers come one at a time)
      const mid = views.slice(Math.floor(views.length / 2)).find((v) => v.clock > 0.05 && graphicCandidates(graphicInput(v, logs)).some((g) => g.kind !== 'team'))!;
      const due = graphicCandidates(graphicInput(mid, logs));
      expect(due.length).toBeGreaterThan(0);
      const g = nextGraphic(graphicInput(mid, logs));
      if (g) expect(due.map((x) => x.id)).toContain(g.id);
      // seeded with them, nothing from before is put up again
      expect(nextGraphic(graphicInput(mid, logs, { shown: new Set(due.map((x) => x.id)) }))).toBeNull();
    }

    // what the box score shows: a player's points in a period, perfect shooting, one man's run
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

    // a career milestone called only for a career on record, and only in the regular season
    {
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
      const g = nextGraphic(graphicInput(view, logs, { before }));
      expect(g).toMatchObject({ kind: 'milestone', text: `P${star.pid} reaches 5,000 career points` });
      expect(nextGraphic(graphicInput(view, logs, { before, regular: false }))?.kind).not.toBe('milestone');
      // without his career on record, nothing about it
      expect(nextGraphic(graphicInput(view, logs))?.kind).not.toBe('milestone');
      // and it isn't shown twice
      expect(nextGraphic(graphicInput(view, logs, { before, shown: new Set([g!.id]) }))?.id).not.toBe(g!.id);
    }

    // a season high watched late, and a new one called, only after ten games with a high of 20 or more
    {
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
      const with_ = (high: PlayerBefore['high']) => nextGraphic(graphicInput(view, logs, { before: new Map([[top.pid, { high }]]), shown }));
      expect(with_({ pts: top.pts + 2, games: 20, career: false })).toMatchObject({
        kind: 'watch',
        text: `P${top.pid}: ${top.pts} points, 2 off his season high of ${top.pts + 2}`,
      });
      expect(with_({ pts: 20, games: 20, career: false })).toMatchObject({ kind: 'high', text: `P${top.pid}: ${top.pts} points, past his season high of 20` });
      expect(with_({ pts: top.pts - 1, games: 20, career: true })?.tag).toBe('New career high');
      // too few games, or too low a high, says nothing
      expect(with_({ pts: top.pts - 1, games: 5, career: false })?.kind).not.toBe('high');
    }

    // record book: a franchise or league scoring record broken goes up, the league one first; one within reach late is a watch
    {
      const { sim, views, logs } = playThrough(24);
      const end = views[views.length - 1];
      // (the night's top scorer, whichever side he's on: a record is tonight's best)
      const top = [...end.box.home.players, ...end.box.away.players].sort((a, b) => b.pts - a.pts)[0];
      expect(top.pts).toBeGreaterThan(10);
      const at = (records: PlayerBefore['records']) =>
        graphicCandidates(graphicInput(end, logs, { before: new Map([[top.pid, { records }]]) })).filter((g) => g.kind === 'record' || g.id.startsWith('rec-'));
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
    }

    // a list with nothing on it has no record to break, and the record is tonight's best
    {
      const { views, logs } = playThrough(24);
      const end = views[views.length - 1];
      const [top, second] = [...end.box.home.players].sort((a, b) => b.pts - a.pts);
      expect(second.pts).toBeGreaterThan(0);
      expect(top.pts).toBeGreaterThan(second.pts);
      const recs = (records: PlayerBefore['records']) =>
        graphicCandidates(graphicInput(end, logs, { before: new Map([top, second].map((b) => [b.pid, { records }])) })).filter((g) => g.kind === 'record');
      // a franchise's first postseason: no franchise or league list yet, so nobody's 12 points is "a record"
      expect(recs({ teamName: 'Hawks', playoffs: true })).toEqual([]);
      // both past the old franchise best: only the one with more tonight holds it
      expect(recs({ team: second.pts - 1, teamName: 'Hawks', league: 200, playoffs: false }).map((g) => g.id)).toEqual([`rec-t-${top.pid}`]);
    }
  });
});
