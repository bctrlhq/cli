import { AuthError, CliError } from '../runtime/errors.js';
import type { BctrlConfig } from '../config/config.js';
import { clearCredential, loadCredential } from '../config/auth-store.js';
import { apiErrorFromResponse, isUnauthorizedApiError } from './errors.js';

export type BctrlApiClient = {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  patch: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  put: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
  download: (path: string, options?: JsonRequestOptions & { method?: HttpMethod }) => Promise<Uint8Array>;
  streamText: (path: string, options?: RequestOptions) => Promise<AsyncIterable<string>>;
  uploadFile: <T>(
    path: string,
    options: RequestOptions & { file: Blob; fileName: string; fields?: Record<string, string> }
  ) => Promise<T>;
};

export type RequestOptions = {
  query?: Record<string, string | number | boolean | (string | number | boolean)[] | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  idempotencyKey?: string;
  actingSubaccountId?: string;
  runtimeId?: string;
};

export type JsonRequestOptions = RequestOptions & {
  body?: unknown;
  rawBody?: FormData;
};

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

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
    download: (path, options) => requestBinary(config, env, options?.method ?? 'GET', path, options),
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
  let body: string | FormData | undefined = options?.rawBody;
  if (options && 'body' in options && options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(config.apiBaseUrl, path, options?.query), {
    method,
    headers,
    body,
    signal: options?.signal,
    redirect: 'error',
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
  options?: JsonRequestOptions
): Promise<Uint8Array> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const headers = requestHeaders(config.activeToken.token, options, 'application/octet-stream');
  const body = options?.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(buildUrl(config.apiBaseUrl, path, options?.query), {
    method,
    headers,
    body,
    signal: options?.signal,
    redirect: 'error',
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
    signal: options?.signal,
    redirect: 'error',
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
        await reader.cancel().catch(() => undefined);
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
    signal: options.signal,
    redirect: 'error',
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
    const current = await loadCredential(env, config.apiBaseUrl);
    if (current?.token === config.activeToken.token) await clearCredential(env, config.apiBaseUrl);
  }
  return error;
}

function requestHeaders(
  token: string,
  options?: RequestOptions,
  accept?: string
): Record<string, string> {
  for (const name of Object.keys(options?.headers ?? {})) {
    if (!['bctrl-version', 'bctrl-space', 'bctrl-subaccount-id', 'idempotency-key', 'last-event-id', 'if-match'].includes(name.toLowerCase())) {
      throw new CliError(`Unsupported API header: ${name}`);
    }
  }
  const headers = new Headers(options?.headers);
  if (!headers.has('BCTRL-Version')) headers.set('BCTRL-Version', '2026-10-03');
  if (accept) headers.set('accept', accept);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('user-agent', 'BCTRL CLI');
  if (options?.actingSubaccountId) headers.set('BCTRL-Subaccount-Id', options.actingSubaccountId);
  if (options?.runtimeId) headers.set('BCTRL-Runtime-Id', options.runtimeId);
  if (options?.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  return Object.fromEntries(headers);
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: RequestOptions['query']
): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') {
      // OpenAPI form parameters use repeated keys for array values (explode).
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }
  }
  return url.toString();
}
