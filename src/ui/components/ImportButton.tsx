import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { importLeague } from '../../state/backup';
import { useStore } from '../../state/store';

/** Pick a backup file, store it as a league and open it. */
export function ImportButton({ block = false }: { block?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const l = await importLeague(f);
      useStore.getState().setLeague(l);
      useStore.getState().toast(`Imported ${l.name}.`, 'good');
      nav('/');
    } catch (e) {
      useStore.getState().toast(e instanceof Error ? e.message : 'Import failed.', 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <button className={`btn ${block ? 'block' : ''}`} disabled={busy} onClick={() => input.current?.click()}>
        <Upload size={17} /> {busy ? 'Importing…' : 'Import backup'}
      </button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
    </>
  );
}
