import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma.js', () => ({
  prisma: {},
}));

import { buildOAuthCallbackUrl, isProviderConfigured, normalizeCertificateThumbprint } from '../oauth.js';

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

describe('OAuth provider configuration', () => {
  const baseConfig = {
    issuerUrl: 'https://login.microsoftonline.com/common/v2.0',
    scope: 'openid email profile',
    clientId: 'client-id',
    clientSecret: undefined,
    privateKey: undefined,
    privateKeyFile: undefined,
    certificate: undefined,
    certificateFile: undefined,
    certificateThumbprint: undefined,
    redirectUri: 'https://stg-workorder.ventas.bio/api/auth/oauth/microsoft/callback',
  };

  it('allows Microsoft certificate auth without a client secret', () => {
    expect(
      isProviderConfigured({
        ...baseConfig,
        privateKeyFile: '/run/secrets/workorder-ms.key',
        certificateThumbprint: 'A5:D2:31:23:C1:C6:ED:C1:C3:DE:32:35:A8:0C:7F:A6:E3:D9:69:F5',
      })
    ).toBe(true);
  });

  it('keeps client-secret auth configured as the fallback', () => {
    expect(isProviderConfigured({ ...baseConfig, clientSecret: 'secret' })).toBe(true);
  });

  it('requires thumbprint or certificate material with private-key auth', () => {
    expect(isProviderConfigured({ ...baseConfig, privateKeyFile: '/run/secrets/workorder-ms.key' })).toBe(false);
  });
});

describe('Microsoft certificate thumbprint normalization', () => {
  it('converts Azure colon-delimited SHA-1 thumbprints to x5t base64url', () => {
    expect(normalizeCertificateThumbprint('A5:D2:31:23:C1:C6:ED:C1:C3:DE:32:35:A8:0C:7F:A6:E3:D9:69:F5')).toBe(
      'pdIxI8HG7cHD3jI1qAx_puPZafU'
    );
  });

  it('passes through base64url x5t values', () => {
    expect(normalizeCertificateThumbprint('pdIxI8HG7cHD3jI1qAx_puPZafU')).toBe('pdIxI8HG7cHD3jI1qAx_puPZafU');
  });
});
