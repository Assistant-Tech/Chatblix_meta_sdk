import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result } from '../core/result';
import { MetaError, MetaConfigError } from '../core/errors';
import { parseSchema } from '../core/schema';
import { HttpClient } from '../core/http-client.service';
import { INSTAGRAM_OAUTH_DIALOG, INSTAGRAM_AUTH_API, INSTAGRAM_GRAPH_API_BASE } from '../core/constants';
import { INSTAGRAM_OAUTH_OPTIONS } from '../meta-sdk.constants';
import { INSTAGRAM_SCOPES } from './scopes';
import { LongLivedTokenSchema, InstagramAccountSchema } from './oauth.schemas';
import type {
  InstagramOAuthOptions, BuildAuthUrlInput, ShortLivedToken, LongLivedToken, InstagramAccount,
} from './oauth.types';

const IgShortLivedSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]),
});

@Injectable()
export class InstagramOAuthClient {
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(INSTAGRAM_OAUTH_OPTIONS) private readonly opts: InstagramOAuthOptions,
  ) {
    if (!opts) {
      throw new MetaConfigError(
        'InstagramOAuthClient requires instagram options — pass `instagram` to MetaSdkModule.forRoot/forRootAsync',
      );
    }
  }

  buildAuthUrl(input: BuildAuthUrlInput): string {
    const scopes = (input.scopes ?? this.opts.scopes ?? INSTAGRAM_SCOPES).join(',');
    const params = new URLSearchParams({
      client_id: this.opts.clientId,
      redirect_uri: this.opts.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: input.state,
    });
    return `${INSTAGRAM_OAUTH_DIALOG}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<Result<ShortLivedToken, MetaError>> {
    const form = new URLSearchParams({
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.opts.redirectUri,
      code,
    });
    const r = await this.http.request<unknown>({
      method: 'POST',
      url: `${INSTAGRAM_AUTH_API}/oauth/access_token`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!r.ok) return r;
    return parseSchema(IgShortLivedSchema, r.value, (raw) => {
      const out: ShortLivedToken = { accessToken: raw.access_token, tokenType: 'bearer' };
      out.userId = String(raw.user_id);
      return out;
    });
  }

  async exchangeForLongLivedToken(shortLivedToken: string): Promise<Result<LongLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${INSTAGRAM_GRAPH_API_BASE}/access_token`,
      query: {
        grant_type: 'ig_exchange_token',
        client_secret: this.opts.clientSecret,
        access_token: shortLivedToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(LongLivedTokenSchema, r.value, (raw) => ({
      accessToken: raw.access_token,
      tokenType: raw.token_type,
      expiresIn: raw.expires_in,
    }));
  }

  async refreshLongLivedToken(longLivedToken: string): Promise<Result<LongLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${INSTAGRAM_GRAPH_API_BASE}/refresh_access_token`,
      query: {
        grant_type: 'ig_refresh_token',
        access_token: longLivedToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(LongLivedTokenSchema, r.value, (raw) => ({
      accessToken: raw.access_token,
      tokenType: raw.token_type,
      expiresIn: raw.expires_in,
    }));
  }

  async getMe(accessToken: string): Promise<Result<InstagramAccount, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET',
      url: `${INSTAGRAM_GRAPH_API_BASE}/me`,
      query: { fields: 'id,username,account_type', access_token: accessToken },
    });
    if (!r.ok) return r;
    return parseSchema(InstagramAccountSchema, r.value, (raw) => {
      const out: InstagramAccount = { id: raw.id, username: raw.username };
      if (raw.account_type !== undefined) out.accountType = raw.account_type;
      return out;
    });
  }
}

