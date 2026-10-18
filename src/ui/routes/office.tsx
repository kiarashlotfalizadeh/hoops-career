// Office: the GM's desk. The hub, and its desks: trade, free agents, re-signing, the draft,
// finances, the owner and the coach's career (job offers, taking over another team).
import type { ReactNode } from 'react';
import { Route, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../../state/store';
import { liveInProgress } from '../../state/live';
import { lazyRetry } from '../lazyRetry';
import { Redirect } from './Redirect';

const Office = lazyRetry(() => import('../screens/Office'));
const Trade = lazyRetry(() => import('../screens/Trade'));
const FreeAgents = lazyRetry(() => import('../screens/FreeAgents'));
const Resign = lazyRetry(() => import('../screens/Resign'));
const Draft = lazyRetry(() => import('../screens/Draft'));
const Finances = lazyRetry(() => import('../screens/Finances'));

/**
 * The front-office screens wait while they aren't the coach's to use: a fired coach's old team until he
 * takes another job, and any roster move while a live game is in progress (a player moved mid-game
 * would have his line recorded for the wrong team).
 */
export function OfficeGate({ children }: { children: ReactNode }) {
  const fired = useStore((s) => !!s.league?.fired);
  const live = useStore((s) => !!s.league && !!liveInProgress(s.league));
  const nav = useNavigate();
  if (!fired && !live) return <>{children}</>;
  return (
    <main className="page">
      <div className="card col" role="alert" style={{ gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle className={fired ? 'bad' : 'warn'} size={24} />
        <h2>{fired ? 'You were fired' : 'Finish your live game first'}</h2>
        <div className="small dim2">
          {fired
            ? "The front office isn't yours to run anymore. Take over another team to trade, sign and draft again."
            : 'Trades, signings and releases wait until the game in progress is over, so every player is counted for the team he played for.'}
        </div>
        <button className="btn primary" onClick={() => nav(fired ? '/office/career' : '/live')}>
          {fired ? 'Find a new job' : 'Back to the game'}
        </button>
      </div>
    </main>
  );
}

const gated = (el: ReactNode) => <OfficeGate>{el}</OfficeGate>;

export const officeRoutes = (
  <>
    <Route path="/office" element={gated(<Office />)} />
    <Route path="/office/trade" element={gated(<Trade />)} />
    <Route path="/office/free-agents" element={gated(<FreeAgents />)} />
    <Route path="/office/resign" element={gated(<Resign />)} />
    <Route path="/office/draft" element={gated(<Draft />)} />
    <Route path="/office/finances" element={<Finances />} />
    <Route path="/office/owner" element={<Finances />} />
    <Route path="/office/career" element={<Redirect to="/settings?sheet=switch" />} />
  </>
);
