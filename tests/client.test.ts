import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBctrlApiClient } from '../src/api/client.js';
import { validateAuthToken } from '../src/api/auth.js';
import { loadCredential, saveCredential } from '../src/config/auth-store.js';
import { authStatusRun } from '../src/commands/auth/status.js';
import { CliError } from '../src/runtime/errors.js';
import { createMemoryIO } from './helpers/io.js';

const identity = {
  object: 'identity' as const, email: null, scope: 'organization' as const,
  organizationId: 'org_test', subaccountId: null, defaultSpaceId: null,
  keyId: null, plan: 'developer', effectiveScope: {
    scope: 'organization' as const, organizationId: 'org_test', subaccountId: null, defaultSpaceId: null,
  },
};
const config = { apiBaseUrl: 'https://api.example/v1/', activeToken: { token: 'key', source: 'BCTRL_API_KEY' as const }, storedAuth: null };

test('request transport preserves scoped headers, repeated query values, false, zero, and PUT body', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, '/v1/resource');
    assert.deepEqual(parsed.searchParams.getAll('ids'), ['a', 'b']);
    assert.equal(parsed.searchParams.get('active'), 'false');
    assert.equal(parsed.searchParams.get('limit'), '0');
    assert.equal(init?.method, 'PUT');
    assert.equal(init?.body, '{"value":false}');
    assert.equal(init?.redirect, 'error');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer key');
    assert.equal(headers.get('BCTRL-Version'), '2026-10-01');
    assert.equal(headers.get('BCTRL-Space'), 'my-space');
    assert.equal(headers.get('BCTRL-Subaccount-Id'), 'sub_test');
    assert.equal(headers.get('Idempotency-Key'), 'request-1');
    assert.equal(headers.get('If-Match'), '1');
    return Response.json({ ok: true });
  };
  await createBctrlApiClient(config).put('/resource', {
    query: { ids: ['a', 'b'], active: false, limit: 0 }, body: { value: false },
    headers: { 'bctrl-version': '2026-10-01', 'BCTRL-Space': 'my-space', 'BCTRL-Subaccount-Id': 'sub_test', 'Idempotency-Key': 'request-1', 'If-Match': '1' },
  });
});

test('binary POST responses preserve request bodies and bytes', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  const bytes = new Uint8Array([0, 128, 255]);
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, '{"url":"https://example.com"}');
    assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
    return new Response(bytes);
  };
  assert.deepEqual(await createBctrlApiClient(config).download('/fetch/stream', {
    method: 'POST', body: { url: 'https://example.com' },
  }), bytes);
});

test('arbitrary credential and host headers are rejected before fetch', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => { throw new Error('Must not fetch'); };
  for (const header of ['Authorization', 'authorization', 'COOKIE', 'Host']) {
    await assert.rejects(createBctrlApiClient(config).get('/resource', { headers: { [header]: 'secret' } }), /Unsupported API header/);
  }
});

test('unknown production error codes retain status and request ID', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async () => Response.json({ error: 'New failure', code: 'future.code', requestId: 'req_1' }, { status: 409 });
  await assert.rejects(createBctrlApiClient(config).get('/resource'), (error: CliError) => {
    assert.equal(error.apiError?.code, 'future.code');
    assert.equal(error.apiError?.status, 409);
    assert.equal(error.apiError?.requestId, 'req_1');
    return true;
  });
});

test('token validation accepts the production identity envelope and nullable session key', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('BCTRL-Version'), '2026-10-03');
    return Response.json(identity);
  };
  assert.deepEqual(await validateAuthToken('https://api.example/v1', 'key'), identity);
});

test('a delayed 401 does not clear credentials replaced during an API request or auth status check', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bctrl-cli-race-'));
  const env = { BCTRL_CONFIG_DIR: directory, BCTRL_SECRET_STORE: 'file' };
  const previous = globalThis.fetch;
  t.after(async () => { globalThis.fetch = previous; await rm(directory, { recursive: true, force: true }); });
  const save = async (token: string) => saveCredential({
    apiBaseUrl: config.apiBaseUrl, token, whoami: identity, method: 'api-key',
    createdAt: new Date().toISOString(), validatedAt: new Date().toISOString(),
  }, env);
  for (const mode of ['api', 'status']) {
    await save('old-key');
    const stale = { ...config, activeToken: { token: 'old-key', source: 'stored' as const } };
    globalThis.fetch = async () => {
      await save('replacement-key');
      return Response.json({ error: 'Expired', code: 'auth.invalid' }, { status: 401 });
    };
    await assert.rejects(mode === 'api' ? createBctrlApiClient(stale, env).get('/resource') : authStatusRun({
      io: createMemoryIO(), config: async () => stale, env,
    }), /401/);
    assert.equal((await loadCredential(env, config.apiBaseUrl))?.token, 'replacement-key');
  }
});

test('ending an SSE iterator cancels its reader instead of leaving the connection open', async (t) => {
  const previous = globalThis.fetch;
  t.after(() => { globalThis.fetch = previous; });
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: false\n\n')); },
    cancel() { cancelled = true; },
  });
  globalThis.fetch = async () => new Response(body);
  const stream = await createBctrlApiClient(config).streamText('/events/stream');
  for await (const chunk of stream) { assert.equal(chunk, 'data: false\n\n'); break; }
  assert.equal(cancelled, true);
});
