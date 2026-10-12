import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiErrorFromResponse } from '../src/api/errors.js';

test('apiErrorFromResponse preserves structured v1 error context', async () => {
  const error = await apiErrorFromResponse(
    new Response(
      JSON.stringify({
        error: 'Browser not found',
        code: 'browser.not_found',
        requestId: 'req_test',
        details: { spaceId: 'sp_test' },
      }),
      { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } }
    )
  );

  assert.equal(error.apiError?.status, 404);
  assert.equal(error.apiError?.code, 'browser.not_found');
  assert.equal(error.apiError?.requestId, 'req_test');
  assert.match(error.message, /Code: browser\.not_found/);
  assert.match(error.message, /Request ID: req_test/);
  assert.match(error.message, /Try:\n  bctrl browsers list/);
});

test('apiErrorFromResponse suggests login for auth failures', async () => {
  const error = await apiErrorFromResponse(
    new Response(JSON.stringify({ error: 'Authentication required', code: 'auth.required' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'content-type': 'application/json' },
    })
  );

  assert.match(error.message, /Try:\n  bctrl auth login/);
});
