import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { InstagramMessagingClient } from '../../../src/messaging/instagram-messaging.client';
import { HttpClient } from '../../../src/core/http-client.service';
import { resolveConfig } from '../../../src/core/config';
import { META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER } from '../../../src/meta-sdk.constants';
import { noopLogger } from '../../../src/core/logger.token';
import { isOk } from '../../../src/core/result';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function build() {
  const cfg = resolveConfig({ maxRetries: 0 });
  const m = await Test.createTestingModule({
    providers: [
      HttpClient, InstagramMessagingClient,
      { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
      { provide: META_SDK_LOGGER, useValue: noopLogger },
    ],
  }).compile();
  return m.get(InstagramMessagingClient);
}

describe('InstagramMessagingClient', () => {
  it('instagram-login mode posts to graph.instagram.com/{ig}/messages', async () => {
    let url = '';
    server.use(http.post('https://graph.instagram.com/v25.0/ig1/messages', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ recipient_id: 'r', message_id: 'm' });
    }));
    const c = await build();
    const r = await c.sendMessage({ mode: 'instagram-login', igUserId: 'ig1', accessToken: 'tok', request: { recipientId: 'r', message: { text: 'hi' } } });
    expect(url).toContain('graph.instagram.com');
    expect(isOk(r)).toBe(true);
  });

  it('facebook-login mode posts to graph.facebook.com/me/messages', async () => {
    let url = '';
    server.use(http.post('https://graph.facebook.com/v25.0/me/messages', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ recipient_id: 'r', message_id: 'm' });
    }));
    const c = await build();
    await c.sendMessage({ mode: 'facebook-login', accessToken: 'pt', request: { recipientId: 'r', message: { text: 'hi' } } });
    expect(url).toContain('graph.facebook.com');
  });

  it('listConversations uses platform=instagram', async () => {
    let url = '';
    server.use(http.get('https://graph.facebook.com/v25.0/p1/conversations', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ data: [] });
    }));
    const c = await build();
    await c.listConversations({ mode: 'facebook-login', pageId: 'p1', accessToken: 'pt' });
    expect(url).toContain('platform=instagram');
  });

  it('listConversations IG-login hits graph.instagram.com', async () => {
    let url = '';
    server.use(http.get('https://graph.instagram.com/v25.0/ig1/conversations', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ data: [] });
    }));
    const c = await build();
    await c.listConversations({ mode: 'instagram-login', igUserId: 'ig1', accessToken: 'tok' });
    expect(url).toContain('graph.instagram.com');
  });

  it('getUserProfile (ig-login)', async () => {
    server.use(http.get('https://graph.instagram.com/v25.0/u1', () =>
      HttpResponse.json({ id: 'u1', username: 'foo', name: 'Foo' })));
    const c = await build();
    const r = await c.getUserProfile({ mode: 'instagram-login', userId: 'u1', accessToken: 'tok' });
    if (isOk(r)) expect(r.value.username).toBe('foo');
  });
});
