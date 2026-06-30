import { InvalidArgumentError } from 'commander';
import { createFactory } from '../factory.js';
import { createSystemIOStreams } from '../io/streams.js';
import { createRootCommand } from '../root.js';
import { CliError, errorMessage } from './errors.js';
import { ExitCode } from './exit-codes.js';

export async function main(argv: string[]): Promise<number> {
  const io = createSystemIOStreams();
  const factory = createFactory({ io });
  const root = createRootCommand(factory);

  try {
    await root.parseAsync(argv, { from: 'user' });
    return ExitCode.Ok;
  } catch (error) {
    if (error instanceof InvalidArgumentError) {
      io.writeErr(`${error.message}\n`);
      return ExitCode.Error;
    }
    if (error instanceof CliError) {
      io.writeErr(`${error.message}\n`);
      return error.exitCode;
    }
    io.writeErr(`${errorMessage(error)}\n`);
    return ExitCode.Error;
  }
}
