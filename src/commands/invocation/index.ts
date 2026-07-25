import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  buildOperationInput,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

/** Direct lookup is top-level because the invocation id is globally stable. */
export function createInvocationCommand(factory: Factory): Command {
  const command = new Command('invocation').description('Inspect invocations by id');
  command.addCommand(
    addOutputFlags(
      new Command('get')
      .description('Get an invocation')
      .argument('<invocationId>')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
    ).action(
      async (invocationId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'invocations.get',
          await buildOperationInput('invocations.get', options, {
            pathParams: { invocationId },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  return command;
}
