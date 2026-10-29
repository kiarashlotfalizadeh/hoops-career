// Opening night's predictions: every team's projected wins and conference rank from the season
// forecast (analysis/odds.ts, the same numbers the Odds screen shows), the pick to win it all and
// the MVP favourites, kept for the season (the columns and the career's "vs expectations" read
// them), then a front-page preview of the user's season and a preview of the league's.
import type { League, Player } from '../../types';
import { forecast, pct, type TeamOdds } from '../../analysis/odds';
import { seasonLabel } from '../../constants';
import { playerAge } from '../../playerGen';
import { playerName } from '../helpers';
import { worldRng } from '../world';
import type { MediaState } from '../media';
import { Voice, confName, f1, list, nth, perGame, poss, publish, rosters } from './voice';
import { defendingChampion } from './past';

/** Simulated seasons behind the predictions: once a season, so a sharper read is affordable. */
const PRESEASON_SIMS = 500;

type Preseason = NonNullable<MediaState['preseason']>;

/** The predictions from the season forecast: wins, conference ranks, the title pick and three MVP favourites. */
export function predict(league: League): { pre: Preseason; odds: TeamOdds[] } | null {
  const f = forecast(league, { sims: PRESEASON_SIMS });
  if (!f) return null;
  const rows = league.teams.map((t) => ({ tid: t.tid, wins: Math.round(f.teams[t.tid].w), confRank: 0 }));
  for (const conf of ['E', 'W'] as const) {
    const inConf = league.teams.filter((t) => t.conf === conf).map((t) => t.tid);
    inConf.sort((a, b) => f.teams[b].w - f.teams[a].w || a - b).forEach((tid, i) => (rows[tid].confRank = i + 1));
  }
  const champ = [...f.teams].sort((a, b) => b.reach[4] - a.reach[4] || a.tid - b.tid)[0]?.tid;
  // MVP favourites: the best players, on the teams expected to win (voters want a contender)
  const mvp = Object.values(league.players)
    .filter((p) => p.tid >= 0 && p.tid < league.teams.length)
    .map((p) => ({ p, s: p.ovr + (f.teams[p.tid].w - 41) * 0.18 }))
    .sort((a, b) => b.s - a.s || a.p.pid - b.p.pid)
    .slice(0, 3)
    .map((x) => x.p.pid);
  return { pre: { season: league.season, rows, champ, mvp }, odds: f.teams };
}

/** Where a projection puts a team, in the press's words. */
function tier(rank: number, title: number): 'favourite' | 'contender' | 'playoff' | 'bubble' | 'lottery' {
  if (title >= 0.15) return 'favourite';
  if (rank <= 3) return 'contender';
  if (rank <= 6) return 'playoff';
  if (rank <= 10) return 'bubble';
  return 'lottery';
}

/** Opening night: the predictions, the user's preview on the front page and the league's preview. */
export function seasonPreview(league: League, m: MediaState) {
  const got = predict(league);
  if (!got) return;
  const { pre, odds } = got;
  m.preseason = pre;
  const v = new Voice(worldRng(league, 'preseason', league.season), m);
  const rost = rosters(league);
  userPreview(league, v, pre, odds, rost);
  leaguePreview(league, v, pre, odds);
}

function userPreview(league: League, v: Voice, pre: Preseason, odds: TeamOdds[], rost: Player[][]) {
  const tid = league.userTid;
  const t = league.teams[tid];
  const N = t.name;
  const row = pre.rows[tid];
  const o = odds[tid];
  const conf = confName(t.conf);
  const tr = tier(row.confRank, o.reach[4]);
  const head =
    tr === 'favourite'
      ? v.say('pre-fav', [`The pick is the ${N}: ${row.wins} wins and a title`, `The ${N} open as the team to beat`, `Title or bust: the ${N} are the favourites`])
      : tr === 'contender'
        ? v.say('pre-con', [
            `The ${N} are picked to finish ${nth(row.confRank)} in the ${conf}`,
            `A contender's season: the ${N} projected for ${row.wins} wins`,
            `The ${N} open among the ${poss(conf)} best`,
          ])
        : tr === 'playoff'
          ? v.say('pre-po', [
              `The ${N} are projected for ${row.wins} wins and a playoff place`,
              `Playoffs expected: the ${N} picked ${nth(row.confRank)} in the ${conf}`,
              `The ${poss(N)} bar: ${row.wins} wins and a series`,
            ])
          : tr === 'bubble'
            ? v.say('pre-bub', [
                `On the bubble: the ${N} are picked ${nth(row.confRank)} in the ${conf}`,
                `The ${N} are projected for the play-in`,
                `${row.wins} wins and a fight for the play-in: the ${poss(N)} season`,
              ])
            : v.say('pre-lot', [
                `The ${N} are picked to miss the playoffs`,
                `A long season ahead: the ${N} projected for ${row.wins} wins`,
                `The ${N} open in the lottery, by the projections`,
              ]);
  const dek = `The projections have the ${N} at ${row.wins}-${82 - row.wins}, ${nth(row.confRank)} in the ${conf}. Their chances: ${pct(o.reach[0])} to make the playoffs, ${pct(o.reach[4])} to win the title.`;
  const roster = rost[tid];
  const star = roster[0];
  const newcomers = roster.filter((p) => p.joinedSeason === league.season && p.draft.year !== league.season - 1).slice(0, 2);
  const rookies = roster.filter((p) => p.draft.year === league.season - 1).slice(0, 1);
  const young = roster.filter((p) => playerAge(p, league.season) <= 23 && p.pot - p.ovr >= 8).sort((a, b) => b.pot - a.pot)[0];
  const last = t.seasons.find((s) => s.season === league.season - 1);
  const pg = star ? perGame(star, league.season - 1) : null;
  const body = [
    `The range runs from ${o.lo} to ${o.hi} wins.${last ? ` Last season they won ${last.won}${row.wins > last.won + 3 ? ', so more is expected' : row.wins < last.won - 3 ? ', and the projections expect a step back' : ''}.` : ''}`,
    star
      ? `It starts with ${playerName(star)}${pg ? `, ${f1(pg.pts)} points a game last season` : ''}${roster[1] ? `, and ${playerName(roster[1])}` : ''}.${
          newcomers.length ? ` New this season: ${list(newcomers.map(playerName))}.` : ''
        }${rookies.length ? ` The rookie to watch: ${playerName(rookies[0])}.` : ''}`
      : '',
    young && young !== rookies[0]
      ? v.say('pre-young', [
          `The question nobody can answer yet: how far ${playerName(young)} (${playerAge(young, league.season)}) comes this year.`,
          `Keep an eye on ${playerName(young)}: ${playerAge(young, league.season)}, with plenty of room to grow.`,
        ])
      : '',
    pre.champ === tid
      ? `They are the press's pick to win the title.`
      : pre.champ !== undefined
        ? `The title pick: the ${league.teams[pre.champ].region} ${league.teams[pre.champ].name}.`
        : '',
  ];
  publish(league, { kind: 'preview', head, dek, body, tids: [tid], pids: [star, ...newcomers].filter(Boolean).map((p) => p!.pid), weight: 3 });
}

function leaguePreview(league: League, v: Voice, pre: Preseason, odds: TeamOdds[]) {
  const C = pre.champ !== undefined ? league.teams[pre.champ] : undefined;
  const head = C
    ? v.say('pre-league', [
        `Season preview: the ${C.name} are the pick`,
        `${seasonLabel(league.season)} preview: everyone is chasing the ${C.name}`,
        `The ${C.name} open as everyone's pick`,
      ])
    : `${seasonLabel(league.season)} season preview`;
  const top = (conf: 'E' | 'W') =>
    pre.rows
      .filter((r) => league.teams[r.tid].conf === conf)
      .sort((a, b) => a.confRank - b.confRank)
      .slice(0, 6)
      .map((r) => `${r.confRank}. ${league.teams[r.tid].name} (${r.wins})`)
      .join(', ');
  const mvp = (pre.mvp ?? []).map((pid) => league.players[pid]).filter(Boolean);
  const dek = `${C ? `The ${C.region} ${C.name} open with a ${pct(odds[C.tid].reach[4])} chance at the title. ` : ''}${mvp.length ? `MVP favourites: ${list(mvp.map(playerName))}.` : ''}`;
  // the biggest moves on last season: the projection against last season's wins
  const moves = league.teams
    .map((t) => {
      const last = t.seasons.find((s) => s.season === league.season - 1);
      return last ? { tid: t.tid, d: pre.rows[t.tid].wins - last.won, was: last.won } : null;
    })
    .filter((x): x is { tid: number; d: number; was: number } => !!x)
    .sort((a, b) => b.d - a.d);
  const up = moves[0];
  const down = moves[moves.length - 1];
  // the champions they're chasing (a real league's first season: the NBA's last)
  const dc = defendingChampion(league);
  const body = [
    dc && dc.season === league.season - 1
      ? `The defending champions: the ${league.teams[dc.tid].name}${dc.runner >= 0 ? `, ${dc.w}-${dc.l} over the ${league.teams[dc.runner].name} in the Finals` : ''}.${dc.mvp ? ` ${dc.mvp} was Finals MVP.` : ''}`
      : '',
    `East: ${top('E')}.`,
    `West: ${top('W')}.`,
    up && up.d >= 6 ? `The biggest climb on paper: the ${league.teams[up.tid].name}, from ${up.was} wins to a projected ${pre.rows[up.tid].wins}.` : '',
    down && down.d <= -6 ? `The biggest fall: the ${league.teams[down.tid].name}, from ${down.was} to ${pre.rows[down.tid].wins}.` : '',
    `And the ${league.teams[league.userTid].name}: ${nth(pre.rows[league.userTid].confRank)} in the ${confName(league.teams[league.userTid].conf)}, ${pre.rows[league.userTid].wins} wins.`,
  ];
  publish(league, { kind: 'preview', head, dek, body, tids: C ? [C.tid] : [], pids: mvp.map((p) => p.pid), weight: 2 });
}
