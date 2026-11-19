import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000
  }
});
