// The trade deadline as an event: a rumor a week over the last three weeks (who is listening on
// whom, and which contenders have called), a deadline-day briefing in the inbox and, the day
// after, a recap of the season's trades. Rumors draw on their own random stream, so the league's
// stream never moves for them; the rumor mill's phrasing draws on the world's (see world.ts).

import type { League, NewsItem, Player } from '../types';
import { Rng, hashString } from '../random';
import { addInbox, addNews, andList, contractSeason, curTeamSeason, playerName } from './helpers';
import { onTheBlock } from './aiTrades';
import { openProposals } from './proposals';
import { money } from '../format';
import { contractExp, playerAge, salaryFor } from '../playerGen';
import { seasonLabel } from '../constants';
import { worldRng } from './world';
import { Voice, last, list, perGame, f1 } from './media/voice';

/** Days before the deadline a rumor goes out. */
const RUMOR_DAYS = [21, 14, 7];

/** This season's trades, from the news (each executed trade is one "Trade: ..." item). */
export function seasonTrades(league: League): NewsItem[] {
  return league.news.filter((n) => n.kind === 'trade' && n.season === league.season && n.text.startsWith('Trade: '));
}

/** "The Hornets are listening on Miles Bridges; the Celtics and the Heat have called." (the story's dek) */
function rumorText(league: League, r: ReturnType<typeof onTheBlock>[number]): string {
  const p = league.players[r.pid];
  const callers = r.suitors.map((t) => `the ${league.teams[t].name}`);
  const listening = `The ${league.teams[r.tid].name} are listening on ${playerName(p)}`;
  return callers.length ? `${listening}; ${andList(callers)} have called.` : `${listening}.`;
}

/** "$24.1M through 2028-29", "an expiring $12.0M": what a team takes on with him. */
function dealText(league: League, p: Player): string {
  const s = contractSeason(league);
  const exp = contractExp(p.contract);
  const pay = money(salaryFor(p, s));
  return exp <= s ? `an expiring ${pay}` : `${pay} a year through ${seasonLabel(exp)}`;
}

/** The rumor mill's paragraph on one player: who is selling, what he is and costs, and who has called. Many ways to say it. */
function rumorParagraph(league: League, v: Voice, r: ReturnType<typeof onTheBlock>[number]): string {
  const p = league.players[r.pid];
  const t = league.teams[r.tid];
  const L = last(league, p);
  const ts = curTeamSeason(league, r.tid);
  const callers = r.suitors.map((x) => `the ${league.teams[x].name}`);
  const pg = perGame(p, league.season);
  const who = `${playerName(p)} (${playerAge(p, league.season)}, ${p.pos})`;
  const line = pg && pg.gp >= 5 ? `${f1(pg.pts)} points a game` : `${p.ovr} OVR`;
  const open = v.say('rumor-open', [
    `The ${t.name} (${ts.won}-${ts.lost}) are taking calls on ${who}.`,
    `${who} is available, and the ${t.name} aren't hiding it.`,
    `Word around the league: the ${t.name} would move ${who} for the right price.`,
    `At ${ts.won}-${ts.lost}, the ${t.name} have made ${who} available.`,
    `The ${t.name} have started listening on ${who}.`,
  ]);
  const what = v.say('rumor-what', [
    `He's putting up ${line} on ${dealText(league, p)}.`,
    `${L}: ${line}, ${dealText(league, p)}.`,
    `Whoever gets him takes on ${dealText(league, p)} for ${line}.`,
  ]);
  const calls = callers.length
    ? v
        .say('rumor-calls', [
          `${list(callers)} ${callers.length > 1 ? 'have' : 'has'} called.`,
          `${list(callers)} ${callers.length > 1 ? 'are' : 'is'} among the teams to check in.`,
          `Expect ${list(callers)} to keep calling.`,
          `The interest so far: ${list(callers)}.`,
        ])
        .replace(/^the /, 'The ')
    : v.say('rumor-none', [`Nobody has bitten yet.`, `No serious offers so far.`, `The phones have been quiet.`]);
  return `${open} ${what} ${calls}`;
}

/** Called each regular-season day, once the date has moved on. */
export function deadlineDay(league: League) {
  if (league.phase !== 'regular') return;
  const left = league.tradeDeadlineDay - league.day;
  if (RUMOR_DAYS.includes(left)) postRumors(league);
  else if (left === 0) deadlineBriefing(league);
  else if (left === -1) deadlineRecap(league);
}

/**
 * The week's talk: two of the best six players teams are shopping, drawn among those not in the
 * rumors yet this season (once all have been, any of them), the ones contenders have called about
 * first.
 */
function postRumors(league: League) {
  const block = onTheBlock(league, 6);
  if (!block.length) return;
  const before = new Set(league.news.filter((n) => n.kind === 'rumor' && n.season === league.season).flatMap((n) => n.pids));
  const fresh = block.filter((r) => !before.has(r.pid));
  const rng = new Rng(hashString(`${league.id}:${league.season}:${league.day}:rumors`));
  const told = rng
    .shuffle(fresh.length ? fresh : block)
    .sort((a, b) => Number(b.suitors.length > 0) - Number(a.suitors.length > 0))
    .slice(0, 2);
  // the press's telling, on a stream of its own (the choice above is the rumors' own, as it always was)
  const v = new Voice(worldRng(league, 'rumors', league.season, league.day), (league.media ??= {}));
  const lead = told[0];
  const L = last(league, league.players[lead.pid]);
  const left = league.tradeDeadlineDay - league.day;
  const head = v.say('rumor-head', [
    `Rumor mill: ${L} on the block`,
    `The ${league.teams[lead.tid].name} are shopping ${L}`,
    `${left} days to the deadline, and ${L} is available`,
    `Deadline watch: who wants ${L}?`,
    `${L}'s name is out there`,
  ]);
  addNews(league, {
    kind: 'rumor',
    head,
    text: told.map((r) => rumorText(league, r)).join(' '),
    body: [...told.map((r) => rumorParagraph(league, v, r)), `The deadline is ${left === 7 ? 'a week' : `${left} days`} away.`].join('\n\n'),
    tids: [...new Set(told.flatMap((r) => [r.tid, ...r.suitors]))],
    pids: told.map((r) => r.pid),
    weight: told.some((r) => r.suitors.includes(league.userTid)) || told.some((r) => league.players[r.pid].ovr >= 80) ? 2 : 1,
  });
}

/** Deadline day: who is on the block, the offers waiting for the user (then the mail stops a sim), and the trades so far. */
function deadlineBriefing(league: League) {
  const block = onTheBlock(league, 3);
  const offers = openProposals(league).length;
  const trades = seasonTrades(league).length;
  const lines = [
    'Today is the trade deadline: deals have to be done by the end of the day. After that, only free agents can be added until the summer.',
    block.length ? `On the block: ${andList(block.map((r) => `${playerName(league.players[r.pid])} (${league.teams[r.tid].abbrev}, ${league.players[r.pid].ovr})`))}.` : '',
    offers ? `You have ${offers} trade offer${offers > 1 ? 's' : ''} waiting.` : '',
    `${trades === 0 ? 'No trades' : trades === 1 ? 'One trade' : `${trades} trades`} so far this season.`,
  ];
  addInbox(league, {
    // (with offers waiting, a long sim stops on deadline day: after it they're gone)
    important: offers > 0,
    from: 'Assistant GM',
    subject: 'Deadline day',
    body: lines.filter(Boolean).join('\n'),
    tone: 'alert',
    link: offers ? '/office/trade?tab=offers' : '/office/trade',
  });
}

/** The day after: how many deals, and the biggest (the one moving the best player), in the news and the inbox. Once a season. */
function deadlineRecap(league: League) {
  if (league.news.some((n) => n.season === league.season && n.text.startsWith('Trade deadline recap'))) return;
  const trades = seasonTrades(league);
  const best = (n: NewsItem) => Math.max(0, ...n.pids.map((pid) => league.players[pid]?.ovr ?? 0));
  const biggest = [...trades].sort((a, b) => best(b) - best(a) || a.id - b.id)[0];
  const count = trades.length === 0 ? 'no trades' : trades.length === 1 ? 'one trade' : `${trades.length} trades`;
  const text = `Trade deadline recap: ${count} this season.${biggest && trades.length > 1 ? ` The biggest: ${biggest.text.replace(/^Trade: /, '')}` : ''}`;
  const mineN = trades.filter((n) => n.tids.includes(league.userTid)).length;
  const head =
    trades.length === 0
      ? 'A quiet deadline: no trades this season'
      : mineN
        ? `The deadline passes: ${count} around the league, ${mineN === 1 ? 'one' : mineN} by the ${league.teams[league.userTid].name}`
        : `The deadline passes with ${count}`;
  addNews(league, { kind: 'trade', head, text, tids: biggest?.tids ?? [], pids: biggest?.pids ?? [], weight: mineN ? 2 : 1 });
  const mine = trades.filter((n) => n.tids.includes(league.userTid)).length;
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Deadline recap',
    body: `The deadline has passed with ${count} around the league${mine ? ` (${trades.length === 1 ? 'ours' : `${mine} of them ours`})` : ''}.${biggest ? `\n${trades.length > 1 ? 'The biggest' : 'The deal'}: ${biggest.text.replace(/^Trade: /, '')}` : ''}\nFrom here, only free agents can be added.`,
    tone: 'neutral',
    link: '/league/news?kind=trade',
  });
}
