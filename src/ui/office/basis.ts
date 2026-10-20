// What the Office's desks count on, written once: the season new money is about (next season's from
// the draft lottery on), a team's roster spots and expiring contracts on that basis, and how a salary
// is written. No styles here, so the Team header and Today can share the desks' counts.
import type { League, Phase, Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { contractExp } from '../../core/playerGen';
import { CAP_FOR, rosterMaxNow, standardRoster, teamPlayers, twoWayRoster } from '../../core/league/helpers';
import { money, moneyExact } from '../../core/format';

export const OFFSEASON_PHASES: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];

export const isOffseason = (l: League) => OFFSEASON_PHASES.includes(l.phase);

/** The season new contracts/trades count against: next season during the offseason. */
export const capSeason = (l: League) => (isOffseason(l) ? l.season + 1 : l.season);

/** "26-27" style short season label. */
export const shortSeason = (season: number) => `${String((season - 1) % 100).padStart(2, '0')}-${String(season % 100).padStart(2, '0')}`;

/**
 * A team's standard roster on one basis for every desk: the season its money is about (next
 * season's from the draft lottery on), so the players signed for it, and apart from them the
 * ones whose deals end before it (his rights held until free agency). Two-way deals ride outside
 * the 15.
 */
export function rosterSpots(league: League, tid = league.userTid): { season: number; signed: number; expiring: number; twoWay: number; hardship: number } {
  const season = capSeason(league);
  // (a hardship 10-day player sits beyond the 15: see tenDay.ts)
  const all = standardRoster(league, tid);
  const std = all.filter((p) => !p.contract.tenDay?.hardship);
  const signed = std.filter((p) => contractExp(p.contract) >= season).length;
  return { season, signed, expiring: std.length - signed, twoWay: twoWayRoster(league, tid).length, hardship: all.length - std.length };
}

/** What a roster count says beside its figure, most pressing first: to cut, open or full, the offseason's limit, the expiring deals, the two-ways. */
function rosterParts(league: League, r: ReturnType<typeof rosterSpots>): { status: string; max: string; expiring: string; twoWay: string; hardship: string } {
  const over = r.signed - CAP.rosterMax;
  const max = rosterMaxNow(league);
  return {
    status: over > 0 ? `${over} to cut` : over === 0 ? 'full' : `${-over} open`,
    max: r.signed + r.expiring >= max && max > CAP.rosterMax ? `${max} max` : '',
    expiring: r.expiring ? `+${r.expiring} expiring` : '',
    twoWay: r.twoWay ? `+${r.twoWay} two-way` : '',
    hardship: r.hardship ? `+${r.hardship} hardship` : '',
  };
}

/**
 * Roster spots as every desk counts them (see rosterSpots), against the 15 of opening night: "15/15"
 * over what's most pressing in a figure's short line ("1 to cut", "+3 expiring", "full · +1 two-way",
 * "full · +1 hardship").
 */
export function rosterFig(league: League, tid = league.userTid): { k: string; v: string; s: string; color?: string } {
  const r = rosterSpots(league, tid);
  const n = r.signed;
  const over = n - CAP.rosterMax;
  const p = rosterParts(league, r);
  return {
    k: isOffseason(league) ? `Roster ${shortSeason(r.season)}` : 'Roster',
    v: `${n}/${CAP.rosterMax}`,
    // (short of the 13 only matters in season: the offseason fills it)
    color: n + r.expiring > rosterMaxNow(league) ? 'var(--bad)' : over > 0 || (n < CAP.rosterMin && !isOffseason(league)) ? 'var(--warn)' : undefined,
    s: over > 0 ? [p.status, p.max].filter(Boolean).join(' · ') : p.expiring || [p.status, p.hardship || p.twoWay].filter(Boolean).join(' · '),
  };
}

/**
 * The roster count in a line, everything said, as a header has room for: "Roster 27-28 12/15 · 3 open ·
 * +3 expiring · +1 two-way" (`label` false leaves the label out). The figure's basis is rosterSpots.
 */
export function rosterLine(league: League, tid = league.userTid, label = true): string {
  const f = rosterFig(league, tid);
  const p = rosterParts(league, rosterSpots(league, tid));
  return `${label ? `${f.k} ` : ''}${[f.v, p.status, p.max, p.expiring, p.hardship, p.twoWay].filter(Boolean).join(' · ')}`;
}

/**
 * The contracts up after a season, as the Re-sign desk lists them (two-ways included): this
 * season's until the re-sign period opens, then the next.
 */
export function contractsUp(league: League, tid = league.userTid): { season: number; players: Player[] } {
  const season = league.phase === 'draftLottery' || league.phase === 'draft' ? league.season : capSeason(league);
  return { season, players: teamPlayers(league, tid).filter((p) => contractExp(p.contract) === season) };
}

/**
 * A salary as the desks write it: to the $0.1M, a minimum (anything up to the veteran minimum, two-way
 * and 10-day pay too) to the $10K, so the same minimum reads the same in a header and a row.
 */
export const salaryText = (league: League, k: number) => (k <= CAP_FOR(league, capSeason(league)).vetMin ? moneyExact(k) : money(k));
