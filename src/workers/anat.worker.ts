// His skin's anatomy fetched and worked out off the page's thread (ui/live/court3d/anat.ts): skin-anat.png in, his
// slopes and shade out, handed over rather than copied. One job, then the court's models (models.ts) let it go.
import { readAnat } from '../ui/live/court3d/anat';

self.onmessage = (e: MessageEvent<{ url: string }>) => {
  fetch(e.data.url)
    .then((res) => {
      if (!res.ok) throw new Error(`${e.data.url}: ${res.status}`);
      return res.arrayBuffer();
    })
    .then(readAnat)
    .then(
      (anat) => postMessage(anat, [anat.slopes.buffer, anat.shade.buffer]),
      (err: unknown) => postMessage({ error: String(err) }),
    );
};
