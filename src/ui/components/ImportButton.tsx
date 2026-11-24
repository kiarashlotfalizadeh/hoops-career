import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { ExistingLeagueError, importLeague, UnsavedLeagueError } from '../../state/backup';
import { OldSaveError } from '../../state/persistence';
import { useStore } from '../../state/store';
import { Sheet } from './ui';
import { UnsavedSheet } from './UnsavedSheet';

/** Pick a backup file, store it as a league and open it (offering an export of an open league that can't be saved first). `text`: drawn as a link-like action. */
export function ImportButton({ block = false, ghost = false, text = false }: { block?: boolean; ghost?: boolean; text?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // a backup waiting on the user: the open league couldn't be saved before it replaces it
  const [held, setHeld] = useState<File | null>(null);
  // a backup from before the redesign: said in a sheet, not a toast that's gone before it's read
  const [old, setOld] = useState<string | null>(null);
  // a backup of a league already on the device: restore over it, or keep both
  const [dupe, setDupe] = useState<{ f: File; name: string; force: boolean } | null>(null);
  const nav = useNavigate();
  const onFile = async (f: File | undefined, force = false, existing?: 'replace' | 'copy') => {
    if (!f) return;
    setBusy(true);
    try {
      const l = await importLeague(f, { force, existing });
      useStore.getState().setLeague(l);
      useStore.getState().toast(existing === 'replace' ? `Restored ${l.name} from the backup.` : `Imported ${l.name}.`, 'good');
      nav('/');
    } catch (e) {
      if (e instanceof ExistingLeagueError) setDupe({ f, name: e.name_, force });
      else if (e instanceof UnsavedLeagueError) setHeld(f);
      else if (e instanceof OldSaveError) setOld(e.message);
      else useStore.getState().toast(e instanceof Error ? e.message : 'Import failed.', 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <button className={`btn ${block ? 'block' : ''} ${ghost ? 'ghost' : ''} ${text ? 'text' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={17} /> {busy ? 'Importing…' : 'Import backup'}
      </button>
      <input ref={input} type="file" accept=".json,.gz,application/json,application/gzip" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <Sheet open={!!dupe} onClose={() => setDupe(null)} title="Restore this backup?">
        <p className="dim2" style={{ marginTop: 0 }}>
          {dupe?.name} is already on this device. Restoring puts the backup in its place: anything played since the backup is gone. Or keep both, the backup as a copy.
        </p>
        <div className="col" style={{ gap: 8 }}>
          <button
            className="btn block primary"
            onClick={() => {
              const d = dupe;
              setDupe(null);
              if (d) void onFile(d.f, d.force, 'replace');
            }}
          >
            Restore over it
          </button>
          <button
            className="btn block"
            onClick={() => {
              const d = dupe;
              setDupe(null);
              if (d) void onFile(d.f, d.force, 'copy');
            }}
          >
            Keep both
          </button>
        </div>
      </Sheet>
      <Sheet open={!!old} onClose={() => setOld(null)} title="Older backup">
        <p className="dim2" style={{ marginTop: 0 }}>
          {old}
        </p>
        <button className="btn block" onClick={() => setOld(null)}>
          OK
        </button>
      </Sheet>
      <UnsavedSheet
        open={!!held}
        title="Import without saving?"
        proceed="Import anyway"
        onStay={() => setHeld(null)}
        onProceed={() => {
          const f = held;
          setHeld(null);
          if (f) void onFile(f, true);
        }}
      />
    </>
  );
}
