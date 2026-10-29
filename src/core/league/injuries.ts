import type { Injury, League, Player } from '../types';
import { Rng, clamp } from '../random';
import { addInbox, addNews, age, playerName } from './helpers';
import { injuryName, outFor, plural } from '../format';
import { refreshPlayerDerived } from '../playerGen';

interface InjuryType {
  name: string;
  weight: number;
  min: number;
  max: number;
  severity: Injury['severity'];
  /** Most games it can cost, after the medical budget and age have stretched it. */
  cap?: number;
}

/**
 * The inbox hears of an injury that changes plans: one of the MAIL_RANK biggest minute loads out this
 * many games, or anyone else in the rotation out RETURN_MAIL_GAMES. Shorter absences, and players
 * out of the rotation, still show on the roster, Today's next game, the rotation and the digest's
 * Injuries (a role player's few weeks out was most of a season's mail).
 */
const MAIL_MIN_GAMES = 8;
/** The minute loads whose shorter absences still get mail: the starters. */
const MAIL_RANK = 5;
/** A return gets its own mail only after an absence this long; shorter ones end without a word. */
const RETURN_MAIL_GAMES = 15;

// Weights and lengths tuned so a team loses about four to six players a season to 10+ game
// absences and the league sees a handful of season-ending tears, as in recent NBA seasons: four to
// eight absences of 60+ games a season, one to three of them Achilles ruptures (at twice these
// weights star-check counted 9 a season, 4 Achilles, up to 18 and 10).
export const INJURY_TYPES: InjuryType[] = [
  { name: 'Sprained ankle', weight: 24, min: 1, max: 7, severity: 'minor' },
  { name: 'Knee soreness', weight: 13, min: 1, max: 5, severity: 'minor' },
  { name: 'Back spasms', weight: 8, min: 1, max: 5, severity: 'minor' },
  { name: 'Hip contusion', weight: 5, min: 1, max: 4, severity: 'minor' },
  { name: 'Sprained finger', weight: 6, min: 1, max: 4, severity: 'minor' },
  { name: 'Concussion', weight: 4, min: 2, max: 8, severity: 'minor' },
  { name: 'Illness', weight: 7, min: 1, max: 3, severity: 'minor' },
  { name: 'Hamstring strain', weight: 9, min: 3, max: 12, severity: 'moderate' },
  { name: 'Calf strain', weight: 6, min: 3, max: 14, severity: 'moderate' },
  { name: 'Groin strain', weight: 4.5, min: 3, max: 11, severity: 'moderate' },
  { name: 'Sprained shoulder', weight: 3.5, min: 3, max: 10, severity: 'moderate' },
  { name: 'Plantar fasciitis', weight: 2.5, min: 5, max: 18, severity: 'moderate' },
  { name: 'Broken hand', weight: 2.2, min: 14, max: 28, severity: 'moderate' },
  { name: 'MCL sprain', weight: 2.4, min: 8, max: 26, severity: 'moderate' },
  { name: 'Torn meniscus', weight: 1.3, min: 18, max: 40, severity: 'major' },
  { name: 'Foot stress fracture', weight: 1, min: 22, max: 55, severity: 'major' },
  { name: 'Torn ACL', weight: 0.2, min: 70, max: 110, severity: 'severe' },
  { name: 'Ruptured Achilles', weight: 0.16, min: 72, max: 95, severity: 'severe', cap: 95 },
];

export function rollInjury(league: League, p: Player, rng: Rng): Injury {
  const a = age(league, p);
  const weights = INJURY_TYPES.map((t) => t.weight * (t.severity === 'severe' && a >= 30 ? 1.6 : 1) * (t.severity !== 'minor' ? 0.8 + p.injuryProne * 0.6 : 1));
  const t = INJURY_TYPES[rng.weighted(weights)];
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const health = team ? team.budget.health : 50;
  let games = Math.round(rng.uniform(t.min, t.max) * (1.12 - 0.25 * (health / 100)) * (a >= 32 ? 1.15 : 1));
  games = Math.max(1, Math.min(t.cap ?? Infinity, games));
  return { type: t.name, gamesRemaining: games, gamesTotal: games, severity: t.severity };
}

/**
 * An injury name for running text: "Torn ACL" -> "torn ACL", "Ruptured Achilles" keeps its capital.
 * With `article`, countable injuries get one ("a torn ACL", "an MCL sprain"), while plurals and
 * conditions don't ("back spasms", "knee soreness", "plantar fasciitis").
 */
export function injuryText(type: string, article = false): string {
  const words = type.split(' ').map((w) => (w === 'Achilles' || (w.length > 1 && w === w.toUpperCase()) ? w : w.toLowerCase()));
  const text = words.join(' ');
  const last = words[words.length - 1];
  if (!article || /(ness|itis)$/.test(last) || (/s$/.test(last) && !/(ss|us|is|les)$/.test(last))) return text;
  const an = /^[AEFHILMNORSX][A-Z]/.test(words[0]) || /^[aeiou]/.test(words[0]);
  return `${an ? 'an' : 'a'} ${text}`;
}

/** What the medical staff says about the lasting damage major and severe injuries do (see applyInjury). */
const LASTING: Partial<Record<Injury['severity'], string>> = {
  major: ' Injuries like this can take a little off his speed and athleticism for good.',
  severe: ' This is a long-term injury and may permanently sap some of his explosiveness.',
};

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
    // his OVR shows it now, not at the next new season
    refreshPlayerDerived(p, league.season, league.ovrScale);
  }
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const text = `${team ? `${team.abbrev}'s` : 'Free agent'} ${playerName(p)} is ${outFor(inj.gamesRemaining)} with ${injuryText(inj.type, true)}.`;
  // news for real absences: ten games, or five for a star (85+: at 80, a fifth of the league's
  // players, a month's wire was a column of five-game strains)
  if (inj.gamesRemaining >= 10 || (p.ovr >= 85 && inj.gamesRemaining >= 5)) addNews(league, { kind: 'injury', text, tids: team ? [team.tid] : [], pids: [p.pid] });
  // day-to-day knocks, short absences of the end of the bench and players out of the rotation only
  // show on the roster; the inbox is for absences that change plans
  const rot = p.tid === league.userTid ? league.teams[p.tid].rotation : null;
  const byMinutes = rot ? [...rot.order].filter((pid) => (rot.minutes[pid] ?? 0) > 0).sort((a, b) => (rot.minutes[b] ?? 0) - (rot.minutes[a] ?? 0)) : [];
  const rank = byMinutes.indexOf(p.pid);
  if (rank >= 0 && inj.gamesRemaining >= (rank < MAIL_RANK ? MAIL_MIN_GAMES : RETURN_MAIL_GAMES)) {
    addInbox(league, {
      // (a star's long absence is a staff call that stops a long sim: see calls.ts)
      from: 'Medical Staff',
      // what happened in the subject: who, for how long, with what
      subject: `${playerName(p)}: ${injuryName(inj.type)} · ${outFor(inj.gamesRemaining)}`,
      body: `${playerName(p)} is out about ${plural(inj.gamesRemaining, 'game')} with ${injuryText(inj.type, true)}.${LASTING[inj.severity] ?? ''} His minutes go to the healthy players until he's back. Team → Rotation shows who gets them.`,
      tone: 'bad',
      link: `/player/${p.pid}`,
    });
  }
}

/** How well a questionable player cleared to play plays: about 6% off his game (his shots, his creation, his share of the offense and, a little, his defense: the engine's form multiplier). */
export const GAME_TIME_PERF = 0.94;

/**
 * Questionable for his team's next game: one game left on a minor or moderate injury (not a
 * concussion: the protocol decides those). He sits unless the coach clears him to play (only the
 * user's team does: AI teams sit him); a game he plays counts as the one he had left.
 */
export function isQuestionable(p: Player): boolean {
  const inj = p.injury;
  return !!inj && inj.gamesRemaining === 1 && (inj.severity === 'minor' || inj.severity === 'moderate') && inj.type !== 'Concussion';
}

/** The user's questionable players cleared to play game `gid` (League.gameTime), still questionable and still his. */
export function clearedToPlay(league: League, gid: number): number[] {
  const gt = league.gameTime;
  if (!gt || gt.gid !== gid) return [];
  return gt.play.filter((pid) => {
    const p = league.players[pid];
    return !!p && p.tid === league.userTid && isQuestionable(p);
  });
}

/** Clear a questionable player of the user's to play game `gid` (`play`), or sit him again. Decisions for another game are dropped. */
export function setGameTime(league: League, gid: number, pid: number, play: boolean) {
  const keep = clearedToPlay(league, gid).filter((x) => x !== pid);
  const p = league.players[pid];
  if (play && p && p.tid === league.userTid && isQuestionable(p)) keep.push(pid);
  if (keep.length) league.gameTime = { gid, play: keep };
  else delete league.gameTime;
}

/** Called once per game a team plays, and about every other day for a player with no games to miss (healIdle in season.ts). */
export function healOneGame(league: League, p: Player, rng: Rng) {
  if (!p.injury) return;
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const health = team ? team.budget.health : 50;
  // good medical staff occasionally shaves a day off
  const extra = rng.chance((health - 50) / 250) ? 1 : 0;
  p.injury.gamesRemaining -= 1 + extra;
  if (p.injury.gamesRemaining <= 0) {
    if (p.tid === league.userTid && p.injury.gamesTotal >= RETURN_MAIL_GAMES) {
      addInbox(league, {
        from: 'Medical Staff',
        subject: `${playerName(p)} is back`,
        body: `${playerName(p)} has recovered from his ${injuryText(p.injury.type)} after ${plural(p.injury.gamesTotal, 'game')} out and is available.`,
        tone: 'good',
        link: `/player/${p.pid}`,
      });
    }
    p.injury = null;
  }
}
