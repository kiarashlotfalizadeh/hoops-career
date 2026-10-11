import { lazy, type ComponentType } from 'react';

const KEY = 'hc:chunk-reload';

/**
 * React.lazy that survives an app update: when an old tab asks for a screen chunk the new
 * service worker has already replaced, reload once to pick up the new build instead of
 * failing. A second failure (really offline, really missing) surfaces to the error boundary.
 */
export function lazyRetry<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const m = await load();
      sessionStorage.removeItem(KEY);
      return m;
    } catch (e) {
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw e;
    }
  });
}
