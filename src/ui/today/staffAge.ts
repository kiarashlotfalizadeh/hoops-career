// "From your staff" on Today keeps moving: a card that has sat there STALE_DAYS without being acted
// on gives way to newer ones and lives on in All advice; cards about the days just ahead (tonight's
// opponent, a player's wear) come first; and an extension doesn't sit there all season (it's in All
// advice, and on the player's page). When a card was first shown is kept per viewer and league (in
// the browser's storage: a convenience, so a private window just sees every card fresh), and a card
// that leaves the feed (acted on) is forgotten, so it's new again if it comes back.
import type { AssistantCard } from '../../core/ai/assistant';

/** Days a card stays on Today without being acted on. */
export const STALE_DAYS = 7;

/** A day on one line across seasons: a card from last season is stale. */
export const dayStamp = (season: number, day: number) => season * 1000 + day;

/** Cards about the days just ahead: tonight's opponent, a player's minutes and wear. */
const soon = (c: AssistantCard) => c.area === 'games' || c.id.startsWith('alert:wear-') || c.id === 'alert:star-min';

/**
 * Today's staff cards from the feed (most urgent first), given when each was first shown (`seen`,
 * by id): the ones shown under STALE_DAYS ago or never, the days just ahead first, no extension.
 */
export function freshAdvice(feed: AssistantCard[], seen: Record<string, number>, now: number): AssistantCard[] {
  return feed.filter((c) => !c.id.startsWith('extend:') && !(seen[c.id] !== undefined && now - seen[c.id] >= STALE_DAYS)).sort((a, b) => Number(soon(b)) - Number(soon(a)));
}

const key = (leagueId: string) => `hc:staffSeen:${leagueId}`;

/** When each card was first shown on Today (empty when the browser keeps nothing). */
export function readSeen(leagueId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(key(leagueId));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Note the cards shown now (`shown`), keeping only those still in the feed (`feed`). */
export function noteSeen(leagueId: string, shown: string[], feed: string[], now: number) {
  const seen = readSeen(leagueId);
  const live = new Set(feed);
  const next: Record<string, number> = {};
  for (const id of Object.keys(seen)) if (live.has(id)) next[id] = seen[id];
  for (const id of shown) next[id] ??= now;
  try {
    localStorage.setItem(key(leagueId), JSON.stringify(next));
  } catch {
    // (a private window: every card is fresh)
  }
}
