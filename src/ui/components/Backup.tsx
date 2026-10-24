// Backups on screen: when the league was last kept as a file, Today's once-a-season ask for one (a
// row of Needs you that never stops a sim), and the way back through the league's season snapshot
// (state/persistence.ts) when its own record won't open or a season went wrong.
import { useEffect, useState } from 'react';
import { Download, History } from 'lucide-react';
import type { League } from '../../core/types';
import { seasonLabel } from '../../core/constants';
import { exportLeague, exportSnapshot } from '../../state/backup';
import { restoreSnapshot, snapshotOf, type LeagueMeta } from '../../state/persistence';
import { edit } from '../../state/actions';
import { useStore } from '../../state/store';

/** A day as the device's calendar has it ("Oct 24, 2026"): a backup is a real-world date, not the league's. */
const onDay = (at: number) => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** "Last backup: never", "Last backup: Oct 24, 2026" (and its season, when that was an earlier one). */
export function lastBackupText(league: League): string {
  const b = league.lastBackup;
  if (!b) return 'Last backup: never';
  return `Last backup: ${onDay(b.at)}${b.season !== league.season ? `, in ${seasonLabel(b.season)}` : ''}`;
}

/** Hand the league over as a file, saying so if that fails (a cancelled share sheet is no failure). */
export function offerBackup(league: League) {
  void exportLeague(league).catch((e) => {
    console.error(e);
    useStore.getState().toast('Export failed.', 'bad');
  });
}

/** Today's ask (see backupDue): drawn as the agenda's rows are, the export one tap away, or not now (until next season). */
export function BackupRow({ league }: { league: League }) {
  const simming = useStore((s) => !!s.sim);
  return (
    <div className="ag-row">
      <div className="ag-head">
        <div className="grow">
          <div className="ag-title">Back up your league</div>
          <div className="ag-line">{lastBackupText(league)}. It lives only on this device.</div>
        </div>
      </div>
      <div className="ag-acts">
        <button className="btn xs primary" onClick={() => offerBackup(league)}>
          <Download size={14} aria-hidden="true" /> Export backup
        </button>
        <button className="btn xs" disabled={simming} onClick={() => edit((l) => void (l.backupAsked = l.season))}>
          Not now
        </button>
      </div>
    </div>
  );
}

/** The league's season snapshot as the device has it: undefined while it's read, null if there's none. */
export function useSnapshot(id: string | null | undefined): LeagueMeta['snap'] | null | undefined {
  const [snap, setSnap] = useState<{ id: string; snap: LeagueMeta['snap'] | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let on = true;
    snapshotOf(id)
      .then((s) => on && setSnap({ id, snap: s ?? null }))
      .catch(() => on && setSnap({ id, snap: null }));
    return () => {
      on = false;
    };
  }, [id]);
  if (!id) return null;
  return snap?.id === id ? snap.snap : undefined;
}

/** "the 2027-28 start, taken Oct 2, 2026". */
export const snapshotText = (snap: NonNullable<LeagueMeta['snap']>) => `the ${seasonLabel(snap.season)} start, taken ${onDay(snap.at)}`;

/**
 * Restore a league's snapshot as a league of its own (nothing is overwritten) or export it as a
 * file. `onRestored`: what to do with the restored copy (open it); without, a toast says where it is.
 */
export function SnapshotActions({ id, snap, onRestored }: { id: string; snap: NonNullable<LeagueMeta['snap']>; onRestored?: (l: League) => void }) {
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const l = await restoreSnapshot(id);
      if (onRestored) onRestored(l);
      else useStore.getState().toast(`Restored as “${l.name}”: open it from the main menu.`, 'good');
    } catch (e) {
      console.error(e);
      useStore.getState().toast(`The snapshot could not be restored. ${e instanceof Error ? e.message : ''}`, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    void exportSnapshot(id).catch((e) => {
      console.error(e);
      useStore.getState().toast('Export failed.', 'bad');
    });
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <button className="btn sm" disabled={busy} onClick={() => void restore()}>
        <History size={15} aria-hidden="true" /> Restore {seasonLabel(snap.season)} start
      </button>
      <button className="btn sm" disabled={busy} onClick={save}>
        <Download size={15} aria-hidden="true" /> Export it
      </button>
    </div>
  );
}
