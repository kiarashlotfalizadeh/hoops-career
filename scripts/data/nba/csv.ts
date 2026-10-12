// Streaming CSV reader for the large NBA.com archives: rows are streamed straight out of the
// .tar.xz (system `tar`), never unpacked to disk.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Split one CSV line, honoring double-quoted fields with embedded commas and "" escapes. */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Stream rows of the first CSV inside a .tar.xz as header-keyed accessors. Throws when tar fails
 * (a missing, truncated or non-archive file), which would otherwise read as an empty season.
 */
export async function* tarCsvRows(file: string): AsyncGenerator<(col: string) => string> {
  const child = spawn('tar', ['-xJOf', file]);
  // listened for from the start: tar may exit before the last line is read
  const exit = new Promise<number | null>((r) => child.on('close', r));
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = splitCsv(line);
    if (!idx) {
      idx = Object.fromEntries(cells.map((h, i) => [h, i]));
      continue;
    }
    const map = idx;
    yield (col: string) => cells[map[col]] ?? '';
  }
  const code = await exit;
  if (code !== 0) throw new Error(`could not read ${file} (tar exited with ${code}): ${stderr.trim()}`);
}
