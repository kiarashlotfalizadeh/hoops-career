// League backups: saves live only on this device, so let players export a file they can keep
// (and move between devices) and import it again. A backup is the whole league, results included.
import { Capacitor } from '@capacitor/core';
import type { League } from '../core/types';
import { isQuotaError, listLeagues, loadRawLeague, migrate, SAVE_VERSION, saveLeague } from './persistence';
import { useStore } from './store';
import { checkpointLive } from './live';

const NOT_A_BACKUP = 'That file is not a Hoops Career backup.';
/** Well above any real league (ten seasons in, a backup is under 20 MB); reading more would just exhaust memory. */
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const slug = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const fileName = (name: string, season: unknown) => `hoops-career-${slug(name) || 'league'}-${season}.json`;

/** The player closed the share sheet without picking anything. */
const cancelled = (e: unknown) => (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && /cancel/i.test(e.message));

/**
 * Hand a JSON file to the user: the share sheet in the app and on phones (an iOS home-screen app
 * can't reliably download a blob), a download elsewhere. Resolves false if they cancelled.
 */
async function deliver(json: string, name: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: 'Hoops Career backup', files: [res.uri] });
      return true;
    }
    const file = new File([json], name, { type: 'application/json' });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Hoops Career backup' });
      return true;
    }
  } catch (e) {
    if (cancelled(e)) return false;
    // NotAllowedError: the tap that asked is too long ago for a share sheet, so download instead
    if (!(e instanceof DOMException && e.name === 'NotAllowedError')) throw e;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Hand the league to the user as a JSON file. Resolves false if they cancelled the share sheet. */
export function exportLeague(league: League): Promise<boolean> {
  // a live game in progress goes in as far as it has got, to be picked up there after an import; for
  // the open league, a save follows (see flush), so the device isn't left further back than the file
  const st = useStore.getState();
  if (st.league === league) void st.flush();
  else checkpointLive(league);
  // stamped with this build's format, so an older build refuses it rather than drop what it can't read
  return deliver(JSON.stringify({ ...league, version: SAVE_VERSION }), fileName(league.name, league.season));
}

/** Export a stored league as it is, for a save this version can't open (damaged, or from a newer app). */
export async function exportRawSave(id: string): Promise<boolean> {
  const raw = (await loadRawLeague(id)) as { name?: unknown; season?: unknown } | undefined;
  if (!raw) throw new Error('That save is no longer on this device.');
  return deliver(JSON.stringify(raw), fileName(typeof raw.name === 'string' ? raw.name : 'league', raw.season ?? 'save'));
}

/** Read a backup file and store it as a league; a league already on the device is kept, the import becomes a copy. */
export async function importLeague(file: File): Promise<League> {
  if (useStore.getState().sim) throw new Error('Wait for the simulation to finish, then import.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is too big to be a Hoops Career backup.');
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const league = migrate(data, NOT_A_BACKUP);
  // the import replaces the open league: don't drop changes of it that never reached the disk
  const st = useStore.getState();
  if (st.league && !(await st.saveBeforeLeaving())) throw new Error('Your current league could not be saved. Export a backup of it first.');
  const existing = await listLeagues();
  if (existing.some((m) => m.id === league.id)) {
    league.id = `${league.id}-${Date.now().toString(36)}`;
    league.name = `${league.name} (imported)`;
  }
  try {
    await saveLeague(league);
  } catch (e) {
    console.error('import failed', e);
    const why = isQuotaError(e)
      ? 'Device storage is full. Free up some space, then import again.'
      : `Could not save it to device storage${e instanceof Error && e.message ? ` (${e.message})` : ''}.`;
    throw new Error(why, { cause: e });
  }
  return league;
}
