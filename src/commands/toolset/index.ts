import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
} from '../shared/operation.js';

export function createToolsetCommand(factory: Factory): Command {
  const command = new Command('toolset').description('Manage BCTRL toolsets');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'toolsets.list',
      description: 'List toolsets',
      configure: (cmd) => cmd.option('--space <id>', 'Filter by space id'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
        }) as CliOperationQuery<'toolsets.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'toolsets.get',
      name: 'get',
      description: 'View a toolset',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'toolsets.create',
      name: 'create',
      description: 'Create a toolset',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'toolsets.update',
      name: 'patch',
      description: 'Edit a toolset',
      argNames: ['id'],
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'toolsets.delete',
      description: 'Delete a toolset',
    })
  );
  return command;
}
