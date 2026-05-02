import { z } from 'zod';
import { Result, ok, err } from './result';
import { MetaValidationError, type ValidationIssue } from './errors';
import type { MetaError } from './errors';

export function parseSchema<S extends z.ZodTypeAny, O>(
  schema: S,
  value: unknown,
  transform: (raw: z.infer<S>) => O,
): Result<O, MetaError> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((i) => ({
      path: [...i.path],
      message: i.message,
    }));
    return err(new MetaValidationError('Response validation failed', issues));
  }
  return ok(transform(parsed.data));
}

export function zodIssuesToValidationError(label: string, e: z.ZodError): MetaValidationError {
  return new MetaValidationError(
    label,
    e.issues.map((i) => ({ path: [...i.path], message: i.message })),
  );
}
