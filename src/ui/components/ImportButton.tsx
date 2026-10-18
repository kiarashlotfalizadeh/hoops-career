import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { importLeague, UnsavedLeagueError } from '../../state/backup';
import { OldSaveError } from '../../state/persistence';
import { useStore } from '../../state/store';
import { Sheet } from './ui';
import { UnsavedSheet } from './UnsavedSheet';

/** Pick a backup file, store it as a league and open it (offering an export of an open league that can't be saved first). */
export function ImportButton({ block = false, ghost = false }: { block?: boolean; ghost?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // a backup waiting on the user: the open league couldn't be saved before it replaces it
  const [held, setHeld] = useState<File | null>(null);
  // a backup from before the redesign: said in a sheet, not a toast that's gone before it's read
  const [old, setOld] = useState<string | null>(null);
  const nav = useNavigate();
  const onFile = async (f: File | undefined, force = false) => {
    if (!f) return;
    setBusy(true);
    try {
      const l = await importLeague(f, { force });
      useStore.getState().setLeague(l);
      useStore.getState().toast(`Imported ${l.name}.`, 'good');
      nav('/');
    } catch (e) {
      if (e instanceof UnsavedLeagueError) setHeld(f);
      else if (e instanceof OldSaveError) setOld(e.message);
      else useStore.getState().toast(e instanceof Error ? e.message : 'Import failed.', 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <button className={`btn ${block ? 'block' : ''} ${ghost ? 'ghost' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={17} /> {busy ? 'Importing…' : 'Import backup'}
      </button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
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
