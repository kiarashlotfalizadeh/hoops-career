// Handing a picture to the user: the share sheet in the app and on a phone (straight to a chat or a
// feed), a download on a desktop. One tap either way.
import { Capacitor } from '@capacitor/core';

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error ?? new Error('The picture could not be read.'));
    r.readAsDataURL(blob);
  });

/** The player closed the share sheet without picking anything. */
const cancelled = (e: unknown) => (e instanceof DOMException && e.name === 'AbortError') || (e instanceof Error && /cancel/i.test(e.message));

/** How a picture left: shared, saved as a download, or not at all (the sheet was closed). */
export type Delivered = 'shared' | 'saved' | 'cancelled';

export async function deliverImage(blob: Blob, name: string, title: string): Promise<Delivered> {
  try {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const res = await Filesystem.writeFile({ path: name, data: await base64(blob), directory: Directory.Cache });
      await Share.share({ title, files: [res.uri] });
      return 'shared';
    }
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
    // NotAllowedError: the tap that asked is too long ago for a share sheet (the fonts took a while), so download instead
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
  return 'saved';
}
