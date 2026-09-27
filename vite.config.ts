import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is served behind the sandbox preview proxy (https://<port>-<id>.e2b.app),
// so the dev server must bind to all interfaces and accept that host/origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true as unknown as string[],
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true as unknown as string[],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
