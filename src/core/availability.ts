// Whether a player can play his team's next game: what every rotation, lineup, projection and
// screen that plans around missing players asks, injuries and suspensions alike.

/** What keeps a player out: an injury with games left to miss, a suspension with games left to sit (a Player has both fields). */
interface Absences {
  injury?: { gamesRemaining: number } | null;
  suspension?: { games: number };
}

/** Team games he still has to sit for a suspension (0: none). */
export function suspendedGames(p: Absences): number {
  return p.suspension?.games ?? 0;
}

/** Games he'll miss: his injury's games left or his suspension's, whichever is longer. */
export function gamesOut(p: Absences): number {
  return Math.max(p.injury?.gamesRemaining ?? 0, suspendedGames(p));
}

/** Out for his team's next game: hurt (with games left to miss) or suspended. */
export function isOut(p: Absences): boolean {
  return gamesOut(p) > 0;
}

/** "Suspended (1 game)", or null when he isn't. */
export function suspensionLabel(p: Absences): string | null {
  const n = suspendedGames(p);
  return n > 0 ? `Suspended (${n} game${n === 1 ? '' : 's'})` : null;
}
