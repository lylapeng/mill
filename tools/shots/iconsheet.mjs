// each candidate large, then at WeChat list sizes on light and dark, plus a 32px squint
import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 250 * files.length + 40, height: 420 } });
await p.setContent(`<body style="margin:0;font:14px sans-serif;display:flex;gap:20px;padding:20px;background:#ededed">${files.map((f) => `
<div style="width:230px;text-align:center"><img src="${img(f)}" style="width:230px;height:230px;border-radius:50%">
<div style="margin:6px 0 10px">${f.split('/').pop().replace('.png', '')}</div>
<div style="display:flex;gap:8px;justify-content:center;align-items:center">
<div style="background:#fff;padding:7px;border-radius:8px;display:flex;align-items:center;gap:6px"><img src="${img(f)}" style="width:48px;height:48px;border-radius:50%">拉磨</div>
<div style="background:#191919;color:#ddd;padding:7px;border-radius:8px;display:flex;align-items:center;gap:6px"><img src="${img(f)}" style="width:32px;height:32px;border-radius:50%">拉磨</div></div></div>`).join('')}</body>`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
