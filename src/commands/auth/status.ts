import { Command } from 'commander';
import { validateAuthToken } from '../../api/auth.js';
import { isUnauthorizedApiError } from '../../api/errors.js';
import { clearCredential } from '../../config/auth-store.js';
import type { BctrlConfig } from '../../config/config.js';
import type { Factory } from '../../factory.js';
import type { IOStreams } from '../../io/streams.js';
import { addOutputFlags, outputData, type OutputFlags } from '../shared/output.js';

export type AuthStatusOptions = {
  io: IOStreams;
  config: () => Promise<BctrlConfig>;
  output?: OutputFlags;
  validateToken?: typeof validateAuthToken;
  env?: NodeJS.ProcessEnv;
};

export function createAuthStatusCommand(
  factory: Factory,
  run: (options: AuthStatusOptions) => Promise<void> = authStatusRun
): Command {
  return addOutputFlags(new Command('status')
    .description('Show BCTRL authentication status')
  )
    .action(async (options: OutputFlags) => {
      await run({
        io: factory.io,
        config: factory.config,
        output: options,
      });
    });
}

export async function authStatusRun(options: AuthStatusOptions): Promise<void> {
  const config = await options.config();
  if (!config.activeToken) {
    const status = {
      apiBaseUrl: config.apiBaseUrl,
      authenticated: false as const,
      tokenSource: null,
    };
    if (usesStructuredOutput(options.output)) {
      await outputData(options.io, status, options.output);
    } else {
      writeHumanAuthStatus(options.io, status);
    }
    return;
  }

  const validateToken = options.validateToken ?? validateAuthToken;
  let whoami: Awaited<ReturnType<typeof validateAuthToken>>;
  try {
    whoami = await validateToken(config.apiBaseUrl, config.activeToken.token);
  } catch (error) {
    if (config.activeToken.source === 'stored' && isUnauthorizedApiError(error)) {
      await clearCredential(options.env, config.apiBaseUrl);
    }
    throw error;
  }
  const status = {
    authenticated: true as const,
    apiBaseUrl: config.apiBaseUrl,
    tokenSource: config.activeToken.source,
    ...(config.storedAuth
      ? { backend: config.storedAuth.backend, method: config.storedAuth.method }
      : {}),
    ...whoami,
  };
  if (usesStructuredOutput(options.output)) {
    await outputData(options.io, status, options.output);
  } else {
    writeHumanAuthStatus(options.io, status);
  }
}

function usesStructuredOutput(output: OutputFlags | undefined): boolean {
  return Boolean(output?.json !== undefined || output?.jq || output?.template);
}

function writeHumanAuthStatus(
  io: IOStreams,
  status:
    | {
        apiBaseUrl: string;
        authenticated: false;
        tokenSource: null;
      }
    | {
        apiBaseUrl: string;
        authenticated: true;
        email?: string | null;
        plan: string;
        scope: string;
        organizationId: string;
        subaccountId: string | null;
        defaultSpaceId: string | null;
        tokenSource: string;
        method?: 'api-key' | 'device';
        backend?: 'keychain' | 'file';
      }
): void {
  if (!status.authenticated) {
    io.writeOut(
      [
        'Authenticated: no',
        `API: ${status.apiBaseUrl}`,
        '',
        'Run:',
        '  bctrl auth login',
        '',
      ].join('\n')
    );
    return;
  }

  io.writeOut(
    [
      'Authenticated: yes',
      `Email: ${status.email ?? '-'}`,
      `Scope: ${status.scope}`,
      `Organization: ${status.organizationId}`,
      ...(status.subaccountId ? [`Subaccount: ${status.subaccountId}`] : []),
      `Default space: ${status.defaultSpaceId ?? '-'}`,
      `Plan: ${status.plan}`,
      `Auth: ${formatTokenSource(status.tokenSource, status.method)}`,
      ...(status.backend
        ? [`Store: ${status.backend === 'keychain' ? 'OS keychain' : 'plaintext file (0600)'}`]
        : []),
      `API: ${status.apiBaseUrl}`,
      '',
    ].join('\n')
  );
}

function formatTokenSource(source: string, method?: 'api-key' | 'device'): string {
  if (source === 'BCTRL_API_KEY') return 'environment API key';
  if (source === 'stored') return method === 'device' ? 'saved CLI session' : 'saved API key';
  return source;
}
