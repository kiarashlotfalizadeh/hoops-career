import type { League, Tactics } from '../../core/types';

// Hands a "before" tactics snapshot from the Tactics screen to the Lab for comparison: for the league
// and team it was taken in only, and once (the Lab clears it after picking it up, so Back to an old
// Compare link, or one after a team switch, finds nothing stale to compare against).
let baseline: { tactics: Tactics; leagueId: string; tid: number; name?: string } | null = null;

/** `name`: a saved playbook's, when the snapshot is that playbook rather than the tactics from before an edit. */
export function setLabBaseline(t: Tactics, league: League, name?: string) {
  baseline = { tactics: t, leagueId: league.id, tid: league.userTid, name };
}

export function takeLabBaseline(league: League): Tactics | null {
  return baseline && baseline.leagueId === league.id && baseline.tid === league.userTid ? baseline.tactics : null;
}

/** The saved playbook the snapshot is, if it is one (read with the snapshot, before it is cleared). */
export function labBaselineName(league: League): string | null {
  return (baseline && baseline.leagueId === league.id && baseline.tid === league.userTid && baseline.name) || null;
}

/** Called once the Lab has the snapshot (after mounting: development renders twice). */
export function clearLabBaseline() {
  baseline = null;
}
