// Subsets the Xiaohongshu mini tool's body font to the characters the game uses, as WOFF2
// (the package takes .woff/.woff2, not .ttf). Run from the repo root after changing any
// player-facing text, alongside tools/minigame/fonts.mjs:
//   node tools/xhs/fonts.mjs
// The title font is public/fonts/mashanzheng-lamo.woff2, already WOFF2. SIL OFL 1.1.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
});
const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const f of files('src')) for (const ch of readFileSync(f, 'utf8')) if (ch.codePointAt(0) > 0x2000) chars.add(ch);
// a few the code builds at runtime (dates, numbers) or a player might see later
for (const ch of '·…—　，。、？！：；“”‘’（）〇一二三四五六七八九十百千万亿') chars.add(ch);

const text = [...chars].sort().join('');
// a current browser's user agent gets WOFF2
const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Serif+SC&text=${encodeURIComponent(text)}`, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
})).text();
const url = css.match(/url\((.+?)\)\s*format\('woff2'\)/)?.[1];
if (!url) throw new Error(css.slice(0, 200));
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
writeFileSync('xhs/fonts/noto-serif-sc.woff2', buf);
console.log(chars.size, 'characters →', buf.length, 'bytes');
