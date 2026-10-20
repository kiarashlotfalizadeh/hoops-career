// The staff's debrief after one of the user's games: the verdict (the report's headline), the edges
// that decided it, how the coach's moves in a live game went, and what to do next time: the
// one-tap counter for each edge that went against him while his tactics still give it (as a patch,
// for the plan against this opponent or for good), the practice focus when playing a step slow in
// tactics the team hasn't drilled cost points, and a word on each key to the game he missed.
// Pure: it reads the stored result and the report built from it.

import type { GameResult, League, PrepFocus, TacticsPatch } from '../types';
import { PREP_META, famLabel, gamesTo } from '../sim/familiarity';
import { buildGameReport, type GameReport, type Factor } from './gameReport';
import { moveVerdict } from './moves';
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

export interface Debrief {
  /** The staff's read: how it went and what decided it, in words (the final above has the score). */
  headline: string;
  /** The biggest edges, at most three, biggest first. */
  decided: Factor[];
  /** The live game's moves: how many, and how many read as working or not by the final. */
  moves: { count: number; working: number; notWorking: number } | null;
  advice: DebriefAdvice[];
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
  star: 'Their scorer got his: deny him the ball (Star plan), or put your best defender on him (Matchups).',
  share: 'The ball stuck: more motion and handoffs, fewer isolations.',
};

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
  // the biggest edge that went the winner's way
  const top = report.factors.find((f) => f.pts > 0 === won);
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
  const second = top && why[top.category] ? say(`why-${top.category}`, why[top.category]!) : undefined;
  return second ? `${how} ${second}` : how;
}

export function debrief(league: League, res: GameResult, report: GameReport): Debrief {
  const me = league.userTid;
  const side: 0 | 1 = res.home.tid === me ? 0 : 1;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const tactics = league.teams[me].tactics;
  const advice: DebriefAdvice[] = [];
  const seen = new Set<string>();
  // what the advice so far is about, so the same fix isn't given twice in other words
  const topics = new Set<string>();
  const decided = report.factors.slice(0, 3);
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
    const text = KEY_ADVICE[k.id] ?? '';
    if (!text || (KEY_TOPIC[k.id] && topics.has(KEY_TOPIC[k.id]))) continue;
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
  return { headline: verdict(res, side, report), decided, moves, advice: advice.slice(0, 5), opp, meetAgain };
}
