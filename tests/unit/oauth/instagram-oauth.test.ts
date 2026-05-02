import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { InstagramOAuthClient } from '../../../src/oauth/instagram-oauth.client';
import { HttpClient } from '../../../src/core/http-client.service';
import { resolveConfig } from '../../../src/core/config';
import { META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER, INSTAGRAM_OAUTH_OPTIONS } from '../../../src/meta-sdk.constants';
import { noopLogger } from '../../../src/core/logger.token';
import { isOk, isErr } from '../../../src/core/result';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function build() {
  const cfg = resolveConfig({ maxRetries: 0 });
  const m = await Test.createTestingModule({
    providers: [
      HttpClient, InstagramOAuthClient,
      { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
      { provide: META_SDK_LOGGER, useValue: noopLogger },
      { provide: INSTAGRAM_OAUTH_OPTIONS, useValue: { clientId: 'igcid', clientSecret: 'igsec', redirectUri: 'https://app/ig/cb' } },
    ],
  }).compile();
  return m.get(InstagramOAuthClient);
}

describe('InstagramOAuthClient', () => {
  it('buildAuthUrl uses Instagram authorize endpoint', async () => {
    const c = await build();
    const url = c.buildAuthUrl({ state: 'st' });
    expect(url).toContain('https://www.instagram.com/oauth/authorize');
    expect(url).toContain('client_id=igcid');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=instagram_business_basic');
  });

  it('exchangeCodeForToken POSTs form-encoded', async () => {
    let body = ''; let ct = '';
    server.use(http.post('https://api.instagram.com/oauth/access_token', async ({ request }) => {
      body = await request.text();
      ct = request.headers.get('content-type') ?? '';
      return HttpResponse.json({ access_token: 'igtok', user_id: 12345 });
    }));
    const c = await build();
    const r = await c.exchangeCodeForToken('code');
    expect(ct).toContain('application/x-www-form-urlencoded');
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=code');
    if (isOk(r)) {
      expect(r.value.accessToken).toBe('igtok');
      expect(r.value.userId).toBe('12345');
    }
  });

  it('exchangeForLongLivedToken hits graph.instagram.com', async () => {
    let url = '';
    server.use(http.get('https://graph.instagram.com/access_token', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ access_token: 'igLong', token_type: 'bearer', expires_in: 5184000 });
    }));
    const c = await build();
    await c.exchangeForLongLivedToken('short');
    expect(url).toContain('grant_type=ig_exchange_token');
    expect(url).toContain('client_secret=igsec');
  });

  it('refreshLongLivedToken hits ig_refresh_token', async () => {
    let url = '';
    server.use(http.get('https://graph.instagram.com/refresh_access_token', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ access_token: 'igLong2', token_type: 'bearer', expires_in: 5184000 });
    }));
    const c = await build();
    await c.refreshLongLivedToken('long');
    expect(url).toContain('grant_type=ig_refresh_token');
    expect(url).toContain('access_token=long');
  });

  it('getMe returns IG account', async () => {
    server.use(http.get('https://graph.instagram.com/me', () =>
      HttpResponse.json({ id: 'ig123', username: 'foo', account_type: 'BUSINESS' })));
    const c = await build();
    const r = await c.getMe('tok');
    if (isOk(r)) {
      expect(r.value.username).toBe('foo');
      expect(r.value.accountType).toBe('BUSINESS');
    }
  });

  it('returns Err on bad code', async () => {
    server.use(http.post('https://api.instagram.com/oauth/access_token', () =>
      HttpResponse.json({ error_type: 'OAuthException', code: 400, error_message: 'bad' }, { status: 400 })));
    const c = await build();
    expect(isErr(await c.exchangeCodeForToken('bad'))).toBe(true);
  });
});
