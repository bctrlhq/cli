import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { createOperationListCommand } from '../shared/operation.js';

export function createAgentCommand(factory: Factory): Command {
  const command = new Command('agents').description('Discover available agents');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'agents.list',
      description: 'List agents',
    })
  );
  return command;
}
