import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { parseDotenv } from '../../src/commands/secrets/index.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function buildCommand(calls: ApiCall[], response: unknown = { ok: true }, stdin = '') {
  const io = createMemoryIO(stdin);
  const command = createRootCommand(createTestFactory({ io, apiClient: createMockApiClient(calls, response) }));
  return { command, io };
}

test('secrets ls lists one folder level under a prefix', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { data: [], folders: [], nextCursor: null });
  await command.parseAsync(['secrets', 'ls', 'prod/', '--limit', '10', '--type', 'login'], { from: 'user' });
  assert.deepEqual(calls, [
    {
      method: 'get',
      path: '/secrets',
      options: { query: { prefix: 'prod/', delimiter: '/', type: 'login', limit: 10 } },
    },
  ]);
});

test('secrets put reads the value from stdin and keeps the path slashes', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'prod/github/bot', version: 1 }, 'hunter2\n');
  await command.parseAsync(
    [
      'secrets', 'put', 'prod/github/bot',
      '--type', 'login',
      '--username', 'bot',
      '--origin', 'https://github.com', 'https://*.github.com',
      '--if-match', '3',
    ],
    { from: 'user' }
  );
  assert.deepEqual(calls, [
    {
      method: 'put',
      path: '/secrets/prod/github/bot',
      options: {
        body: {
          type: 'login',
          password: 'hunter2',
          username: 'bot',
          origins: ['https://github.com', 'https://*.github.com'],
        },
        headers: { 'If-Match': '"3"' },
      },
    },
  ]);
});

test('secrets put refuses an empty stdin rather than storing nothing', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, {}, '');
  command.exitOverride();
  await assert.rejects(command.parseAsync(['secrets', 'put', 'api/key'], { from: 'user' }), /Pipe the value on stdin/);
  assert.equal(calls.length, 0);
});

test('secrets rm and reveal', async () => {
  const calls: ApiCall[] = [];
  const { command } = buildCommand(calls, { id: 'api/key', version: 2, username: null, value: 'v' });
  await command.parseAsync(['secrets', 'rm', 'team/api/key'], { from: 'user' });
  await command.parseAsync(['secrets', 'reveal', 'team/api/key', '--version', '2'], { from: 'user' });
  assert.deepEqual(calls, [
    { method: 'delete', path: '/secrets/team/api/key', options: undefined },
    { method: 'post', path: '/secrets:reveal', options: { body: { path: 'team/api/key', version: 2 } } },
  ]);
});

test('secrets import stores each .env line under the prefix', async () => {
  const calls: ApiCall[] = [];
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-secrets-'));
  const file = join(dir, '.env');
  await writeFile(file, '# comment\nexport DB_URL="postgres://x"\nAPI_KEY=abc # trailing\n');
  const { command, io } = buildCommand(calls, { id: 'x', version: 1 });
  await command.parseAsync(['secrets', 'import', file, '--prefix', 'prod/app/'], { from: 'user' });
  assert.deepEqual(
    calls.map((call) => [call.method, call.path, (call.options as { body: unknown }).body]),
    [
      ['put', '/secrets/prod/app/DB_URL', { type: 'value', value: 'postgres://x' }],
      ['put', '/secrets/prod/app/API_KEY', { type: 'value', value: 'abc' }],
    ]
  );
  assert.match(io.stderr(), /Imported 2 secrets under prod\/app\//);
  assert.doesNotMatch(io.stdout() + io.stderr(), /postgres:\/\/x|abc/);
});

test('parseDotenv handles quotes, export and comments', () => {
  assert.deepEqual(parseDotenv('A=1\n\n#x\nexport B=\'two words\'\nC="line\\nbreak"'), [
    ['A', '1'],
    ['B', 'two words'],
    ['C', 'line\nbreak'],
  ]);
  assert.throws(() => parseDotenv('not a pair'), /Not a KEY=VALUE line/);
});
