import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import { parsePositiveInteger } from '../shared/options.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
} from '../shared/operation.js';

export function createToolCommand(factory: Factory): Command {
  const command = new Command('tool').description('Manage tools');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'tools.list',
      description: 'List tools',
      configure: (cmd) =>
        cmd
          .option('--space <id>', 'Filter by space id')
          .option(
            '-L, --limit <number>',
            'Maximum number of results to return',
            parsePositiveInteger
          )
          .option('--cursor <cursor>', 'Pagination cursor'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'tools.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'tools.get',
      name: 'get',
      description: 'Get a tool',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'tools.create',
      name: 'create',
      description: 'Create a tool',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'tools.update',
      name: 'patch',
      description: 'Update a tool',
      argNames: ['id'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'tools.test',
      name: 'test',
      description: 'Test a tool',
      argNames: ['id'],
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'tools.delete',
      description: 'Delete a tool',
    })
  );
  return command;
}
