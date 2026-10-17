// Renders public/icon.svg to the PNG sizes the PWA manifest and iOS need, plus the 1024 px
// master in resources/ (kept out of public/, which is precached and shipped).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [size, path] of [
  [192, 'public/icon-192.png'],
  [512, 'public/icon-512.png'],
  [180, 'public/apple-touch-icon.png'],
  [1024, 'resources/icon.png'],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
// maskable: full-bleed background, artwork inside the 80% safe zone so launchers can crop it to any shape
{
  const size = 512;
  const masked = svg
    .replace('rx="112"', '')
    .replace(/<g id="art">[\s\S]*<\/svg>/, (m) => `<g transform="translate(256 256) scale(0.78) translate(-256 -256)">${m.replace('</svg>', '')}</g></svg>`);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${masked.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: 'public/icon-maskable-512.png', clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('icons written');
