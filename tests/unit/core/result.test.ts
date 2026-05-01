import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, mapResult, unwrap } from '../../../src/core/result';

describe('Result', () => {
  it('ok constructs success', () => {
    const r = ok(42);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBe(42);
  });
  it('err constructs failure', () => {
    const r = err('boom');
    if (isErr(r)) expect(r.error).toBe('boom');
  });
  it('mapResult transforms value', () => {
    const r = mapResult(ok(2), (n) => n * 2);
    if (isOk(r)) expect(r.value).toBe(4);
  });
  it('mapResult passes err through', () => {
    expect(isErr(mapResult(err('e'), (n: number) => n * 2))).toBe(true);
  });
  it('unwrap returns value or throws', () => {
    expect(unwrap(ok(5))).toBe(5);
    expect(() => unwrap(err('x'))).toThrow();
  });
});
