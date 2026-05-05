# @chatblix/meta-sdk

A typed, batteries-included **NestJS module** for the Meta (Facebook + Instagram) Graph API. Drop it into a Nest app and get OAuth, Messenger, Instagram DMs, webhook verification, and rich attachments — all backed by `Result<T, MetaError>` instead of thrown exceptions.

> ## ⚠️ Use at your own risk
>
> This SDK is provided **as-is, without warranty of any kind**, express or implied. It wraps third-party APIs (Meta / Facebook / Instagram Graph API) whose behavior, rate limits, deprecation timelines, and policies are entirely outside our control and can change without notice.
>
> - You are responsible for compliance with Meta's Platform Terms, Developer Policies, and any applicable data-protection laws (GDPR, CCPA, etc.) for traffic that flows through your integration.
> - You are responsible for safeguarding tokens, app secrets, and user data — this library does not persist or transmit anything beyond the calls you explicitly make.
> - Audit the source before using in production. Pin the version. Monitor your own logs.
> - The maintainers accept **no liability** for account suspensions, data loss, downtime, financial loss, or any other damages arising from use of this SDK.
>
> By installing this package you agree to the terms in [LICENSE](./LICENSE).

---

## Why this exists

Building Meta integrations directly against the Graph API in Nest projects keeps re-creating the same plumbing:

- **Two separate OAuth flows** (Login with Facebook + Login with Instagram) with different token-exchange shapes.
- **Webhook signature verification** (`x-hub-signature-256`) that has to read the *raw* body — easy to get wrong.
- **Inconsistent Meta error envelopes** (auth errors, rate limits, transient network failures) that need to be normalized before app code can branch on them.
- **Ad-hoc DTOs** for messages, attachments, templates copied between projects.
- **Page tokens, IGSID/IGBA disambiguation, long-lived token refresh** repeated everywhere.

This SDK collapses all of that into a single Nest module with:

- A thin core (`HttpClient`, `Result`, `MetaError`) so failures are *values*, not exceptions.
- Validated schemas (zod) at every API boundary.
- Per-resource clients (`oauth`, `messenger`, `messaging`, `webhooks`) composed into `FacebookService` / `InstagramService`.
- Helpers for image/video/audio/file/template attachments.
- A clean extension surface for Comments, Posts, or anything else Meta exposes.

It's the version of "Meta Graph API client" you'd write the third time, packaged so you only write it once.

---

## Who it's for

- Teams building **multi-tenant** Messenger / Instagram bots, CRMs, or inboxes on NestJS.
- Apps that need both **Facebook Page** messaging *and* **Instagram with Instagram Login** in the same codebase.
- Anyone who wants `Result`-based error handling instead of `try/catch` around HTTP calls.

If you're not on Nest, this isn't the right package — the public surface is `@Module` + DI tokens.

---

## Features

- Synchronous and async (`forRoot` / `forRootAsync`) module configuration.
- Login with Facebook + Login with Instagram OAuth (separate clients, separate credentials).
- Long-lived token exchange/refresh, page listing, page→webhook subscription, token debug.
- Messenger Send API + Instagram Messaging API (both `instagram-login` and Page-linked modes).
- Webhook challenge + HMAC-SHA256 signature verification, plus typed event parsing.
- Attachment + template builders (`imageAttachment`, `genericTemplate`, `buttonTemplate`, …).
- Result-typed errors with `MetaError.kind`: `api | auth | rate_limit | network | validation | config`.
- Built-in retry + `retryAfterSeconds` surfaced for rate-limit backoff.

---

## Install

```bash
npm install @chatblix/meta-sdk
# peer deps (already in most Nest apps)
npm install @nestjs/common @nestjs/core reflect-metadata rxjs
```

Requires **Node ≥ 18.17** and **NestJS 10 or 11**.

---

## Wire up — synchronous

```ts
import { Module } from '@nestjs/common';
import { MetaSdkModule } from '@chatblix/meta-sdk';

@Module({
  imports: [MetaSdkModule.forRoot({
    facebook: { clientId: process.env.FB_CLIENT_ID!, clientSecret: process.env.FB_CLIENT_SECRET!, redirectUri: 'https://app/cb' },
    instagram: { clientId: process.env.IG_CLIENT_ID!, clientSecret: process.env.IG_CLIENT_SECRET!, redirectUri: 'https://app/ig/cb' },
    webhook: { appSecret: process.env.FB_APP_SECRET!, verifyToken: 'vt' },
  })],
})
export class AppModule {}
```

## Wire up — async (with ConfigService)

```ts
MetaSdkModule.forRootAsync({
  imports: [ConfigModule],
  useFactory: (cfg: ConfigService) => ({
    facebook: { clientId: cfg.getOrThrow('FB_CLIENT_ID'), clientSecret: cfg.getOrThrow('FB_CLIENT_SECRET'), redirectUri: cfg.getOrThrow('FB_CB') },
    instagram: { clientId: cfg.getOrThrow('IG_CLIENT_ID'), clientSecret: cfg.getOrThrow('IG_CLIENT_SECRET'), redirectUri: cfg.getOrThrow('IG_CB') },
    webhook: { appSecret: cfg.getOrThrow('FB_APP_SECRET'), verifyToken: cfg.getOrThrow('FB_VERIFY_TOKEN') },
  }),
  inject: [ConfigService],
})
```

## Inject services

```ts
import { Injectable } from '@nestjs/common';
import { FacebookService, InstagramService, WebhookVerifier } from '@chatblix/meta-sdk';

@Injectable()
export class MyService {
  constructor(
    private readonly fb: FacebookService,
    private readonly ig: InstagramService,
    private readonly verifier: WebhookVerifier,
  ) {}

  async start(tenantState: string) {
    return this.fb.oauth.buildAuthUrl({ state: tenantState });
  }

  async sendMessenger(pageId: string, token: string, recipient: string) {
    return this.fb.messenger.sendMessage({
      pageId, accessToken: token,
      request: { recipientId: recipient, message: { text: 'hi' } },
    });
  }

  async sendInstagram(igUserId: string, token: string, recipient: string) {
    return this.ig.messaging.sendMessage({
      mode: 'instagram-login', igUserId, accessToken: token,
      request: { recipientId: recipient, message: { text: 'hi' } },
    });
  }
}
```

## Webhook controller

```ts
import { Controller, Get, Post, Query, Req, Res, Headers, BadRequestException, UnauthorizedException, RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { FacebookService, WebhookVerifier } from '@chatblix/meta-sdk';

@Controller('webhooks/meta')
export class MetaWebhookController {
  constructor(private readonly fb: FacebookService, private readonly verifier: WebhookVerifier) {}

  @Get()
  challenge(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const r = this.verifier.verifyChallenge({ mode, token, challenge });
    if (!r.ok) return res.status(403).send(r.error);
    return res.status(200).send(r.value);
  }

  @Post()
  async receive(@Req() req: RawBodyRequest<Request>, @Headers('x-hub-signature-256') sig: string) {
    const verified = this.verifier.verifySignature(req.rawBody!.toString('utf8'), sig);
    if (!verified.ok) throw new UnauthorizedException(verified.error);
    const events = this.fb.parseWebhook(JSON.parse(req.rawBody!.toString('utf8')));
    if (!events.ok) throw new BadRequestException(events.error.message);
    // dispatch events.value
  }
}
```

> **Note:** the webhook receiver requires the *raw* body. Enable it in `main.ts` with `NestFactory.create(AppModule, { rawBody: true })`.

## Attachments

```ts
import { imageAttachment, videoAttachment, audioAttachment, fileAttachment, genericTemplate, buttonTemplate } from '@chatblix/meta-sdk';

await fb.messenger.sendMessage({
  pageId, accessToken: token,
  request: {
    recipientId: psid,
    message: { attachment: imageAttachment('https://cdn/image.jpg') },
  },
});
```

## Error handling

Every API method returns `Result<T, MetaError>`. Discriminate with `isOk` / `isErr`. `MetaError.kind`: `api | auth | rate_limit | network | validation | config`.

```ts
import { isOk } from '@chatblix/meta-sdk';

const r = await fb.messenger.sendMessage(...);
if (!isOk(r)) {
  switch (r.error.kind) {
    case 'auth':       /* re-auth flow */ break;
    case 'rate_limit': /* backoff using r.error.retryAfterSeconds */ break;
    case 'validation': /* 400 to client */ break;
    case 'network':    /* transient — already retried; surface or fail */ break;
    default:           /* 5xx / api */ break;
  }
}
```

## OAuth flows

Two independent flows are supported — each with its own client and credentials.

| Flow | Client | Authorize URL | Token exchange |
|------|--------|---------------|----------------|
| Login with Facebook | `FacebookOAuthClient` | `https://www.facebook.com/dialog/oauth` | `GET graph.facebook.com/{v}/oauth/access_token` |
| Login with Instagram | `InstagramOAuthClient` | `https://www.instagram.com/oauth/authorize` | `POST api.instagram.com/oauth/access_token` (form) |

`FacebookOAuthClient` also exposes:
- `exchangeForLongLivedToken(shortLivedToken)`
- `listPages(userAccessToken)` — pages + connected Instagram account
- `subscribePageToWebhooks(pageId, pageToken, fields?)`
- `debugToken(token)`

`InstagramOAuthClient` also exposes:
- `exchangeForLongLivedToken(shortLivedToken)`
- `refreshLongLivedToken(longLivedToken)`
- `getMe(accessToken)`

## Extending (Comments / Posts)

See `src/extensions/README.md`.

---

## Development

```bash
npm install        # installs deps + sets up husky pre-commit hook
npm run typecheck
npm test
npm run build
```

### Pre-commit hook (auto version bump)

Husky installs a `pre-commit` hook that:

1. Runs `npm run lint` and `npm run typecheck` on the staged code.
2. If any **`src/**`** files are staged, auto-bumps the **patch** version in `package.json` (`npm version patch --no-git-tag-version`) and re-stages it.

Skip in emergencies with `git commit --no-verify` (do not skip on shared branches).

To bump a non-patch version manually before commit:

```bash
npm run release:minor   # 0.2.x → 0.3.0
npm run release:major   # 0.x.y → 1.0.0
```

### Publishing to npm

The release scripts run build + tests, bump the version, create a git tag, and publish.

```bash
npm run release:patch   # 0.2.1 → 0.2.2
npm run release:minor
npm run release:major
```

Under the hood:
1. `prerelease`: `npm run lint && npm run typecheck && npm test && npm run build`
2. `npm version <level>` — bumps `package.json` and creates a `vX.Y.Z` tag
3. `postversion`: `git push && git push --tags && npm publish --access public`

> First-time: run `npm login` once and make sure you have publish rights on the `@chatblix` scope.

## License

MIT
