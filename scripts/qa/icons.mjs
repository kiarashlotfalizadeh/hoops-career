// Renders public/icon.svg to the PNG sizes the PWA manifest and iOS need.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const [size, name, pad] of [
  [192, 'icon-192.png', 0],
  [512, 'icon-512.png', 0],
  [180, 'apple-touch-icon.png', 0],
  [1024, 'icon-1024.png', 0],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${name}`, omitBackground: true, clip: { x: pad, y: pad, width: size, height: size } });
  await page.close();
}
// maskable: full-bleed background, artwork inside the 80% safe zone so launchers can crop it to any shape
{
  const size = 512;
  const masked = svg
    .replace('rx="112"', '')
    .replace(/<circle[\s\S]*<\/svg>/, (m) => `<g transform="translate(256 256) scale(0.78) translate(-256 -256)">${m.replace('</svg>', '')}</g></svg>`);
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0">${masked.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: 'public/icon-maskable-512.png', clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log('icons written');
