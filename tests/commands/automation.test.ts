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
  command.exitOverride();
  command.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
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
    ['conversations', 'message', 'conv_1', '--body', '{"text":"Complete checkout"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(
    ['conversations', 'patch', 'conv_1', '--body', '{"agent":"stagehand"}'],
    { from: 'user' }
  );
  await buildCommand(calls).parseAsync(['runs', 'trace', 'run_1'], { from: 'user' });
  await buildCommand(calls).parseAsync(['runs', 'events', 'run_1'], { from: 'user' });

  assert.deepEqual(
    calls.map(({ method, path }) => `${method} ${path}`),
    [
      'post /tools/stagehand.act/call',
      'post /tools/captcha.solve/calls',
      'post /conversations/conv_1/messages',
      'patch /conversations/conv_1',
      'get /runs/run_1/trace',
      'get /runs/run_1/events',
    ]
  );
  assert.equal((calls[0]?.options as { runtimeId?: string } | undefined)?.runtimeId, 'rt_1');
  assert.equal((calls[0]?.options as { body?: Record<string, unknown> } | undefined)?.body?.runtimeId, undefined);
  assert.equal((calls[1]?.options as { runtimeId?: string } | undefined)?.runtimeId, 'rt_1');
});
