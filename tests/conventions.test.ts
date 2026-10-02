import assert from 'node:assert/strict';
import test from 'node:test';
import { apiErrorFromResponse } from '../src/api/errors.js';

test('CLI errors read the nested envelope and retain actionable context', async () => {
  const error = await apiErrorFromResponse(Response.json({ error: {
    message: 'Denied', code: 'auth.forbidden', hint: 'Grant computer scope.',
    reasonClass: 'capability_denied', details: { scope: 'computer' }, future: true,
  } }, { status: 403, headers: { 'BCTRL-Request-Id': 'req-test' } }));
  assert.equal(error.apiError?.code, 'auth.forbidden');
  assert.equal(error.apiError?.requestId, 'req-test');
  assert.equal(error.apiError?.reasonClass, 'capability_denied');
  assert.deepEqual(error.apiError?.details, { scope: 'computer' });
  assert.match(error.message, /Grant computer scope/);
});
