import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationQuery } from '../../openapi.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  addPaginationFlags,
  buildOperationInput,
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

export function createWebhookCommand(factory: Factory): Command {
  const command = new Command('webhook').description('Manage signed webhook deliveries');

  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'webhooks.list',
      description: 'List webhooks',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'webhooks.create',
      name: 'create',
      description: 'Create a webhook (the signing secret is returned once)',
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'webhooks.get',
      name: 'get',
      description: 'Get a webhook',
      argName: 'webhookId',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'webhooks.update',
      name: 'patch',
      description: 'Update a webhook',
      argNames: ['webhookId'],
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'webhooks.delete',
      description: 'Delete a webhook',
      argNames: ['webhookId'],
    })
  );
  command.addCommand(
    createWebhookActionCommand(
      factory,
      'rotate-secret',
      'Rotate a webhook signing secret',
      'webhooks.rotate-secret'
    )
  );
  command.addCommand(
    createWebhookActionCommand(factory, 'test', 'Queue a test delivery', 'webhooks.test')
  );

  const deliveries = new Command('deliveries').description('Inspect webhook deliveries');
  deliveries.addCommand(
    addOutputFlags(
      addPaginationFlags(
        new Command('list').description('List webhook deliveries').argument('<webhookId>')
      )
    ).action(
      async (
        webhookId: string,
        options: { limit?: number; cursor?: string } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'webhooks.deliveries.list',
          await buildOperationInput('webhooks.deliveries.list', options, {
            pathParams: { webhookId },
            query: {
              limit: options.limit,
              cursor: options.cursor,
            } as CliOperationQuery<'webhooks.deliveries.list'>,
            output: outputFlags(options),
          })
        );
      }
    )
  );
  deliveries.addCommand(
    addOutputFlags(
      new Command('redeliver')
        .description('Queue a webhook delivery again')
        .argument('<webhookId>')
        .argument('<deliveryId>')
    ).action(
      async (webhookId: string, deliveryId: string, options: OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'webhooks.deliveries.redeliver',
          await buildOperationInput('webhooks.deliveries.redeliver', options, {
            pathParams: { webhookId, deliveryId },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  command.addCommand(deliveries);

  return command;
}

function createWebhookActionCommand(
  factory: Factory,
  name: string,
  description: string,
  operationId: 'webhooks.rotate-secret' | 'webhooks.test'
): Command {
  return addOutputFlags(
    new Command(name).description(description).argument('<webhookId>')
  ).action(async (webhookId: string, options: OutputFlags) => {
    await requestOperationAndPrint(
      factory,
      operationId,
      await buildOperationInput(operationId, options, {
        pathParams: { webhookId },
        output: outputFlags(options),
      })
    );
  });
}
