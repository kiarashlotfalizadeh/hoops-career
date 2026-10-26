// The weight of time on Today: in the preseason, one kicker over the season ("Year 7 with the
// Thunder") and a line or two of what the years have added up to ("Two titles, one Finals loss.
// Defending champions. The core is 31."), from the user's own seasons and, in a real league, the
// franchise's past. Year 1 reads the franchise's history instead; a quiet stretch says as little.
// Read from the league as it stands; nothing here draws from any random stream.
import type { League } from '../../types';
import { seasonLabel } from '../../constants';
import { playerAge } from '../../playerGen';
import { teamPlayers } from '../helpers';
import { coachCareer, openStint, userCoach } from '../coaches';
import { WIN_MARKS } from '../legacy';
import { countWord, titleLine } from './history';
import { defendingChampion, franchiseTitles } from './past';

export interface Tenure {
  /** "Year 7 with the Thunder". */
  over: string;
  /** A sentence or three: the tally, the status, what's next. */
  line: string;
  /** His titles with this team, for the banners beside it. */
  banners: number[];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** His seasons in charge of `tid` since he last took it over, and how they went (none in his first season there). */
export function tenureOf(league: League): Tenure | null {
  const me = userCoach(league);
  const stint = me ? openStint(me) : undefined;
  if (!me || !stint || league.fired || stint.tid !== league.userTid) return null;
  const tid = league.userTid;
  const team = league.teams[tid];
  const year = league.season - stint.from + 1;
  if (year < 1) return null;
  const k = coachCareer(league, me);
  const here = k.lines.filter((l) => l.tid === tid && l.season >= stint.from && l.season < league.season);
  const titles = here.filter((l) => l.round === 5).map((l) => l.season);
  const finalsLost = here.filter((l) => l.round === 4).length;
  const parts: string[] = [];
  // the tally, or in year one the franchise's past
  const champ = defendingChampion(league);
  const defending = champ && champ.tid === tid && champ.season === league.season - 1;
  if (year === 1) {
    if (defending) parts.push(`The ${team.name} are the defending champions.`);
    else if (league.past) {
      const ft = franchiseTitles(league, tid);
      if (!ft.n) parts.push('The franchise has never won a title.');
      else if (ft.last !== undefined && league.season - ft.last >= 10) parts.push(`No title since ${seasonLabel(ft.last)}.`);
      else if (ft.last !== undefined) parts.push(`Champions in ${seasonLabel(ft.last)}.`);
    }
  } else {
    const tally = [
      titles.length ? (titles.length === 1 ? 'One title' : `${cap(countWord(titles.length))} titles`) : '',
      finalsLost ? `${countWord(finalsLost)} Finals loss${finalsLost > 1 ? 'es' : ''}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    if (tally) parts.push(`${cap(tally)}.`);
    if (defending) {
      // going for a repeat, or a three-peat
      const run = titleLine(league, tid, league.season - 1);
      parts.push(run === 'back-to-back titles' ? 'Going for a three-peat.' : /peat$/.test(run ?? '') ? 'The dynasty goes on.' : 'Defending champions.');
    } else {
      // a playoff drought under him, or a rebuild
      let out = 0;
      for (let i = here.length - 1; i >= 0 && (here[i].round ?? 0) < 1; i--) out++;
      if (out >= 2) parts.push(`${cap(countWord(out))} seasons out of the playoffs.`);
    }
    // an anniversary of one of his titles here
    const ann = titles.find((s) => [5, 10, 15, 20].includes(league.season - s));
    if (ann !== undefined && parts.length < 3) parts.push(`${cap(countWord(league.season - ann))} years since the ${seasonLabel(ann)} title.`);
  }
  // the core's age: the five best, when it says something (old or young)
  const core = teamPlayers(league, tid)
    .filter((p) => !p.contract.twoWay)
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 5);
  if (core.length === 5 && parts.length < 3) {
    const age = Math.round(core.reduce((a, p) => a + playerAge(p, league.season), 0) / 5);
    if (age >= 30) parts.push(`The core is ${age}.`);
    else if (age <= 24) parts.push(`The core is ${age}.`);
  }
  // the next career milestone, when this season can reach it
  const next = WIN_MARKS.find((m) => m > k.won);
  if (next !== undefined && next >= 100 && next - k.won <= 60 && parts.length < 3) parts.push(`${next} wins: ${next - k.won} to go.`);
  if (!parts.length) return null;
  return { over: `Year ${year} with the ${team.name}`, line: parts.join(' '), banners: titles };
}
