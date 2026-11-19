// The 3D court's models, as Blender built them (npm run models:build writes the .glb files next to
// this): the player, the people on the benches, the baskets and the furniture. Fetched once, when the
// 3D court is first shown, at the same time as the code that draws them: nothing here needs three.js,
// so the court can ask for the files before that code has come (what reads them, glb.ts, comes with it).
// His skin's map comes with them, worked out as it comes off the page's thread (anat.ts, in a worker), and the court
// waits for it with the rest: a man has his anatomy from the first frame or not at all, never a program changed under
// him mid-game. A map that didn't come, or didn't read, never fails the court: it is none for the session, and his
// skin is drawn as it was before there was one. His fine grain's pictures are made in a worker of their own meanwhile
// (detail.ts: no file, a moment's work), which the court does not wait for: a phone's men, in their plain material,
// never draw them, and a court that wants them before the worker is done (or after it failed) makes them itself.
import arenaUrl from './models/arena.glb?url';
import facesUrl from './models/faces.bin?url';
import figureUrl from './models/figure.glb?url';
import peopleUrl from './models/people.glb?url';
import anatSmallUrl from './models/skin-anat-1024.png?url';
import anatUrl from './models/skin-anat.png?url';
import { readAnat, type Anat } from './anat';
import { keepTiles, type Tiles } from './detail';
import type { Thing } from './glb';

export interface Models {
  figure: Map<string, Thing>;
  people: Map<string, Thing>;
  arena: Map<string, Thing>;
  /** How each point of the player's head moves for each shape of a face (scripts/blender/figure.py faces_bin; figure.ts reads it). */
  faces?: ArrayBuffer;
  /**
   * His skin's anatomy, in MakeHuman's own uv (scripts/blender/anatomy.py's heights, as the slopes and shade his skin
   * is lit by: anat.ts). Worked out once and kept as those bytes alone, so each court built after (a game's, or one
   * built again when its context came back) only puts them on the card. A touch screen's at half the size (anatFile).
   */
  anat?: Anat;
}

let asked: Promise<Models> | null = null;
let skin: Promise<Anat | undefined> | null = null;
let grain: Promise<void> | null = null;

async function get(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * His skin's map as this device wants it: a touch screen's at half the size (anatomy.py's SMALL: its men are never
 * near enough to want more, and a quarter of it is a quarter of its memory and of the work of reading it).
 */
export function anatFile(): string {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? anatSmallUrl : anatUrl;
}

/**
 * His skin's map, fetched and worked out in a worker (a phone's quarter of a second of it is then no stall of the
 * page's, and it goes on while the rest of the models come), or here where no worker will start.
 */
function anatAt(url: string): Promise<Anat> {
  const here = () => get(url).then(readAnat);
  let w: Worker;
  try {
    w = new Worker(new URL('../../../workers/anat.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return here();
  }
  return new Promise<Anat>((ok, fail) => {
    w.onmessage = (e: MessageEvent<Anat | { error: string }>) => {
      w.terminate();
      if ('error' in e.data) fail(new Error(e.data.error));
      else ok(e.data);
    };
    // (a worker that couldn't load: the map is worked out here after all)
    w.onerror = () => {
      w.terminate();
      ok(here());
    };
    w.postMessage({ url: new URL(url, location.href).href });
  });
}

/** His fine grain's pictures, made in a worker (once: a worker that won't start or fails leaves them to the page). Nothing waits on it. */
function grainAt(): Promise<void> {
  let w: Worker;
  try {
    w = new Worker(new URL('../../../workers/detail.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return Promise.resolve();
  }
  return new Promise<void>((done) => {
    w.onmessage = (e: MessageEvent<Tiles>) => {
      w.terminate();
      keepTiles(e.data);
      done();
    };
    w.onerror = () => {
      w.terminate();
      done();
    };
    w.postMessage(null);
  });
}

/**
 * The models (the same ones every time; a fetch that failed, or a file that didn't read, is tried again the next time
 * it's asked, all but his skin's map: that one is asked for once, and none if it failed).
 */
export function loadModels(): Promise<Models> {
  skin ??= anatAt(anatFile()).catch(() => undefined);
  grain ??= grainAt();
  // (each .glb read as it comes, while his skin's map is still being worked out)
  const glb = import('./glb');
  const read = (url: string) => Promise.all([glb, get(url)]).then(([{ readGlb }, bytes]) => readGlb(bytes));
  asked ??= Promise.all([read(figureUrl), read(peopleUrl), read(arenaUrl), get(facesUrl), skin])
    .then(([figure, people, arena, faces, anat]) => ({ figure, people, arena, faces, anat }))
    .catch((e: unknown) => {
      asked = null;
      throw e;
    });
  return asked;
}
