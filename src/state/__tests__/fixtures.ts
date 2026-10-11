// Leagues for the state tests: the real seed, user roster trimmed to 15, regular season started.
import seedJson from '../../data/seed.json';
import { createLeague, defaultSettings, type SeedData } from '../../core/league/create';
import { startRegularSeason } from '../../core/league/season';
import { standardRoster } from '../../core/league/helpers';
import { releasePlayer, valueScore } from '../../core/league/contracts';
import { userGameOnDay } from '../../core/league/games';
import { simDay } from '../../core/league/season';
import { CAP } from '../../core/constants';
import type { League } from '../../core/types';

const seed = seedJson as unknown as SeedData;

export function testLeague(name = 'Test', rngSeed = 7): League {
  const l = createLeague({ name, userTid: 19, coachName: 'c', settings: { ...defaultSettings(), stopOnNews: false }, seed: seed.players.length ? seed : null, rngSeed });
  const std = () => standardRoster(l, l.userTid);
  while (std().length > CAP.rosterMax) releasePlayer(l, std().sort((a, b) => valueScore(l, a) - valueScore(l, b))[0], { news: false });
  if (startRegularSeason(l).length) throw new Error('could not start the season');
  return l;
}

/** Sim to the next day the user's team plays. */
export function toGameDay(l: League) {
  for (let i = 0; i < 10 && !userGameOnDay(l, l.day); i++) simDay(l);
  if (!userGameOnDay(l, l.day)) throw new Error('no user game found');
}

export const userGames = (l: League) => l.games.filter((g) => g.home.tid === l.userTid || g.away.tid === l.userTid);
