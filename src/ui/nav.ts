import { useNavigate } from 'react-router-dom';

/** Whether there's an earlier screen of this app to go back to: not after a deep link or a reload. */
export const canGoBack = () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/** Inbox links come from saves, imported backups included: follow in-app paths only (anything else goes to `fallback`). */
export const inAppPath = (path: string, fallback: string) => (/^\/(?![/\\])/.test(path) ? path : fallback);

/** Back that stays in the app: with nothing to go back to, it goes to `fallback` instead of leaving. */
export function useBack(fallback = '/') {
  const nav = useNavigate();
  return () => (canGoBack() ? nav(-1) : nav(fallback, { replace: true }));
}

// ---------------------------------------------------------------- the five tabs

/**
 * The app's sections, one per role: Today (what needs you now, the inbox, settings), Team (who
 * plays and how: roster, rotation, tactics, lineups, your players), Games (your schedule, a matchup
 * page per opponent, the live game and its reports), League (everyone else: standings, stats, teams,
 * history) and Office (the GM's desk: the cap, trades, signings, the draft, money, the owner).
 */
export type TabId = 'today' | 'team' | 'games' | 'league' | 'office';

export const TABS: { id: TabId; to: string; label: string }[] = [
  { id: 'today', to: '/', label: 'Today' },
  { id: 'team', to: '/team', label: 'Team' },
  { id: 'games', to: '/games', label: 'Games' },
  { id: 'league', to: '/league', label: 'League' },
  { id: 'office', to: '/office', label: 'Office' },
];

/** Whole path segments: /games/3 is under /games, /gameplan isn't under /game. */
const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

/**
 * The tab a screen belongs to. A player's page belongs to Team when he's on the user's team and to
 * League otherwise (`userPlayer` says which); compare goes with Team.
 */
export function tabFor(pathname: string, userPlayer?: (pid: number) => boolean): TabId {
  if (pathname === '/' || ['/inbox', '/settings', '/god'].some((p) => under(pathname, p))) return 'today';
  if (under(pathname, '/player')) {
    const pid = Number(pathname.split('/')[2]);
    return userPlayer?.(pid) ? 'team' : 'league';
  }
  if (['/team', '/compare'].some((p) => under(pathname, p))) return 'team';
  if (['/games', '/preview', '/live', '/game', '/lab'].some((p) => under(pathname, p))) return 'games';
  if (['/league', '/teams'].some((p) => under(pathname, p))) return 'league';
  if (under(pathname, '/office')) return 'office';
  return 'today';
}
