import { describe, expect, it } from 'vitest';
import { createLeague, defaultSettings } from '../league/create';
import { teamPlayers } from '../league/helpers';
import { GameSim, K, type SimTeamInput } from '../sim/engine';
import type { PossLog } from '../sim/log';
import { applyPatch, pairedDelta, runLab, type LabSummary, type TacticsPatch } from '../ai/lab';
import { archetype, composites } from '../ratings';
import { defaultTactics, situationFromTemplate, situationText } from '../sim/tactics';
import { Rng } from '../random';
import type { SituationalPlan, SituationTrigger, Tactics, TacticImpact } from '../types';

// Coaching controls inside the engine: situational plans, crunch time, a queued set, hack-a-player
// targets, zone schemes and the cost of switching off the ball.
describe('engine tactics', () => {
  const league = createLeague({ name: 't', userTid: 0, coachName: 'c', settings: defaultSettings(), seed: null, rngSeed: 17 });
  const side = (tid: number, patch?: TacticsPatch, situations?: SituationalPlan[]): SimTeamInput => {
    const tactics = applyPatch(league.teams[tid].tactics, patch);
    if (situations) tactics.situations = situations;
    return { team: { ...league.teams[tid], tactics }, players: teamPlayers(league, tid) };
  };
  const sit = (id: string, label: string, when: SituationTrigger, patch: TacticsPatch): SituationalPlan => ({ id, label, enabled: true, when, patch });
  const opts = (seed: number, record = true) => ({ rng: new Rng(seed), type: 'regular' as const, record, injuries: false });
  const man: TacticsPatch = { defense: { scheme: 'man', pnr: 'drop', switchOffBall: false } };
  type SP = { pid: number; on: boolean; out: number; big: boolean; ftPct: number; starter: boolean };
  type ST = { t: Tactics; base: Tactics; on: SP[]; players: SP[]; score: number; adjust: number; hacked: Map<number, number>; nextSet: { id: string; pid: number | null } | null };
  type In = {
    T: ST[];
    q: number;
    clock: number;
    elapsed: number;
    impacts: Map<string, TacticImpact>;
    adjust(t: ST): void;
    situate(t: ST): void;
    checkSubs(t: ST, force?: boolean): void;
    intentionalFoul(off: ST, def: ST): string | null;
  };
  /** Steps until a possession by `off` is logged (or the game ends). */
  const nextTrip = (sim: GameSim, off: 0 | 1, max = 12): PossLog | undefined => {
    for (let i = 0; i < max && !sim.over; i++) {
      sim.step();
      const l = sim.drainLogs().find((x) => x.off === off);
      if (l) return l;
    }
    return undefined;
  };

  describe('situational plans', () => {
    it('plays a plan exactly while its trigger holds, logs it on each possession and says so in the play-by-play', () => {
      const plans = [sit('late', 'Late game', { fromQ: 4, maxClock: 300 }, { defense: { scheme: 'zone23' } }), sit('big', 'Big lead', { minLead: 8 }, { defense: { help: 93 } })];
      let late = 0;
      let big = 0;
      for (let g = 0; g < 6; g++) {
        const sim = new GameSim(side(4, man, plans), side(5), opts(300 + g));
        const res = sim.simToEnd();
        let prev: [number, number] = [0, 0];
        for (const l of sim.drainLogs()) {
          const want = l.q >= 4 && l.clockStart <= 300 ? 'Late game' : prev[0] - prev[1] >= 8 ? 'Big lead' : '';
          expect(l.sit?.[0] ?? '').toBe(want);
          expect(l.sit?.[1] ?? '').toBe('');
          // the plan is what the defense plays
          if (l.off === 1) {
            if (want === 'Late game') expect(l.scheme).toBe('zone23');
            else expect(l.scheme).toBe('man');
            if (want === 'Big lead') expect(l.help).toBe(93);
          }
          if (want === 'Late game') late++;
          if (want === 'Big lead') big++;
          prev = l.score;
        }
        expect(res.pbp!.some((e) => e.text === `${league.teams[4].abbrev} switches to its "Late game" plan.`)).toBe(true);
      }
      expect(late).toBeGreaterThan(100);
      expect(big).toBeGreaterThan(20);
    });

    it('leaves a game without plans (or with none that apply) exactly as it was', () => {
      for (let g = 0; g < 3; g++) {
        const base = JSON.stringify(new GameSim(side(8), side(9), opts(40 + g)).simToEnd());
        for (const plans of [
          [],
          [sit('never', 'Never', { minLead: 999 }, { defense: { scheme: 'zone23' } })],
          [{ ...sit('off', 'Off', {}, { offense: { pace: 99 } }), enabled: false }],
        ]) {
          expect(JSON.stringify(new GameSim(side(8, undefined, plans), side(9), opts(40 + g)).simToEnd())).toBe(base);
        }
      }
    });

    it('a 4th-quarter plan leaves the first three quarters untouched', () => {
      let differs = 0;
      for (let g = 0; g < 6; g++) {
        const base = new GameSim(side(8), side(9), opts(70 + g, false)).simToEnd();
        const plan = sit('q4', 'Q4', { fromQ: 4 }, { defense: { scheme: 'zone23' }, nudge: { offense: { pace: 30, threePoint: 30 } } });
        const res = new GameSim(side(8, undefined, [plan]), side(9), opts(70 + g, false)).simToEnd();
        expect(res.home.quarters.slice(0, 3)).toEqual(base.home.quarters.slice(0, 3));
        expect(res.away.quarters.slice(0, 3)).toEqual(base.away.quarters.slice(0, 3));
        if (JSON.stringify(res) !== JSON.stringify(base)) differs++;
      }
      expect(differs).toBeGreaterThan(3);
    });

    it('takes live edits on the base tactics and keeps the plan in effect on top of them', () => {
      const sim = new GameSim(side(8, man, [sit('all', 'All game', {}, { defense: { scheme: 'zone23' } })]), side(9), opts(5));
      const s = sim as unknown as In;
      sim.step();
      expect(sim.situation(0)?.label).toBe('All game');
      expect(s.T[0].t.defense.scheme).toBe('zone23');
      // what Live edits is the base, never the overlay
      const base = sim.baseTactics(0);
      expect(base.defense.scheme).toBe('man');
      base.offense.pace = 93;
      sim.setTactics(0, base);
      expect(s.T[0].t.offense.pace).toBe(93);
      expect(s.T[0].t.defense.scheme).toBe('zone23');
      expect(sim.baseTactics(0).defense.scheme).toBe('man');
      // a base without the plan ends it
      base.situations = [];
      sim.setTactics(0, base);
      expect(sim.situation(0)).toBeNull();
      expect(s.T[0].t.defense.scheme).toBe('man');
      expect(s.T[0].t.offense.pace).toBe(93);
    });

    it("keeps a coach's in-game adjustment when a plan starts or ends", () => {
      const sim = new GameSim(side(8, man, [sit('late', 'Late', { maxClock: 100 }, { nudge: { offense: { pace: 25 } } })]), side(9), opts(6));
      const s = sim as unknown as In;
      const t = s.T[0];
      t.adjust = 1;
      s.q = 2;
      s.elapsed = 1200;
      s.impacts.set('drop_pullup:o|1', { key: 'drop_pullup:o', t: 1, count: 20, pts: 30, players: {} });
      s.adjust(t);
      expect(t.t.defense.pnr).toBe('hedge');
      expect(t.base.defense.pnr).toBe('hedge');
      s.clock = 60;
      s.situate(t);
      expect(sim.situation(0)?.label).toBe('Late');
      expect(t.t.defense.pnr).toBe('hedge');
      s.clock = 600;
      s.situate(t);
      expect(sim.situation(0)).toBeNull();
      expect(t.t.defense.pnr).toBe('hedge');
    });

    it('gives a player his own role back when a plan that changed it ends, or a live edit takes it off', () => {
      const p0 = teamPlayers(league, 8).find((p) => p.pid === league.teams[8].rotation.order[0])!;
      const own = league.teams[8].tactics.offense.roles[p0.pid] ?? archetype(p0.ratings).role;
      const other = own === 'post' ? 'shooter' : 'post';
      const sim = new GameSim(side(8, man, [sit('late', 'Late', { maxClock: 100 }, { offense: { roles: { [p0.pid]: other } } })]), side(9), opts(7));
      const s = sim as unknown as In;
      const role = () => (s.T[0].players.find((x) => x.pid === p0.pid) as unknown as { role: string }).role;
      expect(role()).toBe(own);
      s.clock = 60;
      s.situate(s.T[0]);
      expect(role()).toBe(other);
      s.clock = 600;
      s.situate(s.T[0]);
      expect(role()).toBe(own);
      const t = sim.baseTactics(0);
      t.offense.roles[p0.pid] = other;
      sim.setTactics(0, t);
      expect(role()).toBe(other);
      delete t.offense.roles[p0.pid];
      sim.setTactics(0, t);
      expect(role()).toBe(archetype(p0.ratings).role);
    });

    it('builds plans from templates with unique ids and describes their triggers', () => {
      const a = situationFromTemplate('protectLead');
      const b = situationFromTemplate('protectLead', [a]);
      expect(b.id).not.toBe(a.id);
      expect(b.when).not.toBe(a.when);
      expect(situationText(a.when)).toBe('Q4 & OT · last 5:00 · up 1-12');
      expect(situationText(situationFromTemplate('chasing').when)).toBe('Q4 & OT · last 6:00 · down 6-18');
      expect(situationText(situationFromTemplate('closeQ').when)).toBe('Q1-Q3 · last 0:40');
      expect(situationText({ benchUnit: true })).toBe('Second unit on the floor');
      // a plan that can never apply says so instead of reading like the quarter it starts in
      expect(situationText({ fromQ: 4, untilQ: 2 })).toMatch(/^Never/);
      expect(situationText({ minLead: 5, maxLead: -3 })).toMatch(/^Never/);
      expect(situationText({ maxClock: 0 })).toMatch(/^Never/);
      // the patch is a copy: editing a plan never edits the template
      a.patch.nudge!.offense!.pace = 0;
      expect(situationFromTemplate('protectLead').patch.nudge!.offense!.pace).toBe(-25);
    });
  });

  describe('crunch time', () => {
    /**
     * How often the ball finds the star in crunch time (the last two minutes of the 4th or OT, within five):
     * his share of the home side's isolations, ball screens, post-ups and handoffs run for a player, over
     * `n` games. (His share of the clutch shots moves far less, by about a fifth: kick-outs, rolls, motion
     * and the late-game fouls aren't his touches, and telling that apart takes thousands of games.)
     */
    const touches = (goTo: number | null, n: number) => {
      let his = 0;
      let all = 0;
      for (let g = 0; g < n; g++) {
        const sim = new GameSim(side(10, { manage: { goTo } }), side(11), opts(900 + g, false));
        type Pick = (t: { side: number; score: number }, action: string, exclude?: unknown) => SP;
        const s = sim as unknown as In & { pickActor: Pick };
        const pick = s.pickActor.bind(s);
        s.pickActor = (t, action, exclude) => {
          const p = pick(t, action, exclude);
          if (t.side === 0 && s.q >= 4 && s.clock <= 120 && Math.abs(t.score - s.T[1].score) <= 5) {
            all++;
            if (p.pid === star) his++;
          }
          return p;
        };
        sim.simToEnd();
      }
      return { share: his / all, n: all };
    };
    const star = league.teams[10].rotation.order[2];

    it('leaves the first three quarters alone and gets the go-to player the ball much more in crunch time', () => {
      for (let g = 0; g < 5; g++) {
        const a = new GameSim(side(10), side(11), opts(800 + g, false)).simToEnd();
        const b = new GameSim(side(10, { manage: { goTo: star } }), side(11), opts(800 + g, false)).simToEnd();
        expect(b.home.quarters.slice(0, 3)).toEqual(a.home.quarters.slice(0, 3));
        expect(b.away.quarters.slice(0, 3)).toEqual(a.away.quarters.slice(0, 3));
      }
      const without = touches(null, 600);
      const withIt = touches(star, 600);
      expect(Math.min(without.n, withIt.n)).toBeGreaterThan(400);
      // about twice as often (a third player in the depth chart, who gets a seventh of them otherwise)
      expect(withIt.share).toBeGreaterThan(without.share * 1.6);
    });

    it('runs the after-timeout play on the next half-court trip after its own timeout', () => {
      let ran = 0;
      let trips = 0;
      for (let g = 0; g < 30; g++) {
        const sim = new GameSim(side(12, { manage: { ato: 'post' } }), side(13), opts(1200 + g));
        for (let i = 0; i < 20 + 7 * g && !sim.over; i++) sim.step();
        sim.drainLogs();
        if (!sim.callTimeout(0)) continue;
        const l = nextTrip(sim, 0);
        if (!l || l.kind !== 'half' || !l.action) continue;
        trips++;
        if (l.action === 'post') ran++;
      }
      expect(trips).toBeGreaterThan(15);
      expect(ran).toBe(trips);
    });
  });

  describe('a queued set (the hook the set tests use)', () => {
    it('waits for a trip that gets to the half court: a press turnover leaves it for the next one', () => {
      let kept = 0;
      for (let g = 0; g < 40 && kept < 6; g++) {
        const sim = new GameSim(side(14), side(15, { defense: { press: 'always', pressure: 90 } }), opts(2000 + g));
        const s = sim as unknown as In & { poss: number };
        for (let i = 0; i < 400 && !sim.over && kept < 6; i++) {
          if (s.poss !== 0 || s.q > 3 || s.clock < 60 || s.T[0].nextSet) {
            sim.step();
            continue;
          }
          sim.runSet(0, 'horns');
          sim.drainLogs();
          sim.step();
          const l = sim.drainLogs().find((x) => x.off === 0)!;
          if (l.kind !== 'press') {
            // (free throws from a foul before any action keep it too)
            if (l.kind !== 'ft') expect(s.T[0].nextSet).toBeNull();
            continue;
          }
          // the press forced a turnover before the set could be run: it's still queued
          expect(l.set).toBeUndefined();
          expect(s.T[0].nextSet).toEqual({ id: 'horns', pid: null });
          const next = nextTrip(sim, 0)!;
          if (next.q !== l.q) break;
          if (next.kind === 'half') expect(next.set?.id).toBe('horns');
          kept++;
        }
      }
      expect(kept).toBeGreaterThanOrEqual(6);
    });

    it('is for the period it was queued in', () => {
      let ended = 0;
      for (let g = 0; g < 12; g++) {
        const sim = new GameSim(side(14), side(15), opts(1900 + g));
        const s = sim as unknown as In & { poss: number };
        while (!sim.over && !(s.poss === 1 && s.q <= 3 && s.clock > 0.05 && s.clock < 4)) sim.step();
        if (sim.over) continue;
        sim.runSet(0, 'horns');
        const q = s.q;
        sim.step();
        if (s.q !== q || s.clock > 0.05) continue;
        sim.drainLogs();
        sim.step();
        expect(s.T[0].nextSet).toBeNull();
        ended++;
      }
      expect(ended).toBeGreaterThan(3);
    });
  });

  describe('hack-a-player', () => {
    it('hacks a named target only while he is on the floor, from the chosen quarter, never in the last two minutes', () => {
      const hacks = (q: number, clock: number, onFloor: boolean) => {
        let n = 0;
        for (let g = 0; g < 10; g++) {
          const probe = new GameSim(side(0), side(1), opts(g, false)) as unknown as In;
          // their best free-throw shooter on the floor: no threshold would ever hack him
          const target = [...probe.T[0].on].sort((a, b) => b.ftPct - a.ftPct)[0];
          const bench = probe.T[0].players.find((p) => !p.on && p.out === 0)!;
          const sim = new GameSim(
            side(0),
            side(1, { manage: { hackThreshold: 0, hackTargets: [onFloor ? target.pid : bench.pid], hackFromQ: 3 } }),
            opts(g, false),
          ) as unknown as In;
          sim.q = q;
          sim.clock = clock;
          if (sim.intentionalFoul(sim.T[0], sim.T[1])) n++;
        }
        return n;
      };
      expect(hacks(3, 300, true)).toBeGreaterThan(5);
      expect(hacks(4, 300, true)).toBeGreaterThan(5);
      expect(hacks(2, 300, true)).toBe(0);
      expect(hacks(3, 100, true)).toBe(0);
      expect(hacks(3, 300, false)).toBe(0);
    });

    it('sends a player hacked twice in a period to the bench, when someone his size can come in', () => {
      let benched = 0;
      for (let g = 0; g < 8; g++) {
        const probe = new GameSim(side(2), side(3), opts(g, false)) as unknown as In;
        const target = probe.T[0].on.find((p) => probe.T[0].players.some((b) => !b.on && b.out === 0 && b.big === p.big))!;
        const sim = new GameSim(side(2), side(3, { manage: { hackTargets: [target.pid] } }), opts(g, false)) as unknown as In;
        sim.q = 2;
        sim.clock = 500;
        sim.elapsed = 1000;
        for (let i = 0; i < 6 && (sim.T[0].hacked.get(target.pid) ?? 0) < 2; i++) sim.intentionalFoul(sim.T[0], sim.T[1]);
        expect(sim.T[0].hacked.get(target.pid)).toBe(2);
        sim.checkSubs(sim.T[0]);
        if (!sim.T[0].on.some((p) => p.pid === target.pid)) benched++;
      }
      expect(benched).toBe(8);
    });
  });

  describe('zones', () => {
    it('plays the 2-3 exactly as before the per-scheme table', () => {
      expect(K.zone.zone23).toEqual({
        pnr: 0.3,
        pnrTag: 0.3 * 0.1,
        iso: 0.35,
        isoTag: 0.035,
        post: 0.25,
        postTag: 0.025,
        drive: 0.3,
        kick: 0.2,
        pop: 0.15,
        handoff: 0.1,
        cutW: 0.25,
        cut: 0.2,
        swingW: 1.35,
        swing: 0.22,
        corner: 0.45,
        glass: 1.12,
        glassTag: 0.12,
      });
      // box-score fingerprint of four 2-3 vs 2-3 games, taken from the engine before the table (and again when
      // side-out fouls started restarting the shot clock at 14, and when tactics were made to matter twice as
      // much: tacticLeverage.test.ts plays them at 1x leverage and gets the ones from before that)
      const zone = (tid: number): SimTeamInput => ({ team: { ...league.teams[tid], tactics: defaultTactics('balanced', 'zone') }, players: teamPlayers(league, tid) });
      const out: number[][] = [];
      for (let g = 0; g < 4; g++) {
        const res = new GameSim(zone(6), zone(7 + g), opts(500 + g, false)).simToEnd();
        out.push([res.home.pts, res.away.pts, res.home.t.fga, res.away.t.fga, res.home.t.tpa, res.away.t.tpa, res.home.t.orb, res.away.t.orb]);
      }
      expect(out).toEqual([
        [116, 124, 81, 93, 36, 30, 10, 13],
        [103, 111, 96, 79, 49, 32, 15, 11],
        [109, 136, 98, 94, 44, 47, 16, 7],
        [112, 118, 87, 86, 44, 25, 13, 18],
      ]);
    });

    it('makes the 3-2 the zone against shooting teams and the 2-3 the one against post-ups and drives', () => {
      const top8 = (tid: number) =>
        teamPlayers(league, tid)
          .sort((a, b) => b.ovr - a.ovr)
          .slice(0, 8);
      const avg = (tid: number, f: (c: ReturnType<typeof composites>) => number) => top8(tid).reduce((x, p) => x + f(composites(p.ratings)), 0) / 8;
      const tids = league.teams.map((t) => t.tid);
      const shooters = [...tids].sort((a, b) => avg(b, (c) => c.c3) - avg(a, (c) => c.c3))[0];
      const bigs = tids.filter((t) => t !== shooters).sort((a, b) => avg(b, (c) => c.postScore + c.rim) - avg(a, (c) => c.postScore + c.rim))[0];
      const defenses = tids.filter((t) => t !== shooters && t !== bigs).slice(0, 3);
      // (the post-up team's edge is the smaller one, about a point per 100 against the shooters' two and a
      // half: it gets three times the games, to see it past twice its standard error)
      const offenses: [SimTeamInput, number, number][] = [
        [side(shooters, { offense: { threePoint: 100, rimAttack: 40, crashBoards: 10, actions: { motion: 100, handoff: 90, pnr: 45, iso: 10, post: 0 } } }), 1, 300],
        [side(bigs, { offense: { threePoint: 0, rimAttack: 100, crashBoards: 85, actions: { post: 100, iso: 70, pnr: 45, motion: 25, handoff: 10 } } }), -1, 900],
      ];
      // paired over three defenses: the same games with each zone
      const pooled = (rs: LabSummary[]): LabSummary => ({ ...rs[0], margins: rs.flatMap((r) => r.margins), pace: rs.reduce((x, r) => x + r.pace, 0) / rs.length });
      for (const [b, sign, games] of offenses) {
        const run = (scheme: 'zone23' | 'zone32') => pooled(defenses.map((d) => runLab({ a: side(d), b, games, seed: 77, patch: { defense: { scheme } } })));
        const d = pairedDelta(run('zone23'), run('zone32'));
        expect(sign * d.delta).toBeGreaterThan(2 * d.se);
      }
    }, 150_000);
  });
});
