import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { parseDotenv } from '../../src/commands/secrets/index.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

const secret = 'sec_u1234567890123456789012';
function buildCommand(calls: ApiCall[], response: unknown = { id: secret, path: 'prod/api', version: 1 }) {
  const io = createMemoryIO();
  const command = createRootCommand(createTestFactory({ io, apiClient: createMockApiClient(calls, response) }));
  return { command, io };
}

test('secrets list filters paths without turning them into identifiers', async () => {
  const calls: ApiCall[] = [];
  await buildCommand(calls).command.parseAsync(['secrets', 'list', '--prefix', 'prod/', '--delimiter', '/', '--limit', '10', '--type', 'login'], { from: 'user' });
  assert.deepEqual(calls, [{ method: 'get', path: '/secrets', options: { query: { prefix: 'prod/', delimiter: '/', limit: 10, type: 'login' } } }]);
});

test('secrets create reads write-only values from a JSON file and prints metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-secret-input-'));
  try {
    const file = join(dir, 'secret.json');
    const body = { path: 'prod/github/bot', type: 'login', password: 'hunter2', username: 'bot', origins: ['https://github.com'] };
    await writeFile(file, JSON.stringify(body));
    const calls: ApiCall[] = [];
    const { command, io } = buildCommand(calls);
    await command.parseAsync(['secrets', 'create', '--body', '@' + file], { from: 'user' });
    assert.deepEqual(calls, [{ method: 'post', path: '/secrets', options: { body } }]);
    assert.doesNotMatch(io.stdout() + io.stderr(), /hunter2/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('secrets create rejects an incomplete body before sending a request', async () => {
  const calls: ApiCall[] = [];
  await assert.rejects(buildCommand(calls).command.parseAsync(['secrets', 'create', '--body', '{}'], { from: 'user' }), /Invalid request/);
  assert.equal(calls.length, 0);
});

test('secret updates, deletion, reveal and history address stable IDs', async () => {
  const calls: ApiCall[] = [];
  for (const args of [
    ['secrets', 'update', secret, '--body', '{"label":"Renamed"}', '--if-match', '"3"'],
    ['secrets', 'delete', secret, '--yes'],
    ['secrets', 'reveal', secret, '--version', '2'],
    ['secrets', 'versions', secret, '--limit', '5'],
  ]) await buildCommand(calls).command.parseAsync(args, { from: 'user' });
  assert.deepEqual(calls, [
    { method: 'patch', path: '/secrets/' + secret, options: { body: { label: 'Renamed' }, headers: { 'If-Match': '"3"' } } },
    { method: 'delete', path: '/secrets/' + secret, options: {} },
    { method: 'post', path: '/secrets/' + secret + '/reveal', options: { body: { version: 2 } } },
    { method: 'get', path: '/secrets/' + secret + '/versions', options: { query: { limit: 5 } } },
  ]);
});

test('secrets import creates each .env value under its path prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-secrets-'));
  try {
    const file = join(dir, '.env');
    await writeFile(file, '# comment\nexport DB_URL="postgres://x"\nAPI_KEY=abc # trailing\n');
    const calls: ApiCall[] = [];
    const { command, io } = buildCommand(calls);
    await command.parseAsync(['secrets', 'import', file, '--prefix', 'prod/app/'], { from: 'user' });
    assert.deepEqual(calls.map(call => [call.method, call.path, (call.options as { body: unknown }).body]), [
      ['post', '/secrets', { path: 'prod/app/DB_URL', type: 'value', value: 'postgres://x' }],
      ['post', '/secrets', { path: 'prod/app/API_KEY', type: 'value', value: 'abc' }],
    ]);
    assert.match(io.stderr(), /Imported 2 secrets under prod\/app\//);
    assert.doesNotMatch(io.stdout() + io.stderr(), /postgres:\/\/x|abc/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('parseDotenv handles quotes, export and comments', () => {
  assert.deepEqual(parseDotenv('A=1\n\n#x\nexport B=\'two words\'\nC="line\\nbreak"'), [['A', '1'], ['B', 'two words'], ['C', 'line\nbreak']]);
  assert.throws(() => parseDotenv('not a pair'), /Not a KEY=VALUE line/);
});
