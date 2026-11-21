// The owner's cameo: once a season at most (and not every season), the user's owner does the one
// thing his quirk would. A meddler sends a lineup on a napkin, a showman asks for a show, a gambler
// dares you to swing at the deadline, a hothead cools off after a blowout, a sentimental owner asks
// to watch his favourite kid, a traditionalist wants one night of real defense, an accountant sends a
// number and an absentee a postcard. One note in the inbox, never marked important, nothing to
// answer and nothing lost by ignoring it. Six of them are a side-bet: do the thing in time and he
// says so, and it counts a little at the season's review (CAMEO_BONUS). The other two are only him.
//
// Part of the world around the games (world.ts): it reads the league and writes mail and its own
// small state, and draws nothing from the league's stream. When and whether it comes is a hash of the
// league, the season and the team.
import type { League, Player } from '../types';
import { hashString, mix32 } from '../random';
import { addInbox, curTeamSeason, fmtDate, playerName, shortName, standardRoster, teamPlayers } from './helpers';
import { playerAge, salaryFor } from '../playerGen';
import { money } from '../format';
import { ownerQuirk, type OwnerQuirk } from './voices';
import { currentGoals } from './ownerGoals';

/** The owner's cameo for a season, kept on the league (League.ownerCameo). */
export interface OwnerCameo {
  season: number;
  tid: number;
  quirk: OwnerQuirk;
  /** The day he sent it. */
  day: number;
  /** A side-bet's last day (none: he only wanted to say it). */
  until?: number;
  /** The player it names (the napkin's starter, the kid). */
  pid?: number;
  /** The points it asks for (the show) or allows (the defense). */
  target?: number;
  /** His ask in a line, for the Owner page while it is open. */
  ask: string;
  /** How a side-bet ended: met (it counts at the review), or its time ran out (nothing happens). */
  done?: 'met' | 'over';
}

/** What a side-bet met is worth to his standing at the review. */
export const CAMEO_BONUS = 0.02;
/** The share of seasons he has one in him. */
const ODDS = 0.67;
/** The days of the season a cameo may come on (the gambler's comes before the deadline instead), and how long a side-bet stays open. */
const FROM = 28;
const SPREAD = 40;
const OPEN_DAYS = 14;
const DARE_DAYS = 9;
/** A loss by this much is what a hothead cools off from. */
const BLOWOUT = 20;
/**
 * The show and the defense, against the league's scoring: this far over and under a usual night, to
 * the nearest five (a home 130 and a 95 allowed at a usual 115: each about one game in ten, so a
 * side-bet two weeks long is met a little under half the time).
 */
const SHOW_OVER = 14;
const HOLD_UNDER = 20;

const unit = (key: string) => mix32(hashString(key)) / 4294967296;

/** Where an absentee owner writes from. */
const PLACES = ['a boat off Sardinia', 'a ski lodge with one bar of signal', 'a vineyard I appear to own', 'an island with no television', 'somewhere over the Pacific'];

/** What he says at the review when his side-bet was met. */
const KEPT: Partial<Record<OwnerQuirk, string>> = {
  meddler: 'You tried my napkin lineup. I noticed.',
  showman: 'You gave the building a night to remember when I asked for one.',
  gambler: 'You took my dare at the deadline. I like a coach who swings.',
  hothead: 'You answered that blowout the very next night. I remember that.',
  sentimental: 'You gave the kid his night when I asked. That meant something to me.',
  traditionalist: 'You gave me one night of real defense when I asked. That is my kind of basketball.',
};

/** This season's cameo with the user's current team, or undefined. */
export function cameoOf(league: League): OwnerCameo | undefined {
  const c = league.ownerCameo;
  return c && c.season === league.season && c.tid === league.userTid ? c : undefined;
}

/** What a met side-bet adds to his standing at the season's review, and his line about it. */
export function cameoAtReview(league: League): { bonus: number; line?: string } {
  const c = cameoOf(league);
  return c?.done === 'met' ? { bonus: CAMEO_BONUS, line: KEPT[c.quirk] } : { bonus: 0 };
}

/** The user's results since the cameo was sent, oldest first (regular season). */
function gamesSince(league: League, c: OwnerCameo) {
  const u = league.userTid;
  const out = [];
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season || g.day < c.day) break;
    if (g.type !== 'regular' || (g.home.tid !== u && g.away.tid !== u)) continue;
    const [us, them] = g.home.tid === u ? [g.home, g.away] : [g.away, g.home];
    out.push({ g, us, them, home: g.home.tid === u });
  }
  return out.reverse();
}

/** The league's points a team a game so far (a usual night), or null before there are games. */
function usualPoints(league: League): number | null {
  let pts = 0;
  let gp = 0;
  for (const t of league.teams) {
    const ts = curTeamSeason(league, t.tid);
    pts += ts.ptsFor;
    gp += ts.won + ts.lost;
  }
  return gp >= league.teams.length * 5 ? pts / gp : null;
}

const five = (x: number) => Math.round(x / 5) * 5;

/** The user's five usual starters (the most starts, then minutes), and the rest of his healthy standard roster, best first. */
function benchOf(league: League): Player[] {
  const u = league.userTid;
  const line = (p: Player) => p.stats.find((s) => s.season === league.season && s.tid === u && !s.playoffs);
  const ps = standardRoster(league, u);
  const starters = new Set(
    [...ps]
      .sort((a, b) => (line(b)?.gs ?? 0) - (line(a)?.gs ?? 0) || (line(b)?.min ?? 0) - (line(a)?.min ?? 0) || b.ovr - a.ovr || a.pid - b.pid)
      .slice(0, 5)
      .map((p) => p.pid),
  );
  return ps.filter((p) => !starters.has(p.pid) && !p.injury).sort((a, b) => b.ovr - a.ovr || a.pid - b.pid);
}

/** Build the season's cameo for the owner's quirk as things stand today, or null when it has nothing to hang on. */
function compose(league: League, quirk: OwnerQuirk): { cameo: OwnerCameo; subject: string; body: string } | null {
  const u = league.userTid;
  const base = { season: league.season, tid: u, quirk, day: league.day };
  const until = league.day + OPEN_DAYS;
  const by = fmtDate(league.season, until);
  const ts = curTeamSeason(league, u);
  switch (quirk) {
    case 'meddler': {
      const p = benchOf(league)[0];
      if (!p) return null;
      return {
        cameo: { ...base, until, pid: p.pid, ask: `Start ${shortName(league, p)} one night by ${by}.` },
        subject: 'A napkin from the owner',
        body: `I drew up a lineup on a napkin at dinner. It has ${playerName(p)} starting.\nTry it one night by ${by}. Or do not. It is only a napkin.`,
      };
    }
    case 'showman': {
      const usual = usualPoints(league);
      if (usual === null) return null;
      const target = five(usual + SHOW_OVER);
      return {
        cameo: { ...base, until, target, ask: `Score ${target} in a home game by ${by}.` },
        subject: 'Give them a show',
        body: `A weeknight crowd needs a reason to come back.\nPut up ${target} at home by ${by} and the building drinks on me. No harm done if you do not.`,
      };
    }
    case 'gambler': {
      const left = league.tradeDeadlineDay - league.day;
      return {
        cameo: { ...base, until: league.tradeDeadlineDay, ask: 'Trade for a player before the deadline.' },
        subject: 'A dare',
        body: `The deadline is ${left} days out and I am restless.\nI dare you: trade for a player who helps us now. If it goes wrong, I will say I told you to.`,
      };
    }
    case 'hothead': {
      const next = league.schedule.find((g) => !g.played && g.day >= league.day && g.type === 'regular' && (g.home === u || g.away === u));
      if (!next) return null;
      const opp = league.teams[next.home === u ? next.away : next.home];
      return {
        cameo: { ...base, until: next.day, ask: `Beat the ${opp.name} in the next game.` },
        subject: 'About last night',
        body: `I said some things in my box last night. Loudly.\nBeat the ${opp.name} and we never speak of it again.`,
      };
    }
    case 'sentimental': {
      const line = (p: Player) => p.stats.find((s) => s.season === league.season && s.tid === u && !s.playoffs);
      const kid = standardRoster(league, u)
        .filter((p) => !p.injury && playerAge(p, league.season) <= 22 && (line(p)?.min ?? 0) / Math.max(1, line(p)?.gp ?? 0) < 20)
        .sort((a, b) => playerAge(a, league.season) - playerAge(b, league.season) || b.pot - a.pot || a.pid - b.pid)[0];
      if (!kid) return null;
      return {
        cameo: { ...base, until, pid: kid.pid, ask: `Play ${shortName(league, kid)} 20 minutes one night by ${by}.` },
        subject: 'A favor',
        body: `I have a soft spot for ${playerName(kid)}. You know I do.\nGive him twenty minutes one night by ${by}. I only want to watch him play.`,
      };
    }
    case 'traditionalist': {
      const usual = usualPoints(league);
      if (usual === null) return null;
      const target = five(usual - HOLD_UNDER);
      return {
        cameo: { ...base, until, target, ask: `Hold a team under ${target} by ${by}.` },
        subject: 'One thing I would like to see',
        body: `Nobody guards anybody in this league anymore.\nHold a team under ${target} by ${by}. I will sleep well that night.`,
      };
    }
    case 'accountant': {
      if (ts.won < 5) return null;
      const payroll = teamPlayers(league, u).reduce((a, p) => a + salaryFor(p, league.season), 0);
      return {
        cameo: { ...base, ask: '', done: 'over' },
        subject: 'A number for you',
        body: `I divided the payroll by the wins. Each win has cost me ${money(payroll / ts.won)} so far.\nNo action required. I thought you should have the number.`,
      };
    }
    case 'ghost': {
      const place = PLACES[mix32(hashString(`${league.id}:${league.season}:${u}:postcard`)) % PLACES.length];
      return {
        cameo: { ...base, ask: '', done: 'over' },
        subject: 'A postcard',
        body: `Greetings from ${place}. Someone tells me we are ${ts.won}-${ts.lost}. Is that good?\nCarry on.`,
      };
    }
  }
}

/** Whether an open side-bet has been met, and his note when it has. */
function met(league: League, c: OwnerCameo): { subject: string; body: string } | null {
  const u = league.userTid;
  const games = gamesSince(league, c);
  switch (c.quirk) {
    case 'meddler': {
      const p = league.players[c.pid!];
      return p && games.some((x) => x.us.players.some((b) => b.pid === p.pid && b.gs))
        ? { subject: 'About the napkin', body: `You started ${shortName(league, p)}. I have had the napkin framed.` }
        : null;
    }
    case 'showman': {
      const night = games.find((x) => x.home && x.us.pts >= c.target!);
      return night ? { subject: 'What a night', body: `${night.us.pts} at home. They were still singing in the car park. The drinks were on me.` } : null;
    }
    case 'gambler': {
      const dealt = (league.transactions ?? []).some(
        (t) => t.kind === 'trade' && t.season === league.season && t.day >= c.day && t.tids.includes(u) && !!t.sides?.some((sd) => sd.tid !== u && sd.players.length > 0),
      );
      return dealt ? { subject: 'You took the dare', body: 'You made the trade. I do not care yet how it lands. That is how I like this team run.' } : null;
    }
    case 'hothead': {
      const next = games[0];
      return next && next.us.pts > next.them.pts ? { subject: 'Forgotten', body: 'Good. Last night never happened.' } : null;
    }
    case 'sentimental': {
      const p = league.players[c.pid!];
      return p && games.some((x) => x.us.players.some((b) => b.pid === p.pid && b.min >= 20))
        ? { subject: 'Thank you', body: `I watched every one of ${shortName(league, p)}'s minutes. Thank you for that.` }
        : null;
    }
    case 'traditionalist': {
      const night = games.find((x) => x.them.pts < c.target!);
      return night ? { subject: 'Now that was defense', body: `${night.them.pts} allowed. I slept like a child. Frame the box score.` } : null;
    }
    default:
      return null;
  }
}

/**
 * The cameo's day (world.ts calls it every day of the regular season): an open side-bet is checked
 * (met: his note, and it counts at the review; out of time: nothing at all), and on its day the
 * season's cameo is sent, if this is a season he has one in him. A hothead's waits for a blowout.
 */
export function ownerCameoDay(league: League) {
  if (league.phase !== 'regular' || league.fired) return;
  const u = league.userTid;
  const c = cameoOf(league);
  if (c) {
    if (c.done) return;
    const note = met(league, c);
    if (note) {
      c.done = 'met';
      addInbox(league, { from: 'Owner', subject: note.subject, body: note.body, tone: 'good', link: '/office/owner' });
    } else if (league.day > (c.until ?? 0) || (c.quirk === 'hothead' && gamesSince(league, c).length > 0)) c.done = 'over';
    return;
  }
  // (one a season with a team, whatever became of it: a job changed mid-season starts none)
  if (league.ownerCameo?.season === league.season || !currentGoals(league)) return;
  const quirk = ownerQuirk(league, u);
  const key = `${league.id}:${league.season}:${u}:cameo`;
  if (unit(key) >= ODDS) return;
  const day = FROM + Math.floor(unit(`${key}:day`) * SPREAD);
  const due =
    quirk === 'gambler'
      ? league.day === league.tradeDeadlineDay - DARE_DAYS
      : quirk === 'hothead'
        ? league.day >= FROM && league.day < league.tradeDeadlineDay && lostBig(league)
        : league.day === Math.min(day, league.tradeDeadlineDay - 1);
  if (!due) return;
  const made = compose(league, quirk);
  if (!made) return;
  league.ownerCameo = made.cameo;
  addInbox(league, { from: 'Owner', subject: made.subject, body: made.body, tone: 'neutral', link: '/office/owner' });
}

/** Did the user lose yesterday's game by a blowout? */
function lostBig(league: League): boolean {
  const u = league.userTid;
  for (let i = league.games.length - 1; i >= 0; i--) {
    const g = league.games[i];
    if (g.season !== league.season || g.day < league.day - 1) return false;
    if (g.type !== 'regular' || (g.home.tid !== u && g.away.tid !== u)) continue;
    const [us, them] = g.home.tid === u ? [g.home, g.away] : [g.away, g.home];
    return them.pts - us.pts >= BLOWOUT;
  }
  return false;
}
