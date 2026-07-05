import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { getMetadataFilePath } from './paths.js';
import {
  deleteSecretAllBackends,
  resolveSecretStore,
  type SecretBackend,
} from './secret-store.js';

const StoredEffectiveScopeSchema = z
  .object({
    scope: z.enum(['organization', 'subaccount']),
    organizationId: z.string().min(1),
    subaccountId: z.string().min(1).nullable(),
    defaultSpaceId: z.string().min(1).nullable(),
  })
  .strict();

export const StoredWhoamiSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    scope: z.enum(['organization', 'subaccount']),
    organizationId: z.string().min(1),
    subaccountId: z.string().min(1).nullable(),
    defaultSpaceId: z.string().min(1).nullable(),
    effectiveScope: StoredEffectiveScopeSchema,
    keyId: z.string().min(1),
    plan: z.string().min(1),
  })
  .strict();

export type StoredWhoami = z.infer<typeof StoredWhoamiSchema>;

/** How the stored credential was obtained. `device` is reserved for the device-login flow. */
export const AuthMethodSchema = z.enum(['api-key', 'device']);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

/**
 * On-disk credential metadata. This file NEVER contains the secret — the token
 * lives in the OS keychain (or a separate 0600 secret file when keychain is
 * unavailable). See secret-store.ts.
 */
export const StoredAuthMetadataSchema = z
  .object({
    apiBaseUrl: z.string().url(),
    whoami: StoredWhoamiSchema,
    method: AuthMethodSchema,
    backend: z.enum(['keychain', 'file']),
    createdAt: z.string().datetime(),
    validatedAt: z.string().datetime(),
  })
  .strict();

export type StoredAuthMetadata = z.infer<typeof StoredAuthMetadataSchema>;

/** Metadata + the resolved secret, assembled in memory only. */
export type StoredCredential = StoredAuthMetadata & { token: string };

const AUTH_WRITE_MARKER_FILE_NAME = 'auth.write';
const AUTH_WRITE_WAIT_TIMEOUT_MS = 2000;
const AUTH_WRITE_WAIT_INTERVAL_MS = 100;
const AUTH_WRITE_STALE_MS = 30000;

export function normalizeApiBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export async function readStoredMetadata(
  env: NodeJS.ProcessEnv = process.env
): Promise<StoredAuthMetadata | null> {
  const path = getMetadataFilePath(env);
  try {
    const parsed = StoredAuthMetadataSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    // A schema mismatch means a legacy/corrupt metadata file (e.g. a pre-keychain
    // auth.json that embedded a token). Treat it as "logged out" rather than
    // throwing, so the CLI degrades to re-login instead of erroring on startup.
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isFileNotFound(error)) return null;
    if (error instanceof SyntaxError) return null;
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read BCTRL auth metadata at ${path}: ${reason}`);
  }
}

/**
 * Resolve the full stored credential (metadata + secret) for the given active
 * API base URL. Returns null when there is no metadata, when it is for a
 * different base URL, or when the secret is missing (e.g. the keychain entry was
 * deleted out from under a stale metadata file) — all of which mean "logged out".
 */
export async function loadCredential(
  env: NodeJS.ProcessEnv = process.env,
  activeApiBaseUrl?: string
): Promise<StoredCredential | null> {
  const meta = await readStoredMetadataAfterPendingWrite(env);
  if (!meta) return null;
  if (
    activeApiBaseUrl &&
    normalizeApiBaseUrl(meta.apiBaseUrl) !== normalizeApiBaseUrl(activeApiBaseUrl)
  ) {
    return null;
  }

  const { store } = resolveSecretStore(env);
  const token = await store.get(normalizeApiBaseUrl(meta.apiBaseUrl));
  if (!token) return null;
  return { ...meta, token };
}

export type SaveCredentialResult = {
  path: string;
  backend: SecretBackend;
  keychainFallback: boolean;
};

export async function saveCredential(
  input: {
    apiBaseUrl: string;
    token: string;
    whoami: StoredWhoami;
    method: AuthMethod;
    createdAt: string;
    validatedAt: string;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<SaveCredentialResult> {
  await markCredentialWriteStarted(env);
  const { store, keychainFallback } = resolveSecretStore(env);
  try {
    await store.set(normalizeApiBaseUrl(input.apiBaseUrl), input.token);

    const metadata: StoredAuthMetadata = {
      apiBaseUrl: input.apiBaseUrl,
      whoami: input.whoami,
      method: input.method,
      backend: store.backend,
      createdAt: input.createdAt,
      validatedAt: input.validatedAt,
    };

    const path = getMetadataFilePath(env);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

    return { path, backend: store.backend, keychainFallback };
  } finally {
    await clearCredentialWriteMarker(env);
  }
}

/**
 * Remove a stored credential. Deletes the secret from BOTH backends keyed by the
 * (normalized) API base URL — independent of whether the metadata file exists,
 * so a corrupt/missing metadata file can never orphan the secret — then removes
 * the metadata file. Returns whether anything was removed.
 */
export async function clearCredential(
  env: NodeJS.ProcessEnv = process.env,
  apiBaseUrl: string
): Promise<boolean> {
  const secretRemoved = await deleteSecretAllBackends(normalizeApiBaseUrl(apiBaseUrl), env);

  let metadataRemoved = false;
  try {
    await rm(getMetadataFilePath(env));
    metadataRemoved = true;
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }

  return secretRemoved || metadataRemoved;
}

function getAuthWriteMarkerPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(getMetadataFilePath(env)), AUTH_WRITE_MARKER_FILE_NAME);
}

async function markCredentialWriteStarted(env: NodeJS.ProcessEnv): Promise<void> {
  const path = getAuthWriteMarkerPath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, new Date().toISOString(), { mode: 0o600 });
}

async function clearCredentialWriteMarker(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await rm(getAuthWriteMarkerPath(env));
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }
}

async function readStoredMetadataAfterPendingWrite(
  env: NodeJS.ProcessEnv
): Promise<StoredAuthMetadata | null> {
  const startedAt = Date.now();
  for (;;) {
    const meta = await readStoredMetadata(env);
    if (meta) return meta;
    if (!(await isCredentialWriteInProgress(env)) || Date.now() - startedAt >= AUTH_WRITE_WAIT_TIMEOUT_MS) {
      return null;
    }
    await sleep(AUTH_WRITE_WAIT_INTERVAL_MS);
  }
}

async function isCredentialWriteInProgress(env: NodeJS.ProcessEnv): Promise<boolean> {
  try {
    const marker = await stat(getAuthWriteMarkerPath(env));
    return Date.now() - marker.mtimeMs < AUTH_WRITE_STALE_MS;
  } catch (error) {
    if (isFileNotFound(error)) return false;
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
