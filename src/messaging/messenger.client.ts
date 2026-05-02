import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Result, ok, err } from '../core/result';
import { MetaError, MetaValidationError } from '../core/errors';
import { HttpClient } from '../core/http-client.service';
import type { ResolvedMetaSdkConfig } from '../core/config';
import { META_GRAPH_API_BASE } from '../core/constants';
import { META_SDK_RESOLVED_CONFIG } from '../meta-sdk.constants';
import { SendMessageRequestSchema, SendMessageResponseSchema } from './messaging.schemas';
import type { SendMessageRequest, SendMessageResult, SenderAction } from './messaging.types';

const ConvSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    updated_time: z.string().optional(),
    link: z.string().optional(),
    participants: z.object({ data: z.array(z.object({ id: z.string(), name: z.string().optional(), email: z.string().optional() })) }).optional(),
    messages: z.object({ data: z.array(z.unknown()) }).optional(),
  })),
  paging: z.object({ cursors: z.object({ before: z.string(), after: z.string() }), next: z.string().optional() }).optional(),
});

const ConvMsgsSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    message: z.string().optional(),
    created_time: z.string().optional(),
    from: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  })),
});

const UserProfileSchema = z.object({
  id: z.string(),
  first_name: z.string().optional(), last_name: z.string().optional(),
  profile_pic: z.string().optional(), email: z.string().optional(),
});

export interface SendMessageInput { pageId: string; accessToken: string; request: SendMessageRequest }
export interface SendTypingInput { pageId: string; accessToken: string; recipientId: string; action: SenderAction }

@Injectable()
export class MessengerClient {
  private readonly base: string;
  constructor(
    @Inject(HttpClient) private readonly http: HttpClient,
    @Inject(META_SDK_RESOLVED_CONFIG) cfg: ResolvedMetaSdkConfig,
  ) {
    this.base = `${META_GRAPH_API_BASE}/${cfg.apiVersion}`;
  }

  async sendMessage(input: SendMessageInput): Promise<Result<SendMessageResult, MetaError>> {
    const validated = SendMessageRequestSchema.safeParse(input.request);
    if (!validated.success) return err(toValidation(validated.error));
    const r = await this.http.request<unknown>({
      method: 'POST', url: `${this.base}/${input.pageId}/messages`,
      query: { access_token: input.accessToken },
      body: buildBody(validated.data as SendMessageRequest),
    });
    if (!r.ok) return r;
    return parseSchema(SendMessageResponseSchema, r.value, (raw) => ({ recipientId: raw.recipient_id, messageId: raw.message_id }));
  }

  sendTypingIndicator(input: SendTypingInput): Promise<Result<SendMessageResult, MetaError>> {
    return this.sendMessage({
      pageId: input.pageId, accessToken: input.accessToken,
      request: { recipientId: input.recipientId, senderAction: input.action },
    });
  }

  async listConversations(input: { pageId: string; accessToken: string; limit?: number; after?: string }): Promise<Result<{ data: Array<{ id: string; updatedTime?: string }> }, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET', url: `${this.base}/${input.pageId}/conversations`,
      query: {
        platform: 'messenger',
        fields: 'id,updated_time,link,participants,messages.limit(1){created_time,from,to,message}',
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

  async getConversationMessages(input: { conversationId: string; accessToken: string }): Promise<Result<{ data: Array<{ id: string; text?: string; createdTime?: string }> }, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET', url: `${this.base}/${input.conversationId}/messages`,
      query: { fields: 'id,message,from,to,created_time', access_token: input.accessToken },
    });
    if (!r.ok) return r;
    return parseSchema(ConvMsgsSchema, r.value, (raw) => ({
      data: raw.data.map((m) => {
        const item: { id: string; text?: string; createdTime?: string } = { id: m.id };
        if (m.message !== undefined) item.text = m.message;
        if (m.created_time !== undefined) item.createdTime = m.created_time;
        return item;
      }),
    }));
  }

  async getUserProfile(input: { userId: string; accessToken: string }): Promise<Result<{ id: string; firstName?: string; lastName?: string; profilePic?: string; email?: string }, MetaError>> {
    const r = await this.http.request<unknown>({
      method: 'GET', url: `${this.base}/${input.userId}`,
      query: { fields: 'first_name,last_name,profile_pic,email', access_token: input.accessToken },
    });
    if (!r.ok) return r;
    return parseSchema(UserProfileSchema, r.value, (raw) => {
      const out: { id: string; firstName?: string; lastName?: string; profilePic?: string; email?: string } = { id: raw.id };
      if (raw.first_name !== undefined) out.firstName = raw.first_name;
      if (raw.last_name !== undefined) out.lastName = raw.last_name;
      if (raw.profile_pic !== undefined) out.profilePic = raw.profile_pic;
      if (raw.email !== undefined) out.email = raw.email;
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
function toValidation(e: z.ZodError): MetaValidationError {
  return new MetaValidationError('Invalid send-message request', e.issues.map((i) => ({ path: [...i.path], message: i.message })));
}
function parseSchema<S extends z.ZodTypeAny, O>(schema: S, value: unknown, transform: (raw: z.infer<S>) => O): Result<O, MetaError> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return err(new MetaValidationError('Response validation failed', parsed.error.issues.map((i) => ({ path: [...i.path], message: i.message }))));
  return ok(transform(parsed.data));
}
