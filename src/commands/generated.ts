import { Command } from 'commander';
import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Factory } from '../factory.js';
import type { JsonRequestOptions } from '../api/client.js';
import { CliError } from '../runtime/errors.js';
import { API_OPERATIONS, multipartOperation, operationPath, type ApiOperation } from './shared/catalog.js';
import { buildRequestInput, queryFlag } from './shared/request-input.js';
import { addOutputFlags, outputData } from './shared/output.js';
import { addCliOperationHelp } from './shared/help.js';
import { writeBinary } from './shared/io.js';
import { openBrowserLiveView } from './browser-open.js';
import { bodyFlags } from './shared/request-input.js';
import { writeEventStream } from './shared/stream-output.js';

export function registerApiCommands(root: Command, factory: Factory): void {
  for (const operation of API_OPERATIONS) {
    const parts = operation.cli.command.split(' ');
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      let group = parent.commands.find((command) => command.name() === part);
      if (!group) {
        group = new Command(part).description(`Manage ${part}`);
        parent.addCommand(group);
      }
      parent = group;
    }
    const command = new Command(parts.at(-1)).description(operation.description);
    for (const name of operation.cli.positionalArgs) command.argument(`<${name}>`);
    addRequestFlags(command, operation);
    addCliOperationHelp(command, operation.operationId);
    command.action(async (...values: unknown[]) => {
      const args = values.slice(0, operation.cli.positionalArgs.length) as string[];
      await executeOperation(factory, operation, args, command.opts());
    });
    parent.addCommand(command);
  }
}

function addRequestFlags(command: Command, operation: ApiOperation): void {
  const properties = operation.inputSchema.properties ?? {};
  if (properties.query) {
    command.option('--query <json>', 'Query object: inline JSON, @file, or - for stdin');
    command.option('--params <json>', 'Alias for --query');
    for (const name of Object.keys(properties.query.properties ?? {})) {
      command.option(`--${queryFlag(name)} <value>`, `Query parameter ${name}`);
    }
  }
  command.option('--headers <json>', 'API headers: inline JSON, @file, or - for stdin')
    .option('--api-version <date>', 'Dated API contract (default: 2026-10-03)')
    .option('--space <id-or-name>', 'Select an authorized Space (BCTRL-Space)')
    .option('--subaccount-id <id>', 'Effective subaccount context (BCTRL-Subaccount-Id)');
  command.option('--bctrl-space <id-or-name>', 'Alias for --space')
    .option('--bctrl-subaccount-id <id>', 'Alias for --subaccount-id');
  if (properties.headers?.properties?.['Idempotency-Key']) {
    command.option('--idempotency-key <key>', 'Retry key for this operation');
  }
  if (properties.headers?.properties?.['If-Match']) command.option('--if-match <version>', 'Require the current resource version');
  if (properties.headers?.properties?.['Last-Event-ID']) command.option('--last-event-id <id>', 'Resume the event stream after this event');
  if (operation.operationId === 'browsers.create') command.option('--open', 'Open the browser live view when ready');
  for (const field of bodyFlags(operation)) {
    if (!command.options.some((option) => option.long === `--${field.flag}`)) command.option(`--${field.flag} <value>`, `Body field ${field.name}`);
  }
  if (properties.body) command.option('--body <json>', 'Request body: inline JSON, @file, or - for stdin');
  if (multipartOperation(operation)) {
    command.option('--file <path>', 'Upload a local file, or - for binary stdin');
    if (properties.fields) command.option('--fields <json>', 'Multipart fields: inline JSON, @file, or - for stdin');
  }
  if (operation.mcp.destructiveHint) command.requiredOption('--yes', 'Confirm this destructive operation');
  if (operation.stream) {
    command.option('--timeout-ms <milliseconds>', 'End the stream after this duration (1â€“60000)', '60000');
    command.option('--max-events <number>', 'End after this many SSE events (1â€“200)');
  }
  if (operation.responseContentTypes.includes('application/octet-stream')) {
    command.option('--out <path>', 'Write binary content to a file, or - for stdout', '-')
      .option('--output <path>', 'Alias for --out');
  } else if (!operation.stream) {
    addOutputFlags(command);
  }
}

async function executeOperation(
  factory: Factory, operation: ApiOperation, args: string[], options: Record<string, unknown>
): Promise<void> {
  if (options.body !== undefined && options.file !== undefined) throw new CliError('Use either --body or --file');
  if (options.fields !== undefined && options.file === undefined) throw new CliError('--fields requires --file');
  const input = await buildRequestInput(operation, args, options, factory.io);
  const request: JsonRequestOptions = {
    headers: input.headers as Record<string, string>,
    ...(input.query ? { query: input.query as JsonRequestOptions['query'] } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
  };
  if (multipartOperation(operation) && options.body === undefined) {
    if (typeof options.file !== 'string') throw new CliError('This upload requires --file <path>');
    const file = options.file;
    let bytes: Buffer;
    if (file === '-') {
      const chunks: Buffer[] = [];
      for await (const chunk of factory.io.in) chunks.push(Buffer.from(chunk));
      bytes = Buffer.concat(chunks);
    } else {
      bytes = await readFile(file);
    }
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(bytes)]), file === '-' ? 'stdin' : basename(file));
    for (const [key, value] of Object.entries((input.fields ?? {}) as Record<string, string>)) form.set(key, value);
    request.rawBody = form;
  }
  const path = operationPath(operation, input);
  const client = await factory.apiClient();
  if (operation.stream) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs));
    try {
      const stream = await client.streamText(path, { ...request, signal: controller.signal });
      await writeEventStream(stream, factory.io.out, controller.signal,
        input.maxEvents === undefined ? undefined : Number(input.maxEvents));
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    } finally {
      clearTimeout(timer);
    }
  } else if (operation.responseContentTypes.includes('application/octet-stream')) {
    await writeBinary(String(options.output ?? options.out),
      await client.download(path, { ...request, method: operation.method }), factory.io.out);
  } else {
    const method = operation.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
    const response = await client[method](path, request);
    await outputData(factory.io, response, options);
    if (options.open) await openBrowserLiveView(factory, response);
  }
}
