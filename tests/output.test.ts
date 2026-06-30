import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outputData } from '../src/commands/shared/output.js';
import { createMemoryIO } from './helpers/io.js';

test('outputData writes full JSON by default', async () => {
  const io = createMemoryIO();
  await outputData(io, { data: [{ id: 'rt_1', status: 'running' }] });

  assert.deepEqual(JSON.parse(io.stdout()), {
    data: [{ id: 'rt_1', status: 'running' }],
  });
});

test('outputData projects JSON fields inside data arrays', async () => {
  const io = createMemoryIO();
  await outputData(
    io,
    { data: [{ id: 'rt_1', status: 'running', ignored: true }] },
    { json: 'id,status' }
  );

  assert.deepEqual(JSON.parse(io.stdout()), {
    data: [{ id: 'rt_1', status: 'running' }],
  });
});

test('outputData renders explicit Handlebars templates', async () => {
  const io = createMemoryIO();
  await outputData(
    io,
    { data: [{ id: 'rt_1', status: 'running' }] },
    { json: true, template: '{{#each data}}{{id}} {{status}}{{newline}}{{/each}}' }
  );

  assert.equal(io.stdout(), 'rt_1 running\n');
});

test('outputData applies jq when JSON output mode is enabled', async () => {
  const io = createMemoryIO();
  await outputData(
    io,
    { data: [{ id: 'rt_1', status: 'running' }] },
    { json: true, jq: '.data[0].id' }
  );

  assert.equal(io.stdout(), 'rt_1\n');
});

test('outputData applies jq without an explicit --json', async () => {
  const io = createMemoryIO();
  await outputData(io, { data: [{ id: 'rt_1', status: 'running' }] }, { jq: '.data[0].id' });

  assert.equal(io.stdout(), 'rt_1\n');
});

test('outputData renders a template without an explicit --json', async () => {
  const io = createMemoryIO();
  await outputData(
    io,
    { data: [{ id: 'rt_1', status: 'running' }] },
    { template: '{{#each data}}{{id}} {{status}}{{newline}}{{/each}}' }
  );

  assert.equal(io.stdout(), 'rt_1 running\n');
});
