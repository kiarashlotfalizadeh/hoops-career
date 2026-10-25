// The game-level files the seed's stats come from, kept by hand in data/raw/games/ (nothing here
// downloads them): every NBA game since 1996-97 as a box score per player
// (PlayerStatisticsExtended.csv: the traditional line, plus-minus, possessions, on-court ratings and
// the player's shares of his team's numbers while he played) and as play-by-play (PlayByPlay.parquet:
// NBA.com's action log, shot locations and substitutions included). Both use NBA.com's ids for
// players, teams and games.
//
// A game id (leading zeros dropped) is its type, then the year its season started, then its number:
// 22500001 is the first regular-season game of 2025-26. Type 2 is the regular season (NBA Cup group
// and knockout games included), 4 the playoffs and 5 the play-in, which the game counts with the
// playoffs as its postseason; preseason (1), All-Star (3) and the Cup final (6) count in neither.
import { join } from 'node:path';

// follows HC_RAW_DIR (the offline fixture build) unless HC_GAMES_DIR says otherwise
export const GAMES_RAW = process.env.HC_GAMES_DIR ?? join(process.env.HC_RAW_DIR ?? join(process.cwd(), 'data', 'raw'), 'games');
export const BOX_FILE = 'PlayerStatisticsExtended.csv';
/** The play-by-play: Parquet, or the same columns as a CSV (the offline fixture writes one). */
export const PBP_FILES = ['PlayByPlay.parquet', 'PlayByPlay.csv'];

export type GamePart = 'reg' | 'post';

/** A game's season (by end year, 2026 = 2025-26) and part, or null for a game that counts in neither. */
export function gameOf(gameId: number | string): { season: number; part: GamePart } | null {
  const id = String(gameId).replace(/^0+/, '');
  if (id.length !== 8) return null;
  const type = id[0];
  const part: GamePart | null = type === '2' ? 'reg' : type === '4' || type === '5' ? 'post' : null;
  if (!part) return null;
  const yy = Number(id.slice(1, 3));
  return { season: (yy >= 50 ? 1900 : 2000) + yy + 1, part };
}

/** A player's line: one team, one season, its regular season or its postseason. */
export const lineKey = (pid: number, season: number, teamId: number, part: GamePart) => `${pid}|${season}|${teamId}|${part}`;

export function parseLineKey(key: string): { pid: number; season: number; teamId: number; part: GamePart } {
  const [pid, season, teamId, part] = key.split('|');
  return { pid: Number(pid), season: Number(season), teamId: Number(teamId), part: part as GamePart };
}
