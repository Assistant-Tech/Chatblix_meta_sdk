# @chatblix/meta-sdk

NestJS module for Meta (Facebook + Instagram) Graph API.

## Install

```bash
npm install @chatblix/meta-sdk
```

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

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
