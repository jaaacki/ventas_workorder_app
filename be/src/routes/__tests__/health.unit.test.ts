import { describe, it, expect } from 'vitest';
import { healthRoutes } from '../health.js';

// Lightweight unit test that exercises the route plugin without starting HTTP.
describe('healthRoutes', () => {
  it('registers a get route', async () => {
    const registeredRoutes: Array<{ method: string; url: string; schema: unknown }> = [];
    const fakeApp = {
      get: (url: string, options: { schema: unknown }, _handler: () => Promise<{ status: string }>) => {
        registeredRoutes.push({ method: 'GET', url, schema: options.schema });
        return fakeApp;
      },
    } as any;

    await healthRoutes(fakeApp);

    expect(registeredRoutes).toEqual([
      {
        method: 'GET',
        url: '/',
        schema: expect.objectContaining({
          tags: ['Health'],
          operationId: 'getHealth',
          'x-route-kind': 'health',
        }),
      },
    ]);
  });
});
