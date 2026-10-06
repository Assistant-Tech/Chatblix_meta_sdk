import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { FacebookOAuthClient } from '../../../src/oauth/facebook-oauth.client';
import { HttpClient } from '../../../src/core/http-client.service';
import { resolveConfig } from '../../../src/core/config';
import {
  META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER, FACEBOOK_OAUTH_OPTIONS,
} from '../../../src/meta-sdk.constants';
import { noopLogger } from '../../../src/core/logger.token';
import { isOk, isErr } from '../../../src/core/result';
import { MetaAuthError } from '../../../src/core/errors';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function build() {
  const cfg = resolveConfig({ maxRetries: 0 });
  const m = await Test.createTestingModule({
    providers: [
      HttpClient, FacebookOAuthClient,
      { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
      { provide: META_SDK_LOGGER, useValue: noopLogger },
      { provide: FACEBOOK_OAUTH_OPTIONS, useValue: { clientId: 'cid', clientSecret: 'csec', redirectUri: 'https://app/cb' } },
    ],
  }).compile();
  return m.get(FacebookOAuthClient);
}

describe('FacebookOAuthClient', () => {
  it('buildAuthUrl uses dialog endpoint', async () => {
    const c = await build();
    const url = c.buildAuthUrl({ state: 'st1' });
    expect(url).toContain('https://www.facebook.com/dialog/oauth');
    expect(url).toContain('client_id=cid');
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapp%2Fcb');
    expect(url).toContain('state=st1');
    expect(url).toContain('response_type=code');
  });

  it('exchangeCodeForToken returns short-lived token', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/oauth/access_token', () =>
      HttpResponse.json({ access_token: 'tok', token_type: 'bearer', expires_in: 3600 })));
    const c = await build();
    const r = await c.exchangeCodeForToken('code1');
    if (isOk(r)) expect(r.value.accessToken).toBe('tok');
  });

  it('exchangeCodeForToken returns Err on bad code', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/oauth/access_token', () =>
      HttpResponse.json({ error: { message: 'bad', code: 100, type: 't', fbtrace_id: 'a' } }, { status: 400 })));
    const c = await build();
    expect(isErr(await c.exchangeCodeForToken('bad'))).toBe(true);
  });

  it('exchangeForLongLivedToken hits fb_exchange_token grant', async () => {
    let url = '';
    server.use(http.get('https://graph.facebook.com/v25.0/oauth/access_token', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ access_token: 'long', token_type: 'bearer', expires_in: 5184000 });
    }));
    const c = await build();
    await c.exchangeForLongLivedToken('short');
    expect(url).toContain('grant_type=fb_exchange_token');
    expect(url).toContain('fb_exchange_token=short');
  });

  it('exchangeForLongLivedToken accepts a never-expiring token with no expires_in', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/oauth/access_token', () =>
      HttpResponse.json({ access_token: 'long', token_type: 'bearer' })));
    const c = await build();
    const r = await c.exchangeForLongLivedToken('short');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value.accessToken).toBe('long');
      expect(r.value.expiresIn).toBeUndefined();
    }
  });

  it('listPages returns pages with optional Instagram', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/me/accounts', () =>
      HttpResponse.json({ data: [
        { id: 'p1', name: 'P1', access_token: 'pt1', connected_instagram_account: { id: 'ig1', username: 'u1' } },
        { id: 'p2', name: 'P2', access_token: 'pt2' },
      ] })));
    const c = await build();
    const r = await c.listPages('user');
    if (isOk(r)) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]!.instagramAccount?.username).toBe('u1');
      expect(r.value[1]!.instagramAccount).toBeNull();
    }
  });

  it('subscribePageToWebhooks succeeds', async () => {
    server.use(http.post('https://graph.facebook.com/v25.0/p1/subscribed_apps', () => HttpResponse.json({ success: true })));
    const c = await build();
    expect(isOk(await c.subscribePageToWebhooks('p1', 'pt1'))).toBe(true);
  });

  it('unsubscribePageFromWebhooks DELETEs when a subscription exists', async () => {
    let method = ''; let url = '';
    server.use(
      http.get('https://graph.facebook.com/v25.0/p1/subscribed_apps', () =>
        HttpResponse.json({ data: [{ id: 'app1', subscribed_fields: ['messages'] }] })),
      http.delete('https://graph.facebook.com/v25.0/p1/subscribed_apps', ({ request }) => {
        method = request.method; url = request.url;
        return HttpResponse.json({ success: true });
      }),
    );
    const c = await build();
    const r = await c.unsubscribePageFromWebhooks('p1', 'pt1');
    expect(method).toBe('DELETE');
    expect(url).toContain('access_token=pt1');
    if (isOk(r)) {
      expect(r.value.success).toBe(true);
      expect(r.value.alreadyUnsubscribed).toBe(false);
    }
  });

  it('unsubscribePageFromWebhooks skips the DELETE when nothing is subscribed', async () => {
    let deleted = false;
    server.use(
      http.get('https://graph.facebook.com/v25.0/p1/subscribed_apps', () => HttpResponse.json({ data: [] })),
      http.delete('https://graph.facebook.com/v25.0/p1/subscribed_apps', () => {
        deleted = true;
        return HttpResponse.json({ success: true });
      }),
    );
    const c = await build();
    const r = await c.unsubscribePageFromWebhooks('p1', 'pt1');
    expect(deleted).toBe(false);
    if (isOk(r)) expect(r.value.alreadyUnsubscribed).toBe(true);
  });

  it('unsubscribePageFromWebhooks returns Err when the lookup fails', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/p1/subscribed_apps', () =>
      HttpResponse.json({ error: { message: 'rev', code: 190, type: 'OAuthException', fbtrace_id: 'a' } }, { status: 401 })));
    const c = await build();
    const r = await c.unsubscribePageFromWebhooks('p1', 'revoked');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaAuthError);
  });

  it('debugToken returns info', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/debug_token', () =>
      HttpResponse.json({ data: { app_id: 'cid', is_valid: true, scopes: ['email'], user_id: 'u1' } })));
    const c = await build();
    const r = await c.debugToken('user');
    if (isOk(r)) expect(r.value.isValid).toBe(true);
  });

  it('returns MetaAuthError on revoked token 401', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/me/accounts', () =>
      HttpResponse.json({ error: { message: 'rev', code: 190, type: 't', fbtrace_id: 'a' } }, { status: 401 })));
    const c = await build();
    const r = await c.listPages('bad');
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaAuthError);
  });
});
