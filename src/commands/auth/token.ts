import { Command } from 'commander';
import type { BctrlConfig } from '../../config/config.js';
import type { Factory } from '../../factory.js';
import type { IOStreams } from '../../io/streams.js';
import { AuthError, CliError } from '../../runtime/errors.js';

export type AuthTokenOptions = {
  io: IOStreams;
  config: () => Promise<BctrlConfig>;
  reveal?: boolean;
};

export function createAuthTokenCommand(
  factory: Factory,
  run: (options: AuthTokenOptions) => Promise<void> = authTokenRun
): Command {
  return new Command('token')
    .description('Print the active BCTRL API key')
    .option('--reveal', 'Allow printing the API key to a terminal')
    .action(async (options: { reveal?: boolean }) => {
      await run({
        io: factory.io,
        config: factory.config,
        reveal: options.reveal,
      });
    });
}

export async function authTokenRun(options: AuthTokenOptions): Promise<void> {
  const config = await options.config();
  if (!config.activeToken) {
    throw new AuthError();
  }
  if (options.io.isStdoutTTY() && options.reveal !== true) {
    throw new CliError('Refusing to print API key to a terminal without --reveal');
  }

  // `auth token` is a human/debug command — never wire it into agent/MCP flows
  // (it re-introduces the secret into a captured context). Warn loudly when it
  // exfiltrates a secret out of the OS keychain.
  if (options.reveal === true && config.storedAuth?.backend === 'keychain') {
    options.io.writeErr('Warning: revealing a credential stored in the OS keychain.\n');
  }

  options.io.writeOut(`${config.activeToken.token}\n`);
}
