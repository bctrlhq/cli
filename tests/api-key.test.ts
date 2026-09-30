import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiKeyCommand } from '../src/commands/api-key/index.js';
import type { Factory } from '../src/factory.js';
import { createMemoryIO } from './helpers/io.js';

test('api-key create sends agent identity and list accepts the agent filter', async () => {
  const requests: unknown[] = [];
  const client = {
    post: async (path: string, options: unknown) => { requests.push({ path, options }); return {}; },
    get: async (path: string, options: unknown) => { requests.push({ path, options }); return { data: [], nextCursor: null }; },
  };
  const factory = { version: 'test', io: createMemoryIO(), apiClient: async () => client } as unknown as Factory;
  await createApiKeyCommand(factory).parseAsync(['create', '--type', 'agent', '--agent-name', 'Invoice bot'], { from: 'user' });
  await createApiKeyCommand(factory).parseAsync(['list', '--type', 'agent'], { from: 'user' });
  const [created, listed] = requests as Array<{ path: string; options: { body?: unknown; query?: Record<string, unknown> } }>;
  assert.equal(created!.path, '/api-keys');
  assert.deepEqual(JSON.parse(JSON.stringify(created!.options.body)), { type: 'agent', agent: { name: 'Invoice bot' } });
  assert.equal(listed!.options.query?.type, 'agent');
});
