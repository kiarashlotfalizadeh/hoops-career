// Dev helper: print the schema and a sample row of a Parquet file. Usage: tsx peek-parquet.ts <file> [needle]
import { readFileSync } from 'node:fs';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from './college';

async function main() {
  const buf = readFileSync(process.argv[2]);
  const rows = await parquetReadObjects({ file: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), compressors });
  console.log(rows.length, 'rows; columns:', Object.keys(rows[0]).join(', '));
  const needle = process.argv[3];
  const ex = needle ? rows.find((r) => JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)).includes(needle)) : rows[0];
  console.log(JSON.stringify(ex, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)).slice(0, 2500));
}
if (process.argv[1]?.endsWith('peek-parquet.ts')) void main();
