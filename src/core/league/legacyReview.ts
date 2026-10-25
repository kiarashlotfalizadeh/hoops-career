// The season's review, read like a ceremony when the Finals end (see legacySeasonEnd): the record and
// how the season ended, against what the owner asked (his verdict is owner.ts's review, read from
// League.ownerReviews) and what the press predicted on opening night, the season's best win, its best
// player and its breakout, the records set, the honors, and what next season should bring. Built once
// a season from the league as it stands that night and kept small (a few hundred bytes), so it reads
// the same years later when the games behind it are gone.
import type { League, Player, PlayerStats } from '../types';
import { seasonLabel } from '../constants';
import { playerName } from './helpers';
import { coachCareer, userCoach } from './coaches';
import { confStandings } from './standings';
import { SEASON_GAMES, currentGoals, leagueOutlook } from './ownerGoals';
import { teamSeasonRecords } from './records';
import { REC_LABEL, REC_STATS, TEAM_REC_STATS, recordWhat } from './records';
import { playerAge } from '../playerGen';
import { bestWinOf, legacyOf, type PulsePoint, type SignatureWin } from './legacy';
import { fanScore } from './legacyPulse';
import { jobSecurity } from './jobSecurity';
import { ordinal, plural } from '../format';

export interface SeasonReview {
  season: number;
  tid: number;
  won: number;
  lost: number;
  conf: 'E' | 'W';
  /** Where the team finished in its conference. */
  confRank?: number;
  /** The playoff seed, if it had one. */
  seed?: number;
  /** How the season ended (TeamSeason.playoffRound: −1 missed, 1-4 the round lost in, 5 champion). */
  round: number;
  /** What the press predicted on opening night, if it did. */
  press?: { wins: number; confRank: number; champ: boolean };
  /** The owner's wins goal (a full season's), if he set one on opening night. */
  ownerWins?: number;
  /** The season's best win. */
  best?: SignatureWin;
  /** The team's best player this season, and his line. */
  star?: { pid: number; name: string; line: string };
  /** A young player who broke out: his OVR a year ago and now, and his line. */
  breakout?: { pid: number; name: string; from: number; to: number; line: string };
  /** Records set ("Franchise record: 61 wins"), at most four. */
  records: string[];
  /** The season's honors for the coach and his players ("Coach of the Year", "Jalen Brunson: All-NBA 2nd Team"). */
  honors: string[];
  /** The owner's and the fans' pulse through the season, and where both ended. */
  pulse?: PulsePoint[];
  owner?: number;
  fans?: number;
  /** What the roster as it stands should win next season (the owner's read), unless he was fired. */
  next?: { wins: number };
  fired?: true;
  /** The difficulty the season was played on (changes wait for opening night, so one a season), and job security when it was off; absent in reviews from before it was kept. */
  difficulty?: League['settings']['difficulty'];
  jobSecurity?: false;
}

/** A player's line for a season with one team, regular season. */
function lineOf(p: Player, season: number, tid: number): PlayerStats | undefined {
  return p.stats.find((s) => s.season === season && s.tid === tid && !s.playoffs && !s.real);
}

const per = (v: number, gp: number) => (gp ? v / gp : 0).toFixed(1);
const statText = (s: PlayerStats) => `${per(s.pts, s.gp)} PTS, ${per(s.orb + s.drb, s.gp)} REB, ${per(s.ast, s.gp)} AST`;

/** A season's value for picking its best player: production a game, counted fully from 50 games. */
function seasonValue(s: PlayerStats): number {
  if (!s.gp) return 0;
  const g = s.gp;
  return ((s.pts + 0.5 * (s.orb + s.drb) + 0.7 * s.ast + s.stl + s.blk - 0.7 * s.tov) / g) * Math.min(1, g / 50);
}

/** The awards a player won this season (the regular season's and the Finals MVP), in the order they're named. */
function awardsOf(p: Player, season: number): string[] {
  const keep = ['MVP', 'Finals MVP', 'Defensive Player of the Year', 'Rookie of the Year', 'Sixth Man of the Year', 'Most Improved Player'];
  return p.awards.filter((a) => a.season === season && (keep.includes(a.type) || a.type.startsWith('All-NBA'))).map((a) => a.type);
}

/** The review of the season just ended for the user's team (null when he coached none of it). */
export function buildSeasonReview(league: League): SeasonReview | null {
  const season = league.season;
  const tid = league.userTid;
  const t = league.teams[tid];
  const ts = t?.seasons.find((s) => s.season === season);
  const me = userCoach(league);
  if (!ts || !me) return null;
  const line = coachCareer(league, me, new Map()).lines.find((l) => l.season === season && l.tid === tid);
  if (!line) return null;
  const row = confStandings(league, t.conf).find((r) => r.tid === tid);
  const pre = league.media?.preseason;
  const picked = pre && pre.season === season ? pre.rows.find((r) => r.tid === tid) : undefined;
  const og = currentGoals(league) ?? (league.ownerGoals?.season === season && league.ownerGoals.tid === tid ? league.ownerGoals : undefined);
  const ownerWins = og && !og.from ? og.goals.find((g) => g.kind === 'wins')?.target : undefined;
  const players = Object.values(league.players).filter((p) => lineOf(p, season, tid)?.gp);
  // the best player: production, and the hardware that says so
  const star = players
    .map((p) => ({ p, s: lineOf(p, season, tid)!, a: awardsOf(p, season) }))
    .sort((a, b) => seasonValue(b.s) + b.a.length * 2 - (seasonValue(a.s) + a.a.length * 2))[0];
  // a breakout: 25 or under, the biggest jump in OVR since a year ago with his scoring up (or the Most Improved Player)
  const breakout = players
    .filter((p) => playerAge(p, season) <= 25 && p.pid !== star?.p.pid)
    .map((p) => {
      const hist = p.ratingsHistory;
      const before = hist.find((h) => h.season === season - 1) ?? hist.find((h) => h.season === season);
      const s = lineOf(p, season, tid)!;
      const prev = p.stats.filter((x) => x.season === season - 1 && !x.playoffs).reduce((a, x) => ({ pts: a.pts + x.pts, gp: a.gp + x.gp }), { pts: 0, gp: 0 });
      const jump = (s.gp ? s.pts / s.gp : 0) - (prev.gp ? prev.pts / prev.gp : 0);
      const mip = p.awards.some((a) => a.season === season && a.type === 'Most Improved Player');
      return { p, s, from: before?.ovr ?? p.ovr, jump, mip, prevPpg: prev.gp ? prev.pts / prev.gp : null };
    })
    .filter((x) => x.mip || (x.p.ovr - x.from >= 3 && x.jump >= 2 && x.s.gp >= 30))
    .sort((a, b) => Number(b.mip) - Number(a.mip) || b.p.ovr - b.from + b.jump / 3 - (a.p.ovr - a.from + a.jump / 3))[0];
  const records = recordsSet(league, season, tid);
  const honors: string[] = [];
  const aw = league.awards.find((a) => a.season === season);
  if (ts.playoffRound === 5) honors.push('NBA champions');
  else if (ts.playoffRound === 4) honors.push(`${t.conf === 'E' ? 'East' : 'West'} champions`);
  if (aw?.cupWinner === tid) honors.push('NBA Cup winners');
  if (aw?.coy === tid && (aw.coyCoach === undefined || aw.coyCoach === league.coachName || !!me.aka?.includes(aw.coyCoach))) honors.push('Coach of the Year');
  const cotm = legacyOf(league).honors.filter((h) => h.season === season && h.tid === tid).length;
  if (cotm) honors.push(cotm > 1 ? `Coach of the Month ×${cotm}` : 'Coach of the Month');
  for (const p of players) for (const a of awardsOf(p, season)) honors.push(`${playerName(p)}: ${a}`);
  // next season, from the roster as it stands: what the owner would expect of it
  let next: SeasonReview['next'];
  if (!league.fired) {
    // (his read: the edge on the court in it, as the goals he sets will have it)
    next = { wins: Math.round(leagueOutlook(league)[tid].pct * SEASON_GAMES) };
  }
  const s = legacyOf(league);
  const pulse = s.pulse && s.pulse.season === season && s.pulse.tid === tid ? s.pulse.pts : undefined;
  return {
    season,
    tid,
    won: line.won,
    lost: line.lost,
    conf: t.conf,
    ...(row ? { confRank: row.confRank } : {}),
    ...(ts.seed ? { seed: ts.seed } : {}),
    round: ts.playoffRound,
    ...(picked ? { press: { wins: picked.wins, confRank: picked.confRank, champ: pre?.champ === tid } } : {}),
    ...(ownerWins !== undefined ? { ownerWins } : {}),
    ...(bestWinOf(league, season, tid) ? { best: bestWinOf(league, season, tid) } : {}),
    ...(star ? { star: { pid: star.p.pid, name: playerName(star.p), line: `${statText(star.s)}${star.a.length ? ` · ${star.a.join(', ')}` : ''}` } } : {}),
    ...(breakout
      ? {
          breakout: {
            pid: breakout.p.pid,
            name: playerName(breakout.p),
            from: breakout.from,
            to: breakout.p.ovr,
            line: `${breakout.prevPpg !== null ? `${breakout.prevPpg.toFixed(1)} → ` : ''}${per(breakout.s.pts, breakout.s.gp)} PTS a game${breakout.mip ? ' · Most Improved Player' : ''}`,
          },
        }
      : {}),
    records,
    honors,
    ...(pulse ? { pulse: [...pulse] } : {}),
    ...(league.fired ? {} : { owner: jobSecurity(league).score }),
    fans: fanScore(league, tid),
    ...(next ? { next } : {}),
    ...(league.fired ? { fired: true as const } : {}),
    difficulty: league.settings.difficulty,
    ...(league.settings.jobSecurity ? {} : { jobSecurity: false as const }),
  };
}

/**
 * Records the team set this season: league single-game records, the franchise's (once the book has a
 * season behind it), and the franchise's best record or net rating in this league (from its third
 * season on, so a first season isn't a record by default). At most four.
 */
function recordsSet(league: League, season: number, tid: number): string[] {
  const out: string[] = [];
  const book = league.records;
  const name = (pid: number, frozen?: string) => (league.players[pid] ? playerName(league.players[pid]) : (frozen ?? 'Unknown'));
  if (book) {
    for (const stat of REC_STATS) {
      const top = book.league.reg.players[stat]?.[0];
      if (top && top[4] === season && top[2] === tid) out.push(`League record: ${top[0]} ${REC_LABEL[stat][1] ?? REC_LABEL[stat][0].toLowerCase()} by ${name(top[1], top[7])}`);
    }
    for (const stat of TEAM_REC_STATS) {
      const top = book.league.reg.teams[stat]?.[0];
      if (top && top[3] === season && top[1] === tid) out.push(`League record: ${recordWhat({ stat, team: true, v: top[0] })} in a game`);
    }
    const mine = book.teams[tid];
    if (mine && book.since < season) {
      for (const stat of REC_STATS) {
        const top = mine.reg.players[stat]?.[0];
        if (top && top[4] === season && !out.some((x) => x.includes(name(top[1], top[7])) && x.startsWith('League')))
          out.push(`Franchise record: ${top[0]} ${REC_LABEL[stat][1] ?? REC_LABEL[stat][0].toLowerCase()} by ${name(top[1], top[7])}`);
      }
    }
  }
  const seasons = league.teams[tid].seasons.filter((s) => s.season <= season && s.won + s.lost > 0).length;
  if (seasons >= 3) {
    const best = teamSeasonRecords(league, 'wins', { tid, n: 1 })[0];
    if (best?.season === season) out.push(`The franchise's best record since ${seasonLabel(league.startSeason)}: ${best.won}-${best.lost}`);
    const net = teamSeasonRecords(league, 'net', { tid, n: 1 })[0];
    if (net?.season === season) out.push(`The franchise's best net rating since ${seasonLabel(league.startSeason)}`);
  }
  return out.slice(0, 4);
}

/** A season grade (−1..1) in a word, for the verdict's headline. */
export function gradeWord(g: number): string {
  return g >= 0.4 ? 'Excellent' : g >= 0.1 ? 'Good' : g > -0.1 ? 'As expected' : g > -0.4 ? 'Short of it' : 'Poor';
}

/** How a season ended, in words: "Won the title", "Lost in the second round", "Missed the playoffs". */
export function endText(r: Pick<SeasonReview, 'round'>): string {
  return r.round === 5
    ? 'Won the title'
    : r.round === 4
      ? 'Lost in the Finals'
      : r.round === 3
        ? 'Lost in the conference finals'
        : r.round === 2
          ? 'Lost in the second round'
          : r.round === 1
            ? 'Lost in the first round'
            : 'Missed the playoffs';
}

/** The season against the press's prediction, in a line ("+7 wins on the prediction, 3rd in the West where they picked 8th"). */
export function vsPress(r: SeasonReview): string | null {
  if (!r.press) return null;
  const d = r.won - r.press.wins;
  const conf = r.conf === 'E' ? 'East' : 'West';
  const wins = d === 0 ? 'Right on the prediction' : `${d > 0 ? '+' : '−'}${plural(Math.abs(d), 'win')} on the prediction`;
  return r.confRank ? `${wins} · ${ordinal(r.confRank)} in the ${conf}, picked ${ordinal(r.press.confRank)}` : wins;
}
