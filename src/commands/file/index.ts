import { Command } from 'commander';
import type { Factory } from '../../factory.js';
import type { CliOperationJsonBody, CliOperationQuery } from '../../openapi.js';
import { parseJsonString, readBlob, readJsonFile, writeBinary } from '../shared/io.js';
import { parsePositiveInteger } from '../shared/options.js';
import { addOutputFlags, outputData, type OutputFlags } from '../shared/output.js';
import {
  createOperationDeleteCommand,
  createOperationJsonBodyCommand,
  createOperationListCommand,
  createOperationViewCommand,
  downloadOperation,
  uploadOperationFile,
} from '../shared/operation.js';

export function createFileCommand(factory: Factory): Command {
  const command = new Command('file').description('Upload, download, and manage BCTRL files');
  command.addCommand(
    createOperationListCommand(factory, {
      operationId: 'files.list',
      description: 'List files',
      configure: (cmd) =>
        cmd
          .option('--space <id>', 'Filter by space id')
          .option('--source <source>', 'Filter by file source')
          .option('--prefix <path>', 'Filter by path prefix')
          .option('--folders', 'Directory view: direct files plus subfolder rollups')
          .option('--created-after <iso>', 'Only files created after this timestamp')
          .option('--query <text>', 'Search query')
          .option(
            '-L, --limit <number>',
            'Maximum number of results to return',
            parsePositiveInteger
          )
          .option('--cursor <cursor>', 'Pagination cursor'),
      query: (options) =>
        ({
          spaceId: typeof options.space === 'string' ? options.space : undefined,
          source: typeof options.source === 'string' ? options.source : undefined,
          prefix: typeof options.prefix === 'string' ? options.prefix : undefined,
          include: options.folders === true ? 'folders' : undefined,
          createdAfter: typeof options.createdAfter === 'string' ? options.createdAfter : undefined,
          // The public query param is `q` (was sent as `query`, which the API ignores).
          q: typeof options.query === 'string' ? options.query : undefined,
          limit: typeof options.limit === 'number' ? options.limit : undefined,
          cursor: typeof options.cursor === 'string' ? options.cursor : undefined,
        }) as CliOperationQuery<'files.list'>,
    })
  );
  command.addCommand(
    createOperationViewCommand(factory, {
      operationId: 'files.get',
      name: 'get',
      description: 'View file metadata',
      argName: 'fileId',
    })
  );
  command.addCommand(
    addOutputFlags(
      new Command('upload')
        .description('Upload a file')
        .argument('<path>')
        .option('--space <id>', 'Space id; omitted uses caller default space')
        .option('--path <storagePath>', 'Storage path')
        .option('--name <name>', 'Display name')
        .option('--metadata <json>', 'Metadata as inline JSON')
    ).action(
      async (
        path: string,
        options: { space?: string; path?: string; name?: string; metadata?: string } & OutputFlags
      ) => {
        const file = await readBlob(path);
        const metadata =
          options.metadata !== undefined
            ? JSON.stringify(parseJsonString(options.metadata, '--metadata'))
            : undefined;
        const result = await uploadOperationFile(factory, 'files.upload', {
          file: file.blob,
          fileName: options.name ?? file.fileName,
          query: { spaceId: options.space },
          fields: {
            ...(options.path ? { path: options.path } : {}),
            ...(options.name ? { name: options.name } : {}),
            ...(metadata ? { metadata } : {}),
          },
        });
        await outputData(factory.io, result, options);
      }
    )
  );
  command.addCommand(
    new Command('download')
      .description('Download file content')
      .argument('<id>')
      .requiredOption('--to <path>', 'Output path, or - for stdout')
      .action(async (id: string, options: { to: string }) => {
        const data = await downloadOperation(factory, 'files.content', {
          pathParams: { fileId: id },
        });
        await writeBinary(options.to, data);
      })
  );
  command.addCommand(
    createOperationJsonBodyCommand(factory, {
      operationId: 'files.update',
      name: 'patch',
      description: 'Edit file metadata',
      argNames: ['fileId'],
      configure: (cmd) =>
        cmd
          .option('--name <name>', 'Display name')
          .option('--metadata-file <path>', 'Metadata JSON file'),
      body: async (_args, options) => {
        return {
          name: options.name,
          metadata:
            typeof options.metadataFile === 'string'
              ? await readJsonFile(options.metadataFile, '--metadata-file')
              : undefined,
        } as CliOperationJsonBody<'files.update'>;
      },
    })
  );
  command.addCommand(
    createOperationDeleteCommand(factory, {
      operationId: 'files.delete',
      description: 'Delete a file',
      argNames: ['fileId'],
    })
  );
  return command;
}
