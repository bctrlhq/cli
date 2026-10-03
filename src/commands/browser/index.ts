import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { parseWaitSeconds } from '../shared/options.js';
import {
  createOperationDeleteCommand, createOperationJsonBodyCommand,
  createOperationListCommand, createOperationViewCommand,
} from '../shared/operation.js';

export function createBrowserCommand(factory: Factory): Command {
  const command = new Command('browser').description('Manage browser resources and their Runs');
  command.addCommand(createOperationListCommand(factory, {
    operationId: 'browsers.list', description: 'List browsers',
  }));
  command.addCommand(createOperationJsonBodyCommand(factory, {
    operationId: 'browsers.create', name: 'create', description: 'Create and start a browser',
  }));
  command.addCommand(createOperationViewCommand(factory, {
    operationId: 'browsers.get', name: 'get', description: 'Get a browser and its current Run', argName: 'browserId',
    configure: (cmd) => cmd.option('--wait <seconds>', 'Wait up to 60 seconds for a transition', parseWaitSeconds),
    query: (_id, options) => ({ wait: options.wait as number | undefined }),
  }));
  command.addCommand(createOperationJsonBodyCommand(factory, {
    operationId: 'browsers.update', name: 'patch', description: 'Update configuration for the next Run', argNames: ['browserId'],
  }));
  command.addCommand(createOperationDeleteCommand(factory, {
    operationId: 'browsers.delete', description: 'Delete a browser and its saved state', argNames: ['browserId'],
  }));
  command.addCommand(createOperationJsonBodyCommand(factory, {
    operationId: 'browsers.start', name: 'start', description: 'Start a browser with its saved state',
    argNames: ['browserId'], body: async () => ({}),
  }));
  command.addCommand(createOperationJsonBodyCommand(factory, {
    operationId: 'browsers.stop', name: 'stop', description: 'Stop the current Run and save browser state',
    argNames: ['browserId'],
    configure: (cmd) => cmd.option('--discard-state', 'Wipe saved state when stopping'),
    body: async (_args, options) => ({ ...(options.discardState === true ? { discardState: true } : {}) }),
  }));
  command.addCommand(createOperationListCommand(factory, {
    operationId: 'browsers.runs.list', name: 'runs', description: 'List this browser’s Run history', argNames: ['browserId'],
  }));
  command.addCommand(createOperationJsonBodyCommand(factory, {
    operationId: 'browsers.connections.revoke', name: 'revoke-connections',
    description: 'Revoke current Run connection URLs and issue new ones', argNames: ['browserId'], body: async () => ({}),
  }));
  return command;
}
