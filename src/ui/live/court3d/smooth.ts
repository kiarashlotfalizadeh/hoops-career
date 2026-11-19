// A man seen close: every triangle of his split in four, the new points not on the flat of it but on the curve his
// normals say his skin and his kit have there (a point-normal triangle's: Vlachos et al.), so his outline is round
// where it was a run of straight edges (his skull, his jaw, his shoulders, the round of an arm, his armholes). His
// points as they were stay where they were, and every attribute of a new point is the mean of its edge's two ends
// (his bones' weights the four that hang on it most of both). A point that is two in the model (a seam in a picture)
// is one place on him: the curve of an edge is worked out from the place, so the two sides of a seam meet.
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/** Past this turn between the two ends' normals (its cosine) an edge is a crease, not a curve: left straight. */
const CREASE = 0.35;

/** `geo` split in four, its outline on the curves of its normals: see the file's head. `grid` (ft): points this close are one place. */
export function smoothed(geo: BufferGeometry, grid = 1e-4): BufferGeometry {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const shape = geo.getAttribute('aShape') as BufferAttribute | undefined;
  const index = geo.index!;
  const n = pos.count;
  // (each point where it is on him, his own face's shape on it; and which point of the model stands for that place)
  const at = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) at[v * 3 + c] = pos.getComponent(v, c) + (shape ? shape.getComponent(v, c) : 0);
  const place = new Int32Array(n);
  const first = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const key = `${Math.round(at[v * 3] / grid)},${Math.round(at[v * 3 + 1] / grid)},${Math.round(at[v * 3 + 2] / grid)}`;
    const was = first.get(key);
    if (was === undefined) first.set(key, v);
    place[v] = was ?? v;
  }
  // (the way each place faces: its points' normals together)
  const way = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let c = 0; c < 3; c++) way[place[v] * 3 + c] += nor.getComponent(v, c);
  for (let v = 0; v < n; v++) {
    if (place[v] !== v) continue;
    const l = Math.hypot(way[v * 3], way[v * 3 + 1], way[v * 3 + 2]) || 1;
    for (let c = 0; c < 3; c++) way[v * 3 + c] /= l;
  }

  // the new points: one for each edge of the model's points (a seam's two sides each their own, on one curve)
  const tris = index.count / 3;
  const mid = new Map<number, number>();
  const ends: number[] = [];
  const midOf = (a: number, b: number) => {
    const key = a < b ? a * n + b : b * n + a;
    let m = mid.get(key);
    if (m === undefined) {
      m = n + ends.length / 2;
      mid.set(key, m);
      ends.push(Math.min(a, b), Math.max(a, b));
    }
    return m;
  };
  const out = new Uint32Array(tris * 12);
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
    const [ab, bc, ca] = [midOf(a, b), midOf(b, c), midOf(c, a)];
    out.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], t * 12);
  }
  const added = ends.length / 2;
  const total = n + added;

  const g = new BufferGeometry();
  const P = new Vector3();
  const Q = new Vector3();
  const A = new Vector3();
  const B = new Vector3();
  for (const [name, attr] of Object.entries(geo.attributes) as [string, BufferAttribute][]) {
    const size = attr.itemSize;
    const Arr = attr.array.constructor as new (k: number) => Float32Array | Uint16Array | Uint8Array;
    const arr = new Arr(total * size);
    arr.set(attr.array as ArrayLike<number>);
    if (name === 'skinIndex' || name === 'skinWeight') continue;
    for (let e = 0; e < added; e++) {
      const [i, j] = [ends[e * 2], ends[e * 2 + 1]];
      for (let c = 0; c < size; c++) arr[(n + e) * size + c] = (attr.getComponent(i, c) + attr.getComponent(j, c)) / 2;
    }
    if (name === 'normal')
      for (let e = 0; e < added; e++) {
        const o = (n + e) * 3;
        const l = Math.hypot(arr[o], arr[o + 1], arr[o + 2]) || 1;
        for (let c = 0; c < 3; c++) arr[o + c] /= l;
      }
    if (name === 'position')
      // (on the curve: off the straight edge's middle by as far as each end's normal says the surface bends toward
      // the other: the cubic through both ends, square to each one's normal, at its middle)
      for (let e = 0; e < added; e++) {
        const [i, j] = [place[ends[e * 2]], place[ends[e * 2 + 1]]];
        A.fromArray(way, i * 3);
        B.fromArray(way, j * 3);
        if (A.dot(B) < CREASE) continue;
        P.fromArray(at, j * 3).sub(Q.fromArray(at, i * 3));
        const bend = A.multiplyScalar(P.dot(A))
          .sub(B.multiplyScalar(P.dot(B)))
          .multiplyScalar(-1 / 8);
        const o = (n + e) * 3;
        arr[o] += bend.x;
        arr[o + 1] += bend.y;
        arr[o + 2] += bend.z;
      }
    g.setAttribute(name, new BufferAttribute(arr, size, attr.normalized));
  }
  // (his bones: the four that hang on the new point most, of both its ends', half each, made to come to one)
  const si = geo.getAttribute('skinIndex') as BufferAttribute | undefined;
  const sw = geo.getAttribute('skinWeight') as BufferAttribute | undefined;
  if (si && sw) {
    const idx = new (si.array.constructor as new (k: number) => Uint16Array)(total * 4);
    const wt = new Float32Array(total * 4);
    idx.set(si.array as ArrayLike<number>);
    wt.set(sw.array as ArrayLike<number>);
    const bone: number[] = [];
    const w: number[] = [];
    for (let e = 0; e < added; e++) {
      bone.length = w.length = 0;
      for (const v of [ends[e * 2], ends[e * 2 + 1]])
        for (let c = 0; c < 4; c++) {
          const k = si.getComponent(v, c);
          const x = sw.getComponent(v, c) / 2;
          if (x <= 0) continue;
          const had = bone.indexOf(k);
          if (had >= 0) w[had] += x;
          else {
            bone.push(k);
            w.push(x);
          }
        }
      const order = bone.map((_k, i) => i).sort((p, q) => w[q] - w[p]);
      const kept = order.slice(0, 4);
      const sum = kept.reduce((s, i) => s + w[i], 0) || 1;
      kept.forEach((i, c) => {
        idx[(n + e) * 4 + c] = bone[i];
        wt[(n + e) * 4 + c] = w[i] / sum;
      });
    }
    g.setAttribute('skinIndex', new BufferAttribute(idx, 4, si.normalized));
    g.setAttribute('skinWeight', new BufferAttribute(wt, 4, sw.normalized));
  }
  g.setIndex(new BufferAttribute(out, 1));
  g.userData = { ...geo.userData };
  return g;
}
