// usage: node shot.mjs <outDir> <name>=<query>[@<waitMs>][#<script>] ...
import { chromium } from 'playwright';

const [outDir, ...specs] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
for (const spec of specs) {
  const name = spec.slice(0, spec.indexOf('=')), rest = spec.slice(spec.indexOf('=') + 1);
  const hash = rest.indexOf('#'); const qAndWait = hash < 0 ? rest : rest.slice(0, hash); const script = hash < 0 ? '' : rest.slice(hash + 1);
  const [query, wait] = qAndWait.split('@');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto((process.env.MILL_URL ?? 'http://localhost:5199/') + query);
  await page.waitForTimeout(Number(wait ?? 4000));
  if (script) {
    await page.evaluate(script);
    await page.waitForTimeout(Number(process.env.AFTER ?? 2500));
  }
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, logs.filter((l) => !l.includes('[vite]')).slice(0, 8).join('\n  '));
  await ctx.close();
}
await browser.close();
