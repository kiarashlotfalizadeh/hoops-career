import { Suspense, useCallback, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AlertTriangle, Bell, Briefcase, CalendarDays, ChevronRight, ChevronUp, Play, Settings as SettingsIcon, Sun, Trophy, Users, Wand2, X, type LucideIcon } from 'lucide-react';
import { problemOf, useLeague, useStore } from '../state/store';
import { lastLeagueId, loadLeague, onBlocked, onRemoteChange, SaveConflictError, setLastLeagueId } from '../state/persistence';
import { exportLeague, exportRawSave } from '../state/backup';
import { liveInProgress } from '../state/live';
import { PHASE_LABEL, seasonLabel } from '../core/constants';
import { curTeamSeason, fmtDate } from '../core/league/helpers';
import { confStandings } from '../core/league/standings';
import { faDayNumber } from '../core/league/season';
import type { League } from '../core/types';
import { ordinal } from './league/shared';
import { gamesMemo } from './stats';
import { LeagueLook, TeamLogo } from './components/TeamLogo';
import { Sheet, Spinner } from './components/ui';
import { flowActions, type FlowAction } from './flow';
import { userGameOnDay } from '../core/league/games';
import { useFlowRunner } from './useFlow';
import { lazyRetry } from './lazyRetry';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Moments } from './components/Moments';
import { applyAccent } from './teamColors';
import { haptic } from '../native';
import { TABS, tabFor, type TabId } from './nav';
import { AgendaList } from './components/Agenda';
import { todayRoutes } from './routes/today';
import { teamRoutes } from './routes/team';
import { gamesRoutes } from './routes/games';
import { leagueRoutes } from './routes/league';
import { officeRoutes } from './routes/office';
import { legacyRoutes } from './routes/legacy';

const Start = lazyRetry(() => import('./screens/Start'));
const NewLeague = lazyRetry(() => import('./screens/NewLeague'));
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
    // another window saved (or deleted) this league: this copy is stale, so stop autosaving it
    const off = onRemoteChange((id, deleted) => {
      if (useStore.getState().league?.id === id) useStore.setState({ saveProblem: problemOf(new SaveConflictError(deleted)) });
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
  // the user's team colours: a new team, or god mode recolouring this one (a new array), restyles the app
  const colors = useStore((s) => s.league?.teams[s.league.userTid]?.colors);
  useEffect(() => applyAccent(colors ?? null), [colors]);
  if (failed) {
    return (
      <main className="page standalone" role="alert" style={{ paddingTop: 'max(48px, calc(var(--safe-t) + 8px))' }}>
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

const statusLines = new WeakMap<League, { key: string; value: string }>();

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
      return `Play-In · ${date}`;
    case 'playoffs':
      return `Playoffs · ${date}`;
    case 'draftLottery':
      return `Draft Lottery · ${league.season}`;
    case 'draft':
      return `${league.season} NBA Draft`;
    case 'resign':
      return `Re-signing · ${league.season}`;
    case 'freeAgency':
      return `Free Agency · day ${faDayNumber(league)}`;
    default:
      return PHASE_LABEL[league.phase] ?? '';
  }
}

function TopBar() {
  const league = useLeague();
  const nav = useNavigate();
  const t = league.teams[league.userTid];
  const ts = curTeamSeason(league, league.userTid);
  const unread = league.inbox.filter((m) => !m.read).length;
  // the standings scan every game: worked out again when a game is played, not on every edit
  const status = gamesMemo(statusLines, league, () => statusLine(league));
  return (
    <header className="topbar" data-phase={PHASE_LABEL[league.phase]}>
      <div className="topbar-inner">
        {/* named by what it shows ("OKC 47-13 Feb 27 · 1st West"), then the team and where it goes */}
        <button className="tb-team" onClick={() => nav('/')}>
          <TeamLogo tid={t.tid} size={34} decorative />
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div className="title ellipsis">
              {t.abbrev}{' '}
              <span className="num">
                {ts.won}-{ts.lost}
              </span>
            </div>
            <div className="sub ellipsis">{status}</div>
          </div>
          <span className="sr-only">
            : {t.region} {t.name}. Home
          </span>
        </button>
        <div className="grow" />
        {/* god mode on: the editor is a tap away, and the wand says it's on */}
        {league.settings.godMode && (
          <button className="iconbtn god-wand" style={{ color: 'var(--warn)' }} onClick={() => nav('/god')} aria-label="God mode editor">
            <Wand2 size={20} />
          </button>
        )}
        {/* named by the badge it shows, then the rest: "9+ unread (52). Inbox" */}
        <button className="iconbtn" onClick={() => nav('/inbox')}>
          <Bell size={20} aria-hidden="true" />
          {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
          <span className="sr-only">{unread > 9 ? ` unread (${unread}). Inbox` : unread > 0 ? ' unread. Inbox' : 'Inbox'}</span>
        </button>
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>
    </header>
  );
}

const TAB_ICON: Record<TabId, LucideIcon> = { today: Sun, team: Users, games: CalendarDays, league: Trophy, office: Briefcase };

/** Bottom tabs; every screen lights up the section it belongs to (and is its current page for screen readers). */
function BottomNav() {
  const { pathname } = useLocation();
  const league = useLeague();
  const section = tabFor(pathname, (pid) => league.players[pid]?.tid === league.userTid);
  return (
    <nav className="bottomnav" aria-label="Main">
      <div className="bottomnav-inner">
        {TABS.map((it) => {
          const active = section === it.id;
          const Icon = TAB_ICON[it.id];
          return (
            <Link key={it.id} to={it.to} className={`navitem ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={it.label}>
              <Icon size={21} />
              <span className="nav-label">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The Continue bar, Football Manager style: in thumb reach over the tab bar, it names the next step and
 * runs it, its arrow opens every option, and while a sim runs it turns into the progress bar with Stop.
 * The live screen's coaching dock and a screen's own dock (a deal, unsaved changes) take its place.
 */
function ContinueBar() {
  const league = useLeague();
  const sim = useStore((s) => s.sim);
  const stop = useStore((s) => s.stopSim);
  const nav = useNavigate();
  const run = useFlowRunner();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // screen readers hear a sim start and finish, not every simmed day: the status region stays put and its text only changes then
  const [ran, setRan] = useState(false);
  if (sim && !ran) setRan(true);
  const onLive = pathname === '/live';
  const actions = flowActions(league, { onLive });
  const primary = actions.find((a) => a.primary) ?? actions[0];
  const pct = sim ? Math.min(100, (sim.done / Math.max(1, sim.total)) * 100) : 0;
  const steps = !!sim && sim.total > 1;
  // game day: the bar's Watch & coach opens the pre-game screen first (Settings), as Home's does; the
  // menu's "Watch & coach live" goes straight to the court
  const [agendaOpen, setAgendaOpen] = useState(false);
  const go = (a: FlowAction, fromBar = false) => {
    haptic();
    // a decision the league waits on: settle it right here (its row links to the whole screen)
    if (a.agenda) {
      setAgendaOpen(true);
      return;
    }
    const live = liveInProgress(league);
    const today = userGameOnDay(league, league.day);
    if (fromBar && a.cmd === 'watchLive' && !live && today && league.settings.pregame !== false && !pathname.startsWith('/preview')) {
      nav(`/preview/${today.gid}`);
      return;
    }
    void run(a);
  };
  const label = primary ? (primary.cmd === 'watchLive' && primary.label === 'Watch & coach live' ? 'Watch & coach' : primary.label) : '';
  // the next step is the screen you're on (the draft board, free agents, re-signing): only the options button stays, out of the way
  const here = !!primary?.to && pathname === primary.to.split('?')[0];
  return (
    <>
      <div className="sr-only" role="status">
        {sim ? `${sim.label}…` : ran ? 'Done.' : ''}
      </div>
      {sim ? (
        <div className="continue is-busy">
          <div className="continue-inner busy simbar">
            <div className={`continue-fill ${steps ? '' : 'pulse'}`} style={steps ? { width: `${pct}%` } : undefined} />
            <div className="continue-busy">
              <Spinner />
              <div className="grow">
                <span className="cg-label">{sim.label}…</span>
                {steps && <span className="cg-sub num">Day {sim.done}</span>}
              </div>
            </div>
            {/* one-shot jobs (new season, free agency) can't be stopped midway: they show as busy */}
            {steps && (
              <button className="continue-stop" onClick={stop}>
                <X size={16} /> Stop
              </button>
            )}
          </div>
        </div>
      ) : (
        !onLive &&
        primary && (
          <div className="continue">
            <div className={`continue-inner ${here ? 'compact' : ''}`}>
              {!here && (
                <button className="continue-go" disabled={!!primary.disabled} onClick={() => go(primary, true)}>
                  <Play size={18} fill="currentColor" aria-hidden="true" />
                  <span className="grow">
                    <span className="cg-label ellipsis">{label}</span>
                    {(primary.disabled ?? primary.sub) && <span className="cg-sub ellipsis">{primary.disabled ?? primary.sub}</span>}
                  </span>
                </button>
              )}
              <button className="continue-more" onClick={() => setOpen(true)} aria-label="Play options">
                <ChevronUp size={22} />
              </button>
            </div>
          </div>
        )
      )}
      <Sheet open={agendaOpen} onClose={() => setAgendaOpen(false)} title="Needs you first">
        <AgendaList league={league} only="required" />
        {!flowActions(league).some((a) => a.agenda) && <div className="empty">All set. The season can move on.</div>}
      </Sheet>
      <Sheet open={open} onClose={() => setOpen(false)} title="What next?">
        <div className="col" style={{ gap: 8 }}>
          {actions.map((a) => (
            <button
              key={a.id}
              className={`flow-opt ${a.primary ? 'primary' : ''}`}
              disabled={!!a.disabled || !!sim}
              onClick={() => {
                setOpen(false);
                go(a);
              }}
            >
              <span className="fo-l">{a.label}</span>
              {(a.disabled || a.sub) && <span className="fo-s">{a.disabled ?? a.sub}</span>}
              <ChevronRight size={18} className="fo-c" aria-hidden="true" />
            </button>
          ))}
        </div>
      </Sheet>
    </>
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
        width: 'min(788px, calc(100% - var(--gut-l) - var(--gut-r)))',
        margin: '8px auto 0',
        gap: 10,
        borderColor: 'var(--bad)',
        background: 'color-mix(in srgb, var(--bad) 10%, var(--surface))',
      }}
    >
      <AlertTriangle size={18} className="bad" style={{ flex: 'none' }} />
      <div className="grow small">
        <b>{conflict ? problem.text : 'Not saved.'}</b>{' '}
        {conflict
          ? problem.deleted
            ? 'Export a backup to keep this copy; a reload opens the main menu without it.'
            : 'Reload to pick it up from there. Changes made in this window since then are not kept unless you export a backup.'
          : problem.text}
      </div>
      {/* either way, this window's copy can be kept as a file */}
      <div className="col" style={{ gap: 6 }}>
        <button className="btn xs" disabled={busy} onClick={() => void offerFile(() => exportLeague(league))}>
          Export backup
        </button>
        {conflict ? (
          <button className="btn xs" onClick={() => window.location.reload()}>
            Reload
          </button>
        ) : (
          <button className="btn xs" disabled={busy} onClick={() => void retry()}>
            Try again
          </button>
        )}
      </div>
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
    const y = type === 'POP' ? (scrollPositions.get(key) ?? 0) : 0;
    window.scrollTo(0, y);
    // lazy screens may render after this; try again once they have height
    const timers = y ? [60, 200, 450].map((ms) => setTimeout(() => window.scrollY < y - 2 && window.scrollTo(0, y), ms)) : [];
    // kept as it changes: by the time this screen is left, the next one (or its loading
    // placeholder) is already in the page and may have pulled the scroll back to the top
    const onScroll = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('scroll', onScroll);
    };
  }, [loc.key, type]);
  return null;
}

function GameShell() {
  const league = useStore((s) => s.league);
  const loc = useLocation();
  if (!league) return <Navigate to="/start" replace />;
  return (
    <div className="app">
      <TopBar />
      <SaveBanner />
      <ErrorBoundary scope="screen" key={loc.pathname} resetKey={loc.key}>
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            {todayRoutes}
            {teamRoutes}
            {gamesRoutes}
            {leagueRoutes}
            {officeRoutes}
            {legacyRoutes}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <ContinueBar />
      <BottomNav />
      <Moments />
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
              {/* inside a league, team marks and avatars wear its teams' abbreviations and colours */}
              <Route
                path="/*"
                element={
                  <LeagueLook.Provider value={true}>
                    <GameShell />
                  </LeagueLook.Provider>
                }
              />
            </Routes>
          </Suspense>
          <Toasts />
        </Boot>
      </ErrorBoundary>
    </HashRouter>
  );
}
