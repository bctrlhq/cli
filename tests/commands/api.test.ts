import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRootCommand } from '../../src/root.js';
import { API_OPERATIONS } from '../../src/commands/shared/catalog.js';
import { validateRequest } from '../../src/commands/shared/request-input.js';
import { CLI_OPENAPI_ROUTES } from '../../src/generated/openapi-routes.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';
import type { Command } from 'commander';

function setup(input = '', response: unknown = { ok: true }) {
  const calls: ApiCall[] = [];
  const io = createMemoryIO(input);
  const client = createMockApiClient(calls, response);
  const root = createRootCommand(createTestFactory({ io, apiClient: client }));
  const configure = (command: Command): void => {
    command.exitOverride().configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
    command.commands.forEach(configure);
  };
  configure(root);
  return { root, io, calls };
}
const headers = { 'BCTRL-Version': '2026-10-03' };

test('all 198 public operations are callable and explain current inputs without loading auth', () => {
  const { root } = setup();
  assert.equal(API_OPERATIONS.length, 198);
  assert.deepEqual(API_OPERATIONS.map((o) => o.operationId).sort(), Object.keys(CLI_OPENAPI_ROUTES).sort());
  for (const operation of API_OPERATIONS) {
    let command = root;
    for (const part of operation.cli.command.split(' ')) {
      const child = command.commands.find((c) => c.name() === part);
      assert.ok(child, operation.cli.command);
      command = child;
    }
    let help = '';
    command.configureOutput({ writeOut: (value) => { help += value; } });
    command.outputHelp();
    assert.match(help, /Purpose:/, operation.operationId);
    // Compile every production JSON Schema and enforce unknown-header rejection.
    assert.throws(() => validateRequest(operation, { headers: { Authorization: 'injected' } }), /Invalid input/);
  }
  assert.ok(!root.commands.some((c) => ['runtime', 'toolsets'].includes(c.name())));
});

test('space listing preserves explicit scope, pagination, and JSON field projection', async () => {
  const { root, calls, io } = setup('', { data: [{ id: 'sp_test', name: 'test' }] });
  await root.parseAsync(['spaces', 'list', '--limit', '5', '--cursor', 'next', '--subaccount-id', 'sub_test', '--json', 'id'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'get', path: '/spaces', options: {
    query: { limit: 5, cursor: 'next' }, headers: { ...headers, 'BCTRL-Subaccount-Id': 'sub_test' },
  } }]);
  assert.deepEqual(JSON.parse(io.stdout()).data, [{ id: 'sp_test' }]);
});

test('browser startup does not inject server defaults and carries wait, space, retry key', async () => {
  const { root, calls } = setup();
  await root.parseAsync(['browsers', 'create', '--body', '{}', '--wait', '60', '--space', 'my-space', '--idempotency-key', 'create-1'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'post', path: '/browsers', options: {
    query: { wait: 60 }, body: {}, headers: { ...headers, 'BCTRL-Space': 'my-space', 'Idempotency-Key': 'create-1' },
  } }]);
});

test('clipboard write sends PUT and keeps empty text intact', async () => {
  const { root, calls } = setup();
  await root.parseAsync(['browsers', 'computer', 'clipboard', 'write', 'browser/name', '--body', '{"text":""}'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'put', path: '/browsers/browser%2Fname/computer/clipboard', options: { headers, body: { text: '' } } }]);
});

test('agent version path arguments are validated as integers', async () => {
  const { root, calls } = setup();
  await root.parseAsync(['agents', 'versions', 'get', 'my-agent', '2'], { from: 'user' });
  assert.equal(calls[0].path, '/agents/my-agent/versions/2');
  const invalid = setup();
  await assert.rejects(invalid.root.parseAsync(['agents', 'versions', 'get', 'agent', 'banana'], { from: 'user' }), /Invalid input/);
  assert.equal(invalid.calls.length, 0);
});

test('tasks accept structured input and read request bodies from the injected stdin', async () => {
  const body = { agent: 'assistant', input: [{ type: 'json', data: { answer: false } }] };
  const { root, calls } = setup(JSON.stringify(body));
  await root.parseAsync(['tasks', 'create', '--body', '-'], { from: 'user' });
  assert.deepEqual(calls[0].options, { headers, body });
});

test('secret updates carry the version precondition, and streams accept a resume cursor', async () => {
  const secret = setup();
  await secret.root.parseAsync(['secrets', 'update', 'sec_uAAAAAAAAAAAAAAAAAAAAAA', '--body', '{"label":null}', '--if-match', '"3"'], { from: 'user' });
  assert.deepEqual(secret.calls[0].options, { headers: { ...headers, 'If-Match': '"3"' }, body: { label: null } });
  const stream = setup();
  await stream.root.parseAsync(['events', 'stream', '--last-event-id', 'ev_previous'], { from: 'user' });
  assert.equal((stream.calls[0].options as { headers: Record<string, string> }).headers['Last-Event-ID'], 'ev_previous');
});

test('invalid selectors, extra fields, tuple lengths, and wait bounds fail before network access', async () => {
  for (const args of [
    ['browsers', 'create', '--body', '{"runtimeId":"retired"}'],
    ['browsers', 'create', '--body', '{}', '--wait', '61'],
    ['browsers', 'computer', 'move', 'browser', '--body', '{"coordinate":[1,2,3]}'],
    ['browsers', 'computer', 'move', 'browser', '--body', '{"coordinate":[1]}'],
    ['browsers', 'files', 'download', 'browser'],
    ['browsers', 'list', '--query', '{"bogus":true}'],
    ['auth', 'whoami', '--headers', '{"Authorization":"override"}'],
  ]) {
    const { root, calls } = setup();
    await assert.rejects(root.parseAsync(args, { from: 'user' }), /Invalid input/);
    assert.equal(calls.length, 0, args.join(' '));
  }
});

test('JSON parse errors never echo secrets', async () => {
  const { root } = setup();
  await assert.rejects(root.parseAsync(['secrets', 'create', '--body', '{TOP_SECRET'], { from: 'user' }), (error: Error) => {
    assert.match(error.message, /Invalid JSON/);
    assert.ok(!error.message.includes('TOP_SECRET'));
    return true;
  });
});

test('destructive commands require explicit confirmation before sending DELETE or revoke', async () => {
  for (const args of [['browsers', 'delete', 'browser'], ['webhooks', 'rotate-secret', 'webhook']]) {
    const missing = setup();
    await assert.rejects(missing.root.parseAsync(args, { from: 'user' }), /--yes/);
    assert.equal(missing.calls.length, 0);
    const confirmed = setup();
    await confirmed.root.parseAsync([...args, '--yes'], { from: 'user' });
    assert.equal(confirmed.calls[0].method, args[1] === 'delete' ? 'delete' : 'post');
  }
});

test('body files and multipart POST and PUT preserve filename and exact bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bctrl-cli-input-'));
  try {
    await mkdir(join(directory, 'data'));
    const file = join(directory, 'data', 'bytes.bin');
    const bytes = new Uint8Array([0, 255, 1, 254]);
    await writeFile(file, bytes);
    const bodyFile = join(directory, 'body.json');
    await writeFile(bodyFile, '{"name":"test"}');
    const body = setup();
    await body.root.parseAsync(['spaces', 'create', '--body', `@${bodyFile}`], { from: 'user' });
    assert.deepEqual((body.calls[0].options as { body: unknown }).body, { name: 'test' });
    for (const args of [ ['files', 'upload'], ['browsers', 'files', 'upload', 'browser', '--path', '/workspace/bytes.bin'] ]) {
      const { root, calls } = setup();
      await root.parseAsync([...args, '--file', file], { from: 'user' });
      assert.equal(calls[0].method, args[0] === 'files' ? 'post' : 'put');
      const form = (calls[0].options as { rawBody: FormData }).rawBody;
      const part = form.get('file') as File;
      assert.equal(part.name, 'bytes.bin');
      assert.deepEqual(new Uint8Array(await part.arrayBuffer()), bytes);
    }
    assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fetchStream retains POST and its JSON request while selecting binary output', async () => {
  const { root, calls } = setup();
  await root.parseAsync(['browsers', 'fetchStream', 'browser', '--body', '{"url":"https://example.com"}'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'download', path: '/browsers/browser/fetch/stream', options: {
    method: 'POST', headers, body: { url: 'https://example.com' },
  } }]);
});

test('stream timeout covers connection setup and rejects invalid timeout before network access', async () => {
  const { root, calls } = setup();
  await root.parseAsync(['events', 'stream', '--timeout-ms', '1'], { from: 'user' });
  assert.equal(calls[0].method, 'streamText');
  assert.ok((calls[0].options as { signal: AbortSignal }).signal instanceof AbortSignal);
  const invalid = setup();
  await assert.rejects(invalid.root.parseAsync(['events', 'stream', '--timeout-ms', '0'], { from: 'user' }), /Invalid input/);
  assert.equal(invalid.calls.length, 0);
});
