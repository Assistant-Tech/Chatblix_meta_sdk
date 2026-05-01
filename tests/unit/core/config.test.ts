import { describe, it, expect } from 'vitest';
import { resolveConfig, MetaSdkOptionsSchema } from '../../../src/core/config';
import { MetaConfigError } from '../../../src/core/errors';

describe('resolveConfig', () => {
  it('applies defaults', () => {
    const c = resolveConfig({});
    expect(c.apiVersion).toMatch(/^v\d+\.\d+$/);
    expect(c.timeoutMs).toBe(15000);
    expect(c.maxRetries).toBe(2);
    expect(c.userAgent).toContain('chatblix-meta-sdk');
  });
  it('rejects bad apiVersion', () => {
    expect(() => resolveConfig({ apiVersion: 'bad' } as any)).toThrow(MetaConfigError);
  });
  it('schema rejects negative timeout', () => {
    expect(MetaSdkOptionsSchema.safeParse({ timeoutMs: -1 }).success).toBe(false);
  });
});
