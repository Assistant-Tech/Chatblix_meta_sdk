import { z } from 'zod';
import { MetaConfigError } from './errors';
import { META_GRAPH_API_VERSION } from './constants';
import { noopLogger, type SdkLogger } from './logger.token';

export const FacebookOAuthOptionsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).optional(),
});

export const InstagramOAuthOptionsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).optional(),
});

export const WebhookOptionsSchema = z.object({
  appSecret: z.string().min(1),
  verifyToken: z.string().min(1),
});

export const MetaSdkOptionsSchema = z.object({
  apiVersion: z.string().regex(/^v\d+\.\d+$/).default(META_GRAPH_API_VERSION),
  timeoutMs: z.number().int().positive().default(15000),
  maxRetries: z.number().int().min(0).max(5).default(2),
  userAgent: z.string().default('chatblix-meta-sdk/0.1'),
  facebook: FacebookOAuthOptionsSchema.optional(),
  instagram: InstagramOAuthOptionsSchema.optional(),
  webhook: WebhookOptionsSchema.optional(),
});

export type MetaSdkOptionsInput = z.input<typeof MetaSdkOptionsSchema> & { logger?: SdkLogger };
export type ResolvedMetaSdkConfig = z.output<typeof MetaSdkOptionsSchema> & { logger: SdkLogger };

export function resolveConfig(input: MetaSdkOptionsInput): ResolvedMetaSdkConfig {
  const parsed = MetaSdkOptionsSchema.safeParse(input);
  if (!parsed.success) throw new MetaConfigError(`Invalid SDK config: ${parsed.error.message}`);
  return { ...parsed.data, logger: input.logger ?? noopLogger };
}
