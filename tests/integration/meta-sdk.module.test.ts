import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
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
        }),
      })],
    }).compile();
    expect(m.get(FacebookService).oauth.buildAuthUrl({ state: 's' })).toContain('client_id=aa');
  });
});
