import { describe, it, expect } from 'vitest';
import { parseWebhookPayload } from '../../../src/webhooks/webhook-parser';

describe('parseWebhookPayload', () => {
  it('parses message with attachments', () => {
    const r = parseWebhookPayload({
      object: 'page',
      entry: [
        {
          id: 'p1',
          time: 1,
          messaging: [
            {
              sender: { id: 's' },
              recipient: { id: 'p1' },
              timestamp: 100,
              message: {
                mid: 'm',
                text: 'hi',
                attachments: [{ type: 'image', payload: { url: 'https://x/y.jpg' } }],
              },
            },
          ],
        },
      ],
    });
    if (r.ok) {
      const ev = r.value[0]!;
      if (ev.kind !== 'message') throw new Error();
      expect(ev.text).toBe('hi');
      expect(ev.attachments[0]!.url).toBe('https://x/y.jpg');
    }
  });

  it('parses read', () => {
    const r = parseWebhookPayload({
      object: 'page',
      entry: [
        {
          id: 'p1',
          time: 1,
          messaging: [
            { sender: { id: 's' }, recipient: { id: 'p' }, timestamp: 1, read: { watermark: 99 } },
          ],
        },
      ],
    });
    if (r.ok && r.value[0]!.kind === 'read') expect(r.value[0]!.watermark).toBe(99);
  });

  it('parses reaction', () => {
    const r = parseWebhookPayload({
      object: 'instagram',
      entry: [
        {
          id: 'i',
          time: 1,
          messaging: [
            {
              sender: { id: 's' },
              recipient: { id: 'i' },
              timestamp: 1,
              reaction: { reaction: 'love', action: 'react', mid: 'm' },
            },
          ],
        },
      ],
    });
    if (r.ok) expect(r.value[0]!.kind).toBe('reaction');
  });

  it('parses postback', () => {
    const r = parseWebhookPayload({
      object: 'page',
      entry: [
        {
          id: 'p',
          time: 1,
          messaging: [
            {
              sender: { id: 's' },
              recipient: { id: 'p' },
              timestamp: 1,
              postback: { payload: 'GO' },
            },
          ],
        },
      ],
    });
    if (r.ok) expect(r.value[0]!.kind).toBe('postback');
  });

  it('rejects malformed', () => {
    expect(parseWebhookPayload({ object: 'invalid', entry: [] }).ok).toBe(false);
  });

  it('returns unknown for unrecognized events', () => {
    const r = parseWebhookPayload({
      object: 'page',
      entry: [
        {
          id: 'p',
          time: 1,
          messaging: [{ sender: { id: 's' }, recipient: { id: 'r' }, timestamp: 1 }],
        },
      ],
    });
    if (r.ok) expect(r.value[0]!.kind).toBe('unknown');
  });
});
