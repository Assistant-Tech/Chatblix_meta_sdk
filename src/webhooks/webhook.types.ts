export type WebhookObject = 'page' | 'instagram';

export interface WebhookAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'fallback' | 'story_mention';
  url: string;
  title?: string;
}

export type ParsedEvent =
  | {
      kind: 'message';
      platform: WebhookObject;
      pageOrIgId: string;
      senderId: string;
      recipientId: string;
      messageId: string;
      text?: string;
      attachments: WebhookAttachment[];
      timestamp: number;
      isEcho: boolean;
    }
  | {
      kind: 'read';
      platform: WebhookObject;
      pageOrIgId: string;
      senderId: string;
      recipientId: string;
      watermark: number;
      timestamp: number;
    }
  | {
      kind: 'reaction';
      platform: WebhookObject;
      pageOrIgId: string;
      senderId: string;
      recipientId: string;
      messageId: string;
      reaction: string;
      action: 'react' | 'unreact';
      timestamp: number;
    }
  | {
      kind: 'postback';
      platform: WebhookObject;
      pageOrIgId: string;
      senderId: string;
      recipientId: string;
      payload: string;
      title?: string;
      timestamp: number;
    }
  | {
      kind: 'unknown';
      platform: WebhookObject;
      pageOrIgId: string;
      raw: unknown;
    };
