import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { CliError } from '../../src/runtime/errors.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function buildCommand(calls: ApiCall[]) {
  const io = createMemoryIO();
  const command = createRootCommand(
    createTestFactory({
      io,
      apiClient: createMockApiClient(calls, { code: '123456' }),
    })
  );
  return { command, io };
}

test('vault totp uses the read-only GET route', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await command.parseAsync(['vault', 'totp', 'prod/github'], { from: 'user' });

  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/vault/secrets/prod%2Fgithub/totp',
      options: undefined,
    },
  ]);
});

test('vault set validates missing value fields locally', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await assert.rejects(
    command.parseAsync(['vault', 'set', 'prod/token', '--type', 'value'], { from: 'user' }),
    (error: unknown) =>
      error instanceof CliError && /Vault value secrets require --value/.test(error.message)
  );
  assert.deepEqual(calls, []);
});

test('vault set validates missing login fields locally', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await assert.rejects(
    command.parseAsync(['vault', 'set', 'prod/github', '--type', 'login', '--username', 'octo'], {
      from: 'user',
    }),
    (error: unknown) =>
      error instanceof CliError &&
      /Vault login secrets require --username and --password/.test(error.message)
  );
  assert.deepEqual(calls, []);
});

test('vault patch requires at least one patch field locally', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls);

  await assert.rejects(
    command.parseAsync(['vault', 'patch', 'prod/github'], { from: 'user' }),
    (error: unknown) =>
      error instanceof CliError && /Vault patch requires at least one field/.test(error.message)
  );
  assert.deepEqual(calls, []);
});
