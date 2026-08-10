import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { Result, ok } from "../core/result";
import { MetaError, MetaConfigError } from "../core/errors";
import { parseSchema } from "../core/schema";
import { HttpClient } from "../core/http-client.service";
import type { ResolvedMetaSdkConfig } from "../core/config";
import {
  INSTAGRAM_OAUTH_DIALOG,
  INSTAGRAM_AUTH_API,
  INSTAGRAM_GRAPH_API_BASE,
} from "../core/constants";
import {
  INSTAGRAM_OAUTH_OPTIONS,
  META_SDK_RESOLVED_CONFIG,
} from "../meta-sdk.constants";
import { INSTAGRAM_SCOPES } from "./scopes";
import { LongLivedTokenSchema, InstagramAccountSchema } from "./oauth.schemas";
import type {
  InstagramOAuthOptions,
  BuildAuthUrlInput,
  ShortLivedToken,
  LongLivedToken,
  InstagramAccount,
  SubscribedApp,
  SubscribedAppsList,
  UnsubscribeResult,
} from "./oauth.types";

const IgShortLivedSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]),
});

@Injectable()
export class InstagramOAuthClient {
  private readonly graphBase: string;
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(META_SDK_RESOLVED_CONFIG) cfg: ResolvedMetaSdkConfig,
    @Inject(INSTAGRAM_OAUTH_OPTIONS)
    private readonly opts: InstagramOAuthOptions,
  ) {
    if (!opts) {
      throw new MetaConfigError(
        "InstagramOAuthClient requires instagram options — pass `instagram` to MetaSdkModule.forRoot/forRootAsync",
      );
    }
    this.graphBase = `${INSTAGRAM_GRAPH_API_BASE}/${cfg.apiVersion}`;
  }

  buildAuthUrl(input: BuildAuthUrlInput): string {
    const scopes = (input.scopes ?? this.opts.scopes ?? INSTAGRAM_SCOPES).join(
      ",",
    );
    const params = new URLSearchParams({
      client_id: this.opts.clientId,
      redirect_uri: this.opts.redirectUri,
      scope: scopes,
      response_type: "code",
      state: input.state,
    });
    return `${INSTAGRAM_OAUTH_DIALOG}?${params.toString()}`;
  }

  async exchangeCodeForToken(
    code: string,
  ): Promise<Result<ShortLivedToken, MetaError>> {
    const form = new URLSearchParams({
      client_id: this.opts.clientId,
      client_secret: this.opts.clientSecret,
      grant_type: "authorization_code",
      redirect_uri: this.opts.redirectUri,
      code,
    });
    const r = await this.http.request<unknown>({
      method: "POST",
      url: `${INSTAGRAM_AUTH_API}/oauth/access_token`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!r.ok) return r;
    return parseSchema(IgShortLivedSchema, r.value, (raw) => {
      const out: ShortLivedToken = {
        accessToken: raw.access_token,
        tokenType: "bearer",
      };
      out.userId = String(raw.user_id);
      return out;
    });
  }

  async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<Result<LongLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: "GET",
      url: `${INSTAGRAM_GRAPH_API_BASE}/access_token`,
      query: {
        grant_type: "ig_exchange_token",
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

  async refreshLongLivedToken(
    longLivedToken: string,
  ): Promise<Result<LongLivedToken, MetaError>> {
    const r = await this.http.request<unknown>({
      method: "GET",
      url: `${INSTAGRAM_GRAPH_API_BASE}/refresh_access_token`,
      query: {
        grant_type: "ig_refresh_token",
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

  async getMe(
    accessToken: string,
  ): Promise<Result<InstagramAccount, MetaError>> {
    const r = await this.http.request<unknown>({
      method: "GET",
      url: `${INSTAGRAM_GRAPH_API_BASE}/me`,
      query: {
        fields: "id,username,account_type,user_id",
        access_token: accessToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(InstagramAccountSchema, r.value, (raw) => {
      const out: InstagramAccount = {
        id: raw.id,
        username: raw.username,
        userId: String(raw.user_id),
      };
      if (raw.account_type !== undefined) out.accountType = raw.account_type;
      if (raw.user_id !== undefined) out.userId = String(raw.user_id);
      return out;
    });
  }

  /**
   * Subscribe the app to webhook notifications for an Instagram professional
   * account (Instagram API with Instagram Login). Mirrors the Facebook page
   * `subscribed_apps` edge, but is scoped to the IG user rather than a page.
   *
   * @param igUserId IG user ID (IGBA) — use the account's `userId`, or `'me'`.
   * @param accessToken Long-lived access token for the account.
   * @param subscribedFields Webhook fields to subscribe to. Defaults to messaging fields.
   */
  async subscribePageToWebhooks(
    igUserId: string,
    accessToken: string,
    subscribedFields: readonly string[] = [
      "messages",
      "messaging_postbacks",
      "message_reactions",
      "message_reads",
    ],
  ): Promise<Result<{ success: boolean }, MetaError>> {
    const r = await this.http.request<{ success?: boolean }>({
      method: "POST",
      url: `${this.graphBase}/${igUserId}/subscribed_apps`,
      body: {
        subscribed_fields: subscribedFields.join(","),
        access_token: accessToken,
      },
      platform: "instagram",
    });
    if (!r.ok) return r;
    return ok({ success: r.value.success ?? true });
  }

  /**
   * Remove this app's webhook subscription from an Instagram account.
   *
   * Checks for an existing subscription first and no-ops when there is none,
   * so it is safe to call in a disconnect flow regardless of the account's
   * current state. Callers get `alreadyUnsubscribed` to distinguish the two.
   *
   * Call this BEFORE discarding the account's access token — once the token is
   * gone the subscription can only be cleared by the account owner removing
   * the app from their Instagram settings.
   */
  async unsubscribePageFromWebhooks(
    igUserId: string,
    accessToken: string,
  ): Promise<Result<UnsubscribeResult, MetaError>> {
    const listed = await this.getSubscribedApps(igUserId, accessToken);
    if (!listed.ok) return listed;
    if (listed.value.data.length === 0) {
      return ok({ success: true, alreadyUnsubscribed: true });
    }

    const r = await this.http.request<{ success?: boolean }>({
      method: "DELETE",
      url: `${this.graphBase}/${igUserId}/subscribed_apps`,
      query: { access_token: accessToken },
      platform: "instagram",
    });
    if (!r.ok) return r;
    return ok({ success: r.value.success ?? true, alreadyUnsubscribed: false });
  }

  /** List the apps currently subscribed to this Instagram account's webhooks. */
  async getSubscribedApps(
    igUserId: string,
    accessToken: string,
  ): Promise<Result<SubscribedAppsList, MetaError>> {
    const r = await this.http.request<{ data?: SubscribedApp[] }>({
      method: "GET",
      url: `${this.graphBase}/${igUserId}/subscribed_apps`,
      query: { access_token: accessToken },
      platform: "instagram",
    });
    if (!r.ok) return r;
    return ok({ data: r.value.data ?? [] });
  }
}
