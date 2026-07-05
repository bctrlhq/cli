import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import {
  createMockApiClient,
  createTestFactory,
  type ApiCall,
} from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function buildCommand(calls: ApiCall[], response: unknown = { ok: true }) {
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, response),
    })
  );
  return { command, io };
}

test('space list sends documented OpenAPI query parameters', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { data: [] });

  await command.parseAsync(
    [
      'space',
      'list',
      '--subaccount',
      'sub_test',
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
      path: '/spaces',
      options: {
        query: {
          limit: 5,
          cursor: 'next',
        },
        actingSubaccountId: 'sub_test',
      },
    },
  ]);
});

test('space get uses the OpenAPI operation route', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await command.parseAsync(['space', 'get', 'sp_test'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/spaces/sp_test',
      options: undefined,
    },
  ]);
});

test('space create maps flags to the OpenAPI request body', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'sp_test' });

  await command.parseAsync(
    ['space', 'create', '--name', 'Checkout', '--subaccount-id', 'sub_test'],
    { from: 'user' }
  );

  assert.deepEqual(calls, [
    {
      method: 'post',
      path: '/spaces',
      options: {
        body: {
          name: 'Checkout',
        },
        actingSubaccountId: 'sub_test',
      },
    },
  ]);
});

test('space patch maps flags to the OpenAPI request body', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'sp_test' });

  await command.parseAsync(
    ['space', 'patch', 'sp_test', '--name', 'Checkout'],
    {
      from: 'user',
    }
  );

  assert.deepEqual(calls, [
    {
      method: 'patch',
      path: '/spaces/sp_test',
      options: {
        body: {
          name: 'Checkout',
        },
      },
    },
  ]);
});

test('space delete keeps the confirmation guard and uses the OpenAPI route', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await command.parseAsync(['space', 'delete', 'sp_test', '--yes'], {
    from: 'user',
  });

  assert.deepEqual(calls, [
    {
      method: 'delete',
      path: '/spaces/sp_test',
      options: undefined,
    },
  ]);
});

test('space environment commands use OpenAPI operation routes', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, {});

  await command.parseAsync(['space', 'env', 'get', 'sp_test'], {
    from: 'user',
  });
  await command.parseAsync(['space', 'env', 'patch', 'sp_test'], {
    from: 'user',
  });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/spaces/sp_test/environment',
      options: undefined,
    },
    {
      method: 'patch',
      path: '/spaces/sp_test/environment',
      options: {
        body: {},
      },
    },
  ]);
});
