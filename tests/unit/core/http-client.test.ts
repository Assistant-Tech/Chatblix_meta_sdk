import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Test } from '@nestjs/testing';
import { HttpClient } from '../../../src/core/http-client.service';
import { resolveConfig } from '../../../src/core/config';
import { META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER } from '../../../src/meta-sdk.constants';
import { noopLogger } from '../../../src/core/logger.token';
import { MetaAuthError, MetaRateLimitError, MetaNetworkError } from '../../../src/core/errors';
import { isOk, isErr } from '../../../src/core/result';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function build() {
  const cfg = resolveConfig({ maxRetries: 1, timeoutMs: 2000 });
  const m = await Test.createTestingModule({
    providers: [
      HttpClient,
      { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
      { provide: META_SDK_LOGGER, useValue: noopLogger },
    ],
  }).compile();
  return m.get(HttpClient);
}

describe('HttpClient', () => {
  it('returns ok on 200 JSON', async () => {
    server.use(http.get('https://api.test/x', () => HttpResponse.json({ id: '1' })));
    const c = await build();
    const r = await c.request<{ id: string }>({ method: 'GET', url: 'https://api.test/x' });
    if (isOk(r)) expect(r.value.id).toBe('1');
  });

  it('maps 401 to MetaAuthError', async () => {
    server.use(http.get('https://api.test/x', () =>
      HttpResponse.json({ error: { message: 'bad', code: 190, type: 'OAuthException', fbtrace_id: 't' } }, { status: 401 })));
    const c = await build();
    const r = await c.request({ method: 'GET', url: 'https://api.test/x' });
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaAuthError);
  });

  it('maps 429 to MetaRateLimitError', async () => {
    server.use(http.get('https://api.test/x', () =>
      HttpResponse.json({ error: { message: 'rl', code: 4, type: 't', fbtrace_id: 't' } }, { status: 429 })));
    const c = await build();
    const r = await c.request({ method: 'GET', url: 'https://api.test/x' });
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaRateLimitError);
  });

  it('retries on 500 then succeeds', async () => {
    let calls = 0;
    server.use(http.get('https://api.test/x', () => {
      calls++;
      if (calls === 1) return new HttpResponse(null, { status: 500 });
      return HttpResponse.json({ ok: true });
    }));
    const c = await build();
    const r = await c.request({ method: 'GET', url: 'https://api.test/x' });
    expect(calls).toBe(2);
    expect(isOk(r)).toBe(true);
  });

  it('does not retry on 400 graph error', async () => {
    let calls = 0;
    server.use(http.get('https://api.test/x', () => {
      calls++;
      return HttpResponse.json({ error: { message: 'b', code: 100, type: 't', fbtrace_id: 't' } }, { status: 400 });
    }));
    const c = await build();
    await c.request({ method: 'GET', url: 'https://api.test/x' });
    expect(calls).toBe(1);
  });

  it('returns MetaNetworkError on fetch error', async () => {
    server.use(http.get('https://api.test/x', () => HttpResponse.error()));
    const c = await build();
    const r = await c.request({ method: 'GET', url: 'https://api.test/x' });
    if (isErr(r)) expect(r.error).toBeInstanceOf(MetaNetworkError);
  });

  it('appends query params, drops undefined', async () => {
    let url = '';
    server.use(http.get('https://api.test/x', ({ request }) => { url = request.url; return HttpResponse.json({}); }));
    const c = await build();
    await c.request({ method: 'GET', url: 'https://api.test/x', query: { a: '1', b: 2, c: undefined } });
    expect(url).toContain('a=1');
    expect(url).toContain('b=2');
    expect(url).not.toContain('c=');
  });

  describe('Graph error logging', () => {
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

    async function buildWith(logger: ReturnType<typeof recordingLogger>['logger']) {
      const cfg = resolveConfig({ maxRetries: 0, timeoutMs: 2000, logger });
      const m = await Test.createTestingModule({
        providers: [
          HttpClient,
          { provide: META_SDK_RESOLVED_CONFIG, useValue: cfg },
          { provide: META_SDK_LOGGER, useValue: logger },
        ],
      }).compile();
      return m.get(HttpClient);
    }

    it('logs every Graph error with the full Meta payload', async () => {
      server.use(http.get('https://api.test/x', () =>
        HttpResponse.json({
          error: {
            message: 'Invalid parameter',
            code: 100,
            type: 'OAuthException',
            error_subcode: 2018001,
            error_user_title: 'Cannot Send Message',
            error_user_msg: "This person isn't available.",
            error_data: { blame_field_specs: [['recipient']] },
            fbtrace_id: 'AbC123',
          },
        }, { status: 400 })));
      const rec = recordingLogger();
      const c = await buildWith(rec.logger);
      await c.request({ method: 'GET', url: 'https://api.test/x' });

      const logged = rec.calls.find((l) => l.msg === 'meta_api_error');
      expect(logged).toBeDefined();
      expect(logged?.level).toBe('error');
      expect(logged?.ctx?.['code']).toBe(100);
      expect(logged?.ctx?.['subcode']).toBe(2018001);
      expect(logged?.ctx?.['fbTraceId']).toBe('AbC123');
      expect(logged?.ctx?.['userTitle']).toBe('Cannot Send Message');
      expect(logged?.ctx?.['userMessage']).toBe("This person isn't available.");
      expect(logged?.ctx?.['details']).toEqual({ blame_field_specs: [['recipient']] });
    });

    it('never writes the access token into the log context', async () => {
      server.use(http.get('https://api.test/x', () =>
        HttpResponse.json({ error: { message: 'no', code: 1, type: 't', fbtrace_id: 'f' } }, { status: 400 })));
      const rec = recordingLogger();
      const c = await buildWith(rec.logger);
      await c.request({ method: 'GET', url: 'https://api.test/x', query: { access_token: 'SUPERSECRET' } });

      expect(JSON.stringify(rec.calls)).not.toContain('SUPERSECRET');
      const logged = rec.calls.find((l) => l.msg === 'meta_api_error');
      expect(logged?.ctx?.['operation']).toBe('GET https://api.test/x');
    });

    it('logs transient errors at warn rather than error', async () => {
      server.use(http.get('https://api.test/x', () =>
        HttpResponse.json({
          error: { message: 'try again', code: 2, type: 't', is_transient: true, fbtrace_id: 'f' },
        }, { status: 400 })));
      const rec = recordingLogger();
      const c = await buildWith(rec.logger);
      await c.request({ method: 'GET', url: 'https://api.test/x' });

      const logged = rec.calls.find((l) => l.msg === 'meta_api_error');
      expect(logged?.level).toBe('warn');
      expect(logged?.ctx?.['isTransient']).toBe(true);
    });
  });
});
