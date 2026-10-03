import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRootCommand } from '../src/root.js';
import { createMemoryIO } from './helpers/io.js';
import { createMockApiClient, createTestFactory, type ApiCall } from './helpers/factory.js';

function command(calls: ApiCall[], response: unknown = { status: 'unknown' }) {
  const root = createRootCommand(createTestFactory({ io: createMemoryIO(), apiClient: createMockApiClient(calls, response) }));
  root.exitOverride();
  root.configureOutput({ writeErr() {}, writeOut() {} });
  return root;
}

test('generated Computer click forwards named Browser, body and replay key once', async () => {
  const calls: ApiCall[] = [];
  await command(calls, { object: 'computer.result', status: 'unknown', eventId: 'evt_lost_click', data: null })
    .parseAsync(['browsers', 'computer', 'click', 'checkout / europe', '--body', '{"coordinate":[12,34]}',
      '--idempotency-key', 'click-once'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'post', path: '/browsers/checkout%20%2F%20europe/computer/click',
    options: { body: { coordinate: [12, 34] }, headers: { 'Idempotency-Key': 'click-once' } } }]);
});

test('generated commands preserve named selectors, explicit JSON, headers and unknown outcomes', async () => {
  const calls: ApiCall[] = [];
  await command(calls).parseAsync(['browsers', 'create', '--body', '{"name":"checkout","location":"auto"}',
    '--idempotency-key', 'retry-one', '--bctrl-space', 'team checkout'], { from: 'user' });
  await command(calls).parseAsync(['browsers', 'get', 'checkout / europe', '--wait', '60'], { from: 'user' });
  assert.deepEqual(calls, [
    { method: 'post', path: '/browsers', options: { body: { name: 'checkout', location: 'auto' },
      headers: { 'Idempotency-Key': 'retry-one', 'BCTRL-Space': 'team checkout' } } },
    { method: 'get', path: '/browsers/checkout%20%2F%20europe', options: { query: { wait: 60 } } },
  ]);
});

test('schema validation rejects undeclared headers, body typos and invalid bounded waits before auth or requests', async () => {
  const calls: ApiCall[] = [];
  for (const args of [
    ['browsers', 'create', '--body', '{"locaton":"auto"}'],
    ['browsers', 'get', 'br_1', '--wait', '61'],
    ['browsers', 'get', 'br_1', '--headers', '{"Authorization":"steal"}'],
  ]) await assert.rejects(command(calls).parseAsync(args, { from: 'user' }), /Invalid request/);
  assert.equal(calls.length, 0);
});

test('multipart CLI transport uploads real file bytes without a JSON body', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bctrl-cli-upload-'));
  try {
    const filename = path.join(directory, 'extension.crx');
    await writeFile(filename, Buffer.from([0, 1, 255]));
    const calls: ApiCall[] = [];
    await command(calls).parseAsync(['browser', 'extensions', 'create', '--file', filename,
      '--fields', '{"name":"testing"}'], { from: 'user' });
    assert.equal(calls[0]?.method, 'uploadFile');
    assert.equal(calls[0]?.path, '/browser/extensions');
    const options = calls[0]?.options as { file: Blob; fields: unknown; fileName: string };
    assert.deepEqual(Buffer.from(await options.file.arrayBuffer()), await readFile(filename));
    assert.deepEqual(options.fields, { name: 'testing' });
    assert.equal(options.fileName, 'extension.crx');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('stream operation selects the authenticated stream transport', async () => {
  const calls: ApiCall[] = [];
  const run = 'run_u1234567890123456789012';
  await command(calls).parseAsync(['runs', 'stream', run, '--last-event-id', 'evt_opaque'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'streamText', path: `/runs/${run}/stream`, options: {
    headers: { 'Last-Event-ID': 'evt_opaque' },
  } }]);
});

test('generated cap commands retain named Spaces and explicit zero or null USD limits', async () => {
  const calls: ApiCall[] = [];
  await command(calls).parseAsync(['account', 'spendingCap', 'get'], { from: 'user' });
  await command(calls).parseAsync(['account', 'spendingCap', 'update', '--body', '{"amount":0,"currency":"USD"}'], { from: 'user' });
  await command(calls).parseAsync(['spaces', 'spendingCap', 'get', 'team checkout'], { from: 'user' });
  await command(calls).parseAsync(['spaces', 'spendingCap', 'update', 'team checkout', '--body', '{"amount":null,"currency":"USD"}'], { from: 'user' });
  assert.deepEqual(calls, [
    { method: 'get', path: '/account/spending-cap', options: {} },
    { method: 'patch', path: '/account/spending-cap', options: { body: { amount: 0, currency: 'USD' } } },
    { method: 'get', path: '/spaces/team%20checkout/spending-cap', options: {} },
    { method: 'patch', path: '/spaces/team%20checkout/spending-cap', options: { body: { amount: null, currency: 'USD' } } },
  ]);
});


test('generated webhook commands allow additive Event subscriptions', async () => {
  const calls: ApiCall[] = [];
  const events = ['spending_cap.reached', 'task.awaiting_input', 'future.new_event'];
  await command(calls).parseAsync(['webhooks', 'create', '--body', JSON.stringify({ url: 'https://example.test/events', events })], { from: 'user' });
  await command(calls).parseAsync(['webhooks', 'update', 'wh_fixture', '--body', JSON.stringify({ events })], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'post', path: '/webhooks', options: { body: { url: 'https://example.test/events', events } } },
    { method: 'patch', path: '/webhooks/wh_fixture', options: { body: { events } } }]);
});
