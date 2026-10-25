import { BarChart3, ClipboardList, Play, Timer, Users, Bot } from 'lucide-react';

/** The console's views: the staff's (the report at a break, the huddle in a timeout), the game plan, the lineup and the stats. */
export type ConsoleView = 'staff' | 'plan' | 'lineup' | 'stats';

const VIEWS: { id: ConsoleView; label: string; icon: typeof Bot }[] = [
  { id: 'staff', label: 'Staff', icon: Bot },
  { id: 'plan', label: 'Game plan', icon: ClipboardList },
  { id: 'lineup', label: 'Lineup', icon: Users },
  { id: 'stats', label: 'Stats', icon: BarChart3 },
];

/**
 * The bench bar in the tab bar's place: the one action the moment calls for first (a timeout while
 * the game plays, Start the next period at a break, Resume in your huddle), then the console's views,
 * the staff's with a count of the calls waiting on you.
 */
export function BenchBar({
  view,
  onView,
  calls,
  stop,
  timeouts,
  canTimeout,
  toPending,
  toState,
  onTimeout,
  go,
}: {
  view: ConsoleView;
  onView: (v: ConsoleView) => void;
  /** The staff's calls waiting on you. */
  calls: number;
  /** Stopped: a period's end ('break') or your timeout ('huddle'). */
  stop: 'break' | 'huddle' | null;
  timeouts: number;
  canTimeout: boolean;
  /** A timeout is called and waiting for the court (or the next dead ball). */
  toPending: boolean;
  /** Why a timeout can't be called now, or that one is waiting, for screen readers. */
  toState: string;
  onTimeout: () => void;
  /** At a stop: start the next period, or resume; its label. */
  go?: { label: string; run: () => void };
}) {
  return (
    <div className={`lv-bb${stop ? ' stopped' : ''}`} role="group" aria-label="Game controls">
      {stop && go ? (
        <button className="lv-bb-go" onClick={go.run}>
          <Play size={17} fill="currentColor" aria-hidden="true" />
          <span>{go.label}</span>
        </button>
      ) : (
        <button className={`lv-bb-btn lv-bb-to${toPending ? ' on' : ''}`} data-v="timeout" disabled={!canTimeout} onClick={onTimeout}>
          <span className="lv-bb-ic" aria-hidden="true">
            <Timer size={20} />
            <span className="lv-bb-n num">{timeouts}</span>
          </span>
          <span className="lv-bb-l">Timeout</span>
          <span className="sr-only">
            , {timeouts}
            {toState}
          </span>
        </button>
      )}
      <div className="lv-bb-views" role="tablist" aria-label="Views">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={view === id} className={`lv-bb-btn${view === id ? ' on' : ''}`} data-v={id} onClick={() => onView(id)}>
            <span className="lv-bb-ic" aria-hidden="true">
              <Icon size={20} />
              {id === 'staff' && calls > 0 && <span className="lv-bb-badge num">{calls}</span>}
            </span>
            <span className="lv-bb-l">{id === 'staff' && stop ? (stop === 'break' ? 'Report' : 'Huddle') : label}</span>
            {id === 'staff' && calls > 0 && <span className="sr-only">: {calls} calls waiting</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
