// The editor's sheets for the player and team pages, loaded the first time one opens: with god mode
// off they cost those pages nothing.
import { Suspense, type ComponentProps, type ComponentType } from 'react';
import type { PlayerEditor } from './PlayerEditor';
import type { TeamEditor } from './TeamEditor';
import { lazyRetry } from '../lazyRetry';

const Player = lazyRetry(() => import('./PlayerEditor').then((m) => ({ default: m.PlayerEditor as ComponentType<object> })));
const Team = lazyRetry(() => import('./TeamEditor').then((m) => ({ default: m.TeamEditor as ComponentType<object> })));

// (each with a fallback of its own: the screen's would blank the page behind the sheet while it loads)
export const LazyPlayerEditor = (props: ComponentProps<typeof PlayerEditor>) => (
  <Suspense fallback={null}>
    <Player {...props} />
  </Suspense>
);

export const LazyTeamEditor = (props: ComponentProps<typeof TeamEditor>) => (
  <Suspense fallback={null}>
    <Team {...props} />
  </Suspense>
);
