#!/usr/bin/env node

import { main } from '../runtime/main.js';

const argv = process.argv.slice(2);
if (argv[0] === '--') argv.shift();

process.exitCode = await main(argv);
