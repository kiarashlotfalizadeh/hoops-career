// Reads a model Blender wrote (a .glb: see scripts/blender) into three.js shapes. Only what those
// files hold: meshes with their material's name, where each sits, and a skin's bones. Not a general
// glTF loader (three's is a fifth of the scene's download; these files need a hundred lines of it).
// It reads a file as Blender writes it and as the build packs it afterwards (scripts/blender/run.ts:
// normals, colours and weights as whole numbers, a list's entries spaced four bytes apart), and says
// what is wrong with a file it can't read instead of drawing nonsense.
import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One part of a mesh: its shape, and the name of the material Blender gave it. */
export interface Part {
  geo: BufferGeometry;
  material: string;
}

/** A thing in the file: its name, where it sits, its mesh's parts, and the bones its skin hangs on. */
export interface Thing {
  name: string;
  matrix: Matrix4;
  parts: Part[];
  /** Each bone's name and the way back from the standing body to it, in the order the skin counts them. */
  bones?: { name: string; inverse: Matrix4 }[];
}

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  normalized?: boolean;
  count: number;
  type: string;
  sparse?: unknown;
  min?: number[];
  max?: number[];
}
/** What a .glb says it holds (its JSON), as far as these files go. */
export interface Gltf {
  accessors?: Accessor[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; material?: number; mode?: number; targets?: unknown }[] }[];
  materials?: { name?: string }[];
  nodes?: { name?: string; mesh?: number; skin?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  skins?: { joints: number[]; inverseBindMatrices?: number }[];
}

type Numbers = Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array;

/** "glTF", and its two kinds of chunk: "JSON" and "BIN". */
const MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const SIZE: Record<string, number | undefined> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAY: Record<number, (new (bytes: ArrayBuffer) => Numbers) | undefined> = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
};
/** What three calls each of a mesh's lists. A list of the file's own (`_PART`) becomes `aPart`. */
const NAMES: Record<string, string> = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color', JOINTS_0: 'skinIndex', WEIGHTS_0: 'skinWeight' };
const own = (key: string) => `a${key[1]}${key.slice(2).toLowerCase()}`;

/** A .glb's two halves: what it holds (its JSON) and its numbers (its BIN), wherever in the file each chunk sits. */
export function chunks(file: ArrayBuffer | Uint8Array): { json: Gltf; bin: Uint8Array } {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(file);
  const head = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || head.getUint32(0, true) !== MAGIC) throw new Error('.glb: not one (it does not start with "glTF")');
  const version = head.getUint32(4, true);
  if (version !== 2) throw new Error(`.glb: version ${version} (only 2 is read)`);
  const length = head.getUint32(8, true);
  if (length > bytes.length) throw new Error(`.glb: cut short (it says ${length} bytes, ${bytes.length} came)`);
  let json: Gltf | null = null;
  let bin: Uint8Array | null = null;
  for (let at = 12; at < length;) {
    if (at + 8 > length) throw new Error(`.glb: a chunk's header runs past the end (at ${at} of ${length})`);
    const size = head.getUint32(at, true);
    const type = head.getUint32(at + 4, true);
    at += 8;
    if (at + size > length) throw new Error(`.glb: a chunk runs past the end (${size} bytes at ${at} of ${length})`);
    // (the first of each kind counts; a chunk of any other kind is stepped over)
    if (type === JSON_CHUNK && !json) {
      try {
        json = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + size))) as Gltf;
      } catch {
        throw new Error('.glb: its JSON chunk does not parse');
      }
    } else if (type === BIN_CHUNK && !bin) bin = bytes.subarray(at, at + size);
    at += size;
  }
  if (!json || typeof json !== 'object') throw new Error('.glb: no JSON chunk');
  return { json, bin: bin ?? new Uint8Array(0) };
}

/**
 * One of the file's lists of numbers, copied out: `raw` as the file keeps it, `array` the same as floats
 * when the file packed them into whole numbers (0..1, or -1..1). Never a list that runs off its data, or
 * a float that isn't a number.
 */
export function numbers(json: Gltf, bin: Uint8Array, i: number): { array: Numbers; raw: Numbers; size: number } {
  const a = json.accessors?.[i];
  if (!a) throw new Error(`.glb: no list ${i}`);
  const Kind = ARRAY[a.componentType];
  const size = SIZE[a.type];
  if (!Kind || !size) throw new Error(`.glb: list ${i} is of a kind this does not read (${a.componentType} ${a.type})`);
  const view = a.bufferView === undefined ? undefined : json.bufferViews?.[a.bufferView];
  if (!view || a.sparse) throw new Error(`.glb: list ${i} has no plain data`);
  if (view.buffer) throw new Error(`.glb: list ${i} is in another file`);
  const width = size * new Kind(new ArrayBuffer(0)).BYTES_PER_ELEMENT;
  // (entries sit `step` bytes apart: side by side, or spaced out so that each starts on a fourth byte)
  const step = view.byteStride || width;
  const from = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const viewEnd = (view.byteOffset ?? 0) + view.byteLength;
  const end = a.count > 0 ? from + (a.count - 1) * step + width : from;
  if (!Number.isInteger(a.count) || a.count < 0 || !Number.isInteger(from) || from < 0 || step < width || end > viewEnd || viewEnd > bin.length)
    throw new Error(`.glb: list ${i} runs past its data (${a.count} x ${a.type}, bytes ${from} to ${end} of ${bin.length})`);
  const bytes = new Uint8Array(a.count * width);
  if (step === width) bytes.set(bin.subarray(from, end));
  else for (let k = 0; k < a.count; k++) bytes.set(bin.subarray(from + k * step, from + k * step + width), k * width);
  const raw = new Kind(bytes.buffer);
  if (raw instanceof Float32Array) {
    for (let k = 0; k < raw.length; k++) if (!Number.isFinite(raw[k])) throw new Error(`.glb: list ${i} holds something that is not a number (entry ${Math.floor(k / size)})`);
    return { array: raw, raw, size };
  }
  if (!a.normalized) return { array: raw, raw, size };
  const top = raw instanceof Uint8Array ? 255 : raw instanceof Uint16Array ? 65535 : raw instanceof Int8Array ? 127 : raw instanceof Int16Array ? 32767 : 4294967295;
  return { array: Float32Array.from(raw, (v) => Math.max(-1, v / top)), raw, size };
}

export function readGlb(file: ArrayBuffer | Uint8Array): Map<string, Thing> {
  const { json, bin } = chunks(file);
  const list = (i: number) => numbers(json, bin, i);
  const nodes = json.nodes ?? [];

  // where each thing sits: its own place, in its parent's
  const local = nodes.map((n) => {
    if (n.matrix) return new Matrix4().fromArray(n.matrix);
    const [t, r, s] = [n.translation ?? [0, 0, 0], n.rotation ?? [0, 0, 0, 1], n.scale ?? [1, 1, 1]];
    return new Matrix4().compose(new Vector3(t[0], t[1], t[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(s[0], s[1], s[2]));
  });
  const world: Matrix4[] = [];
  const kids = new Set(nodes.flatMap((n) => n.children ?? []));
  const walk = (i: number, parent: Matrix4 | null) => {
    if (!nodes[i] || world[i]) throw new Error(`.glb: its things are not a tree (at ${i})`);
    world[i] = parent ? parent.clone().multiply(local[i]) : local[i];
    for (const c of nodes[i].children ?? []) walk(c, world[i]);
  };
  nodes.forEach((_n, i) => !kids.has(i) && walk(i, null));

  const out = new Map<string, Thing>();
  nodes.forEach((node, i) => {
    if (node.mesh === undefined) return;
    const name = node.name ?? `mesh${i}`;
    const mesh = json.meshes?.[node.mesh];
    if (!mesh || !world[i]) throw new Error(`.glb: ${name} has no mesh`);
    const parts = mesh.primitives.map((prim): Part => {
      const material = (prim.material !== undefined && json.materials?.[prim.material]?.name) || '';
      const bad = (what: string) => new Error(`.glb: ${name} (${material}) ${what}`);
      if ((prim.mode ?? 4) !== 4) throw bad('is not made of triangles');
      if (prim.attributes.POSITION === undefined) throw bad('has no points');
      const geo = new BufferGeometry();
      const points = json.accessors?.[prim.attributes.POSITION]?.count ?? 0;
      for (const [key, acc] of Object.entries(prim.attributes)) {
        const attr = NAMES[key] ?? (key.startsWith('_') ? own(key) : null);
        if (!attr) continue;
        const { array, size } = list(acc);
        if (array.length !== points * size) throw bad(`has ${array.length / size} of ${key} for ${points} points`);
        // (a colour is its three numbers here: the fourth says nothing)
        if (attr === 'color' && size === 4) {
          const rgb = new Float32Array(points * 3);
          for (let k = 0; k < rgb.length; k++) rgb[k] = array[k + Math.floor(k / 3)];
          geo.setAttribute(attr, new BufferAttribute(rgb, 3));
        } else if (attr === 'skinIndex') geo.setAttribute(attr, new BufferAttribute(Uint16Array.from(array), size));
        else if (attr === 'skinWeight') {
          // (a point's weights add up to one: packed into bytes, or written by hand, they may be a hair off)
          const w = Float32Array.from(array);
          for (let k = 0; k < w.length; k += size) {
            let sum = 0;
            for (let c = 0; c < size; c++) sum += w[k + c];
            if (!(sum > 0)) throw bad(`has a point (${k / size}) that hangs on no bone`);
            for (let c = 0; c < size; c++) w[k + c] /= sum;
          }
          geo.setAttribute(attr, new BufferAttribute(w, size));
        } else if (attr === 'uv') {
          // (Blender's picture has its top at 1, as three's own textures do: the file keeps it upside down)
          const uv = Float32Array.from(array);
          for (let k = 1; k < uv.length; k += 2) uv[k] = 1 - uv[k];
          geo.setAttribute(attr, new BufferAttribute(uv, 2));
        } else geo.setAttribute(attr, new BufferAttribute(array, size));
      }
      if (prim.indices !== undefined) {
        const { raw } = list(prim.indices);
        for (let k = 0; k < raw.length; k++) if (raw[k] >= points) throw bad(`has a triangle on a point it does not have (${raw[k]} of ${points})`);
        geo.setIndex(new BufferAttribute(raw instanceof Uint32Array ? raw : Uint16Array.from(raw), 1));
      }
      return { geo, material };
    });
    const thing: Thing = { name, matrix: world[i], parts };
    const skin = node.skin === undefined ? undefined : json.skins?.[node.skin];
    if (skin) {
      const inv = skin.inverseBindMatrices === undefined ? null : list(skin.inverseBindMatrices).array;
      if (!inv || inv.length < skin.joints.length * 16) throw new Error(`.glb: ${name}'s skin does not say where its bones were`);
      thing.bones = skin.joints.map((j, k) => ({ name: nodes[j]?.name ?? '', inverse: new Matrix4().fromArray(inv, k * 16) }));
      const reach = thing.bones.length;
      for (const p of parts) {
        const on = p.geo.getAttribute('skinIndex');
        if (!on || !p.geo.getAttribute('skinWeight')) throw new Error(`.glb: ${name} (${p.material}) has a skin but hangs on no bones`);
        for (let k = 0; k < on.array.length; k++)
          if (on.array[k] >= reach) throw new Error(`.glb: ${name} (${p.material}) hangs on a bone it does not have (${on.array[k]} of ${reach})`);
      }
    }
    out.set(name, thing);
  });
  return out;
}

/** A thing's parts as one shape, moved to where the thing sits (for what never moves: a chair, a basket). */
export function placed(thing: Thing): Part[] {
  return thing.parts.map((p) => ({ geo: p.geo.clone().applyMatrix4(thing.matrix), material: p.material }));
}

/** A thing's parts as one shape with a group for each (in the parts' order), for one mesh with a material a part. */
export function merged(thing: Thing): { geo: BufferGeometry; materials: string[] } {
  // (one shape needs every list on every part: where a part has none, the vest's uv on the skin, it's zeros)
  const lists = new Map(thing.parts.flatMap((p) => Object.entries(p.geo.attributes)));
  for (const p of thing.parts)
    for (const [name, like] of lists) {
      if (p.geo.getAttribute(name)) continue;
      const Kind = like.array.constructor as new (length: number) => Numbers;
      p.geo.setAttribute(name, new BufferAttribute(new Kind(p.geo.getAttribute('position').count * like.itemSize), like.itemSize, like.normalized));
    }
  const geo = mergeGeometries(
    thing.parts.map((p) => p.geo),
    true,
  );
  if (!geo) throw new Error(`${thing.name}: its parts don't match`);
  return { geo, materials: thing.parts.map((p) => p.material) };
}
