import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    include: ['src/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
  },
});
