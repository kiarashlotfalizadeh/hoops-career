// League backups: saves live only on this device, so let players export a file they can keep
// (and move between devices) and import it again. A backup is the whole league, results included,
// as gzipped JSON (a few times smaller; plain JSON where the browser can't compress), and an import
// reads either. The league remembers its last one (League.lastBackup), and Today asks for one once a
// season (backupDue).
import { Capacitor } from '@capacitor/core';
import type { League } from '../core/types';
import { isQuotaError, listLeagues, loadRawLeague, loadRawSnapshot, migrate, onDevice, SAVE_VERSION, saveLeague } from './persistence';
import { useStore } from './store';
import { checkpointLive } from './live';

const NOT_A_BACKUP = 'That file is not a Hoops Career backup.';
const TOO_BIG = 'That file is too big to be a Hoops Career backup.';
/** Well above any real league's JSON (ten seasons in, under 20 MB); reading more would just exhaust memory. Holds for a gzipped file's contents too. */
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const slug = (s: string) =>
  s
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
const fileName = (name: string, season: unknown) => `hoops-career-${slug(name) || 'league'}-${season}`;

/** A file's contents: its JSON gzipped where the browser can compress (Safari 16.4+, every current browser), as it is otherwise. */
async function pack(json: string): Promise<{ blob: Blob; ext: string }> {
  if (typeof CompressionStream === 'undefined') return { blob: new Blob([json], { type: 'application/json' }), ext: '.json' };
  const gz = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return { blob: new Blob([gz], { type: 'application/gzip' }), ext: '.json.gz' };
}

/** A backup file's JSON, gzipped (the file starts with gzip's two magic bytes) or plain (every backup before compression). */
async function unpack(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b) return file.text();
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open a compressed backup. Update it, or import the file on another device.');
  const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      throw new Error(NOT_A_BACKUP);
    }
    if (chunk.done) break;
    size += chunk.value.byteLength;
    // (a small file can unpack to far more than any league: stop before it fills the memory)
    if (size > MAX_IMPORT_BYTES) {
      void reader.cancel().catch(() => {});
      throw new Error(TOO_BIG);
    }
    parts.push(chunk.value);
  }
  return new Blob(parts as BlobPart[]).text();
}

/** A blob as base64, for the native file system (which writes binary files from base64). */
const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('The backup could not be read.'));
    r.readAsDataURL(blob);
  });

/** The player closed the share sheet without picking anything. */
const cancelled = (e: unknown) => (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && /cancel/i.test(e.message));

/**
 * Hand a backup file to the user: the share sheet in the app and on phones (an iOS home-screen app
 * can't reliably download a blob), a download elsewhere (and where the browser won't share the file's
 * type: Chrome on Android shares no .gz). `name` without its extension. Resolves false if they cancelled.
 */
async function deliver(json: string, base: string): Promise<boolean> {
  const { blob, ext } = await pack(json);
  const name = base + ext;
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const res = await Filesystem.writeFile({ path: name, data: await base64(blob), directory: Directory.Cache });
      await Share.share({ title: 'Hoops Career backup', files: [res.uri] });
      return true;
    }
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Hoops Career backup' });
      return true;
    }
  } catch (e) {
    if (cancelled(e)) return false;
    // NotAllowedError: the tap that asked is too long ago for a share sheet, so download instead
    if (!(e instanceof DOMException && e.name === 'NotAllowedError')) throw e;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/**
 * Hand the league to the user as a backup file. Resolves false if they cancelled the share sheet;
 * otherwise the league notes the backup (League.lastBackup), saved with it.
 */
export async function exportLeague(league: League): Promise<boolean> {
  // a live game in progress goes in as far as it has got, to be picked up there after an import; for
  // the open league, a save follows (see flush), so the device isn't left further back than the file
  const st = useStore.getState();
  if (st.league === league) void st.flush();
  else checkpointLive(league);
  const stamp = { at: Date.now(), season: league.season };
  // stamped with this build's format, so an older build refuses it rather than drop what it can't
  // read, and with the backup it is (a league imported from it was backed up then)
  const ok = await deliver(JSON.stringify({ ...league, version: SAVE_VERSION, lastBackup: stamp }), fileName(league.name, league.season));
  if (ok) noteBackup(league, stamp);
  return ok;
}

/** The league was backed up: it says so from now on (Settings, and Today stops asking this season). */
function noteBackup(league: League, stamp: NonNullable<League['lastBackup']>) {
  const st = useStore.getState();
  // the open league: a change like any other, saved with it (during a sim the worker's copy replaces
  // this one without it: the backup is made all the same, only not noted)
  if (st.league === league) {
    st.mutate((l) => void (l.lastBackup = stamp));
    return;
  }
  // one that isn't open (exported from the main menu, before a delete): saved as it is, if it came from the device
  league.lastBackup = stamp;
  if (onDevice(league)) void saveLeague(league).catch((e) => console.warn('The backup could not be noted in the save:', e));
}

/**
 * Whether the browser promised to keep this site's saves (navigator.storage.persist), or it's the
 * native app. main.tsx says once the browser has answered; until then, it's taken as kept.
 */
let storageKept = true;
export const noteStorageKept = (kept: boolean) => void (storageKept = kept);

/** A month into the season (day 0 is October 20): where Today first asks when the browser may clear the saves. */
const FIRST_ASK_DAY = 30;

/**
 * Whether Today asks for a backup: once a season, from the league's second season on (one season is
 * quick to play again, ten aren't), unless one was made this season or the user said not now this
 * season. Where the browser may clear the saves (Safari in a tab clears a site a week unvisited), it
 * asks from a month into the first season. It's a row of Needs you, never a stop: sims run past it.
 */
export function backupDue(league: League, kept = storageKept): boolean {
  const from = league.season > league.startSeason || (!kept && league.day >= FIRST_ASK_DAY);
  return from && league.backupAsked !== league.season && (league.lastBackup?.season ?? -Infinity) < league.season;
}

/** Export a stored league as it is, for a save this version can't open (damaged, or from a newer app). */
export async function exportRawSave(id: string): Promise<boolean> {
  const raw = (await loadRawLeague(id)) as { name?: unknown; season?: unknown } | undefined;
  if (!raw) throw new Error('That save is no longer on this device.');
  return deliver(JSON.stringify(raw), fileName(typeof raw.name === 'string' ? raw.name : 'league', raw.season ?? 'save'));
}

/** Export a league's season snapshot (see persistence.ts) as it is: for when its own record can't be opened. */
export async function exportSnapshot(id: string): Promise<boolean> {
  const raw = (await loadRawSnapshot(id)) as { name?: unknown; season?: unknown } | undefined;
  if (!raw) throw new Error('There is no season snapshot of that league on this device.');
  return deliver(JSON.stringify(raw), fileName(`${typeof raw.name === 'string' ? raw.name : 'league'} start`, raw.season ?? 'save'));
}

/** The open league couldn't be saved before an import would replace it: offer an export of it first. */
export class UnsavedLeagueError extends Error {}

/**
 * Read a backup file and store it as a league; a league already on the device is kept, the import
 * becomes a copy. `force`: go ahead even if the open league can't be saved first (after the user
 * was offered an export of it).
 */
export async function importLeague(file: File, { force = false } = {}): Promise<League> {
  if (useStore.getState().sim) throw new Error('Wait for the simulation to finish, then import.');
  if (file.size > MAX_IMPORT_BYTES) throw new Error(TOO_BIG);
  const json = await unpack(file);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const league = migrate(data, NOT_A_BACKUP);
  // the import replaces the open league: don't drop changes of it that never reached the disk
  const st = useStore.getState();
  if (st.league && !force && !(await st.saveBeforeLeaving())) throw new UnsavedLeagueError('Your current league could not be saved. Export a backup of it first.');
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
