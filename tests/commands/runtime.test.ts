import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

test('runtime list sends space/status pagination query', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { data: [] }),
    })
  );

  await command.parseAsync(
    [
      'runtime',
      'list',
      '--space',
      'sp_test',
      '--status',
      'active',
      '--limit',
      '5',
      '--cursor',
      'next',
    ],
    { from: 'user' }
  );

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/runtimes',
      options: {
        query: { spaceId: 'sp_test', status: ['active'], limit: 5, cursor: 'next' },
      },
    },
  ]);
});

test('runtime create builds a native v1 runtime body from flags', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { id: 'rt_test' }),
    })
  );

  await command.parseAsync(['runtime', 'create', '--space', 'sp_test', '--name', 'checkout-test'], {
    from: 'user',
  });

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes',
      options: {
        body: {
          type: 'browser',
          spaceId: 'sp_test',
          name: 'checkout-test',
          config: undefined,
          metadata: undefined,
        },
      },
    },
  ]);
});

test('runtime create builds runtime config from flat proxy and fingerprint flags', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { id: 'rt_test' }),
    })
  );

  await command.parseAsync(
    [
      'runtime',
      'create',
      '--name',
      'mobile-de',
      '--profile',
      '--proxy',
      'pxy_test',
      '--device',
      'mobile',
      '--os',
      'ios',
      '--browser',
      'safari',
      '--browser-version',
      '>145',
      '--locale',
      'de-DE',
      '--locale',
      'de',
    ],
    { from: 'user' }
  );

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes',
      options: {
        body: {
          type: 'browser',
          spaceId: undefined,
          name: 'mobile-de',
          config: {
            profile: true,
            proxy: 'pxy_test',
            fingerprint: {
              device: 'mobile',
              os: 'ios',
              browser: 'safari',
              browserVersion: '>145',
              locale: ['de-DE', 'de'],
            },
          },
          metadata: undefined,
        },
      },
    },
  ]);
});

test('runtime create merges flat flags into config file', async () => {
  const calls: ApiCall[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-cli-runtime-'));
  try {
    const configPath = join(dir, 'config.json');
    await writeFile(
      configPath,
      JSON.stringify({
        idleTimeoutMinutes: 10,
        fingerprint: { browser: 'chrome', locale: 'en-US' },
      })
    );
    const io = createMemoryIO();
    const command = createRootCommand(
      createTestFactory({
        io,
        apiClient: createMockApiClient(calls, { id: 'rt_test' }),
      })
    );

    await command.parseAsync(
      [
        'runtime',
        'create',
        '--config-file',
        configPath,
        '--proxy',
        'http://user:pass@example.com:8080',
        '--browser',
        'edge',
      ],
      { from: 'user' }
    );

    assert.deepEqual(calls, [
      {
        method: 'post',
        path: '/runtimes',
        options: {
          body: {
            type: 'browser',
            spaceId: undefined,
            name: undefined,
            config: {
              idleTimeoutMinutes: 10,
              proxy: 'http://user:pass@example.com:8080',
              fingerprint: { browser: 'edge', locale: 'en-US' },
            },
            metadata: undefined,
          },
        },
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime create allows full v1 body from file via --body @file without --space', async () => {
  const calls: ApiCall[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-cli-runtime-'));
  try {
    const bodyPath = join(dir, 'runtime.json');
    await writeFile(
      bodyPath,
      JSON.stringify({ type: 'browser', spaceId: 'sp_test', name: 'input' })
    );
    const io = createMemoryIO();
    const command = createRootCommand(
      createTestFactory({
        io,
        apiClient: createMockApiClient(calls, { id: 'rt_test' }),
      })
    );

    await command.parseAsync(['runtime', 'create', '--body', `@${bodyPath}`], { from: 'user' });

    assert.deepEqual(calls, [
      {
        method: 'post',
        path: '/runtimes',
        options: {
          body: {
            type: 'browser',
            spaceId: 'sp_test',
            name: 'input',
          },
        },
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runtime start posts to the explicit v1 start route', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, {
        runtime: { id: 'rt_test', status: 'active' },
        run: { id: 'run_test' },
      }),
    })
  );

  await command.parseAsync(['runtime', 'start', 'rt_test'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes/rt_test/start',
      options: undefined,
    },
  ]);
});

test('runtime stop uses the explicit v1 stop route', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { ok: true }),
    })
  );

  await command.parseAsync(['runtime', 'stop', 'rt_test'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/runtimes/rt_test/stop',
      options: undefined,
    },
  ]);
});

test('runtime delete preserves confirmation and sends no force query', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { deleted: true, id: 'rt_test' }),
    })
  );

  await command.parseAsync(['runtime', 'delete', 'rt_test', '--yes'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'delete',
      path: '/runtimes/rt_test',
      options: undefined,
    },
  ]);
});

test('runtime target commands use documented OpenAPI routes', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { ok: true }),
    })
  );

  await command.parseAsync(['runtime', 'target', 'list', 'rt_test'], { from: 'user' });
  await command.parseAsync(
    ['runtime', 'target', 'create', 'rt_test', '--uri', 'https://example.com', '--activate'],
    { from: 'user' }
  );
  await command.parseAsync(['runtime', 'target', 'get', 'rt_test', 'page_test'], { from: 'user' });
  await command.parseAsync(['runtime', 'target', 'activate', 'rt_test', 'page_test'], {
    from: 'user',
  });
  await command.parseAsync(['runtime', 'target', 'delete', 'rt_test', 'page_test'], {
    from: 'user',
  });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/runtimes/rt_test/targets',
      options: undefined,
    },
    {
      method: 'post',
      path: '/runtimes/rt_test/targets',
      options: {
        body: { uri: 'https://example.com', activate: true },
      },
    },
    {
      method: 'get',
      path: '/runtimes/rt_test/targets/page_test',
      options: undefined,
    },
    {
      method: 'post',
      path: '/runtimes/rt_test/targets/page_test/activate',
      options: undefined,
    },
    {
      method: 'delete',
      path: '/runtimes/rt_test/targets/page_test',
      options: undefined,
    },
  ]);
});
