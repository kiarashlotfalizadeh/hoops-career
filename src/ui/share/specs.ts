// What each poster says, read from the league: a player's card, a game's final and a title
// (share/poster.ts draws them). The same words and figures the screens show: a player's line is
// playerSeason's, a game's headline its story's, a title's Finals the bracket's.
import type { GameResult, League, Player } from '../../core/types';
import { RETIRED } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { FRANCHISES } from '../../core/teams';
import { fmtDate, playerName, teamCity } from '../../core/league/helpers';
import { gameStoryFor } from '../../core/analysis/gameStory';
import { f1, playerSeason } from '../stats';
import { pct } from '../components/ui';
import type { GamePoster, PlayerPoster, TitlePoster } from './poster';

type Colors = [string, string, string];
const NO_TEAM: Colors = ['#2a3441', '#8a94a4', '#c4cfdc'];
const colorsOf = (league: League, tid: number): Colors => league.teams[tid]?.colors ?? FRANCHISES[tid]?.colors ?? NO_TEAM;

/** A file's name from a poster's subject: "clipboard-gm-gilgeous-alexander.png". */
export const posterFile = (subject: string) =>
  `clipboard-gm-${
    subject
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'poster'
  }.png`;

export function playerPosterOf(league: League, p: Player): PlayerPoster {
  const team = p.tid >= 0 ? league.teams[p.tid] : null;
  const cur = playerSeason(p, league.season);
  const last = cur ? league.season : Math.max(0, ...p.stats.filter((s) => !s.playoffs && s.gp > 0).map((s) => s.season));
  const line = cur ?? (last ? playerSeason(p, last) : null);
  return {
    kind: 'player',
    colors: team ? colorsOf(league, team.tid) : NO_TEAM,
    over: [p.pos, team ? `${team.region} ${team.name}` : p.tid === RETIRED ? 'Retired' : 'Free agent'].join(' · '),
    first: p.firstName,
    last: p.lastName,
    jersey: p.jersey ? String(p.jersey) : undefined,
    ovr: p.ovr,
    under: p.pot > p.ovr ? `POT ${p.pot}` : undefined,
    figs: [
      { k: 'PTS', v: line ? f1(line.pts) : '—' },
      { k: 'REB', v: line ? f1(line.reb) : '—' },
      { k: 'AST', v: line ? f1(line.ast) : '—' },
      { k: 'TS%', v: line && (line.fga || line.fta) ? pct(line.tsPct) : '—' },
    ],
    note: line ? `${seasonLabel(last)} per game` : seasonLabel(league.season),
  };
}

export function gamePosterOf(league: League, g: GameResult): GamePoster {
  const userGame = g.home.tid === league.userTid || g.away.tid === league.userTid;
  const story = userGame ? gameStoryFor(league, g.gid) : null;
  const side = (b: GameResult['home']) => {
    const t = league.teams[b.tid];
    return { abbrev: t.abbrev, name: `${t.region} ${t.name}`, colors: colorsOf(league, b.tid), score: b.pts };
  };
  const [w, l] = g.home.pts > g.away.pts ? [g.home, g.away] : [g.away, g.home];
  // (a game that isn't yours has no story of its own: its top scorer and the plain result)
  const top = [...w.players].sort((a, b) => b.pts - a.pts)[0];
  const hero = story?.hero !== undefined ? league.players[story.hero] : top ? league.players[top.pid] : undefined;
  return {
    kind: 'game',
    sides: [side(g.away), side(g.home)],
    over: ['Final', g.ot ? (g.ot > 1 ? `${g.ot}OT` : 'OT') : '', fmtDate(g.season, g.day, { weekday: 'short', month: 'short', day: 'numeric' }), story?.kicker ?? '']
      .filter(Boolean)
      .join(' · '),
    head: story?.head ?? `${teamCity(league, w.tid)} beat ${teamCity(league, l.tid)}`,
    hero: hero ? { name: playerName(hero), line: story?.heroLine ?? (top ? `${top.pts} pts · ${top.orb + top.drb} reb · ${top.ast} ast` : '') } : undefined,
    means: story?.means ?? [],
  };
}

export function titlePosterOf(league: League, season: number, tid: number, o: { runnerUp?: number; result?: string; fmvp?: number } = {}): TitlePoster {
  const t = league.teams[tid];
  const ts = t.seasons.find((s) => s.season === season);
  const mvp = o.fmvp !== undefined ? league.players[o.fmvp] : undefined;
  const beat = o.runnerUp !== undefined && league.teams[o.runnerUp] ? `def. ${league.teams[o.runnerUp].region} ${league.teams[o.runnerUp].name}` : undefined;
  return {
    kind: 'title',
    colors: colorsOf(league, tid),
    over: `${seasonLabel(season)} champions`,
    region: t.region,
    name: t.name,
    fig: o.result,
    figLabel: beat ? `${beat} in the Finals` : o.result ? 'Won the Finals' : undefined,
    lines: [
      ts ? `${ts.won}-${ts.lost} in the regular season` : '',
      mvp ? `Finals MVP ${playerName(mvp)}` : '',
      tid === league.userTid && season >= league.startSeason ? `Head coach ${league.coachName}` : '',
    ].filter(Boolean),
  };
}
