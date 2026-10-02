import { randomUUID } from 'node:crypto';
import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { readBlob } from '../shared/io.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, outputData, type OutputFlags } from '../shared/output.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  requestOperationAndPrint,
  streamOperationText,
  uploadOperationFile,
} from '../shared/operation.js';

export function createRunCommand(factory: Factory): Command {
  const command = new Command('runs').description('Inspect unified run observability');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.list',
      description: 'List runs',
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
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.trace.list',
      name: 'trace',
      description: 'List run trace spans',
      argNames: ['runId'],
    })
  );
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.events.list',
      name: 'events',
      description: 'List run events',
      argNames: ['runId'],
    })
  );
  command.addCommand(createRunStreamCommand(factory));
  command.addCommand(createRunFilesCommand(factory));
  return command;
}

/**
 * A Run's files (plan 040): inputs are Space Files bound to the Run, in its
 * browser at runtimePath once binding.state is ready; outputs are Files the
 * Run produced.
 */
function createRunFilesCommand(factory: Factory): Command {
  const command = new Command('files').description("List and manage a run's input and output files");
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'runs.files.list',
      description: 'List run files',
      argNames: ['runId'],
      configure: (cmd) =>
        cmd
          .option('--role <role>', 'input or output')
          .option('-L, --limit <number>', 'Maximum number of results to return', parsePositiveInteger)
          .option('--cursor <cursor>', 'Pagination cursor'),
      query: (options) =>
        ({
          role: typeof options.role === 'string' ? options.role : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'runs.files.list'>,
    })
  );
  command.addCommand(
    addOutputFlags(
      new Command('get').description('Get one run file').argument('<runId>').argument('<fileId>')
    ).action(async (runId: string, fileId: string, options: OutputFlags) => {
      await requestOperationAndPrint(factory, 'runs.files.get', {
        pathParams: { runId, fileId },
        output: options,
      });
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runs.files.add',
      name: 'add',
      description: 'Put an existing Space file into the run',
      argNames: ['runId', 'fileId'],
      body: async (args) => ({ fileId: args.fileId }) as CliOperationJsonBody<'runs.files.add'>,
    })
  );
  command.addCommand(
    addOutputFlags(
      new Command('upload')
        .description('Upload a file into the Space and put it into the run')
        .argument('<runId>')
        .argument('<path>')
        .option('--path <spacePath>', 'Space path; defaults to uploads/<name>')
        .option('--filename <filename>', 'Display name')
        .option('--idempotency-key <key>', 'Retry key; defaults to a new one')
    ).action(
      async (
        runId: string,
        path: string,
        options: { path?: string; filename?: string; idempotencyKey?: string } & OutputFlags
      ) => {
        const file = await readBlob(path);
        const result = await uploadOperationFile(factory, 'runs.files.upload', {
          pathParams: { runId },
          file: file.blob,
          fileName: options.filename ?? file.fileName,
          fields: {
            ...(options.path ? { path: options.path } : {}),
            ...(options.filename ? { filename: options.filename } : {}),
          },
          idempotencyKey: options.idempotencyKey ?? randomUUID(),
        });
        await outputData(factory.io, result, options);
      }
    )
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runs.files.retry',
      name: 'retry',
      description: "Copy a failed input into the run's browser again",
      argNames: ['runId', 'fileId'],
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'runs.files.remove',
      name: 'remove',
      description: "Remove an input from the run's browser (the Space file is kept)",
      argNames: ['runId', 'fileId'],
    })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'runs.files.collect',
      name: 'collect',
      description: "Save a file from the run's workspace as an output file",
      argNames: ['runId', 'runtimePath'],
      configure: (cmd) =>
        cmd
          .option('--path <spacePath>', 'Space path for the new file')
          .option('--filename <filename>', 'File name'),
      body: async (args, options) =>
        ({
          runtimePath: args.runtimePath,
          ...(typeof options.path === 'string' ? { path: options.path } : {}),
          ...(typeof options.filename === 'string' ? { filename: options.filename } : {}),
        }) as CliOperationJsonBody<'runs.files.collect'>,
    })
  );
  return command;
}

function createRunStreamCommand(factory: Factory): Command {
  return new Command('stream')
    .description('Stream trace spans and events from a run')
    .argument('<runId>')
    .option('--after <cursor>', 'Resume after a stream cursor')
    .option('--include <kind>', 'trace or events')
    .action(async (runId: string, options: { after?: string; include?: string }) => {
      const stream = await streamOperationText(factory, 'runs.stream', {
        pathParams: { runId },
        query: { after: options.after, include: options.include as 'trace' | 'events' | undefined },
      });
      for await (const chunk of stream) factory.io.writeOut(chunk);
    });
}
