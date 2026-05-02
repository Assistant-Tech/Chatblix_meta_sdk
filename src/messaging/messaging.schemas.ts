import { z } from 'zod';
export const SendMessageResponseSchema = z.object({ recipient_id: z.string(), message_id: z.string() });

export const QuickReplySchema = z.object({
  content_type: z.enum(['text','user_phone_number','user_email']),
  title: z.string().max(20).optional(),
  payload: z.string().max(1000).optional(),
  image_url: z.string().url().optional(),
});

export const MessageContentSchema = z.object({
  text: z.string().max(2000).optional(),
  attachment: z.unknown().optional(),
  quick_replies: z.array(QuickReplySchema).max(13).optional(),
}).refine((v) => v.text !== undefined || v.attachment !== undefined, { message: 'message must have text or attachment' });

export const SendMessageRequestSchema = z.object({
  recipientId: z.string().min(1),
  message: MessageContentSchema.optional(),
  senderAction: z.enum(['typing_on','typing_off','mark_seen']).optional(),
  messagingType: z.enum(['RESPONSE','UPDATE','MESSAGE_TAG']).optional(),
  tag: z.string().optional(),
}).refine((v) => v.message !== undefined || v.senderAction !== undefined, { message: 'either message or senderAction must be provided' });
