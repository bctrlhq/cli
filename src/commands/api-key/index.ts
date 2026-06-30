import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
} from '../shared/operation.js';

export function createApiKeyCommand(factory: Factory): Command {
  const command = new Command('api-key').description('Manage API keys');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'api-keys.list',
      description: 'List API keys',
      configure: (cmd) =>
        cmd
          .option('--subaccount-id <id>', 'Filter by subaccount id')
          .option('--type <type>', 'Filter by API key type: organization or subaccount')
          .option('-L, --limit <number>', 'Maximum number of results to return')
          .option('--cursor <cursor>', 'Pagination cursor'),
      query: (options) =>
        ({
          subaccountId: typeof options.subaccountId === 'string' ? options.subaccountId : undefined,
          type: typeof options.type === 'string' ? options.type : undefined,
          limit: typeof options.limit === 'string' ? Number(options.limit) : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'api-keys.list'>,
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'api-keys.create',
      name: 'create',
      description: 'Create an API key',
      configure: (cmd) =>
        cmd
          .option('--name <name>', 'API key name')
          .option('--subaccount-id <id>', 'Create a subaccount-scoped key')
          .option('--expires-at <iso>', 'Expiration timestamp'),
      body: async (_args, options) => {
        return {
          name: options.name,
          subaccountId: options.subaccountId,
          expiresAt: options.expiresAt,
        } as CliOperationJsonBody<'api-keys.create'>;
      },
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'api-keys.delete',
      description: 'Delete an API key',
      argNames: ['keyId'],
    })
  );
  return command;
}
