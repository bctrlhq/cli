import { Command } from 'commander';
import { revokeDeviceSession } from '../../api/device-auth.js';
import { clearCredential } from '../../config/auth-store.js';
import type { BctrlConfig } from '../../config/config.js';
import type { Factory } from '../../factory.js';
import type { IOStreams } from '../../io/streams.js';

export type AuthLogoutOptions = {
  io: IOStreams;
  config: () => Promise<BctrlConfig>;
  env?: NodeJS.ProcessEnv;
  revokeDeviceSession?: typeof revokeDeviceSession;
};

export function createAuthLogoutCommand(
  factory: Factory,
  run: (options: AuthLogoutOptions) => Promise<void> = authLogoutRun
): Command {
  return new Command('logout').description('Remove stored BCTRL credentials').action(async () => {
    await run({
      io: factory.io,
      config: factory.config,
    });
  });
}

export async function authLogoutRun(options: AuthLogoutOptions): Promise<void> {
  const config = await options.config();
  const revokeStoredDeviceSession = options.revokeDeviceSession ?? revokeDeviceSession;

  if (config.storedAuth?.method === 'device') {
    try {
      const result = await revokeStoredDeviceSession(config.apiBaseUrl, config.storedAuth.token);
      if (result.revoked) {
        options.io.writeErr('Revoked connected device session.\n');
      } else {
        options.io.writeErr('Connected device session was already revoked or not found.\n');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.io.writeErr(`Warning: could not revoke connected device session: ${message}\n`);
    }
  }

  const removed = await clearCredential(options.env, config.apiBaseUrl);
  if (removed) {
    options.io.writeErr('Removed stored BCTRL credentials.\n');
  } else {
    options.io.writeErr('No stored BCTRL credentials found.\n');
  }

  if (config.activeToken?.source === 'BCTRL_API_KEY') {
    options.io.writeErr('BCTRL_API_KEY is still set and will continue to authenticate this shell.\n');
  }
}
