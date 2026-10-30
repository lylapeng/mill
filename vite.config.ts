import { defineConfig } from 'vite';

// Relative base so the build works from any static host path (GitHub Pages etc.).
export default defineConfig({
  base: './',
  // three.js alone is ~600 kB; one chunk is fine for a game this size
  build: { chunkSizeWarningLimit: 900 },
});
