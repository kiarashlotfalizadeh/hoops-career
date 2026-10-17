// Player morale & role expectations. Players expect minutes in line with their standing;
// winning, contract fairness and role fit also matter. Mood feeds re-signing willingness,
// FA appeal and a small on-court performance multiplier. The GM can meet one of his players who
// asked for a trade (or is unhappy) and make him a promise, which is kept or broken over the
// games that follow (meetPlayer, resolvePromises).

import type { League, MoodLevel, Player, PlayerPromise } from '../types';
import { Rng, clamp, hashString } from '../random';
import { archetype } from '../ratings';
import { addInbox, addNews, contractSeason, curTeamSeason, fmtDate, playerName, seasonTotals, teamPlayers, winPct } from './helpers';
import { marketSalary } from './contracts';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import { sustainableMinutes } from '../ai/coachAI';

export function moodLevel(score: number): MoodLevel {
  if (score >= 5) return 'ecstatic';
  if (score >= 2) return 'happy';
  if (score >= -2) return 'content';
  if (score >= -5) return 'unhappy';
  return 'furious';
}

export const MOOD_META: Record<MoodLevel, { label: string; emoji: string; color: string }> = {
  ecstatic: { label: 'Ecstatic', emoji: '★', color: 'var(--good)' },
  happy: { label: 'Happy', emoji: '▲', color: 'var(--good)' },
  content: { label: 'Content', emoji: '●', color: 'var(--text-dim)' },
  unhappy: { label: 'Unhappy', emoji: '▼', color: 'var(--warn)' },
  furious: { label: 'Furious', emoji: '✖', color: 'var(--bad)' },
};

/** Expected minutes per game given rank on the team, capped by what his stamina can carry. */
export function expectedMinutes(rank: number, ovr: number, sustainable = 40): number {
  const byRank = [34, 33, 31, 30, 28, 24, 21, 18, 15, 11, 8, 5, 3, 2, 1];
  const base = byRank[Math.min(rank, byRank.length - 1)];
  // players far better than the league median expect more regardless of team
  return Math.min(clamp(base + (ovr - 76) * 0.4, 2, 37), sustainable);
}

/** The notes a happy player gets; everything else in mood.notes is a complaint. */
const PRAISE = ['Happy with his role', 'Loves winning here'];

/** What a player is unhappy about, from his mood notes (no praise). */
export const complaints = (p: Player) => p.mood.notes.filter((n) => !PRAISE.includes(n));

export function updateMorale(league: League, tid: number, notify = false) {
  const roster = teamPlayers(league, tid).sort((a, b) => b.ovr - a.ovr);
  const ts = curTeamSeason(league, tid);
  const games = ts.won + ts.lost;
  const wp = games ? winPct(ts) : 0.5;
  roster.forEach((p, rank) => {
    const prev = p.mood.score;
    const exp = expectedMinutes(rank, p.ovr, sustainableMinutes(p));
    const st = seasonTotals(p, league.season);
    const mpg = st && st.gp ? st.min / st.gp : 0;
    const healthy = !p.injury;
    const assigned = league.teams[tid].rotation.minutes[p.pid] ?? 0;
    const actual = games >= 5 && st && st.gp >= 3 ? mpg : assigned;
    let pt = healthy || games < 5 ? clamp((actual - exp) / 3.5, -4, 2.5) : 0;
    if (p.ovr < 65) pt *= 0.4; // fringe players are just happy to be here
    const win = games >= 5 ? clamp((wp - 0.5) * 8, -3, 3) : 0;
    const role = league.teams[tid].tactics.offense.roles[p.pid];
    const natural = archetype(p.ratings).role;
    let roleC = 0;
    // what he'd complain about, then what he likes
    const gripes: string[] = [];
    if (wantsTheBall(league, p)) {
      roleC = -2;
      gripes.push('Wants the ball in his hands');
    } else if (role && role === natural) roleC = 0.5;
    const fair = marketSalary(league, p);
    const sal = salaryFor(p, league.season);
    // a rookie-scale deal is set by the draft slot, so it's never held against the team
    const contract = sal > 0 && !p.contract.rookie ? clamp(((sal - fair) / Math.max(fair, 2000)) * 2, -2, 1.5) : 0;
    if (contract < -1) gripes.push('Feels underpaid');
    if (pt < -1.5) gripes.push(`Wants more minutes (expects ~${Math.round(exp)} mpg)`);
    if (win < -1.5) gripes.push('Frustrated by losing');
    const notes = [...gripes];
    if (pt > 1) notes.push(PRAISE[0]);
    if (win > 1.5) notes.push(PRAISE[1]);
    const score = clamp(pt + win + roleC + contract, -10, 10);
    // smooth changes over time
    p.mood.score = Math.round((prev * 0.6 + score * 0.4) * 10) / 10;
    p.mood.ptComponent = Math.round(pt * 10) / 10;
    p.mood.winComponent = Math.round(win * 10) / 10;
    p.mood.roleComponent = roleC;
    p.mood.contractComponent = Math.round(contract * 10) / 10;
    p.mood.expectedMin = Math.round(exp);
    p.mood.notes = notes;
    const wasRequest = p.mood.tradeRequest;
    // (a player holding off on a promise doesn't ask while it runs: resolvePromises settles it)
    if (p.mood.score <= -6 && p.ovr >= 74 && games >= 20 && !onHold(p)) p.mood.tradeRequest = true;
    if (p.mood.score >= -2) p.mood.tradeRequest = false;
    if (notify && tid === league.userTid && !p.promise) {
      if (!wasRequest && p.mood.tradeRequest) {
        addInbox(league, {
          important: true,
          from: 'Assistant GM',
          subject: `Trade request: ${playerName(p)}`,
          body: `${playerName(p)}'s agent says he wants a trade.${gripes.length ? ` ${gripes.join('. ')}.` : ''} An unhappy star can drag down the locker room. Meet with him, give him a bigger role or move him.`,
          tone: 'alert',
          link: `/player/${p.pid}?meet=1`,
        });
      } else if (prev > -3 && p.mood.score <= -3 && p.ovr >= 70) {
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${playerName(p)} is unhappy`,
          body: `${playerName(p)} is growing frustrated: ${gripes.join('; ') || 'unclear reasons'}. Consider adjusting his minutes or role in Rotation/Tactics, or meet with him.`,
          tone: 'bad',
          link: `/player/${p.pid}?meet=1`,
        });
      }
    }
  });
}

/** A natural creator his coach has made a spot-up shooter, roller or glue guy: he wants the ball in his hands. */
function wantsTheBall(league: League, p: Player): boolean {
  const role = league.teams[p.tid]?.tactics.offense.roles[p.pid];
  return !!role && archetype(p.ratings).role === 'creator' && (role === 'glue' || role === 'shooter' || role === 'roller');
}

/** Holding off on his trade request while a promise of a bigger role, or of his patience, runs. */
const onHold = (p: Player) => p.promise?.kind === 'role' || p.promise?.kind === 'patience';

/** Mood → on-court multiplier (~0.97..1.02). */
export function moodPerf(p: Player): number {
  return 1 + clamp(p.mood.score, -8, 6) * 0.004;
}

/**
 * Teammates of players who have asked out play a little worse (-0.6% for each, two at most); half
 * that for one his GM has promised to trade, who keeps it in-house while he waits.
 */
export function lockerRoomPerf(roster: Player[], p: Player): number {
  const unhappy = roster.filter((o) => o.pid !== p.pid && o.mood.tradeRequest).reduce((a, o) => a + (o.promise?.kind === 'trade' ? 0.5 : 1), 0);
  return 1 - 0.006 * Math.min(2, unhappy);
}

// ---------------------------------------------------------------- meetings and promises

/** Days between two meetings with the same player. */
export const MEET_DAYS = 14;
/** His games (not missed hurt or rested) a promised bigger role is judged over. */
export const ROLE_GAMES = 15;
/** Team games a player who agreed to be patient holds off on his request for. */
export const PATIENCE_GAMES = 20;

export type MeetChoice = PlayerPromise['kind'];

/** He has something to raise with the GM: he asked for a trade, or he's unhappy. */
export const wantsMeeting = (p: Player) => p.mood.tradeRequest || p.mood.score <= -3;

/** What a promise to him stands at, in a sentence ("Promised a bigger role: 6 of 15 games played, 27.4 minutes a night; he expects about 30."). */
export function promiseStatus(league: League, p: Player): string | null {
  const pr = p.promise;
  if (!pr) return null;
  if (pr.kind === 'role') {
    const games = roleGames(league, p, pr);
    const avg = games.length ? games.reduce((a, m) => a + m, 0) / games.length : 0;
    return `Promised a bigger role: ${games.length} of ${ROLE_GAMES} games played${games.length ? `, ${avg.toFixed(1)} minutes a night` : ''}; he expects about ${pr.minutes}.`;
  }
  if (pr.kind === 'patience') return `Holding off on his trade request: ${teamGames(league, pr)} of ${PATIENCE_GAMES} games.`;
  return `Promised a trade ${pr.by === 'deadline' ? `by the deadline (${fmtDate(pr.season, league.tradeDeadlineDay)})` : 'by next opening night'}.`;
}

/** Why the GM can't meet this player now, or null. */
export function meetBlockedReason(league: League, p: Player): string | null {
  if (league.fired || p.tid !== league.userTid) return 'Only your own players meet with you.';
  if (p.promise) return promiseStatus(league, p);
  if (!wantsMeeting(p)) return `${p.lastName} has nothing to raise with you.`;
  // after the season, a player whose deal is up is re-signed or let go: a promise only holds a
  // request, and he won't re-sign while one stands
  if (contractSeason(league) > league.season && contractExp(p.contract) < contractSeason(league))
    return `${p.lastName}'s contract is up: a promise now would keep him from re-signing. Re-sign him if he will, or let him go.`;
  if (p.meeting?.broken === league.season) return `You broke your word to ${p.lastName} this season: he won't take another promise until next season.`;
  const m = p.meeting;
  if (m && m.season === league.season && league.day - m.day < MEET_DAYS)
    return `You met ${p.lastName} on ${fmtDate(m.season, m.day)}: he'll talk again from ${fmtDate(m.season, m.day + MEET_DAYS)}.`;
  return null;
}

/**
 * Full seasons he has spent with his team before this one: since he joined it in this league, or,
 * for a real player at a league's start, the seasons on record he played for it without a break.
 */
export function seasonsWithTeam(league: League, p: Player): number {
  let run = 0;
  while (p.stats.some((s) => s.tid === p.tid && !s.playoffs && s.season === league.season - 1 - run)) run++;
  return Math.max(0, league.season - p.joinedSeason, run);
}

/** How likely he is to agree to be patient, from his seasons with the team, its record and his age (and the reasons, each pulling up or down). */
export function patienceOdds(league: League, p: Player): { chance: number; reasons: { text: string; up: boolean }[] } {
  const reasons: { text: string; up: boolean }[] = [];
  let c = 0.45;
  const seasons = seasonsWithTeam(league, p);
  if (seasons >= 1) {
    c += 0.07 * Math.min(4, seasons);
    reasons.push({ text: `${seasons} season${seasons === 1 ? '' : 's'} with you`, up: true });
  } else {
    c -= 0.05;
    reasons.push({ text: 'new to the team', up: false });
  }
  const ts = curTeamSeason(league, p.tid);
  if (ts.won + ts.lost >= 10) {
    const wp = winPct(ts);
    c += (wp - 0.5) * 1;
    if (Math.abs(wp - 0.5) >= 0.05) reasons.push({ text: `a ${ts.won}-${ts.lost} team`, up: wp > 0.5 });
  }
  const age = playerAge(p, league.season);
  if (age >= 31) {
    c += 0.1;
    reasons.push({ text: `a veteran (${age})`, up: true });
  } else if (age <= 24) {
    c -= 0.1;
    reasons.push({ text: `young (${age})`, up: false });
  }
  if (p.mood.tradeRequest) {
    c -= 0.1;
    reasons.push({ text: 'he has already asked out', up: false });
  }
  if (p.mood.score <= -8) {
    c -= 0.1;
    reasons.push({ text: 'furious', up: false });
  }
  return { chance: clamp(c, 0.1, 0.85), reasons };
}

/** Is a promised trade still on time? Before this season's deadline, or before next opening night after it. */
const tradeDue = (league: League, pr: PlayerPromise) =>
  pr.by === 'deadline'
    ? league.season > pr.season || (league.phase === 'regular' ? league.day > league.tradeDeadlineDay : league.phase !== 'preseason')
    : league.season > pr.season && league.phase !== 'preseason';

/**
 * Meet one of your players who asked for a trade (or is unhappy) and promise him something: once
 * every MEET_DAYS days, never while a promise to him is open, and not again in a season you broke
 * one. 'role': he holds off on his request (which comes back if it's broken) while you play him the
 * minutes he expects over his next ROLE_GAMES games. 'trade' (only when he asked): the request
 * stands, but he weighs on the locker room half as much until the deadline (or the next opening
 * night, past it); unmoved by then, he goes public. 'patience': he agrees or not by his
 * patienceOdds, drawn from the meeting's date (the same answer however often the day is replayed);
 * agreeing puts the request on hold for PATIENCE_GAMES team games, refusing costs mood.
 */
export function meetPlayer(league: League, pid: number, choice: MeetChoice): { ok: boolean; agreed?: boolean; text: string } {
  const p = league.players[pid];
  if (!p) return { ok: false, text: 'Player not found.' };
  const why = meetBlockedReason(league, p);
  if (why) return { ok: false, text: why };
  if (choice === 'trade' && !p.mood.tradeRequest) return { ok: false, text: `${p.lastName} hasn't asked for a trade.` };
  const broken = p.meeting?.broken;
  p.meeting = broken !== undefined ? { season: league.season, day: league.day, broken } : { season: league.season, day: league.day };
  const base = { tid: p.tid, season: league.season, day: league.day, request: p.mood.tradeRequest };
  if (choice === 'role') {
    const minutes = Math.max(1, Math.round(p.mood.expectedMin));
    p.promise = { kind: 'role', ...base, minutes };
    p.mood.tradeRequest = false;
    return { ok: true, text: `${p.lastName} will hold off. Play him about ${minutes} minutes a night over his next ${ROLE_GAMES} games.` };
  }
  if (choice === 'trade') {
    const by = league.phase === 'preseason' || (league.phase === 'regular' && league.day <= league.tradeDeadlineDay) ? 'deadline' : 'opening';
    p.promise = { kind: 'trade', ...base, by };
    return {
      ok: true,
      text: `${p.lastName} expects to be moved ${by === 'deadline' ? `by the deadline (${fmtDate(league.season, league.tradeDeadlineDay)})` : 'by next opening night'}. Until then he keeps it in-house.`,
    };
  }
  const agreed = new Rng(hashString(`${league.id}:${p.pid}:${league.season}:${league.day}:patience`)).chance(patienceOdds(league, p).chance);
  if (agreed) {
    p.promise = { kind: 'patience', ...base };
    p.mood.tradeRequest = false;
    p.mood.score = clamp(p.mood.score + 1, -10, 10);
    return { ok: true, agreed, text: `${p.lastName} agrees to give it ${PATIENCE_GAMES} games.` };
  }
  p.mood.score = clamp(p.mood.score - 1.5, -10, 10);
  return { ok: true, agreed, text: `${p.lastName} isn't having it, and he's angrier for being asked.` };
}

/** The team's games since a promise was made (a live game still being played isn't one yet). */
function promiseGames(league: League, pr: PlayerPromise) {
  return league.games.filter(
    (g) => g.type !== 'allstar' && (g.season > pr.season || (g.season === pr.season && g.day >= pr.day)) && (g.home.tid === pr.tid || g.away.tid === pr.tid),
  );
}

const teamGames = (league: League, pr: PlayerPromise) => promiseGames(league, pr).length;

/** His minutes in each team game since the promise, leaving out the games he missed hurt or rested (a coach's decision counts as 0). */
function roleGames(league: League, p: Player, pr: PlayerPromise): number[] {
  return promiseGames(league, pr).flatMap((g) => {
    const b = (g.home.tid === pr.tid ? g.home : g.away).players.find((x) => x.pid === p.pid);
    return !b || (b.dnp && b.dnp !== "Coach's decision") ? [] : [b.min];
  });
}

/**
 * Settle the promises to the user's players that are due (daily, and on opening night): a bigger
 * role after his ROLE_GAMES games (kept at no less than a minute under what he expected, and the
 * ball in a creator's hands), a trade at its date, patience after PATIENCE_GAMES games. A promise
 * ends with his trade or release, or when his GM moves on.
 */
export function resolvePromises(league: League) {
  for (const p of Object.values(league.players)) {
    const pr = p.promise;
    if (!pr) continue;
    if (p.tid !== pr.tid || p.tid !== league.userTid || league.fired) {
      delete p.promise;
      continue;
    }
    const name = playerName(p);
    // a broken promise: no more promises this season
    const broke = () => (p.meeting = { ...(p.meeting ?? { season: league.season, day: league.day }), broken: league.season });
    if (pr.kind === 'role') {
      const games = roleGames(league, p, pr).slice(0, ROLE_GAMES);
      if (games.length < ROLE_GAMES) continue;
      delete p.promise;
      const avg = games.reduce((a, m) => a + m, 0) / games.length;
      const ball = wantsTheBall(league, p);
      if (avg >= pr.minutes! - 1 && !ball) {
        p.mood.tradeRequest = false;
        p.mood.score = clamp(Math.max(p.mood.score, -2) + 2, -10, 10);
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${name} likes his new role`,
          body: `${p.lastName} got what you promised: ${avg.toFixed(1)} minutes a night over his last ${ROLE_GAMES} games.${pr.request ? ' He has dropped his trade request.' : ''}`,
          tone: 'good',
          link: `/player/${p.pid}`,
        });
      } else {
        broke();
        p.mood.score = clamp(p.mood.score - 2.5, -10, 10);
        if (pr.request) p.mood.tradeRequest = true;
        addInbox(league, {
          important: pr.request,
          from: 'Assistant GM',
          subject: `${name} says you broke your word`,
          body: `You promised ${p.lastName} about ${pr.minutes} minutes a night${ball ? ' and the ball in his hands' : ''}, and he got ${avg.toFixed(1)} over his last ${ROLE_GAMES} games${ball ? ' as a role player' : ''}. ${
            pr.request ? 'He wants a trade again, angrier than before' : "He's angrier than before"
          }, and he won't take your word again this season.`,
          tone: 'bad',
          link: `/player/${p.pid}`,
        });
      }
    } else if (pr.kind === 'patience') {
      if (teamGames(league, pr) < PATIENCE_GAMES) continue;
      delete p.promise;
      if (!pr.request) continue;
      const settled = p.mood.score >= -2;
      p.mood.tradeRequest = !settled;
      addInbox(league, {
        important: !settled,
        from: 'Assistant GM',
        subject: settled ? `${name} has settled down` : `${name} wants a trade again`,
        body: settled
          ? `${p.lastName} gave it ${PATIENCE_GAMES} games, as he said he would, and he's no longer asking for a trade.`
          : `${p.lastName} gave it ${PATIENCE_GAMES} games, as he said he would. Nothing has changed for him, and he wants a trade again.`,
        tone: settled ? 'good' : 'alert',
        link: `/player/${p.pid}?meet=1`,
      });
    } else {
      // the request went away by itself (his mood came back): nothing left to promise
      if (!p.mood.tradeRequest) {
        delete p.promise;
        continue;
      }
      if (!tradeDue(league, pr)) continue;
      delete p.promise;
      broke();
      p.mood.score = clamp(p.mood.score - 2, -10, 10);
      const team = league.teams[p.tid];
      addNews(league, {
        kind: 'general',
        text: `${name} goes public: the ${team.region} ${team.name} told him they would trade him ${pr.by === 'deadline' ? 'by the deadline' : 'over the summer'}, and he's still here.`,
        tids: [team.tid],
        pids: [p.pid],
      });
      addInbox(league, {
        important: true,
        from: 'Assistant GM',
        subject: `${name} goes public`,
        body: `You told ${p.lastName} you'd find him a trade ${pr.by === 'deadline' ? 'before the deadline' : 'before opening night'}, and he's still here. He has taken it to the press, his mood has dropped, and he won't take your word again this season.`,
        tone: 'bad',
        link: `/player/${p.pid}`,
      });
    }
  }
}

/**
 * The season is over and his deal is up: a bigger role or patience promise that hasn't run its
 * games can't run them now, and he won't re-sign while one holds his request. So it ends with the
 * season, held against nobody (call after the playoffs, before the re-sign period): a role he got
 * over the games he had counts as kept, and otherwise a request it held stands only if he is still
 * unhappy, by the weekly rule's line (see updateMorale). The GM hears which.
 */
export function settleExpiringPromises(league: League) {
  for (const p of teamPlayers(league, league.userTid)) {
    const pr = p.promise;
    if (!pr || pr.kind === 'trade' || pr.tid !== p.tid || contractExp(p.contract) > league.season) continue;
    delete p.promise;
    const games = pr.kind === 'role' ? roleGames(league, p, pr) : [];
    const avg = games.length ? games.reduce((a, m) => a + m, 0) / games.length : 0;
    const kept = games.length > 0 && avg >= pr.minutes! - 1 && !wantsTheBall(league, p);
    if (kept) p.mood.score = clamp(Math.max(p.mood.score, -2) + 2, -10, 10);
    if (!pr.request) continue;
    const settled = kept || p.mood.score >= -2;
    p.mood.tradeRequest = !settled;
    const name = playerName(p);
    addInbox(league, {
      from: 'Assistant GM',
      subject: settled ? `${name} will talk about a new deal` : `${name} still wants out`,
      body: settled
        ? `The season ran out on your promise to ${p.lastName}${kept ? `, and he got what you said he would (${avg.toFixed(1)} minutes a night)` : ''}. He has dropped his trade request, and his agent will talk about a new contract.`
        : `The season ran out on your promise to ${p.lastName}, and nothing has changed for him: his trade request stands, and he won't re-sign with you.`,
      tone: settled ? 'good' : 'bad',
      link: `/player/${p.pid}`,
    });
  }
}
