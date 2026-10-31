import { chromium } from 'playwright';
import fs from 'node:fs';
const [out, ...files] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME });
const p = await b.newPage({ viewport: { width: 1290, height: 300 } });
await p.setContent(`<body style="margin:0;background:#111;display:flex;gap:5px;color:#eee;font:14px sans-serif">${files.map((f) => `<figure style="margin:0;width:425px"><img style="width:100%" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('')}</body>`);
await p.screenshot({ path: out, fullPage: true });
await b.close();
