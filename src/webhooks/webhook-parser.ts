import { type Result, ok, err } from '../core/result';
import { MetaValidationError, type ValidationIssue } from '../core/errors';
import { WebhookPayloadSchema } from './webhook.schemas';
import type { ParsedEvent, WebhookAttachment } from './webhook.types';

export function parseWebhookPayload(
  raw: unknown,
): Result<ParsedEvent[], MetaValidationError> {
  const parsed = WebhookPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
      path: [...i.path],
      message: i.message,
    }));
    return err(new MetaValidationError('Invalid webhook payload', issues));
  }

  const events: ParsedEvent[] = [];
  const platform = parsed.data.object;

  for (const entry of parsed.data.entry) {
    const pageOrIgId = entry.id;
    for (const ev of entry.messaging ?? []) {
      const base = {
        platform,
        pageOrIgId,
        senderId: ev.sender.id,
        recipientId: ev.recipient.id,
        timestamp: ev.timestamp,
      };

      if (ev.message) {
        const attachments: WebhookAttachment[] = (ev.message.attachments ?? []).map((a) => {
          const att: WebhookAttachment = { type: a.type, url: a.payload?.url ?? '' };
          if (a.payload?.title !== undefined) att.title = a.payload.title;
          return att;
        });
        events.push({
          kind: 'message',
          ...base,
          messageId: ev.message.mid,
          attachments,
          isEcho: ev.message.is_echo ?? false,
          ...(ev.message.text !== undefined ? { text: ev.message.text } : {}),
        });
      } else if (ev.read) {
        events.push({ kind: 'read', ...base, watermark: ev.read.watermark });
      } else if (ev.reaction) {
        events.push({
          kind: 'reaction',
          ...base,
          messageId: ev.reaction.mid,
          reaction: ev.reaction.reaction,
          action: ev.reaction.action,
        });
      } else if (ev.postback) {
        events.push({
          kind: 'postback',
          ...base,
          payload: ev.postback.payload,
          ...(ev.postback.title !== undefined ? { title: ev.postback.title } : {}),
        });
      } else {
        events.push({ kind: 'unknown', platform, pageOrIgId, raw: ev });
      }
    }
  }

  return ok(events);
}
