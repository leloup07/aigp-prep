import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// singlefile inlines JS/CSS so dist/index.html opens straight from disk (file://)
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  // allow the Mac's Bonjour name (e.g. Enriques-MacBook-Pro.local) so the iPad can reach it on the LAN
  server: { allowedHosts: ['.local'] },
  preview: { allowedHosts: ['.local'] },
  test: { environment: 'node' },
} as any);
