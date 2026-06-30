import type { BctrlApiClient } from '../../src/api/client.js';
import type { BctrlConfig } from '../../src/config/config.js';
import type { Factory } from '../../src/factory.js';
import type { MemoryIO } from './io.js';

export type ApiCall = {
  method: keyof BctrlApiClient;
  path: string;
  options?: unknown;
};

export function createMockApiClient(calls: ApiCall[], response: unknown = { ok: true }): BctrlApiClient {
  const record = async <T>(method: keyof BctrlApiClient, path: string, options?: unknown): Promise<T> => {
    calls.push({ method, path, options });
    return response as T;
  };

  return {
    get: (path, options) => record('get', path, options),
    post: (path, options) => record('post', path, options),
    patch: (path, options) => record('patch', path, options),
    put: (path, options) => record('put', path, options),
    delete: (path, options) => record('delete', path, options),
    download: async (path, options) => {
      calls.push({ method: 'download', path, options });
      return new Uint8Array();
    },
    streamText: async (path, options) => {
      calls.push({ method: 'streamText', path, options });
      return {
        async *[Symbol.asyncIterator]() {
          // Empty stream for command tests that only assert request wiring.
        },
      };
    },
    uploadFile: (path, options) => record('uploadFile', path, options),
  };
}

export function createTestFactory(input: {
  io: MemoryIO;
  apiClient?: BctrlApiClient;
  config?: BctrlConfig;
}): Factory {
  return {
    version: '0.0.0-test',
    io: input.io,
    config: async () =>
      input.config ?? {
        apiBaseUrl: 'https://api.bctrl.ai/v1',
        activeToken: { token: 'test-key', source: 'BCTRL_API_KEY' },
        storedAuth: null,
      },
    apiClient: async () => input.apiClient ?? createMockApiClient([]),
  };
}
