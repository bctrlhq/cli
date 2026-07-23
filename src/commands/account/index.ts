import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  buildOperationInput,
  createOperationJsonBodyCommand,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

export function createAccountCommand(factory: Factory): Command {
  const command = new Command('account').description('Manage organization settings');

  command.addCommand(
    addOutputFlags(new Command('get').description('Get organization settings')).action(
      async (options: OutputFlags) => {
        await requestOperationAndPrint(factory, 'account.get', {
          output: outputFlags(options),
        });
      }
    )
  );

  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'account.update',
      name: 'patch',
      description: 'Update organization settings (use --body for branding merge-patch JSON)',
      configure: (cmd) => cmd.option('--dry-run', 'Validate and resolve without persisting'),
      query: (_args, options) =>
        ({
          dryRun: options.dryRun === true,
        }) as CliOperationQuery<'account.update'>,
    })
  );

  return command;
}
