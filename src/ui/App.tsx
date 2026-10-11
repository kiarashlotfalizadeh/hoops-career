import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { AlertTriangle, Bell, Briefcase, Home as HomeIcon, Play, Settings as SettingsIcon, Trophy, Users, Workflow, X } from 'lucide-react';
import { problemOf, useLeague, useStore } from '../state/store';
import { lastLeagueId, loadLeague, onBlocked, onRemoteChange, SaveConflictError, setLastLeagueId } from '../state/persistence';
import { exportLeague, exportRawSave } from '../state/backup';
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

const BLOCKED = 'Close other Hoops Career tabs or windows to finish updating your saves.';

/** Hand the user a file from a button; a cancelled share sheet is no failure. */
async function offerFile(make: () => Promise<boolean>) {
  try {
    await make();
  } catch (e) {
    console.error(e);
    useStore.getState().toast('Export failed.', 'bad');
  }
}

function Boot({ children }: { children: ReactNode }) {
  const league = useStore((s) => s.league);
  const setLeague = useStore((s) => s.setLeague);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const nav = useNavigate();
  const open = useCallback(async () => {
    const id = lastLeagueId();
    if (id && !useStore.getState().league) {
      try {
        const l = await loadLeague(id);
        // (a second, overlapping load must not swap out the league the first one opened)
        if (l && !useStore.getState().league) setLeague(l);
      } catch (e) {
        console.error(e);
        setFailed({ id, message: e instanceof Error ? e.message : String(e) });
        return;
      }
    }
    setFailed(null);
    setReady(true);
  }, [setLeague]);
  useEffect(() => {
    void open();
  }, [open]);
  useEffect(() => {
    // an older version of the app in another tab is holding the save database open
    onBlocked(() => {
      setBlocked(true);
      useStore.getState().toast(BLOCKED, 'bad');
    });
    // another window saved this league: this copy is stale, so stop autosaving it
    const off = onRemoteChange((id) => {
      if (useStore.getState().league?.id === id) useStore.setState({ saveProblem: problemOf(new SaveConflictError()) });
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') void useStore.getState().flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      onBlocked(null);
      off();
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
  const userTid = useStore((s) => s.league?.userTid);
  useEffect(() => {
    const t = league && userTid !== undefined ? league.teams[userTid] : undefined;
    applyAccent(t ? t.colors : null);
  }, [league, userTid]);
  if (failed) {
    return (
      <main className="page standalone" role="alert" style={{ paddingTop: 'max(48px, var(--safe-t))' }}>
        <div className="card col" style={{ gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle className="warn" size={28} />
          <h2>Your league could not be opened</h2>
          <div className="small dim2">It is still on this device. Try again, or keep a copy of the save as a file.</div>
          <div className="tiny dim" style={{ wordBreak: 'break-word' }}>
            {failed.message}
          </div>
          <div className="row wrap" style={{ marginTop: 4 }}>
            <button className="btn primary" onClick={() => void open()}>
              Try again
            </button>
            <button className="btn" onClick={() => void offerFile(() => exportRawSave(failed.id))}>
              Export save file
            </button>
            <button
              className="btn"
              onClick={() => {
                setLastLeagueId(null);
                setFailed(null);
                setReady(true);
                nav('/start', { replace: true });
              }}
            >
              Main menu
            </button>
          </div>
        </div>
      </main>
    );
  }
  if (!ready)
    return (
      <div className="empty" style={{ marginTop: '40vh' }}>
        Loading…{blocked && <div className="small">{BLOCKED}</div>}
      </div>
    );
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
  const { pathname } = useLocation();
  const sim = useStore((s) => s.sim);
  const v = useStore((s) => s.v);
  const t = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const unread = league.inbox.filter((m) => !m.read).length;
  // standings scans every game: recompute per league change, not per render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => statusLine(league), [league, v]);
  const actions = open ? flowActions(league, { onLive: pathname === '/live' }) : [];
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
            <NavLink key={it.to} to={it.to} className={`navitem ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={it.label}>
              <it.icon size={21} />
              <span className="nav-label">{it.label}</span>
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
  const steps = sim.total > 1;
  return (
    <div className="simbar fade-in" role="status" aria-live="polite">
      <Spinner />
      <div className="grow">
        <div className="small bold">
          {sim.label}…{sim.total > 1 ? ` day ${sim.done}` : ''}
        </div>
        <div className="bar" style={{ marginTop: 6 }}>
          {/* one-shot jobs (new season, free agency) can't be stopped midway: show them as busy */}
          <div className={steps ? '' : 'pulse'} style={{ width: steps ? `${pct}%` : '100%' }} />
        </div>
      </div>
      {steps && (
        <button className="btn sm" onClick={stop}>
          <X size={16} /> Stop
        </button>
      )}
    </div>
  );
}

/** Stays up while the league isn't safely on the device, with a way to keep it anyway. */
function SaveBanner() {
  const problem = useStore((s) => s.saveProblem);
  const league = useStore((s) => s.league);
  const [busy, setBusy] = useState(false);
  if (!problem || !league) return null;
  const conflict = problem.kind === 'conflict';
  const retry = async () => {
    setBusy(true);
    await useStore.getState().save();
    setBusy(false);
  };
  return (
    <div
      className="card tight row"
      role="alert"
      style={{
        // lined up with the page column below
        width: 'min(792px, calc(100% - max(14px, var(--safe-l)) - max(14px, var(--safe-r))))',
        margin: '8px auto 0',
        gap: 10,
        borderColor: 'var(--bad)',
        background: 'color-mix(in srgb, var(--bad) 10%, var(--surface))',
      }}
    >
      <AlertTriangle size={18} className="bad" style={{ flex: 'none' }} />
      <div className="grow small">
        <b>{conflict ? problem.text : 'Not saved.'}</b> {conflict ? 'Reload to pick it up from there. Changes made in this window since then are not kept.' : problem.text}
      </div>
      {conflict ? (
        <button className="btn xs" onClick={() => window.location.reload()}>
          Reload
        </button>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          <button className="btn xs" disabled={busy} onClick={() => void offerFile(() => exportLeague(league))}>
            Export backup
          </button>
          <button className="btn xs" disabled={busy} onClick={() => void retry()}>
            Try again
          </button>
        </div>
      )}
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
      <SaveBanner />
      <ErrorBoundary scope="screen" key={loc.pathname}>
      <Suspense fallback={<div className="empty">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/player/:pid" element={<PlayerView key={loc.pathname} />} />
          <Route path="/rotation" element={<Rotation />} />
          <Route path="/tactics" element={<Tactics />} />
          <Route path="/lab" element={<TacticsLab />} />
          {/* each visit sets up its own game: "Watch & coach live" from a finished game's card mounts a fresh one */}
          <Route path="/live" element={<Live key={loc.key} />} />
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
