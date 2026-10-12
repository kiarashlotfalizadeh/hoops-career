// Player morale & role expectations. Players expect minutes in line with their standing;
// winning, contract fairness and role fit also matter. Mood feeds re-signing willingness,
// FA appeal and a small on-court performance multiplier.

import type { League, MoodLevel, Player } from '../types';
import { clamp } from '../random';
import { archetype } from '../ratings';
import { addInbox, curTeamSeason, playerName, seasonTotals, teamPlayers, winPct } from './helpers';
import { marketSalary } from './contracts';
import { salaryFor } from '../playerGen';
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
    if (role && natural === 'creator' && (role === 'glue' || role === 'shooter' || role === 'roller')) {
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
    if (pt > 1) notes.push('Happy with his role');
    if (win > 1.5) notes.push('Loves winning here');
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
    if (p.mood.score <= -6 && p.ovr >= 74 && games >= 20) p.mood.tradeRequest = true;
    if (p.mood.score >= -2) p.mood.tradeRequest = false;
    if (notify && tid === league.userTid) {
      if (!wasRequest && p.mood.tradeRequest) {
        addInbox(league, {
          important: true,
          from: 'Assistant GM',
          subject: `Trade request: ${playerName(p)}`,
          body: `${playerName(p)}'s agent says he wants a trade.${gripes.length ? ` ${gripes.join('. ')}.` : ''} An unhappy star can drag down the locker room. Give him a bigger role or move him.`,
          tone: 'alert',
          link: `/player/${p.pid}`,
        });
      } else if (prev > -3 && p.mood.score <= -3 && p.ovr >= 70) {
        addInbox(league, {
          from: 'Assistant GM',
          subject: `${playerName(p)} is unhappy`,
          body: `${playerName(p)} is growing frustrated: ${gripes.join('; ') || 'unclear reasons'}. Consider adjusting his minutes or role in Rotation/Tactics.`,
          tone: 'bad',
          link: `/player/${p.pid}`,
        });
      }
    }
  });
}

/** Mood → on-court multiplier (~0.97..1.02). */
export function moodPerf(p: Player): number {
  return 1 + clamp(p.mood.score, -8, 6) * 0.004;
}

/** Teammates of players who have asked out play a little worse (-0.6% for each, two at most). */
export function lockerRoomPerf(roster: Player[], p: Player): number {
  const unhappy = roster.filter((o) => o.pid !== p.pid && o.mood.tradeRequest).length;
  return 1 - 0.006 * Math.min(2, unhappy);
}
