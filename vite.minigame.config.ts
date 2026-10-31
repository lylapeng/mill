import { cpSync, mkdirSync } from 'node:fs';
import { defineConfig } from 'vite';

// The WeChat mini game: one classic-script bundle (game.js) plus the package files.
// Output goes to dist-minigame/, which is what WeChat DevTools opens. Not emptied on
// build, so DevTools' own project.private.config.json survives.
const out = 'dist-minigame';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: false,
    // iOS 14's JavaScriptCore is the oldest engine that matters (WebGL2 needs it anyway)
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    lib: {
      entry: 'src/minigame/main.ts',
      formats: ['iife'],
      name: 'Mill',
      fileName: () => 'game.js',
    },
  },
  plugins: [
    {
      name: 'minigame-package',
      closeBundle() {
        mkdirSync(out, { recursive: true });
        cpSync('minigame', out, { recursive: true });
        cpSync('public/models', `${out}/models`, { recursive: true });
        cpSync('public/fonts/OFL-MaShanZheng.txt', `${out}/fonts/OFL-MaShanZheng.txt`);
      },
    },
  ],
});
