import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'unit',
    include: ['src/**/*.unit.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
    // A few unit tests build the full Fastify server + generate the OpenAPI
    // document; that can exceed vitest's 5s default under cold CI load. Give the
    // suite headroom so those app-build tests don't flake (fast tests are unaffected).
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
