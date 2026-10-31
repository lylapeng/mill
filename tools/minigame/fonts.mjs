// Subsets the mini game's fonts to the characters the game uses, as TTF (wx.loadFont
// wants TTF). Run from the repo root after changing any player-facing text:
//   node tools/minigame/fonts.mjs
// Google Fonts subsets via `text=`; an old user agent gets TTF instead of WOFF2.
// Both fonts are SIL OFL 1.1; their licence texts sit next to them.
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

async function subset(family, text, out) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`, {
    headers: { 'User-Agent': 'Mozilla/4.0' },
  })).text();
  const url = css.match(/url\((.+?)\)/)?.[1];
  if (!url) throw new Error(`${family}: ${css.slice(0, 200)}`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(out, buf);
  console.log(out, buf.length, 'bytes');
}

const text = [...chars].sort().join('');
console.log(chars.size, 'characters');
await subset('Noto+Serif+SC', text, 'minigame/fonts/noto-serif-sc.ttf');
await subset('Ma+Shan+Zheng', '拉磨', 'minigame/fonts/mashanzheng-lamo.ttf');
