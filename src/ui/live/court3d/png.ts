// Reads a picture the build wrote (a .png: scripts/blender/lib.py write_png, his skin's anatomy map) into
// its numbers. Only what those files hold: 8 bits a channel, not interlaced, grey or colour, with or
// without alpha (no palette, no 16 bits, no Adam7). Not a general PNG reader, and, like glb.ts, it says
// what is wrong with a file it can't read instead of handing on nonsense. Nothing here needs three.js;
// the unpacking is the browser's own (DecompressionStream), and a browser without it reads no picture
// (the court draws his skin as it did before there was a map: see models.ts).

/** A picture's numbers: `channels` to a pixel (1 grey, 2 grey and alpha, 3 colour, 4 colour and alpha), row by row from the file's first. */
export interface Picture {
  w: number;
  h: number;
  channels: number;
  data: Uint8Array;
}

/** A PNG's first eight bytes. */
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** How many channels each colour type has (the four these files can be). */
const CHANNELS: Record<number, number | undefined> = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** The picture in a .png's bytes (a file that isn't one, or is one of a kind these never are, throws). */
export async function decodePng(bytes: ArrayBuffer): Promise<Picture> {
  const file = new Uint8Array(bytes);
  if (file.length < 8 || SIGNATURE.some((b, i) => file[i] !== b)) throw new Error('png: not one');
  const view = new DataView(bytes);
  let [w, h, channels] = [0, 0, 0];
  const packed: Uint8Array[] = [];
  // (its chunks: a length, a kind, the chunk, and a check this reader leaves to the unpacking to fail)
  for (let at = 8; at + 12 <= file.length;) {
    const len = view.getUint32(at);
    const kind = String.fromCharCode(file[at + 4], file[at + 5], file[at + 6], file[at + 7]);
    if (at + 12 + len > file.length) throw new Error(`png: its ${kind} runs past the end`);
    if (kind === 'IHDR') {
      [w, h] = [view.getUint32(at + 8), view.getUint32(at + 12)];
      const [depth, type, interlace] = [file[at + 16], file[at + 17], file[at + 20]];
      channels = CHANNELS[type] ?? 0;
      if (depth !== 8 || !channels || interlace !== 0) throw new Error(`png: ${depth} bits, colour type ${type}, interlace ${interlace} (8 bits, not interlaced, no palette)`);
    } else if (kind === 'IDAT') packed.push(file.subarray(at + 8, at + 8 + len));
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (!w || !h || !packed.length) throw new Error('png: no picture in it');
  if (typeof DecompressionStream === 'undefined') throw new Error('png: this browser cannot unpack one');
  const raw = new Uint8Array(await new Response(new Blob(packed as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const row = w * channels;
  const stride = row + 1;
  if (raw.length !== h * stride) throw new Error(`png: ${raw.length} bytes unpacked, not ${h * stride}`);
  // each row's filter undone where it lies (none, from the left, from above, the two's mean, Paeth's guess), each on the
  // row as undone so far: its first pixel has nothing to its left, the first row nothing above it (a row of noughts)
  const zero = new Uint8Array(stride);
  const c = channels;
  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    const at = y * stride + 1;
    const [above, up] = y ? [raw, at - stride] : [zero, 1];
    switch (filter) {
      case 0:
        break;
      case 1:
        for (let x = c; x < row; x++) raw[at + x] += raw[at + x - c];
        break;
      case 2:
        for (let x = 0; x < row; x++) raw[at + x] += above[up + x];
        break;
      case 3:
        for (let x = 0; x < c; x++) raw[at + x] += above[up + x] >> 1;
        for (let x = c; x < row; x++) raw[at + x] += (raw[at + x - c] + above[up + x]) >> 1;
        break;
      case 4:
        for (let x = 0; x < c; x++) raw[at + x] += above[up + x];
        for (let x = c; x < row; x++) {
          const a = raw[at + x - c];
          const b = above[up + x];
          const d = above[up + x - c];
          const pa = b > d ? b - d : d - b;
          const pb = a > d ? a - d : d - a;
          const pc = Math.abs(a + b - 2 * d);
          raw[at + x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : d;
        }
        break;
      default:
        throw new Error(`png: row ${y} has filter ${filter}`);
    }
  }
  // (and the rows pushed together, each over the byte that told its filter)
  for (let y = 0; y < h; y++) raw.copyWithin(y * row, y * stride + 1, (y + 1) * stride);
  return { w, h, channels, data: raw.subarray(0, h * row) };
}
