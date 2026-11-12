// The 3D court's models: what Blender builds (scripts/blender, npm run models:build) against what the
// app does with it (live/court3d). The .glb files in the repo are read as the app reads them; a name,
// a bone or a list the app relies on, a file older than its script, or a file the reader should have
// turned away, fails here and not as a blank court on someone's phone.
import { describe, expect, it } from 'vitest';
import { figureGeo } from '../live/court3d/figure';
import { merged, placed, readGlb, type Thing } from '../live/court3d/glb';

/** The bones the puppet drives (court3d/figure.ts keeps the same names in its `B`; it is not exported). */
const BONES = ['pelvis', 'chest', 'head', 'ual', 'fal', 'hal', 'uar', 'far', 'har', 'thl', 'shl', 'ftl', 'thr', 'shr', 'ftr', 'hem', 'hemL', 'hemR'];
/** The materials the app has a look for (court3d/figure.ts `wear`, court3d/arena.ts `dress`, court3d/props.ts: none of them exports its list). */
const PLAYER = ['skin', 'hair', 'jersey', 'trim', 'cloth', 'shoe', 'white'];
const COACH = [...PLAYER, 'suit', 'shirt', 'tie'];
const ARENA = ['pad', 'steel', 'team', 'edge', 'glass', 'clock', 'iron', 'cord', 'seat', 'dark', 'board', 'screen', 'ribbon', 'leather', 'seam'];
const FAN = ['fan'];
const PROPS = ['ball', 'chair', 'hoop', 'net', 'rim', 'scoreboard', 'table'];

type List = { data: Float32Array | Uint8Array | Uint16Array; type: string; normalized?: boolean };
const CODE = (a: List['data']) => (a instanceof Uint8Array ? 5121 : a instanceof Uint16Array ? 5123 : 5126);
const COMPS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** A .glb's container round its JSON and its numbers; `between` puts a chunk of some other kind before the numbers. */
function wrap(json: unknown, bin: Uint8Array, between = false): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const chunk = (type: number, data: Uint8Array, fill: number) => {
    const out = new Uint8Array(8 + ((data.length + 3) & ~3)).fill(fill);
    new DataView(out.buffer).setUint32(0, out.length - 8, true);
    new DataView(out.buffer).setUint32(4, type, true);
    out.set(data, 8);
    return out;
  };
  const chunks = [chunk(0x4e4f534a, text, 0x20), ...(between ? [chunk(0x41525458, new Uint8Array(6), 7)] : []), chunk(0x004e4942, bin, 0)];
  const out = new Uint8Array(12 + chunks.reduce((n, c) => n + c.length, 0));
  const head = new DataView(out.buffer);
  head.setUint32(0, 0x46546c67, true);
  head.setUint32(4, 2, true);
  head.setUint32(8, out.length, true);
  let at = 12;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** A small model the way Blender writes one (floats, a list to a view): a skinned thing `man`, two up from the floor, a part to a material. */
function model(parts: { material: string; lists: Record<string, List>; index: number[] }[], change?: (json: { accessors: { count: number }[] }) => void): Uint8Array {
  const blobs: Uint8Array[] = [];
  const accessors: { bufferView: number; componentType: number; normalized?: boolean; count: number; type: string }[] = [];
  const add = (l: List) => {
    const bytes = new Uint8Array((l.data.byteLength + 3) & ~3);
    bytes.set(new Uint8Array(l.data.buffer, l.data.byteOffset, l.data.byteLength));
    blobs.push(bytes);
    accessors.push({ bufferView: blobs.length - 1, componentType: CODE(l.data), ...(l.normalized && { normalized: true }), count: l.data.length / COMPS[l.type], type: l.type });
    return accessors.length - 1;
  };
  const primitives = parts.map((p, k) => ({
    attributes: Object.fromEntries(Object.entries(p.lists).map(([key, l]) => [key, add(l)])),
    indices: add({ data: Uint16Array.from(p.index), type: 'SCALAR' }),
    material: k,
  }));
  // (two bones: the second a step to the side)
  const inverse = new Float32Array(32);
  for (const k of [0, 5, 10, 15, 16, 21, 26, 31]) inverse[k] = 1;
  inverse[28] = -1;
  const skin = add({ data: inverse, type: 'MAT4' });
  let at = 0;
  const json = {
    asset: { version: '2.0' },
    nodes: [{ name: 'hip' }, { name: 'top' }, { name: 'man', mesh: 0, skin: 0, translation: [0, 2, 0] }],
    materials: parts.map((p) => ({ name: p.material })),
    meshes: [{ name: 'man', primitives }],
    skins: [{ joints: [0, 1], inverseBindMatrices: skin }],
    accessors,
    bufferViews: blobs.map((b) => ({ buffer: 0, byteOffset: (at += b.length) - b.length, byteLength: b.length })),
    buffers: [{ byteLength: at }],
  };
  change?.(json);
  const bin = new Uint8Array(at);
  for (const [k, b] of blobs.entries()) bin.set(b, json.bufferViews[k].byteOffset);
  return wrap(json, bin);
}

/** A part's lists for `n` points in a row along x: a normal that leans, a colour, a uv that runs past 1, two bones (their weights told short of one). */
function lists(n: number, bone = 1): Record<string, List> {
  const each = (per: number[]) => Array.from({ length: n }, () => per).flat();
  return {
    POSITION: { data: Float32Array.from({ length: n * 3 }, (_v, k) => (k % 3 === 0 ? k / 3 : k % 3 === 1 ? ((k - 1) / 3) % 2 : 0)), type: 'VEC3' },
    NORMAL: { data: Float32Array.from(each([0.6, 0, 0.8])), type: 'VEC3' },
    TEXCOORD_0: { data: Float32Array.from(each([1.25, 0.25])), type: 'VEC2' },
    COLOR_0: { data: Uint16Array.from(each([65535, 32768, 0, 65535])), type: 'VEC4', normalized: true },
    JOINTS_0: { data: Uint8Array.from(each([0, bone, 0, 0])), type: 'VEC4' },
    WEIGHTS_0: { data: Float32Array.from(each([0.5, 0.25, 0, 0])), type: 'VEC4' },
  };
}

const most = (of: ArrayLike<number>) => Array.from(of).reduce((m, v) => Math.max(m, v), -Infinity);
const triangles = (thing: Thing) => thing.parts.reduce((n, p) => n + (p.geo.index?.count ?? p.geo.getAttribute('position').count) / 3, 0);

describe("the 3D court's models", () => {
  it('are what the app expects of them, what the scripts on disk build, and read by a reader that turns a bad file away', async () => {
    const fs = (await import('node:fs' as string)) as { readFileSync: (path: URL) => Uint8Array; existsSync: (path: URL) => boolean };
    const run = (await import('../../../scripts/blender/run' as string)) as {
      PACK: number;
      SOURCES: Record<string, string[]>;
      sourceHash: (model: string) => string;
      pack: (file: Uint8Array) => Uint8Array;
      same: (before: Uint8Array, after: Uint8Array) => void;
    };
    const at = (name: string) => new URL(`../live/court3d/models/${name}`, import.meta.url);

    // the reader, on a small model made here: as Blender writes it, then as the build packs it
    {
      // (the vest: four points and two triangles, told with a fifth point that is the first again and a sixth no triangle uses)
      const vest = lists(6);
      for (const l of Object.values(vest)) l.data.copyWithin((l.data.length / 6) * 4, 0, l.data.length / 6);
      const raw = model([
        { material: 'jersey', lists: vest, index: [0, 1, 2, 4, 2, 3] },
        { material: 'skin', lists: lists(3), index: [0, 1, 2] },
      ]);
      const packed = run.pack(raw);
      expect(packed.length).toBeLessThan(raw.length);
      expect(() => run.same(raw, packed)).not.toThrow();
      // (packing a packed file changes nothing)
      expect([...run.pack(packed)]).toEqual([...packed]);
      // (a chunk of some other kind in the middle of the file is stepped over)
      const walked = wrap(
        JSON.parse(new TextDecoder().decode(raw.subarray(20, 20 + new DataView(raw.buffer).getUint32(12, true)))),
        raw.subarray(28 + new DataView(raw.buffer).getUint32(12, true)),
        true,
      );
      for (const [file, points] of [
        [raw, 6],
        [walked, 6],
        [packed, 4],
      ] as const) {
        const man = readGlb(file).get('man')!;
        expect(man.matrix.elements[13]).toBe(2);
        expect(man.bones!.map((b) => b.name)).toEqual(['hip', 'top']);
        expect(man.bones![1].inverse.elements[12]).toBe(-1);
        expect(man.parts.map((p) => p.material)).toEqual(['jersey', 'skin']);
        const geo = man.parts[0].geo;
        const list = (name: string) => geo.getAttribute(name);
        expect(list('position').count).toBe(points);
        expect(triangles(man)).toBe(3);
        expect(most(geo.index!.array)).toBeLessThan(points);
        // (the last corner is the fourth point whichever way the file counts its points; floats in every list but the bones')
        const v = geo.index!.array[5];
        expect([list('position').getX(v), list('position').getY(v), list('position').getZ(v)]).toEqual([3, 1, 0]);
        expect(list('normal').array).toBeInstanceOf(Float32Array);
        expect(list('normal').getX(v)).toBeCloseTo(0.6, 2);
        expect(list('normal').getZ(v)).toBeCloseTo(0.8, 2);
        // (a colour is three numbers; the picture's top is at 1 here, and its u runs on past 1 untouched)
        expect(list('color').itemSize).toBe(3);
        expect([list('color').getX(v), list('color').getY(v), list('color').getZ(v)].map((c) => Math.round(c * 255))).toEqual([255, 128, 0]);
        expect([list('uv').getX(v), list('uv').getY(v)]).toEqual([1.25, 0.75]);
        // (weights told short of one, or in bytes, come out adding up to one)
        expect(list('skinIndex').array).toBeInstanceOf(Uint16Array);
        expect([list('skinIndex').getX(v), list('skinIndex').getY(v)]).toEqual([0, 1]);
        expect(list('skinWeight').getX(v)).toBeCloseTo(2 / 3, 2);
        expect(list('skinWeight').getX(v) + list('skinWeight').getY(v) + list('skinWeight').getZ(v) + list('skinWeight').getW(v)).toBeCloseTo(1, 6);
        // (only a part the app paints a picture on keeps its uv when packed; as one shape the rest have zeros)
        expect(!!man.parts[1].geo.getAttribute('uv')).toBe(file !== packed);
        expect(placed(man)[1].geo.getAttribute('position').getY(0)).toBe(2);
        const one = merged(man);
        expect(one.geo.groups.length).toBe(2);
        expect(one.geo.getAttribute('uv').count).toBe(points + 3);
      }

      // a file that is not one, or is cut short, or says more than it holds, is turned away with what is wrong
      const broken = (change: (bytes: Uint8Array, head: DataView) => Uint8Array | void) => {
        const bytes = raw.slice();
        return () => readGlb(change(bytes, new DataView(bytes.buffer)) ?? bytes);
      };
      expect(broken((b) => void (b[0] = 0x47))).toThrow(/not one/);
      expect(() => readGlb(new ArrayBuffer(4))).toThrow(/not one/);
      expect(broken((_b, head) => head.setUint32(4, 1, true))).toThrow(/version 1/);
      expect(broken((b) => b.subarray(0, b.length - 40))).toThrow(/cut short/);
      expect(broken((b, head) => head.setUint32(12, b.length, true))).toThrow(/chunk runs past the end/);
      expect(broken((b) => void (b[20] = 0x7d))).toThrow(/JSON chunk does not parse/);
      const part = (change: (l: Record<string, List>) => void, index = [0, 1, 2], json?: Parameters<typeof model>[1]) => {
        const l = lists(3);
        change(l);
        return () => readGlb(model([{ material: 'skin', lists: l, index }], json));
      };
      expect(part(() => {})).not.toThrow();
      expect(part((l) => void (l.POSITION.data[4] = NaN))).toThrow(/not a number/);
      expect(part((l) => void (l.NORMAL.data = l.NORMAL.data.subarray(0, 6)))).toThrow(/2 of NORMAL for 3 points/);
      expect(part((l) => void l.WEIGHTS_0.data.fill(0, 4, 8))).toThrow(/hangs on no bone/);
      expect(part((l) => void (l.JOINTS_0.data[5] = 2))).toThrow(/a bone it does not have/);
      expect(part(() => {}, [0, 1, 3])).toThrow(/a point it does not have/);
      expect(
        part(
          () => {},
          [0, 1, 2],
          (json) => void (json.accessors[0].count = 300),
        ),
      ).toThrow(/runs past its data/);
    }

    // each file was built from the scripts as they are now, and is the file that build wrote (said softly: what follows still tells what is wrong with the models themselves)
    {
      const manifest = (fs.existsSync(at('manifest.json')) ? JSON.parse(new TextDecoder().decode(fs.readFileSync(at('manifest.json')))) : {}) as Record<
        string,
        { sources: string; pack: number; blender: string; bytes: number } | undefined
      >;
      for (const m of ['figure', 'people', 'arena']) {
        const built = manifest[m];
        const again = `run "npm run models:build ${m}" (and commit the .glb with its script)`;
        expect.soft(built, `${m}.glb is not in court3d/models/manifest.json: ${again}`).toBeDefined();
        if (!built) continue;
        expect.soft(built.sources, `scripts/blender/${run.SOURCES[m].join(' or ')} changed after ${m}.glb was built: ${again}`).toBe(run.sourceHash(m));
        expect.soft(built.pack, `${m}.glb was packed another way than scripts/blender/run.ts packs now: ${again}`).toBe(run.PACK);
        expect
          .soft(fs.readFileSync(at(`${m}.glb`)).length, `${m}.glb is not the file the build wrote (a model changes in its .py, never by hand or by Blender alone): ${again}`)
          .toBe(built.bytes);
        expect(built.blender).toMatch(/\S/);
      }
    }

    const files = Object.fromEntries(['figure', 'people', 'arena'].map((m) => [m, readGlb(fs.readFileSync(at(`${m}.glb`)))]));
    const { figure, people, arena } = files;
    // (the spectator is one of the building's things: the benches' file holds only the benches)
    const fans = [arena.get('fan')].filter((t) => t !== undefined);

    // every thing the app asks for is there, in materials it has a look for, and nothing in any list is not a number
    {
      expect([...figure.keys()]).toEqual(['figure']);
      expect([...people.keys()].sort()).toEqual(['benchA', 'benchB', 'coach']);
      expect([...arena.keys()]).toEqual(expect.arrayContaining(PROPS));
      expect(fans.length).toBe(1);
      for (const [file, things] of Object.entries(files))
        for (const [name, thing] of things) {
          const known = name === 'fan' || name === 'fanFar' ? FAN : file === 'arena' ? ARENA : name === 'coach' ? COACH : PLAYER;
          expect(thing.parts.length).toBeGreaterThan(0);
          for (const p of thing.parts) {
            const tag = `${file}.glb ${name} (${p.material})`;
            expect(known, `${tag}: a material the app has no look for`).toContain(p.material);
            expect(p.geo.index, `${tag}: no triangles`).toBeTruthy();
            expect(Object.keys(p.geo.attributes), tag).toEqual(expect.arrayContaining(['position', 'normal']));
            for (const [list, a] of Object.entries(p.geo.attributes))
              expect(Array.from(a.array).every(Number.isFinite), `${tag}: ${list} holds something that is not a number`).toBe(true);
            // (normals are one long)
            const n = p.geo.getAttribute('normal');
            let off = 0;
            for (let i = 0; i < n.count; i++) off = Math.max(off, Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1));
            expect(off, `${tag}: a normal that is not one long`).toBeLessThan(0.05);
          }
        }
      // (hair is on its way: allowed, not yet asked for)
      expect(figure.get('figure')!.parts.map((p) => p.material)).toEqual(expect.arrayContaining(PLAYER.filter((m) => m !== 'hair')));
    }

    // the player: one skin on the puppet's 18 bones, every point of it on at most four of them, their weights adding up to one
    {
      const fig = figure.get('figure')!;
      expect(fig.bones!.map((b) => b.name).sort()).toEqual([...BONES].sort());
      for (const b of fig.bones!) expect(b.inverse.elements.every(Number.isFinite), `figure.glb: ${b.name}'s way back`).toBe(true);
      for (const p of fig.parts) {
        const [on, by] = [p.geo.getAttribute('skinIndex'), p.geo.getAttribute('skinWeight')];
        expect(Object.keys(p.geo.attributes), `figure (${p.material})`).toEqual(expect.arrayContaining(['color', 'skinIndex', 'skinWeight']));
        expect([on.itemSize, by.itemSize]).toEqual([4, 4]);
        expect(most(on.array)).toBeLessThan(BONES.length);
        let off = 0;
        for (let i = 0; i < by.count; i++) off = Math.max(off, Math.abs(by.getX(i) + by.getY(i) + by.getZ(i) + by.getW(i) - 1));
        expect(off, `figure (${p.material}): weights that do not add up to one`).toBeLessThan(0.02);
      }
      // (the vest's picture, his number, goes on by its uv; as one shape every part has one)
      expect(fig.parts.find((p) => p.material === 'jersey')!.geo.getAttribute('uv')).toBeTruthy();
      expect(merged(fig).geo.getAttribute('uv').count).toBe(fig.parts.reduce((n, p) => n + p.geo.getAttribute('position').count, 0));
      expect(triangles(fig)).toBeLessThanOrEqual(15_000);
      // as the app dresses him: one shape for one material, every point of him somewhere on his sheet, and no
      // triangle stretched across it (one across two of its pictures, or a picture's seam, would show the others in between)
      const geo = figureGeo((o) => o, figure);
      expect(geo.body.groups.length).toBe(0);
      const uv = geo.body.getAttribute('uv');
      expect(Math.min(...Array.from(uv.array)), 'a point off the sheet').toBeGreaterThanOrEqual(0);
      expect(most(uv.array), 'a point off the sheet').toBeLessThanOrEqual(1);
      const corners = geo.body.index!.array;
      let wide = 0;
      for (let f = 0; f < corners.length; f += 3)
        for (const get of [uv.getX.bind(uv), uv.getY.bind(uv)]) {
          const v = [0, 1, 2].map((k) => get(corners[f + k]));
          wide = Math.max(wide, Math.max(...v) - Math.min(...v));
        }
      // (the widest of one picture's own are at the crown of his head, where its picture meets at a point: under a fifth of the sheet)
      expect(wide, 'a triangle stretched across the sheet').toBeLessThan(0.19);
      expect(geo.shorts[1] - geo.shorts[0]).toBeGreaterThan(1);
    }

    // the benches and the coach: the player's body posed and baked (no skin), on the floor, his vest's uv kept
    {
      for (const name of ['benchA', 'benchB', 'coach']) {
        const who = people.get(name)!;
        expect(who.bones).toBeUndefined();
        let low = Infinity;
        for (const p of placed(who)) {
          expect(Object.keys(p.geo.attributes), `${name} (${p.material})`).toContain('color');
          expect(p.geo.getAttribute('skinIndex')).toBeUndefined();
          p.geo.computeBoundingBox();
          low = Math.min(low, p.geo.boundingBox!.min.y);
        }
        expect(Math.abs(low), `${name} is not on the floor (his lowest point is at y = ${low.toFixed(3)})`).toBeLessThan(0.08);
        // (the coach's thing is two men: the head coach on his feet and his assistant on the first chair)
        expect(triangles(who)).toBeLessThanOrEqual(name === 'coach' ? 13_000 : 8_000);
      }
      for (const name of ['benchA', 'benchB'])
        expect(
          people
            .get(name)!
            .parts.find((p) => p.material === 'jersey')!
            .geo.getAttribute('uv'),
        ).toBeTruthy();
    }

    // the spectator: a few triangles, each point marked with the part of him it is (the crowd's shader moves him by it)
    {
      for (const fan of fans) {
        expect(fan.parts.length).toBe(1);
        expect(triangles(fan)).toBeLessThanOrEqual(200);
        const marks = fan.parts[0].geo.getAttribute('aPart');
        expect(marks?.itemSize).toBe(1);
        // (0 trunk, 1 head, 2 and 3 arms, 4 legs; the shader tells them apart half way between, so a mark may carry a little more: a quarter for an end in its own colour)
        const whole = new Set(Array.from(marks.array, Math.round));
        expect([...whole].sort()).toEqual(expect.arrayContaining([0, 1, 2, 3, 4]));
        expect(most(marks.array)).toBeLessThanOrEqual(6.3);
        expect(-most(Array.from(marks.array, (v) => -v))).toBeGreaterThanOrEqual(0);
        expect(most(Array.from(marks.array, (v) => Math.abs(v - Math.round(v))))).toBeLessThanOrEqual(0.3);
      }
      // his stand-in in the floor's mirror: a trunk and a head, a sixth of him
      const far = arena.get('fanFar')!;
      expect(triangles(far)).toBeLessThanOrEqual(40);
      expect(new Set(Array.from(far.parts[0].geo.getAttribute('aPart').array, Math.round))).toEqual(new Set([0, 1]));
    }

    // the building's props, all of them together, stay cheap; the table's LED front keeps the uv its picture goes on by
    {
      expect(PROPS.reduce((n, name) => n + triangles(arena.get(name)!), 0)).toBeLessThanOrEqual(12_000);
      expect(
        arena
          .get('table')!
          .parts.find((p) => p.material === 'board')!
          .geo.getAttribute('uv'),
      ).toBeTruthy();
    }
  });
});
