// usage: node icon.mjs <outDir> <name>=<query> ...   renders stage(name) at 1024x1024
import { chromium } from 'playwright';
import fs from 'node:fs';
const [outDir, ...specs] = process.argv.slice(2);
const stage = fs.readFileSync(new URL('./stage.js', import.meta.url), 'utf8');
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
for (const spec of specs) {
  const i = spec.indexOf('=');
  const name = spec.slice(0, i), query = spec.slice(i + 1);
  const ctx = await browser.newContext({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto((process.env.MILL_URL ?? 'http://localhost:5199/') + query);
  await page.waitForTimeout(3500);
  await page.addScriptTag({ content: stage });
  await page.evaluate((n) => window.stage(n), name);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, errs.join(' | '));
  await ctx.close();
}
await browser.close();
