// The staff's debrief after one of the user's games: the verdict (the report's headline), the edges
// that decided it, how the coach's moves in a live game went, and what to do next time: the
// one-tap counter for each edge that went against him while his tactics still give it (as a patch,
// for the plan against this opponent or for good), and a word on each key to the game he missed.
// Pure: it reads the stored result and the report built from it.

import type { GameResult, KeyGrade, League, Tactics, TacticsPatch } from '../types';
import { gameTime, madeAtt, plural } from '../format';
import { playerName, shortName } from '../league/helpers';
import { playTypeBaselines } from './playTypes';
import { leagueThreePct } from '../ai/opponentPlan';
import { buildGameReport, decidingFactors, leverNet, type GameReport, type Factor } from './gameReport';
import { worthCall } from '../ai/counterWorth';
import { pick } from './quotes';
import { impactCounter } from '../ai/advisor';
import { TACTIC_LEVELS, applyPatch, cloneTactics, levelName, tacticsDiff, emptyPatch } from '../sim/tactics';
import { CALL_WORTH, callCosts, callKey, callWorth, worthLine } from './callWorth';

export interface DebriefAdvice {
  id: string;
  title: string;
  text: string;
  /** The change, relative to the tactics now: for the plan against this opponent, or for every game. */
  patch?: TacticsPatch;
  /** What the change is called ("Switch to Hedge"). */
  label?: string;
  /** Game-plan group: it replaces the plan's item in the same group. */
  group?: string;
  /**
   * The change measured as a gain where the bench calls it (callWorth.ts): the staff's opinion of it, in
   * a few words. Only a change with one is offered for every game. For the plan against this opponent it's
   * offered only as a staff counter measured a gain against them (see sameChange): else it's the
   * staff's read, with nothing to tap.
   */
  worth?: string;
}

/** The settings a patch moves from `base`: each one's path, and which way it moves (+1 or −1 for a number, the new value otherwise). */
function patchMoves(base: Tactics, patch: TacticsPatch): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      const x = a as Record<string, unknown>;
      const y = b as Record<string, unknown>;
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out.set(path, typeof a === 'number' && typeof b === 'number' ? Math.sign(b - a) : JSON.stringify(b));
  };
  walk(base, applyPatch(base, patch), '');
  return out;
}

/**
 * Whether a staff counter (`counter`, the matchup page's) makes the change a debrief's advice asks for
 * (`advice`), from tactics `base`: every setting the advice moves, moved the same way (a counter may
 * move more: "Hunt mismatches" with more isolations). The debrief offers a change for the plan only as
 * that counter, measured against the opponent.
 */
export function sameChange(base: Tactics, advice: TacticsPatch, counter: TacticsPatch): boolean {
  const a = patchMoves(base, advice);
  const c = patchMoves(base, counter);
  return a.size > 0 && [...a].every(([k, v]) => c.get(k) === v);
}

/**
 * A change the bench measured as a cost under any of its calls (the switches to Hedge off Drop): not
 * next time's fix either. A cost beyond its noise, as the live bench drops a call (callCosts): one
 * below even inside it ("Stay home" off hot spot-ups, −0.5 ± 0.47 on 14 calls) is too close to say,
 * and the live staff, measuring from the spot, found Stay home a gain (+0.74 true over 21 calls,
 * round-3 game-day review).
 */
const labelCosts = (label: string) => Object.keys(CALL_WORTH).some((k) => k.endsWith(`>${label}`) && callCosts(k));

/** How one counter of the game plan went (see planGrades). */
export interface PlanGrade {
  label: string;
  /** What it was aimed at tonight against coming in: "SAS post-ups 0.75 a trip on 8 trips, 1.10 coming in". */
  line: string;
  /** Its grade: what the staff measured it worth over many games when it went in (a gain, a cost, or even). */
  call: 'gain' | 'cost' | 'even';
  /**
   * Tonight on what it was aimed at, against coming in: 'better' / 'worse' only for a night far
   * outside a single game's noise (PLAN_Z), 'same' otherwise, 'few' with too few trips to say.
   */
  night: 'better' | 'worse' | 'same' | 'few';
  /**
   * A counter measured a gain on a night that went against it (a standard error or more): the clause
   * that bridges the two, so a bad night doesn't read as the staff being wrong.
   */
  bridge?: string;
}

export interface Debrief {
  /** The staff's read: how it went and what decided it, in words (the final above has the score). */
  headline: string;
  /** The biggest edges, at most three, biggest first. */
  decided: Factor[];
  /** The live game's moves: how many (whether they worked is the replayed night's to say: see nightLine). */
  moves: { count: number } | null;
  advice: DebriefAdvice[];
  /** The game plan's counters, each graded on what it was aimed at. */
  plan: PlanGrade[];
  /** Said on a coach's first games: one night's shooting is luck, a plan shows over a stretch. */
  frame?: string;
  /** His players hurt in the game, and for how long: "Davis, out 5 games · Sarr, out 3 games". */
  hurt?: string;
  /** The opponent, and whether the teams meet again this season (a plan against them would be played). */
  opp: number;
  meetAgain: boolean;
}

/**
 * The offense's answer to a defense's edge on you (an impact key won by their defense, 'x:d'), as
 * the report's advice names it: relative nudges, so it builds on whatever playbook you run. (Moving
 * the ball instead of running pick-and-roll into a hedge isn't one: in paired engine games it cost
 * the team that took it about half a point per 100 possessions.)
 */
const OFFENSE_FIXES: Record<string, { label: string; patch: TacticsPatch }> = {
  'drop_rim:d': { label: 'More handoffs against the drop', patch: { nudge: { actions: { handoff: 25, pnr: -10 } } } },
  'switch_deny:d': { label: 'Hunt mismatches', patch: { offense: { huntMismatch: true } } },
  'switch_screen:d': { label: 'Hunt mismatches', patch: { offense: { huntMismatch: true } } },
  'zone_paint:d': { label: 'More motion & cuts against the zone', patch: { nudge: { actions: { motion: 25, iso: -15 } } } },
  'help_paint:d': { label: 'More threes against their help', patch: { nudge: { offense: { threePoint: 20 } } } },
  'pressure_to:d': { label: 'Handoffs against their pressure', patch: { nudge: { actions: { handoff: 25, iso: -10 } } } },
};

/** What a missed key asks of the next game against a team like this one, by the key's id (see keys.ts). */
const KEY_ADVICE: Record<string, string> = {
  glass: 'Their second chances came off your glass. Bodies back on the shot, fewer gambles.',
  line: 'They lived at the line. Play cleaner, above all against their drivers.',
  getback: 'They ran on you: sprint back in transition and crash less.',
  paint: 'They owned the paint. Pack it in, or keep your rim protector on longer.',
  ball: 'Turnovers fed them: a slower pace, fewer risky passes, more secure handlers.',
  crash: 'You left points on your own glass: crash the offensive boards harder.',
  attack: 'You never got to the line: attack the rim more.',
  fly: "Their defense gave up threes and you didn't take them: more threes next time.",
  pressure: 'Their handlers were loose and you let them be. More ball pressure, or press after makes.',
  star: 'Their scorer got his. Put your best defender on him in Matchups, or double him with a Star plan.',
  share: 'The ball stuck: more motion and handoffs, fewer isolations.',
};

/** Help levels that stay home on shooters ("Never help", "Stay home"). */
const HOME = new Set(TACTIC_LEVELS.help.slice(0, 2));

/**
 * Whether the user's defense stayed home on shooters tonight, as the night played it: the help he
 * tipped off with (his tactics, a game plan counter that stays home or packs the paint), then each
 * live move that changed it. `most`: for at least half the game; `from`: when it last went in, when
 * that was after the tip ("the end of Q1", "Q3 4:12"). Null when it never did.
 */
export function stayedHome(league: League, res: GameResult, side: 0 | 1): { most: boolean; from?: string } | null {
  const me = side === 0 ? res.home.tid : res.away.tid;
  let home = HOME.has(levelName('help', league.teams[me]?.tactics.defense.help ?? 50));
  for (const u of res.plan ?? []) {
    if (/stay home|never help/i.test(u.label)) home = true;
    else if (/pack the paint|wall off/i.test(u.label)) home = false;
  }
  const total = 2880 + res.ot * 300;
  const sec = (q: number, clock: number) => (q <= 4 ? q * 720 - clock : 2880 + (q - 4) * 300 - clock);
  let at = 0;
  let kept = 0;
  let from: string | undefined;
  for (const m of res.moves ?? []) {
    const to = m.kind === 'tactics' ? /Help defense: [^·]*?→ ([^·]+?)\s*(?:·|$)/.exec(m.text)?.[1] : undefined;
    if (!to) continue;
    const t = sec(m.q, m.clock);
    if (home) kept += t - at;
    at = t;
    home = HOME.has(to);
    if (home) from = m.clock <= 0 ? (m.q === 2 ? 'halftime' : `the end of Q${m.q}`) : gameTime(m.q, m.clock);
  }
  if (home) kept += total - at;
  if (kept <= 0) return null;
  return { most: kept >= total / 2, ...(home && from ? { from } : {}) };
}

/**
 * A missed key's word for next time. A threes key counts makes, so it can be missed on the looks
 * (we didn't take them, they got open ones) or on the night's shooting: the second is luck, and is
 * told that way. The looks are what the attempts were worth as taken (GameResult.xShots), or in an
 * older result the attempts at the league's three-point percentage. It knows the plan the night was
 * played with: a defense that already stayed home on shooters isn't told to (stayedHome).
 */
export function keyAdvice(league: League, k: KeyGrade, res: GameResult, side: 0 | 1): string {
  const [us, them] = side === 0 ? [res.home, res.away] : [res.away, res.home];
  const x = res.xShots && (side === 0 ? res.xShots : [res.xShots[1], res.xShots[0]]);
  const lg = leagueThreePct(league);
  if (k.id === 'fly' && (x ? x[0].tpm : us.t.tpa * lg) >= k.target - 0.5)
    return `The threes were there and you took them, ${madeAtt(us.t.tpm, us.t.tpa)}. They didn't fall. Keep taking them.`;
  if (k.id === 'arc' && (x ? x[1].tpm : them.t.tpa * lg) <= k.target + 0.5)
    return `They made ${madeAtt(them.t.tpm, them.t.tpa)} from three, more than their looks were worth. That part was luck.`;
  // (the looks themselves beat the key: that's the plan's to fix, and said as looks, not makes)
  if (k.id === 'arc') {
    const home = stayedHome(league, res, side);
    const looks = x ? `They got looks worth ${x[1].tpm.toFixed(0)} made threes, over the key's ${k.target}` : 'Their threes decided too much';
    if (home?.most)
      return `Stay home was in, and ${x ? `their looks were still worth ${x[1].tpm.toFixed(0)} made threes` : 'their threes still decided too much'}. Run their best shooter off the line in Matchups.`;
    if (home?.from) return `${looks}. Stay home only went in at ${home.from}. Start with it, or run their best shooter off the line.`;
    return `${looks}. Stay home on their shooters, or run their best one off the line.`;
  }
  return KEY_ADVICE[k.id] ?? '';
}

/** What a missed key is about, so advice on the same thing isn't given twice (a factor's category, or a tactical effect's topic). */
const KEY_TOPIC: Record<string, string> = { glass: 'rebounding', ball: 'turnovers', line: 'fouls', crash: 'rebounding' };
const IMPACT_TOPIC: Record<string, string> = {
  'crash_orb:o': 'rebounding',
  'zone_glass:o': 'rebounding',
  'shape_glass:o': 'rebounding',
  'shape_glass:d': 'rebounding',
  'role_poa:d': 'turnovers',
};

/** A four-factor edge's advice row, when its card is already up top: what to do, not the figures again. */
const DO_TITLE: Partial<Record<Factor['category'], string>> = {
  turnovers: 'Take care of the ball',
  rebounding: 'Win the glass',
  fouls: 'Stay off the line',
  shooting: 'Get better shots',
};

/**
 * The staff's read of the result in a sentence or two, the score left to the final above it: how it
 * went ("A 21-point rout.") and what decided it, in words.
 */
export function verdict(res: GameResult, side: 0 | 1, report: GameReport): string {
  const [us, them] = side === 0 ? [res.home.pts, res.away.pts] : [res.away.pts, res.home.pts];
  const won = us > them;
  const m = Math.abs(us - them);
  const ot = res.ot ? (res.ot > 1 ? `${res.ot} overtimes` : 'overtime') : '';
  // (a template per case, picked by the game's id: a game always reads the same, a season doesn't repeat itself)
  const say = (slot: string, list: string[]) => pick(res.gid, `verdict-${slot}`, list);
  const how = won
    ? ot
      ? say('wot', [`We won it in ${ot}.`, `${ot.charAt(0).toUpperCase()}${ot.slice(1)}, and we found a way.`])
      : m >= 20
        ? say('wbig', [`A ${m}-point rout.`, `We won by ${m}, and it was never close.`, `Never in doubt: a ${m}-point win.`])
        : m <= 3
          ? say('wclose', ['A nail-biter, and it went our way.', `We held on by ${m}.`, 'A close one, and we closed it out.'])
          : say('w', [`We won by ${m}.`, `A ${m}-point win.`, `We were ${m} points better tonight.`])
    : ot
      ? say('lot', [`We lost it in ${ot}.`, `${ot.charAt(0).toUpperCase()}${ot.slice(1)}, and it got away.`])
      : m >= 20
        ? say('lbig', [`Run off the floor by ${m}.`, `A ${m}-point loss. Never in it.`, `They beat us by ${m}, and it wasn't that close.`])
        : m <= 3
          ? say('lclose', ['A close one, and it got away.', `We lost by ${m}.`, 'It came down to the last few plays, and they made them.'])
          : say('l', [`They beat us by ${m}.`, `A ${m}-point loss.`, `We came up ${m} short.`]);
  // the biggest edge that went the winner's way (as the deciding edges tell them: a setting that only
  // won back what it cost didn't win it, and a cost of ours that our setting more than won back didn't lose it)
  const top = decidingFactors(report.factors, report.factors.length).find((f) => f.pts > 0 === won && !f.paid);
  const why: Partial<Record<Factor['category'], string[]>> = {
    shooting: won ? ['We shot it better.', "Our shots fell and theirs didn't."] : ['They shot it better.', "Their shots fell and ours didn't."],
    turnovers: won ? ['Their turnovers decided it.', 'We won the turnover battle.'] : ['Our turnovers decided it.', 'We gave it away too often.'],
    rebounding: won ? ['We won it on the glass.', 'The extra possessions on the glass did it.'] : ['They won it on the glass.', 'Their second chances did it.'],
    fouls: won ? ['We won it at the line.', 'The free throws did it.'] : ['They won it at the line.', 'Their free throws did it.'],
    tactics: won ? ['We won the tactical battle.', 'The game plan won it.'] : ['They won the tactical battle.', 'Their game plan won it.'],
    pace: won ? ['Our pace wore them down.'] : ['Their pace hurt us.'],
    fatigue: won ? ['Their legs went before ours.'] : ['Our legs went before theirs.'],
  };
  // a cost of one of our own settings (more than it won back) is ours, not their game plan's
  const own = !won && top?.category === 'tactics' && top.key ? leverNet(res.impacts, top.key, side) : null;
  if (own) why.tactics = [`Our ${own.what} cost us more than it won back.`];
  // shots falling above or below their looks is told as the luck it was, not as something to fix
  if (top?.luck) why.shooting = [luckLine(res, side, won)];
  else if (res.xShots)
    why.shooting = won ? ['We got the better looks.', 'Our offense found the better shots.'] : ['They got the better looks.', 'Their offense found the better shots.'];
  const second = top && why[top.category] ? say(`why-${top.category}`, why[top.category]!) : undefined;
  return second ? `${how} ${second}` : how;
}

/** A side's shooting against its looks (eFG made less eFG the attempts were worth) that reads as more than a rounding. */
const LUCK_GAP = 0.02;

/**
 * The luck in a sentence, told from both sides' numbers: whose shots fell above what their looks
 * were worth and whose fell below (never "ours didn't" when ours fell too).
 */
export function luckLine(res: GameResult, side: 0 | 1, won: boolean): string {
  const gap = (s: 0 | 1) => {
    const box = s === 0 ? res.home : res.away;
    const x = res.xShots?.[s];
    return x && box.t.fga ? (box.t.fgm + 0.5 * box.t.tpm) / box.t.fga - x.pts / 2 / box.t.fga : 0;
  };
  const [us, them] = [gap(side), gap((1 - side) as 0 | 1)];
  const theirsFell = them > LUCK_GAP;
  const theirsDidnt = them < -LUCK_GAP;
  const oursFell = us > LUCK_GAP;
  const oursDidnt = us < -LUCK_GAP;
  if (won) {
    const what =
      oursFell && theirsDidnt
        ? "Our shots fell and theirs didn't"
        : oursFell
          ? 'Our shots fell above our looks'
          : theirsDidnt
            ? "Their shots didn't fall"
            : 'The shots fell our way';
    return `${what}. The luck went our way.`;
  }
  const what =
    theirsFell && oursDidnt
      ? "Their shots fell and ours didn't"
      : theirsFell
        ? 'Their shots fell above their looks'
        : oursDidnt
          ? "Our shots didn't fall"
          : 'The shots fell their way';
  return `${what}. That part was luck, not the plan.`;
}

/** Trips on what a counter was aimed at before tonight reads as anything (fewer: "too few to tell"). */
const PLAN_MIN_TRIPS = 4;
/** Trips coming in a team's own rate needs to be the baseline (fewer: the league's rate on those plays). */
const PLAN_MIN_BEFORE = 30;
/**
 * Standard errors a night has to move from coming in before the report says so: a counter worth a
 * point a game moves a night's rate by far less than one game's noise, so a single night is told
 * only when it's well outside it, and the grade is the counter's measured worth.
 */
const PLAN_Z = 3;
/** The coach's first games with teaching on: the report says what a single night can and can't show. */
const FRAME_GAMES = 5;

/** Points and trips on these play types in a box, and the same over the season's games before this one (theirs on offense, or against them). */
function typeTally(league: League, res: GameResult, tid: number, types: string[]) {
  const sum = (box: GameResult['home']) =>
    types.reduce((a, k) => ({ poss: a.poss + (box.playTypes?.[k]?.poss ?? 0), pts: a.pts + (box.playTypes?.[k]?.pts ?? 0) }), { poss: 0, pts: 0 });
  const box = res.home.tid === tid ? res.home : res.away;
  const before = { poss: 0, pts: 0 };
  for (const g of league.games) {
    if (g.season !== res.season || g.gid === res.gid || g.day > res.day) continue;
    const b = g.home.tid === tid ? g.home : g.away.tid === tid ? g.away : null;
    if (!b) continue;
    const t = sum(b);
    before.poss += t.poss;
    before.pts += t.pts;
  }
  return { night: sum(box), before };
}

/** Points a trip across the league this season (engine-typical before any games). */
function leaguePpp(league: League): number {
  let pts = 0;
  let poss = 0;
  for (const g of league.games)
    if (g.season === league.season)
      for (const b of [g.home, g.away]) {
        pts += b.pts;
        poss += b.poss;
      }
  return poss >= 2_000 ? pts / poss : 1.12;
}

/** What a play type set is called in a line ("post-ups", "pick-and-roll"). */
function typesLabel(types: string[]): string {
  if (types.includes('pnrBH')) return 'pick-and-roll';
  if (types.includes('transition')) return 'transition';
  if (types.includes('iso')) return 'isolations';
  if (types.includes('post')) return 'post-ups';
  if (types.includes('handoff')) return 'handoffs';
  if (types.includes('spotup')) return 'spot-ups';
  return 'cuts';
}

/**
 * The game plan's counters, each graded on its measured worth (what the staff's paired games made
 * of it when it went in: see counterWorth.ts), with tonight on what it was aimed at beside it: their
 * points a trip on those plays (ours, for a counter on offense) against their rate coming in (the
 * league's, early in the season), or their player's points against his average. A night reads as
 * going for or against it only when the gap is PLAN_Z standard errors (a trip's points spread about
 * 1.1 either way); a counter with no play of its own to measure is told on the whole end of the floor.
 */
export function planGrades(league: League, res: GameResult, side: 0 | 1): PlanGrade[] {
  const me = side === 0 ? res.home.tid : res.away.tid;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const abbrev = (tid: number) => league.teams[tid].abbrev;
  const base = playTypeBaselines(league);
  return (res.plan ?? []).map((u) => {
    const call = worthCall({ pts: u.pts ?? 0 });
    // (a bad night for a counter measured a gain: one clause says both are true)
    const graded = (x: { label: string; line: string; night: PlanGrade['night'] }, against = false): PlanGrade => ({
      ...x,
      call,
      ...(against && call === 'gain' ? { bridge: 'A bad night for it. Over many games it should still help.' } : {}),
    });
    // one of theirs: his points tonight against his average coming in
    if (u.pid !== undefined) {
      const p = league.players[u.pid];
      const line = (side === 0 ? res.away : res.home).players.find((b) => b.pid === u.pid);
      const before = league.games
        .filter((g) => g.season === res.season && g.gid !== res.gid && g.day <= res.day)
        .flatMap((g) => [...g.home.players, ...g.away.players].filter((b) => b.pid === u.pid && b.min > 0));
      const avg = before.length ? before.reduce((a, b) => a + b.pts, 0) / before.length : null;
      const name = p ? playerName(p) : 'Their player';
      if (!line || line.min <= 0) return graded({ label: u.label, line: `${name} didn't play.`, night: 'few' });
      // (a scorer's night spreads about 7 points either way: told past PLAN_Z of it)
      const d = avg === null ? 0 : avg - line.pts;
      const night = avg === null || before.length < 3 ? 'few' : d > 7 * PLAN_Z ? 'better' : d < -7 * PLAN_Z ? 'worse' : 'same';
      return graded({ label: u.label, line: `${name} ${line.pts} points${avg !== null ? `, ${avg.toFixed(1)} a game coming in` : ''}.`, night }, night !== 'few' && d < -7);
    }
    // play types, or the whole end of the floor
    const off = u.end === 'off';
    const tid = off ? me : opp;
    const types = u.types?.length ? u.types : null;
    const all = Object.keys(base);
    const t = typeTally(league, res, tid, types ?? all);
    if (u.end === 'both' && !types) return graded({ label: u.label, line: 'It changes both ends: a stretch of games shows it, not a night.', night: 'few' });
    // (with too few trips of their own coming in: the league's rate on those plays)
    const lgRate = types ? types.reduce((a, k) => a + (base[k] ?? 1), 0) / types.length : leaguePpp(league);
    const wasRate = t.before.poss >= PLAN_MIN_BEFORE ? t.before.pts / t.before.poss : lgRate;
    const what = `${abbrev(tid)} ${types ? typesLabel(types) : 'offense'}`;
    if (t.night.poss < PLAN_MIN_TRIPS || wasRate === null)
      return graded({ label: u.label, line: `${what}: ${plural(t.night.poss, 'trip')} tonight, too few to tell.`, night: 'few' });
    const now = t.night.pts / t.night.poss;
    const wasTrips = t.before.poss >= PLAN_MIN_BEFORE ? t.before.poss : 200;
    const se = 1.1 * Math.sqrt(1 / t.night.poss + 1 / wasTrips);
    const d = (now - wasRate) * (off ? 1 : -1);
    const night = d > PLAN_Z * se ? 'better' : d < -PLAN_Z * se ? 'worse' : 'same';
    const was = t.before.poss >= PLAN_MIN_BEFORE ? `${wasRate.toFixed(2)} coming in` : `the league's ${wasRate.toFixed(2)}`;
    return graded({ label: u.label, line: `Tonight: ${what} ${now.toFixed(2)} a trip on ${plural(t.night.poss, 'trip')}, ${was}.`, night }, d < -se);
  });
}

/** A win by this many has no "next time": the advice is for nights that were in reach. */
const ROUT = 15;

/** "+2.1", "−0.4", "0.0": a reading in points with its sign (a true minus). */
const sgn1 = (x: number) => (Math.abs(x) < 0.05 ? '0.0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`);

/** Moves this late (the fourth quarter's or an overtime's last six minutes, crunch time) are judged by the win chance: a point of margin there isn't the question. */
const LATE_CLOCK = 360;

/**
 * What the staff makes of the night's moves (GameResult.movesWorth, measured after the final), in words:
 * that they seemed to help or hurt when the reading is clear of even (two standard errors), "too close
 * to say" inside them, and in `detail` the move that mattered most when one clearly did. Moves made
 * only in crunch time (a late play call), or a night whose win-chance reading is clearer than its
 * points, are judged by the win chance instead, as the bench's late calls are (CallWorth.by 'win'):
 * a call that won the game moves the margin by a point or two and the result by much more. Null for
 * a game with none measured. `staff`: every move was the staff's (the bench handed to it).
 */
export function nightLine(res: GameResult, staff = false): { text: string; detail: string; tone: 'good' | 'bad' | 'dim' } | null {
  const w = res.movesWorth;
  if (!w || !Number.isFinite(w.pts) || !Number.isFinite(w.se)) return null;
  const moves = res.moves ?? [];
  // (one play called: the call)
  const call = moves.length === 1 && moves[0].kind === 'play';
  const who = staff ? (call ? "The staff's call" : "The staff's moves") : call ? 'Your call' : 'Your moves';
  const lower = `${who.charAt(0).toLowerCase()}${who.slice(1)}`;
  const line = (clear: boolean, up: boolean): { text: string; detail: string; tone: 'good' | 'bad' | 'dim' } => ({
    text: clear ? `${who} seemed to ${up ? 'help' : 'hurt'} tonight` : `Too close to say whether ${lower} helped tonight`,
    detail: w.top && typeof w.top.text === 'string' ? `Mattered most · ${w.top.text}.` : '',
    tone: !clear ? 'dim' : up ? 'good' : 'bad',
  });
  // by the win chance: late moves, or a reading clearer in it than in points (a reading from before its noise was kept is read by the points)
  const winSe = w.winSe;
  if (winSe !== undefined && Number.isFinite(winSe) && winSe > 0 && Number.isFinite(w.win)) {
    const late = moves.length > 0 && moves.every((m) => m.q >= 4 && m.clock < LATE_CLOCK);
    const zWin = Math.abs(w.win) / winSe;
    const clearWin = zWin >= 2 && Math.round(w.win * 100) !== 0;
    if (late || (clearWin && zWin > Math.abs(w.raw) / Math.max(w.se, 1e-9))) return line(clearWin, w.win > 0);
  }
  return line(Math.abs(w.raw) >= 2 * w.se && Math.abs(w.pts) >= 0.05, w.pts > 0);
}

/**
 * The coach's live coaching over a season, as measured game by game (GameResult.movesWorth): the
 * points his moves added, the standard error of that sum, and the games it's over. Null before a
 * coached game was measured. The line reads where a coach's record is (Career: see seasonCoachingLine).
 */
export function seasonCoaching(league: League, season = league.season, tid = league.userTid): { pts: number; raw: number; se: number; games: number } | null {
  let pts = 0;
  let raw = 0;
  let v = 0;
  let games = 0;
  for (const g of league.games) {
    const w = g.movesWorth;
    if (g.season !== season || (g.home.tid !== tid && g.away.tid !== tid) || !w || !Number.isFinite(w.pts) || !Number.isFinite(w.raw) || !Number.isFinite(w.se)) continue;
    pts += w.pts;
    raw += w.raw;
    v += w.se ** 2;
    games++;
  }
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return games ? { pts: r1(pts), raw: r1(raw), se: r1(Math.sqrt(v)), games } : null;
}

/**
 * "Your live coaching this season seems to help, over 9 games": said clear of even as a night is (the
 * readings as measured, two standard errors), in words. Null with fewer than two games measured (one
 * is the night's own line).
 */
export function seasonCoachingLine(league: League, season = league.season, tid = league.userTid): string | null {
  const c = seasonCoachingRead(league, season, tid);
  if (!c) return null;
  return c.clear
    ? `Your live coaching this season seems to ${c.worth.startsWith('+') ? 'help' : 'hurt'}, over ${plural(c.games, 'game')}`
    : `Your live coaching this season is too close to say, over ${plural(c.games, 'game')}`;
}

/** The season's live coaching as the line reads it, in parts (Career's record row): its worth ("+4.2"), whether it's clear of even, its ± and the games. Null under two games. */
export function seasonCoachingRead(league: League, season = league.season, tid = league.userTid): { worth: string; clear: boolean; pm: string; games: number } | null {
  const c = seasonCoaching(league, season, tid);
  if (!c || c.games < 2) return null;
  return { worth: sgn1(c.pts), clear: Math.abs(c.raw) >= 2 * c.se && Math.abs(c.pts) >= 0.05, pm: `±${Math.max(0.1, c.se).toFixed(1)}`, games: c.games };
}

/**
 * The user's players hurt in a game (GameResult.hurt), each with the games he's out as things stand:
 * "Davis, out 5 games · Sarr, out 3 games", one back already "back now". Undefined: none, or an
 * older result that didn't keep them.
 */
export function hurtLine(league: League, res: GameResult): string | undefined {
  const parts = (res.hurt ?? []).flatMap((pid) => {
    const p = league.players[pid];
    if (!p) return [];
    return [`${shortName(league, p)}, ${p.injury ? `out ${plural(p.injury.gamesRemaining, 'game')}` : 'back now'}`];
  });
  return parts.length ? parts.join(' · ') : undefined;
}

/** The coach's games so far with his team this season (tonight's included). */
const gamesIn = (league: League, res: GameResult, me: number) =>
  league.games.filter((g) => g.season === res.season && g.day <= res.day && (g.home.tid === me || g.away.tid === me)).length;

export function debrief(league: League, res: GameResult, report: GameReport): Debrief {
  const me = league.userTid;
  const side: 0 | 1 = res.home.tid === me ? 0 : 1;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const tactics = league.teams[me].tactics;
  const advice: DebriefAdvice[] = [];
  const seen = new Set<string>();
  // what the advice so far is about, so the same fix isn't given twice in other words
  const topics = new Set<string>();
  const decided = decidingFactors(report.factors);
  // a standing cost the staff named after the last game too isn't said again every night (once it
  // adds up over the season, the staff's card on Tactics carries it), unless it's one of tonight's
  // deciding edges
  const prev = league.games.filter((g) => g.season === res.season && g.gid !== res.gid && g.day < res.day && (g.home.tid === me || g.away.tid === me)).pop();
  const prevRep = prev?.impacts ? buildGameReport(league, prev) : null;
  const saidLast = new Set((prevRep?.factors ?? []).filter((f) => f.key && f.pts <= -0.8).map((f) => f.key!));
  for (const f of report.factors) {
    if (f.pts > -0.8) continue;
    if (f.key && saidLast.has(f.key) && !decided.includes(f)) continue;
    const fix = f.key ? impactCounter(f.key, tactics) : undefined;
    const off = f.key ? OFFENSE_FIXES[f.key] : undefined;
    if (!fix && off && !seen.has(off.label) && !labelCosts(off.label)) {
      const patch = tacticsDiff(tactics, applyPatch(tactics, off.patch));
      if (!emptyPatch(patch)) {
        seen.add(off.label);
        topics.add(f.key!);
        advice.push({ id: `fix-${f.key}`, title: f.title.replace(/\.$/, ''), text: f.advice ?? f.detail, patch, label: off.label, group: `debrief-${off.label}` });
      }
      continue;
    }
    if (fix) {
      if (seen.has(fix.label)) continue;
      seen.add(fix.label);
      // (a counter that measured as a cost where the bench calls it, off this edge or another, isn't
      // next time's fix either: the switch to Hedge off a Drop their handlers pulled up over)
      const key = callKey(`imp-${f.key}`, fix.label);
      if (callCosts(key) || labelCosts(fix.label)) continue;
      const after = cloneTactics(tactics);
      fix.apply(after);
      const patch = tacticsDiff(tactics, after);
      if (emptyPatch(patch)) continue;
      topics.add((f.key && IMPACT_TOPIC[f.key]) || f.key!);
      const m = callWorth(key);
      const worth = m && m.pts >= 2 * m.ptsSe ? worthLine(key) : undefined;
      advice.push({
        id: `fix-${f.key}`,
        title: f.title.replace(/\.$/, ''),
        text: f.advice ?? f.detail,
        patch,
        label: fix.label,
        group: `debrief-${fix.label}`,
        ...(worth && { worth }),
      });
    } else if (f.advice && advice.length < 4) {
      const topic = (f.key && IMPACT_TOPIC[f.key]) || (f.key ? f.key : f.category);
      if (topics.has(topic)) continue;
      topics.add(topic);
      // (its card is up top: the row says what to do, not the figures again)
      const title = decided.includes(f) && !f.key ? (DO_TITLE[f.category] ?? f.title) : f.title;
      advice.push({ id: `adv-${f.title}`, title: title.replace(/\.$/, ''), text: f.advice });
    }
  }
  for (const k of res.keys ?? []) {
    if (k.met !== false || advice.length >= 5) continue;
    const text = keyAdvice(league, k, res, side);
    if (!text || (KEY_TOPIC[k.id] && topics.has(KEY_TOPIC[k.id]))) continue;
    // a key missed on a front the night was won on (the glass as a deciding edge for us) isn't next time's lesson
    if (KEY_TOPIC[k.id] && decided.some((f) => f.pts > 0 && (f.topic ?? f.category) === KEY_TOPIC[k.id])) continue;
    // (the keys' own list has its number against the goal)
    advice.push({ id: `key-${k.id}`, title: `Missed key: ${k.title}`, text });
  }
  const moves = res.moves?.length ? { count: res.moves.length } : null;
  const meetAgain = league.schedule.some((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)));
  // a win by 15 or more has no lesson in it: whatever cost a few points didn't decide anything
  const mine = side === 0 ? res.home.pts - res.away.pts : res.away.pts - res.home.pts;
  if (mine >= ROUT) advice.length = 0;
  const plan = planGrades(league, res, side);
  // a coach's first nights: what one game can and can't say, so "luck" doesn't read as "nothing you do matters"
  const first = league.settings.teaching !== false && league.season === league.startSeason && gamesIn(league, res, me) <= FRAME_GAMES;
  // (the luck half only on a night luck decided)
  const lucky = decided.some((f) => f.luck);
  const frame = first ? `${lucky ? "One night's shooting is luck. " : ''}A plan shows over a stretch of games, not one night.` : undefined;
  const hurt = hurtLine(league, res);
  return { headline: verdict(res, side, report), decided, moves, advice: advice.slice(0, 5), plan, frame, ...(hurt && { hurt }), opp, meetAgain };
}
