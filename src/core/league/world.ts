// The world around the games: the press, the staff's development watch, the user's legacy, the
// locker rooms' pulse and the owner's once-a-season cameo,
// called from the season's calendar (season.ts) at four points. Each part reads the league as it
// stands and writes news, mail and its own state. None of them draws from the league's random
// stream: anything random is seeded from the day, the game or the season (see `worldRng`). The
// press, the watch and the legacy change nothing in how the league plays out. The pulse does, on
// purpose and in the open (pulse.ts): a tight core executes a little better, and a star who asks
// out goes on the block.
import type { League, ScheduledGame } from '../types';
import { Rng, hashString, mix32 } from '../random';
import { mediaDay, mediaGame, mediaSeasonEnd, mediaSeasonStart } from './media';
import { storyGame } from '../analysis/gameStory';
import { devDay, devSeasonEnd } from './devWatch';
import { legacyDay, legacyGame, legacySeasonEnd } from './legacy';
import { pulseDay } from './pulse';
import { ownerCameoDay } from './ownerCameos';

/** A random stream of the world's own for one occasion ("power", season, day): the same occasion always draws the same. */
export function worldRng(league: League, ...keys: (string | number)[]): Rng {
  return new Rng(mix32(hashString(`${league.id}|${keys.join('|')}`)));
}

/** After every game (the user's live games too), once its result is in: the result is the last of `league.games` for its gid. */
export function worldGame(league: League, g: ScheduledGame) {
  storyGame(league, g);
  mediaGame(league, g);
  legacyGame(league, g);
}

/** At the end of every day of the season and the postseason, and every day of free agency. */
export function worldDay(league: League) {
  mediaDay(league);
  devDay(league);
  legacyDay(league);
  pulseDay(league);
  ownerCameoDay(league);
}

/** On opening night, once rosters, rotations and the owner's goals are set. */
export function worldSeasonStart(league: League) {
  mediaSeasonStart(league);
}

/** When the Finals end, after the awards, the owner's review and the coaching carousel. */
export function worldSeasonEnd(league: League) {
  mediaSeasonEnd(league);
  devSeasonEnd(league);
  legacySeasonEnd(league);
}
