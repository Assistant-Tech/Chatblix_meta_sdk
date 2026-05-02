export type MessagingType = 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
export type SenderAction = 'typing_on' | 'typing_off' | 'mark_seen';
export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export interface MediaAttachment {
  type: AttachmentType;
  payload: { url: string; is_reusable?: boolean };
}
export interface TemplateAttachment {
  type: 'template';
  payload: { template_type: string; elements?: unknown[]; buttons?: unknown[]; text?: string };
}
export type MessageAttachment = MediaAttachment | TemplateAttachment;

export interface QuickReply {
  content_type: 'text' | 'user_phone_number' | 'user_email';
  title?: string; payload?: string; image_url?: string;
}
export interface MessageContent {
  text?: string; attachment?: MessageAttachment; quick_replies?: QuickReply[];
}
export interface SendMessageRequest {
  recipientId: string; message?: MessageContent;
  senderAction?: SenderAction; messagingType?: MessagingType; tag?: string;
}
export interface SendMessageResult { recipientId: string; messageId: string }
