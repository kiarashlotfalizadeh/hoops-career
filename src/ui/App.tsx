import { Suspense, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { Bell, Briefcase, Home as HomeIcon, Play, Settings as SettingsIcon, Trophy, Users, Workflow, X } from 'lucide-react';
import { useLeague, useStore } from '../state/store';
import { lastLeagueId, loadLeague } from '../state/persistence';
import { PHASE_LABEL, seasonLabel } from '../core/constants';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { confStandings } from '../core/league/standings';
import type { League } from '../core/types';
import { ordinal } from './league/shared';
import { TeamLogo } from './components/TeamLogo';
import { Sheet, Spinner } from './components/ui';
import { flowActions } from './flow';
import { useFlowRunner } from './useFlow';
import { lazyRetry } from './lazyRetry';
import { ErrorBoundary } from './components/ErrorBoundary';
import { applyAccent } from './teamColors';
import { haptic } from '../native';

const Start = lazyRetry(() => import('./screens/Start'));
const NewLeague = lazyRetry(() => import('./screens/NewLeague'));
const Home = lazyRetry(() => import('./screens/Home'));
const Roster = lazyRetry(() => import('./screens/Roster'));
const PlayerView = lazyRetry(() => import('./screens/PlayerView'));
const Rotation = lazyRetry(() => import('./screens/Rotation'));
const Tactics = lazyRetry(() => import('./screens/Tactics'));
const TacticsLab = lazyRetry(() => import('./screens/TacticsLab'));
const Live = lazyRetry(() => import('./screens/Live'));
const GameView = lazyRetry(() => import('./screens/GameView'));
const LeagueHub = lazyRetry(() => import('./screens/LeagueHub'));
const TeamView = lazyRetry(() => import('./screens/TeamView'));
const Office = lazyRetry(() => import('./screens/Office'));
const Trade = lazyRetry(() => import('./screens/Trade'));
const FreeAgents = lazyRetry(() => import('./screens/FreeAgents'));
const Resign = lazyRetry(() => import('./screens/Resign'));
const Draft = lazyRetry(() => import('./screens/Draft'));
const Finances = lazyRetry(() => import('./screens/Finances'));
const Inbox = lazyRetry(() => import('./screens/Inbox'));
const Settings = lazyRetry(() => import('./screens/Settings'));
const History = lazyRetry(() => import('./screens/History'));

function Boot({ children }: { children: ReactNode }) {
  const league = useStore((s) => s.league);
  const setLeague = useStore((s) => s.setLeague);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      const id = lastLeagueId();
      if (id && !league) {
        try {
          const l = await loadLeague(id);
          if (l) setLeague(l);
        } catch (e) {
          console.error(e);
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void useStore.getState().save();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);
  const userTid = useStore((s) => s.league?.userTid);
  useEffect(() => {
    const t = league && userTid !== undefined ? league.teams[userTid] : undefined;
    applyAccent(t ? t.colors : null);
  }, [league, userTid]);
  if (!ready) return <div className="empty" style={{ marginTop: '40vh' }}>Loading…</div>;
  return <>{children}</>;
}

/** One short line under the team name: where the season stands, sized to fit a phone. */
function statusLine(league: League): string {
  const date = fmtDate(league.season, league.day);
  const t = league.teams[league.userTid];
  switch (league.phase) {
    case 'preseason':
      return `Preseason · ${seasonLabel(league.season)}`;
    case 'regular': {
      const ts = curTeamSeason(league, league.userTid);
      if (ts.won + ts.lost === 0) return `${date} · Week 1`;
      const rank = confStandings(league, t.conf).findIndex((r) => r.tid === t.tid) + 1;
      return `${date} · ${ordinal(rank)} ${t.conf === 'E' ? 'East' : 'West'}`;
    }
    case 'playin':
      return `Play-in · ${date}`;
    case 'playoffs':
      return `Playoffs · ${date}`;
    case 'draftLottery':
      return `Draft lottery · ${league.season}`;
    case 'draft':
      return `${league.season} NBA Draft`;
    case 'resign':
      return `Re-sign period · ${league.season}`;
    case 'freeAgency':
      return `Free agency · day ${league.faDay + 1}`;
    default:
      return PHASE_LABEL[league.phase] ?? '';
  }
}

function TopBar() {
  const league = useLeague();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const run = useFlowRunner();
  const sim = useStore((s) => s.sim);
  const v = useStore((s) => s.v);
  const t = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const unread = league.inbox.filter((m) => !m.read).length;
  // standings scans every game: recompute per league change, not per render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => statusLine(league), [league, v]);
  const actions = open ? flowActions(league) : [];
  return (
    <header className="topbar" data-phase={PHASE_LABEL[league.phase]}>
      <div className="topbar-inner">
        <button className="row" style={{ gap: 8, minWidth: 0 }} onClick={() => nav('/')} aria-label={`${t.region} ${t.name}, ${ts.won}-${ts.lost}, ${status}. Home`}>
          <TeamLogo tid={t.tid} size={34} />
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="title ellipsis">
              {t.abbrev} <span className="num">{ts.won}-{ts.lost}</span>
            </div>
            <div className="sub ellipsis">{status}</div>
          </div>
        </button>
        <div className="grow" />
        <button className="iconbtn" onClick={() => nav('/inbox')} aria-label={unread ? `Inbox, ${unread} unread` : 'Inbox'}>
          <Bell size={20} />
          {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label="Settings">
          <SettingsIcon size={20} />
        </button>
        <button className="btn primary sm" onClick={() => setOpen(true)} disabled={!!sim} aria-label="Play">
          <Play size={16} fill="currentColor" /> Play
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="What next?">
        <div className="col" style={{ gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.id}
              className={`btn block ${a.primary ? 'primary' : ''}`}
              style={{ height: 'auto', minHeight: 48, padding: '8px 14px', justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
              disabled={!!a.disabled}
              onClick={() => {
                setOpen(false);
                haptic();
                void run(a);
              }}
            >
              <span>{a.label}</span>
              {(a.disabled || a.sub) && <span className="small" style={{ opacity: 0.75, fontWeight: 500, whiteSpace: 'normal', textAlign: 'left' }}>{a.disabled ?? a.sub}</span>}
            </button>
          ))}
        </div>
      </Sheet>
    </header>
  );
}

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: HomeIcon, also: ['/inbox', '/settings', '/live', '/game'] },
  { to: '/roster', label: 'Team', icon: Users, also: ['/rotation', '/player'] },
  { to: '/tactics', label: 'Tactics', icon: Workflow, also: ['/lab'] },
  { to: '/league', label: 'League', icon: Trophy, also: ['/team', '/history'] },
  { to: '/office', label: 'Office', icon: Briefcase, also: ['/trade', '/free-agents', '/resign', '/draft', '/finances', '/owner'] },
];

/** Bottom tabs; sub-screens light up the section they belong to. */
function BottomNav() {
  const { pathname } = useLocation();
  const section = NAV_ITEMS.find((it) => (it.to === '/' ? pathname === '/' : pathname.startsWith(it.to))) ?? NAV_ITEMS.find((it) => it.also.some((p) => pathname.startsWith(p)));
  return (
    <nav className="bottomnav" aria-label="Main">
      <div className="bottomnav-inner">
        {NAV_ITEMS.map((it) => {
          const active = section === it;
          return (
            <NavLink key={it.to} to={it.to} className={`navitem ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
              <it.icon size={21} />
              {it.label}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function SimBar() {
  const sim = useStore((s) => s.sim);
  const stop = useStore((s) => s.stopSim);
  if (!sim) return null;
  const pct = Math.min(100, (sim.done / Math.max(1, sim.total)) * 100);
  return (
    <div className="simbar fade-in" role="status" aria-live="polite">
      <Spinner />
      <div className="grow">
        <div className="small bold">
          {sim.label}… day {sim.done}
        </div>
        <div className="bar" style={{ marginTop: 6 }}>
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button className="btn sm" onClick={stop}>
        <X size={16} /> Stop
      </button>
    </div>
  );
}

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

const scrollPositions = new Map<string, number>();

/** New screens start at the top; Back/Forward return to where you were on that screen. */
function ScrollTop() {
  const loc = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    const key = loc.key;
    const y = type === 'POP' ? scrollPositions.get(key) ?? 0 : 0;
    window.scrollTo(0, y);
    // lazy screens may render after this; try again once they have height
    const timers = y ? [60, 200, 450].map((ms) => setTimeout(() => window.scrollY < y - 2 && window.scrollTo(0, y), ms)) : [];
    return () => {
      timers.forEach(clearTimeout);
      scrollPositions.set(key, window.scrollY);
    };
  }, [loc.key, type]);
  return null;
}

function LeagueTabRedirect() {
  const { tab } = useParams();
  return <Navigate to={`/league?tab=${tab ?? 'standings'}`} replace />;
}

function GameShell() {
  const league = useStore((s) => s.league);
  const loc = useLocation();
  if (!league) return <Navigate to="/start" replace />;
  return (
    <div className="app">
      <TopBar />
      <ErrorBoundary scope="screen" key={loc.pathname}>
      <Suspense fallback={<div className="empty">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/player/:pid" element={<PlayerView key={loc.pathname} />} />
          <Route path="/rotation" element={<Rotation />} />
          <Route path="/tactics" element={<Tactics />} />
          <Route path="/lab" element={<TacticsLab />} />
          <Route path="/live" element={<Live />} />
          <Route path="/game/:gid" element={<GameView />} />
          <Route path="/league" element={<LeagueHub />} />
          <Route path="/league/:tab" element={<LeagueTabRedirect />} />
          <Route path="/team/:tid" element={<TeamView />} />
          <Route path="/office" element={<Office />} />
          <Route path="/trade" element={<Trade />} />
          <Route path="/free-agents" element={<FreeAgents />} />
          <Route path="/resign" element={<Resign />} />
          <Route path="/draft" element={<Draft />} />
          <Route path="/finances" element={<Finances />} />
          <Route path="/owner" element={<Finances />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/history" element={<History />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <SimBar />
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <ErrorBoundary>
      <ScrollTop />
      <Boot>
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/start" element={<Start />} />
            <Route path="/new" element={<NewLeague />} />
            <Route path="/*" element={<GameShell />} />
          </Routes>
        </Suspense>
        <Toasts />
      </Boot>
      </ErrorBoundary>
    </HashRouter>
  );
}
