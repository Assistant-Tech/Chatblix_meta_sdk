import { DynamicModule, Module, Provider, Type } from '@nestjs/common';
import {
  META_SDK_OPTIONS, META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER,
  FACEBOOK_OAUTH_OPTIONS, INSTAGRAM_OAUTH_OPTIONS, META_WEBHOOK_OPTIONS,
} from './meta-sdk.constants';
import { resolveConfig, type MetaSdkOptionsInput, type ResolvedMetaSdkConfig } from './core/config';
import { noopLogger, type SdkLogger } from './core/logger.token';
import { HttpClient } from './core/http-client.service';
import { FacebookOAuthClient } from './oauth/facebook-oauth.client';
import { InstagramOAuthClient } from './oauth/instagram-oauth.client';
import { MessengerClient } from './messaging/messenger.client';
import { InstagramMessagingClient } from './messaging/instagram-messaging.client';
import { WebhookVerifier } from './webhooks/webhook-verifier.service';
import { FacebookService } from './services/facebook.service';
import { InstagramService } from './services/instagram.service';

export interface MetaSdkAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<MetaSdkOptionsInput> | MetaSdkOptionsInput;
  inject?: any[];
}

@Module({})
export class MetaSdkModule {
  static forRoot(options: MetaSdkOptionsInput): DynamicModule {
    return {
      module: MetaSdkModule,
      global: false,
      providers: [
        { provide: META_SDK_OPTIONS, useValue: options },
        ...buildCoreProviders(),
        ...buildFeatureProviders(options),
      ],
      exports: buildExports(options),
    };
  }

  static forRootAsync(asyncOpts: MetaSdkAsyncOptions): DynamicModule {
    const optionsProvider: Provider = {
      provide: META_SDK_OPTIONS,
      useFactory: asyncOpts.useFactory,
      inject: asyncOpts.inject ?? [],
    };
    return {
      module: MetaSdkModule,
      imports: asyncOpts.imports ?? [],
      providers: [
        optionsProvider,
        ...buildCoreProviders(),
        ...buildAsyncFeatureProviders(),
      ],
      exports: [
        FacebookService, InstagramService, WebhookVerifier,
        FacebookOAuthClient, InstagramOAuthClient,
        MessengerClient, InstagramMessagingClient,
      ],
    };
  }
}

function buildCoreProviders(): Provider[] {
  return [
    {
      provide: META_SDK_RESOLVED_CONFIG,
      useFactory: (opts: MetaSdkOptionsInput): ResolvedMetaSdkConfig => resolveConfig(opts),
      inject: [META_SDK_OPTIONS],
    },
    {
      provide: META_SDK_LOGGER,
      useFactory: (cfg: ResolvedMetaSdkConfig): SdkLogger => cfg.logger ?? noopLogger,
      inject: [META_SDK_RESOLVED_CONFIG],
    },
    HttpClient,
  ];
}

function buildFeatureProviders(opts: MetaSdkOptionsInput): Provider[] {
  const providers: Provider[] = [];
  if (opts.facebook) {
    providers.push(
      { provide: FACEBOOK_OAUTH_OPTIONS, useValue: opts.facebook },
      FacebookOAuthClient, MessengerClient, FacebookService,
    );
  }
  if (opts.instagram) {
    providers.push(
      { provide: INSTAGRAM_OAUTH_OPTIONS, useValue: opts.instagram },
      InstagramOAuthClient, InstagramMessagingClient, InstagramService,
    );
  }
  if (opts.webhook) {
    providers.push(
      { provide: META_WEBHOOK_OPTIONS, useValue: opts.webhook },
      WebhookVerifier,
    );
  }
  return providers;
}

function buildAsyncFeatureProviders(): Provider[] {
  return [
    {
      provide: FACEBOOK_OAUTH_OPTIONS,
      useFactory: (opts: MetaSdkOptionsInput) => opts.facebook ?? null,
      inject: [META_SDK_OPTIONS],
    },
    {
      provide: INSTAGRAM_OAUTH_OPTIONS,
      useFactory: (opts: MetaSdkOptionsInput) => opts.instagram ?? null,
      inject: [META_SDK_OPTIONS],
    },
    {
      provide: META_WEBHOOK_OPTIONS,
      useFactory: (opts: MetaSdkOptionsInput) => opts.webhook ?? null,
      inject: [META_SDK_OPTIONS],
    },
    FacebookOAuthClient, MessengerClient, FacebookService,
    InstagramOAuthClient, InstagramMessagingClient, InstagramService,
    WebhookVerifier,
  ];
}

function buildExports(opts: MetaSdkOptionsInput): (Type<unknown> | symbol)[] {
  const out: (Type<unknown> | symbol)[] = [HttpClient];
  if (opts.facebook) out.push(FacebookService, FacebookOAuthClient, MessengerClient);
  if (opts.instagram) out.push(InstagramService, InstagramOAuthClient, InstagramMessagingClient);
  if (opts.webhook) out.push(WebhookVerifier);
  return out;
}
