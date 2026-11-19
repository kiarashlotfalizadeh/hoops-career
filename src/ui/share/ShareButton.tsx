// One tap: the poster is drawn and handed to the share sheet (a phone, the app) or saved as a PNG
// (a desktop). The poster's code loads with the first tap, not with the screen.
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { useStore } from '../../state/store';
import type { PosterSpec } from './poster';

export function ShareButton({
  spec,
  file,
  label = 'Share',
  title,
  className = 'btn sm',
}: {
  spec: () => PosterSpec;
  file: string;
  label?: string;
  title: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const [{ posterBlob }, { deliverImage }] = await Promise.all([import('./poster'), import('./deliver')]);
      const how = await deliverImage(await posterBlob(spec()), file, title);
      if (how === 'saved') useStore.getState().toast('Poster saved to your downloads.', 'good');
    } catch (e) {
      console.error(e);
      useStore.getState().toast('The poster could not be made.', 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" className={`${className} share-btn`} disabled={busy} onClick={() => void share()} aria-label={`${label}: ${title}, as a picture`}>
      <Share2 size={15} aria-hidden="true" />
      {label}
    </button>
  );
}
