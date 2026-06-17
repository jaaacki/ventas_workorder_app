import { describe, it, expect } from 'vitest';
import { healthRoutes } from '../health.js';

// Lightweight unit test that exercises the route plugin without starting HTTP.
describe('healthRoutes', () => {
  it('registers a get route', async () => {
    const registeredRoutes: Array<{ method: string; url: string }> = [];
    const fakeApp = {
      get: (url: string, _handler: () => Promise<{ status: string }>) => {
        registeredRoutes.push({ method: 'GET', url });
        return fakeApp;
      },
    } as any;

    await healthRoutes(fakeApp);

    expect(registeredRoutes).toEqual([{ method: 'GET', url: '/' }]);
  });
});
