// Engine fingerprint: a hash of everything the engine does in a fixed set of seeded games and a seeded
// slice of a season, so a change that should not change how games play (a refactor, a speed-up) can be
// proven not to. The games cover every scheme, coverage and junk defense, the set package and the
// after-timeout plays, guarding instructions, hunting, star plans, the game-management options, the
// situational plans, playoff and neutral-floor games, game-time decisions and the live controls (calls,
// timeouts, subs, new tactics mid-game); each one hashes its result (box scores, play-by-play, shots,
// tags, lineups, flow), its possession logs and its raw boxes. The season slice plays the first weeks of
// a real-roster league through the league code and hashes its results, stats and standings.
// Usage: npx tsx scripts/engine-fingerprint.ts [--verbose] [--edge=<x>]   (prints one hash per part, then the
// total; --edge plays at tactical leverage x instead of K.tacticEdge: at 1 the engine plays as it did before it)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLeague, defaultSettings } from '../src/core/league/create';
import { ensureRotation } from '../src/core/league/games';
import { teamPlayers } from '../src/core/league/helpers';
import { simDay, startRegularSeason } from '../src/core/league/season';
import { applyPatch } from '../src/core/sim/tactics';
import { GameSim, K, engineDiag, resetEngineDiag, type SimTeamInput } from '../src/core/sim/engine';
import type { PlayCall, PossLog } from '../src/core/sim/log';
import { Rng } from '../src/core/random';
import type { GameType, Player, SituationalPlan, TacticsPatch } from '../src/core/types';

const verbose = process.argv.includes('--verbose');
const edge = process.argv.find((a) => a.startsWith('--edge='));
if (edge) K.tacticEdge = Number(edge.slice('--edge='.length));
const seed = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const total = createHash('sha256');
const part = (name: string, data: string) => {
  const h = sha(data);
  total.update(`${name}:${h}\n`);
  if (verbose) console.log(`${h.slice(0, 16)}  ${name}`);
};

// ---------------------------------------------------------------- single games

const L = createLeague({ name: 'Fingerprint', userTid: 0, coachName: 'C', settings: defaultSettings(), seed, rngSeed: 11 });
for (const t of L.teams) ensureRotation(L, t.tid);
const roster = (tid: number) => teamPlayers(L, tid).filter((p) => !p.injury);
const by = (tid: number, f: (p: Player) => number) => [...roster(tid)].sort((a, b) => f(b) - f(a) || a.pid - b.pid);
/**
 * Who a plan names on a team: its best player (by OVR) and second best, its best shooter, its best
 * post player, its worst shooter, its worst free-throw shooter and its main ball handler, each a
 * different player.
 */
const who = (tid: number) => {
  const used = new Set<number>();
  // (from the top eight of the rotation: players who get minutes)
  const top = new Set(L.teams[tid].rotation.order.slice(0, 8));
  const pick = (f: (p: Player) => number) => {
    const p = by(tid, f).find((x) => top.has(x.pid) && !used.has(x.pid))!;
    used.add(p.pid);
    return p.pid;
  };
  return {
    star: pick((p) => p.ovr),
    second: pick((p) => p.ovr),
    shooter: pick((p) => p.ratings.tp),
    big: pick((p) => p.ratings.post + p.ratings.hgt),
    brick: pick((p) => -p.ratings.tp),
    ft: pick((p) => -p.ratings.ft),
    handler: pick((p) => p.ratings.hnd + p.ratings.pas),
  };
};
/** A patch, with situational plans to play on top of it. */
type Plan = TacticsPatch & { situations?: SituationalPlan[] };
const side = (tid: number, plan?: Plan, extra: Partial<SimTeamInput> = {}): SimTeamInput => {
  const { situations, ...patch } = plan ?? {};
  const tactics = applyPatch(L.teams[tid].tactics, patch);
  if (situations) tactics.situations = situations;
  return { team: { ...L.teams[tid], tactics }, players: roster(tid), ...extra };
};

interface Cfg {
  name: string;
  home: number;
  away: number;
  /** Patches for the home side, built from the away side's players (and the other way round). */
  h?: (o: ReturnType<typeof who>, me: ReturnType<typeof who>) => Plan;
  a?: (o: ReturnType<typeof who>, me: ReturnType<typeof who>) => Plan;
  type?: GameType;
  neutral?: boolean;
  adjust?: boolean;
  /** Live controls: called before possession n of the game. */
  live?: (sim: GameSim, n: number, h: ReturnType<typeof who>, a: ReturnType<typeof who>) => void;
  games?: number;
  /** The home side dresses six, at a high injury risk. */
  short?: boolean;
}

const D = (defense: TacticsPatch['defense']): TacticsPatch => ({ defense });
const O = (offense: TacticsPatch['offense']): TacticsPatch => ({ offense });
const M = (manage: TacticsPatch['manage']): TacticsPatch => ({ manage });
const cfgs: Cfg[] = [
  { name: 'base', home: 3, away: 7, adjust: true },
  { name: 'base playoffs', home: 12, away: 20, type: 'playoffs', adjust: true },
  { name: 'base neutral', home: 25, away: 1, neutral: true },
  { name: 'drop', home: 5, away: 9, h: () => D({ pnr: 'drop', switchOffBall: false, scheme: 'man' }) },
  { name: 'switch', home: 5, away: 9, h: () => D({ pnr: 'switch', switchOffBall: true, scheme: 'man' }), a: () => O({ huntMismatch: true }) },
  { name: 'hedge', home: 13, away: 22, h: () => D({ pnr: 'hedge', switchOffBall: false, scheme: 'man' }) },
  { name: 'blitz', home: 13, away: 22, h: () => D({ pnr: 'blitz', switchOffBall: false, scheme: 'man' }) },
  { name: 'ice', home: 0, away: 1, h: () => D({ pnr: 'ice', switchOffBall: false, scheme: 'man' }) },
  { name: 'zone23', home: 27, away: 3, h: () => D({ scheme: 'zone23' }), a: () => O({ threePoint: 100 }) },
  { name: 'zone32', home: 27, away: 3, h: () => D({ scheme: 'zone32' }), a: () => O({ actions: { post: 100 } }) },
  { name: 'box1 auto', home: 8, away: 14, h: () => D({ scheme: 'box1' }) },
  { name: 'box1 named', home: 8, away: 14, h: (o) => D({ scheme: 'box1', chase: [o.star] }) },
  { name: 'tri2 named', home: 16, away: 4, h: (o) => D({ scheme: 'tri2', chase: [o.star, o.second] }), adjust: true },
  { name: 'press always', home: 2, away: 18, h: () => D({ press: 'always', pressure: 100 }), a: () => D({ press: 'afterMade', pressure: 0 }) },
  { name: 'help extremes', home: 6, away: 10, h: () => D({ help: 100, physicality: 100, getBack: 0 }), a: () => D({ help: 0, physicality: 0, getBack: 100 }) },
  { name: 'glass', home: 6, away: 10, h: () => O({ crashBoards: 100, transition: 100, pace: 100 }), a: () => O({ crashBoards: 0, transition: 0, pace: 0 }) },
  { name: 'star deny', home: 11, away: 23, h: (o) => D({ starPlan: 'deny', starTarget: o.star }), a: () => D({ starPlan: 'deny', starTarget: null }) },
  { name: 'star double', home: 11, away: 23, h: (o) => D({ starPlan: 'double', starTarget: o.star }), a: () => D({ starPlan: 'double', starTarget: null }) },
  {
    name: 'guarding',
    home: 19,
    away: 24,
    h: (o) => D({ scheme: 'man', pnr: 'drop', playerD: { [o.handler]: 'under', [o.shooter]: 'tight', [o.brick]: 'sag', [o.big]: 'body' } }),
    a: (o) => D({ scheme: 'man', pnr: 'switch', playerD: { [o.handler]: 'body', [o.shooter]: 'tight', [o.brick]: 'sag' } }),
  },
  { name: 'hunt', home: 15, away: 26, h: (o) => O({ huntTarget: o.brick, hotHand: true }), a: (o) => O({ huntTarget: o.star }), adjust: true },
  {
    name: 'sets',
    home: 0,
    away: 9,
    h: () => ({ offense: { sets: ['spain', 'horns', 'floppy', 'hammer'] }, manage: { ato: 'postSplit', autoTimeouts: true, timeoutRun: 6 } }),
    a: () => D({ scheme: 'man', pnr: 'drop' }),
    games: 3,
  },
  {
    name: 'sets vs switch',
    home: 0,
    away: 9,
    h: (_o, me) => ({ offense: { sets: ['elevator', 'chicago', 'postSplit', 'horns'] }, manage: { ato: 'iso', atoPid: me.star, autoTimeouts: true, timeoutRun: 6 } }),
    a: () => D({ scheme: 'man', pnr: 'switch', switchOffBall: true }),
  },
  { name: 'sets vs zone', home: 1, away: 17, h: () => ({ offense: { sets: ['spain', 'floppy', 'hammer', 'chicago'] }, manage: { ato: 'pnr' } }), a: () => D({ scheme: 'zone23' }) },
  {
    name: 'late game',
    home: 21,
    away: 28,
    h: (o, me) =>
      M({ foulToGive: true, foulUp3: true, foulWhenTrailing: true, twoForOne: true, goTo: me.star, hackThreshold: 65, hackTargets: [o.ft], hackFromQ: 2, garbageTime: true }),
    a: () => M({ foulToGive: true, foulTrouble: 'strict', fatigueSub: 0.85, autoTimeouts: true, timeoutRun: 7 }),
    games: 4,
  },
  {
    name: 'situations',
    home: 29,
    away: 5,
    h: () => ({
      manage: { foulTrouble: 'loose' },
      situations: [
        { id: 'p1', label: 'Protect a lead', enabled: true, when: { fromQ: 4, minLead: 6 }, patch: { offense: { pace: 10 }, defense: { pnr: 'ice', getBack: 90 } } },
        { id: 'p2', label: 'Second unit', enabled: true, when: { benchUnit: true }, patch: { defense: { scheme: 'zone23' }, nudge: { offense: { pace: 15 } } } },
        { id: 'p3', label: 'Chase it', enabled: true, when: { fromQ: 3, maxLead: -8, maxClock: 400 }, patch: { defense: { press: 'always', pressure: 90 } } },
      ],
    }),
  },
  {
    name: 'foul to give',
    home: 14,
    away: 2,
    h: () => ({ manage: { foulToGive: true }, defense: { physicality: 0 } }),
    a: () => ({ manage: { foulToGive: true }, defense: { physicality: 0 } }),
    games: 8,
  },
  // six players and a physical defense: foul-outs with nobody left to come in (technicals), injuries with no healthy sub
  { name: 'short bench', home: 18, away: 6, h: () => D({ physicality: 100, pressure: 100 }), short: true, games: 3 },
  {
    name: 'live controls',
    home: 0,
    away: 13,
    h: () => O({ sets: ['spain', 'horns'] }),
    live: (sim, n, h, a) => {
      void a;
      const calls: PlayCall[] = [
        { kind: 'three' },
        { kind: 'two' },
        { kind: 'hold' },
        { kind: 'iso', pid: h.star },
        { kind: 'set', set: 'floppy' },
        { kind: 'set', set: 'hammer', pid: h.shooter },
        { kind: 'foul' },
      ];
      if (n % 9 === 4) sim.callPlay(0, calls[((n / 9) % calls.length) | 0]);
      if (n % 23 === 11) sim.callTimeout(n % 2 ? 0 : 1, 'fingerprint');
      if (n === 60) {
        const t = sim.baseTactics(1);
        t.defense.scheme = 'zone32';
        sim.setTactics(1, t);
      }
      if (n === 95) sim.cancelPlay(0);
      if (n === 120) {
        const t = sim.baseTactics(0);
        t.defense.starPlan = 'double';
        sim.setTactics(0, t);
      }
      if (n % 31 === 17) {
        const T = sim.T[0];
        const out = T.on[n % 5];
        const inn = T.players.find((p) => !p.on && p.out === 0);
        if (out && inn) sim.substitute(0, out.pid, inn.pid);
      }
    },
    games: 3,
  },
];

/** What the games covered (--verbose lists it): tags, possession kinds, coverages, finishes, sets, calls, court beats, play-by-play events. */
const seen = new Set<string>();
const WORDS = [
  'a foul to give',
  'intentional foul',
  'Technical',
  'adjusts:',
  'switches to its',
  'goes back to its base',
  'fouled out',
  'is injured',
  'Timeout',
  'sub:',
  'and one',
  'blocked',
];
const LABELS = ['Hack-a', 'Foul to give', 'Intentional foul', 'Switch!', 'gets doubled', 'Clock runs out', 'Press broken!', 'Run-out off the steal'];
let games = 0;
for (const c of cfgs) {
  const hw = who(c.home);
  const aw = who(c.away);
  for (let g = 0; g < (c.games ?? 2); g++) {
    const gameSeed = 1000 * cfgs.indexOf(c) + g;
    // a game-time decision now and then: an injured player plays through it, and form and injury risk vary
    const injured = g === 1 ? roster(c.home).find((p) => p.pid === hw.second) : undefined;
    const homePlayers = roster(c.home).map((p) => (p === injured ? { ...p, injury: { type: 'Sore knee', gamesRemaining: 1, gamesTotal: 3, severity: 'minor' as const } } : p));
    const perf = Object.fromEntries(homePlayers.map((p, i) => [p.pid, 0.96 + ((i * 7) % 8) / 100]));
    const rest = c.short
      ? by(c.home, (p) => p.ovr)
          .slice(6)
          .map((p) => p.pid)
      : g === 0
        ? []
        : [by(c.home, (p) => -p.ovr)[0].pid];
    const home = side(c.home, c.h?.(aw, hw), { players: homePlayers, perf, injuryMult: c.short ? 40 : 1.1, adjust: c.adjust, ...(injured ? { play: [injured.pid] } : {}), rest });
    const away = side(c.away, c.a?.(hw, aw), { adjust: c.adjust });
    resetEngineDiag();
    const sim = new GameSim(home, away, { rng: new Rng(gameSeed), type: c.type ?? 'regular', record: true, keepShots: true, injuries: true, neutral: c.neutral });
    const logs: PossLog[][] = [];
    const reads: unknown[] = [];
    let n = 0;
    while (n < 2000) {
      c.live?.(sim, n, hw, aw);
      if (!sim.step()) break;
      logs.push(sim.drainLogs());
      if (n % 25 === 0)
        reads.push([
          sim.setReads(0),
          sim.situation(0),
          sim.situation(1),
          sim.timeoutWaiting(0),
          sim.timeoutOpens(),
          sim.bonus(sim.T[0]),
          sim.atBuzzer(),
          sim.q,
          sim.clock,
          sim.poss,
        ]);
      n++;
    }
    const res = sim.result(7, 2027, games);
    const state = sim.T.map((t) => t.players.map((p) => [p.pid, p.energy, p.fouls, p.out, p.hot, p.on, p.role, p.freedom]));
    part(`${c.name} #${g}`, JSON.stringify([res, logs, reads, sim.rawBoxes(), sim.injuries, state, engineDiag]));
    if (verbose) {
      for (const im of res.impacts ?? []) seen.add(im.key.replace(/:[od]$/, ''));
      for (const l of logs.flat()) for (const k of [l.kind, l.coverage, l.finish, l.set?.id, l.call?.kind, ...l.steps.map((s) => s.k)]) if (k) seen.add(k);
      for (const e of res.pbp ?? []) for (const w of WORDS) if (e.text.includes(w)) seen.add(w);
      for (const l of logs.flat()) for (const w of LABELS) if (l.label.includes(w)) seen.add(w);
    }
    games++;
  }
}

// ---------------------------------------------------------------- a slice of a season

const S = createLeague({ name: 'Fingerprint season', userTid: 4, coachName: 'C', settings: defaultSettings(), seed, rngSeed: 23 });
S.id = 'fingerprint_season';
const ut = S.teams[S.userTid].tactics;
ut.offense.sets = ['spain', 'floppy', 'postSplit'];
ut.manage.foulToGive = true;
const errs = startRegularSeason(S);
if (errs.length) throw new Error(`The season can't start: ${errs.join('; ')}`);
const days = 21;
for (let d = 0; d < days; d++) simDay(S);
part('season games', JSON.stringify(S.games));
part('season stats', JSON.stringify(Object.values(S.players).map((p) => [p.pid, p.tid, p.stats.at(-1), p.injury])));
part('season teams', JSON.stringify(S.teams.map((t) => [t.tid, t.seasons.at(-1), t.tactics.defense, t.tactics.offense.actions])));
part('season rng', JSON.stringify([S.rng, S.day, S.games.length]));

if (verbose) console.log(`covered: ${[...seen].sort().join(', ')}`);
console.log(`${games} games and ${S.games.length} season games (${days} days)`);
console.log(`fingerprint ${total.digest('hex')}`);
