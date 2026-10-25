// The staff's debrief after one of the user's games: the verdict (the report's headline), the edges
// that decided it, how the coach's moves in a live game went, and what to do next time: the
// one-tap counter for each edge that went against him while his tactics still give it (as a patch,
// for the plan against this opponent or for good), the practice focus when playing a step slow in
// tactics the team hasn't drilled cost points, and a word on each key to the game he missed.
// Pure: it reads the stored result and the report built from it.

import type { GameResult, KeyGrade, League, PrepFocus, TacticsPatch } from '../types';
import { madeAtt, plural } from '../format';
import { playerName } from '../league/helpers';
import { playTypeBaselines } from './playTypes';
import { leagueThreePct } from '../ai/opponentPlan';
import { PREP_META, famLabel, gamesTo } from '../sim/familiarity';
import { buildGameReport, decidingFactors, type GameReport, type Factor } from './gameReport';
import { moveVerdict } from './moves';
import { worthCall } from '../ai/counterWorth';
import { pick } from './quotes';
import { famReadout, impactCounter } from '../ai/advisor';
import { applyPatch, cloneTactics, tacticsDiff, emptyPatch } from '../sim/tactics';

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
  /** A practice focus to switch to between games (one tap, instead of a tactics change). */
  prep?: PrepFocus;
}

/** How one counter of the game plan went (see planGrades). */
export interface PlanGrade {
  label: string;
  /** What it was aimed at tonight against coming in: "SAS post-ups 0.75 a trip on 8 trips, 1.10 coming in". */
  line: string;
  /** Its grade: what the staff measured it worth over many games when it went in (a gain, a cost, or even). */
  call: 'gain' | 'cost' | 'even';
  /** What that measure was, in points: "+0.4 a game". */
  worth?: string;
  /**
   * Tonight on what it was aimed at, against coming in: 'better' / 'worse' only for a night far
   * outside a single game's noise (PLAN_Z), 'same' otherwise, 'few' with too few trips to say.
   */
  night: 'better' | 'worse' | 'same' | 'few';
}

export interface Debrief {
  /** The staff's read: how it went and what decided it, in words (the final above has the score). */
  headline: string;
  /** The biggest edges, at most three, biggest first. */
  decided: Factor[];
  /** The live game's moves: how many, and how many read as working or not by the final. */
  moves: { count: number; working: number; notWorking: number } | null;
  advice: DebriefAdvice[];
  /** The game plan's counters, each graded on what it was aimed at. */
  plan: PlanGrade[];
  /** Said on a coach's first games: one night's shooting is luck, a plan shows over a stretch. */
  frame?: string;
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
  glass: 'Their second chances came off your glass: bodies back on the shot, fewer gambles for the ball.',
  arc: 'Their threes decided too much: stay home on their shooters (less help), or run their best one off the line.',
  line: 'They lived at the line: play cleaner (less physicality), above all against their drivers.',
  getback: 'They ran on you: sprint back in transition and crash less.',
  paint: 'They owned the paint: pack it in, or keep your rim protector on the floor longer.',
  ball: 'Turnovers fed them: a slower pace, fewer risky passes, more secure handlers.',
  crash: 'You left points on your own glass: crash the offensive boards harder.',
  attack: 'You never got to the line: attack the rim more.',
  fly: "Their defense gave up threes and you didn't take them: more threes next time.",
  pressure: 'Their handlers were loose and you let them be: more ball pressure, or a press after makes.',
  star: 'Their scorer got his: put your best defender on him (Matchups), or double him if he can’t pass out of it (Star plan).',
  share: 'The ball stuck: more motion and handoffs, fewer isolations.',
};

/**
 * A missed key's word for next time. A threes key counts makes, so it can be missed on the looks
 * (we didn't take them, they got open ones) or on the night's shooting: the second is luck, and is
 * told that way. The looks are what the attempts were worth as taken (GameResult.xShots), or in an
 * older result the attempts at the league's three-point percentage.
 */
export function keyAdvice(league: League, k: KeyGrade, res: GameResult, side: 0 | 1): string {
  const [us, them] = side === 0 ? [res.home, res.away] : [res.away, res.home];
  const x = res.xShots && (side === 0 ? res.xShots : [res.xShots[1], res.xShots[0]]);
  const lg = leagueThreePct(league);
  if (k.id === 'fly' && (x ? x[0].tpm : us.t.tpa * lg) >= k.target - 0.5)
    return `The threes were there and you took them (${madeAtt(us.t.tpm, us.t.tpa)}): they didn't fall. Keep taking them.`;
  if (k.id === 'arc' && (x ? x[1].tpm : them.t.tpa * lg) <= k.target + 0.5)
    return `They made ${madeAtt(them.t.tpm, them.t.tpa)} from three, more than their looks were worth on a normal night: that part was luck, not your plan.`;
  // (the looks themselves beat the key: that's the plan's to fix, and said as looks, not makes)
  if (k.id === 'arc' && x)
    return `They got looks worth ${x[1].tpm.toFixed(0)} made threes (the key was ${k.target} or fewer): stay home on their shooters (less help), or run their best one off the line.`;
  return KEY_ADVICE[k.id] ?? '';
}

/** What a missed key is about, so advice on the same thing isn't given twice (a factor's category, or a tactical effect's topic). */
const KEY_TOPIC: Record<string, string> = { glass: 'rebounding', ball: 'turnovers', line: 'fouls', crash: 'rebounding', star: 'stars' };
const IMPACT_TOPIC: Record<string, string> = {
  'crash_orb:o': 'rebounding',
  'zone_glass:o': 'rebounding',
  'shape_glass:o': 'rebounding',
  'shape_glass:d': 'rebounding',
  'role_poa:d': 'turnovers',
};

/** The edges a team a step slow in its tactics gives away (see sim/familiarity.ts): practice answers them, not a tactics change. */
const FAM_KEYS = new Set(['fam_off:d', 'fam_def:o']);
/** Points playing a step slow has to cost before the staff talks practice. */
const FAM_COST = 0.8;
/** At or above this the system itself is learned: a cost came from tonight's plan instead. */
const SYSTEM_KNOWN = 85;

/**
 * The staff's word on practice when playing a step slow cost points: the system still being learned
 * (Tactical drills, and no more changes to it), or a game plan that asked for what the team hadn't
 * drilled (Opponent prep drills the plan for the game). Null when it cost little.
 */
export function practiceAdvice(league: League, cost: number): DebriefAdvice | null {
  if (cost < FAM_COST) return null;
  const me = league.userTid;
  const prep = league.teams[me].prep ?? 'balanced';
  const r = famReadout(league);
  const sys = r.overall;
  const pts = `${cost.toFixed(1)} points`;
  if (sys >= SYSTEM_KNOWN && !r.risks.length) {
    // the system is drilled: what wasn't is what tonight changed (the game plan, another tactic)
    return {
      id: 'prep-opponent',
      title: 'Drill the game plan',
      text: `Playing a step slow cost us ${pts}: tonight we played things we haven't drilled. ${prep === 'opponent' ? 'Opponent prep has the next plan drilled for its game.' : `${PREP_META.opponent.label} drills the next game's plan for that game.`}`,
      ...(prep !== 'opponent' && { prep: 'opponent' as const, label: PREP_META.opponent.label }),
    };
  }
  const left = gamesTo(sys);
  return {
    id: 'prep-system',
    title: prep === 'system' ? 'Stick with the system' : 'Drill the system',
    text:
      `Playing a step slow cost us ${pts}: we're ${Math.round(sys)}% familiar with what we play (${famLabel(sys).toLowerCase()}). ` +
      (prep === 'system'
        ? `Keep the drills going and don't change it again${left > 0 ? `: about ${left} game${left === 1 ? '' : 's'} to fluid` : ''}.`
        : `${PREP_META.system.label} between games build it about twice as fast. Don't change it again until it's learned.`),
    ...(prep !== 'system' && { prep: 'system' as const, label: PREP_META.system.label }),
  };
}

/** A four-factor or star edge's advice row, when its card is already up top: what to do, not the figures again. */
const DO_TITLE: Partial<Record<Factor['category'], string>> = {
  turnovers: 'Take care of the ball',
  rebounding: 'Win the glass',
  fouls: 'Stay off the line',
  stars: 'Slow their star',
  shooting: 'Get better shots',
};

/**
 * The staff's read of the result in a sentence or two, the score left to the final above it: how it
 * went ("A 21-point rout.") and what decided it, in words (the edges' cards carry the figures).
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
  // the biggest edge that went the winner's way (as the deciding edges tell them: a setting that only won back what it cost didn't win it)
  const top = decidingFactors(report.factors, report.factors.length).find((f) => f.pts > 0 === won);
  const why: Partial<Record<Factor['category'], string[]>> = {
    shooting: won ? ['We shot it better.', "Our shots fell and theirs didn't."] : ['They shot it better.', "Their shots fell and ours didn't."],
    turnovers: won ? ['Their turnovers decided it.', 'We won the turnover battle.'] : ['Our turnovers decided it.', 'We gave it away too often.'],
    rebounding: won ? ['We won it on the glass.', 'The extra possessions on the glass did it.'] : ['They won it on the glass.', 'Their second chances did it.'],
    fouls: won ? ['We won it at the line.', 'The free throws did it.'] : ['They won it at the line.', 'Their free throws did it.'],
    stars: won ? ['Our star took it over.'] : ['Their star took it over.'],
    tactics: won ? ['We won the tactical battle.', 'The game plan won it.'] : ['They won the tactical battle.', 'Their game plan won it.'],
    pace: won ? ['Our pace wore them down.'] : ['Their pace hurt us.'],
    fatigue: won ? ['Their legs went before ours.'] : ['Our legs went before theirs.'],
  };
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
          ? 'Our shots fell above what our looks were worth'
          : theirsDidnt
            ? "Their shots didn't fall"
            : 'The shots fell our way';
    return `${what}: the luck went our way.`;
  }
  const what =
    theirsFell && oursDidnt
      ? "Their shots fell and ours didn't"
      : theirsFell
        ? 'Their shots fell above what their looks were worth'
        : oursDidnt
          ? "Our shots didn't fall"
          : 'The shots fell their way';
  return `${what}: that part was luck, not the plan.`;
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
    const worth = u.pts !== undefined && Math.abs(u.pts) >= 0.05 ? `${u.pts > 0 ? '+' : '−'}${Math.abs(u.pts).toFixed(1)} a game` : undefined;
    const call = worthCall({ pts: u.pts ?? 0 });
    const graded = <T extends { night: PlanGrade['night'] }>(x: T & { label: string; line: string }): PlanGrade => ({ ...x, call, ...(worth ? { worth } : {}) });
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
      return graded({ label: u.label, line: `${name} ${line.pts} points${avg !== null ? `, ${avg.toFixed(1)} a game coming in` : ''}.`, night });
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
    return graded({ label: u.label, line: `Tonight: ${what} ${now.toFixed(2)} a trip on ${plural(t.night.poss, 'trip')}, ${was}.`, night });
  });
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
  // playing a step slow (every play of it, the report's rows only show the big ones): one word on
  // practice for both ends, where the first of them would have gone, or after the fixes
  const famCostOf = (g: GameResult | undefined) => {
    const s = g ? (g.home.tid === me ? 0 : 1) : side;
    return (g?.impacts ?? []).filter((im) => im.t !== s && FAM_KEYS.has(im.key)).reduce((a, im) => a + im.pts, 0);
  };
  const famCost = famCostOf(res);
  const fa = practiceAdvice(league, famCost);
  // with the focus already the one it asks for, it's said once, not after every game of the stretch
  const famAdvice = fa && !fa.prep && famCostOf(prev) >= FAM_COST ? null : fa;
  for (const f of report.factors) {
    if (f.key && FAM_KEYS.has(f.key)) {
      if (famAdvice && f.pts < 0 && !advice.includes(famAdvice)) advice.push(famAdvice);
      continue;
    }
    if (f.pts > -0.8) continue;
    if (f.key && saidLast.has(f.key) && !decided.includes(f)) continue;
    const fix = f.key ? impactCounter(f.key, tactics) : undefined;
    const off = f.key ? OFFENSE_FIXES[f.key] : undefined;
    if (!fix && off && !seen.has(off.label)) {
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
      const after = cloneTactics(tactics);
      fix.apply(after);
      const patch = tacticsDiff(tactics, after);
      if (emptyPatch(patch)) continue;
      topics.add((f.key && IMPACT_TOPIC[f.key]) || f.key!);
      advice.push({ id: `fix-${f.key}`, title: f.title.replace(/\.$/, ''), text: f.advice ?? f.detail, patch, label: fix.label, group: `debrief-${fix.label}` });
    } else if (f.advice && advice.length < 4) {
      const topic = (f.key && IMPACT_TOPIC[f.key]) || (f.key ? f.key : f.category);
      if (topics.has(topic)) continue;
      topics.add(topic);
      // (its card is up top: the row says what to do, not the figures again)
      const title = decided.includes(f) && !f.key ? (DO_TITLE[f.category] ?? f.title) : f.title;
      advice.push({ id: `adv-${f.title}`, title: title.replace(/\.$/, ''), text: f.advice });
    }
  }
  if (famAdvice && !advice.includes(famAdvice)) advice.splice(Math.min(advice.length, 3), 0, famAdvice);
  for (const k of res.keys ?? []) {
    if (k.met !== false || advice.length >= 5) continue;
    const text = keyAdvice(league, k, res, side);
    if (!text || (KEY_TOPIC[k.id] && topics.has(KEY_TOPIC[k.id]))) continue;
    // a key missed on a front the night was won on (the glass as a deciding edge for us) isn't next time's lesson
    if (KEY_TOPIC[k.id] && decided.some((f) => f.pts > 0 && (f.topic ?? f.category) === KEY_TOPIC[k.id])) continue;
    // (the keys' own list has its number against the goal)
    advice.push({ id: `key-${k.id}`, title: `Missed key: ${k.title}`, text });
  }
  const moves = res.moves?.length
    ? {
        count: res.moves.length,
        working: res.moves.filter((m) => m.kind !== 'timeout' && moveVerdict(m).verdict === 'better').length,
        notWorking: res.moves.filter((m) => m.kind !== 'timeout' && moveVerdict(m).verdict === 'worse').length,
      }
    : null;
  const meetAgain = league.schedule.some((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)));
  const plan = planGrades(league, res, side);
  // a coach's first nights: what one game can and can't say, so "luck" doesn't read as "nothing you do matters"
  const first = league.settings.teaching !== false && league.season === league.startSeason && gamesIn(league, res, me) <= FRAME_GAMES;
  // (the luck half only on a night luck decided)
  const lucky = decided.some((f) => f.luck);
  const frame = first
    ? `${lucky ? "One night's shooting swings a game either way: the report calls that luck. " : ''}A plan shows over a stretch of games, not one night${plan.length ? ': yours is graded on what the staff measured each counter worth over many games, with tonight beside it' : ''}.`
    : undefined;
  return { headline: verdict(res, side, report), decided, moves, advice: advice.slice(0, 5), plan, frame, opp, meetAgain };
}
