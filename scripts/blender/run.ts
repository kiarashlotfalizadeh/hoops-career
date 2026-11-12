// Builds the 3D court's models in Blender (headless) and writes them where the app loads them from:
//   npm run models:build                 every model
//   npm run models:build figure          one of them
//   npm run models:build -- --preview    also renders a look at each into scripts/blender/out
// Each model is a Python script here (figure.py, arena.py, ...) that writes one .glb (to
// scripts/blender/out/raw) and its .blend (to open in Blender, to scripts/blender/out). The models are
// built side by side, a Blender each. What Blender wrote is then packed (see pack: the same shape in
// some 40% fewer bytes) into src/ui/live/court3d/models, and manifest.json there notes the scripts
// each file was built from, so that a test can tell a script that changed without a rebuild
// (src/ui/__tests__/models.test.ts).
// Blender is found from $BLENDER, the PATH, or where macOS keeps it.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { chunks, numbers, readGlb, type Gltf } from '../../src/ui/live/court3d/glb';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
/** Where the app's .glb files and their manifest are. */
export const MODELS_DIR = join(root, 'src/ui/live/court3d/models');
/** Each model, and the scripts here it is built from: its own, and the ones that one imports. */
export const SOURCES: Record<string, string[]> = {
  figure: ['figure.py', 'lib.py'],
  people: ['people.py', 'figure.py', 'lib.py'],
  arena: ['arena.py', 'lib.py'],
};
const MODELS = Object.keys(SOURCES);
/** Which way of packing wrote a file. Raise it when pack() changes what it writes: the test then asks for a rebuild. */
export const PACK = 2;
/**
 * A point is kept to this fine a grid (ft: a 4096th, some 0.07 mm). Nothing is drawn that fine, and a
 * float that ends in zeros is what the web's compression can do something with: the files are a seventh
 * smaller on the wire (a fifth under brotli) for it, and no reader knows the difference.
 */
export const GRID = 1 / 4096;
/** The materials the app paints a picture on (a kit's number, the table's LED front): only their parts keep a uv. */
const PAINTED = new Set(['jersey', 'board']);

/** What the manifest keeps of a model: its scripts' hash, how it was packed, the Blender that built it, its size. */
export interface Built {
  sources: string;
  pack: number;
  blender: string;
  bytes: number;
}
export type Manifest = Record<string, Built | undefined>;

/** One hash over the scripts a model is built from (the same on every machine: line ends don't count). */
export function sourceHash(model: string, dir = here): string {
  const hash = createHash('sha256');
  for (const name of SOURCES[model]) hash.update(`${name}\n${readFileSync(join(dir, name), 'utf8').replace(/\r\n?/g, '\n')}\0`);
  return hash.digest('hex');
}

export function readManifest(dir = MODELS_DIR): Manifest {
  const file = join(dir, 'manifest.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Manifest) : {};
}

/** Writes a file whole or not at all (the app, or another build, may be reading the old one). */
function put(file: string, data: string | Uint8Array) {
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

// ---------------------------------------------------------------- packing

type Numbers = ReturnType<typeof numbers>['raw'];
type Lists = NonNullable<Gltf['accessors']>;
type Views = NonNullable<Gltf['bufferViews']>;
const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const code = (a: Numbers) =>
  a instanceof Int8Array ? 5120 : a instanceof Uint8Array ? 5121 : a instanceof Int16Array ? 5122 : a instanceof Uint16Array ? 5123 : a instanceof Uint32Array ? 5125 : 5126;
/** What a list is for, as the format numbers it: a mesh's points, or its triangles. */
const POINTS = 34962;
const TRIANGLES = 34963;
const up4 = (n: number) => (n + 3) & ~3;

/**
 * A .glb as Blender wrote it, rewritten with the dead weight out. The shape is the same (points to
 * within GRID, the rest to within what a byte holds: see same); the file is what src/ui/live/court3d/glb.ts
 * reads, and still a .glb any viewer opens.
 *  - a point is rounded to GRID (still three floats);
 *  - a normal is three bytes (floats before), a colour three bytes (four 16-bit numbers before: the
 *    fourth said nothing), a point's bone weights four bytes that add up to 255;
 *  - a uv stays only on a part the app paints a picture on (PAINTED), as it was: a vest's runs past 1
 *    where the picture wraps round his side;
 *  - points that are now the same in every list become one, points no triangle uses go, and triangles
 *    count their points in the smallest whole number that holds them;
 *  - the JSON is written without spaces.
 * A file that is already packed comes out as it went in.
 */
export function pack(file: Uint8Array, notes: string[] = []): Uint8Array {
  const { json, bin } = chunks(file);
  const whole = json as Gltf & Record<string, unknown>;
  for (const key of ['animations', 'images', 'textures', 'cameras'])
    if ((whole[key] as unknown[] | undefined)?.length) throw new Error(`pack: the file has ${key}, which packing does not carry over`);
  // the new file's numbers, in a few piles: lists of a kind (a mesh's lists by how far apart their entries are, the triangles, the bones) share one
  const piles = new Map<string, { view: Views[number]; blobs: Uint8Array[] }>();
  const lists: Lists = [];
  const had = new Map<string, number>();
  /** Adds a list to the new file and says which it is. A mesh's list has each entry start on a fourth byte (the format's rule). */
  const add = (data: Numbers, type: string, o: { normalized?: boolean; target?: number; range?: boolean } = {}): number => {
    const comps = COMPS[type];
    const width = comps * data.BYTES_PER_ELEMENT;
    const step = o.target === POINTS ? up4(width) : width;
    const count = data.length / comps;
    const from = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    // (a list told twice, as two bench sitters' triangles are, is kept once)
    const key = `${type} ${code(data)} ${!!o.normalized} ${o.target} ${createHash('sha1').update(from).digest('hex')}`;
    const twin = had.get(key);
    if (twin !== undefined) return twin;
    had.set(key, lists.length);
    const bytes = new Uint8Array(up4(count * step));
    for (let k = 0; k < count; k++) bytes.set(from.subarray(k * width, (k + 1) * width), k * step);
    const kind = `${o.target ?? 0} ${o.target === POINTS ? step : 0}`;
    const pile = piles.get(kind) ?? {
      view: { buffer: 0, byteOffset: 0, byteLength: 0, ...(o.target === POINTS && { byteStride: step }), ...(o.target && { target: o.target }) },
      blobs: [],
    };
    piles.set(kind, pile);
    const list: Lists[number] = {
      bufferView: [...piles.keys()].indexOf(kind),
      ...(pile.view.byteLength && { byteOffset: pile.view.byteLength }),
      componentType: code(data),
      ...(o.normalized && { normalized: true }),
      count,
      type,
    };
    pile.blobs.push(bytes);
    pile.view.byteLength += bytes.length;
    if (o.range) {
      // (a mesh's points must say how far they reach)
      list.min = new Array<number>(comps).fill(Infinity);
      list.max = new Array<number>(comps).fill(-Infinity);
      for (let k = 0; k < data.length; k++) {
        list.min[k % comps] = Math.min(list.min[k % comps], data[k]);
        list.max[k % comps] = Math.max(list.max[k % comps], data[k]);
      }
    }
    lists.push(list);
    return lists.length - 1;
  };

  let bytes8 = false;
  const points = [0, 0];
  const bare = new Set<string>();
  const meshes = (json.meshes ?? []).map((mesh) => {
    const primitives = mesh.primitives.flatMap((prim) => {
      const material = json.materials?.[prim.material ?? -1]?.name ?? '';
      const bad = (what: string) => new Error(`pack: ${mesh.name ?? 'a mesh'} (${material}) ${what}`);
      if (prim.targets || (prim.mode ?? 4) !== 4) throw bad('is not plain triangles');
      if (prim.attributes.POSITION === undefined) throw bad('has no points');
      const n = json.accessors?.[prim.attributes.POSITION]?.count ?? 0;
      const cols: { key: string; data: Numbers; type: string; normalized: boolean }[] = [];
      for (const [key, i] of Object.entries(prim.attributes)) {
        if (key.startsWith('TEXCOORD_') && !PAINTED.has(material)) {
          bare.add(material);
          continue;
        }
        const { array, raw, size: comps } = numbers(json, bin, i);
        if (array.length !== n * comps) throw bad(`has ${array.length / comps} of ${key} for ${n} points`);
        if (key === 'POSITION' && raw instanceof Float32Array) {
          cols.push({ key, data: Float32Array.from(raw, (v) => Math.round(v / GRID) * GRID), type: 'VEC3', normalized: false });
        } else if (key === 'NORMAL' && !(raw instanceof Int8Array)) {
          const q = new Int8Array(n * 3);
          for (let k = 0; k < q.length; k += 3) {
            const len = Math.hypot(array[k], array[k + 1], array[k + 2]) || 1;
            for (let c = 0; c < 3; c++) q[k + c] = Math.round((array[k + c] / len) * 127);
          }
          cols.push({ key, data: q, type: 'VEC3', normalized: true });
        } else if (key === 'COLOR_0' && !(raw instanceof Uint8Array && comps === 3)) {
          const q = new Uint8Array(n * 3);
          for (let k = 0; k < n; k++) for (let c = 0; c < 3; c++) q[k * 3 + c] = Math.round(Math.min(1, Math.max(0, array[k * comps + c])) * 255);
          cols.push({ key, data: q, type: 'VEC3', normalized: true });
        } else if (key === 'WEIGHTS_0' && !(raw instanceof Uint8Array)) {
          // (each weight rounded down, then the largest remainders rounded up until the four make 255)
          const q = new Uint8Array(n * comps);
          for (let k = 0; k < q.length; k += comps) {
            const w = Array.from({ length: comps }, (_v, c) => Math.max(0, array[k + c]));
            const sum = w.reduce((s, v) => s + v, 0);
            if (!(sum > 0)) throw bad(`has a point (${k / comps}) that hangs on no bone`);
            const exact = w.map((v) => (v / sum) * 255);
            const down = exact.map(Math.floor);
            let left = 255 - down.reduce((s, v) => s + v, 0);
            for (const c of exact.map((_v, c) => c).sort((a, b) => exact[b] - down[b] - (exact[a] - down[a]) || a - b)) if (left-- > 0) down[c]++;
            q.set(down, k);
          }
          cols.push({ key, data: q, type: json.accessors![i].type, normalized: true });
        } else cols.push({ key, data: raw, type: json.accessors![i].type, normalized: !!json.accessors![i].normalized });
      }
      // (a bone that carries none of a point is bone 0 there: the same point told two ways is one point)
      const [on, by] = [cols.find((c) => c.key === 'JOINTS_0'), cols.find((c) => c.key === 'WEIGHTS_0')];
      if (on && by) for (let k = 0; k < by.data.length; k++) if (by.data[k] === 0) on.data[k] = 0;
      bytes8 ||= cols.some((c) => c.key === 'NORMAL' && c.data instanceof Int8Array);

      // the points the triangles use, each once: the same bytes in every list is the same point
      const index = prim.indices === undefined ? Uint32Array.from({ length: n }, (_v, k) => k) : numbers(json, bin, prim.indices).raw;
      if (!index.length) return [];
      const rows = cols.map((c) => ({ bytes: Buffer.from(c.data.buffer, c.data.byteOffset, c.data.byteLength), width: c.data.byteLength / n }));
      const seen = new Map<string, number>();
      const kept: number[] = [];
      const next = Array.from(index, (old) => {
        if (old >= n) throw bad(`has a triangle on a point it does not have (${old} of ${n})`);
        const key = rows.map((r) => r.bytes.toString('latin1', old * r.width, (old + 1) * r.width)).join('');
        let at = seen.get(key);
        if (at === undefined) {
          at = kept.length;
          seen.set(key, at);
          kept.push(old);
        }
        return at;
      });
      points[0] += n;
      points[1] += kept.length;
      const attributes: Record<string, number> = {};
      for (const c of cols) {
        const comps = COMPS[c.type];
        const data = new (c.data.constructor as new (length: number) => Numbers)(kept.length * comps);
        kept.forEach((old, k) => {
          for (let j = 0; j < comps; j++) data[k * comps + j] = c.data[old * comps + j];
        });
        attributes[c.key] = add(data, c.type, { normalized: c.normalized, target: POINTS, range: c.key === 'POSITION' });
      }
      const count = kept.length <= 256 ? Uint8Array.from(next) : kept.length <= 65536 ? Uint16Array.from(next) : Uint32Array.from(next);
      return [{ ...prim, attributes, indices: add(count, 'SCALAR', { target: TRIANGLES }) }];
    });
    if (!primitives.length) throw new Error(`pack: ${mesh.name ?? 'a mesh'} has no triangles`);
    return { ...mesh, primitives };
  });
  const skins = json.skins?.map((s) => (s.inverseBindMatrices === undefined ? s : { ...s, inverseBindMatrices: add(numbers(json, bin, s.inverseBindMatrices).raw, 'MAT4') }));

  let size = 0;
  for (const pile of piles.values()) {
    pile.view.byteOffset = size;
    size += pile.view.byteLength;
  }
  const next: Record<string, unknown> = { ...whole, meshes, accessors: lists, bufferViews: [...piles.values()].map((p) => p.view), buffers: [{ byteLength: size }] };
  if (skins) next.skins = skins;
  // (a normal in bytes is the format's "mesh quantization" extension: a reader has to know it)
  if (bytes8) for (const key of ['extensionsUsed', 'extensionsRequired']) next[key] = [...new Set([...((whole[key] as string[] | undefined) ?? []), 'KHR_mesh_quantization'])];
  if (points[1] < points[0]) notes.push(`${points[0]} points to ${points[1]}`);
  if (bare.size) notes.push(`no uv on ${[...bare].join(', ')}`);

  // the container: a header, the JSON (padded with spaces to a fourth byte), the numbers
  const text = Buffer.from(JSON.stringify(next));
  const out = Buffer.alloc(12 + 8 + up4(text.length) + (size ? 8 + size : 0), 0x20);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(up4(text.length), 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  text.copy(out, 20);
  let at = 20 + up4(text.length);
  if (size) {
    out.writeUInt32LE(size, at);
    out.writeUInt32LE(0x004e4942, at + 4);
    at += 8;
    for (const b of [...piles.values()].flatMap((p) => p.blobs)) {
      out.set(b, at);
      at += b.length;
    }
  }
  return out;
}

/** How far a packed normal may lean from Blender's (degrees), and a colour or a weight be off (a byte's step). */
const LEAN = 1.5;
const STEP = 1 / 255 + 1e-6;

/** Throws unless `after` reads (through the app's own reader) as the model `before` is: the same things, bones and triangles, every corner's point to within the grid, its normal, colour and weights to within what a byte holds. */
export function same(before: Uint8Array, after: Uint8Array): void {
  const [a, b] = [readGlb(before), readGlb(after)];
  function bad(what: string): never {
    throw new Error(`pack: the packed file is not the model Blender wrote: ${what}`);
  }
  if ([...a.keys()].join() !== [...b.keys()].join()) bad(`it holds ${[...b.keys()].join(', ')}`);
  for (const [name, ta] of a) {
    const tb = b.get(name)!;
    if (!ta.matrix.equals(tb.matrix)) bad(`${name} sits elsewhere`);
    if (ta.bones?.map((bone) => bone.name + bone.inverse.elements.join()).join() !== tb.bones?.map((bone) => bone.name + bone.inverse.elements.join()).join())
      bad(`${name}'s bones`);
    if (ta.parts.map((p) => p.material).join() !== tb.parts.map((p) => p.material).join()) bad(`${name}'s parts are ${tb.parts.map((p) => p.material).join(', ')}`);
    ta.parts.forEach((pa, k) => {
      const pb = tb.parts[k];
      const tag = `${name} (${pa.material})`;
      const corners = (geo: typeof pa.geo) => geo.index?.array ?? Uint32Array.from({ length: geo.getAttribute('position').count }, (_v, i) => i);
      const [ia, ib] = [corners(pa.geo), corners(pb.geo)];
      if (ia.length !== ib.length) bad(`${tag} has ${ib.length / 3} triangles, not ${ia.length / 3}`);
      for (const attr of Object.keys(pb.geo.attributes)) if (!pa.geo.getAttribute(attr)) bad(`${tag} gained a ${attr}`);
      for (const attr of Object.keys(pa.geo.attributes)) {
        const [la, lb] = [pa.geo.getAttribute(attr), pb.geo.getAttribute(attr)];
        if (!lb) {
          if (attr === 'uv' && !PAINTED.has(pa.material)) continue;
          bad(`${tag} lost its ${attr}`);
        }
        if (attr === 'skinIndex') continue;
        const size = la.itemSize;
        // (a point's weights by bone: the order the four are told in doesn't count)
        const weights = (geo: typeof pa.geo, v: number) => {
          const [on, by] = [geo.getAttribute('skinIndex'), geo.getAttribute('skinWeight')];
          const of = new Map<number, number>();
          for (let c = 0; c < 4; c++) if (by.getComponent(v, c) > 0) of.set(on.getComponent(v, c), (of.get(on.getComponent(v, c)) ?? 0) + by.getComponent(v, c));
          return of;
        };
        for (let c = 0; c < ia.length; c++) {
          const [va, vb] = [ia[c], ib[c]];
          const at = `${tag}'s ${attr} at corner ${c}`;
          if (attr === 'normal') {
            const [x, y, z, u, v, w] = [la.getX(va), la.getY(va), la.getZ(va), lb.getX(vb), lb.getY(vb), lb.getZ(vb)];
            const [m, n] = [Math.hypot(x, y, z), Math.hypot(u, v, w)];
            if (m === 0 ? n !== 0 : Math.acos(Math.min(1, (x * u + y * v + z * w) / (m * n))) > (LEAN * Math.PI) / 180) bad(at);
          } else if (attr === 'skinWeight') {
            const [wa, wb] = [weights(pa.geo, va), weights(pb.geo, vb)];
            for (const bone of new Set([...wa.keys(), ...wb.keys()])) if (Math.abs((wa.get(bone) ?? 0) - (wb.get(bone) ?? 0)) > STEP) bad(at);
          } else {
            const slack = attr === 'color' ? STEP : attr === 'position' ? GRID / 2 + 1e-6 : 0;
            for (let j = 0; j < size; j++) if (!(Math.abs(la.getComponent(va, j) - lb.getComponent(vb, j)) <= slack)) bad(at);
          }
        }
      }
    });
  }
}

// ---------------------------------------------------------------- building

function findBlender(): string {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const which = spawnSync('which', ['blender'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  const spots = ['/Applications', join(homedir(), 'Applications')];
  for (const spot of spots) {
    if (!existsSync(spot)) continue;
    const direct = join(spot, 'Blender.app/Contents/MacOS/Blender');
    if (existsSync(direct)) return direct;
    for (const dir of readdirSync(spot)
      .filter((d) => /^blender/i.test(d))
      .sort()
      .reverse()) {
      const inner = join(spot, dir, 'Blender.app/Contents/MacOS/Blender');
      if (existsSync(inner)) return inner;
    }
  }
  throw new Error('Blender not found: install it, or set BLENDER to its executable.');
}

/** Runs one model's script in its own Blender, its `[models]` lines passed on under the model's name as they come. Resolves to null, or to the end of what it printed if it failed. */
function blend(blender: string, model: string, args: string[]): Promise<string[] | null> {
  return new Promise((done) => {
    // (no __pycache__ left among the scripts: Blender's Python doesn't read the environment unless told to, so it is told both ways)
    const all = [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python-expr',
      'import sys; sys.dont_write_bytecode = True',
      '--python',
      join(here, `${model}.py`),
      '--',
      ...args,
    ];
    const child = spawn(blender, all, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
    const tail: string[] = [];
    for (const stream of [child.stdout, child.stderr])
      createInterface({ input: stream }).on('line', (line) => {
        tail.push(line);
        if (tail.length > 40) tail.shift();
        if (line.startsWith('[models]')) console.log(line.replace('[models]', `[${model}]`));
      });
    child.on('error', (e) => done([String(e)]));
    child.on('close', (status) => done(status === 0 ? null : [...tail, `(Blender ended with ${status ?? 'a signal'})`]));
  });
}

const kB = (bytes: number) => `${Math.round(bytes / 1024)} kB`;

async function main(argv: string[]): Promise<number> {
  // (--pack-only and --out are for working on this file: pack the .glb files already there, or in a folder of copies, without Blender)
  const flags = new Set<string>();
  const asked: string[] = [];
  let out = MODELS_DIR;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) out = resolve(argv[++i]);
    else if (a === '--preview' || a === '--pack-only') flags.add(a);
    else if (a.startsWith('-')) return usage(`Unknown flag ${a} (there is: --preview)`);
    else if (!MODELS.includes(a)) return usage(`No such model: ${a} (there are: ${MODELS.join(', ')})`);
    else asked.push(a);
  }
  const packOnly = flags.has('--pack-only');
  const todo = MODELS.filter((m) => (!asked.length || asked.includes(m)) && existsSync(packOnly ? join(out, `${m}.glb`) : join(here, `${m}.py`)));
  if (!todo.length) return usage('Nothing to build.');
  let blender: string | null = null;
  try {
    blender = findBlender();
  } catch (e) {
    if (!packOnly) return usage((e as Error).message);
  }
  const version = blender ? (spawnSync(blender, ['--version'], { encoding: 'utf8' }).stdout ?? '').split('\n')[0].trim() : '';
  const work = join(here, 'out');
  // (what Blender writes, before packing: kept, to look at or to compare; with --out, in that folder)
  const raw = join(out === MODELS_DIR ? work : out, 'raw');
  mkdirSync(out, { recursive: true });
  if (!packOnly) mkdirSync(raw, { recursive: true });
  // (the scripts as they are now, before Blender reads them: one edited while it runs is not what was built)
  const sources = new Map(todo.map((m) => [m, sourceHash(m)]));

  const start = Date.now();
  const built = await Promise.all(
    todo.map(async (m) => {
      const secs = () => `${((Date.now() - start) / 1000).toFixed(1)} s`;
      try {
        let from = join(out, `${m}.glb`);
        if (!packOnly) {
          from = join(raw, `${m}.glb`);
          const failed = await blend(blender!, m, ['--out', raw, '--blend', work, ...(flags.has('--preview') ? ['--preview', work] : [])]);
          if (failed) throw new Error(`${m}.py failed. The end of what Blender said:\n${failed.join('\n')}`);
          if (!existsSync(from) || statSync(from).mtimeMs < start - 2000) throw new Error(`${m}.py ended well but wrote no ${from}`);
        }
        const before = readFileSync(from);
        const notes: string[] = [];
        const after = pack(before, notes);
        same(before, after);
        put(join(out, `${m}.glb`), after);
        console.log(`[${m}] packed ${kB(before.length)} to ${kB(after.length)}${notes.length ? ` (${notes.join('; ')})` : ''}, ${secs()}`);
        return { m, bytes: after.length, line: `${m.padEnd(7)}${secs().padStart(8)}  ${kB(before.length).padStart(7)} to ${kB(after.length)}` };
      } catch (e) {
        console.error(`[${m}] ${(e as Error).message}`);
        return { m, bytes: 0, line: `${m.padEnd(7)}${secs().padStart(8)}  FAILED (see above)` };
      }
    }),
  );

  // the manifest: only the models built just now change in it (read again here: another build may have written its own meanwhile)
  const manifest = readManifest(out);
  for (const b of built) if (b.bytes) manifest[b.m] = { sources: sources.get(b.m)!, pack: PACK, blender: version || manifest[b.m]?.blender || 'unknown', bytes: b.bytes };
  const known = Object.keys(manifest).sort((x, y) => (MODELS.indexOf(x) + 1 || 99) - (MODELS.indexOf(y) + 1 || 99) || x.localeCompare(y));
  if (built.some((b) => b.bytes)) put(join(out, 'manifest.json'), `${JSON.stringify(Object.fromEntries(known.map((k) => [k, manifest[k]])), null, 2)}\n`);
  for (const b of built) console.log(`[models] ${b.line}`);
  return built.every((b) => b.bytes) ? 0 : 1;
}

function usage(message: string): number {
  console.error(`${message}\nnpm run models:build [-- ${MODELS.join('|')}] [--preview]`);
  return 1;
}

// (only when run, not when the test reads pack and sourceHash from here)
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main(process.argv.slice(2)).then((code) => (process.exitCode = code));
