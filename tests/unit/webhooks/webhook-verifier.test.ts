import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { WebhookVerifier } from '../../../src/webhooks/webhook-verifier.service';
import { META_WEBHOOK_OPTIONS } from '../../../src/meta-sdk.constants';

const SECRET = 'app_secret';
const sign = (b: string) => 'sha256=' + createHmac('sha256', SECRET).update(b).digest('hex');

async function build() {
  const m = await Test.createTestingModule({
    providers: [
      WebhookVerifier,
      { provide: META_WEBHOOK_OPTIONS, useValue: { appSecret: SECRET, verifyToken: 'vt' } },
    ],
  }).compile();
  return m.get(WebhookVerifier);
}

describe('WebhookVerifier', () => {
  it('verifyChallenge ok on valid', async () => {
    const v = await build();
    const r = v.verifyChallenge({ mode: 'subscribe', token: 'vt', challenge: 'c1' });
    expect(r.ok).toBe(true); if (r.ok) expect(r.value).toBe('c1');
  });
  it('verifyChallenge rejects bad token', async () => {
    const v = await build();
    expect(v.verifyChallenge({ mode: 'subscribe', token: 'wrong', challenge: 'c1' }).ok).toBe(false);
  });
  it('verifyChallenge rejects bad mode', async () => {
    const v = await build();
    expect(v.verifyChallenge({ mode: 'no', token: 'vt', challenge: 'c1' }).ok).toBe(false);
  });
  it('verifySignature ok on valid hmac', async () => {
    const v = await build();
    const body = '{"a":1}';
    expect(v.verifySignature(body, sign(body)).ok).toBe(true);
  });
  it('verifySignature rejects tampered', async () => {
    const v = await build();
    expect(v.verifySignature('{"a":2}', sign('{"a":1}')).ok).toBe(false);
  });
  it('verifySignature rejects missing header', async () => {
    const v = await build();
    expect(v.verifySignature('x', undefined).ok).toBe(false);
  });
  it('verifySignature timing-safe compare', async () => {
    const v = await build();
    const body = 'hi';
    expect(v.verifySignature(body, sign(body)).ok).toBe(true);
    expect(v.verifySignature(body, 'sha256=' + 'a'.repeat(64)).ok).toBe(false);
  });
});
