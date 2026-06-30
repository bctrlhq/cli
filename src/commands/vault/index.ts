import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { CliError } from '../../runtime/errors.js';
import { readText } from '../shared/io.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  buildOperationInput,
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  outputFlags,
  requestOperationAndPrint,
} from '../shared/operation.js';

export function createVaultCommand(factory: Factory): Command {
  const command = new Command('vault').description('Manage vault secrets and TOTP codes');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'vault.secrets.list',
      description: 'List vault secret metadata',
      configure: (cmd) =>
        cmd
          .option('--prefix <prefix>', 'Filter by secret key prefix')
          .option('--origin <origin>', 'Filter by origin')
          .option('--has-totp', 'Only show secrets with TOTP')
          .option(
            '-L, --limit <number>',
            'Maximum number of results to return',
            parsePositiveInteger
          ),
      query: (options) =>
        ({
          prefix: typeof options.prefix === 'string' ? options.prefix : undefined,
          origin: typeof options.origin === 'string' ? options.origin : undefined,
          hasTotp: options.hasTotp === true ? true : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
        }) as CliOperationQuery<'vault.secrets.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'vault.secrets.get',
      name: 'get',
      description: 'View vault secret metadata',
      argName: 'key',
    })
  );
  command.addCommand(createVaultReadCommand(factory));
  command.addCommand(createVaultSetCommand(factory));
  command.addCommand(createVaultPatchCommand(factory));
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'vault.secrets.delete',
      description: 'Delete a vault secret',
      argNames: ['key'],
    })
  );
  command.addCommand(createVaultTotpCommand(factory));
  return command;
}

function createVaultReadCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('read')
      .description('Read a vault secret value')
      .argument('<key>')
      .option('--reveal', 'Allow printing a secret to an interactive terminal')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(async (key: string, options: { reveal?: boolean; params?: string } & OutputFlags) => {
    if (factory.io.isStdoutTTY() && options.reveal !== true) {
      throw new CliError('Refusing to print a secret to a terminal without --reveal');
    }
    await requestOperationAndPrint(
      factory,
      'vault.secrets.value',
      await buildOperationInput('vault.secrets.value', options, {
        pathParams: { key },
        output: outputFlags(options),
      })
    );
  });
}

function createVaultSetCommand(factory: Factory): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: 'vault.secrets.upsert',
    name: 'set',
    description: 'Create or replace a vault secret',
    argNames: ['key'],
    configure: (cmd) =>
      cmd
        .option('--type <type>', 'Secret type: login or value')
        .option('--value <value>', 'Generic secret value')
        .option('--value-from-file <path>', 'Read generic secret value from file, or - for stdin')
        .option('--username <value>', 'Credential username')
        .option('--password <value>', 'Credential password')
        .option('--password-from-file <path>', 'Read password from file, or - for stdin')
        .option('--totp-secret <secret>', 'TOTP seed')
        .option('--label <label>', 'Display label')
        .option('--origin <origin...>', 'Allowed origin')
        .option('--origin-pattern <pattern...>', 'Allowed origin pattern'),
    body: async (args, options) => {
      const password =
        typeof options.passwordFromFile === 'string'
          ? (await readText(options.passwordFromFile)).trimEnd()
          : options.password;
      const value =
        typeof options.valueFromFile === 'string'
          ? (await readText(options.valueFromFile)).trimEnd()
          : options.value;
      const common = {
        label: options.label,
        origins: options.origin,
        originPatterns: options.originPattern,
      };
      const type =
        options.type === 'value' || options.type === 'login'
          ? options.type
          : typeof value === 'string'
            ? 'value'
            : 'login';
      if (
        typeof options.type === 'string' &&
        options.type !== 'value' &&
        options.type !== 'login'
      ) {
        throw new CliError('Vault secret type must be "login" or "value"');
      }
      if (type === 'value') {
        if (typeof value !== 'string') {
          throw new CliError('Vault value secrets require --value, --value-from-file, or --body');
        }
        return {
          ...common,
          type: 'value',
          value,
        } as CliOperationJsonBody<'vault.secrets.upsert'>;
      }
      if (typeof options.username !== 'string' || typeof password !== 'string') {
        throw new CliError(
          'Vault login secrets require --username and --password, --password-from-file, or --body'
        );
      }
      return {
        ...common,
        type: 'login',
        username: options.username,
        password,
        totpSecret: options.totpSecret,
      } as CliOperationJsonBody<'vault.secrets.upsert'>;
    },
  });
}

function createVaultPatchCommand(factory: Factory): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: 'vault.secrets.update',
    name: 'patch',
    description: 'Update a vault secret',
    argNames: ['key'],
    configure: (cmd) =>
      cmd
        .option('--value <value>', 'Generic secret value')
        .option('--value-from-file <path>', 'Read generic secret value from file, or - for stdin')
        .option('--username <value>', 'Credential username')
        .option('--password <value>', 'Credential password')
        .option('--password-from-file <path>', 'Read password from file, or - for stdin')
        .option('--totp-secret <secret>', 'TOTP seed')
        .option('--clear-totp', 'Remove the TOTP seed')
        .option('--label <label>', 'Display label')
        .option('--clear-label', 'Remove the display label')
        .option('--origin <origin...>', 'Allowed origin')
        .option('--clear-origins', 'Remove origins')
        .option('--origin-pattern <pattern...>', 'Allowed origin pattern')
        .option('--clear-origin-patterns', 'Remove origin patterns'),
    body: async (_args, options) => {
      const password =
        typeof options.passwordFromFile === 'string'
          ? (await readText(options.passwordFromFile)).trimEnd()
          : options.password;
      const value =
        typeof options.valueFromFile === 'string'
          ? (await readText(options.valueFromFile)).trimEnd()
          : options.value;
      const body = {
        value,
        username: options.username,
        password,
        totpSecret: options.clearTotp === true ? null : options.totpSecret,
        label: options.clearLabel === true ? null : options.label,
        origins: options.clearOrigins === true ? null : options.origin,
        originPatterns: options.clearOriginPatterns === true ? null : options.originPattern,
      };
      if (!Object.values(body).some((value) => value !== undefined)) {
        throw new CliError('Vault patch requires at least one field or --body');
      }
      return body as CliOperationJsonBody<'vault.secrets.update'>;
    },
  });
}

function createVaultTotpCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('totp')
      .description('Generate the current TOTP code for a vault secret')
      .argument('<key>')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(async (key: string, options: { params?: string } & OutputFlags) => {
    await requestOperationAndPrint(
      factory,
      'vault.secrets.totp',
      await buildOperationInput('vault.secrets.totp', options, {
        pathParams: { key },
        output: outputFlags(options),
      })
    );
  });
}
