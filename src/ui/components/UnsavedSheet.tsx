import { Download } from 'lucide-react';
import { exportLeague } from '../../state/backup';
import { useStore } from '../../state/store';
import { Sheet } from './ui';

/**
 * The league still open behind the main menu couldn't be saved (see saveBeforeLeaving): offer an
 * export of it before another league replaces it, as opening a saved one or creating a new one would.
 */
export function UnsavedSheet({ open, title, proceed, onStay, onProceed }: { open: boolean; title: string; proceed: string; onStay: () => void; onProceed: () => void }) {
  const league = useStore((s) => s.league);
  const saveProblem = useStore((s) => s.saveProblem);
  return (
    <Sheet open={open && !!league} onClose={onStay} title={title}>
      {league && (
        <div className="col" style={{ gap: 12 }}>
          <div className="dim2">
            Your current league, “{league.name}”, could not be saved. {saveProblem?.text} Export a backup of it first: its latest changes are only in this window.
          </div>
          <button
            className="btn primary block"
            onClick={() =>
              void exportLeague(league).catch((e) => {
                console.error(e);
                useStore.getState().toast('Export failed.', 'bad');
              })
            }
          >
            <Download size={16} /> Export backup
          </button>
          <div className="row">
            <button className="btn grow" onClick={onStay}>
              Stay
            </button>
            <button className="btn danger grow" onClick={onProceed}>
              {proceed}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
