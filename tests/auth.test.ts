import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { AuthError, CliError } from '../src/runtime/errors.js';
import {
  clearCredential,
  loadCredential,
  readStoredMetadata,
  saveCredential,
  type AuthMethod,
} from '../src/config/auth-store.js';
import { getMetadataFilePath } from '../src/config/paths.js';
import {
  readPendingDeviceAuth,
  savePendingDeviceAuth,
} from '../src/config/pending-auth.js';
import { loadConfig } from '../src/config/config.js';
import { createBctrlApiClient } from '../src/api/client.js';
import { authLoginRun } from '../src/commands/auth/login.js';
import { authLogoutRun } from '../src/commands/auth/logout.js';
import { authStatusRun } from '../src/commands/auth/status.js';
import { authTokenRun } from '../src/commands/auth/token.js';
import { createMemoryIO } from './helpers/io.js';

const storedWhoami = {
  email: 'user@example.com',
  scope: 'organization' as const,
  organizationId: 'org_test',
  subaccountId: null,
  defaultSpaceId: '00000000-0000-4000-8000-000000000001',
  effectiveScope: {
    scope: 'organization' as const,
    organizationId: 'org_test',
    subaccountId: null,
    defaultSpaceId: '00000000-0000-4000-8000-000000000001',
  },
  keyId: 'key_test',
  plan: 'developer',
};

// Tests force the plaintext-file backend so they never touch the real OS keychain.
async function withTempEnv(
  fn: (env: NodeJS.ProcessEnv) => Promise<void>,
  extra: NodeJS.ProcessEnv = {}
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'bctrl-cli-auth-'));
  try {
    await fn({ BCTRL_CONFIG_DIR: dir, BCTRL_SECRET_STORE: 'file', ...extra });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function saveTestCredential(
  env: NodeJS.ProcessEnv,
  token = 'stored-key',
  method: AuthMethod = 'api-key'
): Promise<void> {
  await saveCredential(
    {
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      token,
      whoami: storedWhoami,
      method,
      createdAt: '2026-05-14T00:00:00.000Z',
      validatedAt: '2026-05-14T00:00:00.000Z',
    },
    env
  );
}

test('loadConfig prefers BCTRL_API_KEY over stored auth', async () => {
  await withTempEnv(
    async (env) => {
      await saveTestCredential(env);
      const config = await loadConfig(env);
      assert.deepEqual(config.activeToken, {
        token: 'env-key',
        source: 'BCTRL_API_KEY',
      });
      assert.equal(config.storedAuth, null);
    },
    { BCTRL_API_KEY: 'env-key' }
  );
});

test('loadConfig uses stored auth when env API key is absent', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env);
    const config = await loadConfig(env);
    assert.deepEqual(config.activeToken, {
      token: 'stored-key',
      source: 'stored',
    });
    assert.equal(config.storedAuth?.token, 'stored-key');
    assert.equal(config.storedAuth?.backend, 'file');
    assert.equal(config.storedAuth?.method, 'api-key');
  });
});

test('the metadata file never contains the secret', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env, 'super-secret-key');
    const raw = await readFile(getMetadataFilePath(env), 'utf8');
    assert.doesNotMatch(raw, /super-secret-key/);
    const meta = await readStoredMetadata(env);
    assert.equal(meta?.backend, 'file');
    assert.equal('token' in (meta as object), false);
  });
});

test('loadCredential returns null when the secret is missing (orphaned metadata)', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env);
    // Drop only the secret file, leaving the metadata behind.
    await clearSecretOnly(env);
    assert.equal(await loadCredential(env), null);
  });
});

test('loadCredential ignores a credential for a different API base URL', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env);
    assert.equal(await loadCredential(env, 'http://localhost:8787/v1'), null);
    assert.ok(await loadCredential(env, 'https://api.bctrl.ai/v1'));
  });
});

test('loadCredential waits briefly while credential metadata is being written', async () => {
  await withTempEnv(async (env) => {
    const markerPath = join(dirname(getMetadataFilePath(env)), 'auth.write');
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(markerPath, new Date().toISOString());

    const pendingLoad = loadCredential(env, 'https://api.bctrl.ai/v1');
    await new Promise((resolve) => setTimeout(resolve, 150));
    await saveTestCredential(env, 'stored-key');

    const credential = await pendingLoad;
    assert.equal(credential?.token, 'stored-key');
  });
});

test('loadConfig ignores BCTRL_TOKEN', async () => {
  await withTempEnv(
    async (env) => {
      const config = await loadConfig(env);
      assert.equal(config.activeToken, null);
    },
    { BCTRL_TOKEN: 'legacy-token' }
  );
});

test('auth login stores BCTRL_API_KEY without prompting', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    await authLoginRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'env-key', source: 'BCTRL_API_KEY' },
        storedAuth: null,
      }),
      validateToken: async (apiBaseUrl, token) => {
        assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
        assert.equal(token, 'env-key');
        return storedWhoami;
      },
    });

    const stored = await loadCredential(env);
    assert.equal(stored?.token, 'env-key');
    assert.match(io.stderr(), /Using BCTRL_API_KEY from environment/);
    assert.match(io.stderr(), /Credentials saved to/);
    assert.match(io.stderr(), /store: file/);
  });
});

test('auth login stores an API key from --token-file', async () => {
  await withTempEnv(async (env) => {
    const tokenPath = join(env.BCTRL_CONFIG_DIR!, 'token.txt');
    await writeFile(tokenPath, 'file-key\n');

    const io = createMemoryIO();
    await authLoginRun({
      io,
      env,
      tokenFile: tokenPath,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
      validateToken: async (apiBaseUrl, token) => {
        assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
        assert.equal(token, 'file-key');
        return storedWhoami;
      },
    });

    const stored = await loadCredential(env);
    assert.equal(stored?.token, 'file-key');
    assert.equal(stored?.method, 'api-key');
    assert.match(io.stderr(), /Using API key from token file/);
  });
});

test('auth login --url prints only the browser authorization URL, saves pending state, and exits', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    let started = 0;

    await authLoginRun({
      io,
      env,
      url: true,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
      validateToken: async () => {
        throw new Error('validateToken should not run for --url');
      },
      deviceLoginDeps: {
        startDeviceAuth: async (apiBaseUrl, body) => {
          started += 1;
          assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
          assert.equal(body?.clientName, 'BCTRL CLI');
          assert.equal(body?.clientKind, 'cli');
          return deviceSession();
        },
        pollDeviceAuth: async () => {
          throw new Error('pollDeviceAuth should not run for --url');
        },
      },
    });

    assert.equal(started, 1);
    assert.equal(io.stdout(), 'https://app.bctrl.ai/device?code=WDJB-MJHT\n');
    assert.equal(io.stderr(), '');
    assert.equal(await loadCredential(env), null);
    const pending = await readPendingDeviceAuth(env);
    assert.equal(pending?.apiBaseUrl, 'https://api.bctrl.ai/v1');
    assert.equal(pending?.deviceCode, 'dc_secret');
    assert.equal(
      pending?.verificationUriComplete,
      'https://app.bctrl.ai/device?code=WDJB-MJHT'
    );
  });
});

test('auth login --url --wait prints the URL, polls, and saves the approved CLI session', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    const pollResults = [
      { status: 'authorization_pending' as const },
      { status: 'complete' as const, token: 'device-minted-token' },
    ];
    const sleeps: number[] = [];

    await authLoginRun({
      io,
      env,
      url: true,
      wait: true,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
      validateToken: async (apiBaseUrl, token) => {
        assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
        assert.equal(token, 'device-minted-token');
        return storedWhoami;
      },
      deviceLoginDeps: {
        startDeviceAuth: async () => deviceSession(),
        pollDeviceAuth: async (_apiBaseUrl, deviceCode) => {
          assert.equal(deviceCode, 'dc_secret');
          const next = pollResults.shift();
          assert.ok(next);
          return next;
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        now: () => 1_000_000,
      },
    });

    assert.equal(io.stdout(), 'https://app.bctrl.ai/device?code=WDJB-MJHT\n');
    assert.deepEqual(sleeps, [5_000]);
    assert.match(io.stderr(), /Waiting for browser approval/);
    assert.match(io.stderr(), /Approved/);
    const stored = await loadCredential(env);
    assert.equal(stored?.token, 'device-minted-token');
    assert.equal(stored?.method, 'device');
    assert.equal(await readPendingDeviceAuth(env), null);
  });
});

test('auth login --url rejects token input options', async () => {
  const io = createMemoryIO();
  await assert.rejects(
    authLoginRun({
      io,
      url: true,
      withToken: true,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
    }),
    /Use --url without --with-token or --token-file/
  );
});

test('auth status reports unauthenticated state without validating a token', async () => {
  const io = createMemoryIO();
  await authStatusRun({
    io,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: null,
      storedAuth: null,
    }),
    validateToken: async () => {
      throw new Error(
        'validateToken should not be called without an active token'
      );
    },
  });

  assert.match(io.stdout(), /Authenticated: no/);
  assert.match(io.stdout(), /API: https:\/\/api\.bctrl\.ai\/v1/);
  assert.match(io.stdout(), /bctrl auth login/);
});

test('auth status clears stale stored credentials when the server rejects them', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env, 'revoked-device-key', 'device');
    const config = await loadConfig(env);
    const io = createMemoryIO();

    await assert.rejects(
      authStatusRun({
        io,
        env,
        config: async () => config,
        validateToken: async () => {
          throw new CliError('BCTRL auth validation failed: 401 Authentication required', {
            apiError: { status: 401, code: 'auth.invalid' },
          });
        },
      }),
      /BCTRL auth validation failed/
    );

    assert.equal(await loadCredential(env), null);
  });
});

test('API requests clear stale stored credentials when the server rejects them', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env, 'revoked-device-key', 'device');
    const config = await loadConfig(env);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Authentication required', code: 'auth.invalid' }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    try {
      await assert.rejects(createBctrlApiClient(config, env).get('/spaces'), /auth\.invalid/);
      assert.equal(await loadCredential(env), null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('auth status validates and prints a human active token context', async () => {
  const io = createMemoryIO();
  await authStatusRun({
    io,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: { token: 'stored-key', source: 'stored' },
      storedAuth: {
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        token: 'stored-key',
        whoami: storedWhoami,
        method: 'api-key',
        backend: 'keychain',
        createdAt: '2026-05-14T00:00:00.000Z',
        validatedAt: '2026-05-14T00:00:00.000Z',
      },
    }),
    validateToken: async (apiBaseUrl, token) => {
      assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
      assert.equal(token, 'stored-key');
      return storedWhoami;
    },
  });

  assert.match(io.stdout(), /Authenticated: yes/);
  assert.match(io.stdout(), /Email: user@example\.com/);
  assert.match(io.stdout(), /Scope: organization/);
  assert.match(io.stdout(), /Organization: org_test/);
  assert.match(
    io.stdout(),
    /Default space: 00000000-0000-4000-8000-000000000001/
  );
  assert.match(io.stdout(), /Plan: developer/);
  assert.match(io.stdout(), /Auth: saved API key/);
  assert.match(io.stdout(), /Store: OS keychain/);
  assert.match(io.stdout(), /API: https:\/\/api\.bctrl\.ai\/v1/);
});

test('auth status labels stored device credentials as a CLI session', async () => {
  const io = createMemoryIO();
  await authStatusRun({
    io,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: { token: 'stored-device-key', source: 'stored' },
      storedAuth: {
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        token: 'stored-device-key',
        whoami: storedWhoami,
        method: 'device',
        backend: 'file',
        createdAt: '2026-05-14T00:00:00.000Z',
        validatedAt: '2026-05-14T00:00:00.000Z',
      },
    }),
    validateToken: async () => storedWhoami,
  });

  assert.match(io.stdout(), /Auth: saved CLI session/);
});

test('auth status prints structured JSON when requested', async () => {
  const io = createMemoryIO();
  await authStatusRun({
    io,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: { token: 'stored-key', source: 'stored' },
      storedAuth: null,
    }),
    output: { json: true },
    validateToken: async () => storedWhoami,
  });

  assert.deepEqual(JSON.parse(io.stdout()), {
    authenticated: true,
    apiBaseUrl: 'https://api.bctrl.ai/v1',
    tokenSource: 'stored',
    ...storedWhoami,
  });
});

test('auth token prints active token when stdout is not a terminal', async () => {
  const io = createMemoryIO();
  await authTokenRun({
    io,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: { token: 'stored-key', source: 'stored' },
      storedAuth: null,
    }),
  });

  assert.equal(io.stdout(), 'stored-key\n');
});

test('auth token warns when revealing a keychain-stored secret', async () => {
  const io = createMemoryIO();
  io.isStdoutTTY = () => true;
  await authTokenRun({
    io,
    reveal: true,
    config: async () => ({
      apiBaseUrl: 'https://api.bctrl.ai/v1',
      activeToken: { token: 'stored-key', source: 'stored' },
      storedAuth: {
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        token: 'stored-key',
        whoami: storedWhoami,
        method: 'api-key',
        backend: 'keychain',
        createdAt: '2026-05-14T00:00:00.000Z',
        validatedAt: '2026-05-14T00:00:00.000Z',
      },
    }),
  });

  assert.equal(io.stdout(), 'stored-key\n');
  assert.match(io.stderr(), /revealing a credential stored in the OS keychain/);
});

test('auth token requires authentication', async () => {
  const io = createMemoryIO();
  await assert.rejects(
    authTokenRun({
      io,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
    }),
    AuthError
  );
});

test('auth token refuses to print to a terminal without --reveal', async () => {
  const io = createMemoryIO();
  io.isStdoutTTY = () => true;

  await assert.rejects(
    authTokenRun({
      io,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'stored-key', source: 'stored' },
        storedAuth: null,
      }),
    }),
    (error: unknown) =>
      error instanceof CliError && /without --reveal/.test(error.message)
  );
});

test('auth logout removes stored credentials', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env);

    const io = createMemoryIO();
    await authLogoutRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'stored-key', source: 'stored' },
        storedAuth: await loadCredential(env),
      }),
    });

    assert.equal(await loadCredential(env), null);
    assert.equal(await readStoredMetadata(env), null);
    assert.match(io.stderr(), /Removed stored BCTRL credentials/);
  });
});

test('auth logout revokes stored device credentials server-side', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env, 'device-key', 'device');
    const calls: Array<{ apiBaseUrl: string; token: string }> = [];

    const io = createMemoryIO();
    await authLogoutRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'device-key', source: 'stored' },
        storedAuth: await loadCredential(env),
      }),
      revokeDeviceSession: async (apiBaseUrl, token) => {
        calls.push({ apiBaseUrl, token });
        return { revoked: true };
      },
    });

    assert.deepEqual(calls, [
      { apiBaseUrl: 'https://api.bctrl.ai/v1', token: 'device-key' },
    ]);
    assert.equal(await loadCredential(env), null);
    assert.match(io.stderr(), /Revoked connected device session/);
    assert.match(io.stderr(), /Removed stored BCTRL credentials/);
  });
});

test('auth logout still clears local device credentials when server revoke fails', async () => {
  await withTempEnv(async (env) => {
    await saveTestCredential(env, 'device-key', 'device');

    const io = createMemoryIO();
    await authLogoutRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'device-key', source: 'stored' },
        storedAuth: await loadCredential(env),
      }),
      revokeDeviceSession: async () => {
        throw new Error('network down');
      },
    });

    assert.equal(await loadCredential(env), null);
    assert.match(
      io.stderr(),
      /could not revoke connected device session: network down/
    );
    assert.match(io.stderr(), /Removed stored BCTRL credentials/);
  });
});

test('auth logout warns when BCTRL_API_KEY still authenticates the shell', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    await authLogoutRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'env-key', source: 'BCTRL_API_KEY' },
        storedAuth: null,
      }),
    });

    assert.match(io.stderr(), /No stored BCTRL credentials found/);
    assert.match(io.stderr(), /BCTRL_API_KEY is still set/);
  });
});

// Helper: remove only the file-backend secret, leaving the metadata file, to
// simulate a keychain entry deleted out from under stale metadata.
async function clearSecretOnly(env: NodeJS.ProcessEnv): Promise<void> {
  const { createHash } = await import('node:crypto');
  const { rm: removeFile } = await import('node:fs/promises');
  const { join: joinPath, dirname } = await import('node:path');
  const account = 'https://api.bctrl.ai/v1';
  const hash = createHash('sha256').update(account).digest('hex').slice(0, 24);
  const dir = dirname(getMetadataFilePath(env));
  await removeFile(joinPath(dir, `bctrl-${hash}.secret`), { force: true });
}

function deviceSession() {
  return {
    deviceCode: 'dc_secret',
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://app.bctrl.ai/device',
    verificationUriComplete: 'https://app.bctrl.ai/device?code=WDJB-MJHT',
    expiresIn: 600,
    interval: 5,
  };
}

test('auth login completes an approved pending browser login', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    await savePendingDeviceAuth(
      'https://api.bctrl.ai/v1',
      deviceSession(),
      env,
      () => 1_000_000
    );

    await authLoginRun({
      io,
      env,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
      validateToken: async (apiBaseUrl, token) => {
        assert.equal(apiBaseUrl, 'https://api.bctrl.ai/v1');
        assert.equal(token, 'device-minted-token');
        return storedWhoami;
      },
      deviceLoginDeps: {
        pollDeviceAuth: async (_apiBaseUrl, deviceCode) => {
          assert.equal(deviceCode, 'dc_secret');
          return { status: 'complete', token: 'device-minted-token' };
        },
        now: () => 1_000_000,
      },
    });

    const stored = await loadCredential(env);
    assert.equal(stored?.token, 'device-minted-token');
    assert.equal(stored?.method, 'device');
    assert.match(io.stderr(), /Approved/);
    assert.equal(await readPendingDeviceAuth(env), null);
  });
});

test('auth login without a pending browser login explains how to start one', async () => {
  await withTempEnv(async (env) => {
    const io = createMemoryIO();
    await assert.rejects(
      authLoginRun({
        io,
        env,
        config: async () => ({
          apiBaseUrl: 'https://api.bctrl.ai/v1',
          activeToken: null,
          storedAuth: null,
        }),
      }),
      /bctrl auth login --url/
    );
    assert.equal(await loadCredential(env), null);
  });
});

test('auth login keeps an unapproved pending browser login and prints the same URL', async () => {
  await withTempEnv(async (env) => {
    await savePendingDeviceAuth(
      'https://api.bctrl.ai/v1',
      deviceSession(),
      env,
      () => 1_000_000
    );
    const io = createMemoryIO();

    await assert.rejects(
      authLoginRun({
        io,
        env,
        config: async () => ({
          apiBaseUrl: 'https://api.bctrl.ai/v1',
          activeToken: null,
          storedAuth: null,
        }),
        deviceLoginDeps: {
          pollDeviceAuth: async () => ({ status: 'authorization_pending' }),
          now: () => 1_000_000,
        },
      }),
      /https:\/\/app\.bctrl\.ai\/device\?code=WDJB-MJHT/
    );

    assert.equal(await loadCredential(env), null);
    assert.equal((await readPendingDeviceAuth(env))?.deviceCode, 'dc_secret');
  });
});

test('auth login --wait polls an existing pending browser login until approval', async () => {
  await withTempEnv(async (env) => {
    await savePendingDeviceAuth(
      'https://api.bctrl.ai/v1',
      deviceSession(),
      env,
      () => 1_000_000
    );
    const io = createMemoryIO();
    const pollResults = [
      { status: 'rate_limited' as const },
      { status: 'authorization_pending' as const },
      { status: 'complete' as const, token: 'device-minted-token' },
    ];

    await authLoginRun({
      io,
      env,
      wait: true,
      config: async () => ({
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: null,
        storedAuth: null,
      }),
      validateToken: async () => storedWhoami,
      deviceLoginDeps: {
        pollDeviceAuth: async () => {
          const next = pollResults.shift();
          assert.ok(next);
          return next;
        },
        sleep: async () => {},
        now: () => 1_000_000,
      },
    });

    assert.equal(pollResults.length, 0);
    assert.match(io.stderr(), /Approved/);
    assert.equal((await loadCredential(env))?.token, 'device-minted-token');
    assert.equal(await readPendingDeviceAuth(env), null);
  });
});
