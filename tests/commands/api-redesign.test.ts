import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function buildCommand(calls: ApiCall[], response: unknown = { ok: true }) {
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, response),
    })
  );
  command.exitOverride();
  command.configureOutput({ writeErr: () => undefined, writeOut: () => undefined });
  return { command, io };
}

test('runtime create omits spaceId when caller uses the default space', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'rt_test' });

  await command.parseAsync(['runtime', 'create', '--name', 'checkout-test'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes',
      options: {
        body: {
          type: 'browser',
          spaceId: undefined,
          name: 'checkout-test',
          config: undefined,
          metadata: undefined,
        },
      },
    },
  ]);
});

test('runtime start sends Idempotency-Key through request options', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { runtimeId: 'rt_test', runId: 'run_test' });

  await command.parseAsync(
    ['runtime', 'start', 'rt_test', '--idempotency-key', 'start-1'],
    { from: 'user' }
  );

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes/rt_test/start',
      options: {
        idempotencyKey: 'start-1',
      },
    },
  ]);
});

test('runtime invocation create sends action body and Idempotency-Key', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'inv_test' });

  await command.parseAsync(
    [
      'runtime',
      'invocation',
      'create',
      'rt_test',
      '--action',
      'extract',
      '--instruction',
      'Extract invoice data',
      '--model',
      'openai/gpt-5-mini',
      '--tool',
      'tool_a',
      'tool_b',
      '--idempotency-key',
      'inv-1',
    ],
    { from: 'user' }
  );

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes/rt_test/invocations',
      options: {
        body: {
          action: 'extract',
          instruction: 'Extract invoice data',
          target: undefined,
          model: 'openai/gpt-5-mini',
          toolIds: ['tool_a', 'tool_b'],
          toolsetId: undefined,
          timeoutSeconds: undefined,
        },
        idempotencyKey: 'inv-1',
      },
    },
  ]);
});

test('file upload can rely on the default space', async () => {
  const calls: ApiCall[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-cli-file-'));
  try {
    const filePath = join(dir, 'note.txt');
    await writeFile(filePath, 'hello');
    const { command } = buildCommand(calls, { id: 'file_test' });

    await command.parseAsync(['file', 'upload', filePath, '--path', 'notes/note.txt'], {
      from: 'user',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'uploadFile');
    assert.equal(calls[0]?.path, '/files');
    const options = calls[0]?.options as {
      query?: Record<string, unknown>;
      fields?: Record<string, string>;
    };
    assert.deepEqual(options.query, { spaceId: undefined });
    assert.deepEqual(options.fields, { path: 'notes/note.txt' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('run routes map to current v1 paths', async () => {
  const calls: ApiCall[] = [];
  const first = buildCommand(calls, { data: [] }).command;
  const second = buildCommand(calls, { data: [] }).command;
  const third = buildCommand(calls, { data: [] }).command;

  await first.parseAsync(['run', 'events', 'list', 'run_test', '--status', 'ok'], { from: 'user' });
  await second.parseAsync(['run', 'events', 'stream', 'run_test', '--page-id', 'page_1'], {
    from: 'user',
  });
  await third.parseAsync(['run', 'invocation', 'get', 'run_test', 'inv_test'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/runs/run_test/events',
      options: {
        query: {
          type: undefined,
          status: 'ok',
          pageId: undefined,
          contextId: undefined,
          limit: undefined,
          cursor: undefined,
        },
      },
    },
    {
      method: 'streamText',
      path: '/runs/run_test/events/stream',
      options: {
        query: {
          type: undefined,
          status: undefined,
          pageId: 'page_1',
          contextId: undefined,
          limit: undefined,
          cursor: undefined,
        },
      },
    },
    {
      method: 'get',
      path: '/runs/run_test/invocations/inv_test',
      options: undefined,
    },
  ]);
});

test('new root commands map to current v1 route groups', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { data: [] });

  await command.parseAsync(['ai', 'credentials', 'get', 'cred_test'], { from: 'user' });
  await command.parseAsync(['browser-extension', 'get', 'ext_test'], { from: 'user' });
  await command.parseAsync(['api-key', 'list'], { from: 'user' });
  await command.parseAsync(['usage'], { from: 'user' });
  await command.parseAsync(['help', '--topic', 'runtimes'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/ai/credentials/cred_test',
      options: undefined,
    },
    {
      method: 'get',
      path: '/browser-extensions/ext_test',
      options: undefined,
    },
    {
      method: 'get',
      path: '/api-keys',
      options: {
        query: {
          subaccountId: undefined,
          type: undefined,
          limit: undefined,
          cursor: undefined,
        },
      },
    },
    {
      method: 'get',
      path: '/usage',
      options: undefined,
    },
    {
      method: 'get',
      path: '/help',
      options: { query: { topic: 'runtimes', audience: undefined } },
    },
  ]);
});

test('removed legacy commands are not registered', () => {
  const { command } = buildCommand([]);
  assert.deepEqual(command.commands.map((child) => child.name()).sort(), [
    'ai',
    'api-key',
    'auth',
    'browser-extension',
    'file',
    'help',
    'notification-recipient',
    'proxy',
    'run',
    'runtime',
    'space',
    'subaccount',
    'tool',
    'tool-call',
    'toolset',
    'usage',
    'vault',
    'version',
  ]);

  const run = command.commands.find((child) => child.name() === 'run');
  const space = command.commands.find((child) => child.name() === 'space');
  assert.ok(run);
  assert.ok(space);
  assert.equal(run.commands.some((child) => child.name() === 'wait'), false);
  assert.equal(run.commands.some((child) => child.name() === 'commands'), false);
  assert.equal(space.commands.some((child) => child.name() === 'agent-context'), false);
});
