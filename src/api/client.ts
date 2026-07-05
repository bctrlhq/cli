import { AuthError, CliError } from '../runtime/errors.js';
import type { BctrlConfig } from '../config/config.js';
import { clearCredential } from '../config/auth-store.js';
import { apiErrorFromResponse, isUnauthorizedApiError } from './errors.js';

export type BctrlApiClient = {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  patch: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  put: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
  download: (path: string, options?: RequestOptions) => Promise<Uint8Array>;
  streamText: (path: string, options?: RequestOptions) => Promise<AsyncIterable<string>>;
  uploadFile: <T>(
    path: string,
    options: RequestOptions & { file: Blob; fileName: string; fields?: Record<string, string> }
  ) => Promise<T>;
};

export type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>;
  idempotencyKey?: string;
  actingSubaccountId?: string;
};

export type JsonRequestOptions = RequestOptions & {
  body?: unknown;
};

export function createBctrlApiClient(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv = process.env
): BctrlApiClient {
  return {
    get: (path, options) => requestJson(config, env, 'GET', path, options),
    post: (path, options) => requestJson(config, env, 'POST', path, options),
    patch: (path, options) => requestJson(config, env, 'PATCH', path, options),
    put: (path, options) => requestJson(config, env, 'PUT', path, options),
    delete: (path, options) => requestJson(config, env, 'DELETE', path, options),
    download: (path, options) => requestBinary(config, env, 'GET', path, options),
    streamText: (path, options) => requestTextStream(config, env, path, options),
    uploadFile: (path, options) => uploadFile(config, env, path, options),
  };
}

async function requestJson<T>(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv,
  method: string,
  path: string,
  options?: JsonRequestOptions
): Promise<T> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const headers = requestHeaders(config.activeToken.token, options, 'application/json');
  if (options?.idempotencyKey) {
    headers['idempotency-key'] = options.idempotencyKey;
  }
  let body: string | undefined;
  if (options && 'body' in options && options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(config.apiBaseUrl, path, options?.query), {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    throw await reconcileStoredCredentialAuthError(config, env, await apiErrorFromResponse(response));
  }

  if (response.status === 204) {
    return { ok: true } as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : { ok: true }) as T;
}

async function requestBinary(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv,
  method: string,
  path: string,
  options?: RequestOptions
): Promise<Uint8Array> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const response = await fetch(buildUrl(config.apiBaseUrl, path, options?.query), {
    method,
    headers: requestHeaders(config.activeToken.token, options),
  });

  if (!response.ok) {
    throw await reconcileStoredCredentialAuthError(config, env, await apiErrorFromResponse(response));
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function requestTextStream(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv,
  path: string,
  options?: RequestOptions
): Promise<AsyncIterable<string>> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const response = await fetch(buildUrl(config.apiBaseUrl, path, options?.query), {
    method: 'GET',
    headers: requestHeaders(config.activeToken.token, options, 'text/event-stream'),
  });

  if (!response.ok) {
    throw await reconcileStoredCredentialAuthError(config, env, await apiErrorFromResponse(response));
  }
  if (!response.body) {
    throw new CliError('BCTRL API response did not include a stream body');
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  return {
    async *[Symbol.asyncIterator]() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) yield decoder.decode(value, { stream: true });
        }
        const rest = decoder.decode();
        if (rest) yield rest;
      } finally {
        reader.releaseLock();
      }
    },
  };
}

async function uploadFile<T>(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv,
  path: string,
  options: RequestOptions & { file: Blob; fileName: string; fields?: Record<string, string> }
): Promise<T> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const form = new FormData();
  form.set('file', options.file, options.fileName);
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.set(key, value);
  }

  const response = await fetch(buildUrl(config.apiBaseUrl, path, options.query), {
    method: 'POST',
    headers: requestHeaders(config.activeToken.token, options, 'application/json'),
    body: form,
  });

  if (!response.ok) {
    throw await reconcileStoredCredentialAuthError(config, env, await apiErrorFromResponse(response));
  }

  return (await response.json()) as T;
}

async function reconcileStoredCredentialAuthError(
  config: BctrlConfig,
  env: NodeJS.ProcessEnv,
  error: CliError
): Promise<CliError> {
  if (config.activeToken?.source === 'stored' && isUnauthorizedApiError(error)) {
    await clearCredential(env, config.apiBaseUrl);
  }
  return error;
}

function requestHeaders(
  token: string,
  options?: RequestOptions,
  accept?: string
): Record<string, string> {
  return {
    ...(accept ? { accept } : {}),
    authorization: `Bearer ${token}`,
    'user-agent': 'BCTRL CLI',
    ...(options?.actingSubaccountId ? { 'BCTRL-Subaccount-Id': options.actingSubaccountId } : {}),
  };
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
