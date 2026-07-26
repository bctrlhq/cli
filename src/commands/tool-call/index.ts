import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import {
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
} from '../shared/operation.js';

export function createToolCallCommand(factory: Factory): Command {
  const command = new Command('tool-calls').description('Inspect BCTRL tool calls');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'tool-calls.list',
      description: 'List tool calls',
      configure: (cmd) =>
        cmd
          .option('--space <id>', 'Space id')
          .option('--tool <id>', 'Filter by tool id')
          .option('--run <id>', 'Filter by run id')
          .option('--status <status>', 'Filter by status')
          .option('--caller-type <type>', 'Filter by caller type'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
          toolId: typeof options.tool === 'string' ? options.tool : undefined,
          runId: typeof options.run === 'string' ? options.run : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
          callerType: typeof options.callerType === 'string' ? options.callerType : undefined,
        }) as CliOperationQuery<'tool-calls.list'>,
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'tool-calls.cancel',
      name: 'cancel',
      description: 'Cancel a tool call',
      argNames: ['toolCallId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'tool-calls.respond',
      name: 'respond',
      description: 'Respond to a tool input request',
      argNames: ['toolCallId'],
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'tool-calls.result',
      name: 'result',
      description: 'Wait for and return a tool call result',
      argName: 'toolCallId',
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
