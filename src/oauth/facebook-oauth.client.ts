import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result, ok, err } from '../core/result';
import { MetaError, MetaValidationError, type ValidationIssue } from '../core/errors';
import { HttpClient } from '../core/http-client.service';
import type { ResolvedMetaSdkConfig } from '../core/config';
import { META_GRAPH_API_BASE, FACEBOOK_OAUTH_DIALOG } from '../core/constants';
import { FACEBOOK_OAUTH_OPTIONS, META_SDK_RESOLVED_CONFIG } from '../meta-sdk.constants';
import { FACEBOOK_SCOPES } from './scopes';
import {
  ShortLivedTokenSchema, LongLivedTokenSchema, FacebookPageAccountsResponseSchema,
} from './oauth.schemas';
import type {
  FacebookOAuthOptions, BuildAuthUrlInput, ShortLivedToken, LongLivedToken, FacebookPageAccount,
} from './oauth.types';

const DebugTokenSchema = z.object({
  data: z.object({
    app_id: z.string(),
    is_valid: z.boolean(),
    scopes: z.array(z.string()).optional(),
    user_id: z.string().optional(),
    expires_at: z.number().optional(),
  }),
});

export interface DebugTokenResult {
  appId: string;
  isValid: boolean;
  scopes: string[];
  userId?: string;
  expiresAt?: number;
}

@Injectable()
export class FacebookOAuthClient {
  private readonly base: string;
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(META_SDK_RESOLVED_CONFIG) cfg: ResolvedMetaSdkConfig,
    @Inject(FACEBOOK_OAUTH_OPTIONS) private readonly opts: FacebookOAuthOptions,
  ) {
    this.base = `${META_GRAPH_API_BASE}/${cfg.apiVersion}`;
  }

  buildAuthUrl(input: BuildAuthUrlInput): string {
    const scopes = (input.scopes ?? this.opts.scopes ?? FACEBOOK_SCOPES).join(',');
    const params = new URLSearchParams({
      client_id: this.opts.clientId,
      redirect_uri: this.opts.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: input.state,
    });
    return `${FACEBOOK_OAUTH_DIALOG}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<Result<ShortLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${this.base}/oauth/access_token`,
      query: {
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        redirect_uri: this.opts.redirectUri,
        code,
      },
    });
    if (!r.ok) return r;
    return parseSchema(ShortLivedTokenSchema, r.value, (raw) => {
      const out: ShortLivedToken = { accessToken: raw.access_token, tokenType: raw.token_type };
      if (raw.expires_in !== undefined) out.expiresIn = raw.expires_in;
      if (raw.user_id !== undefined) out.userId = String(raw.user_id);
      return out;
    });
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<Result<LongLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${this.base}/oauth/access_token`,
      query: {
        grant_type: 'fb_exchange_token',
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        fb_exchange_token: shortLivedToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(LongLivedTokenSchema, r.value, (raw) => ({
      accessToken: raw.access_token,
      tokenType: raw.token_type,
      expiresIn: raw.expires_in,
    }));
  }

  async listPages(userAccessToken: string): Promise<Result<FacebookPageAccount[], MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${this.base}/me/accounts`,
      query: {
        fields: 'id,name,access_token,category,connected_instagram_account{id,username,name}',
        access_token: userAccessToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(FacebookPageAccountsResponseSchema, r.value, (raw) =>
      raw.data.map((p) => {
        const page: FacebookPageAccount = {
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
          instagramAccount: p.connected_instagram_account
            ? (() => {
                const ig: { id: string; username: string; name?: string } = {
                  id: p.connected_instagram_account.id,
                  username: p.connected_instagram_account.username,
                };
                if (p.connected_instagram_account.name !== undefined) {
                  ig.name = p.connected_instagram_account.name;
                }
                return ig;
              })()
            : null,
        };
        if (p.category !== undefined) page.category = p.category;
        return page;
      }),
    );
  }

  async subscribePageToWebhooks(
    pageId: string,
    pageAccessToken: string,
    subscribedFields: readonly string[] = ['messages', 'message_reads', 'message_reactions', 'messaging_postbacks'],
  ): Promise<Result<{ success: boolean }, MetaError>> {
    const r = await this.http.request<{ success?: boolean }>({
      method: 'POST',
      url: `${this.base}/${pageId}/subscribed_apps`,
      body: { subscribed_fields: subscribedFields.join(','), access_token: pageAccessToken },
    });
    if (!r.ok) return r;
    return ok({ success: r.value.success ?? true });
  }

  async debugToken(token: string): Promise<Result<DebugTokenResult, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${this.base}/debug_token`,
      query: {
        input_token: token,
        access_token: `${this.opts.clientId}|${this.opts.clientSecret}`,
      },
    });
    if (!r.ok) return r;
    return parseSchema(DebugTokenSchema, r.value, (raw) => {
      const out: DebugTokenResult = {
        appId: raw.data.app_id,
        isValid: raw.data.is_valid,
        scopes: raw.data.scopes ?? [],
      };
      if (raw.data.user_id !== undefined) out.userId = raw.data.user_id;
      if (raw.data.expires_at !== undefined) out.expiresAt = raw.data.expires_at;
      return out;
    });
  }
}

function parseSchema<S extends z.ZodTypeAny, O>(
  schema: S,
  value: unknown,
  transform: (raw: z.infer<S>) => O,
): Result<O, MetaError> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
      path: [...i.path],
      message: i.message,
    }));
    return err(new MetaValidationError('Response validation failed', issues));
  }
  return ok(transform(parsed.data as z.infer<S>));
}
