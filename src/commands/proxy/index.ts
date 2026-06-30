import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import type { CliOperationQuery } from '../../openapi.js';
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

export function createProxyCommand(factory: Factory): Command {
  const command = new Command('proxy').description('Manage proxies');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'proxies.list',
      description: 'List proxies',
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'proxies.get',
      name: 'get',
      description: 'Get a proxy',
      argName: 'proxyId',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'proxies.create',
      name: 'create',
      description: 'Create a proxy',
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'proxies.update',
      name: 'patch',
      description: 'Update a proxy',
      argNames: ['proxyId'],
    })
  );
  command.addCommand(
    addOutputFlags(new Command('test').description('Test a proxy').argument('<proxyId>'))
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
      .action(async (proxyId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'proxies.test',
          await buildOperationInput('proxies.test', options, {
            pathParams: { proxyId },
            output: outputFlags(options),
          })
        );
      })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'proxies.delete',
      description: 'Delete a proxy',
      argNames: ['proxyId'],
    })
  );
  command.addCommand(createProxyPoolCommand(factory));
  return command;
}

function createProxyPoolCommand(factory: Factory): Command {
  const command = new Command('pool').description('Inspect managed proxy pools');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'proxies.pools.list',
      description: 'List proxy pools',
      configure: (cmd) =>
        addPaginationFlags(cmd)
          .option('--country <country>', 'Filter by ISO country code')
          .option('--category <category>', 'Filter by category')
          .option('--available <boolean>', 'Filter by availability'),
      query: (options) =>
        ({
          country: typeof options.country === 'string' ? options.country : undefined,
          category: typeof options.category === 'string' ? options.category : undefined,
          available:
            typeof options.available === 'string' ? parseBooleanFlag(options.available) : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'proxies.pools.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'proxies.pools.get',
      name: 'get',
      description: 'Get a proxy pool',
      argName: 'poolId',
    })
  );
  return command;
}

function parseBooleanFlag(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
