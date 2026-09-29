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
  await buildCommand(calls).parseAsync(['runtime', 'start', 'rt_1', '--wait', '0', '--no-recording'], { from: 'user' });
  await buildCommand(calls).parseAsync(['runtime', 'get', 'rt_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['tool-calls', 'result', 'call_1', '--wait', '1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'get', 'conv_1', 'turn_1', '--wait', '60'], { from: 'user' });
  await buildCommand(calls).parseAsync(['conversations', 'turns', 'cancel', 'conv_1', 'turn_1'], { from: 'user' });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path}`), [
    'post /runtimes/rt_1/start', 'get /runtimes/rt_1', 'get /tool-calls/call_1/result',
    'get /conversations/conv_1/turns/turn_1', 'post /conversations/conv_1/turns/turn_1/cancel',
  ]);
  const options = calls.map((call) => call.options as { query?: { wait?: number }; body?: unknown });
  assert.deepEqual(options.slice(0, 4).map((option) => option.query?.wait), [0, 60, 1, 60]);
  assert.deepEqual(options[0]?.body, { recording: false });
  const count = calls.length;
  for (const wait of ['-1', '61', '0.5', 'abc']) {
    await assert.rejects(buildCommand(calls).parseAsync(['runtime', 'start', 'rt_1', '--wait', wait], { from: 'user' }));
  }
  assert.equal(calls.length, count);
});
