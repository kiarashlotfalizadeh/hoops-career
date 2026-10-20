// Big moments: the events of the user's career that take the screen for a moment (a clinch, a
// series, a title, the Cup, his draft picks, a big signing, an award). Each is read from the league
// as it stands and has a stable key, so the shell can show only the ones that happen while it's open:
// whatever is already true when a league opens counts as seen.
import type { League, Player } from '../core/types';
import { confStandings } from '../core/league/standings';
import { seasonLabel } from '../core/constants';
import { money, plural } from '../core/format';

export type MomentKind = 'clinch' | 'series' | 'title' | 'cup' | 'draft' | 'signing' | 'award';

export interface Moment {
  key: string;
  kind: MomentKind;
  /** The line over the headline: when and where ("2026-27 · NBA Finals"). */
  over: string;
  /** The headline, in display capitals ("Champions"). */
  title: string;
  /** One line under it. */
  sub: string;
  /** The player it's about, for his jersey; otherwise the team's mark is shown. */
  pid?: number;
  /** Titles get confetti. */
  big?: boolean;
}

const ROUND = ['', 'First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
const NEXT = ['', 'the conference semifinals', 'the conference finals', 'the NBA Finals'];

/** A free agent this good (OVR) or this expensive (share of the cap, in $K) makes his signing a moment. */
export const BIG_SIGNING_OVR = 80;

const AWARD_NAME: Record<string, string> = {
  mvp: 'Most Valuable Player',
  finalsMvp: 'Finals MVP',
  dpoy: 'Defensive Player of the Year',
  roy: 'Rookie of the Year',
  smoy: 'Sixth Man of the Year',
  mip: 'Most Improved Player',
};
const AWARD_SHORT: Record<string, string> = { mvp: 'MVP', finalsMvp: 'Finals MVP', dpoy: 'DPOY', roy: 'Rookie of the Year', smoy: 'Sixth Man', mip: 'Most Improved' };

const name = (p: Player | undefined, fallback = '') => (p ? `${p.firstName} ${p.lastName}` : fallback);

/** Every moment the league holds for the user's team right now, oldest kinds first. */
export function currentMoments(league: League): Moment[] {
  const out: Moment[] = [];
  const me = league.userTid;
  const team = league.teams[me];
  if (!team) return out;
  const nick = team.name;
  const season = league.season;

  // a postseason spot (read into the postseason too: a long sim can clinch it in its last week and
  // end in the play-in, before the screen has looked)
  if (league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs') {
    const row = confStandings(league, team.conf).find((r) => r.tid === me);
    const conf = team.conf === 'E' ? 'Eastern Conference' : 'Western Conference';
    // a play-in spot is only news until a playoff spot is
    if (row?.clinched === 'x')
      out.push({ key: `clinch-x-${season}`, kind: 'clinch', over: `${seasonLabel(season)} · ${conf}`, title: 'Playoff bound', sub: `The ${nick} have clinched a top-six seed.` });
    else if (row?.clinched === 'p') {
      // clinching the top ten mid-season is "at least the play-in", not a play-in seed: a team
      // sitting first can clinch it in February
      const playIn = league.phase !== 'regular';
      out.push({
        key: `clinch-p-${season}`,
        kind: 'clinch',
        over: `${seasonLabel(season)} · ${conf}`,
        title: playIn ? 'In the play-in' : 'Postseason bound',
        sub: playIn ? `The ${nick} play on in the play-in.` : `The ${nick} have clinched at least a play-in spot.`,
      });
    }
  }

  for (const s of league.playoffs) {
    if (s.winner !== me) continue;
    const opp = league.teams[s.high === me ? s.low : s.high];
    const [w, l] = s.high === me ? [s.highWins, s.lowWins] : [s.lowWins, s.highWins];
    if (s.round === 4)
      out.push({
        key: `title-${season}`,
        kind: 'title',
        over: `${seasonLabel(season)} · NBA Finals`,
        title: 'Champions',
        sub: `The ${team.region} ${nick} win the title, ${w}-${l} over the ${opp?.name ?? 'field'}.`,
        big: true,
      });
    else
      out.push({
        key: `series-${season}-${s.id}`,
        kind: 'series',
        over: `${seasonLabel(season)} · ${ROUND[s.round] ?? 'Playoffs'}`,
        title: 'Series won',
        sub: `${w}-${l} over the ${opp?.name ?? 'other side'}. Next up: ${NEXT[s.round] ?? 'the next round'}.`,
      });
  }

  const aw = league.awards.find((a) => a.season === season);
  if (aw?.cupWinner === me)
    out.push({ key: `cup-${season}`, kind: 'cup', over: `${seasonLabel(season)} · NBA Cup`, title: 'Cup champions', sub: `The ${nick} lift the NBA Cup.`, big: true });
  if (aw) {
    for (const k of Object.keys(AWARD_NAME) as (keyof typeof AWARD_NAME)[]) {
      const pid = aw[k as 'mvp'];
      const p = pid !== undefined ? league.players[pid] : undefined;
      if (!p || p.tid !== me) continue;
      out.push({ key: `award-${season}-${k}`, kind: 'award', over: `${seasonLabel(season)} · ${AWARD_NAME[k]}`, title: AWARD_SHORT[k], sub: `${name(p)} takes the award.`, pid });
    }
    if (aw.coy === me)
      out.push({
        key: `award-${season}-coy`,
        kind: 'award',
        over: `${seasonLabel(season)} · Coach of the Year`,
        title: 'Coach of the Year',
        sub: `${league.coachName} is the league's best coach.`,
      });
  }

  // this season's moves: the user's first-round picks and the stars he signs (the log keeps his moves
  // for good). A second-rounder isn't a moment: three of them would take three taps on draft night
  for (const t of league.transactions ?? []) {
    if (t.season !== season || t.tids[0] !== me || t.pid === undefined) continue;
    const p = league.players[t.pid];
    if (t.kind === 'draft' && p && p.draft.round === 1) {
      const pick = p.draft.round && p.draft.pick ? `Round ${p.draft.round}, Pick ${p.draft.pick}` : 'Draft night';
      out.push({
        key: `txn-${t.id}`,
        kind: 'draft',
        over: `${p.draft.year} NBA Draft · ${pick}`,
        title: 'The pick is in',
        sub: `${name(p, t.name)}, ${p.pos}${p.college ? ` from ${p.college}` : ''}.`,
        pid: t.pid,
      });
    }
    if (t.kind === 'sign' && p && p.ovr >= BIG_SIGNING_OVR) {
      const perYear = t.amount ? `${money(t.amount)} a year` : '';
      out.push({
        key: `txn-${t.id}`,
        kind: 'signing',
        over: `${seasonLabel(season)} · Free agency`,
        title: 'Signed',
        sub: [name(p, t.name), t.years ? plural(t.years, 'year') : '', perYear].filter(Boolean).join(' · '),
        pid: t.pid,
      });
    }
  }
  return out;
}

/** The moments in `now` that weren't in `seen`, oldest first. */
export function newMoments(now: Moment[], seen: ReadonlySet<string>): Moment[] {
  return now.filter((m) => !seen.has(m.key));
}
