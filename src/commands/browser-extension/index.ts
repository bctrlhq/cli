import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { readBlob } from '../shared/io.js';
import { addOutputFlags, outputData, type OutputFlags } from '../shared/output.js';
import {
  actingSubaccountOption,
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  uploadOperationFile,
} from '../shared/operation.js';

export function createBrowserExtensionCommand(factory: Factory): Command {
  const command = new Command('browser-extension').description('Manage browser extensions');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'browser-extensions.list',
      description: 'List browser extensions',
      configure: (cmd) =>
        cmd
          .option('--subaccount-id <id>', 'Filter by subaccount id')
          .option('--q <text>', 'Search query')
          .option('--format <format>', 'Filter by format')
          .option('--source <source>', 'Filter by source'),
      query: (options) =>
        ({
          q: typeof options.q === 'string' ? options.q : undefined,
          format: typeof options.format === 'string' ? options.format : undefined,
          source: typeof options.source === 'string' ? options.source : undefined,
        }) as CliOperationQuery<'browser-extensions.list'>,
      actingSubaccountId: actingSubaccountOption(),
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'browser-extensions.get',
      name: 'get',
      description: 'Get a browser extension',
      argName: 'extensionId',
    })
  );
  command.addCommand(
    addOutputFlags(
      new Command('upload')
        .description('Upload a browser extension package')
        .argument('<path>')
        .option('--name <name>', 'Display name')
        .option('--subaccount-id <id>', 'Create under a subaccount when using a parent/org key')
    ).action(
      async (path: string, options: { name?: string; subaccountId?: string } & OutputFlags) => {
        const file = await readBlob(path);
        const result = await uploadOperationFile(factory, 'browser-extensions.upload', {
          file: file.blob,
          fileName: file.fileName,
          fields: {
            ...(options.name ? { name: options.name } : {}),
          },
          actingSubaccountId: options.subaccountId,
        });
        await outputData(factory.io, result, options);
      }
    )
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'browser-extensions.import',
      name: 'import',
      description: 'Import a browser extension from a URL',
      configure: (cmd) =>
        cmd
          .option('--url <url>', 'Extension URL')
          .option('--name <name>', 'Display name')
          .option('--subaccount-id <id>', 'Create under a subaccount when using a parent/org key'),
      body: async (_args, options) => {
        return {
          url: options.url,
          name: options.name,
        } as CliOperationJsonBody<'browser-extensions.import'>;
      },
      actingSubaccountId: (_args, options) => actingSubaccountOption()(options),
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'browser-extensions.update',
      name: 'patch',
      description: 'Update a browser extension',
      argNames: ['extensionId'],
      configure: (cmd) =>
        cmd
          .option('--name <name>', 'Display name'),
      body: async (_args, options) => {
        return { name: options.name } as CliOperationJsonBody<'browser-extensions.update'>;
      },
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'browser-extensions.delete',
      description: 'Delete a browser extension',
      argNames: ['extensionId'],
    })
  );
  return command;
}
