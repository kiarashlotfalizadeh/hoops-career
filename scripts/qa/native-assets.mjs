// Regenerates Android/iOS launcher icons and splash screens from public/icon.svg,
// matching the pixel size of each existing placeholder file.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const svg = readFileSync('public/icon.svg', 'utf8');
const artOnly = svg.replace(/<rect id="bg"[^>]*\/>/, '');
/** The icon with its art shrunk around the centre, for shapes that crop the corners (a round launcher icon). */
const inset = (k) => svg.replace(/<g id="art">[\s\S]*<\/svg>/, (m) => `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${m.replace('</svg>', '')}</g></svg>`);
// the splash's wordmark in the app's headline cut (Archivo, black and expanded, as the start screen sets it)
const font = readFileSync('node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2').toString('base64');
const face = `<style>@font-face{font-family:Archivo;src:url(data:font/woff2;base64,${font}) format('woff2-variations');font-weight:100 900;font-stretch:62% 125%}</style>`;
const paper = '#f3efe7';
const ink = '#121212';
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.png')) files.push(p);
  }
};
walk('android/app/src/main/res');
walk('ios/App/App/Assets.xcassets');
const dims = (p) => {
  const b = readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const browser = await chromium.launch();
for (const f of files) {
  const { w, h } = dims(f);
  const name = f.split('/').pop();
  let html;
  if (name.startsWith('ic_launcher_foreground')) {
    // adaptive icon foreground (on the paper of ic_launcher_background): the art within the inner 66% safe zone
    const s = Math.round(w * 0.58);
    html = `<div style="width:${w}px;height:${h}px;display:grid;place-items:center">${artOnly.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>`;
  } else if (name.startsWith('ic_launcher') || name.startsWith('AppIcon')) {
    const round = name.includes('round');
    // iOS rounds the corners itself and wants no transparency; a round icon crops the corners, so its art sits further in
    const icon = (round ? inset(0.84) : svg).replace('<svg ', `<svg width="${w}" height="${h}" `).replace('rx="112"', name.startsWith('AppIcon') ? 'rx="0"' : 'rx="112"');
    html = `<div style="width:${w}px;height:${h}px;${round ? 'border-radius:50%;overflow:hidden;' : ''}">${icon}</div>`;
  } else if (name.startsWith('splash')) {
    // iOS fills the screen with the square splash (cropping its sides on a phone): mark and wordmark stay in the middle third
    const s = Math.round(Math.min(w, h) * 0.2);
    html = `${face}<div style="width:${w}px;height:${h}px;background:${paper};display:grid;place-items:center"><div style="display:flex;flex-direction:column;align-items:center;gap:${Math.round(s * 0.12)}px">${artOnly.replace('<svg ', `<svg width="${s}" height="${s}" `)}<div style="font-family:Archivo;font-weight:900;font-stretch:118%;font-size:${Math.round(s * 0.2)}px;line-height:1;color:${ink};letter-spacing:-0.035em">Hoops Career</div></div></div>`;
  } else continue;
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: f, omitBackground: !name.startsWith('splash'), clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}
await browser.close();
console.log(`regenerated ${files.length} native assets`);
