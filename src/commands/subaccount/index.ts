import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { readJsonFile } from '../shared/io.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  addPaginationFlags,
  buildOperationInput,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

export function createSubaccountCommand(factory: Factory): Command {
  const command = new Command('subaccount').description('Manage subaccounts');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'subaccounts.list',
      description: 'List subaccounts',
      query: (options) =>
        ({
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
          include: options.includeUsage === true ? 'usage' : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
          externalId: typeof options.externalId === 'string' ? options.externalId : undefined,
          query: typeof options.query === 'string' ? options.query : undefined,
        }) as CliOperationQuery<'subaccounts.list'>,
      configure: (cmd) =>
        addPaginationFlags(cmd)
          .option('--include-usage', 'Inline current usage')
          .option('--status <status>', 'Filter by status')
          .option('--external-id <id>', 'Filter by external id')
          .option('--query <text>', 'Search by id, name, or external id'),
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'subaccounts.get',
      name: 'get',
      description: 'Get a subaccount',
      argName: 'subaccountId',
      configure: (cmd) =>
        cmd.option('--include <value>', 'Include related data, for example usage'),
      query: (_id, options) =>
        ({
          include: typeof options.include === 'string' ? options.include : undefined,
        }) as CliOperationQuery<'subaccounts.get'>,
    })
  );
  command.addCommand(createSubaccountWriteCommand(factory, 'create', 'subaccounts.create'));
  command.addCommand(
    createSubaccountWriteCommand(factory, 'patch', 'subaccounts.update', ['subaccountId'])
  );
  command.addCommand(
    addOutputFlags(
      new Command('archive')
        .description('Archive a subaccount')
        .argument('<subaccountId>')
        .requiredOption('-y, --yes', 'Confirm archive')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(async (subaccountId: string, options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'subaccounts.archive',
        await buildOperationInput('subaccounts.archive', options, {
          pathParams: { subaccountId },
          output: outputFlags(options),
        })
      );
    })
  );
  command.addCommand(createSubaccountUsageCommand(factory));
  return command;
}

function createSubaccountWriteCommand(
  factory: Factory,
  name: 'create' | 'patch',
  operationId: 'subaccounts.create' | 'subaccounts.update',
  argNames: string[] = []
): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId,
    name,
    description: name === 'create' ? 'Create a subaccount' : 'Update a subaccount',
    argNames,
    configure: (cmd) =>
      cmd
        .option('--name <name>', 'Subaccount name')
        .option('--external-id <id>', 'External id')
        .option('--metadata-file <path>', 'Metadata JSON file'),
    body: async (_args, options) => {
      return {
        name: options.name,
        externalId: options.externalId,
        metadata:
          typeof options.metadataFile === 'string'
            ? await readJsonFile(options.metadataFile, '--metadata-file')
            : undefined,
      } as CliOperationJsonBody<typeof operationId>;
    },
  });
}

function createSubaccountUsageCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('usage')
      .description('Show subaccount usage')
      .argument('[id]')
      .option(
        '-L, --limit <number>',
        'Maximum number of usage records to return',
        parsePositiveInteger
      )
      .option('--cursor <cursor>', 'Pagination cursor')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (
      id: string | undefined,
      options: { limit?: number; cursor?: string; params?: string } & OutputFlags
    ) => {
      if (id) {
        await requestOperationAndPrint(
          factory,
          'subaccounts.get',
          await buildOperationInput('subaccounts.get', options, {
            pathParams: { subaccountId: id },
            query: { include: ['usage'] },
            output: outputFlags(options),
          })
        );
        return;
      }
      await requestOperationAndPrint(
        factory,
        'subaccounts.usage.list',
        await buildOperationInput('subaccounts.usage.list', options, {
          query: { limit: options.limit, cursor: options.cursor },
          output: outputFlags(options),
        })
      );
    }
  );
}
