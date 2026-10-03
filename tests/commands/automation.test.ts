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
      '--runtime',
      'rt_1',
      '--body',
      '{"instruction":"Continue"}',
    ],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['tools', 'start', 'captcha.solve', '--runtime', 'rt_1', '--body', '{}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    [
      'tools',
      'start',
      'code.execute',
      '--body',
      '{"source":"export default async () => ({ ok: true });"}',
    ],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'message', 'conv_1', '--body', '{"text":"Complete checkout"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'patch', 'conv_1', '--body', '{}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(['runs', 'trace', 'run_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['runs', 'events', 'run_1'], { from: 'user' });

  assert.deepEqual(
    calls.map(({ method, path }) => `${method} ${path}`),
    [
      'post /tools/stagehand.act/call',
      'post /tools/captcha.solve/calls',
      'post /tools/code.execute/calls',
      'post /conversations/conv_1/messages',
      'patch /conversations/conv_1',
      'get /runs/run_1/trace',
      'get /runs/run_1/events',
    ]
  );
  assert.equal((calls[0]?.options as { runtimeId?: string } | undefined)?.runtimeId, 'rt_1');
  assert.equal((calls[0]?.options as { body?: Record<string, unknown> } | undefined)?.body?.runtimeId, undefined);
  assert.equal((calls[1]?.options as { runtimeId?: string } | undefined)?.runtimeId, 'rt_1');
  assert.equal((calls[2]?.options as { runtimeId?: string } | undefined)?.runtimeId, undefined);
});

test('async commands send bounded waits in the query and print 202 handles', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(['browser', 'start', 'br_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'get', 'br_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tool-calls', 'result', 'call_1', '--wait', '1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'get', 'conv_1', 'turn_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'cancel', 'conv_1', 'turn_1'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'post /browsers/br_1/start', 'get /browsers/br_1', 'get /tool-calls/call_1/result',
    'get /conversations/conv_1/turns/turn_1', 'post /conversations/conv_1/turns/turn_1/cancel',
  ]);
  const options = calls.map((call) => call.options as { query?: { wait?: number }; body?: unknown });
  assert.deepEqual(options.slice(0, 4).map((option) => option.query?.wait), [undefined, 60, 1, 60]);
  assert.deepEqual(options[0]?.body, {});
  const count = calls.length;
  for (const wait of ['-1', '61', '0.5', 'abc']) {
    await assert.rejects(buildCommand(calls).parseAsync(['browser', 'get', 'br_1', '--wait', wait], { from: 'user' }));
  }
  assert.equal(calls.length, count);
});

test('locations list sends pagination and catalog ordering to the discovery route', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).parseAsync(
    ['locations', 'list', '--limit', '1', '--cursor', 'next', '--params', '{"order":"asc"}'],
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
  await buildCommand(calls).parseAsync(['browser', 'list'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'create', '--body', '{"headless":true}', '--idempotency-key', 'create-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'get', 'name / encoded'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'patch', 'br_1', '--body', '{"recording":false}'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'start', 'br_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'stop', 'br_1', '--discard-state', '--idempotency-key', 'stop-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'runs', 'br_1', '--params', '{"status":"ended","include":"usage"}'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'revoke-connections', 'br_1', '--idempotency-key', 'revoke-1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['browser', 'delete', 'br_1', '--yes'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'get /browsers', 'post /browsers', 'get /browsers/name%20%2F%20encoded',
    'patch /browsers/br_1', 'post /browsers/br_1/start', 'post /browsers/br_1/stop',
    'get /browsers/br_1/runs', 'post /browsers/br_1/connections/revoke', 'delete /browsers/br_1',
  ]);
  const options = calls.map((call) => call.options as { body?: unknown; idempotencyKey?: string; query?: unknown });
  assert.deepEqual(options[1]?.body, { headless: true });
  assert.equal(options[1]?.idempotencyKey, 'create-1');
  assert.deepEqual(options[3]?.body, { recording: false });
  assert.deepEqual(options[4]?.body, {});
  assert.deepEqual(options[5]?.body, { discardState: true });
  assert.equal(options[5]?.idempotencyKey, 'stop-1');
  assert.deepEqual(options[6]?.query, { status: 'ended', include: 'usage' });
  assert.equal(options[7]?.idempotencyKey, 'revoke-1');
  const root = buildCommand([]);
  assert.equal(root.commands.some((command) => command.name() === 'runtime'), false);
});
