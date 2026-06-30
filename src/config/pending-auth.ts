import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import type { DeviceStartResponse } from '../api/device-auth.js';
import { normalizeApiBaseUrl } from './auth-store.js';
import { getMetadataFilePath } from './paths.js';

const PENDING_AUTH_FILE_NAME = 'pending-auth.json';

export const PendingDeviceAuthSchema = z
  .object({
    apiBaseUrl: z.string().url(),
    deviceCode: z.string().min(1),
    userCode: z.string().min(1),
    verificationUri: z.string().min(1),
    verificationUriComplete: z.string().min(1),
    interval: z.number().int().positive(),
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type PendingDeviceAuth = z.infer<typeof PendingDeviceAuthSchema>;

export function getPendingAuthFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(getMetadataFilePath(env)), PENDING_AUTH_FILE_NAME);
}

export async function savePendingDeviceAuth(
  apiBaseUrl: string,
  session: DeviceStartResponse,
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now
): Promise<PendingDeviceAuth> {
  const createdAtMs = now();
  const pending: PendingDeviceAuth = {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrl),
    deviceCode: session.deviceCode,
    userCode: session.userCode,
    verificationUri: session.verificationUri,
    verificationUriComplete: session.verificationUriComplete,
    interval: session.interval,
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(createdAtMs + session.expiresIn * 1000).toISOString(),
  };

  const path = getPendingAuthFilePath(env);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(pending, null, 2)}\n`, { mode: 0o600 });
  return pending;
}

export async function readPendingDeviceAuth(
  env: NodeJS.ProcessEnv = process.env
): Promise<PendingDeviceAuth | null> {
  const path = getPendingAuthFilePath(env);
  try {
    const parsed = PendingDeviceAuthSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (isFileNotFound(error) || error instanceof SyntaxError) return null;
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read pending BCTRL login at ${path}: ${reason}`);
  }
}

export async function clearPendingDeviceAuth(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  try {
    await rm(getPendingAuthFilePath(env));
  } catch (error) {
    if (!isFileNotFound(error)) throw error;
  }
}

export function pendingMatchesApiBaseUrl(pending: PendingDeviceAuth, apiBaseUrl: string): boolean {
  return normalizeApiBaseUrl(pending.apiBaseUrl) === normalizeApiBaseUrl(apiBaseUrl);
}

export function pendingExpired(
  pending: PendingDeviceAuth,
  now: () => number = Date.now
): boolean {
  return Date.parse(pending.expiresAt) <= now();
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
