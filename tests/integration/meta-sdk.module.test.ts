import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { MetaSdkModule } from '../../src/meta-sdk.module';
import { FacebookService } from '../../src/services/facebook.service';
import { InstagramService } from '../../src/services/instagram.service';
import { WebhookVerifier } from '../../src/webhooks/webhook-verifier.service';

describe('MetaSdkModule', () => {
  it('forRoot wires Facebook + Instagram services', async () => {
    const m = await Test.createTestingModule({
      imports: [MetaSdkModule.forRoot({
        facebook: { clientId: 'a', clientSecret: 'b', redirectUri: 'https://c' },
        instagram: { clientId: 'd', clientSecret: 'e', redirectUri: 'https://f' },
        webhook: { appSecret: 'sec', verifyToken: 'vt' },
      })],
    }).compile();
    const fb = m.get(FacebookService);
    const ig = m.get(InstagramService);
    const vh = m.get(WebhookVerifier);
    expect(fb.oauth.buildAuthUrl({ state: 's' })).toContain('facebook.com/dialog/oauth');
    expect(ig.oauth.buildAuthUrl({ state: 's' })).toContain('instagram.com/oauth/authorize');
    expect(vh.verifyChallenge({ mode: 'subscribe', token: 'vt', challenge: 'c' }).ok).toBe(true);
  });

  it('forRoot without instagram skips InstagramService', async () => {
    const m = await Test.createTestingModule({
      imports: [MetaSdkModule.forRoot({ facebook: { clientId: 'a', clientSecret: 'b', redirectUri: 'https://c' } })],
    }).compile();
    expect(() => m.get(InstagramService)).toThrow();
    expect(m.get(FacebookService)).toBeDefined();
  });

  it('forRootAsync resolves options via factory', async () => {
    const m = await Test.createTestingModule({
      imports: [MetaSdkModule.forRootAsync({
        useFactory: () => ({
          facebook: { clientId: 'aa', clientSecret: 'bb', redirectUri: 'https://cc' },
          instagram: { clientId: 'dd', clientSecret: 'ee', redirectUri: 'https://ff' },
          webhook: { appSecret: 'sec', verifyToken: 'vt' },
        }),
      })],
    }).compile();
    expect(m.get(FacebookService).oauth.buildAuthUrl({ state: 's' })).toContain('client_id=aa');
  });

  // The host app supplies an SdkLogger through the options factory; without it
  // the SDK falls back to noopLogger and every Meta error it captures is
  // silently discarded. These prove the whole chain — factory -> resolveConfig
  // -> META_SDK_LOGGER -> HttpClient — actually delivers.
  describe('logger delivery to the host app', () => {
    const server = setupServer();
    beforeAll(() => server.listen());
    afterEach(() => server.resetHandlers());
    afterAll(() => server.close());

    function recordingLogger() {
      const calls: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }> = [];
      return {
        calls,
        logger: {
          debug: (msg: string, ctx?: Record<string, unknown>) => calls.push({ level: 'debug', msg, ctx }),
          info: (msg: string, ctx?: Record<string, unknown>) => calls.push({ level: 'info', msg, ctx }),
          warn: (msg: string, ctx?: Record<string, unknown>) => calls.push({ level: 'warn', msg, ctx }),
          error: (msg: string, ctx?: Record<string, unknown>) => calls.push({ level: 'error', msg, ctx }),
        },
      };
    }

    it('delivers Meta Graph errors to a logger passed through forRootAsync', async () => {
      server.use(http.get('https://graph.facebook.com/v25.0/me/accounts', () =>
        HttpResponse.json({
          error: {
            message: 'Error validating access token',
            type: 'OAuthException',
            code: 190,
            error_subcode: 463,
            error_user_msg: 'Please log in again.',
            fbtrace_id: 'TRACE9',
          },
        }, { status: 401 })));

      const rec = recordingLogger();
      const m = await Test.createTestingModule({
        imports: [MetaSdkModule.forRootAsync({
          useFactory: () => ({
            facebook: { clientId: 'aa', clientSecret: 'bb', redirectUri: 'https://cc' },
            instagram: { clientId: 'dd', clientSecret: 'ee', redirectUri: 'https://ff' },
            webhook: { appSecret: 'sec', verifyToken: 'vt' },
            maxRetries: 0,
            logger: rec.logger,
          }),
        })],
      }).compile();

      await m.get(FacebookService).oauth.listPages('expired-token');

      const logged = rec.calls.find((l) => l.msg === 'meta_api_error');
      expect(logged).toBeDefined();
      expect(logged?.ctx?.['code']).toBe(190);
      expect(logged?.ctx?.['subcode']).toBe(463);
      expect(logged?.ctx?.['fbTraceId']).toBe('TRACE9');
      expect(logged?.ctx?.['userMessage']).toBe('Please log in again.');
    });

    it('a logger in the options survives zod validation instead of being rejected', async () => {
      const rec = recordingLogger();
      await expect(
        Test.createTestingModule({
          imports: [MetaSdkModule.forRoot({
            facebook: { clientId: 'a', clientSecret: 'b', redirectUri: 'https://c' },
            instagram: { clientId: 'd', clientSecret: 'e', redirectUri: 'https://f' },
            webhook: { appSecret: 'sec', verifyToken: 'vt' },
            logger: rec.logger,
          })],
        }).compile(),
      ).resolves.toBeDefined();
    });
  });
});
