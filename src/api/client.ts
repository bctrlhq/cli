import { AuthError, CliError } from "../runtime/errors.js";
import type { BctrlConfig } from "../config/config.js";
import { apiErrorFromResponse } from "./errors.js";

export type BctrlApiClient = {
  get: <T>(path: string, options?: RequestOptions) => Promise<T>;
  post: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  patch: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  put: <T>(path: string, options?: JsonRequestOptions) => Promise<T>;
  delete: <T>(path: string, options?: RequestOptions) => Promise<T>;
  download: (path: string, options?: RequestOptions) => Promise<Uint8Array>;
  streamText: (
    path: string,
    options?: RequestOptions,
  ) => Promise<AsyncIterable<string>>;
  uploadFile: <T>(
    path: string,
    options: RequestOptions & {
      file: Blob;
      fileName: string;
      fields?: Record<string, string>;
    },
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

export function createBctrlApiClient(config: BctrlConfig): BctrlApiClient {
  return {
    get: (path, options) => requestJson(config, "GET", path, options),
    post: (path, options) => requestJson(config, "POST", path, options),
    patch: (path, options) => requestJson(config, "PATCH", path, options),
    put: (path, options) => requestJson(config, "PUT", path, options),
    delete: (path, options) => requestJson(config, "DELETE", path, options),
    download: (path, options) => requestBinary(config, "GET", path, options),
    streamText: (path, options) => requestTextStream(config, path, options),
    uploadFile: (path, options) => uploadFile(config, path, options),
  };
}

async function requestJson<T>(
  config: BctrlConfig,
  method: string,
  path: string,
  options?: JsonRequestOptions,
): Promise<T> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${config.activeToken.token}`,
    "user-agent": "BCTRL CLI",
  };
  if (options?.idempotencyKey) {
    headers["idempotency-key"] = options.idempotencyKey;
  }
  if (options?.actingSubaccountId) {
    headers["BCTRL-Subaccount-Id"] = options.actingSubaccountId;
  }
  let body: string | undefined;
  if (options && "body" in options && options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(
    buildUrl(config.apiBaseUrl, path, options?.query),
    {
      method,
      headers,
      body,
    },
  );

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  if (response.status === 204) {
    return { ok: true } as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : { ok: true }) as T;
}

async function requestBinary(
  config: BctrlConfig,
  method: string,
  path: string,
  options?: RequestOptions,
): Promise<Uint8Array> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const response = await fetch(
    buildUrl(config.apiBaseUrl, path, options?.query),
    {
      method,
      headers: {
        authorization: `Bearer ${config.activeToken.token}`,
        "user-agent": "BCTRL CLI",
        ...(options?.actingSubaccountId
          ? { "BCTRL-Subaccount-Id": options.actingSubaccountId }
          : {}),
      },
    },
  );

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function requestTextStream(
  config: BctrlConfig,
  path: string,
  options?: RequestOptions,
): Promise<AsyncIterable<string>> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const response = await fetch(
    buildUrl(config.apiBaseUrl, path, options?.query),
    {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${config.activeToken.token}`,
        "user-agent": "BCTRL CLI",
        ...(options?.actingSubaccountId
          ? { "BCTRL-Subaccount-Id": options.actingSubaccountId }
          : {}),
      },
    },
  );

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  if (!response.body) {
    throw new CliError("BCTRL API response did not include a stream body");
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
  path: string,
  options: RequestOptions & {
    file: Blob;
    fileName: string;
    fields?: Record<string, string>;
  },
): Promise<T> {
  if (!config.activeToken) {
    throw new AuthError();
  }

  const form = new FormData();
  form.set("file", options.file, options.fileName);
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    form.set(key, value);
  }

  const response = await fetch(
    buildUrl(config.apiBaseUrl, path, options.query),
    {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.activeToken.token}`,
        "user-agent": "BCTRL CLI",
        ...(options.actingSubaccountId
          ? { "BCTRL-Subaccount-Id": options.actingSubaccountId }
          : {}),
      },
      body: form,
    },
  );

  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  return (await response.json()) as T;
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(`${baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
