import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the packaged renderer (loaded via file://) resolves its
  // assets correctly. With the default '/', a packaged build white-screens.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false
  }
});
