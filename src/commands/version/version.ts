import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { IOStreams } from '../../io/streams.js';

export type VersionOptions = {
  io: IOStreams;
  version: string;
};

export function createVersionCommand(
  factory: Factory,
  run: (options: VersionOptions) => void = versionRun
): Command {
  return new Command('version')
    .description('Show bctrl version')
    .action(() => {
      run({
        io: factory.io,
        version: factory.version,
      });
    });
}

export function versionRun(options: VersionOptions): void {
  options.io.writeOut(`bctrl version ${options.version}\n`);
}
