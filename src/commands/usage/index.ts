import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import { buildOperationInput, outputFlags, requestOperationAndPrint } from '../shared/operation.js';

export function createUsageCommand(factory: Factory): Command {
  const command = addOutputFlags(new Command('usage').description('Get organization usage'));
  command
    .option(
      '--params <json>',
      'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
    )
    .action(async (options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'usage.get',
        await buildOperationInput('usage.get', options, { output: outputFlags(options) })
      );
    });
  command.addCommand(
    addOutputFlags(new Command('get').description('Get organization usage'))
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
      .action(async (options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'usage.get',
          await buildOperationInput('usage.get', options, { output: outputFlags(options) })
        );
      })
  );
  return command;
}
