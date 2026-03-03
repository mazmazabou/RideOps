import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/app/',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/campus-themes.js': 'http://localhost:3000',
      '/favicon.svg': 'http://localhost:3000',
      '/demo-config.js': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        rider: resolve(__dirname, 'index.html'),
        driver: resolve(__dirname, 'driver.html'),
        office: resolve(__dirname, 'office.html'),
      },
    },
  },
});
