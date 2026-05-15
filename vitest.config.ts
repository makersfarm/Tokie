import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@core': path.resolve(__dirname, 'core') } },
  test: { environment: 'node', include: ['core/**/*.test.ts'] }
});
