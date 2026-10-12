import assert from 'node:assert/strict';
import type { ApiCall } from './factory.js';

// Every generated request now pins its contract; keep route/body assertions
// readable while asserting that header alongside the caller's other headers.
export function assertApiCalls(actual: ApiCall[], expected: ApiCall[]): void {
  assert.deepEqual(actual, expected.map((call) => {
    if (call.options === undefined) return call;
    const options = call.options as Record<string, unknown>;
    return { ...call, options: { ...options,
      headers: { 'BCTRL-Version': '2026-10-03', ...(options.headers as Record<string, string> | undefined) } } };
  }));
}
