import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  root: 'renderer',
  resolve: { alias: { '@core': path.resolve(__dirname, 'core') } },
  plugins: [
    react(),
    electron({
      main: {
        entry: path.resolve(__dirname, 'electron/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['better-sqlite3', 'electron', 'fsevents']
            }
          }
        }
      },
      preload: {
        input: path.resolve(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron']
            }
          }
        }
      }
    })
  ]
});
