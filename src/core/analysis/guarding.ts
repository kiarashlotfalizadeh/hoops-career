// How to guard one opponent's players and which of their defenders to attack: the staff's suggested
// scouting-report instruction for each of their top players (go under, top-lock, sag off, get
// physical) and the weakest perimeter defender in their rotation, each with the numbers behind it
// (their games where there are enough, their ratings otherwise).

import type { League, Player, PlayerDefense, PlayerStats } from '../types';
import { attrDisplay, composites } from '../ratings';
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

export interface GuardAdvice {
  pid: number;
  /** The instruction the staff suggests, if one clearly fits. */
  suggest?: PlayerDefense;
  /** Why, in a few words with the numbers ("29% from three on 2.1 a game, runs their ball screens"). */
  why?: string;
  line: GuardLine;
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;
const per = (v: number) => v.toFixed(1);
/** Threes a game under which his percentage says nothing ("100.0% from three on 0.1 a game"). */
const FEW_THREES = 0.5;

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
 * The staff's read on guarding one player: going under screens on a ball handler who can't shoot
 * off the dribble, top-locking a volume shooter who can't put it on the floor, getting physical with
 * a post scorer or driver who misses his free throws, sagging off a rotation player who doesn't
 * shoot threes. None when nothing clearly fits.
 */
export function guardAdvice(league: League, p: Player): GuardAdvice {
  const line = guardLine(league, p);
  const c = composites(p.ratings);
  const games = line.source !== 'ratings';
  // his threes as his games show them: a percentage only on enough of them to mean something, else how many he took
  const few = games && line.tpa < FEW_THREES;
  const taken = Math.round(line.tpa * line.gp);
  const shoots = !games
    ? `three-point shooting ${attrDisplay(c.c3)}`
    : !few
      ? `${pct1(line.tpPct)} from three on ${per(line.tpa)} a game`
      : `${taken ? `${taken} three${taken === 1 ? '' : 's'}` : 'no threes'} in his ${line.gp} games`;
  // a ball handler who runs their screens and is no threat to pull up (about the bottom third of
  // pull-up shooters on the ratings' 40-99 scale)
  if (c.pnrHandle >= 60 && c.pu3 < 45 && (!games || line.tpa < 3 || line.tpPct < 0.33))
    return {
      pid: p.pid,
      suggest: 'under',
      why: `Runs ball screens (handle ${attrDisplay(c.pnrHandle)}) but is no threat to pull up (pull-up ${attrDisplay(c.pu3)}; ${shoots}).`,
      line,
    };
  // a volume shooter who rarely beats his man off the dribble (the bottom quarter in creation)
  if (c.c3 >= 66 && c.create < 47 && (!games || (line.tpa >= 4 && line.tpPct >= 0.36)))
    return { pid: p.pid, suggest: 'tight', why: `A shooter (${shoots}) who rarely beats his man off the dribble (creation ${attrDisplay(c.create)}).`, line };
  // a post scorer or driver who misses free throws (before sagging off him: his scoring is the threat)
  const ftShown =
    games && Number.isFinite(line.ftPct) && line.fta >= 1.5 ? `${pct1(line.ftPct)} from the line on ${per(line.fta)} a game` : `free throws ${attrDisplay(p.ratings.ft)}`;
  const ftPoor = games && Number.isFinite(line.ftPct) && line.fta >= 1.5 ? line.ftPct < 0.68 : p.ratings.ft < 55;
  if ((c.postScore >= 62 || c.rim >= 66) && ftPoor)
    return {
      pid: p.pid,
      suggest: 'body',
      why: `Scores inside (${c.postScore >= 62 ? `post ${attrDisplay(c.postScore)}` : `finishing ${attrDisplay(c.rim)}`}) but misses free throws (${ftShown}).`,
      line,
    };
  // a rotation player who doesn't shoot threes (by his games; by his ratings, about the bottom sixth)
  if (games ? c.c3 < 45 && (line.tpa < 1 || line.tpPct < 0.28) : c.c3 < 38)
    return {
      pid: p.pid,
      suggest: 'sag',
      why: !games
        ? `Can't shoot from three (three-point shooting ${attrDisplay(c.c3)}).`
        : few && taken
          ? `Rarely shoots threes (${shoots}).`
          : `Doesn't shoot threes (${shoots}).`,
      line,
    };
  return { pid: p.pid, line };
}

/** Their projected top eight, each with the staff's read on guarding him (`out`: players who sit tonight). */
export function guardingPlan(league: League, tid: number, out?: Set<number>): GuardAdvice[] {
  return projectedRotation(league, tid, 8, out).map((p) => guardAdvice(league, p));
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
