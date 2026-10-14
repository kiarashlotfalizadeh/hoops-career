// The trade deadline as an event: a rumor a week over the last three weeks (who is listening on
// whom, and which contenders have called), a deadline-day briefing in the inbox and, the day
// after, a recap of the season's trades. Rumors draw on their own random stream, so the league's
// stream never moves for them.

import type { League, NewsItem } from '../types';
import { Rng, hashString } from '../random';
import { addInbox, addNews, andList, playerName } from './helpers';
import { onTheBlock } from './trades';
import { openProposals } from './proposals';

/** Days before the deadline a rumor goes out. */
const RUMOR_DAYS = [21, 14, 7];

/** This season's trades, from the news (each executed trade is one "Trade: ..." item). */
export function seasonTrades(league: League): NewsItem[] {
  return league.news.filter((n) => n.kind === 'trade' && n.season === league.season && n.text.startsWith('Trade: '));
}

/** "CHA are listening on Miles Bridges; BOS and MIA have called." */
function rumorText(league: League, r: ReturnType<typeof onTheBlock>[number]): string {
  const p = league.players[r.pid];
  const callers = r.suitors.map((t) => league.teams[t].abbrev);
  const listening = `${league.teams[r.tid].abbrev} are listening on ${playerName(p)}${p.mood.tradeRequest ? ', who wants out' : ''}`;
  return callers.length ? `${listening}; ${andList(callers)} have called.` : `${listening}.`;
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
  addNews(league, {
    kind: 'rumor',
    text: `Rumors: ${told.map((r) => rumorText(league, r)).join(' ')}`,
    tids: [...new Set(told.flatMap((r) => [r.tid, ...r.suitors]))],
    pids: told.map((r) => r.pid),
  });
}

/** Deadline day: who is on the block, the offers waiting for the user, and the trades so far. */
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
    from: 'Assistant GM',
    subject: 'Deadline day',
    body: lines.filter(Boolean).join('\n'),
    tone: 'alert',
    link: offers ? '/trade?tab=offers' : '/trade',
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
  addNews(league, { kind: 'trade', text, tids: biggest?.tids ?? [], pids: biggest?.pids ?? [] });
  const mine = trades.filter((n) => n.tids.includes(league.userTid)).length;
  addInbox(league, {
    from: 'Assistant GM',
    subject: 'Deadline recap',
    body: `The deadline has passed with ${count} around the league${mine ? ` (${mine} of them ours)` : ''}.${biggest ? `\n${trades.length > 1 ? 'The biggest' : 'The deal'}: ${biggest.text.replace(/^Trade: /, '')}` : ''}\nFrom here, only free agents can be added.`,
    tone: 'neutral',
    link: '/league?tab=news&kind=trade',
  });
}
