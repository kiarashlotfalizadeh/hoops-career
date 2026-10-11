// League backups: saves live only on this device, so let players export a file they can keep
// (and move between devices) and import it again.
import { Capacitor } from '@capacitor/core';
import type { League } from '../core/types';
import { isLeague, listLeagues, saveLeague } from './persistence';

const fileName = (l: League) => `hoops-career-${l.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'league'}-${l.season}.json`;

/** Hand the league to the user as a JSON file: a download on the web, the share sheet in the app. */
export async function exportLeague(league: League): Promise<void> {
  const json = JSON.stringify(league);
  const name = fileName(league);
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Hoops Career backup', files: [res.uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Read a backup file and store it as a league; a league already on the device is kept, the import becomes a copy. */
export async function importLeague(file: File): Promise<League> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a Hoops Career backup.');
  }
  if (!isLeague(data)) throw new Error('That file is not a Hoops Career backup.');
  const league = data;
  const existing = await listLeagues();
  if (existing.some((m) => m.id === league.id)) {
    league.id = `${league.id}-${Date.now().toString(36)}`;
    league.name = `${league.name} (imported)`;
  }
  await saveLeague(league);
  return league;
}
