import { Command } from 'commander';
import type { Factory } from './factory.js';
import { createAuthCommand } from './commands/auth/index.js';
import { createVersionCommand } from './commands/version/version.js';
import { registerApiCommands } from './commands/generated.js';

export function createRootCommand(factory: Factory): Command {
  const command = new Command();

  command
    .name('bctrl')
    .description('BCTRL command-line interface')
    .usage('<command> [flags]')
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option('--no-color', 'Disable color output');

  command.addCommand(createVersionCommand(factory));
  command.addCommand(createAuthCommand(factory));
  registerApiCommands(command, factory);

  return command;
}
