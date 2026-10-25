// The weekly power rankings: all 30 teams ordered by how good they are now (the season's net rating
// regressed toward what the healthy roster is worth, with the record and the last ten on top), each
// with a line of its own: the record and form, the net rating, a streak, a key injury, its star,
// and how far it moved. The headline leads with the user's team when it moved or sits high.
import type { League, Player } from '../../types';
import { injuryName } from '../../format';
import { worldRng } from '../world';
import type { MediaState, PowerRow } from '../media';
import { Voice, f1, last, lastTen, netOf, nth, perGame, poss, publish, recOf, rosters, signed, tsOf } from './voice';
import { strengths } from './strength';

/** The day's power score of every team: strength, then the record (more as the games add up) and the last ten. */
function powerScores(league: League, rost: Player[][]): number[] {
  const str = strengths(league, rost);
  return league.teams.map((t) => {
    const ts = tsOf(league, t.tid);
    const gp = ts.won + ts.lost;
    const pct = gp ? ts.won / gp : 0.5;
    const l10 = lastTen(ts);
    const form = l10.w + l10.l ? l10.w / (l10.w + l10.l) - 0.5 : 0;
    return str[t.tid] + (pct - 0.5) * 12 * (gp / (gp + 10)) + form * 4;
  });
}

/** This week's order, best first. */
export function powerOrder(league: League, rost = rosters(league)): number[] {
  const score = powerScores(league, rost);
  return league.teams.map((t) => t.tid).sort((a, b) => score[b] - score[a] || a - b);
}

/** Net rating ranks (1 = best) of every team that has played. */
function netRanks(league: League): number[] {
  const nets = league.teams.map((t) => netOf(tsOf(league, t.tid)));
  return nets.map((n) => 1 + nets.filter((o) => o > n).length);
}

/** The press's line on one team this week: a lead on where it stands and how it moved, then one detail. */
function blurb(league: League, v: Voice, tid: number, rank: number, prev: number | undefined, roster: Player[], netRank: number): string {
  const ts = tsOf(league, tid);
  const R = recOf(ts);
  const l10 = lastTen(ts);
  const form = `${l10.w}-${l10.l} in their last ${l10.w + l10.l}`;
  const net = signed(netOf(ts));
  const move = prev !== undefined ? prev - rank : 0;
  const hurt = roster.slice(0, 3).find((p) => p.injury && p.injury.gamesRemaining >= 3);
  const star = roster
    .slice(0, 5)
    .map((p) => ({ p, pg: perGame(p, league.season) }))
    .filter((x) => x.pg && x.pg.gp >= 3)
    .sort((a, b) => b.pg!.pts - a.pg!.pts)[0];
  const streak = ts.streak;

  let lead: string;
  if (rank === 1 && prev !== 1 && prev !== undefined) lead = v.say('pw-new1', [`New No. 1. ${R}, ${form}.`, `Up to the top at ${R}.`, `${R}, and the top spot is theirs.`]);
  else if (rank === 1) lead = v.say('pw-1', [`Still the team to beat at ${R}.`, `${R} and a net rating of ${net}.`, `${R}. Nobody has caught them.`, `${R}, ${form}.`]);
  else if (move >= 3)
    lead = v.say('pw-up', [
      `Up ${move}: ${streak >= 3 ? `${streak} straight wins` : form}.`,
      `A ${move}-spot climb on a ${l10.w}-${l10.l} run.`,
      `${R}, up ${move} places.`,
      `The week's big riser: up ${move}, now ${R}.`,
    ]);
  else if (move <= -3)
    lead = v.say('pw-down', [
      `Down ${-move}: ${streak <= -3 ? `${-streak} straight losses` : form}.`,
      `A ${-move}-spot slide to ${R}.`,
      `${R}, down ${-move} places.`,
      `The week's big faller, down ${-move}.`,
    ]);
  else if (rank <= 6) lead = v.say('pw-top', [`${R}, ${form}.`, `${R} with a ${net} net rating.`, `Solid at ${R}.`, `${R}; ${nth(netRank)} in net rating.`]);
  else if (rank <= 16)
    lead = v.say('pw-mid', [
      `${R}, ${form}.`,
      `In the pack at ${R}.`,
      `${R} and a ${net} net rating.`,
      `${R}: ${move > 0 ? `up ${move}` : move < 0 ? `down ${-move}` : 'holding'}.`,
    ]);
  else if (rank <= 24) lead = v.say('pw-low', [`${R}, ${form}.`, `${R}; ${nth(netRank)} in net rating.`, `Treading water at ${R}.`, `${R} and a ${net} net rating.`]);
  else lead = v.say('pw-bottom', [`${R}, ${form}.`, `${R}. Lottery odds are the subject now.`, `${R} and ${nth(netRank)} in net rating.`, `A long season at ${R}.`]);

  let detail = '';
  if (hurt) {
    const n = hurt.injury!.gamesRemaining;
    const what = injuryName(hurt.injury!.type).toLowerCase();
    detail = v.say('pw-hurt', [
      `${last(league, hurt)} is out ${n} more games (${what}).`,
      `Without ${last(league, hurt)} (${what}) for ${n} more games.`,
      `${poss(last(league, hurt))} ${what} keeps him out ${n} more games.`,
    ]);
  } else if (Math.abs(streak) >= 4 && !lead.includes('straight')) {
    detail =
      streak > 0
        ? v.say('pw-ws', [`Winners of ${streak} straight.`, `${streak} wins in a row.`, `On a ${streak}-game win streak.`])
        : v.say('pw-ls', [`Lost ${-streak} straight.`, `${-streak} losses in a row.`, `A ${-streak}-game losing streak.`]);
  } else if (star?.pg) {
    const pg = star.pg;
    const L = last(league, star.p);
    detail = v.say('pw-star', [
      `${L} is averaging ${f1(pg.pts)} points.`,
      `${L}: ${f1(pg.pts)} points, ${f1(pg.reb)} rebounds, ${f1(pg.ast)} assists a game.`,
      `${L} leads them at ${f1(pg.pts)} a game.`,
    ]);
  } else if (ts.won + ts.lost > 0) detail = `Net rating ${net}, ${nth(netRank)} in the league.`;
  return detail ? `${lead} ${detail}` : lead;
}

/** This week's rankings, into the media state and the news. */
export function powerRankings(league: League, m: MediaState) {
  const v = new Voice(worldRng(league, 'power', league.season, league.day), m);
  const rost = rosters(league);
  const order = powerOrder(league, rost);
  const before = m.power && m.power.season === league.season ? new Map(m.power.rows.map((r) => [r.tid, r.rank])) : null;
  const nr = netRanks(league);
  const rows: PowerRow[] = order.map((tid, i) => {
    const prev = before?.get(tid);
    const ts = tsOf(league, tid);
    return { tid, rank: i + 1, ...(prev !== undefined ? { prev } : {}), blurb: blurb(league, v, tid, i + 1, prev, rost[tid], nr[tid]), w: ts.won, l: ts.lost };
  });
  m.power = { season: league.season, day: league.day, rows };

  const week = Math.max(1, Math.round(league.day / 7));
  const u = rows.find((r) => r.tid === league.userTid)!;
  const top = rows[0];
  const move = u.prev !== undefined ? u.prev - u.rank : 0;
  const UN = league.teams[u.tid].name;
  const TN = league.teams[top.tid].name;
  let head: string;
  if (u.rank === 1 && u.prev !== 1)
    head = v.say('pwh-u1', [`Power rankings: the ${UN} take over at No. 1`, `The ${UN} are No. 1 in the power rankings`, `Top of the power rankings: the ${UN}`]);
  else if (move >= 3)
    head = v.say('pwh-uup', [
      `Power rankings: the ${UN} climb to ${nth(u.rank)}`,
      `The ${UN} jump ${move} spots in the power rankings`,
      `Power rankings: ${UN} up ${move}, to No. ${u.rank}`,
    ]);
  else if (move <= -3)
    head = v.say('pwh-udown', [
      `Power rankings: the ${UN} slip to ${nth(u.rank)}`,
      `The ${UN} drop ${-move} spots in the power rankings`,
      `Power rankings: ${UN} down ${-move}, to No. ${u.rank}`,
    ]);
  else if (u.rank <= 3)
    head = v.say('pwh-uhigh', [
      `Power rankings: the ${UN} hold at No. ${u.rank}`,
      `The ${UN} stay ${nth(u.rank)} in the power rankings`,
      `Power rankings, week ${week}: ${UN} ${nth(u.rank)}`,
    ]);
  else if (top.prev !== undefined && top.prev !== 1)
    head = v.say('pwh-new1', [`Power rankings: the ${TN} take over at No. 1`, `New No. 1 in the power rankings: the ${TN}`, `The ${TN} climb to the top of the power rankings`]);
  else
    head = v.say('pwh-1', [
      `Power rankings: the ${TN} stay on top`,
      `Still No. 1: the ${TN}`,
      `Power rankings, week ${week}: the ${TN} lead again`,
      `The ${TN} remain the power rankings' No. 1`,
    ]);
  const moved = (r: PowerRow) => (r.prev === undefined ? '' : r.prev > r.rank ? ` (up ${r.prev - r.rank})` : r.prev < r.rank ? ` (down ${r.rank - r.prev})` : '');
  const dek =
    u.rank === 1
      ? `Week ${week}: the ${UN} are No. 1${moved(u)}, ahead of the ${league.teams[rows[1].tid].name}.`
      : `Week ${week}: the ${TN} lead${moved(top)}; the ${UN} are ${nth(u.rank)}${moved(u)}.`;
  const line = (r: PowerRow) => `${r.rank}. ${league.teams[r.tid].region} ${league.teams[r.tid].name} (${recOf(tsOf(league, r.tid))}). ${r.blurb}`;
  const risers = rows.filter((r) => r.prev !== undefined && r.prev - r.rank >= 3).sort((a, b) => b.prev! - b.rank - (a.prev! - a.rank));
  const fallers = rows.filter((r) => r.prev !== undefined && r.rank - r.prev >= 3).sort((a, b) => b.rank - b.prev! - (a.rank - a.prev!));
  const body = [
    rows.slice(0, 5).map(line).join('\n'),
    u.rank > 5 ? line(u) : '',
    risers.length || fallers.length
      ? [
          risers[0] && risers[0].tid !== u.tid ? `Biggest riser: the ${league.teams[risers[0].tid].name}, up ${risers[0].prev! - risers[0].rank} to ${nth(risers[0].rank)}.` : '',
          fallers[0] && fallers[0].tid !== u.tid
            ? `Biggest faller: the ${league.teams[fallers[0].tid].name}, down ${fallers[0].rank - fallers[0].prev!} to ${nth(fallers[0].rank)}.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
  ];
  // a story, never a front page: an opinion that moves every week (the user's rank shows as a figure,
  // and a slide from 11th to 16th shouldn't lead his news while he's 14-6)
  const weight = 2;
  // the team the headline is about comes first (its mark goes with the story)
  const tids = head.includes(UN) ? [u.tid, top.tid] : [top.tid, u.tid];
  return publish(league, { kind: 'power', head, dek, body, tids: [...new Set(tids)], pids: [], weight });
}
