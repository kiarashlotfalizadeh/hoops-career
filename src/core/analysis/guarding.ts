// Their players as the matchup planner reads them (each one's shooting numbers, from his games where
// there are enough, his ratings otherwise) and which of their defenders to attack: the weakest
// perimeter defender in their rotation, with the numbers behind it.

import type { League, Player, PlayerStats, RatingKey } from '../types';
import { attrDisplay, composites, RATING_META } from '../ratings';
import { seasonTotals } from '../league/helpers';
import { projectedRotation, SCOUT_MIN_GAMES } from './scouting';

/** A player's shooting and scoring numbers as the suggestions read them, from his games when there are enough. */
export interface GuardLine {
  pid: number;
  /** This season's numbers with this team, last season's (labelled), or none: ratings only. */
  source: 'season' | 'last' | 'ratings';
  gp: number;
  min: number;
  /** Per game. */
  tpa: number;
  tpPct: number;
  fta: number;
  ftPct: number;
  /** Share of his shots at the rim. */
  rimShare: number;
}

/** His numbers this season with his team (five games or more), else last season's, else none. */
export function guardLine(league: League, p: Player): GuardLine {
  const here = p.stats.find((s) => s.season === league.season && s.tid === p.tid && !s.playoffs && s.gp >= SCOUT_MIN_GAMES);
  const last = here ? null : seasonTotals(p, league.season - 1);
  const s: PlayerStats | null = here ?? (last && last.gp >= SCOUT_MIN_GAMES ? last : null);
  if (!s) return { pid: p.pid, source: 'ratings', gp: 0, min: 0, tpa: 0, tpPct: NaN, fta: 0, ftPct: NaN, rimShare: NaN };
  const gp = Math.max(1, s.gp);
  return {
    pid: p.pid,
    source: here ? 'season' : 'last',
    gp: s.gp,
    min: s.min / gp,
    tpa: s.tpa / gp,
    tpPct: s.tpa ? s.tpm / s.tpa : NaN,
    fta: s.fta / gp,
    ftPct: s.fta ? s.ftm / s.fta : NaN,
    // (shot zones are only kept for simulated seasons)
    rimShare: s.fga && s.rimA ? s.rimA / s.fga : NaN,
  };
}

/**
 * A rating as prose says it: its name from RATING_META in lower case, then its value on the 40-99
 * scale, as his Ratings tab shows it ("perimeter defense 64", "offensive IQ 71").
 */
export function ratingText(p: Player, key: RatingKey): string {
  const label = RATING_META.find((m) => m.key === key)?.label ?? key;
  return `${label.replace(/^[A-Z](?=[a-z])/, (ch) => ch.toLowerCase())} ${attrDisplay(p.ratings[key])}`;
}

/** Their projected top eight, each with his numbers (`out`: players who sit tonight). */
export function guardingPlan(league: League, tid: number, out?: Set<number>): GuardLine[] {
  return projectedRotation(league, tid, 8, out).map((p) => guardLine(league, p));
}

export interface HuntPick {
  pid: number;
  /** His perimeter defense and his rotation's (the top eight), on the ratings' 40-99 scale. */
  perDef: number;
  teamPerDef: number;
  /** The gap is big enough to be worth the ball movement hunting costs. */
  worth: boolean;
}

/** The weakest perimeter defender in their projected rotation (of its top `n`, without `out`: players who sit tonight), against the rest of it. */
export function huntPick(league: League, tid: number, n = 8, out?: Set<number>): HuntPick | null {
  const rot = projectedRotation(league, tid, n, out);
  if (rot.length < 5) return null;
  const pd = rot.map((p) => ({ p, v: composites(p.ratings).perDef }));
  // the starters and first players off the bench play the minutes worth hunting
  const weak = pd.slice(0, 7).sort((a, b) => a.v - b.v || a.p.pid - b.p.pid)[0];
  const avg = pd.reduce((a, x) => a + x.v, 0) / pd.length;
  return { pid: weak.p.pid, perDef: attrDisplay(weak.v), teamPerDef: attrDisplay(avg), worth: avg - weak.v >= 8 };
}
