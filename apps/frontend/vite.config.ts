import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The SPA is served by the Web Tier in production (built into web-tier/public).
// In local `vite dev`, proxy API calls to the Web Tier so the browser only ever
// talks to the single public entry point (mirrors the report's single DNS entry, §2.3.5).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
