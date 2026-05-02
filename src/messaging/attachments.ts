import type { MediaAttachment, TemplateAttachment } from './messaging.types';

function assertHttpsUrl(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('non-http');
  } catch { throw new Error(`Invalid attachment URL: ${url}`) }
}

export function imageAttachment(url: string, isReusable = false): MediaAttachment {
  assertHttpsUrl(url); return { type: 'image', payload: { url, is_reusable: isReusable } };
}
export function videoAttachment(url: string, isReusable = false): MediaAttachment {
  assertHttpsUrl(url); return { type: 'video', payload: { url, is_reusable: isReusable } };
}
export function audioAttachment(url: string, isReusable = false): MediaAttachment {
  assertHttpsUrl(url); return { type: 'audio', payload: { url, is_reusable: isReusable } };
}
export function fileAttachment(url: string, isReusable = false): MediaAttachment {
  assertHttpsUrl(url); return { type: 'file', payload: { url, is_reusable: isReusable } };
}
export function genericTemplate(elements: unknown[]): TemplateAttachment {
  return { type: 'template', payload: { template_type: 'generic', elements } };
}
export function buttonTemplate(text: string, buttons: unknown[]): TemplateAttachment {
  return { type: 'template', payload: { template_type: 'button', text, buttons } };
}
