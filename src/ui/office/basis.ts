// What the Office's desks count on, written once: the season new money is about (next season's from
// the draft lottery on), a team's roster spots and expiring contracts on that basis, and how a salary
// is written. No styles here, so the Team header and Today can share the desks' counts.
import type { League, Phase, Player } from '../../core/types';
import { CAP } from '../../core/constants';
import { contractExp } from '../../core/playerGen';
import { CAP_FOR, rosterMaxNow, standardRoster, teamPlayers } from '../../core/league/helpers';
import { summerRoster } from '../../core/league/contracts';
import { keepFigures, money, moneyExact } from '../../core/format';

export const OFFSEASON_PHASES: Phase[] = ['draftLottery', 'draft', 'resign', 'freeAgency'];

export const isOffseason = (l: League) => OFFSEASON_PHASES.includes(l.phase);

/** The season new contracts/trades count against: next season during the offseason. */
export const capSeason = (l: League) => (isOffseason(l) ? l.season + 1 : l.season);

/** "26-27" style short season label, for the screen (kept whole: it never breaks at its hyphen). */
export const shortSeason = (season: number) => keepFigures(`${String((season - 1) % 100).padStart(2, '0')}-${String(season % 100).padStart(2, '0')}`);

/**
 * A team's standard roster on one basis for every desk: the season its money is about (next
 * season's from the draft lottery on), so the players signed for it, and apart from them the
 * ones whose deals end before it (his rights held until free agency).
 */
export function rosterSpots(league: League, tid = league.userTid): { season: number; signed: number; expiring: number } {
  const season = capSeason(league);
  const all = standardRoster(league, tid);
  const signed = all.filter((p) => contractExp(p.contract) >= season).length;
  return { season, signed, expiring: all.length - signed };
}

/**
 * What a roster count says beside its figure, most pressing first: to cut, open or full, the offseason's
 * camp (the 21 a team may carry until opening night, pending offers holding theirs, see
 * summerRoster: a team at 15 can still sign until it's full), the expiring deals.
 */
function rosterParts(league: League, r: ReturnType<typeof rosterSpots>, tid: number): { status: string; max: string; expiring: string } {
  const over = r.signed - CAP.rosterMax;
  const max = rosterMaxNow(league);
  const off = isOffseason(league) && max > CAP.rosterMax;
  // (the camp counts what's held for next season: in the re-sign period the expiring deals aren't in it yet)
  const camp = off ? summerRoster(league, tid) : 0;
  const campLeft = max - camp;
  return {
    // the 15 is opening night's: in the offseason it's a target, not a wall
    status: off
      ? over > 0
        ? `${over} to cut by opening night`
        : over === 0
          ? '15 for opening night'
          : `${-over} open`
      : over > 0
        ? `${over} to cut`
        : over === 0
          ? 'full'
          : `${-over} open`,
    max: off ? (campLeft > 0 ? `${campLeft} camp spot${campLeft === 1 ? '' : 's'} left of ${max}` : `camp full at ${max}`) : '',
    expiring: r.expiring ? `+${r.expiring} expiring` : '',
  };
}

/**
 * Roster spots as every desk counts them (see rosterSpots), against the 15 of opening night: "15/15"
 * over what's most pressing in a figure's short line ("1 to cut", "+3 expiring", "full").
 */
export function rosterFig(league: League, tid = league.userTid): { k: string; v: string; s: string; color?: string } {
  const r = rosterSpots(league, tid);
  const n = r.signed;
  const over = n - CAP.rosterMax;
  const p = rosterParts(league, r, tid);
  return {
    k: isOffseason(league) ? `Roster ${shortSeason(r.season)}` : 'Roster',
    v: `${n}/${CAP.rosterMax}`,
    // (short of the 13 only matters in season: the offseason fills it)
    color: n + r.expiring > rosterMaxNow(league) ? 'var(--bad)' : over > 0 || (n < CAP.rosterMin && !isOffseason(league)) ? 'var(--warn)' : undefined,
    s: over > 0 || p.max ? [p.status, p.max].filter(Boolean).join(' · ') : p.expiring || p.status,
  };
}

/**
 * The roster count in a line, everything said, as a header has room for: "Roster 27-28 12/15 · 3 open ·
 * +3 expiring" (`label` false leaves the label out). The figure's basis is rosterSpots.
 */
export function rosterLine(league: League, tid = league.userTid, label = true): string {
  const f = rosterFig(league, tid);
  const p = rosterParts(league, rosterSpots(league, tid), tid);
  return `${label ? `${f.k} ` : ''}${[f.v, p.status, p.max, p.expiring].filter(Boolean).join(' · ')}`;
}

/**
 * The contracts up after a season, as the Re-sign desk lists them: this
 * season's until the re-sign period opens, then the next.
 */
export function contractsUp(league: League, tid = league.userTid): { season: number; players: Player[] } {
  const season = league.phase === 'draftLottery' || league.phase === 'draft' ? league.season : capSeason(league);
  return { season, players: teamPlayers(league, tid).filter((p) => contractExp(p.contract) === season) };
}

/**
 * A salary as the desks write it: to the $0.1M, a minimum (anything up to the veteran minimum) to
 * the $10K, so the same minimum reads the same in a header and a row.
 */
export const salaryText = (league: League, k: number) => (k <= CAP_FOR(league, capSeason(league)).vetMin ? moneyExact(k) : money(k));
