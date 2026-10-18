// Morale as the screens show it, read-only and true to the engine (see morale.ts): the marker a
// roster row carries when a player's mood matters, the pulls behind his mood (the same components
// updateMorale weighs), what his mood and the locker room do to his play (moodPerf × lockerRoomPerf,
// as buildSimInput applies them), and whether a minutes target leaves him short of what he expects.
import type { League, Player } from '../types';
import { clamp } from '../random';
import { MOOD_META, lockerRoomPerf, moodLevel, moodPerf } from './morale';
import { teamPlayers } from './helpers';

export interface MoodMarker {
  /** "Wants a trade", "Furious", "Unhappy". */
  label: string;
  tone: 'bad' | 'warn';
}

/** The marker a player's row carries when his mood matters (he asked out, or he's unhappy); null otherwise. */
export function moodMarker(p: Player): MoodMarker | null {
  if (p.mood.tradeRequest) return { label: 'Wants a trade', tone: 'bad' };
  const level = moodLevel(p.mood.score);
  if (level === 'furious') return { label: 'Furious', tone: 'bad' };
  if (level === 'unhappy') return { label: 'Unhappy', tone: 'warn' };
  return null;
}

export interface MoodReason {
  key: 'minutes' | 'winning' | 'role' | 'contract';
  text: string;
  /** Its pull on his mood (the component updateMorale adds up), + lifts it, − drags it down. */
  v: number;
}

/**
 * What pulls his mood up or down this week, biggest first: playing time against what he expects,
 * winning, his role and his pay (each a component of his mood score; his score itself moves toward
 * their sum a little each week). Pulls too small to matter are left out.
 */
export function moodReasons(p: Player): MoodReason[] {
  const m = p.mood;
  const out: MoodReason[] = [
    {
      key: 'minutes',
      v: m.ptComponent,
      text: m.ptComponent < 0 ? `Wants more minutes${m.expectedMin ? `: expects about ${m.expectedMin}` : ''}` : 'Happy with his minutes',
    },
    { key: 'winning', v: m.winComponent, text: m.winComponent < 0 ? 'Frustrated by losing' : 'Enjoys the winning' },
    { key: 'role', v: m.roleComponent, text: m.roleComponent < 0 ? 'Wants the ball in his hands' : 'Playing his natural role' },
    { key: 'contract', v: m.contractComponent, text: m.contractComponent < 0 ? 'Feels underpaid' : 'Happy with his contract' },
  ];
  return out.filter((r) => Math.abs(r.v) >= 0.3).sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
}

export interface MoraleEffect {
  /** His mood's multiplier on his play, less one (−0.03: 3% below). */
  mood: number;
  /** Teammates who asked out, the same way. */
  room: number;
  /** Both together, as the engine multiplies them. */
  total: number;
}

/** What his mood and his locker room do to his play in a game (moodPerf × lockerRoomPerf, as buildSimInput applies them). */
export function moraleEffect(league: League, p: Player): MoraleEffect {
  const mood = moodPerf(p);
  const room = p.tid >= 0 ? lockerRoomPerf(teamPlayers(league, p.tid), p) : 1;
  return { mood: mood - 1, room: room - 1, total: mood * room - 1 };
}

const pctText = (x: number) => {
  const n = Math.abs(x) * 100;
  return n >= 1 ? `${Math.round(n)}%` : `${n.toFixed(1)}%`;
};

/** "Playing about 3% below his best", "Playing about 2% above his usual level", or at his usual level. */
export function effectLine(e: MoraleEffect): string {
  if (Math.abs(e.total) < 0.0025) return 'Playing at his usual level';
  return e.total < 0 ? `Playing about ${pctText(e.total)} below his best` : `Playing about ${pctText(e.total)} above his usual level`;
}

/** The locker room's share of it, in a few words ("0.6% of it from teammates who want out"), or null. */
export function roomLine(e: MoraleEffect): string | null {
  return e.room < -0.0005 ? `${pctText(e.room)} of it from teammates who want out` : null;
}

/** His effect as a signed figure: "−3%", "+1.2%", "0%". */
export function effectFigure(e: MoraleEffect): string {
  if (Math.abs(e.total) < 0.0025) return '0%';
  return `${e.total < 0 ? '−' : '+'}${pctText(e.total)}`;
}

/**
 * A minutes target that leaves him short of what he expects, by the weekly morale rule: playing time
 * counts against him once it pulls his mood down past −1.5 (a fringe player, under 65, minds it 40% as
 * much). Injured players and players with no expectation yet don't count.
 */
export function shortOfMinutes(p: Player, minutes: number): boolean {
  if (p.injury || !p.mood.expectedMin) return false;
  let pt = clamp((minutes - p.mood.expectedMin) / 3.5, -4, 2.5);
  if (p.ovr < 65) pt *= 0.4;
  return pt < -1.5;
}

/** His mood level's label and colour. */
export const moodMeta = (p: Player) => MOOD_META[moodLevel(p.mood.score)];
