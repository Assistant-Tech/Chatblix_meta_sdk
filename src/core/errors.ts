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
  abstract readonly kind: 'api' | 'network' | 'validation' | 'auth' | 'rate_limit' | 'config';
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = new.target.name;
  }
}

export class MetaApiError extends MetaError {
  readonly kind: 'api' | 'auth' | 'rate_limit' = 'api';
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
  retryAfterSeconds: number | undefined;
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

const AUTH_CODES = new Set([102, 190, 200, 458, 459, 460, 463, 464, 467]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export function fromGraphApiError(p: GraphApiErrorPayload, statusCode: number): MetaApiError {
  if (AUTH_CODES.has(p.code) || statusCode === 401) return new MetaAuthError(p, statusCode);
  if (RATE_LIMIT_CODES.has(p.code) || statusCode === 429) return new MetaRateLimitError(p, statusCode);
  return new MetaApiError(p, statusCode);
}
