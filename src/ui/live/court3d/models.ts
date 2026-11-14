// The 3D court's models, as Blender built them (npm run models:build writes the .glb files next to
// this): the player, the people on the benches, the baskets and the furniture. Fetched once, when the
// 3D court is first shown, at the same time as the code that draws them: nothing here needs three.js,
// so the court can ask for the files before that code has come (what reads them, glb.ts, comes with it).
import arenaUrl from './models/arena.glb?url';
import facesUrl from './models/faces.bin?url';
import figureUrl from './models/figure.glb?url';
import peopleUrl from './models/people.glb?url';
import type { Thing } from './glb';

export interface Models {
  figure: Map<string, Thing>;
  people: Map<string, Thing>;
  arena: Map<string, Thing>;
  /** How each point of the player's head moves for each shape of a face (scripts/blender/figure.py faces_bin; figure.ts reads it). */
  faces?: ArrayBuffer;
}

let asked: Promise<Models> | null = null;

async function get(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.arrayBuffer();
}

/** The models (the same ones every time; a fetch that failed, or a file that didn't read, is tried again the next time it's asked). */
export function loadModels(): Promise<Models> {
  asked ??= Promise.all([import('./glb'), get(figureUrl), get(peopleUrl), get(arenaUrl), get(facesUrl)])
    .then(([{ readGlb }, figure, people, arena, faces]) => ({ figure: readGlb(figure), people: readGlb(people), arena: readGlb(arena), faces }))
    .catch((e: unknown) => {
      asked = null;
      throw e;
    });
  return asked;
}
