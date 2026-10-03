import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRootCommand } from '../src/root.js';
import { createMemoryIO } from './helpers/io.js';
import { createMockApiClient, createTestFactory, type ApiCall } from './helpers/factory.js';

test('create --open waits for the created browser live view and opens its URL', async () => {
  const calls: ApiCall[] = [];
  const io = createMemoryIO();
  const opened: string[] = [];
  const client = createMockApiClient(calls, { id: 'br_created', status: 'active', currentRun: { status: 'starting' } });
  client.get = async <T>(url: string): Promise<T> => {
    calls.push({ method: 'get', path: url });
    return { id: 'br_created', currentRun: { status: 'active', connections: { liveViewUrl: 'https://live.example/browser' } } } as T;
  };
  const factory = { ...createTestFactory({ io, apiClient: client }), openUrl: async (url: string) => { opened.push(url); } };
  await createRootCommand(factory).parseAsync(['browsers', 'create', '--location', 'auto', '--open'], { from: 'user' });
  assert.deepEqual(calls, [
    { method: 'post', path: '/browsers', options: { body: { location: 'auto' } } },
    { method: 'get', path: '/browsers/br_created' },
  ]);
  assert.deepEqual(opened, ['https://live.example/browser']);
});

test('MCP installers preserve other servers and use the target HTTP configuration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bctrl-mcp-install-'));
  try {
    for (const target of ['claude-code', 'cursor', 'vscode']) {
      const file = path.join(directory, `${target}.json`);
      const key = target === 'vscode' ? 'servers' : 'mcpServers';
      await writeFile(file, JSON.stringify({ custom: true, [key]: { other: { command: 'keep' } } }));
      const factory = createTestFactory({ io: createMemoryIO() });
      factory.config = async () => { throw new Error('Explicit URL must not read credentials'); };
      await createRootCommand(factory).parseAsync(['mcp', 'install', '--target', target, '--config', file,
        '--url', 'https://api.example/mcp'], { from: 'user' });
      const parsed = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(parsed.custom, true);
      assert.deepEqual(parsed[key].other, { command: 'keep' });
      assert.deepEqual(parsed[key].bctrl, { ...(target !== 'cursor' ? { type: 'http' } : {}), url: 'https://api.example/mcp' });
      assert.ok(!JSON.stringify(parsed).includes('test-key'));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('MCP installer protects conflicting entries and unreadable configuration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'bctrl-mcp-preserve-'));
  try {
    const file = path.join(directory, 'config.json');
    const args = ['mcp', 'install', '--target', 'cursor', '--config', file];
    const original = '{"mcpServers":{"bctrl":{"url":"https://old.example/mcp"}}}';
    await writeFile(file, original);
    const factory = createTestFactory({ io: createMemoryIO() });
    await assert.rejects(createRootCommand(factory).parseAsync(args, { from: 'user' }), /already configured/);
    assert.equal(await readFile(file, 'utf8'), original);
    await createRootCommand(factory).parseAsync([...args, '--force'], { from: 'user' });
    assert.equal(JSON.parse(await readFile(file, 'utf8')).mcpServers.bctrl.url, 'https://api.bctrl.ai/mcp');
    await writeFile(file, 'invalid');
    await assert.rejects(createRootCommand(factory).parseAsync(args, { from: 'user' }), /as JSON/);
    assert.equal(await readFile(file, 'utf8'), 'invalid');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
