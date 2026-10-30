import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    // three.js arrives as its own lazily loaded chunk (~700 kB, ~180 kB gzipped);
    // the app shell stays well under this.
    chunkSizeWarningLimit: 800,
  },
})
