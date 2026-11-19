// His fine grain's three small pictures (ui/live/court3d/detail.ts) made off the page's thread, while the court's models
// come: a phone's fifth of a second of it is then no stall of the page's. Handed over rather than copied; one job.
import { tilesOf } from '../ui/live/court3d/detail';

self.onmessage = () => {
  const tiles = tilesOf();
  postMessage(tiles, [tiles.bytes.buffer]);
};
