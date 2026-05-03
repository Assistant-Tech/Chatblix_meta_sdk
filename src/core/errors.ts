import {
  AUTH_CODES,
  RATE_LIMIT_CODES,
  MESSENGER_MESSAGE_CODES,
  INSTAGRAM_MESSAGE_CODES,
  type MetaPlatformHint,
} from './error-codes';

export interface GraphApiErrorPayload {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  subcode?: number;
  fbtrace_id: string;
}

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export abstract class MetaError extends Error {
  abstract readonly kind:
    | 'api'
    | 'network'
    | 'validation'
    | 'auth'
    | 'rate_limit'
    | 'message'
    | 'config';
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
  }
}

export class MetaApiError extends MetaError {
  readonly kind: 'api' | 'auth' | 'rate_limit' | 'message' = 'api';
  readonly code: number;
  readonly type: string;
  readonly subcode: number | undefined;
  readonly fbTraceId: string;
  constructor(
    public readonly graphError: GraphApiErrorPayload,
    public readonly statusCode: number,
  ) {
    super(graphError.message);
    this.code = graphError.code;
    this.type = graphError.type;
    this.subcode = graphError.error_subcode ?? graphError.subcode;
    this.fbTraceId = graphError.fbtrace_id;
  }
}

export class MetaAuthError extends MetaApiError {
  override readonly kind = 'auth' as const;
}

export class MetaRateLimitError extends MetaApiError {
  override readonly kind = 'rate_limit' as const;
  readonly retryAfterSeconds: number | undefined;
  constructor(
    graphError: GraphApiErrorPayload,
    statusCode: number,
    retryAfterSeconds?: number,
  ) {
    super(graphError, statusCode);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MetaMessageError extends MetaApiError {
  override readonly kind = 'message' as const;
  readonly platform: MetaPlatformHint;
  constructor(
    graphError: GraphApiErrorPayload,
    statusCode: number,
    platform: MetaPlatformHint,
  ) {
    super(graphError, statusCode);
    this.platform = platform;
  }
}

export class MetaNetworkError extends MetaError {
  readonly kind = 'network' as const;
}

export class MetaValidationError extends MetaError {
  readonly kind = 'validation' as const;
  constructor(
    message: string,
    public readonly issues: ValidationIssue[],
  ) {
    super(message);
  }
}

export class MetaConfigError extends MetaError {
  readonly kind = 'config' as const;
}

export function fromGraphApiError(
  p: GraphApiErrorPayload,
  statusCode: number,
  platform?: MetaPlatformHint,
): MetaApiError {
  if (AUTH_CODES.has(p.code) || statusCode === 401) {
    return new MetaAuthError(p, statusCode);
  }
  if (RATE_LIMIT_CODES.has(p.code) || statusCode === 429) {
    return new MetaRateLimitError(p, statusCode);
  }
  if (platform === 'messenger' && MESSENGER_MESSAGE_CODES.has(p.code)) {
    return new MetaMessageError(p, statusCode, 'messenger');
  }
  if (platform === 'instagram' && INSTAGRAM_MESSAGE_CODES.has(p.code)) {
    return new MetaMessageError(p, statusCode, 'instagram');
  }
  return new MetaApiError(p, statusCode);
}
