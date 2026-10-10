// Regenerates Android/iOS launcher icons and splash screens from public/icon.svg,
// matching the pixel size of each existing placeholder file.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const svg = readFileSync('public/icon.svg', 'utf8');
const ballOnly = svg.replace(/<rect[^>]*fill="url\(#bg\)"\/>/, '');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.png')) files.push(p); } };
walk('android/app/src/main/res');
walk('ios/App/App/Assets.xcassets');
const dims = (p) => { const b = readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
const browser = await chromium.launch();
for (const f of files) {
  const { w, h } = dims(f);
  const name = f.split('/').pop();
  let html;
  if (name.startsWith('ic_launcher_foreground')) {
    // adaptive icon foreground: content within the inner 66% safe zone
    const s = Math.round(w * 0.62);
    html = `<div style="width:${w}px;height:${h}px;display:grid;place-items:center">${ballOnly.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`;
  } else if (name.startsWith('ic_launcher') || name.startsWith('AppIcon')) {
    const round = name.includes('round');
    html = `<div style="width:${w}px;height:${h}px;${round ? 'border-radius:50%;overflow:hidden;' : ''}">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `).replace('rx="112"', name.startsWith('AppIcon') ? 'rx="0"' : 'rx="112"')}</div>`;
  } else if (name.startsWith('splash')) {
    const s = Math.round(Math.min(w, h) * 0.28);
    html = `<div style="width:${w}px;height:${h}px;background:#06080c;display:grid;place-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(s * 0.12)}px">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}<div style="font:800 ${Math.round(s * 0.22)}px sans-serif;color:#eef2f7;letter-spacing:0.06em">HOOPS CAREER</div></div></div>`;
  } else continue;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path: f, omitBackground: !name.startsWith('splash'), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}
await browser.close();
console.log(`regenerated ${files.length} native assets`);
