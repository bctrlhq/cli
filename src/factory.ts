import { createBctrlApiClient, type BctrlApiClient } from './api/client.js';
import { loadConfig, type BctrlConfig } from './config/config.js';
import type { IOStreams } from './io/streams.js';
import { CLI_VERSION } from './version.js';

export type Factory = {
  version: string;
  io: IOStreams;
  config: () => Promise<BctrlConfig>;
  apiClient: () => Promise<BctrlApiClient>;
};

type CreateFactoryOptions = {
  io: IOStreams;
  version?: string;
};

export function createFactory(options: CreateFactoryOptions): Factory {
  let configPromise: Promise<BctrlConfig> | undefined;

  const config = () => {
    configPromise ??= loadConfig();
    return configPromise;
  };

  return {
    version: options.version ?? CLI_VERSION,
    io: options.io,
    config,
    apiClient: async () => createBctrlApiClient(await config()),
  };
}
