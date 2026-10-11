import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { setLastLeagueId } from '../../state/persistence';

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
    return (
      <main className="page" role="alert" style={{ paddingTop: screen ? 24 : 'max(48px, var(--safe-t))' }}>
        <div className="card col" style={{ gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle className="warn" size={28} />
          <h2>{screen ? 'This screen hit a problem' : 'Something went wrong'}</h2>
          <div className="small dim2">
            {screen ? 'Your league is safe. Go back or reload to continue.' : 'Your saved leagues are kept on this device. Reload, or return to the main menu to pick a league.'}
          </div>
          <div className="tiny dim" style={{ wordBreak: 'break-word' }}>{error.message}</div>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {screen && (
              <button className="btn" onClick={() => { this.setState({ error: null }); window.history.back(); }}>
                Go back
              </button>
            )}
            <button className="btn primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button
              className="btn"
              onClick={() => {
                setLastLeagueId(null);
                window.location.hash = '#/start';
                window.location.reload();
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
