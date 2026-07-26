import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import {
  createOperationListCommand,
  createOperationViewCommand,
  streamOperationText,
} from '../shared/operation.js';

export function createRunCommand(factory: Factory): Command {
  const command = new Command('runs').description('Inspect unified run observability');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.list',
      description: 'List runs',
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'runs.get',
      name: 'get',
      description: 'Get a run',
      argName: 'runId',
    })
  );
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.trace.list',
      name: 'trace',
      description: 'List run trace spans',
      argNames: ['runId'],
    })
  );
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.events.list',
      name: 'events',
      description: 'List run events',
      argNames: ['runId'],
    })
  );
  command.addCommand(createRunStreamCommand(factory));
  return command;
}

function createRunStreamCommand(factory: Factory): Command {
  return new Command('stream')
    .description('Stream trace spans and events from a run')
    .argument('<runId>')
    .option('--after <cursor>', 'Resume after a stream cursor')
    .option('--include <kind>', 'trace or events')
    .action(async (runId: string, options: { after?: string; include?: string }) => {
      const stream = await streamOperationText(factory, 'runs.stream', {
        pathParams: { runId },
        query: { after: options.after, include: options.include as 'trace' | 'events' | undefined },
      });
      for await (const chunk of stream) factory.io.writeOut(chunk);
    });
}
