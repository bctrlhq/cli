import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import { createOperationListCommand, createOperationViewCommand } from '../shared/operation.js';

export function createToolCallCommand(factory: Factory): Command {
  const command = new Command('tool-call').description('Inspect BCTRL tool calls');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'tool-calls.list',
      description: 'List tool calls',
      configure: (cmd) =>
        cmd
          .option('--space <id>', 'Space id')
          .option('--tool <id>', 'Filter by tool id')
          .option('--run <id>', 'Filter by run id')
          .option('--invocation <id>', 'Filter by invocation id')
          .option('--status <status>', 'Filter by status')
          .option('--actor <actor>', 'Filter by actor'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
          toolId: typeof options.tool === 'string' ? options.tool : undefined,
          runId: typeof options.run === 'string' ? options.run : undefined,
          invocationId: typeof options.invocation === 'string' ? options.invocation : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
          actor: typeof options.actor === 'string' ? options.actor : undefined,
        }) as CliOperationQuery<'tool-calls.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'tool-calls.get',
      name: 'get',
      description: 'View a tool call',
    })
  );
  return command;
}
