import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Result, ok, err } from '../core/result';
import { MetaConfigError } from '../core/errors';
import { META_WEBHOOK_OPTIONS } from '../meta-sdk.constants';

export interface WebhookVerifierOptions { appSecret: string; verifyToken: string }
export interface ChallengeInput { mode?: string; token?: string; challenge?: string }

@Injectable()
export class WebhookVerifier {
  constructor(@Inject(META_WEBHOOK_OPTIONS) private readonly opts: WebhookVerifierOptions) {
    if (!opts) {
      throw new MetaConfigError(
        'WebhookVerifier requires webhook options — pass `webhook` to MetaSdkModule.forRoot/forRootAsync',
      );
    }
  }

  verifyChallenge(input: ChallengeInput): Result<string, string> {
    if (input.mode !== 'subscribe') return err('invalid hub.mode');
    if (input.token !== this.opts.verifyToken) return err('invalid verify token');
    if (!input.challenge) return err('missing hub.challenge');
    return ok(input.challenge);
  }

  verifySignature(rawBody: string, headerValue: string | undefined): Result<true, string> {
    if (!headerValue) return err('missing X-Hub-Signature-256');
    const [algo, sig] = headerValue.split('=');
    if (algo !== 'sha256' || !sig) return err('invalid signature format');
    const expected = createHmac('sha256', this.opts.appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return err('signature length mismatch');
    if (!timingSafeEqual(a, b)) return err('signature mismatch');
    return ok(true);
  }
}
