// What a team's tactics are expected to be worth beside its roster: since tactics are played louder
// than life (sim/engine/feel.ts) the defense a staff runs moves a team's net rating by a point or two
// either way with the same players, and a forecast that read rosters alone was off by that much for
// the teams whose coverage fits them best and worst (Cleveland by nine wins on opening night). The
// staff's own read of each defensive playbook for a roster (coachAI's DEF_FIT, refit to what each
// measures) says how much: the playbook the team runs against the roster's average coverage, at a
// share of it (the read is not the measure, and a staff adjusts in games).
//
// A read of the league only. In the worth's own units (worth.ts), so it adds to a roster's worth.
import type { League, Player } from '../types';
import { defPresetFit, rosterProfile } from '../ai/coachAI';
import { ROSTER_NET } from './worth';

/** The share of the read's edge the forecast counts. */
export const TACTICS_SHARE = 0.6;
/** The coverages a roster's average is taken over (the zone and the press are change-ups, not what a staff would otherwise run). */
const COVERAGES = ['drop', 'switch', 'blitz', 'ice', 'hedge'];

/** A team's expected tactical edge, in worth units: its defense's read against its roster's average coverage's. */
export function tacticsWorth(league: League, tid: number, players: Player[]): number {
  const team = league.teams[tid];
  if (!team || players.length < 5) return 0;
  const fit = defPresetFit(rosterProfile(players));
  const d = team.tactics.defense;
  const mine = fit[d.scheme === 'man' ? d.pnr : 'zone'];
  if (mine === undefined) return 0;
  const avg = COVERAGES.reduce((a, k) => a + (fit[k] ?? 0), 0) / COVERAGES.length;
  // (fit points are tenths of a point a game)
  return (TACTICS_SHARE * (mine - avg)) / 10 / ROSTER_NET;
}
