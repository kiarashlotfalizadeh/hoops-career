// The staff's debrief after one of the user's games: the verdict (the report's headline), the edges
// that decided it, how the coach's moves in a live game went, and what to do next time: the
// one-tap counter for each edge that went against him while his tactics still give it (as a patch,
// for the plan against this opponent or for good), and a word on each key to the game he missed.
// Pure: it reads the stored result and the report built from it.

import type { GameResult, KeyGrade, League, TacticsPatch } from '../types';
import type { GameReport, Factor } from './gameReport';
import { moveVerdict } from './moves';
import { impactCounter } from '../ai/advisor';
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
}

export interface Debrief {
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
 * the report's advice names it: relative nudges, so it builds on whatever playbook you run.
 */
const OFFENSE_FIXES: Record<string, { label: string; patch: TacticsPatch }> = {
  'drop_rim:d': { label: 'More handoffs against the drop', patch: { nudge: { actions: { handoff: 25, pnr: -10 } } } },
  'hedge_stall:d': { label: 'Move it after the hedge', patch: { nudge: { actions: { motion: 25, pnr: -15 } } } },
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
  star: 'Their scorer got his: deny him, double him, or put your best defender on him.',
  share: 'The ball stuck: more motion and handoffs, fewer isolations.',
};

/** The key's number on the night against its goal, a few words ("37% (goal ≤ 29%)"). */
const keyLine = (k: KeyGrade) => `${k.value ?? '—'}${k.pct ? '%' : ''} (goal ${k.dir === 'max' ? '≤' : '≥'} ${k.target}${k.pct ? '%' : ''})`;

export function debrief(league: League, res: GameResult, report: GameReport): Debrief {
  const me = league.userTid;
  const side: 0 | 1 = res.home.tid === me ? 0 : 1;
  const opp = side === 0 ? res.away.tid : res.home.tid;
  const tactics = league.teams[me].tactics;
  const advice: DebriefAdvice[] = [];
  const seen = new Set<string>();
  for (const f of report.factors) {
    if (f.pts > -0.8) continue;
    const fix = f.key ? impactCounter(f.key, tactics) : undefined;
    const off = f.key ? OFFENSE_FIXES[f.key] : undefined;
    if (!fix && off && !seen.has(off.label)) {
      const patch = tacticsDiff(tactics, applyPatch(tactics, off.patch));
      if (!emptyPatch(patch)) {
        seen.add(off.label);
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
      advice.push({ id: `fix-${f.key}`, title: f.title.replace(/\.$/, ''), text: f.advice ?? f.detail, patch, label: fix.label, group: `debrief-${fix.label}` });
    } else if (f.advice && advice.length < 4) advice.push({ id: `adv-${f.title}`, title: f.title.replace(/\.$/, ''), text: f.advice });
  }
  for (const k of res.keys ?? []) {
    if (k.met !== false || advice.length >= 5) continue;
    const text = KEY_ADVICE[k.id] ?? '';
    if (!text) continue;
    advice.push({ id: `key-${k.id}`, title: `Missed: ${k.title} — ${keyLine(k)}`, text });
  }
  const moves = res.moves?.length
    ? {
        count: res.moves.length,
        working: res.moves.filter((m) => m.kind !== 'timeout' && moveVerdict(m).verdict === 'better').length,
        notWorking: res.moves.filter((m) => m.kind !== 'timeout' && moveVerdict(m).verdict === 'worse').length,
      }
    : null;
  const meetAgain = league.schedule.some((g) => !g.played && g.day >= league.day && ((g.home === me && g.away === opp) || (g.away === me && g.home === opp)));
  return { headline: report.headline, decided: report.factors.slice(0, 3), moves, advice: advice.slice(0, 5), opp, meetAgain };
}
