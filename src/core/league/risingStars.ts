// The Rising Stars game, All-Star weekend's opener: the best first- and second-year players, the
// rookies against the sophomores, an exhibition played in the engine on the All-Star day before the
// Saturday contests. Its rosters (names and teams frozen), lines, score and MVP are kept on the
// season's awards (SeasonAwards.risingStars); the MVP gets an award record ('Rising Stars MVP', a
// token among a career's honours) and the game makes the news. It draws on a random stream of its
// own, one per league and season, so the league's stream never moves for it and no game after it
// changes.

import type { League, Player, RisingStar } from '../types';
import { Rng, hashString } from '../random';
import { GameSim } from '../sim/engine';
import { autoRotation, autoTactics } from '../ai/coachAI';
import { makeTeam } from '../teamFactory';
import { gameScore } from './awards';
import { addInbox, addNews, andList, playerName, seasonTotals } from './helpers';

/** Players on each side. */
export const RISING_ROSTER = 10;
/** Fewer than this on either side and there's no game (a fictional league's first season has no sophomores). */
const RISING_MIN = 8;
/** Share of his team's games he must have played to be picked. */
const RISING_GAMES = 0.3;

/**
 * The rookies (in their first season) and the sophomores (their second) the league picks: healthy,
 * on a roster, with 30% of the busiest team's games played, ranked by their production (game score a
 * game) and how good they are (OVR), best first.
 */
export function risingField(league: League): { rookies: Player[]; sophomores: Player[] } {
  const games = Math.max(1, ...league.teams.map((t) => t.seasons.find((s) => s.season === league.season)).map((s) => (s ? s.won + s.lost : 0)));
  const ranked = (experience: number) =>
    Object.values(league.players)
      .filter((p) => p.tid >= 0 && !p.injury && p.experience === experience)
      .flatMap((p) => {
        const s = seasonTotals(p, league.season, false);
        return s && s.gp >= games * RISING_GAMES ? [{ p, v: gameScore(s) / s.gp + 0.15 * (p.ovr - 60) }] : [];
      })
      .sort((a, b) => b.v - a.v || a.p.pid - b.p.pid)
      .slice(0, RISING_ROSTER)
      .map((x) => x.p);
  return { rookies: ranked(0), sophomores: ranked(1) };
}

const risingRng = (league: League) => new Rng(hashString(`${league.id}:${league.season}:rising-stars`));

/** Play the Rising Stars game on the All-Star day (once), and keep it with the season's awards. */
export function risingStars(league: League) {
  const aw = league.awards.find((a) => a.season === league.season);
  if (!aw || aw.risingStars) return;
  const { rookies, sophomores } = risingField(league);
  if (rookies.length < RISING_MIN || sophomores.length < RISING_MIN) return;
  const rng = risingRng(league);
  const side = (players: Player[], slot: number, name: string, abbrev: string) => {
    const team = makeTeam(slot, league.season, rng);
    team.region = 'Team';
    team.name = name;
    team.abbrev = abbrev;
    team.rotation = autoRotation(players);
    // an exhibition: everyone plays about the same
    for (const p of players) team.rotation.minutes[p.pid] = Math.round(240 / players.length);
    team.tactics = autoTactics(team, players, false);
    team.tactics.offense.pace = 95;
    team.tactics.defense.pressure = 15;
    team.tactics.defense.physicality = 10;
    return { team, players };
  };
  const sim = new GameSim(side(rookies, 0, 'Rookies', 'ROOK'), side(sophomores, 1, 'Sophomores', 'SOPH'), { rng, type: 'allstar', neutral: true, injuries: false });
  const res = sim.simToEnd();
  const lines = new Map([...res.home.players, ...res.away.players].map((b) => [b.pid, b]));
  const entry = (p: Player): RisingStar => {
    const b = lines.get(p.pid);
    return { pid: p.pid, name: playerName(p), tid: p.tid, pts: b?.pts ?? 0, reb: b ? b.orb + b.drb : 0, ast: b?.ast ?? 0 };
  };
  const mvp = res.pog !== undefined && league.players[res.pog] ? res.pog : undefined;
  aw.risingStars = { rookies: rookies.map(entry), sophomores: sophomores.map(entry), score: [res.home.pts, res.away.pts], ...(mvp !== undefined ? { mvp } : {}) };
  if (mvp !== undefined) league.players[mvp].awards.push({ season: league.season, type: 'Rising Stars MVP' });
  const [r, s] = aw.risingStars.score;
  const m = mvp !== undefined ? [...aw.risingStars.rookies, ...aw.risingStars.sophomores].find((e) => e.pid === mvp) : undefined;
  const ab = (tid: number) => league.teams[tid]?.abbrev ?? '';
  addNews(league, {
    kind: 'award',
    text: `Rising Stars: the ${r > s ? 'Rookies beat the Sophomores' : 'Sophomores beat the Rookies'} ${Math.max(r, s)}-${Math.min(r, s)}.${m ? ` MVP: ${m.name} (${ab(m.tid)}), ${m.pts} points.` : ''}`,
    tids: [],
    pids: m ? [m.pid] : [],
  });
  const mine = [...aw.risingStars.rookies, ...aw.risingStars.sophomores].filter((e) => e.tid === league.userTid);
  if (mine.length)
    addInbox(league, {
      from: 'League Office',
      subject: 'Rising Stars',
      body: `${andList(mine.map((e) => `${e.name} (${e.pts} points)`))} played in the Rising Stars game: the ${r > s ? 'Rookies' : 'Sophomores'} won ${Math.max(r, s)}-${Math.min(r, s)}.${mine.some((e) => e.pid === mvp) ? ` ${m!.name} was its MVP.` : ''}`,
      tone: mine.some((e) => e.pid === mvp) ? 'good' : 'neutral',
      link: '/league?tab=awards',
    });
}
