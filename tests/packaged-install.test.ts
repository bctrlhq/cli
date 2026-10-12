import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('installed npm tarball exercises current HTTP requests, binary data, auth, and stream cleanup', { timeout: 180_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'bctrl-cli-package-'));
  const pack = join(directory, 'pack');
  const consumer = join(directory, 'consumer');
  await mkdir(pack);
  await mkdir(consumer);
  const requests: Array<{ method: string; url: string; headers: Record<string, unknown>; body: Buffer }> = [];
  const binary = Buffer.from([0, 255, 1, 128]);
  let streamClosed = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
    if (req.url?.startsWith('/v1/slow')) {
      // No headers: exercise deadlines while fetch is still connecting.
      return;
    } else if (req.url?.startsWith('/v1/events/stream')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.on('close', () => { streamClosed = true; });
      res.write(': heartbeat\n\ndata: one\n\ndata: two\n\n');
    } else if (req.url?.includes('/fetch/stream')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(binary);
    } else if (req.url?.startsWith('/v1/auth/whoami')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ object: 'identity', email: null, scope: 'organization', organizationId: 'org_test',
        subaccountId: null, plan: 'developer', defaultSpaceId: null, keyId: null,
        effectiveScope: { scope: 'organization', organizationId: 'org_test', subaccountId: null, defaultSpaceId: null } }));
    } else if (req.url?.startsWith('/v1/redirect')) {
      res.writeHead(302, { location: '/v1/leak' }); res.end();
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: req.method }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const env = { ...process.env, BCTRL_API_KEY: 'package-test-key',
    BCTRL_API_URL: `http://127.0.0.1:${address.port}/v1`,
    BCTRL_CONFIG_DIR: join(directory, 'auth'), BCTRL_SECRET_STORE: 'file', NO_COLOR: '1' };
  try {
    let tarball = process.env.BCTRL_CLI_TARBALL;
    if (!tarball) {
      await exec('pnpm', ['pack', '--pack-destination', pack], { cwd: process.cwd(), maxBuffer: 2_000_000 });
      const tarballs = (await readdir(pack)).filter((name) => name.endsWith('.tgz'));
      assert.equal(tarballs.length, 1);
      tarball = join(pack, tarballs[0]);
    }
    await writeFile(join(consumer, 'package.json'), '{"private":true}');
    await exec('npm', ['install', '--no-audit', '--no-fund', tarball], { cwd: consumer, maxBuffer: 2_000_000 });
    const bin = join(consumer, 'node_modules/.bin/bctrl');
    const run = (args: string[], overrides = {}) => exec(bin, args, { cwd: consumer, env: { ...env, ...overrides }, timeout: 15_000 });

    await t.test('package includes its operation catalog and runs without source dependencies', async () => {
      const help = await run(['--help'], { BCTRL_API_KEY: '' });
      assert.match(help.stdout, /browsers/);
      assert.match(help.stdout, /sandboxes/);
      assert.match(help.stdout, /tasks/);
      assert.equal((await run(['version'])).stdout, 'bctrl version 0.2.0\n');
      const manifest = JSON.parse(await readFile(join(consumer, 'node_modules/@bctrl/cli/dist/generated/commands.json'), 'utf8'));
      assert.equal(manifest.length, 198);
      const anonymous = await run(['auth', 'status', '--jq', '.authenticated'], { BCTRL_API_KEY: '' });
      assert.equal(anonymous.stdout, 'false\n');
    });

    await t.test('browser startup carries current selectors, retry key, body, and dated version', async () => {
      await run(['browsers', 'create', '--body', '{"recording":true}', '--wait', '60', '--space', 'my-space', '--subaccount-id', 'sub_test', '--idempotency-key', 'package-create']);
      const request = requests.at(-1)!;
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/browsers?wait=60');
      assert.deepEqual(JSON.parse(request.body.toString()), { recording: true });
      assert.equal(request.headers['bctrl-version'], '2026-10-03');
      assert.equal(request.headers['bctrl-space'], 'my-space');
      assert.equal(request.headers['bctrl-subaccount-id'], 'sub_test');
      assert.equal(request.headers['idempotency-key'], 'package-create');
      assert.equal(request.headers.authorization, 'Bearer package-test-key');
    });

    await t.test('PUT browser uploads contain a multipart file with exact bytes', async () => {
      const file = join(consumer, 'input.bin');
      await writeFile(file, binary);
      await run(['browsers', 'files', 'upload', 'browser', '--path', '/workspace/input.bin', '--file', file]);
      const request = requests.at(-1)!;
      assert.equal(request.method, 'PUT');
      assert.equal(new URL(request.url, env.BCTRL_API_URL).searchParams.get('path'), '/workspace/input.bin');
      const form = await new Response(new Uint8Array(request.body), { headers: { 'content-type': String(request.headers['content-type']) } }).formData();
      const part = form.get('file') as File;
      assert.equal(part.name, 'input.bin');
      assert.deepEqual(Buffer.from(await part.arrayBuffer()), binary);
    });

    await t.test('POST binary responses reach the destination file without JSON decoding', async () => {
      const out = join(consumer, 'result.bin');
      await run(['browsers', 'fetchStream', 'browser', '--body', '{"url":"https://example.com"}', '--out', out]);
      const request = requests.at(-1)!;
      assert.equal(request.method, 'POST');
      assert.deepEqual(JSON.parse(request.body.toString()), { url: 'https://example.com' });
      assert.deepEqual(await readFile(out), binary);
    });

    await t.test('authentication understands the current identity response', async () => {
      const status = await run(['auth', 'status', '--json']);
      assert.equal(JSON.parse(status.stdout).object, 'identity');
      assert.equal(JSON.parse(status.stdout).keyId, null);
      assert.equal(JSON.parse(status.stdout).authenticated, true);
    });

    await t.test('event limits close the live HTTP stream', async () => {
      const events = await run(['events', 'stream', '--max-events', '1', '--timeout-ms', '2000']);
      assert.equal(events.stdout, ': heartbeat\n\ndata: one\n\n');
      assert.equal(streamClosed, true);
    });

    await t.test('a stream deadline covers missing response headers', async () => {
      const started = performance.now();
      const result = await run(['events', 'stream', '--timeout-ms', '100'], { BCTRL_API_URL: `${env.BCTRL_API_URL}/slow` });
      assert.equal(result.stdout, '');
      assert.ok(performance.now() - started < 5000);
    });

    await t.test('authenticated redirects fail without forwarding credentials', async () => {
      const start = requests.length;
      await assert.rejects(run(['auth', 'whoami'], { BCTRL_API_URL: `${env.BCTRL_API_URL}/redirect` }), /fetch failed/);
      assert.equal(requests.length, start + 1);
      assert.equal(requests.at(-1)!.url, '/v1/redirect/auth/whoami');
    });

    await t.test('invalid requests and missing destructive confirmation do not reach the server', async () => {
      const before = requests.length;
      await assert.rejects(run(['browsers', 'delete', 'browser']), /--yes/);
      await assert.rejects(run(['browsers', 'create', '--body', '{}', '--wait', '61']), /Invalid input/);
      await assert.rejects(run(['auth', 'whoami', '--headers', '{"Authorization":"override"}']), /Invalid input/);
      assert.equal(requests.length, before);
      await run(['browsers', 'delete', 'browser', '--yes']);
      assert.equal(requests.at(-1)!.method, 'DELETE');
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
