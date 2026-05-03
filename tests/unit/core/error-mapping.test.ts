import { describe, it, expect } from 'vitest';
import {
  fromGraphApiError,
  MetaApiError,
  MetaAuthError,
  MetaRateLimitError,
  MetaMessageError,
  type GraphApiErrorPayload,
} from '../../../src/core/errors';

const payload = (code: number): GraphApiErrorPayload => ({
  message: 'x', type: 'OAuthException', code, fbtrace_id: 'abc',
});

describe('fromGraphApiError', () => {
  it('maps auth codes to MetaAuthError', () => {
    expect(fromGraphApiError(payload(190), 400)).toBeInstanceOf(MetaAuthError);
    expect(fromGraphApiError(payload(102), 400)).toBeInstanceOf(MetaAuthError);
  });

  it('maps 401 status to MetaAuthError regardless of code', () => {
    expect(fromGraphApiError(payload(99999), 401)).toBeInstanceOf(MetaAuthError);
  });

  it('maps rate-limit codes (incl. 80004) to MetaRateLimitError', () => {
    expect(fromGraphApiError(payload(4), 400)).toBeInstanceOf(MetaRateLimitError);
    expect(fromGraphApiError(payload(80004), 400)).toBeInstanceOf(MetaRateLimitError);
  });

  it('maps 429 status to MetaRateLimitError regardless of code', () => {
    expect(fromGraphApiError(payload(99999), 429)).toBeInstanceOf(MetaRateLimitError);
  });

  it('maps Messenger message codes to MetaMessageError when platform=messenger', () => {
    const err = fromGraphApiError(payload(2018278), 400, 'messenger');
    expect(err).toBeInstanceOf(MetaMessageError);
    expect((err as MetaMessageError).platform).toBe('messenger');
  });

  it('maps Instagram message codes to MetaMessageError when platform=instagram', () => {
    const err = fromGraphApiError(payload(2534015), 400, 'instagram');
    expect(err).toBeInstanceOf(MetaMessageError);
    expect((err as MetaMessageError).platform).toBe('instagram');
  });

  it('falls back to MetaApiError for unmapped codes', () => {
    const err = fromGraphApiError(payload(987654), 400, 'messenger');
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).not.toBeInstanceOf(MetaMessageError);
  });

  it('does not classify a code as message error when platform hint is missing', () => {
    const err = fromGraphApiError(payload(2018278), 400);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).not.toBeInstanceOf(MetaMessageError);
  });
});
