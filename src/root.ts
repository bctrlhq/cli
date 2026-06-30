import { Command } from 'commander';
import type { Factory } from './factory.js';
import { createAiCommand } from './commands/ai/index.js';
import { createApiKeyCommand } from './commands/api-key/index.js';
import { createAuthCommand } from './commands/auth/index.js';
import { createBrowserExtensionCommand } from './commands/browser-extension/index.js';
import { createFileCommand } from './commands/file/index.js';
import { createHelpCommand } from './commands/help/index.js';
import { createNotificationRecipientCommand } from './commands/notification-recipient/index.js';
import { createProxyCommand } from './commands/proxy/index.js';
import { createRunCommand } from './commands/run/index.js';
import { createRuntimeCommand } from './commands/runtime/index.js';
import { createSpaceCommand } from './commands/space/index.js';
import { createSubaccountCommand } from './commands/subaccount/index.js';
import { createToolCommand } from './commands/tool/index.js';
import { createToolCallCommand } from './commands/tool-call/index.js';
import { createToolsetCommand } from './commands/toolset/index.js';
import { createUsageCommand } from './commands/usage/index.js';
import { createVaultCommand } from './commands/vault/index.js';
import { createVersionCommand } from './commands/version/version.js';

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
  command.addCommand(createAiCommand(factory));
  command.addCommand(createApiKeyCommand(factory));
  command.addCommand(createBrowserExtensionCommand(factory));
  command.addCommand(createFileCommand(factory));
  command.addCommand(createHelpCommand(factory));
  command.addCommand(createNotificationRecipientCommand(factory));
  command.addCommand(createRunCommand(factory));
  command.addCommand(createRuntimeCommand(factory));
  command.addCommand(createProxyCommand(factory));
  command.addCommand(createSpaceCommand(factory));
  command.addCommand(createSubaccountCommand(factory));
  command.addCommand(createToolCommand(factory));
  command.addCommand(createToolsetCommand(factory));
  command.addCommand(createToolCallCommand(factory));
  command.addCommand(createUsageCommand(factory));
  command.addCommand(createVaultCommand(factory));

  return command;
}
