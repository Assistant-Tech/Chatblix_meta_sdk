import {
  AUTH_CODES,
  RATE_LIMIT_CODES,
  MESSENGER_MESSAGE_CODES,
  INSTAGRAM_MESSAGE_CODES,
  type MetaPlatformHint,
} from './error-codes';

/**
 * Meta's error object, verbatim. Optional fields are only present on some
 * errors; the index signature preserves any field Meta adds later instead of
 * dropping it on the floor.
 */
export interface GraphApiErrorPayload {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  subcode?: number;
  /** Short, user-presentable title — localised by Meta */
  error_user_title?: string;
  /** Longer, user-presentable explanation — localised by Meta */
  error_user_msg?: string;
  /** Endpoint-specific diagnostic payload; shape varies per error */
  error_data?: unknown;
  /** Meta hints the call may succeed if retried */
  is_transient?: boolean;
  fbtrace_id: string;
  [key: string]: unknown;
}

/**
 * Builds the `Error.message` summary. Meta's developer message stays first so
 * existing log greps keep working; the user-facing text is appended rather
 * than substituted.
 */
function buildMessage(p: GraphApiErrorPayload): string {
  const userFacing = [p.error_user_title, p.error_user_msg].filter(Boolean).join(': ');
  return userFacing ? `${p.message} — ${userFacing}` : p.message;
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
  /** Meta's user-presentable title, when it supplied one */
  readonly userTitle: string | undefined;
  /** Meta's user-presentable explanation — the only text safe to show end users */
  readonly userMessage: string | undefined;
  /** Endpoint-specific diagnostics (`error_data`); shape varies, treat as opaque */
  readonly details: unknown;
  /** Meta hints the call may succeed if retried */
  readonly isTransient: boolean;
  constructor(
    public readonly graphError: GraphApiErrorPayload,
    public readonly statusCode: number,
  ) {
    super(buildMessage(graphError));
    this.code = graphError.code;
    this.type = graphError.type;
    this.subcode = graphError.error_subcode ?? graphError.subcode;
    this.fbTraceId = graphError.fbtrace_id;
    this.userTitle = graphError.error_user_title;
    this.userMessage = graphError.error_user_msg;
    this.details = graphError.error_data;
    this.isTransient = graphError.is_transient ?? false;
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
