import { Entry } from '@napi-rs/keyring';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getSecretsDir } from './paths.js';

// One keychain "service"; the per-credential "account" is the normalized API
// base URL (see normalizeApiBaseUrl in auth-store), so credentials for prod and
// a local/dev stack coexist and never collide.
const KEYRING_SERVICE = 'bctrl';

export type SecretBackend = 'keychain' | 'file';

export interface SecretStore {
  readonly backend: SecretBackend;
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<boolean>;
}

class KeychainSecretStore implements SecretStore {
  readonly backend = 'keychain' as const;

  private entry(account: string): Entry {
    return new Entry(KEYRING_SERVICE, account);
  }

  async get(account: string): Promise<string | null> {
    // Sync getPassword returns null when there is no entry (it does not throw).
    return this.entry(account).getPassword() ?? null;
  }

  async set(account: string, secret: string): Promise<void> {
    this.entry(account).setPassword(secret);
  }

  async delete(account: string): Promise<boolean> {
    try {
      this.entry(account).deletePassword();
      return true;
    } catch {
      return false; // NoEntry — nothing to delete
    }
  }
}

class FileSecretStore implements SecretStore {
  readonly backend = 'file' as const;

  constructor(private readonly dir: string) {}

  private fileFor(account: string): string {
    const hash = createHash('sha256').update(account).digest('hex').slice(0, 24);
    return join(this.dir, `bctrl-${hash}.secret`);
  }

  async get(account: string): Promise<string | null> {
    try {
      const text = (await readFile(this.fileFor(account), 'utf8')).trim();
      return text.length > 0 ? text : null;
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw error;
    }
  }

  async set(account: string, secret: string): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const file = this.fileFor(account);
    await writeFile(file, `${secret}\n`, { mode: 0o600 });
    await chmod(file, 0o600).catch(() => {});
  }

  async delete(account: string): Promise<boolean> {
    try {
      await rm(this.fileFor(account));
      return true;
    } catch (error) {
      if (isFileNotFound(error)) return false;
      throw error;
    }
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

let keychainProbe: boolean | undefined;

function keychainAvailable(): boolean {
  if (keychainProbe !== undefined) return keychainProbe;
  try {
    // A read against a probe account succeeds (returns null) when a keychain
    // backend exists, and throws when none is available (headless Linux/CI).
    new Entry(KEYRING_SERVICE, 'bctrl-availability-probe').getPassword();
    keychainProbe = true;
  } catch {
    keychainProbe = false;
  }
  return keychainProbe;
}

export type ResolvedSecretStore = {
  store: SecretStore;
  /** True when the OS keychain was wanted but is unavailable, so a 0600 file is used. */
  keychainFallback: boolean;
};

/**
 * Pick the secret backend. `BCTRL_SECRET_STORE=file` forces the file store
 * (tests/dev/CI). Otherwise the OS keychain is used when available, falling back
 * — loudly, at the call site — to a 0600 file when it is not.
 */
export function resolveSecretStore(env: NodeJS.ProcessEnv = process.env): ResolvedSecretStore {
  const forced = env.BCTRL_SECRET_STORE?.trim();
  if (forced === 'file') {
    return { store: new FileSecretStore(getSecretsDir(env)), keychainFallback: false };
  }
  if (keychainAvailable()) {
    return { store: new KeychainSecretStore(), keychainFallback: false };
  }
  return { store: new FileSecretStore(getSecretsDir(env)), keychainFallback: true };
}

/**
 * Delete a secret from BOTH backends, best-effort, so logout cannot orphan a
 * secret regardless of which backend stored it (or whether the metadata file
 * still exists). Skips the OS keychain entirely when `BCTRL_SECRET_STORE=file`.
 */
export async function deleteSecretAllBackends(
  account: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<boolean> {
  let removed = false;
  if (await new FileSecretStore(getSecretsDir(env)).delete(account)) {
    removed = true;
  }
  if (env.BCTRL_SECRET_STORE?.trim() !== 'file' && keychainAvailable()) {
    if (await new KeychainSecretStore().delete(account)) {
      removed = true;
    }
  }
  return removed;
}
