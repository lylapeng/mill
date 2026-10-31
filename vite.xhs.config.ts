import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The Xiaohongshu mini tool: an offline page in a WebView with a strict CSP. One classic
// script (no type="module"), ES2017 for Chrome 61, every file in the package, no fetch —
// so each model ships as a script that drops its base64 into window.__millFiles.
// Output goes to dist-xhs/; `npm run build:xhs` zips it.
const out = 'dist-xhs';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    target: ['es2017', 'chrome61'],
    chunkSizeWarningLimit: 1200,
    lib: {
      entry: 'src/xhs/main.ts',
      formats: ['iife'],
      name: 'Mill',
      fileName: () => 'main.js',
    },
  },
  plugins: [
    {
      name: 'xhs-package',
      // The container has no network. What's left of fetch — three.js loaders this game
      // never calls, the web version's readFile — goes to a stub that refuses.
      renderChunk(code) {
        const stub = 'var __millNoNetwork = function () { return Promise.reject(new Error("no network in the mini tool")); };\n';
        return { code: stub + code.replace(/(^|[^.\w$])fetch\(/g, '$1__millNoNetwork('), map: null };
      },
      closeBundle() {
        mkdirSync(`${out}/models`, { recursive: true });
        mkdirSync(`${out}/fonts`, { recursive: true });
        cpSync('xhs/index.html', `${out}/index.html`);
        for (const f of readdirSync('public/models').filter((f) => f.endsWith('.glb'))) {
          const b64 = readFileSync(`public/models/${f}`).toString('base64');
          writeFileSync(
            `${out}/models/${f.replace(/\.glb$/, '.js')}`,
            `(window.__millFiles = window.__millFiles || {})[${JSON.stringify(`models/${f}`)}] = "${b64}";\n`,
          );
        }
        cpSync('xhs/fonts/noto-serif-sc.woff2', `${out}/fonts/noto-serif-sc.woff2`);
        cpSync('public/fonts/mashanzheng-lamo.woff2', `${out}/fonts/mashanzheng-lamo.woff2`);
        const licence = (name: string, file: string) =>
          `/* ${name}\n\n${readFileSync(file, 'utf8').replace(/\*\//g, '* /')}\n*/\n`;
        writeFileSync(
          `${out}/style.css`,
          licence('Noto Serif SC (fonts/noto-serif-sc.woff2)', 'minigame/fonts/OFL-NotoSerifSC.txt') +
            licence('Ma Shan Zheng (fonts/mashanzheng-lamo.woff2)', 'public/fonts/OFL-MaShanZheng.txt') +
            readFileSync('xhs/style.css', 'utf8'),
        );
        for (const f of readdirSync(out)) if (f.endsWith('.map')) rmSync(`${out}/${f}`);

        // the container's banned list (minitool-zip-builder: device-capabilities §6, zip spec §3)
        const banned = [
          /(^|[^.\w$])fetch\(/, /XMLHttpRequest/, /new WebSocket\(/, /new EventSource\(/, /RTCPeerConnection/,
          /(^|[^.\w$])eval\(/, /new Function\(/, /WebAssembly\./, /new (Shared)?Worker\(/, /serviceWorker\.register/,
          /navigator\.(geolocation|clipboard|bluetooth|usb|hid|serial|getBattery|connection|credentials|locks)/,
          /requestFullscreen/, /window\.open\(/, /type="module"/, /<script>/, /\b(src|href)="https?:/, /url\(['"]?https?:/,
        ];
        for (const f of ['index.html', 'style.css', 'main.js']) {
          const text = readFileSync(`${out}/${f}`, 'utf8');
          for (const re of banned) if (re.test(text)) throw new Error(`${f}: banned in the mini tool: ${re}`);
        }
      },
    },
  ],
});
