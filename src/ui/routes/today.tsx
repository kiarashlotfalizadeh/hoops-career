// Today: what needs you now, the inbox, settings and god mode.
import { Route } from 'react-router-dom';
import { lazyRetry } from '../lazyRetry';

const Home = lazyRetry(() => import('../screens/Home'));
const Inbox = lazyRetry(() => import('../screens/Inbox'));
const Settings = lazyRetry(() => import('../screens/Settings'));
const GodMode = lazyRetry(() => import('../screens/GodMode'));

export const todayRoutes = (
  <>
    <Route path="/" element={<Home />} />
    <Route path="/inbox" element={<Inbox />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/god" element={<GodMode />} />
  </>
);
