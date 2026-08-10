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
  it('MetaApiError surfaces the user-facing and diagnostic fields', () => {
    const e = new MetaApiError({
      message: 'Invalid parameter',
      code: 100,
      type: 'OAuthException',
      error_subcode: 2018001,
      error_user_title: 'Cannot Send Message',
      error_user_msg: "This person isn't available right now.",
      error_data: { blame_field_specs: [['recipient']] },
      is_transient: true,
      fbtrace_id: 'AbC123',
    }, 400);
    expect(e.userTitle).toBe('Cannot Send Message');
    expect(e.userMessage).toBe("This person isn't available right now.");
    expect(e.details).toEqual({ blame_field_specs: [['recipient']] });
    expect(e.isTransient).toBe(true);
    expect(e.subcode).toBe(2018001);
    expect(e.fbTraceId).toBe('AbC123');
  });

  it('appends user-facing text to message without replacing the developer message', () => {
    const e = new MetaApiError({
      message: 'Invalid parameter',
      code: 100,
      type: 'OAuthException',
      error_user_title: 'Cannot Send Message',
      error_user_msg: "This person isn't available.",
      fbtrace_id: 'x',
    }, 400);
    expect(e.message).toBe("Invalid parameter — Cannot Send Message: This person isn't available.");
  });

  it('leaves message untouched when Meta supplies no user-facing text', () => {
    const e = new MetaApiError({ message: 'Invalid parameter', code: 100, type: 't', fbtrace_id: 'x' }, 400);
    expect(e.message).toBe('Invalid parameter');
    expect(e.userTitle).toBeUndefined();
    expect(e.isTransient).toBe(false);
  });

  it('preserves undocumented fields Meta may add later', () => {
    const e = new MetaApiError({ message: 'm', code: 1, type: 't', fbtrace_id: 'f', some_future_field: 'kept' }, 400);
    expect(e.graphError['some_future_field']).toBe('kept');
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
