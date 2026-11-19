import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'webview-ui'),
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src')
    }
  },
  build: {
    outDir: resolve(__dirname, 'media/webview'),
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      input: resolve(__dirname, 'webview-ui/index.html'),
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (info) => {
          if (info.name && info.name.endsWith('.css')) return 'main.css';
          return 'assets/[name][extname]';
        }
      }
    }
  },
  server: {
    fs: {
      allow: [resolve(__dirname)]
    }
  }
});
