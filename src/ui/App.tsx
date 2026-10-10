import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Bell, Briefcase, Home as HomeIcon, Play, Settings as SettingsIcon, Trophy, Users, Workflow, X } from 'lucide-react';
import { useLeague, useStore } from '../state/store';
import { lastLeagueId, loadLeague } from '../state/persistence';
import { PHASE_LABEL, seasonLabel } from '../core/constants';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { TeamLogo } from './components/TeamLogo';
import { Sheet, Spinner } from './components/ui';
import { flowActions } from './flow';
import { useFlowRunner } from './useFlow';

const Start = lazy(() => import('./screens/Start'));
const NewLeague = lazy(() => import('./screens/NewLeague'));
const Home = lazy(() => import('./screens/Home'));
const Roster = lazy(() => import('./screens/Roster'));
const PlayerView = lazy(() => import('./screens/PlayerView'));
const Rotation = lazy(() => import('./screens/Rotation'));
const Tactics = lazy(() => import('./screens/Tactics'));
const TacticsLab = lazy(() => import('./screens/TacticsLab'));
const Live = lazy(() => import('./screens/Live'));
const GameView = lazy(() => import('./screens/GameView'));
const LeagueHub = lazy(() => import('./screens/LeagueHub'));
const TeamView = lazy(() => import('./screens/TeamView'));
const Office = lazy(() => import('./screens/Office'));
const Trade = lazy(() => import('./screens/Trade'));
const FreeAgents = lazy(() => import('./screens/FreeAgents'));
const Resign = lazy(() => import('./screens/Resign'));
const Draft = lazy(() => import('./screens/Draft'));
const Finances = lazy(() => import('./screens/Finances'));
const Inbox = lazy(() => import('./screens/Inbox'));
const Settings = lazy(() => import('./screens/Settings'));
const History = lazy(() => import('./screens/History'));

export function teamAccent(colors: [string, string, string]): string {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, s: Math.max(r, g, b) - Math.min(r, g, b) };
  };
  const cands = colors.map((c) => ({ c, ...lum(c) })).filter((x) => x.l > 0.12 && x.l < 0.8);
  cands.sort((a, b) => b.s - a.s);
  return cands[0]?.c ?? '#3b82f6';
}

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
    document.documentElement.style.setProperty('--accent', t ? teamAccent(t.colors) : '#3b82f6');
  }, [league, userTid]);
  if (!ready) return <div className="empty" style={{ marginTop: '40vh' }}>Loading…</div>;
  return <>{children}</>;
}

function TopBar() {
  const league = useLeague();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const run = useFlowRunner();
  const sim = useStore((s) => s.sim);
  const t = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const unread = league.inbox.filter((m) => !m.read).length;
  const inSeason = league.phase === 'regular' || league.phase === 'playin' || league.phase === 'playoffs';
  const actions = flowActions(league);
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button className="row" style={{ gap: 8, minWidth: 0 }} onClick={() => nav('/')} aria-label="Home">
          <TeamLogo tid={t.tid} size={34} />
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="title ellipsis">
              {t.abbrev} <span className="num">{ts.won}-{ts.lost}</span>
            </div>
            <div className="sub ellipsis">
              {seasonLabel(league.season)} · {PHASE_LABEL[league.phase]}
              {inSeason ? ` · ${fmtDate(league.season, league.day)}` : ''}
            </div>
          </div>
        </button>
        <div className="grow" />
        <button className="iconbtn" onClick={() => nav('/inbox')} aria-label="Inbox">
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

function BottomNav() {
  const items = [
    { to: '/', label: 'Home', icon: HomeIcon, end: true },
    { to: '/roster', label: 'Team', icon: Users },
    { to: '/tactics', label: 'Tactics', icon: Workflow },
    { to: '/league', label: 'League', icon: Trophy },
    { to: '/office', label: 'Office', icon: Briefcase },
  ];
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `navitem ${isActive ? 'active' : ''}`}>
            <it.icon size={21} />
            {it.label}
          </NavLink>
        ))}
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
    <div className="simbar fade-in">
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
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function ScrollTop() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return null;
}

function LeagueTabRedirect() {
  const { tab } = useParams();
  return <Navigate to={`/league?tab=${tab ?? 'standings'}`} replace />;
}

function GameShell() {
  const league = useStore((s) => s.league);
  if (!league) return <Navigate to="/start" replace />;
  return (
    <div className="app">
      <TopBar />
      <Suspense fallback={<div className="empty">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/player/:pid" element={<PlayerView />} />
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
      <SimBar />
      <BottomNav />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
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
    </HashRouter>
  );
}
