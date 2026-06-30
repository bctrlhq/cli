import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

test('file list maps --space to v1 spaceId query', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { data: [] }),
    })
  );

  await command.parseAsync(['file', 'list', '--space', 'sp_test', '--prefix', 'runs/', '--limit', '10'], {
    from: 'user',
  });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/files',
      options: {
        query: {
          spaceId: 'sp_test',
          source: undefined,
          prefix: 'runs/',
          include: undefined,
          createdAfter: undefined,
          q: undefined,
          limit: 10,
          cursor: undefined,
        },
      },
    },
  ]);
});
