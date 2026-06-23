import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// Single-app Vue SPA for the Financeiro module. Hosted at the root of its own
// subdomain (financeiro.softpinto.pt), so base is '/'. Built into
// <repo>/public/financeiro and served by Express (static + SPA fallback).
// `npm run dev` proxies /api to the Express backend on :3000.
export default defineConfig({
  root: path.resolve(__dirname, 'app'),
  base: '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@app': path.resolve(__dirname, 'app'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '..', 'public', 'financeiro'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
