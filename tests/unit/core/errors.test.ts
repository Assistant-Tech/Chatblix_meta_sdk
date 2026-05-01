import { describe, it, expect } from 'vitest';
import {
  MetaError, MetaApiError, MetaAuthError, MetaRateLimitError,
  MetaNetworkError, MetaValidationError, fromGraphApiError,
} from '../../../src/core/errors';

describe('MetaError hierarchy', () => {
  it('MetaApiError carries graph fields', () => {
    const e = new MetaApiError({ message: 'm', code: 100, type: 'OAuthException', fbtrace_id: 'x' }, 400);
    expect(e.kind).toBe('api');
    expect(e.code).toBe(100);
    expect(e.statusCode).toBe(400);
  });
  it('fromGraphApiError maps code 190 to AuthError', () => {
    expect(fromGraphApiError({ message: 'm', code: 190, type: 't', fbtrace_id: 'a' }, 401)).toBeInstanceOf(MetaAuthError);
  });
  it('fromGraphApiError maps code 4 to RateLimitError', () => {
    expect(fromGraphApiError({ message: 'm', code: 4, type: 't', fbtrace_id: 'a' }, 429)).toBeInstanceOf(MetaRateLimitError);
  });
  it('MetaNetworkError captures cause', () => {
    const cause = new Error('econn');
    const e = new MetaNetworkError('net', cause);
    expect(e.kind).toBe('network');
    expect(e.cause).toBe(cause);
  });
  it('MetaValidationError carries issues', () => {
    const e = new MetaValidationError('bad', [{ path: ['x'], message: 'required' }]);
    expect(e.issues.length).toBe(1);
  });
  it('all errors extend MetaError', () => {
    const errs = [
      new MetaApiError({ message: 'm', code: 1, type: 't', fbtrace_id: 'f' }, 400),
      new MetaNetworkError('n'),
      new MetaValidationError('v', []),
    ];
    for (const e of errs) expect(e).toBeInstanceOf(MetaError);
  });
});
