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

    await cli(['runs', 'files', 'list', 'run_1', '--role', 'input']);
    await cli(['runs', 'files', 'get', 'run_1', 'file_1']);
    await cli(['runs', 'files', 'add', 'run_1', 'file_1']);
    await cli(['runs', 'files', 'upload', 'run_1', local, '--path', 'invoices/a.pdf', '--idempotency-key', 'k1']);
    await cli(['runs', 'files', 'retry', 'run_1', 'file_1']);
    await cli(['runs', 'files', 'remove', 'run_1', 'file_1', '--yes']);
    await cli(['runs', 'files', 'collect', 'run_1', 'downloads/r.pdf', '--filename', 'r.pdf']);
    await cli(['runtime', 'start', 'rt_1', '--file', 'file_1', 'file_2']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    [
      'get /runs/run_1/files',
      'get /runs/run_1/files/file_1',
      'post /runs/run_1/files',
      'uploadFile /runs/run_1/files/upload',
      'post /runs/run_1/files/file_1/retry',
      'delete /runs/run_1/files/file_1',
      'post /runs/run_1/files/collect',
      'post /runtimes/rt_1/start',
    ]
  );
  const options = calls.map((call) => call.options as Record<string, unknown> | undefined);
  assert.equal((options[0]?.query as Record<string, unknown>).role, 'input');
  assert.deepEqual(options[2]?.body, { fileId: 'file_1' });
  assert.equal(options[3]?.idempotencyKey, 'k1');
  assert.deepEqual(options[3]?.fields, { path: 'invoices/a.pdf' });
  assert.deepEqual(options[6]?.body, { runtimePath: 'downloads/r.pdf', filename: 'r.pdf' });
  assert.deepEqual(options[7]?.body, { files: [{ fileId: 'file_1' }, { fileId: 'file_2' }] });
});
