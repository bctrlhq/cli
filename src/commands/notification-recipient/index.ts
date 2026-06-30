import { Command, Option } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
} from '../shared/operation.js';
import { parsePositiveInteger } from '../shared/options.js';

function parseEnabled(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
}

export function createNotificationRecipientCommand(factory: Factory): Command {
  const command = new Command('notification-recipient').description(
    'Manage notification recipients'
  );

  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'notification-recipients.list',
      description: 'List notification recipients',
      configure: (cmd) =>
        cmd
          .addOption(
            new Option('--type <type>', 'Filter by recipient type').choices([
              'email',
              'sms',
              'whatsapp',
            ])
          )
          .addOption(
            new Option('--enabled <enabled>', 'Filter by enabled state').choices(['true', 'false'])
          )
          .option(
            '-L, --limit <number>',
            'Maximum number of results to return',
            parsePositiveInteger
          )
          .option('--cursor <cursor>', 'Pagination cursor'),
      query: (options) =>
        ({
          type: typeof options.type === 'string' ? options.type : undefined,
          enabled: parseEnabled(options.enabled),
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'notification-recipients.list'>,
    })
  );

  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'notification-recipients.create',
      name: 'create',
      description: 'Create a notification recipient',
      configure: (cmd) =>
        cmd
          .addOption(
            new Option('--type <type>', 'Recipient type').choices(['email', 'sms', 'whatsapp'])
          )
          .option('--value <value>', 'Email address, SMS number, or WhatsApp number')
          .option('--name <name>', 'Display name'),
      body: async (_args, options) => {
        return {
          type: options.type,
          value: options.value,
          name: options.name,
        } as CliOperationJsonBody<'notification-recipients.create'>;
      },
    })
  );

  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'notification-recipients.update',
      name: 'patch',
      description: 'Update a notification recipient',
      argNames: ['recipientId'],
      configure: (cmd) =>
        cmd
          .option('--value <value>', 'Email address, SMS number, or WhatsApp number')
          .option('--name <name>', 'Display name')
          .option('--clear-name', 'Clear the display name')
          .addOption(
            new Option('--enabled <enabled>', 'Set enabled state').choices(['true', 'false'])
          ),
      body: async (_args, options) => {
        return {
          value: options.value,
          name: options.clearName === true ? null : options.name,
          enabled: parseEnabled(options.enabled),
        } as CliOperationJsonBody<'notification-recipients.update'>;
      },
    })
  );

  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'notification-recipients.delete',
      description: 'Delete a notification recipient',
      argNames: ['recipientId'],
    })
  );

  return command;
}
