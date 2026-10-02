import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiErrorFromResponse } from '../src/api/errors.js';

test('apiErrorFromResponse preserves structured v1 error context', async () => {
  const error = await apiErrorFromResponse(
    new Response(
      JSON.stringify({ error: {
        message: 'Runtime not found',
        code: 'runtime.not_found',
        requestId: 'req_test',
        details: { spaceId: 'sp_test' },
      } }),
      { status: 404, statusText: 'Not Found', headers: { 'content-type': 'application/json' } }
    )
  );

  assert.equal(error.apiError?.status, 404);
  assert.equal(error.apiError?.code, 'runtime.not_found');
  assert.equal(error.apiError?.requestId, 'req_test');
  assert.match(error.message, /Code: runtime\.not_found/);
  assert.match(error.message, /Request ID: req_test/);
  assert.match(error.message, /Try:\n  bctrl runtime list --space sp_test/);
});

test('apiErrorFromResponse suggests login for auth failures', async () => {
  const error = await apiErrorFromResponse(
    new Response(JSON.stringify({ error: { message: 'Authentication required', code: 'auth.required' } }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'content-type': 'application/json' },
    })
  );

  assert.match(error.message, /Try:\n  bctrl auth login/);
});


test('API errors retain and display the server hint for catalog codes without a local command mapping', async () => {
  const error = await apiErrorFromResponse(new Response(JSON.stringify({ error: {
    message: 'An input response is required', code: 'tool.input_required',
    hint: 'Read the input request and submit a response.', requestId: 'req-hint',
  } }), { status: 409 }));
  assert.equal(error.apiError?.hint, 'Read the input request and submit a response.');
  assert.match(error.message, /Hint: Read the input request and submit a response\./);
  assert.match(error.message, /Code: tool\.input_required/);
});

test('empty or malformed hints do not replace local command suggestions', async () => {
  for (const hint of ['   ', { unsafe: true }]) {
    const error = await apiErrorFromResponse(new Response(JSON.stringify({ error: {
      message: 'Not found', code: 'space.not_found', hint,
    } }), { status: 404 }));
    assert.equal(error.apiError?.hint, undefined);
    assert.match(error.message, /bctrl space list/);
    assert.equal(error.message.includes('Hint:'), false);
  }
});
