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

test('automation commands map to the canonical tools, tasks, conversations, and trace routes', async () => {
  const calls: ApiCall[] = [];

  await buildCommand(calls).parseAsync(
    ['tools', 'calls', 'create', 'stagehand.act', '--body', '{"input":{"instruction":"Continue"},"runtimeId":"br_u1234567890123456789012"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['tools', 'calls', 'create', 'captcha.solve', '--body', '{"input":{},"runtimeId":"br_u1234567890123456789012"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    [
      'tools',
      'calls',
      'create',
      'code.execute',
      '--body',
      '{"input":{"source":"export default async () => ({ ok: true });"}}',
    ],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['tasks', 'create', '--body', '{"agent":"agt_1","input":"Complete checkout"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'update', 'conv_u1234567890123456789012', '--body', '{}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(['runs', 'trace', 'list', 'run_u1234567890123456789012'], { from: 'user' });
  // A Run's events are the one Event log filtered by run.
  await buildCommand(calls).parseAsync(['events', 'list', '--query', '{"run":"run_u1234567890123456789012"}'], { from: 'user' });

  assert.deepEqual(
    calls.map(({ method, path }) => `${method} ${path}`),
    [
      'post /tools/stagehand.act/calls',
      'post /tools/captcha.solve/calls',
      'post /tools/code.execute/calls',
      'post /tasks',
      'patch /conversations/conv_u1234567890123456789012',
      'get /runs/run_u1234567890123456789012/trace',
      'get /events',
    ]
  );
  // The browser is a body field; the old BCTRL-Runtime-Id header is gone.
  const options = calls.map((call) => call.options as { headers?: Record<string, string>; body?: Record<string, unknown> } | undefined);
  assert.equal(options[0]?.headers?.['BCTRL-Runtime-Id'], undefined);
  assert.equal(options[0]?.body?.runtimeId, 'br_u1234567890123456789012');
  assert.equal(options[2]?.body?.runtimeId, undefined);
  assert.deepEqual(options[3]?.body, { agent: 'agt_1', input: 'Complete checkout' });
  assert.equal((options[6] as { query?: Record<string, unknown> } | undefined)?.query?.run, 'run_u1234567890123456789012');
  const root = buildCommand([]);
  assert.equal(root.commands.find((command) => command.name() === 'tools')?.commands.some((command) => command.name() === 'call'), false);
});

test('async commands send bounded waits in the query and print 202 handles', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(['browsers', 'start', 'br_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browsers', 'get', 'br_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tool-calls', 'result', 'tc_u1234567890123456789012', '--wait', '1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tasks', 'get', 'task_u1234567890123456789012', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tasks', 'cancel', 'task_u1234567890123456789012'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'post /browsers/br_1/start', 'get /browsers/br_1', 'get /tool-calls/tc_u1234567890123456789012/result',
    'get /tasks/task_u1234567890123456789012', 'post /tasks/task_u1234567890123456789012/cancel',
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
