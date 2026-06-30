import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  actingSubaccountOption,
  buildOperationInput,
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

export function createAiCommand(factory: Factory): Command {
  const command = new Command('ai').description('Manage AI models and credentials');
  command.addCommand(createAiModelsCommand(factory));
  command.addCommand(createAiCredentialsCommand(factory));
  return command;
}

function createAiModelsCommand(factory: Factory): Command {
  const command = new Command('models').description('Discover AI models');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'ai.models.list',
      description: 'List AI models',
      configure: (cmd) =>
        cmd
          .option('--provider <provider>', 'Filter by provider')
          .option('--status <status>', 'Filter by support status')
          .option('--managed <value>', 'Filter by managed availability')
          .option('--engine <engine>', 'Filter by engine: stagehand or browserUse'),
      query: (options) =>
        ({
          provider: typeof options.provider === 'string' ? options.provider : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
          managed:
            typeof options.managed === 'string' ? parseBooleanFlag(options.managed) : undefined,
          engine: typeof options.engine === 'string' ? options.engine : undefined,
        }) as CliOperationQuery<'ai.models.list'>,
    })
  );
  return command;
}

function createAiCredentialsCommand(factory: Factory): Command {
  const command = new Command('credentials').description('Manage BYOK AI credentials');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'ai.credentials.list',
      description: 'List AI credentials',
      configure: (cmd) =>
        cmd
          .option('--provider <provider>', 'Filter by provider')
          .option('--name <name>', 'Filter by name')
          .option('--status <status>', 'Filter by status'),
      query: (options) =>
        ({
          provider: typeof options.provider === 'string' ? options.provider : undefined,
          name: typeof options.name === 'string' ? options.name : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
        }) as CliOperationQuery<'ai.credentials.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'ai.credentials.get',
      name: 'get',
      description: 'Get an AI credential',
      argName: 'credentialId',
    })
  );
  command.addCommand(createAiCredentialWriteCommand(factory, 'create', 'ai.credentials.create'));
  command.addCommand(
    createAiCredentialWriteCommand(factory, 'patch', 'ai.credentials.update', ['credentialId'])
  );
  command.addCommand(
    addOutputFlags(
      new Command('test').description('Test an AI credential').argument('<credentialId>')
    )
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
      .action(async (credentialId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'ai.credentials.test',
          await buildOperationInput('ai.credentials.test', options, {
            pathParams: { credentialId },
            output: outputFlags(options),
          })
        );
      })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'ai.credentials.delete',
      description: 'Delete an AI credential',
      argNames: ['credentialId'],
    })
  );
  return command;
}

function createAiCredentialWriteCommand(
  factory: Factory,
  name: 'create' | 'patch',
  operationId: 'ai.credentials.create' | 'ai.credentials.update',
  argNames: string[] = []
): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId,
    name,
    description: name === 'create' ? 'Create an AI credential' : 'Update an AI credential',
    argNames,
    configure: (cmd) =>
      cmd
        .option('--name <name>', 'Credential name')
        .option('--provider <provider>', 'Provider key')
        .option('--api-key <key>', 'Provider API key')
        .option('--status <status>', 'Credential status')
        .option('--default-model <model>', 'Default model')
        .option('--base-url <url>', 'Custom provider base URL')
        .option('--subaccount-id <id>', 'Subaccount scope when using a parent/org key'),
    body: async (_args, options) => {
      return {
        name: options.name,
        provider: options.provider,
        apiKey: options.apiKey,
        status: options.status,
        defaultModel: options.defaultModel,
        baseUrl: options.baseUrl,
      } as CliOperationJsonBody<typeof operationId>;
    },
    actingSubaccountId:
      operationId === 'ai.credentials.create'
        ? (_args, options) => actingSubaccountOption()(options)
        : undefined,
  });
}

function parseBooleanFlag(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
