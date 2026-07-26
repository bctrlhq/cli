import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
} from '../shared/operation.js';

export function createRuntimeCommand(factory: Factory): Command {
  const command = new Command('runtime').description('Manage runtime lifecycle');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runtimes.list',
      description: 'List runtimes',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runtimes.create',
      name: 'create',
      description: 'Create a runtime',
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'runtimes.get',
      name: 'get',
      description: 'Get a runtime',
      argName: 'runtimeId',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runtimes.update',
      name: 'patch',
      description: 'Update a runtime',
      argNames: ['runtimeId'],
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'runtimes.delete',
      description: 'Delete a runtime',
      argNames: ['runtimeId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runtimes.start',
      name: 'start',
      description: 'Start a runtime',
      argNames: ['runtimeId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runtimes.stop',
      name: 'stop',
      description: 'Stop a runtime',
      argNames: ['runtimeId'],
    })
  );
  return command;
}
