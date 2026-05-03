import { Inject, Injectable } from '@nestjs/common';
import { Result, ok, err } from './result';
import {
  MetaError,
  MetaApiError,
  MetaNetworkError,
  MetaRateLimitError,
  fromGraphApiError,
  type GraphApiErrorPayload,
} from './errors';
import type { MetaPlatformHint } from './error-codes';
import type { ResolvedMetaSdkConfig } from './config';
import type { HttpRequest, RawHttpResponse } from './http-client.types';
import type { SdkLogger } from './logger.token';
import { META_SDK_LOGGER, META_SDK_RESOLVED_CONFIG } from '../meta-sdk.constants';

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

@Injectable()
export class HttpClient {
  constructor(
    @Inject(META_SDK_RESOLVED_CONFIG) private readonly cfg: ResolvedMetaSdkConfig,
    @Inject(META_SDK_LOGGER) private readonly logger: SdkLogger,
  ) {}

  async request<T>(req: HttpRequest): Promise<Result<T, MetaError>> {
    const url = this.buildUrl(req.url, req.query);
    const init: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.cfg.userAgent,
        ...(req.headers ?? {}),
      },
    };
    if (req.body !== undefined) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    let attempt = 0;
    let lastError: MetaError | null = null;
    while (attempt <= this.cfg.maxRetries) {
      const raw = await this.execute(url, init);
      if (raw.kind === 'network-error') {
        lastError = raw.error;
        if (attempt < this.cfg.maxRetries) {
          await this.backoff(attempt);
          attempt++;
          continue;
        }
        return err(raw.error);
      }
      const { response } = raw;
      if (response.status >= 200 && response.status < 300) {
        return this.parseJson<T>(response);
      }

      const apiError = this.parseGraphError(response, req.platform);
      if (apiError instanceof MetaRateLimitError && attempt < this.cfg.maxRetries) {
        await this.backoff(attempt, apiError.retryAfterSeconds);
        attempt++;
        lastError = apiError;
        continue;
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < this.cfg.maxRetries) {
        await this.backoff(attempt);
        attempt++;
        lastError = apiError;
        continue;
      }
      return err(apiError);
    }
    return err(lastError ?? new MetaNetworkError('exhausted retries'));
  }

  private buildUrl(base: string, query?: HttpRequest['query']): string {
    if (!query) return base;
    const u = new URL(base);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  private async execute(
    url: string,
    init: RequestInit,
  ): Promise<
    | { kind: 'response'; response: RawHttpResponse }
    | { kind: 'network-error'; error: MetaNetworkError }
  > {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      const bodyText = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      return { kind: 'response', response: { status: res.status, headers, bodyText } };
    } catch (e) {
      let safeUrl = url;
      try {
        const u = new URL(url);
        safeUrl = `${u.origin}${u.pathname}`;
      } catch {
        // url not parseable; fall back to raw
      }
      this.logger.warn('http_network_error', { url: safeUrl, message: (e as Error).message });
      return { kind: 'network-error', error: new MetaNetworkError((e as Error).message, e) };
    } finally {
      clearTimeout(timer);
    }
  }

  private parseJson<T>(response: RawHttpResponse): Result<T, MetaError> {
    if (!response.bodyText) return ok(undefined as T);
    try {
      return ok(JSON.parse(response.bodyText) as T);
    } catch (e) {
      return err(new MetaNetworkError('Invalid JSON response', e));
    }
  }

  private parseGraphError(response: RawHttpResponse, platform?: MetaPlatformHint): MetaApiError {
    let payload: GraphApiErrorPayload | undefined;
    try {
      const parsed = JSON.parse(response.bodyText) as { error?: GraphApiErrorPayload };
      payload = parsed.error;
    } catch {
      // body wasn't JSON; fall through
    }
    if (!payload) {
      payload = {
        message: response.bodyText || `HTTP ${response.status}`,
        code: 0,
        type: 'HttpError',
        fbtrace_id: '',
      };
    }
    const apiError = fromGraphApiError(payload, response.status, platform);
    if (apiError instanceof MetaRateLimitError) {
      const ra = response.headers['retry-after'];
      if (ra) {
        return new MetaRateLimitError(apiError.graphError, apiError.statusCode, Number(ra));
      }
    }
    return apiError;
  }

  private backoff(attempt: number, overrideSeconds?: number): Promise<void> {
    const ms = overrideSeconds ? overrideSeconds * 1000 : Math.min(1000 * 2 ** attempt, 8000);
    return new Promise((r) => setTimeout(r, ms));
  }
}
