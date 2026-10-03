import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function buildCommand(calls: ApiCall[]) {
  const command = createRootCommand(
    createTestFactory({
      io: createMemoryIO(),
      apiClient: createMockApiClient(calls, { data: [], nextCursor: null }),
    })
  );
  const configure = (cmd: typeof command) => {
    cmd.exitOverride();
    cmd.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
    for (const child of cmd.commands) configure(child);
  };
  configure(command);
  return command;
}

test('automation commands map to the canonical tools, conversations, and trace routes', async () => {
  const calls: ApiCall[] = [];

  await buildCommand(calls).parseAsync(
    [
      'tools',
      'call',
      'stagehand.act',
      '--bctrl-runtime-id',
      'rt_1',
      '--body',
      '{"instruction":"Continue"}',
    ],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['tools', 'calls', 'create', 'captcha.solve', '--bctrl-runtime-id', 'rt_1', '--body', '{}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    [
      'tools',
      'calls',
      'create',
      'code.execute',
      '--body',
      '{"source":"export default async () => ({ ok: true });"}',
    ],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'messages', 'create', 'conv_u1234567890123456789012', '--body', '{"text":"Complete checkout"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'update', 'conv_u1234567890123456789012', '--body', '{}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(['runs', 'trace', 'list', 'run_u1234567890123456789012'], { from: 'user' });
  await buildCommand(calls).parseAsync(['runs', 'events', 'list', 'run_u1234567890123456789012'], { from: 'user' });

  assert.deepEqual(
    calls.map(({ method, path }) => `${method} ${path}`),
    [
      'post /tools/stagehand.act/call',
      'post /tools/captcha.solve/calls',
      'post /tools/code.execute/calls',
      'post /conversations/conv_u1234567890123456789012/messages',
      'patch /conversations/conv_u1234567890123456789012',
      'get /runs/run_u1234567890123456789012/trace',
      'get /runs/run_u1234567890123456789012/events',
    ]
  );
  assert.equal((calls[0]?.options as { headers?: Record<string,string> } | undefined)?.headers?.['BCTRL-Runtime-Id'], 'rt_1');
  assert.equal((calls[0]?.options as { body?: Record<string, unknown> } | undefined)?.body?.runtimeId, undefined);
  assert.equal((calls[1]?.options as { headers?: Record<string,string> } | undefined)?.headers?.['BCTRL-Runtime-Id'], 'rt_1');
  assert.equal((calls[2]?.options as { headers?: Record<string,string> } | undefined)?.headers?.['BCTRL-Runtime-Id'], undefined);
});

test('async commands send bounded waits in the query and print 202 handles', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(['browsers', 'start', 'br_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'get', 'br_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tool-calls', 'result', 'tc_u1234567890123456789012', '--wait', '1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'get', 'conv_u1234567890123456789012', 'turn_u1234567890123456789012', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'cancel', 'conv_u1234567890123456789012', 'turn_u1234567890123456789012'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'post /browsers/br_1/start', 'get /browsers/br_1', 'get /tool-calls/tc_u1234567890123456789012/result',
    'get /conversations/conv_u1234567890123456789012/turns/turn_u1234567890123456789012', 'post /conversations/conv_u1234567890123456789012/turns/turn_u1234567890123456789012/cancel',
  ]);
  const options = calls.map((call) => call.options as { query?: { wait?: number }; body?: unknown });
  assert.deepEqual(options.slice(0, 4).map((option) => option.query?.wait), [undefined, 60, 1, 60]);
  assert.deepEqual(options[0]?.body, {});
  const count = calls.length;
  for (const wait of ['-1', '61', '0.5', 'abc']) {
    await assert.rejects(buildCommand(calls).parseAsync(['browsers', 'get', 'br_1', '--wait', wait], { from: 'user' }));
  }
  assert.equal(calls.length, count);
});

test('locations list sends pagination and catalog ordering to the discovery route', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(
    ['locations', 'list', '--limit', '1', '--cursor', 'next', '--query', '{"order":"asc"}'],
    { from: 'user' }
  );
  assert.equal(calls[0]?.method, 'get');
  assert.equal(calls[0]?.path, '/locations');
  assert.deepEqual(calls[0]?.options, {
    query: { order: 'asc', limit: 1, cursor: 'next' },
  });
});

test('browser commands expose the resource lifecycle, state discard and scoped Run history', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(['browsers', 'list'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'create', '--body', '{"headless":true}', '--idempotency-key', 'create-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'get', 'name / encoded'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'update', 'br_1', '--body', '{"recording":false}'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'start', 'br_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'stop', 'br_1', '--discard-state', 'true', '--idempotency-key', 'stop-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'runs', 'list', 'br_1', '--query', '{"status":"ended","include":"usage"}'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'connections', 'revoke', 'br_1', '--idempotency-key', 'revoke-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'delete', 'br_1', '--yes'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'get /browsers', 'post /browsers', 'get /browsers/name%20%2F%20encoded',
    'patch /browsers/br_1', 'post /browsers/br_1/start', 'post /browsers/br_1/stop',
    'get /browsers/br_1/runs', 'post /browsers/br_1/connections/revoke', 'delete /browsers/br_1',
  ]);
  const options = calls.map((call) => call.options as { body?: unknown; headers?: Record<string,string>; query?: unknown });
  assert.deepEqual(options[1]?.body, { headless: true });
  assert.equal(options[1]?.headers?.['Idempotency-Key'], 'create-1');
  assert.deepEqual(options[3]?.body, { recording: false });
  assert.deepEqual(options[4]?.body, {});
  assert.deepEqual(options[5]?.body, { discardState: true });
  assert.equal(options[5]?.headers?.['Idempotency-Key'], 'stop-1');
  assert.deepEqual(options[6]?.query, { status: 'ended', include: 'usage' });
  assert.equal(options[7]?.headers?.['Idempotency-Key'], 'revoke-1');
  const root = buildCommand([]);
  assert.equal(root.commands.some((command) => command.name() === 'runtime'), false);
});
