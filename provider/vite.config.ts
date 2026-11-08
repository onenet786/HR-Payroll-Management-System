import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// OneNet Provider Console web app: npm run provider:build → provider/dist (served by provider/server.cjs).
export default defineConfig({
  root: path.resolve(__dirname, 'web'),
  base: '/',
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve(__dirname, 'dist'), emptyOutDir: true },
  server: { port: 3200, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8200', changeOrigin: true } } },
});
