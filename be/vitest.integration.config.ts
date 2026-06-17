import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'integration',
    include: ['src/**/*.integration.test.ts', 'src/__tests__/integration/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
  },
});
