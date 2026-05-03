import type { MetaPlatformHint } from './error-codes';

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  platform?: MetaPlatformHint;
}

export interface RawHttpResponse {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
}
