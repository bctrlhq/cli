import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBctrlApiClient } from '../../src/api/client.js';
import { createRootCommand } from '../../src/root.js';
import { createTestFactory } from '../helpers/factory.js';
import { createMemoryIO } from '../helpers/io.js';

test('browsers fetchStream posts its body and writes the streamed response to --output', async () => {
  const seen: Array<{ method?: string; url?: string; body: unknown }> = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      seen.push({ method: request.method, url: request.url, body: JSON.parse(raw) });
      response.writeHead(200, { 'content-type': 'text/csv', 'BCTRL-Fetch-Status': '200' });
      response.write('a,b\n');
      setTimeout(() => response.end('1,2\n'), 20);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bctrl-cli-fetch-stream-'));
  try {
    const config = { apiBaseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      activeToken: { token: 'test-key', source: 'BCTRL_API_KEY' as const }, storedAuth: null };
    const output = path.join(dir, 'report.csv');
    await createRootCommand(createTestFactory({ io: createMemoryIO(), config, apiClient: createBctrlApiClient(config, {}) }))
      .parseAsync(['browsers', 'fetchStream', 'br_1', '--body', '{"url":"https://example.com/report.csv"}', '--output', output], { from: 'user' });
    assert.deepEqual(seen, [{ method: 'POST', url: '/v1/browsers/br_1/fetch/stream', body: { url: 'https://example.com/report.csv' } }]);
    assert.equal(await readFile(output, 'utf8'), 'a,b\n1,2\n');
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
