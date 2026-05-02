import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { MessengerClient } from '../../../src/messaging/messenger.client';
import { HttpClient } from '../../../src/core/http-client.service';
import { resolveConfig } from '../../../src/core/config';
import { META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER } from '../../../src/meta-sdk.constants';
import { noopLogger } from '../../../src/core/logger.token';
import { isOk, isErr } from '../../../src/core/result';
import { imageAttachment } from '../../../src/messaging/attachments';
import { MetaValidationError } from '../../../src/core/errors';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function build() {
  const cfg = resolveConfig({ maxRetries: 0 });
  const m = await Test.createTestingModule({
    providers: [
      HttpClient, MessengerClient,
      { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
      { provide: META_SDK_LOGGER, useValue: noopLogger },
    ],
  }).compile();
  return m.get(MessengerClient);
}

describe('MessengerClient', () => {
  it('sendMessage posts to /{pageId}/messages', async () => {
    let body: any; let url = '';
    server.use(http.post('https://graph.facebook.com/v25.0/p1/messages', async ({ request }) => {
      url = request.url; body = await request.json();
      return HttpResponse.json({ recipient_id: 'r1', message_id: 'm1' });
    }));
    const c = await build();
    const r = await c.sendMessage({ pageId: 'p1', accessToken: 'pt', request: { recipientId: 'r1', message: { text: 'hi' } } });
    expect(url).toContain('access_token=pt');
    expect(body).toMatchObject({ recipient: { id: 'r1' }, message: { text: 'hi' } });
    if (isOk(r)) expect(r.value.messageId).toBe('m1');
  });

  it('sends image attachment', async () => {
    let body: any;
    server.use(http.post('https://graph.facebook.com/v25.0/p1/messages', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ recipient_id: 'r1', message_id: 'm2' });
    }));
    const c = await build();
    await c.sendMessage({ pageId: 'p1', accessToken: 'pt', request: { recipientId: 'r1', message: { attachment: imageAttachment('https://x/y.jpg') } } });
    expect(body.message.attachment.type).toBe('image');
  });

  it('sendTypingIndicator sends sender_action', async () => {
    let body: any;
    server.use(http.post('https://graph.facebook.com/v25.0/p1/messages', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ recipient_id: 'r1', message_id: '' });
    }));
    const c = await build();
    await c.sendTypingIndicator({ pageId: 'p1', accessToken: 'pt', recipientId: 'r1', action: 'typing_on' });
    expect(body.sender_action).toBe('typing_on');
    expect(body.message).toBeUndefined();
  });

  it('rejects empty message via validation', async () => {
    const c = await build();
    const r = await c.sendMessage({ pageId: 'p1', accessToken: 'pt', request: { recipientId: 'r1' } as any });
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaValidationError);
  });

  it('listConversations uses platform=messenger', async () => {
    let url = '';
    server.use(http.get('https://graph.facebook.com/v25.0/p1/conversations', ({ request }) => {
      url = request.url;
      return HttpResponse.json({ data: [{ id: 'c1', updated_time: '2026-01-01T00:00:00+0000' }] });
    }));
    const c = await build();
    const r = await c.listConversations({ pageId: 'p1', accessToken: 'pt' });
    expect(url).toContain('platform=messenger');
    if (isOk(r)) expect(r.value.data[0]!.id).toBe('c1');
  });

  it('getConversationMessages returns messages', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/c1/messages', () =>
      HttpResponse.json({ data: [{ id: 'm1', message: 'hi', created_time: '2026-01-01T00:00:00+0000', from: { id: 'f', name: 'F' } }] })));
    const c = await build();
    const r = await c.getConversationMessages({ conversationId: 'c1', accessToken: 'pt' });
    if (isOk(r)) expect(r.value.data).toHaveLength(1);
  });

  it('getUserProfile fetches fields', async () => {
    server.use(http.get('https://graph.facebook.com/v25.0/u1', () =>
      HttpResponse.json({ id: 'u1', first_name: 'A', last_name: 'B' })));
    const c = await build();
    const r = await c.getUserProfile({ userId: 'u1', accessToken: 'pt' });
    if (isOk(r)) expect(r.value.firstName).toBe('A');
  });
});
