import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result, err } from '../core/result';
import { MetaError } from '../core/errors';
import { parseSchema, zodIssuesToValidationError } from '../core/schema';
import { HttpClient } from '../core/http-client.service';
import type { ResolvedMetaSdkConfig } from '../core/config';
import { META_GRAPH_API_BASE, INSTAGRAM_GRAPH_API_BASE } from '../core/constants';
import { META_SDK_RESOLVED_CONFIG } from '../meta-sdk.constants';
import { SendMessageRequestSchema, SendMessageResponseSchema } from './messaging.schemas';
import type { SendMessageRequest, SendMessageResult, SenderAction } from './messaging.types';

export type IgAuthMode = 'instagram-login' | 'facebook-login';

export type IgSendMessageInput =
  | { mode: 'instagram-login'; igUserId: string; accessToken: string; request: SendMessageRequest }
  | { mode: 'facebook-login'; accessToken: string; request: SendMessageRequest };

export type IgListConversationsInput =
  | { mode: 'instagram-login'; igUserId: string; accessToken: string; limit?: number; after?: string }
  | { mode: 'facebook-login'; pageId: string; accessToken: string; limit?: number; after?: string };

export type IgUserProfileInput =
  | { mode: 'instagram-login'; userId: string; accessToken: string }
  | { mode: 'facebook-login'; userId: string; accessToken: string };

export type IgSendTypingInput =
  | { mode: 'instagram-login'; igUserId: string; accessToken: string; recipientId: string; action: SenderAction }
  | { mode: 'facebook-login'; accessToken: string; recipientId: string; action: SenderAction };

const IgUserProfileSchema = z.object({
  id: z.string(), username: z.string().optional(),
  name: z.string().optional(), profile_pic: z.string().optional(),
});
const ConvSchema = z.object({ data: z.array(z.object({ id: z.string(), updated_time: z.string().optional() })) });

@Injectable()
export class InstagramMessagingClient {
  private readonly fbBase: string;
  private readonly igBase: string;
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(META_SDK_RESOLVED_CONFIG) cfg: ResolvedMetaSdkConfig,
  ) {
    this.fbBase = `${META_GRAPH_API_BASE}/${cfg.apiVersion}`;
    this.igBase = `${INSTAGRAM_GRAPH_API_BASE}/${cfg.apiVersion}`;
  }

  async sendMessage(input: IgSendMessageInput): Promise<Result<SendMessageResult, MetaError>> {
    const validated = SendMessageRequestSchema.safeParse(input.request);
    if (!validated.success) return err(zodIssuesToValidationError('Invalid send-message request', validated.error));
    const url = input.mode === 'instagram-login'
      ? `${this.igBase}/${input.igUserId}/messages`
      : `${this.fbBase}/me/messages`;
    const r = await this.http.request<unknown>({
      method: 'POST', url, query: { access_token: input.accessToken }, body: buildBody(validated.data as SendMessageRequest),
    });
    if (!r.ok) return r;
    return parseSchema(SendMessageResponseSchema, r.value, (raw) => ({ recipientId: raw.recipient_id, messageId: raw.message_id }));
  }

  sendTypingIndicator(input: IgSendTypingInput): Promise<Result<SendMessageResult, MetaError>> {
    if (input.mode === 'instagram-login') {
      return this.sendMessage({
        mode: 'instagram-login',
        igUserId: input.igUserId,
        accessToken: input.accessToken,
        request: { recipientId: input.recipientId, senderAction: input.action },
      });
    }
    return this.sendMessage({
      mode: 'facebook-login',
      accessToken: input.accessToken,
      request: { recipientId: input.recipientId, senderAction: input.action },
    });
  }

  async listConversations(input: IgListConversationsInput): Promise<Result<{ data: Array<{ id: string; updatedTime?: string }> }, MetaError>> {
    const url = input.mode === 'instagram-login'
      ? `${this.igBase}/${input.igUserId}/conversations`
      : `${this.fbBase}/${input.pageId}/conversations`;
    const r = await this.http.request<unknown>({
      method: 'GET', url,
      query: {
        platform: 'instagram',
        fields: 'id,updated_time,participants,messages.limit(1){created_time,from,to,message}',
        limit: input.limit, after: input.after, access_token: input.accessToken,
      },
    });
    if (!r.ok) return r;
    return parseSchema(ConvSchema, r.value, (raw) => ({ data: raw.data.map((c) => {
      const item: { id: string; updatedTime?: string } = { id: c.id };
      if (c.updated_time !== undefined) item.updatedTime = c.updated_time;
      return item;
    }) }));
  }

  async getUserProfile(input: IgUserProfileInput): Promise<Result<{ id: string; username?: string; name?: string; profilePic?: string }, MetaError>> {
    const url = input.mode === 'instagram-login' ? `${this.igBase}/${input.userId}` : `${this.fbBase}/${input.userId}`;
    const fields = input.mode === 'instagram-login' ? 'id,username,name,profile_pic' : 'name,profile_pic';
    const r = await this.http.request<unknown>({
      method: 'GET', url, query: { fields, access_token: input.accessToken },
    });
    if (!r.ok) return r;
    return parseSchema(IgUserProfileSchema, r.value, (raw) => {
      const out: { id: string; username?: string; name?: string; profilePic?: string } = { id: raw.id };
      if (raw.username !== undefined) out.username = raw.username;
      if (raw.name !== undefined) out.name = raw.name;
      if (raw.profile_pic !== undefined) out.profilePic = raw.profile_pic;
      return out;
    });
  }
}

function buildBody(req: SendMessageRequest): Record<string, unknown> {
  const out: Record<string, unknown> = { recipient: { id: req.recipientId } };
  if (req.message) out.message = req.message;
  if (req.senderAction) out.sender_action = req.senderAction;
  if (req.messagingType) out.messaging_type = req.messagingType;
  if (req.tag) out.tag = req.tag;
  return out;
}
