import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BctrlApiClient } from '../../src/api/client.js';
import { createSecretsRunCommand, envName, type ChildSpawner } from '../../src/commands/secrets/index.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

/** A client whose list returns two secrets and whose reveal answers per path. */
function secretsClient(calls: ApiCall[]): BctrlApiClient {
  const base = createMockApiClient(calls);
  return {
    ...base,
    get: async <T>(path: string, options?: unknown) => {
      calls.push({ method: 'get', path, options });
      return {
        data: [
          { id: 'prod/app/db/url', type: 'value' },
          { id: 'prod/app/github', type: 'login' },
        ],
        folders: [],
        nextCursor: null,
      } as T;
    },
    post: async <T>(path: string, options?: unknown) => {
      calls.push({ method: 'post', path, options });
      const secretPath = (options as { body: { path: string } }).body.path;
      return (
        secretPath === 'prod/app/db/url'
          ? { id: secretPath, version: 1, username: null, value: 'postgres://secret' }
          : { id: secretPath, version: 4, username: 'bot', password: 'hunter2' }
      ) as T;
    },
  };
}

test('run reveals the prefix and hands the values to the child environment only', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const spawnChild: ChildSpawner = (command, args, options) => {
    spawned.push({ command, args, env: options.env ?? {} });
    return {
      on(event: string, listener: (...args: never[]) => void) {
        if (event === 'exit') setImmediate(() => (listener as (code: number) => void)(3));
        return this;
      },
    } as ReturnType<ChildSpawner>;
  };
  const command = createSecretsRunCommand(createTestFactory({ io, apiClient: secretsClient(calls) }), spawnChild);
  const previousExitCode = process.exitCode;
  try {
    await command.parseAsync(['--secrets', 'prod/app/', '--', 'node', '-e', 'process.exit(3)'], { from: 'user' });
    assert.equal(process.exitCode, 3);
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(calls[0], {
    method: 'get',
    path: '/secrets',
    options: { query: { prefix: 'prod/app/', limit: 200 } },
  });
  assert.deepEqual(
    calls.slice(1).map((call) => (call.options as { body: { path: string } }).body.path),
    ['prod/app/db/url', 'prod/app/github']
  );
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0]!.command, 'node');
  assert.deepEqual(spawned[0]!.args, ['-e', 'process.exit(3)']);
  assert.equal(spawned[0]!.env.DB_URL, 'postgres://secret');
  assert.equal(spawned[0]!.env.GITHUB_USERNAME, 'bot');
  assert.equal(spawned[0]!.env.GITHUB_PASSWORD, 'hunter2');
  // Nothing is printed: the values reach the child only.
  assert.doesNotMatch(io.stdout() + io.stderr(), /secret|hunter2/);
});

test('environment names come from the path below the prefix', () => {
  assert.equal(envName('db/url'), 'DB_URL');
  assert.equal(envName('stripe-key'), 'STRIPE_KEY');
  assert.equal(envName('API_KEY'), 'API_KEY');
});
