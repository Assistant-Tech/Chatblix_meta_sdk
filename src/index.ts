export const VERSION = '0.2.3';

// Module
export { MetaSdkModule } from './meta-sdk.module';
export type { MetaSdkAsyncOptions } from './meta-sdk.module';
export {
  META_SDK_OPTIONS, META_SDK_RESOLVED_CONFIG, META_SDK_LOGGER,
  FACEBOOK_OAUTH_OPTIONS, INSTAGRAM_OAUTH_OPTIONS, META_WEBHOOK_OPTIONS,
} from './meta-sdk.constants';

// Services
export { FacebookService } from './services/facebook.service';
export { InstagramService } from './services/instagram.service';

// Core
export { HttpClient } from './core/http-client.service';
export type { HttpRequest, RawHttpResponse } from './core/http-client.types';
export { resolveConfig, MetaSdkOptionsSchema } from './core/config';
export type { MetaSdkOptionsInput, ResolvedMetaSdkConfig } from './core/config';
export type { SdkLogger } from './core/logger.token';
export { noopLogger } from './core/logger.token';
export {
  MetaError, MetaApiError, MetaAuthError, MetaRateLimitError,
  MetaMessageError, MetaNetworkError, MetaValidationError, MetaConfigError,
  fromGraphApiError,
} from './core/errors';
export type { GraphApiErrorPayload, ValidationIssue } from './core/errors';
export {
  AUTH_CODES, RATE_LIMIT_CODES,
  MESSENGER_MESSAGE_CODES, INSTAGRAM_MESSAGE_CODES,
} from './core/error-codes';
export type { MetaPlatformHint } from './core/error-codes';
export { ok, err, isOk, isErr, mapResult, unwrap } from './core/result';
export type { Result, Ok, Err } from './core/result';

// OAuth
export { FacebookOAuthClient } from './oauth/facebook-oauth.client';
export type { DebugTokenResult } from './oauth/facebook-oauth.client';
export { InstagramOAuthClient } from './oauth/instagram-oauth.client';
export { FACEBOOK_SCOPES, INSTAGRAM_SCOPES } from './oauth/scopes';
export type { FacebookScope, InstagramScope } from './oauth/scopes';
export type {
  FacebookOAuthOptions, InstagramOAuthOptions,
  BuildAuthUrlInput, ShortLivedToken, LongLivedToken, FacebookPageAccount, InstagramAccount,
  SubscribedApp, SubscribedAppsList, UnsubscribeResult,
} from './oauth/oauth.types';

// Messaging
export { MessengerClient } from './messaging/messenger.client';
export { InstagramMessagingClient } from './messaging/instagram-messaging.client';
export type { IgAuthMode } from './messaging/instagram-messaging.client';
export {
  imageAttachment, videoAttachment, audioAttachment, fileAttachment,
  genericTemplate, buttonTemplate,
} from './messaging/attachments';
export type {
  MessagingType, SenderAction, AttachmentType, MediaAttachment, TemplateAttachment,
  MessageAttachment, QuickReply, MessageContent, SendMessageRequest, SendMessageResult,
} from './messaging/messaging.types';

// Webhooks
export { WebhookVerifier } from './webhooks/webhook-verifier.service';
export { parseWebhookPayload } from './webhooks/webhook-parser';
export type { ParsedEvent, WebhookObject, WebhookAttachment } from './webhooks/webhook.types';
