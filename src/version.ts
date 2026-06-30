import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manifest = require('../package.json') as { version?: string };

export const CLI_VERSION = manifest.version ?? '0.0.0';
