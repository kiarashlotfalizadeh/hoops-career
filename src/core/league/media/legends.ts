// The league's legends as the press sees them off: when the Finals end and the summer's retirements
// are in, each notable retirement gets its own story with his career line (a Hall of Famer, the
// user's own player, a franchise legend whose number goes up), the rest stay a line on the wire
// ("Also retiring: ..."), and the Hall of Fame class gets a column. In the season after, the night a
// number goes up at its team's home opener is a story too ("No. 23 goes up in Cleveland"). Read from
// the league as it stands, phrased on the world's own stream (see world.ts).
import type { League, NewsItem, Player, ScheduledGame } from '../../types';
import { RETIRED } from '../../types';
import { seasonLabel } from '../../constants';
import { plural } from '../../format';
import { playerName } from '../helpers';
import { worldRng } from '../world';
import { careerOnRecord, careerTotals } from '../../analysis/milestones';
import type { MediaState } from '../media';
import { Voice, list, publish } from './voice';
import { chronicleFarewell } from './chronicle';
import { countWord, honoursWhole } from './history';

/** The award points a career is weighed by here (the Hall's own: see hallOfFameScore in season.ts). */
const AWARD_POINTS: Record<string, number> = { MVP: 12, 'Finals MVP': 6, 'Defensive Player of the Year': 4, 'All-Star': 2, Champion: 1.5 };
const awardPoints = (p: Player) => p.awards.reduce((s, a) => s + (AWARD_POINTS[a.type] ?? (a.type.startsWith('All-NBA') ? 4 : 0)), 0);

/** Seasons he played: his regular seasons with a game in them, wherever. */
const seasonsPlayed = (p: Player) => new Set(p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season)).size;

/** His teams in the order he first played for them, by tid. */
function teamsOf(p: Player): number[] {
  const out: number[] = [];
  for (const s of p.stats) if (!s.playoffs && s.gp > 0 && !out.includes(s.tid)) out.push(s.tid);
  return out;
}

/** The team he finished with: his last regular-season line's. */
const lastTeam = (p: Player) => [...p.stats].reverse().find((s) => !s.playoffs && s.gp > 0)?.tid;

/** How big a career was, for the order farewells run in: the Hall first, then honors, then production. */
function careerSize(p: Player): number {
  const c = careerTotals(p);
  return (p.hof ? 100 : 0) + awardPoints(p) + c.pts / 1000 + seasonsPlayed(p);
}

/** His honors in this league, biggest first, as a list: "two titles, an MVP and four All-Star selections". */
function honorsText(p: Player): string {
  const n = (type: string) => p.awards.filter((a) => a.type === type).length;
  const allNba = p.awards.filter((a) => a.type.startsWith('All-NBA')).length;
  const parts: string[] = [];
  const say = (k: number, one: string, many: string) => k && parts.push(k === 1 ? one : `${countWord(k)} ${many}`);
  say(n('Champion'), 'a title', 'titles');
  say(n('MVP'), 'an MVP', 'MVPs');
  say(n('Finals MVP'), 'a Finals MVP', 'Finals MVPs');
  say(n('Defensive Player of the Year'), 'a Defensive Player of the Year', 'Defensive Player of the Year awards');
  say(allNba, 'an All-NBA team', 'All-NBA teams');
  say(n('All-Star'), 'an All-Star selection', 'All-Star selections');
  return list(parts);
}

/** His best regular season by points a game (40 games or more), and its line. */
function peakSeason(p: Player): { season: number; ppg: number; tid: number } | null {
  let best: { season: number; ppg: number; tid: number } | null = null;
  for (const s of p.stats) {
    if (s.playoffs || s.gp < 40) continue;
    const ppg = s.pts / s.gp;
    if (!best || ppg > best.ppg) best = { season: s.season, ppg, tid: s.tid };
  }
  return best;
}

/** Whether a retirement is a story of its own: a Hall of Famer, the user's player of some standing, or a number going up. */
function storied(league: League, p: Player): boolean {
  if (p.hof || awardPoints(p) >= 12) return true;
  if (league.teams.some((t) => t.retired?.some((r) => r.pid === p.pid && r.season === league.season))) return true;
  return lastTeam(p) === league.userTid && (seasonsPlayed(p) >= 6 || p.ovr >= 72 || awardPoints(p) >= 4);
}

/** This summer's farewells: run once, the night the Finals end (the retirements come after the season's other news). */
export function legendFarewells(league: League, m: MediaState) {
  if (league.phase !== 'draftLottery' || m.farewell === league.season) return;
  m.farewell = league.season;
  const gone = Object.values(league.players)
    .filter((p) => p.tid === RETIRED && p.retiredSeason === league.season)
    .sort((a, b) => careerSize(b) - careerSize(a) || a.pid - b.pid);
  if (!gone.length) return;
  const told = gone.filter((p) => storied(league, p));
  told.forEach((p, i) => farewell(league, m, p, i === 0 && !!p.hof));
  wireLine(league, new Set(told.map((p) => p.pid)));
  hallOfFameClass(
    league,
    m,
    gone.filter((p) => p.hof),
  );
}

/** One retirement's story: how long, where, how good, what he won, and whose rafters his number goes to. */
function farewell(league: League, m: MediaState, p: Player, lead: boolean) {
  const v = new Voice(worldRng(league, 'farewell', p.pid), m);
  const name = playerName(p);
  const n = seasonsPlayed(p);
  const teams = teamsOf(p).filter((t) => league.teams[t]);
  const whole = careerOnRecord(league, p);
  const c = careerTotals(p);
  const mine = lastTeam(p) === league.userTid;
  const head = v.say(mine ? 'farewell-mine' : 'farewell', [
    `${name} retires after ${plural(n, 'season')}`,
    `${name} calls it a career`,
    `After ${plural(n, 'season')}, ${name} is done`,
    `${name} says goodbye after ${plural(n, 'season')}`,
  ]);
  const honors = honorsText(p);
  const pts = Math.round(c.pts).toLocaleString('en-US');
  const games = c.gp.toLocaleString('en-US');
  const dek = [
    whole ? `${pts} points in ${games} games` : `${pts} points in the ${plural(c.gp, 'game')} on record`,
    honors ? `${honors}${honoursWhole(league, p) ? '' : ' in this league'}` : '',
    p.hof ? 'Hall of Fame' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const where = teams.map((t) => league.teams[t].name);
  const peak = peakSeason(p);
  const numbers = league.teams.flatMap((t) => (t.retired ?? []).filter((r) => r.pid === p.pid && r.season === league.season).map((r) => ({ t, r })));
  const body = [
    `${name} has retired. ${where.length > 1 ? `He played for the ${list(where)}` : where.length ? `He spent his whole career with the ${where[0]}` : ''}${where.length ? `, ${plural(n, 'season')} in all.` : ''}`,
    peak
      ? `His best season was ${seasonLabel(peak.season)}, ${peak.ppg.toFixed(1)} points a game${league.teams[peak.tid] ? ` for the ${league.teams[peak.tid].name}` : ''}.${whole ? ` He finishes with ${pts} points, ${Math.round(c.reb).toLocaleString('en-US')} rebounds and ${Math.round(c.ast).toLocaleString('en-US')} assists.` : ''}`
      : '',
    honors ? `He leaves with ${honors}${p.stats.some((s) => s.real) ? ' won in this league' : ''}.` : '',
    numbers.length
      ? `The ${list(numbers.map((x) => x.t.name))} will retire his No. ${[...new Set(numbers.map((x) => x.r.jersey))].join(' and No. ')}${numbers.length === 1 ? ': it goes up at their home opener' : ', each at its home opener'}.`
      : '',
    p.hof ? `He goes into the Hall of Fame with this year's class.` : '',
  ].filter(Boolean);
  const n0 = publish(league, {
    kind: 'retire',
    head,
    dek,
    body,
    // (his last team first, then the franchises that retire his number)
    tids: [...new Set([lastTeam(p), ...numbers.map((x) => x.t.tid)].filter((t): t is number => t !== undefined && !!league.teams[t]))],
    pids: [p.pid],
    // the front page: the summer's biggest legend, a number going up for the user's franchise, or
    // his own player of note (an honor, or ten seasons); others are a story
    weight: lead || numbers.some((x) => x.t.tid === league.userTid) || (mine && (awardPoints(p) >= 4 || n >= 10)) ? 3 : 2,
  });
  chronicleFarewell(league, n0);
}

/** The wire's line of the summer's retirements, without the ones with a story of their own ("Also retiring: ..."), or gone. */
function wireLine(league: League, told: Set<number>) {
  const PREFIX = 'Retirements: ';
  const i = league.news.findIndex((n) => n.kind === 'retire' && n.season === league.season && !n.head && n.text.startsWith(PREFIX));
  if (i < 0 || !told.size) return;
  // (the wire names them as season.ts does: "LeBron James (Hall of Fame)")
  const toldNames = new Set(
    Object.values(league.players)
      .filter((p) => told.has(p.pid))
      .map((p) => `${playerName(p)}${p.hof ? ' (Hall of Fame)' : ''}`),
  );
  const n = league.news[i];
  const text = n.text.slice(PREFIX.length).replace(/\.$/, '');
  const more = text.match(/, and (\d+) more$/);
  const rest = (more ? text.slice(0, more.index) : text).split(', ').filter((x) => !toldNames.has(x));
  if (!rest.length && !more) league.news.splice(i, 1);
  else n.text = `Also retiring: ${rest.join(', ')}${more ? `${rest.length ? ',' : ''} and ${more[1]} more` : ''}.`;
}

/** The Hall of Fame class: everyone the Hall took in this summer, a line each. */
function hallOfFameClass(league: League, m: MediaState, inducted: Player[]) {
  if (!inducted.length) return;
  const v = new Voice(worldRng(league, 'hof-class', league.season), m);
  const names = inducted.map((p) => p.lastName);
  const head =
    inducted.length === 1
      ? v.say('hof-1', [`${playerName(inducted[0])} goes into the Hall of Fame`, `The Hall of Fame's class of ${league.season}: ${playerName(inducted[0])}`])
      : v.say('hof-n', [
          `The Hall of Fame class of ${league.season}: ${list(names)}`,
          `${countWord(inducted.length).replace(/^./, (c) => c.toUpperCase())} go into the Hall of Fame`,
          `${list(names.slice(0, 2))}${inducted.length > 2 ? ' lead' : ''} the Hall of Fame's new class`,
        ]);
  const line = (p: Player) => {
    const c = careerTotals(p);
    const h = honorsText(p);
    return `${playerName(p)}: ${plural(seasonsPlayed(p), 'season')}${careerOnRecord(league, p) ? `, ${Math.round(c.pts).toLocaleString('en-US')} points` : ''}${h ? `, ${h}` : ''}.`;
  };
  publish(league, {
    kind: 'column',
    head,
    dek: inducted.length === 1 ? line(inducted[0]) : `${countWord(inducted.length).replace(/^./, (c) => c.toUpperCase())} careers, one class: ${list(inducted.map(playerName))}.`,
    body: inducted.map(line),
    tids: [...new Set(inducted.map((p) => lastTeam(p)).filter((t): t is number => t !== undefined && !!league.teams[t]))],
    pids: inducted.map((p) => p.pid),
    weight: 2,
  });
}

/**
 * A team's home opener: the numbers it retired last summer go up to the rafters before it, and the
 * press tells it ("No. 23 goes up in Cleveland"), the user's own team's on the front page.
 */
export function jerseyNight(league: League, m: MediaState, g: ScheduledGame) {
  if (g.type !== 'regular') return;
  const team = league.teams[g.home];
  const up = (team?.retired ?? []).filter((r) => r.season === league.season - 1);
  if (!up.length) return;
  // the home opener: its first home game of the regular season
  if (league.games.some((x) => x.season === league.season && x.type === 'regular' && x.home.tid === g.home && x.gid !== g.gid)) return;
  let res = undefined as (typeof league.games)[number] | undefined;
  for (let i = league.games.length - 1; i >= 0 && !res; i--) if (league.games[i].gid === g.gid) res = league.games[i];
  if (!res) return;
  const v = new Voice(worldRng(league, 'jersey-night', league.season, g.home), m);
  const won = res.home.pts > res.away.pts;
  const opp = league.teams[g.away];
  const legends = up.map((r) => ({ r, p: league.players[r.pid] }));
  const named = legends.map(({ r, p }) => `${p ? playerName(p) : r.name}'s No. ${r.jersey}`);
  const head =
    legends.length === 1
      ? v.say('jersey-1', [
          `No. ${up[0].jersey} goes up in ${team.region}`,
          `The ${team.name} retire ${named[0]}`,
          `${legends[0].p ? playerName(legends[0].p) : up[0].name}'s night in ${team.region}`,
        ])
      : `The ${team.name} retire ${list(named)}`;
  publish(league, {
    kind: 'retire',
    head,
    dek: `Before the home opener, ${list(named)} went up to the rafters. Then the ${team.name} ${won ? 'beat' : 'lost to'} the ${opp.name}, ${Math.max(res.home.pts, res.away.pts)}-${Math.min(res.home.pts, res.away.pts)}.`,
    body: legends.map(({ r, p }) =>
      p
        ? `${playerName(p)} played ${plural(new Set(p.stats.filter((s) => s.tid === g.home && !s.playoffs && s.gp > 0).map((s) => s.season)).size, 'season')} for the ${team.name}. Nobody wears No. ${r.jersey} for them again.`
        : '',
    ),
    tids: [g.home],
    pids: legends.flatMap(({ p }) => (p ? [p.pid] : [])),
    weight: g.home === league.userTid ? 3 : 2,
  });
}

/** Whether a news item is the press's farewell (a retirement story) or a jersey night, not the wire's line. */
export const isLegendStory = (n: NewsItem) => n.kind === 'retire' && !!n.head;
