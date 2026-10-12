import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { setLastLeagueId } from '../../state/persistence';
import { useStore } from '../../state/store';
import { canGoBack } from '../nav';

/** Reload once the league's latest changes are on the device (or after two seconds, if the save is stuck). */
function saveThenReload() {
  void Promise.race([useStore.getState().flush(), new Promise((r) => setTimeout(r, 2000))]).then(() => window.location.reload());
}

/** A screen's code that never arrived: offline before the app was cached, or replaced by an update (Chrome, Safari, Firefox wording). */
const notLoaded = (e: Error) => /dynamically imported module|module script failed/i.test(e.message);

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a bad save or a bug shows a way out instead of a blank screen.
 * "Main menu" forgets the last opened league, so a save that crashes on load can't trap the app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; scope?: 'app' | 'screen' }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const screen = this.props.scope === 'screen';
    const offline = notLoaded(error);
    return (
      <main className="page" role="alert" style={{ paddingTop: screen ? 24 : 'max(48px, calc(var(--safe-t) + 8px))' }}>
        <div className="card col" style={{ gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle className="warn" size={28} />
          <h2>{offline ? 'This screen could not be loaded' : screen ? 'This screen hit a problem' : 'Something went wrong'}</h2>
          <div className="small dim2">
            {offline
              ? `${screen ? 'Your league is safe.' : 'Your saved leagues are kept on this device.'} Check your connection, then reload.`
              : screen
                ? 'Your league is safe. Go back or reload to continue.'
                : 'Your saved leagues are kept on this device. Reload, or return to the main menu to pick a league.'}
          </div>
          <div className="tiny dim" style={{ wordBreak: 'break-word' }}>
            {error.message}
          </div>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {screen && (
              <button
                className="btn"
                onClick={() => {
                  this.setState({ error: null });
                  // opened by a deep link or a reload: there's no screen of the app to go back to
                  if (canGoBack()) window.history.back();
                  else window.location.replace('#/');
                }}
              >
                Go back
              </button>
            )}
            <button className="btn primary" onClick={saveThenReload}>
              Reload
            </button>
            <button
              className="btn"
              onClick={() => {
                setLastLeagueId(null);
                window.location.hash = '#/start';
                saveThenReload();
              }}
            >
              Main menu
            </button>
          </div>
        </div>
      </main>
    );
  }
}
