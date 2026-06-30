import { Command, Option } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { parseJsonString, readBlob, readJsonFile } from '../shared/io.js';
import {
  addPaginationFlags,
  buildOperationInput,
  createOperationJsonBodyCommand,
  outputFlags,
  requestOperationAndPrint,
  uploadOperationFile,
} from '../shared/operation.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, outputData, type OutputFlags } from '../shared/output.js';
import { CliError } from '../../runtime/errors.js';
import { addCliOperationHelp } from '../shared/help.js';

export function createRuntimeCommand(factory: Factory): Command {
  const command = new Command('runtime').description('Manage runtimes');
  command.addCommand(
    addOutputFlags(
      addPaginationFlags(new Command('list').description('List runtimes'))
        .option('--space <id>', 'Filter by space id')
        .addOption(
          new Option('--status <status>', 'Filter by runtime status').choices([
            'active',
            'failed',
            'stopped',
          ])
        )
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (
        options: {
          space?: string;
          status?: 'active' | 'failed' | 'stopped';
          limit?: number;
          cursor?: string;
          params?: string;
        } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.list',
          await buildOperationInput('runtimes.list', options, {
            query: {
              spaceId: options.space,
              status: options.status ? [options.status] : undefined,
              limit: options.limit,
              cursor: options.cursor,
            },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  command.addCommand(
    addOutputFlags(
      new Command('get')
        .description('Get a runtime')
        .argument('<runtimeId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runtimeId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.get',
          await buildOperationInput('runtimes.get', options, {
            pathParams: { runtimeId },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  command.addCommand(createRuntimeCreateCommand(factory));
  command.addCommand(createRuntimePatchCommand(factory));
  command.addCommand(
    addOutputFlags(
      new Command('delete')
        .description('Delete a runtime and its browser state')
        .argument('<runtimeId>')
        .option('-y, --yes', 'Confirm deletion')
        .option('--force', 'Stop the runtime first if it is still active')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (
        runtimeId: string,
        options: {
          yes?: boolean;
          force?: boolean;
          params?: string;
        } & OutputFlags
      ) => {
        if (options.yes !== true) {
          throw new CliError('Refusing to delete without --yes');
        }
        await requestOperationAndPrint(
          factory,
          'runtimes.delete',
          await buildOperationInput('runtimes.delete', options, {
            pathParams: { runtimeId },
            query: { force: options.force === true ? true : undefined },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  command.addCommand(createRuntimeStartCommand(factory));
  command.addCommand(
    addOutputFlags(
      new Command('stop')
        .description('Stop a runtime')
        .argument('<runtimeId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(async (runtimeId: string, options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.stop',
        await buildOperationInput('runtimes.stop', options, {
          pathParams: { runtimeId },
          output: outputFlags(options),
        })
      );
    })
  );
  command.addCommand(createRuntimeFileCommand(factory));
  command.addCommand(createRuntimeInvocationCommand(factory));
  command.addCommand(createRuntimeHumanActionCommand(factory));
  command.addCommand(createRuntimeTargetCommand(factory));
  return command;
}

function createRuntimeTargetCommand(factory: Factory): Command {
  const command = new Command('target').description('Manage runtime targets (tabs)');

  command.addCommand(
    addOutputFlags(
      new Command('list')
        .description('List targets')
        .argument('<runtimeId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runtimeId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.targets.list',
          await buildOperationInput('runtimes.targets.list', options, {
            pathParams: { runtimeId },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  command.addCommand(
    addOutputFlags(
      new Command('create')
        .description('Open a new target')
        .argument('<runtimeId>')
        .option('--uri <uri>', 'Navigate the new target to this URI')
        .option('--activate', 'Focus the new target')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
        .option('--body <json>', 'Request body as JSON (inline, @file, or - for stdin)')
    ).action(
      async (
        runtimeId: string,
        options: { uri?: string; activate?: boolean; params?: string; body?: string } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.targets.create',
          await buildOperationInput('runtimes.targets.create', options, {
            pathParams: { runtimeId },
            body: {
              ...(options.uri ? { uri: options.uri } : {}),
              ...(options.activate ? { activate: true } : {}),
            },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  command.addCommand(
    addOutputFlags(
      new Command('get')
        .description('Get a target')
        .argument('<runtimeId>')
        .argument('<targetId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runtimeId: string, targetId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.targets.get',
          await buildOperationInput('runtimes.targets.get', options, {
            pathParams: { runtimeId, targetId },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  command.addCommand(
    addOutputFlags(
      new Command('activate')
        .description('Focus a target')
        .argument('<runtimeId>')
        .argument('<targetId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runtimeId: string, targetId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.targets.activate',
          await buildOperationInput('runtimes.targets.activate', options, {
            pathParams: { runtimeId, targetId },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  command.addCommand(
    addOutputFlags(
      new Command('delete')
        .description('Close a target')
        .argument('<runtimeId>')
        .argument('<targetId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runtimeId: string, targetId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.targets.delete',
          await buildOperationInput('runtimes.targets.delete', options, {
            pathParams: { runtimeId, targetId },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  return command;
}

function createRuntimeCreateCommand(factory: Factory): Command {
  return addOutputFlags(
    addCliOperationHelp(
      new Command('create')
        .description('Create a runtime')
        .option('--space <id>', 'Space id; omitted uses caller default space')
        .option('--name <name>', 'Runtime name')
        .option('--profile', 'Persist browser state across runtime starts')
        .option('--proxy <id-or-url>', 'Saved proxy id or inline custom proxy URL')
        .addOption(
          new Option('--device <device>', 'Fingerprint device filter').choices([
            'desktop',
            'mobile',
          ])
        )
        .addOption(
          new Option('--os <os>', 'Fingerprint OS filter').choices([
            'windows',
            'macos',
            'android',
            'ios',
          ])
        )
        .addOption(
          new Option('--browser <browser>', 'Fingerprint browser filter').choices([
            'chrome',
            'edge',
            'safari',
          ])
        )
        .option('--browser-version <version>', 'Fingerprint browser version filter')
        .option(
          '--locale <locale>',
          'Fingerprint locale/language filter; repeat to set an ordered language stack',
          collectLocale,
          []
        )
        .option('--config-file <path>', 'Runtime config JSON file')
        .option('--metadata-file <path>', 'Runtime metadata JSON file')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
        .option('--body <json>', 'Full request body as JSON (inline, @file, or - for stdin)'),
      'runtimes.create'
    )
  ).action(
    async (
      options: {
        space?: string;
        name?: string;
        profile?: boolean;
        proxy?: string;
        device?: string;
        os?: string;
        browser?: string;
        browserVersion?: string;
        locale?: string[];
        configFile?: string;
        metadataFile?: string;
        params?: string;
        body?: string;
      } & OutputFlags
    ) => {
      // --body (raw JSON) is the complete body; otherwise build it from
      // the curated flags. --params can still add query params. The control-plane
      // validates the body against the runtimes.create schema either way.
      const config =
        typeof options.configFile === 'string'
          ? await readJsonFile(options.configFile, '--config-file')
          : undefined;
      await requestOperationAndPrint(
        factory,
        'runtimes.create',
        await buildOperationInput('runtimes.create', options, {
          body: {
            type: 'browser',
            spaceId: options.space,
            name: options.name,
            config: buildRuntimeCreateConfig(config, options),
            metadata:
              typeof options.metadataFile === 'string'
                ? await readJsonFile(options.metadataFile, '--metadata-file')
                : undefined,
          } as CliOperationJsonBody<'runtimes.create'>,
          output: outputFlags(options),
        })
      );
    }
  );
}

function collectLocale(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildRuntimeCreateConfig(
  config: unknown,
  options: {
    profile?: boolean;
    proxy?: string;
    device?: string;
    os?: string;
    browser?: string;
    browserVersion?: string;
    locale?: string[];
  }
): unknown {
  const fingerprint = {
    ...(options.device ? { device: options.device } : {}),
    ...(options.os ? { os: options.os } : {}),
    ...(options.browser ? { browser: options.browser } : {}),
    ...(options.browserVersion ? { browserVersion: options.browserVersion } : {}),
    ...(options.locale && options.locale.length === 1 ? { locale: options.locale[0] } : {}),
    ...(options.locale && options.locale.length > 1 ? { locale: options.locale } : {}),
  };
  const overrides = {
    ...(options.profile === true ? { profile: true } : {}),
    ...(options.proxy ? { proxy: options.proxy } : {}),
    ...(Object.keys(fingerprint).length > 0 ? { fingerprint } : {}),
  };

  if (Object.keys(overrides).length === 0) {
    return config;
  }

  if (config !== undefined && !isRecord(config)) {
    throw new Error('--config-file must contain a JSON object when combined with runtime flags');
  }

  if (!isRecord(config)) {
    return overrides;
  }

  return {
    ...config,
    ...overrides,
    ...(isRecord(config.fingerprint) || 'fingerprint' in overrides
      ? {
          fingerprint: {
            ...(isRecord(config.fingerprint) ? config.fingerprint : {}),
            ...(isRecord(overrides.fingerprint) ? overrides.fingerprint : {}),
          },
        }
      : {}),
  };
}

function createRuntimePatchCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('patch')
      .description('Update a runtime')
      .argument('<runtimeId>')
      .option('--name <name>', 'Runtime name')
      .option('--idle-timeout-seconds <seconds>', 'Idle timeout in seconds', parsePositiveInteger)
      .option('--config-file <path>', 'Runtime config JSON file')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
      .option('--body <json>', 'Request body as JSON (inline, @file, or - for stdin)')
  ).action(
    async (
      runtimeId: string,
      options: {
        name?: string;
        idleTimeoutSeconds?: number;
        configFile?: string;
        params?: string;
        body?: string;
      } & OutputFlags
    ) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.update',
        await buildOperationInput('runtimes.update', options, {
          pathParams: { runtimeId },
          body: {
            name: options.name,
            idleTimeoutSeconds: options.idleTimeoutSeconds,
            config:
              typeof options.configFile === 'string'
                ? await readJsonFile(options.configFile, '--config-file')
                : undefined,
          } as CliOperationJsonBody<'runtimes.update'>,
          output: outputFlags(options),
        })
      );
    }
  );
}

function createRuntimeStartCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('start')
      .description('Start a runtime')
      .argument('<runtimeId>')
      .option('--idempotency-key <key>', 'Idempotency key for retry-safe start')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (
      runtimeId: string,
      options: { idempotencyKey?: string; params?: string } & OutputFlags
    ) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.start',
        await buildOperationInput('runtimes.start', options, {
          pathParams: { runtimeId },
          idempotencyKey: options.idempotencyKey,
          output: outputFlags(options),
        })
      );
    }
  );
}

function createRuntimeInvocationCommand(factory: Factory): Command {
  const command = new Command('invocation').description('Create, wait for, and cancel invocations');
  command.addCommand(createRuntimeInvocationCreateCommand(factory));
  command.addCommand(createRuntimeInvocationWaitCommand(factory));
  command.addCommand(
    addOutputFlags(
      new Command('cancel')
        .description('Cancel an invocation')
        .argument('<runtimeId>')
        .argument('<invocationId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (
        runtimeId: string,
        invocationId: string,
        options: { params?: string } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.invocations.cancel',
          await buildOperationInput('runtimes.invocations.cancel', options, {
            pathParams: { runtimeId, invocationId },
            output: outputFlags(options),
          })
        );
      }
    )
  );
  return command;
}

function createRuntimeInvocationCreateCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('create')
      .description('Create a runtime invocation')
      .argument('<runtimeId>')
      .option('--action <action>', 'Invocation action')
      .option('--instruction <text>', 'Instruction for action/agent invocations')
      .option('--target <target>', "Target to act on: 'active' (default), 'new', or a target id")
      .option('--model <model>', 'Model id')
      .option('--tool <id...>', 'Inline tool id')
      .option('--toolset <id>', 'Toolset id')
      .option('--timeout-seconds <seconds>', 'Invocation timeout in seconds', parsePositiveInteger)
      .option('--idempotency-key <key>', 'Idempotency key for retry-safe create')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
      .option('--body <json>', 'Request body as JSON (inline, @file, or - for stdin)')
  ).action(
    async (
      runtimeId: string,
      options: {
        action?: string;
        instruction?: string;
        target?: string;
        model?: string;
        tool?: string[];
        toolset?: string;
        timeoutSeconds?: number;
        idempotencyKey?: string;
        params?: string;
        body?: string;
      } & OutputFlags
    ) => {
      const body = {
        action: options.action,
        instruction: options.instruction,
        target:
          options.target === undefined
            ? undefined
            : options.target === 'active' || options.target === 'new'
              ? options.target
              : { id: options.target },
        model: options.model,
        toolIds: options.tool,
        toolsetId: options.toolset,
        timeoutSeconds: options.timeoutSeconds,
      };
      await requestOperationAndPrint(
        factory,
        'runtimes.invocations.create',
        await buildOperationInput('runtimes.invocations.create', options, {
          pathParams: { runtimeId },
          body: body as CliOperationJsonBody<'runtimes.invocations.create'>,
          idempotencyKey: options.idempotencyKey,
          output: outputFlags(options),
        })
      );
    }
  );
}

function createRuntimeInvocationWaitCommand(factory: Factory): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: 'runtimes.invocations.wait',
    name: 'wait',
    description: 'Wait for an invocation',
    argNames: ['runtimeId', 'invocationId'],
    configure: (cmd) =>
      cmd
        .option('--timeout-seconds <seconds>', 'Wait timeout in seconds', parsePositiveInteger),
    body: async (_args, options) => {
      return {
        timeoutSeconds: options.timeoutSeconds,
      } as CliOperationJsonBody<'runtimes.invocations.wait'>;
    },
  });
}

function createRuntimeHumanActionCommand(factory: Factory): Command {
  const command = new Command('human-action').description('Manage runtime human actions');

  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runtimes.human-actions.create',
      name: 'create',
      description: 'Request human action',
      argNames: ['runtimeId'],
      configure: (cmd) =>
        cmd
          .option('--message <message>', 'Instructions for the human')
          .option(
            '--timeout-seconds <seconds>',
            'Human action timeout in seconds',
            parsePositiveInteger
          ),
      body: async (_args, options) => {
        return {
          message: options.message,
          timeoutSeconds: options.timeoutSeconds,
        } as CliOperationJsonBody<'runtimes.human-actions.create'>;
      },
    })
  );

  command.addCommand(
    addOutputFlags(
      addCliOperationHelp(
        new Command('get')
          .description('Get a human action')
          .argument('<runtimeId>')
          .option(
            '--params <json>',
            'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
          ),
        'runtimes.human-actions.get'
      )
    ).action(async (runtimeId: string, options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.human-actions.get',
        await buildOperationInput('runtimes.human-actions.get', options, {
          pathParams: { runtimeId },
          output: outputFlags(options),
        })
      );
    })
  );

  command.addCommand(
    addOutputFlags(
      addCliOperationHelp(
        new Command('complete')
          .description('Complete a human action')
          .argument('<runtimeId>')
          .option(
            '--params <json>',
            'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
          ),
        'runtimes.human-actions.complete'
      )
    ).action(async (runtimeId: string, options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.human-actions.complete',
        await buildOperationInput('runtimes.human-actions.complete', options, {
          pathParams: { runtimeId },
          output: outputFlags(options),
        })
      );
    })
  );

  command.addCommand(
    addOutputFlags(
      addCliOperationHelp(
        new Command('cancel')
          .description('Cancel a human action')
          .argument('<runtimeId>')
          .option(
            '--params <json>',
            'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
          ),
        'runtimes.human-actions.cancel'
      )
    ).action(async (runtimeId: string, options: { params?: string } & OutputFlags) => {
      await requestOperationAndPrint(
        factory,
        'runtimes.human-actions.cancel',
        await buildOperationInput('runtimes.human-actions.cancel', options, {
          pathParams: { runtimeId },
          output: outputFlags(options),
        })
      );
    })
  );

  command.addCommand(
    addOutputFlags(
      addCliOperationHelp(
        new Command('wait')
          .description('Wait for a human action')
          .argument('<runtimeId>')
          .option('--timeout-seconds <seconds>', 'Long-poll timeout', parsePositiveInteger)
          .option(
            '--params <json>',
            'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
          )
          .option('--body <json>', 'Request body as JSON (inline, @file, or - for stdin)'),
        'runtimes.human-actions.wait'
      )
    ).action(
      async (
        runtimeId: string,
        options: { timeoutSeconds?: number; params?: string; body?: string } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.human-actions.wait',
          await buildOperationInput('runtimes.human-actions.wait', options, {
            pathParams: { runtimeId },
            body: {
              timeoutSeconds: options.timeoutSeconds,
            },
            output: outputFlags(options),
          })
        );
      }
    )
  );

  return command;
}

function createRuntimeFileCommand(factory: Factory): Command {
  const command = new Command('file').description('Move files into and out of runtimes');
  command.addCommand(
    addOutputFlags(
      addPaginationFlags(
        new Command('list').description('List runtime files').argument('<runtimeId>')
      )
        .option('--type <type>', 'Filter by file type')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (
        runtimeId: string,
        options: { type?: string; limit?: number; cursor?: string; params?: string } & OutputFlags
      ) => {
        await requestOperationAndPrint(
          factory,
          'runtimes.files.list',
          await buildOperationInput('runtimes.files.list', options, {
            pathParams: { runtimeId },
            query: {
              type: options.type,
              limit: options.limit,
              cursor: options.cursor,
            } as CliOperationQuery<'runtimes.files.list'>,
            output: outputFlags(options),
          })
        );
      }
    )
  );
  command.addCommand(createRuntimeFileUploadCommand(factory));
  command.addCommand(createRuntimeFileStageCommand(factory));
  command.addCommand(createRuntimeFileCollectCommand(factory));
  return command;
}

function createRuntimeFileUploadCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('upload')
      .description('Upload a local file into a runtime workspace')
      .argument('<runtimeId>')
      .argument('<localPath>')
      .option('--destination-path <path>', 'Durable BCTRL storage destination')
      .option('--runtime-path <path>', 'Runtime workspace destination')
      .option('--name <name>', 'Display name')
      .option('--metadata <json>', 'Metadata as inline JSON (overrides --metadata-file)')
      .option('--metadata-file <path>', 'Metadata JSON file')
  ).action(
    async (
      runtimeId: string,
      localPath: string,
      options: {
        destinationPath?: string;
        runtimePath?: string;
        name?: string;
        metadata?: string;
        metadataFile?: string;
      } & OutputFlags
    ) => {
      const file = await readBlob(localPath);
      const metadata =
        options.metadata !== undefined
          ? JSON.stringify(parseJsonString(options.metadata, '--metadata'))
          : typeof options.metadataFile === 'string'
            ? JSON.stringify(await readJsonFile(options.metadataFile, '--metadata-file'))
            : undefined;
      const result = await uploadOperationFile(factory, 'runtimes.files.upload', {
        pathParams: { runtimeId },
        file: file.blob,
        fileName: options.name ?? file.fileName,
        fields: {
          ...(options.destinationPath ? { destinationPath: options.destinationPath } : {}),
          ...(options.runtimePath ? { runtimePath: options.runtimePath } : {}),
          ...(options.name ? { name: options.name } : {}),
          ...(metadata ? { metadata } : {}),
        },
      });
      await outputData(factory.io, result, options);
    }
  );
}

function createRuntimeFileStageCommand(factory: Factory): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: 'runtimes.files.stage',
    name: 'stage',
    description: 'Stage a durable file into a runtime',
    argNames: ['runtimeId'],
    configure: (cmd) =>
      cmd
        .option('--file <id>', 'Durable file id')
        .option('--runtime-path <path>', 'Runtime workspace destination')
        .option('--name <name>', 'Runtime-local display name'),
    body: async (_args, options) => {
      return {
        fileId: options.file,
        runtimePath: options.runtimePath,
        name: options.name,
      } as CliOperationJsonBody<'runtimes.files.stage'>;
    },
  });
}

function createRuntimeFileCollectCommand(factory: Factory): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: 'runtimes.files.collect',
    name: 'collect',
    description: 'Collect a runtime-local file into durable storage',
    argNames: ['runtimeId'],
    configure: (cmd) =>
      cmd
        .requiredOption('--runtime-path <path>', 'Runtime workspace source')
        .option('--name <name>', 'Durable file name')
        .option('--destination-path <path>', 'Durable BCTRL storage destination'),
    body: async (_args, options) => {
      return {
        runtimePath: options.runtimePath,
        name: options.name,
        destinationPath: options.destinationPath,
      } as CliOperationJsonBody<'runtimes.files.collect'>;
    },
  });
}
