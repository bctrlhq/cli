import { Command } from 'commander';
import type { Factory } from './factory.js';
import { createAuthCommand } from './commands/auth/index.js';
import { createVersionCommand } from './commands/version/version.js';
import { registerSecretConveniences } from './commands/secrets/index.js';
import { registerGeneratedCommands } from './commands/generated.js';
import { createMcpCommand } from './commands/mcp.js';

export function createRootCommand(factory: Factory): Command {
  const command = new Command('bctrl')
    .description('BCTRL command-line interface')
    .usage('<command> [flags]')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option('--no-color', 'Disable color output');
  command.addCommand(createVersionCommand(factory));
  command.addCommand(createAuthCommand(factory));
  command.addCommand(createMcpCommand(factory));
  registerGeneratedCommands(command, factory);
  registerSecretConveniences(command, factory);
  return command;
}
