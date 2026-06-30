import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import type { BctrlConfig } from '../../config/config.js';
import { saveCredential, type AuthMethod } from '../../config/auth-store.js';
import {
  clearPendingDeviceAuth,
  pendingExpired,
  pendingMatchesApiBaseUrl,
  readPendingDeviceAuth,
  savePendingDeviceAuth,
} from '../../config/pending-auth.js';
import type { Factory } from '../../factory.js';
import type { IOStreams } from '../../io/streams.js';
import { CliError } from '../../runtime/errors.js';
import { validateAuthToken } from '../../api/auth.js';
import {
  pollDeviceAuth as defaultPollDeviceAuth,
  startDeviceAuth as defaultStartDeviceAuth,
} from '../../api/device-auth.js';
import { startDeviceLoginSession } from './device-login.js';

export type AuthLoginDeviceDeps = {
  startDeviceAuth?: typeof defaultStartDeviceAuth;
  pollDeviceAuth?: typeof defaultPollDeviceAuth;
  now?: () => number;
};

export type AuthLoginOptions = {
  io: IOStreams;
  config: () => Promise<BctrlConfig>;
  withToken?: boolean;
  tokenFile?: string;
  url?: boolean;
  validateToken?: typeof validateAuthToken;
  env?: NodeJS.ProcessEnv;
  // Injection seam for tests: overrides device-auth API calls and the clock.
  deviceLoginDeps?: AuthLoginDeviceDeps;
};

type LoginResolution = {
  token: string;
  method: AuthMethod;
  source: 'env' | 'stdin' | 'file' | 'device';
};

export function createAuthLoginCommand(
  factory: Factory,
  run: (options: AuthLoginOptions) => Promise<void> = authLoginRun
): Command {
  return new Command('login')
    .description('Authenticate with BCTRL')
    .option(
      '--with-token',
      'Read an API key from standard input instead of using the browser device flow'
    )
    .option(
      '--token-file <path>',
      'Read an API key from a file instead of using the browser device flow'
    )
    .option('--url', 'Start a browser authorization, print the URL, and exit')
    .action(async (options: { withToken?: boolean; tokenFile?: string; url?: boolean }) => {
      await run({
        io: factory.io,
        config: factory.config,
        withToken: options.withToken,
        tokenFile: options.tokenFile,
        url: options.url,
      });
    });
}

export async function authLoginRun(options: AuthLoginOptions): Promise<void> {
  const config = await options.config();
  if (options.url) {
    await startPendingBrowserLogin(options, config);
    return;
  }

  const { token, method, source } = await resolveLogin(options, config);
  await persistResolvedLogin(options, config, { token, method, source });
}

async function startPendingBrowserLogin(
  options: AuthLoginOptions,
  config: BctrlConfig
): Promise<void> {
  if (options.withToken || options.tokenFile) {
    throw new CliError('Use --url by itself, without --with-token or --token-file.');
  }
  const session = await startDeviceLoginSession({
    apiBaseUrl: config.apiBaseUrl,
    startDeviceAuth: options.deviceLoginDeps?.startDeviceAuth,
  });
  await savePendingDeviceAuth(
    config.apiBaseUrl,
    session,
    options.env,
    options.deviceLoginDeps?.now
  );
  options.io.writeOut(`${session.verificationUriComplete}\n`);
}

async function persistResolvedLogin(
  options: AuthLoginOptions,
  config: BctrlConfig,
  resolution: LoginResolution
): Promise<void> {
  const validateToken = options.validateToken ?? validateAuthToken;
  const whoami = await validateToken(config.apiBaseUrl, resolution.token);
  const now = new Date().toISOString();
  const saved = await saveCredential(
    {
      apiBaseUrl: config.apiBaseUrl,
      token: resolution.token,
      whoami,
      method: resolution.method,
      createdAt: now,
      validatedAt: now,
    },
    options.env
  );

  if (resolution.source === 'env') {
    options.io.writeErr('Using BCTRL_API_KEY from environment.\n');
  }
  if (resolution.source === 'file') {
    options.io.writeErr('Using API key from token file.\n');
  }
  if (saved.keychainFallback) {
    options.io.writeErr(
      'Warning: OS keychain unavailable; storing credentials in a 0600 file.\n'
    );
  }
  options.io.writeErr(`Logged in to ${config.apiBaseUrl}\n`);
  options.io.writeErr(`Credentials saved to ${saved.path} (store: ${saved.backend})\n`);
  options.io.writeErr(`Scope: ${whoami.scope}\n`);
  options.io.writeErr(`Organization: ${whoami.organizationId}\n`);
  if (whoami.subaccountId) {
    options.io.writeErr(`Subaccount: ${whoami.subaccountId}\n`);
  }
  options.io.writeErr(`Default space: ${whoami.defaultSpaceId}\n`);
  if (config.activeToken?.source === 'BCTRL_API_KEY') {
    options.io.writeErr('BCTRL_API_KEY is set and will take precedence over stored credentials.\n');
  }
}

/**
 * Resolution order for `auth login`: explicit stdin token (`--with-token`) →
 * explicit token file (`--token-file`) → ambient `BCTRL_API_KEY` →
 * pending device authorization completion. A bare `auth login` never creates a
 * fresh browser URL; run `auth login --url` first, authorize it, then run
 * `auth login` to store the minted CLI session.
 */
async function resolveLogin(
  options: AuthLoginOptions,
  config: BctrlConfig
): Promise<LoginResolution> {
  if (options.withToken && options.tokenFile) {
    throw new CliError('Use either --with-token or --token-file, not both.');
  }

  if (options.withToken) {
    const token = (await readStreamText(options.io.in)).trim();
    if (!token) {
      throw new CliError('No API key provided on standard input.');
    }
    return { token, method: 'api-key', source: 'stdin' };
  }

  if (options.tokenFile) {
    const token = (await readFile(options.tokenFile, 'utf8')).trim();
    if (!token) {
      throw new CliError(`No API key found in ${options.tokenFile}.`);
    }
    return { token, method: 'api-key', source: 'file' };
  }

  if (config.activeToken?.source === 'BCTRL_API_KEY') {
    return { token: config.activeToken.token, method: 'api-key', source: 'env' };
  }

  const token = await completePendingDeviceLogin(options, config);
  return { token, method: 'device', source: 'device' };
}

async function completePendingDeviceLogin(
  options: AuthLoginOptions,
  config: BctrlConfig
): Promise<string> {
  const now = options.deviceLoginDeps?.now ?? Date.now;
  const pending = await readPendingDeviceAuth(options.env);
  if (!pending || !pendingMatchesApiBaseUrl(pending, config.apiBaseUrl)) {
    throw new CliError(
      'No pending browser login found.\n\n' +
        'Start one with:\n' +
        '  bctrl auth login --url\n\n' +
        'Then approve the URL and run:\n' +
        '  bctrl auth login\n\n' +
        'Or store an API key directly with:\n' +
        '  bctrl auth login --with-token\n' +
        '  bctrl auth login --token-file <path>'
    );
  }

  if (pendingExpired(pending, now)) {
    await clearPendingDeviceAuth(options.env);
    throw new CliError(
      'The pending browser login expired.\n\n' +
        'Start a new one with:\n' +
        '  bctrl auth login --url'
    );
  }

  const poll = options.deviceLoginDeps?.pollDeviceAuth ?? defaultPollDeviceAuth;
  const result = await poll(config.apiBaseUrl, pending.deviceCode);
  switch (result.status) {
    case 'complete':
      await clearPendingDeviceAuth(options.env);
      options.io.writeErr('Approved.\n');
      return result.token;
    case 'access_denied':
      await clearPendingDeviceAuth(options.env);
      throw new CliError('The pending browser login was denied.');
    case 'expired_token':
      await clearPendingDeviceAuth(options.env);
      throw new CliError(
        'The pending browser login expired.\n\n' +
          'Start a new one with:\n' +
          '  bctrl auth login --url'
      );
    case 'rate_limited':
    case 'authorization_pending':
      throw new CliError(
        'Pending browser login is not approved yet.\n\n' +
          'Open and approve this URL:\n' +
          `  ${pending.verificationUriComplete}\n\n` +
          'Then run:\n' +
          '  bctrl auth login'
      );
  }
}

async function readStreamText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}
