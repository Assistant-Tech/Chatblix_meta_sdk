import { z } from 'zod';

const AttachmentSchema = z.object({
  type: z.enum(['image', 'video', 'audio', 'file', 'fallback', 'story_mention']),
  payload: z
    .object({
      url: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

const MessagingEventSchema = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number(),
  message: z
    .object({
      mid: z.string(),
      text: z.string().optional(),
      is_echo: z.boolean().optional(),
      attachments: z.array(AttachmentSchema).optional(),
    })
    .optional(),
  read: z.object({ watermark: z.number() }).optional(),
  reaction: z
    .object({
      reaction: z.string(),
      action: z.enum(['react', 'unreact']),
      mid: z.string(),
    })
    .optional(),
  postback: z
    .object({
      payload: z.string(),
      title: z.string().optional(),
    })
    .optional(),
});

export const WebhookEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  messaging: z.array(MessagingEventSchema).optional(),
});

export const WebhookPayloadSchema = z.object({
  object: z.enum(['page', 'instagram']),
  entry: z.array(WebhookEntrySchema),
});
