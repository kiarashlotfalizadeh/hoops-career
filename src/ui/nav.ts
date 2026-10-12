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
