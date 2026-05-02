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
});
