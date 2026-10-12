import type { League, Tactics } from '../../core/types';

// Hands a "before" tactics snapshot from the Tactics screen to the Lab for comparison: for the league
// and team it was taken in only, and once (the Lab clears it after picking it up, so Back to an old
// Compare link, or one after a team switch, finds nothing stale to compare against).
let baseline: { tactics: Tactics; leagueId: string; tid: number } | null = null;

export function setLabBaseline(t: Tactics, league: League) {
  baseline = { tactics: t, leagueId: league.id, tid: league.userTid };
}

export function takeLabBaseline(league: League): Tactics | null {
  return baseline && baseline.leagueId === league.id && baseline.tid === league.userTid ? baseline.tactics : null;
}

/** Called once the Lab has the snapshot (after mounting: development renders twice). */
export function clearLabBaseline() {
  baseline = null;
}
