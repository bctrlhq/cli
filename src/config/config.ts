import { z } from 'zod';
import { loadCredential, normalizeApiBaseUrl, type StoredCredential } from './auth-store.js';

const DEFAULT_API_BASE_URL = 'https://api.bctrl.ai/v1';

const EnvSchema = z.object({
  BCTRL_API_KEY: z.string().optional(),
  BCTRL_API_URL: z.string().url().optional(),
});

export type TokenSource = 'BCTRL_API_KEY' | 'stored' | 'none';

export type ActiveToken = {
  token: string;
  source: Exclude<TokenSource, 'none'>;
};

export type BctrlConfig = {
  apiBaseUrl: string;
  activeToken: ActiveToken | null;
  storedAuth: StoredCredential | null;
};

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<BctrlConfig> {
  const parsed = EnvSchema.parse(env);
  const apiBaseUrl = normalizeApiBaseUrl(parsed.BCTRL_API_URL ?? DEFAULT_API_BASE_URL);

  // Layer 1: ambient env override (CI/agents). Skips any keychain/file read.
  const apiKey = parsed.BCTRL_API_KEY?.trim();
  if (apiKey) {
    return {
      apiBaseUrl,
      activeToken: { token: apiKey, source: 'BCTRL_API_KEY' },
      storedAuth: null,
    };
  }

  // Layer 2: stored credential — metadata (file) + secret (keychain/file),
  // scoped to the active API base URL.
  const storedAuth = await loadCredential(env, apiBaseUrl);
  const activeToken: ActiveToken | null = storedAuth
    ? { token: storedAuth.token, source: 'stored' }
    : null;

  return { apiBaseUrl, activeToken, storedAuth };
}
