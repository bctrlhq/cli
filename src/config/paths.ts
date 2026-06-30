import envPaths from 'env-paths';
import { dirname, join } from 'node:path';

const DEFAULT_AUTH_FILE_NAME = 'auth.json';

/**
 * OS-native config directory for the CLI. Resolution precedence:
 *   1. `BCTRL_CONFIG_DIR` — explicit override (tests/dev).
 *   2. `XDG_CONFIG_HOME/bctrl` — honored on every platform for parity with the
 *      previous behavior and POSIX expectations.
 *   3. env-paths default (`%APPDATA%\bctrl` / `~/Library/Application Support/bctrl`
 *      / `~/.config/bctrl`). `suffix: ''` drops the `-nodejs` suffix.
 */
export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BCTRL_CONFIG_DIR?.trim();
  if (explicit) return explicit;

  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg) return join(xdg, 'bctrl');

  return envPaths('bctrl', { suffix: '' }).config;
}

/**
 * Path to the non-secret credential metadata file. `BCTRL_AUTH_FILE` overrides
 * the exact location (tests/dev escape hatch).
 */
export function getMetadataFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.BCTRL_AUTH_FILE?.trim();
  if (explicit) return explicit;
  return join(getConfigDir(env), DEFAULT_AUTH_FILE_NAME);
}

/** Directory for the plaintext-fallback secret files (alongside the metadata file). */
export function getSecretsDir(env: NodeJS.ProcessEnv = process.env): string {
  return dirname(getMetadataFilePath(env));
}
