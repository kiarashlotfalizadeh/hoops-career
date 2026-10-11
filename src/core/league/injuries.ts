import type { Injury, League, Player } from '../types';
import { Rng, clamp } from '../random';
import { addInbox, addNews, age, playerName } from './helpers';

interface InjuryType {
  name: string;
  weight: number;
  min: number;
  max: number;
  severity: Injury['severity'];
}

/** Injuries shorter than this skip the inbox (they still show on the roster and in rotations). */
const MAIL_MIN_GAMES = 4;

export const INJURY_TYPES: InjuryType[] = [
  { name: 'Sprained Ankle', weight: 22, min: 1, max: 8, severity: 'minor' },
  { name: 'Knee Soreness', weight: 12, min: 1, max: 5, severity: 'minor' },
  { name: 'Back Spasms', weight: 8, min: 1, max: 6, severity: 'minor' },
  { name: 'Hip Contusion', weight: 5, min: 1, max: 4, severity: 'minor' },
  { name: 'Sprained Finger', weight: 6, min: 1, max: 5, severity: 'minor' },
  { name: 'Concussion', weight: 4, min: 2, max: 9, severity: 'minor' },
  { name: 'Illness', weight: 6, min: 1, max: 3, severity: 'minor' },
  { name: 'Hamstring Strain', weight: 10, min: 3, max: 14, severity: 'moderate' },
  { name: 'Calf Strain', weight: 7, min: 3, max: 16, severity: 'moderate' },
  { name: 'Groin Strain', weight: 5, min: 3, max: 12, severity: 'moderate' },
  { name: 'Sprained Shoulder', weight: 4, min: 3, max: 12, severity: 'moderate' },
  { name: 'Plantar Fasciitis', weight: 3, min: 6, max: 20, severity: 'moderate' },
  { name: 'Broken Hand', weight: 3, min: 15, max: 30, severity: 'moderate' },
  { name: 'MCL Sprain', weight: 3, min: 10, max: 30, severity: 'moderate' },
  { name: 'Torn Meniscus', weight: 1.8, min: 20, max: 45, severity: 'major' },
  { name: 'Foot Stress Fracture', weight: 1.4, min: 25, max: 60, severity: 'major' },
  { name: 'Torn ACL', weight: 0.7, min: 70, max: 110, severity: 'severe' },
  { name: 'Ruptured Achilles', weight: 0.5, min: 80, max: 125, severity: 'severe' },
];

export function rollInjury(league: League, p: Player, rng: Rng): Injury {
  const a = age(league, p);
  const weights = INJURY_TYPES.map((t) => t.weight * (t.severity === 'severe' && a >= 30 ? 1.6 : 1) * (t.severity !== 'minor' ? 0.8 + p.injuryProne * 0.6 : 1));
  const t = INJURY_TYPES[rng.weighted(weights)];
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const health = team ? team.budget.health : 50;
  let games = Math.round(rng.uniform(t.min, t.max) * (1.12 - 0.25 * (health / 100)) * (a >= 32 ? 1.15 : 1));
  games = Math.max(1, games);
  return { type: t.name, gamesRemaining: games, gamesTotal: games, severity: t.severity };
}

export function applyInjury(league: League, p: Player, rng: Rng) {
  const inj = rollInjury(league, p, rng);
  p.injury = inj;
  p.injuryCount++;
  // lasting damage for major injuries
  if (inj.severity === 'major' || inj.severity === 'severe') {
    const hit = inj.severity === 'severe' ? rng.uniform(3, 8) : rng.uniform(1, 3);
    p.ratings.spd = clamp(p.ratings.spd - hit, 1, 100);
    p.ratings.ath = clamp(p.ratings.ath - hit * 1.1, 1, 100);
    p.injuryProne = clamp(p.injuryProne + 0.1, 0, 1);
  }
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const text = `${playerName(p)} (${team?.abbrev ?? 'FA'}) — ${inj.type}, out ~${inj.gamesRemaining} game${inj.gamesRemaining === 1 ? '' : 's'}.`;
  if (inj.gamesRemaining >= 5 || p.ovr >= 80) addNews(league, { kind: 'injury', text, tids: team ? [team.tid] : [], pids: [p.pid] });
  // day-to-day knocks only show on the roster; the inbox is for absences that change plans
  if (p.tid === league.userTid && inj.gamesRemaining >= MAIL_MIN_GAMES) {
    // a long absence for one of the top eight players is worth pausing a long sim for
    const rot = league.teams[p.tid].rotation;
    const top8 = [...rot.order].sort((a, b) => (rot.minutes[b] ?? 0) - (rot.minutes[a] ?? 0)).slice(0, 8);
    addInbox(league, {
      important: inj.gamesRemaining >= 10 && top8.includes(p.pid),
      from: 'Medical Staff',
      subject: `${playerName(p)}: ${inj.type}`,
      body: `${playerName(p)} suffered a ${inj.type.toLowerCase()} and is expected to miss about ${inj.gamesRemaining} game${inj.gamesRemaining === 1 ? '' : 's'}.${inj.severity === 'severe' ? ' This is a long-term injury and may permanently sap some of his explosiveness.' : ''} Rotation minutes have been redistributed automatically; review them in Rotation.`,
      tone: 'bad',
      link: `/player/${p.pid}`,
    });
  }
}

/** Called once per game a team plays (or once per offseason chunk). */
export function healOneGame(league: League, p: Player, rng: Rng) {
  if (!p.injury) return;
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const health = team ? team.budget.health : 50;
  // good medical staff occasionally shaves a day off
  const extra = rng.chance((health - 50) / 250) ? 1 : 0;
  p.injury.gamesRemaining -= 1 + extra;
  if (p.injury.gamesRemaining <= 0) {
    if (p.tid === league.userTid && p.injury.gamesTotal >= MAIL_MIN_GAMES) {
      addInbox(league, { from: 'Medical Staff', subject: `${playerName(p)} is cleared`, body: `${playerName(p)} has recovered from his ${p.injury.type.toLowerCase()} and is available.`, tone: 'good', link: `/player/${p.pid}` });
    }
    p.injury = null;
  }
}
