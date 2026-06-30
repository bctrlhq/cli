import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import { buildOperationInput, outputFlags, requestOperationAndPrint } from '../shared/operation.js';

export function createHelpCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('help')
      .description('Get BCTRL API help')
      .option('--topic <topic>', 'Help topic')
      .option('--audience <audience>', 'Help audience')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (options: { topic?: string; audience?: string; params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'help',
        await buildOperationInput('help', options, {
          query: {
            topic: options.topic,
            audience: options.audience,
          } as CliOperationQuery<'help'>,
          output: outputFlags(options),
        })
      );
    }
  );
}
