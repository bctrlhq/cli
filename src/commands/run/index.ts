import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { CliError } from '../../runtime/errors.js';
import { writeBinary } from '../shared/io.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, type OutputFlags } from '../shared/output.js';
import {
  addPaginationFlags,
  buildOperationInput,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  downloadOperation,
  outputFlags,
  requestOperation,
  requestOperationAndPrint,
  streamOperationText,
} from '../shared/operation.js';

export function createRunCommand(factory: Factory): Command {
  const command = new Command('run').description('Inspect and stream runs');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.list',
      description: 'List runs',
      configure: (cmd) =>
        addPaginationFlags(cmd)
          .option('--space <id>', 'Filter by space id')
          .option('--runtime <id>', 'Filter by runtime id')
          .option('--status <status>', 'Filter by run status')
          .option('--subaccount <id>', 'Filter by subaccount id'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
          runtimeId: typeof options.runtime === 'string' ? options.runtime : undefined,
          status: typeof options.status === 'string' ? options.status : undefined,
          subaccountId: typeof options.subaccount === 'string' ? options.subaccount : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'runs.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'runs.get',
      name: 'get',
      description: 'Get a run',
      argName: 'runId',
    })
  );
  command.addCommand(createRunActivityCommand(factory));
  command.addCommand(createRunEventsCommand(factory));
  command.addCommand(createRunFilesCommand(factory));
  command.addCommand(createRunInvocationsCommand(factory));
  command.addCommand(createRunInvocationCommand(factory));
  command.addCommand(createRunViewerCommand(factory, 'live', 'Create a live viewer URL'));
  command.addCommand(createRunViewerCommand(factory, 'recording', 'Create a recording viewer URL'));
  return command;
}

function createRunActivityCommand(factory: Factory): Command {
  const command = new Command('activity').description('Inspect run activities');
  command.addCommand(createRunActivityListCommand(factory));
  command.addCommand(
    createSseCommand(factory, {
      name: 'stream',
      description: 'Stream run activities',
      operationId: 'runs.activity.stream',
      configure: (cmd) =>
        addPaginationFlags(cmd)
          .option('--view <view>', 'Activity view')
          .option('--type <type>', 'Filter by activity type')
          .option('--category <category>', 'Filter by activity category')
          .option('--severity <severity>', 'Filter by severity')
          .option('--invocation <id>', 'Filter by invocation id')
          .option('--file <id>', 'Filter by file id'),
      query: (options) => ({
        view: typeof options.view === 'string' ? options.view : undefined,
        type: typeof options.type === 'string' ? options.type : undefined,
        category: typeof options.category === 'string' ? options.category : undefined,
        severity: typeof options.severity === 'string' ? options.severity : undefined,
        invocationId: typeof options.invocation === 'string' ? options.invocation : undefined,
        fileId: typeof options.file === 'string' ? options.file : undefined,
        limit: typeof options.limit === 'number' ? options.limit : undefined,
        cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
      }),
    })
  );
  return command;
}

function createRunActivityListCommand(factory: Factory): Command {
  return addOutputFlags(
    addPaginationFlags(new Command('list').description('List run activities').argument('<runId>'))
      .option('--view <view>', 'Activity view')
      .option('--type <type>', 'Filter by activity type')
      .option('--category <category>', 'Filter by activity category')
      .option('--severity <severity>', 'Filter by severity')
      .option('--invocation <id>', 'Filter by invocation id')
      .option('--file <id>', 'Filter by file id')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (
      runId: string,
      options: {
        view?: string;
        type?: string;
        category?: string;
        severity?: string;
        invocation?: string;
        file?: string;
        limit?: number;
        cursor?: string;
        params?: string;
      } & OutputFlags
    ) => {
      await requestOperationAndPrint(factory, 'runs.activity.list', await buildOperationInput('runs.activity.list', options, {
        pathParams: { runId },
        query: {
          view: options.view,
          type: options.type,
          category: options.category,
          severity: options.severity,
          invocationId: options.invocation,
          fileId: options.file,
          limit: options.limit,
          cursor: options.cursor,
        } as CliOperationQuery<'runs.activity.list'>,
        output: outputFlags(options),
      }));
    }
  );
}

function createRunEventsCommand(factory: Factory): Command {
  const command = new Command('events').description('Inspect run events');
  command.addCommand(createRunEventsListCommand(factory));
  command.addCommand(
    createSseCommand(factory, {
      name: 'stream',
      description: 'Stream run events',
      operationId: 'runs.events.stream',
      configure: (cmd) =>
        addPaginationFlags(cmd)
          .option('--type <type>', 'Filter by event type')
          .option('--status <status>', 'Filter by event status')
          .option('--page-id <id>', 'Filter by page id')
          .option('--context-id <id>', 'Filter by browser context id'),
      query: (options) => ({
        type: typeof options.type === 'string' ? options.type : undefined,
        status: typeof options.status === 'string' ? options.status : undefined,
        pageId: typeof options.pageId === 'string' ? options.pageId : undefined,
        contextId: typeof options.contextId === 'string' ? options.contextId : undefined,
        limit: typeof options.limit === 'number' ? options.limit : undefined,
        cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
      }),
    })
  );
  return command;
}

function createRunEventsListCommand(factory: Factory): Command {
  return addOutputFlags(
    addPaginationFlags(new Command('list').description('List run events').argument('<runId>'))
      .option('--type <type>', 'Filter by event type')
      .option('--status <status>', 'Filter by event status')
      .option('--page-id <id>', 'Filter by page id')
      .option('--context-id <id>', 'Filter by browser context id')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (
      runId: string,
      options: {
        type?: string;
        status?: string;
        pageId?: string;
        contextId?: string;
        limit?: number;
        cursor?: string;
        params?: string;
      } & OutputFlags
    ) => {
      await requestOperationAndPrint(factory, 'runs.events.list', await buildOperationInput('runs.events.list', options, {
        pathParams: { runId },
        query: {
          type: options.type,
          status: options.status,
          pageId: options.pageId,
          contextId: options.contextId,
          limit: options.limit,
          cursor: options.cursor,
        } as CliOperationQuery<'runs.events.list'>,
        output: outputFlags(options),
      }));
    }
  );
}

function createRunFilesCommand(factory: Factory): Command {
  const command = new Command('files').description('Inspect run files');
  command.addCommand(createRunFilesListCommand(factory));
  command.addCommand(createRunFilesExportCommand(factory));
  return command;
}

function createRunFilesListCommand(factory: Factory): Command {
  return addOutputFlags(
    addPaginationFlags(
      new Command('list').description('List run files').argument('<runId>')
    )
      .option('--type <type>', 'Filter by file type')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  ).action(
    async (
      runId: string,
      options: { type?: string; limit?: number; cursor?: string; params?: string } & OutputFlags
    ) => {
      await requestOperationAndPrint(factory, 'runs.files.list', await buildOperationInput('runs.files.list', options, {
        pathParams: { runId },
        query: {
          type: options.type,
          limit: options.limit,
          cursor: options.cursor,
        } as CliOperationQuery<'runs.files.list'>,
        output: outputFlags(options),
      }));
    }
  );
}

function createRunFilesExportCommand(factory: Factory): Command {
  return addOutputFlags(
    new Command('export')
      .description('Export run files as an archive')
      .argument('<runId>')
      .requiredOption('--to <path>', 'Output archive path, or - for stdout')
      .option('--name <name>', 'Export file name', 'run-files.zip')
      .option('--type <type...>', 'Filter exported file types')
  ).action(
    async (
      runId: string,
      options: { to: string; name: string; type?: string[] } & OutputFlags
    ) => {
      const body = {
        format: 'zip',
        name: options.name,
        filter: options.type ? { type: options.type } : undefined,
      };
      const result = (await requestOperation(factory, 'runs.files.export', {
        pathParams: { runId },
        body: body as CliOperationJsonBody<'runs.files.export'>,
      })) as { fileId?: string; id?: string };
      const fileId = result.fileId ?? result.id;
      if (!fileId) {
        throw new CliError('Expected run export response to include fileId');
      }
      const data = await downloadOperation(factory, 'files.content', {
        pathParams: { fileId },
      });
      await writeBinary(options.to, data);
    }
  );
}

function createRunInvocationsCommand(factory: Factory): Command {
  const command = addOutputFlags(
    addPaginationFlags(
      new Command('invocations').description('List run invocations').argument('<runId>')
    )
      .option('--status <status>', 'Filter by invocation status')
      .option('--action <action>', 'Filter by invocation action')
      .option(
        '--params <json>',
        'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
      )
  );
  command.action(
    async (
      runId: string,
      options: {
        status?: string;
        action?: string;
        limit?: number;
        cursor?: string;
        params?: string;
      } & OutputFlags
    ) => {
      await requestOperationAndPrint(factory, 'runs.invocations.list', await buildOperationInput('runs.invocations.list', options, {
        pathParams: { runId },
        query: {
          status: options.status,
          action: options.action,
          limit: options.limit,
          cursor: options.cursor,
        } as CliOperationQuery<'runs.invocations.list'>,
        output: outputFlags(options),
      }));
    }
  );
  return command;
}

function createRunInvocationCommand(factory: Factory): Command {
  const command = new Command('invocation').description('Inspect run invocations');
  command.addCommand(
    addOutputFlags(
      new Command('get')
        .description('Get a run invocation')
        .argument('<runId>')
        .argument('<invocationId>')
        .option(
          '--params <json>',
          'Path/query parameters as a JSON object (inline, @file, or - for stdin)'
        )
    ).action(
      async (runId: string, invocationId: string, options: { params?: string } & OutputFlags) => {
        await requestOperationAndPrint(factory, 'runs.invocations.get', await buildOperationInput('runs.invocations.get', options, {
          pathParams: { runId, invocationId },
          output: outputFlags(options),
        }));
      }
    )
  );
  return command;
}

function createRunViewerCommand(
  factory: Factory,
  name: 'live' | 'recording',
  description: string
): Command {
  return createOperationJsonBodyCommand(factory, {
    operationId: name === 'live' ? 'runs.live' : 'runs.recording',
    name,
    description,
    argNames: ['runId'],
    configure: (cmd) =>
      cmd
        .option(
          '--expires-in-seconds <seconds>',
          'Viewer expiration in seconds',
          parsePositiveInteger
        )
        .option('--control <none|input>', 'Live viewer control mode'),
    body: async (_args, options) => {
      return {
        expiresInSeconds:
          typeof options.expiresInSeconds === 'number' ? options.expiresInSeconds : undefined,
        control: name === 'live' ? options.control : undefined,
      } as CliOperationJsonBody<'runs.live'> & CliOperationJsonBody<'runs.recording'>;
    },
  });
}

function createSseCommand(
  factory: Factory,
  config: {
    name: string;
    description: string;
    operationId: 'runs.activity.stream' | 'runs.events.stream';
    configure: (command: Command) => Command;
    query: (
      options: Record<string, unknown>
    ) => Record<string, string | number | boolean | undefined>;
  }
): Command {
  let command = new Command(config.name).description(config.description).argument('<runId>');
  command = config.configure(command);
  return command.action(async (runId: string, options: Record<string, unknown>) => {
    const stream = await streamOperationText(factory, config.operationId, {
      pathParams: { runId },
      query: config.query(options),
    });
    await renderSseStream(factory, stream);
  });
}

async function renderSseStream(factory: Factory, stream: AsyncIterable<string>): Promise<void> {
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
    let frameEnd = buffer.indexOf('\n\n');
    while (frameEnd !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      renderSseFrame(factory, frame);
      frameEnd = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) renderSseFrame(factory, buffer);
}

function renderSseFrame(factory: Factory, frame: string): void {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1).trimStart();
    if (field === 'event') eventName = value;
    if (field === 'data') dataLines.push(value);
  }

  if (eventName === 'heartbeat') return;
  const rawData = dataLines.join('\n');
  if (!rawData) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    factory.io.writeOut(`${rawData}\n`);
    return;
  }

  if (!factory.io.isStdoutTTY()) {
    factory.io.writeOut(`${JSON.stringify(parsed)}\n`);
    return;
  }

  factory.io.writeOut(`${formatRunEvent(parsed)}\n`);
}

function formatRunEvent(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  const event = value as {
    time?: unknown;
    createdAt?: unknown;
    category?: unknown;
    type?: unknown;
    status?: unknown;
    title?: unknown;
    name?: unknown;
    data?: unknown;
  };
  const time =
    typeof event.time === 'string'
      ? event.time
      : typeof event.createdAt === 'string'
        ? event.createdAt
        : '';
  const label = [event.category, event.type].filter((part) => typeof part === 'string').join('/');
  const status = typeof event.status === 'string' ? ` ${event.status}` : '';
  const name =
    typeof event.title === 'string'
      ? ` ${event.title}`
      : typeof event.name === 'string'
        ? ` ${event.name}`
        : '';
  const suffix =
    event.data && Object.keys(event.data as object).length > 0
      ? ` ${JSON.stringify(event.data)}`
      : '';
  return [time, label || 'event'].filter(Boolean).join(' ') + status + name + suffix;
}
