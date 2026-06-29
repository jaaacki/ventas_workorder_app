import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma.js', () => ({
  prisma: {},
}));

import { buildOAuthCallbackUrl } from '../oauth.js';

describe('OAuth callback URL handling', () => {
  it('preserves provider callback params that route validation does not model', () => {
    const callbackUrl = buildOAuthCallbackUrl(
      'https://stg-workorder.ventas.bio/api/auth/oauth/google/callback',
      '/api/auth/oauth/google/callback?state=s1&iss=https%3A%2F%2Faccounts.google.com&code=c1&scope=email+profile+openid&authuser=0&prompt=consent'
    );

    expect(callbackUrl.toString()).toBe(
      'https://stg-workorder.ventas.bio/api/auth/oauth/google/callback?state=s1&iss=https%3A%2F%2Faccounts.google.com&code=c1&scope=email+profile+openid&authuser=0&prompt=consent'
    );
    expect(callbackUrl.searchParams.get('iss')).toBe('https://accounts.google.com');
  });
});
