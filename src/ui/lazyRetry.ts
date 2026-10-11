import { lazy, type ComponentType } from 'react';
import { useStore } from '../state/store';

const KEY = 'hc:chunk-reload';

/** Whether this tab already reloaded for a missing chunk. Blocked storage counts as yes, so it can't reload forever. */
function reloadedOnce(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

function markReloaded(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked (privacy settings) */
  }
}

/**
 * React.lazy that survives an app update: when an old tab asks for a screen chunk the new
 * service worker has already replaced, reload once to pick up the new build instead of
 * failing. A second failure (really offline, really missing) surfaces to the error boundary.
 */
export function lazyRetry<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const m = await load();
      markReloaded(false);
      return m;
    } catch (e) {
      if (!reloadedOnce()) {
        markReloaded(true);
        // the league's latest changes (a sim in progress included) go to the device first
        await Promise.race([useStore.getState().flush(), new Promise((r) => setTimeout(r, 2000))]);
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw e;
    }
  });
}
