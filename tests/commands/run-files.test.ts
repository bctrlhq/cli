import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createRootCommand } from '../../src/root.js';
import { createMockApiClient, createTestFactory, type ApiCall } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

function run(calls: ApiCall[]) {
  return (args: string[]) =>
    createRootCommand(
      createTestFactory({ io: createMemoryIO(), apiClient: createMockApiClient(calls, { data: [] }) })
    ).parseAsync(args, { from: 'user' });
}

test('runs files commands use the Run file routes', async () => {
  const calls: ApiCall[] = [];
  const cli = run(calls);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bctrl-cli-run-files-'));
  try {
    const local = path.join(dir, 'invoice.pdf');
    await writeFile(local, 'pdf');

    await cli(['runs', 'files', 'list', 'run_u1234567890123456789012', '--role', 'input']);
    await cli(['runs', 'files', 'get', 'run_u1234567890123456789012', 'file_u1234567890123456789012']);
    await cli(['runs', 'files', 'add', 'run_u1234567890123456789012', '--file-id', 'file_u1234567890123456789012']);
    await cli(['runs', 'files', 'upload', 'run_u1234567890123456789012', '--file', local, '--path', 'invoices/a.pdf', '--idempotency-key', 'k1']);
    await cli(['runs', 'files', 'retry', 'run_u1234567890123456789012', 'file_u1234567890123456789012']);
    await cli(['runs', 'files', 'remove', 'run_u1234567890123456789012', 'file_u1234567890123456789012', '--yes']);
    await cli(['runs', 'files', 'collect', 'run_u1234567890123456789012', '--runtime-path', 'downloads/r.pdf', '--filename', 'r.pdf']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    [
      'get /runs/run_u1234567890123456789012/files',
      'get /runs/run_u1234567890123456789012/files/file_u1234567890123456789012',
      'post /runs/run_u1234567890123456789012/files',
      'uploadFile /runs/run_u1234567890123456789012/files/upload',
      'post /runs/run_u1234567890123456789012/files/file_u1234567890123456789012/retry',
      'delete /runs/run_u1234567890123456789012/files/file_u1234567890123456789012',
      'post /runs/run_u1234567890123456789012/files/collect',
    ]
  );
  const options = calls.map((call) => call.options as Record<string, unknown> | undefined);
  assert.equal((options[0]?.query as Record<string, unknown>).role, 'input');
  assert.deepEqual(options[2]?.body, { fileId: 'file_u1234567890123456789012' });
  assert.equal((options[3]?.headers as Record<string, string>)['Idempotency-Key'], 'k1');
  assert.deepEqual(options[3]?.fields, { path: 'invoices/a.pdf' });
  assert.deepEqual(options[6]?.body, { runtimePath: 'downloads/r.pdf', filename: 'r.pdf' });
});
