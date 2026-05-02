import { describe, it, expect } from 'vitest';
import {
  imageAttachment, videoAttachment, audioAttachment, fileAttachment,
  genericTemplate, buttonTemplate,
} from '../../../src/messaging/attachments';

describe('attachments', () => {
  it('imageAttachment', () => {
    expect(imageAttachment('https://x/y.jpg', true)).toEqual({ type: 'image', payload: { url: 'https://x/y.jpg', is_reusable: true } });
  });
  it('videoAttachment defaults reusable false', () => {
    expect(videoAttachment('https://x/v.mp4').payload.is_reusable).toBe(false);
  });
  it('audioAttachment', () => { expect(audioAttachment('https://x/a.mp3').type).toBe('audio') });
  it('fileAttachment', () => { expect(fileAttachment('https://x/d.pdf').type).toBe('file') });
  it('genericTemplate wraps elements', () => {
    const a = genericTemplate([{ title: 't' }]);
    expect(a.payload.template_type).toBe('generic');
    expect(a.payload.elements).toHaveLength(1);
  });
  it('buttonTemplate', () => {
    const a = buttonTemplate('hi', [{ type: 'postback', title: 'go', payload: 'GO' }]);
    expect(a.payload.template_type).toBe('button');
    expect(a.payload.text).toBe('hi');
  });
  it('throws on invalid url', () => { expect(() => imageAttachment('not-a-url')).toThrow() });
});
